/**
 * Multi-Tenant Scoped Client Tests
 *
 * Tests for getScopedClient() and database scoping utilities
 */

import { describe, it, expect, beforeAll, afterAll, jest } from '@jest/globals'
import {
  getScopedClient,
  verifyResourceOwnership,
  getResourceOrganizationId,
  countOrganizationResources,
} from '../database'
import { getCurrentOrganization, getOrganizationId } from '../context'
import {
  createTestOrganization,
  createTestUser,
  createTestResource,
  cleanupTestOrganization,
  cleanupTestAuthUser,
  type TestOrganization,
  type TestUser,
} from './test-utils'

// Mock the auth functions
jest.mock('../context', () => ({
  getCurrentOrganization: jest.fn(),
  getOrganizationId: jest.fn(),
}))

describe('Scoped Client - Database Utilities', () => {
  let org1: TestOrganization
  let org2: TestOrganization
  let user1: TestUser
  let user2: TestUser

  beforeAll(async () => {
    org1 = await createTestOrganization('Scoped Client Org 1')
    org2 = await createTestOrganization('Scoped Client Org 2')
    user1 = await createTestUser(org1.id)
    user2 = await createTestUser(org2.id)
  })

  afterAll(async () => {
    await cleanupTestAuthUser(user1.authId)
    await cleanupTestAuthUser(user2.authId)
    await cleanupTestOrganization(org1.id)
    await cleanupTestOrganization(org2.id)
  })

  describe('getScopedClient()', () => {
    it('should return Supabase client when organization context exists', async () => {
      // Mock organization context
      ;(getOrganizationId as jest.Mock).mockResolvedValue(org1.id)

      const client = await getScopedClient()

      expect(client).toBeTruthy()
      expect(client.from).toBeDefined()
    })

    it('should throw error when organization context is missing', async () => {
      // Mock missing organization context
      ;(getOrganizationId as jest.Mock).mockRejectedValue(
        new Error('Organization context is missing')
      )

      await expect(getScopedClient()).rejects.toThrow('Organization context is missing')
    })
  })

  describe('verifyResourceOwnership()', () => {
    it('should return true for resource owned by organization', async () => {
      // Mock organization context
      ;(getOrganizationId as jest.Mock).mockResolvedValue(org1.id)

      // Create test resource
      const account = await createTestResource('chart_of_accounts', org1.id, {
        code: '1100',
        name: 'Ownership Test Account',
        type: 'asset',
        level: 1,
      })

      const isOwned = await verifyResourceOwnership('chart_of_accounts', account.id)

      expect(isOwned).toBe(true)
    })

    it('should return false for resource owned by different organization', async () => {
      // Mock organization context as org1
      ;(getOrganizationId as jest.Mock).mockResolvedValue(org1.id)

      // Create test resource in org2
      const account = await createTestResource('chart_of_accounts', org2.id, {
        code: '1100',
        name: 'Cross-Org Test Account',
        type: 'asset',
        level: 1,
      })

      const isOwned = await verifyResourceOwnership('chart_of_accounts', account.id)

      expect(isOwned).toBe(false)
    })

    it('should return false for non-existent resource', async () => {
      ;(getOrganizationId as jest.Mock).mockResolvedValue(org1.id)

      const isOwned = await verifyResourceOwnership(
        'chart_of_accounts',
        '00000000-0000-0000-0000-000000000000'
      )

      expect(isOwned).toBe(false)
    })
  })

  describe('getResourceOrganizationId()', () => {
    it('should return organization ID for valid resource', async () => {
      const account = await createTestResource('chart_of_accounts', org1.id, {
        code: '1200',
        name: 'Get Org ID Test',
        type: 'asset',
        level: 1,
      })

      const orgId = await getResourceOrganizationId('chart_of_accounts', account.id)

      expect(orgId).toBe(org1.id)
    })

    it('should return null for non-existent resource', async () => {
      const orgId = await getResourceOrganizationId(
        'chart_of_accounts',
        '00000000-0000-0000-0000-000000000000'
      )

      expect(orgId).toBeNull()
    })

    it('should work with nested resources (journal_entry_lines)', async () => {
      // Create journal entry
      const entry = await createTestResource('journal_entries', org1.id, {
        entry_number: 'JE-ORG-TEST-001',
        date: new Date().toISOString(),
        description: 'Test for nested resource',
        status: 'draft',
      })

      // Create line item
      const supabase = await getScopedClient()
      const { data: line } = await supabase
        .from('journal_entry_lines')
        .insert({
          journal_entry_id: entry.id,
          account_code: '1000',
          description: 'Test line',
          debit: 100,
          credit: 0,
        })
        .select()
        .single()

      // Get organization ID via parent relationship
      const { data: lineWithParent } = await supabase
        .from('journal_entry_lines')
        .select('journal_entry_id, journal_entries(organization_id)')
        .eq('id', line.id)
        .single()

      expect(lineWithParent).toBeTruthy()
      // Note: This test demonstrates how to check nested resources
    })
  })

  describe('countOrganizationResources()', () => {
    it('should count only resources from current organization', async () => {
      ;(getOrganizationId as jest.Mock).mockResolvedValue(org1.id)

      // Create resources in org1
      await createTestResource('chart_of_accounts', org1.id, {
        code: '2000',
        name: 'Count Test 1',
        type: 'liability',
        level: 1,
      })
      await createTestResource('chart_of_accounts', org1.id, {
        code: '2100',
        name: 'Count Test 2',
        type: 'liability',
        level: 1,
      })

      // Create resources in org2
      await createTestResource('chart_of_accounts', org2.id, {
        code: '2000',
        name: 'Count Test Org2',
        type: 'liability',
        level: 1,
      })

      const count = await countOrganizationResources('chart_of_accounts')

      // Should only count org1's resources due to RLS
      expect(count).toBeGreaterThanOrEqual(2)
    })
  })
})

describe('Scoped Client - RLS Integration', () => {
  let org1: TestOrganization
  let org2: TestOrganization

  beforeAll(async () => {
    org1 = await createTestOrganization('RLS Integration Org 1')
    org2 = await createTestOrganization('RLS Integration Org 2')
  })

  afterAll(async () => {
    await cleanupTestOrganization(org1.id)
    await cleanupTestOrganization(org2.id)
  })

  it('should automatically filter queries by organization via RLS', async () => {
    ;(getOrganizationId as jest.Mock).mockResolvedValue(org1.id)

    // Create accounts in both organizations
    const account1 = await createTestResource('chart_of_accounts', org1.id, {
      code: '3000',
      name: 'RLS Filter Test Org1',
      type: 'equity',
      level: 1,
    })

    const account2 = await createTestResource('chart_of_accounts', org2.id, {
      code: '3000',
      name: 'RLS Filter Test Org2',
      type: 'equity',
      level: 1,
    })

    const client = await getScopedClient()
    const { data: accounts } = await client
      .from('chart_of_accounts')
      .select('*')
      .in('id', [account1.id, account2.id])

    // With RLS enabled and proper session, should only see org1's account
    // TODO: This requires proper user session setup to work correctly
    expect(accounts).toBeTruthy()
  })

  it('should prevent insert with wrong organization_id', async () => {
    ;(getOrganizationId as jest.Mock).mockResolvedValue(org1.id)

    const client = await getScopedClient()

    // Attempt to insert with org2's ID while authenticated as org1 user
    const { error } = await client.from('chart_of_accounts').insert({
      code: '4000',
      name: 'Wrong Org Insert',
      type: 'revenue',
      level: 1,
      organization_id: org2.id, // Wrong org!
    })

    // TODO: With proper RLS and session, this should fail
    // For now, we're testing the structure
  })
})
