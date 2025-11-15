-- ============================================
-- SAT COMPLIANCE PLATFORM - Team Management
-- Migration: 20251114000000_add_team_management
-- Description: Adds invitations and ownership transfer tables
-- ============================================

-- ============================================
-- INVITATIONS TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  email VARCHAR(255) NOT NULL,
  role VARCHAR(50) NOT NULL,
  token VARCHAR(255) UNIQUE NOT NULL,
  status VARCHAR(50) DEFAULT 'pending',
  message TEXT,
  invited_by UUID REFERENCES users(id) ON DELETE SET NULL,
  expires_at TIMESTAMP NOT NULL,
  accepted_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Unique constraint: Only one pending invitation per email per organization
CREATE UNIQUE INDEX idx_invitations_unique_pending
  ON invitations(organization_id, email, status)
  WHERE status = 'pending';

-- Performance indexes
CREATE INDEX idx_invitations_token
  ON invitations(token)
  WHERE status = 'pending';

CREATE INDEX idx_invitations_org
  ON invitations(organization_id);

CREATE INDEX idx_invitations_email
  ON invitations(email)
  WHERE status = 'pending';

CREATE INDEX idx_invitations_expires
  ON invitations(expires_at)
  WHERE status = 'pending';

CREATE INDEX idx_invitations_invited_by
  ON invitations(invited_by);

-- Add comment
COMMENT ON TABLE invitations IS 'Stores user invitations to join organizations with role assignments';

-- ============================================
-- OWNERSHIP TRANSFERS TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS ownership_transfers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  from_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  to_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status VARCHAR(50) DEFAULT 'pending',
  confirmation_token VARCHAR(255) UNIQUE NOT NULL,
  reason TEXT,
  initiated_at TIMESTAMP DEFAULT NOW(),
  confirmed_at TIMESTAMP,
  expires_at TIMESTAMP NOT NULL,
  cancelled_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),

  -- Constraints
  CONSTRAINT check_different_users CHECK (from_user_id != to_user_id),
  CONSTRAINT check_valid_status CHECK (status IN ('pending', 'confirmed', 'expired', 'cancelled'))
);

-- Indexes for ownership transfers
CREATE INDEX idx_ownership_transfers_org
  ON ownership_transfers(organization_id);

CREATE INDEX idx_ownership_transfers_token
  ON ownership_transfers(confirmation_token)
  WHERE status = 'pending';

CREATE INDEX idx_ownership_transfers_status
  ON ownership_transfers(status, expires_at)
  WHERE status = 'pending';

-- Add comment
COMMENT ON TABLE ownership_transfers IS 'Tracks ownership transfer requests with confirmation workflow';

-- ============================================
-- UPDATE USERS TABLE
-- ============================================

-- Add invited_by column to track who invited the user
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'invited_by'
  ) THEN
    ALTER TABLE users ADD COLUMN invited_by UUID REFERENCES users(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Add index for invited_by
CREATE INDEX IF NOT EXISTS idx_users_invited_by
  ON users(invited_by);

-- ============================================
-- HELPER FUNCTIONS
-- ============================================

-- Function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_invitations_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for invitations table
DROP TRIGGER IF EXISTS trigger_invitations_updated_at ON invitations;
CREATE TRIGGER trigger_invitations_updated_at
  BEFORE UPDATE ON invitations
  FOR EACH ROW
  EXECUTE FUNCTION update_invitations_updated_at();

-- Trigger for ownership_transfers table
DROP TRIGGER IF EXISTS trigger_ownership_transfers_updated_at ON ownership_transfers;
CREATE TRIGGER trigger_ownership_transfers_updated_at
  BEFORE UPDATE ON ownership_transfers
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- CLEANUP EXPIRED INVITATIONS FUNCTION
-- ============================================

CREATE OR REPLACE FUNCTION cleanup_expired_invitations()
RETURNS INTEGER AS $$
DECLARE
  updated_count INTEGER;
BEGIN
  UPDATE invitations
  SET status = 'expired',
      updated_at = NOW()
  WHERE status = 'pending'
    AND expires_at < NOW();

  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RETURN updated_count;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION cleanup_expired_invitations() IS 'Marks expired pending invitations as expired. Returns count of updated rows.';

-- ============================================================================
-- CLEANUP EXPIRED OWNERSHIP TRANSFERS FUNCTION
-- ============================================================================

CREATE OR REPLACE FUNCTION cleanup_expired_transfers()
RETURNS INTEGER AS $$
DECLARE
  updated_count INTEGER;
BEGIN
  UPDATE ownership_transfers
  SET status = 'expired',
      updated_at = NOW()
  WHERE status = 'pending'
    AND expires_at < NOW();

  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RETURN updated_count;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION cleanup_expired_transfers() IS 'Marks expired pending ownership transfers as expired. Returns count of updated rows.';

-- ============================================
-- TEAM STATISTICS VIEW
-- ============================================

CREATE OR REPLACE VIEW team_stats_by_org AS
SELECT
  o.id AS organization_id,
  o.name AS organization_name,
  COUNT(DISTINCT u.id) FILTER (WHERE u.deleted_at IS NULL) AS total_active_members,
  COUNT(DISTINCT u.id) FILTER (WHERE u.deleted_at IS NOT NULL) AS total_inactive_members,
  COUNT(DISTINCT i.id) FILTER (WHERE i.status = 'pending') AS pending_invitations,
  COUNT(DISTINCT u.id) FILTER (WHERE u.role = 'owner' AND u.deleted_at IS NULL) AS owner_count,
  COUNT(DISTINCT u.id) FILTER (WHERE u.role = 'admin' AND u.deleted_at IS NULL) AS admin_count,
  COUNT(DISTINCT u.id) FILTER (WHERE u.role = 'accountant' AND u.deleted_at IS NULL) AS accountant_count,
  COUNT(DISTINCT u.id) FILTER (WHERE u.role = 'user' AND u.deleted_at IS NULL) AS user_count,
  COUNT(DISTINCT u.id) FILTER (WHERE u.created_at >= NOW() - INTERVAL '30 days' AND u.deleted_at IS NULL) AS recent_additions,
  COUNT(DISTINCT u.id) FILTER (WHERE u.deleted_at >= NOW() - INTERVAL '30 days') AS recent_removals
FROM organizations o
LEFT JOIN users u ON u.organization_id = o.id
LEFT JOIN invitations i ON i.organization_id = o.id AND i.status = 'pending'
WHERE o.deleted_at IS NULL
GROUP BY o.id, o.name;

COMMENT ON VIEW team_stats_by_org IS 'Provides team statistics for each organization including member counts by role and invitation status';

-- ============================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================

-- Enable RLS on invitations table
ALTER TABLE invitations ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view invitations for their organization
DROP POLICY IF EXISTS "Users can view org invitations" ON invitations;
CREATE POLICY "Users can view org invitations"
  ON invitations
  FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM users WHERE id = auth.uid()
    )
  );

-- Policy: Owners and admins can manage invitations
DROP POLICY IF EXISTS "Owners and admins can manage invitations" ON invitations;
CREATE POLICY "Owners and admins can manage invitations"
  ON invitations
  FOR ALL
  USING (
    organization_id IN (
      SELECT organization_id FROM users
      WHERE id = auth.uid()
      AND role IN ('owner', 'admin')
      AND deleted_at IS NULL
    )
  );

-- Enable RLS on ownership_transfers table
ALTER TABLE ownership_transfers ENABLE ROW LEVEL SECURITY;

-- Policy: Owners and involved users can view transfers
DROP POLICY IF EXISTS "Users can view relevant transfers" ON ownership_transfers;
CREATE POLICY "Users can view relevant transfers"
  ON ownership_transfers
  FOR SELECT
  USING (
    from_user_id = auth.uid()
    OR to_user_id = auth.uid()
    OR organization_id IN (
      SELECT organization_id FROM users
      WHERE id = auth.uid()
      AND role IN ('owner', 'admin')
    )
  );

-- Policy: Only current owners can initiate transfers
DROP POLICY IF EXISTS "Owners can initiate transfers" ON ownership_transfers;
CREATE POLICY "Owners can initiate transfers"
  ON ownership_transfers
  FOR INSERT
  WITH CHECK (
    from_user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()
      AND role = 'owner'
      AND deleted_at IS NULL
    )
  );

-- Policy: Target users can update transfers (confirm/decline)
DROP POLICY IF EXISTS "Recipients can update transfers" ON ownership_transfers;
CREATE POLICY "Recipients can update transfers"
  ON ownership_transfers
  FOR UPDATE
  USING (to_user_id = auth.uid() OR from_user_id = auth.uid());

-- ============================================
-- GRANT PERMISSIONS
-- ============================================

-- Grant permissions on tables
GRANT SELECT, INSERT, UPDATE ON invitations TO authenticated;
GRANT SELECT, INSERT, UPDATE ON ownership_transfers TO authenticated;
GRANT SELECT ON team_stats_by_org TO authenticated;

-- Grant execute permissions on functions
GRANT EXECUTE ON FUNCTION cleanup_expired_invitations() TO authenticated;
GRANT EXECUTE ON FUNCTION cleanup_expired_transfers() TO authenticated;
