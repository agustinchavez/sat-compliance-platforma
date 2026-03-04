/**
 * Product/Service Management Types
 *
 * This file contains all TypeScript interfaces and types for the
 * product/service catalog system with SAT-compliant codes for CFDI generation.
 */

import { z } from 'zod';

// ============================================================================
// Core Product Types
// ============================================================================

export type ProductType = 'product' | 'service';

/**
 * Tax object type for CFDI
 * - '01': No objeto de impuesto (not subject to tax)
 * - '02': Sí objeto de impuesto (subject to tax)
 * - '03': Sí objeto de impuesto y no obligado al desglose (subject but not required to itemize)
 */
export type TaxObject = '01' | '02' | '03';

/**
 * IVA rates allowed in Mexico
 */
export type IVARate = 0 | 0.08 | 0.16;

/**
 * Product status for filtering
 */
export type ProductStatus = 'active' | 'inactive' | 'deleted';

// ============================================================================
// Product Interface
// ============================================================================

export interface Product {
  id: string;
  organization_id: string;

  // Basic Information
  name: string;
  description?: string;
  type: ProductType;
  sku: string;
  barcode?: string;

  // SAT Codes (Required for CFDI)
  sat_product_code: string;      // ClaveProdServ (e.g., '81112100')
  sat_product_name?: string;     // Cached name from SAT catalog
  sat_unit_code: string;         // ClaveUnidad (e.g., 'H87', 'E48')
  sat_unit_name?: string;        // Cached unit name
  unit_name: string;             // Display unit (e.g., 'Hora', 'Pieza')

  // Pricing
  price: number;                 // Base price before tax
  currency: string;              // 'MXN' (default), 'USD', etc.

  // Tax Configuration
  tax_object: TaxObject;
  iva_rate: IVARate;
  iva_exempt: boolean;
  iva_retention: boolean;
  iva_retention_rate?: number;   // 0.1067 (10.67%)
  isr_retention: boolean;
  isr_retention_rate?: number;   // 0.10 or 0.0125

  // Inventory
  track_inventory: boolean;
  current_stock: number;
  min_stock?: number;
  max_stock?: number;

  // Categorization
  category?: string;
  tags: string[];

  // Status
  is_active: boolean;

  // Timestamps
  created_at: Date;
  updated_at: Date;
  deleted_at?: Date;
}

// ============================================================================
// Product Input Types
// ============================================================================

export interface ProductCreateInput {
  name: string;
  description?: string;
  type: ProductType;
  sku?: string;                  // Auto-generated if empty
  barcode?: string;

  // SAT Codes
  sat_product_code: string;
  sat_unit_code: string;
  unit_name: string;

  // Pricing
  price: number;
  currency?: string;             // Default: 'MXN'

  // Tax Configuration
  tax_object?: TaxObject;        // Default: '02'
  iva_rate?: IVARate;            // Default: 0.16
  iva_exempt?: boolean;          // Default: false
  iva_retention?: boolean;       // Default: false
  iva_retention_rate?: number;
  isr_retention?: boolean;       // Default: false
  isr_retention_rate?: number;

  // Inventory
  track_inventory?: boolean;     // Default: false
  current_stock?: number;        // Default: 0
  min_stock?: number;
  max_stock?: number;

  // Categorization
  category?: string;
  tags?: string[];

  // Status
  is_active?: boolean;           // Default: true
}

export interface ProductUpdateInput {
  name?: string;
  description?: string;
  type?: ProductType;
  sku?: string;
  barcode?: string;

  // SAT Codes
  sat_product_code?: string;
  sat_unit_code?: string;
  unit_name?: string;

  // Pricing
  price?: number;
  currency?: string;

  // Tax Configuration
  tax_object?: TaxObject;
  iva_rate?: IVARate;
  iva_exempt?: boolean;
  iva_retention?: boolean;
  iva_retention_rate?: number;
  isr_retention?: boolean;
  isr_retention_rate?: number;

  // Inventory
  track_inventory?: boolean;
  current_stock?: number;
  min_stock?: number;
  max_stock?: number;

  // Categorization
  category?: string;
  tags?: string[];

  // Status
  is_active?: boolean;
}

// ============================================================================
// Tax Configuration
// ============================================================================

export interface TaxConfig {
  tax_object: TaxObject;
  iva_rate: IVARate;
  iva_exempt: boolean;
  iva_retention: boolean;
  iva_retention_rate?: number;
  isr_retention: boolean;
  isr_retention_rate?: number;
}

export interface TaxCalculation {
  base: number;
  iva_trasladado: number;
  iva_retenido: number;
  isr_retenido: number;
  total: number;
}

export interface PriceCalculation {
  quantity: number;
  unit_price: number;
  subtotal: number;
  discount: number;
  discount_percent?: number;
  taxable_base: number;
  iva_trasladado: number;
  iva_retenido: number;
  isr_retenido: number;
  total: number;
}

// ============================================================================
// Inventory Types
// ============================================================================

export type InventoryReason =
  | 'purchase'      // Stock received from purchase
  | 'sale'          // Sold (via invoice)
  | 'return'        // Customer return
  | 'adjustment'    // Manual adjustment
  | 'damaged'       // Damaged goods
  | 'expired'       // Expired products
  | 'transfer'      // Transfer between locations
  | 'initial';      // Initial stock setup

export interface InventoryAdjustment {
  product_id: string;
  quantity: number;              // Positive = add, Negative = remove
  reason: InventoryReason;
  reference?: string;            // Invoice ID, PO number, etc.
  notes?: string;
  cost_per_unit?: number;        // For COGS tracking (future)
}

export interface InventoryAdjustmentRecord {
  id: string;
  product_id: string;
  organization_id: string;
  quantity: number;
  previous_stock: number;
  new_stock: number;
  reason: InventoryReason;
  reference?: string;
  notes?: string;
  cost_per_unit?: number;
  created_by?: string;
  created_at: Date;
}

export interface StockCheckResult {
  available: boolean;
  current_stock: number;
  requested: number;
  remaining: number;
  track_inventory: boolean;
}

export interface LowStockProduct {
  id: string;
  name: string;
  sku: string;
  current_stock: number;
  min_stock: number;
  deficit: number;
}

// ============================================================================
// SAT Catalog Types
// ============================================================================

export interface SATProductCode {
  code: string;                  // e.g., '81112100'
  name: string;                  // e.g., 'Servicios de consultoría de negocios'
  description?: string;
  division?: string;             // First 2 digits
  group?: string;                // First 4 digits
  class?: string;                // First 6 digits
}

export interface SATUnitCode {
  code: string;                  // e.g., 'H87', 'E48', 'KGM'
  name: string;                  // e.g., 'Pieza', 'Unidad de servicio'
  description?: string;
  symbol?: string;               // e.g., 'pza', 'srv', 'kg'
}

export interface SATCodeSuggestion {
  code: string;
  name: string;
  score: number;                 // Relevance score 0-1
  source?: 'semantic' | 'fulltext' | 'hybrid';  // Search method used
}

// ============================================================================
// Query and Filter Types
// ============================================================================

export interface ProductFilters {
  type?: ProductType;
  category?: string;
  is_active?: boolean;
  has_inventory?: boolean;
  low_stock?: boolean;
  sat_product_code?: string;
  tags?: string[];
  price_min?: number;
  price_max?: number;
  search?: string;
}

export interface ProductSortOptions {
  field: 'name' | 'sku' | 'price' | 'created_at' | 'updated_at' | 'current_stock';
  order: 'asc' | 'desc';
}

export interface ProductPaginationOptions {
  page: number;
  limit: number;
}

export interface ProductListResult {
  products: Product[];
  total: number;
  page: number;
  limit: number;
  pages: number;
}

export interface ProductSearchOptions {
  type?: ProductType;
  is_active?: boolean;
  category?: string;
  limit?: number;
}

// ============================================================================
// Invoice Integration Types
// ============================================================================

export interface ProductForInvoice {
  // For CFDI Concepto
  clave_prod_serv: string;
  clave_unidad: string;
  unidad: string;
  descripcion: string;
  valor_unitario: number;
  cantidad: number;
  importe: number;
  descuento?: number;
  objeto_imp: TaxObject;

  // Tax breakdown
  impuestos: {
    traslados: Array<{
      base: number;
      impuesto: string;          // '002' = IVA
      tipo_factor: string;       // 'Tasa', 'Cuota', 'Exento'
      tasa_o_cuota: number;
      importe: number;
    }>;
    retenciones?: Array<{
      base: number;
      impuesto: string;          // '001' = ISR, '002' = IVA
      tipo_factor: string;
      tasa_o_cuota: number;
      importe: number;
    }>;
  };
}

export interface InvoiceItemInput {
  product_id: string;
  quantity: number;
  discount_percent?: number;
  discount_amount?: number;
  unit_price_override?: number;  // Override product price
  description_override?: string; // Override product description
}

// ============================================================================
// Import/Export Types
// ============================================================================

export interface ProductCSVRow {
  name: string;
  description?: string;
  type: string;
  sku?: string;
  barcode?: string;
  sat_product_code: string;
  sat_unit_code: string;
  unit_name: string;
  price: string;
  currency?: string;
  tax_object?: string;
  iva_rate?: string;
  iva_exempt?: string;
  category?: string;
  tags?: string;
  track_inventory?: string;
  current_stock?: string;
  min_stock?: string;
  is_active?: string;
}

export interface ProductImportResult {
  success: boolean;
  imported_count: number;
  failed_count: number;
  errors: Array<{
    row: number;
    field?: string;
    message: string;
  }>;
  products: Product[];
}

export interface ProductExportOptions {
  format: 'csv' | 'json';
  include_inactive?: boolean;
  include_deleted?: boolean;
  fields?: (keyof Product)[];
}

// ============================================================================
// Validation Types
// ============================================================================

export interface ProductValidationResult {
  valid: boolean;
  errors: Array<{
    field: string;
    message: string;
  }>;
}

export interface SKUValidationResult {
  valid: boolean;
  available: boolean;
  error?: string;
}

// ============================================================================
// Zod Schemas
// ============================================================================

export const ProductTypeSchema = z.enum(['product', 'service']);

export const TaxObjectSchema = z.enum(['01', '02', '03']);

export const IVARateSchema = z.union([
  z.literal(0),
  z.literal(0.08),
  z.literal(0.16),
]);

export const InventoryReasonSchema = z.enum([
  'purchase',
  'sale',
  'return',
  'adjustment',
  'damaged',
  'expired',
  'transfer',
  'initial',
]);

export const ProductCreateSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(2000).optional(),
  type: ProductTypeSchema,
  sku: z.string().max(100).optional(),
  barcode: z.string().max(50).optional(),
  sat_product_code: z.string().min(1).max(8),
  sat_unit_code: z.string().min(1).max(10),
  unit_name: z.string().min(1).max(50),
  price: z.number().min(0),
  currency: z.string().length(3).optional(),
  tax_object: TaxObjectSchema.optional(),
  iva_rate: IVARateSchema.optional(),
  iva_exempt: z.boolean().optional(),
  iva_retention: z.boolean().optional(),
  iva_retention_rate: z.number().min(0).max(1).optional(),
  isr_retention: z.boolean().optional(),
  isr_retention_rate: z.number().min(0).max(1).optional(),
  track_inventory: z.boolean().optional(),
  current_stock: z.number().min(0).optional(),
  min_stock: z.number().min(0).optional(),
  max_stock: z.number().min(0).optional(),
  category: z.string().max(100).optional(),
  tags: z.array(z.string().max(50)).optional(),
  is_active: z.boolean().optional(),
});

export const ProductUpdateSchema = ProductCreateSchema.partial();

export const InventoryAdjustmentSchema = z.object({
  product_id: z.string().uuid(),
  quantity: z.number(),
  reason: InventoryReasonSchema,
  reference: z.string().max(255).optional(),
  notes: z.string().max(1000).optional(),
  cost_per_unit: z.number().min(0).optional(),
});

export const ProductFiltersSchema = z.object({
  type: ProductTypeSchema.optional(),
  category: z.string().optional(),
  is_active: z.boolean().optional(),
  has_inventory: z.boolean().optional(),
  low_stock: z.boolean().optional(),
  sat_product_code: z.string().optional(),
  tags: z.array(z.string()).optional(),
  price_min: z.number().optional(),
  price_max: z.number().optional(),
  search: z.string().optional(),
});

// ============================================================================
// Constants
// ============================================================================

export const COMMON_UNIT_CODES: Record<string, string> = {
  H87: 'Pieza',
  E48: 'Unidad de servicio',
  ACT: 'Actividad',
  KGM: 'Kilogramo',
  LTR: 'Litro',
  MTR: 'Metro',
  MTK: 'Metro cuadrado',
  MTQ: 'Metro cúbico',
  XBX: 'Caja',
  XPK: 'Paquete',
  XUN: 'Unidad',
  HUR: 'Hora',
  DAY: 'Día',
  MON: 'Mes',
  ANN: 'Año',
};

export const COMMON_PRODUCT_CODES: Record<string, string> = {
  '01010101': 'No existe en el catálogo',
  '81112100': 'Servicios de consultoría de negocios y corporativa',
  '80101500': 'Servicios de consultoría de negocios',
  '80111600': 'Servicios de personal temporal',
  '43211503': 'Computadoras portátiles',
  '43211507': 'Computadoras de escritorio',
  '44121600': 'Suministros de oficina',
  '44121700': 'Instrumentos de escritura',
  '90101500': 'Restaurantes y catering',
  '78101800': 'Servicios de transporte de pasajeros',
  '84111500': 'Servicios de contabilidad',
  '84111600': 'Servicios de auditoría',
  '80161500': 'Servicios de apoyo gerencial',
};

export const DEFAULT_CURRENCY = 'MXN';
export const DEFAULT_TAX_OBJECT: TaxObject = '02';
export const DEFAULT_IVA_RATE: IVARate = 0.16;

export const IVA_RETENTION_RATE = 0.1067;  // 10.67%
export const ISR_RETENTION_RATE_SERVICES = 0.10;  // 10%
export const ISR_RETENTION_RATE_LEASE = 0.10;  // 10%
export const ISR_RETENTION_RATE_COMMISSION = 0.10;  // 10%

export const SKU_PREFIX_PRODUCT = 'PRD';
export const SKU_PREFIX_SERVICE = 'SRV';
