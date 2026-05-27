/**
 * Banxico SIE API Client (FIX-3.1)
 *
 * Fetches exchange rates from Banco de México SIE (Sistema de Información Económica).
 *
 * Key series:
 * - SF43718: Fix USD/MXN rate (FIX - for accounting)
 * - SF46410: DOF published rate
 *
 * API docs: https://www.banxico.org.mx/SieAPIRest/service/v1/
 */

export interface BanxicoRate {
  date: string;      // YYYY-MM-DD
  rate: number;
  series: string;
}

const BANXICO_API_BASE = 'https://www.banxico.org.mx/SieAPIRest/service/v1';

/** FIX rate series */
export const SERIES_USD_FIX = 'SF43718';
/** DOF published rate series */
export const SERIES_USD_DOF = 'SF46410';

/**
 * Fetches a Banxico exchange rate for a date range.
 *
 * @param series - Banxico series ID (e.g., SF43718 for USD FIX)
 * @param startDate - YYYY-MM-DD
 * @param endDate - YYYY-MM-DD
 * @param token - Banxico API token (Bmx-Token header)
 */
export async function fetchBanxicoRate(
  series: string,
  startDate: string,
  endDate: string,
  token: string
): Promise<BanxicoRate[]> {
  const url = `${BANXICO_API_BASE}/series/${series}/datos/${startDate}/${endDate}`;

  const response = await fetch(url, {
    headers: {
      'Bmx-Token': token,
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`Banxico API error: ${response.status} ${response.statusText}`);
  }

  const body = await response.json() as {
    bmx?: {
      series?: Array<{
        idSerie: string;
        datos?: Array<{ fecha: string; dato: string }>;
      }>;
    };
  };

  const seriesData = body?.bmx?.series?.[0];
  if (!seriesData?.datos) {
    return [];
  }

  return seriesData.datos
    .filter(d => d.dato !== 'N/E')
    .map(d => ({
      date: parseBanxicoDate(d.fecha),
      rate: parseFloat(d.dato),
      series,
    }));
}

/**
 * Fetches the USD/MXN FIX rate for a specific date.
 * Returns null if no rate available for that date (e.g., weekends/holidays).
 */
export async function fetchUsdFixRate(
  date: string,
  token: string
): Promise<BanxicoRate | null> {
  const rates = await fetchBanxicoRate(SERIES_USD_FIX, date, date, token);
  return rates[0] ?? null;
}

/**
 * Parses Banxico date format (DD/MM/YYYY) to ISO (YYYY-MM-DD).
 */
function parseBanxicoDate(banxicoDate: string): string {
  const parts = banxicoDate.split('/');
  if (parts.length !== 3) return banxicoDate;
  return `${parts[2]}-${parts[1]!.padStart(2, '0')}-${parts[0]!.padStart(2, '0')}`;
}
