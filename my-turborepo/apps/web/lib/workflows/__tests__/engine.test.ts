/**
 * Tests for Workflow Engine (Component 17)
 *
 * Tests the WorkflowEngine class, action execution, and audit logging.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WorkflowEngine, createWorkflowEngine } from '../engine';
import { InvoiceStatus } from '@/lib/invoices/types';
import type { WorkflowEvent, TransitionRule } from '../types';

// ============================================================================
// Mocks
// ============================================================================

// Mock action handlers
vi.mock('../actions', () => ({
  executePDFAction: vi.fn().mockResolvedValue({
    actionType: 'generate_pdf',
    success: true,
    executedAt: new Date().toISOString(),
  }),
  enqueueSendInvoiceEmail: vi.fn().mockResolvedValue({
    actionType: 'send_customer_email',
    success: true,
    jobId: 'email-job-123',
    executedAt: new Date().toISOString(),
  }),
  enqueueCancellationEmail: vi.fn().mockResolvedValue({
    actionType: 'send_customer_email',
    success: true,
    jobId: 'email-job-456',
    executedAt: new Date().toISOString(),
  }),
  notifyTeam: vi.fn().mockResolvedValue({
    actionType: 'send_team_notification',
    success: true,
    executedAt: new Date().toISOString(),
  }),
  buildStampSuccessMessage: vi.fn().mockReturnValue('Invoice stamped'),
  buildStampFailureMessage: vi.fn().mockReturnValue('Invoice stamp failed'),
  buildCancellationMessage: vi.fn().mockReturnValue('Invoice cancelled'),
  schedulePaymentReminders: vi.fn().mockResolvedValue([
    {
      actionType: 'schedule_payment_reminder',
      success: true,
      executedAt: new Date().toISOString(),
    },
  ]),
  cancelPaymentReminders: vi.fn().mockResolvedValue({
    actionType: 'cancel_scheduled_reminders',
    success: true,
    executedAt: new Date().toISOString(),
  }),
}));

// ============================================================================
// Helper to create mock Supabase client
// ============================================================================

function createMockSupabase(options: {
  invoiceData?: any;
  invoiceError?: any;
  logInsertData?: any;
  logInsertError?: any;
  notificationData?: any;
}) {
  const { invoiceData, invoiceError, logInsertData, logInsertError, notificationData } = options;

  return {
    from: vi.fn((table: string) => {
      if (table === 'invoices') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: invoiceData,
                  error: invoiceError,
                }),
              }),
              single: vi.fn().mockResolvedValue({
                data: notificationData,
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === 'workflow_logs') {
        return {
          insert: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: logInsertData,
                error: logInsertError,
              }),
            }),
          }),
        };
      }
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: null, error: null }),
            }),
          }),
        }),
      };
    }),
  };
}

// ============================================================================
// Test Setup
// ============================================================================

describe('WorkflowEngine', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ============================================================================
  // Constructor Tests
  // ============================================================================

  describe('constructor', () => {
    it('creates engine with custom Supabase client', () => {
      const mockClient = createMockSupabase({});
      const customEngine = createWorkflowEngine(mockClient as any);

      expect(customEngine).toBeInstanceOf(WorkflowEngine);
    });
  });

  // ============================================================================
  // validateTransition Tests
  // ============================================================================

  describe('validateTransition', () => {
    it('throws INVOICE_NOT_FOUND for missing invoice', async () => {
      const mockClient = createMockSupabase({
        invoiceData: null,
        invoiceError: { message: 'Not found' },
      });
      const engine = createWorkflowEngine(mockClient as any);

      const event: WorkflowEvent = {
        type: 'invoice.stamp_succeeded',
        invoiceId: 'inv-missing',
        organizationId: 'org-123',
        triggeredAt: new Date().toISOString(),
      };

      await expect(
        engine.validateTransition('inv-missing', 'org-123', event)
      ).rejects.toThrow('Invoice not found');
    });

    it('throws TERMINAL_STATE for cancelled invoice', async () => {
      const mockClient = createMockSupabase({
        invoiceData: { id: 'inv-123', status: InvoiceStatus.CANCELLED },
      });
      const engine = createWorkflowEngine(mockClient as any);

      const event: WorkflowEvent = {
        type: 'invoice.stamp_succeeded',
        invoiceId: 'inv-123',
        organizationId: 'org-123',
        triggeredAt: new Date().toISOString(),
      };

      await expect(
        engine.validateTransition('inv-123', 'org-123', event)
      ).rejects.toThrow('terminal state');
    });

    it('throws INVALID_EVENT for wrong event from status', async () => {
      const mockClient = createMockSupabase({
        invoiceData: { id: 'inv-123', status: InvoiceStatus.DRAFT },
      });
      const engine = createWorkflowEngine(mockClient as any);

      const event: WorkflowEvent = {
        type: 'invoice.stamp_succeeded', // Can't stamp_succeeded from DRAFT
        invoiceId: 'inv-123',
        organizationId: 'org-123',
        triggeredAt: new Date().toISOString(),
      };

      await expect(
        engine.validateTransition('inv-123', 'org-123', event)
      ).rejects.toThrow('Unknown event type');
    });

    it('returns rule for valid transition', async () => {
      const mockClient = createMockSupabase({
        invoiceData: {
          id: 'inv-123',
          status: InvoiceStatus.PENDING_STAMP,
          folio_number: 'A-001',
          receiver_name: 'Customer',
        },
      });
      const engine = createWorkflowEngine(mockClient as any);

      const event: WorkflowEvent = {
        type: 'invoice.stamp_succeeded',
        invoiceId: 'inv-123',
        organizationId: 'org-123',
        triggeredAt: new Date().toISOString(),
      };

      const result = await engine.validateTransition('inv-123', 'org-123', event);

      expect(result.currentStatus).toBe(InvoiceStatus.PENDING_STAMP);
      expect(result.rule.to).toBe(InvoiceStatus.STAMPED);
    });
  });

  // ============================================================================
  // triggerActions Tests
  // ============================================================================

  describe('triggerActions', () => {
    it('executes all actions in rule and returns results', async () => {
      const mockClient = createMockSupabase({});
      const engine = createWorkflowEngine(mockClient as any);

      const rule: TransitionRule = {
        from: InvoiceStatus.PENDING_STAMP,
        to: InvoiceStatus.STAMPED,
        trigger: 'invoice.stamp_succeeded',
        actions: ['generate_pdf', 'send_customer_email'],
      };

      const event: WorkflowEvent = {
        type: 'invoice.stamp_succeeded',
        invoiceId: 'inv-123',
        organizationId: 'org-123',
        triggeredAt: new Date().toISOString(),
      };

      const results = await engine.triggerActions(rule, event);

      expect(results.length).toBeGreaterThanOrEqual(2);
      expect(results.some((r) => r.actionType === 'generate_pdf')).toBe(true);
      expect(results.some((r) => r.actionType === 'send_customer_email')).toBe(true);
    });

    it('captures action failures without throwing', async () => {
      const { executePDFAction } = await import('../actions');
      vi.mocked(executePDFAction).mockRejectedValueOnce(new Error('PDF generation failed'));

      const mockClient = createMockSupabase({});
      const engine = createWorkflowEngine(mockClient as any);

      const rule: TransitionRule = {
        from: InvoiceStatus.PENDING_STAMP,
        to: InvoiceStatus.STAMPED,
        trigger: 'invoice.stamp_succeeded',
        actions: ['generate_pdf'],
      };

      const event: WorkflowEvent = {
        type: 'invoice.stamp_succeeded',
        invoiceId: 'inv-123',
        organizationId: 'org-123',
        triggeredAt: new Date().toISOString(),
      };

      // Should not throw
      const results = await engine.triggerActions(rule, event);

      // Should have captured the failure
      const pdfResult = results.find((r) => r.actionType === 'generate_pdf');
      expect(pdfResult?.success).toBe(false);
      expect(pdfResult?.error).toBe('PDF generation failed');
    });

    it('continues executing remaining actions after failure', async () => {
      const { executePDFAction, enqueueSendInvoiceEmail } = await import('../actions');
      vi.mocked(executePDFAction).mockRejectedValueOnce(new Error('PDF failed'));

      const mockClient = createMockSupabase({});
      const engine = createWorkflowEngine(mockClient as any);

      const rule: TransitionRule = {
        from: InvoiceStatus.PENDING_STAMP,
        to: InvoiceStatus.STAMPED,
        trigger: 'invoice.stamp_succeeded',
        actions: ['generate_pdf', 'send_customer_email'],
      };

      const event: WorkflowEvent = {
        type: 'invoice.stamp_succeeded',
        invoiceId: 'inv-123',
        organizationId: 'org-123',
        triggeredAt: new Date().toISOString(),
      };

      const results = await engine.triggerActions(rule, event);

      // PDF should have failed
      const pdfResult = results.find((r) => r.actionType === 'generate_pdf');
      expect(pdfResult?.success).toBe(false);

      // Email should still have been called
      expect(enqueueSendInvoiceEmail).toHaveBeenCalled();
    });

    it('returns empty array for rules with no actions', async () => {
      const mockClient = createMockSupabase({});
      const engine = createWorkflowEngine(mockClient as any);

      const rule: TransitionRule = {
        from: InvoiceStatus.DRAFT,
        to: InvoiceStatus.PENDING_STAMP,
        trigger: 'invoice.sign_requested',
        actions: [],
      };

      const event: WorkflowEvent = {
        type: 'invoice.sign_requested',
        invoiceId: 'inv-123',
        organizationId: 'org-123',
        triggeredAt: new Date().toISOString(),
      };

      const results = await engine.triggerActions(rule, event);

      expect(results).toEqual([]);
    });
  });

  // ============================================================================
  // executeWorkflow Tests
  // ============================================================================

  describe('executeWorkflow', () => {
    it('executes workflow successfully for valid event', async () => {
      const mockClient = createMockSupabase({
        invoiceData: {
          id: 'inv-123',
          status: InvoiceStatus.PENDING_STAMP,
          folio_number: 'A-001',
          receiver_name: 'Customer',
        },
        logInsertData: {
          id: 'log-123',
          invoice_id: 'inv-123',
          organization_id: 'org-123',
          event_type: 'invoice.stamp_succeeded',
          from_status: InvoiceStatus.PENDING_STAMP,
          to_status: InvoiceStatus.STAMPED,
          actions_triggered: ['generate_pdf'],
          action_results: [],
          success: true,
          error_message: null,
          metadata: {},
          created_at: new Date().toISOString(),
        },
        notificationData: { folio_number: 'A-001', receiver_name: 'Customer' },
      });
      const engine = createWorkflowEngine(mockClient as any);

      const event: WorkflowEvent = {
        type: 'invoice.stamp_succeeded',
        invoiceId: 'inv-123',
        organizationId: 'org-123',
        triggeredAt: new Date().toISOString(),
      };

      const log = await engine.executeWorkflow(event);

      expect(log.success).toBe(true);
      expect(log.eventType).toBe('invoice.stamp_succeeded');
    });

    it('logs failure when transition is invalid', async () => {
      const mockClient = createMockSupabase({
        invoiceData: null,
        invoiceError: { message: 'Not found' },
        logInsertData: {
          id: 'log-456',
          invoice_id: 'inv-missing',
          organization_id: 'org-123',
          event_type: 'invoice.stamp_succeeded',
          success: false,
          error_message: 'Invoice not found: inv-missing',
          created_at: new Date().toISOString(),
        },
      });
      const engine = createWorkflowEngine(mockClient as any);

      const event: WorkflowEvent = {
        type: 'invoice.stamp_succeeded',
        invoiceId: 'inv-missing',
        organizationId: 'org-123',
        triggeredAt: new Date().toISOString(),
      };

      await expect(engine.executeWorkflow(event)).rejects.toThrow();
    });

    it('includes action results in log entry', async () => {
      const mockClient = createMockSupabase({
        invoiceData: {
          id: 'inv-123',
          status: InvoiceStatus.PENDING_STAMP,
          folio_number: 'A-001',
          receiver_name: 'Customer',
        },
        logInsertData: {
          id: 'log-123',
          invoice_id: 'inv-123',
          organization_id: 'org-123',
          event_type: 'invoice.stamp_succeeded',
          from_status: InvoiceStatus.PENDING_STAMP,
          to_status: InvoiceStatus.STAMPED,
          actions_triggered: ['generate_pdf', 'send_customer_email'],
          action_results: [
            { actionType: 'generate_pdf', success: true },
            { actionType: 'send_customer_email', success: true },
          ],
          success: true,
          error_message: null,
          metadata: {},
          created_at: new Date().toISOString(),
        },
        notificationData: { folio_number: 'A-001', receiver_name: 'Customer' },
      });
      const engine = createWorkflowEngine(mockClient as any);

      const event: WorkflowEvent = {
        type: 'invoice.stamp_succeeded',
        invoiceId: 'inv-123',
        organizationId: 'org-123',
        triggeredAt: new Date().toISOString(),
      };

      const log = await engine.executeWorkflow(event);

      expect(log.actionsTriggered.length).toBeGreaterThan(0);
      expect(log.actionResults.length).toBeGreaterThan(0);
    });
  });

  // ============================================================================
  // Action Routing Tests
  // ============================================================================

  describe('Action routing', () => {
    it('calls generate_pdf action for stamp_succeeded', async () => {
      const mockClient = createMockSupabase({
        invoiceData: {
          id: 'inv-123',
          status: InvoiceStatus.PENDING_STAMP,
          folio_number: 'A-001',
          receiver_name: 'Customer',
        },
        logInsertData: {
          id: 'log-123',
          invoice_id: 'inv-123',
          success: true,
          created_at: new Date().toISOString(),
        },
        notificationData: { folio_number: 'A-001', receiver_name: 'Customer' },
      });
      const engine = createWorkflowEngine(mockClient as any);
      const { executePDFAction } = await import('../actions');

      const event: WorkflowEvent = {
        type: 'invoice.stamp_succeeded',
        invoiceId: 'inv-123',
        organizationId: 'org-123',
        triggeredAt: new Date().toISOString(),
      };

      await engine.executeWorkflow(event);

      expect(executePDFAction).toHaveBeenCalledWith('inv-123', 'org-123', 'es');
    });

    it('calls enqueueSendInvoiceEmail for stamp_succeeded', async () => {
      const mockClient = createMockSupabase({
        invoiceData: {
          id: 'inv-123',
          status: InvoiceStatus.PENDING_STAMP,
          folio_number: 'A-001',
          receiver_name: 'Customer',
        },
        logInsertData: {
          id: 'log-123',
          invoice_id: 'inv-123',
          success: true,
          created_at: new Date().toISOString(),
        },
        notificationData: { folio_number: 'A-001', receiver_name: 'Customer' },
      });
      const engine = createWorkflowEngine(mockClient as any);
      const { enqueueSendInvoiceEmail } = await import('../actions');

      const event: WorkflowEvent = {
        type: 'invoice.stamp_succeeded',
        invoiceId: 'inv-123',
        organizationId: 'org-123',
        triggeredAt: new Date().toISOString(),
      };

      await engine.executeWorkflow(event);

      expect(enqueueSendInvoiceEmail).toHaveBeenCalledWith('inv-123', 'org-123', 'es');
    });

    it('calls schedulePaymentReminders for stamp_succeeded', async () => {
      const mockClient = createMockSupabase({
        invoiceData: {
          id: 'inv-123',
          status: InvoiceStatus.PENDING_STAMP,
          folio_number: 'A-001',
          receiver_name: 'Customer',
        },
        logInsertData: {
          id: 'log-123',
          invoice_id: 'inv-123',
          success: true,
          created_at: new Date().toISOString(),
        },
        notificationData: { folio_number: 'A-001', receiver_name: 'Customer' },
      });
      const engine = createWorkflowEngine(mockClient as any);
      const { schedulePaymentReminders } = await import('../actions');

      const event: WorkflowEvent = {
        type: 'invoice.stamp_succeeded',
        invoiceId: 'inv-123',
        organizationId: 'org-123',
        triggeredAt: new Date().toISOString(),
      };

      await engine.executeWorkflow(event);

      expect(schedulePaymentReminders).toHaveBeenCalledWith('inv-123', 'org-123');
    });

    it('respects language metadata', async () => {
      const mockClient = createMockSupabase({
        invoiceData: {
          id: 'inv-123',
          status: InvoiceStatus.PENDING_STAMP,
          folio_number: 'A-001',
          receiver_name: 'Customer',
        },
        logInsertData: {
          id: 'log-123',
          invoice_id: 'inv-123',
          success: true,
          created_at: new Date().toISOString(),
        },
        notificationData: { folio_number: 'A-001', receiver_name: 'Customer' },
      });
      const engine = createWorkflowEngine(mockClient as any);
      const { executePDFAction } = await import('../actions');

      const event: WorkflowEvent = {
        type: 'invoice.stamp_succeeded',
        invoiceId: 'inv-123',
        organizationId: 'org-123',
        triggeredAt: new Date().toISOString(),
        metadata: { language: 'en' },
      };

      await engine.executeWorkflow(event);

      expect(executePDFAction).toHaveBeenCalledWith('inv-123', 'org-123', 'en');
    });
  });

  // ============================================================================
  // Cancellation Workflow Tests
  // ============================================================================

  describe('Cancellation workflow', () => {
    it('calls cancelPaymentReminders for cancelled event', async () => {
      const mockClient = createMockSupabase({
        invoiceData: {
          id: 'inv-123',
          status: InvoiceStatus.STAMPED,
          folio_number: 'A-001',
          receiver_name: 'Customer',
        },
        logInsertData: {
          id: 'log-123',
          invoice_id: 'inv-123',
          success: true,
          created_at: new Date().toISOString(),
        },
        notificationData: {
          folio_number: 'A-001',
          receiver_name: 'Customer',
          cancellation_reason: '02',
        },
      });
      const engine = createWorkflowEngine(mockClient as any);
      const { cancelPaymentReminders } = await import('../actions');

      const event: WorkflowEvent = {
        type: 'invoice.cancelled',
        invoiceId: 'inv-123',
        organizationId: 'org-123',
        triggeredAt: new Date().toISOString(),
        metadata: { motivo: '02' },
      };

      await engine.executeWorkflow(event);

      expect(cancelPaymentReminders).toHaveBeenCalledWith('inv-123');
    });

    it('calls enqueueCancellationEmail for cancelled event', async () => {
      const mockClient = createMockSupabase({
        invoiceData: {
          id: 'inv-123',
          status: InvoiceStatus.STAMPED,
          folio_number: 'A-001',
          receiver_name: 'Customer',
        },
        logInsertData: {
          id: 'log-123',
          invoice_id: 'inv-123',
          success: true,
          created_at: new Date().toISOString(),
        },
        notificationData: {
          folio_number: 'A-001',
          receiver_name: 'Customer',
          cancellation_reason: '02',
        },
      });
      const engine = createWorkflowEngine(mockClient as any);
      const { enqueueCancellationEmail } = await import('../actions');

      const event: WorkflowEvent = {
        type: 'invoice.cancelled',
        invoiceId: 'inv-123',
        organizationId: 'org-123',
        triggeredAt: new Date().toISOString(),
      };

      await engine.executeWorkflow(event);

      expect(enqueueCancellationEmail).toHaveBeenCalledWith('inv-123', 'org-123', 'es');
    });
  });

  // ============================================================================
  // Log Persistence Tests
  // ============================================================================

  describe('Log persistence', () => {
    it('persists log entry on success', async () => {
      const mockClient = createMockSupabase({
        invoiceData: {
          id: 'inv-123',
          status: InvoiceStatus.DRAFT,
          folio_number: 'A-001',
          receiver_name: 'Customer',
        },
        logInsertData: {
          id: 'log-123',
          invoice_id: 'inv-123',
          organization_id: 'org-123',
          event_type: 'invoice.sign_requested',
          from_status: InvoiceStatus.DRAFT,
          to_status: InvoiceStatus.PENDING_STAMP,
          actions_triggered: [],
          action_results: [],
          success: true,
          error_message: null,
          metadata: {},
          created_at: new Date().toISOString(),
        },
      });
      const engine = createWorkflowEngine(mockClient as any);

      const event: WorkflowEvent = {
        type: 'invoice.sign_requested',
        invoiceId: 'inv-123',
        organizationId: 'org-123',
        triggeredAt: new Date().toISOString(),
      };

      const log = await engine.executeWorkflow(event);

      expect(log.id).toBe('log-123');
      expect(mockClient.from).toHaveBeenCalledWith('workflow_logs');
    });

    it('returns synthetic log entry when persistence fails', async () => {
      const mockClient = createMockSupabase({
        invoiceData: {
          id: 'inv-123',
          status: InvoiceStatus.DRAFT,
        },
        logInsertError: { message: 'Database error' },
      });
      const engine = createWorkflowEngine(mockClient as any);

      const event: WorkflowEvent = {
        type: 'invoice.sign_requested',
        invoiceId: 'inv-123',
        organizationId: 'org-123',
        triggeredAt: new Date().toISOString(),
      };

      const log = await engine.executeWorkflow(event);

      // Should return synthetic log instead of throwing
      expect(log.id).toBe('failed-to-persist');
      expect(log.success).toBe(true);
    });
  });
});

// ============================================================================
// Factory Function Tests
// ============================================================================

describe('createWorkflowEngine', () => {
  it('creates WorkflowEngine instance', () => {
    const mockClient = createMockSupabase({});
    const engine = createWorkflowEngine(mockClient as any);

    expect(engine).toBeInstanceOf(WorkflowEngine);
  });
});
