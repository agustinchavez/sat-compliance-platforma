/**
 * Client for the Python OCR microservice.
 * Used to process receipt images and CFDI XML files.
 * Extracts structured data including amounts, RFC, dates, etc.
 */

// Types for extracted field
export interface ExtractedField<T = string> {
  value: T;
  confidence: number;
  method: string;
}

// Types for receipt data
export interface ReceiptData {
  total_amount?: ExtractedField<string>;
  subtotal?: ExtractedField<string>;
  iva_amount?: ExtractedField<string>;
  currency?: ExtractedField<string>;
  vendor_name?: ExtractedField<string>;
  rfc?: ExtractedField<string>;
  receipt_number?: ExtractedField<string>;
  date?: ExtractedField<string>;
  address?: ExtractedField<string>;
}

// Types for OCR result
export interface OCRResult {
  file_hash: string;
  file_type: "jpeg" | "png" | "webp" | "pdf" | "xml";
  raw_text: string;
  extracted_data: ReceiptData;
  overall_confidence: number;
  processing_time_ms: number;
  cached: boolean;
  warnings?: string[];
}

// Types for CFDI XML data
export interface CFDIConcepto {
  clave_prod_serv?: string;
  clave_unidad?: string;
  descripcion?: string;
  cantidad?: string;
  valor_unitario?: string;
  importe?: string;
  descuento?: string;
}

export interface CFDIImpuesto {
  impuesto?: string;
  tipo_factor?: string;
  tasa_o_cuota?: string;
  importe?: string;
  base?: string;
}

export interface CFDIXMLData {
  uuid?: ExtractedField<string>;
  version?: ExtractedField<string>;
  serie?: ExtractedField<string>;
  folio?: ExtractedField<string>;
  fecha?: ExtractedField<string>;
  forma_pago?: ExtractedField<string>;
  metodo_pago?: ExtractedField<string>;
  tipo_comprobante?: ExtractedField<string>;
  lugar_expedicion?: ExtractedField<string>;
  emisor_rfc?: ExtractedField<string>;
  emisor_nombre?: ExtractedField<string>;
  emisor_regimen?: ExtractedField<string>;
  receptor_rfc?: ExtractedField<string>;
  receptor_nombre?: ExtractedField<string>;
  receptor_uso_cfdi?: ExtractedField<string>;
  subtotal?: ExtractedField<string>;
  descuento?: ExtractedField<string>;
  total?: ExtractedField<string>;
  moneda?: ExtractedField<string>;
  tipo_cambio?: ExtractedField<string>;
  conceptos?: ExtractedField<CFDIConcepto[]>;
  impuestos_trasladados?: ExtractedField<CFDIImpuesto[]>;
  impuestos_retenidos?: ExtractedField<CFDIImpuesto[]>;
}

// Types for supported types response
export interface SupportedTypesResponse {
  images: string[];
  documents: string[];
  cfdi: string[];
  max_file_size_mb: number;
  max_pdf_pages: number;
}

// Custom error for service unavailability
export class OCRServiceUnavailableError extends Error {
  constructor() {
    super("OCR service is unavailable");
    this.name = "OCRServiceUnavailableError";
  }
}

// Custom error for file processing failures
export class OCRProcessingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OCRProcessingError";
  }
}

// Get AI service URL from environment
function getAIServiceURL(): string {
  const url = process.env.AI_SERVICE_URL;
  if (!url) {
    throw new OCRServiceUnavailableError();
  }
  return url;
}

/**
 * Process a receipt file (image, PDF, or XML) and extract structured data.
 * Call POST /api/v1/ocr/process on the AI microservice.
 */
export async function processReceipt(
  file: File,
  options: {
    useCache?: boolean;
  } = {}
): Promise<OCRResult> {
  const url = getAIServiceURL();

  const formData = new FormData();
  formData.append("file", file);

  const params = new URLSearchParams();
  if (options.useCache !== undefined) {
    params.append("use_cache", String(options.useCache));
  }

  try {
    const response = await fetch(
      `${url}/api/v1/ocr/process${params.toString() ? `?${params}` : ""}`,
      {
        method: "POST",
        body: formData,
        // Longer timeout for OCR processing (60 seconds)
        signal: AbortSignal.timeout(60000),
      }
    );

    if (!response.ok) {
      if (response.status >= 500) {
        throw new OCRServiceUnavailableError();
      }
      const error = await response.json().catch(() => ({}));
      throw new OCRProcessingError(
        error.detail || `OCR service error: ${response.status}`
      );
    }

    return await response.json();
  } catch (error) {
    if (
      error instanceof OCRServiceUnavailableError ||
      error instanceof OCRProcessingError
    ) {
      throw error;
    }
    if (error instanceof TypeError || (error as Error).name === "AbortError") {
      throw new OCRServiceUnavailableError();
    }
    throw error;
  }
}

/**
 * Process a receipt from a Blob or ArrayBuffer.
 * Useful for processing files that aren't directly from user input.
 */
export async function processReceiptFromBytes(
  data: Blob | ArrayBuffer,
  filename: string,
  mimeType: string,
  options: {
    useCache?: boolean;
  } = {}
): Promise<OCRResult> {
  const blob = data instanceof Blob ? data : new Blob([data], { type: mimeType });
  const file = new File([blob], filename, { type: mimeType });
  return processReceipt(file, options);
}

/**
 * Process a CFDI XML file and get full CFDI-specific data.
 * Call POST /api/v1/ocr/process-cfdi on the AI microservice.
 */
export async function processCFDI(file: File): Promise<CFDIXMLData> {
  const url = getAIServiceURL();

  const formData = new FormData();
  formData.append("file", file);

  try {
    const response = await fetch(`${url}/api/v1/ocr/process-cfdi`, {
      method: "POST",
      body: formData,
      signal: AbortSignal.timeout(30000),
    });

    if (!response.ok) {
      if (response.status >= 500) {
        throw new OCRServiceUnavailableError();
      }
      const error = await response.json().catch(() => ({}));
      throw new OCRProcessingError(
        error.detail || `CFDI processing error: ${response.status}`
      );
    }

    return await response.json();
  } catch (error) {
    if (
      error instanceof OCRServiceUnavailableError ||
      error instanceof OCRProcessingError
    ) {
      throw error;
    }
    if (error instanceof TypeError || (error as Error).name === "AbortError") {
      throw new OCRServiceUnavailableError();
    }
    throw error;
  }
}

/**
 * Process CFDI from XML string content.
 * Useful when you already have the XML as a string.
 */
export async function processCFDIFromString(
  xmlContent: string,
  filename: string = "cfdi.xml"
): Promise<CFDIXMLData> {
  const blob = new Blob([xmlContent], { type: "text/xml" });
  const file = new File([blob], filename, { type: "text/xml" });
  return processCFDI(file);
}

/**
 * Get list of supported file types for OCR processing.
 * Call GET /api/v1/ocr/supported-types on the AI microservice.
 */
export async function getSupportedTypes(): Promise<SupportedTypesResponse> {
  const url = getAIServiceURL();

  try {
    const response = await fetch(`${url}/api/v1/ocr/supported-types`, {
      method: "GET",
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      throw new OCRServiceUnavailableError();
    }

    return await response.json();
  } catch (error) {
    if (error instanceof OCRServiceUnavailableError) {
      throw error;
    }
    throw new OCRServiceUnavailableError();
  }
}

/**
 * Validate a file before sending to OCR service.
 * Returns null if valid, or an error message if invalid.
 */
export function validateFile(
  file: File,
  supportedTypes: SupportedTypesResponse
): string | null {
  // Check file size
  const maxSizeBytes = supportedTypes.max_file_size_mb * 1024 * 1024;
  if (file.size > maxSizeBytes) {
    return `File is too large. Maximum size is ${supportedTypes.max_file_size_mb}MB`;
  }

  // Check file type
  const allSupportedTypes = [
    ...supportedTypes.images,
    ...supportedTypes.documents,
    ...supportedTypes.cfdi,
  ];

  if (!allSupportedTypes.includes(file.type)) {
    // Try to validate by extension
    const ext = file.name.toLowerCase().split(".").pop();
    const validExtensions = ["jpg", "jpeg", "png", "webp", "pdf", "xml"];
    if (!ext || !validExtensions.includes(ext)) {
      return `Unsupported file type: ${file.type || "unknown"}`;
    }
  }

  return null;
}

/**
 * Helper to format extracted currency amount for display.
 */
export function formatExtractedAmount(
  field: ExtractedField<string> | undefined,
  currency: string = "MXN"
): string | null {
  if (!field) return null;

  const amount = parseFloat(field.value);
  if (isNaN(amount)) return field.value;

  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: currency,
  }).format(amount);
}

/**
 * Helper to format extracted date for display.
 */
export function formatExtractedDate(
  field: ExtractedField<string> | undefined
): string | null {
  if (!field) return null;

  try {
    const date = new Date(field.value);
    return new Intl.DateTimeFormat("es-MX", {
      year: "numeric",
      month: "long",
      day: "numeric",
    }).format(date);
  } catch {
    return field.value;
  }
}

/**
 * Get confidence level as a human-readable string.
 */
export function getConfidenceLevel(confidence: number): {
  level: "high" | "medium" | "low";
  label: string;
} {
  if (confidence >= 0.8) {
    return { level: "high", label: "Alta confianza" };
  } else if (confidence >= 0.5) {
    return { level: "medium", label: "Confianza media" };
  } else {
    return { level: "low", label: "Baja confianza" };
  }
}

/**
 * Check if the OCR result has sufficient data for reconciliation.
 */
export function hasMinimumRequiredData(result: OCRResult): boolean {
  const data = result.extracted_data;

  // At minimum, we need total amount
  if (!data.total_amount) {
    return false;
  }

  // And either RFC or vendor name
  if (!data.rfc && !data.vendor_name) {
    return false;
  }

  return true;
}

/**
 * Extract key-value pairs from OCR result for display.
 */
export function extractDisplayFields(
  data: ReceiptData
): Array<{ label: string; value: string; confidence: number }> {
  const fields: Array<{ label: string; value: string; confidence: number }> = [];

  if (data.vendor_name) {
    fields.push({
      label: "Proveedor",
      value: data.vendor_name.value,
      confidence: data.vendor_name.confidence,
    });
  }

  if (data.rfc) {
    fields.push({
      label: "RFC",
      value: data.rfc.value,
      confidence: data.rfc.confidence,
    });
  }

  if (data.receipt_number) {
    fields.push({
      label: "Número de recibo",
      value: data.receipt_number.value,
      confidence: data.receipt_number.confidence,
    });
  }

  if (data.date) {
    fields.push({
      label: "Fecha",
      value: formatExtractedDate(data.date) || data.date.value,
      confidence: data.date.confidence,
    });
  }

  if (data.subtotal) {
    const currency = data.currency?.value || "MXN";
    fields.push({
      label: "Subtotal",
      value: formatExtractedAmount(data.subtotal, currency) || data.subtotal.value,
      confidence: data.subtotal.confidence,
    });
  }

  if (data.iva_amount) {
    const currency = data.currency?.value || "MXN";
    fields.push({
      label: "IVA",
      value:
        formatExtractedAmount(data.iva_amount, currency) || data.iva_amount.value,
      confidence: data.iva_amount.confidence,
    });
  }

  if (data.total_amount) {
    const currency = data.currency?.value || "MXN";
    fields.push({
      label: "Total",
      value:
        formatExtractedAmount(data.total_amount, currency) ||
        data.total_amount.value,
      confidence: data.total_amount.confidence,
    });
  }

  if (data.address) {
    fields.push({
      label: "Dirección",
      value: data.address.value,
      confidence: data.address.confidence,
    });
  }

  return fields;
}
