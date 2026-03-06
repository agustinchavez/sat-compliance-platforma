/**
 * Invoice Repository - Database Operations
 * Component 12: Invoice Service (Core)
 *
 * Handles all direct database interactions for invoices.
 * Uses Supabase client with automatic RLS filtering.
 */

import { createClient } from "@/lib/supabase/server";
import type {
  Invoice,
  InvoiceItem,
  InvoiceRow,
  InvoiceItemRow,
  RelatedCFDI,
  InvoiceFilters,
  InvoicePagination,
  InvoiceSort,
  InvoiceListResult,
  InvoiceItemInput,
} from "./types";
import { InvoiceStatus, TipoComprobante, MetodoPago } from "./types";
import { calculateLineItem, calculateInvoiceTotals } from "./calculations";
import type { CreateInvoiceInput, UpdateInvoiceInput } from "./validation";

// ============================================
// Type Conversion Helpers
// ============================================

/**
 * Convert database row to Invoice type
 */
function dbRowToInvoice(row: InvoiceRow): Invoice {
  return {
    id: row.id,
    organization_id: row.organization_id,
    uuid: row.uuid ?? undefined,
    serie: row.serie ?? undefined,
    folio: row.folio_number ?? undefined,
    folio_number: row.folio_number_int ?? undefined,
    status: row.status as InvoiceStatus,
    tipo_comprobante: row.tipo_comprobante as TipoComprobante,
    issue_date: row.issue_date,
    due_date: row.due_date ?? undefined,
    stamped_at: row.stamped_at ?? undefined,
    sent_at: row.sent_at ?? undefined,
    paid_at: row.paid_at ?? undefined,
    cancelled_at: row.cancelled_at ?? undefined,
    issuer_rfc: row.issuer_rfc,
    issuer_name: row.issuer_name,
    issuer_tax_regime: row.issuer_tax_regime,
    issuer_zip_code: row.issuer_zip_code,
    customer_id: row.customer_id,
    receiver_rfc: row.receiver_rfc,
    receiver_name: row.receiver_name,
    receiver_tax_regime: row.receiver_tax_regime,
    receiver_zip_code: row.receiver_zip_code,
    receiver_cfdi_use: row.receiver_cfdi_use,
    payment_method: row.payment_method as MetodoPago,
    payment_form: row.payment_form,
    currency: row.currency,
    exchange_rate: row.exchange_rate,
    exportacion: row.exportacion,
    subtotal: row.subtotal,
    discount: row.discount,
    total_iva_trasladado: row.total_iva_trasladado,
    total_iva_retenido: row.total_iva_retenido,
    total_isr_retenido: row.total_isr_retenido,
    total: row.total,
    is_global: row.is_global,
    global_periodicity: row.global_periodicity ?? undefined,
    global_months: row.global_months ?? undefined,
    global_year: row.global_year ?? undefined,
    cancellation_reason: row.cancellation_reason ?? undefined,
    cancellation_uuid: row.cancellation_uuid ?? undefined,
    cancellation_response_code: row.cancellation_response_code ?? undefined,
    notes: row.notes ?? undefined,
    conditions: row.conditions ?? undefined,
    cfdi_xml: row.cfdi_xml ?? undefined,
    pdf_url: row.pdf_url ?? undefined,
    created_by: row.created_by ?? undefined,
    updated_by: row.updated_by ?? undefined,
    created_at: row.created_at,
    updated_at: row.updated_at,
    deleted_at: row.deleted_at ?? undefined,
  };
}

/**
 * Convert database row to InvoiceItem type
 */
function dbRowToInvoiceItem(row: InvoiceItemRow): InvoiceItem {
  return {
    id: row.id,
    invoice_id: row.invoice_id,
    sort_order: row.sort_order,
    product_id: row.product_id ?? undefined,
    sat_product_code: row.sat_product_code,
    sat_unit_code: row.sat_unit_code,
    unit_name: row.unit_name,
    sku: row.sku ?? undefined,
    description: row.description,
    quantity: row.quantity,
    unit_price: row.unit_price,
    discount_amount: row.discount_amount,
    subtotal: row.subtotal,
    tax_object: row.tax_object as "01" | "02" | "03",
    iva_rate: row.iva_rate,
    iva_exempt: row.iva_exempt,
    iva_trasladado: row.iva_trasladado,
    iva_retention_rate: row.iva_retention_rate ?? undefined,
    iva_retenido: row.iva_retenido,
    isr_retention_rate: row.isr_retention_rate ?? undefined,
    isr_retenido: row.isr_retenido,
    total: row.total,
    created_at: row.created_at,
  };
}

/**
 * Format folio number as zero-padded string
 */
function formatFolio(folioNumber: number): string {
  return folioNumber.toString().padStart(8, "0");
}

// ============================================
// Read Operations
// ============================================

/**
 * Find invoice by ID
 */
export async function findById(
  id: string,
  options: { includeItems?: boolean; includeRelated?: boolean } = {}
): Promise<Invoice | null> {
  const supabase = await createClient();

  // Build select query
  let select = "*";
  if (options.includeItems) {
    select += ", invoice_items(*)";
  }
  if (options.includeRelated) {
    select += ", invoice_related_cfdi(*)";
  }

  const { data, error } = await supabase
    .from("invoices")
    .select(select)
    .eq("id", id)
    .is("deleted_at", null)
    .single();

  if (error) {
    if (error.code === "PGRST116") {
      // Row not found
      return null;
    }
    throw new Error(`Failed to find invoice: ${error.message}`);
  }

  if (!data) {
    return null;
  }

  const invoice = dbRowToInvoice(data as InvoiceRow);

  // Add items if included
  if (options.includeItems && data.invoice_items) {
    invoice.items = (data.invoice_items as InvoiceItemRow[])
      .sort((a, b) => a.sort_order - b.sort_order)
      .map(dbRowToInvoiceItem);
  }

  // Add related CFDIs if included
  if (options.includeRelated && data.invoice_related_cfdi) {
    invoice.related_cfdi = data.invoice_related_cfdi as RelatedCFDI[];
  }

  return invoice;
}

/**
 * Find invoice by SAT UUID
 */
export async function findByUUID(uuid: string): Promise<Invoice | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("invoices")
    .select("*, invoice_items(*), invoice_related_cfdi(*)")
    .eq("uuid", uuid)
    .is("deleted_at", null)
    .single();

  if (error) {
    if (error.code === "PGRST116") {
      return null;
    }
    throw new Error(`Failed to find invoice by UUID: ${error.message}`);
  }

  if (!data) {
    return null;
  }

  const invoice = dbRowToInvoice(data as InvoiceRow);

  if (data.invoice_items) {
    invoice.items = (data.invoice_items as InvoiceItemRow[])
      .sort((a, b) => a.sort_order - b.sort_order)
      .map(dbRowToInvoiceItem);
  }

  if (data.invoice_related_cfdi) {
    invoice.related_cfdi = data.invoice_related_cfdi as RelatedCFDI[];
  }

  return invoice;
}

/**
 * Find invoices by organization with filters, pagination, and sorting
 */
export async function findByOrganization(
  orgId: string,
  options: {
    filters?: InvoiceFilters;
    pagination?: InvoicePagination;
    sort?: InvoiceSort;
  } = {}
): Promise<InvoiceListResult> {
  const supabase = await createClient();
  const { filters, pagination, sort } = options;

  // Defaults
  const page = pagination?.page ?? 1;
  const limit = pagination?.limit ?? 20;
  const sortField = sort?.field ?? "issue_date";
  const sortOrder = sort?.order ?? "desc";

  // Calculate offset
  const offset = (page - 1) * limit;

  // Build query
  let query = supabase
    .from("invoices")
    .select("*", { count: "exact" })
    .eq("organization_id", orgId)
    .is("deleted_at", null);

  // Apply filters
  if (filters) {
    // Status filter
    if (filters.status) {
      if (Array.isArray(filters.status)) {
        query = query.in("status", filters.status);
      } else {
        query = query.eq("status", filters.status);
      }
    }

    // CFDI type filter
    if (filters.tipo_comprobante) {
      query = query.eq("tipo_comprobante", filters.tipo_comprobante);
    }

    // Customer filter
    if (filters.customer_id) {
      query = query.eq("customer_id", filters.customer_id);
    }

    // Receiver RFC filter
    if (filters.receiver_rfc) {
      query = query.eq("receiver_rfc", filters.receiver_rfc.toUpperCase());
    }

    // Currency filter
    if (filters.currency) {
      query = query.eq("currency", filters.currency.toUpperCase());
    }

    // Date range filters
    if (filters.date_from) {
      query = query.gte("issue_date", filters.date_from);
    }
    if (filters.date_to) {
      query = query.lte("issue_date", filters.date_to);
    }

    // Due date range filters
    if (filters.due_date_from) {
      query = query.gte("due_date", filters.due_date_from);
    }
    if (filters.due_date_to) {
      query = query.lte("due_date", filters.due_date_to);
    }

    // Amount range filters
    if (filters.amount_min !== undefined) {
      query = query.gte("total", filters.amount_min);
    }
    if (filters.amount_max !== undefined) {
      query = query.lte("total", filters.amount_max);
    }

    // Has UUID filter (stamped only)
    if (filters.has_uuid === true) {
      query = query.not("uuid", "is", null);
    } else if (filters.has_uuid === false) {
      query = query.is("uuid", null);
    }

    // Payment method filter
    if (filters.payment_method) {
      query = query.eq("payment_method", filters.payment_method);
    }

    // Overdue filter
    if (filters.is_overdue) {
      const now = new Date().toISOString();
      query = query
        .lt("due_date", now)
        .not("status", "in", '("paid","cancelled","void")');
    }

    // Search filter (full-text search)
    if (filters.search) {
      // Use PostgreSQL full-text search
      const searchTerm = filters.search.replace(/['"]/g, ""); // Sanitize
      query = query.textSearch(
        "receiver_name",
        searchTerm,
        { type: "websearch" }
      );
    }
  }

  // Apply sorting
  const ascending = sortOrder === "asc";
  query = query.order(sortField, { ascending });

  // Apply pagination
  query = query.range(offset, offset + limit - 1);

  // Execute query
  const { data, error, count } = await query;

  if (error) {
    throw new Error(`Failed to list invoices: ${error.message}`);
  }

  const invoices = (data || []).map((row) => dbRowToInvoice(row as InvoiceRow));
  const total = count ?? 0;
  const total_pages = Math.ceil(total / limit);

  return {
    invoices,
    total,
    page,
    limit,
    total_pages,
  };
}

// ============================================
// Write Operations
// ============================================

/**
 * Organization data interface for invoice creation
 */
export interface OrganizationData {
  rfc: string;
  business_name?: string;
  legal_name?: string;
  name?: string;
  tax_regime: string;
  address?: {
    postal_code?: string;
    zip_code?: string;
  };
}

/**
 * Customer data interface for invoice creation
 */
export interface CustomerData {
  id: string;
  rfc: string;
  legal_name?: string;
  business_name?: string;
  tax_regime: string;
  cfdi_use?: string;
  address?: {
    postal_code?: string;
    zip_code?: string;
  };
}

/**
 * Create a new invoice with items
 */
export async function create(
  orgId: string,
  input: CreateInvoiceInput,
  userId: string,
  organizationData: OrganizationData,
  customerData: CustomerData
): Promise<Invoice> {
  const supabase = await createClient();
  const now = new Date().toISOString();

  // 1. Calculate all amounts
  const totals = calculateInvoiceTotals(input.items);

  // 2. Get next folio number using database function
  const { data: folioData, error: folioError } = await supabase.rpc(
    "get_next_folio",
    {
      p_org_id: orgId,
      p_serie: input.serie || "",
    }
  );

  if (folioError) {
    throw new Error(`Failed to get next folio: ${folioError.message}`);
  }

  const folioNumber = folioData as number;
  const folioFormatted = formatFolio(folioNumber);

  // 3. Prepare invoice data
  const invoiceData = {
    organization_id: orgId,
    status: InvoiceStatus.DRAFT,
    tipo_comprobante: input.tipo_comprobante || TipoComprobante.INGRESO,
    serie: input.serie || null,
    folio_number: folioFormatted,
    folio_number_int: folioNumber,
    issue_date: input.issue_date || now,
    due_date: input.due_date || null,
    // Issuer snapshot
    issuer_rfc: organizationData.rfc,
    issuer_name:
      organizationData.business_name ||
      organizationData.legal_name ||
      organizationData.name ||
      "",
    issuer_tax_regime: organizationData.tax_regime,
    issuer_zip_code:
      organizationData.address?.postal_code ||
      organizationData.address?.zip_code ||
      "",
    // Receiver snapshot
    customer_id: customerData.id,
    receiver_rfc: customerData.rfc,
    receiver_name:
      customerData.legal_name || customerData.business_name || "",
    receiver_tax_regime: customerData.tax_regime,
    receiver_zip_code:
      customerData.address?.postal_code ||
      customerData.address?.zip_code ||
      "",
    receiver_cfdi_use: customerData.cfdi_use || "G03",
    // Payment
    payment_method: input.payment_method || MetodoPago.PUE,
    payment_form: input.payment_form || "01",
    currency: input.currency || "MXN",
    exchange_rate: input.exchange_rate || 1,
    exportacion: input.exportacion || "01",
    // Amounts
    subtotal: totals.subtotal,
    discount: totals.total_discount,
    total_iva_trasladado: totals.total_iva_trasladado,
    total_iva_retenido: totals.total_iva_retenido,
    total_isr_retenido: totals.total_isr_retenido,
    total: totals.total,
    // Global invoice
    is_global: input.is_global || false,
    global_periodicity: input.global_periodicity || null,
    global_months: input.global_months || null,
    global_year: input.global_year || null,
    // Notes
    notes: input.notes || null,
    conditions: input.conditions || null,
    // Audit
    created_by: userId,
    updated_by: userId,
    created_at: now,
    updated_at: now,
  };

  // 4. Insert invoice
  const { data: insertedInvoice, error: invoiceError } = await supabase
    .from("invoices")
    .insert(invoiceData)
    .select()
    .single();

  if (invoiceError) {
    throw new Error(`Failed to create invoice: ${invoiceError.message}`);
  }

  const invoiceId = insertedInvoice.id;

  // 5. Insert invoice items
  const itemsData = input.items.map((item, index) => {
    const calc = calculateLineItem(item);
    return {
      invoice_id: invoiceId,
      sort_order: index,
      product_id: item.product_id || null,
      sat_product_code: item.sat_product_code,
      sat_unit_code: item.sat_unit_code,
      unit_name: item.unit_name,
      sku: item.sku || null,
      description: item.description,
      quantity: item.quantity,
      unit_price: item.unit_price,
      discount_amount: item.discount_amount || 0,
      subtotal: calc.subtotal,
      tax_object: item.tax_object || "02",
      iva_rate: item.iva_rate ?? 0.16,
      iva_exempt: item.iva_exempt || false,
      iva_trasladado: calc.iva_trasladado,
      iva_retention_rate: item.iva_retention_rate || null,
      iva_retenido: calc.iva_retenido,
      isr_retention_rate: item.isr_retention_rate || null,
      isr_retenido: calc.isr_retenido,
      total: calc.total,
      created_at: now,
    };
  });

  const { error: itemsError } = await supabase
    .from("invoice_items")
    .insert(itemsData);

  if (itemsError) {
    // Attempt to rollback invoice
    await supabase.from("invoices").delete().eq("id", invoiceId);
    throw new Error(`Failed to create invoice items: ${itemsError.message}`);
  }

  // 6. Insert related CFDIs if provided
  if (input.related_cfdi && input.related_cfdi.length > 0) {
    const relatedData = input.related_cfdi.map((rel) => ({
      invoice_id: invoiceId,
      tipo_relacion: rel.tipo_relacion,
      related_uuid: rel.related_uuid,
      created_at: now,
    }));

    const { error: relatedError } = await supabase
      .from("invoice_related_cfdi")
      .insert(relatedData);

    if (relatedError) {
      // Cleanup on error
      await supabase.from("invoice_items").delete().eq("invoice_id", invoiceId);
      await supabase.from("invoices").delete().eq("id", invoiceId);
      throw new Error(`Failed to create related CFDIs: ${relatedError.message}`);
    }
  }

  // 7. Return full invoice with items
  const invoice = await findById(invoiceId, {
    includeItems: true,
    includeRelated: true,
  });

  if (!invoice) {
    throw new Error("Failed to retrieve created invoice");
  }

  return invoice;
}

/**
 * Update a draft invoice
 */
export async function update(
  id: string,
  input: UpdateInvoiceInput,
  userId: string,
  customerData?: CustomerData
): Promise<Invoice> {
  const supabase = await createClient();
  const now = new Date().toISOString();

  // Get existing invoice
  const existing = await findById(id, { includeItems: true });
  if (!existing) {
    throw new Error("Invoice not found");
  }

  // Only drafts can be updated
  if (existing.status !== InvoiceStatus.DRAFT) {
    throw new Error(`Cannot update invoice in ${existing.status} status`);
  }

  // Build update data
  const updateData: Record<string, unknown> = {
    updated_by: userId,
    updated_at: now,
  };

  // Update basic fields
  if (input.serie !== undefined) updateData.serie = input.serie;
  if (input.issue_date !== undefined) updateData.issue_date = input.issue_date;
  if (input.due_date !== undefined) updateData.due_date = input.due_date;
  if (input.payment_method !== undefined)
    updateData.payment_method = input.payment_method;
  if (input.payment_form !== undefined)
    updateData.payment_form = input.payment_form;
  if (input.currency !== undefined) updateData.currency = input.currency;
  if (input.exchange_rate !== undefined)
    updateData.exchange_rate = input.exchange_rate;
  if (input.exportacion !== undefined) updateData.exportacion = input.exportacion;
  if (input.notes !== undefined) updateData.notes = input.notes;
  if (input.conditions !== undefined) updateData.conditions = input.conditions;
  if (input.is_global !== undefined) updateData.is_global = input.is_global;
  if (input.global_periodicity !== undefined)
    updateData.global_periodicity = input.global_periodicity;
  if (input.global_months !== undefined)
    updateData.global_months = input.global_months;
  if (input.global_year !== undefined) updateData.global_year = input.global_year;

  // Update receiver if customer changed
  if (customerData && input.customer_id) {
    updateData.customer_id = customerData.id;
    updateData.receiver_rfc = customerData.rfc;
    updateData.receiver_name =
      customerData.legal_name || customerData.business_name || "";
    updateData.receiver_tax_regime = customerData.tax_regime;
    updateData.receiver_zip_code =
      customerData.address?.postal_code ||
      customerData.address?.zip_code ||
      "";
    updateData.receiver_cfdi_use = customerData.cfdi_use || "G03";
  }

  // Handle items update
  if (input.items && input.items.length > 0) {
    // Recalculate totals
    const totals = calculateInvoiceTotals(input.items);
    updateData.subtotal = totals.subtotal;
    updateData.discount = totals.total_discount;
    updateData.total_iva_trasladado = totals.total_iva_trasladado;
    updateData.total_iva_retenido = totals.total_iva_retenido;
    updateData.total_isr_retenido = totals.total_isr_retenido;
    updateData.total = totals.total;

    // Delete existing items
    const { error: deleteError } = await supabase
      .from("invoice_items")
      .delete()
      .eq("invoice_id", id);

    if (deleteError) {
      throw new Error(`Failed to update invoice items: ${deleteError.message}`);
    }

    // Insert new items
    const itemsData = input.items.map((item, index) => {
      const calc = calculateLineItem(item);
      return {
        invoice_id: id,
        sort_order: index,
        product_id: item.product_id || null,
        sat_product_code: item.sat_product_code,
        sat_unit_code: item.sat_unit_code,
        unit_name: item.unit_name,
        sku: item.sku || null,
        description: item.description,
        quantity: item.quantity,
        unit_price: item.unit_price,
        discount_amount: item.discount_amount || 0,
        subtotal: calc.subtotal,
        tax_object: item.tax_object || "02",
        iva_rate: item.iva_rate ?? 0.16,
        iva_exempt: item.iva_exempt || false,
        iva_trasladado: calc.iva_trasladado,
        iva_retention_rate: item.iva_retention_rate || null,
        iva_retenido: calc.iva_retenido,
        isr_retention_rate: item.isr_retention_rate || null,
        isr_retenido: calc.isr_retenido,
        total: calc.total,
        created_at: now,
      };
    });

    const { error: itemsError } = await supabase
      .from("invoice_items")
      .insert(itemsData);

    if (itemsError) {
      throw new Error(`Failed to insert new items: ${itemsError.message}`);
    }
  }

  // Handle related CFDIs update
  if (input.related_cfdi !== undefined) {
    // Delete existing
    await supabase.from("invoice_related_cfdi").delete().eq("invoice_id", id);

    // Insert new
    if (input.related_cfdi.length > 0) {
      const relatedData = input.related_cfdi.map((rel) => ({
        invoice_id: id,
        tipo_relacion: rel.tipo_relacion,
        related_uuid: rel.related_uuid,
        created_at: now,
      }));

      const { error: relatedError } = await supabase
        .from("invoice_related_cfdi")
        .insert(relatedData);

      if (relatedError) {
        throw new Error(`Failed to update related CFDIs: ${relatedError.message}`);
      }
    }
  }

  // Update invoice
  const { error: updateError } = await supabase
    .from("invoices")
    .update(updateData)
    .eq("id", id);

  if (updateError) {
    throw new Error(`Failed to update invoice: ${updateError.message}`);
  }

  // Return updated invoice
  const invoice = await findById(id, { includeItems: true, includeRelated: true });
  if (!invoice) {
    throw new Error("Failed to retrieve updated invoice");
  }

  return invoice;
}

/**
 * Update invoice status and additional fields
 */
export async function updateStatus(
  id: string,
  newStatus: InvoiceStatus,
  additionalFields?: Partial<Invoice>
): Promise<Invoice> {
  const supabase = await createClient();

  const updateData: Record<string, unknown> = {
    status: newStatus,
    updated_at: new Date().toISOString(),
    ...additionalFields,
  };

  const { error } = await supabase
    .from("invoices")
    .update(updateData)
    .eq("id", id);

  if (error) {
    throw new Error(`Failed to update invoice status: ${error.message}`);
  }

  const invoice = await findById(id, { includeItems: true });
  if (!invoice) {
    throw new Error("Failed to retrieve invoice after status update");
  }

  return invoice;
}

/**
 * Soft delete an invoice
 */
export async function softDelete(id: string, userId: string): Promise<void> {
  const supabase = await createClient();

  // Get existing invoice
  const existing = await findById(id);
  if (!existing) {
    throw new Error("Invoice not found");
  }

  // Only DRAFT or VOID can be deleted
  if (
    existing.status !== InvoiceStatus.DRAFT &&
    existing.status !== InvoiceStatus.VOID
  ) {
    throw new Error(
      `Cannot delete invoice in ${existing.status} status. Only DRAFT or VOID invoices can be deleted.`
    );
  }

  const { error } = await supabase
    .from("invoices")
    .update({
      deleted_at: new Date().toISOString(),
      updated_by: userId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) {
    throw new Error(`Failed to delete invoice: ${error.message}`);
  }
}

/**
 * Preview next folio number without consuming it
 */
export async function getNextFolioPreview(
  orgId: string,
  serie?: string
): Promise<string> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("invoice_folio_sequences")
    .select("next_folio")
    .eq("organization_id", orgId)
    .eq("serie", serie || "")
    .single();

  if (error) {
    if (error.code === "PGRST116") {
      // No sequence exists yet, return 1
      return formatFolio(1);
    }
    throw new Error(`Failed to get folio preview: ${error.message}`);
  }

  return formatFolio(data?.next_folio ?? 1);
}

/**
 * Add a related CFDI to an existing invoice
 */
export async function addRelatedCFDI(
  invoiceId: string,
  tipoRelacion: string,
  relatedUuid: string,
  relatedInvoiceId?: string
): Promise<RelatedCFDI> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("invoice_related_cfdi")
    .insert({
      invoice_id: invoiceId,
      tipo_relacion: tipoRelacion,
      related_uuid: relatedUuid,
      related_invoice_id: relatedInvoiceId || null,
      created_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to add related CFDI: ${error.message}`);
  }

  return data as RelatedCFDI;
}

/**
 * Remove a related CFDI from an invoice
 */
export async function removeRelatedCFDI(
  invoiceId: string,
  relatedUuid: string
): Promise<void> {
  const supabase = await createClient();

  const { error } = await supabase
    .from("invoice_related_cfdi")
    .delete()
    .eq("invoice_id", invoiceId)
    .eq("related_uuid", relatedUuid);

  if (error) {
    throw new Error(`Failed to remove related CFDI: ${error.message}`);
  }
}

/**
 * Count invoices by status for an organization
 */
export async function countByStatus(
  orgId: string
): Promise<Record<InvoiceStatus, number>> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("invoices")
    .select("status")
    .eq("organization_id", orgId)
    .is("deleted_at", null);

  if (error) {
    throw new Error(`Failed to count invoices: ${error.message}`);
  }

  // Initialize counts
  const counts: Record<InvoiceStatus, number> = {
    [InvoiceStatus.DRAFT]: 0,
    [InvoiceStatus.PENDING_STAMP]: 0,
    [InvoiceStatus.STAMPED]: 0,
    [InvoiceStatus.SENT]: 0,
    [InvoiceStatus.PAID]: 0,
    [InvoiceStatus.CANCELLED]: 0,
    [InvoiceStatus.VOID]: 0,
  };

  // Count by status
  for (const row of data || []) {
    const status = row.status as InvoiceStatus;
    if (status in counts) {
      counts[status]++;
    }
  }

  return counts;
}
