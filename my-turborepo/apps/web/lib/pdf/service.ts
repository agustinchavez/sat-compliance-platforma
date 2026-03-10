/**
 * PDF Service (Component 16)
 *
 * Main entry points for PDF generation, upload, and storage.
 * Orchestrates the PDF generation workflow.
 */

import type {
  DatabaseInvoiceRow,
  DatabaseInvoiceStampRow,
  BrandingSettings,
  PDFOptions,
  PDFGenerationResult,
  PDFStorageResult,
} from './types';
import { PDFError } from './types';
import { PDFGenerator } from './generator';
import { buildInvoicePDFData, validateInvoicePDFData } from './templates/invoice-template';
import { uploadToStorage, downloadFromStorage } from '@/lib/organizations/storage';

// ============================================================================
// Default Configuration
// ============================================================================

/**
 * Default branding settings when organization has no custom branding.
 */
export const DEFAULT_BRANDING: BrandingSettings = {
  primaryColor: '#1E3A5F',
  secondaryColor: '#EBF2FA',
  logoUrl: null,
  logoBuffer: null,
  companyName: '',
  website: null,
  phone: null,
};

/**
 * Default PDF options.
 */
export const DEFAULT_PDF_OPTIONS: PDFOptions = {
  language: 'es',
  pageSize: 'LETTER',
  includeXMLAppendix: false,
  watermark: null,
};

// ============================================================================
// Main Service Functions
// ============================================================================

/**
 * Generates a PDF buffer from invoice data.
 * Does NOT upload to storage — returns buffer only.
 *
 * Steps:
 * 1. Validate invoice is stamped
 * 2. Build InvoicePDFData from DB row
 * 3. Pre-fetch logo if configured
 * 4. Instantiate PDFGenerator and call generate()
 * 5. Return PDFGenerationResult
 *
 * @param invoice - Database invoice row with items
 * @param stamp - Invoice stamp data from invoice_stamps table
 * @param branding - Organization branding settings
 * @param options - PDF generation options
 * @returns PDFGenerationResult with buffer and metadata
 * @throws PDFError on validation or generation failure
 *
 * @example
 * ```ts
 * const result = await generateInvoicePDF(invoice, stamp, branding);
 * // Save buffer to file or send as response
 * fs.writeFileSync('invoice.pdf', result.buffer);
 * ```
 */
export async function generateInvoicePDF(
  invoice: DatabaseInvoiceRow,
  stamp: DatabaseInvoiceStampRow,
  branding: BrandingSettings = DEFAULT_BRANDING,
  options: Partial<PDFOptions> = {}
): Promise<PDFGenerationResult> {
  // Merge options with defaults
  const pdfOptions: PDFOptions = {
    ...DEFAULT_PDF_OPTIONS,
    ...options,
  };

  // Build PDF data from invoice
  let pdfData;
  try {
    pdfData = buildInvoicePDFData(invoice, stamp);
  } catch (error) {
    throw new PDFError(
      'PDF_INVALID_INVOICE',
      error instanceof Error ? error.message : 'Failed to build PDF data',
      error
    );
  }

  // Validate PDF data
  const validationErrors = validateInvoicePDFData(pdfData);
  if (validationErrors.length > 0) {
    throw new PDFError(
      'PDF_INVALID_INVOICE',
      `Invoice validation failed: ${validationErrors.join(', ')}`
    );
  }

  // Pre-fetch logo if URL is configured
  let brandingWithLogo = { ...branding };
  if (branding.logoUrl && !branding.logoBuffer) {
    try {
      brandingWithLogo.logoBuffer = await fetchLogo(branding.logoUrl);
    } catch (error) {
      // Log error but don't fail - proceed without logo
      console.warn('Failed to fetch logo:', error);
      brandingWithLogo.logoBuffer = null;
    }
  }

  // Set company name from invoice if not provided
  if (!brandingWithLogo.companyName) {
    brandingWithLogo.companyName = pdfData.issuerName;
  }

  // Generate PDF
  try {
    const generator = new PDFGenerator(pdfOptions, brandingWithLogo);
    return await generator.generate(pdfData);
  } catch (error) {
    throw new PDFError(
      'PDF_GENERATION_FAILED',
      error instanceof Error ? error.message : 'PDF generation failed',
      error
    );
  }
}

/**
 * Uploads a PDF buffer to Cloudflare R2.
 *
 * Key format: pdfs/{organizationId}/{invoiceId}/{uuid}.pdf
 *
 * @param buffer - PDF buffer to upload
 * @param organizationId - Organization UUID
 * @param invoiceId - Invoice UUID
 * @param uuid - SAT UUID from TFD
 * @returns Object with URL and R2 key
 * @throws PDFError on upload failure
 *
 * @example
 * ```ts
 * const { url, r2Key } = await uploadPDF(buffer, orgId, invoiceId, uuid);
 * // Update invoice with PDF URL
 * await updateInvoice(invoiceId, { pdf_url: url });
 * ```
 */
export async function uploadPDF(
  buffer: Buffer,
  organizationId: string,
  invoiceId: string,
  uuid: string
): Promise<{ url: string; r2Key: string }> {
  // Build R2 key
  const r2Key = `pdfs/${organizationId}/${invoiceId}/${uuid}.pdf`;

  try {
    const result = await uploadToStorage(buffer, r2Key, {
      contentType: 'application/pdf',
      cacheControl: 'max-age=31536000', // 1 year (PDFs are immutable)
      metadata: {
        invoiceId,
        uuid,
        generatedAt: new Date().toISOString(),
      },
    });

    return {
      url: result.url,
      r2Key,
    };
  } catch (error) {
    throw new PDFError(
      'PDF_UPLOAD_FAILED',
      error instanceof Error ? error.message : 'Failed to upload PDF to storage',
      error
    );
  }
}

/**
 * Convenience function: generate + upload PDF.
 * Returns the full PDFStorageResult.
 *
 * @param invoice - Database invoice row with items
 * @param stamp - Invoice stamp data
 * @param organizationId - Organization UUID
 * @param branding - Organization branding settings
 * @param options - PDF generation options
 * @returns PDFStorageResult with buffer, URL, and metadata
 *
 * @example
 * ```ts
 * const result = await generateAndStorePDF(invoice, stamp, orgId, branding);
 * console.log('PDF URL:', result.url);
 * ```
 */
export async function generateAndStorePDF(
  invoice: DatabaseInvoiceRow,
  stamp: DatabaseInvoiceStampRow,
  organizationId: string,
  branding: BrandingSettings = DEFAULT_BRANDING,
  options: Partial<PDFOptions> = {}
): Promise<PDFStorageResult> {
  // Generate PDF
  const generateResult = await generateInvoicePDF(invoice, stamp, branding, options);

  // Upload to R2
  const { url, r2Key } = await uploadPDF(
    generateResult.buffer,
    organizationId,
    invoice.id,
    generateResult.uuid
  );

  return {
    ...generateResult,
    url,
    r2Key,
  };
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Fetches a logo image from R2 storage.
 *
 * @param logoUrl - R2 URL or key for the logo
 * @returns Logo buffer
 */
async function fetchLogo(logoUrl: string): Promise<Buffer | null> {
  try {
    // Extract key from URL if needed
    let key = logoUrl;
    if (logoUrl.includes('://')) {
      // Full URL - extract the path
      const url = new URL(logoUrl);
      key = url.pathname.replace(/^\//, '');
    }

    const buffer = await downloadFromStorage(key);
    return buffer;
  } catch (error) {
    console.warn('Failed to fetch logo from storage:', error);
    return null;
  }
}

/**
 * Checks if PDF generation is available for an invoice.
 *
 * @param invoice - Database invoice row
 * @returns true if PDF can be generated
 */
export function canGenerateInvoicePDF(invoice: DatabaseInvoiceRow): boolean {
  return (
    invoice.status === 'stamped' &&
    !!invoice.cfdi_xml &&
    invoice.items.length > 0
  );
}

/**
 * Gets PDF generation status for diagnostics.
 *
 * @param invoice - Database invoice row
 * @returns Status object with details
 */
export function getPDFGenerationStatus(invoice: DatabaseInvoiceRow): {
  canGenerate: boolean;
  reason?: string;
} {
  if (invoice.status !== 'stamped') {
    return {
      canGenerate: false,
      reason: `Invoice status is '${invoice.status}'. Only stamped invoices can have PDFs generated.`,
    };
  }

  if (!invoice.cfdi_xml) {
    return {
      canGenerate: false,
      reason: 'Invoice is missing CFDI XML.',
    };
  }

  if (!invoice.items || invoice.items.length === 0) {
    return {
      canGenerate: false,
      reason: 'Invoice has no line items.',
    };
  }

  return { canGenerate: true };
}
