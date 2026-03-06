/**
 * Invoice Calculations (Component 12 - Step 3)
 *
 * All monetary calculations use decimal.js to avoid floating-point errors.
 * CFDI 4.0 allows up to 6 decimal places for amounts.
 */

import Decimal from "decimal.js";
import type {
  InvoiceItemInput,
  Invoice,
  InvoiceItem,
  LineItemCalculation,
  InvoiceTotals,
} from "./types";

// Configure Decimal.js for financial calculations
// 20 digits of precision, round half up (banker's rounding)
Decimal.set({ precision: 20, rounding: Decimal.ROUND_HALF_UP });

// CFDI precision constants
const AMOUNT_PRECISION = 6; // Max decimal places for line items
const TOTAL_PRECISION = 2; // Decimal places for invoice total
const RATE_PRECISION = 6; // Decimal places for tax rates

/**
 * Round a Decimal to a specific number of decimal places.
 */
function roundTo(value: Decimal, places: number): Decimal {
  return value.toDecimalPlaces(places, Decimal.ROUND_HALF_UP);
}

/**
 * Calculate all amounts for a single invoice line item.
 *
 * Formula:
 * - subtotal = quantity * unit_price
 * - taxable_base = subtotal - discount_amount
 * - iva_trasladado = taxable_base * iva_rate (if tax_object != '01' and !iva_exempt)
 * - iva_retenido = taxable_base * iva_retention_rate (if provided)
 * - isr_retenido = taxable_base * isr_retention_rate (if provided)
 * - total = taxable_base + iva_trasladado - iva_retenido - isr_retenido
 */
export function calculateLineItem(item: InvoiceItemInput): LineItemCalculation {
  const quantity = new Decimal(item.quantity);
  const unitPrice = new Decimal(item.unit_price);
  const discountAmount = new Decimal(item.discount_amount ?? 0);
  const ivaRate = new Decimal(item.iva_rate ?? 0.16);
  const ivaRetentionRate = item.iva_retention_rate
    ? new Decimal(item.iva_retention_rate)
    : null;
  const isrRetentionRate = item.isr_retention_rate
    ? new Decimal(item.isr_retention_rate)
    : null;

  // Calculate subtotal (before discount)
  const subtotal = roundTo(quantity.times(unitPrice), AMOUNT_PRECISION);

  // Calculate taxable base (after discount)
  const taxableBase = roundTo(subtotal.minus(discountAmount), AMOUNT_PRECISION);

  // Calculate IVA trasladado (transferred)
  let ivaTrasladado = new Decimal(0);
  const taxObject = item.tax_object ?? "02";
  const ivaExempt = item.iva_exempt ?? false;

  if (taxObject !== "01" && !ivaExempt) {
    // Subject to tax and not exempt
    ivaTrasladado = roundTo(taxableBase.times(ivaRate), AMOUNT_PRECISION);
  }

  // Calculate IVA retenido (retained)
  let ivaRetenido = new Decimal(0);
  if (ivaRetentionRate) {
    ivaRetenido = roundTo(
      taxableBase.times(ivaRetentionRate),
      AMOUNT_PRECISION
    );
  }

  // Calculate ISR retenido (retained)
  let isrRetenido = new Decimal(0);
  if (isrRetentionRate) {
    isrRetenido = roundTo(
      taxableBase.times(isrRetentionRate),
      AMOUNT_PRECISION
    );
  }

  // Calculate line total
  const total = roundTo(
    taxableBase.plus(ivaTrasladado).minus(ivaRetenido).minus(isrRetenido),
    AMOUNT_PRECISION
  );

  return {
    subtotal: subtotal.toNumber(),
    discount_amount: roundTo(discountAmount, AMOUNT_PRECISION).toNumber(),
    taxable_base: taxableBase.toNumber(),
    iva_trasladado: ivaTrasladado.toNumber(),
    iva_retenido: ivaRetenido.toNumber(),
    isr_retenido: isrRetenido.toNumber(),
    total: total.toNumber(),
  };
}

/**
 * Calculate the subtotal for all items (sum of quantity * unit_price).
 */
export function calculateSubtotal(items: InvoiceItemInput[]): number {
  const sum = items.reduce((acc, item) => {
    const quantity = new Decimal(item.quantity);
    const unitPrice = new Decimal(item.unit_price);
    return acc.plus(quantity.times(unitPrice));
  }, new Decimal(0));

  return roundTo(sum, AMOUNT_PRECISION).toNumber();
}

/**
 * Calculate the total discount for all items.
 */
export function calculateDiscount(items: InvoiceItemInput[]): number {
  const sum = items.reduce((acc, item) => {
    return acc.plus(new Decimal(item.discount_amount ?? 0));
  }, new Decimal(0));

  return roundTo(sum, AMOUNT_PRECISION).toNumber();
}

/**
 * Calculate aggregated tax amounts across all items.
 * Groups by tax type for CFDI Impuestos section.
 */
export function calculateTax(items: InvoiceItemInput[]): {
  total_iva_trasladado: number;
  total_iva_retenido: number;
  total_isr_retenido: number;
} {
  let totalIvaTrasladado = new Decimal(0);
  let totalIvaRetenido = new Decimal(0);
  let totalIsrRetenido = new Decimal(0);

  for (const item of items) {
    const calc = calculateLineItem(item);
    totalIvaTrasladado = totalIvaTrasladado.plus(
      new Decimal(calc.iva_trasladado)
    );
    totalIvaRetenido = totalIvaRetenido.plus(new Decimal(calc.iva_retenido));
    totalIsrRetenido = totalIsrRetenido.plus(new Decimal(calc.isr_retenido));
  }

  return {
    total_iva_trasladado: roundTo(
      totalIvaTrasladado,
      AMOUNT_PRECISION
    ).toNumber(),
    total_iva_retenido: roundTo(totalIvaRetenido, AMOUNT_PRECISION).toNumber(),
    total_isr_retenido: roundTo(totalIsrRetenido, AMOUNT_PRECISION).toNumber(),
  };
}

/**
 * Calculate the invoice total.
 *
 * Formula: total = subtotal - discount + iva_trasladado - iva_retenido - isr_retenido
 * Rounded to 2 decimal places (SAT requirement for Total field).
 */
export function calculateTotal(
  subtotal: number,
  discount: number,
  total_iva_trasladado: number,
  total_iva_retenido: number,
  total_isr_retenido: number
): number {
  const result = new Decimal(subtotal)
    .minus(new Decimal(discount))
    .plus(new Decimal(total_iva_trasladado))
    .minus(new Decimal(total_iva_retenido))
    .minus(new Decimal(total_isr_retenido));

  return roundTo(result, TOTAL_PRECISION).toNumber();
}

/**
 * Full calculation pipeline for an invoice.
 * Calculates all line items and aggregates totals.
 */
export function calculateInvoiceTotals(
  items: InvoiceItemInput[]
): InvoiceTotals {
  const subtotal = calculateSubtotal(items);
  const totalDiscount = calculateDiscount(items);
  const taxes = calculateTax(items);

  const total = calculateTotal(
    subtotal,
    totalDiscount,
    taxes.total_iva_trasladado,
    taxes.total_iva_retenido,
    taxes.total_isr_retenido
  );

  return {
    subtotal,
    total_discount: totalDiscount,
    total_iva_trasladado: taxes.total_iva_trasladado,
    total_iva_retenido: taxes.total_iva_retenido,
    total_isr_retenido: taxes.total_isr_retenido,
    total,
  };
}

/**
 * Verify stored amounts are internally consistent.
 * Recalculates from items and compares to stored totals.
 * Allows tolerance of 0.01 (1 cent) for rounding differences.
 */
export function validateAmounts(invoice: Invoice): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];
  const tolerance = 0.01;

  if (!invoice.items || invoice.items.length === 0) {
    return { valid: false, errors: ["Invoice has no items"] };
  }

  // Convert InvoiceItem[] to InvoiceItemInput[] for calculation
  const itemInputs: InvoiceItemInput[] = invoice.items.map((item) => ({
    product_id: item.product_id,
    sat_product_code: item.sat_product_code,
    sat_unit_code: item.sat_unit_code,
    unit_name: item.unit_name,
    sku: item.sku,
    description: item.description,
    quantity: item.quantity,
    unit_price: item.unit_price,
    discount_amount: item.discount_amount,
    tax_object: item.tax_object,
    iva_rate: item.iva_rate,
    iva_exempt: item.iva_exempt,
    iva_retention_rate: item.iva_retention_rate,
    isr_retention_rate: item.isr_retention_rate,
  }));

  // Calculate expected totals
  const calculated = calculateInvoiceTotals(itemInputs);

  // Compare subtotal
  if (Math.abs(invoice.subtotal - calculated.subtotal) > tolerance) {
    errors.push(
      `Subtotal mismatch: stored=${invoice.subtotal}, calculated=${calculated.subtotal}`
    );
  }

  // Compare discount
  if (Math.abs(invoice.discount - calculated.total_discount) > tolerance) {
    errors.push(
      `Discount mismatch: stored=${invoice.discount}, calculated=${calculated.total_discount}`
    );
  }

  // Compare IVA trasladado
  if (
    Math.abs(invoice.total_iva_trasladado - calculated.total_iva_trasladado) >
    tolerance
  ) {
    errors.push(
      `IVA trasladado mismatch: stored=${invoice.total_iva_trasladado}, calculated=${calculated.total_iva_trasladado}`
    );
  }

  // Compare IVA retenido
  if (
    Math.abs(invoice.total_iva_retenido - calculated.total_iva_retenido) >
    tolerance
  ) {
    errors.push(
      `IVA retenido mismatch: stored=${invoice.total_iva_retenido}, calculated=${calculated.total_iva_retenido}`
    );
  }

  // Compare ISR retenido
  if (
    Math.abs(invoice.total_isr_retenido - calculated.total_isr_retenido) >
    tolerance
  ) {
    errors.push(
      `ISR retenido mismatch: stored=${invoice.total_isr_retenido}, calculated=${calculated.total_isr_retenido}`
    );
  }

  // Compare total
  if (Math.abs(invoice.total - calculated.total) > tolerance) {
    errors.push(
      `Total mismatch: stored=${invoice.total}, calculated=${calculated.total}`
    );
  }

  // Validate individual items
  for (let i = 0; i < invoice.items.length; i++) {
    const item = invoice.items[i];
    const itemCalc = calculateLineItem(itemInputs[i]);

    if (Math.abs(item.total - itemCalc.total) > tolerance) {
      errors.push(
        `Item ${i + 1} total mismatch: stored=${item.total}, calculated=${itemCalc.total}`
      );
    }

    if (Math.abs(item.subtotal - itemCalc.subtotal) > tolerance) {
      errors.push(
        `Item ${i + 1} subtotal mismatch: stored=${item.subtotal}, calculated=${itemCalc.subtotal}`
      );
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Format a number to exactly 2 decimal places as a string for CFDI XML.
 * e.g., 1234.5 → "1234.50", 1234.567890 → "1234.57"
 */
export function formatForCFDI(amount: number): string {
  const decimal = new Decimal(amount);
  return roundTo(decimal, TOTAL_PRECISION).toFixed(TOTAL_PRECISION);
}

/**
 * Format an amount with 6 decimal places for CFDI line items.
 * e.g., 1234.5 → "1234.500000"
 */
export function formatAmountForCFDI(amount: number): string {
  const decimal = new Decimal(amount);
  return roundTo(decimal, AMOUNT_PRECISION).toFixed(AMOUNT_PRECISION);
}

/**
 * Format a tax rate to exactly 6 decimal places for CFDI XML.
 * e.g., 0.16 → "0.160000", 0.1067 → "0.106700"
 */
export function formatRateForCFDI(rate: number): string {
  const decimal = new Decimal(rate);
  return roundTo(decimal, RATE_PRECISION).toFixed(RATE_PRECISION);
}

/**
 * Calculate line item from product data and quantity.
 * Used when adding a product to an invoice.
 */
export function calculateItemFromProduct(
  product: {
    price: number;
    iva_rate?: number;
    iva_exempt?: boolean;
    iva_retention?: boolean;
    iva_retention_rate?: number;
    isr_retention?: boolean;
    isr_retention_rate?: number;
    tax_object?: string;
  },
  quantity: number,
  discountAmount: number = 0
): LineItemCalculation {
  return calculateLineItem({
    sat_product_code: "", // Not needed for calculation
    sat_unit_code: "",
    unit_name: "",
    description: "",
    quantity,
    unit_price: product.price,
    discount_amount: discountAmount,
    tax_object: (product.tax_object as "01" | "02" | "03") ?? "02",
    iva_rate: product.iva_rate ?? 0.16,
    iva_exempt: product.iva_exempt ?? false,
    iva_retention_rate: product.iva_retention
      ? product.iva_retention_rate
      : undefined,
    isr_retention_rate: product.isr_retention
      ? product.isr_retention_rate
      : undefined,
  });
}

/**
 * Check if an amount is within the allowed tolerance for comparison.
 */
export function amountsEqual(a: number, b: number, tolerance = 0.01): boolean {
  return Math.abs(a - b) <= tolerance;
}

/**
 * Calculate payment amounts for PPD invoices.
 * Returns the remaining balance after partial payments.
 */
export function calculateRemainingBalance(
  invoiceTotal: number,
  paymentsTotal: number
): number {
  const remaining = new Decimal(invoiceTotal).minus(
    new Decimal(paymentsTotal)
  );
  return roundTo(remaining, TOTAL_PRECISION).toNumber();
}

/**
 * Convert foreign currency amount to MXN using exchange rate.
 */
export function convertToMXN(
  amount: number,
  exchangeRate: number
): number {
  const result = new Decimal(amount).times(new Decimal(exchangeRate));
  return roundTo(result, TOTAL_PRECISION).toNumber();
}

/**
 * Get tax breakdown grouped by tax type and rate.
 * Used for the CFDI Impuestos/Traslados and Impuestos/Retenciones sections.
 */
export function getTaxBreakdown(items: InvoiceItemInput[]): {
  traslados: Array<{
    impuesto: string;
    tipo_factor: string;
    tasa_o_cuota: number;
    base: number;
    importe: number;
  }>;
  retenciones: Array<{
    impuesto: string;
    importe: number;
  }>;
} {
  // Group IVA traslados by rate
  const ivaByRate: Record<number, { base: Decimal; importe: Decimal }> = {};
  let totalIvaRetenido = new Decimal(0);
  let totalIsrRetenido = new Decimal(0);

  for (const item of items) {
    const calc = calculateLineItem(item);
    const taxObject = item.tax_object ?? "02";
    const ivaExempt = item.iva_exempt ?? false;
    const ivaRate = item.iva_rate ?? 0.16;

    // Only include taxable items with IVA
    if (taxObject !== "01" && !ivaExempt && calc.iva_trasladado > 0) {
      if (!ivaByRate[ivaRate]) {
        ivaByRate[ivaRate] = { base: new Decimal(0), importe: new Decimal(0) };
      }
      ivaByRate[ivaRate].base = ivaByRate[ivaRate].base.plus(
        new Decimal(calc.taxable_base)
      );
      ivaByRate[ivaRate].importe = ivaByRate[ivaRate].importe.plus(
        new Decimal(calc.iva_trasladado)
      );
    }

    // Accumulate retenciones
    totalIvaRetenido = totalIvaRetenido.plus(new Decimal(calc.iva_retenido));
    totalIsrRetenido = totalIsrRetenido.plus(new Decimal(calc.isr_retenido));
  }

  // Build traslados array
  const traslados = Object.entries(ivaByRate).map(([rate, { base, importe }]) => ({
    impuesto: "002", // IVA
    tipo_factor: "Tasa",
    tasa_o_cuota: parseFloat(rate),
    base: roundTo(base, AMOUNT_PRECISION).toNumber(),
    importe: roundTo(importe, AMOUNT_PRECISION).toNumber(),
  }));

  // Build retenciones array
  const retenciones: Array<{ impuesto: string; importe: number }> = [];

  const ivaRetenidoNum = roundTo(totalIvaRetenido, AMOUNT_PRECISION).toNumber();
  if (ivaRetenidoNum > 0) {
    retenciones.push({
      impuesto: "002", // IVA
      importe: ivaRetenidoNum,
    });
  }

  const isrRetenidoNum = roundTo(totalIsrRetenido, AMOUNT_PRECISION).toNumber();
  if (isrRetenidoNum > 0) {
    retenciones.push({
      impuesto: "001", // ISR
      importe: isrRetenidoNum,
    });
  }

  return { traslados, retenciones };
}
