# Component 15: PAC Integration Service - Completion Summary

## Overview

Component 15 implements PAC (Proveedor Autorizado de Certificacion) integration for CFDI 4.0 stamping and cancellation with SAT Mexico. The module supports two PAC providers: Finkok (SOAP API) and SW Sapien (REST API), with automatic retry logic, encrypted credential storage, and TFD extraction.

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         apps/web (Next.js Application)                       │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │                  lib/invoices/stamp-invoice.ts                           ││
│  │                 (Integration Bridge - Step 9)                            ││
│  │  stampInvoice(invoice, orgId) → StampedInvoiceResult                    ││
│  │  cancelStampedInvoice(invoice, orgId, motivo) → CancelledInvoiceResult  ││
│  └──────────────────────────────────┬──────────────────────────────────────┘│
│                                     │                                        │
│  ┌──────────────────────────────────┼──────────────────────────────────────┐│
│  │                         lib/pac/                                         ││
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌────────────────┐  ││
│  │  │ service.ts  │  │soap-client.ts│  │tfd-parser.ts│  │   errors.ts   │  ││
│  │  │  (Step 8)   │  │  (Step 4)   │  │  (Step 3)   │  │   (Step 2)    │  ││
│  │  └──────┬──────┘  └─────────────┘  └─────────────┘  └────────────────┘  ││
│  │         │                                                                ││
│  │  ┌──────┴──────────────────────────────────────┐                        ││
│  │  │              providers/                      │                        ││
│  │  │  ┌─────────────┐      ┌─────────────┐       │                        ││
│  │  │  │ finkok.ts   │      │   sw.ts     │       │                        ││
│  │  │  │  (Step 6)   │      │  (Step 7)   │       │                        ││
│  │  │  │  SOAP API   │      │  REST API   │       │                        ││
│  │  │  └─────────────┘      └─────────────┘       │                        ││
│  │  └─────────────────────────────────────────────┘                        ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                              │
│  Public API:                                                                 │
│  • stampCFDI(request) → StampResult                                         │
│  • cancelCFDI(request) → CancelResult                                       │
│  • extractTFD(stampedXml) → TFDData                                         │
│  • isPACConfigured(orgId) → boolean                                         │
│  • getPACInfo(orgId) → { provider, environment }                            │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Files Created

### PAC Module (`apps/web/lib/pac/`)

| File | Purpose | Tests |
|------|---------|-------|
| [types.ts](apps/web/lib/pac/types.ts) | Type definitions for credentials, requests, responses, TFD | - |
| [errors.ts](apps/web/lib/pac/errors.ts) | PACError class, error codes, Finkok/SW error mapping | 58 |
| [tfd-parser.ts](apps/web/lib/pac/tfd-parser.ts) | TFD extraction from stamped CFDI XML | 40 |
| [soap-client.ts](apps/web/lib/pac/soap-client.ts) | SOAP envelope building, HTTP calls for Finkok | 29 |
| [providers/base.ts](apps/web/lib/pac/providers/base.ts) | PACProviderInterface definition | - |
| [providers/finkok.ts](apps/web/lib/pac/providers/finkok.ts) | Finkok SOAP provider implementation | 16 |
| [providers/sw.ts](apps/web/lib/pac/providers/sw.ts) | SW Sapien REST provider implementation | 16 |
| [service.ts](apps/web/lib/pac/service.ts) | Main orchestrator with retry logic, credential retrieval | 15 |
| [index.ts](apps/web/lib/pac/index.ts) | Module exports | - |

### Invoice Integration (`apps/web/lib/invoices/`)

| File | Purpose | Tests |
|------|---------|-------|
| [stamp-invoice.ts](apps/web/lib/invoices/stamp-invoice.ts) | Bridge between invoice module and PAC service | 20 |

### Database Migration

| File | Purpose |
|------|---------|
| [20260306000000_add_pac_credentials.sql](apps/web/supabase/migrations/20260306000000_add_pac_credentials.sql) | Tables for PAC credentials, invoice stamps, cancellations |

**Total New Tests: 194 tests**
**All tests passing**

## Stamping Flow Diagram

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  Signed CFDI    │     │   PAC Service   │     │   PAC Provider  │
│  (Component 14) │────▶│   stampCFDI()   │────▶│  (Finkok/SW)    │
│  cfdi_xml       │     │                 │     │                 │
└─────────────────┘     └────────┬────────┘     └────────┬────────┘
                                 │                       │
                                 │  1. Get credentials   │
                                 │  2. Select provider   │
                                 │  3. Call stamp API    │
                                 │                       │
                                 ▼                       ▼
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  StampResult    │◀────│   extractTFD()  │◀────│  Stamped XML    │
│  - uuid         │     │   TFD parsing   │     │  with TFD       │
│  - stampedXml   │     │                 │     │  complement     │
│  - fechaTimbrado│     └─────────────────┘     └─────────────────┘
│  - selloSAT     │
└─────────────────┘
```

## TFD Extraction

The TFD (Timbre Fiscal Digital) is extracted from the stamped XML:

```xml
<cfdi:Complemento>
  <tfd:TimbreFiscalDigital
    xmlns:tfd="http://www.sat.gob.mx/TimbreFiscalDigital"
    Version="1.1"
    UUID="05c519de-6d20-4258-88fb-c69a5970e927"
    FechaTimbrado="2024-03-01T10:00:00"
    RfcProvCertif="SPR190613I52"
    SelloCFD="hVqsmHg..."
    NoCertificadoSAT="30001000000400002495"
    SelloSAT="kLm9pQr..."
  />
</cfdi:Complemento>
```

Extracted as `TFDData`:
```typescript
{
  uuid: "05c519de-6d20-4258-88fb-c69a5970e927",
  fechaTimbrado: "2024-03-01T10:00:00",
  rfcProvCertif: "SPR190613I52",
  selloCFD: "hVqsmHg...",
  noCertificadoSAT: "30001000000400002495",
  selloSAT: "kLm9pQr...",
  version: "1.1"
}
```

## Provider Implementations

### Finkok (SOAP)

```typescript
// Stamp endpoint
POST https://facturacion.finkok.com/servicios/soap/stamp.wsdl
Action: stamp

// SOAP envelope structure
<soapenv:Envelope>
  <soapenv:Body>
    <stamp xmlns="http://facturacion.finkok.com/stamp">
      <xml><![CDATA[...signed CFDI...]]></xml>
      <username>finkok_user</username>
      <password>finkok_pass</password>
    </stamp>
  </soapenv:Body>
</soapenv:Envelope>
```

### SW Sapien (REST)

```typescript
// Authentication
POST https://services.sw.com.mx/security/authenticate
Body: { user: "email", password: "pass" }
Response: { token: "Bearer ..." }

// Stamp
POST https://services.sw.com.mx/cfdi33/stamp/v4
Headers: { Authorization: "Bearer ..." }
Body: FormData with xml file
Response: { uuid, fechaTimbrado, ... }
```

## Retry Logic

The service implements automatic retry for transient errors:

```typescript
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

// Retryable errors:
// - PAC_NETWORK_ERROR
// - PAC_TIMEOUT
// - HTTP 5xx responses

// Non-retryable errors:
// - PAC_INVALID_XML
// - PAC_STAMP_DUPLICATE
// - PAC_AUTH_FAILED
// - All validation errors

// Exponential backoff
attempt 1 → wait 1000ms
attempt 2 → wait 2000ms
attempt 3 → fail
```

## Cancellation Motivos (SAT-mandated since January 2022)

| Code | Description | Requires folioSustitucion |
|------|-------------|---------------------------|
| 01 | Comprobante emitido con errores con relacion | Yes |
| 02 | Comprobante emitido con errores sin relacion | No |
| 03 | No se llevo a cabo la operacion | No |
| 04 | Operacion nominativa relacionada en factura global | No |

## Error Codes

| Code | Description | Retryable |
|------|-------------|-----------|
| `PAC_STAMP_DUPLICATE` | CFDI already stamped (code 307) | No |
| `PAC_INVALID_XML` | XML structure invalid (code 705) | No |
| `PAC_CERT_NOT_FROM_SAT` | Certificate not from SAT (code 308) | No |
| `PAC_FECHA_OUT_OF_RANGE` | Date outside valid range (code 401) | No |
| `PAC_RFC_NOT_REGISTERED` | RFC not registered (code 402/702) | No |
| `PAC_ACCOUNT_SUSPENDED` | PAC account suspended (code 703) | No |
| `PAC_WRONG_PASSWORD` | Wrong CSD password (code 704) | No |
| `PAC_NETWORK_ERROR` | Connection failed | Yes |
| `PAC_TIMEOUT` | Request timeout | Yes |
| `PAC_AUTH_FAILED` | SW token auth failure | No |
| `PAC_CREDENTIALS_NOT_FOUND` | No PAC credentials configured | No |
| `PAC_INVALID_REQUEST` | Invalid request parameters | No |
| `TFD_PARSE_ERROR` | Could not extract TFD | No |
| `TFD_MISSING` | Stamped XML has no TFD | No |
| `CANCEL_UUID_NOT_FOUND` | UUID not found (code 205) | No |
| `CANCEL_RFC_MISMATCH` | RFC mismatch (code 203) | No |
| `CANCEL_ALREADY_CANCELLED` | Already cancelled (code 202) | No |

## Database Schema

### organization_pac_credentials

```sql
CREATE TABLE organization_pac_credentials (
  id UUID PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES organizations(id),
  provider VARCHAR(20) NOT NULL CHECK (provider IN ('finkok', 'sw')),
  is_primary BOOLEAN DEFAULT TRUE,
  environment VARCHAR(20) NOT NULL DEFAULT 'sandbox',

  -- Finkok credentials
  finkok_username VARCHAR(255),
  finkok_password_encrypted TEXT,  -- AES-256-GCM JSON

  -- SW credentials
  sw_username VARCHAR(255),
  sw_password_encrypted TEXT,
  sw_token_encrypted TEXT,
  sw_token_expires_at TIMESTAMP,

  -- Metadata
  last_used_at TIMESTAMP,
  last_error TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

### invoice_stamps

```sql
CREATE TABLE invoice_stamps (
  id UUID PRIMARY KEY,
  invoice_id UUID NOT NULL REFERENCES invoices(id),
  organization_id UUID NOT NULL,

  -- TFD data
  uuid VARCHAR(36) NOT NULL,
  fecha_timbrado TIMESTAMP NOT NULL,
  rfc_prov_certif VARCHAR(20) NOT NULL,
  sello_cfd TEXT NOT NULL,
  no_certificado_sat VARCHAR(20) NOT NULL,
  sello_sat TEXT NOT NULL,
  tfd_version VARCHAR(10) DEFAULT '1.1',

  -- PAC tracking
  pac_provider VARCHAR(20) NOT NULL,
  pac_environment VARCHAR(20) NOT NULL,

  created_at TIMESTAMP DEFAULT NOW()
);
```

### invoice_cancellations

```sql
CREATE TABLE invoice_cancellations (
  id UUID PRIMARY KEY,
  invoice_id UUID NOT NULL REFERENCES invoices(id),
  organization_id UUID NOT NULL,

  -- Cancellation data
  uuid VARCHAR(36) NOT NULL,
  motivo VARCHAR(2) NOT NULL,
  folio_sustitucion VARCHAR(36),
  estatus_uuid VARCHAR(10),
  acuse TEXT,

  -- Status
  status VARCHAR(20) DEFAULT 'pending',
  error_message TEXT,
  pac_provider VARCHAR(20) NOT NULL,

  requested_at TIMESTAMP DEFAULT NOW(),
  completed_at TIMESTAMP
);
```

## Status Workflow

```
Component 14                Component 15
     │                           │
     ▼                           ▼
PENDING_STAMP ─────────────▶ STAMPED ─────────────▶ CANCELLED
  (signed)      stampCFDI()   (uuid)   cancelCFDI()
```

## Test Coverage

| File | Tests | Description |
|------|-------|-------------|
| errors.test.ts | 58 | Error mapping, isRetryable |
| tfd-parser.test.ts | 40 | TFD extraction, validation |
| soap-client.test.ts | 29 | SOAP envelope building, parsing |
| finkok.test.ts | 16 | Finkok provider methods |
| sw.test.ts | 16 | SW provider methods |
| service.test.ts | 15 | Orchestrator, retry logic |
| stamp-invoice.test.ts | 20 | Invoice bridge |

**All 194 tests pass.**

## Dependencies

- **`@xmldom/xmldom`**: XML parsing for TFD extraction and SOAP responses
- **Node.js built-in `crypto`**: For credential decryption (AES-256-GCM)
- **No external SOAP library**: Raw SOAP envelopes built manually

## Environment Variables

```bash
# Finkok (optional - fallback to hardcoded)
FINKOK_SANDBOX_URL=https://demo-facturacion.finkok.com/servicios/soap
FINKOK_PRODUCTION_URL=https://facturacion.finkok.com/servicios/soap

# SW Sapien (optional - fallback to hardcoded)
SW_SANDBOX_URL=https://services.test.sw.com.mx
SW_PRODUCTION_URL=https://services.sw.com.mx
```

## Running Tests

```bash
cd my-turborepo/apps/web

# Run all PAC tests
npm test lib/pac/ -- --run

# Run stamp-invoice tests
npm test lib/invoices/__tests__/stamp-invoice.test.ts -- --run

# Run all Component 15 tests
npm test lib/pac/ lib/invoices/__tests__/stamp-invoice.test.ts -- --run

# Watch mode
npm test lib/pac/ -- --watch
```

## Usage Example

```typescript
import { stampInvoice, cancelStampedInvoice, isStampingReady } from '@/lib/invoices';

// Check if PAC is configured
const ready = await isStampingReady(organizationId);
if (!ready) {
  throw new Error('PAC not configured');
}

// Stamp a signed invoice
const stampedResult = await stampInvoice(invoice, organizationId);

// stampedResult contains:
// - uuid: "05c519de-6d20-4258-88fb-c69a5970e927"
// - stampedXml: Full CFDI with TFD complement
// - fechaTimbrado: "2024-03-01T10:00:00"
// - tfd: { uuid, selloSAT, noCertificadoSAT, ... }
// - pacProvider: "finkok" | "sw"
// - environment: "sandbox" | "production"

// Update invoice
await onStampingSuccess(invoiceId, stampedResult);

// Cancel if needed
const cancelResult = await cancelStampedInvoice(
  invoice,
  organizationId,
  '02'  // Comprobante con errores sin relacion
);
```

## Integration Contract with Component 14

**Input from Component 14:**
```typescript
invoice.cfdi_xml  // Signed CFDI XML with Sello, NoCertificado, Certificado
```

**Output to Database:**
```typescript
{
  invoice: {
    uuid: "05c519de-...",
    stamped_at: "2024-03-01T10:00:00Z",
    cfdi_xml: "<cfdi:Comprobante>...</cfdi:Comprobante>",  // With TFD
    status: "stamped"
  },
  invoice_stamps: {
    uuid: "05c519de-...",
    fecha_timbrado: "2024-03-01T10:00:00",
    sello_sat: "kLm9pQr...",
    no_certificado_sat: "30001000000400002495",
    pac_provider: "finkok"
  }
}
```

## Known Limitations

1. **No LCO Validation**: Lista de Contribuyentes Obligados check not implemented
2. **No certificate attachment for cancel**: Finkok cancel currently doesn't attach CSD (required for production)
3. **SW token caching**: Token caching is per-request, not persisted
4. **No webhook support**: SAT async cancellation responses not handled

## Definition of Done - Checklist

- [x] `apps/web/lib/pac/types.ts` created
- [x] `apps/web/lib/pac/errors.ts` created with Finkok/SW error mapping
- [x] `apps/web/lib/pac/tfd-parser.ts` created with XML parsing
- [x] `apps/web/lib/pac/soap-client.ts` created with SOAP envelope building
- [x] `apps/web/lib/pac/providers/base.ts` created with interface
- [x] `apps/web/lib/pac/providers/finkok.ts` created with SOAP implementation
- [x] `apps/web/lib/pac/providers/sw.ts` created with REST implementation
- [x] `apps/web/lib/pac/service.ts` created with retry logic
- [x] `apps/web/lib/pac/index.ts` created with exports
- [x] `apps/web/lib/invoices/stamp-invoice.ts` created as bridge
- [x] `apps/web/lib/invoices/index.ts` updated with exports
- [x] Database migration for `organization_pac_credentials`, `invoice_stamps`, `invoice_cancellations`
- [x] **No external SOAP library** - raw SOAP envelopes built manually
- [x] **No `node-forge`** - Node.js built-in crypto only
- [x] `@xmldom/xmldom` installed for XML parsing
- [x] Retry logic with exponential backoff (MAX_RETRIES=3)
- [x] Error mapping for Finkok codes (307, 705, etc.)
- [x] Error mapping for SW HTTP responses
- [x] TFD extraction with all required attributes
- [x] Cancellation with motivo validation
- [x] AES-256-GCM credential encryption (from Component 04)
- [x] RLS policies for all new tables
- [x] **194 new tests, all passing**
