/**
 * Multi-Tenant Context Manager - Middleware
 *
 * Provides middleware functions for extracting and validating tenant context
 * in API routes, server actions, and tRPC procedures.
 */

import { getCurrentOrganization, getOrganizationId, validateOrganizationAccess } from './context'
import { validateResourceInOrganization } from './isolation'
import type { TenantContext, TenantResource } from './types'
import { TenantContextError } from './types'

/**
 * Extract tenant context from current request
 * Use in API routes and server actions
 *
 * @returns Tenant context
 * @throws {TenantContextError} If context is missing
 *
 * @example
 * ```typescript
 * export async function GET(request: Request) {
 *   const context = await extractTenantContext()
 *   // context.organizationId, context.userId available
 * }
 * ```
 */
export async function extractTenantContext(): Promise<TenantContext> {
  const organization = await getCurrentOrganization()

  const context: TenantContext = {
    organizationId: organization.id,
    organization,
    userId: '', // Will be set by auth middleware
    userRole: '',
    timestamp: Date.now(),
  }

  return context
}

/**
 * Require organization context in route/action
 * Throws error if context is missing
 *
 * @returns Organization ID
 * @throws {TenantContextError} If context is missing
 *
 * @example
 * ```typescript
 * export async function createCustomer(data) {
 *   'use server'
 *   await requireOrganization()
 *   // Safe to proceed - organization context exists
 * }
 * ```
 */
export async function requireOrganization(): Promise<string> {
  return await getOrganizationId()
}

/**
 * Higher-order function to wrap API routes with tenant context
 * Automatically injects organization context
 *
 * @param handler - Route handler function
 * @returns Wrapped handler with tenant context
 *
 * @example
 * ```typescript
 * export const GET = withTenantContext(async (request, context) => {
 *   const { organizationId } = context
 *   const customers = await getCustomers(organizationId)
 *   return Response.json(customers)
 * })
 * ```
 */
export function withTenantContext<T extends (...args: any[]) => any>(
  handler: (context: TenantContext, ...args: Parameters<T>) => ReturnType<T>
): (...args: Parameters<T>) => ReturnType<T> {
  return async (...args: Parameters<T>) => {
    const context = await extractTenantContext()
    return handler(context, ...args)
  }
}

/**
 * Validate tenant access before proceeding
 * Use in API routes that receive organization ID in request
 *
 * @param organizationId - Organization ID from request
 * @throws {OrganizationAccessDeniedError} If user doesn't belong to organization
 *
 * @example
 * ```typescript
 * export async function POST(request: Request) {
 *   const { organizationId } = await request.json()
 *   await validateTenantAccess(organizationId)
 *   // Safe to proceed
 * }
 * ```
 */
export async function validateTenantAccess(organizationId: string): Promise<void> {
  await validateOrganizationAccess(organizationId)
}

/**
 * Require resource access validation
 * Validates that resource belongs to current organization
 * Use before update/delete operations
 *
 * @param resourceType - Type of resource
 * @param resourceId - Resource UUID
 * @throws {TenantIsolationError} If resource doesn't belong to org
 *
 * @example
 * ```typescript
 * export async function DELETE(
 *   request: Request,
 *   { params }: { params: { id: string } }
 * ) {
 *   await requireResourceAccess('customer', params.id)
 *   // Safe to delete
 *   await deleteCustomer(params.id)
 * }
 * ```
 */
export async function requireResourceAccess(
  resourceType: TenantResource | string,
  resourceId: string
): Promise<void> {
  await validateResourceInOrganization(resourceType, resourceId)
}

/**
 * Inject tenant context into request object
 * For frameworks that support request context
 *
 * @param request - Request object
 * @returns Request with tenant context
 *
 * @example
 * ```typescript
 * export async function middleware(request: Request) {
 *   const requestWithContext = await injectTenantContext(request)
 *   return NextResponse.next()
 * }
 * ```
 */
export async function injectTenantContext<T extends Record<string, any>>(
  request: T
): Promise<T & { tenantContext: TenantContext }> {
  const tenantContext = await extractTenantContext()

  return {
    ...request,
    tenantContext,
  }
}

/**
 * Wrapper for server actions with tenant context
 * Automatically validates organization context
 *
 * @param action - Server action function
 * @returns Wrapped action with validation
 *
 * @example
 * ```typescript
 * export const createInvoiceAction = withTenantValidation(
 *   async (data: InvoiceData) => {
 *     // Organization context already validated
 *     const orgId = await getOrganizationId()
 *     return await createInvoice({ ...data, organization_id: orgId })
 *   }
 * )
 * ```
 */
export function withTenantValidation<T extends (...args: any[]) => any>(
  action: T
): (...args: Parameters<T>) => ReturnType<T> {
  return async (...args: Parameters<T>) => {
    // Validate organization context exists
    await requireOrganization()

    // Execute action
    return action(...args)
  }
}

/**
 * Middleware for tRPC procedures
 * Adds tenant context to procedure context
 *
 * @example
 * ```typescript
 * const tenantProcedure = publicProcedure
 *   .use(tenantMiddleware)
 *
 * export const appRouter = router({
 *   getCustomers: tenantProcedure
 *     .query(async ({ ctx }) => {
 *       const { organizationId } = ctx.tenant
 *       return await getCustomers(organizationId)
 *     })
 * })
 * ```
 */
export async function tenantMiddleware(opts: { next: any; ctx: any }) {
  const tenantContext = await extractTenantContext()

  return opts.next({
    ctx: {
      ...opts.ctx,
      tenant: tenantContext,
    },
  })
}

/**
 * Wrapper for route handlers with automatic error handling
 * Catches tenant errors and returns appropriate HTTP responses
 *
 * @param handler - Route handler
 * @returns Wrapped handler with error handling
 *
 * @example
 * ```typescript
 * export const GET = withTenantErrorHandling(async (request) => {
 *   const org = await getCurrentOrganization()
 *   return Response.json({ org })
 * })
 * ```
 */
export function withTenantErrorHandling<T extends (...args: any[]) => any>(
  handler: T
): (...args: Parameters<T>) => Promise<Response> {
  return async (...args: Parameters<T>) => {
    try {
      return await handler(...args)
    } catch (error: any) {
      if (error.name === 'TenantContextError') {
        return new Response(
          JSON.stringify({
            error: error.message,
            code: error.code,
          }),
          {
            status: error.statusCode || 400,
            headers: { 'Content-Type': 'application/json' },
          }
        )
      }

      if (error.name === 'TenantIsolationError') {
        return new Response(
          JSON.stringify({
            error: 'Resource not found',
            code: 'RESOURCE_NOT_FOUND',
          }),
          {
            status: 404,
            headers: { 'Content-Type': 'application/json' },
          }
        )
      }

      if (error.name === 'OrganizationNotFoundError') {
        return new Response(
          JSON.stringify({
            error: 'Organization not found',
            code: 'ORGANIZATION_NOT_FOUND',
          }),
          {
            status: 404,
            headers: { 'Content-Type': 'application/json' },
          }
        )
      }

      // Re-throw other errors
      throw error
    }
  }
}
