# Component 19: Payment Gateway Integration — Implementation Prompt

---

## Code Review Findings Before You Start

The repo was reviewed at HEAD. Key facts confirmed from the codebase:

**Component 18 (Payment Service) is complete but not yet pushed.** Its files will be present when you start. The integration points below reference it directly. If any of its files are missing, check with the team before proceeding.

**`stripe_customer_id` column already exists on `organizations`.** It was added in `20251105000000_initial_schema.sql`. Do NOT re-add it. Use it as the Stripe customer ID anchor for the organization (not individual end-customers — this platform bills organizations, not consumers).

**`resend` is already installed** (`"resend": "^6.4.2"` in `package.json`) but is irrelevant to this component — do not use it here.

**No Stripe dependency exists yet.** `stripe` npm package is not in `package.json`. You will install it.

**Next.js version is `^16.0.0` with App Router.** Use `await request.text()` (not `request.body()` or `buffer(req)`) to get the raw body for Stripe webhook verification. This is the confirmed pattern for Next.js 16 App Router. No `bodyParser: false` config is needed — that's Pages Router only.

**Existing API route pattern** (confirmed from `app/api/assistant/chat/route.ts`): standard Next.js App Router route files at `app/api/{feature}/route.ts`, importing `NextRequest`/`NextResponse`, using `await createClient()` for Supabase auth.

**Stripe supports MXN natively.** Amounts must be in centavos (integer), so 1160 MXN = `116000`. Stripe also supports "meses sin intereses" (installments) for MX accounts — this is out of scope for this component but do not break it.

---

## What This Component Does

Component 19 adds online payment collection to the platform. When an organization issues an invoice to a customer, they can generate a secure Stripe payment link and send it to their customer. The customer pays online via Stripe Checkout. When Stripe confirms payment, a webhook fires, which triggers Component 18's `recordAndProcessPayment()` to record the payment in the SAT system, generating the Complemento de Pagos CFDI automatically.

This component is the bridge between Stripe's payment infrastructure and the SAT compliance layer already built in Components 12–18.

**The key integration:** Stripe Checkout session → webhook `checkout.session.completed` → `recordAndProcessPayment()` (Component 18) → Complemento de Pagos CFDI generated and stamped.

---

## Scope Boundaries

**Does:**
- Create Stripe Checkout Sessions for invoice payment (preferred over raw PaymentIntents for this use case)
- Create Stripe Payment Links as shareable URLs for invoice payment
- Handle Stripe webhooks: `checkout.session.completed`, `payment_intent.payment_failed`, `charge.dispute.created`, `charge.refunded`
- On successful checkout: call Component 18's `recordAndProcessPayment()` to record payment in DB and generate CFDI
- Process refunds through Stripe API
- Store Stripe customer IDs per organization (already has `stripe_customer_id` column)
- Store payment link records in DB (`stripe_payment_links` table) for tracking status
- Manage idempotency: if a webhook fires twice for the same session, do not double-record the payment

**Does NOT:**
- Implement subscription billing for the platform's own SaaS plans — that's Component 53
- Store raw card data — Stripe handles all PCI compliance
- Implement Stripe Elements frontend — this component is server-side only; the frontend calls these Server Actions
- Handle PayPal, Conekta, or other gateways — Stripe only
- Generate the CFDI directly — that is Component 18's job; this component calls it
- Implement Stripe Connect (marketplace payments) — out of scope

---

## What's Already Built — Import, Don't Reimplement

```typescript
// Component 12 — Invoice types and service
import { getInvoice, markAsPaid } from '@/lib/invoices';
import { InvoiceStatus, MetodoPago } from '@/lib/invoices';
import type { Invoice } from '@/lib/invoices';

// Component 18 — Payment recording (triggers CFDI generation)
import { recordAndProcessPayment } from '@/lib/invoices'; // bridge re-export
import type { CreatePaymentInput } from '@/lib/payments/types';

// Component 17 — Email queue
import { emailQueue } from '@/lib/queue/queues';
import type { EmailJobPayload } from '@/lib/queue/job-types';

// Supabase server client (for API routes and Server Actions)
import { createClient } from '@/lib/supabase/server';

// Supabase service role client (for webhooks — no user session)
import { createClient as createServiceClient } from '@supabase/supabase-js';
```

---

## Install

```bash
cd my-turborepo/apps/web
npm install stripe
```

**Stripe package version:** `stripe@^17.0.0` (or latest v17.x — do not use v16 or older). The `apiVersion` used in the Stripe constructor should be `'2025-04-30.basil'` (latest stable as of component writing). Always pin this in the constructor — do not rely on the default.

---

## File Structure

Use `apps/web/lib/` convention throughout. Do NOT use `src/server/`:

```
apps/web/lib/stripe/
├── client.ts              # Stripe singleton, config constants
├── types.ts               # StripePaymentLink, CheckoutSessionData, WebhookEvent types
├── errors.ts              # StripeGatewayError, StripeErrorCode
├── checkout.ts            # createCheckoutSession(), createPaymentLink(), expirePaymentLink()
├── webhooks.ts            # verifyWebhookSignature(), handleWebhookEvent(), event handlers
├── refunds.ts             # processRefund(), getRefundStatus()
├── customers.ts           # getOrCreateStripeCustomer(), syncCustomer()
└── index.ts               # Public exports

apps/web/app/api/webhooks/stripe/
└── route.ts               # POST endpoint — raw body, signature verify, dispatch

apps/web/lib/invoices/
└── payment-link.ts        # Public bridge: createInvoicePaymentLink(), getInvoicePaymentLinks()

supabase/migrations/
└── 20260312000000_add_stripe_tables.sql
```

---

## Step 1 — Stripe Client

Create `apps/web/lib/stripe/client.ts`:

```typescript
import Stripe from 'stripe';

// Singleton — never instantiate Stripe more than once per process
let _stripe: Stripe | null = null;

export function getStripeClient(): Stripe {
  if (!_stripe) {
    const secretKey = process.env.STRIPE_SECRET_KEY;
    if (!secretKey) {
      throw new Error('STRIPE_SECRET_KEY environment variable is not set');
    }
    _stripe = new Stripe(secretKey, {
      apiVersion: '2025-04-30.basil',
      typescript: true,
      telemetry: false, // Disable Stripe telemetry in server contexts
    });
  }
  return _stripe;
}

// Export for convenience
export const stripe = getStripeClient;

// Configuration constants
export const STRIPE_CONFIG = {
  CURRENCY: 'mxn',                          // Primary currency for Mexico
  SUCCESS_URL_PATH: '/invoices/{invoiceId}/payment-success',
  CANCEL_URL_PATH: '/invoices/{invoiceId}',
  PAYMENT_LINK_EXPIRY_DAYS: 30,             // Default expiry for payment links
  WEBHOOK_TOLERANCE_SECONDS: 300,           // 5 minutes (Stripe default)
} as const;

/**
 * Converts a decimal amount (e.g. 1160.50 MXN) to Stripe's integer centavos
 * (e.g. 116050). Stripe requires integer amounts.
 *
 * IMPORTANT: MXN has 2 decimal places. Round to 2 decimals before converting.
 */
export function toCentavos(amount: number): number {
  return Math.round(amount * 100);
}

/**
 * Converts Stripe centavos back to decimal for display or DB storage.
 */
export function fromCentavos(centavos: number): number {
  return centavos / 100;
}
```

---

## Step 2 — Types

Create `apps/web/lib/stripe/types.ts`:

```typescript
// Internal DB record for a Stripe payment link or checkout session
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

export type PaymentLinkStatus =
  | 'active'          // Link is live, awaiting payment
  | 'paid'            // Payment confirmed, CFDI generated
  | 'expired'         // Link expired or manually deactivated
  | 'cancelled'       // Invoice was cancelled before payment
  | 'payment_failed'; // Payment attempted but failed

// Data needed to create a Checkout Session
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

// What we store after creating a session/link
export interface CheckoutSessionResult {
  checkoutUrl: string;           // URL to redirect customer to
  sessionId: string;             // Stripe cs_... ID
  paymentLinkDbId: string;       // Our DB record ID
}

export interface PaymentLinkInput {
  invoiceId: string;
  organizationId: string;
  amountMXN: number;
  invoiceFolio: string;
  receiverName: string;
  customerEmail?: string;
  expiresAt?: Date;
}

export interface PaymentLinkResult {
  url: string;                   // Stripe pay.stripe.com/... URL
  paymentLinkId: string;         // Stripe pl_... ID
  paymentLinkDbId: string;       // Our DB record ID
}

// Parsed webhook payload (after signature verification)
export interface VerifiedWebhookEvent {
  stripeEventId: string;         // evt_... (used for idempotency)
  type: string;                  // 'checkout.session.completed', etc.
  data: Record<string, unknown>;
  createdAt: number;             // Unix timestamp
}

export interface RefundInput {
  paymentIntentId: string;
  amountMXN?: number;            // Partial refund amount; omit for full refund
  reason?: 'duplicate' | 'fraudulent' | 'requested_by_customer';
}

export interface RefundResult {
  refundId: string;              // Stripe re_... ID
  status: 'succeeded' | 'pending' | 'failed';
  amountMXN: number;
}
```

---

## Step 3 — Errors

Create `apps/web/lib/stripe/errors.ts`:

```typescript
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
```

---

## Step 4 — Stripe Customer Management

Create `apps/web/lib/stripe/customers.ts`:

```typescript
/**
 * Gets an existing Stripe customer for the organization, or creates one.
 *
 * Important: The Stripe customer is attached to the ORGANIZATION, not to
 * individual invoice receivers. This is because the org is who has the
 * Stripe account relationship and who will manage refunds.
 *
 * stripe_customer_id is stored on the organizations table (already exists).
 */
export async function getOrCreateStripeCustomer(
  organizationId: string,
  supabase: SupabaseClient
): Promise<string> {
  // 1. Check if org already has a stripe_customer_id
  const { data: org } = await supabase
    .from('organizations')
    .select('id, legal_name, email, stripe_customer_id')
    .eq('id', organizationId)
    .single();

  if (org?.stripe_customer_id) {
    return org.stripe_customer_id;
  }

  // 2. Create Stripe customer
  const customer = await stripe().customers.create({
    name: org.legal_name,
    email: org.email ?? undefined,
    metadata: { organization_id: organizationId },
  });

  // 3. Persist stripe_customer_id
  await supabase
    .from('organizations')
    .update({ stripe_customer_id: customer.id })
    .eq('id', organizationId);

  return customer.id;
}
```

---

## Step 5 — Checkout Session and Payment Links

Create `apps/web/lib/stripe/checkout.ts`:

### When to Use Checkout Session vs Payment Link

Both produce a payment URL. Use **Checkout Session** when:
- You need an expiry time on the URL
- You want the URL to die after first use (single invoice, one-time)
- You're redirecting from within the app

Use **Payment Link** when:
- You want a reusable shareable URL (customer can share it)
- You want Stripe to host the link persistently

For this platform, use **Checkout Session** as the default — it's more appropriate for B2B invoice payment (one URL per invoice). Implement Payment Links as a secondary option.

```typescript
/**
 * Creates a Stripe Checkout Session for invoice payment.
 *
 * The checkout session:
 * 1. Shows the invoice amount with folio as the product description
 * 2. Pre-fills customer email if available
 * 3. Stores invoice_id and organization_id in metadata for webhook lookup
 * 4. Redirects to success/cancel URLs in the platform
 * 5. Records the session in stripe_payment_links table
 *
 * The Checkout Session URL is single-use and expires.
 */
export async function createCheckoutSession(
  input: CheckoutSessionInput,
  supabase: SupabaseClient
): Promise<CheckoutSessionResult> {
  // Validate invoice is in a payable state (stamped or sent)
  // ...

  const session = await stripe().checkout.sessions.create({
    mode: 'payment',
    payment_method_types: ['card'],  // MXN supports card, bank transfer varies
    currency: STRIPE_CONFIG.CURRENCY,
    line_items: [
      {
        price_data: {
          currency: STRIPE_CONFIG.CURRENCY,
          unit_amount: toCentavos(input.amountMXN),
          product_data: {
            name: `Factura ${input.invoiceFolio}`,
            description: `Pago de factura - ${input.receiverName}`,
          },
        },
        quantity: 1,
      },
    ],
    customer_email: input.customerEmail,
    // Pass critical IDs in metadata — accessible in webhook
    metadata: {
      invoice_id: input.invoiceId,
      organization_id: input.organizationId,
      invoice_folio: input.invoiceFolio,
    },
    success_url: `${process.env.NEXT_PUBLIC_APP_URL}/invoices/${input.invoiceId}/payment-success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/invoices/${input.invoiceId}`,
    expires_at: input.expiresAt
      ? Math.floor(input.expiresAt.getTime() / 1000)
      : Math.floor(Date.now() / 1000) + 86400 * STRIPE_CONFIG.PAYMENT_LINK_EXPIRY_DAYS,
  });

  // Persist to stripe_payment_links table
  // ...

  return {
    checkoutUrl: session.url!,
    sessionId: session.id,
    paymentLinkDbId: '...',
  };
}

/**
 * Creates a Stripe Payment Link (reusable shareable URL).
 * Use for sending via WhatsApp or email where reusability is preferred.
 *
 * Note: Payment Links require a Stripe Price object. We create an
 * ad-hoc price with price_data (no pre-created product required).
 */
export async function createPaymentLink(
  input: PaymentLinkInput,
  supabase: SupabaseClient
): Promise<PaymentLinkResult> {
  // Stripe Payment Links require a Price (which requires a Product)
  // Use inline price_data approach to avoid creating persistent products
  const paymentLink = await stripe().paymentLinks.create({
    line_items: [
      {
        price_data: {
          currency: STRIPE_CONFIG.CURRENCY,
          unit_amount: toCentavos(input.amountMXN),
          product_data: {
            name: `Factura ${input.invoiceFolio}`,
            description: `Pago de factura - ${input.receiverName}`,
          },
        },
        quantity: 1,
      },
    ],
    metadata: {
      invoice_id: input.invoiceId,
      organization_id: input.organizationId,
      invoice_folio: input.invoiceFolio,
    },
    after_completion: {
      type: 'redirect',
      redirect: {
        url: `${process.env.NEXT_PUBLIC_APP_URL}/invoices/${input.invoiceId}/payment-success`,
      },
    },
  });

  // Persist to stripe_payment_links table
  // ...

  return {
    url: paymentLink.url,
    paymentLinkId: paymentLink.id,
    paymentLinkDbId: '...',
  };
}

/**
 * Deactivates a Stripe Payment Link (sets active=false).
 * Called when an invoice is cancelled.
 */
export async function expirePaymentLink(
  paymentLinkDbId: string,
  organizationId: string,
  supabase: SupabaseClient
): Promise<void> {
  // Fetch payment link record
  // Call stripe().paymentLinks.update(stripePaymentLinkId, { active: false })
  // Update status in DB to 'cancelled'
}
```

---

## Step 6 — Webhook Handler

Create `apps/web/lib/stripe/webhooks.ts`:

```typescript
/**
 * Verifies a Stripe webhook signature using the raw request body.
 *
 * IMPORTANT: Must use raw body string, NOT parsed JSON.
 * In Next.js 16 App Router: body = await request.text()
 *
 * @throws StripeGatewayError('WEBHOOK_SIGNATURE_INVALID') on failure
 */
export function verifyWebhookSignature(
  rawBody: string,
  signature: string,
  secret: string
): Stripe.Event {
  try {
    return stripe().webhooks.constructEvent(rawBody, signature, secret);
  } catch (err) {
    throw new StripeGatewayError(
      'WEBHOOK_SIGNATURE_INVALID',
      `Webhook signature verification failed: ${(err as Error).message}`
    );
  }
}

/**
 * Main webhook dispatcher. Routes Stripe events to typed handlers.
 *
 * Returns early with success if event is a duplicate (idempotency).
 * Logs but does NOT throw on handler errors — always return 200 to Stripe.
 *
 * If this returns a non-2xx status, Stripe will retry with exponential
 * backoff for up to 3 days. Returning 200 even on handler failures
 * is intentional — we log failures internally without asking Stripe to retry.
 */
export async function handleWebhookEvent(
  event: Stripe.Event,
  supabase: SupabaseClient // Service-role client (no user session in webhooks)
): Promise<{ handled: boolean; eventType: string }> {
  // Idempotency: check if this Stripe event ID was already processed
  const alreadyProcessed = await checkEventProcessed(event.id, supabase);
  if (alreadyProcessed) {
    console.log(`[stripe-webhook] Duplicate event ${event.id}, skipping`);
    return { handled: true, eventType: event.type };
  }

  // Record event as seen BEFORE processing (prevents race conditions)
  await recordEventSeen(event.id, event.type, supabase);

  try {
    switch (event.type) {
      case 'checkout.session.completed':
        await onCheckoutSessionCompleted(
          event.data.object as Stripe.Checkout.Session,
          supabase
        );
        break;

      case 'payment_intent.payment_failed':
        await onPaymentIntentFailed(
          event.data.object as Stripe.PaymentIntent,
          supabase
        );
        break;

      case 'charge.dispute.created':
        await onChargeDisputeCreated(
          event.data.object as Stripe.Dispute,
          supabase
        );
        break;

      case 'charge.refunded':
        await onChargeRefunded(
          event.data.object as Stripe.Charge,
          supabase
        );
        break;

      default:
        console.log(`[stripe-webhook] Unhandled event type: ${event.type}`);
    }
  } catch (err) {
    // Log but don't re-throw — we already returned 200 to Stripe
    console.error(`[stripe-webhook] Handler error for ${event.type}:`, err);
    await recordEventError(event.id, (err as Error).message, supabase);
  }

  return { handled: true, eventType: event.type };
}
```

### The Critical Handler: `onCheckoutSessionCompleted`

```typescript
/**
 * Handles checkout.session.completed — the most important webhook.
 *
 * Flow:
 * 1. Extract invoice_id and organization_id from session.metadata
 * 2. Fetch the invoice to verify it's still in a payable state
 * 3. Call recordAndProcessPayment() (Component 18) with:
 *    - payment_method: '04' (tarjeta de crédito) or '28' (débito)
 *      → Determine from session.payment_method_types[0]
 *    - amount: fromCentavos(session.amount_total)
 *    - referenceNumber: session.payment_intent (pi_... as the reference)
 * 4. Update stripe_payment_links record: status='paid', payment_id, paidAt
 * 5. Enqueue payment_received email
 *
 * IMPORTANT: recordAndProcessPayment() generates the SAT Complemento de Pagos
 * CFDI for PPD invoices. This is the automatic SAT compliance step that happens
 * when a customer pays online.
 *
 * Do NOT call markAsPaid() directly — that bypasses Component 18's CFDI generation.
 * Always go through recordAndProcessPayment().
 */
async function onCheckoutSessionCompleted(
  session: Stripe.Checkout.Session,
  supabase: SupabaseClient
): Promise<void> {
  const invoiceId = session.metadata?.invoice_id;
  const organizationId = session.metadata?.organization_id;

  if (!invoiceId || !organizationId) {
    console.error('[stripe-webhook] Missing metadata on checkout session', session.id);
    return; // Can't process without these
  }

  // Fetch invoice to determine payment method and PPD/PUE
  const invoice = await getInvoiceForWebhook(invoiceId, organizationId, supabase);
  if (!invoice) {
    console.error(`[stripe-webhook] Invoice ${invoiceId} not found for session ${session.id}`);
    return;
  }

  // Skip if already paid (double-webhook protection beyond event ID check)
  if (invoice.status === InvoiceStatus.PAID || invoice.payment_status === 'paid') {
    console.log(`[stripe-webhook] Invoice ${invoiceId} already paid, skipping`);
    return;
  }

  // Determine SAT payment method code from Stripe payment method type
  const paymentMethod = mapStripeToSATPaymentMethod(
    session.payment_method_types?.[0] ?? 'card'
  );

  const amount = fromCentavos(session.amount_total ?? 0);

  // Call Component 18 — this records the payment AND generates CFDI for PPD
  const result = await recordAndProcessPayment(invoiceId, organizationId, {
    amount,
    currency: (session.currency?.toUpperCase() ?? 'MXN'),
    exchangeRate: 1.0,
    paymentDate: new Date().toISOString().split('T')[0], // YYYY-MM-DD
    paymentMethod,
    referenceNumber: typeof session.payment_intent === 'string'
      ? session.payment_intent
      : session.id,
    notes: `Pago en línea via Stripe — Session: ${session.id}`,
  });

  // Update payment link record
  await supabase
    .from('stripe_payment_links')
    .update({
      status: 'paid',
      payment_id: result.payment.id,
      stripe_payment_intent_id: typeof session.payment_intent === 'string'
        ? session.payment_intent
        : null,
      paid_at: new Date().toISOString(),
      payment_recorded_at: new Date().toISOString(),
    })
    .eq('stripe_checkout_session_id', session.id);
}

/**
 * Maps Stripe payment method types to SAT c_FormaPago codes.
 * This determines what appears in the CFDI Complemento de Pagos.
 */
function mapStripeToSATPaymentMethod(stripeMethod: string): PaymentMethodCode {
  const mapping: Record<string, PaymentMethodCode> = {
    'card': '04',         // Tarjeta de crédito (default for card)
    'debit': '28',        // Tarjeta de débito
    'bank_transfer': '03', // Transferencia electrónica
    'oxxo': '99',         // Por definir (OXXO voucher has no direct SAT code)
  };
  return mapping[stripeMethod] ?? '04';
}
```

---

## Step 7 — Refund Processing

Create `apps/web/lib/stripe/refunds.ts`:

```typescript
/**
 * Processes a refund through Stripe.
 *
 * NOTE: This refunds the Stripe charge. It does NOT automatically void
 * the payment record in Component 18 or generate an Egreso CFDI —
 * those are separate accounting actions the user must take manually.
 *
 * After refunding through Stripe, the caller should:
 * 1. Inform the user to void the payment via Component 18's voidPayment()
 * 2. Separately cancel the payment CFDI through Component 15 if applicable
 *
 * This component ONLY handles the Stripe side.
 */
export async function processRefund(
  input: RefundInput,
  organizationId: string,
  supabase: SupabaseClient
): Promise<RefundResult> {
  // Validate organization owns this payment intent
  // (check stripe_payment_links table for org match)

  const refundParams: Stripe.RefundCreateParams = {
    payment_intent: input.paymentIntentId,
    reason: input.reason ?? 'requested_by_customer',
  };

  if (input.amountMXN !== undefined) {
    refundParams.amount = toCentavos(input.amountMXN);
  }

  const refund = await stripe().refunds.create(refundParams);

  return {
    refundId: refund.id,
    status: refund.status as 'succeeded' | 'pending' | 'failed',
    amountMXN: fromCentavos(refund.amount),
  };
}
```

---

## Step 8 — Next.js Webhook Route

Create `apps/web/app/api/webhooks/stripe/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { verifyWebhookSignature, handleWebhookEvent } from '@/lib/stripe/webhooks';
import { isStripeGatewayError } from '@/lib/stripe/errors';

// IMPORTANT: This route must NOT be protected by auth middleware.
// Stripe webhooks don't carry a user session.
// Authentication is via HMAC signature verification only.

export async function POST(request: NextRequest): Promise<NextResponse> {
  // Use request.text() — NOT request.json() — to get the raw body
  // Stripe signature verification requires the exact raw bytes
  const rawBody = await request.text();
  const signature = request.headers.get('stripe-signature');

  if (!signature) {
    return NextResponse.json(
      { error: 'Missing stripe-signature header' },
      { status: 400 }
    );
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error('[stripe-webhook] STRIPE_WEBHOOK_SECRET not configured');
    return NextResponse.json({ error: 'Webhook not configured' }, { status: 500 });
  }

  let event: Stripe.Event;
  try {
    event = verifyWebhookSignature(rawBody, signature, webhookSecret);
  } catch (err) {
    if (isStripeGatewayError(err) && err.code === 'WEBHOOK_SIGNATURE_INVALID') {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    return NextResponse.json({ error: 'Webhook verification failed' }, { status: 400 });
  }

  // Service-role client — no user session in webhook context
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Always return 200 to Stripe, even on handler errors
  // (handler catches and logs its own errors)
  await handleWebhookEvent(event, supabase);

  return NextResponse.json({ received: true }, { status: 200 });
}
```

**Important middleware note:** The Stripe webhook route at `/api/webhooks/stripe` must be excluded from any Next.js auth middleware that checks for session cookies. Check `middleware.ts` in the project root — add this path to the public/bypass list if auth middleware exists.

---

## Step 9 — Database Migration

Create `supabase/migrations/20260312000000_add_stripe_tables.sql`:

```sql
-- ============================================
-- Stripe Payment Links tracking table
-- ============================================

CREATE TABLE stripe_payment_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE RESTRICT,

  -- Stripe identifiers
  stripe_payment_link_id VARCHAR(255),        -- pl_... (Payment Link) or NULL
  stripe_checkout_session_id VARCHAR(255),    -- cs_... (Checkout Session) or NULL
  stripe_payment_intent_id VARCHAR(255),      -- pi_... set after payment

  -- Payment details
  url TEXT NOT NULL,                          -- Shareable URL
  amount_centavos INTEGER NOT NULL,           -- Amount in centavos (MXN)
  currency VARCHAR(3) NOT NULL DEFAULT 'mxn',

  -- Status tracking
  status VARCHAR(20) NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'paid', 'expired', 'cancelled', 'payment_failed')),

  -- Timing
  expires_at TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,
  payment_recorded_at TIMESTAMPTZ,

  -- Integration with Component 18
  payment_id UUID REFERENCES payments(id),    -- Set after recordAndProcessPayment()

  -- Audit
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_stripe_payment_links_org ON stripe_payment_links(organization_id);
CREATE INDEX idx_stripe_payment_links_invoice ON stripe_payment_links(invoice_id);
CREATE INDEX idx_stripe_payment_links_session ON stripe_payment_links(stripe_checkout_session_id)
  WHERE stripe_checkout_session_id IS NOT NULL;
CREATE INDEX idx_stripe_payment_links_status ON stripe_payment_links(status)
  WHERE status = 'active';

-- ============================================
-- Stripe webhook events (idempotency table)
-- Prevents double-processing of the same event
-- ============================================

CREATE TABLE stripe_webhook_events (
  stripe_event_id VARCHAR(255) PRIMARY KEY,  -- evt_... from Stripe
  event_type VARCHAR(100) NOT NULL,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  error_message TEXT,                         -- Non-null if handler failed
  organization_id UUID                        -- If determinable from event
);

CREATE INDEX idx_stripe_webhook_events_type ON stripe_webhook_events(event_type);
CREATE INDEX idx_stripe_webhook_events_processed ON stripe_webhook_events(processed_at DESC);

-- Auto-clean events older than 90 days (Stripe's retry window is 3 days)
-- This prevents unbounded table growth
-- (Implement as a scheduled job in Component 32, or a Postgres cron)
COMMENT ON TABLE stripe_webhook_events IS
  'Idempotency log for Stripe webhook events. Safe to delete rows older than 90 days.';

-- ============================================
-- RLS
-- ============================================

ALTER TABLE stripe_payment_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE stripe_webhook_events ENABLE ROW LEVEL SECURITY;

-- Payment links: org members can view
CREATE POLICY "Members can view stripe payment links"
  ON stripe_payment_links FOR SELECT TO authenticated
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
    )
  );

-- Payment links: org members can insert (create payment links)
CREATE POLICY "Members can create stripe payment links"
  ON stripe_payment_links FOR INSERT TO authenticated
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
    )
  );

-- Webhook events: read-only for authenticated users (audit trail)
CREATE POLICY "Members can view webhook events"
  ON stripe_webhook_events FOR SELECT TO authenticated
  USING (
    organization_id IS NULL
    OR organization_id IN (
      SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
    )
  );

-- updated_at trigger
CREATE TRIGGER stripe_payment_links_updated_at
  BEFORE UPDATE ON stripe_payment_links
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
```

---

## Step 10 — Public Bridge

Create `apps/web/lib/invoices/payment-link.ts`:

```typescript
// Public bridge for Stripe payment links — called by Server Actions

/**
 * Creates a checkout session for an invoice and returns the payment URL.
 * This is what a Server Action calls when the user clicks "Send payment link".
 *
 * @returns The checkout URL to redirect to or embed in an email/WhatsApp message
 */
export async function createInvoicePaymentLink(
  invoiceId: string,
  organizationId: string,
  options?: {
    usePaymentLink?: boolean;  // true = persistent Payment Link, false = one-time Checkout Session (default)
    customerEmail?: string;
  }
): Promise<{ url: string; linkId: string }>

/**
 * Returns all Stripe payment links for an invoice (may have multiple if retried).
 */
export async function getInvoicePaymentLinks(
  invoiceId: string,
  organizationId: string
): Promise<StripePaymentLink[]>

/**
 * Cancels all active payment links for an invoice.
 * Called when an invoice is cancelled via Component 15.
 */
export async function cancelInvoicePaymentLinks(
  invoiceId: string,
  organizationId: string
): Promise<void>
```

Export from `apps/web/lib/invoices/index.ts`:
```typescript
export {
  createInvoicePaymentLink,
  getInvoicePaymentLinks,
  cancelInvoicePaymentLinks,
} from './payment-link';
```

---

## Environment Variables

Add to `.env.example`:
```bash
# Stripe (Component 19)
STRIPE_SECRET_KEY=sk_test_...          # From Stripe Dashboard → API Keys
STRIPE_PUBLISHABLE_KEY=pk_test_...     # For future frontend use (not needed server-side)
STRIPE_WEBHOOK_SECRET=whsec_...        # From Stripe Dashboard → Webhooks → Signing secret

# App URL (needed for success/cancel redirect URLs)
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

**Two different webhook secrets:**
- `whsec_...` for your registered endpoint in Stripe Dashboard (production/staging)
- For local development with Stripe CLI: `stripe listen --forward-to localhost:3000/api/webhooks/stripe` provides a local webhook secret — store separately as `STRIPE_WEBHOOK_SECRET_LOCAL`

---

## Coverage Targets and Tests

| File | Target |
|------|--------|
| `client.ts` | ≥95% |
| `errors.ts` | ≥95% |
| `types.ts` (validation) | ≥90% |
| `checkout.ts` | ≥85% |
| `webhooks.ts` | ≥90% |
| `refunds.ts` | ≥85% |
| `customers.ts` | ≥85% |
| `payment-link.ts` (bridge) | ≥80% |

**Total new tests: ≥80**

### Key Test Scenarios

**`client.ts`:**
- `toCentavos(1160.50)` → `116050`
- `toCentavos(0.01)` → `1`
- `fromCentavos(116050)` → `1160.50`
- `getStripeClient()` throws when `STRIPE_SECRET_KEY` not set

**`checkout.ts`:**
- `createCheckoutSession` with valid invoice → returns `checkoutUrl` and `sessionId`
- `createCheckoutSession` on already-paid invoice → throws `INVOICE_ALREADY_PAID`
- `createCheckoutSession` on cancelled invoice → throws `INVOICE_NOT_STAMPABLE`
- `createPaymentLink` → creates persistent URL, persists to DB
- `expirePaymentLink` → calls `stripe().paymentLinks.update(..., { active: false })`

**`webhooks.ts`:**
- `verifyWebhookSignature` with valid signature → returns Stripe.Event
- `verifyWebhookSignature` with invalid signature → throws `WEBHOOK_SIGNATURE_INVALID`
- `handleWebhookEvent` for `checkout.session.completed` → calls `recordAndProcessPayment`
- `handleWebhookEvent` for duplicate event ID → returns `handled: true` without re-processing
- `handleWebhookEvent` when `recordAndProcessPayment` throws → logs error, does NOT re-throw
- `handleWebhookEvent` for `payment_intent.payment_failed` → updates link status to `payment_failed`
- `handleWebhookEvent` for unknown event type → returns `handled: false`, no error
- `mapStripeToSATPaymentMethod('card')` → `'04'`
- `mapStripeToSATPaymentMethod('bank_transfer')` → `'03'`
- `mapStripeToSATPaymentMethod('oxxo')` → `'99'`

**`customers.ts`:**
- Org with existing `stripe_customer_id` → returns it without calling Stripe API
- Org without `stripe_customer_id` → creates customer, persists ID, returns it

**`refunds.ts`:**
- Full refund → no `amount` param to Stripe
- Partial refund → converts MXN to centavos correctly
- Refund for org that doesn't own the payment intent → throws

**Webhook idempotency:**
- Process same `evt_...` twice → second call returns immediately, `recordAndProcessPayment` called exactly once (use mock call counter)

---

## Key Design Decisions

**1. Checkout Session over raw PaymentIntent.**
Stripe Checkout handles card input, 3DS authentication, Apple/Google Pay, and localization automatically. Raw PaymentIntents require building a custom frontend (Component 42's responsibility). This component is server-side; Checkout is the right primitive.

**2. Webhook idempotency via `stripe_webhook_events` table.**
Stripe may deliver the same event twice (network retry). Recording the `stripe_event_id` before processing and checking it on arrival ensures `recordAndProcessPayment()` is called exactly once per real payment. The check is: does `stripe_webhook_events` contain this `evt_...` ID? If yes, skip.

**3. Always return HTTP 200 to Stripe from the webhook route.**
If the handler throws (e.g., Component 18 is temporarily down), returning 4xx/5xx causes Stripe to retry for up to 3 days. Instead, return 200, log the failure, and surface it in the `stripe_webhook_events` table where ops can investigate. This prevents webhook floods.

**4. Metadata carries `invoice_id` and `organization_id`.**
All checkout sessions and payment links embed these in Stripe's `metadata` object. This is how the webhook handler knows which invoice to record the payment against without maintaining a session-to-invoice mapping database outside of Stripe.

**5. SAT payment method code is derived from Stripe, not user-selected.**
When a customer pays via Stripe, we don't ask them to choose a SAT `FormaPago` code. We map Stripe's payment method type to the closest SAT code automatically: `card` → `04`, `bank_transfer` → `03`, `oxxo` → `99`. This is stored in the Complemento de Pagos CFDI.

**6. `recordAndProcessPayment` does the SAT work; this component does not.**
Never call `markAsPaid()` directly from a webhook. Always call `recordAndProcessPayment()` from Component 18, which handles the full flow: DB record, CFDI generation for PPD, status update, reminder cancellation. The gateway layer is not aware of CFDI logic.

**7. Refunds are Stripe-only; SAT accounting is manual.**
Stripe refunds are processed here. But voiding the payment in Component 18 and generating a CFDI de Egreso are manual operations that require user intent (selecting a motivo, etc.). The webhook `charge.refunded` event updates the link status and can enqueue a notification, but does not auto-void the SAT payment record.

**8. Check middleware exclusion for the webhook route.**
If the project has auth middleware protecting `/api/*`, the path `/api/webhooks/stripe` must be excluded. Stripe webhooks carry no session cookie — they will fail 401 if middleware tries to validate a user session. Check `apps/web/middleware.ts` and update the matcher.

---

## Definition of Done

- [ ] `stripe` npm package installed (`stripe@^17.x`)
- [ ] `apps/web/lib/stripe/client.ts` — singleton, `toCentavos`, `fromCentavos`
- [ ] `apps/web/lib/stripe/types.ts` — all interfaces
- [ ] `apps/web/lib/stripe/errors.ts` — `StripeGatewayError`
- [ ] `apps/web/lib/stripe/checkout.ts` — `createCheckoutSession`, `createPaymentLink`, `expirePaymentLink`
- [ ] `apps/web/lib/stripe/webhooks.ts` — signature verification, dispatcher, all event handlers
- [ ] `apps/web/lib/stripe/refunds.ts` — `processRefund`
- [ ] `apps/web/lib/stripe/customers.ts` — `getOrCreateStripeCustomer`
- [ ] `apps/web/lib/stripe/index.ts` — exports
- [ ] `apps/web/app/api/webhooks/stripe/route.ts` — uses `request.text()` for raw body
- [ ] `apps/web/lib/invoices/payment-link.ts` — public bridge
- [ ] `apps/web/lib/invoices/index.ts` updated with bridge exports
- [ ] Migration: `stripe_payment_links` table with RLS
- [ ] Migration: `stripe_webhook_events` idempotency table
- [ ] `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `NEXT_PUBLIC_APP_URL` added to `.env.example`
- [ ] Webhook route excluded from auth middleware (check `middleware.ts`)
- [ ] `toCentavos(1160.50)` → `116050` (no floating-point errors)
- [ ] Checkout session metadata includes `invoice_id` and `organization_id`
- [ ] `checkout.session.completed` → calls `recordAndProcessPayment()` (not `markAsPaid()`)
- [ ] Duplicate webhook event → idempotent, `recordAndProcessPayment` called once
- [ ] Webhook route always returns HTTP 200 (even on handler failure)
- [ ] Stripe customer ID persisted to `organizations.stripe_customer_id`
- [ ] Active payment links cancelled when invoice is cancelled
- [ ] `mapStripeToSATPaymentMethod` maps `card`→`04`, `bank_transfer`→`03`, `oxxo`→`99`
- [ ] **≥80 new tests, all passing**

---

## Required Completion Summary

When done, provide:
1. All files created and modified (with paths)
2. Test count per file
3. Stripe API version used in the constructor
4. Confirmation that the webhook route uses `request.text()` (not `.json()`)
5. Confirmation that `checkout.session.completed` calls `recordAndProcessPayment()` from Component 18
6. Any deviations from this spec and why
