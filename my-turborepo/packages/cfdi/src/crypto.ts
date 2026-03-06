/**
 * CFDI Cryptographic Operations Module (Component 14 - Step 3)
 *
 * Handles private key loading, RSA-SHA256 signing, and signature verification.
 * Uses Node.js built-in crypto (NOT node-forge) for optimal performance and security.
 */

import * as crypto from 'node:crypto';
import { CSDError } from './errors';

// ============================================
// PRIVATE KEY LOADING
// ============================================

/**
 * Load a PKCS#8 DER encrypted private key from raw bytes.
 *
 * SAT .key files are PKCS#8 DER format (binary).
 * Node.js crypto handles this directly — no node-forge needed.
 *
 * @param keyBuffer - Raw DER bytes of the .key file
 * @param password - The plaintext password string
 * @returns KeyObject ready for use in signing
 * @throws CSDError with appropriate code for different failure modes
 *
 * Error mapping:
 *   ERR_MISSING_PASSPHRASE → CSD_PASSWORD_REQUIRED
 *   ERR_OSSL_BAD_DECRYPT   → CSD_WRONG_PASSWORD
 *   other                  → CSD_KEY_LOAD_ERROR
 */
export function loadPrivateKey(keyBuffer: Buffer, password: string): crypto.KeyObject {
  try {
    return crypto.createPrivateKey({
      key: keyBuffer,
      format: 'der',      // DER (binary), NOT 'pem'
      type: 'pkcs8',      // PKCS#8, NOT 'pkcs1' or 'sec1'
      passphrase: password,
    });
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;

    // Handle specific OpenSSL error codes
    if (nodeError.code === 'ERR_MISSING_PASSPHRASE') {
      throw new CSDError(
        'Private key password is required',
        'CSD_PASSWORD_REQUIRED',
        error,
      );
    }

    // ERR_OSSL_EVP_BAD_DECRYPT or ERR_OSSL_BAD_DECRYPT for wrong password
    if (
      nodeError.code === 'ERR_OSSL_BAD_DECRYPT' ||
      nodeError.code === 'ERR_OSSL_EVP_BAD_DECRYPT' ||
      nodeError.message?.includes('bad decrypt') ||
      nodeError.message?.includes('wrong password')
    ) {
      throw new CSDError(
        'Incorrect private key password',
        'CSD_WRONG_PASSWORD',
        error,
      );
    }

    // Generic key loading error
    throw new CSDError(
      `Failed to load private key: ${nodeError.message || 'Unknown error'}`,
      'CSD_KEY_LOAD_ERROR',
      error,
    );
  }
}

// ============================================
// RSA-SHA256 SIGNING
// ============================================

/**
 * Sign a UTF-8 string with RSA-SHA256 PKCS#1 v1.5.
 *
 * This is the ONLY correct algorithm for SAT CFDI signing.
 * PAC will reject signatures produced with RSA-PSS or MD5.
 *
 * @param cadena - The cadena original string (UTF-8)
 * @param privateKey - Loaded KeyObject from loadPrivateKey()
 * @returns Raw signature bytes (Buffer)
 * @throws CSDError with CSD_SIGN_ERROR on failure
 *
 * DO NOT:
 *   - Pre-hash the cadena and sign the hash (createSign handles hashing internally)
 *   - Use RSA_PKCS1_PSS_PADDING
 *   - Use MD5 (legacy algorithm, rejected by modern PACs)
 */
export function signData(cadena: string, privateKey: crypto.KeyObject): Buffer {
  try {
    const sign = crypto.createSign('SHA256');
    sign.update(cadena, 'utf8');
    sign.end();

    return sign.sign({
      key: privateKey,
      padding: crypto.constants.RSA_PKCS1_PADDING, // PKCS#1 v1.5 (NOT RSA_PKCS1_PSS_PADDING)
      // DO NOT specify dsaEncoding or saltLength — those are for PSS/DSA only
    });
  } catch (error) {
    throw new CSDError(
      `Failed to sign data: ${error instanceof Error ? error.message : 'Unknown error'}`,
      'CSD_SIGN_ERROR',
      error,
    );
  }
}

// ============================================
// SIGNATURE VERIFICATION
// ============================================

/**
 * Verify an RSA-SHA256 PKCS#1 v1.5 signature.
 * Used in tests and for audit logging.
 *
 * @param cadena - The original cadena original string
 * @param selloBase64 - The base64-encoded signature (the Sello value)
 * @param publicKey - Public key from the certificate (cert.publicKey)
 * @returns true if signature is valid, false otherwise (never throws)
 */
export function verifySignature(
  cadena: string,
  selloBase64: string,
  publicKey: crypto.KeyObject,
): boolean {
  try {
    const verify = crypto.createVerify('SHA256');
    verify.update(cadena, 'utf8');
    verify.end();

    return verify.verify(
      {
        key: publicKey,
        padding: crypto.constants.RSA_PKCS1_PADDING,
      },
      Buffer.from(selloBase64, 'base64'),
    );
  } catch {
    // Never throw — return false for any error
    return false;
  }
}

// ============================================
// SIGNATURE ENCODING
// ============================================

/**
 * Encode raw signature bytes as base64.
 * This produces the Sello attribute value.
 *
 * @param signatureBuffer - Raw bytes from signData()
 * @returns Base64 string (no line breaks)
 */
export function encodeSignatureBase64(signatureBuffer: Buffer): string {
  return signatureBuffer.toString('base64');
}

// ============================================
// FORMAT VALIDATION HELPERS
// ============================================

/**
 * Verify that a Buffer contains a valid DER structure.
 * Used to validate .key or .cer file content before attempting to load.
 *
 * Quick check: DER files start with byte 0x30 (ASN.1 SEQUENCE).
 * This is a format check only, not a full ASN.1 parse.
 *
 * @param buffer - Buffer to check
 * @returns true if buffer appears to be DER-encoded, false otherwise
 */
export function isDERBuffer(buffer: Buffer): boolean {
  return buffer.length > 0 && buffer[0] === 0x30;
}

/**
 * Verify that a Buffer contains a valid X.509 DER certificate structure.
 * Used to validate .cer file content before attempting to load.
 * Same check as isDERBuffer — DER starts with 0x30.
 *
 * @param buffer - Buffer to check
 * @returns true if buffer appears to be a DER certificate, false otherwise
 */
export function isCertificateDER(buffer: Buffer): boolean {
  return isDERBuffer(buffer);
}

/**
 * Verify that a Buffer contains a valid PKCS#8 DER key structure.
 * Used to validate .key file content before attempting to load.
 * Same check as isDERBuffer — DER starts with 0x30.
 *
 * @param buffer - Buffer to check
 * @returns true if buffer appears to be a DER key, false otherwise
 */
export function isPrivateKeyDER(buffer: Buffer): boolean {
  return isDERBuffer(buffer);
}
