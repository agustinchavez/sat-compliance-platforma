/**
 * Invoice Service - Business Logic Layer
 * Component 12: Invoice Service (Core)
 *
 * Main entry point for all invoice operations.
 * Server Actions call this service, which orchestrates
 * validation, repository calls, and external services.
 */

import * as repository from "./repository";
import type { OrganizationData, CustomerData } from "./repository";
import {
  CreateInvoiceSchema,
  UpdateInvoiceSchema,
  validateCustomerForCFDI,
  validatePaymentTerms,
  validateCurrency,
  validateInvoiceForStamping,
  validateRelatedInvoices,
} from "./validation";
import type { CreateInvoiceInput, UpdateInvoiceInput } from "./validation";
import {
  validateTransition,
  transitionStatus,
  canEditInvoice,
  canCancelInvoice,
  canVoidInvoice,
  isStamped,
} from "./workflow";
import { calculateInvoiceTotals } from "./calculations";
import type {
  Invoice,
  InvoiceItem,
  InvoiceFilters,
  InvoicePagination,
  InvoiceSort,
  InvoiceListResult,
  InvoiceItemInput,
} from "./types";
import {
  InvoiceStatus,
  TipoRelacion,
  CancellationReason,
  CANCELLATION_REASON_VALUES,
} from "./types";

// ============================================
// Service Result Types
// ============================================

export interface ServiceResult<T> {
  success: boolean;
  data?: T;
  errors?: string[];
  warnings?: string[];
}

export interface InvoiceStats {
  total_invoices: number;
  total_revenue: number;
  total_pending: number;
  total_overdue: number;
  by_status: Record<InvoiceStatus, number>;
}

// ============================================
// External Service Interfaces
// ============================================

/**
 * Interface for customer service dependency
 */
export interface CustomerService {
  findById(id: string): Promise<CustomerData | null>;
}

/**
 * Interface for organization service dependency
 */
export interface OrganizationService {
  findById(id: string): Promise<OrganizationData | null>;
}

/**
 * Interface for product service dependency
 */
export interface ProductData {
  id: string;
  sat_product_code: string;
  sat_unit_code: string;
  unit_name: string;
  iva_rate: number;
  iva_exempt: boolean;
  iva_retention_rate?: number;
  isr_retention_rate?: number;
}

export interface ProductService {
  findById(id: string): Promise<ProductData | null>;
}

// ============================================
// Service Context (for dependency injection)
// ============================================

export interface ServiceContext {
  customerService: CustomerService;
  organizationService: OrganizationService;
  productService: ProductService;
}

// Default implementations (to be provided by caller or via DI)
let defaultContext: ServiceContext | null = null;

export function setServiceContext(context: ServiceContext): void {
  defaultContext = context;
}

function getContext(): ServiceContext {
  if (!defaultContext) {
    throw new Error(
      "Service context not initialized. Call setServiceContext() first."
    );
  }
  return defaultContext;
}

// ============================================
// Draft Management
// ============================================

/**
 * Create a new invoice draft
 */
export async function createDraft(
  orgId: string,
  userId: string,
  input: CreateInvoiceInput,
  context?: ServiceContext
): Promise<ServiceResult<Invoice>> {
  const ctx = context || getContext();

  // 1. Validate input schema
  const parseResult = CreateInvoiceSchema.safeParse(input);
  if (!parseResult.success) {
    const errors = parseResult.error.issues.map(
      (e) => `${e.path.join(".")}: ${e.message}`
    );
    return { success: false, errors };
  }
  const validatedInput = parseResult.data;

  // 2. Fetch customer
  const customer = await ctx.customerService.findById(validatedInput.customer_id);
  if (!customer) {
    return { success: false, errors: ["Customer not found"] };
  }

  // 3. Validate customer for CFDI
  const customerValidation = validateCustomerForCFDI(customer);
  if (!customerValidation.valid) {
    return { success: false, errors: customerValidation.errors };
  }

  // 4. Fetch organization
  const organization = await ctx.organizationService.findById(orgId);
  if (!organization) {
    return { success: false, errors: ["Organization not found"] };
  }

  // 5. Validate payment terms
  const paymentValidation = validatePaymentTerms(
    validatedInput.payment_method || "PUE",
    validatedInput.payment_form || "01"
  );
  if (!paymentValidation.valid) {
    return { success: false, errors: paymentValidation.errors };
  }

  // 6. Validate currency and exchange rate
  const currencyValidation = validateCurrency(
    validatedInput.currency || "MXN",
    validatedInput.exchange_rate || 1
  );
  if (!currencyValidation.valid) {
    return { success: false, errors: currencyValidation.errors };
  }

  // 7. Process items - merge product tax config if product_id provided
  const processedItems: InvoiceItemInput[] = [];
  for (const item of validatedInput.items) {
    let processedItem = { ...item };

    if (item.product_id) {
      const product = await ctx.productService.findById(item.product_id);
      if (product) {
        // Merge product tax configuration
        processedItem = {
          ...processedItem,
          sat_product_code: processedItem.sat_product_code || product.sat_product_code,
          sat_unit_code: processedItem.sat_unit_code || product.sat_unit_code,
          unit_name: processedItem.unit_name || product.unit_name,
          iva_rate: processedItem.iva_rate ?? product.iva_rate,
          iva_exempt: processedItem.iva_exempt ?? product.iva_exempt,
          iva_retention_rate:
            processedItem.iva_retention_rate ?? product.iva_retention_rate,
          isr_retention_rate:
            processedItem.isr_retention_rate ?? product.isr_retention_rate,
        };
      }
    }

    processedItems.push(processedItem);
  }

  // 8. Validate related invoices if provided
  if (validatedInput.related_cfdi && validatedInput.related_cfdi.length > 0) {
    const relatedValidation = validateRelatedInvoices(validatedInput.related_cfdi);
    if (!relatedValidation.valid) {
      return { success: false, errors: relatedValidation.errors };
    }
  }

  // 9. Create invoice via repository
  try {
    const invoice = await repository.create(
      orgId,
      { ...validatedInput, items: processedItems },
      userId,
      organization,
      customer
    );

    return { success: true, data: invoice };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return { success: false, errors: [message] };
  }
}

/**
 * Update an existing draft invoice
 */
export async function updateDraft(
  invoiceId: string,
  userId: string,
  input: UpdateInvoiceInput,
  context?: ServiceContext
): Promise<ServiceResult<Invoice>> {
  const ctx = context || getContext();

  // 1. Fetch existing invoice
  const existing = await repository.findById(invoiceId, { includeItems: true });
  if (!existing) {
    return { success: false, errors: ["Invoice not found"] };
  }

  // 2. Check if invoice can be edited
  if (!canEditInvoice(existing)) {
    return {
      success: false,
      errors: [`Cannot edit invoice in ${existing.status} status`],
    };
  }

  // 3. Validate input schema
  const parseResult = UpdateInvoiceSchema.safeParse(input);
  if (!parseResult.success) {
    const errors = parseResult.error.issues.map(
      (e) => `${e.path.join(".")}: ${e.message}`
    );
    return { success: false, errors };
  }
  const validatedInput = parseResult.data;

  // 4. Validate payment terms if provided
  if (validatedInput.payment_method || validatedInput.payment_form) {
    const paymentMethod = validatedInput.payment_method || existing.payment_method;
    const paymentForm = validatedInput.payment_form || existing.payment_form;
    const paymentValidation = validatePaymentTerms(paymentMethod, paymentForm);
    if (!paymentValidation.valid) {
      return { success: false, errors: paymentValidation.errors };
    }
  }

  // 5. Validate currency if provided
  if (validatedInput.currency || validatedInput.exchange_rate) {
    const currency = validatedInput.currency || existing.currency;
    const exchangeRate = validatedInput.exchange_rate || existing.exchange_rate;
    const currencyValidation = validateCurrency(currency, exchangeRate);
    if (!currencyValidation.valid) {
      return { success: false, errors: currencyValidation.errors };
    }
  }

  // 6. Fetch customer if changing
  let customerData: CustomerData | undefined;
  if (validatedInput.customer_id && validatedInput.customer_id !== existing.customer_id) {
    const customer = await ctx.customerService.findById(validatedInput.customer_id);
    if (!customer) {
      return { success: false, errors: ["Customer not found"] };
    }

    const customerValidation = validateCustomerForCFDI(customer);
    if (!customerValidation.valid) {
      return { success: false, errors: customerValidation.errors };
    }

    customerData = customer;
  }

  // 7. Process items if provided
  let processedInput = { ...validatedInput };
  if (validatedInput.items && validatedInput.items.length > 0) {
    const processedItems: InvoiceItemInput[] = [];
    for (const item of validatedInput.items) {
      let processedItem = { ...item };

      if (item.product_id) {
        const product = await ctx.productService.findById(item.product_id);
        if (product) {
          processedItem = {
            ...processedItem,
            sat_product_code: processedItem.sat_product_code || product.sat_product_code,
            sat_unit_code: processedItem.sat_unit_code || product.sat_unit_code,
            unit_name: processedItem.unit_name || product.unit_name,
            iva_rate: processedItem.iva_rate ?? product.iva_rate,
            iva_exempt: processedItem.iva_exempt ?? product.iva_exempt,
            iva_retention_rate:
              processedItem.iva_retention_rate ?? product.iva_retention_rate,
            isr_retention_rate:
              processedItem.isr_retention_rate ?? product.isr_retention_rate,
          };
        }
      }

      processedItems.push(processedItem);
    }
    processedInput = { ...processedInput, items: processedItems };
  }

  // 8. Validate related invoices if provided
  if (validatedInput.related_cfdi && validatedInput.related_cfdi.length > 0) {
    const relatedValidation = validateRelatedInvoices(validatedInput.related_cfdi);
    if (!relatedValidation.valid) {
      return { success: false, errors: relatedValidation.errors };
    }
  }

  // 9. Update via repository
  try {
    const invoice = await repository.update(
      invoiceId,
      processedInput,
      userId,
      customerData
    );

    return { success: true, data: invoice };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return { success: false, errors: [message] };
  }
}

// ============================================
// Stamping Workflow
// ============================================

/**
 * Submit invoice for stamping (transition to PENDING_STAMP)
 */
export async function submitForStamping(
  invoiceId: string,
  userId: string
): Promise<ServiceResult<Invoice>> {
  // 1. Fetch invoice with items
  const invoice = await repository.findById(invoiceId, {
    includeItems: true,
    includeRelated: true,
  });

  if (!invoice) {
    return { success: false, errors: ["Invoice not found"] };
  }

  // 2. Validate transition
  const transitionValidation = validateTransition(
    invoice,
    InvoiceStatus.PENDING_STAMP
  );
  if (!transitionValidation.valid) {
    return { success: false, errors: [transitionValidation.error || "Invalid transition"] };
  }

  // 3. Validate invoice for stamping
  const stampingValidation = validateInvoiceForStamping(invoice);
  if (!stampingValidation.valid) {
    return {
      success: false,
      errors: stampingValidation.errors,
      warnings: stampingValidation.warnings,
    };
  }

  // 4. Get transition updates
  const updates = transitionStatus(invoice, InvoiceStatus.PENDING_STAMP);

  // 5. Update status
  try {
    const updatedInvoice = await repository.updateStatus(invoiceId, InvoiceStatus.PENDING_STAMP, {
      updated_by: userId,
      updated_at: updates.updated_at,
    });

    return {
      success: true,
      data: updatedInvoice,
      warnings: stampingValidation.warnings,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return { success: false, errors: [message] };
  }
}

// ============================================
// Read Operations
// ============================================

/**
 * Get invoice by ID
 */
export async function getInvoice(
  invoiceId: string,
  options: { includeItems?: boolean; includeRelated?: boolean } = {}
): Promise<Invoice | null> {
  return repository.findById(invoiceId, options);
}

/**
 * Get invoice by SAT UUID
 */
export async function getInvoiceByUUID(uuid: string): Promise<Invoice | null> {
  return repository.findByUUID(uuid);
}

/**
 * List invoices with filters
 */
export async function listInvoices(
  orgId: string,
  filters?: InvoiceFilters,
  pagination?: InvoicePagination,
  sort?: InvoiceSort
): Promise<InvoiceListResult> {
  return repository.findByOrganization(orgId, { filters, pagination, sort });
}

// ============================================
// Cancellation
// ============================================

/**
 * Cancel an invoice
 */
export async function cancelInvoice(
  invoiceId: string,
  userId: string,
  reason?: CancellationReason,
  replacementUUID?: string
): Promise<ServiceResult<Invoice>> {
  // 1. Fetch invoice
  const invoice = await repository.findById(invoiceId);
  if (!invoice) {
    return { success: false, errors: ["Invoice not found"] };
  }

  // 2. Handle DRAFT invoices - void instead of cancel
  if (invoice.status === InvoiceStatus.DRAFT) {
    return voidDraft(invoiceId, userId);
  }

  // 3. Check if invoice can be cancelled
  if (!canCancelInvoice(invoice)) {
    return {
      success: false,
      errors: [`Cannot cancel invoice in ${invoice.status} status`],
    };
  }

  // 4. Validate reason is provided for stamped invoices
  if (isStamped(invoice) && !reason) {
    return {
      success: false,
      errors: ["Cancellation reason is required for stamped invoices"],
    };
  }

  // 5. Validate reason code
  if (reason && !CANCELLATION_REASON_VALUES.includes(reason)) {
    return {
      success: false,
      errors: [`Invalid cancellation reason: ${reason}`],
    };
  }

  // 6. Validate replacement UUID for reason 04 (substitution)
  if (reason === CancellationReason.SUBSTITUTION && !replacementUUID) {
    return {
      success: false,
      errors: ["Replacement UUID is required for substitution cancellation"],
    };
  }

  // 7. Validate transition
  const transitionValidation = validateTransition(
    invoice,
    InvoiceStatus.CANCELLED,
    reason
  );
  if (!transitionValidation.valid) {
    return { success: false, errors: [transitionValidation.error || "Invalid transition"] };
  }

  // 8. Get transition updates
  const updates = transitionStatus(invoice, InvoiceStatus.CANCELLED, {
    reason,
    replacementUUID,
  });

  // 9. Update status
  try {
    const updatedInvoice = await repository.updateStatus(
      invoiceId,
      InvoiceStatus.CANCELLED,
      {
        cancellation_reason: updates.cancellation_reason,
        cancellation_uuid: updates.cancellation_uuid,
        cancelled_at: updates.cancelled_at,
        updated_by: userId,
        updated_at: updates.updated_at,
      }
    );

    return { success: true, data: updatedInvoice };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return { success: false, errors: [message] };
  }
}

/**
 * Void a draft invoice (internal - no SAT interaction)
 */
async function voidDraft(
  invoiceId: string,
  userId: string
): Promise<ServiceResult<Invoice>> {
  // 1. Fetch invoice
  const invoice = await repository.findById(invoiceId);
  if (!invoice) {
    return { success: false, errors: ["Invoice not found"] };
  }

  // 2. Check if invoice can be voided
  if (!canVoidInvoice(invoice)) {
    return {
      success: false,
      errors: [`Cannot void invoice in ${invoice.status} status`],
    };
  }

  // 3. Get transition updates
  const updates = transitionStatus(invoice, InvoiceStatus.VOID);

  // 4. Update status
  try {
    const updatedInvoice = await repository.updateStatus(
      invoiceId,
      InvoiceStatus.VOID,
      {
        deleted_at: updates.deleted_at,
        updated_by: userId,
        updated_at: updates.updated_at,
      }
    );

    return { success: true, data: updatedInvoice };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return { success: false, errors: [message] };
  }
}

// ============================================
// Deletion
// ============================================

/**
 * Delete an invoice (soft delete)
 */
export async function deleteInvoice(
  invoiceId: string,
  userId: string
): Promise<ServiceResult<void>> {
  try {
    await repository.softDelete(invoiceId, userId);
    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return { success: false, errors: [message] };
  }
}

// ============================================
// Status Updates
// ============================================

/**
 * Mark invoice as sent
 */
export async function markAsSent(
  invoiceId: string,
  userId: string
): Promise<ServiceResult<Invoice>> {
  const invoice = await repository.findById(invoiceId);
  if (!invoice) {
    return { success: false, errors: ["Invoice not found"] };
  }

  const transitionValidation = validateTransition(invoice, InvoiceStatus.SENT);
  if (!transitionValidation.valid) {
    return { success: false, errors: [transitionValidation.error || "Invalid transition"] };
  }

  const updates = transitionStatus(invoice, InvoiceStatus.SENT);

  try {
    const updatedInvoice = await repository.updateStatus(
      invoiceId,
      InvoiceStatus.SENT,
      {
        sent_at: updates.sent_at,
        updated_by: userId,
        updated_at: updates.updated_at,
      }
    );

    return { success: true, data: updatedInvoice };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return { success: false, errors: [message] };
  }
}

/**
 * Mark invoice as paid
 */
export async function markAsPaid(
  invoiceId: string,
  userId: string
): Promise<ServiceResult<Invoice>> {
  const invoice = await repository.findById(invoiceId);
  if (!invoice) {
    return { success: false, errors: ["Invoice not found"] };
  }

  const transitionValidation = validateTransition(invoice, InvoiceStatus.PAID);
  if (!transitionValidation.valid) {
    return { success: false, errors: [transitionValidation.error || "Invalid transition"] };
  }

  const updates = transitionStatus(invoice, InvoiceStatus.PAID);

  try {
    const updatedInvoice = await repository.updateStatus(
      invoiceId,
      InvoiceStatus.PAID,
      {
        paid_at: updates.paid_at,
        updated_by: userId,
        updated_at: updates.updated_at,
      }
    );

    return { success: true, data: updatedInvoice };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return { success: false, errors: [message] };
  }
}

// ============================================
// Related Invoices
// ============================================

/**
 * Add a related CFDI to an invoice
 */
export async function addRelatedInvoice(
  invoiceId: string,
  tipoRelacion: TipoRelacion,
  relatedUUID: string
): Promise<ServiceResult<Invoice>> {
  // 1. Fetch invoice
  const invoice = await repository.findById(invoiceId);
  if (!invoice) {
    return { success: false, errors: ["Invoice not found"] };
  }

  // 2. Only DRAFT invoices can be modified
  if (!canEditInvoice(invoice)) {
    return {
      success: false,
      errors: ["Can only add related invoices to draft invoices"],
    };
  }

  // 3. Validate UUID format
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(relatedUUID)) {
    return { success: false, errors: ["Invalid UUID format"] };
  }

  // 4. Add related CFDI
  try {
    await repository.addRelatedCFDI(invoiceId, tipoRelacion, relatedUUID);
    const updatedInvoice = await repository.findById(invoiceId, {
      includeItems: true,
      includeRelated: true,
    });

    if (!updatedInvoice) {
      return { success: false, errors: ["Failed to fetch updated invoice"] };
    }

    return { success: true, data: updatedInvoice };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return { success: false, errors: [message] };
  }
}

/**
 * Remove a related CFDI from an invoice
 */
export async function removeRelatedInvoice(
  invoiceId: string,
  relatedUUID: string
): Promise<ServiceResult<Invoice>> {
  const invoice = await repository.findById(invoiceId);
  if (!invoice) {
    return { success: false, errors: ["Invoice not found"] };
  }

  if (!canEditInvoice(invoice)) {
    return {
      success: false,
      errors: ["Can only remove related invoices from draft invoices"],
    };
  }

  try {
    await repository.removeRelatedCFDI(invoiceId, relatedUUID);
    const updatedInvoice = await repository.findById(invoiceId, {
      includeItems: true,
      includeRelated: true,
    });

    if (!updatedInvoice) {
      return { success: false, errors: ["Failed to fetch updated invoice"] };
    }

    return { success: true, data: updatedInvoice };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return { success: false, errors: [message] };
  }
}

// ============================================
// Duplication
// ============================================

/**
 * Duplicate an invoice as a new draft
 */
export async function duplicateInvoice(
  invoiceId: string,
  userId: string,
  orgId: string,
  context?: ServiceContext
): Promise<ServiceResult<Invoice>> {
  const ctx = context || getContext();

  // 1. Fetch source invoice with items
  const source = await repository.findById(invoiceId, { includeItems: true });
  if (!source) {
    return { success: false, errors: ["Invoice not found"] };
  }

  // 2. Fetch current customer data (not snapshot)
  const customer = await ctx.customerService.findById(source.customer_id);
  if (!customer) {
    return { success: false, errors: ["Customer not found"] };
  }

  // 3. Fetch organization
  const organization = await ctx.organizationService.findById(orgId);
  if (!organization) {
    return { success: false, errors: ["Organization not found"] };
  }

  // 4. Build new invoice input from source
  const items: InvoiceItemInput[] = (source.items || []).map((item) => ({
    product_id: item.product_id,
    sat_product_code: item.sat_product_code,
    sat_unit_code: item.sat_unit_code,
    unit_name: item.unit_name,
    sku: item.sku,
    description: item.description,
    quantity: item.quantity,
    unit_price: item.unit_price,
    discount_amount: item.discount_amount,
    tax_object: item.tax_object,
    iva_rate: item.iva_rate,
    iva_exempt: item.iva_exempt,
    iva_retention_rate: item.iva_retention_rate,
    isr_retention_rate: item.isr_retention_rate,
  }));

  const input: CreateInvoiceInput = {
    customer_id: source.customer_id,
    tipo_comprobante: source.tipo_comprobante,
    serie: source.serie,
    // Do not copy issue_date - will be set to now
    due_date: source.due_date,
    payment_method: source.payment_method,
    payment_form: source.payment_form,
    currency: source.currency,
    exchange_rate: source.exchange_rate,
    exportacion: source.exportacion,
    is_global: source.is_global,
    global_periodicity: source.global_periodicity,
    global_months: source.global_months,
    global_year: source.global_year,
    notes: source.notes,
    conditions: source.conditions,
    items,
    // Do not copy related_cfdi - each invoice should have its own relations
  };

  // 5. Create new draft
  try {
    const invoice = await repository.create(
      orgId,
      input,
      userId,
      organization,
      customer
    );

    return { success: true, data: invoice };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return { success: false, errors: [message] };
  }
}

// ============================================
// Statistics
// ============================================

/**
 * Get invoice statistics for a date range
 */
export async function getInvoiceStats(
  orgId: string,
  dateFrom: string,
  dateTo: string
): Promise<InvoiceStats> {
  // Get all invoices in date range
  const result = await repository.findByOrganization(orgId, {
    filters: {
      date_from: dateFrom,
      date_to: dateTo,
    },
    pagination: { page: 1, limit: 10000 }, // Get all
  });

  // Get counts by status
  const byStatus = await repository.countByStatus(orgId);

  // Calculate aggregates
  let totalRevenue = 0;
  let totalPending = 0;
  let totalOverdue = 0;
  const now = new Date();

  for (const invoice of result.invoices) {
    // Revenue = sum of stamped/sent/paid invoices
    if (
      invoice.status === InvoiceStatus.STAMPED ||
      invoice.status === InvoiceStatus.SENT ||
      invoice.status === InvoiceStatus.PAID
    ) {
      totalRevenue += invoice.total;
    }

    // Pending = not paid, not cancelled, not void
    if (
      invoice.status !== InvoiceStatus.PAID &&
      invoice.status !== InvoiceStatus.CANCELLED &&
      invoice.status !== InvoiceStatus.VOID &&
      invoice.status !== InvoiceStatus.DRAFT
    ) {
      totalPending++;
    }

    // Overdue = past due date and not paid/cancelled/void
    if (
      invoice.due_date &&
      new Date(invoice.due_date) < now &&
      invoice.status !== InvoiceStatus.PAID &&
      invoice.status !== InvoiceStatus.CANCELLED &&
      invoice.status !== InvoiceStatus.VOID
    ) {
      totalOverdue++;
    }
  }

  return {
    total_invoices: result.total,
    total_revenue: totalRevenue,
    total_pending: totalPending,
    total_overdue: totalOverdue,
    by_status: byStatus,
  };
}

// ============================================
// Folio Preview
// ============================================

/**
 * Preview the next folio number without consuming it
 */
export async function getNextFolioPreview(
  orgId: string,
  serie?: string
): Promise<string> {
  return repository.getNextFolioPreview(orgId, serie);
}

// ============================================
// Stamping Updates (for Component 15)
// ============================================

/**
 * Update invoice after successful stamping
 * Called by Component 15 (PAC Integration)
 */
export async function onStampingSuccess(
  invoiceId: string,
  uuid: string,
  cfdiXml: string,
  pdfUrl?: string
): Promise<ServiceResult<Invoice>> {
  const invoice = await repository.findById(invoiceId);
  if (!invoice) {
    return { success: false, errors: ["Invoice not found"] };
  }

  if (invoice.status !== InvoiceStatus.PENDING_STAMP) {
    return {
      success: false,
      errors: [`Invoice is not pending stamp, current status: ${invoice.status}`],
    };
  }

  try {
    const now = new Date().toISOString();
    const updatedInvoice = await repository.updateStatus(
      invoiceId,
      InvoiceStatus.STAMPED,
      {
        uuid,
        cfdi_xml: cfdiXml,
        pdf_url: pdfUrl,
        stamped_at: now,
        updated_at: now,
      }
    );

    return { success: true, data: updatedInvoice };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return { success: false, errors: [message] };
  }
}

/**
 * Update invoice after stamping failure
 * Called by Component 15 (PAC Integration)
 */
export async function onStampingFailure(
  invoiceId: string,
  errorMessage: string
): Promise<ServiceResult<Invoice>> {
  const invoice = await repository.findById(invoiceId);
  if (!invoice) {
    return { success: false, errors: ["Invoice not found"] };
  }

  // Transition back to DRAFT so user can fix issues
  try {
    const now = new Date().toISOString();
    const updatedInvoice = await repository.updateStatus(
      invoiceId,
      InvoiceStatus.DRAFT,
      {
        notes: invoice.notes
          ? `${invoice.notes}\n\nStamping failed: ${errorMessage}`
          : `Stamping failed: ${errorMessage}`,
        updated_at: now,
      }
    );

    return { success: true, data: updatedInvoice };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return { success: false, errors: [message] };
  }
}
