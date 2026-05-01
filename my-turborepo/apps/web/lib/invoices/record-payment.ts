/**
 * Payment Recording Bridge (Component 18)
 *
 * Public bridge for recording payments — called by Server Actions or API routes.
 * This provides a clean interface from the invoice module to the payment service.
 */

import { createClient } from '@supabase/supabase-js';
import {
  recordPayment,
  getInvoicePayments,
  calculateOutstandingBalance,
} from '@/lib/payments/service';
import type { CreatePaymentInput, Payment, PaymentSummary } from '@/lib/payments/types';

/**
 * Records a payment and handles all downstream effects.
 * This is the only function a Server Action should call.
 *
 * @returns Payment record with CFDI data (if PPD) and invoice payment status
 */
export async function recordAndProcessPayment(
  invoiceId: string,
  organizationId: string,
  input: CreatePaymentInput
): Promise<{
  payment: Payment;
  cfdiGenerated: boolean;
  cfdiUuid?: string;
  invoiceFullyPaid: boolean;
}> {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const payment = await recordPayment(invoiceId, organizationId, input, supabase);

  // Check if invoice is now fully paid
  const summary = await calculateOutstandingBalance(invoiceId, supabase);

  return {
    payment,
    cfdiGenerated: !!payment.cfdiUuid,
    cfdiUuid: payment.cfdiUuid,
    invoiceFullyPaid: summary.isFullyPaid,
  };
}

/**
 * Returns a full payment summary for display in the invoice detail view.
 */
export async function getInvoicePaymentSummary(
  invoiceId: string,
  organizationId: string
): Promise<{ payments: Payment[]; summary: PaymentSummary }> {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  return await getInvoicePayments(invoiceId, organizationId, supabase);
}
