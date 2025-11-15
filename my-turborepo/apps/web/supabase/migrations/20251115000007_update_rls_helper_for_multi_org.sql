-- ============================================
-- Update RLS helper function for multi-org support
-- Migration: 20251115000007_update_rls_helper_for_multi_org
-- Description: Updates get_user_organization_id() to use organization_members instead of deprecated users.organization_id
-- ============================================

-- Update helper function to get current user's organization_id from organization_members
CREATE OR REPLACE FUNCTION public.get_user_organization_id()
RETURNS UUID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  -- Get the user's first active organization from organization_members table
  SELECT organization_id
  FROM organization_members
  WHERE user_id = auth.uid()
    AND deleted_at IS NULL
  ORDER BY created_at ASC
  LIMIT 1;
$$;

COMMENT ON FUNCTION public.get_user_organization_id() IS 'Returns the current user''s organization ID from organization_members table (updated for multi-org support). Returns the first organization if user has multiple.';

-- Note: In the future, for true multi-org support, this function could be enhanced to:
-- 1. Accept an organization_id parameter to switch contexts
-- 2. Store the "current" organization in user session/metadata
-- 3. Use a separate current_organization_context table
-- For now, it returns the user's first organization (oldest membership)
