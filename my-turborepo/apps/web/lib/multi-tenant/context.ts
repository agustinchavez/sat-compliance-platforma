/**
 * Multi-Tenant Context Manager - Context Management
 *
 * Manages tenant context throughout the application lifecycle.
 * Provides functions to get current organization, validate access,
 * and handle organization switching.
 */

import { createClient } from '@/lib/supabase/server'
import { getCurrentUser } from '@/lib/auth'
import {
  getCachedOrganization,
  setCachedOrganization,
  invalidateOrganizationCache,
} from './cache'
import {
  type Organization,
  type TenantContext,
  type UserOrganization,
  TenantContextError,
  OrganizationNotFoundError,
  OrganizationAccessDeniedError,
  OrganizationSwitchError,
  isValidOrganizationId,
  isOrganizationActive,
} from './types'

/**
 * Get current organization from user session
 * Uses Redis cache for performance (1-2ms cache hit vs. 20-30ms DB query)
 *
 * @returns Current organization data
 * @throws {TenantContextError} If user is not authenticated
 * @throws {OrganizationNotFoundError} If organization doesn't exist or is inactive
 *
 * @example
 * ```typescript
 * const org = await getCurrentOrganization()
 * console.log(`Current org: ${org.name}`)
 * ```
 */
export async function getCurrentOrganization(): Promise<Organization> {
  // Get authenticated user
  const user = await getCurrentUser()
  if (!user) {
    throw new TenantContextError('User is not authenticated')
  }

  if (!user.organizationId) {
    throw new TenantContextError('User does not belong to an organization')
  }

  // Try cache first (fast path: 1-2ms)
  const cached = await getCachedOrganization(user.organizationId)
  if (cached) {
    // Verify organization is still active
    if (!isOrganizationActive(cached)) {
      throw new OrganizationNotFoundError('Organization is no longer active', {
        organizationId: user.organizationId,
        status: cached.status,
      })
    }
    return cached
  }

  // Cache miss - query database (slow path: 20-30ms)
  const organization = await getOrganizationFromDB(user.organizationId)

  // Cache for next request
  await setCachedOrganization(user.organizationId, organization)

  return organization
}

/**
 * Get current organization ID (lightweight, no full org data)
 * Faster than getCurrentOrganization() when you only need the ID
 *
 * @returns Organization UUID
 * @throws {TenantContextError} If user is not authenticated
 *
 * @example
 * ```typescript
 * const orgId = await getOrganizationId()
 * // Use for database queries
 * ```
 */
export async function getOrganizationId(): Promise<string> {
  const user = await getCurrentUser()
  if (!user) {
    throw new TenantContextError('User is not authenticated')
  }

  if (!user.organizationId) {
    throw new TenantContextError('User does not belong to an organization')
  }

  return user.organizationId
}

/**
 * Get organization from database
 * Internal function - use getCurrentOrganization() instead
 */
async function getOrganizationFromDB(organizationId: string): Promise<Organization> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('organizations')
    .select('*')
    .eq('id', organizationId)
    .single()

  if (error || !data) {
    throw new OrganizationNotFoundError('Organization not found', {
      organizationId,
      error: error?.message,
    })
  }

  // Map database columns to Organization interface
  const organization: Organization = {
    id: data.id,
    name: data.name,
    legalName: data.legal_name,
    rfc: data.rfc,
    taxRegime: data.tax_regime,
    plan: data.plan,
    status: data.status,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
    metadata: data.metadata,
  }

  // Verify organization is active
  if (!isOrganizationActive(organization)) {
    throw new OrganizationNotFoundError('Organization is no longer active', {
      organizationId,
      status: organization.status,
    })
  }

  return organization
}

/**
 * Get full tenant context for current request
 * Includes organization data, user info, and metadata
 *
 * @returns Complete tenant context
 *
 * @example
 * ```typescript
 * const context = await getTenantContext()
 * console.log(`User ${context.userId} in org ${context.organization.name}`)
 * ```
 */
export async function getTenantContext(): Promise<TenantContext> {
  const user = await getCurrentUser()
  if (!user) {
    throw new TenantContextError('User is not authenticated')
  }

  const organization = await getCurrentOrganization()

  return {
    organizationId: organization.id,
    organization,
    userId: user.id,
    userRole: user.role,
    timestamp: Date.now(),
  }
}

/**
 * Validate that user has access to specific organization
 * Use before performing sensitive operations
 *
 * @param organizationId - Organization UUID to validate
 * @throws {OrganizationAccessDeniedError} If user doesn't have access
 *
 * @example
 * ```typescript
 * await validateOrganizationAccess(orgId)
 * // Throws error if user doesn't belong to this org
 * ```
 */
export async function validateOrganizationAccess(organizationId: string): Promise<void> {
  if (!isValidOrganizationId(organizationId)) {
    throw new OrganizationAccessDeniedError('Invalid organization ID format', {
      organizationId,
    })
  }

  const currentOrgId = await getOrganizationId()

  if (currentOrgId !== organizationId) {
    throw new OrganizationAccessDeniedError(
      'User does not have access to this organization',
      {
        currentOrganizationId: currentOrgId,
        requestedOrganizationId: organizationId,
      }
    )
  }
}

/**
 * Get list of organizations user belongs to
 * For future multi-organization support
 *
 * @param userId - User UUID (optional, defaults to current user)
 * @returns Array of user-organization relationships
 *
 * @example
 * ```typescript
 * const orgs = await getUserOrganizations()
 * console.log(`User belongs to ${orgs.length} organizations`)
 * ```
 */
export async function getUserOrganizations(
  userId?: string
): Promise<UserOrganization[]> {
  const user = userId ? { id: userId } : await getCurrentUser()
  if (!user) {
    throw new TenantContextError('User is not authenticated')
  }

  const supabase = await createClient()

  // For now, single organization per user
  // Future: Query user_organizations junction table
  const { data: userData, error } = await supabase
    .from('users')
    .select('id, organization_id, role, created_at')
    .eq('id', user.id)
    .single()

  if (error || !userData) {
    return []
  }

  return [
    {
      userId: userData.id,
      organizationId: userData.organization_id,
      role: userData.role,
      isPrimary: true,
      joinedAt: userData.created_at,
    },
  ]
}

/**
 * Switch active organization (for future multi-org support)
 * Currently not implemented - users belong to single organization
 *
 * @param organizationId - Target organization UUID
 * @throws {OrganizationSwitchError} Organization switching not yet supported
 *
 * @example
 * ```typescript
 * await switchOrganization('org-456')
 * // Validates access, updates context, invalidates caches
 * ```
 */
export async function switchOrganization(organizationId: string): Promise<void> {
  throw new OrganizationSwitchError(
    'Organization switching not yet implemented. Users currently belong to single organization.',
    { requestedOrganizationId: organizationId }
  )

  // Future implementation:
  // 1. Validate user has access to target organization
  // 2. Update session with new organization context
  // 3. Invalidate permission cache
  // 4. Invalidate organization cache
  // 5. Log organization switch for audit
  // 6. Return success
}

/**
 * Refresh organization data from database and update cache
 * Use after organization updates
 *
 * @param organizationId - Organization UUID
 * @returns Updated organization data
 *
 * @example
 * ```typescript
 * await updateOrganization(orgId, { name: 'New Name' })
 * const updated = await refreshOrganization(orgId)
 * ```
 */
export async function refreshOrganization(organizationId: string): Promise<Organization> {
  // Invalidate cache first
  await invalidateOrganizationCache(organizationId)

  // Fetch fresh data
  const organization = await getOrganizationFromDB(organizationId)

  // Re-cache
  await setCachedOrganization(organizationId, organization)

  return organization
}

/**
 * Check if organization ID matches current user's organization
 * Non-throwing version of validateOrganizationAccess()
 *
 * @param organizationId - Organization UUID to check
 * @returns true if user belongs to this organization
 *
 * @example
 * ```typescript
 * if (await isCurrentOrganization(orgId)) {
 *   // Safe to proceed
 * }
 * ```
 */
export async function isCurrentOrganization(organizationId: string): Promise<boolean> {
  try {
    const currentOrgId = await getOrganizationId()
    return currentOrgId === organizationId
  } catch {
    return false
  }
}

/**
 * Require organization context to be present
 * Use in API routes and server actions that require organization context
 *
 * @returns Current organization ID
 * @throws {TenantContextError} If organization context is missing
 *
 * @example
 * ```typescript
 * export async function createInvoice(data) {
 *   'use server'
 *   await requireOrganizationContext()
 *   // ... rest of logic
 * }
 * ```
 */
export async function requireOrganizationContext(): Promise<string> {
  return await getOrganizationId()
}
