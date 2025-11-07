/**
 * RBAC Type Definitions
 *
 * Defines all TypeScript types for the Role-Based Access Control system
 */

// ============================================
// USER ROLES
// ============================================

export const ROLES = ['owner', 'admin', 'accountant', 'user'] as const
export type Role = (typeof ROLES)[number]

// ============================================
// RESOURCES
// ============================================

export const RESOURCES = [
  'invoice',
  'customer',
  'product',
  'expense',
  'user',
  'organization',
  'report',
  'settings',
] as const

export type Resource = (typeof RESOURCES)[number]

// ============================================
// ACTIONS
// ============================================

// Base CRUD actions
export const CRUD_ACTIONS = ['create', 'read', 'update', 'delete'] as const
export type CRUDAction = (typeof CRUD_ACTIONS)[number]

// Special actions
export const SPECIAL_ACTIONS = [
  'approve',    // Approve expense claims, drafts, etc.
  'reject',     // Reject expense claims
  'cancel',     // Cancel invoices (SAT compliance)
  'send',       // Send invoices via email/WhatsApp
  'download',   // Download PDF/XML files
  'stamp',      // Request PAC stamping
  'export',     // Export reports
  'invite',     // Invite team members
] as const

export type SpecialAction = (typeof SPECIAL_ACTIONS)[number]

// All possible actions
export type Action = CRUDAction | SpecialAction

// ============================================
// PERMISSIONS
// ============================================

/**
 * Permission set for a specific resource
 * Example: { invoice: ['create', 'read', 'update'] }
 */
export type ResourcePermissions = {
  [K in Resource]?: Action[]
}

/**
 * Complete permission set for a user
 */
export interface PermissionSet {
  role: Role
  permissions: ResourcePermissions
  customPermissions?: ResourcePermissions // User-specific overrides
  tempPermissions?: TempPermission[]       // Temporary delegated permissions
}

/**
 * Temporary permission (expires after certain time)
 */
export interface TempPermission {
  resource: Resource
  action: Action
  grantedBy: string      // User ID who granted permission
  grantedAt: Date
  expiresAt: Date
}

/**
 * Cached permission data (stored in Redis)
 */
export interface CachedPermissions {
  userId: string
  organizationId: string
  role: Role
  permissions: ResourcePermissions
  version: string        // Cache version for bulk invalidation
  cachedAt: Date
  expiresAt: Date
}

// ============================================
// PERMISSION CHECK CONTEXT
// ============================================

/**
 * Context for permission checks
 */
export interface PermissionContext {
  userId: string
  organizationId: string
  resource: Resource
  action: Action
  resourceId?: string    // Optional: For resource-specific checks
  resourceOwnerId?: string // Optional: For ownership checks
}

/**
 * Result of a permission check
 */
export interface PermissionCheckResult {
  allowed: boolean
  reason?: string        // Why permission was granted/denied
  source: 'role' | 'custom' | 'ownership' | 'temp' | 'denied'
}

// ============================================
// ROLE HIERARCHY
// ============================================

/**
 * Role hierarchy levels (higher = more permissions)
 */
export const ROLE_HIERARCHY: Record<Role, number> = {
  owner: 4,
  admin: 3,
  accountant: 2,
  user: 1,
}

// ============================================
// ERROR TYPES
// ============================================

export class UnauthorizedError extends Error {
  constructor(message = 'Not authenticated') {
    super(message)
    this.name = 'UnauthorizedError'
  }
}

export class ForbiddenError extends Error {
  constructor(message = 'Permission denied') {
    super(message)
    this.name = 'ForbiddenError'
  }
}

export class ResourceNotFoundError extends Error {
  constructor(message = 'Resource not found') {
    super(message)
    this.name = 'ResourceNotFoundError'
  }
}

// ============================================
// UTILITY TYPES
// ============================================

/**
 * Type guard to check if a string is a valid role
 */
export function isValidRole(role: string): role is Role {
  return ROLES.includes(role as Role)
}

/**
 * Type guard to check if a string is a valid resource
 */
export function isValidResource(resource: string): resource is Resource {
  return RESOURCES.includes(resource as Resource)
}

/**
 * Type guard to check if a string is a valid action
 */
export function isValidAction(action: string): action is Action {
  return [...CRUD_ACTIONS, ...SPECIAL_ACTIONS].includes(action as Action)
}
