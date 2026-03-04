-- ============================================================================
-- SAT COMPLIANCE PLATFORM - Fix View Security and RLS
-- Migration: 20260304000000_fix_view_security_and_rls
-- Description: Fixes SECURITY DEFINER views and enables RLS on SAT code tables
-- ============================================================================

-- ============================================================================
-- ISSUE 1: Fix SECURITY DEFINER Views
-- These views should use SECURITY INVOKER to respect RLS policies
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Fix product_statistics view
-- ----------------------------------------------------------------------------
DROP VIEW IF EXISTS product_statistics;

CREATE VIEW product_statistics
WITH (security_invoker = true)
AS
SELECT
  p.organization_id,
  COUNT(*) as total_products,
  COUNT(CASE WHEN p.type = 'product' THEN 1 END) as product_count,
  COUNT(CASE WHEN p.type = 'service' THEN 1 END) as service_count,
  COUNT(CASE WHEN p.is_active THEN 1 END) as active_count,
  COUNT(CASE WHEN NOT p.is_active THEN 1 END) as inactive_count,
  COUNT(CASE WHEN p.track_inventory THEN 1 END) as inventory_tracked_count,
  COUNT(CASE WHEN p.track_inventory AND p.current_stock <= COALESCE(p.min_stock, 0) THEN 1 END) as low_stock_count,
  AVG(p.price) as average_price,
  MAX(p.price) as max_price,
  MIN(p.price) as min_price
FROM products p
WHERE p.deleted_at IS NULL
GROUP BY p.organization_id;

COMMENT ON VIEW product_statistics IS 'Summary statistics for products by organization. Uses SECURITY INVOKER to respect RLS policies.';

GRANT SELECT ON product_statistics TO authenticated;

-- ----------------------------------------------------------------------------
-- Fix cfdi_download_summary view
-- ----------------------------------------------------------------------------
DROP VIEW IF EXISTS cfdi_download_summary;

CREATE VIEW cfdi_download_summary
WITH (security_invoker = true)
AS
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

COMMENT ON VIEW cfdi_download_summary IS 'Summary statistics for downloaded CFDIs by organization and type. Uses SECURITY INVOKER to respect RLS policies.';

GRANT SELECT ON cfdi_download_summary TO authenticated;

-- ----------------------------------------------------------------------------
-- Fix team_stats_by_org view
-- ----------------------------------------------------------------------------
DROP VIEW IF EXISTS team_stats_by_org;

CREATE VIEW team_stats_by_org
WITH (security_invoker = true)
AS
SELECT
  o.id AS organization_id,
  o.name AS organization_name,
  COUNT(DISTINCT om.user_id) FILTER (WHERE om.deleted_at IS NULL) AS total_active_members,
  COUNT(DISTINCT om.user_id) FILTER (WHERE om.deleted_at IS NOT NULL) AS total_inactive_members,
  COUNT(DISTINCT i.id) FILTER (WHERE i.status = 'pending') AS pending_invitations,
  COUNT(DISTINCT om.user_id) FILTER (WHERE om.role = 'owner' AND om.deleted_at IS NULL) AS owner_count,
  COUNT(DISTINCT om.user_id) FILTER (WHERE om.role = 'admin' AND om.deleted_at IS NULL) AS admin_count,
  COUNT(DISTINCT om.user_id) FILTER (WHERE om.role = 'accountant' AND om.deleted_at IS NULL) AS accountant_count,
  COUNT(DISTINCT om.user_id) FILTER (WHERE om.role = 'user' AND om.deleted_at IS NULL) AS user_count,
  COUNT(DISTINCT om.user_id) FILTER (WHERE om.created_at >= NOW() - INTERVAL '30 days' AND om.deleted_at IS NULL) AS recent_additions,
  COUNT(DISTINCT om.user_id) FILTER (WHERE om.deleted_at >= NOW() - INTERVAL '30 days') AS recent_removals
FROM organizations o
LEFT JOIN organization_members om ON om.organization_id = o.id
LEFT JOIN invitations i ON i.organization_id = o.id AND i.status = 'pending'
WHERE o.deleted_at IS NULL
GROUP BY o.id, o.name;

COMMENT ON VIEW team_stats_by_org IS 'Provides team statistics for each organization. Uses SECURITY INVOKER to respect RLS policies.';

GRANT SELECT ON team_stats_by_org TO authenticated;

-- ----------------------------------------------------------------------------
-- Fix sat_request_statistics view
-- ----------------------------------------------------------------------------
DROP VIEW IF EXISTS sat_request_statistics;

CREATE VIEW sat_request_statistics
WITH (security_invoker = true)
AS
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

COMMENT ON VIEW sat_request_statistics IS 'Statistics for SAT requests by organization, type, and status. Uses SECURITY INVOKER to respect RLS policies.';

GRANT SELECT ON sat_request_statistics TO authenticated;

-- ============================================================================
-- ISSUE 2: Enable RLS on SAT Code Tables
-- These are public lookup tables but still need RLS enabled for Supabase
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Enable RLS on sat_product_codes table
-- ----------------------------------------------------------------------------
ALTER TABLE sat_product_codes ENABLE ROW LEVEL SECURITY;

-- Allow all authenticated users to read SAT product codes (public catalog)
DROP POLICY IF EXISTS "Authenticated users can read SAT product codes" ON sat_product_codes;
CREATE POLICY "Authenticated users can read SAT product codes"
  ON sat_product_codes
  FOR SELECT
  TO authenticated
  USING (true);

-- Allow service role full access (for loading catalog data)
DROP POLICY IF EXISTS "Service role has full access to SAT product codes" ON sat_product_codes;
CREATE POLICY "Service role has full access to SAT product codes"
  ON sat_product_codes
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ----------------------------------------------------------------------------
-- Enable RLS on sat_unit_codes table
-- ----------------------------------------------------------------------------
ALTER TABLE sat_unit_codes ENABLE ROW LEVEL SECURITY;

-- Allow all authenticated users to read SAT unit codes (public catalog)
DROP POLICY IF EXISTS "Authenticated users can read SAT unit codes" ON sat_unit_codes;
CREATE POLICY "Authenticated users can read SAT unit codes"
  ON sat_unit_codes
  FOR SELECT
  TO authenticated
  USING (true);

-- Allow service role full access (for loading catalog data)
DROP POLICY IF EXISTS "Service role has full access to SAT unit codes" ON sat_unit_codes;
CREATE POLICY "Service role has full access to SAT unit codes"
  ON sat_unit_codes
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================================================
-- VERIFICATION
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '================================';
  RAISE NOTICE 'Security fixes applied successfully';
  RAISE NOTICE '';
  RAISE NOTICE 'Views fixed (SECURITY INVOKER):';
  RAISE NOTICE '  - product_statistics';
  RAISE NOTICE '  - cfdi_download_summary';
  RAISE NOTICE '  - team_stats_by_org';
  RAISE NOTICE '  - sat_request_statistics';
  RAISE NOTICE '';
  RAISE NOTICE 'RLS enabled on:';
  RAISE NOTICE '  - sat_product_codes (read-only for authenticated)';
  RAISE NOTICE '  - sat_unit_codes (read-only for authenticated)';
  RAISE NOTICE '================================';
END $$;
