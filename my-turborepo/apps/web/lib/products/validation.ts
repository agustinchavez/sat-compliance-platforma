/**
 * Product Validation Service
 *
 * Provides comprehensive validation for products, including
 * SAT code validation, price validation, tax configuration,
 * and SKU uniqueness checking.
 */

import { createClient } from '@/lib/supabase/server';
import {
  ProductCreateSchema,
  ProductUpdateSchema,
  InventoryAdjustmentSchema,
} from './types';
import type {
  ProductCreateInput,
  ProductUpdateInput,
  ProductValidationResult,
  SKUValidationResult,
  TaxConfig,
  IVARate,
  TaxObject,
  InventoryAdjustment,
} from './types';
import {
  validateSATProductCode,
  validateSATUnitCode,
} from './sat-codes';

// ============================================================================
// Product Validation
// ============================================================================

/**
 * Validate product creation data
 *
 * @param data - Product creation input
 * @returns Validation result with errors if any
 */
export async function validateProduct(
  data: ProductCreateInput
): Promise<ProductValidationResult> {
  const errors: Array<{ field: string; message: string }> = [];

  // Schema validation
  const schemaResult = ProductCreateSchema.safeParse(data);
  if (!schemaResult.success) {
    for (const issue of schemaResult.error.issues) {
      errors.push({
        field: issue.path.join('.'),
        message: issue.message,
      });
    }
  }

  // Name validation
  if (data.name) {
    const nameErrors = validateProductName(data.name);
    errors.push(...nameErrors);
  }

  // Price validation
  if (data.price !== undefined) {
    const priceErrors = validatePrice(data.price);
    errors.push(...priceErrors);
  }

  // SAT product code validation
  if (data.sat_product_code) {
    const isValidCode = await validateSATProductCode(data.sat_product_code);
    if (!isValidCode) {
      errors.push({
        field: 'sat_product_code',
        message: `SAT product code '${data.sat_product_code}' is not valid. Please select a valid ClaveProdServ.`,
      });
    }
  }

  // SAT unit code validation
  if (data.sat_unit_code) {
    const isValidUnit = await validateSATUnitCode(data.sat_unit_code);
    if (!isValidUnit) {
      errors.push({
        field: 'sat_unit_code',
        message: `SAT unit code '${data.sat_unit_code}' is not valid. Please select a valid ClaveUnidad.`,
      });
    }
  }

  // Tax configuration validation
  if (data.tax_object || data.iva_rate !== undefined || data.iva_exempt !== undefined) {
    const taxConfig: Partial<TaxConfig> = {
      tax_object: data.tax_object,
      iva_rate: data.iva_rate,
      iva_exempt: data.iva_exempt,
      iva_retention: data.iva_retention,
      iva_retention_rate: data.iva_retention_rate,
      isr_retention: data.isr_retention,
      isr_retention_rate: data.isr_retention_rate,
    };
    const taxErrors = validateTaxConfig(taxConfig);
    errors.push(...taxErrors);
  }

  // Inventory validation
  if (data.track_inventory) {
    const inventoryErrors = validateInventoryConfig(
      data.current_stock,
      data.min_stock,
      data.max_stock
    );
    errors.push(...inventoryErrors);
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Validate product update data
 *
 * @param data - Product update input
 * @returns Validation result with errors if any
 */
export async function validateProductUpdate(
  data: ProductUpdateInput
): Promise<ProductValidationResult> {
  const errors: Array<{ field: string; message: string }> = [];

  // Schema validation
  const schemaResult = ProductUpdateSchema.safeParse(data);
  if (!schemaResult.success) {
    for (const issue of schemaResult.error.issues) {
      errors.push({
        field: issue.path.join('.'),
        message: issue.message,
      });
    }
  }

  // Name validation (if provided)
  if (data.name !== undefined) {
    const nameErrors = validateProductName(data.name);
    errors.push(...nameErrors);
  }

  // Price validation (if provided)
  if (data.price !== undefined) {
    const priceErrors = validatePrice(data.price);
    errors.push(...priceErrors);
  }

  // SAT product code validation (if provided)
  if (data.sat_product_code !== undefined) {
    const isValidCode = await validateSATProductCode(data.sat_product_code);
    if (!isValidCode) {
      errors.push({
        field: 'sat_product_code',
        message: `SAT product code '${data.sat_product_code}' is not valid.`,
      });
    }
  }

  // SAT unit code validation (if provided)
  if (data.sat_unit_code !== undefined) {
    const isValidUnit = await validateSATUnitCode(data.sat_unit_code);
    if (!isValidUnit) {
      errors.push({
        field: 'sat_unit_code',
        message: `SAT unit code '${data.sat_unit_code}' is not valid.`,
      });
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

// ============================================================================
// SKU Validation
// ============================================================================

/**
 * Validate SKU format
 *
 * @param sku - SKU to validate
 * @returns Array of validation errors
 */
export function validateSKUFormat(sku: string): Array<{ field: string; message: string }> {
  const errors: Array<{ field: string; message: string }> = [];

  if (!sku || sku.trim().length === 0) {
    errors.push({
      field: 'sku',
      message: 'SKU is required',
    });
    return errors;
  }

  if (sku.length > 100) {
    errors.push({
      field: 'sku',
      message: 'SKU must be 100 characters or less',
    });
  }

  // SKU should be alphanumeric with hyphens/underscores
  if (!/^[A-Za-z0-9\-_]+$/.test(sku)) {
    errors.push({
      field: 'sku',
      message: 'SKU can only contain letters, numbers, hyphens, and underscores',
    });
  }

  return errors;
}

/**
 * Validate SKU uniqueness within organization
 *
 * @param sku - SKU to validate
 * @param organizationId - Organization ID
 * @param excludeProductId - Product ID to exclude (for updates)
 * @returns SKU validation result
 */
export async function validateSKU(
  sku: string,
  organizationId: string,
  excludeProductId?: string
): Promise<SKUValidationResult> {
  // Format validation
  const formatErrors = validateSKUFormat(sku);
  if (formatErrors.length > 0 && formatErrors[0]) {
    return {
      valid: false,
      available: false,
      error: formatErrors[0].message,
    };
  }

  // Check uniqueness
  const supabase = await createClient();

  let query = supabase
    .from('products')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', organizationId)
    .eq('sku', sku)
    .is('deleted_at', null);

  if (excludeProductId) {
    query = query.neq('id', excludeProductId);
  }

  const { count, error } = await query;

  if (error) {
    return {
      valid: false,
      available: false,
      error: 'Failed to validate SKU uniqueness',
    };
  }

  const isAvailable = (count || 0) === 0;

  return {
    valid: isAvailable,
    available: isAvailable,
    error: isAvailable ? undefined : 'SKU already exists in this organization',
  };
}

// ============================================================================
// Price Validation
// ============================================================================

/**
 * Validate product price
 *
 * @param price - Price to validate
 * @returns Array of validation errors
 */
export function validatePrice(price: number): Array<{ field: string; message: string }> {
  const errors: Array<{ field: string; message: string }> = [];

  if (price === undefined || price === null) {
    errors.push({
      field: 'price',
      message: 'Price is required',
    });
    return errors;
  }

  if (typeof price !== 'number' || isNaN(price)) {
    errors.push({
      field: 'price',
      message: 'Price must be a valid number',
    });
    return errors;
  }

  if (price < 0) {
    errors.push({
      field: 'price',
      message: 'Price cannot be negative',
    });
  }

  if (price > 999999999999.9999) {
    errors.push({
      field: 'price',
      message: 'Price exceeds maximum allowed value',
    });
  }

  // Check decimal precision (max 4 decimal places)
  const decimalPart = price.toString().split('.')[1];
  if (decimalPart && decimalPart.length > 4) {
    errors.push({
      field: 'price',
      message: 'Price cannot have more than 4 decimal places',
    });
  }

  return errors;
}

/**
 * Validate price range filter
 *
 * @param min - Minimum price
 * @param max - Maximum price
 * @returns True if range is valid
 */
export function validatePriceRange(min?: number, max?: number): boolean {
  if (min === undefined && max === undefined) return true;
  if (min !== undefined && min < 0) return false;
  if (max !== undefined && max < 0) return false;
  if (min !== undefined && max !== undefined && min > max) return false;
  return true;
}

// ============================================================================
// Tax Configuration Validation
// ============================================================================

/**
 * Validate tax configuration
 *
 * @param config - Tax configuration to validate
 * @returns Array of validation errors
 */
export function validateTaxConfig(
  config: Partial<TaxConfig>
): Array<{ field: string; message: string }> {
  const errors: Array<{ field: string; message: string }> = [];

  // Tax object validation
  if (config.tax_object !== undefined) {
    if (!['01', '02', '03'].includes(config.tax_object)) {
      errors.push({
        field: 'tax_object',
        message: 'Tax object must be 01, 02, or 03',
      });
    }
  }

  // IVA rate validation
  if (config.iva_rate !== undefined) {
    if (![0, 0.08, 0.16].includes(config.iva_rate)) {
      errors.push({
        field: 'iva_rate',
        message: 'IVA rate must be 0, 0.08, or 0.16',
      });
    }
  }

  // IVA exemption logic
  if (config.iva_exempt && config.iva_rate !== undefined && config.iva_rate !== 0) {
    errors.push({
      field: 'iva_exempt',
      message: 'IVA exempt products must have IVA rate of 0',
    });
  }

  // IVA retention validation
  if (config.iva_retention) {
    if (config.iva_retention_rate === undefined) {
      errors.push({
        field: 'iva_retention_rate',
        message: 'IVA retention rate is required when IVA retention is enabled',
      });
    } else if (config.iva_retention_rate < 0 || config.iva_retention_rate > 1) {
      errors.push({
        field: 'iva_retention_rate',
        message: 'IVA retention rate must be between 0 and 1',
      });
    }
  }

  // ISR retention validation
  if (config.isr_retention) {
    if (config.isr_retention_rate === undefined) {
      errors.push({
        field: 'isr_retention_rate',
        message: 'ISR retention rate is required when ISR retention is enabled',
      });
    } else if (config.isr_retention_rate < 0 || config.isr_retention_rate > 1) {
      errors.push({
        field: 'isr_retention_rate',
        message: 'ISR retention rate must be between 0 and 1',
      });
    }
  }

  // Tax object '01' should have no IVA
  if (config.tax_object === '01' && config.iva_rate !== undefined && config.iva_rate !== 0) {
    errors.push({
      field: 'tax_object',
      message: 'Tax object 01 (no tax) should have IVA rate of 0',
    });
  }

  return errors;
}

/**
 * Validate IVA rate value
 */
export function isValidIVARate(rate: number): rate is IVARate {
  return rate === 0 || rate === 0.08 || rate === 0.16;
}

/**
 * Validate tax object value
 */
export function isValidTaxObject(value: string): value is TaxObject {
  return value === '01' || value === '02' || value === '03';
}

// ============================================================================
// Inventory Validation
// ============================================================================

/**
 * Validate inventory configuration
 *
 * @param currentStock - Current stock level
 * @param minStock - Minimum stock threshold
 * @param maxStock - Maximum stock threshold
 * @returns Array of validation errors
 */
export function validateInventoryConfig(
  currentStock?: number,
  minStock?: number,
  maxStock?: number
): Array<{ field: string; message: string }> {
  const errors: Array<{ field: string; message: string }> = [];

  if (currentStock !== undefined && currentStock < 0) {
    errors.push({
      field: 'current_stock',
      message: 'Current stock cannot be negative',
    });
  }

  if (minStock !== undefined && minStock < 0) {
    errors.push({
      field: 'min_stock',
      message: 'Minimum stock cannot be negative',
    });
  }

  if (maxStock !== undefined && maxStock < 0) {
    errors.push({
      field: 'max_stock',
      message: 'Maximum stock cannot be negative',
    });
  }

  if (minStock !== undefined && maxStock !== undefined && minStock > maxStock) {
    errors.push({
      field: 'min_stock',
      message: 'Minimum stock cannot be greater than maximum stock',
    });
  }

  return errors;
}

/**
 * Validate inventory adjustment
 *
 * @param adjustment - Inventory adjustment to validate
 * @returns Validation result
 */
export function validateInventoryAdjustment(
  adjustment: InventoryAdjustment
): ProductValidationResult {
  const errors: Array<{ field: string; message: string }> = [];

  // Schema validation
  const schemaResult = InventoryAdjustmentSchema.safeParse(adjustment);
  if (!schemaResult.success) {
    for (const issue of schemaResult.error.issues) {
      errors.push({
        field: issue.path.join('.'),
        message: issue.message,
      });
    }
  }

  // Quantity cannot be zero
  if (adjustment.quantity === 0) {
    errors.push({
      field: 'quantity',
      message: 'Quantity cannot be zero',
    });
  }

  // Cost per unit validation
  if (adjustment.cost_per_unit !== undefined && adjustment.cost_per_unit < 0) {
    errors.push({
      field: 'cost_per_unit',
      message: 'Cost per unit cannot be negative',
    });
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

// ============================================================================
// Product Name Validation
// ============================================================================

/**
 * Validate product name
 *
 * @param name - Product name to validate
 * @returns Array of validation errors
 */
export function validateProductName(name: string): Array<{ field: string; message: string }> {
  const errors: Array<{ field: string; message: string }> = [];

  if (!name || name.trim().length === 0) {
    errors.push({
      field: 'name',
      message: 'Product name is required',
    });
    return errors;
  }

  if (name.length > 255) {
    errors.push({
      field: 'name',
      message: 'Product name must be 255 characters or less',
    });
  }

  if (name.trim().length < 2) {
    errors.push({
      field: 'name',
      message: 'Product name must be at least 2 characters',
    });
  }

  return errors;
}

// ============================================================================
// Product for Invoice Validation
// ============================================================================

/**
 * Validate that product has all required fields for invoice generation
 *
 * @param product - Product to validate
 * @returns Validation result
 */
export function validateProductForInvoice(product: {
  sat_product_code?: string;
  sat_unit_code?: string;
  unit_name?: string;
  name?: string;
  price?: number;
  tax_object?: string;
}): ProductValidationResult {
  const errors: Array<{ field: string; message: string }> = [];

  if (!product.sat_product_code) {
    errors.push({
      field: 'sat_product_code',
      message: 'SAT product code is required for invoice generation',
    });
  }

  if (!product.sat_unit_code) {
    errors.push({
      field: 'sat_unit_code',
      message: 'SAT unit code is required for invoice generation',
    });
  }

  if (!product.unit_name) {
    errors.push({
      field: 'unit_name',
      message: 'Unit name is required for invoice generation',
    });
  }

  if (!product.name) {
    errors.push({
      field: 'name',
      message: 'Product name is required for invoice generation',
    });
  }

  if (product.price === undefined || product.price === null) {
    errors.push({
      field: 'price',
      message: 'Price is required for invoice generation',
    });
  }

  if (!product.tax_object) {
    errors.push({
      field: 'tax_object',
      message: 'Tax object is required for invoice generation',
    });
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
