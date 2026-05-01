-- ============================================
-- Component 19: Stripe Payment Gateway Integration
-- ============================================
-- Adds tables for tracking Stripe payment links, checkout sessions,
-- and webhook events.
--
-- This migration depends on:
-- - organizations table (for stripe_customer_id column)
-- - invoices table (for payment link associations)
-- - payments table (for payment recording)
-- ============================================

-- 1. Add stripe_customer_id to organizations table
-- This stores the Stripe customer ID for each organization
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT;

-- Index for faster lookups when fetching org by Stripe customer ID
CREATE INDEX IF NOT EXISTS idx_organizations_stripe_customer_id
  ON organizations(stripe_customer_id);

-- 2. Create stripe_payment_links table
-- Tracks all Stripe checkout sessions and payment links
CREATE TABLE IF NOT EXISTS stripe_payment_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,

  -- Stripe IDs (only one will be set per record)
  stripe_payment_link_id TEXT,         -- Stripe Payment Link ID (pl_...)
  stripe_checkout_session_id TEXT,     -- Stripe Checkout Session ID (cs_...)
  stripe_payment_intent_id TEXT,       -- Set after payment completes (pi_...)

  -- Payment details
  url TEXT NOT NULL,                    -- Shareable payment URL
  amount_centavos INTEGER NOT NULL,     -- Amount in centavos (e.g., 116050 for 1160.50 MXN)
  currency TEXT NOT NULL DEFAULT 'mxn', -- Currency code

  -- Status tracking
  status TEXT NOT NULL DEFAULT 'active', -- active, paid, expired, cancelled, payment_failed

  -- Timestamps
  expires_at TIMESTAMPTZ,               -- When the link/session expires
  paid_at TIMESTAMPTZ,                  -- When payment was confirmed
  payment_recorded_at TIMESTAMPTZ,      -- When Component 18 recorded it

  -- Foreign key to payments table (set after recording)
  payment_id UUID REFERENCES payments(id) ON DELETE SET NULL,

  -- Metadata (JSON) for additional context
  metadata JSONB DEFAULT '{}'::jsonb,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_stripe_payment_links_organization_id
  ON stripe_payment_links(organization_id);

CREATE INDEX IF NOT EXISTS idx_stripe_payment_links_invoice_id
  ON stripe_payment_links(invoice_id);

CREATE INDEX IF NOT EXISTS idx_stripe_payment_links_session_id
  ON stripe_payment_links(stripe_checkout_session_id)
  WHERE stripe_checkout_session_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_stripe_payment_links_payment_link_id
  ON stripe_payment_links(stripe_payment_link_id)
  WHERE stripe_payment_link_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_stripe_payment_links_payment_intent_id
  ON stripe_payment_links(stripe_payment_intent_id)
  WHERE stripe_payment_intent_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_stripe_payment_links_status
  ON stripe_payment_links(status);

-- RLS policies for stripe_payment_links
ALTER TABLE stripe_payment_links ENABLE ROW LEVEL SECURITY;

-- Allow users to view payment links for their organization
CREATE POLICY "Users can view payment links for their organization"
  ON stripe_payment_links
  FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id
      FROM organization_members
      WHERE user_id = auth.uid()
    )
  );

-- Allow users to insert payment links for their organization
CREATE POLICY "Users can create payment links for their organization"
  ON stripe_payment_links
  FOR INSERT
  WITH CHECK (
    organization_id IN (
      SELECT organization_id
      FROM organization_members
      WHERE user_id = auth.uid()
    )
  );

-- Allow users to update payment links for their organization
CREATE POLICY "Users can update payment links for their organization"
  ON stripe_payment_links
  FOR UPDATE
  USING (
    organization_id IN (
      SELECT organization_id
      FROM organization_members
      WHERE user_id = auth.uid()
    )
  );

-- Service role bypass (for webhooks)
CREATE POLICY "Service role can manage all payment links"
  ON stripe_payment_links
  FOR ALL
  USING (auth.jwt()->>'role' = 'service_role');

-- 3. Create stripe_webhook_events table
-- Tracks all received webhook events for idempotency and audit trail
CREATE TABLE IF NOT EXISTS stripe_webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Stripe event details
  stripe_event_id TEXT NOT NULL UNIQUE, -- evt_... (used for idempotency)
  event_type TEXT NOT NULL,             -- 'checkout.session.completed', etc.

  -- Event payload (full JSON from Stripe)
  payload JSONB NOT NULL,

  -- Processing status
  processed BOOLEAN NOT NULL DEFAULT false,
  error_message TEXT,                   -- Error if processing failed

  -- Timestamps
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at TIMESTAMPTZ
);

-- Index for idempotency checks (most common query)
CREATE UNIQUE INDEX IF NOT EXISTS idx_stripe_webhook_events_stripe_event_id
  ON stripe_webhook_events(stripe_event_id);

-- Index for audit queries
CREATE INDEX IF NOT EXISTS idx_stripe_webhook_events_event_type
  ON stripe_webhook_events(event_type);

CREATE INDEX IF NOT EXISTS idx_stripe_webhook_events_received_at
  ON stripe_webhook_events(received_at DESC);

CREATE INDEX IF NOT EXISTS idx_stripe_webhook_events_processed
  ON stripe_webhook_events(processed)
  WHERE NOT processed; -- Only index unprocessed events

-- RLS policies for stripe_webhook_events
ALTER TABLE stripe_webhook_events ENABLE ROW LEVEL SECURITY;

-- Only service role can access webhook events (no user access)
CREATE POLICY "Only service role can access webhook events"
  ON stripe_webhook_events
  FOR ALL
  USING (auth.jwt()->>'role' = 'service_role');

-- 4. Add updated_at trigger for stripe_payment_links
CREATE OR REPLACE FUNCTION update_stripe_payment_links_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_stripe_payment_links_updated_at
  BEFORE UPDATE ON stripe_payment_links
  FOR EACH ROW
  EXECUTE FUNCTION update_stripe_payment_links_updated_at();

-- 5. Comments for documentation
COMMENT ON TABLE stripe_payment_links IS 'Component 19: Tracks Stripe checkout sessions and payment links for invoices';
COMMENT ON TABLE stripe_webhook_events IS 'Component 19: Tracks received Stripe webhook events for idempotency and audit trail';
COMMENT ON COLUMN organizations.stripe_customer_id IS 'Component 19: Stripe customer ID for this organization (cus_...)';
COMMENT ON COLUMN stripe_payment_links.status IS 'Payment link status: active (awaiting payment), paid (payment confirmed), expired (link/session expired), cancelled (invoice cancelled), payment_failed (payment attempted but failed)';
COMMENT ON COLUMN stripe_webhook_events.stripe_event_id IS 'Stripe event ID (evt_...) used for idempotency — prevents duplicate processing';
