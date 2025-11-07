/**
 * RBAC Service - Core Permission Logic
 *
 * Main service for checking permissions, managing roles, etc.
 */

import { createClient } from '@/lib/supabase/server'
import { getCurrentUser } from '@/lib/auth'
import {
  getCachedPermissions,
  setCachedPermissions,
  invalidateCache,
  warmCache,
} from './cache'
import { getRolePermissions, isOwnershipAction, SPECIAL_RULES } from './roles'
import type {
  Action,
  Resource,
  Role,
  ResourcePermissions,
  PermissionCheckResult,
  ForbiddenError,
  UnauthorizedError,
} from './types'

// ============================================
// CORE PERMISSION CHECKS
// ============================================

/**
 * Check if user has permission for a resource action
 * This is the main permission check function
 *
 * @param userId - User ID
 * @param resource - Resource type (invoice, customer, etc.)
 * @param action - Action to perform (create, read, etc.)
 * @returns boolean - true if allowed
 */
export async function checkPermission(
  userId: string,
  resource: Resource,
  action: Action
): Promise<boolean> {
  try {
    const user = await getCurrentUser()
    if (!user || user.id !== userId) return false

    // 1. Try cache first
    const cached = await getCachedPermissions(userId, user.organizationId)
    if (cached) {
      const resourcePerms = cached.permissions[resource]
      return resourcePerms ? resourcePerms.includes(action) : false
    }

    // 2. Get from database
    const permissions = await getUserPermissions(userId)

    // 3. Check permission
    const resourcePerms = permissions[resource]
    return resourcePerms ? resourcePerms.includes(action) : false
  } catch (error) {
    console.error('Permission check error:', error)
    return false // Fail-safe: deny on error
  }
}

/**
 * Check permission for a specific resource instance
 * Includes ownership and special rule checks
 *
 * @param userId - User ID
 * @param resource - Resource type
 * @param action - Action to perform
 * @param resourceId - ID of specific resource instance
 * @returns PermissionCheckResult with allowed status and reason
 */
export async function checkResourcePermission(
  userId: string,
  resource: Resource,
  action: Action,
  resourceId: string
): Promise<PermissionCheckResult> {
  try {
    const user = await getCurrentUser()
    if (!user || user.id !== userId) {
      return {
        allowed: false,
        reason: 'User not authenticated',
        source: 'denied',
      }
    }

    // 1. Check base role permission first
    const hasBasePermission = await checkPermission(userId, resource, action)

    if (hasBasePermission) {
      return {
        allowed: true,
        reason: `Role '${user.role}' has permission`,
        source: 'role',
      }
    }

    // 2. Check custom permissions (from database)
    const customPerms = await getCustomPermissions(userId)
    if (customPerms[resource]?.includes(action)) {
      return {
        allowed: true,
        reason: 'Custom permission granted',
        source: 'custom',
      }
    }

    // 3. Check ownership override
    const resourceData = await getResourceData(resource, resourceId)

    if (!resourceData) {
      return {
        allowed: false,
        reason: 'Resource not found',
        source: 'denied',
      }
    }

    // Verify organization isolation
    if (resourceData.organization_id !== user.organizationId) {
      return {
        allowed: false,
        reason: 'Resource belongs to different organization',
        source: 'denied',
      }
    }

    // Check if user owns this resource
    if (
      resourceData.created_by === userId &&
      isOwnershipAction(resource, action)
    ) {
      return {
        allowed: true,
        reason: 'Owner of resource',
        source: 'ownership',
      }
    }

    // 4. Check special rules (e.g., accountant can edit draft invoices)
    const specialRuleResult = await checkSpecialRules(
      user.role,
      resource,
      action,
      resourceData,
      userId
    )

    if (specialRuleResult.allowed) {
      return specialRuleResult
    }

    // 5. Check temporary permissions
    const tempPerms = await getTempPermissions(userId)
    const hasTempPermission = tempPerms.some(
      (tp) =>
        tp.resource === resource &&
        tp.action === action &&
        new Date(tp.expiresAt) > new Date()
    )

    if (hasTempPermission) {
      return {
        allowed: true,
        reason: 'Temporary permission granted',
        source: 'temp',
      }
    }

    // 6. All checks failed - deny
    return {
      allowed: false,
      reason: `Role '${user.role}' lacks permission for ${resource}.${action}`,
      source: 'denied',
    }
  } catch (error) {
    console.error('Resource permission check error:', error)
    return {
      allowed: false,
      reason: 'Error checking permission',
      source: 'denied',
    }
  }
}

/**
 * Get all permissions for a user (with caching)
 */
export async function getUserPermissions(
  userId: string
): Promise<ResourcePermissions> {
  const user = await getCurrentUser()
  if (!user || user.id !== userId) {
    throw new Error('Unauthorized')
  }

  // Try cache first
  const cached = await getCachedPermissions(userId, user.organizationId)
  if (cached) {
    return cached.permissions
  }

  // Get base role permissions
  const rolePermissions = getRolePermissions(user.role)

  // Merge with custom permissions from database
  const customPerms = await getCustomPermissions(userId)
  const mergedPermissions = mergePermissions(rolePermissions, customPerms)

  // Cache for next time
  await setCachedPermissions(
    userId,
    user.organizationId,
    user.role,
    mergedPermissions
  )

  return mergedPermissions
}

/**
 * Get available actions for a resource type based on user's role
 */
export async function getAvailableActions(
  userId: string,
  resource: Resource
): Promise<Action[]> {
  const permissions = await getUserPermissions(userId)
  return permissions[resource] || []
}

// ============================================
// ROLE MANAGEMENT
// ============================================

/**
 * Assign a role to a user (owner/admin only)
 */
export async function assignRole(
  targetUserId: string,
  organizationId: string,
  newRole: Role
): Promise<{ success: boolean; error?: string }> {
  try {
    const currentUser = await getCurrentUser()
    if (!currentUser) {
      return { success: false, error: 'Not authenticated' }
    }

    // Only owner and admin can assign roles
    if (currentUser.role !== 'owner' && currentUser.role !== 'admin') {
      return { success: false, error: 'Insufficient permissions' }
    }

    // Owner can assign any role, admin can only assign user/accountant
    if (
      currentUser.role === 'admin' &&
      (newRole === 'owner' || newRole === 'admin')
    ) {
      return {
        success: false,
        error: 'Admins cannot assign owner or admin roles',
      }
    }

    // Cannot change your own role
    if (targetUserId === currentUser.id) {
      return { success: false, error: 'Cannot change your own role' }
    }

    // Update database
    const supabase = await createClient()
    const { error } = await supabase
      .from('users')
      .update({ role: newRole, updated_at: new Date().toISOString() })
      .eq('id', targetUserId)
      .eq('organization_id', organizationId)

    if (error) {
      return { success: false, error: error.message }
    }

    // Invalidate cache
    await invalidateCache(targetUserId, organizationId)

    // Log activity
    await logSecurityEvent({
      type: 'role_assigned',
      userId: currentUser.id,
      targetUserId,
      organizationId,
      oldRole: undefined, // TODO: Get old role
      newRole,
    })

    return { success: true }
  } catch (error: any) {
    console.error('Error assigning role:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Revoke a user's access (soft delete)
 */
export async function revokeAccess(
  targetUserId: string,
  organizationId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const currentUser = await getCurrentUser()
    if (!currentUser) {
      return { success: false, error: 'Not authenticated' }
    }

    // Only owner and admin can revoke access
    if (currentUser.role !== 'owner' && currentUser.role !== 'admin') {
      return { success: false, error: 'Insufficient permissions' }
    }

    // Cannot revoke own access
    if (targetUserId === currentUser.id) {
      return { success: false, error: 'Cannot revoke your own access' }
    }

    // Soft delete user
    const supabase = await createClient()
    const { error } = await supabase
      .from('users')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', targetUserId)
      .eq('organization_id', organizationId)

    if (error) {
      return { success: false, error: error.message }
    }

    // Invalidate cache
    await invalidateCache(targetUserId, organizationId)

    // Log activity
    await logSecurityEvent({
      type: 'access_revoked',
      userId: currentUser.id,
      targetUserId,
      organizationId,
    })

    return { success: true }
  } catch (error: any) {
    console.error('Error revoking access:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Check if user can access organization
 */
export async function canAccessOrganization(
  userId: string,
  organizationId: string
): Promise<boolean> {
  const user = await getCurrentUser()
  return user?.id === userId && user?.organizationId === organizationId
}

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Get custom permissions from database (users.permissions JSONB column)
 */
async function getCustomPermissions(
  userId: string
): Promise<ResourcePermissions> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('users')
    .select('permissions')
    .eq('id', userId)
    .single()

  return (data?.permissions as ResourcePermissions) || {}
}

/**
 * Get temporary permissions for user
 */
async function getTempPermissions(userId: string): Promise<any[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('users')
    .select('permissions')
    .eq('id', userId)
    .single()

  const permissions = data?.permissions as any
  return permissions?.temp_permissions || []
}

/**
 * Merge role permissions with custom permissions
 */
function mergePermissions(
  rolePerms: ResourcePermissions,
  customPerms: ResourcePermissions
): ResourcePermissions {
  const merged: ResourcePermissions = { ...rolePerms }

  // Merge custom permissions (additive)
  for (const resource in customPerms) {
    const key = resource as Resource
    const existing = merged[key] || []
    const custom = customPerms[key] || []

    // Combine and deduplicate
    merged[key] = [...new Set([...existing, ...custom])]
  }

  return merged
}

/**
 * Get resource data from database
 */
async function getResourceData(
  resource: Resource,
  resourceId: string
): Promise<any> {
  const supabase = await createClient()

  // Map resource type to table name
  const tableMap: Record<Resource, string> = {
    invoice: 'invoices',
    customer: 'customers',
    product: 'products',
    expense: 'expenses',
    user: 'users',
    organization: 'organizations',
    report: 'tax_periods', // Assuming reports come from tax_periods
    settings: 'organizations', // Settings are part of organization
  }

  const table = tableMap[resource]
  const { data } = await supabase.from(table).select('*').eq('id', resourceId).single()

  return data
}

/**
 * Check special permission rules
 */
async function checkSpecialRules(
  role: Role,
  resource: Resource,
  action: Action,
  resourceData: any,
  userId: string
): Promise<PermissionCheckResult> {
  // Check accountant draft invoice rule
  if (
    role === 'accountant' &&
    resource === 'invoice' &&
    action === 'update' &&
    resourceData.status === 'draft'
  ) {
    return {
      allowed: true,
      reason: 'Accountants can edit draft invoices',
      source: 'role',
    }
  }

  return { allowed: false, reason: '', source: 'denied' }
}

/**
 * Log security events
 */
async function logSecurityEvent(event: any): Promise<void> {
  try {
    const supabase = await createClient()
    await supabase.from('activity_log').insert({
      organization_id: event.organizationId,
      user_id: event.userId,
      action: event.type,
      entity_type: 'user',
      entity_id: event.targetUserId,
      old_values: event.oldRole ? { role: event.oldRole } : null,
      new_values: event.newRole ? { role: event.newRole } : null,
      created_at: new Date().toISOString(),
    })
  } catch (error) {
    console.error('Error logging security event:', error)
    // Don't throw - logging is not critical
  }
}

/**
 * Invalidate permission cache
 */
export async function invalidatePermissionCache(userId: string): Promise<void> {
  const user = await getCurrentUser()
  if (user) {
    await invalidateCache(userId, user.organizationId)
  }
}
