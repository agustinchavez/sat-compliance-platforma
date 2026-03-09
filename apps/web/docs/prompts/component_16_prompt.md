# Component 16: PDF Generator Service — Implementation Prompt

---

## Context for the Coding Agent

You are building Component 16 of a Mexican SAT tax compliance SaaS platform. The platform generates legally valid CFDI 4.0 electronic invoices. This component generates the **human-readable PDF representation** of a stamped CFDI — the document delivered to customers alongside the XML.

This is a **pure generation service**: it takes already-stamped invoice data, renders a SAT-compliant PDF, uploads it to Cloudflare R2, and returns a URL. It does not sign, stamp, or modify CFDI XML in any way.

---

## What's Already Built

Do not re-implement any of the following. Import and reuse them.

### Component 04 — CSD/Certificate Storage
- `apps/web/lib/organizations/certificates.ts` — `getOrganizationCSD(orgId)`
- Cloudflare R2 storage via `apps/web/lib/storage/r2.ts` (or equivalent)
- Encryption pattern: AES-256-GCM for sensitive data

### Component 12 — Invoice Data Model
The `invoices` table has these columns relevant to PDF generation:
```typescript
{
  id: string;
  folio: string;                    // e.g. "F-00001"
  series: string | null;            // e.g. "A"
  fecha: string;                    // ISO date: "2024-03-01T10:00:00"
  tipo_comprobante: string;         // "I" (ingreso), "E" (egreso), "T" (traslado)
  forma_pago: string;               // e.g. "03" (transferencia)
  metodo_pago: string;              // "PUE" or "PPD"
  moneda: string;                   // "MXN", "USD", etc.
  tipo_cambio: Decimal | null;      // exchange rate if not MXN
  subtotal: Decimal;
  descuento: Decimal | null;
  total: Decimal;
  issuer_rfc: string;
  issuer_name: string;
  issuer_tax_regime: string;        // e.g. "601"
  issuer_postal_code: string;
  receiver_rfc: string;
  receiver_name: string;
  receiver_tax_regime: string;
  receiver_postal_code: string;
  receiver_cfdi_use: string;        // e.g. "G03"
  cfdi_xml: string;                 // Full stamped XML (contains TFD complement)
  status: string;                   // Must be "stamped"
  stamps: {                         // JSONB - from Component 15
    uuid: string;
    fechaTimbrado: string;
    rfcProvCertif: string;
    selloCFD: string;
    noCertificadoSAT: string;
    selloSAT: string;
    pacProvider: string;
    stampedAt: string;
  };
  tax_breakdown: {                  // JSONB
    subtotal: string;
    discount: string | null;
    total_transferred_taxes: string;
    total_withheld_taxes: string | null;
    total: string;
    taxes: Array<{
      type: "transferred" | "withheld";
      impuesto: string;             // "002" = IVA, "001" = ISR, "003" = IEPS
      tasa_o_cuota: string;
      importe: string;
    }>;
  };
  items: Array<{                    // JSONB line items
    cantidad: string;
    unit_key: string;               // SAT ClaveUnidad
    unit_description: string;
    product_service_key: string;   // SAT ClaveProdServ
    description: string;
    unit_price: string;
    discount: string | null;
    subtotal: string;
    tax_object: string;             // "01", "02", "03"
    taxes: Array<{
      type: "transferred" | "withheld";
      impuesto: string;
      tasa_o_cuota: string;
      importe: string;
    }>;
  }>;
  pdf_url: string | null;          // Populated by THIS component
}
```

### Component 13 — CFDI XML Package (`packages/cfdi/`)
- Already installed: `@xmldom/xmldom` for XML parsing
- `packages/cfdi/src/` — XML generation utilities (do NOT use for PDF)

### Component 14 — Digital Signature Service
- `apps/web/lib/invoices/sign-invoice.ts`

### Component 15 — PAC Integration
- `apps/web/lib/pac/` — stamping service
- `apps/web/lib/invoices/stamp-invoice.ts`
- `apps/web/lib/invoices/index.ts` — invoice function exports

### Storage Pattern (Cloudflare R2)
R2 is already configured for CSD certificates in Component 04. Reuse the same R2 client for PDF uploads. The bucket and client are accessible through the existing storage utilities. PDFs should be stored at key: `pdfs/{organization_id}/{invoice_id}/{uuid}.pdf`

---

## What You Are Building

### File Structure
Use `apps/web/lib/pdf/` (matching the existing `lib/` convention — NOT `src/server/pdf/`):

```
apps/web/lib/pdf/
├── types.ts                  # Interfaces: PDFOptions, BrandingSettings, LayoutConfig, InvoicePDFData
├── styles.ts                 # Style constants: colors, fonts, spacing, layout measurements
├── qr-code.ts                # QR generation: generateQRCode(), formatSATVerificationURL()
├── xml-extractor.ts          # Parse stamped XML to extract display fields
├── generator.ts              # PDFGenerator class — the core layout engine
├── templates/
│   ├── invoice-template.ts   # Stamped CFDI invoice layout
│   └── receipt-template.ts   # Payment receipt (simplified, no TFD required)
├── service.ts                # generateInvoicePDF(), uploadPDF(), generateAndStorePDF()
└── index.ts                  # Public exports
```

And the integration bridge:
```
apps/web/lib/invoices/generate-pdf.ts   # Thin bridge connecting invoices module to PDF service
```

---

## Library Choice: PDFKit (NOT Puppeteer)

Use **PDFKit** (`pdfkit` npm package) for PDF generation. Do NOT use Puppeteer, html-pdf, wkhtmltopdf, or any headless browser approach.

**Rationale:**
- No Chromium binary needed — significantly smaller container footprint
- Deterministic output — same input always produces same PDF (critical for auditing)
- Runs as a pure Node.js library — no subprocess spawning
- Sufficient for structured invoice layouts
- Already used by similar invoicing platforms (pdfmake is a wrapper around PDFKit)
- ~50ms generation time vs ~2-5s for Puppeteer cold start

**For QR codes**, use the `qrcode` npm package which generates SVG or PNG buffers — PDFKit can embed both.

**Install:**
```bash
npm install pdfkit qrcode
npm install --save-dev @types/pdfkit @types/qrcode
```
(Install in `apps/web`, not at the monorepo root unless already there.)

---

## Mexican Tax Domain: SAT PDF Requirements

The PDF is the **representación impresa** (printed representation) of the CFDI. It is legally optional but practically mandatory — customers need it to verify the invoice.

### Required Fields (Anexo 20, CFDI 4.0)
Every SAT-compliant CFDI PDF **must** display all of the following:

**Header block:**
- "COMPROBANTE FISCAL DIGITAL POR INTERNET" (prominently)
- CFDI Version: 4.0
- Serie and Folio (if present)
- Fecha de emisión
- Lugar de expedición (issuer postal code)
- Tipo de comprobante (full name, not just code)

**Issuer block (`cfdi:Emisor`):**
- RFC del emisor
- Nombre / Razón social
- Régimen fiscal (code + description, e.g. "601 - General de Ley Personas Morales")
- Domicilio fiscal (postal code)

**Receiver block (`cfdi:Receptor`):**
- RFC del receptor
- Nombre / Razón social
- Domicilio fiscal (postal code)
- Régimen fiscal receptor
- Uso CFDI (code + description, e.g. "G03 - Gastos en general")

**Fiscal data:**
- Forma de pago (code + description)
- Método de pago (PUE or PPD + description)
- Moneda
- Tipo de cambio (if not MXN)
- Condiciones de pago (if present)

**Line items table — each `cfdi:Concepto`:**
- ClaveProdServ (SAT product key)
- ClaveUnidad (SAT unit key)
- NoIdentificacion (if present)
- Cantidad
- Descripción
- ValorUnitario
- Descuento (if present)
- Importe

**Tax summary (`cfdi:Impuestos`):**
- SubTotal
- Descuento total (if present)
- Each transferred tax (IVA 16%, IVA 8%, IEPS, etc.) with importe
- Each withheld tax (ISR, IVA retención) with importe
- **Total**

**TFD Stamp block (CRITICAL — from `invoices.stamps` JSONB):**
- Folio Fiscal (UUID) — display in full
- Fecha y hora de timbrado
- RFC del PAC certificador
- No. de certificado SAT
- No. de certificado emisor (`invoices.stamps.noCertificadoSAT` is the SAT cert; the issuer's cert number comes from `cfdi:Comprobante/@NoCertificado` in the XML)
- Sello digital del emisor (last 8 chars of Sello, or truncated for display)
- Sello SAT (truncated for display)
- Cadena original del complemento de certificación (optional but professional)

**QR Code (MANDATORY per Anexo 20):**
The QR code must encode the SAT verification URL in this exact format:
```
https://verificacfdi.facturaelectronica.sat.gob.mx/default.aspx?id={UUID}&re={RFC_Emisor}&rr={RFC_Receptor}&tt={Total}&fe={last8_Sello}
```
Where:
- `id` = UUID from TFD (`invoices.stamps.uuid`)
- `re` = RFC emisor (`invoices.issuer_rfc`)
- `rr` = RFC receptor (`invoices.receiver_rfc`)  
- `tt` = Total formatted to 6 decimal places, NO thousands separator, leading zeros removed (e.g. `1234.500000`, `0.990000`, `1.000000`)
- `fe` = Last 8 characters of `cfdi:Comprobante/@Sello` from the XML (NOT `stamps.selloCFD`)

**Total format rule for `tt`:** The total uses a specific format per Anexo 20. Format using: `parseFloat(total).toFixed(6)` then remove leading zeros before the decimal point if the integer part is 0 (e.g., `"000001234.500000"` → `"1234.500000"`). Do NOT use `.toLocaleString()`.

### SAT Catalog Label Maps (embed these in `styles.ts` or `types.ts`)

```typescript
// Tipo comprobante
export const TIPO_COMPROBANTE: Record<string, string> = {
  I: 'Ingreso', E: 'Egreso', T: 'Traslado', N: 'Nómina', P: 'Pago'
};

// Forma de pago (partial — include all)
export const FORMA_PAGO: Record<string, string> = {
  '01': 'Efectivo', '02': 'Cheque nominativo', '03': 'Transferencia electrónica de fondos',
  '04': 'Tarjeta de crédito', '05': 'Monedero electrónico', '06': 'Dinero electrónico',
  '08': 'Vales de despensa', '12': 'Dación en pago', '13': 'Pago por subrogación',
  '14': 'Pago por consignación', '15': 'Condonación', '17': 'Compensación',
  '23': 'Novación', '24': 'Confusión', '25': 'Remisión de deuda',
  '26': 'Prescripción o caducidad', '27': 'A satisfacción del acreedor',
  '28': 'Tarjeta de débito', '29': 'Tarjeta de servicios',
  '30': 'Aplicación de anticipos', '31': 'Intermediario pagos', '99': 'Por definir'
};

// Método de pago
export const METODO_PAGO: Record<string, string> = {
  'PUE': 'Pago en una sola exhibición',
  'PPD': 'Pago en parcialidades o diferido'
};

// Impuesto
export const IMPUESTO: Record<string, string> = {
  '001': 'ISR', '002': 'IVA', '003': 'IEPS'
};

// CFDI use (top 20 most common — include full catalog)
export const USO_CFDI: Record<string, string> = {
  'G01': 'Adquisición de mercancias', 'G02': 'Devoluciones, descuentos o bonificaciones',
  'G03': 'Gastos en general', 'I01': 'Construcciones', 'I02': 'Mobilario y equipo de oficina',
  'I03': 'Equipo de transporte', 'I04': 'Equipo de computo y accesorios',
  'I05': 'Dados, troqueles, moldes, matrices y herramental', 'I06': 'Comunicaciones telefónicas',
  'I07': 'Comunicaciones satelitales', 'I08': 'Otra maquinaria y equipo',
  'D01': 'Honorarios médicos, dentales y gastos hospitalarios',
  'D02': 'Gastos médicos por incapacidad o discapacidad',
  'D03': 'Gastos funerales', 'D04': 'Donativos', 'D05': 'Intereses reales efectivamente pagados por créditos hipotecarios (casa habitación)',
  'D06': 'Aportaciones voluntarias al SAR', 'D07': 'Primas por seguros de gastos médicos',
  'D08': 'Gastos de transportación escolar obligatoria',
  'D09': 'Depósitos en cuentas para el ahorro, primas que tengan como base planes de pensiones',
  'D10': 'Pagos por servicios educativos (colegiaturas)',
  'P01': 'Por definir', 'S01': 'Sin efectos fiscales', 'CP01': 'Pagos', 'CN01': 'Nómina'
};

// Régimen fiscal (26 total)
export const REGIMEN_FISCAL: Record<string, string> = {
  '601': 'General de Ley Personas Morales',
  '603': 'Personas Morales con Fines no Lucrativos',
  '605': 'Sueldos y Salarios e Ingresos Asimilados a Salarios',
  '606': 'Arrendamiento', '607': 'Régimen de Enajenación o Adquisición de Bienes',
  '608': 'Demás ingresos', '609': 'Consolidación',
  '610': 'Residentes en el Extranjero sin Establecimiento Permanente en México',
  '611': 'Ingresos por Dividendos (socios y accionistas)',
  '612': 'Personas Físicas con Actividades Empresariales y Profesionales',
  '614': 'Ingresos por intereses', '615': 'Régimen de los ingresos por obtención de premios',
  '616': 'Sin obligaciones fiscales',
  '620': 'Sociedades Cooperativas de Producción que optan por diferir sus ingresos',
  '621': 'Incorporación Fiscal',
  '622': 'Actividades Agrícolas, Ganaderas, Silvícolas y Pesqueras',
  '623': 'Opcional para Grupos de Sociedades',
  '624': 'Coordinados', '625': 'Régimen de las Actividades Empresariales con ingresos a través de Plataformas Tecnológicas',
  '626': 'Régimen Simplificado de Confianza - RESICO'
};
```

---

## Implementation Steps (Follow in Order)

### Step 1 — Install dependencies and define types

Install `pdfkit` and `qrcode` in `apps/web`. Then create `apps/web/lib/pdf/types.ts`:

```typescript
// apps/web/lib/pdf/types.ts

export interface BrandingSettings {
  primaryColor: string;        // hex, e.g. "#1E40AF"
  secondaryColor: string;      // hex, e.g. "#DBEAFE"
  logoUrl: string | null;      // R2 URL or null
  logoBuffer: Buffer | null;   // Pre-fetched logo bytes
  companyName: string;         // Display name (may differ from RFC name)
  website: string | null;
  phone: string | null;
}

export interface PDFOptions {
  language: 'es' | 'en';
  pageSize: 'LETTER' | 'A4';   // LETTER for Mexico
  includeXMLAppendix: boolean; // Whether to append XML text at end
  watermark: string | null;    // e.g. "DRAFT" for non-stamped
}

export interface LayoutConfig {
  pageWidth: number;
  pageHeight: number;
  margin: { top: number; right: number; bottom: number; left: number };
  contentWidth: number;        // pageWidth - left - right margin
  colors: {
    primary: string;
    secondary: string;
    text: string;
    muted: string;
    border: string;
    headerBg: string;
  };
  fonts: {
    regular: string;
    bold: string;
    size: { small: number; normal: number; large: number; title: number };
  };
}

// Fully hydrated invoice data for PDF rendering
// Sourced from invoices table + stamps JSONB
export interface InvoicePDFData {
  // Core invoice fields
  id: string;
  folio: string;
  series: string | null;
  fecha: string;
  tipoComprobante: string;
  formaPago: string;
  metodoPago: string;
  moneda: string;
  tipoCambio: string | null;
  subtotal: string;
  descuento: string | null;
  total: string;
  // Issuer
  issuerRfc: string;
  issuerName: string;
  issuerTaxRegime: string;
  issuerPostalCode: string;
  // Receiver
  receiverRfc: string;
  receiverName: string;
  receiverTaxRegime: string;
  receiverPostalCode: string;
  receiverCfdiUse: string;
  // Items
  items: InvoiceItem[];
  // Tax breakdown
  taxBreakdown: TaxBreakdown;
  // Stamp data (from Component 15)
  stamps: StampData;
  // Raw XML (for sello extraction and NO certificado emisor)
  cfdiXml: string;
}

export interface InvoiceItem {
  cantidad: string;
  unitKey: string;
  unitDescription: string;
  productServiceKey: string;
  description: string;
  unitPrice: string;
  discount: string | null;
  subtotal: string;
  taxes: ItemTax[];
}

export interface ItemTax {
  type: 'transferred' | 'withheld';
  impuesto: string;
  tasaOCuota: string;
  importe: string;
}

export interface TaxBreakdown {
  subtotal: string;
  discount: string | null;
  totalTransferredTaxes: string;
  totalWithheldTaxes: string | null;
  total: string;
  taxes: TaxLine[];
}

export interface TaxLine {
  type: 'transferred' | 'withheld';
  impuesto: string;
  tasaOCuota: string;
  importe: string;
}

export interface StampData {
  uuid: string;
  fechaTimbrado: string;
  rfcProvCertif: string;
  selloCFD: string;
  noCertificadoSAT: string;
  selloSAT: string;
  pacProvider: string;
}

export interface PDFGenerationResult {
  buffer: Buffer;
  pageCount: number;
  uuid: string;
  generatedAt: string;
}

export interface PDFStorageResult extends PDFGenerationResult {
  url: string;               // Public R2 URL
  r2Key: string;             // Storage key for reference
}
```

Write tests for type guards (e.g., `isValidInvoicePDFData(data)`).

---

### Step 2 — QR code module

Create `apps/web/lib/pdf/qr-code.ts`:

```typescript
// apps/web/lib/pdf/qr-code.ts
import QRCode from 'qrcode';

/**
 * Builds the SAT verification URL per Anexo 20 specification.
 * 
 * URL format:
 * https://verificacfdi.facturaelectronica.sat.gob.mx/default.aspx
 *   ?id={UUID}
 *   &re={RFC_Emisor}
 *   &rr={RFC_Receptor}
 *   &tt={Total_6decimals}
 *   &fe={last8_Sello}
 *
 * The `tt` parameter uses 6 decimal places with no thousands separator.
 * The `fe` parameter is the last 8 characters of the issuer's Sello
 * (cfdi:Comprobante/@Sello attribute from the XML — NOT stamps.selloCFD).
 */
export function formatSATVerificationURL(params: {
  uuid: string;
  rfcEmisor: string;
  rfcReceptor: string;
  total: string;             // String decimal, e.g. "1234.50"
  sello: string;             // Full sello from XML
}): string { ... }

/**
 * Formats a decimal total per Anexo 20 tt parameter spec:
 * - 6 decimal places
 * - No thousands separator
 * - Remove non-significant leading zeros in integer part
 * Examples:
 *   "1234.5"   → "1234.500000"
 *   "0.99"     → "0.990000"
 *   "1000"     → "1000.000000"
 *   "0.1"      → "0.100000"
 */
export function formatTotalForQR(total: string): string { ... }

/**
 * Generates a QR code PNG buffer from the SAT verification URL.
 * Size: 120x120 pixels minimum (SAT requires scannable QR).
 * Error correction level: M (15% restoration capacity).
 */
export async function generateSATQRCode(url: string): Promise<Buffer> { ... }
```

**Tests for `qr-code.ts` (≥95% coverage):**
- `formatTotalForQR`: test values 1234.5, 0.99, 1000, 0.1, 10000.123456
- `formatSATVerificationURL`: verify all 5 parameters appear in correct position
- `formatSATVerificationURL`: verify `fe` is exactly 8 chars (last 8 of sello)
- `generateSATQRCode`: verify returns Buffer with PNG signature bytes

---

### Step 3 — XML extractor

Create `apps/web/lib/pdf/xml-extractor.ts`:

```typescript
// apps/web/lib/pdf/xml-extractor.ts
// Parses stamped CFDI XML to extract fields needed for PDF display
// that are NOT already stored in the invoices table columns.
// Uses @xmldom/xmldom (already installed in packages/cfdi).

export interface XMLExtractedFields {
  noCertificadoEmisor: string;   // cfdi:Comprobante/@NoCertificado
  selloEmisor: string;            // cfdi:Comprobante/@Sello (full, for fe param)
  selloEmisorDisplay: string;     // Last 40 chars + "..." for display
  selloSATDisplay: string;        // From stamps but truncated for display
  condicionesDePago: string | null; // cfdi:Comprobante/@CondicionesDePago
}

/**
 * Extracts display fields from the stamped CFDI XML string.
 * Only use this for fields NOT stored as dedicated DB columns.
 * @throws XMLExtractionError if XML is malformed or missing required attributes
 */
export function extractXMLFields(cfdiXml: string): XMLExtractedFields { ... }
```

**Tests for `xml-extractor.ts` (≥95% coverage):**
- Test with valid stamped CFDI XML fixture (create a minimal one in `__tests__/fixtures/`)
- Test extraction of `NoCertificado`, `Sello`
- Test `selloEmisorDisplay` is truncated correctly
- Test error thrown for malformed XML
- Test error thrown for XML missing `Sello` attribute

---

### Step 4 — Style constants

Create `apps/web/lib/pdf/styles.ts`:

```typescript
// apps/web/lib/pdf/styles.ts
// All layout constants. PDFKit uses points (72 pts = 1 inch).
// US Letter: 612 x 792 pts. Margins: 40pts each side.

import type { LayoutConfig } from './types';

export const PAGE_SIZES = {
  LETTER: { width: 612, height: 792 },
  A4: { width: 595.28, height: 841.89 },
} as const;

export const DEFAULT_MARGIN = { top: 40, right: 40, bottom: 40, left: 40 };

export const DEFAULT_COLORS = {
  primary: '#1E3A5F',      // Dark navy blue — professional
  secondary: '#EBF2FA',    // Light blue background for header bands
  text: '#111827',         // Near-black for body text
  muted: '#6B7280',        // Gray for labels and secondary text
  border: '#D1D5DB',       // Light gray for table borders
  headerBg: '#1E3A5F',     // Same as primary for header bar
  white: '#FFFFFF',
  accent: '#10B981',       // Green for paid/stamped status indicator
};

export const FONTS = {
  regular: 'Helvetica',
  bold: 'Helvetica-Bold',
  sizes: {
    tiny: 6,
    small: 7.5,
    normal: 9,
    medium: 10,
    large: 12,
    title: 14,
    heading: 18,
  },
};

// Table column widths for items table (pts, must sum to contentWidth = 532)
export const ITEMS_TABLE_COLUMNS = {
  claveProdServ: 55,   // SAT product key
  quantity: 45,        // Cantidad
  unit: 40,            // ClaveUnidad
  description: 187,   // Descripción (largest)
  unitPrice: 65,       // Valor Unitario
  discount: 50,        // Descuento
  subtotal: 70,        // Importe (right-aligned)
  // Note: discount column hidden when no items have discounts
};

export function buildLayoutConfig(
  pageSize: 'LETTER' | 'A4',
  branding: { primaryColor?: string; secondaryColor?: string }
): LayoutConfig { ... }

// Bilingual label maps — always show Spanish, English below if language === 'en'
export const LABELS = {
  es: {
    invoice: 'FACTURA',
    fiscalReceipt: 'COMPROBANTE FISCAL DIGITAL POR INTERNET',
    issuer: 'DATOS DEL EMISOR',
    receiver: 'DATOS DEL RECEPTOR',
    items: 'CONCEPTOS',
    qty: 'Cant.',
    unit: 'Unidad',
    description: 'Descripción',
    unitPrice: 'P. Unitario',
    discount: 'Descuento',
    amount: 'Importe',
    subtotal: 'Subtotal',
    discount_total: 'Descuento',
    taxes: 'Impuestos',
    total: 'TOTAL',
    stampData: 'DATOS DEL TIMBRE FISCAL DIGITAL',
    fiscalFolio: 'Folio Fiscal (UUID)',
    stampDate: 'Fecha de Timbrado',
    pacRfc: 'RFC del PAC',
    satCertNo: 'No. Certificado SAT',
    issuerCertNo: 'No. Certificado Emisor',
    issuerSeal: 'Sello Digital del Emisor',
    satSeal: 'Sello del SAT',
    verifyAt: 'Verifique este comprobante en:',
    cfdiType: 'Tipo de Comprobante',
    paymentForm: 'Forma de Pago',
    paymentMethod: 'Método de Pago',
    currency: 'Moneda',
    exchangeRate: 'Tipo de Cambio',
    taxRegime: 'Régimen Fiscal',
    cfdiUse: 'Uso CFDI',
    postalCode: 'C.P.',
    rfc: 'RFC',
    folio: 'Folio',
    date: 'Fecha',
    series: 'Serie',
    page: 'Página',
    of: 'de',
  },
  en: {
    invoice: 'INVOICE',
    fiscalReceipt: 'MEXICAN DIGITAL TAX RECEIPT (CFDI 4.0)',
    issuer: 'ISSUER',
    receiver: 'RECIPIENT',
    items: 'LINE ITEMS',
    qty: 'Qty',
    unit: 'Unit',
    description: 'Description',
    unitPrice: 'Unit Price',
    discount: 'Discount',
    amount: 'Amount',
    subtotal: 'Subtotal',
    discount_total: 'Discount',
    taxes: 'Taxes',
    total: 'TOTAL',
    stampData: 'DIGITAL STAMP DATA (TIMBRE FISCAL)',
    fiscalFolio: 'Fiscal Folio (UUID)',
    stampDate: 'Stamp Date',
    pacRfc: 'PAC RFC',
    satCertNo: 'SAT Certificate No.',
    issuerCertNo: 'Issuer Certificate No.',
    issuerSeal: 'Issuer Digital Seal',
    satSeal: 'SAT Seal',
    verifyAt: 'Verify this invoice at:',
    cfdiType: 'Document Type',
    paymentForm: 'Payment Method',
    paymentMethod: 'Payment Terms',
    currency: 'Currency',
    exchangeRate: 'Exchange Rate',
    taxRegime: 'Tax Regime',
    cfdiUse: 'CFDI Use',
    postalCode: 'Postal Code',
    rfc: 'RFC (Tax ID)',
    folio: 'Folio',
    date: 'Date',
    series: 'Series',
    page: 'Page',
    of: 'of',
  },
} as const;
```

No tests needed for pure constants. Write one smoke test confirming `buildLayoutConfig` returns the expected `contentWidth`.

---

### Step 5 — PDFGenerator class (Core Layout Engine)

Create `apps/web/lib/pdf/generator.ts`. This is the most complex file.

```typescript
// apps/web/lib/pdf/generator.ts
import PDFDocument from 'pdfkit';
import type { InvoicePDFData, BrandingSettings, PDFOptions, PDFGenerationResult, LayoutConfig } from './types';

export class PDFGenerator {
  private doc: PDFKit.PDFDocument;
  private layout: LayoutConfig;
  private labels: typeof LABELS['es'];
  private currentY: number;
  private pageCount: number;

  constructor(options: PDFOptions, branding: BrandingSettings) { ... }

  /**
   * Generates a complete invoice PDF buffer.
   * Orchestrates all section methods in order.
   */
  async generate(data: InvoicePDFData): Promise<PDFGenerationResult> { ... }

  // ─── Private section methods ────────────────────────────────────────────

  /** Blue header bar with company name/logo and invoice type label */
  private async addHeader(data: InvoicePDFData, branding: BrandingSettings): Promise<void> { ... }

  /** Issuer block (left) and invoice metadata block (right) — two-column */
  private addIssuerAndMetadata(data: InvoicePDFData): void { ... }

  /** Receiver block with RFC, name, tax regime, CFDI use */
  private addReceiverInfo(data: InvoicePDFData): void { ... }

  /** Items table with column headers, row data, page-aware auto-pagination */
  private addItemsTable(data: InvoicePDFData): void { ... }

  /** Totals block: subtotal, taxes (each line), total */
  private addTotals(data: InvoicePDFData): void { ... }

  /** TFD stamp block: UUID, dates, seals, certificate numbers */
  private addStampBlock(data: InvoicePDFData): void { ... }

  /** Footer with QR code (left) and verification text (right) */
  private async addFooter(data: InvoicePDFData, qrBuffer: Buffer): Promise<void> { ... }

  // ─── Utility methods ────────────────────────────────────────────────────

  /** Draws a horizontal rule line */
  private drawRule(y: number, color?: string): void { ... }

  /** Adds a new page and resets currentY, increments pageCount */
  private addPage(): void { ... }

  /**
   * Checks if there's enough vertical space remaining on the page.
   * If not, calls addPage(). Used before each section and table row.
   * minHeight: minimum points needed before adding a new page.
   */
  private ensureSpace(minHeight: number): void { ... }

  /** Right-aligns text at a given x position */
  private textRight(text: string, x: number, y: number, width: number): void { ... }

  /** Draws a filled rectangle (for header bands, row backgrounds) */
  private drawRect(x: number, y: number, w: number, h: number, color: string): void { ... }

  /** Formats a decimal string as Mexican currency: "$1,234.56" */
  private formatCurrency(value: string, currency?: string): string { ... }

  /** Formats ISO date string for display: "01/03/2024" or "March 1, 2024" */
  private formatDate(isoDate: string): string { ... }

  /** Applies brand primary color to an element (fallback to DEFAULT_COLORS.primary) */
  private brandColor(): string { ... }
}
```

**Layout specification (must implement):**

```
┌──────────────────────────────────────────────────────────────────┐
│ [LOGO] [COMPANY NAME]              FACTURA / INVOICE             │  ← Blue header bar (60pts tall)
│                                    Folio: F-00001                │
│                                    Fecha: 01/03/2024             │
├─────────────────────────────┬────────────────────────────────────┤
│ DATOS DEL EMISOR            │ Tipo: Ingreso                      │  ← Two-column section
│ RFC: XAXX010101000          │ Forma de pago: Transferencia       │
│ Nombre: EMPRESA SA DE CV    │ Método: PUE                        │
│ Régimen: 601                │ Moneda: MXN                        │
│ C.P.: 06600                 │ Lugar expedición: 06600            │
├─────────────────────────────┴────────────────────────────────────┤
│ DATOS DEL RECEPTOR                                               │  ← Full-width section
│ RFC: XEXX010101000  Nombre: CLIENTE SA  Uso CFDI: G03           │
├──────────────────────────────────────────────────────────────────┤
│ CONCEPTOS                                                        │  ← Table
│ ClaveProd | Cant | Unidad | Descripción | P.Unit | Desc | Importe│
│ 84111506  |  1   | E48    | Desarrollo  | 5,000  |  -   | 5,000  │
├──────────────────────────────────────────────────────────────────┤
│                              Subtotal:          $5,000.00        │  ← Right-aligned totals
│                              IVA 16%:             $800.00        │
│                              TOTAL:             $5,800.00        │
├──────────────────────────────────────────────────────────────────┤
│ DATOS DEL TIMBRE FISCAL DIGITAL                                  │  ← Stamp block (small font)
│ Folio Fiscal: 05c519de-6d20-...                                  │
│ Fecha timbrado: 01/03/2024 10:00:00                              │
│ RFC PAC: SPR190613I52   No.Cert SAT: 300010000...                │
│ Sello emisor: KVttNU...==   Sello SAT: qadm+mH3...==            │
├──────────────────────────────────────────────────────────────────┤
│ [QR CODE]  Verifique este comprobante en:                        │  ← Footer
│            https://verificacfdi.facturaelectronica...            │
│            Este CFDI es válido conforme a la ley fiscal          │
└──────────────────────────────────────────────────────────────────┘
```

**Multi-page support:**
- The items table must support pagination. Before each row, call `ensureSpace(rowHeight)`. When insufficient space, call `addPage()` which adds a new PDFKit page and re-draws the table header row.
- The footer (QR + stamp block) always appears on the last page.
- Page number (`Página X de Y`) in the top-right of each page after page 1.

**Logo handling:**
- If `branding.logoBuffer` is provided, embed it in the header using PDFKit's `doc.image()`.
- If null, render the company name in large bold text instead.
- Max logo dimensions: 120pts wide × 50pts tall (constrain proportionally).

---

### Step 6 — Invoice template

Create `apps/web/lib/pdf/templates/invoice-template.ts`:

```typescript
// apps/web/lib/pdf/templates/invoice-template.ts

/**
 * Transforms a database invoice row into InvoicePDFData.
 * Maps DB column names (snake_case) to PDF data interface (camelCase).
 * Extracts stamps from the stamps JSONB column.
 * 
 * @throws Error if invoice status is not 'stamped'
 * @throws Error if stamps JSONB is missing required fields
 */
export function buildInvoicePDFData(invoice: DatabaseInvoiceRow): InvoicePDFData { ... }

/**
 * Validates that all required fields for PDF generation are present.
 * Returns validation errors array (empty = valid).
 */
export function validateInvoicePDFData(data: InvoicePDFData): string[] { ... }
```

Create `apps/web/lib/pdf/templates/receipt-template.ts`:

```typescript
// Simplified receipt template for payment receipts
// Does NOT require stamps (no TFD) — used for payment acknowledgments
// that are NOT fiscal documents
export function buildReceiptPDFData(payment: PaymentData, org: OrganizationData): ReceiptPDFData { ... }
```

**Tests for templates (≥90% coverage):**
- `buildInvoicePDFData` maps all fields correctly from DB row
- `buildInvoicePDFData` throws for non-stamped invoice
- `buildInvoicePDFData` throws for missing stamps.uuid
- `validateInvoicePDFData` returns errors for missing RFC, missing UUID, etc.

---

### Step 7 — Service layer

Create `apps/web/lib/pdf/service.ts`:

```typescript
// apps/web/lib/pdf/service.ts

/**
 * Main entry point: generates PDF buffer from invoice data.
 * Does NOT upload to storage — returns buffer only.
 * 
 * Steps:
 * 1. Validate invoice is stamped
 * 2. Build InvoicePDFData from DB row
 * 3. Extract XML fields (sello for QR, NoCertificado)
 * 4. Fetch org logo from R2 if configured (logoUrl set)
 * 5. Generate QR code buffer
 * 6. Instantiate PDFGenerator and call generate()
 * 7. Return PDFGenerationResult
 */
export async function generateInvoicePDF(
  invoice: DatabaseInvoiceRow,
  branding: BrandingSettings,
  options?: Partial<PDFOptions>
): Promise<PDFGenerationResult> { ... }

/**
 * Uploads a PDF buffer to Cloudflare R2.
 * Key format: pdfs/{organizationId}/{invoiceId}/{uuid}.pdf
 * Returns: { url, r2Key }
 * ContentType: application/pdf
 * CacheControl: max-age=31536000 (1 year — PDFs are immutable once stamped)
 */
export async function uploadPDF(
  buffer: Buffer,
  organizationId: string,
  invoiceId: string,
  uuid: string
): Promise<{ url: string; r2Key: string }> { ... }

/**
 * Convenience function: generate + upload + update invoice.pdf_url in DB.
 * Returns the full PDFStorageResult.
 * Used by the invoice workflow after successful stamping.
 */
export async function generateAndStorePDF(
  invoice: DatabaseInvoiceRow,
  organizationId: string,
  branding: BrandingSettings,
  options?: Partial<PDFOptions>
): Promise<PDFStorageResult> { ... }
```

**Default branding** (used when organization has no branding configured):
```typescript
export const DEFAULT_BRANDING: BrandingSettings = {
  primaryColor: '#1E3A5F',
  secondaryColor: '#EBF2FA',
  logoUrl: null,
  logoBuffer: null,
  companyName: '',       // filled from invoice.issuerName
  website: null,
  phone: null,
};
```

---

### Step 8 — Integration bridge

Create `apps/web/lib/invoices/generate-pdf.ts`:

```typescript
// apps/web/lib/invoices/generate-pdf.ts
// Thin bridge connecting the invoice workflow to the PDF service.
// Fetches organization branding before calling the PDF service.

import { generateAndStorePDF } from '@/lib/pdf/service';
import { createClient } from '@/lib/supabase/server';

/**
 * Fetches organization branding settings from the DB,
 * pre-fetches the logo buffer from R2 if configured,
 * then generates and uploads the PDF.
 * Updates invoices.pdf_url in the DB.
 * 
 * @param invoiceId - The stamped invoice ID
 * @param organizationId - The organization ID
 * @param language - 'es' (default) or 'en'
 * @returns PDF URL
 */
export async function generateInvoicePDFAndStore(
  invoiceId: string,
  organizationId: string,
  language: 'es' | 'en' = 'es'
): Promise<string> { ... }
```

Export from `apps/web/lib/invoices/index.ts` alongside `stampInvoice`, `cancelStampedInvoice`, etc.

---

### Step 9 — Index exports

Create `apps/web/lib/pdf/index.ts`:
```typescript
export { generateInvoicePDF, uploadPDF, generateAndStorePDF, DEFAULT_BRANDING } from './service';
export { PDFGenerator } from './generator';
export { formatSATVerificationURL, generateSATQRCode, formatTotalForQR } from './qr-code';
export { buildInvoicePDFData, validateInvoicePDFData } from './templates/invoice-template';
export type { InvoicePDFData, BrandingSettings, PDFOptions, PDFGenerationResult, PDFStorageResult } from './types';
```

---

## Test Fixtures

Create `apps/web/lib/pdf/__tests__/fixtures/`:

### `stamped-invoice.ts` — minimal valid stamped invoice DB row
```typescript
export const STAMPED_INVOICE_FIXTURE = {
  id: 'inv-001',
  folio: 'F-00001',
  series: 'A',
  fecha: '2024-03-01T10:00:00',
  tipo_comprobante: 'I',
  forma_pago: '03',
  metodo_pago: 'PUE',
  moneda: 'MXN',
  tipo_cambio: null,
  subtotal: '5000.00',
  descuento: null,
  total: '5800.00',
  issuer_rfc: 'XAXX010101000',
  issuer_name: 'EMPRESA DEMO SA DE CV',
  issuer_tax_regime: '601',
  issuer_postal_code: '06600',
  receiver_rfc: 'XEXX010101000',
  receiver_name: 'CLIENTE DEMO',
  receiver_tax_regime: '616',
  receiver_postal_code: '01000',
  receiver_cfdi_use: 'G03',
  cfdi_xml: MINIMAL_STAMPED_XML,   // define separately
  status: 'stamped',
  stamps: {
    uuid: '05c519de-6d20-4258-88fb-c69a5970e927',
    fechaTimbrado: '2024-03-01T10:00:00',
    rfcProvCertif: 'SPR190613I52',
    selloCFD: 'KVttNUxxxxxxxxxxxxxxxx==',
    noCertificadoSAT: '30001000000400002495',
    selloSAT: 'qadm+mH3xxxxxxxxxxxxxx==',
    pacProvider: 'finkok',
    stampedAt: '2024-03-01T10:00:00Z',
  },
  tax_breakdown: {
    subtotal: '5000.00',
    discount: null,
    total_transferred_taxes: '800.00',
    total_withheld_taxes: null,
    total: '5800.00',
    taxes: [{ type: 'transferred', impuesto: '002', tasa_o_cuota: '0.160000', importe: '800.00' }],
  },
  items: [{
    cantidad: '1',
    unit_key: 'E48',
    unit_description: 'Unidad de servicio',
    product_service_key: '84111506',
    description: 'Servicios de desarrollo de software',
    unit_price: '5000.00',
    discount: null,
    subtotal: '5000.00',
    tax_object: '02',
    taxes: [{ type: 'transferred', impuesto: '002', tasa_o_cuota: '0.160000', importe: '800.00' }],
  }],
  pdf_url: null,
};
```

### `minimal-stamped-xml.ts` — minimal valid stamped CFDI XML
Include a valid minimal XML with `cfdi:Comprobante` root, `NoCertificado` attribute, `Sello` attribute, and the `tfd:TimbreFiscalDigital` complement. This is needed for `xml-extractor.ts` tests.

---

## Coverage Targets

| File | Target |
|------|--------|
| `qr-code.ts` | ≥95% |
| `xml-extractor.ts` | ≥95% |
| `templates/invoice-template.ts` | ≥90% |
| `generator.ts` | ≥80% |
| `service.ts` | ≥85% |
| `generate-pdf.ts` (bridge) | ≥80% |

**Total new tests: ≥80**

For `generator.ts`, mock `PDFKit` and `qrcode` — do not actually render PDFs in unit tests. Test that each section method is called with the right arguments. For integration testing, write one smoke test that generates an actual PDF buffer from the fixture data and verifies: (a) buffer is non-empty, (b) starts with `%PDF`, (c) is at least 10KB.

---

## Key Technical Decisions

**1. PDFKit over Puppeteer.** No Chromium binary, faster (~50ms vs 2-5s), deterministic output, suitable for structured invoice layout.

**2. QR from `invoices.stamps.uuid` + live XML parsing for `Sello`.** The `fe` parameter (last 8 of Sello) is NOT in the stamps JSONB — it comes from `cfdi:Comprobante/@Sello` in the XML. The xml-extractor reads this from `invoice.cfdi_xml`.

**3. `formatTotalForQR` is `parseFloat(total).toFixed(6)`.** Per Anexo 20 specification. Do not use locale formatting.

**4. PDFs are stored in R2 as immutable objects.** Once a CFDI is stamped it cannot change. Cache-Control: 1 year. Key includes UUID to ensure uniqueness.

**5. Branding is optional.** `DEFAULT_BRANDING` is used when an organization hasn't configured custom colors or a logo. The layout must look professional with default colors.

**6. Language parameter controls labels only, not content.** RFC numbers, amounts, SAT codes are always the same. Only section labels and date format change between `es` and `en`.

**7. Multi-page via `ensureSpace` before each row.** Never render content below `pageHeight - bottomMargin`. If a single description is very long, PDFKit's `doc.text()` with `{ width }` option handles text wrapping — measure height before deciding whether to page-break.

**8. Logo fetched before PDF generation, not during.** `service.ts` pre-fetches the logo Buffer from R2 before instantiating `PDFGenerator`. `PDFGenerator.addHeader` receives the buffer directly — no async inside PDFKit document flow.

---

## SAT Compliance Checklist

Before marking done, verify the generated PDF contains:

- [ ] "COMPROBANTE FISCAL DIGITAL POR INTERNET" text visible
- [ ] CFDI Version 4.0 displayed
- [ ] RFC and name of both emisor and receptor
- [ ] Régimen fiscal for both parties
- [ ] C.P. (postal code) for both parties
- [ ] Uso CFDI displayed with code and description
- [ ] Forma de pago with code and description
- [ ] Método de pago (PUE/PPD)
- [ ] Full UUID (folio fiscal) — all 36 characters
- [ ] Fecha de timbrado
- [ ] RFC del PAC
- [ ] No. de certificado SAT
- [ ] No. de certificado del emisor
- [ ] Sello digital del emisor (at least last 40 chars shown)
- [ ] Sello del SAT (at least last 40 chars shown)
- [ ] QR code present and encodes correct URL format
- [ ] Total matches `invoices.total` column exactly

---

## Definition of Done

- [ ] `apps/web/lib/pdf/types.ts` created
- [ ] `apps/web/lib/pdf/styles.ts` created with full label maps (all SAT catalog codes)
- [ ] `apps/web/lib/pdf/qr-code.ts` created with correct Anexo 20 URL format
- [ ] `apps/web/lib/pdf/xml-extractor.ts` created
- [ ] `apps/web/lib/pdf/generator.ts` — `PDFGenerator` class implemented
- [ ] `apps/web/lib/pdf/templates/invoice-template.ts` created
- [ ] `apps/web/lib/pdf/templates/receipt-template.ts` created (simplified)
- [ ] `apps/web/lib/pdf/service.ts` created with `generateInvoicePDF`, `uploadPDF`, `generateAndStorePDF`
- [ ] `apps/web/lib/pdf/index.ts` created with exports
- [ ] `apps/web/lib/invoices/generate-pdf.ts` bridge created
- [ ] `apps/web/lib/invoices/index.ts` updated to export `generateInvoicePDFAndStore`
- [ ] `pdfkit` and `qrcode` installed (with `@types/pdfkit`, `@types/qrcode`)
- [ ] Multi-page support working (items table paginates correctly)
- [ ] QR code encodes correct SAT verification URL (all 5 params: id, re, rr, tt, fe)
- [ ] `tt` parameter formatted per Anexo 20 (6 decimal places, no thousands separator)
- [ ] `fe` parameter is last 8 chars of `cfdi:Comprobante/@Sello` from XML (not stamps JSONB)
- [ ] Logo rendered if `branding.logoBuffer` present; company name rendered if null
- [ ] Bilingual labels working for both 'es' and 'en'
- [ ] PDF uploaded to R2 at `pdfs/{orgId}/{invoiceId}/{uuid}.pdf`
- [ ] `invoices.pdf_url` updated in DB after successful upload
- [ ] Smoke test: generates real PDF buffer starting with `%PDF`
- [ ] **≥80 new tests, all passing**

---

## Required Completion Summary

When done, provide a summary with:
1. All files created (with paths)
2. Test count per file
3. PDFKit and qrcode package versions installed
4. Confirmation that the smoke test passed (real PDF buffer generated)
5. Sample of the SAT verification URL format your QR code generates (use the fixture data)
6. Any deviations from this spec and why
