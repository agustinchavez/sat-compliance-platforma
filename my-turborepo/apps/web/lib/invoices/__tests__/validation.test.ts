/**
 * Tests for Invoice Validation (Component 12 - Step 4)
 *
 * Tests Zod schemas and business rule validators.
 */

import { describe, it, expect } from "vitest";
import {
  CreateInvoiceSchema,
  UpdateInvoiceSchema,
  InvoiceItemInputSchema,
  validateCustomerForCFDI,
  validatePaymentTerms,
  validateCurrency,
  validateRelatedInvoices,
  validateInvoiceForStamping,
  isValidRFC,
  isValidUUID,
  isValidPostalCode,
  isValidSATProductCode,
  RFC_PUBLICO_GENERAL,
  RFC_EXTRANJERO,
} from "../validation";
import type { Invoice, InvoiceItem } from "../types";
import { InvoiceStatus, TipoComprobante, MetodoPago, TipoRelacion } from "../types";

// Helper to create a minimal valid item
const validItem = {
  sat_product_code: "81112100",
  sat_unit_code: "E48",
  unit_name: "Hora",
  description: "Servicio de consultoría",
  quantity: 1,
  unit_price: 1000,
};

describe("InvoiceItemInputSchema", () => {
  it("accepts valid item", () => {
    const result = InvoiceItemInputSchema.safeParse(validItem);
    expect(result.success).toBe(true);
  });

  it("rejects SAT product code that is not 8 digits", () => {
    const result = InvoiceItemInputSchema.safeParse({
      ...validItem,
      sat_product_code: "1234567", // 7 digits
    });
    expect(result.success).toBe(false);
  });

  it("rejects SAT product code with letters", () => {
    const result = InvoiceItemInputSchema.safeParse({
      ...validItem,
      sat_product_code: "8111210A",
    });
    expect(result.success).toBe(false);
  });

  it("rejects negative quantity", () => {
    const result = InvoiceItemInputSchema.safeParse({
      ...validItem,
      quantity: -1,
    });
    expect(result.success).toBe(false);
  });

  it("rejects negative unit price", () => {
    const result = InvoiceItemInputSchema.safeParse({
      ...validItem,
      unit_price: -100,
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid IVA rate", () => {
    const result = InvoiceItemInputSchema.safeParse({
      ...validItem,
      iva_rate: 0.15, // Not valid - must be 0, 0.08, or 0.16
    });
    expect(result.success).toBe(false);
  });

  it("accepts valid IVA rates", () => {
    for (const rate of [0, 0.08, 0.16]) {
      const result = InvoiceItemInputSchema.safeParse({
        ...validItem,
        iva_rate: rate,
      });
      expect(result.success).toBe(true);
    }
  });

  it("rejects empty description", () => {
    const result = InvoiceItemInputSchema.safeParse({
      ...validItem,
      description: "",
    });
    expect(result.success).toBe(false);
  });
});

describe("CreateInvoiceSchema", () => {
  const validInvoice = {
    customer_id: "123e4567-e89b-12d3-a456-426614174000",
    items: [validItem],
  };

  it("accepts minimal valid invoice", () => {
    const result = CreateInvoiceSchema.safeParse(validInvoice);
    expect(result.success).toBe(true);
  });

  it("rejects empty items array", () => {
    const result = CreateInvoiceSchema.safeParse({
      ...validInvoice,
      items: [],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toContain("At least one item required");
    }
  });

  it("rejects PPD with payment_form != 99", () => {
    const result = CreateInvoiceSchema.safeParse({
      ...validInvoice,
      payment_method: "PPD",
      payment_form: "01", // Should be 99 for PPD
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.message.includes("PPD"))).toBe(
        true
      );
    }
  });

  it("accepts PPD with payment_form = 99", () => {
    const result = CreateInvoiceSchema.safeParse({
      ...validInvoice,
      payment_method: "PPD",
      payment_form: "99",
    });
    expect(result.success).toBe(true);
  });

  it("rejects PUE with payment_form = 99", () => {
    const result = CreateInvoiceSchema.safeParse({
      ...validInvoice,
      payment_method: "PUE",
      payment_form: "99",
    });
    expect(result.success).toBe(false);
  });

  it("rejects non-MXN currency with exchange_rate = 1", () => {
    const result = CreateInvoiceSchema.safeParse({
      ...validInvoice,
      currency: "USD",
      exchange_rate: 1,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.error.issues.some((i) => i.message.includes("exchange rate"))
      ).toBe(true);
    }
  });

  it("accepts non-MXN currency with exchange_rate != 1", () => {
    const result = CreateInvoiceSchema.safeParse({
      ...validInvoice,
      currency: "USD",
      exchange_rate: 17.5,
    });
    expect(result.success).toBe(true);
  });

  it("rejects MXN with exchange_rate != 1", () => {
    const result = CreateInvoiceSchema.safeParse({
      ...validInvoice,
      currency: "MXN",
      exchange_rate: 1.5,
    });
    expect(result.success).toBe(false);
  });

  it("rejects global invoice without periodicity", () => {
    const result = CreateInvoiceSchema.safeParse({
      ...validInvoice,
      is_global: true,
      global_months: "01",
      global_year: "2024",
      // Missing global_periodicity
    });
    expect(result.success).toBe(false);
  });

  it("accepts global invoice with all required fields", () => {
    const result = CreateInvoiceSchema.safeParse({
      ...validInvoice,
      is_global: true,
      global_periodicity: "04",
      global_months: "01",
      global_year: "2024",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid customer_id format", () => {
    const result = CreateInvoiceSchema.safeParse({
      ...validInvoice,
      customer_id: "not-a-uuid",
    });
    expect(result.success).toBe(false);
  });

  it("validates related_cfdi UUIDs", () => {
    const result = CreateInvoiceSchema.safeParse({
      ...validInvoice,
      related_cfdi: [
        { tipo_relacion: "04", related_uuid: "invalid-uuid" },
      ],
    });
    expect(result.success).toBe(false);
  });

  it("accepts valid related_cfdi", () => {
    const result = CreateInvoiceSchema.safeParse({
      ...validInvoice,
      related_cfdi: [
        {
          tipo_relacion: "04",
          related_uuid: "123e4567-e89b-42d3-a456-426614174000",
        },
      ],
    });
    expect(result.success).toBe(true);
  });
});

describe("validateCustomerForCFDI", () => {
  it("accepts valid customer", () => {
    const result = validateCustomerForCFDI({
      rfc: "AAA010101AAA",
      tax_regime: "601",
      cfdi_use: "G03",
      address: { postal_code: "06600" },
    });
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("rejects customer missing zip_code", () => {
    const result = validateCustomerForCFDI({
      rfc: "AAA010101AAA",
      tax_regime: "601",
      cfdi_use: "G03",
      address: {},
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("postal code"))).toBe(true);
  });

  it("rejects customer with no address", () => {
    const result = validateCustomerForCFDI({
      rfc: "AAA010101AAA",
      tax_regime: "601",
      cfdi_use: "G03",
    });
    expect(result.valid).toBe(false);
  });

  it("accepts RFC XAXX010101000 (public general)", () => {
    const result = validateCustomerForCFDI({
      rfc: RFC_PUBLICO_GENERAL,
      tax_regime: "616",
      cfdi_use: "S01",
      address: { postal_code: "06600" },
    });
    expect(result.valid).toBe(true);
  });

  it("accepts RFC XEXX010101000 (foreign)", () => {
    const result = validateCustomerForCFDI({
      rfc: RFC_EXTRANJERO,
      tax_regime: "616",
      cfdi_use: "S01",
      address: { postal_code: "06600" },
    });
    expect(result.valid).toBe(true);
  });

  it("rejects invalid RFC format", () => {
    const result = validateCustomerForCFDI({
      rfc: "INVALID",
      tax_regime: "601",
      cfdi_use: "G03",
      address: { postal_code: "06600" },
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("RFC"))).toBe(true);
  });

  it("rejects missing tax regime", () => {
    const result = validateCustomerForCFDI({
      rfc: "AAA010101AAA",
      cfdi_use: "G03",
      address: { postal_code: "06600" },
    });
    expect(result.valid).toBe(false);
  });

  it("rejects invalid postal code format", () => {
    const result = validateCustomerForCFDI({
      rfc: "AAA010101AAA",
      tax_regime: "601",
      cfdi_use: "G03",
      address: { postal_code: "1234" }, // Should be 5 digits
    });
    expect(result.valid).toBe(false);
  });
});

describe("validatePaymentTerms", () => {
  it("accepts valid PUE with cash payment", () => {
    const result = validatePaymentTerms("PUE", "01");
    expect(result.valid).toBe(true);
  });

  it("accepts valid PPD with 99", () => {
    const result = validatePaymentTerms("PPD", "99");
    expect(result.valid).toBe(true);
  });

  it("rejects PUE with payment_form 99", () => {
    const result = validatePaymentTerms("PUE", "99");
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("PUE"))).toBe(true);
  });

  it("rejects PPD without 99", () => {
    const result = validatePaymentTerms("PPD", "01");
    expect(result.valid).toBe(false);
  });

  it("warns when PPD has no due date", () => {
    const result = validatePaymentTerms("PPD", "99");
    expect(result.valid).toBe(true);
    expect(result.warnings.some((w) => w.includes("due date"))).toBe(true);
  });

  it("warns when due date is in the past", () => {
    const pastDate = new Date();
    pastDate.setDate(pastDate.getDate() - 7);
    const result = validatePaymentTerms("PUE", "01", pastDate.toISOString());
    expect(result.valid).toBe(true);
    expect(result.warnings.some((w) => w.includes("past"))).toBe(true);
  });
});

describe("validateCurrency", () => {
  it("accepts MXN with exchange_rate = 1", () => {
    const result = validateCurrency("MXN", 1);
    expect(result.valid).toBe(true);
  });

  it("rejects MXN with exchange_rate != 1", () => {
    const result = validateCurrency("MXN", 1.5);
    expect(result.valid).toBe(false);
  });

  it("accepts USD with valid exchange rate", () => {
    const result = validateCurrency("USD", 17.5);
    expect(result.valid).toBe(true);
  });

  it("rejects USD with exchange_rate = 1", () => {
    const result = validateCurrency("USD", 1);
    expect(result.valid).toBe(false);
  });

  it("rejects unsupported currency", () => {
    const result = validateCurrency("XYZ", 1.5);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("Unsupported"))).toBe(true);
  });

  it("rejects negative exchange rate", () => {
    const result = validateCurrency("USD", -17.5);
    expect(result.valid).toBe(false);
  });
});

describe("validateRelatedInvoices", () => {
  it("accepts empty array", () => {
    const result = validateRelatedInvoices([], "I");
    expect(result.valid).toBe(true);
  });

  it("accepts valid related invoice", () => {
    const result = validateRelatedInvoices(
      [
        {
          tipo_relacion: "04",
          related_uuid: "123e4567-e89b-42d3-a456-426614174000",
        },
      ],
      "I"
    );
    expect(result.valid).toBe(true);
  });

  it("rejects duplicate UUIDs", () => {
    const uuid = "123e4567-e89b-42d3-a456-426614174000";
    const result = validateRelatedInvoices(
      [
        { tipo_relacion: "04", related_uuid: uuid },
        { tipo_relacion: "07", related_uuid: uuid },
      ],
      "I"
    );
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("Duplicate"))).toBe(true);
  });

  it("rejects credit note on non-Egreso invoice", () => {
    const result = validateRelatedInvoices(
      [
        {
          tipo_relacion: TipoRelacion.NOTA_CREDITO,
          related_uuid: "123e4567-e89b-42d3-a456-426614174000",
        },
      ],
      TipoComprobante.INGRESO
    );
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("Credit note"))).toBe(true);
  });

  it("accepts credit note on Egreso invoice", () => {
    const result = validateRelatedInvoices(
      [
        {
          tipo_relacion: TipoRelacion.NOTA_CREDITO,
          related_uuid: "123e4567-e89b-42d3-a456-426614174000",
        },
      ],
      TipoComprobante.EGRESO
    );
    expect(result.valid).toBe(true);
  });

  it("rejects multiple substitutions", () => {
    const result = validateRelatedInvoices(
      [
        {
          tipo_relacion: TipoRelacion.SUSTITUCION,
          related_uuid: "123e4567-e89b-42d3-a456-426614174000",
        },
        {
          tipo_relacion: TipoRelacion.SUSTITUCION,
          related_uuid: "223e4567-e89b-42d3-a456-426614174001",
        },
      ],
      "I"
    );
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("Substitution"))).toBe(true);
  });

  it("rejects invalid UUID format", () => {
    const result = validateRelatedInvoices(
      [{ tipo_relacion: "04", related_uuid: "invalid-uuid" }],
      "I"
    );
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("UUID"))).toBe(true);
  });
});

describe("validateInvoiceForStamping", () => {
  const createValidInvoice = (): Invoice => ({
    id: "inv-1",
    organization_id: "org-1",
    status: InvoiceStatus.DRAFT,
    tipo_comprobante: TipoComprobante.INGRESO,
    issue_date: new Date().toISOString(),
    issuer_rfc: "AAA010101AAA",
    issuer_name: "Test Company",
    issuer_tax_regime: "601",
    issuer_zip_code: "06600",
    customer_id: "cust-1",
    receiver_rfc: "BBB020202BBB",
    receiver_name: "Customer Name",
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
    items: [
      {
        id: "item-1",
        invoice_id: "inv-1",
        sort_order: 0,
        sat_product_code: "81112100",
        sat_unit_code: "E48",
        unit_name: "Hora",
        description: "Servicio de consultoría",
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
    ],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  it("accepts valid invoice for stamping", () => {
    const invoice = createValidInvoice();
    const org = { rfc: "AAA010101AAA", csd_certificate: {} };
    const result = validateInvoiceForStamping(invoice, org);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("rejects non-draft invoice", () => {
    const invoice = createValidInvoice();
    invoice.status = InvoiceStatus.STAMPED;
    const result = validateInvoiceForStamping(invoice);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("draft"))).toBe(true);
  });

  it("rejects invoices older than 72 hours", () => {
    const invoice = createValidInvoice();
    const oldDate = new Date();
    oldDate.setHours(oldDate.getHours() - 73);
    invoice.issue_date = oldDate.toISOString();
    const result = validateInvoiceForStamping(invoice);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("72 hours"))).toBe(true);
  });

  it("rejects future issue date", () => {
    const invoice = createValidInvoice();
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 1);
    invoice.issue_date = futureDate.toISOString();
    const result = validateInvoiceForStamping(invoice);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("future"))).toBe(true);
  });

  it("returns errors for missing receiver zip_code", () => {
    const invoice = createValidInvoice();
    invoice.receiver_zip_code = "";
    const result = validateInvoiceForStamping(invoice);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("Receiver zip code"))).toBe(
      true
    );
  });

  it("returns warning for past due_date (not error)", () => {
    const invoice = createValidInvoice();
    const pastDate = new Date();
    pastDate.setDate(pastDate.getDate() - 7);
    invoice.due_date = pastDate.toISOString();
    const result = validateInvoiceForStamping(invoice);
    expect(result.valid).toBe(true);
    expect(result.warnings.some((w) => w.includes("past"))).toBe(true);
  });

  it("rejects invoice with no items", () => {
    const invoice = createValidInvoice();
    invoice.items = [];
    const result = validateInvoiceForStamping(invoice);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("at least one item"))).toBe(
      true
    );
  });

  it("rejects items with invalid SAT product code", () => {
    const invoice = createValidInvoice();
    invoice.items![0].sat_product_code = "123"; // Should be 8 digits
    const result = validateInvoiceForStamping(invoice);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("SAT product code"))).toBe(
      true
    );
  });

  it("warns for high discount items", () => {
    const invoice = createValidInvoice();
    invoice.items![0].discount_amount = 6000; // 60% discount
    const result = validateInvoiceForStamping(invoice);
    // High discount is a warning, not an error
    expect(result.warnings.some((w) => w.includes("High discount"))).toBe(true);
  });

  it("rejects when organization has no CSD certificate", () => {
    const invoice = createValidInvoice();
    const org = { rfc: "AAA010101AAA" }; // No csd_certificate
    const result = validateInvoiceForStamping(invoice, org);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("CSD certificate"))).toBe(true);
  });

  it("validates global invoice fields", () => {
    const invoice = createValidInvoice();
    invoice.is_global = true;
    // Missing global fields
    const result = validateInvoiceForStamping(invoice);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("Global invoice"))).toBe(true);
  });
});

describe("Helper validators", () => {
  describe("isValidRFC", () => {
    it("accepts valid persona moral RFC (12 chars)", () => {
      expect(isValidRFC("AAA010101AAA")).toBe(true);
    });

    it("accepts valid persona fisica RFC (13 chars)", () => {
      expect(isValidRFC("AABB010101CCC")).toBe(true);
    });

    it("accepts public general RFC", () => {
      expect(isValidRFC(RFC_PUBLICO_GENERAL)).toBe(true);
    });

    it("accepts foreign RFC", () => {
      expect(isValidRFC(RFC_EXTRANJERO)).toBe(true);
    });

    it("rejects invalid RFC", () => {
      expect(isValidRFC("INVALID")).toBe(false);
    });

    it("rejects empty RFC", () => {
      expect(isValidRFC("")).toBe(false);
    });
  });

  describe("isValidUUID", () => {
    it("accepts valid UUID v4", () => {
      expect(isValidUUID("123e4567-e89b-42d3-a456-426614174000")).toBe(true);
    });

    it("rejects invalid UUID", () => {
      expect(isValidUUID("invalid-uuid")).toBe(false);
    });
  });

  describe("isValidPostalCode", () => {
    it("accepts 5-digit code", () => {
      expect(isValidPostalCode("06600")).toBe(true);
    });

    it("rejects shorter codes", () => {
      expect(isValidPostalCode("1234")).toBe(false);
    });

    it("rejects letters", () => {
      expect(isValidPostalCode("0660A")).toBe(false);
    });
  });

  describe("isValidSATProductCode", () => {
    it("accepts 8-digit code", () => {
      expect(isValidSATProductCode("81112100")).toBe(true);
    });

    it("rejects shorter codes", () => {
      expect(isValidSATProductCode("1234567")).toBe(false);
    });

    it("rejects codes with letters", () => {
      expect(isValidSATProductCode("8111210A")).toBe(false);
    });
  });
});
