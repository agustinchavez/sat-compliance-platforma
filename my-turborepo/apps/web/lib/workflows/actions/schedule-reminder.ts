/**
 * Schedule Reminder Action (Component 17)
 *
 * Schedules BullMQ delayed jobs for payment reminders.
 * Uses invoice.due_date to calculate delays.
 * Uses predictable job IDs for idempotency and cancellation.
 */

import { createClient } from '@supabase/supabase-js';
import { reminderQueue, getReminderJobId } from '@/lib/queue';
import type { ReminderJobPayload, ActionResult, ReminderType } from '../types';
import { successResult, failureResult } from './types';

// ============================================================================
// Constants
// ============================================================================

/**
 * Reminder schedule configuration.
 * Maps reminder type to days relative to due date (negative = before, positive = after).
 */
const REMINDER_SCHEDULE: Record<ReminderType, number> = {
  due_soon: -1, // 1 day before due date
  due_today: 0, // On due date
  overdue_7d: 7, // 7 days after due date
  overdue_30d: 30, // 30 days after due date
};

/**
 * Time of day to send reminders (Mexico City time, 9:00 AM).
 */
const REMINDER_HOUR_CDMX = 9;

// ============================================================================
// Main Functions
// ============================================================================

/**
 * Schedule payment reminders for an invoice.
 *
 * Schedules up to 4 reminder jobs after invoice is stamped:
 * - due_soon: 24 hours before due_date
 * - due_today: on due_date at 9:00 AM Mexico City time
 * - overdue_7d: 7 days after due_date
 * - overdue_30d: 30 days after due_date
 *
 * If invoice has no due_date (metodo_pago = 'PUE'), skips scheduling.
 * Uses jobId: `reminder-{invoiceId}-{reminderType}` for idempotency.
 *
 * @param invoiceId - Invoice to schedule reminders for
 * @param organizationId - Organization context
 * @returns Array of ActionResults for each scheduled reminder
 */
export async function schedulePaymentReminders(
  invoiceId: string,
  organizationId: string
): Promise<ActionResult[]> {
  const results: ActionResult[] = [];

  try {
    // Fetch invoice to get due_date and payment_method
    const invoice = await fetchInvoiceForReminders(invoiceId, organizationId);

    // Skip if no due_date (PUE invoices don't have payment reminders)
    if (!invoice.dueDate) {
      console.log(
        `[reminder-action] Skipping reminders for invoice ${invoiceId} (no due_date, likely PUE)`
      );
      return [
        successResult('schedule_payment_reminder'),
      ];
    }

    // Schedule each reminder type
    const reminderTypes: ReminderType[] = [
      'due_soon',
      'due_today',
      'overdue_7d',
      'overdue_30d',
    ];

    for (const reminderType of reminderTypes) {
      const result = await scheduleReminder(
        invoiceId,
        organizationId,
        reminderType,
        invoice.dueDate
      );
      results.push(result);
    }

    return results;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[reminder-action] Failed to schedule reminders:`, message);

    return [failureResult('schedule_payment_reminder', message)];
  }
}

/**
 * Cancel all scheduled reminder jobs for an invoice.
 *
 * Removes jobs from the delayed queue by their predictable IDs.
 * Called when an invoice is cancelled.
 *
 * @param invoiceId - Invoice to cancel reminders for
 * @returns ActionResult indicating success
 */
export async function cancelPaymentReminders(
  invoiceId: string
): Promise<ActionResult> {
  try {
    const reminderTypes: ReminderType[] = [
      'due_soon',
      'due_today',
      'overdue_7d',
      'overdue_30d',
    ];

    let removedCount = 0;

    for (const reminderType of reminderTypes) {
      const jobId = getReminderJobId(invoiceId, reminderType);

      try {
        const job = await reminderQueue.getJob(jobId);
        if (job) {
          await job.remove();
          removedCount++;
          console.log(`[reminder-action] Cancelled reminder job: ${jobId}`);
        }
      } catch {
        // Job might not exist, which is fine
      }
    }

    console.log(
      `[reminder-action] Cancelled ${removedCount} reminder jobs for invoice ${invoiceId}`
    );

    return successResult('cancel_scheduled_reminders');
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[reminder-action] Failed to cancel reminders:`, message);

    // Non-fatal: cancelling reminders shouldn't block the workflow
    return successResult('cancel_scheduled_reminders');
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Schedule a single reminder job.
 */
async function scheduleReminder(
  invoiceId: string,
  organizationId: string,
  reminderType: ReminderType,
  dueDate: Date
): Promise<ActionResult> {
  try {
    const delayMs = calculateReminderDelay(dueDate, reminderType);

    // Skip if reminder would be in the past
    if (delayMs <= 0) {
      console.log(
        `[reminder-action] Skipping ${reminderType} for invoice ${invoiceId} (already past)`
      );
      return successResult('schedule_payment_reminder');
    }

    const jobId = getReminderJobId(invoiceId, reminderType);
    const daysUntilDue = REMINDER_SCHEDULE[reminderType];

    const payload: ReminderJobPayload = {
      invoiceId,
      organizationId,
      reminderType,
      daysUntilDue,
    };

    const job = await reminderQueue.add('payment-reminder', payload, {
      jobId,
      delay: delayMs,
    });

    const scheduledFor = new Date(Date.now() + delayMs);
    console.log(
      `[reminder-action] Scheduled ${reminderType} for invoice ${invoiceId} at ${scheduledFor.toISOString()} (job: ${job.id})`
    );

    return successResult('schedule_payment_reminder', job.id);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error(
      `[reminder-action] Failed to schedule ${reminderType}:`,
      message
    );

    return failureResult('schedule_payment_reminder', message);
  }
}

/**
 * Calculate delay in milliseconds for a reminder.
 *
 * @param dueDate - Invoice due date
 * @param reminderType - Type of reminder
 * @returns Delay in milliseconds (0 or negative if already past)
 */
function calculateReminderDelay(dueDate: Date, reminderType: ReminderType): number {
  const daysOffset = REMINDER_SCHEDULE[reminderType];
  const reminderDate = new Date(dueDate);
  reminderDate.setDate(reminderDate.getDate() + daysOffset);

  // Set to 9 AM Mexico City time
  const reminderTimestamp = get9amMexicoCityTimestamp(reminderDate);

  const now = Date.now();
  return reminderTimestamp - now;
}

/**
 * Get Unix timestamp for 9 AM Mexico City time on a given date.
 *
 * Mexico City timezone: America/Mexico_City (UTC-6, UTC-5 during DST).
 */
function get9amMexicoCityTimestamp(date: Date): number {
  // Get the date string in YYYY-MM-DD format
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const dateStr = `${year}-${month}-${day}`;

  // Create a date string for 9 AM in Mexico City
  // We'll use Intl.DateTimeFormat to handle DST correctly
  const cdmxDate = new Date(`${dateStr}T09:00:00`);

  // Get the offset for Mexico City on this date
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Mexico_City',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });

  // Parse the formatted date to get the local time in Mexico City
  const parts = formatter.formatToParts(cdmxDate);
  const partsMap: Record<string, string> = {};
  for (const part of parts) {
    partsMap[part.type] = part.value;
  }

  // Reconstruct as UTC
  // Mexico City is UTC-6 (or UTC-5 during DST)
  // We need to find the UTC time that corresponds to 9 AM CDMX

  // Simple approach: use the native Date with explicit timezone handling
  // Create the target time in CDMX and convert to UTC
  const targetCDMX = new Date(
    `${dateStr}T${String(REMINDER_HOUR_CDMX).padStart(2, '0')}:00:00`
  );

  // Calculate the offset between local and CDMX
  // This is a simplified approach that works for most cases
  const cdmxOffset = getTimezoneOffset('America/Mexico_City', targetCDMX);
  const utcTimestamp = targetCDMX.getTime() + cdmxOffset * 60 * 1000;

  return utcTimestamp;
}

/**
 * Get timezone offset in minutes for a given timezone and date.
 */
function getTimezoneOffset(timezone: string, date: Date): number {
  // Create a formatter for the target timezone
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });

  // Parse the formatted date
  const formatted = formatter.format(date);
  const [datePart, timePart] = formatted.split(', ');
  const [month, day, year] = datePart?.split('/') ?? [];
  const [hour, minute, second] = timePart?.split(':') ?? [];

  // Create a date in UTC with the same components
  const utcDate = new Date(
    Date.UTC(
      parseInt(year ?? '0'),
      parseInt(month ?? '1') - 1,
      parseInt(day ?? '1'),
      parseInt(hour ?? '0'),
      parseInt(minute ?? '0'),
      parseInt(second ?? '0')
    )
  );

  // The difference is the timezone offset
  return (date.getTime() - utcDate.getTime()) / (60 * 1000);
}

// ============================================================================
// Database Helpers
// ============================================================================

interface InvoiceReminderData {
  id: string;
  dueDate: Date | null;
  paymentMethod: string;
}

/**
 * Fetch invoice data needed for reminder scheduling.
 */
async function fetchInvoiceForReminders(
  invoiceId: string,
  organizationId: string
): Promise<InvoiceReminderData> {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data: invoice, error } = await supabase
    .from('invoices')
    .select('id, due_date, payment_method')
    .eq('id', invoiceId)
    .eq('organization_id', organizationId)
    .single();

  if (error || !invoice) {
    throw new Error(`Invoice not found: ${invoiceId}`);
  }

  return {
    id: invoice.id,
    dueDate: invoice.due_date ? new Date(invoice.due_date) : null,
    paymentMethod: invoice.payment_method,
  };
}

// ============================================================================
// Exports for Testing
// ============================================================================

export {
  calculateReminderDelay,
  get9amMexicoCityTimestamp,
  REMINDER_SCHEDULE,
};
