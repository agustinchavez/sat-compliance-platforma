/**
 * Multi-Tenant Middleware Tests
 *
 * Tests for tenant context middleware and validation functions
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals'
import {
  requireOrganization,
  requireResourceAccess,
  withTenantContext,
  withTenantValidation,
  extractTenantContext,
} from '../middleware'
import { TenantContextError, TenantIsolationError } from '../types'

// Mock dependencies
jest.mock('../context', () => ({
  getCurrentOrganization: jest.fn(),
  getOrganizationId: jest.fn(),
}))

jest.mock('../isolation', () => ({
  validateResourceInOrganization: jest.fn(),
}))

import { getCurrentOrganization, getOrganizationId } from '../context'
import { validateResourceInOrganization } from '../isolation'

describe('Middleware - Organization Context', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('requireOrganization()', () => {
    it('should return organization ID when context exists', async () => {
      const mockOrgId = 'org-123'
      ;(getOrganizationId as jest.Mock).mockResolvedValue(mockOrgId)

      const orgId = await requireOrganization()

      expect(orgId).toBe(mockOrgId)
      expect(getOrganizationId).toHaveBeenCalledTimes(1)
    })

    it('should throw error when organization context is missing', async () => {
      ;(getOrganizationId as jest.Mock).mockRejectedValue(
        new TenantContextError('Organization context is missing')
      )

      await expect(requireOrganization()).rejects.toThrow(TenantContextError)
    })
  })

  describe('extractTenantContext()', () => {
    it('should extract tenant context from current session', async () => {
      const mockOrg = {
        id: 'org-456',
        name: 'Test Organization',
        rfc: 'TEST123456789',
        legalName: 'Test Organization SA',
        status: 'active' as const,
        plan: 'professional' as const,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }

      ;(getCurrentOrganization as jest.Mock).mockResolvedValue(mockOrg)

      const context = await extractTenantContext()

      expect(context.organizationId).toBe(mockOrg.id)
      expect(context.organization).toEqual(mockOrg)
      expect(context.timestamp).toBeTruthy()
    })

    it('should throw error when extraction fails', async () => {
      ;(getCurrentOrganization as jest.Mock).mockRejectedValue(
        new Error('Failed to get organization')
      )

      await expect(extractTenantContext()).rejects.toThrow()
    })
  })

  describe('requireResourceAccess()', () => {
    it('should succeed when resource belongs to organization', async () => {
      ;(validateResourceInOrganization as jest.Mock).mockResolvedValue(undefined)

      await expect(requireResourceAccess('invoice', 'inv-123')).resolves.not.toThrow()

      expect(validateResourceInOrganization).toHaveBeenCalledWith('invoice', 'inv-123')
    })

    it('should throw error when resource belongs to different organization', async () => {
      ;(validateResourceInOrganization as jest.Mock).mockRejectedValue(
        new TenantIsolationError('Resource not found or access denied')
      )

      await expect(requireResourceAccess('invoice', 'inv-456')).rejects.toThrow(
        TenantIsolationError
      )
    })

    it('should validate different resource types', async () => {
      ;(validateResourceInOrganization as jest.Mock).mockResolvedValue(undefined)

      await requireResourceAccess('customer', 'cust-123')
      await requireResourceAccess('product', 'prod-456')
      await requireResourceAccess('expense', 'exp-789')

      expect(validateResourceInOrganization).toHaveBeenCalledTimes(3)
    })
  })
})

describe('Middleware - Higher-Order Functions', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('withTenantContext()', () => {
    it('should inject tenant context into handler', async () => {
      const mockContext = {
        organizationId: 'org-789',
        organization: {
          id: 'org-789',
          name: 'Test Org',
          rfc: 'TEST987654321',
          legalName: 'Test Org SA',
          status: 'active' as const,
          plan: 'basic' as const,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        userId: '',
        userRole: '',
        timestamp: Date.now(),
      }

      ;(getCurrentOrganization as jest.Mock).mockResolvedValue(mockContext.organization)

      const mockHandler = jest.fn((context, arg1, arg2) => {
        return { context, arg1, arg2 }
      })

      const wrappedHandler = withTenantContext(mockHandler)
      const result = await wrappedHandler('test-arg-1', 'test-arg-2')

      expect(result.context.organizationId).toBe(mockContext.organizationId)
      expect(result.arg1).toBe('test-arg-1')
      expect(result.arg2).toBe('test-arg-2')
    })

    it('should propagate errors from handler', async () => {
      const mockOrg = {
        id: 'org-error',
        name: 'Error Org',
        rfc: 'ERROR123456789',
        legalName: 'Error Org SA',
        status: 'active' as const,
        plan: 'basic' as const,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }

      ;(getCurrentOrganization as jest.Mock).mockResolvedValue(mockOrg)

      const mockHandler = jest.fn(() => {
        throw new Error('Handler error')
      })

      const wrappedHandler = withTenantContext(mockHandler)

      await expect(wrappedHandler()).rejects.toThrow('Handler error')
    })
  })

  describe('withTenantValidation()', () => {
    it('should validate organization context before executing action', async () => {
      ;(getOrganizationId as jest.Mock).mockResolvedValue('org-123')

      const mockAction = jest.fn((data) => ({ success: true, data }))
      const wrappedAction = withTenantValidation(mockAction)

      const result = await wrappedAction({ test: 'data' })

      expect(getOrganizationId).toHaveBeenCalled()
      expect(result.success).toBe(true)
      expect(result.data).toEqual({ test: 'data' })
    })

    it('should throw error if validation fails', async () => {
      ;(getOrganizationId as jest.Mock).mockRejectedValue(
        new TenantContextError('No organization context')
      )

      const mockAction = jest.fn()
      const wrappedAction = withTenantValidation(mockAction)

      await expect(wrappedAction({ test: 'data' })).rejects.toThrow(TenantContextError)
      expect(mockAction).not.toHaveBeenCalled()
    })

    it('should pass all arguments to wrapped action', async () => {
      ;(getOrganizationId as jest.Mock).mockResolvedValue('org-456')

      const mockAction = jest.fn((arg1, arg2, arg3) => ({ arg1, arg2, arg3 }))
      const wrappedAction = withTenantValidation(mockAction)

      const result = await wrappedAction('a', 'b', 'c')

      expect(result).toEqual({ arg1: 'a', arg2: 'b', arg3: 'c' })
    })
  })
})

describe('Middleware - API Route Integration', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('should work with Next.js API route handlers', async () => {
    const mockOrg = {
      id: 'org-api',
      name: 'API Org',
      rfc: 'API1234567890',
      legalName: 'API Org SA',
      status: 'active' as const,
      plan: 'enterprise' as const,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }

    ;(getCurrentOrganization as jest.Mock).mockResolvedValue(mockOrg)

    // Simulate API route handler
    const apiHandler = withTenantContext(async (context, request: Request) => {
      return Response.json({
        organizationId: context.organizationId,
        message: 'Success',
      })
    })

    const mockRequest = new Request('http://localhost/api/test')
    const response = await apiHandler(mockRequest)
    const data = await response.json()

    expect(data.organizationId).toBe(mockOrg.id)
    expect(data.message).toBe('Success')
  })

  it('should handle server action with validation', async () => {
    ;(getOrganizationId as jest.Mock).mockResolvedValue('org-action')

    // Simulate server action
    const createInvoiceAction = withTenantValidation(async (invoiceData: any) => {
      return {
        id: 'inv-new',
        ...invoiceData,
        organization_id: await getOrganizationId(),
      }
    })

    const result = await createInvoiceAction({
      customer: 'Customer A',
      amount: 1000,
    })

    expect(result.organization_id).toBe('org-action')
    expect(result.customer).toBe('Customer A')
  })
})

describe('Middleware - Error Scenarios', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('should handle missing authentication', async () => {
    ;(getCurrentOrganization as jest.Mock).mockRejectedValue(
      new TenantContextError('User is not authenticated')
    )

    await expect(extractTenantContext()).rejects.toThrow('User is not authenticated')
  })

  it('should handle deleted organization', async () => {
    ;(getCurrentOrganization as jest.Mock).mockRejectedValue(
      new Error('Organization not found')
    )

    await expect(extractTenantContext()).rejects.toThrow('Organization not found')
  })

  it('should handle resource validation failure', async () => {
    ;(validateResourceInOrganization as jest.Mock).mockRejectedValue(
      new TenantIsolationError('Cross-organization access denied')
    )

    await expect(requireResourceAccess('invoice', 'cross-org-inv')).rejects.toThrow(
      TenantIsolationError
    )
  })
})
