Outstanding progress! We've completed 7 core components including the complex SAT SOAP integration. Now let's build the Product/Service catalog.

## ✅ WHAT'S ALREADY BUILT

### Components 1-7 Complete ✓

- ✅ Authentication, RBAC, Multi-Tenant, Organizations, Team, Customers
- ✅ SAT Integration Service with CFDI download and parsing
- ✅ RFC validation with SAT integration
- ✅ CFDI reconciliation engine

### Relevant Context for This Component

**Customer Service (Component 6):**

```typescript
// Customers have tax regime and CFDI use
interface Customer {
  rfc: string;
  tax_regime: string; // '601', '626', etc.
  cfdi_use: string; // 'G01', 'G03', etc.
}
```

**SAT Catalogs (Already Built):**

```typescript
// From lib/customers/sat-catalogs.ts
- getTaxRegimes() - 26 tax regimes
- getCFDIUses() - 27 CFDI use codes
- getMexicanStates() - 32 states

// STILL NEED for products:
- SAT Product/Service codes (c_ClaveProdServ) - 55,000+ codes
- SAT Units of measure (c_ClaveUnidad) - 2,800+ units
```

**SAT CFDI Concepto Structure:**

```xml
<!-- How products appear in CFDI invoices -->
<cfdi:Concepto
  ClaveProdServ="01010101"     <!-- SAT product code (required) -->
  Cantidad="1"                 <!-- Quantity -->
  ClaveUnidad="H87"            <!-- SAT unit code (required) -->
  Unidad="Pieza"               <!-- Unit description -->
  Descripcion="Servicio de consultoría"  <!-- Description -->
  ValorUnitario="10000.00"     <!-- Unit price -->
  Importe="10000.00"           <!-- Subtotal -->
  Descuento="0.00"             <!-- Discount (optional) -->
  ObjetoImp="02">              <!-- Tax object: 01=No, 02=Yes, 03=Partially -->

  <cfdi:Impuestos>
    <cfdi:Traslados>
      <cfdi:Traslado
        Base="10000.00"
        Impuesto="002"          <!-- IVA -->
        TipoFactor="Tasa"
        TasaOCuota="0.160000"   <!-- 16% -->
        Importe="1600.00"/>
    </cfdi:Traslados>
  </cfdi:Impuestos>
</cfdi:Concepto>
```

### Tech Stack

- **Backend:** Next.js Server Actions, PostgreSQL (Supabase)
- **Search:** PostgreSQL full-text search (GIN index)
- **AI:** For SAT code suggestions (future: embedding-based search)
- **Cache:** Redis for catalog caching
- **File Structure:** `apps/web/lib/`

---

## 📋 CURRENT TASK: Component 8 - Product/Service Management

Build a comprehensive product/service catalog that:

1. Manages products and services with SAT-compliant data
2. Assigns and validates SAT product codes (ClaveProdServ)
3. Handles units of measure (ClaveUnidad)
4. Configures pricing and tax settings
5. Provides optional inventory tracking
6. Suggests SAT codes based on descriptions (AI-ready)

### **Component 8: Product/Service Management Service**

**Purpose:** Manage the organization's product and service catalog with SAT-compliant codes for CFDI invoice generation.

**Key Requirements:**

1. **Product/Service CRUD**

   - Create products with SAT code validation
   - Update product information and pricing
   - Soft delete with restore capability
   - SKU generation and management
   - Support for both products and services

2. **SAT Code Management**

   - Assign ClaveProdServ (55,000+ SAT product codes)
   - Assign ClaveUnidad (2,800+ SAT units)
   - Validate codes against SAT catalog
   - Search and browse SAT codes
   - Suggest codes based on product description

3. **Pricing Configuration**

   - Base price (before tax)
   - Tax configuration (IVA: 0%, 8%, 16%)
   - Tax retention (ISR, IVA retention)
   - Discounts (fixed or percentage)
   - Multiple price lists (optional)
   - Currency support (MXN primary)

4. **Tax Configuration**

   - IVA trasladado (16%, 8%, 0%, exempt)
   - IVA retenido (10.67% for services)
   - ISR retenido (10%, 1.25% for services)
   - Tax object type (01, 02, 03)
   - Automatic tax calculation

5. **Inventory Tracking (Optional)**

   - Current stock level
   - Minimum stock alerts
   - Stock adjustments with history
   - Track inventory per location (future)
   - Auto-decrement on invoice (future)

6. **Search and Filtering**

   - Full-text search (name, description, SKU)
   - Filter by type (product/service)
   - Filter by category, status, price range
   - SAT code search
   - Pagination and sorting

7. **SAT Code Suggestion (AI-Ready)**
   - Suggest codes based on product name/description
   - Use SAT catalog text search
   - Prepare for embedding-based search (future)
   - Allow manual override

**Expected Functionality:**

```typescript
// 1. Create product with SAT codes
const product = await createProduct({
  name: "Servicio de Consultoría IT",
  description: "Consultoría especializada en sistemas de información",
  type: "service",
  sku: "SRV-CONSULT-001", // Optional, auto-generated if empty

  // SAT Codes
  sat_product_code: "81112100", // ClaveProdServ
  sat_unit_code: "E48", // ClaveUnidad (Unidad de Servicio)
  unit_name: "Hora", // Human-readable unit

  // Pricing
  price: 1500.0, // Base price (MXN)
  currency: "MXN",

  // Taxes
  tax_config: {
    iva_rate: 0.16, // 16% IVA
    iva_exempt: false,
    iva_retention: false,
    isr_retention: false,
    tax_object: "02", // Subject to tax
  },

  // Inventory (optional)
  track_inventory: false,

  // Metadata
  category: "Servicios Profesionales",
  is_active: true,
});

// 2. Get product with full details
const product = await getProduct(productId, {
  includeInventory: true,
  includeHistory: true,
});

// 3. Search products
const results = await searchProducts("consultoría", {
  type: "service",
  is_active: true,
  price_min: 500,
  price_max: 5000,
});

// 4. List products with filters
const products = await listProducts({
  filters: {
    type: "product",
    category: "Electrónica",
    has_inventory: true,
    low_stock: true,
  },
  pagination: { page: 1, limit: 50 },
  sort: { field: "name", order: "asc" },
});

// 5. Update product pricing
await updateProduct(productId, {
  price: 1800.0,
  tax_config: {
    iva_rate: 0.16,
    iva_retention: true, // Add IVA retention
    iva_retention_rate: 0.1067, // 10.67%
  },
});

// 6. Adjust inventory
await adjustInventory(productId, {
  quantity: -5,
  reason: "sale",
  reference: "INV-2024-001",
  notes: "Sold to customer",
});

// 7. Check stock before invoice
const stockCheck = await checkStock(productId, 10);
// → { available: true, current: 50, requested: 10, remaining: 40 }

// 8. Get low stock products
const lowStock = await getLowStockProducts();
// → [{ id, name, current_stock: 5, min_stock: 10, ... }]

// 9. Suggest SAT code based on description
const suggestions = await suggestSATCode("laptop computadora portátil");
// → [
//     { code: '43211503', name: 'Computadoras portátiles', score: 0.95 },
//     { code: '43211507', name: 'Notebook computers', score: 0.85 }
//   ]

// 10. Search SAT product codes
const satCodes = await searchSATProductCodes("consultoría");
// → [{ code: '81112100', name: 'Servicios de consultoría de negocios...', ... }]

// 11. Calculate price with taxes
const calculation = await calculateProductPrice(productId, {
  quantity: 5,
  discount_percent: 10,
});
// → {
//     subtotal: 7500.00,
//     discount: 750.00,
//     iva: 1080.00,
//     iva_retention: 0,
//     isr_retention: 0,
//     total: 7830.00
//   }

// 12. Get product for invoice
const invoiceItem = await getProductForInvoice(productId, quantity);
// → Ready-to-use object for CFDI generation
```

**File Structure to Create:**

```
apps/web/lib/products/
├── service.ts                    # Main product service
│   ├── createProduct(data)
│   ├── updateProduct(id, data)
│   ├── getProduct(id, options)
│   ├── deleteProduct(id)
│   ├── restoreProduct(id)
│   ├── listProducts(filters, pagination, sort)
│   ├── searchProducts(query, options)
│   ├── getProductBySKU(orgId, sku)
│   ├── duplicateProduct(id, newSKU)
│   ├── bulkUpdateProducts(ids, updates)
│   ├── getProductForInvoice(id, quantity)
│   └── calculateProductPrice(id, options)
│
├── sat-codes.ts                  # SAT product/unit code management
│   ├── searchSATProductCodes(query, limit)
│   ├── getSATProductCode(code)
│   ├── validateSATProductCode(code)
│   ├── searchSATUnitCodes(query, limit)
│   ├── getSATUnitCode(code)
│   ├── validateSATUnitCode(code)
│   ├── suggestSATCode(description)
│   ├── getPopularSATCodes(type)
│   └── cacheSATCodes()           # Preload to Redis
│
├── inventory.ts                  # Inventory management
│   ├── adjustInventory(productId, adjustment)
│   ├── getStockLevel(productId)
│   ├── checkStock(productId, quantity)
│   ├── getLowStockProducts(orgId)
│   ├── getInventoryHistory(productId, filters)
│   ├── bulkAdjustInventory(adjustments)
│   ├── transferStock(fromProduct, toProduct, qty)
│   └── getInventoryReport(orgId, options)
│
├── pricing.ts                    # Pricing calculations
│   ├── calculatePrice(product, quantity, discount)
│   ├── calculateTaxes(price, taxConfig)
│   ├── applyDiscount(price, discount)
│   ├── convertCurrency(price, from, to)
│   ├── formatPrice(amount, currency)
│   └── validatePriceRange(price)
│
├── validation.ts                 # Validation utilities
│   ├── validateProduct(data)
│   ├── validateSKU(sku, orgId)
│   ├── validatePrice(price)
│   ├── validateTaxConfig(config)
│   ├── validateSATProductCode(code)
│   ├── validateSATUnitCode(code)
│   ├── validateInventoryAdjustment(adj)
│   └── validateProductForInvoice(product)
│
├── repository.ts                 # Database operations
│   ├── findById(id)
│   ├── findBySKU(orgId, sku)
│   ├── findByOrganization(orgId, options)
│   ├── findBySATCode(orgId, satCode)
│   ├── create(product)
│   ├── update(id, data)
│   ├── softDelete(id)
│   ├── restore(id)
│   ├── search(orgId, query, options)
│   ├── count(orgId, filters)
│   └── bulkUpdate(ids, updates)
│
├── import-export.ts              # CSV import/export
│   ├── exportProductsToCSV(products)
│   ├── importProductsFromCSV(file, orgId)
│   ├── validateCSVHeaders(headers)
│   ├── generateImportReport(results)
│   └── exportProductsToJSON(products)
│
├── types.ts                      # TypeScript types
│   ├── Product interface
│   ├── ProductType ('product' | 'service')
│   ├── TaxConfig interface
│   ├── InventoryAdjustment interface
│   ├── SATProductCode interface
│   ├── SATUnitCode interface
│   ├── ProductFilters interface
│   ├── PriceCalculation interface
│   └── ProductForInvoice interface
│
├── utils.ts                      # Helper utilities
│   ├── generateSKU(name, type)
│   ├── formatProductName(name)
│   ├── getProductDisplayName(product)
│   ├── sortProducts(products, sortBy)
│   ├── filterProducts(products, filters)
│   └── getProductStatusDisplay(product)
│
└── index.ts                      # Main exports
    └── Export all public functions
```

**Product Data Model:**

```typescript
interface Product {
  id: string;
  organization_id: string;

  // Basic Information
  name: string;
  description?: string;
  type: ProductType; // 'product' or 'service'
  sku: string; // Unique per organization
  barcode?: string; // Optional barcode/UPC

  // SAT Codes (Required for CFDI)
  sat_product_code: string; // ClaveProdServ (e.g., '81112100')
  sat_product_name?: string; // Cached name from SAT catalog
  sat_unit_code: string; // ClaveUnidad (e.g., 'H87', 'E48')
  sat_unit_name?: string; // Cached unit name
  unit_name: string; // Display unit (e.g., 'Hora', 'Pieza')

  // Pricing
  price: number; // Base price before tax
  currency: string; // 'MXN' (default), 'USD', etc.

  // Tax Configuration
  tax_object: TaxObject; // '01'=No tax, '02'=Yes, '03'=Partial
  iva_rate: number; // 0, 0.08, 0.16
  iva_exempt: boolean; // Exempt from IVA
  iva_retention: boolean; // Apply IVA retention
  iva_retention_rate?: number; // 0.1067 (10.67%)
  isr_retention: boolean; // Apply ISR retention
  isr_retention_rate?: number; // 0.10 or 0.0125

  // Inventory (optional)
  track_inventory: boolean;
  current_stock?: number;
  min_stock?: number; // Low stock alert threshold
  max_stock?: number; // Optional max stock

  // Categorization
  category?: string;
  tags: string[];

  // Status
  is_active: boolean;

  // Timestamps
  created_at: Date;
  updated_at: Date;
  deleted_at?: Date;
}

type ProductType = "product" | "service";
type TaxObject = "01" | "02" | "03"; // NoObject, SíObjeto, SíObjetoParcial

interface TaxConfig {
  tax_object: TaxObject;
  iva_rate: number; // 0, 0.08, 0.16
  iva_exempt: boolean;
  iva_retention: boolean;
  iva_retention_rate?: number;
  isr_retention: boolean;
  isr_retention_rate?: number;
}

interface InventoryAdjustment {
  product_id: string;
  quantity: number; // Positive = add, Negative = remove
  reason: InventoryReason;
  reference?: string; // Invoice ID, PO number, etc.
  notes?: string;
  cost_per_unit?: number; // For COGS tracking
}

type InventoryReason =
  | "purchase" // Stock received
  | "sale" // Sold (via invoice)
  | "return" // Customer return
  | "adjustment" // Manual adjustment
  | "damaged" // Damaged goods
  | "expired" // Expired products
  | "transfer" // Transfer between locations
  | "initial"; // Initial stock

interface ProductForInvoice {
  // For CFDI Concepto
  clave_prod_serv: string;
  clave_unidad: string;
  unidad: string;
  descripcion: string;
  valor_unitario: number;
  cantidad: number;
  importe: number;
  descuento?: number;
  objeto_imp: TaxObject;

  // Tax breakdown
  impuestos: {
    traslados: Array<{
      base: number;
      impuesto: string; // '002' = IVA
      tipo_factor: string; // 'Tasa', 'Cuota', 'Exento'
      tasa_o_cuota: number;
      importe: number;
    }>;
    retenciones?: Array<{
      base: number;
      impuesto: string; // '001' = ISR, '002' = IVA
      tipo_factor: string;
      tasa_o_cuota: number;
      importe: number;
    }>;
  };
}
```

**SAT Catalog Data:**

```typescript
// SAT Product Codes (c_ClaveProdServ)
// 55,000+ codes, hierarchical structure
interface SATProductCode {
  code: string; // e.g., '81112100'
  name: string; // e.g., 'Servicios de consultoría de negocios...'
  description?: string;
  includes_iva?: boolean; // Some codes include IVA info
  // Hierarchy: Division > Group > Class > Product
  division?: string; // First 2 digits
  group?: string; // First 4 digits
  class?: string; // First 6 digits
}

// SAT Unit Codes (c_ClaveUnidad)
// ~2,800 units
interface SATUnitCode {
  code: string; // e.g., 'H87', 'E48', 'KGM'
  name: string; // e.g., 'Pieza', 'Unidad de servicio', 'Kilogramo'
  description?: string;
  symbol?: string; // e.g., 'pza', 'srv', 'kg'
}

// Common SAT Unit Codes for quick access
const COMMON_UNIT_CODES = {
  H87: "Pieza",
  E48: "Unidad de servicio",
  ACT: "Actividad",
  KGM: "Kilogramo",
  LTR: "Litro",
  MTR: "Metro",
  XBX: "Caja",
  XPK: "Paquete",
};

// Common SAT Product Codes for quick access
const COMMON_PRODUCT_CODES = {
  "01010101": "No existe en el catálogo", // Generic fallback
  "81112100": "Servicios de consultoría de negocios",
  "80101500": "Servicios de consultoría en gestión",
  "43211503": "Computadoras portátiles",
  "44121600": "Suministros de oficina",
};
```

**SAT Catalog Storage Strategy:**

```typescript
// SAT catalogs are LARGE:
// - c_ClaveProdServ: 55,000+ codes
// - c_ClaveUnidad: 2,800+ codes

// Storage Options:
// 1. Database table (recommended for search)
// 2. Static JSON file (simple, but large)
// 3. Redis cache (for hot data)
// 4. Hybrid: DB + Redis cache for popular codes

// Recommended: Database with full-text search
CREATE TABLE sat_product_codes (
  code VARCHAR(8) PRIMARY KEY,
  name VARCHAR(500) NOT NULL,
  description TEXT,
  division VARCHAR(2),
  search_vector tsvector GENERATED ALWAYS AS (
    to_tsvector('spanish', name || ' ' || COALESCE(description, ''))
  ) STORED
);

CREATE INDEX idx_sat_product_codes_search
  ON sat_product_codes USING gin(search_vector);

CREATE TABLE sat_unit_codes (
  code VARCHAR(10) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  symbol VARCHAR(20)
);
```

**Tax Calculation Examples:**

```typescript
// Example 1: Standard product with 16% IVA
// Base price: $1,000
// IVA (16%): $160
// Total: $1,160

// Example 2: Service with IVA and retentions (typical for professionals)
// Base price: $10,000
// IVA trasladado (16%): $1,600
// IVA retenido (10.67%): -$1,067
// ISR retenido (10%): -$1,000
// Total to receive: $9,533

// Example 3: Product exempt from IVA
// Base price: $500
// IVA: $0 (exempt)
// Total: $500

// Tax calculation logic
function calculateTaxes(base: number, config: TaxConfig): TaxCalculation {
  let iva_trasladado = 0;
  let iva_retenido = 0;
  let isr_retenido = 0;

  // IVA trasladado
  if (!config.iva_exempt && config.tax_object === "02") {
    iva_trasladado = base * config.iva_rate;
  }

  // IVA retenido (usually for services B2B)
  if (config.iva_retention && config.iva_retention_rate) {
    iva_retenido = base * config.iva_retention_rate;
  }

  // ISR retenido (usually for professional services)
  if (config.isr_retention && config.isr_retention_rate) {
    isr_retenido = base * config.isr_retention_rate;
  }

  const total = base + iva_trasladado - iva_retenido - isr_retenido;

  return {
    base,
    iva_trasladado,
    iva_retenido,
    isr_retenido,
    total,
  };
}
```

**Migration Requirements:**

```sql
-- Create products table
CREATE TABLE products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- Basic Information
  name VARCHAR(255) NOT NULL,
  description TEXT,
  type VARCHAR(20) NOT NULL DEFAULT 'product',
  sku VARCHAR(100) NOT NULL,
  barcode VARCHAR(50),

  -- SAT Codes
  sat_product_code VARCHAR(8) NOT NULL,
  sat_product_name VARCHAR(500),
  sat_unit_code VARCHAR(10) NOT NULL,
  sat_unit_name VARCHAR(255),
  unit_name VARCHAR(50) NOT NULL,

  -- Pricing
  price DECIMAL(15, 4) NOT NULL,
  currency VARCHAR(3) DEFAULT 'MXN',

  -- Tax Configuration
  tax_object VARCHAR(2) DEFAULT '02',
  iva_rate DECIMAL(6, 4) DEFAULT 0.16,
  iva_exempt BOOLEAN DEFAULT false,
  iva_retention BOOLEAN DEFAULT false,
  iva_retention_rate DECIMAL(6, 4),
  isr_retention BOOLEAN DEFAULT false,
  isr_retention_rate DECIMAL(6, 4),

  -- Inventory
  track_inventory BOOLEAN DEFAULT false,
  current_stock DECIMAL(15, 4) DEFAULT 0,
  min_stock DECIMAL(15, 4),
  max_stock DECIMAL(15, 4),

  -- Categorization
  category VARCHAR(100),
  tags TEXT[] DEFAULT '{}',

  -- Status
  is_active BOOLEAN DEFAULT true,

  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  deleted_at TIMESTAMP,

  -- Constraints
  CONSTRAINT unique_product_sku UNIQUE (organization_id, sku) WHERE deleted_at IS NULL,
  CONSTRAINT check_product_type CHECK (type IN ('product', 'service')),
  CONSTRAINT check_tax_object CHECK (tax_object IN ('01', '02', '03')),
  CONSTRAINT check_price_positive CHECK (price >= 0),
  CONSTRAINT check_iva_rate CHECK (iva_rate IN (0, 0.08, 0.16))
);

-- Indexes
CREATE INDEX idx_products_org ON products(organization_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_products_sku ON products(sku) WHERE deleted_at IS NULL;
CREATE INDEX idx_products_type ON products(type) WHERE deleted_at IS NULL;
CREATE INDEX idx_products_sat_code ON products(sat_product_code);
CREATE INDEX idx_products_category ON products(category) WHERE deleted_at IS NULL;
CREATE INDEX idx_products_active ON products(is_active) WHERE deleted_at IS NULL;
CREATE INDEX idx_products_tags ON products USING gin(tags);
CREATE INDEX idx_products_low_stock ON products(current_stock, min_stock)
  WHERE track_inventory = true AND deleted_at IS NULL;

-- Full-text search
CREATE INDEX idx_products_search ON products
  USING gin(to_tsvector('spanish', name || ' ' || COALESCE(description, '') || ' ' || sku));

-- Inventory history table
CREATE TABLE inventory_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id),
  quantity DECIMAL(15, 4) NOT NULL,
  previous_stock DECIMAL(15, 4) NOT NULL,
  new_stock DECIMAL(15, 4) NOT NULL,
  reason VARCHAR(50) NOT NULL,
  reference VARCHAR(255),
  notes TEXT,
  cost_per_unit DECIMAL(15, 4),
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_inventory_history_product ON inventory_history(product_id);
CREATE INDEX idx_inventory_history_date ON inventory_history(created_at);

-- SAT Product Codes (need to populate with SAT data)
CREATE TABLE sat_product_codes (
  code VARCHAR(8) PRIMARY KEY,
  name VARCHAR(500) NOT NULL,
  description TEXT,
  division VARCHAR(2),
  search_vector tsvector GENERATED ALWAYS AS (
    to_tsvector('spanish', name || ' ' || COALESCE(description, ''))
  ) STORED
);

CREATE INDEX idx_sat_product_codes_search
  ON sat_product_codes USING gin(search_vector);
CREATE INDEX idx_sat_product_codes_division
  ON sat_product_codes(division);

-- SAT Unit Codes (need to populate with SAT data)
CREATE TABLE sat_unit_codes (
  code VARCHAR(10) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  symbol VARCHAR(20)
);

-- RLS Policies for products
ALTER TABLE products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "products_select" ON products FOR SELECT
  USING (organization_id IN (
    SELECT organization_id FROM organization_members
    WHERE user_id = (SELECT id FROM users WHERE auth_id = auth.uid())
    AND deleted_at IS NULL
  ));

CREATE POLICY "products_insert" ON products FOR INSERT
  WITH CHECK (organization_id IN (
    SELECT organization_id FROM organization_members
    WHERE user_id = (SELECT id FROM users WHERE auth_id = auth.uid())
    AND role IN ('owner', 'admin', 'accountant')
    AND deleted_at IS NULL
  ));

-- Similar policies for UPDATE and DELETE...
```

---

## 🎯 WHAT I NEED FROM YOU

Before we start implementation, help me plan:

1. **SAT Catalog Storage:**

   - Store 55K product codes in database (as proposed)?
   - Download from SAT or use static file?
   - How to populate initially?
   - Cache popular codes in Redis?

2. **SAT Code Suggestion:**

   - Simple text search for now?
   - Or implement embedding-based search (pgvector)?
   - Defer AI suggestion to later?
   - Use SAT's hierarchical structure for browsing?

3. **Inventory Tracking:**

   - Build full inventory now?
   - Or just basic stock tracking (add/remove)?
   - Defer location-based inventory?
   - Link to invoices for auto-decrement?

4. **Price Lists:**

   - Support multiple price lists now?
   - Or single price per product for now?
   - Currency conversion?

5. **Tax Configuration:**

   - Store at product level (as proposed)?
   - Or allow invoice-level override?
   - Default tax config from organization settings?

6. **SKU Generation:**

   - Auto-generate if empty?
   - Format: `{TYPE}-{CATEGORY}-{NUMBER}`?
   - Allow manual entry?

7. **Implementation Order:**
   - My proposal:
     1. Types and interfaces (types.ts)
     2. SAT catalog tables and data (migration + sat-codes.ts)
     3. Validation (validation.ts)
     4. Repository (repository.ts)
     5. Pricing calculations (pricing.ts)
     6. Core service (service.ts)
     7. Inventory tracking (inventory.ts)
     8. Import/export (import-export.ts)
     9. Testing
   - Does this make sense?

**Integration Questions:**

1. How should products link to invoices (via invoice_items)?
2. Should we validate SAT codes on every save?
3. Cache product lookups in Redis?
4. Prepare for bundled products (kits)?

Please review this plan and:

- ✅ Decide on SAT catalog storage strategy
- ✅ Choose SAT code suggestion approach
- ✅ Confirm inventory scope (basic vs full)
- ✅ Validate tax configuration approach
- ✅ Review implementation order
- ✅ Answer integration questions

Once we align on the approach, let's start implementing step by step!
