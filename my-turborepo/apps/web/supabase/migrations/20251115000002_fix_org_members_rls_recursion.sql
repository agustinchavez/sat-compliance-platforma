-- ============================================
-- Fix infinite recursion in organization_members RLS policies
-- Migration: 20251115000002_fix_org_members_rls_recursion
-- ============================================

-- Drop the recursive policy that causes infinite recursion
DROP POLICY IF EXISTS "Users can view org members" ON organization_members;

-- The "Users can view own memberships" policy is sufficient for basic access
-- Users will be able to see their own memberships via user_id = auth.uid()

-- For viewing other members in the same organization, we'll use a more efficient approach
-- Create a function to check org membership without recursion
CREATE OR REPLACE FUNCTION user_has_org_access(org_id UUID)
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

-- Now create a non-recursive policy using the function
CREATE POLICY "Users can view org members v2"
  ON organization_members
  FOR SELECT
  USING (
    user_id = auth.uid() OR user_has_org_access(organization_id)
  );

COMMENT ON FUNCTION user_has_org_access(UUID) IS 'Checks if current user has access to an organization without causing RLS recursion (SECURITY DEFINER bypasses RLS)';
