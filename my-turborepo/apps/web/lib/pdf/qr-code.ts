/**
 * QR Code Generation (Component 16)
 *
 * Generates SAT verification QR codes per Anexo 20 specification.
 * The QR code encodes a URL that allows verification of the CFDI.
 */

import * as QRCode from 'qrcode';

// ============================================================================
// Constants
// ============================================================================

/**
 * SAT verification URL base
 */
export const SAT_VERIFICATION_URL =
  'https://verificacfdi.facturaelectronica.sat.gob.mx/default.aspx';

/**
 * QR code size in pixels (minimum required by SAT)
 */
export const QR_SIZE = 150;

/**
 * QR error correction level (M = 15% restoration capacity)
 */
export const QR_ERROR_CORRECTION: 'L' | 'M' | 'Q' | 'H' = 'M';

// ============================================================================
// Types
// ============================================================================

export interface SATVerificationParams {
  /** SAT Folio Fiscal (UUID) */
  uuid: string;
  /** RFC del Emisor */
  rfcEmisor: string;
  /** RFC del Receptor */
  rfcReceptor: string;
  /** Invoice total (decimal string, e.g. "1234.50") */
  total: string;
  /** Full sello from XML (cfdi:Comprobante/@Sello) */
  sello: string;
}

// ============================================================================
// Main Functions
// ============================================================================

/**
 * Formats the total amount per SAT Anexo 20 `tt` parameter specification.
 *
 * Rules:
 * - Exactly 6 decimal places
 * - No thousands separator
 * - No leading zeros in integer part (except "0.xxxxxx")
 *
 * @param total - Decimal string (e.g. "1234.50", "0.99", "1000")
 * @returns Formatted total (e.g. "1234.500000", "0.990000", "1000.000000")
 *
 * @example
 * formatTotalForQR("1234.5")   // "1234.500000"
 * formatTotalForQR("0.99")     // "0.990000"
 * formatTotalForQR("1000")     // "1000.000000"
 * formatTotalForQR("0.1")      // "0.100000"
 */
export function formatTotalForQR(total: string): string {
  // Parse the total as a float to normalize it
  const numericTotal = parseFloat(total);

  // Handle invalid numbers
  if (isNaN(numericTotal)) {
    return '0.000000';
  }

  // Format to exactly 6 decimal places
  // This automatically handles:
  // - Adding trailing zeros ("1234.5" → "1234.500000")
  // - Removing excess decimals ("1234.1234567" → "1234.123457")
  // - No thousands separator (unlike toLocaleString)
  return numericTotal.toFixed(6);
}

/**
 * Extracts the last 8 characters of the issuer's Sello.
 *
 * The `fe` parameter in the SAT verification URL uses the last 8 characters
 * of the cfdi:Comprobante/@Sello attribute from the XML.
 *
 * @param sello - Full sello string from XML
 * @returns Last 8 characters
 * @throws Error if sello is too short
 */
export function extractLast8OfSello(sello: string): string {
  if (!sello || sello.length < 8) {
    throw new Error(`Sello must be at least 8 characters, got ${sello?.length || 0}`);
  }
  return sello.slice(-8);
}

/**
 * Builds the SAT verification URL per Anexo 20 specification.
 *
 * URL format:
 * https://verificacfdi.facturaelectronica.sat.gob.mx/default.aspx
 *   ?id={UUID}
 *   &re={RFC_Emisor}
 *   &rr={RFC_Receptor}
 *   &tt={Total_6decimals}
 *   &fe={last8_Sello}
 *
 * @param params - Verification parameters
 * @returns Complete SAT verification URL
 *
 * @example
 * const url = formatSATVerificationURL({
 *   uuid: '05c519de-6d20-4258-88fb-c69a5970e927',
 *   rfcEmisor: 'XAXX010101000',
 *   rfcReceptor: 'XEXX010101000',
 *   total: '5800.00',
 *   sello: 'KVttNUxxxxxxxxxxxxxxxxxx==',
 * });
 * // https://verificacfdi.facturaelectronica.sat.gob.mx/default.aspx
 * //   ?id=05c519de-6d20-4258-88fb-c69a5970e927
 * //   &re=XAXX010101000
 * //   &rr=XEXX010101000
 * //   &tt=5800.000000
 * //   &fe=xxxxxx==
 */
export function formatSATVerificationURL(params: SATVerificationParams): string {
  const { uuid, rfcEmisor, rfcReceptor, total, sello } = params;

  // Validate required params
  if (!uuid) throw new Error('UUID is required');
  if (!rfcEmisor) throw new Error('RFC Emisor is required');
  if (!rfcReceptor) throw new Error('RFC Receptor is required');
  if (!total) throw new Error('Total is required');
  if (!sello) throw new Error('Sello is required');

  // Format the total per Anexo 20
  const formattedTotal = formatTotalForQR(total);

  // Extract last 8 characters of sello
  const fe = extractLast8OfSello(sello);

  // Build URL with query parameters
  // Note: We use encodeURIComponent for safety, though RFCs and UUIDs
  // shouldn't contain special characters
  const queryParams = new URLSearchParams({
    id: uuid,
    re: rfcEmisor,
    rr: rfcReceptor,
    tt: formattedTotal,
    fe: fe,
  });

  return `${SAT_VERIFICATION_URL}?${queryParams.toString()}`;
}

/**
 * Generates a QR code PNG buffer from the SAT verification URL.
 *
 * The QR code:
 * - Size: 150x150 pixels (SAT requires scannable QR)
 * - Error correction: M (15% restoration capacity)
 * - Margin: 2 modules
 * - Returns: PNG buffer ready for embedding in PDFKit
 *
 * @param url - SAT verification URL
 * @returns PNG buffer
 *
 * @example
 * const qrBuffer = await generateSATQRCode(url);
 * doc.image(qrBuffer, x, y, { width: 100, height: 100 });
 */
export async function generateSATQRCode(url: string): Promise<Buffer> {
  if (!url) {
    throw new Error('URL is required for QR code generation');
  }

  const buffer = await QRCode.toBuffer(url, {
    type: 'png',
    width: QR_SIZE,
    errorCorrectionLevel: QR_ERROR_CORRECTION,
    margin: 2,
    color: {
      dark: '#000000',
      light: '#FFFFFF',
    },
  });

  return buffer;
}

/**
 * Generates a complete QR code for an invoice.
 *
 * This is the main entry point that combines URL formatting and QR generation.
 *
 * @param params - Invoice parameters for QR generation
 * @returns QR code PNG buffer
 *
 * @example
 * const qrBuffer = await generateInvoiceQRCode({
 *   uuid: invoice.stamps.uuid,
 *   rfcEmisor: invoice.issuerRfc,
 *   rfcReceptor: invoice.receiverRfc,
 *   total: invoice.total,
 *   sello: extractedSelloFromXML,
 * });
 */
export async function generateInvoiceQRCode(params: SATVerificationParams): Promise<Buffer> {
  const url = formatSATVerificationURL(params);
  return generateSATQRCode(url);
}
