-- ============================================
-- Update signup trigger to create organization_members records
-- Migration: 20251115000006_update_signup_trigger_for_multi_org
-- Description: Ensures new signups get organization_members records created
-- ============================================

-- Update the handle_new_user function to create organization_members records
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  org_id UUID;
  user_role VARCHAR(50);
BEGIN
  -- Check if this is an organization owner signup (has organization metadata)
  IF NEW.raw_user_meta_data ? 'is_org_owner' AND
     (NEW.raw_user_meta_data->>'is_org_owner')::boolean = true THEN

    -- Create organization first
    INSERT INTO organizations (
      name,
      rfc,
      tax_regime,
      legal_name,
      email,
      plan
    ) VALUES (
      NEW.raw_user_meta_data->>'organization_name',
      NEW.raw_user_meta_data->>'organization_rfc',
      NEW.raw_user_meta_data->>'tax_regime',
      NEW.raw_user_meta_data->>'legal_name',
      NEW.email,
      COALESCE(NEW.raw_user_meta_data->>'plan', 'free')
    ) RETURNING id INTO org_id;

    user_role := 'owner';

    -- Create user as organization owner
    INSERT INTO public.users (
      id,
      auth_id,
      organization_id,
      email,
      full_name,
      role,
      email_verified,
      created_at,
      updated_at
    ) VALUES (
      gen_random_uuid(),
      NEW.id,
      org_id,
      NEW.email,
      NEW.raw_user_meta_data->>'full_name',
      user_role,
      NEW.email_confirmed_at IS NOT NULL,
      NOW(),
      NOW()
    );

    -- NEW: Create organization_members record for multi-org support
    INSERT INTO organization_members (
      user_id,
      organization_id,
      role,
      created_at,
      updated_at
    ) VALUES (
      NEW.id,  -- auth.users.id
      org_id,
      user_role,
      NOW(),
      NOW()
    );

  ELSE
    -- Regular user (invited to existing organization)
    org_id := (NEW.raw_user_meta_data->>'organization_id')::uuid;
    user_role := COALESCE(NEW.raw_user_meta_data->>'role', 'user');

    INSERT INTO public.users (
      id,
      auth_id,
      organization_id,
      email,
      full_name,
      role,
      email_verified,
      created_at,
      updated_at
    ) VALUES (
      gen_random_uuid(),
      NEW.id,
      org_id,
      NEW.email,
      NEW.raw_user_meta_data->>'full_name',
      user_role,
      NEW.email_confirmed_at IS NOT NULL,
      NOW(),
      NOW()
    );

    -- NEW: Create organization_members record for invited users too
    IF org_id IS NOT NULL THEN
      INSERT INTO organization_members (
        user_id,
        organization_id,
        role,
        invited_by,
        created_at,
        updated_at
      ) VALUES (
        NEW.id,  -- auth.users.id
        org_id,
        user_role,
        (NEW.raw_user_meta_data->>'invited_by')::uuid,
        NOW(),
        NOW()
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.handle_new_user() IS 'Creates public.users and organization_members records when auth.users record is created (updated for multi-org support)';
