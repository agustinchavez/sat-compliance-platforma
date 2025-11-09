/**
 * Multi-Tenant Context Manager - Caching Layer
 *
 * Redis-based caching for organization data to minimize database queries
 * and improve performance of multi-tenant operations.
 */

import { Redis } from '@upstash/redis'
import type {
  Organization,
  OrganizationContext,
  CachedOrganization,
} from './types'

// Initialize Redis client
const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
})

// Cache configuration
export const ORG_CACHE_TTL = 900 // 15 minutes (900 seconds)
export const ORG_CACHE_PREFIX = 'org'

/**
 * Generate cache key for organization
 */
function getOrganizationCacheKey(organizationId: string): string {
  return `${ORG_CACHE_PREFIX}:${organizationId}`
}

/**
 * Get organization from cache
 *
 * @param organizationId - Organization UUID
 * @returns Cached organization data or null if not found/expired
 *
 * @example
 * ```typescript
 * const org = await getCachedOrganization('org-123')
 * if (org) {
 *   console.log('Cache hit:', org.name)
 * }
 * ```
 */
export async function getCachedOrganization(
  organizationId: string
): Promise<Organization | null> {
  try {
    const cacheKey = getOrganizationCacheKey(organizationId)
    const cached = await redis.get<CachedOrganization>(cacheKey)

    if (!cached) {
      return null
    }

    // Check if cache entry is still valid
    if (cached.expiresAt <= Date.now()) {
      // Expired, delete it
      await redis.del(cacheKey)
      return null
    }

    return cached.organization
  } catch (error) {
    console.error('Organization cache get error:', error)
    // Fail gracefully - return null on cache errors
    return null
  }
}

/**
 * Cache organization data
 *
 * @param organizationId - Organization UUID
 * @param organization - Organization data to cache
 *
 * @example
 * ```typescript
 * await setCachedOrganization('org-123', organizationData)
 * ```
 */
export async function setCachedOrganization(
  organizationId: string,
  organization: Organization
): Promise<void> {
  try {
    const cacheKey = getOrganizationCacheKey(organizationId)
    const now = Date.now()

    const cacheEntry: CachedOrganization = {
      organization,
      cachedAt: now,
      expiresAt: now + ORG_CACHE_TTL * 1000,
    }

    await redis.set(cacheKey, cacheEntry, { ex: ORG_CACHE_TTL })
  } catch (error) {
    console.error('Organization cache set error:', error)
    // Fail gracefully - don't throw on cache errors
  }
}

/**
 * Invalidate organization cache
 * Call this when organization data is updated
 *
 * @param organizationId - Organization UUID
 *
 * @example
 * ```typescript
 * // After updating organization
 * await updateOrganization(orgId, data)
 * await invalidateOrganizationCache(orgId)
 * ```
 */
export async function invalidateOrganizationCache(
  organizationId: string
): Promise<void> {
  try {
    const cacheKey = getOrganizationCacheKey(organizationId)
    await redis.del(cacheKey)
  } catch (error) {
    console.error('Organization cache invalidation error:', error)
    // Fail gracefully
  }
}

/**
 * Invalidate all organization caches
 * Use with caution - only for system-wide updates
 *
 * @example
 * ```typescript
 * // After database migration
 * await invalidateAllOrganizationCaches()
 * ```
 */
export async function invalidateAllOrganizationCaches(): Promise<void> {
  try {
    let cursor = '0'
    const pattern = `${ORG_CACHE_PREFIX}:*`
    const keysToDelete: string[] = []

    // Scan for all organization cache keys
    do {
      const [nextCursor, keys] = await redis.scan(cursor, {
        match: pattern,
        count: 100,
      })

      cursor = nextCursor
      keysToDelete.push(...keys)
    } while (cursor !== '0')

    // Delete all found keys
    if (keysToDelete.length > 0) {
      await redis.del(...keysToDelete)
    }
  } catch (error) {
    console.error('Bulk organization cache invalidation error:', error)
    // Fail gracefully
  }
}

/**
 * Get cache statistics for organization
 *
 * @param organizationId - Organization UUID
 * @returns Cache stats including TTL and existence
 *
 * @example
 * ```typescript
 * const stats = await getOrganizationCacheStats('org-123')
 * console.log(`Cache TTL: ${stats.ttl}s`)
 * ```
 */
export async function getOrganizationCacheStats(organizationId: string): Promise<{
  exists: boolean
  ttl: number | null
}> {
  try {
    const cacheKey = getOrganizationCacheKey(organizationId)
    const ttl = await redis.ttl(cacheKey)

    return {
      exists: ttl > 0,
      ttl: ttl > 0 ? ttl : null,
    }
  } catch (error) {
    console.error('Organization cache stats error:', error)
    return {
      exists: false,
      ttl: null,
    }
  }
}

/**
 * Warm organization cache
 * Pre-load organization data to avoid cold start delays
 *
 * @param organizationId - Organization UUID
 * @param fetchOrganization - Function to fetch organization from database
 *
 * @example
 * ```typescript
 * await warmOrganizationCache('org-123', async (id) => {
 *   return await db.from('organizations').select('*').eq('id', id).single()
 * })
 * ```
 */
export async function warmOrganizationCache(
  organizationId: string,
  fetchOrganization: (id: string) => Promise<Organization>
): Promise<void> {
  try {
    // Check if already cached
    const cached = await getCachedOrganization(organizationId)
    if (cached) {
      return // Already warm
    }

    // Fetch and cache
    const organization = await fetchOrganization(organizationId)
    if (organization) {
      await setCachedOrganization(organizationId, organization)
    }
  } catch (error) {
    console.error('Organization cache warming error:', error)
    // Fail gracefully
  }
}

/**
 * Get lightweight organization context for caching
 * (Only essential fields, reduces cache size)
 *
 * @param organizationId - Organization UUID
 * @returns Lightweight organization context or null
 */
export async function getCachedOrganizationContext(
  organizationId: string
): Promise<OrganizationContext | null> {
  try {
    const org = await getCachedOrganization(organizationId)
    if (!org) return null

    // Return only essential fields
    return {
      id: org.id,
      name: org.name,
      rfc: org.rfc,
      plan: org.plan,
      status: org.status,
    }
  } catch (error) {
    console.error('Organization context cache error:', error)
    return null
  }
}

/**
 * Batch get multiple organizations from cache
 *
 * @param organizationIds - Array of organization UUIDs
 * @returns Map of organization ID to organization data
 *
 * @example
 * ```typescript
 * const orgs = await batchGetCachedOrganizations(['org-1', 'org-2', 'org-3'])
 * console.log(orgs.get('org-1'))
 * ```
 */
export async function batchGetCachedOrganizations(
  organizationIds: string[]
): Promise<Map<string, Organization>> {
  const results = new Map<string, Organization>()

  try {
    const promises = organizationIds.map(async (id) => {
      const org = await getCachedOrganization(id)
      if (org) {
        results.set(id, org)
      }
    })

    await Promise.all(promises)
  } catch (error) {
    console.error('Batch organization cache get error:', error)
  }

  return results
}
