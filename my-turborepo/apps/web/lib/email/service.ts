/**
 * Email Service Stub (Component 17)
 *
 * STUB: Component 29 (Email Service) will implement this with actual
 * SMTP/SendGrid/Postmark delivery.
 *
 * This file defines the interface so Component 17 can import it
 * without Component 29 being built. The stub logs to console and
 * always returns success.
 */

// ============================================================================
// Types
// ============================================================================

/**
 * Email template identifiers.
 * Each template corresponds to a specific email type with predefined content.
 */
export type EmailTemplateId =
  | 'invoice_sent' // Invoice stamped, attaches PDF + XML
  | 'payment_reminder' // Payment due soon
  | 'payment_overdue' // Payment past due
  | 'cancellation_notice'; // Invoice cancelled

/**
 * Email attachment.
 */
export interface EmailAttachment {
  /** Filename for the attachment */
  filename: string;
  /** URL to fetch the attachment content */
  url: string;
  /** MIME content type */
  contentType: string;
}

/**
 * Parameters for sending an email.
 */
export interface SendEmailParams {
  /** Recipient email address */
  to: string;
  /** Recipient display name */
  toName: string;
  /** Email subject line */
  subject: string;
  /** Template to use */
  templateId: EmailTemplateId;
  /** Data to populate the template */
  templateData: Record<string, unknown>;
  /** Optional file attachments */
  attachments?: EmailAttachment[];
  /** Organization sending the email */
  organizationId: string;
  /** Related invoice (if applicable) */
  invoiceId?: string;
}

/**
 * Result of sending an email.
 */
export interface SendEmailResult {
  /** Whether the send was successful */
  success: boolean;
  /** Message ID from the email provider (if successful) */
  messageId?: string;
  /** Error message (if failed) */
  error?: string;
}

// ============================================================================
// Email Service
// ============================================================================

/**
 * Send an email using the configured email provider.
 *
 * STUB IMPLEMENTATION — logs to console, always returns success.
 * Replace with real implementation in Component 29 (Email Service).
 *
 * @param params - Email parameters
 * @returns SendEmailResult
 */
export async function sendEmail(params: SendEmailParams): Promise<SendEmailResult> {
  // Log the email details
  console.log(`[email-stub] ════════════════════════════════════════════`);
  console.log(`[email-stub] Would send '${params.templateId}' email`);
  console.log(`[email-stub] To: ${params.toName} <${params.to}>`);
  console.log(`[email-stub] Subject: ${params.subject}`);
  console.log(`[email-stub] Organization: ${params.organizationId}`);
  if (params.invoiceId) {
    console.log(`[email-stub] Invoice: ${params.invoiceId}`);
  }
  if (params.attachments?.length) {
    console.log(
      `[email-stub] Attachments: ${params.attachments.map((a) => a.filename).join(', ')}`
    );
  }
  console.log(`[email-stub] Template Data:`, JSON.stringify(params.templateData, null, 2));
  console.log(`[email-stub] ════════════════════════════════════════════`);

  // Simulate async operation
  await new Promise((resolve) => setTimeout(resolve, 10));

  return {
    success: true,
    messageId: `stub-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
  };
}

/**
 * Send multiple emails in a batch.
 *
 * STUB IMPLEMENTATION — processes emails sequentially.
 * Real implementation would use provider's batch API.
 *
 * @param batch - Array of email parameters
 * @returns Array of SendEmailResults
 */
export async function sendBulkEmails(
  batch: SendEmailParams[]
): Promise<SendEmailResult[]> {
  console.log(`[email-stub] Sending batch of ${batch.length} emails`);

  const results: SendEmailResult[] = [];

  for (const params of batch) {
    const result = await sendEmail(params);
    results.push(result);
  }

  return results;
}

// ============================================================================
// Template Helpers
// ============================================================================

/**
 * Get the default subject line for an email template.
 *
 * @param templateId - Template identifier
 * @param data - Template data (for variable substitution)
 * @param language - Language for the subject
 * @returns Subject line string
 */
export function getDefaultSubject(
  templateId: EmailTemplateId,
  data: Record<string, unknown>,
  language: 'es' | 'en' = 'es'
): string {
  const folio = (data.invoiceFolio as string) ?? '';

  const subjects: Record<EmailTemplateId, { es: string; en: string }> = {
    invoice_sent: {
      es: `Factura ${folio} - Comprobante Fiscal Digital`,
      en: `Invoice ${folio} - Digital Tax Receipt`,
    },
    payment_reminder: {
      es: `Recordatorio de pago - Factura ${folio}`,
      en: `Payment Reminder - Invoice ${folio}`,
    },
    payment_overdue: {
      es: `Pago vencido - Factura ${folio}`,
      en: `Payment Overdue - Invoice ${folio}`,
    },
    cancellation_notice: {
      es: `Aviso de cancelación - Factura ${folio}`,
      en: `Cancellation Notice - Invoice ${folio}`,
    },
  };

  return subjects[templateId][language];
}

/**
 * Build email params for an invoice-sent email.
 */
export function buildInvoiceSentEmailParams(
  to: string,
  toName: string,
  organizationId: string,
  invoiceId: string,
  data: {
    invoiceFolio: string;
    invoiceTotal: number;
    invoiceCurrency: string;
    pdfUrl?: string;
    uuid?: string;
    issuerName: string;
  },
  language: 'es' | 'en' = 'es'
): SendEmailParams {
  const attachments: EmailAttachment[] = [];

  if (data.pdfUrl) {
    attachments.push({
      filename: `factura-${data.invoiceFolio}.pdf`,
      url: data.pdfUrl,
      contentType: 'application/pdf',
    });
  }

  return {
    to,
    toName,
    subject: getDefaultSubject('invoice_sent', data, language),
    templateId: 'invoice_sent',
    templateData: {
      ...data,
      language,
    },
    attachments,
    organizationId,
    invoiceId,
  };
}

/**
 * Build email params for a payment reminder email.
 */
export function buildPaymentReminderEmailParams(
  to: string,
  toName: string,
  organizationId: string,
  invoiceId: string,
  data: {
    invoiceFolio: string;
    invoiceTotal: number;
    invoiceCurrency: string;
    dueDate: string;
    daysUntilDue: number;
    issuerName: string;
  },
  language: 'es' | 'en' = 'es'
): SendEmailParams {
  const templateId: EmailTemplateId =
    data.daysUntilDue < 0 ? 'payment_overdue' : 'payment_reminder';

  return {
    to,
    toName,
    subject: getDefaultSubject(templateId, data, language),
    templateId,
    templateData: {
      ...data,
      language,
    },
    organizationId,
    invoiceId,
  };
}

/**
 * Build email params for a cancellation notice email.
 */
export function buildCancellationEmailParams(
  to: string,
  toName: string,
  organizationId: string,
  invoiceId: string,
  data: {
    invoiceFolio: string;
    cancellationReason: string;
    uuid?: string;
    issuerName: string;
  },
  language: 'es' | 'en' = 'es'
): SendEmailParams {
  return {
    to,
    toName,
    subject: getDefaultSubject('cancellation_notice', data, language),
    templateId: 'cancellation_notice',
    templateData: {
      ...data,
      language,
    },
    organizationId,
    invoiceId,
  };
}

// ============================================================================
// Configuration Check
// ============================================================================

/**
 * Check if email service is configured.
 *
 * STUB: Always returns true.
 * Real implementation would check for API keys, SMTP credentials, etc.
 */
export function isEmailServiceConfigured(): boolean {
  // In the real implementation, this would check:
  // - SENDGRID_API_KEY
  // - POSTMARK_SERVER_TOKEN
  // - SMTP_HOST, SMTP_USER, SMTP_PASSWORD
  // etc.

  console.log('[email-stub] Email service is using stub implementation');
  return true;
}

/**
 * Get email service provider info.
 *
 * STUB: Returns stub info.
 */
export function getEmailServiceInfo(): {
  provider: string;
  configured: boolean;
} {
  return {
    provider: 'stub',
    configured: true,
  };
}
