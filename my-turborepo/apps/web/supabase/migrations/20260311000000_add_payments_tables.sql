-- ============================================
-- SAT COMPLIANCE PLATFORM - Payment Service
-- Migration: 20260311000000_add_payments_tables
-- Component: 18 - Payment Service
-- Description: Add payments table with Complemento de Pagos 2.0 support
-- ============================================

-- ============================================
-- PAYMENTS TABLE
-- ============================================

-- Drop existing payments table if it exists from initial schema
DROP TABLE IF EXISTS payments CASCADE;

-- Create new payments table with full Component 18 schema
CREATE TABLE payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE RESTRICT,

  -- Payment details
  amount NUMERIC(15,6) NOT NULL CHECK (amount > 0),
  currency VARCHAR(3) NOT NULL DEFAULT 'MXN',
  exchange_rate NUMERIC(15,6) NOT NULL DEFAULT 1.0,
  payment_date DATE NOT NULL,
  payment_method VARCHAR(2) NOT NULL,           -- SAT c_FormaPago code
  reference_number VARCHAR(100),                -- NumOperacion
  bank_account_origin VARCHAR(50),              -- CtaOrdenante
  bank_account_dest VARCHAR(50),                -- CtaBeneficiario
  bank_rfc_origin VARCHAR(13),                  -- RfcEmisorCtaOrd
  bank_rfc_dest VARCHAR(13),                    -- RfcEmisorCtaBen
  bank_name_external VARCHAR(300),              -- NomBancoOrdExt
  notes TEXT,

  -- Status
  status VARCHAR(20) NOT NULL DEFAULT 'applied'
    CHECK (status IN ('pending', 'applied', 'voided')),

  -- Complemento de Pagos (PPD only)
  cfdi_uuid UUID,                               -- UUID from TFD
  cfdi_xml TEXT,                                -- Full stamped XML
  pdf_url TEXT,                                 -- R2 URL (future)

  -- Void tracking
  voided_at TIMESTAMPTZ,
  void_reason TEXT,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================
-- INDEXES
-- ============================================

CREATE INDEX idx_payments_org ON payments(organization_id);
CREATE INDEX idx_payments_invoice ON payments(invoice_id);
CREATE INDEX idx_payments_date ON payments(payment_date DESC);
CREATE INDEX idx_payments_status ON payments(status);
CREATE INDEX idx_payments_cfdi_uuid ON payments(cfdi_uuid) WHERE cfdi_uuid IS NOT NULL;

-- Composite index for invoice payment summary queries
CREATE INDEX idx_payments_invoice_status ON payments(invoice_id, status);

-- ============================================
-- ADD PAYMENT_STATUS TO INVOICES
-- ============================================

-- Add payment_status column if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'invoices' AND column_name = 'payment_status'
  ) THEN
    ALTER TABLE invoices ADD COLUMN payment_status VARCHAR(20)
      DEFAULT 'unpaid'
      CHECK (payment_status IN ('unpaid', 'partially_paid', 'paid'));
  END IF;
END $$;

-- Index for unpaid/partially paid invoices (common query)
CREATE INDEX IF NOT EXISTS idx_invoices_payment_status
  ON invoices(payment_status)
  WHERE payment_status != 'paid';

-- ============================================
-- RLS POLICIES
-- ============================================

ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

-- Members can view org payments
CREATE POLICY "Members can view org payments"
  ON payments FOR SELECT TO authenticated
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
    )
  );

-- Members can create payments
CREATE POLICY "Members can create payments"
  ON payments FOR INSERT TO authenticated
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
    )
  );

-- Members can update payments
CREATE POLICY "Members can update payments"
  ON payments FOR UPDATE TO authenticated
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
    )
  );

-- Service role can do everything (for backend operations)
CREATE POLICY "Service role full access"
  ON payments FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================
-- UPDATED_AT TRIGGER
-- ============================================

CREATE OR REPLACE FUNCTION update_payments_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER payments_updated_at
  BEFORE UPDATE ON payments
  FOR EACH ROW EXECUTE FUNCTION update_payments_updated_at();

-- ============================================
-- COMMENTS
-- ============================================

COMMENT ON TABLE payments IS 'Payment records with SAT Complemento de Pagos 2.0 support (Component 18)';
COMMENT ON COLUMN payments.payment_method IS 'SAT c_FormaPago code (01-31, 99)';
COMMENT ON COLUMN payments.status IS 'pending = awaiting CFDI generation (PPD), applied = payment recorded and CFDI stamped (or PUE), voided = payment cancelled';
COMMENT ON COLUMN payments.cfdi_uuid IS 'UUID of stamped Complemento de Pagos CFDI (PPD payments only)';
COMMENT ON COLUMN payments.cfdi_xml IS 'Full stamped XML of payment CFDI (type P)';
