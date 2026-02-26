/**
 * Product Repository
 *
 * Database operations for products, including CRUD operations,
 * filtering, pagination, and inventory management.
 */

import { createClient } from '@/lib/supabase/server';
import type {
  Product,
  ProductCreateInput,
  ProductUpdateInput,
  ProductFilters,
  ProductSortOptions,
  ProductPaginationOptions,
  ProductListResult,
  InventoryAdjustment,
  InventoryAdjustmentRecord,
  LowStockProduct,
  StockCheckResult,
} from './types';
import {
  mapDatabaseRowToProduct,
  mapProductToDatabase,
  generateSKU,
  normalizeSKU,
} from './utils';

// ============================================================================
// Product CRUD Operations
// ============================================================================

/**
 * Create a new product
 *
 * @param organizationId - Organization ID
 * @param input - Product creation input
 * @returns Created product or error
 */
export async function createProduct(
  organizationId: string,
  input: ProductCreateInput
): Promise<{ data: Product | null; error: string | null }> {
  const supabase = await createClient();

  // Generate SKU if not provided
  const sku = input.sku ? normalizeSKU(input.sku) : generateSKU(input.type);

  // Check SKU uniqueness
  const { count: existingCount } = await supabase
    .from('products')
    .select('*', { count: 'exact', head: true })
    .eq('organization_id', organizationId)
    .eq('sku', sku)
    .is('deleted_at', null);

  if (existingCount && existingCount > 0) {
    return { data: null, error: 'SKU already exists in this organization' };
  }

  // Prepare data for insert
  const insertData = mapProductToDatabase(input, organizationId, sku);

  // Fetch SAT code names for caching
  const { data: satProduct } = await supabase
    .from('sat_product_codes')
    .select('name')
    .eq('code', input.sat_product_code)
    .single();

  const { data: satUnit } = await supabase
    .from('sat_unit_codes')
    .select('name')
    .eq('code', input.sat_unit_code)
    .single();

  if (satProduct) {
    insertData.sat_product_name = satProduct.name;
  }
  if (satUnit) {
    insertData.sat_unit_name = satUnit.name;
  }

  const { data, error } = await supabase
    .from('products')
    .insert(insertData)
    .select()
    .single();

  if (error) {
    console.error('Error creating product:', error);
    return { data: null, error: error.message };
  }

  return { data: mapDatabaseRowToProduct(data), error: null };
}

/**
 * Get a product by ID
 *
 * @param productId - Product ID
 * @param organizationId - Organization ID (for RLS verification)
 * @returns Product or null
 */
export async function getProduct(
  productId: string,
  organizationId: string
): Promise<Product | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('products')
    .select('*')
    .eq('id', productId)
    .eq('organization_id', organizationId)
    .is('deleted_at', null)
    .single();

  if (error || !data) {
    return null;
  }

  return mapDatabaseRowToProduct(data);
}

/**
 * Get a product by SKU
 *
 * @param sku - Product SKU
 * @param organizationId - Organization ID
 * @returns Product or null
 */
export async function getProductBySKU(
  sku: string,
  organizationId: string
): Promise<Product | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('products')
    .select('*')
    .eq('sku', normalizeSKU(sku))
    .eq('organization_id', organizationId)
    .is('deleted_at', null)
    .single();

  if (error || !data) {
    return null;
  }

  return mapDatabaseRowToProduct(data);
}

/**
 * Update a product
 *
 * @param productId - Product ID
 * @param organizationId - Organization ID
 * @param input - Update data
 * @returns Updated product or error
 */
export async function updateProduct(
  productId: string,
  organizationId: string,
  input: ProductUpdateInput
): Promise<{ data: Product | null; error: string | null }> {
  const supabase = await createClient();

  // Build update object
  const updateData: Record<string, unknown> = {};

  if (input.name !== undefined) updateData.name = input.name;
  if (input.description !== undefined) updateData.description = input.description;
  if (input.type !== undefined) updateData.type = input.type;
  if (input.barcode !== undefined) updateData.barcode = input.barcode;
  if (input.unit_name !== undefined) updateData.unit_name = input.unit_name;
  if (input.price !== undefined) updateData.price = input.price;
  if (input.currency !== undefined) updateData.currency = input.currency;
  if (input.tax_object !== undefined) updateData.tax_object = input.tax_object;
  if (input.iva_rate !== undefined) updateData.iva_rate = input.iva_rate;
  if (input.iva_exempt !== undefined) updateData.iva_exempt = input.iva_exempt;
  if (input.iva_retention !== undefined) updateData.iva_retention = input.iva_retention;
  if (input.iva_retention_rate !== undefined) updateData.iva_retention_rate = input.iva_retention_rate;
  if (input.isr_retention !== undefined) updateData.isr_retention = input.isr_retention;
  if (input.isr_retention_rate !== undefined) updateData.isr_retention_rate = input.isr_retention_rate;
  if (input.track_inventory !== undefined) updateData.track_inventory = input.track_inventory;
  if (input.current_stock !== undefined) updateData.current_stock = input.current_stock;
  if (input.min_stock !== undefined) updateData.min_stock = input.min_stock;
  if (input.max_stock !== undefined) updateData.max_stock = input.max_stock;
  if (input.category !== undefined) updateData.category = input.category;
  if (input.tags !== undefined) updateData.tags = input.tags;
  if (input.is_active !== undefined) updateData.is_active = input.is_active;

  // Handle SKU update with uniqueness check
  if (input.sku !== undefined) {
    const normalizedSKU = normalizeSKU(input.sku);
    const { count } = await supabase
      .from('products')
      .select('*', { count: 'exact', head: true })
      .eq('organization_id', organizationId)
      .eq('sku', normalizedSKU)
      .neq('id', productId)
      .is('deleted_at', null);

    if (count && count > 0) {
      return { data: null, error: 'SKU already exists in this organization' };
    }
    updateData.sku = normalizedSKU;
  }

  // Handle SAT code updates
  if (input.sat_product_code !== undefined) {
    updateData.sat_product_code = input.sat_product_code;
    const { data: satProduct } = await supabase
      .from('sat_product_codes')
      .select('name')
      .eq('code', input.sat_product_code)
      .single();
    if (satProduct) {
      updateData.sat_product_name = satProduct.name;
    }
  }

  if (input.sat_unit_code !== undefined) {
    updateData.sat_unit_code = input.sat_unit_code;
    const { data: satUnit } = await supabase
      .from('sat_unit_codes')
      .select('name')
      .eq('code', input.sat_unit_code)
      .single();
    if (satUnit) {
      updateData.sat_unit_name = satUnit.name;
    }
  }

  updateData.updated_at = new Date().toISOString();

  const { data, error } = await supabase
    .from('products')
    .update(updateData)
    .eq('id', productId)
    .eq('organization_id', organizationId)
    .is('deleted_at', null)
    .select()
    .single();

  if (error) {
    console.error('Error updating product:', error);
    return { data: null, error: error.message };
  }

  return { data: mapDatabaseRowToProduct(data), error: null };
}

/**
 * Soft delete a product
 *
 * @param productId - Product ID
 * @param organizationId - Organization ID
 * @returns Success or error
 */
export async function deleteProduct(
  productId: string,
  organizationId: string
): Promise<{ success: boolean; error: string | null }> {
  const supabase = await createClient();

  const { error } = await supabase
    .from('products')
    .update({
      deleted_at: new Date().toISOString(),
      is_active: false,
    })
    .eq('id', productId)
    .eq('organization_id', organizationId)
    .is('deleted_at', null);

  if (error) {
    console.error('Error deleting product:', error);
    return { success: false, error: error.message };
  }

  return { success: true, error: null };
}

/**
 * Permanently delete a product (hard delete)
 *
 * @param productId - Product ID
 * @param organizationId - Organization ID
 * @returns Success or error
 */
export async function hardDeleteProduct(
  productId: string,
  organizationId: string
): Promise<{ success: boolean; error: string | null }> {
  const supabase = await createClient();

  const { error } = await supabase
    .from('products')
    .delete()
    .eq('id', productId)
    .eq('organization_id', organizationId);

  if (error) {
    console.error('Error hard deleting product:', error);
    return { success: false, error: error.message };
  }

  return { success: true, error: null };
}

/**
 * Restore a soft-deleted product
 *
 * @param productId - Product ID
 * @param organizationId - Organization ID
 * @returns Restored product or error
 */
export async function restoreProduct(
  productId: string,
  organizationId: string
): Promise<{ data: Product | null; error: string | null }> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('products')
    .update({
      deleted_at: null,
      is_active: true,
      updated_at: new Date().toISOString(),
    })
    .eq('id', productId)
    .eq('organization_id', organizationId)
    .not('deleted_at', 'is', null)
    .select()
    .single();

  if (error) {
    console.error('Error restoring product:', error);
    return { data: null, error: error.message };
  }

  return { data: mapDatabaseRowToProduct(data), error: null };
}

// ============================================================================
// Product Listing and Search
// ============================================================================

/**
 * List products with filters, sorting, and pagination
 *
 * @param organizationId - Organization ID
 * @param filters - Optional filters
 * @param sort - Sort options
 * @param pagination - Pagination options
 * @returns Paginated product list
 */
export async function listProducts(
  organizationId: string,
  filters?: ProductFilters,
  sort?: ProductSortOptions,
  pagination?: ProductPaginationOptions
): Promise<ProductListResult> {
  const supabase = await createClient();

  const page = pagination?.page || 1;
  const limit = pagination?.limit || 20;
  const offset = (page - 1) * limit;

  // Build query
  let query = supabase
    .from('products')
    .select('*', { count: 'exact' })
    .eq('organization_id', organizationId)
    .is('deleted_at', null);

  // Apply filters
  if (filters) {
    if (filters.type) {
      query = query.eq('type', filters.type);
    }
    if (filters.category) {
      query = query.eq('category', filters.category);
    }
    if (filters.is_active !== undefined) {
      query = query.eq('is_active', filters.is_active);
    }
    if (filters.has_inventory) {
      query = query.eq('track_inventory', true);
    }
    if (filters.low_stock) {
      query = query
        .eq('track_inventory', true)
        .not('min_stock', 'is', null)
        .filter('current_stock', 'lte', 'min_stock');
    }
    if (filters.sat_product_code) {
      query = query.eq('sat_product_code', filters.sat_product_code);
    }
    if (filters.tags && filters.tags.length > 0) {
      query = query.overlaps('tags', filters.tags);
    }
    if (filters.price_min !== undefined) {
      query = query.gte('price', filters.price_min);
    }
    if (filters.price_max !== undefined) {
      query = query.lte('price', filters.price_max);
    }
    if (filters.search) {
      const searchTerm = `%${filters.search}%`;
      query = query.or(`name.ilike.${searchTerm},sku.ilike.${searchTerm},description.ilike.${searchTerm}`);
    }
  }

  // Apply sorting
  const sortField = sort?.field || 'created_at';
  const sortOrder = sort?.order || 'desc';
  query = query.order(sortField, { ascending: sortOrder === 'asc' });

  // Apply pagination
  query = query.range(offset, offset + limit - 1);

  const { data, count, error } = await query;

  if (error) {
    console.error('Error listing products:', error);
    return {
      products: [],
      total: 0,
      page,
      limit,
      pages: 0,
    };
  }

  const total = count || 0;
  const pages = Math.ceil(total / limit);

  return {
    products: (data || []).map(mapDatabaseRowToProduct),
    total,
    page,
    limit,
    pages,
  };
}

/**
 * Search products by text query
 *
 * @param organizationId - Organization ID
 * @param query - Search query
 * @param options - Search options
 * @returns Array of matching products
 */
export async function searchProducts(
  organizationId: string,
  query: string,
  options?: {
    type?: string;
    is_active?: boolean;
    category?: string;
    limit?: number;
  }
): Promise<Product[]> {
  const supabase = await createClient();

  const limit = options?.limit || 20;
  const searchTerm = `%${query.trim()}%`;

  let dbQuery = supabase
    .from('products')
    .select('*')
    .eq('organization_id', organizationId)
    .is('deleted_at', null)
    .or(`name.ilike.${searchTerm},sku.ilike.${searchTerm},description.ilike.${searchTerm},barcode.ilike.${searchTerm}`)
    .limit(limit);

  if (options?.type) {
    dbQuery = dbQuery.eq('type', options.type);
  }
  if (options?.is_active !== undefined) {
    dbQuery = dbQuery.eq('is_active', options.is_active);
  }
  if (options?.category) {
    dbQuery = dbQuery.eq('category', options.category);
  }

  const { data, error } = await dbQuery;

  if (error) {
    console.error('Error searching products:', error);
    return [];
  }

  return (data || []).map(mapDatabaseRowToProduct);
}

/**
 * Get multiple products by IDs
 *
 * @param productIds - Array of product IDs
 * @param organizationId - Organization ID
 * @returns Array of products
 */
export async function getProductsByIds(
  productIds: string[],
  organizationId: string
): Promise<Product[]> {
  if (productIds.length === 0) return [];

  const supabase = await createClient();

  const { data, error } = await supabase
    .from('products')
    .select('*')
    .eq('organization_id', organizationId)
    .in('id', productIds)
    .is('deleted_at', null);

  if (error) {
    console.error('Error fetching products by IDs:', error);
    return [];
  }

  return (data || []).map(mapDatabaseRowToProduct);
}

/**
 * Get all categories for an organization
 *
 * @param organizationId - Organization ID
 * @returns Array of unique category names
 */
export async function getCategories(organizationId: string): Promise<string[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('products')
    .select('category')
    .eq('organization_id', organizationId)
    .is('deleted_at', null)
    .not('category', 'is', null);

  if (error) {
    console.error('Error fetching categories:', error);
    return [];
  }

  // Get unique categories
  const categories = new Set<string>();
  for (const row of data || []) {
    if (row.category) {
      categories.add(row.category);
    }
  }

  return Array.from(categories).sort();
}

/**
 * Get product count by filters
 *
 * @param organizationId - Organization ID
 * @param filters - Optional filters
 * @returns Product count
 */
export async function getProductCount(
  organizationId: string,
  filters?: ProductFilters
): Promise<number> {
  const supabase = await createClient();

  let query = supabase
    .from('products')
    .select('*', { count: 'exact', head: true })
    .eq('organization_id', organizationId)
    .is('deleted_at', null);

  if (filters?.type) {
    query = query.eq('type', filters.type);
  }
  if (filters?.is_active !== undefined) {
    query = query.eq('is_active', filters.is_active);
  }

  const { count, error } = await query;

  if (error) {
    console.error('Error counting products:', error);
    return 0;
  }

  return count || 0;
}

// ============================================================================
// Inventory Operations
// ============================================================================

/**
 * Adjust product inventory
 *
 * @param adjustment - Inventory adjustment
 * @param userId - User making the adjustment
 * @returns Updated product or error
 */
export async function adjustInventory(
  adjustment: InventoryAdjustment,
  userId?: string
): Promise<{ data: Product | null; error: string | null }> {
  const supabase = await createClient();

  // Get current product
  const { data: product, error: fetchError } = await supabase
    .from('products')
    .select('*')
    .eq('id', adjustment.product_id)
    .is('deleted_at', null)
    .single();

  if (fetchError || !product) {
    return { data: null, error: 'Product not found' };
  }

  if (!product.track_inventory) {
    return { data: null, error: 'Inventory tracking is not enabled for this product' };
  }

  const previousStock = Number(product.current_stock);
  const newStock = previousStock + adjustment.quantity;

  if (newStock < 0) {
    return { data: null, error: 'Insufficient stock for this adjustment' };
  }

  // Update product stock
  const { data: updatedProduct, error: updateError } = await supabase
    .from('products')
    .update({
      current_stock: newStock,
      updated_at: new Date().toISOString(),
    })
    .eq('id', adjustment.product_id)
    .select()
    .single();

  if (updateError) {
    return { data: null, error: updateError.message };
  }

  // Record inventory history
  await supabase.from('inventory_history').insert({
    product_id: adjustment.product_id,
    organization_id: product.organization_id,
    quantity: adjustment.quantity,
    previous_stock: previousStock,
    new_stock: newStock,
    reason: adjustment.reason,
    reference: adjustment.reference || null,
    notes: adjustment.notes || null,
    cost_per_unit: adjustment.cost_per_unit || null,
    created_by: userId || null,
  });

  return { data: mapDatabaseRowToProduct(updatedProduct), error: null };
}

/**
 * Check stock availability
 *
 * @param productId - Product ID
 * @param organizationId - Organization ID
 * @param quantity - Requested quantity
 * @returns Stock check result
 */
export async function checkStock(
  productId: string,
  organizationId: string,
  quantity: number
): Promise<StockCheckResult | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('products')
    .select('current_stock, track_inventory')
    .eq('id', productId)
    .eq('organization_id', organizationId)
    .is('deleted_at', null)
    .single();

  if (error || !data) {
    return null;
  }

  const currentStock = Number(data.current_stock);
  const trackInventory = data.track_inventory as boolean;

  return {
    available: !trackInventory || currentStock >= quantity,
    current_stock: currentStock,
    requested: quantity,
    remaining: currentStock - quantity,
    track_inventory: trackInventory,
  };
}

/**
 * Get products with low stock
 *
 * @param organizationId - Organization ID
 * @returns Array of low stock products
 */
export async function getLowStockProducts(
  organizationId: string
): Promise<LowStockProduct[]> {
  const supabase = await createClient();

  // Use raw query since we need to compare columns
  const { data, error } = await supabase
    .from('products')
    .select('id, name, sku, current_stock, min_stock')
    .eq('organization_id', organizationId)
    .eq('track_inventory', true)
    .eq('is_active', true)
    .is('deleted_at', null)
    .not('min_stock', 'is', null);

  if (error) {
    console.error('Error fetching low stock products:', error);
    return [];
  }

  // Filter in app since Supabase doesn't support column comparison in filter
  return (data || [])
    .filter((p) => Number(p.current_stock) <= Number(p.min_stock))
    .map((p) => ({
      id: p.id,
      name: p.name,
      sku: p.sku,
      current_stock: Number(p.current_stock),
      min_stock: Number(p.min_stock),
      deficit: Number(p.min_stock) - Number(p.current_stock),
    }));
}

/**
 * Get inventory history for a product
 *
 * @param productId - Product ID
 * @param organizationId - Organization ID
 * @param limit - Max records to return
 * @returns Array of inventory adjustment records
 */
export async function getInventoryHistory(
  productId: string,
  organizationId: string,
  limit: number = 50
): Promise<InventoryAdjustmentRecord[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('inventory_history')
    .select('*')
    .eq('product_id', productId)
    .eq('organization_id', organizationId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('Error fetching inventory history:', error);
    return [];
  }

  return (data || []).map((row) => ({
    id: row.id,
    product_id: row.product_id,
    organization_id: row.organization_id,
    quantity: Number(row.quantity),
    previous_stock: Number(row.previous_stock),
    new_stock: Number(row.new_stock),
    reason: row.reason,
    reference: row.reference,
    notes: row.notes,
    cost_per_unit: row.cost_per_unit ? Number(row.cost_per_unit) : undefined,
    created_by: row.created_by,
    created_at: new Date(row.created_at),
  }));
}

// ============================================================================
// Bulk Operations
// ============================================================================

/**
 * Create multiple products
 *
 * @param organizationId - Organization ID
 * @param inputs - Array of product inputs
 * @returns Results for each product
 */
export async function createProducts(
  organizationId: string,
  inputs: ProductCreateInput[]
): Promise<{ data: Product[]; errors: Array<{ index: number; error: string }> }> {
  const results: Product[] = [];
  const errors: Array<{ index: number; error: string }> = [];

  for (let i = 0; i < inputs.length; i++) {
    const input = inputs[i];
    if (!input) continue;

    const result = await createProduct(organizationId, input);
    if (result.data) {
      results.push(result.data);
    } else {
      errors.push({ index: i, error: result.error || 'Unknown error' });
    }
  }

  return { data: results, errors };
}

/**
 * Update product active status in bulk
 *
 * @param productIds - Array of product IDs
 * @param organizationId - Organization ID
 * @param isActive - New active status
 * @returns Number of updated products
 */
export async function bulkUpdateStatus(
  productIds: string[],
  organizationId: string,
  isActive: boolean
): Promise<number> {
  if (productIds.length === 0) return 0;

  const supabase = await createClient();

  const { data, error } = await supabase
    .from('products')
    .update({
      is_active: isActive,
      updated_at: new Date().toISOString(),
    })
    .eq('organization_id', organizationId)
    .in('id', productIds)
    .is('deleted_at', null)
    .select('id');

  if (error) {
    console.error('Error bulk updating status:', error);
    return 0;
  }

  return data?.length || 0;
}

/**
 * Soft delete multiple products
 *
 * @param productIds - Array of product IDs
 * @param organizationId - Organization ID
 * @returns Number of deleted products
 */
export async function bulkDelete(
  productIds: string[],
  organizationId: string
): Promise<number> {
  if (productIds.length === 0) return 0;

  const supabase = await createClient();

  const { data, error } = await supabase
    .from('products')
    .update({
      deleted_at: new Date().toISOString(),
      is_active: false,
    })
    .eq('organization_id', organizationId)
    .in('id', productIds)
    .is('deleted_at', null)
    .select('id');

  if (error) {
    console.error('Error bulk deleting:', error);
    return 0;
  }

  return data?.length || 0;
}
