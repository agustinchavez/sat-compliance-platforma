/**
 * Import/Export Service Tests
 *
 * Tests for CSV parsing, generation, and import preview.
 */

import { describe, it, expect } from 'vitest';
import {
  CSV_HEADERS,
  generateCSVTemplate,
  parseCSV,
  productsToCSV,
  getImportPreview,
} from '../import-export';
import type { Product } from '../types';

// ============================================================================
// CSV Template
// ============================================================================

describe('CSV_HEADERS', () => {
  it('should contain all required fields', () => {
    const requiredFields = [
      'name',
      'type',
      'sat_product_code',
      'sat_unit_code',
      'unit_name',
      'price',
    ];

    for (const field of requiredFields) {
      expect(CSV_HEADERS).toContain(field);
    }
  });

  it('should contain optional fields', () => {
    const optionalFields = [
      'description',
      'sku',
      'barcode',
      'currency',
      'tax_object',
      'iva_rate',
      'category',
      'tags',
    ];

    for (const field of optionalFields) {
      expect(CSV_HEADERS).toContain(field);
    }
  });
});

describe('generateCSVTemplate', () => {
  it('should generate template with headers', () => {
    const template = generateCSVTemplate();
    const lines = template.split('\n');

    expect(lines.length).toBe(2); // Header + example
    expect(lines[0]).toContain('name');
    expect(lines[0]).toContain('sat_product_code');
    expect(lines[0]).toContain('price');
  });

  it('should include example row', () => {
    const template = generateCSVTemplate();
    const lines = template.split('\n');

    expect(lines[1]).toContain('Servicio de Consultoría');
    expect(lines[1]).toContain('81112100');
    expect(lines[1]).toContain('E48');
  });
});

// ============================================================================
// CSV Parsing
// ============================================================================

describe('parseCSV', () => {
  it('should parse valid CSV content', () => {
    const csv = `name,type,sat_product_code,sat_unit_code,unit_name,price
Product 1,product,43211503,H87,Pieza,1000
Service 1,service,81112100,E48,Hora,1500`;

    const { rows, error } = parseCSV(csv);

    expect(error).toBeNull();
    expect(rows).toHaveLength(2);
    expect(rows[0].name).toBe('Product 1');
    expect(rows[0].type).toBe('product');
    expect(rows[1].name).toBe('Service 1');
    expect(rows[1].type).toBe('service');
  });

  it('should handle quoted values with commas', () => {
    const csv = `name,type,sat_product_code,sat_unit_code,unit_name,price,description
"Product, with comma",product,43211503,H87,Pieza,1000,"Description, with comma"`;

    const { rows, error } = parseCSV(csv);

    expect(error).toBeNull();
    expect(rows[0].name).toBe('Product, with comma');
    expect(rows[0].description).toBe('Description, with comma');
  });

  it('should handle escaped quotes', () => {
    const csv = `name,type,sat_product_code,sat_unit_code,unit_name,price
"Product ""Special""",product,43211503,H87,Pieza,1000`;

    const { rows, error } = parseCSV(csv);

    expect(error).toBeNull();
    expect(rows[0].name).toBe('Product "Special"');
  });

  it('should return error for missing header row', () => {
    const csv = `Product 1,product,43211503,H87,Pieza,1000`;

    const { rows, error } = parseCSV(csv);

    expect(error).not.toBeNull();
    expect(rows).toHaveLength(0);
  });

  it('should return error for missing required columns', () => {
    const csv = `name,type,price
Product 1,product,1000`;

    const { rows, error } = parseCSV(csv);

    expect(error).toContain('Missing required column');
  });

  it('should skip empty lines', () => {
    const csv = `name,type,sat_product_code,sat_unit_code,unit_name,price
Product 1,product,43211503,H87,Pieza,1000

Product 2,product,43211507,H87,Pieza,2000

`;

    const { rows, error } = parseCSV(csv);

    expect(error).toBeNull();
    expect(rows).toHaveLength(2);
  });

  it('should handle all CSV_HEADERS columns', () => {
    const headerRow = CSV_HEADERS.join(',');
    const dataRow = [
      'Test Product',      // name
      'Description here',  // description
      'product',           // type
      'PRD-001',          // sku
      '1234567890',       // barcode
      '43211503',         // sat_product_code
      'H87',              // sat_unit_code
      'Pieza',            // unit_name
      '1500.00',          // price
      'MXN',              // currency
      '02',               // tax_object
      '0.16',             // iva_rate
      'false',            // iva_exempt
      'Electronics',      // category
      '"laptop,computer"',  // tags (quoted because contains comma)
      'true',             // track_inventory
      '100',              // current_stock
      '10',               // min_stock
      'true',             // is_active
    ].join(',');

    const csv = `${headerRow}\n${dataRow}`;
    const { rows, error } = parseCSV(csv);

    expect(error).toBeNull();
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe('Test Product');
    expect(rows[0].tags).toBe('laptop,computer');
    expect(rows[0].track_inventory).toBe('true');
  });

  it('should handle whitespace in values', () => {
    const csv = `name,type,sat_product_code,sat_unit_code,unit_name,price
  Product 1  ,  product  ,43211503,H87,  Pieza  ,  1000  `;

    const { rows, error } = parseCSV(csv);

    expect(error).toBeNull();
    // Values should be trimmed
    expect(rows[0].name).toBe('Product 1');
    expect(rows[0].type).toBe('product');
  });
});

// ============================================================================
// CSV Generation
// ============================================================================

describe('productsToCSV', () => {
  const createTestProduct = (overrides: Partial<Product> = {}): Product => ({
    id: 'test-id',
    organization_id: 'org-id',
    name: 'Test Product',
    description: 'A test product',
    type: 'product',
    sku: 'PRD-001',
    barcode: '1234567890',
    sat_product_code: '43211503',
    sat_product_name: 'Computadoras portátiles',
    sat_unit_code: 'H87',
    sat_unit_name: 'Pieza',
    unit_name: 'Pieza',
    price: 1500,
    currency: 'MXN',
    tax_object: '02',
    iva_rate: 0.16,
    iva_exempt: false,
    iva_retention: false,
    isr_retention: false,
    track_inventory: true,
    current_stock: 100,
    min_stock: 10,
    max_stock: 500,
    category: 'Electronics',
    tags: ['laptop', 'computer'],
    is_active: true,
    created_at: new Date('2024-01-01'),
    updated_at: new Date('2024-01-15'),
    ...overrides,
  });

  it('should generate CSV with headers', () => {
    const products = [createTestProduct()];
    const csv = productsToCSV(products);
    const lines = csv.split('\n');

    expect(lines[0]).toContain('name');
    expect(lines[0]).toContain('price');
    expect(lines[0]).toContain('sat_product_code');
  });

  it('should include product data', () => {
    const products = [createTestProduct()];
    const csv = productsToCSV(products);
    const lines = csv.split('\n');

    expect(lines[1]).toContain('Test Product');
    expect(lines[1]).toContain('PRD-001');
    expect(lines[1]).toContain('1500');
  });

  it('should handle multiple products', () => {
    const products = [
      createTestProduct({ name: 'Product 1', sku: 'PRD-001' }),
      createTestProduct({ name: 'Product 2', sku: 'PRD-002' }),
      createTestProduct({ name: 'Product 3', sku: 'PRD-003' }),
    ];

    const csv = productsToCSV(products);
    const lines = csv.split('\n');

    expect(lines).toHaveLength(4); // Header + 3 products
    expect(lines[1]).toContain('Product 1');
    expect(lines[2]).toContain('Product 2');
    expect(lines[3]).toContain('Product 3');
  });

  it('should escape commas in values', () => {
    const products = [createTestProduct({ name: 'Product, with comma' })];
    const csv = productsToCSV(products);

    expect(csv).toContain('"Product, with comma"');
  });

  it('should escape quotes in values', () => {
    const products = [createTestProduct({ name: 'Product "Special"' })];
    const csv = productsToCSV(products);

    expect(csv).toContain('"Product ""Special"""');
  });

  it('should escape newlines in values', () => {
    const products = [createTestProduct({ description: 'Line 1\nLine 2' })];
    const csv = productsToCSV(products);

    expect(csv).toContain('"Line 1\nLine 2"');
  });

  it('should handle empty products array', () => {
    const csv = productsToCSV([]);
    const lines = csv.split('\n');

    expect(lines).toHaveLength(1); // Header only
  });

  it('should format tags as comma-separated', () => {
    const products = [createTestProduct({ tags: ['tag1', 'tag2', 'tag3'] })];
    const csv = productsToCSV(products);

    expect(csv).toContain('tag1,tag2,tag3');
  });

  it('should handle custom field selection', () => {
    const products = [createTestProduct()];
    const csv = productsToCSV(products, ['name', 'sku', 'price']);
    const lines = csv.split('\n');

    expect(lines[0]).toBe('name,sku,price');
    expect(lines[1]).toContain('Test Product');
    expect(lines[1]).toContain('PRD-001');
  });
});

// ============================================================================
// Import Preview
// ============================================================================

describe('getImportPreview', () => {
  it('should return correct counts for valid CSV', () => {
    const csv = `name,type,sat_product_code,sat_unit_code,unit_name,price
Product 1,product,43211503,H87,Pieza,1000
Product 2,product,43211507,H87,Pieza,2000
Service 1,service,81112100,E48,Hora,1500`;

    const preview = getImportPreview(csv);

    expect(preview.totalRows).toBe(3);
    expect(preview.validRows).toBe(3);
    expect(preview.invalidRows).toBe(0);
    expect(preview.productCount).toBe(2);
    expect(preview.serviceCount).toBe(1);
  });

  it('should count invalid rows', () => {
    const csv = `name,type,sat_product_code,sat_unit_code,unit_name,price
,product,43211503,H87,Pieza,1000
Product 2,invalid,43211507,H87,Pieza,2000
Product 3,product,43211503,H87,Pieza,invalid`;

    const preview = getImportPreview(csv);

    expect(preview.totalRows).toBe(3);
    expect(preview.validRows).toBe(0);
    expect(preview.invalidRows).toBe(3);
  });

  it('should handle empty CSV', () => {
    const preview = getImportPreview('');

    expect(preview.totalRows).toBe(0);
    expect(preview.validRows).toBe(0);
    expect(preview.invalidRows).toBe(0);
  });

  it('should handle CSV with only headers', () => {
    const csv = `name,type,sat_product_code,sat_unit_code,unit_name,price`;

    const preview = getImportPreview(csv);

    expect(preview.totalRows).toBe(0);
  });

  it('should handle mixed valid and invalid rows', () => {
    const csv = `name,type,sat_product_code,sat_unit_code,unit_name,price
Product 1,product,43211503,H87,Pieza,1000
,service,81112100,E48,Hora,1500
Product 3,product,43211507,H87,Pieza,2000`;

    const preview = getImportPreview(csv);

    expect(preview.totalRows).toBe(3);
    expect(preview.validRows).toBe(2);
    expect(preview.invalidRows).toBe(1);
    expect(preview.productCount).toBe(2);
    expect(preview.serviceCount).toBe(0);
  });
});

// ============================================================================
// Round-trip Tests
// ============================================================================

describe('CSV round-trip', () => {
  it('should produce parseable CSV from products', () => {
    const products: Product[] = [
      {
        id: '1',
        organization_id: 'org-1',
        name: 'Test Product',
        type: 'product',
        sku: 'PRD-001',
        sat_product_code: '43211503',
        sat_unit_code: 'H87',
        unit_name: 'Pieza',
        price: 1500,
        currency: 'MXN',
        tax_object: '02',
        iva_rate: 0.16,
        iva_exempt: false,
        iva_retention: false,
        isr_retention: false,
        track_inventory: true,
        current_stock: 100,
        tags: [],
        is_active: true,
        created_at: new Date(),
        updated_at: new Date(),
      },
    ];

    const csv = productsToCSV(products);
    const { rows, error } = parseCSV(csv);

    expect(error).toBeNull();
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe('Test Product');
    expect(rows[0].sku).toBe('PRD-001');
    expect(rows[0].price).toBe('1500');
  });
});
