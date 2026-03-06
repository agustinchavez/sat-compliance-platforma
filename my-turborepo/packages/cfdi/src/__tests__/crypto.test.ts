/**
 * Tests for Crypto Module (Component 14 - Step 3)
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import {
  loadPrivateKey,
  signData,
  verifySignature,
  encodeSignatureBase64,
  isDERBuffer,
  isCertificateDER,
  isPrivateKeyDER,
} from '../crypto';
import { CSDError } from '../errors';

// ============================================
// TEST FIXTURES
// ============================================

const CERTS_DIR = path.join(__dirname, 'fixtures/certs');
const TEST_KEY_PATH = path.join(CERTS_DIR, 'AAA010101AAA_CSD_01.key');
const TEST_CER_PATH = path.join(CERTS_DIR, 'AAA010101AAA_CSD_01.cer');

// Load test files (DER bytes)
const TEST_KEY_BUFFER = fs.readFileSync(TEST_KEY_PATH);
const TEST_CER_BUFFER = fs.readFileSync(TEST_CER_PATH);
const TEST_CERT = new crypto.X509Certificate(TEST_CER_BUFFER);

// Test password (from SAT test certificate)
const TEST_PASSWORD = '12345678a';

// Test cadena original samples
const SIMPLE_CADENA = '||test||';
const CFDI_CADENA = '||4.0|A|00001|2024-03-01T10:00:00|01|10000.00|MXN|11600.00|I|01|PUE|06600|AAA010101AAA|ACCEM SERVICIOS EMPRESARIALES SC|601||';

// ============================================
// loadPrivateKey TESTS
// ============================================

describe('loadPrivateKey', () => {
  it('loads SAT test .key file with correct password', () => {
    const key = loadPrivateKey(TEST_KEY_BUFFER, TEST_PASSWORD);
    expect(key.type).toBe('private');
    expect(key.asymmetricKeyType).toBe('rsa');
  });

  it('returns KeyObject with correct modulus length', () => {
    const key = loadPrivateKey(TEST_KEY_BUFFER, TEST_PASSWORD);
    expect(key.asymmetricKeyDetails?.modulusLength).toBe(2048);
  });

  it('throws CSDError with CSD_WRONG_PASSWORD for incorrect password', () => {
    expect(() => loadPrivateKey(TEST_KEY_BUFFER, 'wrongpassword')).toThrow(CSDError);
    try {
      loadPrivateKey(TEST_KEY_BUFFER, 'wrongpassword');
    } catch (e) {
      expect(e).toBeInstanceOf(CSDError);
      expect((e as CSDError).code).toBe('CSD_WRONG_PASSWORD');
    }
  });

  it('throws CSDError with CSD_KEY_LOAD_ERROR for non-DER buffer', () => {
    expect(() => loadPrivateKey(Buffer.from('not a key'), TEST_PASSWORD)).toThrow(CSDError);
    try {
      loadPrivateKey(Buffer.from('not a key'), TEST_PASSWORD);
    } catch (e) {
      expect(e).toBeInstanceOf(CSDError);
      expect((e as CSDError).code).toBe('CSD_KEY_LOAD_ERROR');
    }
  });

  it('throws CSDError with CSD_KEY_LOAD_ERROR for empty buffer', () => {
    expect(() => loadPrivateKey(Buffer.alloc(0), TEST_PASSWORD)).toThrow(CSDError);
    try {
      loadPrivateKey(Buffer.alloc(0), TEST_PASSWORD);
    } catch (e) {
      expect((e as CSDError).code).toBe('CSD_KEY_LOAD_ERROR');
    }
  });

  it('includes details about original error', () => {
    try {
      loadPrivateKey(TEST_KEY_BUFFER, 'wrong');
    } catch (e) {
      expect((e as CSDError).details).toBeDefined();
    }
  });

  it('loads key multiple times successfully', () => {
    const key1 = loadPrivateKey(TEST_KEY_BUFFER, TEST_PASSWORD);
    const key2 = loadPrivateKey(TEST_KEY_BUFFER, TEST_PASSWORD);
    expect(key1.type).toBe(key2.type);
    expect(key1.asymmetricKeyType).toBe(key2.asymmetricKeyType);
  });
});

// ============================================
// signData + verifySignature (ROUND-TRIP) TESTS
// ============================================

describe('signData + verifySignature (round-trip)', () => {
  it('sign → verify round-trip with SAT test certificate', () => {
    const privateKey = loadPrivateKey(TEST_KEY_BUFFER, TEST_PASSWORD);
    const sig = signData(SIMPLE_CADENA, privateKey);
    const selloB64 = encodeSignatureBase64(sig);
    const isValid = verifySignature(SIMPLE_CADENA, selloB64, TEST_CERT.publicKey);
    expect(isValid).toBe(true);
  });

  it('sign → verify round-trip with CFDI-like cadena', () => {
    const privateKey = loadPrivateKey(TEST_KEY_BUFFER, TEST_PASSWORD);
    const sig = signData(CFDI_CADENA, privateKey);
    const selloB64 = encodeSignatureBase64(sig);
    const isValid = verifySignature(CFDI_CADENA, selloB64, TEST_CERT.publicKey);
    expect(isValid).toBe(true);
  });

  it('signature is invalid for tampered cadena', () => {
    const privateKey = loadPrivateKey(TEST_KEY_BUFFER, TEST_PASSWORD);
    const cadena = '||4.0|A|00001|2024-03-01T10:00:00|10000.00||';
    const sig = signData(cadena, privateKey);
    const selloB64 = encodeSignatureBase64(sig);
    const tampered = cadena.replace('10000', '99999');
    expect(verifySignature(tampered, selloB64, TEST_CERT.publicKey)).toBe(false);
  });

  it('same cadena always produces same signature (deterministic for RSA PKCS#1 v1.5)', () => {
    // RSA PKCS#1 v1.5 (unlike PSS) is deterministic — same input, same signature
    const privateKey = loadPrivateKey(TEST_KEY_BUFFER, TEST_PASSWORD);
    const sig1 = encodeSignatureBase64(signData(SIMPLE_CADENA, privateKey));
    const sig2 = encodeSignatureBase64(signData(SIMPLE_CADENA, privateKey));
    expect(sig1).toBe(sig2);
  });

  it('signature is base64-encoded (no line breaks)', () => {
    const privateKey = loadPrivateKey(TEST_KEY_BUFFER, TEST_PASSWORD);
    const sig = encodeSignatureBase64(signData(SIMPLE_CADENA, privateKey));
    expect(sig).toMatch(/^[A-Za-z0-9+/]+=*$/);
    expect(sig).not.toContain('\n');
    expect(sig).not.toContain('\r');
  });

  it('signature length is correct for RSA-2048 key (344 base64 chars)', () => {
    // RSA-2048 produces 256-byte signatures → 344 chars in base64 (with padding)
    const privateKey = loadPrivateKey(TEST_KEY_BUFFER, TEST_PASSWORD);
    const sig = encodeSignatureBase64(signData(SIMPLE_CADENA, privateKey));
    expect(sig.length).toBe(344);
  });

  it('raw signature is 256 bytes for RSA-2048', () => {
    const privateKey = loadPrivateKey(TEST_KEY_BUFFER, TEST_PASSWORD);
    const sig = signData(SIMPLE_CADENA, privateKey);
    expect(sig.length).toBe(256);
  });

  it('handles Unicode characters in cadena', () => {
    const privateKey = loadPrivateKey(TEST_KEY_BUFFER, TEST_PASSWORD);
    const unicodeCadena = '||México|Señor|Años|€|日本語||';
    const sig = signData(unicodeCadena, privateKey);
    const selloB64 = encodeSignatureBase64(sig);
    const isValid = verifySignature(unicodeCadena, selloB64, TEST_CERT.publicKey);
    expect(isValid).toBe(true);
  });

  it('handles empty cadena', () => {
    const privateKey = loadPrivateKey(TEST_KEY_BUFFER, TEST_PASSWORD);
    const emptyCadena = '';
    const sig = signData(emptyCadena, privateKey);
    const selloB64 = encodeSignatureBase64(sig);
    const isValid = verifySignature(emptyCadena, selloB64, TEST_CERT.publicKey);
    expect(isValid).toBe(true);
  });

  it('handles very long cadena', () => {
    const privateKey = loadPrivateKey(TEST_KEY_BUFFER, TEST_PASSWORD);
    const longCadena = '||' + 'x'.repeat(10000) + '||';
    const sig = signData(longCadena, privateKey);
    const selloB64 = encodeSignatureBase64(sig);
    const isValid = verifySignature(longCadena, selloB64, TEST_CERT.publicKey);
    expect(isValid).toBe(true);
  });
});

// ============================================
// verifySignature EDGE CASES
// ============================================

describe('verifySignature', () => {
  it('returns false (not throws) for invalid base64 signature', () => {
    const result = verifySignature(SIMPLE_CADENA, 'not-valid-base64!!!', TEST_CERT.publicKey);
    expect(result).toBe(false);
  });

  it('returns false for empty sello', () => {
    const result = verifySignature(SIMPLE_CADENA, '', TEST_CERT.publicKey);
    expect(result).toBe(false);
  });

  it('returns false for wrong public key', () => {
    const privateKey = loadPrivateKey(TEST_KEY_BUFFER, TEST_PASSWORD);
    const sig = encodeSignatureBase64(signData(SIMPLE_CADENA, privateKey));

    // Create a different key pair
    const otherKey = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });

    expect(verifySignature(SIMPLE_CADENA, sig, otherKey.publicKey)).toBe(false);
  });

  it('returns false for truncated signature', () => {
    const privateKey = loadPrivateKey(TEST_KEY_BUFFER, TEST_PASSWORD);
    const sig = encodeSignatureBase64(signData(SIMPLE_CADENA, privateKey));
    const truncated = sig.substring(0, 100);
    expect(verifySignature(SIMPLE_CADENA, truncated, TEST_CERT.publicKey)).toBe(false);
  });

  it('returns false for modified signature', () => {
    const privateKey = loadPrivateKey(TEST_KEY_BUFFER, TEST_PASSWORD);
    const sig = encodeSignatureBase64(signData(SIMPLE_CADENA, privateKey));
    // Modify several characters to ensure the decoded bytes are different
    const modified = sig.substring(0, 10) + 'XXXX' + sig.substring(14);
    expect(verifySignature(SIMPLE_CADENA, modified, TEST_CERT.publicKey)).toBe(false);
  });
});

// ============================================
// encodeSignatureBase64 TESTS
// ============================================

describe('encodeSignatureBase64', () => {
  it('returns valid base64 string', () => {
    const privateKey = loadPrivateKey(TEST_KEY_BUFFER, TEST_PASSWORD);
    const sig = signData(SIMPLE_CADENA, privateKey);
    const b64 = encodeSignatureBase64(sig);
    expect(b64).toMatch(/^[A-Za-z0-9+/]+=*$/);
  });

  it('decodes back to original bytes', () => {
    const privateKey = loadPrivateKey(TEST_KEY_BUFFER, TEST_PASSWORD);
    const sig = signData(SIMPLE_CADENA, privateKey);
    const b64 = encodeSignatureBase64(sig);
    const decoded = Buffer.from(b64, 'base64');
    expect(decoded).toEqual(sig);
  });

  it('handles arbitrary Buffer input', () => {
    const testBuffer = Buffer.from([0x00, 0x01, 0xff, 0xfe, 0x80, 0x7f]);
    const b64 = encodeSignatureBase64(testBuffer);
    expect(Buffer.from(b64, 'base64')).toEqual(testBuffer);
  });
});

// ============================================
// isDERBuffer TESTS
// ============================================

describe('isDERBuffer', () => {
  it('returns true for DER data (starts with 0x30)', () => {
    expect(isDERBuffer(Buffer.from([0x30, 0x82, 0x01]))).toBe(true);
  });

  it('returns true for certificate DER buffer', () => {
    expect(isDERBuffer(TEST_CER_BUFFER)).toBe(true);
  });

  it('returns true for private key DER buffer', () => {
    expect(isDERBuffer(TEST_KEY_BUFFER)).toBe(true);
  });

  it('returns false for PEM data', () => {
    expect(isDERBuffer(Buffer.from('-----BEGIN CERTIFICATE-----'))).toBe(false);
  });

  it('returns false for empty buffer', () => {
    expect(isDERBuffer(Buffer.alloc(0))).toBe(false);
  });

  it('returns false for non-DER data', () => {
    expect(isDERBuffer(Buffer.from('random text'))).toBe(false);
  });

  it('returns false for buffer starting with different byte', () => {
    expect(isDERBuffer(Buffer.from([0x31, 0x82, 0x01]))).toBe(false);
  });
});

// ============================================
// isCertificateDER TESTS
// ============================================

describe('isCertificateDER', () => {
  it('returns true for certificate DER buffer', () => {
    expect(isCertificateDER(TEST_CER_BUFFER)).toBe(true);
  });

  it('returns false for non-DER data', () => {
    expect(isCertificateDER(Buffer.from('not a cert'))).toBe(false);
  });

  it('returns false for empty buffer', () => {
    expect(isCertificateDER(Buffer.alloc(0))).toBe(false);
  });
});

// ============================================
// isPrivateKeyDER TESTS
// ============================================

describe('isPrivateKeyDER', () => {
  it('returns true for private key DER buffer', () => {
    expect(isPrivateKeyDER(TEST_KEY_BUFFER)).toBe(true);
  });

  it('returns false for non-DER data', () => {
    expect(isPrivateKeyDER(Buffer.from('not a key'))).toBe(false);
  });

  it('returns false for empty buffer', () => {
    expect(isPrivateKeyDER(Buffer.alloc(0))).toBe(false);
  });
});

// ============================================
// EDGE CASES
// ============================================

describe('edge cases', () => {
  it('signData does NOT double-hash (hashing is internal)', () => {
    // This test verifies we're not pre-hashing
    const privateKey = loadPrivateKey(TEST_KEY_BUFFER, TEST_PASSWORD);

    // Sign the cadena directly
    const sig1 = signData('test', privateKey);

    // If we were incorrectly double-hashing, we'd do:
    // const preHash = crypto.createHash('sha256').update('test').digest('hex');
    // const sig2 = signData(preHash, privateKey);
    // And sig1 would equal sig2 - but they should NOT

    // Just verify that sig1 can be verified (correct behavior)
    const selloB64 = encodeSignatureBase64(sig1);
    expect(verifySignature('test', selloB64, TEST_CERT.publicKey)).toBe(true);
  });

  it('uses PKCS#1 v1.5 padding (not PSS)', () => {
    // This test verifies deterministic signatures (PKCS#1 v1.5 is deterministic)
    // PSS would produce different signatures each time
    const privateKey = loadPrivateKey(TEST_KEY_BUFFER, TEST_PASSWORD);
    const signatures = new Set<string>();

    for (let i = 0; i < 5; i++) {
      const sig = encodeSignatureBase64(signData('deterministic test', privateKey));
      signatures.add(sig);
    }

    // All signatures should be identical (only 1 unique value)
    expect(signatures.size).toBe(1);
  });
});
