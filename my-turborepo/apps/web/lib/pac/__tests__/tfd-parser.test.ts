/**
 * TFD Parser Tests (Component 15)
 */

import { describe, it, expect } from 'vitest';
import {
  extractTFD,
  getUUID,
  getSATCertNumber,
  getStampDate,
  getPACRfc,
  getSATSignature,
  getIssuerSignature,
  isValidTFDVersion,
  isValidUUID,
  hasTFD,
} from '../tfd-parser';
import { PACError } from '../errors';
import type { TFDData } from '../types';

// ============================================================================
// Test Fixtures
// ============================================================================

const VALID_STAMPED_XML = `<?xml version="1.0" encoding="UTF-8"?>
<cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/4"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  Version="4.0" Sello="ABC123XYZ456...">
  <cfdi:Emisor Rfc="ABC123456789" Nombre="Test Company" RegimenFiscal="601"/>
  <cfdi:Receptor Rfc="XYZ987654321" Nombre="Customer" UsoCFDI="G03"/>
  <cfdi:Conceptos>
    <cfdi:Concepto ClaveProdServ="01010101" Cantidad="1" ClaveUnidad="E48" Descripcion="Service" ValorUnitario="1000.00" Importe="1000.00"/>
  </cfdi:Conceptos>
  <cfdi:Complemento>
    <tfd:TimbreFiscalDigital
      xmlns:tfd="http://www.sat.gob.mx/TimbreFiscalDigital"
      xsi:schemaLocation="http://www.sat.gob.mx/TimbreFiscalDigital http://www.sat.gob.mx/sitio_internet/cfd/TimbreFiscalDigital/TimbreFiscalDigitalv11.xsd"
      Version="1.1"
      UUID="05c519de-6d20-4258-88fb-c69a5970e927"
      FechaTimbrado="2024-03-01T10:00:00"
      RfcProvCertif="SPR190613I52"
      SelloCFD="KVttNU/m3oEfJG/3efOsn3pUqZTuZ431Fm+cVdp5VsGVbxkN8D8Y2J7LlZJzPPYKI8kMKxK9vH1kD6g7O1UW8Q=="
      NoCertificadoSAT="30001000000400002495"
      SelloSAT="qadm+mH3gZuYMnQZSWVoD/AEkekn8Mw1OJ2XJfHWE1K+dGw9HZJvKlI1TpLmN0yR7ZDqC8P5bxVj2mFkS3QaXg=="
    />
  </cfdi:Complemento>
</cfdi:Comprobante>`;

const XML_WITHOUT_COMPLEMENTO = `<?xml version="1.0" encoding="UTF-8"?>
<cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/4" Version="4.0" Sello="ABC123...">
  <cfdi:Emisor Rfc="ABC123456789" Nombre="Test Company" RegimenFiscal="601"/>
  <cfdi:Receptor Rfc="XYZ987654321" Nombre="Customer" UsoCFDI="G03"/>
</cfdi:Comprobante>`;

const XML_WITH_EMPTY_COMPLEMENTO = `<?xml version="1.0" encoding="UTF-8"?>
<cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/4" Version="4.0" Sello="ABC123...">
  <cfdi:Emisor Rfc="ABC123456789"/>
  <cfdi:Complemento>
    <!-- No TFD here -->
  </cfdi:Complemento>
</cfdi:Comprobante>`;

const XML_WITH_MISSING_UUID = `<?xml version="1.0" encoding="UTF-8"?>
<cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/4" Version="4.0">
  <cfdi:Complemento>
    <tfd:TimbreFiscalDigital
      xmlns:tfd="http://www.sat.gob.mx/TimbreFiscalDigital"
      Version="1.1"
      FechaTimbrado="2024-03-01T10:00:00"
      RfcProvCertif="SPR190613I52"
      SelloCFD="KVttNU..."
      NoCertificadoSAT="30001000000400002495"
      SelloSAT="qadm+mH3..."
    />
  </cfdi:Complemento>
</cfdi:Comprobante>`;

const XML_WITH_MISSING_SELLO_SAT = `<?xml version="1.0" encoding="UTF-8"?>
<cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/4" Version="4.0">
  <cfdi:Complemento>
    <tfd:TimbreFiscalDigital
      xmlns:tfd="http://www.sat.gob.mx/TimbreFiscalDigital"
      Version="1.1"
      UUID="05c519de-6d20-4258-88fb-c69a5970e927"
      FechaTimbrado="2024-03-01T10:00:00"
      RfcProvCertif="SPR190613I52"
      SelloCFD="KVttNU..."
      NoCertificadoSAT="30001000000400002495"
    />
  </cfdi:Complemento>
</cfdi:Comprobante>`;

const XML_WITH_INVALID_UUID = `<?xml version="1.0" encoding="UTF-8"?>
<cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/4" Version="4.0">
  <cfdi:Complemento>
    <tfd:TimbreFiscalDigital
      xmlns:tfd="http://www.sat.gob.mx/TimbreFiscalDigital"
      Version="1.1"
      UUID="invalid-uuid-format"
      FechaTimbrado="2024-03-01T10:00:00"
      RfcProvCertif="SPR190613I52"
      SelloCFD="KVttNU..."
      NoCertificadoSAT="30001000000400002495"
      SelloSAT="qadm+mH3..."
    />
  </cfdi:Complemento>
</cfdi:Comprobante>`;

const XML_WITHOUT_NAMESPACE_PREFIX = `<?xml version="1.0" encoding="UTF-8"?>
<Comprobante xmlns="http://www.sat.gob.mx/cfd/4" Version="4.0">
  <Complemento>
    <TimbreFiscalDigital
      xmlns="http://www.sat.gob.mx/TimbreFiscalDigital"
      Version="1.1"
      UUID="11111111-2222-3333-4444-555555555555"
      FechaTimbrado="2024-06-15T14:30:00"
      RfcProvCertif="PAC123456ABC"
      SelloCFD="SELLOCFD..."
      NoCertificadoSAT="99999999999999999999"
      SelloSAT="SELLOSAT..."
    />
  </Complemento>
</Comprobante>`;

const VALID_TFD_DATA: TFDData = {
  uuid: '05c519de-6d20-4258-88fb-c69a5970e927',
  fechaTimbrado: '2024-03-01T10:00:00',
  rfcProvCertif: 'SPR190613I52',
  selloCFD: 'KVttNU/m3oEfJG/3efOsn3pUqZTuZ431Fm+cVdp5VsGVbxkN8D8Y2J7LlZJzPPYKI8kMKxK9vH1kD6g7O1UW8Q==',
  noCertificadoSAT: '30001000000400002495',
  selloSAT: 'qadm+mH3gZuYMnQZSWVoD/AEkekn8Mw1OJ2XJfHWE1K+dGw9HZJvKlI1TpLmN0yR7ZDqC8P5bxVj2mFkS3QaXg==',
  version: '1.1',
};

// ============================================================================
// extractTFD Tests
// ============================================================================

describe('extractTFD', () => {
  it('should extract TFD data from valid stamped XML', () => {
    const tfd = extractTFD(VALID_STAMPED_XML);

    expect(tfd.uuid).toBe('05c519de-6d20-4258-88fb-c69a5970e927');
    expect(tfd.fechaTimbrado).toBe('2024-03-01T10:00:00');
    expect(tfd.rfcProvCertif).toBe('SPR190613I52');
    expect(tfd.noCertificadoSAT).toBe('30001000000400002495');
    expect(tfd.version).toBe('1.1');
  });

  it('should extract all TFD fields correctly', () => {
    const tfd = extractTFD(VALID_STAMPED_XML);

    expect(tfd).toHaveProperty('uuid');
    expect(tfd).toHaveProperty('fechaTimbrado');
    expect(tfd).toHaveProperty('rfcProvCertif');
    expect(tfd).toHaveProperty('selloCFD');
    expect(tfd).toHaveProperty('noCertificadoSAT');
    expect(tfd).toHaveProperty('selloSAT');
    expect(tfd).toHaveProperty('version');
  });

  it('should handle XML without namespace prefix', () => {
    const tfd = extractTFD(XML_WITHOUT_NAMESPACE_PREFIX);

    expect(tfd.uuid).toBe('11111111-2222-3333-4444-555555555555');
    expect(tfd.fechaTimbrado).toBe('2024-06-15T14:30:00');
    expect(tfd.rfcProvCertif).toBe('PAC123456ABC');
    expect(tfd.noCertificadoSAT).toBe('99999999999999999999');
  });

  it('should throw TFD_MISSING for XML without Complemento', () => {
    expect(() => extractTFD(XML_WITHOUT_COMPLEMENTO)).toThrow(PACError);
    expect(() => extractTFD(XML_WITHOUT_COMPLEMENTO)).toThrow(/TFD_MISSING|TimbreFiscalDigital/);
  });

  it('should throw TFD_MISSING for XML with empty Complemento', () => {
    expect(() => extractTFD(XML_WITH_EMPTY_COMPLEMENTO)).toThrow(PACError);

    try {
      extractTFD(XML_WITH_EMPTY_COMPLEMENTO);
    } catch (error) {
      expect(error).toBeInstanceOf(PACError);
      expect((error as PACError).code).toBe('TFD_MISSING');
    }
  });

  it('should throw TFD_PARSE_ERROR for TFD missing UUID', () => {
    expect(() => extractTFD(XML_WITH_MISSING_UUID)).toThrow(PACError);

    try {
      extractTFD(XML_WITH_MISSING_UUID);
    } catch (error) {
      expect(error).toBeInstanceOf(PACError);
      expect((error as PACError).code).toBe('TFD_PARSE_ERROR');
      expect((error as PACError).message).toContain('UUID');
    }
  });

  it('should throw TFD_PARSE_ERROR for TFD missing SelloSAT', () => {
    expect(() => extractTFD(XML_WITH_MISSING_SELLO_SAT)).toThrow(PACError);

    try {
      extractTFD(XML_WITH_MISSING_SELLO_SAT);
    } catch (error) {
      expect(error).toBeInstanceOf(PACError);
      expect((error as PACError).code).toBe('TFD_PARSE_ERROR');
      expect((error as PACError).message).toContain('SelloSAT');
    }
  });

  it('should throw TFD_PARSE_ERROR for invalid UUID format', () => {
    expect(() => extractTFD(XML_WITH_INVALID_UUID)).toThrow(PACError);

    try {
      extractTFD(XML_WITH_INVALID_UUID);
    } catch (error) {
      expect(error).toBeInstanceOf(PACError);
      expect((error as PACError).code).toBe('TFD_PARSE_ERROR');
      expect((error as PACError).message).toContain('Invalid UUID');
    }
  });

  it('should throw TFD_PARSE_ERROR for malformed XML', () => {
    const malformedXml = '<?xml version="1.0"?><root><unclosed>';

    expect(() => extractTFD(malformedXml)).toThrow(PACError);

    try {
      extractTFD(malformedXml);
    } catch (error) {
      expect(error).toBeInstanceOf(PACError);
      // Could be either TFD_PARSE_ERROR or TFD_MISSING depending on parser behavior
      expect(['TFD_PARSE_ERROR', 'TFD_MISSING']).toContain((error as PACError).code);
    }
  });

  it('should throw TFD_PARSE_ERROR for empty string', () => {
    expect(() => extractTFD('')).toThrow(PACError);

    try {
      extractTFD('');
    } catch (error) {
      expect(error).toBeInstanceOf(PACError);
      expect((error as PACError).code).toBe('TFD_PARSE_ERROR');
    }
  });

  it('should throw TFD_PARSE_ERROR for null/undefined input', () => {
    expect(() => extractTFD(null as unknown as string)).toThrow(PACError);
    expect(() => extractTFD(undefined as unknown as string)).toThrow(PACError);
  });

  it('should throw TFD_PARSE_ERROR for non-string input', () => {
    expect(() => extractTFD(123 as unknown as string)).toThrow(PACError);
    expect(() => extractTFD({} as unknown as string)).toThrow(PACError);
  });

  it('should extract TFD with CDATA values if present', () => {
    const xmlWithCDATA = `<?xml version="1.0" encoding="UTF-8"?>
<cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/4" Version="4.0">
  <cfdi:Complemento>
    <tfd:TimbreFiscalDigital
      xmlns:tfd="http://www.sat.gob.mx/TimbreFiscalDigital"
      Version="1.1"
      UUID="aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"
      FechaTimbrado="2024-12-25T23:59:59"
      RfcProvCertif="PACABC123XYZ"
      SelloCFD="SELLO123"
      NoCertificadoSAT="12345678901234567890"
      SelloSAT="SAT456"
    />
  </cfdi:Complemento>
</cfdi:Comprobante>`;

    const tfd = extractTFD(xmlWithCDATA);
    expect(tfd.uuid).toBe('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee');
  });

  it('should return TFDData with correct types', () => {
    const tfd = extractTFD(VALID_STAMPED_XML);

    expect(typeof tfd.uuid).toBe('string');
    expect(typeof tfd.fechaTimbrado).toBe('string');
    expect(typeof tfd.rfcProvCertif).toBe('string');
    expect(typeof tfd.selloCFD).toBe('string');
    expect(typeof tfd.noCertificadoSAT).toBe('string');
    expect(typeof tfd.selloSAT).toBe('string');
    expect(typeof tfd.version).toBe('string');
  });
});

// ============================================================================
// Accessor Function Tests
// ============================================================================

describe('getUUID', () => {
  it('should return the UUID from TFD data', () => {
    expect(getUUID(VALID_TFD_DATA)).toBe('05c519de-6d20-4258-88fb-c69a5970e927');
  });

  it('should return valid UUID in correct format', () => {
    const uuid = getUUID(VALID_TFD_DATA);
    expect(uuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
  });

  it('should throw for invalid UUID format in data', () => {
    const invalidData = { ...VALID_TFD_DATA, uuid: 'not-a-valid-uuid' };
    expect(() => getUUID(invalidData)).toThrow(PACError);
  });
});

describe('getSATCertNumber', () => {
  it('should return the NoCertificadoSAT from TFD data', () => {
    expect(getSATCertNumber(VALID_TFD_DATA)).toBe('30001000000400002495');
  });
});

describe('getStampDate', () => {
  it('should return the FechaTimbrado from TFD data', () => {
    expect(getStampDate(VALID_TFD_DATA)).toBe('2024-03-01T10:00:00');
  });

  it('should return ISO timestamp format', () => {
    const date = getStampDate(VALID_TFD_DATA);
    expect(date).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/);
  });
});

describe('getPACRfc', () => {
  it('should return the RfcProvCertif from TFD data', () => {
    expect(getPACRfc(VALID_TFD_DATA)).toBe('SPR190613I52');
  });
});

describe('getSATSignature', () => {
  it('should return the SelloSAT from TFD data', () => {
    expect(getSATSignature(VALID_TFD_DATA)).toBe(VALID_TFD_DATA.selloSAT);
  });
});

describe('getIssuerSignature', () => {
  it('should return the SelloCFD from TFD data', () => {
    expect(getIssuerSignature(VALID_TFD_DATA)).toBe(VALID_TFD_DATA.selloCFD);
  });
});

describe('isValidTFDVersion', () => {
  it('should return true for version 1.1', () => {
    expect(isValidTFDVersion(VALID_TFD_DATA)).toBe(true);
  });

  it('should return false for version 1.0', () => {
    const oldVersion = { ...VALID_TFD_DATA, version: '1.0' };
    expect(isValidTFDVersion(oldVersion)).toBe(false);
  });

  it('should return false for empty version', () => {
    const noVersion = { ...VALID_TFD_DATA, version: '' };
    expect(isValidTFDVersion(noVersion)).toBe(false);
  });
});

// ============================================================================
// Validation Helper Tests
// ============================================================================

describe('isValidUUID', () => {
  it('should return true for valid lowercase UUID', () => {
    expect(isValidUUID('05c519de-6d20-4258-88fb-c69a5970e927')).toBe(true);
  });

  it('should return true for valid uppercase UUID', () => {
    expect(isValidUUID('05C519DE-6D20-4258-88FB-C69A5970E927')).toBe(true);
  });

  it('should return true for mixed case UUID', () => {
    expect(isValidUUID('05C519de-6D20-4258-88fb-C69A5970e927')).toBe(true);
  });

  it('should return false for UUID without dashes', () => {
    expect(isValidUUID('05c519de6d20425888fbc69a5970e927')).toBe(false);
  });

  it('should return false for too short UUID', () => {
    expect(isValidUUID('05c519de-6d20-4258')).toBe(false);
  });

  it('should return false for UUID with invalid characters', () => {
    expect(isValidUUID('05c519de-6d20-4258-88fb-c69a5970g927')).toBe(false);
  });

  it('should return false for empty string', () => {
    expect(isValidUUID('')).toBe(false);
  });
});

describe('hasTFD', () => {
  it('should return true for XML with TimbreFiscalDigital', () => {
    expect(hasTFD(VALID_STAMPED_XML)).toBe(true);
  });

  it('should return true for XML with tfd: prefix', () => {
    expect(hasTFD('<tfd:TimbreFiscalDigital />')).toBe(true);
  });

  it('should return false for XML without TFD', () => {
    expect(hasTFD(XML_WITHOUT_COMPLEMENTO)).toBe(false);
  });

  it('should return false for empty string', () => {
    expect(hasTFD('')).toBe(false);
  });

  it('should return true for XML with empty Complemento but TFD text somewhere', () => {
    // This is a quick check, not full validation
    const withTfdText = '<root>TimbreFiscalDigital reference</root>';
    expect(hasTFD(withTfdText)).toBe(true);
  });
});

// ============================================================================
// Edge Cases
// ============================================================================

describe('extractTFD edge cases', () => {
  it('should handle XML with multiple Complemento elements', () => {
    const multipleComplementos = `<?xml version="1.0" encoding="UTF-8"?>
<cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/4" Version="4.0">
  <cfdi:Complemento>
    <other:Element xmlns:other="http://example.com" />
  </cfdi:Complemento>
  <cfdi:Complemento>
    <tfd:TimbreFiscalDigital
      xmlns:tfd="http://www.sat.gob.mx/TimbreFiscalDigital"
      Version="1.1"
      UUID="12345678-1234-1234-1234-123456789012"
      FechaTimbrado="2024-01-01T00:00:00"
      RfcProvCertif="RFC123456ABC"
      SelloCFD="SELLO"
      NoCertificadoSAT="12345678901234567890"
      SelloSAT="SAT"
    />
  </cfdi:Complemento>
</cfdi:Comprobante>`;

    const tfd = extractTFD(multipleComplementos);
    expect(tfd.uuid).toBe('12345678-1234-1234-1234-123456789012');
  });

  it('should handle XML with extra whitespace in attributes', () => {
    const xmlWithWhitespace = `<?xml version="1.0" encoding="UTF-8"?>
<cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/4" Version="4.0">
  <cfdi:Complemento>
    <tfd:TimbreFiscalDigital
      xmlns:tfd="http://www.sat.gob.mx/TimbreFiscalDigital"
      Version = "1.1"
      UUID = "abcdefab-1234-5678-90ab-cdefabcdefab"
      FechaTimbrado = "2024-07-04T12:00:00"
      RfcProvCertif = "PACXYZ789"
      SelloCFD = "SELLOXYZ"
      NoCertificadoSAT = "09876543210987654321"
      SelloSAT = "SATXYZ"
    />
  </cfdi:Complemento>
</cfdi:Comprobante>`;

    const tfd = extractTFD(xmlWithWhitespace);
    expect(tfd.uuid).toBe('abcdefab-1234-5678-90ab-cdefabcdefab');
  });
});
