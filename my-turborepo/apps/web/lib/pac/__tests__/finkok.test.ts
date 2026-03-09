/**
 * Finkok Provider Tests (Component 15)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { FinkokProvider } from '../providers/finkok';
import { PACError } from '../errors';
import type { PACCredentials, StampRequest } from '../types';

// ============================================================================
// Mocks
// ============================================================================

// Mock the soap-client module
vi.mock('../soap-client', () => ({
  callSOAP: vi.fn(),
  buildStampEnvelope: vi.fn().mockReturnValue('<soap:Envelope/>'),
  buildCancelEnvelope: vi.fn().mockReturnValue('<soap:Envelope/>'),
  buildStampedQueryEnvelope: vi.fn().mockReturnValue('<soap:Envelope/>'),
  parseStampResponse: vi.fn(),
  parseSOAPResponse: vi.fn(),
}));

// Mock the tfd-parser module
vi.mock('../tfd-parser', () => ({
  extractTFD: vi.fn(),
}));

import * as soapClient from '../soap-client';
import * as tfdParser from '../tfd-parser';

// ============================================================================
// Test Fixtures
// ============================================================================

const VALID_CREDENTIALS: PACCredentials = {
  provider: 'finkok',
  environment: 'sandbox',
  finkokUsername: 'testuser',
  finkokPassword: 'testpass',
};

const VALID_STAMP_REQUEST: StampRequest = {
  signedXml: '<?xml version="1.0"?><cfdi:Comprobante/>',
  issuerRfc: 'ABC123456789',
  orgId: 'org-uuid-123',
};

const VALID_TFD = {
  uuid: '05c519de-6d20-4258-88fb-c69a5970e927',
  fechaTimbrado: '2024-03-01T10:00:00',
  rfcProvCertif: 'SPR190613I52',
  selloCFD: 'SelloCFD123',
  noCertificadoSAT: '30001000000400002495',
  selloSAT: 'SelloSAT456',
  version: '1.1',
};

const SUCCESS_STAMP_RESULT = {
  codEstatus: 'Comprobante timbrado satisfactoriamente',
  xml: '<?xml version="1.0"?><cfdi:Comprobante><cfdi:Complemento><tfd:TimbreFiscalDigital/></cfdi:Complemento></cfdi:Comprobante>',
  uuid: '05c519de-6d20-4258-88fb-c69a5970e927',
  fecha: '2024-03-01T10:00:00',
  satSeal: 'SelloSAT456',
  noCertificadoSAT: '30001000000400002495',
  incidencias: [],
};

const ERROR_STAMP_RESULT = {
  codEstatus: '',
  xml: '',
  uuid: '',
  fecha: '',
  satSeal: '',
  noCertificadoSAT: '',
  incidencias: [
    { codigoError: '705', mensajeIncidencia: 'El XML no tiene una estructura válida' },
  ],
};

const DUPLICATE_STAMP_RESULT_WITH_XML = {
  codEstatus: '',
  xml: '<?xml version="1.0"?><cfdi:Comprobante><tfd:TimbreFiscalDigital/></cfdi:Comprobante>',
  uuid: '',
  fecha: '',
  satSeal: '',
  noCertificadoSAT: '',
  incidencias: [
    { codigoError: '307', mensajeIncidencia: 'El CFDI contiene un timbre previo' },
  ],
};

const DUPLICATE_STAMP_RESULT_WITHOUT_XML = {
  codEstatus: '',
  xml: '',
  uuid: '',
  fecha: '',
  satSeal: '',
  noCertificadoSAT: '',
  incidencias: [
    { codigoError: '307', mensajeIncidencia: 'El CFDI contiene un timbre previo' },
  ],
};

// ============================================================================
// Setup
// ============================================================================

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ============================================================================
// Stamp Tests
// ============================================================================

describe('FinkokProvider.stamp', () => {
  it('should stamp successfully and return StampResult', async () => {
    vi.mocked(soapClient.callSOAP).mockResolvedValueOnce({
      statusCode: 200,
      rawXml: '<soap:Envelope/>',
    });
    vi.mocked(soapClient.parseStampResponse).mockReturnValueOnce(SUCCESS_STAMP_RESULT);
    vi.mocked(tfdParser.extractTFD).mockReturnValueOnce(VALID_TFD);

    const provider = new FinkokProvider();
    const result = await provider.stamp(VALID_STAMP_REQUEST, VALID_CREDENTIALS);

    expect(result.uuid).toBe('05c519de-6d20-4258-88fb-c69a5970e927');
    expect(result.fechaTimbrado).toBe('2024-03-01T10:00:00');
    expect(result.rfcProvCertif).toBe('SPR190613I52');
    expect(result.noCertificadoSAT).toBe('30001000000400002495');
    expect(result.pacProvider).toBe('finkok');
    expect(result.stampedXml).toContain('cfdi:Comprobante');
  });

  it('should extract all TFD fields correctly', async () => {
    vi.mocked(soapClient.callSOAP).mockResolvedValueOnce({
      statusCode: 200,
      rawXml: '<soap:Envelope/>',
    });
    vi.mocked(soapClient.parseStampResponse).mockReturnValueOnce(SUCCESS_STAMP_RESULT);
    vi.mocked(tfdParser.extractTFD).mockReturnValueOnce(VALID_TFD);

    const provider = new FinkokProvider();
    const result = await provider.stamp(VALID_STAMP_REQUEST, VALID_CREDENTIALS);

    expect(result).toHaveProperty('uuid');
    expect(result).toHaveProperty('fechaTimbrado');
    expect(result).toHaveProperty('rfcProvCertif');
    expect(result).toHaveProperty('selloCFD');
    expect(result).toHaveProperty('noCertificadoSAT');
    expect(result).toHaveProperty('selloSAT');
    expect(result).toHaveProperty('pacProvider');
    expect(result).toHaveProperty('stampedXml');
  });

  it('should call SOAP endpoint with correct parameters', async () => {
    vi.mocked(soapClient.callSOAP).mockResolvedValueOnce({
      statusCode: 200,
      rawXml: '<soap:Envelope/>',
    });
    vi.mocked(soapClient.parseStampResponse).mockReturnValueOnce(SUCCESS_STAMP_RESULT);
    vi.mocked(tfdParser.extractTFD).mockReturnValueOnce(VALID_TFD);

    const provider = new FinkokProvider();
    await provider.stamp(VALID_STAMP_REQUEST, VALID_CREDENTIALS);

    expect(soapClient.callSOAP).toHaveBeenCalledWith(
      expect.objectContaining({
        endpoint: 'https://demo-facturacion.finkok.com/servicios/soap/stamp',
        soapAction: 'stamp',
      })
    );
  });

  it('should use production endpoint when environment is production', async () => {
    vi.mocked(soapClient.callSOAP).mockResolvedValueOnce({
      statusCode: 200,
      rawXml: '<soap:Envelope/>',
    });
    vi.mocked(soapClient.parseStampResponse).mockReturnValueOnce(SUCCESS_STAMP_RESULT);
    vi.mocked(tfdParser.extractTFD).mockReturnValueOnce(VALID_TFD);

    const prodCredentials = { ...VALID_CREDENTIALS, environment: 'production' as const };
    const provider = new FinkokProvider();
    await provider.stamp(VALID_STAMP_REQUEST, prodCredentials);

    expect(soapClient.callSOAP).toHaveBeenCalledWith(
      expect.objectContaining({
        endpoint: 'https://facturacion.finkok.com/servicios/soap/stamp',
      })
    );
  });

  it('should throw PAC_INVALID_XML for code 705', async () => {
    vi.mocked(soapClient.callSOAP).mockResolvedValue({
      statusCode: 200,
      rawXml: '<soap:Envelope/>',
    });
    vi.mocked(soapClient.parseStampResponse).mockReturnValue(ERROR_STAMP_RESULT);

    const provider = new FinkokProvider();

    try {
      await provider.stamp(VALID_STAMP_REQUEST, VALID_CREDENTIALS);
      expect.fail('Should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(PACError);
      expect((error as PACError).code).toBe('PAC_INVALID_XML');
      expect((error as PACError).retryable).toBe(false);
    }
  });

  it('should recover from code 307 when xml is present in response', async () => {
    vi.mocked(soapClient.callSOAP).mockResolvedValueOnce({
      statusCode: 200,
      rawXml: '<soap:Envelope/>',
    });
    vi.mocked(soapClient.parseStampResponse).mockReturnValueOnce(DUPLICATE_STAMP_RESULT_WITH_XML);
    vi.mocked(tfdParser.extractTFD).mockReturnValueOnce(VALID_TFD);

    const provider = new FinkokProvider();
    const result = await provider.stamp(VALID_STAMP_REQUEST, VALID_CREDENTIALS);

    expect(result.uuid).toBe(VALID_TFD.uuid);
    expect(result.stampedXml).toContain('cfdi:Comprobante');
  });

  it('should throw PAC_STAMP_DUPLICATE when code 307 and no xml recovery', async () => {
    vi.mocked(soapClient.callSOAP).mockResolvedValue({
      statusCode: 200,
      rawXml: '<soap:Envelope/>',
    });
    vi.mocked(soapClient.parseStampResponse).mockReturnValue(DUPLICATE_STAMP_RESULT_WITHOUT_XML);

    const provider = new FinkokProvider();

    await expect(provider.stamp(VALID_STAMP_REQUEST, VALID_CREDENTIALS))
      .rejects.toThrow(PACError);
  });

  it('should throw PAC_NETWORK_ERROR on network failure', async () => {
    vi.mocked(soapClient.callSOAP).mockRejectedValue(
      new PACError('PAC_NETWORK_ERROR', 'Connection failed', true)
    );

    const provider = new FinkokProvider();

    try {
      await provider.stamp(VALID_STAMP_REQUEST, VALID_CREDENTIALS);
      expect.fail('Should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(PACError);
      expect((error as PACError).code).toBe('PAC_NETWORK_ERROR');
      expect((error as PACError).retryable).toBe(true);
    }
  });

  it('should throw when Finkok credentials are missing', async () => {
    const credentialsWithoutFinkok: PACCredentials = {
      provider: 'finkok',
      environment: 'sandbox',
    };

    const provider = new FinkokProvider();

    try {
      await provider.stamp(VALID_STAMP_REQUEST, credentialsWithoutFinkok);
      expect.fail('Should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(PACError);
      expect((error as PACError).code).toBe('PAC_CREDENTIALS_NOT_FOUND');
    }
  });

  it('should throw PAC_RFC_NOT_REGISTERED for code 702', async () => {
    vi.mocked(soapClient.callSOAP).mockResolvedValueOnce({
      statusCode: 200,
      rawXml: '<soap:Envelope/>',
    });
    vi.mocked(soapClient.parseStampResponse).mockReturnValueOnce({
      ...ERROR_STAMP_RESULT,
      incidencias: [
        { codigoError: '702', mensajeIncidencia: 'RFC no registrado' },
      ],
    });

    const provider = new FinkokProvider();

    try {
      await provider.stamp(VALID_STAMP_REQUEST, VALID_CREDENTIALS);
    } catch (error) {
      expect(error).toBeInstanceOf(PACError);
      expect((error as PACError).code).toBe('PAC_RFC_NOT_REGISTERED');
    }
  });

  it('should throw PAC_WRONG_PASSWORD for code 704', async () => {
    vi.mocked(soapClient.callSOAP).mockResolvedValueOnce({
      statusCode: 200,
      rawXml: '<soap:Envelope/>',
    });
    vi.mocked(soapClient.parseStampResponse).mockReturnValueOnce({
      ...ERROR_STAMP_RESULT,
      incidencias: [
        { codigoError: '704', mensajeIncidencia: 'Contraseña incorrecta' },
      ],
    });

    const provider = new FinkokProvider();

    try {
      await provider.stamp(VALID_STAMP_REQUEST, VALID_CREDENTIALS);
    } catch (error) {
      expect(error).toBeInstanceOf(PACError);
      expect((error as PACError).code).toBe('PAC_WRONG_PASSWORD');
    }
  });
});

// ============================================================================
// Cancel Tests
// ============================================================================

describe('FinkokProvider.cancel', () => {
  it('should throw CANCEL_REQUIRES_FOLIO_SUSTITUCION when motivo 01 without folioSustitucion', async () => {
    const provider = new FinkokProvider();

    await expect(
      provider.cancel(
        {
          uuid: '05c519de-6d20-4258-88fb-c69a5970e927',
          issuerRfc: 'ABC123456789',
          motivo: '01',
          orgId: 'org-uuid',
        },
        VALID_CREDENTIALS
      )
    ).rejects.toThrow(PACError);

    try {
      await provider.cancel(
        {
          uuid: '05c519de-6d20-4258-88fb-c69a5970e927',
          issuerRfc: 'ABC123456789',
          motivo: '01',
          orgId: 'org-uuid',
        },
        VALID_CREDENTIALS
      );
    } catch (error) {
      expect(error).toBeInstanceOf(PACError);
      expect((error as PACError).code).toBe('CANCEL_REQUIRES_FOLIO_SUSTITUCION');
    }
  });

  it('should not throw for motivo 02 without folioSustitucion', async () => {
    // This will fail later due to CSD not implemented, but should pass validation
    const provider = new FinkokProvider();

    await expect(
      provider.cancel(
        {
          uuid: '05c519de-6d20-4258-88fb-c69a5970e927',
          issuerRfc: 'ABC123456789',
          motivo: '02',
          orgId: 'org-uuid',
        },
        VALID_CREDENTIALS
      )
    ).rejects.toThrow(PACError);

    try {
      await provider.cancel(
        {
          uuid: '05c519de-6d20-4258-88fb-c69a5970e927',
          issuerRfc: 'ABC123456789',
          motivo: '02',
          orgId: 'org-uuid',
        },
        VALID_CREDENTIALS
      );
    } catch (error) {
      // Should fail with CSD error, not validation error
      expect(error).toBeInstanceOf(PACError);
      expect((error as PACError).code).not.toBe('CANCEL_REQUIRES_FOLIO_SUSTITUCION');
    }
  });
});

// ============================================================================
// DER to PEM Conversion Tests
// ============================================================================

describe('FinkokProvider static methods', () => {
  it('should have derCertToPem method', () => {
    expect(typeof FinkokProvider.derCertToPem).toBe('function');
  });

  it('should have derKeyToPem method', () => {
    expect(typeof FinkokProvider.derKeyToPem).toBe('function');
  });
});

// ============================================================================
// Query Status Tests
// ============================================================================

describe('FinkokProvider.queryStatus', () => {
  it('should return unknown for now (placeholder)', async () => {
    const provider = new FinkokProvider();
    const status = await provider.queryStatus(
      '05c519de-6d20-4258-88fb-c69a5970e927',
      'ABC123456789',
      VALID_CREDENTIALS
    );

    expect(status).toBe('unknown');
  });
});
