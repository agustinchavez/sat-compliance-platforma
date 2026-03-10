/**
 * Invoice Template Tests (Component 16)
 */

import { describe, it, expect } from 'vitest';
import {
  buildInvoicePDFData,
  validateInvoicePDFData,
  canGeneratePDF,
} from '../templates/invoice-template';
import {
  VALID_STAMPED_INVOICE,
  VALID_INVOICE_STAMP,
  DRAFT_INVOICE,
  INVOICE_WITHOUT_XML,
  INVOICE_MULTI_ITEMS,
  INVOICE_WITH_RETENTIONS,
  EXPECTED_PDF_DATA,
} from './fixtures/invoice-data';

// ============================================================================
// buildInvoicePDFData Tests
// ============================================================================

describe('buildInvoicePDFData', () => {
  it('should transform stamped invoice to PDF data', () => {
    const pdfData = buildInvoicePDFData(VALID_STAMPED_INVOICE, VALID_INVOICE_STAMP);

    expect(pdfData.id).toBe(EXPECTED_PDF_DATA.id);
    expect(pdfData.folio).toBe(EXPECTED_PDF_DATA.folio);
    expect(pdfData.series).toBe(EXPECTED_PDF_DATA.series);
    expect(pdfData.tipoComprobante).toBe(EXPECTED_PDF_DATA.tipoComprobante);
    expect(pdfData.formaPago).toBe(EXPECTED_PDF_DATA.formaPago);
    expect(pdfData.metodoPago).toBe(EXPECTED_PDF_DATA.metodoPago);
    expect(pdfData.moneda).toBe(EXPECTED_PDF_DATA.moneda);
    expect(pdfData.subtotal).toBe(EXPECTED_PDF_DATA.subtotal);
    expect(pdfData.total).toBe(EXPECTED_PDF_DATA.total);
  });

  it('should map issuer fields correctly', () => {
    const pdfData = buildInvoicePDFData(VALID_STAMPED_INVOICE, VALID_INVOICE_STAMP);

    expect(pdfData.issuerRfc).toBe('XAXX010101000');
    expect(pdfData.issuerName).toBe('EMPRESA DEMO SA DE CV');
    expect(pdfData.issuerTaxRegime).toBe('601');
    expect(pdfData.issuerPostalCode).toBe('06600');
  });

  it('should map receiver fields correctly', () => {
    const pdfData = buildInvoicePDFData(VALID_STAMPED_INVOICE, VALID_INVOICE_STAMP);

    expect(pdfData.receiverRfc).toBe('XEXX010101000');
    expect(pdfData.receiverName).toBe('CLIENTE DEMO');
    expect(pdfData.receiverTaxRegime).toBe('616');
    expect(pdfData.receiverPostalCode).toBe('01000');
    expect(pdfData.receiverCfdiUse).toBe('G03');
  });

  it('should build items array', () => {
    const pdfData = buildInvoicePDFData(VALID_STAMPED_INVOICE, VALID_INVOICE_STAMP);

    expect(pdfData.items).toHaveLength(1);
    expect(pdfData.items[0].productServiceKey).toBe('84111506');
    expect(pdfData.items[0].unitKey).toBe('E48');
    expect(pdfData.items[0].description).toBe('Servicios de desarrollo de software');
    expect(pdfData.items[0].cantidad).toBe('1.00');
    expect(pdfData.items[0].unitPrice).toBe('5000.00');
    expect(pdfData.items[0].subtotal).toBe('5000.00');
  });

  it('should build stamp data', () => {
    const pdfData = buildInvoicePDFData(VALID_STAMPED_INVOICE, VALID_INVOICE_STAMP);

    expect(pdfData.stamps.uuid).toBe('05c519de-6d20-4258-88fb-c69a5970e927');
    expect(pdfData.stamps.fechaTimbrado).toBe('2024-03-01T10:00:00');
    expect(pdfData.stamps.rfcProvCertif).toBe('SPR190613I52');
    expect(pdfData.stamps.noCertificadoSAT).toBe('30001000000400002495');
    expect(pdfData.stamps.pacProvider).toBe('finkok');
  });

  it('should build tax breakdown', () => {
    const pdfData = buildInvoicePDFData(VALID_STAMPED_INVOICE, VALID_INVOICE_STAMP);

    expect(pdfData.taxBreakdown.subtotal).toBe('5000.00');
    expect(pdfData.taxBreakdown.totalTransferredTaxes).toBe('800.00');
    expect(pdfData.taxBreakdown.total).toBe('5800.00');
    expect(pdfData.taxBreakdown.taxes).toHaveLength(1);
    expect(pdfData.taxBreakdown.taxes[0].type).toBe('transferred');
    expect(pdfData.taxBreakdown.taxes[0].impuesto).toBe('002');
  });

  it('should include CFDI XML', () => {
    const pdfData = buildInvoicePDFData(VALID_STAMPED_INVOICE, VALID_INVOICE_STAMP);

    expect(pdfData.cfdiXml).toBeTruthy();
    expect(pdfData.cfdiXml).toContain('cfdi:Comprobante');
  });

  it('should throw for non-stamped invoice', () => {
    expect(() => buildInvoicePDFData(DRAFT_INVOICE, VALID_INVOICE_STAMP)).toThrow(
      "Cannot generate PDF for invoice with status 'draft'"
    );
  });

  it('should throw for invoice without XML', () => {
    expect(() => buildInvoicePDFData(INVOICE_WITHOUT_XML, VALID_INVOICE_STAMP)).toThrow(
      'Invoice is missing CFDI XML'
    );
  });

  it('should throw for missing stamp data', () => {
    expect(() => buildInvoicePDFData(VALID_STAMPED_INVOICE, null as any)).toThrow(
      'Invoice is missing stamp data'
    );
  });

  it('should handle invoice with multiple items', () => {
    const pdfData = buildInvoicePDFData(INVOICE_MULTI_ITEMS, VALID_INVOICE_STAMP);

    expect(pdfData.items).toHaveLength(2);
    expect(pdfData.taxBreakdown.subtotal).toBe('14000.00');
    expect(pdfData.taxBreakdown.discount).toBe('1000.00');
  });

  it('should handle invoice with tax retentions', () => {
    const pdfData = buildInvoicePDFData(INVOICE_WITH_RETENTIONS, VALID_INVOICE_STAMP);

    expect(pdfData.taxBreakdown.totalWithheldTaxes).toBe('1033.33');
    expect(pdfData.taxBreakdown.taxes.length).toBeGreaterThan(1);

    const withheldTaxes = pdfData.taxBreakdown.taxes.filter((t) => t.type === 'withheld');
    expect(withheldTaxes.length).toBe(2);
  });

  it('should format item taxes correctly', () => {
    const pdfData = buildInvoicePDFData(INVOICE_WITH_RETENTIONS, VALID_INVOICE_STAMP);
    const item = pdfData.items[0];

    expect(item.taxes.length).toBe(3);

    const ivaTransferred = item.taxes.find(
      (t) => t.type === 'transferred' && t.impuesto === '002'
    );
    expect(ivaTransferred).toBeTruthy();
    expect(ivaTransferred?.importe).toBe('800.00');

    const ivaWithheld = item.taxes.find((t) => t.type === 'withheld' && t.impuesto === '002');
    expect(ivaWithheld).toBeTruthy();

    const isrWithheld = item.taxes.find((t) => t.type === 'withheld' && t.impuesto === '001');
    expect(isrWithheld).toBeTruthy();
  });

  it('should set tipoCambio to null when exchange rate is 1', () => {
    const pdfData = buildInvoicePDFData(VALID_STAMPED_INVOICE, VALID_INVOICE_STAMP);
    expect(pdfData.tipoCambio).toBeNull();
  });

  it('should include tipoCambio for non-MXN currencies', () => {
    const usdInvoice = {
      ...VALID_STAMPED_INVOICE,
      currency: 'USD',
      exchange_rate: 17.5,
    };
    const pdfData = buildInvoicePDFData(usdInvoice, VALID_INVOICE_STAMP);
    expect(pdfData.tipoCambio).toBe('17.5');
    expect(pdfData.moneda).toBe('USD');
  });

  it('should include conditions when present', () => {
    const pdfData = buildInvoicePDFData(VALID_STAMPED_INVOICE, VALID_INVOICE_STAMP);
    expect(pdfData.condicionesDePago).toBe('CONTADO');
  });

  it('should set conditions to null when not present', () => {
    const invoiceNoConditions = {
      ...VALID_STAMPED_INVOICE,
      conditions: null,
    };
    const pdfData = buildInvoicePDFData(invoiceNoConditions, VALID_INVOICE_STAMP);
    expect(pdfData.condicionesDePago).toBeNull();
  });
});

// ============================================================================
// validateInvoicePDFData Tests
// ============================================================================

describe('validateInvoicePDFData', () => {
  it('should return empty array for valid PDF data', () => {
    const pdfData = buildInvoicePDFData(VALID_STAMPED_INVOICE, VALID_INVOICE_STAMP);
    const errors = validateInvoicePDFData(pdfData);

    expect(errors).toEqual([]);
  });

  it('should return errors for missing id', () => {
    const pdfData = buildInvoicePDFData(VALID_STAMPED_INVOICE, VALID_INVOICE_STAMP);
    const invalidData = { ...pdfData, id: '' };
    const errors = validateInvoicePDFData(invalidData);

    expect(errors).toContain('Missing invoice ID');
  });

  it('should return errors for missing folio', () => {
    const pdfData = buildInvoicePDFData(VALID_STAMPED_INVOICE, VALID_INVOICE_STAMP);
    const invalidData = { ...pdfData, folio: '' };
    const errors = validateInvoicePDFData(invalidData);

    expect(errors).toContain('Missing folio');
  });

  it('should return errors for missing issuer fields', () => {
    const pdfData = buildInvoicePDFData(VALID_STAMPED_INVOICE, VALID_INVOICE_STAMP);
    const invalidData = { ...pdfData, issuerRfc: '', issuerName: '' };
    const errors = validateInvoicePDFData(invalidData);

    expect(errors).toContain('Missing issuer RFC');
    expect(errors).toContain('Missing issuer name');
  });

  it('should return errors for missing receiver fields', () => {
    const pdfData = buildInvoicePDFData(VALID_STAMPED_INVOICE, VALID_INVOICE_STAMP);
    const invalidData = { ...pdfData, receiverRfc: '', receiverName: '' };
    const errors = validateInvoicePDFData(invalidData);

    expect(errors).toContain('Missing receiver RFC');
    expect(errors).toContain('Missing receiver name');
  });

  it('should return errors for missing items', () => {
    const pdfData = buildInvoicePDFData(VALID_STAMPED_INVOICE, VALID_INVOICE_STAMP);
    const invalidData = { ...pdfData, items: [] };
    const errors = validateInvoicePDFData(invalidData);

    expect(errors).toContain('Missing invoice items');
  });

  it('should return errors for missing stamp data', () => {
    const pdfData = buildInvoicePDFData(VALID_STAMPED_INVOICE, VALID_INVOICE_STAMP);
    const invalidData = { ...pdfData, stamps: null as any };
    const errors = validateInvoicePDFData(invalidData);

    expect(errors).toContain('Missing stamp data (invoice not stamped)');
  });

  it('should return errors for missing stamp UUID', () => {
    const pdfData = buildInvoicePDFData(VALID_STAMPED_INVOICE, VALID_INVOICE_STAMP);
    const invalidData = { ...pdfData, stamps: { ...pdfData.stamps, uuid: '' } };
    const errors = validateInvoicePDFData(invalidData);

    expect(errors).toContain('Missing stamp UUID');
  });

  it('should return errors for missing XML', () => {
    const pdfData = buildInvoicePDFData(VALID_STAMPED_INVOICE, VALID_INVOICE_STAMP);
    const invalidData = { ...pdfData, cfdiXml: '' };
    const errors = validateInvoicePDFData(invalidData);

    expect(errors).toContain('Missing CFDI XML');
  });

  it('should return multiple errors', () => {
    const pdfData = buildInvoicePDFData(VALID_STAMPED_INVOICE, VALID_INVOICE_STAMP);
    const invalidData = {
      ...pdfData,
      id: '',
      folio: '',
      issuerRfc: '',
      receiverRfc: '',
    };
    const errors = validateInvoicePDFData(invalidData);

    expect(errors.length).toBeGreaterThan(3);
  });
});

// ============================================================================
// canGeneratePDF Tests
// ============================================================================

describe('canGeneratePDF', () => {
  it('should return true for stamped invoice with XML and items', () => {
    expect(canGeneratePDF(VALID_STAMPED_INVOICE)).toBe(true);
  });

  it('should return false for draft invoice', () => {
    expect(canGeneratePDF(DRAFT_INVOICE)).toBe(false);
  });

  it('should return false for invoice without XML', () => {
    expect(canGeneratePDF(INVOICE_WITHOUT_XML)).toBe(false);
  });

  it('should return false for invoice without items', () => {
    const noItemsInvoice = { ...VALID_STAMPED_INVOICE, items: [] };
    expect(canGeneratePDF(noItemsInvoice)).toBe(false);
  });

  it('should return true for invoice with multiple items', () => {
    expect(canGeneratePDF(INVOICE_MULTI_ITEMS)).toBe(true);
  });
});
