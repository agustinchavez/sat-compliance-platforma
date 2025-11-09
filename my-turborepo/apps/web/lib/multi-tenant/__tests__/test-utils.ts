/**
 * Multi-Tenant Test Utilities
 *
 * Utilities for creating test organizations and users for integration testing
 */

import { createClient } from '@/lib/supabase/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export interface TestOrganization {
  id: string
  name: string
  rfc: string
  legalName: string
}

export interface TestUser {
  id: string
  authId: string
  email: string
  organizationId: string
  role: string
}

/**
 * Create a test organization in the database
 */
export async function createTestOrganization(
  name: string = 'Test Organization'
): Promise<TestOrganization> {
  const supabase = await createClient()

  const orgData = {
    name,
    legal_name: `${name} S.A. de C.V.`,
    rfc: `TEST${Date.now().toString().slice(-9)}`, // Unique RFC
    tax_regime: '601',
    status: 'active',
    plan: 'professional',
  }

  const { data, error } = await supabase
    .from('organizations')
    .insert(orgData)
    .select()
    .single()

  if (error) {
    throw new Error(`Failed to create test organization: ${error.message}`)
  }

  return {
    id: data.id,
    name: data.name,
    rfc: data.rfc,
    legalName: data.legal_name,
  }
}

/**
 * Create a test user in Supabase Auth and users table
 */
export async function createTestUser(
  organizationId: string,
  email?: string,
  role: string = 'user'
): Promise<TestUser> {
  const supabase = await createClient()

  // Generate unique email if not provided
  const userEmail = email || `test-${Date.now()}@test.com`
  const password = 'TestPassword123!'

  // Create auth user
  const { data: authData, error: authError } = await supabase.auth.admin.createUser({
    email: userEmail,
    password,
    email_confirm: true,
  })

  if (authError || !authData.user) {
    throw new Error(`Failed to create auth user: ${authError?.message}`)
  }

  // Create user record
  const { data: userData, error: userError } = await supabase
    .from('users')
    .insert({
      auth_id: authData.user.id,
      email: userEmail,
      full_name: `Test User ${Date.now()}`,
      organization_id: organizationId,
      role,
      status: 'active',
    })
    .select()
    .single()

  if (userError) {
    throw new Error(`Failed to create user record: ${userError.message}`)
  }

  return {
    id: userData.id,
    authId: authData.user.id,
    email: userEmail,
    organizationId,
    role,
  }
}

/**
 * Login as a specific test user
 */
export async function loginAsUser(email: string, password: string = 'TestPassword123!') {
  const supabase = await createClient()

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  })

  if (error) {
    throw new Error(`Failed to login: ${error.message}`)
  }

  return data
}

/**
 * Create a test resource in a specific organization
 */
export async function createTestResource(
  tableName: string,
  organizationId: string,
  data: Record<string, any>
): Promise<any> {
  const supabase = await createClient()

  const { data: resource, error } = await supabase
    .from(tableName)
    .insert({
      ...data,
      organization_id: organizationId,
    })
    .select()
    .single()

  if (error) {
    throw new Error(`Failed to create test resource: ${error.message}`)
  }

  return resource
}

/**
 * Clean up test data
 */
export async function cleanupTestOrganization(organizationId: string) {
  const supabase = await createClient()

  // Delete users (will cascade to related data via FK constraints)
  const { error: usersError } = await supabase
    .from('users')
    .delete()
    .eq('organization_id', organizationId)

  if (usersError) {
    console.error('Failed to delete test users:', usersError)
  }

  // Delete organization
  const { error: orgError } = await supabase
    .from('organizations')
    .delete()
    .eq('id', organizationId)

  if (orgError) {
    console.error('Failed to delete test organization:', orgError)
  }
}

/**
 * Clean up test auth user
 */
export async function cleanupTestAuthUser(authId: string) {
  const supabase = await createClient()

  const { error } = await supabase.auth.admin.deleteUser(authId)

  if (error) {
    console.error('Failed to delete test auth user:', error)
  }
}

/**
 * Get authenticated Supabase client for testing
 * This bypasses RLS for admin operations
 */
export async function getAdminClient() {
  return createClient()
}

/**
 * Create a client with specific user session for testing RLS
 */
export async function getClientAsUser(authId: string) {
  const supabase = await createClient()

  // This is a simplified version - in real tests you'd set up proper session
  // For now, we'll use the admin client and rely on RLS policies
  return supabase
}
