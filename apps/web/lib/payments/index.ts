/**
 * Payment Service (Component 18)
 *
 * Handles payment recording, Complemento de Pagos 2.0 generation,
 * and payment lifecycle management.
 */

// ============================================
// TYPES
// ============================================

export type {
  Payment,
  CreatePaymentInput,
  UpdatePaymentInput,
  PaymentSummary,
  PaymentFilters,
  PaymentMethodCode,
} from './types';

export {
  PaymentStatus,
  PAYMENT_METHODS,
  createPaymentSchema,
  updatePaymentSchema,
} from './types';

// ============================================
// ERRORS
// ============================================

export { PaymentError, isPaymentError } from './errors';
export type { PaymentErrorCode } from './errors';

// ============================================
// CALCULATIONS
// ============================================

export {
  calculatePaidAmount,
  calculateOutstanding,
  determinePaymentStatus,
  isValidPaymentAmount,
  getNextParcialidad,
  formatSATDecimal,
  formatCurrencyAmount,
  calculateEquivalenciaDR,
  prorateTaxes,
} from './calculations';

export type { InvoicePaymentStatus } from './calculations';

// ============================================
// SERVICE
// ============================================

export {
  recordPayment,
  generatePaymentCFDI,
  updatePayment,
  getPayment,
  listPayments,
  getInvoicePayments,
  calculateOutstandingBalance,
  voidPayment,
} from './service';
