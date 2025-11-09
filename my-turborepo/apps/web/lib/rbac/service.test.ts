import { describe, it, expect, vi, beforeEach } from 'vitest'
import { checkPermission, getUserPermissions, getUserRole } from './service'

// Mock dependencies
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(() => ({
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: vi.fn(),
        })),
      })),
      insert: vi.fn(() => ({
        select: vi.fn(() => ({
          single: vi.fn(),
        })),
      })),
      update: vi.fn(() => ({
        eq: vi.fn(),
      })),
      delete: vi.fn(() => ({
        eq: vi.fn(),
      })),
    })),
  })),
}))

vi.mock('./cache', () => ({
  getCachedPermissions: vi.fn(),
  setCachedPermissions: vi.fn(),
  invalidateCache: vi.fn(),
  getCacheStats: vi.fn(() => ({
    exists: false,
    ttl: null,
  })),
}))

describe('RBAC Service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('checkPermission', () => {
    it('should grant owner full permissions', async () => {
      const { createClient } = await import('@/lib/supabase/server')
      const { getCachedPermissions } = await import('./cache')

      // Mock cache miss
      vi.mocked(getCachedPermissions).mockResolvedValue(null)

      // Mock database response
      const mockSupabase = createClient()
      vi.mocked(mockSupabase.from).mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: {
                id: 'user-1',
                role: 'owner',
                organization_id: 'org-1',
              },
              error: null,
            }),
          }),
        }),
      } as any)

      const result = await checkPermission('user-1', 'invoice', 'create')
      expect(result).toBe(true)
    })

    it('should deny user from creating invoices', async () => {
      const { createClient } = await import('@/lib/supabase/server')
      const { getCachedPermissions } = await import('./cache')

      vi.mocked(getCachedPermissions).mockResolvedValue(null)

      const mockSupabase = createClient()
      vi.mocked(mockSupabase.from).mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: {
                id: 'user-2',
                role: 'user',
                organization_id: 'org-1',
              },
              error: null,
            }),
          }),
        }),
      } as any)

      const result = await checkPermission('user-2', 'invoice', 'create')
      expect(result).toBe(false)
    })

    it('should allow accountant to read invoices', async () => {
      const { createClient } = await import('@/lib/supabase/server')
      const { getCachedPermissions } = await import('./cache')

      vi.mocked(getCachedPermissions).mockResolvedValue(null)

      const mockSupabase = createClient()
      vi.mocked(mockSupabase.from).mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: {
                id: 'user-3',
                role: 'accountant',
                organization_id: 'org-1',
              },
              error: null,
            }),
          }),
        }),
      } as any)

      const result = await checkPermission('user-3', 'invoice', 'read')
      expect(result).toBe(true)
    })

    it('should use cached permissions when available', async () => {
      const { getCachedPermissions, setCachedPermissions } = await import('./cache')

      // Mock cache hit
      vi.mocked(getCachedPermissions).mockResolvedValue({
        role: 'admin',
        permissions: {
          invoice: ['create', 'read', 'update', 'approve', 'cancel', 'export'],
          customer: ['create', 'read', 'update', 'delete', 'export', 'import'],
          product: ['create', 'read', 'update', 'delete'],
          expense: ['create', 'read', 'update', 'delete', 'approve', 'reject'],
          user: ['read', 'invite'],
          organization: ['read'],
          report: ['read', 'export'],
          settings: ['read', 'update'],
        },
      })

      const result = await checkPermission('user-4', 'invoice', 'create')
      expect(result).toBe(true)

      // Should not call setCachedPermissions since cache was hit
      expect(getCachedPermissions).toHaveBeenCalled()
    })

    it('should return false for invalid resource', async () => {
      const { createClient } = await import('@/lib/supabase/server')
      const { getCachedPermissions } = await import('./cache')

      vi.mocked(getCachedPermissions).mockResolvedValue(null)

      const mockSupabase = createClient()
      vi.mocked(mockSupabase.from).mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: {
                id: 'user-5',
                role: 'owner',
                organization_id: 'org-1',
              },
              error: null,
            }),
          }),
        }),
      } as any)

      const result = await checkPermission('user-5', 'invalid-resource' as any, 'read')
      expect(result).toBe(false)
    })

    it('should return false for invalid action', async () => {
      const { createClient } = await import('@/lib/supabase/server')
      const { getCachedPermissions } = await import('./cache')

      vi.mocked(getCachedPermissions).mockResolvedValue(null)

      const mockSupabase = createClient()
      vi.mocked(mockSupabase.from).mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: {
                id: 'user-6',
                role: 'owner',
                organization_id: 'org-1',
              },
              error: null,
            }),
          }),
        }),
      } as any)

      const result = await checkPermission('user-6', 'invoice', 'invalid-action' as any)
      expect(result).toBe(false)
    })
  })

  describe('getUserPermissions', () => {
    it('should return owner permissions', async () => {
      const { createClient } = await import('@/lib/supabase/server')
      const { getCachedPermissions } = await import('./cache')

      vi.mocked(getCachedPermissions).mockResolvedValue(null)

      const mockSupabase = createClient()
      vi.mocked(mockSupabase.from).mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: {
                id: 'user-1',
                role: 'owner',
                organization_id: 'org-1',
              },
              error: null,
            }),
          }),
        }),
      } as any)

      const permissions = await getUserPermissions('user-1')

      expect(permissions).toBeDefined()
      expect(permissions.invoice).toContain('create')
      expect(permissions.invoice).toContain('read')
      expect(permissions.invoice).toContain('delete')
    })

    it('should return accountant permissions', async () => {
      const { createClient } = await import('@/lib/supabase/server')
      const { getCachedPermissions } = await import('./cache')

      vi.mocked(getCachedPermissions).mockResolvedValue(null)

      const mockSupabase = createClient()
      vi.mocked(mockSupabase.from).mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: {
                id: 'user-2',
                role: 'accountant',
                organization_id: 'org-1',
              },
              error: null,
            }),
          }),
        }),
      } as any)

      const permissions = await getUserPermissions('user-2')

      expect(permissions).toBeDefined()
      expect(permissions.invoice).toContain('read')
      expect(permissions.invoice).not.toContain('delete')
      expect(permissions.expense).toContain('approve')
    })

    it('should use cached permissions', async () => {
      const { getCachedPermissions } = await import('./cache')

      const mockCachedPerms = {
        role: 'user',
        permissions: {
          invoice: ['read'],
          customer: ['read'],
          product: ['read'],
          expense: ['read'],
          user: ['read'],
          organization: ['read'],
          report: ['read'],
          settings: ['read'],
        },
      }

      vi.mocked(getCachedPermissions).mockResolvedValue(mockCachedPerms)

      const permissions = await getUserPermissions('user-3')

      expect(permissions).toEqual(mockCachedPerms.permissions)
      expect(getCachedPermissions).toHaveBeenCalled()
    })
  })

  describe('getUserRole', () => {
    it('should return user role from database', async () => {
      const { createClient } = await import('@/lib/supabase/server')

      const mockSupabase = createClient()
      vi.mocked(mockSupabase.from).mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: {
                id: 'user-1',
                role: 'admin',
                organization_id: 'org-1',
              },
              error: null,
            }),
          }),
        }),
      } as any)

      const role = await getUserRole('user-1')
      expect(role).toBe('admin')
    })

    it('should return null if user not found', async () => {
      const { createClient } = await import('@/lib/supabase/server')

      const mockSupabase = createClient()
      vi.mocked(mockSupabase.from).mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: null,
              error: { message: 'User not found' },
            }),
          }),
        }),
      } as any)

      const role = await getUserRole('nonexistent-user')
      expect(role).toBeNull()
    })
  })
})
