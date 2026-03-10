# Component 16: PDF Generator Service - Completion Summary

## Overview

Component 16 implements SAT-compliant PDF generation for stamped CFDI 4.0 invoices. The module uses PDFKit (not Puppeteer/Chrome) to generate professional invoice PDFs with QR codes per SAT Anexo 20 specification, organization branding, bilingual support (Spanish/English), and automatic R2 storage upload.

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         apps/web (Next.js Application)                       │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │                  lib/invoices/generate-pdf.ts                            ││
│  │                 (Integration Bridge - Step 9)                            ││
│  │  generateInvoicePDFAndStore(invoiceId, orgId) → GeneratePDFResult       ││
│  │  checkPDFGenerationReady(invoiceId, orgId) → { ready, reason }          ││
│  │  regenerateInvoicePDF(invoiceId, orgId) → GeneratePDFResult             ││
│  └──────────────────────────────────┬──────────────────────────────────────┘│
│                                     │                                        │
│  ┌──────────────────────────────────┼──────────────────────────────────────┐│
│  │                         lib/pdf/                                         ││
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌────────────────┐  ││
│  │  │ service.ts  │  │generator.ts │  │qr-code.ts   │  │xml-extractor.ts│  ││
│  │  │  (Step 8)   │  │  (Step 6)   │  │  (Step 4)   │  │   (Step 5)     │  ││
│  │  └──────┬──────┘  └─────────────┘  └─────────────┘  └────────────────┘  ││
│  │         │                                                                ││
│  │  ┌──────┴──────────────────────────────────────────┐                    ││
│  │  │              templates/                          │                    ││
│  │  │  ┌──────────────────────────────────────────┐   │                    ││
│  │  │  │        invoice-template.ts                │   │                    ││
│  │  │  │           (Step 7)                        │   │                    ││
│  │  │  │   DB Row → InvoicePDFData transformer     │   │                    ││
│  │  │  └──────────────────────────────────────────┘   │                    ││
│  │  └─────────────────────────────────────────────────┘                    ││
│  │                                                                          ││
│  │  ┌─────────────┐  ┌─────────────┐                                       ││
│  │  │  types.ts   │  │  styles.ts  │                                       ││
│  │  │  (Step 2)   │  │  (Step 3)   │                                       ││
│  │  └─────────────┘  └─────────────┘                                       ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                              │
│  Public API:                                                                 │
│  • generateInvoicePDF(data, branding, options) → PDFGenerationResult        │
│  • generateAndStorePDF(invoice, stamp, orgId, branding) → PDFStorageResult  │
│  • generateInvoiceQRCode(params) → Buffer                                   │
│  • extractXMLFields(xml) → XMLExtractedFields                               │
│  • buildInvoicePDFData(invoice, stamp) → InvoicePDFData                     │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Files Created

### PDF Module (`apps/web/lib/pdf/`)

| File | Purpose | Tests |
|------|---------|-------|
| [types.ts](apps/web/lib/pdf/types.ts) | Core interfaces, type guards, PDFError class | 45 |
| [styles.ts](apps/web/lib/pdf/styles.ts) | Layout constants, SAT catalogs, bilingual labels | 32 |
| [qr-code.ts](apps/web/lib/pdf/qr-code.ts) | SAT verification QR code generation per Anexo 20 | 39 |
| [xml-extractor.ts](apps/web/lib/pdf/xml-extractor.ts) | CFDI XML parsing for stamp display data | 30 |
| [generator.ts](apps/web/lib/pdf/generator.ts) | PDFGenerator class with full layout engine | - |
| [templates/invoice-template.ts](apps/web/lib/pdf/templates/invoice-template.ts) | DB row to InvoicePDFData transformer | 32 |
| [service.ts](apps/web/lib/pdf/service.ts) | Main PDF service with R2 storage upload | 30 |
| [index.ts](apps/web/lib/pdf/index.ts) | Module exports | - |

### Invoice Integration (`apps/web/lib/invoices/`)

| File | Purpose | Tests |
|------|---------|-------|
| [generate-pdf.ts](apps/web/lib/invoices/generate-pdf.ts) | Bridge between invoice module and PDF service | - |

### Database Migration

| File | Purpose |
|------|---------|
| [20260309000000_add_organization_branding.sql](apps/web/supabase/migrations/20260309000000_add_organization_branding.sql) | Organization branding table for PDF customization |

**Total New Tests: 208 tests**
**All tests passing**

## PDF Generation Flow

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  Stamped Invoice│     │   PDF Service   │     │   PDFGenerator  │
│  (Component 15) │────▶│ generateAndStore│────▶│     class       │
│  cfdi_xml + TFD │     │     PDF()       │     │                 │
└─────────────────┘     └────────┬────────┘     └────────┬────────┘
                                 │                       │
                                 │  1. Build PDF data    │
                                 │  2. Extract XML fields│
                                 │  3. Generate QR code  │
                                 │  4. Render sections   │
                                 │  5. Upload to R2      │
                                 ▼                       ▼
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│ PDFStorageResult│◀────│   R2 Storage    │◀────│   PDF Buffer    │
│  - url          │     │pdfs/{org}/{inv}/│     │                 │
│  - r2Key        │     │   {uuid}.pdf    │     │                 │
│  - pageCount    │     └─────────────────┘     └─────────────────┘
│  - generatedAt  │
└─────────────────┘
```

## QR Code Generation (SAT Anexo 20)

The QR code encodes the SAT verification URL with the following format:

```
https://verificacfdi.facturaelectronica.sat.gob.mx/default.aspx
  ?id={UUID}
  &re={RFC_Emisor}
  &rr={RFC_Receptor}
  &tt={Total_6decimals}
  &fe={last8_of_Sello}
```

Example:
```typescript
import { generateInvoiceQRCode, formatSATVerificationURL } from '@/lib/pdf';

const params = {
  uuid: '05c519de-6d20-4258-88fb-c69a5970e927',
  rfcEmisor: 'AAA010101AAA',
  rfcReceptor: 'BBB020202BBB',
  total: '1234.56',
  sello: 'AbCdEfGh...last8=='
};

const qrBuffer = await generateInvoiceQRCode(params);
// Returns PNG buffer for embedding in PDF
```

## XML Field Extraction

Extracts display data from signed CFDI XML:

```typescript
import { extractXMLFields } from '@/lib/pdf';

const fields = extractXMLFields(cfdiXml);
// Returns:
// {
//   noCertificadoEmisor: "30001000000300023708",
//   selloEmisor: "full_seal_for_qr...",
//   selloEmisorDisplay: "...last40chars",
//   selloSATDisplay: "...last40chars",
//   condicionesDePago: "Pago en 30 días" | null
// }
```

## PDF Layout Sections

The generated PDF includes:

1. **Header Bar** - Company logo/name, invoice type, folio
2. **Issuer Block** - RFC, name, tax regime, postal code
3. **Metadata Block** - Date, CFDI type, payment form/method, currency
4. **Receiver Block** - RFC, name, tax regime, CFDI use
5. **Items Table** - Product key, qty, unit, description, prices, amounts
6. **Totals Block** - Subtotal, discounts, taxes (IVA, ISR), total
7. **Stamp Block** - UUID, stamp date, PAC RFC, certificate numbers, seals
8. **Footer** - QR code, SAT verification URL, CFDI disclaimer

## SAT Catalog Labels

Full Spanish labels for SAT codes:

```typescript
import {
  TIPO_COMPROBANTE,
  FORMA_PAGO,
  METODO_PAGO,
  USO_CFDI,
  REGIMEN_FISCAL,
  IMPUESTO,
  getCatalogLabel
} from '@/lib/pdf';

// Examples
getCatalogLabel(TIPO_COMPROBANTE, 'I');  // "I - Ingreso"
getCatalogLabel(FORMA_PAGO, '03');       // "03 - Transferencia electrónica de fondos"
getCatalogLabel(METODO_PAGO, 'PUE');     // "PUE - Pago en una sola exhibición"
getCatalogLabel(USO_CFDI, 'G03');        // "G03 - Gastos en general"
getCatalogLabel(REGIMEN_FISCAL, '601');  // "601 - General de Ley Personas Morales"
```

## Organization Branding

```typescript
interface BrandingSettings {
  primaryColor: string;      // Hex color for header (#1E3A5F)
  secondaryColor: string;    // Hex color for accents (#EBF2FA)
  logoUrl: string | null;    // R2 storage key
  logoBuffer: Buffer | null; // Pre-fetched logo data
  companyName: string;       // Display name
  website: string | null;
  phone: string | null;
}
```

## Bilingual Support

Labels available in Spanish (default) and English:

```typescript
import { getLabels } from '@/lib/pdf';

const labelsES = getLabels('es');
// labelsES.invoice = "FACTURA"
// labelsES.fiscalReceipt = "COMPROBANTE FISCAL DIGITAL POR INTERNET"

const labelsEN = getLabels('en');
// labelsEN.invoice = "INVOICE"
// labelsEN.fiscalReceipt = "MEXICAN DIGITAL TAX RECEIPT (CFDI 4.0)"
```

## Database Schema

### organization_branding

```sql
CREATE TABLE organization_branding (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- Color settings (hex format)
  primary_color VARCHAR(7) DEFAULT '#1E3A5F',
  secondary_color VARCHAR(7) DEFAULT '#EBF2FA',

  -- Logo settings
  logo_url TEXT,  -- R2 storage key/URL

  -- Company display info (may differ from legal name)
  company_name VARCHAR(255),
  website VARCHAR(255),
  phone VARCHAR(50),

  -- Additional branding
  tagline VARCHAR(255),
  footer_text TEXT,

  -- Constraints
  CONSTRAINT valid_primary_color CHECK (
    primary_color IS NULL OR primary_color ~ '^#[0-9A-Fa-f]{6}$'
  ),
  CONSTRAINT valid_secondary_color CHECK (
    secondary_color IS NULL OR secondary_color ~ '^#[0-9A-Fa-f]{6}$'
  )
);

-- One branding config per organization
CREATE UNIQUE INDEX idx_organization_branding_org
  ON organization_branding(organization_id);
```

## R2 Storage Structure

```
pdfs/
└── {organization_id}/
    └── {invoice_id}/
        └── {uuid}.pdf
```

Example: `pdfs/abc123/inv456/05c519de-6d20-4258-88fb-c69a5970e927.pdf`

## Error Codes

| Code | Description |
|------|-------------|
| `PDF_GENERATION_FAILED` | PDFKit rendering failed |
| `PDF_STORAGE_FAILED` | R2 upload failed |
| `PDF_XML_PARSE_ERROR` | CFDI XML parsing failed |
| `PDF_QR_GENERATION_FAILED` | QR code generation failed |
| `PDF_INVALID_DATA` | Missing required invoice data |
| `PDF_INVOICE_NOT_STAMPED` | Invoice must be stamped first |

## Test Coverage

| File | Tests | Description |
|------|-------|-------------|
| types.test.ts | 45 | Type guards, error classes |
| styles.test.ts | 32 | Layout config, catalog labels |
| qr-code.test.ts | 39 | SAT URL formatting, QR generation |
| xml-extractor.test.ts | 30 | XML parsing, seal truncation |
| invoice-template.test.ts | 32 | Data transformation, validation |
| service.test.ts | 30 | PDF generation, R2 upload mocks |

**All 208 tests pass.**

## Dependencies

- **`pdfkit`**: PDF generation library (no Chrome/Puppeteer needed)
- **`@types/pdfkit`**: TypeScript definitions for PDFKit
- **`qrcode`**: QR code generation
- **`@types/qrcode`**: TypeScript definitions for qrcode
- **`@xmldom/xmldom`**: XML parsing (already installed for Component 15)

## Running Tests

```bash
cd my-turborepo/apps/web

# Run all PDF tests
npm test lib/pdf/ -- --run

# Run specific test file
npm test lib/pdf/__tests__/qr-code.test.ts -- --run

# Watch mode
npm test lib/pdf/ -- --watch
```

## Usage Example

```typescript
import {
  generateInvoicePDFAndStore,
  checkPDFGenerationReady,
  regenerateInvoicePDF
} from '@/lib/invoices';

// Check if invoice can have PDF generated
const { ready, reason } = await checkPDFGenerationReady(invoiceId, organizationId);
if (!ready) {
  throw new Error(reason);
}

// Generate and store PDF (after stamping)
const result = await generateInvoicePDFAndStore(invoiceId, organizationId, 'es');

// result contains:
// {
//   url: "https://r2.example.com/pdfs/abc123/inv456/uuid.pdf",
//   r2Key: "pdfs/abc123/inv456/uuid.pdf",
//   uuid: "05c519de-6d20-4258-88fb-c69a5970e927",
//   pageCount: 1,
//   generatedAt: "2024-03-09T12:00:00.000Z"
// }

// Regenerate PDF (e.g., after branding changes)
const regenerated = await regenerateInvoicePDF(invoiceId, organizationId, 'en');
```

## Integration Contract with Component 15

**Input from Component 15:**
```typescript
// After stamping success
const invoice = {
  id: "inv-123",
  cfdi_xml: "<cfdi:Comprobante>...with TFD...</cfdi:Comprobante>",
  status: "stamped",
  // ... other invoice fields
};

const stamp = {
  uuid: "05c519de-...",
  fecha_timbrado: "2024-03-01T10:00:00",
  rfc_prov_certif: "SPR190613I52",
  sello_cfd: "...",
  no_certificado_sat: "30001000000400002495",
  sello_sat: "..."
};
```

**Output:**
```typescript
{
  url: "https://r2.../pdfs/org/inv/uuid.pdf",  // Public URL
  r2Key: "pdfs/org/inv/uuid.pdf",              // Storage key
  uuid: "05c519de-...",                        // Invoice UUID
  pageCount: 1,                                // Number of pages
  generatedAt: "2024-03-09T12:00:00.000Z"     // Generation timestamp
}

// Invoice updated with:
{
  pdf_url: "https://r2.../pdfs/org/inv/uuid.pdf"
}
```

## Known Limitations

1. **Built-in Helvetica fonts only**: No custom font embedding (reduces bundle size)
2. **Single column layout**: Items table doesn't support complex nested structures
3. **No PDF/A compliance**: Standard PDF, not archival format
4. **Logo size limit**: Logos resized to fit 120x50 points max
5. **No digital signature on PDF**: The CFDI XML signature is separate

## Definition of Done - Checklist

- [x] `apps/web/lib/pdf/types.ts` created with interfaces, type guards, error classes
- [x] `apps/web/lib/pdf/styles.ts` created with layout constants and SAT catalog maps
- [x] `apps/web/lib/pdf/qr-code.ts` created with SAT Anexo 20 compliant QR generation
- [x] `apps/web/lib/pdf/xml-extractor.ts` created with CFDI XML parsing
- [x] `apps/web/lib/pdf/generator.ts` created with PDFGenerator class
- [x] `apps/web/lib/pdf/templates/invoice-template.ts` created for data transformation
- [x] `apps/web/lib/pdf/service.ts` created with R2 storage integration
- [x] `apps/web/lib/pdf/index.ts` created with public exports
- [x] `apps/web/lib/invoices/generate-pdf.ts` created as bridge
- [x] `apps/web/lib/invoices/index.ts` updated with PDF exports
- [x] Database migration for `organization_branding` table
- [x] **PDFKit** used (no Puppeteer/Chrome)
- [x] **Built-in Helvetica fonts** (no external fonts)
- [x] QR code per SAT Anexo 20 specification
- [x] Bilingual labels (Spanish/English)
- [x] Organization branding support
- [x] R2 storage upload with proper key structure
- [x] RLS policies for organization_branding table
- [x] **208 new tests, all passing**
