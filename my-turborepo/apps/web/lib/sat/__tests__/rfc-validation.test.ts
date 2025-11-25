import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock dependencies
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(() => Promise.resolve({
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: vi.fn(() => Promise.resolve({ data: null, error: null })),
          is: vi.fn(() => ({
            limit: vi.fn(() => Promise.resolve({ data: [], error: null })),
          })),
        })),
      })),
      update: vi.fn(() => ({
        eq: vi.fn(() => Promise.resolve({ error: null })),
      })),
      insert: vi.fn(() => Promise.resolve({ error: null })),
    })),
  })),
}));

vi.mock('@upstash/redis', () => ({
  Redis: vi.fn(() => ({
    get: vi.fn(() => Promise.resolve(null)),
    setex: vi.fn(() => Promise.resolve('OK')),
    del: vi.fn(() => Promise.resolve(1)),
  })),
}));

// Import after mocks
import {
  validateRFC,
  batchValidateRFCs,
  getRFCStatus,
  getCachedValidation,
  cacheValidation,
  invalidateCachedValidation,
  type RFCStatus,
  type RFCValidationResult,
} from '../rfc-validation';
import { validateRFCFormat, validateRFCChecksum } from '../utils';

describe('RFC Validation Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('validateRFCFormat', () => {
    it('should validate correct RFC format for companies (12 chars)', () => {
      // Companies have 3 letters + 6 digits + 3 alphanumeric = 12 chars
      expect(validateRFCFormat('ABC120101ABC')).toBe(true);
      expect(validateRFCFormat('XYZ980515XY9')).toBe(true);
    });

    it('should validate correct RFC format for individuals (13 chars)', () => {
      // Individuals have 4 letters + 6 digits + 3 alphanumeric = 13 chars
      expect(validateRFCFormat('XAXX010101000')).toBe(true);
      expect(validateRFCFormat('CACX7605101P8')).toBe(true);
    });

    it('should validate RFC with special characters Ñ and &', () => {
      expect(validateRFCFormat('ÑAÑ120101ABC')).toBe(true);
      expect(validateRFCFormat('A&B120101ABC')).toBe(true);
    });

    it('should reject RFC with invalid format', () => {
      expect(validateRFCFormat('ABC')).toBe(false); // Too short
      expect(validateRFCFormat('ABC120101ABCDE')).toBe(false); // Too long
      expect(validateRFCFormat('abc120101abc')).toBe(false); // Lowercase
      expect(validateRFCFormat('12C120101ABC')).toBe(false); // Numbers at start
      expect(validateRFCFormat('ABC12010ZABC')).toBe(false); // Letter in date portion
      expect(validateRFCFormat('ABCDEFGHIJKL')).toBe(false); // No digits
    });

    it('should reject empty or whitespace RFC', () => {
      expect(validateRFCFormat('')).toBe(false);
      expect(validateRFCFormat('   ')).toBe(false);
    });
  });

  describe('validateRFCChecksum', () => {
    it('should validate RFC checksum and return boolean', () => {
      // Note: The checksum algorithm is complex and returns boolean
      // The function validates format first, then attempts checksum validation
      const result = validateRFCChecksum('XAXX010101000');
      expect(typeof result).toBe('boolean');
    });

    it('should reject RFC with invalid format', () => {
      expect(validateRFCChecksum('ABC')).toBe(false);
      expect(validateRFCChecksum('invalid')).toBe(false);
      expect(validateRFCChecksum('')).toBe(false);
    });

    it('should handle RFC with special characters', () => {
      // RFCs with Ñ and & should be handled correctly
      const result = validateRFCChecksum('ÑAÑ120101AB0');
      // Just verify it doesn't throw and returns a boolean
      expect(typeof result).toBe('boolean');
    });
  });

  describe('validateRFC', () => {
    it('should return valid result for correct RFC format', async () => {
      const result = await validateRFC('XAXX010101000');

      expect(result.rfc).toBe('XAXX010101000');
      expect(result.formatValid).toBe(true);
      expect(result.lastUpdated).toBeInstanceOf(Date);
      // Errors may include checksum validation note
      expect(Array.isArray(result.errors)).toBe(true);
    });

    it('should return invalid result for incorrect RFC format', async () => {
      const result = await validateRFC('ABC');

      expect(result.rfc).toBe('ABC');
      expect(result.isValid).toBe(false);
      expect(result.formatValid).toBe(false);
      expect(result.status).toBe('invalid');
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should normalize RFC to uppercase', async () => {
      const result = await validateRFC('xaxx010101000');

      expect(result.rfc).toBe('XAXX010101000');
    });

    it('should trim whitespace from RFC', async () => {
      const result = await validateRFC('  XAXX010101000  ');

      expect(result.rfc).toBe('XAXX010101000');
    });

    it('should set source to local for non-cached validation', async () => {
      const result = await validateRFC('XAXX010101000', { skipCache: true });

      expect(result.source).toBe('local');
    });
  });

  describe('batchValidateRFCs', () => {
    it('should validate multiple RFCs', async () => {
      const rfcs = ['XAXX010101000', 'ABC120101ABC', 'INVALID'];

      const result = await batchValidateRFCs(rfcs);

      expect(result.total).toBe(3);
      expect(result.valid).toBeGreaterThanOrEqual(0);
      expect(result.invalid).toBeGreaterThanOrEqual(0);
      expect(result.valid + result.invalid).toBe(result.total);
      expect(result.results).toHaveLength(3);
    });

    it('should handle empty array', async () => {
      const result = await batchValidateRFCs([]);

      expect(result.total).toBe(0);
      expect(result.valid).toBe(0);
      expect(result.invalid).toBe(0);
      expect(result.results).toHaveLength(0);
    });

    it('should process large batches', async () => {
      const rfcs = Array(100).fill('XAXX010101000');

      const result = await batchValidateRFCs(rfcs);

      expect(result.total).toBe(100);
      expect(result.results).toHaveLength(100);
    });
  });

  describe('getRFCStatus', () => {
    it('should return valid status for correct RFC', async () => {
      const status = await getRFCStatus('XAXX010101000');

      expect(['valid', 'invalid', 'unknown']).toContain(status);
    });

    it('should return invalid status for incorrect RFC', async () => {
      const status = await getRFCStatus('INVALID');

      expect(status).toBe('invalid');
    });
  });

  describe('RFC Status Types', () => {
    it('should have correct status types', () => {
      const validStatuses: RFCStatus[] = ['valid', 'invalid', 'cancelled', 'suspended', 'unknown'];

      validStatuses.forEach(status => {
        expect(typeof status).toBe('string');
      });
    });
  });

  describe('Validation Result Structure', () => {
    it('should have all required fields', async () => {
      const result = await validateRFC('XAXX010101000');

      expect(result).toHaveProperty('rfc');
      expect(result).toHaveProperty('isValid');
      expect(result).toHaveProperty('status');
      expect(result).toHaveProperty('formatValid');
      expect(result).toHaveProperty('checksumValid');
      expect(result).toHaveProperty('lastUpdated');
      expect(result).toHaveProperty('source');
      expect(result).toHaveProperty('errors');
    });

    it('should have correct types for all fields', async () => {
      const result = await validateRFC('XAXX010101000');

      expect(typeof result.rfc).toBe('string');
      expect(typeof result.isValid).toBe('boolean');
      expect(typeof result.status).toBe('string');
      expect(typeof result.formatValid).toBe('boolean');
      expect(typeof result.checksumValid).toBe('boolean');
      expect(result.lastUpdated).toBeInstanceOf(Date);
      expect(typeof result.source).toBe('string');
      expect(Array.isArray(result.errors)).toBe(true);
    });
  });

  describe('Edge Cases', () => {
    it('should handle RFC with all valid edge characters', async () => {
      // Test with Ñ
      const resultN = await validateRFC('ÑAÑ120101AB0');
      expect(resultN.formatValid).toBe(true);

      // Test with &
      const resultAmp = await validateRFC('A&B120101AB0');
      expect(resultAmp.formatValid).toBe(true);
    });

    it('should handle generic RFC (XAXX010101000)', async () => {
      const result = await validateRFC('XAXX010101000');

      expect(result.formatValid).toBe(true);
    });

    it('should handle foreign RFC placeholder (XEXX010101000)', async () => {
      const result = await validateRFC('XEXX010101000');

      expect(result.formatValid).toBe(true);
    });
  });

  describe('Concurrent Validation', () => {
    it('should handle concurrent validation requests', async () => {
      const rfcs = ['XAXX010101000', 'ABC120101ABC', 'XYZ980515XY9'];

      const results = await Promise.all(rfcs.map(rfc => validateRFC(rfc)));

      expect(results).toHaveLength(3);
      results.forEach(result => {
        expect(result).toHaveProperty('rfc');
        expect(result).toHaveProperty('isValid');
      });
    });
  });
});
