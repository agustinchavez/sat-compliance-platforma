/**
 * Product Import/Export Service
 *
 * Handles CSV import and export for bulk product management.
 */

import type {
  Product,
  ProductCreateInput,
  ProductCSVRow,
  ProductImportResult,
  ProductExportOptions,
} from './types';
import { validateProduct } from './validation';
import { createProducts, listProducts } from './repository';
import { parseCSVRowToProduct, productToCSVRow, generateSKU } from './utils';
import { validateSATProductCode, validateSATUnitCode } from './sat-codes';

// ============================================================================
// CSV Template
// ============================================================================

/**
 * CSV column headers for product import/export
 */
export const CSV_HEADERS = [
  'name',
  'description',
  'type',
  'sku',
  'barcode',
  'sat_product_code',
  'sat_unit_code',
  'unit_name',
  'price',
  'currency',
  'tax_object',
  'iva_rate',
  'iva_exempt',
  'category',
  'tags',
  'track_inventory',
  'current_stock',
  'min_stock',
  'is_active',
] as const;

/**
 * Generate CSV template with headers and example row
 *
 * @returns CSV template string
 */
export function generateCSVTemplate(): string {
  const headers = CSV_HEADERS.join(',');

  const exampleRow = [
    'Servicio de Consultoría',        // name
    'Consultoría empresarial',        // description
    'service',                        // type
    'SRV-001',                        // sku
    '',                               // barcode
    '81112100',                       // sat_product_code
    'E48',                            // sat_unit_code
    'Hora',                           // unit_name
    '1500.00',                        // price
    'MXN',                            // currency
    '02',                             // tax_object
    '0.16',                           // iva_rate
    'false',                          // iva_exempt
    'Servicios',                      // category
    'consultoría,negocios',           // tags
    'false',                          // track_inventory
    '',                               // current_stock
    '',                               // min_stock
    'true',                           // is_active
  ].join(',');

  return `${headers}\n${exampleRow}`;
}

// ============================================================================
// CSV Parsing
// ============================================================================

/**
 * Parse CSV content to product rows
 *
 * @param csvContent - CSV file content
 * @returns Parsed rows or error
 */
export function parseCSV(
  csvContent: string
): { rows: ProductCSVRow[]; error: string | null } {
  const lines = csvContent.trim().split('\n');

  if (lines.length < 2) {
    return { rows: [], error: 'CSV must have header row and at least one data row' };
  }

  // Parse header
  const headerLine = lines[0]!;
  const headers = parseCSVLine(headerLine);

  // Validate required headers
  const requiredHeaders = ['name', 'sat_product_code', 'sat_unit_code', 'unit_name', 'price', 'type'];
  for (const required of requiredHeaders) {
    if (!headers.includes(required)) {
      return { rows: [], error: `Missing required column: ${required}` };
    }
  }

  // Create header index map
  const headerIndex: Record<string, number> = {};
  for (let i = 0; i < headers.length; i++) {
    const header = headers[i];
    if (header !== undefined) {
      headerIndex[header] = i;
    }
  }

  // Parse data rows
  const rows: ProductCSVRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]?.trim();
    if (!line) continue; // Skip empty lines

    const values = parseCSVLine(line);

    const row: ProductCSVRow = {
      name: getCSVValue(values, headerIndex, 'name'),
      description: getCSVValue(values, headerIndex, 'description'),
      type: getCSVValue(values, headerIndex, 'type'),
      sku: getCSVValue(values, headerIndex, 'sku'),
      barcode: getCSVValue(values, headerIndex, 'barcode'),
      sat_product_code: getCSVValue(values, headerIndex, 'sat_product_code'),
      sat_unit_code: getCSVValue(values, headerIndex, 'sat_unit_code'),
      unit_name: getCSVValue(values, headerIndex, 'unit_name'),
      price: getCSVValue(values, headerIndex, 'price'),
      currency: getCSVValue(values, headerIndex, 'currency'),
      tax_object: getCSVValue(values, headerIndex, 'tax_object'),
      iva_rate: getCSVValue(values, headerIndex, 'iva_rate'),
      iva_exempt: getCSVValue(values, headerIndex, 'iva_exempt'),
      category: getCSVValue(values, headerIndex, 'category'),
      tags: getCSVValue(values, headerIndex, 'tags'),
      track_inventory: getCSVValue(values, headerIndex, 'track_inventory'),
      current_stock: getCSVValue(values, headerIndex, 'current_stock'),
      min_stock: getCSVValue(values, headerIndex, 'min_stock'),
      is_active: getCSVValue(values, headerIndex, 'is_active'),
    };

    rows.push(row);
  }

  return { rows, error: null };
}

/**
 * Parse a single CSV line handling quoted values
 *
 * @param line - CSV line
 * @returns Array of values
 */
function parseCSVLine(line: string): string[] {
  const values: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        // Escaped quote
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      values.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }

  values.push(current.trim());
  return values;
}

/**
 * Get value from CSV row by column name
 */
function getCSVValue(
  values: string[],
  headerIndex: Record<string, number>,
  column: string
): string {
  const index = headerIndex[column];
  if (index === undefined || index >= values.length) {
    return '';
  }
  return values[index] ?? '';
}

// ============================================================================
// Import Products
// ============================================================================

/**
 * Import products from CSV data
 *
 * @param organizationId - Organization ID
 * @param csvContent - CSV file content
 * @returns Import result with success/failure details
 */
export async function importProducts(
  organizationId: string,
  csvContent: string
): Promise<ProductImportResult> {
  const result: ProductImportResult = {
    success: false,
    imported_count: 0,
    failed_count: 0,
    errors: [],
    products: [],
  };

  // Parse CSV
  const { rows, error: parseError } = parseCSV(csvContent);

  if (parseError) {
    result.errors.push({ row: 0, message: parseError });
    return result;
  }

  if (rows.length === 0) {
    result.errors.push({ row: 0, message: 'No data rows found in CSV' });
    return result;
  }

  // Process each row
  const validInputs: ProductCreateInput[] = [];
  const rowMapping: number[] = []; // Track which input corresponds to which row

  for (let i = 0; i < rows.length; i++) {
    const rowNum = i + 2; // Account for header and 0-indexing
    const row = rows[i];
    if (!row) continue;

    // Parse CSV row to product input
    const input = parseCSVRowToProduct(row);

    if (!input) {
      result.errors.push({
        row: rowNum,
        message: 'Invalid row format - missing required fields (name, sat_product_code, sat_unit_code, unit_name, price, type)',
      });
      result.failed_count++;
      continue;
    }

    // Validate product
    const validation = await validateProduct(input);

    if (!validation.valid) {
      for (const err of validation.errors) {
        result.errors.push({
          row: rowNum,
          field: err.field,
          message: err.message,
        });
      }
      result.failed_count++;
      continue;
    }

    // Validate SAT codes
    const satProductValid = await validateSATProductCode(input.sat_product_code);
    if (!satProductValid) {
      result.errors.push({
        row: rowNum,
        field: 'sat_product_code',
        message: `Invalid SAT product code: ${input.sat_product_code}`,
      });
      result.failed_count++;
      continue;
    }

    const satUnitValid = await validateSATUnitCode(input.sat_unit_code);
    if (!satUnitValid) {
      result.errors.push({
        row: rowNum,
        field: 'sat_unit_code',
        message: `Invalid SAT unit code: ${input.sat_unit_code}`,
      });
      result.failed_count++;
      continue;
    }

    // Generate SKU if not provided
    if (!input.sku) {
      input.sku = generateSKU(input.type);
    }

    validInputs.push(input);
    rowMapping.push(rowNum);
  }

  // Create valid products
  if (validInputs.length > 0) {
    const createResult = await createProducts(organizationId, validInputs);

    result.products = createResult.data;
    result.imported_count = createResult.data.length;

    // Add any creation errors
    for (const createError of createResult.errors) {
      result.errors.push({
        row: rowMapping[createError.index] ?? 0,
        message: createError.error,
      });
      result.failed_count++;
    }
  }

  result.success = result.imported_count > 0 && result.failed_count === 0;

  return result;
}

/**
 * Validate CSV content without importing
 *
 * @param csvContent - CSV file content
 * @returns Validation errors
 */
export async function validateCSVImport(
  csvContent: string
): Promise<Array<{ row: number; field?: string; message: string }>> {
  const errors: Array<{ row: number; field?: string; message: string }> = [];

  const { rows, error: parseError } = parseCSV(csvContent);

  if (parseError) {
    errors.push({ row: 0, message: parseError });
    return errors;
  }

  for (let i = 0; i < rows.length; i++) {
    const rowNum = i + 2;
    const row = rows[i];
    if (!row) continue;

    const input = parseCSVRowToProduct(row);

    if (!input) {
      errors.push({
        row: rowNum,
        message: 'Invalid row format - missing required fields',
      });
      continue;
    }

    // Validate product data
    const validation = await validateProduct(input);
    if (!validation.valid) {
      for (const err of validation.errors) {
        errors.push({
          row: rowNum,
          field: err.field,
          message: err.message,
        });
      }
    }

    // Validate SAT codes
    const satProductValid = await validateSATProductCode(input.sat_product_code);
    if (!satProductValid) {
      errors.push({
        row: rowNum,
        field: 'sat_product_code',
        message: `Invalid SAT product code: ${input.sat_product_code}`,
      });
    }

    const satUnitValid = await validateSATUnitCode(input.sat_unit_code);
    if (!satUnitValid) {
      errors.push({
        row: rowNum,
        field: 'sat_unit_code',
        message: `Invalid SAT unit code: ${input.sat_unit_code}`,
      });
    }
  }

  return errors;
}

// ============================================================================
// Export Products
// ============================================================================

/**
 * Export products to CSV format
 *
 * @param organizationId - Organization ID
 * @param options - Export options
 * @returns CSV content string
 */
export async function exportProducts(
  organizationId: string,
  options?: ProductExportOptions
): Promise<string> {
  // Fetch all products (paginate if needed)
  const result = await listProducts(
    organizationId,
    {
      is_active: options?.include_inactive ? undefined : true,
    },
    { field: 'name', order: 'asc' },
    { page: 1, limit: 10000 } // Large limit to get all
  );

  // Filter deleted if not requested
  let products = result.products;
  if (!options?.include_deleted) {
    products = products.filter((p) => !p.deleted_at);
  }

  return productsToCSV(products, options?.fields);
}

/**
 * Convert products array to CSV string
 *
 * @param products - Products to export
 * @param fields - Optional specific fields to include
 * @returns CSV content
 */
export function productsToCSV(products: Product[], fields?: (keyof Product)[]): string {
  // Determine which fields to include
  const headers = fields || CSV_HEADERS;

  // Header row
  const headerRow = headers.join(',');

  // Data rows
  const dataRows = products.map((product) => {
    const row = productToCSVRow(product);
    return headers.map((header) => {
      const value = row[header as keyof ProductCSVRow] || '';
      // Escape and quote if contains comma, newline, or quotes
      if (value.includes(',') || value.includes('\n') || value.includes('"')) {
        return `"${value.replace(/"/g, '""')}"`;
      }
      return value;
    }).join(',');
  });

  return [headerRow, ...dataRows].join('\n');
}

/**
 * Export products to JSON format
 *
 * @param organizationId - Organization ID
 * @param options - Export options
 * @returns JSON string
 */
export async function exportProductsJSON(
  organizationId: string,
  options?: ProductExportOptions
): Promise<string> {
  const result = await listProducts(
    organizationId,
    {
      is_active: options?.include_inactive ? undefined : true,
    },
    { field: 'name', order: 'asc' },
    { page: 1, limit: 10000 }
  );

  let products = result.products;
  if (!options?.include_deleted) {
    products = products.filter((p) => !p.deleted_at);
  }

  // Filter fields if specified
  if (options?.fields) {
    products = products.map((p) => {
      const filtered: Record<string, unknown> = {};
      for (const field of options.fields!) {
        filtered[field] = p[field];
      }
      return filtered as unknown as Product;
    });
  }

  return JSON.stringify(products, null, 2);
}

// ============================================================================
// Import Statistics
// ============================================================================

/**
 * Get import preview statistics
 *
 * @param csvContent - CSV content
 * @returns Preview statistics
 */
export function getImportPreview(csvContent: string): {
  totalRows: number;
  validRows: number;
  invalidRows: number;
  productCount: number;
  serviceCount: number;
} {
  const { rows, error } = parseCSV(csvContent);

  if (error) {
    return {
      totalRows: 0,
      validRows: 0,
      invalidRows: 0,
      productCount: 0,
      serviceCount: 0,
    };
  }

  let validRows = 0;
  let invalidRows = 0;
  let productCount = 0;
  let serviceCount = 0;

  for (const row of rows) {
    const input = parseCSVRowToProduct(row);

    if (input) {
      validRows++;
      if (input.type === 'product') {
        productCount++;
      } else {
        serviceCount++;
      }
    } else {
      invalidRows++;
    }
  }

  return {
    totalRows: rows.length,
    validRows,
    invalidRows,
    productCount,
    serviceCount,
  };
}
