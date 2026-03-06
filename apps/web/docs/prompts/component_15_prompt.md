# Component 15: PAC Integration Service (Stamping)

## Implementation Prompt for AI Coding Agent

---

## What's Already Built

You are continuing development of a Mexican SAT tax compliance SaaS platform built as a Turborepo monorepo. The following components are complete and must not be duplicated or modified unless explicitly instructed:

### Core Infrastructure (Components 1–8)
- **Component 01**: Supabase project, PostgreSQL schema, Row-Level Security policies, multi-tenant isolation
- **Component 02**: Supabase Auth, RBAC, organization membership, JWT claims
- **Component 03**: Redis caching layer, session management, sub-5ms permission checks
- **Component 04**: CSD/e.firma storage in Cloudflare R2 (AES-256-GCM). `getOrganizationCSD(orgId)` returns `{ cerBuffer, keyBuffer, password }`. Columns: `csd_certificate_r2_key`, `csd_private_key_r2_key`, `csd_key_password_encrypted`, `csd_certificate_number`, `csd_expires_at`
- **Components 05–08**: Organization management, user management, multi-tenant data access patterns

### AI Services (Components 9–11)
- **Component 09**: Python FastAPI microservice at `apps/api/`, Sentence Transformers, pgvector semantic search
- **Component 10**: Tesseract OCR, invoice image scanning
- **Component 11**: Llama 3.1 conversational queries, SAT catalog matching

### Invoice Management
- **Component 12**: Complete invoice data model. Key columns: `issuer_postal_code`, `receiver_postal_code`, `product_service_key` (ClaveProdServ), `unit_key` (ClaveUnidad), `tax_breakdown` (JSONB), `xml_content` (TEXT), `stamps` (JSONB). Status workflow: `draft → pending_stamp → stamped → cancelled`
- **Component 13**: `@repo/cfdi` package at `packages/cfdi/`. Exports: `generateCFDI()`, `generateCadenaOriginal()`, `validateCFDI()`, `formatXML()`. 222 tests passing
- **Component 14**: Digital signature service extending `@repo/cfdi`. Exports: `signCFDI()`, `injectSignatureIntoXML()`, `verifyCFDISignature()`, `loadCertificate()`, `loadPrivateKey()`, `signData()`, `extractNoCertificado()`. Integration bridge: `apps/web/lib/invoices/sign-invoice.ts` → `signInvoice(invoice, orgId, password)`. 334 total tests passing

### Component 14 Integration Contract (Critical for Component 15)
`signInvoice()` returns `SignedInvoiceResult`:
```typescript
{
  signedXml: string;        // Complete CFDI XML with Sello, NoCertificado, Certificado injected
  sello: string;            // Base64 RSA-SHA256 signature
  noCertificado: string;    // e.g. "30001000000300023708"
  certInfo: {
    rfc: string;
    noCertificado: string;
    validTo: Date;
  };
  cadenaOriginal: string;
  warnings: string[];
}
```

The calling Server Action then calls `updateInvoice(invoiceId, { xml_content: signedResult.signedXml, status: 'pending_stamp' })`. **Component 15 picks up invoices in `pending_stamp` status and transitions them to `stamped`.**

---

## Reuse Instructions

- **Import** `@repo/cfdi` for any XML parsing or TFD extraction helpers — do not reimplement XML logic
- **Import** `apps/web/lib/organizations/certificates.ts` for `getOrganizationCSD()` — do not reimplement R2 fetching
- **Import** the existing Supabase client from `apps/web/lib/supabase/` — do not create new DB clients
- **Use** the existing `organizations` table for PAC credential lookups
- **Do not** modify `packages/cfdi/` — only consume its exports
- **Do not** add a new `status` to the invoice workflow — `pending_stamp` and `stamped` already exist in Component 12

---

## Mexican Tax Domain Context

### What is a PAC?
A **Proveedor Autorizado de Certificación (PAC)** is an SAT-certified third party authorized to validate and stamp CFDI documents. The PAC:
1. Receives a pre-signed CFDI XML (with `Sello`, `NoCertificado`, `Certificado` already populated by Component 14)
2. Validates the XML against SAT rules
3. Generates a UUID (Folio Fiscal) and `tfd:TimbreFiscalDigital` complement
4. Returns the fully-stamped XML with the TFD embedded in `<cfdi:Complemento>`

### TFD (Timbre Fiscal Digital) — Version 1.1
The PAC injects this XML node into `<cfdi:Complemento>`:
```xml
<cfdi:Complemento>
  <tfd:TimbreFiscalDigital
    xmlns:tfd="http://www.sat.gob.mx/TimbreFiscalDigital"
    xsi:schemaLocation="http://www.sat.gob.mx/TimbreFiscalDigital
      http://www.sat.gob.mx/sitio_internet/cfd/TimbreFiscalDigital/TimbreFiscalDigitalv11.xsd"
    Version="1.1"
    UUID="05c519de-6d20-4258-88fb-c69a5970e927"
    FechaTimbrado="2024-03-01T10:00:00"
    RfcProvCertif="SPR190613I52"
    SelloCFD="KVttNU/m3oEfJG/3efOsn3pUqZTuZ431Fm..."
    NoCertificadoSAT="30001000000400002495"
    SelloSAT="qadm+mH3gZuYMnQZSWVoD/AEkekn8Mw1O..."
  />
</cfdi:Complemento>
```

TFD attributes to extract and store:
| Attribute | Description | Store in |
|---|---|---|
| `UUID` | 36-char Folio Fiscal (RFC 4122) | `invoices.stamps.uuid` |
| `FechaTimbrado` | ISO timestamp (Mexico City zone) | `invoices.stamps.fechaTimbrado` |
| `RfcProvCertif` | PAC's RFC | `invoices.stamps.rfcProvCertif` |
| `SelloCFD` | Echo of the issuer's Sello | `invoices.stamps.selloCFD` |
| `NoCertificadoSAT` | SAT's certificate number | `invoices.stamps.noCertificadoSAT` |
| `SelloSAT` | SAT's own signature | `invoices.stamps.selloSAT` |

### Cancellation Motivos (SAT-mandated since January 2022)
| Clave | Description | FolioSustitucion Required? |
|---|---|---|
| `01` | Comprobante emitido con errores con relación | YES — UUID of replacement CFDI |
| `02` | Comprobante emitido con errores sin relación | No |
| `03` | No se llevó a cabo la operación | No |
| `04` | Operación nominativa relacionada en una factura global | No |

### PAC Provider: Finkok (Primary)

**Environments:**
- Demo/Test: `https://demo-facturacion.finkok.com/servicios/soap/stamp.wsdl`
- Production: `https://facturacion.finkok.com/servicios/soap/stamp.wsdl`
- Cancel Demo: `https://demo-facturacion.finkok.com/servicios/soap/cancel.wsdl`
- Cancel Production: `https://facturacion.finkok.com/servicios/soap/cancel.wsdl`

**Stamp Method: `stamp`**
- Request params: `xml` (bytes, **not** base64), `username`, `password`
- Success: `stampResult.CodEstatus === "Comprobante timbrado satisfactoriamente"`
- Success fields: `stampResult.xml`, `stampResult.UUID`, `stampResult.Fecha`, `stampResult.SatSeal`, `stampResult.NoCertificadoSAT`
- Duplicate stamp (code `307`): Previously stamped — retrieve the XML from `stampResult.xml` if present; if empty, call `stamped()` service with a retry loop (Finkok has a known race condition where `stamp` returns 307 but `stamped` needs ~4s to be consistent)
- Error: `stampResult.Incidencias.Incidencia[0].CodigoError` + `.MensajeIncidencia`

**Key Finkok Error Codes:**
| Code | Meaning | Retryable? |
|---|---|---|
| `307` | CFDI contains previous stamp | No (idempotent recovery) |
| `308` | Certificate not from SAT | No |
| `401` | Fecha outside valid range | No |
| `402` | RFC not registered as taxpayer | No |
| `704` | Wrong CSD password | No |
| `705` | Invalid XML structure | No |
| `702` | RFC not registered under Finkok account | No |
| `703` | Account suspended | No |
| Network timeout | Connection failure | YES |
| `5xx` HTTP | Server error | YES |

**Cancel Method: `cancel`**
- Request includes: `UUIDS` (array), `username`, `password`, `taxpayer_id` (RFC), `cer` (base64 PEM), `key` (base64 PEM encrypted)
- Cancel response per UUID: `EstatusUUID` values:
  - `201` = Cancelled successfully
  - `202` = Previously cancelled
  - `203` = RFC mismatch
  - `205` = UUID not found (transient SAT issue — retryable after delay)
- **Important**: Finkok cancel requires PEM-encoded cert/key (not DER). Must convert: `openssl x509 -inform DER -outform PEM` and `openssl pkcs8 -inform DER -topk8`

### PAC Provider: SW Sapien (Secondary)

**Authentication**: REST, Bearer token
- Token endpoint: `POST https://services.test.sw.com.mx/v2/security/authenticate`
  - Body: `{ "user": "email@domain.com", "password": "..." }`
  - Returns: `{ data: { token: string, expires_in: number }, status: "success" }`
  - Token type: temporary (2h) or infinite (no expiry, set in ADT portal)
  - Cache the token and refresh when expired

**Stamp Endpoint:**
- `POST https://services.test.sw.com.mx/cfdi33/stamp/v4/` (compatible with CFDI 4.0 despite path name)
- Headers: `Authorization: Bearer {token}`, `Content-Type: multipart/form-data`
- Body: form-data with `xml` field (raw XML file)
- Success response: `{ data: { tfd: "<tfd:TimbreFiscalDigital .../>", cfdi: "<?xml..." }, status: "success" }`
- Error response: `{ message: "CFDI40101 - ...", messageDetail: "...", data: null, status: "error" }`

**Cancel Endpoint (SW):**
- `DELETE https://services.test.sw.com.mx/cfdi33/{uuid}` with JSON body `{ "motivo": "02", "folioSustitucion": "" }`

---

## File Structure to Create

All new files go under `apps/web/src/server/pac/`:

```
apps/web/src/server/pac/
├── types.ts                   # Step 1
├── errors.ts                  # Step 2
├── tfd-parser.ts              # Step 3
├── soap-client.ts             # Step 4
├── providers/
│   ├── base.ts                # Step 5
│   ├── finkok.ts              # Step 6
│   └── sw.ts                  # Step 7
└── service.ts                 # Step 8

apps/web/lib/invoices/
└── stamp-invoice.ts           # Step 9 — integration bridge

apps/web/src/server/pac/__tests__/
├── tfd-parser.test.ts
├── errors.test.ts
├── finkok.test.ts
├── sw.test.ts
└── service.test.ts

supabase/migrations/
└── 20260307000001_add_pac_credentials.sql   # Step 10
```

---

## Database Schema Addition

### New table: `organization_pac_credentials`
```sql
CREATE TABLE organization_pac_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('finkok', 'sw')),
  is_primary BOOLEAN NOT NULL DEFAULT false,
  environment TEXT NOT NULL DEFAULT 'sandbox' CHECK (environment IN ('sandbox', 'production')),
  -- Finkok credentials
  finkok_username TEXT,
  finkok_password_encrypted TEXT,   -- AES-256-GCM, same pattern as csd_key_password_encrypted
  -- SW credentials
  sw_username TEXT,
  sw_password_encrypted TEXT,
  sw_token_encrypted TEXT,          -- cached infinite token
  sw_token_expires_at TIMESTAMPTZ,
  -- Metadata
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(organization_id, provider)
);

-- RLS: Same pattern as other organization tables
ALTER TABLE organization_pac_credentials ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_members_can_read_pac_credentials"
  ON organization_pac_credentials FOR SELECT
  USING (organization_id IN (
    SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
  ));

CREATE POLICY "org_admins_can_manage_pac_credentials"
  ON organization_pac_credentials FOR ALL
  USING (organization_id IN (
    SELECT organization_id FROM organization_members
    WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
  ));
```

### Additions to `invoices` table
The `stamps` JSONB column (already in Component 12) will store:
```typescript
// invoices.stamps shape (documented, not a schema change)
{
  uuid: string;              // SAT Folio Fiscal
  fechaTimbrado: string;     // ISO timestamp
  rfcProvCertif: string;     // PAC's RFC
  selloCFD: string;          // Echo of issuer Sello
  noCertificadoSAT: string;  // SAT cert number
  selloSAT: string;          // SAT signature
  pacProvider: string;       // "finkok" | "sw"
  stampedAt: string;         // ISO timestamp of our system recording
}
```

---

## Implementation Order

### Step 1 — `types.ts` (write tests first)

```typescript
// apps/web/src/server/pac/types.ts

export type PACProvider = 'finkok' | 'sw';
export type PACEnvironment = 'sandbox' | 'production';
export type CancelMotivo = '01' | '02' | '03' | '04';

export interface PACCredentials {
  provider: PACProvider;
  environment: PACEnvironment;
  // Finkok
  finkokUsername?: string;
  finkokPassword?: string;
  // SW
  swUsername?: string;
  swPassword?: string;
  swToken?: string;          // pre-authenticated token (infinite or cached)
  swTokenExpiresAt?: Date;
}

export interface StampRequest {
  signedXml: string;         // Complete pre-signed CFDI XML from Component 14
  issuerRfc: string;         // Organization RFC — for logging and validation
  orgId: string;             // For credential lookup
}

export interface StampResult {
  stampedXml: string;        // Full CFDI XML with TFD complement injected
  uuid: string;              // SAT Folio Fiscal (36-char UUID)
  fechaTimbrado: string;     // ISO timestamp from TFD
  rfcProvCertif: string;     // PAC RFC
  selloCFD: string;          // Echo of issuer Sello
  noCertificadoSAT: string;  // SAT certificate number
  selloSAT: string;          // SAT signature
  pacProvider: PACProvider;
}

export interface CancelRequest {
  uuid: string;              // SAT Folio Fiscal to cancel
  issuerRfc: string;
  motivo: CancelMotivo;
  folioSustitucion?: string; // Required when motivo === '01'
  orgId: string;
}

export interface CancelResult {
  uuid: string;
  estatusUUID: string;       // '201' = success, '202' = already cancelled, etc.
  acuse: string;             // Raw XML acuse from SAT
  cancelled: boolean;
}

export interface TFDData {
  uuid: string;
  fechaTimbrado: string;
  rfcProvCertif: string;
  selloCFD: string;
  noCertificadoSAT: string;
  selloSAT: string;
  version: string;           // Should be "1.1" for CFDI 4.0
}
```

**Tests for `types.ts`**: Since this is pure types, add type-level tests using `expectType` patterns or skip — types are exercised by all other tests.

---

### Step 2 — `errors.ts` (write tests first)

```typescript
// apps/web/src/server/pac/errors.ts

export type PACErrorCode =
  | 'PAC_STAMP_DUPLICATE'        // Code 307 — already stamped
  | 'PAC_INVALID_XML'            // Code 705 — XML structure invalid
  | 'PAC_CERT_NOT_FROM_SAT'      // Code 308
  | 'PAC_FECHA_OUT_OF_RANGE'     // Code 401
  | 'PAC_RFC_NOT_REGISTERED'     // Code 402 / 702
  | 'PAC_ACCOUNT_SUSPENDED'      // Code 703
  | 'PAC_WRONG_PASSWORD'         // Code 704
  | 'PAC_NETWORK_ERROR'          // Connection/timeout
  | 'PAC_AUTH_FAILED'            // SW token auth failure
  | 'PAC_UNKNOWN_ERROR'
  | 'TFD_PARSE_ERROR'            // Could not extract TFD from stamped XML
  | 'TFD_MISSING'                // Stamped XML has no TFD complement
  | 'CANCEL_UUID_NOT_FOUND'      // Code 205
  | 'CANCEL_RFC_MISMATCH'        // Code 203
  | 'CANCEL_ALREADY_CANCELLED'   // Code 202
  | 'CANCEL_REQUIRES_FOLIO_SUSTITUCION'; // Motivo 01 missing folioSustitucion

export class PACError extends Error {
  constructor(
    public readonly code: PACErrorCode,
    message: string,
    public readonly retryable: boolean = false,
    public readonly originalError?: unknown,
  ) {
    super(message);
    this.name = 'PACError';
  }
}

export function isRetryable(error: unknown): boolean {
  if (error instanceof PACError) return error.retryable;
  // Network errors and 5xx are retryable
  if (error instanceof Error) {
    return error.message.includes('ECONNREFUSED') ||
           error.message.includes('ETIMEDOUT') ||
           error.message.includes('ENOTFOUND');
  }
  return false;
}

export function mapFinkokError(codigoError: string, mensaje: string): PACError {
  switch (codigoError) {
    case '307': return new PACError('PAC_STAMP_DUPLICATE', `Duplicate stamp: ${mensaje}`, false);
    case '308': return new PACError('PAC_CERT_NOT_FROM_SAT', mensaje, false);
    case '401': return new PACError('PAC_FECHA_OUT_OF_RANGE', mensaje, false);
    case '402':
    case '702': return new PACError('PAC_RFC_NOT_REGISTERED', mensaje, false);
    case '703': return new PACError('PAC_ACCOUNT_SUSPENDED', mensaje, false);
    case '704': return new PACError('PAC_WRONG_PASSWORD', mensaje, false);
    case '705': return new PACError('PAC_INVALID_XML', mensaje, false);
    default:    return new PACError('PAC_UNKNOWN_ERROR', `Finkok ${codigoError}: ${mensaje}`, false);
  }
}

export function mapSWError(message: string): PACError {
  if (message.includes('AU2000')) return new PACError('PAC_AUTH_FAILED', message, false);
  if (message.includes('CFDI40101') || message.includes('structure')) return new PACError('PAC_INVALID_XML', message, false);
  return new PACError('PAC_UNKNOWN_ERROR', message, false);
}
```

**Tests — `errors.test.ts`** (≥ 15 tests):
- `mapFinkokError('307', ...)` → `PAC_STAMP_DUPLICATE`, not retryable
- `mapFinkokError('705', ...)` → `PAC_INVALID_XML`, not retryable
- `mapFinkokError('999', ...)` → `PAC_UNKNOWN_ERROR`
- `mapSWError('AU2000...')` → `PAC_AUTH_FAILED`
- `isRetryable(new PACError('PAC_NETWORK_ERROR', ..., true))` → `true`
- `isRetryable(new PACError('PAC_INVALID_XML', ..., false))` → `false`
- `isRetryable(new Error('ETIMEDOUT'))` → `true`
- `isRetryable(new Error('regular error'))` → `false`
- `PACError` is `instanceof Error` → `true`
- `PACError.name === 'PACError'` → `true`

---

### Step 3 — `tfd-parser.ts` (write tests first)

Uses Node.js built-in `DOMParser` (via `@xmldom/xmldom` if needed for server-side) or the `xml2js` npm package already in the monorepo. **Prefer `@xmldom/xmldom`** for consistency with the CFDI parsing approach already used in `packages/cfdi/`.

```typescript
// apps/web/src/server/pac/tfd-parser.ts

import { DOMParser } from '@xmldom/xmldom';
import { PACError } from './errors';

const TFD_NAMESPACE = 'http://www.sat.gob.mx/TimbreFiscalDigital';

export function extractTFD(stampedXml: string): TFDData {
  // Parse the full stamped XML
  // Navigate: cfdi:Comprobante → cfdi:Complemento → tfd:TimbreFiscalDigital
  // Throw TFD_MISSING if not found
  // Throw TFD_PARSE_ERROR if attributes are missing/malformed
}

export function getUUID(tfdData: TFDData): string {
  // Validate 36-char UUID format (RFC 4122)
  return tfdData.uuid;
}

export function getSATCertNumber(tfdData: TFDData): string {
  return tfdData.noCertificadoSAT;
}

export function getStampDate(tfdData: TFDData): string {
  return tfdData.fechaTimbrado;
}
```

**Tests — `tfd-parser.test.ts`** (≥ 20 tests):

Use this fixture — a minimal but valid structure:
```xml
<?xml version="1.0" encoding="UTF-8"?>
<cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/4"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  Version="4.0" Sello="ABC123...">
  <cfdi:Complemento>
    <tfd:TimbreFiscalDigital
      xmlns:tfd="http://www.sat.gob.mx/TimbreFiscalDigital"
      Version="1.1"
      UUID="05c519de-6d20-4258-88fb-c69a5970e927"
      FechaTimbrado="2024-03-01T10:00:00"
      RfcProvCertif="SPR190613I52"
      SelloCFD="KVttNU..."
      NoCertificadoSAT="30001000000400002495"
      SelloSAT="qadm+mH3..." />
  </cfdi:Complemento>
</cfdi:Comprobante>
```

Test cases:
- `extractTFD(validXml)` → correct TFDData object
- `getUUID(tfd)` → `"05c519de-6d20-4258-88fb-c69a5970e927"`
- `getSATCertNumber(tfd)` → `"30001000000400002495"`
- `getStampDate(tfd)` → `"2024-03-01T10:00:00"`
- `extractTFD(xmlWithoutComplemento)` → throws `TFD_MISSING`
- `extractTFD(xmlWithComplementoButNoTFD)` → throws `TFD_MISSING`
- `extractTFD(xmlWithTFDMissingUUID)` → throws `TFD_PARSE_ERROR`
- `extractTFD(xmlWithTFDMissingSelloSAT)` → throws `TFD_PARSE_ERROR`
- `extractTFD(malformedXml)` → throws `TFD_PARSE_ERROR`
- `extractTFD('')` → throws `TFD_PARSE_ERROR`
- TFD Version should be `"1.1"` for CFDI 4.0
- `extractTFD` handles XML with CDATA sections in TFD values

---

### Step 4 — `soap-client.ts` (write tests first)

Build a thin, **dependency-injected** SOAP client that does NOT load WSDLs at runtime (to avoid network calls during tests). Instead it builds raw SOAP envelopes manually — Finkok's API is well-documented enough for this.

```typescript
// apps/web/src/server/pac/soap-client.ts

export interface SOAPCallOptions {
  endpoint: string;     // Full URL (not WSDL)
  soapAction: string;
  body: string;         // Raw XML for the SOAP body
  timeoutMs?: number;   // Default 30000
}

export interface SOAPResponse {
  statusCode: number;
  rawXml: string;
}

export async function callSOAP(options: SOAPCallOptions): Promise<SOAPResponse> {
  // Build: POST to endpoint
  // Headers: Content-Type: text/xml; charset=utf-8, SOAPAction: soapAction
  // Body: full SOAP envelope wrapping options.body
  // Use native fetch() — available in Next.js App Router server context
  // Throw PACError('PAC_NETWORK_ERROR', ..., retryable: true) on network failure
}

export function buildStampEnvelope(xml: Buffer, username: string, password: string): string {
  // Finkok stamp: xml as raw bytes in <xml> element (NOT base64)
  // Note: Finkok stamp endpoint accepts POST to:
  //   https://demo-facturacion.finkok.com/servicios/soap/stamp.wsdl
  //   with method: stamp (params: xml[bytes], username, password)
  // Build the SOAP envelope manually
}

export function parseSOAPResponse(rawXml: string, resultKey: string): Record<string, unknown> {
  // Extract the <{resultKey}> element from SOAP response body
  // Parse inner fields into a flat object
  // Return parsed object or throw on malformed SOAP
}
```

**SOAP endpoint URLs (not WSDLs):**
- Finkok Demo stamp: `https://demo-facturacion.finkok.com/servicios/soap/stamp`
- Finkok Prod stamp: `https://facturacion.finkok.com/servicios/soap/stamp`
- Finkok Demo cancel: `https://demo-facturacion.finkok.com/servicios/soap/cancel`
- Finkok Prod cancel: `https://facturacion.finkok.com/servicios/soap/cancel`

**Tests — `soap-client.test.ts`** (≥ 12 tests, all mocked):
- `callSOAP` with mocked `fetch` → returns `SOAPResponse`
- `callSOAP` on fetch timeout → throws `PACError` with `retryable: true`
- `callSOAP` on network error → throws `PACError` with `retryable: true`
- `buildStampEnvelope` produces valid SOAP XML structure
- `buildStampEnvelope` includes username and password in correct elements
- `parseSOAPResponse` extracts nested fields correctly
- `parseSOAPResponse` handles Incidencias array
- `parseSOAPResponse` on malformed XML → throws

---

### Step 5 — `providers/base.ts`

```typescript
// apps/web/src/server/pac/providers/base.ts

import type { PACCredentials, StampRequest, StampResult, CancelRequest, CancelResult } from '../types';

export interface PACProviderInterface {
  stamp(request: StampRequest, credentials: PACCredentials): Promise<StampResult>;
  cancel(request: CancelRequest, credentials: PACCredentials): Promise<CancelResult>;
  queryStatus(uuid: string, issuerRfc: string, credentials: PACCredentials): Promise<'active' | 'cancelled' | 'unknown'>;
}
```

No tests needed for this interface file.

---

### Step 6 — `providers/finkok.ts` (write tests first)

```typescript
// apps/web/src/server/pac/providers/finkok.ts

export class FinkokProvider implements PACProviderInterface {

  async stamp(request: StampRequest, creds: PACCredentials): Promise<StampResult> {
    // 1. Encode signedXml to UTF-8 bytes
    // 2. Call callSOAP() → Finkok stamp endpoint
    // 3. Parse stampResult from response
    // 4. Check CodEstatus:
    //    - "Comprobante timbrado satisfactoriamente" → success path
    //    - Incidencias → check CodigoError
    //      - "307": attempt to recover stampResult.xml; if empty, call this.recoverFromDuplicate()
    //      - Other: call mapFinkokError() → throw PACError
    // 5. On success: call extractTFD(stampResult.xml) to parse TFD
    // 6. Return StampResult
  }

  private async recoverFromDuplicate(
    originalXml: string,
    creds: PACCredentials
  ): Promise<string> {
    // Call Finkok "stamped" service with the original pre-signed XML
    // Retry up to 3 times with 2-second delay (Finkok race condition)
    // Return the stamped XML if found
    // Throw PAC_STAMP_DUPLICATE if not recoverable after retries
  }

  async cancel(request: CancelRequest, creds: PACCredentials): Promise<CancelResult> {
    // Validate: if motivo === '01', folioSustitucion must be present
    // Finkok cancel requires PEM-encoded cert and key
    // Get org CSD from getOrganizationCSD(orgId)
    // Convert DER → PEM: use Node.js crypto (cert.export({ type: 'pkcs8', format: 'pem' }) etc.)
    // Call Finkok cancel SOAP
    // Parse EstatusUUID per folio
    // Return CancelResult
  }

  async queryStatus(uuid: string, issuerRfc: string, creds: PACCredentials): Promise<'active' | 'cancelled' | 'unknown'> {
    // Call Finkok get_sat_status or equivalent
    // Return normalized status
  }
}
```

**DER → PEM conversion for cancellation (Node.js crypto, no node-forge):**
```typescript
import * as crypto from 'crypto';

// Certificate (DER → PEM):
const cert = new crypto.X509Certificate(cerBuffer);
const pemCert = cert.toString(); // Returns PEM format directly

// Private key (PKCS8 DER encrypted → PEM):
const privateKey = crypto.createPrivateKey({
  key: keyBuffer,
  format: 'der',
  type: 'pkcs8',
  passphrase: password,
});
const pemKey = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
```

**Tests — `finkok.test.ts`** (≥ 25 tests, all mocked):
- `stamp()` with mocked successful SOAP response → returns `StampResult`
- `stamp()` extracts all TFD fields correctly from mock response
- `stamp()` on code `307` with xml in response → recovers correctly
- `stamp()` on code `307` with empty xml → calls `recoverFromDuplicate`
- `recoverFromDuplicate` retries up to 3 times on 603 error
- `recoverFromDuplicate` returns stamped XML on second attempt
- `recoverFromDuplicate` throws `PAC_STAMP_DUPLICATE` after max retries
- `stamp()` on code `705` → throws `PACError('PAC_INVALID_XML')`
- `stamp()` on network error → throws `PACError('PAC_NETWORK_ERROR', ..., retryable: true)`
- `cancel()` with motivo `02` → calls SOAP correctly
- `cancel()` with motivo `01` without `folioSustitucion` → throws `CANCEL_REQUIRES_FOLIO_SUSTITUCION`
- `cancel()` response `EstatusUUID: 201` → `CancelResult.cancelled = true`
- `cancel()` response `EstatusUUID: 202` → `CancelResult.cancelled = true` (already cancelled)
- `cancel()` response `EstatusUUID: 205` → throws `CANCEL_UUID_NOT_FOUND` (retryable)
- `cancel()` PEM conversion of DER cert/key → correct PEM format

---

### Step 7 — `providers/sw.ts` (write tests first)

```typescript
// apps/web/src/server/pac/providers/sw.ts

export class SWProvider implements PACProviderInterface {

  private tokenCache: Map<string, { token: string; expiresAt: Date }> = new Map();

  async authenticate(creds: PACCredentials): Promise<string> {
    // If swToken is provided and not expired → return it
    // If cached token exists and not expired → return cached
    // POST to /v2/security/authenticate with { user, password }
    // Cache token with expiry (subtract 5 min buffer)
    // Throw PAC_AUTH_FAILED on error
  }

  async stamp(request: StampRequest, creds: PACCredentials): Promise<StampResult> {
    // 1. Authenticate → get Bearer token
    // 2. POST to /cfdi33/stamp/v4/ with multipart form-data, xml field
    // 3. Parse JSON response:
    //    - status === "success" → extract data.tfd and data.cfdi
    //    - status === "error" → mapSWError(message) → throw
    // 4. extractTFD from the returned cfdi XML
    // 5. Return StampResult
  }

  async cancel(request: CancelRequest, creds: PACCredentials): Promise<CancelResult> {
    // SW cancel: DELETE to /cfdi33/{uuid} with JSON body { motivo, folioSustitucion }
    // Parse response
  }

  async queryStatus(uuid: string, issuerRfc: string, creds: PACCredentials): Promise<'active' | 'cancelled' | 'unknown'> {
    // GET /cfdi33/{uuid}/status
  }
}
```

**SW Environment URLs:**
- Sandbox: `https://services.test.sw.com.mx`
- Production: `https://services.sw.com.mx`

**Tests — `sw.test.ts`** (≥ 20 tests, all mocked):
- `authenticate()` with username/password → POST to `/v2/security/authenticate`
- `authenticate()` uses cached token when not expired
- `authenticate()` refreshes token when expired
- `authenticate()` on `AU2000` error → throws `PAC_AUTH_FAILED`
- `stamp()` calls authenticate first
- `stamp()` POSTs multipart form-data with xml field
- `stamp()` parses `data.tfd` and `data.cfdi` from success response
- `stamp()` calls `extractTFD` on returned cfdi
- `stamp()` on status `"error"` → throws `PACError`
- `cancel()` sends correct motivo in body
- `cancel()` with motivo `01` without `folioSustitucion` → throws

---

### Step 8 — `service.ts` (write tests first)

This is the main orchestrator used by the rest of the app.

```typescript
// apps/web/src/server/pac/service.ts

import { createClient } from '@/lib/supabase/server';
import { FinkokProvider } from './providers/finkok';
import { SWProvider } from './providers/sw';
import type { PACProviderInterface } from './providers/base';
import type { StampRequest, StampResult, CancelRequest, CancelResult, PACCredentials } from './types';
import { PACError, isRetryable } from './errors';

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

export async function getPACCredentials(orgId: string): Promise<PACCredentials> {
  // Query organization_pac_credentials WHERE organization_id = orgId AND is_primary = true
  // Decrypt password using same AES-256-GCM pattern as Component 04
  // Return PACCredentials
  // Throw if no credentials found
}

export function getPACProvider(credentials: PACCredentials): PACProviderInterface {
  switch (credentials.provider) {
    case 'finkok': return new FinkokProvider();
    case 'sw':     return new SWProvider();
    default:       throw new PACError('PAC_UNKNOWN_ERROR', `Unknown PAC provider: ${credentials.provider}`);
  }
}

export async function stampCFDI(request: StampRequest): Promise<StampResult> {
  const credentials = await getPACCredentials(request.orgId);
  const provider = getPACProvider(credentials);

  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const result = await provider.stamp(request, credentials);
      return result;
    } catch (error) {
      lastError = error;
      if (!isRetryable(error) || attempt === MAX_RETRIES) throw error;
      await sleep(RETRY_DELAY_MS * attempt); // exponential backoff
    }
  }
  throw lastError;
}

export async function cancelCFDI(request: CancelRequest): Promise<CancelResult> {
  // Same pattern: getPACCredentials → getPACProvider → provider.cancel()
  // No retries for cancel (idempotent is handled per-provider)
}

export async function queryStatus(uuid: string, orgId: string): Promise<'active' | 'cancelled' | 'unknown'> {
  // getPACCredentials → getPACProvider → provider.queryStatus()
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
```

**Tests — `service.test.ts`** (≥ 20 tests, all mocked):
- `getPACCredentials` queries correct org and decrypts password
- `getPACCredentials` throws when no credentials found
- `getPACProvider('finkok')` → returns `FinkokProvider`
- `getPACProvider('sw')` → returns `SWProvider`
- `stampCFDI` calls provider.stamp and returns result
- `stampCFDI` retries on retryable error, succeeds on second attempt
- `stampCFDI` does not retry on non-retryable error (`PAC_INVALID_XML`)
- `stampCFDI` throws after MAX_RETRIES exhausted on retryable error
- `cancelCFDI` calls provider.cancel
- `queryStatus` calls provider.queryStatus

---

### Step 9 — `apps/web/lib/invoices/stamp-invoice.ts` (write tests first)

This is the integration bridge called by Server Actions. It wires Component 14 → Component 15 → database update.

```typescript
// apps/web/lib/invoices/stamp-invoice.ts

import { stampCFDI } from '@/server/pac/service';
import { createClient } from '@/lib/supabase/server';
import type { Invoice } from '@/lib/invoices/types';

export interface StampInvoiceResult {
  invoice: Invoice;         // Updated invoice with stamped status
  uuid: string;
  fechaTimbrado: string;
  noCertificadoSAT: string;
  selloSAT: string;
}

export async function stampInvoice(
  invoiceId: string,
  orgId: string,
): Promise<StampInvoiceResult> {
  const supabase = createClient();

  // 1. Fetch invoice (must be status = 'pending_stamp' and have xml_content)
  // 2. Guard: if status !== 'pending_stamp', throw with clear message
  // 3. Call stampCFDI({ signedXml: invoice.xml_content, issuerRfc: invoice.issuer_rfc, orgId })
  // 4. Update invoice:
  //    - xml_content = stampResult.stampedXml
  //    - status = 'stamped'
  //    - stamps = { uuid, fechaTimbrado, rfcProvCertif, selloCFD, noCertificadoSAT, selloSAT, pacProvider, stampedAt }
  // 5. Return StampInvoiceResult
}

export async function cancelInvoice(
  invoiceId: string,
  orgId: string,
  motivo: '01' | '02' | '03' | '04',
  folioSustitucion?: string,
): Promise<void> {
  // 1. Fetch invoice (must be status = 'stamped' and have stamps.uuid)
  // 2. Call cancelCFDI()
  // 3. Update invoice status = 'cancelled'
  // 4. Store acuse in stamps JSONB
}
```

**Tests — `stamp-invoice.test.ts`** (≥ 15 tests, all mocked):
- `stampInvoice` on non-`pending_stamp` invoice → throws with clear message
- `stampInvoice` on invoice with null `xml_content` → throws
- `stampInvoice` calls `stampCFDI` with correct arguments
- `stampInvoice` updates `xml_content` to stamped XML
- `stampInvoice` updates `status` to `'stamped'`
- `stampInvoice` stores complete stamps JSONB
- `stampInvoice` returns correct `StampInvoiceResult`
- `cancelInvoice` on non-`stamped` invoice → throws
- `cancelInvoice` motivo `01` without `folioSustitucion` → throws

---

### Step 10 — Database Migration

```sql
-- supabase/migrations/20260307000001_add_pac_credentials.sql

CREATE TABLE organization_pac_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('finkok', 'sw')),
  is_primary BOOLEAN NOT NULL DEFAULT false,
  environment TEXT NOT NULL DEFAULT 'sandbox' CHECK (environment IN ('sandbox', 'production')),
  finkok_username TEXT,
  finkok_password_encrypted TEXT,
  sw_username TEXT,
  sw_password_encrypted TEXT,
  sw_token_encrypted TEXT,
  sw_token_expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(organization_id, provider)
);

ALTER TABLE organization_pac_credentials ENABLE ROW LEVEL SECURITY;

-- Read: any org member
CREATE POLICY "org_members_read_pac_creds"
  ON organization_pac_credentials FOR SELECT
  USING (organization_id IN (
    SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
  ));

-- Write: org owner or admin only
CREATE POLICY "org_admins_manage_pac_creds"
  ON organization_pac_credentials FOR ALL
  USING (organization_id IN (
    SELECT organization_id FROM organization_members
    WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
  ));

-- Index for common lookup
CREATE INDEX idx_pac_creds_org_primary
  ON organization_pac_credentials(organization_id, is_primary)
  WHERE is_primary = true;

-- Trigger for updated_at
CREATE TRIGGER update_pac_creds_updated_at
  BEFORE UPDATE ON organization_pac_credentials
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
```

---

## Key Technical Decisions

### No SOAP library dependency (`soap` npm package)
The `soap` npm package loads WSDLs over the network at startup, making it incompatible with edge runtime and difficult to test. Instead, build raw SOAP envelopes manually. Finkok's `stamp` and `cancel` methods have simple, well-documented XML structures. Use Node.js built-in `fetch()` for HTTP calls.

### Finkok stamp sends XML as raw bytes, not base64
The `stamp` SOAP method parameter `xml` expects raw XML bytes. The `sign_stamp` method (which signs AND stamps) expects base64. Since Component 14 already handles signing, use `stamp` with raw bytes.

### SW uses REST + Bearer token, not SOAP
SW's stamping endpoint (`/cfdi33/stamp/v4/`) is REST with `multipart/form-data`. The XML is sent as a file field — use `FormData` with a `Blob`.

### Idempotent stamp handling (Finkok code 307)
When Finkok returns code 307 (duplicate stamp), it means the CFDI was already stamped. This is treated as a recoverable condition, not an error. Check `stampResult.xml` first — if populated, use it. If empty (known race condition), call the `stamped` service with retry logic.

### TFD extraction via XML parsing, not regex
The `tfd:TimbreFiscalDigital` element must be extracted from the stamped XML using a proper XML parser. The TFD namespace is `http://www.sat.gob.mx/TimbreFiscalDigital`. Use `@xmldom/xmldom` (already available via `packages/cfdi/`).

### Cancellation requires motivo since January 2022
All CFDI cancellations must include a `motivo` (01–04). Motivo `01` additionally requires a `folioSustitucion` (UUID of the replacement CFDI). Validate this at the service layer before calling the PAC.

### Credential encryption follows Component 04 pattern
PAC passwords stored in `organization_pac_credentials` use the same AES-256-GCM encryption pattern established in Component 04 for CSD passwords. Reuse that decryption utility — do not reinvent it.

---

## Expected Behavior Examples

### Successful stamp flow
```typescript
// In a Server Action:
const signResult = await signInvoice(invoice, orgId, csdPassword);
await updateInvoice(invoiceId, {
  xml_content: signResult.signedXml,
  status: 'pending_stamp'
});

// Component 15:
const stampResult = await stampInvoice(invoiceId, orgId);
// Invoice is now: status='stamped', stamps.uuid='05c519de-...', xml_content has TFD
```

### Stamped XML structure (after Component 15)
```xml
<?xml version="1.0" encoding="UTF-8"?>
<cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/4"
  Version="4.0"
  NoCertificado="30001000000300023708"
  Sello="hVqsmHgYAv4PpxJn..."
  Certificado="MIIFsDCCA5ig...">
  <cfdi:Emisor RFC="ABC123456789" ... />
  <cfdi:Receptor RFC="XYZ987654321" ... />
  <cfdi:Conceptos>...</cfdi:Conceptos>
  <cfdi:Impuestos>...</cfdi:Impuestos>
  <cfdi:Complemento>
    <tfd:TimbreFiscalDigital
      xmlns:tfd="http://www.sat.gob.mx/TimbreFiscalDigital"
      Version="1.1"
      UUID="05c519de-6d20-4258-88fb-c69a5970e927"
      FechaTimbrado="2024-03-01T10:00:02"
      RfcProvCertif="SPR190613I52"
      SelloCFD="hVqsmHgYAv4PpxJn..."
      NoCertificadoSAT="30001000000400002495"
      SelloSAT="qadm+mH3gZuYMnQZ..." />
  </cfdi:Complemento>
</cfdi:Comprobante>
```

---

## Coverage Targets

| File | Target |
|---|---|
| `errors.ts` | ≥ 95% |
| `tfd-parser.ts` | ≥ 95% |
| `soap-client.ts` | ≥ 85% |
| `providers/finkok.ts` | ≥ 90% |
| `providers/sw.ts` | ≥ 85% |
| `service.ts` | ≥ 85% |
| `stamp-invoice.ts` | ≥ 85% |

---

## Required Completion Summary

When complete, provide a summary with:

1. All files created (path + line count)
2. All files modified (path + what changed)
3. Total new tests added and passing count
4. Coverage achieved per file
5. PAC credential table migration confirmation
6. List any edge cases or known limitations discovered during implementation
7. Exports added to `apps/web/lib/invoices/index.ts` (stampInvoice, cancelInvoice)

---

## Definition of Done

- [ ] `organization_pac_credentials` migration applied and RLS policies active
- [ ] `types.ts` defines all interfaces (`PACCredentials`, `StampRequest`, `StampResult`, `CancelRequest`, `CancelResult`, `TFDData`)
- [ ] `errors.ts` defines all error codes; `mapFinkokError`, `mapSWError`, `isRetryable` work correctly
- [ ] `tfd-parser.ts` extracts all 6 TFD fields; throws `TFD_MISSING` when no TFD in XML
- [ ] `soap-client.ts` builds valid SOAP envelope; uses `fetch()` (no external SOAP library)
- [ ] `providers/finkok.ts` handles code 307 duplicate stamp recovery with retry
- [ ] `providers/finkok.ts` cancel validates motivo 01 requires folioSustitucion
- [ ] `providers/finkok.ts` converts DER cert/key → PEM using Node.js crypto only (no node-forge)
- [ ] `providers/sw.ts` authenticates and caches Bearer token with expiry check
- [ ] `providers/sw.ts` sends XML as multipart form-data (not base64)
- [ ] `service.ts` retries up to 3 times with exponential backoff on retryable errors
- [ ] `service.ts` does NOT retry on non-retryable PAC errors (705, 704, 401, etc.)
- [ ] `stamp-invoice.ts` guards invoice status before stamping
- [ ] `stamp-invoice.ts` writes complete stamps JSONB to `invoices.stamps`
- [ ] `stamp-invoice.ts` updates invoice status to `'stamped'`
- [ ] All tests pass (target: ≥ 110 new tests)
- [ ] No `node-forge` or `soap` npm packages added
- [ ] `stampInvoice` and `cancelInvoice` exported from `apps/web/lib/invoices/index.ts`
