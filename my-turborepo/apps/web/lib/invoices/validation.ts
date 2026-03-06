/**
 * Invoice Validation (Component 12 - Step 4)
 *
 * Zod schemas and business rule validators for invoices.
 * Ensures data integrity and CFDI 4.0 compliance.
 */

import { z } from "zod";
import type { Invoice, TaxObject } from "./types";
import {
  TipoComprobante,
  MetodoPago,
  TipoRelacion,
  InvoiceStatus,
  TIPO_RELACION_VALUES,
} from "./types";
import { validateAmounts } from "./calculations";

// ============================================================
// CONSTANTS
// ============================================================

// Valid IVA rates in Mexico
const VALID_IVA_RATES = [0, 0.08, 0.16];

// RFC patterns
const RFC_PATTERN_MORAL = /^[A-ZÑ&]{3}\d{6}[A-Z0-9]{3}$/; // Persona moral (12 chars)
const RFC_PATTERN_FISICA = /^[A-ZÑ&]{4}\d{6}[A-Z0-9]{3}$/; // Persona física (13 chars)

// Special RFCs
export const RFC_PUBLICO_GENERAL = "XAXX010101000"; // For global invoices
export const RFC_EXTRANJERO = "XEXX010101000"; // For foreign customers

// SAT product code pattern (8 digits)
const SAT_PRODUCT_CODE_PATTERN = /^\d{8}$/;

// UUID v4 pattern
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// Postal code pattern (5 digits)
const POSTAL_CODE_PATTERN = /^\d{5}$/;

// Common currency codes
const VALID_CURRENCIES = ["MXN", "USD", "EUR", "CAD", "GBP", "JPY", "CNY"];

// ============================================================
// ZOD SCHEMAS
// ============================================================

/**
 * Schema for invoice line item input.
 */
export const InvoiceItemInputSchema = z.object({
  product_id: z.string().uuid().optional(),
  sat_product_code: z
    .string()
    .length(8, "SAT product code must be 8 digits")
    .regex(/^\d{8}$/, "SAT product code must contain only digits"),
  sat_unit_code: z.string().min(1, "Unit code required").max(10),
  unit_name: z.string().min(1, "Unit name required").max(50),
  sku: z.string().max(100).optional(),
  description: z.string().min(1, "Description required").max(1000),
  quantity: z.number().positive("Quantity must be positive"),
  unit_price: z.number().nonnegative("Unit price cannot be negative"),
  discount_amount: z.number().nonnegative().optional().default(0),
  tax_object: z
    .enum(["01", "02", "03"] as const)
    .optional()
    .default("02"),
  iva_rate: z
    .number()
    .refine((r) => VALID_IVA_RATES.includes(r), {
      message: "IVA rate must be 0, 0.08, or 0.16",
    })
    .optional(),
  iva_exempt: z.boolean().optional(),
  iva_retention_rate: z.number().nonnegative().max(1).optional(),
  isr_retention_rate: z.number().nonnegative().max(1).optional(),
});

/**
 * Schema for related CFDI input.
 */
const RelatedCFDIInputSchema = z.object({
  tipo_relacion: z.enum(TIPO_RELACION_VALUES as [string, ...string[]]),
  related_uuid: z.string().regex(UUID_PATTERN, "Invalid UUID format"),
});

/**
 * Schema for creating a new invoice.
 */
export const CreateInvoiceSchema = z
  .object({
    tipo_comprobante: z
      .enum(["I", "E", "T"] as const)
      .optional()
      .default("I"),
    customer_id: z.string().uuid("Invalid customer ID"),
    serie: z.string().max(25).optional(),
    issue_date: z.string().datetime().optional(),
    due_date: z.string().optional(),
    payment_method: z
      .enum(["PUE", "PPD"] as const)
      .optional()
      .default("PUE"),
    payment_form: z
      .string()
      .length(2, "Payment form must be 2 digits")
      .optional()
      .default("01"),
    currency: z.string().length(3, "Currency must be 3 characters").optional().default("MXN"),
    exchange_rate: z.number().positive().optional().default(1),
    exportacion: z.string().length(2).optional().default("01"),
    items: z
      .array(InvoiceItemInputSchema)
      .min(1, "At least one item required"),
    related_cfdi: z.array(RelatedCFDIInputSchema).optional(),
    notes: z.string().max(2000).optional(),
    conditions: z.string().max(1000).optional(),
    is_global: z.boolean().optional().default(false),
    global_periodicity: z.string().length(2).optional(),
    global_months: z.string().length(2).optional(),
    global_year: z.string().length(4).optional(),
  })
  .refine(
    (data) => {
      // PPD invoices must use payment_form '99' (por definir)
      if (data.payment_method === "PPD" && data.payment_form !== "99") {
        return false;
      }
      return true;
    },
    { message: "PPD invoices must use payment form 99 (por definir)" }
  )
  .refine(
    (data) => {
      // PUE invoices cannot use payment_form '99'
      if (data.payment_method === "PUE" && data.payment_form === "99") {
        return false;
      }
      return true;
    },
    { message: "PUE invoices cannot use payment form 99" }
  )
  .refine(
    (data) => {
      // Non-MXN invoices must provide exchange_rate != 1
      if (data.currency !== "MXN" && data.exchange_rate === 1) {
        return false;
      }
      return true;
    },
    { message: "Foreign currency invoices must provide exchange rate" }
  )
  .refine(
    (data) => {
      // MXN invoices must have exchange_rate = 1
      if (data.currency === "MXN" && data.exchange_rate !== 1) {
        return false;
      }
      return true;
    },
    { message: "MXN invoices must have exchange rate of 1" }
  )
  .refine(
    (data) => {
      // Global invoices require periodicity, months, year
      if (data.is_global) {
        return (
          data.global_periodicity && data.global_months && data.global_year
        );
      }
      return true;
    },
    { message: "Global invoices require periodicity, months, and year" }
  );

/**
 * Schema for updating an existing invoice.
 */
export const UpdateInvoiceSchema = z
  .object({
    customer_id: z.string().uuid().optional(),
    serie: z.string().max(25).optional(),
    issue_date: z.string().datetime().optional(),
    due_date: z.string().optional(),
    payment_method: z.enum(["PUE", "PPD"] as const).optional(),
    payment_form: z.string().length(2).optional(),
    currency: z.string().length(3).optional(),
    exchange_rate: z.number().positive().optional(),
    exportacion: z.string().length(2).optional(),
    items: z.array(InvoiceItemInputSchema).min(1).optional(),
    related_cfdi: z.array(RelatedCFDIInputSchema).optional(),
    notes: z.string().max(2000).optional(),
    conditions: z.string().max(1000).optional(),
    is_global: z.boolean().optional(),
    global_periodicity: z.string().length(2).optional(),
    global_months: z.string().length(2).optional(),
    global_year: z.string().length(4).optional(),
  })
  .refine(
    (data) => {
      // If both payment_method and payment_form are provided, validate consistency
      if (data.payment_method === "PPD" && data.payment_form && data.payment_form !== "99") {
        return false;
      }
      return true;
    },
    { message: "PPD invoices must use payment form 99" }
  );

// ============================================================
// BUSINESS RULE VALIDATORS
// ============================================================

/**
 * Customer data required for CFDI validation.
 */
export interface CustomerForValidation {
  rfc: string;
  tax_regime?: string;
  cfdi_use?: string;
  address?: {
    postal_code?: string;
    zip_code?: string;
  };
}

/**
 * Validate that a customer has all required fields for CFDI 4.0.
 */
export function validateCustomerForCFDI(customer: CustomerForValidation): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  // RFC validation
  if (!customer.rfc) {
    errors.push("Customer RFC is required");
  } else {
    const rfc = customer.rfc.toUpperCase();

    // Special RFCs are always valid
    if (rfc !== RFC_PUBLICO_GENERAL && rfc !== RFC_EXTRANJERO) {
      // Validate RFC format
      if (!RFC_PATTERN_MORAL.test(rfc) && !RFC_PATTERN_FISICA.test(rfc)) {
        errors.push("Invalid RFC format");
      }
    }
  }

  // Tax regime validation (required in CFDI 4.0)
  if (!customer.tax_regime) {
    errors.push("Customer tax regime is required");
  } else if (!/^\d{3}$/.test(customer.tax_regime)) {
    errors.push("Tax regime must be a 3-digit code");
  }

  // CFDI use validation
  if (!customer.cfdi_use) {
    errors.push("Customer CFDI use is required");
  }

  // Address with postal code (required in CFDI 4.0 for DomicilioFiscalReceptor)
  const postalCode =
    customer.address?.postal_code || customer.address?.zip_code;
  if (!postalCode) {
    errors.push("Customer postal code is required for CFDI 4.0");
  } else if (!POSTAL_CODE_PATTERN.test(postalCode)) {
    errors.push("Postal code must be 5 digits");
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Validate payment term combinations.
 */
export function validatePaymentTerms(
  payment_method: string,
  payment_form: string,
  due_date?: string
): { valid: boolean; errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];

  // PPD requires payment_form = '99'
  if (payment_method === "PPD" && payment_form !== "99") {
    errors.push('PPD payment method requires payment form 99 (por definir)');
  }

  // PUE cannot use payment_form '99'
  if (payment_method === "PUE" && payment_form === "99") {
    errors.push("PUE payment method cannot use payment form 99");
  }

  // PPD should have a due_date (warning, not error)
  if (payment_method === "PPD" && !due_date) {
    warnings.push("PPD invoices should have a due date");
  }

  // Due date should not be in the past (warning)
  if (due_date) {
    const dueDateObj = new Date(due_date);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (dueDateObj < today) {
      warnings.push("Due date is in the past");
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Validate currency and exchange rate combination.
 */
export function validateCurrency(
  currency: string,
  exchange_rate: number
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Currency must be a valid 3-letter code
  if (!currency || currency.length !== 3) {
    errors.push("Currency must be a 3-letter ISO 4217 code");
  } else if (!VALID_CURRENCIES.includes(currency.toUpperCase())) {
    errors.push(
      `Unsupported currency: ${currency}. Supported: ${VALID_CURRENCIES.join(", ")}`
    );
  }

  // MXN must have exchange_rate = 1
  if (currency.toUpperCase() === "MXN" && exchange_rate !== 1) {
    errors.push("MXN invoices must have exchange rate of 1");
  }

  // Non-MXN must have exchange_rate > 0 and != 1
  if (currency.toUpperCase() !== "MXN") {
    if (exchange_rate <= 0) {
      errors.push("Exchange rate must be positive");
    } else if (exchange_rate === 1) {
      errors.push("Foreign currency invoices must provide actual exchange rate");
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Validate related invoices (CFDIs relacionados).
 */
export function validateRelatedInvoices(
  related: Array<{ tipo_relacion: string; related_uuid: string }>,
  tipo_comprobante: string
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!related || related.length === 0) {
    return { valid: true, errors: [] };
  }

  const uuids = new Set<string>();

  for (const rel of related) {
    // Validate UUID format
    if (!UUID_PATTERN.test(rel.related_uuid)) {
      errors.push(`Invalid UUID format: ${rel.related_uuid}`);
    }

    // Check for duplicates
    if (uuids.has(rel.related_uuid.toLowerCase())) {
      errors.push(`Duplicate related UUID: ${rel.related_uuid}`);
    }
    uuids.add(rel.related_uuid.toLowerCase());

    // Credit note (01) only valid on Egreso type
    if (rel.tipo_relacion === TipoRelacion.NOTA_CREDITO && tipo_comprobante !== TipoComprobante.EGRESO) {
      errors.push("Credit note relationship (01) is only valid for Egreso invoices");
    }
  }

  // Substitution (04) can only reference one UUID
  const substitutions = related.filter(
    (r) => r.tipo_relacion === TipoRelacion.SUSTITUCION
  );
  if (substitutions.length > 1) {
    errors.push("Substitution relationship (04) can only reference one invoice");
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Organization data required for stamping validation.
 */
export interface OrganizationForValidation {
  rfc: string;
  tax_regime?: string;
  address?: {
    postal_code?: string;
    zip_code?: string;
  };
  csd_certificate?: unknown;
}

/**
 * Final validation before submitting invoice to PAC for stamping.
 * More strict than draft validation.
 */
export function validateInvoiceForStamping(
  invoice: Invoice,
  organization?: OrganizationForValidation
): {
  valid: boolean;
  errors: string[];
  warnings: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Status must be draft
  if (invoice.status !== InvoiceStatus.DRAFT) {
    errors.push(
      `Invoice must be in draft status to stamp, current status: ${invoice.status}`
    );
  }

  // Validate issuer fields
  if (!invoice.issuer_rfc) {
    errors.push("Issuer RFC is required");
  }
  if (!invoice.issuer_name) {
    errors.push("Issuer name is required");
  }
  if (!invoice.issuer_tax_regime) {
    errors.push("Issuer tax regime is required");
  }
  if (!invoice.issuer_zip_code) {
    errors.push("Issuer zip code is required");
  } else if (!POSTAL_CODE_PATTERN.test(invoice.issuer_zip_code)) {
    errors.push("Issuer zip code must be 5 digits");
  }

  // Validate receiver fields (CFDI 4.0 requirements)
  if (!invoice.receiver_rfc) {
    errors.push("Receiver RFC is required");
  }
  if (!invoice.receiver_name) {
    errors.push("Receiver name is required");
  }
  if (!invoice.receiver_tax_regime) {
    errors.push("Receiver tax regime is required");
  }
  if (!invoice.receiver_zip_code) {
    errors.push("Receiver zip code is required (CFDI 4.0)");
  } else if (!POSTAL_CODE_PATTERN.test(invoice.receiver_zip_code)) {
    errors.push("Receiver zip code must be 5 digits");
  }
  if (!invoice.receiver_cfdi_use) {
    errors.push("Receiver CFDI use is required");
  }

  // Must have at least one item
  if (!invoice.items || invoice.items.length === 0) {
    errors.push("Invoice must have at least one item");
  } else {
    // Validate each item
    for (let i = 0; i < invoice.items.length; i++) {
      const item = invoice.items[i];

      // SAT product code validation
      if (!item.sat_product_code) {
        errors.push(`Item ${i + 1}: SAT product code is required`);
      } else if (!SAT_PRODUCT_CODE_PATTERN.test(item.sat_product_code)) {
        errors.push(`Item ${i + 1}: SAT product code must be 8 digits`);
      }

      // SAT unit code validation
      if (!item.sat_unit_code) {
        errors.push(`Item ${i + 1}: SAT unit code is required`);
      }

      // Description validation
      if (!item.description) {
        errors.push(`Item ${i + 1}: Description is required`);
      }

      // Check for high discounts (warning)
      if (item.discount_amount > 0) {
        const subtotal = item.quantity * item.unit_price;
        const discountPercent = (item.discount_amount / subtotal) * 100;
        if (discountPercent > 50) {
          warnings.push(
            `Item ${i + 1}: High discount (${discountPercent.toFixed(0)}%) may trigger SAT audit`
          );
        }
      }
    }
  }

  // Validate amounts are internally consistent
  if (invoice.items && invoice.items.length > 0) {
    const amountValidation = validateAmounts(invoice);
    if (!amountValidation.valid) {
      errors.push(...amountValidation.errors);
    }
  }

  // Issue date validation
  if (invoice.issue_date) {
    const issueDate = new Date(invoice.issue_date);
    const now = new Date();

    // Cannot be more than 72 hours in the past
    const maxPastMs = 72 * 60 * 60 * 1000;
    if (now.getTime() - issueDate.getTime() > maxPastMs) {
      errors.push(
        "Issue date cannot be more than 72 hours in the past (SAT rejects older invoices)"
      );
    }

    // Cannot be in the future
    if (issueDate > now) {
      errors.push("Issue date cannot be in the future");
    }
  } else {
    errors.push("Issue date is required");
  }

  // Due date warning
  if (invoice.due_date) {
    const dueDate = new Date(invoice.due_date);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (dueDate < today) {
      warnings.push("Due date is in the past");
    }
  }

  // Currency validation
  const currencyValidation = validateCurrency(
    invoice.currency,
    invoice.exchange_rate
  );
  if (!currencyValidation.valid) {
    errors.push(...currencyValidation.errors);
  }

  // Payment terms validation
  const paymentValidation = validatePaymentTerms(
    invoice.payment_method,
    invoice.payment_form,
    invoice.due_date
  );
  if (!paymentValidation.valid) {
    errors.push(...paymentValidation.errors);
  }
  warnings.push(...paymentValidation.warnings);

  // Related invoices validation
  if (invoice.related_cfdi && invoice.related_cfdi.length > 0) {
    const relatedValidation = validateRelatedInvoices(
      invoice.related_cfdi.map((r) => ({
        tipo_relacion: r.tipo_relacion,
        related_uuid: r.related_uuid,
      })),
      invoice.tipo_comprobante
    );
    if (!relatedValidation.valid) {
      errors.push(...relatedValidation.errors);
    }
  }

  // Global invoice validation
  if (invoice.is_global) {
    if (!invoice.global_periodicity) {
      errors.push("Global invoice requires periodicity");
    }
    if (!invoice.global_months) {
      errors.push("Global invoice requires months");
    }
    if (!invoice.global_year) {
      errors.push("Global invoice requires year");
    }
  }

  // Organization CSD certificate check
  if (organization && !organization.csd_certificate) {
    errors.push("Organization must have a CSD certificate configured for stamping");
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Validate RFC format.
 */
export function isValidRFC(rfc: string): boolean {
  if (!rfc) return false;
  const upperRFC = rfc.toUpperCase();

  // Special RFCs are always valid
  if (upperRFC === RFC_PUBLICO_GENERAL || upperRFC === RFC_EXTRANJERO) {
    return true;
  }

  return (
    RFC_PATTERN_MORAL.test(upperRFC) || RFC_PATTERN_FISICA.test(upperRFC)
  );
}

/**
 * Validate UUID format.
 */
export function isValidUUID(uuid: string): boolean {
  return UUID_PATTERN.test(uuid);
}

/**
 * Validate postal code format.
 */
export function isValidPostalCode(code: string): boolean {
  return POSTAL_CODE_PATTERN.test(code);
}

/**
 * Validate SAT product code format.
 */
export function isValidSATProductCode(code: string): boolean {
  return SAT_PRODUCT_CODE_PATTERN.test(code);
}

// Re-export types for convenience
export type CreateInvoiceInput = z.infer<typeof CreateInvoiceSchema>;
export type UpdateInvoiceInput = z.infer<typeof UpdateInvoiceSchema>;
export type InvoiceItemInput = z.infer<typeof InvoiceItemInputSchema>;
