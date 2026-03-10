/**
 * PDF Styles Tests (Component 16)
 */

import { describe, it, expect } from 'vitest';
import {
  buildLayoutConfig,
  getCatalogLabel,
  getTaxLabel,
  formatTaxRate,
  getLabels,
  PAGE_SIZES,
  DEFAULT_COLORS,
  FONTS,
  TIPO_COMPROBANTE,
  FORMA_PAGO,
  METODO_PAGO,
  IMPUESTO,
  USO_CFDI,
  REGIMEN_FISCAL,
  LABELS,
} from '../styles';

// ============================================================================
// buildLayoutConfig Tests
// ============================================================================

describe('buildLayoutConfig', () => {
  it('should build LETTER layout with correct dimensions', () => {
    const layout = buildLayoutConfig('LETTER');

    expect(layout.pageWidth).toBe(612);
    expect(layout.pageHeight).toBe(792);
    expect(layout.contentWidth).toBe(532); // 612 - 40 - 40
  });

  it('should build A4 layout with correct dimensions', () => {
    const layout = buildLayoutConfig('A4');

    expect(layout.pageWidth).toBe(595.28);
    expect(layout.pageHeight).toBe(841.89);
    expect(layout.contentWidth).toBe(515.28); // 595.28 - 40 - 40
  });

  it('should use default colors when no branding provided', () => {
    const layout = buildLayoutConfig('LETTER');

    expect(layout.colors.primary).toBe(DEFAULT_COLORS.primary);
    expect(layout.colors.secondary).toBe(DEFAULT_COLORS.secondary);
    expect(layout.colors.text).toBe(DEFAULT_COLORS.text);
  });

  it('should override primary color from branding', () => {
    const layout = buildLayoutConfig('LETTER', { primaryColor: '#FF0000' });

    expect(layout.colors.primary).toBe('#FF0000');
    expect(layout.colors.headerBg).toBe('#FF0000');
    expect(layout.colors.secondary).toBe(DEFAULT_COLORS.secondary);
  });

  it('should override secondary color from branding', () => {
    const layout = buildLayoutConfig('LETTER', { secondaryColor: '#00FF00' });

    expect(layout.colors.secondary).toBe('#00FF00');
    expect(layout.colors.primary).toBe(DEFAULT_COLORS.primary);
  });

  it('should include correct margins', () => {
    const layout = buildLayoutConfig('LETTER');

    expect(layout.margin.top).toBe(40);
    expect(layout.margin.right).toBe(40);
    expect(layout.margin.bottom).toBe(40);
    expect(layout.margin.left).toBe(40);
  });

  it('should include font configuration', () => {
    const layout = buildLayoutConfig('LETTER');

    expect(layout.fonts.regular).toBe('Helvetica');
    expect(layout.fonts.bold).toBe('Helvetica-Bold');
    expect(layout.fonts.sizes.normal).toBe(9);
    expect(layout.fonts.sizes.title).toBe(14);
  });
});

// ============================================================================
// SAT Catalog Tests
// ============================================================================

describe('TIPO_COMPROBANTE', () => {
  it('should have all document types', () => {
    expect(TIPO_COMPROBANTE['I']).toBe('Ingreso');
    expect(TIPO_COMPROBANTE['E']).toBe('Egreso');
    expect(TIPO_COMPROBANTE['T']).toBe('Traslado');
    expect(TIPO_COMPROBANTE['N']).toBe('Nómina');
    expect(TIPO_COMPROBANTE['P']).toBe('Pago');
  });
});

describe('FORMA_PAGO', () => {
  it('should have common payment forms', () => {
    expect(FORMA_PAGO['01']).toBe('Efectivo');
    expect(FORMA_PAGO['03']).toBe('Transferencia electrónica de fondos');
    expect(FORMA_PAGO['04']).toBe('Tarjeta de crédito');
    expect(FORMA_PAGO['28']).toBe('Tarjeta de débito');
    expect(FORMA_PAGO['99']).toBe('Por definir');
  });

  it('should have at least 20 payment forms', () => {
    expect(Object.keys(FORMA_PAGO).length).toBeGreaterThanOrEqual(20);
  });
});

describe('METODO_PAGO', () => {
  it('should have PUE and PPD', () => {
    expect(METODO_PAGO['PUE']).toBe('Pago en una sola exhibición');
    expect(METODO_PAGO['PPD']).toBe('Pago en parcialidades o diferido');
  });
});

describe('IMPUESTO', () => {
  it('should have all tax types', () => {
    expect(IMPUESTO['001']).toBe('ISR');
    expect(IMPUESTO['002']).toBe('IVA');
    expect(IMPUESTO['003']).toBe('IEPS');
  });
});

describe('USO_CFDI', () => {
  it('should have common CFDI uses', () => {
    expect(USO_CFDI['G01']).toBe('Adquisición de mercancías');
    expect(USO_CFDI['G03']).toBe('Gastos en general');
    expect(USO_CFDI['P01']).toBe('Por definir');
    expect(USO_CFDI['S01']).toBe('Sin efectos fiscales');
  });

  it('should have at least 20 CFDI uses', () => {
    expect(Object.keys(USO_CFDI).length).toBeGreaterThanOrEqual(20);
  });
});

describe('REGIMEN_FISCAL', () => {
  it('should have common tax regimes', () => {
    expect(REGIMEN_FISCAL['601']).toBe('General de Ley Personas Morales');
    expect(REGIMEN_FISCAL['612']).toBe('Personas Físicas con Actividades Empresariales y Profesionales');
    expect(REGIMEN_FISCAL['626']).toBe('Régimen Simplificado de Confianza - RESICO');
  });

  it('should have all 20 regimes', () => {
    expect(Object.keys(REGIMEN_FISCAL).length).toBeGreaterThanOrEqual(20);
  });
});

// ============================================================================
// getCatalogLabel Tests
// ============================================================================

describe('getCatalogLabel', () => {
  it('should return code and label by default', () => {
    expect(getCatalogLabel(TIPO_COMPROBANTE, 'I')).toBe('I - Ingreso');
    expect(getCatalogLabel(FORMA_PAGO, '03')).toBe('03 - Transferencia electrónica de fondos');
  });

  it('should return label only when includeCode is false', () => {
    expect(getCatalogLabel(TIPO_COMPROBANTE, 'I', false)).toBe('Ingreso');
    expect(getCatalogLabel(FORMA_PAGO, '03', false)).toBe('Transferencia electrónica de fondos');
  });

  it('should return "Desconocido" for unknown codes', () => {
    expect(getCatalogLabel(TIPO_COMPROBANTE, 'X')).toBe('X - Desconocido');
    expect(getCatalogLabel(TIPO_COMPROBANTE, 'X', false)).toBe('Desconocido');
  });
});

// ============================================================================
// getTaxLabel Tests
// ============================================================================

describe('getTaxLabel', () => {
  it('should return ISR for 001', () => {
    expect(getTaxLabel('001')).toBe('ISR');
  });

  it('should return IVA for 002', () => {
    expect(getTaxLabel('002')).toBe('IVA');
  });

  it('should return IEPS for 003', () => {
    expect(getTaxLabel('003')).toBe('IEPS');
  });

  it('should return code for unknown tax', () => {
    expect(getTaxLabel('999')).toBe('999');
  });
});

// ============================================================================
// formatTaxRate Tests
// ============================================================================

describe('formatTaxRate', () => {
  it('should format 0.160000 as 16%', () => {
    expect(formatTaxRate('0.160000')).toBe('16%');
  });

  it('should format 0.080000 as 8%', () => {
    expect(formatTaxRate('0.080000')).toBe('8%');
  });

  it('should format 0.000000 as 0%', () => {
    expect(formatTaxRate('0.000000')).toBe('0%');
  });

  it('should format 0.106667 as 11%', () => {
    expect(formatTaxRate('0.106667')).toBe('11%');
  });

  it('should return original for invalid rate', () => {
    expect(formatTaxRate('invalid')).toBe('invalid');
  });
});

// ============================================================================
// getLabels Tests
// ============================================================================

describe('getLabels', () => {
  it('should return Spanish labels for es', () => {
    const labels = getLabels('es');
    expect(labels.invoice).toBe('FACTURA');
    expect(labels.fiscalReceipt).toBe('COMPROBANTE FISCAL DIGITAL POR INTERNET');
    expect(labels.issuer).toBe('DATOS DEL EMISOR');
  });

  it('should return English labels for en', () => {
    const labels = getLabels('en');
    expect(labels.invoice).toBe('INVOICE');
    expect(labels.fiscalReceipt).toBe('MEXICAN DIGITAL TAX RECEIPT (CFDI 4.0)');
    expect(labels.issuer).toBe('ISSUER');
  });
});

// ============================================================================
// Label Completeness Tests
// ============================================================================

describe('LABELS completeness', () => {
  it('should have same keys in es and en', () => {
    const esKeys = Object.keys(LABELS.es).sort();
    const enKeys = Object.keys(LABELS.en).sort();
    expect(esKeys).toEqual(enKeys);
  });

  it('should have all required document labels', () => {
    const required = [
      'invoice',
      'fiscalReceipt',
      'issuer',
      'receiver',
      'items',
      'stampData',
      'subtotal',
      'total',
      'fiscalFolio',
      'rfc',
    ];

    required.forEach((key) => {
      expect(LABELS.es).toHaveProperty(key);
      expect(LABELS.en).toHaveProperty(key);
    });
  });
});
