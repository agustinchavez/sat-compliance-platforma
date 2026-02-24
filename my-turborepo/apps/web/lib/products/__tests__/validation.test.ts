/**
 * Validation Service Tests
 *
 * Tests for product, SKU, price, tax, and inventory validation.
 */

import { describe, it, expect } from 'vitest';
import {
  validateSKUFormat,
  validatePrice,
  validatePriceRange,
  validateTaxConfig,
  validateInventoryConfig,
  validateProductName,
  validateProductForInvoice,
  isValidIVARate,
  isValidTaxObject,
} from '../validation';
import type { TaxConfig } from '../types';

// ============================================================================
// SKU Validation
// ============================================================================

describe('validateSKUFormat', () => {
  it('should accept valid SKU formats', () => {
    expect(validateSKUFormat('PRD-001')).toHaveLength(0);
    expect(validateSKUFormat('SRV-12345')).toHaveLength(0);
    expect(validateSKUFormat('ABC123')).toHaveLength(0);
    expect(validateSKUFormat('product_code_123')).toHaveLength(0);
    expect(validateSKUFormat('ITEM-2023-XYZ')).toHaveLength(0);
  });

  it('should reject empty SKU', () => {
    const errors = validateSKUFormat('');
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain('required');
  });

  it('should reject whitespace-only SKU', () => {
    const errors = validateSKUFormat('   ');
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain('required');
  });

  it('should reject SKU exceeding max length', () => {
    const longSKU = 'A'.repeat(101);
    const errors = validateSKUFormat(longSKU);
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain('100 characters');
  });

  it('should reject SKU with special characters', () => {
    expect(validateSKUFormat('PRD@001')).toHaveLength(1);
    expect(validateSKUFormat('item#123')).toHaveLength(1);
    expect(validateSKUFormat('product.code')).toHaveLength(1);
    expect(validateSKUFormat('item code')).toHaveLength(1);
  });

  it('should accept hyphens and underscores', () => {
    expect(validateSKUFormat('PRD-001_A')).toHaveLength(0);
    expect(validateSKUFormat('__test__')).toHaveLength(0);
    expect(validateSKUFormat('---')).toHaveLength(0);
  });
});

// ============================================================================
// Price Validation
// ============================================================================

describe('validatePrice', () => {
  it('should accept valid prices', () => {
    expect(validatePrice(0)).toHaveLength(0);
    expect(validatePrice(1)).toHaveLength(0);
    expect(validatePrice(1000)).toHaveLength(0);
    expect(validatePrice(1234.5678)).toHaveLength(0);
    expect(validatePrice(999999999999.9999)).toHaveLength(0);
  });

  it('should reject negative prices', () => {
    const errors = validatePrice(-1);
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain('negative');
  });

  it('should reject prices exceeding maximum', () => {
    const errors = validatePrice(1000000000000);
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain('maximum');
  });

  it('should reject more than 4 decimal places', () => {
    const errors = validatePrice(1.23456);
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain('4 decimal places');
  });

  it('should accept exactly 4 decimal places', () => {
    expect(validatePrice(1.2345)).toHaveLength(0);
  });

  it('should reject NaN', () => {
    const errors = validatePrice(NaN);
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain('valid number');
  });
});

describe('validatePriceRange', () => {
  it('should accept valid ranges', () => {
    expect(validatePriceRange(0, 100)).toBe(true);
    expect(validatePriceRange(50, 100)).toBe(true);
    expect(validatePriceRange(100, 100)).toBe(true);
  });

  it('should accept undefined values', () => {
    expect(validatePriceRange()).toBe(true);
    expect(validatePriceRange(0)).toBe(true);
    expect(validatePriceRange(undefined, 100)).toBe(true);
  });

  it('should reject min greater than max', () => {
    expect(validatePriceRange(100, 50)).toBe(false);
  });

  it('should reject negative min', () => {
    expect(validatePriceRange(-10, 100)).toBe(false);
  });

  it('should reject negative max', () => {
    expect(validatePriceRange(0, -10)).toBe(false);
  });
});

// ============================================================================
// Tax Configuration Validation
// ============================================================================

describe('validateTaxConfig', () => {
  it('should accept valid standard tax config', () => {
    const config: Partial<TaxConfig> = {
      tax_object: '02',
      iva_rate: 0.16,
      iva_exempt: false,
    };
    expect(validateTaxConfig(config)).toHaveLength(0);
  });

  it('should accept all valid tax objects', () => {
    expect(validateTaxConfig({ tax_object: '01' })).toHaveLength(0);
    expect(validateTaxConfig({ tax_object: '02' })).toHaveLength(0);
    expect(validateTaxConfig({ tax_object: '03' })).toHaveLength(0);
  });

  it('should reject invalid tax object', () => {
    const errors = validateTaxConfig({ tax_object: '04' as '01' });
    expect(errors).toHaveLength(1);
    expect(errors[0].field).toBe('tax_object');
  });

  it('should accept all valid IVA rates', () => {
    expect(validateTaxConfig({ iva_rate: 0 })).toHaveLength(0);
    expect(validateTaxConfig({ iva_rate: 0.08 })).toHaveLength(0);
    expect(validateTaxConfig({ iva_rate: 0.16 })).toHaveLength(0);
  });

  it('should reject invalid IVA rates', () => {
    const errors = validateTaxConfig({ iva_rate: 0.10 as 0.16 });
    expect(errors).toHaveLength(1);
    expect(errors[0].field).toBe('iva_rate');
  });

  it('should reject IVA exempt with non-zero rate', () => {
    const errors = validateTaxConfig({
      iva_exempt: true,
      iva_rate: 0.16,
    });
    expect(errors).toHaveLength(1);
    expect(errors[0].field).toBe('iva_exempt');
  });

  it('should accept IVA exempt with zero rate', () => {
    const errors = validateTaxConfig({
      iva_exempt: true,
      iva_rate: 0,
    });
    expect(errors).toHaveLength(0);
  });

  it('should require IVA retention rate when retention enabled', () => {
    const errors = validateTaxConfig({
      iva_retention: true,
      iva_retention_rate: undefined,
    });
    expect(errors).toHaveLength(1);
    expect(errors[0].field).toBe('iva_retention_rate');
  });

  it('should accept valid IVA retention config', () => {
    const errors = validateTaxConfig({
      iva_retention: true,
      iva_retention_rate: 0.1067,
    });
    expect(errors).toHaveLength(0);
  });

  it('should reject IVA retention rate outside 0-1', () => {
    expect(validateTaxConfig({
      iva_retention: true,
      iva_retention_rate: -0.1,
    })).toHaveLength(1);

    expect(validateTaxConfig({
      iva_retention: true,
      iva_retention_rate: 1.5,
    })).toHaveLength(1);
  });

  it('should require ISR retention rate when retention enabled', () => {
    const errors = validateTaxConfig({
      isr_retention: true,
      isr_retention_rate: undefined,
    });
    expect(errors).toHaveLength(1);
    expect(errors[0].field).toBe('isr_retention_rate');
  });

  it('should accept valid ISR retention config', () => {
    const errors = validateTaxConfig({
      isr_retention: true,
      isr_retention_rate: 0.10,
    });
    expect(errors).toHaveLength(0);
  });

  it('should validate tax_object 01 has no IVA', () => {
    const errors = validateTaxConfig({
      tax_object: '01',
      iva_rate: 0.16,
    });
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain('IVA rate of 0');
  });

  it('should accept tax_object 01 with zero rate', () => {
    const errors = validateTaxConfig({
      tax_object: '01',
      iva_rate: 0,
    });
    expect(errors).toHaveLength(0);
  });
});

// ============================================================================
// Inventory Validation
// ============================================================================

describe('validateInventoryConfig', () => {
  it('should accept valid inventory config', () => {
    expect(validateInventoryConfig(100, 10, 1000)).toHaveLength(0);
    expect(validateInventoryConfig(0, 0, 100)).toHaveLength(0);
    expect(validateInventoryConfig(50)).toHaveLength(0);
  });

  it('should reject negative current stock', () => {
    const errors = validateInventoryConfig(-10, 0, 100);
    expect(errors).toHaveLength(1);
    expect(errors[0].field).toBe('current_stock');
  });

  it('should reject negative min stock', () => {
    const errors = validateInventoryConfig(0, -5, 100);
    expect(errors).toHaveLength(1);
    expect(errors[0].field).toBe('min_stock');
  });

  it('should reject negative max stock', () => {
    // When max_stock is -100, we get 2 errors: negative max_stock AND min > max
    const errors = validateInventoryConfig(0, 0, -100);
    expect(errors.length).toBeGreaterThanOrEqual(1);
    expect(errors.some(e => e.field === 'max_stock')).toBe(true);
  });

  it('should reject min stock greater than max stock', () => {
    const errors = validateInventoryConfig(50, 100, 50);
    expect(errors).toHaveLength(1);
    expect(errors[0].field).toBe('min_stock');
    expect(errors[0].message).toContain('greater than maximum');
  });

  it('should accept equal min and max stock', () => {
    expect(validateInventoryConfig(50, 50, 50)).toHaveLength(0);
  });

  it('should accept undefined values', () => {
    expect(validateInventoryConfig()).toHaveLength(0);
    expect(validateInventoryConfig(undefined, 10)).toHaveLength(0);
    expect(validateInventoryConfig(50, undefined, 100)).toHaveLength(0);
  });
});

// ============================================================================
// Product Name Validation
// ============================================================================

describe('validateProductName', () => {
  it('should accept valid product names', () => {
    expect(validateProductName('Product Name')).toHaveLength(0);
    expect(validateProductName('Servicio de Consultoría Empresarial')).toHaveLength(0);
    expect(validateProductName('AB')).toHaveLength(0); // Min length
    expect(validateProductName('A'.repeat(255))).toHaveLength(0); // Max length
  });

  it('should reject empty name', () => {
    const errors = validateProductName('');
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain('required');
  });

  it('should reject whitespace-only name', () => {
    const errors = validateProductName('   ');
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain('required');
  });

  it('should reject name exceeding max length', () => {
    const longName = 'A'.repeat(256);
    const errors = validateProductName(longName);
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain('255 characters');
  });

  it('should reject name shorter than 2 characters', () => {
    const errors = validateProductName('A');
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain('2 characters');
  });

  it('should handle names with leading/trailing spaces', () => {
    // "  A  " trimmed is "A" which is < 2 chars
    const errors = validateProductName('  A  ');
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain('2 characters');
  });

  it('should accept names with special characters', () => {
    expect(validateProductName('Product #1 - (New!)')).toHaveLength(0);
    expect(validateProductName('Café & Té')).toHaveLength(0);
  });
});

// ============================================================================
// Product for Invoice Validation
// ============================================================================

describe('validateProductForInvoice', () => {
  it('should accept valid invoice product', () => {
    const product = {
      sat_product_code: '81112100',
      sat_unit_code: 'E48',
      unit_name: 'Hora',
      name: 'Consultoría',
      price: 1500,
      tax_object: '02',
    };

    const result = validateProductForInvoice(product);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should require sat_product_code', () => {
    const product = {
      sat_unit_code: 'E48',
      unit_name: 'Hora',
      name: 'Consultoría',
      price: 1500,
      tax_object: '02',
    };

    const result = validateProductForInvoice(product);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.field === 'sat_product_code')).toBe(true);
  });

  it('should require sat_unit_code', () => {
    const product = {
      sat_product_code: '81112100',
      unit_name: 'Hora',
      name: 'Consultoría',
      price: 1500,
      tax_object: '02',
    };

    const result = validateProductForInvoice(product);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.field === 'sat_unit_code')).toBe(true);
  });

  it('should require unit_name', () => {
    const product = {
      sat_product_code: '81112100',
      sat_unit_code: 'E48',
      name: 'Consultoría',
      price: 1500,
      tax_object: '02',
    };

    const result = validateProductForInvoice(product);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.field === 'unit_name')).toBe(true);
  });

  it('should require name', () => {
    const product = {
      sat_product_code: '81112100',
      sat_unit_code: 'E48',
      unit_name: 'Hora',
      price: 1500,
      tax_object: '02',
    };

    const result = validateProductForInvoice(product);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.field === 'name')).toBe(true);
  });

  it('should require price', () => {
    const product = {
      sat_product_code: '81112100',
      sat_unit_code: 'E48',
      unit_name: 'Hora',
      name: 'Consultoría',
      tax_object: '02',
    };

    const result = validateProductForInvoice(product);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.field === 'price')).toBe(true);
  });

  it('should require tax_object', () => {
    const product = {
      sat_product_code: '81112100',
      sat_unit_code: 'E48',
      unit_name: 'Hora',
      name: 'Consultoría',
      price: 1500,
    };

    const result = validateProductForInvoice(product);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.field === 'tax_object')).toBe(true);
  });

  it('should collect all missing fields', () => {
    const product = {};

    const result = validateProductForInvoice(product);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBe(6); // All 6 required fields missing
  });

  it('should accept price of 0', () => {
    const product = {
      sat_product_code: '81112100',
      sat_unit_code: 'E48',
      unit_name: 'Unidad',
      name: 'Muestra gratis',
      price: 0,
      tax_object: '02',
    };

    const result = validateProductForInvoice(product);
    expect(result.valid).toBe(true);
  });
});

// ============================================================================
// Type Guards
// ============================================================================

describe('isValidIVARate', () => {
  it('should return true for valid IVA rates', () => {
    expect(isValidIVARate(0)).toBe(true);
    expect(isValidIVARate(0.08)).toBe(true);
    expect(isValidIVARate(0.16)).toBe(true);
  });

  it('should return false for invalid IVA rates', () => {
    expect(isValidIVARate(0.10)).toBe(false);
    expect(isValidIVARate(0.15)).toBe(false);
    expect(isValidIVARate(0.20)).toBe(false);
    expect(isValidIVARate(-0.16)).toBe(false);
  });
});

describe('isValidTaxObject', () => {
  it('should return true for valid tax objects', () => {
    expect(isValidTaxObject('01')).toBe(true);
    expect(isValidTaxObject('02')).toBe(true);
    expect(isValidTaxObject('03')).toBe(true);
  });

  it('should return false for invalid tax objects', () => {
    expect(isValidTaxObject('00')).toBe(false);
    expect(isValidTaxObject('04')).toBe(false);
    expect(isValidTaxObject('1')).toBe(false);
    expect(isValidTaxObject('2')).toBe(false);
  });
});
