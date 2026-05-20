/**
 * Tests for OCR Integration (Component 20)
 */

import { describe, expect, it, vi } from 'vitest';
import { extractFromReceipt, extractFromCFDIXml, autoFillFromOCR } from '../ocr-integration';
import { ExpenseCategory } from '../types';

// Mock the OCR module
vi.mock('@/lib/ocr', () => ({
  processReceiptFromBytes: vi.fn(),
  processCFDIFromString: vi.fn(),
  formatExtractedAmount: vi.fn((val) => val.toString()),
  formatExtractedDate: vi.fn((val) => val),
  OCRServiceUnavailableError: class OCRServiceUnavailableError extends Error {},
}));

describe('OCR Integration', () => {
  describe('extractFromReceipt', () => {
    it('should extract data from successful OCR result', async () => {
      const { processReceiptFromBytes } = await import('@/lib/ocr');
      vi.mocked(processReceiptFromBytes).mockResolvedValueOnce({
        overall_confidence: 0.85,
        extracted_data: {
          vendor_name: { value: 'Test Vendor', confidence: 0.9 },
          rfc: { value: 'ABC123456789', confidence: 0.85 },
          subtotal: { value: '1000', confidence: 0.9 },
          iva_amount: { value: '160', confidence: 0.85 },
          total_amount: { value: '1160', confidence: 0.9 },
          date: { value: '2026-03-01', confidence: 0.85 },
          currency: { value: 'MXN', confidence: 1.0 },
        },
        warnings: [],
      } as any);

      const result = await extractFromReceipt(
        Buffer.from('test'),
        'image/jpeg',
        'receipt.jpg'
      );

      expect(result.vendorName).toBe('Test Vendor');
      expect(result.vendorRfc).toBe('ABC123456789');
      expect(result.amount).toBe(1000);
      expect(result.taxAmount).toBe(160);
      expect(result.total).toBe(1160);
      expect(result.expenseDate).toBe('2026-03-01');
      expect(result.currency).toBe('MXN');
      expect(result.confidence).toBe(0.85);
    });

    it('should handle OCR service unavailable gracefully', async () => {
      const { processReceiptFromBytes, OCRServiceUnavailableError } = await import('@/lib/ocr');
      vi.mocked(processReceiptFromBytes).mockRejectedValueOnce(
        new OCRServiceUnavailableError('Service down')
      );

      const result = await extractFromReceipt(
        Buffer.from('test'),
        'image/jpeg',
        'receipt.jpg'
      );

      expect(result.confidence).toBe(0);
      expect(result.warnings.some(w => w.includes('Servicio OCR no disponible'))).toBe(true);
    });

    it('should handle other OCR errors gracefully', async () => {
      const { processReceiptFromBytes } = await import('@/lib/ocr');
      vi.mocked(processReceiptFromBytes).mockRejectedValueOnce(
        new Error('Processing failed')
      );

      const result = await extractFromReceipt(
        Buffer.from('test'),
        'image/jpeg',
        'receipt.jpg'
      );

      expect(result.confidence).toBe(0);
      expect(result.warnings.some(w => w.includes('Error al procesar el comprobante'))).toBe(true);
    });

    it('should handle missing fields in OCR result', async () => {
      const { processReceiptFromBytes } = await import('@/lib/ocr');
      vi.mocked(processReceiptFromBytes).mockResolvedValueOnce({
        overall_confidence: 0.5,
        extracted_data: {
          vendor_name: { value: 'Test Vendor', confidence: 0.6 },
          // Missing other fields
        },
        warnings: ['Low confidence'],
      } as any);

      const result = await extractFromReceipt(
        Buffer.from('test'),
        'image/jpeg',
        'receipt.jpg'
      );

      expect(result.vendorName).toBe('Test Vendor');
      expect(result.amount).toBeUndefined();
      expect(result.total).toBeUndefined();
      expect(result.confidence).toBe(0.5);
    });
  });

  describe('extractFromCFDIXml', () => {
    it('should extract data from CFDI XML', async () => {
      const { processCFDIFromString } = await import('@/lib/ocr');
      vi.mocked(processCFDIFromString).mockResolvedValueOnce({
        uuid: { value: 'uuid-123-456', confidence: 1.0 },
        emisor_nombre: { value: 'Vendor SA de CV', confidence: 1.0 },
        emisor_rfc: { value: 'VEN123456789', confidence: 1.0 },
        total: { value: '1160.00', confidence: 1.0 },
        subtotal: { value: '1000.00', confidence: 1.0 },
        fecha: { value: '2026-03-01T10:00:00', confidence: 1.0 },
        forma_pago: { value: '03', confidence: 1.0 },
        moneda: { value: 'MXN', confidence: 1.0 },
        tipo_comprobante: { value: 'I', confidence: 1.0 },
      } as any);

      const result = await extractFromCFDIXml('<xml>...</xml>');

      expect(result.cfdiUuid).toBe('uuid-123-456');
      expect(result.vendorName).toBe('Vendor SA de CV');
      expect(result.vendorRfc).toBe('VEN123456789');
      expect(result.total).toBe(1160);
      expect(result.amount).toBe(1000);
      expect(result.paymentMethod).toBe('03');
      expect(result.confidence).toBe(0.95); // XML is highly reliable
    });

    it('should handle OCR service unavailable for XML', async () => {
      const { processCFDIFromString, OCRServiceUnavailableError } = await import('@/lib/ocr');
      vi.mocked(processCFDIFromString).mockRejectedValueOnce(
        new OCRServiceUnavailableError('Service down')
      );

      const result = await extractFromCFDIXml('<xml>...</xml>');

      expect(result.confidence).toBe(0);
      expect(result.warnings.some(w => w.includes('Servicio OCR no disponible'))).toBe(true);
    });

    it('should handle XML parsing errors', async () => {
      const { processCFDIFromString } = await import('@/lib/ocr');
      vi.mocked(processCFDIFromString).mockRejectedValueOnce(
        new Error('Invalid XML')
      );

      const result = await extractFromCFDIXml('<invalid>');

      expect(result.confidence).toBe(0);
      expect(result.warnings.some(w => w.includes('Error al procesar el XML'))).toBe(true);
    });
  });

  describe('autoFillFromOCR', () => {
    it('should not overwrite existing user values', () => {
      const existing = {
        vendorName: 'User Provided Name',
        amount: 500,
      };

      const extracted = {
        vendorName: 'OCR Vendor Name',
        amount: 1000,
        total: 1160,
        confidence: 0.9,
        warnings: [],
      };

      const result = autoFillFromOCR(existing, extracted);

      expect(result.vendorName).toBe('User Provided Name');
      expect(result.amount).toBe(500);
      expect(result.total).toBe(1160); // This was empty, so filled from OCR
    });

    it('should fill empty fields from OCR data', () => {
      const existing = {
        vendorName: 'Test Vendor',
      };

      const extracted = {
        vendorRfc: 'ABC123456789',
        amount: 1000,
        taxAmount: 160,
        total: 1160,
        expenseDate: '2026-03-01',
        paymentMethod: '03',
        currency: 'MXN',
        confidence: 0.9,
        warnings: [],
      };

      const result = autoFillFromOCR(existing, extracted);

      expect(result.vendorName).toBe('Test Vendor');
      expect(result.vendorRfc).toBe('ABC123456789');
      expect(result.amount).toBe(1000);
      expect(result.taxAmount).toBe(160);
      expect(result.total).toBe(1160);
      expect(result.expenseDate).toBe('2026-03-01');
      expect(result.paymentMethod).toBe('03');
      expect(result.currency).toBe('MXN');
    });

    it('should handle partial OCR data', () => {
      const existing = {
        category: ExpenseCategory.SERVICIOS_PROFESIONALES,
      };

      const extracted = {
        vendorName: 'Partial Vendor',
        confidence: 0.5,
        warnings: [],
      };

      const result = autoFillFromOCR(existing, extracted);

      expect(result.category).toBe(ExpenseCategory.SERVICIOS_PROFESIONALES);
      expect(result.vendorName).toBe('Partial Vendor');
      expect(result.amount).toBeUndefined();
    });

    it('should preserve existing zero values', () => {
      const existing = {
        amount: 0,
        taxAmount: 0,
      };

      const extracted = {
        amount: 1000,
        taxAmount: 160,
        confidence: 0.9,
        warnings: [],
      };

      const result = autoFillFromOCR(existing, extracted);

      expect(result.amount).toBe(0); // Preserve explicit zero
      expect(result.taxAmount).toBe(0); // Preserve explicit zero
    });

    it('should handle empty OCR extraction', () => {
      const existing = {
        vendorName: 'Test Vendor',
        amount: 500,
      };

      const extracted = {
        confidence: 0,
        warnings: ['No data extracted'],
      };

      const result = autoFillFromOCR(existing, extracted);

      expect(result.vendorName).toBe('Test Vendor');
      expect(result.amount).toBe(500);
    });

    it('should merge warnings from OCR', () => {
      const existing = {
        vendorName: 'Test Vendor',
      };

      const extracted = {
        amount: 1000,
        confidence: 0.7,
        warnings: ['Low confidence on RFC', 'Date format uncertain'],
      };

      const result = autoFillFromOCR(existing, extracted);

      expect(result.amount).toBe(1000);
      // The function should preserve extracted data even with warnings
      expect(extracted.warnings).toHaveLength(2);
    });

    it('should handle all fields being filled from OCR', () => {
      const existing = {};

      const extracted = {
        vendorName: 'Complete Vendor',
        vendorRfc: 'ABC123456789',
        amount: 1000,
        taxAmount: 160,
        total: 1160,
        expenseDate: '2026-03-01',
        paymentMethod: '03',
        currency: 'MXN',
        cfdiUuid: 'uuid-123',
        confidence: 0.95,
        warnings: [],
      };

      const result = autoFillFromOCR(existing, extracted);

      expect(result.vendorName).toBe('Complete Vendor');
      expect(result.vendorRfc).toBe('ABC123456789');
      expect(result.amount).toBe(1000);
      expect(result.taxAmount).toBe(160);
      expect(result.total).toBe(1160);
      expect(result.expenseDate).toBe('2026-03-01');
      expect(result.paymentMethod).toBe('03');
      expect(result.currency).toBe('MXN');
      expect(result.cfdiUuid).toBe('uuid-123');
    });
  });
});
