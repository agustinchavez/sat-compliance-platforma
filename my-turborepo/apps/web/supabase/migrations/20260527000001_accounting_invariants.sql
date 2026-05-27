-- ============================================
-- FIX-1.2: Database-level balance invariant and uniqueness constraints
-- ============================================
-- Adds CHECK constraints and UNIQUE indexes to enforce data integrity
-- at the DB level, providing a safety net against application bugs.

-- ============================================
-- Pre-flight: validate existing data
-- ============================================
DO $$
DECLARE
  unbalanced_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO unbalanced_count
  FROM journal_entries
  WHERE total_debit <> total_credit;

  IF unbalanced_count > 0 THEN
    RAISE EXCEPTION 'Cannot apply balance constraint: % unbalanced journal entries exist. Resolve them first.', unbalanced_count;
  END IF;
END $$;

-- ============================================
-- journal_entries: balance invariant + unique entry number
-- ============================================
ALTER TABLE journal_entries
  ADD CONSTRAINT je_balanced
    CHECK (total_debit = total_credit);

ALTER TABLE journal_entries
  ADD CONSTRAINT je_non_negative_totals
    CHECK (total_debit >= 0 AND total_credit >= 0);

-- Unique entry number per organization (nullable entry_number is OK for drafts
-- that haven't been numbered yet, but once set it must be unique)
CREATE UNIQUE INDEX IF NOT EXISTS idx_je_unique_entry_number
  ON journal_entries (organization_id, entry_number)
  WHERE entry_number IS NOT NULL;

-- ============================================
-- journal_entry_lines: debit XOR credit, both non-negative
-- ============================================
DO $$
DECLARE
  bad_line_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO bad_line_count
  FROM journal_entry_lines
  WHERE NOT (
    (debit > 0 AND credit = 0)
    OR (debit = 0 AND credit > 0)
  );

  IF bad_line_count > 0 THEN
    RAISE EXCEPTION 'Cannot apply line constraint: % invalid lines exist (must have exactly one of debit/credit > 0).', bad_line_count;
  END IF;
END $$;

ALTER TABLE journal_entry_lines
  ADD CONSTRAINT jel_debit_xor_credit
    CHECK (
      (debit > 0 AND credit = 0)
      OR (debit = 0 AND credit > 0)
    );

ALTER TABLE journal_entry_lines
  ADD CONSTRAINT jel_non_negative
    CHECK (debit >= 0 AND credit >= 0);

-- ============================================
-- chart_of_accounts: strict numeric code format
-- ============================================
DO $$
DECLARE
  bad_code_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO bad_code_count
  FROM chart_of_accounts
  WHERE code !~ '^[0-9]{4,12}$';

  IF bad_code_count > 0 THEN
    RAISE EXCEPTION 'Cannot apply code format constraint: % accounts have non-conforming codes. Migrate them to account_code_aliases first.', bad_code_count;
  END IF;
END $$;

ALTER TABLE chart_of_accounts
  ADD CONSTRAINT coa_valid_code_format
    CHECK (code ~ '^[0-9]{4,12}$');

-- ============================================
-- chart_of_accounts: naturaleza required for postable accounts
-- ============================================
ALTER TABLE chart_of_accounts
  DROP CONSTRAINT IF EXISTS valid_naturaleza;

ALTER TABLE chart_of_accounts
  ADD CONSTRAINT coa_naturaleza_required_if_postable
    CHECK (
      (is_postable = FALSE)
      OR (sat_naturaleza IN ('D', 'A'))
    );
