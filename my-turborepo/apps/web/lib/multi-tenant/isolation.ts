/**
 * Multi-Tenant Context Manager - Tenant Isolation
 *
 * Provides cross-tenant access prevention, security monitoring,
 * and data leakage protection.
 */

import { getOrganizationId, isCurrentOrganization } from './context'
import { getResourceOrganizationId, verifyResourceOwnership } from './database'
import {
  type TenantResource,
  type TenantIsolationResult,
  type TenantViolationLog,
  type ResourceOwnership,
  TenantIsolationError,
  isTenantResource,
} from './types'

/**
 * Check if resource belongs to current user's organization
 * Primary function for validating resource access
 *
 * @param resourceType - Type of resource (invoice, customer, etc.)
 * @param resourceId - Resource UUID
 * @returns true if resource belongs to current organization
 *
 * @example
 * ```typescript
 * const canAccess = await isResourceInOrganization('invoice', invoiceId)
 * if (!canAccess) {
 *   throw new TenantIsolationError('Invoice not found')
 * }
 * ```
 */
export async function isResourceInOrganization(
  resourceType: TenantResource | string,
  resourceId: string
): Promise<boolean> {
  try {
    // Get current organization
    const currentOrgId = await getOrganizationId()

    // Get resource's organization
    const tableName = getTableNameFromResourceType(resourceType)
    const resourceOrgId = await getResourceOrganizationId(tableName, resourceId)

    if (!resourceOrgId) {
      return false // Resource not found
    }

    return resourceOrgId === currentOrgId
  } catch (error) {
    console.error('Resource organization check error:', error)
    return false
  }
}

/**
 * Validate resource access and throw error if denied
 * Use before sensitive operations (update, delete)
 *
 * @param resourceType - Type of resource
 * @param resourceId - Resource UUID
 * @throws {TenantIsolationError} If resource doesn't belong to current organization
 *
 * @example
 * ```typescript
 * export async function deleteInvoice(id: string) {
 *   await validateResourceInOrganization('invoice', id)
 *   // Safe to delete - resource belongs to current org
 *   await db.from('invoices').delete().eq('id', id)
 * }
 * ```
 */
export async function validateResourceInOrganization(
  resourceType: TenantResource | string,
  resourceId: string
): Promise<void> {
  const isValid = await isResourceInOrganization(resourceType, resourceId)

  if (!isValid) {
    // Log security violation
    await logTenantViolation({
      resourceType,
      resourceId,
      action: 'access_denied',
      severity: 'high',
    })

    throw new TenantIsolationError('Resource not found or access denied', {
      resourceType,
      resourceId,
    })
  }
}

/**
 * Check resource ownership with detailed result
 *
 * @param resourceType - Type of resource
 * @param resourceId - Resource UUID
 * @returns Detailed ownership information
 *
 * @example
 * ```typescript
 * const ownership = await checkResourceOwnership('customer', customerId)
 * if (!ownership.isValid) {
 *   console.log(`Access denied: ${ownership.organizationId}`)
 * }
 * ```
 */
export async function checkResourceOwnership(
  resourceType: TenantResource | string,
  resourceId: string
): Promise<ResourceOwnership> {
  const currentOrgId = await getOrganizationId()
  const tableName = getTableNameFromResourceType(resourceType)
  const resourceOrgId = await getResourceOrganizationId(tableName, resourceId)

  return {
    resourceType,
    resourceId,
    organizationId: resourceOrgId || '',
    isValid: resourceOrgId === currentOrgId,
  }
}

/**
 * Detect cross-tenant access attempt
 * Returns detailed result for security monitoring
 *
 * @param resourceType - Type of resource
 * @param resourceId - Resource UUID
 * @returns Tenant isolation check result
 *
 * @example
 * ```typescript
 * const result = await validateCrossOrgAccess('invoice', invoiceId)
 * if (!result.allowed) {
 *   console.warn(`Violation: ${result.violationType}`)
 * }
 * ```
 */
export async function validateCrossOrgAccess(
  resourceType: TenantResource | string,
  resourceId: string
): Promise<TenantIsolationResult> {
  try {
    const currentOrgId = await getOrganizationId()
    const tableName = getTableNameFromResourceType(resourceType)
    const resourceOrgId = await getResourceOrganizationId(tableName, resourceId)

    if (!resourceOrgId) {
      return {
        allowed: false,
        organizationId: currentOrgId,
        resourceId,
        reason: 'Resource not found',
        violationType: 'invalid_resource',
      }
    }

    const allowed = resourceOrgId === currentOrgId

    if (!allowed) {
      // Cross-tenant access attempt detected
      await logTenantViolation({
        resourceType,
        resourceId,
        action: 'cross_tenant_access',
        severity: 'critical',
        attemptedOrganizationId: resourceOrgId,
      })
    }

    return {
      allowed,
      organizationId: currentOrgId,
      resourceId,
      reason: allowed ? 'Access granted' : 'Resource belongs to different organization',
      violationType: allowed ? undefined : 'cross_tenant',
    }
  } catch (error) {
    return {
      allowed: false,
      organizationId: '',
      resourceId,
      reason: 'Tenant context missing',
      violationType: 'missing_context',
    }
  }
}

/**
 * Prevent data leakage by stripping organization_id from response
 * Use before sending data to client
 *
 * @param data - Data object or array
 * @returns Data with organization_id removed
 *
 * @example
 * ```typescript
 * const customers = await getCustomers()
 * const safe = preventDataLeakage(customers)
 * // organization_id field removed from all objects
 * ```
 */
export function preventDataLeakage<T extends Record<string, any> | Record<string, any>[]>(
  data: T
): T {
  if (Array.isArray(data)) {
    return data.map((item) => stripOrganizationId(item)) as T
  }

  return stripOrganizationId(data) as T
}

/**
 * Strip organization_id from single object
 */
function stripOrganizationId<T extends Record<string, any>>(obj: T): Omit<T, 'organization_id'> {
  const {
 organization_id: _,
    ...rest
  } = obj
  return rest as Omit<T, 'organization_id'>
}

/**
 * Sanitize data for organization
 * Removes cross-org data and sensitive fields
 *
 * @param data - Data to sanitize
 * @param allowedFields - Fields to keep (optional)
 * @returns Sanitized data
 *
 * @example
 * ```typescript
 * const safe = await sanitizeForOrganization(rawData, ['id', 'name', 'email'])
 * ```
 */
export async function sanitizeForOrganization<T extends Record<string, any>>(
  data: T | T[],
  allowedFields?: string[]
): Promise<T | T[]> {
  const currentOrgId = await getOrganizationId()

  if (Array.isArray(data)) {
    return data
      .filter((item) => item.organization_id === currentOrgId)
      .map((item) => (allowedFields ? pickFields(item, allowedFields) : item)) as T[]
  }

  if (data.organization_id !== currentOrgId) {
    throw new TenantIsolationError('Data belongs to different organization')
  }

  return allowedFields ? (pickFields(data, allowedFields) as T) : data
}

/**
 * Pick specific fields from object
 */
function pickFields<T extends Record<string, any>>(
  obj: T,
  fields: string[]
): Partial<T> {
  const result: Partial<T> = {}
  fields.forEach((field) => {
    if (field in obj) {
      result[field as keyof T] = obj[field]
    }
  })
  return result
}

/**
 * Detect tenant isolation violation
 * Use for security monitoring and alerting
 *
 * @param resourceType - Type of resource
 * @param resourceId - Resource UUID
 * @returns true if violation detected
 *
 * @example
 * ```typescript
 * const violated = await detectTenantViolation('invoice', invoiceId)
 * if (violated) {
 *   await alertSecurityTeam()
 * }
 * ```
 */
export async function detectTenantViolation(
  resourceType: TenantResource | string,
  resourceId: string
): Promise<boolean> {
  const result = await validateCrossOrgAccess(resourceType, resourceId)
  return !result.allowed && result.violationType === 'cross_tenant'
}

/**
 * Log tenant violation for security audit
 *
 * @param violation - Violation details
 *
 * @example
 * ```typescript
 * await logTenantViolation({
 *   resourceType: 'invoice',
 *   resourceId: 'inv-123',
 *   action: 'unauthorized_access',
 *   severity: 'high'
 * })
 * ```
 */
export async function logTenantViolation(violation: {
  resourceType: string
  resourceId: string
  action: string
  severity: 'low' | 'medium' | 'high' | 'critical'
  attemptedOrganizationId?: string
}): Promise<void> {
  try {
    const currentOrgId = await getOrganizationId().catch(() => 'unknown')

    const log: Omit<TenantViolationLog, 'id'> = {
      userId: 'unknown', // TODO: Get from current user
      organizationId: currentOrgId,
      attemptedOrganizationId: violation.attemptedOrganizationId,
      resourceType: violation.resourceType,
      resourceId: violation.resourceId,
      action: violation.action,
      timestamp: Date.now(),
      severity: violation.severity,
    }

    // Log to console in development
    if (process.env.NODE_ENV === 'development') {
      console.warn('🚨 Tenant Violation:', log)
    }

    // TODO: Store in database for production monitoring
    // await db.from('tenant_violations').insert(log)

    // TODO: Alert security team for critical violations
    // if (violation.severity === 'critical') {
    //   await alertSecurityTeam(log)
    // }
  } catch (error) {
    console.error('Failed to log tenant violation:', error)
  }
}

/**
 * Get table name from resource type
 * Maps resource types to database table names
 */
function getTableNameFromResourceType(resourceType: string): string {
  const tableMap: Record<string, string> = {
    invoice: 'invoices',
    customer: 'customers',
    product: 'products',
    expense: 'expenses',
    payment: 'payments',
    journal_entry: 'journal_entries',
    user: 'users',
    report: 'reports',
    settings: 'settings',
  }

  return tableMap[resourceType] || resourceType
}

/**
 * Validate multiple resources belong to current organization
 * More efficient than checking one by one
 *
 * @param resources - Array of [resourceType, resourceId] tuples
 * @returns Map of resourceId to validation status
 *
 * @example
 * ```typescript
 * const valid = await batchValidateResources([
 *   ['invoice', 'inv-1'],
 *   ['customer', 'cust-1'],
 *   ['product', 'prod-1'],
 * ])
 * ```
 */
export async function batchValidateResources(
  resources: Array<[TenantResource | string, string]>
): Promise<Map<string, boolean>> {
  const results = new Map<string, boolean>()

  const validations = resources.map(async ([resourceType, resourceId]) => {
    const isValid = await isResourceInOrganization(resourceType, resourceId)
    results.set(resourceId, isValid)
  })

  await Promise.all(validations)

  return results
}
