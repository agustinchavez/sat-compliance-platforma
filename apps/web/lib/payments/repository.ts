/**
 * Payment Repository
 *
 * All database operations for the payments table.
 * Uses service-role Supabase client passed as parameter (no singleton).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Payment, PaymentStatus, PaymentMethodCode, PaymentFilters } from './types';
import { PaymentError } from './errors';

/**
 * Database row shape from Supabase
 */
interface PaymentRow {
  id: string;
  organization_id: string;
  invoice_id: string;
  amount: number;
  currency: string;
  exchange_rate: number;
  payment_date: string;
  payment_method: string;
  reference_number: string | null;
  bank_account_origin: string | null;
  bank_account_dest: string | null;
  bank_rfc_origin: string | null;
  bank_rfc_dest: string | null;
  bank_name_external: string | null;
  notes: string | null;
  status: string;
  cfdi_uuid: string | null;
  cfdi_xml: string | null;
  pdf_url: string | null;
  voided_at: string | null;
  void_reason: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Maps database row to domain Payment type
 */
function mapRowToPayment(row: PaymentRow): Payment {
  return {
    id: row.id,
    organizationId: row.organization_id,
    invoiceId: row.invoice_id,
    amount: row.amount,
    currency: row.currency,
    exchangeRate: row.exchange_rate,
    paymentDate: row.payment_date,
    paymentMethod: row.payment_method as PaymentMethodCode,
    referenceNumber: row.reference_number || undefined,
    bankAccountOrigin: row.bank_account_origin || undefined,
    bankAccountDest: row.bank_account_dest || undefined,
    bankRfcOrigin: row.bank_rfc_origin || undefined,
    bankRfcDest: row.bank_rfc_dest || undefined,
    bankNameExternal: row.bank_name_external || undefined,
    notes: row.notes || undefined,
    status: row.status as PaymentStatus,
    cfdiUuid: row.cfdi_uuid || undefined,
    cfdiXml: row.cfdi_xml || undefined,
    pdfUrl: row.pdf_url || undefined,
    voidedAt: row.voided_at || undefined,
    voidReason: row.void_reason || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Creates a new payment record
 */
export async function createPayment(
  supabase: SupabaseClient,
  payment: Omit<Payment, 'id' | 'createdAt' | 'updatedAt'>
): Promise<Payment> {
  const { data, error } = await supabase
    .from('payments')
    .insert({
      organization_id: payment.organizationId,
      invoice_id: payment.invoiceId,
      amount: payment.amount,
      currency: payment.currency,
      exchange_rate: payment.exchangeRate,
      payment_date: payment.paymentDate,
      payment_method: payment.paymentMethod,
      reference_number: payment.referenceNumber || null,
      bank_account_origin: payment.bankAccountOrigin || null,
      bank_account_dest: payment.bankAccountDest || null,
      bank_rfc_origin: payment.bankRfcOrigin || null,
      bank_rfc_dest: payment.bankRfcDest || null,
      bank_name_external: payment.bankNameExternal || null,
      notes: payment.notes || null,
      status: payment.status,
      cfdi_uuid: payment.cfdiUuid || null,
      cfdi_xml: payment.cfdiXml || null,
      pdf_url: payment.pdfUrl || null,
      voided_at: payment.voidedAt || null,
      void_reason: payment.voidReason || null,
    })
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to create payment: ${error.message}`);
  }

  return mapRowToPayment(data as PaymentRow);
}

/**
 * Finds a payment by ID, scoped to organization for RLS enforcement
 */
export async function findPaymentById(
  supabase: SupabaseClient,
  paymentId: string,
  organizationId: string
): Promise<Payment | null> {
  const { data, error } = await supabase
    .from('payments')
    .select('*')
    .eq('id', paymentId)
    .eq('organization_id', organizationId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      // Not found
      return null;
    }
    throw new Error(`Failed to find payment: ${error.message}`);
  }

  return data ? mapRowToPayment(data as PaymentRow) : null;
}

/**
 * Finds all payments for an invoice (including voided)
 */
export async function findPaymentsByInvoice(
  supabase: SupabaseClient,
  invoiceId: string
): Promise<Payment[]> {
  const { data, error } = await supabase
    .from('payments')
    .select('*')
    .eq('invoice_id', invoiceId)
    .order('created_at', { ascending: true });

  if (error) {
    throw new Error(`Failed to find payments: ${error.message}`);
  }

  return (data || []).map(mapRowToPayment);
}

/**
 * Finds payments for an organization with filters
 */
export async function findPaymentsByOrg(
  supabase: SupabaseClient,
  organizationId: string,
  filters: PaymentFilters = {}
): Promise<{ payments: Payment[]; total: number }> {
  let query = supabase
    .from('payments')
    .select('*', { count: 'exact' })
    .eq('organization_id', organizationId);

  // Apply filters
  if (filters.startDate) {
    query = query.gte('payment_date', filters.startDate);
  }

  if (filters.endDate) {
    query = query.lte('payment_date', filters.endDate);
  }

  if (filters.status) {
    query = query.eq('status', filters.status);
  }

  if (filters.invoiceId) {
    query = query.eq('invoice_id', filters.invoiceId);
  }

  if (filters.paymentMethod) {
    query = query.eq('payment_method', filters.paymentMethod);
  }

  // Pagination
  const limit = filters.limit || 50;
  const offset = filters.offset || 0;

  query = query
    .order('payment_date', { ascending: false })
    .range(offset, offset + limit - 1);

  const { data, error, count } = await query;

  if (error) {
    throw new Error(`Failed to find payments: ${error.message}`);
  }

  return {
    payments: (data || []).map(mapRowToPayment),
    total: count || 0,
  };
}

/**
 * Updates a payment record
 */
export async function updatePayment(
  supabase: SupabaseClient,
  paymentId: string,
  updates: Partial<
    Pick<
      Payment,
      | 'amount'
      | 'paymentDate'
      | 'paymentMethod'
      | 'referenceNumber'
      | 'notes'
      | 'status'
      | 'cfdiUuid'
      | 'cfdiXml'
      | 'pdfUrl'
      | 'voidedAt'
      | 'voidReason'
    >
  >
): Promise<Payment> {
  const dbUpdates: Record<string, unknown> = {};

  if (updates.amount !== undefined) dbUpdates.amount = updates.amount;
  if (updates.paymentDate !== undefined) dbUpdates.payment_date = updates.paymentDate;
  if (updates.paymentMethod !== undefined) dbUpdates.payment_method = updates.paymentMethod;
  if (updates.referenceNumber !== undefined) dbUpdates.reference_number = updates.referenceNumber;
  if (updates.notes !== undefined) dbUpdates.notes = updates.notes;
  if (updates.status !== undefined) dbUpdates.status = updates.status;
  if (updates.cfdiUuid !== undefined) dbUpdates.cfdi_uuid = updates.cfdiUuid;
  if (updates.cfdiXml !== undefined) dbUpdates.cfdi_xml = updates.cfdiXml;
  if (updates.pdfUrl !== undefined) dbUpdates.pdf_url = updates.pdfUrl;
  if (updates.voidedAt !== undefined) dbUpdates.voided_at = updates.voidedAt;
  if (updates.voidReason !== undefined) dbUpdates.void_reason = updates.voidReason;

  const { data, error } = await supabase
    .from('payments')
    .update(dbUpdates)
    .eq('id', paymentId)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to update payment: ${error.message}`);
  }

  return mapRowToPayment(data as PaymentRow);
}

/**
 * Soft-deletes a payment (sets status to voided)
 */
export async function softDeletePayment(
  supabase: SupabaseClient,
  paymentId: string,
  reason: string
): Promise<Payment> {
  const { data, error } = await supabase
    .from('payments')
    .update({
      status: 'voided',
      voided_at: new Date().toISOString(),
      void_reason: reason,
    })
    .eq('id', paymentId)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to void payment: ${error.message}`);
  }

  return mapRowToPayment(data as PaymentRow);
}
