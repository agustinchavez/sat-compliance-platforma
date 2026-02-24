/**
 * Pricing Service Tests
 *
 * Tests for tax calculations, price breakdowns, and currency formatting.
 */

import { describe, it, expect } from 'vitest';
import {
  calculateTaxes,
  calculatePrice,
  calculateIVA,
  calculateTotalWithIVA,
  calculateBaseFromTotal,
  applyPercentDiscount,
  applyFixedDiscount,
  calculateDiscountAmount,
  roundCurrency,
  formatPrice,
  formatNumber,
  parsePrice,
  getDefaultTaxConfig,
  getServiceB2BTaxConfig,
  getExemptTaxConfig,
  hasRetentions,
  getTaxObjectName,
  getIVARateDisplay,
  calculateTotals,
} from '../pricing';
import type { TaxConfig, PriceCalculation } from '../types';

// ============================================================================
// Tax Calculations
// ============================================================================

describe('calculateTaxes', () => {
  it('should calculate standard 16% IVA', () => {
    const config: TaxConfig = {
      tax_object: '02',
      iva_rate: 0.16,
      iva_exempt: false,
      iva_retention: false,
      isr_retention: false,
    };

    const result = calculateTaxes(1000, config);

    expect(result.base).toBe(1000);
    expect(result.iva_trasladado).toBe(160);
    expect(result.iva_retenido).toBe(0);
    expect(result.isr_retenido).toBe(0);
    expect(result.total).toBe(1160);
  });

  it('should calculate 8% IVA for border regions', () => {
    const config: TaxConfig = {
      tax_object: '02',
      iva_rate: 0.08,
      iva_exempt: false,
      iva_retention: false,
      isr_retention: false,
    };

    const result = calculateTaxes(1000, config);

    expect(result.iva_trasladado).toBe(80);
    expect(result.total).toBe(1080);
  });

  it('should handle 0% IVA exempt products', () => {
    const config: TaxConfig = {
      tax_object: '02',
      iva_rate: 0,
      iva_exempt: true,
      iva_retention: false,
      isr_retention: false,
    };

    const result = calculateTaxes(1000, config);

    expect(result.iva_trasladado).toBe(0);
    expect(result.total).toBe(1000);
  });

  it('should not apply IVA for tax_object 01', () => {
    const config: TaxConfig = {
      tax_object: '01',
      iva_rate: 0.16,
      iva_exempt: false,
      iva_retention: false,
      isr_retention: false,
    };

    const result = calculateTaxes(1000, config);

    expect(result.iva_trasladado).toBe(0);
    expect(result.total).toBe(1000);
  });

  it('should calculate IVA retention for B2B services', () => {
    const config: TaxConfig = {
      tax_object: '02',
      iva_rate: 0.16,
      iva_exempt: false,
      iva_retention: true,
      iva_retention_rate: 0.1067,
      isr_retention: false,
    };

    const result = calculateTaxes(10000, config);

    expect(result.iva_trasladado).toBe(1600);
    expect(result.iva_retenido).toBe(1067);
    expect(result.total).toBe(10533); // 10000 + 1600 - 1067
  });

  it('should calculate ISR retention for professional services', () => {
    const config: TaxConfig = {
      tax_object: '02',
      iva_rate: 0.16,
      iva_exempt: false,
      iva_retention: false,
      isr_retention: true,
      isr_retention_rate: 0.10,
    };

    const result = calculateTaxes(10000, config);

    expect(result.iva_trasladado).toBe(1600);
    expect(result.isr_retenido).toBe(1000);
    expect(result.total).toBe(10600); // 10000 + 1600 - 1000
  });

  it('should calculate both IVA and ISR retentions', () => {
    const config: TaxConfig = {
      tax_object: '02',
      iva_rate: 0.16,
      iva_exempt: false,
      iva_retention: true,
      iva_retention_rate: 0.1067,
      isr_retention: true,
      isr_retention_rate: 0.10,
    };

    const result = calculateTaxes(10000, config);

    expect(result.base).toBe(10000);
    expect(result.iva_trasladado).toBe(1600);
    expect(result.iva_retenido).toBe(1067);
    expect(result.isr_retenido).toBe(1000);
    expect(result.total).toBe(9533); // 10000 + 1600 - 1067 - 1000
  });

  it('should handle decimal amounts correctly', () => {
    const config: TaxConfig = {
      tax_object: '02',
      iva_rate: 0.16,
      iva_exempt: false,
      iva_retention: false,
      isr_retention: false,
    };

    const result = calculateTaxes(1234.56, config);

    expect(result.iva_trasladado).toBe(197.5296);
    expect(result.total).toBe(1432.0896);
  });
});

// ============================================================================
// Price Calculations
// ============================================================================

describe('calculatePrice', () => {
  const product = {
    price: 1000,
    tax_object: '02' as const,
    iva_rate: 0.16 as const,
    iva_exempt: false,
    iva_retention: false,
    iva_retention_rate: undefined,
    isr_retention: false,
    isr_retention_rate: undefined,
  };

  it('should calculate price for single quantity', () => {
    const result = calculatePrice(product, 1);

    expect(result.quantity).toBe(1);
    expect(result.unit_price).toBe(1000);
    expect(result.subtotal).toBe(1000);
    expect(result.discount).toBe(0);
    expect(result.taxable_base).toBe(1000);
    expect(result.iva_trasladado).toBe(160);
    expect(result.total).toBe(1160);
  });

  it('should calculate price for multiple quantities', () => {
    const result = calculatePrice(product, 5);

    expect(result.quantity).toBe(5);
    expect(result.subtotal).toBe(5000);
    expect(result.iva_trasladado).toBe(800);
    expect(result.total).toBe(5800);
  });

  it('should apply percentage discount', () => {
    const result = calculatePrice(product, 1, 10); // 10% discount

    expect(result.subtotal).toBe(1000);
    expect(result.discount).toBe(100);
    expect(result.discount_percent).toBe(10);
    expect(result.taxable_base).toBe(900);
    expect(result.iva_trasladado).toBe(144);
    expect(result.total).toBe(1044);
  });

  it('should apply fixed discount', () => {
    const result = calculatePrice(product, 1, undefined, 200); // $200 discount

    expect(result.subtotal).toBe(1000);
    expect(result.discount).toBe(200);
    expect(result.taxable_base).toBe(800);
    expect(result.iva_trasladado).toBe(128);
    expect(result.total).toBe(928);
  });

  it('should not exceed subtotal with fixed discount', () => {
    const result = calculatePrice(product, 1, undefined, 2000); // Exceeds price

    expect(result.discount).toBe(1000); // Capped at subtotal
    expect(result.taxable_base).toBe(0);
    expect(result.total).toBe(0);
  });

  it('should prefer percentage over fixed discount', () => {
    const result = calculatePrice(product, 1, 15, 100);

    expect(result.discount).toBe(150); // 15% of 1000
    expect(result.discount_percent).toBe(15);
  });

  it('should calculate with retentions', () => {
    const serviceProduct = {
      ...product,
      iva_retention: true,
      iva_retention_rate: 0.1067,
      isr_retention: true,
      isr_retention_rate: 0.10,
    };

    const result = calculatePrice(serviceProduct, 1);

    expect(result.iva_trasladado).toBe(160);
    expect(result.iva_retenido).toBe(106.7);
    expect(result.isr_retenido).toBe(100);
    expect(result.total).toBe(953.3); // 1000 + 160 - 106.7 - 100
  });
});

// ============================================================================
// Simple Tax Calculations
// ============================================================================

describe('calculateIVA', () => {
  it('should calculate IVA at 16%', () => {
    expect(calculateIVA(1000, 0.16)).toBe(160);
  });

  it('should calculate IVA at 8%', () => {
    expect(calculateIVA(1000, 0.08)).toBe(80);
  });

  it('should return 0 for 0% rate', () => {
    expect(calculateIVA(1000, 0)).toBe(0);
  });

  it('should use default 16% rate', () => {
    expect(calculateIVA(1000)).toBe(160);
  });
});

describe('calculateTotalWithIVA', () => {
  it('should calculate total with 16% IVA', () => {
    expect(calculateTotalWithIVA(1000, 0.16)).toBe(1160);
  });

  it('should calculate total with 8% IVA', () => {
    expect(calculateTotalWithIVA(1000, 0.08)).toBe(1080);
  });

  it('should return base for 0% IVA', () => {
    expect(calculateTotalWithIVA(1000, 0)).toBe(1000);
  });
});

describe('calculateBaseFromTotal', () => {
  it('should calculate base from total with 16% IVA', () => {
    const base = calculateBaseFromTotal(1160, 0.16);
    expect(base).toBe(1000);
  });

  it('should calculate base from total with 8% IVA', () => {
    const base = calculateBaseFromTotal(1080, 0.08);
    expect(base).toBe(1000);
  });

  it('should return total for 0% IVA', () => {
    expect(calculateBaseFromTotal(1000, 0)).toBe(1000);
  });

  it('should handle decimal totals', () => {
    const base = calculateBaseFromTotal(1432.09, 0.16);
    expect(base).toBeCloseTo(1234.56, 2);
  });
});

// ============================================================================
// Discount Calculations
// ============================================================================

describe('applyPercentDiscount', () => {
  it('should apply percentage discount', () => {
    expect(applyPercentDiscount(1000, 10)).toBe(900);
    expect(applyPercentDiscount(1000, 25)).toBe(750);
    expect(applyPercentDiscount(1000, 50)).toBe(500);
  });

  it('should return original for 0% discount', () => {
    expect(applyPercentDiscount(1000, 0)).toBe(1000);
  });

  it('should return 0 for 100% discount', () => {
    expect(applyPercentDiscount(1000, 100)).toBe(0);
  });

  it('should handle negative discount', () => {
    expect(applyPercentDiscount(1000, -10)).toBe(1000);
  });
});

describe('applyFixedDiscount', () => {
  it('should apply fixed discount', () => {
    expect(applyFixedDiscount(1000, 100)).toBe(900);
    expect(applyFixedDiscount(1000, 500)).toBe(500);
  });

  it('should not go below zero', () => {
    expect(applyFixedDiscount(1000, 1500)).toBe(0);
  });

  it('should handle exact amount', () => {
    expect(applyFixedDiscount(1000, 1000)).toBe(0);
  });
});

describe('calculateDiscountAmount', () => {
  it('should calculate discount amount from percentage', () => {
    expect(calculateDiscountAmount(1000, 10)).toBe(100);
    expect(calculateDiscountAmount(1000, 25)).toBe(250);
  });
});

// ============================================================================
// Currency Formatting
// ============================================================================

describe('roundCurrency', () => {
  it('should round to 4 decimal places by default', () => {
    expect(roundCurrency(1.23456789)).toBe(1.2346);
  });

  it('should round to specified decimals', () => {
    expect(roundCurrency(1.23456, 2)).toBe(1.23);
    expect(roundCurrency(1.23556, 2)).toBe(1.24);
  });

  it('should handle integers', () => {
    expect(roundCurrency(100)).toBe(100);
  });
});

describe('formatPrice', () => {
  it('should format price in MXN', () => {
    const formatted = formatPrice(1234.56);
    expect(formatted).toContain('1,234.56');
  });

  it('should format with currency symbol', () => {
    const formatted = formatPrice(1000, 'MXN', 'es-MX');
    expect(formatted).toContain('$');
  });

  it('should handle USD', () => {
    const formatted = formatPrice(1000, 'USD', 'en-US');
    expect(formatted).toContain('$');
    expect(formatted).toContain('1,000.00');
  });
});

describe('formatNumber', () => {
  it('should format number without currency', () => {
    const formatted = formatNumber(1234.56);
    expect(formatted).toBe('1,234.56');
  });
});

describe('parsePrice', () => {
  it('should parse price string', () => {
    expect(parsePrice('1234.56')).toBe(1234.56);
  });

  it('should handle currency symbol', () => {
    expect(parsePrice('$1234.56')).toBe(1234.56);
  });

  it('should handle thousand separators', () => {
    expect(parsePrice('1,234.56')).toBe(1234.56);
    expect(parsePrice('$1,234,567.89')).toBe(1234567.89);
  });

  it('should return NaN for invalid input', () => {
    expect(parsePrice('')).toBeNaN();
    expect(parsePrice('abc')).toBeNaN();
  });

  it('should handle various currency symbols', () => {
    expect(parsePrice('€100')).toBe(100);
    expect(parsePrice('£500')).toBe(500);
  });
});

// ============================================================================
// Tax Configuration Helpers
// ============================================================================

describe('getDefaultTaxConfig', () => {
  it('should return default config for products', () => {
    const config = getDefaultTaxConfig('product');

    expect(config.tax_object).toBe('02');
    expect(config.iva_rate).toBe(0.16);
    expect(config.iva_exempt).toBe(false);
    expect(config.iva_retention).toBe(false);
    expect(config.isr_retention).toBe(false);
  });

  it('should return default config for services', () => {
    const config = getDefaultTaxConfig('service');

    expect(config.tax_object).toBe('02');
    expect(config.iva_rate).toBe(0.16);
    expect(config.iva_retention).toBe(false);
    expect(config.isr_retention).toBe(false);
  });
});

describe('getServiceB2BTaxConfig', () => {
  it('should return B2B service config with retentions', () => {
    const config = getServiceB2BTaxConfig();

    expect(config.tax_object).toBe('02');
    expect(config.iva_rate).toBe(0.16);
    expect(config.iva_retention).toBe(true);
    expect(config.iva_retention_rate).toBe(0.1067);
    expect(config.isr_retention).toBe(true);
    expect(config.isr_retention_rate).toBe(0.10);
  });
});

describe('getExemptTaxConfig', () => {
  it('should return exempt config', () => {
    const config = getExemptTaxConfig();

    expect(config.tax_object).toBe('01');
    expect(config.iva_rate).toBe(0);
    expect(config.iva_exempt).toBe(true);
    expect(config.iva_retention).toBe(false);
    expect(config.isr_retention).toBe(false);
  });
});

describe('hasRetentions', () => {
  it('should return true for IVA retention', () => {
    const config: TaxConfig = {
      tax_object: '02',
      iva_rate: 0.16,
      iva_exempt: false,
      iva_retention: true,
      iva_retention_rate: 0.1067,
      isr_retention: false,
    };

    expect(hasRetentions(config)).toBe(true);
  });

  it('should return true for ISR retention', () => {
    const config: TaxConfig = {
      tax_object: '02',
      iva_rate: 0.16,
      iva_exempt: false,
      iva_retention: false,
      isr_retention: true,
      isr_retention_rate: 0.10,
    };

    expect(hasRetentions(config)).toBe(true);
  });

  it('should return false for no retentions', () => {
    const config: TaxConfig = {
      tax_object: '02',
      iva_rate: 0.16,
      iva_exempt: false,
      iva_retention: false,
      isr_retention: false,
    };

    expect(hasRetentions(config)).toBe(false);
  });
});

describe('getTaxObjectName', () => {
  it('should return correct name for tax objects', () => {
    expect(getTaxObjectName('01')).toBe('No objeto de impuesto');
    expect(getTaxObjectName('02')).toBe('Sí objeto de impuesto');
    expect(getTaxObjectName('03')).toBe('Sí objeto de impuesto y no obligado al desglose');
  });

  it('should return unknown for invalid code', () => {
    // @ts-expect-error - Testing invalid input
    expect(getTaxObjectName('99')).toBe('Desconocido');
  });
});

describe('getIVARateDisplay', () => {
  it('should format IVA rate as percentage', () => {
    expect(getIVARateDisplay(0.16)).toBe('16%');
    expect(getIVARateDisplay(0.08)).toBe('8%');
    expect(getIVARateDisplay(0)).toBe('0%');
  });
});

// ============================================================================
// Bulk Calculations
// ============================================================================

describe('calculateTotals', () => {
  it('should sum multiple line items', () => {
    const items: PriceCalculation[] = [
      {
        quantity: 2,
        unit_price: 500,
        subtotal: 1000,
        discount: 100,
        taxable_base: 900,
        iva_trasladado: 144,
        iva_retenido: 0,
        isr_retenido: 0,
        total: 1044,
      },
      {
        quantity: 3,
        unit_price: 300,
        subtotal: 900,
        discount: 0,
        taxable_base: 900,
        iva_trasladado: 144,
        iva_retenido: 0,
        isr_retenido: 0,
        total: 1044,
      },
    ];

    const totals = calculateTotals(items);

    expect(totals.subtotal).toBe(1900);
    expect(totals.discount).toBe(100);
    expect(totals.iva_trasladado).toBe(288);
    expect(totals.iva_retenido).toBe(0);
    expect(totals.isr_retenido).toBe(0);
    expect(totals.total).toBe(2088);
  });

  it('should handle empty array', () => {
    const totals = calculateTotals([]);

    expect(totals.subtotal).toBe(0);
    expect(totals.total).toBe(0);
  });

  it('should handle retentions in totals', () => {
    const items: PriceCalculation[] = [
      {
        quantity: 1,
        unit_price: 10000,
        subtotal: 10000,
        discount: 0,
        taxable_base: 10000,
        iva_trasladado: 1600,
        iva_retenido: 1067,
        isr_retenido: 1000,
        total: 9533,
      },
    ];

    const totals = calculateTotals(items);

    expect(totals.iva_trasladado).toBe(1600);
    expect(totals.iva_retenido).toBe(1067);
    expect(totals.isr_retenido).toBe(1000);
    expect(totals.total).toBe(9533);
  });
});
