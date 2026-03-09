/**
 * Invoice Stamping Bridge (Component 15 - Step 9)
 *
 * This module bridges the PAC service (Component 15) with the invoice module.
 * It handles the complete workflow from signed XML to stamped CFDI.
 *
 * It connects:
 * - Component 12: Invoice Service (data model, status workflow)
 * - Component 14: Digital Signature Service (signed XML)
 * - Component 15: PAC Integration Service (stamping)
 */

import { stampCFDI, cancelCFDI, isPACConfigured, getPACInfo } from '@/lib/pac/service';
import { extractTFD } from '@/lib/pac/tfd-parser';
import { PACError } from '@/lib/pac/errors';
import type {
  StampResult,
  CancelResult,
  TFDData,
  PACProvider,
  PACEnvironment,
  CancelMotivo,
} from '@/lib/pac/types';
import type { Invoice } from './types';

// ============================================
// RESULT TYPES
// ============================================

/**
 * Result of stamping an invoice
 */
export interface StampedInvoiceResult {
  /** Invoice UUID (from SAT) */
  uuid: string;
  /** Stamped XML with TFD complement */
  stampedXml: string;
  /** SAT timestamp when the invoice was stamped */
  fechaTimbrado: string;
  /** TFD data extracted from the stamped XML */
  tfd: TFDData;
  /** PAC provider that stamped the invoice */
  pacProvider: PACProvider;
  /** Environment used (sandbox/production) */
  environment: PACEnvironment;
}

/**
 * Result of cancelling an invoice
 */
export interface CancelledInvoiceResult {
  /** Invoice UUID that was cancelled */
  uuid: string;
  /** Whether cancellation was successful */
  cancelled: boolean;
  /** SAT status code for the UUID */
  estatusUUID: string;
  /** XML acknowledgement from SAT */
  acuse: string;
  /** Additional status message */
  message?: string;
}

/**
 * Error details for stamping failures
 */
export interface StampingError {
  code: string;
  message: string;
  retryable: boolean;
  details?: unknown;
}

// ============================================
// MAIN STAMPING FUNCTION
// ============================================

/**
 * Stamp a signed invoice with a PAC provider.
 *
 * This is the main entry point for invoice stamping. It:
 * 1. Validates the invoice is ready for stamping
 * 2. Sends signed XML to the configured PAC provider
 * 3. Extracts TFD data from the stamped response
 * 4. Returns stamped XML and metadata
 *
 * Note: This function does NOT update the invoice status or persist
 * the stamped XML. That is handled by the caller (typically a Server Action).
 *
 * @param invoice - The Invoice object (must have xml_content with signed XML)
 * @param organizationId - Organization UUID (for PAC credentials)
 * @returns StampedInvoiceResult with stamped XML and TFD data
 * @throws PACError on stamping failure
 *
 * @example
 * ```ts
 * // In a Server Action
 * const invoice = await getInvoice(invoiceId);
 *
 * // Ensure invoice has signed XML
 * if (!invoice.xml_content) {
 *   throw new Error('Invoice must be signed before stamping');
 * }
 *
 * const stampedResult = await stampInvoice(invoice, orgId);
 *
 * // Update invoice with stamped XML and status
 * await onStampingSuccess(invoiceId, stampedResult);
 * ```
 */
export async function stampInvoice(
  invoice: Invoice,
  organizationId: string,
): Promise<StampedInvoiceResult> {
  // Validate invoice has signed XML (cfdi_xml field stores the XML)
  if (!invoice.cfdi_xml) {
    throw new PACError(
      'PAC_INVALID_XML',
      'Invoice must have signed XML before stamping. Call signInvoice first.',
      false
    );
  }

  // Get PAC info for result metadata
  const pacInfo = await getPACInfo(organizationId);
  if (!pacInfo) {
    throw new PACError(
      'PAC_CREDENTIALS_NOT_FOUND',
      `No PAC credentials configured for organization ${organizationId}`,
      false
    );
  }

  // Stamp with PAC
  const stampResult: StampResult = await stampCFDI({
    signedXml: invoice.cfdi_xml,
    issuerRfc: invoice.issuer_rfc,
    orgId: organizationId,
  });

  // Extract TFD from stamped XML
  const tfd = extractTFD(stampResult.stampedXml);

  return {
    uuid: stampResult.uuid,
    stampedXml: stampResult.stampedXml,
    fechaTimbrado: stampResult.fechaTimbrado,
    tfd,
    pacProvider: pacInfo.provider,
    environment: pacInfo.environment,
  };
}

// ============================================
// CANCELLATION FUNCTION
// ============================================

/**
 * Cancel a stamped invoice with SAT.
 *
 * @param invoice - The Invoice object (must have uuid)
 * @param organizationId - Organization UUID (for PAC credentials)
 * @param motivo - SAT cancellation reason code
 * @param folioSustitucion - Replacement invoice UUID (required for motivo 01)
 * @returns CancelledInvoiceResult
 * @throws PACError on cancellation failure
 *
 * @example
 * ```ts
 * const result = await cancelInvoice(
 *   invoice,
 *   orgId,
 *   '02' // Comprobante con errores
 * );
 *
 * if (result.cancelled) {
 *   await onCancellationSuccess(invoiceId, result);
 * }
 * ```
 */
export async function cancelStampedInvoice(
  invoice: Invoice,
  organizationId: string,
  motivo: CancelMotivo,
  folioSustitucion?: string,
): Promise<CancelledInvoiceResult> {
  // Validate invoice has UUID (is stamped)
  if (!invoice.uuid) {
    throw new PACError(
      'PAC_INVALID_REQUEST',
      'Invoice must have a UUID before cancellation. Only stamped invoices can be cancelled.',
      false
    );
  }

  // Validate motivo 01 has replacement
  if (motivo === '01' && !folioSustitucion) {
    throw new PACError(
      'PAC_INVALID_REQUEST',
      'Cancellation motivo 01 requires folioSustitucion (replacement invoice UUID)',
      false
    );
  }

  // Cancel with PAC
  const cancelResult: CancelResult = await cancelCFDI({
    uuid: invoice.uuid,
    issuerRfc: invoice.issuer_rfc,
    motivo,
    folioSustitucion,
    orgId: organizationId,
  });

  return {
    uuid: invoice.uuid,
    cancelled: cancelResult.cancelled,
    estatusUUID: cancelResult.estatusUUID,
    acuse: cancelResult.acuse,
    message: cancelResult.message,
  };
}

// ============================================
// UTILITY FUNCTIONS
// ============================================

/**
 * Check if PAC is configured and ready for stamping.
 *
 * @param organizationId - Organization UUID
 * @returns true if PAC credentials exist
 */
export async function isStampingReady(organizationId: string): Promise<boolean> {
  return isPACConfigured(organizationId);
}

/**
 * Get PAC configuration status for diagnostics.
 *
 * @param organizationId - Organization UUID
 */
export async function getStampingStatus(organizationId: string): Promise<{
  configured: boolean;
  provider?: PACProvider;
  environment?: PACEnvironment;
  message: string;
}> {
  const pacInfo = await getPACInfo(organizationId);

  if (!pacInfo) {
    return {
      configured: false,
      message: 'PAC not configured. Add PAC credentials in organization settings.',
    };
  }

  return {
    configured: true,
    provider: pacInfo.provider,
    environment: pacInfo.environment,
    message: `PAC configured: ${pacInfo.provider} (${pacInfo.environment})`,
  };
}

/**
 * Check if an error is a PACError and extract details.
 */
export function isPACError(error: unknown): error is PACError {
  return error instanceof PACError;
}

/**
 * Convert a PACError to a user-friendly format.
 */
export function formatStampingError(error: unknown): StampingError {
  if (error instanceof PACError) {
    return {
      code: error.code,
      message: error.message,
      retryable: error.retryable,
      details: error.originalError,
    };
  }

  return {
    code: 'UNKNOWN_ERROR',
    message: error instanceof Error ? error.message : 'Unknown stamping error',
    retryable: false,
  };
}

// ============================================
// RE-EXPORTS FOR CONVENIENCE
// ============================================

export { PACError } from '@/lib/pac/errors';
export type { TFDData, PACProvider, PACEnvironment, CancelMotivo } from '@/lib/pac/types';
