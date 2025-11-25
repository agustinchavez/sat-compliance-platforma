import { describe, it, expect } from 'vitest';
import {
  SAT_STATUS_CODES,
  getSATStatusMessage,
  isSATSuccessCode,
  isSATErrorCode,
  isSATAuthError,
  isSATRetryable,
  isSATNoData,
  isSATRateLimit,
  getSATErrorCategory,
  getSATErrorAction,
  formatSATError,
  getSATErrorSeverity,
  recordSATError,
  createEmptyErrorStats,
} from '../sat-codes';

describe('SAT Status Codes', () => {
  describe('Status Code Messages', () => {
    it('should return correct message for success codes', () => {
      expect(getSATStatusMessage(5000)).toBe('Solicitud recibida con éxito');
      expect(getSATStatusMessage(5001)).toBe('Se encuentra en proceso tu solicitud');
    });

    it('should return correct message for auth errors', () => {
      expect(getSATStatusMessage(300)).toBe('Usuario inválido');
      expect(getSATStatusMessage(304)).toBe('Certificado revocado o caduco');
    });

    it('should return correct message for request errors', () => {
      expect(getSATStatusMessage(400)).toBe('Error no controlado');
      expect(getSATStatusMessage(402)).toBe('Solicitud en proceso');
    });

    it('should handle unknown status codes', () => {
      const message = getSATStatusMessage(9999);
      expect(message).toContain('Unknown status code');
      expect(message).toContain('9999');
    });
  });

  describe('Success Code Identification', () => {
    it('should identify success codes', () => {
      expect(isSATSuccessCode(5000)).toBe(true);
      expect(isSATSuccessCode(5001)).toBe(true);
      expect(isSATSuccessCode(5003)).toBe(true);
    });

    it('should not identify errors as success', () => {
      expect(isSATSuccessCode(300)).toBe(false);
      expect(isSATSuccessCode(400)).toBe(false);
      expect(isSATSuccessCode(5004)).toBe(false);
    });
  });

  describe('Error Code Identification', () => {
    it('should identify error codes', () => {
      expect(isSATErrorCode(300)).toBe(true);
      expect(isSATErrorCode(400)).toBe(true);
      expect(isSATErrorCode(1000)).toBe(true);
    });

    it('should not identify success as errors', () => {
      expect(isSATErrorCode(5000)).toBe(false);
      expect(isSATErrorCode(5001)).toBe(false);
    });

    it('should not treat no-data as errors', () => {
      expect(isSATErrorCode(5004)).toBe(false); // No data found
      expect(isSATErrorCode(404)).toBe(false);
    });
  });

  describe('Authentication Error Detection', () => {
    it('should identify auth errors', () => {
      expect(isSATAuthError(300)).toBe(true); // Invalid user
      expect(isSATAuthError(301)).toBe(true); // Malformed XML
      expect(isSATAuthError(304)).toBe(true); // Revoked cert
      expect(isSATAuthError(305)).toBe(true); // Invalid cert
    });

    it('should not identify non-auth errors', () => {
      expect(isSATAuthError(400)).toBe(false);
      expect(isSATAuthError(5000)).toBe(false);
    });
  });

  describe('Retryable Error Detection', () => {
    it('should identify retryable errors', () => {
      expect(isSATRetryable(400)).toBe(true); // Server error
      expect(isSATRetryable(402)).toBe(true); // Processing
    });

    it('should not retry auth errors', () => {
      expect(isSATRetryable(300)).toBe(false);
      expect(isSATRetryable(304)).toBe(false);
    });

    it('should not retry rate limits', () => {
      expect(isSATRetryable(5002)).toBe(false);
    });
  });

  describe('No Data Detection', () => {
    it('should identify no-data responses', () => {
      expect(isSATNoData(5004)).toBe(true);
      expect(isSATNoData(404)).toBe(true);
    });

    it('should not identify errors as no-data', () => {
      expect(isSATNoData(300)).toBe(false);
      expect(isSATNoData(400)).toBe(false);
      expect(isSATNoData(2001)).toBe(false); // 2001 is a download error, not no-data
    });
  });

  describe('Rate Limit Detection', () => {
    it('should identify rate limit errors', () => {
      expect(isSATRateLimit(5002)).toBe(true);
      expect(isSATRateLimit(403)).toBe(true);
    });

    it('should not identify other errors as rate limit', () => {
      expect(isSATRateLimit(400)).toBe(false);
      expect(isSATRateLimit(300)).toBe(false);
    });
  });

  describe('Error Categorization', () => {
    it('should categorize success codes', () => {
      expect(getSATErrorCategory(5000)).toBe('success');
      expect(getSATErrorCategory(5001)).toBe('success');
    });

    it('should categorize auth errors', () => {
      expect(getSATErrorCategory(300)).toBe('auth');
      expect(getSATErrorCategory(304)).toBe('auth');
    });

    it('should categorize rate limits', () => {
      expect(getSATErrorCategory(5002)).toBe('rate_limit');
      expect(getSATErrorCategory(403)).toBe('rate_limit');
    });

    it('should categorize validation errors', () => {
      expect(getSATErrorCategory(1000)).toBe('validation');
      expect(getSATErrorCategory(1003)).toBe('validation');
    });

    it('should categorize download errors', () => {
      expect(getSATErrorCategory(2000)).toBe('download');
      expect(getSATErrorCategory(2001)).toBe('download');
    });

    it('should categorize no-data responses', () => {
      expect(getSATErrorCategory(5004)).toBe('no_data');
      expect(getSATErrorCategory(404)).toBe('no_data');
    });

    it('should categorize server errors', () => {
      expect(getSATErrorCategory(9000)).toBe('server');
      expect(getSATErrorCategory(9001)).toBe('server');
    });

    it('should handle unknown categories', () => {
      // Code >= 9000 is categorized as 'server', use a code outside known ranges
      expect(getSATErrorCategory(8888)).toBe('unknown');
    });
  });

  describe('Error Actions', () => {
    it('should provide action for auth errors', () => {
      const action = getSATErrorAction(300);
      expect(action).toContain('FIEL certificates');
      expect(action).toContain('password');
    });

    it('should provide action for validation errors', () => {
      const action = getSATErrorAction(1000);
      expect(action).toContain('parameters');
      expect(action).toContain('RFC');
    });

    it('should provide action for rate limits', () => {
      const action = getSATErrorAction(5002);
      expect(action).toContain('Rate limit');
      expect(action).toContain('tomorrow');
    });

    it('should provide action for server errors', () => {
      const action = getSATErrorAction(9000);
      expect(action).toContain('SAT server');
      expect(action).toContain('retry');
    });
  });

  describe('Error Formatting', () => {
    it('should format error without action', () => {
      const formatted = formatSATError(5000, false);
      expect(formatted).toContain('SAT Error 5000');
      expect(formatted).toContain('Solicitud recibida con éxito');
      expect(formatted).not.toContain('Action:');
    });

    it('should format error with action', () => {
      const formatted = formatSATError(300, true);
      expect(formatted).toContain('SAT Error 300');
      expect(formatted).toContain('Action:');
      expect(formatted).toContain('FIEL');
    });

    it('should include category for errors', () => {
      const formatted = formatSATError(300, false);
      expect(formatted).toContain('[AUTH]');
    });

    it('should not include category for success', () => {
      const formatted = formatSATError(5000, false);
      expect(formatted).not.toContain('[SUCCESS]');
    });
  });

  describe('Error Severity', () => {
    it('should classify auth errors as critical', () => {
      expect(getSATErrorSeverity(300)).toBe('critical');
      expect(getSATErrorSeverity(304)).toBe('critical');
    });

    it('should classify rate limits as high', () => {
      expect(getSATErrorSeverity(5002)).toBe('high');
    });

    it('should classify validation errors as medium', () => {
      expect(getSATErrorSeverity(1000)).toBe('medium');
    });

    it('should classify no-data as low', () => {
      expect(getSATErrorSeverity(5004)).toBe('low');
      expect(getSATErrorSeverity(404)).toBe('low');
    });

    it('should classify retryable errors as medium', () => {
      expect(getSATErrorSeverity(400)).toBe('medium');
      expect(getSATErrorSeverity(402)).toBe('medium');
    });
  });

  describe('Error Statistics', () => {
    it('should create empty error stats', () => {
      const stats = createEmptyErrorStats();

      expect(stats.totalErrors).toBe(0);
      expect(stats.errorsByCode).toEqual({});
      expect(stats.errorsByCategory).toEqual({});
      expect(stats.lastError).toBeUndefined();
    });

    it('should record single error', () => {
      const stats = createEmptyErrorStats();
      const updated = recordSATError(stats, 300);

      expect(updated.totalErrors).toBe(1);
      expect(updated.errorsByCode[300]).toBe(1);
      expect(updated.errorsByCategory.auth).toBe(1);
      expect(updated.lastError).toBeDefined();
      expect(updated.lastError?.code).toBe(300);
    });

    it('should accumulate multiple errors', () => {
      let stats = createEmptyErrorStats();
      stats = recordSATError(stats, 300);
      stats = recordSATError(stats, 300);
      stats = recordSATError(stats, 400);

      expect(stats.totalErrors).toBe(3);
      expect(stats.errorsByCode[300]).toBe(2);
      expect(stats.errorsByCode[400]).toBe(1);
      expect(stats.errorsByCategory.auth).toBe(2);
      expect(stats.errorsByCategory.server).toBeUndefined(); // 400 is not server
    });

    it('should track last error timestamp', () => {
      const stats = createEmptyErrorStats();
      const before = new Date();
      const updated = recordSATError(stats, 300);
      const after = new Date();

      expect(updated.lastError?.timestamp).toBeInstanceOf(Date);
      expect(updated.lastError!.timestamp.getTime()).toBeGreaterThanOrEqual(
        before.getTime()
      );
      expect(updated.lastError!.timestamp.getTime()).toBeLessThanOrEqual(
        after.getTime()
      );
    });
  });

  describe('Status Code Coverage', () => {
    it('should have messages for all defined codes', () => {
      const codes = [
        5000, 5001, 5002, 5003, 5004, 5005,
        300, 301, 302, 303, 304, 305,
        400, 401, 402, 403, 404, 405,
        1000, 1001, 1002, 1003, 1004, 1005, 1006,
        2000, 2001, 2002, 2003,
        9000, 9001, 9002,
      ];

      codes.forEach((code) => {
        const message = getSATStatusMessage(code);
        expect(message).toBeDefined();
        expect(message).not.toContain('Unknown');
      });
    });
  });
});
