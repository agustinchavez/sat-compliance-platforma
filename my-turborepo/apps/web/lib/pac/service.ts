/**
 * PAC Service (Component 15 - Step 8)
 *
 * Main orchestrator for PAC operations. This service:
 * - Retrieves PAC credentials from the database
 * - Selects the appropriate provider (Finkok/SW)
 * - Handles retry logic for network errors
 * - Provides the public API for stamping and cancellation
 */

import { createClient } from '@/lib/supabase/server';
import { decryptData } from '@/lib/organizations/encryption';
import { FinkokProvider } from './providers/finkok';
import { SWProvider } from './providers/sw';
import type { PACProviderInterface } from './providers/base';
import type {
  PACCredentials,
  StampRequest,
  StampResult,
  CancelRequest,
  CancelResult,
  CFDIStatus,
  PACProvider,
  PACEnvironment,
} from './types';
import { PACError, isRetryable } from './errors';

// ============================================================================
// Constants
// ============================================================================

/** Maximum retry attempts for retryable errors */
const MAX_RETRIES = 3;

/** Base delay between retries (milliseconds) */
const RETRY_DELAY_MS = 1000;

// ============================================================================
// Provider Factory
// ============================================================================

/**
 * Get the appropriate PAC provider instance
 *
 * @param credentials - PAC credentials with provider type
 * @returns PAC provider instance
 * @throws PACError if provider is unknown
 */
export function getPACProvider(credentials: PACCredentials): PACProviderInterface {
  switch (credentials.provider) {
    case 'finkok':
      return new FinkokProvider();
    case 'sw':
      return new SWProvider();
    default:
      throw new PACError(
        'PAC_UNKNOWN_ERROR',
        `Unknown PAC provider: ${credentials.provider}`,
        false
      );
  }
}

// ============================================================================
// Credential Retrieval
// ============================================================================

/**
 * Database row type for PAC credentials
 */
interface PACCredentialsRow {
  id: string;
  organization_id: string;
  provider: PACProvider;
  is_primary: boolean;
  environment: PACEnvironment;
  finkok_username: string | null;
  finkok_password_encrypted: string | null;
  sw_username: string | null;
  sw_password_encrypted: string | null;
  sw_token_encrypted: string | null;
  sw_token_expires_at: string | null;
}

/**
 * Get PAC credentials for an organization
 *
 * @param orgId - Organization UUID
 * @returns Decrypted PAC credentials
 * @throws PACError if credentials not found or decryption fails
 */
export async function getPACCredentials(orgId: string): Promise<PACCredentials> {
  const supabase = await createClient();

  // Query the primary PAC credentials for this organization
  const { data, error } = await supabase
    .from('organization_pac_credentials')
    .select('*')
    .eq('organization_id', orgId)
    .eq('is_primary', true)
    .single();

  if (error || !data) {
    throw new PACError(
      'PAC_CREDENTIALS_NOT_FOUND',
      `No PAC credentials found for organization ${orgId}`,
      false
    );
  }

  const row = data as PACCredentialsRow;

  // Build credentials based on provider
  const credentials: PACCredentials = {
    provider: row.provider,
    environment: row.environment,
  };

  // Decrypt Finkok credentials if present
  if (row.provider === 'finkok' && row.finkok_username && row.finkok_password_encrypted) {
    credentials.finkokUsername = row.finkok_username;
    credentials.finkokPassword = decryptPasswordField(row.finkok_password_encrypted);
  }

  // Decrypt SW credentials if present
  if (row.provider === 'sw') {
    if (row.sw_username && row.sw_password_encrypted) {
      credentials.swUsername = row.sw_username;
      credentials.swPassword = decryptPasswordField(row.sw_password_encrypted);
    }

    // Decrypt token if present
    if (row.sw_token_encrypted) {
      credentials.swToken = decryptPasswordField(row.sw_token_encrypted);
      if (row.sw_token_expires_at) {
        credentials.swTokenExpiresAt = new Date(row.sw_token_expires_at);
      }
    }
  }

  return credentials;
}

/**
 * Decrypt a password field stored as JSON with encryptedData, iv, authTag
 */
function decryptPasswordField(encryptedJson: string): string {
  try {
    const encrypted = JSON.parse(encryptedJson);
    const decrypted = decryptData(encrypted, 'pac', 'utf8');
    return decrypted as string;
  } catch (error) {
    throw new PACError(
      'PAC_CREDENTIALS_NOT_FOUND',
      `Failed to decrypt PAC credentials: ${error instanceof Error ? error.message : 'Unknown error'}`,
      false
    );
  }
}

// ============================================================================
// Stamp Service
// ============================================================================

/**
 * Stamp a pre-signed CFDI
 *
 * @param request - Stamp request with signed XML
 * @returns Stamp result with stamped XML and TFD data
 * @throws PACError on stamping failure
 *
 * @example
 * ```ts
 * const result = await stampCFDI({
 *   signedXml: signedInvoice.signedXml,
 *   issuerRfc: 'ABC123456789',
 *   orgId: organizationId,
 * });
 * console.log('UUID:', result.uuid);
 * ```
 */
export async function stampCFDI(request: StampRequest): Promise<StampResult> {
  const credentials = await getPACCredentials(request.orgId);
  const provider = getPACProvider(credentials);

  let lastError: unknown;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const result = await provider.stamp(request, credentials);
      return result;
    } catch (error) {
      lastError = error;

      // Don't retry non-retryable errors
      if (!isRetryable(error)) {
        throw error;
      }

      // Don't retry on last attempt
      if (attempt === MAX_RETRIES) {
        throw error;
      }

      // Wait before retry (exponential backoff)
      await sleep(RETRY_DELAY_MS * attempt);
    }
  }

  // Should never reach here, but TypeScript needs it
  throw lastError;
}

// ============================================================================
// Cancel Service
// ============================================================================

/**
 * Cancel a stamped CFDI
 *
 * @param request - Cancel request with UUID and motivo
 * @returns Cancel result
 * @throws PACError on cancellation failure
 *
 * @example
 * ```ts
 * const result = await cancelCFDI({
 *   uuid: '05c519de-6d20-4258-88fb-c69a5970e927',
 *   issuerRfc: 'ABC123456789',
 *   motivo: '02',
 *   orgId: organizationId,
 * });
 * console.log('Cancelled:', result.cancelled);
 * ```
 */
export async function cancelCFDI(request: CancelRequest): Promise<CancelResult> {
  const credentials = await getPACCredentials(request.orgId);
  const provider = getPACProvider(credentials);

  // No retries for cancel - idempotency is handled at provider level
  return provider.cancel(request, credentials);
}

// ============================================================================
// Status Query Service
// ============================================================================

/**
 * Query CFDI status from SAT
 *
 * @param uuid - The UUID of the CFDI to query
 * @param orgId - Organization UUID
 * @returns CFDI status
 */
export async function queryStatus(uuid: string, orgId: string): Promise<CFDIStatus> {
  const credentials = await getPACCredentials(orgId);
  const provider = getPACProvider(credentials);

  // Get issuer RFC from organization
  const supabase = await createClient();
  const { data: org } = await supabase
    .from('organizations')
    .select('rfc')
    .eq('id', orgId)
    .single();

  const issuerRfc = org?.rfc || '';

  return provider.queryStatus(uuid, issuerRfc, credentials);
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Sleep for specified milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Check if PAC is configured for an organization
 *
 * @param orgId - Organization UUID
 * @returns true if PAC credentials exist
 */
export async function isPACConfigured(orgId: string): Promise<boolean> {
  try {
    await getPACCredentials(orgId);
    return true;
  } catch {
    return false;
  }
}

/**
 * Get PAC provider info for an organization
 *
 * @param orgId - Organization UUID
 * @returns Provider info or null
 */
export async function getPACInfo(orgId: string): Promise<{
  provider: PACProvider;
  environment: PACEnvironment;
} | null> {
  try {
    const credentials = await getPACCredentials(orgId);
    return {
      provider: credentials.provider,
      environment: credentials.environment,
    };
  } catch {
    return null;
  }
}
