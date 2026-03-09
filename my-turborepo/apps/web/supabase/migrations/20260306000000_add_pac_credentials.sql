-- ============================================
-- SAT COMPLIANCE PLATFORM - PAC Credentials Table
-- Migration: 20260306000000_add_pac_credentials
-- Description: Creates dedicated table for PAC provider credentials
--              with encrypted password storage (Component 15)
-- ============================================

-- ============================================
-- PAC CREDENTIALS TABLE
-- ============================================

-- Create table for PAC credentials
-- This replaces the simple pac_credentials JSONB column on organizations
-- with a proper table supporting multiple providers and encrypted credentials
CREATE TABLE IF NOT EXISTS organization_pac_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- Provider configuration
  provider VARCHAR(20) NOT NULL CHECK (provider IN ('finkok', 'sw')),
  is_primary BOOLEAN DEFAULT TRUE,
  environment VARCHAR(20) NOT NULL DEFAULT 'sandbox' CHECK (environment IN ('sandbox', 'production')),

  -- Finkok credentials (SOAP API)
  finkok_username VARCHAR(255),
  finkok_password_encrypted TEXT, -- JSON: { encryptedData, iv, authTag }

  -- SW Sapien credentials (REST API)
  sw_username VARCHAR(255),
  sw_password_encrypted TEXT, -- JSON: { encryptedData, iv, authTag }
  sw_token_encrypted TEXT,    -- Cached auth token (encrypted)
  sw_token_expires_at TIMESTAMP,

  -- Metadata
  last_used_at TIMESTAMP,
  last_error TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),

  -- Constraints
  CONSTRAINT valid_finkok_credentials CHECK (
    provider != 'finkok' OR (
      finkok_username IS NOT NULL AND
      finkok_password_encrypted IS NOT NULL
    )
  ),
  CONSTRAINT valid_sw_credentials CHECK (
    provider != 'sw' OR (
      sw_username IS NOT NULL AND
      (sw_password_encrypted IS NOT NULL OR sw_token_encrypted IS NOT NULL)
    )
  )
);

-- Create unique constraint for primary credentials per organization
CREATE UNIQUE INDEX IF NOT EXISTS idx_pac_credentials_primary
  ON organization_pac_credentials(organization_id)
  WHERE is_primary = TRUE;

-- Index for organization lookup
CREATE INDEX IF NOT EXISTS idx_pac_credentials_org
  ON organization_pac_credentials(organization_id);

-- Index for provider lookup
CREATE INDEX IF NOT EXISTS idx_pac_credentials_provider
  ON organization_pac_credentials(provider);

-- Add updated_at trigger
DROP TRIGGER IF EXISTS update_pac_credentials_updated_at ON organization_pac_credentials;
CREATE TRIGGER update_pac_credentials_updated_at
  BEFORE UPDATE ON organization_pac_credentials
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Add comment to explain the table
COMMENT ON TABLE organization_pac_credentials IS 'Stores encrypted PAC provider credentials for CFDI stamping (Component 15)';
COMMENT ON COLUMN organization_pac_credentials.finkok_password_encrypted IS 'AES-256-GCM encrypted password as JSON: { encryptedData, iv, authTag }';
COMMENT ON COLUMN organization_pac_credentials.sw_password_encrypted IS 'AES-256-GCM encrypted password as JSON: { encryptedData, iv, authTag }';
COMMENT ON COLUMN organization_pac_credentials.sw_token_encrypted IS 'AES-256-GCM encrypted auth token for caching';

-- ============================================
-- INVOICE STAMPS TABLE
-- ============================================

-- Create table to store TFD stamp data for each stamped invoice
CREATE TABLE IF NOT EXISTS invoice_stamps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- TFD data from SAT
  uuid VARCHAR(36) NOT NULL, -- SAT UUID
  fecha_timbrado TIMESTAMP NOT NULL,
  rfc_prov_certif VARCHAR(20) NOT NULL, -- PAC's RFC
  sello_cfd TEXT NOT NULL, -- Echo of our signature
  no_certificado_sat VARCHAR(20) NOT NULL,
  sello_sat TEXT NOT NULL, -- SAT's signature
  tfd_version VARCHAR(10) DEFAULT '1.1',

  -- PAC tracking
  pac_provider VARCHAR(20) NOT NULL,
  pac_environment VARCHAR(20) NOT NULL,

  -- Metadata
  stamped_xml_url TEXT, -- S3/storage URL for stamped XML
  created_at TIMESTAMP DEFAULT NOW(),

  -- Constraints
  CONSTRAINT valid_uuid_format CHECK (
    uuid ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  )
);

-- Unique constraint on invoice (one stamp per invoice)
CREATE UNIQUE INDEX IF NOT EXISTS idx_invoice_stamps_invoice
  ON invoice_stamps(invoice_id);

-- Index for UUID lookup (common operation)
CREATE UNIQUE INDEX IF NOT EXISTS idx_invoice_stamps_uuid
  ON invoice_stamps(uuid);

-- Index for organization lookup
CREATE INDEX IF NOT EXISTS idx_invoice_stamps_org
  ON invoice_stamps(organization_id, created_at DESC);

-- Add comment
COMMENT ON TABLE invoice_stamps IS 'Stores TFD (Timbre Fiscal Digital) data from PAC stamping (Component 15)';

-- ============================================
-- INVOICE CANCELLATIONS TABLE
-- ============================================

-- Create table to track cancellation history
CREATE TABLE IF NOT EXISTS invoice_cancellations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- Cancellation data
  uuid VARCHAR(36) NOT NULL, -- Invoice UUID being cancelled
  motivo VARCHAR(2) NOT NULL CHECK (motivo IN ('01', '02', '03', '04')),
  folio_sustitucion VARCHAR(36), -- Required for motivo 01
  estatus_uuid VARCHAR(10), -- SAT response status
  acuse TEXT, -- SAT acknowledgement XML

  -- Status
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'rejected', 'failed')),
  error_message TEXT,

  -- PAC tracking
  pac_provider VARCHAR(20) NOT NULL,

  -- Metadata
  requested_at TIMESTAMP DEFAULT NOW(),
  completed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),

  -- Constraints
  CONSTRAINT valid_motivo_01 CHECK (
    motivo != '01' OR folio_sustitucion IS NOT NULL
  )
);

-- Index for invoice lookup
CREATE INDEX IF NOT EXISTS idx_invoice_cancellations_invoice
  ON invoice_cancellations(invoice_id);

-- Index for organization lookup
CREATE INDEX IF NOT EXISTS idx_invoice_cancellations_org
  ON invoice_cancellations(organization_id, created_at DESC);

-- Index for status lookup
CREATE INDEX IF NOT EXISTS idx_invoice_cancellations_status
  ON invoice_cancellations(status)
  WHERE status != 'completed';

-- Add comment
COMMENT ON TABLE invoice_cancellations IS 'Tracks CFDI cancellation requests and SAT responses (Component 15)';
COMMENT ON COLUMN invoice_cancellations.motivo IS 'SAT cancellation reason: 01=Replacement, 02=Error, 03=Not executed, 04=Nominal operation';

-- ============================================
-- SECURITY POLICIES (RLS)
-- ============================================

-- Enable RLS on new tables
ALTER TABLE organization_pac_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_stamps ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_cancellations ENABLE ROW LEVEL SECURITY;

-- ============================================
-- PAC Credentials Policies
-- ============================================

-- Policy: Users can view their organization's PAC credentials
DROP POLICY IF EXISTS "Users can view org PAC credentials" ON organization_pac_credentials;
CREATE POLICY "Users can view org PAC credentials"
  ON organization_pac_credentials
  FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM users WHERE id = auth.uid()
    )
  );

-- Policy: Users can insert PAC credentials for their organization
DROP POLICY IF EXISTS "Users can insert org PAC credentials" ON organization_pac_credentials;
CREATE POLICY "Users can insert org PAC credentials"
  ON organization_pac_credentials
  FOR INSERT
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM users WHERE id = auth.uid()
    )
  );

-- Policy: Users can update their organization's PAC credentials
DROP POLICY IF EXISTS "Users can update org PAC credentials" ON organization_pac_credentials;
CREATE POLICY "Users can update org PAC credentials"
  ON organization_pac_credentials
  FOR UPDATE
  USING (
    organization_id IN (
      SELECT organization_id FROM users WHERE id = auth.uid()
    )
  );

-- Policy: Users can delete their organization's PAC credentials
DROP POLICY IF EXISTS "Users can delete org PAC credentials" ON organization_pac_credentials;
CREATE POLICY "Users can delete org PAC credentials"
  ON organization_pac_credentials
  FOR DELETE
  USING (
    organization_id IN (
      SELECT organization_id FROM users WHERE id = auth.uid()
    )
  );

-- ============================================
-- Invoice Stamps Policies
-- ============================================

-- Policy: Users can view their organization's invoice stamps
DROP POLICY IF EXISTS "Users can view org invoice stamps" ON invoice_stamps;
CREATE POLICY "Users can view org invoice stamps"
  ON invoice_stamps
  FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM users WHERE id = auth.uid()
    )
  );

-- Policy: System can insert invoice stamps (no user check - done by service)
DROP POLICY IF EXISTS "System can insert invoice stamps" ON invoice_stamps;
CREATE POLICY "System can insert invoice stamps"
  ON invoice_stamps
  FOR INSERT
  WITH CHECK (true);

-- ============================================
-- Invoice Cancellations Policies
-- ============================================

-- Policy: Users can view their organization's cancellations
DROP POLICY IF EXISTS "Users can view org cancellations" ON invoice_cancellations;
CREATE POLICY "Users can view org cancellations"
  ON invoice_cancellations
  FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM users WHERE id = auth.uid()
    )
  );

-- Policy: Users can insert cancellation requests
DROP POLICY IF EXISTS "Users can insert cancellations" ON invoice_cancellations;
CREATE POLICY "Users can insert cancellations"
  ON invoice_cancellations
  FOR INSERT
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM users WHERE id = auth.uid()
    )
  );

-- Policy: System can update cancellation status
DROP POLICY IF EXISTS "System can update cancellations" ON invoice_cancellations;
CREATE POLICY "System can update cancellations"
  ON invoice_cancellations
  FOR UPDATE
  USING (true);

-- ============================================
-- GRANT PERMISSIONS
-- ============================================

GRANT SELECT, INSERT, UPDATE, DELETE ON organization_pac_credentials TO authenticated;
GRANT SELECT, INSERT ON invoice_stamps TO authenticated;
GRANT SELECT, INSERT, UPDATE ON invoice_cancellations TO authenticated;
