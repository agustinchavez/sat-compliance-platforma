/**
 * CFDI Download Service
 *
 * This file handles downloading CFDIs (Comprobante Fiscal Digital por Internet)
 * from SAT's bulk download web service (Descarga Masiva).
 *
 * Key features:
 * - Request CFDI packages by date range
 * - Poll for package availability
 * - Download ZIP files containing CFDIs
 * - Extract and parse XML files
 * - Store CFDIs in Cloudflare R2
 * - Handle SAT rate limiting (~500 requests/day)
 *
 * Download Process:
 * 1. Authenticate with SAT (get token)
 * 2. Request download (SolicitaDescarga) - get SAT request ID
 * 3. Verify request status (VerificaSolicitud) - poll until packages ready
 * 4. Download packages (DescargaMasiva) - get ZIP files
 * 5. Extract and parse XMLs
 * 6. Store in database and R2
 */

import { createClient } from '@/lib/supabase/server';
import { z } from 'zod';
import {
  sendSOAPRequest,
  buildDownloadRequestBody,
  buildVerificationRequestBody,
  buildPackageDownloadBody,
  extractSOAPValue,
} from './soap-client';
import { getSATToken } from './authentication';
import {
  cacheDownloadStatus,
  getCachedDownloadStatus,
  invalidateDownloadStatus,
  incrementRateLimit,
  isRateLimitExceeded,
  getRateLimitStatus,
} from './cache';
import {
  SAT_ENDPOINTS,
  SATSOAPError,
  SATRateLimitError,
  type CFDIDownloadRequest,
  type CFDIDownloadResponse,
  type CFDIDownloadStatusResponse,
  type CFDIPackage,
  type CFDIDownloadStatus,
  type CFDIDownloadType,
  type CFDIRequestType,
} from './types';
import {
  formatSATDate,
  generateRequestId,
  sleep,
  generateCFDIStoragePath,
} from './utils';
import {
  getSATStatusMessage,
  isDownloadSuccessCode,
  isDownloadReadyCode,
  isDownloadProcessingCode,
  isRateLimitCode,
} from './sat-codes';

// ============================================================================
// Configuration
// ============================================================================

const VERIFICATION_POLL_INTERVAL = 30000; // 30 seconds
const VERIFICATION_MAX_ATTEMPTS = 60; // 30 minutes max wait
const DOWNLOAD_TIMEOUT = 300000; // 5 minutes for large downloads

// ============================================================================
// Zod Schemas
// ============================================================================

const CFDIDownloadRequestSchema = z.object({
  organizationId: z.string().uuid(),
  type: z.enum(['issued', 'received']),
  dateStart: z.date(),
  dateEnd: z.date(),
  requestType: z.enum(['CFDI', 'Metadata']).optional().default('CFDI'),
  rfcEmitter: z.string().regex(/^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/).optional(),
  rfcReceiver: z.string().regex(/^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/).optional(),
}).refine(
  (data) => data.dateEnd >= data.dateStart,
  { message: 'End date must be after start date' }
);

// ============================================================================
// Main Download Functions
// ============================================================================

/**
 * Request CFDI download from SAT
 *
 * This initiates a download request with SAT. The actual files won't be
 * available immediately - you need to poll with checkDownloadStatus().
 *
 * @param params - Download request parameters
 * @param password - FIEL certificate password
 * @returns Download response with request ID
 *
 * @example
 * ```ts
 * const response = await requestCFDIDownload({
 *   organizationId: 'org-uuid',
 *   type: 'received',
 *   dateStart: new Date('2024-01-01'),
 *   dateEnd: new Date('2024-12-31'),
 * }, 'fiel-password');
 *
 * console.log('Request ID:', response.requestId);
 * console.log('Status:', response.status);
 * ```
 */
export async function requestCFDIDownload(
  params: CFDIDownloadRequest,
  password: string
): Promise<CFDIDownloadResponse> {
  // Validate params
  const validated = CFDIDownloadRequestSchema.parse({
    ...params,
    dateStart: params.dateStart,
    dateEnd: params.dateEnd,
  });

  const requestId = generateRequestId();

  try {
    // Check rate limit
    const rateLimitExceeded = await isRateLimitExceeded(validated.organizationId);
    if (rateLimitExceeded) {
      const status = await getRateLimitStatus(validated.organizationId);
      throw new SATRateLimitError(
        'Daily SAT request limit exceeded',
        status.resetAt
      );
    }

    // Get authentication token
    const authToken = await getSATToken(validated.organizationId, password);

    // Get organization RFC
    const supabase = await createClient();
    const { data: org } = await supabase
      .from('organizations')
      .select('rfc')
      .eq('id', validated.organizationId)
      .single();

    if (!org) {
      throw new SATSOAPError('Organization not found', 'ORG_NOT_FOUND');
    }

    // Build SOAP request
    const soapBody = buildDownloadRequestBody({
      rfcSolicitante: org.rfc,
      fechaInicial: formatSATDate(validated.dateStart),
      fechaFinal: formatSATDate(validated.dateEnd),
      tipoSolicitud: validated.requestType || 'CFDI',
      rfcEmisor: validated.type === 'issued' ? org.rfc : validated.rfcEmitter,
      rfcReceptor: validated.type === 'received' ? org.rfc : validated.rfcReceiver,
    });

    // Send request
    console.log(`Requesting CFDI download for org ${validated.organizationId}`);
    const response = await sendSOAPRequest(
      {
        endpoint: SAT_ENDPOINTS.solicitud,
        action: 'SolicitaDescarga',
        body: soapBody,
        headers: {
          'Authorization': `Bearer ${authToken.token}`,
        },
      },
      validated.organizationId
    );

    // Increment rate limit
    await incrementRateLimit(validated.organizationId);

    // Parse response
    if (!response.success) {
      throw response.error || new SATSOAPError('Download request failed', 'UNKNOWN');
    }

    // Extract SAT request ID from response
    const satRequestId = extractSATRequestId(response.data);
    const statusCode = extractStatusCode(response.data);
    const statusMessage = getSATStatusMessage(statusCode);

    // Track request in database
    await trackDownloadRequest(
      validated.organizationId,
      requestId,
      satRequestId,
      params,
      statusCode
    );

    // Cache initial status
    const downloadStatus: CFDIDownloadStatus = isDownloadSuccessCode(statusCode)
      ? 'processing'
      : 'failed';

    await cacheDownloadStatus(requestId, {
      status: downloadStatus,
      statusCode,
      satRequestId,
    });

    return {
      requestId,
      status: downloadStatus,
      satRequestId: satRequestId || undefined,
      message: statusMessage,
    };
  } catch (error) {
    // Track failed request
    await trackDownloadRequest(
      validated.organizationId,
      requestId,
      null,
      params,
      null,
      error
    );

    if (error instanceof SATRateLimitError || error instanceof SATSOAPError) {
      return {
        requestId,
        status: 'failed',
        error: error,
        message: error.message,
      };
    }

    throw error;
  }
}

/**
 * Check status of a CFDI download request
 *
 * SAT processes download requests asynchronously. This function polls
 * SAT to check if packages are ready for download.
 *
 * @param requestId - Internal request ID
 * @param organizationId - Organization UUID
 * @param password - FIEL certificate password
 * @returns Download status response
 *
 * @example
 * ```ts
 * const status = await checkDownloadStatus('req-123', 'org-uuid', 'password');
 * if (status.status === 'completed') {
 *   console.log('Packages ready:', status.packageIds);
 * }
 * ```
 */
export async function checkDownloadStatus(
  requestId: string,
  organizationId: string,
  password: string
): Promise<CFDIDownloadStatusResponse> {
  try {
    // Check cache first
    const cached = await getCachedDownloadStatus(requestId);
    if (cached?.status === 'completed' || cached?.status === 'failed') {
      return {
        requestId,
        ...cached,
      };
    }

    // Get SAT request ID from database
    const supabase = await createClient();
    const { data: satRequest } = await supabase
      .from('sat_requests')
      .select('sat_request_id, request_data, organization_id')
      .eq('id', requestId)
      .single();

    if (!satRequest || !satRequest.sat_request_id) {
      return {
        requestId,
        status: 'failed',
        error: new SATSOAPError('Request not found', 'NOT_FOUND'),
      };
    }

    // Get auth token
    const authToken = await getSATToken(organizationId, password);

    // Get organization RFC
    const { data: org } = await supabase
      .from('organizations')
      .select('rfc')
      .eq('id', organizationId)
      .single();

    if (!org) {
      throw new SATSOAPError('Organization not found', 'ORG_NOT_FOUND');
    }

    // Build verification request
    const soapBody = buildVerificationRequestBody(org.rfc, satRequest.sat_request_id);

    // Send request
    const response = await sendSOAPRequest(
      {
        endpoint: SAT_ENDPOINTS.verificacion,
        action: 'VerificaSolicitudDescarga',
        body: soapBody,
        headers: {
          'Authorization': `Bearer ${authToken.token}`,
        },
      },
      organizationId
    );

    // Increment rate limit
    await incrementRateLimit(organizationId);

    if (!response.success) {
      throw response.error || new SATSOAPError('Verification request failed', 'UNKNOWN');
    }

    // Parse response
    const statusCode = extractStatusCode(response.data);
    const packageIds = extractPackageIds(response.data);
    const totalPackages = packageIds.length;

    let downloadStatus: CFDIDownloadStatus;

    if (isDownloadReadyCode(statusCode)) {
      downloadStatus = 'completed';
    } else if (isDownloadProcessingCode(statusCode)) {
      downloadStatus = 'processing';
    } else if (isRateLimitCode(statusCode)) {
      throw new SATRateLimitError(
        'SAT rate limit exceeded',
        new Date(Date.now() + 24 * 60 * 60 * 1000)
      );
    } else {
      downloadStatus = 'failed';
    }

    // Update database
    await updateDownloadStatus(requestId, downloadStatus, statusCode, packageIds);

    // Cache status
    await cacheDownloadStatus(requestId, {
      status: downloadStatus,
      statusCode,
      packageIds,
      totalPackages,
    });

    return {
      requestId,
      status: downloadStatus,
      statusCode,
      statusMessage: getSATStatusMessage(statusCode),
      packageIds: packageIds.length > 0 ? packageIds : undefined,
      totalPackages,
    };
  } catch (error) {
    if (error instanceof SATRateLimitError || error instanceof SATSOAPError) {
      return {
        requestId,
        status: 'failed',
        error: error,
      };
    }
    throw error;
  }
}

/**
 * Download a CFDI package (ZIP file)
 *
 * Once packages are ready, use this function to download each ZIP file
 * containing CFDIs.
 *
 * @param requestId - Internal request ID
 * @param packageId - Package ID from checkDownloadStatus
 * @param organizationId - Organization UUID
 * @param password - FIEL certificate password
 * @returns Package data with extracted CFDIs
 *
 * @example
 * ```ts
 * const pkg = await downloadCFDIPackage('req-123', 'pkg-456', 'org-uuid', 'password');
 * console.log(`Downloaded ${pkg.cfdis.length} CFDIs`);
 * ```
 */
export async function downloadCFDIPackage(
  requestId: string,
  packageId: string,
  organizationId: string,
  password: string
): Promise<CFDIPackage> {
  try {
    // Get auth token
    const authToken = await getSATToken(organizationId, password);

    // Get organization RFC
    const supabase = await createClient();
    const { data: org } = await supabase
      .from('organizations')
      .select('rfc')
      .eq('id', organizationId)
      .single();

    if (!org) {
      throw new SATSOAPError('Organization not found', 'ORG_NOT_FOUND');
    }

    // Build download request
    const soapBody = buildPackageDownloadBody(org.rfc, packageId);

    // Send request with longer timeout
    const response = await sendSOAPRequest(
      {
        endpoint: SAT_ENDPOINTS.descarga,
        action: 'PeticionDescargaMasivaTercerosEntrada',
        body: soapBody,
        headers: {
          'Authorization': `Bearer ${authToken.token}`,
        },
      },
      organizationId
    );

    // Increment rate limit
    await incrementRateLimit(organizationId);

    if (!response.success) {
      throw response.error || new SATSOAPError('Package download failed', 'UNKNOWN');
    }

    // Extract ZIP data from response (base64 encoded)
    const zipBase64 = extractPackageData(response.data);

    if (!zipBase64) {
      throw new SATSOAPError('No package data in response', 'NO_DATA');
    }

    const zipBuffer = Buffer.from(zipBase64, 'base64');

    // Track package download
    await trackPackageDownload(requestId, packageId, organizationId, zipBuffer.length);

    // Return package (parsing will be done separately)
    return {
      packageId,
      zipFile: zipBuffer,
      cfdis: [], // Will be populated by cfdi-parser
      metadata: {
        downloadedAt: new Date(),
        totalCFDIs: 0, // Will be updated after extraction
        totalSize: zipBuffer.length,
      },
    };
  } catch (error) {
    throw error;
  }
}

/**
 * Poll for download completion and download all packages
 *
 * This is a convenience function that combines checkDownloadStatus and
 * downloadCFDIPackage into a single async operation.
 *
 * @param requestId - Internal request ID
 * @param organizationId - Organization UUID
 * @param password - FIEL certificate password
 * @returns Array of downloaded packages
 *
 * @example
 * ```ts
 * // After requestCFDIDownload()
 * const packages = await waitAndDownload('req-123', 'org-uuid', 'password');
 * for (const pkg of packages) {
 *   console.log(`Package ${pkg.packageId}: ${pkg.metadata.totalSize} bytes`);
 * }
 * ```
 */
export async function waitAndDownload(
  requestId: string,
  organizationId: string,
  password: string,
  onProgress?: (status: CFDIDownloadStatusResponse) => void
): Promise<CFDIPackage[]> {
  let attempts = 0;

  while (attempts < VERIFICATION_MAX_ATTEMPTS) {
    const status = await checkDownloadStatus(requestId, organizationId, password);

    if (onProgress) {
      onProgress(status);
    }

    if (status.status === 'completed' && status.packageIds) {
      // Download all packages
      const packages: CFDIPackage[] = [];

      for (const packageId of status.packageIds) {
        const pkg = await downloadCFDIPackage(
          requestId,
          packageId,
          organizationId,
          password
        );
        packages.push(pkg);
      }

      return packages;
    }

    if (status.status === 'failed') {
      throw status.error || new SATSOAPError('Download failed', 'FAILED');
    }

    // Wait before next poll
    await sleep(VERIFICATION_POLL_INTERVAL);
    attempts++;
  }

  throw new SATSOAPError('Download verification timeout', 'TIMEOUT');
}

// ============================================================================
// History & Statistics
// ============================================================================

/**
 * Get download history for an organization
 *
 * @param organizationId - Organization UUID
 * @param options - Query options
 * @returns Download history records
 */
export async function getDownloadHistory(
  organizationId: string,
  options: {
    limit?: number;
    offset?: number;
    status?: CFDIDownloadStatus;
    type?: CFDIDownloadType;
  } = {}
): Promise<any[]> {
  const supabase = await createClient();

  let query = supabase
    .from('sat_requests')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('request_type', 'cfdi_download')
    .is('deleted_at', null)
    .order('created_at', { ascending: false });

  if (options.status) {
    query = query.eq('status', options.status);
  }

  if (options.limit) {
    query = query.limit(options.limit);
  }

  if (options.offset) {
    query = query.range(options.offset, options.offset + (options.limit || 20) - 1);
  }

  const { data } = await query;
  return data || [];
}

/**
 * Get download statistics for an organization
 *
 * @param organizationId - Organization UUID
 * @returns Download statistics
 */
export async function getDownloadStats(organizationId: string): Promise<{
  totalRequests: number;
  completedRequests: number;
  failedRequests: number;
  totalCFDIsDownloaded: number;
  lastDownloadAt: Date | null;
}> {
  const supabase = await createClient();

  // Get request stats
  const { data: requests } = await supabase
    .from('sat_requests')
    .select('status, created_at')
    .eq('organization_id', organizationId)
    .eq('request_type', 'cfdi_download')
    .is('deleted_at', null);

  // Get CFDI count
  const { count: cfdiCount } = await supabase
    .from('downloaded_cfdis')
    .select('*', { count: 'exact', head: true })
    .eq('organization_id', organizationId)
    .is('deleted_at', null);

  const totalRequests = requests?.length || 0;
  const completedRequests = requests?.filter(r => r.status === 'completed').length || 0;
  const failedRequests = requests?.filter(r => r.status === 'failed').length || 0;

  // Get last download date
  const lastRequest = requests?.sort((a, b) =>
    new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  )[0];

  return {
    totalRequests,
    completedRequests,
    failedRequests,
    totalCFDIsDownloaded: cfdiCount || 0,
    lastDownloadAt: lastRequest ? new Date(lastRequest.created_at) : null,
  };
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Extract SAT request ID from SOAP response
 */
function extractSATRequestId(responseData: any): string | null {
  const paths = [
    'SolicitaDescargaResponse.SolicitaDescargaResult.@_IdSolicitud',
    'SolicitaDescargaResult.@_IdSolicitud',
    'IdSolicitud',
  ];

  for (const path of paths) {
    const value = extractSOAPValue({ success: true, data: responseData }, path);
    if (value) return value;
  }

  // Try to find any UUID-like string
  const jsonStr = JSON.stringify(responseData);
  const uuidMatch = jsonStr.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);

  return uuidMatch ? uuidMatch[0] : null;
}

/**
 * Extract status code from SOAP response
 */
function extractStatusCode(responseData: any): number {
  const paths = [
    'SolicitaDescargaResponse.SolicitaDescargaResult.@_CodEstatus',
    'VerificaSolicitudDescargaResponse.VerificaSolicitudDescargaResult.@_CodEstatus',
    'CodEstatus',
    'CodigoEstatus',
  ];

  for (const path of paths) {
    const value = extractSOAPValue({ success: true, data: responseData }, path);
    if (value) return parseInt(value, 10);
  }

  return 0;
}

/**
 * Extract package IDs from verification response
 */
function extractPackageIds(responseData: any): string[] {
  const packageIds: string[] = [];

  try {
    const paths = [
      'VerificaSolicitudDescargaResponse.VerificaSolicitudDescargaResult.IdsPaquetes.IdPaquete',
      'IdsPaquetes.IdPaquete',
      'IdsPaquetes',
    ];

    for (const path of paths) {
      const value = extractSOAPValue({ success: true, data: responseData }, path);

      if (Array.isArray(value)) {
        return value;
      }

      if (typeof value === 'string') {
        return [value];
      }
    }

    // Fallback: search for package IDs in response
    const jsonStr = JSON.stringify(responseData);
    const matches = jsonStr.match(/[A-Za-z0-9]{8}-[A-Za-z0-9]{4}-[A-Za-z0-9]{4}-[A-Za-z0-9]{4}-[A-Za-z0-9]{12}_[0-9]+/g);

    if (matches) {
      return [...new Set(matches)];
    }
  } catch (error) {
    console.error('Error extracting package IDs:', error);
  }

  return packageIds;
}

/**
 * Extract package data (ZIP) from download response
 */
function extractPackageData(responseData: any): string | null {
  const paths = [
    'PeticionDescargaMasivaTercerosEntradaResponse.PeticionDescargaMasivaTercerosEntradaResult.Paquete',
    'Paquete',
    'paquete',
  ];

  for (const path of paths) {
    const value = extractSOAPValue({ success: true, data: responseData }, path);
    if (value && typeof value === 'string') return value;
  }

  return null;
}

// ============================================================================
// Database Tracking
// ============================================================================

/**
 * Track download request in database
 */
async function trackDownloadRequest(
  organizationId: string,
  requestId: string,
  satRequestId: string | null,
  params: CFDIDownloadRequest,
  statusCode: number | null,
  error?: any
): Promise<void> {
  try {
    const supabase = await createClient();

    await supabase.from('sat_requests').insert({
      id: requestId,
      organization_id: organizationId,
      request_type: 'cfdi_download',
      sat_request_id: satRequestId,
      request_data: {
        type: params.type,
        dateStart: params.dateStart.toISOString(),
        dateEnd: params.dateEnd.toISOString(),
        requestType: params.requestType,
        rfcEmitter: params.rfcEmitter,
        rfcReceiver: params.rfcReceiver,
      },
      status: error ? 'failed' : 'processing',
      sat_status_code: statusCode,
      error_message: error ? (error.message || String(error)) : undefined,
      created_at: new Date().toISOString(),
    });
  } catch (dbError) {
    console.error('Failed to track download request:', dbError);
  }
}

/**
 * Update download status in database
 */
async function updateDownloadStatus(
  requestId: string,
  status: CFDIDownloadStatus,
  statusCode: number,
  packageIds: string[]
): Promise<void> {
  try {
    const supabase = await createClient();

    await supabase
      .from('sat_requests')
      .update({
        status,
        sat_status_code: statusCode,
        response_data: {
          packageIds,
          totalPackages: packageIds.length,
          statusCode,
          updatedAt: new Date().toISOString(),
        },
        completed_at: status === 'completed' || status === 'failed'
          ? new Date().toISOString()
          : undefined,
      })
      .eq('id', requestId);
  } catch (error) {
    console.error('Failed to update download status:', error);
  }
}

/**
 * Track package download in database
 */
async function trackPackageDownload(
  requestId: string,
  packageId: string,
  organizationId: string,
  fileSize: number
): Promise<void> {
  try {
    const supabase = await createClient();

    await supabase.from('sat_requests').insert({
      organization_id: organizationId,
      request_type: 'cfdi_package_download',
      request_data: {
        parentRequestId: requestId,
        packageId,
      },
      response_data: {
        fileSize,
        downloadedAt: new Date().toISOString(),
      },
      status: 'completed',
      completed_at: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Failed to track package download:', error);
  }
}
