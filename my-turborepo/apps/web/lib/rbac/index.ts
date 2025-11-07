/**
 * RBAC Module
 *
 * Role-Based Access Control system
 * Main exports for easy importing
 */

// ============================================
// TYPES
// ============================================

export type {
  Role,
  Resource,
  Action,
  CRUDAction,
  SpecialAction,
  ResourcePermissions,
  PermissionSet,
  TempPermission,
  CachedPermissions,
  PermissionContext,
  PermissionCheckResult,
} from './types'

export {
  ROLES,
  RESOURCES,
  CRUD_ACTIONS,
  SPECIAL_ACTIONS,
  ROLE_HIERARCHY,
  UnauthorizedError,
  ForbiddenError,
  ResourceNotFoundError,
  isValidRole,
  isValidResource,
  isValidAction,
} from './types'

// ============================================
// PERMISSIONS
// ============================================

export {
  INVOICE_PERMISSIONS,
  CUSTOMER_PERMISSIONS,
  PRODUCT_PERMISSIONS,
  EXPENSE_PERMISSIONS,
  USER_PERMISSIONS,
  ORGANIZATION_PERMISSIONS,
  REPORT_PERMISSIONS,
  SETTINGS_PERMISSIONS,
  RESOURCE_PERMISSION_MAP,
  getResourcePermissions,
  isValidActionForResource,
  ACTION_DESCRIPTIONS,
  RESOURCE_NAMES,
} from './permissions'

// ============================================
// ROLES
// ============================================

export {
  OWNER_PERMISSIONS,
  ADMIN_PERMISSIONS,
  ACCOUNTANT_PERMISSIONS,
  USER_PERMISSIONS as USER_ROLE_PERMISSIONS,
  ROLE_PERMISSIONS,
  getRolePermissions,
  OWNERSHIP_OVERRIDES,
  isOwnershipAction,
  SPECIAL_RULES,
  hasHigherOrEqualRole,
  hasHigherRole as hasHigherRoleThanUser,
  getMinimumRoleForAction,
} from './roles'

// ============================================
// CORE SERVICE
// ============================================

export {
  checkPermission,
  checkResourcePermission,
  getUserPermissions,
  getAvailableActions,
  assignRole,
  revokeAccess,
  canAccessOrganization,
  invalidatePermissionCache,
} from './service'

// ============================================
// MIDDLEWARE
// ============================================

export {
  // Permission requirements (throwing)
  requirePermission,
  requireResourcePermission,
  requireRole,
  requireOwner,
  requireAdminOrOwner,
  requireAccountantOrAbove,

  // Permission checks (non-throwing)
  hasPermission,
  hasRole,
  isOwner,
  isAdminOrOwner,
  isAccountantOrAbove,

  // Data filtering
  filterByPermissions,
  checkMultiplePermissions,

  // Helpers
  withPermission,
  tryCheckPermission,
} from './middleware'

// ============================================
// UTILITIES
// ============================================

export {
  // Role utilities
  isOwnerRole,
  isAdminOrAbove as isAdminRole,
  isAccountantOrAbove as isAccountantRole,
  canManageUsers,
  canManageSettings,
  compareRoles,
  hasHigherOrEqualRole as hasHigherOrEqualRoleUtil,
  hasHigherRole,
  getRoleDisplayName,
  getRoleDescription,
  getRoleBadgeColor,

  // Permission utilities
  formatPermission,
  getPermissionDescription,
  isDestructiveAction,
  isReadOnlyAction,
  requiresApproval,
  getActionIcon,
  getActionColor,

  // Resource utilities
  getResourceDisplayName,
  getResourceIcon,

  // Permission set utilities
  countPermissions,
  hasNoPermissions,
  hasAction,
  getAccessibleResources,
  formatPermissionsForDisplay,

  // Validation
  isValidRole as validateRole,
  isValidResource as validateResource,
  isValidAction as validateAction,

  // Debugging
  getPermissionSummary,
  logPermissions,
} from './utils'

// ============================================
// CACHE
// ============================================

export {
  getCachedPermissions,
  setCachedPermissions,
  invalidateCache,
  invalidateOrganizationCache,
  warmCache,
  getCacheStats,
  clearAllCaches,
  getCurrentCacheVersion,
  isCurrentVersion,
} from './cache'
