/**
 * Invoice Template (Component 16)
 *
 * Transforms database invoice rows into InvoicePDFData for PDF generation.
 * Maps snake_case database columns to camelCase PDF data interfaces.
 */

import type {
  InvoicePDFData,
  InvoicePDFItem,
  TaxBreakdown,
  TaxLine,
  StampData,
  DatabaseInvoiceRow,
  DatabaseInvoiceItemRow,
  DatabaseInvoiceStampRow,
} from '../types';

// ============================================================================
// Validation Functions
// ============================================================================

/**
 * Validates that all required fields for PDF generation are present.
 * Returns validation errors array (empty = valid).
 *
 * @param data - Invoice PDF data to validate
 * @returns Array of error messages (empty if valid)
 */
export function validateInvoicePDFData(data: InvoicePDFData): string[] {
  const errors: string[] = [];

  // Required fields
  if (!data.id) errors.push('Missing invoice ID');
  if (!data.folio) errors.push('Missing folio');
  if (!data.fecha) errors.push('Missing fecha (issue date)');
  if (!data.tipoComprobante) errors.push('Missing tipo de comprobante');
  if (!data.formaPago) errors.push('Missing forma de pago');
  if (!data.metodoPago) errors.push('Missing metodo de pago');
  if (!data.moneda) errors.push('Missing moneda (currency)');
  if (!data.subtotal) errors.push('Missing subtotal');
  if (!data.total) errors.push('Missing total');

  // Issuer fields
  if (!data.issuerRfc) errors.push('Missing issuer RFC');
  if (!data.issuerName) errors.push('Missing issuer name');
  if (!data.issuerTaxRegime) errors.push('Missing issuer tax regime');
  if (!data.issuerPostalCode) errors.push('Missing issuer postal code');

  // Receiver fields
  if (!data.receiverRfc) errors.push('Missing receiver RFC');
  if (!data.receiverName) errors.push('Missing receiver name');
  if (!data.receiverTaxRegime) errors.push('Missing receiver tax regime');
  if (!data.receiverPostalCode) errors.push('Missing receiver postal code');
  if (!data.receiverCfdiUse) errors.push('Missing CFDI use');

  // Items
  if (!data.items || data.items.length === 0) {
    errors.push('Missing invoice items');
  }

  // Stamps (required for stamped invoices)
  if (!data.stamps) {
    errors.push('Missing stamp data (invoice not stamped)');
  } else {
    if (!data.stamps.uuid) errors.push('Missing stamp UUID');
    if (!data.stamps.fechaTimbrado) errors.push('Missing fecha timbrado');
    if (!data.stamps.rfcProvCertif) errors.push('Missing PAC RFC');
    if (!data.stamps.noCertificadoSAT) errors.push('Missing SAT certificate number');
    if (!data.stamps.selloSAT) errors.push('Missing SAT seal');
    if (!data.stamps.selloCFD) errors.push('Missing issuer seal echo');
  }

  // XML
  if (!data.cfdiXml) {
    errors.push('Missing CFDI XML');
  }

  return errors;
}

// ============================================================================
// Transform Functions
// ============================================================================

/**
 * Transforms a database invoice row into InvoicePDFData.
 * Maps DB column names (snake_case) to PDF data interface (camelCase).
 *
 * @param invoice - Database invoice row with items and stamps
 * @param stamp - Invoice stamp row from invoice_stamps table
 * @returns InvoicePDFData ready for PDF generation
 * @throws Error if invoice status is not 'stamped'
 * @throws Error if stamps data is missing required fields
 */
export function buildInvoicePDFData(
  invoice: DatabaseInvoiceRow,
  stamp: DatabaseInvoiceStampRow
): InvoicePDFData {
  // Validate invoice is stamped
  if (invoice.status !== 'stamped') {
    throw new Error(`Cannot generate PDF for invoice with status '${invoice.status}'. Only stamped invoices can be converted to PDF.`);
  }

  // Validate required XML
  if (!invoice.cfdi_xml) {
    throw new Error('Invoice is missing CFDI XML. Cannot generate PDF.');
  }

  // Validate stamp data
  if (!stamp || !stamp.uuid) {
    throw new Error('Invoice is missing stamp data. Cannot generate PDF.');
  }

  // Build items
  const items: InvoicePDFItem[] = invoice.items.map((item) => buildItemData(item));

  // Build tax breakdown
  const taxBreakdown = buildTaxBreakdown(invoice);

  // Build stamp data
  const stamps = buildStampData(stamp);

  return {
    // Core invoice fields
    id: invoice.id,
    folio: invoice.folio_number || '',
    series: invoice.serie || null,
    fecha: invoice.issue_date,
    tipoComprobante: invoice.tipo_comprobante,
    formaPago: invoice.payment_form,
    metodoPago: invoice.payment_method,
    moneda: invoice.currency,
    tipoCambio: invoice.exchange_rate !== 1 ? String(invoice.exchange_rate) : null,
    subtotal: formatDecimal(invoice.subtotal),
    descuento: invoice.discount > 0 ? formatDecimal(invoice.discount) : null,
    total: formatDecimal(invoice.total),

    // Issuer
    issuerRfc: invoice.issuer_rfc,
    issuerName: invoice.issuer_name,
    issuerTaxRegime: invoice.issuer_tax_regime,
    issuerPostalCode: invoice.issuer_zip_code,

    // Receiver
    receiverRfc: invoice.receiver_rfc,
    receiverName: invoice.receiver_name,
    receiverTaxRegime: invoice.receiver_tax_regime,
    receiverPostalCode: invoice.receiver_zip_code,
    receiverCfdiUse: invoice.receiver_cfdi_use,

    // Conditions
    condicionesDePago: invoice.conditions || null,

    // Items
    items,

    // Tax breakdown
    taxBreakdown,

    // Stamps
    stamps,

    // XML
    cfdiXml: invoice.cfdi_xml,
  };
}

/**
 * Builds a single item for PDF data
 */
function buildItemData(item: DatabaseInvoiceItemRow): InvoicePDFItem {
  const taxes: InvoicePDFItem['taxes'] = [];

  // IVA trasladado
  if (item.iva_trasladado > 0) {
    taxes.push({
      type: 'transferred',
      impuesto: '002', // IVA
      tasaOCuota: formatDecimal(item.iva_rate, 6),
      importe: formatDecimal(item.iva_trasladado),
    });
  }

  // IVA retenido
  if (item.iva_retenido > 0) {
    taxes.push({
      type: 'withheld',
      impuesto: '002', // IVA
      tasaOCuota: formatDecimal(item.iva_retention_rate || 0, 6),
      importe: formatDecimal(item.iva_retenido),
    });
  }

  // ISR retenido
  if (item.isr_retenido > 0) {
    taxes.push({
      type: 'withheld',
      impuesto: '001', // ISR
      tasaOCuota: formatDecimal(item.isr_retention_rate || 0, 6),
      importe: formatDecimal(item.isr_retenido),
    });
  }

  return {
    cantidad: formatDecimal(item.quantity),
    unitKey: item.sat_unit_code,
    unitDescription: item.unit_name,
    productServiceKey: item.sat_product_code,
    description: item.description,
    unitPrice: formatDecimal(item.unit_price),
    discount: item.discount_amount > 0 ? formatDecimal(item.discount_amount) : null,
    subtotal: formatDecimal(item.subtotal),
    sku: item.sku || null,
    taxObject: item.tax_object,
    taxes,
  };
}

/**
 * Builds the tax breakdown from invoice totals
 */
function buildTaxBreakdown(invoice: DatabaseInvoiceRow): TaxBreakdown {
  const taxes: TaxLine[] = [];

  // IVA trasladado (aggregate)
  if (invoice.total_iva_trasladado > 0) {
    // Calculate effective rate from items
    const effectiveRate = invoice.subtotal > 0
      ? invoice.total_iva_trasladado / invoice.subtotal
      : 0.16;

    taxes.push({
      type: 'transferred',
      impuesto: '002',
      tasaOCuota: formatDecimal(effectiveRate, 6),
      importe: formatDecimal(invoice.total_iva_trasladado),
    });
  }

  // IVA retenido
  if (invoice.total_iva_retenido > 0) {
    taxes.push({
      type: 'withheld',
      impuesto: '002',
      tasaOCuota: '0.106667', // Common retention rate
      importe: formatDecimal(invoice.total_iva_retenido),
    });
  }

  // ISR retenido
  if (invoice.total_isr_retenido > 0) {
    taxes.push({
      type: 'withheld',
      impuesto: '001',
      tasaOCuota: '0.100000', // Common retention rate
      importe: formatDecimal(invoice.total_isr_retenido),
    });
  }

  return {
    subtotal: formatDecimal(invoice.subtotal),
    discount: invoice.discount > 0 ? formatDecimal(invoice.discount) : null,
    totalTransferredTaxes: formatDecimal(invoice.total_iva_trasladado),
    totalWithheldTaxes:
      invoice.total_iva_retenido + invoice.total_isr_retenido > 0
        ? formatDecimal(invoice.total_iva_retenido + invoice.total_isr_retenido)
        : null,
    total: formatDecimal(invoice.total),
    taxes,
  };
}

/**
 * Builds stamp data from database row
 */
function buildStampData(stamp: DatabaseInvoiceStampRow): StampData {
  return {
    uuid: stamp.uuid,
    fechaTimbrado: stamp.fecha_timbrado,
    rfcProvCertif: stamp.rfc_prov_certif,
    selloCFD: stamp.sello_cfd,
    noCertificadoSAT: stamp.no_certificado_sat,
    selloSAT: stamp.sello_sat,
    pacProvider: stamp.pac_provider,
  };
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Formats a number as a decimal string with specified precision.
 *
 * @param value - Numeric value
 * @param decimals - Number of decimal places (default 2)
 * @returns Formatted decimal string
 */
function formatDecimal(value: number, decimals = 2): string {
  return value.toFixed(decimals);
}

/**
 * Checks if an invoice row is ready for PDF generation.
 *
 * @param invoice - Database invoice row
 * @returns true if invoice can be converted to PDF
 */
export function canGeneratePDF(invoice: DatabaseInvoiceRow): boolean {
  return (
    invoice.status === 'stamped' &&
    !!invoice.cfdi_xml &&
    invoice.items.length > 0
  );
}
