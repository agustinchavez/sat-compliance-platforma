/**
 * Admin Server Actions
 *
 * Protected actions for managing users and permissions
 */

'use server'

import { createClient } from '@/lib/supabase/server'
import { getCurrentUser } from '@/lib/auth'
import {
  requireAdminOrOwner,
  assignRole as assignUserRole,
  revokeAccess as revokeUserAccess,
  invalidatePermissionCache,
} from '@/lib/rbac'
import {
  getCachedPermissions,
  getCacheStats,
  invalidateCache,
  invalidateOrganizationCache,
} from '@/lib/rbac/cache'
import type { Role } from '@/lib/rbac/types'
import { revalidatePath } from 'next/cache'

// ============================================
// USER MANAGEMENT
// ============================================

/**
 * Get all users in current organization
 */
export async function getOrganizationUsers() {
  const currentUser = await requireAdminOrOwner()
  const supabase = await createClient()

  const { data: users, error } = await supabase
    .from('users')
    .select('id, auth_id, email, full_name, role, email_verified, last_login_at, created_at')
    .eq('organization_id', currentUser.organizationId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })

  if (error) {
    throw new Error(`Failed to fetch users: ${error.message}`)
  }

  return users
}

/**
 * Change a user's role
 */
export async function changeUserRole(
  targetUserId: string,
  newRole: Role
): Promise<{ success: boolean; error?: string }> {
  try {
    const currentUser = await requireAdminOrOwner()

    // Use RBAC service to assign role
    const result = await assignUserRole(
      targetUserId,
      currentUser.organizationId,
      newRole
    )

    if (result.success) {
      revalidatePath('/admin/users')
    }

    return result
  } catch (error: any) {
    return {
      success: false,
      error: error.message || 'Failed to change user role',
    }
  }
}

/**
 * Revoke user access (soft delete)
 */
export async function removeUser(
  targetUserId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const currentUser = await requireAdminOrOwner()

    const result = await revokeUserAccess(targetUserId, currentUser.organizationId)

    if (result.success) {
      revalidatePath('/admin/users')
    }

    return result
  } catch (error: any) {
    return {
      success: false,
      error: error.message || 'Failed to remove user',
    }
  }
}

// ============================================
// CACHE MANAGEMENT
// ============================================

/**
 * Get cache statistics for a user
 */
export async function getUserCacheStats(userId: string) {
  await requireAdminOrOwner()

  const currentUser = await getCurrentUser()
  if (!currentUser) return null

  const stats = await getCacheStats(userId, currentUser.organizationId)
  const cached = await getCachedPermissions(userId, currentUser.organizationId)

  return {
    ...stats,
    cachedData: cached,
  }
}

/**
 * Invalidate cache for specific user
 */
export async function invalidateUserCache(
  userId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const currentUser = await requireAdminOrOwner()

    await invalidateCache(userId, currentUser.organizationId)

    return { success: true }
  } catch (error: any) {
    return {
      success: false,
      error: error.message || 'Failed to invalidate cache',
    }
  }
}

/**
 * Invalidate cache for entire organization
 */
export async function invalidateOrgCache(): Promise<{
  success: boolean
  error?: string
}> {
  try {
    const currentUser = await requireAdminOrOwner()

    await invalidateOrganizationCache(currentUser.organizationId)

    return { success: true }
  } catch (error: any) {
    return {
      success: false,
      error: error.message || 'Failed to invalidate organization cache',
    }
  }
}

/**
 * Get all cached users in organization
 */
export async function getOrganizationCacheStats() {
  const currentUser = await requireAdminOrOwner()
  const users = await getOrganizationUsers()

  const stats = await Promise.all(
    users.map(async (user) => {
      const cacheStats = await getCacheStats(user.id, currentUser.organizationId)
      const cached = await getCachedPermissions(user.id, currentUser.organizationId)

      return {
        userId: user.id,
        email: user.email,
        fullName: user.full_name,
        role: user.role,
        cached: cacheStats.exists,
        ttl: cacheStats.ttl,
        cachedData: cached,
      }
    })
  )

  return stats
}

// ============================================
// PERMISSION TESTING
// ============================================

/**
 * Test permission check (for debugging)
 */
export async function testPermission(
  resource: string,
  action: string
): Promise<{
  allowed: boolean
  userId: string
  role: Role
  reason?: string
}> {
  const currentUser = await getCurrentUser()
  if (!currentUser) {
    return {
      allowed: false,
      userId: '',
      role: 'user',
      reason: 'Not authenticated',
    }
  }

  const { checkPermission } = await import('@/lib/rbac')

  const allowed = await checkPermission(
    currentUser.id,
    resource as any,
    action as any
  )

  return {
    allowed,
    userId: currentUser.id,
    role: currentUser.role,
    reason: allowed ? 'Permission granted' : 'Permission denied',
  }
}

/**
 * Get current user's permissions
 */
export async function getCurrentUserPermissions() {
  const currentUser = await getCurrentUser()
  if (!currentUser) return null

  const { getUserPermissions } = await import('@/lib/rbac')
  const permissions = await getUserPermissions(currentUser.id)

  return {
    userId: currentUser.id,
    email: currentUser.email,
    role: currentUser.role,
    permissions,
  }
}
