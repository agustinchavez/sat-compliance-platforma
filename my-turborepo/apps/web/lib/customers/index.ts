/**
 * Customer Service - Public API
 * Component 6: Customer Management
 *
 * Central export point for all customer-related functionality
 */

// ============================================
// Types
// ============================================

export type {
  // Core Types
  Customer,
  CustomerAddress,
  CustomerStats,

  // Input/Output Types
  CreateCustomerInput,
  UpdateCustomerInput,
  CustomerFilters,
  CustomerPagination,
  CustomerSort,
  CustomerSearchOptions,
  GetCustomerOptions,
  ListCustomersResult,
  SearchCustomersResult,

  // Validation Types
  RFCValidation,
  AddressValidation,
  CustomerValidation,

  // SAT Integration Types (Phase 2)
  SATValidation,
  SATMetadata,
  EFirma,
  SATToken,
  CFDIDownloadRequest,
  CFDIDownloadResult,

  // SAT Catalog Types
  TaxRegime,
  CFDIUse,
  MexicanState,

  // Import/Export Types
  CustomerImportRow,
  CustomerImportResult,
  CustomerImportError,
  CustomerExportOptions,

  // Bulk Operations Types
  BulkUpdateResult,
  BulkTagInput,
  BulkStatusInput,
} from './types';

// ============================================
// Service Functions
// ============================================

export {
  // CRUD Operations
  createCustomer,
  updateCustomer,
  getCustomer,
  getCustomerByRFC,
  deleteCustomer,
  restoreCustomer,
  permanentlyDeleteCustomer,

  // List and Search Operations
  listCustomers,
  searchCustomers,
  countCustomers,
  getActiveCustomers,

  // Validation Operations
  customerExistsByRFC,
  validateCustomerRFC,

  // Bulk Operations
  bulkUpdateCustomers,
  bulkTagCustomers,
  bulkUpdateCustomerStatus,

  // Statistics and Analytics
  getCustomerStats,
  getCustomerInvoices,

  // SAT Integration (Phase 2)
  validateCustomerWithSAT,
  syncCustomerFromSAT,
} from './service';

// ============================================
// Validation Functions
// ============================================

export {
  // RFC Validation
  formatRFC,
  getRFCType,
  validateRFC,
  validateRFCFormat,
  validateRFCWithSAT,

  // Address Validation
  validateAddress,
  validatePostalCode,
  validateStateCode,

  // Email and Phone Validation
  validateEmail,
  validatePhone,

  // Customer Data Validation
  validateCustomerData,
  validateCustomerUpdateData,
  validateRFCTaxRegimeCompatibility,
} from './validation';

// ============================================
// SAT Catalogs
// ============================================

export {
  // Constants
  TAX_REGIMES,
  CFDI_USES,
  MEXICAN_STATES,
  SPECIAL_RFCS,
  RFC_FORBIDDEN_WORDS,

  // Helper Functions
  getTaxRegimes,
  getTaxRegimeInfo,
  getTaxRegimesForType,
  isValidTaxRegime,
  getCFDIUses,
  getCFDIUseInfo,
  getCFDIUsesForType,
  isValidCFDIUse,
  getMexicanStates,
  getStateInfo,
  isValidStateCode,
  getStateByPostalCode,
  suggestTaxRegime,
  suggestCFDIUse,
} from './sat-catalogs';

// ============================================
// Utility Functions
// ============================================

export {
  // Display Name Functions
  getCustomerDisplayName,
  formatCustomerName,
  getCustomerShortName,

  // Address Formatting
  formatAddressSingleLine,
  formatAddressMultiLine,
  formatAddressForCFDI,

  // RFC Formatting
  formatRFCWithHyphen,
  maskRFC,

  // Phone Formatting
  formatPhone,

  // Tag Management
  mergeTags,
  removeTags,
  formatTags,
  parseTags,

  // Sorting and Filtering
  sortCustomers,
  filterCustomers,

  // Export Helpers
  generateCustomerExportFilename,

  // Status Helpers
  getCustomerStatusDisplay,
  canIssueInvoice,

  // Search Helpers
  highlightSearchTerm,

  // Validation Helpers
  isCustomerDataComplete,
  getMissingFields,
} from './utils';

// ============================================
// Import/Export Functions
// ============================================

export {
  // CSV Export
  exportCustomersToCSV,
  generateCSVFilename,

  // CSV Import
  importCustomersFromCSV,
  validateCSVHeaders,
  generateImportReport,

  // JSON Export
  exportCustomersToJSON,

  // Generic Export
  exportCustomers,
} from './import-export';
