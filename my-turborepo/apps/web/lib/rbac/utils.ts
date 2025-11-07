/**
 * RBAC Utility Functions
 *
 * Helper functions for role and permission operations
 */

import type { Role, Resource, Action, ResourcePermissions } from './types'
import { ROLE_HIERARCHY } from './types'
import { RESOURCE_NAMES, ACTION_DESCRIPTIONS } from './permissions'

// ============================================
// ROLE UTILITIES
// ============================================

/**
 * Check if a user has owner role
 */
export function isOwnerRole(role: Role): boolean {
  return role === 'owner'
}

/**
 * Check if a user has admin or owner role
 */
export function isAdminOrAbove(role: Role): boolean {
  return role === 'owner' || role === 'admin'
}

/**
 * Check if a user has accountant or higher role
 */
export function isAccountantOrAbove(role: Role): boolean {
  return role === 'owner' || role === 'admin' || role === 'accountant'
}

/**
 * Check if a user can manage other users
 * Only owner and admin can manage users
 */
export function canManageUsers(role: Role): boolean {
  return role === 'owner' || role === 'admin'
}

/**
 * Check if a user can manage organization settings
 * Only owner and admin can manage settings
 */
export function canManageSettings(role: Role): boolean {
  return role === 'owner' || role === 'admin'
}

/**
 * Compare two roles and return hierarchy comparison
 * @returns number: positive if role1 > role2, negative if role1 < role2, 0 if equal
 */
export function compareRoles(role1: Role, role2: Role): number {
  return ROLE_HIERARCHY[role1] - ROLE_HIERARCHY[role2]
}

/**
 * Check if role1 has higher or equal authority than role2
 */
export function hasHigherOrEqualRole(role1: Role, role2: Role): boolean {
  return ROLE_HIERARCHY[role1] >= ROLE_HIERARCHY[role2]
}

/**
 * Check if role1 has strictly higher authority than role2
 */
export function hasHigherRole(role1: Role, role2: Role): boolean {
  return ROLE_HIERARCHY[role1] > ROLE_HIERARCHY[role2]
}

/**
 * Get role display name
 */
export function getRoleDisplayName(role: Role): string {
  const names: Record<Role, string> = {
    owner: 'Owner',
    admin: 'Administrator',
    accountant: 'Accountant',
    user: 'User',
  }
  return names[role]
}

/**
 * Get role description
 */
export function getRoleDescription(role: Role): string {
  const descriptions: Record<Role, string> = {
    owner: 'Full access to all features and settings',
    admin: 'Manage users, customers, products, and invoices',
    accountant: 'Manage invoices, expenses, and financial reports',
    user: 'Create invoices and expenses with limited access',
  }
  return descriptions[role]
}

/**
 * Get role badge color for UI
 */
export function getRoleBadgeColor(role: Role): string {
  const colors: Record<Role, string> = {
    owner: 'purple',
    admin: 'blue',
    accountant: 'green',
    user: 'gray',
  }
  return colors[role]
}

// ============================================
// PERMISSION UTILITIES
// ============================================

/**
 * Format permission for display
 * @example formatPermission('invoice', 'create') // "Create Invoice"
 */
export function formatPermission(resource: Resource, action: Action): string {
  const resourceName = RESOURCE_NAMES[resource]?.singular || resource
  const actionName = ACTION_DESCRIPTIONS[action] || action

  return `${actionName} - ${resourceName}`
}

/**
 * Get permission description for UI
 */
export function getPermissionDescription(
  resource: Resource,
  action: Action
): string {
  const resourceName = RESOURCE_NAMES[resource]?.plural || resource
  const actionDesc = ACTION_DESCRIPTIONS[action] || action

  return `${actionDesc} for ${resourceName}`
}

/**
 * Check if action is destructive (delete, cancel, reject)
 */
export function isDestructiveAction(action: Action): boolean {
  return ['delete', 'cancel', 'reject'].includes(action)
}

/**
 * Check if action is read-only
 */
export function isReadOnlyAction(action: Action): boolean {
  return action === 'read'
}

/**
 * Check if action requires approval workflow
 */
export function requiresApproval(action: Action): boolean {
  return ['approve', 'reject'].includes(action)
}

/**
 * Get action icon for UI
 */
export function getActionIcon(action: Action): string {
  const icons: Record<Action, string> = {
    create: '➕',
    read: '👁️',
    update: '✏️',
    delete: '🗑️',
    approve: '✅',
    reject: '❌',
    cancel: '🚫',
    send: '📧',
    download: '⬇️',
    stamp: '🔖',
    export: '📤',
    invite: '👥',
  }
  return icons[action] || '•'
}

/**
 * Get action color for UI
 */
export function getActionColor(action: Action): string {
  if (isDestructiveAction(action)) return 'red'
  if (requiresApproval(action)) return 'yellow'
  if (isReadOnlyAction(action)) return 'gray'
  return 'blue'
}

// ============================================
// RESOURCE UTILITIES
// ============================================

/**
 * Get resource display name
 */
export function getResourceDisplayName(
  resource: Resource,
  plural = false
): string {
  const names = RESOURCE_NAMES[resource]
  return plural ? names?.plural : names?.singular
}

/**
 * Get resource icon for UI
 */
export function getResourceIcon(resource: Resource): string {
  const icons: Record<Resource, string> = {
    invoice: '📄',
    customer: '👤',
    product: '📦',
    expense: '💰',
    user: '👥',
    organization: '🏢',
    report: '📊',
    settings: '⚙️',
  }
  return icons[resource] || '•'
}

// ============================================
// PERMISSION SET UTILITIES
// ============================================

/**
 * Count total permissions in a permission set
 */
export function countPermissions(permissions: ResourcePermissions): number {
  return Object.values(permissions).reduce(
    (total, actions) => total + (actions?.length || 0),
    0
  )
}

/**
 * Check if permission set is empty
 */
export function hasNoPermissions(permissions: ResourcePermissions): boolean {
  return countPermissions(permissions) === 0
}

/**
 * Check if permission set includes specific action
 */
export function hasAction(
  permissions: ResourcePermissions,
  resource: Resource,
  action: Action
): boolean {
  return permissions[resource]?.includes(action) || false
}

/**
 * Get all resources user has access to
 */
export function getAccessibleResources(
  permissions: ResourcePermissions
): Resource[] {
  return Object.keys(permissions).filter(
    (resource) => permissions[resource as Resource]?.length > 0
  ) as Resource[]
}

/**
 * Format permissions for display
 */
export function formatPermissionsForDisplay(
  permissions: ResourcePermissions
): Array<{ resource: Resource; actions: Action[] }> {
  return Object.entries(permissions)
    .filter(([_, actions]) => actions && actions.length > 0)
    .map(([resource, actions]) => ({
      resource: resource as Resource,
      actions: actions as Action[],
    }))
}

// ============================================
// VALIDATION UTILITIES
// ============================================

/**
 * Validate role string
 */
export function isValidRole(role: string): role is Role {
  return ['owner', 'admin', 'accountant', 'user'].includes(role)
}

/**
 * Validate resource string
 */
export function isValidResource(resource: string): resource is Resource {
  return [
    'invoice',
    'customer',
    'product',
    'expense',
    'user',
    'organization',
    'report',
    'settings',
  ].includes(resource)
}

/**
 * Validate action string
 */
export function isValidAction(action: string): action is Action {
  return [
    'create',
    'read',
    'update',
    'delete',
    'approve',
    'reject',
    'cancel',
    'send',
    'download',
    'stamp',
    'export',
    'invite',
  ].includes(action)
}

// ============================================
// DEBUGGING UTILITIES
// ============================================

/**
 * Get human-readable permission summary
 */
export function getPermissionSummary(
  role: Role,
  permissions: ResourcePermissions
): string {
  const resourceCount = getAccessibleResources(permissions).length
  const actionCount = countPermissions(permissions)

  return `Role: ${getRoleDisplayName(role)} | Resources: ${resourceCount} | Actions: ${actionCount}`
}

/**
 * Log permissions (for debugging)
 */
export function logPermissions(
  userId: string,
  role: Role,
  permissions: ResourcePermissions
): void {
  console.log('=== User Permissions ===')
  console.log('User ID:', userId)
  console.log('Role:', getRoleDisplayName(role))
  console.log('Summary:', getPermissionSummary(role, permissions))
  console.log('\nDetailed Permissions:')

  Object.entries(permissions).forEach(([resource, actions]) => {
    if (actions && actions.length > 0) {
      console.log(
        `  ${getResourceIcon(resource as Resource)} ${getResourceDisplayName(resource as Resource, true)}:`,
        actions.join(', ')
      )
    }
  })

  console.log('========================')
}
