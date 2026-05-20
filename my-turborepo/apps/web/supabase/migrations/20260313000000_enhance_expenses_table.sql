-- ============================================
-- Component 20: Expense Service
-- ============================================
-- Enhances the existing expenses table with new columns needed for
-- deductibility assessment, OCR tracking, and CFDI validation.
--
-- The expenses table already exists from 20251105000000_initial_schema.sql.
-- This migration is additive only — uses ADD COLUMN IF NOT EXISTS throughout.
-- ============================================

-- 1. Add new columns for deductibility assessment
ALTER TABLE expenses
  ADD COLUMN IF NOT EXISTS deductibility_percent DECIMAL(5,2) DEFAULT 100.00
    CHECK (deductibility_percent >= 0 AND deductibility_percent <= 100),
  ADD COLUMN IF NOT EXISTS deductibility_notes TEXT,
  ADD COLUMN IF NOT EXISTS payment_method VARCHAR(2),     -- SAT c_FormaPago code
  ADD COLUMN IF NOT EXISTS ocr_confidence DECIMAL(4,3);   -- 0.000 - 1.000

-- 2. Add unique index for CFDI UUID lookups (duplicate detection)
-- Only applies to non-deleted expenses with a CFDI UUID
CREATE UNIQUE INDEX IF NOT EXISTS idx_expenses_cfdi_uuid
  ON expenses(organization_id, cfdi_uuid)
  WHERE cfdi_uuid IS NOT NULL AND deleted_at IS NULL;

-- 3. Add index for deductibility reports (Component 24 queries these frequently)
CREATE INDEX IF NOT EXISTS idx_expenses_deductible
  ON expenses(organization_id, is_deductible, expense_date)
  WHERE deleted_at IS NULL;

-- 4. Add index for category reporting
CREATE INDEX IF NOT EXISTS idx_expenses_category_date
  ON expenses(organization_id, category, expense_date)
  WHERE deleted_at IS NULL;

-- 5. Add index for date range queries (common filter)
CREATE INDEX IF NOT EXISTS idx_expenses_date_range
  ON expenses(organization_id, expense_date DESC)
  WHERE deleted_at IS NULL;

-- 6. Add index for vendor RFC lookups
CREATE INDEX IF NOT EXISTS idx_expenses_vendor_rfc
  ON expenses(organization_id, vendor_rfc)
  WHERE vendor_rfc IS NOT NULL AND deleted_at IS NULL;

-- 7. Add comments for Component 24 consumers
COMMENT ON COLUMN expenses.deductibility_percent IS
  'Percentage of expense that is ISR-deductible: 100 (full), 91.5 (meals/entertainment), 0 (non-deductible). Art. 25/27/28 LISR.';

COMMENT ON COLUMN expenses.deductibility_notes IS
  'Human-readable explanation (Spanish) of why the expense is deductible/non-deductible. E.g., "Pago en efectivo mayor a $2,000 MXN".';

COMMENT ON COLUMN expenses.payment_method IS
  'SAT c_FormaPago code: 01=cash, 03=transfer, 04=credit card, 28=debit card, etc. Used for bancarization rule enforcement.';

COMMENT ON COLUMN expenses.ocr_confidence IS
  'Overall OCR extraction confidence (0.000-1.000). Higher confidence = more reliable auto-fill.';

COMMENT ON COLUMN expenses.cfdi_uuid IS
  'CFDI UUID extracted from attached XML. Must be unique per organization (see idx_expenses_cfdi_uuid).';

-- 8. Update table comment
COMMENT ON TABLE expenses IS
  'Business expenses for ISR deduction tracking. Component 20 manages CRUD, OCR extraction, CFDI validation, and deductibility assessment per Art. 25/27/28 LISR.';
