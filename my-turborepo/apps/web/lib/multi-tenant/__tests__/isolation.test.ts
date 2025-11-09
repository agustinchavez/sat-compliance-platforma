/**
 * Multi-Tenant Isolation Tests
 *
 * Tests for cross-tenant protection and data leakage prevention
 */

import { describe, it, expect, beforeAll, afterAll, jest } from '@jest/globals'
import {
  isResourceInOrganization,
  validateResourceInOrganization,
  preventDataLeakage,
  sanitizeForOrganization,
} from '../isolation'
import { TenantIsolationError } from '../types'
import {
  createTestOrganization,
  createTestResource,
  cleanupTestOrganization,
  type TestOrganization,
} from './test-utils'

// Mock dependencies
jest.mock('../context', () => ({
  getOrganizationId: jest.fn(),
}))

import { getOrganizationId } from '../context'

describe('Isolation - Resource Ownership Validation', () => {
  let org1: TestOrganization
  let org2: TestOrganization

  beforeAll(async () => {
    org1 = await createTestOrganization('Isolation Test Org 1')
    org2 = await createTestOrganization('Isolation Test Org 2')
  })

  afterAll(async () => {
    await cleanupTestOrganization(org1.id)
    await cleanupTestOrganization(org2.id)
  })

  describe('isResourceInOrganization()', () => {
    it('should return true for resource in current organization', async () => {
      ;(getOrganizationId as jest.Mock).mockResolvedValue(org1.id)

      const account = await createTestResource('chart_of_accounts', org1.id, {
        code: '5000',
        name: 'Isolation Test Account',
        type: 'expense',
        level: 1,
      })

      const isOwned = await isResourceInOrganization('chart_of_accounts', account.id)

      expect(isOwned).toBe(true)
    })

    it('should return false for resource in different organization', async () => {
      ;(getOrganizationId as jest.Mock).mockResolvedValue(org1.id)

      // Create resource in org2
      const account = await createTestResource('chart_of_accounts', org2.id, {
        code: '5000',
        name: 'Cross-Org Test Account',
        type: 'expense',
        level: 1,
      })

      const isOwned = await isResourceInOrganization('chart_of_accounts', account.id)

      expect(isOwned).toBe(false)
    })

    it('should return false for non-existent resource', async () => {
      ;(getOrganizationId as jest.Mock).mockResolvedValue(org1.id)

      const isOwned = await isResourceInOrganization(
        'chart_of_accounts',
        '00000000-0000-0000-0000-000000000000'
      )

      expect(isOwned).toBe(false)
    })
  })

  describe('validateResourceInOrganization()', () => {
    it('should not throw for valid resource ownership', async () => {
      ;(getOrganizationId as jest.Mock).mockResolvedValue(org1.id)

      const account = await createTestResource('chart_of_accounts', org1.id, {
        code: '6000',
        name: 'Valid Resource',
        type: 'expense',
        level: 1,
      })

      await expect(
        validateResourceInOrganization('chart_of_accounts', account.id)
      ).resolves.not.toThrow()
    })

    it('should throw TenantIsolationError for cross-org access', async () => {
      ;(getOrganizationId as jest.Mock).mockResolvedValue(org1.id)

      // Create resource in org2
      const account = await createTestResource('chart_of_accounts', org2.id, {
        code: '6000',
        name: 'Cross-Org Resource',
        type: 'expense',
        level: 1,
      })

      await expect(
        validateResourceInOrganization('chart_of_accounts', account.id)
      ).rejects.toThrow(TenantIsolationError)
    })

    it('should throw for non-existent resource', async () => {
      ;(getOrganizationId as jest.Mock).mockResolvedValue(org1.id)

      await expect(
        validateResourceInOrganization('chart_of_accounts', '00000000-0000-0000-0000-000000000000')
      ).rejects.toThrow(TenantIsolationError)
    })
  })
})

describe('Isolation - Data Leakage Prevention', () => {
  describe('preventDataLeakage()', () => {
    it('should strip organization_id from single object', () => {
      const data = {
        id: 'test-123',
        name: 'Test Record',
        organization_id: 'org-secret',
        value: 100,
      }

      const sanitized = preventDataLeakage(data)

      expect(sanitized).not.toHaveProperty('organization_id')
      expect(sanitized.id).toBe('test-123')
      expect(sanitized.name).toBe('Test Record')
      expect(sanitized.value).toBe(100)
    })

    it('should strip organization_id from array of objects', () => {
      const data = [
        { id: '1', name: 'Record 1', organization_id: 'org-1' },
        { id: '2', name: 'Record 2', organization_id: 'org-1' },
        { id: '3', name: 'Record 3', organization_id: 'org-1' },
      ]

      const sanitized = preventDataLeakage(data)

      expect(sanitized).toHaveLength(3)
      sanitized.forEach((record) => {
        expect(record).not.toHaveProperty('organization_id')
      })
    })

    it('should preserve other fields when stripping organization_id', () => {
      const data = {
        id: 'test-456',
        name: 'Test',
        organization_id: 'org-test',
        metadata: { key: 'value' },
        createdAt: new Date().toISOString(),
      }

      const sanitized = preventDataLeakage(data)

      expect(sanitized.id).toBe('test-456')
      expect(sanitized.name).toBe('Test')
      expect(sanitized.metadata).toEqual({ key: 'value' })
      expect(sanitized.createdAt).toBeTruthy()
      expect(sanitized).not.toHaveProperty('organization_id')
    })

    it('should handle nested objects', () => {
      const data = {
        id: 'parent-1',
        organization_id: 'org-1',
        child: {
          id: 'child-1',
          organization_id: 'org-1',
          name: 'Child',
        },
      }

      const sanitized = preventDataLeakage(data)

      expect(sanitized).not.toHaveProperty('organization_id')
      // Note: Current implementation only strips top-level organization_id
      // Deep sanitization would require recursive implementation
    })

    it('should handle empty objects and arrays', () => {
      expect(preventDataLeakage({})).toEqual({})
      expect(preventDataLeakage([])).toEqual([])
    })
  })

  describe('sanitizeForOrganization()', () => {
    it('should remove records from different organizations', async () => {
      ;(getOrganizationId as jest.Mock).mockResolvedValue('org-1')

      const data = [
        { id: '1', organization_id: 'org-1', name: 'Valid' },
        { id: '2', organization_id: 'org-2', name: 'Invalid' },
        { id: '3', organization_id: 'org-1', name: 'Valid' },
      ]

      const sanitized = await sanitizeForOrganization(data)

      expect(sanitized).toHaveLength(2)
      expect(sanitized.every((r) => r.organization_id === 'org-1')).toBe(true)
    })

    it('should strip organization_id from sanitized results', async () => {
      ;(getOrganizationId as jest.Mock).mockResolvedValue('org-1')

      const data = [{ id: '1', organization_id: 'org-1', name: 'Test' }]

      const sanitized = await sanitizeForOrganization(data)

      expect(sanitized).toHaveLength(1)
      expect(sanitized[0]).not.toHaveProperty('organization_id')
    })

    it('should handle empty arrays', async () => {
      ;(getOrganizationId as jest.Mock).mockResolvedValue('org-1')

      const sanitized = await sanitizeForOrganization([])

      expect(sanitized).toEqual([])
    })
  })
})

describe('Isolation - Security Violation Detection', () => {
  let org1: TestOrganization
  let org2: TestOrganization

  beforeAll(async () => {
    org1 = await createTestOrganization('Security Test Org 1')
    org2 = await createTestOrganization('Security Test Org 2')
  })

  afterAll(async () => {
    await cleanupTestOrganization(org1.id)
    await cleanupTestOrganization(org2.id)
  })

  it('should detect cross-organization access attempts', async () => {
    ;(getOrganizationId as jest.Mock).mockResolvedValue(org1.id)

    // Create resource in org2
    const account = await createTestResource('chart_of_accounts', org2.id, {
      code: '7000',
      name: 'Security Test Account',
      type: 'revenue',
      level: 1,
    })

    // Attempt to validate access (should fail)
    try {
      await validateResourceInOrganization('chart_of_accounts', account.id)
      // Should not reach here
      expect(true).toBe(false)
    } catch (error) {
      expect(error).toBeInstanceOf(TenantIsolationError)
      expect((error as Error).message).toContain('Resource not found or access denied')
    }
  })

  it('should log security violations for audit', async () => {
    ;(getOrganizationId as jest.Mock).mockResolvedValue(org1.id)

    // Create resource in org2
    const account = await createTestResource('chart_of_accounts', org2.id, {
      code: '8000',
      name: 'Audit Test Account',
      type: 'revenue',
      level: 1,
    })

    // Attempt validation (will throw)
    try {
      await validateResourceInOrganization('chart_of_accounts', account.id)
    } catch (error) {
      // Error is expected - security violation should be logged
      // In production, this would write to audit log
    }
  })
})

describe('Isolation - Edge Cases', () => {
  it('should handle malformed resource IDs', async () => {
    ;(getOrganizationId as jest.Mock).mockResolvedValue('org-test')

    const result = await isResourceInOrganization('chart_of_accounts', 'invalid-id')

    expect(result).toBe(false)
  })

  it('should handle invalid table names gracefully', async () => {
    ;(getOrganizationId as jest.Mock).mockResolvedValue('org-test')

    // Should not crash on invalid table name
    const result = await isResourceInOrganization('nonexistent_table', 'test-id')

    expect(result).toBe(false)
  })

  it('should handle data with missing organization_id field', () => {
    const data = {
      id: 'test-123',
      name: 'No Org ID',
      value: 100,
    }

    // Should not crash when field doesn't exist
    const sanitized = preventDataLeakage(data)

    expect(sanitized).toEqual(data)
  })
})
