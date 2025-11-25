/**
 * SAT Integration Module
 *
 * This module provides comprehensive integration with Mexico's SAT
 * (Servicio de Administración Tributaria) web services for:
 * - FIEL (e.firma) digital signature management
 * - SOAP authentication with SAT
 * - RFC validation
 * - CFDI (electronic invoice) download and parsing
 * - CFDI reconciliation with internal invoices
 * - Background job processing
 *
 * @module sat
 *
 * @example
 * ```ts
 * import {
 *   authenticateWithSAT,
 *   validateRFC,
 *   requestCFDIDownload,
 *   parseCFDI,
 *   reconcileCFDI,
 * } from '@/lib/sat';
 *
 * // Authenticate with SAT
 * const auth = await authenticateWithSAT('org-uuid', 'fiel-password');
 *
 * // Validate an RFC
 * const validation = await validateRFC('ABC120101ABC');
 *
 * // Download CFDIs
 * const download = await requestCFDIDownload({
 *   organizationId: 'org-uuid',
 *   type: 'received',
 *   dateStart: new Date('2024-01-01'),
 *   dateEnd: new Date('2024-12-31'),
 * }, 'fiel-password');
 * ```
 */

// ============================================================================
// Types - Export all type definitions
// ============================================================================

export type {
  // FIEL types
  FIELCredentials,
  FIELInfo,
  DecryptedFIEL,

  // Auth types
  SATAuthToken,
  SATAuthRequest,
  SATAuthResponse,

  // SOAP types
  SOAPRequest,
  SOAPResponse,
  SOAPEnvelope,

  // CFDI Download types
  CFDIDownloadType,
  CFDIRequestType,
  CFDIDownloadStatus,
  CFDIDownloadRequest,
  CFDIDownloadResponse,
  CFDIDownloadStatusResponse,
  CFDIPackage,

  // CFDI Parsing types
  CFDIVersion,
  TipoComprobante,
  ParsedCFDI,
  CFDIEmisor,
  CFDIReceptor,
  CFDIConcepto,
  CFDIImpuestos,
  CFDITraslado,
  CFDIRetencion,
  CFDITimbreFiscal,

  // Reconciliation types
  ReconciliationResult,
  ReconciliationDifference,
  ReconciliationReport,

  // Request tracking types
  SATRequestType,
  SATRequestStatus,
  SATRequestLog,
  DownloadedCFDI,

  // Config types
  SATConfig,
  CacheEntry,
} from './types';

// Error classes
export {
  SATError,
  SATAuthenticationError,
  SATCertificateError,
  SATSOAPError,
  SATRateLimitError,
} from './types';

// Constants
export { SAT_ENDPOINTS } from './types';

// ============================================================================
// Authentication - FIEL and SAT authentication
// ============================================================================

export {
  // Main authentication functions
  authenticateWithSAT,
  getSATToken,
  refreshSATToken,
  invalidateSATToken,
  getTokenTTL,

  // Status functions
  checkAuthenticationStatus,
  getAuthenticationHistory,
} from './authentication';

// ============================================================================
// FIEL - E.firma certificate management
// ============================================================================

export {
  loadFIEL,
  loadAndDecryptFIEL,
  createAuthenticationSignature,
  getCertificateBase64,
  validateCertificateExpiry,
  signXML,
  verifyXMLSignature,
  checkCertificateRenewal,
  getFIELInfo,
  validateFIELReady,
} from './fiel';

// ============================================================================
// RFC Validation
// ============================================================================

export {
  // Main validation functions
  validateRFC,
  batchValidateRFCs,
  getRFCStatus,

  // Cache functions
  getCachedValidation,
  cacheValidation,
  invalidateCachedValidation,

  // Customer integration
  validateCustomerRFC,
  validateAllCustomerRFCs,

  // Revalidation scheduling
  getCustomersNeedingRevalidation,
  scheduleRFCRevalidation,
  scheduleAllRevalidations,

  // Statistics
  getRFCValidationStats,
  trackValidationRequest,

  // Types
  type RFCStatus,
  type RFCValidationResult,
  type BatchValidationResult,
} from './rfc-validation';

// ============================================================================
// CFDI Download
// ============================================================================

export {
  // Main download functions
  requestCFDIDownload,
  checkDownloadStatus,
  downloadCFDIPackage,
  waitAndDownload,

  // History and statistics
  getDownloadHistory,
  getDownloadStats,
} from './cfdi-download';

// ============================================================================
// CFDI Parsing
// ============================================================================

export {
  // Main parsing functions
  parseCFDI,
  parseCFDIsFromZip,
  extractUUID,

  // Validation
  validateCFDIStructure,

  // Helpers
  cfdiToJSON,
  getCFDISummary,
} from './cfdi-parser';

// ============================================================================
// Reconciliation
// ============================================================================

export {
  // Main reconciliation functions
  reconcileCFDI,
  reconcileAllCFDIs,

  // Reports
  getReconciliationReport,
  getReconciliationSummary,

  // Database operations
  linkInvoiceToCFDI,
  getUnmatchedCFDIs,
  getInvoicesWithoutCFDI,

  // Batch operations
  processCFDIPackage,

  // Types
  type Invoice,
  type ReconciliationSummary,
} from './reconciliation';

// ============================================================================
// Background Jobs
// ============================================================================

export {
  // Queue functions
  queueCFDIDownload,
  queueRFCValidation,
  queueBatchRFCValidation,
  queueReconciliation,
  scheduleCertificateExpiryCheck,

  // Processing
  processJobs,
  processJob,

  // Management
  getJobStatus,
  getPendingJobs,
  cancelJob,
  retryJob,
  cleanupOldJobs,
  getJobRateLimitStatus,

  // Types
  type SATJobType,
  type JobStatus,
  type SATJob,
  type JobResult,
} from './jobs';

// ============================================================================
// SOAP Client
// ============================================================================

export {
  createSOAPClient,
  sendSOAPRequest,
  buildSOAPEnvelope,
  parseSOAPResponse,
  extractSOAPValue,
  isSOAPSuccess,

  // Request builders
  buildAuthenticationBody,
  buildDownloadRequestBody,
  buildVerificationRequestBody,
  buildPackageDownloadBody,
} from './soap-client';

// ============================================================================
// Cache
// ============================================================================

export {
  // Auth token cache
  cacheAuthToken,
  getCachedAuthToken,
  invalidateAuthToken,

  // Rate limiting
  incrementRateLimit,
  getRateLimitCount,
  isRateLimitExceeded,
  getRateLimitStatus,
  resetRateLimit,

  // Download status cache
  cacheDownloadStatus,
  getCachedDownloadStatus,
  invalidateDownloadStatus,

  // Certificate cache
  cacheCertificateInfo,
  getCachedCertificateInfo,
  invalidateCertificateInfo,

  // Management
  clearOrganizationCache,
  clearAllSATCaches,
  getCacheStats,
  checkCacheHealth,
} from './cache';

// ============================================================================
// SAT Status Codes
// ============================================================================

export {
  SAT_STATUS_CODES,
  SAT_SUCCESS_CODES,
  SAT_AUTH_ERROR_CODES,
  SAT_REQUEST_ERROR_CODES,
  SAT_VALIDATION_ERROR_CODES,
  SAT_DOWNLOAD_ERROR_CODES,
  SAT_RETRYABLE_CODES,
  SAT_NO_DATA_CODES,
  SAT_RATE_LIMIT_CODES,

  // Helper functions
  getSATStatusMessage,
  isSATSuccessCode,
  isSATErrorCode,
  isSATAuthError,
  isSATRetryable,
  isSATNoData,
  isSATRateLimit,
  isRateLimitCode,
  isDownloadSuccessCode,
  isDownloadReadyCode,
  isDownloadProcessingCode,
  getSATErrorCategory,
  getSATErrorAction,
  formatSATError,
  handleSATErrorCode,
  getSATErrorSeverity,

  // Statistics
  createEmptyErrorStats,
  recordSATError,
  type SATStatusCode,
  type ErrorSeverity,
  type SATErrorStats,
} from './sat-codes';

// ============================================================================
// Utilities
// ============================================================================

export {
  // Date formatting
  formatSATDate,
  parseSATDate,

  // Request IDs
  generateRequestId,
  generatePackageId,

  // Base64
  toBase64,
  fromBase64,

  // RFC validation
  isValidRFCFormat,
  validateRFCFormat,
  calculateRFCChecksum,
  validateRFCChecksum,

  // Rate limiting
  getRateLimitKey,
  calculateRateLimitReset,
  getRateLimitTTL,

  // Logging
  logSATRequest,
  type SATRequestLogEntry,

  // Error handling
  isRetryableError,
  calculateBackoffDelay,
  sleep,

  // XML utilities
  escapeXML,
  unescapeXML,
  extractXMLValue,
  extractXMLAttribute,

  // Certificate utilities
  derToPem,
  pemToDer,

  // File utilities
  getFileExtension,
  generateCFDIStoragePath,

  // Validation
  isValidUUID,
  isValidDateRange,
  daysDifference,
} from './utils';
