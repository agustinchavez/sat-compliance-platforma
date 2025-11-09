-- Migration: 20251107000001_enable_rls_existing_tables
-- Description: Enable RLS on all existing tables
-- Created: 2025-11-07

BEGIN;

-- ============================================
-- MULTI-TENANT TABLES (organization-scoped)
-- ============================================

-- Chart of Accounts
ALTER TABLE chart_of_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "chart_of_accounts_select_policy" ON chart_of_accounts
  FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM users WHERE auth_id = auth.uid()
    )
  );

CREATE POLICY "chart_of_accounts_insert_policy" ON chart_of_accounts
  FOR INSERT
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM users WHERE auth_id = auth.uid()
    )
  );

CREATE POLICY "chart_of_accounts_update_policy" ON chart_of_accounts
  FOR UPDATE
  USING (
    organization_id IN (
      SELECT organization_id FROM users WHERE auth_id = auth.uid()
    )
  )
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM users WHERE auth_id = auth.uid()
    )
  );

CREATE POLICY "chart_of_accounts_delete_policy" ON chart_of_accounts
  FOR DELETE
  USING (
    organization_id IN (
      SELECT organization_id FROM users WHERE auth_id = auth.uid()
    )
  );

CREATE INDEX IF NOT EXISTS idx_chart_of_accounts_org ON chart_of_accounts(organization_id);

-- Journal Entries
ALTER TABLE journal_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "journal_entries_select_policy" ON journal_entries
  FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM users WHERE auth_id = auth.uid()
    )
  );

CREATE POLICY "journal_entries_insert_policy" ON journal_entries
  FOR INSERT
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM users WHERE auth_id = auth.uid()
    )
  );

CREATE POLICY "journal_entries_update_policy" ON journal_entries
  FOR UPDATE
  USING (
    organization_id IN (
      SELECT organization_id FROM users WHERE auth_id = auth.uid()
    )
  )
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM users WHERE auth_id = auth.uid()
    )
  );

CREATE POLICY "journal_entries_delete_policy" ON journal_entries
  FOR DELETE
  USING (
    organization_id IN (
      SELECT organization_id FROM users WHERE auth_id = auth.uid()
    )
  );

CREATE INDEX IF NOT EXISTS idx_journal_entries_org ON journal_entries(organization_id);

-- Journal Entry Lines
ALTER TABLE journal_entry_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "journal_entry_lines_select_policy" ON journal_entry_lines
  FOR SELECT
  USING (
    journal_entry_id IN (
      SELECT id FROM journal_entries
      WHERE organization_id IN (
        SELECT organization_id FROM users WHERE auth_id = auth.uid()
      )
    )
  );

CREATE POLICY "journal_entry_lines_insert_policy" ON journal_entry_lines
  FOR INSERT
  WITH CHECK (
    journal_entry_id IN (
      SELECT id FROM journal_entries
      WHERE organization_id IN (
        SELECT organization_id FROM users WHERE auth_id = auth.uid()
      )
    )
  );

CREATE POLICY "journal_entry_lines_update_policy" ON journal_entry_lines
  FOR UPDATE
  USING (
    journal_entry_id IN (
      SELECT id FROM journal_entries
      WHERE organization_id IN (
        SELECT organization_id FROM users WHERE auth_id = auth.uid()
      )
    )
  )
  WITH CHECK (
    journal_entry_id IN (
      SELECT id FROM journal_entries
      WHERE organization_id IN (
        SELECT organization_id FROM users WHERE auth_id = auth.uid()
      )
    )
  );

CREATE POLICY "journal_entry_lines_delete_policy" ON journal_entry_lines
  FOR DELETE
  USING (
    journal_entry_id IN (
      SELECT id FROM journal_entries
      WHERE organization_id IN (
        SELECT organization_id FROM users WHERE auth_id = auth.uid()
      )
    )
  );

CREATE INDEX IF NOT EXISTS idx_journal_entry_lines_entry ON journal_entry_lines(journal_entry_id);

-- Tax Periods
ALTER TABLE tax_periods ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tax_periods_select_policy" ON tax_periods
  FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM users WHERE auth_id = auth.uid()
    )
  );

CREATE POLICY "tax_periods_insert_policy" ON tax_periods
  FOR INSERT
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM users WHERE auth_id = auth.uid()
    )
  );

CREATE POLICY "tax_periods_update_policy" ON tax_periods
  FOR UPDATE
  USING (
    organization_id IN (
      SELECT organization_id FROM users WHERE auth_id = auth.uid()
    )
  )
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM users WHERE auth_id = auth.uid()
    )
  );

CREATE POLICY "tax_periods_delete_policy" ON tax_periods
  FOR DELETE
  USING (
    organization_id IN (
      SELECT organization_id FROM users WHERE auth_id = auth.uid()
    )
  );

CREATE INDEX IF NOT EXISTS idx_tax_periods_org ON tax_periods(organization_id);

-- WhatsApp Conversations
ALTER TABLE whatsapp_conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "whatsapp_conversations_select_policy" ON whatsapp_conversations
  FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM users WHERE auth_id = auth.uid()
    )
  );

CREATE POLICY "whatsapp_conversations_insert_policy" ON whatsapp_conversations
  FOR INSERT
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM users WHERE auth_id = auth.uid()
    )
  );

CREATE POLICY "whatsapp_conversations_update_policy" ON whatsapp_conversations
  FOR UPDATE
  USING (
    organization_id IN (
      SELECT organization_id FROM users WHERE auth_id = auth.uid()
    )
  )
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM users WHERE auth_id = auth.uid()
    )
  );

CREATE POLICY "whatsapp_conversations_delete_policy" ON whatsapp_conversations
  FOR DELETE
  USING (
    organization_id IN (
      SELECT organization_id FROM users WHERE auth_id = auth.uid()
    )
  );

CREATE INDEX IF NOT EXISTS idx_whatsapp_conversations_org ON whatsapp_conversations(organization_id);

-- WhatsApp Messages
ALTER TABLE whatsapp_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "whatsapp_messages_select_policy" ON whatsapp_messages
  FOR SELECT
  USING (
    conversation_id IN (
      SELECT id FROM whatsapp_conversations
      WHERE organization_id IN (
        SELECT organization_id FROM users WHERE auth_id = auth.uid()
      )
    )
  );

CREATE POLICY "whatsapp_messages_insert_policy" ON whatsapp_messages
  FOR INSERT
  WITH CHECK (
    conversation_id IN (
      SELECT id FROM whatsapp_conversations
      WHERE organization_id IN (
        SELECT organization_id FROM users WHERE auth_id = auth.uid()
      )
    )
  );

CREATE POLICY "whatsapp_messages_update_policy" ON whatsapp_messages
  FOR UPDATE
  USING (
    conversation_id IN (
      SELECT id FROM whatsapp_conversations
      WHERE organization_id IN (
        SELECT organization_id FROM users WHERE auth_id = auth.uid()
      )
    )
  )
  WITH CHECK (
    conversation_id IN (
      SELECT id FROM whatsapp_conversations
      WHERE organization_id IN (
        SELECT organization_id FROM users WHERE auth_id = auth.uid()
      )
    )
  );

CREATE POLICY "whatsapp_messages_delete_policy" ON whatsapp_messages
  FOR DELETE
  USING (
    conversation_id IN (
      SELECT id FROM whatsapp_conversations
      WHERE organization_id IN (
        SELECT organization_id FROM users WHERE auth_id = auth.uid()
      )
    )
  );

CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_conv ON whatsapp_messages(conversation_id);

-- ============================================
-- SHARED CATALOG TABLES (public read-only)
-- SAT catalogs are shared across all organizations
-- ============================================

-- SAT Product Codes
ALTER TABLE sat_product_codes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sat_product_codes_select_policy" ON sat_product_codes
  FOR SELECT
  USING (auth.uid() IS NOT NULL); -- Any authenticated user can read

-- SAT Tax Regimes
ALTER TABLE sat_tax_regimes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sat_tax_regimes_select_policy" ON sat_tax_regimes
  FOR SELECT
  USING (auth.uid() IS NOT NULL); -- Any authenticated user can read

-- SAT CFDI Uses
ALTER TABLE sat_cfdi_uses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sat_cfdi_uses_select_policy" ON sat_cfdi_uses
  FOR SELECT
  USING (auth.uid() IS NOT NULL); -- Any authenticated user can read

-- SAT Payment Forms
ALTER TABLE sat_payment_forms ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sat_payment_forms_select_policy" ON sat_payment_forms
  FOR SELECT
  USING (auth.uid() IS NOT NULL); -- Any authenticated user can read

-- SAT Units
ALTER TABLE sat_units ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sat_units_select_policy" ON sat_units
  FOR SELECT
  USING (auth.uid() IS NOT NULL); -- Any authenticated user can read

-- ============================================
-- SYSTEM TABLES
-- ============================================

-- Job Queue (background jobs)
ALTER TABLE job_queue ENABLE ROW LEVEL SECURITY;

-- Only authenticated users can interact with job queue
CREATE POLICY "job_queue_select_policy" ON job_queue
  FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "job_queue_insert_policy" ON job_queue
  FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "job_queue_update_policy" ON job_queue
  FOR UPDATE
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "job_queue_delete_policy" ON job_queue
  FOR DELETE
  USING (auth.uid() IS NOT NULL);

-- ============================================
-- ADD NOT NULL CONSTRAINTS
-- ============================================

-- Only for multi-tenant tables with organization_id
-- Using DO blocks to handle "IF NOT EXISTS" for CHECK constraints
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'check_chart_of_accounts_org_not_null'
  ) THEN
    ALTER TABLE chart_of_accounts
      ADD CONSTRAINT check_chart_of_accounts_org_not_null
      CHECK (organization_id IS NOT NULL);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'check_journal_entries_org_not_null'
  ) THEN
    ALTER TABLE journal_entries
      ADD CONSTRAINT check_journal_entries_org_not_null
      CHECK (organization_id IS NOT NULL);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'check_tax_periods_org_not_null'
  ) THEN
    ALTER TABLE tax_periods
      ADD CONSTRAINT check_tax_periods_org_not_null
      CHECK (organization_id IS NOT NULL);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'check_whatsapp_conversations_org_not_null'
  ) THEN
    ALTER TABLE whatsapp_conversations
      ADD CONSTRAINT check_whatsapp_conversations_org_not_null
      CHECK (organization_id IS NOT NULL);
  END IF;
END $$;

COMMIT;

-- ============================================
-- Verification
-- ============================================

-- Verify RLS is enabled on all tables
DO $$
DECLARE
  table_name TEXT;
  rls_enabled BOOLEAN;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'chart_of_accounts',
    'journal_entries',
    'journal_entry_lines',
    'tax_periods',
    'whatsapp_conversations',
    'whatsapp_messages',
    'sat_product_codes',
    'sat_tax_regimes',
    'sat_cfdi_uses',
    'sat_payment_forms',
    'sat_units',
    'job_queue'
  ]
  LOOP
    SELECT check_rls_enabled(table_name) INTO rls_enabled;
    IF NOT rls_enabled THEN
      RAISE WARNING 'RLS not enabled on table: %', table_name;
    ELSE
      RAISE NOTICE 'RLS enabled on table: %', table_name;
    END IF;
  END LOOP;
END $$;
