/**
 * Expense Validation (Component 20)
 *
 * CFDI validation and ISR deductibility assessment per Mexican tax law.
 */

import { validateCFDI } from '@repo/cfdi';
import type { DeductibilityAssessment, ExpenseCategory, CreateExpenseInput } from './types';
import { CATEGORY_DEDUCTIBILITY_RULES } from './categories';

const GENERIC_PUBLIC_RFC = 'XAXX010101000';  // RFC público general — not deductible
const GENERIC_FOREIGN_RFC = 'XEXX010101000'; // RFC extranjero

/**
 * Validates CFDI XML structural integrity using the @repo/cfdi package.
 * Returns a clean result object regardless of validation outcome.
 *
 * This function only validates structure — it does NOT extract data.
 * Use processCFDIFromString() from OCR service for data extraction.
 */
export function validateCFDIStructure(xml: string): {
  valid: boolean;
  errors: string[];
} {
  const result = validateCFDI(xml);
  return {
    valid: result.valid,
    errors: result.errors.map(e => e.message),
  };
}

/**
 * Checks that the CFDI's receptor RFC matches the organization's RFC.
 * This is a hard requirement for deductibility under Art. 27 LISR.
 *
 * @returns true if RFC matches (case-insensitive, normalized)
 */
export function checkRFCMatch(receptorRfc: string, organizationRfc: string): boolean {
  const normalized = (rfc: string) => rfc.trim().toUpperCase();
  return normalized(receptorRfc) === normalized(organizationRfc);
}

/**
 * Checks if the receptor RFC is a generic public RFC (not deductible).
 */
export function isGenericRFC(rfc: string): boolean {
  return rfc.trim().toUpperCase() === GENERIC_PUBLIC_RFC
      || rfc.trim().toUpperCase() === GENERIC_FOREIGN_RFC;
}

/**
 * Determines whether an expense is deductible under Mexican ISR law.
 *
 * Applies rules in order:
 * 1. Generic RFC → not deductible (Art. 27 LISR - must have CFDI to org RFC)
 * 2. Fuel + cash payment → not deductible (Art. 28 LISR)
 * 3. Cash > $2,000 MXN → not deductible (Art. 27 LISR)
 * 4. Meals/entertainment → 91.5% deductible (Art. 28 LISR)
 * 5. Otherwise → 100% deductible
 *
 * @param expense - Expense data including category, paymentMethod, cfdiUuid, vendorRfc
 * @param organizationRfc - The organization's RFC (for receptor RFC check)
 */
export function assessDeductibility(
  expense: {
    category: ExpenseCategory;
    amount: number;
    total: number;
    paymentMethod?: string;    // SAT FormaPago code: '01'=cash, '03'=transfer, etc.
    vendorRfc?: string;
    cfdiUuid?: string;
  },
  organizationRfc: string
): DeductibilityAssessment {
  const warnings: string[] = [];
  const rule = CATEGORY_DEDUCTIBILITY_RULES[expense.category];

  // Rule 1: No CFDI backing
  if (!expense.cfdiUuid) {
    warnings.push('Sin CFDI: el gasto puede no ser deducible sin comprobante fiscal');
  }

  // Rule 2: Generic RFC
  if (expense.vendorRfc && isGenericRFC(expense.vendorRfc)) {
    return {
      isDeductible: false,
      deductibilityPercent: 0,
      reason: 'RFC genérico (público general) no permite deducción personal del gasto',
      legalBasis: 'Art. 27 LISR - El CFDI debe estar a nombre del contribuyente',
      warnings,
    };
  }

  // Rule 3: Fuel with cash payment (NEVER deductible)
  const isCashPayment = expense.paymentMethod === '01'; // '01' = Efectivo
  if (expense.category === 'combustible' && isCashPayment) {
    return {
      isDeductible: false,
      deductibilityPercent: 0,
      reason: 'Combustible pagado en efectivo: no deducible sin importar el monto',
      legalBasis: 'Art. 28 LISR - Combustible debe pagarse en forma bancarizada',
      warnings,
    };
  }

  // Rule 4: Cash payment over $2,000 MXN
  if (isCashPayment && expense.total > 2000 && rule.cashLimit !== null) {
    return {
      isDeductible: false,
      deductibilityPercent: 0,
      reason: `Pago en efectivo mayor a $2,000 MXN (total: $${expense.total.toFixed(2)})`,
      legalBasis: 'Art. 27 LISR - Pagos mayores a $2,000 deben ser bancarizados',
      warnings,
    };
  }

  // Rule 5: Meals/entertainment (91.5% rule)
  if (expense.category === 'alimentos_entretenimiento') {
    return {
      isDeductible: true,
      deductibilityPercent: 91.5,
      reason: 'Alimentos y entretenimiento: deducible al 91.5% del monto erogado',
      legalBasis: 'Art. 28 fracción XX LISR',
      warnings,
    };
  }

  // Default: fully deductible
  return {
    isDeductible: true,
    deductibilityPercent: rule.defaultDeductiblePercent,
    reason: 'Gasto estrictamente indispensable con comprobante fiscal',
    legalBasis: 'Art. 25/27 LISR',
    warnings,
  };
}

/**
 * Validates complete expense input data.
 * Returns array of validation error messages (empty = valid).
 */
export function validateExpenseData(data: CreateExpenseInput, orgRfc?: string): string[] {
  const errors: string[] = [];

  if (data.total < data.amount) {
    errors.push('El total no puede ser menor que el monto base');
  }

  if (data.taxAmount && data.amount + data.taxAmount !== data.total) {
    // Allow small floating point tolerance
    if (Math.abs(data.amount + data.taxAmount - data.total) > 0.02) {
      errors.push('Total no coincide con monto + impuesto');
    }
  }

  const expDate = new Date(data.expenseDate);
  if (isNaN(expDate.getTime())) {
    errors.push('Fecha de gasto inválida');
  }

  if (data.vendorRfc && !/^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/.test(data.vendorRfc.toUpperCase())) {
    errors.push('RFC del proveedor tiene formato inválido');
  }

  return errors;
}
