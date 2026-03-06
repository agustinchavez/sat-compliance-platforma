/**
 * CFDI XML Generator Tests
 *
 * Tests for the core XML generation functionality.
 * Uses fixed test fixtures for deterministic testing.
 */

import { describe, it, expect } from 'vitest';
import {
  generateCFDI,
  buildComprobante,
  buildEmisor,
  buildReceptor,
  buildConceptos,
  buildImpuestos,
  buildRelatedCFDI,
  formatXML,
} from '../generator.js';
import {
  FIXTURE_INGRESO_SIMPLE,
  FIXTURE_INGRESO_RETENCIONES,
  FIXTURE_INGRESO_EXENTO,
  FIXTURE_INGRESO_IVA_EXENTO,
  FIXTURE_EGRESO,
  FIXTURE_PUBLICO_GENERAL,
  FIXTURE_MULTITAX,
  FIXTURE_WITH_DISCOUNT,
  FIXTURE_USD_INVOICE,
  FIXTURE_PPD_INVOICE,
  FIXTURE_WITH_SKU,
  FIXTURE_GLOBAL_INVOICE,
} from './fixtures.js';
import type { CFDIGeneratorInput } from '../types.js';

describe('generateCFDI', () => {
  describe('XML declaration and namespaces', () => {
    it('produces valid XML declaration with UTF-8 uppercase encoding', () => {
      const { xml } = generateCFDI(FIXTURE_INGRESO_SIMPLE);
      expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
      expect(xml).not.toContain('encoding="utf-8"'); // Must be uppercase
    });

    it('uses correct cfdi namespace and version 4.0', () => {
      const { xml } = generateCFDI(FIXTURE_INGRESO_SIMPLE);
      expect(xml).toContain('xmlns:cfdi="http://www.sat.gob.mx/cfd/4"');
      expect(xml).toContain('Version="4.0"');
    });

    it('includes correct schemaLocation', () => {
      const { xml } = generateCFDI(FIXTURE_INGRESO_SIMPLE);
      expect(xml).toContain(
        'xsi:schemaLocation="http://www.sat.gob.mx/cfd/4 http://www.sat.gob.mx/sitio_internet/cfd/4/cfdv40.xsd"'
      );
    });

    it('includes xmlns:xsi declaration', () => {
      const { xml } = generateCFDI(FIXTURE_INGRESO_SIMPLE);
      expect(xml).toContain('xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"');
    });
  });

  describe('Receptor CFDI 4.0 required fields', () => {
    it('includes DomicilioFiscalReceptor (required in CFDI 4.0)', () => {
      const { xml } = generateCFDI(FIXTURE_INGRESO_SIMPLE);
      expect(xml).toContain('DomicilioFiscalReceptor="65000"');
    });

    it('includes RegimenFiscalReceptor (required in CFDI 4.0)', () => {
      const { xml } = generateCFDI(FIXTURE_INGRESO_SIMPLE);
      expect(xml).toContain('RegimenFiscalReceptor="601"');
    });
  });

  describe('Descuento handling', () => {
    it('omits Descuento attribute when discount is zero', () => {
      const { xml } = generateCFDI(FIXTURE_INGRESO_SIMPLE);
      // Check that Descuento doesn't appear as an attribute
      expect(xml).not.toMatch(/Descuento=["'][^"']*["']/);
    });

    it('includes Descuento attribute when discount is non-zero', () => {
      const { xml } = generateCFDI(FIXTURE_WITH_DISCOUNT);
      expect(xml).toContain('Descuento="1000.00"');
    });

    it('includes Descuento in Concepto when item has discount', () => {
      const { xml } = generateCFDI(FIXTURE_WITH_DISCOUNT);
      // Check for concepto-level discount
      expect(xml).toContain('Descuento="1000.000000"');
    });
  });

  describe('Decimal formatting', () => {
    it('formats SubTotal and Total to 2 decimal places', () => {
      const { xml } = generateCFDI(FIXTURE_INGRESO_SIMPLE);
      expect(xml).toContain('SubTotal="10000.00"');
      expect(xml).toContain('Total="11600.00"');
    });

    it('formats Cantidad and ValorUnitario to 6 decimal places', () => {
      const { xml } = generateCFDI(FIXTURE_INGRESO_SIMPLE);
      expect(xml).toContain('Cantidad="1.000000"');
      expect(xml).toContain('ValorUnitario="10000.000000"');
    });

    it('formats TasaOCuota to exactly 6 decimal places', () => {
      const { xml } = generateCFDI(FIXTURE_INGRESO_SIMPLE);
      expect(xml).toContain('TasaOCuota="0.160000"');
    });

    it('formats Importe in Concepto to 6 decimal places', () => {
      const { xml } = generateCFDI(FIXTURE_INGRESO_SIMPLE);
      expect(xml).toContain('Importe="10000.000000"');
    });
  });

  describe('Sello and Certificado placeholders', () => {
    it('uses empty strings for Sello and Certificado before signing', () => {
      const { xml } = generateCFDI(FIXTURE_INGRESO_SIMPLE);
      expect(xml).toContain('Sello=""');
      expect(xml).toContain('Certificado=""');
    });

    it('uses empty string for NoCertificado before signing', () => {
      const { xml } = generateCFDI(FIXTURE_INGRESO_SIMPLE);
      expect(xml).toContain('NoCertificado=""');
    });
  });

  describe('Special RFC handling', () => {
    it('forces UsoCFDI=S01 and RegimenFiscalReceptor=616 for XAXX RFC', () => {
      const { xml } = generateCFDI(FIXTURE_PUBLICO_GENERAL);
      expect(xml).toContain('UsoCFDI="S01"');
      expect(xml).toContain('RegimenFiscalReceptor="616"');
    });

    it('does not modify normal RFC receivers', () => {
      const { xml } = generateCFDI(FIXTURE_INGRESO_SIMPLE);
      expect(xml).toContain('UsoCFDI="G01"');
      expect(xml).toContain('RegimenFiscalReceptor="601"');
    });
  });

  describe('CfdiRelacionados', () => {
    it('includes CfdiRelacionados when related_cfdi provided', () => {
      const { xml } = generateCFDI(FIXTURE_EGRESO);
      expect(xml).toContain('TipoRelacion="01"');
      expect(xml).toContain('UUID="F4F09AEF-57F2-4BE0-A828-87D1A80ED61C"');
    });

    it('groups multiple related CFDIs by TipoRelacion', () => {
      const input: CFDIGeneratorInput = {
        invoice: {
          ...FIXTURE_INGRESO_SIMPLE.invoice,
          related_cfdi: [
            { tipo_relacion: '04', related_uuid: 'AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE' },
            { tipo_relacion: '04', related_uuid: '11111111-2222-3333-4444-555555555555' },
          ],
        },
      };
      const { xml } = generateCFDI(input);

      // Should have one CfdiRelacionados block with TipoRelacion="04"
      expect(xml).toContain('TipoRelacion="04"');

      // Should have two CfdiRelacionado children
      expect(xml).toContain('UUID="AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE"');
      expect(xml).toContain('UUID="11111111-2222-3333-4444-555555555555"');
    });

    it('handles multiple TipoRelacion groups', () => {
      const input: CFDIGeneratorInput = {
        invoice: {
          ...FIXTURE_INGRESO_SIMPLE.invoice,
          related_cfdi: [
            { tipo_relacion: '01', related_uuid: 'AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE' },
            { tipo_relacion: '04', related_uuid: '11111111-2222-3333-4444-555555555555' },
          ],
        },
      };
      const { xml } = generateCFDI(input);

      expect(xml).toContain('TipoRelacion="01"');
      expect(xml).toContain('TipoRelacion="04"');
    });
  });

  describe('TipoDeComprobante=P (Payment complement)', () => {
    it('uses Moneda=XXX for payment complement', () => {
      const input: CFDIGeneratorInput = {
        invoice: {
          ...FIXTURE_INGRESO_SIMPLE.invoice,
          tipo_comprobante: 'P',
        },
      };
      const { xml } = generateCFDI(input);
      expect(xml).toContain('Moneda="XXX"');
    });

    it('uses SubTotal=0 and Total=0 for payment complement', () => {
      const input: CFDIGeneratorInput = {
        invoice: {
          ...FIXTURE_INGRESO_SIMPLE.invoice,
          tipo_comprobante: 'P',
        },
      };
      const { xml } = generateCFDI(input);
      expect(xml).toContain('SubTotal="0"');
      expect(xml).toContain('Total="0"');
    });

    it('omits FormaPago and MetodoPago for payment complement', () => {
      const input: CFDIGeneratorInput = {
        invoice: {
          ...FIXTURE_INGRESO_SIMPLE.invoice,
          tipo_comprobante: 'P',
          payment_form: '03',
          payment_method: 'PUE',
        },
      };
      const { xml } = generateCFDI(input);
      expect(xml).not.toContain('FormaPago=');
      expect(xml).not.toContain('MetodoPago=');
    });
  });

  describe('ObjetoImp handling', () => {
    it('ObjetoImp=01 items have no cfdi:Impuestos child', () => {
      const { xml } = generateCFDI(FIXTURE_INGRESO_EXENTO);
      // Check there's no Impuestos inside Concepto for ObjetoImp=01
      expect(xml).toContain('ObjetoImp="01"');
      // The concepto should not have an Impuestos child
      const conceptoMatch = xml.match(/<cfdi:Concepto[^>]*ObjetoImp="01"[^>]*>([^]*?)<\/cfdi:Concepto>|<cfdi:Concepto[^>]*ObjetoImp="01"[^>]*\/>/);
      if (conceptoMatch && conceptoMatch[1]) {
        expect(conceptoMatch[1]).not.toContain('<cfdi:Impuestos');
      }
    });

    it('ObjetoImp=02 items have cfdi:Impuestos child', () => {
      const { xml } = generateCFDI(FIXTURE_INGRESO_SIMPLE);
      expect(xml).toContain('ObjetoImp="02"');
      expect(xml).toContain('<cfdi:Impuestos>');
    });
  });

  describe('Exento items', () => {
    it('Exento items omit TasaOCuota and Importe at concept level', () => {
      const { xml } = generateCFDI(FIXTURE_INGRESO_IVA_EXENTO);
      // Find the Traslado with TipoFactor=Exento
      expect(xml).toContain('TipoFactor="Exento"');

      // The Exento traslado should have Base but not TasaOCuota or Importe
      const exemptMatch = xml.match(/<cfdi:Traslado[^>]*TipoFactor="Exento"[^>]*>/);
      expect(exemptMatch).toBeTruthy();
      const exemptTraslado = exemptMatch![0];
      expect(exemptTraslado).toContain('Base=');
      expect(exemptTraslado).not.toContain('TasaOCuota=');
      expect(exemptTraslado).not.toContain('Importe=');
    });
  });

  describe('Foreign currency', () => {
    it('includes TipoCambio for non-MXN currency', () => {
      const { xml } = generateCFDI(FIXTURE_USD_INVOICE);
      expect(xml).toContain('Moneda="USD"');
      expect(xml).toContain('TipoCambio="17.5"');
    });

    it('omits TipoCambio for MXN currency', () => {
      const { xml } = generateCFDI(FIXTURE_INGRESO_SIMPLE);
      expect(xml).toContain('Moneda="MXN"');
      expect(xml).not.toContain('TipoCambio=');
    });
  });

  describe('Optional fields', () => {
    it('includes Serie and Folio when present', () => {
      const { xml } = generateCFDI(FIXTURE_INGRESO_SIMPLE);
      expect(xml).toContain('Serie="A"');
      expect(xml).toContain('Folio="00000001"');
    });

    it('includes NoIdentificacion (SKU) when present', () => {
      const { xml } = generateCFDI(FIXTURE_WITH_SKU);
      expect(xml).toContain('NoIdentificacion="PROD-001-ABC"');
    });

    it('includes Unidad when present', () => {
      const { xml } = generateCFDI(FIXTURE_INGRESO_SIMPLE);
      expect(xml).toContain('Unidad="Hora"');
    });

    it('includes MetodoPago when present', () => {
      const { xml } = generateCFDI(FIXTURE_INGRESO_SIMPLE);
      expect(xml).toContain('MetodoPago="PUE"');
    });

    it('includes FormaPago when present', () => {
      const { xml } = generateCFDI(FIXTURE_INGRESO_SIMPLE);
      expect(xml).toContain('FormaPago="03"');
    });
  });

  describe('InformacionGlobal', () => {
    it('includes InformacionGlobal for global invoices', () => {
      const { xml } = generateCFDI(FIXTURE_GLOBAL_INVOICE);
      expect(xml).toContain('<cfdi:InformacionGlobal');
      expect(xml).toContain('Periodicidad="04"');
      expect(xml).toContain('Meses="03"');
      expect(xml).toContain('Año="2024"');
    });

    it('omits InformacionGlobal for non-global invoices', () => {
      const { xml } = generateCFDI(FIXTURE_INGRESO_SIMPLE);
      expect(xml).not.toContain('<cfdi:InformacionGlobal');
    });
  });

  describe('Impuestos summary', () => {
    it('includes TotalImpuestosTrasladados', () => {
      const { xml } = generateCFDI(FIXTURE_INGRESO_SIMPLE);
      expect(xml).toContain('TotalImpuestosTrasladados="1600.000000"');
    });

    it('includes TotalImpuestosRetenidos when retentions exist', () => {
      const { xml } = generateCFDI(FIXTURE_INGRESO_RETENCIONES);
      expect(xml).toContain('TotalImpuestosRetenidos=');
    });

    it('aggregates multiple tax rates correctly', () => {
      const { xml } = generateCFDI(FIXTURE_MULTITAX);
      // Should have traslados at Comprobante level
      // 16% on 10000 = 1600, 8% on 5000 = 400, total = 2000
      expect(xml).toContain('TotalImpuestosTrasladados="2000.000000"');
    });
  });

  describe('Retenciones', () => {
    it('includes ISR and IVA retentions', () => {
      const { xml } = generateCFDI(FIXTURE_INGRESO_RETENCIONES);
      // At Comprobante level
      expect(xml).toContain('<cfdi:Retenciones>');
      expect(xml).toContain('Impuesto="001"'); // ISR
      expect(xml).toContain('Impuesto="002"'); // IVA
    });
  });

  describe('xmlUnsigned output', () => {
    it('returns same XML in both xml and xmlUnsigned', () => {
      const result = generateCFDI(FIXTURE_INGRESO_SIMPLE);
      expect(result.xml).toBe(result.xmlUnsigned);
    });
  });
});

describe('buildComprobante', () => {
  it('returns CFDIComprobante with all required fields', () => {
    const comprobante = buildComprobante(FIXTURE_INGRESO_SIMPLE);

    expect(comprobante.Version).toBe('4.0');
    expect(comprobante.Fecha).toBe('2024-03-01T10:00:00');
    expect(comprobante.TipoDeComprobante).toBe('I');
    expect(comprobante.Exportacion).toBe('01');
    expect(comprobante.LugarExpedicion).toBe('26015');
    expect(comprobante.Emisor).toBeDefined();
    expect(comprobante.Receptor).toBeDefined();
    expect(comprobante.Conceptos).toHaveLength(1);
  });
});

describe('buildEmisor', () => {
  it('maps issuer fields correctly', () => {
    const emisor = buildEmisor(FIXTURE_INGRESO_SIMPLE);

    expect(emisor.Rfc).toBe('EKU9003173C9');
    expect(emisor.Nombre).toBe('ESCUELA KEMPER URGATE');
    expect(emisor.RegimenFiscal).toBe('601');
  });
});

describe('buildReceptor', () => {
  it('maps receiver fields correctly', () => {
    const receptor = buildReceptor(FIXTURE_INGRESO_SIMPLE);

    expect(receptor.Rfc).toBe('URE180429TM6');
    expect(receptor.Nombre).toBe('UNIVERSIDAD ROBOTICA ESPAÑOLA');
    expect(receptor.DomicilioFiscalReceptor).toBe('65000');
    expect(receptor.RegimenFiscalReceptor).toBe('601');
    expect(receptor.UsoCFDI).toBe('G01');
  });

  it('forces S01 and 616 for XAXX RFC', () => {
    const receptor = buildReceptor(FIXTURE_PUBLICO_GENERAL);

    expect(receptor.Rfc).toBe('XAXX010101000');
    expect(receptor.UsoCFDI).toBe('S01');
    expect(receptor.RegimenFiscalReceptor).toBe('616');
  });
});

describe('buildConceptos', () => {
  it('maps item fields to conceptos', () => {
    const conceptos = buildConceptos(FIXTURE_INGRESO_SIMPLE.invoice.items);

    expect(conceptos).toHaveLength(1);
    expect(conceptos[0].ClaveProdServ).toBe('81112100');
    expect(conceptos[0].ClaveUnidad).toBe('E48');
    expect(conceptos[0].Descripcion).toBe('Servicio de consultoria');
    expect(conceptos[0].Cantidad).toBe('1.000000');
    expect(conceptos[0].ValorUnitario).toBe('10000.000000');
    expect(conceptos[0].Importe).toBe('10000.000000');
    expect(conceptos[0].ObjetoImp).toBe('02');
  });

  it('includes Impuestos for taxed items', () => {
    const conceptos = buildConceptos(FIXTURE_INGRESO_SIMPLE.invoice.items);

    expect(conceptos[0].Impuestos).toBeDefined();
    expect(conceptos[0].Impuestos!.Traslados).toHaveLength(1);
    expect(conceptos[0].Impuestos!.Traslados![0].Impuesto).toBe('002');
  });

  it('excludes Impuestos for non-taxed items', () => {
    const conceptos = buildConceptos(FIXTURE_INGRESO_EXENTO.invoice.items);

    expect(conceptos[0].Impuestos).toBeUndefined();
  });
});

describe('buildImpuestos', () => {
  it('returns undefined for items with no taxes', () => {
    const impuestos = buildImpuestos(FIXTURE_INGRESO_EXENTO.invoice.items);
    expect(impuestos).toBeUndefined();
  });

  it('builds aggregated summary for taxed items', () => {
    const impuestos = buildImpuestos(FIXTURE_INGRESO_SIMPLE.invoice.items);

    expect(impuestos).toBeDefined();
    expect(impuestos!.TotalImpuestosTrasladados).toBe('1600.000000');
    expect(impuestos!.Traslados).toHaveLength(1);
  });

  it('includes retenciones when present', () => {
    const impuestos = buildImpuestos(FIXTURE_INGRESO_RETENCIONES.invoice.items);

    expect(impuestos).toBeDefined();
    expect(impuestos!.TotalImpuestosRetenidos).toBeDefined();
    expect(impuestos!.Retenciones).toBeDefined();
    expect(impuestos!.Retenciones!.length).toBeGreaterThan(0);
  });
});

describe('buildRelatedCFDI', () => {
  it('groups by tipo_relacion', () => {
    const related = [
      { tipo_relacion: '01', related_uuid: 'UUID-1' },
      { tipo_relacion: '01', related_uuid: 'UUID-2' },
      { tipo_relacion: '04', related_uuid: 'UUID-3' },
    ];

    const result = buildRelatedCFDI(related);

    expect(result).toHaveLength(2);

    const tipo01 = result.find((r) => r.TipoRelacion === '01');
    expect(tipo01).toBeDefined();
    expect(tipo01!.CfdiRelacionado).toHaveLength(2);

    const tipo04 = result.find((r) => r.TipoRelacion === '04');
    expect(tipo04).toBeDefined();
    expect(tipo04!.CfdiRelacionado).toHaveLength(1);
  });
});

describe('formatXML', () => {
  it('produces well-formed XML', () => {
    const comprobante = buildComprobante(FIXTURE_INGRESO_SIMPLE);
    const xml = formatXML(comprobante);

    // Basic well-formedness check
    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(xml).toContain('<cfdi:Comprobante');
    expect(xml).toContain('</cfdi:Comprobante>');
  });

  it('includes all namespace declarations', () => {
    const comprobante = buildComprobante(FIXTURE_INGRESO_SIMPLE);
    const xml = formatXML(comprobante);

    expect(xml).toContain('xmlns:cfdi=');
    expect(xml).toContain('xmlns:xsi=');
    expect(xml).toContain('xsi:schemaLocation=');
  });
});
