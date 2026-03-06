/**
 * Invoice Types (Component 12 - Step 2)
 *
 * Core type definitions for the Invoice Service.
 * All types align with CFDI 4.0 requirements and database schema.
 */

// ============================================================
// ENUMS
// ============================================================

/**
 * Invoice lifecycle status.
 * Values must match the database CHECK constraint.
 */
export enum InvoiceStatus {
  DRAFT = "draft",
  PENDING_STAMP = "pending_stamp",
  STAMPED = "stamped",
  SENT = "sent",
  PAID = "paid",
  CANCELLED = "cancelled",
  VOID = "void",
}

/**
 * CFDI Type (TipoDeComprobante).
 * Matches SAT catalog values.
 */
export enum TipoComprobante {
  INGRESO = "I", // Income - standard sales invoice
  EGRESO = "E", // Expense - credit note, refund
  TRASLADO = "T", // Transfer - goods movement without sale
}

/**
 * Payment method (MetodoPago).
 * PUE = paid in full at time of invoice
 * PPD = payment in installments or deferred
 */
export enum MetodoPago {
  PUE = "PUE", // Pago en una sola exhibición
  PPD = "PPD", // Pago en parcialidades o diferido
}

/**
 * Related CFDI relationship type (TipoRelacion).
 * SAT catalog values for relating invoices.
 */
export enum TipoRelacion {
  NOTA_CREDITO = "01", // Nota de crédito de los documentos relacionados
  NOTA_DEBITO = "02", // Nota de débito de los documentos relacionados
  DEVOLUCION = "03", // Devolución de mercancía sobre facturas o traslados previos
  SUSTITUCION = "04", // Sustitución de los CFDI previos
  TRASLADO_MERCANCIA = "05", // Traslados de mercancías facturados previamente
  FACTURA_TRASLADO = "06", // Factura generada por los traslados previos
  APLICACION_ANTICIPO = "07", // CFDI por aplicación de anticipo
  NOTA_CARGO = "08", // Nota de cargo
  FACTURA_ANTICIPO = "09", // Factura anticipada
}

/**
 * CFDI Cancellation reasons (MotivoCancelacion).
 * SAT required codes for invoice cancellation.
 */
export enum CancellationReason {
  VOUCHER_ERROR = "01", // Comprobante emitido con errores con relación
  OPERATION_NEVER_COMPLETED = "02", // Comprobante emitido con errores sin relación
  OPERATION_NOMINALLY_COMPLETED = "03", // No se llevó a cabo la operación
  SUBSTITUTION = "04", // Operación nominalmente relacionada en una factura global
}

/**
 * Payment tracking status for accounting purposes.
 */
export enum PaymentStatus {
  UNPAID = "unpaid",
  PARTIAL = "partial",
  PAID = "paid",
  OVERDUE = "overdue",
}

/**
 * Tax object codes (ObjetoImp).
 * Required for each invoice line item in CFDI 4.0.
 */
export type TaxObject = "01" | "02" | "03";
export const TAX_OBJECT = {
  NO_TAX: "01" as TaxObject, // No objeto de impuesto
  YES_SUBJECT: "02" as TaxObject, // Sí objeto del impuesto
  YES_NOT_SUBJECT: "03" as TaxObject, // Sí objeto del impuesto y no obligado al desglose
};

// ============================================================
// CORE INTERFACES
// ============================================================

/**
 * Invoice line item as stored in the database.
 */
export interface InvoiceItem {
  id: string;
  invoice_id: string;
  sort_order: number;
  product_id?: string;

  // CFDI Concepto fields
  sat_product_code: string; // ClaveProdServ (8 chars)
  sat_unit_code: string; // ClaveUnidad
  unit_name: string; // Unidad (human-readable)
  sku?: string; // NoIdentificacion
  description: string; // Descripcion

  // Quantities
  quantity: number;
  unit_price: number; // ValorUnitario
  discount_amount: number; // Descuento
  subtotal: number; // Importe = quantity * unit_price

  // Tax configuration
  tax_object: TaxObject; // ObjetoImp
  iva_rate: number; // 0 | 0.08 | 0.16
  iva_exempt: boolean;
  iva_trasladado: number; // IVA tax transferred
  iva_retention_rate?: number;
  iva_retenido: number; // IVA tax retained
  isr_retention_rate?: number;
  isr_retenido: number; // ISR tax retained

  // Line total
  total: number; // subtotal - discount + iva_trasladado - iva_retenido - isr_retenido

  created_at?: string;
}

/**
 * Related CFDI record for credit notes, substitutions, etc.
 */
export interface RelatedCFDI {
  id: string;
  invoice_id: string;
  tipo_relacion: TipoRelacion;
  related_uuid: string;
  related_invoice_id?: string;
  created_at?: string;
}

/**
 * Main Invoice interface representing the full invoice record.
 * All fields align with database schema and CFDI 4.0 requirements.
 */
export interface Invoice {
  id: string;
  organization_id: string;

  // CFDI Identification
  uuid?: string; // SAT UUID assigned after stamping
  serie?: string; // Series prefix (e.g., "A", "FAC")
  folio?: string; // Formatted folio string
  folio_number?: number; // Numeric folio for sequences

  // Status & Type
  status: InvoiceStatus;
  tipo_comprobante: TipoComprobante;

  // Dates
  issue_date: string; // ISO datetime - Fecha on CFDI
  due_date?: string; // Payment due date
  stamped_at?: string; // When PAC returned UUID
  sent_at?: string;
  paid_at?: string;
  cancelled_at?: string;

  // Issuer (denormalized from organization at creation time)
  issuer_rfc: string;
  issuer_name: string;
  issuer_tax_regime: string;
  issuer_zip_code: string;

  // Receiver (denormalized from customer at creation time)
  customer_id: string;
  receiver_rfc: string;
  receiver_name: string;
  receiver_tax_regime: string;
  receiver_zip_code: string; // DomicilioFiscalReceptor - required CFDI 4.0
  receiver_cfdi_use: string; // UsoCFDI

  // Payment Terms
  payment_method: MetodoPago; // PUE | PPD
  payment_form: string; // FormaPago code (01-99)
  currency: string; // MXN, USD, EUR, etc.
  exchange_rate: number; // TipoCambio (1.0 for MXN)
  exportacion: string; // Exportacion field - required CFDI 4.0

  // Amounts (stored with 6 decimal precision)
  subtotal: number;
  discount: number;
  total_iva_trasladado: number;
  total_iva_retenido: number;
  total_isr_retenido: number;
  total: number;

  // Global Invoice (for public invoices without specific customer RFC)
  is_global: boolean;
  global_periodicity?: string; // 01=daily, 02=weekly, 04=monthly
  global_months?: string; // Month number 01-12
  global_year?: string; // Year YYYY

  // Cancellation
  cancellation_reason?: string;
  cancellation_uuid?: string; // UUID of replacement invoice
  cancellation_response_code?: string;

  // Notes & Content
  notes?: string; // Internal notes (not in CFDI)
  conditions?: string; // CondicionesDePago
  cfdi_xml?: string; // Full stamped CFDI XML
  pdf_url?: string; // URL to generated PDF

  // Relations (populated by joins)
  items?: InvoiceItem[];
  related_cfdi?: RelatedCFDI[];

  // Audit
  created_by?: string;
  updated_by?: string;
  created_at: string;
  updated_at: string;
  deleted_at?: string;
}

// ============================================================
// INPUT TYPES (for create/update operations)
// ============================================================

/**
 * Input for a single invoice line item.
 * Used when creating or updating invoices.
 */
export interface InvoiceItemInput {
  product_id?: string;
  sat_product_code: string;
  sat_unit_code: string;
  unit_name: string;
  sku?: string;
  description: string;
  quantity: number;
  unit_price: number;
  discount_amount?: number; // Default 0
  tax_object?: TaxObject; // Default '02'
  // Tax config - if product_id provided, fetched from product
  iva_rate?: number; // Default 0.16
  iva_exempt?: boolean; // Default false
  iva_retention_rate?: number;
  isr_retention_rate?: number;
}

/**
 * Input for creating a new invoice.
 */
export interface CreateInvoiceInput {
  tipo_comprobante?: TipoComprobante; // Default: INGRESO
  customer_id: string;
  serie?: string;
  issue_date?: string; // Default: now
  due_date?: string;
  payment_method?: MetodoPago; // Default: PUE
  payment_form?: string; // Default: '01' (cash), '99' if PPD
  currency?: string; // Default: 'MXN'
  exchange_rate?: number; // Default: 1
  exportacion?: string; // Default: '01'
  items: InvoiceItemInput[];
  related_cfdi?: Array<{
    tipo_relacion: TipoRelacion;
    related_uuid: string;
  }>;
  notes?: string;
  conditions?: string;
  is_global?: boolean;
  global_periodicity?: string;
  global_months?: string;
  global_year?: string;
}

/**
 * Input for updating an existing invoice.
 * Only draft invoices can be fully updated.
 */
export interface UpdateInvoiceInput {
  customer_id?: string;
  serie?: string;
  issue_date?: string;
  due_date?: string;
  payment_method?: MetodoPago;
  payment_form?: string;
  currency?: string;
  exchange_rate?: number;
  exportacion?: string;
  items?: InvoiceItemInput[];
  related_cfdi?: Array<{
    tipo_relacion: TipoRelacion;
    related_uuid: string;
  }>;
  notes?: string;
  conditions?: string;
  is_global?: boolean;
  global_periodicity?: string;
  global_months?: string;
  global_year?: string;
}

// ============================================================
// FILTER & PAGINATION
// ============================================================

/**
 * Filters for listing invoices.
 */
export interface InvoiceFilters {
  status?: InvoiceStatus | InvoiceStatus[];
  tipo_comprobante?: TipoComprobante;
  customer_id?: string;
  receiver_rfc?: string;
  currency?: string;
  date_from?: string;
  date_to?: string;
  due_date_from?: string;
  due_date_to?: string;
  amount_min?: number;
  amount_max?: number;
  search?: string; // Full-text search on receiver name, folio
  has_uuid?: boolean; // Stamped invoices only
  payment_method?: MetodoPago;
  is_overdue?: boolean;
}

/**
 * Pagination parameters.
 */
export interface InvoicePagination {
  page: number;
  limit: number;
}

/**
 * Sorting options for invoice list.
 */
export interface InvoiceSort {
  field:
    | "issue_date"
    | "due_date"
    | "total"
    | "receiver_name"
    | "folio_number"
    | "created_at";
  order: "asc" | "desc";
}

/**
 * Paginated invoice list result.
 */
export interface InvoiceListResult {
  invoices: Invoice[];
  total: number;
  page: number;
  limit: number;
  total_pages: number;
}

// ============================================================
// CALCULATION TYPES
// ============================================================

/**
 * Calculation result for a single line item.
 */
export interface LineItemCalculation {
  subtotal: number; // quantity * unit_price
  discount_amount: number;
  taxable_base: number; // subtotal - discount_amount
  iva_trasladado: number;
  iva_retenido: number;
  isr_retenido: number;
  total: number;
}

/**
 * Aggregated totals for an entire invoice.
 */
export interface InvoiceTotals {
  subtotal: number;
  total_discount: number;
  total_iva_trasladado: number;
  total_iva_retenido: number;
  total_isr_retenido: number;
  total: number;
}

// ============================================================
// WORKFLOW TYPES
// ============================================================

/**
 * Available actions that can be performed on an invoice.
 */
export type InvoiceAction =
  | "submit_for_stamping"
  | "cancel"
  | "mark_sent"
  | "mark_paid"
  | "void"
  | "duplicate";

/**
 * Definition of a status transition.
 */
export interface StatusTransition {
  from: InvoiceStatus;
  to: InvoiceStatus;
  action: InvoiceAction;
  requiresReason?: boolean;
}

/**
 * Available actions for a specific invoice based on its current status.
 */
export interface AvailableActions {
  invoice_id: string;
  current_status: InvoiceStatus;
  actions: InvoiceAction[];
}

// ============================================================
// SERVICE RESULT TYPES
// ============================================================

/**
 * Result of an invoice operation.
 */
export interface InvoiceResult {
  success: boolean;
  invoice?: Invoice;
  error?: string;
  code?: string;
}

/**
 * Result of a bulk operation.
 */
export interface BulkInvoiceResult {
  success: boolean;
  processed: number;
  failed: number;
  errors?: Array<{ id: string; error: string }>;
}

// ============================================================
// DATABASE ROW TYPES
// ============================================================

/**
 * Raw invoice row from database.
 * Used for mapping database results to Invoice interface.
 */
export interface InvoiceRow {
  id: string;
  organization_id: string;
  uuid: string | null;
  serie: string | null;
  folio_number: string | null;
  folio_number_int: number | null;
  status: string;
  tipo_comprobante: string;
  issue_date: string;
  due_date: string | null;
  stamped_at: string | null;
  sent_at: string | null;
  paid_at: string | null;
  cancelled_at: string | null;
  issuer_rfc: string;
  issuer_name: string;
  issuer_tax_regime: string;
  issuer_zip_code: string;
  customer_id: string;
  receiver_rfc: string;
  receiver_name: string;
  receiver_tax_regime: string;
  receiver_zip_code: string;
  receiver_cfdi_use: string;
  payment_method: string;
  payment_form: string;
  currency: string;
  exchange_rate: number;
  exportacion: string;
  subtotal: number;
  discount: number;
  total_iva_trasladado: number;
  total_iva_retenido: number;
  total_isr_retenido: number;
  total: number;
  is_global: boolean;
  global_periodicity: string | null;
  global_months: string | null;
  global_year: string | null;
  cancellation_reason: string | null;
  cancellation_uuid: string | null;
  cancellation_response_code: string | null;
  notes: string | null;
  conditions: string | null;
  cfdi_xml: string | null;
  pdf_url: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

/**
 * Raw invoice item row from database.
 */
export interface InvoiceItemRow {
  id: string;
  invoice_id: string;
  sort_order: number;
  product_id: string | null;
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
  created_at: string;
}

// ============================================================
// HELPER CONSTANTS
// ============================================================

/**
 * All valid invoice status values as an array.
 * Useful for validation and iteration.
 */
export const INVOICE_STATUS_VALUES = Object.values(InvoiceStatus);

/**
 * All valid CFDI type values.
 */
export const TIPO_COMPROBANTE_VALUES = Object.values(TipoComprobante);

/**
 * All valid payment method values.
 */
export const METODO_PAGO_VALUES = Object.values(MetodoPago);

/**
 * All valid relationship type values.
 */
export const TIPO_RELACION_VALUES = Object.values(TipoRelacion);

/**
 * All valid cancellation reason values.
 */
export const CANCELLATION_REASON_VALUES = Object.values(CancellationReason);

/**
 * Payment form codes (FormaPago) - most common ones.
 */
export const PAYMENT_FORM_CODES = {
  EFECTIVO: "01",
  CHEQUE: "02",
  TRANSFERENCIA: "03",
  TARJETA_CREDITO: "04",
  MONEDERO_ELECTRONICO: "05",
  DINERO_ELECTRONICO: "06",
  VALES_DESPENSA: "08",
  DACION_PAGO: "12",
  PAGO_SUBROGACION: "13",
  PAGO_CONSIGNACION: "14",
  CONDONACION: "15",
  COMPENSACION: "17",
  NOVACION: "23",
  CONFUSION: "24",
  REMISION_DEUDA: "25",
  PRESCRIPCION: "26",
  SATISFACCION_ACREEDOR: "27",
  TARJETA_DEBITO: "28",
  TARJETA_SERVICIOS: "29",
  APLICACION_ANTICIPO: "30",
  INTERMEDIARIO_PAGOS: "31",
  POR_DEFINIR: "99", // Required when MetodoPago = PPD
} as const;

/**
 * Common currency codes used in Mexico.
 */
export const CURRENCY_CODES = {
  MXN: "MXN",
  USD: "USD",
  EUR: "EUR",
} as const;
