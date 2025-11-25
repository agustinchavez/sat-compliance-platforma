/**
 * SAT Redis Cache Layer
 *
 * Caches SAT authentication tokens and other temporary data
 * - Auth tokens: 5 minutes (matches SAT token expiry)
 * - Rate limit counters: 24 hours
 * - Download request status: 1 hour
 */

import { Redis } from '@upstash/redis';
import type { SATAuthToken, CacheEntry } from './types';
import { getRateLimitKey, getRateLimitTTL, calculateRateLimitReset } from './utils';

// ============================================================================
// Redis Client
// ============================================================================

let redis: Redis | null = null;

/**
 * Get Redis client (lazy initialization)
 */
function getRedisClient(): Redis {
  if (!redis) {
    const url = process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN;

    if (!url || !token) {
      throw new Error(
        'Missing Redis credentials. Set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN'
      );
    }

    redis = new Redis({
      url,
      token,
    });
  }

  return redis;
}

// ============================================================================
// Cache Configuration
// ============================================================================

const CACHE_TTL = {
  AUTH_TOKEN: 300, // 5 minutes (SAT tokens expire in 5 minutes)
  RATE_LIMIT: 86400, // 24 hours
  DOWNLOAD_STATUS: 3600, // 1 hour
  CERTIFICATE_INFO: 86400, // 24 hours
};

const CACHE_VERSION = 'v1';

/**
 * Generate cache key with prefix
 */
function getCacheKey(prefix: string, ...parts: string[]): string {
  return `sat:${CACHE_VERSION}:${prefix}:${parts.join(':')}`;
}

// ============================================================================
// Authentication Token Cache
// ============================================================================

/**
 * Caches SAT authentication token
 *
 * @param organizationId - Organization UUID
 * @param token - SAT auth token
 * @returns Promise<void>
 *
 * @example
 * ```ts
 * await cacheAuthToken('org-uuid', {
 *   token: 'eyJhbG...',
 *   expiresAt: new Date(Date.now() + 300000),
 *   issuedAt: new Date(),
 *   organizationId: 'org-uuid',
 *   rfc: 'ABC120101ABC'
 * });
 * ```
 */
export async function cacheAuthToken(
  organizationId: string,
  token: SATAuthToken
): Promise<void> {
  try {
    const redis = getRedisClient();
    const key = getCacheKey('auth', organizationId);

    // Calculate TTL based on token expiry
    const now = new Date();
    const expiresAt = new Date(token.expiresAt);
    const ttl = Math.floor((expiresAt.getTime() - now.getTime()) / 1000);

    // Only cache if TTL is positive
    if (ttl > 0) {
      await redis.setex(key, ttl, JSON.stringify(token));
    }
  } catch (error) {
    console.error('Error caching auth token:', error);
    // Don't throw - cache is optional
  }
}

/**
 * Gets cached SAT authentication token
 *
 * @param organizationId - Organization UUID
 * @returns Cached token or null if not cached/expired
 *
 * @example
 * ```ts
 * const token = await getCachedAuthToken('org-uuid');
 * if (token) {
 *   console.log('Using cached token:', token.token);
 * }
 * ```
 */
export async function getCachedAuthToken(
  organizationId: string
): Promise<SATAuthToken | null> {
  try {
    const redis = getRedisClient();
    const key = getCacheKey('auth', organizationId);

    const cached = await redis.get<string>(key);

    if (!cached) {
      return null;
    }

    const token: SATAuthToken = JSON.parse(cached);

    // Double-check expiry
    const now = new Date();
    const expiresAt = new Date(token.expiresAt);

    if (expiresAt <= now) {
      await invalidateAuthToken(organizationId);
      return null;
    }

    return token;
  } catch (error) {
    console.error('Error getting cached auth token:', error);
    return null;
  }
}

/**
 * Invalidates cached authentication token
 *
 * @param organizationId - Organization UUID
 *
 * @example
 * ```ts
 * await invalidateAuthToken('org-uuid');
 * ```
 */
export async function invalidateAuthToken(organizationId: string): Promise<void> {
  try {
    const redis = getRedisClient();
    const key = getCacheKey('auth', organizationId);
    await redis.del(key);
  } catch (error) {
    console.error('Error invalidating auth token:', error);
  }
}

// ============================================================================
// Rate Limiting
// ============================================================================

/**
 * Increments rate limit counter for organization
 *
 * @param organizationId - Organization UUID
 * @returns Current count
 *
 * @example
 * ```ts
 * const count = await incrementRateLimit('org-uuid');
 * console.log('Requests today:', count);
 * ```
 */
export async function incrementRateLimit(organizationId: string): Promise<number> {
  try {
    const redis = getRedisClient();
    const key = getRateLimitKey(organizationId);

    // Increment counter
    const count = await redis.incr(key);

    // Set TTL only on first increment (when count = 1)
    if (count === 1) {
      const ttl = getRateLimitTTL();
      await redis.expire(key, ttl);
    }

    return count;
  } catch (error) {
    console.error('Error incrementing rate limit:', error);
    return 0;
  }
}

/**
 * Gets current rate limit count
 *
 * @param organizationId - Organization UUID
 * @returns Current count
 *
 * @example
 * ```ts
 * const count = await getRateLimitCount('org-uuid');
 * console.log('Requests today:', count);
 * ```
 */
export async function getRateLimitCount(organizationId: string): Promise<number> {
  try {
    const redis = getRedisClient();
    const key = getRateLimitKey(organizationId);

    const count = await redis.get<number>(key);
    return count || 0;
  } catch (error) {
    console.error('Error getting rate limit count:', error);
    return 0;
  }
}

/**
 * Checks if rate limit is exceeded
 *
 * @param organizationId - Organization UUID
 * @param limit - Rate limit (default: 500)
 * @returns true if exceeded
 *
 * @example
 * ```ts
 * const exceeded = await isRateLimitExceeded('org-uuid');
 * if (exceeded) {
 *   console.log('Rate limit exceeded!');
 * }
 * ```
 */
export async function isRateLimitExceeded(
  organizationId: string,
  limit: number = 500
): Promise<boolean> {
  const count = await getRateLimitCount(organizationId);
  return count >= limit;
}

/**
 * Gets rate limit status
 *
 * @param organizationId - Organization UUID
 * @param limit - Rate limit (default: 500)
 * @returns Rate limit status
 *
 * @example
 * ```ts
 * const status = await getRateLimitStatus('org-uuid');
 * console.log('Used:', status.used, 'Remaining:', status.remaining);
 * ```
 */
export async function getRateLimitStatus(
  organizationId: string,
  limit: number = 500
): Promise<{
  limit: number;
  used: number;
  remaining: number;
  resetAt: Date;
  exceeded: boolean;
}> {
  const used = await getRateLimitCount(organizationId);
  const remaining = Math.max(0, limit - used);
  const resetAt = calculateRateLimitReset();
  const exceeded = used >= limit;

  return {
    limit,
    used,
    remaining,
    resetAt,
    exceeded,
  };
}

/**
 * Resets rate limit counter (admin use only)
 *
 * @param organizationId - Organization UUID
 */
export async function resetRateLimit(organizationId: string): Promise<void> {
  try {
    const redis = getRedisClient();
    const key = getRateLimitKey(organizationId);
    await redis.del(key);
  } catch (error) {
    console.error('Error resetting rate limit:', error);
  }
}

// ============================================================================
// CFDI Download Status Cache
// ============================================================================

/**
 * Caches CFDI download request status
 *
 * @param requestId - Download request ID
 * @param status - Status data
 *
 * @example
 * ```ts
 * await cacheDownloadStatus('req-123', {
 *   status: 'processing',
 *   statusCode: 5001
 * });
 * ```
 */
export async function cacheDownloadStatus(
  requestId: string,
  status: any
): Promise<void> {
  try {
    const redis = getRedisClient();
    const key = getCacheKey('download', requestId);

    await redis.setex(
      key,
      CACHE_TTL.DOWNLOAD_STATUS,
      JSON.stringify(status)
    );
  } catch (error) {
    console.error('Error caching download status:', error);
  }
}

/**
 * Gets cached CFDI download status
 *
 * @param requestId - Download request ID
 * @returns Cached status or null
 */
export async function getCachedDownloadStatus(
  requestId: string
): Promise<any | null> {
  try {
    const redis = getRedisClient();
    const key = getCacheKey('download', requestId);

    const cached = await redis.get<string>(key);

    if (!cached) {
      return null;
    }

    return JSON.parse(cached);
  } catch (error) {
    console.error('Error getting cached download status:', error);
    return null;
  }
}

/**
 * Invalidates download status cache
 *
 * @param requestId - Download request ID
 */
export async function invalidateDownloadStatus(requestId: string): Promise<void> {
  try {
    const redis = getRedisClient();
    const key = getCacheKey('download', requestId);
    await redis.del(key);
  } catch (error) {
    console.error('Error invalidating download status:', error);
  }
}

// ============================================================================
// Certificate Info Cache
// ============================================================================

/**
 * Caches certificate information
 *
 * @param organizationId - Organization UUID
 * @param certInfo - Certificate info
 */
export async function cacheCertificateInfo(
  organizationId: string,
  certInfo: any
): Promise<void> {
  try {
    const redis = getRedisClient();
    const key = getCacheKey('cert', organizationId);

    await redis.setex(
      key,
      CACHE_TTL.CERTIFICATE_INFO,
      JSON.stringify(certInfo)
    );
  } catch (error) {
    console.error('Error caching certificate info:', error);
  }
}

/**
 * Gets cached certificate info
 *
 * @param organizationId - Organization UUID
 * @returns Cached cert info or null
 */
export async function getCachedCertificateInfo(
  organizationId: string
): Promise<any | null> {
  try {
    const redis = getRedisClient();
    const key = getCacheKey('cert', organizationId);

    const cached = await redis.get<string>(key);

    if (!cached) {
      return null;
    }

    return JSON.parse(cached);
  } catch (error) {
    console.error('Error getting cached certificate info:', error);
    return null;
  }
}

/**
 * Invalidates certificate info cache
 *
 * @param organizationId - Organization UUID
 */
export async function invalidateCertificateInfo(
  organizationId: string
): Promise<void> {
  try {
    const redis = getRedisClient();
    const key = getCacheKey('cert', organizationId);
    await redis.del(key);
  } catch (error) {
    console.error('Error invalidating certificate info:', error);
  }
}

// ============================================================================
// Cache Management
// ============================================================================

/**
 * Clears all SAT caches for an organization
 *
 * @param organizationId - Organization UUID
 *
 * @example
 * ```ts
 * await clearOrganizationCache('org-uuid');
 * ```
 */
export async function clearOrganizationCache(organizationId: string): Promise<void> {
  try {
    const redis = getRedisClient();

    // Get all keys for this organization
    const pattern = getCacheKey('*', organizationId, '*');
    const keys = await redis.keys(pattern);

    if (keys.length > 0) {
      await redis.del(...keys);
      console.log(`Cleared ${keys.length} SAT cache entries for org ${organizationId}`);
    }
  } catch (error) {
    console.error('Error clearing organization cache:', error);
  }
}

/**
 * Clears all SAT caches (admin use only)
 */
export async function clearAllSATCaches(): Promise<void> {
  try {
    const redis = getRedisClient();

    const pattern = `sat:${CACHE_VERSION}:*`;
    const keys = await redis.keys(pattern);

    if (keys.length > 0) {
      await redis.del(...keys);
      console.log(`Cleared ${keys.length} SAT cache entries`);
    }
  } catch (error) {
    console.error('Error clearing all SAT caches:', error);
  }
}

/**
 * Gets cache statistics for debugging
 *
 * @param organizationId - Organization UUID
 * @returns Cache statistics
 */
export async function getCacheStats(organizationId: string): Promise<{
  authTokenCached: boolean;
  authTokenTTL: number | null;
  rateLimitCount: number;
  rateLimitTTL: number | null;
}> {
  try {
    const redis = getRedisClient();

    const authKey = getCacheKey('auth', organizationId);
    const rateLimitKey = getRateLimitKey(organizationId);

    const [authExists, authTTL, rateLimitCount, rateLimitTTL] = await Promise.all([
      redis.exists(authKey),
      redis.ttl(authKey),
      redis.get<number>(rateLimitKey),
      redis.ttl(rateLimitKey),
    ]);

    return {
      authTokenCached: authExists === 1,
      authTokenTTL: authTTL,
      rateLimitCount: rateLimitCount || 0,
      rateLimitTTL: rateLimitTTL,
    };
  } catch (error) {
    console.error('Error getting cache stats:', error);
    return {
      authTokenCached: false,
      authTokenTTL: null,
      rateLimitCount: 0,
      rateLimitTTL: null,
    };
  }
}

/**
 * Checks cache health
 *
 * @returns true if cache is working
 */
export async function checkCacheHealth(): Promise<boolean> {
  try {
    const redis = getRedisClient();
    const testKey = getCacheKey('health', 'test');

    // Try to set and get a value
    await redis.set(testKey, 'ok', { ex: 10 });
    const value = await redis.get(testKey);
    await redis.del(testKey);

    return value === 'ok';
  } catch (error) {
    console.error('Cache health check failed:', error);
    return false;
  }
}
