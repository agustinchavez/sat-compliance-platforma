/**
 * Payment Service (Component 18)
 * Stub for turborepo workspace — full implementation in /apps/web/lib/payments/service.ts
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { CreatePaymentInput, Payment, PaymentSummary } from './types';

export async function recordPayment(
  _invoiceId: string,
  _organizationId: string,
  _input: CreatePaymentInput,
  _supabase: SupabaseClient
): Promise<Payment> {
  throw new Error('Stub: use full implementation');
}

export async function getInvoicePayments(
  _invoiceId: string,
  _organizationId: string,
  _supabase: SupabaseClient
): Promise<{ payments: Payment[]; summary: PaymentSummary }> {
  throw new Error('Stub: use full implementation');
}

export async function calculateOutstandingBalance(
  _invoiceId: string,
  _supabase: SupabaseClient
): Promise<PaymentSummary> {
  throw new Error('Stub: use full implementation');
}
