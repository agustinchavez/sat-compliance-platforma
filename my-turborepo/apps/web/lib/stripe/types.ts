/**
 * Stripe Types (Component 19)
 *
 * Type definitions for Stripe payment gateway integration.
 */

/**
 * Payment link status tracking
 */
export type PaymentLinkStatus =
  | 'active'          // Link is live, awaiting payment
  | 'paid'            // Payment confirmed, CFDI generated
  | 'expired'         // Link expired or manually deactivated
  | 'cancelled'       // Invoice was cancelled before payment
  | 'payment_failed'; // Payment attempted but failed

/**
 * Internal DB record for a Stripe payment link or checkout session
 */
export interface StripePaymentLink {
  id: string;
  organizationId: string;
  invoiceId: string;
  stripePaymentLinkId?: string;      // Stripe Payment Link ID (pl_...)
  stripeCheckoutSessionId?: string;   // Stripe Checkout Session ID (cs_...)
  stripePaymentIntentId?: string;     // Set after payment completes
  url: string;                        // Shareable URL
  amountCentavos: number;             // Amount in centavos
  currency: string;                   // 'mxn'
  status: PaymentLinkStatus;
  expiresAt?: string;                 // ISO timestamp
  paidAt?: string;                    // ISO timestamp when payment confirmed
  paymentRecordedAt?: string;         // ISO timestamp when Component 18 recorded it
  paymentId?: string;                 // FK to payments table after recording
  metadata: Record<string, string>;   // invoice_id, organization_id, folio
  createdAt: string;
  updatedAt: string;
}

/**
 * Data needed to create a Checkout Session
 */
export interface CheckoutSessionInput {
  invoiceId: string;
  organizationId: string;
  amountMXN: number;             // Decimal (e.g. 1160.50)
  invoiceFolio: string;          // For Stripe product description (e.g. "A-123")
  receiverName: string;          // Customer name for Stripe
  customerEmail?: string;        // Pre-fill Checkout email field
  stripeCustomerId?: string;     // If org has a Stripe customer, use it
  expiresAt?: Date;              // Optional expiry for the session
}

/**
 * What we return after creating a checkout session
 */
export interface CheckoutSessionResult {
  checkoutUrl: string;           // URL to redirect customer to
  sessionId: string;             // Stripe cs_... ID
  paymentLinkDbId: string;       // Our DB record ID
}

/**
 * Data needed to create a Payment Link
 */
export interface PaymentLinkInput {
  invoiceId: string;
  organizationId: string;
  amountMXN: number;
  invoiceFolio: string;
  receiverName: string;
  customerEmail?: string;
  expiresAt?: Date;
}

/**
 * What we return after creating a payment link
 */
export interface PaymentLinkResult {
  url: string;                   // Stripe pay.stripe.com/... URL
  paymentLinkId: string;         // Stripe pl_... ID
  paymentLinkDbId: string;       // Our DB record ID
}

/**
 * Parsed webhook payload (after signature verification)
 */
export interface VerifiedWebhookEvent {
  stripeEventId: string;         // evt_... (used for idempotency)
  type: string;                  // 'checkout.session.completed', etc.
  data: Record<string, unknown>;
  createdAt: number;             // Unix timestamp
}

/**
 * Refund request input
 */
export interface RefundInput {
  paymentIntentId: string;
  amountMXN?: number;            // Partial refund amount; omit for full refund
  reason?: 'duplicate' | 'fraudulent' | 'requested_by_customer';
}

/**
 * Refund result
 */
export interface RefundResult {
  refundId: string;              // Stripe re_... ID
  status: 'succeeded' | 'pending' | 'failed';
  amountMXN: number;
}
