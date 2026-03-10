/**
 * Email Service Module Exports (Component 17)
 *
 * Stub implementation for Component 29 (Email Service).
 */

export {
  sendEmail,
  sendBulkEmails,
  getDefaultSubject,
  buildInvoiceSentEmailParams,
  buildPaymentReminderEmailParams,
  buildCancellationEmailParams,
  isEmailServiceConfigured,
  getEmailServiceInfo,
} from './service';

export type {
  EmailTemplateId,
  EmailAttachment,
  SendEmailParams,
  SendEmailResult,
} from './service';
