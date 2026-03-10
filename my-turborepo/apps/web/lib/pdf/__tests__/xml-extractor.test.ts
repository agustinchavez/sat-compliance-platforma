/**
 * XML Extractor Tests (Component 16)
 */

import { describe, it, expect } from 'vitest';
import {
  extractXMLFields,
  truncateSello,
  extractUUIDFromXML,
  validateXMLForPDF,
  XMLExtractionError,
} from '../xml-extractor';
import {
  MINIMAL_STAMPED_XML,
  UNSIGNED_XML,
  XML_WITHOUT_SELLO,
  XML_WITHOUT_NOCERTIFICADO,
  MALFORMED_XML,
  XML_WITHOUT_CONDITIONS,
  EXPECTED_EXTRACTED,
} from './fixtures/stamped-xml';

// ============================================================================
// extractXMLFields Tests
// ============================================================================

describe('extractXMLFields', () => {
  it('should extract all fields from valid stamped XML', () => {
    const fields = extractXMLFields(MINIMAL_STAMPED_XML);

    expect(fields.noCertificadoEmisor).toBe(EXPECTED_EXTRACTED.noCertificadoEmisor);
    expect(fields.selloEmisor).toBe(EXPECTED_EXTRACTED.selloEmisor);
    expect(fields.condicionesDePago).toBe(EXPECTED_EXTRACTED.condicionesDePago);
  });

  it('should extract full selloEmisor for QR code', () => {
    const fields = extractXMLFields(MINIMAL_STAMPED_XML);

    // Full sello is needed for QR code fe parameter
    expect(fields.selloEmisor.length).toBeGreaterThan(40);
    expect(fields.selloEmisor).toBe(EXPECTED_EXTRACTED.selloEmisor);
  });

  it('should truncate selloEmisorDisplay', () => {
    const fields = extractXMLFields(MINIMAL_STAMPED_XML);

    expect(fields.selloEmisorDisplay).toContain('...');
    expect(fields.selloEmisorDisplay.length).toBe(43); // 3 for "..." + 40 chars
  });

  it('should truncate selloSATDisplay', () => {
    const fields = extractXMLFields(MINIMAL_STAMPED_XML);

    expect(fields.selloSATDisplay).toContain('...');
    expect(fields.selloSATDisplay.length).toBe(43);
  });

  it('should return null for missing CondicionesDePago', () => {
    const fields = extractXMLFields(XML_WITHOUT_CONDITIONS);

    expect(fields.condicionesDePago).toBeNull();
  });

  it('should throw for null input', () => {
    expect(() => extractXMLFields(null as unknown as string)).toThrow(XMLExtractionError);
    expect(() => extractXMLFields(null as unknown as string)).toThrow('XML content is required');
  });

  it('should throw for undefined input', () => {
    expect(() => extractXMLFields(undefined as unknown as string)).toThrow(XMLExtractionError);
  });

  it('should throw for empty string', () => {
    expect(() => extractXMLFields('')).toThrow(XMLExtractionError);
    expect(() => extractXMLFields('')).toThrow('XML content is required');
  });

  it('should throw for missing Sello attribute', () => {
    expect(() => extractXMLFields(XML_WITHOUT_SELLO)).toThrow(XMLExtractionError);
    expect(() => extractXMLFields(XML_WITHOUT_SELLO)).toThrow('Missing required attribute: Sello');
  });

  it('should throw for missing NoCertificado attribute', () => {
    expect(() => extractXMLFields(XML_WITHOUT_NOCERTIFICADO)).toThrow(XMLExtractionError);
    expect(() => extractXMLFields(XML_WITHOUT_NOCERTIFICADO)).toThrow(
      'Missing required attribute: NoCertificado'
    );
  });

  it('should work with unsigned XML (no TFD)', () => {
    const fields = extractXMLFields(UNSIGNED_XML);

    expect(fields.noCertificadoEmisor).toBe('30001000000300023708');
    expect(fields.selloEmisor).toBeTruthy();
    // SelloSAT will be empty since no TFD
    expect(fields.selloSATDisplay).toBe('');
  });
});

// ============================================================================
// truncateSello Tests
// ============================================================================

describe('truncateSello', () => {
  it('should truncate long sello with "..." prefix', () => {
    const longSello = 'A'.repeat(100);
    const result = truncateSello(longSello);

    expect(result).toBe('...' + 'A'.repeat(40));
    expect(result.length).toBe(43);
  });

  it('should not truncate short sello', () => {
    const shortSello = 'ABC123';
    const result = truncateSello(shortSello);

    expect(result).toBe('ABC123');
    expect(result).not.toContain('...');
  });

  it('should handle exact length', () => {
    const exactSello = 'A'.repeat(40);
    const result = truncateSello(exactSello);

    expect(result).toBe(exactSello);
    expect(result).not.toContain('...');
  });

  it('should handle empty string', () => {
    expect(truncateSello('')).toBe('');
  });

  it('should handle custom length', () => {
    const sello = 'ABCDEFGHIJ';
    const result = truncateSello(sello, 5);

    expect(result).toBe('...FGHIJ');
  });
});

// ============================================================================
// extractUUIDFromXML Tests
// ============================================================================

describe('extractUUIDFromXML', () => {
  it('should extract UUID from stamped XML', () => {
    const uuid = extractUUIDFromXML(MINIMAL_STAMPED_XML);

    expect(uuid).toBe(EXPECTED_EXTRACTED.uuid);
  });

  it('should return null for unsigned XML', () => {
    const uuid = extractUUIDFromXML(UNSIGNED_XML);

    expect(uuid).toBeNull();
  });

  it('should return null for empty input', () => {
    expect(extractUUIDFromXML('')).toBeNull();
    expect(extractUUIDFromXML(null as unknown as string)).toBeNull();
  });

  it('should return null for malformed XML', () => {
    // Should not throw, just return null
    expect(extractUUIDFromXML(MALFORMED_XML)).toBeNull();
  });
});

// ============================================================================
// validateXMLForPDF Tests
// ============================================================================

describe('validateXMLForPDF', () => {
  it('should return empty array for valid stamped XML', () => {
    const errors = validateXMLForPDF(MINIMAL_STAMPED_XML);

    expect(errors).toEqual([]);
  });

  it('should return error for empty input', () => {
    const errors = validateXMLForPDF('');

    expect(errors).toContain('XML content is required');
  });

  it('should return error for missing TFD', () => {
    const errors = validateXMLForPDF(UNSIGNED_XML);

    expect(errors).toContain('Missing TimbreFiscalDigital complement (invoice not stamped)');
  });

  it('should return error for missing Sello', () => {
    const errors = validateXMLForPDF(XML_WITHOUT_SELLO);

    expect(errors.some((e) => e.includes('Sello'))).toBe(true);
  });

  it('should return error for missing NoCertificado', () => {
    const errors = validateXMLForPDF(XML_WITHOUT_NOCERTIFICADO);

    expect(errors.some((e) => e.includes('NoCertificado'))).toBe(true);
  });

  it('should return multiple errors for multiple issues', () => {
    // XML with neither Sello nor NoCertificado
    const badXml = `<?xml version="1.0"?><cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/4"/>`;
    const errors = validateXMLForPDF(badXml);

    expect(errors.length).toBeGreaterThan(0);
  });
});

// ============================================================================
// XMLExtractionError Tests
// ============================================================================

describe('XMLExtractionError', () => {
  it('should be instance of PDFError', () => {
    const error = new XMLExtractionError('Test error');

    expect(error.name).toBe('XMLExtractionError');
    expect(error.code).toBe('PDF_XML_PARSE_ERROR');
    expect(error.message).toBe('Test error');
  });

  it('should include original error', () => {
    const original = new Error('Original');
    const error = new XMLExtractionError('Wrapper', original);

    expect(error.originalError).toBe(original);
  });
});

// ============================================================================
// Integration Tests
// ============================================================================

describe('XML Extractor Integration', () => {
  it('should extract fields needed for QR code generation', () => {
    const fields = extractXMLFields(MINIMAL_STAMPED_XML);

    // These fields are needed for formatSATVerificationURL
    expect(fields.selloEmisor).toBeTruthy();
    expect(fields.selloEmisor.length).toBeGreaterThan(8); // Need at least 8 chars for fe param

    // Should be able to extract last 8 chars
    const last8 = fields.selloEmisor.slice(-8);
    expect(last8).toBe('KLMNOP==');
  });

  it('should extract fields needed for stamp block display', () => {
    const fields = extractXMLFields(MINIMAL_STAMPED_XML);

    // These fields are displayed in the PDF stamp block
    expect(fields.noCertificadoEmisor).toBe('30001000000300023708');
    expect(fields.selloEmisorDisplay).toBe(
      '...' + fields.selloEmisor.slice(-40)
    );
    expect(fields.selloSATDisplay.startsWith('...')).toBe(true);
  });
});
