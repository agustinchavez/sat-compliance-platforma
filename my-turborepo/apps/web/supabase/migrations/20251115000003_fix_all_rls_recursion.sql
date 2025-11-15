-- ============================================
-- Fix ALL infinite recursion in organization_members RLS policies
-- Migration: 20251115000003_fix_all_rls_recursion
-- ============================================

-- Drop ALL existing policies on organization_members to start fresh
DROP POLICY IF EXISTS "Users can view own memberships" ON organization_members;
DROP POLICY IF EXISTS "Users can view org members" ON organization_members;
DROP POLICY IF EXISTS "Users can view org members v2" ON organization_members;
DROP POLICY IF EXISTS "Owners and admins can manage members" ON organization_members;

-- Create a SECURITY DEFINER function to check if user is member of an org
-- This bypasses RLS, preventing infinite recursion
CREATE OR REPLACE FUNCTION auth_user_is_org_member(org_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM organization_members
    WHERE user_id = auth.uid()
      AND organization_id = org_id
      AND deleted_at IS NULL
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Create a SECURITY DEFINER function to check if user is owner/admin of an org
-- This bypasses RLS, preventing infinite recursion
CREATE OR REPLACE FUNCTION auth_user_is_org_admin(org_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM organization_members
    WHERE user_id = auth.uid()
      AND organization_id = org_id
      AND role IN ('owner', 'admin')
      AND deleted_at IS NULL
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Policy 1: Users can view their own memberships (no recursion)
CREATE POLICY "Users can view own memberships"
  ON organization_members
  FOR SELECT
  USING (user_id = auth.uid());

-- Policy 2: Users can view members in their organizations (using SECURITY DEFINER function)
CREATE POLICY "Users can view org members"
  ON organization_members
  FOR SELECT
  USING (auth_user_is_org_member(organization_id));

-- Policy 3: Owners and admins can manage members (using SECURITY DEFINER function)
CREATE POLICY "Owners and admins can manage members"
  ON organization_members
  FOR ALL
  USING (auth_user_is_org_admin(organization_id));

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION auth_user_is_org_member(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION auth_user_is_org_admin(UUID) TO authenticated;

COMMENT ON FUNCTION auth_user_is_org_member(UUID) IS 'Checks if current user is member of organization (SECURITY DEFINER bypasses RLS to prevent recursion)';
COMMENT ON FUNCTION auth_user_is_org_admin(UUID) IS 'Checks if current user is owner/admin of organization (SECURITY DEFINER bypasses RLS to prevent recursion)';
