/**
 * Workflow Errors (Component 17)
 *
 * Error types and classes for the workflow engine.
 */

// ============================================================================
// Error Codes
// ============================================================================

/**
 * Workflow error codes.
 */
export type WorkflowErrorCode =
  | 'INVALID_TRANSITION' // Attempted transition not in VALID_TRANSITIONS
  | 'INVOICE_NOT_FOUND' // Invoice ID doesn't exist or not in org
  | 'WORKFLOW_ACTION_FAILED' // One or more actions failed (non-fatal: logged)
  | 'JOB_ENQUEUE_FAILED' // BullMQ could not enqueue job
  | 'TERMINAL_STATE' // Invoice is in a terminal state, no transitions possible
  | 'STAMP_JOB_FAILED' // The stamp job itself failed after retries
  | 'CONCURRENT_PROCESSING' // Another job is already processing this invoice
  | 'INVALID_EVENT' // Event type is not recognized
  | 'MISSING_REQUIRED_DATA' // Required data for action is missing
  | 'REDIS_CONNECTION_ERROR'; // Cannot connect to Redis for BullMQ

// ============================================================================
// Error Class
// ============================================================================

/**
 * Custom error class for workflow-related errors.
 *
 * @example
 * ```typescript
 * throw new WorkflowError(
 *   'INVALID_TRANSITION',
 *   'Cannot transition from stamped to draft',
 *   'inv-123'
 * );
 * ```
 */
export class WorkflowError extends Error {
  /** Error code for programmatic handling */
  public readonly code: WorkflowErrorCode;
  /** Invoice ID related to this error (if applicable) */
  public readonly invoiceId?: string;
  /** Original error that caused this error */
  public readonly cause?: Error;

  constructor(
    code: WorkflowErrorCode,
    message: string,
    invoiceId?: string,
    cause?: Error
  ) {
    super(message);
    this.name = 'WorkflowError';
    this.code = code;
    this.invoiceId = invoiceId;
    this.cause = cause;

    // Maintains proper stack trace in V8 environments
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, WorkflowError);
    }
  }

  /**
   * Create a JSON representation of this error.
   */
  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      invoiceId: this.invoiceId,
      cause: this.cause?.message,
    };
  }

  /**
   * Create a string representation of this error.
   */
  toString(): string {
    let str = `WorkflowError [${this.code}]: ${this.message}`;
    if (this.invoiceId) {
      str += ` (invoice: ${this.invoiceId})`;
    }
    return str;
  }
}

// ============================================================================
// Type Guard
// ============================================================================

/**
 * Check if an error is a WorkflowError.
 */
export function isWorkflowError(err: unknown): err is WorkflowError {
  return err instanceof WorkflowError;
}

// ============================================================================
// Error Factory Functions
// ============================================================================

/**
 * Create an INVALID_TRANSITION error.
 */
export function invalidTransitionError(
  from: string,
  to: string,
  invoiceId?: string
): WorkflowError {
  return new WorkflowError(
    'INVALID_TRANSITION',
    `Cannot transition from '${from}' to '${to}'`,
    invoiceId
  );
}

/**
 * Create an INVOICE_NOT_FOUND error.
 */
export function invoiceNotFoundError(invoiceId: string): WorkflowError {
  return new WorkflowError(
    'INVOICE_NOT_FOUND',
    `Invoice not found: ${invoiceId}`,
    invoiceId
  );
}

/**
 * Create a TERMINAL_STATE error.
 */
export function terminalStateError(
  status: string,
  invoiceId?: string
): WorkflowError {
  return new WorkflowError(
    'TERMINAL_STATE',
    `Invoice is in terminal state '${status}' and cannot be modified`,
    invoiceId
  );
}

/**
 * Create a JOB_ENQUEUE_FAILED error.
 */
export function jobEnqueueFailedError(
  queueName: string,
  invoiceId?: string,
  cause?: Error
): WorkflowError {
  return new WorkflowError(
    'JOB_ENQUEUE_FAILED',
    `Failed to enqueue job to '${queueName}' queue`,
    invoiceId,
    cause
  );
}

/**
 * Create a CONCURRENT_PROCESSING error.
 */
export function concurrentProcessingError(invoiceId: string): WorkflowError {
  return new WorkflowError(
    'CONCURRENT_PROCESSING',
    `Invoice ${invoiceId} is already being processed`,
    invoiceId
  );
}

/**
 * Create an INVALID_EVENT error.
 */
export function invalidEventError(eventType: string): WorkflowError {
  return new WorkflowError(
    'INVALID_EVENT',
    `Unknown event type: ${eventType}`
  );
}

/**
 * Create a MISSING_REQUIRED_DATA error.
 */
export function missingRequiredDataError(
  dataName: string,
  invoiceId?: string
): WorkflowError {
  return new WorkflowError(
    'MISSING_REQUIRED_DATA',
    `Missing required data: ${dataName}`,
    invoiceId
  );
}

/**
 * Create a STAMP_JOB_FAILED error.
 */
export function stampJobFailedError(
  invoiceId: string,
  reason: string,
  cause?: Error
): WorkflowError {
  return new WorkflowError(
    'STAMP_JOB_FAILED',
    `Stamp job failed: ${reason}`,
    invoiceId,
    cause
  );
}

/**
 * Create a REDIS_CONNECTION_ERROR.
 */
export function redisConnectionError(cause?: Error): WorkflowError {
  return new WorkflowError(
    'REDIS_CONNECTION_ERROR',
    'Cannot connect to Redis for job queue',
    undefined,
    cause
  );
}

// ============================================================================
// Error Code Helpers
// ============================================================================

/**
 * Check if an error code indicates a retryable error.
 * Only certain errors should trigger job retries.
 */
export function isRetryableError(code: WorkflowErrorCode): boolean {
  const retryableCodes: WorkflowErrorCode[] = [
    'JOB_ENQUEUE_FAILED',
    'REDIS_CONNECTION_ERROR',
  ];
  return retryableCodes.includes(code);
}

/**
 * Check if an error code indicates a fatal error.
 * Fatal errors should not be retried and require manual intervention.
 */
export function isFatalError(code: WorkflowErrorCode): boolean {
  const fatalCodes: WorkflowErrorCode[] = [
    'INVALID_TRANSITION',
    'INVOICE_NOT_FOUND',
    'TERMINAL_STATE',
    'INVALID_EVENT',
  ];
  return fatalCodes.includes(code);
}

/**
 * Get a user-friendly message for an error code.
 */
export function getErrorMessage(code: WorkflowErrorCode): string {
  const messages: Record<WorkflowErrorCode, string> = {
    INVALID_TRANSITION: 'La transición de estado solicitada no es válida',
    INVOICE_NOT_FOUND: 'No se encontró la factura',
    WORKFLOW_ACTION_FAILED: 'Una o más acciones del flujo fallaron',
    JOB_ENQUEUE_FAILED: 'No se pudo encolar el trabajo',
    TERMINAL_STATE: 'La factura está en un estado final y no puede ser modificada',
    STAMP_JOB_FAILED: 'El proceso de timbrado falló',
    CONCURRENT_PROCESSING: 'La factura ya está siendo procesada',
    INVALID_EVENT: 'El tipo de evento no es válido',
    MISSING_REQUIRED_DATA: 'Faltan datos requeridos',
    REDIS_CONNECTION_ERROR: 'Error de conexión con el servidor de colas',
  };
  return messages[code];
}
