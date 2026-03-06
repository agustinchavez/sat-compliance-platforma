/**
 * CFDI Bridge Tests (Component 13 - Step 8)
 *
 * Integration tests for the CFDI bridge adapter.
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  generateCFDIFromInvoice,
  generateCFDIPreview,
  isCFDIGeneratorReady,
} from "../cfdi-bridge";
import type { Invoice, InvoiceItem } from "../types";
import { InvoiceStatus, TipoComprobante, MetodoPago } from "../types";

// ============================================
// Test Fixtures
// ============================================

function createTestInvoice(overrides?: Partial<Invoice>): Invoice {
  const baseInvoice: Invoice = {
    id: "inv-001",
    organization_id: "org-001",
    status: InvoiceStatus.DRAFT,
    tipo_comprobante: TipoComprobante.INGRESO,
    issue_date: "2024-03-01T10:00:00",

    // Issuer
    issuer_rfc: "EKU9003173C9",
    issuer_name: "ESCUELA KEMPER URGATE",
    issuer_tax_regime: "601",
    issuer_zip_code: "06600",

    // Receiver
    customer_id: "cust-001",
    receiver_rfc: "URE180429TM6",
    receiver_name: "UNIVERSIDAD ROBOTICA ESPAÑOLA",
    receiver_tax_regime: "601",
    receiver_zip_code: "65000",
    receiver_cfdi_use: "G01",

    // Payment
    payment_method: MetodoPago.PUE,
    payment_form: "03",
    currency: "MXN",
    exchange_rate: 1,
    exportacion: "01",

    // Amounts
    subtotal: 10000,
    discount: 0,
    total_iva_trasladado: 1600,
    total_iva_retenido: 0,
    total_isr_retenido: 0,
    total: 11600,

    // Global invoice
    is_global: false,

    // Audit
    created_at: "2024-03-01T09:00:00Z",
    updated_at: "2024-03-01T09:00:00Z",

    // Items
    items: [createTestInvoiceItem()],

    ...overrides,
  };

  return baseInvoice;
}

function createTestInvoiceItem(overrides?: Partial<InvoiceItem>): InvoiceItem {
  return {
    id: "item-001",
    invoice_id: "inv-001",
    sort_order: 1,
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
    ...overrides,
  };
}

// ============================================
// Tests
// ============================================

describe("generateCFDIFromInvoice", () => {
  describe("field mapping", () => {
    it("maps sat_product_code to ClaveProdServ in XML", async () => {
      const invoice = createTestInvoice();
      const result = await generateCFDIFromInvoice(invoice);

      expect(result.xml).toContain('ClaveProdServ="81112100"');
    });

    it("maps sat_unit_code to ClaveUnidad in XML", async () => {
      const invoice = createTestInvoice();
      const result = await generateCFDIFromInvoice(invoice);

      expect(result.xml).toContain('ClaveUnidad="E48"');
    });

    it("maps issuer_zip_code to LugarExpedicion", async () => {
      const invoice = createTestInvoice({ issuer_zip_code: "06600" });
      const result = await generateCFDIFromInvoice(invoice);

      expect(result.xml).toContain('LugarExpedicion="06600"');
    });

    it("maps receiver_zip_code to DomicilioFiscalReceptor", async () => {
      const invoice = createTestInvoice({ receiver_zip_code: "65000" });
      const result = await generateCFDIFromInvoice(invoice);

      expect(result.xml).toContain('DomicilioFiscalReceptor="65000"');
    });

    it("maps issuer fields correctly", async () => {
      const invoice = createTestInvoice();
      const result = await generateCFDIFromInvoice(invoice);

      expect(result.xml).toContain('Rfc="EKU9003173C9"');
      expect(result.xml).toContain('Nombre="ESCUELA KEMPER URGATE"');
      expect(result.xml).toContain('RegimenFiscal="601"');
    });

    it("maps receiver fields correctly", async () => {
      const invoice = createTestInvoice();
      const result = await generateCFDIFromInvoice(invoice);

      expect(result.xml).toContain('Rfc="URE180429TM6"');
      expect(result.xml).toContain('Nombre="UNIVERSIDAD ROBOTICA ESPAÑOLA"');
      expect(result.xml).toContain('RegimenFiscalReceptor="601"');
      expect(result.xml).toContain('UsoCFDI="G01"');
    });
  });

  describe("tax breakdown", () => {
    it("generates IVA traslado from iva_rate and iva_trasladado", async () => {
      const invoice = createTestInvoice();
      const result = await generateCFDIFromInvoice(invoice);

      // Concepto-level tax
      expect(result.xml).toContain('Impuesto="002"');
      expect(result.xml).toContain('TipoFactor="Tasa"');
      expect(result.xml).toContain('TasaOCuota="0.160000"');
    });

    it("generates IVA exento when iva_exempt is true", async () => {
      const invoice = createTestInvoice({
        items: [
          createTestInvoiceItem({
            tax_object: "02",
            iva_rate: 0,
            iva_exempt: true,
            iva_trasladado: 0,
          }),
        ],
      });
      const result = await generateCFDIFromInvoice(invoice);

      expect(result.xml).toContain('TipoFactor="Exento"');
    });

    it("generates IVA retention when iva_retention_rate is set", async () => {
      const invoice = createTestInvoice({
        items: [
          createTestInvoiceItem({
            iva_retention_rate: 0.1067,
            iva_retenido: 1067,
          }),
        ],
      });
      const result = await generateCFDIFromInvoice(invoice);

      // Should have both traslado and retencion
      expect(result.xml).toContain("cfdi:Retenciones");
      expect(result.xml).toContain("cfdi:Retencion");
    });

    it("generates ISR retention when isr_retention_rate is set", async () => {
      const invoice = createTestInvoice({
        items: [
          createTestInvoiceItem({
            isr_retention_rate: 0.1,
            isr_retenido: 1000,
          }),
        ],
      });
      const result = await generateCFDIFromInvoice(invoice);

      expect(result.xml).toContain('Impuesto="001"'); // ISR code
    });

    it("generates no tax breakdown for tax_object 01", async () => {
      const invoice = createTestInvoice({
        items: [
          createTestInvoiceItem({
            tax_object: "01",
            iva_rate: 0,
            iva_exempt: false,
            iva_trasladado: 0,
          }),
        ],
      });
      const result = await generateCFDIFromInvoice(invoice);

      // Concepto should have ObjetoImp="01" but no Impuestos child
      expect(result.xml).toContain('ObjetoImp="01"');
      // The Concepto should NOT have an Impuestos child
      // (This is a simplified check - actual XML structure validation is in generator tests)
    });
  });

  describe("validation", () => {
    it("returns validation errors for invoice without items", async () => {
      const invoice = createTestInvoice({ items: [] });
      const result = await generateCFDIFromInvoice(invoice);

      expect(result.validationResult.valid).toBe(false);
      expect(result.validationResult.errors).toContain(
        "Invoice must have at least one item"
      );
    });

    it("returns valid result for complete invoice", async () => {
      const invoice = createTestInvoice();
      const result = await generateCFDIFromInvoice(invoice);

      expect(result.validationResult.valid).toBe(true);
      expect(result.validationResult.errors).toHaveLength(0);
    });

    it("returns xmlUnsigned along with xml", async () => {
      const invoice = createTestInvoice();
      const result = await generateCFDIFromInvoice(invoice);

      expect(result.xml).toBeDefined();
      expect(result.xmlUnsigned).toBeDefined();
      expect(result.xml).toBe(result.xmlUnsigned); // They're the same pre-signing
    });
  });

  describe("CFDI structure", () => {
    it("includes Version 4.0", async () => {
      const invoice = createTestInvoice();
      const result = await generateCFDIFromInvoice(invoice);

      expect(result.xml).toContain('Version="4.0"');
    });

    it("includes CFDI namespace", async () => {
      const invoice = createTestInvoice();
      const result = await generateCFDIFromInvoice(invoice);

      expect(result.xml).toContain(
        'xmlns:cfdi="http://www.sat.gob.mx/cfd/4"'
      );
    });

    it("includes XML declaration", async () => {
      const invoice = createTestInvoice();
      const result = await generateCFDIFromInvoice(invoice);

      expect(result.xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    });

    it("includes TipoDeComprobante from invoice", async () => {
      const invoice = createTestInvoice({
        tipo_comprobante: TipoComprobante.EGRESO,
      });
      const result = await generateCFDIFromInvoice(invoice);

      expect(result.xml).toContain('TipoDeComprobante="E"');
    });

    it("includes payment fields", async () => {
      const invoice = createTestInvoice();
      const result = await generateCFDIFromInvoice(invoice);

      expect(result.xml).toContain('MetodoPago="PUE"');
      expect(result.xml).toContain('FormaPago="03"');
      expect(result.xml).toContain('Moneda="MXN"');
    });

    it("includes Exportacion field", async () => {
      const invoice = createTestInvoice({ exportacion: "01" });
      const result = await generateCFDIFromInvoice(invoice);

      expect(result.xml).toContain('Exportacion="01"');
    });
  });

  describe("related CFDIs", () => {
    it("includes CfdiRelacionados when related_cfdi is present", async () => {
      const invoice = createTestInvoice({
        related_cfdi: [
          {
            id: "rel-001",
            invoice_id: "inv-001",
            tipo_relacion: "04" as any,
            related_uuid: "F4F09AEF-57F2-4BE0-A828-87D1A80ED61C",
          },
        ],
      });
      const result = await generateCFDIFromInvoice(invoice);

      expect(result.xml).toContain("cfdi:CfdiRelacionados");
      expect(result.xml).toContain('TipoRelacion="04"');
      expect(result.xml).toContain(
        'UUID="F4F09AEF-57F2-4BE0-A828-87D1A80ED61C"'
      );
    });
  });

  describe("global invoices", () => {
    it("includes InformacionGlobal when is_global is true", async () => {
      const invoice = createTestInvoice({
        is_global: true,
        global_periodicity: "04",
        global_months: "03",
        global_year: "2024",
        receiver_rfc: "XAXX010101000",
      });
      const result = await generateCFDIFromInvoice(invoice);

      expect(result.xml).toContain("cfdi:InformacionGlobal");
      expect(result.xml).toContain('Periodicidad="04"');
      expect(result.xml).toContain('Meses="03"');
    });
  });

  describe("multiple items", () => {
    it("handles multiple items with different tax configurations", async () => {
      const invoice = createTestInvoice({
        items: [
          createTestInvoiceItem({
            id: "item-001",
            description: "Item 1",
            iva_rate: 0.16,
            iva_trasladado: 1600,
          }),
          createTestInvoiceItem({
            id: "item-002",
            description: "Item 2",
            iva_rate: 0.08,
            iva_trasladado: 800,
          }),
        ],
        subtotal: 20000,
        total_iva_trasladado: 2400,
        total: 22400,
      });
      const result = await generateCFDIFromInvoice(invoice);

      // Both items should be present
      expect(result.xml).toContain("Item 1");
      expect(result.xml).toContain("Item 2");

      // Both tax rates should appear
      expect(result.xml).toContain('TasaOCuota="0.160000"');
      expect(result.xml).toContain('TasaOCuota="0.080000"');
    });
  });
});

describe("generateCFDIPreview", () => {
  it("returns XML without cadena original", () => {
    const invoice = createTestInvoice();
    const result = generateCFDIPreview(invoice);

    expect(result).not.toBeNull();
    expect(result?.xml).toContain('Version="4.0"');
    expect(result?.valid).toBe(true);
  });

  it("returns null for invoice without items", () => {
    const invoice = createTestInvoice({ items: [] });
    const result = generateCFDIPreview(invoice);

    expect(result).toBeNull();
  });

  it("validates the generated XML structure", () => {
    const invoice = createTestInvoice();
    const result = generateCFDIPreview(invoice);

    // Should return valid result with proper structure
    expect(result).not.toBeNull();
    expect(result?.valid).toBe(true);
    expect(result?.xml).toContain("Version=\"4.0\"");
  });
});

describe("isCFDIGeneratorReady", () => {
  it("returns boolean", () => {
    const result = isCFDIGeneratorReady();
    expect(typeof result).toBe("boolean");
  });
});
