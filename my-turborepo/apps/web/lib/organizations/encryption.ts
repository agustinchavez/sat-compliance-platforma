/**
 * Encryption Utilities
 *
 * This file provides AES-256-GCM encryption/decryption utilities for:
 * - CFDI certificate private keys
 * - PAC provider credentials
 * - Sensitive organization data
 *
 * Security features:
 * - AES-256-GCM (authenticated encryption)
 * - Random IV for each encryption operation
 * - Authentication tag verification
 * - Bcrypt for password hashing
 */

import crypto from 'crypto';
import type { EncryptedData, PACCredentials, EncryptedPACConfig } from './types';

// ============================================================================
// Configuration
// ============================================================================

const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32; // 256 bits
const IV_LENGTH = 16; // 128 bits
const AUTH_TAG_LENGTH = 16; // 128 bits
const SALT_ROUNDS = 12; // For bcrypt

// ============================================================================
// Encryption Key Management
// ============================================================================

/**
 * Gets the encryption key from environment variables
 * In production, this should use AWS KMS or similar key management service
 *
 * @param keyType - Type of encryption key ('certificate' or 'pac')
 * @returns Encryption key buffer
 * @throws Error if key is not configured
 */
function getEncryptionKey(keyType: 'certificate' | 'pac'): Buffer {
  const envKey =
    keyType === 'certificate'
      ? process.env.CERTIFICATE_ENCRYPTION_KEY
      : process.env.PAC_ENCRYPTION_KEY;

  if (!envKey) {
    throw new Error(
      `${keyType.toUpperCase()} encryption key not configured. ` +
        `Set ${keyType.toUpperCase()}_ENCRYPTION_KEY environment variable.`
    );
  }

  // Support both hex strings and base64
  let keyBuffer: Buffer;
  if (envKey.match(/^[0-9a-f]{64}$/i)) {
    // Hex string (64 chars = 32 bytes)
    keyBuffer = Buffer.from(envKey, 'hex');
  } else {
    // Base64 string
    keyBuffer = Buffer.from(envKey, 'base64');
  }

  if (keyBuffer.length !== KEY_LENGTH) {
    throw new Error(
      `Invalid encryption key length. Expected ${KEY_LENGTH} bytes, got ${keyBuffer.length} bytes.`
    );
  }

  return keyBuffer;
}

/**
 * Generates a new encryption key (for setup/rotation)
 *
 * @returns Hex-encoded encryption key
 *
 * @example
 * ```ts
 * const key = generateEncryptionKey();
 * console.log(key); // → "a1b2c3d4..." (64 hex characters)
 * ```
 */
export function generateEncryptionKey(): string {
  return crypto.randomBytes(KEY_LENGTH).toString('hex');
}

// ============================================================================
// AES-256-GCM Encryption/Decryption
// ============================================================================

/**
 * Encrypts data using AES-256-GCM
 *
 * @param data - Data to encrypt (string or buffer)
 * @param keyType - Type of encryption key to use
 * @returns Encrypted data with IV and auth tag
 *
 * @example
 * ```ts
 * const encrypted = encryptData('sensitive data', 'certificate');
 * // → { encryptedData: '...', iv: '...', authTag: '...' }
 * ```
 */
export function encryptData(
  data: string | Buffer,
  keyType: 'certificate' | 'pac' = 'certificate'
): EncryptedData {
  try {
    // Get encryption key
    const key = getEncryptionKey(keyType);

    // Generate random IV
    const iv = crypto.randomBytes(IV_LENGTH);

    // Create cipher
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

    // Convert data to buffer if needed
    const dataBuffer = typeof data === 'string' ? Buffer.from(data, 'utf8') : data;

    // Encrypt data
    const encrypted = Buffer.concat([cipher.update(dataBuffer), cipher.final()]);

    // Get authentication tag
    const authTag = cipher.getAuthTag();

    return {
      encryptedData: encrypted.toString('base64'),
      iv: iv.toString('base64'),
      authTag: authTag.toString('base64'),
    };
  } catch (error) {
    throw new Error(
      `Encryption failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Decrypts data encrypted with AES-256-GCM
 *
 * @param encryptedData - Encrypted data object
 * @param keyType - Type of encryption key to use
 * @param outputEncoding - Output encoding ('utf8' or 'buffer')
 * @returns Decrypted data
 *
 * @example
 * ```ts
 * const decrypted = decryptData(encrypted, 'certificate');
 * // → "sensitive data"
 * ```
 */
export function decryptData(
  encryptedData: EncryptedData,
  keyType: 'certificate' | 'pac' = 'certificate',
  outputEncoding: 'utf8' | 'buffer' = 'utf8'
): string | Buffer {
  try {
    // Get encryption key
    const key = getEncryptionKey(keyType);

    // Convert from base64
    const encrypted = Buffer.from(encryptedData.encryptedData, 'base64');
    const iv = Buffer.from(encryptedData.iv, 'base64');
    const authTag = Buffer.from(encryptedData.authTag, 'base64');

    // Create decipher
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    // Decrypt data
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);

    // Return in requested format
    return outputEncoding === 'utf8' ? decrypted.toString('utf8') : decrypted;
  } catch (error) {
    throw new Error(
      `Decryption failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

// ============================================================================
// Certificate Encryption
// ============================================================================

/**
 * Encrypts a certificate private key
 *
 * @param keyFile - Private key file buffer (.key)
 * @returns Encrypted private key
 *
 * @example
 * ```ts
 * const encrypted = encryptPrivateKey(keyFileBuffer);
 * // → { encryptedData: '...', iv: '...', authTag: '...' }
 * ```
 */
export function encryptPrivateKey(keyFile: Buffer): EncryptedData {
  return encryptData(keyFile, 'certificate');
}

/**
 * Decrypts a certificate private key
 *
 * @param encryptedKey - Encrypted private key object
 * @returns Decrypted private key buffer
 *
 * @example
 * ```ts
 * const decrypted = decryptPrivateKey(encryptedKey);
 * // → Buffer containing private key
 * ```
 */
export function decryptPrivateKey(encryptedKey: EncryptedData): Buffer {
  const result = decryptData(encryptedKey, 'certificate', 'buffer');
  return result as Buffer;
}

/**
 * Encrypts a certificate file
 *
 * @param cerFile - Certificate file buffer (.cer)
 * @returns Encrypted certificate
 */
export function encryptCertificate(cerFile: Buffer): EncryptedData {
  return encryptData(cerFile, 'certificate');
}

/**
 * Decrypts a certificate file
 *
 * @param encryptedCert - Encrypted certificate object
 * @returns Decrypted certificate buffer
 */
export function decryptCertificate(encryptedCert: EncryptedData): Buffer {
  const result = decryptData(encryptedCert, 'certificate', 'buffer');
  return result as Buffer;
}

// ============================================================================
// PAC Credentials Encryption
// ============================================================================

/**
 * Encrypts PAC credentials
 *
 * @param credentials - PAC credentials object
 * @returns Encrypted credentials config
 *
 * @example
 * ```ts
 * const encrypted = encryptPACCredentials({
 *   username: 'api_user',
 *   password: 'api_password'
 * });
 * // → { encryptedCredentials: '...', iv: '...', authTag: '...' }
 * ```
 */
export function encryptPACCredentials(
  credentials: PACCredentials
): Pick<EncryptedPACConfig, 'encryptedCredentials' | 'iv' | 'authTag'> {
  const credentialsJson = JSON.stringify(credentials);
  const encrypted = encryptData(credentialsJson, 'pac');

  return {
    encryptedCredentials: encrypted.encryptedData,
    iv: encrypted.iv,
    authTag: encrypted.authTag,
  };
}

/**
 * Decrypts PAC credentials
 *
 * @param encryptedCredentials - Encrypted credentials string
 * @param iv - Initialization vector
 * @param authTag - Authentication tag
 * @returns Decrypted PAC credentials
 *
 * @example
 * ```ts
 * const credentials = decryptPACCredentials(
 *   encrypted.encryptedCredentials,
 *   encrypted.iv,
 *   encrypted.authTag
 * );
 * // → { username: 'api_user', password: 'api_password' }
 * ```
 */
export function decryptPACCredentials(
  encryptedCredentials: string,
  iv: string,
  authTag: string
): PACCredentials {
  const decrypted = decryptData(
    {
      encryptedData: encryptedCredentials,
      iv,
      authTag,
    },
    'pac',
    'utf8'
  );

  return JSON.parse(decrypted as string) as PACCredentials;
}

// ============================================================================
// Password Hashing (for certificate passwords)
// ============================================================================

/**
 * Hashes a password using bcrypt
 * Note: bcrypt is CPU-intensive and should be run in worker threads for production
 *
 * @param password - Plain text password
 * @returns Bcrypt hash
 *
 * @example
 * ```ts
 * const hash = await hashPassword('my-password');
 * // → "$2b$12$..."
 * ```
 */
export async function hashPassword(password: string): Promise<string> {
  try {
    // Using Node.js crypto.scrypt as bcrypt alternative (native)
    return new Promise((resolve, reject) => {
      const salt = crypto.randomBytes(16).toString('hex');
      crypto.scrypt(password, salt, 64, (err, derivedKey) => {
        if (err) reject(err);
        resolve(`${salt}:${derivedKey.toString('hex')}`);
      });
    });
  } catch (error) {
    throw new Error(
      `Password hashing failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Verifies a password against a hash
 *
 * @param password - Plain text password
 * @param hash - Password hash to verify against
 * @returns True if password matches
 *
 * @example
 * ```ts
 * const isValid = await verifyPassword('my-password', hash);
 * // → true or false
 * ```
 */
export async function verifyPassword(
  password: string,
  hash: string
): Promise<boolean> {
  try {
    return new Promise((resolve, reject) => {
      const [salt, key] = hash.split(':');
      if (!salt) {
        reject(new Error('Invalid hash format: missing salt'));
        return;
      }
      crypto.scrypt(password, salt, 64, (err, derivedKey) => {
        if (err) reject(err);
        resolve(key === derivedKey.toString('hex'));
      });
    });
  } catch (error) {
    throw new Error(
      `Password verification failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Generates a random IV (for testing or special cases)
 *
 * @returns Base64-encoded IV
 */
export function generateIV(): string {
  return crypto.randomBytes(IV_LENGTH).toString('base64');
}

/**
 * Validates encrypted data structure
 *
 * @param data - Data to validate
 * @returns True if valid encrypted data structure
 */
export function isValidEncryptedData(data: any): data is EncryptedData {
  return (
    data &&
    typeof data === 'object' &&
    typeof data.encryptedData === 'string' &&
    typeof data.iv === 'string' &&
    typeof data.authTag === 'string'
  );
}

/**
 * Computes SHA-256 hash of data (for checksums)
 *
 * @param data - Data to hash
 * @returns Hex-encoded SHA-256 hash
 *
 * @example
 * ```ts
 * const hash = computeHash(buffer);
 * // → "a1b2c3d4..." (64 hex characters)
 * ```
 */
export function computeHash(data: Buffer | string): string {
  const buffer = typeof data === 'string' ? Buffer.from(data, 'utf8') : data;
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

/**
 * Computes HMAC-SHA256 of data
 *
 * @param data - Data to hash
 * @param secret - Secret key
 * @returns Hex-encoded HMAC
 */
export function computeHMAC(data: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(data).digest('hex');
}

/**
 * Generates a secure random token
 *
 * @param length - Token length in bytes (default: 32)
 * @returns Hex-encoded random token
 *
 * @example
 * ```ts
 * const token = generateSecureToken(32);
 * // → "a1b2c3d4..." (64 hex characters)
 * ```
 */
export function generateSecureToken(length: number = 32): string {
  return crypto.randomBytes(length).toString('hex');
}

/**
 * Constant-time string comparison (prevents timing attacks)
 *
 * @param a - First string
 * @param b - Second string
 * @returns True if strings are equal
 */
export function secureCompare(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }

  const bufferA = Buffer.from(a);
  const bufferB = Buffer.from(b);

  return crypto.timingSafeEqual(bufferA, bufferB);
}

// ============================================================================
// Encryption Utilities for Testing
// ============================================================================

/**
 * Checks if encryption is properly configured
 *
 * @returns Configuration status
 */
export function checkEncryptionConfig(): {
  certificateKeyConfigured: boolean;
  pacKeyConfigured: boolean;
  errors: string[];
} {
  const errors: string[] = [];
  let certificateKeyConfigured = false;
  let pacKeyConfigured = false;

  try {
    getEncryptionKey('certificate');
    certificateKeyConfigured = true;
  } catch (error) {
    errors.push(`Certificate key: ${error instanceof Error ? error.message : 'Not configured'}`);
  }

  try {
    getEncryptionKey('pac');
    pacKeyConfigured = true;
  } catch (error) {
    errors.push(`PAC key: ${error instanceof Error ? error.message : 'Not configured'}`);
  }

  return {
    certificateKeyConfigured,
    pacKeyConfigured,
    errors,
  };
}

/**
 * Test encryption/decryption round-trip
 *
 * @param keyType - Type of key to test
 * @returns Test result
 */
export function testEncryption(
  keyType: 'certificate' | 'pac' = 'certificate'
): { success: boolean; error?: string } {
  try {
    const testData = 'test-encryption-data-' + Date.now();
    const encrypted = encryptData(testData, keyType);
    const decrypted = decryptData(encrypted, keyType, 'utf8');

    if (decrypted !== testData) {
      return {
        success: false,
        error: 'Decrypted data does not match original',
      };
    }

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
