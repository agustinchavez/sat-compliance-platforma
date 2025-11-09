import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  requirePermission,
  hasPermission,
  requireRole,
  requireOwner,
  requireAdminOrOwner,
} from './middleware'
import { UnauthorizedError, ForbiddenError } from './types'

// Mock dependencies
vi.mock('@/lib/auth', () => ({
  getCurrentUser: vi.fn(),
}))

vi.mock('./service', () => ({
  checkPermission: vi.fn(),
  checkResourcePermission: vi.fn(),
}))

describe('RBAC Middleware', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('requirePermission', () => {
    it('should allow access when user has permission', async () => {
      const { getCurrentUser } = await import('@/lib/auth')
      const { checkPermission } = await import('./service')

      const mockUser = {
        id: 'user-1',
        authId: 'auth-1',
        email: 'admin@test.com',
        fullName: 'Admin User',
        role: 'admin' as const,
        organizationId: 'org-1',
        emailVerified: true,
        organization: {
          id: 'org-1',
          name: 'Test Org',
          rfc: 'TEST123456XYZ',
          plan: 'enterprise',
        },
      }

      vi.mocked(getCurrentUser).mockResolvedValue(mockUser)
      vi.mocked(checkPermission).mockResolvedValue(true)

      const result = await requirePermission('invoice', 'create')

      expect(result).toEqual(mockUser)
      expect(checkPermission).toHaveBeenCalledWith('user-1', 'invoice', 'create')
    })

    it('should throw UnauthorizedError when user not authenticated', async () => {
      const { getCurrentUser } = await import('@/lib/auth')

      vi.mocked(getCurrentUser).mockResolvedValue(null)

      await expect(
        requirePermission('invoice', 'create')
      ).rejects.toThrow(UnauthorizedError)
    })

    it('should throw ForbiddenError when user lacks permission', async () => {
      const { getCurrentUser } = await import('@/lib/auth')
      const { checkPermission } = await import('./service')

      const mockUser = {
        id: 'user-2',
        authId: 'auth-2',
        email: 'user@test.com',
        fullName: 'Regular User',
        role: 'user' as const,
        organizationId: 'org-1',
        emailVerified: true,
        organization: {
          id: 'org-1',
          name: 'Test Org',
          rfc: 'TEST123456XYZ',
          plan: 'basic',
        },
      }

      vi.mocked(getCurrentUser).mockResolvedValue(mockUser)
      vi.mocked(checkPermission).mockResolvedValue(false)

      await expect(
        requirePermission('invoice', 'create')
      ).rejects.toThrow(ForbiddenError)
    })
  })

  describe('hasPermission', () => {
    it('should return true when user has permission', async () => {
      const { getCurrentUser } = await import('@/lib/auth')
      const { checkPermission } = await import('./service')

      const mockUser = {
        id: 'user-1',
        authId: 'auth-1',
        email: 'admin@test.com',
        fullName: 'Admin User',
        role: 'admin' as const,
        organizationId: 'org-1',
        emailVerified: true,
        organization: {
          id: 'org-1',
          name: 'Test Org',
          rfc: 'TEST123456XYZ',
          plan: 'enterprise',
        },
      }

      vi.mocked(getCurrentUser).mockResolvedValue(mockUser)
      vi.mocked(checkPermission).mockResolvedValue(true)

      const result = await hasPermission('invoice', 'read')

      expect(result).toBe(true)
    })

    it('should return false when user not authenticated', async () => {
      const { getCurrentUser } = await import('@/lib/auth')

      vi.mocked(getCurrentUser).mockResolvedValue(null)

      const result = await hasPermission('invoice', 'create')

      expect(result).toBe(false)
    })

    it('should return false when user lacks permission', async () => {
      const { getCurrentUser } = await import('@/lib/auth')
      const { checkPermission } = await import('./service')

      const mockUser = {
        id: 'user-2',
        authId: 'auth-2',
        email: 'user@test.com',
        fullName: 'Regular User',
        role: 'user' as const,
        organizationId: 'org-1',
        emailVerified: true,
        organization: {
          id: 'org-1',
          name: 'Test Org',
          rfc: 'TEST123456XYZ',
          plan: 'basic',
        },
      }

      vi.mocked(getCurrentUser).mockResolvedValue(mockUser)
      vi.mocked(checkPermission).mockResolvedValue(false)

      const result = await hasPermission('invoice', 'delete')

      expect(result).toBe(false)
    })
  })

  describe('requireRole', () => {
    it('should allow access for matching single role', async () => {
      const { getCurrentUser } = await import('@/lib/auth')

      const mockUser = {
        id: 'user-1',
        authId: 'auth-1',
        email: 'owner@test.com',
        fullName: 'Owner User',
        role: 'owner' as const,
        organizationId: 'org-1',
        emailVerified: true,
        organization: {
          id: 'org-1',
          name: 'Test Org',
          rfc: 'TEST123456XYZ',
          plan: 'enterprise',
        },
      }

      vi.mocked(getCurrentUser).mockResolvedValue(mockUser)

      const result = await requireRole('owner')

      expect(result).toEqual(mockUser)
    })

    it('should allow access for matching role in array', async () => {
      const { getCurrentUser } = await import('@/lib/auth')

      const mockUser = {
        id: 'user-2',
        authId: 'auth-2',
        email: 'admin@test.com',
        fullName: 'Admin User',
        role: 'admin' as const,
        organizationId: 'org-1',
        emailVerified: true,
        organization: {
          id: 'org-1',
          name: 'Test Org',
          rfc: 'TEST123456XYZ',
          plan: 'enterprise',
        },
      }

      vi.mocked(getCurrentUser).mockResolvedValue(mockUser)

      const result = await requireRole(['owner', 'admin'])

      expect(result).toEqual(mockUser)
    })

    it('should throw UnauthorizedError when not authenticated', async () => {
      const { getCurrentUser } = await import('@/lib/auth')

      vi.mocked(getCurrentUser).mockResolvedValue(null)

      await expect(
        requireRole('admin')
      ).rejects.toThrow(UnauthorizedError)
    })

    it('should throw ForbiddenError when role does not match', async () => {
      const { getCurrentUser } = await import('@/lib/auth')

      const mockUser = {
        id: 'user-3',
        authId: 'auth-3',
        email: 'user@test.com',
        fullName: 'Regular User',
        role: 'user' as const,
        organizationId: 'org-1',
        emailVerified: true,
        organization: {
          id: 'org-1',
          name: 'Test Org',
          rfc: 'TEST123456XYZ',
          plan: 'basic',
        },
      }

      vi.mocked(getCurrentUser).mockResolvedValue(mockUser)

      await expect(
        requireRole('admin')
      ).rejects.toThrow(ForbiddenError)
    })
  })

  describe('requireOwner', () => {
    it('should allow access for owner', async () => {
      const { getCurrentUser } = await import('@/lib/auth')

      const mockUser = {
        id: 'user-1',
        authId: 'auth-1',
        email: 'owner@test.com',
        fullName: 'Owner User',
        role: 'owner' as const,
        organizationId: 'org-1',
        emailVerified: true,
        organization: {
          id: 'org-1',
          name: 'Test Org',
          rfc: 'TEST123456XYZ',
          plan: 'enterprise',
        },
      }

      vi.mocked(getCurrentUser).mockResolvedValue(mockUser)

      const result = await requireOwner()

      expect(result).toEqual(mockUser)
    })

    it('should deny access for non-owner', async () => {
      const { getCurrentUser } = await import('@/lib/auth')

      const mockUser = {
        id: 'user-2',
        authId: 'auth-2',
        email: 'admin@test.com',
        fullName: 'Admin User',
        role: 'admin' as const,
        organizationId: 'org-1',
        emailVerified: true,
        organization: {
          id: 'org-1',
          name: 'Test Org',
          rfc: 'TEST123456XYZ',
          plan: 'enterprise',
        },
      }

      vi.mocked(getCurrentUser).mockResolvedValue(mockUser)

      await expect(
        requireOwner()
      ).rejects.toThrow(ForbiddenError)
    })
  })

  describe('requireAdminOrOwner', () => {
    it('should allow access for owner', async () => {
      const { getCurrentUser } = await import('@/lib/auth')

      const mockUser = {
        id: 'user-1',
        authId: 'auth-1',
        email: 'owner@test.com',
        fullName: 'Owner User',
        role: 'owner' as const,
        organizationId: 'org-1',
        emailVerified: true,
        organization: {
          id: 'org-1',
          name: 'Test Org',
          rfc: 'TEST123456XYZ',
          plan: 'enterprise',
        },
      }

      vi.mocked(getCurrentUser).mockResolvedValue(mockUser)

      const result = await requireAdminOrOwner()

      expect(result).toEqual(mockUser)
    })

    it('should allow access for admin', async () => {
      const { getCurrentUser } = await import('@/lib/auth')

      const mockUser = {
        id: 'user-2',
        authId: 'auth-2',
        email: 'admin@test.com',
        fullName: 'Admin User',
        role: 'admin' as const,
        organizationId: 'org-1',
        emailVerified: true,
        organization: {
          id: 'org-1',
          name: 'Test Org',
          rfc: 'TEST123456XYZ',
          plan: 'enterprise',
        },
      }

      vi.mocked(getCurrentUser).mockResolvedValue(mockUser)

      const result = await requireAdminOrOwner()

      expect(result).toEqual(mockUser)
    })

    it('should deny access for accountant', async () => {
      const { getCurrentUser } = await import('@/lib/auth')

      const mockUser = {
        id: 'user-3',
        authId: 'auth-3',
        email: 'accountant@test.com',
        fullName: 'Accountant User',
        role: 'accountant' as const,
        organizationId: 'org-1',
        emailVerified: true,
        organization: {
          id: 'org-1',
          name: 'Test Org',
          rfc: 'TEST123456XYZ',
          plan: 'basic',
        },
      }

      vi.mocked(getCurrentUser).mockResolvedValue(mockUser)

      await expect(
        requireAdminOrOwner()
      ).rejects.toThrow(ForbiddenError)
    })

    it('should deny access for regular user', async () => {
      const { getCurrentUser } = await import('@/lib/auth')

      const mockUser = {
        id: 'user-4',
        authId: 'auth-4',
        email: 'user@test.com',
        fullName: 'Regular User',
        role: 'user' as const,
        organizationId: 'org-1',
        emailVerified: true,
        organization: {
          id: 'org-1',
          name: 'Test Org',
          rfc: 'TEST123456XYZ',
          plan: 'basic',
        },
      }

      vi.mocked(getCurrentUser).mockResolvedValue(mockUser)

      await expect(
        requireAdminOrOwner()
      ).rejects.toThrow(ForbiddenError)
    })
  })
})
