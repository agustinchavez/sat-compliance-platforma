/**
 * Journal Entry Validation (Component 22)
 *
 * Balance check, period open check, account postable check.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { CreateJournalEntryInput, FiscalPeriod, Account } from '../types';
import { AccountingError } from '../errors';
import { isBalanced, validateLineAmounts, isDateInPeriod } from '../validation';
import { getAccountByCode } from '../chart-of-accounts/repository';

/**
 * Validates a journal entry before creation.
 */
export async function validateJournalEntry(
  organizationId: string,
  input: CreateJournalEntryInput,
  period: FiscalPeriod,
  supabase: SupabaseClient
): Promise<{ resolvedAccounts: Map<string, Account> }> {
  // 1. Period must be open
  if (period.status === 'closed') {
    throw new AccountingError('PERIOD_CLOSED', 'No se pueden registrar pólizas en un período cerrado', period.id);
  }

  // 2. Entry date must be within period
  if (!isDateInPeriod(input.entryDate, period.startDate, period.endDate)) {
    throw new AccountingError(
      'INVALID_ENTRY_DATE',
      `La fecha ${input.entryDate} no está dentro del período ${period.startDate} a ${period.endDate}`
    );
  }

  // 3. Lines must be balanced
  if (!isBalanced(input.lines)) {
    throw new AccountingError('ENTRY_IMBALANCED', 'El total de cargos debe ser igual al total de abonos');
  }

  // 4. Each line must have exactly one of debit/credit
  const lineErrors = validateLineAmounts(input.lines);
  if (lineErrors.length > 0) {
    throw new AccountingError('VALIDATION_ERROR', lineErrors.join('; '));
  }

  // 5. Resolve and validate each account
  const resolvedAccounts = new Map<string, Account>();
  for (const line of input.lines) {
    if (resolvedAccounts.has(line.accountCode)) continue;

    const account = await getAccountByCode(organizationId, line.accountCode, supabase);
    if (!account) {
      throw new AccountingError('ACCOUNT_NOT_FOUND', `Cuenta '${line.accountCode}' no encontrada`);
    }
    if (!account.isActive) {
      throw new AccountingError('ACCOUNT_INACTIVE', `La cuenta '${line.accountCode}' está inactiva`, account.id);
    }
    if (!account.isPostable) {
      throw new AccountingError('ACCOUNT_NOT_POSTABLE', `La cuenta '${line.accountCode}' no es contabilizable (es cuenta de mayor)`, account.id);
    }
    resolvedAccounts.set(line.accountCode, account);
  }

  // 6. Must have at least 2 lines
  if (input.lines.length < 2) {
    throw new AccountingError('VALIDATION_ERROR', 'Una póliza debe tener al menos 2 líneas');
  }

  return { resolvedAccounts };
}

/**
 * Validates that an entry can be posted.
 */
export function validateForPosting(entry: {
  status: string;
  totalDebit: number;
  totalCredit: number;
}): void {
  if (entry.status !== 'draft') {
    throw new AccountingError('ENTRY_NOT_DRAFT', 'Solo se pueden contabilizar pólizas en estado borrador');
  }

  if (Math.abs(entry.totalDebit - entry.totalCredit) >= 0.01) {
    throw new AccountingError('ENTRY_IMBALANCED', 'La póliza no está balanceada');
  }
}

/**
 * Validates that an entry can be reversed.
 */
export function validateForReversal(entry: {
  status: string;
  reversedByEntryId?: string;
}): void {
  if (entry.status !== 'posted') {
    throw new AccountingError('ENTRY_NOT_POSTED', 'Solo se pueden reversar pólizas contabilizadas');
  }
  if (entry.reversedByEntryId) {
    throw new AccountingError('ENTRY_ALREADY_REVERSED', 'Esta póliza ya fue reversada');
  }
}
