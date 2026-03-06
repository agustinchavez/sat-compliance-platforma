/**
 * CFDI Certificate Module (Component 14 - Step 2)
 *
 * Handles X.509 DER certificate loading, validation, and data extraction.
 * SAT issues certificates in DER format (binary), not PEM.
 */

import * as crypto from 'node:crypto';
import { CSDError, type CertificateInfo, type CSDValidationResult } from './errors';

// ============================================
// CERTIFICATE LOADING
// ============================================

/**
 * Load an X.509 certificate from raw DER bytes.
 * SAT .cer files are in X.509 DER format (binary).
 *
 * @param cerBuffer - Raw DER bytes of the .cer file
 * @returns The loaded X509Certificate
 * @throws CSDError with code 'CSD_CERT_LOAD_ERROR' on failure
 */
export function loadCertificate(cerBuffer: Buffer): crypto.X509Certificate {
  try {
    return new crypto.X509Certificate(cerBuffer);
  } catch (error) {
    throw new CSDError(
      `Failed to load certificate: ${error instanceof Error ? error.message : 'Unknown error'}`,
      'CSD_CERT_LOAD_ERROR',
      error,
    );
  }
}

// ============================================
// NOCERTIFICADO EXTRACTION (SAT-SPECIFIC)
// ============================================

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
 *   Input hex serial: "3330303031303030303030333030303233373038"
 *   Expected output:  "30001000000300023708"
 *
 * @param cert - The loaded X509Certificate
 * @returns 20-character NoCertificado string (all digits)
 */
export function extractNoCertificado(cert: crypto.X509Certificate): string {
  const hexSerial = cert.serialNumber;
  let result = '';
  for (let i = 0; i < hexSerial.length; i += 2) {
    const hexByte = hexSerial.substring(i, i + 2);
    result += String.fromCharCode(parseInt(hexByte, 16));
  }
  return result;
}

// ============================================
// CERTIFICATE BASE64 ENCODING
// ============================================

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

// ============================================
// RFC EXTRACTION
// ============================================

/**
 * Extract the RFC from the certificate subject.
 *
 * SAT embeds the RFC in OID 2.5.4.45 (UniqueIdentifier/serialNumber field).
 * The format is: "RFC_VALUE / CURP_VALUE" for personas físicas
 *                "RFC_VALUE / " for personas morales
 *
 * Node.js cert.subject returns a multiline string. Example:
 *   "x500UniqueIdentifier=AAA010101AAA / HEGT7610034S2\nCN=ESCUELA...\nO=..."
 *
 * @param cert - The loaded X509Certificate
 * @returns RFC string (uppercase, e.g., "AAA010101AAA")
 * @throws CSDError('CSD_RFC_NOT_FOUND') if RFC cannot be parsed
 */
export function extractRFC(cert: crypto.X509Certificate): string {
  const subject = cert.subject;

  // Match various field names that SAT uses for the RFC
  // Pattern: OID.2.5.4.45, x500UniqueIdentifier, UID, or serialNumber followed by RFC pattern
  // RFC can be 12 chars (persona moral) or 13 chars (persona fisica)
  // RFC pattern: 3-4 letters + 6 digits + 3 alphanums (handles Ñ and &)
  const patterns = [
    // x500UniqueIdentifier=AAA010101AAA / CURP
    /x500UniqueIdentifier=([A-Z&Ñ]{3,4}\d{6}[A-Z0-9]{3})/i,
    // OID.2.5.4.45=AAA010101AAA / CURP
    /OID\.2\.5\.4\.45=([A-Z&Ñ]{3,4}\d{6}[A-Z0-9]{3})/i,
    // UID=AAA010101AAA / CURP
    /UID=([A-Z&Ñ]{3,4}\d{6}[A-Z0-9]{3})/i,
    // serialNumber=AAA010101AAA / CURP (less common for RFC)
    /serialNumber=([A-Z&Ñ]{3,4}\d{6}[A-Z0-9]{3})/i,
  ];

  for (const pattern of patterns) {
    const match = subject.match(pattern);
    if (match) {
      // Return just the RFC part (before any " / " separator)
      return match[1].split('/')[0].trim().toUpperCase();
    }
  }

  throw new CSDError(
    'RFC not found in certificate subject',
    'CSD_RFC_NOT_FOUND',
    { subject },
  );
}

// ============================================
// NOMBRE EXTRACTION
// ============================================

/**
 * Extract the legal name (Nombre) from the certificate subject CN field.
 *
 * @param cert - The loaded X509Certificate
 * @returns Nombre string (as it appears in the certificate)
 */
export function extractNombre(cert: crypto.X509Certificate): string {
  const subject = cert.subject;

  // Match CN= field value
  const cnMatch = subject.match(/CN=([^\n,]+)/);
  if (cnMatch) {
    return cnMatch[1].trim();
  }

  // Fallback: try to find name= field (some SAT certs use this)
  const nameMatch = subject.match(/name=([^\n,]+)/i);
  if (nameMatch) {
    return nameMatch[1].trim();
  }

  return '';
}

// ============================================
// CERTIFICATE INFO
// ============================================

/**
 * Return a structured summary of certificate information.
 *
 * @param cert - The loaded X509Certificate
 * @param cerBuffer - Raw DER bytes (used for base64 encoding if needed)
 * @returns CertificateInfo object with all extracted fields
 */
export function getCertificateInfo(
  cert: crypto.X509Certificate,
  cerBuffer?: Buffer,
): CertificateInfo {
  let rfc: string;
  try {
    rfc = extractRFC(cert);
  } catch {
    rfc = 'UNKNOWN';
  }

  const nombre = extractNombre(cert);
  const noCertificado = extractNoCertificado(cert);

  // Get key algorithm details
  const modulusLength = cert.publicKey.asymmetricKeyDetails?.modulusLength;
  const keyAlgorithm = `RSA-${modulusLength ?? 'unknown'}`;

  return {
    rfc,
    nombre,
    noCertificado,
    validFrom: new Date(cert.validFrom),
    validTo: new Date(cert.validTo),
    issuer: cert.issuer,
    keyAlgorithm,
  };
}

// ============================================
// CERTIFICATE VALIDATION
// ============================================

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
 * @returns CSDValidationResult with errors collected (does not short-circuit)
 */
export function validateCertificate(
  cert: crypto.X509Certificate,
  expectedRfc?: string,
  now: Date = new Date(),
): CSDValidationResult {
  const errors: Array<{ code: CSDErrorCode; message: string }> = [];
  type CSDErrorCode = import('./errors').CSDErrorCode;

  // Extract certificate info (for both valid and invalid cases)
  let certInfo: CertificateInfo | undefined;
  let certRfc: string | undefined;

  try {
    certInfo = getCertificateInfo(cert);
    certRfc = certInfo.rfc;
  } catch (e) {
    errors.push({
      code: 'CSD_RFC_NOT_FOUND',
      message: `Could not extract RFC from certificate: ${e instanceof Error ? e.message : 'Unknown error'}`,
    });
  }

  // Check expiration
  const validTo = new Date(cert.validTo);
  if (now > validTo) {
    errors.push({
      code: 'CSD_CERT_EXPIRED',
      message: `Certificate expired on ${validTo.toISOString()}`,
    });
  }

  // Check not yet valid
  const validFrom = new Date(cert.validFrom);
  if (now < validFrom) {
    errors.push({
      code: 'CSD_CERT_NOT_YET_VALID',
      message: `Certificate is not yet valid (valid from ${validFrom.toISOString()})`,
    });
  }

  // Check this is a CSD, not a FIEL
  const subjectLower = cert.subject.toLowerCase();
  if (subjectLower.includes('fiel') || subjectLower.includes('e.firma')) {
    errors.push({
      code: 'CSD_NOT_A_CSD',
      message: 'Certificate appears to be a FIEL/e.firma, not a CSD. Use a CSD (Certificado de Sello Digital) for CFDI signing.',
    });
  }

  // Check issuer is SAT
  const issuerLower = cert.issuer.toLowerCase();
  const isSATIssuer = issuerLower.includes('sat') ||
    issuerLower.includes('servicio de administración tributaria') ||
    issuerLower.includes('servicio de administracion tributaria') ||
    issuerLower.includes('a.c.') || // SAT test CA often uses "A.C. X de pruebas"
    issuerLower.includes('pruebas'); // Test environment

  if (!isSATIssuer) {
    errors.push({
      code: 'CSD_UNTRUSTED_ISSUER',
      message: `Certificate was not issued by SAT. Issuer: ${cert.issuer}`,
    });
  }

  // Check RFC match (if expectedRfc provided)
  if (expectedRfc && certRfc && certRfc !== expectedRfc.toUpperCase()) {
    errors.push({
      code: 'CSD_RFC_MISMATCH',
      message: `Certificate RFC (${certRfc}) does not match expected RFC (${expectedRfc.toUpperCase()})`,
    });
  }

  return {
    valid: errors.length === 0,
    errors,
    certInfo,
  };
}
