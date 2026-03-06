/**
 * CFDI Bridge (Component 13 - Step 8)
 *
 * Thin adapter that converts Component 12's Invoice and InvoiceItem types
 * to the CFDIGeneratorInput format expected by @repo/cfdi.
 */

import {
  generateCFDI,
  generateCadenaOriginal,
  validateCFDI,
  isXSLTAvailable,
} from "@repo/cfdi";
import type {
  CFDIGeneratorInput,
  CFDIItemInput,
  TaxBreakdownRecord,
  CFDIValidationResult,
} from "@repo/cfdi";
import type { Invoice, InvoiceItem } from "./types";

// ============================================
// Bridge Result Types
// ============================================

export interface CFDIBridgeResult {
  xml: string;
  xmlUnsigned: string;
  cadenaOriginal?: string;
  sha256?: string;
  validationResult: {
    valid: boolean;
    errors: string[];
    warnings: string[];
  };
}

export interface CFDIBridgeError {
  code: string;
  message: string;
  field?: string;
}

// ============================================
// Main Bridge Function
// ============================================

/**
 * Generate a CFDI XML document from a Component 12 Invoice.
 *
 * This function:
 * 1. Maps Invoice → CFDIGeneratorInput
 * 2. Generates the CFDI XML
 * 3. Validates the XML structure
 * 4. Generates the cadena original (if XSLT is available)
 *
 * @param invoice - The Invoice from Component 12, including items
 * @returns The generated XML, validation results, and cadena original
 */
export async function generateCFDIFromInvoice(
  invoice: Invoice
): Promise<CFDIBridgeResult> {
  // Validate that invoice has items
  if (!invoice.items || invoice.items.length === 0) {
    return {
      xml: "",
      xmlUnsigned: "",
      validationResult: {
        valid: false,
        errors: ["Invoice must have at least one item"],
        warnings: [],
      },
    };
  }

  // Map Invoice to CFDIGeneratorInput
  const input = mapInvoiceToCFDIInput(invoice);

  // Generate the XML
  const { xml, xmlUnsigned } = generateCFDI(input);

  // Validate the generated XML
  const validation = validateCFDI(xml);
  const validationResult = mapValidationResult(validation);

  // If validation fails, return early with errors
  if (!validationResult.valid) {
    return {
      xml,
      xmlUnsigned,
      validationResult,
    };
  }

  // Generate cadena original if XSLT is available
  let cadenaOriginal: string | undefined;
  let sha256: string | undefined;

  if (isXSLTAvailable()) {
    try {
      const cadenaResult = await generateCadenaOriginal(xml);
      cadenaOriginal = cadenaResult.cadena;
      sha256 = cadenaResult.sha256;
    } catch (error) {
      // Cadena original generation failed - add as warning, not error
      validationResult.warnings.push(
        `Cadena original generation failed: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  } else {
    validationResult.warnings.push(
      "XSLT file not available - cadena original not generated"
    );
  }

  return {
    xml,
    xmlUnsigned,
    cadenaOriginal,
    sha256,
    validationResult,
  };
}

// ============================================
// Mapping Functions
// ============================================

/**
 * Map a Component 12 Invoice to CFDIGeneratorInput.
 */
function mapInvoiceToCFDIInput(invoice: Invoice): CFDIGeneratorInput {
  return {
    invoice: {
      id: invoice.id,
      uuid: invoice.uuid,
      serie: invoice.serie,
      folio: invoice.folio,
      issue_date: invoice.issue_date,
      tipo_comprobante: invoice.tipo_comprobante as "I" | "E" | "T",
      payment_method: invoice.payment_method,
      payment_form: invoice.payment_form,
      currency: invoice.currency,
      exchange_rate: invoice.exchange_rate,
      exportacion: invoice.exportacion,
      conditions: invoice.conditions,
      subtotal: invoice.subtotal,
      discount: invoice.discount,
      total: invoice.total,

      // Issuer fields
      issuer_rfc: invoice.issuer_rfc,
      issuer_name: invoice.issuer_name,
      issuer_tax_regime: invoice.issuer_tax_regime,
      issuer_zip_code: invoice.issuer_zip_code,

      // Receiver fields
      receiver_rfc: invoice.receiver_rfc,
      receiver_name: invoice.receiver_name,
      receiver_tax_regime: invoice.receiver_tax_regime,
      receiver_zip_code: invoice.receiver_zip_code,
      receiver_cfdi_use: invoice.receiver_cfdi_use,

      // Global invoice fields
      is_global: invoice.is_global,
      global_periodicity: invoice.global_periodicity,
      global_months: invoice.global_months,
      global_year: invoice.global_year,

      // Related CFDIs
      related_cfdi: invoice.related_cfdi?.map((rel) => ({
        tipo_relacion: rel.tipo_relacion,
        related_uuid: rel.related_uuid,
      })),

      // Map invoice items
      items: mapInvoiceItems(invoice.items || []),
    },
  };
}

/**
 * Map Component 12 InvoiceItem[] to CFDIItemInput[].
 */
function mapInvoiceItems(items: InvoiceItem[]): CFDIItemInput[] {
  return items.map((item) => ({
    // Note: Component 12 uses sat_product_code, CFDI uses product_service_key
    product_service_key: item.sat_product_code,
    // Note: Component 12 uses sat_unit_code, CFDI uses unit_key
    unit_key: item.sat_unit_code,
    unit_name: item.unit_name,
    sku: item.sku,
    description: item.description,
    quantity: item.quantity,
    unit_price: item.unit_price,
    discount_amount: item.discount_amount,
    tax_object: item.tax_object,
    // Build tax_breakdown from individual fields
    tax_breakdown: buildTaxBreakdown(item),
  }));
}

/**
 * Build the tax_breakdown array from individual InvoiceItem fields.
 *
 * Component 12 stores tax values as individual fields (iva_rate, iva_trasladado, etc.)
 * while the CFDI package expects a structured tax_breakdown array.
 */
function buildTaxBreakdown(item: InvoiceItem): TaxBreakdownRecord[] {
  const breakdown: TaxBreakdownRecord[] = [];
  const base = (item.subtotal - item.discount_amount).toFixed(6);

  // Handle tax object "01" (no tax) - no breakdown needed
  if (item.tax_object === "01") {
    return breakdown;
  }

  // IVA Trasladado (transferred IVA)
  if (item.iva_exempt) {
    // Exempt IVA
    breakdown.push({
      type: "traslado",
      impuesto: "002", // IVA
      tipo_factor: "Exento",
      base,
    });
  } else if (item.iva_rate > 0) {
    // Tasa IVA (16% or 8%)
    breakdown.push({
      type: "traslado",
      impuesto: "002", // IVA
      tipo_factor: "Tasa",
      tasa_o_cuota: item.iva_rate.toFixed(6),
      base,
      importe: item.iva_trasladado.toFixed(6),
    });
  } else if (item.iva_rate === 0 && !item.iva_exempt) {
    // 0% IVA
    breakdown.push({
      type: "traslado",
      impuesto: "002", // IVA
      tipo_factor: "Tasa",
      tasa_o_cuota: "0.000000",
      base,
      importe: "0.000000",
    });
  }

  // IVA Retenido (IVA retention)
  if (item.iva_retention_rate && item.iva_retention_rate > 0) {
    breakdown.push({
      type: "retencion",
      impuesto: "002", // IVA
      tipo_factor: "Tasa",
      tasa_o_cuota: item.iva_retention_rate.toFixed(6),
      base,
      importe: item.iva_retenido.toFixed(6),
    });
  }

  // ISR Retenido (ISR retention)
  if (item.isr_retention_rate && item.isr_retention_rate > 0) {
    breakdown.push({
      type: "retencion",
      impuesto: "001", // ISR
      tipo_factor: "Tasa",
      tasa_o_cuota: item.isr_retention_rate.toFixed(6),
      base,
      importe: item.isr_retenido.toFixed(6),
    });
  }

  return breakdown;
}

/**
 * Map CFDIValidationResult to a simpler bridge result format.
 */
function mapValidationResult(validation: CFDIValidationResult): {
  valid: boolean;
  errors: string[];
  warnings: string[];
} {
  return {
    valid: validation.valid,
    errors: validation.errors.map(
      (e) => `[${e.code}]${e.field ? ` ${e.field}:` : ""} ${e.message}`
    ),
    warnings: validation.warnings.map(
      (w) => `[${w.code}]${w.field ? ` ${w.field}:` : ""} ${w.message}`
    ),
  };
}

// ============================================
// Utility Functions
// ============================================

/**
 * Check if CFDI generation is fully operational.
 * Returns false if XSLT files are missing.
 */
export function isCFDIGeneratorReady(): boolean {
  return isXSLTAvailable();
}

/**
 * Generate only the XML without cadena original.
 * Useful for preview purposes.
 */
export function generateCFDIPreview(
  invoice: Invoice
): { xml: string; valid: boolean; errors: string[] } | null {
  if (!invoice.items || invoice.items.length === 0) {
    return null;
  }

  const input = mapInvoiceToCFDIInput(invoice);
  const { xml } = generateCFDI(input);
  const validation = validateCFDI(xml);

  return {
    xml,
    valid: validation.valid,
    errors: validation.errors.map((e) => e.message),
  };
}
