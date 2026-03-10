/**
 * PDF Module (Component 16)
 *
 * Public exports for the PDF generation service.
 */

// ============================================================================
// Service Functions
// ============================================================================

export {
  generateInvoicePDF,
  uploadPDF,
  generateAndStorePDF,
  canGenerateInvoicePDF,
  getPDFGenerationStatus,
  DEFAULT_BRANDING,
  DEFAULT_PDF_OPTIONS,
} from './service';

// ============================================================================
// Core Classes
// ============================================================================

export { PDFGenerator } from './generator';

// ============================================================================
// QR Code Functions
// ============================================================================

export {
  formatSATVerificationURL,
  generateSATQRCode,
  generateInvoiceQRCode,
  formatTotalForQR,
  extractLast8OfSello,
  SAT_VERIFICATION_URL,
} from './qr-code';

// ============================================================================
// XML Extractor Functions
// ============================================================================

export {
  extractXMLFields,
  extractUUIDFromXML,
  validateXMLForPDF,
  truncateSello,
  XMLExtractionError,
} from './xml-extractor';

// ============================================================================
// Template Functions
// ============================================================================

export {
  buildInvoicePDFData,
  validateInvoicePDFData,
  canGeneratePDF,
} from './templates/invoice-template';

// ============================================================================
// Style Constants & Functions
// ============================================================================

export {
  buildLayoutConfig,
  getCatalogLabel,
  getTaxLabel,
  formatTaxRate,
  getLabels,
  PAGE_SIZES,
  DEFAULT_COLORS,
  FONTS,
  ITEMS_TABLE_COLUMNS,
  TIPO_COMPROBANTE,
  FORMA_PAGO,
  METODO_PAGO,
  IMPUESTO,
  USO_CFDI,
  REGIMEN_FISCAL,
  OBJETO_IMPUESTO,
  EXPORTACION,
  LABELS,
} from './styles';

// ============================================================================
// Types
// ============================================================================

export type {
  BrandingSettings,
  PDFOptions,
  LayoutConfig,
  InvoicePDFData,
  InvoicePDFItem,
  ItemTax,
  TaxBreakdown,
  TaxLine,
  StampData,
  PDFGenerationResult,
  PDFStorageResult,
  PDFErrorCode,
  DatabaseInvoiceRow,
  DatabaseInvoiceItemRow,
  DatabaseInvoiceStampRow,
  DatabaseBrandingRow,
} from './types';

export type { XMLExtractedFields } from './xml-extractor';

export { PDFError, isValidStampData, isValidInvoicePDFData, isValidBrandingSettings } from './types';

export type { Labels } from './styles';
export type { SATVerificationParams } from './qr-code';
