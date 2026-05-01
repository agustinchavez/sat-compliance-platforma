/**
 * Workflow State Machine (Component 17)
 *
 * Orchestration rules for invoice workflow transitions.
 * Imports primitives from Component 12's workflow.ts and adds
 * workflow-engine-specific logic (which actions fire on which transitions).
 */

import { InvoiceStatus } from '@/lib/invoices/types';
import {
  canTransition as invoiceCanTransition,
  isTerminal as invoiceIsTerminal,
  getNextStatuses as invoiceGetNextStatuses,
  getStatusLabel as invoiceGetStatusLabel,
} from '@/lib/invoices/workflow';
import type { TransitionRule, WorkflowEventType, ActionType } from './types';

// Re-export Component 12 primitives for convenience
export { InvoiceStatus };
export {
  canEditInvoice,
  canCancelInvoice,
  canVoidInvoice,
  validateTransition,
  transitionStatus,
} from '@/lib/invoices/workflow';

// ============================================================================
// State Definitions
// ============================================================================

/**
 * Invoice state metadata.
 */
export interface StateDefinition {
  /** Human-readable label */
  label: string;
  /** Spanish label */
  labelEs: string;
  /** Whether this is a terminal state (no further transitions) */
  terminal: boolean;
}

/**
 * All invoice states with their metadata.
 */
export const INVOICE_STATES: Record<InvoiceStatus, StateDefinition> = {
  [InvoiceStatus.DRAFT]: {
    label: 'Draft',
    labelEs: 'Borrador',
    terminal: false,
  },
  [InvoiceStatus.PENDING_STAMP]: {
    label: 'Pending Stamp',
    labelEs: 'Pendiente de timbrar',
    terminal: false,
  },
  [InvoiceStatus.STAMPED]: {
    label: 'Stamped',
    labelEs: 'Timbrada',
    terminal: false,
  },
  [InvoiceStatus.SENT]: {
    label: 'Sent',
    labelEs: 'Enviada',
    terminal: false,
  },
  [InvoiceStatus.PAID]: {
    label: 'Paid',
    labelEs: 'Pagada',
    terminal: false,
  },
  [InvoiceStatus.CANCELLED]: {
    label: 'Cancelled',
    labelEs: 'Cancelada',
    terminal: true,
  },
  [InvoiceStatus.VOID]: {
    label: 'Void',
    labelEs: 'Anulada',
    terminal: true,
  },
};

// ============================================================================
// Transition Rules with Actions
// ============================================================================

/**
 * Valid transitions with their triggering events and resulting actions.
 *
 * These rules define:
 * 1. Which event triggers which status change
 * 2. Which actions fire when a transition occurs
 *
 * Actions are non-blocking: failures are logged but don't roll back the transition.
 */
export const VALID_TRANSITIONS: TransitionRule[] = [
  // User initiates stamping process
  {
    from: InvoiceStatus.DRAFT,
    to: InvoiceStatus.PENDING_STAMP,
    trigger: 'invoice.sign_requested',
    actions: [], // No automated actions on sign — user-initiated
  },

  // PAC stamping succeeded
  {
    from: InvoiceStatus.PENDING_STAMP,
    to: InvoiceStatus.STAMPED,
    trigger: 'invoice.stamp_succeeded',
    actions: [
      'generate_pdf',
      'send_customer_email',
      'send_team_notification',
      'schedule_payment_reminder',
    ],
  },

  // PAC stamping failed after retries
  {
    from: InvoiceStatus.PENDING_STAMP,
    to: InvoiceStatus.DRAFT,
    trigger: 'invoice.stamp_failed',
    actions: ['send_team_notification'],
  },

  // Invoice cancelled (from stamped)
  {
    from: InvoiceStatus.STAMPED,
    to: InvoiceStatus.CANCELLED,
    trigger: 'invoice.cancelled',
    actions: [
      'cancel_scheduled_reminders',
      'send_customer_email',
      'send_team_notification',
    ],
  },

  // Invoice cancelled (from sent)
  {
    from: InvoiceStatus.SENT,
    to: InvoiceStatus.CANCELLED,
    trigger: 'invoice.cancelled',
    actions: [
      'cancel_scheduled_reminders',
      'send_customer_email',
      'send_team_notification',
    ],
  },

  // Invoice cancelled (from paid)
  {
    from: InvoiceStatus.PAID,
    to: InvoiceStatus.CANCELLED,
    trigger: 'invoice.cancelled',
    actions: [
      'cancel_scheduled_reminders',
      'send_customer_email',
      'send_team_notification',
    ],
  },

  // Invoice fully paid (from stamped or sent)
  {
    from: InvoiceStatus.STAMPED,
    to: InvoiceStatus.PAID,
    trigger: 'invoice.paid',
    actions: [
      'cancel_scheduled_reminders',
      'send_team_notification',
    ],
  },

  {
    from: InvoiceStatus.SENT,
    to: InvoiceStatus.PAID,
    trigger: 'invoice.paid',
    actions: [
      'cancel_scheduled_reminders',
      'send_team_notification',
    ],
  },
];

// ============================================================================
// State Machine Functions
// ============================================================================

/**
 * Returns true if the given transition is allowed by the state machine.
 * Delegates to Component 12's canTransition.
 */
export function canTransition(from: InvoiceStatus, to: InvoiceStatus): boolean {
  return invoiceCanTransition(from, to);
}

/**
 * Returns the TransitionRule for the given event and current status.
 * Returns null if no rule matches (invalid/unknown event).
 *
 * @param currentStatus - The invoice's current status
 * @param eventType - The workflow event being processed
 * @returns TransitionRule or null if no matching rule
 */
export function getRuleForEvent(
  currentStatus: InvoiceStatus,
  eventType: WorkflowEventType
): TransitionRule | null {
  return (
    VALID_TRANSITIONS.find(
      (rule) => rule.from === currentStatus && rule.trigger === eventType
    ) ?? null
  );
}

/**
 * Returns all valid next statuses from a given current status.
 * Delegates to Component 12's getNextStatuses.
 */
export function getNextStatuses(current: InvoiceStatus): InvoiceStatus[] {
  return invoiceGetNextStatuses(current);
}

/**
 * Returns true if the given status is a terminal state.
 * Terminal states allow no further transitions.
 */
export function isTerminalState(status: InvoiceStatus): boolean {
  return INVOICE_STATES[status]?.terminal ?? false;
}

/**
 * Get the label for a status.
 *
 * @param status - Invoice status
 * @param language - 'es' or 'en'
 */
export function getStatusLabel(
  status: InvoiceStatus,
  language: 'es' | 'en' = 'es'
): string {
  const state = INVOICE_STATES[status];
  if (!state) return status;
  return language === 'es' ? state.labelEs : state.label;
}

/**
 * Get actions that should fire for a given transition.
 *
 * @param from - Starting status
 * @param to - Target status
 * @returns Array of action types (empty if transition not found)
 */
export function getActionsForTransition(
  from: InvoiceStatus,
  to: InvoiceStatus
): ActionType[] {
  const rule = VALID_TRANSITIONS.find(
    (r) => r.from === from && r.to === to
  );
  return rule?.actions ?? [];
}

/**
 * Get the event type that triggers a specific transition.
 *
 * @param from - Starting status
 * @param to - Target status
 * @returns WorkflowEventType or null if transition not found
 */
export function getTriggerForTransition(
  from: InvoiceStatus,
  to: InvoiceStatus
): WorkflowEventType | null {
  const rule = VALID_TRANSITIONS.find(
    (r) => r.from === from && r.to === to
  );
  return rule?.trigger ?? null;
}

/**
 * Get all events that can be triggered from a given status.
 *
 * @param currentStatus - The current invoice status
 * @returns Array of possible event types
 */
export function getPossibleEvents(currentStatus: InvoiceStatus): WorkflowEventType[] {
  return VALID_TRANSITIONS.filter((rule) => rule.from === currentStatus).map(
    (rule) => rule.trigger
  );
}

/**
 * Check if an event is valid for the current status.
 *
 * @param currentStatus - The current invoice status
 * @param eventType - The event to check
 * @returns true if the event can be processed from this status
 */
export function isValidEventForStatus(
  currentStatus: InvoiceStatus,
  eventType: WorkflowEventType
): boolean {
  return getRuleForEvent(currentStatus, eventType) !== null;
}

// ============================================================================
// Event Type Helpers
// ============================================================================

/**
 * All possible workflow event types.
 */
export const ALL_EVENT_TYPES: WorkflowEventType[] = [
  'invoice.sign_requested',
  'invoice.stamp_succeeded',
  'invoice.stamp_failed',
  'invoice.pdf_generated',
  'invoice.cancelled',
  'invoice.payment_due_soon',
  'invoice.payment_overdue',
  'invoice.paid',
];

/**
 * Events that trigger status transitions.
 */
export const TRANSITION_EVENTS: WorkflowEventType[] = [
  'invoice.sign_requested',
  'invoice.stamp_succeeded',
  'invoice.stamp_failed',
  'invoice.cancelled',
  'invoice.paid',
];

/**
 * Events that are informational (don't change status).
 */
export const INFORMATIONAL_EVENTS: WorkflowEventType[] = [
  'invoice.pdf_generated',
  'invoice.payment_due_soon',
  'invoice.payment_overdue',
];

/**
 * Check if an event triggers a status transition.
 */
export function isTransitionEvent(eventType: WorkflowEventType): boolean {
  return TRANSITION_EVENTS.includes(eventType);
}

/**
 * Check if an event is informational (no status change).
 */
export function isInformationalEvent(eventType: WorkflowEventType): boolean {
  return INFORMATIONAL_EVENTS.includes(eventType);
}
