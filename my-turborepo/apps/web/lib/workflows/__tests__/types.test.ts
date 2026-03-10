/**
 * Tests for Workflow Types (Component 17)
 *
 * Tests type guards and constants for the workflow engine.
 */

import { describe, it, expect } from 'vitest';
import {
  isWorkflowEventType,
  isActionType,
  isReminderType,
  isEmailTemplateId,
} from '../types';
import type {
  WorkflowEvent,
  WorkflowAction,
  ActionResult,
  TransitionRule,
  WorkflowLogEntry,
  StampJobPayload,
  ReminderJobPayload,
  EmailJobPayload,
  ProcessingStatusResult,
} from '../types';
import { InvoiceStatus } from '@/lib/invoices/types';

// ============================================================================
// Type Guard Tests
// ============================================================================

describe('isWorkflowEventType', () => {
  describe('Valid event types', () => {
    it('returns true for invoice.sign_requested', () => {
      expect(isWorkflowEventType('invoice.sign_requested')).toBe(true);
    });

    it('returns true for invoice.stamp_succeeded', () => {
      expect(isWorkflowEventType('invoice.stamp_succeeded')).toBe(true);
    });

    it('returns true for invoice.stamp_failed', () => {
      expect(isWorkflowEventType('invoice.stamp_failed')).toBe(true);
    });

    it('returns true for invoice.pdf_generated', () => {
      expect(isWorkflowEventType('invoice.pdf_generated')).toBe(true);
    });

    it('returns true for invoice.cancelled', () => {
      expect(isWorkflowEventType('invoice.cancelled')).toBe(true);
    });

    it('returns true for invoice.payment_due_soon', () => {
      expect(isWorkflowEventType('invoice.payment_due_soon')).toBe(true);
    });

    it('returns true for invoice.payment_overdue', () => {
      expect(isWorkflowEventType('invoice.payment_overdue')).toBe(true);
    });
  });

  describe('Invalid event types', () => {
    it('returns false for empty string', () => {
      expect(isWorkflowEventType('')).toBe(false);
    });

    it('returns false for unknown event', () => {
      expect(isWorkflowEventType('invoice.unknown')).toBe(false);
    });

    it('returns false for partial match', () => {
      expect(isWorkflowEventType('sign_requested')).toBe(false);
    });

    it('returns false for case mismatch', () => {
      expect(isWorkflowEventType('Invoice.Stamp_Succeeded')).toBe(false);
    });
  });
});

describe('isActionType', () => {
  describe('Valid action types', () => {
    it('returns true for send_customer_email', () => {
      expect(isActionType('send_customer_email')).toBe(true);
    });

    it('returns true for send_team_notification', () => {
      expect(isActionType('send_team_notification')).toBe(true);
    });

    it('returns true for generate_pdf', () => {
      expect(isActionType('generate_pdf')).toBe(true);
    });

    it('returns true for schedule_payment_reminder', () => {
      expect(isActionType('schedule_payment_reminder')).toBe(true);
    });

    it('returns true for cancel_scheduled_reminders', () => {
      expect(isActionType('cancel_scheduled_reminders')).toBe(true);
    });
  });

  describe('Invalid action types', () => {
    it('returns false for empty string', () => {
      expect(isActionType('')).toBe(false);
    });

    it('returns false for unknown action', () => {
      expect(isActionType('send_sms')).toBe(false);
    });

    it('returns false for case mismatch', () => {
      expect(isActionType('Generate_PDF')).toBe(false);
    });
  });
});

describe('isReminderType', () => {
  describe('Valid reminder types', () => {
    it('returns true for due_soon', () => {
      expect(isReminderType('due_soon')).toBe(true);
    });

    it('returns true for due_today', () => {
      expect(isReminderType('due_today')).toBe(true);
    });

    it('returns true for overdue_7d', () => {
      expect(isReminderType('overdue_7d')).toBe(true);
    });

    it('returns true for overdue_30d', () => {
      expect(isReminderType('overdue_30d')).toBe(true);
    });
  });

  describe('Invalid reminder types', () => {
    it('returns false for empty string', () => {
      expect(isReminderType('')).toBe(false);
    });

    it('returns false for unknown type', () => {
      expect(isReminderType('overdue_60d')).toBe(false);
    });

    it('returns false for overdue without suffix', () => {
      expect(isReminderType('overdue')).toBe(false);
    });
  });
});

describe('isEmailTemplateId', () => {
  describe('Valid email template IDs', () => {
    it('returns true for invoice_sent', () => {
      expect(isEmailTemplateId('invoice_sent')).toBe(true);
    });

    it('returns true for payment_reminder', () => {
      expect(isEmailTemplateId('payment_reminder')).toBe(true);
    });

    it('returns true for payment_overdue', () => {
      expect(isEmailTemplateId('payment_overdue')).toBe(true);
    });

    it('returns true for cancellation_notice', () => {
      expect(isEmailTemplateId('cancellation_notice')).toBe(true);
    });
  });

  describe('Invalid email template IDs', () => {
    it('returns false for empty string', () => {
      expect(isEmailTemplateId('')).toBe(false);
    });

    it('returns false for unknown template', () => {
      expect(isEmailTemplateId('welcome_email')).toBe(false);
    });
  });
});

// ============================================================================
// Type Shape Tests (compile-time verification)
// ============================================================================

describe('Type shapes', () => {
  it('WorkflowEvent has required fields', () => {
    const event: WorkflowEvent = {
      type: 'invoice.stamp_succeeded',
      invoiceId: 'inv-123',
      organizationId: 'org-456',
      triggeredAt: new Date().toISOString(),
    };

    expect(event.type).toBeDefined();
    expect(event.invoiceId).toBeDefined();
    expect(event.organizationId).toBeDefined();
    expect(event.triggeredAt).toBeDefined();
  });

  it('WorkflowEvent supports optional metadata', () => {
    const event: WorkflowEvent = {
      type: 'invoice.stamp_succeeded',
      invoiceId: 'inv-123',
      organizationId: 'org-456',
      triggeredAt: new Date().toISOString(),
      metadata: { custom: 'value', count: 42 },
    };

    expect(event.metadata).toEqual({ custom: 'value', count: 42 });
  });

  it('ActionResult has required fields', () => {
    const result: ActionResult = {
      actionType: 'generate_pdf',
      success: true,
      executedAt: new Date().toISOString(),
    };

    expect(result.actionType).toBeDefined();
    expect(result.success).toBe(true);
    expect(result.executedAt).toBeDefined();
  });

  it('ActionResult supports optional jobId and error', () => {
    const successResult: ActionResult = {
      actionType: 'send_customer_email',
      success: true,
      jobId: 'job-123',
      executedAt: new Date().toISOString(),
    };

    const failureResult: ActionResult = {
      actionType: 'send_customer_email',
      success: false,
      error: 'Email server unavailable',
      executedAt: new Date().toISOString(),
    };

    expect(successResult.jobId).toBe('job-123');
    expect(failureResult.error).toBe('Email server unavailable');
  });

  it('TransitionRule defines valid transition structure', () => {
    const rule: TransitionRule = {
      from: InvoiceStatus.PENDING_STAMP,
      to: InvoiceStatus.STAMPED,
      trigger: 'invoice.stamp_succeeded',
      actions: ['generate_pdf', 'send_customer_email'],
    };

    expect(rule.from).toBe(InvoiceStatus.PENDING_STAMP);
    expect(rule.to).toBe(InvoiceStatus.STAMPED);
    expect(rule.trigger).toBe('invoice.stamp_succeeded');
    expect(rule.actions).toHaveLength(2);
  });

  it('WorkflowLogEntry has all audit fields', () => {
    const log: WorkflowLogEntry = {
      id: 'log-123',
      invoiceId: 'inv-456',
      organizationId: 'org-789',
      eventType: 'invoice.stamp_succeeded',
      fromStatus: InvoiceStatus.PENDING_STAMP,
      toStatus: InvoiceStatus.STAMPED,
      actionsTriggered: ['generate_pdf'],
      actionResults: [
        {
          actionType: 'generate_pdf',
          success: true,
          executedAt: new Date().toISOString(),
        },
      ],
      success: true,
      errorMessage: null,
      metadata: {},
      createdAt: new Date().toISOString(),
    };

    expect(log.id).toBeDefined();
    expect(log.invoiceId).toBeDefined();
    expect(log.fromStatus).toBe(InvoiceStatus.PENDING_STAMP);
    expect(log.toStatus).toBe(InvoiceStatus.STAMPED);
  });

  it('StampJobPayload has required fields', () => {
    const payload: StampJobPayload = {
      invoiceId: 'inv-123',
      organizationId: 'org-456',
      language: 'es',
      attemptNumber: 1,
    };

    expect(payload.invoiceId).toBeDefined();
    expect(payload.language).toBe('es');
    expect(payload.attemptNumber).toBe(1);
  });

  it('ReminderJobPayload has required fields', () => {
    const payload: ReminderJobPayload = {
      invoiceId: 'inv-123',
      organizationId: 'org-456',
      reminderType: 'due_soon',
      daysUntilDue: -1,
    };

    expect(payload.reminderType).toBe('due_soon');
    expect(payload.daysUntilDue).toBe(-1);
  });

  it('EmailJobPayload has required fields', () => {
    const payload: EmailJobPayload = {
      invoiceId: 'inv-123',
      organizationId: 'org-456',
      emailType: 'invoice_sent',
      recipientEmail: 'customer@example.com',
      recipientName: 'John Doe',
      language: 'es',
    };

    expect(payload.emailType).toBe('invoice_sent');
    expect(payload.recipientEmail).toBe('customer@example.com');
  });

  it('ProcessingStatusResult represents all states', () => {
    const waiting: ProcessingStatusResult = {
      status: 'waiting',
      jobId: 'job-123',
    };

    const active: ProcessingStatusResult = {
      status: 'active',
      jobId: 'job-123',
      progress: 50,
    };

    const completed: ProcessingStatusResult = {
      status: 'completed',
      jobId: 'job-123',
    };

    const failed: ProcessingStatusResult = {
      status: 'failed',
      jobId: 'job-123',
      failReason: 'PAC connection timeout',
    };

    const notFound: ProcessingStatusResult = {
      status: 'not_found',
    };

    expect(waiting.status).toBe('waiting');
    expect(active.progress).toBe(50);
    expect(completed.status).toBe('completed');
    expect(failed.failReason).toBe('PAC connection timeout');
    expect(notFound.status).toBe('not_found');
  });
});
