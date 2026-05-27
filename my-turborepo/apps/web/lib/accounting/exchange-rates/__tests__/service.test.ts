/**
 * Exchange Rate Service Tests (FIX-3.1)
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';
import { resolveExchangeRate, setManualRate } from '../service';

// Mock repository
vi.mock('../repository', () => ({
  getCachedRate: vi.fn(),
  persistRate: vi.fn(),
}));

import { getCachedRate, persistRate } from '../repository';

const mockGetCachedRate = vi.mocked(getCachedRate);
const mockPersistRate = vi.mocked(persistRate);

const mockSupabase = {} as any;

beforeEach(() => {
  vi.clearAllMocks();
});

describe('resolveExchangeRate', () => {
  it('should return 1.0 for same currency (MXN to MXN)', async () => {
    const result = await resolveExchangeRate(
      { currencyFrom: 'MXN', currencyTo: 'MXN', date: '2026-01-15', organizationId: 'org-1' },
      mockSupabase
    );
    expect(result.rate).toBe(1.0);
    expect(result.source).toBe('cfdi');
  });

  it('should use CFDI rate as tier 1 (highest priority)', async () => {
    const result = await resolveExchangeRate(
      {
        currencyFrom: 'USD',
        date: '2026-01-15',
        organizationId: 'org-1',
        cfdiRate: 17.1234,
      },
      mockSupabase
    );
    expect(result.rate).toBe(17.1234);
    expect(result.source).toBe('cfdi');
  });

  it('should use manual rate as tier 2 when no CFDI rate', async () => {
    mockGetCachedRate.mockResolvedValueOnce({
      id: 'rate-1',
      currencyFrom: 'USD',
      currencyTo: 'MXN',
      rateDate: '2026-01-15',
      rate: 17.50,
      source: 'manual',
      sourceReference: 'Manual entry',
      organizationId: 'org-1',
      createdAt: '2026-01-15',
    });

    const result = await resolveExchangeRate(
      { currencyFrom: 'USD', date: '2026-01-15', organizationId: 'org-1' },
      mockSupabase
    );
    expect(result.rate).toBe(17.50);
    expect(result.source).toBe('manual');
  });

  it('should use Banxico FIX as tier 3 when no CFDI or manual rate', async () => {
    // First call (for manual check) returns banxico_fix rate
    mockGetCachedRate.mockResolvedValueOnce({
      id: 'rate-2',
      currencyFrom: 'USD',
      currencyTo: 'MXN',
      rateDate: '2026-01-14',
      rate: 17.3456,
      source: 'banxico_fix',
      sourceReference: 'Banxico SIE SF43718',
      createdAt: '2026-01-14',
    });
    // Second call returns same (Banxico)
    mockGetCachedRate.mockResolvedValueOnce({
      id: 'rate-2',
      currencyFrom: 'USD',
      currencyTo: 'MXN',
      rateDate: '2026-01-14',
      rate: 17.3456,
      source: 'banxico_fix',
      sourceReference: 'Banxico SIE SF43718',
      createdAt: '2026-01-14',
    });

    const result = await resolveExchangeRate(
      { currencyFrom: 'USD', date: '2026-01-15', organizationId: 'org-1' },
      mockSupabase
    );
    expect(result.rate).toBe(17.3456);
    expect(result.source).toBe('banxico_fix');
  });

  it('should throw when no rate available at any tier', async () => {
    mockGetCachedRate.mockResolvedValue(null);

    await expect(
      resolveExchangeRate(
        { currencyFrom: 'USD', date: '2026-01-15', organizationId: 'org-1' },
        mockSupabase
      )
    ).rejects.toThrow(/No exchange rate found/);
  });

  it('should ignore CFDI rate of 0', async () => {
    mockGetCachedRate.mockResolvedValue(null);

    await expect(
      resolveExchangeRate(
        { currencyFrom: 'USD', date: '2026-01-15', organizationId: 'org-1', cfdiRate: 0 },
        mockSupabase
      )
    ).rejects.toThrow(/No exchange rate found/);
  });
});

describe('setManualRate', () => {
  it('should persist a manual rate', async () => {
    const expected = {
      id: 'rate-new',
      currencyFrom: 'USD',
      currencyTo: 'MXN',
      rateDate: '2026-01-15',
      rate: 17.50,
      source: 'manual' as const,
      sourceReference: 'Tipo de cambio del día',
      organizationId: 'org-1',
      createdAt: '2026-01-15',
      createdBy: 'user-1',
    };
    mockPersistRate.mockResolvedValueOnce(expected);

    const result = await setManualRate(
      {
        currencyFrom: 'USD',
        date: '2026-01-15',
        rate: 17.50,
        organizationId: 'org-1',
        userId: 'user-1',
        reference: 'Tipo de cambio del día',
      },
      mockSupabase
    );

    expect(mockPersistRate).toHaveBeenCalledWith(
      expect.objectContaining({
        currencyFrom: 'USD',
        currencyTo: 'MXN',
        rate: 17.50,
        source: 'manual',
      }),
      mockSupabase
    );
    expect(result.id).toBe('rate-new');
  });
});
