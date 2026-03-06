/**
 * Tests for Invoice Service (Component 12 - Step 7)
 *
 * Tests the business logic layer with mocked dependencies.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type {
  ServiceContext,
  CustomerService,
  OrganizationService,
  ProductService,
} from "../service";
import {
  createDraft,
  updateDraft,
  submitForStamping,
  cancelInvoice,
  duplicateInvoice,
  markAsSent,
  markAsPaid,
  addRelatedInvoice,
  deleteInvoice,
  getInvoiceStats,
} from "../service";
import { InvoiceStatus, TipoComprobante, MetodoPago, CancellationReason, TipoRelacion } from "../types";
import type { Invoice } from "../types";
import type { CustomerData, OrganizationData } from "../repository";

// Mock repository
vi.mock("../repository", () => ({
  findById: vi.fn(),
  findByUUID: vi.fn(),
  findByOrganization: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  updateStatus: vi.fn(),
  softDelete: vi.fn(),
  addRelatedCFDI: vi.fn(),
  removeRelatedCFDI: vi.fn(),
  countByStatus: vi.fn(),
  getNextFolioPreview: vi.fn(),
}));

import * as repository from "../repository";

// Sample data
const sampleCustomer: CustomerData = {
  id: "cust-1",
  rfc: "BBB020202BBB",
  legal_name: "Customer Inc",
  tax_regime: "626",
  cfdi_use: "G03",
  address: { postal_code: "06600" },
};

const sampleOrganization: OrganizationData = {
  rfc: "AAA010101AAA",
  business_name: "Test Company",
  tax_regime: "601",
  address: { postal_code: "06600" },
};

const sampleInvoice: Invoice = {
  id: "inv-123",
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
  receiver_name: "Customer Inc",
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
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  items: [
    {
      id: "item-1",
      invoice_id: "inv-123",
      sort_order: 0,
      sat_product_code: "81112100",
      sat_unit_code: "E48",
      unit_name: "Hora",
      description: "Consulting",
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
};

// Mock service context
const mockCustomerService: CustomerService = {
  findById: vi.fn(),
};

const mockOrganizationService: OrganizationService = {
  findById: vi.fn(),
};

const mockProductService: ProductService = {
  findById: vi.fn(),
};

const mockContext: ServiceContext = {
  customerService: mockCustomerService,
  organizationService: mockOrganizationService,
  productService: mockProductService,
};

describe("createDraft", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns validation errors for missing customer_id", async () => {
    const input = {
      items: [
        {
          sat_product_code: "81112100",
          sat_unit_code: "E48",
          unit_name: "Hora",
          description: "Test",
          quantity: 1,
          unit_price: 100,
        },
      ],
    };

    // @ts-expect-error - testing invalid input
    const result = await createDraft("org-1", "user-1", input, mockContext);

    expect(result.success).toBe(false);
    expect(result.errors).toBeDefined();
    expect(result.errors?.some((e) => e.includes("customer_id"))).toBe(true);
  });

  it("returns error when customer not found", async () => {
    vi.mocked(mockCustomerService.findById).mockResolvedValue(null);

    const input = {
      customer_id: "550e8400-e29b-41d4-a716-446655440000", // Valid UUID but not found
      items: [
        {
          sat_product_code: "81112100",
          sat_unit_code: "E48",
          unit_name: "Hora",
          description: "Test",
          quantity: 1,
          unit_price: 100,
        },
      ],
    };

    const result = await createDraft("org-1", "user-1", input, mockContext);

    expect(result.success).toBe(false);
    expect(result.errors).toContain("Customer not found");
  });

  it("returns error when customer missing zip_code", async () => {
    const customerWithoutZip = {
      ...sampleCustomer,
      address: {},
    };
    vi.mocked(mockCustomerService.findById).mockResolvedValue(customerWithoutZip);

    const input = {
      customer_id: "550e8400-e29b-41d4-a716-446655440001",
      items: [
        {
          sat_product_code: "81112100",
          sat_unit_code: "E48",
          unit_name: "Hora",
          description: "Test",
          quantity: 1,
          unit_price: 100,
        },
      ],
    };

    const result = await createDraft("org-1", "user-1", input, mockContext);

    expect(result.success).toBe(false);
    expect(result.errors?.some((e) => e.toLowerCase().includes("zip") || e.toLowerCase().includes("postal") || e.toLowerCase().includes("codigo"))).toBe(true);
  });

  it("validates customer for CFDI compliance", async () => {
    vi.mocked(mockCustomerService.findById).mockResolvedValue(sampleCustomer);
    vi.mocked(mockOrganizationService.findById).mockResolvedValue(sampleOrganization);
    vi.mocked(repository.create).mockResolvedValue(sampleInvoice);

    const input = {
      customer_id: "550e8400-e29b-41d4-a716-446655440002",
      items: [
        {
          sat_product_code: "81112100",
          sat_unit_code: "E48",
          unit_name: "Hora",
          description: "Test",
          quantity: 1,
          unit_price: 100,
        },
      ],
    };

    const result = await createDraft("org-1", "user-1", input, mockContext);

    expect(mockCustomerService.findById).toHaveBeenCalledWith("550e8400-e29b-41d4-a716-446655440002");
    expect(result.success).toBe(true);
  });

  it("merges product tax config when product_id provided", async () => {
    const product = {
      id: "550e8400-e29b-41d4-a716-446655440010",
      sat_product_code: "43232408",
      sat_unit_code: "H87",
      unit_name: "Pieza",
      iva_rate: 0.16,
      iva_exempt: false,
      iva_retention_rate: 0.106667,
      isr_retention_rate: 0.1,
    };

    vi.mocked(mockCustomerService.findById).mockResolvedValue(sampleCustomer);
    vi.mocked(mockOrganizationService.findById).mockResolvedValue(sampleOrganization);
    vi.mocked(mockProductService.findById).mockResolvedValue(product);
    vi.mocked(repository.create).mockResolvedValue(sampleInvoice);

    const input = {
      customer_id: "550e8400-e29b-41d4-a716-446655440003",
      items: [
        {
          product_id: "550e8400-e29b-41d4-a716-446655440010",
          sat_product_code: "81112100", // Should be used (provided)
          sat_unit_code: "E48",
          unit_name: "Hora",
          description: "Test",
          quantity: 1,
          unit_price: 100,
          // iva_retention_rate and isr_retention_rate should come from product
        },
      ],
    };

    const result = await createDraft("org-1", "user-1", input, mockContext);

    expect(result.success).toBe(true);
    expect(mockProductService.findById).toHaveBeenCalledWith("550e8400-e29b-41d4-a716-446655440010");
  });

  it("returns error for invalid payment terms", async () => {
    vi.mocked(mockCustomerService.findById).mockResolvedValue(sampleCustomer);
    vi.mocked(mockOrganizationService.findById).mockResolvedValue(sampleOrganization);

    const input = {
      customer_id: "550e8400-e29b-41d4-a716-446655440005",
      payment_method: "PPD" as const,
      payment_form: "01", // Should be "99" for PPD
      items: [
        {
          sat_product_code: "81112100",
          sat_unit_code: "E48",
          unit_name: "Hora",
          description: "Test",
          quantity: 1,
          unit_price: 100,
        },
      ],
    };

    const result = await createDraft("org-1", "user-1", input, mockContext);

    expect(result.success).toBe(false);
    expect(result.errors?.some((e) => e.toLowerCase().includes("ppd") || e.toLowerCase().includes("99"))).toBe(true);
  });

  it("creates invoice successfully with valid input", async () => {
    vi.mocked(mockCustomerService.findById).mockResolvedValue(sampleCustomer);
    vi.mocked(mockOrganizationService.findById).mockResolvedValue(sampleOrganization);
    vi.mocked(repository.create).mockResolvedValue(sampleInvoice);

    const input = {
      customer_id: "550e8400-e29b-41d4-a716-446655440004",
      items: [
        {
          sat_product_code: "81112100",
          sat_unit_code: "E48",
          unit_name: "Hora",
          description: "Consulting",
          quantity: 1,
          unit_price: 10000,
        },
      ],
    };

    const result = await createDraft("org-1", "user-1", input, mockContext);

    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();
    expect(result.data?.id).toBe("inv-123");
    expect(repository.create).toHaveBeenCalled();
  });
});

describe("updateDraft", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns error when invoice not found", async () => {
    vi.mocked(repository.findById).mockResolvedValue(null);

    const result = await updateDraft("non-existent", "user-1", { notes: "test" }, mockContext);

    expect(result.success).toBe(false);
    expect(result.errors).toContain("Invoice not found");
  });

  it("returns error when invoice not in DRAFT status", async () => {
    const stampedInvoice = { ...sampleInvoice, status: InvoiceStatus.STAMPED };
    vi.mocked(repository.findById).mockResolvedValue(stampedInvoice);

    const result = await updateDraft("inv-123", "user-1", { notes: "test" }, mockContext);

    expect(result.success).toBe(false);
    expect(result.errors?.some((e) => e.includes("Cannot edit"))).toBe(true);
  });

  it("returns error for SENT invoice", async () => {
    const sentInvoice = { ...sampleInvoice, status: InvoiceStatus.SENT };
    vi.mocked(repository.findById).mockResolvedValue(sentInvoice);

    const result = await updateDraft("inv-123", "user-1", { notes: "test" }, mockContext);

    expect(result.success).toBe(false);
    expect(result.errors?.some((e) => e.includes("Cannot edit"))).toBe(true);
  });

  it("allows update when invoice is in DRAFT status", async () => {
    vi.mocked(repository.findById).mockResolvedValue(sampleInvoice);
    vi.mocked(repository.update).mockResolvedValue({ ...sampleInvoice, notes: "Updated" });

    const result = await updateDraft("inv-123", "user-1", { notes: "Updated" }, mockContext);

    expect(result.success).toBe(true);
    expect(repository.update).toHaveBeenCalled();
  });
});

describe("submitForStamping", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns error when invoice not found", async () => {
    vi.mocked(repository.findById).mockResolvedValue(null);

    const result = await submitForStamping("non-existent", "user-1");

    expect(result.success).toBe(false);
    expect(result.errors).toContain("Invoice not found");
  });

  it("returns errors when invoice fails stamping validation", async () => {
    // Invoice missing required fields for stamping
    const invalidInvoice = {
      ...sampleInvoice,
      items: [], // No items
    };
    vi.mocked(repository.findById).mockResolvedValue(invalidInvoice);

    const result = await submitForStamping("inv-123", "user-1");

    expect(result.success).toBe(false);
    expect(result.errors?.length).toBeGreaterThan(0);
  });

  it("transitions to PENDING_STAMP on success", async () => {
    const validInvoice = { ...sampleInvoice };
    vi.mocked(repository.findById).mockResolvedValue(validInvoice);
    vi.mocked(repository.updateStatus).mockResolvedValue({
      ...validInvoice,
      status: InvoiceStatus.PENDING_STAMP,
    });

    const result = await submitForStamping("inv-123", "user-1");

    expect(result.success).toBe(true);
    expect(repository.updateStatus).toHaveBeenCalledWith(
      "inv-123",
      InvoiceStatus.PENDING_STAMP,
      expect.any(Object)
    );
  });

  it("returns error when trying to submit already stamped invoice", async () => {
    const stampedInvoice = { ...sampleInvoice, status: InvoiceStatus.STAMPED };
    vi.mocked(repository.findById).mockResolvedValue(stampedInvoice);

    const result = await submitForStamping("inv-123", "user-1");

    expect(result.success).toBe(false);
  });
});

describe("cancelInvoice", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("transitions DRAFT invoice to VOID (not CANCELLED)", async () => {
    vi.mocked(repository.findById).mockResolvedValue(sampleInvoice);
    vi.mocked(repository.updateStatus).mockResolvedValue({
      ...sampleInvoice,
      status: InvoiceStatus.VOID,
    });

    const result = await cancelInvoice("inv-123", "user-1");

    expect(result.success).toBe(true);
    expect(repository.updateStatus).toHaveBeenCalledWith(
      "inv-123",
      InvoiceStatus.VOID,
      expect.any(Object)
    );
  });

  it("requires reason for STAMPED invoice", async () => {
    const stampedInvoice = {
      ...sampleInvoice,
      status: InvoiceStatus.STAMPED,
      uuid: "SAT-UUID-123",
    };
    vi.mocked(repository.findById).mockResolvedValue(stampedInvoice);

    const result = await cancelInvoice("inv-123", "user-1");

    expect(result.success).toBe(false);
    expect(result.errors?.some((e) => e.includes("reason"))).toBe(true);
  });

  it("requires replacementUUID for reason 04 (substitution)", async () => {
    const stampedInvoice = {
      ...sampleInvoice,
      status: InvoiceStatus.STAMPED,
      uuid: "SAT-UUID-123",
    };
    vi.mocked(repository.findById).mockResolvedValue(stampedInvoice);

    const result = await cancelInvoice(
      "inv-123",
      "user-1",
      CancellationReason.SUBSTITUTION
    );

    expect(result.success).toBe(false);
    expect(result.errors?.some((e) => e.includes("Replacement UUID"))).toBe(true);
  });

  it("cancels STAMPED invoice with valid reason", async () => {
    const stampedInvoice = {
      ...sampleInvoice,
      status: InvoiceStatus.STAMPED,
      uuid: "SAT-UUID-123",
    };
    vi.mocked(repository.findById).mockResolvedValue(stampedInvoice);
    vi.mocked(repository.updateStatus).mockResolvedValue({
      ...stampedInvoice,
      status: InvoiceStatus.CANCELLED,
    });

    const result = await cancelInvoice(
      "inv-123",
      "user-1",
      CancellationReason.VOUCHER_ERROR
    );

    expect(result.success).toBe(true);
    expect(repository.updateStatus).toHaveBeenCalledWith(
      "inv-123",
      InvoiceStatus.CANCELLED,
      expect.objectContaining({
        cancellation_reason: CancellationReason.VOUCHER_ERROR,
      })
    );
  });

  it("cancels with substitution when replacementUUID provided", async () => {
    const stampedInvoice = {
      ...sampleInvoice,
      status: InvoiceStatus.STAMPED,
      uuid: "SAT-UUID-123",
    };
    vi.mocked(repository.findById).mockResolvedValue(stampedInvoice);
    vi.mocked(repository.updateStatus).mockResolvedValue({
      ...stampedInvoice,
      status: InvoiceStatus.CANCELLED,
    });

    const result = await cancelInvoice(
      "inv-123",
      "user-1",
      CancellationReason.SUBSTITUTION,
      "REPLACEMENT-UUID-456"
    );

    expect(result.success).toBe(true);
    expect(repository.updateStatus).toHaveBeenCalledWith(
      "inv-123",
      InvoiceStatus.CANCELLED,
      expect.objectContaining({
        cancellation_reason: CancellationReason.SUBSTITUTION,
        cancellation_uuid: "REPLACEMENT-UUID-456",
      })
    );
  });
});

describe("duplicateInvoice", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates new draft with fresh ID", async () => {
    vi.mocked(repository.findById).mockResolvedValue(sampleInvoice);
    vi.mocked(mockCustomerService.findById).mockResolvedValue(sampleCustomer);
    vi.mocked(mockOrganizationService.findById).mockResolvedValue(sampleOrganization);

    const duplicatedInvoice = {
      ...sampleInvoice,
      id: "new-inv-456",
      uuid: undefined, // Should not copy UUID
    };
    vi.mocked(repository.create).mockResolvedValue(duplicatedInvoice);

    const result = await duplicateInvoice("inv-123", "user-1", "org-1", mockContext);

    expect(result.success).toBe(true);
    expect(result.data?.id).toBe("new-inv-456");
    expect(result.data?.uuid).toBeUndefined();
    expect(repository.create).toHaveBeenCalled();
  });

  it("does not copy UUID from source invoice", async () => {
    const stampedInvoice = {
      ...sampleInvoice,
      status: InvoiceStatus.STAMPED,
      uuid: "SAT-UUID-123",
    };
    vi.mocked(repository.findById).mockResolvedValue(stampedInvoice);
    vi.mocked(mockCustomerService.findById).mockResolvedValue(sampleCustomer);
    vi.mocked(mockOrganizationService.findById).mockResolvedValue(sampleOrganization);

    const duplicatedInvoice = {
      ...sampleInvoice,
      id: "new-inv-456",
      status: InvoiceStatus.DRAFT,
    };
    vi.mocked(repository.create).mockResolvedValue(duplicatedInvoice);

    const result = await duplicateInvoice("inv-123", "user-1", "org-1", mockContext);

    expect(result.success).toBe(true);
    // Verify create was called without UUID
    expect(repository.create).toHaveBeenCalled();
    const createCall = vi.mocked(repository.create).mock.calls[0];
    expect(createCall[1]).not.toHaveProperty("uuid");
  });

  it("returns error when source invoice not found", async () => {
    vi.mocked(repository.findById).mockResolvedValue(null);

    const result = await duplicateInvoice("non-existent", "user-1", "org-1", mockContext);

    expect(result.success).toBe(false);
    expect(result.errors).toContain("Invoice not found");
  });
});

describe("markAsSent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("transitions STAMPED to SENT", async () => {
    const stampedInvoice = {
      ...sampleInvoice,
      status: InvoiceStatus.STAMPED,
      uuid: "SAT-UUID-123",
    };
    vi.mocked(repository.findById).mockResolvedValue(stampedInvoice);
    vi.mocked(repository.updateStatus).mockResolvedValue({
      ...stampedInvoice,
      status: InvoiceStatus.SENT,
    });

    const result = await markAsSent("inv-123", "user-1");

    expect(result.success).toBe(true);
    expect(repository.updateStatus).toHaveBeenCalledWith(
      "inv-123",
      InvoiceStatus.SENT,
      expect.objectContaining({ sent_at: expect.any(String) })
    );
  });

  it("returns error for DRAFT invoice", async () => {
    vi.mocked(repository.findById).mockResolvedValue(sampleInvoice);

    const result = await markAsSent("inv-123", "user-1");

    expect(result.success).toBe(false);
  });
});

describe("markAsPaid", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("transitions STAMPED to PAID", async () => {
    const stampedInvoice = {
      ...sampleInvoice,
      status: InvoiceStatus.STAMPED,
      uuid: "SAT-UUID-123",
    };
    vi.mocked(repository.findById).mockResolvedValue(stampedInvoice);
    vi.mocked(repository.updateStatus).mockResolvedValue({
      ...stampedInvoice,
      status: InvoiceStatus.PAID,
    });

    const result = await markAsPaid("inv-123", "user-1");

    expect(result.success).toBe(true);
    expect(repository.updateStatus).toHaveBeenCalledWith(
      "inv-123",
      InvoiceStatus.PAID,
      expect.objectContaining({ paid_at: expect.any(String) })
    );
  });

  it("transitions SENT to PAID", async () => {
    const sentInvoice = {
      ...sampleInvoice,
      status: InvoiceStatus.SENT,
      uuid: "SAT-UUID-123",
    };
    vi.mocked(repository.findById).mockResolvedValue(sentInvoice);
    vi.mocked(repository.updateStatus).mockResolvedValue({
      ...sentInvoice,
      status: InvoiceStatus.PAID,
    });

    const result = await markAsPaid("inv-123", "user-1");

    expect(result.success).toBe(true);
  });
});

describe("addRelatedInvoice", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("only allows adding to DRAFT invoices", async () => {
    const stampedInvoice = { ...sampleInvoice, status: InvoiceStatus.STAMPED };
    vi.mocked(repository.findById).mockResolvedValue(stampedInvoice);

    const result = await addRelatedInvoice(
      "inv-123",
      TipoRelacion.SUSTITUCION,
      "550e8400-e29b-41d4-a716-446655440000"
    );

    expect(result.success).toBe(false);
    expect(result.errors?.some((e) => e.includes("draft"))).toBe(true);
  });

  it("validates UUID format", async () => {
    vi.mocked(repository.findById).mockResolvedValue(sampleInvoice);

    const result = await addRelatedInvoice(
      "inv-123",
      TipoRelacion.SUSTITUCION,
      "invalid-uuid"
    );

    expect(result.success).toBe(false);
    expect(result.errors?.some((e) => e.includes("UUID"))).toBe(true);
  });

  it("adds related CFDI to draft invoice", async () => {
    vi.mocked(repository.findById).mockResolvedValue(sampleInvoice);
    vi.mocked(repository.addRelatedCFDI).mockResolvedValue({
      id: "rel-1",
      invoice_id: "inv-123",
      tipo_relacion: TipoRelacion.SUSTITUCION,
      related_uuid: "550e8400-e29b-41d4-a716-446655440000",
      created_at: new Date().toISOString(),
    });

    const result = await addRelatedInvoice(
      "inv-123",
      TipoRelacion.SUSTITUCION,
      "550e8400-e29b-41d4-a716-446655440000"
    );

    expect(result.success).toBe(true);
    expect(repository.addRelatedCFDI).toHaveBeenCalledWith(
      "inv-123",
      TipoRelacion.SUSTITUCION,
      "550e8400-e29b-41d4-a716-446655440000"
    );
  });
});

describe("deleteInvoice", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls softDelete for valid invoice", async () => {
    vi.mocked(repository.softDelete).mockResolvedValue(undefined);

    const result = await deleteInvoice("inv-123", "user-1");

    expect(result.success).toBe(true);
    expect(repository.softDelete).toHaveBeenCalledWith("inv-123", "user-1");
  });

  it("returns error when softDelete fails", async () => {
    vi.mocked(repository.softDelete).mockRejectedValue(
      new Error("Cannot delete stamped invoice")
    );

    const result = await deleteInvoice("inv-123", "user-1");

    expect(result.success).toBe(false);
    expect(result.errors).toContain("Cannot delete stamped invoice");
  });
});

describe("getInvoiceStats", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calculates revenue from stamped/sent/paid invoices", async () => {
    const invoices = [
      { ...sampleInvoice, status: InvoiceStatus.STAMPED, total: 1000 },
      { ...sampleInvoice, status: InvoiceStatus.SENT, total: 2000 },
      { ...sampleInvoice, status: InvoiceStatus.PAID, total: 3000 },
      { ...sampleInvoice, status: InvoiceStatus.DRAFT, total: 500 }, // Not counted
    ];

    vi.mocked(repository.findByOrganization).mockResolvedValue({
      invoices,
      total: 4,
      page: 1,
      limit: 10000,
      total_pages: 1,
    });
    vi.mocked(repository.countByStatus).mockResolvedValue({
      [InvoiceStatus.DRAFT]: 1,
      [InvoiceStatus.PENDING_STAMP]: 0,
      [InvoiceStatus.STAMPED]: 1,
      [InvoiceStatus.SENT]: 1,
      [InvoiceStatus.PAID]: 1,
      [InvoiceStatus.CANCELLED]: 0,
      [InvoiceStatus.VOID]: 0,
    });

    const stats = await getInvoiceStats("org-1", "2026-01-01", "2026-12-31");

    expect(stats.total_revenue).toBe(6000); // 1000 + 2000 + 3000
    expect(stats.total_invoices).toBe(4);
  });

  it("counts pending invoices correctly", async () => {
    const invoices = [
      { ...sampleInvoice, status: InvoiceStatus.STAMPED },
      { ...sampleInvoice, status: InvoiceStatus.SENT },
      { ...sampleInvoice, status: InvoiceStatus.PENDING_STAMP },
    ];

    vi.mocked(repository.findByOrganization).mockResolvedValue({
      invoices,
      total: 3,
      page: 1,
      limit: 10000,
      total_pages: 1,
    });
    vi.mocked(repository.countByStatus).mockResolvedValue({
      [InvoiceStatus.DRAFT]: 0,
      [InvoiceStatus.PENDING_STAMP]: 1,
      [InvoiceStatus.STAMPED]: 1,
      [InvoiceStatus.SENT]: 1,
      [InvoiceStatus.PAID]: 0,
      [InvoiceStatus.CANCELLED]: 0,
      [InvoiceStatus.VOID]: 0,
    });

    const stats = await getInvoiceStats("org-1", "2026-01-01", "2026-12-31");

    expect(stats.total_pending).toBe(3); // STAMPED, SENT, PENDING_STAMP
  });

  it("counts overdue invoices correctly", async () => {
    const pastDate = new Date();
    pastDate.setDate(pastDate.getDate() - 30);

    const invoices = [
      {
        ...sampleInvoice,
        status: InvoiceStatus.STAMPED,
        due_date: pastDate.toISOString(),
      },
      {
        ...sampleInvoice,
        status: InvoiceStatus.SENT,
        due_date: pastDate.toISOString(),
      },
      {
        ...sampleInvoice,
        status: InvoiceStatus.PAID, // Not overdue - already paid
        due_date: pastDate.toISOString(),
      },
    ];

    vi.mocked(repository.findByOrganization).mockResolvedValue({
      invoices,
      total: 3,
      page: 1,
      limit: 10000,
      total_pages: 1,
    });
    vi.mocked(repository.countByStatus).mockResolvedValue({
      [InvoiceStatus.DRAFT]: 0,
      [InvoiceStatus.PENDING_STAMP]: 0,
      [InvoiceStatus.STAMPED]: 1,
      [InvoiceStatus.SENT]: 1,
      [InvoiceStatus.PAID]: 1,
      [InvoiceStatus.CANCELLED]: 0,
      [InvoiceStatus.VOID]: 0,
    });

    const stats = await getInvoiceStats("org-1", "2026-01-01", "2026-12-31");

    expect(stats.total_overdue).toBe(2); // STAMPED and SENT with past due date
  });
});
