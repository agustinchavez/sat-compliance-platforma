"use server";

/**
 * Invoice Server Actions (Component 12 - Step 8)
 *
 * Next.js Server Actions for invoice operations.
 * Entry points from UI components and API routes.
 */

import { getCurrentUser } from "@/lib/auth";
import {
  getCurrentOrganization,
  getOrganizationId,
} from "@/lib/multi-tenant/context";
import { requirePermission } from "@/lib/rbac";
import * as invoiceService from "./service";
import type { ServiceContext } from "./service";
import type {
  Invoice,
  InvoiceFilters,
  InvoicePagination,
  InvoiceSort,
  InvoiceListResult,
} from "./types";
import { CancellationReason } from "./types";
import type { CreateInvoiceInput, UpdateInvoiceInput } from "./validation";
import * as customerService from "@/lib/customers/service";
import * as organizationService from "@/lib/organizations/service";

// ============================================
// Action Response Types
// ============================================

export interface ActionResult<T = void> {
  success: boolean;
  data?: T;
  errors?: string[];
  warnings?: string[];
}

// ============================================
// Context Setup
// ============================================

/**
 * Get service context with real service implementations
 */
async function getServiceContext(): Promise<ServiceContext> {
  return {
    customerService: {
      findById: async (id: string) => {
        const result = await customerService.getCustomer(id);
        if (!result) return null;
        return {
          id: result.id,
          rfc: result.rfc,
          legal_name: result.legal_name || result.business_name,
          business_name: result.business_name,
          tax_regime: result.tax_regime,
          cfdi_use: result.cfdi_use,
          address: {
            postal_code: result.address?.postal_code || result.postal_code,
          },
        };
      },
    },
    organizationService: {
      findById: async (id: string) => {
        const org = await organizationService.getOrganization(id);
        if (!org) return null;
        return {
          rfc: org.rfc,
          business_name: org.name,
          legal_name: org.legal_name,
          name: org.name,
          tax_regime: org.tax_regime,
          address: {
            postal_code: org.postal_code,
            zip_code: org.postal_code,
          },
        };
      },
    },
    productService: {
      findById: async (id: string) => {
        // Products service will be implemented in Component 13
        // For now, return null (items will use provided values)
        return null;
      },
    },
  };
}

// ============================================
// Authentication Helpers
// ============================================

async function requireAuth(): Promise<{
  userId: string;
  orgId: string;
}> {
  const user = await getCurrentUser();
  if (!user) {
    throw new Error("Authentication required");
  }

  return {
    userId: user.id,
    orgId: user.organizationId,
  };
}

// ============================================
// Invoice CRUD Actions
// ============================================

/**
 * Create a new invoice draft
 */
export async function createInvoiceAction(
  input: CreateInvoiceInput
): Promise<ActionResult<Invoice>> {
  try {
    const { userId, orgId } = await requireAuth();

    // Check permission
    await requirePermission(orgId, userId, "invoices", "create");

    // Get service context
    const context = await getServiceContext();

    // Create draft
    const result = await invoiceService.createDraft(
      orgId,
      userId,
      input,
      context
    );

    return {
      success: result.success,
      data: result.data,
      errors: result.errors,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return { success: false, errors: [message] };
  }
}

/**
 * Update an existing draft invoice
 */
export async function updateInvoiceAction(
  invoiceId: string,
  input: UpdateInvoiceInput
): Promise<ActionResult<Invoice>> {
  try {
    const { userId, orgId } = await requireAuth();

    // Check permission
    await requirePermission(orgId, userId, "invoices", "update");

    // Get service context
    const context = await getServiceContext();

    // Update draft
    const result = await invoiceService.updateDraft(
      invoiceId,
      userId,
      input,
      context
    );

    return {
      success: result.success,
      data: result.data,
      errors: result.errors,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return { success: false, errors: [message] };
  }
}

/**
 * Submit invoice for stamping
 */
export async function submitForStampingAction(
  invoiceId: string
): Promise<ActionResult<Invoice>> {
  try {
    const { userId, orgId } = await requireAuth();

    // Check permission - stamp is a special action
    await requirePermission(orgId, userId, "invoices", "stamp");

    // Submit for stamping
    const result = await invoiceService.submitForStamping(invoiceId, userId);

    return {
      success: result.success,
      data: result.data,
      errors: result.errors,
      warnings: result.warnings,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return { success: false, errors: [message] };
  }
}

/**
 * Cancel an invoice
 */
export async function cancelInvoiceAction(
  invoiceId: string,
  reason: CancellationReason,
  replacementUUID?: string
): Promise<ActionResult<Invoice>> {
  try {
    const { userId, orgId } = await requireAuth();

    // Check permission - cancel is a special action
    await requirePermission(orgId, userId, "invoices", "cancel");

    // Cancel invoice
    const result = await invoiceService.cancelInvoice(
      invoiceId,
      userId,
      reason,
      replacementUUID
    );

    return {
      success: result.success,
      data: result.data,
      errors: result.errors,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return { success: false, errors: [message] };
  }
}

/**
 * Delete an invoice (soft delete)
 */
export async function deleteInvoiceAction(
  invoiceId: string
): Promise<ActionResult<void>> {
  try {
    const { userId, orgId } = await requireAuth();

    // Check permission
    await requirePermission(orgId, userId, "invoices", "delete");

    // Delete invoice
    const result = await invoiceService.deleteInvoice(invoiceId, userId);

    return {
      success: result.success,
      errors: result.errors,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return { success: false, errors: [message] };
  }
}

/**
 * Duplicate an invoice
 */
export async function duplicateInvoiceAction(
  invoiceId: string
): Promise<ActionResult<Invoice>> {
  try {
    const { userId, orgId } = await requireAuth();

    // Check permission - duplicate requires create permission
    await requirePermission(orgId, userId, "invoices", "create");

    // Get service context
    const context = await getServiceContext();

    // Duplicate invoice
    const result = await invoiceService.duplicateInvoice(
      invoiceId,
      userId,
      orgId,
      context
    );

    return {
      success: result.success,
      data: result.data,
      errors: result.errors,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return { success: false, errors: [message] };
  }
}

// ============================================
// Read Actions
// ============================================

/**
 * Get a single invoice by ID
 */
export async function getInvoiceAction(
  invoiceId: string,
  options?: { includeItems?: boolean; includeRelated?: boolean }
): Promise<ActionResult<Invoice>> {
  try {
    const { userId, orgId } = await requireAuth();

    // Check permission
    await requirePermission(orgId, userId, "invoices", "read");

    // Get invoice
    const invoice = await invoiceService.getInvoice(invoiceId, options);

    if (!invoice) {
      return { success: false, errors: ["Invoice not found"] };
    }

    // Verify invoice belongs to user's organization
    if (invoice.organization_id !== orgId) {
      return { success: false, errors: ["Invoice not found"] };
    }

    return { success: true, data: invoice };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return { success: false, errors: [message] };
  }
}

/**
 * List invoices with filters, pagination, and sorting
 */
export async function listInvoicesAction(
  filters?: InvoiceFilters,
  pagination?: InvoicePagination,
  sort?: InvoiceSort
): Promise<ActionResult<InvoiceListResult>> {
  try {
    const { userId, orgId } = await requireAuth();

    // Check permission
    await requirePermission(orgId, userId, "invoices", "read");

    // List invoices
    const result = await invoiceService.listInvoices(
      orgId,
      filters,
      pagination,
      sort
    );

    return { success: true, data: result };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return { success: false, errors: [message] };
  }
}

// ============================================
// Status Actions
// ============================================

/**
 * Mark invoice as sent
 */
export async function markAsSentAction(
  invoiceId: string
): Promise<ActionResult<Invoice>> {
  try {
    const { userId, orgId } = await requireAuth();

    // Check permission
    await requirePermission(orgId, userId, "invoices", "update");

    // Mark as sent
    const result = await invoiceService.markAsSent(invoiceId, userId);

    return {
      success: result.success,
      data: result.data,
      errors: result.errors,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return { success: false, errors: [message] };
  }
}

/**
 * Mark invoice as paid
 */
export async function markAsPaidAction(
  invoiceId: string
): Promise<ActionResult<Invoice>> {
  try {
    const { userId, orgId } = await requireAuth();

    // Check permission
    await requirePermission(orgId, userId, "invoices", "update");

    // Mark as paid
    const result = await invoiceService.markAsPaid(invoiceId, userId);

    return {
      success: result.success,
      data: result.data,
      errors: result.errors,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return { success: false, errors: [message] };
  }
}

// ============================================
// Related Invoice Actions
// ============================================

/**
 * Add a related CFDI to an invoice
 */
export async function addRelatedInvoiceAction(
  invoiceId: string,
  tipoRelacion: string,
  relatedUUID: string
): Promise<ActionResult<Invoice>> {
  try {
    const { userId, orgId } = await requireAuth();

    // Check permission
    await requirePermission(orgId, userId, "invoices", "update");

    // Add related CFDI
    const result = await invoiceService.addRelatedInvoice(
      invoiceId,
      tipoRelacion as any,
      relatedUUID
    );

    return {
      success: result.success,
      data: result.data,
      errors: result.errors,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return { success: false, errors: [message] };
  }
}

/**
 * Remove a related CFDI from an invoice
 */
export async function removeRelatedInvoiceAction(
  invoiceId: string,
  relatedUUID: string
): Promise<ActionResult<Invoice>> {
  try {
    const { userId, orgId } = await requireAuth();

    // Check permission
    await requirePermission(orgId, userId, "invoices", "update");

    // Remove related CFDI
    const result = await invoiceService.removeRelatedInvoice(
      invoiceId,
      relatedUUID
    );

    return {
      success: result.success,
      data: result.data,
      errors: result.errors,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return { success: false, errors: [message] };
  }
}

// ============================================
// Statistics Actions
// ============================================

/**
 * Get invoice statistics for dashboard
 */
export async function getInvoiceStatsAction(
  dateFrom: string,
  dateTo: string
): Promise<ActionResult<invoiceService.InvoiceStats>> {
  try {
    const { userId, orgId } = await requireAuth();

    // Check permission - read permission sufficient for stats
    await requirePermission(orgId, userId, "invoices", "read");

    // Get stats
    const stats = await invoiceService.getInvoiceStats(orgId, dateFrom, dateTo);

    return { success: true, data: stats };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return { success: false, errors: [message] };
  }
}

/**
 * Get next folio preview
 */
export async function getNextFolioPreviewAction(
  serie?: string
): Promise<ActionResult<string>> {
  try {
    const { userId, orgId } = await requireAuth();

    // Check permission
    await requirePermission(orgId, userId, "invoices", "read");

    // Get preview
    const folio = await invoiceService.getNextFolioPreview(orgId, serie);

    return { success: true, data: folio };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return { success: false, errors: [message] };
  }
}
