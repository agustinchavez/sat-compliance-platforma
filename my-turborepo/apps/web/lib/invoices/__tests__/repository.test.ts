/**
 * Tests for Invoice Repository (Component 12 - Step 6)
 *
 * Tests the database operations layer using mocked Supabase client.
 */

import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";

// Mock storage for the Supabase client mocks
const mockStorage = {
  selectData: null as unknown,
  selectError: null as { code: string; message: string } | null,
  selectCount: null as number | null,
  insertData: null as unknown,
  insertError: null as { message: string } | null,
  updateError: null as { message: string } | null,
  deleteError: null as { message: string } | null,
  rpcData: null as unknown,
  rpcError: null as { message: string } | null,
};

// Create chainable query builder
const createMockQueryBuilder = () => {
  const builder: Record<string, Mock> = {};

  const methods = [
    "select", "insert", "update", "delete",
    "eq", "is", "in", "not", "gte", "lte", "lt",
    "order", "range", "single", "textSearch", "rpc"
  ];

  methods.forEach((method) => {
    builder[method] = vi.fn().mockImplementation(() => builder);
  });

  // Override single to return the mock data
  builder.single = vi.fn().mockImplementation(() =>
    Promise.resolve({
      data: mockStorage.selectData,
      error: mockStorage.selectError
    })
  );

  // Override range to return list data
  builder.range = vi.fn().mockImplementation(() =>
    Promise.resolve({
      data: mockStorage.selectData,
      error: mockStorage.selectError,
      count: mockStorage.selectCount
    })
  );

  // Override insert to return insert data
  builder.insert = vi.fn().mockImplementation(() => ({
    ...builder,
    select: vi.fn().mockImplementation(() => ({
      ...builder,
      single: vi.fn().mockImplementation(() =>
        Promise.resolve({
          data: mockStorage.insertData,
          error: mockStorage.insertError
        })
      )
    }))
  }));

  // Override update
  builder.update = vi.fn().mockImplementation(() => ({
    ...builder,
    eq: vi.fn().mockImplementation(() =>
      Promise.resolve({ error: mockStorage.updateError })
    )
  }));

  // Override delete
  builder.delete = vi.fn().mockImplementation(() => ({
    ...builder,
    eq: vi.fn().mockImplementation(() => ({
      ...builder,
      eq: vi.fn().mockImplementation(() =>
        Promise.resolve({ error: mockStorage.deleteError })
      )
    }))
  }));

  // Override is for the is("deleted_at", null) case
  builder.is = vi.fn().mockImplementation(() => ({
    ...builder,
    single: vi.fn().mockImplementation(() =>
      Promise.resolve({
        data: mockStorage.selectData,
        error: mockStorage.selectError
      })
    )
  }));

  return builder;
};

const mockQueryBuilder = createMockQueryBuilder();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn().mockImplementation(() =>
    Promise.resolve({
      from: vi.fn().mockImplementation(() => mockQueryBuilder),
      rpc: vi.fn().mockImplementation(() =>
        Promise.resolve({
          data: mockStorage.rpcData,
          error: mockStorage.rpcError
        })
      ),
    })
  ),
}));

// Import types - do this before the repository import
import { InvoiceStatus, TipoComprobante, MetodoPago } from "../types";

// Import repository functions
import {
  findById,
  findByUUID,
  findByOrganization,
  create,
  update,
  softDelete,
  getNextFolioPreview,
  countByStatus,
} from "../repository";

// Sample data for tests
const sampleInvoiceRow = {
  id: "inv-123",
  organization_id: "org-1",
  uuid: null,
  serie: "A",
  folio_number: "00000001",
  folio_number_int: 1,
  status: "draft",
  tipo_comprobante: "I",
  issue_date: "2026-03-05T10:00:00Z",
  due_date: null,
  stamped_at: null,
  sent_at: null,
  paid_at: null,
  cancelled_at: null,
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
  payment_method: "PUE",
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
  global_periodicity: null,
  global_months: null,
  global_year: null,
  cancellation_reason: null,
  cancellation_uuid: null,
  cancellation_response_code: null,
  notes: null,
  conditions: null,
  cfdi_xml: null,
  pdf_url: null,
  created_by: "user-1",
  updated_by: "user-1",
  created_at: "2026-03-05T10:00:00Z",
  updated_at: "2026-03-05T10:00:00Z",
  deleted_at: null,
};

const sampleItemRow = {
  id: "item-1",
  invoice_id: "inv-123",
  sort_order: 0,
  product_id: null,
  sat_product_code: "81112100",
  sat_unit_code: "E48",
  unit_name: "Hora",
  sku: null,
  description: "Consulting services",
  quantity: 1,
  unit_price: 10000,
  discount_amount: 0,
  subtotal: 10000,
  tax_object: "02",
  iva_rate: 0.16,
  iva_exempt: false,
  iva_trasladado: 1600,
  iva_retention_rate: null,
  iva_retenido: 0,
  isr_retention_rate: null,
  isr_retenido: 0,
  total: 11600,
  created_at: "2026-03-05T10:00:00Z",
};

// Helper to reset mocks
function resetMocks() {
  mockStorage.selectData = null;
  mockStorage.selectError = null;
  mockStorage.selectCount = null;
  mockStorage.insertData = null;
  mockStorage.insertError = null;
  mockStorage.updateError = null;
  mockStorage.deleteError = null;
  mockStorage.rpcData = null;
  mockStorage.rpcError = null;
}

describe("findById", () => {
  beforeEach(() => {
    resetMocks();
  });

  it("returns null for non-existent ID", async () => {
    mockStorage.selectData = null;
    mockStorage.selectError = { code: "PGRST116", message: "Row not found" };

    const result = await findById("non-existent");

    expect(result).toBeNull();
  });

  it("returns invoice data when found", async () => {
    mockStorage.selectData = sampleInvoiceRow;
    mockStorage.selectError = null;

    const result = await findById("inv-123");

    expect(result).not.toBeNull();
    expect(result?.id).toBe("inv-123");
    expect(result?.status).toBe(InvoiceStatus.DRAFT);
  });

  it("includes items when includeItems is true", async () => {
    mockStorage.selectData = {
      ...sampleInvoiceRow,
      invoice_items: [sampleItemRow],
    };
    mockStorage.selectError = null;

    const result = await findById("inv-123", { includeItems: true });

    expect(result).not.toBeNull();
    expect(result?.items).toHaveLength(1);
    expect(result?.items?.[0].sat_product_code).toBe("81112100");
  });

  it("sorts items by sort_order", async () => {
    mockStorage.selectData = {
      ...sampleInvoiceRow,
      invoice_items: [
        { ...sampleItemRow, id: "item-2", sort_order: 1 },
        { ...sampleItemRow, id: "item-1", sort_order: 0 },
      ],
    };
    mockStorage.selectError = null;

    const result = await findById("inv-123", { includeItems: true });

    expect(result?.items?.[0].id).toBe("item-1");
    expect(result?.items?.[1].id).toBe("item-2");
  });

  it("includes related CFDIs when includeRelated is true", async () => {
    mockStorage.selectData = {
      ...sampleInvoiceRow,
      invoice_related_cfdi: [
        {
          id: "rel-1",
          invoice_id: "inv-123",
          tipo_relacion: "04",
          related_uuid: "UUID-RELATED-123",
        },
      ],
    };
    mockStorage.selectError = null;

    const result = await findById("inv-123", { includeRelated: true });

    expect(result?.related_cfdi).toHaveLength(1);
    expect(result?.related_cfdi?.[0].tipo_relacion).toBe("04");
  });

  it("throws error on database failure", async () => {
    mockStorage.selectData = null;
    mockStorage.selectError = { code: "500", message: "Database error" };

    await expect(findById("inv-123")).rejects.toThrow("Failed to find invoice");
  });
});

describe("findByUUID", () => {
  beforeEach(() => {
    resetMocks();
  });

  it("returns null for non-existent UUID", async () => {
    mockStorage.selectData = null;
    mockStorage.selectError = { code: "PGRST116", message: "Row not found" };

    const result = await findByUUID("non-existent-uuid");

    expect(result).toBeNull();
  });

  it("returns invoice with items by UUID", async () => {
    mockStorage.selectData = {
      ...sampleInvoiceRow,
      uuid: "SAT-UUID-123",
      status: "stamped",
      invoice_items: [sampleItemRow],
      invoice_related_cfdi: [],
    };
    mockStorage.selectError = null;

    const result = await findByUUID("SAT-UUID-123");

    expect(result).not.toBeNull();
    expect(result?.uuid).toBe("SAT-UUID-123");
    expect(result?.status).toBe(InvoiceStatus.STAMPED);
    expect(result?.items).toHaveLength(1);
  });
});

describe("findByOrganization", () => {
  beforeEach(() => {
    resetMocks();
  });

  it("returns paginated list with default values", async () => {
    mockStorage.selectData = [sampleInvoiceRow];
    mockStorage.selectError = null;
    mockStorage.selectCount = 1;

    const result = await findByOrganization("org-1");

    expect(result.invoices).toHaveLength(1);
    expect(result.total).toBe(1);
    expect(result.page).toBe(1);
    expect(result.limit).toBe(20);
  });

  it("calculates total_pages correctly", async () => {
    mockStorage.selectData = [];
    mockStorage.selectError = null;
    mockStorage.selectCount = 100;

    const result = await findByOrganization("org-1", {
      pagination: { page: 1, limit: 10 },
    });

    expect(result.total_pages).toBe(10);
  });

  it("handles empty result", async () => {
    mockStorage.selectData = [];
    mockStorage.selectError = null;
    mockStorage.selectCount = 0;

    const result = await findByOrganization("org-1");

    expect(result.invoices).toHaveLength(0);
    expect(result.total).toBe(0);
    expect(result.total_pages).toBe(0);
  });
});

describe("create", () => {
  beforeEach(() => {
    resetMocks();
  });

  const mockOrgData = {
    rfc: "AAA010101AAA",
    business_name: "Test Company",
    tax_regime: "601",
    address: { postal_code: "06600" },
  };

  const mockCustomerData = {
    id: "cust-1",
    rfc: "BBB020202BBB",
    legal_name: "Customer Inc",
    tax_regime: "626",
    cfdi_use: "G03",
    address: { postal_code: "06600" },
  };

  const mockInput = {
    customer_id: "cust-1",
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

  it("calls get_next_folio RPC to get folio number", async () => {
    mockStorage.rpcData = 1;
    mockStorage.rpcError = null;
    mockStorage.insertData = { ...sampleInvoiceRow, id: "new-inv" };
    mockStorage.insertError = null;
    mockStorage.selectData = {
      ...sampleInvoiceRow,
      id: "new-inv",
      invoice_items: [sampleItemRow],
    };
    mockStorage.selectError = null;

    const result = await create(
      "org-1",
      mockInput,
      "user-1",
      mockOrgData,
      mockCustomerData
    );

    expect(result).not.toBeNull();
    expect(result.id).toBe("new-inv");
  });

  it("throws error when folio RPC fails", async () => {
    mockStorage.rpcData = null;
    mockStorage.rpcError = { message: "RPC error" };

    await expect(
      create("org-1", mockInput, "user-1", mockOrgData, mockCustomerData)
    ).rejects.toThrow("Failed to get next folio");
  });
});

describe("update", () => {
  beforeEach(() => {
    resetMocks();
  });

  it("throws error when invoice is not in DRAFT status", async () => {
    mockStorage.selectData = { ...sampleInvoiceRow, status: "stamped" };
    mockStorage.selectError = null;

    await expect(
      update("inv-123", { notes: "Updated note" }, "user-1")
    ).rejects.toThrow("Cannot update invoice in stamped status");
  });

  it("throws error for SENT status", async () => {
    mockStorage.selectData = { ...sampleInvoiceRow, status: "sent" };
    mockStorage.selectError = null;

    await expect(
      update("inv-123", { notes: "Updated note" }, "user-1")
    ).rejects.toThrow("Cannot update invoice in sent status");
  });

  it("throws error for PAID status", async () => {
    mockStorage.selectData = { ...sampleInvoiceRow, status: "paid" };
    mockStorage.selectError = null;

    await expect(
      update("inv-123", { notes: "Updated note" }, "user-1")
    ).rejects.toThrow("Cannot update invoice in paid status");
  });

  it("throws error for non-existent invoice", async () => {
    mockStorage.selectData = null;
    mockStorage.selectError = { code: "PGRST116", message: "Row not found" };

    await expect(
      update("non-existent", { notes: "Updated note" }, "user-1")
    ).rejects.toThrow("Invoice not found");
  });
});

describe("softDelete", () => {
  beforeEach(() => {
    resetMocks();
  });

  it("throws error for STAMPED invoice", async () => {
    mockStorage.selectData = { ...sampleInvoiceRow, status: "stamped" };
    mockStorage.selectError = null;

    await expect(softDelete("inv-123", "user-1")).rejects.toThrow(
      "Cannot delete invoice in stamped status"
    );
  });

  it("throws error for SENT invoice", async () => {
    mockStorage.selectData = { ...sampleInvoiceRow, status: "sent" };
    mockStorage.selectError = null;

    await expect(softDelete("inv-123", "user-1")).rejects.toThrow(
      "Cannot delete invoice in sent status"
    );
  });

  it("throws error for PAID invoice", async () => {
    mockStorage.selectData = { ...sampleInvoiceRow, status: "paid" };
    mockStorage.selectError = null;

    await expect(softDelete("inv-123", "user-1")).rejects.toThrow(
      "Cannot delete invoice in paid status"
    );
  });

  it("throws error for non-existent invoice", async () => {
    mockStorage.selectData = null;
    mockStorage.selectError = { code: "PGRST116", message: "Row not found" };

    await expect(softDelete("non-existent", "user-1")).rejects.toThrow(
      "Invoice not found"
    );
  });

  it("allows deletion of DRAFT invoice", async () => {
    mockStorage.selectData = { ...sampleInvoiceRow, status: "draft" };
    mockStorage.selectError = null;
    mockStorage.updateError = null;

    await expect(softDelete("inv-123", "user-1")).resolves.toBeUndefined();
  });

  it("allows deletion of VOID invoice", async () => {
    mockStorage.selectData = { ...sampleInvoiceRow, status: "void" };
    mockStorage.selectError = null;
    mockStorage.updateError = null;

    await expect(softDelete("inv-123", "user-1")).resolves.toBeUndefined();
  });
});

describe("getNextFolioPreview", () => {
  beforeEach(() => {
    resetMocks();
  });

  it("returns 00000001 when no sequence exists", async () => {
    mockStorage.selectData = null;
    mockStorage.selectError = { code: "PGRST116", message: "Row not found" };

    const result = await getNextFolioPreview("org-1");

    expect(result).toBe("00000001");
  });
});

describe("countByStatus", () => {
  beforeEach(() => {
    resetMocks();
  });

  it("returns zero counts for empty organization", async () => {
    mockStorage.selectData = [];
    mockStorage.selectError = null;

    const result = await countByStatus("org-empty");

    expect(result[InvoiceStatus.DRAFT]).toBe(0);
    expect(result[InvoiceStatus.STAMPED]).toBe(0);
    expect(result[InvoiceStatus.PAID]).toBe(0);
    expect(result[InvoiceStatus.CANCELLED]).toBe(0);
    expect(result[InvoiceStatus.VOID]).toBe(0);
  });
});

describe("Type conversions", () => {
  beforeEach(() => {
    resetMocks();
  });

  it("converts database null values to undefined", async () => {
    mockStorage.selectData = {
      ...sampleInvoiceRow,
      uuid: null,
      serie: null,
      due_date: null,
      notes: null,
    };
    mockStorage.selectError = null;

    const result = await findById("inv-123");

    expect(result?.uuid).toBeUndefined();
    expect(result?.serie).toBeUndefined();
    expect(result?.due_date).toBeUndefined();
    expect(result?.notes).toBeUndefined();
  });

  it("converts enum strings to proper types", async () => {
    mockStorage.selectData = {
      ...sampleInvoiceRow,
      status: "stamped",
      tipo_comprobante: "E",
      payment_method: "PPD",
    };
    mockStorage.selectError = null;

    const result = await findById("inv-123");

    expect(result?.status).toBe(InvoiceStatus.STAMPED);
    expect(result?.tipo_comprobante).toBe(TipoComprobante.EGRESO);
    expect(result?.payment_method).toBe(MetodoPago.PPD);
  });

  it("preserves numeric fields correctly", async () => {
    mockStorage.selectData = {
      ...sampleInvoiceRow,
      subtotal: 10000.5,
      total_iva_trasladado: 1600.08,
      total: 11600.58,
      exchange_rate: 17.1234,
    };
    mockStorage.selectError = null;

    const result = await findById("inv-123");

    expect(result?.subtotal).toBe(10000.5);
    expect(result?.total_iva_trasladado).toBe(1600.08);
    expect(result?.total).toBe(11600.58);
    expect(result?.exchange_rate).toBe(17.1234);
  });
});

describe("Folio formatting", () => {
  // These tests verify the formatFolio function behavior through getNextFolioPreview
  beforeEach(() => {
    resetMocks();
  });

  it("pads single digit folio to 8 characters", async () => {
    mockStorage.selectData = { next_folio: 1 };
    mockStorage.selectError = null;

    const result = await getNextFolioPreview("org-1");
    expect(result).toBe("00000001");
  });

  it("pads double digit folio correctly", async () => {
    mockStorage.selectData = { next_folio: 42 };
    mockStorage.selectError = null;

    const result = await getNextFolioPreview("org-1");
    expect(result).toBe("00000042");
  });

  it("handles large folio numbers", async () => {
    mockStorage.selectData = { next_folio: 12345678 };
    mockStorage.selectError = null;

    const result = await getNextFolioPreview("org-1");
    expect(result).toBe("12345678");
  });
});

describe("Invoice item conversion", () => {
  beforeEach(() => {
    resetMocks();
  });

  it("converts item row fields correctly", async () => {
    mockStorage.selectData = {
      ...sampleInvoiceRow,
      invoice_items: [
        {
          ...sampleItemRow,
          iva_retention_rate: 0.106667,
          isr_retention_rate: 0.1,
        },
      ],
    };
    mockStorage.selectError = null;

    const result = await findById("inv-123", { includeItems: true });

    const item = result?.items?.[0];
    expect(item?.iva_retention_rate).toBe(0.106667);
    expect(item?.isr_retention_rate).toBe(0.1);
    expect(item?.tax_object).toBe("02");
  });

  it("handles item with null optional fields", async () => {
    mockStorage.selectData = {
      ...sampleInvoiceRow,
      invoice_items: [
        {
          ...sampleItemRow,
          product_id: null,
          sku: null,
          iva_retention_rate: null,
          isr_retention_rate: null,
        },
      ],
    };
    mockStorage.selectError = null;

    const result = await findById("inv-123", { includeItems: true });

    const item = result?.items?.[0];
    expect(item?.product_id).toBeUndefined();
    expect(item?.sku).toBeUndefined();
    expect(item?.iva_retention_rate).toBeUndefined();
    expect(item?.isr_retention_rate).toBeUndefined();
  });
});
