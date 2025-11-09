import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  getCachedPermissions,
  setCachedPermissions,
  invalidateCache,
  invalidateOrganizationCache,
  getCacheStats,
  PERMISSION_CACHE_TTL,
} from './cache'
import type { Role } from './types'

// Mock Upstash Redis
vi.mock('@upstash/redis', () => {
  const mockRedis = {
    get: vi.fn(),
    set: vi.fn(),
    del: vi.fn(),
    scan: vi.fn(),
    ttl: vi.fn(),
  }

  return {
    Redis: vi.fn(() => mockRedis),
  }
})

describe('RBAC Cache', () => {
  let mockRedis: any

  beforeEach(() => {
    vi.clearAllMocks()
    const { Redis } = require('@upstash/redis')
    mockRedis = new Redis()
  })

  describe('getCachedPermissions', () => {
    it('should return cached permissions when available', async () => {
      const cachedData = {
        role: 'admin' as Role,
        permissions: {
          invoice: ['create', 'read', 'update'],
          customer: ['read'],
          product: ['read'],
          expense: ['read'],
          user: ['read'],
          organization: ['read'],
          report: ['read'],
          settings: ['read'],
        },
      }

      mockRedis.get.mockResolvedValue(cachedData)

      const result = await getCachedPermissions('user-1', 'org-1')

      expect(result).toEqual(cachedData)
      expect(mockRedis.get).toHaveBeenCalledWith('rbac:user-1:org-1')
    })

    it('should return null when cache miss', async () => {
      mockRedis.get.mockResolvedValue(null)

      const result = await getCachedPermissions('user-2', 'org-1')

      expect(result).toBeNull()
      expect(mockRedis.get).toHaveBeenCalledWith('rbac:user-2:org-1')
    })

    it('should return null on cache error', async () => {
      mockRedis.get.mockRejectedValue(new Error('Redis error'))

      const result = await getCachedPermissions('user-3', 'org-1')

      expect(result).toBeNull()
    })
  })

  describe('setCachedPermissions', () => {
    it('should cache permissions with correct TTL', async () => {
      const role: Role = 'accountant'
      const permissions = {
        invoice: ['read', 'update'],
        customer: ['read'],
        product: ['read'],
        expense: ['approve', 'reject'],
        user: ['read'],
        organization: ['read'],
        report: ['read', 'export'],
        settings: ['read'],
      }

      mockRedis.set.mockResolvedValue('OK')

      await setCachedPermissions('user-1', 'org-1', role, permissions)

      expect(mockRedis.set).toHaveBeenCalledWith(
        'rbac:user-1:org-1',
        { role, permissions },
        { ex: PERMISSION_CACHE_TTL }
      )
    })

    it('should handle cache set errors gracefully', async () => {
      mockRedis.set.mockRejectedValue(new Error('Redis error'))

      const role: Role = 'user'
      const permissions = {
        invoice: ['read'],
        customer: ['read'],
        product: ['read'],
        expense: ['read'],
        user: ['read'],
        organization: ['read'],
        report: ['read'],
        settings: ['read'],
      }

      // Should not throw
      await expect(
        setCachedPermissions('user-2', 'org-1', role, permissions)
      ).resolves.not.toThrow()
    })
  })

  describe('invalidateCache', () => {
    it('should delete cache key', async () => {
      mockRedis.del.mockResolvedValue(1)

      await invalidateCache('user-1', 'org-1')

      expect(mockRedis.del).toHaveBeenCalledWith('rbac:user-1:org-1')
    })

    it('should handle cache delete errors gracefully', async () => {
      mockRedis.del.mockRejectedValue(new Error('Redis error'))

      // Should not throw
      await expect(
        invalidateCache('user-2', 'org-1')
      ).resolves.not.toThrow()
    })
  })

  describe('invalidateOrganizationCache', () => {
    it('should delete all cache keys for organization', async () => {
      mockRedis.scan.mockResolvedValue([
        '0',
        ['rbac:user-1:org-1', 'rbac:user-2:org-1', 'rbac:user-3:org-1'],
      ])
      mockRedis.del.mockResolvedValue(3)

      await invalidateOrganizationCache('org-1')

      expect(mockRedis.scan).toHaveBeenCalledWith(0, {
        match: 'rbac:*:org-1',
        count: 100,
      })
      expect(mockRedis.del).toHaveBeenCalledWith(
        'rbac:user-1:org-1',
        'rbac:user-2:org-1',
        'rbac:user-3:org-1'
      )
    })

    it('should handle multiple scan iterations', async () => {
      // First scan returns cursor 1
      mockRedis.scan.mockResolvedValueOnce([
        '1',
        ['rbac:user-1:org-1', 'rbac:user-2:org-1'],
      ])
      // Second scan returns cursor 0 (done)
      mockRedis.scan.mockResolvedValueOnce([
        '0',
        ['rbac:user-3:org-1'],
      ])
      mockRedis.del.mockResolvedValue(3)

      await invalidateOrganizationCache('org-1')

      expect(mockRedis.scan).toHaveBeenCalledTimes(2)
      expect(mockRedis.del).toHaveBeenCalledWith(
        'rbac:user-1:org-1',
        'rbac:user-2:org-1',
        'rbac:user-3:org-1'
      )
    })

    it('should handle no keys found', async () => {
      mockRedis.scan.mockResolvedValue(['0', []])

      await invalidateOrganizationCache('org-2')

      expect(mockRedis.scan).toHaveBeenCalled()
      expect(mockRedis.del).not.toHaveBeenCalled()
    })

    it('should handle scan errors gracefully', async () => {
      mockRedis.scan.mockRejectedValue(new Error('Redis error'))

      // Should not throw
      await expect(
        invalidateOrganizationCache('org-3')
      ).resolves.not.toThrow()
    })
  })

  describe('getCacheStats', () => {
    it('should return cache stats when key exists', async () => {
      mockRedis.ttl.mockResolvedValue(240) // 4 minutes left

      const stats = await getCacheStats('user-1', 'org-1')

      expect(stats).toEqual({
        exists: true,
        ttl: 240,
      })
      expect(mockRedis.ttl).toHaveBeenCalledWith('rbac:user-1:org-1')
    })

    it('should return no cache when key does not exist', async () => {
      mockRedis.ttl.mockResolvedValue(-2) // Key doesn't exist

      const stats = await getCacheStats('user-2', 'org-1')

      expect(stats).toEqual({
        exists: false,
        ttl: null,
      })
    })

    it('should handle expired keys', async () => {
      mockRedis.ttl.mockResolvedValue(-1) // Key exists but has no TTL

      const stats = await getCacheStats('user-3', 'org-1')

      expect(stats).toEqual({
        exists: true,
        ttl: -1,
      })
    })

    it('should handle cache errors gracefully', async () => {
      mockRedis.ttl.mockRejectedValue(new Error('Redis error'))

      const stats = await getCacheStats('user-4', 'org-1')

      expect(stats).toEqual({
        exists: false,
        ttl: null,
      })
    })
  })

  describe('Cache TTL', () => {
    it('should have correct TTL value', () => {
      // 5 minutes = 300 seconds
      expect(PERMISSION_CACHE_TTL).toBe(300)
    })
  })

  describe('Cache Key Format', () => {
    it('should use correct key format', async () => {
      mockRedis.get.mockResolvedValue(null)

      await getCachedPermissions('user-123', 'org-456')

      expect(mockRedis.get).toHaveBeenCalledWith('rbac:user-123:org-456')
    })

    it('should handle special characters in IDs', async () => {
      mockRedis.get.mockResolvedValue(null)

      await getCachedPermissions('user-abc-123', 'org-xyz-456')

      expect(mockRedis.get).toHaveBeenCalledWith('rbac:user-abc-123:org-xyz-456')
    })
  })
})
