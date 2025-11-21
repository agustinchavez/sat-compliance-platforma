-- ============================================================================
-- SAT Integration Tables
-- ============================================================================
-- This migration creates tables for SAT SOAP integration:
-- 1. sat_requests: Track all SAT API requests (auth, downloads, etc.)
-- 2. downloaded_cfdis: Store downloaded CFDI documents and metadata
--
-- Author: Claude Code
-- Date: 2025-11-21
-- ============================================================================

-- ============================================================================
-- Table: sat_requests
-- Purpose: Track all SAT web service requests for auditing and debugging
-- ============================================================================

CREATE TABLE IF NOT EXISTS sat_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- Request metadata
  request_type VARCHAR(50) NOT NULL CHECK (
    request_type IN (
      'authentication',
      'cfdi_download',
      'cfdi_verification',
      'cfdi_package_download'
    )
  ),
  request_data JSONB NOT NULL DEFAULT '{}',

  -- Response metadata
  response_data JSONB,
  status VARCHAR(50) NOT NULL CHECK (
    status IN ('pending', 'processing', 'completed', 'failed')
  ) DEFAULT 'pending',

  -- SAT identifiers
  sat_request_id VARCHAR(255),  -- SAT's internal request ID for download operations
  sat_status_code INTEGER,      -- SAT status code (5000, 300, etc.)

  -- Error handling
  error_message TEXT,
  retry_count INTEGER DEFAULT 0,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,

  -- Soft delete
  deleted_at TIMESTAMPTZ
);

-- Indexes for sat_requests
CREATE INDEX idx_sat_requests_org ON sat_requests(organization_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_sat_requests_status ON sat_requests(status, created_at) WHERE deleted_at IS NULL;
CREATE INDEX idx_sat_requests_type ON sat_requests(request_type, organization_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_sat_requests_sat_id ON sat_requests(sat_request_id) WHERE sat_request_id IS NOT NULL;
CREATE INDEX idx_sat_requests_created ON sat_requests(created_at DESC) WHERE deleted_at IS NULL;

-- Comments for sat_requests
COMMENT ON TABLE sat_requests IS 'Tracks all SAT web service API requests for auditing and debugging';
COMMENT ON COLUMN sat_requests.request_type IS 'Type of SAT operation: authentication, cfdi_download, cfdi_verification, cfdi_package_download';
COMMENT ON COLUMN sat_requests.sat_request_id IS 'SAT internal request ID returned for download operations';
COMMENT ON COLUMN sat_requests.sat_status_code IS 'SAT status code from response (5000=success, 300-305=auth errors, etc.)';
COMMENT ON COLUMN sat_requests.retry_count IS 'Number of retry attempts for this request';

-- ============================================================================
-- Table: downloaded_cfdis
-- Purpose: Store downloaded CFDI documents with parsed metadata
-- ============================================================================

CREATE TABLE IF NOT EXISTS downloaded_cfdis (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- CFDI identifiers
  uuid VARCHAR(36) NOT NULL,  -- CFDI UUID from TimbreFiscal
  type VARCHAR(20) NOT NULL CHECK (type IN ('issued', 'received')),

  -- CFDI data
  xml_content TEXT NOT NULL,
  parsed_data JSONB NOT NULL DEFAULT '{}',

  -- Storage
  storage_path TEXT,  -- Path in Cloudflare R2
  file_size INTEGER,  -- Size in bytes

  -- SAT download tracking
  sat_request_id UUID REFERENCES sat_requests(id) ON DELETE SET NULL,
  package_id VARCHAR(255),  -- SAT package ID

  -- Reconciliation
  reconciled BOOLEAN DEFAULT FALSE,
  invoice_id UUID,  -- Reference to internal invoice if matched
  reconciled_at TIMESTAMPTZ,
  reconciliation_notes TEXT,

  -- Metadata
  emisor_rfc VARCHAR(13),
  receptor_rfc VARCHAR(13),
  fecha_emision TIMESTAMPTZ,
  fecha_timbrado TIMESTAMPTZ,
  monto_total DECIMAL(15, 2),
  moneda VARCHAR(3),
  tipo_comprobante VARCHAR(1),

  -- Timestamps
  downloaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Soft delete
  deleted_at TIMESTAMPTZ,

  -- Constraints
  CONSTRAINT unique_cfdi_uuid_org UNIQUE (uuid, organization_id, deleted_at)
);

-- Indexes for downloaded_cfdis
CREATE INDEX idx_downloaded_cfdis_org ON downloaded_cfdis(organization_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_downloaded_cfdis_uuid ON downloaded_cfdis(uuid) WHERE deleted_at IS NULL;
CREATE INDEX idx_downloaded_cfdis_type ON downloaded_cfdis(type, organization_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_downloaded_cfdis_reconciled ON downloaded_cfdis(reconciled, organization_id) WHERE deleted_at IS NULL AND NOT reconciled;
CREATE INDEX idx_downloaded_cfdis_emisor ON downloaded_cfdis(emisor_rfc) WHERE deleted_at IS NULL;
CREATE INDEX idx_downloaded_cfdis_receptor ON downloaded_cfdis(receptor_rfc) WHERE deleted_at IS NULL;
CREATE INDEX idx_downloaded_cfdis_fecha ON downloaded_cfdis(fecha_emision DESC) WHERE deleted_at IS NULL;
CREATE INDEX idx_downloaded_cfdis_sat_request ON downloaded_cfdis(sat_request_id) WHERE sat_request_id IS NOT NULL;
CREATE INDEX idx_downloaded_cfdis_invoice ON downloaded_cfdis(invoice_id) WHERE invoice_id IS NOT NULL;

-- Comments for downloaded_cfdis
COMMENT ON TABLE downloaded_cfdis IS 'Stores downloaded CFDI documents from SAT with parsed metadata';
COMMENT ON COLUMN downloaded_cfdis.uuid IS 'CFDI UUID from TimbreFiscalDigital element';
COMMENT ON COLUMN downloaded_cfdis.type IS 'Whether CFDI was issued by or received by the organization';
COMMENT ON COLUMN downloaded_cfdis.xml_content IS 'Full CFDI XML content';
COMMENT ON COLUMN downloaded_cfdis.parsed_data IS 'Parsed CFDI data in JSON format for easy querying';
COMMENT ON COLUMN downloaded_cfdis.storage_path IS 'Path to XML file in Cloudflare R2 storage';
COMMENT ON COLUMN downloaded_cfdis.reconciled IS 'Whether CFDI has been matched to an internal invoice';
COMMENT ON COLUMN downloaded_cfdis.invoice_id IS 'Reference to matched internal invoice';

-- ============================================================================
-- Updated At Trigger
-- ============================================================================

CREATE OR REPLACE FUNCTION update_downloaded_cfdis_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_downloaded_cfdis_updated_at
  BEFORE UPDATE ON downloaded_cfdis
  FOR EACH ROW
  EXECUTE FUNCTION update_downloaded_cfdis_updated_at();

-- ============================================================================
-- Row Level Security (RLS)
-- ============================================================================

-- Enable RLS
ALTER TABLE sat_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE downloaded_cfdis ENABLE ROW LEVEL SECURITY;

-- Policies for sat_requests
-- Users can view SAT requests for their organizations
CREATE POLICY "Users can view sat_requests for their organizations"
  ON sat_requests
  FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id
      FROM organization_members
      WHERE user_id = auth.uid()
      AND deleted_at IS NULL
    )
    AND deleted_at IS NULL
  );

-- Users can insert sat_requests for their organizations
CREATE POLICY "Users can insert sat_requests for their organizations"
  ON sat_requests
  FOR INSERT
  WITH CHECK (
    organization_id IN (
      SELECT organization_id
      FROM organization_members
      WHERE user_id = auth.uid()
      AND deleted_at IS NULL
    )
  );

-- Service role can do anything
CREATE POLICY "Service role can manage sat_requests"
  ON sat_requests
  FOR ALL
  USING (auth.jwt()->>'role' = 'service_role');

-- Policies for downloaded_cfdis
-- Users can view CFDIs for their organizations
CREATE POLICY "Users can view downloaded_cfdis for their organizations"
  ON downloaded_cfdis
  FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id
      FROM organization_members
      WHERE user_id = auth.uid()
      AND deleted_at IS NULL
    )
    AND deleted_at IS NULL
  );

-- Users can insert CFDIs for their organizations
CREATE POLICY "Users can insert downloaded_cfdis for their organizations"
  ON downloaded_cfdis
  FOR INSERT
  WITH CHECK (
    organization_id IN (
      SELECT organization_id
      FROM organization_members
      WHERE user_id = auth.uid()
      AND deleted_at IS NULL
    )
  );

-- Users can update CFDIs for their organizations (for reconciliation)
CREATE POLICY "Users can update downloaded_cfdis for their organizations"
  ON downloaded_cfdis
  FOR UPDATE
  USING (
    organization_id IN (
      SELECT organization_id
      FROM organization_members
      WHERE user_id = auth.uid()
      AND deleted_at IS NULL
    )
    AND deleted_at IS NULL
  );

-- Service role can do anything
CREATE POLICY "Service role can manage downloaded_cfdis"
  ON downloaded_cfdis
  FOR ALL
  USING (auth.jwt()->>'role' = 'service_role');

-- ============================================================================
-- Statistics View
-- ============================================================================

CREATE OR REPLACE VIEW sat_request_statistics AS
SELECT
  organization_id,
  request_type,
  status,
  COUNT(*) as request_count,
  COUNT(CASE WHEN status = 'completed' THEN 1 END) as successful_count,
  COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed_count,
  AVG(EXTRACT(EPOCH FROM (completed_at - created_at))) as avg_duration_seconds,
  MAX(created_at) as last_request_at
FROM sat_requests
WHERE deleted_at IS NULL
GROUP BY organization_id, request_type, status;

COMMENT ON VIEW sat_request_statistics IS 'Statistics for SAT requests by organization, type, and status';

-- Grant access to authenticated users
GRANT SELECT ON sat_request_statistics TO authenticated;

-- ============================================================================
-- CFDI Summary View
-- ============================================================================

CREATE OR REPLACE VIEW cfdi_download_summary AS
SELECT
  organization_id,
  type,
  COUNT(*) as total_cfdis,
  COUNT(CASE WHEN reconciled THEN 1 END) as reconciled_count,
  COUNT(CASE WHEN NOT reconciled THEN 1 END) as unreconciled_count,
  SUM(monto_total) as total_amount,
  MIN(fecha_emision) as earliest_cfdi,
  MAX(fecha_emision) as latest_cfdi,
  COUNT(DISTINCT emisor_rfc) as unique_emisores,
  COUNT(DISTINCT receptor_rfc) as unique_receptores
FROM downloaded_cfdis
WHERE deleted_at IS NULL
GROUP BY organization_id, type;

COMMENT ON VIEW cfdi_download_summary IS 'Summary statistics for downloaded CFDIs by organization and type';

-- Grant access to authenticated users
GRANT SELECT ON cfdi_download_summary TO authenticated;

-- ============================================================================
-- Success Message
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '✅ SAT integration tables created successfully';
  RAISE NOTICE '   - sat_requests table with RLS policies';
  RAISE NOTICE '   - downloaded_cfdis table with RLS policies';
  RAISE NOTICE '   - Statistics views created';
  RAISE NOTICE '   - Ready for SAT SOAP integration';
END $$;
