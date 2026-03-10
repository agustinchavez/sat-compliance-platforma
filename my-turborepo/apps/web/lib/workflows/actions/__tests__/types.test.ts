/**
 * Tests for Action Handler Types (Component 17)
 *
 * Tests helper functions and type shapes for action handlers.
 */

import { describe, it, expect } from 'vitest';
import { successResult, failureResult } from '../types';
import type { ActionContext, ActionHandler } from '../types';

// ============================================================================
// successResult Tests
// ============================================================================

describe('successResult', () => {
  it('creates successful ActionResult without jobId', () => {
    const result = successResult('generate_pdf');

    expect(result.actionType).toBe('generate_pdf');
    expect(result.success).toBe(true);
    expect(result.jobId).toBeUndefined();
    expect(result.error).toBeUndefined();
    expect(result.executedAt).toBeDefined();
  });

  it('creates successful ActionResult with jobId', () => {
    const result = successResult('send_customer_email', 'job-123');

    expect(result.actionType).toBe('send_customer_email');
    expect(result.success).toBe(true);
    expect(result.jobId).toBe('job-123');
  });

  it('includes valid ISO timestamp', () => {
    const before = new Date().toISOString();
    const result = successResult('generate_pdf');
    const after = new Date().toISOString();

    expect(result.executedAt >= before).toBe(true);
    expect(result.executedAt <= after).toBe(true);
  });

  it('works with all action types', () => {
    const pdfResult = successResult('generate_pdf');
    const emailResult = successResult('send_customer_email');
    const notifyResult = successResult('send_team_notification');
    const scheduleResult = successResult('schedule_payment_reminder');
    const cancelResult = successResult('cancel_scheduled_reminders');

    expect(pdfResult.success).toBe(true);
    expect(emailResult.success).toBe(true);
    expect(notifyResult.success).toBe(true);
    expect(scheduleResult.success).toBe(true);
    expect(cancelResult.success).toBe(true);
  });
});

// ============================================================================
// failureResult Tests
// ============================================================================

describe('failureResult', () => {
  it('creates failed ActionResult with error message', () => {
    const result = failureResult('generate_pdf', 'PDF generation failed');

    expect(result.actionType).toBe('generate_pdf');
    expect(result.success).toBe(false);
    expect(result.error).toBe('PDF generation failed');
    expect(result.jobId).toBeUndefined();
    expect(result.executedAt).toBeDefined();
  });

  it('includes valid ISO timestamp', () => {
    const before = new Date().toISOString();
    const result = failureResult('send_customer_email', 'Email server down');
    const after = new Date().toISOString();

    expect(result.executedAt >= before).toBe(true);
    expect(result.executedAt <= after).toBe(true);
  });

  it('works with empty error message', () => {
    const result = failureResult('generate_pdf', '');

    expect(result.success).toBe(false);
    expect(result.error).toBe('');
  });

  it('works with all action types', () => {
    const pdfResult = failureResult('generate_pdf', 'error 1');
    const emailResult = failureResult('send_customer_email', 'error 2');
    const notifyResult = failureResult('send_team_notification', 'error 3');
    const scheduleResult = failureResult('schedule_payment_reminder', 'error 4');
    const cancelResult = failureResult('cancel_scheduled_reminders', 'error 5');

    expect(pdfResult.success).toBe(false);
    expect(emailResult.success).toBe(false);
    expect(notifyResult.success).toBe(false);
    expect(scheduleResult.success).toBe(false);
    expect(cancelResult.success).toBe(false);
  });
});

// ============================================================================
// Type Shape Tests
// ============================================================================

describe('ActionContext type', () => {
  it('has required fields', () => {
    const context: ActionContext = {
      invoiceId: 'inv-123',
      organizationId: 'org-456',
      language: 'es',
    };

    expect(context.invoiceId).toBe('inv-123');
    expect(context.organizationId).toBe('org-456');
    expect(context.language).toBe('es');
  });

  it('supports optional metadata', () => {
    const context: ActionContext = {
      invoiceId: 'inv-123',
      organizationId: 'org-456',
      language: 'en',
      metadata: { custom: 'value', count: 42 },
    };

    expect(context.metadata).toEqual({ custom: 'value', count: 42 });
  });

  it('supports both language options', () => {
    const spanishContext: ActionContext = {
      invoiceId: 'inv-123',
      organizationId: 'org-456',
      language: 'es',
    };

    const englishContext: ActionContext = {
      invoiceId: 'inv-123',
      organizationId: 'org-456',
      language: 'en',
    };

    expect(spanishContext.language).toBe('es');
    expect(englishContext.language).toBe('en');
  });
});

describe('ActionHandler interface', () => {
  it('can be implemented', async () => {
    const mockHandler: ActionHandler = {
      actionType: 'generate_pdf',
      execute: async (context: ActionContext) => {
        return successResult('generate_pdf', 'mock-job-id');
      },
    };

    const context: ActionContext = {
      invoiceId: 'inv-123',
      organizationId: 'org-456',
      language: 'es',
    };

    const result = await mockHandler.execute(context);

    expect(result.success).toBe(true);
    expect(result.actionType).toBe('generate_pdf');
  });

  it('can return failure results', async () => {
    const mockHandler: ActionHandler = {
      actionType: 'send_customer_email',
      execute: async (_context: ActionContext) => {
        return failureResult('send_customer_email', 'Mock failure');
      },
    };

    const context: ActionContext = {
      invoiceId: 'inv-123',
      organizationId: 'org-456',
      language: 'es',
    };

    const result = await mockHandler.execute(context);

    expect(result.success).toBe(false);
    expect(result.error).toBe('Mock failure');
  });
});
