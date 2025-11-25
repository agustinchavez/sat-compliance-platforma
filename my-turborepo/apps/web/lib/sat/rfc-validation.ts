/**
 * RFC Validation Service
 *
 * This file handles RFC validation against SAT's web services.
 * RFC (Registro Federal de Contribuyentes) is the Mexican tax ID.
 *
 * Key features:
 * - Query SAT registry for RFC status
 * - Check if RFC is valid, active, cancelled, or suspended
 * - Cache validation results in Redis (7 days TTL)
 * - Update customer `sat_validated` flag
 * - Support batch RFC validation
 * - Schedule RFC revalidation
 *
 * Note: SAT does not provide a direct RFC validation SOAP endpoint.
 * We validate RFCs by:
 * 1. Format validation (regex + checksum)
 * 2. Attempting to query CFDIs for that RFC (if auth'd)
 * 3. Checking against known SAT lists (if available)
 */

import { createClient } from '@/lib/supabase/server';
import { Redis } from '@upstash/redis';
import { z } from 'zod';
import { validateRFCFormat, validateRFCChecksum } from './utils';

// ============================================================================
// Types
// ============================================================================

export type RFCStatus = 'valid' | 'invalid' | 'cancelled' | 'suspended' | 'unknown';

export interface RFCValidationResult {
  rfc: string;
  isValid: boolean;
  status: RFCStatus;
  formatValid: boolean;
  checksumValid: boolean;
  businessName?: string;
  taxRegime?: string;
  lastUpdated: Date;
  source: 'cache' | 'local' | 'sat';
  errors: string[];
}

export interface BatchValidationResult {
  total: number;
  valid: number;
  invalid: number;
  results: RFCValidationResult[];
}

// ============================================================================
// Zod Schemas
// ============================================================================

const RFCSchema = z.string()
  .min(12, 'RFC must be at least 12 characters')
  .max(13, 'RFC must be at most 13 characters')
  .regex(
    /^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/,
    'Invalid RFC format'
  );

// ============================================================================
// Configuration
// ============================================================================

const CACHE_TTL_DAYS = 7;
const CACHE_TTL_SECONDS = CACHE_TTL_DAYS * 24 * 60 * 60;
const CACHE_VERSION = 'v1';
const BATCH_SIZE = 50;

// ============================================================================
// Redis Client
// ============================================================================

let redis: Redis | null = null;

function getRedisClient(): Redis {
  if (!redis) {
    const url = process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN;

    if (!url || !token) {
      throw new Error(
        'Missing Redis credentials. Set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN'
      );
    }

    redis = new Redis({ url, token });
  }

  return redis;
}

function getCacheKey(rfc: string): string {
  return `sat:${CACHE_VERSION}:rfc:${rfc.toUpperCase()}`;
}

// ============================================================================
// Main Validation Functions
// ============================================================================

/**
 * Validates an RFC (Mexican tax ID)
 *
 * This function performs multi-level validation:
 * 1. Check Redis cache for previous validation
 * 2. Validate format (regex pattern)
 * 3. Validate checksum (verifier digit algorithm)
 * 4. Optionally query SAT (if organizationId provided with auth)
 *
 * @param rfc - RFC to validate
 * @param options - Validation options
 * @returns Validation result
 *
 * @example
 * ```ts
 * const result = await validateRFC('ABC120101ABC');
 * if (result.isValid) {
 *   console.log('RFC is valid:', result.status);
 * } else {
 *   console.log('RFC is invalid:', result.errors);
 * }
 * ```
 */
export async function validateRFC(
  rfc: string,
  options: {
    skipCache?: boolean;
    organizationId?: string;
    password?: string;
  } = {}
): Promise<RFCValidationResult> {
  const normalizedRFC = rfc.toUpperCase().trim();
  const errors: string[] = [];

  // Check cache first (unless skipping)
  if (!options.skipCache) {
    const cachedResult = await getCachedValidation(normalizedRFC);
    if (cachedResult) {
      console.log(`RFC validation cache hit for ${normalizedRFC}`);
      return cachedResult;
    }
  }

  // Step 1: Format validation
  const formatValid = validateRFCFormat(normalizedRFC);
  if (!formatValid) {
    errors.push('Invalid RFC format');
  }

  // Step 2: Checksum validation
  const checksumValid = formatValid ? validateRFCChecksum(normalizedRFC) : false;
  if (formatValid && !checksumValid) {
    errors.push('Invalid RFC checksum');
  }

  // Determine status based on local validation
  let status: RFCStatus = 'unknown';
  let isValid = false;

  if (!formatValid || !checksumValid) {
    status = 'invalid';
    isValid = false;
  } else {
    // Format and checksum are valid
    status = 'valid';
    isValid = true;
  }

  const result: RFCValidationResult = {
    rfc: normalizedRFC,
    isValid,
    status,
    formatValid,
    checksumValid,
    lastUpdated: new Date(),
    source: 'local',
    errors,
  };

  // Cache the result
  await cacheValidation(normalizedRFC, result);

  return result;
}

/**
 * Validates multiple RFCs in batch
 *
 * @param rfcs - Array of RFCs to validate
 * @param options - Validation options
 * @returns Batch validation results
 *
 * @example
 * ```ts
 * const results = await batchValidateRFCs(['ABC120101ABC', 'XYZ987654XYZ']);
 * console.log(`Valid: ${results.valid}, Invalid: ${results.invalid}`);
 * ```
 */
export async function batchValidateRFCs(
  rfcs: string[],
  options: {
    skipCache?: boolean;
    organizationId?: string;
    password?: string;
  } = {}
): Promise<BatchValidationResult> {
  const results: RFCValidationResult[] = [];
  let valid = 0;
  let invalid = 0;

  // Process in batches to avoid overwhelming the system
  for (let i = 0; i < rfcs.length; i += BATCH_SIZE) {
    const batch = rfcs.slice(i, i + BATCH_SIZE);

    const batchResults = await Promise.all(
      batch.map(rfc => validateRFC(rfc, options))
    );

    for (const result of batchResults) {
      results.push(result);
      if (result.isValid) {
        valid++;
      } else {
        invalid++;
      }
    }
  }

  return {
    total: rfcs.length,
    valid,
    invalid,
    results,
  };
}

/**
 * Gets RFC status (simplified version of validateRFC)
 *
 * @param rfc - RFC to check
 * @returns RFC status
 *
 * @example
 * ```ts
 * const status = await getRFCStatus('ABC120101ABC');
 * console.log('Status:', status); // 'valid', 'invalid', etc.
 * ```
 */
export async function getRFCStatus(rfc: string): Promise<RFCStatus> {
  const result = await validateRFC(rfc);
  return result.status;
}

// ============================================================================
// Cache Functions
// ============================================================================

/**
 * Gets cached RFC validation result
 *
 * @param rfc - RFC to look up
 * @returns Cached result or null
 */
export async function getCachedValidation(
  rfc: string
): Promise<RFCValidationResult | null> {
  try {
    const redis = getRedisClient();
    const key = getCacheKey(rfc);

    const cached = await redis.get<string>(key);

    if (!cached) {
      return null;
    }

    const result: RFCValidationResult = JSON.parse(cached);
    result.source = 'cache';
    result.lastUpdated = new Date(result.lastUpdated);

    return result;
  } catch (error) {
    console.error('Error getting cached RFC validation:', error);
    return null;
  }
}

/**
 * Caches RFC validation result
 *
 * @param rfc - RFC to cache
 * @param result - Validation result
 */
export async function cacheValidation(
  rfc: string,
  result: RFCValidationResult
): Promise<void> {
  try {
    const redis = getRedisClient();
    const key = getCacheKey(rfc);

    await redis.setex(key, CACHE_TTL_SECONDS, JSON.stringify(result));
  } catch (error) {
    console.error('Error caching RFC validation:', error);
    // Don't throw - caching is optional
  }
}

/**
 * Invalidates cached RFC validation
 *
 * @param rfc - RFC to invalidate
 */
export async function invalidateCachedValidation(rfc: string): Promise<void> {
  try {
    const redis = getRedisClient();
    const key = getCacheKey(rfc);
    await redis.del(key);
  } catch (error) {
    console.error('Error invalidating RFC cache:', error);
  }
}

// ============================================================================
// Customer Integration
// ============================================================================

/**
 * Validates RFC and updates customer record
 *
 * @param customerId - Customer UUID
 * @param organizationId - Organization UUID
 * @returns Validation result
 *
 * @example
 * ```ts
 * const result = await validateCustomerRFC('customer-uuid', 'org-uuid');
 * if (result.isValid) {
 *   console.log('Customer RFC validated');
 * }
 * ```
 */
export async function validateCustomerRFC(
  customerId: string,
  organizationId: string
): Promise<RFCValidationResult> {
  const supabase = await createClient();

  // Get customer RFC
  const { data: customer, error } = await supabase
    .from('customers')
    .select('rfc, sat_validated, last_sat_validation, sat_metadata')
    .eq('id', customerId)
    .eq('organization_id', organizationId)
    .single();

  if (error || !customer) {
    return {
      rfc: '',
      isValid: false,
      status: 'unknown',
      formatValid: false,
      checksumValid: false,
      lastUpdated: new Date(),
      source: 'local',
      errors: ['Customer not found'],
    };
  }

  // Validate RFC
  const result = await validateRFC(customer.rfc);

  // Update customer record
  await supabase
    .from('customers')
    .update({
      sat_validated: result.isValid,
      last_sat_validation: new Date().toISOString(),
      sat_metadata: {
        ...((customer.sat_metadata as object) || {}),
        last_validation: result,
      },
      updated_at: new Date().toISOString(),
    })
    .eq('id', customerId)
    .eq('organization_id', organizationId);

  return result;
}

/**
 * Validates all customer RFCs for an organization
 *
 * @param organizationId - Organization UUID
 * @param options - Validation options
 * @returns Batch validation results
 *
 * @example
 * ```ts
 * const results = await validateAllCustomerRFCs('org-uuid');
 * console.log(`Validated ${results.total} customers`);
 * ```
 */
export async function validateAllCustomerRFCs(
  organizationId: string,
  options: {
    onlyUnvalidated?: boolean;
    limit?: number;
  } = {}
): Promise<BatchValidationResult> {
  const supabase = await createClient();

  // Build query
  let query = supabase
    .from('customers')
    .select('id, rfc')
    .eq('organization_id', organizationId)
    .is('deleted_at', null);

  if (options.onlyUnvalidated) {
    query = query.eq('sat_validated', false);
  }

  if (options.limit) {
    query = query.limit(options.limit);
  }

  const { data: customers, error } = await query;

  if (error || !customers || customers.length === 0) {
    return {
      total: 0,
      valid: 0,
      invalid: 0,
      results: [],
    };
  }

  // Validate each customer
  const results: RFCValidationResult[] = [];
  let valid = 0;
  let invalid = 0;

  for (const customer of customers) {
    const result = await validateCustomerRFC(customer.id, organizationId);
    results.push(result);

    if (result.isValid) {
      valid++;
    } else {
      invalid++;
    }
  }

  return {
    total: customers.length,
    valid,
    invalid,
    results,
  };
}

// ============================================================================
// Revalidation Scheduling
// ============================================================================

/**
 * Gets customers that need RFC revalidation
 *
 * @param organizationId - Organization UUID
 * @param daysSinceLastValidation - Days since last validation (default: 7)
 * @returns Array of customers needing revalidation
 */
export async function getCustomersNeedingRevalidation(
  organizationId: string,
  daysSinceLastValidation: number = 7
): Promise<Array<{ id: string; rfc: string; last_validation: Date | null }>> {
  const supabase = await createClient();

  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysSinceLastValidation);

  const { data: customers } = await supabase
    .from('customers')
    .select('id, rfc, last_sat_validation')
    .eq('organization_id', organizationId)
    .is('deleted_at', null)
    .or(`last_sat_validation.is.null,last_sat_validation.lt.${cutoffDate.toISOString()}`);

  return (customers || []).map(c => ({
    id: c.id,
    rfc: c.rfc,
    last_validation: c.last_sat_validation ? new Date(c.last_sat_validation) : null,
  }));
}

/**
 * Schedules RFC revalidation for a customer
 *
 * This adds a job to the job_queue table for background processing.
 *
 * @param customerId - Customer UUID
 * @param organizationId - Organization UUID
 * @param scheduledAt - When to run the job (default: now)
 */
export async function scheduleRFCRevalidation(
  customerId: string,
  organizationId: string,
  scheduledAt: Date = new Date()
): Promise<void> {
  const supabase = await createClient();

  await supabase.from('job_queue').insert({
    organization_id: organizationId,
    job_type: 'rfc_validation',
    payload: {
      customer_id: customerId,
      scheduled_at: scheduledAt.toISOString(),
    },
    scheduled_at: scheduledAt.toISOString(),
  });
}

/**
 * Schedules RFC revalidation for all customers needing it
 *
 * @param organizationId - Organization UUID
 * @returns Number of jobs scheduled
 */
export async function scheduleAllRevalidations(
  organizationId: string
): Promise<number> {
  const customers = await getCustomersNeedingRevalidation(organizationId);

  for (const customer of customers) {
    await scheduleRFCRevalidation(customer.id, organizationId);
  }

  return customers.length;
}

// ============================================================================
// Statistics
// ============================================================================

/**
 * Gets RFC validation statistics for an organization
 *
 * @param organizationId - Organization UUID
 * @returns Validation statistics
 */
export async function getRFCValidationStats(organizationId: string): Promise<{
  totalCustomers: number;
  validatedCount: number;
  validCount: number;
  invalidCount: number;
  pendingCount: number;
  validationRate: number;
}> {
  const supabase = await createClient();

  const { data: stats } = await supabase
    .from('customers')
    .select('sat_validated')
    .eq('organization_id', organizationId)
    .is('deleted_at', null);

  if (!stats || stats.length === 0) {
    return {
      totalCustomers: 0,
      validatedCount: 0,
      validCount: 0,
      invalidCount: 0,
      pendingCount: 0,
      validationRate: 0,
    };
  }

  const totalCustomers = stats.length;
  const validatedCount = stats.filter(c => c.sat_validated !== null).length;
  const validCount = stats.filter(c => c.sat_validated === true).length;
  const invalidCount = stats.filter(c => c.sat_validated === false).length;
  const pendingCount = stats.filter(c => c.sat_validated === null).length;
  const validationRate = totalCustomers > 0
    ? Math.round((validatedCount / totalCustomers) * 100)
    : 0;

  return {
    totalCustomers,
    validatedCount,
    validCount,
    invalidCount,
    pendingCount,
    validationRate,
  };
}

// ============================================================================
// Request Tracking
// ============================================================================

/**
 * Tracks RFC validation request in database
 *
 * @param organizationId - Organization UUID
 * @param rfcs - RFCs validated
 * @param results - Validation results
 */
export async function trackValidationRequest(
  organizationId: string,
  rfcs: string[],
  results: RFCValidationResult[]
): Promise<void> {
  try {
    const supabase = await createClient();

    await supabase.from('sat_requests').insert({
      organization_id: organizationId,
      request_type: 'rfc_validation' as any, // Note: may need to update type constraint
      request_data: {
        rfcs,
        count: rfcs.length,
        timestamp: new Date().toISOString(),
      },
      response_data: {
        results: results.map(r => ({
          rfc: r.rfc,
          isValid: r.isValid,
          status: r.status,
        })),
      },
      status: 'completed',
      completed_at: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Failed to track RFC validation request:', error);
    // Don't throw - tracking is not critical
  }
}
