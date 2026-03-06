/**
 * Tests for Invoice Calculations (Component 12 - Step 3)
 *
 * Verifies exact decimal arithmetic for tax calculations.
 * All tests use precise values to ensure no floating-point errors.
 */

import { describe, it, expect } from "vitest";
import {
  calculateLineItem,
  calculateSubtotal,
  calculateDiscount,
  calculateTax,
  calculateTotal,
  calculateInvoiceTotals,
  validateAmounts,
  formatForCFDI,
  formatAmountForCFDI,
  formatRateForCFDI,
  calculateRemainingBalance,
  convertToMXN,
  getTaxBreakdown,
  amountsEqual,
} from "../calculations";
import type { InvoiceItemInput, Invoice, InvoiceItem } from "../types";
import { InvoiceStatus, TipoComprobante, MetodoPago } from "../types";

describe("calculateLineItem", () => {
  it("calculates standard 16% IVA correctly", () => {
    const item: InvoiceItemInput = {
      sat_product_code: "81112100",
      sat_unit_code: "E48",
      unit_name: "Hora",
      description: "Servicio de consultoría",
      quantity: 1,
      unit_price: 10000,
      iva_rate: 0.16,
    };

    const result = calculateLineItem(item);

    expect(result.subtotal).toBe(10000);
    expect(result.taxable_base).toBe(10000);
    expect(result.iva_trasladado).toBe(1600);
    expect(result.iva_retenido).toBe(0);
    expect(result.isr_retenido).toBe(0);
    expect(result.total).toBe(11600);
  });

  it("calculates with quantity greater than 1", () => {
    const item: InvoiceItemInput = {
      sat_product_code: "81112100",
      sat_unit_code: "E48",
      unit_name: "Hora",
      description: "Servicio",
      quantity: 5,
      unit_price: 1000,
      iva_rate: 0.16,
    };

    const result = calculateLineItem(item);

    expect(result.subtotal).toBe(5000);
    expect(result.iva_trasladado).toBe(800);
    expect(result.total).toBe(5800);
  });

  it("calculates with discount", () => {
    const item: InvoiceItemInput = {
      sat_product_code: "81112100",
      sat_unit_code: "E48",
      unit_name: "Unidad",
      description: "Producto",
      quantity: 2,
      unit_price: 1000,
      discount_amount: 100,
      iva_rate: 0.16,
    };

    const result = calculateLineItem(item);

    // subtotal: 2 * 1000 = 2000
    // taxable_base: 2000 - 100 = 1900
    // iva: 1900 * 0.16 = 304
    // total: 1900 + 304 = 2204
    expect(result.subtotal).toBe(2000);
    expect(result.discount_amount).toBe(100);
    expect(result.taxable_base).toBe(1900);
    expect(result.iva_trasladado).toBe(304);
    expect(result.total).toBe(2204);
  });

  it("calculates IVA + ISR retention (professional services)", () => {
    const item: InvoiceItemInput = {
      sat_product_code: "80101504",
      sat_unit_code: "E48",
      unit_name: "Servicio",
      description: "Honorarios profesionales",
      quantity: 1,
      unit_price: 10000,
      iva_rate: 0.16,
      iva_retention_rate: 0.1067, // 2/3 of 16%
      isr_retention_rate: 0.1, // 10%
    };

    const result = calculateLineItem(item);

    // base: 10000
    // iva_trasladado: 10000 * 0.16 = 1600
    // iva_retenido: 10000 * 0.1067 = 1067
    // isr_retenido: 10000 * 0.10 = 1000
    // total: 10000 + 1600 - 1067 - 1000 = 9533
    expect(result.subtotal).toBe(10000);
    expect(result.iva_trasladado).toBe(1600);
    expect(result.iva_retenido).toBe(1067);
    expect(result.isr_retenido).toBe(1000);
    expect(result.total).toBe(9533);
  });

  it("returns zero tax for exempt items (tax_object=01)", () => {
    const item: InvoiceItemInput = {
      sat_product_code: "84111506",
      sat_unit_code: "E48",
      unit_name: "Servicio",
      description: "Servicio médico",
      quantity: 1,
      unit_price: 5000,
      tax_object: "01", // No objeto de impuesto
      iva_rate: 0.16, // Should be ignored
    };

    const result = calculateLineItem(item);

    expect(result.subtotal).toBe(5000);
    expect(result.iva_trasladado).toBe(0);
    expect(result.total).toBe(5000);
  });

  it("returns zero IVA for iva_exempt items", () => {
    const item: InvoiceItemInput = {
      sat_product_code: "84111506",
      sat_unit_code: "E48",
      unit_name: "Servicio",
      description: "Servicio exento",
      quantity: 1,
      unit_price: 3000,
      tax_object: "02",
      iva_exempt: true,
      iva_rate: 0.16,
    };

    const result = calculateLineItem(item);

    expect(result.subtotal).toBe(3000);
    expect(result.iva_trasladado).toBe(0);
    expect(result.total).toBe(3000);
  });

  it("handles 8% border zone IVA", () => {
    const item: InvoiceItemInput = {
      sat_product_code: "81112100",
      sat_unit_code: "E48",
      unit_name: "Servicio",
      description: "Servicio en zona fronteriza",
      quantity: 1,
      unit_price: 10000,
      iva_rate: 0.08, // Border zone rate
    };

    const result = calculateLineItem(item);

    expect(result.iva_trasladado).toBe(800);
    expect(result.total).toBe(10800);
  });

  it("handles 0% IVA", () => {
    const item: InvoiceItemInput = {
      sat_product_code: "10101501",
      sat_unit_code: "KGM",
      unit_name: "Kilogramo",
      description: "Alimento básico",
      quantity: 10,
      unit_price: 50,
      iva_rate: 0, // Zero rate for food
    };

    const result = calculateLineItem(item);

    expect(result.subtotal).toBe(500);
    expect(result.iva_trasladado).toBe(0);
    expect(result.total).toBe(500);
  });

  it("avoids floating-point errors for $333.33 * 3 = $999.99", () => {
    const item: InvoiceItemInput = {
      sat_product_code: "81112100",
      sat_unit_code: "E48",
      unit_name: "Servicio",
      description: "Test floating point",
      quantity: 3,
      unit_price: 333.33,
      iva_rate: 0.16,
    };

    const result = calculateLineItem(item);

    // 333.33 * 3 = 999.99 (not 999.9899999...)
    expect(result.subtotal).toBe(999.99);
    // 999.99 * 0.16 = 159.9984
    expect(result.iva_trasladado).toBe(159.9984);
  });

  it("handles very small quantities", () => {
    const item: InvoiceItemInput = {
      sat_product_code: "51101700",
      sat_unit_code: "KGM",
      unit_name: "Kilogramo",
      description: "Material",
      quantity: 0.001,
      unit_price: 10000,
      iva_rate: 0.16,
    };

    const result = calculateLineItem(item);

    expect(result.subtotal).toBe(10);
    expect(result.iva_trasladado).toBe(1.6);
    expect(result.total).toBe(11.6);
  });

  it("handles decimal quantities precisely", () => {
    const item: InvoiceItemInput = {
      sat_product_code: "43232100",
      sat_unit_code: "LTR",
      unit_name: "Litro",
      description: "Gasolina",
      quantity: 45.678,
      unit_price: 23.45,
      iva_rate: 0.16,
    };

    const result = calculateLineItem(item);

    // 45.678 * 23.45 = 1071.14910
    expect(result.subtotal).toBe(1071.1491);
    // IVA: 1071.1491 * 0.16 = 171.383856
    expect(result.iva_trasladado).toBe(171.383856);
  });
});

describe("calculateSubtotal", () => {
  it("sums subtotals from multiple items", () => {
    const items: InvoiceItemInput[] = [
      {
        sat_product_code: "81112100",
        sat_unit_code: "E48",
        unit_name: "Hora",
        description: "Item 1",
        quantity: 2,
        unit_price: 1000,
      },
      {
        sat_product_code: "81112100",
        sat_unit_code: "E48",
        unit_name: "Hora",
        description: "Item 2",
        quantity: 3,
        unit_price: 500,
      },
    ];

    const subtotal = calculateSubtotal(items);

    // (2 * 1000) + (3 * 500) = 2000 + 1500 = 3500
    expect(subtotal).toBe(3500);
  });

  it("returns 0 for empty items array", () => {
    expect(calculateSubtotal([])).toBe(0);
  });
});

describe("calculateDiscount", () => {
  it("sums discounts from all items", () => {
    const items: InvoiceItemInput[] = [
      {
        sat_product_code: "81112100",
        sat_unit_code: "E48",
        unit_name: "Unit",
        description: "Item 1",
        quantity: 1,
        unit_price: 1000,
        discount_amount: 50,
      },
      {
        sat_product_code: "81112100",
        sat_unit_code: "E48",
        unit_name: "Unit",
        description: "Item 2",
        quantity: 1,
        unit_price: 1000,
        discount_amount: 100,
      },
    ];

    const discount = calculateDiscount(items);
    expect(discount).toBe(150);
  });

  it("returns 0 when no discounts", () => {
    const items: InvoiceItemInput[] = [
      {
        sat_product_code: "81112100",
        sat_unit_code: "E48",
        unit_name: "Unit",
        description: "Item",
        quantity: 1,
        unit_price: 1000,
      },
    ];

    expect(calculateDiscount(items)).toBe(0);
  });
});

describe("calculateTax", () => {
  it("aggregates taxes from all items", () => {
    const items: InvoiceItemInput[] = [
      {
        sat_product_code: "81112100",
        sat_unit_code: "E48",
        unit_name: "Hora",
        description: "Service 1",
        quantity: 1,
        unit_price: 10000,
        iva_rate: 0.16,
        iva_retention_rate: 0.1067,
        isr_retention_rate: 0.1,
      },
      {
        sat_product_code: "81112100",
        sat_unit_code: "E48",
        unit_name: "Hora",
        description: "Service 2",
        quantity: 1,
        unit_price: 5000,
        iva_rate: 0.16,
      },
    ];

    const taxes = calculateTax(items);

    // Item 1: iva=1600, iva_ret=1067, isr_ret=1000
    // Item 2: iva=800
    expect(taxes.total_iva_trasladado).toBe(2400);
    expect(taxes.total_iva_retenido).toBe(1067);
    expect(taxes.total_isr_retenido).toBe(1000);
  });
});

describe("calculateTotal", () => {
  it("matches SAT formula exactly", () => {
    // total = subtotal - discount + iva_trasladado - iva_retenido - isr_retenido
    const total = calculateTotal(10000, 500, 1520, 1013.6, 950);

    // 10000 - 500 + 1520 - 1013.6 - 950 = 9056.4
    expect(total).toBe(9056.4);
  });

  it("rounds to 2 decimal places", () => {
    const total = calculateTotal(10000, 0, 1600.123456, 0, 0);

    // 10000 + 1600.123456 = 11600.123456 → 11600.12
    expect(total).toBe(11600.12);
  });

  it("handles zero values", () => {
    const total = calculateTotal(5000, 0, 0, 0, 0);
    expect(total).toBe(5000);
  });
});

describe("calculateInvoiceTotals", () => {
  it("calculates complete invoice totals", () => {
    const items: InvoiceItemInput[] = [
      {
        sat_product_code: "81112100",
        sat_unit_code: "E48",
        unit_name: "Servicio",
        description: "Consultoría",
        quantity: 10,
        unit_price: 1000,
        discount_amount: 500,
        iva_rate: 0.16,
      },
    ];

    const totals = calculateInvoiceTotals(items);

    // subtotal: 10 * 1000 = 10000
    // discount: 500
    // taxable: 10000 - 500 = 9500
    // iva: 9500 * 0.16 = 1520
    // total: 9500 + 1520 = 11020
    expect(totals.subtotal).toBe(10000);
    expect(totals.total_discount).toBe(500);
    expect(totals.total_iva_trasladado).toBe(1520);
    expect(totals.total_iva_retenido).toBe(0);
    expect(totals.total_isr_retenido).toBe(0);
    expect(totals.total).toBe(11020);
  });

  it("handles multiple items with different tax configurations", () => {
    const items: InvoiceItemInput[] = [
      {
        sat_product_code: "81112100",
        sat_unit_code: "E48",
        unit_name: "Servicio",
        description: "Con IVA",
        quantity: 1,
        unit_price: 1000,
        iva_rate: 0.16,
      },
      {
        sat_product_code: "84111506",
        sat_unit_code: "E48",
        unit_name: "Servicio",
        description: "Sin IVA",
        quantity: 1,
        unit_price: 500,
        tax_object: "01",
      },
    ];

    const totals = calculateInvoiceTotals(items);

    expect(totals.subtotal).toBe(1500);
    expect(totals.total_iva_trasladado).toBe(160); // Only from first item
    expect(totals.total).toBe(1660);
  });
});

describe("validateAmounts", () => {
  it("returns valid for correctly calculated invoice", () => {
    const items: InvoiceItem[] = [
      {
        id: "item-1",
        invoice_id: "inv-1",
        sort_order: 0,
        sat_product_code: "81112100",
        sat_unit_code: "E48",
        unit_name: "Hora",
        description: "Servicio",
        quantity: 1,
        unit_price: 10000,
        discount_amount: 0,
        subtotal: 10000,
        tax_object: "02",
        iva_rate: 0.16,
        iva_exempt: false,
        iva_trasladado: 1600,
        iva_retenido: 0,
        isr_retenido: 0,
        total: 11600,
      },
    ];

    const invoice: Invoice = {
      id: "inv-1",
      organization_id: "org-1",
      status: InvoiceStatus.DRAFT,
      tipo_comprobante: TipoComprobante.INGRESO,
      issue_date: "2024-01-01T00:00:00Z",
      issuer_rfc: "AAA010101AAA",
      issuer_name: "Test",
      issuer_tax_regime: "601",
      issuer_zip_code: "06600",
      customer_id: "cust-1",
      receiver_rfc: "BBB020202BBB",
      receiver_name: "Customer",
      receiver_tax_regime: "626",
      receiver_zip_code: "06600",
      receiver_cfdi_use: "G03",
      payment_method: MetodoPago.PUE,
      payment_form: "01",
      currency: "MXN",
      exchange_rate: 1,
      exportacion: "01",
      subtotal: 10000,
      discount: 0,
      total_iva_trasladado: 1600,
      total_iva_retenido: 0,
      total_isr_retenido: 0,
      total: 11600,
      is_global: false,
      items,
      created_at: "2024-01-01T00:00:00Z",
      updated_at: "2024-01-01T00:00:00Z",
    };

    const result = validateAmounts(invoice);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("returns error when totals do not match items", () => {
    const items: InvoiceItem[] = [
      {
        id: "item-1",
        invoice_id: "inv-1",
        sort_order: 0,
        sat_product_code: "81112100",
        sat_unit_code: "E48",
        unit_name: "Hora",
        description: "Servicio",
        quantity: 1,
        unit_price: 10000,
        discount_amount: 0,
        subtotal: 10000,
        tax_object: "02",
        iva_rate: 0.16,
        iva_exempt: false,
        iva_trasladado: 1600,
        iva_retenido: 0,
        isr_retenido: 0,
        total: 11600,
      },
    ];

    const invoice: Invoice = {
      id: "inv-1",
      organization_id: "org-1",
      status: InvoiceStatus.DRAFT,
      tipo_comprobante: TipoComprobante.INGRESO,
      issue_date: "2024-01-01T00:00:00Z",
      issuer_rfc: "AAA010101AAA",
      issuer_name: "Test",
      issuer_tax_regime: "601",
      issuer_zip_code: "06600",
      customer_id: "cust-1",
      receiver_rfc: "BBB020202BBB",
      receiver_name: "Customer",
      receiver_tax_regime: "626",
      receiver_zip_code: "06600",
      receiver_cfdi_use: "G03",
      payment_method: MetodoPago.PUE,
      payment_form: "01",
      currency: "MXN",
      exchange_rate: 1,
      exportacion: "01",
      subtotal: 10000,
      discount: 0,
      total_iva_trasladado: 1600,
      total_iva_retenido: 0,
      total_isr_retenido: 0,
      total: 12000, // Wrong! Should be 11600
      is_global: false,
      items,
      created_at: "2024-01-01T00:00:00Z",
      updated_at: "2024-01-01T00:00:00Z",
    };

    const result = validateAmounts(invoice);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors.some((e) => e.includes("Total mismatch"))).toBe(true);
  });

  it("allows 1 cent tolerance for rounding", () => {
    // Exactly correct calculation - then tweak by small amounts
    // Calculated: subtotal=10000, iva=1600, total=11600
    // Store with tiny differences that are within 0.01 tolerance
    const items: InvoiceItem[] = [
      {
        id: "item-1",
        invoice_id: "inv-1",
        sort_order: 0,
        sat_product_code: "81112100",
        sat_unit_code: "E48",
        unit_name: "Hora",
        description: "Servicio",
        quantity: 1,
        unit_price: 10000,
        discount_amount: 0,
        subtotal: 10000, // Exact
        tax_object: "02",
        iva_rate: 0.16,
        iva_exempt: false,
        iva_trasladado: 1600, // Exact
        iva_retenido: 0,
        isr_retenido: 0,
        total: 11600.005, // 0.005 difference - within tolerance
      },
    ];

    const invoice: Invoice = {
      id: "inv-1",
      organization_id: "org-1",
      status: InvoiceStatus.DRAFT,
      tipo_comprobante: TipoComprobante.INGRESO,
      issue_date: "2024-01-01T00:00:00Z",
      issuer_rfc: "AAA010101AAA",
      issuer_name: "Test",
      issuer_tax_regime: "601",
      issuer_zip_code: "06600",
      customer_id: "cust-1",
      receiver_rfc: "BBB020202BBB",
      receiver_name: "Customer",
      receiver_tax_regime: "626",
      receiver_zip_code: "06600",
      receiver_cfdi_use: "G03",
      payment_method: MetodoPago.PUE,
      payment_form: "01",
      currency: "MXN",
      exchange_rate: 1,
      exportacion: "01",
      subtotal: 10000.005, // 0.005 difference from calculated 10000
      discount: 0,
      total_iva_trasladado: 1600.005, // 0.005 difference from calculated 1600
      total_iva_retenido: 0,
      total_isr_retenido: 0,
      total: 11600.005, // 0.005 difference from calculated 11600
      is_global: false,
      items,
      created_at: "2024-01-01T00:00:00Z",
      updated_at: "2024-01-01T00:00:00Z",
    };

    const result = validateAmounts(invoice);
    // Each individual field difference is within 0.01 tolerance
    expect(result.valid).toBe(true);
  });

  it("returns error for invoice with no items", () => {
    const invoice: Invoice = {
      id: "inv-1",
      organization_id: "org-1",
      status: InvoiceStatus.DRAFT,
      tipo_comprobante: TipoComprobante.INGRESO,
      issue_date: "2024-01-01T00:00:00Z",
      issuer_rfc: "AAA010101AAA",
      issuer_name: "Test",
      issuer_tax_regime: "601",
      issuer_zip_code: "06600",
      customer_id: "cust-1",
      receiver_rfc: "BBB020202BBB",
      receiver_name: "Customer",
      receiver_tax_regime: "626",
      receiver_zip_code: "06600",
      receiver_cfdi_use: "G03",
      payment_method: MetodoPago.PUE,
      payment_form: "01",
      currency: "MXN",
      exchange_rate: 1,
      exportacion: "01",
      subtotal: 0,
      discount: 0,
      total_iva_trasladado: 0,
      total_iva_retenido: 0,
      total_isr_retenido: 0,
      total: 0,
      is_global: false,
      created_at: "2024-01-01T00:00:00Z",
      updated_at: "2024-01-01T00:00:00Z",
    };

    const result = validateAmounts(invoice);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("Invoice has no items");
  });
});

describe("formatForCFDI", () => {
  it('formats 1234.5 as "1234.50"', () => {
    expect(formatForCFDI(1234.5)).toBe("1234.50");
  });

  it('formats 0 as "0.00"', () => {
    expect(formatForCFDI(0)).toBe("0.00");
  });

  it('formats 1234.567890 as "1234.57"', () => {
    expect(formatForCFDI(1234.567890)).toBe("1234.57");
  });

  it('formats 1000 as "1000.00"', () => {
    expect(formatForCFDI(1000)).toBe("1000.00");
  });

  it("rounds 0.005 up to 0.01", () => {
    expect(formatForCFDI(0.005)).toBe("0.01");
  });

  it("rounds 0.004 down to 0.00", () => {
    expect(formatForCFDI(0.004)).toBe("0.00");
  });
});

describe("formatAmountForCFDI", () => {
  it('formats with 6 decimal places', () => {
    expect(formatAmountForCFDI(1234.5)).toBe("1234.500000");
  });

  it('formats 0 as "0.000000"', () => {
    expect(formatAmountForCFDI(0)).toBe("0.000000");
  });
});

describe("formatRateForCFDI", () => {
  it('formats 0.16 as "0.160000"', () => {
    expect(formatRateForCFDI(0.16)).toBe("0.160000");
  });

  it('formats 0.1067 as "0.106700"', () => {
    expect(formatRateForCFDI(0.1067)).toBe("0.106700");
  });

  it('formats 0.08 as "0.080000"', () => {
    expect(formatRateForCFDI(0.08)).toBe("0.080000");
  });

  it('formats 0 as "0.000000"', () => {
    expect(formatRateForCFDI(0)).toBe("0.000000");
  });
});

describe("calculateRemainingBalance", () => {
  it("calculates remaining balance correctly", () => {
    expect(calculateRemainingBalance(10000, 3000)).toBe(7000);
  });

  it("returns 0 when fully paid", () => {
    expect(calculateRemainingBalance(10000, 10000)).toBe(0);
  });

  it("handles overpayment (negative balance)", () => {
    expect(calculateRemainingBalance(10000, 11000)).toBe(-1000);
  });
});

describe("convertToMXN", () => {
  it("converts USD to MXN", () => {
    // 100 USD at 17.5 MXN/USD = 1750 MXN
    expect(convertToMXN(100, 17.5)).toBe(1750);
  });

  it("handles decimal exchange rates", () => {
    // 1000 USD at 17.2345 MXN/USD = 17234.50 MXN
    expect(convertToMXN(1000, 17.2345)).toBe(17234.5);
  });

  it("returns same amount for MXN (rate=1)", () => {
    expect(convertToMXN(1000, 1)).toBe(1000);
  });
});

describe("amountsEqual", () => {
  it("returns true for exactly equal amounts", () => {
    expect(amountsEqual(100, 100)).toBe(true);
  });

  it("returns true for amounts within default tolerance", () => {
    expect(amountsEqual(100, 100.005)).toBe(true);
  });

  it("returns false for amounts outside tolerance", () => {
    expect(amountsEqual(100, 100.02)).toBe(false);
  });

  it("respects custom tolerance", () => {
    expect(amountsEqual(100, 100.5, 1)).toBe(true);
    expect(amountsEqual(100, 101.5, 1)).toBe(false);
  });
});

describe("getTaxBreakdown", () => {
  it("groups IVA traslados by rate", () => {
    const items: InvoiceItemInput[] = [
      {
        sat_product_code: "81112100",
        sat_unit_code: "E48",
        unit_name: "Servicio",
        description: "Item 1",
        quantity: 1,
        unit_price: 1000,
        iva_rate: 0.16,
      },
      {
        sat_product_code: "81112100",
        sat_unit_code: "E48",
        unit_name: "Servicio",
        description: "Item 2",
        quantity: 1,
        unit_price: 500,
        iva_rate: 0.16,
      },
    ];

    const breakdown = getTaxBreakdown(items);

    expect(breakdown.traslados).toHaveLength(1);
    expect(breakdown.traslados[0].impuesto).toBe("002");
    expect(breakdown.traslados[0].tasa_o_cuota).toBe(0.16);
    expect(breakdown.traslados[0].base).toBe(1500);
    expect(breakdown.traslados[0].importe).toBe(240);
  });

  it("separates different IVA rates", () => {
    const items: InvoiceItemInput[] = [
      {
        sat_product_code: "81112100",
        sat_unit_code: "E48",
        unit_name: "Servicio",
        description: "16% IVA",
        quantity: 1,
        unit_price: 1000,
        iva_rate: 0.16,
      },
      {
        sat_product_code: "81112100",
        sat_unit_code: "E48",
        unit_name: "Servicio",
        description: "8% IVA",
        quantity: 1,
        unit_price: 1000,
        iva_rate: 0.08,
      },
    ];

    const breakdown = getTaxBreakdown(items);

    expect(breakdown.traslados).toHaveLength(2);
    // Should have entries for both 16% and 8%
    const rates = breakdown.traslados.map((t) => t.tasa_o_cuota);
    expect(rates).toContain(0.16);
    expect(rates).toContain(0.08);
  });

  it("includes retenciones when present", () => {
    const items: InvoiceItemInput[] = [
      {
        sat_product_code: "81112100",
        sat_unit_code: "E48",
        unit_name: "Servicio",
        description: "Professional",
        quantity: 1,
        unit_price: 10000,
        iva_rate: 0.16,
        iva_retention_rate: 0.1067,
        isr_retention_rate: 0.1,
      },
    ];

    const breakdown = getTaxBreakdown(items);

    expect(breakdown.retenciones).toHaveLength(2);
    // IVA retention
    const ivaRet = breakdown.retenciones.find((r) => r.impuesto === "002");
    expect(ivaRet?.importe).toBe(1067);
    // ISR retention
    const isrRet = breakdown.retenciones.find((r) => r.impuesto === "001");
    expect(isrRet?.importe).toBe(1000);
  });

  it("excludes items with tax_object=01 from traslados", () => {
    const items: InvoiceItemInput[] = [
      {
        sat_product_code: "84111506",
        sat_unit_code: "E48",
        unit_name: "Servicio",
        description: "No tax",
        quantity: 1,
        unit_price: 1000,
        tax_object: "01",
        iva_rate: 0.16,
      },
    ];

    const breakdown = getTaxBreakdown(items);

    expect(breakdown.traslados).toHaveLength(0);
    expect(breakdown.retenciones).toHaveLength(0);
  });
});
