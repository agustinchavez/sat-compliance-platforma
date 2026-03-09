/**
 * PAC Integration Module (Component 15)
 *
 * This module provides PAC (Proveedor Autorizado de Certificación) integration
 * for CFDI 4.0 stamping and cancellation with SAT Mexico.
 *
 * Supported PAC providers:
 * - Finkok (SOAP API)
 * - SW Sapien (REST API)
 */

// ============================================
// TYPES
// ============================================

export type {
  PACProvider,
  PACEnvironment,
  CancelMotivo,
  PACCredentials,
  StampRequest,
  StampResult,
  CancelRequest,
  CancelResult,
  CFDIStatus,
  TFDData,
  InvoiceStamps,
} from './types';

export { PAC_ENDPOINTS } from './types';

// ============================================
// ERRORS
// ============================================

export { PACError, isRetryable, mapFinkokError, mapSWError } from './errors';
export type { PACErrorCode } from './errors';

// ============================================
// SERVICE
// ============================================

export {
  stampCFDI,
  cancelCFDI,
  queryStatus,
  isPACConfigured,
  getPACInfo,
  getPACCredentials,
  getPACProvider,
} from './service';

// ============================================
// TFD PARSER
// ============================================

export {
  extractTFD,
  getUUID,
  getSATCertNumber,
  getStampDate,
  getPACRfc,
  getSATSignature,
  getIssuerSignature,
  isValidTFDVersion,
  isValidUUID,
  hasTFD,
} from './tfd-parser';

// ============================================
// PROVIDERS (for advanced use only)
// ============================================

export { FinkokProvider } from './providers/finkok';
export { SWProvider } from './providers/sw';
export type { PACProviderInterface } from './providers/base';
