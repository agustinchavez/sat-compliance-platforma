# Component 13: CFDI XML Generator

## ✅ WHAT'S ALREADY BUILT

### Components 1–12 Complete ✓

- ✅ Authentication (Component 01) — Supabase Auth, JWT sessions
- ✅ RBAC (Component 02) — Redis-cached permission checks, sub-5ms
- ✅ Multi-Tenant Context (Component 03) — RLS, org isolation
- ✅ Organization Service (Component 04) — CSD/e.firma storage (AES-256, Cloudflare R2)
- ✅ Team Management (Component 05) — multi-org membership
- ✅ Customer Service (Component 06) — RFC validation, 26 tax regimes, 27 CFDI use codes
- ✅ RFC Validation (Component 07) — SAT SOAP web service
- ✅ Product/Service Management (Component 08) — 55,000+ SAT codes, unit codes, tax config
- ✅ SAT Code Search AI (Component 09) — semantic embeddings, pgvector
- ✅ Receipt OCR (Component 10) — Tesseract, CFDI XML parsing
- ✅ Tax Assistant Chatbot (Component 11) — Llama 3.1/GPT-4o-mini, RAG
- ✅ Invoice Service Core (Component 12) — Full invoice lifecycle, status machine, decimal.js calculations

### What Component 12 Delivered (Your Direct Inputs)

Component 12 built the invoice data model that this component consumes. Key facts to carry forward:

**Column name convention from the built schema** (use these exact names when reading from DB):
```typescript
// Issuer fields on invoices table (from Component 12 migration)
issuer_rfc, issuer_name, issuer_tax_regime, issuer_postal_code

// Receiver fields on invoices table
receiver_rfc, receiver_name, receiver_tax_regime, receiver_cfdi_use, receiver_postal_code

// Items fields on invoice_items table
product_service_key   // ← ClaveProdServ (NOT sat_product_code)
unit_key              // ← ClaveUnidad (NOT sat_unit_code)
tax_object            // ← ObjetoImp
tax_breakdown         // ← JSONB array with per-item tax detail
```

**Invoice stamps JSONB** (populated after stamping, stored in `invoices.stamps`):
```typescript
// invoices.stamps JSONB structure (set by Component 15 after PAC stamps)
{
  uuid: string,          // UUID del timbre
  seal: string,          // Sello del emisor (base64)
  sat_seal: string,      // SelloSAT
  no_certificado_sat: string,
  certificate_number: string,  // NoCertificado CSD
  certificate: string,   // Certificado CSD (base64)
  stamped_at: string,    // FechaTimbrado ISO
}
```

**invoice_items.tax_breakdown JSONB** structure (per item, from Component 12):
```typescript
// Each item's tax_breakdown array element:
{
  type: 'traslado' | 'retencion',
  impuesto: '001' | '002' | '003',   // ISR | IVA | IEPS
  tipo_factor: 'Tasa' | 'Exento',
  tasa_o_cuota: string,              // e.g. "0.160000"
  base: string,                      // taxable base, 6 decimals
  importe: string,                   // tax amount, 6 decimals
}
```

### Where This Component Lives

This component is a **shared TypeScript package** in the monorepo, not inside `apps/web/` or `ai-service/`. It produces reusable XML generation logic consumed by multiple parts of the platform.

```
packages/cfdi/        ← NEW package (create this)
apps/web/             ← Consumes packages/cfdi
```

The monorepo already uses Turborepo. Add the new package following the existing pattern (check `packages/` for any existing shared packages to understand `package.json` structure and `tsconfig.json` setup).

---

## 🔬 RESEARCHED CFDI 4.0 TECHNICAL SPECIFICATIONS

The following specifications were verified against official SAT documentation and the published XSD at `http://www.sat.gob.mx/sitio_internet/cfd/4/cfdv40.xsd`. Implement exactly as specified below.

### Namespaces and Schema Locations

```typescript
// These are the exact, required namespace URIs and XSD locations
export const CFDI_NAMESPACE    = 'http://www.sat.gob.mx/cfd/4';
export const XSI_NAMESPACE     = 'http://www.w3.org/2001/XMLSchema-instance';
export const CFDI_XSD_LOCATION = 'http://www.sat.gob.mx/sitio_internet/cfd/4/cfdv40.xsd';
export const CFDI_VERSION      = '4.0';

// Pagos 2.0 complement (used in Component 18)
export const PAGOS20_NAMESPACE    = 'http://www.sat.gob.mx/Pagos20';
export const PAGOS20_XSD_LOCATION = 'http://www.sat.gob.mx/sitio_internet/cfd/Pagos/Pagos20.xsd';

// TFD (TimbreFiscalDigital) — added by PAC after stamping (Component 15)
export const TFD_NAMESPACE    = 'http://www.sat.gob.mx/TimbreFiscalDigital';
export const TFD_XSD_LOCATION = 'http://www.sat.gob.mx/sitio_internet/cfd/TimbreFiscalDigital/TimbreFiscalDigitalv11.xsd';
```

**Correct schemaLocation format** for a base CFDI (no complements):
```
http://www.sat.gob.mx/cfd/4 http://www.sat.gob.mx/sitio_internet/cfd/4/cfdv40.xsd
```

**For CFDI with Pagos 2.0 complement** (Component 18 will call this generator):
```
http://www.sat.gob.mx/cfd/4 http://www.sat.gob.mx/sitio_internet/cfd/4/cfdv40.xsd http://www.sat.gob.mx/Pagos20 http://www.sat.gob.mx/sitio_internet/cfd/Pagos/Pagos20.xsd
```

> ⚠️ CRITICAL: The XML declaration must use `encoding="UTF-8"` (uppercase). Using lowercase `utf-8` in the declaration causes PAC rejection with CO1002 errors.

### Required XML Declaration

```xml
<?xml version="1.0" encoding="UTF-8"?>
```

### Comprobante Root Element — Required Attribute Order

SAT XSD validation is order-sensitive for attributes in the cadena original. Always emit attributes in this exact order:

```
Version, Serie*, Folio*, Fecha, Sello, FormaPago*, NoCertificado,
Certificado, CondicionesDePago*, SubTotal, Descuento*,
Moneda, TipoCambio*, Total, TipoDeComprobante, Exportacion,
MetodoPago*, LugarExpedicion, Confirmacion*
```
(* = conditional/optional)

**Special rules for `TipoDeComprobante="P"` (payment complement)**:
- `Moneda` must be `"XXX"` (not a real currency)
- `SubTotal` must be `"0"`
- `Total` must be `"0"`
- `FormaPago` is omitted (no value at root level)
- `MetodoPago` is omitted

### Emisor Node

```xml
<cfdi:Emisor
  Rfc="EKU9003173C9"
  Nombre="ESCUELA KEMPER URGATE"
  RegimenFiscal="601"/>
```

> ⚠️ For **Personas Morales** (RFC length = 12, starts with 3 letters), the `Nombre` must NOT include the Régimen de Capital suffix (S.A. DE C.V., S. de R.L., etc.). The certificate validation will fail otherwise. Strip trailing `, S.A. DE C.V.`, `, S. DE R.L.`, etc. from `Nombre` if the org is a Persona Moral. **Only needed when comparing against the CSD certificate's CN field** — the invoice display name can remain unstripped.

### Receptor Node (CFDI 4.0 — new required fields)

```xml
<cfdi:Receptor
  Rfc="URE180429TM6"
  Nombre="UNIVERSIDAD ROBOTICA ESPAÑOLA"
  DomicilioFiscalReceptor="65000"
  RegimenFiscalReceptor="601"
  UsoCFDI="G01"/>
```

`DomicilioFiscalReceptor` and `RegimenFiscalReceptor` are **new in CFDI 4.0** and are **required** — invoices without them are rejected by PAC. Map from `invoices.receiver_postal_code` and `invoices.receiver_tax_regime`.

**Special RFC values** that are valid:
- `XAXX010101000` — PÚBLICO EN GENERAL (global invoices, no identified customer)
- `XEXX010101000` — Extranjero (foreign customer)

When `Rfc = XAXX010101000`, use `UsoCFDI = "S01"` (sin efectos fiscales) and `RegimenFiscalReceptor = "616"`.

### Concepto Node — Full Structure

```xml
<cfdi:Concepto
  ClaveProdServ="81112100"
  NoIdentificacion="SRV-001"
  Cantidad="1.000000"
  ClaveUnidad="E48"
  Unidad="Hora"
  Descripcion="Servicio de consultoría"
  ValorUnitario="10000.000000"
  Importe="10000.000000"
  Descuento="0.000000"
  ObjetoImp="02">
  <cfdi:Impuestos>
    <cfdi:Traslados>
      <cfdi:Traslado
        Base="10000.000000"
        Impuesto="002"
        TipoFactor="Tasa"
        TasaOCuota="0.160000"
        Importe="1600.000000"/>
    </cfdi:Traslados>
    <cfdi:Retenciones>
      <cfdi:Retencion
        Base="10000.000000"
        Impuesto="001"
        TipoFactor="Tasa"
        TasaOCuota="0.100000"
        Importe="1000.000000"/>
    </cfdi:Retenciones>
  </cfdi:Impuestos>
</cfdi:Concepto>
```

**Key rules for Concepto:**
- `Descuento` is **optional** — only include if discount > 0
- `NoIdentificacion` is **optional** — only include if `sku` is present
- `Unidad` (human-readable unit name) is **optional** in the XSD but recommended
- `ObjetoImp` values: `"01"` = not taxed, `"02"` = taxed, `"03"` = partially taxed
- When `ObjetoImp = "01"`: the `<cfdi:Impuestos>` child node **must NOT exist**
- When `TipoFactor = "Exento"`: **do not include** `TasaOCuota` or `Importe` attributes

**Decimal formatting for Concepto:**
- `Cantidad`: up to 6 decimal places (e.g., `"1.000000"` or `"2.500000"`)
- `ValorUnitario`, `Importe`, `Base`, `Descuento`: up to 6 decimal places
- `TasaOCuota`: exactly 6 decimal places (e.g., `"0.160000"`, `"0.106700"`)

### Impuestos Summary Node (at Comprobante level)

This is one of the most important and misunderstood parts of CFDI 4.0. The `cfdi:Impuestos` node at Comprobante level is a **mathematical summary** of all item-level taxes, **grouped by (Impuesto, TipoFactor, TasaOCuota)**.

```xml
<cfdi:Impuestos
  TotalImpuestosRetenidos="2067.000000"
  TotalImpuestosTrasladados="1600.000000">
  <cfdi:Retenciones>
    <cfdi:Retencion
      Impuesto="002"
      Importe="1067.000000"/>
    <cfdi:Retencion
      Impuesto="001"
      Importe="1000.000000"/>
  </cfdi:Retenciones>
  <cfdi:Traslados>
    <cfdi:Traslado
      Base="10000.000000"
      Impuesto="002"
      TipoFactor="Tasa"
      TasaOCuota="0.160000"
      Importe="1600.000000"/>
  </cfdi:Traslados>
</cfdi:Impuestos>
```

**Aggregation rules (verified from SAT Anexo 20 v4.0):**

Traslados grouping key: `(Impuesto, TipoFactor, TasaOCuota)`
- `Base` = sum of all item-level `Base` values sharing the same grouping key
- `Importe` = sum of all item-level `Importe` values sharing the same grouping key
- `TotalImpuestosTrasladados` = sum of all `Importe` across ALL Traslado groups
  (only when at least one TipoFactor ≠ "Exento")

Retenciones grouping key: `(Impuesto)` — one row per tax type retained
- `Importe` = sum of all item-level `Importe` for that `Impuesto`
- `TotalImpuestosRetenidos` = sum of all Retencion `Importe`

**Exento special rules:**
- When `TipoFactor = "Exento"`: include `Base` but **omit** `TasaOCuota` and `Importe`
- When ALL items in the CFDI have `TipoFactor = "Exento"`:
  the `<cfdi:Traslados>` node **must not exist** at Comprobante level
  (the entire `<cfdi:Impuestos>` may still appear with just `Retenciones` if applicable)
- `TotalImpuestosTrasladados` must be **omitted** when all items are Exento

**Impuesto codes:**
```
"001" — ISR (Impuesto Sobre la Renta)
"002" — IVA (Impuesto al Valor Agregado)
"003" — IEPS (Impuesto Especial sobre Producción y Servicios)
```

### Related CFDIs Node (CfdiRelacionados)

```xml
<cfdi:CfdiRelacionados TipoRelacion="04">
  <cfdi:CfdiRelacionado UUID="F4F09AEF-57F2-4BE0-A828-87D1A80ED61C"/>
  <cfdi:CfdiRelacionado UUID="A1B2C3D4-..."/>
</cfdi:CfdiRelacionados>
```

Multiple `cfdi:CfdiRelacionado` elements can exist under one `cfdi:CfdiRelacionados`.
Multiple `cfdi:CfdiRelacionados` blocks (different `TipoRelacion`) are also allowed.

### Global Invoice Node (InformacionGlobal)

When `invoice.is_global = true`:

```xml
<cfdi:InformacionGlobal
  Periodicidad="04"
  Meses="03"
  Año="2024"/>
```

This node must appear **before** `cfdi:CfdiRelacionados` (if present) and before `cfdi:Emisor`.

### Cadena Original — The Most Critical Operation

The cadena original is generated by transforming the CFDI XML using an XSLT stylesheet provided by SAT. The XSLT URL for CFDI 4.0 is:

```
http://www.sat.gob.mx/sitio_internet/cfd/4/cadenaoriginal_4_0/cadenaoriginal_4_0.xslt
```

**How it works:**
1. Take the unsigned CFDI XML (with `Sello=""` and `NoCertificado=""` and `Certificado=""` as placeholders)
2. Apply the SAT XSLT transformation using `xsltproc` or equivalent
3. The result is a pipe-delimited string starting with `|` and ending with `||`

**Example cadena original:**
```
||4.0|A|00001|2024-03-01T10:00:00|01|10000.00|MXN|11600.00|I|01|PUE|06600|
EKU9003173C9|ESCUELA KEMPER URGATE|601|URE180429TM6|UNIVERSIDAD ROBOTICA ESPAÑOLA|
65000|601|G01|81112100|1|E48|Hora|Servicio de consultoría|10000.000000|10000.000000|
02|10000.000000|002|Tasa|0.160000|1600.000000||
```

**Implementation strategy for Node.js:**

The SAT XSLT uses XSLT 1.0. In Node.js, use the `xslt3` npm package (Saxon-JS) or `saxonjs` for XSLT processing. Do **not** attempt to replicate the XSLT logic manually — the field order and whitespace normalization rules are complex and error-prone. Always apply the actual XSLT file.

**Bundling the XSLT:**
Download the XSLT file at build time and bundle it with the package:

```
packages/cfdi/src/xslt/cadenaoriginal_4_0.xslt   ← bundle this file
```

Provide a script `packages/cfdi/scripts/download-xslt.ts` that downloads the current XSLT from SAT and saves it locally. This handles SAT occasionally updating the file without versioning notice.

**Signature flow (context for this component):**
```
Unsigned XML → applyXSLT(xslt) → cadena original string
                                          ↓
                               SHA-256 hash of cadena
                                          ↓
                         RSA-SHA256 sign with private key (Component 14)
                                          ↓
                              base64-encode → Sello value
```

This component generates the cadena original. Component 14 (Digital Signature) performs the actual RSA signing. Component 15 (PAC) receives the signed XML.

### XML Library Selection

Use **`xmlbuilder2`** (not `xml2js` or `fast-xml-parser`). Reasons:
- `xml2js` is primarily a parser, not a builder — generating properly ordered, namespace-aware XML is fragile
- `fast-xml-parser` has limited namespace support for generation
- `xmlbuilder2` is purpose-built for XML generation, handles namespaces correctly, produces canonical output

```bash
npm install xmlbuilder2
npm install xslt3     # For cadena original generation
```

---

## 📋 CURRENT TASK: Component 13 — CFDI XML Generator

Build a shared TypeScript package at `packages/cfdi/` that generates valid CFDI 4.0 XML documents from the Invoice data model produced by Component 12. This package is **pure TypeScript with no runtime database access** — it takes data objects as input and returns XML strings.

---

## 🏗️ IMPLEMENTATION ORDER

Follow this exact order. **Write unit tests for each step before moving to the next.**

---

### Step 1: Package Setup

Create the Turborepo package `packages/cfdi/`.

```
packages/cfdi/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts                  ← Public exports
│   ├── types.ts
│   ├── constants.ts
│   ├── schema.ts
│   ├── generator.ts
│   ├── cadena-original.ts
│   ├── validation.ts
│   ├── complements/
│   │   └── pagos.ts
│   └── xslt/
│       └── cadenaoriginal_4_0.xslt   ← Downloaded at build time
├── scripts/
│   └── download-xslt.ts
└── src/__tests__/
    ├── generator.test.ts
    ├── cadena-original.test.ts
    ├── validation.test.ts
    ├── impuestos-aggregation.test.ts
    └── complements/
        └── pagos.test.ts
```

**`package.json`** for the new package:
```json
{
  "name": "@repo/cfdi",
  "version": "0.0.1",
  "private": true,
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "scripts": {
    "build": "tsc",
    "test": "vitest run",
    "download-xslt": "tsx scripts/download-xslt.ts"
  },
  "dependencies": {
    "xmlbuilder2": "^3.1.1",
    "xslt3": "^2.5.0",
    "decimal.js": "^10.4.3"
  },
  "devDependencies": {
    "typescript": "*",
    "vitest": "*",
    "tsx": "*"
  }
}
```

Add `@repo/cfdi` as a dependency in `apps/web/package.json`.

Write a test that confirms:
- `packages/cfdi/src/index.ts` exports `generateCFDI`, `generateCadenaOriginal`, `validateCFDI`
- Package can be imported from `apps/web`

---

### Step 2: Types and Constants

**File: `packages/cfdi/src/types.ts`**

Define the TypeScript interfaces that represent the CFDI 4.0 XML structure. These are distinct from Component 12's `Invoice` type — they are the raw CFDI XML data model (Spanish field names, exactly matching the XSD).

```typescript
// Matches the cfdi:Comprobante XML element attributes
export interface CFDIComprobante {
  Version: '4.0';
  Serie?: string;
  Folio?: string;
  Fecha: string;               // ISO datetime: "2024-03-01T10:00:00"
  Sello: string;               // Empty string before signing
  FormaPago?: string;          // Omitted for TipoDeComprobante=P
  NoCertificado: string;       // 20-char certificate number
  Certificado: string;         // Base64 certificate (empty before signing)
  CondicionesDePago?: string;
  SubTotal: string;            // Decimal string "10000.00"
  Descuento?: string;          // Only if > 0
  Moneda: string;
  TipoCambio?: string;         // Only for non-MXN
  Total: string;
  TipoDeComprobante: 'I' | 'E' | 'T' | 'P';
  Exportacion: string;         // "01" default
  MetodoPago?: string;         // Omitted for TipoDeComprobante=P
  LugarExpedicion: string;     // Zip code
  Confirmacion?: string;
  InformacionGlobal?: CFDIInformacionGlobal;
  CfdiRelacionados?: CFDICfdiRelacionados[];
  Emisor: CFDIEmisor;
  Receptor: CFDIReceptor;
  Conceptos: CFDIConcepto[];
  Impuestos?: CFDIImpuestos;
  Complemento?: CFDIComplemento;
}

export interface CFDIEmisor {
  Rfc: string;
  Nombre: string;
  RegimenFiscal: string;
}

export interface CFDIReceptor {
  Rfc: string;
  Nombre: string;
  DomicilioFiscalReceptor: string;   // Zip code — required in 4.0
  RegimenFiscalReceptor: string;     // Required in 4.0
  UsoCFDI: string;
  ResidenciaFiscal?: string;         // For foreign customers
  NumRegIdTrib?: string;             // Foreign tax ID
}

export interface CFDIConcepto {
  ClaveProdServ: string;
  NoIdentificacion?: string;         // SKU — optional
  Cantidad: string;
  ClaveUnidad: string;
  Unidad?: string;                   // Human-readable unit — optional
  Descripcion: string;
  ValorUnitario: string;
  Importe: string;
  Descuento?: string;                // Only if > 0
  ObjetoImp: '01' | '02' | '03';
  Impuestos?: CFDIConceptoImpuestos;
}

export interface CFDIConceptoImpuestos {
  Traslados?: CFDIConceptoTraslado[];
  Retenciones?: CFDIConceptoRetencion[];
}

export interface CFDIConceptoTraslado {
  Base: string;
  Impuesto: '001' | '002' | '003';
  TipoFactor: 'Tasa' | 'Exento';
  TasaOCuota?: string;               // Omitted when TipoFactor=Exento
  Importe?: string;                  // Omitted when TipoFactor=Exento
}

export interface CFDIConceptoRetencion {
  Base: string;
  Impuesto: '001' | '002' | '003';
  TipoFactor: 'Tasa';
  TasaOCuota: string;
  Importe: string;
}

export interface CFDIImpuestos {
  TotalImpuestosRetenidos?: string;
  TotalImpuestosTrasladados?: string;
  Retenciones?: CFDISummaryRetencion[];
  Traslados?: CFDISummaryTraslado[];
}

// Summary-level Retencion (at Comprobante level, grouped by Impuesto only)
export interface CFDISummaryRetencion {
  Impuesto: '001' | '002' | '003';
  Importe: string;
}

// Summary-level Traslado (at Comprobante level, grouped by Impuesto+TipoFactor+TasaOCuota)
export interface CFDISummaryTraslado {
  Base: string;
  Impuesto: '001' | '002' | '003';
  TipoFactor: 'Tasa' | 'Exento';
  TasaOCuota?: string;               // Omitted when TipoFactor=Exento
  Importe?: string;                  // Omitted when TipoFactor=Exento
}

export interface CFDICfdiRelacionados {
  TipoRelacion: string;
  CfdiRelacionado: Array<{ UUID: string }>;
}

export interface CFDIInformacionGlobal {
  Periodicidad: string;
  Meses: string;
  Año: string;
}

export interface CFDIComplemento {
  TimbreFiscalDigital?: CFDITimbreFiscalDigital;
  Pagos20?: unknown;    // Defined in complements/pagos.ts
}

export interface CFDITimbreFiscalDigital {
  Version: '1.1';
  UUID: string;
  FechaTimbrado: string;
  RfcProvCertif: string;
  SelloCFD: string;
  NoCertificadoSAT: string;
  SelloSAT: string;
}

// Input type: what this generator receives from Component 12
export interface CFDIGeneratorInput {
  invoice: {
    id: string;
    uuid?: string;
    serie?: string;
    folio?: string;
    issue_date: string;
    tipo_comprobante: 'I' | 'E' | 'T';
    payment_method?: string;         // PUE | PPD
    payment_form?: string;
    currency: string;
    exchange_rate: number;
    exportacion: string;
    conditions?: string;
    subtotal: number;
    discount: number;
    total: number;
    issuer_rfc: string;
    issuer_name: string;
    issuer_tax_regime: string;
    issuer_postal_code: string;      // ← Component 12 uses postal_code
    receiver_rfc: string;
    receiver_name: string;
    receiver_tax_regime: string;
    receiver_postal_code: string;    // ← Component 12 uses postal_code
    receiver_cfdi_use: string;
    is_global: boolean;
    global_periodicity?: string;
    global_months?: string;
    global_year?: string;
    related_cfdi?: Array<{
      tipo_relacion: string;
      related_uuid: string;
    }>;
    items: CFDIItemInput[];
    stamps?: {
      certificate_number: string;
      certificate: string;
      seal: string;
    };
  };
}

export interface CFDIItemInput {
  product_service_key: string;       // ← ClaveProdServ (Component 12 column name)
  unit_key: string;                  // ← ClaveUnidad (Component 12 column name)
  unit_name?: string;
  sku?: string;
  description: string;
  quantity: number;
  unit_price: number;
  discount_amount: number;
  tax_object: '01' | '02' | '03';
  tax_breakdown: Array<{
    type: 'traslado' | 'retencion';
    impuesto: '001' | '002' | '003';
    tipo_factor: 'Tasa' | 'Exento';
    tasa_o_cuota?: string;
    base: string;
    importe?: string;
  }>;
}

export interface CFDIGeneratorResult {
  xml: string;               // The complete XML string
  xmlUnsigned: string;       // XML before Sello is applied (identical pre-signing)
}

export interface CadenaOriginalResult {
  cadena: string;            // The pipe-delimited cadena original string
  sha256: string;            // SHA-256 hex digest (Component 14 uses this for signing)
}

export interface CFDIValidationResult {
  valid: boolean;
  errors: CFDIValidationError[];
  warnings: CFDIValidationWarning[];
}

export interface CFDIValidationError {
  code: string;
  field?: string;
  message: string;
}

export interface CFDIValidationWarning {
  code: string;
  field?: string;
  message: string;
}
```

**File: `packages/cfdi/src/constants.ts`**

```typescript
export const CFDI_NAMESPACE    = 'http://www.sat.gob.mx/cfd/4';
export const XSI_NAMESPACE     = 'http://www.w3.org/2001/XMLSchema-instance';
export const CFDI_XSD_LOCATION = 'http://www.sat.gob.mx/sitio_internet/cfd/4/cfdv40.xsd';
export const CFDI_VERSION      = '4.0' as const;

export const PAGOS20_NAMESPACE    = 'http://www.sat.gob.mx/Pagos20';
export const PAGOS20_XSD_LOCATION = 'http://www.sat.gob.mx/sitio_internet/cfd/Pagos/Pagos20.xsd';

export const TFD_NAMESPACE = 'http://www.sat.gob.mx/TimbreFiscalDigital';

// Impuesto codes
export const IMPUESTO_ISR  = '001' as const;
export const IMPUESTO_IVA  = '002' as const;
export const IMPUESTO_IEPS = '003' as const;

// TipoFactor
export const TIPO_FACTOR_TASA   = 'Tasa' as const;
export const TIPO_FACTOR_EXENTO = 'Exento' as const;

// IVA rates
export const IVA_GENERAL = '0.160000' as const;
export const IVA_FRONTERA = '0.080000' as const;
export const IVA_CERO    = '0.000000' as const;

// ISR retention rates
export const ISR_RETENCION_HONORARIOS  = '0.100000' as const;
export const ISR_RETENCION_ARRENDAMIENTO = '0.100000' as const;

// IVA retention rates
export const IVA_RETENCION_SERVICIOS   = '0.106700' as const;
export const IVA_RETENCION_ARRENDAMIENTO = '0.106700' as const;

// Special RFC values
export const RFC_PUBLICO_GENERAL = 'XAXX010101000' as const;
export const RFC_EXTRANJERO      = 'XEXX010101000' as const;

// UsoCFDI for special cases
export const USO_CFDI_SIN_EFECTOS = 'S01' as const;  // For XAXX/XEXX
export const USO_CFDI_PAGO        = 'CP01' as const;  // For payment complements

// RegimenFiscal for XAXX
export const REGIMEN_SIN_OBLIGACIONES = '616' as const;

// FormaPago for payment complements (TipoDeComprobante=P)
export const FORMA_PAGO_POR_DEFINIR = '99' as const;

// ClaveProdServ required for payment complement Concepto
export const CLAVE_PROD_SERV_PAGO = '84111506' as const;
export const CLAVE_UNIDAD_PAGO    = 'ACT' as const;
```

Write tests in `src/__tests__/constants.test.ts` confirming all namespace URIs are the correct SAT URIs.

---

### Step 3: Impuestos Aggregation

**File: `packages/cfdi/src/impuestos-aggregation.ts`**

This deserves its own file because the aggregation logic is the most technically complex and error-prone part of CFDI XML generation.

```typescript
import Decimal from 'decimal.js';

/**
 * Aggregate item-level tax breakdown records into the
 * Comprobante-level cfdi:Impuestos summary node.
 *
 * SAT Rule (Anexo 20 v4.0):
 * - Traslados are grouped by (Impuesto, TipoFactor, TasaOCuota)
 * - Base per group = sum of all item Base values for that group
 * - Importe per group = sum of all item Importe values for that group
 * - Retenciones are grouped by (Impuesto) only
 * - TotalImpuestosTrasladados = sum of all Traslado Importe
 *   (only emitted when at least one Traslado has TipoFactor ≠ "Exento")
 * - TotalImpuestosRetenidos = sum of all Retencion Importe
 */

interface TaxRecord {
  type: 'traslado' | 'retencion';
  impuesto: string;
  tipo_factor: string;
  tasa_o_cuota?: string;
  base: string;
  importe?: string;
}

export interface AggregatedImpuestos {
  totalImpuestosRetenidos?: string;
  totalImpuestosTrasladados?: string;
  retenciones: Array<{
    impuesto: string;
    importe: string;
  }>;
  traslados: Array<{
    base: string;
    impuesto: string;
    tipoFactor: string;
    tasaOCuota?: string;
    importe?: string;
  }>;
}

export function aggregateImpuestos(taxRecords: TaxRecord[]): AggregatedImpuestos {
  /**
   * Implementation notes:
   *
   * 1. Filter traslados vs retenciones.
   *
   * 2. For Traslados:
   *    - Group by composite key: `${impuesto}|${tipo_factor}|${tasa_o_cuota ?? ''}`
   *    - Sum Base and Importe per group using Decimal.js (6 decimal places)
   *    - When TipoFactor=Exento: include Base, exclude TasaOCuota and Importe
   *
   * 3. For Retenciones:
   *    - Group by Impuesto only
   *    - Sum Importe per group
   *
   * 4. TotalImpuestosTrasladados:
   *    - Only emit when at least one Traslado has TipoFactor = "Tasa"
   *    - Value = sum of all Tasa group Importe values
   *    - Format to 6 decimal places
   *
   * 5. TotalImpuestosRetenidos:
   *    - Only emit when retenciones exist
   *    - Value = sum of all Retencion Importe values
   *
   * All arithmetic uses Decimal.js with ROUND_HALF_UP.
   * All output amounts formatted to 6 decimal places.
   */
}

export function formatDecimal6(value: Decimal | number | string): string {
  /**
   * Format a number to exactly 6 decimal places using Decimal.js.
   * Used for all amounts in Conceptos and Impuestos nodes.
   * e.g., 10000 → "10000.000000"
   *       0.16  → "0.160000"
   */
}

export function formatDecimal2(value: Decimal | number | string): string {
  /**
   * Format a number to exactly 2 decimal places using Decimal.js.
   * Used for SubTotal, Total, Descuento at Comprobante level.
   * e.g., 10000 → "10000.00"
   */
}
```

Write exhaustive tests in `src/__tests__/impuestos-aggregation.test.ts`:

```typescript
describe('aggregateImpuestos', () => {
  it('single item with 16% IVA', () => {
    // Input: [{type:'traslado', impuesto:'002', tipo_factor:'Tasa',
    //          tasa_o_cuota:'0.160000', base:'10000.000000', importe:'1600.000000'}]
    // Expected: traslados=[{base:'10000.000000', impuesto:'002',
    //           tipoFactor:'Tasa', tasaOCuota:'0.160000', importe:'1600.000000'}]
    //           totalImpuestosTrasladados: '1600.000000'
  });

  it('two items, same IVA rate — sums Base and Importe', () => {
    // Two items each with 16% IVA on base 5000 each
    // Expected: one Traslado row with base:'10000.000000', importe:'1600.000000'
  });

  it('two items, different IVA rates (16% and 8%) — separate rows', () => {
    // Expected: two Traslado rows, one per rate
    // TotalImpuestosTrasladados = sum of both
  });

  it('exempt item — includes Base, excludes TasaOCuota and Importe', () => {
    // Input: [{type:'traslado', tipo_factor:'Exento', impuesto:'002',
    //          base:'5000.000000', importe: undefined}]
    // Expected: traslados=[{base:'5000.000000', impuesto:'002',
    //                       tipoFactor:'Exento'}]  (no tasaOCuota, no importe)
    // TotalImpuestosTrasladados: undefined (all Exento, no Tasa rows)
  });

  it('all exempt — no TotalImpuestosTrasladados', () => {
    // Multiple items all Exento
    // totalImpuestosTrasladados should be undefined
  });

  it('ISR + IVA retentions', () => {
    // Input: retencion ISR 1000, retencion IVA 1067
    // Expected: two Retencion rows, TotalImpuestosRetenidos = '2067.000000'
  });

  it('mixed: traslado IVA + retencion ISR', () => {
    // Full professional services scenario
  });

  it('multiple items with ISR retention — sums correctly', () => {
    // Two items, each retaining 1000 ISR
    // Expected: single Retencion row with importe:'2000.000000'
  });

  it('uses Decimal.js arithmetic (no floating-point errors)', () => {
    // 3 items at base 333.333333 each = 999.999999, not 1000.000001
  });
});
```

---

### Step 4: XML Generator

**File: `packages/cfdi/src/generator.ts`**

```typescript
import { create } from 'xmlbuilder2';
import Decimal from 'decimal.js';
import { CFDI_NAMESPACE, XSI_NAMESPACE, CFDI_XSD_LOCATION, CFDI_VERSION } from './constants';
import { aggregateImpuestos, formatDecimal2, formatDecimal6 } from './impuestos-aggregation';

export function generateCFDI(input: CFDIGeneratorInput): CFDIGeneratorResult {
  /**
   * Generate a complete, valid CFDI 4.0 XML document.
   *
   * Returns xmlUnsigned (with Sello="" and Certificado="" placeholders)
   * and xml (same content — the actual Sello is added by Component 14).
   *
   * This function is the orchestrator that calls all buildX helpers below.
   */
}

export function buildComprobante(input: CFDIGeneratorInput): CFDIComprobante {
  /**
   * Map CFDIGeneratorInput → CFDIComprobante interface.
   * All field naming conversions happen here:
   *   invoice.issuer_postal_code → LugarExpedicion
   *   invoice.payment_method     → MetodoPago
   *   etc.
   *
   * Special cases:
   * - TipoDeComprobante=P: set Moneda='XXX', SubTotal='0', Total='0',
   *   omit FormaPago and MetodoPago
   * - is_global=true: populate InformacionGlobal
   * - related_cfdi: group by tipo_relacion into CfdiRelacionados[]
   * - invoice.stamps present: use certificate_number, certificate, seal
   * - invoice.stamps absent: use empty strings for Sello, NoCertificado, Certificado
   */
}

export function buildEmisor(input: CFDIGeneratorInput): CFDIEmisor {
  /**
   * Map issuer fields to CFDIEmisor.
   * Rfc = invoice.issuer_rfc
   * Nombre = invoice.issuer_name
   * RegimenFiscal = invoice.issuer_tax_regime
   */
}

export function buildReceptor(input: CFDIGeneratorInput): CFDIReceptor {
  /**
   * Map receiver fields to CFDIReceptor.
   * DomicilioFiscalReceptor = invoice.receiver_postal_code
   * RegimenFiscalReceptor = invoice.receiver_tax_regime
   * UsoCFDI = invoice.receiver_cfdi_use
   *
   * Special case:
   * - Rfc=XAXX010101000: force UsoCFDI='S01', RegimenFiscalReceptor='616'
   */
}

export function buildConceptos(items: CFDIItemInput[]): CFDIConcepto[] {
  /**
   * Map each invoice item to a CFDIConcepto.
   * Field mapping:
   *   item.product_service_key → ClaveProdServ
   *   item.unit_key            → ClaveUnidad
   *   item.description         → Descripcion
   *   item.quantity            → Cantidad (formatDecimal6)
   *   item.unit_price          → ValorUnitario (formatDecimal6)
   *   item.discount_amount > 0 → Descuento (formatDecimal6, else omit)
   *   item.sku present         → NoIdentificacion (else omit)
   *   item.tax_object          → ObjetoImp
   *
   * Importe = quantity * unit_price - discount_amount (Decimal.js, 6 places)
   *
   * Build cfdi:Impuestos child node from item.tax_breakdown:
   *   - tax_breakdown entries with type='traslado' → Traslados
   *   - tax_breakdown entries with type='retencion' → Retenciones
   *   - When ObjetoImp='01': no Impuestos child node
   *   - When TipoFactor='Exento': include Base only, omit TasaOCuota and Importe
   */
}

export function buildImpuestos(items: CFDIItemInput[]): CFDIImpuestos | undefined {
  /**
   * Build the Comprobante-level cfdi:Impuestos summary node.
   * Collect all tax_breakdown records from all items.
   * Call aggregateImpuestos() to compute grouped summaries.
   * Return undefined if no tax records exist (all items ObjetoImp='01').
   */
}

export function buildRelatedCFDI(
  related: Array<{ tipo_relacion: string; related_uuid: string }>,
): CFDICfdiRelacionados[] {
  /**
   * Group related CFDIs by tipo_relacion.
   * Multiple UUIDs with the same tipo_relacion → one CfdiRelacionados node
   * with multiple CfdiRelacionado children.
   */
}

export function formatXML(comprobante: CFDIComprobante): string {
  /**
   * Serialize CFDIComprobante → well-formed XML string using xmlbuilder2.
   *
   * Required output characteristics:
   * - XML declaration: <?xml version="1.0" encoding="UTF-8"?>
   * - Root element: <cfdi:Comprobante xmlns:cfdi="..." xmlns:xsi="..." xsi:schemaLocation="...">
   * - All attributes in the required SAT order (see spec above)
   * - Self-closing empty elements: <cfdi:Emisor ... />
   * - Conditional elements omitted (not empty-stringed) when not applicable
   * - Attribute values XML-escaped (xmlbuilder2 handles this automatically)
   *
   * xmlbuilder2 usage:
   * const doc = create({ version: '1.0', encoding: 'UTF-8' })
   *   .ele('cfdi:Comprobante', {
   *     'xmlns:cfdi': CFDI_NAMESPACE,
   *     'xmlns:xsi': XSI_NAMESPACE,
   *     'xsi:schemaLocation': `${CFDI_NAMESPACE} ${CFDI_XSD_LOCATION}`,
   *     Version: '4.0',
   *     // ...all attributes in order
   *   })
   *   // ...child elements
   *   .end({ headless: false, prettyPrint: false });
   */
}
```

Write tests in `src/__tests__/generator.test.ts`. **Use fixed test fixtures** — do not use random data in tests.

```typescript
// Fixture: standard professional services invoice
const FIXTURE_PROFESSIONAL_SERVICE: CFDIGeneratorInput = {
  invoice: {
    id: 'inv-001',
    serie: 'A',
    folio: '00000001',
    issue_date: '2024-03-01T10:00:00',
    tipo_comprobante: 'I',
    payment_method: 'PUE',
    payment_form: '03',
    currency: 'MXN',
    exchange_rate: 1,
    exportacion: '01',
    subtotal: 10000,
    discount: 0,
    total: 11600,
    issuer_rfc: 'EKU9003173C9',
    issuer_name: 'ESCUELA KEMPER URGATE',
    issuer_tax_regime: '601',
    issuer_postal_code: '26015',
    receiver_rfc: 'URE180429TM6',
    receiver_name: 'UNIVERSIDAD ROBOTICA ESPAÑOLA',
    receiver_tax_regime: '601',
    receiver_postal_code: '65000',
    receiver_cfdi_use: 'G01',
    is_global: false,
    items: [{
      product_service_key: '81112100',
      unit_key: 'E48',
      unit_name: 'Hora',
      description: 'Servicio de consultoría',
      quantity: 1,
      unit_price: 10000,
      discount_amount: 0,
      tax_object: '02',
      tax_breakdown: [{
        type: 'traslado',
        impuesto: '002',
        tipo_factor: 'Tasa',
        tasa_o_cuota: '0.160000',
        base: '10000.000000',
        importe: '1600.000000',
      }],
    }],
  },
};

describe('generateCFDI', () => {
  it('produces valid XML declaration with UTF-8 uppercase encoding', () => {
    const { xml } = generateCFDI(FIXTURE_PROFESSIONAL_SERVICE);
    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(xml).not.toContain('encoding="utf-8"');  // Must be uppercase
  });

  it('uses correct cfdi namespace and version 4.0', () => {
    const { xml } = generateCFDI(FIXTURE_PROFESSIONAL_SERVICE);
    expect(xml).toContain('xmlns:cfdi="http://www.sat.gob.mx/cfd/4"');
    expect(xml).toContain('Version="4.0"');
  });

  it('includes DomicilioFiscalReceptor (required in CFDI 4.0)', () => {
    const { xml } = generateCFDI(FIXTURE_PROFESSIONAL_SERVICE);
    expect(xml).toContain('DomicilioFiscalReceptor="65000"');
  });

  it('includes RegimenFiscalReceptor (required in CFDI 4.0)', () => {
    const { xml } = generateCFDI(FIXTURE_PROFESSIONAL_SERVICE);
    expect(xml).toContain('RegimenFiscalReceptor="601"');
  });

  it('omits Descuento attribute when discount is zero', () => {
    const { xml } = generateCFDI(FIXTURE_PROFESSIONAL_SERVICE);
    expect(xml).not.toContain('Descuento=');
  });

  it('includes Descuento attribute when discount is non-zero', () => {
    const input = { ...FIXTURE_PROFESSIONAL_SERVICE,
      invoice: { ...FIXTURE_PROFESSIONAL_SERVICE.invoice,
        discount: 500,
        items: [{ ...FIXTURE_PROFESSIONAL_SERVICE.invoice.items[0],
          discount_amount: 500 }]
      }
    };
    const { xml } = generateCFDI(input);
    expect(xml).toContain('Descuento=');
  });

  it('formats SubTotal and Total to 2 decimal places', () => {
    const { xml } = generateCFDI(FIXTURE_PROFESSIONAL_SERVICE);
    expect(xml).toContain('SubTotal="10000.00"');
    expect(xml).toContain('Total="11600.00"');
  });

  it('formats Cantidad and ValorUnitario to 6 decimal places', () => {
    const { xml } = generateCFDI(FIXTURE_PROFESSIONAL_SERVICE);
    expect(xml).toContain('Cantidad="1.000000"');
    expect(xml).toContain('ValorUnitario="10000.000000"');
  });

  it('formats TasaOCuota to exactly 6 decimal places', () => {
    const { xml } = generateCFDI(FIXTURE_PROFESSIONAL_SERVICE);
    expect(xml).toContain('TasaOCuota="0.160000"');
  });

  it('uses empty strings for Sello and Certificado before signing', () => {
    const { xml } = generateCFDI(FIXTURE_PROFESSIONAL_SERVICE);
    expect(xml).toContain('Sello=""');
    expect(xml).toContain('Certificado=""');
  });

  it('forces UsoCFDI=S01 and RegimenFiscalReceptor=616 for XAXX RFC', () => {
    const input = { ...FIXTURE_PROFESSIONAL_SERVICE,
      invoice: { ...FIXTURE_PROFESSIONAL_SERVICE.invoice,
        receiver_rfc: 'XAXX010101000',
        receiver_cfdi_use: 'G01', // should be overridden
        receiver_tax_regime: '612', // should be overridden
      }
    };
    const { xml } = generateCFDI(input);
    expect(xml).toContain('UsoCFDI="S01"');
    expect(xml).toContain('RegimenFiscalReceptor="616"');
  });

  it('includes CfdiRelacionados when related_cfdi provided', () => {
    const input = { ...FIXTURE_PROFESSIONAL_SERVICE,
      invoice: { ...FIXTURE_PROFESSIONAL_SERVICE.invoice,
        related_cfdi: [{ tipo_relacion: '04', related_uuid: 'AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE' }]
      }
    };
    const { xml } = generateCFDI(input);
    expect(xml).toContain('TipoRelacion="04"');
    expect(xml).toContain('UUID="AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE"');
  });

  it('groups multiple related CFDIs by TipoRelacion', () => {
    // Two related CFDIs with same TipoRelacion → one CfdiRelacionados node with 2 children
  });

  it('TipoDeComprobante=P uses Moneda=XXX, SubTotal=0, Total=0, omits MetodoPago', () => {
    // Payment complement special rules
  });

  it('ObjetoImp=01 items have no cfdi:Impuestos child', () => {
    // Non-taxed items must not have Impuestos node
  });

  it('Exento items omit TasaOCuota and Importe at concept level', () => {
    // Exempt items in concept Impuestos node
  });
});
```

---

### Step 5: Cadena Original

**File: `packages/cfdi/src/cadena-original.ts`**

```typescript
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

// Bundled XSLT file path (downloaded at build time)
const XSLT_PATH = path.join(__dirname, 'xslt', 'cadenaoriginal_4_0.xslt');

export async function generateCadenaOriginal(
  xml: string,
): Promise<CadenaOriginalResult> {
  /**
   * Generate the cadena original for a CFDI XML document.
   *
   * Steps:
   * 1. Read the bundled XSLT file from disk
   * 2. Apply XSLT transformation to the XML string using xslt3/saxon-js
   * 3. The result is the cadena original string (pipe-delimited)
   * 4. Compute SHA-256 hash of the cadena string (UTF-8 encoded)
   *    SHA-256 is used by Component 14 for signing
   * 5. Return { cadena, sha256 }
   *
   * XSLT processing using xslt3:
   *   import SaxonJS from 'xslt3';
   *   const result = SaxonJS.XPath.evaluate(
   *     `transform(map{
   *       'source-node': doc(...),
   *       'stylesheet-location': xsltPath,
   *       'delivery-format': 'serialized'
   *     })('output')`,
   *     null,
   *     { params: { ... } }
   *   );
   *
   * Or use the command-line wrapper approach via child_process exec:
   *   xsltproc cadenaoriginal_4_0.xslt invoice.xml
   * (xsltproc is available in Linux environments and Docker)
   *
   * Prefer programmatic SaxonJS for reliability in serverless/Docker.
   * Fall back to xsltproc exec if SaxonJS fails.
   * If both fail: throw CFDIXSLTError with details.
   *
   * The cadena must start with '||' and end with '||' after trimming.
   * If it doesn't, the XSLT transform failed silently — throw an error.
   */
}

export function computeSHA256(text: string): string {
  /**
   * Compute SHA-256 hash of a UTF-8 string.
   * Returns hex digest (lowercase).
   * Used by Component 14 to sign the cadena original.
   *
   * Node.js crypto:
   * crypto.createHash('sha256').update(text, 'utf8').digest('hex')
   */
}

export function validateCadena(cadena: string): boolean {
  /**
   * Quick sanity check on the cadena original format.
   * Must start with '||' and end with '||'.
   * Must contain at least one '|' separator.
   * Returns false if format is invalid.
   */
}

// XSLT download script (packages/cfdi/scripts/download-xslt.ts)
// Downloads the SAT XSLT files required for cadena original generation.
// Run via: npm run download-xslt
// Saves to packages/cfdi/src/xslt/cadenaoriginal_4_0.xslt
```

**File: `packages/cfdi/scripts/download-xslt.ts`**

```typescript
/**
 * Downloads the SAT XSLT files for cadena original generation.
 * Run: npm run download-xslt (from packages/cfdi directory)
 *
 * SAT XSLT URLs:
 * - CFDI 4.0: http://www.sat.gob.mx/sitio_internet/cfd/4/cadenaoriginal_4_0/cadenaoriginal_4_0.xslt
 * - TFD 1.1:  http://www.sat.gob.mx/sitio_internet/cfd/TimbreFiscalDigital/cadenaoriginal_TFD_1_1.xslt
 *
 * Downloads to: packages/cfdi/src/xslt/
 * Creates the directory if it doesn't exist.
 * Verifies download was successful (non-empty file, contains 'xsl:stylesheet').
 * Prints success/failure message.
 */
```

Write tests in `src/__tests__/cadena-original.test.ts`:

```typescript
describe('generateCadenaOriginal', () => {
  it('produces a pipe-delimited string starting with ||', async () => {
    // Use FIXTURE_PROFESSIONAL_SERVICE XML
    const { xml } = generateCFDI(FIXTURE_PROFESSIONAL_SERVICE);
    const result = await generateCadenaOriginal(xml);
    expect(result.cadena).toMatch(/^\|\|/);
    expect(result.cadena).toMatch(/\|\|$/);
  });

  it('includes invoice fields in the cadena', async () => {
    const { xml } = generateCFDI(FIXTURE_PROFESSIONAL_SERVICE);
    const result = await generateCadenaOriginal(xml);
    // RFC should appear in the cadena
    expect(result.cadena).toContain('EKU9003173C9');
    expect(result.cadena).toContain('URE180429TM6');
  });

  it('sha256 is a valid 64-char hex string', async () => {
    const { xml } = generateCFDI(FIXTURE_PROFESSIONAL_SERVICE);
    const result = await generateCadenaOriginal(xml);
    expect(result.sha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it('same XML always produces same cadena (deterministic)', async () => {
    const { xml } = generateCFDI(FIXTURE_PROFESSIONAL_SERVICE);
    const r1 = await generateCadenaOriginal(xml);
    const r2 = await generateCadenaOriginal(xml);
    expect(r1.cadena).toBe(r2.cadena);
    expect(r1.sha256).toBe(r2.sha256);
  });
});

describe('computeSHA256', () => {
  it('computes correct SHA-256 for known input', () => {
    // Known vector:
    // input: "hello"
    // expected SHA-256: 2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824
    expect(computeSHA256('hello')).toBe('2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824');
  });
});
```

> **Note on XSLT in tests:** Mark cadena original tests that require the actual XSLT file as `@integration` (e.g., `it.skipIf(!xsltExists)(...)`) so tests can run without the downloaded XSLT in CI. The XSLT download script handles the setup step. Unit tests for `computeSHA256` and `validateCadena` must always run.

---

### Step 6: Validation

**File: `packages/cfdi/src/validation.ts`**

This validator operates on the already-generated XML string (or the CFDIComprobante object), performing pre-PAC checks.

```typescript
export function validateCFDI(xmlOrObject: string | CFDIComprobante): CFDIValidationResult {
  /**
   * Run all CFDI 4.0 validation checks.
   * Orchestrates the validators below.
   * Collects all errors and warnings — does NOT short-circuit on first error.
   */
}

export function validateStructure(comprobante: CFDIComprobante): CFDIValidationError[] {
  /**
   * Validate required fields are present and non-empty:
   * - Version = "4.0"
   * - Fecha: valid ISO datetime format, not in the future, not > 72h old
   * - LugarExpedicion: 5-digit zip code
   * - Emisor.Rfc: valid RFC format (12-13 chars, correct character classes)
   * - Emisor.RegimenFiscal: 3-digit code
   * - Receptor.DomicilioFiscalReceptor: 5-digit zip code
   * - Receptor.RegimenFiscalReceptor: 3-digit code
   * - Conceptos: at least one item
   * - Each Concepto: required fields present
   * - SubTotal ≥ 0 (no negative values in CFDI 4.0)
   * - Total ≥ 0
   */
}

export function validateAmounts(comprobante: CFDIComprobante): CFDIValidationError[] {
  /**
   * Verify mathematical consistency:
   * - SubTotal = sum of all Concepto.Importe values
   *   (sum of quantity * unit_price - discount per item)
   * - Total = SubTotal - Descuento + TotalImpuestosTrasladados
   *           - TotalImpuestosRetenidos
   * - TotalImpuestosTrasladados matches sum of Traslado.Importe in Impuestos node
   * - TotalImpuestosRetenidos matches sum of Retencion.Importe in Impuestos node
   * - Allow tolerance of 0.01 (1 cent) for rounding differences
   * - All values ≥ 0 (no negatives allowed in CFDI 4.0)
   */
}

export function validateDates(comprobante: CFDIComprobante): CFDIValidationError[] {
  /**
   * Date validation rules:
   * - Fecha must be in format "YYYY-MM-DDTHH:MM:SS" (ISO 8601, no timezone)
   * - Fecha must not be more than 72 hours in the past (SAT 72-hour rule)
   * - Fecha must not be in the future
   * - Return error code "CFDI001" for each date violation
   */
}

export function validateCatalogs(comprobante: CFDIComprobante): CFDIValidationError[] {
  /**
   * Validate values against SAT catalog constraints.
   * These are runtime checks (not XSD schema checks) against known valid values.
   *
   * Checks:
   * - TipoDeComprobante ∈ {'I','E','T','P'}
   * - Exportacion ∈ {'01','02','03','04'}
   * - MetodoPago ∈ {'PUE','PPD'} (if present)
   * - FormaPago: 2-digit string, known SAT payment codes (01-31, 99)
   * - Moneda: valid ISO 4217 code (MXN, USD, EUR, CAD at minimum)
   * - ObjetoImp ∈ {'01','02','03'}
   * - Impuesto ∈ {'001','002','003'}
   * - TipoFactor ∈ {'Tasa','Cuota','Exento'}
   * - Emisor.RegimenFiscal: must be a known SAT regime code (3 digits)
   * - Receptor.UsoCFDI: 3-character code from SAT c_UsoCFDI catalog
   * - Each Concepto.ClaveProdServ: 8 digits, numeric
   * - Each Concepto.ClaveUnidad: 1-10 alphanumeric characters
   *
   * Note: Do not validate against the full 55,000-entry SAT catalog here —
   * that is handled by Component 08 (Product Service). Only format validation.
   */
}

export function validateImpuestosAggregation(comprobante: CFDIComprobante): CFDIValidationError[] {
  /**
   * Validate that the Comprobante-level Impuestos node correctly aggregates
   * all Concepto-level tax values.
   *
   * Re-run aggregateImpuestos() on the Concepto Impuestos data and compare
   * to the declared Comprobante-level Impuestos. Any mismatch is an error.
   */
}
```

Write tests in `src/__tests__/validation.test.ts`:
- Test `validateStructure` returns error for missing `DomicilioFiscalReceptor`
- Test `validateStructure` returns error for invoice dated > 72 hours ago
- Test `validateAmounts` returns error when Total does not match calculated total
- Test `validateAmounts` allows 1-cent tolerance
- Test `validateCatalogs` rejects `TipoDeComprobante = "X"` (invalid)
- Test `validateCatalogs` rejects `Exportacion = "05"` (invalid)
- Test `validateCatalogs` accepts all four valid `TipoDeComprobante` values
- Test `validateImpuestosAggregation` catches mismatched summary totals
- Test complete valid CFDI passes all validations

---

### Step 7: Pagos 2.0 Complement

**File: `packages/cfdi/src/complements/pagos.ts`**

This file lays the groundwork for Component 18 (Payment Complement). Implement the data structures and basic XML generation — full payment complement validation is out of scope for this component.

```typescript
/**
 * Complemento de Pagos 2.0 (Recibo Electrónico de Pagos)
 *
 * Namespace: http://www.sat.gob.mx/Pagos20
 * XSD: http://www.sat.gob.mx/sitio_internet/cfd/Pagos/Pagos20.xsd
 *
 * Used when a PPD invoice (MetodoPago=PPD) receives payment.
 * The payment complement is a SEPARATE CFDI (TipoDeComprobante=P)
 * that references the original PPD invoice.
 */

export interface Pagos20Input {
  version: '2.0';
  // TotalesP — required summary at Pagos level
  totalRetencionesIVA?: string;
  totalRetencionesISR?: string;
  totalRetencionesIEPS?: string;
  totalTrasladosBaseIVA16?: string;
  totalTrasladosImpuestoIVA16?: string;
  totalTrasladosBaseIVA8?: string;
  totalTrasladosImpuestoIVA8?: string;
  totalTrasladosBaseIVA0?: string;
  totalTrasladosImpuestoIVA0?: string;
  totalTrasladosBaseIVAExento?: string;
  montoTotalPagos: string;
  payments: Pagos20Pago[];
}

export interface Pagos20Pago {
  fechaPago: string;           // ISO datetime
  formaDePagoP: string;        // FormaPago code (not 99)
  monedaP: string;             // Currency of the payment
  tipoCambioP?: string;        // Exchange rate if not MXN
  monto: string;               // Payment amount
  numOperacion?: string;       // Bank operation number
  rfcEmisorCtaOrd?: string;    // Payer bank RFC
  nomBancoOrdExt?: string;     // Payer bank name (for foreign banks)
  ctaOrdenante?: string;       // Payer account
  rfcEmisorCtaBen?: string;    // Beneficiary bank RFC
  ctaBeneficiario?: string;    // Beneficiary account
  tipoCadenaPago?: string;     // SPEI chain type
  certPago?: string;           // Certificate
  cadPago?: string;            // Payment chain
  selloPago?: string;          // Payment seal
  documentosRelacionados: Pagos20DoctoRelacionado[];
  impuestosP?: Pagos20ImpuestosP;
}

export interface Pagos20DoctoRelacionado {
  idDocumento: string;         // UUID of the original invoice (PPD)
  serie?: string;
  folio?: string;
  monedaDR: string;            // Currency of the original invoice
  equivalenciaDR: string;      // Exchange rate between payment and invoice currencies
  numParcialidad: string;      // Payment installment number ("1" for first)
  impSaldoAnt: string;         // Previous balance
  impPagado: string;           // Amount paid with this payment
  impSaldoInsoluto: string;    // Remaining balance after payment
  objetoImpDR: string;         // '01' | '02' | '03'
  impuestosDR?: Pagos20ImpuestosDR;
}

export interface Pagos20ImpuestosP {
  retencionesp?: Array<{ impuestoP: string; importeP: string }>;
  trasladosp?: Array<{
    baseP: string;
    impuestoP: string;
    tipoFactorP: string;
    tasaOCuotaP?: string;
    importeP?: string;
  }>;
}

export interface Pagos20ImpuestosDR {
  retencionesDR?: Array<{
    baseDR: string;
    impuestoDR: string;
    tipoFactorDR: string;
    tasaOCuotaDR?: string;
    importeDR?: string;
  }>;
  trasladosDR?: Array<{
    baseDR: string;
    impuestoDR: string;
    tipoFactorDR: string;
    tasaOCuotaDR?: string;
    importeDR?: string;
  }>;
}

export function buildPagos20Complement(input: Pagos20Input): string {
  /**
   * Generate the cfdi:Complemento XML fragment containing Pagos 2.0.
   *
   * The root Comprobante for a payment CFDI must have:
   * - TipoDeComprobante="P"
   * - Moneda="XXX"
   * - SubTotal="0"
   * - Total="0"
   * - Exportacion="01"
   * - One Concepto with ClaveProdServ="84111506", ClaveUnidad="ACT",
   *   Descripcion="Pago", ValorUnitario="0", Importe="0", ObjetoImp="01"
   *
   * The <cfdi:Complemento> node contains:
   * <pago20:Pagos Version="2.0"
   *   xmlns:pago20="http://www.sat.gob.mx/Pagos20">
   *   <pago20:Totales .../>
   *   <pago20:Pago ...>
   *     <pago20:DoctoRelacionado .../>
   *     <pago20:ImpuestosP>...</pago20:ImpuestosP>
   *   </pago20:Pago>
   * </pago20:Pagos>
   *
   * Note: This function generates the complement XML fragment only.
   * The caller (Component 18) wraps it in the full Comprobante.
   */
}
```

Write basic tests in `src/__tests__/complements/pagos.test.ts`:
- Test `buildPagos20Complement` produces `pago20:` prefixed elements
- Test `buildPagos20Complement` includes `xmlns:pago20` namespace
- Test `buildPagos20Complement` includes `Totales` node
- Test DoctoRelacionado fields are correctly mapped

---

### Step 8: Public API and Integration with `apps/web`

**File: `packages/cfdi/src/index.ts`**

```typescript
// Public API of the @repo/cfdi package
export { generateCFDI, buildComprobante, formatXML } from './generator';
export { generateCadenaOriginal, computeSHA256 } from './cadena-original';
export { validateCFDI } from './validation';
export { buildPagos20Complement } from './complements/pagos';
export { aggregateImpuestos } from './impuestos-aggregation';

// Types
export type {
  CFDIGeneratorInput,
  CFDIGeneratorResult,
  CFDIComprobante,
  CadenaOriginalResult,
  CFDIValidationResult,
  CFDIItemInput,
  Pagos20Input,
} from './types';

// Constants
export {
  CFDI_NAMESPACE,
  PAGOS20_NAMESPACE,
  TFD_NAMESPACE,
  RFC_PUBLICO_GENERAL,
  RFC_EXTRANJERO,
} from './constants';
```

**Integration bridge in `apps/web`:**

Create `apps/web/lib/invoices/cfdi-bridge.ts` — a thin adapter that converts Component 12's `Invoice` and `InvoiceItem` types to `CFDIGeneratorInput`:

```typescript
// apps/web/lib/invoices/cfdi-bridge.ts
import { generateCFDI, generateCadenaOriginal, validateCFDI } from '@repo/cfdi';
import type { Invoice } from './types';

export async function generateCFDIFromInvoice(invoice: Invoice): Promise<{
  xml: string;
  cadenaOriginal: string;
  sha256: string;
  validationResult: { valid: boolean; errors: string[] };
}> {
  /**
   * Bridge between Component 12's Invoice type and packages/cfdi's
   * CFDIGeneratorInput type.
   *
   * Column name mapping (Component 12 actual names → CFDI input):
   *   invoice.issuer_postal_code  → issuer_postal_code
   *   invoice.receiver_postal_code → receiver_postal_code
   *   item.product_service_key    → product_service_key
   *   item.unit_key               → unit_key
   *   item.tax_breakdown (JSONB)  → tax_breakdown
   *
   * Steps:
   * 1. Map Invoice → CFDIGeneratorInput
   * 2. Call generateCFDI(input) → { xml }
   * 3. Call validateCFDI(xml) — return errors if invalid
   * 4. Call generateCadenaOriginal(xml) → { cadena, sha256 }
   * 5. Return all outputs
   */
}
```

Write integration tests in `apps/web/lib/invoices/__tests__/cfdi-bridge.test.ts`:
- Test bridge correctly maps `product_service_key` → `ClaveProdServ` in output XML
- Test bridge correctly maps `receiver_postal_code` → `DomicilioFiscalReceptor`
- Test bridge passes tax_breakdown JSONB directly to generator
- Test bridge returns validation errors for incomplete invoice
- Test complete invoice produces XML with all required CFDI 4.0 fields

---

## 🔑 KEY TECHNICAL DECISIONS

**Why `xmlbuilder2` over `xml2js` / `fast-xml-parser`:**
`xml2js` is a parser-first library — generating attribute-ordered, namespace-aware XML with it requires fighting the library. `fast-xml-parser` has weak namespace generation support. `xmlbuilder2` is the correct tool for generating XML programmatically with precise attribute ordering.

**Why bundle the XSLT locally instead of fetching at runtime:**
SAT updates XSLT files without versioning — fetching at runtime in production introduces a live dependency on SAT's server availability. The bundled XSLT approach (with a `download-xslt` script) gives reproducible builds. The download script ensures the latest version is captured at deployment time.

**Why the cadena original must use the actual XSLT (not manual implementation):**
The XSLT normalization rules for whitespace, attribute ordering, and field inclusion are specified precisely by SAT. Any manual reimplementation will diverge and produce invalid signatures. Always use the actual SAT XSLT via XSLT processing.

**Why `packages/cfdi/` is a separate package (not in `apps/web/lib/`):**
The CFDI XML generator has zero runtime dependencies on the database, authentication, or Next.js. Making it a standalone package enables: (a) testing in isolation, (b) potential reuse in the Python AI service, (c) clear separation between XML generation and business logic.

**Why `CFDIGeneratorInput` uses the exact column names from Component 12:**
The bridge (`cfdi-bridge.ts`) is a thin adapter. If the CFDI package invented its own names (e.g., `zip_code` instead of `postal_code`), every mapping would require documentation. By naming the input type fields identically to Component 12's database columns, the bridge becomes near-trivial.

**Decimal formatting precision:**
- Comprobante-level `SubTotal`, `Total`, `Descuento`: 2 decimal places (SAT spec)
- Concepto-level `Cantidad`, `ValorUnitario`, `Importe`, tax `Base`, `Importe`: 6 decimal places (SAT spec allows up to 6)
- `TasaOCuota`: exactly 6 decimal places always

---

## 🧪 TESTING REQUIREMENTS

**Coverage targets:**
- `packages/cfdi/src/impuestos-aggregation.ts` → ≥ 95% — the most critical calculation logic
- `packages/cfdi/src/generator.ts` → ≥ 90%
- `packages/cfdi/src/validation.ts` → ≥ 90%
- `packages/cfdi/src/cadena-original.ts` → ≥ 80% (some tests gated behind XSLT file presence)
- `packages/cfdi/src/complements/pagos.ts` → ≥ 80%
- `apps/web/lib/invoices/cfdi-bridge.ts` → ≥ 85%

**Test fixtures:**
All tests must use fixed, deterministic test data. Never use `new Date()` or random values in test fixtures — hardcode `issue_date: '2024-03-01T10:00:00'` and adjust the 72-hour validation check to accept test dates.

Provide a `packages/cfdi/src/__tests__/fixtures.ts` file with reusable test data:
- `FIXTURE_INGRESO_SIMPLE` — one item, 16% IVA, PUE
- `FIXTURE_INGRESO_RETENCIONES` — professional services with IVA + ISR retention
- `FIXTURE_INGRESO_EXENTO` — exempt item (tax_object=01)
- `FIXTURE_EGRESO` — credit note referencing related CFDI
- `FIXTURE_PUBLICO_GENERAL` — invoice with RFC XAXX010101000
- `FIXTURE_MULTITAX` — two items with different IVA rates (16% and 8%)

Run all tests:
```bash
# From monorepo root
cd packages/cfdi && npm test

# Integration tests (requires XSLT file)
cd packages/cfdi && npm run download-xslt && npm test

# Bridge tests
cd apps/web && npm test lib/invoices/__tests__/cfdi-bridge
```

---

## 📝 COMPLETION SUMMARY REQUIREMENT

Write a **Completion Summary** at the end of your response with:

**1. What Was Built** — every file created/modified with one-line description.

**2. Package Architecture** — diagram showing `packages/cfdi` → `apps/web` dependency.

**3. XML Generation Examples** — show actual generated XML output for:
  - Standard Ingreso invoice (single item, 16% IVA)
  - Invoice with IVA + ISR retention
  - Invoice with Exento item

**4. Cadena Original Implementation** — describe the XSLT approach taken (SaxonJS vs xsltproc), how fallback is handled, and how `download-xslt` works.

**5. Impuestos Aggregation Logic** — describe the grouping key formula and Exento edge case handling.

**6. Field Mapping Table** — complete table mapping Component 12 Invoice column names → CFDI XML attribute names.

**7. Test Coverage** — test file list with test count and coverage achieved per file.

**8. Integration Contract for Downstream Components**:
   - Component 14 (Digital Signature): receives `sha256` from `generateCadenaOriginal()`, signs it, calls `formatXML()` with populated `Sello`/`Certificado`
   - Component 15 (PAC): receives the fully signed XML string, submits to PAC SOAP service
   - Component 18 (Payment Complement): calls `buildPagos20Complement()` to generate payment CFDI

**9. Known Limitations** — e.g., Comercio Exterior complement stub only, no actual XSD schema validation (structural only), XSLT requires file download step.

**10. How to Test Manually** — step-by-step to generate an XML, inspect it, run cadena original.

---

## ✅ DEFINITION OF DONE

- [ ] `packages/cfdi/` package exists and is linked in `apps/web/package.json` as `@repo/cfdi`
- [ ] `xmlbuilder2` used for XML generation (no manual string concatenation)
- [ ] XML declaration uses `encoding="UTF-8"` (uppercase — PAC requirement)
- [ ] `DomicilioFiscalReceptor` and `RegimenFiscalReceptor` present in all generated XML (CFDI 4.0 required)
- [ ] Impuestos aggregation groups by `(Impuesto, TipoFactor, TasaOCuota)` for Traslados
- [ ] Exento items: `TasaOCuota` and `Importe` omitted from Traslado nodes
- [ ] All numeric formatting uses Decimal.js (no native float arithmetic)
- [ ] Comprobante-level amounts formatted to 2 decimal places
- [ ] Concepto-level amounts formatted to 6 decimal places
- [ ] `TasaOCuota` formatted to exactly 6 decimal places
- [ ] `XAXX010101000` RFC forces `UsoCFDI=S01` and `RegimenFiscalReceptor=616`
- [ ] `packages/cfdi/scripts/download-xslt.ts` downloads XSLT and saves to `src/xslt/`
- [ ] `generateCadenaOriginal` applies actual SAT XSLT (not manual reconstruction)
- [ ] `computeSHA256` passes known SHA-256 test vector
- [ ] `cfdi-bridge.ts` correctly maps Component 12 column names to `CFDIGeneratorInput`
- [ ] All test fixtures are static/deterministic (no `new Date()`)
- [ ] All unit tests pass: `npm test` from `packages/cfdi/`
- [ ] Coverage targets met
- [ ] Completion Summary written
