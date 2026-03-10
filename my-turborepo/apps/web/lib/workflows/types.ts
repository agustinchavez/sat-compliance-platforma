/**
 * Workflow Types (Component 17)
 *
 * Type definitions for the invoice workflow engine.
 * Defines events, actions, transition rules, and job payloads.
 */

import { InvoiceStatus } from '@/lib/invoices/types';

// Re-export for convenience
export { InvoiceStatus };

// ============================================================================
// Workflow Events
// ============================================================================

/**
 * Events that can trigger workflow transitions.
 */
export type WorkflowEventType =
  | 'invoice.sign_requested' // User clicks "Send to SAT"
  | 'invoice.stamp_succeeded' // PAC returned TFD successfully
  | 'invoice.stamp_failed' // PAC returned error after retries exhausted
  | 'invoice.pdf_generated' // PDF created and stored
  | 'invoice.cancelled' // Invoice cancelled via motivo
  | 'invoice.payment_due_soon' // Reminder: payment due in N days
  | 'invoice.payment_overdue'; // Reminder: payment is past due date

/**
 * A workflow event representing something that happened to an invoice.
 */
export interface WorkflowEvent {
  /** Event type identifier */
  type: WorkflowEventType;
  /** Invoice this event relates to */
  invoiceId: string;
  /** Organization owning the invoice */
  organizationId: string;
  /** ISO timestamp when event was triggered */
  triggeredAt: string;
  /** Additional event-specific data */
  metadata?: Record<string, unknown>;
}

// ============================================================================
// Workflow Actions
// ============================================================================

/**
 * Actions that can be triggered by workflow transitions.
 */
export type ActionType =
  | 'send_customer_email'
  | 'send_team_notification'
  | 'generate_pdf'
  | 'schedule_payment_reminder'
  | 'cancel_scheduled_reminders';

/**
 * An action to be executed as part of a workflow transition.
 */
export interface WorkflowAction {
  /** Action type identifier */
  type: ActionType;
  /** Invoice this action relates to */
  invoiceId: string;
  /** Organization context */
  organizationId: string;
  /** Action-specific payload */
  payload?: Record<string, unknown>;
}

/**
 * Result of executing a workflow action.
 */
export interface ActionResult {
  /** Which action was executed */
  actionType: ActionType;
  /** Whether the action succeeded */
  success: boolean;
  /** BullMQ job ID if action enqueued a job */
  jobId?: string;
  /** Error message if action failed */
  error?: string;
  /** ISO timestamp when action was executed */
  executedAt: string;
}

// ============================================================================
// Transition Rules
// ============================================================================

/**
 * Defines a valid status transition and its associated actions.
 */
export interface TransitionRule {
  /** Starting status */
  from: InvoiceStatus;
  /** Target status */
  to: InvoiceStatus;
  /** Event that triggers this transition */
  trigger: WorkflowEventType;
  /** Actions to fire when this transition occurs */
  actions: ActionType[];
}

// ============================================================================
// Workflow Logs
// ============================================================================

/**
 * A log entry recording a workflow event and its results.
 * Stored in the workflow_logs table for audit trail.
 */
export interface WorkflowLogEntry {
  /** Unique log entry ID */
  id: string;
  /** Invoice this log relates to */
  invoiceId: string;
  /** Organization context */
  organizationId: string;
  /** Event that was processed */
  eventType: WorkflowEventType;
  /** Status before the transition (null for non-transition events) */
  fromStatus: InvoiceStatus | null;
  /** Status after the transition (null for non-transition events) */
  toStatus: InvoiceStatus | null;
  /** Actions that were triggered */
  actionsTriggered: ActionType[];
  /** Results of each action */
  actionResults: ActionResult[];
  /** Whether the overall workflow succeeded */
  success: boolean;
  /** Error message if workflow failed */
  errorMessage: string | null;
  /** Additional metadata */
  metadata: Record<string, unknown>;
  /** ISO timestamp when log was created */
  createdAt: string;
}

/**
 * Input for creating a workflow log entry.
 */
export type WorkflowLogInput = Omit<WorkflowLogEntry, 'id' | 'createdAt'>;

// ============================================================================
// Job Payloads (BullMQ)
// ============================================================================

/**
 * Payload for invoice stamping jobs.
 * Enqueued to the 'invoice-processing' queue.
 */
export interface StampJobPayload {
  /** Invoice to process */
  invoiceId: string;
  /** Organization context */
  organizationId: string;
  /** Language for PDF generation */
  language: 'es' | 'en';
  /** Current attempt number (for retry tracking) */
  attemptNumber: number;
}

/**
 * Types of payment reminders.
 */
export type ReminderType = 'due_soon' | 'due_today' | 'overdue_7d' | 'overdue_30d';

/**
 * Payload for payment reminder jobs.
 * Enqueued to the 'payment-reminders' queue as delayed jobs.
 */
export interface ReminderJobPayload {
  /** Invoice this reminder is for */
  invoiceId: string;
  /** Organization context */
  organizationId: string;
  /** Type of reminder */
  reminderType: ReminderType;
  /** Days until due (negative = overdue) */
  daysUntilDue: number;
}

/**
 * Email template identifiers.
 */
export type EmailTemplateId =
  | 'invoice_sent' // Invoice stamped, attaches PDF + XML
  | 'payment_reminder' // Payment due soon
  | 'payment_overdue' // Payment past due
  | 'cancellation_notice'; // Invoice cancelled

/**
 * Payload for email jobs.
 * Enqueued to the 'invoice-emails' queue.
 */
export interface EmailJobPayload {
  /** Invoice this email relates to */
  invoiceId: string;
  /** Organization context */
  organizationId: string;
  /** Email template to use */
  emailType: EmailTemplateId;
  /** Recipient email address */
  recipientEmail: string;
  /** Recipient display name */
  recipientName: string;
  /** Email language */
  language: 'es' | 'en';
  /** Template-specific data */
  metadata?: Record<string, unknown>;
}

// ============================================================================
// Queue Job Names
// ============================================================================

/**
 * Job names for the invoice-processing queue.
 */
export type InvoiceQueueJobName = 'stamp-invoice';

/**
 * Job names for the invoice-emails queue.
 */
export type EmailQueueJobName = 'send-email';

/**
 * Job names for the payment-reminders queue.
 */
export type ReminderQueueJobName = 'payment-reminder';

// ============================================================================
// Processing Status
// ============================================================================

/**
 * Status of an invoice processing job.
 */
export type ProcessingStatus =
  | 'waiting' // Job is in queue, waiting to be processed
  | 'active' // Job is currently being processed
  | 'completed' // Job finished successfully
  | 'failed' // Job failed after all retries
  | 'not_found'; // No job found for this invoice

/**
 * Result of checking processing status.
 */
export interface ProcessingStatusResult {
  /** Current job status */
  status: ProcessingStatus;
  /** Failure reason if status is 'failed' */
  failReason?: string;
  /** BullMQ job ID if found */
  jobId?: string;
  /** Progress percentage (0-100) if available */
  progress?: number;
}

// ============================================================================
// Type Guards
// ============================================================================

/**
 * Check if a string is a valid WorkflowEventType.
 */
export function isWorkflowEventType(value: string): value is WorkflowEventType {
  const validEvents: WorkflowEventType[] = [
    'invoice.sign_requested',
    'invoice.stamp_succeeded',
    'invoice.stamp_failed',
    'invoice.pdf_generated',
    'invoice.cancelled',
    'invoice.payment_due_soon',
    'invoice.payment_overdue',
  ];
  return validEvents.includes(value as WorkflowEventType);
}

/**
 * Check if a string is a valid ActionType.
 */
export function isActionType(value: string): value is ActionType {
  const validActions: ActionType[] = [
    'send_customer_email',
    'send_team_notification',
    'generate_pdf',
    'schedule_payment_reminder',
    'cancel_scheduled_reminders',
  ];
  return validActions.includes(value as ActionType);
}

/**
 * Check if a string is a valid ReminderType.
 */
export function isReminderType(value: string): value is ReminderType {
  const validTypes: ReminderType[] = ['due_soon', 'due_today', 'overdue_7d', 'overdue_30d'];
  return validTypes.includes(value as ReminderType);
}

/**
 * Check if a string is a valid EmailTemplateId.
 */
export function isEmailTemplateId(value: string): value is EmailTemplateId {
  const validTemplates: EmailTemplateId[] = [
    'invoice_sent',
    'payment_reminder',
    'payment_overdue',
    'cancellation_notice',
  ];
  return validTemplates.includes(value as EmailTemplateId);
}
