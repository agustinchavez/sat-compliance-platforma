-- ============================================
-- Create missing users and organizations
-- Migration: 20251115000005_create_missing_users_and_orgs
-- Description: Ensures all auth users have corresponding records in public.users and organizations
-- ============================================================================

-- Create missing user records for auth users that don't have a public.users record
INSERT INTO users (auth_id, email, full_name, email_verified, created_at, updated_at)
SELECT
  au.id as auth_id,
  au.email,
  COALESCE(au.raw_user_meta_data->>'full_name', split_part(au.email, '@', 1)) as full_name,
  au.email_confirmed_at IS NOT NULL as email_verified,
  au.created_at,
  NOW() as updated_at
FROM auth.users au
WHERE NOT EXISTS (
  SELECT 1 FROM users u WHERE u.auth_id = au.id
)
AND au.deleted_at IS NULL;

-- For each user without an organization, create one
DO $$
DECLARE
  user_record RECORD;
  new_org_id UUID;
BEGIN
  FOR user_record IN
    SELECT u.id, u.auth_id, u.email, u.full_name
    FROM users u
    WHERE u.organization_id IS NULL
      AND u.deleted_at IS NULL
  LOOP
    -- Create organization for this user
    INSERT INTO organizations (
      name,
      rfc,
      tax_regime,
      legal_name,
      plan,
      created_at,
      updated_at
    ) VALUES (
      user_record.full_name || '''s Organization',  -- e.g., "John Doe's Organization"
      'XAXX010101000',  -- Default RFC
      '601',  -- Default tax regime (General de Ley Personas Morales)
      user_record.full_name,  -- Use user's name as legal name
      'free',
      NOW(),
      NOW()
    )
    RETURNING id INTO new_org_id;

    -- Update user with organization_id and default role
    UPDATE users
    SET
      organization_id = new_org_id,
      role = 'owner'
    WHERE id = user_record.id;

    -- Create organization membership
    INSERT INTO organization_members (
      user_id,
      organization_id,
      role,
      created_at,
      updated_at
    ) VALUES (
      user_record.auth_id,  -- Use auth_id for FK to auth.users
      new_org_id,
      'owner',
      NOW(),
      NOW()
    );

    RAISE NOTICE 'Created organization % for user %', new_org_id, user_record.email;
  END LOOP;
END $$;

COMMENT ON TABLE users IS 'User profiles synchronized with auth.users. All auth users should have a corresponding record here.';
