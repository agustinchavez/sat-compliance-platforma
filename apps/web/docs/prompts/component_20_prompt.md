# Component 20: Expense Service — Implementation Prompt

---

## Code Review: Components 18 & 19 — Both Approved ✅

All four bugs from the previous review have been correctly fixed:
- `@/lib/invoices/payment` → `@/lib/invoices/record-payment` ✅
- `@/lib/supabase/service-role-client` created with correct `createServiceRoleClient()` ✅
- `recordAndProcessPayment` now called with correct 3-argument positional signature ✅
- `total_amount`, `receiver_email`, `folio`, `status='completed'` all corrected ✅

The payment management system (Components 18 + 19) is complete and production-ready.

---

## Context for the Coding Agent

You are building Component 20 of a Mexican SAT tax compliance SaaS platform. Components already completed that you will integrate with:

- **Component 9**: SAT Code Search AI service. Python FastAPI at `process.env.AI_SERVICE_URL`. Already used by invoice line items for product code suggestion.
- **Component 10 (OCR)**: `@/lib/ocr` — `processReceipt(file)` → `OCRResult`, `processCFDI(file)` → `CFDIXMLData`, `processReceiptFromBytes(data, mimeType, filename)` → `OCRResult`. The OCR microservice caches results by file hash in `ocr_results_cache` table.
- **Component 12**: Invoice types. `InvoiceStatus`, `MetodoPago`, `PaymentStatus` enums are in `@/lib/invoices/types`.
- **Storage**: `uploadToStorage(key, data, contentType, metadata?)` and `downloadFromStorage(key)` exported from `@/lib/organizations/storage`. Uses Cloudflare R2. Key pattern for receipts: `receipts/{organizationId}/{expenseId}/{filename}`.
- **`@repo/cfdi`**: `validateCFDI(xml)` → `CFDIValidationResult` with `valid: boolean, errors: CFDIValidationError[]`. Also exports RFC validation helpers.

---

## What's Already in the Database — Do NOT Recreate

The `expenses` table already exists from `20251105000000_initial_schema.sql`:

```sql
CREATE TYPE expense_status AS ENUM (
  'pending_receipt',
  'received',
  'validated',
  'rejected'
);

CREATE TABLE expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  created_by UUID REFERENCES users(id),
  vendor_rfc VARCHAR(13),
  vendor_name VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
  category VARCHAR(100),
  amount DECIMAL(15, 2) NOT NULL,
  tax_amount DECIMAL(15, 2) DEFAULT 0,
  total DECIMAL(15, 2) NOT NULL,
  currency VARCHAR(3) DEFAULT 'MXN',
  cfdi_uuid VARCHAR(36),
  xml_url TEXT,
  pdf_url TEXT,
  receipt_url TEXT,
  status expense_status DEFAULT 'pending_receipt',
  is_deductible BOOLEAN DEFAULT true,
  expense_date DATE NOT NULL,
  validated_at TIMESTAMP,
  notes TEXT,
  tags TEXT[],
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  deleted_at TIMESTAMP
);
```

RLS is already enabled and basic policies exist (`20251106000000_setup_supabase_auth.sql`).

Your migration must **enhance** this table, not replace it. Use `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` throughout.

---

## What This Component Builds

The Expense Service handles the full lifecycle of a business expense:

1. **Manual entry** — user fills in vendor, amount, category, date
2. **Receipt/CFDI upload** — user uploads an image (JPG/PNG/PDF) or CFDI XML; OCR fills in fields automatically
3. **CFDI validation** — for XML-backed expenses, validate the CFDI structure and check it is addressed to the org's RFC
4. **Deductibility assessment** — per Mexican ISR law (Art. 25/27 LISR), determine if the expense is deductible and why/why not
5. **Categorization** — assign SAT-aligned expense category; suggest category from description/OCR data
6. **Reporting** — aggregate by category, period, deductibility for tax calculation (Component 24 will consume this)

---

## Mexican Tax Law Requirements — Read This Before Implementing Validation

Per **Artículo 25 and 27, Ley del ISR** and SAT guidelines for 2025/2026:

**For a business expense (persona moral) to be deductible it must:**
1. Be **estrictamente indispensable** for the company's economic activity
2. Be **backed by a valid CFDI** (factura electrónica) addressed to the organization's RFC
3. For payments **over $2,000 MXN**: must be paid via electronic transfer, credit card, debit card, or check — cash payments over $2,000 are NOT deductible
4. For **gasoline/fuel**: cash payments are NEVER deductible regardless of amount
5. The CFDI's **receptor RFC must match** the organization's RFC (not a generic public RFC)
6. The expense must be in the **same fiscal period** it was accrued (devengado)
7. **Meals/entertainment** (alimentos y entretenimiento): only deductible if directly tied to business activities and the CFDI specifies the purpose; limited to 91.5% deductibility (Art. 28 LISR)
8. **Vehicles**: deductible up to $175,000 MXN of acquisition value at 25% annual depreciation

**Non-deductible categories (Art. 28 LISR):**
- Personal expenses not related to business activity
- Fines and penalties (multas y recargos)
- Expenses without CFDI or with generic RFC (XAXX010101000)
- Cash payments over $2,000 MXN
- Expenses on behalf of third parties with no employment relationship

These rules determine the `is_deductible` flag and `deductibility_notes` on each expense.

---

## Scope Boundaries

**Does:**
- Full CRUD for expenses
- Receipt upload (image/PDF) → OCR extraction → auto-fill expense fields
- CFDI XML upload → parse via OCR service → validate structure and RFC match → assess deductibility
- Category suggestion based on description + CFDI data using simple keyword matching (NOT AI — the AI SAT code search is for invoices, not expense categorization)
- Expense report generation (by category, by period, deductible vs non-deductible totals)
- Export expenses list as structured data (JSON/CSV-compatible — the frontend handles rendering)
- Soft delete (sets `deleted_at`)

**Does NOT:**
- Approve or reject expenses through a multi-person workflow — `approveExpense` from the original spec is simplified to a status transition (validated → approved) done by the service caller; no multi-step approval chain
- Generate journal entries — that is Component 22
- Calculate tax owed — that is Component 24 (this component provides the deductible expense totals it needs)
- Send notifications — enqueue to `invoice-emails` BullMQ queue with appropriate email type if needed
- Run OCR inline — always call the existing OCR microservice client at `@/lib/ocr`

---

## File Structure

Use `apps/web/lib/` convention. Do NOT use `src/server/`:

```
apps/web/lib/expenses/
├── types.ts               # Expense, ExpenseCategory, ExpenseStatus, filters, deductibility
├── errors.ts              # ExpenseError, ExpenseErrorCode
├── categories.ts          # EXPENSE_CATEGORIES map, suggestCategory(), getCategoryRules()
├── validation.ts          # validateExpenseData(), validateCFDIForDeduction(), isDeductible()
├── ocr-integration.ts     # extractFromReceipt(), extractFromCFDIXml(), autoFillFromOCR()
├── repository.ts          # All DB operations
├── service.ts             # Core business logic (orchestrates all above)
├── reports.ts             # generateExpenseReport(), getExpensesByCategory(), getDeductibleExpenses()
└── index.ts               # Public exports

supabase/migrations/
└── 20260313000000_enhance_expenses_table.sql
```

---

## Step 1 — Types

Create `apps/web/lib/expenses/types.ts`:

```typescript
import { z } from 'zod';

// Expense categories aligned with SAT/ISR Article 25 deduction categories
// and common Mexican SME expense types
export enum ExpenseCategory {
  // Operations
  COMPRAS_MERCANCIA      = 'compras_mercancia',       // Art. 25 I - Cost of goods
  SERVICIOS_PROFESIONALES = 'servicios_profesionales', // Professional services
  ARRENDAMIENTO          = 'arrendamiento',            // Rent/lease
  NOMINA_SUELDOS         = 'nomina_sueldos',           // Payroll (not this component)
  SEGURIDAD_SOCIAL       = 'seguridad_social',         // IMSS/INFONAVIT quotas
  // Travel & transport
  COMBUSTIBLE            = 'combustible',              // Fuel (special cash rule)
  VIATICOS               = 'viaticos',                 // Travel expenses
  TRANSPORTE             = 'transporte',               // Transport/logistics
  // Administrative
  PAPELERIA_OFICINA      = 'papeleria_oficina',        // Office supplies
  SERVICIOS_PUBLICOS     = 'servicios_publicos',       // Utilities
  TELECOMUNICACIONES     = 'telecomunicaciones',       // Phone/internet
  PUBLICIDAD_MARKETING   = 'publicidad_marketing',     // Advertising
  TECNOLOGIA_SOFTWARE    = 'tecnologia_software',      // Software/SaaS
  EQUIPO_HERRAMIENTAS    = 'equipo_herramientas',      // Equipment/tools
  // Finance
  INTERESES              = 'intereses',                // Interest expenses
  SEGUROS                = 'seguros',                  // Insurance
  COMISIONES_BANCARIAS   = 'comisiones_bancarias',     // Bank fees
  // Food/entertainment (limited deductibility)
  ALIMENTOS_ENTRETENIMIENTO = 'alimentos_entretenimiento', // 91.5% deductible limit
  // Special
  DONACIONES             = 'donaciones',               // Donations (7% of fiscal profit limit)
  INVERSIONES_ACTIVO_FIJO = 'inversiones_activo_fijo', // Fixed asset investments
  OTROS                  = 'otros',                    // Other/uncategorized
}

// Maps to human-readable Spanish labels
export const EXPENSE_CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  [ExpenseCategory.COMPRAS_MERCANCIA]: 'Compras de mercancía',
  [ExpenseCategory.SERVICIOS_PROFESIONALES]: 'Servicios profesionales',
  [ExpenseCategory.ARRENDAMIENTO]: 'Arrendamiento',
  [ExpenseCategory.NOMINA_SUELDOS]: 'Nómina y sueldos',
  [ExpenseCategory.SEGURIDAD_SOCIAL]: 'Seguridad social (IMSS/INFONAVIT)',
  [ExpenseCategory.COMBUSTIBLE]: 'Combustible',
  [ExpenseCategory.VIATICOS]: 'Viáticos',
  [ExpenseCategory.TRANSPORTE]: 'Transporte y logística',
  [ExpenseCategory.PAPELERIA_OFICINA]: 'Papelería y oficina',
  [ExpenseCategory.SERVICIOS_PUBLICOS]: 'Servicios públicos',
  [ExpenseCategory.TELECOMUNICACIONES]: 'Telecomunicaciones',
  [ExpenseCategory.PUBLICIDAD_MARKETING]: 'Publicidad y marketing',
  [ExpenseCategory.TECNOLOGIA_SOFTWARE]: 'Tecnología y software',
  [ExpenseCategory.EQUIPO_HERRAMIENTAS]: 'Equipo y herramientas',
  [ExpenseCategory.INTERESES]: 'Intereses',
  [ExpenseCategory.SEGUROS]: 'Seguros',
  [ExpenseCategory.COMISIONES_BANCARIAS]: 'Comisiones bancarias',
  [ExpenseCategory.ALIMENTOS_ENTRETENIMIENTO]: 'Alimentos y entretenimiento',
  [ExpenseCategory.DONACIONES]: 'Donativos',
  [ExpenseCategory.INVERSIONES_ACTIVO_FIJO]: 'Inversiones en activo fijo',
  [ExpenseCategory.OTROS]: 'Otros',
} as const;

// The existing DB enum — do not change these values
export type ExpenseStatus = 'pending_receipt' | 'received' | 'validated' | 'rejected';

// Deductibility status with reason
export interface DeductibilityAssessment {
  isDeductible: boolean;
  deductibilityPercent: number;     // 100 for fully deductible, 91.5 for meals/entertainment, 0 for non-deductible
  reason: string;                   // Human-readable explanation (Spanish)
  legalBasis?: string;              // e.g., "Art. 27 LISR - Pago en efectivo mayor a $2,000"
  warnings: string[];               // Non-blocking issues (e.g., "RFC genérico en receptor")
}

export interface Expense {
  id: string;
  organizationId: string;
  createdBy?: string;

  // Vendor info
  vendorRfc?: string;
  vendorName: string;
  description: string;

  // Categorization
  category: ExpenseCategory;
  subcategory?: string;

  // Amounts
  amount: number;            // Subtotal before tax
  taxAmount: number;         // IVA amount
  total: number;             // amount + taxAmount
  currency: string;          // ISO 4217 (MXN)

  // CFDI / receipt
  cfdiUuid?: string;         // UUID extracted from XML
  xmlUrl?: string;           // R2 key for uploaded XML
  pdfUrl?: string;           // R2 key for PDF (if any)
  receiptUrl?: string;       // R2 key for receipt image
  ocrConfidence?: number;    // 0-1 confidence from OCR extraction

  // Status & deductibility
  status: ExpenseStatus;
  isDeductible: boolean;
  deductibilityPercent: number;    // NEW: 0, 91.5, or 100
  deductibilityNotes?: string;     // NEW: reason for non/partial deductibility
  paymentMethod?: string;          // NEW: SAT c_FormaPago code (for cash rule enforcement)

  // Dates
  expenseDate: string;             // YYYY-MM-DD
  validatedAt?: string;
  notes?: string;
  tags?: string[];

  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
}

export interface CreateExpenseInput {
  vendorName: string;
  description: string;
  category: ExpenseCategory;
  amount: number;
  taxAmount?: number;          // Defaults to 0
  total: number;
  currency?: string;           // Defaults to 'MXN'
  expenseDate: string;         // YYYY-MM-DD
  vendorRfc?: string;
  paymentMethod?: string;      // SAT FormaPago code
  notes?: string;
  tags?: string[];
}

export interface UpdateExpenseInput {
  vendorName?: string;
  description?: string;
  category?: ExpenseCategory;
  amount?: number;
  taxAmount?: number;
  total?: number;
  expenseDate?: string;
  vendorRfc?: string;
  paymentMethod?: string;
  notes?: string;
  tags?: string[];
}

export interface ExpenseFilters {
  status?: ExpenseStatus | ExpenseStatus[];
  category?: ExpenseCategory | ExpenseCategory[];
  isDeductible?: boolean;
  dateFrom?: string;           // YYYY-MM-DD
  dateTo?: string;             // YYYY-MM-DD
  amountMin?: number;
  amountMax?: number;
  vendorRfc?: string;
  search?: string;             // Full-text on vendor_name, description
  tags?: string[];
}

export interface ExpensePagination {
  page: number;
  limit: number;
}

export interface ExpenseListResult {
  expenses: Expense[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

// For auto-fill from OCR
export interface ExtractedExpenseData {
  vendorName?: string;
  vendorRfc?: string;
  amount?: number;
  taxAmount?: number;
  total?: number;
  expenseDate?: string;         // YYYY-MM-DD
  cfdiUuid?: string;
  paymentMethod?: string;
  currency?: string;
  confidence: number;           // Overall OCR confidence 0-1
  warnings: string[];
}

// Zod schema for CreateExpenseInput
export const createExpenseSchema = z.object({
  vendorName: z.string().min(1).max(255),
  description: z.string().min(1).max(1000),
  category: z.nativeEnum(ExpenseCategory),
  amount: z.number().nonnegative(),
  taxAmount: z.number().nonnegative().optional().default(0),
  total: z.number().positive(),
  currency: z.string().length(3).optional().default('MXN'),
  expenseDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  vendorRfc: z.string().min(12).max(13).optional(),
  paymentMethod: z.string().max(2).optional(),
  notes: z.string().max(2000).optional(),
  tags: z.array(z.string()).optional(),
});
```

---

## Step 2 — Errors

Create `apps/web/lib/expenses/errors.ts`:

```typescript
export type ExpenseErrorCode =
  | 'EXPENSE_NOT_FOUND'
  | 'EXPENSE_DELETED'
  | 'EXPENSE_ALREADY_VALIDATED'    // Cannot modify a validated expense
  | 'INVALID_EXPENSE_DATA'
  | 'RECEIPT_UPLOAD_FAILED'
  | 'OCR_EXTRACTION_FAILED'
  | 'OCR_SERVICE_UNAVAILABLE'      // AI service is down — non-fatal, expense can be created manually
  | 'CFDI_VALIDATION_FAILED'       // XML structure is invalid
  | 'RFC_MISMATCH'                 // CFDI receptor RFC ≠ organization RFC
  | 'CFDI_ALREADY_ATTACHED'        // Another expense already has this CFDI UUID
  | 'FILE_TOO_LARGE'
  | 'UNSUPPORTED_FILE_TYPE';

export class ExpenseError extends Error {
  constructor(
    public code: ExpenseErrorCode,
    message: string,
    public expenseId?: string,
    public cause?: Error
  ) {
    super(message);
    this.name = 'ExpenseError';
  }
}

export function isExpenseError(err: unknown): err is ExpenseError {
  return err instanceof ExpenseError;
}
```

---

## Step 3 — Categories

Create `apps/web/lib/expenses/categories.ts`:

```typescript
import { ExpenseCategory } from './types';

// Maps category to keywords found in vendor names or CFDI descriptions
// Used for automatic category suggestion — no AI required
const CATEGORY_KEYWORDS: Record<ExpenseCategory, string[]> = {
  [ExpenseCategory.COMBUSTIBLE]: [
    'gasolina', 'combustible', 'diesel', 'pemex', 'bp', 'oxxo combustible',
    'shell', 'total energies', 'hidrosina',
  ],
  [ExpenseCategory.TELECOMUNICACIONES]: [
    'telmex', 'telcel', 'at&t', 'movistar', 'izzi', 'megacable', 'internet',
    'telefonia', 'telefono', 'comunicaciones',
  ],
  [ExpenseCategory.SERVICIOS_PUBLICOS]: [
    'cfe', 'luz', 'electricidad', 'conagua', 'agua', 'gas natural mexico',
    'naturgy', 'gas lp',
  ],
  [ExpenseCategory.ARRENDAMIENTO]: [
    'arrendamiento', 'renta', 'alquiler', 'inmueble', 'local comercial',
    'oficina', 'bodega',
  ],
  [ExpenseCategory.VIATICOS]: [
    'hotel', 'hospedaje', 'aerolinea', 'aeromexico', 'volaris', 'vivaaerobus',
    'american airlines', 'uber', 'cabify', 'didi', 'taxi', 'airbnb',
    'viaticos',
  ],
  [ExpenseCategory.ALIMENTOS_ENTRETENIMIENTO]: [
    'restaurante', 'comida', 'alimentos', 'buffet', 'cafeteria', 'bar',
    'antojitos', 'taqueria',
  ],
  [ExpenseCategory.PUBLICIDAD_MARKETING]: [
    'publicidad', 'marketing', 'google', 'facebook', 'meta', 'linkedin',
    'imprenta', 'diseño grafico', 'agencia',
  ],
  [ExpenseCategory.TECNOLOGIA_SOFTWARE]: [
    'software', 'microsoft', 'google workspace', 'adobe', 'aws', 'amazon web',
    'cloudflare', 'github', 'slack', 'zoom', 'licencia', 'suscripcion',
  ],
  [ExpenseCategory.SERVICIOS_PROFESIONALES]: [
    'honorarios', 'consultor', 'abogado', 'contador', 'notario', 'arquitecto',
    'despacho', 'servicios profesionales', 'asesoria',
  ],
  [ExpenseCategory.SEGUROS]: [
    'seguro', 'aseguradora', 'gnp', 'axa', 'mapfre', 'metlife', 'zurich',
    'qualitas', 'chubb', 'prima',
  ],
  [ExpenseCategory.COMISIONES_BANCARIAS]: [
    'comision', 'bancaria', 'manejo de cuenta', 'banamex', 'bbva', 'santander',
    'hsbc', 'banorte', 'scotiabank', 'inbursa',
  ],
  [ExpenseCategory.PAPELERIA_OFICINA]: [
    'papeleria', 'oficina', 'staples', 'office depot', 'material de oficina',
    'suministros', 'impresion',
  ],
  [ExpenseCategory.COMPRAS_MERCANCIA]: [
    'mercancia', 'producto', 'inventario', 'materia prima', 'insumo',
    'proveedor', 'compra',
  ],
  [ExpenseCategory.SEGURIDAD_SOCIAL]: [
    'imss', 'infonavit', 'seguro social', 'afore', 'cuota patronal',
  ],
  [ExpenseCategory.TRANSPORTE]: [
    'flete', 'mensajeria', 'fedex', 'dhl', 'estafeta', 'redpack', 'logistica',
    'envio', 'paqueteria',
  ],
  [ExpenseCategory.INTERESES]: ['interes', 'credito', 'prestamo', 'financiamiento'],
  [ExpenseCategory.DONACIONES]: ['donativo', 'donacion', 'donataria'],
  [ExpenseCategory.INVERSIONES_ACTIVO_FIJO]: [
    'activo fijo', 'maquinaria', 'equipo computo', 'computadora', 'vehiculo',
    'mobiliario',
  ],
  [ExpenseCategory.EQUIPO_HERRAMIENTAS]: [
    'herramienta', 'equipo', 'herramientas', 'maquinaria menor',
  ],
  [ExpenseCategory.NOMINA_SUELDOS]: ['nomina', 'sueldo', 'salario', 'trabajador'],
  [ExpenseCategory.OTROS]: [],
};

/**
 * Suggests an expense category based on vendor name and/or description.
 * Uses keyword matching — deterministic, no AI dependency.
 * Falls back to OTROS if no match found.
 *
 * @param text - Concatenated vendor name + description (lowercase)
 * @returns Best matching category
 */
export function suggestCategory(vendorName: string, description?: string): ExpenseCategory {
  const text = `${vendorName} ${description ?? ''}`.toLowerCase();
  let bestMatch: ExpenseCategory = ExpenseCategory.OTROS;
  let bestScore = 0;

  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    const score = keywords.filter(kw => text.includes(kw)).length;
    if (score > bestScore) {
      bestScore = score;
      bestMatch = category as ExpenseCategory;
    }
  }

  return bestMatch;
}

/**
 * Returns SAT/ISR deductibility rules for a given category.
 * Used by the validation layer to determine deductibility percent and warnings.
 */
export interface CategoryDeductibilityRule {
  defaultDeductiblePercent: number;   // 100, 91.5, or 0
  requiresBancarizado: boolean;       // Whether cash payment makes it non-deductible
  cashLimit: number | null;           // Max cash deductible (null = no cash at all)
  notes: string;                      // Human-readable rule description
}

export const CATEGORY_DEDUCTIBILITY_RULES: Record<ExpenseCategory, CategoryDeductibilityRule> = {
  [ExpenseCategory.COMBUSTIBLE]: {
    defaultDeductiblePercent: 100,
    requiresBancarizado: true,
    cashLimit: 0,   // Cash is NEVER deductible for fuel regardless of amount
    notes: 'Combustible: pago en efectivo nunca es deducible (Art. 28 LISR)',
  },
  [ExpenseCategory.ALIMENTOS_ENTRETENIMIENTO]: {
    defaultDeductiblePercent: 91.5,
    requiresBancarizado: true,
    cashLimit: 2000,
    notes: 'Alimentos y entretenimiento: deducible al 91.5% con CFDI (Art. 28 LISR)',
  },
  [ExpenseCategory.DONACIONES]: {
    defaultDeductiblePercent: 100,
    requiresBancarizado: false,
    cashLimit: null,
    notes: 'Donativos: máximo 7% de la utilidad fiscal del ejercicio anterior',
  },
  [ExpenseCategory.INVERSIONES_ACTIVO_FIJO]: {
    defaultDeductiblePercent: 100,
    requiresBancarizado: true,
    cashLimit: 2000,
    notes: 'Activo fijo: se deprecia, no se deduce en un solo ejercicio',
  },
  // All remaining categories: standard 100% deductible with bancarization rule
  ...Object.fromEntries(
    [
      ExpenseCategory.COMPRAS_MERCANCIA,
      ExpenseCategory.SERVICIOS_PROFESIONALES,
      ExpenseCategory.ARRENDAMIENTO,
      ExpenseCategory.NOMINA_SUELDOS,
      ExpenseCategory.SEGURIDAD_SOCIAL,
      ExpenseCategory.VIATICOS,
      ExpenseCategory.TRANSPORTE,
      ExpenseCategory.PAPELERIA_OFICINA,
      ExpenseCategory.SERVICIOS_PUBLICOS,
      ExpenseCategory.TELECOMUNICACIONES,
      ExpenseCategory.PUBLICIDAD_MARKETING,
      ExpenseCategory.TECNOLOGIA_SOFTWARE,
      ExpenseCategory.EQUIPO_HERRAMIENTAS,
      ExpenseCategory.INTERESES,
      ExpenseCategory.SEGUROS,
      ExpenseCategory.COMISIONES_BANCARIAS,
      ExpenseCategory.OTROS,
    ].map(cat => [cat, {
      defaultDeductiblePercent: 100,
      requiresBancarizado: true,
      cashLimit: 2000,
      notes: 'Gasto operativo estrictamente indispensable (Art. 25/27 LISR)',
    }])
  ),
};
```

---

## Step 4 — Validation

Create `apps/web/lib/expenses/validation.ts`:

```typescript
import { validateCFDI } from '@repo/cfdi';
import type { DeductibilityAssessment } from './types';
import { CATEGORY_DEDUCTIBILITY_RULES } from './categories';

const GENERIC_PUBLIC_RFC = 'XAXX010101000';  // RFC público general — not deductible
const GENERIC_FOREIGN_RFC = 'XEXX010101000'; // RFC extranjero

/**
 * Validates CFDI XML structural integrity using the @repo/cfdi package.
 * Returns a clean result object regardless of validation outcome.
 */
export function validateCFDIStructure(xml: string): {
  valid: boolean;
  errors: string[];
  uuid?: string;
  emisorRfc?: string;
  receptorRfc?: string;
  total?: number;
  fecha?: string;
  tipoComprobante?: string;
} {
  const result = validateCFDI(xml);
  // Parse additional fields from XML for expense linking
  // Use @xmldom/xmldom (already installed) to extract key attributes
  // ...
}

/**
 * Checks that the CFDI's receptor RFC matches the organization's RFC.
 * This is a hard requirement for deductibility under Art. 27 LISR.
 *
 * @returns true if RFC matches (case-insensitive, normalized)
 */
export function checkRFCMatch(receptorRfc: string, organizationRfc: string): boolean {
  const normalized = (rfc: string) => rfc.trim().toUpperCase();
  return normalized(receptorRfc) === normalized(organizationRfc);
}

/**
 * Checks if the receptor RFC is a generic public RFC (not deductible).
 */
export function isGenericRFC(rfc: string): boolean {
  return rfc.trim().toUpperCase() === GENERIC_PUBLIC_RFC
      || rfc.trim().toUpperCase() === GENERIC_FOREIGN_RFC;
}

/**
 * Determines whether an expense is deductible under Mexican ISR law.
 *
 * Applies rules in order:
 * 1. Generic RFC → not deductible (Art. 27 LISR - must have CFDI to org RFC)
 * 2. Fuel + cash payment → not deductible (Art. 28 LISR)
 * 3. Cash > $2,000 MXN → not deductible (Art. 27 LISR)
 * 4. Meals/entertainment → 91.5% deductible (Art. 28 LISR)
 * 5. Otherwise → 100% deductible
 *
 * @param expense - Expense data including category, paymentMethod, cfdiUuid, vendorRfc
 * @param organizationRfc - The organization's RFC (for receptor RFC check)
 */
export function assessDeductibility(
  expense: {
    category: ExpenseCategory;
    amount: number;
    total: number;
    paymentMethod?: string;    // SAT FormaPago code: '01'=cash, '03'=transfer, etc.
    vendorRfc?: string;
    cfdiUuid?: string;
  },
  organizationRfc: string
): DeductibilityAssessment {
  const warnings: string[] = [];
  const rule = CATEGORY_DEDUCTIBILITY_RULES[expense.category];

  // Rule 1: No CFDI backing
  if (!expense.cfdiUuid) {
    warnings.push('Sin CFDI: el gasto puede no ser deducible sin comprobante fiscal');
  }

  // Rule 2: Generic RFC
  if (expense.vendorRfc && isGenericRFC(expense.vendorRfc)) {
    return {
      isDeductible: false,
      deductibilityPercent: 0,
      reason: 'RFC genérico (público general) no permite deducción personal del gasto',
      legalBasis: 'Art. 27 LISR - El CFDI debe estar a nombre del contribuyente',
      warnings,
    };
  }

  // Rule 3: Fuel with cash payment (NEVER deductible)
  const isCashPayment = expense.paymentMethod === '01'; // '01' = Efectivo
  if (expense.category === ExpenseCategory.COMBUSTIBLE && isCashPayment) {
    return {
      isDeductible: false,
      deductibilityPercent: 0,
      reason: 'Combustible pagado en efectivo: no deducible sin importar el monto',
      legalBasis: 'Art. 28 LISR - Combustible debe pagarse en forma bancarizada',
      warnings,
    };
  }

  // Rule 4: Cash payment over $2,000 MXN
  if (isCashPayment && expense.total > 2000 && rule.cashLimit !== null) {
    return {
      isDeductible: false,
      deductibilityPercent: 0,
      reason: `Pago en efectivo mayor a $2,000 MXN (total: $${expense.total.toFixed(2)})`,
      legalBasis: 'Art. 27 LISR - Pagos mayores a $2,000 deben ser bancarizados',
      warnings,
    };
  }

  // Rule 5: Meals/entertainment (91.5% rule)
  if (expense.category === ExpenseCategory.ALIMENTOS_ENTRETENIMIENTO) {
    return {
      isDeductible: true,
      deductibilityPercent: 91.5,
      reason: 'Alimentos y entretenimiento: deducible al 91.5% del monto erogado',
      legalBasis: 'Art. 28 fracción XX LISR',
      warnings,
    };
  }

  // Default: fully deductible
  return {
    isDeductible: true,
    deductibilityPercent: rule.defaultDeductiblePercent,
    reason: 'Gasto estrictamente indispensable con comprobante fiscal',
    legalBasis: 'Art. 25/27 LISR',
    warnings,
  };
}

/**
 * Validates complete expense input data.
 * Returns array of validation error messages (empty = valid).
 */
export function validateExpenseData(data: CreateExpenseInput, orgRfc?: string): string[] {
  const errors: string[] = [];
  if (data.total < data.amount) {
    errors.push('El total no puede ser menor que el monto base');
  }
  if (data.taxAmount && data.amount + data.taxAmount !== data.total) {
    // Allow small floating point tolerance
    if (Math.abs(data.amount + data.taxAmount - data.total) > 0.02) {
      errors.push('Total no coincide con monto + impuesto');
    }
  }
  const expDate = new Date(data.expenseDate);
  if (isNaN(expDate.getTime())) {
    errors.push('Fecha de gasto inválida');
  }
  if (data.vendorRfc && !/^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/.test(data.vendorRfc.toUpperCase())) {
    errors.push('RFC del proveedor tiene formato inválido');
  }
  return errors;
}
```

---

## Step 5 — OCR Integration

Create `apps/web/lib/expenses/ocr-integration.ts`:

```typescript
import {
  processReceiptFromBytes,
  processCFDIFromString,
  hasMinimumRequiredData,
  formatExtractedAmount,
  formatExtractedDate,
  OCRServiceUnavailableError,
} from '@/lib/ocr';
import type { ExtractedExpenseData } from './types';

/**
 * Extracts expense data from a receipt image or PDF via the OCR microservice.
 *
 * Called when a user uploads a receipt image. Returns extracted fields
 * to pre-fill the expense form. Always returns a result — if OCR fails,
 * returns empty extraction with confidence=0 so the caller can fall back
 * to manual entry without blocking the upload.
 *
 * @param fileBuffer - Raw file bytes
 * @param mimeType - e.g., 'image/jpeg', 'application/pdf'
 * @param filename - Original filename for the OCR service
 */
export async function extractFromReceipt(
  fileBuffer: Buffer,
  mimeType: string,
  filename: string
): Promise<ExtractedExpenseData> {
  try {
    const result = await processReceiptFromBytes(fileBuffer, mimeType, filename);

    return {
      vendorName: result.extracted_data.vendor_name?.value,
      vendorRfc: result.extracted_data.rfc?.value,
      amount: result.extracted_data.subtotal?.value
        ? parseFloat(formatExtractedAmount(result.extracted_data.subtotal.value))
        : undefined,
      taxAmount: result.extracted_data.iva_amount?.value
        ? parseFloat(formatExtractedAmount(result.extracted_data.iva_amount.value))
        : undefined,
      total: result.extracted_data.total_amount?.value
        ? parseFloat(formatExtractedAmount(result.extracted_data.total_amount.value))
        : undefined,
      expenseDate: result.extracted_data.date?.value
        ? formatExtractedDate(result.extracted_data.date.value)
        : undefined,
      currency: result.extracted_data.currency?.value ?? 'MXN',
      confidence: result.overall_confidence,
      warnings: result.warnings ?? [],
    };
  } catch (err) {
    if (err instanceof OCRServiceUnavailableError) {
      // Non-fatal: OCR service is down, user can fill manually
      return {
        confidence: 0,
        warnings: ['Servicio OCR no disponible. Por favor llena los campos manualmente.'],
      };
    }
    // Other errors: return empty with warning
    return {
      confidence: 0,
      warnings: [`Error al procesar el comprobante: ${(err as Error).message}`],
    };
  }
}

/**
 * Extracts expense data from a CFDI XML string.
 *
 * More reliable than receipt OCR because XML is structured.
 * Extracts: UUID, emisor RFC/name, total, date, payment method.
 *
 * @param xmlContent - The CFDI XML string
 */
export async function extractFromCFDIXml(
  xmlContent: string
): Promise<ExtractedExpenseData & { cfdiUuid?: string; tipoComprobante?: string }> {
  try {
    const result = await processCFDIFromString(xmlContent);

    return {
      cfdiUuid: result.uuid?.value,
      vendorName: result.emisor_nombre?.value,
      vendorRfc: result.emisor_rfc?.value,
      total: result.total?.value
        ? parseFloat(formatExtractedAmount(result.total.value))
        : undefined,
      amount: result.subtotal?.value
        ? parseFloat(formatExtractedAmount(result.subtotal.value))
        : undefined,
      expenseDate: result.fecha?.value
        ? formatExtractedDate(result.fecha.value)
        : undefined,
      paymentMethod: result.forma_pago?.value,
      currency: result.moneda?.value ?? 'MXN',
      tipoComprobante: result.tipo_comprobante?.value,
      confidence: 0.95,  // XML extraction is highly reliable
      warnings: [],
    };
  } catch (err) {
    if (err instanceof OCRServiceUnavailableError) {
      return {
        confidence: 0,
        warnings: ['Servicio OCR no disponible para procesar XML.'],
      };
    }
    return {
      confidence: 0,
      warnings: [`Error al procesar el XML: ${(err as Error).message}`],
    };
  }
}

/**
 * Merges OCR-extracted data into a CreateExpenseInput draft.
 * Only fills fields that are missing or have low confidence.
 * User-provided values always take precedence.
 */
export function autoFillFromOCR(
  existing: Partial<CreateExpenseInput>,
  extracted: ExtractedExpenseData
): Partial<CreateExpenseInput> {
  const filled = { ...existing };
  if (!filled.vendorName && extracted.vendorName) filled.vendorName = extracted.vendorName;
  if (!filled.vendorRfc && extracted.vendorRfc) filled.vendorRfc = extracted.vendorRfc;
  if (!filled.amount && extracted.amount) filled.amount = extracted.amount;
  if (!filled.taxAmount && extracted.taxAmount) filled.taxAmount = extracted.taxAmount;
  if (!filled.total && extracted.total) filled.total = extracted.total;
  if (!filled.expenseDate && extracted.expenseDate) filled.expenseDate = extracted.expenseDate;
  if (!filled.paymentMethod && extracted.paymentMethod) filled.paymentMethod = extracted.paymentMethod;
  if (!filled.currency && extracted.currency) filled.currency = extracted.currency;
  return filled;
}
```

---

## Step 6 — Repository

Create `apps/web/lib/expenses/repository.ts` — all DB operations against the `expenses` table. The table already has RLS enabled with organization-scoped policies.

Key functions:
- `createExpense(supabase, orgId, userId, data)` → inserts into existing table, maps to `Expense`
- `findExpenseById(supabase, expenseId, orgId)` → returns `Expense | null`, excludes `deleted_at IS NOT NULL`
- `findExpensesByOrg(supabase, orgId, filters, pagination)` → paginated list with filters
- `updateExpense(supabase, expenseId, updates)` → partial update
- `softDeleteExpense(supabase, expenseId)` → sets `deleted_at = NOW()`
- `findExpensesByCFDIUuid(supabase, cfdiUuid, orgId)` → for duplicate CFDI detection

**Column name mapping** (DB column → TypeScript field):
```
vendor_rfc         → vendorRfc
vendor_name        → vendorName
tax_amount         → taxAmount
is_deductible      → isDeductible
expense_date       → expenseDate
validated_at       → validatedAt
xml_url            → xmlUrl
pdf_url            → pdfUrl
receipt_url        → receiptUrl
organization_id    → organizationId
created_by         → createdBy
deleted_at         → deletedAt
created_at         → createdAt
updated_at         → updatedAt
```

New columns `deductibility_percent`, `deductibility_notes`, `payment_method`, `ocr_confidence` are added by the migration in Step 8.

---

## Step 7 — Service

Create `apps/web/lib/expenses/service.ts`:

```typescript
/**
 * createExpense — creates a draft expense record.
 * Runs deductibility assessment immediately on creation.
 * Sets status='received' (since the user is providing data).
 */
export async function createExpense(
  organizationId: string,
  userId: string,
  input: CreateExpenseInput,
  supabase: SupabaseClient
): Promise<Expense>

/**
 * uploadReceipt — uploads a receipt image/PDF to R2 and triggers OCR.
 *
 * Flow:
 * 1. Validate file type (jpeg, png, webp, pdf) and size (max 10MB)
 * 2. Upload to R2: key = `receipts/{organizationId}/{expenseId}/{filename}`
 * 3. Call extractFromReceipt() via OCR service
 * 4. Update expense with receipt_url and any OCR-extracted fields (if confidence > 0.6)
 * 5. Return updated expense + extracted data
 *
 * OCR failure is non-fatal — expense is updated with receipt_url regardless.
 */
export async function uploadReceipt(
  expenseId: string,
  organizationId: string,
  fileBuffer: Buffer,
  filename: string,
  mimeType: string,
  supabase: SupabaseClient
): Promise<{ expense: Expense; extracted: ExtractedExpenseData }>

/**
 * attachCFDI — attaches a CFDI XML to an expense.
 *
 * Flow:
 * 1. Extract data from XML via OCR service (processCFDIFromString)
 * 2. Validate CFDI structure via @repo/cfdi validateCFDI()
 * 3. Check receptor RFC matches organization RFC
 *    → If mismatch: set isDeductible=false, status='rejected', deductibilityNotes=RFC mismatch reason
 * 4. Check for duplicate CFDI UUID (another expense already uses this UUID)
 * 5. Upload XML to R2: key = `cfdi-expenses/{organizationId}/{expenseId}/{cfdiUuid}.xml`
 * 6. Update expense with cfdi_uuid, xml_url, vendor data, amounts, status='validated'
 * 7. Re-run deductibility assessment with full CFDI data
 * 8. Return updated expense
 *
 * @throws ExpenseError('RFC_MISMATCH') — sets expense to rejected, does not throw
 *   (caller receives the updated expense and can display the reason to the user)
 * @throws ExpenseError('CFDI_ALREADY_ATTACHED') if duplicate UUID
 */
export async function attachCFDI(
  expenseId: string,
  organizationId: string,
  xmlContent: string,
  supabase: SupabaseClient
): Promise<Expense>

/**
 * updateExpense — updates a non-validated expense.
 * Re-runs deductibility assessment after update.
 * @throws ExpenseError('EXPENSE_ALREADY_VALIDATED') if status is 'validated'
 */
export async function updateExpense(
  expenseId: string,
  organizationId: string,
  input: UpdateExpenseInput,
  supabase: SupabaseClient
): Promise<Expense>

/**
 * categorizeExpense — sets category and re-assesses deductibility.
 */
export async function categorizeExpense(
  expenseId: string,
  organizationId: string,
  category: ExpenseCategory,
  supabase: SupabaseClient
): Promise<Expense>

/**
 * deleteExpense — soft deletes. Cannot delete a validated expense.
 */
export async function deleteExpense(
  expenseId: string,
  organizationId: string,
  supabase: SupabaseClient
): Promise<void>

/**
 * getExpense / listExpenses — standard read operations.
 */
export async function getExpense(
  expenseId: string,
  organizationId: string,
  supabase: SupabaseClient
): Promise<Expense>

export async function listExpenses(
  organizationId: string,
  filters: ExpenseFilters,
  pagination: ExpensePagination,
  supabase: SupabaseClient
): Promise<ExpenseListResult>
```

---

## Step 8 — Reports

Create `apps/web/lib/expenses/reports.ts`:

```typescript
export interface ExpenseReportSummary {
  organizationId: string;
  dateFrom: string;
  dateTo: string;
  totalExpenses: number;           // Count
  totalAmount: number;             // Sum of total column
  totalDeductible: number;         // Sum where is_deductible = true, weighted by deductibility_percent
  totalNonDeductible: number;
  totalIVA: number;                // Sum of tax_amount (IVA creditable for IVA returns)
  byCategory: Array<{
    category: ExpenseCategory;
    label: string;
    count: number;
    amount: number;
    deductibleAmount: number;
  }>;
  byStatus: Record<ExpenseStatus, number>;
}

/**
 * Generates an expense summary report for a date range.
 * This is the main input for Component 24 (Tax Calculation Engine)'s IVA and ISR calculations.
 *
 * deductibleAmount per category = SUM(total * deductibility_percent / 100) WHERE is_deductible = true
 */
export async function generateExpenseReport(
  organizationId: string,
  dateFrom: string,
  dateTo: string,
  supabase: SupabaseClient
): Promise<ExpenseReportSummary>

/**
 * Returns expenses grouped by category for a period.
 * Used for the expense breakdown dashboard widget.
 */
export async function getExpensesByCategory(
  organizationId: string,
  dateFrom: string,
  dateTo: string,
  supabase: SupabaseClient
): Promise<Array<{ category: ExpenseCategory; label: string; total: number; count: number }>>

/**
 * Returns all deductible expenses for a fiscal period.
 * Component 24 calls this to compute ISR deductions.
 *
 * @param period - 'monthly' | 'quarterly' | 'annual'
 * @param year - Fiscal year (e.g., 2026)
 * @param month - Required if period='monthly' (1-12)
 */
export async function getDeductibleExpenses(
  organizationId: string,
  period: 'monthly' | 'quarterly' | 'annual',
  year: number,
  month?: number,
  supabase: SupabaseClient
): Promise<{
  expenses: Expense[];
  totalDeductible: number;
  totalIVACreditable: number;    // IVA from deductible expenses (for IVA return)
}>

/**
 * Returns expense data in a format suitable for CSV/Excel export.
 * Returns a flat array of records — frontend handles rendering.
 */
export async function getExpensesForExport(
  organizationId: string,
  filters: ExpenseFilters,
  supabase: SupabaseClient
): Promise<Array<Record<string, string | number | boolean>>>
```

---

## Step 9 — Database Migration

Create `supabase/migrations/20260313000000_enhance_expenses_table.sql`:

```sql
-- Enhance the existing expenses table with new columns needed by Component 20.
-- The expenses table already exists — use ADD COLUMN IF NOT EXISTS throughout.

ALTER TABLE expenses
  ADD COLUMN IF NOT EXISTS deductibility_percent DECIMAL(5,2) DEFAULT 100.00
    CHECK (deductibility_percent >= 0 AND deductibility_percent <= 100),
  ADD COLUMN IF NOT EXISTS deductibility_notes TEXT,
  ADD COLUMN IF NOT EXISTS payment_method VARCHAR(2),     -- SAT c_FormaPago code
  ADD COLUMN IF NOT EXISTS ocr_confidence DECIMAL(4,3);   -- 0.000 - 1.000

-- Rename category column values if needed (the column is VARCHAR(100) — no enum constraint)
-- Add index for CFDI UUID lookups (duplicate detection)
CREATE UNIQUE INDEX IF NOT EXISTS idx_expenses_cfdi_uuid
  ON expenses(organization_id, cfdi_uuid)
  WHERE cfdi_uuid IS NOT NULL AND deleted_at IS NULL;

-- Index for deductibility reports (Component 24 queries these frequently)
CREATE INDEX IF NOT EXISTS idx_expenses_deductible
  ON expenses(organization_id, is_deductible, expense_date)
  WHERE deleted_at IS NULL;

-- Index for category reporting
CREATE INDEX IF NOT EXISTS idx_expenses_category_date
  ON expenses(organization_id, category, expense_date)
  WHERE deleted_at IS NULL;

-- Add comment for Component 24 consumers
COMMENT ON COLUMN expenses.deductibility_percent IS
  'Percentage of expense that is ISR-deductible: 100 (full), 91.5 (meals/entertainment), 0 (non-deductible)';
COMMENT ON COLUMN expenses.payment_method IS
  'SAT c_FormaPago code: 01=cash, 03=transfer, 04=credit card, 28=debit card, etc.';
```

**Important:** Do NOT drop or modify the existing `expense_status` enum or existing columns. Adding `pending_approval` and `approved` to the enum requires `ALTER TYPE expense_status ADD VALUE IF NOT EXISTS` — only do this if the approval workflow genuinely needs it. For this component, the existing four statuses are sufficient.

---

## Public Bridge

Create `apps/web/lib/expenses/index.ts` with clean exports. Also confirm that nothing new needs to be added to `apps/web/lib/invoices/index.ts` — expenses are a separate module with no invoice dependency.

---

## Coverage Targets and Tests

| File | Target |
|---|---|
| `types.ts` (Zod schema) | ≥95% |
| `errors.ts` | ≥95% |
| `categories.ts` | ≥95% |
| `validation.ts` | ≥95% |
| `ocr-integration.ts` | ≥85% |
| `repository.ts` | ≥85% |
| `service.ts` | ≥85% |
| `reports.ts` | ≥80% |

**Total new tests: ≥90**

### Key Test Scenarios

**`validation.ts` — deductibility rules (all must pass):**
- Fuel + cash payment → `isDeductible: false`, `deductibilityPercent: 0`
- Cash > $2,000 for any category → `isDeductible: false`
- Cash ≤ $2,000 → `isDeductible: true`
- Generic RFC `XAXX010101000` → `isDeductible: false`
- RFC mismatch (receptor ≠ org) → `isDeductible: false`
- Meals/entertainment with card payment → `deductibilityPercent: 91.5`
- Normal expense with CFDI and card → `deductibilityPercent: 100`
- `validateExpenseData` catches total < amount
- `validateExpenseData` catches total ≠ amount + taxAmount (> 2 cent tolerance)

**`categories.ts`:**
- `suggestCategory('PEMEX', 'gasolina magna')` → `COMBUSTIBLE`
- `suggestCategory('TELCEL', 'plan de datos')` → `TELECOMUNICACIONES`
- `suggestCategory('Unknown Vendor', '')` → `OTROS`
- Category rules: `COMBUSTIBLE` has `cashLimit: 0`
- Category rules: `ALIMENTOS_ENTRETENIMIENTO` has `defaultDeductiblePercent: 91.5`

**`ocr-integration.ts`:**
- `extractFromReceipt` when OCR service unavailable → returns `{ confidence: 0, warnings: [...] }`, does NOT throw
- `extractFromCFDIXml` maps OCR result fields to `ExtractedExpenseData` correctly
- `autoFillFromOCR` does not overwrite user-provided values
- `autoFillFromOCR` fills empty fields from OCR data

**`service.ts`:**
- `uploadReceipt` with OCR failure → still saves receipt_url, returns expense
- `attachCFDI` with RFC mismatch → sets `isDeductible: false`, does NOT throw
- `attachCFDI` with duplicate CFDI UUID → throws `CFDI_ALREADY_ATTACHED`
- `attachCFDI` with valid CFDI → sets status='validated', cfdi_uuid, xml_url
- `updateExpense` on validated expense → throws `EXPENSE_ALREADY_VALIDATED`
- `createExpense` immediately runs deductibility assessment and persists result
- `deleteExpense` sets `deleted_at`, returns void

**`reports.ts`:**
- `getDeductibleExpenses` for monthly period returns only expenses in that month
- `generateExpenseReport` deductible total = SUM(total * deductibility_percent / 100)
- `getExpensesByCategory` groups correctly, excludes deleted expenses

---

## Key Design Decisions

**1. OCR failure is always non-fatal.**
The OCR microservice may be down (it's a separate Python FastAPI service). `uploadReceipt` and `attachCFDI` both proceed without OCR data if the service is unavailable. The user can always fill fields manually. The expense record is never blocked by OCR availability.

**2. Deductibility is assessed at write time, not query time.**
`is_deductible`, `deductibility_percent`, and `deductibility_notes` are persisted to the DB on every create/update/attachCFDI call. This makes Component 24's tax calculations fast (simple SUM queries) and auditable (the assessment at the time of recording is preserved).

**3. RFC mismatch sets rejected status, not a thrown error.**
When a user uploads a CFDI where the receptor RFC doesn't match the org RFC, this is a common real-world scenario (uploaded wrong file, vendor used wrong RFC). The component sets `status='rejected'` and `isDeductible=false` with a clear `deductibilityNotes` reason, but returns the updated expense — it does not throw. The user sees why and can upload the correct CFDI.

**4. The `expenses` table already exists — migration is additive only.**
The four new columns (`deductibility_percent`, `deductibility_notes`, `payment_method`, `ocr_confidence`) are added with `IF NOT EXISTS`. Existing rows get sensible defaults (`deductibility_percent=100`).

**5. Category suggestion is keyword-based, not AI.**
The AI SAT Code Search service (Component 9) is designed for CFDI product/service codes, not expense management categories. Keyword matching is deterministic, fast, and sufficient for the 21 expense categories. No external API call needed for category suggestion.

**6. Reports serve Component 24.**
`getDeductibleExpenses` is the primary output this component provides to the tax calculation engine. The return shape (`totalDeductible`, `totalIVACreditable`) matches exactly what Component 24 needs to compute ISR deductions and IVA return amounts. Design the query to be efficient — use `SUM()` in Postgres, not JS-side aggregation.

---

## Environment Variables

No new environment variables needed. This component reuses:
- `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` — for service-role DB operations
- `AI_SERVICE_URL` — already set for OCR service (Component 10 uses this)
- R2 credentials — already set from Component 4 (CSD storage)

---

## Definition of Done

- [ ] `apps/web/lib/expenses/types.ts` — all interfaces, `ExpenseCategory` enum with 21 categories, Zod schema
- [ ] `apps/web/lib/expenses/errors.ts` — `ExpenseError` with 8 error codes
- [ ] `apps/web/lib/expenses/categories.ts` — keyword map, `suggestCategory()`, `CATEGORY_DEDUCTIBILITY_RULES`
- [ ] `apps/web/lib/expenses/validation.ts` — `assessDeductibility()`, `validateCFDIStructure()`, `checkRFCMatch()`
- [ ] `apps/web/lib/expenses/ocr-integration.ts` — `extractFromReceipt()`, `extractFromCFDIXml()`, `autoFillFromOCR()`
- [ ] `apps/web/lib/expenses/repository.ts` — all CRUD operations, `findExpensesByCFDIUuid()`
- [ ] `apps/web/lib/expenses/service.ts` — `createExpense`, `uploadReceipt`, `attachCFDI`, `updateExpense`, `categorizeExpense`, `deleteExpense`, `getExpense`, `listExpenses`
- [ ] `apps/web/lib/expenses/reports.ts` — `generateExpenseReport`, `getExpensesByCategory`, `getDeductibleExpenses`, `getExpensesForExport`
- [ ] `apps/web/lib/expenses/index.ts` — public exports
- [ ] Migration: 4 new columns on `expenses` with `IF NOT EXISTS`
- [ ] Migration: unique index on `(organization_id, cfdi_uuid)` for duplicate detection
- [ ] Migration: performance indexes for report queries
- [ ] OCR failure is non-fatal in both `uploadReceipt` and `attachCFDI`
- [ ] RFC mismatch sets `status='rejected'`, `isDeductible=false`, does NOT throw
- [ ] Deductibility assessed and persisted on every write operation
- [ ] Fuel + cash → `deductibilityPercent=0` (hard rule, no exceptions)
- [ ] Cash > $2,000 → `deductibilityPercent=0` for all categories
- [ ] Meals/entertainment → `deductibilityPercent=91.5`
- [ ] `suggestCategory` uses keyword matching, no AI dependency
- [ ] `getDeductibleExpenses` returns `totalIVACreditable` for Component 24
- [ ] Duplicate CFDI UUID detection throws `CFDI_ALREADY_ATTACHED`
- [ ] Soft delete sets `deleted_at`, validated expenses cannot be deleted
- [ ] **≥90 new tests, all passing**

---

## Required Completion Summary

When done, provide:
1. All files created (with paths)
2. Test count per file
3. Confirmation that `assessDeductibility` covers all 5 ISR rules
4. Example output of `generateExpenseReport` for a sample dataset
5. Confirmation that OCR service unavailability does NOT block expense creation
6. Any deviations from this spec and why
