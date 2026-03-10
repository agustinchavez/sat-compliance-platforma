-- ============================================
-- SAT COMPLIANCE PLATFORM - Organization Branding Table
-- Migration: 20260309000000_add_organization_branding
-- Description: Creates table for organization PDF branding settings (Component 16)
-- ============================================

-- ============================================
-- ORGANIZATION BRANDING TABLE
-- ============================================

-- Create table for organization branding settings
-- Used by Component 16 (PDF Generator) to customize invoice appearance
CREATE TABLE IF NOT EXISTS organization_branding (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- Color settings (hex format)
  primary_color VARCHAR(7) DEFAULT '#1E3A5F',
  secondary_color VARCHAR(7) DEFAULT '#EBF2FA',

  -- Logo settings
  logo_url TEXT, -- R2 storage key/URL

  -- Company display info (may differ from legal name)
  company_name VARCHAR(255),
  website VARCHAR(255),
  phone VARCHAR(50),

  -- Additional branding
  tagline VARCHAR(255),
  footer_text TEXT,

  -- Metadata
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),

  -- Constraints
  CONSTRAINT valid_primary_color CHECK (
    primary_color IS NULL OR primary_color ~ '^#[0-9A-Fa-f]{6}$'
  ),
  CONSTRAINT valid_secondary_color CHECK (
    secondary_color IS NULL OR secondary_color ~ '^#[0-9A-Fa-f]{6}$'
  )
);

-- One branding config per organization
CREATE UNIQUE INDEX IF NOT EXISTS idx_organization_branding_org
  ON organization_branding(organization_id);

-- Add updated_at trigger
DROP TRIGGER IF EXISTS update_organization_branding_updated_at ON organization_branding;
CREATE TRIGGER update_organization_branding_updated_at
  BEFORE UPDATE ON organization_branding
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Add comment
COMMENT ON TABLE organization_branding IS 'Stores PDF branding settings per organization (Component 16)';
COMMENT ON COLUMN organization_branding.primary_color IS 'Primary brand color in hex format (#RRGGBB)';
COMMENT ON COLUMN organization_branding.secondary_color IS 'Secondary/accent color in hex format';
COMMENT ON COLUMN organization_branding.logo_url IS 'R2 storage URL/key for organization logo';
COMMENT ON COLUMN organization_branding.company_name IS 'Display name (may differ from legal RFC name)';

-- ============================================
-- SECURITY POLICIES (RLS)
-- ============================================

-- Enable RLS
ALTER TABLE organization_branding ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view their organization's branding
DROP POLICY IF EXISTS "Users can view org branding" ON organization_branding;
CREATE POLICY "Users can view org branding"
  ON organization_branding
  FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM users WHERE id = auth.uid()
    )
  );

-- Policy: Users can insert branding for their organization
DROP POLICY IF EXISTS "Users can insert org branding" ON organization_branding;
CREATE POLICY "Users can insert org branding"
  ON organization_branding
  FOR INSERT
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM users WHERE id = auth.uid()
    )
  );

-- Policy: Users can update their organization's branding
DROP POLICY IF EXISTS "Users can update org branding" ON organization_branding;
CREATE POLICY "Users can update org branding"
  ON organization_branding
  FOR UPDATE
  USING (
    organization_id IN (
      SELECT organization_id FROM users WHERE id = auth.uid()
    )
  );

-- Policy: Users can delete their organization's branding
DROP POLICY IF EXISTS "Users can delete org branding" ON organization_branding;
CREATE POLICY "Users can delete org branding"
  ON organization_branding
  FOR DELETE
  USING (
    organization_id IN (
      SELECT organization_id FROM users WHERE id = auth.uid()
    )
  );

-- ============================================
-- GRANT PERMISSIONS
-- ============================================

GRANT SELECT, INSERT, UPDATE, DELETE ON organization_branding TO authenticated;
