/**
 * Stripe Webhook Endpoint (Component 19)
 *
 * POST /api/webhooks/stripe
 *
 * Receives and processes Stripe webhook events.
 *
 * SECURITY:
 * - This route MUST be excluded from authentication middleware
 * - Signature verification provides authentication
 * - ALWAYS return 200 to Stripe (even on errors) to prevent retries
 * - Use request.text() to get raw body (required for signature verification)
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  verifyWebhookSignature,
  isEventAlreadyProcessed,
  recordWebhookEvent,
  handleWebhookEvent,
  isStripeGatewayError,
} from '@/lib/stripe';

export async function POST(request: NextRequest) {
  // 1. Get raw body and signature header
  const rawBody = await request.text();
  const signature = request.headers.get('stripe-signature');

  if (!signature) {
    console.error('[Stripe Webhook] Missing stripe-signature header');
    return NextResponse.json(
      { error: 'Missing stripe-signature header' },
      { status: 400 }
    );
  }

  // 2. Verify signature
  let event;
  try {
    event = verifyWebhookSignature(rawBody, signature);
  } catch (err) {
    if (isStripeGatewayError(err) && err.code === 'WEBHOOK_SIGNATURE_INVALID') {
      console.error('[Stripe Webhook] Invalid signature:', err.message);
      return NextResponse.json(
        { error: 'Invalid signature' },
        { status: 400 }
      );
    }
    // Other errors (e.g., missing STRIPE_WEBHOOK_SECRET)
    console.error('[Stripe Webhook] Verification error:', err);
    return NextResponse.json(
      { error: 'Webhook verification failed' },
      { status: 500 }
    );
  }

  // 3. Check idempotency (already processed?)
  const alreadyProcessed = await isEventAlreadyProcessed(event.stripeEventId);
  if (alreadyProcessed) {
    console.log(`[Stripe Webhook] Event ${event.stripeEventId} already processed, skipping`);
    return NextResponse.json({ received: true, skipped: true });
  }

  // 4. Handle the event
  let processed = true;
  let errorMessage: string | undefined;

  try {
    await handleWebhookEvent(event);
  } catch (err) {
    processed = false;
    errorMessage = (err as Error).message;
    console.error(`[Stripe Webhook] Event ${event.stripeEventId} processing failed:`, err);

    // Log specific error details for debugging
    if (isStripeGatewayError(err)) {
      console.error(`[Stripe Webhook] StripeGatewayError code: ${err.code}`);
      if (err.invoiceId) {
        console.error(`[Stripe Webhook] Invoice ID: ${err.invoiceId}`);
      }
    }
  }

  // 5. Record event in database (for idempotency and audit trail)
  try {
    await recordWebhookEvent(event, processed, errorMessage);
  } catch (recordErr) {
    console.error('[Stripe Webhook] Failed to record event in DB:', recordErr);
    // Still return 200 to Stripe — we don't want retries if DB is down
  }

  // 6. ALWAYS return 200 to Stripe
  // Even if processing failed, we've logged it and don't want Stripe to retry
  return NextResponse.json({
    received: true,
    processed,
    eventId: event.stripeEventId,
  });
}
