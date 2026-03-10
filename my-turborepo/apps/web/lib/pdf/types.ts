/**
 * PDF Generator Types (Component 16)
 *
 * Type definitions for the PDF generation service.
 * These types support SAT-compliant CFDI 4.0 PDF representation.
 */

// ============================================================================
// Branding & Configuration Types
// ============================================================================

/**
 * Organization branding settings for PDF customization.
 * Loaded from organization_branding table.
 */
export interface BrandingSettings {
  /** Primary color (hex, e.g. "#1E40AF") */
  primaryColor: string;
  /** Secondary color for backgrounds (hex, e.g. "#DBEAFE") */
  secondaryColor: string;
  /** Logo URL from R2 storage, or null if no logo */
  logoUrl: string | null;
  /** Pre-fetched logo buffer for rendering */
  logoBuffer: Buffer | null;
  /** Company display name (may differ from RFC name) */
  companyName: string;
  /** Company website URL */
  website: string | null;
  /** Contact phone number */
  phone: string | null;
}

/**
 * PDF generation options
 */
export interface PDFOptions {
  /** Language for labels ('es' = Spanish, 'en' = English) */
  language: 'es' | 'en';
  /** Page size (LETTER for Mexico, A4 for international) */
  pageSize: 'LETTER' | 'A4';
  /** Whether to append XML text at end of PDF */
  includeXMLAppendix: boolean;
  /** Watermark text (e.g. "DRAFT" for non-stamped) */
  watermark: string | null;
}

/**
 * Layout configuration for PDF rendering
 */
export interface LayoutConfig {
  /** Page width in points */
  pageWidth: number;
  /** Page height in points */
  pageHeight: number;
  /** Page margins in points */
  margin: {
    top: number;
    right: number;
    bottom: number;
    left: number;
  };
  /** Content width (pageWidth - left - right margin) */
  contentWidth: number;
  /** Color palette */
  colors: {
    primary: string;
    secondary: string;
    text: string;
    muted: string;
    border: string;
    headerBg: string;
    white: string;
    accent: string;
  };
  /** Font configuration */
  fonts: {
    regular: string;
    bold: string;
    sizes: {
      tiny: number;
      small: number;
      normal: number;
      medium: number;
      large: number;
      title: number;
      heading: number;
    };
  };
}

// ============================================================================
// Invoice PDF Data Types
// ============================================================================

/**
 * Fully hydrated invoice data for PDF rendering.
 * Built from normalized tables (invoices, invoice_items, invoice_stamps).
 */
export interface InvoicePDFData {
  // Core invoice fields
  id: string;
  folio: string;
  series: string | null;
  fecha: string;
  tipoComprobante: string;
  formaPago: string;
  metodoPago: string;
  moneda: string;
  tipoCambio: string | null;
  subtotal: string;
  descuento: string | null;
  total: string;

  // Issuer
  issuerRfc: string;
  issuerName: string;
  issuerTaxRegime: string;
  issuerPostalCode: string;

  // Receiver
  receiverRfc: string;
  receiverName: string;
  receiverTaxRegime: string;
  receiverPostalCode: string;
  receiverCfdiUse: string;

  // Conditions
  condicionesDePago: string | null;

  // Line items
  items: InvoicePDFItem[];

  // Tax breakdown
  taxBreakdown: TaxBreakdown;

  // Stamp data (from invoice_stamps table)
  stamps: StampData;

  // Raw XML (for sello extraction and NoCertificado emisor)
  cfdiXml: string;
}

/**
 * Line item for PDF rendering
 */
export interface InvoicePDFItem {
  /** Quantity */
  cantidad: string;
  /** SAT unit key (ClaveUnidad) */
  unitKey: string;
  /** Human-readable unit description */
  unitDescription: string;
  /** SAT product/service key (ClaveProdServ) */
  productServiceKey: string;
  /** Item description */
  description: string;
  /** Unit price */
  unitPrice: string;
  /** Discount amount (null if no discount) */
  discount: string | null;
  /** Line subtotal (quantity * unitPrice) */
  subtotal: string;
  /** SKU/identifier (optional) */
  sku: string | null;
  /** Tax object code (01, 02, 03) */
  taxObject: string;
  /** Taxes applied to this item */
  taxes: ItemTax[];
}

/**
 * Tax detail for a line item
 */
export interface ItemTax {
  /** Tax type */
  type: 'transferred' | 'withheld';
  /** Tax code (001=ISR, 002=IVA, 003=IEPS) */
  impuesto: string;
  /** Tax rate */
  tasaOCuota: string;
  /** Tax amount */
  importe: string;
}

/**
 * Tax breakdown for the invoice totals section
 */
export interface TaxBreakdown {
  /** Invoice subtotal (sum of line items) */
  subtotal: string;
  /** Total discount */
  discount: string | null;
  /** Total transferred taxes */
  totalTransferredTaxes: string;
  /** Total withheld taxes */
  totalWithheldTaxes: string | null;
  /** Invoice total */
  total: string;
  /** Individual tax lines */
  taxes: TaxLine[];
}

/**
 * Individual tax line for breakdown
 */
export interface TaxLine {
  /** Tax type */
  type: 'transferred' | 'withheld';
  /** Tax code (001=ISR, 002=IVA, 003=IEPS) */
  impuesto: string;
  /** Tax rate */
  tasaOCuota: string;
  /** Tax amount */
  importe: string;
}

/**
 * TFD stamp data from invoice_stamps table
 */
export interface StampData {
  /** SAT Folio Fiscal (UUID) */
  uuid: string;
  /** Timestamp when PAC stamped the document */
  fechaTimbrado: string;
  /** PAC's RFC */
  rfcProvCertif: string;
  /** Echo of issuer's Sello (for verification) */
  selloCFD: string;
  /** SAT certificate number */
  noCertificadoSAT: string;
  /** SAT's signature */
  selloSAT: string;
  /** PAC provider that processed the stamp */
  pacProvider: string;
}

// ============================================================================
// Result Types
// ============================================================================

/**
 * Result of PDF generation (buffer only)
 */
export interface PDFGenerationResult {
  /** Generated PDF as a buffer */
  buffer: Buffer;
  /** Number of pages in the PDF */
  pageCount: number;
  /** Invoice UUID */
  uuid: string;
  /** ISO timestamp when generated */
  generatedAt: string;
}

/**
 * Result of PDF generation and storage
 */
export interface PDFStorageResult extends PDFGenerationResult {
  /** Public R2 URL to the PDF */
  url: string;
  /** R2 storage key */
  r2Key: string;
}

// ============================================================================
// Error Types
// ============================================================================

/**
 * PDF generation error codes
 */
export type PDFErrorCode =
  | 'PDF_INVALID_INVOICE'
  | 'PDF_MISSING_STAMPS'
  | 'PDF_MISSING_XML'
  | 'PDF_XML_PARSE_ERROR'
  | 'PDF_GENERATION_FAILED'
  | 'PDF_UPLOAD_FAILED'
  | 'PDF_LOGO_FETCH_FAILED';

/**
 * PDF generation error
 */
export class PDFError extends Error {
  constructor(
    public readonly code: PDFErrorCode,
    message: string,
    public readonly originalError?: unknown
  ) {
    super(message);
    this.name = 'PDFError';
  }
}

// ============================================================================
// Type Guards
// ============================================================================

/**
 * Check if an object is a valid StampData
 */
export function isValidStampData(data: unknown): data is StampData {
  if (!data || typeof data !== 'object') return false;
  const stamp = data as Record<string, unknown>;
  return (
    typeof stamp.uuid === 'string' &&
    typeof stamp.fechaTimbrado === 'string' &&
    typeof stamp.rfcProvCertif === 'string' &&
    typeof stamp.selloCFD === 'string' &&
    typeof stamp.noCertificadoSAT === 'string' &&
    typeof stamp.selloSAT === 'string' &&
    typeof stamp.pacProvider === 'string'
  );
}

/**
 * Check if an object is valid InvoicePDFData
 */
export function isValidInvoicePDFData(data: unknown): data is InvoicePDFData {
  if (!data || typeof data !== 'object') return false;
  const invoice = data as Record<string, unknown>;

  // Check required string fields
  const requiredStrings = [
    'id',
    'folio',
    'fecha',
    'tipoComprobante',
    'formaPago',
    'metodoPago',
    'moneda',
    'subtotal',
    'total',
    'issuerRfc',
    'issuerName',
    'issuerTaxRegime',
    'issuerPostalCode',
    'receiverRfc',
    'receiverName',
    'receiverTaxRegime',
    'receiverPostalCode',
    'receiverCfdiUse',
    'cfdiXml',
  ];

  for (const field of requiredStrings) {
    if (typeof invoice[field] !== 'string') return false;
  }

  // Check items array
  if (!Array.isArray(invoice.items)) return false;

  // Check taxBreakdown
  if (!invoice.taxBreakdown || typeof invoice.taxBreakdown !== 'object') return false;

  // Check stamps
  if (!isValidStampData(invoice.stamps)) return false;

  return true;
}

/**
 * Check if an object is a valid BrandingSettings
 */
export function isValidBrandingSettings(data: unknown): data is BrandingSettings {
  if (!data || typeof data !== 'object') return false;
  const branding = data as Record<string, unknown>;
  return (
    typeof branding.primaryColor === 'string' &&
    typeof branding.secondaryColor === 'string' &&
    typeof branding.companyName === 'string' &&
    (branding.logoUrl === null || typeof branding.logoUrl === 'string') &&
    (branding.logoBuffer === null || Buffer.isBuffer(branding.logoBuffer)) &&
    (branding.website === null || typeof branding.website === 'string') &&
    (branding.phone === null || typeof branding.phone === 'string')
  );
}

// ============================================================================
// Database Row Types (for reading from normalized tables)
// ============================================================================

/**
 * Invoice row from database with items joined
 */
export interface DatabaseInvoiceRow {
  id: string;
  organization_id: string;
  uuid: string | null;
  serie: string | null;
  folio_number: string | null;
  status: string;
  tipo_comprobante: string;
  issue_date: string;
  issuer_rfc: string;
  issuer_name: string;
  issuer_tax_regime: string;
  issuer_zip_code: string;
  receiver_rfc: string;
  receiver_name: string;
  receiver_tax_regime: string;
  receiver_zip_code: string;
  receiver_cfdi_use: string;
  payment_method: string;
  payment_form: string;
  currency: string;
  exchange_rate: number;
  subtotal: number;
  discount: number;
  total_iva_trasladado: number;
  total_iva_retenido: number;
  total_isr_retenido: number;
  total: number;
  conditions: string | null;
  cfdi_xml: string | null;
  pdf_url: string | null;
  items: DatabaseInvoiceItemRow[];
}

/**
 * Invoice item row from database
 */
export interface DatabaseInvoiceItemRow {
  id: string;
  invoice_id: string;
  sort_order: number;
  sat_product_code: string;
  sat_unit_code: string;
  unit_name: string;
  sku: string | null;
  description: string;
  quantity: number;
  unit_price: number;
  discount_amount: number;
  subtotal: number;
  tax_object: string;
  iva_rate: number;
  iva_exempt: boolean;
  iva_trasladado: number;
  iva_retention_rate: number | null;
  iva_retenido: number;
  isr_retention_rate: number | null;
  isr_retenido: number;
  total: number;
}

/**
 * Invoice stamp row from database
 */
export interface DatabaseInvoiceStampRow {
  id: string;
  invoice_id: string;
  organization_id: string;
  uuid: string;
  fecha_timbrado: string;
  rfc_prov_certif: string;
  sello_cfd: string;
  no_certificado_sat: string;
  sello_sat: string;
  tfd_version: string;
  pac_provider: string;
  pac_environment: string;
}

/**
 * Organization branding row from database
 */
export interface DatabaseBrandingRow {
  id: string;
  organization_id: string;
  primary_color: string | null;
  secondary_color: string | null;
  logo_url: string | null;
  company_name: string | null;
  website: string | null;
  phone: string | null;
}
