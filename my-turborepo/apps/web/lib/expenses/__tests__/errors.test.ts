/**
 * Tests for Expense Errors (Component 20)
 */

import { describe, expect, it } from 'vitest';
import { ExpenseError, isExpenseError } from '../errors';

describe('ExpenseError', () => {
  it('should create error with all parameters', () => {
    const cause = new Error('Database connection failed');
    const error = new ExpenseError(
      'INVALID_EXPENSE_DATA',
      'Invalid vendor RFC format',
      'expense-123',
      cause
    );

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(ExpenseError);
    expect(error.name).toBe('ExpenseError');
    expect(error.code).toBe('INVALID_EXPENSE_DATA');
    expect(error.message).toBe('Invalid vendor RFC format');
    expect(error.expenseId).toBe('expense-123');
    expect(error.cause).toBe(cause);
  });

  it('should create error without optional parameters', () => {
    const error = new ExpenseError(
      'EXPENSE_NOT_FOUND',
      'Expense not found'
    );

    expect(error.code).toBe('EXPENSE_NOT_FOUND');
    expect(error.message).toBe('Expense not found');
    expect(error.expenseId).toBeUndefined();
    expect(error.cause).toBeUndefined();
  });

  it('should create error with expenseId but no cause', () => {
    const error = new ExpenseError(
      'EXPENSE_DELETED',
      'Expense has been deleted',
      'expense-456'
    );

    expect(error.expenseId).toBe('expense-456');
    expect(error.cause).toBeUndefined();
  });

  it('should handle EXPENSE_NOT_FOUND error code', () => {
    const error = new ExpenseError('EXPENSE_NOT_FOUND', 'Not found');
    expect(error.code).toBe('EXPENSE_NOT_FOUND');
  });

  it('should handle EXPENSE_DELETED error code', () => {
    const error = new ExpenseError('EXPENSE_DELETED', 'Deleted');
    expect(error.code).toBe('EXPENSE_DELETED');
  });

  it('should handle EXPENSE_ALREADY_VALIDATED error code', () => {
    const error = new ExpenseError('EXPENSE_ALREADY_VALIDATED', 'Already validated');
    expect(error.code).toBe('EXPENSE_ALREADY_VALIDATED');
  });

  it('should handle INVALID_EXPENSE_DATA error code', () => {
    const error = new ExpenseError('INVALID_EXPENSE_DATA', 'Invalid data');
    expect(error.code).toBe('INVALID_EXPENSE_DATA');
  });

  it('should handle CFDI_VALIDATION_FAILED error code', () => {
    const error = new ExpenseError('CFDI_VALIDATION_FAILED', 'CFDI invalid');
    expect(error.code).toBe('CFDI_VALIDATION_FAILED');
  });

  it('should handle CFDI_ALREADY_ATTACHED error code', () => {
    const error = new ExpenseError('CFDI_ALREADY_ATTACHED', 'Duplicate UUID');
    expect(error.code).toBe('CFDI_ALREADY_ATTACHED');
  });

  it('should handle RFC_MISMATCH error code', () => {
    const error = new ExpenseError('RFC_MISMATCH', 'RFC does not match');
    expect(error.code).toBe('RFC_MISMATCH');
  });

  it('should handle RECEIPT_UPLOAD_FAILED error code', () => {
    const error = new ExpenseError('RECEIPT_UPLOAD_FAILED', 'Upload failed');
    expect(error.code).toBe('RECEIPT_UPLOAD_FAILED');
  });

  it('should handle OCR_SERVICE_UNAVAILABLE error code', () => {
    const error = new ExpenseError('OCR_SERVICE_UNAVAILABLE', 'OCR down');
    expect(error.code).toBe('OCR_SERVICE_UNAVAILABLE');
  });

  it('should handle FILE_TOO_LARGE error code', () => {
    const error = new ExpenseError('FILE_TOO_LARGE', 'File exceeds 10MB');
    expect(error.code).toBe('FILE_TOO_LARGE');
  });

  it('should handle UNSUPPORTED_FILE_TYPE error code', () => {
    const error = new ExpenseError('UNSUPPORTED_FILE_TYPE', 'Only JPG/PNG/PDF allowed');
    expect(error.code).toBe('UNSUPPORTED_FILE_TYPE');
  });

  it('should handle DUPLICATE_EXPENSE error code', () => {
    const error = new ExpenseError('DUPLICATE_EXPENSE', 'Expense already exists');
    expect(error.code).toBe('DUPLICATE_EXPENSE');
  });
});

describe('isExpenseError', () => {
  it('should return true for ExpenseError instances', () => {
    const error = new ExpenseError('EXPENSE_NOT_FOUND', 'Not found');
    expect(isExpenseError(error)).toBe(true);
  });

  it('should return false for regular Error instances', () => {
    const error = new Error('Regular error');
    expect(isExpenseError(error)).toBe(false);
  });

  it('should return false for non-Error objects', () => {
    expect(isExpenseError({})).toBe(false);
    expect(isExpenseError({ code: 'SOME_CODE' })).toBe(false);
    expect(isExpenseError(null)).toBe(false);
    expect(isExpenseError(undefined)).toBe(false);
  });

  it('should return false for objects with wrong instanceof check', () => {
    const fakeError = {
      name: 'ExpenseError',
      code: 'EXPENSE_NOT_FOUND',
      message: 'Not found',
    };
    expect(isExpenseError(fakeError)).toBe(false);
  });

  it('should handle error with cause chain', () => {
    const rootCause = new Error('Root cause');
    const expenseError = new ExpenseError(
      'RECEIPT_UPLOAD_FAILED',
      'Failed to upload',
      'exp-123',
      rootCause
    );
    expect(isExpenseError(expenseError)).toBe(true);
    expect(expenseError.cause).toBe(rootCause);
  });
});
