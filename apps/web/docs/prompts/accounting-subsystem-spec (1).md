# Accounting & Bookkeeping Subsystem — Technical Specification

**Components:** 21 (Chart of Accounts), 22 (Journal Entries), 23 (Financial Reports)
**Status:** Specification — ready for implementation
**Author:** Claude + Agustin
**Version:** 1.1 (revised)
**Date:** 2026-05-27
**Target platform:** SAT Compliance SaaS (Mexican SMEs)
**Regulatory basis:** Anexo 24 RMF 2026 (DOF 13/01/2026), CFF Art. 28-IV, NIF (Mexican GAAP)

---

## Revision History

**v1.0 → v1.1** (critical decisions refined after review):

1. **Filing mode relocated** from `organizations` to `fiscal_periods`. Filing obligation depends on tax regime + projected income, which can shift mid-year (e.g., a persona física crossing the $4M MXN threshold under regla 2.8.1.17). Period-level storage preserves historical accuracy when an org's regime changes.
2. **Account code format tightened** to numeric-with-hierarchy (4–12 digits, optional dot separators) instead of free-form. Added `account_code_aliases` table so legacy codes from ContPAQi, Aspel, etc. are preserved during migration without weakening the canonical schema.
3. **FX rate resolution** now follows a three-tier hierarchy (CFDI's `TipoCambio` if linked → Banxico FIX from day prior → manual with audit), not "DOF rate at posting." Added `exchange_rates` table. This prevents SAT mismatches between CFDIs and their journal entries.
4. **Posting rule customization** redesigned as a three-tier structured UI (system defaults / org overrides via table editor / per-transaction overrides), not a raw JSON editor. Storage stays JSONB; only the UI changes — but the UI change is what makes the feature actually usable for the accounting-firm market.
5. **COGS automation enabled** for organizations with inventory tracking turned on (via Component 08). Manual fallback retained for service businesses. Was: manual only for v1.
6. **SAT submission split into dual-path**: automated submission via Component 25, AND manual download of validated `.zip` files for accountants who prefer to upload via Buzón Tributario directly with their own e.firma. This matches accountant-firm workflows and is a competitive differentiator.

Sections substantially revised: 0, 2.2, 3.1, 3.3, 5.3, 5.5, 6.8, 9, 10, 11.

---

## 0. Executive Summary

This subsystem implements the bookkeeping core of the platform: a SAT-compliant chart of accounts, a double-entry journal, and the financial reports built on top of them. It is designed to satisfy two simultaneous obligations:

1. **Mexican Anexo 24 electronic accounting compliance** — for organizations whose tax regime requires filing the monthly Catálogo de Cuentas (XML CT), Balanza de Comprobación (XML BN/BC), and Pólizas (XML PL) to SAT via Buzón Tributario.
2. **General-purpose accounting** — for organizations exempt from filing (RESICO, small taxpayers under regla 2.8.1.17) who still need books for management, audit, and migration in/out of regimes.

The subsystem is built as one cohesive set of components because their schemas, business invariants, and balance-calculation logic are tightly coupled. Building them in isolation would force schema migrations between each component.

### Key design decisions resolved at the subsystem level

| Decision | Choice | Rationale |
|---|---|---|
| Hierarchy model | Materialized path (account code IS the path) + parent_id for FK | Matches how Mexican accountants think; aligns with SAT's level attribute (`Nivel`); enables fast subtree queries |
| Balance storage | Hybrid: monthly snapshots + on-demand delta from journal_entry_lines | Sub-100ms balance queries while avoiding trigger-based denormalization headaches |
| Posting model | Two-phase: `draft` → `posted` with idempotent posting | Mirrors NIF/SAT requirements; supports approval workflows |
| SAT compliance scope | Per-**period** "filing mode": `required` / `records_only` / `disabled`, with org-level default | Filing obligation depends on regime + income and can shift mid-year (crossing $4M MXN, regime change). Period-level storage preserves historical accuracy. |
| Account code as primary key in domain | Yes — code is the natural key, UUID is the surrogate. Numeric format enforced (4–12 digits). Legacy codes preserved via `account_code_aliases` | All SAT XMLs reference accounts by code; queries are by code 95% of the time. Strict format enables hierarchy enforcement; aliases enable migration from incumbents. |
| Multi-currency | Three-tier FX hierarchy: CFDI's `TipoCambio` (when UUID linked) → Banxico FIX from day prior → manual override with audit | Using DOF rate for a CFDI-linked entry creates SAT mismatches. CFDI's own rate is source of truth when linked. |
| UUID-CFDI linkage on journal lines | Required at the line level, not entry level | Anexo 24 Pólizas XML requires `UUID_CFDI` on the `CompNal` node per transaction |
| COGS posting | Automated for orgs with inventory tracking (Component 08); manual fallback for service businesses | Weighted Average (Costeo Promedio) is the dominant Mexican method and Component 08 already has the inventory primitives |
| SAT submission path | Dual: automated via Component 25 AND manual download of validated `.zip` packages | Many accountants prefer to upload via Buzón Tributario themselves with their own e.firma; locking them out would lose firm-tier customers |

### What this spec does NOT cover

- Component 24 (Tax Calculation Engine) — consumes journal data but is a separate spec
- Component 33 (SAT Catalog Service) — assumed to already serve the Código Agrupador catalog
- **Automated submission to SAT Buzón Tributario** via API — handled by Component 25 (Tax Filing Assistant). This subsystem generates, validates, optionally signs, and packages `.zip` deliverables. Component 25 then offers two paths: automated submission with the org's e.firma, OR a "Download `.zip`" button for accountants who prefer to upload manually via the SAT portal (see Section 9.6).

---

## 1. Regulatory Context — What SAT Requires

### 1.1 Legal foundation

- **CFF Art. 28, fracción IV** — obligation to maintain accounting in electronic media
- **Reglas RMF 2.8.1.6, 2.8.1.7, 2.8.1.10** — operational rules for electronic accounting submission
- **Anexo 24 RMF 2026** (DOF 13/01/2026) — technical specification; unchanged from 2024 version except minor adjustments to the financial-sector code
- **Anexo 25** — catalogs referenced by Anexo 24 (currencies, banks, payment methods)

### 1.2 Required XML deliverables

| Document | XSD Version | Frequency | Required for |
|---|---|---|---|
| Catálogo de Cuentas (CT) | 1.3 | Initial + on changes | All non-exempt orgs |
| Balanza de Comprobación Normal (BN) | 1.3 | Monthly | All non-exempt orgs |
| Balanza de Comprobación Complementaria (BC) | 1.3 | On corrections | When BN is corrected |
| Pólizas del Período (PL) | 1.3 | On SAT request | All non-exempt orgs (kept ready) |
| Auxiliar de Folios (XF) | 1.3 | On SAT request | All non-exempt orgs |
| Auxiliar de Cuentas (XC) | 1.3 | On SAT request | All non-exempt orgs |

XSD namespace base: `http://www.sat.gob.mx/esquemas/ContabilidadE/1_3/`

### 1.3 Who is required to file

**Required to file monthly:**
- Personas morales under Régimen General (Art. 9 LISR)
- Personas físicas with actividades empresariales/profesionales over $4M MXN annual income (regla 2.8.1.17)
- Personas físicas in arrendamiento over $4M MXN
- Personas morales con fines no lucrativos (Título III LISR)

**Exempt from filing (but must keep records 5 years):**
- RESICO personas físicas and morales (regla 3.13.16 RMF) — uses "Mis Cuentas"
- Personas físicas under $4M MXN income (regla 2.8.1.17)
- RIF (legacy, transitorio décimo séptimo RMF 2026)
- Wage earners

> **Design implication — temporal shifts.** Filing obligation can change *within* a fiscal year. A persona física in actividades empresariales who crosses $4M MXN in projected income, or an RESICO contributor who exceeds the regime's income cap, moves from exempt to required. Conversely, a régimen-general taxpayer who switches regimes drops the obligation prospectively. **Historical periods retain their original filing mode.** This is why `filing_mode` lives on `fiscal_periods`, not `organizations` (see Section 3.1.2).

### 1.4 Filing schedule (when required)

| Taxpayer | Deadline |
|---|---|
| Personas morales | By the 3rd business day of the 2nd month after the period (typically the 5th) |
| Personas físicas | By the 5th business day of the 2nd month after the period (typically the 7th) |

### 1.5 File naming convention (mandatory)

Format: `RFC + YYYY + MM + TIPO + .xml`, then zipped.

| Type | Code | Example |
|---|---|---|
| Catálogo | CT | `XAXX010101XXX201701CT.xml` |
| Balanza Normal | BN | `XAXX010101XXX201704BN.xml` |
| Balanza Complementaria | BC | `XAXX010101XXX201707BC.xml` |
| Pólizas | PL | `XAXX010101XXX201703PL.xml` |
| Auxiliar Folios | XF | `XAXX010101XXX201703XF.xml` |
| Auxiliar Cuentas | XC | `XAXX010101XXX201703XC.xml` |

### 1.6 Código Agrupador SAT

Every account in the contributor's catalog must be mapped to a SAT-defined "Código Agrupador" code. This is the keystone compliance requirement. The catalog is hierarchical:

- **Level 1 (Cuenta de Mayor)** — e.g., `100` = Activo
- **Level 2 (Subcuenta de Primer Nivel)** — e.g., `101` = Caja
- **Sub-levels** — Contributor-defined, up to typically 6 levels

The 2024 version of the agrupador catalog remains current for 2026 — only minor adjustment was the financial-sector code "000" → "0".

Major top-level groupings:
- **100–199**: Activo (Assets)
- **200–299**: Pasivo (Liabilities)
- **300–399**: Capital (Equity)
- **400–499**: Ingresos (Revenue)
- **500–599**: Costos (Cost of Sales)
- **600–699**: Gastos (Expenses)
- **700–799**: Resultado Integral de Financiamiento
- **800–899**: Otros Ingresos / Gastos
- **900–999**: Cuentas de Orden

The full catalog (~400 codes) must be loaded into the platform — this lives in Component 33 (SAT Catalog Service).

---

## 2. Architecture Overview

### 2.1 How components 21–23 fit together

```
                ┌─────────────────────────────────┐
                │  Component 21: Chart of Accounts │
                │  - Defines accounts             │
                │  - Maps to SAT código agrupador │
                │  - Hierarchical structure       │
                └────────────┬────────────────────┘
                             │ accounts referenced by
                             ▼
                ┌─────────────────────────────────┐
                │  Component 22: Journal Entries  │
                │  - Records every transaction    │
                │  - Debits = Credits (invariant) │
                │  - Links UUIDs of CFDIs         │
                │  - Auto-generated from:         │
                │    • Invoices (Comp 12)         │
                │    • Payments (Comp 18)         │
                │    • Expenses (Comp 20)         │
                └────────────┬────────────────────┘
                             │ aggregated by
                             ▼
                ┌─────────────────────────────────┐
                │  Comp 23: Financial Reports     │
                │  - Income Statement             │
                │  - Balance Sheet                │
                │  - Cash Flow                    │
                │  - Trial Balance (= Balanza)    │
                │  - General Ledger (= Pólizas)   │
                │  - SAT XML generation           │
                └─────────────────────────────────┘
```

### 2.2 Integration with existing components

| Source component | What it produces | What this subsystem does with it |
|---|---|---|
| Component 04 (Organization) | Tax regime, RFC, fiscal year start, `default_filing_mode` | Seeds filing mode at fiscal period creation (overridable per period); provides RFC for XML; defines period boundaries |
| Component 08 (Product/Service) | Inventory tracking flag, weighted average cost | Drives automated COGS posting when invoice items reference tracked products |
| Component 12 (Invoice) | Stamped CFDI with UUID | Auto-generates Pólizas de Ingreso; UUID stored on journal lines |
| Component 14 (Digital Signature) | CSD certificate | Optionally signs Balanza XMLs (SAT does not require this but some PACs offer it as a service) |
| Component 18 (Payment) | Recorded payments with their own UUIDs | Auto-generates Pólizas de Egreso (when org paying) or Ingreso (when org receiving payment for invoice) |
| Component 20 (Expense) | CFDI expense with UUID | Auto-generates Pólizas de Egreso |
| Component 32 (Job Queue) | Async processing | Heavy report generation, XML batch creation, balance snapshot rollovers |
| Component 37 (Audit Log) | Activity logging | Every journal entry creation/posting/reversal logged immutably |

### 2.3 Module layout in monorepo

Following your existing convention (`src/server/<domain>/`):

```
src/server/accounting/
├── shared/
│   ├── types.ts                  # Cross-component domain types
│   ├── schemas.ts                # Zod validation schemas
│   ├── constants.ts              # Account natures, posting modes, etc.
│   └── errors.ts                 # Custom errors (UnbalancedEntry, etc.)
│
├── chart-of-accounts/            # COMPONENT 21
│   ├── service.ts
│   ├── repository.ts
│   ├── validation.ts
│   ├── hierarchy.ts              # Tree operations (CTEs)
│   ├── seeder.ts                 # Default chart from template
│   ├── templates/
│   │   ├── mexico-pyme.ts        # SME-friendly default chart
│   │   ├── mexico-resico.ts      # Minimal chart for RESICO
│   │   ├── mexico-general.ts     # Full chart for Régimen General
│   │   └── us-gaap.ts            # Optional, for cross-border clients
│   └── sat-agrupador/
│       ├── catalog.ts            # Wraps Component 33 to expose agrupador
│       └── mapper.ts             # Auto-suggest agrupador from name/type
│
├── journal-entries/              # COMPONENT 22
│   ├── service.ts
│   ├── repository.ts
│   ├── validation.ts             # Balance invariant, account validity
│   ├── workflow.ts               # draft → posted → reversed state machine
│   ├── auto-posting/
│   │   ├── from-invoice.ts       # Invoice stamped → entry
│   │   ├── from-payment.ts       # Payment recorded → entry
│   │   ├── from-expense.ts       # Expense approved → entry
│   │   └── templates.ts          # Configurable posting rules
│   ├── reversal.ts               # Idempotent reversal logic
│   └── period-lock.ts            # Prevent posting to closed periods
│
├── balances/                     # CROSS-CUTTING (used by 21, 22, 23)
│   ├── service.ts                # Get balance at any date
│   ├── snapshot.ts               # Monthly closing snapshots
│   ├── cache.ts                  # Redis hot cache
│   └── recalculation.ts          # Rebuild snapshots on data fix
│
├── reports/                      # COMPONENT 23
│   ├── service.ts
│   ├── income-statement.ts
│   ├── balance-sheet.ts
│   ├── cash-flow.ts
│   ├── trial-balance.ts          # Maps to Balanza de Comprobación
│   ├── general-ledger.ts         # Auxiliares de cuenta
│   └── export/
│       ├── pdf.ts
│       ├── xlsx.ts               # Use existing skill
│       └── csv.ts
│
└── sat-xml/                      # ANEXO 24 XML GENERATION
    ├── catalog-xml.ts            # CT XML
    ├── balanza-xml.ts            # BN/BC XML
    ├── polizas-xml.ts            # PL XML
    ├── auxiliar-folios-xml.ts    # XF XML
    ├── auxiliar-cuentas-xml.ts   # XC XML
    ├── file-naming.ts            # RFC+YYYY+MM+CODE
    ├── validator.ts              # XSD validation before output
    └── packager.ts               # Bundle as .zip per SAT spec
```

---

## 3. Shared Data Model

This is the highest-leverage section of the spec. Get this right and the three components compose naturally.

### 3.1 Database schema

All tables use `organization_id` for RLS scoping. RLS policies are mandatory and tested.

#### 3.1.1 `accounts` (Component 21)

```sql
CREATE TABLE accounts (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,

    -- Identification (code is the natural key within an org)
    -- Format: 4-12 digits with optional dot separators (e.g., "1101001" or "1.1.01.001")
    -- The dot-separated form is canonicalized to the digit-only form on write.
    code            VARCHAR(20)  NOT NULL,
    name            VARCHAR(200) NOT NULL,
    description     TEXT,

    -- SAT Anexo 24 compliance (REQUIRED if any fiscal_period for the org is in filing-mode 'required')
    sat_agrupador_code VARCHAR(20),              -- e.g., "101.01" (Caja)
    sat_nivel       SMALLINT NOT NULL,           -- 1 to 6; explicit per SAT spec
    sat_naturaleza  CHAR(1) NOT NULL,            -- 'D' (deudora) or 'A' (acreedora)

    -- Hierarchy
    parent_id       UUID REFERENCES accounts(id),
    materialized_path TEXT NOT NULL,             -- e.g., "100.110.1101.1101001"
    is_postable     BOOLEAN NOT NULL DEFAULT TRUE,  -- false for header/summary accounts

    -- Classification
    account_type    account_type_enum NOT NULL,  -- See enum below
    account_subtype account_subtype_enum,        -- More granular, optional

    -- Configuration
    currency_code   CHAR(3) NOT NULL DEFAULT 'MXN',
    requires_uuid   BOOLEAN NOT NULL DEFAULT FALSE, -- Forces UUID_CFDI on journal lines
    requires_third_party BOOLEAN NOT NULL DEFAULT FALSE, -- e.g., AR/AP need customer/vendor

    -- Lifecycle
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    effective_from  DATE NOT NULL DEFAULT CURRENT_DATE,
    effective_to    DATE,

    -- Audit
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by      UUID NOT NULL REFERENCES users(id),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_by      UUID REFERENCES users(id),
    deleted_at      TIMESTAMPTZ,                 -- Soft delete

    CONSTRAINT unique_code_per_org UNIQUE (organization_id, code),
    CONSTRAINT valid_naturaleza CHECK (sat_naturaleza IN ('D', 'A')),
    CONSTRAINT valid_nivel CHECK (sat_nivel BETWEEN 1 AND 6),
    -- Canonicalized code: 4-12 digits, no separators (e.g., "1101001")
    -- Display form with dots is reconstructed from materialized_path
    CONSTRAINT valid_code_format CHECK (code ~ '^[0-9]{4,12}$')
);

CREATE TYPE account_type_enum AS ENUM (
    'asset',         -- Activo (100)
    'liability',     -- Pasivo (200)
    'equity',        -- Capital (300)
    'revenue',       -- Ingresos (400)
    'cost_of_sales', -- Costos (500)
    'expense',       -- Gastos (600)
    'financial_result', -- RIF (700)
    'other_income_expense', -- Otros (800)
    'order'          -- Cuentas de Orden (900)
);

CREATE INDEX idx_accounts_org_code ON accounts(organization_id, code) WHERE deleted_at IS NULL;
CREATE INDEX idx_accounts_org_path ON accounts(organization_id, materialized_path) WHERE deleted_at IS NULL;
CREATE INDEX idx_accounts_org_parent ON accounts(organization_id, parent_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_accounts_org_type ON accounts(organization_id, account_type) WHERE deleted_at IS NULL AND is_active = TRUE;
CREATE INDEX idx_accounts_agrupador ON accounts(organization_id, sat_agrupador_code) WHERE deleted_at IS NULL;

-- RLS
ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY accounts_tenant_isolation ON accounts
    USING (organization_id = current_setting('app.organization_id')::UUID);
```

#### 3.1.1.1 `account_code_aliases` (migration support)

When migrating an org from ContPAQi, Aspel COI, Bind ERP, or hand-rolled chart, their legacy codes may not fit the strict numeric format (some incumbents use `1-101-001` or `ACT-CAJA-001`). We preserve these as searchable aliases without polluting the canonical schema.

```sql
CREATE TABLE account_code_aliases (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id),
    account_id      UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    alias_code      VARCHAR(100) NOT NULL,        -- Free-form, the legacy/external code
    alias_source    VARCHAR(50),                  -- e.g., 'contpaqi', 'aspel', 'manual_import', 'partner_erp'
    is_primary_display BOOLEAN NOT NULL DEFAULT FALSE,  -- If true, show this code in UI instead of canonical

    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT unique_alias_per_org UNIQUE (organization_id, alias_code)
);

CREATE INDEX idx_alias_account ON account_code_aliases(account_id);
CREATE INDEX idx_alias_lookup ON account_code_aliases(organization_id, alias_code);

ALTER TABLE account_code_aliases ENABLE ROW LEVEL SECURITY;
CREATE POLICY alias_tenant_isolation ON account_code_aliases
    USING (organization_id = current_setting('app.organization_id')::UUID);
```

**Usage:** Search/lookup endpoints accept either canonical code or alias and resolve to the underlying account. When the org sets `is_primary_display=true` on an alias, the UI shows the legacy code throughout while XML generation still uses the canonical code — accountants never have to retrain on new codes.

#### 3.1.2 `fiscal_periods` (shared by 22, 23)

```sql
CREATE TABLE fiscal_periods (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id),
    year            SMALLINT NOT NULL,
    month           SMALLINT NOT NULL,           -- 1-12 (and 13 for adjustment period)
    status          period_status_enum NOT NULL DEFAULT 'open',
    closed_at       TIMESTAMPTZ,
    closed_by       UUID REFERENCES users(id),

    -- Filing obligation FOR THIS PERIOD specifically.
    -- Seeded from organizations.default_filing_mode at period creation,
    -- but can be overridden (e.g., when an org crosses the $4M MXN threshold mid-year).
    -- Historical periods retain their original filing_mode regardless of later regime changes.
    filing_mode     filing_mode_enum NOT NULL,
    filing_mode_reason TEXT,                     -- Required if overridden from org default
    filing_mode_set_by UUID REFERENCES users(id),

    -- For SAT filing tracking
    balanza_filed_at TIMESTAMPTZ,
    balanza_xml_id  UUID,                        -- FK to file_storage
    catalog_filed_at TIMESTAMPTZ,
    catalog_last_changed_at TIMESTAMPTZ,         -- Triggers catalog refile if changed after initial filing

    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT unique_period UNIQUE (organization_id, year, month),
    CONSTRAINT valid_month CHECK (month BETWEEN 1 AND 13)
);

CREATE TYPE period_status_enum AS ENUM ('open', 'closing', 'closed', 'reopened');
CREATE TYPE filing_mode_enum AS ENUM ('required', 'records_only', 'disabled');
```

> **Schema change to `organizations` table** (Component 04 migration): add column `default_filing_mode filing_mode_enum NOT NULL` with a CHECK constraint linking it to the org's tax regime (e.g., 626/RESICO defaults to `records_only`; 601/General defaults to `required`). The default is *seeded* into each new `fiscal_periods` row but is not authoritative once seeded — admins can change a period's filing mode independently.

#### 3.1.3 `journal_entries` (Component 22)

```sql
CREATE TABLE journal_entries (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,

    -- Identification
    entry_number    VARCHAR(50) NOT NULL,        -- Sequential per org per year
    fiscal_period_id UUID NOT NULL REFERENCES fiscal_periods(id),
    entry_date      DATE NOT NULL,               -- Effective accounting date

    -- Anexo 24 classification (mandatory for filing orgs)
    poliza_type     poliza_type_enum NOT NULL,   -- 'ingreso', 'egreso', 'diario'
    description     TEXT NOT NULL,

    -- Workflow
    status          entry_status_enum NOT NULL DEFAULT 'draft',
    posted_at       TIMESTAMPTZ,
    posted_by       UUID REFERENCES users(id),

    -- Reversal tracking
    reverses_entry_id UUID REFERENCES journal_entries(id),
    reversed_by_entry_id UUID REFERENCES journal_entries(id),

    -- Source tracking (auto-generated entries)
    source_type     source_type_enum,            -- 'invoice', 'payment', 'expense', 'manual', 'adjustment'
    source_id       UUID,                        -- FK to source record
    source_uuid_cfdi VARCHAR(36),                -- UUID of source CFDI if applicable

    -- Currency
    currency_code   CHAR(3) NOT NULL DEFAULT 'MXN',
    exchange_rate   NUMERIC(18, 6) NOT NULL DEFAULT 1.0,

    -- Computed totals (denormalized for performance and integrity validation)
    total_debit     NUMERIC(18, 2) NOT NULL,
    total_credit    NUMERIC(18, 2) NOT NULL,

    -- Audit
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by      UUID NOT NULL REFERENCES users(id),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_by      UUID REFERENCES users(id),

    CONSTRAINT unique_entry_number UNIQUE (organization_id, entry_number),
    CONSTRAINT balanced_entry CHECK (total_debit = total_credit),
    CONSTRAINT posted_has_timestamp CHECK (
        (status = 'posted' AND posted_at IS NOT NULL) OR
        (status != 'posted')
    )
);

CREATE TYPE poliza_type_enum AS ENUM ('ingreso', 'egreso', 'diario');
CREATE TYPE entry_status_enum AS ENUM ('draft', 'posted', 'reversed');
CREATE TYPE source_type_enum AS ENUM ('invoice', 'payment', 'expense', 'manual', 'adjustment', 'opening_balance', 'closing');

CREATE INDEX idx_entries_org_date ON journal_entries(organization_id, entry_date) WHERE status = 'posted';
CREATE INDEX idx_entries_org_period ON journal_entries(organization_id, fiscal_period_id);
CREATE INDEX idx_entries_source ON journal_entries(organization_id, source_type, source_id);
CREATE INDEX idx_entries_uuid ON journal_entries(organization_id, source_uuid_cfdi) WHERE source_uuid_cfdi IS NOT NULL;

ALTER TABLE journal_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY entries_tenant_isolation ON journal_entries
    USING (organization_id = current_setting('app.organization_id')::UUID);
```

#### 3.1.4 `journal_entry_lines`

```sql
CREATE TABLE journal_entry_lines (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id),
    journal_entry_id UUID NOT NULL REFERENCES journal_entries(id) ON DELETE CASCADE,

    -- Order within entry
    line_number     SMALLINT NOT NULL,           -- 1, 2, 3...

    -- Account
    account_id      UUID NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
    account_code    VARCHAR(50) NOT NULL,        -- Denormalized for performance & history

    -- Amounts (exactly one of debit/credit is non-zero)
    debit           NUMERIC(18, 2) NOT NULL DEFAULT 0,
    credit          NUMERIC(18, 2) NOT NULL DEFAULT 0,

    -- Description
    description     TEXT,

    -- Anexo 24 CompNal nodes — required when relating to a CFDI
    uuid_cfdi       VARCHAR(36),                 -- UUID of related CFDI
    rfc_third_party VARCHAR(13),                 -- RFC of the other party
    monto_total_comp NUMERIC(18, 2),             -- Total of the related CFDI
    moneda_comp     CHAR(3),                     -- Currency of the related CFDI
    tipo_cambio_comp NUMERIC(18, 6),             -- FX rate of the related CFDI

    -- Anexo 24 Cheque / Transferencia / OtrMetodoPago nodes (for cash flow tracking)
    payment_method  VARCHAR(20),                 -- 'cheque', 'transferencia', 'otro'
    bank_account    VARCHAR(50),
    bank_code       VARCHAR(10),                 -- From SAT bank catalog (Anexo 25)
    payment_reference VARCHAR(100),              -- Check number, transfer ref, etc.

    -- Third party tracking (for AR/AP accounts)
    third_party_id  UUID,                        -- Could ref customers or suppliers
    third_party_type VARCHAR(20),                -- 'customer', 'supplier', 'employee'

    -- Audit
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT debit_xor_credit CHECK (
        (debit > 0 AND credit = 0) OR
        (debit = 0 AND credit > 0)
    ),
    CONSTRAINT non_negative_amounts CHECK (debit >= 0 AND credit >= 0),
    CONSTRAINT unique_line_per_entry UNIQUE (journal_entry_id, line_number)
);

CREATE INDEX idx_lines_org_account_date ON journal_entry_lines(organization_id, account_id, created_at);
CREATE INDEX idx_lines_account_id ON journal_entry_lines(account_id);
CREATE INDEX idx_lines_uuid ON journal_entry_lines(uuid_cfdi) WHERE uuid_cfdi IS NOT NULL;

ALTER TABLE journal_entry_lines ENABLE ROW LEVEL SECURITY;
CREATE POLICY lines_tenant_isolation ON journal_entry_lines
    USING (organization_id = current_setting('app.organization_id')::UUID);
```

#### 3.1.4.1 `exchange_rates` (multi-currency support)

Resolves the three-tier FX hierarchy. This table is **not** RLS-scoped — exchange rates are public information shared across all orgs (cache hits on Banxico's daily FIX rate, in particular).

```sql
CREATE TABLE exchange_rates (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    currency_from   CHAR(3) NOT NULL,             -- ISO 4217
    currency_to     CHAR(3) NOT NULL DEFAULT 'MXN',
    rate_date       DATE NOT NULL,
    rate            NUMERIC(18, 6) NOT NULL,
    source          rate_source_enum NOT NULL,
    source_reference TEXT,                        -- e.g., CFDI UUID if source='cfdi'; Banxico series ID; DOF publication URL
    organization_id UUID REFERENCES organizations(id),  -- NULL for shared Banxico/DOF rates; set for org-specific CFDI/manual

    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by      UUID REFERENCES users(id),

    CONSTRAINT unique_shared_rate UNIQUE (currency_from, currency_to, rate_date, source)
        DEFERRABLE INITIALLY DEFERRED
);

CREATE TYPE rate_source_enum AS ENUM ('cfdi', 'banxico_fix', 'dof', 'manual');

CREATE INDEX idx_rate_lookup ON exchange_rates(currency_from, currency_to, rate_date DESC, source);
CREATE INDEX idx_rate_org ON exchange_rates(organization_id, rate_date) WHERE organization_id IS NOT NULL;
```

**Resolution function** (see Section 5.3 for usage):

```typescript
// Returns the rate to use for a journal entry line, following the three-tier hierarchy.
async function resolveExchangeRate(
  currency: string,
  entryDate: Date,
  context: {
    uuidCfdi?: string;
    cfdiTipoCambio?: number;  // From the source CFDI if available
    manualOverride?: { rate: number; reason: string; userId: string };
  }
): Promise<{ rate: number; source: 'cfdi' | 'banxico_fix' | 'dof' | 'manual' | 'native'; reference?: string }> {
  if (currency === 'MXN') return { rate: 1.0, source: 'native' };

  // Tier 1: CFDI's own TipoCambio (highest priority — SAT will compare)
  if (context.uuidCfdi && context.cfdiTipoCambio) {
    await persistRate({ currency, rate: context.cfdiTipoCambio, date: entryDate, source: 'cfdi', reference: context.uuidCfdi });
    return { rate: context.cfdiTipoCambio, source: 'cfdi', reference: context.uuidCfdi };
  }

  // Tier 3: Manual override (only if explicitly provided; jumps ahead of Tier 2 because operator chose to)
  if (context.manualOverride) {
    await auditLog.record({ type: 'fx_manual_override', ...context.manualOverride });
    await persistRate({ currency, rate: context.manualOverride.rate, date: entryDate, source: 'manual', reference: context.manualOverride.reason });
    return { rate: context.manualOverride.rate, source: 'manual', reference: context.manualOverride.reason };
  }

  // Tier 2: Banxico FIX from the business day prior to entryDate
  const dayPrior = previousBusinessDay(entryDate);
  let banxicoRate = await getRateFromCache(currency, 'MXN', dayPrior, 'banxico_fix');
  if (!banxicoRate) {
    banxicoRate = await fetchFromBanxico(currency, dayPrior);
    if (banxicoRate) {
      await persistRate({ currency, rate: banxicoRate, date: dayPrior, source: 'banxico_fix' });
    }
  }
  if (banxicoRate) return { rate: banxicoRate, source: 'banxico_fix' };

  // No rate available → require manual override
  throw new ExchangeRateRequiredError(currency, entryDate);
}
```

**Why this hierarchy:**
- **CFDI first**: SAT validates that the FX rate on the journal entry matches the source CFDI. Using any other rate creates an Anexo 24 mismatch.
- **Banxico FIX second**: The official rate publishing source. DOF publishes Banxico's rate one day later — Banxico is upstream.
- **Manual third**: Always allowed, always logged. Some edge cases (forward contracts, internal transfer pricing) legitimately need it.
- **Banxico fetch**: A nightly job (Component 32) pre-fetches FIX rates for all currencies the org uses, so lookups are cache hits 99% of the time.

#### 3.1.5 `account_balance_snapshots` (performance optimization)

```sql
CREATE TABLE account_balance_snapshots (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id),
    account_id      UUID NOT NULL REFERENCES accounts(id),
    fiscal_period_id UUID NOT NULL REFERENCES fiscal_periods(id),

    -- Balances at the END of this period
    opening_balance NUMERIC(18, 2) NOT NULL,     -- Balance at start of period
    total_debit     NUMERIC(18, 2) NOT NULL,     -- Sum of debits in period
    total_credit    NUMERIC(18, 2) NOT NULL,     -- Sum of credits in period
    closing_balance NUMERIC(18, 2) NOT NULL,     -- Balance at end of period

    -- When was this snapshot generated/sealed
    generated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    is_sealed       BOOLEAN NOT NULL DEFAULT FALSE,  -- TRUE after period closed
    sealed_at       TIMESTAMPTZ,

    CONSTRAINT unique_snapshot UNIQUE (organization_id, account_id, fiscal_period_id)
);

CREATE INDEX idx_snapshot_org_period ON account_balance_snapshots(organization_id, fiscal_period_id);
CREATE INDEX idx_snapshot_account ON account_balance_snapshots(account_id);
```

#### 3.1.6 `posting_rules` (auto-posting configuration)

```sql
CREATE TABLE posting_rules (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id),

    rule_name       VARCHAR(100) NOT NULL,
    trigger_event   VARCHAR(50) NOT NULL,        -- e.g., 'invoice.stamped', 'payment.recorded'

    -- Rule definition (JSONB for flexibility)
    rule_definition JSONB NOT NULL,
    -- Example structure:
    -- {
    --   "lines": [
    --     {"side": "debit",  "account_code": "1130001", "amount_source": "subtotal"},
    --     {"side": "debit",  "account_code": "1180001", "amount_source": "iva"},
    --     {"side": "credit", "account_code": "4100001", "amount_source": "subtotal"},
    --     {"side": "credit", "account_code": "2120001", "amount_source": "iva"}
    --   ],
    --   "conditions": {"tax_regime": "601"}
    -- }

    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    priority        SMALLINT NOT NULL DEFAULT 0,

    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT unique_rule_name UNIQUE (organization_id, rule_name)
);
```

### 3.2 Shared TypeScript types

```typescript
// src/server/accounting/shared/types.ts

export type AccountType =
  | 'asset' | 'liability' | 'equity'
  | 'revenue' | 'cost_of_sales' | 'expense'
  | 'financial_result' | 'other_income_expense' | 'order';

export type Naturaleza = 'D' | 'A';  // SAT terminology

export type PolizaType = 'ingreso' | 'egreso' | 'diario';

export type EntryStatus = 'draft' | 'posted' | 'reversed';

export type SourceType =
  | 'invoice' | 'payment' | 'expense'
  | 'manual' | 'adjustment'
  | 'opening_balance' | 'closing';

export interface Account {
  id: string;
  organizationId: string;
  code: string;
  name: string;
  description?: string;
  satAgrupadorCode?: string;
  satNivel: number;
  satNaturaleza: Naturaleza;
  parentId?: string;
  materializedPath: string;
  isPostable: boolean;
  accountType: AccountType;
  currencyCode: string;
  requiresUuid: boolean;
  requiresThirdParty: boolean;
  isActive: boolean;
  effectiveFrom: Date;
  effectiveTo?: Date;
  // ... audit fields
}

export interface JournalEntry {
  id: string;
  organizationId: string;
  entryNumber: string;
  fiscalPeriodId: string;
  entryDate: Date;
  polizaType: PolizaType;
  description: string;
  status: EntryStatus;
  postedAt?: Date;
  reversesEntryId?: string;
  reversedByEntryId?: string;
  sourceType?: SourceType;
  sourceId?: string;
  sourceUuidCfdi?: string;
  currencyCode: string;
  exchangeRate: number;
  totalDebit: number;
  totalCredit: number;
  lines: JournalEntryLine[];
  // ... audit fields
}

export interface JournalEntryLine {
  id: string;
  journalEntryId: string;
  lineNumber: number;
  accountId: string;
  accountCode: string;
  debit: number;
  credit: number;
  description?: string;
  // Anexo 24 CompNal
  uuidCfdi?: string;
  rfcThirdParty?: string;
  montoTotalComp?: number;
  monedaComp?: string;
  tipoCambioComp?: number;
  // Anexo 24 payment nodes
  paymentMethod?: 'cheque' | 'transferencia' | 'otro';
  bankAccount?: string;
  bankCode?: string;
  paymentReference?: string;
  // Third party
  thirdPartyId?: string;
  thirdPartyType?: 'customer' | 'supplier' | 'employee';
}

export interface AccountBalance {
  accountId: string;
  accountCode: string;
  openingBalance: number;
  totalDebit: number;
  totalCredit: number;
  closingBalance: number;
  asOfDate: Date;
}

export interface AccountHierarchyNode extends Account {
  children: AccountHierarchyNode[];
  depth: number;
  hasTransactions: boolean;  // Computed for delete validation
}
```

### 3.3 Shared Zod schemas

```typescript
// src/server/accounting/shared/schemas.ts
import { z } from 'zod';

// Canonical: digits only, 4-12 chars (matches DB CHECK constraint).
// Accepts dot-separated form on input (e.g., "1.1.01.001") and normalizes to "1101001".
export const accountCodeSchema = z.string()
  .transform(s => s.replace(/\./g, ''))  // Strip dots on input
  .pipe(
    z.string()
      .regex(/^[0-9]{4,12}$/, 'Account code must be 4-12 digits (dots allowed as separators)')
  );

// Alias codes can be free-form (legacy migration support)
export const accountAliasCodeSchema = z.string()
  .min(1).max(100)
  .regex(/^[A-Za-z0-9\-\.\_]+$/, 'Alias code: alphanumeric with -, ., _ only');

export const satAgrupadorSchema = z.string()
  .regex(/^[0-9]+(\.[0-9]+)?$/, 'Invalid SAT agrupador code format');

export const naturalezaSchema = z.enum(['D', 'A']);

export const createAccountSchema = z.object({
  code: accountCodeSchema,
  name: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  satAgrupadorCode: satAgrupadorSchema.optional(), // Required only if org filing-mode is 'required'
  satNivel: z.number().int().min(1).max(6),
  satNaturaleza: naturalezaSchema,
  parentCode: accountCodeSchema.optional(),
  accountType: z.enum([
    'asset', 'liability', 'equity', 'revenue',
    'cost_of_sales', 'expense', 'financial_result',
    'other_income_expense', 'order'
  ]),
  currencyCode: z.string().length(3).default('MXN'),
  isPostable: z.boolean().default(true),
  requiresUuid: z.boolean().default(false),
  requiresThirdParty: z.boolean().default(false),
});

export const journalLineSchema = z.object({
  accountCode: accountCodeSchema,
  debit: z.number().nonnegative().default(0),
  credit: z.number().nonnegative().default(0),
  description: z.string().max(500).optional(),
  uuidCfdi: z.string().uuid().optional(),
  rfcThirdParty: z.string().min(12).max(13).optional(),
  // ... etc.
}).refine(
  data => (data.debit > 0) !== (data.credit > 0),
  { message: 'Each line must have exactly one of debit or credit > 0' }
);

export const createJournalEntrySchema = z.object({
  entryDate: z.coerce.date(),
  polizaType: z.enum(['ingreso', 'egreso', 'diario']),
  description: z.string().min(1).max(1000),
  currencyCode: z.string().length(3).default('MXN'),
  exchangeRate: z.number().positive().default(1.0),
  lines: z.array(journalLineSchema).min(2),  // Must have at least one debit and one credit
}).refine(
  data => {
    const totalDebit = data.lines.reduce((s, l) => s + (l.debit || 0), 0);
    const totalCredit = data.lines.reduce((s, l) => s + (l.credit || 0), 0);
    return Math.abs(totalDebit - totalCredit) < 0.01;  // Allow for rounding
  },
  { message: 'Total debits must equal total credits' }
);
```

---

## 4. Component 21: Chart of Accounts

### 4.1 Purpose

Manage the organization's chart of accounts: account creation, hierarchy, mapping to SAT Código Agrupador, balance tracking, and lifecycle management.

### 4.2 Service interface

```typescript
// src/server/accounting/chart-of-accounts/service.ts

export interface ChartOfAccountsService {
  // CRUD
  createAccount(orgId: string, data: CreateAccountInput, userId: string): Promise<Account>;
  updateAccount(accountId: string, data: UpdateAccountInput, userId: string): Promise<Account>;
  getAccount(accountId: string): Promise<Account>;
  getAccountByCode(orgId: string, code: string): Promise<Account>;
  listAccounts(orgId: string, filters: AccountFilters, pagination: Pagination): Promise<PaginatedResult<Account>>;
  softDeleteAccount(accountId: string, userId: string): Promise<void>;

  // Hierarchy operations
  getAccountHierarchy(orgId: string, options?: { rootCode?: string; maxDepth?: number }): Promise<AccountHierarchyNode[]>;
  getAccountAncestors(accountId: string): Promise<Account[]>;
  getAccountDescendants(accountId: string): Promise<Account[]>;
  moveAccount(accountId: string, newParentId: string | null, userId: string): Promise<Account>;

  // Balance queries
  getAccountBalance(accountId: string, asOfDate: Date): Promise<AccountBalance>;
  getAccountBalanceWithChildren(accountId: string, asOfDate: Date): Promise<AccountBalance>;
  getMultipleBalances(orgId: string, accountIds: string[], asOfDate: Date): Promise<Map<string, AccountBalance>>;

  // SAT compliance
  validateChartForFiling(orgId: string): Promise<ChartValidationResult>;
  suggestAgrupadorCode(accountName: string, accountType: AccountType): Promise<SuggestedAgrupador[]>;

  // Default chart creation
  seedDefaultChart(orgId: string, template: ChartTemplate, userId: string): Promise<{ accountsCreated: number }>;

  // Lifecycle / migrations
  bulkImportAccounts(orgId: string, accounts: CreateAccountInput[], userId: string): Promise<BulkImportResult>;
  exportChart(orgId: string, format: 'json' | 'csv' | 'xml'): Promise<Buffer>;
}
```

### 4.3 Critical business rules

1. **Account code uniqueness**: enforced at DB level per org (`unique_code_per_org`).
2. **Hierarchy integrity**:
   - A child account's `materialized_path` MUST start with its parent's path
   - A child account's `sat_nivel` MUST be `parent.sat_nivel + 1`
   - Cycle prevention: implemented in `validateHierarchy()` via path check
3. **SAT compliance gating**:
   - If `organization.accounting_filing_mode = 'required'`, then `sat_agrupador_code` is mandatory on all postable accounts
   - If filing mode is `'records_only'` or `'disabled'`, `sat_agrupador_code` is optional
4. **Postable vs header accounts**: Header accounts (non-postable) cannot receive journal entry lines. They aggregate child balances only.
5. **Delete restrictions**:
   - Cannot delete an account with posted journal entries — only soft-delete + set `effective_to`
   - Cannot delete an account with active children — must reparent first
6. **Currency consistency**: An account's currency cannot be changed if it has transactions. Multi-currency entries handle FX at the line level using `exchange_rate`.
7. **Nature enforcement**: When computing balances, balance = sum(debits) - sum(credits) if `naturaleza='D'`, else sum(credits) - sum(debits). This produces "natural" positive balances.

### 4.4 Hierarchy implementation

Using PostgreSQL recursive CTEs for tree operations. Materialized path is denormalized for fast subtree queries; `parent_id` is the source of truth.

```typescript
// src/server/accounting/chart-of-accounts/hierarchy.ts

export async function getAccountHierarchy(
  orgId: string,
  options?: { rootCode?: string; maxDepth?: number }
): Promise<AccountHierarchyNode[]> {
  const query = `
    WITH RECURSIVE account_tree AS (
      -- Root nodes
      SELECT
        id, code, name, parent_id, materialized_path,
        sat_nivel, sat_naturaleza, account_type, is_postable,
        sat_agrupador_code,
        0 AS depth
      FROM accounts
      WHERE organization_id = $1
        AND deleted_at IS NULL
        ${options?.rootCode
          ? "AND code = $2"
          : "AND parent_id IS NULL"
        }

      UNION ALL

      -- Children
      SELECT
        a.id, a.code, a.name, a.parent_id, a.materialized_path,
        a.sat_nivel, a.sat_naturaleza, a.account_type, a.is_postable,
        a.sat_agrupador_code,
        at.depth + 1
      FROM accounts a
      INNER JOIN account_tree at ON a.parent_id = at.id
      WHERE a.organization_id = $1
        AND a.deleted_at IS NULL
        ${options?.maxDepth ? `AND at.depth < ${options.maxDepth}` : ''}
    )
    SELECT * FROM account_tree
    ORDER BY materialized_path;
  `;

  const rows = await db.query(query, [orgId, options?.rootCode]);
  return buildTree(rows);
}
```

### 4.5 Default chart templates

Each template seeds the basic structure aligned to the SAT Código Agrupador. Three templates ship out of the box:

**`mexico-pyme.ts`** — ~80 accounts, balanced for SMEs:
- Activo: Caja, Bancos, Inversiones, Clientes, IVA Acreditable, Inventarios, Activos Fijos
- Pasivo: Proveedores, Acreedores, IVA Trasladado, ISR por Pagar, Préstamos
- Capital: Capital Social, Resultados Acumulados, Resultado del Ejercicio
- Ingresos: Ventas, Productos Financieros, Otros Ingresos
- Costos: Costo de Ventas
- Gastos: Gastos de Administración, Gastos de Venta, Gastos Financieros

**`mexico-resico.ts`** — ~25 accounts, minimal:
- Simplified for the RESICO regime which has less detailed reporting needs
- Focus on income tracking and basic categorization

**`mexico-general.ts`** — ~150+ accounts, full:
- Comprehensive coverage for Régimen General
- Includes all subaccounts typically required for medium-sized businesses

**`us-gaap.ts`** — Optional, for cross-border use cases (bilingual feature):
- US GAAP–style chart
- Note: not mappable to SAT agrupador; the system warns if attached to a Mexican-filing org

### 4.6 Auto-suggest SAT agrupador (AI-leveraged)

Leverage your existing Component 09 (SAT Code Search — sentence transformers + pgvector). Reuse the same infra but on a different corpus:

```typescript
async function suggestAgrupadorCode(
  accountName: string,
  accountType: AccountType
): Promise<SuggestedAgrupador[]> {
  // Build query: combine account name + type for context
  const query = `${accountType}: ${accountName}`;

  // Call AI service (Python FastAPI)
  const response = await aiService.post('/sat/agrupador-search', {
    query,
    top_k: 5,
    min_similarity: 0.6,
    account_type_filter: accountType, // Pre-filters by account type group
  });

  return response.data.map(r => ({
    code: r.code,
    name: r.name,
    similarity: r.score,
  }));
}
```

This requires loading the Código Agrupador catalog into the same pgvector table as SAT product codes, but with a `catalog_type='agrupador'` column.

### 4.7 Validation

```typescript
// src/server/accounting/chart-of-accounts/validation.ts

export async function validateChartForFiling(orgId: string): Promise<ChartValidationResult> {
  const errors: ValidationError[] = [];

  // 1. All postable accounts must have an agrupador code
  const missingAgrupador = await db.query(`
    SELECT code, name FROM accounts
    WHERE organization_id = $1
      AND is_postable = TRUE
      AND sat_agrupador_code IS NULL
      AND deleted_at IS NULL
  `, [orgId]);

  if (missingAgrupador.length > 0) {
    errors.push({
      code: 'MISSING_AGRUPADOR',
      severity: 'error',
      message: `${missingAgrupador.length} postable accounts lack a SAT agrupador code`,
      details: missingAgrupador,
    });
  }

  // 2. All agrupador codes must exist in the SAT catalog
  const invalidAgrupadors = await validateAgrupadorCodes(orgId);
  if (invalidAgrupadors.length > 0) {
    errors.push({ code: 'INVALID_AGRUPADOR', severity: 'error', /* ... */ });
  }

  // 3. At least one account per major group (Activo, Pasivo, etc.)
  const missingGroups = await checkMajorGroups(orgId);
  if (missingGroups.length > 0) {
    errors.push({ code: 'MISSING_MAJOR_GROUPS', severity: 'warning', /* ... */ });
  }

  // 4. Naturaleza consistency with account_type
  // Asset/Expense/Cost accounts should have naturaleza='D'
  // Liability/Equity/Revenue accounts should have naturaleza='A'
  const naturalezaIssues = await checkNaturalezaConsistency(orgId);

  return {
    isValid: errors.filter(e => e.severity === 'error').length === 0,
    errors,
  };
}
```

### 4.8 UI considerations (for downstream Component 44+ planning)

- **Tree view** with collapse/expand, drag-and-drop for moving accounts (with confirmation)
- **Inline editing** for name/description; structural changes require modal
- **Bulk import** from CSV/Excel with preview and validation before commit
- **Code agrupador picker** with AI-powered search (Component 09 reuse)
- **Visual indicators**: header accounts shown differently; accounts without agrupador flagged

---

## 5. Component 22: Journal Entries

### 5.1 Purpose

Record every accounting transaction as a balanced double-entry, with full support for SAT Anexo 24 Pólizas requirements including UUID linkage, payment method details, and multi-currency.

### 5.2 Service interface

```typescript
// src/server/accounting/journal-entries/service.ts

export interface JournalEntryService {
  // CRUD on drafts
  createDraft(orgId: string, data: CreateJournalEntryInput, userId: string): Promise<JournalEntry>;
  updateDraft(entryId: string, data: UpdateJournalEntryInput, userId: string): Promise<JournalEntry>;
  deleteDraft(entryId: string, userId: string): Promise<void>;

  // Posting lifecycle
  postEntry(entryId: string, userId: string): Promise<JournalEntry>;
  postMultiple(entryIds: string[], userId: string): Promise<PostResult[]>;
  reverseEntry(entryId: string, reversalDate: Date, reason: string, userId: string): Promise<JournalEntry>;

  // Queries
  getEntry(entryId: string): Promise<JournalEntry>;
  listEntries(orgId: string, filters: EntryFilters, pagination: Pagination): Promise<PaginatedResult<JournalEntry>>;
  getEntriesByAccount(accountId: string, dateRange: DateRange): Promise<JournalEntry[]>;
  getEntriesByUuid(orgId: string, uuidCfdi: string): Promise<JournalEntry[]>;

  // Auto-posting (called by event handlers)
  postFromInvoice(invoiceId: string, userId: string): Promise<JournalEntry>;
  postFromPayment(paymentId: string, userId: string): Promise<JournalEntry>;
  postFromExpense(expenseId: string, userId: string): Promise<JournalEntry>;

  // Period management
  closePeriod(orgId: string, periodId: string, userId: string): Promise<PeriodCloseResult>;
  reopenPeriod(orgId: string, periodId: string, userId: string, reason: string): Promise<void>;

  // Templates
  createFromTemplate(orgId: string, templateId: string, data: any, userId: string): Promise<JournalEntry>;
  listTemplates(orgId: string): Promise<EntryTemplate[]>;
}
```

### 5.3 Critical business rules

1. **Balance invariant** (DB-enforced): `total_debit = total_credit` on every entry; enforced by CHECK constraint plus repository-layer validation.
2. **Atomicity**: Entry header and lines are written in a single transaction. If any line fails validation, the whole entry rolls back.
3. **Draft vs. Posted**:
   - Drafts can be freely edited or deleted
   - Posted entries are **immutable** — corrections must use reversal + new entry
   - This is non-negotiable for audit and SAT compliance
4. **Period lock**: Cannot post to a closed period. Cannot post `entry_date` outside the period's date range.
5. **Account validity**:
   - Account must be `is_active = TRUE`
   - Account must be `is_postable = TRUE` (no posting to header accounts)
   - Account's `effective_from <= entry_date <= effective_to` (if set)
6. **UUID-CFDI linkage requirements**:
   - For poliza_type='ingreso': MUST include UUID_CFDI on at least one line (the income recognition line)
   - For poliza_type='egreso': MUST include UUID_CFDI when expense has a CFDI; for non-CFDI expenses (e.g., payroll), exemption documented
   - For poliza_type='diario': UUID linkage optional but encouraged
7. **Sequential entry numbering**: per organization, per fiscal year. Format: `{year}-{sequential}` (e.g., `2026-000123`). Generated atomically using a sequence per org.
8. **Reversal mechanics**:
   - A reversal entry has `reverses_entry_id` set to the original
   - The original's `reversed_by_entry_id` is updated
   - Reversal lines have flipped debits/credits
   - Reversal `entry_date` >= original's `entry_date`
   - Reversal does NOT delete or modify the original
9. **Multi-currency entries with three-tier FX hierarchy**:
   - Entry stores `currency_code` and `exchange_rate` to MXN
   - All amounts in lines are in the entry's currency
   - **FX rate resolution** (see `resolveExchangeRate()` in Section 3.1.4.1):
     1. **Tier 1 — CFDI rate**: If the entry has a linked `UUID_CFDI`, use the CFDI's own `TipoCambio`. This is mandatory because SAT will compare the journal's FX to the source CFDI's FX during a Pólizas review. Any deviation triggers a discrepancy flag.
     2. **Tier 2 — Banxico FIX**: For non-CFDI entries (adjustments, accruals, opening balances in foreign currency), use the Banxico FIX rate from the business day prior to `entry_date`. Pre-fetched nightly via Component 32 background job.
     3. **Tier 3 — Manual override**: Always available with mandatory reason field; written to audit log. Used for forward contracts, internal transfer pricing, or when Banxico data is unavailable.
   - For SAT XML, amounts are converted to MXN using the resolved `exchange_rate`
   - The `TipoCamb` attribute in Anexo 24 Pólizas XML is populated from this value

### 5.4 State machine

```
        ┌─────────┐
        │  draft  │
        └────┬────┘
             │ postEntry()
             ▼
        ┌─────────┐
        │ posted  │◄────────┐
        └────┬────┘         │
             │              │ reverseEntry()
             │ reverseEntry()
             ▼              │
        ┌──────────┐        │
        │ reversed │────────┘ (original)
        └──────────┘
```

**Allowed transitions:**
- `draft → posted` (postEntry)
- `posted → reversed` (reverseEntry creates new entry; original is marked reversed)

**NOT allowed:**
- `posted → draft` (would violate audit)
- `reversed → posted` (cannot un-reverse; must create new entry instead)

### 5.5 Auto-posting rules

Auto-posting is the integration point with the rest of the platform. When an invoice/payment/expense reaches a triggering state, this subsystem listens via the job queue (Component 32) and creates the corresponding journal entry.

#### 5.5.1 From Invoice (Component 12)

Trigger: invoice status transitions to `stamped`.

```typescript
async function postFromInvoice(invoiceId: string, userId: string): Promise<JournalEntry> {
  const invoice = await invoiceService.getInvoice(invoiceId);

  // Idempotency check — don't post twice
  const existing = await journalRepo.findBySource('invoice', invoiceId);
  if (existing) return existing;

  // Resolve posting rule
  const rule = await postingRules.find(invoice.organizationId, 'invoice.stamped');

  // Build journal entry from rule
  const entry: CreateJournalEntryInput = {
    entryDate: invoice.issueDate,
    polizaType: 'ingreso',
    description: `Factura ${invoice.serie}-${invoice.folio} - ${invoice.customer.legalName}`,
    sourceType: 'invoice',
    sourceId: invoice.id,
    sourceUuidCfdi: invoice.uuid,
    currencyCode: invoice.currency,
    exchangeRate: invoice.exchangeRate ?? 1.0,
    lines: applyRule(rule, invoice),  // Resolves variable amounts
  };

  // Standard SME income recognition:
  //   Debit  Clientes (1130001) → invoice.total
  //   Credit Ventas  (4100001) → invoice.subtotal
  //   Credit IVA Trasladado (2120001) → invoice.iva
  //   (Line linking the customer's UUID_CFDI = invoice.uuid)

  return await this.createDraft(invoice.organizationId, entry, userId)
    .then(draft => this.postEntry(draft.id, userId));
}
```

#### 5.5.2 From Payment (Component 18)

Trigger: payment recorded against an invoice.

```
  Debit  Bancos (1120001)        → payment.amount
  Credit Clientes (1130001)      → payment.amount
  (UUID_CFDI linked = invoice.uuid OR complemento.uuid if PPD)
```

For PPD (Pago en Parcialidades o Diferido) payments, the complemento de pago has its own UUID — that UUID is the one in the journal line.

#### 5.5.3 From Expense (Component 20)

Trigger: expense approved + has CFDI.

```
  Debit  Gastos (depending on category) → expense.subtotal
  Debit  IVA Acreditable (1180001)      → expense.iva
  Credit Proveedores (2110001)          → expense.total
  (UUID_CFDI linked = expense.cfdiUuid)
```

#### 5.5.4 Automated COGS posting (new)

For organizations with inventory tracking enabled in Component 08, COGS is posted automatically alongside the invoice's revenue recognition entry. This matches the dominant Mexican costing method (**Costeo Promedio** / Weighted Average) and parity with incumbents like CONTPAQi.

**Trigger**: same as revenue recognition (invoice stamped), runs as a *second* journal entry in the same transaction.

```typescript
async function postCogsFromInvoice(invoice: Invoice, userId: string): Promise<JournalEntry | null> {
  // Gate: only orgs with inventory tracking enabled
  const org = await organizationService.get(invoice.organizationId);
  if (!org.inventoryTrackingEnabled) return null;

  // Collect tracked items
  let totalCogs = 0;
  const inventoryReductions: Array<{ productId: string; quantity: number; unitCost: number }> = [];

  for (const item of invoice.items) {
    const product = await productService.get(item.productId);
    if (!product.tracksInventory) continue;  // Service items, etc.

    // Weighted Average Cost as of invoice date
    const wac = await inventoryService.getWeightedAverageCost(product.id, invoice.issueDate);
    const itemCogs = wac * item.quantity;
    totalCogs += itemCogs;
    inventoryReductions.push({ productId: product.id, quantity: item.quantity, unitCost: wac });
  }

  if (totalCogs === 0) return null;  // All service items

  // Record inventory reduction (creates an inventory_movement record)
  for (const r of inventoryReductions) {
    await inventoryService.recordSale(r.productId, r.quantity, invoice.id, r.unitCost);
  }

  // Standard COGS posting:
  //   Debit  Costo de Ventas (5100001)  → totalCogs
  //   Credit Inventarios (1150001)      → totalCogs
  return await journalService.createDraft(invoice.organizationId, {
    entryDate: invoice.issueDate,
    polizaType: 'diario',
    description: `COGS automático para Factura ${invoice.serie}-${invoice.folio}`,
    sourceType: 'invoice',
    sourceId: invoice.id,
    sourceUuidCfdi: invoice.uuid,  // Linked but not on lines — COGS isn't a CFDI line item
    lines: [
      { accountCode: '5100001', debit: totalCogs, credit: 0, description: `WAC × cantidades vendidas` },
      { accountCode: '1150001', debit: 0, credit: totalCogs, description: `Salida de inventario` },
    ],
  }, userId).then(draft => journalService.postEntry(draft.id, userId));
}
```

**Fallback for service businesses or orgs without inventory tracking**: COGS remains manual. An accountant records adjustment entries at period close (e.g., physical inventory adjustments, retail businesses without per-SKU tracking).

**Edge cases handled:**
- Invoice cancellation → COGS reversal entry created automatically
- Returns (Nota de Crédito) → COGS reversal proportional to returned quantities
- Negative inventory (selling stock not yet received) → flagged for review; entry created with `requires_review=true`
- Multi-warehouse → WAC computed per warehouse if Component 08 supports it; otherwise org-wide

#### 5.5.5 Posting rules engine (revised)

Rules are stored in the `posting_rules` table as JSONB but exposed through a **three-tier structured UI** (not a raw JSON editor). This is critical: the accounting-firm market needs customization, but a JSON editor would scare off 95% of users.

**Tier 1 — System defaults** (ship with platform, read-only)

One ruleset per (regime × event type) combination. E.g., `(601, invoice.stamped)`, `(626, payment.recorded)`. ~30 rulesets shipped, covering Régimen General and RESICO across all source events.

**Tier 2 — Org-level overrides** (table editor UI for admins)

When the system defaults don't match an org's chart of accounts (e.g., they use a different revenue account number), admins customize via a table editor:

```
EVENT: Invoice Stamped (CFDI tipo I)
┌──────────┬──────────────────────────┬──────────────────────┐
│ Side     │ Account                  │ Amount Source        │
├──────────┼──────────────────────────┼──────────────────────┤
│ DEBIT    │ 1130001 Clientes         │ Total invoice        │
│ CREDIT   │ 4100001 Ventas           │ Subtotal             │
│ CREDIT   │ 2120001 IVA Trasladado   │ IVA amount           │
└──────────┴──────────────────────────┴──────────────────────┘
[+ Add Row]   [+ Add Condition]   [Save]
```

Conditions field allows scoping rules: `if customer.category = 'EXTRANJERO' → use account 1130002` etc.

**Tier 3 — Per-transaction overrides** (rare, advanced users)

For one-off exceptions: when creating an invoice, an "Advanced > Override accounting" option lets the user manually adjust the journal entry that will be auto-posted. Used by accountants who've spotted an unusual situation. Logged to audit trail.

**Storage** (unchanged from v1.0):

The JSONB column on `posting_rules` is the same. What's new is the UI mapping — the table editor reads/writes the JSONB structure, and Tier 1 defaults are seeded into the same table with `tier='system'` and `is_editable=false`.

```sql
ALTER TABLE posting_rules ADD COLUMN tier VARCHAR(20) NOT NULL DEFAULT 'org';  -- 'system' | 'org'
ALTER TABLE posting_rules ADD COLUMN is_editable BOOLEAN NOT NULL DEFAULT TRUE;
```

### 5.6 Templates (recurring entries)

For accountants managing many clients, repetitive adjustments (depreciation, payroll allocations, accruals) benefit from templates:

```typescript
interface EntryTemplate {
  id: string;
  organizationId: string;
  name: string;
  polizaType: PolizaType;
  description: string;
  lineTemplates: Array<{
    accountCode: string;
    side: 'debit' | 'credit';
    amountFormula?: string;     // e.g., "{{previous_month_balance.4100001}} * 0.1"
    descriptionTemplate?: string;
  }>;
  schedule?: {                  // For recurring auto-creation
    cron: string;
    isActive: boolean;
  };
}
```

### 5.7 Period closing

Closing a period seals balance snapshots and prevents new posts. Process:

1. Verify all draft entries for the period are either posted or deleted (or marked to carry over)
2. Run trial balance — verify it balances
3. Run completeness checks (no orphan source records)
4. Generate balance snapshots for all accounts (insert into `account_balance_snapshots` with `is_sealed=true`)
5. Update `fiscal_periods.status = 'closed'`
6. Audit log the close action

Reopening requires admin role + reason, and resets `is_sealed=false` on affected snapshots.

### 5.8 Performance considerations

- **Index on `(account_id, created_at)`** for fast ledger queries
- **Partitioning by year** for `journal_entry_lines` once volume exceeds ~10M rows (deferred until needed)
- **Batch posting**: when auto-posting from a bulk operation (e.g., 1000 invoices), use a single transaction per batch
- **Denormalized `account_code` on lines**: saves a join on every ledger query; updated transactionally if account is renamed (rare)

---

## 6. Component 23: Financial Reports

### 6.1 Purpose

Generate standard financial statements (Income Statement, Balance Sheet, Cash Flow), regulatory reports (Trial Balance = Balanza, General Ledger = Pólizas detail), and the SAT Anexo 24 XML files.

### 6.2 Service interface

```typescript
// src/server/accounting/reports/service.ts

export interface FinancialReportsService {
  // Statements
  generateIncomeStatement(orgId: string, period: ReportPeriod, options?: IncomeStatementOptions): Promise<IncomeStatement>;
  generateBalanceSheet(orgId: string, asOfDate: Date, options?: BalanceSheetOptions): Promise<BalanceSheet>;
  generateCashFlow(orgId: string, period: ReportPeriod, method: 'direct' | 'indirect'): Promise<CashFlowStatement>;

  // SAT reports (Anexo 24)
  generateTrialBalance(orgId: string, year: number, month: number, type: 'normal' | 'complementaria'): Promise<TrialBalance>;
  generateGeneralLedger(orgId: string, period: ReportPeriod, accountFilter?: string[]): Promise<GeneralLedger>;
  generateAuxiliaryFolios(orgId: string, year: number, month: number): Promise<AuxiliaryFolios>;
  generateAuxiliaryAccounts(orgId: string, year: number, month: number, accountIds?: string[]): Promise<AuxiliaryAccounts>;

  // SAT XML generation (calls sat-xml/ modules)
  generateCatalogXml(orgId: string, year: number, month: number): Promise<XmlFileResult>;
  generateBalanzaXml(orgId: string, year: number, month: number, type: 'BN' | 'BC'): Promise<XmlFileResult>;
  generatePolizasXml(orgId: string, year: number, month: number): Promise<XmlFileResult>;

  // Comparison & analytics
  compareWithPriorPeriod(report: any, currentPeriod: ReportPeriod, comparisonType: 'previous' | 'yoy'): Promise<ComparativeReport>;

  // Export
  exportToPdf(report: any): Promise<Buffer>;
  exportToExcel(report: any): Promise<Buffer>;
  exportToCsv(report: any): Promise<string>;
}
```

### 6.3 Report computation strategy

All reports follow the same pattern:

1. **Determine period boundaries** (start_date, end_date)
2. **Find latest balance snapshot** before period start
3. **Sum journal_entry_lines** between snapshot date and report end_date
4. **Compute report-specific aggregations** (hierarchies for IS/BS, by-category for cash flow)
5. **Cache result** in Redis (key includes org, period, report type, version of data)
6. **Invalidate cache** when journal entries in the period change

### 6.4 Trial Balance (Balanza de Comprobación)

This is the SAT-required monthly filing report. Structure must match Anexo 24 v1.3 schema exactly.

For each postable account:
- Saldo Inicial (opening balance at period start)
- Total Debe (sum of debits in period)
- Total Haber (sum of credits in period)
- Saldo Final (closing balance)

Special handling:
- **Balanza Normal (BN)**: standard monthly
- **Balanza Complementaria (BC)**: for corrections to a previously submitted BN
- **Balanza de Cierre**: end of fiscal year, includes adjustment entries

```typescript
interface TrialBalanceRow {
  numCta: string;              // Account code (Anexo 24: NumCta)
  saldoIni: number;            // Opening (Anexo 24: SaldoIni)
  debe: number;                // (Anexo 24: Debe)
  haber: number;               // (Anexo 24: Haber)
  saldoFin: number;            // (Anexo 24: SaldoFin)
}

interface TrialBalance {
  version: '1.3';
  rfc: string;
  mes: string;                 // "01" - "13"
  anio: number;
  tipoEnvio: 'N' | 'C';        // Normal or Complementaria
  fechaModBal?: Date;          // Required if tipoEnvio='C'
  totalDebe: number;
  totalHaber: number;
  rows: TrialBalanceRow[];
}
```

### 6.5 Income Statement

Standard NIF B-3 structure. Hierarchical with subtotals:

```
Ingresos
  Ventas Netas
  Otros Ingresos
  = Total Ingresos

Costos
  Costo de Ventas
  = Total Costos

Utilidad Bruta = Total Ingresos - Total Costos

Gastos de Operación
  Gastos de Administración
  Gastos de Venta
  = Total Gastos de Operación

Utilidad de Operación = Utilidad Bruta - Total Gastos de Operación

Resultado Integral de Financiamiento
  Productos Financieros
  Gastos Financieros
  Diferencias en Cambio
  = Total RIF

Utilidad Antes de Impuestos = Utilidad de Operación + RIF + Otros

ISR Estimado
Utilidad Neta
```

Income statement uses account hierarchy: aggregate by `account_type='revenue'`, `cost_of_sales`, `expense`, etc. The user can drill down to subcategories.

### 6.6 Balance Sheet

NIF B-1 structure:

```
ACTIVO                          PASIVO
  Activo Circulante              Pasivo Corto Plazo
    Caja y Bancos                  Proveedores
    Clientes                       Impuestos por Pagar
    IVA Acreditable              Pasivo Largo Plazo
    Inventarios                    Préstamos LP
    = Total Activo Circulante    = Total Pasivo
  Activo No Circulante         CAPITAL
    Activos Fijos                Capital Social
    = Total Activo No Circ.      Resultados Acumulados
                                 Resultado del Ejercicio
                                 = Total Capital

TOTAL ACTIVO = TOTAL PASIVO + CAPITAL  (must balance)
```

The Balance Sheet must always balance — if it doesn't, the report flags the discrepancy and points to suspect entries.

### 6.7 Cash Flow Statement

Two methods supported:

- **Direct**: aggregates cash inflows/outflows directly from cash account movements
- **Indirect**: starts from net income, adjusts for non-cash items

Anexo 24 doesn't mandate cash flow XML, but NIF B-2 requires it for full GAAP compliance.

### 6.8 SAT XML generation

This is the highest-stakes part of Component 23. The XMLs MUST validate against SAT's XSDs or the org gets rejected during Buzón Tributario submission.

**Dual-path delivery model.** This subsystem stops at "validated `.zip` package ready for submission." From there, Component 25 (Tax Filing Assistant) offers the user two paths:

1. **Automated submission**: Component 25 uses the org's e.firma to authenticate to Buzón Tributario and uploads the `.zip`. Returns the acuse de recibo. Suitable for self-serve SME users.
2. **Manual download**: A "Descargar archivos para envío manual" button delivers the `.zip` to the accountant, who uploads it via the SAT portal themselves with their own e.firma. Suitable for accounting firms managing multiple clients with their own established workflows, and for orgs that haven't yet uploaded their e.firma credentials.

The output of this subsystem — the validated, optionally signed, properly named `.zip` package — is identical for both paths. The choice happens downstream.

#### 6.8.1 Catálogo XML (CT)

```xml
<catalogocuentas:Catalogo
    xmlns:catalogocuentas="http://www.sat.gob.mx/esquemas/ContabilidadE/1_3/CatalogoCuentas"
    xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
    xsi:schemaLocation="http://www.sat.gob.mx/esquemas/ContabilidadE/1_3/CatalogoCuentas
                        http://www.sat.gob.mx/esquemas/ContabilidadE/1_3/CatalogoCuentas/CatalogoCuentas_1_3.xsd"
    Version="1.3"
    RFC="XAXX010101XXX"
    Mes="01"
    Anio="2026">

    <catalogocuentas:Ctas
        CodAgrup="101.01"
        NumCta="1101001"
        Desc="Caja General"
        Nivel="3"
        Natur="D"
        SubCtaDe="1101"/>
    <!-- ... more accounts -->
</catalogocuentas:Catalogo>
```

#### 6.8.2 Balanza XML (BN/BC)

```xml
<BCE:Balanza
    xmlns:BCE="http://www.sat.gob.mx/esquemas/ContabilidadE/1_3/BalanzaComprobacion"
    xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
    xsi:schemaLocation="http://www.sat.gob.mx/esquemas/ContabilidadE/1_3/BalanzaComprobacion
                        http://www.sat.gob.mx/esquemas/ContabilidadE/1_3/BalanzaComprobacion/BalanzaComprobacion_1_3.xsd"
    Version="1.3"
    RFC="XAXX010101XXX"
    Mes="01"
    Anio="2026"
    TipoEnvio="N"
    FechaModBal="2026-02-04">

    <BCE:Ctas
        NumCta="1101001"
        SaldoIni="50000.00"
        Debe="120000.00"
        Haber="80000.00"
        SaldoFin="90000.00"/>
    <!-- ... more rows -->
</BCE:Balanza>
```

#### 6.8.3 Pólizas XML (PL)

This is the most complex. Each transaction is a `<PLZ:Poliza>` with multiple `<PLZ:Transaccion>` lines, each of which can include `<PLZ:CompNal>` (national CFDI) and `<PLZ:Cheque>` / `<PLZ:Transferencia>` / `<PLZ:OtrMetodoPago>` nodes.

```xml
<PLZ:Polizas
    xmlns:PLZ="http://www.sat.gob.mx/esquemas/ContabilidadE/1_3/PolizasPeriodo"
    Version="1.3"
    RFC="XAXX010101XXX"
    Mes="01"
    Anio="2026"
    TipoSolicitud="AF">

    <PLZ:Poliza
        NumUnIdenPol="2026-000123"
        Fecha="2026-01-15"
        Concepto="Factura A-1234 Cliente Acme">

        <PLZ:Transaccion
            NumCta="1130001"
            DesEnc="Cuentas por Cobrar Clientes"
            Concepto="Factura A-1234"
            Debe="11600.00"
            Haber="0">
            <PLZ:CompNal
                UUID_CFDI="550e8400-e29b-41d4-a716-446655440000"
                RFC="XAXX010101000"
                MontoTotal="11600.00"
                Moneda="MXN"/>
        </PLZ:Transaccion>

        <PLZ:Transaccion
            NumCta="4100001"
            DesEnc="Ventas"
            Concepto="Ingreso por venta"
            Debe="0"
            Haber="10000.00"/>

        <PLZ:Transaccion
            NumCta="2120001"
            DesEnc="IVA Trasladado"
            Concepto="IVA 16%"
            Debe="0"
            Haber="1600.00"/>
    </PLZ:Poliza>
    <!-- ... more polizas -->
</PLZ:Polizas>
```

Note: Each accounting entry must identify the operation by relating it with the UUID, which is a 36-character SAT-assigned identifier in the form 8-4-4-4-12.

#### 6.8.4 XSD validation step

Before any XML is finalized, validate against the cached XSD locally. This catches errors before Buzón Tributario rejects them. Cache the XSDs in the project at `/packages/sat-schemas/xsd/contabilidade/1_3/`.

```typescript
async function validateAgainstXsd(xml: string, schemaType: 'CT' | 'BN' | 'PL' | 'XF' | 'XC'): Promise<ValidationResult> {
  const xsdPath = path.join(SCHEMAS_DIR, `${schemaType}_1_3.xsd`);
  const result = await libxmljs.parseXml(xml).validate(xsd);
  return {
    isValid: result === true,
    errors: result === true ? [] : libxmljs.lastError,
  };
}
```

#### 6.8.5 File naming and packaging

```typescript
function generateFileName(rfc: string, year: number, month: number, type: 'CT' | 'BN' | 'BC' | 'PL' | 'XF' | 'XC'): string {
  const mm = month.toString().padStart(2, '0');
  return `${rfc}${year}${mm}${type}.xml`;
}

async function packageForSubmission(xmlFile: string, fileName: string): Promise<Buffer> {
  const zip = new JSZip();
  zip.file(fileName, xmlFile);
  return await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}
```

The result is uploaded to Cloudflare R2 with a path like:
```
{orgId}/accounting/{year}/{month}/{filename}.zip
```

And referenced from the `fiscal_periods` table.

### 6.9 Caching strategy

Reports are expensive. Cache aggressively:

```typescript
const cacheKey = `report:${orgId}:${reportType}:${period.year}:${period.month}:${dataVersion}`;
```

`dataVersion` is incremented whenever any journal entry in the period is posted, reversed, or the period is closed/reopened. This guarantees we never serve stale reports.

Cache TTL: 1 hour for in-progress periods, no expiry for closed periods (the data can't change).

### 6.10 Export formats

- **PDF**: Use existing PDF skill; templates follow your branding system from Component 16
- **Excel**: Use xlsx skill — leverage formula support for verifiability (totals are formulas, not values)
- **CSV**: Simple, for accountant exports to external tools
- **XML**: SAT-compliant (the main deliverable for filing)

---

## 7. Performance Optimizations

### 7.1 Balance calculation: hybrid approach

The single biggest performance question is "how do you calculate an account's balance fast?". Three options were considered:

**Option A: On-demand from raw lines**
```sql
SELECT COALESCE(SUM(debit), 0) - COALESCE(SUM(credit), 0)
FROM journal_entry_lines
WHERE account_id = $1 AND created_at <= $2;
```
Pros: Always correct, no denormalization.
Cons: O(N) where N grows monthly. After 5 years, queries hit ~hundreds of thousands of rows per account.

**Option B: Triggers maintaining a balances table**
Pros: O(1) lookup.
Cons: Triggers are debugging hell; concurrent posts cause lock contention; reversal logic gets brittle.

**Option C: Monthly snapshots + delta (CHOSEN)**
Pros: O(log N) lookup, deterministic, easy to rebuild.
Cons: Requires periodic snapshot job + cache invalidation logic.

Implementation:

```typescript
async function getAccountBalance(accountId: string, asOfDate: Date): Promise<AccountBalance> {
  // Find most recent sealed snapshot before asOfDate
  const snapshot = await db.queryOne(`
    SELECT *
    FROM account_balance_snapshots s
    JOIN fiscal_periods p ON s.fiscal_period_id = p.id
    WHERE s.account_id = $1
      AND s.is_sealed = TRUE
      AND make_date(p.year, p.month, 1) + interval '1 month' - interval '1 day' < $2
    ORDER BY p.year DESC, p.month DESC
    LIMIT 1
  `, [accountId, asOfDate]);

  // Get delta from snapshot date to asOfDate
  const snapshotEndDate = snapshot
    ? lastDayOfMonth(snapshot.year, snapshot.month)
    : new Date('1900-01-01');

  const delta = await db.queryOne(`
    SELECT
      COALESCE(SUM(debit), 0) AS total_debit,
      COALESCE(SUM(credit), 0) AS total_credit
    FROM journal_entry_lines l
    JOIN journal_entries e ON l.journal_entry_id = e.id
    WHERE l.account_id = $1
      AND e.status = 'posted'
      AND e.entry_date > $2
      AND e.entry_date <= $3
  `, [accountId, snapshotEndDate, asOfDate]);

  const opening = snapshot?.closing_balance ?? 0;
  const debits = delta.total_debit;
  const credits = delta.total_credit;

  // Apply naturaleza
  const account = await getAccount(accountId);
  const closing = account.satNaturaleza === 'D'
    ? opening + debits - credits
    : opening + credits - debits;

  return { opening, totalDebit: debits, totalCredit: credits, closing };
}
```

For closed periods (snapshot is sealed), queries are O(1).
For the current open period, queries hit O(M) where M is lines posted this month — manageable.

### 7.2 Redis caching layer

For hot accounts (bank, AR, AP), cache balances:

```typescript
const cacheKey = `balance:${orgId}:${accountId}:${asOfDate}:v${dataVersion}`;
const cached = await redis.get(cacheKey);
if (cached) return JSON.parse(cached);

const balance = await computeBalance(accountId, asOfDate);
await redis.setex(cacheKey, 300, JSON.stringify(balance));  // 5 min TTL
return balance;
```

### 7.3 Indexing strategy

Critical indexes (already in schemas above):

```sql
-- For balance calculation
CREATE INDEX idx_lines_account_date ON journal_entry_lines(account_id)
  INCLUDE (debit, credit, journal_entry_id);

-- For period queries
CREATE INDEX idx_entries_org_period_status ON journal_entries(organization_id, fiscal_period_id, status);

-- For ledger queries (most common report query)
CREATE INDEX idx_ledger ON journal_entry_lines(organization_id, account_id, created_at DESC)
  WHERE EXISTS (SELECT 1 FROM journal_entries WHERE id = journal_entry_id AND status = 'posted');

-- For UUID-based audit queries (e.g., "show me journal entries for this CFDI")
CREATE INDEX idx_lines_uuid ON journal_entry_lines(uuid_cfdi) WHERE uuid_cfdi IS NOT NULL;
```

### 7.4 Background jobs

Three jobs run via Component 32 (Job Queue):

1. **`balance-snapshot-rollover`** — runs on the 1st of each month at 2 AM (org timezone). Snapshots the previous month's balances. Idempotent.

2. **`xml-batch-generation`** — runs on demand when an org clicks "Generate SAT files" or scheduled for the 3rd of each month for orgs with auto-filing enabled.

3. **`report-cache-warmup`** — runs after period close. Pre-computes common reports (IS, BS, TB) for the closed period and caches them.

---

## 8. Testing Strategy

Following your Expense Service pattern (90 tests for ISR compliance), this subsystem targets ~250+ tests across the three components.

### 8.1 Test pyramid

**Unit tests (~150):**
- Account validation rules
- Hierarchy operations (path building, ancestor/descendant queries)
- Journal entry balance invariant
- Posting state machine transitions
- Naturaleza computation
- Currency conversion logic
- XML generation per node type

**Integration tests (~80):**
- Auto-posting from invoice → entry → balance update
- Period close + snapshot generation
- Multi-org isolation (RLS verification)
- Reversal end-to-end
- Report generation against seeded data

**Compliance tests (~30):**
- XSD validation for all generated XMLs (CT, BN, PL, XF, XC)
- File naming convention
- Balanza Normal vs Complementaria differences
- UUID linkage requirements per poliza type
- Round-trip: post entries → generate XML → re-parse → verify equivalence

**Property-based tests (~10, using fast-check):**
- "Any sequence of balanced entries leaves trial balance balanced"
- "Posting + reversing leaves balances unchanged"
- "Snapshot + delta = on-demand calculation"

### 8.2 Test fixtures

Reusable fixtures (in `tests/fixtures/accounting/`):

- `default-mexican-pyme-chart.ts` — full chart, ~80 accounts
- `sample-invoices.ts` — 20 invoices in various states
- `sample-payments.ts` — including PPD with complemento
- `sample-expenses.ts` — CFDI and non-CFDI
- `closed-fiscal-period.ts` — Q1 with full transactions, sealed
- `multi-currency-scenarios.ts` — MXN, USD, EUR

### 8.3 Critical compliance test cases

1. **Anexo 24 v1.3 CT validation**: generate CT XML for a 50-account chart, validate against XSD, parse the result back, confirm round-trip
2. **Balance equation**: for any closed period, `sum(asset_balances) = sum(liability_balances) + sum(equity_balances)`
3. **UUID requirement**: posting an Ingreso poliza without UUID_CFDI on the income line fails validation
4. **RESICO exemption**: org with `accounting_filing_mode = 'records_only'` can post entries without agrupador codes; XML generation is disabled
5. **Period lock**: posting to a closed period fails with `PeriodLockedError`
6. **Reversal correctness**: posting entry X then reversing it leaves all affected account balances at zero net change
7. **Multi-org isolation**: query for org A's journal entries while authenticated as org B returns empty (RLS verification)

---

## 9. Decisions Resolved (revised v1.1)

These were "open decisions" in v1.0. Each has been re-evaluated and resolved. Implementation details are now embedded throughout the spec; this section captures the rationale.

### 9.1 Filing mode placement: **`fiscal_periods`**, not `organizations` ✅

**Why this matters:** Mexican filing obligation isn't a permanent property of the org. A persona física in actividades empresariales who crosses $4M MXN income (regla 2.8.1.17) moves from exempt to required *during* the fiscal year. RESICO contributors who exceed the income cap face the same shift. Regime changes happen too.

If filing mode were on `organizations`, historical periods would silently change their filing status when the org's regime changed. That breaks audit integrity and creates surprises when reopening old periods for SAT review.

**Resolution:**
- `organizations.default_filing_mode` (NEW column) — seeds new periods, derived from tax regime
- `fiscal_periods.filing_mode` — authoritative per period, immutable after period close (unless period is reopened with admin reason)
- When org's regime changes, future periods inherit the new default; past periods preserve their original mode

**See:** Section 3.1.2 (schema), Section 1.3 (temporal shifts note)

### 9.2 Account code format: **strict numeric (4–12 digits) + `account_code_aliases`** ✅

**Why this matters:** Free-form codes weaken hierarchy queries, break the materialized path strategy, and let SMEs make a mess of their charts. But strict numeric breaks migration from ContPAQi, Aspel COI, Bind ERP, and the long tail of legacy systems that use `1-101-001`, `ACT-CAJA-001`, etc.

**Resolution:**
- Canonical codes are 4–12 digits (DB CHECK constraint, Zod-validated, dot-separated input accepted and normalized)
- `account_code_aliases` table stores legacy/external codes pointing to canonical accounts
- UI can display the alias instead of the canonical code (`is_primary_display=true`)
- XML generation always uses the canonical code (SAT compliance)
- Bulk import wizard auto-creates aliases when source codes don't match the canonical format

**Net effect:** Accountants migrating from CONTPAQi never have to retrain on new codes, but the data model stays clean and queryable.

**See:** Section 3.1.1 (accounts schema), Section 3.1.1.1 (aliases schema), Section 3.3 (Zod)

### 9.3 FX rate hierarchy: **CFDI → Banxico FIX → manual override** ✅

**Why this matters:** Original v1.0 proposal ("DOF rate at posting time") would create SAT mismatches whenever a journal entry was linked to a CFDI with a different rate. SAT compares FX rates between source CFDI and the corresponding journal line during Anexo 24 reviews — discrepancies trigger audits.

**Resolution:** Three-tier hierarchy implemented via `resolveExchangeRate()`:

1. **CFDI's `TipoCambio`** (if `UUID_CFDI` linked) — mandatory source of truth when present
2. **Banxico FIX rate** from the business day prior to `entry_date` — official upstream of DOF; pre-fetched nightly
3. **Manual override** with mandatory reason, audit-logged — for forward contracts, internal pricing, edge cases

New `exchange_rates` table caches rates from all three sources. Banxico fetcher runs as a Component 32 nightly job for all currencies in use across all orgs (typically USD, EUR, sometimes CAD).

**See:** Section 3.1.4.1 (schema + resolution function), Section 5.3 (business rule 9)

### 9.4 Posting rule customization: **three-tier structured UI**, not raw JSON ✅

**Why this matters:** Original v1.0 proposal (JSON editor for admins) was a non-starter for the target market. Accounting firms managing 50–100 clients need real customization — that's a core differentiator versus CONTPAQi. But a JSON editor is unusable for accountants. The right answer is structured UI on top of JSONB storage.

**Resolution:**

| Tier | Audience | UI | Storage |
|---|---|---|---|
| **System defaults** | All orgs (read-only) | Documentation + view-only inspector | `posting_rules` with `tier='system'`, `is_editable=false` |
| **Org overrides** | Admin role | Table editor with account picker + amount source dropdown + condition builder | `posting_rules` with `tier='org'` |
| **Per-transaction overrides** | Power users on individual transactions | "Advanced > Override accounting" modal on invoice/payment/expense forms | Audit log only (no rule persisted) |

The structured UI prevents foot-shooting (e.g., debiting an income account) while exposing the full power of the JSONB schema underneath.

**See:** Section 5.5.5 (revised engine description)

### 9.5 COGS automation: **enabled for orgs with inventory tracking** ✅

**Why this matters:** Original v1.0 proposal ("manual for v1") left value on the table. Component 08 already has the inventory primitives. Costeo Promedio (Weighted Average) is the dominant Mexican method and what CONTPAQi automates by default. Automating COGS is table stakes for product businesses.

**Resolution:**
- Orgs with `inventoryTrackingEnabled=true` get automated COGS posting on every invoice
- Triggered alongside revenue recognition; posted as a second `diario` entry in the same transaction
- Uses WAC at invoice date; reduces inventory via Component 08
- Service-only orgs keep the manual path (adjustment entries at period close)
- Handles invoice cancellation, returns (nota de crédito), and flags negative-inventory edge cases

**See:** Section 5.5.4 (new section with full implementation)

### 9.6 SAT submission: **dual-path (automated + manual download)** ✅

**Why this matters:** Locking accountants into automated submission was hostile to the accounting-firm market. Many firms have established Buzón Tributario workflows, refuse to upload their e.firma to a third-party tool, or manage clients whose e.firmas they don't hold. Forcing one path loses these customers.

**Resolution:**
- This subsystem produces validated, optionally signed, properly named `.zip` packages
- Component 25 (Tax Filing Assistant) exposes both paths to the end user:
  - **Auto-submit**: uses the org's stored e.firma → Buzón Tributario → returns acuse
  - **Download for manual upload**: returns the same `.zip` for the accountant to upload themselves
- Default path depends on whether the org has uploaded its e.firma (most accounting firms won't)

**See:** Section 6.8 (dual-path delivery note)

---

## 9b. Genuinely Open Questions (deferred to implementation)

These remain undecided. Each is independent of the schema work in Phase A, so they don't block implementation:

1. **Auto-suggest agrupador confidence threshold**: At what similarity score do we auto-fill the agrupador vs. ask for confirmation? Default proposal: ≥0.85 auto-fills, 0.6–0.85 suggests with confirmation, <0.6 user picks manually. Tune from production data.
2. **Period close approval workflow**: Single-click close, or two-step (close → admin approves)? Likely depends on plan tier (free = single click, firm tier = configurable approval).
3. **Reversal naming convention**: Reversal entries get auto-named `REV-{original_entry_number}` or use the next sequential number? Probably sequential to preserve numbering — flag for accountant feedback.
4. **Snapshot rollover timing**: 2 AM org timezone vs. 2 AM UTC vs. user-configurable? Default proposal: 2 AM org timezone, with the job scheduled per-org. Trade-off: simpler code (UTC) vs. less noisy reports (org TZ).

---

## 10. Implementation Roadmap

Suggested build order, with estimated effort per slice:

### Phase A: Foundation (4-5 days, +1 day from v1.0)

1. **Shared schemas + types** — `src/server/accounting/shared/`
2. **Database migrations** — all tables:
   - `accounts` (with strict numeric code constraint)
   - `account_code_aliases` (NEW — for legacy migration)
   - `journal_entries`, `journal_entry_lines`
   - `fiscal_periods` (with `filing_mode` column — NEW)
   - `account_balance_snapshots`
   - `posting_rules` (with `tier` and `is_editable` columns — NEW)
   - `exchange_rates` (NEW — three-tier FX support)
   - All RLS policies and indexes
3. **Seed SAT agrupador catalog** — load into Component 33's catalog tables
4. **Update Component 04** — add `default_filing_mode` column to `organizations` table; backfill from existing tax regime
5. **Banxico FIX rate fetcher** (NEW) — Component 32 nightly job; seed historical data going back 2 years for currencies in use
6. **Update Component 08** — expose `inventoryTrackingEnabled` flag and WAC query (if not already)

### Phase B: Component 21 Core (5-6 days, +1 day from v1.0)

5. **Chart of Accounts service** — CRUD + hierarchy operations
6. **Default chart templates** — mexico-pyme, mexico-resico, mexico-general
7. **Auto-suggest agrupador** — reuse Component 09 infrastructure
8. **Validation** — full chart validation for filing readiness
9. **Code alias import wizard** (NEW) — bulk import flow that auto-creates aliases for non-canonical codes
10. **Tests** — ~90 unit + integration tests (10 added for alias handling)

### Phase C: Component 22 Core (6-7 days, +1 day from v1.0)

10. **Journal entry service** — draft/post/reverse
11. **State machine** — strict transition rules
12. **Balance calculation** — hybrid snapshot + delta
13. **Period close** — snapshot generation
14. **FX resolution** (NEW) — three-tier hierarchy with Banxico integration
15. **Auto-posting from invoice/payment/expense** — listeners + rule engine
16. **COGS automation** (NEW) — for orgs with inventory tracking; includes reversal on invoice cancel
17. **Posting rules table editor backend** (NEW) — APIs for the three-tier UI; system defaults seeding
18. **Tests** — ~120 unit + integration + property-based (20 added)

### Phase D: Component 23 Core (5-6 days)

16. **Trial Balance** — Balanza generation logic
17. **Income Statement + Balance Sheet** — NIF B-1 / B-3 structures
18. **Cash Flow** — direct + indirect methods
19. **General Ledger / Pólizas detail** — drill-down view
20. **Tests** — ~50 tests

### Phase E: SAT Compliance Layer (3-4 days)

21. **XML generators** — CT, BN, BC, PL, XF, XC
22. **XSD validation** — cache XSDs locally; validate before output
23. **File naming + packaging** — proper zip format
24. **Storage integration** — upload to R2 with proper paths
25. **Tests** — ~30 compliance tests including XSD validation

### Phase F: Polish (2-3 days)

26. **PDF/Excel/CSV exports** — leverage existing skills
27. **Caching layer** — Redis warming, invalidation hooks
28. **Background jobs** — snapshot rollover, batch XML generation
29. **Audit log integration** — wire up all mutations to Component 37

### Total estimated effort: ~25-32 development days (v1.1)

Running with the agentic Claude Code loop you mentioned, this could collapse to ~12-16 days if you batch the well-patterned CRUD work and reserve human review for the SAT XML generation, posting rule engine, and FX resolution — the three highest-risk areas.

**Net delta from v1.0**: +3-4 days for the v1.1 changes (filing mode on periods, code aliases, exchange_rates infrastructure, COGS automation, posting rules UI backend). All deltas are upfront in Phase A/B/C — Phases D/E/F unchanged.

---

## 11. Risk Register

| Risk | Severity | Mitigation |
|---|---|---|
| SAT XSD changes mid-development | Low | Cache XSDs locally; subscribe to SAT publication feed; CI runs validation against current XSD nightly |
| Performance degradation on accounts with >1M lines | Medium | Snapshot strategy mitigates; partitioning ready when needed; load-test with 10-year synthetic data before launch |
| Auto-posting rule edge cases (e.g., partial credit notes) | High | Three-tier rule UI exposes overrides at transaction level; conservative defaults; explicit rule review UI; opt-in for auto-posting per source type |
| Concurrent posting race conditions on entry_number | Medium | Use PostgreSQL sequences per org; SELECT FOR UPDATE on org row during number generation |
| Period close on bad data | High | Pre-close validation checklist; balance verification; ability to reopen with audit trail |
| Org changes regime mid-year, breaks historical filing | ~~High~~ Resolved (v1.1) | Filing mode lives on `fiscal_periods`, not `organizations`. Historical periods retain original mode regardless of regime changes. |
| Legacy accountant refuses to retrain on new account codes | ~~Medium~~ Resolved (v1.1) | `account_code_aliases` allows display of legacy codes throughout UI while canonical codes stay clean. |
| CFDI/journal FX mismatch flagged by SAT review | ~~High~~ Resolved (v1.1) | Three-tier FX resolution uses CFDI's own `TipoCambio` when linked, guaranteeing match. |
| Banxico API unavailable when nightly job runs | Medium (NEW) | Job retries with exponential backoff; if 24h gap, fall back to most recent cached rate + alert ops; users can manually input rate with audit reason |
| Inventory tracking enabled but WAC unavailable (new product) | Medium (NEW) | First sale of a product uses purchase cost as WAC; if no purchase, flag entry for review and disable auto-COGS until cost is established |
| Accountant uploads wrong period's `.zip` via manual download path | Low (NEW) | Filename convention is unambiguous (`RFC+YYYY+MM+TYPE.xml`); UI shows the embedded period in the download button label; SAT itself validates RFC/period match server-side |
| Org accidentally changes default_filing_mode for new periods | Low (NEW) | UI shows preview of impact: "X future periods will be created with mode Y"; admin confirmation required; existing periods unaffected |

---

## 12. Appendix A: SAT Código Agrupador Reference (Top-Level)

This is the catalog all postable accounts in a filing-mode org must map to. Stored in Component 33's catalog tables.

```
100  Activo
  101  Caja
    101.01  Caja y efectivo
  102  Bancos
    102.01  Bancos nacionales
    102.02  Bancos extranjeros
  103  Inversiones
  ...
  105  Clientes
    105.01  Clientes nacionales
    105.02  Clientes extranjeros
  ...
  108  Almacén
  109  IVA acreditable
    109.01  IVA acreditable pagado
    109.02  IVA acreditable pendiente de pago
  ...

200  Pasivo
  201  Proveedores
    201.01  Proveedores nacionales
  ...
  208  IVA trasladado
    208.01  IVA trasladado cobrado
    208.02  IVA trasladado no cobrado
  209  Impuestos por pagar
    209.01  ISR retenido
    209.04  IVA por pagar
  ...

300  Capital contable
  301  Capital social
  302  Reservas
  304  Resultados de ejercicios anteriores
  305  Resultado del ejercicio
  ...

400  Ingresos
  401  Ingresos
    401.01  Ventas y/o servicios gravados a la tasa general
    401.02  Ventas y/o servicios gravados a la tasa del 0%
    401.03  Ventas y/o servicios exentos
    401.39  Ventas y/o servicios en zona fronteriza   <-- 2026 special
  ...

500  Costo de ventas y/o servicios
  ...

600  Gastos
  601  Gastos generales
  ...

700  Resultado integral de financiamiento
800  Otros ingresos / gastos
900  Cuentas de orden
```

The full catalog (~400 codes) is at https://www.sat.gob.mx/minisitio/NormatividadRMFyRGCE/documentos2026/rmf/anexos/Anexo_24_RMF2026-13012026.pdf

---

## 13. Appendix B: Glossary

| Term | Meaning |
|---|---|
| Anexo 24 | RMF annex defining electronic accounting technical spec |
| Balanza de Comprobación | Trial balance — required monthly XML |
| BN / BC | Balanza Normal / Complementaria |
| Cadena Original | Canonicalized form of an XML used for signing |
| Catálogo de Cuentas | Chart of Accounts — required XML |
| CFDI | Comprobante Fiscal Digital por Internet — the e-invoice |
| Código Agrupador | SAT's standardized account-grouping code |
| Complemento de Pagos | Payment complement, separate CFDI type with its own UUID |
| Cuenta de Mayor | Major account (Level 1) |
| DOF | Diario Oficial de la Federación |
| NIF | Normas de Información Financiera (Mexican GAAP) |
| Naturaleza | "Nature" of account: D (debit-normal) or A (credit-normal) |
| Póliza | Journal entry, in Mexican accounting |
| PPD | Pago en Parcialidades o Diferido — partial/deferred payment |
| RESICO | Régimen Simplificado de Confianza — simplified tax regime |
| RIF | Régimen de Incorporación Fiscal — legacy small-taxpayer regime |
| RMF | Resolución Miscelánea Fiscal — annual fiscal rules |
| Subcuenta | Sub-account |
| TFD | Timbre Fiscal Digital — SAT stamp |
| UUID | The 36-char identifier SAT assigns to each stamped CFDI |
| Buzón Tributario | SAT's electronic mailbox for filings |

---

## 14. References

- Anexo 24 RMF 2026 (DOF 13/01/2026): https://www.sat.gob.mx/minisitio/NormatividadRMFyRGCE/documentos2026/rmf/anexos/Anexo_24_RMF2026-13012026.pdf
- SAT XSDs (v1.3): http://www.sat.gob.mx/esquemas/ContabilidadE/1_3/
- NIF (Mexican GAAP) framework
- Código Fiscal de la Federación, Art. 28
- RMF 2026 reglas 2.8.1.6, 2.8.1.7, 2.8.1.10 (filing obligations)
- RMF 2026 regla 3.13.16 (RESICO exemption)
- RMF 2026 regla 2.8.1.17 (small-taxpayer exemption)

---

**End of Specification**

*Once this spec is approved, the recommended next action is to start with Phase A (Foundation) — shared schemas, database migrations, and SAT agrupador catalog loading. This unblocks parallel development of Components 21, 22, and 23 by separate Claude Code sessions if you choose to run them concurrently.*
