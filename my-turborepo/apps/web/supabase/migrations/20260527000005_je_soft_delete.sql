-- FIX-4.1: Soft delete for journal entries
-- Adds deleted_at column to support soft deletion instead of hard deletion.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'journal_entries' AND column_name = 'deleted_at'
  ) THEN
    ALTER TABLE journal_entries ADD COLUMN deleted_at TIMESTAMPTZ;
  END IF;
END $$;

-- Index for efficient filtering of non-deleted entries
CREATE INDEX IF NOT EXISTS idx_je_not_deleted
  ON journal_entries (organization_id, fiscal_period_id)
  WHERE deleted_at IS NULL;
