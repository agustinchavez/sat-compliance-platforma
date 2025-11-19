/**
 * Customer Utility Functions
 * Component 6: Customer Management
 *
 * Helper functions for formatting, display, and data manipulation
 */

import type { Customer, CustomerAddress, CustomerSort } from './types';

// ============================================
// Display Name Functions
// ============================================

/**
 * Get customer display name (prefers business name over legal name)
 */
export function getCustomerDisplayName(customer: Customer): string {
  return customer.business_name || customer.legal_name;
}

/**
 * Format customer name for display (business name + legal name if different)
 */
export function formatCustomerName(customer: Customer): string {
  if (customer.business_name && customer.business_name !== customer.legal_name) {
    return `${customer.business_name} (${customer.legal_name})`;
  }
  return customer.legal_name;
}

/**
 * Get customer short name (for lists and dropdowns)
 */
export function getCustomerShortName(customer: Customer, maxLength: number = 50): string {
  const name = getCustomerDisplayName(customer);
  if (name.length <= maxLength) {
    return name;
  }
  return name.substring(0, maxLength - 3) + '...';
}

// ============================================
// Address Formatting
// ============================================

/**
 * Format address for single-line display
 */
export function formatAddressSingleLine(address: CustomerAddress): string {
  const parts: string[] = [];

  // Street and number
  if (address.street) {
    let streetPart = address.street;
    if (address.exterior_number) {
      streetPart += ` ${address.exterior_number}`;
    }
    if (address.interior_number) {
      streetPart += ` Int. ${address.interior_number}`;
    }
    parts.push(streetPart);
  }

  // Colony
  if (address.colony) {
    parts.push(address.colony);
  }

  // City, State, Postal Code
  const cityStateParts: string[] = [];
  if (address.city) {
    cityStateParts.push(address.city);
  }
  if (address.state) {
    cityStateParts.push(address.state);
  }
  if (address.postal_code) {
    cityStateParts.push(address.postal_code);
  }
  if (cityStateParts.length > 0) {
    parts.push(cityStateParts.join(', '));
  }

  // Country (if not México)
  if (address.country && address.country !== 'México' && address.country !== 'Mexico') {
    parts.push(address.country);
  }

  return parts.join(', ');
}

/**
 * Format address for multi-line display
 */
export function formatAddressMultiLine(address: CustomerAddress): string[] {
  const lines: string[] = [];

  // Line 1: Street and number
  if (address.street) {
    let line1 = address.street;
    if (address.exterior_number) {
      line1 += ` ${address.exterior_number}`;
    }
    if (address.interior_number) {
      line1 += `, Int. ${address.interior_number}`;
    }
    lines.push(line1);
  }

  // Line 2: Colony and locality
  const line2Parts: string[] = [];
  if (address.colony) {
    line2Parts.push(address.colony);
  }
  if (address.locality) {
    line2Parts.push(address.locality);
  }
  if (line2Parts.length > 0) {
    lines.push(line2Parts.join(', '));
  }

  // Line 3: Municipality (if different from city)
  if (address.municipality && address.municipality !== address.city) {
    lines.push(address.municipality);
  }

  // Line 4: City, State, Postal Code
  const line4Parts: string[] = [];
  if (address.city) {
    line4Parts.push(address.city);
  }
  if (address.state) {
    line4Parts.push(address.state);
  }
  if (address.postal_code) {
    line4Parts.push(`C.P. ${address.postal_code}`);
  }
  if (line4Parts.length > 0) {
    lines.push(line4Parts.join(', '));
  }

  // Line 5: Country (if not México)
  if (address.country && address.country !== 'México' && address.country !== 'Mexico') {
    lines.push(address.country);
  }

  return lines;
}

/**
 * Format address for CFDI (official format)
 */
export function formatAddressForCFDI(address: CustomerAddress): string {
  // CFDI format: Street, Exterior, Interior, Colony, City, State, PostalCode
  const parts: string[] = [];

  if (address.street) parts.push(address.street);
  if (address.exterior_number) parts.push(address.exterior_number);
  if (address.interior_number) parts.push(`Int. ${address.interior_number}`);
  if (address.colony) parts.push(address.colony);
  if (address.city) parts.push(address.city);
  if (address.state) parts.push(address.state);
  if (address.postal_code) parts.push(`C.P. ${address.postal_code}`);

  return parts.join(', ');
}

// ============================================
// RFC Formatting
// ============================================

/**
 * Format RFC with hyphen (ABC-120101-ABC)
 */
export function formatRFCWithHyphen(rfc: string): string {
  const cleaned = rfc.replace(/[-\s]/g, '').toUpperCase();

  if (cleaned.length === 12) {
    // Legal entity: ABC-120101-ABC
    return `${cleaned.substring(0, 3)}-${cleaned.substring(3, 9)}-${cleaned.substring(9)}`;
  } else if (cleaned.length === 13) {
    // Individual: ABCD-120101-ABC
    return `${cleaned.substring(0, 4)}-${cleaned.substring(4, 10)}-${cleaned.substring(10)}`;
  }

  return rfc;
}

/**
 * Mask RFC for privacy (ABC-120101-XXX)
 */
export function maskRFC(rfc: string): string {
  const cleaned = rfc.replace(/[-\s]/g, '').toUpperCase();

  if (cleaned.length >= 12) {
    const prefix = cleaned.substring(0, 3);
    const date = cleaned.substring(3, 9);
    return `${prefix}-${date}-XXX`;
  }

  return rfc;
}

// ============================================
// Phone Formatting
// ============================================

/**
 * Format phone number for display
 */
export function formatPhone(phone: string): string {
  // Remove all non-digit characters
  const digits = phone.replace(/\D/g, '');

  // Mexican format: +52 (XXX) XXX-XXXX
  if (digits.length === 10) {
    return `(${digits.substring(0, 3)}) ${digits.substring(3, 6)}-${digits.substring(6)}`;
  } else if (digits.length === 12 && digits.startsWith('52')) {
    // With country code
    return `+52 (${digits.substring(2, 5)}) ${digits.substring(5, 8)}-${digits.substring(8)}`;
  }

  return phone;
}

// ============================================
// Tag Management
// ============================================

/**
 * Merge tags (deduplicate and sort)
 */
export function mergeTags(existingTags: string[], newTags: string[]): string[] {
  const merged = new Set([...existingTags, ...newTags]);
  return Array.from(merged).sort();
}

/**
 * Remove tags from tag list
 */
export function removeTags(existingTags: string[], tagsToRemove: string[]): string[] {
  return existingTags.filter((tag) => !tagsToRemove.includes(tag)).sort();
}

/**
 * Format tags for display (comma-separated)
 */
export function formatTags(tags: string[]): string {
  if (!tags || tags.length === 0) {
    return '';
  }
  return tags.join(', ');
}

/**
 * Parse tags from string (comma or space separated)
 */
export function parseTags(tagsString: string): string[] {
  if (!tagsString || tagsString.trim().length === 0) {
    return [];
  }

  // Split by comma or space, trim, filter empty, deduplicate
  const tags = tagsString
    .split(/[,\s]+/)
    .map((tag) => tag.trim())
    .filter((tag) => tag.length > 0);

  return Array.from(new Set(tags)).sort();
}

// ============================================
// Sorting
// ============================================

/**
 * Sort customers by field
 */
export function sortCustomers(
  customers: Customer[],
  sort: CustomerSort
): Customer[] {
  const sorted = [...customers];

  sorted.sort((a, b) => {
    let aValue: any;
    let bValue: any;

    switch (sort.field) {
      case 'legal_name':
        aValue = a.legal_name.toLowerCase();
        bValue = b.legal_name.toLowerCase();
        break;
      case 'rfc':
        aValue = a.rfc;
        bValue = b.rfc;
        break;
      case 'created_at':
        aValue = a.created_at.getTime();
        bValue = b.created_at.getTime();
        break;
      case 'updated_at':
        aValue = a.updated_at.getTime();
        bValue = b.updated_at.getTime();
        break;
      default:
        return 0;
    }

    if (aValue < bValue) {
      return sort.order === 'asc' ? -1 : 1;
    }
    if (aValue > bValue) {
      return sort.order === 'asc' ? 1 : -1;
    }
    return 0;
  });

  return sorted;
}

// ============================================
// Filtering
// ============================================

/**
 * Filter customers client-side (for already-loaded data)
 */
export function filterCustomers(
  customers: Customer[],
  searchQuery?: string
): Customer[] {
  if (!searchQuery || searchQuery.trim().length === 0) {
    return customers;
  }

  const query = searchQuery.toLowerCase();

  return customers.filter((customer) => {
    const legalName = customer.legal_name.toLowerCase();
    const businessName = customer.business_name?.toLowerCase() || '';
    const rfc = customer.rfc.toLowerCase();
    const email = customer.email?.toLowerCase() || '';

    return (
      legalName.includes(query) ||
      businessName.includes(query) ||
      rfc.includes(query) ||
      email.includes(query)
    );
  });
}

// ============================================
// Export Filename Generation
// ============================================

/**
 * Generate filename for customer export
 */
export function generateCustomerExportFilename(
  organizationName: string,
  format: 'csv' | 'json' = 'csv'
): string {
  const date = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  const sanitizedOrgName = organizationName
    .replace(/[^a-z0-9]/gi, '_')
    .toLowerCase();
  return `customers_${sanitizedOrgName}_${date}.${format}`;
}

// ============================================
// Status Helpers
// ============================================

/**
 * Get customer status display
 */
export function getCustomerStatusDisplay(customer: Customer): {
  label: string;
  color: 'green' | 'red' | 'gray' | 'yellow';
} {
  if (customer.deleted_at) {
    return { label: 'Deleted', color: 'gray' };
  }

  if (!customer.is_active) {
    return { label: 'Inactive', color: 'red' };
  }

  if (!customer.sat_validated) {
    return { label: 'Active (Not Validated)', color: 'yellow' };
  }

  return { label: 'Active', color: 'green' };
}

/**
 * Check if customer can be used for new invoices
 */
export function canIssueInvoice(customer: Customer): boolean {
  return customer.is_active && !customer.deleted_at;
}

// ============================================
// Search Highlighting
// ============================================

/**
 * Highlight search terms in text
 */
export function highlightSearchTerm(
  text: string,
  searchTerm: string
): { text: string; isHighlight: boolean }[] {
  if (!searchTerm || searchTerm.trim().length === 0) {
    return [{ text, isHighlight: false }];
  }

  const regex = new RegExp(`(${searchTerm})`, 'gi');
  const parts = text.split(regex);

  return parts.map((part) => {
    // Create a new regex instance for each test to avoid state issues
    const testRegex = new RegExp(`^${searchTerm}$`, 'i');
    return {
      text: part,
      isHighlight: testRegex.test(part),
    };
  });
}

// ============================================
// Validation Helpers
// ============================================

/**
 * Check if customer data is complete
 */
export function isCustomerDataComplete(customer: Customer): boolean {
  return !!(
    customer.rfc &&
    customer.legal_name &&
    customer.tax_regime &&
    customer.cfdi_use &&
    customer.email &&
    customer.phone &&
    customer.address
  );
}

/**
 * Get missing fields for customer
 */
export function getMissingFields(customer: Customer): string[] {
  const missing: string[] = [];

  if (!customer.email) missing.push('Email');
  if (!customer.phone) missing.push('Phone');
  if (!customer.address) missing.push('Address');
  if (!customer.business_name) missing.push('Business Name');

  return missing;
}
