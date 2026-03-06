/**
 * Tests for Certificate Module (Component 14 - Step 2)
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import {
  loadCertificate,
  extractNoCertificado,
  encodeCertificateBase64,
  extractRFC,
  extractNombre,
  getCertificateInfo,
  validateCertificate,
} from '../certificate';
import { CSDError } from '../errors';

// ============================================
// TEST FIXTURES
// ============================================

const CERTS_DIR = path.join(__dirname, 'fixtures/certs');
const TEST_CER_PATH = path.join(CERTS_DIR, 'AAA010101AAA_CSD_01.cer');

// Load test certificate (DER bytes)
const TEST_CER_BUFFER = fs.readFileSync(TEST_CER_PATH);
const TEST_CERT = new crypto.X509Certificate(TEST_CER_BUFFER);

// Test certificate details (verified)
const EXPECTED_RFC = 'AAA010101AAA';
const EXPECTED_NO_CERTIFICADO = '30001000000300023708';
const EXPECTED_NOMBRE = 'ACCEM SERVICIOS EMPRESARIALES SC';

// ============================================
// loadCertificate TESTS
// ============================================

describe('loadCertificate', () => {
  it('loads a valid DER certificate', () => {
    const cert = loadCertificate(TEST_CER_BUFFER);
    expect(cert).toBeInstanceOf(crypto.X509Certificate);
  });

  it('returns an X509Certificate with expected properties', () => {
    const cert = loadCertificate(TEST_CER_BUFFER);
    expect(cert.subject).toBeDefined();
    expect(cert.issuer).toBeDefined();
    expect(cert.validFrom).toBeDefined();
    expect(cert.validTo).toBeDefined();
    expect(cert.serialNumber).toBeDefined();
  });

  it('throws CSDError with CSD_CERT_LOAD_ERROR for invalid buffer', () => {
    expect(() => loadCertificate(Buffer.from('not a certificate'))).toThrow(CSDError);
    try {
      loadCertificate(Buffer.from('not a certificate'));
    } catch (e) {
      expect(e).toBeInstanceOf(CSDError);
      expect((e as CSDError).code).toBe('CSD_CERT_LOAD_ERROR');
    }
  });

  it('throws CSDError with CSD_CERT_LOAD_ERROR for empty buffer', () => {
    expect(() => loadCertificate(Buffer.alloc(0))).toThrow(CSDError);
    try {
      loadCertificate(Buffer.alloc(0));
    } catch (e) {
      expect(e).toBeInstanceOf(CSDError);
      expect((e as CSDError).code).toBe('CSD_CERT_LOAD_ERROR');
    }
  });

  it('includes details about original error', () => {
    try {
      loadCertificate(Buffer.from('invalid'));
    } catch (e) {
      expect((e as CSDError).details).toBeDefined();
    }
  });
});

// ============================================
// extractNoCertificado TESTS
// ============================================

describe('extractNoCertificado', () => {
  it('extracts the 20-digit NoCertificado using SAT hex-to-ASCII algorithm', () => {
    expect(extractNoCertificado(TEST_CERT)).toBe(EXPECTED_NO_CERTIFICADO);
  });

  it('NoCertificado is always exactly 20 characters', () => {
    expect(extractNoCertificado(TEST_CERT)).toHaveLength(20);
  });

  it('NoCertificado contains only digit characters', () => {
    const noCert = extractNoCertificado(TEST_CERT);
    expect(noCert).toMatch(/^\d{20}$/);
  });

  it('does NOT equal the decimal representation of the hex serial', () => {
    // Standard decimal conversion would give a different (much larger) number
    const hexSerial = TEST_CERT.serialNumber;
    // The decimal representation would be a ~40 digit number
    const wrongResult = BigInt('0x' + hexSerial).toString(10);
    expect(extractNoCertificado(TEST_CERT)).not.toBe(wrongResult);
    // Also verify the decimal is much longer
    expect(wrongResult.length).toBeGreaterThan(30);
  });

  it('correctly decodes the hex-to-ASCII algorithm', () => {
    // Verify the algorithm manually for the test vector
    // Serial: "3330303031303030303030333030303233373038"
    // Each pair: 33='3', 30='0', 30='0', 30='0', 31='1', 30='0', 30='0', 30='0', 30='0', 30='0'
    //            30='0', 33='3', 30='0', 30='0', 30='0', 32='2', 33='3', 37='7', 30='0', 38='8'
    // Result:   "30001000000300023708"
    const hexSerial = TEST_CERT.serialNumber;
    expect(hexSerial).toBe('3330303031303030303030333030303233373038');
  });
});

// ============================================
// encodeCertificateBase64 TESTS
// ============================================

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

  it('contains no line breaks', () => {
    const result = encodeCertificateBase64(TEST_CER_BUFFER);
    expect(result).not.toContain('\n');
    expect(result).not.toContain('\r');
  });

  it('contains no PEM headers', () => {
    const result = encodeCertificateBase64(TEST_CER_BUFFER);
    expect(result).not.toContain('BEGIN CERTIFICATE');
    expect(result).not.toContain('END CERTIFICATE');
    expect(result).not.toContain('-----');
  });

  it('produces correct length for RSA-2048 certificate', () => {
    // DER-encoded X.509 certificate is typically 1000-2000 bytes
    // Base64 expansion is ~4/3, so expect 1500-3000 chars
    const result = encodeCertificateBase64(TEST_CER_BUFFER);
    expect(result.length).toBeGreaterThan(1500);
    expect(result.length).toBeLessThan(3000);
  });
});

// ============================================
// extractRFC TESTS
// ============================================

describe('extractRFC', () => {
  it('extracts the RFC from the certificate subject', () => {
    const rfc = extractRFC(TEST_CERT);
    expect(rfc).toBe(EXPECTED_RFC);
  });

  it('returns uppercase RFC', () => {
    const rfc = extractRFC(TEST_CERT);
    expect(rfc).toBe(rfc.toUpperCase());
  });

  it('returns 12-character RFC for persona moral', () => {
    // The test certificate is for a persona moral (company)
    const rfc = extractRFC(TEST_CERT);
    expect(rfc).toHaveLength(12);
  });

  it('throws CSDError with CSD_RFC_NOT_FOUND for invalid certificate subject', () => {
    // Create a mock certificate-like object with no RFC in subject
    const mockCert = {
      subject: 'CN=Test\nO=Test Org\nC=MX',
    } as crypto.X509Certificate;

    expect(() => extractRFC(mockCert)).toThrow(CSDError);
    try {
      extractRFC(mockCert);
    } catch (e) {
      expect((e as CSDError).code).toBe('CSD_RFC_NOT_FOUND');
    }
  });
});

// ============================================
// extractNombre TESTS
// ============================================

describe('extractNombre', () => {
  it('extracts the legal name from CN field', () => {
    const nombre = extractNombre(TEST_CERT);
    expect(nombre).toBe(EXPECTED_NOMBRE);
  });

  it('returns non-empty string for valid certificate', () => {
    const nombre = extractNombre(TEST_CERT);
    expect(nombre.length).toBeGreaterThan(0);
  });

  it('returns empty string if CN field is missing', () => {
    const mockCert = {
      subject: 'O=Test Org\nC=MX',
    } as crypto.X509Certificate;

    const nombre = extractNombre(mockCert);
    expect(nombre).toBe('');
  });
});

// ============================================
// getCertificateInfo TESTS
// ============================================

describe('getCertificateInfo', () => {
  it('returns complete CertificateInfo object', () => {
    const info = getCertificateInfo(TEST_CERT, TEST_CER_BUFFER);
    expect(info).toHaveProperty('rfc');
    expect(info).toHaveProperty('nombre');
    expect(info).toHaveProperty('noCertificado');
    expect(info).toHaveProperty('validFrom');
    expect(info).toHaveProperty('validTo');
    expect(info).toHaveProperty('issuer');
    expect(info).toHaveProperty('keyAlgorithm');
  });

  it('extracts correct RFC', () => {
    const info = getCertificateInfo(TEST_CERT);
    expect(info.rfc).toBe(EXPECTED_RFC);
  });

  it('extracts correct NoCertificado', () => {
    const info = getCertificateInfo(TEST_CERT);
    expect(info.noCertificado).toBe(EXPECTED_NO_CERTIFICADO);
  });

  it('extracts correct nombre', () => {
    const info = getCertificateInfo(TEST_CERT);
    expect(info.nombre).toBe(EXPECTED_NOMBRE);
  });

  it('returns Date objects for validity dates', () => {
    const info = getCertificateInfo(TEST_CERT);
    expect(info.validFrom).toBeInstanceOf(Date);
    expect(info.validTo).toBeInstanceOf(Date);
  });

  it('correctly identifies RSA-2048 key algorithm', () => {
    const info = getCertificateInfo(TEST_CERT);
    expect(info.keyAlgorithm).toBe('RSA-2048');
  });

  it('includes issuer information', () => {
    const info = getCertificateInfo(TEST_CERT);
    expect(info.issuer).toBeDefined();
    expect(info.issuer.length).toBeGreaterThan(0);
  });
});

// ============================================
// validateCertificate TESTS
// ============================================

describe('validateCertificate', () => {
  it('returns invalid for expired certificate (without faking time)', () => {
    // The SAT test cert IS expired — this should return CSD_CERT_EXPIRED
    const result = validateCertificate(TEST_CERT);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.code === 'CSD_CERT_EXPIRED')).toBe(true);
  });

  it('returns valid for non-expired cert with correct RFC (using faked date)', () => {
    // Fake date to when the test cert was valid (2017-2021)
    const validDate = new Date('2019-01-15T00:00:00Z');
    const result = validateCertificate(TEST_CERT, EXPECTED_RFC, validDate);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('returns CSD_RFC_MISMATCH when expectedRfc does not match cert RFC', () => {
    const validDate = new Date('2019-01-15T00:00:00Z');
    const result = validateCertificate(TEST_CERT, 'XAXX010101000', validDate);
    expect(result.errors.some(e => e.code === 'CSD_RFC_MISMATCH')).toBe(true);
  });

  it('collects all errors (does not short-circuit)', () => {
    // Expired cert + wrong RFC → should have both errors
    const result = validateCertificate(TEST_CERT, 'WRONGRFC123');
    // Should have at least CSD_CERT_EXPIRED and CSD_RFC_MISMATCH
    expect(result.errors.length).toBeGreaterThanOrEqual(2);
  });

  it('certInfo is present even for invalid certificate', () => {
    const result = validateCertificate(TEST_CERT);
    expect(result.certInfo).toBeDefined();
    expect(result.certInfo?.noCertificado).toBe(EXPECTED_NO_CERTIFICADO);
  });

  it('detects certificate not yet valid', () => {
    // Use a date before the certificate was valid
    const earlyDate = new Date('2010-01-01T00:00:00Z');
    const result = validateCertificate(TEST_CERT, undefined, earlyDate);
    expect(result.errors.some(e => e.code === 'CSD_CERT_NOT_YET_VALID')).toBe(true);
  });

  it('passes issuer check for SAT test certificate', () => {
    // The test cert issuer contains "A.C." and "pruebas" which should pass
    const validDate = new Date('2019-01-15T00:00:00Z');
    const result = validateCertificate(TEST_CERT, EXPECTED_RFC, validDate);
    expect(result.errors.some(e => e.code === 'CSD_UNTRUSTED_ISSUER')).toBe(false);
  });

  it('skips RFC check when expectedRfc is not provided', () => {
    const validDate = new Date('2019-01-15T00:00:00Z');
    const result = validateCertificate(TEST_CERT, undefined, validDate);
    // Should not have RFC mismatch error when not checking
    expect(result.errors.some(e => e.code === 'CSD_RFC_MISMATCH')).toBe(false);
  });

  it('RFC comparison is case-insensitive', () => {
    const validDate = new Date('2019-01-15T00:00:00Z');
    // Try lowercase RFC - should still match
    const result = validateCertificate(TEST_CERT, 'aaa010101aaa', validDate);
    expect(result.errors.some(e => e.code === 'CSD_RFC_MISMATCH')).toBe(false);
  });

  it('includes descriptive error messages', () => {
    const result = validateCertificate(TEST_CERT, 'WRONGRFC123');
    const rfcError = result.errors.find(e => e.code === 'CSD_RFC_MISMATCH');
    expect(rfcError).toBeDefined();
    expect(rfcError?.message).toContain('WRONGRFC123');
    expect(rfcError?.message).toContain(EXPECTED_RFC);
  });

  it('uses current date by default', () => {
    // Don't pass a date - should use new Date() internally
    const result = validateCertificate(TEST_CERT);
    // Since the cert is expired (2021), this should fail
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.code === 'CSD_CERT_EXPIRED')).toBe(true);
  });
});

// ============================================
// EDGE CASES
// ============================================

describe('edge cases', () => {
  it('handles certificate with very long subject', () => {
    // The test cert has a complex subject - verify it handles gracefully
    const info = getCertificateInfo(TEST_CERT);
    expect(info.rfc).toBe(EXPECTED_RFC);
    expect(info.nombre).toBe(EXPECTED_NOMBRE);
  });

  it('certificate buffer can be used multiple times', () => {
    const cert1 = loadCertificate(TEST_CER_BUFFER);
    const cert2 = loadCertificate(TEST_CER_BUFFER);
    expect(extractNoCertificado(cert1)).toBe(extractNoCertificado(cert2));
  });

  it('base64 encoding is idempotent', () => {
    const b64_1 = encodeCertificateBase64(TEST_CER_BUFFER);
    const b64_2 = encodeCertificateBase64(TEST_CER_BUFFER);
    expect(b64_1).toBe(b64_2);
  });
});
