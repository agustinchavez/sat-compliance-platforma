'use server'

import { revalidatePath } from 'next/cache'
import { requireAuth } from '@/lib/auth'
import {
  uploadCertificates,
  getCertificateInfo,
  deleteCertificates,
  checkCertificateExpiration,
} from '@/lib/organizations/certificates'
import type { CertificateInfo } from '@/lib/organizations/types'

export interface CertificateFormState {
  success: boolean
  error: string | null
  message: string | null
  certificateInfo?: CertificateInfo
}

/**
 * Get current certificate information
 */
export async function getCertificateData(): Promise<{
  certificateInfo: CertificateInfo | null
  expirationStatus: {
    hasExpired: boolean
    isExpiring: boolean
    daysRemaining: number | null
    validTo: Date | null
  }
}> {
  const user = await requireAuth()
  const certificateInfo = await getCertificateInfo(user.organizationId)
  const expirationStatus = await checkCertificateExpiration(user.organizationId)

  return { certificateInfo, expirationStatus }
}

/**
 * Upload CFDI certificates
 */
export async function uploadCertificateAction(
  _prevState: CertificateFormState,
  formData: FormData
): Promise<CertificateFormState> {
  try {
    const user = await requireAuth()

    // Get files from form
    const cerFile = formData.get('cerFile') as File | null
    const keyFile = formData.get('keyFile') as File | null
    const password = formData.get('password') as string

    // Validate inputs
    if (!cerFile || cerFile.size === 0) {
      return {
        success: false,
        error: 'Certificate file (.cer) is required',
        message: null,
      }
    }

    if (!keyFile || keyFile.size === 0) {
      return {
        success: false,
        error: 'Private key file (.key) is required',
        message: null,
      }
    }

    if (!password?.trim()) {
      return {
        success: false,
        error: 'Certificate password is required',
        message: null,
      }
    }

    // Validate file extensions
    if (!cerFile.name.toLowerCase().endsWith('.cer')) {
      return {
        success: false,
        error: 'Certificate file must have .cer extension',
        message: null,
      }
    }

    if (!keyFile.name.toLowerCase().endsWith('.key')) {
      return {
        success: false,
        error: 'Private key file must have .key extension',
        message: null,
      }
    }

    // Convert files to buffers
    const cerBuffer = Buffer.from(await cerFile.arrayBuffer())
    const keyBuffer = Buffer.from(await keyFile.arrayBuffer())

    // Upload certificates
    const result = await uploadCertificates(
      user.organizationId,
      {
        cerFile: cerBuffer,
        keyFile: keyBuffer,
        password: password.trim(),
      },
      user.id
    )

    if (!result.success) {
      return {
        success: false,
        error: result.error || 'Upload failed',
        message: null,
      }
    }

    revalidatePath('/settings/certificates')
    revalidatePath('/settings/organization')

    return {
      success: true,
      error: null,
      message: 'Certificates uploaded successfully',
      certificateInfo: result.certificateInfo,
    }
  } catch (error) {
    console.error('Error uploading certificates:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to upload certificates',
      message: null,
    }
  }
}

/**
 * Delete certificates
 */
export async function deleteCertificateAction(): Promise<CertificateFormState> {
  try {
    const user = await requireAuth()

    await deleteCertificates(user.organizationId)

    revalidatePath('/settings/certificates')
    revalidatePath('/settings/organization')

    return {
      success: true,
      error: null,
      message: 'Certificates deleted successfully',
    }
  } catch (error) {
    console.error('Error deleting certificates:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to delete certificates',
      message: null,
    }
  }
}
