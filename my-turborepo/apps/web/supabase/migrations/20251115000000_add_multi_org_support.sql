-- ============================================
-- SAT COMPLIANCE PLATFORM - Multi-Organization Support
-- Migration: 20251115000000_add_multi_org_support
-- Description: Refactors user-org relationship to support multi-org membership
-- ============================================

-- ============================================
-- CREATE ORGANIZATION_MEMBERS JUNCTION TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS organization_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  role VARCHAR(50) NOT NULL CHECK (role IN ('owner', 'admin', 'accountant', 'user')),
  invited_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  deleted_at TIMESTAMP,

  -- Constraints
  CONSTRAINT unique_active_membership UNIQUE NULLS NOT DISTINCT (user_id, organization_id, deleted_at),
  CONSTRAINT valid_role CHECK (role IN ('owner', 'admin', 'accountant', 'user'))
);

-- Performance indexes
CREATE INDEX idx_org_members_user ON organization_members(user_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_org_members_org ON organization_members(organization_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_org_members_role ON organization_members(organization_id, role) WHERE deleted_at IS NULL;
CREATE INDEX idx_org_members_invited_by ON organization_members(invited_by);
CREATE INDEX idx_org_members_deleted ON organization_members(deleted_at);

COMMENT ON TABLE organization_members IS 'Junction table for multi-organization membership. Users can belong to multiple organizations with different roles in each.';

-- ============================================
-- MIGRATE EXISTING DATA
-- ============================================

-- Migrate existing user-org relationships to junction table
INSERT INTO organization_members (user_id, organization_id, role, invited_by, created_at, updated_at, deleted_at)
SELECT
  id as user_id,
  organization_id,
  role,
  invited_by,
  created_at,
  updated_at,
  deleted_at
FROM users
WHERE organization_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- ============================================
-- LAST OWNER PROTECTION TRIGGER
-- ============================================

-- Function to prevent removing the last owner of an organization
CREATE OR REPLACE FUNCTION check_last_owner_removal()
RETURNS TRIGGER AS $$
DECLARE
  owner_count INTEGER;
BEGIN
  -- Only check when marking owner as deleted
  IF OLD.role = 'owner' AND NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL THEN
    -- Count remaining active owners
    SELECT COUNT(*) INTO owner_count
    FROM organization_members
    WHERE organization_id = OLD.organization_id
      AND role = 'owner'
      AND deleted_at IS NULL
      AND id != OLD.id;

    -- Prevent deletion if this is the last owner
    IF owner_count = 0 THEN
      RAISE EXCEPTION 'Cannot remove the last owner of organization %', OLD.organization_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS prevent_last_owner_removal ON organization_members;
CREATE TRIGGER prevent_last_owner_removal
  BEFORE UPDATE ON organization_members
  FOR EACH ROW
  EXECUTE FUNCTION check_last_owner_removal();

COMMENT ON FUNCTION check_last_owner_removal() IS 'Prevents removing the last owner from an organization';

-- ============================================
-- AUTO-UPDATE TIMESTAMP TRIGGER
-- ============================================

DROP TRIGGER IF EXISTS trigger_org_members_updated_at ON organization_members;
CREATE TRIGGER trigger_org_members_updated_at
  BEFORE UPDATE ON organization_members
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- UPDATE TEAM STATISTICS VIEW
-- ============================================

-- Drop old view
DROP VIEW IF EXISTS team_stats_by_org;

-- Create new view using organization_members
CREATE OR REPLACE VIEW team_stats_by_org AS
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

COMMENT ON VIEW team_stats_by_org IS 'Provides team statistics for each organization including member counts by role and invitation status (updated for multi-org)';

-- ============================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================

-- Enable RLS on organization_members
ALTER TABLE organization_members ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view their own memberships
DROP POLICY IF EXISTS "Users can view own memberships" ON organization_members;
CREATE POLICY "Users can view own memberships"
  ON organization_members
  FOR SELECT
  USING (user_id = auth.uid());

-- Policy: Users can view members of their organizations
DROP POLICY IF EXISTS "Users can view org members" ON organization_members;
CREATE POLICY "Users can view org members"
  ON organization_members
  FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id
      FROM organization_members
      WHERE user_id = auth.uid()
      AND deleted_at IS NULL
    )
  );

-- Policy: Owners and admins can manage members
DROP POLICY IF EXISTS "Owners and admins can manage members" ON organization_members;
CREATE POLICY "Owners and admins can manage members"
  ON organization_members
  FOR ALL
  USING (
    organization_id IN (
      SELECT organization_id
      FROM organization_members
      WHERE user_id = auth.uid()
      AND role IN ('owner', 'admin')
      AND deleted_at IS NULL
    )
  );

-- ============================================
-- UPDATE INVITATIONS RLS POLICIES
-- ============================================

-- Update existing policies to use organization_members
DROP POLICY IF EXISTS "Users can view org invitations" ON invitations;
CREATE POLICY "Users can view org invitations"
  ON invitations
  FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id
      FROM organization_members
      WHERE user_id = auth.uid()
      AND deleted_at IS NULL
    )
  );

DROP POLICY IF EXISTS "Owners and admins can manage invitations" ON invitations;
CREATE POLICY "Owners and admins can manage invitations"
  ON invitations
  FOR ALL
  USING (
    organization_id IN (
      SELECT organization_id
      FROM organization_members
      WHERE user_id = auth.uid()
      AND role IN ('owner', 'admin')
      AND deleted_at IS NULL
    )
  );

-- ============================================
-- UPDATE OWNERSHIP TRANSFERS RLS POLICIES
-- ============================================

DROP POLICY IF EXISTS "Users can view relevant transfers" ON ownership_transfers;
CREATE POLICY "Users can view relevant transfers"
  ON ownership_transfers
  FOR SELECT
  USING (
    from_user_id = auth.uid()
    OR to_user_id = auth.uid()
    OR organization_id IN (
      SELECT organization_id
      FROM organization_members
      WHERE user_id = auth.uid()
      AND role IN ('owner', 'admin')
      AND deleted_at IS NULL
    )
  );

DROP POLICY IF EXISTS "Owners can initiate transfers" ON ownership_transfers;
CREATE POLICY "Owners can initiate transfers"
  ON ownership_transfers
  FOR INSERT
  WITH CHECK (
    from_user_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM organization_members
      WHERE user_id = auth.uid()
      AND organization_id = ownership_transfers.organization_id
      AND role = 'owner'
      AND deleted_at IS NULL
    )
  );

-- ============================================
-- HELPER FUNCTIONS
-- ============================================

-- Function to get user's role in an organization
CREATE OR REPLACE FUNCTION get_user_org_role(p_user_id UUID, p_org_id UUID)
RETURNS VARCHAR AS $$
DECLARE
  user_role VARCHAR;
BEGIN
  SELECT role INTO user_role
  FROM organization_members
  WHERE user_id = p_user_id
    AND organization_id = p_org_id
    AND deleted_at IS NULL;

  RETURN user_role;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION get_user_org_role(UUID, UUID) IS 'Returns user role in specified organization, or NULL if not a member';

-- Function to check if user is member of organization
CREATE OR REPLACE FUNCTION is_org_member(p_user_id UUID, p_org_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM organization_members
    WHERE user_id = p_user_id
      AND organization_id = p_org_id
      AND deleted_at IS NULL
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION is_org_member(UUID, UUID) IS 'Checks if user is an active member of the organization';

-- ============================================
-- GRANT PERMISSIONS
-- ============================================

GRANT SELECT, INSERT, UPDATE ON organization_members TO authenticated;
GRANT EXECUTE ON FUNCTION get_user_org_role(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION is_org_member(UUID, UUID) TO authenticated;

-- ============================================
-- DEPRECATION NOTICE FOR users.organization_id
-- ============================================

-- Add comment to warn developers
COMMENT ON COLUMN users.organization_id IS 'DEPRECATED: Use organization_members table for multi-org support. This column is kept for backward compatibility but should not be used in new code.';

-- Note: We're NOT dropping users.organization_id yet to maintain backward compatibility
-- It can be dropped in a future migration after confirming all code uses organization_members
