/**
 * Financial Reports Service (Component 23)
 *
 * Generate trial balance, income statement, balance sheet.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  TrialBalanceReport,
  IncomeStatement,
  IncomeStatementRow,
  BalanceSheet,
  BalanceSheetRow,
  AccountType,
} from '../types';
import { AccountingError } from '../errors';
import { mapRowToAccount } from '../mappers';
import { computeBalance, splitBalanceToColumns, roundToTwoDecimals } from '../validation';
import { calculateTrialBalance } from '../balances/service';
import { getFiscalPeriod } from '../journal-entries/repository';
import type { ReportOptions, GeneralLedgerReport, GeneralLedgerEntry } from './types';

/**
 * Generates a trial balance report for a fiscal period.
 */
export async function generateTrialBalance(
  organizationId: string,
  periodId: string,
  options: ReportOptions = {},
  supabase: SupabaseClient
): Promise<TrialBalanceReport> {
  const period = await getFiscalPeriod(periodId, supabase);
  if (!period) {
    throw new AccountingError('PERIOD_NOT_FOUND', 'Período no encontrado', periodId);
  }

  let rows = await calculateTrialBalance(organizationId, periodId, supabase);

  // Filter zero-balance rows if requested
  if (!options.includeZeroBalance) {
    rows = rows.filter(r =>
      r.openingDebit !== 0 || r.openingCredit !== 0 ||
      r.periodDebit !== 0 || r.periodCredit !== 0 ||
      r.closingDebit !== 0 || r.closingCredit !== 0
    );
  }

  // Calculate totals
  const totals = {
    openingDebit: roundToTwoDecimals(rows.reduce((s, r) => s + r.openingDebit, 0)),
    openingCredit: roundToTwoDecimals(rows.reduce((s, r) => s + r.openingCredit, 0)),
    periodDebit: roundToTwoDecimals(rows.reduce((s, r) => s + r.periodDebit, 0)),
    periodCredit: roundToTwoDecimals(rows.reduce((s, r) => s + r.periodCredit, 0)),
    closingDebit: roundToTwoDecimals(rows.reduce((s, r) => s + r.closingDebit, 0)),
    closingCredit: roundToTwoDecimals(rows.reduce((s, r) => s + r.closingCredit, 0)),
  };

  return {
    organizationId,
    fiscalPeriodId: periodId,
    year: period.year,
    month: period.month,
    rows,
    totals,
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Generates an income statement for a fiscal period.
 */
export async function generateIncomeStatement(
  organizationId: string,
  periodId: string,
  supabase: SupabaseClient
): Promise<IncomeStatement> {
  const period = await getFiscalPeriod(periodId, supabase);
  if (!period) {
    throw new AccountingError('PERIOD_NOT_FOUND', 'Período no encontrado', periodId);
  }

  // Get all accounts with their balances for this period
  const trialBalance = await calculateTrialBalance(organizationId, periodId, supabase);

  const toRow = (tb: typeof trialBalance[0]): IncomeStatementRow => ({
    accountCode: tb.accountCode,
    accountName: tb.accountName,
    accountType: getAccountTypeFromAgrupador(tb.satAgrupadorCode) ?? 'revenue',
    amount: computeBalance(tb.satNaturaleza, tb.periodDebit, tb.periodCredit),
    depth: tb.satNivel - 1,
  });

  const revenue = trialBalance
    .filter(r => isAccountType(r.satAgrupadorCode, 'revenue'))
    .map(toRow);
  const costOfSales = trialBalance
    .filter(r => isAccountType(r.satAgrupadorCode, 'cost_of_sales'))
    .map(toRow);
  const expenses = trialBalance
    .filter(r => isAccountType(r.satAgrupadorCode, 'expense'))
    .map(toRow);
  const financialResult = trialBalance
    .filter(r => isAccountType(r.satAgrupadorCode, 'financial_result'))
    .map(toRow);
  const otherIncomeExpense = trialBalance
    .filter(r => isAccountType(r.satAgrupadorCode, 'other_income_expense'))
    .map(toRow);

  const totalRevenue = roundToTwoDecimals(revenue.reduce((s, r) => s + Math.abs(r.amount), 0));
  const totalCostOfSales = roundToTwoDecimals(costOfSales.reduce((s, r) => s + Math.abs(r.amount), 0));
  const grossProfit = roundToTwoDecimals(totalRevenue - totalCostOfSales);
  const totalExpenses = roundToTwoDecimals(expenses.reduce((s, r) => s + Math.abs(r.amount), 0));
  const totalFinancialResult = roundToTwoDecimals(financialResult.reduce((s, r) => s + r.amount, 0));
  const totalOtherIncomeExpense = roundToTwoDecimals(otherIncomeExpense.reduce((s, r) => s + r.amount, 0));
  const netIncome = roundToTwoDecimals(grossProfit - totalExpenses + totalFinancialResult + totalOtherIncomeExpense);

  return {
    organizationId,
    periodFrom: period.startDate,
    periodTo: period.endDate,
    revenue,
    costOfSales,
    expenses,
    financialResult,
    otherIncomeExpense,
    totalRevenue,
    totalCostOfSales,
    grossProfit,
    totalExpenses,
    totalFinancialResult,
    totalOtherIncomeExpense,
    netIncome,
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Generates a balance sheet as of a given date.
 */
export async function generateBalanceSheet(
  organizationId: string,
  periodId: string,
  supabase: SupabaseClient
): Promise<BalanceSheet> {
  const period = await getFiscalPeriod(periodId, supabase);
  if (!period) {
    throw new AccountingError('PERIOD_NOT_FOUND', 'Período no encontrado', periodId);
  }

  const trialBalance = await calculateTrialBalance(organizationId, periodId, supabase);

  const toRow = (tb: typeof trialBalance[0]): BalanceSheetRow => {
    const balance = computeBalance(tb.satNaturaleza,
      tb.openingDebit + tb.periodDebit,
      tb.openingCredit + tb.periodCredit
    );
    return {
      accountCode: tb.accountCode,
      accountName: tb.accountName,
      accountType: getAccountTypeFromAgrupador(tb.satAgrupadorCode) ?? 'asset',
      amount: Math.abs(balance),
      depth: tb.satNivel - 1,
    };
  };

  const assets = trialBalance
    .filter(r => isAccountType(r.satAgrupadorCode, 'asset'))
    .map(toRow);
  const liabilities = trialBalance
    .filter(r => isAccountType(r.satAgrupadorCode, 'liability'))
    .map(toRow);
  const equity = trialBalance
    .filter(r => isAccountType(r.satAgrupadorCode, 'equity'))
    .map(toRow);

  const totalAssets = roundToTwoDecimals(assets.reduce((s, r) => s + r.amount, 0));
  const totalLiabilities = roundToTwoDecimals(liabilities.reduce((s, r) => s + r.amount, 0));
  const totalEquity = roundToTwoDecimals(equity.reduce((s, r) => s + r.amount, 0));

  return {
    organizationId,
    asOfDate: period.endDate,
    assets,
    liabilities,
    equity,
    totalAssets,
    totalLiabilities,
    totalEquity,
    generatedAt: new Date().toISOString(),
  };
}

// Helper to classify accounts by agrupador code range
function isAccountType(agrupadorCode: string | undefined, type: AccountType): boolean {
  if (!agrupadorCode) return false;
  const code = parseInt(agrupadorCode.split('.')[0], 10);
  const ranges: Record<string, [number, number]> = {
    asset: [100, 199],
    liability: [200, 299],
    equity: [300, 399],
    revenue: [400, 499],
    cost_of_sales: [500, 599],
    expense: [600, 699],
    financial_result: [700, 799],
    other_income_expense: [800, 899],
    order: [900, 999],
  };
  const [min, max] = ranges[type] ?? [0, 0];
  return code >= min && code <= max;
}

function getAccountTypeFromAgrupador(agrupadorCode: string | undefined): AccountType | null {
  if (!agrupadorCode) return null;
  const code = parseInt(agrupadorCode.split('.')[0], 10);
  if (code >= 100 && code <= 199) return 'asset';
  if (code >= 200 && code <= 299) return 'liability';
  if (code >= 300 && code <= 399) return 'equity';
  if (code >= 400 && code <= 499) return 'revenue';
  if (code >= 500 && code <= 599) return 'cost_of_sales';
  if (code >= 600 && code <= 699) return 'expense';
  if (code >= 700 && code <= 799) return 'financial_result';
  if (code >= 800 && code <= 899) return 'other_income_expense';
  if (code >= 900 && code <= 999) return 'order';
  return null;
}
