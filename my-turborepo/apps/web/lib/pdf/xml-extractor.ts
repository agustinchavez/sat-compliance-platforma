/**
 * XML Extractor (Component 16)
 *
 * Parses stamped CFDI XML to extract fields needed for PDF display
 * that are NOT already stored in the database tables.
 */

import { DOMParser } from '@xmldom/xmldom';
import { PDFError } from './types';

// ============================================================================
// Constants
// ============================================================================

/**
 * CFDI 4.0 namespace
 */
const CFDI_NS = 'http://www.sat.gob.mx/cfd/4';

/**
 * TFD (Timbre Fiscal Digital) namespace
 */
const TFD_NS = 'http://www.sat.gob.mx/TimbreFiscalDigital';

/**
 * Number of characters to show for truncated seals
 */
const SELLO_DISPLAY_LENGTH = 40;

// ============================================================================
// Types
// ============================================================================

/**
 * Fields extracted from the stamped CFDI XML for PDF display.
 * These fields are NOT stored in dedicated database columns.
 */
export interface XMLExtractedFields {
  /** Issuer's certificate number (cfdi:Comprobante/@NoCertificado) */
  noCertificadoEmisor: string;
  /** Full issuer's Sello (cfdi:Comprobante/@Sello) - used for QR `fe` param */
  selloEmisor: string;
  /** Truncated issuer seal for display (last 40 chars + "...") */
  selloEmisorDisplay: string;
  /** SAT seal for display (truncated) */
  selloSATDisplay: string;
  /** Payment conditions (cfdi:Comprobante/@CondicionesDePago) */
  condicionesDePago: string | null;
}

/**
 * Error thrown when XML extraction fails
 */
export class XMLExtractionError extends PDFError {
  constructor(message: string, originalError?: unknown) {
    super('PDF_XML_PARSE_ERROR', message, originalError);
    this.name = 'XMLExtractionError';
  }
}

// ============================================================================
// Main Extraction Function
// ============================================================================

/**
 * Extracts display fields from the stamped CFDI XML string.
 *
 * Only use this for fields NOT stored as dedicated DB columns.
 * The extracted fields are primarily used for:
 * - QR code generation (needs full Sello for `fe` parameter)
 * - Display of certificate numbers and truncated seals
 *
 * @param cfdiXml - Complete stamped CFDI XML string
 * @returns Extracted fields for PDF display
 * @throws XMLExtractionError if XML is malformed or missing required attributes
 *
 * @example
 * const fields = extractXMLFields(invoice.cfdiXml);
 * // Use fields.selloEmisor for QR code generation
 * // Use fields.selloEmisorDisplay for PDF display
 */
export function extractXMLFields(cfdiXml: string): XMLExtractedFields {
  if (!cfdiXml || typeof cfdiXml !== 'string') {
    throw new XMLExtractionError('XML content is required');
  }

  // Parse the XML
  let doc: Document;
  try {
    const parser = new DOMParser();
    doc = parser.parseFromString(cfdiXml, 'text/xml');
  } catch (error) {
    throw new XMLExtractionError(
      `Failed to parse XML: ${error instanceof Error ? error.message : 'Unknown error'}`,
      error
    );
  }

  // Check for parse errors
  const parseError = doc.getElementsByTagName('parsererror');
  if (parseError.length > 0) {
    throw new XMLExtractionError('Malformed XML document');
  }

  // Find the Comprobante element
  const comprobante = findComprobanteElement(doc);
  if (!comprobante) {
    throw new XMLExtractionError('Could not find cfdi:Comprobante element');
  }

  // Extract NoCertificado (required)
  const noCertificadoEmisor = comprobante.getAttribute('NoCertificado');
  if (!noCertificadoEmisor) {
    throw new XMLExtractionError('Missing required attribute: NoCertificado');
  }

  // Extract Sello (required for QR code)
  const selloEmisor = comprobante.getAttribute('Sello');
  if (!selloEmisor) {
    throw new XMLExtractionError('Missing required attribute: Sello');
  }

  // Extract CondicionesDePago (optional)
  const condicionesDePago = comprobante.getAttribute('CondicionesDePago') || null;

  // Extract SelloSAT from TFD complement
  const selloSAT = extractSelloSAT(doc);

  return {
    noCertificadoEmisor,
    selloEmisor,
    selloEmisorDisplay: truncateSello(selloEmisor),
    selloSATDisplay: selloSAT ? truncateSello(selloSAT) : '',
    condicionesDePago,
  };
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Finds the cfdi:Comprobante element in the document.
 * Handles both namespaced and non-namespaced elements.
 */
function findComprobanteElement(doc: Document): Element | null {
  // Try with namespace
  let elements = doc.getElementsByTagNameNS(CFDI_NS, 'Comprobante');
  if (elements.length > 0) {
    return elements[0];
  }

  // Try with cfdi: prefix
  elements = doc.getElementsByTagName('cfdi:Comprobante');
  if (elements.length > 0) {
    return elements[0];
  }

  // Try without prefix (for testing)
  elements = doc.getElementsByTagName('Comprobante');
  if (elements.length > 0) {
    return elements[0];
  }

  return null;
}

/**
 * Extracts the SelloSAT from the TFD complement.
 */
function extractSelloSAT(doc: Document): string | null {
  // Try with namespace
  let elements = doc.getElementsByTagNameNS(TFD_NS, 'TimbreFiscalDigital');
  if (elements.length > 0) {
    return elements[0].getAttribute('SelloSAT');
  }

  // Try with tfd: prefix
  elements = doc.getElementsByTagName('tfd:TimbreFiscalDigital');
  if (elements.length > 0) {
    return elements[0].getAttribute('SelloSAT');
  }

  // Try without prefix
  elements = doc.getElementsByTagName('TimbreFiscalDigital');
  if (elements.length > 0) {
    return elements[0].getAttribute('SelloSAT');
  }

  return null;
}

/**
 * Truncates a sello for display.
 *
 * Shows the last N characters with "..." prefix for readability.
 * This is the standard format used in Mexican invoice PDFs.
 *
 * @param sello - Full sello string
 * @param length - Number of characters to show (default 40)
 * @returns Truncated sello for display
 */
export function truncateSello(sello: string, length: number = SELLO_DISPLAY_LENGTH): string {
  if (!sello) return '';
  if (sello.length <= length) return sello;
  return '...' + sello.slice(-length);
}

/**
 * Extracts the UUID from the TFD complement.
 * Useful for validation.
 */
export function extractUUIDFromXML(cfdiXml: string): string | null {
  if (!cfdiXml) return null;

  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(cfdiXml, 'text/xml');

    // Try with namespace
    let elements = doc.getElementsByTagNameNS(TFD_NS, 'TimbreFiscalDigital');
    if (elements.length > 0) {
      return elements[0].getAttribute('UUID');
    }

    // Try with tfd: prefix
    elements = doc.getElementsByTagName('tfd:TimbreFiscalDigital');
    if (elements.length > 0) {
      return elements[0].getAttribute('UUID');
    }

    // Try without prefix
    elements = doc.getElementsByTagName('TimbreFiscalDigital');
    if (elements.length > 0) {
      return elements[0].getAttribute('UUID');
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Validates that an XML string contains all required elements for PDF generation.
 *
 * @param cfdiXml - CFDI XML string
 * @returns Array of validation error messages (empty if valid)
 */
export function validateXMLForPDF(cfdiXml: string): string[] {
  const errors: string[] = [];

  if (!cfdiXml) {
    errors.push('XML content is required');
    return errors;
  }

  try {
    const fields = extractXMLFields(cfdiXml);

    if (!fields.noCertificadoEmisor) {
      errors.push('Missing NoCertificado attribute');
    }

    if (!fields.selloEmisor) {
      errors.push('Missing Sello attribute');
    }

    // Check for TFD
    const uuid = extractUUIDFromXML(cfdiXml);
    if (!uuid) {
      errors.push('Missing TimbreFiscalDigital complement (invoice not stamped)');
    }
  } catch (error) {
    if (error instanceof XMLExtractionError) {
      errors.push(error.message);
    } else {
      errors.push('Failed to parse XML');
    }
  }

  return errors;
}
