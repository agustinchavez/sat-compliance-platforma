/**
 * PAC Error Handling Tests (Component 15)
 */

import { describe, it, expect } from 'vitest';
import {
  PACError,
  isRetryable,
  isDuplicateStamp,
  mapFinkokError,
  mapFinkokCancelStatus,
  mapSWError,
  wrapNetworkError,
  validateCancelRequest,
  FINKOK_ERROR_CODES,
} from '../errors';

describe('PACError', () => {
  it('should be an instance of Error', () => {
    const error = new PACError('PAC_INVALID_XML', 'Test message');
    expect(error).toBeInstanceOf(Error);
  });

  it('should have name "PACError"', () => {
    const error = new PACError('PAC_INVALID_XML', 'Test message');
    expect(error.name).toBe('PACError');
  });

  it('should store code, message, and retryable flag', () => {
    const error = new PACError('PAC_NETWORK_ERROR', 'Connection failed', true);
    expect(error.code).toBe('PAC_NETWORK_ERROR');
    expect(error.message).toBe('Connection failed');
    expect(error.retryable).toBe(true);
  });

  it('should default retryable to false', () => {
    const error = new PACError('PAC_INVALID_XML', 'Bad XML');
    expect(error.retryable).toBe(false);
  });

  it('should store original error', () => {
    const originalError = new Error('Original');
    const error = new PACError('PAC_NETWORK_ERROR', 'Wrapped', true, originalError);
    expect(error.originalError).toBe(originalError);
  });

  it('should serialize to JSON correctly', () => {
    const originalError = new Error('Original');
    const error = new PACError('PAC_NETWORK_ERROR', 'Network failed', true, originalError);
    const json = error.toJSON();

    expect(json).toEqual({
      name: 'PACError',
      code: 'PAC_NETWORK_ERROR',
      message: 'Network failed',
      retryable: true,
      originalError: { name: 'Error', message: 'Original' },
    });
  });

  it('should handle non-Error originalError in toJSON', () => {
    const error = new PACError('PAC_UNKNOWN_ERROR', 'Unknown', false, { custom: 'data' });
    const json = error.toJSON();

    expect(json.originalError).toEqual({ custom: 'data' });
  });
});

describe('isRetryable', () => {
  it('should return true for PACError with retryable=true', () => {
    const error = new PACError('PAC_NETWORK_ERROR', 'Connection failed', true);
    expect(isRetryable(error)).toBe(true);
  });

  it('should return false for PACError with retryable=false', () => {
    const error = new PACError('PAC_INVALID_XML', 'Bad XML', false);
    expect(isRetryable(error)).toBe(false);
  });

  it('should return true for ECONNREFUSED error', () => {
    const error = new Error('ECONNREFUSED: Connection refused');
    expect(isRetryable(error)).toBe(true);
  });

  it('should return true for ETIMEDOUT error', () => {
    const error = new Error('ETIMEDOUT: Connection timed out');
    expect(isRetryable(error)).toBe(true);
  });

  it('should return true for ENOTFOUND error', () => {
    const error = new Error('ENOTFOUND: DNS lookup failed');
    expect(isRetryable(error)).toBe(true);
  });

  it('should return true for ECONNRESET error', () => {
    const error = new Error('ECONNRESET: Connection reset by peer');
    expect(isRetryable(error)).toBe(true);
  });

  it('should return true for socket hang up error', () => {
    const error = new Error('socket hang up');
    expect(isRetryable(error)).toBe(true);
  });

  it('should return true for fetch failed error', () => {
    const error = new Error('fetch failed: network error');
    expect(isRetryable(error)).toBe(true);
  });

  it('should return false for regular error', () => {
    const error = new Error('Some random error');
    expect(isRetryable(error)).toBe(false);
  });

  it('should return false for non-Error values', () => {
    expect(isRetryable('string error')).toBe(false);
    expect(isRetryable(null)).toBe(false);
    expect(isRetryable(undefined)).toBe(false);
    expect(isRetryable(123)).toBe(false);
  });
});

describe('isDuplicateStamp', () => {
  it('should return true for PAC_STAMP_DUPLICATE error', () => {
    const error = new PACError('PAC_STAMP_DUPLICATE', 'Already stamped');
    expect(isDuplicateStamp(error)).toBe(true);
  });

  it('should return false for other PACError codes', () => {
    const error = new PACError('PAC_INVALID_XML', 'Bad XML');
    expect(isDuplicateStamp(error)).toBe(false);
  });

  it('should return false for non-PACError', () => {
    const error = new Error('Some error');
    expect(isDuplicateStamp(error)).toBe(false);
  });

  it('should return false for non-Error values', () => {
    expect(isDuplicateStamp(null)).toBe(false);
    expect(isDuplicateStamp(undefined)).toBe(false);
  });
});

describe('mapFinkokError', () => {
  it('should map code 307 to PAC_STAMP_DUPLICATE', () => {
    const error = mapFinkokError('307', 'CFDI contains previous stamp');
    expect(error.code).toBe('PAC_STAMP_DUPLICATE');
    expect(error.retryable).toBe(false);
    expect(error.message).toContain('307');
    expect(error.message).toContain('previous stamp');
  });

  it('should map code 308 to PAC_CERT_NOT_FROM_SAT', () => {
    const error = mapFinkokError('308', 'Certificate not from SAT');
    expect(error.code).toBe('PAC_CERT_NOT_FROM_SAT');
    expect(error.retryable).toBe(false);
  });

  it('should map code 401 to PAC_FECHA_OUT_OF_RANGE', () => {
    const error = mapFinkokError('401', 'Fecha outside valid range');
    expect(error.code).toBe('PAC_FECHA_OUT_OF_RANGE');
    expect(error.retryable).toBe(false);
  });

  it('should map code 402 to PAC_RFC_NOT_REGISTERED', () => {
    const error = mapFinkokError('402', 'RFC not registered');
    expect(error.code).toBe('PAC_RFC_NOT_REGISTERED');
    expect(error.retryable).toBe(false);
  });

  it('should map code 702 to PAC_RFC_NOT_REGISTERED', () => {
    const error = mapFinkokError('702', 'RFC not registered under account');
    expect(error.code).toBe('PAC_RFC_NOT_REGISTERED');
    expect(error.retryable).toBe(false);
  });

  it('should map code 703 to PAC_ACCOUNT_SUSPENDED', () => {
    const error = mapFinkokError('703', 'Account suspended');
    expect(error.code).toBe('PAC_ACCOUNT_SUSPENDED');
    expect(error.retryable).toBe(false);
  });

  it('should map code 704 to PAC_WRONG_PASSWORD', () => {
    const error = mapFinkokError('704', 'Wrong CSD password');
    expect(error.code).toBe('PAC_WRONG_PASSWORD');
    expect(error.retryable).toBe(false);
  });

  it('should map code 705 to PAC_INVALID_XML', () => {
    const error = mapFinkokError('705', 'Invalid XML structure');
    expect(error.code).toBe('PAC_INVALID_XML');
    expect(error.retryable).toBe(false);
  });

  it('should map unknown codes to PAC_UNKNOWN_ERROR', () => {
    const error = mapFinkokError('999', 'Unknown error');
    expect(error.code).toBe('PAC_UNKNOWN_ERROR');
    expect(error.retryable).toBe(false);
    expect(error.message).toContain('999');
  });

  it('should include original message in error', () => {
    const error = mapFinkokError('705', 'El XML no tiene estructura válida');
    expect(error.message).toContain('El XML no tiene estructura válida');
  });
});

describe('mapFinkokCancelStatus', () => {
  it('should return cancelled=true for status 201', () => {
    const result = mapFinkokCancelStatus('201');
    expect(result.cancelled).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it('should return cancelled=true for status 202 (already cancelled)', () => {
    const result = mapFinkokCancelStatus('202');
    expect(result.cancelled).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it('should return error for status 203 (RFC mismatch)', () => {
    const result = mapFinkokCancelStatus('203', 'RFC does not match');
    expect(result.cancelled).toBe(false);
    expect(result.error).toBeDefined();
    expect(result.error!.code).toBe('CANCEL_RFC_MISMATCH');
    expect(result.error!.retryable).toBe(false);
  });

  it('should return retryable error for status 205 (UUID not found)', () => {
    const result = mapFinkokCancelStatus('205', 'UUID not found');
    expect(result.cancelled).toBe(false);
    expect(result.error).toBeDefined();
    expect(result.error!.code).toBe('CANCEL_UUID_NOT_FOUND');
    expect(result.error!.retryable).toBe(true); // SAT transient issue
  });

  it('should return unknown error for other status codes', () => {
    const result = mapFinkokCancelStatus('999', 'Unknown status');
    expect(result.cancelled).toBe(false);
    expect(result.error).toBeDefined();
    expect(result.error!.code).toBe('PAC_UNKNOWN_ERROR');
    expect(result.error!.message).toContain('999');
  });

  it('should handle missing message', () => {
    const result = mapFinkokCancelStatus('203');
    expect(result.error).toBeDefined();
    expect(result.error!.message).toContain('RFC');
  });
});

describe('mapSWError', () => {
  it('should map AU2000 to PAC_AUTH_FAILED', () => {
    const error = mapSWError('AU2000 - Authentication failed');
    expect(error.code).toBe('PAC_AUTH_FAILED');
    expect(error.retryable).toBe(false);
  });

  it('should map CFDI40101 to PAC_INVALID_XML', () => {
    const error = mapSWError('CFDI40101 - El atributo no es válido');
    expect(error.code).toBe('PAC_INVALID_XML');
    expect(error.retryable).toBe(false);
  });

  it('should map structure errors to PAC_INVALID_XML', () => {
    const error = mapSWError('Invalid XML structure');
    expect(error.code).toBe('PAC_INVALID_XML');
  });

  it('should map certificate errors to PAC_CERT_NOT_FROM_SAT', () => {
    const error = mapSWError('CFDI33166 - Certificate error');
    expect(error.code).toBe('PAC_CERT_NOT_FROM_SAT');
  });

  it('should map fecha errors to PAC_FECHA_OUT_OF_RANGE', () => {
    const error = mapSWError('CFDI40117 - Fecha inválida');
    expect(error.code).toBe('PAC_FECHA_OUT_OF_RANGE');
  });

  it('should map already stamped to PAC_STAMP_DUPLICATE', () => {
    const error = mapSWError('The document was already stamped');
    expect(error.code).toBe('PAC_STAMP_DUPLICATE');
  });

  it('should map duplicate to PAC_STAMP_DUPLICATE', () => {
    const error = mapSWError('Duplicate CFDI detected');
    expect(error.code).toBe('PAC_STAMP_DUPLICATE');
  });

  it('should include messageDetail when provided', () => {
    const error = mapSWError('CFDI40101', 'Detailed error info');
    expect(error.message).toContain('Detailed error info');
  });

  it('should map unknown errors to PAC_UNKNOWN_ERROR', () => {
    const error = mapSWError('Some random error message');
    expect(error.code).toBe('PAC_UNKNOWN_ERROR');
    expect(error.message).toBe('Some random error message');
  });
});

describe('wrapNetworkError', () => {
  it('should wrap timeout errors with PAC_TIMEOUT code', () => {
    const original = new Error('Request timeout after 30000ms');
    const error = wrapNetworkError(original, 'Stamp request');

    expect(error.code).toBe('PAC_TIMEOUT');
    expect(error.retryable).toBe(true);
    expect(error.message).toContain('Stamp request');
    expect(error.message).toContain('timed out');
    expect(error.originalError).toBe(original);
  });

  it('should wrap ETIMEDOUT errors with PAC_TIMEOUT code', () => {
    const original = new Error('ETIMEDOUT');
    const error = wrapNetworkError(original, 'API call');

    expect(error.code).toBe('PAC_TIMEOUT');
    expect(error.retryable).toBe(true);
  });

  it('should wrap other network errors with PAC_NETWORK_ERROR code', () => {
    const original = new Error('ECONNREFUSED');
    const error = wrapNetworkError(original, 'Connection attempt');

    expect(error.code).toBe('PAC_NETWORK_ERROR');
    expect(error.retryable).toBe(true);
    expect(error.message).toContain('Connection attempt');
  });

  it('should handle string errors', () => {
    const error = wrapNetworkError('String error message', 'Operation');

    expect(error.code).toBe('PAC_NETWORK_ERROR');
    expect(error.message).toContain('String error message');
  });
});

describe('validateCancelRequest', () => {
  it('should throw for motivo 01 without folioSustitucion', () => {
    expect(() => validateCancelRequest('01')).toThrow(PACError);
    expect(() => validateCancelRequest('01')).toThrow(/folioSustitucion/);
  });

  it('should throw for motivo 01 with empty folioSustitucion', () => {
    expect(() => validateCancelRequest('01', '')).toThrow(PACError);
  });

  it('should not throw for motivo 01 with valid folioSustitucion', () => {
    expect(() => validateCancelRequest('01', '05c519de-6d20-4258-88fb-c69a5970e927'))
      .not.toThrow();
  });

  it('should not throw for motivo 02 without folioSustitucion', () => {
    expect(() => validateCancelRequest('02')).not.toThrow();
  });

  it('should not throw for motivo 03 without folioSustitucion', () => {
    expect(() => validateCancelRequest('03')).not.toThrow();
  });

  it('should not throw for motivo 04 without folioSustitucion', () => {
    expect(() => validateCancelRequest('04')).not.toThrow();
  });
});

describe('FINKOK_ERROR_CODES', () => {
  it('should have all expected error codes mapped', () => {
    expect(FINKOK_ERROR_CODES).toHaveProperty('307');
    expect(FINKOK_ERROR_CODES).toHaveProperty('308');
    expect(FINKOK_ERROR_CODES).toHaveProperty('401');
    expect(FINKOK_ERROR_CODES).toHaveProperty('402');
    expect(FINKOK_ERROR_CODES).toHaveProperty('702');
    expect(FINKOK_ERROR_CODES).toHaveProperty('703');
    expect(FINKOK_ERROR_CODES).toHaveProperty('704');
    expect(FINKOK_ERROR_CODES).toHaveProperty('705');
  });

  it('should have none marked as retryable', () => {
    for (const [code, mapping] of Object.entries(FINKOK_ERROR_CODES)) {
      expect(mapping.retryable).toBe(false);
    }
  });
});
