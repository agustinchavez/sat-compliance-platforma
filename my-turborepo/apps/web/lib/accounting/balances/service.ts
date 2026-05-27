/**
 * Balance Service (Components 21-23)
 *
 * Hybrid balance calculation: monthly snapshots + on-demand delta.
 * Period close/reopen operations.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  AccountBalance,
  BalanceSnapshot,
  TrialBalanceRow,
  PeriodCloseResult,
  Account,
} from '../types';
import { AccountingError } from '../errors';
import { mapRowToBalanceSnapshot, mapRowToAccount } from '../mappers';
import { computeBalance, splitBalanceToColumns, roundToTwoDecimals } from '../validation';
import { getFiscalPeriod, updateFiscalPeriod, getPostedEntriesForPeriod } from '../journal-entries/repository';

/**
 * Calculates the balance for a single account as of a given date.
 * Uses snapshots for prior periods + delta from current period.
 */
export async function calculateAccountBalance(
  organizationId: string,
  accountId: string,
  asOfDate: string,
  supabase: SupabaseClient
): Promise<AccountBalance> {
  // Get account info
  const { data: accountRow } = await supabase
    .from('chart_of_accounts')
    .select('*')
    .eq('id', accountId)
    .single();

  if (!accountRow) {
    throw new AccountingError('ACCOUNT_NOT_FOUND', 'Cuenta no encontrada', accountId);
  }

  const account = mapRowToAccount(accountRow);

  // FIX-3.3: Get the latest sealed snapshot, ordered by the period's end_date
  // (not generated_at, which can be misleading for re-generated snapshots)
  const { data: snapshotRow } = await supabase
    .from('account_balance_snapshots')
    .select(`
      *,
      tax_periods!inner(end_date)
    `)
    .eq('organization_id', organizationId)
    .eq('account_id', accountId)
    .eq('is_sealed', true)
    .lte('tax_periods.end_date', asOfDate)
    .order('tax_periods(end_date)', { ascending: false } as any)
    .limit(1)
    .maybeSingle();

  let openingBalance = 0;
  let snapshotEndDate: string | null = null;

  if (snapshotRow) {
    const snapshot = mapRowToBalanceSnapshot(snapshotRow);
    openingBalance = snapshot.closingBalance;
    snapshotEndDate = (snapshotRow as any).tax_periods?.end_date ?? null;
  }

  // Get delta from posted journal entry lines after snapshot
  let deltaQuery = supabase
    .from('journal_entry_lines')
    .select('debit, credit')
    .eq('organization_id', organizationId)
    .eq('account_id', accountId);

  // Only posted entries
  // We need to join with journal_entries for status and date filtering
  // Using a workaround since Supabase doesn't easily do joins in select
  const { data: entryLines } = await supabase
    .from('journal_entry_lines')
    .select(`
      debit,
      credit,
      journal_entry_id,
      journal_entries!inner(status, entry_date)
    `)
    .eq('organization_id', organizationId)
    .eq('account_id', accountId)
    .eq('journal_entries.status', 'posted')
    .lte('journal_entries.entry_date', asOfDate);

  let totalDebit = 0;
  let totalCredit = 0;

  for (const line of (entryLines || [])) {
    const entryDate = (line as any).journal_entries?.entry_date;
    // Skip lines already included in snapshot
    if (snapshotEndDate && entryDate <= snapshotEndDate) continue;
    totalDebit += parseFloat(line.debit ?? '0');
    totalCredit += parseFloat(line.credit ?? '0');
  }

  totalDebit = roundToTwoDecimals(totalDebit);
  totalCredit = roundToTwoDecimals(totalCredit);

  const closingBalance = roundToTwoDecimals(
    openingBalance + computeBalance(account.satNaturaleza, totalDebit, totalCredit)
  );

  return {
    accountId: account.id,
    accountCode: account.code,
    accountName: account.name,
    openingBalance,
    totalDebit,
    totalCredit,
    closingBalance,
  };
}

/**
 * Calculates trial balance for all accounts in a period.
 */
export async function calculateTrialBalance(
  organizationId: string,
  periodId: string,
  supabase: SupabaseClient
): Promise<TrialBalanceRow[]> {
  const period = await getFiscalPeriod(periodId, supabase);
  if (!period) {
    throw new AccountingError('PERIOD_NOT_FOUND', 'Período no encontrado', periodId);
  }

  // Get all active accounts
  const { data: accountRows } = await supabase
    .from('chart_of_accounts')
    .select('*')
    .eq('organization_id', organizationId)
    .is('deleted_at', null)
    .eq('is_active', true)
    .order('materialized_path', { ascending: true });

  if (!accountRows || accountRows.length === 0) return [];

  const rows: TrialBalanceRow[] = [];

  for (const accountRow of accountRows) {
    const account = mapRowToAccount(accountRow);

    // FIX-3.4: Get opening balance from PRIOR period's sealed snapshot closing_balance.
    // For the current period, the opening balance is the previous period's closing balance.
    // We find the most recent sealed snapshot for this account with a period end_date
    // strictly before the current period's start_date.
    const { data: priorSnapshotRow } = await supabase
      .from('account_balance_snapshots')
      .select(`
        closing_balance,
        tax_periods!inner(end_date)
      `)
      .eq('organization_id', organizationId)
      .eq('account_id', account.id)
      .eq('is_sealed', true)
      .lt('tax_periods.end_date', period.startDate)
      .order('tax_periods(end_date)', { ascending: false } as any)
      .limit(1)
      .maybeSingle();

    let opening = 0;
    if (priorSnapshotRow) {
      opening = parseFloat((priorSnapshotRow as any).closing_balance ?? '0');
    }

    // Get period movements
    const { data: lineAgg } = await supabase
      .from('journal_entry_lines')
      .select(`
        debit,
        credit,
        journal_entries!inner(status, fiscal_period_id)
      `)
      .eq('organization_id', organizationId)
      .eq('account_id', account.id)
      .eq('journal_entries.status', 'posted')
      .eq('journal_entries.fiscal_period_id', periodId);

    let periodDebit = 0;
    let periodCredit = 0;
    for (const line of (lineAgg || [])) {
      periodDebit += parseFloat(line.debit ?? '0');
      periodCredit += parseFloat(line.credit ?? '0');
    }

    periodDebit = roundToTwoDecimals(periodDebit);
    periodCredit = roundToTwoDecimals(periodCredit);

    const closingBalance = roundToTwoDecimals(
      opening + computeBalance(account.satNaturaleza, periodDebit, periodCredit)
    );

    const openingSplit = splitBalanceToColumns(opening, account.satNaturaleza);
    const closingSplit = splitBalanceToColumns(closingBalance, account.satNaturaleza);

    rows.push({
      accountId: account.id,
      accountCode: account.code,
      accountName: account.name,
      satAgrupadorCode: account.satAgrupadorCode,
      satNivel: account.satNivel,
      satNaturaleza: account.satNaturaleza,
      openingDebit: openingSplit.debit,
      openingCredit: openingSplit.credit,
      periodDebit,
      periodCredit,
      closingDebit: closingSplit.debit,
      closingCredit: closingSplit.credit,
    });
  }

  return rows;
}

/**
 * FIX-3.5: Pre-close validation result.
 */
export interface PeriodCloseValidation {
  canClose: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * FIX-3.5: Validates a period is ready for close.
 * Blocking errors prevent close; warnings are informational.
 */
export async function validatePeriodForClose(
  organizationId: string,
  periodId: string,
  supabase: SupabaseClient
): Promise<PeriodCloseValidation> {
  const errors: string[] = [];
  const warnings: string[] = [];

  const period = await getFiscalPeriod(periodId, supabase);
  if (!period) {
    return { canClose: false, errors: ['Período no encontrado'], warnings: [] };
  }

  if (period.status === 'closed') {
    return { canClose: false, errors: ['El período ya está cerrado'], warnings: [] };
  }

  // Check for draft entries — these should be posted or deleted before close
  const { count: draftCount } = await supabase
    .from('journal_entries')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', organizationId)
    .eq('fiscal_period_id', periodId)
    .eq('status', 'draft');

  if (draftCount && draftCount > 0) {
    errors.push(`Hay ${draftCount} póliza(s) en borrador. Deben ser contabilizadas o eliminadas antes del cierre.`);
  }

  // Check all posted entries are balanced
  const entries = await getPostedEntriesForPeriod(organizationId, periodId, supabase);
  for (const entry of entries) {
    const diff = Math.abs(entry.totalDebit - entry.totalCredit);
    if (diff >= 0.01) {
      errors.push(
        `Póliza ${entry.entryNumber} está desbalanceada: cargo=${entry.totalDebit}, abono=${entry.totalCredit}`
      );
    }
  }

  // Warning: check if prior period is closed
  if (period.month > 1) {
    const { data: priorPeriod } = await supabase
      .from('tax_periods')
      .select('status')
      .eq('organization_id', organizationId)
      .eq('year', period.year)
      .eq('month', period.month - 1)
      .maybeSingle();

    if (priorPeriod && priorPeriod.status !== 'closed') {
      warnings.push('El período anterior no está cerrado. Se recomienda cerrar períodos en orden cronológico.');
    }
  }

  // Warning: no entries in period
  if (entries.length === 0) {
    warnings.push('No hay pólizas contabilizadas en este período.');
  }

  return {
    canClose: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Closes a fiscal period: generates snapshots for all accounts and seals them.
 * FIX-3.5: Now runs pre-close validation before proceeding.
 */
export async function closePeriod(
  organizationId: string,
  periodId: string,
  userId: string,
  reason: string,
  supabase: SupabaseClient
): Promise<PeriodCloseResult> {
  // FIX-3.5: Pre-close validation
  const validation = await validatePeriodForClose(organizationId, periodId, supabase);
  if (!validation.canClose) {
    throw new AccountingError(
      'CLOSE_VALIDATION_FAILED',
      `No se puede cerrar el período: ${validation.errors.join('; ')}`,
      periodId
    );
  }

  const period = await getFiscalPeriod(periodId, supabase);
  if (!period) {
    throw new AccountingError('PERIOD_NOT_FOUND', 'Período no encontrado', periodId);
  }
  if (period.status === 'closed') {
    throw new AccountingError('INVALID_OPERATION', 'El período ya está cerrado', periodId);
  }

  // Calculate trial balance to generate snapshots
  const trialBalance = await calculateTrialBalance(organizationId, periodId, supabase);

  // Upsert snapshots
  let snapshotsCreated = 0;
  for (const row of trialBalance) {
    const closingBalance = computeBalance(
      row.satNaturaleza,
      row.openingDebit + row.periodDebit,
      row.openingCredit + row.periodCredit
    );

    await supabase
      .from('account_balance_snapshots')
      .upsert({
        organization_id: organizationId,
        account_id: row.accountId,
        fiscal_period_id: periodId,
        opening_balance: computeBalance(row.satNaturaleza, row.openingDebit, row.openingCredit),
        total_debit: row.periodDebit,
        total_credit: row.periodCredit,
        closing_balance: closingBalance,
        is_sealed: true,
        sealed_at: new Date().toISOString(),
        generated_at: new Date().toISOString(),
      }, {
        onConflict: 'organization_id,account_id,fiscal_period_id',
      });

    snapshotsCreated++;
  }

  // Update period status
  const closedAt = new Date().toISOString();
  await updateFiscalPeriod(periodId, {
    status: 'closed',
    closed_at: closedAt,
    closed_by: userId,
    close_reason: reason,
  }, supabase);

  return {
    periodId,
    snapshotsCreated,
    closedAt,
  };
}

/**
 * Reopens a closed fiscal period (admin operation with reason).
 */
export async function reopenPeriod(
  organizationId: string,
  periodId: string,
  userId: string,
  reason: string,
  supabase: SupabaseClient
): Promise<void> {
  const period = await getFiscalPeriod(periodId, supabase);
  if (!period) {
    throw new AccountingError('PERIOD_NOT_FOUND', 'Período no encontrado', periodId);
  }
  if (period.status !== 'closed') {
    throw new AccountingError('PERIOD_NOT_CLOSED', 'Solo se pueden reabrir períodos cerrados', periodId);
  }

  // Unseal snapshots
  await supabase
    .from('account_balance_snapshots')
    .update({ is_sealed: false, sealed_at: null })
    .eq('organization_id', organizationId)
    .eq('fiscal_period_id', periodId);

  // Update period status
  await updateFiscalPeriod(periodId, {
    status: 'reopened',
    closed_at: null,
    closed_by: null,
    close_reason: `Reabierto por: ${reason}`,
  }, supabase);
}
