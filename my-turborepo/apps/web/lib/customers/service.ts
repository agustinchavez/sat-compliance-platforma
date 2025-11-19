/**
 * Customer Service - Main Business Logic
 * Component 6: Customer Management
 *
 * Provides high-level customer management functions with validation,
 * error handling, and integration with other services
 */

import type {
  Customer,
  CreateCustomerInput,
  UpdateCustomerInput,
  CustomerFilters,
  CustomerPagination,
  CustomerSort,
  GetCustomerOptions,
  ListCustomersResult,
  SearchCustomersResult,
  CustomerSearchOptions,
  BulkUpdateResult,
  BulkTagInput,
  BulkStatusInput,
  CustomerStats,
} from './types';
import * as repository from './repository';
import {
  validateCustomerData,
  validateCustomerUpdateData,
  formatRFC,
  validateRFC,
  validateRFCWithSAT,
} from './validation';
import { getOrganization } from '@/lib/organizations/service';

// ============================================
// CRUD Operations
// ============================================

/**
 * Create a new customer
 */
export async function createCustomer(
  organizationId: string,
  data: CreateCustomerInput
): Promise<Customer> {
  // Validate customer data
  const validation = validateCustomerData(data);
  if (!validation.valid) {
    const firstError = Object.values(validation.errors)[0];
    throw new Error(
      typeof firstError === 'string'
        ? firstError
        : 'Invalid customer data'
    );
  }

  // Format RFC
  const formattedRFC = formatRFC(data.rfc);

  // Check if customer with same RFC already exists
  const existing = await repository.findByRFC(organizationId, formattedRFC);
  if (existing) {
    throw new Error(
      `Customer with RFC ${formattedRFC} already exists in your organization`
    );
  }

  // Validate RFC is not the same as organization RFC
  const organization = await getOrganization(organizationId);
  if (organization && formattedRFC === organization.rfc) {
    throw new Error(
      'Customer RFC cannot be the same as your organization RFC'
    );
  }

  // Create customer
  const customer = await repository.create(organizationId, {
    ...data,
    rfc: formattedRFC,
  });

  // Phase 2: Schedule background SAT validation
  // await scheduleSATValidation(customer.id, formattedRFC);

  return customer;
}

/**
 * Update a customer
 */
export async function updateCustomer(
  customerId: string,
  data: UpdateCustomerInput
): Promise<Customer> {
  // Validate update data
  const validation = validateCustomerUpdateData(data);
  if (!validation.valid) {
    const firstError = Object.values(validation.errors)[0];
    throw new Error(
      typeof firstError === 'string'
        ? firstError
        : 'Invalid customer update data'
    );
  }

  // Update customer
  const customer = await repository.update(customerId, data);

  return customer;
}

/**
 * Get customer by ID
 */
export async function getCustomer(
  customerId: string,
  options: GetCustomerOptions = {}
): Promise<Customer | null> {
  const customer = await repository.findById(customerId);

  if (!customer) {
    return null;
  }

  // Phase 2: Include invoices if requested
  if (options.include_invoices) {
    // TODO: Fetch customer invoices
    // customer.invoices = await getCustomerInvoices(customerId);
  }

  // Phase 2: Include stats if requested
  if (options.include_stats) {
    const stats = await getCustomerStats(customerId);
    customer.stats = stats;
  }

  return customer;
}

/**
 * Get customer by RFC
 */
export async function getCustomerByRFC(
  organizationId: string,
  rfc: string
): Promise<Customer | null> {
  const formattedRFC = formatRFC(rfc);
  return repository.findByRFC(organizationId, formattedRFC);
}

/**
 * Delete customer (soft delete)
 */
export async function deleteCustomer(customerId: string): Promise<void> {
  // Check if customer has invoices
  // Phase 2: Add check for invoices
  // const hasInvoices = await customerHasInvoices(customerId);
  // if (hasInvoices) {
  //   throw new Error('Cannot delete customer with existing invoices');
  // }

  await repository.softDelete(customerId);
}

/**
 * Restore deleted customer
 */
export async function restoreCustomer(customerId: string): Promise<Customer> {
  return repository.restore(customerId);
}

/**
 * Permanently delete customer
 */
export async function permanentlyDeleteCustomer(
  customerId: string
): Promise<void> {
  // Check if customer has invoices
  // Phase 2: Add check for invoices
  // const hasInvoices = await customerHasInvoices(customerId);
  // if (hasInvoices) {
  //   throw new Error('Cannot permanently delete customer with existing invoices');
  // }

  await repository.hardDelete(customerId);
}

// ============================================
// List and Search Operations
// ============================================

/**
 * List customers with filters, pagination, and sorting
 */
export async function listCustomers(
  organizationId: string,
  options: {
    filters?: CustomerFilters;
    pagination?: CustomerPagination;
    sort?: CustomerSort;
  } = {}
): Promise<ListCustomersResult> {
  const pagination = options.pagination || { page: 1, limit: 50 };
  const sort = options.sort || { field: 'legal_name', order: 'asc' };

  const { customers, total } = await repository.findByOrganization(
    organizationId,
    {
      filters: options.filters,
      pagination,
      sort,
    }
  );

  const pages = Math.ceil(total / pagination.limit);

  return {
    customers,
    total,
    page: pagination.page,
    pages,
    limit: pagination.limit,
  };
}

/**
 * Search customers with full-text search
 */
export async function searchCustomers(
  organizationId: string,
  query: string,
  options: CustomerSearchOptions = {}
): Promise<SearchCustomersResult> {
  const limit = options.limit || 50;
  const offset = options.offset || 0;

  const { customers, total } = await repository.search(
    organizationId,
    query,
    options
  );

  const page = Math.floor(offset / limit) + 1;
  const pages = Math.ceil(total / limit);

  return {
    customers,
    total,
    page,
    pages,
  };
}

/**
 * Count customers with filters
 */
export async function countCustomers(
  organizationId: string,
  filters?: CustomerFilters
): Promise<number> {
  return repository.count(organizationId, filters);
}

/**
 * Get all active customers (for dropdowns/selects)
 */
export async function getActiveCustomers(
  organizationId: string
): Promise<Customer[]> {
  const { customers } = await repository.findByOrganization(organizationId, {
    filters: { is_active: true },
    sort: { field: 'legal_name', order: 'asc' },
  });

  return customers;
}

// ============================================
// Validation Operations
// ============================================

/**
 * Check if customer exists by RFC
 */
export async function customerExistsByRFC(
  organizationId: string,
  rfc: string
): Promise<boolean> {
  const formattedRFC = formatRFC(rfc);
  const customer = await repository.findByRFC(organizationId, formattedRFC);
  return customer !== null;
}

/**
 * Validate customer RFC
 */
export async function validateCustomerRFC(
  rfc: string,
  organizationId?: string
): Promise<{
  valid: boolean;
  error?: string;
  exists?: boolean;
}> {
  const validation = validateRFC(rfc);

  if (!validation.valid) {
    return {
      valid: false,
      error: validation.error,
    };
  }

  // Check if RFC already exists in organization
  if (organizationId) {
    const exists = await customerExistsByRFC(organizationId, rfc);
    if (exists) {
      return {
        valid: false,
        error: 'Customer with this RFC already exists',
        exists: true,
      };
    }
  }

  return { valid: true };
}

// ============================================
// Bulk Operations
// ============================================

/**
 * Bulk update customers
 */
export async function bulkUpdateCustomers(
  customerIds: string[],
  updates: Partial<UpdateCustomerInput>
): Promise<BulkUpdateResult> {
  try {
    const { updated_count, failed_count } = await repository.bulkUpdate(
      customerIds,
      updates
    );

    return {
      success: true,
      updated_count,
      failed_count,
      errors: [],
    };
  } catch (error) {
    return {
      success: false,
      updated_count: 0,
      failed_count: customerIds.length,
      errors: [
        {
          customer_id: 'all',
          error: error instanceof Error ? error.message : 'Unknown error',
        },
      ],
    };
  }
}

/**
 * Bulk tag customers
 */
export async function bulkTagCustomers(
  input: BulkTagInput
): Promise<BulkUpdateResult> {
  try {
    let updated_count = 0;

    if (input.action === 'add') {
      const result = await repository.bulkAddTags(input.customer_ids, input.tags);
      updated_count = result.updated_count;
    } else if (input.action === 'remove') {
      const result = await repository.bulkRemoveTags(input.customer_ids, input.tags);
      updated_count = result.updated_count;
    } else if (input.action === 'replace') {
      const result = await repository.bulkUpdate(input.customer_ids, {
        tags: input.tags,
      });
      updated_count = result.updated_count;
    }

    return {
      success: true,
      updated_count,
      failed_count: input.customer_ids.length - updated_count,
      errors: [],
    };
  } catch (error) {
    return {
      success: false,
      updated_count: 0,
      failed_count: input.customer_ids.length,
      errors: [
        {
          customer_id: 'all',
          error: error instanceof Error ? error.message : 'Unknown error',
        },
      ],
    };
  }
}

/**
 * Bulk update customer status (active/inactive)
 */
export async function bulkUpdateCustomerStatus(
  input: BulkStatusInput
): Promise<BulkUpdateResult> {
  return bulkUpdateCustomers(input.customer_ids, {
    is_active: input.is_active,
  });
}

// ============================================
// Statistics and Analytics (Phase 2+)
// ============================================

/**
 * Get customer statistics
 */
export async function getCustomerStats(
  customerId: string
): Promise<CustomerStats> {
  // Phase 2: Implement when invoicing system is ready
  // For now, return empty stats
  return {
    total_invoices: 0,
    total_invoiced: 0,
    pending_amount: 0,
    overdue_amount: 0,
    overdue_count: 0,
    average_invoice_amount: 0,
  };

  // Phase 2 implementation:
  // const invoices = await getCustomerInvoices(customerId);
  // return calculateCustomerStats(invoices);
}

/**
 * Get customer invoices (Phase 2+)
 */
export async function getCustomerInvoices(
  customerId: string,
  filters?: {
    status?: string;
    date_from?: Date;
    date_to?: Date;
  }
): Promise<any[]> {
  // Phase 2: Implement when invoicing system is ready
  return [];
}

/**
 * Check if customer has invoices (Phase 2+)
 */
async function customerHasInvoices(customerId: string): Promise<boolean> {
  // Phase 2: Implement when invoicing system is ready
  return false;
}

// ============================================
// SAT Integration (Phase 2)
// ============================================

/**
 * Schedule background SAT validation
 */
async function scheduleSATValidation(
  customerId: string,
  rfc: string
): Promise<void> {
  // Phase 2: Queue background job to validate with SAT
  // This will:
  // 1. Authenticate with organization's e.firma
  // 2. Query SAT registry for RFC
  // 3. Update customer.sat_validated, sat_metadata
  console.log(`[Phase 2] Schedule SAT validation for customer ${customerId} (RFC: ${rfc})`);
}

/**
 * Manually trigger SAT validation for a customer
 */
export async function validateCustomerWithSAT(
  customerId: string
): Promise<{ success: boolean; error?: string }> {
  // Phase 2: Implement SAT validation
  // const customer = await repository.findById(customerId);
  // if (!customer) {
  //   return { success: false, error: 'Customer not found' };
  // }
  //
  // const organization = await getOrganization(customer.organization_id);
  // const efirma = await getOrganizationEFirma(organization.id);
  //
  // const validation = await validateRFCWithSAT(customer.rfc, efirma);
  //
  // if (validation.validated) {
  //   await repository.update(customerId, {
  //     sat_validated: true,
  //     last_sat_validation: validation.timestamp,
  //     sat_metadata: {
  //       validated_at: validation.timestamp,
  //       sat_legal_name: validation.legal_name,
  //       sat_tax_regime: validation.tax_regime,
  //       sat_status: validation.status,
  //     },
  //   });
  // }
  //
  // return { success: validation.validated, error: validation.error };

  console.log(`[Phase 2] SAT validation for customer ${customerId}`);
  return { success: false, error: 'SAT validation not yet implemented' };
}

/**
 * Sync customer data from SAT
 */
export async function syncCustomerFromSAT(
  customerId: string
): Promise<{ success: boolean; error?: string }> {
  // Phase 2: Sync customer data from SAT registry
  // This will update customer's legal_name, tax_regime based on SAT data
  console.log(`[Phase 2] Sync customer from SAT: ${customerId}`);
  return { success: false, error: 'SAT sync not yet implemented' };
}
