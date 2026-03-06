/**
 * Tests for CSD Error Types (Component 14 - Step 1)
 */

import { describe, it, expect } from 'vitest';
import { CSDError, type CSDErrorCode, type CertificateInfo, type CSDValidationResult } from '../errors';

describe('CSDError', () => {
  it('is instanceof Error', () => {
    const error = new CSDError('test message', 'CSD_CERT_EXPIRED');
    expect(error).toBeInstanceOf(Error);
  });

  it('has name property set to "CSDError"', () => {
    const error = new CSDError('test message', 'CSD_WRONG_PASSWORD');
    expect(error.name).toBe('CSDError');
  });

  it('stores the error code correctly', () => {
    const error = new CSDError('test message', 'CSD_KEY_LOAD_ERROR');
    expect(error.code).toBe('CSD_KEY_LOAD_ERROR');
  });

  it('stores the error message correctly', () => {
    const message = 'Private key password is incorrect';
    const error = new CSDError(message, 'CSD_WRONG_PASSWORD');
    expect(error.message).toBe(message);
  });

  it('stores details when provided', () => {
    const details = { originalError: 'ERR_OSSL_BAD_DECRYPT', keyPath: '/path/to/key.key' };
    const error = new CSDError('test', 'CSD_KEY_LOAD_ERROR', details);
    expect(error.details).toEqual(details);
  });

  it('has undefined details when not provided', () => {
    const error = new CSDError('test', 'CSD_CERT_LOAD_ERROR');
    expect(error.details).toBeUndefined();
  });

  it('has a stack trace', () => {
    const error = new CSDError('test', 'CSD_SIGN_ERROR');
    expect(error.stack).toBeDefined();
    expect(error.stack).toContain('CSDError');
  });

  it('works with try/catch', () => {
    let caught: CSDError | undefined;
    try {
      throw new CSDError('Certificate expired', 'CSD_CERT_EXPIRED');
    } catch (e) {
      caught = e as CSDError;
    }
    expect(caught).toBeDefined();
    expect(caught?.code).toBe('CSD_CERT_EXPIRED');
    expect(caught?.message).toBe('Certificate expired');
  });

  it('can be checked with instanceof in catch block', () => {
    try {
      throw new CSDError('RFC mismatch', 'CSD_RFC_MISMATCH');
    } catch (e) {
      if (e instanceof CSDError) {
        expect(e.code).toBe('CSD_RFC_MISMATCH');
      } else {
        throw new Error('Expected CSDError instance');
      }
    }
  });
});

describe('CSDErrorCode type', () => {
  it('includes all key loading error codes', () => {
    const codes: CSDErrorCode[] = [
      'CSD_KEY_LOAD_ERROR',
      'CSD_PASSWORD_REQUIRED',
      'CSD_WRONG_PASSWORD',
    ];
    // Type assertion proves these are valid codes
    expect(codes).toHaveLength(3);
  });

  it('includes all certificate error codes', () => {
    const codes: CSDErrorCode[] = [
      'CSD_CERT_LOAD_ERROR',
      'CSD_CERT_EXPIRED',
      'CSD_CERT_NOT_YET_VALID',
      'CSD_NOT_A_CSD',
      'CSD_RFC_MISMATCH',
      'CSD_UNTRUSTED_ISSUER',
      'CSD_RFC_NOT_FOUND',
    ];
    expect(codes).toHaveLength(7);
  });

  it('includes all signing error codes', () => {
    const codes: CSDErrorCode[] = [
      'CSD_SIGN_ERROR',
      'CSD_VERIFY_FAILED',
    ];
    expect(codes).toHaveLength(2);
  });

  it('includes all XML injection error codes', () => {
    const codes: CSDErrorCode[] = [
      'CSD_XML_INJECTION_ERROR',
      'CSD_XML_PLACEHOLDER_NOT_FOUND',
    ];
    expect(codes).toHaveLength(2);
  });
});

describe('CertificateInfo interface', () => {
  it('can be constructed with all required fields', () => {
    const info: CertificateInfo = {
      rfc: 'EKU9003173C9',
      nombre: 'ESCUELA KEMPER URGATE',
      noCertificado: '20001000000300022315',
      validFrom: new Date('2010-08-21'),
      validTo: new Date('2014-08-21'),
      issuer: 'Servicio de Administración Tributaria',
      keyAlgorithm: 'RSA-2048',
    };
    expect(info.rfc).toBe('EKU9003173C9');
    expect(info.noCertificado).toHaveLength(20);
    expect(info.keyAlgorithm).toBe('RSA-2048');
  });

  it('accepts valid RFC formats for persona moral (12 chars)', () => {
    const info: CertificateInfo = {
      rfc: 'AAA010101AAA',
      nombre: 'Test Company',
      noCertificado: '12345678901234567890',
      validFrom: new Date(),
      validTo: new Date(),
      issuer: 'SAT',
      keyAlgorithm: 'RSA-2048',
    };
    expect(info.rfc).toHaveLength(12);
  });

  it('accepts valid RFC formats for persona fisica (13 chars)', () => {
    const info: CertificateInfo = {
      rfc: 'XAXX010101001',
      nombre: 'Test Person',
      noCertificado: '12345678901234567890',
      validFrom: new Date(),
      validTo: new Date(),
      issuer: 'SAT',
      keyAlgorithm: 'RSA-2048',
    };
    expect(info.rfc).toHaveLength(13);
  });
});

describe('CSDValidationResult interface', () => {
  it('can represent a valid certificate', () => {
    const result: CSDValidationResult = {
      valid: true,
      errors: [],
      certInfo: {
        rfc: 'AAA010101AAA',
        nombre: 'Test',
        noCertificado: '20001000000300022315',
        validFrom: new Date(),
        validTo: new Date(),
        issuer: 'SAT',
        keyAlgorithm: 'RSA-2048',
      },
    };
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.certInfo).toBeDefined();
  });

  it('can represent an invalid certificate with multiple errors', () => {
    const result: CSDValidationResult = {
      valid: false,
      errors: [
        { code: 'CSD_CERT_EXPIRED', message: 'Certificate expired on 2014-08-21' },
        { code: 'CSD_RFC_MISMATCH', message: 'Certificate RFC AAA010101AAA does not match expected RFC EKU9003173C9' },
      ],
      certInfo: {
        rfc: 'AAA010101AAA',
        nombre: 'Test',
        noCertificado: '20001000000300022315',
        validFrom: new Date('2010-08-21'),
        validTo: new Date('2014-08-21'),
        issuer: 'SAT',
        keyAlgorithm: 'RSA-2048',
      },
    };
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(2);
    expect(result.errors[0].code).toBe('CSD_CERT_EXPIRED');
    expect(result.errors[1].code).toBe('CSD_RFC_MISMATCH');
  });

  it('can have certInfo even when invalid (extraction succeeded but validation failed)', () => {
    const result: CSDValidationResult = {
      valid: false,
      errors: [
        { code: 'CSD_CERT_EXPIRED', message: 'Certificate has expired' },
      ],
      certInfo: {
        rfc: 'AAA010101AAA',
        nombre: 'Test',
        noCertificado: '20001000000300022315',
        validFrom: new Date(),
        validTo: new Date('2020-01-01'),
        issuer: 'SAT',
        keyAlgorithm: 'RSA-2048',
      },
    };
    expect(result.certInfo).toBeDefined();
  });

  it('can have undefined certInfo (extraction failed)', () => {
    const result: CSDValidationResult = {
      valid: false,
      errors: [
        { code: 'CSD_RFC_NOT_FOUND', message: 'Could not extract RFC from certificate subject' },
      ],
    };
    expect(result.certInfo).toBeUndefined();
  });
});
