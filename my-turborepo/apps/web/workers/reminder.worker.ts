/**
 * Reminder Worker (Component 17)
 *
 * Processes two job types:
 * 1. 'invoice-emails' queue: calls EmailService.send()
 * 2. 'payment-reminders' queue: fires WorkflowEngine event for due/overdue
 *
 * Email stub: uses the stubbed EmailService that logs to console.
 * When Component 29 (Email Service) is built, it replaces the stub.
 */

import { Worker, Job, type ConnectionOptions } from 'bullmq';
import { createClient } from '@supabase/supabase-js';
import { createBullMQConnection } from '@/lib/queue/redis-connection';
import { QUEUE_NAMES } from '@/lib/queue/queues';
import { sendEmail, getDefaultSubject } from '@/lib/email/service';
import { WorkflowEngine } from '@/lib/workflows/engine';
import type { EmailJobPayload, ReminderJobPayload } from '@/lib/queue/job-types';

// ============================================================================
// Constants
// ============================================================================

const WORKER_CONCURRENCY = parseInt(process.env.WORKER_CONCURRENCY ?? '5', 10);

// ============================================================================
// Worker Setup
// ============================================================================

// Create dedicated Redis connections for each worker
const emailWorkerConnection = createBullMQConnection();
const reminderWorkerConnection = createBullMQConnection();

// Create Supabase client with service role
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Create workflow engine
const workflowEngine = new WorkflowEngine(supabase);

// ============================================================================
// Email Job Processor
// ============================================================================

/**
 * Process an email job.
 */
async function processEmailJob(job: Job<EmailJobPayload>): Promise<void> {
  const { invoiceId, organizationId, emailType, recipientEmail, recipientName, language, metadata } =
    job.data;

  console.log(
    `[email-worker] Processing job ${job.id}: ${emailType} to ${recipientEmail}`
  );

  try {
    // Fetch additional data if needed
    const templateData = {
      ...metadata,
      invoiceId,
      organizationId,
    };

    // Get default subject
    const subject = getDefaultSubject(emailType, templateData as Record<string, unknown>, language);

    // Send the email (uses stub for now)
    const result = await sendEmail({
      to: recipientEmail,
      toName: recipientName,
      subject,
      templateId: emailType,
      templateData,
      organizationId,
      invoiceId,
    });

    if (!result.success) {
      throw new Error(result.error ?? 'Email send failed');
    }

    console.log(
      `[email-worker] Job ${job.id} completed, messageId: ${result.messageId}`
    );
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
    console.error(`[email-worker] Job ${job.id} failed:`, errorMessage);
    throw error;
  }
}

// ============================================================================
// Reminder Job Processor
// ============================================================================

/**
 * Process a payment reminder job.
 */
async function processReminderJob(job: Job<ReminderJobPayload>): Promise<void> {
  const { invoiceId, organizationId, reminderType, daysUntilDue } = job.data;

  console.log(
    `[reminder-worker] Processing job ${job.id}: ${reminderType} for invoice ${invoiceId}`
  );

  try {
    // Verify invoice still exists and is in a valid state
    const { data: invoice, error: fetchError } = await supabase
      .from('invoices')
      .select('id, status, customer_id, folio_number, total, currency, due_date')
      .eq('id', invoiceId)
      .eq('organization_id', organizationId)
      .single();

    if (fetchError || !invoice) {
      console.log(
        `[reminder-worker] Invoice ${invoiceId} not found, skipping reminder`
      );
      return;
    }

    // Skip if invoice is no longer in a state that needs reminders
    const skipStatuses = ['cancelled', 'void', 'paid'];
    if (skipStatuses.includes(invoice.status)) {
      console.log(
        `[reminder-worker] Invoice ${invoiceId} is ${invoice.status}, skipping reminder`
      );
      return;
    }

    // Determine the workflow event type
    const eventType =
      daysUntilDue >= 0 ? 'invoice.payment_due_soon' : 'invoice.payment_overdue';

    // Fire the workflow event
    await workflowEngine.executeWorkflow({
      type: eventType,
      invoiceId,
      organizationId,
      triggeredAt: new Date().toISOString(),
      metadata: {
        reminderType,
        daysUntilDue,
        invoiceFolio: invoice.folio_number,
        invoiceTotal: invoice.total,
        invoiceCurrency: invoice.currency,
        dueDate: invoice.due_date,
      },
    });

    // Fetch customer for email
    const { data: customer } = await supabase
      .from('customers')
      .select('id, legal_name, email')
      .eq('id', invoice.customer_id)
      .single();

    if (customer?.email) {
      // Enqueue reminder email
      const { enqueuePaymentReminderEmail } = await import(
        '@/lib/workflows/actions/send-email'
      );

      const emailReminderType =
        daysUntilDue >= 0 ? (daysUntilDue === 0 ? 'due_today' : 'due_soon') : 'overdue';

      await enqueuePaymentReminderEmail(
        invoiceId,
        organizationId,
        emailReminderType,
        'es'
      );
    }

    console.log(
      `[reminder-worker] Job ${job.id} completed for invoice ${invoiceId}`
    );
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
    console.error(`[reminder-worker] Job ${job.id} failed:`, errorMessage);
    throw error;
  }
}

// ============================================================================
// Worker Instances
// ============================================================================

export const emailWorker = new Worker<EmailJobPayload>(
  QUEUE_NAMES.INVOICE_EMAILS,
  processEmailJob,
  {
    connection: emailWorkerConnection as ConnectionOptions,
    concurrency: WORKER_CONCURRENCY,
  }
);

export const reminderWorker = new Worker<ReminderJobPayload>(
  QUEUE_NAMES.PAYMENT_REMINDERS,
  processReminderJob,
  {
    connection: reminderWorkerConnection as ConnectionOptions,
    concurrency: WORKER_CONCURRENCY,
  }
);

// ============================================================================
// Event Handlers
// ============================================================================

emailWorker.on('completed', (job) => {
  console.log(
    `[email-worker] Job ${job.id} completed: ${job.data.emailType} to ${job.data.recipientEmail}`
  );
});

emailWorker.on('failed', (job, err) => {
  console.error(`[email-worker] Job ${job?.id} failed:`, err.message);
});

emailWorker.on('error', (err) => {
  console.error('[email-worker] Worker error:', err.message);
});

reminderWorker.on('completed', (job) => {
  console.log(
    `[reminder-worker] Job ${job.id} completed: ${job.data.reminderType} for invoice ${job.data.invoiceId}`
  );
});

reminderWorker.on('failed', (job, err) => {
  console.error(`[reminder-worker] Job ${job?.id} failed:`, err.message);
});

reminderWorker.on('error', (err) => {
  console.error('[reminder-worker] Worker error:', err.message);
});

// ============================================================================
// Graceful Shutdown
// ============================================================================

export async function shutdownReminderWorkers(): Promise<void> {
  console.log('[reminder-worker] Shutting down email and reminder workers...');

  await Promise.all([emailWorker.close(), reminderWorker.close()]);

  await Promise.all([
    emailWorkerConnection.quit(),
    reminderWorkerConnection.quit(),
  ]);

  console.log('[reminder-worker] Shutdown complete');
}
