/**
 * Customer Service Types
 * Component 6: Customer Management for CFDI Invoicing
 */

// ============================================
// Core Customer Types
// ============================================

export interface Customer {
  id: string;
  organization_id: string;

  // Basic Information
  rfc: string; // RFC (unique within org)
  legal_name: string; // Razón social
  business_name?: string; // Nombre comercial (optional)
  email?: string;
  phone?: string;

  // Fiscal Information (SAT Requirements)
  tax_regime: string; // Régimen fiscal (SAT code: 601, 603, etc.)
  cfdi_use: string; // Uso de CFDI (SAT code: G01, G03, etc.)

  // Address
  address?: CustomerAddress;

  // SAT Integration Fields (Phase 2)
  sat_validated: boolean; // RFC validated with SAT
  last_sat_validation?: Date; // Last SAT validation timestamp
  sat_metadata?: SATMetadata; // SAT response data

  // Metadata
  notes?: string;
  tags: string[];
  is_active: boolean;

  // Timestamps
  created_at: Date;
  updated_at: Date;
  deleted_at?: Date;

  // Computed (not in DB, populated by joins/queries)
  invoices?: Invoice[]; // If includeInvoices option
  stats?: CustomerStats; // If includeStats option
}

export interface CustomerAddress {
  street: string; // Calle
  exterior_number: string; // Número exterior
  interior_number?: string; // Número interior (optional)
  colony: string; // Colonia
  locality?: string; // Localidad (optional)
  municipality?: string; // Municipio (optional)
  city: string; // Ciudad
  state: string; // Estado (2-letter code: CDMX, JAL, etc.)
  postal_code: string; // Código postal (5 digits)
  country: string; // País (default: "México")
}

export interface CustomerStats {
  total_invoices: number;
  total_invoiced: number; // Sum of all invoices
  pending_amount: number; // Unpaid invoices
  overdue_amount: number; // Past due invoices
  overdue_count: number;
  last_invoice_date?: Date;
  average_invoice_amount: number;
}

// ============================================
// Input/Output Types
// ============================================

export interface CreateCustomerInput {
  rfc: string;
  legal_name: string;
  business_name?: string;
  email?: string;
  phone?: string;
  tax_regime: string;
  cfdi_use: string;
  address?: CustomerAddress;
  notes?: string;
  tags?: string[];
  is_active?: boolean;
}

export interface UpdateCustomerInput {
  legal_name?: string;
  business_name?: string;
  email?: string;
  phone?: string;
  tax_regime?: string;
  cfdi_use?: string;
  address?: CustomerAddress;
  notes?: string;
  tags?: string[];
  is_active?: boolean;
}

export interface CustomerFilters {
  tax_regime?: string;
  cfdi_use?: string;
  is_active?: boolean;
  tags?: string[];
  search?: string; // Search in RFC, legal_name, business_name
  created_after?: Date;
  created_before?: Date;
  sat_validated?: boolean; // Phase 2: Filter by SAT validation status
}

export interface CustomerPagination {
  page: number;
  limit: number;
}

export interface CustomerSort {
  field: 'legal_name' | 'rfc' | 'created_at' | 'updated_at';
  order: 'asc' | 'desc';
}

export interface CustomerSearchOptions {
  tax_regime?: string;
  cfdi_use?: string;
  is_active?: boolean;
  tags?: string[];
  limit?: number;
  offset?: number;
  sort_by?: 'legal_name' | 'rfc' | 'created_at';
  sort_order?: 'asc' | 'desc';
}

export interface GetCustomerOptions {
  include_invoices?: boolean;
  include_stats?: boolean;
}

export interface ListCustomersResult {
  customers: Customer[];
  total: number;
  page: number;
  pages: number;
  limit: number;
}

export interface SearchCustomersResult {
  customers: Customer[];
  total: number;
  page: number;
  pages: number;
}

// ============================================
// Validation Types
// ============================================

export interface RFCValidation {
  valid: boolean;
  type?: 'legal_entity' | 'individual'; // Based on length (12 vs 13)
  formatted?: string; // Uppercase, no spaces
  error?: string; // Error message if invalid
  warnings?: string[]; // Non-blocking warnings
}

export interface AddressValidation {
  valid: boolean;
  errors: {
    street?: string;
    exterior_number?: string;
    colony?: string;
    city?: string;
    state?: string;
    postal_code?: string;
  };
}

export interface CustomerValidation {
  valid: boolean;
  errors: {
    rfc?: string;
    legal_name?: string;
    tax_regime?: string;
    cfdi_use?: string;
    email?: string;
    phone?: string;
    address?: AddressValidation;
  };
}

// ============================================
// SAT Integration Types (Phase 2)
// ============================================

export interface SATValidation {
  validated: boolean;
  source: 'local' | 'sat'; // Local format check or SAT API check
  timestamp: Date;
  rfc: string;
  legal_name?: string; // From SAT if available
  tax_regime?: string; // From SAT if available
  status?: 'active' | 'inactive' | 'suspended'; // From SAT if available
  error?: string;
}

export interface SATMetadata {
  validated_at?: Date;
  validation_source?: 'sat_soap' | 'sat_api';
  sat_legal_name?: string; // Official name from SAT
  sat_tax_regime?: string; // Official regime from SAT
  sat_status?: 'active' | 'inactive' | 'suspended';
  last_sync_at?: Date;
  sync_error?: string;
}

export interface EFirma {
  certificate_path: string; // Path to .cer file
  key_path: string; // Path to .key file
  password: string; // Decrypted password
}

export interface SATToken {
  token: string;
  expires_at: Date;
  rfc: string; // RFC this token is for
}

export interface CFDIDownloadRequest {
  rfc: string; // RFC to download CFDIs for
  date_from: Date;
  date_to: Date;
  request_type: 'emitidas' | 'recibidas'; // Issued or received
}

export interface CFDIDownloadResult {
  request_id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  package_ids?: string[];
  downloaded_count?: number;
  error?: string;
}

// ============================================
// SAT Catalog Types
// ============================================

export interface TaxRegime {
  code: string;
  name: string;
  description?: string;
  applicable_to: 'legal_entity' | 'individual' | 'both';
  is_active: boolean;
}

export interface CFDIUse {
  code: string;
  name: string;
  description?: string;
  applicable_to: 'legal_entity' | 'individual' | 'both';
  is_active: boolean;
  compatible_regimes?: string[]; // Optional: List of compatible tax regimes
}

export interface MexicanState {
  code: string; // 2-letter code (CDMX, JAL, etc.)
  name: string;
  postal_code_prefix?: string[]; // Optional: Common postal code prefixes
}

// ============================================
// Import/Export Types
// ============================================

export interface CustomerImportRow {
  rfc: string;
  legal_name: string;
  business_name?: string;
  email?: string;
  phone?: string;
  tax_regime: string;
  cfdi_use: string;
  // Address fields (flattened for CSV)
  street?: string;
  exterior_number?: string;
  interior_number?: string;
  colony?: string;
  city?: string;
  state?: string;
  postal_code?: string;
  country?: string;
  // Metadata
  notes?: string;
  tags?: string; // Comma-separated
  is_active?: string; // 'true' or 'false'
}

export interface CustomerImportResult {
  success: boolean;
  total_rows: number;
  imported_count: number;
  failed_count: number;
  skipped_count: number;
  errors: CustomerImportError[];
  imported_customers: Customer[];
}

export interface CustomerImportError {
  row_number: number;
  rfc?: string;
  errors: string[];
  data: CustomerImportRow;
}

export interface CustomerExportOptions {
  include_deleted?: boolean;
  filters?: CustomerFilters;
  format?: 'csv' | 'json';
}

// ============================================
// Invoice Type (Placeholder for Phase 2+)
// ============================================

export interface Invoice {
  id: string;
  customer_id: string;
  organization_id: string;
  folio: string;
  uuid?: string; // UUID from SAT after timbrado
  total: number;
  status: 'draft' | 'issued' | 'paid' | 'cancelled';
  issued_at?: Date;
  due_at?: Date;
  paid_at?: Date;
  created_at: Date;
  updated_at: Date;
}

// ============================================
// Bulk Operations Types
// ============================================

export interface BulkUpdateResult {
  success: boolean;
  updated_count: number;
  failed_count: number;
  errors: {
    customer_id: string;
    error: string;
  }[];
}

export interface BulkTagInput {
  customer_ids: string[];
  tags: string[];
  action: 'add' | 'remove' | 'replace';
}

export interface BulkStatusInput {
  customer_ids: string[];
  is_active: boolean;
}
