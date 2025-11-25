import { describe, it, expect } from 'vitest';
import {
  formatSATDate,
  parseSATDate,
  generateRequestId,
  toBase64,
  fromBase64,
  isValidRFCFormat,
  validateRFCFormat,
  calculateRFCChecksum,
  validateRFCChecksum,
  getRateLimitKey,
  calculateRateLimitReset,
  getRateLimitTTL,
  isRetryableError,
  calculateBackoffDelay,
  escapeXML,
  unescapeXML,
  derToPem,
  pemToDer,
  isValidUUID,
  isValidDateRange,
  daysDifference,
  generateCFDIStoragePath,
} from '../utils';

describe('SAT Utils', () => {
  describe('Date Formatting', () => {
    it('should format date for SAT requests', () => {
      const date = new Date('2024-11-19T10:30:45Z');
      const formatted = formatSATDate(date);
      expect(formatted).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/);
      expect(formatted).toContain('2024-11');
    });

    it('should parse SAT date string', () => {
      const satDate = '2024-11-19T10:30:00';
      const parsed = parseSATDate(satDate);
      expect(parsed).toBeInstanceOf(Date);
      expect(parsed.getFullYear()).toBe(2024);
      expect(parsed.getMonth()).toBe(10); // November (0-indexed)
    });
  });

  describe('Request ID Generation', () => {
    it('should generate valid UUID', () => {
      const id = generateRequestId();
      expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    });

    it('should generate unique IDs', () => {
      const id1 = generateRequestId();
      const id2 = generateRequestId();
      expect(id1).not.toBe(id2);
    });
  });

  describe('Base64 Encoding', () => {
    it('should encode buffer to base64', () => {
      const buffer = Buffer.from('Hello World');
      const encoded = toBase64(buffer);
      expect(encoded).toBe('SGVsbG8gV29ybGQ=');
    });

    it('should decode base64 to buffer', () => {
      const base64 = 'SGVsbG8gV29ybGQ=';
      const decoded = fromBase64(base64);
      expect(decoded.toString()).toBe('Hello World');
    });

    it('should round-trip encode/decode', () => {
      const original = Buffer.from('Test Data 123!@#');
      const encoded = toBase64(original);
      const decoded = fromBase64(encoded);
      expect(decoded.toString()).toBe(original.toString());
    });
  });

  describe('RFC Validation', () => {
    describe('isValidRFCFormat', () => {
      it('should validate correct RFC formats', () => {
        expect(isValidRFCFormat('ABC120101ABC')).toBe(true); // Company (13 chars)
        expect(isValidRFCFormat('XAXX010101000')).toBe(true); // Generic
        expect(isValidRFCFormat('CACX7605101P8')).toBe(true); // Person (13 chars) - valid format
      });

      it('should reject invalid RFC formats', () => {
        expect(isValidRFCFormat('ABC')).toBe(false); // Too short
        expect(isValidRFCFormat('ABC120101ABC1234')).toBe(false); // Too long
        expect(isValidRFCFormat('abc120101abc')).toBe(false); // Lowercase
        expect(isValidRFCFormat('ABC12010ZABC')).toBe(false); // Letter in date
      });
    });

    describe('validateRFCFormat (alias)', () => {
      it('should be an alias for isValidRFCFormat', () => {
        expect(validateRFCFormat('ABC120101ABC')).toBe(true);
        expect(validateRFCFormat('ABC')).toBe(false);
      });

      it('should validate special characters Ñ and &', () => {
        expect(validateRFCFormat('ÑAÑ120101ABC')).toBe(true);
        expect(validateRFCFormat('A&B120101ABC')).toBe(true);
      });

      it('should validate 12 and 13 character RFCs', () => {
        expect(validateRFCFormat('ABC120101ABC')).toBe(true); // 12 chars - company
        expect(validateRFCFormat('XAXX010101000')).toBe(true); // 13 chars - individual
      });
    });

    describe('calculateRFCChecksum', () => {
      it('should return last 3 characters of RFC', () => {
        const checksum = calculateRFCChecksum('ABC120101ABC');
        expect(checksum).toBe('ABC');
      });

      it('should return null for RFC shorter than 12 characters', () => {
        expect(calculateRFCChecksum('ABC12')).toBeNull();
        expect(calculateRFCChecksum('ABC')).toBeNull();
        expect(calculateRFCChecksum('')).toBeNull();
      });

      it('should handle RFCs of different lengths', () => {
        expect(calculateRFCChecksum('ABC120101ABC')).toBe('ABC'); // 12 chars
        expect(calculateRFCChecksum('XAXX010101000')).toBe('000'); // 13 chars
      });
    });

    describe('validateRFCChecksum', () => {
      it('should return false for invalid RFC format', () => {
        expect(validateRFCChecksum('ABC')).toBe(false);
        expect(validateRFCChecksum('invalid')).toBe(false);
        expect(validateRFCChecksum('')).toBe(false);
        expect(validateRFCChecksum('abc120101abc')).toBe(false); // lowercase
      });

      it('should validate generic RFC (XAXX010101000)', () => {
        // Generic RFC is a special case used for anonymous transactions
        const result = validateRFCChecksum('XAXX010101000');
        expect(typeof result).toBe('boolean');
      });

      it('should handle RFC with special characters', () => {
        // RFCs with Ñ and & should be handled
        const resultN = validateRFCChecksum('ÑAÑ120101AB0');
        expect(typeof resultN).toBe('boolean');

        const resultAmp = validateRFCChecksum('A&B120101AB0');
        expect(typeof resultAmp).toBe('boolean');
      });

      it('should not throw on any valid format RFC', () => {
        const rfcs = [
          'ABC120101ABC',
          'XYZ980515XY9',
          'XAXX010101000',
          'CACX7605101P8',
        ];

        rfcs.forEach(rfc => {
          expect(() => validateRFCChecksum(rfc)).not.toThrow();
        });
      });

      it('should return boolean for all valid format RFCs', () => {
        const rfcs = [
          'ABC120101ABC',
          'XYZ980515XY9',
          'XAXX010101000',
        ];

        rfcs.forEach(rfc => {
          const result = validateRFCChecksum(rfc);
          expect(typeof result).toBe('boolean');
        });
      });

      it('should handle characters not in lookup table gracefully', () => {
        // The function should return false for characters not in the table
        const result = validateRFCChecksum('ABC120101@#$');
        expect(result).toBe(false); // @ and # are not in the character table
      });
    });
  });

  describe('Rate Limiting', () => {
    it('should generate rate limit key', () => {
      const key = getRateLimitKey('org-123');
      expect(key).toContain('sat:ratelimit:org-123:');
      expect(key).toMatch(/\d{4}-\d{2}-\d{2}$/);
    });

    it('should calculate rate limit reset', () => {
      const reset = calculateRateLimitReset();
      expect(reset).toBeInstanceOf(Date);
      expect(reset.getTime()).toBeGreaterThan(Date.now());
      // Should be tomorrow at midnight
      expect(reset.getHours()).toBe(0);
      expect(reset.getMinutes()).toBe(0);
    });

    it('should calculate TTL until end of day', () => {
      const ttl = getRateLimitTTL();
      expect(ttl).toBeGreaterThan(0);
      expect(ttl).toBeLessThanOrEqual(86400); // Max 24 hours
    });
  });

  describe('Error Handling', () => {
    it('should identify retryable network errors', () => {
      const networkError = { code: 'ECONNRESET' };
      expect(isRetryableError(networkError)).toBe(true);

      const timeoutError = { code: 'ETIMEDOUT' };
      expect(isRetryableError(timeoutError)).toBe(true);
    });

    it('should identify retryable SAT errors', () => {
      const satError = { satCode: 400 }; // Server error
      expect(isRetryableError(satError)).toBe(true);

      const processingError = { satCode: 402 }; // Processing
      expect(isRetryableError(processingError)).toBe(true);
    });

    it('should not retry non-retryable errors', () => {
      const authError = { satCode: 300 }; // Auth error
      expect(isRetryableError(authError)).toBe(false);

      const unknownError = { message: 'Unknown' };
      expect(isRetryableError(unknownError)).toBe(false);
    });

    it('should calculate exponential backoff', () => {
      const delay1 = calculateBackoffDelay(0, 1000);
      const delay2 = calculateBackoffDelay(1, 1000);
      const delay3 = calculateBackoffDelay(2, 1000);

      expect(delay1).toBeGreaterThanOrEqual(1000);
      expect(delay1).toBeLessThan(3000);

      expect(delay2).toBeGreaterThanOrEqual(2000);
      expect(delay2).toBeLessThan(5000);

      expect(delay3).toBeGreaterThanOrEqual(4000);
      expect(delay3).toBeLessThan(8000);
    });

    it('should cap backoff delay at max', () => {
      const delay = calculateBackoffDelay(10, 1000);
      expect(delay).toBeLessThanOrEqual(30000); // Max 30 seconds
    });
  });

  describe('XML Utilities', () => {
    it('should escape XML special characters', () => {
      const input = '<tag attr="value">A & B</tag>';
      const escaped = escapeXML(input);
      expect(escaped).toBe('&lt;tag attr=&quot;value&quot;&gt;A &amp; B&lt;/tag&gt;');
    });

    it('should unescape XML special characters', () => {
      const input = '&lt;tag attr=&quot;value&quot;&gt;A &amp; B&lt;/tag&gt;';
      const unescaped = unescapeXML(input);
      expect(unescaped).toBe('<tag attr="value">A & B</tag>');
    });

    it('should round-trip escape/unescape', () => {
      const original = 'Test <>&"\' characters';
      const escaped = escapeXML(original);
      const unescaped = unescapeXML(escaped);
      expect(unescaped).toBe(original);
    });
  });

  describe('Certificate Utilities', () => {
    it('should convert DER to PEM format', () => {
      const derBuffer = Buffer.from('test certificate data');
      const pem = derToPem(derBuffer, 'CERTIFICATE');

      expect(pem).toContain('-----BEGIN CERTIFICATE-----');
      expect(pem).toContain('-----END CERTIFICATE-----');
      expect(pem.split('\n').length).toBeGreaterThan(2);
    });

    it('should convert PEM to DER format', () => {
      const pem = `-----BEGIN CERTIFICATE-----
dGVzdCBjZXJ0aWZpY2F0ZSBkYXRh
-----END CERTIFICATE-----`;
      const der = pemToDer(pem);

      expect(der).toBeInstanceOf(Buffer);
      expect(der.toString()).toBe('test certificate data');
    });

    it('should handle private key PEM format', () => {
      const derBuffer = Buffer.from('test private key');
      const pem = derToPem(derBuffer, 'PRIVATE KEY');

      expect(pem).toContain('-----BEGIN PRIVATE KEY-----');
      expect(pem).toContain('-----END PRIVATE KEY-----');
    });
  });

  describe('Validation Utilities', () => {
    it('should validate UUID format', () => {
      expect(isValidUUID('550e8400-e29b-41d4-a716-446655440000')).toBe(true);
      expect(isValidUUID('not-a-uuid')).toBe(false);
      expect(isValidUUID('550e8400-e29b-41d4-a716')).toBe(false);
      expect(isValidUUID('550E8400-E29B-41D4-A716-446655440000')).toBe(true); // Uppercase
    });

    it('should validate date ranges', () => {
      const start = new Date('2024-01-01');
      const end = new Date('2024-12-31');
      const future = new Date('2099-01-01');

      expect(isValidDateRange(start, end)).toBe(true);
      expect(isValidDateRange(end, start)).toBe(false); // End before start
      expect(isValidDateRange(start, future)).toBe(false); // Future date
    });

    it('should calculate days difference', () => {
      const date1 = new Date('2024-01-01');
      const date2 = new Date('2024-01-31');

      const diff = daysDifference(date1, date2);
      expect(diff).toBe(30);
    });

    it('should handle negative days difference', () => {
      const date1 = new Date('2024-01-31');
      const date2 = new Date('2024-01-01');

      const diff = daysDifference(date1, date2);
      expect(diff).toBe(-30);
    });
  });

  describe('Storage Path Generation', () => {
    it('should generate CFDI storage path', () => {
      const path = generateCFDIStoragePath(
        'org-123',
        '550e8400-e29b-41d4-a716-446655440000',
        'issued'
      );

      expect(path).toContain('cfdis/org-123/issued/');
      expect(path).toMatch(/\d{4}\/\d{2}\//); // YYYY/MM/
      expect(path).toContain('550e8400-e29b-41d4-a716-446655440000.xml');
    });

    it('should generate different paths for issued vs received', () => {
      const uuid = '550e8400-e29b-41d4-a716-446655440000';
      const issuedPath = generateCFDIStoragePath('org-123', uuid, 'issued');
      const receivedPath = generateCFDIStoragePath('org-123', uuid, 'received');

      expect(issuedPath).toContain('/issued/');
      expect(receivedPath).toContain('/received/');
      expect(issuedPath).not.toBe(receivedPath);
    });
  });
});
