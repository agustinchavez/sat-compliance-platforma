'use server'

import { revalidatePath } from 'next/cache'
import { requireAuth } from '@/lib/auth'
import {
  configurePAC,
  getPACConfig,
  testPACConnection,
  removePACConfig,
} from '@/lib/organizations/pac'
import type { PACProvider, PACEnvironment, PACConfig, PACConnectionTestResult } from '@/lib/organizations/types'

export interface PACFormState {
  success: boolean
  error: string | null
  message: string | null
}

/**
 * Get current PAC configuration
 */
export async function getPACData(): Promise<{
  config: PACConfig | null
}> {
  const user = await requireAuth()
  const config = await getPACConfig(user.organizationId)
  return { config }
}

/**
 * Configure PAC provider
 */
export async function configurePACAction(
  _prevState: PACFormState,
  formData: FormData
): Promise<PACFormState> {
  try {
    const user = await requireAuth()

    const provider = formData.get('provider') as PACProvider
    const environment = formData.get('environment') as PACEnvironment
    const username = formData.get('username') as string
    const password = formData.get('password') as string

    // Validate inputs
    if (!provider) {
      return { success: false, error: 'PAC provider is required', message: null }
    }
    if (!environment) {
      return { success: false, error: 'Environment is required', message: null }
    }
    if (!username?.trim()) {
      return { success: false, error: 'Username/API key is required', message: null }
    }
    if (!password?.trim()) {
      return { success: false, error: 'Password/API secret is required', message: null }
    }

    const config: PACConfig = {
      provider,
      environment,
      credentials: {
        username: username.trim(),
        password: password.trim(),
      },
      isActive: true,
    }

    const result = await configurePAC(user.organizationId, config)

    if (!result.success) {
      return {
        success: false,
        error: result.error || 'Configuration failed',
        message: null,
      }
    }

    revalidatePath('/settings/pac')
    revalidatePath('/settings/organization')

    return {
      success: true,
      error: null,
      message: 'PAC provider configured successfully',
    }
  } catch (error) {
    console.error('Error configuring PAC:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to configure PAC',
      message: null,
    }
  }
}

/**
 * Test PAC connection
 */
export async function testPACConnectionAction(): Promise<PACConnectionTestResult> {
  const user = await requireAuth()
  const result = await testPACConnection(user.organizationId)
  revalidatePath('/settings/pac')
  return result
}

/**
 * Remove PAC configuration
 */
export async function removePACAction(): Promise<PACFormState> {
  try {
    const user = await requireAuth()
    await removePACConfig(user.organizationId)

    revalidatePath('/settings/pac')
    revalidatePath('/settings/organization')

    return {
      success: true,
      error: null,
      message: 'PAC configuration removed',
    }
  } catch (error) {
    console.error('Error removing PAC:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to remove PAC',
      message: null,
    }
  }
}
