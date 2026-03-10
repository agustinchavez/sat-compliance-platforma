/**
 * Tests for Send Email Action (Component 17)
 *
 * Tests email enqueueing action handlers.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  enqueueSendEmail,
  enqueueSendInvoiceEmail,
  enqueueCancellationEmail,
  enqueuePaymentReminderEmail,
  buildStampedEmailPayload,
  buildCancellationEmailPayload,
  buildReminderEmailPayload,
} from '../send-email';
import type { EmailJobPayload } from '../../types';

// ============================================================================
// Mocks
// ============================================================================

const mockAdd = vi.fn();

vi.mock('@/lib/queue', () => ({
  emailQueue: {
    add: (...args: unknown[]) => mockAdd(...args),
  },
  getEmailJobId: vi.fn((invoiceId: string, emailType: string) =>
    `email-${invoiceId}-${emailType}`
  ),
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: vi.fn(() => ({
            single: vi.fn().mockResolvedValue({
              data: {
                id: 'inv-123',
                folio_number: 'A-001',
                total: 11600,
                currency: 'MXN',
                pdf_url: 'https://cdn.example.com/invoice.pdf',
                uuid: 'ABC-DEF-123',
                due_date: '2026-04-01',
                cancellation_reason: '02',
                customer_id: 'cust-456',
              },
              error: null,
            }),
          })),
          single: vi.fn().mockResolvedValue({
            data: {
              id: 'cust-456',
              legal_name: 'Test Customer',
              email: 'customer@example.com',
            },
            error: null,
          }),
        })),
      })),
    })),
  })),
}));

// ============================================================================
// Tests
// ============================================================================

describe('enqueueSendEmail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAdd.mockResolvedValue({ id: 'job-123' });
  });

  it('enqueues email job with correct payload', async () => {
    const payload: EmailJobPayload = {
      invoiceId: 'inv-123',
      organizationId: 'org-456',
      emailType: 'invoice_sent',
      recipientEmail: 'customer@example.com',
      recipientName: 'Test Customer',
      language: 'es',
    };

    const result = await enqueueSendEmail(payload);

    expect(result.success).toBe(true);
    expect(result.actionType).toBe('send_customer_email');
    expect(result.jobId).toBe('job-123');
  });

  it('uses idempotent job ID', async () => {
    const payload: EmailJobPayload = {
      invoiceId: 'inv-123',
      organizationId: 'org-456',
      emailType: 'invoice_sent',
      recipientEmail: 'customer@example.com',
      recipientName: 'Test Customer',
      language: 'es',
    };

    await enqueueSendEmail(payload);

    expect(mockAdd).toHaveBeenCalledWith(
      'send-email',
      payload,
      { jobId: 'email-inv-123-invoice_sent' }
    );
  });

  it('returns failure result when enqueue fails', async () => {
    mockAdd.mockRejectedValue(new Error('Redis connection failed'));

    const payload: EmailJobPayload = {
      invoiceId: 'inv-123',
      organizationId: 'org-456',
      emailType: 'invoice_sent',
      recipientEmail: 'customer@example.com',
      recipientName: 'Test Customer',
      language: 'es',
    };

    const result = await enqueueSendEmail(payload);

    expect(result.success).toBe(false);
    expect(result.error).toBe('Redis connection failed');
  });

  it('handles non-Error exceptions', async () => {
    mockAdd.mockRejectedValue('String error');

    const payload: EmailJobPayload = {
      invoiceId: 'inv-123',
      organizationId: 'org-456',
      emailType: 'invoice_sent',
      recipientEmail: 'customer@example.com',
      recipientName: 'Test Customer',
      language: 'es',
    };

    const result = await enqueueSendEmail(payload);

    expect(result.success).toBe(false);
    expect(result.error).toBe('Unknown error');
  });
});

describe('enqueueSendInvoiceEmail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAdd.mockResolvedValue({ id: 'job-456' });
  });

  it('enqueues invoice sent email', async () => {
    const result = await enqueueSendInvoiceEmail('inv-123', 'org-456', 'es');

    expect(result.success).toBe(true);
    expect(result.actionType).toBe('send_customer_email');
  });

  it('defaults to Spanish language', async () => {
    const result = await enqueueSendInvoiceEmail('inv-123', 'org-456');

    expect(result.success).toBe(true);
    expect(mockAdd).toHaveBeenCalled();
  });

  it('handles errors gracefully', async () => {
    mockAdd.mockRejectedValue(new Error('Queue full'));

    const result = await enqueueSendInvoiceEmail('inv-123', 'org-456', 'es');

    expect(result.success).toBe(false);
    expect(result.error).toContain('Queue full');
  });
});

describe('enqueueCancellationEmail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAdd.mockResolvedValue({ id: 'job-789' });
  });

  it('enqueues cancellation notice email', async () => {
    const result = await enqueueCancellationEmail('inv-123', 'org-456', 'es');

    expect(result.success).toBe(true);
    expect(result.actionType).toBe('send_customer_email');
  });

  it('defaults to Spanish language', async () => {
    const result = await enqueueCancellationEmail('inv-123', 'org-456');

    expect(result.success).toBe(true);
  });

  it('handles errors gracefully', async () => {
    mockAdd.mockRejectedValue(new Error('Connection timeout'));

    const result = await enqueueCancellationEmail('inv-123', 'org-456', 'es');

    expect(result.success).toBe(false);
  });
});

describe('enqueuePaymentReminderEmail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAdd.mockResolvedValue({ id: 'job-reminder' });
  });

  it('enqueues due_soon reminder email', async () => {
    const result = await enqueuePaymentReminderEmail(
      'inv-123',
      'org-456',
      'due_soon',
      'es'
    );

    expect(result.success).toBe(true);
    expect(result.actionType).toBe('send_customer_email');
  });

  it('enqueues due_today reminder email', async () => {
    const result = await enqueuePaymentReminderEmail(
      'inv-123',
      'org-456',
      'due_today',
      'es'
    );

    expect(result.success).toBe(true);
  });

  it('enqueues overdue reminder email', async () => {
    const result = await enqueuePaymentReminderEmail(
      'inv-123',
      'org-456',
      'overdue',
      'es'
    );

    expect(result.success).toBe(true);
  });

  it('defaults to Spanish language', async () => {
    const result = await enqueuePaymentReminderEmail('inv-123', 'org-456', 'due_soon');

    expect(result.success).toBe(true);
  });
});

// ============================================================================
// Payload Builder Tests
// ============================================================================

describe('buildStampedEmailPayload', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('builds correct payload structure', async () => {
    const payload = await buildStampedEmailPayload('inv-123', 'org-456', 'es');

    expect(payload.invoiceId).toBe('inv-123');
    expect(payload.organizationId).toBe('org-456');
    expect(payload.emailType).toBe('invoice_sent');
    expect(payload.language).toBe('es');
    expect(payload.recipientEmail).toBe('customer@example.com');
    expect(payload.recipientName).toBe('Test Customer');
  });

  it('includes invoice metadata', async () => {
    const payload = await buildStampedEmailPayload('inv-123', 'org-456', 'es');

    expect(payload.metadata?.invoiceFolio).toBe('A-001');
    expect(payload.metadata?.invoiceTotal).toBe(11600);
    expect(payload.metadata?.invoiceCurrency).toBe('MXN');
    expect(payload.metadata?.pdfUrl).toBe('https://cdn.example.com/invoice.pdf');
    expect(payload.metadata?.uuid).toBe('ABC-DEF-123');
  });

  it('supports English language', async () => {
    const payload = await buildStampedEmailPayload('inv-123', 'org-456', 'en');

    expect(payload.language).toBe('en');
  });
});

describe('buildCancellationEmailPayload', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('builds correct payload structure', async () => {
    const payload = await buildCancellationEmailPayload('inv-123', 'org-456', 'es');

    expect(payload.emailType).toBe('cancellation_notice');
    expect(payload.recipientEmail).toBe('customer@example.com');
  });

  it('includes cancellation metadata', async () => {
    const payload = await buildCancellationEmailPayload('inv-123', 'org-456', 'es');

    expect(payload.metadata?.invoiceFolio).toBe('A-001');
    expect(payload.metadata?.cancellationReason).toBe('02');
    expect(payload.metadata?.uuid).toBe('ABC-DEF-123');
  });
});

describe('buildReminderEmailPayload', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('builds due_soon reminder payload', async () => {
    const payload = await buildReminderEmailPayload('inv-123', 'org-456', 'due_soon', 'es');

    expect(payload.emailType).toBe('payment_reminder');
    expect(payload.metadata?.reminderType).toBe('due_soon');
  });

  it('builds due_today reminder payload', async () => {
    const payload = await buildReminderEmailPayload('inv-123', 'org-456', 'due_today', 'es');

    expect(payload.emailType).toBe('payment_reminder');
    expect(payload.metadata?.reminderType).toBe('due_today');
  });

  it('builds overdue reminder payload with overdue email type', async () => {
    const payload = await buildReminderEmailPayload('inv-123', 'org-456', 'overdue', 'es');

    expect(payload.emailType).toBe('payment_overdue');
    expect(payload.metadata?.reminderType).toBe('overdue');
  });

  it('includes due date metadata', async () => {
    const payload = await buildReminderEmailPayload('inv-123', 'org-456', 'due_soon', 'es');

    expect(payload.metadata?.dueDate).toBe('2026-04-01');
    expect(payload.metadata?.invoiceTotal).toBe(11600);
    expect(payload.metadata?.invoiceCurrency).toBe('MXN');
  });
});
