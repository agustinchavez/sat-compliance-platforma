-- ============================================
-- Create customers table
-- Migration: 20251119000001_create_customers_table
-- Component: 6 - Customer Service
-- Description: Customer management for CFDI invoicing with SAT integration fields
-- ============================================

-- Create customers table
CREATE TABLE IF NOT EXISTS customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- Basic Information
  rfc VARCHAR(13) NOT NULL,
  legal_name VARCHAR(255) NOT NULL,
  business_name VARCHAR(255),
  email VARCHAR(255),
  phone VARCHAR(20),

  -- Fiscal Information (SAT Requirements)
  tax_regime VARCHAR(10) NOT NULL,
  cfdi_use VARCHAR(10) NOT NULL DEFAULT 'G03',

  -- Address (Mexican format stored as JSONB)
  address JSONB,

  -- SAT Integration Fields (Phase 2)
  sat_validated BOOLEAN NOT NULL DEFAULT false,
  last_sat_validation TIMESTAMP,
  sat_metadata JSONB,

  -- Metadata
  notes TEXT,
  tags TEXT[] DEFAULT '{}',
  is_active BOOLEAN NOT NULL DEFAULT true,

  -- Timestamps
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMP,

  -- Constraints
  CONSTRAINT unique_customer_rfc UNIQUE (organization_id, rfc, deleted_at),
  CONSTRAINT check_rfc_length CHECK (char_length(rfc) BETWEEN 12 AND 13),
  CONSTRAINT check_rfc_format CHECK (rfc ~ '^[A-ZÑ&0-9]+$'),
  CONSTRAINT check_tax_regime_format CHECK (tax_regime ~ '^\d{3}$'),
  CONSTRAINT check_postal_code CHECK (
    address IS NULL OR
    (address->>'postal_code')::text IS NULL OR
    (address->>'postal_code')::text ~ '^\d{5}$'
  )
);

-- ============================================
-- Add SAT Integration Columns (if not exists)
-- ============================================
-- This handles existing tables that don't have SAT columns

DO $$
BEGIN
  -- Add sat_validated column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'customers' AND column_name = 'sat_validated'
  ) THEN
    ALTER TABLE customers ADD COLUMN sat_validated BOOLEAN NOT NULL DEFAULT false;
  END IF;

  -- Add last_sat_validation column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'customers' AND column_name = 'last_sat_validation'
  ) THEN
    ALTER TABLE customers ADD COLUMN last_sat_validation TIMESTAMP;
  END IF;

  -- Add sat_metadata column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'customers' AND column_name = 'sat_metadata'
  ) THEN
    ALTER TABLE customers ADD COLUMN sat_metadata JSONB;
  END IF;
END $$;

-- ============================================
-- Indexes for Performance
-- ============================================

-- Organization scoping (most common query)
CREATE INDEX IF NOT EXISTS idx_customers_org ON customers(organization_id)
  WHERE deleted_at IS NULL;

-- RFC lookup (unique identifier)
CREATE INDEX IF NOT EXISTS idx_customers_rfc ON customers(rfc)
  WHERE deleted_at IS NULL;

-- Active customers filter
CREATE INDEX IF NOT EXISTS idx_customers_active ON customers(is_active, organization_id)
  WHERE deleted_at IS NULL;

-- Tax regime filter
CREATE INDEX IF NOT EXISTS idx_customers_regime ON customers(tax_regime)
  WHERE deleted_at IS NULL;

-- CFDI use filter
CREATE INDEX IF NOT EXISTS idx_customers_cfdi_use ON customers(cfdi_use)
  WHERE deleted_at IS NULL;

-- Tags search (GIN index for array operations)
CREATE INDEX IF NOT EXISTS idx_customers_tags ON customers USING gin(tags);

-- Created date sorting
CREATE INDEX IF NOT EXISTS idx_customers_created ON customers(created_at DESC);

-- Updated date sorting
CREATE INDEX IF NOT EXISTS idx_customers_updated ON customers(updated_at DESC);

-- Full-text search index (Spanish language)
-- Searches across legal_name, business_name, and RFC
CREATE INDEX IF NOT EXISTS idx_customers_search ON customers
  USING gin(
    to_tsvector('spanish',
      legal_name || ' ' ||
      COALESCE(business_name, '') || ' ' ||
      rfc
    )
  );

-- SAT validation status (Phase 2)
CREATE INDEX IF NOT EXISTS idx_customers_sat_validated ON customers(sat_validated)
  WHERE deleted_at IS NULL;

-- ============================================
-- Enable Row Level Security
-- ============================================

ALTER TABLE customers ENABLE ROW LEVEL SECURITY;

-- ============================================
-- RLS Policies
-- ============================================

-- Policy: Users can view customers from their organization(s)
DO $$ BEGIN
  CREATE POLICY "Users can view org customers"
    ON customers
    FOR SELECT
    USING (
      organization_id IN (
        SELECT organization_id
        FROM organization_members
        WHERE user_id = auth.uid()
          AND deleted_at IS NULL
      )
    );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Policy: Users can insert customers to their organization(s)
DO $$ BEGIN
  CREATE POLICY "Users can create org customers"
    ON customers
    FOR INSERT
    WITH CHECK (
      organization_id IN (
        SELECT organization_id
        FROM organization_members
        WHERE user_id = auth.uid()
          AND deleted_at IS NULL
          AND role IN ('owner', 'admin', 'accountant')
      )
    );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Policy: Users can update customers in their organization(s)
DO $$ BEGIN
  CREATE POLICY "Users can update org customers"
    ON customers
    FOR UPDATE
    USING (
      organization_id IN (
        SELECT organization_id
        FROM organization_members
        WHERE user_id = auth.uid()
          AND deleted_at IS NULL
          AND role IN ('owner', 'admin', 'accountant')
      )
    );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Policy: Users can soft delete customers in their organization(s)
DO $$ BEGIN
  CREATE POLICY "Users can delete org customers"
    ON customers
    FOR DELETE
    USING (
      organization_id IN (
        SELECT organization_id
        FROM organization_members
        WHERE user_id = auth.uid()
          AND deleted_at IS NULL
          AND role IN ('owner', 'admin')
      )
    );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ============================================
-- Trigger: Auto-update updated_at timestamp
-- ============================================

CREATE OR REPLACE FUNCTION update_customers_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_customers_updated_at ON customers;
CREATE TRIGGER trigger_customers_updated_at
  BEFORE UPDATE ON customers
  FOR EACH ROW
  EXECUTE FUNCTION update_customers_updated_at();

-- ============================================
-- Comments for Documentation
-- ============================================

COMMENT ON TABLE customers IS 'Customer (receptor) information for CFDI invoicing with SAT integration support';
COMMENT ON COLUMN customers.rfc IS 'RFC (Registro Federal de Contribuyentes) - Mexican tax ID';
COMMENT ON COLUMN customers.legal_name IS 'Razón social - Official legal name';
COMMENT ON COLUMN customers.business_name IS 'Nombre comercial - Commercial/trade name (optional)';
COMMENT ON COLUMN customers.tax_regime IS 'Régimen fiscal - SAT tax regime code (601, 603, 612, etc.)';
COMMENT ON COLUMN customers.cfdi_use IS 'Uso de CFDI - SAT CFDI use code (G01, G03, etc.)';
COMMENT ON COLUMN customers.address IS 'Mexican address in JSONB format: {street, exterior_number, interior_number, colony, city, state, postal_code, country}';
COMMENT ON COLUMN customers.sat_validated IS 'Whether RFC has been validated against SAT registry (Phase 2)';
COMMENT ON COLUMN customers.last_sat_validation IS 'Timestamp of last SAT validation (Phase 2)';
COMMENT ON COLUMN customers.sat_metadata IS 'SAT validation response data (Phase 2): {validated_at, sat_legal_name, sat_tax_regime, sat_status}';
COMMENT ON COLUMN customers.tags IS 'Array of tags for categorization and filtering';
COMMENT ON COLUMN customers.is_active IS 'Whether customer is active (can be used for new invoices)';
COMMENT ON COLUMN customers.deleted_at IS 'Soft delete timestamp';
