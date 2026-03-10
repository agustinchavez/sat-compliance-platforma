/**
 * PDF Service Tests (Component 16)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  VALID_STAMPED_INVOICE,
  VALID_INVOICE_STAMP,
  DRAFT_INVOICE,
  INVOICE_WITHOUT_XML,
  DEFAULT_BRANDING,
} from './fixtures/invoice-data';

// ============================================================================
// Mocks
// ============================================================================

const mockUploadToStorage = vi.fn();
const mockDownloadFromStorage = vi.fn();

vi.mock('@/lib/organizations/storage', () => ({
  uploadToStorage: (...args: unknown[]) => mockUploadToStorage(...args),
  downloadFromStorage: (...args: unknown[]) => mockDownloadFromStorage(...args),
}));

// Import after mocks
import {
  generateInvoicePDF,
  uploadPDF,
  generateAndStorePDF,
  canGenerateInvoicePDF,
  getPDFGenerationStatus,
  DEFAULT_BRANDING as SERVICE_DEFAULT_BRANDING,
} from '../service';
import { PDFError } from '../types';

// ============================================================================
// Setup
// ============================================================================

beforeEach(() => {
  vi.clearAllMocks();
  mockUploadToStorage.mockReset();
  mockDownloadFromStorage.mockReset();
});

// ============================================================================
// generateInvoicePDF Tests
// ============================================================================

describe('generateInvoicePDF', () => {
  it('should generate PDF buffer for valid stamped invoice', async () => {
    const result = await generateInvoicePDF(
      VALID_STAMPED_INVOICE,
      VALID_INVOICE_STAMP,
      DEFAULT_BRANDING
    );

    expect(result.buffer).toBeInstanceOf(Buffer);
    expect(result.buffer.length).toBeGreaterThan(0);
    expect(result.uuid).toBe('05c519de-6d20-4258-88fb-c69a5970e927');
    expect(result.pageCount).toBeGreaterThan(0);
    expect(result.generatedAt).toBeTruthy();
  });

  it('should generate PDF starting with %PDF', async () => {
    const result = await generateInvoicePDF(
      VALID_STAMPED_INVOICE,
      VALID_INVOICE_STAMP,
      DEFAULT_BRANDING
    );

    // PDF magic bytes: %PDF
    const header = result.buffer.slice(0, 4).toString();
    expect(header).toBe('%PDF');
  });

  it('should generate PDF of reasonable size', async () => {
    const result = await generateInvoicePDF(
      VALID_STAMPED_INVOICE,
      VALID_INVOICE_STAMP,
      DEFAULT_BRANDING
    );

    // Invoice PDFs are typically 10-100 KB
    expect(result.buffer.length).toBeGreaterThan(5000);
    expect(result.buffer.length).toBeLessThan(500000);
  });

  it('should throw PDFError for draft invoice', async () => {
    await expect(
      generateInvoicePDF(DRAFT_INVOICE, VALID_INVOICE_STAMP, DEFAULT_BRANDING)
    ).rejects.toThrow(PDFError);

    try {
      await generateInvoicePDF(DRAFT_INVOICE, VALID_INVOICE_STAMP, DEFAULT_BRANDING);
    } catch (error) {
      expect(error).toBeInstanceOf(PDFError);
      expect((error as PDFError).code).toBe('PDF_INVALID_INVOICE');
    }
  });

  it('should throw PDFError for invoice without XML', async () => {
    await expect(
      generateInvoicePDF(INVOICE_WITHOUT_XML, VALID_INVOICE_STAMP, DEFAULT_BRANDING)
    ).rejects.toThrow(PDFError);
  });

  it('should throw PDFError for missing stamp data', async () => {
    await expect(
      generateInvoicePDF(VALID_STAMPED_INVOICE, null as any, DEFAULT_BRANDING)
    ).rejects.toThrow(PDFError);
  });

  it('should use default branding when not provided', async () => {
    const result = await generateInvoicePDF(VALID_STAMPED_INVOICE, VALID_INVOICE_STAMP);

    expect(result.buffer).toBeInstanceOf(Buffer);
    expect(result.buffer.length).toBeGreaterThan(0);
  });

  it('should use company name from invoice if not in branding', async () => {
    const brandingWithoutName = { ...DEFAULT_BRANDING, companyName: '' };
    const result = await generateInvoicePDF(
      VALID_STAMPED_INVOICE,
      VALID_INVOICE_STAMP,
      brandingWithoutName
    );

    expect(result.buffer).toBeInstanceOf(Buffer);
  });

  it('should support Spanish language', async () => {
    const result = await generateInvoicePDF(
      VALID_STAMPED_INVOICE,
      VALID_INVOICE_STAMP,
      DEFAULT_BRANDING,
      { language: 'es' }
    );

    expect(result.buffer).toBeInstanceOf(Buffer);
  });

  it('should support English language', async () => {
    const result = await generateInvoicePDF(
      VALID_STAMPED_INVOICE,
      VALID_INVOICE_STAMP,
      DEFAULT_BRANDING,
      { language: 'en' }
    );

    expect(result.buffer).toBeInstanceOf(Buffer);
  });

  it('should support LETTER page size', async () => {
    const result = await generateInvoicePDF(
      VALID_STAMPED_INVOICE,
      VALID_INVOICE_STAMP,
      DEFAULT_BRANDING,
      { pageSize: 'LETTER' }
    );

    expect(result.buffer).toBeInstanceOf(Buffer);
  });

  it('should support A4 page size', async () => {
    const result = await generateInvoicePDF(
      VALID_STAMPED_INVOICE,
      VALID_INVOICE_STAMP,
      DEFAULT_BRANDING,
      { pageSize: 'A4' }
    );

    expect(result.buffer).toBeInstanceOf(Buffer);
  });

  it('should continue without logo if fetch fails', async () => {
    mockDownloadFromStorage.mockRejectedValue(new Error('Logo not found'));

    const brandingWithLogo = {
      ...DEFAULT_BRANDING,
      logoUrl: 'logos/test-logo.png',
      logoBuffer: null,
    };

    const result = await generateInvoicePDF(
      VALID_STAMPED_INVOICE,
      VALID_INVOICE_STAMP,
      brandingWithLogo
    );

    expect(result.buffer).toBeInstanceOf(Buffer);
  });
});

// ============================================================================
// uploadPDF Tests
// ============================================================================

describe('uploadPDF', () => {
  it('should upload PDF to R2 with correct key', async () => {
    const buffer = Buffer.from('%PDF-1.4 test pdf content');
    const orgId = 'org-001';
    const invoiceId = 'inv-001';
    const uuid = '05c519de-6d20-4258-88fb-c69a5970e927';

    mockUploadToStorage.mockResolvedValue({
      url: `https://r2.example.com/pdfs/${orgId}/${invoiceId}/${uuid}.pdf`,
    });

    const result = await uploadPDF(buffer, orgId, invoiceId, uuid);

    expect(mockUploadToStorage).toHaveBeenCalledWith(
      buffer,
      `pdfs/${orgId}/${invoiceId}/${uuid}.pdf`,
      expect.objectContaining({
        contentType: 'application/pdf',
        cacheControl: 'max-age=31536000',
      })
    );

    expect(result.url).toContain(uuid);
    expect(result.r2Key).toBe(`pdfs/${orgId}/${invoiceId}/${uuid}.pdf`);
  });

  it('should throw PDFError on upload failure', async () => {
    mockUploadToStorage.mockRejectedValue(new Error('Upload failed'));

    const buffer = Buffer.from('%PDF-1.4 test');
    await expect(uploadPDF(buffer, 'org-001', 'inv-001', 'uuid')).rejects.toThrow(PDFError);

    try {
      await uploadPDF(buffer, 'org-001', 'inv-001', 'uuid');
    } catch (error) {
      expect((error as PDFError).code).toBe('PDF_UPLOAD_FAILED');
    }
  });

  it('should include metadata in upload', async () => {
    const buffer = Buffer.from('%PDF-1.4 test');
    mockUploadToStorage.mockResolvedValue({ url: 'https://example.com/test.pdf' });

    await uploadPDF(buffer, 'org-001', 'inv-001', 'test-uuid');

    expect(mockUploadToStorage).toHaveBeenCalledWith(
      buffer,
      expect.any(String),
      expect.objectContaining({
        metadata: expect.objectContaining({
          invoiceId: 'inv-001',
          uuid: 'test-uuid',
        }),
      })
    );
  });
});

// ============================================================================
// generateAndStorePDF Tests
// ============================================================================

describe('generateAndStorePDF', () => {
  it('should generate and upload PDF', async () => {
    mockUploadToStorage.mockResolvedValue({
      url: 'https://r2.example.com/pdfs/test.pdf',
    });

    const result = await generateAndStorePDF(
      VALID_STAMPED_INVOICE,
      VALID_INVOICE_STAMP,
      'org-001',
      DEFAULT_BRANDING
    );

    expect(result.buffer).toBeInstanceOf(Buffer);
    expect(result.url).toBe('https://r2.example.com/pdfs/test.pdf');
    expect(result.r2Key).toContain('pdfs/org-001');
    expect(result.uuid).toBe('05c519de-6d20-4258-88fb-c69a5970e927');
    expect(mockUploadToStorage).toHaveBeenCalled();
  });

  it('should throw error if generation fails', async () => {
    await expect(
      generateAndStorePDF(DRAFT_INVOICE, VALID_INVOICE_STAMP, 'org-001', DEFAULT_BRANDING)
    ).rejects.toThrow(PDFError);

    expect(mockUploadToStorage).not.toHaveBeenCalled();
  });

  it('should throw error if upload fails', async () => {
    mockUploadToStorage.mockRejectedValue(new Error('Storage error'));

    await expect(
      generateAndStorePDF(
        VALID_STAMPED_INVOICE,
        VALID_INVOICE_STAMP,
        'org-001',
        DEFAULT_BRANDING
      )
    ).rejects.toThrow(PDFError);
  });
});

// ============================================================================
// canGenerateInvoicePDF Tests
// ============================================================================

describe('canGenerateInvoicePDF', () => {
  it('should return true for valid stamped invoice', () => {
    expect(canGenerateInvoicePDF(VALID_STAMPED_INVOICE)).toBe(true);
  });

  it('should return false for draft invoice', () => {
    expect(canGenerateInvoicePDF(DRAFT_INVOICE)).toBe(false);
  });

  it('should return false for invoice without XML', () => {
    expect(canGenerateInvoicePDF(INVOICE_WITHOUT_XML)).toBe(false);
  });

  it('should return false for invoice without items', () => {
    const noItems = { ...VALID_STAMPED_INVOICE, items: [] };
    expect(canGenerateInvoicePDF(noItems)).toBe(false);
  });
});

// ============================================================================
// getPDFGenerationStatus Tests
// ============================================================================

describe('getPDFGenerationStatus', () => {
  it('should return canGenerate: true for valid invoice', () => {
    const status = getPDFGenerationStatus(VALID_STAMPED_INVOICE);
    expect(status.canGenerate).toBe(true);
    expect(status.reason).toBeUndefined();
  });

  it('should return status error for draft invoice', () => {
    const status = getPDFGenerationStatus(DRAFT_INVOICE);
    expect(status.canGenerate).toBe(false);
    expect(status.reason).toContain('draft');
  });

  it('should return XML error for invoice without XML', () => {
    const status = getPDFGenerationStatus(INVOICE_WITHOUT_XML);
    expect(status.canGenerate).toBe(false);
    expect(status.reason).toContain('XML');
  });

  it('should return items error for invoice without items', () => {
    const noItems = { ...VALID_STAMPED_INVOICE, items: [] };
    const status = getPDFGenerationStatus(noItems);
    expect(status.canGenerate).toBe(false);
    expect(status.reason).toContain('items');
  });
});

// ============================================================================
// DEFAULT_BRANDING Tests
// ============================================================================

describe('DEFAULT_BRANDING', () => {
  it('should have required color properties', () => {
    expect(SERVICE_DEFAULT_BRANDING.primaryColor).toBe('#1E3A5F');
    expect(SERVICE_DEFAULT_BRANDING.secondaryColor).toBe('#EBF2FA');
  });

  it('should have null logo values', () => {
    expect(SERVICE_DEFAULT_BRANDING.logoUrl).toBeNull();
    expect(SERVICE_DEFAULT_BRANDING.logoBuffer).toBeNull();
  });

  it('should have empty company name', () => {
    expect(SERVICE_DEFAULT_BRANDING.companyName).toBe('');
  });
});
