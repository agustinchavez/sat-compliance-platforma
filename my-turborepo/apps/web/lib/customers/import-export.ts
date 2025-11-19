/**
 * Customer Import/Export Functions
 * Component 6: Customer Management
 *
 * Handles CSV import/export for customer data
 */

import type {
  Customer,
  CustomerImportRow,
  CustomerImportResult,
  CustomerImportError,
  CustomerExportOptions,
  CreateCustomerInput,
  CustomerAddress,
} from './types';
import { createCustomer } from './service';
import { validateCustomerData, formatRFC } from './validation';
import { parseTags } from './utils';

// ============================================
// CSV Export
// ============================================

/**
 * Export customers to CSV format
 */
export async function exportCustomersToCSV(
  customers: Customer[]
): Promise<string> {
  // CSV Headers
  const headers = [
    'RFC',
    'Legal Name',
    'Business Name',
    'Email',
    'Phone',
    'Tax Regime',
    'CFDI Use',
    'Street',
    'Exterior Number',
    'Interior Number',
    'Colony',
    'City',
    'State',
    'Postal Code',
    'Country',
    'Notes',
    'Tags',
    'Is Active',
    'SAT Validated',
    'Created At',
  ];

  // Convert customers to CSV rows
  const rows = customers.map((customer) => {
    const address = customer.address;

    return [
      customer.rfc,
      escapeCSV(customer.legal_name),
      escapeCSV(customer.business_name || ''),
      escapeCSV(customer.email || ''),
      escapeCSV(customer.phone || ''),
      customer.tax_regime,
      customer.cfdi_use,
      escapeCSV(address?.street || ''),
      escapeCSV(address?.exterior_number || ''),
      escapeCSV(address?.interior_number || ''),
      escapeCSV(address?.colony || ''),
      escapeCSV(address?.city || ''),
      escapeCSV(address?.state || ''),
      escapeCSV(address?.postal_code || ''),
      escapeCSV(address?.country || ''),
      escapeCSV(customer.notes || ''),
      escapeCSV(customer.tags.join(', ')),
      customer.is_active ? 'true' : 'false',
      customer.sat_validated ? 'true' : 'false',
      customer.created_at.toISOString(),
    ].join(',');
  });

  // Combine headers and rows
  return [headers.join(','), ...rows].join('\n');
}

/**
 * Escape CSV value (handle commas, quotes, newlines)
 */
function escapeCSV(value: string): string {
  if (!value) return '';

  // If value contains comma, quote, or newline, wrap in quotes
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    // Escape double quotes by doubling them
    return `"${value.replace(/"/g, '""')}"`;
  }

  return value;
}

/**
 * Generate CSV filename
 */
export function generateCSVFilename(organizationName: string): string {
  const date = new Date().toISOString().split('T')[0];
  const sanitizedName = organizationName
    .replace(/[^a-z0-9]/gi, '_')
    .toLowerCase();
  return `customers_${sanitizedName}_${date}.csv`;
}

// ============================================
// CSV Import
// ============================================

/**
 * Import customers from CSV file
 */
export async function importCustomersFromCSV(
  csvContent: string,
  organizationId: string
): Promise<CustomerImportResult> {
  const lines = csvContent.split('\n').filter((line) => line.trim().length > 0);

  if (lines.length === 0) {
    return {
      success: false,
      total_rows: 0,
      imported_count: 0,
      failed_count: 0,
      skipped_count: 0,
      errors: [{ row_number: 0, errors: ['Empty CSV file'], data: {} as any }],
      imported_customers: [],
    };
  }

  // Parse headers
  const headers = parseCSVRow(lines[0]);
  const headerValidation = validateCSVHeaders(headers);

  if (!headerValidation.valid) {
    return {
      success: false,
      total_rows: 0,
      imported_count: 0,
      failed_count: 0,
      skipped_count: 0,
      errors: [
        {
          row_number: 0,
          errors: headerValidation.errors,
          data: {} as any,
        },
      ],
      imported_customers: [],
    };
  }

  // Parse data rows
  const dataRows = lines.slice(1);
  const total_rows = dataRows.length;
  let imported_count = 0;
  let failed_count = 0;
  let skipped_count = 0;
  const errors: CustomerImportError[] = [];
  const imported_customers: Customer[] = [];

  for (let i = 0; i < dataRows.length; i++) {
    const rowNumber = i + 2; // +2 because: 1-indexed and skip header
    const line = dataRows[i];

    try {
      // Parse CSV row
      const values = parseCSVRow(line);
      const rowData = parseCSVRowToCustomer(headers, values);

      // Skip empty rows
      if (!rowData.rfc || rowData.rfc.trim().length === 0) {
        skipped_count++;
        continue;
      }

      // Create customer input
      const customerInput: CreateCustomerInput = {
        rfc: rowData.rfc,
        legal_name: rowData.legal_name,
        business_name: rowData.business_name || undefined,
        email: rowData.email || undefined,
        phone: rowData.phone || undefined,
        tax_regime: rowData.tax_regime,
        cfdi_use: rowData.cfdi_use || 'G03', // Default to G03
        notes: rowData.notes || undefined,
        tags: rowData.tags ? parseTags(rowData.tags) : [],
        is_active: rowData.is_active === 'true' || rowData.is_active === '1',
      };

      // Add address if present
      if (rowData.street || rowData.postal_code) {
        customerInput.address = {
          street: rowData.street || '',
          exterior_number: rowData.exterior_number || '',
          interior_number: rowData.interior_number,
          colony: rowData.colony || '',
          city: rowData.city || '',
          state: rowData.state || '',
          postal_code: rowData.postal_code || '',
          country: rowData.country || 'México',
        };
      }

      // Validate customer data
      const validation = validateCustomerData(customerInput);
      if (!validation.valid) {
        const errorMessages = Object.entries(validation.errors).map(
          ([field, error]) => {
            if (typeof error === 'string') {
              return `${field}: ${error}`;
            } else {
              return `${field}: Invalid`;
            }
          }
        );

        errors.push({
          row_number: rowNumber,
          rfc: rowData.rfc,
          errors: errorMessages,
          data: rowData,
        });
        failed_count++;
        continue;
      }

      // Create customer
      try {
        const customer = await createCustomer(organizationId, customerInput);
        imported_customers.push(customer);
        imported_count++;
      } catch (error) {
        errors.push({
          row_number: rowNumber,
          rfc: rowData.rfc,
          errors: [
            error instanceof Error
              ? error.message
              : 'Failed to create customer',
          ],
          data: rowData,
        });
        failed_count++;
      }
    } catch (error) {
      errors.push({
        row_number: rowNumber,
        errors: [
          error instanceof Error
            ? error.message
            : 'Failed to parse row',
        ],
        data: {} as any,
      });
      failed_count++;
    }
  }

  return {
    success: imported_count > 0,
    total_rows,
    imported_count,
    failed_count,
    skipped_count,
    errors,
    imported_customers,
  };
}

/**
 * Parse CSV row (handle quoted values)
 */
function parseCSVRow(row: string): string[] {
  const values: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < row.length; i++) {
    const char = row[i];

    if (char === '"') {
      // Check if it's an escaped quote
      if (inQuotes && row[i + 1] === '"') {
        current += '"';
        i++; // Skip next quote
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

  // Add last value
  values.push(current.trim());

  return values;
}

/**
 * Parse CSV row into CustomerImportRow object
 */
function parseCSVRowToCustomer(
  headers: string[],
  values: string[]
): CustomerImportRow {
  const row: any = {};

  headers.forEach((header, index) => {
    const value = values[index] || '';
    const key = header.toLowerCase().replace(/\s+/g, '_');

    row[key] = value;
  });

  return {
    rfc: row.rfc || '',
    legal_name: row.legal_name || '',
    business_name: row.business_name,
    email: row.email,
    phone: row.phone,
    tax_regime: row.tax_regime || '',
    cfdi_use: row.cfdi_use || 'G03',
    street: row.street,
    exterior_number: row.exterior_number,
    interior_number: row.interior_number,
    colony: row.colony,
    city: row.city,
    state: row.state,
    postal_code: row.postal_code,
    country: row.country || 'México',
    notes: row.notes,
    tags: row.tags,
    is_active: row.is_active,
  };
}

/**
 * Validate CSV headers
 */
export function validateCSVHeaders(
  headers: string[]
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Required headers
  const requiredHeaders = ['rfc', 'legal_name', 'tax_regime'];

  const normalizedHeaders = headers.map((h) =>
    h.toLowerCase().replace(/\s+/g, '_')
  );

  for (const required of requiredHeaders) {
    if (!normalizedHeaders.includes(required)) {
      errors.push(`Missing required header: ${required}`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Generate import report text
 */
export function generateImportReport(
  result: CustomerImportResult
): string {
  const lines: string[] = [];

  lines.push('=== Customer Import Report ===');
  lines.push('');
  lines.push(`Total Rows: ${result.total_rows}`);
  lines.push(`Imported: ${result.imported_count}`);
  lines.push(`Failed: ${result.failed_count}`);
  lines.push(`Skipped: ${result.skipped_count}`);
  lines.push('');

  if (result.errors.length > 0) {
    lines.push('=== Errors ===');
    result.errors.forEach((error) => {
      lines.push(`Row ${error.row_number}: ${error.rfc || 'N/A'}`);
      error.errors.forEach((err) => {
        lines.push(`  - ${err}`);
      });
    });
  }

  return lines.join('\n');
}

// ============================================
// JSON Export
// ============================================

/**
 * Export customers to JSON format
 */
export async function exportCustomersToJSON(
  customers: Customer[]
): Promise<string> {
  return JSON.stringify(customers, null, 2);
}

/**
 * Generate export data based on format
 */
export async function exportCustomers(
  customers: Customer[],
  format: 'csv' | 'json' = 'csv'
): Promise<{ content: string; filename: string; mimeType: string }> {
  if (format === 'json') {
    return {
      content: await exportCustomersToJSON(customers),
      filename: `customers_${new Date().toISOString().split('T')[0]}.json`,
      mimeType: 'application/json',
    };
  }

  return {
    content: await exportCustomersToCSV(customers),
    filename: `customers_${new Date().toISOString().split('T')[0]}.csv`,
    mimeType: 'text/csv',
  };
}
