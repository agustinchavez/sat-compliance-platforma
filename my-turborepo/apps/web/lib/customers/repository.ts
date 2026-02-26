/**
 * Customer Repository - Database Operations
 * Component 6: Customer Management
 *
 * Handles all direct database interactions for customers table
 * Uses Supabase client with automatic RLS filtering
 */

import { createClient } from '@/lib/supabase/server';
import type {
  Customer,
  CustomerFilters,
  CustomerPagination,
  CustomerSort,
  CreateCustomerInput,
  UpdateCustomerInput,
  CustomerSearchOptions,
} from './types';

// ============================================
// Type Conversion Helpers
// ============================================

/**
 * Convert database row to Customer type
 */
function dbRowToCustomer(row: any): Customer {
  return {
    ...row,
    created_at: new Date(row.created_at),
    updated_at: new Date(row.updated_at),
    deleted_at: row.deleted_at ? new Date(row.deleted_at) : undefined,
    last_sat_validation: row.last_sat_validation
      ? new Date(row.last_sat_validation)
      : undefined,
    tags: row.tags || [],
  };
}

// ============================================
// Read Operations
// ============================================

/**
 * Find customer by ID
 */
export async function findById(
  customerId: string
): Promise<Customer | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('customers')
    .select('*')
    .eq('id', customerId)
    .is('deleted_at', null)
    .limit(1);

  if (error) {
    throw new Error(`Failed to find customer: ${error.message}`);
  }

  if (!data || data.length === 0) {
    return null;
  }

  return dbRowToCustomer(data[0]);
}

/**
 * Find customer by RFC within organization
 */
export async function findByRFC(
  organizationId: string,
  rfc: string
): Promise<Customer | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('customers')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('rfc', rfc.toUpperCase())
    .is('deleted_at', null)
    .limit(1);

  if (error) {
    throw new Error(`Failed to find customer by RFC: ${error.message}`);
  }

  if (!data || data.length === 0) {
    return null;
  }

  return dbRowToCustomer(data[0]);
}

/**
 * Find customers by organization with filters, pagination, and sorting
 */
export async function findByOrganization(
  organizationId: string,
  options: {
    filters?: CustomerFilters;
    pagination?: CustomerPagination;
    sort?: CustomerSort;
    include_deleted?: boolean;
  } = {}
): Promise<{ customers: Customer[]; total: number }> {
  const supabase = await createClient();

  // Build query
  let query = supabase
    .from('customers')
    .select('*', { count: 'exact' })
    .eq('organization_id', organizationId);

  // Apply deleted filter
  if (!options.include_deleted) {
    query = query.is('deleted_at', null);
  }

  // Apply filters
  if (options.filters) {
    const { filters } = options;

    if (filters.tax_regime) {
      query = query.eq('tax_regime', filters.tax_regime);
    }

    if (filters.cfdi_use) {
      query = query.eq('cfdi_use', filters.cfdi_use);
    }

    if (filters.is_active !== undefined) {
      query = query.eq('is_active', filters.is_active);
    }

    if (filters.sat_validated !== undefined) {
      query = query.eq('sat_validated', filters.sat_validated);
    }

    if (filters.tags && filters.tags.length > 0) {
      query = query.contains('tags', filters.tags);
    }

    if (filters.created_after) {
      query = query.gte('created_at', filters.created_after.toISOString());
    }

    if (filters.created_before) {
      query = query.lte('created_at', filters.created_before.toISOString());
    }

    if (filters.search) {
      // Full-text search using textSearch
      query = query.textSearch(
        'legal_name || business_name || rfc',
        filters.search,
        {
          type: 'websearch',
          config: 'spanish',
        }
      );
    }
  }

  // Apply sorting
  const sortField = options.sort?.field || 'legal_name';
  const sortOrder = options.sort?.order || 'asc';
  query = query.order(sortField, { ascending: sortOrder === 'asc' });

  // Apply pagination
  if (options.pagination) {
    const { page, limit } = options.pagination;
    const offset = (page - 1) * limit;
    query = query.range(offset, offset + limit - 1);
  }

  const { data, count, error } = await query;

  if (error) {
    throw new Error(`Failed to find customers: ${error.message}`);
  }

  return {
    customers: (data || []).map(dbRowToCustomer),
    total: count || 0,
  };
}

/**
 * Search customers with full-text search
 */
export async function search(
  organizationId: string,
  searchQuery: string,
  options: CustomerSearchOptions = {}
): Promise<{ customers: Customer[]; total: number }> {
  const supabase = await createClient();

  // Build query with full-text search
  let query = supabase
    .from('customers')
    .select('*', { count: 'exact' })
    .eq('organization_id', organizationId)
    .is('deleted_at', null);

  // Apply full-text search
  if (searchQuery.trim().length > 0) {
    query = query.textSearch(
      'legal_name || business_name || rfc',
      searchQuery,
      {
        type: 'websearch',
        config: 'spanish',
      }
    );
  }

  // Apply optional filters
  if (options.tax_regime) {
    query = query.eq('tax_regime', options.tax_regime);
  }

  if (options.cfdi_use) {
    query = query.eq('cfdi_use', options.cfdi_use);
  }

  if (options.is_active !== undefined) {
    query = query.eq('is_active', options.is_active);
  }

  if (options.tags && options.tags.length > 0) {
    query = query.contains('tags', options.tags);
  }

  // Apply sorting
  const sortField = options.sort_by || 'legal_name';
  const sortOrder = options.sort_order || 'asc';
  query = query.order(sortField, { ascending: sortOrder === 'asc' });

  // Apply pagination
  const limit = options.limit || 50;
  const offset = options.offset || 0;
  query = query.range(offset, offset + limit - 1);

  const { data, count, error } = await query;

  if (error) {
    throw new Error(`Failed to search customers: ${error.message}`);
  }

  return {
    customers: (data || []).map(dbRowToCustomer),
    total: count || 0,
  };
}

/**
 * Count customers with filters
 */
export async function count(
  organizationId: string,
  filters?: CustomerFilters
): Promise<number> {
  const supabase = await createClient();

  let query = supabase
    .from('customers')
    .select('*', { count: 'exact', head: true })
    .eq('organization_id', organizationId)
    .is('deleted_at', null);

  // Apply filters
  if (filters) {
    if (filters.tax_regime) {
      query = query.eq('tax_regime', filters.tax_regime);
    }

    if (filters.cfdi_use) {
      query = query.eq('cfdi_use', filters.cfdi_use);
    }

    if (filters.is_active !== undefined) {
      query = query.eq('is_active', filters.is_active);
    }

    if (filters.sat_validated !== undefined) {
      query = query.eq('sat_validated', filters.sat_validated);
    }

    if (filters.tags && filters.tags.length > 0) {
      query = query.contains('tags', filters.tags);
    }
  }

  const { count: total, error } = await query;

  if (error) {
    throw new Error(`Failed to count customers: ${error.message}`);
  }

  return total || 0;
}

// ============================================
// Write Operations
// ============================================

/**
 * Create a new customer
 */
export async function create(
  organizationId: string,
  data: CreateCustomerInput
): Promise<Customer> {
  const supabase = await createClient();

  const customerData = {
    organization_id: organizationId,
    rfc: data.rfc.toUpperCase(),
    legal_name: data.legal_name.trim(),
    business_name: data.business_name?.trim() || null,
    email: data.email?.trim() || null,
    phone: data.phone?.trim() || null,
    tax_regime: data.tax_regime,
    cfdi_use: data.cfdi_use,
    address: data.address || null,
    notes: data.notes?.trim() || null,
    tags: data.tags || [],
    is_active: data.is_active !== undefined ? data.is_active : true,
    sat_validated: false,
  };

  const { data: created, error } = await supabase
    .from('customers')
    .insert(customerData)
    .select()
    .limit(1);

  if (error) {
    throw new Error(`Failed to create customer: ${error.message}`);
  }

  if (!created || created.length === 0) {
    throw new Error('Failed to create customer: No data returned');
  }

  return dbRowToCustomer(created[0]);
}

/**
 * Update a customer
 */
export async function update(
  customerId: string,
  data: UpdateCustomerInput
): Promise<Customer> {
  const supabase = await createClient();

  const updateData: any = {};

  if (data.legal_name !== undefined) {
    updateData.legal_name = data.legal_name.trim();
  }

  if (data.business_name !== undefined) {
    updateData.business_name = data.business_name?.trim() || null;
  }

  if (data.email !== undefined) {
    updateData.email = data.email?.trim() || null;
  }

  if (data.phone !== undefined) {
    updateData.phone = data.phone?.trim() || null;
  }

  if (data.tax_regime !== undefined) {
    updateData.tax_regime = data.tax_regime;
  }

  if (data.cfdi_use !== undefined) {
    updateData.cfdi_use = data.cfdi_use;
  }

  if (data.address !== undefined) {
    updateData.address = data.address || null;
  }

  if (data.notes !== undefined) {
    updateData.notes = data.notes?.trim() || null;
  }

  if (data.tags !== undefined) {
    updateData.tags = data.tags;
  }

  if (data.is_active !== undefined) {
    updateData.is_active = data.is_active;
  }

  const { data: updated, error } = await supabase
    .from('customers')
    .update(updateData)
    .eq('id', customerId)
    .is('deleted_at', null)
    .select()
    .limit(1);

  if (error) {
    throw new Error(`Failed to update customer: ${error.message}`);
  }

  if (!updated || updated.length === 0) {
    throw new Error('Customer not found or already deleted');
  }

  return dbRowToCustomer(updated[0]);
}

/**
 * Soft delete a customer
 */
export async function softDelete(customerId: string): Promise<void> {
  const supabase = await createClient();

  const { error } = await supabase
    .from('customers')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', customerId)
    .is('deleted_at', null);

  if (error) {
    throw new Error(`Failed to delete customer: ${error.message}`);
  }
}

/**
 * Restore a soft-deleted customer
 */
export async function restore(customerId: string): Promise<Customer> {
  const supabase = await createClient();

  const { data: restored, error } = await supabase
    .from('customers')
    .update({ deleted_at: null })
    .eq('id', customerId)
    .not('deleted_at', 'is', null)
    .select()
    .limit(1);

  if (error) {
    throw new Error(`Failed to restore customer: ${error.message}`);
  }

  if (!restored || restored.length === 0) {
    throw new Error('Customer not found or not deleted');
  }

  return dbRowToCustomer(restored[0]);
}

/**
 * Hard delete a customer (permanent)
 */
export async function hardDelete(customerId: string): Promise<void> {
  const supabase = await createClient();

  const { error } = await supabase
    .from('customers')
    .delete()
    .eq('id', customerId);

  if (error) {
    throw new Error(`Failed to permanently delete customer: ${error.message}`);
  }
}

// ============================================
// Bulk Operations
// ============================================

/**
 * Bulk update customers
 */
export async function bulkUpdate(
  customerIds: string[],
  updates: Partial<UpdateCustomerInput>
): Promise<{ updated_count: number; failed_count: number }> {
  const supabase = await createClient();

  const updateData: any = {};

  if (updates.is_active !== undefined) {
    updateData.is_active = updates.is_active;
  }

  if (updates.tags !== undefined) {
    updateData.tags = updates.tags;
  }

  const { data, error } = await supabase
    .from('customers')
    .update(updateData)
    .in('id', customerIds)
    .is('deleted_at', null)
    .select('id');

  if (error) {
    throw new Error(`Failed to bulk update customers: ${error.message}`);
  }

  const updatedCount = data?.length || 0;
  return {
    updated_count: updatedCount,
    failed_count: customerIds.length - updatedCount,
  };
}

/**
 * Bulk tag customers (add tags to existing)
 */
export async function bulkAddTags(
  customerIds: string[],
  tags: string[]
): Promise<{ updated_count: number }> {
  const supabase = await createClient();

  // Fetch current customers
  const { data: customers, error: fetchError } = await supabase
    .from('customers')
    .select('id, tags')
    .in('id', customerIds)
    .is('deleted_at', null);

  if (fetchError) {
    throw new Error(`Failed to fetch customers for bulk tag: ${fetchError.message}`);
  }

  if (!customers || customers.length === 0) {
    return { updated_count: 0 };
  }

  // Update each customer with merged tags
  let updated_count = 0;

  for (const customer of customers) {
    const existingTags = (customer.tags as string[]) || [];
    const newTags = Array.from(new Set([...existingTags, ...tags]));

    const { error: updateError } = await supabase
      .from('customers')
      .update({ tags: newTags })
      .eq('id', customer.id);

    if (!updateError) {
      updated_count++;
    }
  }

  return { updated_count };
}

/**
 * Bulk remove tags from customers
 */
export async function bulkRemoveTags(
  customerIds: string[],
  tags: string[]
): Promise<{ updated_count: number }> {
  const supabase = await createClient();

  // Fetch current customers
  const { data: customers, error: fetchError } = await supabase
    .from('customers')
    .select('id, tags')
    .in('id', customerIds)
    .is('deleted_at', null);

  if (fetchError) {
    throw new Error(`Failed to fetch customers for bulk tag removal: ${fetchError.message}`);
  }

  if (!customers || customers.length === 0) {
    return { updated_count: 0 };
  }

  // Update each customer with filtered tags
  let updated_count = 0;

  for (const customer of customers) {
    const existingTags = (customer.tags as string[]) || [];
    const newTags = existingTags.filter((tag: string) => !tags.includes(tag));

    const { error: updateError } = await supabase
      .from('customers')
      .update({ tags: newTags })
      .eq('id', customer.id);

    if (!updateError) {
      updated_count++;
    }
  }

  return { updated_count };
}
