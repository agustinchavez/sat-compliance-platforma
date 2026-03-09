/**
 * PAC Error Handling (Component 15 - Step 2)
 *
 * Error types and mapping functions for PAC integration.
 * Includes error codes from both Finkok (SOAP) and SW Sapien (REST) providers.
 */

// ============================================================================
// Error Code Types
// ============================================================================

/**
 * PAC-specific error codes
 */
export type PACErrorCode =
  // Stamp errors
  | 'PAC_STAMP_DUPLICATE'        // Code 307 - already stamped
  | 'PAC_INVALID_XML'            // Code 705 - XML structure invalid
  | 'PAC_CERT_NOT_FROM_SAT'      // Code 308 - certificate not from SAT
  | 'PAC_FECHA_OUT_OF_RANGE'     // Code 401 - date outside valid range
  | 'PAC_RFC_NOT_REGISTERED'     // Code 402/702 - RFC not registered
  | 'PAC_ACCOUNT_SUSPENDED'      // Code 703 - PAC account suspended
  | 'PAC_WRONG_PASSWORD'         // Code 704 - wrong CSD password
  // Network errors
  | 'PAC_NETWORK_ERROR'          // Connection/timeout
  | 'PAC_TIMEOUT'                // Request timeout
  // Auth errors
  | 'PAC_AUTH_FAILED'            // SW token auth failure
  | 'PAC_CREDENTIALS_NOT_FOUND'  // No PAC credentials configured
  // Validation errors
  | 'PAC_INVALID_REQUEST'        // Invalid request parameters
  // TFD errors
  | 'TFD_PARSE_ERROR'            // Could not extract TFD from stamped XML
  | 'TFD_MISSING'                // Stamped XML has no TFD complement
  // Cancel errors
  | 'CANCEL_UUID_NOT_FOUND'      // Code 205 - UUID not found
  | 'CANCEL_RFC_MISMATCH'        // Code 203 - RFC mismatch
  | 'CANCEL_ALREADY_CANCELLED'   // Code 202 - already cancelled
  | 'CANCEL_REQUIRES_FOLIO_SUSTITUCION' // Motivo 01 missing replacement UUID
  // General
  | 'PAC_UNKNOWN_ERROR';

// ============================================================================
// Error Class
// ============================================================================

/**
 * Custom error class for PAC operations
 */
export class PACError extends Error {
  public readonly name = 'PACError';

  constructor(
    /** Error code for programmatic handling */
    public readonly code: PACErrorCode,
    /** Human-readable message */
    message: string,
    /** Whether this error is retryable */
    public readonly retryable: boolean = false,
    /** Original error that caused this (if any) */
    public readonly originalError?: unknown,
  ) {
    super(message);
    // Ensure proper prototype chain for instanceof checks
    Object.setPrototypeOf(this, PACError.prototype);
  }

  /**
   * Create a JSON-serializable representation
   */
  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      retryable: this.retryable,
      originalError: this.originalError instanceof Error
        ? { name: this.originalError.name, message: this.originalError.message }
        : this.originalError,
    };
  }
}

// ============================================================================
// Retry Logic
// ============================================================================

/**
 * Check if an error is retryable
 * @param error - Error to check
 * @returns true if the error can be retried
 */
export function isRetryable(error: unknown): boolean {
  // PACError with explicit retryable flag
  if (error instanceof PACError) {
    return error.retryable;
  }

  // Network errors are generally retryable
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    return (
      message.includes('econnrefused') ||
      message.includes('etimedout') ||
      message.includes('enotfound') ||
      message.includes('econnreset') ||
      message.includes('socket hang up') ||
      message.includes('network') ||
      message.includes('timeout') ||
      message.includes('fetch failed')
    );
  }

  return false;
}

/**
 * Check if an error indicates a duplicate stamp (idempotent success)
 * @param error - Error to check
 * @returns true if this is a "already stamped" condition
 */
export function isDuplicateStamp(error: unknown): boolean {
  return error instanceof PACError && error.code === 'PAC_STAMP_DUPLICATE';
}

// ============================================================================
// Finkok Error Mapping
// ============================================================================

/**
 * Known Finkok error codes and their meanings
 */
export const FINKOK_ERROR_CODES: Record<string, { code: PACErrorCode; retryable: boolean }> = {
  '307': { code: 'PAC_STAMP_DUPLICATE', retryable: false },
  '308': { code: 'PAC_CERT_NOT_FROM_SAT', retryable: false },
  '401': { code: 'PAC_FECHA_OUT_OF_RANGE', retryable: false },
  '402': { code: 'PAC_RFC_NOT_REGISTERED', retryable: false },
  '702': { code: 'PAC_RFC_NOT_REGISTERED', retryable: false },
  '703': { code: 'PAC_ACCOUNT_SUSPENDED', retryable: false },
  '704': { code: 'PAC_WRONG_PASSWORD', retryable: false },
  '705': { code: 'PAC_INVALID_XML', retryable: false },
};

/**
 * Map a Finkok error code to a PACError
 * @param codigoError - Finkok error code (e.g., "307", "705")
 * @param mensaje - Error message from Finkok
 * @returns PACError with appropriate code
 */
export function mapFinkokError(codigoError: string, mensaje: string): PACError {
  const mapping = FINKOK_ERROR_CODES[codigoError];

  if (mapping) {
    return new PACError(
      mapping.code,
      `Finkok error ${codigoError}: ${mensaje}`,
      mapping.retryable
    );
  }

  // Unknown error code - not retryable by default
  return new PACError(
    'PAC_UNKNOWN_ERROR',
    `Finkok error ${codigoError}: ${mensaje}`,
    false
  );
}

/**
 * Map Finkok cancel status to result
 * @param estatusUUID - Status code (201, 202, 203, 205, etc.)
 * @param mensaje - Optional message
 * @returns Object with cancelled flag and any error
 */
export function mapFinkokCancelStatus(
  estatusUUID: string,
  mensaje?: string
): { cancelled: boolean; error?: PACError } {
  switch (estatusUUID) {
    case '201':
      // Successfully cancelled
      return { cancelled: true };
    case '202':
      // Already cancelled - treat as success
      return { cancelled: true };
    case '203':
      // RFC mismatch
      return {
        cancelled: false,
        error: new PACError(
          'CANCEL_RFC_MISMATCH',
          mensaje || 'RFC does not match the CFDI issuer',
          false
        ),
      };
    case '205':
      // UUID not found (SAT transient issue - retryable)
      return {
        cancelled: false,
        error: new PACError(
          'CANCEL_UUID_NOT_FOUND',
          mensaje || 'UUID not found in SAT records',
          true // This is retryable
        ),
      };
    default:
      return {
        cancelled: false,
        error: new PACError(
          'PAC_UNKNOWN_ERROR',
          `Unknown cancel status ${estatusUUID}: ${mensaje || 'No message'}`,
          false
        ),
      };
  }
}

// ============================================================================
// SW (Smarter Web) Error Mapping
// ============================================================================

/**
 * Known SW error patterns
 */
const SW_ERROR_PATTERNS: Array<{ pattern: RegExp; code: PACErrorCode }> = [
  { pattern: /AU2000/i, code: 'PAC_AUTH_FAILED' },
  { pattern: /CFDI40101|structure|invalid.*xml/i, code: 'PAC_INVALID_XML' },
  { pattern: /CFDI33166|certificate/i, code: 'PAC_CERT_NOT_FROM_SAT' },
  { pattern: /CFDI40117|fecha/i, code: 'PAC_FECHA_OUT_OF_RANGE' },
  { pattern: /RFC.*not.*registered|RFC.*no.*registrado/i, code: 'PAC_RFC_NOT_REGISTERED' },
  { pattern: /account.*suspended|cuenta.*suspendida/i, code: 'PAC_ACCOUNT_SUSPENDED' },
  { pattern: /already.*stamp|ya.*timbrado|duplicate/i, code: 'PAC_STAMP_DUPLICATE' },
];

/**
 * Map a SW error message to a PACError
 * @param message - Error message from SW
 * @param messageDetail - Optional detailed message
 * @returns PACError with appropriate code
 */
export function mapSWError(message: string, messageDetail?: string): PACError {
  const fullMessage = messageDetail ? `${message} - ${messageDetail}` : message;

  for (const { pattern, code } of SW_ERROR_PATTERNS) {
    if (pattern.test(fullMessage)) {
      return new PACError(code, fullMessage, false);
    }
  }

  // Unknown error
  return new PACError('PAC_UNKNOWN_ERROR', fullMessage, false);
}

// ============================================================================
// Network Error Handling
// ============================================================================

/**
 * Wrap a network error as a PACError
 * @param error - Original error
 * @param operation - Operation being performed (for context)
 * @returns PACError with appropriate code and retryable flag
 */
export function wrapNetworkError(error: unknown, operation: string): PACError {
  const message = error instanceof Error ? error.message : String(error);

  // Check for timeout
  if (message.toLowerCase().includes('timeout') || message.toLowerCase().includes('etimedout')) {
    return new PACError(
      'PAC_TIMEOUT',
      `${operation} timed out: ${message}`,
      true,
      error
    );
  }

  // General network error
  return new PACError(
    'PAC_NETWORK_ERROR',
    `${operation} failed: ${message}`,
    true,
    error
  );
}

// ============================================================================
// Validation Helpers
// ============================================================================

/**
 * Validate that motivo 01 has required folioSustitucion
 * @param motivo - Cancellation reason
 * @param folioSustitucion - Replacement UUID
 * @throws PACError if validation fails
 */
export function validateCancelRequest(
  motivo: string,
  folioSustitucion?: string
): void {
  if (motivo === '01' && !folioSustitucion) {
    throw new PACError(
      'CANCEL_REQUIRES_FOLIO_SUSTITUCION',
      'Motivo 01 requires a folioSustitucion (replacement CFDI UUID)',
      false
    );
  }
}
