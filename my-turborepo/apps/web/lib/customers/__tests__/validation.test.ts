/**
 * Unit Tests for Customer Validation
 * Component 6: Customer Service
 */

import {
  formatRFC,
  getRFCType,
  validateRFC,
  validateRFCFormat,
  validateAddress,
  validatePostalCode,
  validateStateCode,
  validateEmail,
  validatePhone,
  validateCustomerData,
  validateCustomerUpdateData,
  validateRFCTaxRegimeCompatibility,
} from '../validation';
import type { CustomerAddress, CreateCustomerInput, UpdateCustomerInput } from '../types';

describe('Customer Validation', () => {
  describe('formatRFC', () => {
    it('should convert to uppercase', () => {
      expect(formatRFC('abc120101abc')).toBe('ABC120101ABC');
    });

    it('should remove spaces', () => {
      expect(formatRFC('ABC 120101 ABC')).toBe('ABC120101ABC');
      expect(formatRFC(' ABC120101ABC ')).toBe('ABC120101ABC');
    });

    it('should trim whitespace', () => {
      expect(formatRFC('  ABC120101ABC  ')).toBe('ABC120101ABC');
    });
  });

  describe('getRFCType', () => {
    it('should identify legal entity (12 chars)', () => {
      expect(getRFCType('ABC120101ABC')).toBe('legal_entity');
    });

    it('should identify individual (13 chars)', () => {
      expect(getRFCType('ABCD120101ABC')).toBe('individual');
    });

    it('should return null for invalid length', () => {
      expect(getRFCType('ABC')).toBeNull();
      expect(getRFCType('ABCDEFGHIJKLMNOP')).toBeNull();
    });

    it('should work case-insensitively', () => {
      expect(getRFCType('abc120101abc')).toBe('legal_entity');
      expect(getRFCType('abcd120101abc')).toBe('individual');
    });
  });

  describe('validateRFC', () => {
    describe('Valid RFCs', () => {
      it('should validate legal entity RFC', () => {
        const result = validateRFC('ABC120101ABC');
        expect(result.valid).toBe(true);
        expect(result.type).toBe('legal_entity');
        expect(result.formatted).toBe('ABC120101ABC');
      });

      it('should validate individual RFC', () => {
        const result = validateRFC('ABCD120101ABC');
        expect(result.valid).toBe(true);
        expect(result.type).toBe('individual');
        expect(result.formatted).toBe('ABCD120101ABC');
      });

      it('should validate generic foreign RFC', () => {
        const result = validateRFC('XAXX010101000');
        expect(result.valid).toBe(true);
        expect(result.warnings).toContain('This is a generic RFC for foreign customers');
      });

      it('should validate generic national RFC', () => {
        const result = validateRFC('XEXX010101000');
        expect(result.valid).toBe(true);
        expect(result.warnings).toContain('This is a generic RFC for general public');
      });

      it('should format RFC during validation', () => {
        const result = validateRFC('abc120101abc');
        expect(result.valid).toBe(true);
        expect(result.formatted).toBe('ABC120101ABC');
      });
    });

    describe('Invalid RFCs', () => {
      it('should reject empty RFC', () => {
        const result = validateRFC('');
        expect(result.valid).toBe(false);
        expect(result.error).toBe('RFC is required');
      });

      it('should reject null RFC', () => {
        const result = validateRFC(null as any);
        expect(result.valid).toBe(false);
        expect(result.error).toBe('RFC is required');
      });

      it('should reject RFC with invalid length', () => {
        const result = validateRFC('ABC12');
        expect(result.valid).toBe(false);
        expect(result.error).toContain('12 characters (legal entity) or 13 characters (individual)');
      });

      it('should reject RFC with invalid format', () => {
        const result = validateRFC('ABC1201OLABC'); // 'O' instead of '0'
        expect(result.valid).toBe(false);
        expect(result.error).toContain('Invalid RFC format');
      });

      it('should reject RFC with forbidden word', () => {
        const result = validateRFC('BUEY120101ABC');
        expect(result.valid).toBe(false);
        expect(result.error).toBe('RFC contains a forbidden word');
      });

      it('should reject RFC with invalid month', () => {
        const result = validateRFC('ABC121301ABC'); // Month 13
        expect(result.valid).toBe(false);
        expect(result.error).toBe('RFC contains an invalid date');
      });

      it('should reject RFC with invalid day', () => {
        const result = validateRFC('ABC120132ABC'); // Day 32
        expect(result.valid).toBe(false);
        expect(result.error).toBe('RFC contains an invalid date');
      });

      it('should reject February with invalid day', () => {
        const result = validateRFC('ABC120230ABC'); // Feb 30
        expect(result.valid).toBe(false);
        expect(result.error).toBe('RFC contains an invalid date');
      });

      it('should reject 30-day month with day 31', () => {
        const result = validateRFC('ABC120431ABC'); // April 31
        expect(result.valid).toBe(false);
        expect(result.error).toBe('RFC contains an invalid date');
      });
    });
  });

  describe('validateAddress', () => {
    const validAddress: CustomerAddress = {
      street: 'Avenida Reforma',
      exterior_number: '123',
      colony: 'Juárez',
      city: 'Ciudad de México',
      state: 'CDMX',
      postal_code: '06600',
      country: 'México',
    };

    it('should validate complete address', () => {
      const result = validateAddress(validAddress);
      expect(result.valid).toBe(true);
      expect(Object.keys(result.errors)).toHaveLength(0);
    });

    it('should reject address without street', () => {
      const result = validateAddress({ ...validAddress, street: '' });
      expect(result.valid).toBe(false);
      expect(result.errors.street).toBe('Street is required');
    });

    it('should reject address without exterior number', () => {
      const result = validateAddress({ ...validAddress, exterior_number: '' });
      expect(result.valid).toBe(false);
      expect(result.errors.exterior_number).toBe('Exterior number is required');
    });

    it('should reject address without colony', () => {
      const result = validateAddress({ ...validAddress, colony: '' });
      expect(result.valid).toBe(false);
      expect(result.errors.colony).toBe('Colony is required');
    });

    it('should reject address without city', () => {
      const result = validateAddress({ ...validAddress, city: '' });
      expect(result.valid).toBe(false);
      expect(result.errors.city).toBe('City is required');
    });

    it('should reject address without state', () => {
      const result = validateAddress({ ...validAddress, state: '' });
      expect(result.valid).toBe(false);
      expect(result.errors.state).toBe('State is required');
    });

    it('should reject address with invalid state', () => {
      const result = validateAddress({ ...validAddress, state: 'INVALID' });
      expect(result.valid).toBe(false);
      expect(result.errors.state).toBe('Invalid state code');
    });

    it('should reject address without postal code', () => {
      const result = validateAddress({ ...validAddress, postal_code: '' });
      expect(result.valid).toBe(false);
      expect(result.errors.postal_code).toBe('Postal code is required');
    });

    it('should reject address with invalid postal code format', () => {
      const result = validateAddress({ ...validAddress, postal_code: '1234' });
      expect(result.valid).toBe(false);
      expect(result.errors.postal_code).toBe('Postal code must be 5 digits');
    });

    it('should allow optional interior number', () => {
      const addressWithoutInterior = { ...validAddress };
      delete (addressWithoutInterior as any).interior_number;
      const result = validateAddress(addressWithoutInterior);
      expect(result.valid).toBe(true);
    });
  });

  describe('validatePostalCode', () => {
    it('should validate 5-digit postal code', () => {
      expect(validatePostalCode('06600')).toBe(true);
      expect(validatePostalCode('12345')).toBe(true);
      expect(validatePostalCode('00000')).toBe(true);
    });

    it('should reject non-5-digit postal codes', () => {
      expect(validatePostalCode('1234')).toBe(false);
      expect(validatePostalCode('123456')).toBe(false);
      expect(validatePostalCode('ABCDE')).toBe(false);
      expect(validatePostalCode('')).toBe(false);
    });
  });

  describe('validateStateCode', () => {
    it('should validate valid state codes', () => {
      expect(validateStateCode('CDMX')).toBe(true);
      expect(validateStateCode('JAL')).toBe(true);
      expect(validateStateCode('NL')).toBe(true);
    });

    it('should reject invalid state codes', () => {
      expect(validateStateCode('INVALID')).toBe(false);
      expect(validateStateCode('XX')).toBe(false);
      expect(validateStateCode('')).toBe(false);
    });
  });

  describe('validateEmail', () => {
    it('should validate correct email formats', () => {
      expect(validateEmail('user@example.com')).toBe(true);
      expect(validateEmail('test.user@example.co.mx')).toBe(true);
      expect(validateEmail('user+tag@example.com')).toBe(true);
    });

    it('should reject invalid email formats', () => {
      expect(validateEmail('notanemail')).toBe(false);
      expect(validateEmail('@example.com')).toBe(false);
      expect(validateEmail('user@')).toBe(false);
      expect(validateEmail('user @example.com')).toBe(false);
      expect(validateEmail('')).toBe(false);
    });
  });

  describe('validatePhone', () => {
    it('should validate 10-digit Mexican phone', () => {
      expect(validatePhone('5512345678')).toBe(true);
    });

    it('should validate phone with country code', () => {
      expect(validatePhone('+525512345678')).toBe(true);
    });

    it('should validate phone with formatting', () => {
      expect(validatePhone('(55) 1234-5678')).toBe(true);
      expect(validatePhone('55-1234-5678')).toBe(true);
      expect(validatePhone('55 1234 5678')).toBe(true);
    });

    it('should reject invalid phone numbers', () => {
      expect(validatePhone('123')).toBe(false);
      expect(validatePhone('abcdefghij')).toBe(false);
      expect(validatePhone('')).toBe(false);
    });
  });

  describe('validateCustomerData', () => {
    const validCustomer: CreateCustomerInput = {
      rfc: 'ABC120101ABC',
      legal_name: 'ACME Corporation',
      tax_regime: '601',
      cfdi_use: 'G03',
    };

    it('should validate complete customer data', () => {
      const result = validateCustomerData(validCustomer);
      expect(result.valid).toBe(true);
      expect(Object.keys(result.errors)).toHaveLength(0);
    });

    it('should reject customer without RFC', () => {
      const result = validateCustomerData({ ...validCustomer, rfc: '' });
      expect(result.valid).toBe(false);
      expect(result.errors.rfc).toBeTruthy();
    });

    it('should reject customer with invalid RFC', () => {
      const result = validateCustomerData({ ...validCustomer, rfc: 'INVALID' });
      expect(result.valid).toBe(false);
      expect(result.errors.rfc).toBeTruthy();
    });

    it('should reject customer without legal name', () => {
      const result = validateCustomerData({ ...validCustomer, legal_name: '' });
      expect(result.valid).toBe(false);
      expect(result.errors.legal_name).toBe('Legal name is required');
    });

    it('should reject customer with too long legal name', () => {
      const result = validateCustomerData({
        ...validCustomer,
        legal_name: 'A'.repeat(256),
      });
      expect(result.valid).toBe(false);
      expect(result.errors.legal_name).toBe('Legal name must be 255 characters or less');
    });

    it('should reject customer without tax regime', () => {
      const result = validateCustomerData({ ...validCustomer, tax_regime: '' });
      expect(result.valid).toBe(false);
      expect(result.errors.tax_regime).toBe('Tax regime is required');
    });

    it('should reject customer with invalid tax regime', () => {
      const result = validateCustomerData({ ...validCustomer, tax_regime: '999' });
      expect(result.valid).toBe(false);
      expect(result.errors.tax_regime).toBe('Invalid tax regime code');
    });

    it('should reject customer without CFDI use', () => {
      const result = validateCustomerData({ ...validCustomer, cfdi_use: '' });
      expect(result.valid).toBe(false);
      expect(result.errors.cfdi_use).toBe('CFDI use is required');
    });

    it('should reject customer with invalid CFDI use', () => {
      const result = validateCustomerData({ ...validCustomer, cfdi_use: 'X99' });
      expect(result.valid).toBe(false);
      expect(result.errors.cfdi_use).toBe('Invalid CFDI use code');
    });

    it('should reject customer with invalid email', () => {
      const result = validateCustomerData({
        ...validCustomer,
        email: 'notanemail',
      });
      expect(result.valid).toBe(false);
      expect(result.errors.email).toBe('Invalid email format');
    });

    it('should reject customer with invalid phone', () => {
      const result = validateCustomerData({
        ...validCustomer,
        phone: '123',
      });
      expect(result.valid).toBe(false);
      expect(result.errors.phone).toBe('Invalid phone format');
    });

    it('should validate customer with valid optional fields', () => {
      const result = validateCustomerData({
        ...validCustomer,
        email: 'test@example.com',
        phone: '+525512345678',
        business_name: 'ACME',
      });
      expect(result.valid).toBe(true);
    });

    it('should validate customer with address', () => {
      const result = validateCustomerData({
        ...validCustomer,
        address: {
          street: 'Reforma',
          exterior_number: '123',
          colony: 'Centro',
          city: 'CDMX',
          state: 'CDMX',
          postal_code: '06600',
          country: 'México',
        },
      });
      expect(result.valid).toBe(true);
    });

    it('should reject customer with invalid address', () => {
      const result = validateCustomerData({
        ...validCustomer,
        address: {
          street: '',
          exterior_number: '123',
          colony: 'Centro',
          city: 'CDMX',
          state: 'CDMX',
          postal_code: '06600',
          country: 'México',
        },
      });
      expect(result.valid).toBe(false);
      expect(result.errors.address).toBeDefined();
    });
  });

  describe('validateCustomerUpdateData', () => {
    it('should validate empty update (all optional)', () => {
      const result = validateCustomerUpdateData({});
      expect(result.valid).toBe(true);
    });

    it('should validate partial update', () => {
      const result = validateCustomerUpdateData({
        email: 'new@example.com',
        phone: '+525512345678',
      });
      expect(result.valid).toBe(true);
    });

    it('should reject empty legal name if provided', () => {
      const result = validateCustomerUpdateData({ legal_name: '' });
      expect(result.valid).toBe(false);
      expect(result.errors.legal_name).toBe('Legal name cannot be empty');
    });

    it('should reject too long legal name', () => {
      const result = validateCustomerUpdateData({ legal_name: 'A'.repeat(256) });
      expect(result.valid).toBe(false);
      expect(result.errors.legal_name).toBe('Legal name must be 255 characters or less');
    });

    it('should reject invalid tax regime', () => {
      const result = validateCustomerUpdateData({ tax_regime: '999' });
      expect(result.valid).toBe(false);
      expect(result.errors.tax_regime).toBe('Invalid tax regime code');
    });

    it('should reject invalid CFDI use', () => {
      const result = validateCustomerUpdateData({ cfdi_use: 'X99' });
      expect(result.valid).toBe(false);
      expect(result.errors.cfdi_use).toBe('Invalid CFDI use code');
    });

    it('should reject invalid email', () => {
      const result = validateCustomerUpdateData({ email: 'notanemail' });
      expect(result.valid).toBe(false);
      expect(result.errors.email).toBe('Invalid email format');
    });

    it('should reject invalid phone', () => {
      const result = validateCustomerUpdateData({ phone: '123' });
      expect(result.valid).toBe(false);
      expect(result.errors.phone).toBe('Invalid phone format');
    });

    it('should allow empty string for optional fields', () => {
      const result = validateCustomerUpdateData({
        email: '',
        phone: '',
      });
      expect(result.valid).toBe(true);
    });
  });

  describe('validateRFCTaxRegimeCompatibility', () => {
    it('should validate legal entity RFC with legal entity tax regime', () => {
      const result = validateRFCTaxRegimeCompatibility('ABC120101ABC', '601');
      expect(result.compatible).toBe(true);
    });

    it('should validate individual RFC with individual tax regime', () => {
      const result = validateRFCTaxRegimeCompatibility('ABCD120101ABC', '612');
      expect(result.compatible).toBe(true);
    });

    it('should return incompatible for invalid RFC', () => {
      const result = validateRFCTaxRegimeCompatibility('INVALID', '601');
      expect(result.compatible).toBe(false);
    });

    it('should validate both tax regime (626)', () => {
      const result = validateRFCTaxRegimeCompatibility('ABC120101ABC', '626');
      expect(result.compatible).toBe(true);
    });
  });
});
