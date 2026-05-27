/**
 * Banxico Exchange Rate Fetch Worker (FIX-3.1)
 *
 * Nightly background job that fetches USD/MXN FIX rates from Banxico SIE API
 * and caches them in the exchange_rates table.
 *
 * Usage: Run via cron or scheduler — typically once per day after 12:00 CST
 * when Banxico publishes the FIX rate.
 */

import { createClient } from '@supabase/supabase-js';
import { fetchBanxicoRate, SERIES_USD_FIX } from '../lib/accounting/exchange-rates/banxico-client';
import { cacheBanxicoRate } from '../lib/accounting/exchange-rates/service';

const BANXICO_TOKEN = process.env.BANXICO_API_TOKEN;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

/**
 * Fetches the last N days of USD/MXN FIX rates and caches them.
 */
export async function fetchAndCacheRates(daysBack = 7): Promise<{ fetched: number; cached: number }> {
  if (!BANXICO_TOKEN) {
    console.warn('[banxico-fetch] BANXICO_API_TOKEN not set. Skipping.');
    return { fetched: 0, cached: 0 };
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    console.error('[banxico-fetch] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.');
    return { fetched: 0, cached: 0 };
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - daysBack);

  const startStr = startDate.toISOString().split('T')[0]!;
  const endStr = endDate.toISOString().split('T')[0]!;

  console.log(`[banxico-fetch] Fetching USD/MXN FIX rates from ${startStr} to ${endStr}...`);

  const rates = await fetchBanxicoRate(SERIES_USD_FIX, startStr, endStr, BANXICO_TOKEN);
  console.log(`[banxico-fetch] Fetched ${rates.length} rates from Banxico.`);

  let cached = 0;
  for (const rate of rates) {
    try {
      await cacheBanxicoRate(
        {
          currencyFrom: 'USD',
          currencyTo: 'MXN',
          date: rate.date,
          rate: rate.rate,
          sourceReference: `Banxico SIE ${rate.series}`,
        },
        supabase
      );
      cached++;
    } catch (err) {
      console.error(`[banxico-fetch] Failed to cache rate for ${rate.date}:`, err);
    }
  }

  console.log(`[banxico-fetch] Cached ${cached}/${rates.length} rates.`);
  return { fetched: rates.length, cached };
}

// Run if executed directly
const isMainModule = process.argv[1]?.endsWith('banxico-fetch.ts') || process.argv[1]?.endsWith('banxico-fetch.js');
if (isMainModule) {
  fetchAndCacheRates()
    .then(result => {
      console.log(`[banxico-fetch] Done: ${result.fetched} fetched, ${result.cached} cached.`);
      process.exit(0);
    })
    .catch(err => {
      console.error('[banxico-fetch] Fatal error:', err);
      process.exit(1);
    });
}
