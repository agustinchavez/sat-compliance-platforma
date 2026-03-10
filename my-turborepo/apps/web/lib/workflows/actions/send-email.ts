/**
 * Send Email Action (Component 17)
 *
 * This action ENQUEUES an email job into BullMQ.
 * The actual sending is done by Component 29's EmailService.
 *
 * This component owns the job schema; Component 29 owns the worker.
 */

import { createClient } from '@supabase/supabase-js';
import { emailQueue, getEmailJobId } from '@/lib/queue';
import type { EmailJobPayload, ActionResult, EmailTemplateId } from '../types';
import { successResult, failureResult } from './types';

// ============================================================================
// Email Action Functions
// ============================================================================

/**
 * Enqueue an email job for delivery.
 *
 * Does NOT send email directly — just enqueues to BullMQ.
 * Returns ActionResult with the BullMQ jobId.
 *
 * @param payload - Email job payload
 * @returns ActionResult with jobId
 */
export async function enqueueSendEmail(
  payload: EmailJobPayload
): Promise<ActionResult> {
  try {
    const jobId = getEmailJobId(payload.invoiceId, payload.emailType);

    const job = await emailQueue.add('send-email', payload, { jobId });

    console.log(
      `[email-action] Enqueued '${payload.emailType}' email to ${payload.recipientEmail} (job: ${job.id})`
    );

    return successResult('send_customer_email', job.id);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[email-action] Failed to enqueue email:`, message);

    return failureResult('send_customer_email', message);
  }
}

/**
 * Enqueue an invoice-sent email after stamping.
 *
 * Fetches customer data from the database to build the payload.
 */
export async function enqueueSendInvoiceEmail(
  invoiceId: string,
  organizationId: string,
  language: 'es' | 'en' = 'es'
): Promise<ActionResult> {
  try {
    const payload = await buildStampedEmailPayload(
      invoiceId,
      organizationId,
      language
    );

    return await enqueueSendEmail(payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[email-action] Failed to build stamped email payload:`, message);

    return failureResult('send_customer_email', message);
  }
}

/**
 * Enqueue a cancellation notice email.
 */
export async function enqueueCancellationEmail(
  invoiceId: string,
  organizationId: string,
  language: 'es' | 'en' = 'es'
): Promise<ActionResult> {
  try {
    const payload = await buildCancellationEmailPayload(
      invoiceId,
      organizationId,
      language
    );

    return await enqueueSendEmail(payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[email-action] Failed to build cancellation email payload:`, message);

    return failureResult('send_customer_email', message);
  }
}

/**
 * Enqueue a payment reminder email.
 */
export async function enqueuePaymentReminderEmail(
  invoiceId: string,
  organizationId: string,
  reminderType: 'due_soon' | 'due_today' | 'overdue',
  language: 'es' | 'en' = 'es'
): Promise<ActionResult> {
  try {
    const payload = await buildReminderEmailPayload(
      invoiceId,
      organizationId,
      reminderType,
      language
    );

    return await enqueueSendEmail(payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[email-action] Failed to build reminder email payload:`, message);

    return failureResult('send_customer_email', message);
  }
}

// ============================================================================
// Payload Builders
// ============================================================================

/**
 * Build EmailJobPayload for a stamped invoice email.
 */
export async function buildStampedEmailPayload(
  invoiceId: string,
  organizationId: string,
  language: 'es' | 'en'
): Promise<EmailJobPayload> {
  const { invoice, customer } = await fetchInvoiceAndCustomer(
    invoiceId,
    organizationId
  );

  return {
    invoiceId,
    organizationId,
    emailType: 'invoice_sent',
    recipientEmail: customer.email,
    recipientName: customer.name,
    language,
    metadata: {
      invoiceFolio: invoice.folio,
      invoiceTotal: invoice.total,
      invoiceCurrency: invoice.currency,
      pdfUrl: invoice.pdf_url,
      uuid: invoice.uuid,
    },
  };
}

/**
 * Build EmailJobPayload for a cancellation notice.
 */
export async function buildCancellationEmailPayload(
  invoiceId: string,
  organizationId: string,
  language: 'es' | 'en'
): Promise<EmailJobPayload> {
  const { invoice, customer } = await fetchInvoiceAndCustomer(
    invoiceId,
    organizationId
  );

  return {
    invoiceId,
    organizationId,
    emailType: 'cancellation_notice',
    recipientEmail: customer.email,
    recipientName: customer.name,
    language,
    metadata: {
      invoiceFolio: invoice.folio,
      cancellationReason: invoice.cancellation_reason,
      uuid: invoice.uuid,
    },
  };
}

/**
 * Build EmailJobPayload for a payment reminder.
 */
export async function buildReminderEmailPayload(
  invoiceId: string,
  organizationId: string,
  reminderType: 'due_soon' | 'due_today' | 'overdue',
  language: 'es' | 'en'
): Promise<EmailJobPayload> {
  const { invoice, customer } = await fetchInvoiceAndCustomer(
    invoiceId,
    organizationId
  );

  const emailType: EmailTemplateId =
    reminderType === 'overdue' ? 'payment_overdue' : 'payment_reminder';

  return {
    invoiceId,
    organizationId,
    emailType,
    recipientEmail: customer.email,
    recipientName: customer.name,
    language,
    metadata: {
      invoiceFolio: invoice.folio,
      invoiceTotal: invoice.total,
      invoiceCurrency: invoice.currency,
      dueDate: invoice.due_date,
      reminderType,
    },
  };
}

// ============================================================================
// Database Helpers
// ============================================================================

interface InvoiceData {
  id: string;
  folio: string | null;
  total: number;
  currency: string;
  pdf_url: string | null;
  uuid: string | null;
  due_date: string | null;
  cancellation_reason: string | null;
  customer_id: string;
}

interface CustomerData {
  id: string;
  name: string;
  email: string;
}

/**
 * Fetch invoice and customer data for email payload.
 */
async function fetchInvoiceAndCustomer(
  invoiceId: string,
  organizationId: string
): Promise<{ invoice: InvoiceData; customer: CustomerData }> {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Fetch invoice
  const { data: invoice, error: invoiceError } = await supabase
    .from('invoices')
    .select('id, folio_number, total, currency, pdf_url, uuid, due_date, cancellation_reason, customer_id')
    .eq('id', invoiceId)
    .eq('organization_id', organizationId)
    .single();

  if (invoiceError || !invoice) {
    throw new Error(`Invoice not found: ${invoiceId}`);
  }

  // Fetch customer
  const { data: customer, error: customerError } = await supabase
    .from('customers')
    .select('id, legal_name, email')
    .eq('id', invoice.customer_id)
    .single();

  if (customerError || !customer) {
    throw new Error(`Customer not found for invoice: ${invoiceId}`);
  }

  return {
    invoice: {
      id: invoice.id,
      folio: invoice.folio_number,
      total: invoice.total,
      currency: invoice.currency,
      pdf_url: invoice.pdf_url,
      uuid: invoice.uuid,
      due_date: invoice.due_date,
      cancellation_reason: invoice.cancellation_reason,
      customer_id: invoice.customer_id,
    },
    customer: {
      id: customer.id,
      name: customer.legal_name,
      email: customer.email || '',
    },
  };
}
