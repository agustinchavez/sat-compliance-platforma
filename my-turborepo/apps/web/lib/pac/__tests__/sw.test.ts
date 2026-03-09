/**
 * SW Provider Tests (Component 15)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SWProvider } from '../providers/sw';
import { PACError } from '../errors';
import type { PACCredentials, StampRequest } from '../types';

// ============================================================================
// Mocks
// ============================================================================

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// Mock tfd-parser
vi.mock('../tfd-parser', () => ({
  extractTFD: vi.fn(),
}));

import * as tfdParser from '../tfd-parser';

// ============================================================================
// Test Fixtures
// ============================================================================

const VALID_CREDENTIALS: PACCredentials = {
  provider: 'sw',
  environment: 'sandbox',
  swUsername: 'test@example.com',
  swPassword: 'testpass',
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

const AUTH_SUCCESS_RESPONSE = {
  status: 'success',
  data: {
    token: 'test-bearer-token-12345',
    expires_in: 7200,
  },
};

const STAMP_SUCCESS_RESPONSE = {
  status: 'success',
  data: {
    cfdi: '<?xml version="1.0"?><cfdi:Comprobante><tfd:TimbreFiscalDigital/></cfdi:Comprobante>',
    tfd: '<tfd:TimbreFiscalDigital/>',
    uuid: '05c519de-6d20-4258-88fb-c69a5970e927',
  },
};

const AUTH_ERROR_RESPONSE = {
  status: 'error',
  message: 'AU2000 - Authentication failed',
  messageDetail: 'Invalid credentials',
};

const STAMP_ERROR_RESPONSE = {
  status: 'error',
  message: 'CFDI40101 - Invalid attribute',
  messageDetail: 'The XML structure is invalid',
};

// ============================================================================
// Setup
// ============================================================================

beforeEach(() => {
  vi.clearAllMocks();
  SWProvider.clearTokenCache();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ============================================================================
// Authentication Tests
// ============================================================================

describe('SWProvider.authenticate', () => {
  it('should authenticate with username/password', async () => {
    mockFetch.mockResolvedValueOnce({
      json: async () => AUTH_SUCCESS_RESPONSE,
    });

    const provider = new SWProvider();
    const token = await provider.authenticate(VALID_CREDENTIALS, 'org-123');

    expect(token).toBe('test-bearer-token-12345');
    expect(mockFetch).toHaveBeenCalledWith(
      'https://services.test.sw.com.mx/v2/security/authenticate',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user: 'test@example.com',
          password: 'testpass',
        }),
      })
    );
  });

  it('should use cached token when not expired', async () => {
    mockFetch.mockResolvedValueOnce({
      json: async () => AUTH_SUCCESS_RESPONSE,
    });

    const provider = new SWProvider();

    // First call - authenticates
    const token1 = await provider.authenticate(VALID_CREDENTIALS, 'org-123');

    // Second call - should use cache
    const token2 = await provider.authenticate(VALID_CREDENTIALS, 'org-123');

    expect(token1).toBe('test-bearer-token-12345');
    expect(token2).toBe('test-bearer-token-12345');
    expect(mockFetch).toHaveBeenCalledTimes(1); // Only one call
  });

  it('should use pre-set infinite token from credentials', async () => {
    const credsWithToken: PACCredentials = {
      ...VALID_CREDENTIALS,
      swToken: 'infinite-token-xyz',
      // No swTokenExpiresAt = infinite token
    };

    const provider = new SWProvider();
    const token = await provider.authenticate(credsWithToken, 'org-123');

    expect(token).toBe('infinite-token-xyz');
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('should throw PAC_AUTH_FAILED on auth error', async () => {
    mockFetch.mockResolvedValueOnce({
      json: async () => AUTH_ERROR_RESPONSE,
    });

    const provider = new SWProvider();

    try {
      await provider.authenticate(VALID_CREDENTIALS, 'org-123');
      expect.fail('Should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(PACError);
      expect((error as PACError).code).toBe('PAC_AUTH_FAILED');
    }
  });

  it('should throw when SW credentials are missing', async () => {
    const credsWithoutSW: PACCredentials = {
      provider: 'sw',
      environment: 'sandbox',
    };

    const provider = new SWProvider();

    try {
      await provider.authenticate(credsWithoutSW, 'org-123');
      expect.fail('Should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(PACError);
      expect((error as PACError).code).toBe('PAC_CREDENTIALS_NOT_FOUND');
    }
  });

  it('should use production endpoint for production environment', async () => {
    mockFetch.mockResolvedValueOnce({
      json: async () => AUTH_SUCCESS_RESPONSE,
    });

    const prodCredentials = { ...VALID_CREDENTIALS, environment: 'production' as const };
    const provider = new SWProvider();

    await provider.authenticate(prodCredentials, 'org-123');

    expect(mockFetch).toHaveBeenCalledWith(
      'https://services.sw.com.mx/v2/security/authenticate',
      expect.anything()
    );
  });
});

// ============================================================================
// Stamp Tests
// ============================================================================

describe('SWProvider.stamp', () => {
  it('should authenticate first and then stamp', async () => {
    // Auth call
    mockFetch.mockResolvedValueOnce({
      json: async () => AUTH_SUCCESS_RESPONSE,
    });

    // Stamp call
    mockFetch.mockResolvedValueOnce({
      json: async () => STAMP_SUCCESS_RESPONSE,
    });

    vi.mocked(tfdParser.extractTFD).mockReturnValueOnce(VALID_TFD);

    const provider = new SWProvider();
    const result = await provider.stamp(VALID_STAMP_REQUEST, VALID_CREDENTIALS);

    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(result.uuid).toBe(VALID_TFD.uuid);
    expect(result.pacProvider).toBe('sw');
  });

  it('should send XML as multipart form-data', async () => {
    mockFetch.mockResolvedValueOnce({
      json: async () => AUTH_SUCCESS_RESPONSE,
    });

    mockFetch.mockResolvedValueOnce({
      json: async () => STAMP_SUCCESS_RESPONSE,
    });

    vi.mocked(tfdParser.extractTFD).mockReturnValueOnce(VALID_TFD);

    const provider = new SWProvider();
    await provider.stamp(VALID_STAMP_REQUEST, VALID_CREDENTIALS);

    // Check the stamp call
    const stampCall = mockFetch.mock.calls[1];
    expect(stampCall[0]).toBe('https://services.test.sw.com.mx/cfdi33/stamp/v4/');
    expect(stampCall[1].headers['Authorization']).toBe('Bearer test-bearer-token-12345');

    // Body should be FormData
    const body = stampCall[1].body;
    expect(body).toBeInstanceOf(FormData);
  });

  it('should extract TFD from returned CFDI', async () => {
    mockFetch.mockResolvedValueOnce({
      json: async () => AUTH_SUCCESS_RESPONSE,
    });

    mockFetch.mockResolvedValueOnce({
      json: async () => STAMP_SUCCESS_RESPONSE,
    });

    vi.mocked(tfdParser.extractTFD).mockReturnValueOnce(VALID_TFD);

    const provider = new SWProvider();
    const result = await provider.stamp(VALID_STAMP_REQUEST, VALID_CREDENTIALS);

    expect(tfdParser.extractTFD).toHaveBeenCalledWith(STAMP_SUCCESS_RESPONSE.data.cfdi);
    expect(result.uuid).toBe(VALID_TFD.uuid);
    expect(result.fechaTimbrado).toBe(VALID_TFD.fechaTimbrado);
    expect(result.rfcProvCertif).toBe(VALID_TFD.rfcProvCertif);
    expect(result.noCertificadoSAT).toBe(VALID_TFD.noCertificadoSAT);
    expect(result.selloSAT).toBe(VALID_TFD.selloSAT);
  });

  it('should throw PAC_INVALID_XML on stamp error', async () => {
    mockFetch.mockResolvedValueOnce({
      json: async () => AUTH_SUCCESS_RESPONSE,
    });

    mockFetch.mockResolvedValueOnce({
      json: async () => STAMP_ERROR_RESPONSE,
    });

    const provider = new SWProvider();

    try {
      await provider.stamp(VALID_STAMP_REQUEST, VALID_CREDENTIALS);
      expect.fail('Should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(PACError);
      expect((error as PACError).code).toBe('PAC_INVALID_XML');
    }
  });

  it('should throw TFD_MISSING when no CFDI in response', async () => {
    mockFetch.mockResolvedValueOnce({
      json: async () => AUTH_SUCCESS_RESPONSE,
    });

    mockFetch.mockResolvedValueOnce({
      json: async () => ({
        status: 'success',
        data: {
          // No cfdi field
          tfd: '<tfd/>',
        },
      }),
    });

    const provider = new SWProvider();

    try {
      await provider.stamp(VALID_STAMP_REQUEST, VALID_CREDENTIALS);
      expect.fail('Should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(PACError);
      expect((error as PACError).code).toBe('TFD_MISSING');
    }
  });
});

// ============================================================================
// Cancel Tests
// ============================================================================

describe('SWProvider.cancel', () => {
  it('should send correct motivo in cancel request', async () => {
    mockFetch.mockResolvedValueOnce({
      json: async () => AUTH_SUCCESS_RESPONSE,
    });

    mockFetch.mockResolvedValueOnce({
      json: async () => ({
        status: 'success',
        data: { status: 'cancelled', acuse: '<xml/>' },
      }),
    });

    const provider = new SWProvider();
    const result = await provider.cancel(
      {
        uuid: '05c519de-6d20-4258-88fb-c69a5970e927',
        issuerRfc: 'ABC123456789',
        motivo: '02',
        orgId: 'org-123',
      },
      VALID_CREDENTIALS
    );

    expect(result.cancelled).toBe(true);

    // Check DELETE call
    const cancelCall = mockFetch.mock.calls[1];
    expect(cancelCall[0]).toContain('05c519de-6d20-4258-88fb-c69a5970e927');
    expect(cancelCall[1].method).toBe('DELETE');

    const body = JSON.parse(cancelCall[1].body);
    expect(body.motivo).toBe('02');
  });

  it('should throw CANCEL_REQUIRES_FOLIO_SUSTITUCION for motivo 01 without folio', async () => {
    const provider = new SWProvider();

    try {
      await provider.cancel(
        {
          uuid: '05c519de-6d20-4258-88fb-c69a5970e927',
          issuerRfc: 'ABC123456789',
          motivo: '01',
          orgId: 'org-123',
        },
        VALID_CREDENTIALS
      );
      expect.fail('Should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(PACError);
      expect((error as PACError).code).toBe('CANCEL_REQUIRES_FOLIO_SUSTITUCION');
    }
  });

  it('should include folioSustitucion when provided', async () => {
    mockFetch.mockResolvedValueOnce({
      json: async () => AUTH_SUCCESS_RESPONSE,
    });

    mockFetch.mockResolvedValueOnce({
      json: async () => ({
        status: 'success',
        data: { status: 'cancelled', acuse: '<xml/>' },
      }),
    });

    const provider = new SWProvider();
    await provider.cancel(
      {
        uuid: '05c519de-6d20-4258-88fb-c69a5970e927',
        issuerRfc: 'ABC123456789',
        motivo: '01',
        folioSustitucion: 'replacement-uuid',
        orgId: 'org-123',
      },
      VALID_CREDENTIALS
    );

    const cancelCall = mockFetch.mock.calls[1];
    const body = JSON.parse(cancelCall[1].body);
    expect(body.motivo).toBe('01');
    expect(body.folioSustitucion).toBe('replacement-uuid');
  });
});

// ============================================================================
// Query Status Tests
// ============================================================================

describe('SWProvider.queryStatus', () => {
  it('should return unknown (placeholder implementation)', async () => {
    const provider = new SWProvider();
    const status = await provider.queryStatus(
      '05c519de-6d20-4258-88fb-c69a5970e927',
      'ABC123456789',
      VALID_CREDENTIALS
    );

    expect(status).toBe('unknown');
  });
});

// ============================================================================
// Token Cache Tests
// ============================================================================

describe('SWProvider token cache', () => {
  it('should clear token cache', async () => {
    mockFetch.mockResolvedValueOnce({
      json: async () => AUTH_SUCCESS_RESPONSE,
    });

    const provider = new SWProvider();
    await provider.authenticate(VALID_CREDENTIALS, 'org-123');

    // Verify cached
    expect(SWProvider.getCachedToken('org-123', 'sandbox')).toBeDefined();

    // Clear
    SWProvider.clearTokenCache();

    // Verify cleared
    expect(SWProvider.getCachedToken('org-123', 'sandbox')).toBeUndefined();
  });
});
