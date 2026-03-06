/**
 * Impuestos Aggregation Tests
 *
 * Exhaustive tests for the tax aggregation logic.
 * This is the most critical calculation logic in CFDI generation.
 */

import { describe, it, expect } from 'vitest';
import {
  aggregateImpuestos,
  formatDecimal6,
  formatDecimal2,
  collectTaxRecords,
  type TaxRecord,
} from '../impuestos-aggregation.js';
import Decimal from 'decimal.js';

describe('formatDecimal6', () => {
  it('formats integer to 6 decimal places', () => {
    expect(formatDecimal6(10000)).toBe('10000.000000');
  });

  it('formats rate to 6 decimal places', () => {
    expect(formatDecimal6(0.16)).toBe('0.160000');
  });

  it('formats string input', () => {
    expect(formatDecimal6('1234.56')).toBe('1234.560000');
  });

  it('formats Decimal input', () => {
    expect(formatDecimal6(new Decimal('999.999999'))).toBe('999.999999');
  });

  it('handles very small numbers', () => {
    expect(formatDecimal6(0.000001)).toBe('0.000001');
  });

  it('handles zero', () => {
    expect(formatDecimal6(0)).toBe('0.000000');
  });

  it('rounds correctly (half up)', () => {
    expect(formatDecimal6(0.1234565)).toBe('0.123457');
    expect(formatDecimal6(0.1234564)).toBe('0.123456');
  });
});

describe('formatDecimal2', () => {
  it('formats integer to 2 decimal places', () => {
    expect(formatDecimal2(10000)).toBe('10000.00');
  });

  it('formats decimal to 2 decimal places', () => {
    expect(formatDecimal2(1234.567)).toBe('1234.57');
  });

  it('handles zero', () => {
    expect(formatDecimal2(0)).toBe('0.00');
  });

  it('rounds correctly (half up)', () => {
    expect(formatDecimal2(10.125)).toBe('10.13');
    expect(formatDecimal2(10.124)).toBe('10.12');
  });
});

describe('aggregateImpuestos', () => {
  describe('single item scenarios', () => {
    it('single item with 16% IVA', () => {
      const records: TaxRecord[] = [
        {
          type: 'traslado',
          impuesto: '002',
          tipo_factor: 'Tasa',
          tasa_o_cuota: '0.160000',
          base: '10000.000000',
          importe: '1600.000000',
        },
      ];

      const result = aggregateImpuestos(records);

      expect(result.traslados).toHaveLength(1);
      expect(result.traslados[0]).toEqual({
        base: '10000.000000',
        impuesto: '002',
        tipoFactor: 'Tasa',
        tasaOCuota: '0.160000',
        importe: '1600.000000',
      });
      expect(result.totalImpuestosTrasladados).toBe('1600.000000');
      expect(result.retenciones).toHaveLength(0);
      expect(result.totalImpuestosRetenidos).toBeUndefined();
    });

    it('single item with ISR retention only', () => {
      const records: TaxRecord[] = [
        {
          type: 'retencion',
          impuesto: '001',
          tipo_factor: 'Tasa',
          tasa_o_cuota: '0.100000',
          base: '10000.000000',
          importe: '1000.000000',
        },
      ];

      const result = aggregateImpuestos(records);

      expect(result.retenciones).toHaveLength(1);
      expect(result.retenciones[0]).toEqual({
        impuesto: '001',
        importe: '1000.000000',
      });
      expect(result.totalImpuestosRetenidos).toBe('1000.000000');
      expect(result.traslados).toHaveLength(0);
      expect(result.totalImpuestosTrasladados).toBeUndefined();
    });
  });

  describe('multiple items, same rate', () => {
    it('two items, same IVA rate - sums Base and Importe', () => {
      const records: TaxRecord[] = [
        {
          type: 'traslado',
          impuesto: '002',
          tipo_factor: 'Tasa',
          tasa_o_cuota: '0.160000',
          base: '5000.000000',
          importe: '800.000000',
        },
        {
          type: 'traslado',
          impuesto: '002',
          tipo_factor: 'Tasa',
          tasa_o_cuota: '0.160000',
          base: '5000.000000',
          importe: '800.000000',
        },
      ];

      const result = aggregateImpuestos(records);

      expect(result.traslados).toHaveLength(1);
      expect(result.traslados[0]).toEqual({
        base: '10000.000000',
        impuesto: '002',
        tipoFactor: 'Tasa',
        tasaOCuota: '0.160000',
        importe: '1600.000000',
      });
      expect(result.totalImpuestosTrasladados).toBe('1600.000000');
    });

    it('three items, same rate - correct aggregation', () => {
      const records: TaxRecord[] = [
        {
          type: 'traslado',
          impuesto: '002',
          tipo_factor: 'Tasa',
          tasa_o_cuota: '0.160000',
          base: '3333.333333',
          importe: '533.333333',
        },
        {
          type: 'traslado',
          impuesto: '002',
          tipo_factor: 'Tasa',
          tasa_o_cuota: '0.160000',
          base: '3333.333333',
          importe: '533.333333',
        },
        {
          type: 'traslado',
          impuesto: '002',
          tipo_factor: 'Tasa',
          tasa_o_cuota: '0.160000',
          base: '3333.333334',
          importe: '533.333334',
        },
      ];

      const result = aggregateImpuestos(records);

      expect(result.traslados).toHaveLength(1);
      expect(result.traslados[0].base).toBe('10000.000000');
      expect(result.traslados[0].importe).toBe('1600.000000');
    });
  });

  describe('multiple items, different rates', () => {
    it('two items, different IVA rates (16% and 8%) - separate rows', () => {
      const records: TaxRecord[] = [
        {
          type: 'traslado',
          impuesto: '002',
          tipo_factor: 'Tasa',
          tasa_o_cuota: '0.160000',
          base: '10000.000000',
          importe: '1600.000000',
        },
        {
          type: 'traslado',
          impuesto: '002',
          tipo_factor: 'Tasa',
          tasa_o_cuota: '0.080000',
          base: '5000.000000',
          importe: '400.000000',
        },
      ];

      const result = aggregateImpuestos(records);

      expect(result.traslados).toHaveLength(2);
      expect(result.totalImpuestosTrasladados).toBe('2000.000000');

      // Find each rate
      const rate16 = result.traslados.find((t) => t.tasaOCuota === '0.160000');
      const rate8 = result.traslados.find((t) => t.tasaOCuota === '0.080000');

      expect(rate16).toBeDefined();
      expect(rate16!.base).toBe('10000.000000');
      expect(rate16!.importe).toBe('1600.000000');

      expect(rate8).toBeDefined();
      expect(rate8!.base).toBe('5000.000000');
      expect(rate8!.importe).toBe('400.000000');
    });
  });

  describe('Exento handling', () => {
    it('exempt item - includes Base, excludes TasaOCuota and Importe', () => {
      const records: TaxRecord[] = [
        {
          type: 'traslado',
          impuesto: '002',
          tipo_factor: 'Exento',
          base: '5000.000000',
        },
      ];

      const result = aggregateImpuestos(records);

      expect(result.traslados).toHaveLength(1);
      expect(result.traslados[0]).toEqual({
        base: '5000.000000',
        impuesto: '002',
        tipoFactor: 'Exento',
      });
      expect(result.traslados[0].tasaOCuota).toBeUndefined();
      expect(result.traslados[0].importe).toBeUndefined();
      expect(result.totalImpuestosTrasladados).toBeUndefined();
    });

    it('all exempt - no TotalImpuestosTrasladados', () => {
      const records: TaxRecord[] = [
        {
          type: 'traslado',
          impuesto: '002',
          tipo_factor: 'Exento',
          base: '3000.000000',
        },
        {
          type: 'traslado',
          impuesto: '002',
          tipo_factor: 'Exento',
          base: '2000.000000',
        },
      ];

      const result = aggregateImpuestos(records);

      expect(result.traslados).toHaveLength(1);
      expect(result.traslados[0].base).toBe('5000.000000');
      expect(result.traslados[0].tipoFactor).toBe('Exento');
      expect(result.totalImpuestosTrasladados).toBeUndefined();
    });

    it('mixed Tasa and Exento - TotalImpuestosTrasladados only includes Tasa', () => {
      const records: TaxRecord[] = [
        {
          type: 'traslado',
          impuesto: '002',
          tipo_factor: 'Tasa',
          tasa_o_cuota: '0.160000',
          base: '10000.000000',
          importe: '1600.000000',
        },
        {
          type: 'traslado',
          impuesto: '002',
          tipo_factor: 'Exento',
          base: '5000.000000',
        },
      ];

      const result = aggregateImpuestos(records);

      expect(result.traslados).toHaveLength(2);
      expect(result.totalImpuestosTrasladados).toBe('1600.000000');
    });
  });

  describe('retenciones', () => {
    it('ISR + IVA retentions', () => {
      const records: TaxRecord[] = [
        {
          type: 'retencion',
          impuesto: '001', // ISR
          tipo_factor: 'Tasa',
          tasa_o_cuota: '0.100000',
          base: '10000.000000',
          importe: '1000.000000',
        },
        {
          type: 'retencion',
          impuesto: '002', // IVA
          tipo_factor: 'Tasa',
          tasa_o_cuota: '0.106667',
          base: '10000.000000',
          importe: '1066.670000',
        },
      ];

      const result = aggregateImpuestos(records);

      expect(result.retenciones).toHaveLength(2);
      expect(result.totalImpuestosRetenidos).toBe('2066.670000');

      const isrRetencion = result.retenciones.find((r) => r.impuesto === '001');
      const ivaRetencion = result.retenciones.find((r) => r.impuesto === '002');

      expect(isrRetencion).toBeDefined();
      expect(isrRetencion!.importe).toBe('1000.000000');

      expect(ivaRetencion).toBeDefined();
      expect(ivaRetencion!.importe).toBe('1066.670000');
    });

    it('multiple items with ISR retention - sums correctly', () => {
      const records: TaxRecord[] = [
        {
          type: 'retencion',
          impuesto: '001',
          tipo_factor: 'Tasa',
          tasa_o_cuota: '0.100000',
          base: '5000.000000',
          importe: '500.000000',
        },
        {
          type: 'retencion',
          impuesto: '001',
          tipo_factor: 'Tasa',
          tasa_o_cuota: '0.100000',
          base: '5000.000000',
          importe: '500.000000',
        },
      ];

      const result = aggregateImpuestos(records);

      expect(result.retenciones).toHaveLength(1);
      expect(result.retenciones[0].importe).toBe('1000.000000');
      expect(result.totalImpuestosRetenidos).toBe('1000.000000');
    });
  });

  describe('mixed scenarios', () => {
    it('traslado IVA + retencion ISR', () => {
      const records: TaxRecord[] = [
        {
          type: 'traslado',
          impuesto: '002',
          tipo_factor: 'Tasa',
          tasa_o_cuota: '0.160000',
          base: '10000.000000',
          importe: '1600.000000',
        },
        {
          type: 'retencion',
          impuesto: '001',
          tipo_factor: 'Tasa',
          tasa_o_cuota: '0.100000',
          base: '10000.000000',
          importe: '1000.000000',
        },
      ];

      const result = aggregateImpuestos(records);

      expect(result.traslados).toHaveLength(1);
      expect(result.retenciones).toHaveLength(1);
      expect(result.totalImpuestosTrasladados).toBe('1600.000000');
      expect(result.totalImpuestosRetenidos).toBe('1000.000000');
    });

    it('full professional services scenario', () => {
      // Base 10000, IVA 16% traslado, IVA 10.67% retention, ISR 10% retention
      const records: TaxRecord[] = [
        {
          type: 'traslado',
          impuesto: '002',
          tipo_factor: 'Tasa',
          tasa_o_cuota: '0.160000',
          base: '10000.000000',
          importe: '1600.000000',
        },
        {
          type: 'retencion',
          impuesto: '002', // IVA retention
          tipo_factor: 'Tasa',
          tasa_o_cuota: '0.106667',
          base: '10000.000000',
          importe: '1066.670000',
        },
        {
          type: 'retencion',
          impuesto: '001', // ISR retention
          tipo_factor: 'Tasa',
          tasa_o_cuota: '0.100000',
          base: '10000.000000',
          importe: '1000.000000',
        },
      ];

      const result = aggregateImpuestos(records);

      expect(result.traslados).toHaveLength(1);
      expect(result.traslados[0].importe).toBe('1600.000000');

      expect(result.retenciones).toHaveLength(2);
      expect(result.totalImpuestosRetenidos).toBe('2066.670000');
      expect(result.totalImpuestosTrasladados).toBe('1600.000000');
    });
  });

  describe('precision and arithmetic', () => {
    it('uses Decimal.js arithmetic (no floating-point errors)', () => {
      // 3 items at base 333.333333 each = 999.999999, not 1000.000001
      const records: TaxRecord[] = [
        {
          type: 'traslado',
          impuesto: '002',
          tipo_factor: 'Tasa',
          tasa_o_cuota: '0.160000',
          base: '333.333333',
          importe: '53.333333',
        },
        {
          type: 'traslado',
          impuesto: '002',
          tipo_factor: 'Tasa',
          tasa_o_cuota: '0.160000',
          base: '333.333333',
          importe: '53.333333',
        },
        {
          type: 'traslado',
          impuesto: '002',
          tipo_factor: 'Tasa',
          tasa_o_cuota: '0.160000',
          base: '333.333334',
          importe: '53.333334',
        },
      ];

      const result = aggregateImpuestos(records);

      expect(result.traslados).toHaveLength(1);
      expect(result.traslados[0].base).toBe('1000.000000');
      expect(result.traslados[0].importe).toBe('160.000000');
    });

    it('handles large numbers without precision loss', () => {
      const records: TaxRecord[] = [
        {
          type: 'traslado',
          impuesto: '002',
          tipo_factor: 'Tasa',
          tasa_o_cuota: '0.160000',
          base: '999999999.999999',
          importe: '159999999.999999',
        },
      ];

      const result = aggregateImpuestos(records);

      expect(result.traslados[0].base).toBe('999999999.999999');
      expect(result.traslados[0].importe).toBe('159999999.999999');
    });

    it('handles very small values', () => {
      const records: TaxRecord[] = [
        {
          type: 'traslado',
          impuesto: '002',
          tipo_factor: 'Tasa',
          tasa_o_cuota: '0.160000',
          base: '0.010000',
          importe: '0.001600',
        },
      ];

      const result = aggregateImpuestos(records);

      expect(result.traslados[0].base).toBe('0.010000');
      expect(result.traslados[0].importe).toBe('0.001600');
    });
  });

  describe('empty and edge cases', () => {
    it('empty records array', () => {
      const result = aggregateImpuestos([]);

      expect(result.traslados).toHaveLength(0);
      expect(result.retenciones).toHaveLength(0);
      expect(result.totalImpuestosTrasladados).toBeUndefined();
      expect(result.totalImpuestosRetenidos).toBeUndefined();
    });

    it('zero IVA rate (0%)', () => {
      const records: TaxRecord[] = [
        {
          type: 'traslado',
          impuesto: '002',
          tipo_factor: 'Tasa',
          tasa_o_cuota: '0.000000',
          base: '10000.000000',
          importe: '0.000000',
        },
      ];

      const result = aggregateImpuestos(records);

      expect(result.traslados).toHaveLength(1);
      expect(result.traslados[0].tasaOCuota).toBe('0.000000');
      expect(result.traslados[0].importe).toBe('0.000000');
      expect(result.totalImpuestosTrasladados).toBe('0.000000');
    });
  });
});

describe('collectTaxRecords', () => {
  it('flattens tax_breakdown from multiple items', () => {
    const items = [
      {
        tax_breakdown: [
          { type: 'traslado' as const, impuesto: '002', tipo_factor: 'Tasa', base: '100', importe: '16' },
        ],
      },
      {
        tax_breakdown: [
          { type: 'traslado' as const, impuesto: '002', tipo_factor: 'Tasa', base: '200', importe: '32' },
          { type: 'retencion' as const, impuesto: '001', tipo_factor: 'Tasa', base: '200', importe: '20' },
        ],
      },
    ];

    const records = collectTaxRecords(items);

    expect(records).toHaveLength(3);
    expect(records[0].base).toBe('100');
    expect(records[1].base).toBe('200');
    expect(records[2].type).toBe('retencion');
  });

  it('handles empty tax_breakdown arrays', () => {
    const items = [
      { tax_breakdown: [] },
      { tax_breakdown: [{ type: 'traslado' as const, impuesto: '002', tipo_factor: 'Tasa', base: '100', importe: '16' }] },
    ];

    const records = collectTaxRecords(items);

    expect(records).toHaveLength(1);
  });

  it('handles no items', () => {
    const records = collectTaxRecords([]);
    expect(records).toHaveLength(0);
  });
});
