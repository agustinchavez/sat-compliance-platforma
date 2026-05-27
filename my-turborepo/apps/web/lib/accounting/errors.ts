/**
 * Accounting Subsystem Errors (Components 21-23)
 */

export type AccountingErrorCode =
  // Chart of Accounts errors
  | 'ACCOUNT_NOT_FOUND'
  | 'ACCOUNT_CODE_EXISTS'
  | 'ACCOUNT_HAS_ENTRIES'
  | 'ACCOUNT_HAS_CHILDREN'
  | 'ACCOUNT_NOT_POSTABLE'
  | 'ACCOUNT_INACTIVE'
  | 'ACCOUNT_CODE_IMMUTABLE'
  | 'INVALID_ACCOUNT_CODE'
  | 'INVALID_HIERARCHY'
  | 'PARENT_NOT_FOUND'
  | 'MISSING_AGRUPADOR'
  // Journal Entry errors
  | 'ENTRY_NOT_FOUND'
  | 'ENTRY_IMBALANCED'
  | 'ENTRY_ALREADY_POSTED'
  | 'ENTRY_ALREADY_REVERSED'
  | 'ENTRY_NOT_DRAFT'
  | 'ENTRY_NOT_POSTED'
  | 'INVALID_ENTRY_DATE'
  | 'DUPLICATE_SOURCE_ENTRY'
  // Fiscal Period errors
  | 'PERIOD_NOT_FOUND'
  | 'PERIOD_CLOSED'
  | 'PERIOD_NOT_CLOSED'
  | 'PERIOD_ALREADY_OPEN'
  // Balance errors
  | 'SNAPSHOT_NOT_FOUND'
  | 'SNAPSHOT_SEALED'
  // FX errors
  | 'EXCHANGE_RATE_REQUIRED'
  | 'EXCHANGE_RATE_NOT_FOUND'
  // General
  | 'VALIDATION_ERROR'
  | 'INVALID_OPERATION';

export class AccountingError extends Error {
  constructor(
    public code: AccountingErrorCode,
    message: string,
    public entityId?: string,
    public cause?: Error
  ) {
    super(message);
    this.name = 'AccountingError';
  }
}

export function isAccountingError(err: unknown): err is AccountingError {
  return err instanceof AccountingError;
}
