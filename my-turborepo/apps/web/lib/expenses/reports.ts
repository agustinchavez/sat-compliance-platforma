/**
 * Expense Reports (Component 20)
 *
 * Reporting functions for expense analysis and tax calculations.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Expense, ExpenseCategory, ExpenseFilters, ExpenseStatus } from './types';
import { EXPENSE_CATEGORY_LABELS } from './types';
import { ExpenseError } from './errors';

export interface ExpenseReportSummary {
  organizationId: string;
  dateFrom: string;
  dateTo: string;
  totalExpenses: number;           // Count
  totalAmount: number;             // Sum of total column
  totalDeductible: number;         // Sum where is_deductible = true, weighted by deductibility_percent
  totalNonDeductible: number;
  totalIVA: number;                // Sum of tax_amount (IVA creditable for IVA returns)
  byCategory: Array<{
    category: ExpenseCategory;
    label: string;
    count: number;
    amount: number;
    deductibleAmount: number;
  }>;
  byStatus: Record<ExpenseStatus, number>;
}

/**
 * Generates an expense summary report for a date range.
 * This is the main input for Component 24 (Tax Calculation Engine)'s IVA and ISR calculations.
 *
 * deductibleAmount per category = SUM(total * deductibility_percent / 100) WHERE is_deductible = true
 */
export async function generateExpenseReport(
  organizationId: string,
  dateFrom: string,
  dateTo: string,
  supabase: SupabaseClient
): Promise<ExpenseReportSummary> {
  // Fetch all expenses in date range (excluding soft-deleted)
  const { data: expenses, error } = await supabase
    .from('expenses')
    .select('*')
    .eq('organization_id', organizationId)
    .gte('expense_date', dateFrom)
    .lte('expense_date', dateTo)
    .is('deleted_at', null);

  if (error) {
    throw new ExpenseError(
      'INVALID_EXPENSE_DATA',
      `Failed to generate expense report: ${error.message}`,
      undefined,
      error as Error
    );
  }

  const rows = expenses ?? [];

  // Calculate totals
  const totalExpenses = rows.length;
  const totalAmount = rows.reduce((sum, e) => sum + parseFloat(e.total), 0);
  const totalIVA = rows.reduce((sum, e) => sum + parseFloat(e.tax_amount || 0), 0);

  const totalDeductible = rows
    .filter(e => e.is_deductible)
    .reduce((sum, e) => {
      const amount = parseFloat(e.total);
      const percent = parseFloat(e.deductibility_percent || 100);
      return sum + (amount * percent / 100);
    }, 0);

  const totalNonDeductible = totalAmount - totalDeductible;

  // Group by category
  const categoryMap: Record<string, {
    count: number;
    amount: number;
    deductibleAmount: number;
  }> = {};

  for (const row of rows) {
    const cat = row.category as ExpenseCategory;
    if (!categoryMap[cat]) {
      categoryMap[cat] = { count: 0, amount: 0, deductibleAmount: 0 };
    }
    categoryMap[cat].count++;
    categoryMap[cat].amount += parseFloat(row.total);
    if (row.is_deductible) {
      const percent = parseFloat(row.deductibility_percent || 100);
      categoryMap[cat].deductibleAmount += (parseFloat(row.total) * percent / 100);
    }
  }

  const byCategory = Object.entries(categoryMap).map(([category, stats]) => ({
    category: category as ExpenseCategory,
    label: EXPENSE_CATEGORY_LABELS[category as ExpenseCategory],
    count: stats.count,
    amount: stats.amount,
    deductibleAmount: stats.deductibleAmount,
  }));

  // Group by status
  const byStatus: Record<ExpenseStatus, number> = {
    pending_receipt: 0,
    received: 0,
    validated: 0,
    rejected: 0,
  };

  for (const row of rows) {
    byStatus[row.status as ExpenseStatus]++;
  }

  return {
    organizationId,
    dateFrom,
    dateTo,
    totalExpenses,
    totalAmount,
    totalDeductible,
    totalNonDeductible,
    totalIVA,
    byCategory,
    byStatus,
  };
}

/**
 * Returns expenses grouped by category for a period.
 * Used for the expense breakdown dashboard widget.
 */
export async function getExpensesByCategory(
  organizationId: string,
  dateFrom: string,
  dateTo: string,
  supabase: SupabaseClient
): Promise<Array<{ category: ExpenseCategory; label: string; total: number; count: number }>> {
  const { data: rows, error } = await supabase
    .from('expenses')
    .select('category, total')
    .eq('organization_id', organizationId)
    .gte('expense_date', dateFrom)
    .lte('expense_date', dateTo)
    .is('deleted_at', null);

  if (error) {
    throw new ExpenseError(
      'INVALID_EXPENSE_DATA',
      `Failed to get expenses by category: ${error.message}`,
      undefined,
      error as Error
    );
  }

  const categoryMap: Record<string, { total: number; count: number }> = {};
  for (const row of rows ?? []) {
    const cat = row.category as ExpenseCategory;
    if (!categoryMap[cat]) {
      categoryMap[cat] = { total: 0, count: 0 };
    }
    categoryMap[cat].total += parseFloat(row.total);
    categoryMap[cat].count++;
  }

  return Object.entries(categoryMap).map(([category, stats]) => ({
    category: category as ExpenseCategory,
    label: EXPENSE_CATEGORY_LABELS[category as ExpenseCategory],
    total: stats.total,
    count: stats.count,
  }));
}

/**
 * Returns all deductible expenses for a fiscal period.
 * Component 24 calls this to compute ISR deductions.
 *
 * @param period - 'monthly' | 'quarterly' | 'annual'
 * @param year - Fiscal year (e.g., 2026)
 * @param month - Required if period='monthly' (1-12)
 */
export async function getDeductibleExpenses(
  organizationId: string,
  period: 'monthly' | 'quarterly' | 'annual',
  year: number,
  month: number | undefined,
  supabase: SupabaseClient
): Promise<{
  expenses: Expense[];
  totalDeductible: number;
  totalIVACreditable: number;    // IVA from deductible expenses (for IVA return)
}> {
  // Calculate date range based on period
  let dateFrom: string;
  let dateTo: string;

  if (period === 'monthly') {
    if (!month || month < 1 || month > 12) {
      throw new ExpenseError(
        'INVALID_EXPENSE_DATA',
        'Month is required for monthly period and must be between 1-12'
      );
    }
    dateFrom = `${year}-${String(month).padStart(2, '0')}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    dateTo = `${year}-${String(month).padStart(2, '0')}-${lastDay}`;
  } else if (period === 'quarterly') {
    const quarter = month ? Math.ceil(month / 3) : 1;
    const startMonth = (quarter - 1) * 3 + 1;
    const endMonth = quarter * 3;
    dateFrom = `${year}-${String(startMonth).padStart(2, '0')}-01`;
    const lastDay = new Date(year, endMonth, 0).getDate();
    dateTo = `${year}-${String(endMonth).padStart(2, '0')}-${lastDay}`;
  } else {
    // annual
    dateFrom = `${year}-01-01`;
    dateTo = `${year}-12-31`;
  }

  const { data: rows, error } = await supabase
    .from('expenses')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('is_deductible', true)
    .gte('expense_date', dateFrom)
    .lte('expense_date', dateTo)
    .is('deleted_at', null)
    .order('expense_date', { ascending: true });

  if (error) {
    throw new ExpenseError(
      'INVALID_EXPENSE_DATA',
      `Failed to get deductible expenses: ${error.message}`,
      undefined,
      error as Error
    );
  }

  const expenses = (rows ?? []).map(row => ({
    id: row.id,
    organizationId: row.organization_id,
    createdBy: row.created_by,
    vendorRfc: row.vendor_rfc,
    vendorName: row.vendor_name,
    description: row.description,
    category: row.category,
    subcategory: row.subcategory,
    amount: parseFloat(row.amount),
    taxAmount: parseFloat(row.tax_amount || 0),
    total: parseFloat(row.total),
    currency: row.currency,
    cfdiUuid: row.cfdi_uuid,
    xmlUrl: row.xml_url,
    pdfUrl: row.pdf_url,
    receiptUrl: row.receipt_url,
    ocrConfidence: row.ocr_confidence ? parseFloat(row.ocr_confidence) : undefined,
    status: row.status,
    isDeductible: row.is_deductible,
    deductibilityPercent: parseFloat(row.deductibility_percent || 100),
    deductibilityNotes: row.deductibility_notes,
    paymentMethod: row.payment_method,
    expenseDate: row.expense_date,
    validatedAt: row.validated_at,
    notes: row.notes,
    tags: row.tags,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  }));

  const totalDeductible = expenses.reduce((sum, e) => {
    return sum + (e.total * e.deductibilityPercent / 100);
  }, 0);

  const totalIVACreditable = expenses.reduce((sum, e) => {
    // IVA is creditable at the same percentage as the expense deductibility
    return sum + (e.taxAmount * e.deductibilityPercent / 100);
  }, 0);

  return {
    expenses,
    totalDeductible,
    totalIVACreditable,
  };
}

/**
 * Returns expense data in a format suitable for CSV/Excel export.
 * Returns a flat array of records — frontend handles rendering.
 */
export async function getExpensesForExport(
  organizationId: string,
  filters: ExpenseFilters,
  supabase: SupabaseClient
): Promise<Array<Record<string, string | number | boolean>>> {
  let query = supabase
    .from('expenses')
    .select('*')
    .eq('organization_id', organizationId)
    .is('deleted_at', null);

  // Apply filters (same as in repository)
  if (filters.status) {
    if (Array.isArray(filters.status)) {
      query = query.in('status', filters.status);
    } else {
      query = query.eq('status', filters.status);
    }
  }

  if (filters.category) {
    if (Array.isArray(filters.category)) {
      query = query.in('category', filters.category);
    } else {
      query = query.eq('category', filters.category);
    }
  }

  if (filters.isDeductible !== undefined) {
    query = query.eq('is_deductible', filters.isDeductible);
  }

  if (filters.dateFrom) {
    query = query.gte('expense_date', filters.dateFrom);
  }

  if (filters.dateTo) {
    query = query.lte('expense_date', filters.dateTo);
  }

  if (filters.amountMin !== undefined) {
    query = query.gte('total', filters.amountMin);
  }

  if (filters.amountMax !== undefined) {
    query = query.lte('total', filters.amountMax);
  }

  if (filters.vendorRfc) {
    query = query.eq('vendor_rfc', filters.vendorRfc);
  }

  if (filters.search) {
    query = query.or(`vendor_name.ilike.%${filters.search}%,description.ilike.%${filters.search}%`);
  }

  if (filters.tags && filters.tags.length > 0) {
    query = query.contains('tags', filters.tags);
  }

  query = query.order('expense_date', { ascending: false });

  const { data: rows, error } = await query;

  if (error) {
    throw new ExpenseError(
      'INVALID_EXPENSE_DATA',
      `Failed to export expenses: ${error.message}`,
      undefined,
      error as Error
    );
  }

  return (rows ?? []).map(row => ({
    id: row.id,
    fecha: row.expense_date,
    proveedor: row.vendor_name,
    rfc: row.vendor_rfc || '',
    descripcion: row.description,
    categoria: EXPENSE_CATEGORY_LABELS[row.category as ExpenseCategory],
    subtotal: parseFloat(row.amount),
    iva: parseFloat(row.tax_amount || 0),
    total: parseFloat(row.total),
    moneda: row.currency,
    forma_pago: row.payment_method || '',
    deducible: row.is_deductible ? 'Sí' : 'No',
    porcentaje_deducible: parseFloat(row.deductibility_percent || 0),
    cfdi_uuid: row.cfdi_uuid || '',
    estado: row.status,
    notas: row.notes || '',
  }));
}
