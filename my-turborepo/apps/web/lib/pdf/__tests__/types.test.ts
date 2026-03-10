/**
 * PDF Types Tests (Component 16)
 */

import { describe, it, expect } from 'vitest';
import {
  isValidStampData,
  isValidInvoicePDFData,
  isValidBrandingSettings,
  PDFError,
  type StampData,
  type InvoicePDFData,
  type BrandingSettings,
} from '../types';

// ============================================================================
// Test Fixtures
// ============================================================================

const VALID_STAMP_DATA: StampData = {
  uuid: '05c519de-6d20-4258-88fb-c69a5970e927',
  fechaTimbrado: '2024-03-01T10:00:00',
  rfcProvCertif: 'SPR190613I52',
  selloCFD: 'KVttNU...==',
  noCertificadoSAT: '30001000000400002495',
  selloSAT: 'qadm+mH3...==',
  pacProvider: 'finkok',
};

const VALID_TAX_BREAKDOWN = {
  subtotal: '5000.00',
  discount: null,
  totalTransferredTaxes: '800.00',
  totalWithheldTaxes: null,
  total: '5800.00',
  taxes: [
    {
      type: 'transferred' as const,
      impuesto: '002',
      tasaOCuota: '0.160000',
      importe: '800.00',
    },
  ],
};

const VALID_INVOICE_PDF_DATA: InvoicePDFData = {
  id: 'inv-001',
  folio: 'F-00001',
  series: 'A',
  fecha: '2024-03-01T10:00:00',
  tipoComprobante: 'I',
  formaPago: '03',
  metodoPago: 'PUE',
  moneda: 'MXN',
  tipoCambio: null,
  subtotal: '5000.00',
  descuento: null,
  total: '5800.00',
  issuerRfc: 'XAXX010101000',
  issuerName: 'EMPRESA DEMO SA DE CV',
  issuerTaxRegime: '601',
  issuerPostalCode: '06600',
  receiverRfc: 'XEXX010101000',
  receiverName: 'CLIENTE DEMO',
  receiverTaxRegime: '616',
  receiverPostalCode: '01000',
  receiverCfdiUse: 'G03',
  condicionesDePago: null,
  items: [
    {
      cantidad: '1',
      unitKey: 'E48',
      unitDescription: 'Unidad de servicio',
      productServiceKey: '84111506',
      description: 'Servicios de desarrollo de software',
      unitPrice: '5000.00',
      discount: null,
      subtotal: '5000.00',
      sku: null,
      taxObject: '02',
      taxes: [
        {
          type: 'transferred',
          impuesto: '002',
          tasaOCuota: '0.160000',
          importe: '800.00',
        },
      ],
    },
  ],
  taxBreakdown: VALID_TAX_BREAKDOWN,
  stamps: VALID_STAMP_DATA,
  cfdiXml: '<?xml version="1.0"?><cfdi:Comprobante />',
};

const VALID_BRANDING: BrandingSettings = {
  primaryColor: '#1E3A5F',
  secondaryColor: '#EBF2FA',
  logoUrl: null,
  logoBuffer: null,
  companyName: 'Empresa Demo',
  website: 'https://example.com',
  phone: '+52 55 1234 5678',
};

// ============================================================================
// isValidStampData Tests
// ============================================================================

describe('isValidStampData', () => {
  it('should return true for valid stamp data', () => {
    expect(isValidStampData(VALID_STAMP_DATA)).toBe(true);
  });

  it('should return false for null', () => {
    expect(isValidStampData(null)).toBe(false);
  });

  it('should return false for undefined', () => {
    expect(isValidStampData(undefined)).toBe(false);
  });

  it('should return false for non-object', () => {
    expect(isValidStampData('string')).toBe(false);
    expect(isValidStampData(123)).toBe(false);
    expect(isValidStampData([])).toBe(false);
  });

  it('should return false for missing uuid', () => {
    const { uuid, ...rest } = VALID_STAMP_DATA;
    expect(isValidStampData(rest)).toBe(false);
  });

  it('should return false for missing fechaTimbrado', () => {
    const { fechaTimbrado, ...rest } = VALID_STAMP_DATA;
    expect(isValidStampData(rest)).toBe(false);
  });

  it('should return false for missing rfcProvCertif', () => {
    const { rfcProvCertif, ...rest } = VALID_STAMP_DATA;
    expect(isValidStampData(rest)).toBe(false);
  });

  it('should return false for missing selloCFD', () => {
    const { selloCFD, ...rest } = VALID_STAMP_DATA;
    expect(isValidStampData(rest)).toBe(false);
  });

  it('should return false for missing noCertificadoSAT', () => {
    const { noCertificadoSAT, ...rest } = VALID_STAMP_DATA;
    expect(isValidStampData(rest)).toBe(false);
  });

  it('should return false for missing selloSAT', () => {
    const { selloSAT, ...rest } = VALID_STAMP_DATA;
    expect(isValidStampData(rest)).toBe(false);
  });

  it('should return false for missing pacProvider', () => {
    const { pacProvider, ...rest } = VALID_STAMP_DATA;
    expect(isValidStampData(rest)).toBe(false);
  });

  it('should return false for non-string uuid', () => {
    expect(isValidStampData({ ...VALID_STAMP_DATA, uuid: 123 })).toBe(false);
  });

  it('should return false for non-string fechaTimbrado', () => {
    expect(isValidStampData({ ...VALID_STAMP_DATA, fechaTimbrado: new Date() })).toBe(false);
  });
});

// ============================================================================
// isValidInvoicePDFData Tests
// ============================================================================

describe('isValidInvoicePDFData', () => {
  it('should return true for valid invoice PDF data', () => {
    expect(isValidInvoicePDFData(VALID_INVOICE_PDF_DATA)).toBe(true);
  });

  it('should return false for null', () => {
    expect(isValidInvoicePDFData(null)).toBe(false);
  });

  it('should return false for undefined', () => {
    expect(isValidInvoicePDFData(undefined)).toBe(false);
  });

  it('should return false for non-object', () => {
    expect(isValidInvoicePDFData('string')).toBe(false);
    expect(isValidInvoicePDFData(123)).toBe(false);
  });

  it('should return false for missing id', () => {
    const { id, ...rest } = VALID_INVOICE_PDF_DATA;
    expect(isValidInvoicePDFData(rest)).toBe(false);
  });

  it('should return false for missing folio', () => {
    const { folio, ...rest } = VALID_INVOICE_PDF_DATA;
    expect(isValidInvoicePDFData(rest)).toBe(false);
  });

  it('should return false for missing issuerRfc', () => {
    const { issuerRfc, ...rest } = VALID_INVOICE_PDF_DATA;
    expect(isValidInvoicePDFData(rest)).toBe(false);
  });

  it('should return false for missing receiverRfc', () => {
    const { receiverRfc, ...rest } = VALID_INVOICE_PDF_DATA;
    expect(isValidInvoicePDFData(rest)).toBe(false);
  });

  it('should return false for missing cfdiXml', () => {
    const { cfdiXml, ...rest } = VALID_INVOICE_PDF_DATA;
    expect(isValidInvoicePDFData(rest)).toBe(false);
  });

  it('should return false for non-array items', () => {
    expect(isValidInvoicePDFData({ ...VALID_INVOICE_PDF_DATA, items: 'not-array' })).toBe(false);
  });

  it('should return false for missing taxBreakdown', () => {
    const { taxBreakdown, ...rest } = VALID_INVOICE_PDF_DATA;
    expect(isValidInvoicePDFData(rest)).toBe(false);
  });

  it('should return false for invalid stamps', () => {
    expect(isValidInvoicePDFData({ ...VALID_INVOICE_PDF_DATA, stamps: null })).toBe(false);
    expect(isValidInvoicePDFData({ ...VALID_INVOICE_PDF_DATA, stamps: {} })).toBe(false);
  });

  it('should return false for non-string total', () => {
    expect(isValidInvoicePDFData({ ...VALID_INVOICE_PDF_DATA, total: 5800 })).toBe(false);
  });

  it('should allow null for optional fields', () => {
    const data = {
      ...VALID_INVOICE_PDF_DATA,
      series: null,
      tipoCambio: null,
      descuento: null,
      condicionesDePago: null,
    };
    expect(isValidInvoicePDFData(data)).toBe(true);
  });
});

// ============================================================================
// isValidBrandingSettings Tests
// ============================================================================

describe('isValidBrandingSettings', () => {
  it('should return true for valid branding settings', () => {
    expect(isValidBrandingSettings(VALID_BRANDING)).toBe(true);
  });

  it('should return true for branding with null optionals', () => {
    const branding: BrandingSettings = {
      primaryColor: '#1E3A5F',
      secondaryColor: '#EBF2FA',
      logoUrl: null,
      logoBuffer: null,
      companyName: 'Test',
      website: null,
      phone: null,
    };
    expect(isValidBrandingSettings(branding)).toBe(true);
  });

  it('should return true for branding with logo buffer', () => {
    const branding: BrandingSettings = {
      ...VALID_BRANDING,
      logoBuffer: Buffer.from('fake-image-data'),
    };
    expect(isValidBrandingSettings(branding)).toBe(true);
  });

  it('should return false for null', () => {
    expect(isValidBrandingSettings(null)).toBe(false);
  });

  it('should return false for undefined', () => {
    expect(isValidBrandingSettings(undefined)).toBe(false);
  });

  it('should return false for non-object', () => {
    expect(isValidBrandingSettings('string')).toBe(false);
    expect(isValidBrandingSettings(123)).toBe(false);
  });

  it('should return false for missing primaryColor', () => {
    const { primaryColor, ...rest } = VALID_BRANDING;
    expect(isValidBrandingSettings(rest)).toBe(false);
  });

  it('should return false for missing secondaryColor', () => {
    const { secondaryColor, ...rest } = VALID_BRANDING;
    expect(isValidBrandingSettings(rest)).toBe(false);
  });

  it('should return false for missing companyName', () => {
    const { companyName, ...rest } = VALID_BRANDING;
    expect(isValidBrandingSettings(rest)).toBe(false);
  });

  it('should return false for non-string primaryColor', () => {
    expect(isValidBrandingSettings({ ...VALID_BRANDING, primaryColor: 123 })).toBe(false);
  });

  it('should return false for non-null/non-string logoUrl', () => {
    expect(isValidBrandingSettings({ ...VALID_BRANDING, logoUrl: 123 })).toBe(false);
  });

  it('should return false for non-null/non-buffer logoBuffer', () => {
    expect(isValidBrandingSettings({ ...VALID_BRANDING, logoBuffer: 'string' })).toBe(false);
  });

  it('should return false for non-null/non-string website', () => {
    expect(isValidBrandingSettings({ ...VALID_BRANDING, website: 123 })).toBe(false);
  });

  it('should return false for non-null/non-string phone', () => {
    expect(isValidBrandingSettings({ ...VALID_BRANDING, phone: 123 })).toBe(false);
  });
});

// ============================================================================
// PDFError Tests
// ============================================================================

describe('PDFError', () => {
  it('should create error with code and message', () => {
    const error = new PDFError('PDF_INVALID_INVOICE', 'Invoice is invalid');
    expect(error.code).toBe('PDF_INVALID_INVOICE');
    expect(error.message).toBe('Invoice is invalid');
    expect(error.name).toBe('PDFError');
    expect(error.originalError).toBeUndefined();
  });

  it('should create error with original error', () => {
    const originalError = new Error('Original error');
    const error = new PDFError('PDF_GENERATION_FAILED', 'Failed', originalError);
    expect(error.originalError).toBe(originalError);
  });

  it('should be instanceof Error', () => {
    const error = new PDFError('PDF_MISSING_STAMPS', 'Missing stamps');
    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(PDFError);
  });

  it('should support all error codes', () => {
    const codes = [
      'PDF_INVALID_INVOICE',
      'PDF_MISSING_STAMPS',
      'PDF_MISSING_XML',
      'PDF_XML_PARSE_ERROR',
      'PDF_GENERATION_FAILED',
      'PDF_UPLOAD_FAILED',
      'PDF_LOGO_FETCH_FAILED',
    ] as const;

    codes.forEach((code) => {
      const error = new PDFError(code, `Error: ${code}`);
      expect(error.code).toBe(code);
    });
  });
});
