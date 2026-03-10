/**
 * Invoice-PDF Bridge (Component 16)
 *
 * Thin bridge connecting the invoice workflow to the PDF service.
 * Fetches organization branding before calling the PDF service.
 */

import { createClient } from '@/lib/supabase/server';
import {
  generateAndStorePDF,
  DEFAULT_BRANDING,
  type BrandingSettings,
  type PDFStorageResult,
  type DatabaseInvoiceRow,
  type DatabaseInvoiceStampRow,
} from '@/lib/pdf';
import { downloadFromStorage } from '@/lib/organizations/storage';

// ============================================================================
// Types
// ============================================================================

export interface GeneratePDFResult {
  /** Public URL to the PDF */
  url: string;
  /** R2 storage key */
  r2Key: string;
  /** Invoice UUID */
  uuid: string;
  /** Number of pages in the PDF */
  pageCount: number;
  /** ISO timestamp when generated */
  generatedAt: string;
}

// ============================================================================
// Main Function
// ============================================================================

/**
 * Fetches organization branding settings from the DB,
 * pre-fetches the logo buffer from R2 if configured,
 * then generates and uploads the PDF.
 *
 * This is the main entry point for generating invoice PDFs
 * from the invoice workflow.
 *
 * @param invoiceId - The stamped invoice ID
 * @param organizationId - The organization ID
 * @param language - 'es' (default) or 'en'
 * @returns PDF URL and metadata
 *
 * @example
 * ```ts
 * // After stamping is successful
 * const result = await generateInvoicePDFAndStore(invoiceId, orgId);
 *
 * // Update invoice with PDF URL
 * await updateInvoice(invoiceId, { pdf_url: result.url });
 * ```
 */
export async function generateInvoicePDFAndStore(
  invoiceId: string,
  organizationId: string,
  language: 'es' | 'en' = 'es'
): Promise<GeneratePDFResult> {
  const supabase = await createClient();

  // Fetch invoice with items
  const { data: invoice, error: invoiceError } = await supabase
    .from('invoices')
    .select(`
      *,
      items:invoice_items(*)
    `)
    .eq('id', invoiceId)
    .eq('organization_id', organizationId)
    .single();

  if (invoiceError || !invoice) {
    throw new Error(`Failed to fetch invoice: ${invoiceError?.message || 'Not found'}`);
  }

  // Fetch stamp data
  const { data: stamp, error: stampError } = await supabase
    .from('invoice_stamps')
    .select('*')
    .eq('invoice_id', invoiceId)
    .single();

  if (stampError || !stamp) {
    throw new Error(`Failed to fetch stamp data: ${stampError?.message || 'Not found'}`);
  }

  // Fetch organization branding
  const branding = await fetchOrganizationBranding(supabase, organizationId, invoice.issuer_name);

  // Generate and store PDF
  const result = await generateAndStorePDF(
    invoice as unknown as DatabaseInvoiceRow,
    stamp as unknown as DatabaseInvoiceStampRow,
    organizationId,
    branding,
    { language }
  );

  // Update invoice with PDF URL
  const { error: updateError } = await supabase
    .from('invoices')
    .update({ pdf_url: result.url })
    .eq('id', invoiceId);

  if (updateError) {
    console.warn('Failed to update invoice with PDF URL:', updateError);
    // Don't throw - PDF was generated successfully
  }

  return {
    url: result.url,
    r2Key: result.r2Key,
    uuid: result.uuid,
    pageCount: result.pageCount,
    generatedAt: result.generatedAt,
  };
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Fetches organization branding settings from the database.
 * Falls back to default branding if not configured.
 */
async function fetchOrganizationBranding(
  supabase: Awaited<ReturnType<typeof createClient>>,
  organizationId: string,
  defaultCompanyName: string
): Promise<BrandingSettings> {
  // Try to fetch branding from organization_branding table
  const { data: branding } = await supabase
    .from('organization_branding')
    .select('*')
    .eq('organization_id', organizationId)
    .single();

  if (!branding) {
    // Fall back to default branding with company name
    return {
      ...DEFAULT_BRANDING,
      companyName: defaultCompanyName,
    };
  }

  // Pre-fetch logo if URL is configured
  let logoBuffer: Buffer | null = null;
  if (branding.logo_url) {
    try {
      logoBuffer = await downloadFromStorage(branding.logo_url);
    } catch (error) {
      console.warn('Failed to fetch logo:', error);
    }
  }

  return {
    primaryColor: branding.primary_color || DEFAULT_BRANDING.primaryColor,
    secondaryColor: branding.secondary_color || DEFAULT_BRANDING.secondaryColor,
    logoUrl: branding.logo_url || null,
    logoBuffer,
    companyName: branding.company_name || defaultCompanyName,
    website: branding.website || null,
    phone: branding.phone || null,
  };
}

/**
 * Checks if an invoice can have a PDF generated.
 *
 * @param invoiceId - Invoice ID
 * @param organizationId - Organization ID
 * @returns Status object with canGenerate flag and reason
 */
export async function checkPDFGenerationReady(
  invoiceId: string,
  organizationId: string
): Promise<{ ready: boolean; reason?: string }> {
  const supabase = await createClient();

  // Check invoice status
  const { data: invoice } = await supabase
    .from('invoices')
    .select('status, cfdi_xml')
    .eq('id', invoiceId)
    .eq('organization_id', organizationId)
    .single();

  if (!invoice) {
    return { ready: false, reason: 'Invoice not found' };
  }

  if (invoice.status !== 'stamped') {
    return { ready: false, reason: `Invoice status is '${invoice.status}'. Only stamped invoices can have PDFs.` };
  }

  if (!invoice.cfdi_xml) {
    return { ready: false, reason: 'Invoice is missing CFDI XML' };
  }

  // Check stamp exists
  const { data: stamp } = await supabase
    .from('invoice_stamps')
    .select('uuid')
    .eq('invoice_id', invoiceId)
    .single();

  if (!stamp) {
    return { ready: false, reason: 'Invoice stamp data not found' };
  }

  return { ready: true };
}

/**
 * Regenerates PDF for an invoice.
 * Useful when branding changes or PDF needs to be recreated.
 */
export async function regenerateInvoicePDF(
  invoiceId: string,
  organizationId: string,
  language: 'es' | 'en' = 'es'
): Promise<GeneratePDFResult> {
  // Just call the main function - it will overwrite the existing PDF
  return generateInvoicePDFAndStore(invoiceId, organizationId, language);
}
