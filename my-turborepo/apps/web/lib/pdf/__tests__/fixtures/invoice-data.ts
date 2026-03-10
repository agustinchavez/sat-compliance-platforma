/**
 * Test Fixtures: Invoice Data (Component 16)
 */

import type {
  DatabaseInvoiceRow,
  DatabaseInvoiceItemRow,
  DatabaseInvoiceStampRow,
  InvoicePDFData,
  BrandingSettings,
} from '../../types';
import { MINIMAL_STAMPED_XML } from './stamped-xml';

/**
 * Valid database invoice item
 */
export const VALID_INVOICE_ITEM: DatabaseInvoiceItemRow = {
  id: 'item-001',
  invoice_id: 'inv-001',
  sort_order: 1,
  sat_product_code: '84111506',
  sat_unit_code: 'E48',
  unit_name: 'Unidad de servicio',
  sku: 'DEV-001',
  description: 'Servicios de desarrollo de software',
  quantity: 1,
  unit_price: 5000.0,
  discount_amount: 0,
  subtotal: 5000.0,
  tax_object: '02',
  iva_rate: 0.16,
  iva_exempt: false,
  iva_trasladado: 800.0,
  iva_retention_rate: null,
  iva_retenido: 0,
  isr_retention_rate: null,
  isr_retenido: 0,
  total: 5800.0,
};

/**
 * Invoice item with discount
 */
export const INVOICE_ITEM_WITH_DISCOUNT: DatabaseInvoiceItemRow = {
  ...VALID_INVOICE_ITEM,
  id: 'item-002',
  description: 'Consultoría empresarial',
  unit_price: 10000.0,
  discount_amount: 1000.0,
  subtotal: 9000.0,
  iva_trasladado: 1440.0,
  total: 10440.0,
};

/**
 * Invoice item with tax retention
 */
export const INVOICE_ITEM_WITH_RETENTION: DatabaseInvoiceItemRow = {
  ...VALID_INVOICE_ITEM,
  id: 'item-003',
  description: 'Servicios profesionales',
  iva_retention_rate: 0.106667,
  iva_retenido: 533.33,
  isr_retention_rate: 0.1,
  isr_retenido: 500.0,
  total: 4766.67, // 5000 + 800 - 533.33 - 500
};

/**
 * Valid invoice stamp
 */
export const VALID_INVOICE_STAMP: DatabaseInvoiceStampRow = {
  id: 'stamp-001',
  invoice_id: 'inv-001',
  organization_id: 'org-001',
  uuid: '05c519de-6d20-4258-88fb-c69a5970e927',
  fecha_timbrado: '2024-03-01T10:00:00',
  rfc_prov_certif: 'SPR190613I52',
  sello_cfd:
    'KVttNUxYJFG8yLDvA5ZqYYZrJ8GqHgbPfQvYdVxSP3mRabcdefghijk1234567890ABCDEFGHIJKLMNOP==',
  no_certificado_sat: '30001000000400002495',
  sello_sat:
    'qadm+mH3yLDvA5ZqYYZrJ8GqHgbPfQvYdVxSP3mR1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ123==',
  tfd_version: '1.1',
  pac_provider: 'finkok',
  pac_environment: 'sandbox',
};

/**
 * Valid stamped invoice (ready for PDF)
 */
export const VALID_STAMPED_INVOICE: DatabaseInvoiceRow = {
  id: 'inv-001',
  organization_id: 'org-001',
  uuid: '05c519de-6d20-4258-88fb-c69a5970e927',
  serie: 'A',
  folio_number: '00001',
  status: 'stamped',
  tipo_comprobante: 'I',
  issue_date: '2024-03-01T10:00:00',
  issuer_rfc: 'XAXX010101000',
  issuer_name: 'EMPRESA DEMO SA DE CV',
  issuer_tax_regime: '601',
  issuer_zip_code: '06600',
  receiver_rfc: 'XEXX010101000',
  receiver_name: 'CLIENTE DEMO',
  receiver_tax_regime: '616',
  receiver_zip_code: '01000',
  receiver_cfdi_use: 'G03',
  payment_method: 'PUE',
  payment_form: '03',
  currency: 'MXN',
  exchange_rate: 1,
  subtotal: 5000.0,
  discount: 0,
  total_iva_trasladado: 800.0,
  total_iva_retenido: 0,
  total_isr_retenido: 0,
  total: 5800.0,
  conditions: 'CONTADO',
  cfdi_xml: MINIMAL_STAMPED_XML,
  pdf_url: null,
  items: [VALID_INVOICE_ITEM],
};

/**
 * Draft invoice (not ready for PDF)
 */
export const DRAFT_INVOICE: DatabaseInvoiceRow = {
  ...VALID_STAMPED_INVOICE,
  id: 'inv-draft',
  uuid: null,
  status: 'draft',
  cfdi_xml: null,
};

/**
 * Invoice without XML
 */
export const INVOICE_WITHOUT_XML: DatabaseInvoiceRow = {
  ...VALID_STAMPED_INVOICE,
  id: 'inv-no-xml',
  cfdi_xml: null,
};

/**
 * Invoice with multiple items
 */
export const INVOICE_MULTI_ITEMS: DatabaseInvoiceRow = {
  ...VALID_STAMPED_INVOICE,
  id: 'inv-multi',
  subtotal: 14000.0,
  discount: 1000.0,
  total_iva_trasladado: 2080.0,
  total: 15080.0,
  items: [VALID_INVOICE_ITEM, INVOICE_ITEM_WITH_DISCOUNT],
};

/**
 * Invoice with tax retentions
 */
export const INVOICE_WITH_RETENTIONS: DatabaseInvoiceRow = {
  ...VALID_STAMPED_INVOICE,
  id: 'inv-retention',
  total_iva_retenido: 533.33,
  total_isr_retenido: 500.0,
  total: 4766.67,
  items: [INVOICE_ITEM_WITH_RETENTION],
};

/**
 * Default branding settings
 */
export const DEFAULT_BRANDING: BrandingSettings = {
  primaryColor: '#1E3A5F',
  secondaryColor: '#EBF2FA',
  logoUrl: null,
  logoBuffer: null,
  companyName: 'EMPRESA DEMO SA DE CV',
  website: 'https://example.com',
  phone: '+52 55 1234 5678',
};

/**
 * Custom branding
 */
export const CUSTOM_BRANDING: BrandingSettings = {
  primaryColor: '#FF5733',
  secondaryColor: '#FFC300',
  logoUrl: 'https://example.com/logo.png',
  logoBuffer: Buffer.from('fake-logo-data'),
  companyName: 'Empresa Personalizada',
  website: 'https://custom.example.com',
  phone: '+52 55 9876 5432',
};

/**
 * Expected InvoicePDFData for VALID_STAMPED_INVOICE
 */
export const EXPECTED_PDF_DATA: Partial<InvoicePDFData> = {
  id: 'inv-001',
  folio: '00001',
  series: 'A',
  tipoComprobante: 'I',
  formaPago: '03',
  metodoPago: 'PUE',
  moneda: 'MXN',
  subtotal: '5000.00',
  total: '5800.00',
  issuerRfc: 'XAXX010101000',
  issuerName: 'EMPRESA DEMO SA DE CV',
  receiverRfc: 'XEXX010101000',
  receiverName: 'CLIENTE DEMO',
};
