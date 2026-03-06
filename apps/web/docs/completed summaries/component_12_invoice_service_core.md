# Component 12: Invoice Service (Core) - Completion Summary

## Overview

Component 12 implements the core invoice service for CFDI 4.0 compliant electronic invoicing in Mexico. This is the most critical component in the system, as all downstream components (13-18, 24) depend on it. The implementation provides precise monetary calculations using decimal.js, a robust status workflow state machine, and comprehensive validation for SAT requirements.

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Next.js Application                          │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────┐ │
│  │   UI Components │  │  Server Actions │  │  lib/invoices/      │ │
│  │   (Future)      │──│  actions.ts     │──│  index.ts (exports) │ │
│  └─────────────────┘  └─────────────────┘  └─────────────────────┘ │
│                                                      │              │
│  ┌───────────────────────────────────────────────────┼────────────┐ │
│  │                    Invoice Module                  ▼            │ │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │ │
│  │  │  service.ts  │──│ repository.ts│──│  Supabase Client     │  │ │
│  │  │  (Business)  │  │  (Data)      │  │  (Database)          │  │ │
│  │  └──────────────┘  └──────────────┘  └──────────────────────┘  │ │
│  │         │                                                       │ │
│  │  ┌──────┴──────────────────────────────────────────────────┐   │ │
│  │  │                    Supporting Modules                    │   │ │
│  │  │  ┌────────────┐  ┌────────────┐  ┌────────────────────┐ │   │ │
│  │  │  │ workflow.ts│  │validation. │  │ calculations.ts    │ │   │ │
│  │  │  │ (State)    │  │ ts (Zod)   │  │ (decimal.js)       │ │   │ │
│  │  │  └────────────┘  └────────────┘  └────────────────────┘ │   │ │
│  │  └──────────────────────────────────────────────────────────┘   │ │
│  └─────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────┬──────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────┐
│                        Supabase/PostgreSQL                          │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────┐ │
│  │    invoices     │  │  invoice_items  │  │ invoice_related_cfdi│ │
│  │  (CFDI 4.0)     │──│  (Line items)   │  │ (Related CFDIs)     │ │
│  └─────────────────┘  └─────────────────┘  └─────────────────────┘ │
│  ┌─────────────────┐  ┌─────────────────────────────────────────┐  │
│  │ invoice_folio_  │  │         get_next_folio()                │  │
│  │ sequences       │──│   (Atomic folio generation function)    │  │
│  └─────────────────┘  └─────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
```

## Files Created/Modified

### Database Migration

| File | Purpose |
|------|---------|
| `supabase/migrations/20260305000001_create_invoices.sql` | ALTER existing tables, create new tables, RLS policies, atomic folio function |

### TypeScript Module (lib/invoices/)

| File | Purpose |
|------|---------|
| `types.ts` | Enums, interfaces, constants for CFDI 4.0 compliance |
| `calculations.ts` | Precise monetary calculations using decimal.js |
| `validation.ts` | Zod schemas and business rule validators |
| `workflow.ts` | Invoice status state machine with transitions |
| `repository.ts` | Data access layer for Supabase operations |
| `service.ts` | Business logic orchestration |
| `actions.ts` | Next.js Server Actions with auth/RBAC |
| `index.ts` | Module exports for clean imports |

### Test Files (__tests__/)

| File | Tests | Purpose |
|------|-------|---------|
| `migration.test.ts` | 59 | Migration SQL parsing and RLS policies |
| `types.test.ts` | 35 | Enums, type guards, constants |
| `calculations.test.ts` | 51 | Decimal.js calculations, rounding, CFDI formatting |
| `validation.test.ts` | 73 | Zod schemas, CFDI validators, edge cases |
| `workflow.test.ts` | 56 | State machine transitions, guards |
| `repository.test.ts` | 33 | Data layer operations, mocked Supabase |
| `service.test.ts` | 35 | Business logic, service context |
| `actions.test.ts` | 23 | Server actions, auth, permissions |

**Total: 365 tests passing**

## Key Features

### 1. CFDI 4.0 Compliance

- **TipoComprobante**: I (Ingreso), E (Egreso), T (Traslado), P (Pago), N (Nómina)
- **MetodoPago**: PUE (single payment), PPD (deferred payment)
- **TipoRelacion**: Cancellation, substitution, credit notes, etc.
- **Tax Object**: Categories 01-08 per SAT catalog
- **72-hour rule**: Issue date validation within SAT window

### 2. Precise Calculations (decimal.js)

```typescript
import Decimal from 'decimal.js';
Decimal.set({ precision: 20, rounding: Decimal.ROUND_HALF_UP });

// Line item calculation
calculateLineItem(item: InvoiceItemInput): LineItemCalculation

// Invoice totals with tax breakdown
calculateInvoiceTotals(items: InvoiceItemInput[]): InvoiceTotals

// CFDI formatting (6 decimal places)
formatForCFDI(amount: number): string  // "1234.567890"
formatRateForCFDI(rate: number): string // "0.160000"
```

### 3. Status Workflow State Machine

```
DRAFT ──────────────────────► PENDING_STAMP
  │                                │
  │ (delete)                       │ (stamp success)
  ▼                                ▼
VOIDED ◄────────────────────── STAMPED
                                   │
                    ┌──────────────┼──────────────┐
                    │              │              │
                    ▼              ▼              ▼
                  SENT          PAID        CANCELLED
                    │              │
                    └──────► PAID ◄┘
```

**7 States**: DRAFT, PENDING_STAMP, STAMPED, SENT, PAID, CANCELLED, VOIDED
**9 Transitions**: Each with validation rules and guards

### 4. Validation Layer (Zod)

```typescript
// Create invoice schema
export const CreateInvoiceSchema = z.object({
  customer_id: z.string().uuid(),
  tipo_comprobante: z.nativeEnum(TipoComprobante),
  payment_method: z.enum(METODO_PAGO_VALUES),
  payment_form: z.enum(PAYMENT_FORM_CODES),
  currency: z.enum(CURRENCY_CODES),
  items: z.array(InvoiceItemInputSchema).min(1),
  // ... more fields
});

// Business rule validators
validateCustomerForCFDI(customer): ValidationResult
validatePaymentTerms(method, form): ValidationResult
validateInvoiceForStamping(invoice): ValidationResult
```

### 5. Atomic Folio Generation

PostgreSQL function with UPSERT for race-condition-safe folio assignment:

```sql
CREATE OR REPLACE FUNCTION get_next_folio(
  p_organization_id UUID,
  p_serie TEXT DEFAULT NULL
) RETURNS TEXT AS $$
DECLARE
  v_next_number INTEGER;
  v_folio TEXT;
BEGIN
  INSERT INTO invoice_folio_sequences (organization_id, serie, last_number)
  VALUES (p_organization_id, COALESCE(p_serie, 'A'), 0)
  ON CONFLICT (organization_id, serie)
  DO UPDATE SET last_number = invoice_folio_sequences.last_number + 1
  RETURNING last_number INTO v_next_number;

  v_folio := COALESCE(p_serie, 'A') || LPAD(v_next_number::TEXT, 6, '0');
  RETURN v_folio;
END;
$$ LANGUAGE plpgsql;
```

### 6. Service Context (Dependency Injection)

```typescript
interface ServiceContext {
  customerService: CustomerService;
  organizationService: OrganizationService;
  productService: ProductService;
}

// In actions.ts - real implementations
const context: ServiceContext = {
  customerService: {
    findById: async (id) => await customerService.getCustomer(id)
  },
  organizationService: {
    findById: async (id) => await organizationService.getOrganization(id)
  },
  productService: {
    findById: async (id) => null // Component 13 will implement
  }
};
```

### 7. Denormalized Snapshots

Invoice stores issuer/receiver data at creation time:

```typescript
// Issuer snapshot (from organization)
issuer_rfc: string;
issuer_name: string;
issuer_tax_regime: string;
issuer_postal_code: string;

// Receiver snapshot (from customer)
receiver_rfc: string;
receiver_name: string;
receiver_tax_regime: string;
receiver_cfdi_use: string;
receiver_postal_code: string;
```

## Database Tables

### invoices (ALTERed existing table)

New columns added:
- `tipo_comprobante`, `payment_method`, `payment_form`
- `issuer_*` (rfc, name, tax_regime, postal_code)
- `receiver_*` (rfc, name, tax_regime, cfdi_use, postal_code)
- `cfdi_version`, `export_type`, `exchange_rate`
- `payment_conditions`, `confirmation_code`
- `xml_content`, `pdf_content`
- `stamps` (JSONB: uuid, seal, sat_seal, timestamp, chain)
- `cancellation_*` (uuid, reason, status, date)
- `stamped_at`, `cancelled_at`, `sent_at`, `paid_at`

### invoice_items (ALTERed existing table)

New columns added:
- `product_service_key`, `unit_key`, `tax_object`
- `subtotal`, `discount`, `taxes`, `total`
- `tax_breakdown` (JSONB array of tax details)

### invoice_related_cfdi (NEW)

| Column | Type | Purpose |
|--------|------|---------|
| `id` | UUID | Primary key |
| `invoice_id` | UUID | FK to invoices |
| `tipo_relacion` | TEXT | Relation type (01-09) |
| `related_uuid` | TEXT | UUID of related CFDI |

### invoice_folio_sequences (NEW)

| Column | Type | Purpose |
|--------|------|---------|
| `id` | UUID | Primary key |
| `organization_id` | UUID | FK to organizations |
| `serie` | TEXT | Folio series (A, B, etc.) |
| `last_number` | INTEGER | Last assigned number |
| Constraint | UNIQUE | (organization_id, serie) |

## Server Actions API

### Invoice CRUD

```typescript
// Create draft invoice
createInvoiceAction(input: CreateInvoiceInput): Promise<ActionResult<Invoice>>

// Update draft
updateInvoiceAction(invoiceId: string, input: UpdateInvoiceInput): Promise<ActionResult<Invoice>>

// Submit for stamping (PAC integration)
submitForStampingAction(invoiceId: string): Promise<ActionResult<Invoice>>

// Cancel stamped invoice
cancelInvoiceAction(invoiceId: string, reason: CancellationReason, replacementUUID?: string): Promise<ActionResult<Invoice>>

// Delete draft (soft delete)
deleteInvoiceAction(invoiceId: string): Promise<ActionResult<void>>

// Duplicate invoice
duplicateInvoiceAction(invoiceId: string): Promise<ActionResult<Invoice>>
```

### Read Operations

```typescript
// Get single invoice
getInvoiceAction(invoiceId: string, options?: { includeItems?: boolean; includeRelated?: boolean }): Promise<ActionResult<Invoice>>

// List with filters, pagination, sorting
listInvoicesAction(filters?: InvoiceFilters, pagination?: InvoicePagination, sort?: InvoiceSort): Promise<ActionResult<InvoiceListResult>>
```

### Status Updates

```typescript
// Mark as sent (email sent to customer)
markAsSentAction(invoiceId: string): Promise<ActionResult<Invoice>>

// Mark as paid
markAsPaidAction(invoiceId: string): Promise<ActionResult<Invoice>>
```

### Related CFDIs

```typescript
// Add related CFDI
addRelatedInvoiceAction(invoiceId: string, tipoRelacion: string, relatedUUID: string): Promise<ActionResult<Invoice>>

// Remove related CFDI
removeRelatedInvoiceAction(invoiceId: string, relatedUUID: string): Promise<ActionResult<Invoice>>
```

### Statistics

```typescript
// Dashboard stats
getInvoiceStatsAction(dateFrom: string, dateTo: string): Promise<ActionResult<InvoiceStats>>

// Folio preview
getNextFolioPreviewAction(serie?: string): Promise<ActionResult<string>>
```

## RBAC Integration

All actions integrate with existing RBAC system:

| Action | Permission Required |
|--------|---------------------|
| Create | `invoices:create` |
| Read | `invoices:read` |
| Update | `invoices:update` |
| Delete | `invoices:delete` |
| Stamp | `invoices:stamp` |
| Cancel | `invoices:cancel` |

## Cancellation Reasons (SAT)

| Code | Description |
|------|-------------|
| `01` | CFDI emitido con errores con relación |
| `02` | CFDI emitido con errores sin relación |
| `03` | No se llevó a cabo la operación |
| `04` | Operación nominativa relacionada en factura global |

## Running Tests

```bash
cd my-turborepo/apps/web

# Run all invoice tests
npm test lib/invoices/__tests__/ -- --run

# Run specific test file
npm test lib/invoices/__tests__/calculations.test.ts -- --run

# Watch mode
npm test lib/invoices/__tests__/ -- --watch
```

## Dependencies

### Package Dependencies

```json
{
  "decimal.js": "^10.4.3"  // Added for precise calculations
}
```

### Internal Dependencies

- `@/lib/auth` - getCurrentUser()
- `@/lib/multi-tenant/context` - getOrganizationId()
- `@/lib/rbac` - requirePermission()
- `@/lib/supabase/server` - createClient()
- `@/lib/customers/service` - getCustomer()
- `@/lib/organizations/service` - getOrganization()

## Implementation Steps Completed

| Step | Component | Description |
|------|-----------|-------------|
| 1 | Migration | ALTER tables, create new tables, RLS, folio function |
| 2 | Types | Enums, interfaces, constants |
| 3 | Calculations | decimal.js integration, tax calculations |
| 4 | Validation | Zod schemas, CFDI validators |
| 5 | Workflow | Status state machine with guards |
| 6 | Repository | Data access layer |
| 7 | Service | Business logic orchestration |
| 8 | Actions | Server actions with auth/RBAC |

## Next Steps (Downstream Components)

1. **Component 13 - Products/Services**: Product catalog for invoice items
2. **Component 14 - PAC Integration**: CFDI stamping with certified providers
3. **Component 15 - XML Generation**: CFDI 4.0 XML structure
4. **Component 16 - PDF Generation**: Invoice PDF rendering
5. **Component 17 - Email Service**: Invoice delivery
6. **Component 18 - Invoice UI**: React components for invoice management
7. **Component 24 - Reports**: Invoice reporting and analytics

## Validation Rules Summary

### Customer Validation
- RFC format valid (12-13 characters)
- Tax regime valid for customer type
- CFDI use valid for customer type
- Postal code present

### Payment Terms
- PUE requires payment_form
- PPD payment_form should be "99" (Por definir)

### Currency
- MXN: exchange_rate must be 1 or undefined
- Foreign: exchange_rate must be > 0

### Stamping
- Status must be DRAFT
- At least one item required
- All amounts must be valid
- Issue date within 72 hours
- Customer data complete
- Organization data complete

## Test Coverage

- **Migration**: SQL structure, RLS policies, folio function
- **Types**: All enums, type guards, constant arrays
- **Calculations**: Line items, totals, rounding, CFDI formatting
- **Validation**: All Zod schemas, validators, edge cases
- **Workflow**: All transitions, guards, error cases
- **Repository**: CRUD operations, soft delete, filters
- **Service**: Business logic, warnings, context injection
- **Actions**: Auth, permissions, error handling
