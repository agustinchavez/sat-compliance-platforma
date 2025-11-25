/**
 * SOAP Client for SAT Web Services
 *
 * This file provides a low-level SOAP client for interacting with SAT's
 * web services. It handles:
 * - Building SOAP envelopes
 * - Sending SOAP requests via HTTPS
 * - Parsing SOAP responses
 * - Error handling and retries
 *
 * Note: We use axios + fast-xml-parser instead of the 'soap' npm package
 * because SAT's SOAP implementation is non-standard and poorly documented.
 */

import axios, { AxiosError, AxiosRequestConfig } from 'axios';
import { XMLParser, XMLBuilder } from 'fast-xml-parser';
import type { SOAPRequest, SOAPResponse, SOAPEnvelope } from './types';
import { SATSOAPError, SATAuthenticationError } from './types';
import {
  isRetryableError,
  calculateBackoffDelay,
  sleep,
  logSATRequest,
} from './utils';

// ============================================================================
// Configuration
// ============================================================================

const DEFAULT_TIMEOUT = parseInt(process.env.SAT_SOAP_TIMEOUT || '60000', 10);
const MAX_RETRIES = parseInt(process.env.SAT_MAX_RETRY_ATTEMPTS || '3', 10);

const SOAP_NAMESPACES = {
  'xmlns:soapenv': 'http://schemas.xmlsoap.org/soap/envelope/',
  'xmlns:des': 'http://DescargaMasivaTerceros.sat.gob.mx',
  'xmlns:xsd': 'http://www.w3.org/2001/XMLSchema',
  'xmlns:xsi': 'http://www.w3.org/2001/XMLSchema-instance',
};

// ============================================================================
// XML Parser Configuration
// ============================================================================

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  textNodeName: '#text',
  parseAttributeValue: true,
  trimValues: true,
});

const xmlBuilder = new XMLBuilder({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  format: true,
  suppressEmptyNode: true,
});

// ============================================================================
// SOAP Client
// ============================================================================

/**
 * Creates a SOAP client with default configuration
 *
 * @param timeout - Request timeout in milliseconds
 * @returns Axios instance configured for SOAP
 */
export function createSOAPClient(timeout: number = DEFAULT_TIMEOUT) {
  return axios.create({
    timeout,
    headers: {
      'Content-Type': 'text/xml; charset=utf-8',
      'Accept': 'text/xml',
      'User-Agent': 'SAT-Compliance-Platform/1.0',
    },
    validateStatus: () => true, // Handle all status codes manually
  });
}

/**
 * Sends a SOAP request to SAT
 *
 * @param request - SOAP request configuration
 * @param organizationId - Organization ID for logging
 * @param retryCount - Current retry attempt (internal)
 * @returns SOAP response
 *
 * @example
 * ```ts
 * const response = await sendSOAPRequest({
 *   endpoint: 'https://cfdidescargamasivasolicitud.clouda.sat.gob.mx/...',
 *   action: 'Autentica',
 *   body: '<des:Autentica>...</des:Autentica>'
 * }, 'org-uuid');
 * ```
 */
export async function sendSOAPRequest(
  request: SOAPRequest,
  organizationId: string,
  retryCount: number = 0
): Promise<SOAPResponse> {
  const startTime = Date.now();

  try {
    // Build SOAP envelope
    const soapEnvelope = buildSOAPEnvelope(request.body, request.headers);

    // Create SOAP client
    const client = createSOAPClient();

    // Prepare request config
    const config: AxiosRequestConfig = {
      headers: {
        'SOAPAction': `"${request.action}"`,
        ...request.headers,
      },
    };

    // Send request
    const response = await client.post(request.endpoint, soapEnvelope, config);

    const duration = Date.now() - startTime;

    // Log request
    logSATRequest({
      timestamp: new Date(),
      organizationId,
      requestType: request.action,
      endpoint: request.endpoint,
      success: response.status === 200,
      duration,
      error: response.status !== 200 ? `HTTP ${response.status}` : undefined,
    });

    // Check for HTTP errors
    if (response.status !== 200) {
      throw new SATSOAPError(
        `HTTP ${response.status}: ${response.statusText}`,
        response.status
      );
    }

    // Parse SOAP response
    const parsedResponse = parseSOAPResponse(response.data);

    // Check for SOAP faults
    if (!parsedResponse.success && parsedResponse.error) {
      throw parsedResponse.error;
    }

    return parsedResponse;
  } catch (error) {
    const duration = Date.now() - startTime;

    // Log failed request
    logSATRequest({
      timestamp: new Date(),
      organizationId,
      requestType: request.action,
      endpoint: request.endpoint,
      success: false,
      duration,
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    // Retry logic
    if (retryCount < MAX_RETRIES && isRetryableError(error)) {
      const delay = calculateBackoffDelay(retryCount);
      console.log(`Retrying SOAP request in ${delay}ms (attempt ${retryCount + 1}/${MAX_RETRIES})`);
      await sleep(delay);
      return sendSOAPRequest(request, organizationId, retryCount + 1);
    }

    // Convert to SAT error
    if (error instanceof SATSOAPError || error instanceof SATAuthenticationError) {
      throw error;
    }

    if (axios.isAxiosError(error)) {
      throw handleAxiosError(error);
    }

    throw new SATSOAPError(
      `SOAP request failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      'UNKNOWN'
    );
  }
}

// ============================================================================
// SOAP Envelope Building
// ============================================================================

/**
 * Builds a SOAP envelope
 *
 * @param body - SOAP body content (XML string or object)
 * @param headers - Optional SOAP headers
 * @returns SOAP envelope XML string
 *
 * @example
 * ```ts
 * const envelope = buildSOAPEnvelope('<des:Autentica>...</des:Autentica>');
 * ```
 */
export function buildSOAPEnvelope(
  body: string | Record<string, any>,
  headers?: Record<string, any>
): string {
  const envelope: any = {
    'soapenv:Envelope': {
      ...SOAP_NAMESPACES,
      'soapenv:Header': headers || {},
      'soapenv:Body': typeof body === 'string' ? body : xmlBuilder.build(body),
    },
  };

  // If body is a string (pre-formatted XML), we need to handle it differently
  if (typeof body === 'string') {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope ${Object.entries(SOAP_NAMESPACES).map(([key, value]) => `${key}="${value}"`).join(' ')}>
  <soapenv:Header/>
  <soapenv:Body>
    ${body}
  </soapenv:Body>
</soapenv:Envelope>`;
    return xml;
  }

  return xmlBuilder.build(envelope);
}

/**
 * Builds SOAP body for authentication request
 *
 * @param rfc - Organization RFC
 * @param certificateBase64 - Certificate in base64
 * @param signatureBase64 - Signature in base64
 * @returns SOAP body XML string
 */
export function buildAuthenticationBody(
  rfc: string,
  certificateBase64: string,
  signatureBase64: string
): string {
  return `<des:Autentica>
      <des:CredencialesFIEL>
        <des:EmisorRFC>${rfc}</des:EmisorRFC>
        <des:CertificadoBase64>${certificateBase64}</des:CertificadoBase64>
        <des:SelladoBase64>${signatureBase64}</des:SelladoBase64>
      </des:CredencialesFIEL>
    </des:Autentica>`;
}

/**
 * Builds SOAP body for CFDI download request
 *
 * @param params - Request parameters
 * @returns SOAP body XML string
 */
export function buildDownloadRequestBody(params: {
  rfcSolicitante: string;
  fechaInicial: string;
  fechaFinal: string;
  tipoSolicitud: 'CFDI' | 'Metadata';
  rfcEmisor?: string;
  rfcReceptor?: string;
}): string {
  const filters: string[] = [];

  if (params.rfcEmisor) {
    filters.push(`<des:RfcEmisor>${params.rfcEmisor}</des:RfcEmisor>`);
  }

  if (params.rfcReceptor) {
    filters.push(`<des:RfcReceptor>${params.rfcReceptor}</des:RfcReceptor>`);
  }

  return `<des:SolicitaDescarga>
      <des:solicitud
        RfcSolicitante="${params.rfcSolicitante}"
        FechaInicial="${params.fechaInicial}"
        FechaFinal="${params.fechaFinal}"
        TipoSolicitud="${params.tipoSolicitud}">
        ${filters.join('\n        ')}
      </des:solicitud>
    </des:SolicitaDescarga>`;
}

/**
 * Builds SOAP body for download verification request
 *
 * @param rfcSolicitante - Organization RFC
 * @param requestId - SAT request ID
 * @returns SOAP body XML string
 */
export function buildVerificationRequestBody(
  rfcSolicitante: string,
  requestId: string
): string {
  return `<des:VerificaSolicitudDescarga>
      <des:solicitud
        RfcSolicitante="${rfcSolicitante}"
        IdSolicitud="${requestId}"/>
    </des:VerificaSolicitudDescarga>`;
}

/**
 * Builds SOAP body for package download request
 *
 * @param rfcSolicitante - Organization RFC
 * @param packageId - Package ID
 * @returns SOAP body XML string
 */
export function buildPackageDownloadBody(
  rfcSolicitante: string,
  packageId: string
): string {
  return `<des:PeticionDescargaMasivaTercerosEntrada>
      <des:peticionDescarga
        RfcSolicitante="${rfcSolicitante}"
        IdPaquete="${packageId}"/>
    </des:PeticionDescargaMasivaTercerosEntrada>`;
}

// ============================================================================
// SOAP Response Parsing
// ============================================================================

/**
 * Parses a SOAP response
 *
 * @param xml - SOAP response XML string
 * @returns Parsed SOAP response
 *
 * @example
 * ```ts
 * const response = parseSOAPResponse(xmlString);
 * if (response.success) {
 *   console.log('Data:', response.data);
 * }
 * ```
 */
export function parseSOAPResponse(xml: string): SOAPResponse {
  try {
    const parsed = xmlParser.parse(xml);

    // Navigate to SOAP body
    const envelope = parsed['s:Envelope'] || parsed['soapenv:Envelope'] || parsed['Envelope'];
    if (!envelope) {
      throw new SATSOAPError('Invalid SOAP response: No envelope found', 'PARSE_ERROR');
    }

    const body = envelope['s:Body'] || envelope['soapenv:Body'] || envelope['Body'];
    if (!body) {
      throw new SATSOAPError('Invalid SOAP response: No body found', 'PARSE_ERROR');
    }

    // Check for SOAP fault
    const fault = body['s:Fault'] || body['soapenv:Fault'] || body['Fault'];
    if (fault) {
      return handleSOAPFault(fault);
    }

    // Extract response data
    return {
      success: true,
      data: body,
      xml,
    };
  } catch (error) {
    if (error instanceof SATSOAPError) {
      return {
        success: false,
        error,
      };
    }

    return {
      success: false,
      error: new SATSOAPError(
        `Failed to parse SOAP response: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'PARSE_ERROR'
      ),
    };
  }
}

/**
 * Handles SOAP fault
 *
 * @param fault - SOAP fault object
 * @returns SOAP response with error
 */
function handleSOAPFault(fault: any): SOAPResponse {
  const faultCode = fault.faultcode || fault.Code || 'UNKNOWN';
  const faultString = fault.faultstring || fault.Reason || 'Unknown SOAP fault';
  const detail = fault.detail || fault.Detail;

  let satCode: number | undefined;
  let errorMessage = faultString;

  // Try to extract SAT error code from detail
  if (detail) {
    const codeMatch = JSON.stringify(detail).match(/\b[345]\d{2,3}\b/);
    if (codeMatch) {
      satCode = parseInt(codeMatch[0], 10);
    }
  }

  // Determine error type based on code
  if (satCode && [300, 301, 302, 303, 304, 305].includes(satCode)) {
    return {
      success: false,
      error: new SATAuthenticationError(errorMessage, satCode),
    };
  }

  return {
    success: false,
    error: new SATSOAPError(errorMessage, faultCode, satCode),
  };
}

// ============================================================================
// Error Handling
// ============================================================================

/**
 * Handles Axios errors
 *
 * @param error - Axios error
 * @returns SAT error
 */
function handleAxiosError(error: AxiosError): SATSOAPError {
  if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
    return new SATSOAPError(
      'Request timeout: SAT server did not respond in time',
      'TIMEOUT'
    );
  }

  if (error.code === 'ECONNREFUSED') {
    return new SATSOAPError(
      'Connection refused: SAT server is not reachable',
      'CONNECTION_REFUSED'
    );
  }

  if (error.code === 'ENOTFOUND') {
    return new SATSOAPError(
      'DNS lookup failed: SAT server hostname could not be resolved',
      'DNS_ERROR'
    );
  }

  if (error.response) {
    return new SATSOAPError(
      `HTTP ${error.response.status}: ${error.response.statusText}`,
      error.response.status
    );
  }

  return new SATSOAPError(
    `Network error: ${error.message}`,
    error.code || 'NETWORK_ERROR'
  );
}

/**
 * Extracts value from SOAP response
 *
 * @param response - Parsed SOAP response
 * @param path - Path to value (e.g., 'AutenticaResponse.token')
 * @returns Extracted value or null
 */
export function extractSOAPValue(
  response: SOAPResponse,
  path: string
): any | null {
  if (!response.success || !response.data) {
    return null;
  }

  const parts = path.split('.');
  let current = response.data;

  for (const part of parts) {
    if (current && typeof current === 'object' && part in current) {
      current = current[part];
    } else {
      return null;
    }
  }

  return current;
}

/**
 * Checks if SOAP response indicates success
 *
 * @param response - SOAP response
 * @param successCodes - Array of SAT success codes (default: [5000])
 * @returns true if successful
 */
export function isSOAPSuccess(
  response: SOAPResponse,
  successCodes: number[] = [5000]
): boolean {
  if (!response.success) {
    return false;
  }

  // Extract status code from response
  const statusCode = extractSOAPValue(response, 'CodigoEstatus') ||
                     extractSOAPValue(response, 'CodEstatus');

  if (!statusCode) {
    // If no status code, consider it success if no error
    return true;
  }

  return successCodes.includes(parseInt(statusCode, 10));
}
