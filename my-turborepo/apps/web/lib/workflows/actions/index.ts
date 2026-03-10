/**
 * Action Handlers Index (Component 17)
 */

// Types
export type { ActionContext, ActionHandler } from './types';
export { successResult, failureResult } from './types';

// PDF Action
export { executePDFAction, canGeneratePDF } from './generate-pdf';

// Email Action
export {
  enqueueSendEmail,
  enqueueSendInvoiceEmail,
  enqueueCancellationEmail,
  enqueuePaymentReminderEmail,
  buildStampedEmailPayload,
  buildCancellationEmailPayload,
  buildReminderEmailPayload,
} from './send-email';

// Team Notification Action
export {
  notifyTeam,
  buildStampSuccessMessage,
  buildStampFailureMessage,
  buildCancellationMessage,
  buildPaymentReminderMessage,
} from './notify-team';
export type { TeamNotifyParams } from './notify-team';

// Reminder Scheduling Action
export {
  schedulePaymentReminders,
  cancelPaymentReminders,
  REMINDER_SCHEDULE,
} from './schedule-reminder';
