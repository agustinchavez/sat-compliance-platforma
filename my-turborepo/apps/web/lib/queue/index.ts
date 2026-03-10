/**
 * Queue Module Exports (Component 17)
 */

// Redis connection
export {
  bullMQConnection,
  createBullMQConnection,
  isRedisConnected,
  closeRedisConnection,
} from './redis-connection';

// Queues
export {
  invoiceQueue,
  emailQueue,
  reminderQueue,
  QUEUE_NAMES,
  getQueue,
  areQueuesReady,
  getAllQueueCounts,
  pauseAllQueues,
  resumeAllQueues,
  closeAllQueues,
  getStampJobId,
  getReminderJobId,
  getEmailJobId,
} from './queues';

export type { QueueName } from './queues';

// Job types
export type {
  StampJobPayload,
  ReminderJobPayload,
  EmailJobPayload,
  ReminderType,
  EmailTemplateId,
  InvoiceQueueJobName,
  EmailQueueJobName,
  ReminderQueueJobName,
} from './job-types';

export { isReminderType, isEmailTemplateId } from './job-types';
