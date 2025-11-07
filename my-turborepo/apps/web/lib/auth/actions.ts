/**
 * Auth Server Actions
 *
 * Server-side authentication actions for signup, login, etc.
 */

'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { headers } from 'next/headers'

export interface SignupData {
  email: string
  password: string
  fullName: string
  organizationName: string
  organizationRfc: string
  legalName: string
  taxRegime: string
}

export interface AuthResult {
  success: boolean
  error?: string
  data?: any
}

/**
 * Sign up a new user and create their organization
 */
export async function signUp(data: SignupData): Promise<AuthResult> {
  try {
    const supabase = await createClient()

    // Validate RFC format (basic validation)
    const rfcRegex = /^[A-ZÑ&]{3,4}\d{6}[A-Z\d]{3}$/
    if (!rfcRegex.test(data.organizationRfc)) {
      return {
        success: false,
        error: 'RFC format is invalid. Please check and try again.',
      }
    }

    // Check if RFC already exists
    const { data: existingOrg } = await supabase
      .from('organizations')
      .select('id')
      .eq('rfc', data.organizationRfc)
      .single()

    if (existingOrg) {
      return {
        success: false,
        error: 'An organization with this RFC already exists.',
      }
    }

    // Create auth user with metadata for trigger
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email: data.email,
      password: data.password,
      options: {
        data: {
          full_name: data.fullName,
          is_org_owner: true,
          organization_name: data.organizationName,
          organization_rfc: data.organizationRfc,
          legal_name: data.legalName,
          tax_regime: data.taxRegime,
          plan: 'free',
        },
        emailRedirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback`,
      },
    })

    if (authError) {
      return {
        success: false,
        error: authError.message,
      }
    }

    return {
      success: true,
      data: {
        user: authData.user,
        session: authData.session,
      },
    }
  } catch (error: any) {
    console.error('Signup error:', error)
    return {
      success: false,
      error: error.message || 'An unexpected error occurred during signup.',
    }
  }
}

/**
 * Sign in an existing user
 */
export async function signIn(
  email: string,
  password: string
): Promise<AuthResult> {
  try {
    const supabase = await createClient()

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error) {
      return {
        success: false,
        error: 'Invalid email or password.',
      }
    }

    // Check if email is verified
    if (!data.user.email_confirmed_at) {
      await supabase.auth.signOut()
      return {
        success: false,
        error: 'Please verify your email before logging in.',
      }
    }

    return {
      success: true,
      data: {
        user: data.user,
        session: data.session,
      },
    }
  } catch (error: any) {
    console.error('Sign in error:', error)
    return {
      success: false,
      error: error.message || 'An unexpected error occurred during login.',
    }
  }
}

/**
 * Sign out the current user
 */
export async function signOutAction(): Promise<void> {
  const supabase = await createClient()
  const { error } = await supabase.auth.signOut()

  if (error) {
    console.error('Sign out error:', error)
    throw new Error(error.message)
  }

  redirect('/login')
}

/**
 * Resend verification email
 */
export async function resendVerificationEmail(
  email: string
): Promise<AuthResult> {
  try {
    const supabase = await createClient()

    const { error } = await supabase.auth.resend({
      type: 'signup',
      email,
      options: {
        emailRedirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback`,
      },
    })

    if (error) {
      return {
        success: false,
        error: error.message,
      }
    }

    return {
      success: true,
    }
  } catch (error: any) {
    console.error('Resend verification error:', error)
    return {
      success: false,
      error:
        error.message ||
        'An unexpected error occurred while resending verification email.',
    }
  }
}

/**
 * Request password reset
 */
export async function requestPasswordReset(
  email: string
): Promise<AuthResult> {
  try {
    const supabase = await createClient()

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/reset-password`,
    })

    if (error) {
      return {
        success: false,
        error: error.message,
      }
    }

    return {
      success: true,
    }
  } catch (error: any) {
    console.error('Password reset request error:', error)
    return {
      success: false,
      error:
        error.message ||
        'An unexpected error occurred while requesting password reset.',
    }
  }
}

/**
 * Update password with reset token
 */
export async function updatePassword(newPassword: string): Promise<AuthResult> {
  try {
    const supabase = await createClient()

    const { error } = await supabase.auth.updateUser({
      password: newPassword,
    })

    if (error) {
      return {
        success: false,
        error: error.message,
      }
    }

    return {
      success: true,
    }
  } catch (error: any) {
    console.error('Password update error:', error)
    return {
      success: false,
      error:
        error.message || 'An unexpected error occurred while updating password.',
    }
  }
}
