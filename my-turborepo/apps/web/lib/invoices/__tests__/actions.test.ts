/**
 * Tests for Invoice Server Actions (Component 12 - Step 8)
 *
 * Tests the server actions layer with mocked auth and service.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  createInvoiceAction,
  updateInvoiceAction,
  submitForStampingAction,
  cancelInvoiceAction,
  deleteInvoiceAction,
  duplicateInvoiceAction,
  getInvoiceAction,
  listInvoicesAction,
  markAsSentAction,
  markAsPaidAction,
  getInvoiceStatsAction,
  getNextFolioPreviewAction,
} from "../actions";
import { InvoiceStatus, CancellationReason, TipoComprobante, MetodoPago } from "../types";
import type { Invoice } from "../types";

// Mock auth
vi.mock("@/lib/auth", () => ({
  getCurrentUser: vi.fn(),
}));

// Mock multi-tenant context
vi.mock("@/lib/multi-tenant/context", () => ({
  getCurrentOrganization: vi.fn(),
  getOrganizationId: vi.fn(),
}));

// Mock RBAC
vi.mock("@/lib/rbac", () => ({
  requirePermission: vi.fn(),
}));

// Mock invoice service
vi.mock("../service", () => ({
  createDraft: vi.fn(),
  updateDraft: vi.fn(),
  submitForStamping: vi.fn(),
  cancelInvoice: vi.fn(),
  deleteInvoice: vi.fn(),
  duplicateInvoice: vi.fn(),
  getInvoice: vi.fn(),
  listInvoices: vi.fn(),
  markAsSent: vi.fn(),
  markAsPaid: vi.fn(),
  addRelatedInvoice: vi.fn(),
  removeRelatedInvoice: vi.fn(),
  getInvoiceStats: vi.fn(),
  getNextFolioPreview: vi.fn(),
}));

// Mock customer and organization services
vi.mock("@/lib/customers/service", () => ({
  getCustomer: vi.fn(),
}));

vi.mock("@/lib/organizations/service", () => ({
  getOrganization: vi.fn(),
}));

import { getCurrentUser } from "@/lib/auth";
import { requirePermission } from "@/lib/rbac";
import * as invoiceService from "../service";

// Sample invoice for tests
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
};

const mockUser = {
  id: "user-1",
  authId: "auth-1",
  email: "test@example.com",
  fullName: "Test User",
  role: "admin" as const,
  organizationId: "org-1",
  emailVerified: true,
  organization: {
    id: "org-1",
    name: "Test Org",
    rfc: "AAA010101AAA",
    plan: "pro",
  },
};

describe("createInvoiceAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getCurrentUser).mockResolvedValue(mockUser);
    vi.mocked(requirePermission).mockResolvedValue(undefined);
  });

  it("checks invoices:create permission", async () => {
    vi.mocked(invoiceService.createDraft).mockResolvedValue({
      success: true,
      data: sampleInvoice,
    });

    const input = {
      customer_id: "cust-1",
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

    await createInvoiceAction(input);

    expect(requirePermission).toHaveBeenCalledWith(
      "org-1",
      "user-1",
      "invoices",
      "create"
    );
  });

  it("returns errors when validation fails", async () => {
    vi.mocked(invoiceService.createDraft).mockResolvedValue({
      success: false,
      errors: ["customer_id: Required"],
    });

    const input = {
      customer_id: "cust-1",
      items: [],
    };

    const result = await createInvoiceAction(input);

    expect(result.success).toBe(false);
    expect(result.errors).toBeDefined();
  });

  it("returns success with invoice data", async () => {
    vi.mocked(invoiceService.createDraft).mockResolvedValue({
      success: true,
      data: sampleInvoice,
    });

    const input = {
      customer_id: "cust-1",
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

    const result = await createInvoiceAction(input);

    expect(result.success).toBe(true);
    expect(result.data?.id).toBe("inv-123");
  });

  it("returns error when not authenticated", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);

    const input = {
      customer_id: "cust-1",
      items: [],
    };

    const result = await createInvoiceAction(input);

    expect(result.success).toBe(false);
    expect(result.errors).toContain("Authentication required");
  });
});

describe("submitForStampingAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getCurrentUser).mockResolvedValue(mockUser);
    vi.mocked(requirePermission).mockResolvedValue(undefined);
  });

  it("checks permission before calling service", async () => {
    vi.mocked(invoiceService.submitForStamping).mockResolvedValue({
      success: true,
      data: { ...sampleInvoice, status: InvoiceStatus.PENDING_STAMP },
    });

    await submitForStampingAction("inv-123");

    expect(requirePermission).toHaveBeenCalledWith(
      "org-1",
      "user-1",
      "invoices",
      "stamp"
    );
    expect(invoiceService.submitForStamping).toHaveBeenCalledWith(
      "inv-123",
      "user-1"
    );
  });

  it("returns errors when validation fails", async () => {
    vi.mocked(invoiceService.submitForStamping).mockResolvedValue({
      success: false,
      errors: ["Invoice has no items"],
    });

    const result = await submitForStampingAction("inv-123");

    expect(result.success).toBe(false);
    expect(result.errors).toContain("Invoice has no items");
  });

  it("returns warnings from validation", async () => {
    vi.mocked(invoiceService.submitForStamping).mockResolvedValue({
      success: true,
      data: { ...sampleInvoice, status: InvoiceStatus.PENDING_STAMP },
      warnings: ["Issue date is close to 72-hour limit"],
    });

    const result = await submitForStampingAction("inv-123");

    expect(result.success).toBe(true);
    expect(result.warnings).toContain("Issue date is close to 72-hour limit");
  });
});

describe("cancelInvoiceAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getCurrentUser).mockResolvedValue(mockUser);
    vi.mocked(requirePermission).mockResolvedValue(undefined);
  });

  it("passes reason to service layer", async () => {
    vi.mocked(invoiceService.cancelInvoice).mockResolvedValue({
      success: true,
      data: { ...sampleInvoice, status: InvoiceStatus.CANCELLED },
    });

    await cancelInvoiceAction("inv-123", CancellationReason.VOUCHER_ERROR);

    expect(invoiceService.cancelInvoice).toHaveBeenCalledWith(
      "inv-123",
      "user-1",
      CancellationReason.VOUCHER_ERROR,
      undefined
    );
  });

  it("passes replacementUUID for substitution", async () => {
    vi.mocked(invoiceService.cancelInvoice).mockResolvedValue({
      success: true,
      data: { ...sampleInvoice, status: InvoiceStatus.CANCELLED },
    });

    await cancelInvoiceAction(
      "inv-123",
      CancellationReason.SUBSTITUTION,
      "REPLACEMENT-UUID-456"
    );

    expect(invoiceService.cancelInvoice).toHaveBeenCalledWith(
      "inv-123",
      "user-1",
      CancellationReason.SUBSTITUTION,
      "REPLACEMENT-UUID-456"
    );
  });

  it("checks invoices:cancel permission", async () => {
    vi.mocked(invoiceService.cancelInvoice).mockResolvedValue({
      success: true,
      data: { ...sampleInvoice, status: InvoiceStatus.CANCELLED },
    });

    await cancelInvoiceAction("inv-123", CancellationReason.VOUCHER_ERROR);

    expect(requirePermission).toHaveBeenCalledWith(
      "org-1",
      "user-1",
      "invoices",
      "cancel"
    );
  });
});

describe("updateInvoiceAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getCurrentUser).mockResolvedValue(mockUser);
    vi.mocked(requirePermission).mockResolvedValue(undefined);
  });

  it("checks invoices:update permission", async () => {
    vi.mocked(invoiceService.updateDraft).mockResolvedValue({
      success: true,
      data: sampleInvoice,
    });

    await updateInvoiceAction("inv-123", { notes: "Updated" });

    expect(requirePermission).toHaveBeenCalledWith(
      "org-1",
      "user-1",
      "invoices",
      "update"
    );
  });
});

describe("deleteInvoiceAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getCurrentUser).mockResolvedValue(mockUser);
    vi.mocked(requirePermission).mockResolvedValue(undefined);
  });

  it("checks invoices:delete permission", async () => {
    vi.mocked(invoiceService.deleteInvoice).mockResolvedValue({
      success: true,
    });

    await deleteInvoiceAction("inv-123");

    expect(requirePermission).toHaveBeenCalledWith(
      "org-1",
      "user-1",
      "invoices",
      "delete"
    );
  });
});

describe("duplicateInvoiceAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getCurrentUser).mockResolvedValue(mockUser);
    vi.mocked(requirePermission).mockResolvedValue(undefined);
  });

  it("checks invoices:create permission for duplicate", async () => {
    vi.mocked(invoiceService.duplicateInvoice).mockResolvedValue({
      success: true,
      data: { ...sampleInvoice, id: "new-inv" },
    });

    await duplicateInvoiceAction("inv-123");

    expect(requirePermission).toHaveBeenCalledWith(
      "org-1",
      "user-1",
      "invoices",
      "create"
    );
  });
});

describe("getInvoiceAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getCurrentUser).mockResolvedValue(mockUser);
    vi.mocked(requirePermission).mockResolvedValue(undefined);
  });

  it("returns invoice when found", async () => {
    vi.mocked(invoiceService.getInvoice).mockResolvedValue(sampleInvoice);

    const result = await getInvoiceAction("inv-123");

    expect(result.success).toBe(true);
    expect(result.data?.id).toBe("inv-123");
  });

  it("returns error when invoice not found", async () => {
    vi.mocked(invoiceService.getInvoice).mockResolvedValue(null);

    const result = await getInvoiceAction("inv-123");

    expect(result.success).toBe(false);
    expect(result.errors).toContain("Invoice not found");
  });

  it("returns error when invoice belongs to different org", async () => {
    const otherOrgInvoice = {
      ...sampleInvoice,
      organization_id: "other-org",
    };
    vi.mocked(invoiceService.getInvoice).mockResolvedValue(otherOrgInvoice);

    const result = await getInvoiceAction("inv-123");

    expect(result.success).toBe(false);
    expect(result.errors).toContain("Invoice not found");
  });
});

describe("listInvoicesAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getCurrentUser).mockResolvedValue(mockUser);
    vi.mocked(requirePermission).mockResolvedValue(undefined);
  });

  it("returns paginated list", async () => {
    vi.mocked(invoiceService.listInvoices).mockResolvedValue({
      invoices: [sampleInvoice],
      total: 1,
      page: 1,
      limit: 20,
      total_pages: 1,
    });

    const result = await listInvoicesAction();

    expect(result.success).toBe(true);
    expect(result.data?.invoices).toHaveLength(1);
    expect(result.data?.total).toBe(1);
  });

  it("passes filters to service", async () => {
    vi.mocked(invoiceService.listInvoices).mockResolvedValue({
      invoices: [],
      total: 0,
      page: 1,
      limit: 20,
      total_pages: 0,
    });

    const filters = { status: InvoiceStatus.STAMPED };
    const pagination = { page: 2, limit: 10 };
    const sort = { field: "total" as const, order: "desc" as const };

    await listInvoicesAction(filters, pagination, sort);

    expect(invoiceService.listInvoices).toHaveBeenCalledWith(
      "org-1",
      filters,
      pagination,
      sort
    );
  });
});

describe("markAsSentAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getCurrentUser).mockResolvedValue(mockUser);
    vi.mocked(requirePermission).mockResolvedValue(undefined);
  });

  it("calls service with correct parameters", async () => {
    vi.mocked(invoiceService.markAsSent).mockResolvedValue({
      success: true,
      data: { ...sampleInvoice, status: InvoiceStatus.SENT },
    });

    const result = await markAsSentAction("inv-123");

    expect(invoiceService.markAsSent).toHaveBeenCalledWith("inv-123", "user-1");
    expect(result.success).toBe(true);
  });
});

describe("markAsPaidAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getCurrentUser).mockResolvedValue(mockUser);
    vi.mocked(requirePermission).mockResolvedValue(undefined);
  });

  it("calls service with correct parameters", async () => {
    vi.mocked(invoiceService.markAsPaid).mockResolvedValue({
      success: true,
      data: { ...sampleInvoice, status: InvoiceStatus.PAID },
    });

    const result = await markAsPaidAction("inv-123");

    expect(invoiceService.markAsPaid).toHaveBeenCalledWith("inv-123", "user-1");
    expect(result.success).toBe(true);
  });
});

describe("getInvoiceStatsAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getCurrentUser).mockResolvedValue(mockUser);
    vi.mocked(requirePermission).mockResolvedValue(undefined);
  });

  it("returns invoice statistics", async () => {
    const mockStats = {
      total_invoices: 10,
      total_revenue: 100000,
      total_pending: 3,
      total_overdue: 1,
      by_status: {
        [InvoiceStatus.DRAFT]: 2,
        [InvoiceStatus.PENDING_STAMP]: 0,
        [InvoiceStatus.STAMPED]: 3,
        [InvoiceStatus.SENT]: 2,
        [InvoiceStatus.PAID]: 2,
        [InvoiceStatus.CANCELLED]: 1,
        [InvoiceStatus.VOID]: 0,
      },
    };
    vi.mocked(invoiceService.getInvoiceStats).mockResolvedValue(mockStats);

    const result = await getInvoiceStatsAction("2026-01-01", "2026-12-31");

    expect(result.success).toBe(true);
    expect(result.data?.total_invoices).toBe(10);
    expect(result.data?.total_revenue).toBe(100000);
  });
});

describe("getNextFolioPreviewAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getCurrentUser).mockResolvedValue(mockUser);
    vi.mocked(requirePermission).mockResolvedValue(undefined);
  });

  it("returns next folio number", async () => {
    vi.mocked(invoiceService.getNextFolioPreview).mockResolvedValue("00000042");

    const result = await getNextFolioPreviewAction("A");

    expect(result.success).toBe(true);
    expect(result.data).toBe("00000042");
  });
});

describe("Permission errors", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getCurrentUser).mockResolvedValue(mockUser);
  });

  it("returns error when permission denied", async () => {
    vi.mocked(requirePermission).mockRejectedValue(
      new Error("Permission denied: invoices:create")
    );

    const input = {
      customer_id: "cust-1",
      items: [],
    };

    const result = await createInvoiceAction(input);

    expect(result.success).toBe(false);
    expect(result.errors).toContain("Permission denied: invoices:create");
  });
});
