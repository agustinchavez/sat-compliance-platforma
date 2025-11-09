/**
 * Multi-Tenant Context Manager - Type Definitions
 *
 * Provides TypeScript types for multi-tenant functionality including
 * organization context, tenant isolation, and cross-tenant security.
 */

/**
 * Organization data structure
 */
export interface Organization {
  id: string
  name: string
  legalName: string
  rfc: string
  taxRegime: string
  plan: 'basic' | 'professional' | 'enterprise'
  status: 'active' | 'suspended' | 'inactive'
  createdAt: string
  updatedAt: string
  metadata?: OrganizationMetadata
}

/**
 * Additional organization metadata
 */
export interface OrganizationMetadata {
  address?: string
  phone?: string
  email?: string
  website?: string
  fiscalRegime?: string
  certificateExpiry?: string
  [key: string]: any
}

/**
 * Tenant context - represents current organization scope
 */
export interface TenantContext {
  organizationId: string
  organization: Organization
  userId: string
  userRole: string
  timestamp: number
}

/**
 * Organization context for caching
 */
export interface OrganizationContext {
  id: string
  name: string
  rfc: string
  plan: string
  status: string
}

/**
 * User-Organization relationship
 * For future multi-org support
 */
export interface UserOrganization {
  userId: string
  organizationId: string
  role: 'owner' | 'admin' | 'accountant' | 'user'
  isPrimary: boolean
  joinedAt: string
  permissions?: string[]
}

/**
 * Scoped query configuration
 */
export interface ScopedQueryConfig {
  organizationId: string
  userId?: string
  enforceRLS?: boolean
  validateAccess?: boolean
}

/**
 * Resource ownership validation
 */
export interface ResourceOwnership {
  resourceType: string
  resourceId: string
  organizationId: string
  createdBy?: string
  isValid: boolean
}

/**
 * Tenant isolation check result
 */
export interface TenantIsolationResult {
  allowed: boolean
  organizationId: string
  resourceId: string
  reason?: string
  violationType?: 'cross_tenant' | 'missing_context' | 'invalid_resource'
}

/**
 * Organization switch request
 */
export interface OrganizationSwitchRequest {
  userId: string
  fromOrganizationId: string
  toOrganizationId: string
  timestamp: number
  reason?: string
}

/**
 * Tenant violation log entry
 */
export interface TenantViolationLog {
  id: string
  userId: string
  organizationId: string
  attemptedOrganizationId?: string
  resourceType: string
  resourceId: string
  action: string
  timestamp: number
  ipAddress?: string
  userAgent?: string
  severity: 'low' | 'medium' | 'high' | 'critical'
}

/**
 * RLS Policy configuration
 */
export interface RLSPolicyConfig {
  tableName: string
  policyName: string
  operation: 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE' | 'ALL'
  using?: string
  withCheck?: string
}

/**
 * Resource types that support multi-tenancy
 */
export type TenantResource =
  | 'invoice'
  | 'customer'
  | 'product'
  | 'expense'
  | 'payment'
  | 'journal_entry'
  | 'user'
  | 'report'
  | 'settings'

/**
 * Cache entry for organization data
 */
export interface CachedOrganization {
  organization: Organization
  cachedAt: number
  expiresAt: number
}

// ============================================
// ERROR CLASSES
// ============================================

/**
 * Base error for tenant-related issues
 */
export class TenantError extends Error {
  public readonly code: string
  public readonly statusCode: number
  public readonly details?: any

  constructor(message: string, code = 'TENANT_ERROR', statusCode = 400, details?: any) {
    super(message)
    this.name = 'TenantError'
    this.code = code
    this.statusCode = statusCode
    this.details = details
    Object.setPrototypeOf(this, TenantError.prototype)
  }
}

/**
 * Thrown when tenant context is missing or invalid
 */
export class TenantContextError extends TenantError {
  constructor(message = 'Tenant context is missing or invalid', details?: any) {
    super(message, 'TENANT_CONTEXT_ERROR', 400, details)
    this.name = 'TenantContextError'
    Object.setPrototypeOf(this, TenantContextError.prototype)
  }
}

/**
 * Thrown when cross-tenant access is attempted
 */
export class TenantIsolationError extends TenantError {
  constructor(message = 'Access to resource from different organization denied', details?: any) {
    super(message, 'TENANT_ISOLATION_ERROR', 403, details)
    this.name = 'TenantIsolationError'
    Object.setPrototypeOf(this, TenantIsolationError.prototype)
  }
}

/**
 * Thrown when organization is not found or inactive
 */
export class OrganizationNotFoundError extends TenantError {
  constructor(message = 'Organization not found or inactive', details?: any) {
    super(message, 'ORGANIZATION_NOT_FOUND', 404, details)
    this.name = 'OrganizationNotFoundError'
    Object.setPrototypeOf(this, OrganizationNotFoundError.prototype)
  }
}

/**
 * Thrown when user doesn't belong to organization
 */
export class OrganizationAccessDeniedError extends TenantError {
  constructor(message = 'User does not have access to this organization', details?: any) {
    super(message, 'ORGANIZATION_ACCESS_DENIED', 403, details)
    this.name = 'OrganizationAccessDeniedError'
    Object.setPrototypeOf(this, OrganizationAccessDeniedError.prototype)
  }
}

/**
 * Thrown when organization switch fails
 */
export class OrganizationSwitchError extends TenantError {
  constructor(message = 'Failed to switch organization', details?: any) {
    super(message, 'ORGANIZATION_SWITCH_ERROR', 400, details)
    this.name = 'OrganizationSwitchError'
    Object.setPrototypeOf(this, OrganizationSwitchError.prototype)
  }
}

/**
 * Thrown when RLS policy validation fails
 */
export class RLSPolicyError extends TenantError {
  constructor(message = 'Row-level security policy error', details?: any) {
    super(message, 'RLS_POLICY_ERROR', 500, details)
    this.name = 'RLSPolicyError'
    Object.setPrototypeOf(this, RLSPolicyError.prototype)
  }
}

// ============================================
// TYPE GUARDS
// ============================================

/**
 * Check if value is a valid organization ID
 */
export function isValidOrganizationId(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
  )
}

/**
 * Check if value is a valid tenant resource type
 */
export function isTenantResource(value: unknown): value is TenantResource {
  const validResources: TenantResource[] = [
    'invoice',
    'customer',
    'product',
    'expense',
    'payment',
    'journal_entry',
    'user',
    'report',
    'settings',
  ]
  return typeof value === 'string' && validResources.includes(value as TenantResource)
}

/**
 * Check if organization is active
 */
export function isOrganizationActive(org: Organization): boolean {
  return org.status === 'active'
}

/**
 * Check if cached organization is still valid
 */
export function isCachedOrganizationValid(cached: CachedOrganization): boolean {
  return cached.expiresAt > Date.now()
}
