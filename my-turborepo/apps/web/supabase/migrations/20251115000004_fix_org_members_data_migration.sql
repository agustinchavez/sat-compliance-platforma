-- ============================================
-- Fix organization_members data migration
-- Migration: 20251115000004_fix_org_members_data_migration
-- Description: The original migration used wrong user IDs (public.users.id instead of auth_id)
-- ============================================

-- First, clear the incorrectly migrated data
-- Only delete if there are records with invalid user_ids
DELETE FROM organization_members
WHERE user_id NOT IN (SELECT id FROM auth.users);

-- Now migrate with the correct user IDs (auth_id)
INSERT INTO organization_members (user_id, organization_id, role, invited_by, created_at, updated_at, deleted_at)
SELECT
  u.auth_id as user_id,          -- FIXED: Use auth_id instead of id
  u.organization_id,
  u.role,
  u.invited_by,
  u.created_at,
  u.updated_at,
  u.deleted_at
FROM users u
WHERE u.organization_id IS NOT NULL
ON CONFLICT (user_id, organization_id, deleted_at) DO NOTHING;

COMMENT ON TABLE organization_members IS 'Junction table for multi-organization membership. Data migration fixed to use auth_id.';
