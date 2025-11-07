/**
 * Role Permission Definitions
 *
 * Defines what permissions each role has for each resource
 */

import type { Role, ResourcePermissions } from './types'

// ============================================
// OWNER PERMISSIONS (Highest Level)
// ============================================

/**
 * Owner has ALL permissions for ALL resources
 * This is the organization owner/creator
 */
export const OWNER_PERMISSIONS: ResourcePermissions = {
  invoice: ['create', 'read', 'update', 'delete', 'approve', 'cancel', 'send', 'download', 'stamp'],
  customer: ['create', 'read', 'update', 'delete'],
  product: ['create', 'read', 'update', 'delete'],
  expense: ['create', 'read', 'update', 'delete', 'approve', 'reject', 'download'],
  user: ['read', 'invite', 'update', 'delete'],
  organization: ['read', 'update', 'delete'],
  report: ['read', 'export'],
  settings: ['read', 'update'],
} as const

// ============================================
// ADMIN PERMISSIONS
// ============================================

/**
 * Admin has most permissions except organization deletion
 * Can manage users, customers, products, and invoices
 */
export const ADMIN_PERMISSIONS: ResourcePermissions = {
  invoice: ['create', 'read', 'update', 'delete', 'approve', 'cancel', 'send', 'download', 'stamp'],
  customer: ['create', 'read', 'update', 'delete'],
  product: ['create', 'read', 'update', 'delete'],
  expense: ['create', 'read', 'update', 'delete', 'approve', 'reject', 'download'],
  user: ['read', 'invite', 'update'], // Can't delete users
  organization: ['read'], // Read-only for organization
  report: ['read', 'export'],
  settings: ['read', 'update'], // Limited settings access
} as const

// ============================================
// ACCOUNTANT PERMISSIONS
// ============================================

/**
 * Accountant has financial focus
 * Can create and manage invoices/expenses
 * Read-only for customers, products, and users
 */
export const ACCOUNTANT_PERMISSIONS: ResourcePermissions = {
  invoice: ['create', 'read', 'update', 'send', 'download', 'stamp'], // No delete or cancel
  customer: ['read'], // Read-only
  product: ['read'], // Read-only
  expense: ['create', 'read', 'update', 'approve', 'reject', 'download'],
  user: ['read'], // Read-only
  organization: ['read'], // Read-only
  report: ['read', 'export'],
  settings: ['read'], // Read-only
} as const

// ============================================
// USER PERMISSIONS (Basic/Limited)
// ============================================

/**
 * User has limited permissions
 * Can create invoices and expenses
 * Can only edit their own creations
 */
export const USER_PERMISSIONS: ResourcePermissions = {
  invoice: ['create', 'read', 'send', 'download'], // Can't update/delete others' invoices
  customer: ['read'], // Read-only
  product: ['read'], // Read-only
  expense: ['create', 'read', 'download'], // Can't approve own expenses
  user: [], // No user management
  organization: ['read'], // Read-only
  report: ['read'], // Limited report access
  settings: ['read'], // Read-only
} as const

// ============================================
// ROLE PERMISSION MAP
// ============================================

/**
 * Map of role -> permissions
 */
export const ROLE_PERMISSIONS: Record<Role, ResourcePermissions> = {
  owner: OWNER_PERMISSIONS,
  admin: ADMIN_PERMISSIONS,
  accountant: ACCOUNTANT_PERMISSIONS,
  user: USER_PERMISSIONS,
}

/**
 * Get permissions for a specific role
 */
export function getRolePermissions(role: Role): ResourcePermissions {
  return ROLE_PERMISSIONS[role] || USER_PERMISSIONS
}

// ============================================
// OWNERSHIP OVERRIDE RULES
// ============================================

/**
 * Actions that users can perform on their OWN resources
 * even if their role doesn't normally allow it
 *
 * Example: A 'user' can update invoices they created,
 * even though USER_PERMISSIONS doesn't include 'update'
 */
export const OWNERSHIP_OVERRIDES: ResourcePermissions = {
  invoice: ['read', 'update', 'delete', 'send'], // Can edit own invoices
  expense: ['read', 'update', 'delete'], // Can edit own expenses
  customer: [], // No ownership override (organization-wide resource)
  product: [], // No ownership override (organization-wide resource)
  user: ['read', 'update'], // Can edit own profile
  organization: [], // No ownership override
  report: [], // No ownership override
  settings: [], // No ownership override
}

/**
 * Check if action is allowed for owned resources
 */
export function isOwnershipAction(
  resource: string,
  action: string
): boolean {
  const overrides = OWNERSHIP_OVERRIDES[resource as keyof typeof OWNERSHIP_OVERRIDES]
  return overrides ? overrides.includes(action as any) : false
}

// ============================================
// SPECIAL PERMISSION RULES
// ============================================

/**
 * Special rules that apply under certain conditions
 */
export const SPECIAL_RULES = {
  /**
   * Accountants can edit draft invoices
   * (even though base permission only allows create)
   */
  accountantDraftInvoice: {
    role: 'accountant' as Role,
    resource: 'invoice' as const,
    action: 'update' as const,
    condition: (resourceData: any) => resourceData.status === 'draft',
  },

  /**
   * Users cannot approve their own expenses
   */
  cannotApprovOwnExpense: {
    role: 'user' as Role,
    resource: 'expense' as const,
    action: 'approve' as const,
    condition: (resourceData: any, userId: string) =>
      resourceData.created_by !== userId,
  },

  /**
   * Only owner can delete organization
   */
  ownerOnlyOrgDelete: {
    role: 'owner' as Role,
    resource: 'organization' as const,
    action: 'delete' as const,
    condition: () => true,
  },

  /**
   * Cannot delete customer with active invoices
   */
  noDeleteCustomerWithInvoices: {
    resource: 'customer' as const,
    action: 'delete' as const,
    condition: async (resourceData: any) => {
      // This will be checked in service layer
      return resourceData.hasActiveInvoices === false
    },
  },
} as const

// ============================================
// ROLE COMPARISON UTILITIES
// ============================================

/**
 * Role hierarchy values (higher = more powerful)
 */
const ROLE_HIERARCHY_VALUES: Record<Role, number> = {
  owner: 4,
  admin: 3,
  accountant: 2,
  user: 1,
}

/**
 * Check if role1 has higher or equal authority than role2
 */
export function hasHigherOrEqualRole(role1: Role, role2: Role): boolean {
  return ROLE_HIERARCHY_VALUES[role1] >= ROLE_HIERARCHY_VALUES[role2]
}

/**
 * Check if role1 has strictly higher authority than role2
 */
export function hasHigherRole(role1: Role, role2: Role): boolean {
  return ROLE_HIERARCHY_VALUES[role1] > ROLE_HIERARCHY_VALUES[role2]
}

/**
 * Get the minimum role required for an action
 */
export function getMinimumRoleForAction(
  resource: string,
  action: string
): Role | null {
  // Find the lowest role that has this permission
  const roles: Role[] = ['user', 'accountant', 'admin', 'owner']

  for (const role of roles) {
    const permissions = ROLE_PERMISSIONS[role]
    const resourcePerms = permissions[resource as keyof typeof permissions]
    if (resourcePerms && resourcePerms.includes(action as any)) {
      return role
    }
  }

  return null // No role has this permission
}
