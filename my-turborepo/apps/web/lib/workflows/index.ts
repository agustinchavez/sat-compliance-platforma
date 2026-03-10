/**
 * Workflow Module Exports (Component 17)
 *
 * Invoice workflow engine for orchestrating sign → stamp → PDF operations,
 * notifications, and payment reminders.
 */

// ============================================================================
// Types
// ============================================================================

export type {
  WorkflowEventType,
  WorkflowEvent,
  ActionType,
  WorkflowAction,
  ActionResult,
  TransitionRule,
  WorkflowLogEntry,
  WorkflowLogInput,
  StampJobPayload,
  ReminderJobPayload,
  EmailJobPayload,
  ReminderType,
  EmailTemplateId,
  ProcessingStatus,
  ProcessingStatusResult,
} from './types';

export {
  InvoiceStatus,
  isWorkflowEventType,
  isActionType,
  isReminderType,
  isEmailTemplateId,
} from './types';

// ============================================================================
// Errors
// ============================================================================

export {
  WorkflowError,
  isWorkflowError,
  invalidTransitionError,
  invoiceNotFoundError,
  terminalStateError,
  jobEnqueueFailedError,
  concurrentProcessingError,
  invalidEventError,
  missingRequiredDataError,
  stampJobFailedError,
  redisConnectionError,
  isRetryableError,
  isFatalError,
  getErrorMessage,
} from './errors';

export type { WorkflowErrorCode } from './errors';

// ============================================================================
// State Machine
// ============================================================================

export {
  INVOICE_STATES,
  VALID_TRANSITIONS,
  canTransition,
  getRuleForEvent,
  getNextStatuses,
  isTerminalState,
  getStatusLabel,
  getActionsForTransition,
  getTriggerForTransition,
  getPossibleEvents,
  isValidEventForStatus,
  ALL_EVENT_TYPES,
  TRANSITION_EVENTS,
  INFORMATIONAL_EVENTS,
  isTransitionEvent,
  isInformationalEvent,
  // Re-exports from Component 12
  canEditInvoice,
  canCancelInvoice,
  canVoidInvoice,
  validateTransition,
  transitionStatus,
} from './state-machine';

export type { StateDefinition } from './state-machine';

// ============================================================================
// Engine
// ============================================================================

export {
  WorkflowEngine,
  getWorkflowEngine,
  createWorkflowEngine,
} from './engine';

// ============================================================================
// Actions
// ============================================================================

export {
  // PDF Action
  executePDFAction,
  canGeneratePDF,
  // Email Action
  enqueueSendEmail,
  enqueueSendInvoiceEmail,
  enqueueCancellationEmail,
  enqueuePaymentReminderEmail,
  buildStampedEmailPayload,
  buildCancellationEmailPayload,
  buildReminderEmailPayload,
  // Team Notification
  notifyTeam,
  buildStampSuccessMessage,
  buildStampFailureMessage,
  buildCancellationMessage,
  buildPaymentReminderMessage,
  // Reminder Scheduling
  schedulePaymentReminders,
  cancelPaymentReminders,
  REMINDER_SCHEDULE,
  // Action Utilities
  successResult,
  failureResult,
} from './actions';

export type { ActionContext, ActionHandler, TeamNotifyParams } from './actions';
