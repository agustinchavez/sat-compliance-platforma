Excellent progress! Component 6 (Customer Service) is complete with SAT-ready architecture. Now let's build the SAT SOAP integration layer.

## ✅ WHAT'S ALREADY BUILT

### Components 1-6 Complete ✓

- ✅ Authentication, RBAC, Multi-Tenant, Organizations, Team, Customers
- ✅ Customer service has RFC validation (format + checksum)
- ✅ Database has `sat_validated` and `sat_metadata` fields ready
- ✅ Organization service stores e.firma certificates (CER + KEY encrypted)

### Current Architecture

**Organization Table (has e.firma):**

```sql
CREATE TABLE organizations (
  id UUID PRIMARY KEY,
  rfc VARCHAR(13) NOT NULL,

  -- E.firma / CSD (already encrypted in Cloudflare R2)
  cfdi_cert BYTEA,           -- Certificate (.cer)
  cfdi_key BYTEA,            -- Private key (.key) - encrypted
  cfdi_password_hash TEXT,   -- Password for .key file

  -- ... other fields
);
```

**Customer Table (needs SAT validation):**

```sql
CREATE TABLE customers (
  id UUID PRIMARY KEY,
  rfc VARCHAR(13) NOT NULL,

  -- SAT Integration (Phase 2 - ready)
  sat_validated BOOLEAN DEFAULT false,
  last_sat_validation TIMESTAMP,
  sat_metadata JSONB,  -- Store SAT response data

  -- ... other fields
);
```

### Tech Stack

- **Backend:** Next.js Server Actions, Node.js
- **SOAP:** Need to add SOAP client library
- **Crypto:** Node.js `crypto` module (for FIEL signatures)
- **XML:** Need XML parser
- **File Storage:** Cloudflare R2 (for downloaded CFDIs)
- **Queue:** Need job queue for async operations

---

## 📋 CURRENT TASK: Component 7 - SAT Integration Service (SOAP)

Build a comprehensive SAT SOAP integration that handles:

1. **Authentication** - Using organization's e.firma (FIEL)
2. **RFC Validation** - Validate customer RFCs against SAT registry
3. **CFDI Download** - Download issued/received CFDIs from SAT
4. **CFDI Parsing** - Extract data from XML CFDIs
5. **Reconciliation** - Match downloaded CFDIs with internal invoices

### **Component 7: SAT Integration Service (SOAP)**

**Purpose:** Integrate with SAT's SOAP web services for RFC validation and CFDI download/verification using Mexican e.firma (FIEL) digital signatures.

**Key Requirements:**

1. **E.firma / FIEL Management**

   - Load organization's CER + KEY files from encrypted storage
   - Decrypt private key using password
   - Generate digital signatures (XML-DSig)
   - Validate certificate expiry before use

2. **SAT Authentication (SOAP)**

   - Authenticate using FIEL signature
   - Generate authentication token (valid 5 minutes)
   - Refresh token automatically
   - Handle authentication errors

3. **RFC Validation Service**

   - Query SAT registry for RFC status
   - Check if RFC is valid, active, cancelled
   - Cache validation results (Redis, 7 days TTL)
   - Update customer `sat_validated` flag

4. **CFDI Download Service**

   - Request CFDI packages by date range
   - Poll for package availability
   - Download ZIP files with CFDIs
   - Extract and parse XML files
   - Store CFDIs in Cloudflare R2

5. **CFDI Parsing**

   - Parse CFDI 3.3 and 4.0 XML schemas
   - Extract emisor, receptor, conceptos, totales
   - Validate XML signature
   - Extract UUID and timbre fiscal

6. **Background Jobs**
   - Queue CFDI download requests (async)
   - Periodic RFC validation checks
   - Certificate expiry reminders
   - Rate limit management

**SAT SOAP Endpoints:**

```typescript
// Production URLs
const SAT_SOAP_ENDPOINTS = {
  // Authentication
  authentication:
    "https://cfdidescargamasivasolicitud.clouda.sat.gob.mx/Autenticacion/Autenticacion.svc",

  // CFDI Query (Solicitud)
  solicitud:
    "https://cfdidescargamasivasolicitud.clouda.sat.gob.mx/SolicitaDescargaService.svc",

  // CFDI Verification (Verificación)
  verificacion:
    "https://cfdidescargamasiva.clouda.sat.gob.mx/VerificaSolicitudDescargaService.svc",

  // CFDI Download (Descarga)
  descarga:
    "https://cfdidescargamasiva.clouda.sat.gob.mx/DescargaMasivaTercerosService.svc",
};

// Test/Sandbox URLs (if available)
const SAT_SOAP_TEST_ENDPOINTS = {
  // SAT doesn't provide a reliable test environment
  // Use production with test RFCs or mock service
};
```

**Expected Functionality:**

```typescript
// 1. Authenticate with SAT using e.firma
const auth = await authenticateWithSAT(organizationId);
// → { token: 'eyJhbG...', expiresAt: Date, success: true }

// 2. Validate RFC against SAT registry
const validation = await validateRFCWithSAT("ABC120101ABC");
// → {
//     valid: true,
//     status: 'active',  // active, cancelled, suspended
//     business_name: 'ACME Corporation S.A. de C.V.',
//     regime: '601',
//     last_updated: Date
//   }

// 3. Request CFDI download
const request = await requestCFDIDownload(organizationId, {
  type: "issued", // or 'received'
  dateStart: new Date("2024-01-01"),
  dateEnd: new Date("2024-12-31"),
  rfcEmitter: "ABC120101ABC", // optional filter
  rfcReceiver: "XYZ987654XYZ", // optional filter
});
// → { requestId: 'uuid-123', status: 'processing' }

// 4. Check download status
const status = await checkDownloadStatus(requestId);
// → {
//     status: 'completed',  // processing, completed, failed
//     packageIds: ['pkg-1', 'pkg-2'],
//     totalPackages: 2,
//     statusCode: 5000  // SAT status code
//   }

// 5. Download CFDI package
const cfdiPackage = await downloadCFDIPackage(requestId, packageId);
// → {
//     zipFile: Buffer,
//     cfdis: [{ uuid, xml, emisor, receptor, total, ... }],
//     metadata: { ... }
//   }

// 6. Parse CFDI XML
const cfdi = await parseCFDI(xmlString);
// → {
//     version: '4.0',
//     uuid: 'A1B2C3D4-...',
//     emisor: { rfc, name, regime },
//     receptor: { rfc, name, cfdiUse },
//     conceptos: [...],
//     impuestos: { ... },
//     total: 11600,
//     timbreFiscal: { ... }
//   }

// 7. Reconcile downloaded CFDI with internal invoice
const match = await reconcileCFDI(cfdiUUID, organizationId);
// → {
//     matched: true,
//     invoice: { id, folio, ... },
//     differences: []
//   }
```

**File Structure to Create:**

```
apps/web/lib/sat/
├── types.ts                      # TypeScript types
│   ├── SATAuthToken interface
│   ├── RFCValidationResult interface
│   ├── CFDIDownloadRequest interface
│   ├── CFDIPackage interface
│   ├── ParsedCFDI interface
│   ├── SATError classes
│   └── SOAP request/response types
│
├── soap-client.ts                # Low-level SOAP client
│   ├── createSOAPClient()
│   ├── sendSOAPRequest(endpoint, action, body)
│   ├── parseSOAPResponse(xml)
│   ├── handleSOAPError(error)
│   └── buildSOAPEnvelope(body, headers)
│
├── fiel.ts                       # E.firma / FIEL utilities
│   ├── loadFIEL(orgId)          # Load CER + KEY from storage
│   ├── decryptPrivateKey(encrypted, password)
│   ├── signXML(xml, privateKey, certificate)
│   ├── verifySignature(xml, certificate)
│   ├── getCertificateInfo(certificate)
│   └── validateCertificateExpiry(certificate)
│
├── authentication.ts             # SAT authentication
│   ├── authenticateWithSAT(orgId)
│   ├── refreshSATToken(orgId)
│   ├── getSATToken(orgId)       # Get cached or refresh
│   ├── invalidateSATToken(orgId)
│   ├── buildAuthenticationRequest(fiel)
│   └── parseAuthenticationResponse(xml)
│
├── rfc-validation.ts             # RFC validation service
│   ├── validateRFCWithSAT(rfc)
│   ├── getRFCStatus(rfc)
│   ├── batchValidateRFCs(rfcs)
│   ├── getCachedValidation(rfc)
│   ├── cacheValidation(rfc, result)
│   └── scheduleRFCRevalidation(rfc)
│
├── cfdi-download.ts              # CFDI download service
│   ├── requestCFDIDownload(orgId, params)
│   ├── checkDownloadStatus(requestId)
│   ├── downloadCFDIPackage(requestId, packageId)
│   ├── extractCFDIsFromZip(zipBuffer)
│   ├── saveCFDIToStorage(cfdi, orgId)
│   └── getDownloadHistory(orgId)
│
├── cfdi-parser.ts                # CFDI XML parsing
│   ├── parseCFDI(xml)
│   ├── parseComprobante(xml)    # Main CFDI element
│   ├── parseEmisor(xml)
│   ├── parseReceptor(xml)
│   ├── parseConceptos(xml)
│   ├── parseImpuestos(xml)
│   ├── parseTimbreFiscal(xml)   # Extract UUID and timestamp
│   ├── validateCFDISchema(xml)
│   └── extractUUID(xml)
│
├── reconciliation.ts             # CFDI reconciliation
│   ├── reconcileCFDI(uuid, orgId)
│   ├── matchCFDIToInvoice(cfdi, orgId)
│   ├── findDiscrepancies(cfdi, invoice)
│   ├── updateInvoiceFromCFDI(invoiceId, cfdi)
│   └── getReconciliationReport(orgId, period)
│
├── jobs.ts                       # Background jobs
│   ├── queueCFDIDownload(params)
│   ├── processCFDIDownloadJob(jobId)
│   ├── queueRFCValidation(rfc)
│   ├── processRFCValidationJob(jobId)
│   ├── scheduleCertificateExpiryCheck(orgId)
│   └── getRateLimitStatus(orgId)
│
├── sat-codes.ts                  # SAT response codes
│   ├── SAT_STATUS_CODES         # Map of status codes
│   ├── getSATStatusMessage(code)
│   ├── isSATErrorCode(code)
│   └── handleSATErrorCode(code)
│
├── cache.ts                      # Redis caching
│   ├── cacheAuthToken(orgId, token)
│   ├── getCachedAuthToken(orgId)
│   ├── cacheRFCValidation(rfc, result)
│   ├── getCachedRFCValidation(rfc)
│   └── invalidateCache(key)
│
├── utils.ts                      # Helper utilities
│   ├── formatSATDate(date)      # YYYY-MM-DDTHH:MM:SS
│   ├── parseSATDate(satDate)
│   ├── generateRequestId()
│   ├── calculateRateLimitWait(orgId)
│   └── logSATRequest(request, response)
│
└── index.ts                      # Main exports
    └── Export all public functions
```

**E.firma / FIEL Digital Signature:**

```typescript
// FIEL consists of:
// 1. Certificate (.cer file) - Public key
// 2. Private key (.key file) - Password protected
// 3. Password - To decrypt private key

// Signature Process:
// ==================
// 1. Load certificate and private key from encrypted storage
// 2. Decrypt private key using password
// 3. Create XML document to sign
// 4. Generate XML-DSig signature using private key
// 5. Embed signature in SOAP request
// 6. Send to SAT

// Example signature structure:
<Signature xmlns="http://www.w3.org/2000/09/xmldsig#">
  <SignedInfo>
    <CanonicalizationMethod Algorithm="..." />
    <SignatureMethod Algorithm="http://www.w3.org/2001/04/xmldsig-more#rsa-sha256" />
    <Reference URI="">
      <Transforms>...</Transforms>
      <DigestMethod Algorithm="http://www.w3.org/2001/04/xmlenc#sha256" />
      <DigestValue>...</DigestValue>
    </Reference>
  </SignedInfo>
  <SignatureValue>BASE64_SIGNATURE</SignatureValue>
  <KeyInfo>
    <X509Data>
      <X509Certificate>BASE64_CERTIFICATE</X509Certificate>
    </X509Data>
  </KeyInfo>
</Signature>
```

**SAT Authentication SOAP Request:**

```xml
<soapenv:Envelope
  xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"
  xmlns:des="http://DescargaMasivaTerceros.sat.gob.mx">
  <soapenv:Header/>
  <soapenv:Body>
    <des:Autentica>
      <des:CredencialesFIEL>
        <des:EmisorRFC>ABC120101ABC</des:EmisorRFC>
        <des:CertificadoBase64>BASE64_CERT</des:CertificadoBase64>
        <des:SelladoBase64>BASE64_SIGNATURE</des:SelladoBase64>
      </des:CredencialesFIEL>
    </des:Autentica>
  </soapenv:Body>
</soapenv:Envelope>
```

**CFDI Download Request SOAP:**

```xml
<soapenv:Envelope
  xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"
  xmlns:des="http://DescargaMasivaTerceros.sat.gob.mx">
  <soapenv:Header/>
  <soapenv:Body>
    <des:SolicitaDescarga>
      <des:solicitud
        RfcSolicitante="ABC120101ABC"
        FechaInicial="2024-01-01T00:00:00"
        FechaFinal="2024-12-31T23:59:59"
        TipoSolicitud="CFDI">  <!-- CFDI or Metadata -->
        <!-- Optional filters -->
        <des:RfcEmisor>XYZ987654XYZ</des:RfcEmisor>
        <des:RfcReceptor>DEF456789DEF</des:RfcReceptor>
      </des:solicitud>
      <des:Signature>...</des:Signature>  <!-- XML-DSig -->
    </des:SolicitaDescarga>
  </soapenv:Body>
</soapenv:Envelope>
```

**SAT Response Codes:**

```typescript
const SAT_STATUS_CODES = {
  // Success
  5000: "Solicitud recibida con éxito",
  5003: "Solicitud duplicada",
  5004: "No se encontró la información",
  5005: "Solicitud rechazada",

  // Authentication errors
  300: "Usuario invalido",
  301: "XML mal formado",
  302: "Sello mal formado",
  303: "Sello no corresponde con RFC",
  304: "Certificado revocado o caduco",
  305: "Certificado inválido",

  // Request errors
  400: "Error en el servidor",
  401: "Solicitud vencida",
  402: "Solicitud en proceso",
  403: "Solicitud rechazada",

  // Rate limits
  5002: "Se agotó el número de descargas permitidas",
};
```

**CFDI XML Structure (4.0):**

```xml
<cfdi:Comprobante
  xmlns:cfdi="http://www.sat.gob.mx/cfd/4"
  Version="4.0"
  Folio="12345"
  Fecha="2024-11-19T10:30:00"
  SubTotal="10000.00"
  Total="11600.00"
  TipoDeComprobante="I"
  MetodoPago="PUE"
  FormaPago="03"
  LugarExpedicion="06600">

  <cfdi:Emisor
    Rfc="ABC120101ABC"
    Nombre="ACME Corporation S.A. de C.V."
    RegimenFiscal="601"/>

  <cfdi:Receptor
    Rfc="XYZ987654XYZ"
    Nombre="Cliente S.A. de C.V."
    UsoCFDI="G03"
    RegimenFiscalReceptor="601"
    DomicilioFiscalReceptor="06600"/>

  <cfdi:Conceptos>
    <cfdi:Concepto
      ClaveProdServ="01010101"
      Cantidad="1"
      ClaveUnidad="H87"
      Descripcion="Servicio profesional"
      ValorUnitario="10000.00"
      Importe="10000.00"/>
  </cfdi:Conceptos>

  <cfdi:Impuestos TotalImpuestosTrasladados="1600.00">
    <cfdi:Traslados>
      <cfdi:Traslado Base="10000.00" Impuesto="002" TipoFactor="Tasa" TasaOCuota="0.160000" Importe="1600.00"/>
    </cfdi:Traslados>
  </cfdi:Impuestos>

  <cfdi:Complemento>
    <tfd:TimbreFiscalDigital
      xmlns:tfd="http://www.sat.gob.mx/TimbreFiscalDigital"
      Version="1.1"
      UUID="A1B2C3D4-E5F6-7890-ABCD-EF1234567890"
      FechaTimbrado="2024-11-19T10:31:00"
      SelloCFD="..."
      NoCertificadoSAT="..."
      SelloSAT="..."/>
  </cfdi:Complemento>
</cfdi:Comprobante>
```

**Dependencies:**

```bash
# SOAP client
npm install soap                    # Or axios for raw SOAP
npm install fast-xml-parser         # XML parsing
npm install xml-crypto              # XML digital signatures
npm install node-forge              # Certificate handling

# Job queue
npm install bullmq                  # Redis-based job queue

# Compression
npm install adm-zip                 # ZIP file handling

# Validation
npm install zod                     # Schema validation
```

**Environment Variables:**

```env
# SAT SOAP Configuration
SAT_SOAP_TIMEOUT=60000              # 60 seconds
SAT_MAX_RETRY_ATTEMPTS=3
SAT_RATE_LIMIT_PER_DAY=500

# Job Queue
REDIS_URL=redis://...               # Already configured
QUEUE_CONCURRENCY=5

# File Storage
R2_CFDI_BUCKET=sat-cfdis            # Cloudflare R2 bucket for CFDIs

# Monitoring
SAT_LOG_REQUESTS=true
SAT_ALERT_ON_ERRORS=true
```

**Migration Requirements:**

```sql
-- Create table for SAT requests tracking
CREATE TABLE sat_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id),
  request_type VARCHAR(50) NOT NULL,  -- 'authentication', 'rfc_validation', 'cfdi_download'
  request_data JSONB NOT NULL,
  response_data JSONB,
  status VARCHAR(50) NOT NULL,         -- 'pending', 'processing', 'completed', 'failed'
  sat_request_id VARCHAR(255),         -- SAT's internal request ID
  error_message TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  completed_at TIMESTAMP
);

-- Index for tracking
CREATE INDEX idx_sat_requests_org ON sat_requests(organization_id);
CREATE INDEX idx_sat_requests_status ON sat_requests(status, created_at);
CREATE INDEX idx_sat_requests_type ON sat_requests(request_type);

-- Create table for downloaded CFDIs
CREATE TABLE downloaded_cfdis (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id),
  uuid VARCHAR(36) UNIQUE NOT NULL,    -- CFDI UUID
  type VARCHAR(20) NOT NULL,           -- 'issued' or 'received'
  xml_content TEXT NOT NULL,
  parsed_data JSONB NOT NULL,
  storage_path TEXT,                   -- R2 storage path
  downloaded_at TIMESTAMP DEFAULT NOW(),
  reconciled BOOLEAN DEFAULT false,
  invoice_id UUID REFERENCES invoices(id)  -- If matched
);

-- Indexes
CREATE INDEX idx_downloaded_cfdis_org ON downloaded_cfdis(organization_id);
CREATE INDEX idx_downloaded_cfdis_uuid ON downloaded_cfdis(uuid);
CREATE INDEX idx_downloaded_cfdis_type ON downloaded_cfdis(type, organization_id);
CREATE INDEX idx_downloaded_cfdis_reconciled ON downloaded_cfdis(reconciled) WHERE NOT reconciled;
```

---

## 🎯 WHAT I NEED FROM YOU

This is a **complex integration**. Let's plan carefully:

1. **SOAP Library Choice:**

   - Use `soap` npm package (high-level, easy)?
   - Or build raw SOAP with `axios` (more control)?
   - Or use `xml2js` + `axios` (middle ground)?

2. **E.firma Signature:**

   - Use `xml-crypto` for XML-DSig (standard)?
   - Or `node-forge` for lower-level crypto?
   - Need to support RSA-SHA256 signatures

3. **Job Queue:**

   - Use BullMQ for async CFDI downloads?
   - Or simple database polling?
   - Downloads can take 5-30 minutes

4. **Rate Limiting:**

   - SAT limits: ~500 requests/day per RFC
   - Track in Redis or database?
   - How to handle limit exceeded?

5. **Error Handling:**

   - SAT returns many error codes (300, 301, 400, etc.)
   - Retry strategy for transient errors?
   - User notification for persistent errors?

6. **Testing:**

   - SAT has no reliable test environment
   - Mock SAT responses for tests?
   - Use test e.firma certificates?

7. **Security:**

   - Private keys only in memory, never logged?
   - Signatures validated on every response?
   - How to handle certificate expiry?

8. **Implementation Priority:**
   - What to build first?
   - My proposal:
     1. FIEL utilities (load, sign, verify)
     2. SOAP client (low-level)
     3. Authentication service
     4. RFC validation (simplest SAT operation)
     5. CFDI download (complex, use jobs)
     6. CFDI parsing
     7. Reconciliation
     8. Background jobs
     9. Testing and monitoring

Please review this plan and:

- ✅ Choose SOAP library approach
- ✅ Recommend signature library
- ✅ Decide on job queue strategy
- ✅ Validate rate limiting approach
- ✅ Confirm error handling strategy
- ✅ Discuss testing approach
- ✅ Review implementation priority

**IMPORTANT NOTES:**

- This is the most complex component so far
- SAT SOAP is notoriously difficult (poor documentation)
- Many Mexican developers struggle with this
- Consider building in phases (RFC validation first, CFDI download later)

Once we align on the approach, I'll start implementing step by step!
