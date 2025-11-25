import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  parseCFDI,
  extractUUID,
  validateCFDIStructure,
  cfdiToJSON,
  getCFDISummary,
} from '../cfdi-parser';
import type { ParsedCFDI, CFDIVersion, TipoComprobante } from '../types';

// Sample CFDI 4.0 XML for testing
const SAMPLE_CFDI_40 = `<?xml version="1.0" encoding="UTF-8"?>
<cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/4"
  xmlns:tfd="http://www.sat.gob.mx/TimbreFiscalDigital"
  Version="4.0"
  Serie="A"
  Folio="12345"
  Fecha="2024-11-19T10:30:00"
  SubTotal="10000.00"
  Descuento="500.00"
  Total="11040.00"
  TipoDeComprobante="I"
  MetodoPago="PUE"
  FormaPago="03"
  LugarExpedicion="06600"
  Moneda="MXN"
  TipoCambio="1">

  <cfdi:Emisor
    Rfc="ABC120101ABC"
    Nombre="ACME Corporation S.A. de C.V."
    RegimenFiscal="601"/>

  <cfdi:Receptor
    Rfc="XYZ987654XYZ"
    Nombre="Cliente S.A. de C.V."
    UsoCFDI="G03"
    RegimenFiscalReceptor="601"
    DomicilioFiscalReceptor="06600"/>

  <cfdi:Conceptos>
    <cfdi:Concepto
      ClaveProdServ="01010101"
      Cantidad="1"
      ClaveUnidad="H87"
      Unidad="Pieza"
      Descripcion="Servicio profesional de consultoría"
      ValorUnitario="10000.00"
      Importe="10000.00"
      Descuento="500.00"
      ObjetoImp="02">
      <cfdi:Impuestos>
        <cfdi:Traslados>
          <cfdi:Traslado Base="9500.00" Impuesto="002" TipoFactor="Tasa" TasaOCuota="0.160000" Importe="1520.00"/>
        </cfdi:Traslados>
      </cfdi:Impuestos>
    </cfdi:Concepto>
  </cfdi:Conceptos>

  <cfdi:Impuestos TotalImpuestosTrasladados="1540.00">
    <cfdi:Traslados>
      <cfdi:Traslado Base="9500.00" Impuesto="002" TipoFactor="Tasa" TasaOCuota="0.160000" Importe="1540.00"/>
    </cfdi:Traslados>
  </cfdi:Impuestos>

  <cfdi:Complemento>
    <tfd:TimbreFiscalDigital
      Version="1.1"
      UUID="A1B2C3D4-E5F6-7890-ABCD-EF1234567890"
      FechaTimbrado="2024-11-19T10:31:00"
      RfcProvCertif="SAT970701NN3"
      SelloCFD="abc123..."
      NoCertificadoSAT="00001000000504465028"
      SelloSAT="xyz789..."/>
  </cfdi:Complemento>
</cfdi:Comprobante>`;

// Sample CFDI 3.3 XML for testing
const SAMPLE_CFDI_33 = `<?xml version="1.0" encoding="UTF-8"?>
<cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/3"
  Version="3.3"
  Fecha="2024-01-15T14:00:00"
  SubTotal="5000.00"
  Total="5800.00"
  TipoDeComprobante="I"
  LugarExpedicion="01000"
  Moneda="MXN">

  <cfdi:Emisor Rfc="DEF654321DEF" Nombre="Empresa Prueba" RegimenFiscal="612"/>
  <cfdi:Receptor Rfc="GHI123456GHI" Nombre="Receptor Prueba" UsoCFDI="G01"/>

  <cfdi:Conceptos>
    <cfdi:Concepto
      ClaveProdServ="84111506"
      Cantidad="10"
      ClaveUnidad="E48"
      Descripcion="Productos de prueba"
      ValorUnitario="500.00"
      Importe="5000.00"/>
  </cfdi:Conceptos>

  <cfdi:Impuestos TotalImpuestosTrasladados="800.00">
    <cfdi:Traslados>
      <cfdi:Traslado Impuesto="002" TipoFactor="Tasa" TasaOCuota="0.160000" Importe="800.00"/>
    </cfdi:Traslados>
  </cfdi:Impuestos>

  <cfdi:Complemento>
    <tfd:TimbreFiscalDigital xmlns:tfd="http://www.sat.gob.mx/TimbreFiscalDigital"
      Version="1.1"
      UUID="11111111-2222-3333-4444-555555555555"
      FechaTimbrado="2024-01-15T14:05:00"
      RfcProvCertif="SAT970701NN3"
      SelloCFD="sello..."
      NoCertificadoSAT="00001000000504465028"
      SelloSAT="sellosat..."/>
  </cfdi:Complemento>
</cfdi:Comprobante>`;

// Invalid XML samples for testing error handling
const INVALID_XML_NO_COMPROBANTE = `<?xml version="1.0"?><root><data>test</data></root>`;
const INVALID_XML_NO_EMISOR = `<?xml version="1.0"?>
<cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/4" Version="4.0" Fecha="2024-01-01T00:00:00" Total="100" TipoDeComprobante="I" LugarExpedicion="06600">
  <cfdi:Receptor Rfc="XYZ123456XYZ" Nombre="Test" UsoCFDI="G03"/>
</cfdi:Comprobante>`;

describe('CFDI Parser Service', () => {
  describe('parseCFDI', () => {
    describe('CFDI 4.0 Parsing', () => {
      it('should parse CFDI 4.0 XML correctly', async () => {
        const cfdi = await parseCFDI(SAMPLE_CFDI_40);

        expect(cfdi.version).toBe('4.0');
        expect(cfdi.uuid).toBe('A1B2C3D4-E5F6-7890-ABCD-EF1234567890');
        expect(cfdi.serie).toBe('A');
        // Folio may be parsed as number or string depending on parser config
        expect(String(cfdi.folio)).toBe('12345');
      });

      it('should parse emisor correctly', async () => {
        const cfdi = await parseCFDI(SAMPLE_CFDI_40);

        expect(cfdi.emisor.rfc).toBe('ABC120101ABC');
        expect(cfdi.emisor.nombre).toBe('ACME Corporation S.A. de C.V.');
        // regimenFiscal may be parsed as number
        expect(String(cfdi.emisor.regimenFiscal)).toBe('601');
      });

      it('should parse receptor correctly', async () => {
        const cfdi = await parseCFDI(SAMPLE_CFDI_40);

        expect(cfdi.receptor.rfc).toBe('XYZ987654XYZ');
        expect(cfdi.receptor.nombre).toBe('Cliente S.A. de C.V.');
        expect(cfdi.receptor.usoCFDI).toBe('G03');
        // These may be parsed as numbers
        expect(String(cfdi.receptor.regimenFiscalReceptor)).toBe('601');
        expect(String(cfdi.receptor.domicilioFiscalReceptor)).toBe('06600');
      });

      it('should parse monetary values correctly', async () => {
        const cfdi = await parseCFDI(SAMPLE_CFDI_40);

        expect(cfdi.subTotal).toBe(10000);
        expect(cfdi.descuento).toBe(500);
        expect(cfdi.total).toBe(11040);
        expect(cfdi.moneda).toBe('MXN');
        expect(cfdi.tipoCambio).toBe(1);
      });

      it('should parse conceptos correctly', async () => {
        const cfdi = await parseCFDI(SAMPLE_CFDI_40);

        expect(cfdi.conceptos).toHaveLength(1);
        expect(cfdi.conceptos[0].claveProdServ).toBe('01010101');
        expect(cfdi.conceptos[0].cantidad).toBe(1);
        expect(cfdi.conceptos[0].claveUnidad).toBe('H87');
        expect(cfdi.conceptos[0].descripcion).toBe('Servicio profesional de consultoría');
        expect(cfdi.conceptos[0].valorUnitario).toBe(10000);
        expect(cfdi.conceptos[0].importe).toBe(10000);
      });

      it('should parse impuestos correctly', async () => {
        const cfdi = await parseCFDI(SAMPLE_CFDI_40);

        expect(cfdi.impuestos).toBeDefined();
        expect(cfdi.impuestos?.totalImpuestosTrasladados).toBe(1540);
        expect(cfdi.impuestos?.traslados).toHaveLength(1);
      });

      it('should parse timbre fiscal correctly', async () => {
        const cfdi = await parseCFDI(SAMPLE_CFDI_40);

        expect(cfdi.timbreFiscal).toBeDefined();
        // Version may be parsed as number
        expect(String(cfdi.timbreFiscal.version)).toBe('1.1');
        expect(cfdi.timbreFiscal.uuid).toBe('A1B2C3D4-E5F6-7890-ABCD-EF1234567890');
        expect(cfdi.timbreFiscal.rfcProvCertif).toBe('SAT970701NN3');
        expect(cfdi.timbreFiscal.fechaTimbrado).toBeInstanceOf(Date);
      });

      it('should parse tipo de comprobante', async () => {
        const cfdi = await parseCFDI(SAMPLE_CFDI_40);

        expect(cfdi.tipoComprobante).toBe('I');
      });

      it('should parse payment info', async () => {
        const cfdi = await parseCFDI(SAMPLE_CFDI_40);

        expect(cfdi.metodoPago).toBe('PUE');
        expect(cfdi.formaPago).toBe('03');
        expect(cfdi.lugarExpedicion).toBe('06600');
      });

      it('should preserve original XML', async () => {
        const cfdi = await parseCFDI(SAMPLE_CFDI_40);

        expect(cfdi.xmlOriginal).toBe(SAMPLE_CFDI_40);
      });
    });

    describe('CFDI 3.3 Parsing', () => {
      it('should parse CFDI 3.3 XML correctly', async () => {
        const cfdi = await parseCFDI(SAMPLE_CFDI_33);

        // CFDI 3.3 should be parsed (version may be read from Version attr or namespace)
        expect(cfdi).toBeDefined();
        expect(cfdi.uuid).toBe('11111111-2222-3333-4444-555555555555');
      });

      it('should handle CFDI 3.3 with different structure', async () => {
        const cfdi = await parseCFDI(SAMPLE_CFDI_33);

        expect(cfdi.emisor.rfc).toBe('DEF654321DEF');
        expect(cfdi.receptor.rfc).toBe('GHI123456GHI');
        expect(cfdi.total).toBe(5800);
      });
    });

    describe('Error Handling', () => {
      it('should throw error for invalid XML', async () => {
        await expect(parseCFDI('not valid xml <>')).rejects.toThrow();
      });

      it('should throw error for XML without Comprobante', async () => {
        await expect(parseCFDI(INVALID_XML_NO_COMPROBANTE)).rejects.toThrow();
      });

      it('should throw error for empty XML', async () => {
        await expect(parseCFDI('')).rejects.toThrow();
      });
    });

    describe('Date Parsing', () => {
      it('should parse fecha correctly', async () => {
        const cfdi = await parseCFDI(SAMPLE_CFDI_40);

        expect(cfdi.fecha).toBeInstanceOf(Date);
        expect(cfdi.fecha.getFullYear()).toBe(2024);
        expect(cfdi.fecha.getMonth()).toBe(10); // November (0-indexed)
        expect(cfdi.fecha.getDate()).toBe(19);
      });
    });
  });

  describe('extractUUID', () => {
    it('should extract UUID from CFDI 4.0', () => {
      const uuid = extractUUID(SAMPLE_CFDI_40);

      expect(uuid).toBe('A1B2C3D4-E5F6-7890-ABCD-EF1234567890');
    });

    it('should extract UUID from CFDI 3.3', () => {
      const uuid = extractUUID(SAMPLE_CFDI_33);

      expect(uuid).toBe('11111111-2222-3333-4444-555555555555');
    });

    it('should return null for XML without UUID', () => {
      const uuid = extractUUID('<root><data>no uuid here</data></root>');

      expect(uuid).toBeNull();
    });

    it('should handle empty string', () => {
      const uuid = extractUUID('');

      expect(uuid).toBeNull();
    });

    it('should normalize UUID to uppercase', () => {
      const xmlWithLowercaseUUID = SAMPLE_CFDI_40.replace(
        'UUID="A1B2C3D4-E5F6-7890-ABCD-EF1234567890"',
        'UUID="a1b2c3d4-e5f6-7890-abcd-ef1234567890"'
      );
      const uuid = extractUUID(xmlWithLowercaseUUID);

      expect(uuid).toBe('A1B2C3D4-E5F6-7890-ABCD-EF1234567890');
    });
  });

  describe('validateCFDIStructure', () => {
    it('should validate complete CFDI 4.0', () => {
      const result = validateCFDIStructure(SAMPLE_CFDI_40);

      expect(result.isValid).toBe(true);
      expect(result.version).toBe('4.0');
      expect(result.hasTimbre).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should validate complete CFDI 3.3', () => {
      const result = validateCFDIStructure(SAMPLE_CFDI_33);

      expect(result.isValid).toBe(true);
      expect(result.version).toBe('3.3');
      expect(result.hasTimbre).toBe(true);
    });

    it('should detect missing Comprobante element', () => {
      const result = validateCFDIStructure(INVALID_XML_NO_COMPROBANTE);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Missing Comprobante element');
    });

    it('should detect missing Emisor element', () => {
      const result = validateCFDIStructure(INVALID_XML_NO_EMISOR);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.includes('Emisor'))).toBe(true);
    });

    it('should handle empty XML', () => {
      const result = validateCFDIStructure('');

      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should detect unsupported version', () => {
      const xmlWithBadVersion = SAMPLE_CFDI_40.replace('Version="4.0"', 'Version="5.0"');
      const result = validateCFDIStructure(xmlWithBadVersion);

      expect(result.version).toBeNull();
      expect(result.errors.some(e => e.includes('version'))).toBe(true);
    });
  });

  describe('cfdiToJSON', () => {
    it('should convert CFDI to JSON-safe format', async () => {
      const cfdi = await parseCFDI(SAMPLE_CFDI_40);
      const json = cfdiToJSON(cfdi);

      expect(typeof json.fecha).toBe('string');
      expect(json.fecha).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(json.xmlOriginal).toBeUndefined();
    });

    it('should convert timbre fiscal dates', async () => {
      const cfdi = await parseCFDI(SAMPLE_CFDI_40);
      const json = cfdiToJSON(cfdi);

      expect(typeof json.timbreFiscal.fechaTimbrado).toBe('string');
    });

    it('should preserve all other fields', async () => {
      const cfdi = await parseCFDI(SAMPLE_CFDI_40);
      const json = cfdiToJSON(cfdi);

      expect(json.uuid).toBe(cfdi.uuid);
      expect(json.emisor).toEqual(cfdi.emisor);
      expect(json.receptor).toEqual(cfdi.receptor);
      expect(json.total).toBe(cfdi.total);
    });
  });

  describe('getCFDISummary', () => {
    it('should return summary with all fields', async () => {
      const cfdi = await parseCFDI(SAMPLE_CFDI_40);
      const summary = getCFDISummary(cfdi);

      expect(summary).toHaveProperty('uuid');
      expect(summary).toHaveProperty('fecha');
      expect(summary).toHaveProperty('emisor');
      expect(summary).toHaveProperty('receptor');
      expect(summary).toHaveProperty('total');
      expect(summary).toHaveProperty('tipo');
    });

    it('should format emisor and receptor correctly', async () => {
      const cfdi = await parseCFDI(SAMPLE_CFDI_40);
      const summary = getCFDISummary(cfdi);

      expect(summary.emisor).toContain('ABC120101ABC');
      expect(summary.emisor).toContain('ACME Corporation');
      expect(summary.receptor).toContain('XYZ987654XYZ');
    });

    it('should format total with currency', async () => {
      const cfdi = await parseCFDI(SAMPLE_CFDI_40);
      const summary = getCFDISummary(cfdi);

      expect(summary.total).toContain('$');
      expect(summary.total).toContain('MXN');
    });

    it('should return human-readable tipo', async () => {
      const cfdi = await parseCFDI(SAMPLE_CFDI_40);
      const summary = getCFDISummary(cfdi);

      expect(summary.tipo).toBe('Ingreso');
    });
  });

  describe('Type Safety', () => {
    it('should return correct CFDIVersion type', async () => {
      const cfdi = await parseCFDI(SAMPLE_CFDI_40);
      const version: CFDIVersion = cfdi.version;

      expect(['3.3', '4.0']).toContain(version);
    });

    it('should return correct TipoComprobante type', async () => {
      const cfdi = await parseCFDI(SAMPLE_CFDI_40);
      const tipo: TipoComprobante = cfdi.tipoComprobante;

      expect(['I', 'E', 'T', 'N', 'P']).toContain(tipo);
    });
  });

  describe('Edge Cases', () => {
    it('should handle CFDI without optional fields', async () => {
      const minimalXML = `<?xml version="1.0"?>
<cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/4"
  xmlns:tfd="http://www.sat.gob.mx/TimbreFiscalDigital"
  Version="4.0"
  Fecha="2024-01-01T00:00:00"
  SubTotal="100.00"
  Total="116.00"
  TipoDeComprobante="I"
  LugarExpedicion="06600"
  Moneda="MXN">
  <cfdi:Emisor Rfc="TEST123456ABC" Nombre="Test" RegimenFiscal="601"/>
  <cfdi:Receptor Rfc="RECV987654XYZ" Nombre="Receptor" UsoCFDI="G03"/>
  <cfdi:Conceptos>
    <cfdi:Concepto ClaveProdServ="01010101" Cantidad="1" ClaveUnidad="H87" Descripcion="Test" ValorUnitario="100" Importe="100"/>
  </cfdi:Conceptos>
  <cfdi:Complemento>
    <tfd:TimbreFiscalDigital Version="1.1" UUID="12345678-1234-1234-1234-123456789012" FechaTimbrado="2024-01-01T00:00:00" RfcProvCertif="SAT" SelloCFD="x" NoCertificadoSAT="1" SelloSAT="y"/>
  </cfdi:Complemento>
</cfdi:Comprobante>`;

      const cfdi = await parseCFDI(minimalXML);

      expect(cfdi.serie).toBeUndefined();
      expect(cfdi.folio).toBeUndefined();
      expect(cfdi.descuento).toBeUndefined();
      expect(cfdi.metodoPago).toBeUndefined();
    });

    it('should handle multiple conceptos', async () => {
      const multiConceptoXML = SAMPLE_CFDI_40.replace(
        '</cfdi:Conceptos>',
        `<cfdi:Concepto ClaveProdServ="02020202" Cantidad="2" ClaveUnidad="E48" Descripcion="Otro concepto" ValorUnitario="500" Importe="1000"/>
        </cfdi:Conceptos>`
      );

      const cfdi = await parseCFDI(multiConceptoXML);

      expect(cfdi.conceptos.length).toBe(2);
    });
  });
});
