/**
 * SW (Smarter Web) PAC Provider (Component 15 - Step 7)
 *
 * Implementation of the PAC provider interface for SW Sapien.
 * SW uses REST-based API with Bearer token authentication.
 */

import type { PACProviderInterface } from './base';
import type {
  PACCredentials,
  StampRequest,
  StampResult,
  CancelRequest,
  CancelResult,
  CFDIStatus,
} from '../types';
import {
  PACError,
  mapSWError,
  validateCancelRequest,
  wrapNetworkError,
} from '../errors';
import { extractTFD } from '../tfd-parser';

// ============================================================================
// Constants
// ============================================================================

/** Token cache key expiry buffer (5 minutes before actual expiry) */
const TOKEN_EXPIRY_BUFFER_MS = 5 * 60 * 1000;

/** Default timeout for REST calls (30 seconds) */
const DEFAULT_TIMEOUT_MS = 30000;

// ============================================================================
// Endpoint URLs
// ============================================================================

const SW_ENDPOINTS = {
  sandbox: {
    auth: 'https://services.test.sw.com.mx/v2/security/authenticate',
    stamp: 'https://services.test.sw.com.mx/cfdi33/stamp/v4/',
    cancel: 'https://services.test.sw.com.mx/cfdi33',
    status: 'https://services.test.sw.com.mx/status',
  },
  production: {
    auth: 'https://services.sw.com.mx/v2/security/authenticate',
    stamp: 'https://services.sw.com.mx/cfdi33/stamp/v4/',
    cancel: 'https://services.sw.com.mx/cfdi33',
    status: 'https://services.sw.com.mx/status',
  },
} as const;

// ============================================================================
// Token Cache
// ============================================================================

interface CachedToken {
  token: string;
  expiresAt: Date;
}

/** In-memory token cache by orgId */
const tokenCache = new Map<string, CachedToken>();

// ============================================================================
// SW Provider Implementation
// ============================================================================

export class SWProvider implements PACProviderInterface {
  /**
   * Authenticate with SW and get bearer token
   */
  async authenticate(credentials: PACCredentials, orgId: string): Promise<string> {
    // Check if we have a pre-set infinite token
    if (credentials.swToken) {
      // Check if it has an expiry
      if (!credentials.swTokenExpiresAt) {
        // Infinite token
        return credentials.swToken;
      }

      // Check if still valid
      const now = new Date();
      if (credentials.swTokenExpiresAt > now) {
        return credentials.swToken;
      }
    }

    // Check cache
    const cacheKey = `${orgId}-${credentials.environment}`;
    const cached = tokenCache.get(cacheKey);

    if (cached) {
      const now = new Date();
      const expiryWithBuffer = new Date(cached.expiresAt.getTime() - TOKEN_EXPIRY_BUFFER_MS);

      if (now < expiryWithBuffer) {
        return cached.token;
      }
    }

    // Need to authenticate
    const { swUsername, swPassword, environment } = credentials;

    if (!swUsername || !swPassword) {
      throw new PACError(
        'PAC_CREDENTIALS_NOT_FOUND',
        'SW credentials not configured',
        false
      );
    }

    const endpoint = SW_ENDPOINTS[environment].auth;

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          user: swUsername,
          password: swPassword,
        }),
      });

      const data = await response.json() as SWAuthResponse;

      if (data.status !== 'success' || !data.data?.token) {
        throw new PACError(
          'PAC_AUTH_FAILED',
          data.message || 'SW authentication failed',
          false
        );
      }

      // Cache the token
      const expiresIn = data.data.expires_in || 7200; // Default 2 hours
      const expiresAt = new Date(Date.now() + expiresIn * 1000);

      tokenCache.set(cacheKey, {
        token: data.data.token,
        expiresAt,
      });

      return data.data.token;
    } catch (error) {
      if (error instanceof PACError) {
        throw error;
      }
      throw wrapNetworkError(error, 'SW authentication');
    }
  }

  /**
   * Stamp a pre-signed CFDI using SW's REST API
   */
  async stamp(request: StampRequest, credentials: PACCredentials): Promise<StampResult> {
    const { signedXml, orgId } = request;

    // Get token
    const token = await this.authenticate(credentials, orgId);

    const endpoint = SW_ENDPOINTS[credentials.environment].stamp;

    try {
      // Build multipart form data
      const formData = new FormData();
      const xmlBlob = new Blob([signedXml], { type: 'application/xml' });
      formData.append('xml', xmlBlob, 'cfdi.xml');

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

      try {
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
          },
          body: formData,
          signal: controller.signal,
        });

        const data = await response.json() as SWStampResponse;

        if (data.status !== 'success' || !data.data) {
          throw mapSWError(data.message || 'Unknown error', data.messageDetail);
        }

        // Extract stamped XML
        const stampedXml = data.data.cfdi;
        if (!stampedXml) {
          throw new PACError(
            'TFD_MISSING',
            'Stamp successful but no CFDI XML returned',
            false
          );
        }

        // Extract TFD data
        const tfd = extractTFD(stampedXml);

        return {
          stampedXml,
          uuid: tfd.uuid,
          fechaTimbrado: tfd.fechaTimbrado,
          rfcProvCertif: tfd.rfcProvCertif,
          selloCFD: tfd.selloCFD,
          noCertificadoSAT: tfd.noCertificadoSAT,
          selloSAT: tfd.selloSAT,
          pacProvider: 'sw',
        };
      } finally {
        clearTimeout(timeoutId);
      }
    } catch (error) {
      if (error instanceof PACError) {
        throw error;
      }

      // Handle abort (timeout)
      if (error instanceof Error && error.name === 'AbortError') {
        throw new PACError(
          'PAC_TIMEOUT',
          `SW stamp request timed out`,
          true,
          error
        );
      }

      throw wrapNetworkError(error, 'SW stamp');
    }
  }

  /**
   * Cancel a stamped CFDI using SW's REST API
   */
  async cancel(request: CancelRequest, credentials: PACCredentials): Promise<CancelResult> {
    const { uuid, motivo, folioSustitucion, orgId } = request;

    // Validate motivo requirements
    validateCancelRequest(motivo, folioSustitucion);

    // Get token
    const token = await this.authenticate(credentials, orgId);

    const endpoint = `${SW_ENDPOINTS[credentials.environment].cancel}/${uuid}`;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

      try {
        const response = await fetch(endpoint, {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            motivo,
            folioSustitucion: folioSustitucion || '',
          }),
          signal: controller.signal,
        });

        const data = await response.json() as SWCancelResponse;

        if (data.status !== 'success') {
          throw mapSWError(data.message || 'Unknown error', data.messageDetail);
        }

        return {
          uuid,
          estatusUUID: data.data?.status || 'unknown',
          acuse: data.data?.acuse || '',
          cancelled: data.status === 'success',
        };
      } finally {
        clearTimeout(timeoutId);
      }
    } catch (error) {
      if (error instanceof PACError) {
        throw error;
      }
      throw wrapNetworkError(error, 'SW cancel');
    }
  }

  /**
   * Query CFDI status from SAT via SW
   */
  async queryStatus(
    uuid: string,
    issuerRfc: string,
    credentials: PACCredentials
  ): Promise<CFDIStatus> {
    // SW status query endpoint
    // For now, return 'unknown' as status query is optional
    return 'unknown';
  }

  /**
   * Clear token cache (useful for testing)
   */
  static clearTokenCache(): void {
    tokenCache.clear();
  }

  /**
   * Get cached token (useful for testing)
   */
  static getCachedToken(orgId: string, environment: string): CachedToken | undefined {
    return tokenCache.get(`${orgId}-${environment}`);
  }
}

// ============================================================================
// SW Response Types
// ============================================================================

interface SWAuthResponse {
  status: 'success' | 'error';
  message?: string;
  messageDetail?: string;
  data?: {
    token: string;
    expires_in?: number;
  };
}

interface SWStampResponse {
  status: 'success' | 'error';
  message?: string;
  messageDetail?: string;
  data?: {
    tfd?: string;
    cfdi?: string;
    uuid?: string;
  };
}

interface SWCancelResponse {
  status: 'success' | 'error';
  message?: string;
  messageDetail?: string;
  data?: {
    status?: string;
    acuse?: string;
  };
}
