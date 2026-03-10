/**
 * Tests for Workflow State Machine (Component 17)
 *
 * Tests state machine transitions, rules, and event handling.
 */

import { describe, it, expect } from 'vitest';
import {
  canTransition,
  getRuleForEvent,
  getNextStatuses,
  isTerminalState,
  getStatusLabel,
  getActionsForTransition,
  getTriggerForTransition,
  getPossibleEvents,
  isValidEventForStatus,
  isTransitionEvent,
  isInformationalEvent,
  INVOICE_STATES,
  VALID_TRANSITIONS,
  ALL_EVENT_TYPES,
  TRANSITION_EVENTS,
  INFORMATIONAL_EVENTS,
  InvoiceStatus,
} from '../state-machine';

// ============================================================================
// State Definitions Tests
// ============================================================================

describe('INVOICE_STATES', () => {
  it('defines all invoice statuses', () => {
    const statuses = Object.keys(INVOICE_STATES);

    expect(statuses).toContain(InvoiceStatus.DRAFT);
    expect(statuses).toContain(InvoiceStatus.PENDING_STAMP);
    expect(statuses).toContain(InvoiceStatus.STAMPED);
    expect(statuses).toContain(InvoiceStatus.SENT);
    expect(statuses).toContain(InvoiceStatus.PAID);
    expect(statuses).toContain(InvoiceStatus.CANCELLED);
    expect(statuses).toContain(InvoiceStatus.VOID);
  });

  it('has labels for all states', () => {
    for (const status of Object.values(InvoiceStatus)) {
      const state = INVOICE_STATES[status];
      expect(state).toBeDefined();
      expect(state.label).toBeDefined();
      expect(state.labelEs).toBeDefined();
    }
  });

  it('marks CANCELLED as terminal', () => {
    expect(INVOICE_STATES[InvoiceStatus.CANCELLED].terminal).toBe(true);
  });

  it('marks VOID as terminal', () => {
    expect(INVOICE_STATES[InvoiceStatus.VOID].terminal).toBe(true);
  });

  it('marks DRAFT as non-terminal', () => {
    expect(INVOICE_STATES[InvoiceStatus.DRAFT].terminal).toBe(false);
  });

  it('marks STAMPED as non-terminal', () => {
    expect(INVOICE_STATES[InvoiceStatus.STAMPED].terminal).toBe(false);
  });

  it('marks PAID as non-terminal', () => {
    expect(INVOICE_STATES[InvoiceStatus.PAID].terminal).toBe(false);
  });
});

// ============================================================================
// Transition Rules Tests
// ============================================================================

describe('VALID_TRANSITIONS', () => {
  it('contains transition from DRAFT to PENDING_STAMP', () => {
    const rule = VALID_TRANSITIONS.find(
      (r) => r.from === InvoiceStatus.DRAFT && r.to === InvoiceStatus.PENDING_STAMP
    );

    expect(rule).toBeDefined();
    expect(rule?.trigger).toBe('invoice.sign_requested');
    expect(rule?.actions).toEqual([]);
  });

  it('contains transition from PENDING_STAMP to STAMPED', () => {
    const rule = VALID_TRANSITIONS.find(
      (r) => r.from === InvoiceStatus.PENDING_STAMP && r.to === InvoiceStatus.STAMPED
    );

    expect(rule).toBeDefined();
    expect(rule?.trigger).toBe('invoice.stamp_succeeded');
    expect(rule?.actions).toContain('generate_pdf');
    expect(rule?.actions).toContain('send_customer_email');
    expect(rule?.actions).toContain('send_team_notification');
    expect(rule?.actions).toContain('schedule_payment_reminder');
  });

  it('contains transition from PENDING_STAMP back to DRAFT on failure', () => {
    const rule = VALID_TRANSITIONS.find(
      (r) => r.from === InvoiceStatus.PENDING_STAMP && r.to === InvoiceStatus.DRAFT
    );

    expect(rule).toBeDefined();
    expect(rule?.trigger).toBe('invoice.stamp_failed');
    expect(rule?.actions).toContain('send_team_notification');
  });

  it('contains cancellation transitions from multiple states', () => {
    const stampedToCancel = VALID_TRANSITIONS.find(
      (r) => r.from === InvoiceStatus.STAMPED && r.to === InvoiceStatus.CANCELLED
    );
    const sentToCancel = VALID_TRANSITIONS.find(
      (r) => r.from === InvoiceStatus.SENT && r.to === InvoiceStatus.CANCELLED
    );
    const paidToCancel = VALID_TRANSITIONS.find(
      (r) => r.from === InvoiceStatus.PAID && r.to === InvoiceStatus.CANCELLED
    );

    expect(stampedToCancel).toBeDefined();
    expect(sentToCancel).toBeDefined();
    expect(paidToCancel).toBeDefined();

    // All should have the same trigger
    expect(stampedToCancel?.trigger).toBe('invoice.cancelled');
    expect(sentToCancel?.trigger).toBe('invoice.cancelled');
    expect(paidToCancel?.trigger).toBe('invoice.cancelled');

    // All should cancel reminders
    expect(stampedToCancel?.actions).toContain('cancel_scheduled_reminders');
    expect(sentToCancel?.actions).toContain('cancel_scheduled_reminders');
    expect(paidToCancel?.actions).toContain('cancel_scheduled_reminders');
  });
});

// ============================================================================
// canTransition Tests
// ============================================================================

describe('canTransition', () => {
  describe('Valid transitions (delegates to Component 12)', () => {
    it('allows DRAFT → PENDING_STAMP', () => {
      expect(canTransition(InvoiceStatus.DRAFT, InvoiceStatus.PENDING_STAMP)).toBe(true);
    });

    it('allows PENDING_STAMP → STAMPED', () => {
      expect(canTransition(InvoiceStatus.PENDING_STAMP, InvoiceStatus.STAMPED)).toBe(true);
    });

    it('allows STAMPED → CANCELLED', () => {
      expect(canTransition(InvoiceStatus.STAMPED, InvoiceStatus.CANCELLED)).toBe(true);
    });
  });

  describe('Invalid transitions', () => {
    it('rejects DRAFT → STAMPED (must go through PENDING_STAMP)', () => {
      expect(canTransition(InvoiceStatus.DRAFT, InvoiceStatus.STAMPED)).toBe(false);
    });

    it('rejects CANCELLED → any state', () => {
      expect(canTransition(InvoiceStatus.CANCELLED, InvoiceStatus.DRAFT)).toBe(false);
      expect(canTransition(InvoiceStatus.CANCELLED, InvoiceStatus.STAMPED)).toBe(false);
    });

    it('rejects VOID → any state', () => {
      expect(canTransition(InvoiceStatus.VOID, InvoiceStatus.DRAFT)).toBe(false);
    });
  });
});

// ============================================================================
// getRuleForEvent Tests
// ============================================================================

describe('getRuleForEvent', () => {
  it('returns rule for sign_requested from DRAFT', () => {
    const rule = getRuleForEvent(InvoiceStatus.DRAFT, 'invoice.sign_requested');

    expect(rule).not.toBeNull();
    expect(rule?.from).toBe(InvoiceStatus.DRAFT);
    expect(rule?.to).toBe(InvoiceStatus.PENDING_STAMP);
  });

  it('returns rule for stamp_succeeded from PENDING_STAMP', () => {
    const rule = getRuleForEvent(InvoiceStatus.PENDING_STAMP, 'invoice.stamp_succeeded');

    expect(rule).not.toBeNull();
    expect(rule?.from).toBe(InvoiceStatus.PENDING_STAMP);
    expect(rule?.to).toBe(InvoiceStatus.STAMPED);
  });

  it('returns rule for stamp_failed from PENDING_STAMP', () => {
    const rule = getRuleForEvent(InvoiceStatus.PENDING_STAMP, 'invoice.stamp_failed');

    expect(rule).not.toBeNull();
    expect(rule?.to).toBe(InvoiceStatus.DRAFT);
  });

  it('returns rule for cancelled from STAMPED', () => {
    const rule = getRuleForEvent(InvoiceStatus.STAMPED, 'invoice.cancelled');

    expect(rule).not.toBeNull();
    expect(rule?.to).toBe(InvoiceStatus.CANCELLED);
  });

  it('returns null for invalid event from status', () => {
    // Cannot sign from STAMPED
    const rule = getRuleForEvent(InvoiceStatus.STAMPED, 'invoice.sign_requested');

    expect(rule).toBeNull();
  });

  it('returns null for unknown event type', () => {
    const rule = getRuleForEvent(
      InvoiceStatus.DRAFT,
      'invoice.unknown' as any
    );

    expect(rule).toBeNull();
  });
});

// ============================================================================
// getNextStatuses Tests
// ============================================================================

describe('getNextStatuses', () => {
  it('returns PENDING_STAMP and VOID from DRAFT', () => {
    const statuses = getNextStatuses(InvoiceStatus.DRAFT);

    expect(statuses).toContain(InvoiceStatus.PENDING_STAMP);
    expect(statuses).toContain(InvoiceStatus.VOID);
  });

  it('returns multiple statuses from STAMPED', () => {
    const statuses = getNextStatuses(InvoiceStatus.STAMPED);

    expect(statuses).toContain(InvoiceStatus.SENT);
    expect(statuses).toContain(InvoiceStatus.PAID);
    expect(statuses).toContain(InvoiceStatus.CANCELLED);
  });

  it('returns empty array from terminal states', () => {
    const cancelledStatuses = getNextStatuses(InvoiceStatus.CANCELLED);
    const voidStatuses = getNextStatuses(InvoiceStatus.VOID);

    expect(cancelledStatuses).toHaveLength(0);
    expect(voidStatuses).toHaveLength(0);
  });
});

// ============================================================================
// isTerminalState Tests
// ============================================================================

describe('isTerminalState', () => {
  it('returns true for CANCELLED', () => {
    expect(isTerminalState(InvoiceStatus.CANCELLED)).toBe(true);
  });

  it('returns true for VOID', () => {
    expect(isTerminalState(InvoiceStatus.VOID)).toBe(true);
  });

  it('returns false for DRAFT', () => {
    expect(isTerminalState(InvoiceStatus.DRAFT)).toBe(false);
  });

  it('returns false for STAMPED', () => {
    expect(isTerminalState(InvoiceStatus.STAMPED)).toBe(false);
  });

  it('returns false for PAID', () => {
    expect(isTerminalState(InvoiceStatus.PAID)).toBe(false);
  });
});

// ============================================================================
// getStatusLabel Tests
// ============================================================================

describe('getStatusLabel', () => {
  it('returns Spanish labels by default', () => {
    expect(getStatusLabel(InvoiceStatus.DRAFT)).toBe('Borrador');
    expect(getStatusLabel(InvoiceStatus.STAMPED)).toBe('Timbrada');
    expect(getStatusLabel(InvoiceStatus.CANCELLED)).toBe('Cancelada');
  });

  it('returns Spanish labels when specified', () => {
    expect(getStatusLabel(InvoiceStatus.DRAFT, 'es')).toBe('Borrador');
    expect(getStatusLabel(InvoiceStatus.PENDING_STAMP, 'es')).toBe('Pendiente de timbrar');
  });

  it('returns English labels when specified', () => {
    expect(getStatusLabel(InvoiceStatus.DRAFT, 'en')).toBe('Draft');
    expect(getStatusLabel(InvoiceStatus.PENDING_STAMP, 'en')).toBe('Pending Stamp');
    expect(getStatusLabel(InvoiceStatus.STAMPED, 'en')).toBe('Stamped');
    expect(getStatusLabel(InvoiceStatus.SENT, 'en')).toBe('Sent');
    expect(getStatusLabel(InvoiceStatus.PAID, 'en')).toBe('Paid');
    expect(getStatusLabel(InvoiceStatus.CANCELLED, 'en')).toBe('Cancelled');
    expect(getStatusLabel(InvoiceStatus.VOID, 'en')).toBe('Void');
  });
});

// ============================================================================
// getActionsForTransition Tests
// ============================================================================

describe('getActionsForTransition', () => {
  it('returns empty actions for DRAFT → PENDING_STAMP', () => {
    const actions = getActionsForTransition(
      InvoiceStatus.DRAFT,
      InvoiceStatus.PENDING_STAMP
    );

    expect(actions).toEqual([]);
  });

  it('returns full action set for PENDING_STAMP → STAMPED', () => {
    const actions = getActionsForTransition(
      InvoiceStatus.PENDING_STAMP,
      InvoiceStatus.STAMPED
    );

    expect(actions).toContain('generate_pdf');
    expect(actions).toContain('send_customer_email');
    expect(actions).toContain('send_team_notification');
    expect(actions).toContain('schedule_payment_reminder');
    expect(actions).toHaveLength(4);
  });

  it('returns notification action for PENDING_STAMP → DRAFT (failure)', () => {
    const actions = getActionsForTransition(
      InvoiceStatus.PENDING_STAMP,
      InvoiceStatus.DRAFT
    );

    expect(actions).toContain('send_team_notification');
    expect(actions).toHaveLength(1);
  });

  it('returns cancellation actions for STAMPED → CANCELLED', () => {
    const actions = getActionsForTransition(
      InvoiceStatus.STAMPED,
      InvoiceStatus.CANCELLED
    );

    expect(actions).toContain('cancel_scheduled_reminders');
    expect(actions).toContain('send_customer_email');
    expect(actions).toContain('send_team_notification');
  });

  it('returns empty array for invalid transition', () => {
    const actions = getActionsForTransition(
      InvoiceStatus.DRAFT,
      InvoiceStatus.STAMPED
    );

    expect(actions).toEqual([]);
  });
});

// ============================================================================
// getTriggerForTransition Tests
// ============================================================================

describe('getTriggerForTransition', () => {
  it('returns sign_requested for DRAFT → PENDING_STAMP', () => {
    const trigger = getTriggerForTransition(
      InvoiceStatus.DRAFT,
      InvoiceStatus.PENDING_STAMP
    );

    expect(trigger).toBe('invoice.sign_requested');
  });

  it('returns stamp_succeeded for PENDING_STAMP → STAMPED', () => {
    const trigger = getTriggerForTransition(
      InvoiceStatus.PENDING_STAMP,
      InvoiceStatus.STAMPED
    );

    expect(trigger).toBe('invoice.stamp_succeeded');
  });

  it('returns stamp_failed for PENDING_STAMP → DRAFT', () => {
    const trigger = getTriggerForTransition(
      InvoiceStatus.PENDING_STAMP,
      InvoiceStatus.DRAFT
    );

    expect(trigger).toBe('invoice.stamp_failed');
  });

  it('returns cancelled for STAMPED → CANCELLED', () => {
    const trigger = getTriggerForTransition(
      InvoiceStatus.STAMPED,
      InvoiceStatus.CANCELLED
    );

    expect(trigger).toBe('invoice.cancelled');
  });

  it('returns null for invalid transition', () => {
    const trigger = getTriggerForTransition(
      InvoiceStatus.DRAFT,
      InvoiceStatus.PAID
    );

    expect(trigger).toBeNull();
  });
});

// ============================================================================
// getPossibleEvents Tests
// ============================================================================

describe('getPossibleEvents', () => {
  it('returns sign_requested for DRAFT', () => {
    const events = getPossibleEvents(InvoiceStatus.DRAFT);

    expect(events).toContain('invoice.sign_requested');
  });

  it('returns stamp_succeeded and stamp_failed for PENDING_STAMP', () => {
    const events = getPossibleEvents(InvoiceStatus.PENDING_STAMP);

    expect(events).toContain('invoice.stamp_succeeded');
    expect(events).toContain('invoice.stamp_failed');
  });

  it('returns cancelled for STAMPED', () => {
    const events = getPossibleEvents(InvoiceStatus.STAMPED);

    expect(events).toContain('invoice.cancelled');
  });

  it('returns cancelled for SENT', () => {
    const events = getPossibleEvents(InvoiceStatus.SENT);

    expect(events).toContain('invoice.cancelled');
  });

  it('returns cancelled for PAID', () => {
    const events = getPossibleEvents(InvoiceStatus.PAID);

    expect(events).toContain('invoice.cancelled');
  });

  it('returns empty array for terminal states', () => {
    const cancelledEvents = getPossibleEvents(InvoiceStatus.CANCELLED);
    const voidEvents = getPossibleEvents(InvoiceStatus.VOID);

    expect(cancelledEvents).toHaveLength(0);
    expect(voidEvents).toHaveLength(0);
  });
});

// ============================================================================
// isValidEventForStatus Tests
// ============================================================================

describe('isValidEventForStatus', () => {
  it('returns true for sign_requested from DRAFT', () => {
    expect(
      isValidEventForStatus(InvoiceStatus.DRAFT, 'invoice.sign_requested')
    ).toBe(true);
  });

  it('returns true for stamp_succeeded from PENDING_STAMP', () => {
    expect(
      isValidEventForStatus(InvoiceStatus.PENDING_STAMP, 'invoice.stamp_succeeded')
    ).toBe(true);
  });

  it('returns false for sign_requested from STAMPED', () => {
    expect(
      isValidEventForStatus(InvoiceStatus.STAMPED, 'invoice.sign_requested')
    ).toBe(false);
  });

  it('returns false for stamp_succeeded from DRAFT', () => {
    expect(
      isValidEventForStatus(InvoiceStatus.DRAFT, 'invoice.stamp_succeeded')
    ).toBe(false);
  });
});

// ============================================================================
// Event Type Helpers Tests
// ============================================================================

describe('ALL_EVENT_TYPES', () => {
  it('contains all event types', () => {
    expect(ALL_EVENT_TYPES).toContain('invoice.sign_requested');
    expect(ALL_EVENT_TYPES).toContain('invoice.stamp_succeeded');
    expect(ALL_EVENT_TYPES).toContain('invoice.stamp_failed');
    expect(ALL_EVENT_TYPES).toContain('invoice.pdf_generated');
    expect(ALL_EVENT_TYPES).toContain('invoice.cancelled');
    expect(ALL_EVENT_TYPES).toContain('invoice.payment_due_soon');
    expect(ALL_EVENT_TYPES).toContain('invoice.payment_overdue');
  });
});

describe('TRANSITION_EVENTS', () => {
  it('contains events that cause status changes', () => {
    expect(TRANSITION_EVENTS).toContain('invoice.sign_requested');
    expect(TRANSITION_EVENTS).toContain('invoice.stamp_succeeded');
    expect(TRANSITION_EVENTS).toContain('invoice.stamp_failed');
    expect(TRANSITION_EVENTS).toContain('invoice.cancelled');
  });

  it('does not contain informational events', () => {
    expect(TRANSITION_EVENTS).not.toContain('invoice.pdf_generated');
    expect(TRANSITION_EVENTS).not.toContain('invoice.payment_due_soon');
    expect(TRANSITION_EVENTS).not.toContain('invoice.payment_overdue');
  });
});

describe('INFORMATIONAL_EVENTS', () => {
  it('contains events that do not change status', () => {
    expect(INFORMATIONAL_EVENTS).toContain('invoice.pdf_generated');
    expect(INFORMATIONAL_EVENTS).toContain('invoice.payment_due_soon');
    expect(INFORMATIONAL_EVENTS).toContain('invoice.payment_overdue');
  });

  it('does not contain transition events', () => {
    expect(INFORMATIONAL_EVENTS).not.toContain('invoice.sign_requested');
    expect(INFORMATIONAL_EVENTS).not.toContain('invoice.stamp_succeeded');
    expect(INFORMATIONAL_EVENTS).not.toContain('invoice.cancelled');
  });
});

describe('isTransitionEvent', () => {
  it('returns true for transition events', () => {
    expect(isTransitionEvent('invoice.sign_requested')).toBe(true);
    expect(isTransitionEvent('invoice.stamp_succeeded')).toBe(true);
    expect(isTransitionEvent('invoice.stamp_failed')).toBe(true);
    expect(isTransitionEvent('invoice.cancelled')).toBe(true);
  });

  it('returns false for informational events', () => {
    expect(isTransitionEvent('invoice.pdf_generated')).toBe(false);
    expect(isTransitionEvent('invoice.payment_due_soon')).toBe(false);
    expect(isTransitionEvent('invoice.payment_overdue')).toBe(false);
  });
});

describe('isInformationalEvent', () => {
  it('returns true for informational events', () => {
    expect(isInformationalEvent('invoice.pdf_generated')).toBe(true);
    expect(isInformationalEvent('invoice.payment_due_soon')).toBe(true);
    expect(isInformationalEvent('invoice.payment_overdue')).toBe(true);
  });

  it('returns false for transition events', () => {
    expect(isInformationalEvent('invoice.sign_requested')).toBe(false);
    expect(isInformationalEvent('invoice.stamp_succeeded')).toBe(false);
    expect(isInformationalEvent('invoice.cancelled')).toBe(false);
  });
});

// ============================================================================
// Re-export Tests
// ============================================================================

describe('Re-exports from Component 12', () => {
  it('re-exports InvoiceStatus', () => {
    expect(InvoiceStatus.DRAFT).toBeDefined();
    expect(InvoiceStatus.STAMPED).toBeDefined();
  });
});
