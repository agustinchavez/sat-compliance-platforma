/**
 * Tests for Email Service Stub (Component 17/29)
 *
 * Tests the email service stub implementation.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  sendEmail,
  sendBulkEmails,
  getDefaultSubject,
  buildInvoiceSentEmailParams,
  buildPaymentReminderEmailParams,
  buildCancellationEmailParams,
  isEmailServiceConfigured,
  getEmailServiceInfo,
} from '../service';
import type { SendEmailParams } from '../service';

// ============================================================================
// Mock console.log
// ============================================================================

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

// ============================================================================
// sendEmail Tests
// ============================================================================

describe('sendEmail', () => {
  it('returns success for valid email params', async () => {
    const params: SendEmailParams = {
      to: 'customer@example.com',
      toName: 'John Doe',
      subject: 'Test Subject',
      templateId: 'invoice_sent',
      templateData: { name: 'John' },
      organizationId: 'org-123',
    };

    const result = await sendEmail(params);

    expect(result.success).toBe(true);
    expect(result.messageId).toBeDefined();
    expect(result.messageId).toContain('stub-');
  });

  it('generates unique message IDs', async () => {
    const params: SendEmailParams = {
      to: 'customer@example.com',
      toName: 'John',
      subject: 'Test',
      templateId: 'invoice_sent',
      templateData: {},
      organizationId: 'org-123',
    };

    const result1 = await sendEmail(params);
    const result2 = await sendEmail(params);

    expect(result1.messageId).not.toBe(result2.messageId);
  });

  it('handles all template types', async () => {
    const templates = [
      'invoice_sent',
      'payment_reminder',
      'payment_overdue',
      'cancellation_notice',
    ] as const;

    for (const templateId of templates) {
      const result = await sendEmail({
        to: 'test@example.com',
        toName: 'Test',
        subject: 'Test',
        templateId,
        templateData: {},
        organizationId: 'org-123',
      });

      expect(result.success).toBe(true);
    }
  });

  it('accepts optional attachments', async () => {
    const params: SendEmailParams = {
      to: 'customer@example.com',
      toName: 'John',
      subject: 'Invoice',
      templateId: 'invoice_sent',
      templateData: {},
      organizationId: 'org-123',
      attachments: [
        { filename: 'invoice.pdf', url: 'https://example.com/pdf', contentType: 'application/pdf' },
      ],
    };

    const result = await sendEmail(params);

    expect(result.success).toBe(true);
  });

  it('accepts optional invoiceId', async () => {
    const params: SendEmailParams = {
      to: 'customer@example.com',
      toName: 'John',
      subject: 'Factura',
      templateId: 'invoice_sent',
      templateData: {},
      organizationId: 'org-123',
      invoiceId: 'inv-456',
    };

    const result = await sendEmail(params);

    expect(result.success).toBe(true);
  });
});

// ============================================================================
// sendBulkEmails Tests
// ============================================================================

describe('sendBulkEmails', () => {
  it('sends multiple emails successfully', async () => {
    const emailList: SendEmailParams[] = [
      { to: 'a@example.com', toName: 'A', subject: 'Test 1', templateId: 'invoice_sent', templateData: {}, organizationId: 'org-1' },
      { to: 'b@example.com', toName: 'B', subject: 'Test 2', templateId: 'payment_reminder', templateData: {}, organizationId: 'org-1' },
      { to: 'c@example.com', toName: 'C', subject: 'Test 3', templateId: 'cancellation_notice', templateData: {}, organizationId: 'org-1' },
    ];

    const results = await sendBulkEmails(emailList);

    expect(results).toHaveLength(3);
    expect(results.every((r) => r.success)).toBe(true);
  });

  it('returns empty array for empty input', async () => {
    const results = await sendBulkEmails([]);

    expect(results).toEqual([]);
  });

  it('generates unique IDs for each email', async () => {
    const emailList: SendEmailParams[] = [
      { to: 'a@example.com', toName: 'A', subject: 'Test', templateId: 'invoice_sent', templateData: {}, organizationId: 'org-1' },
      { to: 'b@example.com', toName: 'B', subject: 'Test', templateId: 'invoice_sent', templateData: {}, organizationId: 'org-1' },
    ];

    const results = await sendBulkEmails(emailList);

    expect(results[0]!.messageId).not.toBe(results[1]!.messageId);
  });
});

// ============================================================================
// getDefaultSubject Tests
// ============================================================================

describe('getDefaultSubject', () => {
  describe('Spanish subjects', () => {
    it('returns correct subject for invoice_sent', () => {
      const subject = getDefaultSubject('invoice_sent', { invoiceFolio: 'A-001' }, 'es');

      expect(subject).toBe('Factura A-001 - Comprobante Fiscal Digital');
    });

    it('returns correct subject for payment_reminder', () => {
      const subject = getDefaultSubject('payment_reminder', { invoiceFolio: 'A-001' }, 'es');

      expect(subject).toBe('Recordatorio de pago - Factura A-001');
    });

    it('returns correct subject for payment_overdue', () => {
      const subject = getDefaultSubject('payment_overdue', { invoiceFolio: 'A-001' }, 'es');

      expect(subject).toBe('Pago vencido - Factura A-001');
    });

    it('returns correct subject for cancellation_notice', () => {
      const subject = getDefaultSubject('cancellation_notice', { invoiceFolio: 'A-001' }, 'es');

      expect(subject).toBe('Aviso de cancelación - Factura A-001');
    });
  });

  describe('English subjects', () => {
    it('returns correct subject for invoice_sent', () => {
      const subject = getDefaultSubject('invoice_sent', { invoiceFolio: 'A-001' }, 'en');

      expect(subject).toBe('Invoice A-001 - Digital Tax Receipt');
    });

    it('returns correct subject for payment_reminder', () => {
      const subject = getDefaultSubject('payment_reminder', { invoiceFolio: 'A-001' }, 'en');

      expect(subject).toBe('Payment Reminder - Invoice A-001');
    });

    it('returns correct subject for payment_overdue', () => {
      const subject = getDefaultSubject('payment_overdue', { invoiceFolio: 'A-001' }, 'en');

      expect(subject).toBe('Payment Overdue - Invoice A-001');
    });

    it('returns correct subject for cancellation_notice', () => {
      const subject = getDefaultSubject('cancellation_notice', { invoiceFolio: 'A-001' }, 'en');

      expect(subject).toBe('Cancellation Notice - Invoice A-001');
    });
  });

  it('defaults to Spanish when no language specified', () => {
    const subject = getDefaultSubject('invoice_sent', { invoiceFolio: 'A-001' });

    expect(subject).toBe('Factura A-001 - Comprobante Fiscal Digital');
  });

  it('handles missing invoiceFolio', () => {
    const subject = getDefaultSubject('invoice_sent', {}, 'es');

    expect(subject).toBe('Factura  - Comprobante Fiscal Digital');
  });
});

// ============================================================================
// buildInvoiceSentEmailParams Tests
// ============================================================================

describe('buildInvoiceSentEmailParams', () => {
  it('builds correct params structure', () => {
    const params = buildInvoiceSentEmailParams(
      'customer@example.com',
      'John Doe',
      'org-123',
      'inv-456',
      {
        invoiceFolio: 'A-001',
        invoiceTotal: 11600,
        invoiceCurrency: 'MXN',
        pdfUrl: 'https://cdn.example.com/invoice.pdf',
        uuid: 'ABC-DEF-123',
        issuerName: 'Test Company',
      },
      'es'
    );

    expect(params.to).toBe('customer@example.com');
    expect(params.toName).toBe('John Doe');
    expect(params.templateId).toBe('invoice_sent');
    expect(params.organizationId).toBe('org-123');
    expect(params.invoiceId).toBe('inv-456');
  });

  it('includes PDF attachment when pdfUrl provided', () => {
    const params = buildInvoiceSentEmailParams(
      'test@example.com',
      'Jane',
      'org-123',
      'inv-789',
      {
        invoiceFolio: 'B-002',
        invoiceTotal: 5000,
        invoiceCurrency: 'USD',
        pdfUrl: 'https://example.com/invoice.pdf',
        issuerName: 'Issuer',
      },
      'en'
    );

    expect(params.attachments).toHaveLength(1);
    expect(params.attachments![0]!.filename).toBe('factura-B-002.pdf');
    expect(params.attachments![0]!.contentType).toBe('application/pdf');
  });

  it('omits attachments when no pdfUrl', () => {
    const params = buildInvoiceSentEmailParams(
      'test@example.com',
      'Jane',
      'org-123',
      'inv-789',
      {
        invoiceFolio: 'A-001',
        invoiceTotal: 1000,
        invoiceCurrency: 'MXN',
        issuerName: 'Issuer',
      },
      'es'
    );

    expect(params.attachments).toHaveLength(0);
  });
});

// ============================================================================
// buildPaymentReminderEmailParams Tests
// ============================================================================

describe('buildPaymentReminderEmailParams', () => {
  it('builds params for upcoming reminder (positive days)', () => {
    const params = buildPaymentReminderEmailParams(
      'customer@example.com',
      'John',
      'org-123',
      'inv-456',
      {
        invoiceFolio: 'A-001',
        invoiceTotal: 5000,
        invoiceCurrency: 'MXN',
        dueDate: '2026-04-01',
        daysUntilDue: 3,
        issuerName: 'Issuer',
      },
      'es'
    );

    expect(params.templateId).toBe('payment_reminder');
    expect(params.subject).toContain('Recordatorio');
  });

  it('builds params for overdue reminder (negative days)', () => {
    const params = buildPaymentReminderEmailParams(
      'customer@example.com',
      'John',
      'org-123',
      'inv-456',
      {
        invoiceFolio: 'A-001',
        invoiceTotal: 5000,
        invoiceCurrency: 'MXN',
        dueDate: '2026-03-01',
        daysUntilDue: -5,
        issuerName: 'Issuer',
      },
      'es'
    );

    expect(params.templateId).toBe('payment_overdue');
    expect(params.subject).toContain('vencido');
  });

  it('includes due date in template data', () => {
    const params = buildPaymentReminderEmailParams(
      'test@example.com',
      'Jane',
      'org-123',
      'inv-789',
      {
        invoiceFolio: 'B-002',
        invoiceTotal: 3000,
        invoiceCurrency: 'MXN',
        dueDate: '2026-05-15',
        daysUntilDue: 10,
        issuerName: 'Issuer',
      },
      'es'
    );

    expect(params.templateData.dueDate).toBe('2026-05-15');
    expect(params.templateData.daysUntilDue).toBe(10);
  });
});

// ============================================================================
// buildCancellationEmailParams Tests
// ============================================================================

describe('buildCancellationEmailParams', () => {
  it('builds correct params structure', () => {
    const params = buildCancellationEmailParams(
      'customer@example.com',
      'John',
      'org-123',
      'inv-456',
      {
        invoiceFolio: 'A-001',
        cancellationReason: '02',
        uuid: 'ABC-123',
        issuerName: 'Issuer',
      },
      'es'
    );

    expect(params.templateId).toBe('cancellation_notice');
    expect(params.subject).toContain('cancelación');
    expect(params.templateData.cancellationReason).toBe('02');
  });

  it('uses English subject for English language', () => {
    const params = buildCancellationEmailParams(
      'customer@example.com',
      'John',
      'org-123',
      'inv-456',
      {
        invoiceFolio: 'A-001',
        cancellationReason: '02',
        issuerName: 'Issuer',
      },
      'en'
    );

    expect(params.subject).toContain('Cancellation');
  });
});

// ============================================================================
// Service Status Tests
// ============================================================================

describe('isEmailServiceConfigured', () => {
  it('returns true (stub is always configured)', () => {
    const configured = isEmailServiceConfigured();

    expect(configured).toBe(true);
  });
});

describe('getEmailServiceInfo', () => {
  it('returns stub service info', () => {
    const info = getEmailServiceInfo();

    expect(info.provider).toBe('stub');
    expect(info.configured).toBe(true);
  });
});
