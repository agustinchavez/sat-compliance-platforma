/**
 * Chart of Accounts Validation (Component 21)
 *
 * Account-specific validation: code uniqueness, parent compatibility,
 * hierarchy depth, SAT compliance checks.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Account, AccountType, Naturaleza, ChartValidationResult, ValidationError } from '../types';
import { AccountingError } from '../errors';
import { isValidAccountCode, isNaturalezaConsistent, normalizeAccountCode } from '../validation';
import * as repo from './repository';

/**
 * Validates a new account can be created.
 */
export async function validateCreateAccount(
  organizationId: string,
  code: string,
  parentId: string | undefined,
  accountType: AccountType,
  satNivel: number,
  supabase: SupabaseClient
): Promise<{ parentAccount: Account | null }> {
  const normalizedCode = normalizeAccountCode(code);

  // 1. Code format
  if (!isValidAccountCode(normalizedCode)) {
    throw new AccountingError('INVALID_ACCOUNT_CODE', 'El código de cuenta debe tener entre 4 y 12 dígitos');
  }

  // 2. Code uniqueness
  const existing = await repo.getAccountByCode(organizationId, normalizedCode, supabase);
  if (existing) {
    throw new AccountingError('ACCOUNT_CODE_EXISTS', `El código de cuenta '${normalizedCode}' ya existe`, existing.id);
  }

  // 3. Parent validation
  let parentAccount: Account | null = null;
  if (parentId) {
    parentAccount = await repo.getAccountById(parentId, supabase);
    if (!parentAccount) {
      throw new AccountingError('PARENT_NOT_FOUND', 'La cuenta padre no existe', parentId);
    }
    if (parentAccount.organizationId !== organizationId) {
      throw new AccountingError('INVALID_HIERARCHY', 'La cuenta padre pertenece a otra organización');
    }
    // Parent nivel must be one less than child nivel
    if (satNivel !== parentAccount.satNivel + 1) {
      throw new AccountingError(
        'INVALID_HIERARCHY',
        `El nivel SAT debe ser ${parentAccount.satNivel + 1} (padre es nivel ${parentAccount.satNivel})`
      );
    }
  } else if (satNivel !== 1) {
    throw new AccountingError('INVALID_HIERARCHY', 'Las cuentas sin padre deben ser nivel 1');
  }

  return { parentAccount };
}

/**
 * Validates an account can be updated.
 */
export async function validateUpdateAccount(
  account: Account,
  updates: Record<string, unknown>,
  supabase: SupabaseClient
): Promise<void> {
  // Cannot change code if account has entries
  if (updates.code && updates.code !== account.code) {
    const hasEntries = await repo.hasPostedEntries(account.id, supabase);
    if (hasEntries) {
      throw new AccountingError(
        'ACCOUNT_CODE_IMMUTABLE',
        'No se puede cambiar el código de una cuenta con pólizas contabilizadas',
        account.id
      );
    }
  }
}

/**
 * Validates an account can be deleted.
 */
export async function validateDeleteAccount(
  account: Account,
  supabase: SupabaseClient
): Promise<void> {
  // Cannot delete if has posted entries
  const hasEntries = await repo.hasPostedEntries(account.id, supabase);
  if (hasEntries) {
    throw new AccountingError(
      'ACCOUNT_HAS_ENTRIES',
      'No se puede eliminar una cuenta con pólizas contabilizadas',
      account.id
    );
  }

  // Cannot delete if has active children
  const hasChildren = await repo.hasActiveChildren(account.id, supabase);
  if (hasChildren) {
    throw new AccountingError(
      'ACCOUNT_HAS_CHILDREN',
      'No se puede eliminar una cuenta con subcuentas activas',
      account.id
    );
  }
}

/**
 * Validates the entire chart of accounts for SAT filing compliance.
 */
export async function validateChartForFiling(
  organizationId: string,
  supabase: SupabaseClient
): Promise<ChartValidationResult> {
  const errors: ValidationError[] = [];

  // 1. Check for postable accounts missing agrupador code
  const missingAgrupador = await repo.getAccountsMissingAgrupador(organizationId, supabase);
  if (missingAgrupador.length > 0) {
    errors.push({
      code: 'MISSING_AGRUPADOR',
      severity: 'error',
      message: `${missingAgrupador.length} cuentas contabilizables no tienen código agrupador SAT`,
      details: missingAgrupador.map(a => ({ code: a.code, name: a.name })),
    });
  }

  // 2. Validate naturaleza consistency
  const allAccounts = await repo.getAccountTreeFlat(organizationId, supabase);
  const naturalezaIssues = allAccounts.filter(a =>
    !isNaturalezaConsistent(a.accountType, a.satNaturaleza)
  );
  if (naturalezaIssues.length > 0) {
    errors.push({
      code: 'NATURALEZA_MISMATCH',
      severity: 'warning',
      message: `${naturalezaIssues.length} cuentas tienen naturaleza inconsistente con su tipo`,
      details: naturalezaIssues.map(a => ({
        code: a.code,
        name: a.name,
        accountType: a.accountType,
        naturaleza: a.satNaturaleza,
      })),
    });
  }

  // 3. Check hierarchy integrity
  const orphans = allAccounts.filter(a =>
    a.parentId && !allAccounts.find(p => p.id === a.parentId)
  );
  if (orphans.length > 0) {
    errors.push({
      code: 'ORPHAN_ACCOUNTS',
      severity: 'error',
      message: `${orphans.length} cuentas tienen padre inexistente`,
      details: orphans.map(a => ({ code: a.code, name: a.name, parentId: a.parentId })),
    });
  }

  return {
    isValid: errors.filter(e => e.severity === 'error').length === 0,
    errors,
  };
}
