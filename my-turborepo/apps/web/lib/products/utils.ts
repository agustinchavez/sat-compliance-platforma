/**
 * Product Utilities
 *
 * Helper functions for SKU generation, product transformations,
 * and other utility operations.
 */

import { createClient } from '@/lib/supabase/server';
import type {
  Product,
  ProductType,
  ProductForInvoice,
  TaxObject,
  IVARate,
  ProductCSVRow,
  ProductCreateInput,
} from './types';
import {
  SKU_PREFIX_PRODUCT,
  SKU_PREFIX_SERVICE,
  DEFAULT_CURRENCY,
  DEFAULT_TAX_OBJECT,
  DEFAULT_IVA_RATE,
} from './types';
import { calculateTaxes } from './pricing';

// ============================================================================
// SKU Generation
// ============================================================================

/**
 * Generate a unique SKU for a product
 *
 * Format: {PREFIX}-{TIMESTAMP}-{RANDOM}
 * - PREFIX: PRD for products, SRV for services
 * - TIMESTAMP: Base36 encoded timestamp (compact)
 * - RANDOM: 4 character random string
 *
 * @param type - Product type ('product' or 'service')
 * @returns Generated SKU string
 *
 * @example
 * ```ts
 * generateSKU('product'); // → 'PRD-LKJH5F-A3X9'
 * generateSKU('service'); // → 'SRV-LKJH5G-B2Y8'
 * ```
 */
export function generateSKU(type: ProductType): string {
  const prefix = type === 'product' ? SKU_PREFIX_PRODUCT : SKU_PREFIX_SERVICE;
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = generateRandomString(4);

  return `${prefix}-${timestamp}-${random}`;
}

/**
 * Generate SKU with organization-specific sequence number
 *
 * Format: {PREFIX}-{SEQ}
 * - Checks database for highest sequence and increments
 *
 * @param organizationId - Organization ID
 * @param type - Product type
 * @returns Promise<string> Generated SKU
 */
export async function generateSequentialSKU(
  organizationId: string,
  type: ProductType
): Promise<string> {
  const prefix = type === 'product' ? SKU_PREFIX_PRODUCT : SKU_PREFIX_SERVICE;

  const supabase = await createClient();

  // Get the highest sequence number for this prefix
  const { data } = await supabase
    .from('products')
    .select('sku')
    .eq('organization_id', organizationId)
    .like('sku', `${prefix}-%`)
    .order('sku', { ascending: false })
    .limit(1);

  let nextSeq = 1;

  if (data && data.length > 0 && data[0]) {
    // Extract sequence from SKU like "PRD-00001"
    const lastSku = data[0].sku;
    const match = lastSku.match(new RegExp(`^${prefix}-(\\d+)$`));
    if (match?.[1]) {
      nextSeq = parseInt(match[1], 10) + 1;
    }
  }

  // Format with leading zeros (5 digits)
  return `${prefix}-${nextSeq.toString().padStart(5, '0')}`;
}

/**
 * Validate SKU format
 *
 * @param sku - SKU to validate
 * @returns True if SKU format is valid
 */
export function isValidSKUFormat(sku: string): boolean {
  if (!sku || sku.trim().length === 0) return false;
  if (sku.length > 100) return false;

  // Alphanumeric with hyphens and underscores
  return /^[A-Za-z0-9\-_]+$/.test(sku);
}

/**
 * Normalize SKU (uppercase, trim)
 *
 * @param sku - SKU to normalize
 * @returns Normalized SKU
 */
export function normalizeSKU(sku: string): string {
  return sku.trim().toUpperCase();
}

// ============================================================================
// Random String Generation
// ============================================================================

/**
 * Generate a random alphanumeric string
 *
 * @param length - Length of string to generate
 * @returns Random string
 */
export function generateRandomString(length: number): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Excluding confusing chars
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// ============================================================================
// Product Transformations
// ============================================================================

/**
 * Transform product to invoice format (CFDI Concepto)
 *
 * @param product - Product data
 * @param quantity - Quantity
 * @param discount - Optional discount amount
 * @param unitPriceOverride - Optional price override
 * @returns Product formatted for invoice
 */
export function productToInvoiceFormat(
  product: Pick<
    Product,
    | 'sat_product_code'
    | 'sat_unit_code'
    | 'unit_name'
    | 'name'
    | 'description'
    | 'price'
    | 'tax_object'
    | 'iva_rate'
    | 'iva_exempt'
    | 'iva_retention'
    | 'iva_retention_rate'
    | 'isr_retention'
    | 'isr_retention_rate'
  >,
  quantity: number,
  discount?: number,
  unitPriceOverride?: number
): ProductForInvoice {
  const unitPrice = unitPriceOverride ?? product.price;
  const importe = roundToDecimals(unitPrice * quantity, 2);
  const base = discount ? roundToDecimals(importe - discount, 2) : importe;

  // Calculate taxes
  const taxes = calculateTaxes(base, {
    tax_object: product.tax_object,
    iva_rate: product.iva_rate,
    iva_exempt: product.iva_exempt,
    iva_retention: product.iva_retention,
    iva_retention_rate: product.iva_retention_rate,
    isr_retention: product.isr_retention,
    isr_retention_rate: product.isr_retention_rate,
  });

  // Build traslados (transferred taxes)
  const traslados: ProductForInvoice['impuestos']['traslados'] = [];

  if (!product.iva_exempt && product.tax_object === '02') {
    traslados.push({
      base,
      impuesto: '002', // IVA
      tipo_factor: product.iva_rate === 0 ? 'Exento' : 'Tasa',
      tasa_o_cuota: product.iva_rate,
      importe: taxes.iva_trasladado,
    });
  }

  // Build retenciones (retained taxes)
  const retenciones: ProductForInvoice['impuestos']['retenciones'] = [];

  if (product.iva_retention && product.iva_retention_rate) {
    retenciones.push({
      base,
      impuesto: '002', // IVA
      tipo_factor: 'Tasa',
      tasa_o_cuota: product.iva_retention_rate,
      importe: taxes.iva_retenido,
    });
  }

  if (product.isr_retention && product.isr_retention_rate) {
    retenciones.push({
      base,
      impuesto: '001', // ISR
      tipo_factor: 'Tasa',
      tasa_o_cuota: product.isr_retention_rate,
      importe: taxes.isr_retenido,
    });
  }

  return {
    clave_prod_serv: product.sat_product_code,
    clave_unidad: product.sat_unit_code,
    unidad: product.unit_name,
    descripcion: product.description || product.name,
    valor_unitario: unitPrice,
    cantidad: quantity,
    importe,
    descuento: discount,
    objeto_imp: product.tax_object,
    impuestos: {
      traslados,
      retenciones: retenciones.length > 0 ? retenciones : undefined,
    },
  };
}

/**
 * Transform database row to Product type
 *
 * @param row - Database row
 * @returns Product object
 */
export function mapDatabaseRowToProduct(row: Record<string, unknown>): Product {
  return {
    id: row.id as string,
    organization_id: row.organization_id as string,
    name: row.name as string,
    description: row.description as string | undefined,
    type: row.type as ProductType,
    sku: row.sku as string,
    barcode: row.barcode as string | undefined,
    sat_product_code: row.sat_product_code as string,
    sat_product_name: row.sat_product_name as string | undefined,
    sat_unit_code: row.sat_unit_code as string,
    sat_unit_name: row.sat_unit_name as string | undefined,
    unit_name: row.unit_name as string,
    price: Number(row.price),
    currency: row.currency as string,
    tax_object: row.tax_object as TaxObject,
    iva_rate: Number(row.iva_rate) as IVARate,
    iva_exempt: row.iva_exempt as boolean,
    iva_retention: row.iva_retention as boolean,
    iva_retention_rate: row.iva_retention_rate ? Number(row.iva_retention_rate) : undefined,
    isr_retention: row.isr_retention as boolean,
    isr_retention_rate: row.isr_retention_rate ? Number(row.isr_retention_rate) : undefined,
    track_inventory: row.track_inventory as boolean,
    current_stock: Number(row.current_stock),
    min_stock: row.min_stock ? Number(row.min_stock) : undefined,
    max_stock: row.max_stock ? Number(row.max_stock) : undefined,
    category: row.category as string | undefined,
    tags: (row.tags as string[]) || [],
    is_active: row.is_active as boolean,
    created_at: new Date(row.created_at as string),
    updated_at: new Date(row.updated_at as string),
    deleted_at: row.deleted_at ? new Date(row.deleted_at as string) : undefined,
  };
}

/**
 * Transform Product to database insert format
 *
 * @param input - Product create input
 * @param organizationId - Organization ID
 * @param sku - Generated or provided SKU
 * @returns Database insert object
 */
export function mapProductToDatabase(
  input: ProductCreateInput,
  organizationId: string,
  sku: string
): Record<string, unknown> {
  return {
    organization_id: organizationId,
    name: input.name,
    description: input.description || null,
    type: input.type,
    sku,
    barcode: input.barcode || null,
    sat_product_code: input.sat_product_code,
    sat_unit_code: input.sat_unit_code,
    unit_name: input.unit_name,
    price: input.price,
    currency: input.currency || DEFAULT_CURRENCY,
    tax_object: input.tax_object || DEFAULT_TAX_OBJECT,
    iva_rate: input.iva_rate ?? DEFAULT_IVA_RATE,
    iva_exempt: input.iva_exempt ?? false,
    iva_retention: input.iva_retention ?? false,
    iva_retention_rate: input.iva_retention_rate || null,
    isr_retention: input.isr_retention ?? false,
    isr_retention_rate: input.isr_retention_rate || null,
    track_inventory: input.track_inventory ?? false,
    current_stock: input.current_stock ?? 0,
    min_stock: input.min_stock || null,
    max_stock: input.max_stock || null,
    category: input.category || null,
    tags: input.tags || [],
    is_active: input.is_active ?? true,
  };
}

// ============================================================================
// CSV Parsing
// ============================================================================

/**
 * Parse CSV row to ProductCreateInput
 *
 * @param row - CSV row data
 * @returns ProductCreateInput or null if invalid
 */
export function parseCSVRowToProduct(row: ProductCSVRow): ProductCreateInput | null {
  // Required fields check
  if (!row.name || !row.sat_product_code || !row.sat_unit_code || !row.unit_name || !row.price) {
    return null;
  }

  const price = parseFloat(row.price);
  if (isNaN(price) || price < 0) {
    return null;
  }

  const type = row.type?.toLowerCase();
  if (type !== 'product' && type !== 'service') {
    return null;
  }

  return {
    name: row.name,
    description: row.description || undefined,
    type: type as ProductType,
    sku: row.sku || undefined,
    barcode: row.barcode || undefined,
    sat_product_code: row.sat_product_code,
    sat_unit_code: row.sat_unit_code,
    unit_name: row.unit_name,
    price,
    currency: row.currency || DEFAULT_CURRENCY,
    tax_object: parseCSVTaxObject(row.tax_object),
    iva_rate: parseCSVIVARate(row.iva_rate),
    iva_exempt: parseCSVBoolean(row.iva_exempt),
    category: row.category || undefined,
    tags: row.tags ? row.tags.split(',').map((t) => t.trim()) : undefined,
    track_inventory: parseCSVBoolean(row.track_inventory),
    current_stock: row.current_stock ? parseInt(row.current_stock, 10) : undefined,
    min_stock: row.min_stock ? parseInt(row.min_stock, 10) : undefined,
    is_active: row.is_active !== undefined ? parseCSVBoolean(row.is_active) : true,
  };
}

/**
 * Convert Product to CSV row
 *
 * @param product - Product to convert
 * @returns CSV row object
 */
export function productToCSVRow(product: Product): ProductCSVRow {
  return {
    name: product.name,
    description: product.description,
    type: product.type,
    sku: product.sku,
    barcode: product.barcode,
    sat_product_code: product.sat_product_code,
    sat_unit_code: product.sat_unit_code,
    unit_name: product.unit_name,
    price: product.price.toString(),
    currency: product.currency,
    tax_object: product.tax_object,
    iva_rate: product.iva_rate.toString(),
    iva_exempt: product.iva_exempt.toString(),
    category: product.category,
    tags: product.tags.join(','),
    track_inventory: product.track_inventory.toString(),
    current_stock: product.current_stock.toString(),
    min_stock: product.min_stock?.toString(),
    is_active: product.is_active.toString(),
  };
}

// ============================================================================
// CSV Parse Helpers
// ============================================================================

function parseCSVTaxObject(value?: string): TaxObject | undefined {
  if (!value) return undefined;
  const cleaned = value.trim();
  if (cleaned === '01' || cleaned === '02' || cleaned === '03') {
    return cleaned as TaxObject;
  }
  return undefined;
}

function parseCSVIVARate(value?: string): IVARate | undefined {
  if (!value) return undefined;
  const num = parseFloat(value);
  if (num === 0 || num === 0.08 || num === 0.16) {
    return num as IVARate;
  }
  // Handle percentage format
  if (num === 8) return 0.08;
  if (num === 16) return 0.16;
  return undefined;
}

function parseCSVBoolean(value?: string): boolean | undefined {
  if (!value) return undefined;
  const lower = value.toLowerCase().trim();
  if (lower === 'true' || lower === '1' || lower === 'yes' || lower === 'sí') {
    return true;
  }
  if (lower === 'false' || lower === '0' || lower === 'no') {
    return false;
  }
  return undefined;
}

// ============================================================================
// Number Utilities
// ============================================================================

/**
 * Round number to specified decimal places
 *
 * @param num - Number to round
 * @param decimals - Number of decimal places
 * @returns Rounded number
 */
export function roundToDecimals(num: number, decimals: number): number {
  const factor = Math.pow(10, decimals);
  return Math.round(num * factor) / factor;
}

/**
 * Check if two numbers are equal within tolerance
 *
 * @param a - First number
 * @param b - Second number
 * @param tolerance - Tolerance (default: 0.0001)
 * @returns True if equal within tolerance
 */
export function numbersEqual(a: number, b: number, tolerance: number = 0.0001): boolean {
  return Math.abs(a - b) < tolerance;
}

// ============================================================================
// String Utilities
// ============================================================================

/**
 * Truncate string to max length with ellipsis
 *
 * @param str - String to truncate
 * @param maxLength - Maximum length
 * @returns Truncated string
 */
export function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str;
  return str.substring(0, maxLength - 3) + '...';
}

/**
 * Sanitize string for search queries
 *
 * @param query - Search query
 * @returns Sanitized query
 */
export function sanitizeSearchQuery(query: string): string {
  return query
    .trim()
    .toLowerCase()
    .replace(/[^\w\sáéíóúñü]/g, '')
    .replace(/\s+/g, ' ');
}

/**
 * Generate search terms from product name/description
 *
 * @param text - Text to process
 * @returns Array of search terms
 */
export function extractSearchTerms(text: string): string[] {
  return sanitizeSearchQuery(text)
    .split(' ')
    .filter((term) => term.length > 2);
}

// ============================================================================
// Date Utilities
// ============================================================================

/**
 * Check if date is within last N days
 *
 * @param date - Date to check
 * @param days - Number of days
 * @returns True if within range
 */
export function isWithinDays(date: Date, days: number): boolean {
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const daysDiff = diff / (1000 * 60 * 60 * 24);
  return daysDiff <= days;
}

/**
 * Format date for display
 *
 * @param date - Date to format
 * @param locale - Locale (default: es-MX)
 * @returns Formatted date string
 */
export function formatDate(date: Date, locale: string = 'es-MX'): string {
  return new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(date);
}

/**
 * Format date and time for display
 *
 * @param date - Date to format
 * @param locale - Locale (default: es-MX)
 * @returns Formatted date/time string
 */
export function formatDateTime(date: Date, locale: string = 'es-MX'): string {
  return new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

// ============================================================================
// Slug Generation
// ============================================================================

/**
 * Generate URL-friendly slug from name
 *
 * @param name - Name to slugify
 * @returns URL-friendly slug
 */
export function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remove diacritics
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 100);
}
