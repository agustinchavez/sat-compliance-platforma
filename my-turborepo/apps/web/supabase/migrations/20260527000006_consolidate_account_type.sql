-- FIX-4.6: Consolidate account_type columns
-- Backfill account_type_v2 from account_type, then drop old VARCHAR column
-- and rename account_type_v2 → account_type.

BEGIN;

-- Step 1: Backfill account_type_v2 from the VARCHAR account_type where missing
UPDATE chart_of_accounts
SET account_type_v2 = account_type::account_type_enum
WHERE account_type_v2 IS NULL
  AND account_type IS NOT NULL;

-- Step 2: Drop the old index that references the VARCHAR column
DROP INDEX IF EXISTS idx_coa_org_type;

-- Step 3: Drop the old VARCHAR account_type column
ALTER TABLE chart_of_accounts DROP COLUMN IF EXISTS account_type;

-- Step 4: Rename account_type_v2 → account_type
ALTER TABLE chart_of_accounts RENAME COLUMN account_type_v2 TO account_type;

-- Step 5: Add NOT NULL constraint now that we have a single column
ALTER TABLE chart_of_accounts
  ALTER COLUMN account_type SET NOT NULL;

-- Step 6: Recreate the index on the renamed column
CREATE INDEX IF NOT EXISTS idx_coa_org_type
  ON chart_of_accounts(organization_id, account_type)
  WHERE deleted_at IS NULL AND is_active = TRUE;

COMMIT;
