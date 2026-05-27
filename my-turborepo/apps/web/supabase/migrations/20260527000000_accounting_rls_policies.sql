-- ============================================
-- FIX-1.1: RLS policies for accounting tables
-- ============================================
-- The accounting_subsystem migration enabled RLS on 4 tables but created
-- zero policies. This forward-only migration adds proper policies using
-- auth_user_is_org_member() (defined in 20251115000003_fix_all_rls_recursion.sql).

-- ============================================
-- account_code_aliases: per-org strict isolation
-- ============================================
CREATE POLICY "alias_select_own_org"
  ON account_code_aliases FOR SELECT
  TO authenticated
  USING (auth_user_is_org_member(organization_id));

CREATE POLICY "alias_insert_own_org"
  ON account_code_aliases FOR INSERT
  TO authenticated
  WITH CHECK (auth_user_is_org_member(organization_id));

CREATE POLICY "alias_update_own_org"
  ON account_code_aliases FOR UPDATE
  TO authenticated
  USING (auth_user_is_org_member(organization_id))
  WITH CHECK (auth_user_is_org_member(organization_id));

CREATE POLICY "alias_delete_own_org"
  ON account_code_aliases FOR DELETE
  TO authenticated
  USING (auth_user_is_org_member(organization_id));

-- ============================================
-- exchange_rates: shared (org_id NULL) readable by all; per-org strict
-- ============================================
CREATE POLICY "rates_select_shared_or_own_org"
  ON exchange_rates FOR SELECT
  TO authenticated
  USING (
    organization_id IS NULL
    OR auth_user_is_org_member(organization_id)
  );

CREATE POLICY "rates_insert_own_org"
  ON exchange_rates FOR INSERT
  TO authenticated
  WITH CHECK (
    organization_id IS NOT NULL
    AND auth_user_is_org_member(organization_id)
  );

CREATE POLICY "rates_update_own_org"
  ON exchange_rates FOR UPDATE
  TO authenticated
  USING (
    organization_id IS NOT NULL
    AND auth_user_is_org_member(organization_id)
  )
  WITH CHECK (
    organization_id IS NOT NULL
    AND auth_user_is_org_member(organization_id)
  );

CREATE POLICY "rates_delete_own_org"
  ON exchange_rates FOR DELETE
  TO authenticated
  USING (
    organization_id IS NOT NULL
    AND auth_user_is_org_member(organization_id)
  );

-- ============================================
-- account_balance_snapshots: per-org strict isolation
-- ============================================
CREATE POLICY "snapshot_select_own_org"
  ON account_balance_snapshots FOR SELECT
  TO authenticated
  USING (auth_user_is_org_member(organization_id));

CREATE POLICY "snapshot_insert_own_org"
  ON account_balance_snapshots FOR INSERT
  TO authenticated
  WITH CHECK (auth_user_is_org_member(organization_id));

CREATE POLICY "snapshot_update_own_org"
  ON account_balance_snapshots FOR UPDATE
  TO authenticated
  USING (auth_user_is_org_member(organization_id))
  WITH CHECK (auth_user_is_org_member(organization_id));

CREATE POLICY "snapshot_delete_own_org"
  ON account_balance_snapshots FOR DELETE
  TO authenticated
  USING (auth_user_is_org_member(organization_id));

-- ============================================
-- posting_rules: system-tier readable by all; per-org strict for non-system
-- ============================================
CREATE POLICY "rules_select_system_or_own_org"
  ON posting_rules FOR SELECT
  TO authenticated
  USING (
    is_system = TRUE
    OR auth_user_is_org_member(organization_id)
  );

CREATE POLICY "rules_insert_own_org_non_system"
  ON posting_rules FOR INSERT
  TO authenticated
  WITH CHECK (
    is_system = FALSE
    AND auth_user_is_org_member(organization_id)
  );

CREATE POLICY "rules_update_own_org_non_system"
  ON posting_rules FOR UPDATE
  TO authenticated
  USING (
    is_system = FALSE
    AND auth_user_is_org_member(organization_id)
  )
  WITH CHECK (
    is_system = FALSE
    AND auth_user_is_org_member(organization_id)
  );

CREATE POLICY "rules_delete_own_org_non_system"
  ON posting_rules FOR DELETE
  TO authenticated
  USING (
    is_system = FALSE
    AND auth_user_is_org_member(organization_id)
  );
