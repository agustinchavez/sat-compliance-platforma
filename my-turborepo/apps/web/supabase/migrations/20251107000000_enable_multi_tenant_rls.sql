-- Migration: 20251107000000_enable_multi_tenant_rls
-- Description: Enable Row-Level Security on all multi-tenant tables
-- Created: 2025-11-07

BEGIN;

-- ============================================
-- Helper function to check RLS status
-- ============================================

CREATE OR REPLACE FUNCTION check_rls_enabled(table_name TEXT)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename = table_name
      AND rowsecurity = TRUE
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- RLS Policies for users (already has basic RLS, enhance it)
-- ============================================

-- Note: Users table RLS was already set up in previous migration
-- We'll keep those policies and add additional ones if needed

-- ============================================
-- FUTURE TABLES (Create as you build features)
-- ============================================
-- Below are RLS policies for tables that will be created later
-- Uncomment and use when creating each table

/*
-- ============================================
-- RLS Policies for customers
-- ============================================

ALTER TABLE customers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "customers_select_policy" ON customers
  FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id
      FROM users
      WHERE auth_id = auth.uid()
    )
  );

CREATE POLICY "customers_insert_policy" ON customers
  FOR INSERT
  WITH CHECK (
    organization_id IN (
      SELECT organization_id
      FROM users
      WHERE auth_id = auth.uid()
    )
  );

CREATE POLICY "customers_update_policy" ON customers
  FOR UPDATE
  USING (
    organization_id IN (
      SELECT organization_id
      FROM users
      WHERE auth_id = auth.uid()
    )
  )
  WITH CHECK (
    organization_id IN (
      SELECT organization_id
      FROM users
      WHERE auth_id = auth.uid()
    )
  );

CREATE POLICY "customers_delete_policy" ON customers
  FOR DELETE
  USING (
    organization_id IN (
      SELECT organization_id
      FROM users
      WHERE auth_id = auth.uid()
    )
  );

CREATE INDEX IF NOT EXISTS idx_customers_org ON customers(organization_id);

ALTER TABLE customers
  ADD CONSTRAINT IF NOT EXISTS check_customers_org_not_null
  CHECK (organization_id IS NOT NULL);

-- ============================================
-- RLS Policies for products
-- ============================================

ALTER TABLE products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "products_select_policy" ON products
  FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id
      FROM users
      WHERE auth_id = auth.uid()
    )
  );

CREATE POLICY "products_insert_policy" ON products
  FOR INSERT
  WITH CHECK (
    organization_id IN (
      SELECT organization_id
      FROM users
      WHERE auth_id = auth.uid()
    )
  );

CREATE POLICY "products_update_policy" ON products
  FOR UPDATE
  USING (
    organization_id IN (
      SELECT organization_id
      FROM users
      WHERE auth_id = auth.uid()
    )
  )
  WITH CHECK (
    organization_id IN (
      SELECT organization_id
      FROM users
      WHERE auth_id = auth.uid()
    )
  );

CREATE POLICY "products_delete_policy" ON products
  FOR DELETE
  USING (
    organization_id IN (
      SELECT organization_id
      FROM users
      WHERE auth_id = auth.uid()
    )
  );

CREATE INDEX IF NOT EXISTS idx_products_org ON products(organization_id);

ALTER TABLE products
  ADD CONSTRAINT IF NOT EXISTS check_products_org_not_null
  CHECK (organization_id IS NOT NULL);

-- ============================================
-- RLS Policies for invoices
-- ============================================

ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "invoices_select_policy" ON invoices
  FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id
      FROM users
      WHERE auth_id = auth.uid()
    )
  );

CREATE POLICY "invoices_insert_policy" ON invoices
  FOR INSERT
  WITH CHECK (
    organization_id IN (
      SELECT organization_id
      FROM users
      WHERE auth_id = auth.uid()
    )
  );

CREATE POLICY "invoices_update_policy" ON invoices
  FOR UPDATE
  USING (
    organization_id IN (
      SELECT organization_id
      FROM users
      WHERE auth_id = auth.uid()
    )
  )
  WITH CHECK (
    organization_id IN (
      SELECT organization_id
      FROM users
      WHERE auth_id = auth.uid()
    )
  );

CREATE POLICY "invoices_delete_policy" ON invoices
  FOR DELETE
  USING (
    organization_id IN (
      SELECT organization_id
      FROM users
      WHERE auth_id = auth.uid()
    )
  );

CREATE INDEX IF NOT EXISTS idx_invoices_org ON invoices(organization_id);

ALTER TABLE invoices
  ADD CONSTRAINT IF NOT EXISTS check_invoices_org_not_null
  CHECK (organization_id IS NOT NULL);

-- Copy this pattern for:
-- - invoice_items
-- - expenses
-- - payments
-- - journal_entries
-- - reports
-- - settings
*/

COMMIT;

-- ============================================
-- Verification
-- ============================================

-- Check that RLS helper function exists
SELECT check_rls_enabled('users') AS users_rls_enabled;

-- Note: Other table checks will be enabled as tables are created
