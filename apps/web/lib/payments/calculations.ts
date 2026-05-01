import type { Payment } from './types';

export type InvoicePaymentStatus =
  | 'unpaid'          // No payments at all
  | 'partially_paid'  // Some payments, outstanding > 0
  | 'paid';           // Outstanding = 0 (within tolerance)

const TOLERANCE = 0.01; // 1 cent tolerance for floating point

/**
 * Sums non-voided payment amounts for an invoice.
 * All amounts assumed to be in invoice currency (monedaDR).
 */
export function calculatePaidAmount(payments: Payment[]): number {
  return payments
    .filter(p => p.status !== 'voided')
    .reduce((sum, p) => sum + p.amount, 0);
}

/**
 * Calculates how much remains unpaid.
 * Returns 0 if overpaid (should never happen but defensive).
 */
export function calculateOutstanding(invoiceTotal: number, paidAmount: number): number {
  return Math.max(0, invoiceTotal - paidAmount);
}

/**
 * Determines the invoice payment status label.
 */
export function determinePaymentStatus(
  invoiceTotal: number,
  payments: Payment[]
): InvoicePaymentStatus {
  const paid = calculatePaidAmount(payments);
  if (paid <= TOLERANCE) return 'unpaid';
  const outstanding = calculateOutstanding(invoiceTotal, paid);
  if (outstanding <= TOLERANCE) return 'paid';
  return 'partially_paid';
}

/**
 * Validates that recording a payment of `amount` would not exceed
 * the outstanding balance (overpayment guard).
 * Returns true if the payment is within bounds.
 */
export function isValidPaymentAmount(
  amount: number,
  invoiceTotal: number,
  existingPayments: Payment[]
): boolean {
  const outstanding = calculateOutstanding(
    invoiceTotal,
    calculatePaidAmount(existingPayments)
  );
  return amount <= outstanding + TOLERANCE;
}

/**
 * Returns the ordinal payment number for a new payment against this invoice.
 * NumParcialidad in SAT spec is 1-indexed.
 */
export function getNextParcialidad(payments: Payment[]): number {
  const activePayments = payments.filter(p => p.status !== 'voided');
  return activePayments.length + 1;
}

/**
 * Formats a number as a SAT-compliant decimal string with 6 decimal places.
 * Used for rates, exchange rates in DoctoRelacionado.
 */
export function formatSATDecimal(value: number, decimals: number = 6): string {
  return value.toFixed(decimals);
}

/**
 * Formats a currency amount with 2 decimal places (for monto, impSaldoAnt, etc.)
 */
export function formatCurrencyAmount(value: number): string {
  return value.toFixed(2);
}

/**
 * Computes EquivalenciaDR.
 * When MonedaP === MonedaDR: EquivalenciaDR = "1"
 * When MonedaP !== MonedaDR: EquivalenciaDR = TipoCambioP
 *
 * For SME invoices (MXN-native), this is almost always "1".
 */
export function calculateEquivalenciaDR(
  monedaP: string,
  monedaDR: string,
  tipoCambioP: number
): string {
  if (monedaP === monedaDR) return '1';
  // When currencies differ, return the exchange rate
  return formatSATDecimal(tipoCambioP);
}

/**
 * Prorates invoice-level tax totals based on payment proportion.
 *
 * @param invoiceTotalIVA - Total IVA trasladado from invoice (sum of invoice_items.iva_trasladado)
 * @param invoiceTotalIVARetenido - Total IVA retenido (if any)
 * @param invoiceTotalISRRetenido - Total ISR retenido (if any)
 * @param impPagado - Amount paid in this payment
 * @param impSaldoAnt - Outstanding balance before this payment (invoice total before payment)
 * @returns Prorated tax amounts
 */
export function prorateTaxes(
  invoiceTotalIVA: number,
  invoiceTotalIVARetenido: number,
  invoiceTotalISRRetenido: number,
  impPagado: number,
  impSaldoAnt: number
): {
  proratedIVA: number;
  proratedIVARetenido: number;
  proratedISRRetenido: number;
  prorationFactor: number;
} {
  // Avoid division by zero
  if (impSaldoAnt <= 0) {
    return {
      proratedIVA: 0,
      proratedIVARetenido: 0,
      proratedISRRetenido: 0,
      prorationFactor: 0,
    };
  }

  const prorationFactor = impPagado / impSaldoAnt;

  return {
    proratedIVA: invoiceTotalIVA * prorationFactor,
    proratedIVARetenido: invoiceTotalIVARetenido * prorationFactor,
    proratedISRRetenido: invoiceTotalISRRetenido * prorationFactor,
    prorationFactor,
  };
}

/**
 * Calculates the taxable base for prorated IVA.
 * Base = (impPagado - proratedIVA) for trasladado taxes
 * This assumes the payment amount includes IVA.
 */
export function calculateTaxBase(impPagado: number, ivaRate: number): number {
  // Base = impPagado / (1 + ivaRate)
  // e.g., for 116 MXN payment with 16% IVA: base = 116 / 1.16 = 100
  return impPagado / (1 + ivaRate);
}
