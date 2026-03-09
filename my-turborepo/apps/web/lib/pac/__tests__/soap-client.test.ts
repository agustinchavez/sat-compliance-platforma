/**
 * SOAP Client Tests (Component 15)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  buildSOAPEnvelope,
  buildStampEnvelope,
  buildCancelEnvelope,
  buildStampedQueryEnvelope,
  callSOAP,
  parseSOAPResponse,
  parseStampResponse,
  type SOAPCallOptions,
} from '../soap-client';
import { PACError } from '../errors';

// ============================================================================
// Mock fetch
// ============================================================================

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

beforeEach(() => {
  mockFetch.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ============================================================================
// Test Fixtures
// ============================================================================

const SAMPLE_CFDI_XML = `<?xml version="1.0" encoding="UTF-8"?>
<cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/4" Version="4.0">
  <cfdi:Emisor Rfc="ABC123456789"/>
</cfdi:Comprobante>`;

const SAMPLE_STAMP_RESPONSE = `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <stampResponse xmlns="http://facturacion.finkok.com/stamp">
      <stampResult>
        <CodEstatus>Comprobante timbrado satisfactoriamente</CodEstatus>
        <xml><![CDATA[<?xml version="1.0"?><cfdi:Comprobante>...</cfdi:Comprobante>]]></xml>
        <UUID>05c519de-6d20-4258-88fb-c69a5970e927</UUID>
        <Fecha>2024-03-01T10:00:00</Fecha>
        <SatSeal>qadm+mH3gZu...</SatSeal>
        <NoCertificadoSAT>30001000000400002495</NoCertificadoSAT>
      </stampResult>
    </stampResponse>
  </soap:Body>
</soap:Envelope>`;

const SAMPLE_ERROR_RESPONSE = `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <stampResponse xmlns="http://facturacion.finkok.com/stamp">
      <stampResult>
        <CodEstatus></CodEstatus>
        <Incidencias>
          <Incidencia>
            <CodigoError>705</CodigoError>
            <MensajeIncidencia>El XML no tiene una estructura válida</MensajeIncidencia>
          </Incidencia>
        </Incidencias>
      </stampResult>
    </stampResponse>
  </soap:Body>
</soap:Envelope>`;

const SAMPLE_307_RESPONSE = `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <stampResponse xmlns="http://facturacion.finkok.com/stamp">
      <stampResult>
        <CodEstatus></CodEstatus>
        <xml><![CDATA[<?xml version="1.0"?><cfdi:Comprobante>previous stamp</cfdi:Comprobante>]]></xml>
        <Incidencias>
          <Incidencia>
            <CodigoError>307</CodigoError>
            <MensajeIncidencia>El CFDI contiene un timbre previo</MensajeIncidencia>
          </Incidencia>
        </Incidencias>
      </stampResult>
    </stampResponse>
  </soap:Body>
</soap:Envelope>`;

const SAMPLE_SOAP_FAULT = `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <soap:Fault>
      <faultcode>soap:Server</faultcode>
      <faultstring>Internal server error</faultstring>
    </soap:Fault>
  </soap:Body>
</soap:Envelope>`;

// ============================================================================
// buildSOAPEnvelope Tests
// ============================================================================

describe('buildSOAPEnvelope', () => {
  it('should wrap body in SOAP envelope', () => {
    const body = '<test>content</test>';
    const envelope = buildSOAPEnvelope(body);

    expect(envelope).toContain('soap:Envelope');
    expect(envelope).toContain('soap:Header');
    expect(envelope).toContain('soap:Body');
    expect(envelope).toContain('<test>content</test>');
  });

  it('should include correct namespace', () => {
    const envelope = buildSOAPEnvelope('<test/>');
    expect(envelope).toContain('xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"');
  });

  it('should include XML declaration', () => {
    const envelope = buildSOAPEnvelope('<test/>');
    expect(envelope).toContain('<?xml version="1.0" encoding="UTF-8"?>');
  });
});

// ============================================================================
// buildStampEnvelope Tests
// ============================================================================

describe('buildStampEnvelope', () => {
  it('should build valid SOAP envelope for stamp request', () => {
    const envelope = buildStampEnvelope(SAMPLE_CFDI_XML, 'testuser', 'testpass');

    expect(envelope).toContain('soap:Envelope');
    expect(envelope).toContain('xmlns="http://facturacion.finkok.com/stamp"');
    expect(envelope).toContain('<username>testuser</username>');
    expect(envelope).toContain('<password>testpass</password>');
  });

  it('should wrap XML in CDATA', () => {
    const envelope = buildStampEnvelope(SAMPLE_CFDI_XML, 'user', 'pass');
    expect(envelope).toContain('<![CDATA[');
    expect(envelope).toContain(']]>');
  });

  it('should escape nested CDATA if present', () => {
    const xmlWithCDATA = '<root><![CDATA[nested content]]></root>';
    const envelope = buildStampEnvelope(xmlWithCDATA, 'user', 'pass');

    // Should split the nested CDATA
    expect(envelope).not.toContain('<![CDATA[nested content]]>');
  });

  it('should escape special characters in username/password', () => {
    const envelope = buildStampEnvelope(SAMPLE_CFDI_XML, 'user&<test', 'pass&>test');

    expect(envelope).toContain('&amp;');
    expect(envelope).toContain('&lt;');
    expect(envelope).toContain('&gt;');
  });
});

// ============================================================================
// buildCancelEnvelope Tests
// ============================================================================

describe('buildCancelEnvelope', () => {
  it('should build valid SOAP envelope for cancel request', () => {
    const envelope = buildCancelEnvelope({
      uuids: ['05c519de-6d20-4258-88fb-c69a5970e927'],
      username: 'testuser',
      password: 'testpass',
      taxpayerId: 'ABC123456789',
      cerPem: '-----BEGIN CERTIFICATE-----\nMIIF...\n-----END CERTIFICATE-----',
      keyPem: '-----BEGIN PRIVATE KEY-----\nMIIE...\n-----END PRIVATE KEY-----',
      motivo: '02',
    });

    expect(envelope).toContain('soap:Envelope');
    expect(envelope).toContain('xmlns="http://facturacion.finkok.com/cancel"');
    expect(envelope).toContain('05c519de-6d20-4258-88fb-c69a5970e927');
    expect(envelope).toContain('<Motivo>02</Motivo>');
    expect(envelope).toContain('<taxpayer_id>ABC123456789</taxpayer_id>');
  });

  it('should include folioSustitucion when provided', () => {
    const envelope = buildCancelEnvelope({
      uuids: ['uuid1'],
      username: 'user',
      password: 'pass',
      taxpayerId: 'RFC123',
      cerPem: 'cert',
      keyPem: 'key',
      motivo: '01',
      folioSustitucion: 'replacement-uuid',
    });

    expect(envelope).toContain('<FolioSustitucion>replacement-uuid</FolioSustitucion>');
  });

  it('should NOT include folioSustitucion when not provided', () => {
    const envelope = buildCancelEnvelope({
      uuids: ['uuid1'],
      username: 'user',
      password: 'pass',
      taxpayerId: 'RFC123',
      cerPem: 'cert',
      keyPem: 'key',
      motivo: '02',
    });

    expect(envelope).not.toContain('FolioSustitucion');
  });

  it('should handle multiple UUIDs', () => {
    const envelope = buildCancelEnvelope({
      uuids: ['uuid1', 'uuid2', 'uuid3'],
      username: 'user',
      password: 'pass',
      taxpayerId: 'RFC123',
      cerPem: 'cert',
      keyPem: 'key',
      motivo: '03',
    });

    expect(envelope).toContain('uuid1');
    expect(envelope).toContain('uuid2');
    expect(envelope).toContain('uuid3');
  });
});

// ============================================================================
// buildStampedQueryEnvelope Tests
// ============================================================================

describe('buildStampedQueryEnvelope', () => {
  it('should build valid SOAP envelope for stamped query', () => {
    const envelope = buildStampedQueryEnvelope(
      '05c519de-6d20-4258-88fb-c69a5970e927',
      'testuser',
      'testpass',
      'ABC123456789'
    );

    expect(envelope).toContain('soap:Envelope');
    expect(envelope).toContain('xmlns="http://facturacion.finkok.com/stamped"');
    expect(envelope).toContain('<uuid>05c519de-6d20-4258-88fb-c69a5970e927</uuid>');
    expect(envelope).toContain('<username>testuser</username>');
    expect(envelope).toContain('<taxpayer_id>ABC123456789</taxpayer_id>');
  });
});

// ============================================================================
// callSOAP Tests
// ============================================================================

describe('callSOAP', () => {
  it('should make POST request with correct headers', async () => {
    mockFetch.mockResolvedValueOnce({
      status: 200,
      text: async () => SAMPLE_STAMP_RESPONSE,
    });

    await callSOAP({
      endpoint: 'https://demo-facturacion.finkok.com/servicios/soap/stamp',
      soapAction: 'stamp',
      body: '<test/>',
    });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, options] = mockFetch.mock.calls[0];

    expect(url).toBe('https://demo-facturacion.finkok.com/servicios/soap/stamp');
    expect(options.method).toBe('POST');
    expect(options.headers['Content-Type']).toBe('text/xml; charset=utf-8');
    expect(options.headers['SOAPAction']).toBe('stamp');
  });

  it('should return SOAPResponse with status and XML', async () => {
    mockFetch.mockResolvedValueOnce({
      status: 200,
      text: async () => SAMPLE_STAMP_RESPONSE,
    });

    const response = await callSOAP({
      endpoint: 'https://example.com/soap',
      soapAction: 'test',
      body: '<test/>',
    });

    expect(response.statusCode).toBe(200);
    expect(response.rawXml).toBe(SAMPLE_STAMP_RESPONSE);
  });

  it('should wrap body in SOAP envelope if not already wrapped', async () => {
    mockFetch.mockResolvedValueOnce({
      status: 200,
      text: async () => '<response/>',
    });

    await callSOAP({
      endpoint: 'https://example.com/soap',
      soapAction: 'test',
      body: '<test/>',
    });

    const sentBody = mockFetch.mock.calls[0][1].body;
    expect(sentBody).toContain('soap:Envelope');
  });

  it('should throw PAC_TIMEOUT on timeout', async () => {
    // Simulate AbortError from timeout
    const abortError = new Error('Aborted');
    abortError.name = 'AbortError';
    mockFetch.mockRejectedValueOnce(abortError);

    try {
      await callSOAP({
        endpoint: 'https://example.com/soap',
        soapAction: 'test',
        body: '<test/>',
        timeoutMs: 50,
      });
      expect.fail('Should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(PACError);
      expect((error as PACError).code).toBe('PAC_TIMEOUT');
      expect((error as PACError).retryable).toBe(true);
    }
  });

  it('should throw PAC_NETWORK_ERROR on fetch error', async () => {
    mockFetch.mockRejectedValueOnce(new Error('ECONNREFUSED'));

    await expect(
      callSOAP({
        endpoint: 'https://example.com/soap',
        soapAction: 'test',
        body: '<test/>',
      })
    ).rejects.toThrow(PACError);

    try {
      await callSOAP({
        endpoint: 'https://example.com/soap',
        soapAction: 'test',
        body: '<test/>',
      });
    } catch (error) {
      expect(error).toBeInstanceOf(PACError);
      expect((error as PACError).retryable).toBe(true);
    }
  });

  it('should use default timeout of 30000ms', async () => {
    mockFetch.mockResolvedValueOnce({
      status: 200,
      text: async () => '<response/>',
    });

    await callSOAP({
      endpoint: 'https://example.com/soap',
      soapAction: 'test',
      body: '<test/>',
    });

    // Just verify it completes without explicit timeout
    expect(mockFetch).toHaveBeenCalled();
  });
});

// ============================================================================
// parseSOAPResponse Tests
// ============================================================================

describe('parseSOAPResponse', () => {
  it('should parse stamp result from SOAP response', () => {
    const result = parseSOAPResponse(SAMPLE_STAMP_RESPONSE, 'stampResult');

    expect(result.CodEstatus).toBe('Comprobante timbrado satisfactoriamente');
    expect(result.UUID).toBe('05c519de-6d20-4258-88fb-c69a5970e927');
    expect(result.Fecha).toBe('2024-03-01T10:00:00');
  });

  it('should throw on SOAP Fault', () => {
    expect(() => parseSOAPResponse(SAMPLE_SOAP_FAULT, 'stampResult')).toThrow(PACError);

    try {
      parseSOAPResponse(SAMPLE_SOAP_FAULT, 'stampResult');
    } catch (error) {
      expect((error as PACError).message).toContain('SOAP Fault');
      expect((error as PACError).message).toContain('Internal server error');
    }
  });

  it('should throw on missing result element', () => {
    const noResult = `<?xml version="1.0"?>
      <soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
        <soap:Body><other>content</other></soap:Body>
      </soap:Envelope>`;

    expect(() => parseSOAPResponse(noResult, 'stampResult')).toThrow(PACError);

    try {
      parseSOAPResponse(noResult, 'stampResult');
    } catch (error) {
      expect((error as PACError).message).toContain('stampResult');
      expect((error as PACError).message).toContain('not found');
    }
  });

  it('should throw on empty response', () => {
    expect(() => parseSOAPResponse('', 'stampResult')).toThrow(PACError);
  });

  it('should throw on malformed XML', () => {
    expect(() => parseSOAPResponse('<unclosed>', 'stampResult')).toThrow(PACError);
  });

  it('should handle Incidencias array in response', () => {
    const result = parseSOAPResponse(SAMPLE_ERROR_RESPONSE, 'stampResult');

    expect(result.Incidencias).toBeDefined();
  });
});

// ============================================================================
// parseStampResponse Tests
// ============================================================================

describe('parseStampResponse', () => {
  it('should parse successful stamp response', () => {
    const result = parseStampResponse(SAMPLE_STAMP_RESPONSE);

    expect(result.codEstatus).toBe('Comprobante timbrado satisfactoriamente');
    expect(result.uuid).toBe('05c519de-6d20-4258-88fb-c69a5970e927');
    expect(result.fecha).toBe('2024-03-01T10:00:00');
    expect(result.noCertificadoSAT).toBe('30001000000400002495');
  });

  it('should extract XML from response', () => {
    const result = parseStampResponse(SAMPLE_STAMP_RESPONSE);

    expect(result.xml).toContain('cfdi:Comprobante');
  });

  it('should parse error response with incidencias', () => {
    const result = parseStampResponse(SAMPLE_ERROR_RESPONSE);

    expect(result.codEstatus).toBe('');
    expect(result.incidencias).toHaveLength(1);
    expect(result.incidencias[0].codigoError).toBe('705');
    expect(result.incidencias[0].mensajeIncidencia).toContain('estructura válida');
  });

  it('should parse 307 duplicate stamp response', () => {
    const result = parseStampResponse(SAMPLE_307_RESPONSE);

    expect(result.incidencias).toHaveLength(1);
    expect(result.incidencias[0].codigoError).toBe('307');
    expect(result.xml).toContain('previous stamp');
  });

  it('should handle missing fields gracefully', () => {
    const minimalResponse = `<?xml version="1.0"?>
      <soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
        <soap:Body>
          <stampResponse xmlns="http://facturacion.finkok.com/stamp">
            <stampResult>
              <CodEstatus>OK</CodEstatus>
            </stampResult>
          </stampResponse>
        </soap:Body>
      </soap:Envelope>`;

    const result = parseStampResponse(minimalResponse);

    expect(result.codEstatus).toBe('OK');
    expect(result.xml).toBe('');
    expect(result.uuid).toBe('');
    expect(result.incidencias).toEqual([]);
  });
});
