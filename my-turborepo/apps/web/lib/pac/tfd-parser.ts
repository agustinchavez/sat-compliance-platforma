/**
 * TFD Parser (Component 15 - Step 3)
 *
 * Parses TFD (Timbre Fiscal Digital) data from stamped CFDI XML.
 * The TFD is the digital stamp complement added by the PAC after successful stamping.
 */

import { DOMParser } from '@xmldom/xmldom';
import { PACError } from './errors';
import type { TFDData } from './types';

// ============================================================================
// Constants
// ============================================================================

/** TFD XML namespace */
const TFD_NAMESPACE = 'http://www.sat.gob.mx/TimbreFiscalDigital';

/** CFDI XML namespace */
const CFDI_NAMESPACE = 'http://www.sat.gob.mx/cfd/4';

/** Expected TFD version for CFDI 4.0 */
const EXPECTED_TFD_VERSION = '1.1';

/** UUID regex pattern (RFC 4122) */
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Required TFD attributes */
const REQUIRED_TFD_ATTRIBUTES = [
  'UUID',
  'FechaTimbrado',
  'RfcProvCertif',
  'SelloCFD',
  'NoCertificadoSAT',
  'SelloSAT',
  'Version',
] as const;

// ============================================================================
// Main Extraction Function
// ============================================================================

/**
 * Extract TFD data from a stamped CFDI XML
 *
 * @param stampedXml - The complete stamped CFDI XML string
 * @returns Parsed TFD data
 * @throws PACError with code TFD_MISSING if no TFD element found
 * @throws PACError with code TFD_PARSE_ERROR if XML parsing fails or attributes missing
 *
 * @example
 * ```ts
 * const stampedXml = await fetchStampedCFDI();
 * const tfd = extractTFD(stampedXml);
 * console.log(tfd.uuid); // "05c519de-6d20-4258-88fb-c69a5970e927"
 * ```
 */
export function extractTFD(stampedXml: string): TFDData {
  // Validate input
  if (!stampedXml || typeof stampedXml !== 'string') {
    throw new PACError(
      'TFD_PARSE_ERROR',
      'Invalid input: stampedXml must be a non-empty string',
      false
    );
  }

  // Parse the XML
  let doc: Document;
  try {
    const parser = new DOMParser({
      errorHandler: {
        warning: () => {}, // Ignore warnings
        error: (msg) => {
          throw new Error(msg);
        },
        fatalError: (msg) => {
          throw new Error(msg);
        },
      },
    });
    doc = parser.parseFromString(stampedXml, 'text/xml');
  } catch (error) {
    throw new PACError(
      'TFD_PARSE_ERROR',
      `Failed to parse XML: ${error instanceof Error ? error.message : 'Unknown error'}`,
      false,
      error
    );
  }

  // Check for parse errors in document
  const parseErrors = doc.getElementsByTagName('parsererror');
  if (parseErrors.length > 0) {
    throw new PACError(
      'TFD_PARSE_ERROR',
      `XML parse error: ${parseErrors[0]?.textContent || 'Unknown parse error'}`,
      false
    );
  }

  // Navigate to find TFD element
  // Path: cfdi:Comprobante → cfdi:Complemento → tfd:TimbreFiscalDigital
  const tfdElement = findTFDElement(doc);

  if (!tfdElement) {
    throw new PACError(
      'TFD_MISSING',
      'No tfd:TimbreFiscalDigital element found in the stamped XML',
      false
    );
  }

  // Extract and validate all required attributes
  return extractTFDAttributes(tfdElement);
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Find the TFD element in the document
 */
function findTFDElement(doc: Document): Element | null {
  // Try namespace-aware lookup first
  const tfdElements = doc.getElementsByTagNameNS(TFD_NAMESPACE, 'TimbreFiscalDigital');
  if (tfdElements.length > 0) {
    return tfdElements[0] as Element;
  }

  // Fallback: Try with tfd: prefix (some parsers don't handle NS well)
  const tfdElementsWithPrefix = doc.getElementsByTagName('tfd:TimbreFiscalDigital');
  if (tfdElementsWithPrefix.length > 0) {
    return tfdElementsWithPrefix[0] as Element;
  }

  // Last resort: Look for any TimbreFiscalDigital element
  const allTfd = doc.getElementsByTagName('TimbreFiscalDigital');
  if (allTfd.length > 0) {
    return allTfd[0] as Element;
  }

  return null;
}

/**
 * Extract and validate TFD attributes from the element
 */
function extractTFDAttributes(element: Element): TFDData {
  const attributes: Partial<TFDData> = {};

  // Extract all required attributes
  const uuid = element.getAttribute('UUID');
  const fechaTimbrado = element.getAttribute('FechaTimbrado');
  const rfcProvCertif = element.getAttribute('RfcProvCertif');
  const selloCFD = element.getAttribute('SelloCFD');
  const noCertificadoSAT = element.getAttribute('NoCertificadoSAT');
  const selloSAT = element.getAttribute('SelloSAT');
  const version = element.getAttribute('Version');

  // Validate UUID
  if (!uuid) {
    throw new PACError(
      'TFD_PARSE_ERROR',
      'TFD missing required attribute: UUID',
      false
    );
  }

  if (!UUID_PATTERN.test(uuid)) {
    throw new PACError(
      'TFD_PARSE_ERROR',
      `Invalid UUID format: ${uuid}`,
      false
    );
  }

  // Validate other required attributes
  if (!fechaTimbrado) {
    throw new PACError(
      'TFD_PARSE_ERROR',
      'TFD missing required attribute: FechaTimbrado',
      false
    );
  }

  if (!rfcProvCertif) {
    throw new PACError(
      'TFD_PARSE_ERROR',
      'TFD missing required attribute: RfcProvCertif',
      false
    );
  }

  if (!selloCFD) {
    throw new PACError(
      'TFD_PARSE_ERROR',
      'TFD missing required attribute: SelloCFD',
      false
    );
  }

  if (!noCertificadoSAT) {
    throw new PACError(
      'TFD_PARSE_ERROR',
      'TFD missing required attribute: NoCertificadoSAT',
      false
    );
  }

  if (!selloSAT) {
    throw new PACError(
      'TFD_PARSE_ERROR',
      'TFD missing required attribute: SelloSAT',
      false
    );
  }

  if (!version) {
    throw new PACError(
      'TFD_PARSE_ERROR',
      'TFD missing required attribute: Version',
      false
    );
  }

  return {
    uuid,
    fechaTimbrado,
    rfcProvCertif,
    selloCFD,
    noCertificadoSAT,
    selloSAT,
    version,
  };
}

// ============================================================================
// Accessor Functions
// ============================================================================

/**
 * Get the UUID from TFD data
 * Validates the UUID format (RFC 4122)
 *
 * @param tfdData - Parsed TFD data
 * @returns The 36-character UUID
 */
export function getUUID(tfdData: TFDData): string {
  if (!UUID_PATTERN.test(tfdData.uuid)) {
    throw new PACError(
      'TFD_PARSE_ERROR',
      `Invalid UUID format: ${tfdData.uuid}`,
      false
    );
  }
  return tfdData.uuid;
}

/**
 * Get the SAT certificate number from TFD data
 *
 * @param tfdData - Parsed TFD data
 * @returns The NoCertificadoSAT value
 */
export function getSATCertNumber(tfdData: TFDData): string {
  return tfdData.noCertificadoSAT;
}

/**
 * Get the stamp date from TFD data
 *
 * @param tfdData - Parsed TFD data
 * @returns The FechaTimbrado ISO timestamp
 */
export function getStampDate(tfdData: TFDData): string {
  return tfdData.fechaTimbrado;
}

/**
 * Get the PAC RFC from TFD data
 *
 * @param tfdData - Parsed TFD data
 * @returns The RfcProvCertif value
 */
export function getPACRfc(tfdData: TFDData): string {
  return tfdData.rfcProvCertif;
}

/**
 * Get the SAT signature from TFD data
 *
 * @param tfdData - Parsed TFD data
 * @returns The SelloSAT value
 */
export function getSATSignature(tfdData: TFDData): string {
  return tfdData.selloSAT;
}

/**
 * Get the issuer's signature echo from TFD data
 *
 * @param tfdData - Parsed TFD data
 * @returns The SelloCFD value
 */
export function getIssuerSignature(tfdData: TFDData): string {
  return tfdData.selloCFD;
}

/**
 * Validate TFD version
 *
 * @param tfdData - Parsed TFD data
 * @returns true if version is 1.1 (expected for CFDI 4.0)
 */
export function isValidTFDVersion(tfdData: TFDData): boolean {
  return tfdData.version === EXPECTED_TFD_VERSION;
}

// ============================================================================
// Validation Helpers
// ============================================================================

/**
 * Validate UUID format (RFC 4122)
 *
 * @param uuid - UUID string to validate
 * @returns true if valid UUID format
 */
export function isValidUUID(uuid: string): boolean {
  return UUID_PATTERN.test(uuid);
}

/**
 * Check if XML contains a TFD element (quick check without full parsing)
 *
 * @param xml - XML string to check
 * @returns true if XML appears to contain a TFD
 */
export function hasTFD(xml: string): boolean {
  return xml.includes('TimbreFiscalDigital') || xml.includes('tfd:');
}
