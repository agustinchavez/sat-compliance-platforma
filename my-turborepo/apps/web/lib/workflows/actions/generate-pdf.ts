/**
 * Generate PDF Action (Component 17)
 *
 * Calls Component 16's generateInvoicePDFAndStore directly.
 * This runs synchronously inside the stamp job (not a separate queue).
 * PDF generation is fast (~50ms) and sequential.
 */

import { generateInvoicePDFAndStore } from '@/lib/invoices/generate-pdf';
import type { ActionResult } from '../types';
import { successResult, failureResult } from './types';

/**
 * Execute PDF generation action.
 *
 * Calls Component 16's PDF generator and stores result in R2.
 * The invoice's pdf_url is updated automatically by generateInvoicePDFAndStore.
 *
 * @param invoiceId - Invoice to generate PDF for
 * @param organizationId - Organization context
 * @param language - PDF language ('es' or 'en')
 * @returns ActionResult indicating success or failure
 */
export async function executePDFAction(
  invoiceId: string,
  organizationId: string,
  language: 'es' | 'en' = 'es'
): Promise<ActionResult> {
  try {
    const result = await generateInvoicePDFAndStore(
      invoiceId,
      organizationId,
      language
    );

    console.log(
      `[pdf-action] Generated PDF for invoice ${invoiceId}: ${result.url}`
    );

    return successResult('generate_pdf', result.r2Key);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[pdf-action] Failed to generate PDF for ${invoiceId}:`, message);

    return failureResult('generate_pdf', message);
  }
}

/**
 * Check if PDF generation is ready for an invoice.
 * Wraps Component 16's checkPDFGenerationReady.
 */
export async function canGeneratePDF(
  invoiceId: string,
  organizationId: string
): Promise<{ ready: boolean; reason?: string }> {
  try {
    // Import dynamically to avoid circular dependencies
    const { checkPDFGenerationReady } = await import('@/lib/invoices/generate-pdf');
    return await checkPDFGenerationReady(invoiceId, organizationId);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return { ready: false, reason: message };
  }
}
