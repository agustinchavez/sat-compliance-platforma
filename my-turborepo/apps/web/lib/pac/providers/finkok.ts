/**
 * Finkok PAC Provider (Component 15 - Step 6)
 *
 * Implementation of the PAC provider interface for Finkok.
 * Finkok uses SOAP-based API for stamping and cancellation.
 */

import * as crypto from 'crypto';
import type { PACProviderInterface } from './base';
import type {
  PACCredentials,
  StampRequest,
  StampResult,
  CancelRequest,
  CancelResult,
  CFDIStatus,
  PAC_ENDPOINTS,
} from '../types';
import {
  PACError,
  mapFinkokError,
  mapFinkokCancelStatus,
  validateCancelRequest,
} from '../errors';
import {
  callSOAP,
  buildStampEnvelope,
  buildCancelEnvelope,
  buildStampedQueryEnvelope,
  parseStampResponse,
  parseSOAPResponse,
  type FinkokStampResult,
} from '../soap-client';
import { extractTFD } from '../tfd-parser';

// ============================================================================
// Constants
// ============================================================================

const FINKOK_SUCCESS_STATUS = 'Comprobante timbrado satisfactoriamente';
const DUPLICATE_STAMP_CODE = '307';
const MAX_RECOVERY_RETRIES = 3;
const RECOVERY_DELAY_MS = 2000;

// ============================================================================
// Endpoint URLs
// ============================================================================

const FINKOK_ENDPOINTS = {
  sandbox: {
    stamp: 'https://demo-facturacion.finkok.com/servicios/soap/stamp',
    cancel: 'https://demo-facturacion.finkok.com/servicios/soap/cancel',
  },
  production: {
    stamp: 'https://facturacion.finkok.com/servicios/soap/stamp',
    cancel: 'https://facturacion.finkok.com/servicios/soap/cancel',
  },
} as const;

// ============================================================================
// Finkok Provider Implementation
// ============================================================================

export class FinkokProvider implements PACProviderInterface {
  /**
   * Stamp a pre-signed CFDI using Finkok's SOAP API
   */
  async stamp(request: StampRequest, credentials: PACCredentials): Promise<StampResult> {
    const { signedXml, issuerRfc } = request;
    const { finkokUsername, finkokPassword, environment } = credentials;

    if (!finkokUsername || !finkokPassword) {
      throw new PACError(
        'PAC_CREDENTIALS_NOT_FOUND',
        'Finkok credentials not configured',
        false
      );
    }

    const endpoint = FINKOK_ENDPOINTS[environment].stamp;

    // Build and send SOAP request
    const envelope = buildStampEnvelope(signedXml, finkokUsername, finkokPassword);

    const response = await callSOAP({
      endpoint,
      soapAction: 'stamp',
      body: envelope,
      timeoutMs: 60000, // 60s timeout for stamp
    });

    // Parse response
    const stampResult = parseStampResponse(response.rawXml);

    // Check for success
    if (stampResult.codEstatus === FINKOK_SUCCESS_STATUS) {
      return this.buildStampResult(stampResult, credentials.provider);
    }

    // Check for errors
    if (stampResult.incidencias.length > 0) {
      const incidencia = stampResult.incidencias[0];

      // Handle duplicate stamp (code 307) - idempotent recovery
      if (incidencia.codigoError === DUPLICATE_STAMP_CODE) {
        // Check if stamped XML was returned
        if (stampResult.xml) {
          return this.buildStampResult(stampResult, credentials.provider);
        }

        // Try to recover from Finkok's stamped service
        const recoveredXml = await this.recoverFromDuplicate(
          signedXml,
          issuerRfc,
          credentials
        );

        // Re-parse the recovered response
        return this.buildStampResultFromXml(recoveredXml, credentials.provider);
      }

      // Other error - map and throw
      throw mapFinkokError(incidencia.codigoError, incidencia.mensajeIncidencia);
    }

    // No success status and no incidencias - unexpected
    throw new PACError(
      'PAC_UNKNOWN_ERROR',
      `Unexpected Finkok response: ${stampResult.codEstatus || 'No status'}`,
      false
    );
  }

  /**
   * Cancel a stamped CFDI
   */
  async cancel(request: CancelRequest, credentials: PACCredentials): Promise<CancelResult> {
    const { uuid, issuerRfc, motivo, folioSustitucion, orgId } = request;
    const { finkokUsername, finkokPassword, environment } = credentials;

    if (!finkokUsername || !finkokPassword) {
      throw new PACError(
        'PAC_CREDENTIALS_NOT_FOUND',
        'Finkok credentials not configured',
        false
      );
    }

    // Validate motivo requirements
    validateCancelRequest(motivo, folioSustitucion);

    // Get CSD for cancel (Finkok requires PEM format)
    // Note: In real implementation, this would call getOrganizationCSD(orgId)
    // For now, we expect the caller to provide CSD in the credentials
    const { cerPem, keyPem } = await this.getCSDForCancel(orgId);

    const endpoint = FINKOK_ENDPOINTS[environment].cancel;

    // Build and send SOAP request
    const envelope = buildCancelEnvelope({
      uuids: [uuid],
      username: finkokUsername,
      password: finkokPassword,
      taxpayerId: issuerRfc,
      cerPem,
      keyPem,
      motivo,
      folioSustitucion,
    });

    const response = await callSOAP({
      endpoint,
      soapAction: 'cancel',
      body: envelope,
      timeoutMs: 60000,
    });

    // Parse cancel response
    const result = parseSOAPResponse(response.rawXml, 'cancelResult');

    // Extract Folios array
    const folios = result.Folios as { Folio?: Record<string, unknown> | Record<string, unknown>[] } | undefined;
    let estatusUUID = '';
    let acuse = '';

    if (folios?.Folio) {
      const folio = Array.isArray(folios.Folio) ? folios.Folio[0] : folios.Folio;
      estatusUUID = (folio?.EstatusUUID as string) || '';
    }

    // Get Acuse if present
    acuse = (result.Acuse as string) || '';

    // Check status
    const cancelStatus = mapFinkokCancelStatus(estatusUUID);

    if (cancelStatus.error) {
      throw cancelStatus.error;
    }

    return {
      uuid,
      estatusUUID,
      acuse,
      cancelled: cancelStatus.cancelled,
    };
  }

  /**
   * Query CFDI status from SAT via Finkok
   */
  async queryStatus(
    uuid: string,
    issuerRfc: string,
    credentials: PACCredentials
  ): Promise<CFDIStatus> {
    // Finkok's get_sat_status service
    // For now, return 'unknown' as status query is optional
    // Full implementation would call the get_sat_status SOAP service
    return 'unknown';
  }

  // ==========================================================================
  // Private Helpers
  // ==========================================================================

  /**
   * Build StampResult from parsed Finkok response
   */
  private buildStampResult(
    stampResult: FinkokStampResult,
    provider: 'finkok' | 'sw'
  ): StampResult {
    if (!stampResult.xml) {
      throw new PACError(
        'TFD_MISSING',
        'Stamp successful but no XML returned',
        false
      );
    }

    // Extract TFD from stamped XML
    const tfd = extractTFD(stampResult.xml);

    return {
      stampedXml: stampResult.xml,
      uuid: tfd.uuid,
      fechaTimbrado: tfd.fechaTimbrado,
      rfcProvCertif: tfd.rfcProvCertif,
      selloCFD: tfd.selloCFD,
      noCertificadoSAT: tfd.noCertificadoSAT,
      selloSAT: tfd.selloSAT,
      pacProvider: provider,
    };
  }

  /**
   * Build StampResult from recovered XML
   */
  private buildStampResultFromXml(
    stampedXml: string,
    provider: 'finkok' | 'sw'
  ): StampResult {
    // Extract TFD from stamped XML
    const tfd = extractTFD(stampedXml);

    return {
      stampedXml,
      uuid: tfd.uuid,
      fechaTimbrado: tfd.fechaTimbrado,
      rfcProvCertif: tfd.rfcProvCertif,
      selloCFD: tfd.selloCFD,
      noCertificadoSAT: tfd.noCertificadoSAT,
      selloSAT: tfd.selloSAT,
      pacProvider: provider,
    };
  }

  /**
   * Recover stamped XML from Finkok's "stamped" service
   * Used when code 307 is returned but no XML
   */
  private async recoverFromDuplicate(
    originalXml: string,
    issuerRfc: string,
    credentials: PACCredentials
  ): Promise<string> {
    const { finkokUsername, finkokPassword, environment } = credentials;

    if (!finkokUsername || !finkokPassword) {
      throw new PACError(
        'PAC_STAMP_DUPLICATE',
        'Cannot recover duplicate stamp: credentials missing',
        false
      );
    }

    // Extract UUID from original XML if possible
    // For now, we'll need to call the stamped service differently
    // This is a simplified version - full implementation would parse the original XML

    let lastError: Error | undefined;

    for (let attempt = 1; attempt <= MAX_RECOVERY_RETRIES; attempt++) {
      try {
        // Call Finkok's stamped service
        // Note: This is a placeholder - actual implementation needs the UUID
        // from the original XML or error response

        // Wait before retry
        if (attempt > 1) {
          await this.sleep(RECOVERY_DELAY_MS);
        }

        // For now, throw the duplicate error
        // Full implementation would query the stamped service
        throw new PACError(
          'PAC_STAMP_DUPLICATE',
          `CFDI already stamped (attempt ${attempt}/${MAX_RECOVERY_RETRIES})`,
          attempt < MAX_RECOVERY_RETRIES
        );
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        if (error instanceof PACError && !error.retryable) {
          throw error;
        }
      }
    }

    throw new PACError(
      'PAC_STAMP_DUPLICATE',
      `Failed to recover duplicate stamp after ${MAX_RECOVERY_RETRIES} attempts: ${lastError?.message}`,
      false
    );
  }

  /**
   * Get CSD in PEM format for cancellation
   * Converts DER → PEM using Node.js crypto
   */
  private async getCSDForCancel(orgId: string): Promise<{ cerPem: string; keyPem: string }> {
    // In real implementation, this would:
    // 1. Call getOrganizationCSD(orgId) to get cerBuffer, keyBuffer, password
    // 2. Convert DER to PEM

    // For now, throw an error indicating this needs to be implemented with real CSD
    throw new PACError(
      'PAC_CREDENTIALS_NOT_FOUND',
      'CSD retrieval for cancel not yet implemented',
      false
    );
  }

  /**
   * Convert DER certificate to PEM format
   */
  static derCertToPem(derBuffer: Buffer): string {
    const cert = new crypto.X509Certificate(derBuffer);
    return cert.toString();
  }

  /**
   * Convert DER private key to PEM format
   */
  static derKeyToPem(derBuffer: Buffer, password: string): string {
    const privateKey = crypto.createPrivateKey({
      key: derBuffer,
      format: 'der',
      type: 'pkcs8',
      passphrase: password,
    });
    return privateKey.export({ type: 'pkcs8', format: 'pem' }) as string;
  }

  /**
   * Sleep for specified milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
