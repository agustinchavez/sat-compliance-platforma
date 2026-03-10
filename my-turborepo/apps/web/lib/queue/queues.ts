/**
 * BullMQ Queue Definitions (Component 17)
 *
 * Defines the three job queues used by the workflow engine:
 * 1. invoice-processing: Sign → Stamp → PDF jobs
 * 2. invoice-emails: Email delivery jobs
 * 3. payment-reminders: Delayed reminder jobs
 */

import { Queue, type ConnectionOptions } from 'bullmq';
import { bullMQConnection } from './redis-connection';
import type {
  StampJobPayload,
  EmailJobPayload,
  ReminderJobPayload,
} from './job-types';

// ============================================================================
// Queue Names
// ============================================================================

export const QUEUE_NAMES = {
  INVOICE_PROCESSING: 'invoice-processing',
  INVOICE_EMAILS: 'invoice-emails',
  PAYMENT_REMINDERS: 'payment-reminders',
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

// ============================================================================
// Invoice Processing Queue
// ============================================================================

/**
 * Invoice processing queue: sign → stamp → pdf
 *
 * High-priority, aggressive retry, short delay.
 * Jobs in this queue are the core invoicing workflow.
 */
export const invoiceQueue = new Queue<StampJobPayload>(
  QUEUE_NAMES.INVOICE_PROCESSING,
  {
    connection: bullMQConnection as ConnectionOptions,
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 2000, // 2s, 4s, 8s
      },
      removeOnComplete: {
        count: 100, // Keep last 100 completed jobs
      },
      removeOnFail: {
        count: 500, // Keep last 500 failed jobs for debugging
      },
    },
  }
);

// ============================================================================
// Email Queue
// ============================================================================

/**
 * Email queue: sends invoice emails via EmailService (Component 29 stub)
 *
 * Moderate retry — email failures are non-critical.
 * The invoice is already stamped; delivery is best-effort.
 */
export const emailQueue = new Queue<EmailJobPayload>(
  QUEUE_NAMES.INVOICE_EMAILS,
  {
    connection: bullMQConnection as ConnectionOptions,
    defaultJobOptions: {
      attempts: 5,
      backoff: {
        type: 'exponential',
        delay: 5000, // 5s, 10s, 20s, 40s, 80s
      },
      removeOnComplete: {
        count: 200,
      },
      removeOnFail: {
        count: 1000,
      },
    },
  }
);

// ============================================================================
// Reminder Queue
// ============================================================================

/**
 * Reminder queue: payment due/overdue reminders (delayed jobs)
 *
 * Lower priority, less aggressive retry.
 * These are scheduled far in advance and can afford failures.
 */
export const reminderQueue = new Queue<ReminderJobPayload>(
  QUEUE_NAMES.PAYMENT_REMINDERS,
  {
    connection: bullMQConnection as ConnectionOptions,
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 10000, // 10s, 20s, 40s
      },
      removeOnComplete: {
        count: 50,
      },
      removeOnFail: {
        count: 200,
      },
    },
  }
);

// ============================================================================
// Queue Utilities
// ============================================================================

/**
 * Get a queue by name.
 */
export function getQueue(name: QueueName): Queue {
  switch (name) {
    case QUEUE_NAMES.INVOICE_PROCESSING:
      return invoiceQueue;
    case QUEUE_NAMES.INVOICE_EMAILS:
      return emailQueue;
    case QUEUE_NAMES.PAYMENT_REMINDERS:
      return reminderQueue;
    default:
      throw new Error(`Unknown queue: ${name}`);
  }
}

/**
 * Check if all queues are ready (connected to Redis).
 */
export async function areQueuesReady(): Promise<boolean> {
  try {
    // Try to get queue counts - this will fail if Redis is not connected
    await invoiceQueue.getJobCounts();
    await emailQueue.getJobCounts();
    await reminderQueue.getJobCounts();
    return true;
  } catch {
    return false;
  }
}

/**
 * Get job counts for all queues.
 */
export async function getAllQueueCounts(): Promise<
  Record<QueueName, Awaited<ReturnType<Queue['getJobCounts']>>>
> {
  const [invoiceCounts, emailCounts, reminderCounts] = await Promise.all([
    invoiceQueue.getJobCounts(),
    emailQueue.getJobCounts(),
    reminderQueue.getJobCounts(),
  ]);

  return {
    [QUEUE_NAMES.INVOICE_PROCESSING]: invoiceCounts,
    [QUEUE_NAMES.INVOICE_EMAILS]: emailCounts,
    [QUEUE_NAMES.PAYMENT_REMINDERS]: reminderCounts,
  };
}

/**
 * Pause all queues.
 * Useful for maintenance or graceful shutdown.
 */
export async function pauseAllQueues(): Promise<void> {
  await Promise.all([
    invoiceQueue.pause(),
    emailQueue.pause(),
    reminderQueue.pause(),
  ]);
}

/**
 * Resume all queues.
 */
export async function resumeAllQueues(): Promise<void> {
  await Promise.all([
    invoiceQueue.resume(),
    emailQueue.resume(),
    reminderQueue.resume(),
  ]);
}

/**
 * Close all queue connections.
 * Call this during application shutdown.
 */
export async function closeAllQueues(): Promise<void> {
  await Promise.all([
    invoiceQueue.close(),
    emailQueue.close(),
    reminderQueue.close(),
  ]);
}

// ============================================================================
// Job ID Generators
// ============================================================================

/**
 * Generate an idempotent job ID for invoice stamping.
 * Using the same ID prevents duplicate jobs for the same invoice.
 */
export function getStampJobId(invoiceId: string): string {
  return `stamp-${invoiceId}`;
}

/**
 * Generate an idempotent job ID for a payment reminder.
 * Allows cancellation by predictable ID.
 */
export function getReminderJobId(
  invoiceId: string,
  reminderType: string
): string {
  return `reminder-${invoiceId}-${reminderType}`;
}

/**
 * Generate a job ID for an email.
 * Emails can have multiple jobs per invoice (different types).
 */
export function getEmailJobId(
  invoiceId: string,
  emailType: string
): string {
  return `email-${invoiceId}-${emailType}-${Date.now()}`;
}
