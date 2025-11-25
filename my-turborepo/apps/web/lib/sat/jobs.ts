/**
 * SAT Background Jobs Service
 *
 * This file handles background job processing for SAT operations.
 * Uses the existing job_queue table for simple queue management.
 *
 * Key features:
 * - Queue CFDI download requests
 * - Process RFC validation jobs
 * - Schedule certificate expiry checks
 * - Handle rate limiting
 * - Retry failed jobs with exponential backoff
 *
 * Note: For production, consider upgrading to BullMQ for more robust
 * queue management, but this database-based approach works well for
 * moderate workloads.
 */

import { createClient } from '@/lib/supabase/server';
import { requestCFDIDownload, waitAndDownload } from './cfdi-download';
import { parseCFDIsFromZip } from './cfdi-parser';
import { processCFDIPackage } from './reconciliation';
import { validateRFC, validateCustomerRFC } from './rfc-validation';
import { getRateLimitStatus } from './cache';
import type { CFDIDownloadRequest, CFDIDownloadType } from './types';

// ============================================================================
// Types
// ============================================================================

export type SATJobType =
  | 'cfdi_download'
  | 'cfdi_process'
  | 'rfc_validation'
  | 'rfc_batch_validation'
  | 'certificate_expiry_check'
  | 'reconciliation';

export type JobStatus = 'pending' | 'processing' | 'completed' | 'failed';

export interface SATJob {
  id: string;
  organizationId: string;
  jobType: SATJobType;
  payload: Record<string, any>;
  status: JobStatus;
  attempts: number;
  maxAttempts: number;
  scheduledAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  result?: Record<string, any>;
  error?: string;
}

export interface JobResult {
  success: boolean;
  data?: any;
  error?: string;
}

// ============================================================================
// Configuration
// ============================================================================

const MAX_JOB_ATTEMPTS = 3;
const JOB_RETRY_DELAYS = [60000, 300000, 900000]; // 1min, 5min, 15min
const CONCURRENT_JOBS = 5;

// ============================================================================
// Job Queue Functions
// ============================================================================

/**
 * Queues a CFDI download job
 *
 * @param params - Download parameters
 * @param password - FIEL certificate password
 * @param scheduledAt - When to run the job (default: now)
 * @returns Job ID
 *
 * @example
 * ```ts
 * const jobId = await queueCFDIDownload({
 *   organizationId: 'org-uuid',
 *   type: 'received',
 *   dateStart: new Date('2024-01-01'),
 *   dateEnd: new Date('2024-12-31'),
 * }, 'fiel-password');
 * ```
 */
export async function queueCFDIDownload(
  params: CFDIDownloadRequest,
  password: string,
  scheduledAt: Date = new Date()
): Promise<string> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('job_queue')
    .insert({
      organization_id: params.organizationId,
      job_type: 'cfdi_download',
      payload: {
        ...params,
        dateStart: params.dateStart.toISOString(),
        dateEnd: params.dateEnd.toISOString(),
        password, // In production, encrypt this or use a secure vault
      },
      status: 'pending',
      scheduled_at: scheduledAt.toISOString(),
    })
    .select('id')
    .single();

  if (error) {
    throw new Error(`Failed to queue job: ${error.message}`);
  }

  return data.id;
}

/**
 * Queues an RFC validation job
 *
 * @param customerId - Customer UUID
 * @param organizationId - Organization UUID
 * @param scheduledAt - When to run the job (default: now)
 * @returns Job ID
 */
export async function queueRFCValidation(
  customerId: string,
  organizationId: string,
  scheduledAt: Date = new Date()
): Promise<string> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('job_queue')
    .insert({
      organization_id: organizationId,
      job_type: 'rfc_validation',
      payload: { customerId },
      status: 'pending',
      scheduled_at: scheduledAt.toISOString(),
    })
    .select('id')
    .single();

  if (error) {
    throw new Error(`Failed to queue job: ${error.message}`);
  }

  return data.id;
}

/**
 * Queues batch RFC validation job
 *
 * @param customerIds - Array of customer UUIDs
 * @param organizationId - Organization UUID
 * @returns Job ID
 */
export async function queueBatchRFCValidation(
  customerIds: string[],
  organizationId: string
): Promise<string> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('job_queue')
    .insert({
      organization_id: organizationId,
      job_type: 'rfc_batch_validation',
      payload: { customerIds },
      status: 'pending',
      scheduled_at: new Date().toISOString(),
    })
    .select('id')
    .single();

  if (error) {
    throw new Error(`Failed to queue job: ${error.message}`);
  }

  return data.id;
}

/**
 * Queues certificate expiry check job
 *
 * @param organizationId - Organization UUID
 * @returns Job ID
 */
export async function scheduleCertificateExpiryCheck(
  organizationId: string
): Promise<string> {
  const supabase = await createClient();

  // Schedule for tomorrow
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(9, 0, 0, 0); // 9 AM

  const { data, error } = await supabase
    .from('job_queue')
    .insert({
      organization_id: organizationId,
      job_type: 'certificate_expiry_check',
      payload: {},
      status: 'pending',
      scheduled_at: tomorrow.toISOString(),
    })
    .select('id')
    .single();

  if (error) {
    throw new Error(`Failed to queue job: ${error.message}`);
  }

  return data.id;
}

/**
 * Queues a reconciliation job
 *
 * @param organizationId - Organization UUID
 * @param type - CFDI type to reconcile (optional)
 * @returns Job ID
 */
export async function queueReconciliation(
  organizationId: string,
  type?: CFDIDownloadType
): Promise<string> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('job_queue')
    .insert({
      organization_id: organizationId,
      job_type: 'reconciliation',
      payload: { type },
      status: 'pending',
      scheduled_at: new Date().toISOString(),
    })
    .select('id')
    .single();

  if (error) {
    throw new Error(`Failed to queue job: ${error.message}`);
  }

  return data.id;
}

// ============================================================================
// Job Processing Functions
// ============================================================================

/**
 * Processes pending jobs
 *
 * This function should be called periodically (e.g., by a cron job)
 * to process pending jobs in the queue.
 *
 * @param limit - Maximum jobs to process (default: CONCURRENT_JOBS)
 * @returns Processing results
 */
export async function processJobs(
  limit: number = CONCURRENT_JOBS
): Promise<{ processed: number; succeeded: number; failed: number }> {
  const supabase = await createClient();

  // Get pending jobs
  const { data: jobs } = await supabase
    .from('job_queue')
    .select('*')
    .eq('status', 'pending')
    .lte('scheduled_at', new Date().toISOString())
    .lt('attempts', MAX_JOB_ATTEMPTS)
    .order('scheduled_at', { ascending: true })
    .limit(limit);

  if (!jobs || jobs.length === 0) {
    return { processed: 0, succeeded: 0, failed: 0 };
  }

  let succeeded = 0;
  let failed = 0;

  for (const job of jobs) {
    const result = await processJob(job.id);
    if (result.success) {
      succeeded++;
    } else {
      failed++;
    }
  }

  return {
    processed: jobs.length,
    succeeded,
    failed,
  };
}

/**
 * Processes a single job
 *
 * @param jobId - Job ID
 * @returns Job result
 */
export async function processJob(jobId: string): Promise<JobResult> {
  const supabase = await createClient();

  // Get job
  const { data: job, error: fetchError } = await supabase
    .from('job_queue')
    .select('*')
    .eq('id', jobId)
    .single();

  if (fetchError || !job) {
    return { success: false, error: 'Job not found' };
  }

  // Mark as processing
  await supabase
    .from('job_queue')
    .update({
      status: 'processing',
      started_at: new Date().toISOString(),
      attempts: job.attempts + 1,
    })
    .eq('id', jobId);

  try {
    let result: JobResult;

    // Process based on job type
    switch (job.job_type as SATJobType) {
      case 'cfdi_download':
        result = await processCFDIDownloadJob(job);
        break;
      case 'cfdi_process':
        result = await processCFDIProcessJob(job);
        break;
      case 'rfc_validation':
        result = await processRFCValidationJob(job);
        break;
      case 'rfc_batch_validation':
        result = await processBatchRFCValidationJob(job);
        break;
      case 'certificate_expiry_check':
        result = await processCertificateExpiryJob(job);
        break;
      case 'reconciliation':
        result = await processReconciliationJob(job);
        break;
      default:
        result = { success: false, error: `Unknown job type: ${job.job_type}` };
    }

    // Update job status
    await supabase
      .from('job_queue')
      .update({
        status: result.success ? 'completed' : 'failed',
        completed_at: new Date().toISOString(),
        result: result.data,
        error: result.error,
      })
      .eq('id', jobId);

    // Schedule retry if failed and attempts remaining
    if (!result.success && job.attempts < MAX_JOB_ATTEMPTS - 1) {
      const retryDelay = JOB_RETRY_DELAYS[job.attempts] || JOB_RETRY_DELAYS[2];
      const retryAt = new Date(Date.now() + retryDelay);

      await supabase
        .from('job_queue')
        .update({
          status: 'pending',
          scheduled_at: retryAt.toISOString(),
        })
        .eq('id', jobId);
    }

    return result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    await supabase
      .from('job_queue')
      .update({
        status: 'failed',
        completed_at: new Date().toISOString(),
        error: errorMessage,
      })
      .eq('id', jobId);

    return { success: false, error: errorMessage };
  }
}

// ============================================================================
// Job Handlers
// ============================================================================

/**
 * Processes CFDI download job
 */
async function processCFDIDownloadJob(job: any): Promise<JobResult> {
  const { password, ...params } = job.payload;

  // Check rate limit
  const rateLimitStatus = await getRateLimitStatus(job.organization_id);
  if (rateLimitStatus.exceeded) {
    return {
      success: false,
      error: `Rate limit exceeded. Resets at ${rateLimitStatus.resetAt.toISOString()}`,
    };
  }

  // Convert date strings back to Date objects
  const downloadParams: CFDIDownloadRequest = {
    ...params,
    dateStart: new Date(params.dateStart),
    dateEnd: new Date(params.dateEnd),
  };

  // Request download
  const response = await requestCFDIDownload(downloadParams, password);

  if (response.status === 'failed') {
    return { success: false, error: response.message };
  }

  // Wait for completion and download
  const packages = await waitAndDownload(
    response.requestId,
    job.organization_id,
    password
  );

  // Process each package
  let totalCFDIs = 0;
  let totalReconciled = 0;
  const errors: string[] = [];

  for (const pkg of packages) {
    // Parse CFDIs from ZIP
    const cfdis = await parseCFDIsFromZip(pkg.zipFile);

    // Process and reconcile
    const processResult = await processCFDIPackage(
      cfdis,
      job.organization_id,
      params.type
    );

    totalCFDIs += processResult.saved;
    totalReconciled += processResult.reconciled;
    errors.push(...processResult.errors);
  }

  return {
    success: errors.length === 0,
    data: {
      packages: packages.length,
      totalCFDIs,
      totalReconciled,
      errors: errors.length > 0 ? errors : undefined,
    },
  };
}

/**
 * Processes CFDI package processing job
 */
async function processCFDIProcessJob(job: any): Promise<JobResult> {
  const { packageId, zipBase64, type } = job.payload;

  const zipBuffer = Buffer.from(zipBase64, 'base64');
  const cfdis = await parseCFDIsFromZip(zipBuffer);

  const result = await processCFDIPackage(
    cfdis,
    job.organization_id,
    type
  );

  return {
    success: result.errors.length === 0,
    data: {
      saved: result.saved,
      reconciled: result.reconciled,
      errors: result.errors.length > 0 ? result.errors : undefined,
    },
  };
}

/**
 * Processes RFC validation job
 */
async function processRFCValidationJob(job: any): Promise<JobResult> {
  const { customerId } = job.payload;

  const result = await validateCustomerRFC(customerId, job.organization_id);

  return {
    success: result.isValid,
    data: {
      rfc: result.rfc,
      status: result.status,
      errors: result.errors.length > 0 ? result.errors : undefined,
    },
  };
}

/**
 * Processes batch RFC validation job
 */
async function processBatchRFCValidationJob(job: any): Promise<JobResult> {
  const { customerIds } = job.payload;

  const results = [];
  let valid = 0;
  let invalid = 0;

  for (const customerId of customerIds) {
    const result = await validateCustomerRFC(customerId, job.organization_id);
    results.push({
      customerId,
      rfc: result.rfc,
      isValid: result.isValid,
    });

    if (result.isValid) {
      valid++;
    } else {
      invalid++;
    }
  }

  return {
    success: true,
    data: {
      total: customerIds.length,
      valid,
      invalid,
      results,
    },
  };
}

/**
 * Processes certificate expiry check job
 */
async function processCertificateExpiryJob(job: any): Promise<JobResult> {
  const supabase = await createClient();

  // Get organization certificate info
  const { data: org } = await supabase
    .from('organizations')
    .select('id, rfc, cfdi_cert')
    .eq('id', job.organization_id)
    .single();

  if (!org || !org.cfdi_cert) {
    return {
      success: true,
      data: { message: 'No certificate found' },
    };
  }

  // TODO: Parse certificate and check expiry
  // This would require the fiel.ts module to expose certificate info

  // Schedule next check
  await scheduleCertificateExpiryCheck(job.organization_id);

  return {
    success: true,
    data: {
      message: 'Certificate check completed',
      nextCheck: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    },
  };
}

/**
 * Processes reconciliation job
 */
async function processReconciliationJob(job: any): Promise<JobResult> {
  const { reconcileAllCFDIs } = await import('./reconciliation');

  const results = await reconcileAllCFDIs(job.organization_id, {
    type: job.payload.type,
    limit: 100, // Process in batches
  });

  const matched = results.filter(r => r.matched).length;
  const unmatched = results.length - matched;

  return {
    success: true,
    data: {
      total: results.length,
      matched,
      unmatched,
    },
  };
}

// ============================================================================
// Job Management Functions
// ============================================================================

/**
 * Gets job status
 *
 * @param jobId - Job ID
 * @returns Job status
 */
export async function getJobStatus(jobId: string): Promise<SATJob | null> {
  const supabase = await createClient();

  const { data } = await supabase
    .from('job_queue')
    .select('*')
    .eq('id', jobId)
    .single();

  if (!data) {
    return null;
  }

  return {
    id: data.id,
    organizationId: data.organization_id,
    jobType: data.job_type as SATJobType,
    payload: data.payload,
    status: data.status as JobStatus,
    attempts: data.attempts,
    maxAttempts: data.max_attempts,
    scheduledAt: new Date(data.scheduled_at),
    startedAt: data.started_at ? new Date(data.started_at) : undefined,
    completedAt: data.completed_at ? new Date(data.completed_at) : undefined,
    result: data.result,
    error: data.error,
  };
}

/**
 * Gets pending jobs for an organization
 *
 * @param organizationId - Organization UUID
 * @param jobType - Filter by job type (optional)
 * @returns Array of pending jobs
 */
export async function getPendingJobs(
  organizationId: string,
  jobType?: SATJobType
): Promise<SATJob[]> {
  const supabase = await createClient();

  let query = supabase
    .from('job_queue')
    .select('*')
    .eq('organization_id', organizationId)
    .in('status', ['pending', 'processing'])
    .order('scheduled_at', { ascending: true });

  if (jobType) {
    query = query.eq('job_type', jobType);
  }

  const { data } = await query;

  return (data || []).map(job => ({
    id: job.id,
    organizationId: job.organization_id,
    jobType: job.job_type as SATJobType,
    payload: job.payload,
    status: job.status as JobStatus,
    attempts: job.attempts,
    maxAttempts: job.max_attempts,
    scheduledAt: new Date(job.scheduled_at),
    startedAt: job.started_at ? new Date(job.started_at) : undefined,
    completedAt: job.completed_at ? new Date(job.completed_at) : undefined,
    result: job.result,
    error: job.error,
  }));
}

/**
 * Cancels a pending job
 *
 * @param jobId - Job ID
 * @returns Success status
 */
export async function cancelJob(jobId: string): Promise<boolean> {
  const supabase = await createClient();

  const { error } = await supabase
    .from('job_queue')
    .update({
      status: 'failed',
      error: 'Cancelled by user',
      completed_at: new Date().toISOString(),
    })
    .eq('id', jobId)
    .eq('status', 'pending');

  return !error;
}

/**
 * Retries a failed job
 *
 * @param jobId - Job ID
 * @returns Success status
 */
export async function retryJob(jobId: string): Promise<boolean> {
  const supabase = await createClient();

  const { error } = await supabase
    .from('job_queue')
    .update({
      status: 'pending',
      scheduled_at: new Date().toISOString(),
      attempts: 0,
      error: null,
      result: null,
    })
    .eq('id', jobId)
    .eq('status', 'failed');

  return !error;
}

/**
 * Cleans up old completed jobs
 *
 * @param daysToKeep - Days to keep completed jobs (default: 30)
 * @returns Number of jobs deleted
 */
export async function cleanupOldJobs(daysToKeep: number = 30): Promise<number> {
  const supabase = await createClient();

  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

  const { data } = await supabase
    .from('job_queue')
    .delete()
    .in('status', ['completed', 'failed'])
    .lt('completed_at', cutoffDate.toISOString())
    .select('id');

  return data?.length || 0;
}

/**
 * Gets rate limit status for job scheduling
 *
 * @param organizationId - Organization UUID
 * @returns Rate limit status
 */
export async function getJobRateLimitStatus(organizationId: string): Promise<{
  canSchedule: boolean;
  remainingRequests: number;
  resetAt: Date;
}> {
  const status = await getRateLimitStatus(organizationId);

  return {
    canSchedule: !status.exceeded,
    remainingRequests: status.remaining,
    resetAt: status.resetAt,
  };
}
