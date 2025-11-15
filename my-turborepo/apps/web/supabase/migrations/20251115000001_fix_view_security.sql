-- ============================================
-- SAT COMPLIANCE PLATFORM - Fix View Security
-- Migration: 20251115000001_fix_view_security
-- Description: Removes SECURITY DEFINER from views to respect RLS policies
-- ============================================

-- ============================================
-- FIX ORGANIZATION CERTIFICATE STATUS VIEW
-- ============================================

-- Recreate view with SECURITY INVOKER to respect RLS
DROP VIEW IF EXISTS organization_certificate_status;

CREATE VIEW organization_certificate_status
WITH (security_invoker = true)
AS
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

COMMENT ON VIEW organization_certificate_status IS 'Provides quick overview of organization certificate and PAC configuration status. Uses SECURITY INVOKER to respect RLS policies.';

-- ============================================
-- FIX ORGANIZATION SETUP STATUS VIEW
-- ============================================

-- Recreate view with SECURITY INVOKER to respect RLS
DROP VIEW IF EXISTS organization_setup_status;

CREATE VIEW organization_setup_status
WITH (security_invoker = true)
AS
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

COMMENT ON VIEW organization_setup_status IS 'Shows setup completion status for each organization. Uses SECURITY INVOKER to respect RLS policies.';

-- ============================================
-- GRANT PERMISSIONS
-- ============================================

GRANT SELECT ON organization_certificate_status TO authenticated;
GRANT SELECT ON organization_setup_status TO authenticated;

-- ============================================
-- VERIFICATION
-- ============================================

-- These views will now respect RLS policies on the organizations table
-- Users will only see data for organizations they have access to
