/**
 * Invoice Worker (Component 17)
 *
 * Processes 'stamp-invoice' jobs from the invoice-processing queue.
 *
 * Job sequence within a single job execution:
 * 1. Fetch invoice from DB (verify status is pending_stamp or draft)
 * 2. If draft: call signInvoice() → transitions to pending_stamp
 * 3. Call stampInvoice() → transitions to stamped (via PAC)
 * 4. Fire WorkflowEngine.executeWorkflow({ type: 'invoice.stamp_succeeded', ... })
 *    → This triggers: generate_pdf + send_customer_email + schedule_payment_reminder
 *
 * If stampInvoice() throws after retries exhausted:
 * 5. Fire WorkflowEngine.executeWorkflow({ type: 'invoice.stamp_failed', ... })
 *    → This triggers: revert status to draft + send_team_notification
 *
 * Idempotency: If invoice is already 'stamped', return early (duplicate job protection).
 */

import { Worker, Job, type ConnectionOptions } from 'bullmq';
import { createClient } from '@supabase/supabase-js';
import { createBullMQConnection } from '@/lib/queue/redis-connection';
import { QUEUE_NAMES } from '@/lib/queue/queues';
import { InvoiceStatus } from '@/lib/invoices/types';
import { signInvoice } from '@/lib/invoices/sign-invoice';
import { stampInvoice } from '@/lib/invoices/stamp-invoice';
import { WorkflowEngine } from '@/lib/workflows/engine';
import type { StampJobPayload } from '@/lib/queue/job-types';

// ============================================================================
// Constants
// ============================================================================

const WORKER_CONCURRENCY = parseInt(process.env.WORKER_CONCURRENCY ?? '5', 10);

// ============================================================================
// Worker Setup
// ============================================================================

// Create a dedicated Redis connection for the worker
const workerConnection = createBullMQConnection();

// Create Supabase client with service role
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Create workflow engine
const workflowEngine = new WorkflowEngine(supabase);

// ============================================================================
// Job Processor
// ============================================================================

/**
 * Process a stamp-invoice job.
 */
async function processStampJob(job: Job<StampJobPayload>): Promise<void> {
  const { invoiceId, organizationId, language, attemptNumber } = job.data;

  console.log(
    `[invoice-worker] Processing job ${job.id} for invoice ${invoiceId} (attempt ${attemptNumber})`
  );

  try {
    // Step 1: Fetch invoice and verify status
    const { data: invoice, error: fetchError } = await supabase
      .from('invoices')
      .select('*')
      .eq('id', invoiceId)
      .eq('organization_id', organizationId)
      .single();

    if (fetchError || !invoice) {
      throw new Error(`Invoice not found: ${invoiceId}`);
    }

    // Idempotency check: if already stamped, return early
    if (invoice.status === InvoiceStatus.STAMPED) {
      console.log(
        `[invoice-worker] Invoice ${invoiceId} already stamped, skipping`
      );
      return;
    }

    // Verify invoice is in a valid state for processing
    if (
      invoice.status !== InvoiceStatus.DRAFT &&
      invoice.status !== InvoiceStatus.PENDING_STAMP
    ) {
      throw new Error(
        `Invoice ${invoiceId} is in invalid status for stamping: ${invoice.status}`
      );
    }

    // Step 2: If draft, sign first
    if (invoice.status === InvoiceStatus.DRAFT) {
      console.log(`[invoice-worker] Signing invoice ${invoiceId}`);

      // Get CSD password from organization settings
      // Note: In production, this should be retrieved from secure storage
      const { data: orgData } = await supabase
        .from('organizations')
        .select('csd_password')
        .eq('id', organizationId)
        .single();

      const csdPassword = orgData?.csd_password ?? '';

      // signInvoice throws on error, no need to check success
      const signResult = await signInvoice(invoice, organizationId, csdPassword);

      // Update invoice with signed XML and new status
      await supabase
        .from('invoices')
        .update({
          cfdi_xml: signResult.signedXml,
          status: InvoiceStatus.PENDING_STAMP,
          updated_at: new Date().toISOString(),
        })
        .eq('id', invoiceId);

      console.log(`[invoice-worker] Invoice ${invoiceId} signed successfully`);

      // Update local invoice object
      invoice.cfdi_xml = signResult.signedXml;
      invoice.status = InvoiceStatus.PENDING_STAMP;
    }

    // Step 3: Stamp with PAC
    console.log(`[invoice-worker] Stamping invoice ${invoiceId}`);

    // stampInvoice throws on error (PACError), no need to check success
    const stampResult = await stampInvoice(invoice, organizationId);

    // Update invoice with stamped data
    await supabase
      .from('invoices')
      .update({
        uuid: stampResult.uuid,
        cfdi_xml: stampResult.stampedXml,
        status: InvoiceStatus.STAMPED,
        stamped_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', invoiceId);

    console.log(
      `[invoice-worker] Invoice ${invoiceId} stamped with UUID: ${stampResult.uuid}`
    );

    // Step 4: Fire stamp_succeeded workflow event
    await workflowEngine.executeWorkflow({
      type: 'invoice.stamp_succeeded',
      invoiceId,
      organizationId,
      triggeredAt: new Date().toISOString(),
      metadata: {
        uuid: stampResult.uuid,
        language,
        attemptNumber,
      },
    });

    console.log(`[invoice-worker] Job ${job.id} completed successfully`);
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';

    console.error(
      `[invoice-worker] Job ${job.id} failed:`,
      errorMessage
    );

    // Check if this is the last retry attempt
    const isLastAttempt = job.attemptsMade >= (job.opts.attempts ?? 3) - 1;

    if (isLastAttempt) {
      // Fire stamp_failed workflow event
      console.log(
        `[invoice-worker] Last attempt failed, firing stamp_failed event`
      );

      try {
        await workflowEngine.executeWorkflow({
          type: 'invoice.stamp_failed',
          invoiceId,
          organizationId,
          triggeredAt: new Date().toISOString(),
          metadata: {
            errorReason: errorMessage,
            attemptNumber,
          },
        });

        // Revert invoice to draft status
        await supabase
          .from('invoices')
          .update({
            status: InvoiceStatus.DRAFT,
            updated_at: new Date().toISOString(),
          })
          .eq('id', invoiceId)
          .eq('status', InvoiceStatus.PENDING_STAMP);
      } catch (workflowError) {
        console.error(
          `[invoice-worker] Failed to fire stamp_failed event:`,
          workflowError
        );
      }
    }

    // Re-throw to trigger BullMQ retry
    throw error;
  }
}

// ============================================================================
// Worker Instance
// ============================================================================

export const invoiceWorker = new Worker<StampJobPayload>(
  QUEUE_NAMES.INVOICE_PROCESSING,
  processStampJob,
  {
    connection: workerConnection as ConnectionOptions,
    concurrency: WORKER_CONCURRENCY,
  }
);

// ============================================================================
// Event Handlers
// ============================================================================

invoiceWorker.on('completed', (job) => {
  console.log(
    `[invoice-worker] Job ${job.id} completed for invoice ${job.data.invoiceId}`
  );
});

invoiceWorker.on('failed', (job, err) => {
  console.error(
    `[invoice-worker] Job ${job?.id} failed:`,
    err.message
  );
});

invoiceWorker.on('error', (err) => {
  console.error('[invoice-worker] Worker error:', err.message);
});

// ============================================================================
// Graceful Shutdown
// ============================================================================

export async function shutdownInvoiceWorker(): Promise<void> {
  console.log('[invoice-worker] Shutting down...');
  await invoiceWorker.close();
  await workerConnection.quit();
  console.log('[invoice-worker] Shutdown complete');
}
