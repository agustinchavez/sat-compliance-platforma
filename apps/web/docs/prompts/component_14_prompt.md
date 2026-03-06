# Component 14: Digital Signature Service (CSD)

## ✅ COMPONENT 13 VERIFICATION — SUFFICIENT TO PROCEED

Component 13 delivered the `@repo/cfdi` package with 222 passing tests and these outputs that Component 14 directly consumes:

| Component 13 Export | Component 14 Uses It For |
|---|---|
| `generateCadenaOriginal(xml)` → `{ cadena, sha256 }` | `sha256` is the data to be signed |
| `generateCFDI(input)` → `{ xml }` | The unsigned XML to inject `Sello`, `NoCertificado`, `Certificado` into |
| `formatXML(comprobante)` | Re-serializes the comprobante after stamp fields are populated |

**One field mapping note:** The Component 13 summary's mapping table shows `issuer_zip_code` → `issuer_postal_code`, but Component 12's actual database column is `issuer_postal_code` — the bridge already handles this correctly per the implementation. This component uses `issuer_postal_code` throughout, consistent with Component 12's schema.

---

## ✅ WHAT'S ALREADY BUILT

### Components 1–13 Complete

- ✅ Component 01 — Supabase Auth, JWT sessions
- ✅ Component 02 — RBAC, Redis-cached permissions (sub-5ms)
- ✅ Component 03 — Multi-tenant RLS, org isolation
- ✅ Component 04 — Organization Service: CSD/e.firma stored encrypted in Cloudflare R2 (AES-256-GCM); `organizations` table has `csd_certificate_r2_key`, `csd_private_key_r2_key`, `csd_key_password_encrypted` columns
- ✅ Component 05 — Team Management, multi-org membership
- ✅ Component 06 — Customer Service, RFC validation
- ✅ Component 07 — SAT SOAP RFC validation
- ✅ Component 08 — Product/Service Management, SAT catalog
- ✅ Component 09 — SAT Code Search (semantic, pgvector)
- ✅ Component 10 — Receipt OCR (Tesseract)
- ✅ Component 11 — Tax Assistant Chatbot (Llama 3.1)
- ✅ Component 12 — Invoice Service Core: full data model, decimal.js calculations, 7-state workflow, atomic folio, 365 tests
- ✅ Component 13 — CFDI XML Generator (`@repo/cfdi`): `generateCFDI()`, `generateCadenaOriginal()`, `validateCFDI()`, 222 tests

### The `@repo/cfdi` Package (Component 13 outputs)

```
packages/cfdi/src/
├── index.ts                  ← Public API (all exports)
├── types.ts                  ← CFDIGeneratorInput, CFDIGeneratorResult, etc.
├── constants.ts              ← SAT namespaces, catalog codes
├── generator.ts              ← generateCFDI(), buildComprobante(), formatXML()
├── impuestos-aggregation.ts  ← aggregateImpuestos(), formatDecimal6(), formatDecimal2()
├── cadena-original.ts        ← generateCadenaOriginal(), computeSHA256(), isXSLTAvailable()
├── validation.ts             ← validateCFDI()
├── complements/pagos.ts      ← buildPagos20Complement() (stub for Component 18)
└── xslt/
    └── cadenaoriginal_4_0.xslt
```

### Component 04 — CSD Storage (Critical Integration Point)

Component 04 stores CSD files in Cloudflare R2 with this contract:

```typescript
// From Component 04 — how CSD assets are stored on the organization:
interface OrganizationCSD {
  csd_certificate_r2_key: string;       // R2 path: "orgs/{org_id}/csd/cert.cer" (DER bytes)
  csd_private_key_r2_key: string;       // R2 path: "orgs/{org_id}/csd/key.key" (DER bytes, encrypted)
  csd_key_password_encrypted: string;   // AES-256-GCM encrypted password stored in DB
  csd_certificate_number: string;       // 20-char NoCertificado (pre-extracted at upload time)
  csd_expires_at: Date;                 // Certificate expiration
}
```

Component 04 also exposed a service method (available in `apps/web/lib/organizations/`):

```typescript
// Component 04's Organization Service — use these (do not re-implement)
import { getOrganizationCSD } from '@/lib/organizations/service';

const { cerBuffer, keyBuffer, password } = await getOrganizationCSD(orgId);
// cerBuffer: Buffer containing raw DER bytes of the .cer file
// keyBuffer: Buffer containing raw DER bytes of the encrypted .key file
// password:  Decrypted string password (Component 04 handles AES-256-GCM decryption)
```

> ⚠️ **Do not re-implement CSD retrieval or password decryption.** Component 04 owns that. This component only receives `cerBuffer`, `keyBuffer`, and `password` as inputs.

---

## 🔬 RESEARCHED SAT CSD CRYPTOGRAPHY SPECIFICATIONS

The following specifications were verified against SAT documentation, the phpcfdi/credentials reference implementation, SAT test certificate analysis, and the official Anexo 20 signing spec. Implement exactly as described.

### File Formats (Verified)

| File | Format | Node.js Load Method |
|---|---|---|
| `.cer` | X.509 **DER** (binary, NOT PEM) | `new crypto.X509Certificate(cerBuffer)` |
| `.key` | PKCS#8 **DER** encrypted (binary, NOT PEM) | `crypto.createPrivateKey({ key: keyBuffer, format: 'der', type: 'pkcs8', passphrase: password })` |

> ⚠️ **Critical:** SAT issues both files in DER (binary) format. Do NOT attempt to read them as UTF-8 strings. Do NOT add PEM headers. The Node.js `crypto` module handles them directly as `Buffer` objects with the parameters above.

### The `NoCertificado` Extraction — SAT-Specific Algorithm

The `NoCertificado` attribute in CFDI XML is **not** the standard X.509 serial number. It is a SAT-specific representation:

**Algorithm:**
1. Get the X.509 serial number as a hexadecimal string (e.g., `"3330303031303030303030333030303233373038"`)
2. Interpret each pair of hex characters as an ASCII code point
3. Convert each ASCII code to its character (`33` hex = `51` decimal = `'3'`, `30` hex = `48` decimal = `'0'`, etc.)
4. Join all characters → the 20-character `NoCertificado` string (e.g., `"30001000000300023708"`)

**Implementation:**
```typescript
export function extractNoCertificado(cert: crypto.X509Certificate): string {
  // cert.serialNumber returns a hex string like "3330303031303030..."
  // Each pair of hex chars is an ASCII code for a digit character
  const hexSerial = cert.serialNumber; // e.g. "3330303031303030303030333030303233373038"
  let result = '';
  for (let i = 0; i < hexSerial.length; i += 2) {
    const hexByte = hexSerial.substring(i, i + 2);
    result += String.fromCharCode(parseInt(hexByte, 16));
  }
  return result; // e.g. "30001000000300023708"
}
```

**Verification:** The SAT test certificate `AAA010101AAA_CSD_01.cer` has hex serial `3230303031303030303030333030303232333135` → decoded → `"20001000000300022315"`. Use this as a test vector.

> ⚠️ **Do NOT use** `BigInt(cert.serialNumber).toString()` or `parseInt(cert.serialNumber, 16).toString()`. Those produce the decimal representation of the serial number, which is wrong for SAT. The SAT algorithm interprets the hex bytes as ASCII characters, not as a number.

### The `Certificado` Attribute — Base64 of the DER Certificate

The `Certificado` attribute in the CFDI XML is the **base64-encoded content of the `.cer` file's raw DER bytes** (the complete X.509 certificate, not just the public key):

```typescript
export function encodeCertificateForCFDI(cerBuffer: Buffer): string {
  // The cerBuffer IS the raw DER bytes of the .cer file
  // No conversion needed — just base64 encode the whole thing
  return cerBuffer.toString('base64');
}
```

This is a standard base64 string with no line breaks (no PEM wrapping). The PAC validates this attribute against their copy of the SAT certificate chain.

### The RSA-SHA256 Signing Algorithm

**Algorithm:** RSA with SHA-256 digest and **PKCS#1 v1.5 padding** (NOT RSA-PSS).

```typescript
import * as crypto from 'crypto';

export function signCadena(cadena: string, privateKey: crypto.KeyObject): Buffer {
  // Input: cadena original string (UTF-8)
  // Hash: SHA-256 of the UTF-8-encoded cadena bytes
  // Sign: RSA PKCS#1 v1.5 padding (NOT PSS)
  // Output: raw signature bytes

  const sign = crypto.createSign('SHA256');
  sign.update(cadena, 'utf8');
  sign.end();
  
  return sign.sign({
    key: privateKey,
    padding: crypto.constants.RSA_PKCS1_PADDING,  // ← PKCS#1 v1.5 (NOT RSA_PKCS1_PSS_PADDING)
    // DO NOT specify dsaEncoding or saltLength — those are for PSS/DSA only
  });
}
```

> ⚠️ **Critical:** Using `RSA_PKCS1_PSS_PADDING` will produce signatures that PAC will reject with a `CFDI40111` or signature verification error. SAT requires classic PKCS#1 v1.5.

### The `Sello` Attribute — Base64 of Signature

```typescript
export function signatureToSello(signatureBuffer: Buffer): string {
  return signatureBuffer.toString('base64');
}
```

The resulting base64 string is placed directly in the `Sello` attribute of the CFDI XML. No line breaks, no PEM headers. The signature is typically 256–512 characters in base64 (for 2048-bit RSA keys).

### The Complete Signing Flow

```
cadena original (string)
        │
        ▼
crypto.createSign('SHA256')
  .update(cadena, 'utf8')
  .sign({ key: privateKey, padding: RSA_PKCS1_PADDING })
        │
        ▼
signature Buffer (256 bytes for 2048-bit RSA)
        │
        ▼
.toString('base64')
        │
        ▼
Sello = "TPFAOe/vqOpiyVR..." (base64 string)
```

**Component 13's role vs this component:**
- Component 13 `generateCadenaOriginal(xml)` → returns `{ cadena: string, sha256: string }`
- This component receives `cadena` (the string), NOT `sha256`
- Pass the `cadena` string directly to `crypto.createSign()` — the `createSign` function handles the SHA-256 hashing internally
- Do NOT pre-hash with `computeSHA256()` and then sign the hash — that would double-hash and produce an incorrect signature

### Certificate Validation Rules

Before signing, validate the certificate:

| Check | Implementation | Error Code |
|---|---|---|
| Not expired | `cert.validTo > new Date()` | `CSD001` |
| Not yet valid | `cert.validFrom <= new Date()` | `CSD002` |
| Is a CSD (not FIEL) | Check CN does NOT contain "FIEL" or "e.firma" | `CSD003` |
| RFC matches invoice issuer | Extract RFC from cert subject, compare to `invoice.issuer_rfc` | `CSD004` |
| Issued by SAT CA | `cert.issuer` contains "SAT" or known SAT CA OIDs | `CSD005` |

**Extracting RFC from certificate subject:**
The SAT embeds the RFC in the X.509 subject in the field `OID 2.5.4.45` (UniqueIdentifier). The format is: `RFC / CURP` for personas físicas, or `RFC / ` for personas morales.

```typescript
// cert.subject returns a string like:
// "OID.2.5.4.45=EKU9003173C9 / XEXX900312HMCLRS05\nCN=ESCUELA KEMPER URGATE\nO=ESCUELA KEMPER URGATE\n..."

export function extractRFCFromCertificate(cert: crypto.X509Certificate): string {
  const subject = cert.subject;
  // Match: OID.2.5.4.45=RFC_VALUE or serialNumber=RFC_VALUE  
  const match = subject.match(/(?:OID\.2\.5\.4\.45|serialNumber|UID)=([A-Z&Ñ]{3,4}\d{6}[A-Z0-9]{3})/i);
  if (!match) {
    throw new CSDError('RFC not found in certificate subject', 'CSD_RFC_NOT_FOUND');
  }
  return match[1].split('/')[0].trim().toUpperCase();
}
```

> Note: Node.js `crypto.X509Certificate` exposes `subject` as a multiline string with newline separators. Parse it carefully — do not assume a fixed line order.

### Key Loading — The Only Correct Pattern

```typescript
import * as crypto from 'crypto';

export function loadPrivateKey(keyBuffer: Buffer, password: string): crypto.KeyObject {
  try {
    return crypto.createPrivateKey({
      key: keyBuffer,
      format: 'der',      // ← DER (binary), NOT 'pem'
      type: 'pkcs8',      // ← PKCS#8, NOT 'pkcs1' or 'sec1'
      passphrase: password,
    });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ERR_MISSING_PASSPHRASE') {
      throw new CSDError('Private key password is required', 'CSD_PASSWORD_REQUIRED');
    }
    if ((error as NodeJS.ErrnoException).code === 'ERR_OSSL_BAD_DECRYPT') {
      throw new CSDError('Incorrect private key password', 'CSD_WRONG_PASSWORD');
    }
    throw new CSDError(`Failed to load private key: ${(error as Error).message}`, 'CSD_KEY_LOAD_ERROR');
  }
}

export function loadCertificate(cerBuffer: Buffer): crypto.X509Certificate {
  try {
    return new crypto.X509Certificate(cerBuffer);
  } catch (error) {
    throw new CSDError(`Failed to load certificate: ${(error as Error).message}`, 'CSD_CERT_LOAD_ERROR');
  }
}
```

> ⚠️ **Do NOT use `node-forge`** for the core signing operation. Node.js built-in `crypto` (available since Node 16) handles PKCS#8 DER keys and X.509 DER certificates natively with significantly better performance and no additional dependencies. `node-forge` is a JavaScript reimplementation of cryptography — it is slower, less maintained, and unnecessary when Node.js native crypto handles the same operations.

### Verify Signature (for Tests and Audit)

```typescript
export function verifySignature(
  cadena: string,
  selloBase64: string,
  cert: crypto.X509Certificate,
): boolean {
  try {
    const verify = crypto.createVerify('SHA256');
    verify.update(cadena, 'utf8');
    verify.end();
    return verify.verify(
      { key: cert.publicKey, padding: crypto.constants.RSA_PKCS1_PADDING },
      Buffer.from(selloBase64, 'base64'),
    );
  } catch {
    return false;
  }
}
```

This is critical for tests: sign a cadena with the test key, verify with the test certificate's public key, assert `true`.

### Injecting Sello into the CFDI XML

After signing, Component 14 must update the CFDI XML with the signing results. Component 13's `formatXML()` already handles the placeholder `Sello=""`, `NoCertificado=""`, `Certificado=""` values. This component updates those values.

The correct approach is **string replacement on the attributes**, not re-parsing the XML:

```typescript
export function injectSignatureIntoXML(
  xml: string,
  sello: string,
  noCertificado: string,
  certificado: string,
): string {
  // Component 13 generates XML with these exact placeholder attributes:
  // Sello=""  NoCertificado=""  Certificado=""
  // Replace them with the actual values
  return xml
    .replace('Sello=""', `Sello="${sello}"`)
    .replace('NoCertificado=""', `NoCertificado="${noCertificado}"`)
    .replace('Certificado=""', `Certificado="${certificado}"`);
}
```

> ⚠️ The string replacement approach is intentionally simple and reliable. XML re-parsing (parse → modify → reserialize) risks changing attribute order or whitespace, which would invalidate the cadena original. Since the XML was just generated by `formatXML()` with known placeholder values, string replacement is correct and safe.

### Test Certificates (SAT Provides These for Testing)

SAT provides official test CSD files. Download these for use in all tests:

- Certificate: `AAA010101AAA_CSD_01.cer` (X.509 DER)
- Private key: `AAA010101AAA_CSD_01.key` (PKCS#8 DER, encrypted)
- Password: `"a0123456789"` (this is the real SAT test password)

These are bundled in the SAT test package available at:
`http://omawww.sat.gob.mx/tramitesyservicios/Paginas/certificado_sello_digital.htm`

**Test certificate facts (verified):**
- RFC: `AAA010101AAA`
- NoCertificado: `"20001000000300022315"` ← use as test vector
- Key algorithm: RSA-2048
- Valid from: 2010-08-21 (expired — only use for format/structure tests, not production)

For tests that verify expiration, use `vitest.fake-timers` to mock `Date.now()` to a date when the test cert was valid (e.g., `2010-09-01`).

---

## 📋 CURRENT TASK: Component 14 — Digital Signature Service (CSD)

Build the digital signature module within the existing `packages/cfdi/` package. This component adds three new files to the package and integrates with Component 04's Organization Service via a bridge function in `apps/web/`.

The module takes a cadena original string + CSD files → produces `Sello`, `NoCertificado`, and `Certificado` values → injects them into the CFDI XML.

---

## 🏗️ IMPLEMENTATION ORDER

Follow this exact order. **Write unit tests before implementation for each step.**

---

### Step 1: Error Types

**File: `packages/cfdi/src/errors.ts`**

```typescript
export class CSDError extends Error {
  constructor(
    message: string,
    public readonly code: CSDErrorCode,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'CSDError';
  }
}

export type CSDErrorCode =
  // Key loading errors
  | 'CSD_KEY_LOAD_ERROR'
  | 'CSD_PASSWORD_REQUIRED'
  | 'CSD_WRONG_PASSWORD'
  // Certificate errors
  | 'CSD_CERT_LOAD_ERROR'
  | 'CSD_CERT_EXPIRED'         // CSD001
  | 'CSD_CERT_NOT_YET_VALID'   // CSD002
  | 'CSD_NOT_A_CSD'            // CSD003 — is a FIEL, not a CSD
  | 'CSD_RFC_MISMATCH'         // CSD004 — cert RFC ≠ invoice issuer RFC
  | 'CSD_UNTRUSTED_ISSUER'     // CSD005 — not issued by SAT
  | 'CSD_RFC_NOT_FOUND'        // RFC not parseable from cert subject
  // Signing errors
  | 'CSD_SIGN_ERROR'
  | 'CSD_VERIFY_FAILED'
  // XML injection errors
  | 'CSD_XML_INJECTION_ERROR'
  | 'CSD_XML_PLACEHOLDER_NOT_FOUND';

export interface CSDValidationResult {
  valid: boolean;
  errors: Array<{ code: CSDErrorCode; message: string }>;
  certInfo?: CertificateInfo;
}

export interface CertificateInfo {
  rfc: string;
  nombre: string;
  noCertificado: string;
  validFrom: Date;
  validTo: Date;
  issuer: string;
  keyAlgorithm: string;   // e.g. "RSA-2048"
}
```

Add `CSDError` and `CSDErrorCode` to `packages/cfdi/src/index.ts` exports.

Write tests in `src/__tests__/errors.test.ts`:
- CSDError is instanceof Error
- CSDError.name === 'CSDError'
- CSDError has correct code and message
- CSDError with details stores them

---

### Step 2: Certificate Module

**File: `packages/cfdi/src/certificate.ts`**

This module handles everything related to the `.cer` file (X.509 DER certificate).

```typescript
import * as crypto from 'node:crypto';
import { CSDError, CertificateInfo } from './errors';

/**
 * Load an X.509 certificate from raw DER bytes.
 * The .cer files issued by SAT are in X.509 DER format (binary).
 *
 * @param cerBuffer - Raw DER bytes of the .cer file
 */
export function loadCertificate(cerBuffer: Buffer): crypto.X509Certificate {
  /**
   * Implementation:
   * return new crypto.X509Certificate(cerBuffer);
   *
   * Throw CSDError with code 'CSD_CERT_LOAD_ERROR' on failure.
   * Include the original error message in details.
   */
}

/**
 * Extract the SAT NoCertificado from an X.509 certificate.
 *
 * SAT-SPECIFIC ALGORITHM (not standard serial number extraction):
 * 1. Get cert.serialNumber → hex string (e.g., "3330303031303030...")
 * 2. Parse each 2-char hex pair as an ASCII code point
 * 3. Convert each code point to its character
 * 4. Join → 20-character NoCertificado string
 *
 * IMPORTANT: Do NOT use parseInt(hexSerial, 16).toString()
 * That produces decimal representation — WRONG for SAT.
 *
 * Test vector (SAT test certificate):
 *   Input hex serial: "3230303031303030303030333030303232333135"
 *   Expected output:  "20001000000300022315"
 */
export function extractNoCertificado(cert: crypto.X509Certificate): string {
  /**
   * Implementation:
   * const hexSerial = cert.serialNumber;
   * let result = '';
   * for (let i = 0; i < hexSerial.length; i += 2) {
   *   result += String.fromCharCode(parseInt(hexSerial.substring(i, i + 2), 16));
   * }
   * return result;
   */
}

/**
 * Encode the raw DER bytes of the .cer file as base64.
 * This is the value of the Certificado attribute in CFDI XML.
 *
 * @param cerBuffer - Raw DER bytes of the .cer file (same buffer used to load the cert)
 * @returns Base64 string (no line breaks, no PEM headers)
 */
export function encodeCertificateBase64(cerBuffer: Buffer): string {
  return cerBuffer.toString('base64');
}

/**
 * Extract the RFC from the certificate subject.
 *
 * SAT embeds the RFC in OID 2.5.4.45 (UniqueIdentifier/serialNumber field).
 * The format is: "RFC_VALUE / CURP_VALUE" for personas físicas
 *                "RFC_VALUE / " for personas morales
 *
 * Node.js cert.subject returns a multiline string. Example:
 *   "OID.2.5.4.45=EKU9003173C9 / XEXX900312HMCLRS05\nCN=ESCUELA...\nO=..."
 *
 * @returns RFC string (uppercase, e.g., "EKU9003173C9")
 * @throws CSDError('CSD_RFC_NOT_FOUND') if RFC cannot be parsed
 */
export function extractRFC(cert: crypto.X509Certificate): string {
  /**
   * Parse cert.subject for OID.2.5.4.45, UID, or serialNumber field.
   * RFC pattern: [A-Z&Ñ]{3,4}\d{6}[A-Z0-9]{3}
   * Personas morales: 12 chars (3 letters + 6 digits + 3 alphanums)
   * Personas físicas: 13 chars (4 letters + 6 digits + 3 alphanums)
   * Special RFCs: XAXX010101000, XEXX010101000 (always valid)
   *
   * The value before "/" is the RFC, after "/" is CURP (or empty).
   * Trim and uppercase the result.
   */
}

/**
 * Extract the legal name (Nombre) from the certificate subject CN field.
 *
 * @returns Nombre string (as it appears in the certificate)
 */
export function extractNombre(cert: crypto.X509Certificate): string {
  /**
   * Parse cert.subject for the CN= field.
   * Return the value after "CN=" up to the next newline.
   */
}

/**
 * Return a structured summary of certificate information.
 */
export function getCertificateInfo(
  cert: crypto.X509Certificate,
  cerBuffer: Buffer,
): CertificateInfo {
  /**
   * Return:
   * {
   *   rfc: extractRFC(cert),
   *   nombre: extractNombre(cert),
   *   noCertificado: extractNoCertificado(cert),
   *   validFrom: new Date(cert.validFrom),
   *   validTo: new Date(cert.validTo),
   *   issuer: cert.issuer,
   *   keyAlgorithm: `RSA-${cert.publicKey.asymmetricKeyDetails?.modulusLength ?? 'unknown'}`,
   * }
   */
}

/**
 * Validate a CSD certificate against all SAT requirements.
 *
 * Checks performed:
 * 1. Certificate is not expired (validTo > now)
 * 2. Certificate is currently valid (validFrom <= now)
 * 3. This is a CSD certificate, not an e.firma/FIEL
 *    (FIEL certificates have "FIEL" or "e.firma" in their subject/CN)
 * 4. Certificate was issued by a SAT CA
 *    (cert.issuer contains "SAT" or "Servicio de Administración Tributaria")
 *
 * @param cert - Loaded X509Certificate
 * @param expectedRfc - RFC to match against (optional — skip check if not provided)
 * @param now - Current date (injectable for testing, defaults to new Date())
 */
export function validateCertificate(
  cert: crypto.X509Certificate,
  expectedRfc?: string,
  now: Date = new Date(),
): CSDValidationResult {
  /**
   * Do NOT throw — collect all errors into the result.
   * Return { valid: errors.length === 0, errors, certInfo }
   *
   * Error conditions:
   * - now > new Date(cert.validTo)  → push { code: 'CSD_CERT_EXPIRED', message: '...' }
   * - now < new Date(cert.validFrom) → push { code: 'CSD_CERT_NOT_YET_VALID', ... }
   * - subject contains 'FIEL' or 'e.firma' (case-insensitive)
   *   → push { code: 'CSD_NOT_A_CSD', ... }
   * - issuer does not contain 'SAT' or 'Servicio de Administración Tributaria'
   *   → push { code: 'CSD_UNTRUSTED_ISSUER', ... }
   * - expectedRfc provided AND extractRFC(cert) !== expectedRfc
   *   → push { code: 'CSD_RFC_MISMATCH', ... }
   *
   * Always attempt extractRFC() — if it throws, push CSD_RFC_NOT_FOUND error.
   * Always return certInfo if extraction succeeds.
   */
}
```

Write exhaustive tests in `src/__tests__/certificate.test.ts`. Use the SAT test certificate files:

```typescript
// In test setup — load the SAT test files
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';

// SAT test certificate (DER bytes)
const TEST_CER_BUFFER = fs.readFileSync(
  path.join(__dirname, 'fixtures/certs/AAA010101AAA_CSD_01.cer')
);
const TEST_CERT = new crypto.X509Certificate(TEST_CER_BUFFER);

describe('extractNoCertificado', () => {
  it('extracts the 20-digit NoCertificado using SAT hex-to-ASCII algorithm', () => {
    // SAT test cert serial → "20001000000300022315"
    expect(extractNoCertificado(TEST_CERT)).toBe('20001000000300022315');
  });

  it('NoCertificado is always exactly 20 characters', () => {
    expect(extractNoCertificado(TEST_CERT)).toHaveLength(20);
  });

  it('NoCertificado contains only digit characters', () => {
    expect(extractNoCertificado(TEST_CERT)).toMatch(/^\d{20}$/);
  });

  it('does NOT equal the decimal representation of the hex serial', () => {
    // Standard decimal conversion would give a different result
    const hexSerial = TEST_CERT.serialNumber;
    const wrongResult = BigInt('0x' + hexSerial).toString(10);
    expect(extractNoCertificado(TEST_CERT)).not.toBe(wrongResult);
  });
});

describe('encodeCertificateBase64', () => {
  it('returns a non-empty base64 string', () => {
    const result = encodeCertificateBase64(TEST_CER_BUFFER);
    expect(result).toMatch(/^[A-Za-z0-9+/]+=*$/);
    expect(result.length).toBeGreaterThan(100);
  });

  it('decodes back to the original DER bytes', () => {
    const b64 = encodeCertificateBase64(TEST_CER_BUFFER);
    const decoded = Buffer.from(b64, 'base64');
    expect(decoded).toEqual(TEST_CER_BUFFER);
  });

  it('contains no line breaks or PEM headers', () => {
    const result = encodeCertificateBase64(TEST_CER_BUFFER);
    expect(result).not.toContain('\n');
    expect(result).not.toContain('BEGIN CERTIFICATE');
  });
});

describe('validateCertificate', () => {
  it('returns invalid for expired certificate (without faking time)', () => {
    // The SAT test cert IS expired — this should return CSD_CERT_EXPIRED
    const result = validateCertificate(TEST_CERT);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.code === 'CSD_CERT_EXPIRED')).toBe(true);
  });

  it('returns valid for non-expired cert with correct RFC (using faked date)', () => {
    // Fake date to when the test cert was valid
    const validDate = new Date('2010-09-01T00:00:00Z');
    const result = validateCertificate(TEST_CERT, 'AAA010101AAA', validDate);
    expect(result.errors.filter(e => e.code !== 'CSD_CERT_EXPIRED')).toHaveLength(0);
  });

  it('returns CSD_RFC_MISMATCH when expectedRfc does not match cert RFC', () => {
    const validDate = new Date('2010-09-01T00:00:00Z');
    const result = validateCertificate(TEST_CERT, 'XAXX010101000', validDate);
    expect(result.errors.some(e => e.code === 'CSD_RFC_MISMATCH')).toBe(true);
  });

  it('collects all errors (does not short-circuit)', () => {
    // Expired cert + wrong RFC → should have both errors
    const result = validateCertificate(TEST_CERT, 'WRONGRFC123');
    expect(result.errors.length).toBeGreaterThanOrEqual(2);
  });

  it('certInfo is present even for invalid certificate', () => {
    const result = validateCertificate(TEST_CERT);
    expect(result.certInfo).toBeDefined();
    expect(result.certInfo?.noCertificado).toBe('20001000000300022315');
  });
});
```

Place the SAT test certificate files at:
```
packages/cfdi/src/__tests__/fixtures/certs/
├── AAA010101AAA_CSD_01.cer     ← SAT test .cer file (DER binary)
├── AAA010101AAA_CSD_01.key     ← SAT test .key file (DER binary, encrypted)
└── README.md                   ← "SAT test certificates. Password: a0123456789"
```

Download these from the SAT test package in the `download-xslt` script or provide a separate `download-test-certs.ts` script. If the files cannot be downloaded in the test environment, use `it.skipIf(!certsExist)(...)` guards and clearly document why.

---

### Step 3: Crypto Module

**File: `packages/cfdi/src/crypto.ts`**

```typescript
import * as crypto from 'node:crypto';
import { CSDError } from './errors';

/**
 * Load a PKCS#8 DER encrypted private key from raw bytes.
 *
 * SAT .key files are PKCS#8 DER format (binary).
 * Node.js crypto handles this directly — no node-forge needed.
 *
 * @param keyBuffer  - Raw DER bytes of the .key file
 * @param password   - The plaintext password string
 * @returns          - KeyObject ready for use in signing
 *
 * Error mapping:
 *   ERR_MISSING_PASSPHRASE → CSD_PASSWORD_REQUIRED
 *   ERR_OSSL_BAD_DECRYPT   → CSD_WRONG_PASSWORD
 *   other                  → CSD_KEY_LOAD_ERROR
 */
export function loadPrivateKey(keyBuffer: Buffer, password: string): crypto.KeyObject {
  /**
   * crypto.createPrivateKey({
   *   key: keyBuffer,
   *   format: 'der',
   *   type: 'pkcs8',
   *   passphrase: password,
   * })
   */
}

/**
 * Sign a UTF-8 string with RSA-SHA256 PKCS#1 v1.5.
 *
 * This is the ONLY correct algorithm for SAT CFDI signing.
 * PAC will reject signatures produced with RSA-PSS or MD5.
 *
 * @param cadena     - The cadena original string (UTF-8)
 * @param privateKey - Loaded KeyObject from loadPrivateKey()
 * @returns          - Raw signature bytes (Buffer)
 *
 * Implementation:
 *   const sign = crypto.createSign('SHA256');
 *   sign.update(cadena, 'utf8');
 *   sign.end();
 *   return sign.sign({ key: privateKey, padding: crypto.constants.RSA_PKCS1_PADDING });
 *
 * DO NOT:
 *   - Pre-hash the cadena and sign the hash (createSign handles hashing internally)
 *   - Use RSA_PKCS1_PSS_PADDING
 *   - Use MD5 (legacy algorithm, rejected by modern PACs)
 */
export function signData(cadena: string, privateKey: crypto.KeyObject): Buffer {
}

/**
 * Verify an RSA-SHA256 PKCS#1 v1.5 signature.
 * Used in tests and for audit logging.
 *
 * @param cadena     - The original cadena original string
 * @param selloBase64 - The base64-encoded signature (the Sello value)
 * @param publicKey  - Public key from the certificate (cert.publicKey)
 * @returns          - true if signature is valid, false otherwise (never throws)
 */
export function verifySignature(
  cadena: string,
  selloBase64: string,
  publicKey: crypto.KeyObject,
): boolean {
  /**
   * const verify = crypto.createVerify('SHA256');
   * verify.update(cadena, 'utf8');
   * verify.end();
   * return verify.verify(
   *   { key: publicKey, padding: crypto.constants.RSA_PKCS1_PADDING },
   *   Buffer.from(selloBase64, 'base64'),
   * );
   * Catch all errors and return false.
   */
}

/**
 * Encode raw signature bytes as base64.
 * This produces the Sello attribute value.
 *
 * @param signatureBuffer - Raw bytes from signData()
 * @returns               - Base64 string (no line breaks)
 */
export function encodeSignatureBase64(signatureBuffer: Buffer): string {
  return signatureBuffer.toString('base64');
}

/**
 * Verify that a Buffer contains a valid PKCS#8 DER structure.
 * Used to validate .key file content before attempting decryption.
 *
 * Quick check: PKCS#8 DER starts with byte 0x30 (ASN.1 SEQUENCE).
 * This is a format check only, not a full ASN.1 parse.
 *
 * @returns true if buffer appears to be DER-encoded, false otherwise
 */
export function isDERBuffer(buffer: Buffer): boolean {
  return buffer.length > 0 && buffer[0] === 0x30;
}

/**
 * Verify that a Buffer contains a valid X.509 DER certificate structure.
 * Used to validate .cer file content before attempting to load.
 * Same check as isDERBuffer — DER starts with 0x30.
 */
export function isCertificateDER(buffer: Buffer): boolean {
  return isDERBuffer(buffer);
}
```

Write exhaustive tests in `src/__tests__/crypto.test.ts`:

```typescript
describe('loadPrivateKey', () => {
  it('loads SAT test .key file with correct password', () => {
    const key = loadPrivateKey(TEST_KEY_BUFFER, 'a0123456789');
    expect(key.type).toBe('private');
    expect(key.asymmetricKeyType).toBe('rsa');
  });

  it('throws CSD_WRONG_PASSWORD with incorrect password', () => {
    expect(() => loadPrivateKey(TEST_KEY_BUFFER, 'wrong')).toThrow(CSDError);
    expect(() => loadPrivateKey(TEST_KEY_BUFFER, 'wrong')).toThrow(
      expect.objectContaining({ code: 'CSD_WRONG_PASSWORD' })
    );
  });

  it('throws CSD_PASSWORD_REQUIRED when password is empty string', () => {
    // Note: empty string may behave differently from missing password
    // Test both '' and verify behavior
  });

  it('throws CSD_KEY_LOAD_ERROR for non-DER buffer', () => {
    expect(() => loadPrivateKey(Buffer.from('not a key'), 'password')).toThrow(
      expect.objectContaining({ code: 'CSD_KEY_LOAD_ERROR' })
    );
  });
});

describe('signData + verifySignature (round-trip)', () => {
  it('sign → verify round-trip with SAT test certificate', () => {
    const privateKey = loadPrivateKey(TEST_KEY_BUFFER, 'a0123456789');
    const cadena = '||4.0|A|00001|2024-03-01T10:00:00|01|10000.00|MXN|11600.00|I|01|PUE|06600||';
    const sig = signData(cadena, privateKey);
    const selloB64 = encodeSignatureBase64(sig);
    const isValid = verifySignature(cadena, selloB64, TEST_CERT.publicKey);
    expect(isValid).toBe(true);
  });

  it('signature is invalid for tampered cadena', () => {
    const privateKey = loadPrivateKey(TEST_KEY_BUFFER, 'a0123456789');
    const cadena = '||4.0|A|00001|2024-03-01T10:00:00||';
    const sig = signData(cadena, privateKey);
    const selloB64 = encodeSignatureBase64(sig);
    const tampered = cadena.replace('10000', '99999');
    expect(verifySignature(tampered, selloB64, TEST_CERT.publicKey)).toBe(false);
  });

  it('same cadena always produces same signature (deterministic for RSA PKCS#1 v1.5)', () => {
    // RSA PKCS#1 v1.5 (unlike PSS) is deterministic — same input, same signature
    const privateKey = loadPrivateKey(TEST_KEY_BUFFER, 'a0123456789');
    const cadena = '||test||';
    const sig1 = encodeSignatureBase64(signData(cadena, privateKey));
    const sig2 = encodeSignatureBase64(signData(cadena, privateKey));
    expect(sig1).toBe(sig2);
  });

  it('signature is base64-encoded (no line breaks)', () => {
    const privateKey = loadPrivateKey(TEST_KEY_BUFFER, 'a0123456789');
    const sig = encodeSignatureBase64(signData('test', privateKey));
    expect(sig).toMatch(/^[A-Za-z0-9+/]+=*$/);
    expect(sig).not.toContain('\n');
  });

  it('signature length is correct for RSA-2048 key', () => {
    // RSA-2048 produces 256-byte signatures → 344 chars in base64 (with padding)
    const privateKey = loadPrivateKey(TEST_KEY_BUFFER, 'a0123456789');
    const sig = encodeSignatureBase64(signData('test', privateKey));
    expect(sig.length).toBe(344);
  });
});

describe('verifySignature', () => {
  it('returns false (not throws) for invalid signature', () => {
    expect(verifySignature('data', 'invalidsignature', TEST_CERT.publicKey)).toBe(false);
  });

  it('returns false for empty sello', () => {
    expect(verifySignature('data', '', TEST_CERT.publicKey)).toBe(false);
  });
});

describe('isDERBuffer', () => {
  it('returns true for DER data (starts with 0x30)', () => {
    expect(isDERBuffer(Buffer.from([0x30, 0x82, 0x01]))).toBe(true);
    expect(isDERBuffer(TEST_CER_BUFFER)).toBe(true);
    expect(isDERBuffer(TEST_KEY_BUFFER)).toBe(true);
  });

  it('returns false for non-DER data', () => {
    expect(isDERBuffer(Buffer.from('-----BEGIN CERTIFICATE-----'))).toBe(false);
    expect(isDERBuffer(Buffer.alloc(0))).toBe(false);
  });
});
```

---

### Step 4: Signer Module (Orchestrator)

**File: `packages/cfdi/src/signer.ts`**

This is the main public-facing function for Component 14. It orchestrates loading, validating, signing, and injecting.

```typescript
import * as crypto from 'node:crypto';
import { loadPrivateKey, signData, encodeSignatureBase64, verifySignature } from './crypto';
import {
  loadCertificate,
  extractNoCertificado,
  encodeCertificateBase64,
  validateCertificate,
  getCertificateInfo,
} from './certificate';
import { CSDError, CSDValidationResult, CertificateInfo } from './errors';

export interface SignCFDIInput {
  /** The cadena original string from Component 13's generateCadenaOriginal() */
  cadenaOriginal: string;
  /** Raw DER bytes of the .cer file (from Component 04's getOrganizationCSD()) */
  cerBuffer: Buffer;
  /** Raw DER bytes of the .key file (from Component 04's getOrganizationCSD()) */
  keyBuffer: Buffer;
  /** Plaintext password string (Component 04 handles decryption) */
  password: string;
  /** RFC of the CFDI issuer — used to verify cert matches invoice (optional) */
  issuerRfc?: string;
  /** Skip certificate expiration check (useful for testing with expired test certs) */
  skipExpirationCheck?: boolean;
}

export interface SignCFDIResult {
  /** The Sello attribute value (base64-encoded RSA-SHA256 signature) */
  sello: string;
  /** The NoCertificado attribute value (20-char SAT serial) */
  noCertificado: string;
  /** The Certificado attribute value (base64-encoded DER certificate) */
  certificado: string;
  /** Certificate information (for audit logging) */
  certInfo: CertificateInfo;
}

/**
 * Sign a CFDI cadena original with a CSD.
 *
 * This is the primary public API of Component 14.
 *
 * Flow:
 * 1. Load certificate (X.509 DER)
 * 2. Validate certificate (expiration, RFC match, issuer)
 * 3. Load private key (PKCS#8 DER, decrypt with password)
 * 4. Sign the cadena original (RSA-SHA256 PKCS#1 v1.5)
 * 5. Encode signature as base64 → Sello
 * 6. Extract NoCertificado (SAT hex-to-ASCII algorithm)
 * 7. Encode certificate as base64 → Certificado
 * 8. Return all three values
 *
 * @throws CSDError for any validation or signing failure
 */
export async function signCFDI(input: SignCFDIInput): Promise<SignCFDIResult> {
  /**
   * Steps:
   * 1. Validate input buffers are DER (isDERBuffer checks)
   * 2. Load certificate: loadCertificate(cerBuffer)
   * 3. Validate certificate:
   *    validateCertificate(cert, issuerRfc)
   *    If !skipExpirationCheck and result has CSD_CERT_EXPIRED → throw CSDError
   *    If result has other errors → throw CSDError with first error
   * 4. Load private key: loadPrivateKey(keyBuffer, password)
   * 5. Sign: signData(cadenaOriginal, privateKey)
   * 6. Encode: encodeSignatureBase64(rawSignature)
   * 7. Return:
   *    {
   *      sello: base64Signature,
   *      noCertificado: extractNoCertificado(cert),
   *      certificado: encodeCertificateBase64(cerBuffer),
   *      certInfo: getCertificateInfo(cert, cerBuffer),
   *    }
   */
}

/**
 * Inject the signing results into an unsigned CFDI XML string.
 *
 * Replaces the placeholder attributes generated by Component 13:
 *   Sello=""  → Sello="..."
 *   NoCertificado=""  → NoCertificado="..."
 *   Certificado=""  → Certificado="..."
 *
 * Uses string replacement (not XML re-parsing) to preserve attribute
 * order and whitespace — re-parsing would invalidate the cadena original.
 *
 * @param xml         - Unsigned XML from Component 13's generateCFDI()
 * @param signResult  - Result from signCFDI()
 * @returns           - Signed XML string ready for PAC submission
 * @throws CSDError('CSD_XML_PLACEHOLDER_NOT_FOUND') if placeholders are missing
 */
export function injectSignatureIntoXML(xml: string, signResult: SignCFDIResult): string {
  /**
   * Check that all three placeholder attributes exist before replacing.
   * If Sello="" is not found in xml, throw CSD_XML_PLACEHOLDER_NOT_FOUND.
   *
   * Then replace:
   * xml.replace('Sello=""', `Sello="${signResult.sello}"`)
   *    .replace('NoCertificado=""', `NoCertificado="${signResult.noCertificado}"`)
   *    .replace('Certificado=""', `Certificado="${signResult.certificado}"`)
   */
}

/**
 * Verify that the Sello in a signed CFDI XML is valid.
 * Reconstructs the cadena original from the signed XML and verifies.
 *
 * This is primarily for testing and audit purposes.
 * Component 15 (PAC) performs the authoritative verification.
 *
 * @param signedXml   - XML with Sello populated
 * @param cerBuffer   - The .cer file that was used for signing
 * @param cadena      - The cadena original that was signed (from Component 13)
 */
export function verifyCFDISignature(
  cadena: string,
  sello: string,
  cerBuffer: Buffer,
): boolean {
  /**
   * Load certificate, get publicKey, call verifySignature().
   * Return false on any error (never throw from this function).
   */
}
```

Write tests in `src/__tests__/signer.test.ts`:

```typescript
describe('signCFDI', () => {
  const validInput: SignCFDIInput = {
    cadenaOriginal: '||4.0|A|00001|2024-03-01T10:00:00|01|10000.00|MXN|11600.00|I|01|PUE|26015|EKU9003173C9|...|URE180429TM6|...|65000|601|G01||',
    cerBuffer: TEST_CER_BUFFER,
    keyBuffer: TEST_KEY_BUFFER,
    password: 'a0123456789',
    issuerRfc: 'AAA010101AAA',        // matches the test cert RFC
    skipExpirationCheck: true,        // test cert is expired
  };

  it('returns sello, noCertificado, and certificado', async () => {
    const result = await signCFDI(validInput);
    expect(result.sello).toBeTruthy();
    expect(result.noCertificado).toBe('20001000000300022315');
    expect(result.certificado).toBeTruthy();
  });

  it('sello is valid base64 and correct length for RSA-2048', async () => {
    const result = await signCFDI(validInput);
    expect(result.sello).toMatch(/^[A-Za-z0-9+/]+=*$/);
    expect(result.sello.length).toBe(344);
  });

  it('sello can be verified against the certificate', async () => {
    const result = await signCFDI(validInput);
    const isValid = verifyCFDISignature(
      validInput.cadenaOriginal,
      result.sello,
      validInput.cerBuffer,
    );
    expect(isValid).toBe(true);
  });

  it('certificado decodes back to original DER bytes', async () => {
    const result = await signCFDI(validInput);
    expect(Buffer.from(result.certificado, 'base64')).toEqual(TEST_CER_BUFFER);
  });

  it('throws CSDError with CSD_WRONG_PASSWORD for bad password', async () => {
    const badInput = { ...validInput, password: 'wrongpassword' };
    await expect(signCFDI(badInput)).rejects.toThrow(
      expect.objectContaining({ code: 'CSD_WRONG_PASSWORD' })
    );
  });

  it('throws CSDError with CSD_RFC_MISMATCH when issuerRfc does not match cert', async () => {
    const badInput = { ...validInput, issuerRfc: 'XAXX010101000' };
    await expect(signCFDI(badInput)).rejects.toThrow(
      expect.objectContaining({ code: 'CSD_RFC_MISMATCH' })
    );
  });

  it('throws CSDError with CSD_CERT_EXPIRED for expired cert without skip flag', async () => {
    const noSkipInput = { ...validInput, skipExpirationCheck: false };
    await expect(signCFDI(noSkipInput)).rejects.toThrow(
      expect.objectContaining({ code: 'CSD_CERT_EXPIRED' })
    );
  });

  it('throws CSDError with CSD_KEY_LOAD_ERROR for invalid key buffer', async () => {
    const badInput = { ...validInput, keyBuffer: Buffer.from('not a key') };
    await expect(signCFDI(badInput)).rejects.toThrow(CSDError);
  });
});

describe('injectSignatureIntoXML', () => {
  const UNSIGNED_XML = `<?xml version="1.0" encoding="UTF-8"?>
<cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/4" Version="4.0"
  Sello="" NoCertificado="" Certificado="">
  <cfdi:Emisor Rfc="EKU9003173C9"/>
</cfdi:Comprobante>`;

  const signResult: SignCFDIResult = {
    sello: 'TESTSELLO123==',
    noCertificado: '20001000000300022315',
    certificado: 'TESTCERT456==',
    certInfo: { rfc: 'AAA010101AAA', nombre: 'TEST', noCertificado: '20001000000300022315',
                validFrom: new Date(), validTo: new Date(), issuer: 'SAT', keyAlgorithm: 'RSA-2048' },
  };

  it('injects Sello into unsigned XML', () => {
    const signed = injectSignatureIntoXML(UNSIGNED_XML, signResult);
    expect(signed).toContain('Sello="TESTSELLO123=="');
  });

  it('injects NoCertificado into unsigned XML', () => {
    const signed = injectSignatureIntoXML(UNSIGNED_XML, signResult);
    expect(signed).toContain('NoCertificado="20001000000300022315"');
  });

  it('injects Certificado into unsigned XML', () => {
    const signed = injectSignatureIntoXML(UNSIGNED_XML, signResult);
    expect(signed).toContain('Certificado="TESTCERT456=="');
  });

  it('throws CSD_XML_PLACEHOLDER_NOT_FOUND if XML has no placeholders', () => {
    const alreadySigned = UNSIGNED_XML.replace('Sello=""', 'Sello="EXISTING"');
    expect(() => injectSignatureIntoXML(alreadySigned, signResult)).toThrow(
      expect.objectContaining({ code: 'CSD_XML_PLACEHOLDER_NOT_FOUND' })
    );
  });

  it('preserves all other XML content unchanged', () => {
    const signed = injectSignatureIntoXML(UNSIGNED_XML, signResult);
    expect(signed).toContain('xmlns:cfdi="http://www.sat.gob.mx/cfd/4"');
    expect(signed).toContain('Rfc="EKU9003173C9"');
  });
});
```

---

### Step 5: Integration Bridge (apps/web)

**File: `apps/web/lib/invoices/sign-invoice.ts`**

This is the bridge between the `@repo/cfdi` package and the rest of the Next.js application. It connects Component 04's Organization Service (CSD retrieval) with Component 13 (XML generation) and Component 14 (signing).

```typescript
import { generateCFDI, generateCadenaOriginal } from '@repo/cfdi';
import { signCFDI, injectSignatureIntoXML } from '@repo/cfdi';
import { getOrganizationCSD } from '@/lib/organizations/service';  // Component 04
import { getInvoiceWithItems } from '@/lib/invoices/repository';    // Component 12
import { updateInvoiceAfterSigning } from '@/lib/invoices/repository'; // Component 12
import type { Invoice } from '@/lib/invoices/types';

export interface SignedInvoiceResult {
  invoiceId: string;
  signedXml: string;          // XML with Sello, NoCertificado, Certificado populated
  sello: string;
  noCertificado: string;
  certInfo: {
    rfc: string;
    noCertificado: string;
    validTo: Date;
  };
}

/**
 * Sign a draft invoice with the organization's CSD.
 *
 * Flow:
 * 1. Load invoice from database (must be in DRAFT or READY status)
 * 2. Retrieve CSD from Component 04's Organization Service
 * 3. Generate CFDI XML (Component 13)
 * 4. Generate cadena original (Component 13)
 * 5. Sign with CSD (Component 14)
 * 6. Inject signature into XML (Component 14)
 * 7. Store signed XML in invoices.xml_content (Component 12 repository)
 * 8. Return result
 *
 * @param invoiceId  - UUID of the invoice to sign
 * @param orgId      - Organization ID (used to retrieve CSD)
 * @throws CSDError  - for certificate/signing failures
 * @throws Error     - for invoice not found, wrong status, etc.
 */
export async function signInvoice(
  invoiceId: string,
  orgId: string,
): Promise<SignedInvoiceResult> {
  /**
   * 1. const invoice = await getInvoiceWithItems(invoiceId);
   *    if (!invoice) throw new Error('Invoice not found');
   *    if (!['draft', 'ready'].includes(invoice.status)) throw new Error('Invalid status for signing');
   *
   * 2. const { cerBuffer, keyBuffer, password } = await getOrganizationCSD(orgId);
   *
   * 3. const { xml: unsignedXml } = generateCFDI(mapInvoiceToCFDIInput(invoice));
   *
   * 4. const { cadena } = await generateCadenaOriginal(unsignedXml);
   *
   * 5. const signResult = await signCFDI({
   *      cadenaOriginal: cadena,
   *      cerBuffer,
   *      keyBuffer,
   *      password,
   *      issuerRfc: invoice.issuer_rfc,
   *    });
   *
   * 6. const signedXml = injectSignatureIntoXML(unsignedXml, signResult);
   *
   * 7. await updateInvoiceAfterSigning(invoiceId, {
   *      xml_content: signedXml,
   *      certificate_number: signResult.noCertificado,
   *      // NOTE: Do NOT set status to 'stamped' here — Component 15 (PAC) does that
   *      // Status should transition to 'signed' (a new intermediate state)
   *    });
   *
   * 8. Return { invoiceId, signedXml, sello: signResult.sello,
   *             noCertificado: signResult.noCertificado,
   *             certInfo: { rfc: signResult.certInfo.rfc,
   *                         noCertificado: signResult.noCertificado,
   *                         validTo: signResult.certInfo.validTo } }
   */
}

/**
 * Re-export mapInvoiceToCFDIInput from cfdi-bridge.ts (Component 13 bridge).
 * sign-invoice.ts reuses the same mapping function.
 */
export { mapInvoiceToCFDIInput } from './cfdi-bridge';
```

**Status workflow update required in Component 12:**

Check Component 12's invoice status workflow. If a `'signed'` status does not already exist between `'draft'/'ready'` and `'stamped'`, add it:

```
draft → ready → signed → stamped → cancelled
```

The `signed` status means: XML generated + digitally signed with CSD, but not yet submitted to PAC. Component 15 transitions from `signed` → `stamped`.

If Component 12's workflow does not include `signed`, add it to:
- `apps/web/lib/invoices/types.ts` — `InvoiceStatus` type
- `apps/web/lib/invoices/workflow.ts` — `VALID_TRANSITIONS` map
- Migration: `supabase/migrations/20260306000001_add_signed_status.sql`

Write integration tests in `apps/web/lib/invoices/__tests__/sign-invoice.test.ts`:
- Mock `getOrganizationCSD` to return test cert buffers
- Mock `getInvoiceWithItems` to return `FIXTURE_INGRESO_SIMPLE` data
- Test that `signInvoice` produces a signed XML with `Sello=` present
- Test that `signInvoice` throws for invoice in `'cancelled'` status
- Test that `signInvoice` throws `CSD_WRONG_PASSWORD` when CSD mock returns bad password
- Test that signed XML passes `validateCFDI()` (validation still passes after signing)

---

### Step 6: Update Package Exports

**Update `packages/cfdi/src/index.ts`** to export all new symbols:

```typescript
// Digital Signature (Component 14)
export { signCFDI, injectSignatureIntoXML, verifyCFDISignature } from './signer';
export { loadPrivateKey, signData, verifySignature, encodeSignatureBase64, isDERBuffer } from './crypto';
export {
  loadCertificate,
  extractNoCertificado,
  encodeCertificateBase64,
  extractRFC,
  extractNombre,
  getCertificateInfo,
  validateCertificate,
} from './certificate';

// Error types
export { CSDError } from './errors';
export type { CSDErrorCode, CSDValidationResult, CertificateInfo, SignCFDIInput, SignCFDIResult } from './errors';
```

Write tests in `src/__tests__/index.test.ts` (new cases added to existing file) verifying all new exports are accessible from `@repo/cfdi`.

---

## 🔑 KEY TECHNICAL DECISIONS

**Why Node.js built-in `crypto` instead of `node-forge`:**
Node.js `crypto` (v18+) natively handles PKCS#8 DER private keys and X.509 DER certificates. `node-forge` is a JavaScript re-implementation of cryptography — it is slower, less secure against side-channel attacks, and unnecessary. The only scenario where `node-forge` adds value (supporting Node.js <16) does not apply to this project. Adding a pure-JS crypto library for operations natively supported by OpenSSL via Node.js `crypto` would be an antipattern.

**Why PKCS#1 v1.5 padding, not PSS:**
SAT's CFDI specification requires RSA-SHA256 with PKCS#1 v1.5 padding (the classic padding scheme). This is mandated by the SAT Anexo 20 signing specification. PSS produces randomized signatures and would cause PAC verification failures. The test certificates confirm: valid SAT sellos in the CFDI examples use PKCS#1 v1.5.

**Why string replacement for XML injection:**
Re-parsing signed XML to inject signature attributes risks: (1) attribute reordering by the XML parser, (2) whitespace normalization, (3) namespace prefix changes — all of which would change the serialized XML bytes and invalidate the cadena original. Since Component 13 guarantees the exact placeholder strings `Sello=""`, `NoCertificado=""`, `Certificado=""`, string replacement is the correct approach.

**Why `signedXml` status instead of transitioning directly to `stamped`:**
A CFDI can be digitally signed (this component) but PAC submission may fail (network error, PAC outage, validation error). Separating `signed` from `stamped` enables: (1) retry PAC submission without re-signing, (2) audit trail of when signing occurred vs when stamping occurred, (3) querying all invoices that are signed-but-not-yet-stamped for retry jobs.

**Why `skipExpirationCheck` is an option:**
SAT's official test certificates are expired (the test CSD for `AAA010101AAA` expired in 2012). All unit tests must use `skipExpirationCheck: true`. Production code should never set this flag — the default (check expiration) is the production behavior. This flag exists purely for the test suite.

---

## 🧪 TESTING REQUIREMENTS

**Test certificate setup:**
Create `packages/cfdi/scripts/download-test-certs.ts` to download the SAT test certificates from the official SAT FTP/HTTP location. If the SAT source is unavailable in CI, use a `fixtures/certs/` directory committed to the repo (the SAT test certificates are public and intended for developer use).

**Coverage targets:**
| File | Target |
|---|---|
| `packages/cfdi/src/certificate.ts` | ≥ 95% |
| `packages/cfdi/src/crypto.ts` | ≥ 95% |
| `packages/cfdi/src/signer.ts` | ≥ 90% |
| `packages/cfdi/src/errors.ts` | ≥ 85% |
| `apps/web/lib/invoices/sign-invoice.ts` | ≥ 85% |

**All tests must use static/deterministic fixtures** (no `new Date()` in fixture data, no random data). Use `skipExpirationCheck: true` for all tests involving the SAT test certificate.

**Critical test vectors to verify implementation correctness:**

```typescript
// NoCertificado extraction test vector (from SAT documentation)
// SAT test cert serial hex: "3230303031303030303030333030303232333135"
// Expected NoCertificado:   "20001000000300022315"

// Sign/verify round-trip (if you can sign and verify with the same key, the algorithm is correct)
// Always test: sign(cadena, key) → verify(cadena, signature, cert.publicKey) === true

// Certificado attribute: base64(cerFileBytes) must decode back to exact same cerFileBytes
```

---

## 📝 COMPLETION SUMMARY REQUIREMENT

Provide a **Completion Summary** with:

1. **Files Created/Modified** — complete list with one-line descriptions and test counts.

2. **Cryptography Flow Diagram** — ASCII diagram showing:
   ```
   .cer (DER) → loadCertificate() → X509Certificate
                                   ├── extractNoCertificado() → "20001000000300022315"
                                   ├── encodeCertificateBase64() → base64 string
                                   └── validateCertificate() → CSDValidationResult

   .key (DER) → loadPrivateKey(password) → KeyObject
                                          └── signData(cadena) → Buffer
                                                               └── encodeSignatureBase64() → sello
   ```

3. **NoCertificado Algorithm Proof** — show the hex-to-ASCII conversion for the test vector with intermediate steps.

4. **Sign/Verify Round-Trip Proof** — show that a test cadena signed with the test key verifies successfully with the test certificate's public key.

5. **XML Injection Examples** — before/after XML showing the three placeholder replacements.

6. **Status Workflow Update** — confirm `signed` status was added (or already existed) in Component 12.

7. **Test Coverage** — test file list with test count and coverage percentage per file.

8. **Integration Contract for Component 15 (PAC)**:
   - Component 15 receives: `signedXml` (the output of `injectSignatureIntoXML()`)
   - Component 15 sends this XML to PAC SOAP endpoint for stamping
   - On success: PAC returns UUID, SelloSAT, NoCertificadoSAT → stored in `invoices.stamps`
   - Status transition: `signed` → `stamped` (done by Component 15)

9. **Known Limitations** — e.g., no LCO (Lista de Contribuyentes Obligados) validation, no OCSP/CRL check, test certs are expired.

---

## ✅ DEFINITION OF DONE

- [ ] `packages/cfdi/src/errors.ts` created — `CSDError` class, `CSDErrorCode` union, `CertificateInfo` interface
- [ ] `packages/cfdi/src/certificate.ts` created — all 6 functions implemented
- [ ] `packages/cfdi/src/crypto.ts` created — all 5 functions implemented
- [ ] `packages/cfdi/src/signer.ts` created — `signCFDI()`, `injectSignatureIntoXML()`, `verifyCFDISignature()` implemented
- [ ] `apps/web/lib/invoices/sign-invoice.ts` created — `signInvoice()` bridge function
- [ ] **No `node-forge` dependency added** — Node.js built-in `crypto` used exclusively
- [ ] `extractNoCertificado()` passes the SAT test vector: hex `"3230303031303030303030333030303232333135"` → `"20001000000300022315"`
- [ ] `loadPrivateKey()` loads SAT `.key` DER buffer with correct password (no PEM conversion)
- [ ] `loadCertificate()` loads SAT `.cer` DER buffer directly (no PEM conversion)
- [ ] `signData()` uses `RSA_PKCS1_PADDING` (PKCS#1 v1.5), NOT `RSA_PKCS1_PSS_PADDING`
- [ ] Sign/verify round-trip test passes with SAT test certificate
- [ ] `injectSignatureIntoXML()` throws `CSD_XML_PLACEHOLDER_NOT_FOUND` if placeholders absent
- [ ] `validateCertificate()` collects all errors (no short-circuit) and accepts injectable `now` Date
- [ ] SAT test certificate files in `packages/cfdi/src/__tests__/fixtures/certs/`
- [ ] All tests use `skipExpirationCheck: true` where needed
- [ ] `signed` invoice status exists in Component 12 workflow
- [ ] `packages/cfdi/src/index.ts` exports all new symbols
- [ ] All unit tests pass: `npm test` from `packages/cfdi/`
- [ ] Coverage targets met per file
- [ ] Completion Summary written
