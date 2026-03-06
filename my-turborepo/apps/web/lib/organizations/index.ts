/**
 * Organization Service - Public API
 *
 * This file exports all public functions and types from the organization service.
 * Import from this file to use organization management functionality.
 *
 * @example
 * ```ts
 * import {
 *   getOrganization,
 *   updateOrganization,
 *   uploadCertificates,
 *   configurePAC,
 *   getSettings
 * } from '@/lib/organizations';
 * ```
 */

// ============================================================================
// Type Exports
// ============================================================================

export type {
  // Core types
  Organization,
  OrganizationAddress,
  OrganizationUpdateData,
  OrganizationSetupStatus,
  OrganizationStats,

  // Subscription types
  SubscriptionPlan,
  SubscriptionStatus,

  // Certificate types
  CertificateFiles,
  CertificateInfo,
  CertificateUploadResult,
  CertificateValidationResult,
  CertificateStatus,
  CertificateStorageMetadata,

  // PAC types
  PACConfig,
  PACProvider,
  PACEnvironment,
  PACConnectionTestResult,
  PACCredentials,
  EncryptedPACConfig,

  // Settings types
  OrganizationSettings,
  InvoiceSettings,
  NotificationSettings,
  UISettings,
  AdvancedSettings,

  // Validation types
  RFCValidationResult,
  AddressValidationResult,
  ValidationResult,

  // Storage types
  CertificateStorageKeys,

  // Encryption types
  EncryptedData,

  // Error types
  OrganizationError,
  OrganizationErrorCode,
} from './types';

// Export default settings constant
export { DEFAULT_ORGANIZATION_SETTINGS } from './types';

// ============================================================================
// Service Exports - Organization CRUD
// ============================================================================

export {
  // Read operations
  getOrganization,
  getOrganizationByRFC,
  listOrganizations,

  // Update operations
  updateOrganization,
  updateOrganizationAddress,

  // Delete operations
  deleteOrganization,
  restoreOrganization,

  // Status & validation
  validateOrganizationSetup,
  getOrganizationStats,

  // Utility functions
  isOrganizationActive,
  canGenerateInvoices,
  getOrganizationDisplayName,
} from './service';

// ============================================================================
// Validation Exports
// ============================================================================

export {
  // RFC validation
  validateRFC,
  formatRFC,

  // Address validation
  validateAddress,
  formatAddress,

  // Tax regime validation
  validateTaxRegime,

  // Email & phone validation
  validateEmail,
  validatePhone,

  // Certificate validation
  validateCertificateFiles,
  validateCertificateSerialNumber,

  // PAC validation
  validatePACConfig,
  validatePACProvider,

  // Organization data validation
  validateOrganizationData,
} from './validation';

// ============================================================================
// Certificate Exports
// ============================================================================

export {
  // Upload & validation
  uploadCertificates,
  validateCertificates,

  // Certificate parsing
  parseCertificate,
  extractCertificateDetails,

  // Retrieval
  getCertificateInfo,
  checkCertificateExpiration,
  getOrganizationCSD, // Component 14 integration

  // Deletion
  deleteCertificates,

  // Utilities
  formatSerialNumber,
  getCertificateStatusText,
} from './certificates';

export type { OrganizationCSDResult } from './certificates';

// ============================================================================
// PAC Exports
// ============================================================================

export {
  // Configuration
  configurePAC,
  getPACConfig,

  // Testing
  testPACConnection,

  // Management
  switchPACProvider,
  removePACConfig,

  // Utilities
  getPACProviderName,
  getPACEndpoint,
  isPACConfigured,
} from './pac';

// ============================================================================
// Settings Exports
// ============================================================================

export {
  // Settings retrieval
  getSettings,
  getDefaultSettings,

  // Settings update
  updateSettings,
  resetSettings,

  // Specific setting updates
  updateInvoiceSettings,
  updateNotificationSettings,
  updateUISettings,
  updateAdvancedSettings,

  // Validation
  validateSettings,

  // Utilities
  getSetting,
  setSetting,
  exportSettings,
  importSettings,
} from './settings';

// ============================================================================
// Storage Exports
// ============================================================================

export {
  // Storage keys
  getCertificateStorageKeys,
  getStorageKey,

  // Upload operations
  uploadToStorage,
  uploadCertificateFiles,

  // Download operations
  downloadFromStorage,
  downloadCertificateFiles,
  downloadCertificateMetadata,

  // Delete operations
  deleteFromStorage,
  deleteCertificateFiles,

  // Utility operations
  fileExists,
  certificateFilesExist,
  getFileSize,

  // Health & testing
  testStorageConnection,
  getStorageInfo,
} from './storage';

// ============================================================================
// Encryption Exports
// ============================================================================

export {
  // Key generation
  generateEncryptionKey,

  // AES-256-GCM encryption
  encryptData,
  decryptData,

  // Certificate encryption
  encryptPrivateKey,
  decryptPrivateKey,
  encryptCertificate,
  decryptCertificate,

  // PAC credentials encryption
  encryptPACCredentials,
  decryptPACCredentials,

  // Password hashing
  hashPassword,
  verifyPassword,

  // Utilities
  generateIV,
  isValidEncryptedData,
  computeHash,
  computeHMAC,
  generateSecureToken,
  secureCompare,

  // Testing
  checkEncryptionConfig,
  testEncryption,
} from './encryption';

// ============================================================================
// Utility Exports
// ============================================================================

export {
  // Formatting
  getOrganizationAddress,
  getOrganizationRFC,

  // Status checks
  hasCertificates,
  hasPACConfigured,
  hasCompleteAddress,
  getSetupProgress,
  getMissingSetupSteps,

  // Subscription helpers
  isPaidPlan,
  hasActiveSubscription,
  getPlanDisplayName,

  // Date & time
  formatDate,
  formatDateTime,
  getRelativeTime,

  // Data sanitization
  sanitizeOrganization,

  // Search & filter
  searchOrganizations,
  filterByPlan,
  filterActive,

  // Sorting
  sortByCreatedAt,
  sortByName,

  // Audit logging
  logOrganizationChange,
} from './utils';
