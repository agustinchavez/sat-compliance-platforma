import crypto from 'crypto';

// =====================================================
// Date Formatting Utilities
// =====================================================

/**
 * Format date for SAT requests (ISO 8601 format without milliseconds)
 * Example: 2024-11-19T10:30:00
 */
export function formatSATDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');

  return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}`;
}

/**
 * Parse SAT date string to Date object
 */
export function parseSATDate(satDate: string): Date {
  return new Date(satDate);
}

// =====================================================
// Request ID Generation
// =====================================================

/**
 * Generate unique request ID for SAT operations
 */
export function generateRequestId(): string {
  return crypto.randomUUID();
}

/**
 * Generate unique package ID
 */
export function generatePackageId(): string {
  return `pkg-${crypto.randomBytes(16).toString('hex')}`;
}

// =====================================================
// Base64 Utilities
// =====================================================

/**
 * Convert Buffer to Base64 string
 */
export function toBase64(buffer: Buffer): string {
  return buffer.toString('base64');
}

/**
 * Convert Base64 string to Buffer
 */
export function fromBase64(base64: string): Buffer {
  return Buffer.from(base64, 'base64');
}

// =====================================================
// RFC Validation
// =====================================================

/**
 * Validate RFC format
 */
export function isValidRFCFormat(rfc: string): boolean {
  // RFC can be 12 (person) or 13 (company) characters
  // Format: 3-4 letters + 6 digits (YYMMDD) + 3 alphanumeric
  const rfcRegex = /^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/;
  return rfcRegex.test(rfc);
}

/**
 * Alias for isValidRFCFormat for backward compatibility
 */
export const validateRFCFormat = isValidRFCFormat;

/**
 * Calculate RFC checksum (homoclave)
 * This is a simplified version - full validation requires SAT lookup
 */
export function calculateRFCChecksum(rfc: string): string | null {
  if (rfc.length < 12) return null;

  // This is a placeholder - actual checksum calculation is complex
  // For now, just return the last 3 characters
  return rfc.slice(-3);
}

/**
 * Validate RFC checksum/homoclave using SAT algorithm
 *
 * The homoclave (last 3 characters) is calculated using:
 * 1. First 2 chars: Based on name/company letters using SAT tables
 * 2. Last char: Verification digit calculated from all previous chars
 *
 * Note: Full validation requires the original data used to create the RFC.
 * This simplified version validates structure and checksum digit.
 */
export function validateRFCChecksum(rfc: string): boolean {
  if (!isValidRFCFormat(rfc)) {
    return false;
  }

  const normalizedRFC = rfc.toUpperCase().trim();

  // Verification digit lookup table
  const charValues: { [key: string]: number } = {
    '0': 0, '1': 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9,
    'A': 10, 'B': 11, 'C': 12, 'D': 13, 'E': 14, 'F': 15, 'G': 16, 'H': 17, 'I': 18,
    'J': 19, 'K': 20, 'L': 21, 'M': 22, 'N': 23, 'Ñ': 24, 'O': 25, 'P': 26, 'Q': 27,
    'R': 28, 'S': 29, 'T': 30, 'U': 31, 'V': 32, 'W': 33, 'X': 34, 'Y': 35, 'Z': 36,
    ' ': 37, '&': 38,
  };

  const verificationChars = '0123456789ABCDEFGHIJKLMNÑOPQRSTUVWXYZ';

  try {
    // Remove the last character (verification digit)
    const rfcWithoutCheckDigit = normalizedRFC.slice(0, -1);
    const checkDigit = normalizedRFC.slice(-1);

    // Calculate sum with position-based weights
    // For RFC validation, we use weights 13 to 2 from left to right
    let sum = 0;
    const paddedRFC = ' ' + rfcWithoutCheckDigit; // Pad with space at the start

    for (let i = 0; i < paddedRFC.length; i++) {
      const char = paddedRFC[i];
      if (!char) {
        return false;
      }
      const value = charValues[char];
      if (value === undefined) {
        return false;
      }
      const weight = 13 - i;
      sum += value * weight;
    }

    // Calculate verification digit
    const remainder = sum % 11;
    const expectedDigit = remainder === 0 ? '0' : verificationChars[11 - remainder];

    // Handle special case where verification digit can be 'A' (represented as 10)
    if (expectedDigit === undefined && remainder === 10) {
      return checkDigit === 'A';
    }

    return checkDigit === expectedDigit;
  } catch {
    return false;
  }
}

// =====================================================
// Rate Limiting Utilities
// =====================================================

/**
 * Calculate rate limit key for Redis
 */
export function getRateLimitKey(organizationId: string, date?: Date): string {
  const d = date || new Date();
  const dateStr = d.toISOString().split('T')[0]; // YYYY-MM-DD
  return `sat:ratelimit:${organizationId}:${dateStr}`;
}

/**
 * Calculate wait time until rate limit resets (next day)
 */
export function calculateRateLimitReset(): Date {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(0, 0, 0, 0);
  return tomorrow;
}

/**
 * Get TTL for rate limit key (until end of day)
 */
export function getRateLimitTTL(): number {
  const now = new Date();
  const endOfDay = new Date(now);
  endOfDay.setHours(23, 59, 59, 999);
  return Math.floor((endOfDay.getTime() - now.getTime()) / 1000);
}

// =====================================================
// Logging Utilities
// =====================================================

export interface SATRequestLogEntry {
  timestamp: Date;
  organizationId: string;
  requestType: string;
  endpoint: string;
  success: boolean;
  duration: number;
  error?: string;
}

/**
 * Log SAT request for monitoring
 */
export function logSATRequest(log: SATRequestLogEntry): void {
  const logEntry = {
    ...log,
    timestamp: log.timestamp.toISOString(),
  };

  // In production, send to logging service (e.g., Datadog, CloudWatch)
  if (process.env.SAT_LOG_REQUESTS === 'true') {
    console.log('[SAT Request]', JSON.stringify(logEntry));
  }
}

// =====================================================
// Error Handling Utilities
// =====================================================

/**
 * Check if error is retryable
 */
export function isRetryableError(error: any): boolean {
  // Retry on network errors, timeouts, and certain SAT error codes
  if (error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT') {
    return true;
  }

  if (error.satCode) {
    // 400: Server error - retry
    // 402: Request processing - retry
    const retryableCodes = [400, 402];
    return retryableCodes.includes(error.satCode);
  }

  return false;
}

/**
 * Calculate exponential backoff delay
 */
export function calculateBackoffDelay(attempt: number, baseDelay: number = 1000): number {
  // Exponential backoff: 1s, 2s, 4s, 8s...
  const delay = baseDelay * Math.pow(2, attempt);
  // Add jitter to avoid thundering herd
  const jitter = Math.random() * 1000;
  return Math.min(delay + jitter, 30000); // Max 30 seconds
}

/**
 * Sleep for specified milliseconds
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// =====================================================
// XML Utilities
// =====================================================

/**
 * Escape XML special characters
 */
export function escapeXML(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Unescape XML special characters
 */
export function unescapeXML(str: string): string {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

/**
 * Extract value from XML tag
 */
export function extractXMLValue(xml: string, tagName: string): string | null {
  const regex = new RegExp(`<${tagName}[^>]*>([^<]*)</${tagName}>`, 'i');
  const match = xml.match(regex);
  return match?.[1] ?? null;
}

/**
 * Extract attribute from XML tag
 */
export function extractXMLAttribute(xml: string, tagName: string, attributeName: string): string | null {
  const regex = new RegExp(`<${tagName}[^>]*${attributeName}="([^"]*)"`, 'i');
  const match = xml.match(regex);
  return match?.[1] ?? null;
}

// =====================================================
// Certificate Utilities
// =====================================================

/**
 * Convert DER to PEM format
 */
export function derToPem(der: Buffer, type: 'CERTIFICATE' | 'PRIVATE KEY'): string {
  const base64 = der.toString('base64');
  const pemHeader = `-----BEGIN ${type}-----`;
  const pemFooter = `-----END ${type}-----`;

  // Split base64 into 64-character lines
  const lines: string[] = [];
  for (let i = 0; i < base64.length; i += 64) {
    lines.push(base64.slice(i, i + 64));
  }

  return `${pemHeader}\n${lines.join('\n')}\n${pemFooter}`;
}

/**
 * Convert PEM to DER format
 */
export function pemToDer(pem: string): Buffer {
  const base64 = pem
    .replace(/-----BEGIN[^-]+-----/, '')
    .replace(/-----END[^-]+-----/, '')
    .replace(/\s/g, '');

  return Buffer.from(base64, 'base64');
}

// =====================================================
// File Utilities
// =====================================================

/**
 * Get file extension
 */
export function getFileExtension(filename: string): string {
  const parts = filename.split('.');
  const ext = parts.length > 1 ? parts[parts.length - 1] : '';
  return ext?.toLowerCase() ?? '';
}

/**
 * Generate storage path for CFDI
 */
export function generateCFDIStoragePath(
  organizationId: string,
  uuid: string,
  type: 'issued' | 'received'
): string {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');

  return `cfdis/${organizationId}/${type}/${year}/${month}/${uuid}.xml`;
}

// =====================================================
// Validation Utilities
// =====================================================

/**
 * Validate UUID format
 */
export function isValidUUID(uuid: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(uuid);
}

/**
 * Validate date range
 */
export function isValidDateRange(start: Date, end: Date): boolean {
  return start <= end && end <= new Date();
}

/**
 * Calculate days difference
 */
export function daysDifference(date1: Date, date2: Date): number {
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.floor((date2.getTime() - date1.getTime()) / msPerDay);
}
