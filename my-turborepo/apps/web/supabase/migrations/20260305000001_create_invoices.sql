-- ============================================
-- SAT COMPLIANCE PLATFORM - Invoice Service (Core)
-- Migration: 20260305000001_create_invoices
-- Component: 12 - Invoice Service (Core)
-- Description: Enhance invoices for CFDI 4.0 compliance, add folio sequences
-- ============================================

-- ============================================
-- ENHANCE INVOICES TABLE FOR CFDI 4.0
-- ============================================

-- Add missing columns to existing invoices table
DO $$
BEGIN
  -- Add folio_number as INTEGER (existing is VARCHAR)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'invoices' AND column_name = 'folio_number_int'
  ) THEN
    ALTER TABLE invoices ADD COLUMN folio_number_int INTEGER;
    -- Migrate existing folio_number to integer
    UPDATE invoices SET folio_number_int = folio_number::INTEGER
    WHERE folio_number IS NOT NULL AND folio_number ~ '^\d+$';
  END IF;

  -- Rename cfdi_type to tipo_comprobante if needed
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'invoices' AND column_name = 'cfdi_type'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'invoices' AND column_name = 'tipo_comprobante'
  ) THEN
    ALTER TABLE invoices RENAME COLUMN cfdi_type TO tipo_comprobante;
  END IF;

  -- Add tipo_comprobante if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'invoices' AND column_name = 'tipo_comprobante'
  ) THEN
    ALTER TABLE invoices ADD COLUMN tipo_comprobante VARCHAR(1) NOT NULL DEFAULT 'I';
  END IF;

  -- Add issue_date (separate from issued_at for CFDI Fecha field)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'invoices' AND column_name = 'issue_date'
  ) THEN
    ALTER TABLE invoices ADD COLUMN issue_date TIMESTAMP NOT NULL DEFAULT NOW();
    -- Migrate from issued_at if exists
    UPDATE invoices SET issue_date = issued_at WHERE issued_at IS NOT NULL;
  END IF;

  -- Add due_date if not exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'invoices' AND column_name = 'due_date'
  ) THEN
    ALTER TABLE invoices ADD COLUMN due_date DATE;
  END IF;

  -- Issuer fields (denormalized from organization at creation time)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'invoices' AND column_name = 'issuer_rfc'
  ) THEN
    ALTER TABLE invoices ADD COLUMN issuer_rfc VARCHAR(13);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'invoices' AND column_name = 'issuer_name'
  ) THEN
    ALTER TABLE invoices ADD COLUMN issuer_name VARCHAR(254);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'invoices' AND column_name = 'issuer_tax_regime'
  ) THEN
    ALTER TABLE invoices ADD COLUMN issuer_tax_regime VARCHAR(3);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'invoices' AND column_name = 'issuer_zip_code'
  ) THEN
    ALTER TABLE invoices ADD COLUMN issuer_zip_code VARCHAR(5);
  END IF;

  -- Receiver fields (denormalized from customer at creation time)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'invoices' AND column_name = 'receiver_rfc'
  ) THEN
    ALTER TABLE invoices ADD COLUMN receiver_rfc VARCHAR(13);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'invoices' AND column_name = 'receiver_name'
  ) THEN
    ALTER TABLE invoices ADD COLUMN receiver_name VARCHAR(254);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'invoices' AND column_name = 'receiver_tax_regime'
  ) THEN
    ALTER TABLE invoices ADD COLUMN receiver_tax_regime VARCHAR(3);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'invoices' AND column_name = 'receiver_zip_code'
  ) THEN
    ALTER TABLE invoices ADD COLUMN receiver_zip_code VARCHAR(5);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'invoices' AND column_name = 'receiver_cfdi_use'
  ) THEN
    ALTER TABLE invoices ADD COLUMN receiver_cfdi_use VARCHAR(3);
  END IF;

  -- Exportation (required CFDI 4.0 field)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'invoices' AND column_name = 'exportacion'
  ) THEN
    ALTER TABLE invoices ADD COLUMN exportacion VARCHAR(2) NOT NULL DEFAULT '01';
  END IF;

  -- Tax breakdown fields with higher precision
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'invoices' AND column_name = 'total_iva_trasladado'
  ) THEN
    ALTER TABLE invoices ADD COLUMN total_iva_trasladado DECIMAL(18, 6) NOT NULL DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'invoices' AND column_name = 'total_iva_retenido'
  ) THEN
    ALTER TABLE invoices ADD COLUMN total_iva_retenido DECIMAL(18, 6) NOT NULL DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'invoices' AND column_name = 'total_isr_retenido'
  ) THEN
    ALTER TABLE invoices ADD COLUMN total_isr_retenido DECIMAL(18, 6) NOT NULL DEFAULT 0;
  END IF;

  -- Global Invoice fields (for public invoices without customer RFC)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'invoices' AND column_name = 'is_global'
  ) THEN
    ALTER TABLE invoices ADD COLUMN is_global BOOLEAN DEFAULT false;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'invoices' AND column_name = 'global_periodicity'
  ) THEN
    ALTER TABLE invoices ADD COLUMN global_periodicity VARCHAR(2);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'invoices' AND column_name = 'global_months'
  ) THEN
    ALTER TABLE invoices ADD COLUMN global_months VARCHAR(2);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'invoices' AND column_name = 'global_year'
  ) THEN
    ALTER TABLE invoices ADD COLUMN global_year VARCHAR(4);
  END IF;

  -- Cancellation fields
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'invoices' AND column_name = 'cancellation_uuid'
  ) THEN
    ALTER TABLE invoices ADD COLUMN cancellation_uuid VARCHAR(36);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'invoices' AND column_name = 'cancellation_response_code'
  ) THEN
    ALTER TABLE invoices ADD COLUMN cancellation_response_code VARCHAR(5);
  END IF;

  -- Optional CFDI fields
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'invoices' AND column_name = 'conditions'
  ) THEN
    ALTER TABLE invoices ADD COLUMN conditions VARCHAR(1000);
  END IF;

  -- Rename xml_content to cfdi_xml for consistency
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'invoices' AND column_name = 'xml_content'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'invoices' AND column_name = 'cfdi_xml'
  ) THEN
    ALTER TABLE invoices RENAME COLUMN xml_content TO cfdi_xml;
  END IF;

  -- Add updated_by column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'invoices' AND column_name = 'updated_by'
  ) THEN
    ALTER TABLE invoices ADD COLUMN updated_by UUID REFERENCES users(id);
  END IF;

END $$;

-- ============================================
-- ADD STATUS VALUE 'void' TO ENUM (if using ENUM)
-- ============================================

-- Check if invoice_status type exists and add 'void' value
DO $$
BEGIN
  -- Add 'void' to invoice_status enum if it exists and doesn't have it
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'invoice_status') THEN
    ALTER TYPE invoice_status ADD VALUE IF NOT EXISTS 'void';
  END IF;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ============================================
-- ENHANCE INVOICE_ITEMS TABLE
-- ============================================

DO $$
BEGIN
  -- Add sort_order (rename from line_order if exists)
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'invoice_items' AND column_name = 'line_order'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'invoice_items' AND column_name = 'sort_order'
  ) THEN
    ALTER TABLE invoice_items RENAME COLUMN line_order TO sort_order;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'invoice_items' AND column_name = 'sort_order'
  ) THEN
    ALTER TABLE invoice_items ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0;
  END IF;

  -- Add SAT product code (rename from sat_code if exists)
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'invoice_items' AND column_name = 'sat_code'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'invoice_items' AND column_name = 'sat_product_code'
  ) THEN
    ALTER TABLE invoice_items RENAME COLUMN sat_code TO sat_product_code;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'invoice_items' AND column_name = 'sat_product_code'
  ) THEN
    ALTER TABLE invoice_items ADD COLUMN sat_product_code VARCHAR(8);
  END IF;

  -- Add SAT unit code
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'invoice_items' AND column_name = 'unit_of_measure'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'invoice_items' AND column_name = 'sat_unit_code'
  ) THEN
    ALTER TABLE invoice_items RENAME COLUMN unit_of_measure TO sat_unit_code;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'invoice_items' AND column_name = 'sat_unit_code'
  ) THEN
    ALTER TABLE invoice_items ADD COLUMN sat_unit_code VARCHAR(10);
  END IF;

  -- Add unit name
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'invoice_items' AND column_name = 'unit_name'
  ) THEN
    ALTER TABLE invoice_items ADD COLUMN unit_name VARCHAR(50);
  END IF;

  -- Add SKU
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'invoice_items' AND column_name = 'sku'
  ) THEN
    ALTER TABLE invoice_items ADD COLUMN sku VARCHAR(100);
  END IF;

  -- Rename discount to discount_amount
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'invoice_items' AND column_name = 'discount'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'invoice_items' AND column_name = 'discount_amount'
  ) THEN
    ALTER TABLE invoice_items RENAME COLUMN discount TO discount_amount;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'invoice_items' AND column_name = 'discount_amount'
  ) THEN
    ALTER TABLE invoice_items ADD COLUMN discount_amount DECIMAL(18, 6) NOT NULL DEFAULT 0;
  END IF;

  -- Tax object
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'invoice_items' AND column_name = 'tax_object'
  ) THEN
    ALTER TABLE invoice_items ADD COLUMN tax_object VARCHAR(2) NOT NULL DEFAULT '02';
  END IF;

  -- IVA fields with proper precision
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'invoice_items' AND column_name = 'iva_rate'
  ) THEN
    ALTER TABLE invoice_items ADD COLUMN iva_rate DECIMAL(6, 4) NOT NULL DEFAULT 0.16;
    -- Migrate from tax_rate if exists
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'invoice_items' AND column_name = 'tax_rate'
    ) THEN
      UPDATE invoice_items SET iva_rate = tax_rate WHERE tax_rate IS NOT NULL;
    END IF;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'invoice_items' AND column_name = 'iva_exempt'
  ) THEN
    ALTER TABLE invoice_items ADD COLUMN iva_exempt BOOLEAN NOT NULL DEFAULT false;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'invoice_items' AND column_name = 'iva_trasladado'
  ) THEN
    ALTER TABLE invoice_items ADD COLUMN iva_trasladado DECIMAL(18, 6) NOT NULL DEFAULT 0;
    -- Migrate from tax_amount if exists
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'invoice_items' AND column_name = 'tax_amount'
    ) THEN
      UPDATE invoice_items SET iva_trasladado = tax_amount WHERE tax_amount IS NOT NULL;
    END IF;
  END IF;

  -- IVA retention fields
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'invoice_items' AND column_name = 'iva_retention_rate'
  ) THEN
    ALTER TABLE invoice_items ADD COLUMN iva_retention_rate DECIMAL(6, 4);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'invoice_items' AND column_name = 'iva_retenido'
  ) THEN
    ALTER TABLE invoice_items ADD COLUMN iva_retenido DECIMAL(18, 6) NOT NULL DEFAULT 0;
  END IF;

  -- ISR retention fields
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'invoice_items' AND column_name = 'isr_retention_rate'
  ) THEN
    ALTER TABLE invoice_items ADD COLUMN isr_retention_rate DECIMAL(6, 4);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'invoice_items' AND column_name = 'isr_retenido'
  ) THEN
    ALTER TABLE invoice_items ADD COLUMN isr_retenido DECIMAL(18, 6) NOT NULL DEFAULT 0;
  END IF;

END $$;

-- ============================================
-- CREATE INVOICE_RELATED_CFDI TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS invoice_related_cfdi (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  tipo_relacion VARCHAR(2) NOT NULL,     -- SAT relationship type code
  related_uuid VARCHAR(36) NOT NULL,     -- UUID of the related CFDI
  related_invoice_id UUID REFERENCES invoices(id),  -- If related invoice is in our system
  created_at TIMESTAMP DEFAULT NOW(),
  CONSTRAINT check_tipo_relacion CHECK (
    tipo_relacion IN ('01','02','03','04','05','06','07','08','09')
  )
);

-- Indexes for related CFDI
CREATE INDEX IF NOT EXISTS idx_related_cfdi_invoice ON invoice_related_cfdi(invoice_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_related_cfdi_unique
  ON invoice_related_cfdi(invoice_id, related_uuid);
CREATE INDEX IF NOT EXISTS idx_related_cfdi_related ON invoice_related_cfdi(related_invoice_id)
  WHERE related_invoice_id IS NOT NULL;

COMMENT ON TABLE invoice_related_cfdi IS 'Stores relationships between invoices for credit notes, substitutions, etc.';

-- ============================================
-- CREATE INVOICE_FOLIO_SEQUENCES TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS invoice_folio_sequences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  serie VARCHAR(25) NOT NULL DEFAULT '',
  next_folio INTEGER NOT NULL DEFAULT 1,
  updated_at TIMESTAMP DEFAULT NOW(),
  CONSTRAINT unique_org_serie UNIQUE (organization_id, serie)
);

-- Indexes for folio sequences
CREATE INDEX IF NOT EXISTS idx_folio_sequences_org ON invoice_folio_sequences(organization_id);

COMMENT ON TABLE invoice_folio_sequences IS 'Atomic folio sequence generator per organization and series.';

-- ============================================
-- CREATE get_next_folio FUNCTION
-- ============================================

CREATE OR REPLACE FUNCTION get_next_folio(p_org_id UUID, p_serie VARCHAR)
RETURNS INTEGER AS $$
DECLARE
  v_folio INTEGER;
BEGIN
  INSERT INTO invoice_folio_sequences (organization_id, serie, next_folio)
  VALUES (p_org_id, COALESCE(p_serie, ''), 2)
  ON CONFLICT (organization_id, serie)
  DO UPDATE SET
    next_folio = invoice_folio_sequences.next_folio + 1,
    updated_at = NOW()
  RETURNING next_folio - 1 INTO v_folio;
  RETURN v_folio;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_next_folio(UUID, VARCHAR) IS 'Atomically gets and increments the next folio number for an org/series combination.';

-- ============================================
-- ADDITIONAL INDEXES FOR INVOICES
-- ============================================

-- Folio lookup index
CREATE INDEX IF NOT EXISTS idx_invoices_folio ON invoices(organization_id, serie, folio_number_int)
  WHERE deleted_at IS NULL;

-- Issue date index for date range queries
CREATE INDEX IF NOT EXISTS idx_invoices_issue_date ON invoices(issue_date)
  WHERE deleted_at IS NULL;

-- CFDI type index
CREATE INDEX IF NOT EXISTS idx_invoices_tipo ON invoices(tipo_comprobante)
  WHERE deleted_at IS NULL;

-- Full-text search on receiver name and folio
CREATE INDEX IF NOT EXISTS idx_invoices_search ON invoices
  USING gin(to_tsvector('spanish',
    COALESCE(receiver_name, '') || ' ' ||
    COALESCE(folio_number, '') || ' ' ||
    COALESCE(serie, '')
  )) WHERE deleted_at IS NULL;

-- ============================================
-- ENABLE ROW LEVEL SECURITY
-- ============================================

ALTER TABLE invoice_related_cfdi ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_folio_sequences ENABLE ROW LEVEL SECURITY;

-- Note: invoices and invoice_items already have RLS enabled from initial migration

-- ============================================
-- RLS POLICIES FOR INVOICES (enhanced)
-- ============================================

-- Drop existing policies if they exist and recreate with proper role checks
DO $$ BEGIN
  DROP POLICY IF EXISTS "invoices_select" ON invoices;
  DROP POLICY IF EXISTS "invoices_insert" ON invoices;
  DROP POLICY IF EXISTS "invoices_update" ON invoices;
  DROP POLICY IF EXISTS "invoices_select_policy" ON invoices;
  DROP POLICY IF EXISTS "invoices_insert_policy" ON invoices;
  DROP POLICY IF EXISTS "invoices_update_delete_policy" ON invoices;
EXCEPTION
  WHEN undefined_object THEN NULL;
END $$;

-- Invoices: members of the organization can read
CREATE POLICY "invoices_select" ON invoices FOR SELECT
  USING (organization_id IN (
    SELECT organization_id FROM organization_members
    WHERE user_id = auth.uid()
    AND deleted_at IS NULL
  ));

-- Invoices: only owners, admins, accountants can create
CREATE POLICY "invoices_insert" ON invoices FOR INSERT
  WITH CHECK (organization_id IN (
    SELECT organization_id FROM organization_members
    WHERE user_id = auth.uid()
    AND role IN ('owner', 'admin', 'accountant')
    AND deleted_at IS NULL
  ));

-- Invoices: only owners, admins, accountants can update
CREATE POLICY "invoices_update" ON invoices FOR UPDATE
  USING (organization_id IN (
    SELECT organization_id FROM organization_members
    WHERE user_id = auth.uid()
    AND role IN ('owner', 'admin', 'accountant')
    AND deleted_at IS NULL
  ));

-- ============================================
-- RLS POLICIES FOR INVOICE_ITEMS
-- ============================================

-- Drop existing policies if they exist
DO $$ BEGIN
  DROP POLICY IF EXISTS "invoice_items_select" ON invoice_items;
  DROP POLICY IF EXISTS "invoice_items_modify" ON invoice_items;
EXCEPTION
  WHEN undefined_object THEN NULL;
END $$;

-- invoice_items: members can read
CREATE POLICY "invoice_items_select" ON invoice_items FOR SELECT
  USING (invoice_id IN (
    SELECT id FROM invoices WHERE organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid()
      AND deleted_at IS NULL
    )
  ));

-- invoice_items: owners, admins, accountants can modify
CREATE POLICY "invoice_items_modify" ON invoice_items
  FOR ALL
  USING (invoice_id IN (
    SELECT id FROM invoices WHERE organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid()
      AND role IN ('owner', 'admin', 'accountant')
      AND deleted_at IS NULL
    )
  ));

-- ============================================
-- RLS POLICIES FOR INVOICE_RELATED_CFDI
-- ============================================

-- related_cfdi: members can read
CREATE POLICY "related_cfdi_select" ON invoice_related_cfdi FOR SELECT
  USING (invoice_id IN (
    SELECT id FROM invoices WHERE organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid()
      AND deleted_at IS NULL
    )
  ));

-- related_cfdi: owners, admins, accountants can modify
CREATE POLICY "related_cfdi_modify" ON invoice_related_cfdi
  FOR ALL
  USING (invoice_id IN (
    SELECT id FROM invoices WHERE organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid()
      AND role IN ('owner', 'admin', 'accountant')
      AND deleted_at IS NULL
    )
  ));

-- ============================================
-- RLS POLICIES FOR INVOICE_FOLIO_SEQUENCES
-- ============================================

-- folio_sequences: members can read
CREATE POLICY "folio_sequences_select" ON invoice_folio_sequences FOR SELECT
  USING (organization_id IN (
    SELECT organization_id FROM organization_members
    WHERE user_id = auth.uid()
    AND deleted_at IS NULL
  ));

-- folio_sequences: owners, admins, accountants can modify
CREATE POLICY "folio_sequences_modify" ON invoice_folio_sequences
  FOR ALL
  USING (organization_id IN (
    SELECT organization_id FROM organization_members
    WHERE user_id = auth.uid()
    AND role IN ('owner', 'admin', 'accountant')
    AND deleted_at IS NULL
  ));

-- ============================================
-- TRIGGERS
-- ============================================

-- Updated at trigger for invoices (if not exists)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trigger_invoices_updated_at'
  ) THEN
    CREATE TRIGGER trigger_invoices_updated_at
      BEFORE UPDATE ON invoices
      FOR EACH ROW
      EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

-- Updated at trigger for folio_sequences
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trigger_folio_sequences_updated_at'
  ) THEN
    CREATE TRIGGER trigger_folio_sequences_updated_at
      BEFORE UPDATE ON invoice_folio_sequences
      FOR EACH ROW
      EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

-- ============================================
-- COMMENTS
-- ============================================

COMMENT ON COLUMN invoices.tipo_comprobante IS 'CFDI type: I=Ingreso, E=Egreso, T=Traslado';
COMMENT ON COLUMN invoices.issue_date IS 'CFDI Fecha - the datetime shown on the invoice';
COMMENT ON COLUMN invoices.issuer_rfc IS 'Denormalized issuer RFC at time of invoice creation';
COMMENT ON COLUMN invoices.issuer_name IS 'Denormalized issuer business name at time of invoice creation';
COMMENT ON COLUMN invoices.receiver_zip_code IS 'DomicilioFiscalReceptor - Required in CFDI 4.0';
COMMENT ON COLUMN invoices.receiver_tax_regime IS 'RegimenFiscalReceptor - Required in CFDI 4.0';
COMMENT ON COLUMN invoices.exportacion IS 'Exportacion field - Required in CFDI 4.0, default 01=No exportacion';
COMMENT ON COLUMN invoices.folio_number_int IS 'Numeric folio for auto-increment sequences';
COMMENT ON COLUMN invoice_items.tax_object IS 'ObjetoImp: 01=No object of tax, 02=Yes subject, 03=Yes not subject';
COMMENT ON COLUMN invoice_items.iva_trasladado IS 'IVA tax amount transferred to customer';
COMMENT ON COLUMN invoice_items.iva_retenido IS 'IVA tax amount retained from customer';
COMMENT ON COLUMN invoice_items.isr_retenido IS 'ISR tax amount retained from customer';
