/**
 * Stripe Client (Component 19)
 *
 * Singleton Stripe client instance with configuration constants
 * and currency conversion helpers for MXN (centavos).
 */

import Stripe from 'stripe';

// Singleton — never instantiate Stripe more than once per process
let _stripe: Stripe | null = null;

/**
 * Returns the Stripe client singleton.
 * Lazily initializes on first call.
 *
 * @throws Error if STRIPE_SECRET_KEY environment variable is not set
 */
export function getStripeClient(): Stripe {
  if (!_stripe) {
    const secretKey = process.env.STRIPE_SECRET_KEY;
    if (!secretKey) {
      throw new Error('STRIPE_SECRET_KEY environment variable is not set');
    }
    _stripe = new Stripe(secretKey, {
      apiVersion: '2024-12-18.acacia', // Pinned stable version
      typescript: true,
      telemetry: false, // Disable Stripe telemetry in server contexts
    });
  }
  return _stripe;
}

/**
 * Export for convenience — use as stripe() to get client
 */
export const stripe = getStripeClient;

/**
 * Configuration constants for Stripe integration
 */
export const STRIPE_CONFIG = {
  CURRENCY: 'mxn' as const,                     // Primary currency for Mexico
  SUCCESS_URL_PATH: '/invoices/{invoiceId}/payment-success',
  CANCEL_URL_PATH: '/invoices/{invoiceId}',
  PAYMENT_LINK_EXPIRY_DAYS: 30,                 // Default expiry for payment links
  WEBHOOK_TOLERANCE_SECONDS: 300,               // 5 minutes (Stripe default)
} as const;

/**
 * Converts a decimal amount (e.g. 1160.50 MXN) to Stripe's integer centavos
 * (e.g. 116050). Stripe requires integer amounts.
 *
 * IMPORTANT: MXN has 2 decimal places. Round to 2 decimals before converting.
 *
 * @example
 * toCentavos(1160.50) // 116050
 * toCentavos(1160.505) // 116051 (rounds up)
 * toCentavos(0.01) // 1
 */
export function toCentavos(amount: number): number {
  return Math.round(amount * 100);
}

/**
 * Converts Stripe centavos back to decimal for display or DB storage.
 *
 * @example
 * fromCentavos(116050) // 1160.50
 * fromCentavos(1) // 0.01
 */
export function fromCentavos(centavos: number): number {
  return centavos / 100;
}
