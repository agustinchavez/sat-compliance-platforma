/**
 * Stripe Webhook Handlers (Component 19)
 *
 * Handles incoming Stripe webhook events with signature verification,
 * idempotency checking, and payment recording integration.
 */

import Stripe from 'stripe';
import { getStripeClient, STRIPE_CONFIG, fromCentavos } from './client';
import { StripeGatewayError } from './errors';
import { VerifiedWebhookEvent } from './types';
import { createServiceRoleClient } from '@/lib/supabase/service-role-client';
import { recordAndProcessPayment } from '@/lib/invoices/payment';

/**
 * Verifies Stripe webhook signature and parses the event.
 *
 * SECURITY: This function MUST be called before processing any webhook.
 * It ensures the request actually came from Stripe and wasn't tampered with.
 *
 * @param rawBody - Raw request body as string (do NOT parse as JSON first!)
 * @param signature - Value of stripe-signature header
 * @returns Parsed and verified event
 * @throws StripeGatewayError with code WEBHOOK_SIGNATURE_INVALID if verification fails
 */
export function verifyWebhookSignature(
  rawBody: string,
  signature: string
): VerifiedWebhookEvent {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    throw new StripeGatewayError(
      'STRIPE_NOT_CONFIGURED',
      'STRIPE_WEBHOOK_SECRET environment variable is not set'
    );
  }

  const stripe = getStripeClient();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      rawBody,
      signature,
      webhookSecret,
      STRIPE_CONFIG.WEBHOOK_TOLERANCE_SECONDS
    );
  } catch (err) {
    throw new StripeGatewayError(
      'WEBHOOK_SIGNATURE_INVALID',
      `Webhook signature verification failed: ${(err as Error).message}`,
      undefined,
      err as Error
    );
  }

  return {
    stripeEventId: event.id,
    type: event.type,
    data: event.data.object as Record<string, unknown>,
    createdAt: event.created,
  };
}

/**
 * Checks if a Stripe event has already been processed (idempotency).
 *
 * Stripe may send the same webhook multiple times due to retries or network issues.
 * We use stripe_webhook_events table to track processed events.
 *
 * @param stripeEventId - Stripe event ID (evt_...)
 * @returns true if event was already processed
 */
export async function isEventAlreadyProcessed(
  stripeEventId: string
): Promise<boolean> {
  const supabase = createServiceRoleClient();

  const { data } = await supabase
    .from('stripe_webhook_events')
    .select('id')
    .eq('stripe_event_id', stripeEventId)
    .maybeSingle();

  return !!data;
}

/**
 * Records a Stripe webhook event in the database for idempotency and audit trail.
 *
 * @param event - Verified webhook event
 * @param processed - Whether the event was successfully processed
 * @param errorMessage - Error message if processing failed
 */
export async function recordWebhookEvent(
  event: VerifiedWebhookEvent,
  processed: boolean,
  errorMessage?: string
): Promise<void> {
  const supabase = createServiceRoleClient();

  await supabase.from('stripe_webhook_events').insert({
    stripe_event_id: event.stripeEventId,
    event_type: event.type,
    payload: event.data,
    processed,
    error_message: errorMessage || null,
    received_at: new Date().toISOString(),
  });
}

/**
 * Handles checkout.session.completed event.
 *
 * This fires when a customer completes payment via Checkout Session.
 *
 * Flow:
 * 1. Extract payment details from Stripe event
 * 2. Look up our payment link record by session ID
 * 3. Call Component 18's recordAndProcessPayment()
 * 4. Update stripe_payment_links with payment completion details
 * 5. Generate CFDI if needed (Component 18 handles this)
 *
 * @param session - Stripe Checkout Session object
 */
export async function onCheckoutSessionCompleted(
  session: Stripe.Checkout.Session
): Promise<void> {
  const supabase = createServiceRoleClient();

  // 1. Extract metadata
  const invoiceId = session.metadata?.invoice_id;
  const organizationId = session.metadata?.organization_id;

  if (!invoiceId || !organizationId) {
    throw new StripeGatewayError(
      'PAYMENT_RECORDING_FAILED',
      `Checkout session ${session.id} missing required metadata (invoice_id or organization_id)`
    );
  }

  // 2. Find our payment link record
  const { data: paymentLink, error: linkError } = await supabase
    .from('stripe_payment_links')
    .select('id, amount_centavos')
    .eq('stripe_checkout_session_id', session.id)
    .maybeSingle();

  if (linkError || !paymentLink) {
    throw new StripeGatewayError(
      'PAYMENT_LINK_NOT_FOUND',
      `Payment link not found for session ${session.id}`,
      invoiceId,
      linkError as Error
    );
  }

  // 3. Extract payment details
  const paymentIntentId = session.payment_intent as string;
  const amountMXN = fromCentavos(paymentLink.amount_centavos);

  // Map Stripe payment method to SAT FormaPago code
  // Stripe only supports card payments in Mexico checkout by default
  const formaPago = '04'; // SAT code '04' = Tarjeta de crédito

  // 4. Record payment via Component 18
  let paymentId: string;
  try {
    paymentId = await recordAndProcessPayment({
      invoiceId,
      organizationId,
      paymentMethod: 'stripe',
      amountMXN,
      satFormaPago: formaPago,
      reference: paymentIntentId,
      paymentDate: new Date(),
      metadata: {
        stripe_session_id: session.id,
        stripe_payment_intent_id: paymentIntentId,
        stripe_customer_id: session.customer as string,
      },
    });
  } catch (err) {
    // Component 18 failed — log error but don't throw (already recorded in webhook table)
    throw new StripeGatewayError(
      'PAYMENT_RECORDING_FAILED',
      `Component 18 failed to record payment: ${(err as Error).message}`,
      invoiceId,
      err as Error
    );
  }

  // 5. Update our payment link record
  const { error: updateError } = await supabase
    .from('stripe_payment_links')
    .update({
      status: 'paid',
      stripe_payment_intent_id: paymentIntentId,
      paid_at: new Date().toISOString(),
      payment_recorded_at: new Date().toISOString(),
      payment_id: paymentId,
    })
    .eq('id', paymentLink.id);

  if (updateError) {
    // Non-fatal — payment was recorded, just failed to update link status
    console.error(
      `[Stripe] Recorded payment ${paymentId} but failed to update link status:`,
      updateError
    );
  }
}

/**
 * Handles payment_intent.payment_failed event.
 *
 * This fires when a payment attempt fails (card declined, insufficient funds, etc.).
 *
 * We update the payment link status to 'payment_failed' for operator visibility.
 *
 * @param paymentIntent - Stripe PaymentIntent object
 */
export async function onPaymentIntentFailed(
  paymentIntent: Stripe.PaymentIntent
): Promise<void> {
  const supabase = createServiceRoleClient();

  // Find payment link by payment intent ID
  const { data: paymentLink, error: linkError } = await supabase
    .from('stripe_payment_links')
    .select('id')
    .eq('stripe_payment_intent_id', paymentIntent.id)
    .maybeSingle();

  if (linkError || !paymentLink) {
    // Not found — might be a PaymentIntent that wasn't created via our checkout
    console.warn(
      `[Stripe] Payment intent ${paymentIntent.id} failed but no matching payment link found`
    );
    return;
  }

  // Update status
  await supabase
    .from('stripe_payment_links')
    .update({ status: 'payment_failed' })
    .eq('id', paymentLink.id);
}

/**
 * Main webhook event dispatcher.
 *
 * Routes verified events to the appropriate handler based on event type.
 *
 * Supported events:
 * - checkout.session.completed: Payment succeeded via Checkout Session
 * - payment_intent.payment_failed: Payment attempt failed
 *
 * @param event - Verified webhook event
 */
export async function handleWebhookEvent(
  event: VerifiedWebhookEvent
): Promise<void> {
  switch (event.type) {
    case 'checkout.session.completed':
      await onCheckoutSessionCompleted(event.data as Stripe.Checkout.Session);
      break;

    case 'payment_intent.payment_failed':
      await onPaymentIntentFailed(event.data as Stripe.PaymentIntent);
      break;

    default:
      // Unhandled event type — log and skip
      console.log(`[Stripe] Unhandled webhook event type: ${event.type}`);
  }
}
