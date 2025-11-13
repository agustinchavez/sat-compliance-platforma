/**
 * Organization Validation Utilities
 *
 * This file contains all validation functions for organization data,
 * including RFC, address, tax regime, and certificate validation.
 */

import type {
  OrganizationAddress,
  RFCValidationResult,
  AddressValidationResult,
  ValidationResult,
  PACConfig,
  PACProvider,
  CertificateFiles,
} from './types';

// ============================================================================
// RFC Validation
// ============================================================================

/**
 * RFC patterns for validation
 * - Legal Entity: 3 letters + 6 digits (YYMMDD) + 3 alphanumeric = 12 chars
 * - Individual: 4 letters + 6 digits (YYMMDD) + 3 alphanumeric = 13 chars
 */
const RFC_PATTERN_LEGAL = /^[A-ZÑ&]{3}\d{6}[A-Z0-9]{3}$/;
const RFC_PATTERN_PERSON = /^[A-ZÑ&]{4}\d{6}[A-Z0-9]{3}$/;

/**
 * Generic RFC pattern (12 or 13 characters)
 */
const RFC_PATTERN_GENERIC = /^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/;

/**
 * Validates a Mexican RFC (Registro Federal de Contribuyentes)
 *
 * @param rfc - RFC to validate
 * @param options - Validation options
 * @returns Validation result with RFC type
 *
 * @example
 * ```ts
 * const result = validateRFC('ABC123456XYZ');
 * // → { valid: true, type: 'legal_entity', errors: [] }
 *
 * const result = validateRFC('ABCD123456XYZ');
 * // → { valid: true, type: 'individual', errors: [] }
 * ```
 */
export function validateRFC(
  rfc: string | null | undefined,
  options: { required?: boolean } = { required: true }
): RFCValidationResult {
  const errors: string[] = [];

  // Check if RFC is provided
  if (!rfc || rfc.trim() === '') {
    if (options.required) {
      errors.push('RFC is required');
    }
    return { valid: !options.required, type: 'invalid', errors };
  }

  // Normalize RFC (uppercase, trim)
  const normalizedRFC = rfc.trim().toUpperCase();

  // Check length
  if (normalizedRFC.length < 12 || normalizedRFC.length > 13) {
    errors.push('RFC must be 12 or 13 characters long');
    return { valid: false, type: 'invalid', errors };
  }

  // Validate format
  const isLegalEntity = RFC_PATTERN_LEGAL.test(normalizedRFC);
  const isIndividual = RFC_PATTERN_PERSON.test(normalizedRFC);

  if (!isLegalEntity && !isIndividual) {
    errors.push('RFC format is invalid');
    return { valid: false, type: 'invalid', errors };
  }

  // Validate date portion (positions 3-8 or 4-9)
  const dateStart = isLegalEntity ? 3 : 4;
  const datePortion = normalizedRFC.substring(dateStart, dateStart + 6);

  if (!isValidRFCDate(datePortion)) {
    errors.push('RFC contains invalid date');
  }

  // Check for generic/test RFCs
  if (isGenericRFC(normalizedRFC)) {
    errors.push('Generic or test RFCs are not allowed');
  }

  return {
    valid: errors.length === 0,
    type: isLegalEntity ? 'legal_entity' : 'individual',
    errors,
  };
}

/**
 * Validates the date portion of an RFC
 *
 * @param datePortion - 6-digit date string (YYMMDD)
 * @returns true if valid date
 */
function isValidRFCDate(datePortion: string): boolean {
  const year = parseInt(datePortion.substring(0, 2), 10);
  const month = parseInt(datePortion.substring(2, 4), 10);
  const day = parseInt(datePortion.substring(4, 6), 10);

  // Validate month
  if (month < 1 || month > 12) {
    return false;
  }

  // Validate day
  if (day < 1 || day > 31) {
    return false;
  }

  // More detailed validation could check days per month
  // but SAT's validation is lenient
  return true;
}

/**
 * Checks if RFC is a generic/test RFC
 *
 * @param rfc - Normalized RFC
 * @returns true if generic RFC
 */
function isGenericRFC(rfc: string): boolean {
  const genericRFCs = [
    'XAXX010101000',
    'XEXX010101000',
  ];
  return genericRFCs.includes(rfc);
}

/**
 * Formats an RFC (uppercase, trim)
 *
 * @param rfc - RFC to format
 * @returns Formatted RFC
 */
export function formatRFC(rfc: string | null | undefined): string {
  if (!rfc) return '';
  return rfc.trim().toUpperCase();
}

// ============================================================================
// Address Validation
// ============================================================================

/**
 * Postal code pattern (5 digits)
 */
const POSTAL_CODE_PATTERN = /^\d{5}$/;

/**
 * Mexican state codes (2 letters)
 */
const MEXICAN_STATE_CODES = [
  'AG', 'BC', 'BS', 'CM', 'CS', 'CH', 'CO', 'CL', 'DF', 'DG',
  'GT', 'GR', 'HG', 'JA', 'EM', 'MI', 'MO', 'NA', 'NL', 'OA',
  'PU', 'QT', 'QR', 'SL', 'SI', 'SO', 'TB', 'TM', 'TL', 'VE',
  'YU', 'ZA', 'CDMX', 'MX',
];

/**
 * Validates a Mexican address according to SAT requirements
 *
 * @param address - Address to validate
 * @param options - Validation options
 * @returns Validation result
 *
 * @example
 * ```ts
 * const result = validateAddress({
 *   street: 'Av. Insurgentes Sur',
 *   exterior_number: '1602',
 *   colony: 'Crédito Constructor',
 *   city: 'Ciudad de México',
 *   state: 'CDMX',
 *   postal_code: '03940',
 *   country: 'México'
 * });
 * // → { valid: true, errors: [] }
 * ```
 */
export function validateAddress(
  address: OrganizationAddress | null | undefined,
  options: { required?: boolean } = { required: true }
): AddressValidationResult {
  const errors: string[] = [];

  if (!address) {
    if (options.required) {
      errors.push('Address is required');
    }
    return { valid: !options.required, errors };
  }

  // Required fields
  if (!address.street || address.street.trim() === '') {
    errors.push('Street is required');
  }

  if (!address.exterior_number || address.exterior_number.trim() === '') {
    errors.push('Exterior number is required');
  }

  if (!address.colony || address.colony.trim() === '') {
    errors.push('Colony is required');
  }

  if (!address.city || address.city.trim() === '') {
    errors.push('City is required');
  }

  if (!address.state || address.state.trim() === '') {
    errors.push('State is required');
  } else if (!MEXICAN_STATE_CODES.includes(address.state.toUpperCase())) {
    errors.push('Invalid state code');
  }

  if (!address.postal_code || address.postal_code.trim() === '') {
    errors.push('Postal code is required');
  } else if (!POSTAL_CODE_PATTERN.test(address.postal_code)) {
    errors.push('Postal code must be 5 digits');
  }

  if (!address.country || address.country.trim() === '') {
    errors.push('Country is required');
  }

  // Length validations
  if (address.street && address.street.length > 100) {
    errors.push('Street must be less than 100 characters');
  }

  if (address.exterior_number && address.exterior_number.length > 20) {
    errors.push('Exterior number must be less than 20 characters');
  }

  if (address.interior_number && address.interior_number.length > 20) {
    errors.push('Interior number must be less than 20 characters');
  }

  if (address.colony && address.colony.length > 100) {
    errors.push('Colony must be less than 100 characters');
  }

  if (address.city && address.city.length > 100) {
    errors.push('City must be less than 100 characters');
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Formats an address for display
 *
 * @param address - Address to format
 * @returns Formatted address string
 */
export function formatAddress(address: OrganizationAddress | null): string {
  if (!address) return '';

  const parts = [
    address.street,
    address.exterior_number,
    address.interior_number,
    address.colony,
    address.city,
    address.state,
    address.postal_code,
    address.country,
  ].filter(Boolean);

  return parts.join(', ');
}

// ============================================================================
// Tax Regime Validation
// ============================================================================

/**
 * Tax regime pattern (3 digits)
 */
const TAX_REGIME_PATTERN = /^\d{3}$/;

/**
 * Valid SAT tax regime codes
 * Source: SAT Catálogo de Régimen Fiscal
 */
const VALID_TAX_REGIMES = [
  '601', // General de Ley Personas Morales
  '603', // Personas Morales con Fines no Lucrativos
  '605', // Sueldos y Salarios e Ingresos Asimilados a Salarios
  '606', // Arrendamiento
  '607', // Régimen de Enajenación o Adquisición de Bienes
  '608', // Demás ingresos
  '610', // Residentes en el Extranjero sin Establecimiento Permanente en México
  '611', // Ingresos por Dividendos (socios y accionistas)
  '612', // Personas Físicas con Actividades Empresariales y Profesionales
  '614', // Ingresos por intereses
  '615', // Régimen de los ingresos por obtención de premios
  '616', // Sin obligaciones fiscales
  '620', // Sociedades Cooperativas de Producción que optan por diferir sus ingresos
  '621', // Incorporación Fiscal
  '622', // Actividades Agrícolas, Ganaderas, Silvícolas y Pesqueras
  '623', // Opcional para Grupos de Sociedades
  '624', // Coordinados
  '625', // Régimen de las Actividades Empresariales con ingresos a través de Plataformas Tecnológicas
  '626', // Régimen Simplificado de Confianza
];

/**
 * Validates a SAT tax regime code
 *
 * @param taxRegime - Tax regime code to validate
 * @param options - Validation options
 * @returns Validation result
 *
 * @example
 * ```ts
 * const result = validateTaxRegime('601');
 * // → { valid: true, errors: [] }
 * ```
 */
export function validateTaxRegime(
  taxRegime: string | null | undefined,
  options: { required?: boolean } = { required: true }
): ValidationResult {
  const errors: string[] = [];

  if (!taxRegime || taxRegime.trim() === '') {
    if (options.required) {
      errors.push('Tax regime is required');
    }
    return { valid: !options.required, errors };
  }

  const normalized = taxRegime.trim();

  if (!TAX_REGIME_PATTERN.test(normalized)) {
    errors.push('Tax regime must be 3 digits');
    return { valid: false, errors };
  }

  if (!VALID_TAX_REGIMES.includes(normalized)) {
    errors.push('Invalid tax regime code');
  }

  return { valid: errors.length === 0, errors };
}

// ============================================================================
// Email & Phone Validation
// ============================================================================

/**
 * Email pattern (basic validation)
 */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Validates an email address
 *
 * @param email - Email to validate
 * @param options - Validation options
 * @returns Validation result
 */
export function validateEmail(
  email: string | null | undefined,
  options: { required?: boolean } = { required: false }
): ValidationResult {
  const errors: string[] = [];

  if (!email || email.trim() === '') {
    if (options.required) {
      errors.push('Email is required');
    }
    return { valid: !options.required, errors };
  }

  if (!EMAIL_PATTERN.test(email.trim())) {
    errors.push('Invalid email format');
  }

  if (email.length > 255) {
    errors.push('Email must be less than 255 characters');
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Phone pattern (Mexican phone numbers)
 * Supports: +52 55 1234 5678, 5512345678, (55) 1234-5678
 */
const PHONE_PATTERN = /^(\+52\s?)?(\d{2,3}\s?)?\d{4}\s?\d{4}$/;

/**
 * Validates a phone number
 *
 * @param phone - Phone number to validate
 * @param options - Validation options
 * @returns Validation result
 */
export function validatePhone(
  phone: string | null | undefined,
  options: { required?: boolean } = { required: false }
): ValidationResult {
  const errors: string[] = [];

  if (!phone || phone.trim() === '') {
    if (options.required) {
      errors.push('Phone is required');
    }
    return { valid: !options.required, errors };
  }

  // Remove common separators for validation
  const normalized = phone.replace(/[\s\-\(\)]/g, '');

  if (normalized.length < 10 || normalized.length > 15) {
    errors.push('Phone number must be between 10 and 15 digits');
  }

  return { valid: errors.length === 0, errors };
}

// ============================================================================
// Certificate Validation
// ============================================================================

/**
 * Certificate serial number pattern (20 hex characters)
 */
const CERT_SERIAL_PATTERN = /^[0-9A-F]{20}$/i;

/**
 * Validates certificate files
 *
 * @param files - Certificate files to validate
 * @returns Validation result
 */
export function validateCertificateFiles(
  files: Partial<CertificateFiles> | null
): ValidationResult {
  const errors: string[] = [];

  if (!files) {
    errors.push('Certificate files are required');
    return { valid: false, errors };
  }

  if (!files.cerFile || files.cerFile.length === 0) {
    errors.push('Certificate file (.cer) is required');
  } else if (files.cerFile.length > 10 * 1024) {
    // Max 10KB
    errors.push('Certificate file (.cer) is too large (max 10KB)');
  }

  if (!files.keyFile || files.keyFile.length === 0) {
    errors.push('Private key file (.key) is required');
  } else if (files.keyFile.length > 10 * 1024) {
    // Max 10KB
    errors.push('Private key file (.key) is too large (max 10KB)');
  }

  if (!files.password || files.password.trim() === '') {
    errors.push('Certificate password is required');
  } else if (files.password.length < 8) {
    errors.push('Certificate password must be at least 8 characters');
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validates a certificate serial number
 *
 * @param serialNumber - Serial number to validate
 * @returns Validation result
 */
export function validateCertificateSerialNumber(
  serialNumber: string | null | undefined
): ValidationResult {
  const errors: string[] = [];

  if (!serialNumber || serialNumber.trim() === '') {
    errors.push('Certificate serial number is required');
    return { valid: false, errors };
  }

  const normalized = serialNumber.trim().toUpperCase();

  if (!CERT_SERIAL_PATTERN.test(normalized)) {
    errors.push('Certificate serial number must be 20 hexadecimal characters');
  }

  return { valid: errors.length === 0, errors };
}

// ============================================================================
// PAC Configuration Validation
// ============================================================================

/**
 * Validates PAC configuration
 *
 * @param config - PAC configuration to validate
 * @returns Validation result
 */
export function validatePACConfig(
  config: Partial<PACConfig> | null
): ValidationResult {
  const errors: string[] = [];

  if (!config) {
    errors.push('PAC configuration is required');
    return { valid: false, errors };
  }

  if (!config.provider) {
    errors.push('PAC provider is required');
  }

  if (!config.environment) {
    errors.push('PAC environment is required');
  }

  if (!config.credentials) {
    errors.push('PAC credentials are required');
  } else {
    if (!config.credentials.username || config.credentials.username.trim() === '') {
      errors.push('PAC username is required');
    }

    if (!config.credentials.password || config.credentials.password.trim() === '') {
      errors.push('PAC password is required');
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validates PAC provider
 *
 * @param provider - PAC provider to validate
 * @returns Validation result
 */
export function validatePACProvider(
  provider: string | null | undefined
): ValidationResult {
  const errors: string[] = [];
  const validProviders: PACProvider[] = ['finkok', 'sw', 'diverza', 'facturaxion'];

  if (!provider) {
    errors.push('PAC provider is required');
    return { valid: false, errors };
  }

  if (!validProviders.includes(provider as PACProvider)) {
    errors.push(`Invalid PAC provider. Must be one of: ${validProviders.join(', ')}`);
  }

  return { valid: errors.length === 0, errors };
}

// ============================================================================
// Combined Organization Validation
// ============================================================================

/**
 * Validates complete organization data
 *
 * @param data - Organization data to validate
 * @returns Validation result
 */
export function validateOrganizationData(data: {
  name?: string;
  rfc?: string;
  legal_name?: string;
  tax_regime?: string;
  email?: string;
  phone?: string;
  address?: OrganizationAddress;
}): ValidationResult {
  const errors: string[] = [];

  // Name validation
  if (!data.name || data.name.trim() === '') {
    errors.push('Organization name is required');
  } else if (data.name.length > 255) {
    errors.push('Organization name must be less than 255 characters');
  }

  // RFC validation
  const rfcResult = validateRFC(data.rfc, { required: true });
  errors.push(...rfcResult.errors);

  // Legal name validation
  if (!data.legal_name || data.legal_name.trim() === '') {
    errors.push('Legal name is required');
  } else if (data.legal_name.length > 255) {
    errors.push('Legal name must be less than 255 characters');
  }

  // Tax regime validation
  const taxRegimeResult = validateTaxRegime(data.tax_regime, { required: true });
  errors.push(...taxRegimeResult.errors);

  // Email validation (optional)
  if (data.email) {
    const emailResult = validateEmail(data.email, { required: false });
    errors.push(...emailResult.errors);
  }

  // Phone validation (optional)
  if (data.phone) {
    const phoneResult = validatePhone(data.phone, { required: false });
    errors.push(...phoneResult.errors);
  }

  // Address validation (optional)
  if (data.address) {
    const addressResult = validateAddress(data.address, { required: false });
    errors.push(...addressResult.errors);
  }

  return { valid: errors.length === 0, errors };
}
