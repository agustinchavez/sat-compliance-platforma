/**
 * Auth Helper Utilities
 *
 * Provides type-safe auth helpers for:
 * - Getting current user
 * - Getting current session
 * - Checking user roles and permissions
 */

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export type UserRole = 'owner' | 'admin' | 'accountant' | 'user'

export interface CurrentUser {
  id: string
  authId: string
  email: string
  fullName: string
  role: UserRole
  organizationId: string
  emailVerified: boolean
  organization: {
    id: string
    name: string
    rfc: string
    plan: string
  }
}

/**
 * Get current authenticated user with organization data
 * Returns null if not authenticated
 */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const supabase = await createClient()

  // Check if user is authenticated
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser()

  if (!authUser) {
    return null
  }

  // Get user data from public.users table with organization
  const { data: user, error } = await supabase
    .from('users')
    .select(`
      id,
      auth_id,
      email,
      full_name,
      role,
      organization_id,
      email_verified,
      organization:organizations(
        id,
        name,
        rfc,
        plan
      )
    `)
    .eq('auth_id', authUser.id)
    .is('deleted_at', null)
    .single()

  if (error || !user) {
    return null
  }

  return {
    id: user.id,
    authId: user.auth_id,
    email: user.email,
    fullName: user.full_name,
    role: user.role as UserRole,
    organizationId: user.organization_id,
    emailVerified: user.email_verified,
    organization: Array.isArray(user.organization)
      ? user.organization[0]
      : user.organization,
  }
}

/**
 * Require authentication - redirect to login if not authenticated
 */
export async function requireAuth(): Promise<CurrentUser> {
  const user = await getCurrentUser()

  if (!user) {
    redirect('/login')
  }

  return user
}

/**
 * Require specific role(s) - redirect if user doesn't have required role
 */
export async function requireRole(
  allowedRoles: UserRole | UserRole[]
): Promise<CurrentUser> {
  const user = await requireAuth()

  const roles = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles]

  if (!roles.includes(user.role)) {
    redirect('/unauthorized')
  }

  return user
}

/**
 * Require email verification
 */
export async function requireEmailVerified(): Promise<CurrentUser> {
  const user = await requireAuth()

  if (!user.emailVerified) {
    redirect('/verify-email')
  }

  return user
}

/**
 * Check if user has specific role
 */
export async function hasRole(role: UserRole | UserRole[]): Promise<boolean> {
  const user = await getCurrentUser()

  if (!user) return false

  const roles = Array.isArray(role) ? role : [role]
  return roles.includes(user.role)
}

/**
 * Check if user is organization owner
 */
export async function isOwner(): Promise<boolean> {
  return await hasRole('owner')
}

/**
 * Check if user is admin or owner
 */
export async function isAdmin(): Promise<boolean> {
  return await hasRole(['owner', 'admin'])
}

/**
 * Get current session
 */
export async function getSession() {
  const supabase = await createClient()
  const {
    data: { session },
  } = await supabase.auth.getSession()

  return session
}

/**
 * Sign out current user
 */
export async function signOut() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect('/login')
}
