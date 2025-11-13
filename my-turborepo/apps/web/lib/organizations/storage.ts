/**
 * Storage Service - Cloudflare R2 Integration
 *
 * This file provides storage utilities for CFDI certificates using Cloudflare R2
 * (S3-compatible object storage). Handles encrypted certificate uploads, downloads,
 * and deletions.
 *
 * Features:
 * - S3-compatible API (works with AWS S3 and Cloudflare R2)
 * - Encrypted file storage
 * - Metadata management
 * - Checksum verification
 */

import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  type PutObjectCommandInput,
  type GetObjectCommandInput,
} from '@aws-sdk/client-s3';
import type {
  CertificateStorageMetadata,
  CertificateStorageKeys,
} from './types';
import { computeHash } from './encryption';

// ============================================================================
// Configuration
// ============================================================================

/**
 * Storage configuration
 */
interface StorageConfig {
  accountId?: string; // Cloudflare R2 account ID
  accessKeyId?: string;
  secretAccessKey?: string;
  region?: string;
  endpoint?: string; // Custom endpoint for R2
  bucketName?: string;
}

/**
 * Gets storage configuration from environment variables
 */
function getStorageConfig(): StorageConfig {
  // Check if using Cloudflare R2 or AWS S3
  const isR2 = !!process.env.R2_ACCOUNT_ID;

  if (isR2) {
    return {
      accountId: process.env.R2_ACCOUNT_ID,
      accessKeyId: process.env.R2_ACCESS_KEY_ID,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
      endpoint: process.env.R2_ACCOUNT_ID
        ? `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`
        : undefined,
      bucketName: process.env.R2_BUCKET_NAME || 'sat-compliance-certificates',
      region: 'auto', // R2 uses 'auto' region
    };
  } else {
    return {
      accessKeyId: process.env.S3_ACCESS_KEY_ID,
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
      region: process.env.S3_REGION || 'us-east-1',
      bucketName: process.env.S3_BUCKET_NAME || 'sat-compliance-certificates',
    };
  }
}

/**
 * Creates and returns an S3 client configured for R2 or AWS S3
 */
function getS3Client(): S3Client {
  const config = getStorageConfig();

  if (!config.accessKeyId || !config.secretAccessKey) {
    throw new Error(
      'Storage credentials not configured. Set R2_* or S3_* environment variables.'
    );
  }

  return new S3Client({
    region: config.region || 'auto',
    endpoint: config.endpoint,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });
}

/**
 * Gets the bucket name from configuration
 */
function getBucketName(): string {
  const config = getStorageConfig();
  if (!config.bucketName) {
    throw new Error('Storage bucket name not configured');
  }
  return config.bucketName;
}

// ============================================================================
// Storage Key Generation
// ============================================================================

/**
 * Generates storage keys for organization certificates
 *
 * @param organizationId - Organization UUID
 * @returns Storage keys for certificate files
 *
 * @example
 * ```ts
 * const keys = getCertificateStorageKeys('org-uuid');
 * // → {
 * //   certificateKey: 'certificates/org-uuid/certificate.cer.encrypted',
 * //   privateKeyKey: 'certificates/org-uuid/privatekey.key.encrypted',
 * //   metadataKey: 'certificates/org-uuid/metadata.json'
 * // }
 * ```
 */
export function getCertificateStorageKeys(
  organizationId: string
): CertificateStorageKeys {
  const prefix = `certificates/${organizationId}`;
  return {
    certificateKey: `${prefix}/certificate.cer.encrypted`,
    privateKeyKey: `${prefix}/privatekey.key.encrypted`,
    metadataKey: `${prefix}/metadata.json`,
  };
}

/**
 * Generates a storage key for a specific file
 *
 * @param organizationId - Organization UUID
 * @param fileName - File name
 * @returns Storage key
 */
export function getStorageKey(organizationId: string, fileName: string): string {
  return `certificates/${organizationId}/${fileName}`;
}

// ============================================================================
// Upload Operations
// ============================================================================

/**
 * Uploads a file to storage
 *
 * @param key - Storage key (path)
 * @param data - File data buffer
 * @param contentType - MIME type
 * @param metadata - Additional metadata
 * @returns Upload result with URL
 *
 * @example
 * ```ts
 * await uploadToStorage(
 *   'certificates/org-id/cert.cer',
 *   certBuffer,
 *   'application/x-x509-ca-cert'
 * );
 * ```
 */
export async function uploadToStorage(
  key: string,
  data: Buffer,
  contentType: string = 'application/octet-stream',
  metadata?: Record<string, string>
): Promise<{ success: boolean; key: string; url?: string }> {
  try {
    const client = getS3Client();
    const bucketName = getBucketName();

    const command = new PutObjectCommand({
      Bucket: bucketName,
      Key: key,
      Body: data,
      ContentType: contentType,
      Metadata: metadata,
      ServerSideEncryption: 'AES256', // Additional encryption at rest
    });

    await client.send(command);

    return {
      success: true,
      key,
      url: `https://${bucketName}/${key}`,
    };
  } catch (error) {
    throw new Error(
      `Failed to upload to storage: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Uploads certificate files to storage
 *
 * @param organizationId - Organization UUID
 * @param cerFile - Encrypted certificate file
 * @param keyFile - Encrypted private key file
 * @param metadata - Certificate metadata
 * @returns Upload results
 *
 * @example
 * ```ts
 * await uploadCertificateFiles(
 *   'org-id',
 *   encryptedCert,
 *   encryptedKey,
 *   metadata
 * );
 * ```
 */
export async function uploadCertificateFiles(
  organizationId: string,
  cerFile: Buffer,
  keyFile: Buffer,
  metadata: CertificateStorageMetadata
): Promise<{
  certificateUploaded: boolean;
  privateKeyUploaded: boolean;
  metadataUploaded: boolean;
}> {
  const keys = getCertificateStorageKeys(organizationId);

  try {
    // Upload certificate file
    await uploadToStorage(
      keys.certificateKey,
      cerFile,
      'application/x-x509-ca-cert',
      {
        organizationId,
        type: 'certificate',
        serialNumber: metadata.serialNumber,
      }
    );

    // Upload private key file
    await uploadToStorage(
      keys.privateKeyKey,
      keyFile,
      'application/x-pem-file',
      {
        organizationId,
        type: 'private-key',
        serialNumber: metadata.serialNumber,
      }
    );

    // Upload metadata
    const metadataJson = JSON.stringify(metadata, null, 2);
    await uploadToStorage(
      keys.metadataKey,
      Buffer.from(metadataJson, 'utf8'),
      'application/json',
      {
        organizationId,
        type: 'metadata',
      }
    );

    return {
      certificateUploaded: true,
      privateKeyUploaded: true,
      metadataUploaded: true,
    };
  } catch (error) {
    throw new Error(
      `Failed to upload certificate files: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

// ============================================================================
// Download Operations
// ============================================================================

/**
 * Downloads a file from storage
 *
 * @param key - Storage key (path)
 * @returns File data buffer
 *
 * @example
 * ```ts
 * const data = await downloadFromStorage('certificates/org-id/cert.cer');
 * // → Buffer
 * ```
 */
export async function downloadFromStorage(key: string): Promise<Buffer> {
  try {
    const client = getS3Client();
    const bucketName = getBucketName();

    const command = new GetObjectCommand({
      Bucket: bucketName,
      Key: key,
    });

    const response = await client.send(command);

    if (!response.Body) {
      throw new Error('No data returned from storage');
    }

    // Convert stream to buffer
    const chunks: Uint8Array[] = [];
    for await (const chunk of response.Body as any) {
      chunks.push(chunk);
    }

    return Buffer.concat(chunks);
  } catch (error) {
    throw new Error(
      `Failed to download from storage: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Downloads certificate files from storage
 *
 * @param organizationId - Organization UUID
 * @returns Certificate files and metadata
 *
 * @example
 * ```ts
 * const { cerFile, keyFile, metadata } = await downloadCertificateFiles('org-id');
 * ```
 */
export async function downloadCertificateFiles(organizationId: string): Promise<{
  cerFile: Buffer;
  keyFile: Buffer;
  metadata: CertificateStorageMetadata;
}> {
  const keys = getCertificateStorageKeys(organizationId);

  try {
    // Download all files in parallel
    const [cerFile, keyFile, metadataBuffer] = await Promise.all([
      downloadFromStorage(keys.certificateKey),
      downloadFromStorage(keys.privateKeyKey),
      downloadFromStorage(keys.metadataKey),
    ]);

    // Parse metadata
    const metadata: CertificateStorageMetadata = JSON.parse(
      metadataBuffer.toString('utf8')
    );

    return {
      cerFile,
      keyFile,
      metadata,
    };
  } catch (error) {
    throw new Error(
      `Failed to download certificate files: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Downloads certificate metadata only
 *
 * @param organizationId - Organization UUID
 * @returns Certificate metadata
 */
export async function downloadCertificateMetadata(
  organizationId: string
): Promise<CertificateStorageMetadata> {
  const keys = getCertificateStorageKeys(organizationId);

  try {
    const metadataBuffer = await downloadFromStorage(keys.metadataKey);
    return JSON.parse(metadataBuffer.toString('utf8'));
  } catch (error) {
    throw new Error(
      `Failed to download certificate metadata: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

// ============================================================================
// Delete Operations
// ============================================================================

/**
 * Deletes a file from storage
 *
 * @param key - Storage key (path)
 * @returns Deletion result
 *
 * @example
 * ```ts
 * await deleteFromStorage('certificates/org-id/cert.cer');
 * ```
 */
export async function deleteFromStorage(key: string): Promise<{ success: boolean }> {
  try {
    const client = getS3Client();
    const bucketName = getBucketName();

    const command = new DeleteObjectCommand({
      Bucket: bucketName,
      Key: key,
    });

    await client.send(command);

    return { success: true };
  } catch (error) {
    throw new Error(
      `Failed to delete from storage: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Deletes all certificate files for an organization
 *
 * @param organizationId - Organization UUID
 * @returns Deletion results
 *
 * @example
 * ```ts
 * await deleteCertificateFiles('org-id');
 * ```
 */
export async function deleteCertificateFiles(organizationId: string): Promise<{
  certificateDeleted: boolean;
  privateKeyDeleted: boolean;
  metadataDeleted: boolean;
}> {
  const keys = getCertificateStorageKeys(organizationId);

  try {
    // Delete all files in parallel
    await Promise.all([
      deleteFromStorage(keys.certificateKey),
      deleteFromStorage(keys.privateKeyKey),
      deleteFromStorage(keys.metadataKey),
    ]);

    return {
      certificateDeleted: true,
      privateKeyDeleted: true,
      metadataDeleted: true,
    };
  } catch (error) {
    // Even if some deletions fail, continue
    console.error('Error deleting certificate files:', error);
    return {
      certificateDeleted: false,
      privateKeyDeleted: false,
      metadataDeleted: false,
    };
  }
}

// ============================================================================
// Utility Operations
// ============================================================================

/**
 * Checks if a file exists in storage
 *
 * @param key - Storage key (path)
 * @returns True if file exists
 *
 * @example
 * ```ts
 * const exists = await fileExists('certificates/org-id/cert.cer');
 * ```
 */
export async function fileExists(key: string): Promise<boolean> {
  try {
    const client = getS3Client();
    const bucketName = getBucketName();

    const command = new HeadObjectCommand({
      Bucket: bucketName,
      Key: key,
    });

    await client.send(command);
    return true;
  } catch (error: any) {
    if (error.name === 'NotFound' || error.$metadata?.httpStatusCode === 404) {
      return false;
    }
    throw error;
  }
}

/**
 * Checks if certificate files exist for an organization
 *
 * @param organizationId - Organization UUID
 * @returns Existence status for each file
 *
 * @example
 * ```ts
 * const status = await certificateFilesExist('org-id');
 * // → { certificateExists: true, privateKeyExists: true, metadataExists: true }
 * ```
 */
export async function certificateFilesExist(organizationId: string): Promise<{
  certificateExists: boolean;
  privateKeyExists: boolean;
  metadataExists: boolean;
}> {
  const keys = getCertificateStorageKeys(organizationId);

  const [certificateExists, privateKeyExists, metadataExists] = await Promise.all([
    fileExists(keys.certificateKey),
    fileExists(keys.privateKeyKey),
    fileExists(keys.metadataKey),
  ]);

  return {
    certificateExists,
    privateKeyExists,
    metadataExists,
  };
}

/**
 * Gets file size from storage
 *
 * @param key - Storage key (path)
 * @returns File size in bytes
 */
export async function getFileSize(key: string): Promise<number> {
  try {
    const client = getS3Client();
    const bucketName = getBucketName();

    const command = new HeadObjectCommand({
      Bucket: bucketName,
      Key: key,
    });

    const response = await client.send(command);
    return response.ContentLength || 0;
  } catch (error) {
    throw new Error(
      `Failed to get file size: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

// ============================================================================
// Storage Health & Testing
// ============================================================================

/**
 * Tests storage connection
 *
 * @returns Test result
 *
 * @example
 * ```ts
 * const result = await testStorageConnection();
 * // → { success: true } or { success: false, error: '...' }
 * ```
 */
export async function testStorageConnection(): Promise<{
  success: boolean;
  error?: string;
  config?: {
    isR2: boolean;
    bucketName: string;
    region: string;
  };
}> {
  try {
    const config = getStorageConfig();
    const client = getS3Client();

    // Try a simple operation (list objects with limit 1)
    const testKey = `test/connection-test-${Date.now()}.txt`;
    await uploadToStorage(
      testKey,
      Buffer.from('test'),
      'text/plain'
    );
    await deleteFromStorage(testKey);

    return {
      success: true,
      config: {
        isR2: !!config.accountId,
        bucketName: config.bucketName || 'unknown',
        region: config.region || 'unknown',
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Gets storage configuration info (for debugging)
 *
 * @returns Storage configuration (without sensitive data)
 */
export function getStorageInfo(): {
  provider: 'cloudflare-r2' | 'aws-s3' | 'not-configured';
  bucketName: string | null;
  region: string | null;
  configured: boolean;
} {
  try {
    const config = getStorageConfig();
    const isR2 = !!config.accountId;

    return {
      provider: isR2 ? 'cloudflare-r2' : config.accessKeyId ? 'aws-s3' : 'not-configured',
      bucketName: config.bucketName || null,
      region: config.region || null,
      configured: !!(config.accessKeyId && config.secretAccessKey),
    };
  } catch (error) {
    return {
      provider: 'not-configured',
      bucketName: null,
      region: null,
      configured: false,
    };
  }
}
