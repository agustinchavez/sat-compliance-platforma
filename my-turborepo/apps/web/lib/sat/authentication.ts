/**
 * SAT Authentication Service
 *
 * This file handles authentication with SAT's SOAP web services using FIEL.
 * Authentication flow:
 * 1. Load organization's FIEL credentials
 * 2. Create authentication signature
 * 3. Send SOAP authentication request
 * 4. Parse and cache authentication token
 * 5. Return token for use in subsequent requests
 *
 * Tokens expire in 5 minutes and are cached in Redis.
 */

import { createClient } from '@/lib/supabase/server';
import {
  loadAndDecryptFIEL,
  createAuthenticationSignature,
  getCertificateBase64,
  validateCertificateExpiry,
} from './fiel';
import {
  sendSOAPRequest,
  buildAuthenticationBody,
  extractSOAPValue,
} from './soap-client';
import {
  cacheAuthToken,
  getCachedAuthToken,
  invalidateAuthToken,
  incrementRateLimit,
  isRateLimitExceeded,
  getRateLimitStatus,
} from './cache';
import type {
  SATAuthToken,
  SATAuthRequest,
  SATAuthResponse,
  SOAPRequest,
} from './types';
import {
  SATAuthenticationError,
  SATRateLimitError,
  SATCertificateError,
} from './types';
import { SAT_ENDPOINTS } from './types';
import { formatSATDate } from './utils';
import {
  getSATStatusMessage,
  isSATAuthError,
  isSATRateLimit,
  formatSATError,
} from './sat-codes';

// ============================================================================
// Configuration
// ============================================================================

const TOKEN_EXPIRY_MINUTES = 5;
const TOKEN_BUFFER_SECONDS = 30; // Refresh 30 seconds before actual expiry

// ============================================================================
// Authentication
// ============================================================================

/**
 * Authenticates with SAT using organization's FIEL
 *
 * @param organizationId - Organization UUID
 * @param password - FIEL certificate password
 * @param forceRefresh - Force new token even if cached
 * @returns Authentication token
 * @throws SATAuthenticationError if authentication fails
 *
 * @example
 * ```ts
 * const auth = await authenticateWithSAT('org-uuid', 'cert-password');
 * console.log('Token:', auth.token);
 * console.log('Expires:', auth.expiresAt);
 * ```
 */
export async function authenticateWithSAT(
  organizationId: string,
  password: string,
  forceRefresh: boolean = false
): Promise<SATAuthToken> {
  try {
    // Check rate limit first
    const rateLimitExceeded = await isRateLimitExceeded(organizationId);
    if (rateLimitExceeded) {
      const status = await getRateLimitStatus(organizationId);
      throw new SATRateLimitError(
        'Daily SAT request limit exceeded',
        status.resetAt
      );
    }

    // Try to get cached token first (unless force refresh)
    if (!forceRefresh) {
      const cachedToken = await getCachedAuthToken(organizationId);
      if (cachedToken && isTokenValid(cachedToken)) {
        console.log('Using cached SAT auth token');
        return cachedToken;
      }
    }

    // Load and decrypt FIEL
    const fiel = await loadAndDecryptFIEL(organizationId, password);

    // Validate certificate is not expired
    validateCertificateExpiry(fiel.info);

    // Create authentication data
    const timestamp = formatSATDate(new Date());
    const signature = createAuthenticationSignature(timestamp, fiel);
    const certificateBase64 = getCertificateBase64(fiel);

    // Get organization RFC
    const supabase = await createClient();
    const { data: org } = await supabase
      .from('organizations')
      .select('rfc')
      .eq('id', organizationId)
      .single();

    if (!org) {
      throw new SATAuthenticationError('Organization not found');
    }

    // Build SOAP request
    const soapBody = buildAuthenticationBody(
      org.rfc,
      certificateBase64,
      signature
    );

    const soapRequest: SOAPRequest = {
      endpoint: SAT_ENDPOINTS.authentication,
      action: 'Autentica',
      body: soapBody,
    };

    // Send authentication request
    console.log(`Authenticating with SAT for org ${organizationId} (RFC: ${org.rfc})`);
    const response = await sendSOAPRequest(soapRequest, organizationId);

    // Increment rate limit counter
    await incrementRateLimit(organizationId);

    // Parse response
    if (!response.success || !response.data) {
      throw new SATAuthenticationError('Authentication failed: Invalid response');
    }

    // Extract token from response
    const token = extractAuthToken(response.data);

    if (!token) {
      throw new SATAuthenticationError('Authentication failed: No token in response');
    }

    // Create auth token object
    const now = new Date();
    const authToken: SATAuthToken = {
      token,
      expiresAt: new Date(now.getTime() + TOKEN_EXPIRY_MINUTES * 60 * 1000),
      issuedAt: now,
      organizationId,
      rfc: org.rfc,
    };

    // Cache token
    await cacheAuthToken(organizationId, authToken);

    // Log successful authentication
    console.log(`SAT authentication successful for org ${organizationId}`);

    // Track in database
    await trackAuthenticationRequest(organizationId, true);

    return authToken;
  } catch (error) {
    // Track failed authentication
    await trackAuthenticationRequest(organizationId, false, error);

    // Handle known error types
    if (
      error instanceof SATAuthenticationError ||
      error instanceof SATRateLimitError ||
      error instanceof SATCertificateError
    ) {
      throw error;
    }

    // Convert unknown errors
    throw new SATAuthenticationError(
      `Authentication failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Gets SAT authentication token (cached or new)
 *
 * @param organizationId - Organization UUID
 * @param password - FIEL certificate password
 * @returns Authentication token
 *
 * @example
 * ```ts
 * const token = await getSATToken('org-uuid', 'password');
 * console.log(token.token);
 * ```
 */
export async function getSATToken(
  organizationId: string,
  password: string
): Promise<SATAuthToken> {
  // Try cache first
  const cachedToken = await getCachedAuthToken(organizationId);

  if (cachedToken && isTokenValid(cachedToken)) {
    // Check if token is expiring soon (refresh proactively)
    if (isTokenExpiringSoon(cachedToken)) {
      console.log('Token expiring soon, refreshing...');
      return authenticateWithSAT(organizationId, password, true);
    }
    return cachedToken;
  }

  // Get new token
  return authenticateWithSAT(organizationId, password);
}

/**
 * Refreshes SAT authentication token
 *
 * @param organizationId - Organization UUID
 * @param password - FIEL certificate password
 * @returns New authentication token
 *
 * @example
 * ```ts
 * const newToken = await refreshSATToken('org-uuid', 'password');
 * ```
 */
export async function refreshSATToken(
  organizationId: string,
  password: string
): Promise<SATAuthToken> {
  // Invalidate current token
  await invalidateAuthToken(organizationId);

  // Get new token
  return authenticateWithSAT(organizationId, password, true);
}

/**
 * Invalidates SAT authentication token
 *
 * @param organizationId - Organization UUID
 *
 * @example
 * ```ts
 * await invalidateSATToken('org-uuid');
 * ```
 */
export async function invalidateSATToken(organizationId: string): Promise<void> {
  await invalidateAuthToken(organizationId);
  console.log(`Invalidated SAT token for org ${organizationId}`);
}

// ============================================================================
// Token Validation
// ============================================================================

/**
 * Checks if authentication token is valid
 *
 * @param token - SAT auth token
 * @returns true if valid
 */
function isTokenValid(token: SATAuthToken): boolean {
  const now = new Date();
  const expiresAt = new Date(token.expiresAt);

  return expiresAt > now;
}

/**
 * Checks if token is expiring soon (within buffer time)
 *
 * @param token - SAT auth token
 * @returns true if expiring soon
 */
function isTokenExpiringSoon(token: SATAuthToken): boolean {
  const now = new Date();
  const expiresAt = new Date(token.expiresAt);
  const bufferTime = TOKEN_BUFFER_SECONDS * 1000;

  return expiresAt.getTime() - now.getTime() < bufferTime;
}

/**
 * Gets time until token expires
 *
 * @param token - SAT auth token
 * @returns Seconds until expiry
 */
export function getTokenTTL(token: SATAuthToken): number {
  const now = new Date();
  const expiresAt = new Date(token.expiresAt);

  return Math.max(0, Math.floor((expiresAt.getTime() - now.getTime()) / 1000));
}

// ============================================================================
// Response Parsing
// ============================================================================

/**
 * Extracts authentication token from SOAP response
 *
 * @param responseData - SOAP response data
 * @returns Token string or null
 */
function extractAuthToken(responseData: any): string | null {
  // Try different possible paths for token
  const possiblePaths = [
    'AutenticaResponse.AutenticaResult',
    'AutenticaResult',
    'Token',
    'token',
  ];

  for (const path of possiblePaths) {
    const value = extractSOAPValue({ success: true, data: responseData }, path);
    if (value && typeof value === 'string') {
      return value;
    }
  }

  // Try to find any JWT-like string in response
  const jsonStr = JSON.stringify(responseData);
  const jwtMatch = jsonStr.match(/eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/);

  if (jwtMatch) {
    return jwtMatch[0];
  }

  return null;
}

// ============================================================================
// Request Tracking
// ============================================================================

/**
 * Tracks authentication request in database
 *
 * @param organizationId - Organization UUID
 * @param success - Whether authentication succeeded
 * @param error - Error if failed
 */
async function trackAuthenticationRequest(
  organizationId: string,
  success: boolean,
  error?: any
): Promise<void> {
  try {
    const supabase = await createClient();

    await supabase.from('sat_requests').insert({
      organization_id: organizationId,
      request_type: 'authentication',
      request_data: {
        timestamp: new Date().toISOString(),
      },
      response_data: success
        ? { authenticated: true }
        : undefined,
      status: success ? 'completed' : 'failed',
      error_message: error
        ? error instanceof Error
          ? error.message
          : String(error)
        : undefined,
      created_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Failed to track authentication request:', error);
    // Don't throw - tracking is not critical
  }
}

// ============================================================================
// Authentication Status
// ============================================================================

/**
 * Checks if organization can authenticate with SAT
 *
 * @param organizationId - Organization UUID
 * @returns Status and any errors
 *
 * @example
 * ```ts
 * const status = await checkAuthenticationStatus('org-uuid');
 * if (!status.canAuthenticate) {
 *   console.error('Cannot authenticate:', status.errors);
 * }
 * ```
 */
export async function checkAuthenticationStatus(organizationId: string): Promise<{
  canAuthenticate: boolean;
  hasToken: boolean;
  tokenExpiry: Date | null;
  rateLimitExceeded: boolean;
  rateLimitRemaining: number;
  errors: string[];
}> {
  const errors: string[] = [];

  try {
    // Check if FIEL exists
    const supabase = await createClient();
    const { data: org } = await supabase
      .from('organizations')
      .select('cfdi_cert, cfdi_key, cfdi_password_hash')
      .eq('id', organizationId)
      .single();

    if (!org) {
      errors.push('Organization not found');
      return {
        canAuthenticate: false,
        hasToken: false,
        tokenExpiry: null,
        rateLimitExceeded: false,
        rateLimitRemaining: 0,
        errors,
      };
    }

    if (!org.cfdi_cert || !org.cfdi_key || !org.cfdi_password_hash) {
      errors.push('FIEL certificates not uploaded');
    }

    // Check cached token
    const cachedToken = await getCachedAuthToken(organizationId);
    const hasToken = cachedToken !== null && isTokenValid(cachedToken);

    // Check rate limit
    const rateLimitStatus = await getRateLimitStatus(organizationId);

    return {
      canAuthenticate: errors.length === 0,
      hasToken,
      tokenExpiry: cachedToken?.expiresAt || null,
      rateLimitExceeded: rateLimitStatus.exceeded,
      rateLimitRemaining: rateLimitStatus.remaining,
      errors,
    };
  } catch (error) {
    errors.push(error instanceof Error ? error.message : 'Unknown error');
    return {
      canAuthenticate: false,
      hasToken: false,
      tokenExpiry: null,
      rateLimitExceeded: false,
      rateLimitRemaining: 0,
      errors,
    };
  }
}

/**
 * Gets authentication history for organization
 *
 * @param organizationId - Organization UUID
 * @param limit - Max number of records
 * @returns Authentication history
 */
export async function getAuthenticationHistory(
  organizationId: string,
  limit: number = 10
): Promise<any[]> {
  try {
    const supabase = await createClient();

    const { data } = await supabase
      .from('sat_requests')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('request_type', 'authentication')
      .order('created_at', { ascending: false })
      .limit(limit);

    return data || [];
  } catch (error) {
    console.error('Failed to get authentication history:', error);
    return [];
  }
}
