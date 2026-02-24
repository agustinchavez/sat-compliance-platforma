/**
 * Product Pricing Service
 *
 * Handles all price and tax calculations for products including
 * IVA trasladado, IVA retenido, and ISR retenido calculations
 * following Mexican tax regulations.
 */

import type {
  Product,
  TaxConfig,
  TaxCalculation,
  PriceCalculation,
  TaxObject,
  IVARate,
} from './types';
import {
  DEFAULT_IVA_RATE,
  DEFAULT_TAX_OBJECT,
  IVA_RETENTION_RATE,
  ISR_RETENTION_RATE_SERVICES,
} from './types';

// ============================================================================
// Tax Calculations
// ============================================================================

/**
 * Calculate taxes for a given base amount
 *
 * @param base - Base amount before taxes
 * @param config - Tax configuration
 * @returns Tax calculation breakdown
 *
 * @example
 * ```ts
 * // Standard 16% IVA
 * const taxes = calculateTaxes(1000, { tax_object: '02', iva_rate: 0.16, ... });
 * // → { base: 1000, iva_trasladado: 160, total: 1160, ... }
 *
 * // Service with retentions
 * const serviceTaxes = calculateTaxes(10000, {
 *   tax_object: '02',
 *   iva_rate: 0.16,
 *   iva_retention: true,
 *   iva_retention_rate: 0.1067,
 *   isr_retention: true,
 *   isr_retention_rate: 0.10,
 * });
 * // → { base: 10000, iva_trasladado: 1600, iva_retenido: 1067, isr_retenido: 1000, total: 9533 }
 * ```
 */
export function calculateTaxes(base: number, config: TaxConfig): TaxCalculation {
  let iva_trasladado = 0;
  let iva_retenido = 0;
  let isr_retenido = 0;

  // IVA trasladado (transferred IVA)
  if (!config.iva_exempt && config.tax_object === '02') {
    iva_trasladado = roundCurrency(base * config.iva_rate);
  }

  // IVA retenido (retained IVA - usually for services B2B)
  if (config.iva_retention && config.iva_retention_rate) {
    iva_retenido = roundCurrency(base * config.iva_retention_rate);
  }

  // ISR retenido (retained ISR - usually for professional services)
  if (config.isr_retention && config.isr_retention_rate) {
    isr_retenido = roundCurrency(base * config.isr_retention_rate);
  }

  const total = roundCurrency(base + iva_trasladado - iva_retenido - isr_retenido);

  return {
    base: roundCurrency(base),
    iva_trasladado,
    iva_retenido,
    isr_retenido,
    total,
  };
}

/**
 * Calculate full price breakdown for a product
 *
 * @param product - Product with pricing info
 * @param quantity - Quantity
 * @param discountPercent - Optional discount percentage (0-100)
 * @param discountAmount - Optional fixed discount amount
 * @returns Full price calculation
 */
export function calculatePrice(
  product: Pick<Product, 'price' | 'tax_object' | 'iva_rate' | 'iva_exempt' | 'iva_retention' | 'iva_retention_rate' | 'isr_retention' | 'isr_retention_rate'>,
  quantity: number,
  discountPercent?: number,
  discountAmount?: number
): PriceCalculation {
  const unit_price = product.price;
  const subtotal = roundCurrency(unit_price * quantity);

  // Calculate discount
  let discount = 0;
  let discount_percent: number | undefined;

  if (discountPercent !== undefined && discountPercent > 0) {
    discount = roundCurrency(subtotal * (discountPercent / 100));
    discount_percent = discountPercent;
  } else if (discountAmount !== undefined && discountAmount > 0) {
    discount = Math.min(discountAmount, subtotal);
    discount_percent = roundCurrency((discount / subtotal) * 100);
  }

  const taxable_base = roundCurrency(subtotal - discount);

  // Calculate taxes on the taxable base
  const taxConfig: TaxConfig = {
    tax_object: product.tax_object,
    iva_rate: product.iva_rate,
    iva_exempt: product.iva_exempt,
    iva_retention: product.iva_retention,
    iva_retention_rate: product.iva_retention_rate,
    isr_retention: product.isr_retention,
    isr_retention_rate: product.isr_retention_rate,
  };

  const taxes = calculateTaxes(taxable_base, taxConfig);

  return {
    quantity,
    unit_price,
    subtotal,
    discount,
    discount_percent,
    taxable_base,
    iva_trasladado: taxes.iva_trasladado,
    iva_retenido: taxes.iva_retenido,
    isr_retenido: taxes.isr_retenido,
    total: taxes.total,
  };
}

/**
 * Calculate IVA only (simple calculation)
 *
 * @param base - Base amount
 * @param rate - IVA rate (0, 0.08, or 0.16)
 * @returns IVA amount
 */
export function calculateIVA(base: number, rate: IVARate = DEFAULT_IVA_RATE): number {
  return roundCurrency(base * rate);
}

/**
 * Calculate total with IVA (simple calculation)
 *
 * @param base - Base amount
 * @param rate - IVA rate
 * @returns Total including IVA
 */
export function calculateTotalWithIVA(base: number, rate: IVARate = DEFAULT_IVA_RATE): number {
  return roundCurrency(base * (1 + rate));
}

/**
 * Calculate base from total (reverse IVA calculation)
 *
 * @param total - Total including IVA
 * @param rate - IVA rate
 * @returns Base amount before IVA
 */
export function calculateBaseFromTotal(total: number, rate: IVARate = DEFAULT_IVA_RATE): number {
  return roundCurrency(total / (1 + rate));
}

// ============================================================================
// Discount Calculations
// ============================================================================

/**
 * Apply percentage discount to amount
 *
 * @param amount - Original amount
 * @param percent - Discount percentage (0-100)
 * @returns Discounted amount
 */
export function applyPercentDiscount(amount: number, percent: number): number {
  if (percent <= 0) return amount;
  if (percent >= 100) return 0;
  return roundCurrency(amount * (1 - percent / 100));
}

/**
 * Apply fixed discount to amount
 *
 * @param amount - Original amount
 * @param discount - Fixed discount amount
 * @returns Discounted amount (min 0)
 */
export function applyFixedDiscount(amount: number, discount: number): number {
  return Math.max(0, roundCurrency(amount - discount));
}

/**
 * Calculate discount amount from percentage
 *
 * @param amount - Original amount
 * @param percent - Discount percentage
 * @returns Discount amount
 */
export function calculateDiscountAmount(amount: number, percent: number): number {
  return roundCurrency(amount * (percent / 100));
}

// ============================================================================
// Currency Formatting
// ============================================================================

/**
 * Round to currency precision (4 decimal places for calculations, 2 for display)
 *
 * @param amount - Amount to round
 * @param decimals - Number of decimal places (default: 4)
 * @returns Rounded amount
 */
export function roundCurrency(amount: number, decimals: number = 4): number {
  const factor = Math.pow(10, decimals);
  return Math.round(amount * factor) / factor;
}

/**
 * Format price for display
 *
 * @param amount - Amount to format
 * @param currency - Currency code (default: MXN)
 * @param locale - Locale for formatting (default: es-MX)
 * @returns Formatted price string
 */
export function formatPrice(
  amount: number,
  currency: string = 'MXN',
  locale: string = 'es-MX'
): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

/**
 * Format price without currency symbol
 *
 * @param amount - Amount to format
 * @param locale - Locale for formatting
 * @returns Formatted number string
 */
export function formatNumber(amount: number, locale: string = 'es-MX'): string {
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

/**
 * Parse price string to number
 *
 * @param priceStr - Price string (e.g., "$1,234.56", "1234.56")
 * @returns Parsed number or NaN if invalid
 */
export function parsePrice(priceStr: string): number {
  if (!priceStr) return NaN;

  // Remove currency symbols, spaces, and thousand separators
  const cleaned = priceStr
    .replace(/[$€£¥]/g, '')
    .replace(/\s/g, '')
    .replace(/,/g, '');

  return parseFloat(cleaned);
}

// ============================================================================
// Tax Configuration Helpers
// ============================================================================

/**
 * Get default tax configuration for a product type
 *
 * @param type - 'product' or 'service'
 * @returns Default tax configuration
 */
export function getDefaultTaxConfig(type: 'product' | 'service'): TaxConfig {
  if (type === 'service') {
    return {
      tax_object: DEFAULT_TAX_OBJECT,
      iva_rate: DEFAULT_IVA_RATE,
      iva_exempt: false,
      iva_retention: false,
      iva_retention_rate: undefined,
      isr_retention: false,
      isr_retention_rate: undefined,
    };
  }

  return {
    tax_object: DEFAULT_TAX_OBJECT,
    iva_rate: DEFAULT_IVA_RATE,
    iva_exempt: false,
    iva_retention: false,
    iva_retention_rate: undefined,
    isr_retention: false,
    isr_retention_rate: undefined,
  };
}

/**
 * Get service tax configuration with retentions
 *
 * Used for professional services where client is a company (B2B)
 *
 * @returns Tax config with standard service retentions
 */
export function getServiceB2BTaxConfig(): TaxConfig {
  return {
    tax_object: '02' as TaxObject,
    iva_rate: 0.16 as IVARate,
    iva_exempt: false,
    iva_retention: true,
    iva_retention_rate: IVA_RETENTION_RATE,
    isr_retention: true,
    isr_retention_rate: ISR_RETENTION_RATE_SERVICES,
  };
}

/**
 * Get exempt tax configuration
 *
 * For products/services exempt from IVA
 *
 * @returns Tax config for exempt items
 */
export function getExemptTaxConfig(): TaxConfig {
  return {
    tax_object: '01' as TaxObject,
    iva_rate: 0 as IVARate,
    iva_exempt: true,
    iva_retention: false,
    iva_retention_rate: undefined,
    isr_retention: false,
    isr_retention_rate: undefined,
  };
}

/**
 * Check if tax configuration has retentions
 *
 * @param config - Tax configuration
 * @returns True if has any retention
 */
export function hasRetentions(config: TaxConfig): boolean {
  return (config.iva_retention && !!config.iva_retention_rate) ||
         (config.isr_retention && !!config.isr_retention_rate);
}

/**
 * Get tax object display name
 *
 * @param taxObject - Tax object code
 * @returns Human-readable name
 */
export function getTaxObjectName(taxObject: TaxObject): string {
  switch (taxObject) {
    case '01':
      return 'No objeto de impuesto';
    case '02':
      return 'Sí objeto de impuesto';
    case '03':
      return 'Sí objeto de impuesto y no obligado al desglose';
    default:
      return 'Desconocido';
  }
}

/**
 * Get IVA rate display
 *
 * @param rate - IVA rate
 * @returns Formatted percentage string
 */
export function getIVARateDisplay(rate: IVARate): string {
  return `${(rate * 100).toFixed(0)}%`;
}

// ============================================================================
// Bulk Calculations
// ============================================================================

/**
 * Calculate totals for multiple line items
 *
 * @param items - Array of price calculations
 * @returns Aggregated totals
 */
export function calculateTotals(items: PriceCalculation[]): {
  subtotal: number;
  discount: number;
  iva_trasladado: number;
  iva_retenido: number;
  isr_retenido: number;
  total: number;
} {
  return items.reduce(
    (acc, item) => ({
      subtotal: roundCurrency(acc.subtotal + item.subtotal),
      discount: roundCurrency(acc.discount + item.discount),
      iva_trasladado: roundCurrency(acc.iva_trasladado + item.iva_trasladado),
      iva_retenido: roundCurrency(acc.iva_retenido + item.iva_retenido),
      isr_retenido: roundCurrency(acc.isr_retenido + item.isr_retenido),
      total: roundCurrency(acc.total + item.total),
    }),
    {
      subtotal: 0,
      discount: 0,
      iva_trasladado: 0,
      iva_retenido: 0,
      isr_retenido: 0,
      total: 0,
    }
  );
}
