'use server'

import { revalidatePath } from 'next/cache'
import { requireAuth } from '@/lib/auth'
import { getOrganization, updateOrganization, validateOrganizationSetup } from '@/lib/organizations/service'
import type { OrganizationAddress } from '@/lib/organizations/types'

export interface OrganizationFormState {
  success: boolean
  error: string | null
  message: string | null
}

/**
 * Get organization data for the current user
 */
export async function getOrganizationData() {
  const user = await requireAuth()
  const org = await getOrganization(user.organizationId)
  const setupStatus = await validateOrganizationSetup(user.organizationId)

  return { organization: org, setupStatus }
}

/**
 * Update organization profile
 */
export async function updateOrganizationProfile(
  _prevState: OrganizationFormState,
  formData: FormData
): Promise<OrganizationFormState> {
  try {
    const user = await requireAuth()

    // Extract form data
    const name = formData.get('name') as string
    const legalName = formData.get('legal_name') as string
    const email = formData.get('email') as string
    const phone = formData.get('phone') as string
    const taxRegime = formData.get('tax_regime') as string

    // Validate required fields
    if (!name?.trim()) {
      return { success: false, error: 'Organization name is required', message: null }
    }
    if (!legalName?.trim()) {
      return { success: false, error: 'Legal name (Razón Social) is required', message: null }
    }

    // Update organization
    await updateOrganization(user.organizationId, {
      name: name.trim(),
      legal_name: legalName.trim(),
      email: email?.trim() || undefined,
      phone: phone?.trim() || undefined,
      tax_regime: taxRegime || undefined,
    })

    revalidatePath('/settings/organization')
    revalidatePath('/dashboard')

    return {
      success: true,
      error: null,
      message: 'Organization profile updated successfully',
    }
  } catch (error) {
    console.error('Error updating organization:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update organization',
      message: null,
    }
  }
}

/**
 * Update organization address
 */
export async function updateOrganizationAddressAction(
  _prevState: OrganizationFormState,
  formData: FormData
): Promise<OrganizationFormState> {
  try {
    const user = await requireAuth()

    // Extract address fields
    const address: OrganizationAddress = {
      street: formData.get('street') as string,
      exterior_number: formData.get('exterior_number') as string,
      interior_number: (formData.get('interior_number') as string) || undefined,
      colony: formData.get('colony') as string,
      locality: (formData.get('locality') as string) || undefined,
      municipality: (formData.get('municipality') as string) || undefined,
      city: formData.get('city') as string,
      state: formData.get('state') as string,
      postal_code: formData.get('postal_code') as string,
      country: (formData.get('country') as string) || 'México',
    }

    // Validate required fields
    if (!address.street?.trim()) {
      return { success: false, error: 'Street is required', message: null }
    }
    if (!address.exterior_number?.trim()) {
      return { success: false, error: 'Exterior number is required', message: null }
    }
    if (!address.colony?.trim()) {
      return { success: false, error: 'Colony is required', message: null }
    }
    if (!address.city?.trim()) {
      return { success: false, error: 'City is required', message: null }
    }
    if (!address.state?.trim()) {
      return { success: false, error: 'State is required', message: null }
    }
    if (!address.postal_code?.trim() || !/^\d{5}$/.test(address.postal_code)) {
      return { success: false, error: 'Valid 5-digit postal code is required', message: null }
    }

    // Update organization
    await updateOrganization(user.organizationId, { address })

    revalidatePath('/settings/organization')

    return {
      success: true,
      error: null,
      message: 'Address updated successfully',
    }
  } catch (error) {
    console.error('Error updating address:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update address',
      message: null,
    }
  }
}
