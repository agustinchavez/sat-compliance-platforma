/**
 * CFDI Validation Tests
 *
 * Tests for all validation functions.
 */

import { describe, it, expect } from 'vitest';
import {
  validateCFDI,
  validateStructure,
  validateAmounts,
  validateDates,
  validateCatalogs,
  validateImpuestosAggregation,
} from '../validation.js';
import { buildComprobante } from '../generator.js';
import {
  FIXTURE_INGRESO_SIMPLE,
  FIXTURE_INGRESO_RETENCIONES,
  FIXTURE_INGRESO_EXENTO,
} from './fixtures.js';
import type { CFDIComprobante, CFDIItemInput } from '../types.js';

describe('validateCFDI', () => {
  describe('complete validation', () => {
    it('passes validation for valid CFDI', () => {
      const comprobante = buildComprobante(FIXTURE_INGRESO_SIMPLE);
      // Use a reference date that makes the fixture valid
      const result = validateCFDI(comprobante, { now: new Date('2024-03-01T12:00:00') });

      // Should have no errors (72-hour rule passes with our reference date)
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('collects all errors without short-circuiting', () => {
      const invalid: CFDIComprobante = {
        Version: '3.0', // Wrong version
        Fecha: 'invalid-date',
        Sello: '',
        NoCertificado: '',
        Certificado: '',
        SubTotal: '-100', // Negative
        Moneda: 'MXN',
        Total: '-100',
        TipoDeComprobante: 'X' as any, // Invalid
        Exportacion: '99' as any, // Invalid
        LugarExpedicion: '123', // Invalid zip
        Emisor: {
          Rfc: 'INVALID',
          Nombre: 'Test',
          RegimenFiscal: '1', // Invalid
        },
        Receptor: {
          Rfc: 'TEST',
          Nombre: 'Test',
          DomicilioFiscalReceptor: '12', // Invalid
          RegimenFiscalReceptor: '99', // Invalid
          UsoCFDI: 'G01',
        },
        Conceptos: [], // Empty
      };

      const result = validateCFDI(invalid);

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(5); // Multiple errors
    });
  });

  describe('XML string validation', () => {
    it('validates XML string for basic structure', () => {
      const validXml = `<?xml version="1.0" encoding="UTF-8"?>
        <cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/4" Version="4.0">
        </cfdi:Comprobante>`;

      const result = validateCFDI(validXml);
      expect(result.errors).toHaveLength(0);
    });

    it('detects missing XML declaration', () => {
      const invalidXml = `<cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/4">
        </cfdi:Comprobante>`;

      const result = validateCFDI(invalidXml);
      expect(result.errors.some((e) => e.code === 'CFDI_XML_001')).toBe(true);
    });

    it('warns about lowercase encoding', () => {
      const xml = `<?xml version="1.0" encoding="utf-8"?>
        <cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/4" Version="4.0">
        </cfdi:Comprobante>`;

      const result = validateCFDI(xml);
      expect(result.warnings.some((w) => w.code === 'CFDI_XML_002')).toBe(true);
    });

    it('detects missing namespace', () => {
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
        <Comprobante Version="4.0"></Comprobante>`;

      const result = validateCFDI(xml);
      expect(result.errors.some((e) => e.code === 'CFDI_XML_003')).toBe(true);
    });

    it('detects wrong version', () => {
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
        <cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/4" Version="3.3">
        </cfdi:Comprobante>`;

      const result = validateCFDI(xml);
      expect(result.errors.some((e) => e.code === 'CFDI_XML_004')).toBe(true);
    });
  });
});

describe('validateStructure', () => {
  it('returns error for missing DomicilioFiscalReceptor', () => {
    const comprobante = buildComprobante(FIXTURE_INGRESO_SIMPLE);
    comprobante.Receptor.DomicilioFiscalReceptor = '123'; // Invalid

    const errors = validateStructure(comprobante);

    expect(errors.some((e) => e.field === 'Receptor.DomicilioFiscalReceptor')).toBe(true);
  });

  it('returns error for invalid Version', () => {
    const comprobante = buildComprobante(FIXTURE_INGRESO_SIMPLE);
    (comprobante as any).Version = '3.3';

    const errors = validateStructure(comprobante);

    expect(errors.some((e) => e.field === 'Version')).toBe(true);
  });

  it('returns error for invalid Fecha format', () => {
    const comprobante = buildComprobante(FIXTURE_INGRESO_SIMPLE);
    comprobante.Fecha = '2024/03/01 10:00:00';

    const errors = validateStructure(comprobante);

    expect(errors.some((e) => e.field === 'Fecha')).toBe(true);
  });

  it('returns error for invalid LugarExpedicion', () => {
    const comprobante = buildComprobante(FIXTURE_INGRESO_SIMPLE);
    comprobante.LugarExpedicion = '1234'; // 4 digits

    const errors = validateStructure(comprobante);

    expect(errors.some((e) => e.field === 'LugarExpedicion')).toBe(true);
  });

  it('returns error for negative SubTotal', () => {
    const comprobante = buildComprobante(FIXTURE_INGRESO_SIMPLE);
    comprobante.SubTotal = '-100.00';

    const errors = validateStructure(comprobante);

    expect(errors.some((e) => e.field === 'SubTotal')).toBe(true);
  });

  it('returns error for empty Conceptos', () => {
    const comprobante = buildComprobante(FIXTURE_INGRESO_SIMPLE);
    comprobante.Conceptos = [];

    const errors = validateStructure(comprobante);

    expect(errors.some((e) => e.field === 'Conceptos')).toBe(true);
  });

  it('passes for valid comprobante', () => {
    const comprobante = buildComprobante(FIXTURE_INGRESO_SIMPLE);
    const errors = validateStructure(comprobante);

    expect(errors).toHaveLength(0);
  });
});

describe('validateAmounts', () => {
  it('returns error when Total does not match calculated total', () => {
    const comprobante = buildComprobante(FIXTURE_INGRESO_SIMPLE);
    comprobante.Total = '99999.00'; // Wrong total

    const errors = validateAmounts(comprobante);

    expect(errors.some((e) => e.field === 'Total')).toBe(true);
  });

  it('allows 1-cent tolerance', () => {
    const comprobante = buildComprobante(FIXTURE_INGRESO_SIMPLE);
    // Change total by less than 1 cent
    const originalTotal = parseFloat(comprobante.Total);
    comprobante.Total = (originalTotal + 0.005).toFixed(2);

    const errors = validateAmounts(comprobante);

    // Should pass with small tolerance
    const totalErrors = errors.filter((e) => e.field === 'Total');
    expect(totalErrors).toHaveLength(0);
  });

  it('returns error when SubTotal does not match sum of Importe', () => {
    const comprobante = buildComprobante(FIXTURE_INGRESO_SIMPLE);
    comprobante.SubTotal = '50000.00'; // Wrong subtotal

    const errors = validateAmounts(comprobante);

    expect(errors.some((e) => e.field === 'SubTotal')).toBe(true);
  });

  it('passes for valid amounts', () => {
    const comprobante = buildComprobante(FIXTURE_INGRESO_SIMPLE);
    const errors = validateAmounts(comprobante);

    expect(errors).toHaveLength(0);
  });
});

describe('validateDates', () => {
  it('returns error for invoice dated > 72 hours ago', () => {
    const comprobante = buildComprobante(FIXTURE_INGRESO_SIMPLE);
    // Reference date is much later than the fixture date
    const futureDate = new Date('2024-06-01T10:00:00');

    const errors = validateDates(comprobante, futureDate);

    expect(errors.some((e) => e.code === 'CFDI032')).toBe(true);
    expect(errors.some((e) => e.message.includes('72 hours'))).toBe(true);
  });

  it('returns error for future date', () => {
    const comprobante = buildComprobante(FIXTURE_INGRESO_SIMPLE);
    comprobante.Fecha = '2099-12-31T23:59:59';
    const currentDate = new Date('2024-03-01T10:00:00');

    const errors = validateDates(comprobante, currentDate);

    expect(errors.some((e) => e.code === 'CFDI031')).toBe(true);
  });

  it('passes for date within 72-hour window', () => {
    const comprobante = buildComprobante(FIXTURE_INGRESO_SIMPLE);
    // Reference date is 1 hour after fixture date
    const referenceDate = new Date('2024-03-01T11:00:00');

    const errors = validateDates(comprobante, referenceDate);

    expect(errors).toHaveLength(0);
  });

  it('returns error for invalid date format', () => {
    const comprobante = buildComprobante(FIXTURE_INGRESO_SIMPLE);
    comprobante.Fecha = 'not-a-date';

    const errors = validateDates(comprobante);

    expect(errors.some((e) => e.code === 'CFDI030')).toBe(true);
  });
});

describe('validateCatalogs', () => {
  it('rejects TipoDeComprobante = "X" (invalid)', () => {
    const comprobante = buildComprobante(FIXTURE_INGRESO_SIMPLE);
    (comprobante as any).TipoDeComprobante = 'X';

    const errors = validateCatalogs(comprobante);

    expect(errors.some((e) => e.field === 'TipoDeComprobante')).toBe(true);
  });

  it('rejects Exportacion = "05" (invalid)', () => {
    const comprobante = buildComprobante(FIXTURE_INGRESO_SIMPLE);
    (comprobante as any).Exportacion = '05';

    const errors = validateCatalogs(comprobante);

    expect(errors.some((e) => e.field === 'Exportacion')).toBe(true);
  });

  it('accepts all four valid TipoDeComprobante values', () => {
    const validTypes = ['I', 'E', 'T', 'P'];

    for (const tipo of validTypes) {
      const comprobante = buildComprobante(FIXTURE_INGRESO_SIMPLE);
      comprobante.TipoDeComprobante = tipo as any;

      const errors = validateCatalogs(comprobante);
      const tipoErrors = errors.filter((e) => e.field === 'TipoDeComprobante');

      expect(tipoErrors).toHaveLength(0);
    }
  });

  it('accepts all valid Exportacion values', () => {
    const validValues = ['01', '02', '03', '04'];

    for (const exp of validValues) {
      const comprobante = buildComprobante(FIXTURE_INGRESO_SIMPLE);
      comprobante.Exportacion = exp;

      const errors = validateCatalogs(comprobante);
      const expErrors = errors.filter((e) => e.field === 'Exportacion');

      expect(expErrors).toHaveLength(0);
    }
  });

  it('rejects invalid MetodoPago', () => {
    const comprobante = buildComprobante(FIXTURE_INGRESO_SIMPLE);
    comprobante.MetodoPago = 'INVALID';

    const errors = validateCatalogs(comprobante);

    expect(errors.some((e) => e.field === 'MetodoPago')).toBe(true);
  });

  it('accepts valid MetodoPago values', () => {
    for (const mp of ['PUE', 'PPD']) {
      const comprobante = buildComprobante(FIXTURE_INGRESO_SIMPLE);
      comprobante.MetodoPago = mp;

      const errors = validateCatalogs(comprobante);
      const mpErrors = errors.filter((e) => e.field === 'MetodoPago');

      expect(mpErrors).toHaveLength(0);
    }
  });

  it('validates ClaveProdServ format', () => {
    const comprobante = buildComprobante(FIXTURE_INGRESO_SIMPLE);
    comprobante.Conceptos[0].ClaveProdServ = '123'; // Too short

    const errors = validateCatalogs(comprobante);

    expect(errors.some((e) => e.field?.includes('ClaveProdServ'))).toBe(true);
  });

  it('validates ClaveUnidad format', () => {
    const comprobante = buildComprobante(FIXTURE_INGRESO_SIMPLE);
    comprobante.Conceptos[0].ClaveUnidad = 'TOOOOOOOOOLONG123'; // Too long

    const errors = validateCatalogs(comprobante);

    expect(errors.some((e) => e.field?.includes('ClaveUnidad'))).toBe(true);
  });

  it('validates ObjetoImp values', () => {
    const comprobante = buildComprobante(FIXTURE_INGRESO_SIMPLE);
    comprobante.Conceptos[0].ObjetoImp = '99' as any;

    const errors = validateCatalogs(comprobante);

    expect(errors.some((e) => e.field?.includes('ObjetoImp'))).toBe(true);
  });

  it('passes for complete valid CFDI', () => {
    const comprobante = buildComprobante(FIXTURE_INGRESO_SIMPLE);
    const errors = validateCatalogs(comprobante);

    expect(errors).toHaveLength(0);
  });
});

describe('validateImpuestosAggregation', () => {
  it('catches mismatched summary totals', () => {
    const comprobante = buildComprobante(FIXTURE_INGRESO_SIMPLE);
    // Corrupt the TotalImpuestosTrasladados
    if (comprobante.Impuestos) {
      comprobante.Impuestos.TotalImpuestosTrasladados = '9999.000000';
    }

    // Create items from fixture
    const items: CFDIItemInput[] = FIXTURE_INGRESO_SIMPLE.invoice.items;

    const errors = validateImpuestosAggregation(comprobante, items);

    expect(errors.some((e) => e.field === 'Impuestos.TotalImpuestosTrasladados')).toBe(true);
  });

  it('passes when aggregation matches', () => {
    const comprobante = buildComprobante(FIXTURE_INGRESO_SIMPLE);
    const items: CFDIItemInput[] = FIXTURE_INGRESO_SIMPLE.invoice.items;

    const errors = validateImpuestosAggregation(comprobante, items);

    expect(errors).toHaveLength(0);
  });

  it('validates retenciones aggregation', () => {
    const comprobante = buildComprobante(FIXTURE_INGRESO_RETENCIONES);
    // Corrupt the TotalImpuestosRetenidos
    if (comprobante.Impuestos) {
      comprobante.Impuestos.TotalImpuestosRetenidos = '0.000000';
    }

    const items: CFDIItemInput[] = FIXTURE_INGRESO_RETENCIONES.invoice.items;

    const errors = validateImpuestosAggregation(comprobante, items);

    expect(errors.some((e) => e.field === 'Impuestos.TotalImpuestosRetenidos')).toBe(true);
  });
});
