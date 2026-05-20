/**
 * Expense Repository (Component 20)
 *
 * All database operations for the expenses table.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  Expense,
  CreateExpenseInput,
  UpdateExpenseInput,
  ExpenseFilters,
  ExpensePagination,
  ExpenseListResult,
  ExpenseStatus,
} from './types';
import { ExpenseError } from './errors';

/**
 * Maps DB row to Expense type
 */
function mapRowToExpense(row: any): Expense {
  return {
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
  };
}

/**
 * Creates a new expense record.
 */
export async function createExpense(
  supabase: SupabaseClient,
  organizationId: string,
  userId: string,
  data: CreateExpenseInput & {
    status?: ExpenseStatus;
    isDeductible: boolean;
    deductibilityPercent: number;
    deductibilityNotes?: string;
    ocrConfidence?: number;
    receiptUrl?: string;
    xmlUrl?: string;
    cfdiUuid?: string;
  }
): Promise<Expense> {
  const { data: row, error } = await supabase
    .from('expenses')
    .insert({
      organization_id: organizationId,
      created_by: userId,
      vendor_rfc: data.vendorRfc,
      vendor_name: data.vendorName,
      description: data.description,
      category: data.category,
      amount: data.amount,
      tax_amount: data.taxAmount ?? 0,
      total: data.total,
      currency: data.currency ?? 'MXN',
      expense_date: data.expenseDate,
      payment_method: data.paymentMethod,
      notes: data.notes,
      tags: data.tags,
      status: data.status ?? 'received',
      is_deductible: data.isDeductible,
      deductibility_percent: data.deductibilityPercent,
      deductibility_notes: data.deductibilityNotes,
      ocr_confidence: data.ocrConfidence,
      receipt_url: data.receiptUrl,
      xml_url: data.xmlUrl,
      cfdi_uuid: data.cfdiUuid,
    })
    .select()
    .single();

  if (error) {
    throw new ExpenseError(
      'INVALID_EXPENSE_DATA',
      `Failed to create expense: ${error.message}`,
      undefined,
      error as Error
    );
  }

  return mapRowToExpense(row);
}

/**
 * Finds an expense by ID (excludes soft-deleted).
 */
export async function findExpenseById(
  supabase: SupabaseClient,
  expenseId: string,
  organizationId: string
): Promise<Expense | null> {
  const { data: row, error } = await supabase
    .from('expenses')
    .select('*')
    .eq('id', expenseId)
    .eq('organization_id', organizationId)
    .is('deleted_at', null)
    .maybeSingle();

  if (error) {
    throw new ExpenseError(
      'EXPENSE_NOT_FOUND',
      `Failed to fetch expense: ${error.message}`,
      expenseId,
      error as Error
    );
  }

  return row ? mapRowToExpense(row) : null;
}

/**
 * Finds expenses by organization with filters and pagination.
 */
export async function findExpensesByOrg(
  supabase: SupabaseClient,
  organizationId: string,
  filters: ExpenseFilters,
  pagination: ExpensePagination
): Promise<ExpenseListResult> {
  let query = supabase
    .from('expenses')
    .select('*', { count: 'exact' })
    .eq('organization_id', organizationId)
    .is('deleted_at', null);

  // Apply filters
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

  // Apply pagination
  const offset = (pagination.page - 1) * pagination.limit;
  query = query
    .order('expense_date', { ascending: false })
    .range(offset, offset + pagination.limit - 1);

  const { data: rows, error, count } = await query;

  if (error) {
    throw new ExpenseError(
      'INVALID_EXPENSE_DATA',
      `Failed to fetch expenses: ${error.message}`,
      undefined,
      error as Error
    );
  }

  const expenses = rows?.map(mapRowToExpense) ?? [];
  const total = count ?? 0;

  return {
    expenses,
    total,
    page: pagination.page,
    limit: pagination.limit,
    totalPages: Math.ceil(total / pagination.limit),
  };
}

/**
 * Updates an expense (partial update).
 */
export async function updateExpense(
  supabase: SupabaseClient,
  expenseId: string,
  organizationId: string,
  updates: Partial<UpdateExpenseInput & {
    status?: ExpenseStatus;
    isDeductible?: boolean;
    deductibilityPercent?: number;
    deductibilityNotes?: string;
    validatedAt?: string;
    receiptUrl?: string;
    xmlUrl?: string;
    cfdiUuid?: string;
    ocrConfidence?: number;
  }>
): Promise<Expense> {
  const updateData: any = {};

  if (updates.vendorName !== undefined) updateData.vendor_name = updates.vendorName;
  if (updates.description !== undefined) updateData.description = updates.description;
  if (updates.category !== undefined) updateData.category = updates.category;
  if (updates.amount !== undefined) updateData.amount = updates.amount;
  if (updates.taxAmount !== undefined) updateData.tax_amount = updates.taxAmount;
  if (updates.total !== undefined) updateData.total = updates.total;
  if (updates.expenseDate !== undefined) updateData.expense_date = updates.expenseDate;
  if (updates.vendorRfc !== undefined) updateData.vendor_rfc = updates.vendorRfc;
  if (updates.paymentMethod !== undefined) updateData.payment_method = updates.paymentMethod;
  if (updates.notes !== undefined) updateData.notes = updates.notes;
  if (updates.tags !== undefined) updateData.tags = updates.tags;
  if (updates.status !== undefined) updateData.status = updates.status;
  if (updates.isDeductible !== undefined) updateData.is_deductible = updates.isDeductible;
  if (updates.deductibilityPercent !== undefined) updateData.deductibility_percent = updates.deductibilityPercent;
  if (updates.deductibilityNotes !== undefined) updateData.deductibility_notes = updates.deductibilityNotes;
  if (updates.validatedAt !== undefined) updateData.validated_at = updates.validatedAt;
  if (updates.receiptUrl !== undefined) updateData.receipt_url = updates.receiptUrl;
  if (updates.xmlUrl !== undefined) updateData.xml_url = updates.xmlUrl;
  if (updates.cfdiUuid !== undefined) updateData.cfdi_uuid = updates.cfdiUuid;
  if (updates.ocrConfidence !== undefined) updateData.ocr_confidence = updates.ocrConfidence;

  const { data: row, error } = await supabase
    .from('expenses')
    .update(updateData)
    .eq('id', expenseId)
    .eq('organization_id', organizationId)
    .is('deleted_at', null)
    .select()
    .single();

  if (error) {
    throw new ExpenseError(
      'EXPENSE_NOT_FOUND',
      `Failed to update expense: ${error.message}`,
      expenseId,
      error as Error
    );
  }

  return mapRowToExpense(row);
}

/**
 * Soft deletes an expense (sets deleted_at timestamp).
 */
export async function softDeleteExpense(
  supabase: SupabaseClient,
  expenseId: string,
  organizationId: string
): Promise<void> {
  const { error } = await supabase
    .from('expenses')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', expenseId)
    .eq('organization_id', organizationId)
    .is('deleted_at', null);

  if (error) {
    throw new ExpenseError(
      'EXPENSE_NOT_FOUND',
      `Failed to delete expense: ${error.message}`,
      expenseId,
      error as Error
    );
  }
}

/**
 * Finds expenses by CFDI UUID (for duplicate detection).
 */
export async function findExpensesByCFDIUuid(
  supabase: SupabaseClient,
  cfdiUuid: string,
  organizationId: string
): Promise<Expense[]> {
  const { data: rows, error } = await supabase
    .from('expenses')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('cfdi_uuid', cfdiUuid)
    .is('deleted_at', null);

  if (error) {
    throw new ExpenseError(
      'INVALID_EXPENSE_DATA',
      `Failed to find expenses by CFDI UUID: ${error.message}`,
      undefined,
      error as Error
    );
  }

  return rows?.map(mapRowToExpense) ?? [];
}
