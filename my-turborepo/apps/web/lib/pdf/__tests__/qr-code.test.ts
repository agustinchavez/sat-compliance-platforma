/**
 * QR Code Tests (Component 16)
 */

import { describe, it, expect } from 'vitest';
import {
  formatTotalForQR,
  extractLast8OfSello,
  formatSATVerificationURL,
  generateSATQRCode,
  generateInvoiceQRCode,
  SAT_VERIFICATION_URL,
  type SATVerificationParams,
} from '../qr-code';

// ============================================================================
// Test Fixtures
// ============================================================================

const SAMPLE_SELLO =
  'KVttNUxYJFG8yLDvA5ZqYYZrJ8GqHgbPfQvYdVxSP3mR1234567890abcdefghijk==';

const VALID_PARAMS: SATVerificationParams = {
  uuid: '05c519de-6d20-4258-88fb-c69a5970e927',
  rfcEmisor: 'XAXX010101000',
  rfcReceptor: 'XEXX010101000',
  total: '5800.00',
  sello: SAMPLE_SELLO,
};

// ============================================================================
// formatTotalForQR Tests
// ============================================================================

describe('formatTotalForQR', () => {
  it('should format 1234.5 to 1234.500000', () => {
    expect(formatTotalForQR('1234.5')).toBe('1234.500000');
  });

  it('should format 0.99 to 0.990000', () => {
    expect(formatTotalForQR('0.99')).toBe('0.990000');
  });

  it('should format 1000 to 1000.000000', () => {
    expect(formatTotalForQR('1000')).toBe('1000.000000');
  });

  it('should format 0.1 to 0.100000', () => {
    expect(formatTotalForQR('0.1')).toBe('0.100000');
  });

  it('should format 10000.123456 to 10000.123456', () => {
    expect(formatTotalForQR('10000.123456')).toBe('10000.123456');
  });

  it('should format 5800.00 to 5800.000000', () => {
    expect(formatTotalForQR('5800.00')).toBe('5800.000000');
  });

  it('should handle integer input', () => {
    expect(formatTotalForQR('100')).toBe('100.000000');
  });

  it('should handle zero', () => {
    expect(formatTotalForQR('0')).toBe('0.000000');
  });

  it('should handle very small amounts', () => {
    expect(formatTotalForQR('0.000001')).toBe('0.000001');
  });

  it('should round to 6 decimals', () => {
    expect(formatTotalForQR('1234.1234567')).toBe('1234.123457');
  });

  it('should handle large numbers', () => {
    expect(formatTotalForQR('999999999.99')).toBe('999999999.990000');
  });

  it('should return 0.000000 for invalid input', () => {
    expect(formatTotalForQR('invalid')).toBe('0.000000');
    expect(formatTotalForQR('')).toBe('0.000000');
    expect(formatTotalForQR('abc')).toBe('0.000000');
  });

  it('should not use thousands separator', () => {
    const result = formatTotalForQR('1000000');
    expect(result).not.toContain(',');
    expect(result).toBe('1000000.000000');
  });
});

// ============================================================================
// extractLast8OfSello Tests
// ============================================================================

describe('extractLast8OfSello', () => {
  it('should extract last 8 characters', () => {
    // SAMPLE_SELLO ends with: ...1234567890abcdefghijk==
    // Last 8 characters: 'fghijk=='
    expect(extractLast8OfSello(SAMPLE_SELLO)).toBe('fghijk==');
  });

  it('should work with exactly 8 characters', () => {
    expect(extractLast8OfSello('12345678')).toBe('12345678');
  });

  it('should work with longer sello', () => {
    const sello = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnop==';
    // Last 8: 'klmnop=='
    expect(extractLast8OfSello(sello)).toBe('klmnop==');
  });

  it('should throw for too short sello', () => {
    expect(() => extractLast8OfSello('1234567')).toThrow();
    expect(() => extractLast8OfSello('')).toThrow();
  });

  it('should throw for null/undefined', () => {
    expect(() => extractLast8OfSello(null as unknown as string)).toThrow();
    expect(() => extractLast8OfSello(undefined as unknown as string)).toThrow();
  });

  it('should include error message with length', () => {
    try {
      extractLast8OfSello('short');
    } catch (e) {
      expect((e as Error).message).toContain('5');
    }
  });
});

// ============================================================================
// formatSATVerificationURL Tests
// ============================================================================

describe('formatSATVerificationURL', () => {
  it('should generate correct URL format', () => {
    const url = formatSATVerificationURL(VALID_PARAMS);

    expect(url).toContain(SAT_VERIFICATION_URL);
    expect(url).toContain('id=05c519de-6d20-4258-88fb-c69a5970e927');
    expect(url).toContain('re=XAXX010101000');
    expect(url).toContain('rr=XEXX010101000');
    expect(url).toContain('tt=5800.000000');
  });

  it('should include fe parameter with last 8 of sello', () => {
    const url = formatSATVerificationURL(VALID_PARAMS);
    const fe = SAMPLE_SELLO.slice(-8);
    // URLSearchParams encodes = as %3D
    expect(url).toContain(`fe=${encodeURIComponent(fe)}`);
  });

  it('should format total correctly', () => {
    const params = { ...VALID_PARAMS, total: '1234.5' };
    const url = formatSATVerificationURL(params);
    expect(url).toContain('tt=1234.500000');
  });

  it('should have all 5 required parameters', () => {
    const url = formatSATVerificationURL(VALID_PARAMS);
    expect(url).toContain('id=');
    expect(url).toContain('re=');
    expect(url).toContain('rr=');
    expect(url).toContain('tt=');
    expect(url).toContain('fe=');
  });

  it('should use correct base URL', () => {
    const url = formatSATVerificationURL(VALID_PARAMS);
    expect(url.startsWith(SAT_VERIFICATION_URL)).toBe(true);
  });

  it('should throw for missing uuid', () => {
    expect(() =>
      formatSATVerificationURL({ ...VALID_PARAMS, uuid: '' })
    ).toThrow('UUID is required');
  });

  it('should throw for missing rfcEmisor', () => {
    expect(() =>
      formatSATVerificationURL({ ...VALID_PARAMS, rfcEmisor: '' })
    ).toThrow('RFC Emisor is required');
  });

  it('should throw for missing rfcReceptor', () => {
    expect(() =>
      formatSATVerificationURL({ ...VALID_PARAMS, rfcReceptor: '' })
    ).toThrow('RFC Receptor is required');
  });

  it('should throw for missing total', () => {
    expect(() =>
      formatSATVerificationURL({ ...VALID_PARAMS, total: '' })
    ).toThrow('Total is required');
  });

  it('should throw for missing sello', () => {
    expect(() =>
      formatSATVerificationURL({ ...VALID_PARAMS, sello: '' })
    ).toThrow('Sello is required');
  });

  it('should handle special characters in RFC', () => {
    const params = { ...VALID_PARAMS, rfcEmisor: 'ABC&123456ABC' };
    const url = formatSATVerificationURL(params);
    // URLSearchParams encodes & as %26
    expect(url).toContain('re=ABC%26123456ABC');
  });
});

// ============================================================================
// generateSATQRCode Tests
// ============================================================================

describe('generateSATQRCode', () => {
  it('should return a Buffer', async () => {
    const url = formatSATVerificationURL(VALID_PARAMS);
    const buffer = await generateSATQRCode(url);

    expect(Buffer.isBuffer(buffer)).toBe(true);
  });

  it('should return PNG buffer (magic bytes)', async () => {
    const url = formatSATVerificationURL(VALID_PARAMS);
    const buffer = await generateSATQRCode(url);

    // PNG magic bytes: 89 50 4E 47 0D 0A 1A 0A
    expect(buffer[0]).toBe(0x89);
    expect(buffer[1]).toBe(0x50); // P
    expect(buffer[2]).toBe(0x4e); // N
    expect(buffer[3]).toBe(0x47); // G
  });

  it('should generate reasonable size buffer', async () => {
    const url = formatSATVerificationURL(VALID_PARAMS);
    const buffer = await generateSATQRCode(url);

    // QR codes are typically 1-10 KB
    expect(buffer.length).toBeGreaterThan(100);
    expect(buffer.length).toBeLessThan(50000);
  });

  it('should throw for empty URL', async () => {
    await expect(generateSATQRCode('')).rejects.toThrow('URL is required');
  });

  it('should generate different buffers for different URLs', async () => {
    const url1 = formatSATVerificationURL(VALID_PARAMS);
    const url2 = formatSATVerificationURL({ ...VALID_PARAMS, total: '100.00' });

    const buffer1 = await generateSATQRCode(url1);
    const buffer2 = await generateSATQRCode(url2);

    // Buffers should be different (different QR content)
    expect(buffer1.equals(buffer2)).toBe(false);
  });
});

// ============================================================================
// generateInvoiceQRCode Tests
// ============================================================================

describe('generateInvoiceQRCode', () => {
  it('should return a PNG buffer', async () => {
    const buffer = await generateInvoiceQRCode(VALID_PARAMS);

    expect(Buffer.isBuffer(buffer)).toBe(true);
    // PNG magic bytes
    expect(buffer[0]).toBe(0x89);
    expect(buffer[1]).toBe(0x50);
  });

  it('should throw for invalid params', async () => {
    await expect(
      generateInvoiceQRCode({ ...VALID_PARAMS, uuid: '' })
    ).rejects.toThrow('UUID is required');
  });

  it('should produce consistent output for same input', async () => {
    const buffer1 = await generateInvoiceQRCode(VALID_PARAMS);
    const buffer2 = await generateInvoiceQRCode(VALID_PARAMS);

    // Same input should produce same QR code
    expect(buffer1.equals(buffer2)).toBe(true);
  });
});

// ============================================================================
// Integration Tests
// ============================================================================

describe('QR Code Integration', () => {
  it('should generate scannable URL in QR code', async () => {
    const params: SATVerificationParams = {
      uuid: '05c519de-6d20-4258-88fb-c69a5970e927',
      rfcEmisor: 'ABC123456789',
      rfcReceptor: 'DEF987654321',
      total: '11600.00',
      sello: 'ABCDEFGHIJKLMNOPabcdefghijklmnop1234567890QRSTUV==',
    };

    const url = formatSATVerificationURL(params);
    const buffer = await generateSATQRCode(url);

    // Verify URL format
    expect(url).toBe(
      'https://verificacfdi.facturaelectronica.sat.gob.mx/default.aspx' +
        '?id=05c519de-6d20-4258-88fb-c69a5970e927' +
        '&re=ABC123456789' +
        '&rr=DEF987654321' +
        '&tt=11600.000000' +
        '&fe=QRSTUV%3D%3D' // == gets encoded
    );

    // Verify we got a valid QR
    expect(Buffer.isBuffer(buffer)).toBe(true);
    expect(buffer.length).toBeGreaterThan(100);
  });
});
