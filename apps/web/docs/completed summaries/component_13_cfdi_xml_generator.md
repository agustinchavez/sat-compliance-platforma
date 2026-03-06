# Component 13: CFDI XML Generator - Completion Summary

## Overview

Component 13 implements the CFDI 4.0 XML Generator as a standalone TypeScript package (`@repo/cfdi`) in the Turborepo monorepo. This package generates valid CFDI 4.0 XML documents from Component 12's Invoice data model. It is pure TypeScript with no runtime database access — it takes data objects as input and returns XML strings.

The package handles the most technically complex aspects of CFDI compliance: tax aggregation per SAT's Anexo 20 rules, XML generation with proper namespace handling, cadena original generation via XSLT transformation, and pre-PAC validation.

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                        packages/cfdi/                                │
│  ┌─────────────────────────────────────────────────────────────────┐│
│  │                        src/index.ts                              ││
│  │              (Public API - all exports)                          ││
│  └────────────────────────────┬────────────────────────────────────┘│
│                               │                                      │
│  ┌────────────┬───────────────┼───────────────┬────────────────────┐│
│  │            │               │               │                    ││
│  ▼            ▼               ▼               ▼                    ▼│
│ ┌──────────┐┌──────────────┐┌────────────┐┌────────────┐┌─────────┐│
│ │generator.││impuestos-    ││cadena-     ││validation. ││complements││
│ │ts        ││aggregation.ts││original.ts ││ts          ││/pagos.ts ││
│ │(XML)     ││(Tax Math)    ││(XSLT+Hash) ││(Pre-PAC)   ││(Pagos20) ││
│ └────┬─────┘└──────┬───────┘└─────┬──────┘└─────┬──────┘└────┬────┘│
│      │             │              │             │            │      │
│      └─────────────┴──────────────┴─────────────┴────────────┘      │
│                               │                                      │
│                    ┌──────────┴──────────┐                          │
│                    │   types.ts          │                          │
│                    │   constants.ts      │                          │
│                    └─────────────────────┘                          │
└──────────────────────────────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│                        apps/web/                                     │
│  ┌─────────────────────────────────────────────────────────────────┐│
│  │              lib/invoices/cfdi-bridge.ts                         ││
│  │    (Adapter: Invoice → CFDIGeneratorInput)                       ││
│  └─────────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────────┘
```

## Files Created/Modified

### Package Structure (packages/cfdi/)

| File | Purpose |
|------|---------|
| `package.json` | Package configuration with xmlbuilder2, decimal.js, saxon-js |
| `tsconfig.json` | TypeScript configuration extending monorepo base |
| `vitest.config.ts` | Vitest test configuration |

### Core Modules (packages/cfdi/src/)

| File | Purpose |
|------|---------|
| `index.ts` | Public API exports for all functions, types, and constants |
| `types.ts` | TypeScript interfaces matching CFDI 4.0 XSD structure |
| `constants.ts` | SAT namespaces, tax codes, catalog values |
| `impuestos-aggregation.ts` | Tax aggregation logic per SAT Anexo 20 rules |
| `generator.ts` | XML generation using xmlbuilder2 |
| `cadena-original.ts` | XSLT transformation and SHA-256 hashing |
| `validation.ts` | Pre-PAC validation checks |
| `complements/pagos.ts` | Pagos 2.0 complement XML generation |

### Scripts (packages/cfdi/scripts/)

| File | Purpose |
|------|---------|
| `download-xslt.ts` | Downloads SAT XSLT files for cadena original |

### Test Files (packages/cfdi/src/__tests__/)

| File | Tests | Purpose |
|------|-------|---------|
| `fixtures.ts` | - | 12 reusable test fixtures |
| `constants.test.ts` | 33 | Namespace URIs, catalog values |
| `impuestos-aggregation.test.ts` | 31 | Tax grouping, decimal formatting |
| `generator.test.ts` | 53 | XML generation, all CFDI scenarios |
| `cadena-original.test.ts` | 24 | SHA-256, XSLT integration (6 skipped) |
| `validation.test.ts` | 35 | Structure, amounts, dates, catalogs |
| `complements/pagos.test.ts` | 25 | Pagos 2.0 XML generation |

### Integration Bridge (apps/web/lib/invoices/)

| File | Purpose |
|------|---------|
| `cfdi-bridge.ts` | Adapter from Invoice to CFDIGeneratorInput |
| `__tests__/cfdi-bridge.test.ts` | 27 tests for bridge mapping |

**Total: 222 tests (201 in package + 6 skipped + 27 in bridge)**

## Key Features

### 1. Tax Aggregation (SAT Anexo 20 Compliant)

The most technically complex part of CFDI generation. Implements SAT's precise grouping rules:

```typescript
// Traslados grouped by (Impuesto, TipoFactor, TasaOCuota)
// Retenciones grouped by (Impuesto) only

export function aggregateImpuestos(taxRecords: TaxRecord[]): AggregatedImpuestos {
  // Group traslados by composite key
  const trasladoGroups = new Map<string, { base: Decimal; importe: Decimal }>();

  for (const record of taxRecords.filter(r => r.type === 'traslado')) {
    const key = `${record.impuesto}|${record.tipo_factor}|${record.tasa_o_cuota ?? ''}`;
    // Sum Base and Importe per group using Decimal.js
  }

  // Retenciones grouped by Impuesto only
  const retencionGroups = new Map<string, Decimal>();
  // ...
}
```

### 2. XML Generation (xmlbuilder2)

Generates namespace-aware XML with proper attribute ordering:

```typescript
import { create } from 'xmlbuilder2';

export function generateCFDI(input: CFDIGeneratorInput): CFDIGeneratorResult {
  const comprobante = buildComprobante(input);
  const xml = formatXML(comprobante);

  return {
    xml,
    xmlUnsigned: xml, // Identical before signing
  };
}
```

**Output Structure:**
```xml
<?xml version="1.0" encoding="UTF-8"?>
<cfdi:Comprobante
  xmlns:cfdi="http://www.sat.gob.mx/cfd/4"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xsi:schemaLocation="http://www.sat.gob.mx/cfd/4 http://www.sat.gob.mx/sitio_internet/cfd/4/cfdv40.xsd"
  Version="4.0"
  Serie="A"
  Folio="000001"
  Fecha="2024-03-01T10:00:00"
  ...>
  <cfdi:Emisor Rfc="EKU9003173C9" Nombre="ESCUELA KEMPER URGATE" RegimenFiscal="601"/>
  <cfdi:Receptor Rfc="URE180429TM6" ... UsoCFDI="G01"/>
  <cfdi:Conceptos>
    <cfdi:Concepto ClaveProdServ="81112100" ... ObjetoImp="02">
      <cfdi:Impuestos>
        <cfdi:Traslados>
          <cfdi:Traslado Base="10000.000000" Impuesto="002" TipoFactor="Tasa" TasaOCuota="0.160000" Importe="1600.000000"/>
        </cfdi:Traslados>
      </cfdi:Impuestos>
    </cfdi:Concepto>
  </cfdi:Conceptos>
  <cfdi:Impuestos TotalImpuestosTrasladados="1600.000000">
    <cfdi:Traslados>
      <cfdi:Traslado Base="10000.000000" Impuesto="002" TipoFactor="Tasa" TasaOCuota="0.160000" Importe="1600.000000"/>
    </cfdi:Traslados>
  </cfdi:Impuestos>
</cfdi:Comprobante>
```

### 3. Decimal Formatting Rules

Precise decimal formatting per SAT specification:

```typescript
// Comprobante level: 2 decimal places
formatDecimal2(value): string  // "10000.00"

// Concepto level: 6 decimal places
formatDecimal6(value): string  // "10000.000000"

// TasaOCuota: exactly 6 decimal places
// "0.160000" (16% IVA)
// "0.106700" (10.67% IVA retention)
```

### 4. Cadena Original Generation

XSLT transformation using SAT's official stylesheet:

```typescript
export async function generateCadenaOriginal(xml: string): Promise<CadenaOriginalResult> {
  // Apply SAT XSLT via xsltproc
  const cadena = await applyXSLT(xml, XSLT_PATH);

  // Compute SHA-256 hash
  const sha256 = computeSHA256(cadena);

  return { cadena, sha256 };
}
```

**Example Cadena:**
```
||4.0|A|00001|2024-03-01T10:00:00|01|10000.00|MXN|11600.00|I|01|PUE|06600|
EKU9003173C9|ESCUELA KEMPER URGATE|601|URE180429TM6|UNIVERSIDAD ROBOTICA ESPAÑOLA|
65000|601|G01|81112100|1|E48|Hora|Servicio|10000.000000|10000.000000|02|...||
```

### 5. Pre-PAC Validation

Validates CFDI before submission to PAC:

```typescript
export function validateCFDI(
  xmlOrObject: string | CFDIComprobante,
  options?: { now?: Date }
): CFDIValidationResult {
  const errors: CFDIValidationError[] = [];

  errors.push(...validateStructure(comprobante));    // Required fields, formats
  errors.push(...validateAmounts(comprobante));      // Mathematical consistency
  errors.push(...validateDates(comprobante, now));   // 72-hour rule
  errors.push(...validateCatalogs(comprobante));     // SAT catalog values
  errors.push(...validateImpuestosAggregation(...)); // Tax totals

  return { valid: errors.length === 0, errors, warnings };
}
```

**Validation Rules:**
- RFC format (12-13 characters, valid pattern)
- Postal codes (5 digits)
- Version must be "4.0"
- Issue date within 72 hours
- Amounts with 0.01 tolerance
- Valid catalog values (TipoDeComprobante, Exportacion, MetodoPago, etc.)

### 6. Pagos 2.0 Complement

Foundation for Component 18 (Payment Complement):

```typescript
export function buildPagos20Complement(input: Pagos20Input): string {
  // Generates <pago20:Pagos> XML fragment
  // Includes Totales, Pago, DoctoRelacionado nodes
}
```

**Output Structure:**
```xml
<pago20:Pagos xmlns:pago20="http://www.sat.gob.mx/Pagos20" Version="2.0">
  <pago20:Totales MontoTotalPagos="11600.00" TotalTrasladosBaseIVA16="10000.00" .../>
  <pago20:Pago FechaPago="2024-03-15T10:30:00" FormaDePagoP="03" MonedaP="MXN" Monto="11600.00">
    <pago20:DoctoRelacionado IdDocumento="F4F09AEF-..." MonedaDR="MXN" .../>
  </pago20:Pago>
</pago20:Pagos>
```

### 7. Special RFC Handling

Automatic handling of public general and foreign RFCs:

```typescript
// XAXX010101000 (Público en General)
// Forces: UsoCFDI='S01', RegimenFiscalReceptor='616'

// XEXX010101000 (Extranjero)
// Forces: UsoCFDI='S01', RegimenFiscalReceptor='616'
```

### 8. Integration Bridge

Thin adapter converting Component 12's Invoice to CFDI input:

```typescript
// apps/web/lib/invoices/cfdi-bridge.ts

export async function generateCFDIFromInvoice(invoice: Invoice): Promise<CFDIBridgeResult> {
  // Map Invoice → CFDIGeneratorInput
  const input = mapInvoiceToCFDIInput(invoice);

  // Generate XML
  const { xml, xmlUnsigned } = generateCFDI(input);

  // Validate
  const validation = validateCFDI(xml);

  // Generate cadena original (if XSLT available)
  if (isXSLTAvailable()) {
    const { cadena, sha256 } = await generateCadenaOriginal(xml);
  }

  return { xml, xmlUnsigned, cadenaOriginal, sha256, validationResult };
}
```

**Field Mapping (Component 12 → CFDI):**
| Component 12 | CFDI Input | Notes |
|--------------|------------|-------|
| `sat_product_code` | `product_service_key` | Different name |
| `sat_unit_code` | `unit_key` | Different name |
| `issuer_zip_code` | `issuer_zip_code` | Same name |
| `receiver_zip_code` | `receiver_zip_code` | Same name |

## Test Fixtures

12 comprehensive fixtures covering all CFDI scenarios:

| Fixture | Description |
|---------|-------------|
| `FIXTURE_INGRESO_SIMPLE` | One item, 16% IVA, PUE |
| `FIXTURE_INGRESO_RETENCIONES` | Professional services with IVA + ISR retention |
| `FIXTURE_INGRESO_EXENTO` | Exempt item (TipoFactor=Exento) |
| `FIXTURE_EGRESO` | Credit note referencing related CFDI |
| `FIXTURE_PUBLICO_GENERAL` | Invoice with RFC XAXX010101000 |
| `FIXTURE_MULTITAX` | Two items with different IVA rates (16% and 8%) |
| `FIXTURE_MULTIITEM` | 3 items with mixed tax configurations |
| `FIXTURE_WITH_DISCOUNT` | Item with 10% discount |
| `FIXTURE_USD` | USD invoice with exchange rate |
| `FIXTURE_GLOBAL` | Global invoice with InformacionGlobal |
| `FIXTURE_WITH_RELATED` | Invoice with CfdiRelacionados |
| `FIXTURE_ZERO_IVA` | Item with 0% IVA |

## Constants and Catalogs

```typescript
// Namespaces
export const CFDI_NAMESPACE = 'http://www.sat.gob.mx/cfd/4';
export const PAGOS20_NAMESPACE = 'http://www.sat.gob.mx/Pagos20';
export const TFD_NAMESPACE = 'http://www.sat.gob.mx/TimbreFiscalDigital';

// Tax Codes
export const IMPUESTO_ISR = '001';
export const IMPUESTO_IVA = '002';
export const IMPUESTO_IEPS = '003';

// Tax Rates
export const IVA_GENERAL = '0.160000';
export const IVA_FRONTERA = '0.080000';
export const IVA_CERO = '0.000000';

// Special RFCs
export const RFC_PUBLICO_GENERAL = 'XAXX010101000';
export const RFC_EXTRANJERO = 'XEXX010101000';

// Valid Catalogs
export const VALID_TIPOS_COMPROBANTE = ['I', 'E', 'T', 'P', 'N'];
export const VALID_EXPORTACION = ['01', '02', '03', '04'];
export const VALID_METODOS_PAGO = ['PUE', 'PPD'];
export const VALID_OBJETO_IMP = ['01', '02', '03'];
```

## Running Tests

```bash
# From packages/cfdi directory
cd my-turborepo/packages/cfdi
npm test

# From monorepo root
npm run test --workspace=@repo/cfdi

# Run CFDI bridge tests
cd my-turborepo/apps/web
npx vitest run lib/invoices/__tests__/cfdi-bridge.test.ts

# Download XSLT for integration tests
npm run download-xslt
```

## Dependencies

### Package Dependencies

```json
{
  "dependencies": {
    "decimal.js": "^10.4.3",
    "saxon-js": "^2.7.0",
    "xmlbuilder2": "^3.1.1"
  },
  "devDependencies": {
    "typescript": "*",
    "vitest": "*",
    "tsx": "*"
  }
}
```

### Internal Dependencies

The bridge (`cfdi-bridge.ts`) imports:
- `@repo/cfdi` - The CFDI package
- `./types` - Invoice types from Component 12

## Implementation Steps Completed

| Step | Component | Description |
|------|-----------|-------------|
| 1 | Package Setup | Created packages/cfdi/ with package.json, tsconfig.json |
| 2 | Types & Constants | CFDI 4.0 interfaces, SAT catalogs |
| 3 | Impuestos Aggregation | Tax grouping per SAT Anexo 20 rules |
| 4 | Generator | XML generation with xmlbuilder2 |
| 5 | Cadena Original | XSLT transformation, SHA-256 hashing |
| 6 | Validation | Pre-PAC validation checks |
| 7 | Pagos 2.0 | Payment complement XML generation |
| 8 | Public API & Bridge | index.ts exports, cfdi-bridge.ts adapter |

## Public API

```typescript
// Generator
export { generateCFDI, buildComprobante, formatXML } from './generator';

// Cadena Original
export { generateCadenaOriginal, computeSHA256, isXSLTAvailable } from './cadena-original';

// Validation
export { validateCFDI, validateStructure, validateAmounts, validateDates, validateCatalogs } from './validation';

// Impuestos
export { aggregateImpuestos, formatDecimal6, formatDecimal2 } from './impuestos-aggregation';

// Complements
export { buildPagos20Complement } from './complements/pagos';

// Types (all exported)
export type { CFDIGeneratorInput, CFDIComprobante, CFDIValidationResult, ... } from './types';

// Constants (all exported)
export { CFDI_NAMESPACE, IMPUESTO_IVA, RFC_PUBLICO_GENERAL, ... } from './constants';
```

## Validation Error Codes

| Code | Field | Description |
|------|-------|-------------|
| `CFDI_XML_001` | - | Missing XML declaration |
| `CFDI_XML_002` | - | Lowercase encoding (warning) |
| `CFDI_XML_003` | - | Missing CFDI namespace |
| `CFDI_XML_004` | - | Wrong CFDI version |
| `CFDI001` | Version | Version must be "4.0" |
| `CFDI002` | Fecha | Invalid date format |
| `CFDI003` | LugarExpedicion | Invalid postal code |
| `CFDI004` | SubTotal | Negative amount |
| `CFDI005` | Conceptos | Empty concepts array |
| `CFDI010` | Emisor.Rfc | Invalid RFC format |
| `CFDI020` | Receptor.Rfc | Invalid RFC format |
| `CFDI030` | Fecha | Invalid date |
| `CFDI031` | Fecha | Future date |
| `CFDI032` | Fecha | Exceeds 72-hour window |
| `CFDI040` | SubTotal | Mismatch with items sum |
| `CFDI041` | Total | Mismatch with calculated total |

## Next Steps (Downstream Components)

1. **Component 14 - Digital Signature**: RSA-SHA256 signing with FIEL certificate
2. **Component 15 - PAC Integration**: CFDI stamping with certified providers
3. **Component 16 - PDF Generation**: Invoice PDF rendering
4. **Component 17 - Email Service**: Invoice delivery
5. **Component 18 - Payment Complement**: Full REP implementation (uses buildPagos20Complement)

## Key Technical Decisions

### Why xmlbuilder2?
`xml2js` is parser-first, `fast-xml-parser` has weak namespace support. `xmlbuilder2` is purpose-built for XML generation with proper namespace handling.

### Why bundle XSLT locally?
SAT updates XSLT without versioning. Bundled XSLT ensures reproducible builds. The download script (`npm run download-xslt`) captures the latest version at deployment time.

### Why the actual SAT XSLT?
The XSLT normalization rules for whitespace, attribute ordering, and field inclusion are precisely specified by SAT. Any manual reimplementation will diverge and produce invalid signatures.

### Why separate package?
The CFDI generator has zero runtime database dependencies. Making it standalone enables: (a) testing in isolation, (b) potential reuse in Python AI service, (c) clear separation between XML generation and business logic.

### Why exact column names in input?
By naming `CFDIGeneratorInput` fields identically to Component 12's database columns (e.g., `issuer_zip_code`, `receiver_zip_code`), the bridge becomes near-trivial with minimal mapping code. Only two fields differ: `sat_product_code` → `product_service_key` and `sat_unit_code` → `unit_key`.
