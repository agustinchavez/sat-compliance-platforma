/**
 * Inventory Management Service
 *
 * Provides inventory tracking, stock adjustments, and alerts
 * for products with inventory management enabled.
 */

import type {
  Product,
  InventoryAdjustment,
  InventoryAdjustmentRecord,
  InventoryReason,
  LowStockProduct,
  StockCheckResult,
} from './types';
import {
  adjustInventory as repoAdjustInventory,
  checkStock as repoCheckStock,
  getLowStockProducts as repoGetLowStock,
  getInventoryHistory as repoGetHistory,
  getProduct,
} from './repository';
import { validateInventoryAdjustment } from './validation';

// ============================================================================
// Inventory Service Class
// ============================================================================

export class InventoryService {
  private organizationId: string;
  private userId?: string;

  constructor(organizationId: string, userId?: string) {
    this.organizationId = organizationId;
    this.userId = userId;
  }

  // ==========================================================================
  // Stock Adjustments
  // ==========================================================================

  /**
   * Add stock to a product
   *
   * @param productId - Product ID
   * @param quantity - Quantity to add (positive)
   * @param reason - Reason for adjustment
   * @param options - Additional options
   * @returns Updated product or error
   */
  async addStock(
    productId: string,
    quantity: number,
    reason: InventoryReason = 'adjustment',
    options?: {
      reference?: string;
      notes?: string;
      costPerUnit?: number;
    }
  ): Promise<{ data: Product | null; error: string | null }> {
    if (quantity <= 0) {
      return { data: null, error: 'Quantity must be positive' };
    }

    const adjustment: InventoryAdjustment = {
      product_id: productId,
      quantity: Math.abs(quantity), // Ensure positive
      reason,
      reference: options?.reference,
      notes: options?.notes,
      cost_per_unit: options?.costPerUnit,
    };

    return this.adjust(adjustment);
  }

  /**
   * Remove stock from a product
   *
   * @param productId - Product ID
   * @param quantity - Quantity to remove (positive number, will be negated)
   * @param reason - Reason for adjustment
   * @param options - Additional options
   * @returns Updated product or error
   */
  async removeStock(
    productId: string,
    quantity: number,
    reason: InventoryReason = 'adjustment',
    options?: {
      reference?: string;
      notes?: string;
    }
  ): Promise<{ data: Product | null; error: string | null }> {
    if (quantity <= 0) {
      return { data: null, error: 'Quantity must be positive' };
    }

    const adjustment: InventoryAdjustment = {
      product_id: productId,
      quantity: -Math.abs(quantity), // Ensure negative
      reason,
      reference: options?.reference,
      notes: options?.notes,
    };

    return this.adjust(adjustment);
  }

  /**
   * Set stock to a specific value
   *
   * @param productId - Product ID
   * @param newStock - New stock level
   * @param notes - Optional notes
   * @returns Updated product or error
   */
  async setStock(
    productId: string,
    newStock: number,
    notes?: string
  ): Promise<{ data: Product | null; error: string | null }> {
    if (newStock < 0) {
      return { data: null, error: 'Stock cannot be negative' };
    }

    // Get current stock
    const product = await getProduct(productId, this.organizationId);
    if (!product) {
      return { data: null, error: 'Product not found' };
    }

    if (!product.track_inventory) {
      return { data: null, error: 'Inventory tracking not enabled for this product' };
    }

    const currentStock = product.current_stock;
    const difference = newStock - currentStock;

    if (difference === 0) {
      return { data: product, error: null }; // No change needed
    }

    const adjustment: InventoryAdjustment = {
      product_id: productId,
      quantity: difference,
      reason: 'adjustment',
      notes: notes || `Stock set to ${newStock}`,
    };

    return this.adjust(adjustment);
  }

  /**
   * Make a validated inventory adjustment
   *
   * @param adjustment - Inventory adjustment
   * @returns Updated product or error
   */
  async adjust(
    adjustment: InventoryAdjustment
  ): Promise<{ data: Product | null; error: string | null }> {
    // Validate adjustment
    const validation = validateInventoryAdjustment(adjustment);
    if (!validation.valid) {
      return {
        data: null,
        error: validation.errors.map((e) => e.message).join(', '),
      };
    }

    return repoAdjustInventory(adjustment, this.userId);
  }

  // ==========================================================================
  // Stock Queries
  // ==========================================================================

  /**
   * Check stock availability for a product
   *
   * @param productId - Product ID
   * @param quantity - Required quantity
   * @returns Stock check result
   */
  async checkStock(productId: string, quantity: number): Promise<StockCheckResult | null> {
    return repoCheckStock(productId, this.organizationId, quantity);
  }

  /**
   * Check stock availability for multiple products
   *
   * @param items - Array of {productId, quantity}
   * @returns Map of product ID to stock check result
   */
  async checkStockBulk(
    items: Array<{ productId: string; quantity: number }>
  ): Promise<Map<string, StockCheckResult>> {
    const results = new Map<string, StockCheckResult>();

    for (const item of items) {
      const result = await this.checkStock(item.productId, item.quantity);
      if (result) {
        results.set(item.productId, result);
      }
    }

    return results;
  }

  /**
   * Get products with low stock
   *
   * @returns Array of low stock products
   */
  async getLowStock(): Promise<LowStockProduct[]> {
    return repoGetLowStock(this.organizationId);
  }

  /**
   * Get inventory history for a product
   *
   * @param productId - Product ID
   * @param limit - Max records
   * @returns Array of adjustment records
   */
  async getHistory(productId: string, limit?: number): Promise<InventoryAdjustmentRecord[]> {
    return repoGetHistory(productId, this.organizationId, limit);
  }

  // ==========================================================================
  // Sale/Purchase Integration
  // ==========================================================================

  /**
   * Reserve stock for a sale (before invoice generation)
   *
   * This is a soft reservation - doesn't actually reduce stock yet.
   * Call confirmSale() after invoice is generated.
   *
   * @param items - Array of {productId, quantity}
   * @returns Reservation result
   */
  async reserveStock(
    items: Array<{ productId: string; quantity: number }>
  ): Promise<{ success: boolean; unavailable: Array<{ productId: string; available: number; requested: number }> }> {
    const unavailable: Array<{ productId: string; available: number; requested: number }> = [];

    for (const item of items) {
      const stockCheck = await this.checkStock(item.productId, item.quantity);

      if (stockCheck && !stockCheck.available) {
        unavailable.push({
          productId: item.productId,
          available: stockCheck.current_stock,
          requested: item.quantity,
        });
      }
    }

    return {
      success: unavailable.length === 0,
      unavailable,
    };
  }

  /**
   * Confirm sale and reduce inventory
   *
   * @param items - Array of {productId, quantity}
   * @param invoiceId - Invoice reference
   * @returns Results for each product
   */
  async confirmSale(
    items: Array<{ productId: string; quantity: number }>,
    invoiceId: string
  ): Promise<{ success: boolean; results: Array<{ productId: string; success: boolean; error?: string }> }> {
    const results: Array<{ productId: string; success: boolean; error?: string }> = [];

    for (const item of items) {
      const result = await this.removeStock(item.productId, item.quantity, 'sale', {
        reference: invoiceId,
        notes: `Venta - Factura ${invoiceId}`,
      });

      results.push({
        productId: item.productId,
        success: result.data !== null,
        error: result.error || undefined,
      });
    }

    return {
      success: results.every((r) => r.success),
      results,
    };
  }

  /**
   * Record purchase and increase inventory
   *
   * @param items - Array of {productId, quantity, costPerUnit}
   * @param purchaseRef - Purchase reference (PO number, etc.)
   * @returns Results for each product
   */
  async recordPurchase(
    items: Array<{ productId: string; quantity: number; costPerUnit?: number }>,
    purchaseRef: string
  ): Promise<{ success: boolean; results: Array<{ productId: string; success: boolean; error?: string }> }> {
    const results: Array<{ productId: string; success: boolean; error?: string }> = [];

    for (const item of items) {
      const result = await this.addStock(item.productId, item.quantity, 'purchase', {
        reference: purchaseRef,
        notes: `Compra - ${purchaseRef}`,
        costPerUnit: item.costPerUnit,
      });

      results.push({
        productId: item.productId,
        success: result.data !== null,
        error: result.error || undefined,
      });
    }

    return {
      success: results.every((r) => r.success),
      results,
    };
  }

  /**
   * Process customer return
   *
   * @param productId - Product ID
   * @param quantity - Return quantity
   * @param invoiceId - Original invoice reference
   * @param notes - Return notes
   * @returns Updated product or error
   */
  async processReturn(
    productId: string,
    quantity: number,
    invoiceId: string,
    notes?: string
  ): Promise<{ data: Product | null; error: string | null }> {
    return this.addStock(productId, quantity, 'return', {
      reference: invoiceId,
      notes: notes || `Devolución - Factura ${invoiceId}`,
    });
  }

  // ==========================================================================
  // Stock Adjustments by Reason
  // ==========================================================================

  /**
   * Mark items as damaged
   *
   * @param productId - Product ID
   * @param quantity - Quantity damaged
   * @param notes - Damage notes
   * @returns Updated product or error
   */
  async markDamaged(
    productId: string,
    quantity: number,
    notes?: string
  ): Promise<{ data: Product | null; error: string | null }> {
    return this.removeStock(productId, quantity, 'damaged', {
      notes: notes || 'Producto dañado',
    });
  }

  /**
   * Mark items as expired
   *
   * @param productId - Product ID
   * @param quantity - Quantity expired
   * @param notes - Expiration notes
   * @returns Updated product or error
   */
  async markExpired(
    productId: string,
    quantity: number,
    notes?: string
  ): Promise<{ data: Product | null; error: string | null }> {
    return this.removeStock(productId, quantity, 'expired', {
      notes: notes || 'Producto caducado',
    });
  }

  /**
   * Record initial stock (for new products)
   *
   * @param productId - Product ID
   * @param quantity - Initial quantity
   * @param costPerUnit - Optional cost per unit
   * @returns Updated product or error
   */
  async setInitialStock(
    productId: string,
    quantity: number,
    costPerUnit?: number
  ): Promise<{ data: Product | null; error: string | null }> {
    return this.addStock(productId, quantity, 'initial', {
      notes: 'Inventario inicial',
      costPerUnit,
    });
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create an InventoryService instance
 *
 * @param organizationId - Organization ID
 * @param userId - Optional user ID for audit
 * @returns InventoryService instance
 */
export function createInventoryService(
  organizationId: string,
  userId?: string
): InventoryService {
  return new InventoryService(organizationId, userId);
}

// ============================================================================
// Standalone Functions
// ============================================================================

/**
 * Quick stock check
 *
 * @param productId - Product ID
 * @param organizationId - Organization ID
 * @param quantity - Required quantity
 * @returns Stock availability
 */
export async function isStockAvailable(
  productId: string,
  organizationId: string,
  quantity: number
): Promise<boolean> {
  const result = await repoCheckStock(productId, organizationId, quantity);
  return result?.available ?? true;
}

/**
 * Get current stock level
 *
 * @param productId - Product ID
 * @param organizationId - Organization ID
 * @returns Current stock or 0
 */
export async function getCurrentStock(
  productId: string,
  organizationId: string
): Promise<number> {
  const result = await repoCheckStock(productId, organizationId, 0);
  return result?.current_stock ?? 0;
}

/**
 * Get low stock count for organization
 *
 * @param organizationId - Organization ID
 * @returns Number of low stock products
 */
export async function getLowStockCount(organizationId: string): Promise<number> {
  const lowStock = await repoGetLowStock(organizationId);
  return lowStock.length;
}
