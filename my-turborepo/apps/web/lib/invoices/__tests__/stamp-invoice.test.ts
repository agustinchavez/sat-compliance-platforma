/**
 * Invoice Stamping Bridge Tests (Component 15 - Step 9)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PACError } from '@/lib/pac/errors';
import type { Invoice } from '../types';

// ============================================================================
// Mocks - use vi.hoisted() for proper hoisting
// ============================================================================

const {
  mockStampCFDI,
  mockCancelCFDI,
  mockIsPACConfigured,
  mockGetPACInfo,
  mockExtractTFD,
} = vi.hoisted(() => ({
  mockStampCFDI: vi.fn(),
  mockCancelCFDI: vi.fn(),
  mockIsPACConfigured: vi.fn(),
  mockGetPACInfo: vi.fn(),
  mockExtractTFD: vi.fn(),
}));

vi.mock('@/lib/pac/service', () => ({
  stampCFDI: mockStampCFDI,
  cancelCFDI: mockCancelCFDI,
  isPACConfigured: mockIsPACConfigured,
  getPACInfo: mockGetPACInfo,
}));

vi.mock('@/lib/pac/tfd-parser', () => ({
  extractTFD: mockExtractTFD,
}));

// Import after mocks are set up
import {
  stampInvoice,
  cancelStampedInvoice,
  isStampingReady,
  getStampingStatus,
  isPACError,
  formatStampingError,
} from '../stamp-invoice';

// ============================================================================
// Test Fixtures
// ============================================================================

const VALID_INVOICE = {
  id: 'inv-uuid-123',
  organization_id: 'org-uuid-123',
  customer_id: 'cust-uuid-123',
  status: 'pending_stamp' as const,
  tipo_comprobante: 'I' as const,
  issue_date: '2024-03-01',
  issuer_rfc: 'ABC123456789',
  issuer_name: 'Test Company',
  issuer_tax_regime: '601',
  issuer_zip_code: '12345',
  receiver_rfc: 'XYZ987654321',
  receiver_name: 'Customer Inc',
  receiver_tax_regime: '601',
  receiver_zip_code: '67890',
  receiver_cfdi_use: 'G03',
  payment_method: 'PUE' as const,
  payment_form: '03',
  currency: 'MXN',
  exchange_rate: 1,
  exportacion: '01',
  subtotal: 10000,
  discount: 0,
  total_iva_trasladado: 1600,
  total_iva_retenido: 0,
  total_isr_retenido: 0,
  total: 11600,
  is_global: false,
  cfdi_xml: '<?xml version="1.0"?><cfdi:Comprobante Sello="ABC..." />',
  items: [],
  created_at: '2024-03-01T00:00:00Z',
  updated_at: '2024-03-01T00:00:00Z',
} as Invoice;

const STAMPED_INVOICE = {
  ...VALID_INVOICE,
  uuid: '05c519de-6d20-4258-88fb-c69a5970e927',
  status: 'stamped' as const,
} as Invoice;

const VALID_STAMP_RESULT = {
  stampedXml: '<?xml version="1.0"?><cfdi:Comprobante><tfd/></cfdi:Comprobante>',
  uuid: '05c519de-6d20-4258-88fb-c69a5970e927',
  fechaTimbrado: '2024-03-01T10:00:00',
  rfcProvCertif: 'SPR190613I52',
  selloCFD: 'SelloCFD123',
  noCertificadoSAT: '30001000000400002495',
  selloSAT: 'SelloSAT456',
  pacProvider: 'finkok',
};

const VALID_TFD_DATA = {
  uuid: '05c519de-6d20-4258-88fb-c69a5970e927',
  fechaTimbrado: '2024-03-01T10:00:00',
  rfcProvCertif: 'SPR190613I52',
  selloCFD: 'SelloCFD123',
  noCertificadoSAT: '30001000000400002495',
  selloSAT: 'SelloSAT456',
  version: '1.1',
};

// ============================================================================
// Setup
// ============================================================================

beforeEach(() => {
  vi.clearAllMocks();
  mockStampCFDI.mockReset();
  mockCancelCFDI.mockReset();
  mockIsPACConfigured.mockReset();
  mockGetPACInfo.mockReset();
  mockExtractTFD.mockReset();
});

// ============================================================================
// stampInvoice Tests
// ============================================================================

describe('stampInvoice', () => {
  it('should stamp invoice and return result', async () => {
    mockGetPACInfo.mockResolvedValue({ provider: 'finkok', environment: 'sandbox' });
    mockStampCFDI.mockResolvedValue(VALID_STAMP_RESULT);
    mockExtractTFD.mockReturnValue(VALID_TFD_DATA);

    const result = await stampInvoice(VALID_INVOICE, 'org-uuid-123');

    expect(result.uuid).toBe(VALID_STAMP_RESULT.uuid);
    expect(result.stampedXml).toBe(VALID_STAMP_RESULT.stampedXml);
    expect(result.fechaTimbrado).toBe(VALID_STAMP_RESULT.fechaTimbrado);
    expect(result.tfd).toEqual(VALID_TFD_DATA);
    expect(result.pacProvider).toBe('finkok');
    expect(result.environment).toBe('sandbox');
    expect(mockStampCFDI).toHaveBeenCalledWith({
      signedXml: VALID_INVOICE.cfdi_xml,
      issuerRfc: VALID_INVOICE.issuer_rfc,
      orgId: 'org-uuid-123',
    });
  });

  it('should throw PAC_INVALID_XML when invoice has no cfdi_xml', async () => {
    const invoiceWithoutXml = { ...VALID_INVOICE, cfdi_xml: undefined } as Invoice;

    try {
      await stampInvoice(invoiceWithoutXml, 'org-uuid-123');
      expect.fail('Should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(PACError);
      expect((error as PACError).code).toBe('PAC_INVALID_XML');
    }
  });

  it('should throw PAC_CREDENTIALS_NOT_FOUND when no PAC configured', async () => {
    mockGetPACInfo.mockResolvedValue(null);

    try {
      await stampInvoice(VALID_INVOICE, 'org-uuid-123');
      expect.fail('Should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(PACError);
      expect((error as PACError).code).toBe('PAC_CREDENTIALS_NOT_FOUND');
    }
  });

  it('should propagate PAC errors from stampCFDI', async () => {
    mockGetPACInfo.mockResolvedValue({ provider: 'finkok', environment: 'sandbox' });
    mockStampCFDI.mockRejectedValue(new PACError('PAC_STAMP_DUPLICATE', 'Duplicate UUID', false));

    try {
      await stampInvoice(VALID_INVOICE, 'org-uuid-123');
      expect.fail('Should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(PACError);
      expect((error as PACError).code).toBe('PAC_STAMP_DUPLICATE');
    }
  });

  it('should work with SW provider', async () => {
    mockGetPACInfo.mockResolvedValue({ provider: 'sw', environment: 'production' });
    mockStampCFDI.mockResolvedValue({
      ...VALID_STAMP_RESULT,
      pacProvider: 'sw',
    });
    mockExtractTFD.mockReturnValue(VALID_TFD_DATA);

    const result = await stampInvoice(VALID_INVOICE, 'org-uuid-123');

    expect(result.pacProvider).toBe('sw');
    expect(result.environment).toBe('production');
  });
});

// ============================================================================
// cancelStampedInvoice Tests
// ============================================================================

describe('cancelStampedInvoice', () => {
  it('should cancel invoice and return result', async () => {
    mockCancelCFDI.mockResolvedValue({
      uuid: STAMPED_INVOICE.uuid,
      estatusUUID: '201',
      acuse: '<xml/>',
      cancelled: true,
    });

    const result = await cancelStampedInvoice(
      STAMPED_INVOICE,
      'org-uuid-123',
      '02'
    );

    expect(result.uuid).toBe(STAMPED_INVOICE.uuid);
    expect(result.cancelled).toBe(true);
    expect(result.estatusUUID).toBe('201');
    expect(mockCancelCFDI).toHaveBeenCalledWith({
      uuid: STAMPED_INVOICE.uuid,
      issuerRfc: STAMPED_INVOICE.issuer_rfc,
      motivo: '02',
      folioSustitucion: undefined,
      orgId: 'org-uuid-123',
    });
  });

  it('should throw when invoice has no UUID', async () => {
    try {
      await cancelStampedInvoice(VALID_INVOICE, 'org-uuid-123', '02');
      expect.fail('Should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(PACError);
      expect((error as PACError).code).toBe('PAC_INVALID_REQUEST');
      expect((error as PACError).message).toContain('UUID');
    }
  });

  it('should throw when motivo 01 without folioSustitucion', async () => {
    try {
      await cancelStampedInvoice(STAMPED_INVOICE, 'org-uuid-123', '01');
      expect.fail('Should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(PACError);
      expect((error as PACError).code).toBe('PAC_INVALID_REQUEST');
      expect((error as PACError).message).toContain('folioSustitucion');
    }
  });

  it('should pass folioSustitucion for motivo 01', async () => {
    mockCancelCFDI.mockResolvedValue({
      uuid: STAMPED_INVOICE.uuid,
      estatusUUID: '201',
      acuse: '<xml/>',
      cancelled: true,
    });

    await cancelStampedInvoice(
      STAMPED_INVOICE,
      'org-uuid-123',
      '01',
      'replacement-uuid'
    );

    expect(mockCancelCFDI).toHaveBeenCalledWith({
      uuid: STAMPED_INVOICE.uuid,
      issuerRfc: STAMPED_INVOICE.issuer_rfc,
      motivo: '01',
      folioSustitucion: 'replacement-uuid',
      orgId: 'org-uuid-123',
    });
  });

  it('should propagate PAC errors', async () => {
    mockCancelCFDI.mockRejectedValue(
      new PACError('PAC_CANCEL_REJECTED', 'Cannot cancel', false)
    );

    try {
      await cancelStampedInvoice(STAMPED_INVOICE, 'org-uuid-123', '02');
      expect.fail('Should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(PACError);
      expect((error as PACError).code).toBe('PAC_CANCEL_REJECTED');
    }
  });
});

// ============================================================================
// isStampingReady Tests
// ============================================================================

describe('isStampingReady', () => {
  it('should return true when PAC is configured', async () => {
    mockIsPACConfigured.mockResolvedValue(true);

    const result = await isStampingReady('org-uuid-123');

    expect(result).toBe(true);
    expect(mockIsPACConfigured).toHaveBeenCalledWith('org-uuid-123');
  });

  it('should return false when PAC is not configured', async () => {
    mockIsPACConfigured.mockResolvedValue(false);

    const result = await isStampingReady('org-uuid-123');

    expect(result).toBe(false);
  });
});

// ============================================================================
// getStampingStatus Tests
// ============================================================================

describe('getStampingStatus', () => {
  it('should return configured status with provider info', async () => {
    mockGetPACInfo.mockResolvedValue({ provider: 'finkok', environment: 'sandbox' });

    const status = await getStampingStatus('org-uuid-123');

    expect(status.configured).toBe(true);
    expect(status.provider).toBe('finkok');
    expect(status.environment).toBe('sandbox');
    expect(status.message).toContain('finkok');
    expect(status.message).toContain('sandbox');
  });

  it('should return not configured status when no PAC', async () => {
    mockGetPACInfo.mockResolvedValue(null);

    const status = await getStampingStatus('org-uuid-123');

    expect(status.configured).toBe(false);
    expect(status.provider).toBeUndefined();
    expect(status.message).toContain('not configured');
  });
});

// ============================================================================
// isPACError Tests
// ============================================================================

describe('isPACError', () => {
  it('should return true for PACError', () => {
    const error = new PACError('PAC_STAMP_DUPLICATE', 'test', false);

    expect(isPACError(error)).toBe(true);
  });

  it('should return false for regular Error', () => {
    const error = new Error('test');

    expect(isPACError(error)).toBe(false);
  });

  it('should return false for non-errors', () => {
    expect(isPACError('string')).toBe(false);
    expect(isPACError(null)).toBe(false);
    expect(isPACError(undefined)).toBe(false);
    expect(isPACError(123)).toBe(false);
  });
});

// ============================================================================
// formatStampingError Tests
// ============================================================================

describe('formatStampingError', () => {
  it('should format PACError correctly', () => {
    const error = new PACError('PAC_NETWORK_ERROR', 'Connection failed', true);

    const formatted = formatStampingError(error);

    expect(formatted.code).toBe('PAC_NETWORK_ERROR');
    expect(formatted.message).toBe('Connection failed');
    expect(formatted.retryable).toBe(true);
  });

  it('should format regular Error', () => {
    const error = new Error('Something went wrong');

    const formatted = formatStampingError(error);

    expect(formatted.code).toBe('UNKNOWN_ERROR');
    expect(formatted.message).toBe('Something went wrong');
    expect(formatted.retryable).toBe(false);
  });

  it('should handle non-Error objects', () => {
    const formatted = formatStampingError('string error');

    expect(formatted.code).toBe('UNKNOWN_ERROR');
    expect(formatted.message).toBe('Unknown stamping error');
    expect(formatted.retryable).toBe(false);
  });
});
