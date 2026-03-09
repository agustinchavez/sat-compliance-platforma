/**
 * PAC Integration Types (Component 15)
 *
 * Type definitions for PAC (Proveedor Autorizado de Certificación) integration.
 * These types support both Finkok (SOAP) and SW Sapien (REST) providers.
 */

// ============================================================================
// Provider & Environment Types
// ============================================================================

/**
 * Supported PAC providers
 * - finkok: Primary provider, SOAP-based
 * - sw: Secondary provider (SW Sapien), REST-based
 */
export type PACProvider = 'finkok' | 'sw';

/**
 * PAC environment
 * - sandbox: Test/demo environment
 * - production: Live environment
 */
export type PACEnvironment = 'sandbox' | 'production';

/**
 * Cancellation motivo codes (SAT-mandated since January 2022)
 * - 01: Comprobante emitido con errores con relación (requires folioSustitucion)
 * - 02: Comprobante emitido con errores sin relación
 * - 03: No se llevó a cabo la operación
 * - 04: Operación nominativa relacionada en una factura global
 */
export type CancelMotivo = '01' | '02' | '03' | '04';

// ============================================================================
// Credential Types
// ============================================================================

/**
 * PAC credentials for authentication
 */
export interface PACCredentials {
  /** PAC provider type */
  provider: PACProvider;
  /** Environment (sandbox/production) */
  environment: PACEnvironment;
  /** Finkok username */
  finkokUsername?: string;
  /** Finkok password */
  finkokPassword?: string;
  /** SW username (email) */
  swUsername?: string;
  /** SW password */
  swPassword?: string;
  /** SW pre-authenticated token (infinite or cached) */
  swToken?: string;
  /** SW token expiration time */
  swTokenExpiresAt?: Date;
}

/**
 * Encrypted PAC credentials stored in database
 */
export interface EncryptedPACCredentials {
  /** Provider type */
  provider: PACProvider;
  /** Environment */
  environment: PACEnvironment;
  /** Whether this is the primary PAC for the organization */
  isPrimary: boolean;
  /** Encrypted Finkok username (if applicable) */
  finkokUsernameEncrypted?: string;
  /** Encrypted Finkok password (if applicable) */
  finkokPasswordEncrypted?: string;
  /** Encrypted SW username (if applicable) */
  swUsernameEncrypted?: string;
  /** Encrypted SW password (if applicable) */
  swPasswordEncrypted?: string;
  /** Encrypted SW token (if applicable) */
  swTokenEncrypted?: string;
  /** SW token expiration */
  swTokenExpiresAt?: string;
  /** Encryption IV */
  iv: string;
  /** Encryption auth tag */
  authTag: string;
}

// ============================================================================
// Stamp Request/Response Types
// ============================================================================

/**
 * Request to stamp a CFDI
 */
export interface StampRequest {
  /** Complete pre-signed CFDI XML from Component 14 */
  signedXml: string;
  /** Organization RFC (issuer) - for logging and validation */
  issuerRfc: string;
  /** Organization ID for credential lookup */
  orgId: string;
}

/**
 * Result of a successful stamp operation
 */
export interface StampResult {
  /** Full CFDI XML with TFD complement injected */
  stampedXml: string;
  /** SAT Folio Fiscal (36-char UUID) */
  uuid: string;
  /** ISO timestamp from TFD (FechaTimbrado) */
  fechaTimbrado: string;
  /** PAC RFC (RfcProvCertif) */
  rfcProvCertif: string;
  /** Echo of issuer Sello (SelloCFD) */
  selloCFD: string;
  /** SAT certificate number (NoCertificadoSAT) */
  noCertificadoSAT: string;
  /** SAT signature (SelloSAT) */
  selloSAT: string;
  /** PAC provider that processed the stamp */
  pacProvider: PACProvider;
}

// ============================================================================
// Cancel Request/Response Types
// ============================================================================

/**
 * Request to cancel a stamped CFDI
 */
export interface CancelRequest {
  /** SAT Folio Fiscal (UUID) to cancel */
  uuid: string;
  /** Issuer RFC */
  issuerRfc: string;
  /** Cancellation reason code (01-04) */
  motivo: CancelMotivo;
  /** Replacement CFDI UUID (required when motivo === '01') */
  folioSustitucion?: string;
  /** Organization ID for credential/CSD lookup */
  orgId: string;
}

/**
 * Result of a cancel operation
 */
export interface CancelResult {
  /** The UUID that was cancelled */
  uuid: string;
  /** Status code from PAC (201=success, 202=already cancelled, etc.) */
  estatusUUID: string;
  /** Raw XML acuse from SAT */
  acuse: string;
  /** Whether cancellation was successful */
  cancelled: boolean;
  /** Optional status message from PAC */
  message?: string;
}

// ============================================================================
// TFD (Timbre Fiscal Digital) Types
// ============================================================================

/**
 * Parsed TFD (Timbre Fiscal Digital) data
 * All fields are extracted from tfd:TimbreFiscalDigital element
 */
export interface TFDData {
  /** SAT Folio Fiscal (RFC 4122 UUID) */
  uuid: string;
  /** Timestamp when PAC stamped the document */
  fechaTimbrado: string;
  /** PAC's RFC */
  rfcProvCertif: string;
  /** Echo of issuer's Sello (for verification) */
  selloCFD: string;
  /** SAT certificate number */
  noCertificadoSAT: string;
  /** SAT's signature */
  selloSAT: string;
  /** TFD version (should be "1.1" for CFDI 4.0) */
  version: string;
}

// ============================================================================
// Stamps JSONB Structure (stored in invoices.stamps)
// ============================================================================

/**
 * Structure stored in invoices.stamps JSONB column after successful stamping
 */
export interface InvoiceStamps {
  /** SAT Folio Fiscal */
  uuid: string;
  /** ISO timestamp from TFD */
  fechaTimbrado: string;
  /** PAC's RFC */
  rfcProvCertif: string;
  /** Echo of issuer Sello */
  selloCFD: string;
  /** SAT certificate number */
  noCertificadoSAT: string;
  /** SAT signature */
  selloSAT: string;
  /** Which PAC provider was used */
  pacProvider: PACProvider;
  /** ISO timestamp when we recorded the stamp */
  stampedAt: string;
  /** Cancellation data (if cancelled) */
  cancellation?: {
    /** Cancellation reason code */
    motivo: CancelMotivo;
    /** Replacement UUID (for motivo 01) */
    folioSustitucion?: string;
    /** Status from PAC */
    estatusUUID: string;
    /** Raw acuse XML */
    acuse: string;
    /** When we recorded the cancellation */
    cancelledAt: string;
  };
}

// ============================================================================
// PAC Environment Configuration
// ============================================================================

/**
 * PAC endpoint configuration
 */
export interface PACEndpoints {
  /** Stamp endpoint URL */
  stamp: string;
  /** Cancel endpoint URL */
  cancel: string;
  /** Status query endpoint URL */
  status?: string;
  /** Auth endpoint URL (SW only) */
  auth?: string;
}

/**
 * Get PAC endpoints for a provider and environment
 */
export const PAC_ENDPOINTS: Record<PACProvider, Record<PACEnvironment, PACEndpoints>> = {
  finkok: {
    sandbox: {
      stamp: 'https://demo-facturacion.finkok.com/servicios/soap/stamp',
      cancel: 'https://demo-facturacion.finkok.com/servicios/soap/cancel',
      status: 'https://demo-facturacion.finkok.com/servicios/soap/cancel',
    },
    production: {
      stamp: 'https://facturacion.finkok.com/servicios/soap/stamp',
      cancel: 'https://facturacion.finkok.com/servicios/soap/cancel',
      status: 'https://facturacion.finkok.com/servicios/soap/cancel',
    },
  },
  sw: {
    sandbox: {
      stamp: 'https://services.test.sw.com.mx/cfdi33/stamp/v4/',
      cancel: 'https://services.test.sw.com.mx/cfdi33',
      auth: 'https://services.test.sw.com.mx/v2/security/authenticate',
    },
    production: {
      stamp: 'https://services.sw.com.mx/cfdi33/stamp/v4/',
      cancel: 'https://services.sw.com.mx/cfdi33',
      auth: 'https://services.sw.com.mx/v2/security/authenticate',
    },
  },
};

// ============================================================================
// Status Query Types
// ============================================================================

/**
 * CFDI status from SAT perspective
 */
export type CFDIStatus = 'active' | 'cancelled' | 'unknown';

/**
 * Detailed status information from SAT
 */
export interface CFDIStatusDetail {
  /** Overall status */
  status: CFDIStatus;
  /** Whether the CFDI is cancellable */
  esCancelable?: string;
  /** Cancellation status if applicable */
  estatusCancelacion?: string;
  /** Raw response from provider */
  rawResponse?: unknown;
}
