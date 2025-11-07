/**
 * RBAC Middleware
 *
 * Convenient wrappers for requiring permissions in:
 * - Server Actions
 * - API Routes
 * - tRPC procedures
 */

import { getCurrentUser, type CurrentUser } from '@/lib/auth'
import { checkPermission, checkResourcePermission } from './service'
import type { Action, Resource, Role } from './types'
import { ForbiddenError, UnauthorizedError } from './types'

// ============================================
// PERMISSION MIDDLEWARE
// ============================================

/**
 * Require specific permission for a resource
 * Throws error if permission is denied
 *
 * @example
 * ```typescript
 * export async function createInvoiceAction(data) {
 *   'use server'
 *   await requirePermission('invoice', 'create')
 *   // ... rest of logic
 * }
 * ```
 */
export async function requirePermission(
  resource: Resource,
  action: Action
): Promise<CurrentUser> {
  const user = await getCurrentUser()

  if (!user) {
    throw new UnauthorizedError('Authentication required')
  }

  const hasPermission = await checkPermission(user.id, resource, action)

  if (!hasPermission) {
    throw new ForbiddenError(
      `Missing permission: ${resource}.${action} (role: ${user.role})`
    )
  }

  return user
}

/**
 * Require permission for a specific resource instance
 * Includes ownership and special rule checks
 *
 * @example
 * ```typescript
 * export async function updateInvoiceAction(invoiceId, data) {
 *   'use server'
 *   await requireResourcePermission('invoice', 'update', invoiceId)
 *   // ... rest of logic
 * }
 * ```
 */
export async function requireResourcePermission(
  resource: Resource,
  action: Action,
  resourceId: string
): Promise<CurrentUser> {
  const user = await getCurrentUser()

  if (!user) {
    throw new UnauthorizedError('Authentication required')
  }

  const result = await checkResourcePermission(
    user.id,
    resource,
    action,
    resourceId
  )

  if (!result.allowed) {
    throw new ForbiddenError(result.reason || 'Permission denied')
  }

  return user
}

// ============================================
// ROLE MIDDLEWARE
// ============================================

/**
 * Require user to have specific role(s)
 *
 * @example
 * ```typescript
 * export async function deleteOrganization() {
 *   'use server'
 *   await requireRole('owner')
 *   // ... rest of logic
 * }
 * ```
 */
export async function requireRole(
  allowedRoles: Role | Role[]
): Promise<CurrentUser> {
  const user = await getCurrentUser()

  if (!user) {
    throw new UnauthorizedError('Authentication required')
  }

  const roles = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles]

  if (!roles.includes(user.role)) {
    throw new ForbiddenError(
      `Required role: ${roles.join(' or ')} (current: ${user.role})`
    )
  }

  return user
}

/**
 * Require owner role
 */
export async function requireOwner(): Promise<CurrentUser> {
  return await requireRole('owner')
}

/**
 * Require admin or owner role
 */
export async function requireAdminOrOwner(): Promise<CurrentUser> {
  return await requireRole(['owner', 'admin'])
}

/**
 * Require accountant or higher role
 */
export async function requireAccountantOrAbove(): Promise<CurrentUser> {
  return await requireRole(['owner', 'admin', 'accountant'])
}

// ============================================
// PERMISSION CHECKERS (non-throwing)
// ============================================

/**
 * Check if current user has permission (returns boolean)
 * Use this for conditional UI rendering or branching logic
 *
 * @example
 * ```typescript
 * const canDelete = await hasPermission('invoice', 'delete')
 * if (canDelete) {
 *   // Show delete button
 * }
 * ```
 */
export async function hasPermission(
  resource: Resource,
  action: Action
): Promise<boolean> {
  try {
    const user = await getCurrentUser()
    if (!user) return false

    return await checkPermission(user.id, resource, action)
  } catch {
    return false
  }
}

/**
 * Check if current user has specific role
 */
export async function hasRole(role: Role | Role[]): Promise<boolean> {
  try {
    const user = await getCurrentUser()
    if (!user) return false

    const roles = Array.isArray(role) ? role : [role]
    return roles.includes(user.role)
  } catch {
    return false
  }
}

/**
 * Check if current user is owner
 */
export async function isOwner(): Promise<boolean> {
  return await hasRole('owner')
}

/**
 * Check if current user is admin or owner
 */
export async function isAdminOrOwner(): Promise<boolean> {
  return await hasRole(['owner', 'admin'])
}

/**
 * Check if current user is accountant or higher
 */
export async function isAccountantOrAbove(): Promise<boolean> {
  return await hasRole(['owner', 'admin', 'accountant'])
}

// ============================================
// DATA FILTERING
// ============================================

/**
 * Filter data based on user's permissions
 * Useful for hiding sensitive fields from users without permission
 *
 * @example
 * ```typescript
 * const invoice = await getInvoice(id)
 * const filtered = await filterByPermissions(invoice, 'invoice', user.id)
 * // filtered.cfdiCert might be hidden if user doesn't have permission
 * ```
 */
export async function filterByPermissions<T extends Record<string, any>>(
  data: T,
  resource: Resource,
  userId: string,
  sensitiveFields: (keyof T)[] = []
): Promise<Partial<T>> {
  const canRead = await checkPermission(userId, resource, 'read')

  if (!canRead) {
    return {} // Return empty if user can't even read
  }

  const canUpdate = await checkPermission(userId, resource, 'update')

  // If user can update, show all fields
  if (canUpdate) {
    return data
  }

  // Otherwise, hide sensitive fields
  const filtered = { ...data }
  sensitiveFields.forEach((field) => {
    delete filtered[field]
  })

  return filtered
}

// ============================================
// BATCH PERMISSION CHECKS
// ============================================

/**
 * Check multiple permissions at once
 * Returns a map of resource.action -> boolean
 *
 * @example
 * ```typescript
 * const perms = await checkMultiplePermissions([
 *   ['invoice', 'create'],
 *   ['invoice', 'delete'],
 *   ['customer', 'update'],
 * ])
 * // { 'invoice.create': true, 'invoice.delete': false, ... }
 * ```
 */
export async function checkMultiplePermissions(
  checks: Array<[Resource, Action]>
): Promise<Record<string, boolean>> {
  const user = await getCurrentUser()
  if (!user) {
    // Return all false if not authenticated
    return Object.fromEntries(
      checks.map(([resource, action]) => [`${resource}.${action}`, false])
    )
  }

  const results = await Promise.all(
    checks.map(async ([resource, action]) => {
      const allowed = await checkPermission(user.id, resource, action)
      return [`${resource}.${action}`, allowed] as const
    })
  )

  return Object.fromEntries(results)
}

// ============================================
// ERROR HANDLING HELPERS
// ============================================

/**
 * Wrap async function with permission check
 * Provides cleaner error handling
 */
export function withPermission<T extends any[], R>(
  resource: Resource,
  action: Action,
  fn: (...args: T) => Promise<R>
): (...args: T) => Promise<R> {
  return async (...args: T): Promise<R> => {
    await requirePermission(resource, action)
    return await fn(...args)
  }
}

/**
 * Check permission and return result or null on error
 * Useful for optional features
 */
export async function tryCheckPermission(
  resource: Resource,
  action: Action
): Promise<boolean> {
  try {
    return await hasPermission(resource, action)
  } catch {
    return false
  }
}
