/**
 * CFDI Certificate Management
 *
 * This file handles all operations related to CFDI certificates (CSD):
 * - Certificate upload and validation
 * - Certificate parsing (X.509)
 * - Certificate encryption/decryption
 * - Certificate storage in R2
 * - Certificate expiry checking
 *
 * Mexican CFDI certificates (Certificado de Sello Digital - CSD) are required
 * for digitally signing invoices according to SAT regulations.
 */

import { pki, asn1 } from 'node-forge';
import { createClient } from '@/lib/supabase/server';
import type {
  CertificateFiles,
  CertificateInfo,
  CertificateUploadResult,
  CertificateValidationResult,
  CertificateStatus,
  CertificateStorageMetadata,
  EncryptedData,
} from './types';
import {
  encryptCertificate,
  decryptCertificate,
  encryptPrivateKey,
  decryptPrivateKey,
  hashPassword,
  verifyPassword,
  computeHash,
} from './encryption';
import {
  uploadCertificateFiles,
  downloadCertificateFiles,
  deleteCertificateFiles,
  certificateFilesExist,
} from './storage';
import { validateCertificateFiles, validateRFC } from './validation';

// ============================================================================
// Certificate Upload & Validation
// ============================================================================

/**
 * Uploads CFDI certificates for an organization
 *
 * @param organizationId - Organization UUID
 * @param files - Certificate files (.cer, .key, password)
 * @param uploadedBy - User ID who is uploading
 * @returns Upload result with certificate info
 *
 * @example
 * ```ts
 * const result = await uploadCertificates('org-uuid', {
 *   cerFile: cerFileBuffer,
 *   keyFile: keyFileBuffer,
 *   password: 'cert-password'
 * }, 'user-uuid');
 *
 * if (result.success) {
 *   console.log('Certificate uploaded!', result.certificateInfo);
 * }
 * ```
 */
export async function uploadCertificates(
  organizationId: string,
  files: CertificateFiles,
  uploadedBy: string
): Promise<CertificateUploadResult> {
  try {
    // Step 1: Validate file structure
    const fileValidation = validateCertificateFiles(files);
    if (!fileValidation.valid) {
      return {
        success: false,
        error: fileValidation.errors.join(', '),
        message: 'Certificate files validation failed',
      };
    }

    // Step 2: Validate and parse certificates
    const certValidation = await validateCertificates(
      files.cerFile,
      files.keyFile,
      files.password
    );

    if (!certValidation.valid) {
      return {
        success: false,
        error: certValidation.errors.join(', '),
        message: 'Certificate validation failed',
      };
    }

    const certInfo = certValidation.certificateInfo!;

    // Step 3: Verify certificate RFC matches organization RFC
    const supabase = await createClient();
    const { data: org } = await supabase
      .from('organizations')
      .select('rfc')
      .eq('id', organizationId)
      .single();

    if (!org) {
      return {
        success: false,
        error: 'Organization not found',
        message: 'Failed to upload certificates',
      };
    }

    if (certInfo.rfc !== org.rfc) {
      return {
        success: false,
        error: `Certificate RFC (${certInfo.rfc}) does not match organization RFC (${org.rfc})`,
        message: 'RFC mismatch',
      };
    }

    // Step 4: Encrypt certificate and private key
    const encryptedCert = encryptCertificate(files.cerFile);
    const encryptedKey = encryptPrivateKey(files.keyFile);

    // Step 5: Hash the password
    const passwordHash = await hashPassword(files.password);

    // Step 6: Prepare metadata
    const metadata: CertificateStorageMetadata = {
      uploadedAt: new Date(),
      uploadedBy,
      serialNumber: certInfo.serialNumber,
      validFrom: certInfo.validFrom,
      validTo: certInfo.validTo,
      rfc: certInfo.rfc,
      fileSize: files.cerFile.length + files.keyFile.length,
      checksumCer: computeHash(files.cerFile),
      checksumKey: computeHash(files.keyFile),
    };

    // Step 7: Prepare encrypted data for storage
    const encryptedCertBuffer = Buffer.from(
      JSON.stringify(encryptedCert),
      'utf8'
    );
    const encryptedKeyBuffer = Buffer.from(
      JSON.stringify(encryptedKey),
      'utf8'
    );

    // Step 7b: Try to upload to R2 storage (optional - skip if not configured)
    const r2Configured = process.env.R2_ACCOUNT_ID &&
                         !process.env.R2_ACCOUNT_ID.includes('your-');

    if (r2Configured) {
      try {
        await uploadCertificateFiles(
          organizationId,
          encryptedCertBuffer,
          encryptedKeyBuffer,
          metadata
        );
      } catch (r2Error) {
        console.warn('R2 storage upload failed, storing in database only:', r2Error);
        // Continue - certificates will be stored in database
      }
    }

    // Step 8: Update organization record (always store in database)
    await supabase
      .from('organizations')
      .update({
        cfdi_cert: encryptedCertBuffer,
        cfdi_key: encryptedKeyBuffer,
        cfdi_password_hash: passwordHash,
        updated_at: new Date().toISOString(),
      })
      .eq('id', organizationId);

    // TODO: Log audit trail
    // await logOrganizationChange(organizationId, 'certificate_uploaded', metadata);

    return {
      success: true,
      certificateInfo: certInfo,
      message: 'Certificates uploaded successfully',
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      message: 'Failed to upload certificates',
    };
  }
}

/**
 * Validates certificate files
 *
 * @param cerFile - Certificate file buffer (.cer)
 * @param keyFile - Private key file buffer (.key)
 * @param password - Password for private key
 * @returns Validation result with certificate info
 *
 * @example
 * ```ts
 * const result = await validateCertificates(cerBuffer, keyBuffer, 'password');
 * if (result.valid) {
 *   console.log('Valid until:', result.certificateInfo?.validTo);
 * }
 * ```
 */
export async function validateCertificates(
  cerFile: Buffer,
  keyFile: Buffer,
  password: string
): Promise<CertificateValidationResult> {
  const errors: string[] = [];

  try {
    // Parse certificate (.cer file)
    let certificate: pki.Certificate;
    try {
      certificate = parseCertificate(cerFile);
    } catch (error) {
      errors.push('Invalid certificate format');
      return { valid: false, errors };
    }

    // Extract certificate information
    let certInfo: CertificateInfo;
    try {
      certInfo = extractCertificateDetails(certificate);
    } catch (error) {
      errors.push('Failed to extract certificate details');
      return { valid: false, errors };
    }

    // Validate certificate expiry
    if (certInfo.status === 'expired') {
      errors.push('Certificate has expired');
    }

    // Validate private key
    try {
      validatePrivateKey(keyFile, password);
    } catch (error) {
      errors.push(
        `Invalid private key or password: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
      return { valid: false, errors };
    }

    // Verify key pair matches certificate
    try {
      verifyKeyPairMatch(certificate, keyFile, password);
    } catch (error) {
      errors.push('Private key does not match certificate');
      return { valid: false, errors };
    }

    return {
      valid: errors.length === 0,
      errors,
      certificateInfo: certInfo,
    };
  } catch (error) {
    errors.push(error instanceof Error ? error.message : 'Unknown validation error');
    return { valid: false, errors };
  }
}

// ============================================================================
// Certificate Parsing
// ============================================================================

/**
 * Parses a certificate file (.cer)
 *
 * @param cerFile - Certificate file buffer
 * @returns Parsed certificate object
 */
export function parseCertificate(cerFile: Buffer): pki.Certificate {
  try {
    // Try DER format first (common for SAT certificates)
    const derData = asn1.fromDer(cerFile.toString('binary'));
    return pki.certificateFromAsn1(derData);
  } catch {
    // Try PEM format as fallback
    try {
      const pem = cerFile.toString('utf8');
      return pki.certificateFromPem(pem);
    } catch (error) {
      throw new Error('Invalid certificate format. Expected DER or PEM format.');
    }
  }
}

/**
 * Extracts certificate details from parsed certificate
 *
 * @param certificate - Parsed certificate
 * @returns Certificate information
 */
export function extractCertificateDetails(
  certificate: pki.Certificate
): CertificateInfo {
  // Extract serial number
  const serialNumber = certificate.serialNumber;

  // Extract validity dates
  const validFrom = certificate.validity.notBefore;
  const validTo = certificate.validity.notAfter;

  // Extract RFC from subject
  const subject = certificate.subject.attributes;
  let rfc = '';

  // Look for RFC in common name or serial number field
  for (const attr of subject) {
    if (attr.shortName === 'CN' || attr.name === 'commonName') {
      const value = attr.value as string;
      // Extract RFC pattern from CN
      const rfcMatch = value.match(/[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}/);
      if (rfcMatch) {
        rfc = rfcMatch[0];
      }
    }
  }

  // Extract issuer
  const issuerAttrs = certificate.issuer.attributes;
  const issuerCN = issuerAttrs.find(
    (attr) => attr.shortName === 'CN' || attr.name === 'commonName'
  );
  const issuer = issuerCN ? (issuerCN.value as string) : 'Unknown';

  // Get subject DN as string
  const subjectDN = certificate.subject.attributes
    .map((attr) => `${attr.shortName}=${attr.value}`)
    .join(', ');

  // Calculate days until expiry
  const now = new Date();
  const daysUntilExpiry = Math.floor(
    (validTo.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
  );

  // Determine status
  let status: CertificateStatus;
  if (now > validTo) {
    status = 'expired';
  } else if (daysUntilExpiry <= 30) {
    status = 'expiring_soon';
  } else {
    status = 'valid';
  }

  return {
    serialNumber,
    rfc,
    validFrom,
    validTo,
    issuer,
    subject: subjectDN,
    status,
    daysUntilExpiry,
  };
}

// ============================================================================
// Private Key Validation
// ============================================================================

/**
 * Validates a private key file and password
 *
 * @param keyFile - Private key file buffer (.key)
 * @param password - Password to decrypt key
 * @throws Error if validation fails
 */
function validatePrivateKey(keyFile: Buffer, password: string): void {
  try {
    // Try to decrypt the private key
    const keyPem = keyFile.toString('utf8');

    // Try PKCS#8 format (encrypted)
    try {
      pki.decryptRsaPrivateKey(keyPem, password);
      return;
    } catch {
      // Try different format or password is wrong
    }

    // Try PEM format
    try {
      pki.privateKeyFromPem(keyPem);
      return;
    } catch {
      // Continue trying
    }

    throw new Error('Invalid private key format or incorrect password');
  } catch (error) {
    throw new Error(
      `Private key validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Verifies that private key matches the certificate
 *
 * @param certificate - Parsed certificate
 * @param keyFile - Private key file
 * @param password - Password to decrypt key
 * @throws Error if key pair doesn't match
 */
function verifyKeyPairMatch(
  certificate: pki.Certificate,
  keyFile: Buffer,
  password: string
): void {
  try {
    // Get public key from certificate
    const publicKey = certificate.publicKey;

    // Decrypt private key
    const keyPem = keyFile.toString('utf8');
    let privateKey: pki.rsa.PrivateKey;

    try {
      privateKey = pki.decryptRsaPrivateKey(keyPem, password);
    } catch {
      privateKey = pki.privateKeyFromPem(keyPem) as pki.rsa.PrivateKey;
    }

    // Compare modulus of public and private keys
    const pubKey = publicKey as pki.rsa.PublicKey;
    if (pubKey.n.toString() !== privateKey.n.toString()) {
      throw new Error('Key pair mismatch');
    }
  } catch (error) {
    throw new Error(
      `Key pair verification failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

// ============================================================================
// Certificate Retrieval
// ============================================================================

/**
 * Gets certificate information for an organization
 *
 * @param organizationId - Organization UUID
 * @returns Certificate info or null if not uploaded
 *
 * @example
 * ```ts
 * const info = await getCertificateInfo('org-uuid');
 * if (info) {
 *   console.log('Valid until:', info.validTo);
 *   console.log('Status:', info.status);
 * }
 * ```
 */
export async function getCertificateInfo(
  organizationId: string
): Promise<CertificateInfo | null> {
  try {
    // First try to get from database (primary storage)
    const supabase = await createClient();
    const { data: org } = await supabase
      .from('organizations')
      .select('cfdi_cert')
      .eq('id', organizationId)
      .single();

    if (org?.cfdi_cert) {
      // Certificate is stored in database
      // Supabase returns bytea as hex string starting with \x
      let certData: string;
      if (Buffer.isBuffer(org.cfdi_cert)) {
        certData = org.cfdi_cert.toString('utf8');
      } else if (typeof org.cfdi_cert === 'string') {
        // Check if it's hex-encoded (starts with \x)
        if (org.cfdi_cert.startsWith('\\x')) {
          // Decode hex string to UTF-8
          const hexStr = org.cfdi_cert.slice(2); // Remove \x prefix
          certData = Buffer.from(hexStr, 'hex').toString('utf8');
        } else {
          certData = org.cfdi_cert;
        }
      } else {
        certData = JSON.stringify(org.cfdi_cert);
      }

      // Parse the encrypted certificate data
      let encryptedCert: EncryptedData;
      try {
        const parsed = JSON.parse(certData);
        // Handle if the data has a "type" wrapper from the encryption
        if (parsed.type === 'Buffer' && parsed.data) {
          // It's a serialized Buffer, convert back and parse again
          const bufferData = Buffer.from(parsed.data);
          encryptedCert = JSON.parse(bufferData.toString('utf8'));
        } else if (parsed.encryptedData && parsed.iv && parsed.authTag) {
          // Direct EncryptedData format
          encryptedCert = parsed;
        } else {
          throw new Error('Unknown certificate data format');
        }
      } catch (parseError) {
        console.error('Failed to parse certificate data:', parseError, 'Raw data preview:', certData.substring(0, 100));
        return null;
      }

      const decryptedCert = decryptCertificate(encryptedCert);
      const certificate = parseCertificate(decryptedCert);
      return extractCertificateDetails(certificate);
    }

    // Fallback: Check R2 storage if configured
    const r2Configured = process.env.R2_ACCOUNT_ID &&
                         !process.env.R2_ACCOUNT_ID.includes('your-');

    if (r2Configured) {
      const exists = await certificateFilesExist(organizationId);
      if (!exists.metadataExists) {
        return null;
      }

      const { cerFile } = await downloadCertificateFiles(organizationId);
      const encryptedCert: EncryptedData = JSON.parse(cerFile.toString('utf8'));
      const decryptedCert = decryptCertificate(encryptedCert);
      const certificate = parseCertificate(decryptedCert);
      return extractCertificateDetails(certificate);
    }

    return null;
  } catch (error) {
    console.error('Failed to get certificate info:', error);
    return null;
  }
}

/**
 * Checks certificate expiration status
 *
 * @param organizationId - Organization UUID
 * @returns Expiration status and days remaining
 *
 * @example
 * ```ts
 * const status = await checkCertificateExpiration('org-uuid');
 * if (status.isExpiring) {
 *   console.log('Certificate expires in', status.daysRemaining, 'days');
 * }
 * ```
 */
export async function checkCertificateExpiration(organizationId: string): Promise<{
  hasExpired: boolean;
  isExpiring: boolean; // Within 30 days
  daysRemaining: number | null;
  validTo: Date | null;
}> {
  try {
    const certInfo = await getCertificateInfo(organizationId);

    if (!certInfo) {
      return {
        hasExpired: false,
        isExpiring: false,
        daysRemaining: null,
        validTo: null,
      };
    }

    const now = new Date();
    const hasExpired = now > certInfo.validTo;
    const daysRemaining = certInfo.daysUntilExpiry;
    const isExpiring = daysRemaining <= 30 && daysRemaining > 0;

    return {
      hasExpired,
      isExpiring,
      daysRemaining,
      validTo: certInfo.validTo,
    };
  } catch (error) {
    return {
      hasExpired: false,
      isExpiring: false,
      daysRemaining: null,
      validTo: null,
    };
  }
}

// ============================================================================
// Certificate Deletion
// ============================================================================

/**
 * Deletes certificates for an organization
 *
 * @param organizationId - Organization UUID
 * @returns Deletion result
 *
 * @example
 * ```ts
 * await deleteCertificates('org-uuid');
 * ```
 */
export async function deleteCertificates(
  organizationId: string
): Promise<{ success: boolean }> {
  try {
    // Delete from storage
    await deleteCertificateFiles(organizationId);

    // Update organization record
    const supabase = await createClient();
    await supabase
      .from('organizations')
      .update({
        cfdi_cert: null,
        cfdi_key: null,
        cfdi_password_hash: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', organizationId);

    // TODO: Log audit trail
    // await logOrganizationChange(organizationId, 'certificate_deleted', {});

    return { success: true };
  } catch (error) {
    throw new Error(
      `Failed to delete certificates: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

// ============================================================================
// Certificate Utilities
// ============================================================================

/**
 * Formats a certificate serial number
 *
 * @param serialNumber - Raw serial number
 * @returns Formatted serial number
 */
export function formatSerialNumber(serialNumber: string): string {
  // Convert to uppercase and remove spaces
  return serialNumber.toUpperCase().replace(/\s/g, '');
}

/**
 * Gets a human-readable certificate status
 *
 * @param status - Certificate status
 * @returns Human-readable status
 */
export function getCertificateStatusText(status: CertificateStatus): string {
  const statusText = {
    valid: 'Valid',
    expiring_soon: 'Expiring Soon',
    expired: 'Expired',
    invalid: 'Invalid',
    not_uploaded: 'Not Uploaded',
  };

  return statusText[status] || 'Unknown';
}
