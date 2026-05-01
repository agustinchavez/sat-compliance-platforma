/**
 * Stripe Gateway Errors (Component 19)
 *
 * Error types and classes for Stripe integration.
 */

export type StripeErrorCode =
  | 'STRIPE_NOT_CONFIGURED'      // Missing STRIPE_SECRET_KEY env var
  | 'INVOICE_NOT_FOUND'
  | 'INVOICE_NOT_STAMPABLE'      // Invoice not in stamped/sent status
  | 'INVOICE_ALREADY_PAID'
  | 'PAYMENT_LINK_NOT_FOUND'
  | 'WEBHOOK_SIGNATURE_INVALID'  // Stripe signature mismatch — reject request
  | 'WEBHOOK_DUPLICATE'          // stripeEventId already processed — skip silently
  | 'CHECKOUT_CREATION_FAILED'
  | 'REFUND_FAILED'
  | 'PAYMENT_RECORDING_FAILED';  // Component 18 threw after webhook succeeded

export class StripeGatewayError extends Error {
  constructor(
    public code: StripeErrorCode,
    message: string,
    public invoiceId?: string,
    public cause?: Error
  ) {
    super(message);
    this.name = 'StripeGatewayError';
  }
}

export function isStripeGatewayError(err: unknown): err is StripeGatewayError {
  return err instanceof StripeGatewayError;
}
