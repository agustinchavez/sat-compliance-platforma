/**
 * Job Type Definitions (Component 17)
 *
 * Re-exports typed job payloads from workflows/types.ts
 * for use in queue definitions and workers.
 */

export type {
  StampJobPayload,
  ReminderJobPayload,
  EmailJobPayload,
  ReminderType,
  EmailTemplateId,
  InvoiceQueueJobName,
  EmailQueueJobName,
  ReminderQueueJobName,
} from '@/lib/workflows/types';

export {
  isReminderType,
  isEmailTemplateId,
} from '@/lib/workflows/types';
