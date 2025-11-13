/**
 * Organization Utility Functions
 *
 * This file contains helper utilities for organization management:
 * - Formatting functions
 * - Display helpers
 * - Status checks
 * - Audit logging (TODO)
 */

import type { Organization, OrganizationAddress, CertificateStatus } from './types';
import { formatRFC, formatAddress } from './validation';

// ============================================================================
// Formatting Functions
// ============================================================================

/**
 * Gets organization display name
 * Returns name, or legal name, or RFC as fallback
 *
 * @param org - Organization object
 * @returns Display name
 *
 * @example
 * ```ts
 * const displayName = getOrganizationDisplayName(org);
 * // → "Mi Empresa S.A. de C.V."
 * ```
 */
export function getOrganizationDisplayName(org: Organization): string {
  return org.name || org.legal_name || org.rfc;
}

/**
 * Formats organization address as single line
 *
 * @param org - Organization object
 * @returns Formatted address or empty string
 *
 * @example
 * ```ts
 * const address = getOrganizationAddress(org);
 * // → "Av. Insurgentes Sur 1602, Crédito Constructor, Ciudad de México, CDMX, 03940"
 * ```
 */
export function getOrganizationAddress(org: Organization): string {
  if (!org.address) return '';
  return formatAddress(org.address);
}

/**
 * Formats organization RFC for display
 *
 * @param org - Organization object
 * @returns Formatted RFC
 */
export function getOrganizationRFC(org: Organization): string {
  return formatRFC(org.rfc);
}

// ============================================================================
// Status Checks
// ============================================================================

/**
 * Checks if organization is active (not deleted)
 *
 * @param org - Organization object
 * @returns True if active
 *
 * @example
 * ```ts
 * if (isOrganizationActive(org)) {
 *   // Process organization
 * }
 * ```
 */
export function isOrganizationActive(org: Organization): boolean {
  return org.deleted_at === null;
}

/**
 * Checks if organization can generate invoices
 * Requires: basic info, address, certificates, and PAC config
 *
 * @param org - Organization object
 * @returns True if ready for invoicing
 *
 * @example
 * ```ts
 * if (canGenerateInvoices(org)) {
 *   // Allow invoice generation
 * } else {
 *   // Show setup wizard
 * }
 * ```
 */
export function canGenerateInvoices(org: Organization): boolean {
  // Check basic info
  if (!org.name || !org.rfc || !org.legal_name || !org.tax_regime) {
    return false;
  }

  // Check complete address
  if (
    !org.address ||
    !org.address.street ||
    !org.address.exterior_number ||
    !org.address.colony ||
    !org.address.city ||
    !org.address.state ||
    !org.address.postal_code
  ) {
    return false;
  }

  // Check certificates
  if (!org.cfdi_cert || !org.cfdi_key) {
    return false;
  }

  // Check PAC config
  if (!org.pac_provider || !org.pac_credentials) {
    return false;
  }

  return true;
}

/**
 * Checks if organization has certificates uploaded
 *
 * @param org - Organization object
 * @returns True if certificates are uploaded
 */
export function hasCertificates(org: Organization): boolean {
  return !!(org.cfdi_cert && org.cfdi_key);
}

/**
 * Checks if organization has PAC configured
 *
 * @param org - Organization object
 * @returns True if PAC is configured
 */
export function hasPACConfigured(org: Organization): boolean {
  return !!(org.pac_provider && org.pac_credentials);
}

/**
 * Checks if organization has complete address
 *
 * @param org - Organization object
 * @returns True if address is complete
 */
export function hasCompleteAddress(org: Organization): boolean {
  if (!org.address) return false;

  return !!(
    org.address.street &&
    org.address.exterior_number &&
    org.address.colony &&
    org.address.city &&
    org.address.state &&
    org.address.postal_code
  );
}

/**
 * Calculates organization setup completion percentage
 *
 * @param org - Organization object
 * @returns Completion percentage (0-100)
 *
 * @example
 * ```ts
 * const progress = getSetupProgress(org);
 * // → 75 (75% complete)
 * ```
 */
export function getSetupProgress(org: Organization): number {
  const checks = [
    !!(org.name && org.rfc && org.legal_name && org.tax_regime), // Basic info
    hasCompleteAddress(org), // Complete address
    hasCertificates(org), // Certificates uploaded
    hasPACConfigured(org), // PAC configured
  ];

  const completedChecks = checks.filter(Boolean).length;
  return Math.round((completedChecks / checks.length) * 100);
}

/**
 * Gets missing setup steps for organization
 *
 * @param org - Organization object
 * @returns Array of missing steps
 *
 * @example
 * ```ts
 * const missing = getMissingSetupSteps(org);
 * // → ['Upload CFDI certificates', 'Configure PAC provider']
 * ```
 */
export function getMissingSetupSteps(org: Organization): string[] {
  const steps: string[] = [];

  if (!org.name || !org.rfc || !org.legal_name || !org.tax_regime) {
    steps.push('Complete basic organization information');
  }

  if (!hasCompleteAddress(org)) {
    steps.push('Add complete organization address');
  }

  if (!hasCertificates(org)) {
    steps.push('Upload CFDI certificates');
  }

  if (!hasPACConfigured(org)) {
    steps.push('Configure PAC provider');
  }

  return steps;
}

// ============================================================================
// Subscription & Plan Helpers
// ============================================================================

/**
 * Checks if organization is on paid plan
 *
 * @param org - Organization object
 * @returns True if on paid plan
 */
export function isPaidPlan(org: Organization): boolean {
  return org.plan !== 'free';
}

/**
 * Checks if organization subscription is active
 *
 * @param org - Organization object
 * @returns True if subscription is active
 */
export function hasActiveSubscription(org: Organization): boolean {
  return org.subscription_status === 'active' || org.subscription_status === 'trialing';
}

/**
 * Gets plan display name
 *
 * @param plan - Plan code
 * @returns Display name
 */
export function getPlanDisplayName(
  plan: 'free' | 'basic' | 'professional' | 'enterprise'
): string {
  const names = {
    free: 'Free',
    basic: 'Basic',
    professional: 'Professional',
    enterprise: 'Enterprise',
  };

  return names[plan] || plan;
}

// ============================================================================
// Date & Time Helpers
// ============================================================================

/**
 * Formats a date for display
 *
 * @param date - Date to format
 * @param locale - Locale (default: 'es-MX')
 * @returns Formatted date string
 *
 * @example
 * ```ts
 * formatDate(new Date('2024-01-15'));
 * // → "15/01/2024"
 * ```
 */
export function formatDate(date: Date | string, locale: string = 'es-MX'): string {
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  return dateObj.toLocaleDateString(locale);
}

/**
 * Formats a date and time for display
 *
 * @param date - Date to format
 * @param locale - Locale (default: 'es-MX')
 * @returns Formatted date-time string
 */
export function formatDateTime(
  date: Date | string,
  locale: string = 'es-MX'
): string {
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  return dateObj.toLocaleString(locale);
}

/**
 * Gets relative time string (e.g., "2 days ago")
 *
 * @param date - Date
 * @param locale - Locale (default: 'es-MX')
 * @returns Relative time string
 */
export function getRelativeTime(
  date: Date | string,
  locale: string = 'es-MX'
): string {
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  const now = new Date();
  const diffMs = now.getTime() - dateObj.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
  if (diffDays < 365) return `${Math.floor(diffDays / 30)} months ago`;
  return `${Math.floor(diffDays / 365)} years ago`;
}

// ============================================================================
// Data Sanitization
// ============================================================================

/**
 * Sanitizes organization data for API response
 * Removes sensitive fields like encrypted keys
 *
 * @param org - Organization object
 * @returns Sanitized organization
 */
export function sanitizeOrganization(org: Organization): Omit<
  Organization,
  'cfdi_cert' | 'cfdi_key' | 'cfdi_password_hash' | 'pac_credentials'
> & {
  hasCertificates: boolean;
  hasPACConfig: boolean;
} {
  const { cfdi_cert, cfdi_key, cfdi_password_hash, pac_credentials, ...rest } = org;

  return {
    ...rest,
    hasCertificates: !!(cfdi_cert && cfdi_key),
    hasPACConfig: !!pac_credentials,
  };
}

// ============================================================================
// Search & Filter Helpers
// ============================================================================

/**
 * Searches organizations by query string
 * Searches in name, legal_name, and RFC
 *
 * @param organizations - Array of organizations
 * @param query - Search query
 * @returns Filtered organizations
 */
export function searchOrganizations(
  organizations: Organization[],
  query: string
): Organization[] {
  if (!query || query.trim() === '') {
    return organizations;
  }

  const normalizedQuery = query.toLowerCase().trim();

  return organizations.filter((org) => {
    return (
      org.name?.toLowerCase().includes(normalizedQuery) ||
      org.legal_name?.toLowerCase().includes(normalizedQuery) ||
      org.rfc?.toLowerCase().includes(normalizedQuery)
    );
  });
}

/**
 * Filters organizations by plan
 *
 * @param organizations - Array of organizations
 * @param plan - Plan to filter by
 * @returns Filtered organizations
 */
export function filterByPlan(
  organizations: Organization[],
  plan: string
): Organization[] {
  return organizations.filter((org) => org.plan === plan);
}

/**
 * Filters active organizations only
 *
 * @param organizations - Array of organizations
 * @returns Active organizations
 */
export function filterActive(organizations: Organization[]): Organization[] {
  return organizations.filter((org) => org.deleted_at === null);
}

// ============================================================================
// Sorting Helpers
// ============================================================================

/**
 * Sorts organizations by creation date
 *
 * @param organizations - Array of organizations
 * @param order - Sort order ('asc' or 'desc')
 * @returns Sorted organizations
 */
export function sortByCreatedAt(
  organizations: Organization[],
  order: 'asc' | 'desc' = 'desc'
): Organization[] {
  return [...organizations].sort((a, b) => {
    const dateA = new Date(a.created_at).getTime();
    const dateB = new Date(b.created_at).getTime();
    return order === 'asc' ? dateA - dateB : dateB - dateA;
  });
}

/**
 * Sorts organizations by name
 *
 * @param organizations - Array of organizations
 * @param order - Sort order ('asc' or 'desc')
 * @returns Sorted organizations
 */
export function sortByName(
  organizations: Organization[],
  order: 'asc' | 'desc' = 'asc'
): Organization[] {
  return [...organizations].sort((a, b) => {
    const nameA = (a.name || a.legal_name || a.rfc).toLowerCase();
    const nameB = (b.name || b.legal_name || b.rfc).toLowerCase();
    return order === 'asc'
      ? nameA.localeCompare(nameB)
      : nameB.localeCompare(nameA);
  });
}

// ============================================================================
// Audit Logging (TODO)
// ============================================================================

/**
 * Logs an organization change to audit log
 * TODO: Implement actual audit logging
 *
 * @param organizationId - Organization UUID
 * @param action - Action performed
 * @param changes - Changes made
 */
export async function logOrganizationChange(
  organizationId: string,
  action: string,
  changes: Record<string, any>
): Promise<void> {
  // TODO: Implement audit logging to organization_audit_log table
  console.log('Audit log:', { organizationId, action, changes });
}
