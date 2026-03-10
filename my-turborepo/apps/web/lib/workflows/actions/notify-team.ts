/**
 * Team Notification Action (Component 17)
 *
 * Stub for team notifications (Slack, internal email, etc.).
 * Logs to workflow_logs. Full implementation is future work.
 *
 * IMPORTANT: This action must NOT throw — team notifications are non-critical.
 */

import type { ActionResult, WorkflowEventType } from '../types';
import { successResult, failureResult } from './types';

/**
 * Parameters for team notification.
 */
export interface TeamNotifyParams {
  /** Invoice ID */
  invoiceId: string;
  /** Organization ID */
  organizationId: string;
  /** Event that triggered this notification */
  eventType: WorkflowEventType;
  /** Human-readable message */
  message: string;
  /** Optional additional context */
  metadata?: Record<string, unknown>;
}

/**
 * Send a team notification.
 *
 * STUB IMPLEMENTATION — logs to console, always returns success.
 * Future implementation will:
 * - Send to Slack webhook if configured
 * - Send internal email to team members
 * - Create in-app notification
 *
 * @param params - Notification parameters
 * @returns ActionResult (always success for stub)
 */
export async function notifyTeam(params: TeamNotifyParams): Promise<ActionResult> {
  try {
    // Log the notification
    console.log(
      `[team-notify] ${params.eventType} for invoice ${params.invoiceId}: ${params.message}`
    );

    if (params.metadata) {
      console.log(`[team-notify] Metadata:`, JSON.stringify(params.metadata));
    }

    // In the future, this would:
    // 1. Fetch organization's notification settings
    // 2. Send to configured Slack webhook
    // 3. Email team members with appropriate roles
    // 4. Create in-app notifications

    return successResult('send_team_notification');
  } catch (error) {
    // Even on error, we don't fail — just log and return success
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[team-notify] Error (non-fatal):`, message);

    // Return success anyway — team notifications are non-critical
    return successResult('send_team_notification');
  }
}

/**
 * Build a notification message for a stamp success event.
 */
export function buildStampSuccessMessage(
  invoiceFolio: string,
  customerName: string
): string {
  return `Factura ${invoiceFolio} timbrada exitosamente para ${customerName}`;
}

/**
 * Build a notification message for a stamp failure event.
 */
export function buildStampFailureMessage(
  invoiceFolio: string,
  errorReason: string
): string {
  return `Error al timbrar factura ${invoiceFolio}: ${errorReason}`;
}

/**
 * Build a notification message for a cancellation event.
 */
export function buildCancellationMessage(
  invoiceFolio: string,
  customerName: string,
  motivo: string
): string {
  return `Factura ${invoiceFolio} cancelada (${customerName}). Motivo: ${motivo}`;
}

/**
 * Build a notification message for a payment reminder event.
 */
export function buildPaymentReminderMessage(
  invoiceFolio: string,
  customerName: string,
  daysUntilDue: number
): string {
  if (daysUntilDue > 0) {
    return `Recordatorio: Factura ${invoiceFolio} (${customerName}) vence en ${daysUntilDue} días`;
  } else if (daysUntilDue === 0) {
    return `Alerta: Factura ${invoiceFolio} (${customerName}) vence hoy`;
  } else {
    const overdueDays = Math.abs(daysUntilDue);
    return `Urgente: Factura ${invoiceFolio} (${customerName}) vencida hace ${overdueDays} días`;
  }
}
