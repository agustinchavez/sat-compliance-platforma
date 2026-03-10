/**
 * Process Invoice Bridge (Component 17)
 *
 * Public API for the invoice workflow.
 * Called by Server Actions or API routes when user clicks "Submit to SAT".
 */

import { createClient } from '@supabase/supabase-js';
import { invoiceQueue, getStampJobId } from '@/lib/queue';
import { WorkflowEngine } from '@/lib/workflows/engine';
import { InvoiceStatus } from '@/lib/invoices/types';
import { WorkflowError, invalidTransitionError, invoiceNotFoundError } from '@/lib/workflows/errors';
import type { StampJobPayload, ProcessingStatusResult } from '@/lib/workflows/types';

// ============================================================================
// Process Invoice
// ============================================================================

/**
 * Enqueues an invoice for sign → stamp → PDF processing.
 *
 * Returns immediately — does NOT wait for processing to complete.
 * Use getProcessingStatus() or BullMQ job events to track completion.
 *
 * @param invoiceId - Must be in 'draft' status
 * @param organizationId - Organization context
 * @param language - For PDF generation ('es' | 'en')
 * @returns BullMQ job ID for status tracking
 * @throws WorkflowError if invoice not found or not in draft status
 */
export async function processInvoice(
  invoiceId: string,
  organizationId: string,
  language: 'es' | 'en' = 'es'
): Promise<{ jobId: string }> {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Validate invoice exists and is in draft status before enqueueing
  const { data: invoice, error } = await supabase
    .from('invoices')
    .select('id, status')
    .eq('id', invoiceId)
    .eq('organization_id', organizationId)
    .single();

  if (error || !invoice) {
    throw invoiceNotFoundError(invoiceId);
  }

  // Only draft invoices can be submitted for processing
  if (invoice.status !== InvoiceStatus.DRAFT) {
    if (invoice.status === InvoiceStatus.STAMPED) {
      throw new WorkflowError(
        'INVALID_TRANSITION',
        'Invoice is already stamped',
        invoiceId
      );
    }
    if (invoice.status === InvoiceStatus.PENDING_STAMP) {
      throw new WorkflowError(
        'CONCURRENT_PROCESSING',
        'Invoice is already being processed',
        invoiceId
      );
    }
    throw invalidTransitionError(invoice.status, InvoiceStatus.PENDING_STAMP, invoiceId);
  }

  // Enqueue the job with idempotent job ID
  const jobId = getStampJobId(invoiceId);

  const payload: StampJobPayload = {
    invoiceId,
    organizationId,
    language,
    attemptNumber: 1,
  };

  const job = await invoiceQueue.add('stamp-invoice', payload, {
    jobId,
  });

  console.log(
    `[process-invoice] Enqueued job ${job.id} for invoice ${invoiceId}`
  );

  return { jobId: job.id! };
}

// ============================================================================
// Processing Status
// ============================================================================

/**
 * Gets the current processing status of an invoice job.
 *
 * Used for polling from the UI to show progress.
 *
 * @param invoiceId - Invoice ID to check
 * @returns ProcessingStatusResult with current status
 */
export async function getProcessingStatus(
  invoiceId: string
): Promise<ProcessingStatusResult> {
  const jobId = getStampJobId(invoiceId);

  try {
    const job = await invoiceQueue.getJob(jobId);

    if (!job) {
      return { status: 'not_found' };
    }

    const state = await job.getState();

    switch (state) {
      case 'waiting':
      case 'delayed':
      case 'prioritized':
        return { status: 'waiting', jobId: job.id };

      case 'active':
        const progress = job.progress;
        return {
          status: 'active',
          jobId: job.id,
          progress: typeof progress === 'number' ? progress : undefined,
        };

      case 'completed':
        return { status: 'completed', jobId: job.id };

      case 'failed':
        const failedReason = job.failedReason ?? 'Unknown error';
        return { status: 'failed', jobId: job.id, failReason: failedReason };

      default:
        return { status: 'not_found' };
    }
  } catch (error) {
    console.error(
      `[process-invoice] Error getting status for ${invoiceId}:`,
      error
    );
    return { status: 'not_found' };
  }
}

// ============================================================================
// Cancellation Workflow
// ============================================================================

/**
 * Fires a workflow event directly for invoice cancellation.
 *
 * Cancellation is synchronous because it requires user confirmation
 * and motivo selection. The actual PAC cancellation is done by the
 * caller (Component 15's cancelStampedInvoice).
 *
 * This function fires the post-cancellation workflow:
 * - Cancels scheduled payment reminders
 * - Enqueues cancellation notice email
 * - Sends team notification
 *
 * @param invoiceId - Invoice that was cancelled
 * @param organizationId - Organization context
 * @param motivo - SAT cancellation reason code
 * @param folioSustitucion - Replacement invoice UUID (required for motivo 01)
 */
export async function fireCancellationWorkflow(
  invoiceId: string,
  organizationId: string,
  motivo: '01' | '02' | '03' | '04',
  folioSustitucion?: string
): Promise<void> {
  const workflowEngine = new WorkflowEngine();

  await workflowEngine.executeWorkflow({
    type: 'invoice.cancelled',
    invoiceId,
    organizationId,
    triggeredAt: new Date().toISOString(),
    metadata: {
      motivo,
      folioSustitucion,
    },
  });

  console.log(
    `[process-invoice] Cancellation workflow fired for invoice ${invoiceId}`
  );
}

// ============================================================================
// Retry Failed Job
// ============================================================================

/**
 * Retry a failed stamp job.
 *
 * @param invoiceId - Invoice to retry
 * @returns New job ID
 */
export async function retryFailedJob(
  invoiceId: string
): Promise<{ jobId: string } | null> {
  const jobId = getStampJobId(invoiceId);

  try {
    const job = await invoiceQueue.getJob(jobId);

    if (!job) {
      return null;
    }

    const state = await job.getState();

    if (state !== 'failed') {
      return null;
    }

    // Retry the job
    await job.retry();

    console.log(`[process-invoice] Retried job ${job.id} for invoice ${invoiceId}`);

    return { jobId: job.id! };
  } catch (error) {
    console.error(
      `[process-invoice] Error retrying job for ${invoiceId}:`,
      error
    );
    return null;
  }
}

// ============================================================================
// Job Cleanup
// ============================================================================

/**
 * Remove a completed or failed job from the queue.
 *
 * @param invoiceId - Invoice whose job should be removed
 */
export async function removeJob(invoiceId: string): Promise<boolean> {
  const jobId = getStampJobId(invoiceId);

  try {
    const job = await invoiceQueue.getJob(jobId);

    if (!job) {
      return false;
    }

    await job.remove();
    console.log(`[process-invoice] Removed job ${jobId} for invoice ${invoiceId}`);

    return true;
  } catch (error) {
    console.error(
      `[process-invoice] Error removing job for ${invoiceId}:`,
      error
    );
    return false;
  }
}
