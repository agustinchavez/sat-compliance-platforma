/**
 * Customer Validation Functions
 * Component 6: Customer Management
 *
 * Includes RFC validation, address validation, and data validation
 * with SAT integration stub for Phase 2
 */

import type {
  RFCValidation,
  AddressValidation,
  CustomerValidation,
  CreateCustomerInput,
  UpdateCustomerInput,
  CustomerAddress,
  SATValidation,
  EFirma,
} from './types';
import {
  isValidTaxRegime,
  isValidCFDIUse,
  isValidStateCode,
  RFC_FORBIDDEN_WORDS,
  SPECIAL_RFCS,
} from './sat-catalogs';

// ============================================
// RFC Validation
// ============================================

/**
 * RFC Format Patterns
 * Legal Entity (Persona Moral): 12 characters
 *   Format: 3 letters + 6 digits (YYMMDD) + 3 alphanumeric
 *   Example: ABC120101ABC
 *
 * Individual (Persona Física): 13 characters
 *   Format: 4 letters + 6 digits (YYMMDD) + 3 alphanumeric
 *   Example: ABCD120101ABC
 */
const RFC_LEGAL_ENTITY_REGEX = /^[A-ZÑ&]{3}\d{6}[A-Z0-9]{3}$/;
const RFC_INDIVIDUAL_REGEX = /^[A-ZÑ&]{4}\d{6}[A-Z0-9]{3}$/;

/**
 * Format RFC: uppercase, no spaces, no special characters
 */
export function formatRFC(rfc: string): string {
  return rfc.toUpperCase().replace(/\s/g, '').trim();
}

/**
 * Get RFC type based on length
 */
export function getRFCType(rfc: string): 'legal_entity' | 'individual' | null {
  const formatted = formatRFC(rfc);
  if (formatted.length === 12) return 'legal_entity';
  if (formatted.length === 13) return 'individual';
  return null;
}

/**
 * Check if RFC contains forbidden words
 */
function hasForbiddenWord(rfc: string): boolean {
  const formatted = formatRFC(rfc);
  const prefix = formatted.substring(0, 4);
  return (RFC_FORBIDDEN_WORDS as readonly string[]).includes(prefix);
}

/**
 * Validate RFC date portion (positions 4-9: YYMMDD)
 */
function validateRFCDate(rfc: string): boolean {
  const formatted = formatRFC(rfc);
  const type = getRFCType(rfc);
  if (!type) return false;

  // Extract date part (skip the letter prefix)
  const prefixLength = type === 'legal_entity' ? 3 : 4;
  const datePart = formatted.substring(prefixLength, prefixLength + 6);

  // Parse YY MM DD
  const year = parseInt(datePart.substring(0, 2), 10);
  const month = parseInt(datePart.substring(2, 4), 10);
  const day = parseInt(datePart.substring(4, 6), 10);

  // Validate month (01-12)
  if (month < 1 || month > 12) return false;

  // Validate day (01-31)
  if (day < 1 || day > 31) return false;

  // Additional validation: check if date is reasonable
  // February can't have more than 29 days
  if (month === 2 && day > 29) return false;

  // Months with 30 days
  if ([4, 6, 9, 11].includes(month) && day > 30) return false;

  return true;
}

/**
 * Calculate RFC verification digit (checksum)
 * This is a simplified version - full SAT algorithm is more complex
 */
function calculateRFCChecksum(rfc: string): string {
  // Simplified checksum calculation
  // For production, you may want to implement the full SAT algorithm
  // or use SAT API validation

  const formatted = formatRFC(rfc);
  const mainPart = formatted.substring(0, formatted.length - 1);
  const expectedChecksum = formatted.substring(formatted.length - 1);

  // For now, we'll just return the expected checksum
  // In Phase 2, implement full algorithm or use SAT validation
  return expectedChecksum;
}

/**
 * Validate RFC format with detailed checks
 */
export function validateRFCFormat(rfc: string): RFCValidation {
  if (!rfc || typeof rfc !== 'string') {
    return {
      valid: false,
      error: 'RFC is required',
    };
  }

  const formatted = formatRFC(rfc);
  const warnings: string[] = [];

  // Check if it's a special/generic RFC
  if (formatted === SPECIAL_RFCS.GENERIC_FOREIGN) {
    return {
      valid: true,
      type: 'legal_entity',
      formatted,
      warnings: ['This is a generic RFC for foreign customers'],
    };
  }

  if (formatted === SPECIAL_RFCS.GENERIC_NATIONAL) {
    return {
      valid: true,
      type: 'legal_entity',
      formatted,
      warnings: ['This is a generic RFC for general public'],
    };
  }

  // Check length
  const type = getRFCType(formatted);
  if (!type) {
    return {
      valid: false,
      error: 'RFC must be 12 characters (legal entity) or 13 characters (individual)',
      formatted,
    };
  }

  // Check format with regex
  const regex = type === 'legal_entity' ? RFC_LEGAL_ENTITY_REGEX : RFC_INDIVIDUAL_REGEX;
  if (!regex.test(formatted)) {
    return {
      valid: false,
      error: `Invalid RFC format for ${type === 'legal_entity' ? 'legal entity' : 'individual'}`,
      type,
      formatted,
    };
  }

  // Check for forbidden words
  if (hasForbiddenWord(formatted)) {
    return {
      valid: false,
      error: 'RFC contains a forbidden word',
      type,
      formatted,
    };
  }

  // Validate date portion
  if (!validateRFCDate(formatted)) {
    return {
      valid: false,
      error: 'RFC contains an invalid date',
      type,
      formatted,
    };
  }

  // All validations passed
  return {
    valid: true,
    type,
    formatted,
    warnings: warnings.length > 0 ? warnings : undefined,
  };
}

/**
 * Validate RFC (wrapper function)
 */
export function validateRFC(rfc: string): RFCValidation {
  return validateRFCFormat(rfc);
}

/**
 * Validate RFC with SAT API (Phase 2 - stub for now)
 * This will integrate with SAT SOAP services in Phase 2
 */
export async function validateRFCWithSAT(
  rfc: string,
  efirma?: EFirma
): Promise<SATValidation> {
  // Phase 1: Return local validation result
  const formatValidation = validateRFCFormat(rfc);

  if (!formatValidation.valid) {
    return {
      validated: false,
      source: 'local',
      timestamp: new Date(),
      rfc: formatValidation.formatted || rfc,
      error: formatValidation.error,
    };
  }

  // Phase 2: TODO - Integrate with SAT SOAP service
  // 1. Authenticate with e.firma
  // 2. Query SAT registry for RFC
  // 3. Return SAT validation result with official data

  // For now, return local validation only
  return {
    validated: true,
    source: 'local',
    timestamp: new Date(),
    rfc: formatValidation.formatted!,
    // When SAT integration is ready:
    // legal_name: <from SAT>,
    // tax_regime: <from SAT>,
    // status: 'active' | 'inactive' | 'suspended'
  };
}

// ============================================
// Address Validation
// ============================================

/**
 * Validate postal code format (5 digits)
 */
export function validatePostalCode(postalCode: string): boolean {
  return /^\d{5}$/.test(postalCode);
}

/**
 * Validate state code
 */
export function validateStateCode(state: string): boolean {
  return isValidStateCode(state);
}

/**
 * Validate Mexican address
 */
export function validateAddress(address: CustomerAddress): AddressValidation {
  const errors: AddressValidation['errors'] = {};

  // Required fields
  if (!address.street || address.street.trim().length === 0) {
    errors.street = 'Street is required';
  }

  if (!address.exterior_number || address.exterior_number.trim().length === 0) {
    errors.exterior_number = 'Exterior number is required';
  }

  if (!address.colony || address.colony.trim().length === 0) {
    errors.colony = 'Colony is required';
  }

  if (!address.city || address.city.trim().length === 0) {
    errors.city = 'City is required';
  }

  if (!address.state || address.state.trim().length === 0) {
    errors.state = 'State is required';
  } else if (!validateStateCode(address.state)) {
    errors.state = 'Invalid state code';
  }

  if (!address.postal_code || address.postal_code.trim().length === 0) {
    errors.postal_code = 'Postal code is required';
  } else if (!validatePostalCode(address.postal_code)) {
    errors.postal_code = 'Postal code must be 5 digits';
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
  };
}

// ============================================
// Email and Phone Validation
// ============================================

/**
 * Validate email format
 */
export function validateEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Validate phone format (Mexican phone numbers)
 */
export function validatePhone(phone: string): boolean {
  // Remove spaces, dashes, parentheses
  const cleaned = phone.replace(/[\s\-()]/g, '');

  // Mexican phone: 10 digits
  // With country code: +52 followed by 10 digits
  const mexicanPhone = /^(\+52)?\d{10}$/;

  return mexicanPhone.test(cleaned);
}

// ============================================
// Customer Data Validation
// ============================================

/**
 * Validate customer creation data
 */
export function validateCustomerData(
  data: CreateCustomerInput
): CustomerValidation {
  const errors: CustomerValidation['errors'] = {};

  // RFC validation
  const rfcValidation = validateRFC(data.rfc);
  if (!rfcValidation.valid) {
    errors.rfc = rfcValidation.error;
  }

  // Legal name validation
  if (!data.legal_name || data.legal_name.trim().length === 0) {
    errors.legal_name = 'Legal name is required';
  } else if (data.legal_name.length > 255) {
    errors.legal_name = 'Legal name must be 255 characters or less';
  }

  // Tax regime validation
  if (!data.tax_regime || data.tax_regime.trim().length === 0) {
    errors.tax_regime = 'Tax regime is required';
  } else if (!isValidTaxRegime(data.tax_regime)) {
    errors.tax_regime = 'Invalid tax regime code';
  }

  // CFDI use validation
  if (!data.cfdi_use || data.cfdi_use.trim().length === 0) {
    errors.cfdi_use = 'CFDI use is required';
  } else if (!isValidCFDIUse(data.cfdi_use)) {
    errors.cfdi_use = 'Invalid CFDI use code';
  }

  // Email validation (optional but must be valid if provided)
  if (data.email && !validateEmail(data.email)) {
    errors.email = 'Invalid email format';
  }

  // Phone validation (optional but must be valid if provided)
  if (data.phone && !validatePhone(data.phone)) {
    errors.phone = 'Invalid phone format';
  }

  // Address validation (optional but must be valid if provided)
  if (data.address) {
    const addressValidation = validateAddress(data.address);
    if (!addressValidation.valid) {
      errors.address = addressValidation;
    }
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
  };
}

/**
 * Validate customer update data
 */
export function validateCustomerUpdateData(
  data: UpdateCustomerInput
): CustomerValidation {
  const errors: CustomerValidation['errors'] = {};

  // Legal name validation (if provided)
  if (data.legal_name !== undefined) {
    if (!data.legal_name || data.legal_name.trim().length === 0) {
      errors.legal_name = 'Legal name cannot be empty';
    } else if (data.legal_name.length > 255) {
      errors.legal_name = 'Legal name must be 255 characters or less';
    }
  }

  // Tax regime validation (if provided)
  if (data.tax_regime !== undefined) {
    if (!data.tax_regime || data.tax_regime.trim().length === 0) {
      errors.tax_regime = 'Tax regime cannot be empty';
    } else if (!isValidTaxRegime(data.tax_regime)) {
      errors.tax_regime = 'Invalid tax regime code';
    }
  }

  // CFDI use validation (if provided)
  if (data.cfdi_use !== undefined) {
    if (!data.cfdi_use || data.cfdi_use.trim().length === 0) {
      errors.cfdi_use = 'CFDI use cannot be empty';
    } else if (!isValidCFDIUse(data.cfdi_use)) {
      errors.cfdi_use = 'Invalid CFDI use code';
    }
  }

  // Email validation (if provided)
  if (data.email !== undefined && data.email && !validateEmail(data.email)) {
    errors.email = 'Invalid email format';
  }

  // Phone validation (if provided)
  if (data.phone !== undefined && data.phone && !validatePhone(data.phone)) {
    errors.phone = 'Invalid phone format';
  }

  // Address validation (if provided)
  if (data.address) {
    const addressValidation = validateAddress(data.address);
    if (!addressValidation.valid) {
      errors.address = addressValidation;
    }
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
  };
}

/**
 * Validate RFC compatibility with tax regime
 * Legal entities should use legal entity tax regimes
 * Individuals should use individual tax regimes
 */
export function validateRFCTaxRegimeCompatibility(
  rfc: string,
  taxRegime: string
): { compatible: boolean; warning?: string } {
  const rfcValidation = validateRFC(rfc);
  if (!rfcValidation.valid || !rfcValidation.type) {
    return { compatible: false };
  }

  // For now, return compatible
  // In the future, we can add more sophisticated checks
  // based on SAT catalog compatibility rules

  return { compatible: true };
}
