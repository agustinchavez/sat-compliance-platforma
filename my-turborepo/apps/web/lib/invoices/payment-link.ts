/**
 * Invoice Payment Link Bridge (Component 19)
 *
 * Public API for creating payment links for invoices.
 * This is the recommended way to access Stripe payment functionality.
 */

import {
  createCheckoutSession as stripeCreateCheckoutSession,
  createPaymentLink as stripeCreatePaymentLink,
  expirePaymentLink as stripeExpirePaymentLink,
  CheckoutSessionResult,
  PaymentLinkResult,
} from '@/lib/stripe';
import { createServiceRoleClient } from '@/lib/supabase/service-role-client';

/**
 * Input for creating an invoice payment link.
 */
export interface CreateInvoicePaymentLinkInput {
  invoiceId: string;
  usePaymentLink?: boolean; // false = Checkout Session (default), true = Payment Link
  expiresAt?: Date;
}

/**
 * Result from creating an invoice payment link.
 */
export interface CreateInvoicePaymentLinkResult {
  url: string;
  type: 'checkout_session' | 'payment_link';
  stripeId: string; // Session ID or Payment Link ID
  dbRecordId: string;
}

/**
 * Creates a payment link for an invoice.
 *
 * By default, creates a Checkout Session (single-use payment URL).
 * Set usePaymentLink: true to create a reusable Payment Link instead.
 *
 * This function:
 * 1. Fetches invoice and organization details from DB
 * 2. Calls the appropriate Stripe function
 * 3. Returns a shareable payment URL
 *
 * @param input - Payment link creation input
 * @returns Payment link result with URL
 * @throws Error if invoice not found or validation fails
 */
export async function createInvoicePaymentLink(
  input: CreateInvoicePaymentLinkInput
): Promise<CreateInvoicePaymentLinkResult> {
  const supabase = createServiceRoleClient();

  // 1. Fetch invoice details
  const { data: invoice, error: invoiceError } = await supabase
    .from('invoices')
    .select(`
      id,
      organization_id,
      total_amount,
      folio,
      receiver_name,
      receiver_email,
      organizations (
        stripe_customer_id
      )
    `)
    .eq('id', input.invoiceId)
    .single();

  if (invoiceError || !invoice) {
    throw new Error(`Invoice ${input.invoiceId} not found: ${invoiceError?.message}`);
  }

  // 2. Build Stripe input
  const stripeInput = {
    invoiceId: invoice.id,
    organizationId: invoice.organization_id,
    amountMXN: invoice.total_amount,
    invoiceFolio: invoice.folio,
    receiverName: invoice.receiver_name,
    customerEmail: invoice.receiver_email || undefined,
    stripeCustomerId: (invoice.organizations as any)?.stripe_customer_id || undefined,
    expiresAt: input.expiresAt,
  };

  // 3. Create checkout session or payment link
  if (input.usePaymentLink) {
    // Payment Link (reusable)
    const result: PaymentLinkResult = await stripeCreatePaymentLink(stripeInput);
    return {
      url: result.url,
      type: 'payment_link',
      stripeId: result.paymentLinkId,
      dbRecordId: result.paymentLinkDbId,
    };
  } else {
    // Checkout Session (default, single-use)
    const result: CheckoutSessionResult = await stripeCreateCheckoutSession(stripeInput);
    return {
      url: result.checkoutUrl,
      type: 'checkout_session',
      stripeId: result.sessionId,
      dbRecordId: result.paymentLinkDbId,
    };
  }
}

/**
 * Expires (deactivates) an invoice payment link.
 *
 * Use this when:
 * - Invoice is cancelled before payment
 * - Link needs to be manually deactivated
 *
 * @param paymentLinkDbId - Database record ID (stripe_payment_links.id)
 */
export async function expireInvoicePaymentLink(
  paymentLinkDbId: string
): Promise<void> {
  await stripeExpirePaymentLink(paymentLinkDbId);
}

/**
 * Gets all payment links for an invoice.
 *
 * @param invoiceId - Invoice UUID
 * @returns Array of payment link records
 */
export async function getInvoicePaymentLinks(invoiceId: string) {
  const supabase = createServiceRoleClient();

  const { data, error } = await supabase
    .from('stripe_payment_links')
    .select('*')
    .eq('invoice_id', invoiceId)
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(`Failed to fetch payment links: ${error.message}`);
  }

  return data;
}
