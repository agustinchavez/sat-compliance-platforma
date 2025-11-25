/**
 * SAT Status Codes and Error Messages
 *
 * This file contains all known SAT status codes and their meanings.
 * These codes are returned by SAT web services for various operations.
 *
 * References:
 * - SAT Webservice Descarga Masiva documentation
 * - Appendix A: Códigos de respuesta
 */

// ============================================================================
// SAT Status Codes
// ============================================================================

export const SAT_STATUS_CODES = {
  // ========== Success Codes (5xxx) ==========
  5000: 'Solicitud recibida con éxito',
  5001: 'Se encuentra en proceso tu solicitud',
  5002: 'Se agotó el número de descargas permitidas',
  5003: 'La solicitud ya fue previamente aceptada',
  5004: 'No se encontró la información',
  5005: 'Solicitud rechazada',

  // ========== Authentication Errors (300-305) ==========
  300: 'Usuario inválido',
  301: 'XML mal formado',
  302: 'Sello mal formado o inválido',
  303: 'Sello no corresponde a RFC',
  304: 'Certificado revocado o caduco',
  305: 'Certificado inválido',

  // ========== Request Errors (400-405) ==========
  400: 'Error no controlado',
  401: 'Solicitud vencida',
  402: 'Solicitud en proceso',
  403: 'Número de solicitudes en proceso excedido',
  404: 'No se encontró la información solicitada',
  405: 'Solicitud rechazada',

  // ========== Validation Errors (1000-1099) ==========
  1000: 'Formato de RFC incorrecto',
  1001: 'Fecha inicial incorrecta',
  1002: 'Fecha final incorrecta',
  1003: 'Rango de fechas inválido (máximo 1 mes)',
  1004: 'Tipo de solicitud incorrecto',
  1005: 'RfcEmisor no válido',
  1006: 'RfcReceptor no válido',

  // ========== Download Errors (2000-2099) ==========
  2000: 'Paquete no disponible',
  2001: 'Paquete no encontrado',
  2002: 'Error al descargar el paquete',
  2003: 'Paquete corrupto o incompleto',

  // ========== General Errors (9xxx) ==========
  9000: 'Error interno del servidor',
  9001: 'Servicio temporalmente no disponible',
  9002: 'Timeout al procesar solicitud',
} as const;

export type SATStatusCode = keyof typeof SAT_STATUS_CODES;

// ============================================================================
// Code Categories
// ============================================================================

export const SAT_SUCCESS_CODES = [5000, 5001, 5003];
export const SAT_AUTH_ERROR_CODES = [300, 301, 302, 303, 304, 305];
export const SAT_REQUEST_ERROR_CODES = [400, 401, 402, 403, 404, 405];
export const SAT_VALIDATION_ERROR_CODES = [1000, 1001, 1002, 1003, 1004, 1005, 1006];
export const SAT_DOWNLOAD_ERROR_CODES = [2000, 2001, 2002, 2003];
export const SAT_RETRYABLE_CODES = [400, 402, 9001, 9002]; // Can retry these
export const SAT_NO_DATA_CODES = [5004, 404]; // No data found (not an error)
export const SAT_RATE_LIMIT_CODES = [5002, 403]; // Rate limit exceeded

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Gets human-readable message for SAT status code
 *
 * @param code - SAT status code
 * @returns Status message or "Unknown status code"
 *
 * @example
 * ```ts
 * const message = getSATStatusMessage(5000);
 * console.log(message); // → "Solicitud recibida con éxito"
 * ```
 */
export function getSATStatusMessage(code: number): string {
  return SAT_STATUS_CODES[code as SATStatusCode] || `Unknown status code: ${code}`;
}

/**
 * Checks if status code indicates success
 *
 * @param code - SAT status code
 * @returns true if success
 */
export function isSATSuccessCode(code: number): boolean {
  return SAT_SUCCESS_CODES.includes(code);
}

/**
 * Checks if status code indicates an error
 *
 * @param code - SAT status code
 * @returns true if error
 */
export function isSATErrorCode(code: number): boolean {
  return !isSATSuccessCode(code) && !SAT_NO_DATA_CODES.includes(code);
}

/**
 * Checks if status code indicates authentication error
 *
 * @param code - SAT status code
 * @returns true if authentication error
 */
export function isSATAuthError(code: number): boolean {
  return SAT_AUTH_ERROR_CODES.includes(code);
}

/**
 * Checks if error is retryable
 *
 * @param code - SAT status code
 * @returns true if retryable
 */
export function isSATRetryable(code: number): boolean {
  return SAT_RETRYABLE_CODES.includes(code);
}

/**
 * Checks if status code indicates no data found
 *
 * @param code - SAT status code
 * @returns true if no data
 */
export function isSATNoData(code: number): boolean {
  return SAT_NO_DATA_CODES.includes(code);
}

/**
 * Checks if status code indicates rate limit
 *
 * @param code - SAT status code
 * @returns true if rate limited
 */
export function isSATRateLimit(code: number): boolean {
  return SAT_RATE_LIMIT_CODES.includes(code);
}

// Alias for backward compatibility
export const isRateLimitCode = isSATRateLimit;

/**
 * Checks if status code indicates download request was accepted
 *
 * @param code - SAT status code
 * @returns true if download request accepted
 */
export function isDownloadSuccessCode(code: number): boolean {
  return code === 5000 || code === 5001 || code === 5003;
}

/**
 * Checks if status code indicates download is ready
 *
 * @param code - SAT status code
 * @returns true if download ready
 */
export function isDownloadReadyCode(code: number): boolean {
  return code === 5000;
}

/**
 * Checks if status code indicates download is still processing
 *
 * @param code - SAT status code
 * @returns true if still processing
 */
export function isDownloadProcessingCode(code: number): boolean {
  return code === 5001 || code === 402;
}

/**
 * Gets error category for status code
 *
 * @param code - SAT status code
 * @returns Error category
 */
export function getSATErrorCategory(
  code: number
): 'success' | 'auth' | 'validation' | 'download' | 'rate_limit' | 'no_data' | 'server' | 'unknown' {
  if (isSATSuccessCode(code)) return 'success';
  if (isSATAuthError(code)) return 'auth';
  if (isSATRateLimit(code)) return 'rate_limit';
  if (isSATNoData(code)) return 'no_data';
  if (SAT_VALIDATION_ERROR_CODES.includes(code)) return 'validation';
  if (SAT_DOWNLOAD_ERROR_CODES.includes(code)) return 'download';
  if (code >= 9000) return 'server';
  return 'unknown';
}

/**
 * Gets appropriate action for error code
 *
 * @param code - SAT status code
 * @returns Recommended action
 */
export function getSATErrorAction(code: number): string {
  const category = getSATErrorCategory(code);

  switch (category) {
    case 'auth':
      return 'Verify FIEL certificates are valid and not expired. Check password is correct.';
    case 'validation':
      return 'Check request parameters (RFC, dates, etc.) are valid.';
    case 'rate_limit':
      return 'Rate limit exceeded. Wait until tomorrow or reduce request frequency.';
    case 'no_data':
      return 'No data available for the requested period. This is not an error.';
    case 'download':
      return 'Package not available or corrupted. Wait and retry later.';
    case 'server':
      return 'SAT server error. Wait and retry later.';
    default:
      if (isSATRetryable(code)) {
        return 'Temporary error. Retry the request.';
      }
      return 'Check SAT documentation for more information.';
  }
}

/**
 * Formats error for display
 *
 * @param code - SAT status code
 * @param includeAction - Include recommended action
 * @returns Formatted error message
 *
 * @example
 * ```ts
 * const error = formatSATError(304, true);
 * console.log(error);
 * // → "SAT Error 304: Certificado revocado o caduco
 * //    Action: Verify FIEL certificates are valid and not expired."
 * ```
 */
export function formatSATError(code: number, includeAction: boolean = false): string {
  const message = getSATStatusMessage(code);
  const category = getSATErrorCategory(code);

  let formatted = `SAT Error ${code}: ${message}`;

  if (category !== 'success' && category !== 'no_data') {
    formatted += ` [${category.toUpperCase()}]`;
  }

  if (includeAction) {
    const action = getSATErrorAction(code);
    formatted += `\nAction: ${action}`;
  }

  return formatted;
}

/**
 * Handles SAT error code and throws appropriate error
 *
 * @param code - SAT status code
 * @param context - Additional context
 * @throws Error based on code category
 */
export function handleSATErrorCode(code: number, context?: string): never {
  const message = getSATStatusMessage(code);
  const fullMessage = context ? `${context}: ${message}` : message;

  const category = getSATErrorCategory(code);

  switch (category) {
    case 'auth':
      throw new Error(`Authentication Error (${code}): ${fullMessage}`);
    case 'rate_limit':
      throw new Error(`Rate Limit Exceeded (${code}): ${fullMessage}`);
    case 'validation':
      throw new Error(`Validation Error (${code}): ${fullMessage}`);
    case 'download':
      throw new Error(`Download Error (${code}): ${fullMessage}`);
    case 'server':
      throw new Error(`Server Error (${code}): ${fullMessage}`);
    default:
      throw new Error(`SAT Error (${code}): ${fullMessage}`);
  }
}

// ============================================================================
// Error Severity
// ============================================================================

export type ErrorSeverity = 'critical' | 'high' | 'medium' | 'low';

/**
 * Gets severity level for error code
 *
 * @param code - SAT status code
 * @returns Severity level
 */
export function getSATErrorSeverity(code: number): ErrorSeverity {
  if (isSATAuthError(code)) return 'critical'; // Auth errors block all operations
  if (isSATRateLimit(code)) return 'high'; // Rate limits affect service
  if (SAT_VALIDATION_ERROR_CODES.includes(code)) return 'medium'; // Invalid data
  if (isSATNoData(code)) return 'low'; // Not really an error
  if (isSATRetryable(code)) return 'medium'; // Temporary issues
  return 'high'; // Unknown errors are high severity
}

// ============================================================================
// Statistics
// ============================================================================

/**
 * Tracks error statistics
 */
export interface SATErrorStats {
  totalErrors: number;
  errorsByCode: Record<number, number>;
  errorsByCategory: Record<string, number>;
  lastError?: {
    code: number;
    message: string;
    timestamp: Date;
  };
}

/**
 * Creates empty error stats
 */
export function createEmptyErrorStats(): SATErrorStats {
  return {
    totalErrors: 0,
    errorsByCode: {},
    errorsByCategory: {},
  };
}

/**
 * Records an error in statistics
 *
 * @param stats - Error statistics
 * @param code - SAT status code
 * @returns Updated statistics
 */
export function recordSATError(
  stats: SATErrorStats,
  code: number
): SATErrorStats {
  const category = getSATErrorCategory(code);
  const message = getSATStatusMessage(code);

  return {
    totalErrors: stats.totalErrors + 1,
    errorsByCode: {
      ...stats.errorsByCode,
      [code]: (stats.errorsByCode[code] || 0) + 1,
    },
    errorsByCategory: {
      ...stats.errorsByCategory,
      [category]: (stats.errorsByCategory[category] || 0) + 1,
    },
    lastError: {
      code,
      message,
      timestamp: new Date(),
    },
  };
}
