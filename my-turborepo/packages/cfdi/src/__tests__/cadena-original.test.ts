/**
 * Cadena Original Tests
 *
 * Tests for cadena original generation and SHA-256 hashing.
 * Tests that require the XSLT file are marked as integration tests.
 */

import { describe, it, expect } from 'vitest';
import {
  computeSHA256,
  validateCadena,
  isXSLTAvailable,
  isXsltprocAvailable,
  generateCadenaOriginal,
} from '../cadena-original.js';
import { generateCFDI } from '../generator.js';
import { FIXTURE_INGRESO_SIMPLE } from './fixtures.js';

describe('computeSHA256', () => {
  it('computes correct SHA-256 for known input "hello"', () => {
    // Known vector:
    // input: "hello"
    // expected SHA-256: 2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824
    expect(computeSHA256('hello')).toBe(
      '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824'
    );
  });

  it('computes correct SHA-256 for empty string', () => {
    // Known vector for empty string
    expect(computeSHA256('')).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
    );
  });

  it('computes correct SHA-256 for UTF-8 string', () => {
    // Test with special characters
    const hash = computeSHA256('Hola Mundo ñ € 日本語');
    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('produces different hashes for different inputs', () => {
    const hash1 = computeSHA256('hello');
    const hash2 = computeSHA256('world');
    expect(hash1).not.toBe(hash2);
  });

  it('produces same hash for same input (deterministic)', () => {
    const hash1 = computeSHA256('test input');
    const hash2 = computeSHA256('test input');
    expect(hash1).toBe(hash2);
  });

  it('returns lowercase hex string', () => {
    const hash = computeSHA256('test');
    expect(hash).toMatch(/^[a-f0-9]+$/);
    expect(hash).not.toMatch(/[A-F]/);
  });
});

describe('validateCadena', () => {
  it('accepts valid cadena starting and ending with ||', () => {
    const validCadena = '||4.0|A|00001|2024-03-01T10:00:00|content||';
    expect(validateCadena(validCadena)).toBe(true);
  });

  it('rejects cadena not starting with ||', () => {
    const invalidCadena = '|4.0|A|00001||';
    expect(validateCadena(invalidCadena)).toBe(false);
  });

  it('rejects cadena not ending with ||', () => {
    const invalidCadena = '||4.0|A|00001|';
    expect(validateCadena(invalidCadena)).toBe(false);
  });

  it('rejects empty string', () => {
    expect(validateCadena('')).toBe(false);
  });

  it('rejects null or undefined', () => {
    expect(validateCadena(null as any)).toBe(false);
    expect(validateCadena(undefined as any)).toBe(false);
  });

  it('rejects cadena with only |||| (no content)', () => {
    expect(validateCadena('||||')).toBe(false);
  });

  it('rejects cadena without internal separators', () => {
    const invalidCadena = '||content||';
    expect(validateCadena(invalidCadena)).toBe(false);
  });

  it('accepts cadena with whitespace (after trim)', () => {
    const validCadena = '  ||4.0|content||  ';
    expect(validateCadena(validCadena)).toBe(true);
  });

  it('accepts complex valid cadena', () => {
    const complexCadena =
      '||4.0|A|00001|2024-03-01T10:00:00|01|10000.00|MXN|11600.00|I|01|PUE|06600|' +
      'EKU9003173C9|ESCUELA KEMPER URGATE|601|URE180429TM6|UNIVERSIDAD ROBOTICA ESPAÑOLA|' +
      '65000|601|G01|81112100|1|E48|Hora|Servicio||';
    expect(validateCadena(complexCadena)).toBe(true);
  });
});

describe('isXSLTAvailable', () => {
  it('returns boolean', () => {
    const result = isXSLTAvailable();
    expect(typeof result).toBe('boolean');
  });
});

describe('isXsltprocAvailable', () => {
  it('returns boolean', () => {
    const result = isXsltprocAvailable();
    expect(typeof result).toBe('boolean');
  });
});

// Integration tests that require XSLT file and xsltproc
describe('generateCadenaOriginal', () => {
  const xsltAvailable = isXSLTAvailable();
  const xsltprocAvailable = isXsltprocAvailable();
  const canRunIntegration = xsltAvailable && xsltprocAvailable;

  it.skipIf(!canRunIntegration)('produces a pipe-delimited string starting with ||', async () => {
    const { xml } = generateCFDI(FIXTURE_INGRESO_SIMPLE);
    const result = await generateCadenaOriginal(xml);

    expect(result.cadena).toMatch(/^\|\|/);
    expect(result.cadena).toMatch(/\|\|$/);
  });

  it.skipIf(!canRunIntegration)('includes invoice fields in the cadena', async () => {
    const { xml } = generateCFDI(FIXTURE_INGRESO_SIMPLE);
    const result = await generateCadenaOriginal(xml);

    // RFC should appear in the cadena
    expect(result.cadena).toContain('EKU9003173C9');
    expect(result.cadena).toContain('URE180429TM6');
  });

  it.skipIf(!canRunIntegration)('sha256 is a valid 64-char hex string', async () => {
    const { xml } = generateCFDI(FIXTURE_INGRESO_SIMPLE);
    const result = await generateCadenaOriginal(xml);

    expect(result.sha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it.skipIf(!canRunIntegration)('same XML always produces same cadena (deterministic)', async () => {
    const { xml } = generateCFDI(FIXTURE_INGRESO_SIMPLE);
    const r1 = await generateCadenaOriginal(xml);
    const r2 = await generateCadenaOriginal(xml);

    expect(r1.cadena).toBe(r2.cadena);
    expect(r1.sha256).toBe(r2.sha256);
  });

  it.skipIf(!canRunIntegration)('includes version 4.0 in cadena', async () => {
    const { xml } = generateCFDI(FIXTURE_INGRESO_SIMPLE);
    const result = await generateCadenaOriginal(xml);

    expect(result.cadena).toContain('4.0');
  });

  it.skipIf(!xsltAvailable)('throws error when XSLT transformation fails', async () => {
    // Invalid XML should cause transformation to fail
    const invalidXml = '<invalid><xml></invalid>';

    await expect(generateCadenaOriginal(invalidXml)).rejects.toThrow();
  });

  // Skip message for when tests are skipped
  it('skips integration tests when XSLT or xsltproc not available', () => {
    if (!canRunIntegration) {
      console.log(
        `  Note: Skipping cadena original integration tests.\n` +
          `  XSLT available: ${xsltAvailable}\n` +
          `  xsltproc available: ${xsltprocAvailable}\n` +
          `  Run 'npm run download-xslt' and ensure xsltproc is installed.`
      );
    }
    expect(true).toBe(true);
  });
});
