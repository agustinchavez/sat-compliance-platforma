/**
 * Tests for Generate PDF Action (Component 17)
 *
 * Tests PDF generation action handler.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { executePDFAction, canGeneratePDF } from '../generate-pdf';

// ============================================================================
// Mocks
// ============================================================================

vi.mock('@/lib/invoices/generate-pdf', () => ({
  generateInvoicePDFAndStore: vi.fn(),
  checkPDFGenerationReady: vi.fn(),
}));

describe('executePDFAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns success result when PDF generation succeeds', async () => {
    const { generateInvoicePDFAndStore } = await import('@/lib/invoices/generate-pdf');
    vi.mocked(generateInvoicePDFAndStore).mockResolvedValue({
      url: 'https://cdn.example.com/invoice.pdf',
      r2Key: 'invoices/inv-123/invoice.pdf',
      uuid: 'ABC-DEF-123',
      pageCount: 1,
      generatedAt: new Date().toISOString(),
    });

    const result = await executePDFAction('inv-123', 'org-456', 'es');

    expect(result.success).toBe(true);
    expect(result.actionType).toBe('generate_pdf');
    expect(result.jobId).toBe('invoices/inv-123/invoice.pdf');
    expect(result.executedAt).toBeDefined();
  });

  it('calls generateInvoicePDFAndStore with correct parameters', async () => {
    const { generateInvoicePDFAndStore } = await import('@/lib/invoices/generate-pdf');
    vi.mocked(generateInvoicePDFAndStore).mockResolvedValue({
      url: 'https://cdn.example.com/invoice.pdf',
      r2Key: 'invoices/inv-123/invoice.pdf',
      uuid: 'ABC-DEF-123',
      pageCount: 1,
      generatedAt: new Date().toISOString(),
    });

    await executePDFAction('inv-123', 'org-456', 'es');

    expect(generateInvoicePDFAndStore).toHaveBeenCalledWith('inv-123', 'org-456', 'es');
  });

  it('passes English language when specified', async () => {
    const { generateInvoicePDFAndStore } = await import('@/lib/invoices/generate-pdf');
    vi.mocked(generateInvoicePDFAndStore).mockResolvedValue({
      url: 'https://cdn.example.com/invoice.pdf',
      r2Key: 'invoices/inv-123/invoice.pdf',
      uuid: 'ABC-DEF-123',
      pageCount: 1,
      generatedAt: new Date().toISOString(),
    });

    await executePDFAction('inv-123', 'org-456', 'en');

    expect(generateInvoicePDFAndStore).toHaveBeenCalledWith('inv-123', 'org-456', 'en');
  });

  it('defaults to Spanish language', async () => {
    const { generateInvoicePDFAndStore } = await import('@/lib/invoices/generate-pdf');
    vi.mocked(generateInvoicePDFAndStore).mockResolvedValue({
      url: 'https://cdn.example.com/invoice.pdf',
      r2Key: 'invoices/inv-123/invoice.pdf',
      uuid: 'ABC-DEF-123',
      pageCount: 1,
      generatedAt: new Date().toISOString(),
    });

    await executePDFAction('inv-123', 'org-456');

    expect(generateInvoicePDFAndStore).toHaveBeenCalledWith('inv-123', 'org-456', 'es');
  });

  it('returns failure result when PDF generation fails', async () => {
    const { generateInvoicePDFAndStore } = await import('@/lib/invoices/generate-pdf');
    vi.mocked(generateInvoicePDFAndStore).mockRejectedValue(
      new Error('R2 upload failed')
    );

    const result = await executePDFAction('inv-123', 'org-456', 'es');

    expect(result.success).toBe(false);
    expect(result.actionType).toBe('generate_pdf');
    expect(result.error).toBe('R2 upload failed');
    expect(result.executedAt).toBeDefined();
  });

  it('handles non-Error exceptions', async () => {
    const { generateInvoicePDFAndStore } = await import('@/lib/invoices/generate-pdf');
    vi.mocked(generateInvoicePDFAndStore).mockRejectedValue('String error');

    const result = await executePDFAction('inv-123', 'org-456', 'es');

    expect(result.success).toBe(false);
    expect(result.error).toBe('Unknown error');
  });
});

describe('canGeneratePDF', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns ready:true when PDF generation is ready', async () => {
    const { checkPDFGenerationReady } = await import('@/lib/invoices/generate-pdf');
    vi.mocked(checkPDFGenerationReady).mockResolvedValue({ ready: true });

    const result = await canGeneratePDF('inv-123', 'org-456');

    expect(result.ready).toBe(true);
    expect(result.reason).toBeUndefined();
  });

  it('returns ready:false with reason when not ready', async () => {
    const { checkPDFGenerationReady } = await import('@/lib/invoices/generate-pdf');
    vi.mocked(checkPDFGenerationReady).mockResolvedValue({
      ready: false,
      reason: 'Invoice is not stamped',
    });

    const result = await canGeneratePDF('inv-123', 'org-456');

    expect(result.ready).toBe(false);
    expect(result.reason).toBe('Invoice is not stamped');
  });

  it('handles errors gracefully', async () => {
    const { checkPDFGenerationReady } = await import('@/lib/invoices/generate-pdf');
    vi.mocked(checkPDFGenerationReady).mockRejectedValue(
      new Error('Database connection failed')
    );

    const result = await canGeneratePDF('inv-123', 'org-456');

    expect(result.ready).toBe(false);
    expect(result.reason).toBe('Database connection failed');
  });

  it('handles non-Error exceptions', async () => {
    const { checkPDFGenerationReady } = await import('@/lib/invoices/generate-pdf');
    vi.mocked(checkPDFGenerationReady).mockRejectedValue('String error');

    const result = await canGeneratePDF('inv-123', 'org-456');

    expect(result.ready).toBe(false);
    expect(result.reason).toBe('Unknown error');
  });
});
