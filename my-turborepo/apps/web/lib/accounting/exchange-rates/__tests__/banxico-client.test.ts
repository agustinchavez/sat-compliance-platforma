/**
 * Banxico SIE Client Tests (FIX-3.1)
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fetchBanxicoRate, fetchUsdFixRate, SERIES_USD_FIX } from '../banxico-client';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('fetchBanxicoRate', () => {
  it('should parse Banxico API response into BanxicoRate[]', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        bmx: {
          series: [
            {
              idSerie: SERIES_USD_FIX,
              datos: [
                { fecha: '15/01/2026', dato: '17.1234' },
                { fecha: '16/01/2026', dato: '17.2345' },
              ],
            },
          ],
        },
      }),
    });

    const rates = await fetchBanxicoRate(SERIES_USD_FIX, '2026-01-15', '2026-01-16', 'test-token');
    expect(rates).toHaveLength(2);
    expect(rates[0]!.date).toBe('2026-01-15');
    expect(rates[0]!.rate).toBe(17.1234);
    expect(rates[1]!.date).toBe('2026-01-16');
    expect(rates[1]!.rate).toBe(17.2345);
  });

  it('should filter out N/E (not available) entries', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        bmx: {
          series: [
            {
              idSerie: SERIES_USD_FIX,
              datos: [
                { fecha: '17/01/2026', dato: 'N/E' },
                { fecha: '18/01/2026', dato: '17.3456' },
              ],
            },
          ],
        },
      }),
    });

    const rates = await fetchBanxicoRate(SERIES_USD_FIX, '2026-01-17', '2026-01-18', 'test-token');
    expect(rates).toHaveLength(1);
    expect(rates[0]!.date).toBe('2026-01-18');
  });

  it('should throw on non-OK response', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 401, statusText: 'Unauthorized' });

    await expect(
      fetchBanxicoRate(SERIES_USD_FIX, '2026-01-15', '2026-01-15', 'bad-token')
    ).rejects.toThrow(/Banxico API error: 401/);
  });

  it('should return empty array for empty series data', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ bmx: { series: [{ idSerie: SERIES_USD_FIX }] } }),
    });

    const rates = await fetchBanxicoRate(SERIES_USD_FIX, '2026-01-15', '2026-01-15', 'test-token');
    expect(rates).toHaveLength(0);
  });

  it('should include Bmx-Token header in requests', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ bmx: { series: [] } }),
    });

    await fetchBanxicoRate(SERIES_USD_FIX, '2026-01-15', '2026-01-15', 'my-api-token');

    expect(mockFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({ 'Bmx-Token': 'my-api-token' }),
      })
    );
  });
});

describe('fetchUsdFixRate', () => {
  it('should return a single rate for a specific date', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        bmx: {
          series: [
            {
              idSerie: SERIES_USD_FIX,
              datos: [{ fecha: '15/01/2026', dato: '17.1234' }],
            },
          ],
        },
      }),
    });

    const rate = await fetchUsdFixRate('2026-01-15', 'test-token');
    expect(rate).not.toBeNull();
    expect(rate!.rate).toBe(17.1234);
  });

  it('should return null when no rate for that date', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        bmx: { series: [{ idSerie: SERIES_USD_FIX, datos: [{ fecha: '18/01/2026', dato: 'N/E' }] }] },
      }),
    });

    const rate = await fetchUsdFixRate('2026-01-18', 'test-token');
    expect(rate).toBeNull();
  });
});
