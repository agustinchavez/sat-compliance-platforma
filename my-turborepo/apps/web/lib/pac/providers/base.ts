/**
 * PAC Provider Interface (Component 15 - Step 5)
 *
 * Base interface that all PAC providers must implement.
 * This enables switching between providers (Finkok, SW) without
 * changing the calling code.
 */

import type {
  PACCredentials,
  StampRequest,
  StampResult,
  CancelRequest,
  CancelResult,
  CFDIStatus,
} from '../types';

/**
 * Interface that all PAC providers must implement
 */
export interface PACProviderInterface {
  /**
   * Stamp a pre-signed CFDI
   *
   * @param request - Stamp request with signed XML
   * @param credentials - PAC credentials
   * @returns Stamp result with stamped XML and TFD data
   * @throws PACError on stamping failure
   */
  stamp(request: StampRequest, credentials: PACCredentials): Promise<StampResult>;

  /**
   * Cancel a previously stamped CFDI
   *
   * @param request - Cancel request with UUID and motivo
   * @param credentials - PAC credentials
   * @returns Cancel result with status
   * @throws PACError on cancellation failure
   */
  cancel(request: CancelRequest, credentials: PACCredentials): Promise<CancelResult>;

  /**
   * Query the status of a CFDI from SAT
   *
   * @param uuid - The UUID of the CFDI to query
   * @param issuerRfc - RFC of the issuer
   * @param credentials - PAC credentials
   * @returns CFDI status ('active', 'cancelled', or 'unknown')
   */
  queryStatus(
    uuid: string,
    issuerRfc: string,
    credentials: PACCredentials
  ): Promise<CFDIStatus>;
}

/**
 * Provider name type (for logging/metrics)
 */
export type ProviderName = 'finkok' | 'sw';

/**
 * Provider factory function type
 */
export type ProviderFactory = () => PACProviderInterface;
