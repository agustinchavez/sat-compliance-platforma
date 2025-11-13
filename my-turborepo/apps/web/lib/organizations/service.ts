/**
 * Organization Service
 *
 * This file provides core organization management functionality including:
 * - CRUD operations for organizations
 * - Organization setup status checking
 * - Organization statistics
 * - Soft delete/restore operations
 */

import { createClient } from '@/lib/supabase/server';
import type {
  Organization,
  OrganizationUpdateData,
  OrganizationSetupStatus,
  OrganizationStats,
  OrganizationError,
  OrganizationAddress,
} from './types';
import {
  validateOrganizationData,
  validateRFC,
  validateAddress,
} from './validation';

// ============================================================================
// Read Operations
// ============================================================================

/**
 * Gets an organization by ID
 *
 * @param organizationId - Organization UUID
 * @returns Organization data or null if not found
 *
 * @example
 * ```ts
 * const org = await getOrganization('org-uuid');
 * if (org) {
 *   console.log(org.name, org.rfc);
 * }
 * ```
 */
export async function getOrganization(
  organizationId: string
): Promise<Organization | null> {
  try {
    const supabase = await createClient();

    const { data, error } = await supabase
      .from('organizations')
      .select('*')
      .eq('id', organizationId)
      .is('deleted_at', null)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        // Not found
        return null;
      }
      throw error;
    }

    return data as Organization;
  } catch (error) {
    throw new Error(
      `Failed to get organization: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Gets an organization by RFC
 *
 * @param rfc - RFC to search for
 * @returns Organization data or null if not found
 *
 * @example
 * ```ts
 * const org = await getOrganizationByRFC('ABC123456XYZ');
 * ```
 */
export async function getOrganizationByRFC(
  rfc: string
): Promise<Organization | null> {
  try {
    const supabase = await createClient();

    const { data, error } = await supabase
      .from('organizations')
      .select('*')
      .eq('rfc', rfc.trim().toUpperCase())
      .is('deleted_at', null)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return null;
      }
      throw error;
    }

    return data as Organization;
  } catch (error) {
    throw new Error(
      `Failed to get organization by RFC: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Lists all active organizations (admin/system use)
 *
 * @param options - Query options
 * @returns Array of organizations
 */
export async function listOrganizations(options?: {
  limit?: number;
  offset?: number;
  includeDeleted?: boolean;
}): Promise<Organization[]> {
  try {
    const supabase = await createClient();

    let query = supabase
      .from('organizations')
      .select('*')
      .order('created_at', { ascending: false });

    if (!options?.includeDeleted) {
      query = query.is('deleted_at', null);
    }

    if (options?.limit) {
      query = query.limit(options.limit);
    }

    if (options?.offset) {
      query = query.range(options.offset, options.offset + (options.limit || 10) - 1);
    }

    const { data, error } = await query;

    if (error) {
      throw error;
    }

    return (data as Organization[]) || [];
  } catch (error) {
    throw new Error(
      `Failed to list organizations: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

// ============================================================================
// Update Operations
// ============================================================================

/**
 * Updates an organization
 *
 * @param organizationId - Organization UUID
 * @param updateData - Data to update
 * @returns Updated organization
 *
 * @example
 * ```ts
 * const updated = await updateOrganization('org-uuid', {
 *   name: 'New Business Name',
 *   email: 'contact@newbusiness.com',
 *   address: {
 *     street: 'Av. Reforma',
 *     exterior_number: '123',
 *     colony: 'Juárez',
 *     city: 'Ciudad de México',
 *     state: 'CDMX',
 *     postal_code: '06600',
 *     country: 'México'
 *   }
 * });
 * ```
 */
export async function updateOrganization(
  organizationId: string,
  updateData: OrganizationUpdateData
): Promise<Organization> {
  try {
    // Validate update data
    const validation = validateOrganizationData(updateData);
    if (!validation.valid) {
      throw new Error(`Validation failed: ${validation.errors.join(', ')}`);
    }

    const supabase = await createClient();

    // Check if organization exists and is not deleted
    const existing = await getOrganization(organizationId);
    if (!existing) {
      throw new Error('Organization not found or has been deleted');
    }

    // Prepare update object
    const updates: any = {
      ...updateData,
      updated_at: new Date().toISOString(),
    };

    // Normalize RFC if provided
    if (updates.rfc) {
      updates.rfc = updates.rfc.trim().toUpperCase();
    }

    // Update organization
    const { data, error } = await supabase
      .from('organizations')
      .update(updates)
      .eq('id', organizationId)
      .select()
      .single();

    if (error) {
      throw error;
    }

    // TODO: Log audit trail
    // await logOrganizationChange(organizationId, 'organization_updated', updateData);

    return data as Organization;
  } catch (error) {
    throw new Error(
      `Failed to update organization: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Updates organization address
 *
 * @param organizationId - Organization UUID
 * @param address - New address
 * @returns Updated organization
 */
export async function updateOrganizationAddress(
  organizationId: string,
  address: OrganizationAddress
): Promise<Organization> {
  try {
    // Validate address
    const validation = validateAddress(address, { required: true });
    if (!validation.valid) {
      throw new Error(`Address validation failed: ${validation.errors.join(', ')}`);
    }

    return await updateOrganization(organizationId, { address });
  } catch (error) {
    throw new Error(
      `Failed to update organization address: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

// ============================================================================
// Delete Operations
// ============================================================================

/**
 * Soft deletes an organization
 * Sets deleted_at timestamp and prevents further operations
 *
 * @param organizationId - Organization UUID
 * @returns Success status
 *
 * @example
 * ```ts
 * await deleteOrganization('org-uuid');
 * // Organization is now soft-deleted
 * ```
 */
export async function deleteOrganization(
  organizationId: string
): Promise<{ success: boolean }> {
  try {
    const supabase = await createClient();

    // Check if organization exists
    const existing = await getOrganization(organizationId);
    if (!existing) {
      throw new Error('Organization not found');
    }

    // Soft delete by setting deleted_at
    const { error } = await supabase
      .from('organizations')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', organizationId);

    if (error) {
      throw error;
    }

    // TODO: Log audit trail
    // await logOrganizationChange(organizationId, 'organization_deleted', {});

    return { success: true };
  } catch (error) {
    throw new Error(
      `Failed to delete organization: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Restores a soft-deleted organization
 *
 * @param organizationId - Organization UUID
 * @returns Restored organization
 *
 * @example
 * ```ts
 * const restored = await restoreOrganization('org-uuid');
 * ```
 */
export async function restoreOrganization(
  organizationId: string
): Promise<Organization> {
  try {
    const supabase = await createClient();

    // Update to remove deleted_at
    const { data, error } = await supabase
      .from('organizations')
      .update({ deleted_at: null })
      .eq('id', organizationId)
      .select()
      .single();

    if (error) {
      throw error;
    }

    // TODO: Log audit trail
    // await logOrganizationChange(organizationId, 'organization_restored', {});

    return data as Organization;
  } catch (error) {
    throw new Error(
      `Failed to restore organization: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

// ============================================================================
// Setup Status & Validation
// ============================================================================

/**
 * Validates if an organization is ready for invoice generation
 * Checks all required setup steps
 *
 * @param organizationId - Organization UUID
 * @returns Setup status with completion percentage
 *
 * @example
 * ```ts
 * const status = await validateOrganizationSetup('org-uuid');
 * if (!status.isComplete) {
 *   console.log('Missing steps:', status.missingSteps);
 *   console.log('Progress:', status.completionPercentage + '%');
 * }
 * ```
 */
export async function validateOrganizationSetup(
  organizationId: string
): Promise<OrganizationSetupStatus> {
  try {
    const org = await getOrganization(organizationId);
    if (!org) {
      throw new Error('Organization not found');
    }

    // Check basic info
    const hasBasicInfo = !!(org.name && org.rfc && org.legal_name && org.tax_regime);

    // Check complete address
    const hasCompleteAddress = !!(
      org.address &&
      org.address.street &&
      org.address.exterior_number &&
      org.address.colony &&
      org.address.city &&
      org.address.state &&
      org.address.postal_code
    );

    // Check certificates
    const hasCertificates = !!(org.cfdi_cert && org.cfdi_key);

    // Check certificate validity (TODO: implement actual expiry check)
    const certificatesValid = hasCertificates; // Simplified for now

    // Check PAC configuration
    const hasPACConfig = !!(org.pac_provider && org.pac_credentials);

    // Check if PAC has been tested (TODO: check actual test result)
    const pacConfigTested = hasPACConfig; // Simplified for now

    // Calculate completion percentage
    const checks = [
      hasBasicInfo,
      hasCompleteAddress,
      hasCertificates,
      certificatesValid,
      hasPACConfig,
      pacConfigTested,
    ];
    const completedChecks = checks.filter(Boolean).length;
    const completionPercentage = Math.round((completedChecks / checks.length) * 100);

    // Determine missing steps
    const missingSteps: string[] = [];
    if (!hasBasicInfo) missingSteps.push('Complete basic organization information');
    if (!hasCompleteAddress) missingSteps.push('Add complete organization address');
    if (!hasCertificates) missingSteps.push('Upload CFDI certificates');
    if (hasCertificates && !certificatesValid)
      missingSteps.push('Certificates are invalid or expired');
    if (!hasPACConfig) missingSteps.push('Configure PAC provider');
    if (hasPACConfig && !pacConfigTested) missingSteps.push('Test PAC connection');

    const isComplete = completionPercentage === 100;

    return {
      isComplete,
      completionPercentage,
      missingSteps,
      checks: {
        hasBasicInfo,
        hasCompleteAddress,
        hasCertificates,
        certificatesValid,
        hasPACConfig,
        pacConfigTested,
      },
    };
  } catch (error) {
    throw new Error(
      `Failed to validate organization setup: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

// ============================================================================
// Organization Statistics
// ============================================================================

/**
 * Gets organization statistics
 *
 * @param organizationId - Organization UUID
 * @returns Organization statistics
 *
 * @example
 * ```ts
 * const stats = await getOrganizationStats('org-uuid');
 * console.log('Total invoices:', stats.totalInvoices);
 * console.log('Certificate expires in:', stats.certificateExpiresIn, 'days');
 * ```
 */
export async function getOrganizationStats(
  organizationId: string
): Promise<OrganizationStats> {
  try {
    const supabase = await createClient();

    // Get invoice count
    const { count: totalInvoices } = await supabase
      .from('invoices')
      .select('*', { count: 'exact', head: true })
      .eq('organization_id', organizationId)
      .is('deleted_at', null);

    // Get customer count
    const { count: totalCustomers } = await supabase
      .from('customers')
      .select('*', { count: 'exact', head: true })
      .eq('organization_id', organizationId)
      .is('deleted_at', null);

    // Get total revenue (sum of paid invoices)
    const { data: revenueData } = await supabase
      .from('invoices')
      .select('total')
      .eq('organization_id', organizationId)
      .eq('payment_status', 'paid')
      .is('deleted_at', null);

    const totalRevenue = revenueData?.reduce((sum, inv) => sum + Number(inv.total || 0), 0) || 0;

    // Check setup status
    const setupStatus = await validateOrganizationSetup(organizationId);

    // TODO: Get actual certificate expiry date and calculate days remaining
    const certificateExpiresIn = null;

    return {
      totalInvoices: totalInvoices || 0,
      totalCustomers: totalCustomers || 0,
      totalRevenue,
      certificateExpiresIn,
      setupComplete: setupStatus.isComplete,
    };
  } catch (error) {
    throw new Error(
      `Failed to get organization stats: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Checks if an organization is active (not deleted)
 *
 * @param organizationId - Organization UUID
 * @returns True if active
 */
export async function isOrganizationActive(organizationId: string): Promise<boolean> {
  const org = await getOrganization(organizationId);
  return org !== null;
}

/**
 * Checks if an organization can generate invoices
 *
 * @param organizationId - Organization UUID
 * @returns True if ready for invoicing
 */
export async function canGenerateInvoices(organizationId: string): Promise<boolean> {
  const setupStatus = await validateOrganizationSetup(organizationId);
  return setupStatus.isComplete;
}

/**
 * Gets organization display name
 *
 * @param org - Organization object
 * @returns Display name (name or legal name)
 */
export function getOrganizationDisplayName(org: Organization): string {
  return org.name || org.legal_name || org.rfc;
}
