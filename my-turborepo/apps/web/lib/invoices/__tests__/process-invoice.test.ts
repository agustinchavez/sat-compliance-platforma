/**
 * Tests for Process Invoice Bridge (Component 17)
 *
 * Tests the public API for invoice workflow processing.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  processInvoice,
  getProcessingStatus,
  fireCancellationWorkflow,
  retryFailedJob,
  removeJob,
} from '../process-invoice';
import { InvoiceStatus } from '../types';

// ============================================================================
// Mocks
// ============================================================================

const mockAdd = vi.fn();
const mockGetJob = vi.fn();

vi.mock('@/lib/queue', () => ({
  invoiceQueue: {
    add: (...args: unknown[]) => mockAdd(...args),
    getJob: (...args: unknown[]) => mockGetJob(...args),
  },
  getStampJobId: vi.fn((invoiceId: string) => `stamp-${invoiceId}`),
}));

const mockSupabaseSingle = vi.fn();

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: vi.fn(() => ({
            single: mockSupabaseSingle,
          })),
        })),
      })),
    })),
  })),
}));

const mockExecuteWorkflow = vi.fn();

vi.mock('@/lib/workflows/engine', () => {
  return {
    WorkflowEngine: class MockWorkflowEngine {
      executeWorkflow = mockExecuteWorkflow;
    },
  };
});

// ============================================================================
// processInvoice Tests
// ============================================================================

describe('processInvoice', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAdd.mockResolvedValue({ id: 'job-123' });
  });

  it('enqueues stamp job for draft invoice', async () => {
    mockSupabaseSingle.mockResolvedValue({
      data: { id: 'inv-123', status: InvoiceStatus.DRAFT },
      error: null,
    });

    const result = await processInvoice('inv-123', 'org-456');

    expect(result.jobId).toBe('job-123');
    expect(mockAdd).toHaveBeenCalledWith(
      'stamp-invoice',
      {
        invoiceId: 'inv-123',
        organizationId: 'org-456',
        language: 'es',
        attemptNumber: 1,
      },
      { jobId: 'stamp-inv-123' }
    );
  });

  it('accepts English language parameter', async () => {
    mockSupabaseSingle.mockResolvedValue({
      data: { id: 'inv-123', status: InvoiceStatus.DRAFT },
      error: null,
    });

    await processInvoice('inv-123', 'org-456', 'en');

    expect(mockAdd).toHaveBeenCalledWith(
      'stamp-invoice',
      expect.objectContaining({ language: 'en' }),
      expect.any(Object)
    );
  });

  it('throws error for non-existent invoice', async () => {
    mockSupabaseSingle.mockResolvedValue({
      data: null,
      error: { message: 'Not found' },
    });

    await expect(processInvoice('inv-missing', 'org-456')).rejects.toThrow(
      'Invoice not found'
    );
  });

  it('throws error for already stamped invoice', async () => {
    mockSupabaseSingle.mockResolvedValue({
      data: { id: 'inv-123', status: InvoiceStatus.STAMPED },
      error: null,
    });

    await expect(processInvoice('inv-123', 'org-456')).rejects.toThrow(
      'already stamped'
    );
  });

  it('throws error for invoice already being processed', async () => {
    mockSupabaseSingle.mockResolvedValue({
      data: { id: 'inv-123', status: InvoiceStatus.PENDING_STAMP },
      error: null,
    });

    await expect(processInvoice('inv-123', 'org-456')).rejects.toThrow(
      'already being processed'
    );
  });

  it('throws error for non-draft invoice', async () => {
    mockSupabaseSingle.mockResolvedValue({
      data: { id: 'inv-123', status: InvoiceStatus.SENT },
      error: null,
    });

    await expect(processInvoice('inv-123', 'org-456')).rejects.toThrow(
      'Cannot transition'
    );
  });

  it('uses idempotent job ID', async () => {
    mockSupabaseSingle.mockResolvedValue({
      data: { id: 'inv-123', status: InvoiceStatus.DRAFT },
      error: null,
    });

    await processInvoice('inv-123', 'org-456');

    expect(mockAdd).toHaveBeenCalledWith(
      'stamp-invoice',
      expect.any(Object),
      { jobId: 'stamp-inv-123' }
    );
  });
});

// ============================================================================
// getProcessingStatus Tests
// ============================================================================

describe('getProcessingStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns not_found when job does not exist', async () => {
    mockGetJob.mockResolvedValue(null);

    const result = await getProcessingStatus('inv-123');

    expect(result.status).toBe('not_found');
  });

  it('returns waiting status for waiting job', async () => {
    mockGetJob.mockResolvedValue({
      id: 'job-123',
      getState: vi.fn().mockResolvedValue('waiting'),
    });

    const result = await getProcessingStatus('inv-123');

    expect(result.status).toBe('waiting');
    expect(result.jobId).toBe('job-123');
  });

  it('returns waiting status for delayed job', async () => {
    mockGetJob.mockResolvedValue({
      id: 'job-123',
      getState: vi.fn().mockResolvedValue('delayed'),
    });

    const result = await getProcessingStatus('inv-123');

    expect(result.status).toBe('waiting');
  });

  it('returns waiting status for prioritized job', async () => {
    mockGetJob.mockResolvedValue({
      id: 'job-123',
      getState: vi.fn().mockResolvedValue('prioritized'),
    });

    const result = await getProcessingStatus('inv-123');

    expect(result.status).toBe('waiting');
  });

  it('returns active status with progress', async () => {
    mockGetJob.mockResolvedValue({
      id: 'job-123',
      getState: vi.fn().mockResolvedValue('active'),
      progress: 50,
    });

    const result = await getProcessingStatus('inv-123');

    expect(result.status).toBe('active');
    expect(result.progress).toBe(50);
  });

  it('returns active status without progress when not a number', async () => {
    mockGetJob.mockResolvedValue({
      id: 'job-123',
      getState: vi.fn().mockResolvedValue('active'),
      progress: { step: 'signing' },
    });

    const result = await getProcessingStatus('inv-123');

    expect(result.status).toBe('active');
    expect(result.progress).toBeUndefined();
  });

  it('returns completed status', async () => {
    mockGetJob.mockResolvedValue({
      id: 'job-123',
      getState: vi.fn().mockResolvedValue('completed'),
    });

    const result = await getProcessingStatus('inv-123');

    expect(result.status).toBe('completed');
    expect(result.jobId).toBe('job-123');
  });

  it('returns failed status with reason', async () => {
    mockGetJob.mockResolvedValue({
      id: 'job-123',
      getState: vi.fn().mockResolvedValue('failed'),
      failedReason: 'PAC connection timeout',
    });

    const result = await getProcessingStatus('inv-123');

    expect(result.status).toBe('failed');
    expect(result.failReason).toBe('PAC connection timeout');
  });

  it('returns failed status with default reason when none provided', async () => {
    mockGetJob.mockResolvedValue({
      id: 'job-123',
      getState: vi.fn().mockResolvedValue('failed'),
      failedReason: null,
    });

    const result = await getProcessingStatus('inv-123');

    expect(result.status).toBe('failed');
    expect(result.failReason).toBe('Unknown error');
  });

  it('handles errors gracefully', async () => {
    mockGetJob.mockRejectedValue(new Error('Redis down'));

    const result = await getProcessingStatus('inv-123');

    expect(result.status).toBe('not_found');
  });

  it('returns not_found for unknown job state', async () => {
    mockGetJob.mockResolvedValue({
      id: 'job-123',
      getState: vi.fn().mockResolvedValue('unknown-state'),
    });

    const result = await getProcessingStatus('inv-123');

    expect(result.status).toBe('not_found');
  });
});

// ============================================================================
// fireCancellationWorkflow Tests
// ============================================================================

describe('fireCancellationWorkflow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockExecuteWorkflow.mockResolvedValue({});
  });

  it('fires workflow with correct event structure', async () => {
    await fireCancellationWorkflow('inv-123', 'org-456', '02');

    expect(mockExecuteWorkflow).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'invoice.cancelled',
        invoiceId: 'inv-123',
        organizationId: 'org-456',
        metadata: expect.objectContaining({ motivo: '02' }),
      })
    );
  });

  it('includes folio sustitucion for motivo 01', async () => {
    await fireCancellationWorkflow('inv-123', 'org-456', '01', 'UUID-REPLACEMENT');

    expect(mockExecuteWorkflow).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          motivo: '01',
          folioSustitucion: 'UUID-REPLACEMENT',
        }),
      })
    );
  });

  it('includes triggeredAt timestamp', async () => {
    const before = new Date().toISOString();

    await fireCancellationWorkflow('inv-123', 'org-456', '02');

    const call = mockExecuteWorkflow.mock.calls[0][0];
    expect(call.triggeredAt).toBeDefined();
    expect(call.triggeredAt >= before).toBe(true);
  });

  it('supports all cancellation motivos', async () => {
    await fireCancellationWorkflow('inv-1', 'org', '01', 'uuid');
    await fireCancellationWorkflow('inv-2', 'org', '02');
    await fireCancellationWorkflow('inv-3', 'org', '03');
    await fireCancellationWorkflow('inv-4', 'org', '04');

    expect(mockExecuteWorkflow).toHaveBeenCalledTimes(4);
  });
});

// ============================================================================
// retryFailedJob Tests
// ============================================================================

describe('retryFailedJob', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('retries failed job and returns job ID', async () => {
    const mockRetry = vi.fn().mockResolvedValue(undefined);
    mockGetJob.mockResolvedValue({
      id: 'job-123',
      getState: vi.fn().mockResolvedValue('failed'),
      retry: mockRetry,
    });

    const result = await retryFailedJob('inv-123');

    expect(result).toEqual({ jobId: 'job-123' });
    expect(mockRetry).toHaveBeenCalled();
  });

  it('returns null when job does not exist', async () => {
    mockGetJob.mockResolvedValue(null);

    const result = await retryFailedJob('inv-123');

    expect(result).toBeNull();
  });

  it('returns null when job is not in failed state', async () => {
    mockGetJob.mockResolvedValue({
      id: 'job-123',
      getState: vi.fn().mockResolvedValue('completed'),
      retry: vi.fn(),
    });

    const result = await retryFailedJob('inv-123');

    expect(result).toBeNull();
  });

  it('returns null on error', async () => {
    mockGetJob.mockRejectedValue(new Error('Redis error'));

    const result = await retryFailedJob('inv-123');

    expect(result).toBeNull();
  });

  it('uses correct job ID', async () => {
    mockGetJob.mockResolvedValue(null);

    await retryFailedJob('inv-abc');

    expect(mockGetJob).toHaveBeenCalledWith('stamp-inv-abc');
  });
});

// ============================================================================
// removeJob Tests
// ============================================================================

describe('removeJob', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('removes job and returns true', async () => {
    const mockRemove = vi.fn().mockResolvedValue(undefined);
    mockGetJob.mockResolvedValue({
      remove: mockRemove,
    });

    const result = await removeJob('inv-123');

    expect(result).toBe(true);
    expect(mockRemove).toHaveBeenCalled();
  });

  it('returns false when job does not exist', async () => {
    mockGetJob.mockResolvedValue(null);

    const result = await removeJob('inv-123');

    expect(result).toBe(false);
  });

  it('returns false on error', async () => {
    mockGetJob.mockRejectedValue(new Error('Redis error'));

    const result = await removeJob('inv-123');

    expect(result).toBe(false);
  });

  it('uses correct job ID', async () => {
    mockGetJob.mockResolvedValue(null);

    await removeJob('inv-xyz');

    expect(mockGetJob).toHaveBeenCalledWith('stamp-inv-xyz');
  });
});
