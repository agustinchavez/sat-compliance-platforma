-- ============================================
-- FIX-1.3: Atomic entry numbering via counter table
-- ============================================
-- Replaces the SELECT-then-increment pattern in the app layer with an
-- atomic UPSERT-RETURNING pattern that eliminates race conditions.

-- ============================================
-- Counter table for atomic entry numbering
-- ============================================
CREATE TABLE IF NOT EXISTS journal_entry_counters (
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  year SMALLINT NOT NULL,
  last_sequence INTEGER NOT NULL DEFAULT 0,

  PRIMARY KEY (organization_id, year)
);

ALTER TABLE journal_entry_counters ENABLE ROW LEVEL SECURITY;

CREATE POLICY "counter_select_own_org"
  ON journal_entry_counters FOR SELECT
  TO authenticated
  USING (auth_user_is_org_member(organization_id));

CREATE POLICY "counter_insert_own_org"
  ON journal_entry_counters FOR INSERT
  TO authenticated
  WITH CHECK (auth_user_is_org_member(organization_id));

CREATE POLICY "counter_update_own_org"
  ON journal_entry_counters FOR UPDATE
  TO authenticated
  USING (auth_user_is_org_member(organization_id))
  WITH CHECK (auth_user_is_org_member(organization_id));

-- ============================================
-- Atomic next-number function
-- ============================================
CREATE OR REPLACE FUNCTION next_journal_entry_number(
  p_organization_id UUID,
  p_year SMALLINT
) RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_seq INTEGER;
  v_formatted TEXT;
BEGIN
  -- Permission check (defense in depth)
  IF NOT auth_user_is_org_member(p_organization_id) THEN
    RAISE EXCEPTION 'Permission denied: not a member of organization %', p_organization_id;
  END IF;

  -- Atomic UPSERT-RETURNING: PostgreSQL guarantees this is serialized
  -- by the primary key lock; no race possible.
  INSERT INTO journal_entry_counters (organization_id, year, last_sequence)
    VALUES (p_organization_id, p_year, 1)
    ON CONFLICT (organization_id, year)
    DO UPDATE SET last_sequence = journal_entry_counters.last_sequence + 1
    RETURNING last_sequence INTO v_seq;

  v_formatted := p_year::TEXT || '-' || LPAD(v_seq::TEXT, 6, '0');
  RETURN v_formatted;
END;
$$;

GRANT EXECUTE ON FUNCTION next_journal_entry_number(UUID, SMALLINT) TO authenticated;

-- ============================================
-- Backfill counter from existing entries
-- ============================================
INSERT INTO journal_entry_counters (organization_id, year, last_sequence)
SELECT
  organization_id,
  EXTRACT(YEAR FROM entry_date)::SMALLINT AS year,
  MAX(
    CAST(SPLIT_PART(entry_number, '-', 2) AS INTEGER)
  ) AS last_sequence
FROM journal_entries
WHERE entry_number ~ '^[0-9]{4}-[0-9]+$'
GROUP BY organization_id, EXTRACT(YEAR FROM entry_date)
ON CONFLICT (organization_id, year) DO NOTHING;
