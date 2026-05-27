/**
 * Exchange Rate Service (FIX-3.1)
 *
 * 3-tier exchange rate resolution:
 * 1. CFDI TipoCambio (from the document itself)
 * 2. Manual override (per organization)
 * 3. Banxico FIX rate (from database cache)
 *
 * The Banxico cache is populated by a nightly background worker.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { ExchangeRate } from '../types';
import { AccountingError } from '../errors';
import { getCachedRate, persistRate } from './repository';

export interface ResolveRateOptions {
  currencyFrom: string;
  currencyTo?: string;
  date: string;
  organizationId: string;
  /** Rate from CFDI document (tier 1 — highest priority) */
  cfdiRate?: number;
}

export interface ResolvedRate {
  rate: number;
  source: 'cfdi' | 'manual' | 'banxico_fix';
  sourceReference?: string;
}

/**
 * Resolves an exchange rate using the 3-tier hierarchy.
 *
 * Tier 1: CFDI TipoCambio — passed directly from the source document
 * Tier 2: Manual override — org-specific rate stored with source='manual'
 * Tier 3: Banxico FIX — cached from nightly fetch (source='banxico_fix')
 *
 * Returns the rate or throws if no rate available.
 */
export async function resolveExchangeRate(
  options: ResolveRateOptions,
  supabase: SupabaseClient
): Promise<ResolvedRate> {
  const { currencyFrom, currencyTo = 'MXN', date, organizationId, cfdiRate } = options;

  // MXN to MXN is always 1.0
  if (currencyFrom === currencyTo) {
    return { rate: 1.0, source: 'cfdi' };
  }

  // Tier 1: CFDI rate
  if (cfdiRate && cfdiRate > 0) {
    return {
      rate: cfdiRate,
      source: 'cfdi',
      sourceReference: 'CFDI TipoCambio',
    };
  }

  // Tier 2: Manual org-specific rate
  const manualRate = await getCachedRate(currencyFrom, currencyTo, date, supabase);
  if (manualRate && manualRate.source === 'manual' && manualRate.organizationId === organizationId) {
    return {
      rate: manualRate.rate,
      source: 'manual',
      sourceReference: manualRate.sourceReference,
    };
  }

  // Tier 3: Banxico FIX (from cache)
  const banxicoRate = await getCachedRate(currencyFrom, currencyTo, date, supabase);
  if (banxicoRate) {
    return {
      rate: banxicoRate.rate,
      source: 'banxico_fix',
      sourceReference: banxicoRate.sourceReference,
    };
  }

  throw new AccountingError(
    'EXCHANGE_RATE_NOT_FOUND',
    `No exchange rate found for ${currencyFrom}/${currencyTo} on or before ${date}. ` +
      `Ensure Banxico rates are being fetched or set a manual rate.`
  );
}

/**
 * Stores a manual exchange rate for an organization.
 */
export async function setManualRate(
  params: {
    currencyFrom: string;
    currencyTo?: string;
    date: string;
    rate: number;
    organizationId: string;
    userId: string;
    reference?: string;
  },
  supabase: SupabaseClient
): Promise<ExchangeRate> {
  return persistRate(
    {
      currencyFrom: params.currencyFrom,
      currencyTo: params.currencyTo ?? 'MXN',
      rateDate: params.date,
      rate: params.rate,
      source: 'manual',
      sourceReference: params.reference ?? 'Manual entry',
      organizationId: params.organizationId,
      createdBy: params.userId,
    },
    supabase
  );
}

/**
 * Stores a Banxico FIX rate in the cache (called by background worker).
 */
export async function cacheBanxicoRate(
  params: {
    currencyFrom: string;
    currencyTo?: string;
    date: string;
    rate: number;
    sourceReference?: string;
  },
  supabase: SupabaseClient
): Promise<ExchangeRate> {
  return persistRate(
    {
      currencyFrom: params.currencyFrom,
      currencyTo: params.currencyTo ?? 'MXN',
      rateDate: params.date,
      rate: params.rate,
      source: 'banxico_fix',
      sourceReference: params.sourceReference ?? 'Banxico SIE SF43718',
    },
    supabase
  );
}
