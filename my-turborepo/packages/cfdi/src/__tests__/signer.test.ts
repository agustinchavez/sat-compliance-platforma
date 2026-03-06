/**
 * Tests for Signer Module (Component 14 - Step 4)
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  signCFDI,
  injectSignatureIntoXML,
  verifyCFDISignature,
  type SignCFDIInput,
  type SignCFDIResult,
} from '../signer';
import { CSDError } from '../errors';

// ============================================
// TEST FIXTURES
// ============================================

const CERTS_DIR = path.join(__dirname, 'fixtures/certs');
const TEST_KEY_BUFFER = fs.readFileSync(path.join(CERTS_DIR, 'AAA010101AAA_CSD_01.key'));
const TEST_CER_BUFFER = fs.readFileSync(path.join(CERTS_DIR, 'AAA010101AAA_CSD_01.cer'));

const TEST_PASSWORD = '12345678a';
const EXPECTED_RFC = 'AAA010101AAA';
const EXPECTED_NO_CERTIFICADO = '30001000000300023708';

// Sample cadena original (realistic CFDI format)
const SAMPLE_CADENA = '||4.0|A|00001|2024-03-01T10:00:00|01|10000.00|MXN|11600.00|I|01|PUE|06600|AAA010101AAA|ACCEM SERVICIOS EMPRESARIALES SC|601|URE180429TM6|UNIVERSIDAD ROBOTICA ESPAÑOLA SA DE CV|601|G01|65000||';

// Base valid input for tests
const createValidInput = (): SignCFDIInput => ({
  cadenaOriginal: SAMPLE_CADENA,
  cerBuffer: TEST_CER_BUFFER,
  keyBuffer: TEST_KEY_BUFFER,
  password: TEST_PASSWORD,
  issuerRfc: EXPECTED_RFC,
  skipExpirationCheck: true, // Test cert is expired
});

// Sample unsigned XML with placeholders
const UNSIGNED_XML = `<?xml version="1.0" encoding="UTF-8"?>
<cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/4" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" Version="4.0"
  Serie="A" Folio="00001" Fecha="2024-03-01T10:00:00"
  Sello="" NoCertificado="" Certificado=""
  SubTotal="10000.00" Total="11600.00" Moneda="MXN" TipoDeComprobante="I"
  MetodoPago="PUE" LugarExpedicion="06600" Exportacion="01">
  <cfdi:Emisor Rfc="AAA010101AAA" Nombre="ACCEM SERVICIOS EMPRESARIALES SC" RegimenFiscal="601"/>
  <cfdi:Receptor Rfc="URE180429TM6" Nombre="UNIVERSIDAD ROBOTICA ESPAÑOLA SA DE CV" UsoCFDI="G01"
    DomicilioFiscalReceptor="65000" RegimenFiscalReceptor="601"/>
  <cfdi:Conceptos>
    <cfdi:Concepto ClaveProdServ="01010101" Cantidad="1" ClaveUnidad="H87"
      Descripcion="Test product" ValorUnitario="10000.00" Importe="10000.00" ObjetoImp="02"/>
  </cfdi:Conceptos>
</cfdi:Comprobante>`;

// ============================================
// signCFDI TESTS
// ============================================

describe('signCFDI', () => {
  it('returns sello, noCertificado, and certificado', async () => {
    const input = createValidInput();
    const result = await signCFDI(input);

    expect(result.sello).toBeTruthy();
    expect(result.noCertificado).toBe(EXPECTED_NO_CERTIFICADO);
    expect(result.certificado).toBeTruthy();
  });

  it('sello is valid base64 and correct length for RSA-2048', async () => {
    const input = createValidInput();
    const result = await signCFDI(input);

    expect(result.sello).toMatch(/^[A-Za-z0-9+/]+=*$/);
    expect(result.sello.length).toBe(344);
  });

  it('sello can be verified against the certificate', async () => {
    const input = createValidInput();
    const result = await signCFDI(input);

    const isValid = verifyCFDISignature(
      input.cadenaOriginal,
      result.sello,
      input.cerBuffer,
    );
    expect(isValid).toBe(true);
  });

  it('certificado decodes back to original DER bytes', async () => {
    const input = createValidInput();
    const result = await signCFDI(input);

    const decoded = Buffer.from(result.certificado, 'base64');
    expect(decoded).toEqual(TEST_CER_BUFFER);
  });

  it('certInfo contains correct RFC', async () => {
    const input = createValidInput();
    const result = await signCFDI(input);

    expect(result.certInfo.rfc).toBe(EXPECTED_RFC);
  });

  it('certInfo contains correct NoCertificado', async () => {
    const input = createValidInput();
    const result = await signCFDI(input);

    expect(result.certInfo.noCertificado).toBe(EXPECTED_NO_CERTIFICADO);
  });

  it('certInfo contains validity dates', async () => {
    const input = createValidInput();
    const result = await signCFDI(input);

    expect(result.certInfo.validFrom).toBeInstanceOf(Date);
    expect(result.certInfo.validTo).toBeInstanceOf(Date);
  });

  it('certInfo contains issuer and keyAlgorithm', async () => {
    const input = createValidInput();
    const result = await signCFDI(input);

    expect(result.certInfo.issuer).toBeDefined();
    expect(result.certInfo.keyAlgorithm).toBe('RSA-2048');
  });

  it('throws CSDError with CSD_WRONG_PASSWORD for bad password', async () => {
    const input = { ...createValidInput(), password: 'wrongpassword' };

    await expect(signCFDI(input)).rejects.toThrow(CSDError);
    await expect(signCFDI(input)).rejects.toThrow(
      expect.objectContaining({ code: 'CSD_WRONG_PASSWORD' }),
    );
  });

  it('throws CSDError with CSD_RFC_MISMATCH when issuerRfc does not match cert', async () => {
    const input = { ...createValidInput(), issuerRfc: 'XAXX010101000' };

    await expect(signCFDI(input)).rejects.toThrow(CSDError);
    await expect(signCFDI(input)).rejects.toThrow(
      expect.objectContaining({ code: 'CSD_RFC_MISMATCH' }),
    );
  });

  it('throws CSDError with CSD_CERT_EXPIRED for expired cert without skip flag', async () => {
    const input = { ...createValidInput(), skipExpirationCheck: false };

    await expect(signCFDI(input)).rejects.toThrow(CSDError);
    await expect(signCFDI(input)).rejects.toThrow(
      expect.objectContaining({ code: 'CSD_CERT_EXPIRED' }),
    );
  });

  it('throws CSDError with CSD_KEY_LOAD_ERROR for invalid key buffer', async () => {
    const input = { ...createValidInput(), keyBuffer: Buffer.from('not a key') };

    await expect(signCFDI(input)).rejects.toThrow(CSDError);
    await expect(signCFDI(input)).rejects.toThrow(
      expect.objectContaining({ code: 'CSD_KEY_LOAD_ERROR' }),
    );
  });

  it('throws CSDError with CSD_CERT_LOAD_ERROR for invalid cert buffer', async () => {
    const input = { ...createValidInput(), cerBuffer: Buffer.from('not a cert') };

    await expect(signCFDI(input)).rejects.toThrow(CSDError);
    await expect(signCFDI(input)).rejects.toThrow(
      expect.objectContaining({ code: 'CSD_CERT_LOAD_ERROR' }),
    );
  });

  it('works without issuerRfc (skips RFC validation)', async () => {
    const input = { ...createValidInput() };
    delete input.issuerRfc;

    const result = await signCFDI(input);
    expect(result.sello).toBeTruthy();
  });

  it('produces deterministic signatures (same cadena = same sello)', async () => {
    const input = createValidInput();

    const result1 = await signCFDI(input);
    const result2 = await signCFDI(input);

    expect(result1.sello).toBe(result2.sello);
  });

  it('produces different signatures for different cadenas', async () => {
    const input1 = createValidInput();
    const input2 = { ...createValidInput(), cadenaOriginal: '||different||' };

    const result1 = await signCFDI(input1);
    const result2 = await signCFDI(input2);

    expect(result1.sello).not.toBe(result2.sello);
  });
});

// ============================================
// injectSignatureIntoXML TESTS
// ============================================

describe('injectSignatureIntoXML', () => {
  const signResult: SignCFDIResult = {
    sello: 'TEST_SELLO_BASE64_VALUE==',
    noCertificado: '30001000000300023708',
    certificado: 'TEST_CERT_BASE64_VALUE==',
    certInfo: {
      rfc: 'AAA010101AAA',
      nombre: 'ACCEM SERVICIOS EMPRESARIALES SC',
      noCertificado: '30001000000300023708',
      validFrom: new Date('2017-05-18'),
      validTo: new Date('2021-05-18'),
      issuer: 'A.C. 2 de pruebas',
      keyAlgorithm: 'RSA-2048',
    },
  };

  it('injects Sello into unsigned XML', () => {
    const signed = injectSignatureIntoXML(UNSIGNED_XML, signResult);
    expect(signed).toContain('Sello="TEST_SELLO_BASE64_VALUE=="');
    expect(signed).not.toContain('Sello=""');
  });

  it('injects NoCertificado into unsigned XML', () => {
    const signed = injectSignatureIntoXML(UNSIGNED_XML, signResult);
    expect(signed).toContain('NoCertificado="30001000000300023708"');
    expect(signed).not.toContain('NoCertificado=""');
  });

  it('injects Certificado into unsigned XML', () => {
    const signed = injectSignatureIntoXML(UNSIGNED_XML, signResult);
    expect(signed).toContain('Certificado="TEST_CERT_BASE64_VALUE=="');
    expect(signed).not.toContain('Certificado=""');
  });

  it('preserves all other XML content unchanged', () => {
    const signed = injectSignatureIntoXML(UNSIGNED_XML, signResult);

    // Check key XML elements are preserved
    expect(signed).toContain('xmlns:cfdi="http://www.sat.gob.mx/cfd/4"');
    expect(signed).toContain('Version="4.0"');
    expect(signed).toContain('Serie="A"');
    expect(signed).toContain('Folio="00001"');
    expect(signed).toContain('Rfc="AAA010101AAA"');
    expect(signed).toContain('Rfc="URE180429TM6"');
    expect(signed).toContain('ClaveProdServ="01010101"');
  });

  it('throws CSD_XML_PLACEHOLDER_NOT_FOUND if Sello placeholder is missing', () => {
    const alreadySigned = UNSIGNED_XML.replace('Sello=""', 'Sello="EXISTING"');

    expect(() => injectSignatureIntoXML(alreadySigned, signResult)).toThrow(CSDError);
    expect(() => injectSignatureIntoXML(alreadySigned, signResult)).toThrow(
      expect.objectContaining({ code: 'CSD_XML_PLACEHOLDER_NOT_FOUND' }),
    );
  });

  it('throws CSD_XML_PLACEHOLDER_NOT_FOUND if NoCertificado placeholder is missing', () => {
    const modified = UNSIGNED_XML.replace('NoCertificado=""', 'NoCertificado="EXISTING"');

    expect(() => injectSignatureIntoXML(modified, signResult)).toThrow(
      expect.objectContaining({ code: 'CSD_XML_PLACEHOLDER_NOT_FOUND' }),
    );
  });

  it('throws CSD_XML_PLACEHOLDER_NOT_FOUND if Certificado placeholder is missing', () => {
    const modified = UNSIGNED_XML.replace('Certificado=""', 'Certificado="EXISTING"');

    expect(() => injectSignatureIntoXML(modified, signResult)).toThrow(
      expect.objectContaining({ code: 'CSD_XML_PLACEHOLDER_NOT_FOUND' }),
    );
  });

  it('error includes details about missing placeholder', () => {
    const modified = UNSIGNED_XML.replace('Sello=""', 'Sello="EXISTING"');

    try {
      injectSignatureIntoXML(modified, signResult);
    } catch (e) {
      expect((e as CSDError).details).toEqual({ missingPlaceholder: 'Sello=""' });
    }
  });
});

// ============================================
// verifyCFDISignature TESTS
// ============================================

describe('verifyCFDISignature', () => {
  it('returns true for valid signature', async () => {
    const input = createValidInput();
    const result = await signCFDI(input);

    const isValid = verifyCFDISignature(
      input.cadenaOriginal,
      result.sello,
      input.cerBuffer,
    );
    expect(isValid).toBe(true);
  });

  it('returns false for tampered cadena', async () => {
    const input = createValidInput();
    const result = await signCFDI(input);

    const tamperedCadena = input.cadenaOriginal.replace('10000', '99999');
    const isValid = verifyCFDISignature(
      tamperedCadena,
      result.sello,
      input.cerBuffer,
    );
    expect(isValid).toBe(false);
  });

  it('returns false for invalid sello', () => {
    const input = createValidInput();
    const isValid = verifyCFDISignature(
      input.cadenaOriginal,
      'INVALID_SELLO_VALUE',
      input.cerBuffer,
    );
    expect(isValid).toBe(false);
  });

  it('returns false for invalid certificate buffer', () => {
    const input = createValidInput();
    const isValid = verifyCFDISignature(
      input.cadenaOriginal,
      'SOMESELLO',
      Buffer.from('not a cert'),
    );
    expect(isValid).toBe(false);
  });

  it('returns false (not throws) for any error', () => {
    // Should not throw, just return false
    expect(verifyCFDISignature('', '', Buffer.alloc(0))).toBe(false);
  });
});

// ============================================
// INTEGRATION TESTS
// ============================================

describe('integration: sign and inject', () => {
  it('full signing flow produces valid signed XML', async () => {
    const input = createValidInput();
    const signResult = await signCFDI(input);
    const signedXml = injectSignatureIntoXML(UNSIGNED_XML, signResult);

    // Verify the XML has the signature values
    expect(signedXml).toContain(`Sello="${signResult.sello}"`);
    expect(signedXml).toContain(`NoCertificado="${signResult.noCertificado}"`);
    expect(signedXml).toContain(`Certificado="${signResult.certificado}"`);

    // Verify the signature is valid (using a simple cadena - real one would come from XSLT)
    const isValid = verifyCFDISignature(
      input.cadenaOriginal,
      signResult.sello,
      input.cerBuffer,
    );
    expect(isValid).toBe(true);
  });

  it('NoCertificado in result matches expected SAT format', async () => {
    const input = createValidInput();
    const result = await signCFDI(input);

    // NoCertificado should be exactly 20 digits
    expect(result.noCertificado).toMatch(/^\d{20}$/);
    expect(result.noCertificado).toBe(EXPECTED_NO_CERTIFICADO);
  });

  it('Certificado in result is valid base64 of the DER cert', async () => {
    const input = createValidInput();
    const result = await signCFDI(input);

    // Decode and compare
    const decoded = Buffer.from(result.certificado, 'base64');
    expect(decoded).toEqual(TEST_CER_BUFFER);
  });
});

// ============================================
// EDGE CASES
// ============================================

describe('edge cases', () => {
  it('handles empty cadena original', async () => {
    const input = { ...createValidInput(), cadenaOriginal: '' };
    const result = await signCFDI(input);

    expect(result.sello).toBeTruthy();
    expect(result.sello.length).toBe(344);
  });

  it('handles cadena with special characters', async () => {
    const input = {
      ...createValidInput(),
      cadenaOriginal: '||México|Año|€uro|日本語|Ñoño||',
    };
    const result = await signCFDI(input);

    const isValid = verifyCFDISignature(
      input.cadenaOriginal,
      result.sello,
      input.cerBuffer,
    );
    expect(isValid).toBe(true);
  });

  it('handles very long cadena', async () => {
    const input = {
      ...createValidInput(),
      cadenaOriginal: '||' + 'x'.repeat(50000) + '||',
    };
    const result = await signCFDI(input);

    expect(result.sello.length).toBe(344); // Same length regardless of input
  });

  it('error includes all validation errors in details', async () => {
    // Expired cert + wrong RFC
    const input = {
      ...createValidInput(),
      issuerRfc: 'WRONGRFC123',
      skipExpirationCheck: false,
    };

    try {
      await signCFDI(input);
    } catch (e) {
      const error = e as CSDError;
      expect(error.details).toHaveProperty('allErrors');
      expect((error.details as { allErrors: unknown[] }).allErrors.length).toBeGreaterThanOrEqual(2);
    }
  });
});
