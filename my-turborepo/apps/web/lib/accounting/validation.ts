/**
 * Accounting Subsystem Validation (Components 21-23)
 *
 * Shared validators for account codes, balanced entries,
 * period date ranges, and hierarchy integrity.
 */

import type { CreateJournalEntryLineInput, AccountType, Naturaleza } from './types';
import { DEFAULT_NATURALEZA, MAX_ACCOUNT_DEPTH } from './constants';

/**
 * Validates that an account code is in the correct format.
 * Accepts dot-separated form and strips dots.
 * Returns the canonical (digits only) form.
 */
export function normalizeAccountCode(code: string): string {
  return code.replace(/\./g, '');
}

/**
 * Validates account code format: 4-12 digits after dot removal.
 */
export function isValidAccountCode(code: string): boolean {
  const normalized = normalizeAccountCode(code);
  return /^[0-9]{4,12}$/.test(normalized);
}

/**
 * Checks that journal entry lines are balanced (total debits = total credits).
 * Uses a tolerance of 0.01 for floating point rounding.
 */
export function isBalanced(lines: Pick<CreateJournalEntryLineInput, 'debit' | 'credit'>[]): boolean {
  const totalDebit = lines.reduce((sum, line) => sum + (line.debit || 0), 0);
  const totalCredit = lines.reduce((sum, line) => sum + (line.credit || 0), 0);
  return Math.abs(totalDebit - totalCredit) < 0.01;
}

/**
 * Calculates total debits and credits for a set of lines.
 */
export function calculateTotals(lines: Pick<CreateJournalEntryLineInput, 'debit' | 'credit'>[]): {
  totalDebit: number;
  totalCredit: number;
} {
  const totalDebit = roundToTwoDecimals(lines.reduce((sum, line) => sum + (line.debit || 0), 0));
  const totalCredit = roundToTwoDecimals(lines.reduce((sum, line) => sum + (line.credit || 0), 0));
  return { totalDebit, totalCredit };
}

/**
 * Validates that each line has exactly one of debit or credit > 0.
 */
export function validateLineAmounts(lines: Pick<CreateJournalEntryLineInput, 'debit' | 'credit'>[]): string[] {
  const errors: string[] = [];
  lines.forEach((line, index) => {
    const hasDebit = (line.debit || 0) > 0;
    const hasCredit = (line.credit || 0) > 0;
    if (hasDebit === hasCredit) {
      errors.push(`Línea ${index + 1}: debe tener exactamente un cargo o un abono mayor a 0`);
    }
    if ((line.debit || 0) < 0 || (line.credit || 0) < 0) {
      errors.push(`Línea ${index + 1}: los montos no pueden ser negativos`);
    }
  });
  return errors;
}

/**
 * Validates that an entry date falls within the fiscal period's date range.
 */
export function isDateInPeriod(entryDate: string, periodStart: string, periodEnd: string): boolean {
  return entryDate >= periodStart && entryDate <= periodEnd;
}

/**
 * Validates that the naturaleza is consistent with the account type.
 */
export function isNaturalezaConsistent(accountType: AccountType, naturaleza: Naturaleza): boolean {
  return DEFAULT_NATURALEZA[accountType] === naturaleza;
}

/**
 * Validates hierarchy depth (max 6 levels per SAT spec).
 */
export function isValidDepth(materializedPath: string): boolean {
  const segments = materializedPath.split('.');
  return segments.length <= MAX_ACCOUNT_DEPTH;
}

/**
 * Builds a materialized path from parent path and child code.
 */
export function buildMaterializedPath(parentPath: string | null, code: string): string {
  if (!parentPath) return code;
  return `${parentPath}.${code}`;
}

/**
 * Validates that a child path starts with the parent path.
 */
export function isChildPath(childPath: string, parentPath: string): boolean {
  return childPath.startsWith(parentPath + '.');
}

/**
 * Computes the balance for an account based on its naturaleza.
 * Deudora: balance = debits - credits (positive means debit balance)
 * Acreedora: balance = credits - debits (positive means credit balance)
 */
export function computeBalance(
  naturaleza: Naturaleza,
  totalDebit: number,
  totalCredit: number
): number {
  if (naturaleza === 'D') {
    return roundToTwoDecimals(totalDebit - totalCredit);
  }
  return roundToTwoDecimals(totalCredit - totalDebit);
}

/**
 * Splits a balance into debit and credit columns for trial balance.
 * Positive balance → debit column for deudora, credit column for acreedora.
 * Negative balance → opposite column.
 */
export function splitBalanceToColumns(
  balance: number,
  naturaleza: Naturaleza
): { debit: number; credit: number } {
  if (balance >= 0) {
    return naturaleza === 'D'
      ? { debit: balance, credit: 0 }
      : { debit: 0, credit: balance };
  }
  return naturaleza === 'D'
    ? { debit: 0, credit: Math.abs(balance) }
    : { debit: Math.abs(balance), credit: 0 };
}

/**
 * Generates an entry number in the format YYYY-NNNNNN.
 */
export function formatEntryNumber(year: number, sequence: number): string {
  return `${year}-${String(sequence).padStart(6, '0')}`;
}

/**
 * Rounds a number to two decimal places.
 */
export function roundToTwoDecimals(value: number): number {
  return Number(Math.round(parseFloat(value + 'e2')) + 'e-2');
}

/**
 * Formats a number as a 2-decimal string for SAT XML.
 */
export function toSatDecimal(value: number): string {
  return value.toFixed(2);
}

/**
 * Generates SAT XML file name per naming convention.
 * Format: {RFC}{YYYY}{MM}{TYPE}.xml
 */
export function generateSatFileName(
  rfc: string,
  year: number,
  month: number,
  documentType: string
): string {
  const yearStr = String(year);
  const monthStr = String(month).padStart(2, '0');
  return `${rfc}${yearStr}${monthStr}${documentType}.xml`;
}
