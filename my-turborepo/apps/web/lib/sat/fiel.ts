/**
 * FIEL (Firma Electrónica Avanzada) Utilities
 *
 * This file handles Mexican e.firma (FIEL) operations for SAT integration:
 * - Loading FIEL certificates from organization storage
 * - Decrypting private keys
 * - Generating XML digital signatures (XML-DSig)
 * - Verifying XML signatures
 * - Certificate validation and expiry checking
 *
 * FIEL is the Mexican government's advanced electronic signature system
 * used for authenticating with SAT web services.
 */

import crypto from 'crypto';
import { pki, md, asn1 } from 'node-forge';
import { SignedXml } from 'xml-crypto';
import { createClient } from '@/lib/supabase/server';
import {
  parseCertificate,
  extractCertificateDetails,
  getCertificateInfo,
} from '@/lib/organizations/certificates';
import {
  decryptCertificate,
  decryptPrivateKey,
  verifyPassword,
} from '@/lib/organizations/encryption';
import { downloadCertificateFiles } from '@/lib/organizations/storage';
import type {
  FIELCredentials,
  FIELInfo,
  DecryptedFIEL,
  EncryptedData,
} from './types';
import { SATCertificateError, SATAuthenticationError } from './types';
import { toBase64, derToPem, pemToDer } from './utils';

// ============================================================================
// FIEL Loading
// ============================================================================

/**
 * Loads FIEL credentials for an organization
 *
 * @param organizationId - Organization UUID
 * @returns FIEL credentials (still encrypted)
 * @throws SATCertificateError if certificates not found or invalid
 *
 * @example
 * ```ts
 * const fiel = await loadFIEL('org-uuid');
 * console.log('RFC:', fiel.rfc);
 * ```
 */
export async function loadFIEL(organizationId: string): Promise<FIELCredentials> {
  try {
    // Get organization data
    const supabase = await createClient();
    const { data: org, error } = await supabase
      .from('organizations')
      .select('rfc, cfdi_cert, cfdi_key, cfdi_password_hash')
      .eq('id', organizationId)
      .single();

    if (error || !org) {
      throw new SATCertificateError('Organization not found');
    }

    if (!org.cfdi_cert || !org.cfdi_key || !org.cfdi_password_hash) {
      throw new SATCertificateError(
        'FIEL certificates not uploaded. Please upload CSD certificate and private key.'
      );
    }

    // Download certificate files from storage
    const { cerFile, keyFile } = await downloadCertificateFiles(organizationId);

    // Parse encrypted data
    const encryptedCert: EncryptedData = JSON.parse(cerFile.toString('utf8'));
    const encryptedKey: EncryptedData = JSON.parse(keyFile.toString('utf8'));

    // Decrypt certificate (public key - safe to decrypt)
    const certificate = decryptCertificate(encryptedCert);

    return {
      certificate,
      privateKey: Buffer.from(JSON.stringify(encryptedKey), 'utf8'),
      password: org.cfdi_password_hash, // This is the hash, actual password comes from user
      rfc: org.rfc,
    };
  } catch (error) {
    if (error instanceof SATCertificateError) {
      throw error;
    }
    throw new SATCertificateError(
      `Failed to load FIEL: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Loads and decrypts FIEL credentials
 *
 * @param organizationId - Organization UUID
 * @param password - Plain text password for private key
 * @returns Fully decrypted FIEL with PEM format keys
 * @throws SATCertificateError if decryption fails
 *
 * @example
 * ```ts
 * const fiel = await loadAndDecryptFIEL('org-uuid', 'password123');
 * console.log('Certificate valid until:', fiel.info.validTo);
 * ```
 */
export async function loadAndDecryptFIEL(
  organizationId: string,
  password: string
): Promise<DecryptedFIEL> {
  try {
    // Load FIEL credentials
    const credentials = await loadFIEL(organizationId);

    // Verify password hash
    const supabase = await createClient();
    const { data: org } = await supabase
      .from('organizations')
      .select('cfdi_password_hash')
      .eq('id', organizationId)
      .single();

    if (!org?.cfdi_password_hash) {
      throw new SATCertificateError('Password hash not found');
    }

    const passwordValid = await verifyPassword(password, org.cfdi_password_hash);
    if (!passwordValid) {
      throw new SATAuthenticationError('Invalid certificate password');
    }

    // Parse encrypted private key
    const encryptedKey: EncryptedData = JSON.parse(
      credentials.privateKey.toString('utf8')
    );

    // Decrypt private key
    const privateKeyBuffer = decryptPrivateKey(encryptedKey);

    // Parse certificate to get info
    const certificate = parseCertificate(credentials.certificate);
    const info = extractCertificateDetails(certificate);

    // Validate certificate is still valid
    validateCertificateExpiry(info);

    // Convert to PEM format for signing
    const certificatePem = getCertificatePem(credentials.certificate);
    const privateKeyPem = await decryptPrivateKeyPem(privateKeyBuffer, password);

    return {
      certificate: credentials.certificate,
      privateKey: privateKeyBuffer,
      certificatePem,
      privateKeyPem,
      info: {
        serialNumber: info.serialNumber,
        issuer: info.issuer,
        subject: info.subject,
        validFrom: info.validFrom,
        validTo: info.validTo,
        isValid: info.status === 'valid',
        daysUntilExpiry: info.daysUntilExpiry,
      },
    };
  } catch (error) {
    if (error instanceof SATCertificateError || error instanceof SATAuthenticationError) {
      throw error;
    }
    throw new SATCertificateError(
      `Failed to decrypt FIEL: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

// ============================================================================
// Certificate Conversion
// ============================================================================

/**
 * Converts certificate buffer to PEM format
 *
 * @param certBuffer - Certificate buffer (DER format)
 * @returns PEM formatted certificate
 */
function getCertificatePem(certBuffer: Buffer): string {
  try {
    // Try to parse as DER first
    const asn1Cert = pki.fromDer(certBuffer.toString('binary'));
    const certificate = pki.certificateFromAsn1(asn1Cert);
    return pki.certificateToPem(certificate);
  } catch {
    // Already in PEM format
    const pem = certBuffer.toString('utf8');
    if (pem.includes('BEGIN CERTIFICATE')) {
      return pem;
    }
    throw new SATCertificateError('Invalid certificate format');
  }
}

/**
 * Decrypts and converts private key to PEM format
 *
 * @param keyBuffer - Encrypted private key buffer
 * @param password - Password to decrypt
 * @returns PEM formatted private key
 */
async function decryptPrivateKeyPem(
  keyBuffer: Buffer,
  password: string
): Promise<string> {
  try {
    const keyPem = keyBuffer.toString('utf8');

    // Try to decrypt if encrypted
    try {
      const privateKey = pki.decryptRsaPrivateKey(keyPem, password);
      if (privateKey) {
        return pki.privateKeyToPem(privateKey);
      }
    } catch {
      // Not encrypted or different format
    }

    // Try as plain PEM
    if (keyPem.includes('BEGIN PRIVATE KEY') || keyPem.includes('BEGIN RSA PRIVATE KEY')) {
      return keyPem;
    }

    // Try as DER format
    try {
      const asn1Key = pki.fromDer(keyBuffer.toString('binary'));
      const privateKey = pki.privateKeyFromAsn1(asn1Key);
      return pki.privateKeyToPem(privateKey);
    } catch {
      throw new SATCertificateError('Unable to decrypt private key');
    }
  } catch (error) {
    throw new SATCertificateError(
      `Failed to convert private key: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

// ============================================================================
// XML Signature Generation
// ============================================================================

/**
 * Signs XML data using FIEL
 *
 * @param xml - XML string to sign
 * @param fiel - Decrypted FIEL credentials
 * @returns Signed XML string with signature
 *
 * @example
 * ```ts
 * const fiel = await loadAndDecryptFIEL('org-uuid', 'password');
 * const signedXml = signXML('<root>data</root>', fiel);
 * ```
 */
export function signXML(xml: string, fiel: DecryptedFIEL): string {
  try {
    const sig = new SignedXml({ privateKey: fiel.privateKeyPem });

    // Configure signature
    sig.addReference({
      xpath: "//*[local-name()='Autenticacion']",
      digestAlgorithm: 'http://www.w3.org/2001/04/xmlenc#sha256',
      transforms: ['http://www.w3.org/2001/10/xml-exc-c14n#'],
    });

    sig.canonicalizationAlgorithm = 'http://www.w3.org/2001/10/xml-exc-c14n#';
    sig.signatureAlgorithm = 'http://www.w3.org/2001/04/xmldsig-more#rsa-sha256';

    // Add certificate to key info
    sig.keyInfoProvider = {
      getKeyInfo: () => {
        const certBase64 = pemToDer(fiel.certificatePem).toString('base64');
        return `<X509Data><X509Certificate>${certBase64}</X509Certificate></X509Data>`;
      },
    };

    // Sign the XML
    sig.computeSignature(xml);

    return sig.getSignedXml();
  } catch (error) {
    throw new SATCertificateError(
      `Failed to sign XML: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Creates a signature for SAT authentication request
 *
 * @param data - Data to sign (usually timestamp or nonce)
 * @param fiel - Decrypted FIEL credentials
 * @returns Base64 encoded signature
 *
 * @example
 * ```ts
 * const fiel = await loadAndDecryptFIEL('org-uuid', 'password');
 * const signature = createAuthenticationSignature('2024-11-19T10:30:00', fiel);
 * ```
 */
export function createAuthenticationSignature(
  data: string,
  fiel: DecryptedFIEL
): string {
  try {
    // Parse private key
    const privateKey = pki.privateKeyFromPem(fiel.privateKeyPem) as pki.rsa.PrivateKey;

    // Create hash of data
    const msgDigest = md.sha256.create();
    msgDigest.update(data, 'utf8');

    // Sign the hash
    const signature = privateKey.sign(msgDigest);

    // Return base64 encoded signature
    return Buffer.from(signature, 'binary').toString('base64');
  } catch (error) {
    throw new SATCertificateError(
      `Failed to create signature: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Gets certificate in Base64 format for SAT authentication
 *
 * @param fiel - Decrypted FIEL credentials
 * @returns Base64 encoded certificate (without headers)
 */
export function getCertificateBase64(fiel: DecryptedFIEL): string {
  try {
    const derBuffer = pemToDer(fiel.certificatePem);
    return derBuffer.toString('base64');
  } catch (error) {
    throw new SATCertificateError(
      `Failed to encode certificate: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

// ============================================================================
// XML Signature Verification
// ============================================================================

/**
 * Verifies XML signature
 *
 * @param signedXml - Signed XML string
 * @param certificate - Certificate PEM (optional, will extract from XML if not provided)
 * @returns true if signature is valid
 *
 * @example
 * ```ts
 * const isValid = verifyXMLSignature(signedXml);
 * console.log('Signature valid:', isValid);
 * ```
 */
export function verifyXMLSignature(
  signedXml: string,
  certificate?: string
): boolean {
  try {
    // Extract certificate from XML if not provided
    const certPem = certificate || extractCertificateFromXML(signedXml);

    if (!certPem) {
      throw new SATCertificateError('No certificate found in XML');
    }

    // Create SignedXml instance
    const sig = new SignedXml();
    sig.keyInfoProvider = {
      getKey: () => Buffer.from(certPem),
    };

    // Load signed XML
    sig.loadSignature(signedXml);

    // Verify signature
    return sig.checkSignature(signedXml);
  } catch (error) {
    console.error('Failed to verify XML signature:', error);
    return false;
  }
}

/**
 * Extracts certificate from signed XML
 *
 * @param signedXml - Signed XML string
 * @returns Certificate in PEM format or null
 */
function extractCertificateFromXML(signedXml: string): string | null {
  try {
    // Find X509Certificate in XML
    const certMatch = signedXml.match(
      /<X509Certificate>([\s\S]*?)<\/X509Certificate>/
    );

    if (!certMatch) {
      return null;
    }

    const certBase64 = certMatch[1].replace(/\s/g, '');
    const certDer = Buffer.from(certBase64, 'base64');

    return derToPem(certDer, 'CERTIFICATE');
  } catch {
    return null;
  }
}

// ============================================================================
// Certificate Validation
// ============================================================================

/**
 * Validates certificate expiry
 *
 * @param info - Certificate info
 * @throws SATCertificateError if certificate is expired or expiring soon
 */
export function validateCertificateExpiry(info: FIELInfo): void {
  const now = new Date();

  if (now > info.validTo) {
    throw new SATCertificateError(
      `Certificate has expired on ${info.validTo.toISOString()}`
    );
  }

  if (info.daysUntilExpiry <= 0) {
    throw new SATCertificateError('Certificate has expired');
  }

  if (info.daysUntilExpiry <= 7) {
    console.warn(
      `WARNING: Certificate expires in ${info.daysUntilExpiry} days (${info.validTo.toISOString()})`
    );
  }
}

/**
 * Checks if certificate needs renewal
 *
 * @param organizationId - Organization UUID
 * @returns Renewal status
 *
 * @example
 * ```ts
 * const status = await checkCertificateRenewal('org-uuid');
 * if (status.needsRenewal) {
 *   console.log('Certificate expires in', status.daysUntilExpiry, 'days');
 * }
 * ```
 */
export async function checkCertificateRenewal(organizationId: string): Promise<{
  needsRenewal: boolean;
  isExpired: boolean;
  daysUntilExpiry: number | null;
  validTo: Date | null;
}> {
  try {
    const certInfo = await getCertificateInfo(organizationId);

    if (!certInfo) {
      return {
        needsRenewal: true,
        isExpired: false,
        daysUntilExpiry: null,
        validTo: null,
      };
    }

    const now = new Date();
    const isExpired = now > certInfo.validTo;
    const needsRenewal = certInfo.daysUntilExpiry <= 30; // Renew 30 days before expiry

    return {
      needsRenewal,
      isExpired,
      daysUntilExpiry: certInfo.daysUntilExpiry,
      validTo: certInfo.validTo,
    };
  } catch (error) {
    return {
      needsRenewal: true,
      isExpired: false,
      daysUntilExpiry: null,
      validTo: null,
    };
  }
}

// ============================================================================
// Certificate Info
// ============================================================================

/**
 * Gets FIEL certificate information
 *
 * @param organizationId - Organization UUID
 * @returns Certificate info or null
 *
 * @example
 * ```ts
 * const info = await getFIELInfo('org-uuid');
 * if (info) {
 *   console.log('Serial:', info.serialNumber);
 *   console.log('Valid until:', info.validTo);
 * }
 * ```
 */
export async function getFIELInfo(
  organizationId: string
): Promise<FIELInfo | null> {
  try {
    const certInfo = await getCertificateInfo(organizationId);

    if (!certInfo) {
      return null;
    }

    return {
      serialNumber: certInfo.serialNumber,
      issuer: certInfo.issuer,
      subject: certInfo.subject,
      validFrom: certInfo.validFrom,
      validTo: certInfo.validTo,
      isValid: certInfo.status === 'valid',
      daysUntilExpiry: certInfo.daysUntilExpiry,
    };
  } catch (error) {
    console.error('Failed to get FIEL info:', error);
    return null;
  }
}

/**
 * Validates FIEL is ready for SAT operations
 *
 * @param organizationId - Organization UUID
 * @returns Validation result
 *
 * @example
 * ```ts
 * const { valid, errors } = await validateFIELReady('org-uuid');
 * if (!valid) {
 *   console.error('FIEL not ready:', errors);
 * }
 * ```
 */
export async function validateFIELReady(
  organizationId: string
): Promise<{ valid: boolean; errors: string[] }> {
  const errors: string[] = [];

  try {
    // Check if FIEL exists
    const info = await getFIELInfo(organizationId);

    if (!info) {
      errors.push('FIEL certificates not uploaded');
      return { valid: false, errors };
    }

    // Check if expired
    if (!info.isValid) {
      errors.push('Certificate has expired');
    }

    // Check if expiring soon
    if (info.daysUntilExpiry <= 7) {
      errors.push(`Certificate expires in ${info.daysUntilExpiry} days`);
    }

    return { valid: errors.length === 0, errors };
  } catch (error) {
    errors.push(error instanceof Error ? error.message : 'Unknown error');
    return { valid: false, errors };
  }
}
