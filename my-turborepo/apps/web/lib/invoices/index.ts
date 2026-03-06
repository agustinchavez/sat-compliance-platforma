/**
 * Invoice Module (Component 12)
 *
 * Core invoice service for CFDI 4.0 compliant invoicing.
 * All downstream components (13-18, 24) depend on this module.
 */

// ============================================
// TYPES
// ============================================

export type {
  Invoice,
  InvoiceItem,
  InvoiceRow,
  InvoiceItemRow,
  RelatedCFDI,
  InvoiceFilters,
  InvoicePagination,
  InvoiceSort,
  InvoiceListResult,
  InvoiceTotals,
  LineItemCalculation,
  TaxBreakdown,
  TaxBreakdownItem,
  InvoiceAction,
  InvoiceItemInput,
  TaxObject,
} from "./types";

export {
  InvoiceStatus,
  TipoComprobante,
  MetodoPago,
  TipoRelacion,
  CancellationReason,
  PaymentStatus,
  TAX_OBJECT,
  INVOICE_STATUS_VALUES,
  TIPO_COMPROBANTE_VALUES,
  METODO_PAGO_VALUES,
  TIPO_RELACION_VALUES,
  CANCELLATION_REASON_VALUES,
  PAYMENT_FORM_CODES,
  CURRENCY_CODES,
} from "./types";

// ============================================
// VALIDATION
// ============================================

export {
  InvoiceItemInputSchema,
  CreateInvoiceSchema,
  UpdateInvoiceSchema,
  validateCustomerForCFDI,
  validatePaymentTerms,
  validateCurrency,
  validateRelatedInvoices,
  validateInvoiceForStamping,
  RFC_PUBLICO_GENERAL,
  RFC_EXTRANJERO,
} from "./validation";

export type { CreateInvoiceInput, UpdateInvoiceInput } from "./validation";

// ============================================
// CALCULATIONS
// ============================================

export {
  calculateLineItem,
  calculateSubtotal,
  calculateDiscount,
  calculateTax,
  calculateTotal,
  calculateInvoiceTotals,
  validateAmounts,
  formatForCFDI,
  formatRateForCFDI,
  getTaxBreakdown,
} from "./calculations";

// ============================================
// WORKFLOW
// ============================================

export {
  canTransition,
  getAvailableActions,
  getRequiredAction,
  requiresReason,
  validateTransition,
  transitionStatus,
  canEditInvoice,
  canCancelInvoice,
  canVoidInvoice,
  isStamped,
  isTerminal,
  getNextStatuses,
  getStatusLabel,
  getActionLabel,
} from "./workflow";

// ============================================
// SERVICE
// ============================================

export {
  createDraft,
  updateDraft,
  submitForStamping,
  getInvoice,
  getInvoiceByUUID,
  listInvoices,
  cancelInvoice,
  deleteInvoice,
  markAsSent,
  markAsPaid,
  addRelatedInvoice,
  removeRelatedInvoice,
  duplicateInvoice,
  getInvoiceStats,
  getNextFolioPreview,
  onStampingSuccess,
  onStampingFailure,
  setServiceContext,
} from "./service";

export type {
  ServiceResult,
  InvoiceStats,
  ServiceContext,
  CustomerService,
  OrganizationService,
  ProductService,
  ProductData,
} from "./service";

// ============================================
// SERVER ACTIONS
// ============================================

export {
  createInvoiceAction,
  updateInvoiceAction,
  submitForStampingAction,
  cancelInvoiceAction,
  deleteInvoiceAction,
  duplicateInvoiceAction,
  getInvoiceAction,
  listInvoicesAction,
  markAsSentAction,
  markAsPaidAction,
  addRelatedInvoiceAction,
  removeRelatedInvoiceAction,
  getInvoiceStatsAction,
  getNextFolioPreviewAction,
} from "./actions";

export type { ActionResult } from "./actions";

// ============================================
// REPOSITORY (for advanced use only)
// ============================================

export type { OrganizationData, CustomerData } from "./repository";

// ============================================
// CFDI BRIDGE (Component 13 Integration)
// ============================================

export {
  generateCFDIFromInvoice,
  isCFDIGeneratorReady,
  generateCFDIPreview,
} from "./cfdi-bridge";

export type { CFDIBridgeResult, CFDIBridgeError } from "./cfdi-bridge";

// ============================================
// SIGNING (Component 14 Integration)
// ============================================

export {
  signInvoice,
  verifyInvoiceSignature,
  isSigningReady,
  getSigningStatus,
} from "./sign-invoice";

export type { SignedInvoiceResult, SigningError } from "./sign-invoice";
