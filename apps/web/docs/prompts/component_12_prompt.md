# Component 12: Invoice Service (Core)

## ✅ WHAT'S ALREADY BUILT

### Components 1-11 Complete ✓

- ✅ Authentication (Component 01) — Supabase auth, JWT sessions
- ✅ Role-Based Access Control (Component 02) — Redis-cached RBAC, sub-5ms permission checks
- ✅ Multi-Tenant Context Manager (Component 03) — org isolation, Row-Level Security
- ✅ Organization Service (Component 04) — encrypted CSD/e.firma certificate storage (AES-256, Cloudflare R2)
- ✅ Team Management Service (Component 05) — multi-org membership (users belong to 50-100+ orgs)
- ✅ Customer Service (Component 06) — RFC validation, 26 tax regimes, 27 CFDI use codes
- ✅ RFC Validation Service (Component 07) — SAT SOAP web service integration
- ✅ Product/Service Management (Component 08) — 55,000+ SAT codes, 2,800+ unit codes, tax config per product
- ✅ SAT Code Search AI Service (Component 09) — semantic embeddings, pgvector
- ✅ Receipt OCR Service (Component 10) — Tesseract OCR, CFDI XML parsing
- ✅ Tax Assistant Chatbot (Component 11) — Llama 3.1/GPT-4o-mini, RAG, conversation history

### This Component Is the Critical Path

Component 12 is the most critical component in the entire platform. Every downstream component depends on it:

```
Component 12 (Invoice Core)
    ├── Component 13 — CFDI XML Generator       (needs invoice data structure)
    ├── Component 14 — Digital Signature Service (needs invoice + XML)
    ├── Component 15 — PAC Integration          (needs signed XML)
    ├── Component 16 — PDF Generator            (needs invoice data)
    ├── Component 17 — Invoice Workflow Engine  (needs status machine)
    ├── Component 18 — Payment Service          (needs invoice IDs)
    └── Component 24 — Tax Calculation Engine   (needs invoice amounts)
```

**Get the data model right.** The TypeScript interfaces and database schema defined in this component will be used by all 7+ downstream components. Take extra care with the invoice and invoice_items table design, especially around CFDI-specific fields.

### Relevant Existing Services to Integrate With

**Customer Service (Component 06):**
```typescript
// app/web/lib/customers/service.ts — already exists
interface Customer {
  id: string;
  organization_id: string;
  rfc: string;
  business_name: string;
  tax_regime: string;        // e.g., "601", "626"
  cfdi_use: string;          // e.g., "G01", "G03"
  email?: string;
  address?: {
    street: string;
    city: string;
    state: string;
    zip_code: string;        // Código postal — required for CFDI 4.0
    country: string;
  };
}
```

**Product Service (Component 08):**
```typescript
// app/web/lib/products/service.ts — already exists
interface Product {
  id: string;
  organization_id: string;
  name: string;
  sat_product_code: string;   // ClaveProdServ — required for CFDI
  sat_unit_code: string;      // ClaveUnidad — required for CFDI
  unit_name: string;
  price: number;
  currency: string;
  tax_object: string;         // "01" | "02" | "03"
  iva_rate: number;           // 0 | 0.08 | 0.16
  iva_exempt: boolean;
  iva_retention: boolean;
  iva_retention_rate?: number;
  isr_retention: boolean;
  isr_retention_rate?: number;
}

// Also available:
getProductForInvoice(productId, quantity) // → ready-to-use invoice item
```

**Organization Service (Component 04):**
```typescript
// Organizations have CSD certificates needed for stamping
interface Organization {
  id: string;
  rfc: string;
  business_name: string;
  tax_regime: string;
  address: { zip_code: string; ... };
  csd_certificate?: { ... };   // Required before submitting for stamping
}
```

### File Location

This component lives in the **Next.js app**, not the Python AI service. File structure:

```
apps/web/lib/invoices/           ← All files go here
```

This follows the exact same pattern as:
- `apps/web/lib/customers/` — Component 06
- `apps/web/lib/products/` — Component 08

---

## 🇲🇽 CFDI 4.0 REQUIREMENTS THAT SHAPE THE DATA MODEL

CFDI 4.0 (mandatory since January 2022) has strict requirements that must be reflected in the invoice data model from day one. Do not design a generic invoice model and try to map to CFDI later — design for CFDI first.

### Required CFDI Fields

```xml
<cfdi:Comprobante
  Version="4.0"
  Serie="A"                           <!-- Optional series prefix -->
  Folio="00001"                       <!-- Sequential invoice number -->
  Fecha="2024-03-01T10:00:00"         <!-- Issue datetime (ISO) -->
  Sello=""                            <!-- Digital signature (Component 14) -->
  FormaPago="01"                      <!-- Payment method code -->
  NoCertificado=""                    <!-- CSD certificate number -->
  Certificado=""                      <!-- CSD certificate (base64) -->
  SubTotal="10000.00"
  Descuento="0.00"                    <!-- Discount if any -->
  Moneda="MXN"                        <!-- Currency -->
  TipoCambio="1"                      <!-- Exchange rate (if foreign currency) -->
  Total="11600.00"
  TipoDeComprobante="I"               <!-- I=Ingreso E=Egreso T=Traslado -->
  Exportacion="01"                    <!-- 01=No exportación (required in 4.0) -->
  MetodoPago="PUE"                    <!-- PUE=single payment PPD=deferred -->
  LugarExpedicion="06600"             <!-- Zip code of issuing org -->
  Confirmacion="">                    <!-- SAT confirmation code (if needed) -->

  <cfdi:InformacionGlobal .../>       <!-- For global CFDI (public invoices) -->

  <cfdi:CfdiRelacionados TipoRelacion="01">  <!-- Related CFDIs -->
    <cfdi:CfdiRelacionado UUID="..."/>
  </cfdi:CfdiRelacionados>

  <cfdi:Emisor
    Rfc="ECS200101ABC"
    Nombre="EMPRESA CONSULTORA S.A. DE C.V."
    RegimenFiscal="601"/>

  <cfdi:Receptor
    Rfc="GOMJ850101AB2"
    Nombre="JUAN GOMEZ"
    DomicilioFiscalReceptor="06600"   <!-- Customer zip code — required in 4.0 -->
    RegimenFiscalReceptor="626"       <!-- Customer tax regime — required in 4.0 -->
    UsoCFDI="G03"/>

  <cfdi:Conceptos>
    <cfdi:Concepto
      ClaveProdServ="81112100"
      NoIdentificacion="SRV-001"      <!-- SKU (optional) -->
      Cantidad="1"
      ClaveUnidad="E48"
      Unidad="Hora"
      Descripcion="Servicio de consultoría"
      ValorUnitario="10000.00"
      Importe="10000.00"
      Descuento="0.00"
      ObjetoImp="02">                 <!-- 01=No tax, 02=Yes, 03=Partial -->
      <cfdi:Impuestos>
        <cfdi:Traslados>
          <cfdi:Traslado
            Base="10000.00"
            Impuesto="002"            <!-- 001=ISR 002=IVA 003=IEPS -->
            TipoFactor="Tasa"
            TasaOCuota="0.160000"
            Importe="1600.00"/>
        </cfdi:Traslados>
      </cfdi:Impuestos>
    </cfdi:Concepto>
  </cfdi:Conceptos>

  <cfdi:Impuestos TotalImpuestosTrasladados="1600.00">
    <cfdi:Traslados>
      <cfdi:Traslado
        Base="10000.00" Impuesto="002"
        TipoFactor="Tasa" TasaOCuota="0.160000" Importe="1600.00"/>
    </cfdi:Traslados>
  </cfdi:Impuestos>
</cfdi:Comprobante>
```

### Payment Method Codes (FormaPago)

```
01 — Efectivo (cash)
02 — Cheque nominativo
03 — Transferencia electrónica
04 — Tarjeta de crédito
28 — Tarjeta de débito
99 — Por definir (when MetodoPago=PPD)
```

### Payment Policy Codes (MetodoPago)

```
PUE — Pago en una sola exhibición (paid in full, same day as invoice)
PPD — Pago en parcialidades o diferido (payment plan or deferred)
      → Requires Complemento de Pago when payment received (Component 18)
```

### CFDI Type Codes (TipoDeComprobante)

```
I — Ingreso (income — standard sales invoice)
E — Egreso (expense — credit note, refund)
T — Traslado (transfer — goods movement without sale)
N — Nómina (payroll — Component out of scope)
P — Pago (payment complement — Component 18)
```

### Related CFDI Types (TipoRelacion)

```
01 — Nota de crédito sobre documentos relacionados
02 — Nota de débito sobre documentos relacionados
03 — Devolución de mercancía sobre facturas o traslados previos
04 — Sustitución de los CFDI previos
07 — CFDI por aplicación de anticipos
```

---

## 📋 CURRENT TASK: Component 12 — Invoice Service (Core)

Build the core invoice service in the Next.js app (`apps/web/lib/invoices/`). This component handles the full invoice lifecycle: creation as a draft, validation, submission for CFDI stamping, and cancellation. It does **not** generate CFDI XML (Component 13), apply digital signatures (Component 14), or submit to PAC (Component 15) — but it must prepare all the data those components need.

---

## 🏗️ IMPLEMENTATION ORDER

Follow this exact order. **Write unit tests for each step before moving to the next.**

---

### Step 1: Database Migration

Create `supabase/migrations/20250101000012_create_invoices.sql`.

```sql
-- ============================================================
-- INVOICES TABLE
-- ============================================================
CREATE TABLE invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- CFDI Identification
  uuid VARCHAR(36) UNIQUE,              -- SAT UUID assigned after stamping (Timbre)
  serie VARCHAR(25),                    -- Series prefix e.g., "A", "FAC"
  folio VARCHAR(40),                    -- Sequential number e.g., "00001"
  folio_number INTEGER,                 -- Numeric folio for auto-increment

  -- Status & Workflow
  status VARCHAR(30) NOT NULL DEFAULT 'draft',
  -- draft | pending_stamp | stamped | sent | paid | cancelled | void

  -- CFDI Type
  tipo_comprobante VARCHAR(1) NOT NULL DEFAULT 'I',
  -- I=Ingreso, E=Egreso, T=Traslado (P=Pago handled by Component 18)

  -- Dates
  issue_date TIMESTAMP NOT NULL DEFAULT NOW(),  -- Fecha on CFDI
  due_date DATE,                                -- Payment due date
  stamped_at TIMESTAMP,                         -- When PAC returned UUID
  sent_at TIMESTAMP,
  paid_at TIMESTAMP,
  cancelled_at TIMESTAMP,

  -- Issuer (from organization at time of creation — denormalized for audit)
  issuer_rfc VARCHAR(13) NOT NULL,
  issuer_name VARCHAR(254) NOT NULL,
  issuer_tax_regime VARCHAR(3) NOT NULL,
  issuer_zip_code VARCHAR(5) NOT NULL,

  -- Receiver (from customer at time of creation — denormalized for audit)
  customer_id UUID NOT NULL REFERENCES customers(id),
  receiver_rfc VARCHAR(13) NOT NULL,
  receiver_name VARCHAR(254) NOT NULL,
  receiver_tax_regime VARCHAR(3) NOT NULL,
  receiver_zip_code VARCHAR(5) NOT NULL,
  receiver_cfdi_use VARCHAR(3) NOT NULL,

  -- Payment Terms
  payment_method VARCHAR(2) NOT NULL DEFAULT 'PUE',  -- PUE | PPD
  payment_form VARCHAR(2) NOT NULL DEFAULT '01',     -- FormaPago code
  currency VARCHAR(3) NOT NULL DEFAULT 'MXN',
  exchange_rate DECIMAL(18, 6) DEFAULT 1.000000,

  -- Exportation (required CFDI 4.0 field)
  exportacion VARCHAR(2) NOT NULL DEFAULT '01',      -- 01=No exportación

  -- Amounts (all stored in invoice currency)
  subtotal DECIMAL(18, 6) NOT NULL DEFAULT 0,
  discount DECIMAL(18, 6) NOT NULL DEFAULT 0,
  total_iva_trasladado DECIMAL(18, 6) NOT NULL DEFAULT 0,
  total_iva_retenido DECIMAL(18, 6) NOT NULL DEFAULT 0,
  total_isr_retenido DECIMAL(18, 6) NOT NULL DEFAULT 0,
  total DECIMAL(18, 6) NOT NULL DEFAULT 0,

  -- Global Invoice fields (for public invoices without customer RFC)
  is_global BOOLEAN DEFAULT false,
  global_periodicity VARCHAR(2),        -- '01'=daily, '02'=weekly, '04'=monthly
  global_months VARCHAR(2),             -- Month number '01'-'12'
  global_year VARCHAR(4),

  -- Cancellation
  cancellation_reason VARCHAR(2),       -- SAT cancellation reason codes
  cancellation_uuid VARCHAR(36),        -- UUID of replacement invoice (if reason=04)
  cancellation_response_code VARCHAR(5),

  -- Notes & Internal
  notes TEXT,                           -- Internal notes (not in CFDI)
  conditions VARCHAR(1000),             -- CondicionesDePago (optional CFDI field)

  -- XML Storage (set after stamping)
  cfdi_xml TEXT,                        -- Full stamped CFDI XML
  pdf_url TEXT,                         -- URL to generated PDF (Cloudflare R2)

  -- Audit
  created_by UUID REFERENCES users(id),
  updated_by UUID REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  deleted_at TIMESTAMP,                 -- Soft delete

  -- Constraints
  CONSTRAINT check_status CHECK (status IN (
    'draft', 'pending_stamp', 'stamped', 'sent', 'paid', 'cancelled', 'void'
  )),
  CONSTRAINT check_tipo CHECK (tipo_comprobante IN ('I', 'E', 'T')),
  CONSTRAINT check_payment_method CHECK (payment_method IN ('PUE', 'PPD')),
  CONSTRAINT check_exchange_rate CHECK (exchange_rate > 0),
  CONSTRAINT check_subtotal CHECK (subtotal >= 0),
  CONSTRAINT check_total CHECK (total >= 0)
);

-- Indexes
CREATE INDEX idx_invoices_org ON invoices(organization_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_invoices_status ON invoices(status) WHERE deleted_at IS NULL;
CREATE INDEX idx_invoices_customer ON invoices(customer_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_invoices_uuid ON invoices(uuid) WHERE uuid IS NOT NULL;
CREATE INDEX idx_invoices_issue_date ON invoices(issue_date) WHERE deleted_at IS NULL;
CREATE INDEX idx_invoices_folio ON invoices(organization_id, serie, folio_number)
  WHERE deleted_at IS NULL;
CREATE INDEX idx_invoices_tipo ON invoices(tipo_comprobante) WHERE deleted_at IS NULL;

-- Full-text search on receiver name and folio
CREATE INDEX idx_invoices_search ON invoices
  USING gin(to_tsvector('spanish',
    COALESCE(receiver_name, '') || ' ' ||
    COALESCE(folio, '') || ' ' ||
    COALESCE(serie, '')
  )) WHERE deleted_at IS NULL;

-- ============================================================
-- INVOICE ITEMS TABLE
-- ============================================================
CREATE TABLE invoice_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL DEFAULT 0,

  -- Product reference (optional — items can be entered manually)
  product_id UUID REFERENCES products(id),

  -- CFDI Concepto fields (all required for CFDI generation)
  sat_product_code VARCHAR(8) NOT NULL,   -- ClaveProdServ
  sat_unit_code VARCHAR(10) NOT NULL,     -- ClaveUnidad
  unit_name VARCHAR(50) NOT NULL,         -- Unidad (human-readable)
  sku VARCHAR(100),                       -- NoIdentificacion (optional)
  description VARCHAR(1000) NOT NULL,     -- Descripcion

  -- Quantities and amounts
  quantity DECIMAL(18, 6) NOT NULL,
  unit_price DECIMAL(18, 6) NOT NULL,     -- ValorUnitario (before discount)
  discount_amount DECIMAL(18, 6) NOT NULL DEFAULT 0,  -- Descuento
  subtotal DECIMAL(18, 6) NOT NULL,       -- Importe = quantity * unit_price - discount

  -- Tax object
  tax_object VARCHAR(2) NOT NULL DEFAULT '02',  -- ObjetoImp: 01|02|03

  -- Tax configuration (from product at time of invoice creation)
  iva_rate DECIMAL(6, 4) NOT NULL DEFAULT 0.16,
  iva_exempt BOOLEAN NOT NULL DEFAULT false,
  iva_trasladado DECIMAL(18, 6) NOT NULL DEFAULT 0,
  iva_retention_rate DECIMAL(6, 4),
  iva_retenido DECIMAL(18, 6) NOT NULL DEFAULT 0,
  isr_retention_rate DECIMAL(6, 4),
  isr_retenido DECIMAL(18, 6) NOT NULL DEFAULT 0,

  -- Line total
  total DECIMAL(18, 6) NOT NULL,

  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_invoice_items_invoice ON invoice_items(invoice_id);
CREATE INDEX idx_invoice_items_product ON invoice_items(product_id)
  WHERE product_id IS NOT NULL;

-- ============================================================
-- RELATED CFDI TABLE
-- ============================================================
CREATE TABLE invoice_related_cfdi (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  tipo_relacion VARCHAR(2) NOT NULL,     -- SAT relationship type code
  related_uuid VARCHAR(36) NOT NULL,     -- UUID of the related CFDI
  related_invoice_id UUID REFERENCES invoices(id),  -- If related invoice is in our system
  created_at TIMESTAMP DEFAULT NOW(),
  CONSTRAINT check_tipo_relacion CHECK (
    tipo_relacion IN ('01','02','03','04','05','06','07','08','09')
  )
);

CREATE INDEX idx_related_cfdi_invoice ON invoice_related_cfdi(invoice_id);
CREATE UNIQUE INDEX idx_related_cfdi_unique
  ON invoice_related_cfdi(invoice_id, related_uuid);

-- ============================================================
-- FOLIO SEQUENCES TABLE
-- ============================================================
-- Each org+serie combination has its own auto-incrementing folio
CREATE TABLE invoice_folio_sequences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  serie VARCHAR(25) NOT NULL DEFAULT '',
  next_folio INTEGER NOT NULL DEFAULT 1,
  updated_at TIMESTAMP DEFAULT NOW(),
  CONSTRAINT unique_org_serie UNIQUE (organization_id, serie)
);

-- Function to atomically get-and-increment folio
CREATE OR REPLACE FUNCTION get_next_folio(p_org_id UUID, p_serie VARCHAR)
RETURNS INTEGER AS $$
DECLARE
  v_folio INTEGER;
BEGIN
  INSERT INTO invoice_folio_sequences (organization_id, serie, next_folio)
  VALUES (p_org_id, COALESCE(p_serie, ''), 2)
  ON CONFLICT (organization_id, serie)
  DO UPDATE SET
    next_folio = invoice_folio_sequences.next_folio + 1,
    updated_at = NOW()
  RETURNING next_folio - 1 INTO v_folio;
  RETURN v_folio;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- RLS POLICIES
-- ============================================================
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_related_cfdi ENABLE ROW LEVEL SECURITY;

-- Invoices: members of the organization can read
CREATE POLICY "invoices_select" ON invoices FOR SELECT
  USING (organization_id IN (
    SELECT organization_id FROM organization_members
    WHERE user_id = (SELECT id FROM users WHERE auth_id = auth.uid())
    AND deleted_at IS NULL
  ));

-- Invoices: only owners, admins, accountants can create/modify
CREATE POLICY "invoices_insert" ON invoices FOR INSERT
  WITH CHECK (organization_id IN (
    SELECT organization_id FROM organization_members
    WHERE user_id = (SELECT id FROM users WHERE auth_id = auth.uid())
    AND role IN ('owner', 'admin', 'accountant')
    AND deleted_at IS NULL
  ));

CREATE POLICY "invoices_update" ON invoices FOR UPDATE
  USING (organization_id IN (
    SELECT organization_id FROM organization_members
    WHERE user_id = (SELECT id FROM users WHERE auth_id = auth.uid())
    AND role IN ('owner', 'admin', 'accountant')
    AND deleted_at IS NULL
  ));

-- invoice_items inherits access through invoices
CREATE POLICY "invoice_items_select" ON invoice_items FOR SELECT
  USING (invoice_id IN (
    SELECT id FROM invoices WHERE organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = (SELECT id FROM users WHERE auth_id = auth.uid())
      AND deleted_at IS NULL
    )
  ));

CREATE POLICY "invoice_items_modify" ON invoice_items
  FOR ALL
  USING (invoice_id IN (
    SELECT id FROM invoices WHERE organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = (SELECT id FROM users WHERE auth_id = auth.uid())
      AND role IN ('owner', 'admin', 'accountant')
      AND deleted_at IS NULL
    )
  ));

-- Same pattern for invoice_related_cfdi
CREATE POLICY "related_cfdi_select" ON invoice_related_cfdi FOR SELECT
  USING (invoice_id IN (
    SELECT id FROM invoices WHERE organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = (SELECT id FROM users WHERE auth_id = auth.uid())
      AND deleted_at IS NULL
    )
  ));
```

Write unit tests confirming migration SQL is syntactically correct by parsing it (you can use a JavaScript SQL parser or simply validate the structure in your test assertions). Key assertions:
- `invoices` table has `status` column with correct CHECK constraint values
- `invoice_items` table has foreign key to `invoices`
- `invoice_folio_sequences` has unique constraint on `(organization_id, serie)`
- `get_next_folio` function is defined

---

### Step 2: Types

**File: `apps/web/lib/invoices/types.ts`**

```typescript
import { Decimal } from 'decimal.js';

// ============================================================
// ENUMS
// ============================================================

export enum InvoiceStatus {
  DRAFT = 'draft',
  PENDING_STAMP = 'pending_stamp',
  STAMPED = 'stamped',
  SENT = 'sent',
  PAID = 'paid',
  CANCELLED = 'cancelled',
  VOID = 'void',
}

export enum TipoComprobante {
  INGRESO = 'I',
  EGRESO = 'E',
  TRASLADO = 'T',
}

export enum MetodoPago {
  PUE = 'PUE',   // Single payment
  PPD = 'PPD',   // Deferred/partial payments
}

export enum TipoRelacion {
  NOTA_CREDITO = '01',
  NOTA_DEBITO = '02',
  DEVOLUCION = '03',
  SUSTITUCION = '04',
  TRASLADO_MERCANCIA = '05',
  FACTURA_TRASLADO = '06',
  APLICACION_ANTICIPO = '07',
  NOTA_CARGO = '08',
  FACTURA_ANTICIPO = '09',
}

export enum CancellationReason {
  VOUCHER_ERROR = '01',           // Errors in the voucher
  OPERATION_NEVER_COMPLETED = '02', // Operation never completed
  OPERATION_NOMINALLY_COMPLETED = '03', // Operation nominally completed
  SUBSTITUTION = '04',            // Substituted by another CFDI
}

export enum PaymentStatus {
  UNPAID = 'unpaid',
  PARTIAL = 'partial',
  PAID = 'paid',
  OVERDUE = 'overdue',
}

// ============================================================
// CORE INTERFACES
// ============================================================

export interface InvoiceItem {
  id: string;
  invoice_id: string;
  sort_order: number;
  product_id?: string;

  // CFDI Concepto fields
  sat_product_code: string;
  sat_unit_code: string;
  unit_name: string;
  sku?: string;
  description: string;

  // Quantities
  quantity: number;
  unit_price: number;
  discount_amount: number;
  subtotal: number;           // quantity * unit_price - discount_amount

  // Tax
  tax_object: '01' | '02' | '03';
  iva_rate: number;
  iva_exempt: boolean;
  iva_trasladado: number;
  iva_retention_rate?: number;
  iva_retenido: number;
  isr_retention_rate?: number;
  isr_retenido: number;

  total: number;              // subtotal + iva_trasladado - iva_retenido - isr_retenido
}

export interface RelatedCFDI {
  id: string;
  invoice_id: string;
  tipo_relacion: TipoRelacion;
  related_uuid: string;
  related_invoice_id?: string;
}

export interface Invoice {
  id: string;
  organization_id: string;

  // CFDI identification
  uuid?: string;
  serie?: string;
  folio?: string;
  folio_number?: number;

  // Status
  status: InvoiceStatus;
  tipo_comprobante: TipoComprobante;

  // Dates
  issue_date: string;          // ISO datetime
  due_date?: string;
  stamped_at?: string;
  sent_at?: string;
  paid_at?: string;
  cancelled_at?: string;

  // Issuer (snapshot)
  issuer_rfc: string;
  issuer_name: string;
  issuer_tax_regime: string;
  issuer_zip_code: string;

  // Receiver (snapshot)
  customer_id: string;
  receiver_rfc: string;
  receiver_name: string;
  receiver_tax_regime: string;
  receiver_zip_code: string;
  receiver_cfdi_use: string;

  // Payment
  payment_method: MetodoPago;
  payment_form: string;        // FormaPago code
  currency: string;
  exchange_rate: number;
  exportacion: string;

  // Amounts
  subtotal: number;
  discount: number;
  total_iva_trasladado: number;
  total_iva_retenido: number;
  total_isr_retenido: number;
  total: number;

  // Global invoice
  is_global: boolean;
  global_periodicity?: string;
  global_months?: string;
  global_year?: string;

  // Cancellation
  cancellation_reason?: string;
  cancellation_uuid?: string;

  // Content
  notes?: string;
  conditions?: string;
  cfdi_xml?: string;
  pdf_url?: string;

  // Relations (populated by joins)
  items?: InvoiceItem[];
  related_cfdi?: RelatedCFDI[];

  // Audit
  created_by?: string;
  updated_by?: string;
  created_at: string;
  updated_at: string;
  deleted_at?: string;
}

// ============================================================
// INPUT TYPES (for create/update operations)
// ============================================================

export interface InvoiceItemInput {
  product_id?: string;
  sat_product_code: string;
  sat_unit_code: string;
  unit_name: string;
  sku?: string;
  description: string;
  quantity: number;
  unit_price: number;
  discount_amount?: number;    // Default 0
  tax_object?: '01' | '02' | '03';
  // Tax config — if product_id provided, fetched from product
  // If manual entry, must provide:
  iva_rate?: number;
  iva_exempt?: boolean;
  iva_retention_rate?: number;
  isr_retention_rate?: number;
}

export interface CreateInvoiceInput {
  tipo_comprobante?: TipoComprobante;  // Default: INGRESO
  customer_id: string;
  serie?: string;
  issue_date?: string;         // Default: now
  due_date?: string;
  payment_method?: MetodoPago; // Default: PUE
  payment_form?: string;       // Default: '01' (cash), '99' if PPD
  currency?: string;           // Default: 'MXN'
  exchange_rate?: number;      // Default: 1
  exportacion?: string;        // Default: '01'
  items: InvoiceItemInput[];
  related_cfdi?: Array<{
    tipo_relacion: TipoRelacion;
    related_uuid: string;
  }>;
  notes?: string;
  conditions?: string;
  is_global?: boolean;
  global_periodicity?: string;
  global_months?: string;
  global_year?: string;
}

export interface UpdateInvoiceInput {
  customer_id?: string;
  serie?: string;
  issue_date?: string;
  due_date?: string;
  payment_method?: MetodoPago;
  payment_form?: string;
  currency?: string;
  exchange_rate?: number;
  exportacion?: string;
  items?: InvoiceItemInput[];
  related_cfdi?: Array<{
    tipo_relacion: TipoRelacion;
    related_uuid: string;
  }>;
  notes?: string;
  conditions?: string;
  is_global?: boolean;
  global_periodicity?: string;
  global_months?: string;
  global_year?: string;
}

// ============================================================
// FILTER & PAGINATION
// ============================================================

export interface InvoiceFilters {
  status?: InvoiceStatus | InvoiceStatus[];
  tipo_comprobante?: TipoComprobante;
  customer_id?: string;
  receiver_rfc?: string;
  currency?: string;
  date_from?: string;
  date_to?: string;
  due_date_from?: string;
  due_date_to?: string;
  amount_min?: number;
  amount_max?: number;
  search?: string;              // Full-text search on receiver name, folio
  has_uuid?: boolean;           // Stamped invoices only
  payment_method?: MetodoPago;
  is_overdue?: boolean;
}

export interface InvoicePagination {
  page: number;
  limit: number;
}

export interface InvoiceSort {
  field: 'issue_date' | 'due_date' | 'total' | 'receiver_name' | 'folio_number' | 'created_at';
  order: 'asc' | 'desc';
}

export interface InvoiceListResult {
  invoices: Invoice[];
  total: number;
  page: number;
  limit: number;
  total_pages: number;
}

// ============================================================
// CALCULATION TYPES
// ============================================================

export interface LineItemCalculation {
  subtotal: number;            // quantity * unit_price
  discount_amount: number;
  taxable_base: number;        // subtotal - discount_amount
  iva_trasladado: number;
  iva_retenido: number;
  isr_retenido: number;
  total: number;
}

export interface InvoiceTotals {
  subtotal: number;
  total_discount: number;
  total_iva_trasladado: number;
  total_iva_retenido: number;
  total_isr_retenido: number;
  total: number;
}

// ============================================================
// WORKFLOW TYPES
// ============================================================

export type InvoiceAction =
  | 'submit_for_stamping'
  | 'cancel'
  | 'mark_sent'
  | 'mark_paid'
  | 'void'
  | 'duplicate';

export interface StatusTransition {
  from: InvoiceStatus;
  to: InvoiceStatus;
  action: InvoiceAction;
  requiresReason?: boolean;
}

export interface AvailableActions {
  invoice_id: string;
  current_status: InvoiceStatus;
  actions: InvoiceAction[];
}
```

Write unit tests in `apps/web/lib/invoices/__tests__/types.test.ts`:
- Test all `InvoiceStatus` enum values match the database CHECK constraint values
- Test `TipoComprobante` values match CFDI spec ('I', 'E', 'T')
- Test `MetodoPago` values are 'PUE' and 'PPD' only
- Test `CancellationReason` has exactly 4 values matching SAT spec

---

### Step 3: Calculations

**File: `apps/web/lib/invoices/calculations.ts`**

All monetary calculations must use exact decimal arithmetic. Use the `decimal.js` library (add to `package.json` if not present) to avoid floating-point errors. **Never use JavaScript's native floating-point for tax calculations.**

```typescript
import Decimal from 'decimal.js';

// Configure Decimal for 6 decimal places (CFDI allows up to 6)
Decimal.set({ precision: 20, rounding: Decimal.ROUND_HALF_UP });

export function calculateLineItem(item: InvoiceItemInput): LineItemCalculation {
  /**
   * Calculate all amounts for a single invoice line item.
   *
   * Formula:
   * subtotal = quantity * unit_price
   * discount_amount = as provided (or 0)
   * taxable_base = subtotal - discount_amount
   *
   * iva_trasladado:
   *   if tax_object == '01' (no tax): 0
   *   if iva_exempt: 0
   *   else: taxable_base * iva_rate (round to 6 decimal places)
   *
   * iva_retenido:
   *   if iva_retention_rate provided: taxable_base * iva_retention_rate
   *   else: 0
   *
   * isr_retenido:
   *   if isr_retention_rate provided: taxable_base * isr_retention_rate
   *   else: 0
   *
   * total = taxable_base + iva_trasladado - iva_retenido - isr_retenido
   *
   * All amounts rounded to 6 decimal places (CFDI maximum precision).
   */
}

export function calculateSubtotal(items: InvoiceItemInput[]): number {
  /** Sum of (quantity * unit_price) for all items. */
}

export function calculateDiscount(items: InvoiceItemInput[]): number {
  /** Sum of discount_amount for all items. */
}

export function calculateTax(items: InvoiceItemInput[]): {
  total_iva_trasladado: number;
  total_iva_retenido: number;
  total_isr_retenido: number;
} {
  /**
   * Sum tax amounts across all items.
   * Group by Impuesto + TipoFactor + TasaOCuota for CFDI grouping
   * (required format for cfdi:Impuestos section).
   */
}

export function calculateTotal(
  subtotal: number,
  discount: number,
  total_iva_trasladado: number,
  total_iva_retenido: number,
  total_isr_retenido: number,
): number {
  /**
   * total = subtotal - discount + total_iva_trasladado
   *         - total_iva_retenido - total_isr_retenido
   *
   * Round to 2 decimal places for the CFDI Total field
   * (SAT requires total in 2 decimal places even though items use 6).
   */
}

export function calculateInvoiceTotals(items: InvoiceItemInput[]): InvoiceTotals {
  /**
   * Full calculation pipeline. Returns all amounts needed for invoice.
   * Calls calculateLineItem for each item, then sums.
   */
}

export function validateAmounts(invoice: Invoice): {
  valid: boolean;
  errors: string[];
} {
  /**
   * Verify stored amounts are internally consistent.
   * Recalculate from items and compare to stored totals.
   * Allow tolerance of 0.01 (1 cent) for rounding differences.
   *
   * Check:
   * - total == subtotal - discount + iva_trasladado - iva_retenido - isr_retenido
   * - Each item's total matches its own calculation
   * - subtotal matches sum of item subtotals
   */
}

export function formatForCFDI(amount: number): string {
  /**
   * Format a number to exactly 2 decimal places as a string for CFDI XML.
   * e.g., 1234.5 → "1234.50", 1234.567890 → "1234.57"
   * Use Decimal.js for rounding to avoid floating-point issues.
   */
}

export function formatRateForCFDI(rate: number): string {
  /**
   * Format a tax rate to exactly 6 decimal places for CFDI XML.
   * e.g., 0.16 → "0.160000", 0.1067 → "0.106700"
   */
}
```

Write unit tests in `apps/web/lib/invoices/__tests__/calculations.test.ts`:

```typescript
// Test exact decimal arithmetic (not floating-point approximation)
describe('calculateLineItem', () => {
  it('calculates standard 16% IVA correctly', () => {
    // quantity=1, unit_price=10000, iva_rate=0.16, no retention
    // subtotal: 10000.00, iva: 1600.00, total: 11600.00
  });

  it('calculates with discount', () => {
    // quantity=2, unit_price=1000, discount=100
    // subtotal: 2000, after discount: 1900, iva: 304, total: 2204
  });

  it('calculates IVA + ISR retention (professional services)', () => {
    // base=10000, iva_rate=0.16, iva_retention_rate=0.1067, isr_retention_rate=0.10
    // iva_trasladado: 1600, iva_retenido: 1067, isr_retenido: 1000
    // total: 10000 + 1600 - 1067 - 1000 = 9533
  });

  it('returns zero tax for exempt items (tax_object=01)', () => {});
  it('returns zero IVA for iva_exempt items', () => {});
  it('handles 8% border zone IVA', () => {});
  it('avoids floating-point errors for $333.33 * 3 = $1000.00', () => {});
});

describe('calculateTotal', () => {
  it('matches SAT formula exactly', () => {});
  it('rounds to 2 decimal places', () => {});
});

describe('formatForCFDI', () => {
  it('formats 1234.5 as "1234.50"', () => {});
  it('formats 0 as "0.00"', () => {});
});

describe('validateAmounts', () => {
  it('returns valid for correctly calculated invoice', () => {});
  it('returns error when totals do not match items', () => {});
  it('allows 1 cent tolerance for rounding', () => {});
});
```

---

### Step 4: Validation

**File: `apps/web/lib/invoices/validation.ts`**

```typescript
import { z } from 'zod';

// ============================================================
// ZOD SCHEMAS
// ============================================================

export const InvoiceItemInputSchema = z.object({
  product_id: z.string().uuid().optional(),
  sat_product_code: z.string().length(8, 'SAT product code must be 8 digits'),
  sat_unit_code: z.string().min(1).max(10),
  unit_name: z.string().min(1).max(50),
  sku: z.string().max(100).optional(),
  description: z.string().min(1, 'Description required').max(1000),
  quantity: z.number().positive('Quantity must be positive'),
  unit_price: z.number().nonnegative('Unit price cannot be negative'),
  discount_amount: z.number().nonnegative().optional().default(0),
  tax_object: z.enum(['01', '02', '03']).optional().default('02'),
  iva_rate: z.number().refine(r => [0, 0.08, 0.16].includes(r), {
    message: 'IVA rate must be 0, 0.08, or 0.16',
  }).optional(),
  iva_exempt: z.boolean().optional(),
  iva_retention_rate: z.number().optional(),
  isr_retention_rate: z.number().optional(),
});

export const CreateInvoiceSchema = z.object({
  tipo_comprobante: z.enum(['I', 'E', 'T']).optional().default('I'),
  customer_id: z.string().uuid('Invalid customer ID'),
  serie: z.string().max(25).optional(),
  issue_date: z.string().datetime().optional(),
  due_date: z.string().optional(),
  payment_method: z.enum(['PUE', 'PPD']).optional().default('PUE'),
  payment_form: z.string().length(2).optional().default('01'),
  currency: z.string().length(3).optional().default('MXN'),
  exchange_rate: z.number().positive().optional().default(1),
  exportacion: z.string().length(2).optional().default('01'),
  items: z.array(InvoiceItemInputSchema).min(1, 'At least one item required'),
  related_cfdi: z.array(z.object({
    tipo_relacion: z.string().length(2),
    related_uuid: z.string().uuid('Invalid UUID format for related CFDI'),
  })).optional(),
  notes: z.string().max(2000).optional(),
  conditions: z.string().max(1000).optional(),
  is_global: z.boolean().optional().default(false),
  global_periodicity: z.string().optional(),
  global_months: z.string().optional(),
  global_year: z.string().optional(),
}).refine(data => {
  // PPD invoices must use payment_form '99' (por definir)
  if (data.payment_method === 'PPD' && data.payment_form !== '99') {
    return false;
  }
  return true;
}, { message: 'PPD invoices must use payment form 99 (por definir)' })
.refine(data => {
  // Non-MXN invoices must provide exchange_rate != 1
  if (data.currency !== 'MXN' && data.exchange_rate === 1) {
    return false;
  }
  return true;
}, { message: 'Foreign currency invoices must provide exchange rate' })
.refine(data => {
  // Global invoices require periodicity, months, year
  if (data.is_global) {
    return data.global_periodicity && data.global_months && data.global_year;
  }
  return true;
}, { message: 'Global invoices require periodicity, months, and year' });

// ============================================================
// BUSINESS RULE VALIDATORS
// ============================================================

export function validateCustomerForCFDI(customer: Customer): {
  valid: boolean;
  errors: string[];
} {
  /**
   * Validate that a customer has all required fields for CFDI 4.0.
   * Required in CFDI 4.0:
   * - rfc: must be valid format (12-13 chars)
   * - tax_regime: must be a valid SAT regime code
   * - cfdi_use: must be a valid SAT CFDI use code
   * - address.zip_code: required for DomicilioFiscalReceptor (5 digits)
   *
   * Special case: RFC "XAXX010101000" (public general) is valid for global invoices.
   * Special case: RFC "XEXX010101000" (foreign) is valid for export invoices.
   */
}

export function validatePaymentTerms(
  payment_method: string,
  payment_form: string,
  due_date?: string,
): { valid: boolean; errors: string[] } {
  /**
   * Validate payment term combinations:
   * - PPD requires payment_form = '99'
   * - PPD should have a due_date (warn if missing, don't error)
   * - PUE payment_form cannot be '99'
   * - due_date, if provided, must not be in the past
   */
}

export function validateCurrency(
  currency: string,
  exchange_rate: number,
): { valid: boolean; errors: string[] } {
  /**
   * - Currency must be a valid 3-letter ISO 4217 code
   * - MXN invoices must have exchange_rate = 1
   * - Non-MXN invoices must have exchange_rate > 0 and != 1
   * - USD is common; support at minimum: MXN, USD, EUR, CAD
   */
}

export function validateRelatedInvoices(
  related: Array<{ tipo_relacion: string; related_uuid: string }>,
  tipo_comprobante: string,
): { valid: boolean; errors: string[] } {
  /**
   * - tipo_relacion '01' (credit note) only valid on tipo_comprobante 'E'
   * - tipo_relacion '04' (substitution) can only reference one UUID
   * - related_uuid must be valid UUID v4 format
   * - No duplicate UUIDs in the related list
   */
}

export function validateInvoiceForStamping(invoice: Invoice): {
  valid: boolean;
  errors: string[];
  warnings: string[];
} {
  /**
   * Final validation before submitting to PAC.
   * More strict than draft validation.
   *
   * Checks:
   * - status must be 'draft'
   * - All CFDI required fields are present and non-empty
   * - issuer has valid RFC and tax regime
   * - receiver has valid RFC, tax regime, zip code (CFDI 4.0)
   * - At least one item
   * - All items have valid sat_product_code (8 chars, numeric)
   * - All items have valid sat_unit_code
   * - Totals are internally consistent (call validateAmounts)
   * - issue_date is not more than 72 hours in the past
   *   (SAT rejects invoices older than 72 hours)
   * - issue_date is not in the future
   * - Organization has CSD certificate configured (check org data)
   *
   * Warnings (non-blocking):
   * - due_date is in the past
   * - exchange_rate is more than 24 hours old
   * - items with high discount (> 50%) may trigger SAT audit
   */
}
```

Write unit tests in `apps/web/lib/invoices/__tests__/validation.test.ts`:
- Test `CreateInvoiceSchema` rejects empty items array
- Test `CreateInvoiceSchema` rejects PPD with payment_form != '99'
- Test `CreateInvoiceSchema` rejects non-MXN currency with exchange_rate = 1
- Test `validateCustomerForCFDI` rejects customer missing zip_code
- Test `validateCustomerForCFDI` accepts RFC "XAXX010101000" (public general)
- Test `validatePaymentTerms` rejects PUE with payment_form '99'
- Test `validateCurrency` rejects MXN with exchange_rate != 1
- Test `validateRelatedInvoices` rejects duplicate UUIDs
- Test `validateInvoiceForStamping` rejects invoices older than 72 hours
- Test `validateInvoiceForStamping` returns errors for missing receiver zip_code
- Test `validateInvoiceForStamping` returns warning for past due_date (not error)

---

### Step 5: Workflow

**File: `apps/web/lib/invoices/workflow.ts`**

```typescript
// ============================================================
// STATUS TRANSITION MATRIX
// ============================================================

const ALLOWED_TRANSITIONS: StatusTransition[] = [
  { from: InvoiceStatus.DRAFT,          to: InvoiceStatus.PENDING_STAMP, action: 'submit_for_stamping' },
  { from: InvoiceStatus.DRAFT,          to: InvoiceStatus.VOID,          action: 'void' },
  { from: InvoiceStatus.PENDING_STAMP,  to: InvoiceStatus.STAMPED,       action: 'submit_for_stamping' },
  // PENDING_STAMP → DRAFT happens automatically if stamping fails
  { from: InvoiceStatus.STAMPED,        to: InvoiceStatus.SENT,          action: 'mark_sent' },
  { from: InvoiceStatus.STAMPED,        to: InvoiceStatus.PAID,          action: 'mark_paid' },
  { from: InvoiceStatus.STAMPED,        to: InvoiceStatus.CANCELLED,     action: 'cancel', requiresReason: true },
  { from: InvoiceStatus.SENT,           to: InvoiceStatus.PAID,          action: 'mark_paid' },
  { from: InvoiceStatus.SENT,           to: InvoiceStatus.CANCELLED,     action: 'cancel', requiresReason: true },
  { from: InvoiceStatus.PAID,           to: InvoiceStatus.CANCELLED,     action: 'cancel', requiresReason: true },
];

// Note: 'duplicate' is available for all non-void statuses (creates a new draft)

export function canTransition(
  currentStatus: InvoiceStatus,
  newStatus: InvoiceStatus,
): boolean {
  /** Check if the status transition is allowed per the matrix above. */
}

export function getAvailableActions(invoice: Invoice): InvoiceAction[] {
  /**
   * Return the list of actions available for an invoice in its current status.
   * 'duplicate' is always available unless status is 'void'.
   * 'cancel' is available for stamped, sent, paid (requires SAT cancellation flow).
   */
}

export function validateTransition(
  invoice: Invoice,
  newStatus: InvoiceStatus,
  reason?: string,
): { valid: boolean; error?: string } {
  /**
   * Validate a status transition including business rules:
   * - Is the transition allowed by the matrix?
   * - If transitioning to 'cancelled': reason must be provided (01-04)
   * - If transitioning to 'pending_stamp': invoice must pass validateInvoiceForStamping
   * - If already cancelled/void: no further transitions allowed
   */
}

export function transitionStatus(
  invoice: Invoice,
  newStatus: InvoiceStatus,
  metadata?: { reason?: string; cancelled_by?: string },
): Partial<Invoice> {
  /**
   * Return the fields to update for a status transition.
   * Does NOT write to the database — returns a partial Invoice update object.
   * The repository handles the actual DB write.
   *
   * Sets appropriate timestamp fields:
   * - → stamped: stamped_at = now()
   * - → sent: sent_at = now()
   * - → paid: paid_at = now()
   * - → cancelled: cancelled_at = now(), cancellation_reason = metadata.reason
   */
}
```

Write unit tests in `apps/web/lib/invoices/__tests__/workflow.test.ts`:
- Test all transitions in the matrix return `canTransition = true`
- Test invalid transitions (e.g., PAID → DRAFT) return `canTransition = false`
- Test `getAvailableActions` for DRAFT includes 'submit_for_stamping' and 'void'
- Test `getAvailableActions` for STAMPED includes 'cancel', 'mark_sent', 'mark_paid'
- Test `getAvailableActions` for VOID returns only ['duplicate'] — no other actions
- Test `validateTransition` to 'cancelled' without reason returns error
- Test `validateTransition` for VOID → DRAFT returns error (no re-opening voided invoices)
- Test `transitionStatus` to CANCELLED sets `cancelled_at` and `cancellation_reason`
- Test `transitionStatus` to PAID sets `paid_at`

---

### Step 6: Repository

**File: `apps/web/lib/invoices/repository.ts`**

```typescript
import { createClient } from '@/lib/supabase/server';

export async function findById(
  id: string,
  options: { includeItems?: boolean; includeRelated?: boolean } = {},
): Promise<Invoice | null> {
  /**
   * Find an invoice by primary key.
   * If includeItems: join invoice_items ordered by sort_order
   * If includeRelated: join invoice_related_cfdi
   * Returns null if not found or soft-deleted.
   */
}

export async function findByUUID(uuid: string): Promise<Invoice | null> {
  /** Find a stamped invoice by its SAT UUID. */
}

export async function findByOrganization(
  orgId: string,
  options: {
    filters?: InvoiceFilters;
    pagination?: InvoicePagination;
    sort?: InvoiceSort;
  } = {},
): Promise<InvoiceListResult> {
  /**
   * List invoices for an organization with filtering, pagination, and sorting.
   *
   * Filter implementation:
   * - status: exact match or IN if array
   * - date_from/date_to: issue_date range
   * - amount_min/amount_max: total range
   * - search: PostgreSQL full-text search on receiver_name, folio, serie
   * - is_overdue: due_date < NOW() AND status NOT IN ('paid', 'cancelled', 'void')
   *
   * Default sort: issue_date DESC
   * Default pagination: page=1, limit=20
   */
}

export async function create(
  orgId: string,
  input: CreateInvoiceInput,
  userId: string,
  organizationData: Pick<Organization, 'rfc' | 'business_name' | 'tax_regime' | 'address'>,
  customerData: Customer,
): Promise<Invoice> {
  /**
   * Create invoice + items in a single transaction.
   *
   * Steps:
   * 1. Calculate all amounts using calculateInvoiceTotals(input.items)
   * 2. Get next folio using get_next_folio(orgId, serie) DB function
   * 3. Format folio as zero-padded 8-digit string: e.g., "00000001"
   * 4. Insert invoice row (with issuer and receiver snapshots)
   * 5. Insert invoice_items rows (with calculated amounts)
   * 6. Insert invoice_related_cfdi rows if provided
   * 7. Return full invoice with items
   *
   * All steps in a single Supabase transaction (use RPC or multiple inserts
   * within a try/catch with rollback on error).
   */
}

export async function update(
  id: string,
  input: UpdateInvoiceInput,
  userId: string,
  customerData?: Customer,
): Promise<Invoice> {
  /**
   * Update a DRAFT invoice.
   * Only drafts can be updated — throw error for any other status.
   *
   * If items are provided: DELETE existing items and INSERT new ones.
   * Recalculate all totals from new items.
   * If customer_id changed: update receiver snapshot fields.
   * Update updated_by and updated_at.
   */
}

export async function updateStatus(
  id: string,
  newStatus: InvoiceStatus,
  additionalFields?: Partial<Invoice>,
): Promise<Invoice> {
  /**
   * Update invoice status and any additional fields (e.g., uuid, stamped_at).
   * Used by workflow transitions and stamping service (Component 15).
   */
}

export async function softDelete(
  id: string,
  userId: string,
): Promise<void> {
  /**
   * Soft delete — set deleted_at = NOW().
   * Only DRAFT or VOID invoices can be deleted.
   * Throw error for any other status.
   */
}

export async function getNextFolioPreview(
  orgId: string,
  serie?: string,
): Promise<string> {
  /**
   * Preview what the next folio number will be WITHOUT consuming it.
   * Used for displaying folio in the UI before saving.
   * Returns formatted string like "00000042".
   */
}
```

Write unit tests in `apps/web/lib/invoices/__tests__/repository.test.ts`:
- Mock Supabase client
- Test `findById` returns null for non-existent ID
- Test `findById` with `includeItems: true` joins items
- Test `create` calls `get_next_folio` and formats folio correctly
- Test `create` stores issuer snapshot from org data (not live org lookup)
- Test `create` calculates and stores correct totals
- Test `update` throws error when invoice is not in DRAFT status
- Test `update` recalculates totals when items change
- Test `softDelete` throws error for STAMPED invoice
- Test `findByOrganization` applies date_from filter

---

### Step 7: Service (Main Entry Point)

**File: `apps/web/lib/invoices/service.ts`**

This is the public API of the invoice module. All calls from Server Actions go through here.

```typescript
export async function createDraft(
  orgId: string,
  userId: string,
  input: CreateInvoiceInput,
): Promise<{ invoice: Invoice; errors?: string[] }> {
  /**
   * Create a new invoice draft.
   *
   * Steps:
   * 1. Validate input using CreateInvoiceSchema.safeParse()
   * 2. Fetch customer to validate and snapshot
   * 3. Fetch organization data for issuer snapshot
   * 4. Validate customer for CFDI (validateCustomerForCFDI)
   * 5. For each item with product_id: fetch product and merge tax config
   * 6. Validate payment terms
   * 7. Validate currency
   * 8. Call repository.create()
   * 9. Return invoice or validation errors
   */
}

export async function updateDraft(
  invoiceId: string,
  userId: string,
  input: UpdateInvoiceInput,
): Promise<{ invoice: Invoice; errors?: string[] }> {
  /**
   * Update an existing draft.
   * Validates invoice is in DRAFT status.
   * Re-validates all fields after update.
   */
}

export async function submitForStamping(
  invoiceId: string,
  userId: string,
): Promise<{ invoice: Invoice; errors?: string[]; warnings?: string[] }> {
  /**
   * Validate and transition invoice to PENDING_STAMP status.
   * Runs validateInvoiceForStamping — returns errors if invalid.
   * On success: updates status to 'pending_stamp'.
   * Component 15 (PAC Integration) then picks up pending_stamp invoices.
   */
}

export async function getInvoice(
  invoiceId: string,
  options: { includeItems?: boolean; includeRelated?: boolean } = {},
): Promise<Invoice | null> {
  /** Fetch invoice by ID. Returns null if not found. */
}

export async function listInvoices(
  orgId: string,
  filters?: InvoiceFilters,
  pagination?: InvoicePagination,
  sort?: InvoiceSort,
): Promise<InvoiceListResult> {
  /** List invoices with filters, pagination, and sorting. */
}

export async function cancelInvoice(
  invoiceId: string,
  userId: string,
  reason: CancellationReason,
  replacementUUID?: string,   // Required when reason = '04' (substitution)
): Promise<{ invoice: Invoice; errors?: string[] }> {
  /**
   * Cancel an invoice.
   * Only STAMPED, SENT, or PAID invoices require SAT cancellation.
   * DRAFT invoices are voided (no SAT interaction needed).
   *
   * For stamped invoices:
   * - Validate reason code
   * - If reason='04': validate replacementUUID is provided and valid UUID
   * - Transition to 'cancelled'
   * - Note: Actual SAT cancellation request is handled by Component 15.
   *   This component just sets the status and stores the reason.
   */
}

export async function deleteInvoice(
  invoiceId: string,
  userId: string,
): Promise<void> {
  /** Soft delete — only DRAFT or VOID invoices. */
}

export async function addRelatedInvoice(
  invoiceId: string,
  tipoRelacion: TipoRelacion,
  relatedUUID: string,
): Promise<Invoice> {
  /**
   * Add a related CFDI reference to an invoice.
   * Only available for DRAFT invoices.
   * Validates UUID format and tipo_relacion rules.
   */
}

export async function duplicateInvoice(
  invoiceId: string,
  userId: string,
  orgId: string,
): Promise<Invoice> {
  /**
   * Create a new DRAFT invoice as a copy of an existing invoice.
   * New invoice gets a fresh ID, new folio, status=draft, issue_date=now().
   * Items are copied. UUID and stamping data are NOT copied.
   * Related CFDIs are NOT copied.
   * Useful for recurring invoices.
   */
}

export async function getInvoiceStats(
  orgId: string,
  dateFrom: string,
  dateTo: string,
): Promise<{
  total_invoices: number;
  total_revenue: number;          // Sum of all stamped/sent/paid invoice totals
  total_pending: number;          // Count of pending payment
  total_overdue: number;          // Count of overdue
  by_status: Record<InvoiceStatus, number>;
}> {
  /** Aggregate stats for dashboard widgets. */
}
```

Write unit tests in `apps/web/lib/invoices/__tests__/service.test.ts`:
- Mock repository, customer service, product service
- Test `createDraft` returns validation errors for invalid input (no customer_id)
- Test `createDraft` fetches customer and validates for CFDI
- Test `createDraft` merges product tax config into items when product_id provided
- Test `createDraft` returns error when customer missing zip_code
- Test `updateDraft` returns error when invoice not in DRAFT status
- Test `submitForStamping` returns errors when invoice fails stamping validation
- Test `submitForStamping` transitions to PENDING_STAMP on success
- Test `cancelInvoice` on DRAFT invoice transitions to VOID (not CANCELLED)
- Test `cancelInvoice` on STAMPED invoice requires reason
- Test `cancelInvoice` with reason='04' requires replacementUUID
- Test `duplicateInvoice` creates new draft with fresh folio, no UUID

---

### Step 8: Server Actions

**File: `apps/web/lib/invoices/actions.ts`**

Next.js Server Actions that call the service layer. These are the entry points from UI components and API routes.

```typescript
'use server';

import { requirePermission } from '@/lib/rbac';
import { getOrganizationContext } from '@/lib/tenant';
import * as invoiceService from './service';

export async function createInvoiceAction(
  orgId: string,
  input: CreateInvoiceInput,
) {
  /**
   * Server Action for creating a draft invoice.
   * 1. Check permission: 'invoices:create' for the org
   * 2. Get organization data from context
   * 3. Call service.createDraft()
   * 4. Return { success, invoice?, errors? }
   */
}

export async function updateInvoiceAction(
  invoiceId: string,
  input: UpdateInvoiceInput,
) { ... }

export async function submitForStampingAction(invoiceId: string) { ... }

export async function cancelInvoiceAction(
  invoiceId: string,
  reason: CancellationReason,
  replacementUUID?: string,
) { ... }

export async function deleteInvoiceAction(invoiceId: string) { ... }

export async function duplicateInvoiceAction(invoiceId: string) { ... }

export async function getInvoiceAction(invoiceId: string) { ... }

export async function listInvoicesAction(
  orgId: string,
  filters?: InvoiceFilters,
  pagination?: InvoicePagination,
  sort?: InvoiceSort,
) { ... }
```

Write unit tests in `apps/web/lib/invoices/__tests__/actions.test.ts`:
- Mock `requirePermission` and all service functions
- Test `createInvoiceAction` checks `invoices:create` permission
- Test `createInvoiceAction` returns `{ success: false, errors }` when validation fails
- Test `submitForStampingAction` checks permission before calling service
- Test `cancelInvoiceAction` passes reason to service layer

---

## 🔑 KEY TECHNICAL DECISIONS

**Why denormalize issuer/receiver data onto the invoice:**
CFDI is a legal document. If a customer's RFC or name changes after an invoice is created, the original invoice must reflect the data at the time of creation. Storing the RFC/name/regime/zip directly on the invoice row is the correct approach — do not re-fetch from the customer table at stamp time.

**Why `decimal.js` for calculations:**
`0.1 + 0.2 === 0.30000000000000004` in JavaScript. Tax calculations involving IVA retention rates (10.67%) and ISR (10%, 1.25%) produce incorrect results with native floats. All monetary math must use Decimal arithmetic. This is non-negotiable for a tax compliance platform.

**Why `get_next_folio` as a PostgreSQL function:**
Folio numbers must be strictly sequential with no gaps. A race condition where two simultaneous invoice creations get the same folio number would be a compliance issue. The PostgreSQL atomic `INSERT ... ON CONFLICT DO UPDATE RETURNING` pattern handles this correctly. Never implement folio generation in application code.

**Why soft delete instead of hard delete:**
Mexican tax law requires retaining invoice records for 5 years. Even voided drafts should be retained for audit purposes. `deleted_at` timestamp provides the soft delete pattern while keeping records in place.

**Why `issue_date` has a 72-hour limit for stamping:**
SAT rejects CFDI submissions where `Fecha` is more than 72 hours in the past. This is a hard SAT rule. The `validateInvoiceForStamping` function must enforce this.

---

## 🧪 TESTING REQUIREMENTS

**Coverage targets:**
- `apps/web/lib/invoices/calculations.ts` → ≥ 95% — this is financial math, test exhaustively
- `apps/web/lib/invoices/validation.ts` → ≥ 90%
- `apps/web/lib/invoices/workflow.ts` → ≥ 95% — test every transition in the matrix
- `apps/web/lib/invoices/repository.ts` → ≥ 80% (Supabase mocked)
- `apps/web/lib/invoices/service.ts` → ≥ 85%

All test files go in `apps/web/lib/invoices/__tests__/`.

Run tests:
```bash
cd apps/web
npm test lib/invoices
```

---

## 📝 COMPLETION SUMMARY REQUIREMENT

Write a **Completion Summary** at the end of your response with:

**1. What Was Built** — every file created/modified with one-line description.

**2. Database Schema** — table list with column count, indexes, constraints, and migration filename.

**3. Invoice Lifecycle** — diagram or description of all status transitions implemented.

**4. Calculation Examples** — three worked examples showing correct tax calculation:
  - Standard product with 16% IVA
  - Professional service with IVA + ISR retention
  - Exempt item (tax_object=01)

**5. Validation Rules** — complete list of all validation rules enforced, distinguishing errors vs. warnings.

**6. Test Coverage** — test file list with test count per file. Total tests added.

**7. Integration Contracts** — what data structures downstream components (13, 14, 15, 16, 17, 18) will consume from this component, by name.

**8. Known Limitations** — things intentionally deferred to later components (XML generation, PAC submission, PDF rendering, payment recording).

**9. How to Test Manually** — step-by-step using the Server Actions to create, validate, and submit a draft invoice.

---

## ✅ DEFINITION OF DONE

- [ ] `supabase/migrations/20250101000012_create_invoices.sql` exists with all 4 tables and `get_next_folio` function
- [ ] All 7 source files exist in `apps/web/lib/invoices/`
- [ ] `decimal.js` used for all monetary calculations — zero native float arithmetic in `calculations.ts`
- [ ] `CreateInvoiceSchema` enforces PPD + payment_form '99' rule
- [ ] `validateInvoiceForStamping` rejects invoices with issue_date > 72 hours old
- [ ] All 7 status transitions in the workflow matrix are implemented and tested
- [ ] Folio generation uses `get_next_folio` PostgreSQL function (not application code)
- [ ] Issuer and receiver data are denormalized onto the invoice at creation time
- [ ] `cancelInvoice` on a DRAFT transitions to VOID (not CANCELLED)
- [ ] `cancelInvoice` on STAMPED/SENT/PAID transitions to CANCELLED and requires reason
- [ ] All unit tests pass: `npm test lib/invoices`
- [ ] Coverage targets met
- [ ] Completion Summary written at end of response
