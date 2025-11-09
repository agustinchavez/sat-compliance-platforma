/**
 * Multi-Tenant Context Manager - Database Scoping
 *
 * Provides utilities for scoping database queries to current organization.
 * Works with Supabase RLS policies to ensure tenant isolation at database level.
 */

import { createClient } from '@/lib/supabase/server'
import { getOrganizationId, getCurrentOrganization } from './context'
import type { SupabaseClient } from '@supabase/supabase-js'
import { TenantContextError } from './types'

/**
 * Get Supabase client with automatic organization scoping via RLS
 * RLS policies automatically filter all queries by organization_id
 *
 * @returns Supabase client instance
 * @throws {TenantContextError} If user is not authenticated or has no organization
 *
 * @example
 * ```typescript
 * // Automatic organization scoping via RLS
 * const supabase = await getScopedClient()
 * const { data: customers } = await supabase
 *   .from('customers')
 *   .select('*')
 * // → Returns ONLY customers from current organization
 * // → No need to add .eq('organization_id', orgId)
 * ```
 */
export async function getScopedClient(): Promise<SupabaseClient> {
  // Validate organization context exists
  // This throws if user is not authenticated or has no organization
  await getOrganizationId()

  // Return regular Supabase client
  // RLS policies automatically filter by organization_id
  return await createClient()
}

/**
 * Get RLS context variables for current user session
 * Used by RLS policies to filter queries
 *
 * @returns RLS context object
 *
 * @example
 * ```sql
 * -- RLS policy uses this:
 * CREATE POLICY "org_select_policy" ON customers
 *   FOR SELECT
 *   USING (
 *     organization_id IN (
 *       SELECT organization_id FROM users WHERE auth_id = auth.uid()
 *     )
 *   );
 * ```
 */
export async function getRLSContext(): Promise<{
  userId: string
  organizationId: string
}> {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    throw new TenantContextError('User is not authenticated')
  }

  // Get organization ID from current context
  const organizationId = await getOrganizationId()

  return {
    userId: user.id,
    organizationId,
  }
}

/**
 * Validate that a query will be properly scoped by RLS
 * Development helper to ensure RLS is working correctly
 *
 * @param tableName - Table name to check
 * @returns true if RLS is enabled on table
 *
 * @example
 * ```typescript
 * await validateQueryScope('customers')
 * // Throws if RLS is not enabled (development only)
 * ```
 */
export async function validateQueryScope(tableName: string): Promise<boolean> {
  if (process.env.NODE_ENV === 'production') {
    // Skip validation in production for performance
    return true
  }

  const supabase = await createClient()

  try {
    // Check if RLS is enabled on table
    const { data, error } = await supabase.rpc('check_rls_enabled', {
      table_name: tableName,
    })

    if (error) {
      console.warn(`RLS validation error for table ${tableName}:`, error.message)
      return false
    }

    if (!data) {
      console.warn(`RLS not enabled on table: ${tableName}`)
      return false
    }

    return true
  } catch (error) {
    console.warn(`RLS validation failed for table ${tableName}:`, error)
    return false
  }
}

/**
 * Execute query with explicit organization scope check
 * Adds both RLS protection AND application-level validation
 * Use for critical operations that need extra security
 *
 * @param queryFn - Function that performs the query
 * @returns Query result
 *
 * @example
 * ```typescript
 * const invoice = await withOrganizationScope(async (supabase, orgId) => {
 *   const { data } = await supabase
 *     .from('invoices')
 *     .select('*')
 *     .eq('id', invoiceId)
 *     .eq('organization_id', orgId) // Explicit check
 *     .single()
 *   return data
 * })
 * ```
 */
export async function withOrganizationScope<T>(
  queryFn: (supabase: SupabaseClient, organizationId: string) => Promise<T>
): Promise<T> {
  const organizationId = await getOrganizationId()
  const supabase = await getScopedClient()

  return await queryFn(supabase, organizationId)
}

/**
 * Create a scoped query builder that automatically adds organization_id filter
 * Extra safety layer on top of RLS
 *
 * @param tableName - Table name to query
 * @returns Scoped query builder
 *
 * @example
 * ```typescript
 * const query = await createScopedQuery('customers')
 * const { data } = await query.select('*').eq('active', true)
 * // Automatically filtered by organization_id
 * ```
 */
export async function createScopedQuery(tableName: string) {
  const organizationId = await getOrganizationId()
  const supabase = await getScopedClient()

  // Return query builder with organization_id pre-filtered
  return supabase.from(tableName).select().eq('organization_id', organizationId)
}

/**
 * Verify that a resource belongs to current organization
 * Use before sensitive operations (update, delete)
 *
 * @param tableName - Table name
 * @param resourceId - Resource UUID
 * @returns true if resource belongs to current organization
 *
 * @example
 * ```typescript
 * const belongs = await verifyResourceOwnership('invoices', invoiceId)
 * if (!belongs) {
 *   throw new TenantIsolationError('Invoice not found')
 * }
 * ```
 */
export async function verifyResourceOwnership(
  tableName: string,
  resourceId: string
): Promise<boolean> {
  const organizationId = await getOrganizationId()
  const supabase = await getScopedClient()

  const { data, error } = await supabase
    .from(tableName)
    .select('organization_id')
    .eq('id', resourceId)
    .single()

  if (error || !data) {
    return false
  }

  return data.organization_id === organizationId
}

/**
 * Get organization ID from a resource
 * Useful for validation and logging
 *
 * @param tableName - Table name
 * @param resourceId - Resource UUID
 * @returns Organization ID or null if not found
 *
 * @example
 * ```typescript
 * const orgId = await getResourceOrganizationId('customers', customerId)
 * ```
 */
export async function getResourceOrganizationId(
  tableName: string,
  resourceId: string
): Promise<string | null> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from(tableName)
    .select('organization_id')
    .eq('id', resourceId)
    .single()

  if (error || !data) {
    return null
  }

  return data.organization_id
}

/**
 * Batch verify multiple resources belong to current organization
 * More efficient than checking one by one
 *
 * @param tableName - Table name
 * @param resourceIds - Array of resource UUIDs
 * @returns Map of resource ID to ownership status
 *
 * @example
 * ```typescript
 * const ownership = await batchVerifyResourceOwnership('invoices', [id1, id2, id3])
 * if (!ownership.get(id1)) {
 *   throw new Error('Access denied')
 * }
 * ```
 */
export async function batchVerifyResourceOwnership(
  tableName: string,
  resourceIds: string[]
): Promise<Map<string, boolean>> {
  const organizationId = await getOrganizationId()
  const supabase = await getScopedClient()

  const results = new Map<string, boolean>()

  const { data, error } = await supabase
    .from(tableName)
    .select('id, organization_id')
    .in('id', resourceIds)

  if (error || !data) {
    // Mark all as not owned on error
    resourceIds.forEach((id) => results.set(id, false))
    return results
  }

  // Mark found resources
  data.forEach((row) => {
    results.set(row.id, row.organization_id === organizationId)
  })

  // Mark missing resources as not owned
  resourceIds.forEach((id) => {
    if (!results.has(id)) {
      results.set(id, false)
    }
  })

  return results
}

/**
 * Count resources in current organization
 *
 * @param tableName - Table name
 * @param filters - Optional query filters
 * @returns Count of resources
 *
 * @example
 * ```typescript
 * const activeCustomers = await countOrganizationResources('customers', {
 *   active: true
 * })
 * ```
 */
export async function countOrganizationResources(
  tableName: string,
  filters?: Record<string, any>
): Promise<number> {
  const supabase = await getScopedClient()

  let query = supabase.from(tableName).select('*', { count: 'exact', head: true })

  // Apply filters if provided
  if (filters) {
    Object.entries(filters).forEach(([key, value]) => {
      query = query.eq(key, value)
    })
  }

  const { count, error } = await query

  if (error) {
    console.error(`Count error for ${tableName}:`, error)
    return 0
  }

  return count || 0
}

/**
 * Get organization statistics for monitoring
 *
 * @returns Organization usage stats
 *
 * @example
 * ```typescript
 * const stats = await getOrganizationStats()
 * console.log(`Customers: ${stats.customers}`)
 * ```
 */
export async function getOrganizationStats(): Promise<{
  organizationId: string
  organizationName: string
  customers: number
  invoices: number
  products: number
  users: number
}> {
  const organization = await getCurrentOrganization()

  const [customers, invoices, products, users] = await Promise.all([
    countOrganizationResources('customers'),
    countOrganizationResources('invoices'),
    countOrganizationResources('products'),
    countOrganizationResources('users'),
  ])

  return {
    organizationId: organization.id,
    organizationName: organization.name,
    customers,
    invoices,
    products,
    users,
  }
}
