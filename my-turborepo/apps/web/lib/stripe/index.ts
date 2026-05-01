/**
 * Stripe Payment Gateway Integration (Component 19)
 *
 * Public API exports for Stripe integration.
 *
 * Internal usage only — do NOT expose these functions directly to API routes.
 * Use lib/invoices/payment-link.ts as the public bridge.
 */

// Client and configuration
export { getStripeClient, stripe, STRIPE_CONFIG, toCentavos, fromCentavos } from './client';

// Types
export type {
  PaymentLinkStatus,
  StripePaymentLink,
  CheckoutSessionInput,
  CheckoutSessionResult,
  PaymentLinkInput,
  PaymentLinkResult,
  VerifiedWebhookEvent,
  RefundInput,
  RefundResult,
} from './types';

// Errors
export { StripeGatewayError, isStripeGatewayError } from './errors';
export type { StripeErrorCode } from './errors';

// Customer management
export { getOrCreateStripeCustomer } from './customers';

// Checkout and payment links
export { createCheckoutSession, createPaymentLink, expirePaymentLink } from './checkout';

// Webhooks
export {
  verifyWebhookSignature,
  isEventAlreadyProcessed,
  recordWebhookEvent,
  handleWebhookEvent,
  onCheckoutSessionCompleted,
  onPaymentIntentFailed,
} from './webhooks';

// Refunds
export { processRefund } from './refunds';
