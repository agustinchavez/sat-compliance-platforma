/**
 * Stripe Checkout Sessions and Payment Links (Component 19)
 *
 * Handles creation and management of Stripe checkout sessions and payment links.
 */

import { getStripeClient, STRIPE_CONFIG, toCentavos } from './client';
import { StripeGatewayError } from './errors';
import {
  CheckoutSessionInput,
  CheckoutSessionResult,
  PaymentLinkInput,
  PaymentLinkResult,
} from './types';
import { getOrCreateStripeCustomer } from './customers';
import { createServiceRoleClient } from '@/lib/supabase/service-role-client';

/**
 * Creates a Stripe Checkout Session for one-time invoice payment.
 *
 * This is the DEFAULT method for invoice payments. Checkout sessions are:
 * - Single-use URLs that expire after payment or timeout
 * - Best for B2B invoices where each payment is unique
 * - Support custom success/cancel redirect URLs
 *
 * Flow:
 * 1. Validate invoice is in stampable status (stamped or sent)
 * 2. Get or create Stripe customer for the organization
 * 3. Create Stripe Checkout Session with invoice metadata
 * 4. Save session details to stripe_payment_links table
 * 5. Return checkout URL
 *
 * @param input - Checkout session input data
 * @returns Checkout session result with URL and IDs
 * @throws StripeGatewayError if validation fails or Stripe API fails
 */
export async function createCheckoutSession(
  input: CheckoutSessionInput
): Promise<CheckoutSessionResult> {
  const supabase = createServiceRoleClient();
  const stripe = getStripeClient();

  // 1. Validate invoice exists and is in correct status
  const { data: invoice, error: invoiceError } = await supabase
    .from('invoices')
    .select('id, status, total_amount, folio, receiver_name, receiver_email')
    .eq('id', input.invoiceId)
    .single();

  if (invoiceError || !invoice) {
    throw new StripeGatewayError(
      'INVOICE_NOT_FOUND',
      `Invoice ${input.invoiceId} not found`,
      input.invoiceId,
      invoiceError as Error
    );
  }

  // Only stamped or sent invoices can receive payment
  if (!['stamped', 'sent'].includes(invoice.status)) {
    throw new StripeGatewayError(
      'INVOICE_NOT_STAMPABLE',
      `Invoice ${input.invoiceId} has status ${invoice.status}, cannot create payment link`,
      input.invoiceId
    );
  }

  // Check if invoice is already paid
  const { data: existingPayment } = await supabase
    .from('payments')
    .select('id')
    .eq('invoice_id', input.invoiceId)
    .eq('status', 'completed')
    .maybeSingle();

  if (existingPayment) {
    throw new StripeGatewayError(
      'INVOICE_ALREADY_PAID',
      `Invoice ${input.invoiceId} is already paid`,
      input.invoiceId
    );
  }

  // 2. Get or create Stripe customer
  let stripeCustomerId = input.stripeCustomerId;
  if (!stripeCustomerId) {
    stripeCustomerId = await getOrCreateStripeCustomer(
      input.organizationId,
      input.customerEmail || invoice.receiver_email || '',
      input.receiverName || invoice.receiver_name
    );
  }

  // 3. Create Checkout Session
  const amountCentavos = toCentavos(input.amountMXN);
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

  const successUrl = `${baseUrl}${STRIPE_CONFIG.SUCCESS_URL_PATH.replace(
    '{invoiceId}',
    input.invoiceId
  )}?session_id={CHECKOUT_SESSION_ID}`;

  const cancelUrl = `${baseUrl}${STRIPE_CONFIG.CANCEL_URL_PATH.replace(
    '{invoiceId}',
    input.invoiceId
  )}`;

  let session;
  try {
    session = await stripe.checkout.sessions.create({
      customer: stripeCustomerId,
      mode: 'payment',
      line_items: [
        {
          price_data: {
            currency: STRIPE_CONFIG.CURRENCY,
            unit_amount: amountCentavos,
            product_data: {
              name: `Factura ${input.invoiceFolio}`,
              description: `Pago de factura ${input.invoiceFolio}`,
            },
          },
          quantity: 1,
        },
      ],
      success_url: successUrl,
      cancel_url: cancelUrl,
      expires_at: input.expiresAt
        ? Math.floor(input.expiresAt.getTime() / 1000)
        : Math.floor(Date.now() / 1000) + 86400, // 24 hours default
      metadata: {
        invoice_id: input.invoiceId,
        organization_id: input.organizationId,
        folio: input.invoiceFolio,
      },
      payment_intent_data: {
        metadata: {
          invoice_id: input.invoiceId,
          organization_id: input.organizationId,
          folio: input.invoiceFolio,
        },
      },
    });
  } catch (err) {
    throw new StripeGatewayError(
      'CHECKOUT_CREATION_FAILED',
      `Failed to create Stripe checkout session: ${(err as Error).message}`,
      input.invoiceId,
      err as Error
    );
  }

  // 4. Save to database
  const { data: dbRecord, error: dbError } = await supabase
    .from('stripe_payment_links')
    .insert({
      organization_id: input.organizationId,
      invoice_id: input.invoiceId,
      stripe_checkout_session_id: session.id,
      url: session.url!,
      amount_centavos: amountCentavos,
      currency: STRIPE_CONFIG.CURRENCY,
      status: 'active',
      expires_at: new Date(session.expires_at! * 1000).toISOString(),
      metadata: {
        invoice_id: input.invoiceId,
        organization_id: input.organizationId,
        folio: input.invoiceFolio,
      },
    })
    .select('id')
    .single();

  if (dbError) {
    throw new StripeGatewayError(
      'CHECKOUT_CREATION_FAILED',
      `Created Stripe session but failed to save to DB: ${dbError.message}`,
      input.invoiceId,
      dbError as Error
    );
  }

  // 5. Return result
  return {
    checkoutUrl: session.url!,
    sessionId: session.id,
    paymentLinkDbId: dbRecord.id,
  };
}

/**
 * Creates a Stripe Payment Link for reusable invoice payment.
 *
 * Payment Links are:
 * - Reusable URLs that can accept multiple payments
 * - Useful for recurring invoices or templates
 * - Don't support custom redirect URLs (use Stripe-hosted page)
 *
 * This is OPTIONAL — use only when explicitly requested via usePaymentLink flag.
 *
 * @param input - Payment link input data
 * @returns Payment link result with URL and IDs
 * @throws StripeGatewayError if validation fails or Stripe API fails
 */
export async function createPaymentLink(
  input: PaymentLinkInput
): Promise<PaymentLinkResult> {
  const supabase = createServiceRoleClient();
  const stripe = getStripeClient();

  // 1. Validate invoice (same as checkout session)
  const { data: invoice, error: invoiceError } = await supabase
    .from('invoices')
    .select('id, status')
    .eq('id', input.invoiceId)
    .single();

  if (invoiceError || !invoice) {
    throw new StripeGatewayError(
      'INVOICE_NOT_FOUND',
      `Invoice ${input.invoiceId} not found`,
      input.invoiceId,
      invoiceError as Error
    );
  }

  if (!['stamped', 'sent'].includes(invoice.status)) {
    throw new StripeGatewayError(
      'INVOICE_NOT_STAMPABLE',
      `Invoice ${input.invoiceId} has status ${invoice.status}, cannot create payment link`,
      input.invoiceId
    );
  }

  // 2. Create Stripe Product (ephemeral, one per invoice)
  const amountCentavos = toCentavos(input.amountMXN);

  let product;
  try {
    product = await stripe.products.create({
      name: `Factura ${input.invoiceFolio}`,
      metadata: {
        invoice_id: input.invoiceId,
        organization_id: input.organizationId,
      },
    });
  } catch (err) {
    throw new StripeGatewayError(
      'CHECKOUT_CREATION_FAILED',
      `Failed to create Stripe product: ${(err as Error).message}`,
      input.invoiceId,
      err as Error
    );
  }

  // 3. Create Stripe Price
  let price;
  try {
    price = await stripe.prices.create({
      product: product.id,
      currency: STRIPE_CONFIG.CURRENCY,
      unit_amount: amountCentavos,
    });
  } catch (err) {
    throw new StripeGatewayError(
      'CHECKOUT_CREATION_FAILED',
      `Failed to create Stripe price: ${(err as Error).message}`,
      input.invoiceId,
      err as Error
    );
  }

  // 4. Create Payment Link
  let paymentLink;
  try {
    paymentLink = await stripe.paymentLinks.create({
      line_items: [{ price: price.id, quantity: 1 }],
      metadata: {
        invoice_id: input.invoiceId,
        organization_id: input.organizationId,
        folio: input.invoiceFolio,
      },
      after_completion: {
        type: 'hosted_confirmation',
        hosted_confirmation: {
          custom_message: `Pago de factura ${input.invoiceFolio} completado.`,
        },
      },
    });
  } catch (err) {
    throw new StripeGatewayError(
      'CHECKOUT_CREATION_FAILED',
      `Failed to create Stripe payment link: ${(err as Error).message}`,
      input.invoiceId,
      err as Error
    );
  }

  // 5. Save to database
  const { data: dbRecord, error: dbError } = await supabase
    .from('stripe_payment_links')
    .insert({
      organization_id: input.organizationId,
      invoice_id: input.invoiceId,
      stripe_payment_link_id: paymentLink.id,
      url: paymentLink.url,
      amount_centavos: amountCentavos,
      currency: STRIPE_CONFIG.CURRENCY,
      status: 'active',
      expires_at: input.expiresAt?.toISOString(),
      metadata: {
        invoice_id: input.invoiceId,
        organization_id: input.organizationId,
        folio: input.invoiceFolio,
      },
    })
    .select('id')
    .single();

  if (dbError) {
    throw new StripeGatewayError(
      'CHECKOUT_CREATION_FAILED',
      `Created Stripe payment link but failed to save to DB: ${dbError.message}`,
      input.invoiceId,
      dbError as Error
    );
  }

  // 6. Return result
  return {
    url: paymentLink.url,
    paymentLinkId: paymentLink.id,
    paymentLinkDbId: dbRecord.id,
  };
}

/**
 * Expires (deactivates) a Stripe Checkout Session or Payment Link.
 *
 * Use cases:
 * - Invoice was cancelled before payment
 * - Link expired naturally
 * - Manual deactivation by operator
 *
 * @param paymentLinkDbId - Our DB record ID (stripe_payment_links.id)
 * @throws StripeGatewayError if link not found
 */
export async function expirePaymentLink(paymentLinkDbId: string): Promise<void> {
  const supabase = createServiceRoleClient();
  const stripe = getStripeClient();

  // 1. Fetch the link from our DB
  const { data: link, error: fetchError } = await supabase
    .from('stripe_payment_links')
    .select('stripe_checkout_session_id, stripe_payment_link_id, status')
    .eq('id', paymentLinkDbId)
    .single();

  if (fetchError || !link) {
    throw new StripeGatewayError(
      'PAYMENT_LINK_NOT_FOUND',
      `Payment link ${paymentLinkDbId} not found in database`,
      undefined,
      fetchError as Error
    );
  }

  // If already expired, no-op
  if (link.status === 'expired' || link.status === 'cancelled') {
    return;
  }

  // 2. Expire in Stripe (if checkout session, it auto-expires; payment links need deactivation)
  if (link.stripe_payment_link_id) {
    try {
      await stripe.paymentLinks.update(link.stripe_payment_link_id, {
        active: false,
      });
    } catch (err) {
      // Log but don't throw — we'll mark it expired in our DB anyway
      console.error(
        `[Stripe] Failed to deactivate payment link ${link.stripe_payment_link_id}:`,
        err
      );
    }
  }

  // Checkout sessions expire automatically; no need to call Stripe API

  // 3. Update our DB
  const { error: updateError } = await supabase
    .from('stripe_payment_links')
    .update({ status: 'expired' })
    .eq('id', paymentLinkDbId);

  if (updateError) {
    throw new StripeGatewayError(
      'PAYMENT_LINK_NOT_FOUND',
      `Failed to update payment link status: ${updateError.message}`,
      undefined,
      updateError as Error
    );
  }
}
