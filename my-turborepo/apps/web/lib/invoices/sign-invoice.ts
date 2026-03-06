/**
 * Invoice Signing Bridge (Component 14 - Step 5)
 *
 * This module bridges the @repo/cfdi package (Component 13 XML generation +
 * Component 14 digital signature) with the Next.js application layer.
 *
 * It connects:
 * - Component 04: Organization Service (CSD retrieval)
 * - Component 12: Invoice Service (data model, status workflow)
 * - Component 13: CFDI XML Generator
 * - Component 14: Digital Signature Service
 */

import {
  generateCFDI,
  generateCadenaOriginal,
  signCFDI,
  injectSignatureIntoXML,
  verifyCFDISignature,
  isXSLTAvailable,
  type SignCFDIResult,
  type CertificateInfo,
} from '@repo/cfdi';
import { getOrganizationCSD } from '@/lib/organizations';
import { generateCFDIFromInvoice, type CFDIBridgeResult } from './cfdi-bridge';
import type { Invoice } from './types';

// ============================================
// RESULT TYPES
// ============================================

/**
 * Result of signing an invoice
 */
export interface SignedInvoiceResult {
  /** Invoice UUID */
  invoiceId: string;
  /** Signed XML with Sello, NoCertificado, Certificado populated */
  signedXml: string;
  /** The Sello attribute value (base64-encoded signature) */
  sello: string;
  /** The NoCertificado attribute value (20-char SAT serial) */
  noCertificado: string;
  /** Certificate information for audit logging */
  certInfo: {
    rfc: string;
    noCertificado: string;
    validTo: Date;
  };
  /** Cadena original used for signing (for verification) */
  cadenaOriginal?: string;
  /** Validation warnings (non-fatal issues) */
  warnings: string[];
}

/**
 * Error details for signing failures
 */
export interface SigningError {
  code: string;
  message: string;
  details?: unknown;
}

// ============================================
// MAIN SIGNING FUNCTION
// ============================================

/**
 * Sign a draft invoice with the organization's CSD.
 *
 * This is the main entry point for invoice signing. It:
 * 1. Generates CFDI XML from the invoice (Component 13)
 * 2. Generates the cadena original via XSLT
 * 3. Retrieves CSD from Organization Service (Component 04)
 * 4. Signs with CSD (Component 14)
 * 5. Injects signature into XML
 * 6. Returns signed XML ready for PAC submission
 *
 * Note: This function does NOT update the invoice status or persist
 * the signed XML. That is handled by the caller (typically a Server Action).
 *
 * @param invoice - The Invoice object with items loaded
 * @param organizationId - Organization UUID (for CSD retrieval)
 * @param csdPassword - Password for the CSD private key
 * @returns SignedInvoiceResult with signed XML and metadata
 * @throws Error if signing fails
 *
 * @example
 * ```ts
 * // In a Server Action
 * const invoice = await getInvoiceWithItems(invoiceId);
 * const signedResult = await signInvoice(invoice, orgId, password);
 *
 * // Update invoice with signed XML
 * await updateInvoice(invoiceId, {
 *   xml_content: signedResult.signedXml,
 *   status: 'pending_stamp',
 * });
 * ```
 */
export async function signInvoice(
  invoice: Invoice,
  organizationId: string,
  csdPassword: string,
): Promise<SignedInvoiceResult> {
  const warnings: string[] = [];

  // Validate invoice has items
  if (!invoice.items || invoice.items.length === 0) {
    throw new Error('Invoice must have at least one item for signing');
  }

  // Step 1: Generate CFDI XML using the bridge (Component 13)
  const cfdiResult = await generateCFDIFromInvoice(invoice);

  if (!cfdiResult.validationResult.valid) {
    throw new Error(
      `CFDI XML generation failed: ${cfdiResult.validationResult.errors.join(', ')}`
    );
  }

  // Add any warnings from CFDI generation
  if (cfdiResult.validationResult.warnings.length > 0) {
    warnings.push(...cfdiResult.validationResult.warnings);
  }

  const unsignedXml = cfdiResult.xml;

  // Step 2: Generate cadena original
  let cadenaOriginal: string;

  if (!isXSLTAvailable()) {
    throw new Error(
      'XSLT transformation not available. Cannot generate cadena original for signing. ' +
      'Ensure cadenaoriginal_4_0.xslt is present and xsltproc is installed.'
    );
  }

  try {
    const cadenaResult = await generateCadenaOriginal(unsignedXml);
    cadenaOriginal = cadenaResult.cadena;
  } catch (error) {
    throw new Error(
      `Cadena original generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }

  // Step 3: Retrieve CSD from Organization Service (Component 04)
  let cerBuffer: Buffer;
  let keyBuffer: Buffer;
  let password: string;

  try {
    const csdResult = await getOrganizationCSD(organizationId, csdPassword);
    cerBuffer = csdResult.cerBuffer;
    keyBuffer = csdResult.keyBuffer;
    password = csdResult.password;
  } catch (error) {
    throw new Error(
      `CSD retrieval failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }

  // Step 4: Sign with CSD (Component 14)
  let signResult: SignCFDIResult;

  try {
    signResult = await signCFDI({
      cadenaOriginal,
      cerBuffer,
      keyBuffer,
      password,
      issuerRfc: invoice.issuer_rfc,
      // Don't skip expiration check in production
      skipExpirationCheck: false,
    });
  } catch (error) {
    // Re-throw with more context
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    throw new Error(`Digital signature failed: ${errorMessage}`);
  }

  // Step 5: Inject signature into XML
  const signedXml = injectSignatureIntoXML(unsignedXml, signResult);

  // Step 6: Verify signature (optional but recommended)
  const isValid = verifyCFDISignature(cadenaOriginal, signResult.sello, cerBuffer);
  if (!isValid) {
    warnings.push('Signature self-verification failed - this may indicate an issue');
  }

  return {
    invoiceId: invoice.id,
    signedXml,
    sello: signResult.sello,
    noCertificado: signResult.noCertificado,
    certInfo: {
      rfc: signResult.certInfo.rfc,
      noCertificado: signResult.certInfo.noCertificado,
      validTo: signResult.certInfo.validTo,
    },
    cadenaOriginal,
    warnings,
  };
}

// ============================================
// UTILITY FUNCTIONS
// ============================================

/**
 * Verify a previously signed invoice's signature.
 *
 * This is useful for:
 * - Audit logging
 * - Re-verification after storage
 * - Debugging signature issues
 *
 * @param cadenaOriginal - The cadena original that was signed
 * @param sello - The Sello attribute from the signed XML
 * @param cerBuffer - The certificate DER bytes
 * @returns true if signature is valid
 */
export function verifyInvoiceSignature(
  cadenaOriginal: string,
  sello: string,
  cerBuffer: Buffer,
): boolean {
  return verifyCFDISignature(cadenaOriginal, sello, cerBuffer);
}

/**
 * Check if the signing infrastructure is ready.
 *
 * Returns false if XSLT transformation is not available.
 */
export function isSigningReady(): boolean {
  return isXSLTAvailable();
}

/**
 * Get signing status information for diagnostics.
 */
export function getSigningStatus(): {
  xsltAvailable: boolean;
  message: string;
} {
  const xsltAvailable = isXSLTAvailable();

  return {
    xsltAvailable,
    message: xsltAvailable
      ? 'Signing infrastructure is ready'
      : 'XSLT not available - run "npm run download-xslt" in packages/cfdi',
  };
}
