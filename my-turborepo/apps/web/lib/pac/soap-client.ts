/**
 * SOAP Client (Component 15 - Step 4)
 *
 * A thin, dependency-free SOAP client for Finkok PAC integration.
 * Builds raw SOAP envelopes manually without loading WSDLs at runtime.
 * Uses native fetch() for HTTP calls.
 */

import { DOMParser } from '@xmldom/xmldom';
import { PACError, wrapNetworkError } from './errors';

// ============================================================================
// Types
// ============================================================================

/**
 * Options for making a SOAP call
 */
export interface SOAPCallOptions {
  /** Full endpoint URL (not WSDL) */
  endpoint: string;
  /** SOAP action header value */
  soapAction: string;
  /** Raw XML for the SOAP body (without envelope wrapper) */
  body: string;
  /** Request timeout in milliseconds (default: 30000) */
  timeoutMs?: number;
}

/**
 * Response from a SOAP call
 */
export interface SOAPResponse {
  /** HTTP status code */
  statusCode: number;
  /** Raw XML response body */
  rawXml: string;
}

// ============================================================================
// Constants
// ============================================================================

/** Default timeout for SOAP calls (30 seconds) */
const DEFAULT_TIMEOUT_MS = 30000;

/** SOAP envelope namespaces */
const SOAP_ENVELOPE_NS = 'http://schemas.xmlsoap.org/soap/envelope/';

// ============================================================================
// SOAP Envelope Building
// ============================================================================

/**
 * Wrap body content in a SOAP envelope
 *
 * @param body - The XML body content
 * @returns Complete SOAP envelope XML
 */
export function buildSOAPEnvelope(body: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Header/>
  <soap:Body>
    ${body}
  </soap:Body>
</soap:Envelope>`;
}

/**
 * Build a Finkok stamp SOAP envelope
 *
 * @param xml - The signed CFDI XML (will be CDATA-wrapped)
 * @param username - Finkok username
 * @param password - Finkok password
 * @returns Complete SOAP envelope for stamp request
 */
export function buildStampEnvelope(xml: string, username: string, password: string): string {
  // Escape XML for CDATA (handle nested CDATA if any)
  const escapedXml = xml.replace(/]]>/g, ']]]]><![CDATA[>');

  const body = `<stamp xmlns="http://facturacion.finkok.com/stamp">
      <xml><![CDATA[${escapedXml}]]></xml>
      <username>${escapeXml(username)}</username>
      <password>${escapeXml(password)}</password>
    </stamp>`;

  return buildSOAPEnvelope(body);
}

/**
 * Build a Finkok cancel SOAP envelope
 *
 * @param params - Cancel parameters
 * @returns Complete SOAP envelope for cancel request
 */
export function buildCancelEnvelope(params: {
  uuids: string[];
  username: string;
  password: string;
  taxpayerId: string;
  cerPem: string;
  keyPem: string;
  motivo: string;
  folioSustitucion?: string;
}): string {
  const { uuids, username, password, taxpayerId, cerPem, keyPem, motivo, folioSustitucion } = params;

  // Build UUIDS array
  const uuidsXml = uuids.map(uuid =>
    `<UUIDS>
        <UUID>${escapeXml(uuid)}</UUID>
        <Motivo>${escapeXml(motivo)}</Motivo>
        ${folioSustitucion ? `<FolioSustitucion>${escapeXml(folioSustitucion)}</FolioSustitucion>` : ''}
      </UUIDS>`
  ).join('\n');

  const body = `<cancel xmlns="http://facturacion.finkok.com/cancel">
      <UUIDS>
        ${uuidsXml}
      </UUIDS>
      <username>${escapeXml(username)}</username>
      <password>${escapeXml(password)}</password>
      <taxpayer_id>${escapeXml(taxpayerId)}</taxpayer_id>
      <cer><![CDATA[${cerPem}]]></cer>
      <key><![CDATA[${keyPem}]]></key>
    </cancel>`;

  return buildSOAPEnvelope(body);
}

/**
 * Build a Finkok 'stamped' query envelope (for recovering duplicate stamps)
 *
 * @param uuid - The UUID to query
 * @param username - Finkok username
 * @param password - Finkok password
 * @param taxpayerId - RFC of the issuer
 * @returns Complete SOAP envelope for stamped query
 */
export function buildStampedQueryEnvelope(
  uuid: string,
  username: string,
  password: string,
  taxpayerId: string
): string {
  const body = `<stamped xmlns="http://facturacion.finkok.com/stamped">
      <uuid>${escapeXml(uuid)}</uuid>
      <username>${escapeXml(username)}</username>
      <password>${escapeXml(password)}</password>
      <taxpayer_id>${escapeXml(taxpayerId)}</taxpayer_id>
    </stamped>`;

  return buildSOAPEnvelope(body);
}

// ============================================================================
// SOAP Call Execution
// ============================================================================

/**
 * Make a SOAP call to a web service
 *
 * @param options - SOAP call options
 * @returns SOAP response with status code and raw XML
 * @throws PACError with PAC_NETWORK_ERROR on connection failures
 * @throws PACError with PAC_TIMEOUT on timeout
 */
export async function callSOAP(options: SOAPCallOptions): Promise<SOAPResponse> {
  const { endpoint, soapAction, body, timeoutMs = DEFAULT_TIMEOUT_MS } = options;

  // Build full SOAP envelope if not already wrapped
  const soapEnvelope = body.includes('soap:Envelope')
    ? body
    : buildSOAPEnvelope(body);

  // Create abort controller for timeout
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/xml; charset=utf-8',
        'SOAPAction': soapAction,
      },
      body: soapEnvelope,
      signal: controller.signal,
    });

    const rawXml = await response.text();

    return {
      statusCode: response.status,
      rawXml,
    };
  } catch (error) {
    // Handle abort (timeout)
    if (error instanceof Error && error.name === 'AbortError') {
      throw new PACError(
        'PAC_TIMEOUT',
        `SOAP request to ${endpoint} timed out after ${timeoutMs}ms`,
        true,
        error
      );
    }

    // Wrap network errors
    throw wrapNetworkError(error, `SOAP request to ${endpoint}`);
  } finally {
    clearTimeout(timeoutId);
  }
}

// ============================================================================
// Response Parsing
// ============================================================================

/**
 * Parse a SOAP response and extract the result element
 *
 * @param rawXml - Raw SOAP response XML
 * @param resultKey - Name of the result element to extract (e.g., 'stampResult')
 * @returns Parsed result as a flat object
 * @throws PACError on parse failure
 */
export function parseSOAPResponse(rawXml: string, resultKey: string): Record<string, unknown> {
  if (!rawXml) {
    throw new PACError(
      'PAC_UNKNOWN_ERROR',
      'Empty SOAP response',
      false
    );
  }

  let doc: Document;
  try {
    const parser = new DOMParser({
      errorHandler: {
        warning: () => {},
        error: (msg) => { throw new Error(msg); },
        fatalError: (msg) => { throw new Error(msg); },
      },
    });
    doc = parser.parseFromString(rawXml, 'text/xml');
  } catch (error) {
    throw new PACError(
      'PAC_UNKNOWN_ERROR',
      `Failed to parse SOAP response: ${error instanceof Error ? error.message : 'Unknown error'}`,
      false,
      error
    );
  }

  // Look for SOAP Fault first
  const faultElements = doc.getElementsByTagName('soap:Fault');
  if (faultElements.length > 0) {
    const fault = faultElements[0];
    const faultString = getElementText(fault, 'faultstring') || 'Unknown SOAP Fault';
    throw new PACError(
      'PAC_UNKNOWN_ERROR',
      `SOAP Fault: ${faultString}`,
      false
    );
  }

  // Find the result element
  const resultElements = doc.getElementsByTagName(resultKey);
  if (resultElements.length === 0) {
    // Try without namespace prefix
    const allElements = doc.getElementsByTagName('*');
    for (let i = 0; i < allElements.length; i++) {
      const el = allElements[i];
      if (el?.localName === resultKey || el?.tagName?.endsWith(`:${resultKey}`)) {
        return parseElementToObject(el as Element);
      }
    }

    throw new PACError(
      'PAC_UNKNOWN_ERROR',
      `Result element '${resultKey}' not found in SOAP response`,
      false
    );
  }

  return parseElementToObject(resultElements[0] as Element);
}

/**
 * Parse Finkok stamp response
 *
 * @param rawXml - Raw SOAP response XML
 * @returns Parsed stamp result
 */
export function parseStampResponse(rawXml: string): FinkokStampResult {
  const result = parseSOAPResponse(rawXml, 'stampResult');

  return {
    codEstatus: result.CodEstatus as string || '',
    xml: result.xml as string || '',
    uuid: result.UUID as string || '',
    fecha: result.Fecha as string || '',
    satSeal: result.SatSeal as string || '',
    noCertificadoSAT: result.NoCertificadoSAT as string || '',
    incidencias: parseIncidencias(result.Incidencias),
  };
}

/**
 * Parsed Finkok stamp result
 */
export interface FinkokStampResult {
  codEstatus: string;
  xml: string;
  uuid: string;
  fecha: string;
  satSeal: string;
  noCertificadoSAT: string;
  incidencias: FinkokIncidencia[];
}

/**
 * Finkok incidencia (error/warning)
 */
export interface FinkokIncidencia {
  codigoError: string;
  mensajeIncidencia: string;
}

/**
 * Parse Incidencias array from Finkok response
 */
function parseIncidencias(incidencias: unknown): FinkokIncidencia[] {
  if (!incidencias) return [];

  // Handle single incidencia
  if (typeof incidencias === 'object' && !Array.isArray(incidencias)) {
    const inc = incidencias as Record<string, unknown>;
    if (inc.Incidencia) {
      const incidencia = inc.Incidencia as Record<string, unknown>;
      return [{
        codigoError: (incidencia.CodigoError as string) || '',
        mensajeIncidencia: (incidencia.MensajeIncidencia as string) || '',
      }];
    }
  }

  // Handle array of incidencias
  if (Array.isArray(incidencias)) {
    return incidencias.map(inc => ({
      codigoError: (inc as Record<string, unknown>).CodigoError as string || '',
      mensajeIncidencia: (inc as Record<string, unknown>).MensajeIncidencia as string || '',
    }));
  }

  return [];
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Escape special XML characters
 */
function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Get text content of a child element
 */
function getElementText(parent: Element, tagName: string): string | null {
  const elements = parent.getElementsByTagName(tagName);
  if (elements.length > 0) {
    return elements[0]?.textContent || null;
  }
  return null;
}

/**
 * Parse an XML element and its children into a flat object
 */
function parseElementToObject(element: Element): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  // Get attributes
  for (let i = 0; i < element.attributes.length; i++) {
    const attr = element.attributes[i];
    if (attr) {
      result[attr.name] = attr.value;
    }
  }

  // Get child elements
  for (let i = 0; i < element.childNodes.length; i++) {
    const child = element.childNodes[i];

    if (child?.nodeType === 1) { // Element node
      const childElement = child as Element;
      const tagName = childElement.localName || childElement.tagName;

      // Check if this element contains only text/CDATA
      const textContent = getElementTextContent(childElement);
      if (textContent !== null) {
        result[tagName] = textContent;
      } else if (childElement.childNodes.length === 0) {
        // Empty element - check for attributes
        if (childElement.attributes.length > 0) {
          result[tagName] = parseElementToObject(childElement);
        } else {
          result[tagName] = '';
        }
      } else {
        // Has child elements - recurse
        result[tagName] = parseElementToObject(childElement);
      }
    } else if (child?.nodeType === 3) { // Text node
      const text = (child.textContent || '').trim();
      if (text && !result['_text']) {
        result['_text'] = text;
      }
    }
  }

  return result;
}

/**
 * Get text content of an element, handling CDATA sections
 * Returns null if element has child elements (not just text/CDATA)
 */
function getElementTextContent(element: Element): string | null {
  let hasElementChildren = false;
  let textParts: string[] = [];

  for (let i = 0; i < element.childNodes.length; i++) {
    const child = element.childNodes[i];
    if (!child) continue;

    // Node types: 1=Element, 3=Text, 4=CDATA
    if (child.nodeType === 1) {
      hasElementChildren = true;
      break;
    } else if (child.nodeType === 3 || child.nodeType === 4) {
      // Text or CDATA node
      const content = child.nodeValue || child.textContent || '';
      if (content) {
        textParts.push(content);
      }
    }
  }

  if (hasElementChildren) {
    return null;
  }

  return textParts.join('');
}
