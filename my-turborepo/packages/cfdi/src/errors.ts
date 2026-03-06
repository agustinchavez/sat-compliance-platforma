/**
 * CFDI Digital Signature Error Types (Component 14)
 *
 * Custom error class and types for CSD (Certificado de Sello Digital) operations.
 */

// ============================================
// ERROR CODE TYPES
// ============================================

export type CSDErrorCode =
  // Key loading errors
  | 'CSD_KEY_LOAD_ERROR'
  | 'CSD_PASSWORD_REQUIRED'
  | 'CSD_WRONG_PASSWORD'
  // Certificate errors
  | 'CSD_CERT_LOAD_ERROR'
  | 'CSD_CERT_EXPIRED'         // CSD001 - Certificate has expired
  | 'CSD_CERT_NOT_YET_VALID'   // CSD002 - Certificate not yet valid
  | 'CSD_NOT_A_CSD'            // CSD003 - Is a FIEL, not a CSD
  | 'CSD_RFC_MISMATCH'         // CSD004 - Cert RFC ≠ invoice issuer RFC
  | 'CSD_UNTRUSTED_ISSUER'     // CSD005 - Not issued by SAT
  | 'CSD_RFC_NOT_FOUND'        // RFC not parseable from cert subject
  // Signing errors
  | 'CSD_SIGN_ERROR'
  | 'CSD_VERIFY_FAILED'
  // XML injection errors
  | 'CSD_XML_INJECTION_ERROR'
  | 'CSD_XML_PLACEHOLDER_NOT_FOUND';

// ============================================
// CUSTOM ERROR CLASS
// ============================================

/**
 * Custom error class for CSD-related operations.
 * Extends Error with a specific error code for programmatic handling.
 */
export class CSDError extends Error {
  constructor(
    message: string,
    public readonly code: CSDErrorCode,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'CSDError';
    // Maintains proper stack trace for where error was thrown (V8 engines)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, CSDError);
    }
  }
}

// ============================================
// VALIDATION RESULT TYPES
// ============================================

/**
 * Result of validating a CSD certificate.
 * Collects all validation errors rather than short-circuiting on first error.
 */
export interface CSDValidationResult {
  valid: boolean;
  errors: Array<{ code: CSDErrorCode; message: string }>;
  certInfo?: CertificateInfo;
}

/**
 * Structured information extracted from a CSD certificate.
 * Used for audit logging and display purposes.
 */
export interface CertificateInfo {
  /** RFC extracted from the certificate subject (e.g., "EKU9003173C9") */
  rfc: string;
  /** Legal name from the CN field of the certificate subject */
  nombre: string;
  /** 20-character SAT certificate serial number */
  noCertificado: string;
  /** Certificate validity start date */
  validFrom: Date;
  /** Certificate validity end date */
  validTo: Date;
  /** Certificate issuer (should contain SAT) */
  issuer: string;
  /** Key algorithm (e.g., "RSA-2048") */
  keyAlgorithm: string;
}
