/**
 * Unit Tests for Import/Export Functions
 * Component 6: Customer Service
 */

import {
  exportCustomersToCSV,
  generateCSVFilename,
  validateCSVHeaders,
  exportCustomersToJSON,
  exportCustomers,
} from '../import-export';
import type { Customer } from '../types';

describe('Customer Import/Export', () => {
  const mockCustomers: Customer[] = [
    {
      id: '1',
      organization_id: 'org-1',
      rfc: 'ABC120101ABC',
      legal_name: 'ACME Corporation S.A. de C.V.',
      business_name: 'ACME Corp',
      email: 'acme@example.com',
      phone: '+525512345678',
      tax_regime: '601',
      cfdi_use: 'G03',
      address: {
        street: 'Reforma',
        exterior_number: '123',
        colony: 'Juárez',
        city: 'CDMX',
        state: 'CDMX',
        postal_code: '06600',
        country: 'México',
      },
      notes: 'Important customer',
      tags: ['VIP', 'Priority'],
      is_active: true,
      sat_validated: true,
      created_at: new Date('2025-01-01'),
      updated_at: new Date('2025-01-01'),
    },
    {
      id: '2',
      organization_id: 'org-1',
      rfc: 'XYZ120101XYZ',
      legal_name: 'XYZ Inc.',
      email: 'xyz@example.com',
      tax_regime: '603',
      cfdi_use: 'G01',
      tags: [],
      is_active: false,
      sat_validated: false,
      created_at: new Date('2025-01-02'),
      updated_at: new Date('2025-01-02'),
    },
  ];

  describe('CSV Export', () => {
    it('should export customers to CSV format', async () => {
      const csv = await exportCustomersToCSV(mockCustomers);
      expect(csv).toBeTruthy();
      expect(csv).toContain('RFC,Legal Name');
      expect(csv).toContain('ABC120101ABC');
      expect(csv).toContain('XYZ120101XYZ');
    });

    it('should include headers in CSV', async () => {
      const csv = await exportCustomersToCSV(mockCustomers);
      const lines = csv.split('\n');
      const headers = lines[0];

      expect(headers).toContain('RFC');
      expect(headers).toContain('Legal Name');
      expect(headers).toContain('Business Name');
      expect(headers).toContain('Email');
      expect(headers).toContain('Tax Regime');
      expect(headers).toContain('CFDI Use');
      expect(headers).toContain('Tags');
    });

    it('should export customer data in rows', async () => {
      const csv = await exportCustomersToCSV(mockCustomers);
      const lines = csv.split('\n');

      expect(lines.length).toBeGreaterThan(2); // Headers + at least 2 customers
      expect(lines[1]).toContain('ABC120101ABC');
      expect(lines[1]).toContain('ACME Corporation');
    });

    it('should handle special characters in CSV', async () => {
      const customersWithSpecialChars: Customer[] = [
        {
          ...mockCustomers[0],
          legal_name: 'Company, Inc. "Special"',
          notes: 'Has\nNewline',
        },
      ];

      const csv = await exportCustomersToCSV(customersWithSpecialChars);
      expect(csv).toContain('"Company, Inc. ""Special"""'); // Escaped quotes and commas
    });

    it('should handle empty customer list', async () => {
      const csv = await exportCustomersToCSV([]);
      const lines = csv.split('\n');
      expect(lines.length).toBe(1); // Only headers
    });

    it('should handle customers without optional fields', async () => {
      const minimalCustomer: Customer = {
        id: '3',
        organization_id: 'org-1',
        rfc: 'MIN120101MIN',
        legal_name: 'Minimal Customer',
        tax_regime: '601',
        cfdi_use: 'G03',
        tags: [],
        is_active: true,
        sat_validated: false,
        created_at: new Date(),
        updated_at: new Date(),
      };

      const csv = await exportCustomersToCSV([minimalCustomer]);
      expect(csv).toContain('MIN120101MIN');
      expect(csv).toContain('Minimal Customer');
    });

    it('should export tags as comma-separated string', async () => {
      const csv = await exportCustomersToCSV(mockCustomers);
      expect(csv).toContain('VIP, Priority');
    });

    it('should export address fields', async () => {
      const csv = await exportCustomersToCSV(mockCustomers);
      const lines = csv.split('\n');
      const headers = lines[0].split(',');

      expect(headers).toContain('Street');
      expect(headers).toContain('Exterior Number');
      expect(headers).toContain('Colony');
      expect(headers).toContain('City');
      expect(headers).toContain('State');
      expect(headers).toContain('Postal Code');
    });
  });

  describe('CSV Filename Generation', () => {
    it('should generate CSV filename', () => {
      const filename = generateCSVFilename('ACME Corp');
      expect(filename).toMatch(/^customers_acme_corp_\d{4}-\d{2}-\d{2}\.csv$/);
    });

    it('should sanitize organization name', () => {
      const filename = generateCSVFilename('Test & Co., Inc.');
      expect(filename).not.toContain('&');
      expect(filename).not.toContain(',');
      expect(filename).toContain('_');
    });

    it('should include date', () => {
      const filename = generateCSVFilename('Test');
      const today = new Date().toISOString().split('T')[0];
      expect(filename).toContain(today);
    });
  });

  describe('CSV Header Validation', () => {
    it('should validate valid headers', () => {
      const headers = ['rfc', 'legal_name', 'tax_regime', 'email', 'phone'];
      const result = validateCSVHeaders(headers);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should require RFC header', () => {
      const headers = ['legal_name', 'tax_regime'];
      const result = validateCSVHeaders(headers);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Missing required header: rfc');
    });

    it('should require legal_name header', () => {
      const headers = ['rfc', 'tax_regime'];
      const result = validateCSVHeaders(headers);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Missing required header: legal_name');
    });

    it('should require tax_regime header', () => {
      const headers = ['rfc', 'legal_name'];
      const result = validateCSVHeaders(headers);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Missing required header: tax_regime');
    });

    it('should handle headers with spaces', () => {
      const headers = ['RFC', 'Legal Name', 'Tax Regime'];
      const result = validateCSVHeaders(headers);
      expect(result.valid).toBe(true);
    });

    it('should handle headers with different casing', () => {
      const headers = ['RFC', 'LEGAL_NAME', 'TAX_REGIME'];
      const result = validateCSVHeaders(headers);
      expect(result.valid).toBe(true);
    });
  });

  describe('JSON Export', () => {
    it('should export customers to JSON', async () => {
      const json = await exportCustomersToJSON(mockCustomers);
      const parsed = JSON.parse(json);

      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed).toHaveLength(2);
      expect(parsed[0].rfc).toBe('ABC120101ABC');
      expect(parsed[1].rfc).toBe('XYZ120101XYZ');
    });

    it('should preserve all customer fields in JSON', async () => {
      const json = await exportCustomersToJSON(mockCustomers);
      const parsed = JSON.parse(json);

      expect(parsed[0]).toHaveProperty('id');
      expect(parsed[0]).toHaveProperty('rfc');
      expect(parsed[0]).toHaveProperty('legal_name');
      expect(parsed[0]).toHaveProperty('tax_regime');
      expect(parsed[0]).toHaveProperty('cfdi_use');
      expect(parsed[0]).toHaveProperty('tags');
      expect(parsed[0]).toHaveProperty('address');
    });

    it('should handle empty array', async () => {
      const json = await exportCustomersToJSON([]);
      const parsed = JSON.parse(json);

      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed).toHaveLength(0);
    });

    it('should format JSON with indentation', async () => {
      const json = await exportCustomersToJSON(mockCustomers);
      expect(json).toContain('\n');
      expect(json).toContain('  '); // 2-space indentation
    });
  });

  describe('Generic Export', () => {
    it('should export as CSV by default', async () => {
      const result = await exportCustomers(mockCustomers);
      expect(result.mimeType).toBe('text/csv');
      expect(result.filename).toContain('.csv');
      expect(result.content).toContain('RFC,Legal Name');
    });

    it('should export as CSV when specified', async () => {
      const result = await exportCustomers(mockCustomers, 'csv');
      expect(result.mimeType).toBe('text/csv');
      expect(result.filename).toContain('.csv');
    });

    it('should export as JSON when specified', async () => {
      const result = await exportCustomers(mockCustomers, 'json');
      expect(result.mimeType).toBe('application/json');
      expect(result.filename).toContain('.json');
      expect(() => JSON.parse(result.content)).not.toThrow();
    });

    it('should include date in filename', async () => {
      const result = await exportCustomers(mockCustomers);
      const today = new Date().toISOString().split('T')[0];
      expect(result.filename).toContain(today);
    });
  });

  describe('Edge Cases', () => {
    it('should handle customer with all fields populated', async () => {
      const completeCustomer: Customer = {
        ...mockCustomers[0],
        business_name: 'ACME',
        email: 'test@example.com',
        phone: '+525512345678',
        address: {
          street: 'Reforma',
          exterior_number: '123',
          interior_number: 'Int 5',
          colony: 'Centro',
          locality: 'Locality',
          municipality: 'Municipality',
          city: 'CDMX',
          state: 'CDMX',
          postal_code: '06600',
          country: 'México',
        },
        notes: 'Complete customer',
        tags: ['Tag1', 'Tag2', 'Tag3'],
      };

      const csv = await exportCustomersToCSV([completeCustomer]);
      expect(csv).toBeTruthy();
      expect(csv).toContain('ACME');
      expect(csv).toContain('test@example.com');
    });

    it('should handle customer with minimal fields', async () => {
      const minimalCustomer: Customer = {
        id: '1',
        organization_id: 'org-1',
        rfc: 'ABC120101ABC',
        legal_name: 'Test',
        tax_regime: '601',
        cfdi_use: 'G03',
        tags: [],
        is_active: true,
        sat_validated: false,
        created_at: new Date(),
        updated_at: new Date(),
      };

      const csv = await exportCustomersToCSV([minimalCustomer]);
      expect(csv).toBeTruthy();
      expect(csv).toContain('ABC120101ABC');
    });

    it('should handle very long text fields', async () => {
      const longTextCustomer: Customer = {
        ...mockCustomers[0],
        legal_name: 'A'.repeat(500),
        notes: 'B'.repeat(1000),
      };

      const csv = await exportCustomersToCSV([longTextCustomer]);
      expect(csv).toBeTruthy();
    });

    it('should handle special characters in all text fields', async () => {
      const specialCharsCustomer: Customer = {
        ...mockCustomers[0],
        legal_name: 'Company "Quote" & Ampersand, Comma',
        business_name: 'Name with\nNewline',
        notes: 'Notes with\ttab',
      };

      const csv = await exportCustomersToCSV([specialCharsCustomer]);
      expect(csv).toBeTruthy();
      // Should properly escape special characters
      expect(csv).toContain('"');
    });
  });
});
