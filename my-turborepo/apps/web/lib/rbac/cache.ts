/**
 * RBAC Redis Cache Layer
 *
 * Caches user permissions in Redis for fast lookups
 * TTL: 5 minutes (300 seconds)
 */

import { Redis } from '@upstash/redis'
import type { CachedPermissions, Role, ResourcePermissions } from './types'

// ============================================
// REDIS CLIENT
// ============================================

let redis: Redis | null = null

/**
 * Get Redis client (lazy initialization)
 */
function getRedisClient(): Redis {
  if (!redis) {
    const url = process.env.UPSTASH_REDIS_REST_URL
    const token = process.env.UPSTASH_REDIS_REST_TOKEN

    if (!url || !token) {
      throw new Error(
        'Missing Redis credentials. Set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN'
      )
    }

    redis = new Redis({
      url,
      token,
    })
  }

  return redis
}

// ============================================
// CACHE CONFIGURATION
// ============================================

const CACHE_TTL = 300 // 5 minutes in seconds
const CACHE_VERSION = 'v1' // Increment to invalidate all caches

/**
 * Generate cache key for user permissions
 */
function getCacheKey(userId: string, organizationId: string): string {
  return `permissions:${CACHE_VERSION}:${userId}:${organizationId}`
}

// ============================================
// CACHE OPERATIONS
// ============================================

/**
 * Get cached permissions for a user
 * Returns null if not cached or expired
 */
export async function getCachedPermissions(
  userId: string,
  organizationId: string
): Promise<CachedPermissions | null> {
  try {
    const redis = getRedisClient()
    const key = getCacheKey(userId, organizationId)

    const cached = await redis.get<CachedPermissions>(key)

    if (!cached) {
      return null
    }

    // Check if expired (double-check even though Redis handles TTL)
    const now = new Date()
    if (new Date(cached.expiresAt) < now) {
      await invalidateCache(userId, organizationId)
      return null
    }

    return cached
  } catch (error) {
    console.error('Error getting cached permissions:', error)
    return null // Fail gracefully
  }
}

/**
 * Cache permissions for a user
 */
export async function setCachedPermissions(
  userId: string,
  organizationId: string,
  role: Role,
  permissions: ResourcePermissions
): Promise<void> {
  try {
    const redis = getRedisClient()
    const key = getCacheKey(userId, organizationId)

    const now = new Date()
    const expiresAt = new Date(now.getTime() + CACHE_TTL * 1000)

    const cacheData: CachedPermissions = {
      userId,
      organizationId,
      role,
      permissions,
      version: CACHE_VERSION,
      cachedAt: now,
      expiresAt,
    }

    // Set with TTL
    await redis.setex(key, CACHE_TTL, JSON.stringify(cacheData))
  } catch (error) {
    console.error('Error setting cached permissions:', error)
    // Don't throw - cache is optional
  }
}

/**
 * Invalidate cached permissions for a user
 * Call this when user's role or permissions change
 */
export async function invalidateCache(
  userId: string,
  organizationId: string
): Promise<void> {
  try {
    const redis = getRedisClient()
    const key = getCacheKey(userId, organizationId)
    await redis.del(key)
  } catch (error) {
    console.error('Error invalidating cache:', error)
    // Don't throw - this is not critical
  }
}

/**
 * Invalidate all caches for an organization
 * Useful when organization-wide settings change
 */
export async function invalidateOrganizationCache(
  organizationId: string
): Promise<void> {
  try {
    const redis = getRedisClient()

    // Get all keys matching pattern
    const pattern = `permissions:${CACHE_VERSION}:*:${organizationId}`
    const keys = await redis.keys(pattern)

    if (keys.length > 0) {
      await redis.del(...keys)
    }
  } catch (error) {
    console.error('Error invalidating organization cache:', error)
    // Don't throw - this is not critical
  }
}

/**
 * Warm cache for a user (pre-populate)
 * Useful after login or role change
 */
export async function warmCache(
  userId: string,
  organizationId: string,
  role: Role,
  permissions: ResourcePermissions
): Promise<void> {
  await setCachedPermissions(userId, organizationId, role, permissions)
}

/**
 * Get cache statistics (for debugging)
 */
export async function getCacheStats(
  userId: string,
  organizationId: string
): Promise<{ exists: boolean; ttl: number | null }> {
  try {
    const redis = getRedisClient()
    const key = getCacheKey(userId, organizationId)

    const exists = (await redis.exists(key)) === 1
    const ttl = await redis.ttl(key)

    return { exists, ttl }
  } catch (error) {
    console.error('Error getting cache stats:', error)
    return { exists: false, ttl: null }
  }
}

/**
 * Clear all permission caches (use with caution!)
 * Useful for bulk updates or debugging
 */
export async function clearAllCaches(): Promise<void> {
  try {
    const redis = getRedisClient()
    const pattern = `permissions:${CACHE_VERSION}:*`
    const keys = await redis.keys(pattern)

    if (keys.length > 0) {
      await redis.del(...keys)
      console.log(`Cleared ${keys.length} permission caches`)
    }
  } catch (error) {
    console.error('Error clearing all caches:', error)
  }
}

// ============================================
// CACHE VERSION MANAGEMENT
// ============================================

/**
 * Increment cache version to invalidate ALL caches globally
 * This is useful when permission logic changes
 *
 * NOTE: In production, store version in database or environment
 * For now, update CACHE_VERSION constant manually
 */
export function getCurrentCacheVersion(): string {
  return CACHE_VERSION
}

/**
 * Check if cached data is using current version
 */
export function isCurrentVersion(cachedData: CachedPermissions): boolean {
  return cachedData.version === CACHE_VERSION
}
