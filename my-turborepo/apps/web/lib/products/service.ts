/**
 * Product Service
 *
 * Main service layer for product management. Combines validation,
 * repository operations, and business logic into a cohesive API.
 */

import type {
  Product,
  ProductCreateInput,
  ProductUpdateInput,
  ProductFilters,
  ProductSortOptions,
  ProductPaginationOptions,
  ProductListResult,
  ProductValidationResult,
  InvoiceItemInput,
  ProductForInvoice,
  TaxCalculation,
  PriceCalculation,
} from './types';
import {
  validateProduct,
  validateProductUpdate,
  validateSKU,
  validateProductForInvoice,
} from './validation';
import {
  createProduct,
  getProduct,
  getProductBySKU,
  updateProduct,
  deleteProduct,
  restoreProduct,
  listProducts,
  searchProducts,
  getProductsByIds,
  getCategories,
  getProductCount,
} from './repository';
import {
  calculateTaxes,
  calculatePrice,
  calculateTotals,
} from './pricing';
import {
  productToInvoiceFormat,
  generateSKU,
  normalizeSKU,
} from './utils';
import {
  getSATProductCode,
  getSATUnitCode,
  searchSATProductCodes,
  searchSATUnitCodes,
  suggestSATCode,
} from './sat-codes';

// ============================================================================
// Product Service Class
// ============================================================================

export class ProductService {
  private organizationId: string;

  constructor(organizationId: string) {
    this.organizationId = organizationId;
  }

  // ==========================================================================
  // Product CRUD
  // ==========================================================================

  /**
   * Create a new product with validation
   *
   * @param input - Product creation input
   * @returns Created product or validation errors
   */
  async create(
    input: ProductCreateInput
  ): Promise<{ data: Product | null; error: string | null; validationErrors?: ProductValidationResult['errors'] }> {
    // Validate input
    const validation = await validateProduct(input);
    if (!validation.valid) {
      return { data: null, error: 'Validation failed', validationErrors: validation.errors };
    }

    // Validate SKU uniqueness if provided
    if (input.sku) {
      const skuValidation = await validateSKU(input.sku, this.organizationId);
      if (!skuValidation.valid) {
        return { data: null, error: skuValidation.error || 'Invalid SKU' };
      }
    }

    // Create product
    return createProduct(this.organizationId, input);
  }

  /**
   * Get a product by ID
   *
   * @param productId - Product ID
   * @returns Product or null
   */
  async get(productId: string): Promise<Product | null> {
    return getProduct(productId, this.organizationId);
  }

  /**
   * Get a product by SKU
   *
   * @param sku - Product SKU
   * @returns Product or null
   */
  async getBySKU(sku: string): Promise<Product | null> {
    return getProductBySKU(sku, this.organizationId);
  }

  /**
   * Update a product with validation
   *
   * @param productId - Product ID
   * @param input - Update data
   * @returns Updated product or errors
   */
  async update(
    productId: string,
    input: ProductUpdateInput
  ): Promise<{ data: Product | null; error: string | null; validationErrors?: ProductValidationResult['errors'] }> {
    // Validate input
    const validation = await validateProductUpdate(input);
    if (!validation.valid) {
      return { data: null, error: 'Validation failed', validationErrors: validation.errors };
    }

    // Validate SKU uniqueness if being changed
    if (input.sku) {
      const skuValidation = await validateSKU(input.sku, this.organizationId, productId);
      if (!skuValidation.valid) {
        return { data: null, error: skuValidation.error || 'Invalid SKU' };
      }
    }

    return updateProduct(productId, this.organizationId, input);
  }

  /**
   * Soft delete a product
   *
   * @param productId - Product ID
   * @returns Success or error
   */
  async delete(productId: string): Promise<{ success: boolean; error: string | null }> {
    return deleteProduct(productId, this.organizationId);
  }

  /**
   * Restore a deleted product
   *
   * @param productId - Product ID
   * @returns Restored product or error
   */
  async restore(productId: string): Promise<{ data: Product | null; error: string | null }> {
    return restoreProduct(productId, this.organizationId);
  }

  // ==========================================================================
  // Product Listing
  // ==========================================================================

  /**
   * List products with filters and pagination
   *
   * @param filters - Optional filters
   * @param sort - Sort options
   * @param pagination - Pagination options
   * @returns Paginated product list
   */
  async list(
    filters?: ProductFilters,
    sort?: ProductSortOptions,
    pagination?: ProductPaginationOptions
  ): Promise<ProductListResult> {
    return listProducts(this.organizationId, filters, sort, pagination);
  }

  /**
   * Search products by text query
   *
   * @param query - Search query
   * @param options - Search options
   * @returns Matching products
   */
  async search(
    query: string,
    options?: {
      type?: string;
      is_active?: boolean;
      category?: string;
      limit?: number;
    }
  ): Promise<Product[]> {
    return searchProducts(this.organizationId, query, options);
  }

  /**
   * Get multiple products by IDs
   *
   * @param productIds - Array of product IDs
   * @returns Products
   */
  async getMany(productIds: string[]): Promise<Product[]> {
    return getProductsByIds(productIds, this.organizationId);
  }

  /**
   * Get all product categories
   *
   * @returns Array of category names
   */
  async getCategories(): Promise<string[]> {
    return getCategories(this.organizationId);
  }

  /**
   * Get product count
   *
   * @param filters - Optional filters
   * @returns Count
   */
  async count(filters?: ProductFilters): Promise<number> {
    return getProductCount(this.organizationId, filters);
  }

  // ==========================================================================
  // SKU Management
  // ==========================================================================

  /**
   * Generate a new unique SKU
   *
   * @param type - Product type
   * @returns Generated SKU
   */
  generateSKU(type: 'product' | 'service'): string {
    return generateSKU(type);
  }

  /**
   * Validate SKU uniqueness
   *
   * @param sku - SKU to validate
   * @param excludeProductId - Product ID to exclude
   * @returns Validation result
   */
  async validateSKU(sku: string, excludeProductId?: string): Promise<{ valid: boolean; error?: string }> {
    const result = await validateSKU(sku, this.organizationId, excludeProductId);
    return { valid: result.valid, error: result.error };
  }

  /**
   * Normalize SKU format
   *
   * @param sku - SKU to normalize
   * @returns Normalized SKU
   */
  normalizeSKU(sku: string): string {
    return normalizeSKU(sku);
  }

  // ==========================================================================
  // SAT Code Management
  // ==========================================================================

  /**
   * Search SAT product codes
   *
   * @param query - Search query
   * @param limit - Max results
   * @returns Matching SAT codes
   */
  async searchSATProductCodes(query: string, limit?: number) {
    return searchSATProductCodes(query, limit);
  }

  /**
   * Search SAT unit codes
   *
   * @param query - Search query
   * @param limit - Max results
   * @returns Matching SAT codes
   */
  async searchSATUnitCodes(query: string, limit?: number) {
    return searchSATUnitCodes(query, limit);
  }

  /**
   * Get SAT product code details
   *
   * @param code - SAT code
   * @returns SAT code info
   */
  async getSATProductCode(code: string) {
    return getSATProductCode(code);
  }

  /**
   * Get SAT unit code details
   *
   * @param code - SAT code
   * @returns SAT unit info
   */
  async getSATUnitCode(code: string) {
    return getSATUnitCode(code);
  }

  /**
   * Get SAT code suggestions for a product description
   *
   * @param description - Product description
   * @param limit - Max suggestions
   * @returns SAT code suggestions with scores
   */
  async suggestSATCode(description: string, limit?: number) {
    return suggestSATCode(description, limit);
  }

  // ==========================================================================
  // Price Calculations
  // ==========================================================================

  /**
   * Calculate taxes for a product
   *
   * @param product - Product with tax config
   * @param base - Base amount
   * @returns Tax calculation
   */
  calculateTaxes(
    product: Pick<Product, 'tax_object' | 'iva_rate' | 'iva_exempt' | 'iva_retention' | 'iva_retention_rate' | 'isr_retention' | 'isr_retention_rate'>,
    base: number
  ): TaxCalculation {
    return calculateTaxes(base, {
      tax_object: product.tax_object,
      iva_rate: product.iva_rate,
      iva_exempt: product.iva_exempt,
      iva_retention: product.iva_retention,
      iva_retention_rate: product.iva_retention_rate,
      isr_retention: product.isr_retention,
      isr_retention_rate: product.isr_retention_rate,
    });
  }

  /**
   * Calculate full price breakdown for a product
   *
   * @param product - Product with pricing info
   * @param quantity - Quantity
   * @param discountPercent - Optional discount percentage
   * @param discountAmount - Optional fixed discount
   * @returns Price calculation
   */
  calculatePrice(
    product: Pick<Product, 'price' | 'tax_object' | 'iva_rate' | 'iva_exempt' | 'iva_retention' | 'iva_retention_rate' | 'isr_retention' | 'isr_retention_rate'>,
    quantity: number,
    discountPercent?: number,
    discountAmount?: number
  ): PriceCalculation {
    return calculatePrice(product, quantity, discountPercent, discountAmount);
  }

  /**
   * Calculate totals for multiple line items
   *
   * @param items - Array of price calculations
   * @returns Aggregated totals
   */
  calculateTotals(items: PriceCalculation[]) {
    return calculateTotals(items);
  }

  // ==========================================================================
  // Invoice Integration
  // ==========================================================================

  /**
   * Prepare products for invoice generation
   *
   * @param items - Invoice item inputs
   * @returns Products formatted for CFDI
   */
  async prepareForInvoice(
    items: InvoiceItemInput[]
  ): Promise<{ data: ProductForInvoice[]; errors: Array<{ productId: string; error: string }> }> {
    const result: ProductForInvoice[] = [];
    const errors: Array<{ productId: string; error: string }> = [];

    // Get all products
    const productIds = items.map((i) => i.product_id);
    const products = await this.getMany(productIds);

    // Create lookup map
    const productMap = new Map<string, Product>();
    for (const product of products) {
      productMap.set(product.id, product);
    }

    // Process each item
    for (const item of items) {
      const product = productMap.get(item.product_id);

      if (!product) {
        errors.push({ productId: item.product_id, error: 'Product not found' });
        continue;
      }

      // Validate product has required fields for invoice
      const validation = validateProductForInvoice(product);
      if (!validation.valid) {
        errors.push({
          productId: item.product_id,
          error: validation.errors.map((e) => e.message).join(', '),
        });
        continue;
      }

      // Transform to invoice format
      const invoiceProduct = productToInvoiceFormat(
        product,
        item.quantity,
        item.discount_amount,
        item.unit_price_override
      );

      // Override description if provided
      if (item.description_override) {
        invoiceProduct.descripcion = item.description_override;
      }

      result.push(invoiceProduct);
    }

    return { data: result, errors };
  }

  /**
   * Validate products are ready for invoicing
   *
   * @param productIds - Product IDs to validate
   * @returns Validation results per product
   */
  async validateForInvoice(
    productIds: string[]
  ): Promise<Map<string, ProductValidationResult>> {
    const results = new Map<string, ProductValidationResult>();
    const products = await this.getMany(productIds);

    for (const productId of productIds) {
      const product = products.find((p) => p.id === productId);

      if (!product) {
        results.set(productId, {
          valid: false,
          errors: [{ field: 'id', message: 'Product not found' }],
        });
        continue;
      }

      results.set(productId, validateProductForInvoice(product));
    }

    return results;
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a ProductService instance
 *
 * @param organizationId - Organization ID
 * @returns ProductService instance
 */
export function createProductService(organizationId: string): ProductService {
  return new ProductService(organizationId);
}

// ============================================================================
// Standalone Functions (for direct imports)
// ============================================================================

/**
 * Quick product lookup by ID
 *
 * @param productId - Product ID
 * @param organizationId - Organization ID
 * @returns Product or null
 */
export async function getProductById(
  productId: string,
  organizationId: string
): Promise<Product | null> {
  return getProduct(productId, organizationId);
}

/**
 * Quick product lookup by SKU
 *
 * @param sku - Product SKU
 * @param organizationId - Organization ID
 * @returns Product or null
 */
export async function getProductBySku(
  sku: string,
  organizationId: string
): Promise<Product | null> {
  return getProductBySKU(sku, organizationId);
}

/**
 * Quick product search
 *
 * @param query - Search query
 * @param organizationId - Organization ID
 * @param limit - Max results
 * @returns Matching products
 */
export async function quickSearch(
  query: string,
  organizationId: string,
  limit: number = 10
): Promise<Product[]> {
  return searchProducts(organizationId, query, { limit, is_active: true });
}
