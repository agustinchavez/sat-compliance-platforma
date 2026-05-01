/**
 * Stripe Refund Processing (Component 19)
 *
 * Handles refund requests for Stripe payments.
 */

import { getStripeClient, toCentavos, fromCentavos } from './client';
import { StripeGatewayError } from './errors';
import { RefundInput, RefundResult } from './types';

/**
 * Processes a refund for a Stripe payment.
 *
 * Flow:
 * 1. Validate payment intent exists
 * 2. Create refund via Stripe API (full or partial)
 * 3. Return refund details
 *
 * Note: This function only handles the Stripe refund. The caller is responsible for:
 * - Updating invoice status
 * - Generating CFDI Egreso (refund receipt) if required by SAT
 * - Recording refund in payments table
 *
 * @param input - Refund request input
 * @returns Refund result with ID, status, and amount
 * @throws StripeGatewayError if refund creation fails
 */
export async function processRefund(input: RefundInput): Promise<RefundResult> {
  const stripe = getStripeClient();

  // Build refund parameters
  const refundParams: any = {
    payment_intent: input.paymentIntentId,
  };

  // Add amount if partial refund
  if (input.amountMXN !== undefined) {
    refundParams.amount = toCentavos(input.amountMXN);
  }

  // Add reason if provided
  if (input.reason) {
    refundParams.reason = input.reason;
  }

  // Create refund in Stripe
  let refund;
  try {
    refund = await stripe.refunds.create(refundParams);
  } catch (err) {
    throw new StripeGatewayError(
      'REFUND_FAILED',
      `Failed to create Stripe refund: ${(err as Error).message}`,
      undefined,
      err as Error
    );
  }

  // Map Stripe status to our result
  const status = refund.status === 'succeeded'
    ? 'succeeded'
    : refund.status === 'pending'
    ? 'pending'
    : 'failed';

  return {
    refundId: refund.id,
    status,
    amountMXN: fromCentavos(refund.amount),
  };
}
