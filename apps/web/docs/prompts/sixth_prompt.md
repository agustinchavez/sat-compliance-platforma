Fantastic progress! We've completed the entire foundation layer (Components 1-5) and the system is rock solid.

## ✅ WHAT'S ALREADY BUILT (correct anything if it's wrong)

### Component 1: User Authentication ✓

- ✅ Supabase Auth with email verification
- ✅ Password reset and session management
- ✅ Protected routes and middleware

### Component 2: RBAC System ✓

- ✅ 4 role levels with hierarchical permissions
- ✅ Redis-cached permission checks (3-5ms)
- ✅ Resource and action-based permissions
- ✅ Middleware: `requirePermission()`, `requireRole()`

### Component 3: Multi-Tenant Context Manager ✓

- ✅ Automatic organization scoping with RLS
- ✅ `getScopedClient()` for auto-filtered queries
- ✅ Cross-tenant isolation and protection
- ✅ Redis-cached organization data (1-2ms)

### Component 4: Organization Service ✓

- ✅ Complete organization profile management
- ✅ CFDI certificate upload and encryption
- ✅ PAC provider configuration
- ✅ Organization settings management

### Component 5: Team Management Service ✓

- ✅ **Multi-organization support** (users in multiple orgs)
- ✅ Invitation system with secure tokens
- ✅ Role management and ownership transfer
- ✅ Activity logging and email notifications
- ✅ **Fixed critical data loss bug**

### Current Database Structure (correct this if wrong please)

```sql
-- organizations table (already exists)
CREATE TABLE organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  rfc VARCHAR(13) UNIQUE NOT NULL,
  legal_name VARCHAR(255) NOT NULL,
  tax_regime VARCHAR(10) NOT NULL,
  -- ... other fields
);

-- organization_members (new multi-org support)
CREATE TABLE organization_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  organization_id UUID REFERENCES organizations(id),
  role VARCHAR(50) NOT NULL,
  -- ... other fields
);

-- Need to create customers table
CREATE TABLE customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),

  -- Basic Information
  rfc VARCHAR(13) UNIQUE NOT NULL,
  legal_name VARCHAR(255) NOT NULL,
  business_name VARCHAR(255),  -- Commercial name (optional)
  email VARCHAR(255),
  phone VARCHAR(20),

  -- Fiscal Information (SAT Requirements)
  tax_regime VARCHAR(10) NOT NULL,  -- 601, 603, 606, 612, 621, 622, 623, 624, 625, 626
  cfdi_use VARCHAR(10) DEFAULT 'G03',  -- D01, G01, G02, G03, I01, etc.

  -- Address (Mexican format)
  address JSONB,  -- {street, exterior_number, interior_number, colony, city, state, postal_code}

  -- Metadata
  notes TEXT,
  tags TEXT[],
  is_active BOOLEAN DEFAULT true,

  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  deleted_at TIMESTAMP,

  -- Constraints
  CONSTRAINT unique_customer_rfc UNIQUE (organization_id, rfc) WHERE deleted_at IS NULL
);

-- Indexes
CREATE INDEX idx_customers_org ON customers(organization_id);
CREATE INDEX idx_customers_rfc ON customers(rfc) WHERE deleted_at IS NULL;
CREATE INDEX idx_customers_search ON customers USING gin(to_tsvector('spanish', legal_name || ' ' || COALESCE(business_name, '')));
CREATE INDEX idx_customers_active ON customers(is_active) WHERE deleted_at IS NULL;
```

### Tech Stack (correct this if wrong please)

- **Frontend:** Next.js 14, TypeScript, Tailwind CSS
- **Backend:** Next.js Server Actions, PostgreSQL (Supabase)
- **Validation:** Zod schemas
- **Search:** PostgreSQL full-text search (GIN index)
- **File Structure:** `apps/web/lib/` and `apps/web/app/`

### Mexican Tax Context (Important!) (have we done this?)

**RFC (Registro Federal de Contribuyentes)**

- Mexico's tax ID system
- Format:
  - Legal entities: 3 letters + 6 digits (YYMMDD) + 3 alphanumeric (12 chars) - Example: `ABC120101ABC`
  - Individuals: 4 letters + 6 digits (YYMMDD) + 3 alphanumeric (13 chars) - Example: `ABCD120101ABC`
- Must be unique per organization
- Required for all CFDI invoices

**Tax Regime (Régimen Fiscal)**

- Determines tax obligations
- Common values:
  - `601` - General Law for Legal Entities
  - `603` - Individuals with Business and Professional Activities
  - `605` - Personal Income (Salaries)
  - `606` - Income from Leasing
  - `612` - Individuals with Business Activities (Simplified)
  - `626` - Simplified Trust Regime (RESICO)

**CFDI Use (Uso de CFDI)**

- Specifies invoice purpose for customer's tax deduction
- Common values:
  - `G01` - Acquisition of goods
  - `G02` - Returns, discounts, or bonuses
  - `G03` - General expenses
  - `D01` - Honorarios médicos y dentales
  - `I01` - Construcciones
  - `P01` - Por definir (temporary, must be replaced)

---

## 📋 CURRENT TASK: Component 6 - Customer Service

We need to build a comprehensive customer management system that:

1. Manages customer data (receptores) for CFDI invoicing
2. Validates RFC format and checks SAT catalogs
3. Handles Mexican address formats
4. Supports advanced search and filtering
5. Tracks customer invoicing history
6. Manages customer lifecycle (active/inactive, soft delete)

### **Component 6: Customer Service**

**Purpose:** Manage customer (receptor) information required for generating SAT-compliant CFDI invoices.

**Key Requirements:**

1. **Customer CRUD Operations**

   - Create customers with RFC validation
   - Update customer information
   - Get customer details
   - List customers with pagination
   - Soft delete customers
   - Reactivate deleted customers

2. **RFC Validation**

   - Validate RFC format (legal entity vs individual)
   - Check RFC uniqueness within organization
   - Format RFC properly (uppercase, no spaces)
   - Validate checksum (optional)

3. **SAT Catalog Integration**

   - Validate tax regime against SAT catalog
   - Validate CFDI use code against SAT catalog
   - Check CFDI use compatibility with tax regime
   - Provide dropdown options for forms

4. **Address Management**

   - Mexican address format (street, colony, postal code, state)
   - Validate postal code (5 digits)
   - Validate state codes (2-letter: CDMX, JAL, etc.)
   - Support full address or minimal address

5. **Search and Filtering**

   - Full-text search (legal name, business name, RFC)
   - Filter by tax regime, CFDI use, status
   - Filter by tags
   - Sort by name, RFC, created date
   - Pagination support

6. **Customer Relationships**

   - Track invoices per customer
   - Get customer statistics (total invoiced, pending payments)
   - Flag customers with overdue invoices
   - Customer lifetime value

7. **Data Import/Export**
   - Import customers from CSV
   - Export customers to CSV
   - Bulk operations (activate, deactivate, tag)

**Expected Functionality:**

```typescript
// 1. Create customer
const customer = await createCustomer({
  rfc: "ABC120101ABC",
  legal_name: "ACME Corporation S.A. de C.V.",
  business_name: "ACME Corp",
  email: "facturacion@acme.com",
  phone: "+52 55 1234 5678",
  tax_regime: "601",
  cfdi_use: "G03",
  address: {
    street: "Avenida Reforma",
    exterior_number: "123",
    interior_number: "Piso 5",
    colony: "Juárez",
    city: "Ciudad de México",
    state: "CDMX",
    postal_code: "06600",
    country: "México",
  },
});

// 2. Get customer with invoices
const customer = await getCustomer(customerId, {
  includeInvoices: true,
  includeStats: true,
});
// → Returns customer + invoice list + stats (total, pending, overdue)

// 3. Search customers
const results = await searchCustomers("ACME", {
  taxRegime: "601",
  isActive: true,
  limit: 20,
  offset: 0,
});

// 4. List customers with filters
const customers = await listCustomers({
  filters: {
    tax_regime: "601",
    cfdi_use: "G03",
    is_active: true,
    tags: ["VIP", "Monthly"],
  },
  pagination: { page: 1, limit: 50 },
  sort: { field: "legal_name", order: "asc" },
});

// 5. Update customer
await updateCustomer(customerId, {
  email: "new-email@acme.com",
  cfdi_use: "G01",
  tags: ["VIP", "Priority"],
});

// 6. Soft delete customer
await deleteCustomer(customerId);
// → Sets deleted_at, prevents new invoices

// 7. Get customer statistics
const stats = await getCustomerStats(customerId);
// → { totalInvoiced: 500000, pendingAmount: 50000, overdueCount: 2 }

// 8. Validate RFC before saving
const validation = await validateRFC("ABC120101ABC");
// → { valid: true, type: 'legal_entity', formatted: 'ABC120101ABC' }

// 9. Check RFC uniqueness
const exists = await customerExistsByRFC(orgId, "ABC120101ABC");
// → true/false

// 10. Bulk tag customers
await bulkTagCustomers([id1, id2, id3], ["Important", "Q4"]);
```

**File Structure to Create:**

```
apps/web/lib/customers/
├── service.ts                    # Main customer service
│   ├── createCustomer(data)
│   ├── updateCustomer(id, data)
│   ├── getCustomer(id, options)
│   ├── deleteCustomer(id)
│   ├── restoreCustomer(id)
│   ├── listCustomers(filters, pagination, sort)
│   ├── searchCustomers(query, options)
│   ├── getCustomerStats(id)
│   ├── getCustomerInvoices(id, filters)
│   ├── bulkUpdateCustomers(ids, updates)
│   └── customerExistsByRFC(orgId, rfc)
│
├── validation.ts                 # RFC and SAT validation
│   ├── validateRFC(rfc)
│   ├── formatRFC(rfc)
│   ├── getRFCType(rfc)
│   ├── validateTaxRegime(regime)
│   ├── validateCFDIUse(use)
│   ├── isCFDIUseValidForRegime(use, regime)
│   ├── validateAddress(address)
│   ├── validatePostalCode(code)
│   ├── validateStateCode(state)
│   ├── validateEmail(email)
│   ├── validatePhone(phone)
│   └── validateCustomerData(data)
│
├── sat-catalogs.ts               # SAT catalog helpers
│   ├── getTaxRegimes()           # Get all tax regimes
│   ├── getTaxRegimeInfo(code)    # Get regime details
│   ├── getCFDIUses()             # Get all CFDI uses
│   ├── getCFDIUseInfo(code)      # Get use details
│   ├── getCFDIUsesForRegime(regime)  # Filter uses by regime
│   ├── getStateCodes()           # Get Mexican states
│   └── isValidPostalCode(code, state)  # Validate postal code for state
│
├── repository.ts                 # Database operations
│   ├── findById(id)
│   ├── findByRFC(orgId, rfc)
│   ├── findByOrganization(orgId, options)
│   ├── create(customer)
│   ├── update(id, data)
│   ├── softDelete(id)
│   ├── restore(id)
│   ├── search(orgId, query, options)
│   ├── count(orgId, filters)
│   └── bulkUpdate(ids, updates)
│
├── import-export.ts              # CSV import/export
│   ├── exportCustomersToCSV(customers)
│   ├── importCustomersFromCSV(file, orgId)
│   ├── validateCSVHeaders(headers)
│   ├── parseCSVRow(row)
│   └── generateImportReport(results)
│
├── types.ts                      # TypeScript types
│   ├── Customer interface
│   ├── CustomerAddress interface
│   ├── CustomerFilters interface
│   ├── CustomerStats interface
│   ├── RFCValidation interface
│   ├── TaxRegime interface
│   ├── CFDIUse interface
│   ├── CustomerSearchOptions interface
│   └── CustomerImportResult interface
│
├── utils.ts                      # Helper utilities
│   ├── formatCustomerName(customer)
│   ├── formatAddress(address)
│   ├── getCustomerDisplayName(customer)
│   ├── sortCustomers(customers, sortBy)
│   ├── filterCustomers(customers, filters)
│   └── generateCustomerExportFilename()
│
└── index.ts                      # Main exports
    └── Export all public functions
```

**Customer Data Model:**

```typescript
interface Customer {
  id: string;
  organization_id: string;

  // Basic Information
  rfc: string; // RFC (unique within org)
  legal_name: string; // Razón social
  business_name?: string; // Nombre comercial (optional)
  email?: string;
  phone?: string;

  // Fiscal Information
  tax_regime: string; // Régimen fiscal (SAT code)
  cfdi_use: string; // Uso de CFDI (SAT code)

  // Address
  address?: CustomerAddress;

  // Metadata
  notes?: string;
  tags: string[];
  is_active: boolean;

  // Timestamps
  created_at: Date;
  updated_at: Date;
  deleted_at?: Date;

  // Computed (not in DB)
  invoices?: Invoice[]; // If includeInvoices option
  stats?: CustomerStats; // If includeStats option
}

interface CustomerAddress {
  street: string; // Calle
  exterior_number: string; // Número exterior
  interior_number?: string; // Número interior (optional)
  colony: string; // Colonia
  locality?: string; // Localidad (optional)
  municipality?: string; // Municipio (optional)
  city: string; // Ciudad
  state: string; // Estado (2-letter code)
  postal_code: string; // Código postal (5 digits)
  country: string; // País (default: "México")
}

interface CustomerStats {
  total_invoices: number;
  total_invoiced: number; // Sum of all invoices
  pending_amount: number; // Unpaid invoices
  overdue_amount: number; // Past due invoices
  overdue_count: number;
  last_invoice_date?: Date;
  average_invoice_amount: number;
}

interface CustomerFilters {
  tax_regime?: string;
  cfdi_use?: string;
  is_active?: boolean;
  tags?: string[];
  search?: string; // Search in RFC, legal_name, business_name
  created_after?: Date;
  created_before?: Date;
}

interface RFCValidation {
  valid: boolean;
  type?: "legal_entity" | "individual"; // Based on length
  formatted?: string; // Uppercase, no spaces
  error?: string; // Error message if invalid
}
```

**RFC Validation Rules:**

```typescript
// Legal Entity (Persona Moral): 12 characters
// Format: 3 letters + 6 digits (YYMMDD) + 3 alphanumeric
// Example: ABC120101ABC
const RFC_LEGAL_ENTITY = /^[A-ZÑ&]{3}\d{6}[A-Z0-9]{3}$/;

// Individual (Persona Física): 13 characters
// Format: 4 letters + 6 digits (YYMMDD) + 3 alphanumeric
// Example: ABCD120101ABC
const RFC_INDIVIDUAL = /^[A-ZÑ&]{4}\d{6}[A-Z0-9]{3}$/;

// Forbidden words in RFC (cannot start with these)
const FORBIDDEN_WORDS = [
  "BUEI",
  "BUEY",
  "CACA",
  "CACO",
  "CAGA",
  "CAGO",
  "CAKA",
  "CAKO",
  "COGE",
  "COGI",
  "COJA",
  "COJE",
  "COJI",
  "COJO",
  "COLA",
  "CULO",
  "FALO",
  "FETO",
  "GETA",
  "GUEI",
  "GUEY",
  "JETA",
  "JOTO",
  "KACA",
  "KACO",
  "KAGA",
  "KAGO",
  "KAKA",
  "KAKO",
  "KOGE",
  "KOGI",
  "KOJA",
  "KOJE",
  "KOJI",
  "KOJO",
  "KOLA",
  "KULO",
  "LILO",
  "LOCA",
  "LOCO",
  "LOKA",
  "LOKO",
  "MAME",
  "MAMO",
  "MEAR",
  "MEAS",
  "MEON",
  "MIAR",
  "MION",
  "MOCO",
  "MOKO",
  "MULA",
  "MULO",
  "NACA",
  "NACO",
  "PEDA",
  "PEDO",
  "PENE",
  "PIPI",
  "PITO",
  "POPO",
  "PUTA",
  "PUTO",
  "QULO",
  "RATA",
  "ROBA",
  "ROBE",
  "ROBO",
  "RUIN",
  "SENO",
  "TETA",
  "VACA",
  "VAGA",
  "VAGO",
  "VAKA",
  "VUEI",
  "VUEY",
  "WUEI",
  "WUEY",
];

// Generic RFC (for foreign customers without RFC)
const GENERIC_RFC = "XAXX010101000"; // Used for extranjeros
const GENERIC_NATIONAL_RFC = "XEXX010101000"; // Used for públicos en general
```

**SAT Tax Regimes (Common):**

```typescript
const TAX_REGIMES = {
  "601": "General Law for Legal Entities",
  "603": "Individuals with Business and Professional Activities",
  "605": "Salaries and in General for Personal Income",
  "606": "Income from Leasing",
  "607": "Regime of Decentralized Organizations",
  "608": "Fees Regime",
  "610": "Interests Income Regime",
  "611": "Dividends Income Regime",
  "612": "Individuals with Business Activities and Professional Services",
  "614": "Income from Alienation of Goods",
  "615": "Income from Acquisition of Goods",
  "616": "Without Tax Obligations",
  "620": "Decentralized Organizations that Allocate Surplus",
  "621": "Incorporation Fiscal Regime",
  "622": "Agricultural, Livestock, Forestry and Fishing Activities",
  "623": "Optional for Group of Companies",
  "624": "Cooperatives of Production",
  "625":
    "Regime of Activities of Agricultural, Livestock, Forestry and Fishing",
  "626": "Simplified Trust Regime (RESICO)",
};

// CFDI Use Codes
const CFDI_USES = {
  G01: "Acquisition of goods",
  G02: "Returns, discounts or bonuses",
  G03: "General expenses",
  I01: "Constructions",
  I02: "Office furniture and equipment for investments",
  I03: "Transportation equipment",
  I04: "Computer equipment and accessories",
  I05: "Dies, dies, molds, matrices and tooling",
  I06: "Telephone communications",
  I07: "Satellite communications",
  I08: "Other machinery and equipment",
  D01: "Medical, dental and hospital expenses",
  D02: "Medical expenses for disabilities and disabilities",
  D03: "Funeral expenses",
  D04: "Donations",
  D05: "Real interest actually paid for mortgage loans",
  D06: "Voluntary contributions to SAR",
  D07: "Medical insurance premiums",
  D08: "Mandatory school transportation expenses",
  D09: "Deposits in savings accounts",
  D10: "Payments for educational services (tuition)",
  P01: "To be defined (temporary)",
};
```

**Search Implementation:**

```typescript
// PostgreSQL Full-Text Search
// Using GIN index for performance

async function searchCustomers(
  orgId: string,
  query: string,
  options: CustomerSearchOptions = {}
) {
  const supabase = await getScopedClient();

  // Create search vector
  const searchQuery = query.trim().toLowerCase();

  let queryBuilder = supabase
    .from("customers")
    .select("*", { count: "exact" })
    .textSearch("legal_name || business_name", searchQuery, {
      type: "websearch",
      config: "spanish",
    });

  // Apply filters
  if (options.taxRegime) {
    queryBuilder = queryBuilder.eq("tax_regime", options.taxRegime);
  }

  if (options.isActive !== undefined) {
    queryBuilder = queryBuilder.eq("is_active", options.isActive);
  }

  // Pagination
  const limit = options.limit || 50;
  const offset = options.offset || 0;
  queryBuilder = queryBuilder.range(offset, offset + limit - 1);

  // Sorting
  const sortField = options.sortBy || "legal_name";
  const sortOrder = options.sortOrder || "asc";
  queryBuilder = queryBuilder.order(sortField, {
    ascending: sortOrder === "asc",
  });

  const { data, count, error } = await queryBuilder;

  if (error) throw new Error(`Search failed: ${error.message}`);

  return {
    customers: data,
    total: count,
    page: Math.floor(offset / limit) + 1,
    pages: Math.ceil((count || 0) / limit),
  };
}
```

**Integration with Existing Systems:**

```typescript
// Multi-Tenant Integration
// =======================
// All customer queries automatically scoped to organization
import { requireOrganization, getScopedClient } from "@/lib/multi-tenant";

async function listCustomers(filters: CustomerFilters) {
  const orgId = await requireOrganization();
  const supabase = await getScopedClient();

  // RLS automatically filters by organization_id
  const { data } = await supabase
    .from("customers")
    .select("*")
    .order("legal_name");

  return data;
}

// RBAC Integration
// ===============
// Protect customer operations with permissions
import { requirePermission } from "@/lib/rbac";

export async function createCustomerAction(data: CustomerData) {
  "use server";

  // Require permission
  await requirePermission("customer", "create");

  // Create customer
  const customer = await createCustomer(data);
  return customer;
}

// Organization Service Integration
// ================================
// Validate customer RFC against organization RFC
async function validateCustomerRFC(customerRFC: string, orgId: string) {
  const org = await getOrganization(orgId);

  // Customer RFC cannot be same as organization RFC
  if (customerRFC === org.rfc) {
    throw new ValidationError(
      "Customer RFC cannot be the same as organization RFC"
    );
  }

  return true;
}
```

**Environment Variables:**

```env
# No new environment variables needed
# Uses existing Supabase and Redis connections
```

**Migration Requirements:**

```sql
-- Create customers table
CREATE TABLE customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- Basic Information
  rfc VARCHAR(13) NOT NULL,
  legal_name VARCHAR(255) NOT NULL,
  business_name VARCHAR(255),
  email VARCHAR(255),
  phone VARCHAR(20),

  -- Fiscal Information
  tax_regime VARCHAR(10) NOT NULL,
  cfdi_use VARCHAR(10) DEFAULT 'G03',

  -- Address
  address JSONB,

  -- Metadata
  notes TEXT,
  tags TEXT[] DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,

  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  deleted_at TIMESTAMP,

  -- Constraints
  CONSTRAINT unique_customer_rfc UNIQUE (organization_id, rfc) WHERE deleted_at IS NULL,
  CONSTRAINT check_rfc_length CHECK (char_length(rfc) BETWEEN 12 AND 13),
  CONSTRAINT check_postal_code CHECK (
    address IS NULL OR
    (address->>'postal_code')::text ~ '^\d{5}$'
  )
);

-- Indexes
CREATE INDEX idx_customers_org ON customers(organization_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_customers_rfc ON customers(rfc) WHERE deleted_at IS NULL;
CREATE INDEX idx_customers_active ON customers(is_active, organization_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_customers_regime ON customers(tax_regime) WHERE deleted_at IS NULL;
CREATE INDEX idx_customers_tags ON customers USING gin(tags);
CREATE INDEX idx_customers_created ON customers(created_at DESC);

-- Full-text search index
CREATE INDEX idx_customers_search ON customers
  USING gin(to_tsvector('spanish', legal_name || ' ' || COALESCE(business_name, '') || ' ' || rfc));

-- Enable RLS
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view org customers"
  ON customers FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = (SELECT id FROM users WHERE auth_id = auth.uid())
      AND deleted_at IS NULL
    )
  );

CREATE POLICY "Users can manage org customers"
  ON customers FOR ALL
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = (SELECT id FROM users WHERE auth_id = auth.uid())
      AND deleted_at IS NULL
    )
  );
```

---

## 🎯 WHAT I NEED FROM YOU

Before we start implementation, please help me plan:

1. **SAT Catalog Storage:**

   - Should I hardcode tax regimes and CFDI uses in code?
   - Or store them in database tables?
   - My thinking: Code constants for now (they rarely change), database if we need i18n

2. **RFC Validation Level:**

   - Validate format only (regex)?
   - Or validate checksum too (more complex)?
   - Or validate against SAT API (requires SAT credentials)?

3. **Address Validation:**

   - Validate state codes against known list?
   - Validate postal code format (5 digits)?
   - Or validate postal code against state (more complex)?

4. **Search Performance:**

   - PostgreSQL full-text search (as proposed)?
   - Or add Elasticsearch for better search?
   - Expected customer count: 100-10,000 per organization

5. **Customer Uniqueness:**

   - RFC unique per organization (as proposed)?
   - Or allow duplicate RFCs in different orgs?
   - Note: Same RFC could be customer for multiple accounting firms

6. **Customer Import:**

   - Build CSV import now?
   - Or defer to later?
   - Important for onboarding from other systems

7. **Implementation Order:**
   - My proposal:
     1. Types and validation (types.ts, validation.ts)
     2. SAT catalog constants (sat-catalogs.ts)
     3. Database migration
     4. Repository (repository.ts)
     5. Core service (service.ts)
     6. Search and filtering
     7. Import/export (import-export.ts)
     8. Server actions and UI
     9. Testing
   - Does this make sense?

**UX Questions:**

1. Should we auto-suggest tax regime based on RFC type?
2. Auto-suggest CFDI use based on customer's tax regime?
3. Show warning if customer has overdue invoices?
4. Allow bulk operations (tag, activate, deactivate)?

Please review this plan and:

- ✅ Decide on SAT catalog storage (code vs database)
- ✅ Choose RFC validation level (format vs checksum vs SAT API)
- ✅ Confirm address validation approach
- ✅ Validate search strategy (PostgreSQL vs Elasticsearch)
- ✅ Confirm RFC uniqueness scope
- ✅ Decide on CSV import priority (now vs later)
- ✅ Review implementation order

Once we align on the approach, I'll start implementing step by step!
