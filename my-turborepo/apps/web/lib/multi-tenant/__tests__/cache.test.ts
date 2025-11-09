/**
 * Multi-Tenant Cache Tests
 *
 * Tests for organization caching functionality and performance
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, jest } from '@jest/globals'
import {
  getCachedOrganization,
  setCachedOrganization,
  invalidateOrganizationCache,
  getOrganizationCacheStats,
  ORG_CACHE_TTL,
} from '../cache'
import {
  createTestOrganization,
  cleanupTestOrganization,
  type TestOrganization,
} from './test-utils'
import type { Organization } from '../types'

describe('Cache - Organization Data Caching', () => {
  let testOrg: TestOrganization

  beforeAll(async () => {
    testOrg = await createTestOrganization('Cache Test Org')
  })

  afterAll(async () => {
    await cleanupTestOrganization(testOrg.id)
  })

  beforeEach(async () => {
    // Clear cache before each test
    await invalidateOrganizationCache(testOrg.id)
  })

  describe('getCachedOrganization()', () => {
    it('should return null for cache miss', async () => {
      const cached = await getCachedOrganization(testOrg.id)
      expect(cached).toBeNull()
    })

    it('should return organization data for cache hit', async () => {
      const org: Organization = {
        id: testOrg.id,
        name: testOrg.name,
        rfc: testOrg.rfc,
        legalName: testOrg.legalName,
        status: 'active',
        plan: 'professional',
        taxRegime: '601',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }

      // Set cache
      await setCachedOrganization(testOrg.id, org)

      // Get from cache
      const cached = await getCachedOrganization(testOrg.id)

      expect(cached).toBeTruthy()
      expect(cached?.id).toBe(testOrg.id)
      expect(cached?.name).toBe(testOrg.name)
    })

    it('should return null for expired cache entries', async () => {
      const org: Organization = {
        id: testOrg.id,
        name: testOrg.name,
        rfc: testOrg.rfc,
        legalName: testOrg.legalName,
        status: 'active',
        plan: 'professional',
        taxRegime: '601',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }

      // Set cache with very short TTL (1ms)
      await setCachedOrganization(testOrg.id, org, 0.001)

      // Wait for expiration
      await new Promise((resolve) => setTimeout(resolve, 10))

      // Should return null for expired entry
      const cached = await getCachedOrganization(testOrg.id)
      expect(cached).toBeNull()
    })
  })

  describe('setCachedOrganization()', () => {
    it('should cache organization data with default TTL', async () => {
      const org: Organization = {
        id: testOrg.id,
        name: testOrg.name,
        rfc: testOrg.rfc,
        legalName: testOrg.legalName,
        status: 'active',
        plan: 'professional',
        taxRegime: '601',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }

      await setCachedOrganization(testOrg.id, org)

      const cached = await getCachedOrganization(testOrg.id)
      expect(cached).toEqual(org)
    })

    it('should cache organization data with custom TTL', async () => {
      const org: Organization = {
        id: testOrg.id,
        name: testOrg.name,
        rfc: testOrg.rfc,
        legalName: testOrg.legalName,
        status: 'active',
        plan: 'professional',
        taxRegime: '601',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }

      const customTTL = 600 // 10 minutes
      await setCachedOrganization(testOrg.id, org, customTTL)

      const cached = await getCachedOrganization(testOrg.id)
      expect(cached).toEqual(org)
    })

    it('should overwrite existing cache entry', async () => {
      const org1: Organization = {
        id: testOrg.id,
        name: 'Old Name',
        rfc: testOrg.rfc,
        legalName: testOrg.legalName,
        status: 'active',
        plan: 'basic',
        taxRegime: '601',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }

      const org2: Organization = {
        ...org1,
        name: 'New Name',
        plan: 'enterprise',
      }

      // Set initial cache
      await setCachedOrganization(testOrg.id, org1)

      // Overwrite with new data
      await setCachedOrganization(testOrg.id, org2)

      const cached = await getCachedOrganization(testOrg.id)
      expect(cached?.name).toBe('New Name')
      expect(cached?.plan).toBe('enterprise')
    })
  })

  describe('invalidateOrganizationCache()', () => {
    it('should clear cache for specific organization', async () => {
      const org: Organization = {
        id: testOrg.id,
        name: testOrg.name,
        rfc: testOrg.rfc,
        legalName: testOrg.legalName,
        status: 'active',
        plan: 'professional',
        taxRegime: '601',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }

      // Set cache
      await setCachedOrganization(testOrg.id, org)

      // Verify cache exists
      let cached = await getCachedOrganization(testOrg.id)
      expect(cached).toBeTruthy()

      // Invalidate
      await invalidateOrganizationCache(testOrg.id)

      // Verify cache is cleared
      cached = await getCachedOrganization(testOrg.id)
      expect(cached).toBeNull()
    })

    it('should handle invalidation of non-existent cache', async () => {
      // Should not throw error
      await expect(
        invalidateOrganizationCache('00000000-0000-0000-0000-000000000000')
      ).resolves.not.toThrow()
    })
  })

  describe('getOrganizationCacheStats()', () => {
    it('should return cache statistics', async () => {
      const org: Organization = {
        id: testOrg.id,
        name: testOrg.name,
        rfc: testOrg.rfc,
        legalName: testOrg.legalName,
        status: 'active',
        plan: 'professional',
        taxRegime: '601',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }

      await setCachedOrganization(testOrg.id, org)

      const stats = await getOrganizationCacheStats(testOrg.id)

      expect(stats).toBeTruthy()
      expect(stats.exists).toBe(true)
      expect(stats.ttl).toBeGreaterThan(0)
      expect(stats.ttl).toBeLessThanOrEqual(ORG_CACHE_TTL)
    })

    it('should return stats for non-existent cache', async () => {
      const stats = await getOrganizationCacheStats('00000000-0000-0000-0000-000000000000')

      expect(stats).toBeTruthy()
      expect(stats.exists).toBe(false)
      expect(stats.ttl).toBe(0)
    })
  })
})

describe('Cache - Performance Tests', () => {
  let testOrg: TestOrganization

  beforeAll(async () => {
    testOrg = await createTestOrganization('Performance Test Org')
  })

  afterAll(async () => {
    await cleanupTestOrganization(testOrg.id)
  })

  it('should have fast cache read performance (< 5ms)', async () => {
    const org: Organization = {
      id: testOrg.id,
      name: testOrg.name,
      rfc: testOrg.rfc,
      legalName: testOrg.legalName,
      status: 'active',
      plan: 'professional',
      taxRegime: '601',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }

    await setCachedOrganization(testOrg.id, org)

    const start = performance.now()
    await getCachedOrganization(testOrg.id)
    const duration = performance.now() - start

    // Cache read should be very fast
    expect(duration).toBeLessThan(5) // 5ms
  })

  it('should have fast cache write performance (< 10ms)', async () => {
    const org: Organization = {
      id: testOrg.id,
      name: testOrg.name,
      rfc: testOrg.rfc,
      legalName: testOrg.legalName,
      status: 'active',
      plan: 'professional',
      taxRegime: '601',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }

    const start = performance.now()
    await setCachedOrganization(testOrg.id, org)
    const duration = performance.now() - start

    // Cache write should be fast
    expect(duration).toBeLessThan(10) // 10ms
  })

  it('should handle concurrent cache operations', async () => {
    const org: Organization = {
      id: testOrg.id,
      name: testOrg.name,
      rfc: testOrg.rfc,
      legalName: testOrg.legalName,
      status: 'active',
      plan: 'professional',
      taxRegime: '601',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }

    // Set cache
    await setCachedOrganization(testOrg.id, org)

    // Perform multiple concurrent reads
    const reads = Array.from({ length: 100 }, () => getCachedOrganization(testOrg.id))

    const results = await Promise.all(reads)

    // All reads should succeed
    expect(results.every((r) => r?.id === testOrg.id)).toBe(true)
  })
})

describe('Cache - TTL Behavior', () => {
  let testOrg: TestOrganization

  beforeAll(async () => {
    testOrg = await createTestOrganization('TTL Test Org')
  })

  afterAll(async () => {
    await cleanupTestOrganization(testOrg.id)
  })

  it('should respect default TTL (15 minutes)', async () => {
    const org: Organization = {
      id: testOrg.id,
      name: testOrg.name,
      rfc: testOrg.rfc,
      legalName: testOrg.legalName,
      status: 'active',
      plan: 'professional',
      taxRegime: '601',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }

    await setCachedOrganization(testOrg.id, org)

    const stats = await getOrganizationCacheStats(testOrg.id)

    // TTL should be close to 900 seconds (15 minutes)
    expect(stats.ttl).toBeGreaterThan(ORG_CACHE_TTL - 10) // Allow 10s margin
    expect(stats.ttl).toBeLessThanOrEqual(ORG_CACHE_TTL)
  })

  it('should allow custom TTL values', async () => {
    const org: Organization = {
      id: testOrg.id,
      name: testOrg.name,
      rfc: testOrg.rfc,
      legalName: testOrg.legalName,
      status: 'active',
      plan: 'professional',
      taxRegime: '601',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }

    const customTTL = 300 // 5 minutes
    await setCachedOrganization(testOrg.id, org, customTTL)

    const stats = await getOrganizationCacheStats(testOrg.id)

    expect(stats.ttl).toBeGreaterThan(customTTL - 10)
    expect(stats.ttl).toBeLessThanOrEqual(customTTL)
  })
})
