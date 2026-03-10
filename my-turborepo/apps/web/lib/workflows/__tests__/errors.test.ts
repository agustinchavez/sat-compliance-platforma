/**
 * Tests for Workflow Errors (Component 17)
 *
 * Tests error classes, type guards, and factory functions.
 */

import { describe, it, expect } from 'vitest';
import {
  WorkflowError,
  isWorkflowError,
  invalidTransitionError,
  invoiceNotFoundError,
  terminalStateError,
  jobEnqueueFailedError,
  concurrentProcessingError,
  invalidEventError,
  missingRequiredDataError,
  stampJobFailedError,
  redisConnectionError,
  isRetryableError,
  isFatalError,
  getErrorMessage,
} from '../errors';
import type { WorkflowErrorCode } from '../errors';

// ============================================================================
// WorkflowError Class Tests
// ============================================================================

describe('WorkflowError', () => {
  describe('Constructor', () => {
    it('creates error with code and message', () => {
      const error = new WorkflowError(
        'INVALID_TRANSITION',
        'Cannot transition from draft to paid'
      );

      expect(error.code).toBe('INVALID_TRANSITION');
      expect(error.message).toBe('Cannot transition from draft to paid');
      expect(error.name).toBe('WorkflowError');
      expect(error.invoiceId).toBeUndefined();
      expect(error.cause).toBeUndefined();
    });

    it('creates error with invoiceId', () => {
      const error = new WorkflowError(
        'INVOICE_NOT_FOUND',
        'Invoice not found',
        'inv-123'
      );

      expect(error.invoiceId).toBe('inv-123');
    });

    it('creates error with cause', () => {
      const cause = new Error('Database connection failed');
      const error = new WorkflowError(
        'JOB_ENQUEUE_FAILED',
        'Failed to enqueue job',
        'inv-123',
        cause
      );

      expect(error.cause).toBe(cause);
      expect(error.cause?.message).toBe('Database connection failed');
    });

    it('extends Error properly', () => {
      const error = new WorkflowError('INVALID_TRANSITION', 'Test');

      expect(error instanceof Error).toBe(true);
      expect(error instanceof WorkflowError).toBe(true);
    });

    it('has a stack trace', () => {
      const error = new WorkflowError('INVALID_TRANSITION', 'Test');

      expect(error.stack).toBeDefined();
      expect(error.stack).toContain('WorkflowError');
    });
  });

  describe('toJSON', () => {
    it('serializes error without optional fields', () => {
      const error = new WorkflowError('INVALID_TRANSITION', 'Test message');
      const json = error.toJSON();

      expect(json).toEqual({
        name: 'WorkflowError',
        code: 'INVALID_TRANSITION',
        message: 'Test message',
        invoiceId: undefined,
        cause: undefined,
      });
    });

    it('serializes error with all fields', () => {
      const cause = new Error('Original error');
      const error = new WorkflowError(
        'STAMP_JOB_FAILED',
        'Stamp failed',
        'inv-456',
        cause
      );
      const json = error.toJSON();

      expect(json).toEqual({
        name: 'WorkflowError',
        code: 'STAMP_JOB_FAILED',
        message: 'Stamp failed',
        invoiceId: 'inv-456',
        cause: 'Original error',
      });
    });
  });

  describe('toString', () => {
    it('formats error without invoiceId', () => {
      const error = new WorkflowError('REDIS_CONNECTION_ERROR', 'Connection failed');

      expect(error.toString()).toBe(
        'WorkflowError [REDIS_CONNECTION_ERROR]: Connection failed'
      );
    });

    it('formats error with invoiceId', () => {
      const error = new WorkflowError(
        'INVOICE_NOT_FOUND',
        'Not found',
        'inv-789'
      );

      expect(error.toString()).toBe(
        'WorkflowError [INVOICE_NOT_FOUND]: Not found (invoice: inv-789)'
      );
    });
  });
});

// ============================================================================
// Type Guard Tests
// ============================================================================

describe('isWorkflowError', () => {
  it('returns true for WorkflowError instances', () => {
    const error = new WorkflowError('INVALID_TRANSITION', 'Test');

    expect(isWorkflowError(error)).toBe(true);
  });

  it('returns false for regular Error', () => {
    const error = new Error('Test');

    expect(isWorkflowError(error)).toBe(false);
  });

  it('returns false for null', () => {
    expect(isWorkflowError(null)).toBe(false);
  });

  it('returns false for undefined', () => {
    expect(isWorkflowError(undefined)).toBe(false);
  });

  it('returns false for plain objects', () => {
    const obj = { code: 'INVALID_TRANSITION', message: 'Test' };

    expect(isWorkflowError(obj)).toBe(false);
  });

  it('returns false for strings', () => {
    expect(isWorkflowError('WorkflowError')).toBe(false);
  });
});

// ============================================================================
// Error Factory Functions Tests
// ============================================================================

describe('Error Factory Functions', () => {
  describe('invalidTransitionError', () => {
    it('creates INVALID_TRANSITION error', () => {
      const error = invalidTransitionError('draft', 'paid', 'inv-123');

      expect(error.code).toBe('INVALID_TRANSITION');
      expect(error.message).toBe("Cannot transition from 'draft' to 'paid'");
      expect(error.invoiceId).toBe('inv-123');
    });

    it('works without invoiceId', () => {
      const error = invalidTransitionError('stamped', 'draft');

      expect(error.code).toBe('INVALID_TRANSITION');
      expect(error.invoiceId).toBeUndefined();
    });
  });

  describe('invoiceNotFoundError', () => {
    it('creates INVOICE_NOT_FOUND error', () => {
      const error = invoiceNotFoundError('inv-missing');

      expect(error.code).toBe('INVOICE_NOT_FOUND');
      expect(error.message).toBe('Invoice not found: inv-missing');
      expect(error.invoiceId).toBe('inv-missing');
    });
  });

  describe('terminalStateError', () => {
    it('creates TERMINAL_STATE error', () => {
      const error = terminalStateError('cancelled', 'inv-123');

      expect(error.code).toBe('TERMINAL_STATE');
      expect(error.message).toBe(
        "Invoice is in terminal state 'cancelled' and cannot be modified"
      );
      expect(error.invoiceId).toBe('inv-123');
    });
  });

  describe('jobEnqueueFailedError', () => {
    it('creates JOB_ENQUEUE_FAILED error', () => {
      const cause = new Error('Redis down');
      const error = jobEnqueueFailedError('invoice-processing', 'inv-123', cause);

      expect(error.code).toBe('JOB_ENQUEUE_FAILED');
      expect(error.message).toBe("Failed to enqueue job to 'invoice-processing' queue");
      expect(error.invoiceId).toBe('inv-123');
      expect(error.cause).toBe(cause);
    });
  });

  describe('concurrentProcessingError', () => {
    it('creates CONCURRENT_PROCESSING error', () => {
      const error = concurrentProcessingError('inv-busy');

      expect(error.code).toBe('CONCURRENT_PROCESSING');
      expect(error.message).toBe('Invoice inv-busy is already being processed');
      expect(error.invoiceId).toBe('inv-busy');
    });
  });

  describe('invalidEventError', () => {
    it('creates INVALID_EVENT error', () => {
      const error = invalidEventError('invoice.unknown_event');

      expect(error.code).toBe('INVALID_EVENT');
      expect(error.message).toBe('Unknown event type: invoice.unknown_event');
    });
  });

  describe('missingRequiredDataError', () => {
    it('creates MISSING_REQUIRED_DATA error', () => {
      const error = missingRequiredDataError('customer_email', 'inv-123');

      expect(error.code).toBe('MISSING_REQUIRED_DATA');
      expect(error.message).toBe('Missing required data: customer_email');
      expect(error.invoiceId).toBe('inv-123');
    });
  });

  describe('stampJobFailedError', () => {
    it('creates STAMP_JOB_FAILED error', () => {
      const cause = new Error('PAC timeout');
      const error = stampJobFailedError('inv-123', 'PAC service unavailable', cause);

      expect(error.code).toBe('STAMP_JOB_FAILED');
      expect(error.message).toBe('Stamp job failed: PAC service unavailable');
      expect(error.invoiceId).toBe('inv-123');
      expect(error.cause).toBe(cause);
    });
  });

  describe('redisConnectionError', () => {
    it('creates REDIS_CONNECTION_ERROR', () => {
      const cause = new Error('ECONNREFUSED');
      const error = redisConnectionError(cause);

      expect(error.code).toBe('REDIS_CONNECTION_ERROR');
      expect(error.message).toBe('Cannot connect to Redis for job queue');
      expect(error.cause).toBe(cause);
    });

    it('works without cause', () => {
      const error = redisConnectionError();

      expect(error.code).toBe('REDIS_CONNECTION_ERROR');
      expect(error.cause).toBeUndefined();
    });
  });
});

// ============================================================================
// Error Code Helpers Tests
// ============================================================================

describe('isRetryableError', () => {
  it('returns true for JOB_ENQUEUE_FAILED', () => {
    expect(isRetryableError('JOB_ENQUEUE_FAILED')).toBe(true);
  });

  it('returns true for REDIS_CONNECTION_ERROR', () => {
    expect(isRetryableError('REDIS_CONNECTION_ERROR')).toBe(true);
  });

  it('returns false for INVALID_TRANSITION', () => {
    expect(isRetryableError('INVALID_TRANSITION')).toBe(false);
  });

  it('returns false for INVOICE_NOT_FOUND', () => {
    expect(isRetryableError('INVOICE_NOT_FOUND')).toBe(false);
  });

  it('returns false for TERMINAL_STATE', () => {
    expect(isRetryableError('TERMINAL_STATE')).toBe(false);
  });

  it('returns false for STAMP_JOB_FAILED', () => {
    expect(isRetryableError('STAMP_JOB_FAILED')).toBe(false);
  });
});

describe('isFatalError', () => {
  it('returns true for INVALID_TRANSITION', () => {
    expect(isFatalError('INVALID_TRANSITION')).toBe(true);
  });

  it('returns true for INVOICE_NOT_FOUND', () => {
    expect(isFatalError('INVOICE_NOT_FOUND')).toBe(true);
  });

  it('returns true for TERMINAL_STATE', () => {
    expect(isFatalError('TERMINAL_STATE')).toBe(true);
  });

  it('returns true for INVALID_EVENT', () => {
    expect(isFatalError('INVALID_EVENT')).toBe(true);
  });

  it('returns false for JOB_ENQUEUE_FAILED', () => {
    expect(isFatalError('JOB_ENQUEUE_FAILED')).toBe(false);
  });

  it('returns false for REDIS_CONNECTION_ERROR', () => {
    expect(isFatalError('REDIS_CONNECTION_ERROR')).toBe(false);
  });

  it('returns false for STAMP_JOB_FAILED', () => {
    expect(isFatalError('STAMP_JOB_FAILED')).toBe(false);
  });
});

describe('getErrorMessage', () => {
  it('returns Spanish message for INVALID_TRANSITION', () => {
    expect(getErrorMessage('INVALID_TRANSITION')).toBe(
      'La transición de estado solicitada no es válida'
    );
  });

  it('returns Spanish message for INVOICE_NOT_FOUND', () => {
    expect(getErrorMessage('INVOICE_NOT_FOUND')).toBe(
      'No se encontró la factura'
    );
  });

  it('returns Spanish message for WORKFLOW_ACTION_FAILED', () => {
    expect(getErrorMessage('WORKFLOW_ACTION_FAILED')).toBe(
      'Una o más acciones del flujo fallaron'
    );
  });

  it('returns Spanish message for JOB_ENQUEUE_FAILED', () => {
    expect(getErrorMessage('JOB_ENQUEUE_FAILED')).toBe(
      'No se pudo encolar el trabajo'
    );
  });

  it('returns Spanish message for TERMINAL_STATE', () => {
    expect(getErrorMessage('TERMINAL_STATE')).toBe(
      'La factura está en un estado final y no puede ser modificada'
    );
  });

  it('returns Spanish message for STAMP_JOB_FAILED', () => {
    expect(getErrorMessage('STAMP_JOB_FAILED')).toBe(
      'El proceso de timbrado falló'
    );
  });

  it('returns Spanish message for CONCURRENT_PROCESSING', () => {
    expect(getErrorMessage('CONCURRENT_PROCESSING')).toBe(
      'La factura ya está siendo procesada'
    );
  });

  it('returns Spanish message for INVALID_EVENT', () => {
    expect(getErrorMessage('INVALID_EVENT')).toBe(
      'El tipo de evento no es válido'
    );
  });

  it('returns Spanish message for MISSING_REQUIRED_DATA', () => {
    expect(getErrorMessage('MISSING_REQUIRED_DATA')).toBe(
      'Faltan datos requeridos'
    );
  });

  it('returns Spanish message for REDIS_CONNECTION_ERROR', () => {
    expect(getErrorMessage('REDIS_CONNECTION_ERROR')).toBe(
      'Error de conexión con el servidor de colas'
    );
  });

  // Test all codes have messages
  it('has messages for all error codes', () => {
    const allCodes: WorkflowErrorCode[] = [
      'INVALID_TRANSITION',
      'INVOICE_NOT_FOUND',
      'WORKFLOW_ACTION_FAILED',
      'JOB_ENQUEUE_FAILED',
      'TERMINAL_STATE',
      'STAMP_JOB_FAILED',
      'CONCURRENT_PROCESSING',
      'INVALID_EVENT',
      'MISSING_REQUIRED_DATA',
      'REDIS_CONNECTION_ERROR',
    ];

    for (const code of allCodes) {
      const message = getErrorMessage(code);
      expect(message).toBeDefined();
      expect(typeof message).toBe('string');
      expect(message.length).toBeGreaterThan(0);
    }
  });
});

// ============================================================================
// Error Integration Tests
// ============================================================================

describe('Error Integration', () => {
  it('WorkflowError can be caught as Error', () => {
    let caught: Error | null = null;

    try {
      throw invoiceNotFoundError('inv-test');
    } catch (e) {
      caught = e as Error;
    }

    expect(caught).not.toBeNull();
    expect(caught?.message).toBe('Invoice not found: inv-test');
  });

  it('WorkflowError can be narrowed with type guard', () => {
    const error: unknown = invalidTransitionError('draft', 'cancelled');

    if (isWorkflowError(error)) {
      // TypeScript knows this is WorkflowError
      expect(error.code).toBe('INVALID_TRANSITION');
    } else {
      throw new Error('Should have been WorkflowError');
    }
  });

  it('Error message available for user display', () => {
    const error = stampJobFailedError('inv-123', 'PAC timeout');
    const userMessage = getErrorMessage(error.code);

    expect(userMessage).toBe('El proceso de timbrado falló');
    expect(error.message).toBe('Stamp job failed: PAC timeout'); // Technical message
  });
});
