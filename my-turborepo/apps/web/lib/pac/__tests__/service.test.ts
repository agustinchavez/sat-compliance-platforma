/**
 * PAC Service Tests (Component 15)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PACError } from '../errors';
import type { PACCredentials, StampRequest, StampResult } from '../types';

// ============================================================================
// Mocks - use vi.hoisted() for proper hoisting
// ============================================================================

const {
  mockFinkokStamp,
  mockFinkokCancel,
  mockFinkokQueryStatus,
  mockSWStamp,
  mockSWCancel,
  mockSWQueryStatus,
  mockCreateClient,
  mockDecryptData,
} = vi.hoisted(() => ({
  mockFinkokStamp: vi.fn(),
  mockFinkokCancel: vi.fn(),
  mockFinkokQueryStatus: vi.fn(),
  mockSWStamp: vi.fn(),
  mockSWCancel: vi.fn(),
  mockSWQueryStatus: vi.fn(),
  mockCreateClient: vi.fn(),
  mockDecryptData: vi.fn(),
}));

// Mock modules
vi.mock('@/lib/supabase/server', () => ({
  createClient: () => mockCreateClient(),
}));

vi.mock('@/lib/organizations/encryption', () => ({
  decryptData: (...args: unknown[]) => mockDecryptData(...args),
}));

vi.mock('../providers/finkok', () => {
  return {
    FinkokProvider: class MockFinkokProvider {
      stamp = mockFinkokStamp;
      cancel = mockFinkokCancel;
      queryStatus = mockFinkokQueryStatus;
    },
  };
});

vi.mock('../providers/sw', () => {
  return {
    SWProvider: class MockSWProvider {
      stamp = mockSWStamp;
      cancel = mockSWCancel;
      queryStatus = mockSWQueryStatus;
    },
  };
});

// Import after mocks are set up
import {
  getPACProvider,
  getPACCredentials,
  stampCFDI,
  cancelCFDI,
  isPACConfigured,
  getPACInfo,
} from '../service';
import { FinkokProvider } from '../providers/finkok';
import { SWProvider } from '../providers/sw';

// ============================================================================
// Test Fixtures
// ============================================================================

const VALID_STAMP_REQUEST: StampRequest = {
  signedXml: '<?xml version="1.0"?><cfdi:Comprobante/>',
  issuerRfc: 'ABC123456789',
  orgId: 'org-uuid-123',
};

const VALID_STAMP_RESULT: StampResult = {
  stampedXml: '<?xml version="1.0"?><cfdi:Comprobante><tfd/></cfdi:Comprobante>',
  uuid: '05c519de-6d20-4258-88fb-c69a5970e927',
  fechaTimbrado: '2024-03-01T10:00:00',
  rfcProvCertif: 'SPR190613I52',
  selloCFD: 'SelloCFD123',
  noCertificadoSAT: '30001000000400002495',
  selloSAT: 'SelloSAT456',
  pacProvider: 'finkok',
};

const FINKOK_DB_ROW = {
  id: 'cred-uuid',
  organization_id: 'org-uuid-123',
  provider: 'finkok',
  is_primary: true,
  environment: 'sandbox',
  finkok_username: 'testuser',
  finkok_password_encrypted: JSON.stringify({
    encryptedData: 'xxx',
    iv: 'yyy',
    authTag: 'zzz',
  }),
  sw_username: null,
  sw_password_encrypted: null,
  sw_token_encrypted: null,
  sw_token_expires_at: null,
};

const SW_DB_ROW = {
  id: 'cred-uuid-2',
  organization_id: 'org-uuid-456',
  provider: 'sw',
  is_primary: true,
  environment: 'production',
  finkok_username: null,
  finkok_password_encrypted: null,
  sw_username: 'test@example.com',
  sw_password_encrypted: JSON.stringify({
    encryptedData: 'aaa',
    iv: 'bbb',
    authTag: 'ccc',
  }),
  sw_token_encrypted: null,
  sw_token_expires_at: null,
};

// ============================================================================
// Setup
// ============================================================================

beforeEach(() => {
  vi.clearAllMocks();
  mockFinkokStamp.mockReset();
  mockFinkokCancel.mockReset();
  mockFinkokQueryStatus.mockReset();
  mockSWStamp.mockReset();
  mockSWCancel.mockReset();
  mockSWQueryStatus.mockReset();
  mockCreateClient.mockReset();
  mockDecryptData.mockReset();
});

// ============================================================================
// getPACProvider Tests
// ============================================================================

describe('getPACProvider', () => {
  it('should return FinkokProvider for finkok', () => {
    const credentials: PACCredentials = {
      provider: 'finkok',
      environment: 'sandbox',
      finkokUsername: 'test',
      finkokPassword: 'pass',
    };

    const provider = getPACProvider(credentials);

    // Verify we get a provider with the expected methods
    expect(provider).toBeDefined();
    expect(provider.stamp).toBeDefined();
    expect(provider.cancel).toBeDefined();
    expect(provider.queryStatus).toBeDefined();
  });

  it('should return SWProvider for sw', () => {
    const credentials: PACCredentials = {
      provider: 'sw',
      environment: 'sandbox',
      swUsername: 'test',
      swPassword: 'pass',
    };

    const provider = getPACProvider(credentials);

    // Verify we get a provider with the expected methods
    expect(provider).toBeDefined();
    expect(provider.stamp).toBeDefined();
    expect(provider.cancel).toBeDefined();
    expect(provider.queryStatus).toBeDefined();
  });

  it('should throw for unknown provider', () => {
    const credentials = {
      provider: 'unknown' as 'finkok',
      environment: 'sandbox' as const,
    };

    expect(() => getPACProvider(credentials)).toThrow(PACError);
  });
});

// ============================================================================
// getPACCredentials Tests
// ============================================================================

describe('getPACCredentials', () => {
  it('should query database and decrypt Finkok credentials', async () => {
    const mockSupabase = {
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: FINKOK_DB_ROW, error: null }),
    };

    mockCreateClient.mockReturnValue(mockSupabase);
    mockDecryptData.mockReturnValue('decrypted-password');

    const credentials = await getPACCredentials('org-uuid-123');

    expect(credentials.provider).toBe('finkok');
    expect(credentials.environment).toBe('sandbox');
    expect(credentials.finkokUsername).toBe('testuser');
    expect(credentials.finkokPassword).toBe('decrypted-password');
    expect(mockDecryptData).toHaveBeenCalled();
  });

  it('should query database and decrypt SW credentials', async () => {
    const mockSupabase = {
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: SW_DB_ROW, error: null }),
    };

    mockCreateClient.mockReturnValue(mockSupabase);
    mockDecryptData.mockReturnValue('decrypted-sw-password');

    const credentials = await getPACCredentials('org-uuid-456');

    expect(credentials.provider).toBe('sw');
    expect(credentials.environment).toBe('production');
    expect(credentials.swUsername).toBe('test@example.com');
    expect(credentials.swPassword).toBe('decrypted-sw-password');
  });

  it('should throw PAC_CREDENTIALS_NOT_FOUND when no credentials', async () => {
    const mockSupabase = {
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: { message: 'Not found' } }),
    };

    mockCreateClient.mockReturnValue(mockSupabase);

    try {
      await getPACCredentials('unknown-org');
      expect.fail('Should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(PACError);
      expect((error as PACError).code).toBe('PAC_CREDENTIALS_NOT_FOUND');
    }
  });
});

// ============================================================================
// stampCFDI Tests
// ============================================================================

describe('stampCFDI', () => {
  it('should call provider.stamp and return result', async () => {
    const mockSupabase = {
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: FINKOK_DB_ROW, error: null }),
    };

    mockCreateClient.mockReturnValue(mockSupabase);
    mockDecryptData.mockReturnValue('password');
    mockFinkokStamp.mockResolvedValue(VALID_STAMP_RESULT);

    const result = await stampCFDI(VALID_STAMP_REQUEST);

    expect(result.uuid).toBe(VALID_STAMP_RESULT.uuid);
    expect(mockFinkokStamp).toHaveBeenCalled();
  });

  it('should retry on retryable error and succeed', async () => {
    const mockSupabase = {
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: FINKOK_DB_ROW, error: null }),
    };

    mockCreateClient.mockReturnValue(mockSupabase);
    mockDecryptData.mockReturnValue('password');

    // First call fails with retryable error, second succeeds
    mockFinkokStamp
      .mockRejectedValueOnce(new PACError('PAC_NETWORK_ERROR', 'Connection failed', true))
      .mockResolvedValueOnce(VALID_STAMP_RESULT);

    const result = await stampCFDI(VALID_STAMP_REQUEST);

    expect(result.uuid).toBe(VALID_STAMP_RESULT.uuid);
    expect(mockFinkokStamp).toHaveBeenCalledTimes(2);
  });

  it('should NOT retry on non-retryable error', async () => {
    const mockSupabase = {
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: FINKOK_DB_ROW, error: null }),
    };

    mockCreateClient.mockReturnValue(mockSupabase);
    mockDecryptData.mockReturnValue('password');
    mockFinkokStamp.mockRejectedValue(new PACError('PAC_INVALID_XML', 'Bad XML', false));

    try {
      await stampCFDI(VALID_STAMP_REQUEST);
      expect.fail('Should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(PACError);
      expect((error as PACError).code).toBe('PAC_INVALID_XML');
      expect(mockFinkokStamp).toHaveBeenCalledTimes(1);
    }
  });

  it('should throw after MAX_RETRIES exhausted', async () => {
    const mockSupabase = {
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: FINKOK_DB_ROW, error: null }),
    };

    mockCreateClient.mockReturnValue(mockSupabase);
    mockDecryptData.mockReturnValue('password');
    mockFinkokStamp.mockRejectedValue(new PACError('PAC_NETWORK_ERROR', 'Connection failed', true));

    try {
      await stampCFDI(VALID_STAMP_REQUEST);
      expect.fail('Should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(PACError);
      expect((error as PACError).code).toBe('PAC_NETWORK_ERROR');
      expect(mockFinkokStamp).toHaveBeenCalledTimes(3);
    }
  }, 10000);
});

// ============================================================================
// cancelCFDI Tests
// ============================================================================

describe('cancelCFDI', () => {
  it('should call provider.cancel', async () => {
    const mockSupabase = {
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: FINKOK_DB_ROW, error: null }),
    };

    mockCreateClient.mockReturnValue(mockSupabase);
    mockDecryptData.mockReturnValue('password');
    mockFinkokCancel.mockResolvedValue({
      uuid: '05c519de-6d20-4258-88fb-c69a5970e927',
      estatusUUID: '201',
      acuse: '<xml/>',
      cancelled: true,
    });

    const result = await cancelCFDI({
      uuid: '05c519de-6d20-4258-88fb-c69a5970e927',
      issuerRfc: 'ABC123456789',
      motivo: '02',
      orgId: 'org-uuid-123',
    });

    expect(result.cancelled).toBe(true);
    expect(mockFinkokCancel).toHaveBeenCalled();
  });
});

// ============================================================================
// isPACConfigured Tests
// ============================================================================

describe('isPACConfigured', () => {
  it('should return true when credentials exist', async () => {
    const mockSupabase = {
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: FINKOK_DB_ROW, error: null }),
    };

    mockCreateClient.mockReturnValue(mockSupabase);
    mockDecryptData.mockReturnValue('password');

    const result = await isPACConfigured('org-uuid-123');

    expect(result).toBe(true);
  });

  it('should return false when no credentials', async () => {
    const mockSupabase = {
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: { message: 'Not found' } }),
    };

    mockCreateClient.mockReturnValue(mockSupabase);

    const result = await isPACConfigured('unknown-org');

    expect(result).toBe(false);
  });
});

// ============================================================================
// getPACInfo Tests
// ============================================================================

describe('getPACInfo', () => {
  it('should return provider and environment', async () => {
    const mockSupabase = {
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: FINKOK_DB_ROW, error: null }),
    };

    mockCreateClient.mockReturnValue(mockSupabase);
    mockDecryptData.mockReturnValue('password');

    const info = await getPACInfo('org-uuid-123');

    expect(info).toEqual({
      provider: 'finkok',
      environment: 'sandbox',
    });
  });

  it('should return null when no credentials', async () => {
    const mockSupabase = {
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: { message: 'Not found' } }),
    };

    mockCreateClient.mockReturnValue(mockSupabase);

    const info = await getPACInfo('unknown-org');

    expect(info).toBeNull();
  });
});
