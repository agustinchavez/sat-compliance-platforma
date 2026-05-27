# Accounting Subsystem — Fix Specification

**Source:** Code review of commit `761b50b` (accounting subsystem implementation)
**Target:** Production-ready Anexo 24 v1.3 compliance + multi-tenant safety
**Status:** Ready for implementation
**Version:** 1.0
**Date:** 2026-05-27

---

## How to use this document

Each fix is a self-contained specification: problem statement, affected files, optimal solution (with code), tests required, and acceptance criteria. Fixes are grouped into four waves by severity:

- **Wave 1** — Production blockers. Cannot deploy to any environment with real org data until done.
- **Wave 2** — SAT compliance blockers. XMLs will be rejected by Buzón Tributario without these.
- **Wave 3** — v1.1 spec gaps. Features the spec called for but were skipped or stubbed.
- **Wave 4** — Tech debt and quality improvements.

Each fix can be implemented independently within its wave. Fixes within a wave can run in parallel if you have multiple Claude Code sessions. Waves should be completed in order — a Wave 2 fix that depends on Wave 1 RLS will silently fail without it.

**Estimated total effort:** 12–16 development days, or 6–9 days with the agentic Claude Code loop.

---

## Wave 1 — Production Blockers (~2 days)

**Goal:** Deploy without data integrity or multi-tenant safety risks.

### FIX-1.1 — Add RLS policies on the four new accounting tables

**Severity:** P0 — Critical (data leak or total functional break)
**Files affected:**
- `supabase/migrations/20260527000000_accounting_rls_policies.sql` (NEW)

**Problem:**
The accounting migration enables RLS on `account_code_aliases`, `exchange_rates`, `account_balance_snapshots`, and `posting_rules` but creates zero policies (`supabase/migrations/20260501000000_accounting_subsystem.sql:231-237`). Depending on which Supabase role queries these tables:
- `service_role` (RLS bypassed): cross-tenant data leak — any user could read any org's data
- `authenticated` role (RLS strict): all reads return zero rows; subsystem appears broken

**Optimal solution:**

Create a new forward-only migration (do NOT modify the existing one — Supabase migrations are immutable once shipped). Follow the existing RLS pattern from your earlier components (Components 02/03) for consistency. The policies below assume your existing `is_org_member(org_id UUID)` helper function from the multi-tenant context manager — if it's named differently, adjust accordingly.

```sql
-- supabase/migrations/20260527000000_accounting_rls_policies.sql

-- ============================================
-- account_code_aliases: per-org strict isolation
-- ============================================
CREATE POLICY "alias_select_own_org"
  ON account_code_aliases FOR SELECT
  TO authenticated
  USING (is_org_member(organization_id));

CREATE POLICY "alias_insert_own_org"
  ON account_code_aliases FOR INSERT
  TO authenticated
  WITH CHECK (is_org_member(organization_id));

CREATE POLICY "alias_update_own_org"
  ON account_code_aliases FOR UPDATE
  TO authenticated
  USING (is_org_member(organization_id))
  WITH CHECK (is_org_member(organization_id));

CREATE POLICY "alias_delete_own_org"
  ON account_code_aliases FOR DELETE
  TO authenticated
  USING (is_org_member(organization_id));

-- ============================================
-- exchange_rates: shared (org_id NULL) readable by all; per-org strict
-- ============================================
-- Banxico/DOF rates are shared across all tenants. Per-org manual or CFDI
-- rates are org-scoped.
CREATE POLICY "rates_select_shared_or_own_org"
  ON exchange_rates FOR SELECT
  TO authenticated
  USING (
    organization_id IS NULL
    OR is_org_member(organization_id)
  );

-- Only service_role can insert shared (NULL org) rates via background jobs.
-- Authenticated users can only insert their own org's rates.
CREATE POLICY "rates_insert_own_org"
  ON exchange_rates FOR INSERT
  TO authenticated
  WITH CHECK (
    organization_id IS NOT NULL
    AND is_org_member(organization_id)
  );

CREATE POLICY "rates_update_own_org"
  ON exchange_rates FOR UPDATE
  TO authenticated
  USING (
    organization_id IS NOT NULL
    AND is_org_member(organization_id)
  )
  WITH CHECK (
    organization_id IS NOT NULL
    AND is_org_member(organization_id)
  );

CREATE POLICY "rates_delete_own_org"
  ON exchange_rates FOR DELETE
  TO authenticated
  USING (
    organization_id IS NOT NULL
    AND is_org_member(organization_id)
  );

-- ============================================
-- account_balance_snapshots: per-org strict isolation
-- ============================================
CREATE POLICY "snapshot_select_own_org"
  ON account_balance_snapshots FOR SELECT
  TO authenticated
  USING (is_org_member(organization_id));

-- Snapshots are written by the system (closePeriod). We allow authenticated
-- write but it's gated by org membership AND service-level permission checks.
CREATE POLICY "snapshot_insert_own_org"
  ON account_balance_snapshots FOR INSERT
  TO authenticated
  WITH CHECK (is_org_member(organization_id));

CREATE POLICY "snapshot_update_own_org"
  ON account_balance_snapshots FOR UPDATE
  TO authenticated
  USING (is_org_member(organization_id))
  WITH CHECK (is_org_member(organization_id));

CREATE POLICY "snapshot_delete_own_org"
  ON account_balance_snapshots FOR DELETE
  TO authenticated
  USING (is_org_member(organization_id));

-- ============================================
-- posting_rules: per-org strict, plus system-tier readable by all
-- ============================================
-- System-tier rules (is_system=TRUE) are templates readable by all orgs.
-- Org-tier rules are strictly scoped.
CREATE POLICY "rules_select_system_or_own_org"
  ON posting_rules FOR SELECT
  TO authenticated
  USING (
    is_system = TRUE
    OR is_org_member(organization_id)
  );

CREATE POLICY "rules_insert_own_org_non_system"
  ON posting_rules FOR INSERT
  TO authenticated
  WITH CHECK (
    is_system = FALSE
    AND is_org_member(organization_id)
  );

CREATE POLICY "rules_update_own_org_non_system"
  ON posting_rules FOR UPDATE
  TO authenticated
  USING (
    is_system = FALSE
    AND is_org_member(organization_id)
  )
  WITH CHECK (
    is_system = FALSE
    AND is_org_member(organization_id)
  );

CREATE POLICY "rules_delete_own_org_non_system"
  ON posting_rules FOR DELETE
  TO authenticated
  USING (
    is_system = FALSE
    AND is_org_member(organization_id)
  );
```

**Tests required:**

Add `lib/accounting/__tests__/rls-isolation.test.ts`:

```typescript
describe('Accounting RLS isolation', () => {
  it('cannot read another orgs balance snapshots', async () => {
    const { dataAsOrgA } = await querySnapshotsAs(orgA, snapshotForOrgB);
    expect(dataAsOrgA).toEqual([]);
  });

  it('cannot read another orgs posting rules', async () => {
    const result = await queryPostingRulesAs(orgA, { orgFilter: orgB });
    expect(result.filter(r => !r.isSystem)).toEqual([]);
  });

  it('can read system-tier posting rules', async () => {
    const result = await queryPostingRulesAs(orgA, { systemOnly: true });
    expect(result.length).toBeGreaterThan(0);
  });

  it('can read shared exchange rates (org_id NULL)', async () => {
    const result = await queryExchangeRatesAs(orgA, { sharedOnly: true });
    expect(result.length).toBeGreaterThan(0);
  });

  it('cannot read another orgs manual exchange rates', async () => {
    const result = await queryExchangeRatesAs(orgA, { orgFilter: orgB });
    expect(result).toEqual([]);
  });

  it('cannot insert into another orgs aliases', async () => {
    await expect(
      insertAliasAs(orgA, { organizationId: orgB, ... })
    ).rejects.toThrow(/violates row-level security/);
  });
});
```

**Acceptance criteria:**
- All four tables have SELECT/INSERT/UPDATE/DELETE policies
- RLS isolation test suite passes with 6+ tests covering positive and negative cases
- `SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND tablename IN ('account_code_aliases', 'exchange_rates', 'account_balance_snapshots', 'posting_rules')` returns 16+ rows
- A manual smoke test from a non-member user confirms zero rows returned for foreign org data

**Effort:** 0.5 day

---

### FIX-1.2 — Add database-level balance invariant and uniqueness constraints

**Severity:** P0 — Critical (data corruption risk)
**Files affected:**
- `supabase/migrations/20260527000001_accounting_invariants.sql` (NEW)

**Problem:**
The spec required DB-level enforcement of:
1. `journal_entries.total_debit = total_credit` (CHECK constraint)
2. `journal_entry_lines`: exactly one of `(debit > 0)` or `(credit > 0)`, both non-negative
3. `journal_entries.entry_number` uniqueness per organization

None exist. A single app-layer bug = corrupted books, with no DB-level safety net.

**Optimal solution:**

```sql
-- supabase/migrations/20260527000001_accounting_invariants.sql

-- ============================================
-- Pre-flight: validate existing data
-- ============================================
-- If any existing journal_entries are unbalanced, fail loudly before
-- adding the constraint. Production data must be clean first.
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

-- Also enforce non-negative totals to catch sign-flip bugs
ALTER TABLE journal_entries
  ADD CONSTRAINT je_non_negative_totals
    CHECK (total_debit >= 0 AND total_credit >= 0);

-- Unique entry number per organization
-- (FIX-1.3 will introduce atomic numbering via Postgres sequence;
-- this constraint protects against any other path that bypasses it)
ALTER TABLE journal_entries
  ADD CONSTRAINT je_unique_entry_number
    UNIQUE (organization_id, entry_number);

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
-- Backfill any non-conforming codes first (should be none if seeded
-- properly, but be defensive)
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
-- chart_of_accounts: tighten naturaleza requirement
-- ============================================
-- For postable accounts, naturaleza must be set.
-- We use a partial unique-style constraint via CHECK.
ALTER TABLE chart_of_accounts
  DROP CONSTRAINT IF EXISTS valid_naturaleza;

ALTER TABLE chart_of_accounts
  ADD CONSTRAINT coa_naturaleza_required_if_postable
    CHECK (
      (is_postable = FALSE)
      OR (sat_naturaleza IN ('D', 'A'))
    );
```

**Tests required:**

Add `lib/accounting/__tests__/db-invariants.test.ts`:

```typescript
describe('Database invariants', () => {
  it('rejects unbalanced journal entries', async () => {
    await expect(
      supabase.from('journal_entries').insert({
        organization_id: testOrg.id,
        entry_number: 'TEST-001',
        fiscal_period_id: testPeriod.id,
        entry_date: '2026-01-15',
        poliza_type: 'diario',
        description: 'Test',
        total_debit: 100,
        total_credit: 99,  // unbalanced
        created_by: testUser.id,
      })
    ).rejects.toThrow(/je_balanced/);
  });

  it('rejects lines with both debit and credit > 0', async () => {
    await expect(
      insertLine({ debit: 50, credit: 50 })
    ).rejects.toThrow(/jel_debit_xor_credit/);
  });

  it('rejects negative debit or credit', async () => {
    await expect(insertLine({ debit: -10, credit: 0 })).rejects.toThrow();
    await expect(insertLine({ debit: 0, credit: -10 })).rejects.toThrow();
  });

  it('rejects duplicate entry numbers within an org', async () => {
    await createEntry({ entryNumber: '2026-000001' });
    await expect(
      createEntry({ entryNumber: '2026-000001' })
    ).rejects.toThrow(/je_unique_entry_number/);
  });

  it('allows same entry number across different orgs', async () => {
    await createEntryForOrg(orgA, { entryNumber: '2026-000001' });
    await expect(
      createEntryForOrg(orgB, { entryNumber: '2026-000001' })
    ).resolves.not.toThrow();
  });

  it('rejects non-numeric account codes', async () => {
    await expect(
      insertAccount({ code: 'ABC-123' })
    ).rejects.toThrow(/coa_valid_code_format/);
  });

  it('rejects postable accounts without naturaleza', async () => {
    await expect(
      insertAccount({ isPostable: true, satNaturaleza: null })
    ).rejects.toThrow(/coa_naturaleza_required_if_postable/);
  });
});
```

**Acceptance criteria:**
- Migration applies cleanly on fresh DB and on a DB with existing valid data
- Migration fails gracefully with informative error if pre-existing data violates invariants
- All 7 invariant tests pass
- A direct DB insert (bypassing the service layer) cannot violate any of these invariants

**Effort:** 0.5 day

---

### FIX-1.3 — Atomic entry numbering via Postgres sequences

**Severity:** P0 — Critical (race condition causing duplicate or skipped numbers)
**Files affected:**
- `supabase/migrations/20260527000002_entry_numbering.sql` (NEW)
- `lib/accounting/journal-entries/repository.ts` (modify)
- `lib/accounting/journal-entries/__tests__/numbering-race.test.ts` (NEW)

**Problem:**
`getNextEntryNumber` (repository.ts:23-47) does a read-only SELECT for max number, increments in JS, then the caller passes it to a separate INSERT. Two concurrent invoice stampings get the same number. The UNIQUE constraint from FIX-1.2 catches the collision but surfaces as a 500 error to the caller rather than a graceful retry.

**Optimal solution:**

Use a Postgres function backed by a per-org-per-year counter table with an atomic UPSERT-RETURNING pattern. This is faster than `CREATE SEQUENCE` per org (which has issues at scale — you don't want millions of sequences) and works seamlessly with multi-tenant RLS.

```sql
-- supabase/migrations/20260527000002_entry_numbering.sql

-- ============================================
-- Counter table for atomic entry numbering
-- ============================================
CREATE TABLE journal_entry_counters (
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  year SMALLINT NOT NULL,
  last_sequence INTEGER NOT NULL DEFAULT 0,

  PRIMARY KEY (organization_id, year)
);

-- RLS on counter table
ALTER TABLE journal_entry_counters ENABLE ROW LEVEL SECURITY;

CREATE POLICY "counter_select_own_org"
  ON journal_entry_counters FOR SELECT
  TO authenticated
  USING (is_org_member(organization_id));

CREATE POLICY "counter_modify_own_org"
  ON journal_entry_counters FOR ALL
  TO authenticated
  USING (is_org_member(organization_id))
  WITH CHECK (is_org_member(organization_id));

-- ============================================
-- Atomic next-number function
-- ============================================
CREATE OR REPLACE FUNCTION next_journal_entry_number(
  p_organization_id UUID,
  p_year SMALLINT
) RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER  -- Runs with the privileges of the function owner
SET search_path = public
AS $$
DECLARE
  v_seq INTEGER;
  v_formatted TEXT;
BEGIN
  -- Caller must be a member of the org (defense in depth)
  IF NOT is_org_member(p_organization_id) THEN
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
-- Backfill counter from existing entries (for orgs with data)
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
```

**Repository changes:**

Replace the current `getNextEntryNumber` in `repository.ts`:

```typescript
/**
 * Atomically allocates the next entry number for an organization in a given year.
 * Uses a Postgres function backed by a counter table — race-condition-free.
 */
export async function getNextEntryNumber(
  organizationId: string,
  year: number,
  supabase: SupabaseClient
): Promise<string> {
  const { data, error } = await supabase
    .rpc('next_journal_entry_number', {
      p_organization_id: organizationId,
      p_year: year,
    });

  if (error) {
    throw new AccountingError('VALIDATION_ERROR', `No se pudo generar número de póliza: ${error.message}`);
  }
  if (!data) {
    throw new AccountingError('VALIDATION_ERROR', 'Función de numeración no retornó valor');
  }
  return data as string;
}
```

**Tests required:**

```typescript
// lib/accounting/journal-entries/__tests__/numbering-race.test.ts
describe('Entry numbering race conditions', () => {
  it('generates unique numbers under concurrent load', async () => {
    // Fire 50 concurrent allocation requests
    const promises = Array.from({ length: 50 }, () =>
      getNextEntryNumber(testOrg.id, 2026, supabase)
    );
    const numbers = await Promise.all(promises);

    // All must be unique
    expect(new Set(numbers).size).toBe(50);

    // All must follow format YYYY-NNNNNN
    numbers.forEach(n => expect(n).toMatch(/^2026-\d{6}$/));

    // Sequences should be contiguous (no gaps)
    const sequences = numbers
      .map(n => parseInt(n.split('-')[1], 10))
      .sort((a, b) => a - b);
    for (let i = 1; i < sequences.length; i++) {
      expect(sequences[i] - sequences[i - 1]).toBe(1);
    }
  });

  it('uses separate sequences per org', async () => {
    const numA = await getNextEntryNumber(orgA.id, 2026, supabase);
    const numB = await getNextEntryNumber(orgB.id, 2026, supabase);
    expect(numA).toBe(numB);  // Both should be 2026-000001
  });

  it('uses separate sequences per year', async () => {
    const num2025 = await getNextEntryNumber(testOrg.id, 2025, supabase);
    const num2026 = await getNextEntryNumber(testOrg.id, 2026, supabase);
    expect(num2025).toBe('2025-000001');
    expect(num2026).toBe('2026-000001');
  });

  it('rejects calls from non-members', async () => {
    await expect(
      getNextEntryNumberAs(nonMember, otherOrg.id, 2026)
    ).rejects.toThrow(/Permission denied/);
  });
});
```

**Acceptance criteria:**
- 50 concurrent calls produce 50 unique, contiguous numbers
- Per-org and per-year isolation verified
- RLS check rejects non-member callers
- Backfill on existing journal entries correctly initializes counters

**Effort:** 0.5 day

---

### FIX-1.4 — Transactional journal entry insertion via RPC

**Severity:** P0 — Critical (orphaned entry headers on partial failure)
**Files affected:**
- `supabase/migrations/20260527000003_atomic_entry_insert.sql` (NEW)
- `lib/accounting/journal-entries/repository.ts` (modify `insertJournalEntry`)
- `lib/accounting/journal-entries/service.ts` (modify `createDraftEntry` to use atomic flow)

**Problem:**
`insertJournalEntry` does two separate INSERTs (header, then lines). If the lines INSERT fails (RLS violation, constraint violation, network blip), the header is orphaned with no rollback. Supabase JS client doesn't expose transactions. Need a Postgres RPC function.

**Optimal solution:**

Combine entry number allocation, header insert, and lines insert into one RPC function. This is faster than separate calls (one round trip) and atomic by virtue of being one statement context.

```sql
-- supabase/migrations/20260527000003_atomic_entry_insert.sql

CREATE OR REPLACE FUNCTION insert_journal_entry_atomic(
  p_organization_id UUID,
  p_entry_data JSONB,
  p_lines JSONB
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_entry_id UUID;
  v_entry_number TEXT;
  v_year SMALLINT;
  v_entry_row JSONB;
  v_lines_rows JSONB;
  v_total_debit NUMERIC(18,2);
  v_total_credit NUMERIC(18,2);
BEGIN
  -- Permission check
  IF NOT is_org_member(p_organization_id) THEN
    RAISE EXCEPTION 'Permission denied: not a member of organization %', p_organization_id;
  END IF;

  -- Compute totals from the lines payload (defense-in-depth: don't trust caller)
  SELECT
    COALESCE(SUM((line->>'debit')::NUMERIC), 0),
    COALESCE(SUM((line->>'credit')::NUMERIC), 0)
  INTO v_total_debit, v_total_credit
  FROM jsonb_array_elements(p_lines) AS line;

  IF v_total_debit <> v_total_credit THEN
    RAISE EXCEPTION 'Unbalanced entry: debit=%, credit=%', v_total_debit, v_total_credit;
  END IF;

  -- Allocate entry number atomically
  v_year := EXTRACT(YEAR FROM (p_entry_data->>'entry_date')::DATE)::SMALLINT;
  v_entry_number := next_journal_entry_number(p_organization_id, v_year);

  -- Insert header
  INSERT INTO journal_entries (
    organization_id, entry_number, fiscal_period_id, entry_date,
    poliza_type, description, status,
    source_type, source_id, source_uuid_cfdi,
    currency_code, exchange_rate,
    total_debit, total_credit,
    created_by
  ) VALUES (
    p_organization_id,
    v_entry_number,
    (p_entry_data->>'fiscal_period_id')::UUID,
    (p_entry_data->>'entry_date')::DATE,
    (p_entry_data->>'poliza_type')::poliza_type_enum,
    p_entry_data->>'description',
    COALESCE((p_entry_data->>'status')::entry_status_enum, 'draft'),
    NULLIF(p_entry_data->>'source_type', '')::source_type_enum,
    NULLIF(p_entry_data->>'source_id', '')::UUID,
    NULLIF(p_entry_data->>'source_uuid_cfdi', ''),
    COALESCE(p_entry_data->>'currency_code', 'MXN'),
    COALESCE((p_entry_data->>'exchange_rate')::NUMERIC, 1.0),
    v_total_debit,
    v_total_credit,
    (p_entry_data->>'created_by')::UUID
  ) RETURNING id INTO v_entry_id;

  -- Insert lines
  INSERT INTO journal_entry_lines (
    organization_id, journal_entry_id, line_number,
    account_id, account_code, debit, credit, description,
    uuid_cfdi, rfc_third_party, monto_total_comp, moneda_comp, tipo_cambio_comp,
    payment_method, bank_account, bank_code, payment_reference,
    third_party_id, third_party_type
  )
  SELECT
    p_organization_id,
    v_entry_id,
    (line->>'line_number')::SMALLINT,
    (line->>'account_id')::UUID,
    line->>'account_code',
    COALESCE((line->>'debit')::NUMERIC, 0),
    COALESCE((line->>'credit')::NUMERIC, 0),
    line->>'description',
    NULLIF(line->>'uuid_cfdi', ''),
    NULLIF(line->>'rfc_third_party', ''),
    NULLIF((line->>'monto_total_comp')::TEXT, '')::NUMERIC,
    NULLIF(line->>'moneda_comp', ''),
    NULLIF((line->>'tipo_cambio_comp')::TEXT, '')::NUMERIC,
    NULLIF(line->>'payment_method', ''),
    NULLIF(line->>'bank_account', ''),
    NULLIF(line->>'bank_code', ''),
    NULLIF(line->>'payment_reference', ''),
    NULLIF(line->>'third_party_id', '')::UUID,
    NULLIF(line->>'third_party_type', '')
  FROM jsonb_array_elements(p_lines) AS line;

  -- Return the complete entry with lines as JSONB
  SELECT jsonb_build_object(
    'entry', to_jsonb(je.*),
    'lines', COALESCE(jsonb_agg(to_jsonb(jel.*) ORDER BY jel.line_number), '[]'::jsonb)
  ) INTO v_entry_row
  FROM journal_entries je
  LEFT JOIN journal_entry_lines jel ON jel.journal_entry_id = je.id
  WHERE je.id = v_entry_id
  GROUP BY je.id;

  RETURN v_entry_row;
END;
$$;

GRANT EXECUTE ON FUNCTION insert_journal_entry_atomic(UUID, JSONB, JSONB) TO authenticated;
```

**Repository changes:**

Replace `insertJournalEntry` in `repository.ts`:

```typescript
/**
 * Atomically creates a journal entry with its lines.
 * Uses an RPC function to guarantee transactional safety.
 * Entry number is allocated atomically inside the function (do NOT pre-allocate).
 */
export async function insertJournalEntry(
  organizationId: string,
  data: Omit<EntryInsertData, 'entry_number'>,  // entry_number removed; allocated server-side
  lines: LineInsertData[],
  supabase: SupabaseClient
): Promise<JournalEntry> {
  const { data: result, error } = await supabase.rpc('insert_journal_entry_atomic', {
    p_organization_id: organizationId,
    p_entry_data: data,
    p_lines: lines,
  });

  if (error) {
    throw new AccountingError(
      'VALIDATION_ERROR',
      `Error al crear póliza: ${error.message}`
    );
  }

  const entryRow = result.entry;
  const lineRows = result.lines || [];
  const mappedLines = lineRows.map(mapRowToJournalEntryLine);
  return mapRowToJournalEntry(entryRow, mappedLines);
}
```

**Service changes:**

Remove the now-unused pre-allocation step in `createDraftEntry`:

```typescript
// REMOVE this block from createDraftEntry:
//   const entryNumber = await repo.getNextEntryNumber(organizationId, year, supabase);
//
// Then remove entry_number from the insert payload — the RPC allocates it.
```

**Tests required:**

```typescript
// lib/accounting/journal-entries/__tests__/atomic-insert.test.ts
describe('Atomic journal entry insertion', () => {
  it('rolls back header insert when lines fail', async () => {
    // Force a lines failure by referencing a non-existent account_id
    await expect(
      repo.insertJournalEntry(
        testOrg.id,
        validEntryData,
        [{ ...validLine, account_id: '00000000-0000-0000-0000-000000000000' }],
        supabase
      )
    ).rejects.toThrow();

    // Confirm no orphan header was created
    const { count } = await supabase
      .from('journal_entries')
      .select('*', { count: 'exact', head: true })
      .eq('description', validEntryData.description);
    expect(count).toBe(0);
  });

  it('rejects unbalanced entries inside the function', async () => {
    await expect(
      repo.insertJournalEntry(
        testOrg.id,
        validEntryData,
        [
          { ...validLine, debit: 100, credit: 0 },
          { ...validLine, line_number: 2, debit: 0, credit: 99 },  // unbalanced
        ],
        supabase
      )
    ).rejects.toThrow(/Unbalanced/);
  });

  it('returns complete entry with lines on success', async () => {
    const entry = await repo.insertJournalEntry(
      testOrg.id,
      validEntryData,
      validLines,
      supabase
    );
    expect(entry.id).toBeDefined();
    expect(entry.lines).toHaveLength(validLines.length);
    expect(entry.entryNumber).toMatch(/^2026-\d{6}$/);
  });
});
```

**Acceptance criteria:**
- Failed lines insert leaves no orphan headers
- All journal entry insertions go through the RPC; no direct table INSERTs anywhere in the service
- Entry number is always allocated server-side
- All existing 154 tests continue to pass

**Effort:** 0.5 day

---

## Wave 2 — SAT Compliance Blockers (~3 days)

**Goal:** XMLs that pass Buzón Tributario validation.

### FIX-2.1 — Fix Pólizas XML required attributes and typos

**Severity:** P0 — Compliance (XML will be rejected by SAT)
**Files affected:**
- `lib/accounting/sat-xml/journal-xml.ts` (rewrite Cheque/Transferencia/CompNal blocks)
- `lib/accounting/sat-xml/shared.ts` (helper for empty-attr suppression)
- `lib/accounting/types.ts` (extend `JournalEntryLine` with missing payment fields)
- `supabase/migrations/20260527000004_payment_node_fields.sql` (NEW — add columns)
- `lib/accounting/sat-xml/__tests__/journal-xml.test.ts` (rewrite assertions)

**Problem (from code review):**

Per Anexo 24 v1.3, the Pólizas XML has multiple guaranteed failures:

| Issue | Location | Effect |
|---|---|---|
| Typo `BanEmworCheworNal` | journal-xml.ts:109 | XSD rejects unknown attribute |
| Cheque missing required `CtaOri`, `Fecha`, `Benef`, `RFC` | journal-xml.ts:106-113 | XSD rejects |
| Transferencia missing required `CtaDest`, `BancoDestNal`, `Fecha`, `Benef`, `RFC` | journal-xml.ts:96-103 | XSD rejects |
| `MontoTotal` on CompNal is conditional | journal-xml.ts:79-80 | XSD rejects when omitted |
| No conditional `NumOrden`/`NumTramite` validation | journal-xml.ts:50-51 | XSD rejects per TipoSolicitud |
| `CodAgrup=""` when empty | catalog-xml.ts:46 | XSD rejects empty value |
| `DesCta` uses line description instead of account name | journal-xml.ts:68 | Semantic mismatch |

**Optimal solution:**

**Step 1 — Extend the line schema to capture all payment-node fields.**

```sql
-- supabase/migrations/20260527000004_payment_node_fields.sql

ALTER TABLE journal_entry_lines
  ADD COLUMN IF NOT EXISTS payment_date DATE,
  ADD COLUMN IF NOT EXISTS payment_beneficiary VARCHAR(300),
  ADD COLUMN IF NOT EXISTS payment_beneficiary_rfc VARCHAR(13),
  ADD COLUMN IF NOT EXISTS dest_bank_account VARCHAR(50),
  ADD COLUMN IF NOT EXISTS dest_bank_code VARCHAR(10);

COMMENT ON COLUMN journal_entry_lines.payment_date IS 'Fecha del movimiento de pago (Cheque/Transferencia). Defaults to entry_date in app.';
COMMENT ON COLUMN journal_entry_lines.payment_beneficiary IS 'Anexo 24 Benef attribute on Cheque/Transferencia.';
COMMENT ON COLUMN journal_entry_lines.payment_beneficiary_rfc IS 'Anexo 24 RFC attribute on Cheque/Transferencia.';
COMMENT ON COLUMN journal_entry_lines.dest_bank_account IS 'Anexo 24 CtaDest for transferencias.';
COMMENT ON COLUMN journal_entry_lines.dest_bank_code IS 'Anexo 24 BancoDestNal for transferencias.';
```

**Step 2 — Update `types.ts`:**

```typescript
// In JournalEntryLine interface, add:
paymentDate?: string;           // ISO date
paymentBeneficiary?: string;    // Benef
paymentBeneficiaryRfc?: string; // RFC of payee
destBankAccount?: string;       // CtaDest
destBankCode?: string;          // BancoDestNal
```

**Step 3 — Update `shared.ts` to suppress empty attributes:**

```typescript
/**
 * Creates an XML attribute string. Returns empty when value is undefined,
 * null, OR an empty string (the third case is the v2 fix — empty strings
 * are valid JS values but invalid XSD attribute values).
 */
export function attr(name: string, value: string | number | undefined | null): string {
  if (value === undefined || value === null) return '';
  const str = String(value).trim();
  if (str === '') return '';
  return ` ${name}="${escapeXml(str)}"`;
}

/**
 * Like attr() but throws if value is missing — for genuinely required attributes.
 */
export function requiredAttr(name: string, value: string | number | undefined | null, context: string): string {
  if (value === undefined || value === null) {
    throw new Error(`Anexo 24 violation: required attribute ${name} is missing in ${context}`);
  }
  const str = String(value).trim();
  if (str === '') {
    throw new Error(`Anexo 24 violation: required attribute ${name} is empty in ${context}`);
  }
  return ` ${name}="${escapeXml(str)}"`;
}
```

**Step 4 — Rewrite the payment-node blocks in `journal-xml.ts`:**

```typescript
// Replace the entire Transaccion-level rendering inside generateJournalXml.
// Each helper handles its own required-attribute validation.

function renderCompNal(line: JournalEntryLine): string {
  if (!line.uuidCfdi) return '';

  // Per Anexo 24 v1.3: UUID_CFDI required; MontoTotal required when CompNal present
  const ctx = `CompNal for line ${line.lineNumber}`;
  let xml = '      <PLZ:CompNal';
  xml += requiredAttr('UUID_CFDI', line.uuidCfdi, ctx);
  xml += requiredAttr('MontoTotal', toSatDecimal(line.montoTotalComp ?? line.debit ?? line.credit), ctx);
  xml += attr('RFC', line.rfcThirdParty);  // Optional but recommended
  xml += attr('Moneda', line.monedaComp);
  if (line.tipoCambioComp !== undefined) {
    xml += attr('TipCamb', toSatDecimal(line.tipoCambioComp));
  }
  xml += '/>';
  return xml;
}

function renderCheque(line: JournalEntryLine, fallbackDate: string): string {
  if (line.paymentMethod !== 'cheque' || !line.paymentReference) return '';

  const monto = line.debit > 0 ? line.debit : line.credit;
  const ctx = `Cheque for line ${line.lineNumber}`;

  let xml = '      <PLZ:Cheque';
  xml += requiredAttr('Num', line.paymentReference, ctx);
  xml += requiredAttr('BanEmisNal', line.bankCode, ctx);  // FIXED typo
  xml += requiredAttr('CtaOri', line.bankAccount, ctx);
  xml += requiredAttr('Fecha', line.paymentDate ?? fallbackDate, ctx);
  xml += requiredAttr('Benef', line.paymentBeneficiary, ctx);
  xml += requiredAttr('RFC', line.paymentBeneficiaryRfc, ctx);
  xml += requiredAttr('Monto', toSatDecimal(monto), ctx);
  xml += '/>';
  return xml;
}

function renderTransferencia(line: JournalEntryLine, fallbackDate: string): string {
  if (line.paymentMethod !== 'transferencia' || !line.bankAccount) return '';

  const monto = line.debit > 0 ? line.debit : line.credit;
  const ctx = `Transferencia for line ${line.lineNumber}`;

  let xml = '      <PLZ:Transferencia';
  xml += requiredAttr('CtaOri', line.bankAccount, ctx);
  xml += requiredAttr('BancoOriNal', line.bankCode, ctx);
  xml += requiredAttr('CtaDest', line.destBankAccount, ctx);
  xml += requiredAttr('BancoDestNal', line.destBankCode, ctx);
  xml += requiredAttr('Fecha', line.paymentDate ?? fallbackDate, ctx);
  xml += requiredAttr('Benef', line.paymentBeneficiary, ctx);
  xml += requiredAttr('RFC', line.paymentBeneficiaryRfc, ctx);
  xml += requiredAttr('Monto', toSatDecimal(monto), ctx);
  xml += '/>';
  return xml;
}

// In the main generator, validate TipoSolicitud conditional requirements:
function validateTipoSolicitud(tipoSolicitud: string, numOrden?: string, numTramite?: string): void {
  if ((tipoSolicitud === 'AF' || tipoSolicitud === 'FC') && !numOrden) {
    throw new Error(`Anexo 24: NumOrden is required when TipoSolicitud='${tipoSolicitud}'`);
  }
  if ((tipoSolicitud === 'DE' || tipoSolicitud === 'CO') && !numTramite) {
    throw new Error(`Anexo 24: NumTramite is required when TipoSolicitud='${tipoSolicitud}'`);
  }
}

// In the Transaccion rendering, fix DesCta to use the account's name:
// Need to receive an accountLookup map<account_id, accountName>
function renderTransaccion(line: JournalEntryLine, entry: JournalEntry, accountNames: Map<string, string>): string {
  const accountName = accountNames.get(line.accountId) ?? line.accountCode;
  const ctx = `Transaccion ${line.lineNumber} of entry ${entry.entryNumber}`;

  let xml = '    <PLZ:Transaccion';
  xml += requiredAttr('NumCta', line.accountCode, ctx);
  xml += attr('DesCta', accountName);                          // FIXED: use account name
  xml += requiredAttr('Concepto', line.description ?? entry.description, ctx);
  xml += requiredAttr('Debe', toSatDecimal(line.debit), ctx);
  xml += requiredAttr('Haber', toSatDecimal(line.credit), ctx);
  xml += '>';

  const parts = [xml];
  const compNal = renderCompNal(line);
  if (compNal) parts.push(compNal);
  const cheque = renderCheque(line, entry.entryDate);
  if (cheque) parts.push(cheque);
  const transferencia = renderTransferencia(line, entry.entryDate);
  if (transferencia) parts.push(transferencia);
  parts.push('    </PLZ:Transaccion>');

  return parts.join('\n');
}
```

**Step 5 — `generateJournalXml` signature update:**

The function now needs an account-name lookup. Caller (in `reports/service.ts`) should pre-fetch account names once and pass them in:

```typescript
export interface JournalXmlInput {
  rfc: string;
  month: number;
  year: number;
  tipoSolicitud: 'AF' | 'FC' | 'DE' | 'CO';
  numOrden?: string;
  numTramite?: string;
  entries: JournalEntry[];
  accountNames: Map<string, string>;  // NEW: account_id → name lookup
}
```

**Step 6 — Fix catalog-xml.ts empty-CodAgrup emission:**

```typescript
// In catalog-xml.ts, replace:
//   accountLine += attr('CodAgrup', account.satAgrupadorCode ?? '');
// With:
if (account.satAgrupadorCode && account.satAgrupadorCode.trim() !== '') {
  accountLine += attr('CodAgrup', account.satAgrupadorCode);
} else if (account.satNivel <= 2) {
  // Per Anexo 24: CodAgrup is required for cuentas de mayor (Nivel 1) and
  // subcuentas de primer nivel (Nivel 2). Throwing prevents shipping bad XML.
  throw new Error(`Anexo 24: account ${account.code} (Nivel ${account.satNivel}) requires CodAgrup`);
}
// For Nivel >= 3 accounts, CodAgrup is optional per spec — omit attribute entirely.
```

**Tests required:**

Replace contains-style tests with XSD-validation tests (see FIX-2.3) plus explicit attribute completeness:

```typescript
describe('Pólizas XML attribute completeness', () => {
  it('emits all required Cheque attributes', () => {
    const entry = makeEntry({
      lines: [makeLine({
        paymentMethod: 'cheque',
        paymentReference: '00012345',
        bankCode: '012',
        bankAccount: '0012345678',
        paymentDate: '2026-01-15',
        paymentBeneficiary: 'Proveedor SA de CV',
        paymentBeneficiaryRfc: 'PSA920101ABC',
      })],
    });
    const xml = generateJournalXml({ /* ... */, entries: [entry], accountNames });

    expect(xml).toContain('Num="00012345"');
    expect(xml).toContain('BanEmisNal="012"');
    expect(xml).toContain('CtaOri="0012345678"');
    expect(xml).toContain('Fecha="2026-01-15"');
    expect(xml).toContain('Benef="Proveedor SA de CV"');
    expect(xml).toContain('RFC="PSA920101ABC"');
    expect(xml).toContain('Monto=');
    expect(xml).not.toContain('BanEmworCheworNal');  // regression guard
  });

  it('throws on Cheque missing required Benef', () => {
    const entry = makeEntry({
      lines: [makeLine({
        paymentMethod: 'cheque',
        paymentReference: '00012345',
        bankCode: '012',
        bankAccount: '0012345678',
        // paymentBeneficiary missing
      })],
    });
    expect(() => generateJournalXml({ /* ... */, entries: [entry], accountNames }))
      .toThrow(/required attribute Benef/);
  });

  it('throws on NumOrden missing when TipoSolicitud=AF', () => {
    expect(() => generateJournalXml({
      tipoSolicitud: 'AF',
      // numOrden missing
      entries: [], accountNames: new Map(), /* ... */
    })).toThrow(/NumOrden is required/);
  });

  it('uses account name for DesCta, not line description', () => {
    const accountNames = new Map([['acc-1', 'Caja General']]);
    const entry = makeEntry({
      lines: [makeLine({
        accountId: 'acc-1',
        accountCode: '1101001',
        description: 'Depósito de cliente Acme',  // line description
      })],
    });
    const xml = generateJournalXml({ entries: [entry], accountNames, /* ... */ });
    expect(xml).toContain('DesCta="Caja General"');
    expect(xml).not.toContain('DesCta="Depósito de cliente Acme"');
  });
});
```

**Acceptance criteria:**
- No `BanEmworCheworNal` substring anywhere in the codebase (grep test)
- Cheque XML has all 7 required attributes per Anexo 24 v1.3
- Transferencia XML has all 8 required attributes
- CompNal always emits MontoTotal when present
- CodAgrup is never emitted as empty string; required-Nivel violations throw
- `DesCta` is account name, not line description
- TipoSolicitud-conditional NumOrden/NumTramite validated at generation time
- All XSD validation tests pass (see FIX-2.3)

**Effort:** 1 day

---

### FIX-2.2 — Remove `Math.abs()` from Balanza saldos

**Severity:** P0 — Compliance (semantically wrong but syntactically valid XML)
**Files affected:**
- `lib/accounting/sat-xml/balance-xml.ts`
- `lib/accounting/sat-xml/__tests__/balance-xml.test.ts`

**Problem:**
Lines 61, 64 of `balance-xml.ts` apply `Math.abs()` to `SaldoIni` and `SaldoFin`. Per Anexo 24, when an account's balance is contrary to its `Naturaleza` (a debit-natural account with a credit balance), the saldo MUST be reported as negative to signal "saldo de naturaleza inversa." `Math.abs()` erases this signal — SAT sees incorrect signed balances.

**Optimal solution:**

Remove `Math.abs()`. The sign carries the correct semantic. Add a helper to make the intent explicit:

```typescript
// balance-xml.ts

/**
 * Computes the SAT-spec saldo for an account.
 *
 * Per Anexo 24 v1.3: "De acuerdo a la naturaleza de la cuenta o subcuenta,
 * deberá de corresponder el saldo inicial, de lo contrario se entenderá
 * que es un saldo inicial de naturaleza inversa."
 *
 * In practice: a positive value means the balance matches the naturaleza;
 * a negative value signals an inverse balance (e.g., a debit-natural
 * account with a credit balance).
 */
function computeSaldoForNaturaleza(
  naturaleza: 'D' | 'A',
  debitTotal: number,
  creditTotal: number
): number {
  return naturaleza === 'D'
    ? debitTotal - creditTotal
    : creditTotal - debitTotal;
}

// In the main generator:
for (const row of rows) {
  const saldoIni = computeSaldoForNaturaleza(row.satNaturaleza, row.openingDebit, row.openingCredit);
  const saldoFin = computeSaldoForNaturaleza(row.satNaturaleza, row.closingDebit, row.closingCredit);

  let accountLine = '  <BCE:Ctas';
  accountLine += attr('NumCta', row.accountCode);
  accountLine += attr('SaldoIni', toSatDecimal(saldoIni));  // sign preserved
  accountLine += attr('Debe', toSatDecimal(row.periodDebit));
  accountLine += attr('Haber', toSatDecimal(row.periodCredit));
  accountLine += attr('SaldoFin', toSatDecimal(saldoFin));  // sign preserved
  accountLine += '/>';
  lines.push(accountLine);
}
```

Also enforce the conditional `FechaModBal` for `TipoEnvio='C'`:

```typescript
if (tipo === 'C') {
  if (!fechaModBal) {
    throw new Error('Anexo 24: FechaModBal is required when TipoEnvio=C (complementaria)');
  }
  rootAttrs += attr('FechaModBal', fechaModBal);
}
```

**Tests required:**

```typescript
describe('Balanza saldos signed values', () => {
  it('preserves negative saldo for debit-natural account with credit balance', () => {
    const row: TrialBalanceRow = {
      accountCode: '1101001',
      satNaturaleza: 'D',
      openingDebit: 0,
      openingCredit: 500,   // contra-nature
      periodDebit: 0,
      periodCredit: 0,
      closingDebit: 0,
      closingCredit: 500,
      // ...
    };
    const xml = generateBalanceXml({ rows: [row], /* ... */ });
    expect(xml).toContain('SaldoIni="-500.00"');  // signed!
    expect(xml).toContain('SaldoFin="-500.00"');
  });

  it('preserves positive saldo for natural balances', () => {
    const row: TrialBalanceRow = {
      accountCode: '1101001',
      satNaturaleza: 'D',
      openingDebit: 1000,
      openingCredit: 0,
      /* ... */
    };
    const xml = generateBalanceXml({ rows: [row], /* ... */ });
    expect(xml).toContain('SaldoIni="1000.00"');
  });

  it('throws when TipoEnvio=C without FechaModBal', () => {
    expect(() => generateBalanceXml({
      tipo: 'C',
      // fechaModBal missing
      rows: [], /* ... */
    })).toThrow(/FechaModBal is required/);
  });
});
```

**Acceptance criteria:**
- `Math.abs` never applied to a saldo
- Negative saldos emitted for contra-nature balances
- Positive saldos emitted for natural balances
- `TipoEnvio='C'` without `FechaModBal` throws
- XSD validation passes (see FIX-2.3)

**Effort:** 0.5 day

---

### FIX-2.3 — Implement real XSD validation

**Severity:** P0 — Compliance (false confidence; the stub returns valid for everything)
**Files affected:**
- `packages/sat-schemas/` (NEW package — see below)
- `lib/accounting/sat-xml/shared.ts` (replace `validateXml` stub)
- `lib/accounting/sat-xml/__tests__/xsd-validation.test.ts` (NEW)
- `package.json` (add `libxmljs2` dependency)

**Problem:**
`validateXml` returns `{ valid: true, errors: [] }` always. The tests use `expect(xml).toContain(...)` which would pass even for invalid XSDs. The "production-ready" claim hinges on this gap.

**Optimal solution:**

**Step 1 — Create a shared package for the XSDs.**

The Anexo 24 v1.3 XSDs are publicly available at SAT URLs but should be cached locally to avoid network dependencies in CI and production. Create a new turborepo package:

```
my-turborepo/packages/sat-schemas/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts
│   ├── loader.ts          # File reading + caching
│   └── validator.ts       # libxmljs2 wrapper
└── xsd/
    └── contabilidade/
        └── 1_3/
            ├── CatalogoCuentas_1_3.xsd
            ├── BalanzaComprobacion_1_3.xsd
            ├── PolizasPeriodo_1_3.xsd
            ├── AuxiliarCtas_1_3.xsd
            └── AuxiliarFolios_1_3.xsd
```

Download the XSDs from:
- `http://www.sat.gob.mx/esquemas/ContabilidadE/1_3/CatalogoCuentas/CatalogoCuentas_1_3.xsd`
- `http://www.sat.gob.mx/esquemas/ContabilidadE/1_3/BalanzaComprobacion/BalanzaComprobacion_1_3.xsd`
- `http://www.sat.gob.mx/esquemas/ContabilidadE/1_3/PolizasPeriodo/PolizasPeriodo_1_3.xsd`
- (and the two auxiliares)

Commit them to the repo with a README explaining the version, source URL, and last-updated date.

**Step 2 — Validator implementation:**

```typescript
// packages/sat-schemas/src/validator.ts
import { parseXml, parseXmlString, validateSchema, libxml } from 'libxmljs2';
import { loadSchema } from './loader';

export type SchemaType = 'CT' | 'BN' | 'BC' | 'PL' | 'XC' | 'XF';

export interface ValidationResult {
  valid: boolean;
  errors: Array<{
    line: number;
    column: number;
    message: string;
  }>;
}

const SCHEMA_FILE_MAP: Record<SchemaType, string> = {
  CT: 'contabilidade/1_3/CatalogoCuentas_1_3.xsd',
  BN: 'contabilidade/1_3/BalanzaComprobacion_1_3.xsd',
  BC: 'contabilidade/1_3/BalanzaComprobacion_1_3.xsd',
  PL: 'contabilidade/1_3/PolizasPeriodo_1_3.xsd',
  XC: 'contabilidade/1_3/AuxiliarCtas_1_3.xsd',
  XF: 'contabilidade/1_3/AuxiliarFolios_1_3.xsd',
};

// Schemas are loaded once and cached at module level
const schemaCache = new Map<SchemaType, libxml.Document>();

function getSchema(type: SchemaType): libxml.Document {
  if (!schemaCache.has(type)) {
    const xsdContent = loadSchema(SCHEMA_FILE_MAP[type]);
    schemaCache.set(type, parseXml(xsdContent));
  }
  return schemaCache.get(type)!;
}

export function validateSatXml(xmlString: string, type: SchemaType): ValidationResult {
  let doc: libxml.Document;
  try {
    doc = parseXmlString(xmlString);
  } catch (err) {
    return {
      valid: false,
      errors: [{ line: 0, column: 0, message: `XML parse error: ${(err as Error).message}` }],
    };
  }

  const schema = getSchema(type);
  const valid = doc.validate(schema);

  if (valid) return { valid: true, errors: [] };

  const errors = (doc.validationErrors || []).map(err => ({
    line: err.line || 0,
    column: err.column || 0,
    message: err.message || 'Unknown validation error',
  }));

  return { valid: false, errors };
}

export function assertSatXmlValid(xmlString: string, type: SchemaType, context?: string): void {
  const result = validateSatXml(xmlString, type);
  if (!result.valid) {
    const lines = result.errors.slice(0, 5).map(e => `  Line ${e.line}: ${e.message}`).join('\n');
    throw new Error(
      `XSD validation failed for ${type}${context ? ` (${context})` : ''}:\n${lines}` +
      (result.errors.length > 5 ? `\n  ... and ${result.errors.length - 5} more errors` : '')
    );
  }
}
```

**Step 3 — Replace the stub in `lib/accounting/sat-xml/shared.ts`:**

```typescript
import { validateSatXml, assertSatXmlValid, type SchemaType } from '@sat/sat-schemas';

export { validateSatXml, assertSatXmlValid, type SchemaType };

// Remove the old validateXml stub entirely.
```

**Step 4 — Wire into each generator:**

Each XML generator should validate before returning. Make it opt-out via a flag for testing weird cases, but ON by default in production:

```typescript
// catalog-xml.ts
export function generateCatalogXml(input: CatalogXmlInput, options: { validate?: boolean } = {}): string {
  const xml = buildCatalogXmlString(input);  // existing logic moved into private helper

  if (options.validate !== false) {
    assertSatXmlValid(xml, 'CT', `Catalog for ${input.rfc} ${input.year}-${input.month}`);
  }

  return xml;
}
```

Same pattern for `generateBalanceXml`, `generateJournalXml`, etc.

**Tests required:**

```typescript
// lib/accounting/sat-xml/__tests__/xsd-validation.test.ts
import { validateSatXml, assertSatXmlValid } from '@sat/sat-schemas';
import { generateCatalogXml, generateBalanceXml, generateJournalXml } from '../';

describe('XSD validation — Catálogo', () => {
  it('valid catalog passes XSD', () => {
    const xml = generateCatalogXml({
      rfc: 'XAXX010101000',
      year: 2026,
      month: 1,
      accounts: makeValidAccountChart(),
    }, { validate: false });

    const result = validateSatXml(xml, 'CT');
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('catalog with empty CodAgrup fails XSD', () => {
    expect(() =>
      generateCatalogXml({
        rfc: 'XAXX010101000',
        year: 2026,
        month: 1,
        accounts: [{ ...validAccount, satAgrupadorCode: '', satNivel: 1 }],
      })
    ).toThrow(/CodAgrup/);
  });
});

describe('XSD validation — Balanza', () => {
  it('valid balanza with signed saldos passes XSD', () => {
    const xml = generateBalanceXml({
      rfc: 'XAXX010101000',
      year: 2026,
      month: 1,
      tipo: 'N',
      rows: makeValidTrialBalance(),
    }, { validate: false });

    expect(validateSatXml(xml, 'BN').valid).toBe(true);
  });
});

describe('XSD validation — Pólizas', () => {
  it('valid pólizas with all required attributes pass XSD', () => {
    const accountNames = new Map([['acc-1', 'Caja']]);
    const xml = generateJournalXml({
      rfc: 'XAXX010101000',
      year: 2026,
      month: 1,
      tipoSolicitud: 'AF',
      numOrden: 'ABC123456789',
      entries: [makeValidPostedEntry()],
      accountNames,
    }, { validate: false });

    expect(validateSatXml(xml, 'PL').valid).toBe(true);
  });

  it('pólizas with malformed UUID fails XSD', () => {
    const accountNames = new Map([['acc-1', 'Caja']]);
    const entry = makeValidPostedEntry({
      lines: [{ /* ... */, uuidCfdi: 'not-a-uuid' }],
    });
    const xml = generateJournalXml({
      /* ... */, entries: [entry], accountNames,
    }, { validate: false });

    expect(validateSatXml(xml, 'PL').valid).toBe(false);
  });
});
```

**Note on `libxmljs2`:** This package requires native build tools. If install issues arise on certain environments (Vercel, M1 Macs), `fast-xml-parser` does NOT support XSD validation, so the alternatives are:
1. `xmlbuilder2` + custom XSD-lite checker (limited)
2. Server-side validation via a Postgres function using `xmlvalidate()` extension
3. Shell out to `xmllint` (libxml binary, available in most containers)

`libxmljs2` is the cleanest first attempt. If you hit deployment issues, fall back to `xmllint` via child process.

**Acceptance criteria:**
- `validateSatXml` actually validates against the SAT XSD (no stub)
- All four primary XML types (CT, BN/BC, PL, XF/XC) have a passing valid-case test
- Each generator throws on invalid output by default
- The 5 XSDs are committed to the repo with version/source metadata
- Existing string-contains tests are augmented (not replaced) with XSD validation tests

**Effort:** 1 day (mostly XSD download + libxmljs2 integration)

---

### FIX-2.4 — Round-trip XSD validation for existing tests

**Severity:** P0 — Closes the false-confidence loop
**Files affected:**
- `lib/accounting/sat-xml/__tests__/catalog-xml.test.ts` (augment)
- `lib/accounting/sat-xml/__tests__/balance-xml.test.ts` (augment)
- `lib/accounting/sat-xml/__tests__/journal-xml.test.ts` (augment)

**Problem:**
The existing 44 SAT XML tests use `expect(xml).toContain('NumCta="1104"')` style assertions. These would pass even if the XML had structural errors that SAT would reject. The test on `journal-xml.test.ts:200` literally uses `"uuid-cfdi-123"` (not a valid UUID) and the test passes.

**Optimal solution:**

For every existing test that generates a "valid" XML, add a corresponding assertion that it passes XSD validation. Keep the contains-style tests for specific attribute verification.

Update test fixtures to use realistic data — valid UUIDs, valid RFCs, valid bank codes from Anexo 25 catalog.

```typescript
// Helper for tests — generates a valid UUID format
function testUuid(): string {
  return '550e8400-e29b-41d4-a716-' + Date.now().toString(16).padStart(12, '0').slice(0, 12);
}

// Realistic test fixture
const VALID_TEST_RFC = 'XAXX010101000';        // Generic SAT test RFC
const VALID_VENDOR_RFC = 'PSA920101ABC';
const VALID_BANK_CODE = '012';                 // BBVA per Anexo 25 c_Banco
```

Then for each existing test, add an XSD assertion:

```typescript
it('should generate Poliza elements', () => {
  const xml = generateJournalXml({
    rfc: VALID_TEST_RFC,
    year: 2026,
    month: 1,
    tipoSolicitud: 'AF',
    numOrden: 'ABC123456789',
    entries: [makeEntry()],
    accountNames: makeAccountNames(),
  }, { validate: false });  // Don't throw — we want to inspect

  // Existing assertions
  expect(xml).toContain('PLZ:Poliza');
  expect(xml).toContain('NumUnIdenPol="2026-000001"');

  // NEW: XSD validation
  const result = validateSatXml(xml, 'PL');
  if (!result.valid) {
    console.error('XSD errors:', result.errors);
  }
  expect(result.valid).toBe(true);
});
```

**Tests required:**

This is itself the test work. Audit every test in the three SAT XML test files. Replace fake UUIDs with valid ones. Add XSD validation assertions to every "should generate ..." test.

Add a regression-guard test:

```typescript
describe('Anexo 24 typo regression guards', () => {
  it('does not emit BanEmworCheworNal', () => {
    const xml = generateJournalXml({ /* with cheque */ });
    expect(xml).not.toContain('BanEmworCheworNal');
  });

  it('does not emit CodAgworrup', () => {
    const xml = generateCatalogXml({ /* ... */ });
    expect(xml).not.toContain('CodAgworrup');
  });

  it('does not emit empty CodAgrup attribute', () => {
    const xml = generateCatalogXml({ /* valid catalog */ });
    expect(xml).not.toContain('CodAgrup=""');
  });
});
```

**Acceptance criteria:**
- Every test that generates "valid" XML asserts XSD validation passes
- All test fixtures use valid UUID formats
- Regression guards for the three known typos exist
- A grep for `"uuid-cfdi-123"` (the bogus UUID) returns no matches

**Effort:** 0.5 day

---

## Wave 3 — v1.1 Spec Gap Closures (~5 days)

**Goal:** Implement the v1.1 features that were stubbed or skipped.

### FIX-3.1 — Implement `resolveExchangeRate` with three-tier hierarchy

**Severity:** P1 — Spec gap (SAT mismatch risk)
**Files affected:**
- `lib/accounting/exchange-rates/` (NEW directory)
- `lib/accounting/exchange-rates/service.ts` (NEW)
- `lib/accounting/exchange-rates/repository.ts` (NEW)
- `lib/accounting/exchange-rates/banxico-client.ts` (NEW)
- `lib/accounting/journal-entries/auto-posting.ts` (modify to use)
- `workers/banxico-fetch.ts` (NEW — background job)

**Problem:**
The `exchange_rates` table, types, and mapper exist, but `resolveExchangeRate` is unimplemented. Auto-posting trusts whatever rate the caller passes. The v1.1 spec called for: CFDI's `TipoCambio` → Banxico FIX from day prior → manual override.

**Optimal solution:**

**Service implementation:**

```typescript
// lib/accounting/exchange-rates/service.ts
import type { SupabaseClient } from '@supabase/supabase-js';
import { AccountingError } from '../errors';
import { getCachedRate, persistRate } from './repository';
import { fetchBanxicoFix } from './banxico-client';
import { previousBusinessDay } from '../utils/dates';

export type RateSource = 'cfdi' | 'banxico_fix' | 'dof' | 'manual' | 'native';

export interface ResolvedRate {
  rate: number;
  source: RateSource;
  reference?: string;
}

export interface ResolveContext {
  uuidCfdi?: string;
  cfdiTipoCambio?: number;
  manualOverride?: {
    rate: number;
    reason: string;
    userId: string;
  };
}

/**
 * Resolves the FX rate for a journal entry line per the Anexo 24 hierarchy:
 *   1. CFDI's TipoCambio (when UUID linked) — SAT's source of truth
 *   2. Manual override with reason (if explicitly provided)
 *   3. Banxico FIX rate from business day prior to entryDate
 *
 * Native (MXN→MXN) short-circuits to 1.0.
 */
export async function resolveExchangeRate(
  organizationId: string,
  currency: string,
  entryDate: string,
  context: ResolveContext,
  supabase: SupabaseClient,
): Promise<ResolvedRate> {
  // Native currency — no FX
  if (currency === 'MXN') {
    return { rate: 1.0, source: 'native' };
  }

  // Tier 1: CFDI rate (highest priority)
  if (context.uuidCfdi && context.cfdiTipoCambio !== undefined) {
    await persistRate({
      organizationId,
      currencyFrom: currency,
      currencyTo: 'MXN',
      rateDate: entryDate,
      rate: context.cfdiTipoCambio,
      source: 'cfdi',
      sourceReference: context.uuidCfdi,
    }, supabase);

    return {
      rate: context.cfdiTipoCambio,
      source: 'cfdi',
      reference: context.uuidCfdi,
    };
  }

  // Tier 3: Manual override (explicit caller intent)
  if (context.manualOverride) {
    await persistRate({
      organizationId,
      currencyFrom: currency,
      currencyTo: 'MXN',
      rateDate: entryDate,
      rate: context.manualOverride.rate,
      source: 'manual',
      sourceReference: context.manualOverride.reason,
      createdBy: context.manualOverride.userId,
    }, supabase);

    return {
      rate: context.manualOverride.rate,
      source: 'manual',
      reference: context.manualOverride.reason,
    };
  }

  // Tier 2: Banxico FIX from prior business day
  const dayPrior = previousBusinessDay(new Date(entryDate))
    .toISOString().split('T')[0];

  // Check cache first (Banxico rates are shared, org_id IS NULL)
  const cached = await getCachedRate({
    currencyFrom: currency,
    currencyTo: 'MXN',
    rateDate: dayPrior,
    source: 'banxico_fix',
  }, supabase);

  if (cached) {
    return { rate: cached.rate, source: 'banxico_fix' };
  }

  // Cache miss — fetch from Banxico
  try {
    const banxicoRate = await fetchBanxicoFix(currency, dayPrior);

    // Persist as shared (org_id = NULL) so other orgs benefit
    await persistRate({
      organizationId: null,
      currencyFrom: currency,
      currencyTo: 'MXN',
      rateDate: dayPrior,
      rate: banxicoRate,
      source: 'banxico_fix',
    }, supabase);

    return { rate: banxicoRate, source: 'banxico_fix' };
  } catch (err) {
    throw new AccountingError(
      'EXCHANGE_RATE_REQUIRED',
      `No se pudo obtener tipo de cambio ${currency}→MXN para ${entryDate}. ` +
        `Por favor proporcione un tipo de cambio manual.`
    );
  }
}
```

**Banxico client:**

```typescript
// lib/accounting/exchange-rates/banxico-client.ts

/**
 * Fetches Banxico FIX rate for a currency on a specific date.
 *
 * Banxico SIE API documentation: https://www.banxico.org.mx/SieAPIRest/
 * Free token required: https://www.banxico.org.mx/SieAPIRest/service/v1/token
 *
 * Series IDs:
 *   USD: SF43718 (Tipo de cambio FIX)
 *   EUR: SF46410
 *   CAD: SF60633
 *   JPY: SF46415
 *   GBP: SF46406
 */
const BANXICO_SERIES: Record<string, string> = {
  USD: 'SF43718',
  EUR: 'SF46410',
  CAD: 'SF60633',
  JPY: 'SF46415',
  GBP: 'SF46406',
};

const BANXICO_API_BASE = 'https://www.banxico.org.mx/SieAPIRest/service/v1';

export async function fetchBanxicoFix(currency: string, date: string): Promise<number> {
  const series = BANXICO_SERIES[currency];
  if (!series) {
    throw new Error(`Banxico series not configured for currency ${currency}`);
  }

  const token = process.env.BANXICO_API_TOKEN;
  if (!token) {
    throw new Error('BANXICO_API_TOKEN environment variable not set');
  }

  const url = `${BANXICO_API_BASE}/series/${series}/datos/${date}/${date}`;
  const response = await fetch(url, {
    headers: { 'Bmx-Token': token },
  });

  if (!response.ok) {
    throw new Error(`Banxico API error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  const datos = data?.bmx?.series?.[0]?.datos;
  if (!datos || datos.length === 0) {
    // No data for that date (weekend/holiday) — caller should try day prior
    throw new Error(`No Banxico rate available for ${currency} on ${date}`);
  }

  return parseFloat(datos[0].dato);
}
```

**Repository:**

```typescript
// lib/accounting/exchange-rates/repository.ts
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ExchangeRate } from '../types';

export interface PersistRateInput {
  organizationId: string | null;  // NULL for shared (Banxico/DOF)
  currencyFrom: string;
  currencyTo: string;
  rateDate: string;
  rate: number;
  source: 'cfdi' | 'banxico_fix' | 'dof' | 'manual';
  sourceReference?: string;
  createdBy?: string;
}

export async function persistRate(
  input: PersistRateInput,
  supabase: SupabaseClient
): Promise<void> {
  await supabase
    .from('exchange_rates')
    .upsert({
      organization_id: input.organizationId,
      currency_from: input.currencyFrom,
      currency_to: input.currencyTo,
      rate_date: input.rateDate,
      rate: input.rate,
      source: input.source,
      source_reference: input.sourceReference,
      created_by: input.createdBy,
    }, {
      onConflict: input.organizationId
        ? 'organization_id,currency_from,currency_to,rate_date,source'
        : 'currency_from,currency_to,rate_date,source',
      ignoreDuplicates: true,
    });
}

export async function getCachedRate(
  query: {
    organizationId?: string | null;
    currencyFrom: string;
    currencyTo: string;
    rateDate: string;
    source: 'cfdi' | 'banxico_fix' | 'dof' | 'manual';
  },
  supabase: SupabaseClient
): Promise<ExchangeRate | null> {
  let q = supabase
    .from('exchange_rates')
    .select('*')
    .eq('currency_from', query.currencyFrom)
    .eq('currency_to', query.currencyTo)
    .eq('rate_date', query.rateDate)
    .eq('source', query.source);

  if (query.organizationId !== undefined) {
    q = query.organizationId === null
      ? q.is('organization_id', null)
      : q.eq('organization_id', query.organizationId);
  }

  const { data } = await q.maybeSingle();
  if (!data) return null;

  return {
    id: data.id,
    organizationId: data.organization_id,
    currencyFrom: data.currency_from,
    currencyTo: data.currency_to,
    rateDate: data.rate_date,
    rate: parseFloat(data.rate),
    source: data.source,
    sourceReference: data.source_reference,
    createdAt: data.created_at,
    createdBy: data.created_by,
  };
}
```

**Wire into auto-posting:**

Modify `autoPostFromInvoice` to call `resolveExchangeRate`:

```typescript
// In auto-posting.ts, before constructing the input:
const resolved = await resolveExchangeRate(
  invoiceData.organizationId,
  invoiceData.currency ?? 'MXN',
  entryDate,
  {
    uuidCfdi: invoiceData.uuid,
    cfdiTipoCambio: invoiceData.exchangeRate,  // CFDI's own rate, if present
  },
  supabase,
);

const input: CreateJournalEntryInput = {
  // ...
  exchangeRate: resolved.rate,
  // Pass through to journal entry for audit
  // (you may want to add a column tracking the source/reference)
};
```

**Background job:**

```typescript
// workers/banxico-fetch.ts
// Run nightly at 02:00 UTC via your existing job scheduler (Component 32)

import { createServiceClient } from '@/lib/supabase/service';
import { fetchBanxicoFix } from '@/lib/accounting/exchange-rates/banxico-client';
import { persistRate } from '@/lib/accounting/exchange-rates/repository';

const CURRENCIES_TO_FETCH = ['USD', 'EUR'];  // Extend as needed

export async function fetchTodaysBanxicoRates(): Promise<void> {
  const supabase = createServiceClient();
  const today = new Date().toISOString().split('T')[0];

  for (const currency of CURRENCIES_TO_FETCH) {
    try {
      const rate = await fetchBanxicoFix(currency, today);
      await persistRate({
        organizationId: null,
        currencyFrom: currency,
        currencyTo: 'MXN',
        rateDate: today,
        rate,
        source: 'banxico_fix',
      }, supabase);
      console.log(`Banxico ${currency}: ${rate} for ${today}`);
    } catch (err) {
      console.error(`Failed to fetch ${currency}:`, err);
      // Don't throw — try next currency. Alert ops via standard error tracking.
    }
  }
}
```

**Tests required:**

```typescript
describe('resolveExchangeRate', () => {
  it('short-circuits to 1.0 for MXN', async () => {
    const r = await resolveExchangeRate(orgId, 'MXN', '2026-05-15', {}, supabase);
    expect(r).toEqual({ rate: 1.0, source: 'native' });
  });

  it('uses CFDI rate when UUID linked', async () => {
    const r = await resolveExchangeRate(orgId, 'USD', '2026-05-15', {
      uuidCfdi: validUuid(),
      cfdiTipoCambio: 17.5234,
    }, supabase);
    expect(r.rate).toBe(17.5234);
    expect(r.source).toBe('cfdi');
  });

  it('uses manual override when provided', async () => {
    const r = await resolveExchangeRate(orgId, 'USD', '2026-05-15', {
      manualOverride: { rate: 17.6, reason: 'forward contract', userId: 'u1' },
    }, supabase);
    expect(r.rate).toBe(17.6);
    expect(r.source).toBe('manual');
  });

  it('falls through to Banxico cache when no CFDI or manual', async () => {
    // Seed cache
    await persistRate({
      organizationId: null,
      currencyFrom: 'USD', currencyTo: 'MXN',
      rateDate: '2026-05-14', rate: 17.5, source: 'banxico_fix',
    }, supabase);

    const r = await resolveExchangeRate(orgId, 'USD', '2026-05-15', {}, supabase);
    expect(r.rate).toBe(17.5);
    expect(r.source).toBe('banxico_fix');
  });

  it('throws actionable error when no rate available', async () => {
    // No CFDI, no manual, no cache, Banxico unreachable
    await expect(
      resolveExchangeRate(orgId, 'XYZ', '2026-05-15', {}, supabase)
    ).rejects.toThrow(/EXCHANGE_RATE_REQUIRED/);
  });
});
```

**Acceptance criteria:**
- All three tiers work in priority order
- Banxico FIX rates are cached as shared (org_id NULL)
- Manual overrides write audit-traceable records (reason, user)
- Auto-posting from invoice uses `resolveExchangeRate`
- Background job fetches USD and EUR rates nightly
- Failed Banxico fetch produces actionable error message
- Banxico token configured via environment variable

**Effort:** 1.5 days (including Banxico API integration testing)

---

### FIX-3.2 — Implement three-tier posting rules engine

**Severity:** P1 — Spec gap (core differentiator for accounting-firm market)
**Files affected:**
- `lib/accounting/posting-rules/` (NEW directory)
- `lib/accounting/posting-rules/service.ts` (NEW)
- `lib/accounting/posting-rules/repository.ts` (NEW)
- `lib/accounting/posting-rules/engine.ts` (NEW — resolves rules to lines)
- `lib/accounting/posting-rules/system-defaults.ts` (NEW — seeded rules per regime)
- `lib/accounting/journal-entries/auto-posting.ts` (rewrite to use engine)

**Problem:**
The `posting_rules` table, types, and mapper exist but no service uses them. Auto-posting hard-codes account codes in `DEFAULT_ACCOUNTS` (auto-posting.ts:14-24). The v1.1 differentiator (org-customizable rules for accounting firms) is absent.

**Optimal solution:**

**Tier 1 — System defaults** (seeded once per platform deployment):

```typescript
// lib/accounting/posting-rules/system-defaults.ts

export interface SystemPostingRule {
  ruleName: string;
  triggerEvent: 'invoice.stamped' | 'payment.recorded' | 'expense.approved';
  taxRegime: string;  // e.g., '601', '626'
  definition: PostingRuleDefinition;
}

export interface PostingRuleDefinition {
  conditions?: Record<string, string>;
  lines: PostingRuleLine[];
}

export interface PostingRuleLine {
  side: 'debit' | 'credit';
  accountCode: string;
  amountSource:
    | 'subtotal' | 'iva' | 'total'
    | 'retention_isr' | 'retention_iva'
    | 'discount' | 'literal';
  literalAmount?: number;
  description?: string;
  /** If true, this line is conditional on amount being > 0 */
  skipIfZero?: boolean;
}

export const SYSTEM_DEFAULT_RULES: SystemPostingRule[] = [
  // Régimen General — Invoice Stamped (CFDI tipo I)
  {
    ruleName: 'sys-general-invoice-stamped',
    triggerEvent: 'invoice.stamped',
    taxRegime: '601',
    definition: {
      lines: [
        { side: 'debit',  accountCode: '1130001', amountSource: 'total', description: 'Cuentas por cobrar' },
        { side: 'credit', accountCode: '4100001', amountSource: 'subtotal', description: 'Ingresos por ventas' },
        { side: 'credit', accountCode: '2120001', amountSource: 'iva', skipIfZero: true, description: 'IVA trasladado' },
      ],
    },
  },
  // RESICO PF — Invoice Stamped (simpler chart, no IVA acreditable tracking for many cases)
  {
    ruleName: 'sys-resico-invoice-stamped',
    triggerEvent: 'invoice.stamped',
    taxRegime: '626',
    definition: {
      lines: [
        { side: 'debit',  accountCode: '1130001', amountSource: 'total' },
        { side: 'credit', accountCode: '4100001', amountSource: 'subtotal' },
        { side: 'credit', accountCode: '2120001', amountSource: 'iva', skipIfZero: true },
      ],
    },
  },
  // Payment Received
  {
    ruleName: 'sys-general-payment-recorded',
    triggerEvent: 'payment.recorded',
    taxRegime: '601',
    definition: {
      lines: [
        { side: 'debit',  accountCode: '1120001', amountSource: 'total', description: 'Bancos' },
        { side: 'credit', accountCode: '1130001', amountSource: 'total', description: 'Cuentas por cobrar' },
      ],
    },
  },
  // Expense Approved
  {
    ruleName: 'sys-general-expense-approved',
    triggerEvent: 'expense.approved',
    taxRegime: '601',
    definition: {
      lines: [
        { side: 'debit',  accountCode: '6100001', amountSource: 'subtotal', description: 'Gastos generales' },
        { side: 'debit',  accountCode: '1180001', amountSource: 'iva', skipIfZero: true, description: 'IVA acreditable' },
        { side: 'credit', accountCode: '2110001', amountSource: 'total', description: 'Proveedores' },
      ],
    },
  },
  // ... (extend for other regime/event combos)
];

export async function seedSystemDefaults(supabase: SupabaseClient): Promise<void> {
  for (const rule of SYSTEM_DEFAULT_RULES) {
    await supabase.from('posting_rules').upsert({
      organization_id: null,  // System rules — null org
      rule_name: rule.ruleName,
      trigger_event: rule.triggerEvent,
      rule_definition: rule.definition,
      is_system: true,
      is_active: true,
      priority: 0,
    }, { onConflict: 'rule_name' });
  }
}
```

**Engine — resolves which rule to apply and builds lines:**

```typescript
// lib/accounting/posting-rules/engine.ts

export interface RuleResolutionContext {
  organizationId: string;
  triggerEvent: string;
  taxRegime: string;
  // The source document amounts
  amounts: {
    subtotal: number;
    iva: number;
    total: number;
    retentionIsr?: number;
    retentionIva?: number;
    discount?: number;
  };
}

export async function resolveAndBuildLines(
  ctx: RuleResolutionContext,
  supabase: SupabaseClient
): Promise<CreateJournalEntryLineInput[]> {
  // Priority order: org-tier > system-tier
  const orgRule = await findOrgRule(ctx.organizationId, ctx.triggerEvent, supabase);
  const systemRule = !orgRule ? await findSystemRule(ctx.triggerEvent, ctx.taxRegime, supabase) : null;

  const rule = orgRule || systemRule;
  if (!rule) {
    throw new AccountingError(
      'POSTING_RULE_NOT_FOUND',
      `No hay regla de contabilización para ${ctx.triggerEvent} en régimen ${ctx.taxRegime}`
    );
  }

  return rule.definition.lines
    .map(line => resolveAmount(line, ctx.amounts))
    .filter(line => !line.skipIfZero || line.amount > 0)
    .map((line, idx) => ({
      lineNumber: idx + 1,
      accountCode: line.accountCode,
      debit: line.side === 'debit' ? line.amount : 0,
      credit: line.side === 'credit' ? line.amount : 0,
      description: line.description,
    }));
}

function resolveAmount(
  line: PostingRuleLine,
  amounts: RuleResolutionContext['amounts']
): PostingRuleLine & { amount: number } {
  let amount: number;
  switch (line.amountSource) {
    case 'subtotal':       amount = amounts.subtotal; break;
    case 'iva':            amount = amounts.iva; break;
    case 'total':          amount = amounts.total; break;
    case 'retention_isr':  amount = amounts.retentionIsr ?? 0; break;
    case 'retention_iva':  amount = amounts.retentionIva ?? 0; break;
    case 'discount':       amount = amounts.discount ?? 0; break;
    case 'literal':        amount = line.literalAmount ?? 0; break;
  }
  return { ...line, amount };
}
```

**Refactored auto-posting:**

```typescript
// auto-posting.ts (greatly simplified)

export async function autoPostFromInvoice(
  invoiceData: InvoiceInput,
  userId: string,
  supabase: SupabaseClient
): Promise<JournalEntry> {
  // Idempotency check
  const existing = await findActiveBySource(invoiceData.organizationId, 'invoice', invoiceData.id, supabase);
  if (existing) return existing;

  const org = await getOrganization(invoiceData.organizationId, supabase);

  // Build lines via rule engine
  const lines = await resolveAndBuildLines({
    organizationId: invoiceData.organizationId,
    triggerEvent: 'invoice.stamped',
    taxRegime: org.taxRegime,
    amounts: {
      subtotal: invoiceData.subtotal,
      iva: invoiceData.tax,
      total: invoiceData.total,
    },
  }, supabase);

  // Resolve FX
  const fx = await resolveExchangeRate(
    invoiceData.organizationId,
    invoiceData.currency ?? 'MXN',
    invoiceData.issuedAt.split('T')[0],
    { uuidCfdi: invoiceData.uuid, cfdiTipoCambio: invoiceData.exchangeRate },
    supabase,
  );

  // Attach UUID to revenue/AR line (whichever has CFDI)
  const linesWithUuid = lines.map(l =>
    l.accountCode.startsWith('113') || l.accountCode.startsWith('11200')
      ? { ...l, uuidCfdi: invoiceData.uuid, rfcThirdParty: invoiceData.receiverRfc, montoTotalComp: invoiceData.total }
      : l
  );

  const input: CreateJournalEntryInput = {
    entryDate: invoiceData.issuedAt.split('T')[0],
    polizaType: 'ingreso',
    description: buildDescription(invoiceData),
    sourceType: 'invoice',
    sourceId: invoiceData.id,
    sourceUuidCfdi: invoiceData.uuid,
    currencyCode: invoiceData.currency ?? 'MXN',
    exchangeRate: fx.rate,
    lines: linesWithUuid,
  };

  return createAndPostEntry(invoiceData.organizationId, input, userId, supabase);
}
```

**UI backend (separate ticket, not in this fix):** API endpoints for the table-editor UI (list rules, create/update/delete org-tier rules). For this fix, just expose the service methods; the UI implementation is part of Component 44 frontend work.

**Tests required:**

```typescript
describe('Posting rules engine', () => {
  it('resolves system default for régimen general invoice', async () => {
    const lines = await resolveAndBuildLines({
      organizationId: orgGeneral.id,
      triggerEvent: 'invoice.stamped',
      taxRegime: '601',
      amounts: { subtotal: 1000, iva: 160, total: 1160 },
    }, supabase);

    expect(lines).toHaveLength(3);
    expect(lines[0]).toMatchObject({ accountCode: '1130001', debit: 1160, credit: 0 });
    expect(lines[1]).toMatchObject({ accountCode: '4100001', debit: 0, credit: 1000 });
    expect(lines[2]).toMatchObject({ accountCode: '2120001', debit: 0, credit: 160 });
  });

  it('skips IVA line when amount is zero', async () => {
    const lines = await resolveAndBuildLines({
      organizationId: orgGeneral.id,
      triggerEvent: 'invoice.stamped',
      taxRegime: '601',
      amounts: { subtotal: 1000, iva: 0, total: 1000 },
    }, supabase);

    expect(lines).toHaveLength(2);
    expect(lines.find(l => l.accountCode === '2120001')).toBeUndefined();
  });

  it('uses org override when present', async () => {
    await createOrgRule(orgGeneral.id, {
      triggerEvent: 'invoice.stamped',
      ruleName: 'org-custom-invoice',
      definition: {
        lines: [
          { side: 'debit',  accountCode: '1130099', amountSource: 'total' },  // custom AR account
          { side: 'credit', accountCode: '4100099', amountSource: 'subtotal' },
          { side: 'credit', accountCode: '2120001', amountSource: 'iva', skipIfZero: true },
        ],
      },
    });

    const lines = await resolveAndBuildLines({
      organizationId: orgGeneral.id,
      triggerEvent: 'invoice.stamped',
      taxRegime: '601',
      amounts: { subtotal: 1000, iva: 160, total: 1160 },
    }, supabase);

    expect(lines[0].accountCode).toBe('1130099');  // Org override wins
  });

  it('throws actionable error when no rule found', async () => {
    await expect(
      resolveAndBuildLines({
        organizationId: orgGeneral.id,
        triggerEvent: 'unknown.event' as any,
        taxRegime: '601',
        amounts: { subtotal: 100, iva: 16, total: 116 },
      }, supabase)
    ).rejects.toThrow(/POSTING_RULE_NOT_FOUND/);
  });
});
```

**Acceptance criteria:**
- System defaults seeded for at least 4 (regime × event) combinations
- Org rules override system rules
- `skipIfZero` correctly filters zero-amount lines
- Auto-posting routes through the rules engine — no more hardcoded `DEFAULT_ACCOUNTS`
- Missing rule produces actionable error
- All existing auto-posting tests still pass

**Effort:** 1.5 days

---

### FIX-3.3 — Fix `calculateAccountBalance` snapshot lookup

**Severity:** P1 — Correctness bug (wrong opening balances)
**Files affected:**
- `lib/accounting/balances/service.ts`
- `lib/accounting/balances/__tests__/snapshot-lookup.test.ts` (NEW)

**Problem:**
`calculateAccountBalance` orders the snapshot lookup by `generated_at` (the timestamp of when the snapshot was created), not by the period date the snapshot represents. If snapshots are ever re-generated out of order (e.g., a correction to January re-runs the snapshot in March), the query returns the most recently *generated* snapshot, which may not be the most recent by period date. Result: wrong opening balance.

Additionally, the in-memory `.continue` filter (line 101) fetches all posted lines for the account before filtering by date — for high-volume accounts this loads way too much data.

**Optimal solution:**

Replace the snapshot query with one that joins to `fiscal_periods` and orders by period date. Push the date filter into the DB query.

```typescript
export async function calculateAccountBalance(
  organizationId: string,
  accountId: string,
  asOfDate: string,
  supabase: SupabaseClient
): Promise<AccountBalance> {
  // Account info (unchanged)
  const { data: accountRow } = await supabase
    .from('chart_of_accounts').select('*').eq('id', accountId).single();
  if (!accountRow) {
    throw new AccountingError('ACCOUNT_NOT_FOUND', 'Cuenta no encontrada', accountId);
  }
  const account = mapRowToAccount(accountRow);

  // FIXED: get the latest SEALED snapshot whose period END is BEFORE asOfDate
  // (we want opening balance for asOfDate's period, so we need the snapshot
  // of the prior closed period)
  const { data: snapshotRow } = await supabase
    .from('account_balance_snapshots')
    .select(`
      closing_balance,
      tax_periods!inner(end_date)
    `)
    .eq('organization_id', organizationId)
    .eq('account_id', accountId)
    .eq('is_sealed', true)
    .lt('tax_periods.end_date', asOfDate)
    .order('tax_periods.end_date', { ascending: false })
    .limit(1)
    .maybeSingle();

  let openingBalance = 0;
  let snapshotEndDate: string | null = null;

  if (snapshotRow) {
    openingBalance = parseFloat(snapshotRow.closing_balance ?? '0');
    snapshotEndDate = (snapshotRow as any).tax_periods.end_date;
  }

  // FIXED: push date filter to DB; don't load everything and filter in JS
  let linesQuery = supabase
    .from('journal_entry_lines')
    .select(`
      debit,
      credit,
      journal_entries!inner(status, entry_date)
    `)
    .eq('organization_id', organizationId)
    .eq('account_id', accountId)
    .eq('journal_entries.status', 'posted')
    .lte('journal_entries.entry_date', asOfDate);

  // Apply snapshot date filter at DB level
  if (snapshotEndDate) {
    linesQuery = linesQuery.gt('journal_entries.entry_date', snapshotEndDate);
  }

  const { data: entryLines } = await linesQuery;

  let totalDebit = 0;
  let totalCredit = 0;
  for (const line of (entryLines || [])) {
    totalDebit += parseFloat(line.debit ?? '0');
    totalCredit += parseFloat(line.credit ?? '0');
  }

  totalDebit = roundToTwoDecimals(totalDebit);
  totalCredit = roundToTwoDecimals(totalCredit);

  const closingBalance = roundToTwoDecimals(
    openingBalance + computeBalance(account.satNaturaleza, totalDebit, totalCredit)
  );

  return {
    accountId: account.id,
    accountCode: account.code,
    accountName: account.name,
    openingBalance,
    totalDebit,
    totalCredit,
    closingBalance,
  };
}
```

**Tests required:**

```typescript
describe('Snapshot lookup ordering', () => {
  it('uses snapshot for period closest to asOfDate, not most recently generated', async () => {
    // Seed: Jan snapshot generated in Feb, Feb snapshot generated in Mar,
    //       then Jan re-snapshot generated in Apr (latest by generated_at)
    await sealedSnapshot({ account, period: 'jan-2026', closingBalance: 100, generatedAt: '2026-02-01' });
    await sealedSnapshot({ account, period: 'feb-2026', closingBalance: 250, generatedAt: '2026-03-01' });
    await sealedSnapshot({ account, period: 'jan-2026', closingBalance: 110, generatedAt: '2026-04-01' });  // re-snapshot

    // Query for March 15 → opening should come from Feb snapshot (250), not the recently regenerated Jan (110)
    const balance = await calculateAccountBalance(orgId, accountId, '2026-03-15', supabase);
    expect(balance.openingBalance).toBe(250);
  });

  it('returns 0 opening for first-ever period', async () => {
    // No snapshots exist
    const balance = await calculateAccountBalance(orgId, accountId, '2026-01-15', supabase);
    expect(balance.openingBalance).toBe(0);
  });

  it('only loads lines after snapshot date from DB', async () => {
    // Spy on the supabase client to confirm the .gt filter is applied
    const spy = vi.spyOn(supabase, 'from');
    await calculateAccountBalance(orgId, accountId, '2026-03-15', supabase);
    // Verify the lines query included a .gt() call on entry_date
    // (implementation-dependent; use a custom matcher or query interceptor)
  });
});
```

**Acceptance criteria:**
- Snapshot lookup orders by period end date, not generated_at
- Date filter pushed to DB level (not in-memory)
- Out-of-order snapshot regeneration does not break balance calculations
- All existing balance tests still pass

**Effort:** 0.5 day

---

### FIX-3.4 — Fix trial balance opening balance for open periods

**Severity:** P1 — Correctness bug (current-month TB always shows zero opening)
**Files affected:**
- `lib/accounting/balances/service.ts`

**Problem:**
`calculateTrialBalance` reads from the CURRENT period's snapshot to get opening_balance (lines 154-160). But snapshots for open periods don't exist — they're created only by `closePeriod`. For open periods, opening defaults to 0. Result: every current-month trial balance shows zero opening balance.

**Optimal solution:**

For each account, look up the PRIOR period's sealed snapshot's `closing_balance` as the opening for the current period.

```typescript
export async function calculateTrialBalance(
  organizationId: string,
  periodId: string,
  supabase: SupabaseClient
): Promise<TrialBalanceRow[]> {
  const period = await getFiscalPeriod(periodId, supabase);
  if (!period) {
    throw new AccountingError('PERIOD_NOT_FOUND', 'Período no encontrado', periodId);
  }

  // Get all active accounts (unchanged)
  const { data: accountRows } = await supabase
    .from('chart_of_accounts')
    .select('*')
    .eq('organization_id', organizationId)
    .is('deleted_at', null)
    .eq('is_active', true)
    .order('materialized_path', { ascending: true });

  if (!accountRows || accountRows.length === 0) return [];

  const rows: TrialBalanceRow[] = [];

  for (const accountRow of accountRows) {
    const account = mapRowToAccount(accountRow);

    // FIXED: opening balance comes from PRIOR period's closing, not current period's snapshot
    let opening = 0;

    // First, check if this period has its own snapshot (closed period)
    const { data: currentSnapshot } = await supabase
      .from('account_balance_snapshots')
      .select('opening_balance, is_sealed')
      .eq('organization_id', organizationId)
      .eq('account_id', account.id)
      .eq('fiscal_period_id', periodId)
      .maybeSingle();

    if (currentSnapshot && currentSnapshot.is_sealed) {
      // Closed period — use snapshot's own opening
      opening = parseFloat(currentSnapshot.opening_balance ?? '0');
    } else {
      // Open period — derive opening from prior sealed snapshot
      const { data: priorSnapshot } = await supabase
        .from('account_balance_snapshots')
        .select(`
          closing_balance,
          tax_periods!inner(start_date)
        `)
        .eq('organization_id', organizationId)
        .eq('account_id', account.id)
        .eq('is_sealed', true)
        .lt('tax_periods.start_date', period.startDate)
        .order('tax_periods.start_date', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (priorSnapshot) {
        opening = parseFloat(priorSnapshot.closing_balance ?? '0');
      }
      // else: no prior snapshot → opening = 0 (first-ever period)
    }

    // Get period movements (unchanged)
    const { data: lineAgg } = await supabase
      .from('journal_entry_lines')
      .select(`
        debit, credit,
        journal_entries!inner(status, fiscal_period_id)
      `)
      .eq('organization_id', organizationId)
      .eq('account_id', account.id)
      .eq('journal_entries.status', 'posted')
      .eq('journal_entries.fiscal_period_id', periodId);

    let periodDebit = 0;
    let periodCredit = 0;
    for (const line of (lineAgg || [])) {
      periodDebit += parseFloat(line.debit ?? '0');
      periodCredit += parseFloat(line.credit ?? '0');
    }
    periodDebit = roundToTwoDecimals(periodDebit);
    periodCredit = roundToTwoDecimals(periodCredit);

    const closingBalance = roundToTwoDecimals(
      opening + computeBalance(account.satNaturaleza, periodDebit, periodCredit)
    );

    const openingSplit = splitBalanceToColumns(opening, account.satNaturaleza);
    const closingSplit = splitBalanceToColumns(closingBalance, account.satNaturaleza);

    rows.push({
      accountId: account.id,
      accountCode: account.code,
      accountName: account.name,
      satAgrupadorCode: account.satAgrupadorCode,
      satNivel: account.satNivel,
      satNaturaleza: account.satNaturaleza,
      openingDebit: openingSplit.debit,
      openingCredit: openingSplit.credit,
      periodDebit,
      periodCredit,
      closingDebit: closingSplit.debit,
      closingCredit: closingSplit.credit,
    });
  }

  return rows;
}
```

**Tests required:**

```typescript
describe('Trial balance opening balance', () => {
  it('uses prior period closing for current open period', async () => {
    // Seed: Jan closed with balance 1000, Feb is open
    await closePeriod(orgId, janPeriod.id, userId, 'monthly close', supabase);
    // (Posting some Feb entries...)
    await postEntry(/* Feb entry adding 200 to account */);

    const tb = await calculateTrialBalance(orgId, febPeriod.id, supabase);
    const row = tb.find(r => r.accountCode === testAccount.code);

    expect(row?.openingDebit).toBe(1000);  // From Jan close
    expect(row?.periodDebit).toBe(200);
    expect(row?.closingDebit).toBe(1200);
  });

  it('uses zero opening when no prior snapshot', async () => {
    // First ever period for this org
    const tb = await calculateTrialBalance(orgId, firstPeriod.id, supabase);
    expect(tb.every(r => r.openingDebit === 0 && r.openingCredit === 0)).toBe(true);
  });

  it('uses period snapshot when period is closed', async () => {
    await closePeriod(orgId, janPeriod.id, userId, 'monthly close', supabase);
    const tb = await calculateTrialBalance(orgId, janPeriod.id, supabase);
    // Should match what was sealed at close time
    expect(tb.length).toBeGreaterThan(0);
  });
});
```

**Acceptance criteria:**
- Open period TB correctly shows prior period's closing as opening
- Closed period TB uses its own sealed snapshot
- First-ever period correctly shows zero opening
- All existing trial balance tests still pass

**Effort:** 0.5 day

---

### FIX-3.5 — Pre-close validation in `closePeriod`

**Severity:** P1 — Compliance / data integrity (closes with bad data)
**Files affected:**
- `lib/accounting/balances/service.ts`
- `lib/accounting/balances/__tests__/period-close.test.ts`

**Problem:**
The spec required `closePeriod` to:
1. Verify no draft entries exist in the period
2. Verify trial balance balances
3. Generate snapshots
4. Update period status

Currently only steps 3 and 4 happen. You can close a period with drafts hanging around or with an unbalanced trial balance.

**Optimal solution:**

Add a validation pass before snapshot generation. Be explicit about which checks are blocking errors vs. warnings.

```typescript
export interface PeriodCloseValidation {
  blocking: Array<{ code: string; message: string; details?: any }>;
  warnings: Array<{ code: string; message: string; details?: any }>;
}

export async function validatePeriodForClose(
  organizationId: string,
  periodId: string,
  supabase: SupabaseClient
): Promise<PeriodCloseValidation> {
  const blocking: PeriodCloseValidation['blocking'] = [];
  const warnings: PeriodCloseValidation['warnings'] = [];

  // 1. No draft entries in the period
  const { data: drafts, count: draftCount } = await supabase
    .from('journal_entries')
    .select('id, entry_number', { count: 'exact' })
    .eq('organization_id', organizationId)
    .eq('fiscal_period_id', periodId)
    .eq('status', 'draft')
    .limit(10);

  if ((draftCount ?? 0) > 0) {
    blocking.push({
      code: 'DRAFTS_EXIST',
      message: `Hay ${draftCount} pólizas en borrador. Conviértalas o elimínelas antes de cerrar.`,
      details: { sampleIds: drafts?.map(d => d.id) },
    });
  }

  // 2. Trial balance must balance
  const trialBalance = await calculateTrialBalance(organizationId, periodId, supabase);
  const totalDebit = trialBalance.reduce((s, r) => s + r.periodDebit, 0);
  const totalCredit = trialBalance.reduce((s, r) => s + r.periodCredit, 0);

  if (Math.abs(totalDebit - totalCredit) > 0.01) {
    blocking.push({
      code: 'UNBALANCED_TRIAL',
      message: `Balanza no cuadra: debe=${totalDebit.toFixed(2)} haber=${totalCredit.toFixed(2)} diferencia=${(totalDebit - totalCredit).toFixed(2)}`,
      details: { totalDebit, totalCredit },
    });
  }

  // 3. If filing_mode='required', validate chart compliance
  const period = await getFiscalPeriod(periodId, supabase);
  if (period?.filingMode === 'required') {
    const chartValidation = await validateChartForFiling(organizationId, supabase);
    if (!chartValidation.isValid) {
      const errors = chartValidation.errors.filter(e => e.severity === 'error');
      if (errors.length > 0) {
        blocking.push({
          code: 'CHART_NOT_FILING_READY',
          message: `El catálogo de cuentas tiene ${errors.length} errores de cumplimiento SAT.`,
          details: { errors: errors.slice(0, 5) },
        });
      }
    }
  }

  // 4. Warn if no entries posted at all (period might be empty by mistake)
  const { count: postedCount } = await supabase
    .from('journal_entries')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', organizationId)
    .eq('fiscal_period_id', periodId)
    .eq('status', 'posted');

  if ((postedCount ?? 0) === 0) {
    warnings.push({
      code: 'EMPTY_PERIOD',
      message: 'El período no tiene pólizas contabilizadas. ¿Es esto correcto?',
    });
  }

  return { blocking, warnings };
}

// Updated closePeriod
export async function closePeriod(
  organizationId: string,
  periodId: string,
  userId: string,
  reason: string,
  supabase: SupabaseClient,
  options: { ignoreWarnings?: boolean } = {}
): Promise<PeriodCloseResult> {
  const period = await getFiscalPeriod(periodId, supabase);
  if (!period) {
    throw new AccountingError('PERIOD_NOT_FOUND', 'Período no encontrado', periodId);
  }
  if (period.status === 'closed') {
    throw new AccountingError('INVALID_OPERATION', 'El período ya está cerrado', periodId);
  }

  // VALIDATION FIRST
  const validation = await validatePeriodForClose(organizationId, periodId, supabase);

  if (validation.blocking.length > 0) {
    throw new AccountingError(
      'PERIOD_CLOSE_BLOCKED',
      `No se puede cerrar el período: ${validation.blocking.map(b => b.message).join('; ')}`,
      { validation }
    );
  }

  if (validation.warnings.length > 0 && !options.ignoreWarnings) {
    throw new AccountingError(
      'PERIOD_CLOSE_WARNINGS',
      `Advertencias antes de cerrar: ${validation.warnings.map(w => w.message).join('; ')}. Use ignoreWarnings=true para proceder.`,
      { validation }
    );
  }

  // ... rest of existing closePeriod logic (snapshot generation)
}
```

**Tests required:**

```typescript
describe('closePeriod validation', () => {
  it('blocks close when drafts exist', async () => {
    await createDraftEntry(/* in period */);
    await expect(closePeriod(orgId, periodId, userId, 'monthly', supabase))
      .rejects.toThrow(/DRAFTS_EXIST/);
  });

  it('blocks close when trial balance does not balance', async () => {
    // (Hard to engineer post-FIX-1.2 since DB CHECK prevents this,
    //  but the check is defensive against direct DB writes)
  });

  it('blocks close when filing mode required and chart has errors', async () => {
    await setPeriodFilingMode(periodId, 'required');
    // Create an account missing satAgrupadorCode
    await createAccount({ satAgrupadorCode: null, isPostable: true });
    await expect(closePeriod(orgId, periodId, userId, 'monthly', supabase))
      .rejects.toThrow(/CHART_NOT_FILING_READY/);
  });

  it('warns on empty period; allows close with ignoreWarnings', async () => {
    await expect(closePeriod(orgId, periodId, userId, 'monthly', supabase))
      .rejects.toThrow(/EMPTY_PERIOD/);

    await expect(closePeriod(orgId, periodId, userId, 'monthly', supabase, { ignoreWarnings: true }))
      .resolves.toBeDefined();
  });
});
```

**Acceptance criteria:**
- `validatePeriodForClose` returns blocking + warnings
- `closePeriod` throws on blocking; throws on warnings unless `ignoreWarnings`
- Filing-mode-required orgs require valid chart
- All existing close tests pass

**Effort:** 1 day

---

## Wave 4 — Tech Debt & Quality (~3 days)

**Goal:** Address tech debt before it compounds in later components.

### FIX-4.1 — Soft delete journal entries

**Severity:** P2 (audit trail loss)
**Files affected:**
- `supabase/migrations/20260527000005_je_soft_delete.sql`
- `lib/accounting/journal-entries/repository.ts`

Add `deleted_at TIMESTAMPTZ` to `journal_entries`. Change `deleteEntry` to set `deleted_at` instead of DELETE. Filter `deleted_at IS NULL` in all read queries.

**Effort:** 0.25 day

---

### FIX-4.2 — `findBySource` should ignore reversed entries

**Severity:** P2 (silent failure when re-posting after reversal)
**Files affected:**
- `lib/accounting/journal-entries/repository.ts`

Change `findBySource` query to `.neq('status', 'reversed')`. Add a test that verifies re-posting after reversal creates a new entry.

**Effort:** 0.1 day

---

### FIX-4.3 — Implement AI-powered `suggestAgrupadorCode`

**Severity:** P2 (poor suggestion quality)
**Files affected:**
- `lib/accounting/chart-of-accounts/service.ts`
- `ai-service/app/routers/agrupador_search.py` (NEW in your Python AI service)

Reuse Component 09's sentence-transformer infrastructure. Load the SAT Código Agrupador catalog into pgvector with the same approach used for product codes. Add an endpoint `/sat/agrupador-search`. The `suggestAgrupadorCode` function tries AI first, falls back to substring match for low-confidence results.

**Effort:** 1 day

---

### FIX-4.4 — COGS auto-posting for orgs with inventory tracking

**Severity:** P2 (missing feature for product businesses)
**Files affected:**
- `lib/accounting/journal-entries/auto-posting.ts`

Implement `autoPostCogsFromInvoice` per the v1.1 spec Section 5.5.4. Only fires when `org.inventoryTrackingEnabled === true`. Uses Component 08's WAC. Posts a second `diario` entry alongside the revenue entry. Handles cancellation/return reversals.

**Effort:** 1 day

---

### FIX-4.5 — Optimize `SubCtaDe` lookup from O(N²) to O(N)

**Severity:** P2 (perf)
**Files affected:**
- `lib/accounting/sat-xml/catalog-xml.ts`

Pre-build `Map<accountId, accountCode>` outside the loop. Replace `accounts.find(...)` with map lookup.

**Effort:** 0.1 day

---

### FIX-4.6 — Consolidate `account_type` vs `account_type_v2` shadow columns

**Severity:** P2 (data model debt)
**Files affected:**
- `supabase/migrations/20260527000006_consolidate_account_type.sql`

Backfill `account_type_v2` from `account_type` if not already done, then drop the old `account_type` VARCHAR column and rename `account_type_v2` → `account_type`. Update all queries that reference either column.

**Effort:** 0.25 day

---

### FIX-4.7 — Better expense category mapping

**Severity:** P2 (fragile categorization)
**Files affected:**
- `lib/accounting/journal-entries/auto-posting.ts`

Replace substring matching in `mapCategoryToAccount` with explicit enum/map. Allow per-org category-to-account customization via the posting rules engine (FIX-3.2 enables this).

**Effort:** 0.25 day

---

### FIX-4.8 — Date comparisons use Date objects, not strings

**Severity:** P2 (fragility)
**Files affected:**
- `lib/accounting/validation.ts` (`isDateInPeriod`)
- `lib/accounting/journal-entries/service.ts` (`reverseEntry` date comparison)

Add a guard that asserts ISO 8601 format at the boundary, then use Date object comparisons internally for clarity.

**Effort:** 0.25 day

---

## Process Improvements

The v1.0 implementation had a pattern: tests passed but verified the wrong things at compliance-critical surfaces. To prevent recurrence:

### PROC-1 — Compliance test fixtures before generation

For any SAT-facing artifact (XML, electronic accounting, e-invoice formats), the XSD validation test is written **before** the generator. Tests fail until generation produces valid XML. This inverts the discovered failure mode where the generator dictated what the tests asserted.

### PROC-2 — Compliance checklist at end of component

For Components touching SAT compliance, add a checklist to the spec doc that the implementing session must verify item-by-item:

- [ ] All XML output validates against current SAT XSD
- [ ] No empty-string attributes emitted for required fields
- [ ] All TipoSolicitud / TipoEnvio conditional requirements enforced
- [ ] All UUID fields validated for proper format (8-4-4-4-12)
- [ ] All RFC fields validated for proper format
- [ ] All required attributes per Anexo X have explicit `requiredAttr` calls

### PROC-3 — Mandatory `requiredAttr()` audit

In any XML generator, scan for `attr(` calls and confirm any that correspond to spec-required attributes use `requiredAttr(` instead. Add a lint rule if practical (`no-attr-for-required` custom ESLint rule).

### PROC-4 — Spec compliance diff after each agentic session

End each Claude Code session with: "Compare the implementation to Section X of the spec. List any items from the spec that were stubbed, simplified, or skipped. Don't summarize — be specific about what differs." This surfaces the gaps that the user-summary missed (posting_rules unused, exchange_rates unused, XSD validation stubbed).

---

## Implementation Order

```
Day 1:  FIX-1.1, FIX-1.2 in parallel              (Wave 1 RLS + invariants)
Day 2:  FIX-1.3, FIX-1.4                          (Wave 1 numbering + atomic insert)
Day 3:  FIX-2.1, FIX-2.2                          (Wave 2 XML fixes)
Day 4:  FIX-2.3 + FIX-2.4                          (Wave 2 XSD validation)
Day 5:  FIX-3.1                                    (Wave 3 FX hierarchy)
Day 6:  FIX-3.2 part 1                             (Wave 3 posting rules engine)
Day 7:  FIX-3.2 part 2 + FIX-3.3                   (Wave 3 rules + snapshot fix)
Day 8:  FIX-3.4 + FIX-3.5                          (Wave 3 TB opening + close validation)
Day 9:  FIX-4.1, 4.2, 4.5, 4.6, 4.7, 4.8 batch    (Wave 4 small fixes)
Day 10: FIX-4.3                                    (Wave 4 AI agrupador)
Day 11: FIX-4.4                                    (Wave 4 COGS automation)
Day 12: Buffer / final integration testing
```

With Claude Code agentic loop and the per-fix spec format above, this collapses to roughly 6–9 days if you batch the well-scoped DB fixes and reserve human review for FIX-2.3 (XSD validation infrastructure) and FIX-3.2 (posting rules engine).

---

## Acceptance Criteria Summary

The accounting subsystem can be considered production-ready when:

**Multi-tenant safety:**
- All accounting tables have RLS policies (16+ policies in `pg_policies`)
- RLS isolation tests pass for all 4 new tables
- Cross-org reads return zero rows under `authenticated` role

**Data integrity:**
- DB-level CHECK constraints enforce balance invariants and code formats
- Entry numbering is race-condition free under 50 concurrent allocations
- All journal entry insertions are atomic (no orphan headers possible)

**SAT compliance:**
- All XML generators validate against Anexo 24 v1.3 XSDs
- All test fixtures use valid UUIDs, RFCs, and bank codes
- Regression guards prevent the three known typos from reappearing
- Cheque and Transferencia nodes have all required attributes
- Saldos in Balanza preserve sign for contra-nature balances

**v1.1 spec implementation:**
- `resolveExchangeRate` three-tier hierarchy is wired into auto-posting
- Banxico nightly fetch job is scheduled and tested
- Posting rules engine resolves system + org tiers; auto-posting uses it
- Trial balance correctly computes opening balances for open periods
- `closePeriod` blocks on drafts, unbalanced TB, or filing-mode compliance failures
- AI-powered agrupador suggestion works (with substring fallback)
- COGS auto-posts for inventory-tracking orgs

**Test coverage:**
- ~200+ tests total (up from 154)
- XSD validation tests for all four XML types (CT, BN/BC, PL, XF/XC)
- RLS isolation tests for all new tables
- Race condition tests for entry numbering
- Pre-close validation tests for all blocking conditions

---

**End of fix specification**

*Once all four waves are complete, the accounting subsystem (Components 21-23) achieves full v1.1 spec compliance and production readiness for SAT Anexo 24 monthly filing.*
