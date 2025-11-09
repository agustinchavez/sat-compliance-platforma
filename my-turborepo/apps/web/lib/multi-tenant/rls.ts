/**
 * Multi-Tenant Context Manager - RLS Policy Management
 *
 * Generates Row-Level Security (RLS) policies for multi-tenant tables.
 * Ensures data isolation at the database level.
 */

import type { RLSPolicyConfig } from './types'

/**
 * Tables that should have RLS enabled
 * All multi-tenant tables with organization_id column
 */
export const MULTI_TENANT_TABLES = [
  'customers',
  'products',
  'invoices',
  'invoice_items',
  'expenses',
  'payments',
  'journal_entries',
  'reports',
  'settings',
  // Add future tables here
] as const

/**
 * Tables that should NOT have RLS
 * Shared catalog tables and system tables
 */
export const EXCLUDED_TABLES = [
  // SAT catalogs (shared across all organizations)
  'sat_tax_regimes',
  'sat_uso_cfdi',
  'sat_payment_methods',
  'sat_payment_forms',
  'sat_product_codes',

  // System tables
  'migrations',

  // Auth tables (managed by Supabase)
  // auth.users, auth.sessions, etc.
] as const

/**
 * Generate RLS policy SQL for a single table
 *
 * @param tableName - Table name
 * @returns SQL statements for all RLS policies
 *
 * @example
 * ```typescript
 * const sql = generateRLSPolicySQL('customers')
 * // Execute SQL in migration
 * ```
 */
export function generateRLSPolicySQL(tableName: string): string {
  const policies = [
    generateSelectPolicy(tableName),
    generateInsertPolicy(tableName),
    generateUpdatePolicy(tableName),
    generateDeletePolicy(tableName),
  ]

  return `
-- ============================================
-- RLS Policies for ${tableName}
-- ============================================

-- Enable RLS
ALTER TABLE ${tableName} ENABLE ROW LEVEL SECURITY;

${policies.join('\n\n')}

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_${tableName}_org ON ${tableName}(organization_id);

-- Add NOT NULL constraint
ALTER TABLE ${tableName}
  ADD CONSTRAINT IF NOT EXISTS check_${tableName}_org_not_null
  CHECK (organization_id IS NOT NULL);
`.trim()
}

/**
 * Generate SELECT policy (read access)
 */
function generateSelectPolicy(tableName: string): string {
  return `
-- SELECT Policy: Users can view their organization's ${tableName}
CREATE POLICY "${tableName}_select_policy" ON ${tableName}
  FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id
      FROM users
      WHERE auth_id = auth.uid()
    )
  );`.trim()
}

/**
 * Generate INSERT policy (create access)
 */
function generateInsertPolicy(tableName: string): string {
  return `
-- INSERT Policy: Users can create ${tableName} in their organization
CREATE POLICY "${tableName}_insert_policy" ON ${tableName}
  FOR INSERT
  WITH CHECK (
    organization_id IN (
      SELECT organization_id
      FROM users
      WHERE auth_id = auth.uid()
    )
  );`.trim()
}

/**
 * Generate UPDATE policy (modify access)
 */
function generateUpdatePolicy(tableName: string): string {
  return `
-- UPDATE Policy: Users can update their organization's ${tableName}
CREATE POLICY "${tableName}_update_policy" ON ${tableName}
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
  );`.trim()
}

/**
 * Generate DELETE policy (remove access)
 */
function generateDeletePolicy(tableName: string): string {
  return `
-- DELETE Policy: Users can delete their organization's ${tableName}
CREATE POLICY "${tableName}_delete_policy" ON ${tableName}
  FOR DELETE
  USING (
    organization_id IN (
      SELECT organization_id
      FROM users
      WHERE auth_id = auth.uid()
    )
  );`.trim()
}

/**
 * Generate complete RLS migration SQL
 * Creates policies for all multi-tenant tables
 *
 * @returns Complete migration SQL
 *
 * @example
 * ```typescript
 * const migrationSQL = generateRLSMigration()
 * // Save to migration file
 * ```
 */
export function generateRLSMigration(): string {
  const timestamp = new Date().toISOString().replace(/[-:T.]/g, '').slice(0, 14)
  const policies = MULTI_TENANT_TABLES.map((table) => generateRLSPolicySQL(table)).join('\n\n')

  return `
-- Migration: ${timestamp}_enable_rls_policies
-- Description: Enable Row-Level Security on all multi-tenant tables
-- Created: ${new Date().toISOString()}

BEGIN;

${policies}

-- Create helper function to check RLS status
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

COMMIT;

-- Verify RLS is enabled
DO $$
DECLARE
  table_name TEXT;
  rls_enabled BOOLEAN;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[${MULTI_TENANT_TABLES.map((t) => `'${t}'`).join(', ')}]
  LOOP
    SELECT check_rls_enabled(table_name) INTO rls_enabled;
    IF NOT rls_enabled THEN
      RAISE WARNING 'RLS not enabled on table: %', table_name;
    END IF;
  END LOOP;
END $$;
`.trim()
}

/**
 * Generate rollback SQL to disable RLS
 *
 * @returns Rollback migration SQL
 */
export function generateRLSRollback(): string {
  const drops = MULTI_TENANT_TABLES.map(
    (table) => `
-- Disable RLS on ${table}
ALTER TABLE ${table} DISABLE ROW LEVEL SECURITY;

-- Drop policies
DROP POLICY IF EXISTS "${table}_select_policy" ON ${table};
DROP POLICY IF EXISTS "${table}_insert_policy" ON ${table};
DROP POLICY IF EXISTS "${table}_update_policy" ON ${table};
DROP POLICY IF EXISTS "${table}_delete_policy" ON ${table};

-- Drop index
DROP INDEX IF EXISTS idx_${table}_org;

-- Drop constraint
ALTER TABLE ${table} DROP CONSTRAINT IF EXISTS check_${table}_org_not_null;
`.trim()
  ).join('\n\n')

  return `
-- Rollback: Disable RLS policies
-- WARNING: This will remove tenant isolation security!

BEGIN;

${drops}

-- Drop helper function
DROP FUNCTION IF EXISTS check_rls_enabled(TEXT);

COMMIT;
`.trim()
}

/**
 * Validate RLS policy configuration
 *
 * @param config - Policy configuration
 * @returns true if valid
 */
export function validateRLSPolicyConfig(config: RLSPolicyConfig): boolean {
  if (!config.tableName || !config.policyName) {
    return false
  }

  const validOperations = ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'ALL']
  if (!validOperations.includes(config.operation)) {
    return false
  }

  return true
}

/**
 * Get RLS policy SQL for custom policy
 * For tables that need special RLS rules
 *
 * @param config - Custom policy configuration
 * @returns SQL statement
 *
 * @example
 * ```typescript
 * const sql = getRLSPolicySQL({
 *   tableName: 'audit_logs',
 *   policyName: 'admin_only',
 *   operation: 'ALL',
 *   using: `role IN ('owner', 'admin')`
 * })
 * ```
 */
export function getRLSPolicySQL(config: RLSPolicyConfig): string {
  if (!validateRLSPolicyConfig(config)) {
    throw new Error('Invalid RLS policy configuration')
  }

  const { tableName, policyName, operation, using, withCheck } = config

  let sql = `CREATE POLICY "${policyName}" ON ${tableName}\n  FOR ${operation}`

  if (using) {
    sql += `\n  USING (${using})`
  }

  if (withCheck) {
    sql += `\n  WITH CHECK (${withCheck})`
  }

  return sql + ';'
}

/**
 * Generate RLS policies for custom table
 * For tables with special requirements
 *
 * @param tableName - Table name
 * @param orgColumn - Organization column name (default: 'organization_id')
 * @returns SQL statements
 */
export function generateCustomRLSPolicies(
  tableName: string,
  orgColumn = 'organization_id'
): string {
  return `
-- Custom RLS Policies for ${tableName}

ALTER TABLE ${tableName} ENABLE ROW LEVEL SECURITY;

CREATE POLICY "${tableName}_select" ON ${tableName}
  FOR SELECT
  USING (
    ${orgColumn} IN (
      SELECT organization_id FROM users WHERE auth_id = auth.uid()
    )
  );

CREATE POLICY "${tableName}_insert" ON ${tableName}
  FOR INSERT
  WITH CHECK (
    ${orgColumn} IN (
      SELECT organization_id FROM users WHERE auth_id = auth.uid()
    )
  );

CREATE POLICY "${tableName}_update" ON ${tableName}
  FOR UPDATE
  USING (
    ${orgColumn} IN (
      SELECT organization_id FROM users WHERE auth_id = auth.uid()
    )
  )
  WITH CHECK (
    ${orgColumn} IN (
      SELECT organization_id FROM users WHERE auth_id = auth.uid()
    )
  );

CREATE POLICY "${tableName}_delete" ON ${tableName}
  FOR DELETE
  USING (
    ${orgColumn} IN (
      SELECT organization_id FROM users WHERE auth_id = auth.uid()
    )
  );

CREATE INDEX IF NOT EXISTS idx_${tableName}_${orgColumn} ON ${tableName}(${orgColumn});
`.trim()
}
