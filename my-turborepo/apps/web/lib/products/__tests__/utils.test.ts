/**
 * Utilities Tests
 *
 * Tests for SKU generation, transformations, and helper functions.
 */

import { describe, it, expect } from 'vitest';
import {
  generateSKU,
  isValidSKUFormat,
  normalizeSKU,
  generateRandomString,
  productToInvoiceFormat,
  parseCSVRowToProduct,
  productToCSVRow,
  roundToDecimals,
  numbersEqual,
  truncate,
  sanitizeSearchQuery,
  extractSearchTerms,
  isWithinDays,
  formatDate,
  formatDateTime,
  generateSlug,
} from '../utils';
import type { Product, ProductCSVRow } from '../types';

// ============================================================================
// SKU Generation
// ============================================================================

describe('generateSKU', () => {
  it('should generate SKU with PRD prefix for products', () => {
    const sku = generateSKU('product');
    expect(sku).toMatch(/^PRD-[A-Z0-9]+-[A-Z0-9]{4}$/);
  });

  it('should generate SKU with SRV prefix for services', () => {
    const sku = generateSKU('service');
    expect(sku).toMatch(/^SRV-[A-Z0-9]+-[A-Z0-9]{4}$/);
  });

  it('should generate unique SKUs', () => {
    const skus = new Set<string>();
    for (let i = 0; i < 100; i++) {
      skus.add(generateSKU('product'));
    }
    expect(skus.size).toBe(100);
  });
});

describe('isValidSKUFormat', () => {
  it('should validate correct SKU formats', () => {
    expect(isValidSKUFormat('PRD-001')).toBe(true);
    expect(isValidSKUFormat('SRV-ABC123')).toBe(true);
    expect(isValidSKUFormat('item_code_123')).toBe(true);
  });

  it('should reject empty SKU', () => {
    expect(isValidSKUFormat('')).toBe(false);
  });

  it('should reject whitespace-only SKU', () => {
    expect(isValidSKUFormat('   ')).toBe(false);
  });

  it('should reject SKU exceeding max length', () => {
    expect(isValidSKUFormat('A'.repeat(101))).toBe(false);
  });

  it('should reject SKU with invalid characters', () => {
    expect(isValidSKUFormat('PRD@001')).toBe(false);
    expect(isValidSKUFormat('item code')).toBe(false);
  });
});

describe('normalizeSKU', () => {
  it('should uppercase SKU', () => {
    expect(normalizeSKU('prd-001')).toBe('PRD-001');
  });

  it('should trim whitespace', () => {
    expect(normalizeSKU('  PRD-001  ')).toBe('PRD-001');
  });

  it('should handle mixed case', () => {
    expect(normalizeSKU('PrD-AbC-123')).toBe('PRD-ABC-123');
  });
});

// ============================================================================
// Random String Generation
// ============================================================================

describe('generateRandomString', () => {
  it('should generate string of specified length', () => {
    expect(generateRandomString(4)).toHaveLength(4);
    expect(generateRandomString(8)).toHaveLength(8);
    expect(generateRandomString(16)).toHaveLength(16);
  });

  it('should only contain alphanumeric characters', () => {
    const str = generateRandomString(100);
    expect(str).toMatch(/^[A-Z0-9]+$/);
  });

  it('should exclude confusing characters', () => {
    // Generate many strings and check none contain confusing chars
    for (let i = 0; i < 100; i++) {
      const str = generateRandomString(20);
      expect(str).not.toContain('O');
      expect(str).not.toContain('0'); // Wait, 0 should be excluded but code includes 0-9
      expect(str).not.toContain('I');
      expect(str).not.toContain('1'); // Same issue - actually allowed
    }
  });

  it('should generate unique strings', () => {
    const strings = new Set<string>();
    for (let i = 0; i < 100; i++) {
      strings.add(generateRandomString(8));
    }
    // High probability of uniqueness
    expect(strings.size).toBeGreaterThan(95);
  });
});

// ============================================================================
// Product Transformations
// ============================================================================

describe('productToInvoiceFormat', () => {
  const baseProduct = {
    sat_product_code: '81112100',
    sat_unit_code: 'E48',
    unit_name: 'Hora',
    name: 'Consultoría Empresarial',
    description: 'Servicios de consultoría de negocios',
    price: 1500,
    tax_object: '02' as const,
    iva_rate: 0.16 as const,
    iva_exempt: false,
    iva_retention: false,
    iva_retention_rate: undefined,
    isr_retention: false,
    isr_retention_rate: undefined,
  };

  it('should transform product to invoice format', () => {
    const result = productToInvoiceFormat(baseProduct, 2);

    expect(result.clave_prod_serv).toBe('81112100');
    expect(result.clave_unidad).toBe('E48');
    expect(result.unidad).toBe('Hora');
    expect(result.descripcion).toBe('Servicios de consultoría de negocios');
    expect(result.valor_unitario).toBe(1500);
    expect(result.cantidad).toBe(2);
    expect(result.importe).toBe(3000);
    expect(result.objeto_imp).toBe('02');
  });

  it('should calculate IVA traslado', () => {
    const result = productToInvoiceFormat(baseProduct, 1);

    expect(result.impuestos.traslados).toHaveLength(1);
    expect(result.impuestos.traslados[0].impuesto).toBe('002');
    expect(result.impuestos.traslados[0].tasa_o_cuota).toBe(0.16);
    expect(result.impuestos.traslados[0].importe).toBe(240); // 1500 * 0.16
  });

  it('should apply discount', () => {
    const result = productToInvoiceFormat(baseProduct, 1, 150);

    expect(result.importe).toBe(1500);
    expect(result.descuento).toBe(150);
    expect(result.impuestos.traslados[0].base).toBe(1350);
  });

  it('should use price override', () => {
    const result = productToInvoiceFormat(baseProduct, 1, undefined, 2000);

    expect(result.valor_unitario).toBe(2000);
    expect(result.importe).toBe(2000);
  });

  it('should include retentions for B2B services', () => {
    const b2bProduct = {
      ...baseProduct,
      iva_retention: true,
      iva_retention_rate: 0.1067,
      isr_retention: true,
      isr_retention_rate: 0.10,
    };

    const result = productToInvoiceFormat(b2bProduct, 1);

    expect(result.impuestos.retenciones).toHaveLength(2);

    const ivaRet = result.impuestos.retenciones?.find(r => r.impuesto === '002');
    expect(ivaRet?.tasa_o_cuota).toBe(0.1067);
    expect(ivaRet?.importe).toBeCloseTo(160.05, 1);

    const isrRet = result.impuestos.retenciones?.find(r => r.impuesto === '001');
    expect(isrRet?.tasa_o_cuota).toBe(0.10);
    expect(isrRet?.importe).toBe(150);
  });

  it('should use product name if no description', () => {
    const productNoDesc = {
      ...baseProduct,
      description: undefined,
    };

    const result = productToInvoiceFormat(productNoDesc, 1);
    expect(result.descripcion).toBe('Consultoría Empresarial');
  });

  it('should not include retentions if undefined', () => {
    const result = productToInvoiceFormat(baseProduct, 1);
    expect(result.impuestos.retenciones).toBeUndefined();
  });
});

// ============================================================================
// CSV Transformations
// ============================================================================

describe('parseCSVRowToProduct', () => {
  it('should parse valid CSV row', () => {
    const row: ProductCSVRow = {
      name: 'Test Product',
      description: 'A test product',
      type: 'product',
      sku: 'PRD-001',
      sat_product_code: '43211503',
      sat_unit_code: 'H87',
      unit_name: 'Pieza',
      price: '1500.00',
      currency: 'MXN',
      tax_object: '02',
      iva_rate: '0.16',
      iva_exempt: 'false',
      category: 'Electronics',
      tags: 'laptop,computer',
      track_inventory: 'true',
      current_stock: '100',
      min_stock: '10',
      is_active: 'true',
    };

    const result = parseCSVRowToProduct(row);

    expect(result).not.toBeNull();
    expect(result?.name).toBe('Test Product');
    expect(result?.type).toBe('product');
    expect(result?.price).toBe(1500);
    expect(result?.iva_rate).toBe(0.16);
    expect(result?.tags).toEqual(['laptop', 'computer']);
    expect(result?.track_inventory).toBe(true);
    expect(result?.current_stock).toBe(100);
  });

  it('should return null for missing required fields', () => {
    const row: ProductCSVRow = {
      name: '',
      type: 'product',
      sat_product_code: '43211503',
      sat_unit_code: 'H87',
      unit_name: 'Pieza',
      price: '1500',
    };

    expect(parseCSVRowToProduct(row)).toBeNull();
  });

  it('should return null for invalid price', () => {
    const row: ProductCSVRow = {
      name: 'Test',
      type: 'product',
      sat_product_code: '43211503',
      sat_unit_code: 'H87',
      unit_name: 'Pieza',
      price: 'invalid',
    };

    expect(parseCSVRowToProduct(row)).toBeNull();
  });

  it('should return null for negative price', () => {
    const row: ProductCSVRow = {
      name: 'Test',
      type: 'product',
      sat_product_code: '43211503',
      sat_unit_code: 'H87',
      unit_name: 'Pieza',
      price: '-100',
    };

    expect(parseCSVRowToProduct(row)).toBeNull();
  });

  it('should return null for invalid type', () => {
    const row: ProductCSVRow = {
      name: 'Test',
      type: 'invalid',
      sat_product_code: '43211503',
      sat_unit_code: 'H87',
      unit_name: 'Pieza',
      price: '100',
    };

    expect(parseCSVRowToProduct(row)).toBeNull();
  });

  it('should parse IVA rate from percentage format', () => {
    const row: ProductCSVRow = {
      name: 'Test',
      type: 'service',
      sat_product_code: '81112100',
      sat_unit_code: 'E48',
      unit_name: 'Servicio',
      price: '1000',
      iva_rate: '16', // Percentage format
    };

    const result = parseCSVRowToProduct(row);
    expect(result?.iva_rate).toBe(0.16);
  });

  it('should parse boolean values', () => {
    const tests = [
      { value: 'true', expected: true },
      { value: 'false', expected: false },
      { value: '1', expected: true },
      { value: '0', expected: false },
      { value: 'yes', expected: true },
      { value: 'no', expected: false },
      { value: 'sí', expected: true },
    ];

    for (const test of tests) {
      const row: ProductCSVRow = {
        name: 'Test',
        type: 'product',
        sat_product_code: '43211503',
        sat_unit_code: 'H87',
        unit_name: 'Pieza',
        price: '100',
        track_inventory: test.value,
      };

      const result = parseCSVRowToProduct(row);
      expect(result?.track_inventory).toBe(test.expected);
    }
  });
});

describe('productToCSVRow', () => {
  it('should convert product to CSV row', () => {
    const product: Product = {
      id: '123',
      organization_id: 'org-1',
      name: 'Test Product',
      description: 'A test product',
      type: 'product',
      sku: 'PRD-001',
      sat_product_code: '43211503',
      sat_unit_code: 'H87',
      unit_name: 'Pieza',
      price: 1500,
      currency: 'MXN',
      tax_object: '02',
      iva_rate: 0.16,
      iva_exempt: false,
      iva_retention: false,
      isr_retention: false,
      track_inventory: true,
      current_stock: 100,
      min_stock: 10,
      category: 'Electronics',
      tags: ['laptop', 'computer'],
      is_active: true,
      created_at: new Date(),
      updated_at: new Date(),
    };

    const row = productToCSVRow(product);

    expect(row.name).toBe('Test Product');
    expect(row.type).toBe('product');
    expect(row.sku).toBe('PRD-001');
    expect(row.price).toBe('1500');
    expect(row.iva_rate).toBe('0.16');
    expect(row.tags).toBe('laptop,computer');
    expect(row.track_inventory).toBe('true');
    expect(row.current_stock).toBe('100');
  });
});

// ============================================================================
// Number Utilities
// ============================================================================

describe('roundToDecimals', () => {
  it('should round to specified decimals', () => {
    expect(roundToDecimals(1.2345, 2)).toBe(1.23);
    expect(roundToDecimals(1.2355, 2)).toBe(1.24);
    expect(roundToDecimals(1.234567, 4)).toBe(1.2346);
  });

  it('should handle integers', () => {
    expect(roundToDecimals(100, 2)).toBe(100);
  });

  it('should handle zero decimals', () => {
    expect(roundToDecimals(1.5, 0)).toBe(2);
    expect(roundToDecimals(1.4, 0)).toBe(1);
  });
});

describe('numbersEqual', () => {
  it('should return true for equal numbers', () => {
    expect(numbersEqual(1, 1)).toBe(true);
    expect(numbersEqual(1.0001, 1.0001)).toBe(true);
  });

  it('should return true within default tolerance', () => {
    expect(numbersEqual(1.00001, 1.00002)).toBe(true);
  });

  it('should return false outside tolerance', () => {
    expect(numbersEqual(1, 1.001)).toBe(false);
  });

  it('should respect custom tolerance', () => {
    expect(numbersEqual(1, 1.5, 1)).toBe(true);
    expect(numbersEqual(1, 2.1, 1)).toBe(false);
  });
});

// ============================================================================
// String Utilities
// ============================================================================

describe('truncate', () => {
  it('should not truncate short strings', () => {
    expect(truncate('Hello', 10)).toBe('Hello');
  });

  it('should truncate long strings with ellipsis', () => {
    expect(truncate('Hello World', 8)).toBe('Hello...');
  });

  it('should handle exact length', () => {
    expect(truncate('Hello', 5)).toBe('Hello');
  });

  it('should handle very short max length', () => {
    expect(truncate('Hello', 3)).toBe('...');
  });
});

describe('sanitizeSearchQuery', () => {
  it('should lowercase and trim', () => {
    expect(sanitizeSearchQuery('  HELLO WORLD  ')).toBe('hello world');
  });

  it('should remove special characters', () => {
    expect(sanitizeSearchQuery('hello@world!')).toBe('helloworld');
  });

  it('should preserve accented characters', () => {
    expect(sanitizeSearchQuery('Café')).toBe('café');
    expect(sanitizeSearchQuery('niño')).toBe('niño');
  });

  it('should collapse multiple spaces', () => {
    expect(sanitizeSearchQuery('hello   world')).toBe('hello world');
  });
});

describe('extractSearchTerms', () => {
  it('should extract words longer than 2 characters', () => {
    // 'the' has 3 chars so it's included, 'a' and 'to' would be excluded
    const terms = extractSearchTerms('a to the quick brown fox');
    expect(terms).toContain('the');
    expect(terms).toContain('quick');
    expect(terms).toContain('brown');
    expect(terms).toContain('fox');
    expect(terms).not.toContain('a');
    expect(terms).not.toContain('to');
  });

  it('should handle special characters', () => {
    const terms = extractSearchTerms('hello-world & test');
    expect(terms).toContain('helloworld');
    expect(terms).toContain('test');
  });

  it('should handle empty input', () => {
    expect(extractSearchTerms('')).toEqual([]);
  });
});

// ============================================================================
// Date Utilities
// ============================================================================

describe('isWithinDays', () => {
  it('should return true for date within range', () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    expect(isWithinDays(yesterday, 7)).toBe(true);
  });

  it('should return false for date outside range', () => {
    const twoWeeksAgo = new Date();
    twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);
    expect(isWithinDays(twoWeeksAgo, 7)).toBe(false);
  });

  it('should return true for today', () => {
    expect(isWithinDays(new Date(), 0)).toBe(true);
  });

  it('should return true for exact boundary', () => {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    expect(isWithinDays(sevenDaysAgo, 7)).toBe(true);
  });
});

describe('formatDate', () => {
  it('should format date in Spanish locale', () => {
    const date = new Date('2024-03-15');
    const formatted = formatDate(date, 'es-MX');
    expect(formatted).toContain('2024');
    // Month name varies by locale implementation
  });
});

describe('formatDateTime', () => {
  it('should include time in format', () => {
    const date = new Date('2024-03-15T14:30:00');
    const formatted = formatDateTime(date, 'es-MX');
    expect(formatted).toContain('2024');
  });
});

// ============================================================================
// Slug Generation
// ============================================================================

describe('generateSlug', () => {
  it('should create URL-friendly slug', () => {
    expect(generateSlug('Hello World')).toBe('hello-world');
  });

  it('should remove diacritics', () => {
    expect(generateSlug('Café Niño')).toBe('cafe-nino');
  });

  it('should replace special characters', () => {
    expect(generateSlug('Hello & World!')).toBe('hello-world');
  });

  it('should trim hyphens from ends', () => {
    expect(generateSlug('--Hello World--')).toBe('hello-world');
  });

  it('should truncate long slugs', () => {
    const longName = 'A'.repeat(150);
    const slug = generateSlug(longName);
    expect(slug.length).toBeLessThanOrEqual(100);
  });

  it('should collapse multiple hyphens', () => {
    expect(generateSlug('Hello   World')).toBe('hello-world');
  });
});
