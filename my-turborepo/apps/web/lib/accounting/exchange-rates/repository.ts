/**
 * Exchange Rate Repository (FIX-3.1)
 *
 * Database operations for exchange rates.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { ExchangeRate, RateSource } from '../types';
import { mapRowToExchangeRate } from '../mappers';

/**
 * Find the most recent rate for a currency pair on or before a given date.
 */
export async function getCachedRate(
  currencyFrom: string,
  currencyTo: string,
  date: string,
  supabase: SupabaseClient
): Promise<ExchangeRate | null> {
  const { data, error } = await supabase
    .from('exchange_rates')
    .select('*')
    .eq('currency_from', currencyFrom)
    .eq('currency_to', currencyTo)
    .lte('rate_date', date)
    .order('rate_date', { ascending: false })
    .order('source', { ascending: true }) // cfdi < banxico_fix < dof < manual (enum order)
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  return mapRowToExchangeRate(data);
}

/**
 * Find a rate for a specific date and source.
 */
export async function getRateByDateAndSource(
  currencyFrom: string,
  currencyTo: string,
  date: string,
  source: RateSource,
  supabase: SupabaseClient
): Promise<ExchangeRate | null> {
  const { data, error } = await supabase
    .from('exchange_rates')
    .select('*')
    .eq('currency_from', currencyFrom)
    .eq('currency_to', currencyTo)
    .eq('rate_date', date)
    .eq('source', source)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  return mapRowToExchangeRate(data);
}

/**
 * Persist an exchange rate (upsert by currency pair + date + source).
 */
export async function persistRate(
  rate: {
    currencyFrom: string;
    currencyTo: string;
    rateDate: string;
    rate: number;
    source: RateSource;
    sourceReference?: string;
    organizationId?: string;
    createdBy?: string;
  },
  supabase: SupabaseClient
): Promise<ExchangeRate> {
  const { data, error } = await supabase
    .from('exchange_rates')
    .upsert(
      {
        currency_from: rate.currencyFrom,
        currency_to: rate.currencyTo,
        rate_date: rate.rateDate,
        rate: rate.rate,
        source: rate.source,
        source_reference: rate.sourceReference,
        organization_id: rate.organizationId ?? null,
        created_by: rate.createdBy ?? null,
      },
      {
        onConflict: 'currency_from,currency_to,rate_date,source',
        ignoreDuplicates: false,
      }
    )
    .select()
    .single();

  if (error) throw error;

  return mapRowToExchangeRate(data);
}
