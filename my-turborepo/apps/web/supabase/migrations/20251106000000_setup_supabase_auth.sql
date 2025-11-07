-- ============================================
-- SUPABASE AUTH INTEGRATION
-- Migration: 20251106000000_setup_supabase_auth
-- ============================================

-- ============================================
-- 1. MODIFY USERS TABLE FOR SUPABASE AUTH
-- ============================================

-- Remove password_hash column (Supabase Auth handles passwords)
ALTER TABLE users DROP COLUMN IF EXISTS password_hash;

-- Add auth_id to link to auth.users
ALTER TABLE users ADD COLUMN IF NOT EXISTS auth_id UUID UNIQUE;

-- Create index on auth_id for fast lookups
CREATE INDEX IF NOT EXISTS idx_users_auth_id ON users(auth_id);

-- ============================================
-- 2. CREATE TRIGGER TO SYNC auth.users → public.users
-- ============================================

-- Function to handle new user creation from Supabase Auth
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  org_id UUID;
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
      'owner',
      NEW.email_confirmed_at IS NOT NULL,
      NOW(),
      NOW()
    );

  ELSE
    -- Regular user (invited to existing organization)
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
      (NEW.raw_user_meta_data->>'organization_id')::uuid,
      NEW.email,
      NEW.raw_user_meta_data->>'full_name',
      COALESCE(NEW.raw_user_meta_data->>'role', 'user'),
      NEW.email_confirmed_at IS NOT NULL,
      NOW(),
      NOW()
    );
  END IF;

  RETURN NEW;
END;
$$;

-- Create trigger on auth.users table
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- ============================================
-- 3. UPDATE EMAIL VERIFICATION STATUS
-- ============================================

-- Function to update email_verified when user confirms email
CREATE OR REPLACE FUNCTION public.handle_user_email_verified()
RETURNS trigger
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE public.users
  SET email_verified = true
  WHERE auth_id = NEW.id;

  RETURN NEW;
END;
$$;

-- Create trigger for email verification
DROP TRIGGER IF EXISTS on_auth_user_email_verified ON auth.users;
CREATE TRIGGER on_auth_user_email_verified
  AFTER UPDATE OF email_confirmed_at ON auth.users
  FOR EACH ROW
  WHEN (OLD.email_confirmed_at IS NULL AND NEW.email_confirmed_at IS NOT NULL)
  EXECUTE FUNCTION public.handle_user_email_verified();

-- ============================================
-- 4. UPDATE LAST LOGIN
-- ============================================

-- Function to update last_login_at
CREATE OR REPLACE FUNCTION public.handle_user_login()
RETURNS trigger
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE public.users
  SET last_login_at = NOW()
  WHERE auth_id = NEW.user_id;

  RETURN NEW;
END;
$$;

-- Create trigger on auth sessions
DROP TRIGGER IF EXISTS on_auth_user_login ON auth.sessions;
CREATE TRIGGER on_auth_user_login
  AFTER INSERT ON auth.sessions
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_user_login();

-- ============================================
-- 5. HANDLE USER DELETION
-- ============================================

-- Function to soft delete user in public.users when auth.users is deleted
CREATE OR REPLACE FUNCTION public.handle_user_delete()
RETURNS trigger
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE public.users
  SET deleted_at = NOW()
  WHERE auth_id = OLD.id;

  RETURN OLD;
END;
$$;

-- Create trigger for user deletion
DROP TRIGGER IF EXISTS on_auth_user_deleted ON auth.users;
CREATE TRIGGER on_auth_user_deleted
  AFTER DELETE ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_user_delete();

-- ============================================
-- 6. ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================

-- Enable RLS on all tables
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_log ENABLE ROW LEVEL SECURITY;

-- Helper function to get current user's organization_id
CREATE OR REPLACE FUNCTION public.get_user_organization_id()
RETURNS UUID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT organization_id
  FROM public.users
  WHERE auth_id = auth.uid()
  AND deleted_at IS NULL;
$$;

-- Organizations: Users can only see their own organization
CREATE POLICY "Users can view own organization"
  ON organizations FOR SELECT
  USING (id = public.get_user_organization_id());

CREATE POLICY "Users can update own organization"
  ON organizations FOR UPDATE
  USING (id = public.get_user_organization_id());

-- Users: Can see users in their organization
CREATE POLICY "Users can view organization members"
  ON users FOR SELECT
  USING (organization_id = public.get_user_organization_id() AND deleted_at IS NULL);

CREATE POLICY "Users can update own profile"
  ON users FOR UPDATE
  USING (auth_id = auth.uid());

-- Customers: Scoped to organization
CREATE POLICY "Users can view organization customers"
  ON customers FOR SELECT
  USING (organization_id = public.get_user_organization_id() AND deleted_at IS NULL);

CREATE POLICY "Users can create customers"
  ON customers FOR INSERT
  WITH CHECK (organization_id = public.get_user_organization_id());

CREATE POLICY "Users can update organization customers"
  ON customers FOR UPDATE
  USING (organization_id = public.get_user_organization_id());

CREATE POLICY "Users can delete organization customers"
  ON customers FOR DELETE
  USING (organization_id = public.get_user_organization_id());

-- Products: Scoped to organization
CREATE POLICY "Users can view organization products"
  ON products FOR SELECT
  USING (organization_id = public.get_user_organization_id() AND deleted_at IS NULL);

CREATE POLICY "Users can create products"
  ON products FOR INSERT
  WITH CHECK (organization_id = public.get_user_organization_id());

CREATE POLICY "Users can update organization products"
  ON products FOR UPDATE
  USING (organization_id = public.get_user_organization_id());

CREATE POLICY "Users can delete organization products"
  ON products FOR DELETE
  USING (organization_id = public.get_user_organization_id());

-- Invoices: Scoped to organization
CREATE POLICY "Users can view organization invoices"
  ON invoices FOR SELECT
  USING (organization_id = public.get_user_organization_id() AND deleted_at IS NULL);

CREATE POLICY "Users can create invoices"
  ON invoices FOR INSERT
  WITH CHECK (organization_id = public.get_user_organization_id());

CREATE POLICY "Users can update organization invoices"
  ON invoices FOR UPDATE
  USING (organization_id = public.get_user_organization_id());

CREATE POLICY "Users can delete organization invoices"
  ON invoices FOR DELETE
  USING (organization_id = public.get_user_organization_id());

-- Invoice Items: Can access if invoice belongs to organization
CREATE POLICY "Users can view invoice items"
  ON invoice_items FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM invoices
      WHERE invoices.id = invoice_items.invoice_id
      AND invoices.organization_id = public.get_user_organization_id()
    )
  );

CREATE POLICY "Users can create invoice items"
  ON invoice_items FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM invoices
      WHERE invoices.id = invoice_items.invoice_id
      AND invoices.organization_id = public.get_user_organization_id()
    )
  );

CREATE POLICY "Users can update invoice items"
  ON invoice_items FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM invoices
      WHERE invoices.id = invoice_items.invoice_id
      AND invoices.organization_id = public.get_user_organization_id()
    )
  );

CREATE POLICY "Users can delete invoice items"
  ON invoice_items FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM invoices
      WHERE invoices.id = invoice_items.invoice_id
      AND invoices.organization_id = public.get_user_organization_id()
    )
  );

-- Expenses: Scoped to organization
CREATE POLICY "Users can view organization expenses"
  ON expenses FOR SELECT
  USING (organization_id = public.get_user_organization_id() AND deleted_at IS NULL);

CREATE POLICY "Users can create expenses"
  ON expenses FOR INSERT
  WITH CHECK (organization_id = public.get_user_organization_id());

CREATE POLICY "Users can update organization expenses"
  ON expenses FOR UPDATE
  USING (organization_id = public.get_user_organization_id());

CREATE POLICY "Users can delete organization expenses"
  ON expenses FOR DELETE
  USING (organization_id = public.get_user_organization_id());

-- Payments: Can access if invoice belongs to organization
CREATE POLICY "Users can view payments"
  ON payments FOR SELECT
  USING (organization_id = public.get_user_organization_id());

CREATE POLICY "Users can create payments"
  ON payments FOR INSERT
  WITH CHECK (organization_id = public.get_user_organization_id());

-- Notifications: Users can only see their own notifications
CREATE POLICY "Users can view own notifications"
  ON notifications FOR SELECT
  USING (user_id = (SELECT id FROM users WHERE auth_id = auth.uid()));

CREATE POLICY "Users can update own notifications"
  ON notifications FOR UPDATE
  USING (user_id = (SELECT id FROM users WHERE auth_id = auth.uid()));

-- Activity Log: Users can view organization activity
CREATE POLICY "Users can view organization activity"
  ON activity_log FOR SELECT
  USING (organization_id = public.get_user_organization_id());

CREATE POLICY "System can create activity logs"
  ON activity_log FOR INSERT
  WITH CHECK (organization_id = public.get_user_organization_id());

-- ============================================
-- 7. GRANT PERMISSIONS
-- ============================================

-- Grant authenticated users access to their data
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated;

-- SAT catalog tables are public (read-only for all users)
GRANT SELECT ON sat_product_codes TO anon, authenticated;
GRANT SELECT ON sat_tax_regimes TO anon, authenticated;
GRANT SELECT ON sat_cfdi_uses TO anon, authenticated;
GRANT SELECT ON sat_payment_forms TO anon, authenticated;
GRANT SELECT ON sat_units TO anon, authenticated;
