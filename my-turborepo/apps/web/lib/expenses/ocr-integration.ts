/**
 * OCR Integration for Expenses (Component 20)
 *
 * Extracts expense data from receipts and CFDI XML files.
 */

import {
  processReceiptFromBytes,
  processCFDIFromString,
  formatExtractedAmount,
  formatExtractedDate,
  OCRServiceUnavailableError,
} from '@/lib/ocr';
import type { ExtractedExpenseData, CreateExpenseInput } from './types';

/**
 * Extracts expense data from a receipt image or PDF via the OCR microservice.
 *
 * Called when a user uploads a receipt image. Returns extracted fields
 * to pre-fill the expense form. Always returns a result — if OCR fails,
 * returns empty extraction with confidence=0 so the caller can fall back
 * to manual entry without blocking the upload.
 *
 * @param fileBuffer - Raw file bytes
 * @param mimeType - e.g., 'image/jpeg', 'application/pdf'
 * @param filename - Original filename for the OCR service
 */
export async function extractFromReceipt(
  fileBuffer: Buffer,
  mimeType: string,
  filename: string
): Promise<ExtractedExpenseData> {
  try {
    const result = await processReceiptFromBytes(fileBuffer, mimeType, filename);

    return {
      vendorName: result.extracted_data.vendor_name?.value,
      vendorRfc: result.extracted_data.rfc?.value,
      amount: result.extracted_data.subtotal?.value
        ? parseFloat(formatExtractedAmount(result.extracted_data.subtotal.value))
        : undefined,
      taxAmount: result.extracted_data.iva_amount?.value
        ? parseFloat(formatExtractedAmount(result.extracted_data.iva_amount.value))
        : undefined,
      total: result.extracted_data.total_amount?.value
        ? parseFloat(formatExtractedAmount(result.extracted_data.total_amount.value))
        : undefined,
      expenseDate: result.extracted_data.date?.value
        ? formatExtractedDate(result.extracted_data.date.value)
        : undefined,
      currency: result.extracted_data.currency?.value ?? 'MXN',
      confidence: result.overall_confidence,
      warnings: result.warnings ?? [],
    };
  } catch (err) {
    if (err instanceof OCRServiceUnavailableError) {
      // Non-fatal: OCR service is down, user can fill manually
      return {
        confidence: 0,
        warnings: ['Servicio OCR no disponible. Por favor llena los campos manualmente.'],
      };
    }
    // Other errors: return empty with warning
    return {
      confidence: 0,
      warnings: [`Error al procesar el comprobante: ${(err as Error).message}`],
    };
  }
}

/**
 * Extracts expense data from a CFDI XML string.
 *
 * More reliable than receipt OCR because XML is structured.
 * Extracts: UUID, emisor RFC/name, total, date, payment method.
 *
 * @param xmlContent - The CFDI XML string
 */
export async function extractFromCFDIXml(
  xmlContent: string
): Promise<ExtractedExpenseData & { cfdiUuid?: string; tipoComprobante?: string }> {
  try {
    const result = await processCFDIFromString(xmlContent);

    return {
      cfdiUuid: result.uuid?.value,
      vendorName: result.emisor_nombre?.value,
      vendorRfc: result.emisor_rfc?.value,
      total: result.total?.value
        ? parseFloat(formatExtractedAmount(result.total.value))
        : undefined,
      amount: result.subtotal?.value
        ? parseFloat(formatExtractedAmount(result.subtotal.value))
        : undefined,
      expenseDate: result.fecha?.value
        ? formatExtractedDate(result.fecha.value)
        : undefined,
      paymentMethod: result.forma_pago?.value,
      currency: result.moneda?.value ?? 'MXN',
      tipoComprobante: result.tipo_comprobante?.value,
      confidence: 0.95,  // XML extraction is highly reliable
      warnings: [],
    };
  } catch (err) {
    if (err instanceof OCRServiceUnavailableError) {
      return {
        confidence: 0,
        warnings: ['Servicio OCR no disponible para procesar XML.'],
      };
    }
    return {
      confidence: 0,
      warnings: [`Error al procesar el XML: ${(err as Error).message}`],
    };
  }
}

/**
 * Merges OCR-extracted data into a CreateExpenseInput draft.
 * Only fills fields that are missing or have low confidence.
 * User-provided values always take precedence.
 */
export function autoFillFromOCR(
  existing: Partial<CreateExpenseInput>,
  extracted: ExtractedExpenseData
): Partial<CreateExpenseInput> {
  const filled = { ...existing };
  if (!filled.vendorName && extracted.vendorName) filled.vendorName = extracted.vendorName;
  if (!filled.vendorRfc && extracted.vendorRfc) filled.vendorRfc = extracted.vendorRfc;
  if (filled.amount === undefined && extracted.amount !== undefined) filled.amount = extracted.amount;
  if (filled.taxAmount === undefined && extracted.taxAmount !== undefined) filled.taxAmount = extracted.taxAmount;
  if (filled.total === undefined && extracted.total !== undefined) filled.total = extracted.total;
  if (!filled.expenseDate && extracted.expenseDate) filled.expenseDate = extracted.expenseDate;
  if (!filled.paymentMethod && extracted.paymentMethod) filled.paymentMethod = extracted.paymentMethod;
  if (!filled.currency && extracted.currency) filled.currency = extracted.currency;
  if (!filled.cfdiUuid && extracted.cfdiUuid) filled.cfdiUuid = extracted.cfdiUuid;
  return filled;
}
