/**
 * Product/Service Management Module
 *
 * Comprehensive product catalog system with SAT-compliant codes
 * for CFDI invoice generation in Mexico.
 *
 * @module lib/products
 *
 * @example
 * ```ts
 * import {
 *   ProductService,
 *   createProductService,
 *   InventoryService,
 *   createInventoryService,
 * } from '@/lib/products';
 *
 * // Create service instances
 * const productService = createProductService(organizationId);
 * const inventoryService = createInventoryService(organizationId, userId);
 *
 * // Create a product
 * const result = await productService.create({
 *   name: 'Consultoría Empresarial',
 *   type: 'service',
 *   sat_product_code: '81112100',
 *   sat_unit_code: 'E48',
 *   unit_name: 'Hora',
 *   price: 1500,
 * });
 *
 * // Adjust inventory
 * await inventoryService.addStock(productId, 100, 'purchase', {
 *   reference: 'PO-001',
 * });
 * ```
 */

// ============================================================================
// Types
// ============================================================================

export type {
  // Core types
  Product,
  ProductType,
  ProductStatus,
  TaxObject,
  IVARate,

  // Input types
  ProductCreateInput,
  ProductUpdateInput,

  // Tax types
  TaxConfig,
  TaxCalculation,
  PriceCalculation,

  // Inventory types
  InventoryAdjustment,
  InventoryAdjustmentRecord,
  InventoryReason,
  StockCheckResult,
  LowStockProduct,

  // SAT catalog types
  SATProductCode,
  SATUnitCode,
  SATCodeSuggestion,

  // Query types
  ProductFilters,
  ProductSortOptions,
  ProductPaginationOptions,
  ProductListResult,
  ProductSearchOptions,

  // Invoice types
  ProductForInvoice,
  InvoiceItemInput,

  // Import/Export types
  ProductCSVRow,
  ProductImportResult,
  ProductExportOptions,

  // Validation types
  ProductValidationResult,
  SKUValidationResult,
} from './types';

// ============================================================================
// Schemas
// ============================================================================

export {
  ProductTypeSchema,
  TaxObjectSchema,
  IVARateSchema,
  InventoryReasonSchema,
  ProductCreateSchema,
  ProductUpdateSchema,
  InventoryAdjustmentSchema,
  ProductFiltersSchema,
} from './types';

// ============================================================================
// Constants
// ============================================================================

export {
  COMMON_UNIT_CODES,
  COMMON_PRODUCT_CODES,
  DEFAULT_CURRENCY,
  DEFAULT_TAX_OBJECT,
  DEFAULT_IVA_RATE,
  IVA_RETENTION_RATE,
  ISR_RETENTION_RATE_SERVICES,
  ISR_RETENTION_RATE_LEASE,
  ISR_RETENTION_RATE_COMMISSION,
  SKU_PREFIX_PRODUCT,
  SKU_PREFIX_SERVICE,
} from './types';

// ============================================================================
// Services
// ============================================================================

// Main Product Service
export {
  ProductService,
  createProductService,
  getProductById,
  getProductBySku,
  quickSearch,
} from './service';

// Inventory Service
export {
  InventoryService,
  createInventoryService,
  isStockAvailable,
  getCurrentStock,
  getLowStockCount,
} from './inventory';

// ============================================================================
// SAT Codes
// ============================================================================

export {
  // Product codes
  searchSATProductCodes,
  getSATProductCode,
  validateSATProductCode,
  getSATProductCodesByDivision,
  suggestSATCode,
  getPopularSATCodes,

  // Unit codes
  searchSATUnitCodes,
  getSATUnitCode,
  validateSATUnitCode,
  getCommonUnitCodes,
  getCommonUnitCodesArray,
  getSuggestedUnitCode,

  // Hierarchy
  SAT_DIVISIONS,
  getDivisionName,
  isServiceCode,
  isProductCode,
} from './sat-codes';

// ============================================================================
// Validation
// ============================================================================

export {
  validateProduct,
  validateProductUpdate,
  validateSKU,
  validateSKUFormat,
  validatePrice,
  validatePriceRange,
  validateTaxConfig,
  validateInventoryConfig,
  validateInventoryAdjustment,
  validateProductName,
  validateProductForInvoice,
  isValidIVARate,
  isValidTaxObject,
} from './validation';

// ============================================================================
// Pricing
// ============================================================================

export {
  // Tax calculations
  calculateTaxes,
  calculatePrice,
  calculateIVA,
  calculateTotalWithIVA,
  calculateBaseFromTotal,

  // Discounts
  applyPercentDiscount,
  applyFixedDiscount,
  calculateDiscountAmount,

  // Formatting
  roundCurrency,
  formatPrice,
  formatNumber,
  parsePrice,

  // Tax config helpers
  getDefaultTaxConfig,
  getServiceB2BTaxConfig,
  getExemptTaxConfig,
  hasRetentions,
  getTaxObjectName,
  getIVARateDisplay,

  // Bulk calculations
  calculateTotals,
} from './pricing';

// ============================================================================
// Utilities
// ============================================================================

export {
  // SKU generation
  generateSKU,
  generateSequentialSKU,
  isValidSKUFormat,
  normalizeSKU,

  // Random
  generateRandomString,

  // Transformations
  productToInvoiceFormat,
  mapDatabaseRowToProduct,
  mapProductToDatabase,

  // CSV helpers
  parseCSVRowToProduct,
  productToCSVRow,

  // Number utilities
  roundToDecimals,
  numbersEqual,

  // String utilities
  truncate,
  sanitizeSearchQuery,
  extractSearchTerms,

  // Date utilities
  isWithinDays,
  formatDate,
  formatDateTime,

  // Slug generation
  generateSlug,
} from './utils';

// ============================================================================
// Import/Export
// ============================================================================

export {
  // CSV operations
  CSV_HEADERS,
  generateCSVTemplate,
  parseCSV,
  importProducts,
  validateCSVImport,
  exportProducts,
  productsToCSV,
  exportProductsJSON,
  getImportPreview,
} from './import-export';

// ============================================================================
// Repository (for advanced use cases)
// ============================================================================

export {
  // CRUD
  createProduct,
  getProduct,
  getProductBySKU,
  updateProduct,
  deleteProduct,
  hardDeleteProduct,
  restoreProduct,

  // Listing
  listProducts,
  searchProducts,
  getProductsByIds,
  getCategories,
  getProductCount,

  // Inventory
  adjustInventory,
  checkStock,
  getLowStockProducts,
  getInventoryHistory,

  // Bulk operations
  createProducts,
  bulkUpdateStatus,
  bulkDelete,
} from './repository';
