-- ============================================
-- ACCOUNTING SUBSYSTEM MIGRATION
-- Components 21 (Chart of Accounts), 22 (Journal Entries), 23 (Financial Reports)
-- Migration: 20260501000000_accounting_subsystem
-- ============================================

-- ============================================
-- 1. CREATE ENUM TYPES
-- ============================================

CREATE TYPE account_type_enum AS ENUM (
  'asset',
  'liability',
  'equity',
  'revenue',
  'cost_of_sales',
  'expense',
  'financial_result',
  'other_income_expense',
  'order'
);

CREATE TYPE poliza_type_enum AS ENUM ('ingreso', 'egreso', 'diario');
CREATE TYPE entry_status_enum AS ENUM ('draft', 'posted', 'reversed');
CREATE TYPE source_type_enum AS ENUM (
  'invoice', 'payment', 'expense',
  'manual', 'adjustment',
  'opening_balance', 'closing'
);
CREATE TYPE period_status_enum AS ENUM ('open', 'closing', 'closed', 'reopened');
CREATE TYPE filing_mode_enum AS ENUM ('required', 'records_only', 'disabled');
CREATE TYPE rate_source_enum AS ENUM ('cfdi', 'banxico_fix', 'dof', 'manual');

-- ============================================
-- 2. ALTER chart_of_accounts
-- ============================================

ALTER TABLE chart_of_accounts
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS sat_agrupador_code VARCHAR(20),
  ADD COLUMN IF NOT EXISTS sat_nivel SMALLINT,
  ADD COLUMN IF NOT EXISTS sat_naturaleza CHAR(1),
  ADD COLUMN IF NOT EXISTS materialized_path TEXT,
  ADD COLUMN IF NOT EXISTS is_postable BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS currency_code CHAR(3) NOT NULL DEFAULT 'MXN',
  ADD COLUMN IF NOT EXISTS requires_uuid BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS requires_third_party BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS effective_from DATE NOT NULL DEFAULT CURRENT_DATE,
  ADD COLUMN IF NOT EXISTS effective_to DATE,
  ADD COLUMN IF NOT EXISTS display_order INTEGER,
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- Add constraints
ALTER TABLE chart_of_accounts
  ADD CONSTRAINT valid_naturaleza CHECK (sat_naturaleza IN ('D', 'A') OR sat_naturaleza IS NULL),
  ADD CONSTRAINT valid_nivel CHECK (sat_nivel IS NULL OR sat_nivel BETWEEN 1 AND 6);

-- Update existing account_type column to use the new enum if it's varchar
-- The existing column is VARCHAR(50), so we add the enum-typed column separately
ALTER TABLE chart_of_accounts
  ADD COLUMN IF NOT EXISTS account_type_v2 account_type_enum;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_coa_org_path ON chart_of_accounts(organization_id, materialized_path) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_coa_org_parent ON chart_of_accounts(organization_id, parent_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_coa_agrupador ON chart_of_accounts(organization_id, sat_agrupador_code) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_coa_org_type ON chart_of_accounts(organization_id, account_type) WHERE deleted_at IS NULL AND is_active = TRUE;

-- ============================================
-- 3. ALTER journal_entries
-- ============================================

ALTER TABLE journal_entries
  ADD COLUMN IF NOT EXISTS fiscal_period_id UUID,
  ADD COLUMN IF NOT EXISTS poliza_type poliza_type_enum NOT NULL DEFAULT 'diario',
  ADD COLUMN IF NOT EXISTS status entry_status_enum NOT NULL DEFAULT 'draft',
  ADD COLUMN IF NOT EXISTS source_type source_type_enum,
  ADD COLUMN IF NOT EXISTS source_id UUID,
  ADD COLUMN IF NOT EXISTS source_uuid_cfdi VARCHAR(36),
  ADD COLUMN IF NOT EXISTS currency_code CHAR(3) NOT NULL DEFAULT 'MXN',
  ADD COLUMN IF NOT EXISTS exchange_rate NUMERIC(18, 6) NOT NULL DEFAULT 1.0,
  ADD COLUMN IF NOT EXISTS total_debit NUMERIC(18, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_credit NUMERIC(18, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reverses_entry_id UUID REFERENCES journal_entries(id),
  ADD COLUMN IF NOT EXISTS reversed_by_entry_id UUID REFERENCES journal_entries(id),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES users(id);

-- Indexes for journal_entries
CREATE INDEX IF NOT EXISTS idx_je_org_date ON journal_entries(organization_id, entry_date) WHERE status = 'posted';
CREATE INDEX IF NOT EXISTS idx_je_org_period ON journal_entries(organization_id, fiscal_period_id);
CREATE INDEX IF NOT EXISTS idx_je_source ON journal_entries(organization_id, source_type, source_id);
CREATE INDEX IF NOT EXISTS idx_je_uuid ON journal_entries(organization_id, source_uuid_cfdi) WHERE source_uuid_cfdi IS NOT NULL;

-- ============================================
-- 4. ALTER journal_entry_lines
-- ============================================

ALTER TABLE journal_entry_lines
  ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id),
  ADD COLUMN IF NOT EXISTS account_code VARCHAR(50),
  ADD COLUMN IF NOT EXISTS uuid_cfdi VARCHAR(36),
  ADD COLUMN IF NOT EXISTS rfc_third_party VARCHAR(13),
  ADD COLUMN IF NOT EXISTS monto_total_comp NUMERIC(18, 2),
  ADD COLUMN IF NOT EXISTS moneda_comp CHAR(3),
  ADD COLUMN IF NOT EXISTS tipo_cambio_comp NUMERIC(18, 6),
  ADD COLUMN IF NOT EXISTS payment_method VARCHAR(20),
  ADD COLUMN IF NOT EXISTS bank_account VARCHAR(50),
  ADD COLUMN IF NOT EXISTS bank_code VARCHAR(10),
  ADD COLUMN IF NOT EXISTS payment_reference VARCHAR(100),
  ADD COLUMN IF NOT EXISTS third_party_id UUID,
  ADD COLUMN IF NOT EXISTS third_party_type VARCHAR(20);

-- Rename line_order to line_number for consistency with spec
ALTER TABLE journal_entry_lines RENAME COLUMN line_order TO line_number;

-- Indexes for journal_entry_lines
CREATE INDEX IF NOT EXISTS idx_jel_org_account ON journal_entry_lines(organization_id, account_id);
CREATE INDEX IF NOT EXISTS idx_jel_uuid ON journal_entry_lines(uuid_cfdi) WHERE uuid_cfdi IS NOT NULL;

-- ============================================
-- 5. ALTER tax_periods → fiscal_periods concept
-- ============================================

-- We keep the table name tax_periods but add accounting-specific columns
ALTER TABLE tax_periods
  ADD COLUMN IF NOT EXISTS month SMALLINT,
  ADD COLUMN IF NOT EXISTS status period_status_enum NOT NULL DEFAULT 'open',
  ADD COLUMN IF NOT EXISTS filing_mode filing_mode_enum NOT NULL DEFAULT 'records_only',
  ADD COLUMN IF NOT EXISTS filing_mode_reason TEXT,
  ADD COLUMN IF NOT EXISTS filing_mode_set_by UUID REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS closed_by UUID REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS close_reason TEXT,
  ADD COLUMN IF NOT EXISTS balanza_filed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS catalog_filed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS catalog_last_changed_at TIMESTAMPTZ;

-- Populate month from period if needed
UPDATE tax_periods SET month = period WHERE month IS NULL;

-- ============================================
-- 6. CREATE account_code_aliases
-- ============================================

CREATE TABLE IF NOT EXISTS account_code_aliases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  account_id UUID NOT NULL REFERENCES chart_of_accounts(id) ON DELETE CASCADE,
  alias_code VARCHAR(100) NOT NULL,
  alias_source VARCHAR(50),
  is_primary_display BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT unique_alias_per_org UNIQUE (organization_id, alias_code)
);

CREATE INDEX IF NOT EXISTS idx_alias_account ON account_code_aliases(account_id);
CREATE INDEX IF NOT EXISTS idx_alias_lookup ON account_code_aliases(organization_id, alias_code);

-- ============================================
-- 7. CREATE exchange_rates
-- ============================================

CREATE TABLE IF NOT EXISTS exchange_rates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  currency_from CHAR(3) NOT NULL,
  currency_to CHAR(3) NOT NULL DEFAULT 'MXN',
  rate_date DATE NOT NULL,
  rate NUMERIC(18, 6) NOT NULL,
  source rate_source_enum NOT NULL,
  source_reference TEXT,
  organization_id UUID REFERENCES organizations(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_rate_lookup ON exchange_rates(currency_from, currency_to, rate_date DESC, source);
CREATE INDEX IF NOT EXISTS idx_rate_org ON exchange_rates(organization_id, rate_date) WHERE organization_id IS NOT NULL;

-- ============================================
-- 8. CREATE account_balance_snapshots
-- ============================================

CREATE TABLE IF NOT EXISTS account_balance_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  account_id UUID NOT NULL REFERENCES chart_of_accounts(id),
  fiscal_period_id UUID NOT NULL REFERENCES tax_periods(id),
  opening_balance NUMERIC(18, 2) NOT NULL DEFAULT 0,
  total_debit NUMERIC(18, 2) NOT NULL DEFAULT 0,
  total_credit NUMERIC(18, 2) NOT NULL DEFAULT 0,
  closing_balance NUMERIC(18, 2) NOT NULL DEFAULT 0,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_sealed BOOLEAN NOT NULL DEFAULT FALSE,
  sealed_at TIMESTAMPTZ,

  CONSTRAINT unique_snapshot UNIQUE (organization_id, account_id, fiscal_period_id)
);

CREATE INDEX IF NOT EXISTS idx_snapshot_org_period ON account_balance_snapshots(organization_id, fiscal_period_id);
CREATE INDEX IF NOT EXISTS idx_snapshot_account ON account_balance_snapshots(account_id);

-- ============================================
-- 9. CREATE posting_rules
-- ============================================

CREATE TABLE IF NOT EXISTS posting_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  rule_name VARCHAR(100) NOT NULL,
  trigger_event VARCHAR(50) NOT NULL,
  rule_definition JSONB NOT NULL,
  is_system BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  priority SMALLINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT unique_rule_name UNIQUE (organization_id, rule_name)
);

CREATE INDEX IF NOT EXISTS idx_posting_rules_trigger ON posting_rules(organization_id, trigger_event) WHERE is_active = TRUE;

-- ============================================
-- 10. RLS POLICIES
-- ============================================

ALTER TABLE account_code_aliases ENABLE ROW LEVEL SECURITY;
ALTER TABLE exchange_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE account_balance_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE posting_rules ENABLE ROW LEVEL SECURITY;

-- RLS policies use organization_id scoping
-- (In production, these would reference auth.uid() and organization membership)
