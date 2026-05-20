/**
 * Expense Service Errors (Component 20)
 */

export type ExpenseErrorCode =
  | 'EXPENSE_NOT_FOUND'
  | 'EXPENSE_DELETED'
  | 'EXPENSE_ALREADY_VALIDATED'    // Cannot modify a validated expense
  | 'INVALID_EXPENSE_DATA'
  | 'RECEIPT_UPLOAD_FAILED'
  | 'OCR_EXTRACTION_FAILED'
  | 'OCR_SERVICE_UNAVAILABLE'      // AI service is down — non-fatal, expense can be created manually
  | 'CFDI_VALIDATION_FAILED'       // XML structure is invalid
  | 'RFC_MISMATCH'                 // CFDI receptor RFC ≠ organization RFC
  | 'CFDI_ALREADY_ATTACHED'        // Another expense already has this CFDI UUID
  | 'FILE_TOO_LARGE'
  | 'UNSUPPORTED_FILE_TYPE';

export class ExpenseError extends Error {
  constructor(
    public code: ExpenseErrorCode,
    message: string,
    public expenseId?: string,
    public cause?: Error
  ) {
    super(message);
    this.name = 'ExpenseError';
  }
}

export function isExpenseError(err: unknown): err is ExpenseError {
  return err instanceof ExpenseError;
}
