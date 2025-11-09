/**
 * Multi-Tenant Context Manager
 *
 * Comprehensive multi-tenant system with automatic query scoping,
 * tenant isolation, and RLS-based security.
 *
 * @module multi-tenant
 */

// ============================================
// Context Management
// ============================================
export {
  getCurrentOrganization,
  getOrganizationId,
  getTenantContext,
  validateOrganizationAccess,
  getUserOrganizations,
  switchOrganization,
  refreshOrganization,
  isCurrentOrganization,
  requireOrganizationContext,
} from './context'

// ============================================
// Database Scoping
// ============================================
export {
  getScopedClient,
  getRLSContext,
  validateQueryScope,
  withOrganizationScope,
  createScopedQuery,
  verifyResourceOwnership,
  getResourceOrganizationId,
  batchVerifyResourceOwnership,
  countOrganizationResources,
  getOrganizationStats,
} from './database'

// ============================================
// Tenant Isolation
// ============================================
export {
  isResourceInOrganization,
  validateResourceInOrganization,
  checkResourceOwnership,
  validateCrossOrgAccess,
  preventDataLeakage,
  sanitizeForOrganization,
  detectTenantViolation,
  logTenantViolation,
  batchValidateResources,
} from './isolation'

// ============================================
// Middleware
// ============================================
export {
  extractTenantContext,
  requireOrganization,
  withTenantContext,
  validateTenantAccess,
  requireResourceAccess,
  injectTenantContext,
  withTenantValidation,
  tenantMiddleware,
  withTenantErrorHandling,
} from './middleware'

// ============================================
// Caching
// ============================================
export {
  getCachedOrganization,
  setCachedOrganization,
  invalidateOrganizationCache,
  invalidateAllOrganizationCaches,
  getOrganizationCacheStats,
  warmOrganizationCache,
  getCachedOrganizationContext,
  batchGetCachedOrganizations,
  ORG_CACHE_TTL,
} from './cache'

// ============================================
// RLS Management
// ============================================
export {
  generateRLSPolicySQL,
  generateRLSMigration,
  generateRLSRollback,
  validateRLSPolicyConfig,
  getRLSPolicySQL,
  generateCustomRLSPolicies,
  MULTI_TENANT_TABLES,
  EXCLUDED_TABLES,
} from './rls'

// ============================================
// Types & Errors
// ============================================
export type {
  Organization,
  OrganizationMetadata,
  TenantContext,
  OrganizationContext,
  UserOrganization,
  ScopedQueryConfig,
  ResourceOwnership,
  TenantIsolationResult,
  OrganizationSwitchRequest,
  TenantViolationLog,
  RLSPolicyConfig,
  TenantResource,
  CachedOrganization,
} from './types'

export {
  TenantError,
  TenantContextError,
  TenantIsolationError,
  OrganizationNotFoundError,
  OrganizationAccessDeniedError,
  OrganizationSwitchError,
  RLSPolicyError,
  isValidOrganizationId,
  isTenantResource,
  isOrganizationActive,
  isCachedOrganizationValid,
} from './types'
