-- ============================================
-- SAT COMPLIANCE PLATFORM - Organization Features
-- Migration: 20251113000000_add_organization_features
-- Description: Adds missing organization columns, indexes, and audit log
-- ============================================

-- Add missing organization columns
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS subscription_id VARCHAR(255),
  ADD COLUMN IF NOT EXISTS current_period_end TIMESTAMP;

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_organizations_rfc
  ON organizations(rfc)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_organizations_stripe
  ON organizations(stripe_customer_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_organizations_deleted
  ON organizations(deleted_at)
  WHERE deleted_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_organizations_plan
  ON organizations(plan)
  WHERE deleted_at IS NULL;

-- Add check constraints (using DO blocks for IF NOT EXISTS support)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'check_rfc_length'
  ) THEN
    ALTER TABLE organizations
      ADD CONSTRAINT check_rfc_length
      CHECK (char_length(rfc) BETWEEN 12 AND 13);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'check_plan_values'
  ) THEN
    ALTER TABLE organizations
      ADD CONSTRAINT check_plan_values
      CHECK (plan IN ('free', 'basic', 'professional', 'enterprise'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'check_subscription_status_values'
  ) THEN
    ALTER TABLE organizations
      ADD CONSTRAINT check_subscription_status_values
      CHECK (subscription_status IS NULL OR subscription_status IN (
        'active', 'trialing', 'past_due', 'canceled', 'unpaid', 'incomplete'
      ));
  END IF;
END $$;

-- ============================================
-- ORGANIZATION AUDIT LOG
-- ============================================

CREATE TABLE IF NOT EXISTS organization_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  action VARCHAR(50) NOT NULL,
  entity_type VARCHAR(50) NOT NULL,
  entity_id UUID,
  changes JSONB,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for audit log
CREATE INDEX IF NOT EXISTS idx_org_audit_log_org
  ON organization_audit_log(organization_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_org_audit_log_user
  ON organization_audit_log(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_org_audit_log_action
  ON organization_audit_log(action, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_org_audit_log_entity
  ON organization_audit_log(entity_type, entity_id);

-- Add comment to explain the table
COMMENT ON TABLE organization_audit_log IS 'Audit trail for all organization-related changes including profile updates, certificate uploads, and PAC configuration';

-- ============================================
-- HELPER FUNCTIONS
-- ============================================

-- Function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add trigger to automatically update updated_at on organizations table
DROP TRIGGER IF EXISTS update_organizations_updated_at ON organizations;
CREATE TRIGGER update_organizations_updated_at
  BEFORE UPDATE ON organizations
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- CERTIFICATE EXPIRY ALERTS VIEW
-- ============================================

-- View to easily identify organizations with expiring certificates
CREATE OR REPLACE VIEW organization_certificate_status AS
SELECT
  o.id,
  o.name,
  o.rfc,
  o.cfdi_cert IS NOT NULL AS has_certificate,
  o.cfdi_key IS NOT NULL AS has_private_key,
  o.pac_provider,
  o.pac_credentials IS NOT NULL AS has_pac_config,
  o.plan,
  o.subscription_status,
  o.created_at,
  o.updated_at,
  o.deleted_at IS NULL AS is_active
FROM organizations o;

COMMENT ON VIEW organization_certificate_status IS 'Provides quick overview of organization certificate and PAC configuration status';

-- ============================================
-- ORGANIZATION SETUP COMPLETENESS VIEW
-- ============================================

-- View to check organization setup completion
CREATE OR REPLACE VIEW organization_setup_status AS
SELECT
  o.id,
  o.name,
  o.rfc,
  -- Basic info check
  (o.name IS NOT NULL AND o.rfc IS NOT NULL AND o.legal_name IS NOT NULL) AS has_basic_info,
  -- Address check
  (o.address IS NOT NULL
   AND o.address->>'street' IS NOT NULL
   AND o.address->>'exterior_number' IS NOT NULL
   AND o.address->>'colony' IS NOT NULL
   AND o.address->>'city' IS NOT NULL
   AND o.address->>'state' IS NOT NULL
   AND o.address->>'postal_code' IS NOT NULL
  ) AS has_complete_address,
  -- Certificate check
  (o.cfdi_cert IS NOT NULL AND o.cfdi_key IS NOT NULL) AS has_certificates,
  -- PAC check
  (o.pac_provider IS NOT NULL AND o.pac_credentials IS NOT NULL) AS has_pac_config,
  -- Overall readiness
  (
    o.name IS NOT NULL
    AND o.rfc IS NOT NULL
    AND o.legal_name IS NOT NULL
    AND o.address IS NOT NULL
    AND o.address->>'street' IS NOT NULL
    AND o.cfdi_cert IS NOT NULL
    AND o.cfdi_key IS NOT NULL
    AND o.pac_provider IS NOT NULL
    AND o.pac_credentials IS NOT NULL
  ) AS ready_for_invoicing,
  o.created_at,
  o.deleted_at IS NULL AS is_active
FROM organizations o;

COMMENT ON VIEW organization_setup_status IS 'Shows setup completion status for each organization';

-- ============================================
-- SECURITY POLICIES (RLS)
-- ============================================

-- Enable RLS on organization_audit_log
ALTER TABLE organization_audit_log ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view audit logs for their own organization
DROP POLICY IF EXISTS "Users can view their organization audit logs" ON organization_audit_log;
CREATE POLICY "Users can view their organization audit logs"
  ON organization_audit_log
  FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM users WHERE id = auth.uid()
    )
  );

-- Policy: System can insert audit logs
DROP POLICY IF EXISTS "System can insert audit logs" ON organization_audit_log;
CREATE POLICY "System can insert audit logs"
  ON organization_audit_log
  FOR INSERT
  WITH CHECK (true);

-- Grant permissions
GRANT SELECT ON organization_certificate_status TO authenticated;
GRANT SELECT ON organization_setup_status TO authenticated;
GRANT SELECT ON organization_audit_log TO authenticated;
GRANT INSERT ON organization_audit_log TO authenticated;
