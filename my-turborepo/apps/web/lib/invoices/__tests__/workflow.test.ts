/**
 * Tests for Invoice Workflow (Component 12 - Step 5)
 *
 * Tests the state machine for invoice status transitions.
 */

import { describe, it, expect } from "vitest";
import {
  canTransition,
  getAvailableActions,
  getRequiredAction,
  requiresReason,
  validateTransition,
  transitionStatus,
  canEditInvoice,
  canCancelInvoice,
  canVoidInvoice,
  isStamped,
  isTerminal,
  getNextStatuses,
  getStatusLabel,
  getActionLabel,
} from "../workflow";
import type { Invoice } from "../types";
import { InvoiceStatus, TipoComprobante, MetodoPago, CancellationReason } from "../types";

// Helper to create a minimal invoice in a specific status
function createInvoice(status: InvoiceStatus, overrides: Partial<Invoice> = {}): Invoice {
  const now = new Date().toISOString();
  return {
    id: "inv-1",
    organization_id: "org-1",
    status,
    tipo_comprobante: TipoComprobante.INGRESO,
    issue_date: now,
    issuer_rfc: "AAA010101AAA",
    issuer_name: "Test Company",
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
    items: [
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
    ],
    created_at: now,
    updated_at: now,
    ...overrides,
  };
}

describe("canTransition", () => {
  describe("Valid transitions", () => {
    it("allows DRAFT → PENDING_STAMP", () => {
      expect(canTransition(InvoiceStatus.DRAFT, InvoiceStatus.PENDING_STAMP)).toBe(true);
    });

    it("allows DRAFT → VOID", () => {
      expect(canTransition(InvoiceStatus.DRAFT, InvoiceStatus.VOID)).toBe(true);
    });

    it("allows PENDING_STAMP → STAMPED", () => {
      expect(canTransition(InvoiceStatus.PENDING_STAMP, InvoiceStatus.STAMPED)).toBe(true);
    });

    it("allows STAMPED → SENT", () => {
      expect(canTransition(InvoiceStatus.STAMPED, InvoiceStatus.SENT)).toBe(true);
    });

    it("allows STAMPED → PAID", () => {
      expect(canTransition(InvoiceStatus.STAMPED, InvoiceStatus.PAID)).toBe(true);
    });

    it("allows STAMPED → CANCELLED", () => {
      expect(canTransition(InvoiceStatus.STAMPED, InvoiceStatus.CANCELLED)).toBe(true);
    });

    it("allows SENT → PAID", () => {
      expect(canTransition(InvoiceStatus.SENT, InvoiceStatus.PAID)).toBe(true);
    });

    it("allows SENT → CANCELLED", () => {
      expect(canTransition(InvoiceStatus.SENT, InvoiceStatus.CANCELLED)).toBe(true);
    });

    it("allows PAID → CANCELLED", () => {
      expect(canTransition(InvoiceStatus.PAID, InvoiceStatus.CANCELLED)).toBe(true);
    });
  });

  describe("Invalid transitions", () => {
    it("does not allow transition to same status", () => {
      expect(canTransition(InvoiceStatus.DRAFT, InvoiceStatus.DRAFT)).toBe(false);
    });

    it("does not allow PAID → DRAFT", () => {
      expect(canTransition(InvoiceStatus.PAID, InvoiceStatus.DRAFT)).toBe(false);
    });

    it("does not allow CANCELLED → any status", () => {
      expect(canTransition(InvoiceStatus.CANCELLED, InvoiceStatus.DRAFT)).toBe(false);
      expect(canTransition(InvoiceStatus.CANCELLED, InvoiceStatus.PAID)).toBe(false);
    });

    it("does not allow VOID → any status", () => {
      expect(canTransition(InvoiceStatus.VOID, InvoiceStatus.DRAFT)).toBe(false);
      expect(canTransition(InvoiceStatus.VOID, InvoiceStatus.STAMPED)).toBe(false);
    });

    it("does not allow DRAFT → STAMPED (must go through PENDING_STAMP)", () => {
      expect(canTransition(InvoiceStatus.DRAFT, InvoiceStatus.STAMPED)).toBe(false);
    });

    it("does not allow DRAFT → SENT", () => {
      expect(canTransition(InvoiceStatus.DRAFT, InvoiceStatus.SENT)).toBe(false);
    });

    it("does not allow DRAFT → PAID", () => {
      expect(canTransition(InvoiceStatus.DRAFT, InvoiceStatus.PAID)).toBe(false);
    });
  });
});

describe("getAvailableActions", () => {
  it("returns submit_for_stamping and void for DRAFT", () => {
    const invoice = createInvoice(InvoiceStatus.DRAFT);
    const actions = getAvailableActions(invoice);
    expect(actions).toContain("submit_for_stamping");
    expect(actions).toContain("void");
    expect(actions).toContain("duplicate");
  });

  it("returns mark_sent, mark_paid, cancel, duplicate for STAMPED", () => {
    const invoice = createInvoice(InvoiceStatus.STAMPED);
    const actions = getAvailableActions(invoice);
    expect(actions).toContain("mark_sent");
    expect(actions).toContain("mark_paid");
    expect(actions).toContain("cancel");
    expect(actions).toContain("duplicate");
  });

  it("returns mark_paid, cancel, duplicate for SENT", () => {
    const invoice = createInvoice(InvoiceStatus.SENT);
    const actions = getAvailableActions(invoice);
    expect(actions).toContain("mark_paid");
    expect(actions).toContain("cancel");
    expect(actions).toContain("duplicate");
    expect(actions).not.toContain("mark_sent");
  });

  it("returns only cancel and duplicate for PAID", () => {
    const invoice = createInvoice(InvoiceStatus.PAID);
    const actions = getAvailableActions(invoice);
    expect(actions).toContain("cancel");
    expect(actions).toContain("duplicate");
    expect(actions).not.toContain("mark_paid");
    expect(actions).not.toContain("mark_sent");
  });

  it("returns only duplicate for VOID", () => {
    const invoice = createInvoice(InvoiceStatus.VOID);
    const actions = getAvailableActions(invoice);
    expect(actions).toEqual(["duplicate"]);
  });

  it("returns only duplicate for CANCELLED", () => {
    const invoice = createInvoice(InvoiceStatus.CANCELLED);
    const actions = getAvailableActions(invoice);
    expect(actions).toEqual(["duplicate"]);
  });
});

describe("requiresReason", () => {
  it("returns true for transition to CANCELLED", () => {
    expect(requiresReason(InvoiceStatus.STAMPED, InvoiceStatus.CANCELLED)).toBe(true);
    expect(requiresReason(InvoiceStatus.SENT, InvoiceStatus.CANCELLED)).toBe(true);
    expect(requiresReason(InvoiceStatus.PAID, InvoiceStatus.CANCELLED)).toBe(true);
  });

  it("returns false for other transitions", () => {
    expect(requiresReason(InvoiceStatus.DRAFT, InvoiceStatus.PENDING_STAMP)).toBe(false);
    expect(requiresReason(InvoiceStatus.STAMPED, InvoiceStatus.SENT)).toBe(false);
    expect(requiresReason(InvoiceStatus.STAMPED, InvoiceStatus.PAID)).toBe(false);
  });
});

describe("validateTransition", () => {
  it("validates valid DRAFT → PENDING_STAMP transition", () => {
    const invoice = createInvoice(InvoiceStatus.DRAFT);
    const result = validateTransition(invoice, InvoiceStatus.PENDING_STAMP);
    expect(result.valid).toBe(true);
  });

  it("rejects transition to same status", () => {
    const invoice = createInvoice(InvoiceStatus.DRAFT);
    const result = validateTransition(invoice, InvoiceStatus.DRAFT);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("already in this status");
  });

  it("rejects transition from VOID", () => {
    const invoice = createInvoice(InvoiceStatus.VOID);
    const result = validateTransition(invoice, InvoiceStatus.DRAFT);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("Voided");
  });

  it("rejects transition from CANCELLED", () => {
    const invoice = createInvoice(InvoiceStatus.CANCELLED);
    const result = validateTransition(invoice, InvoiceStatus.DRAFT);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("Cancelled");
  });

  it("rejects invalid transition path", () => {
    const invoice = createInvoice(InvoiceStatus.PAID);
    const result = validateTransition(invoice, InvoiceStatus.DRAFT);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("Cannot transition");
  });

  it("rejects cancellation without reason", () => {
    const invoice = createInvoice(InvoiceStatus.STAMPED, { uuid: "123-456" });
    const result = validateTransition(invoice, InvoiceStatus.CANCELLED);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("Cancellation reason is required");
  });

  it("rejects cancellation with invalid reason", () => {
    const invoice = createInvoice(InvoiceStatus.STAMPED, { uuid: "123-456" });
    const result = validateTransition(invoice, InvoiceStatus.CANCELLED, "99");
    expect(result.valid).toBe(false);
    expect(result.error).toContain("Invalid cancellation reason");
  });

  it("accepts valid cancellation with reason", () => {
    const invoice = createInvoice(InvoiceStatus.STAMPED, { uuid: "123-456" });
    const result = validateTransition(
      invoice,
      InvoiceStatus.CANCELLED,
      CancellationReason.VOUCHER_ERROR
    );
    expect(result.valid).toBe(true);
  });
});

describe("transitionStatus", () => {
  it("sets stamped_at when transitioning to STAMPED", () => {
    const invoice = createInvoice(InvoiceStatus.PENDING_STAMP);
    const updates = transitionStatus(invoice, InvoiceStatus.STAMPED, {
      uuid: "SAT-UUID-123",
      cfdi_xml: "<cfdi>...</cfdi>",
    });

    expect(updates.status).toBe(InvoiceStatus.STAMPED);
    expect(updates.stamped_at).toBeDefined();
    expect(updates.uuid).toBe("SAT-UUID-123");
    expect(updates.cfdi_xml).toBe("<cfdi>...</cfdi>");
  });

  it("sets sent_at when transitioning to SENT", () => {
    const invoice = createInvoice(InvoiceStatus.STAMPED);
    const updates = transitionStatus(invoice, InvoiceStatus.SENT);

    expect(updates.status).toBe(InvoiceStatus.SENT);
    expect(updates.sent_at).toBeDefined();
  });

  it("sets paid_at when transitioning to PAID", () => {
    const invoice = createInvoice(InvoiceStatus.STAMPED);
    const updates = transitionStatus(invoice, InvoiceStatus.PAID);

    expect(updates.status).toBe(InvoiceStatus.PAID);
    expect(updates.paid_at).toBeDefined();
  });

  it("sets cancelled_at and cancellation_reason when transitioning to CANCELLED", () => {
    const invoice = createInvoice(InvoiceStatus.STAMPED);
    const updates = transitionStatus(invoice, InvoiceStatus.CANCELLED, {
      reason: CancellationReason.SUBSTITUTION,
    });

    expect(updates.status).toBe(InvoiceStatus.CANCELLED);
    expect(updates.cancelled_at).toBeDefined();
    expect(updates.cancellation_reason).toBe(CancellationReason.SUBSTITUTION);
  });

  it("sets deleted_at when transitioning to VOID", () => {
    const invoice = createInvoice(InvoiceStatus.DRAFT);
    const updates = transitionStatus(invoice, InvoiceStatus.VOID);

    expect(updates.status).toBe(InvoiceStatus.VOID);
    expect(updates.deleted_at).toBeDefined();
  });

  it("always sets updated_at", () => {
    const invoice = createInvoice(InvoiceStatus.DRAFT);
    const updates = transitionStatus(invoice, InvoiceStatus.PENDING_STAMP);

    expect(updates.updated_at).toBeDefined();
  });
});

describe("Helper functions", () => {
  describe("canEditInvoice", () => {
    it("returns true for DRAFT", () => {
      const invoice = createInvoice(InvoiceStatus.DRAFT);
      expect(canEditInvoice(invoice)).toBe(true);
    });

    it("returns false for STAMPED", () => {
      const invoice = createInvoice(InvoiceStatus.STAMPED);
      expect(canEditInvoice(invoice)).toBe(false);
    });

    it("returns false for SENT", () => {
      const invoice = createInvoice(InvoiceStatus.SENT);
      expect(canEditInvoice(invoice)).toBe(false);
    });
  });

  describe("canCancelInvoice", () => {
    it("returns true for STAMPED", () => {
      const invoice = createInvoice(InvoiceStatus.STAMPED);
      expect(canCancelInvoice(invoice)).toBe(true);
    });

    it("returns true for SENT", () => {
      const invoice = createInvoice(InvoiceStatus.SENT);
      expect(canCancelInvoice(invoice)).toBe(true);
    });

    it("returns true for PAID", () => {
      const invoice = createInvoice(InvoiceStatus.PAID);
      expect(canCancelInvoice(invoice)).toBe(true);
    });

    it("returns false for DRAFT", () => {
      const invoice = createInvoice(InvoiceStatus.DRAFT);
      expect(canCancelInvoice(invoice)).toBe(false);
    });
  });

  describe("canVoidInvoice", () => {
    it("returns true for DRAFT", () => {
      const invoice = createInvoice(InvoiceStatus.DRAFT);
      expect(canVoidInvoice(invoice)).toBe(true);
    });

    it("returns false for STAMPED", () => {
      const invoice = createInvoice(InvoiceStatus.STAMPED);
      expect(canVoidInvoice(invoice)).toBe(false);
    });
  });

  describe("isStamped", () => {
    it("returns true when invoice has UUID", () => {
      const invoice = createInvoice(InvoiceStatus.STAMPED, { uuid: "SAT-123" });
      expect(isStamped(invoice)).toBe(true);
    });

    it("returns false when invoice has no UUID", () => {
      const invoice = createInvoice(InvoiceStatus.DRAFT);
      expect(isStamped(invoice)).toBe(false);
    });
  });

  describe("isTerminal", () => {
    it("returns true for VOID", () => {
      const invoice = createInvoice(InvoiceStatus.VOID);
      expect(isTerminal(invoice)).toBe(true);
    });

    it("returns true for CANCELLED", () => {
      const invoice = createInvoice(InvoiceStatus.CANCELLED);
      expect(isTerminal(invoice)).toBe(true);
    });

    it("returns false for PAID", () => {
      const invoice = createInvoice(InvoiceStatus.PAID);
      expect(isTerminal(invoice)).toBe(false);
    });
  });

  describe("getNextStatuses", () => {
    it("returns PENDING_STAMP and VOID for DRAFT", () => {
      const statuses = getNextStatuses(InvoiceStatus.DRAFT);
      expect(statuses).toContain(InvoiceStatus.PENDING_STAMP);
      expect(statuses).toContain(InvoiceStatus.VOID);
    });

    it("returns empty array for VOID", () => {
      const statuses = getNextStatuses(InvoiceStatus.VOID);
      expect(statuses).toHaveLength(0);
    });
  });

  describe("getStatusLabel", () => {
    it("returns Spanish labels", () => {
      expect(getStatusLabel(InvoiceStatus.DRAFT)).toBe("Borrador");
      expect(getStatusLabel(InvoiceStatus.STAMPED)).toBe("Timbrada");
      expect(getStatusLabel(InvoiceStatus.CANCELLED)).toBe("Cancelada");
    });
  });

  describe("getActionLabel", () => {
    it("returns Spanish labels", () => {
      expect(getActionLabel("submit_for_stamping")).toBe("Timbrar");
      expect(getActionLabel("cancel")).toBe("Cancelar");
      expect(getActionLabel("duplicate")).toBe("Duplicar");
    });
  });
});
