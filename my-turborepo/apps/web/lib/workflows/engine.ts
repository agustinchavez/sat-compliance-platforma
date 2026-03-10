/**
 * Workflow Engine (Component 17)
 *
 * Core orchestration engine for invoice workflow transitions.
 * Validates transitions, executes actions, and persists audit logs.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { InvoiceStatus } from '@/lib/invoices/types';
import {
  getRuleForEvent,
  isTerminalState,
  INVOICE_STATES,
} from './state-machine';
import {
  WorkflowError,
  invalidTransitionError,
  invoiceNotFoundError,
  terminalStateError,
  invalidEventError,
} from './errors';
import {
  executePDFAction,
  enqueueSendInvoiceEmail,
  enqueueCancellationEmail,
  notifyTeam,
  buildStampSuccessMessage,
  buildStampFailureMessage,
  buildCancellationMessage,
  schedulePaymentReminders,
  cancelPaymentReminders,
} from './actions';
import type {
  WorkflowEvent,
  WorkflowLogEntry,
  WorkflowLogInput,
  TransitionRule,
  ActionResult,
  ActionType,
} from './types';

// ============================================================================
// WorkflowEngine Class
// ============================================================================

/**
 * Workflow engine for processing invoice events.
 *
 * Orchestrates status transitions, action execution, and audit logging.
 * Uses service-role Supabase client for database access.
 */
export class WorkflowEngine {
  private supabase: SupabaseClient;

  constructor(supabase?: SupabaseClient) {
    this.supabase =
      supabase ??
      createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      );
  }

  /**
   * Main entry point. Given a workflow event, looks up the relevant
   * transition rule, executes all actions, and persists a log entry.
   *
   * Non-fatal action failures are captured in the log but do NOT
   * cause the overall workflow to fail.
   *
   * @param event - The workflow event to process
   * @returns WorkflowLogEntry recording what happened
   * @throws WorkflowError if transition is invalid or invoice not found
   */
  async executeWorkflow(event: WorkflowEvent): Promise<WorkflowLogEntry> {
    console.log(
      `[workflow] Processing event '${event.type}' for invoice ${event.invoiceId}`
    );

    try {
      // Validate the transition
      const { currentStatus, rule } = await this.validateTransition(
        event.invoiceId,
        event.organizationId,
        event
      );

      // Execute all actions (non-fatal failures are captured)
      const actionResults = await this.triggerActions(rule, event);

      // Determine overall success (workflow succeeded even if some actions failed)
      const allActionsSucceeded = actionResults.every((r) => r.success);

      // Persist the log entry
      const logEntry = await this.persistLog({
        invoiceId: event.invoiceId,
        organizationId: event.organizationId,
        eventType: event.type,
        fromStatus: currentStatus,
        toStatus: rule.to,
        actionsTriggered: rule.actions,
        actionResults,
        success: true, // Workflow succeeded (transition was valid)
        errorMessage: allActionsSucceeded
          ? null
          : `Some actions failed: ${actionResults.filter((r) => !r.success).map((r) => r.actionType).join(', ')}`,
        metadata: event.metadata ?? {},
      });

      console.log(
        `[workflow] Event '${event.type}' processed successfully for invoice ${event.invoiceId}`
      );

      return logEntry;
    } catch (error) {
      // Log the failure
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';

      const logEntry = await this.persistLog({
        invoiceId: event.invoiceId,
        organizationId: event.organizationId,
        eventType: event.type,
        fromStatus: null,
        toStatus: null,
        actionsTriggered: [],
        actionResults: [],
        success: false,
        errorMessage,
        metadata: event.metadata ?? {},
      });

      console.error(
        `[workflow] Event '${event.type}' failed for invoice ${event.invoiceId}:`,
        errorMessage
      );

      // Re-throw the error
      throw error;
    }
  }

  /**
   * Validates the transition is allowed for the invoice's current status.
   *
   * @throws WorkflowError('INVALID_TRANSITION') if not allowed
   * @throws WorkflowError('TERMINAL_STATE') if invoice is in a terminal state
   * @throws WorkflowError('INVOICE_NOT_FOUND') if invoice doesn't exist
   */
  async validateTransition(
    invoiceId: string,
    organizationId: string,
    event: WorkflowEvent
  ): Promise<{ currentStatus: InvoiceStatus; rule: TransitionRule }> {
    // Fetch current invoice status
    const { data: invoice, error } = await this.supabase
      .from('invoices')
      .select('id, status, folio_number, receiver_name')
      .eq('id', invoiceId)
      .eq('organization_id', organizationId)
      .single();

    if (error || !invoice) {
      throw invoiceNotFoundError(invoiceId);
    }

    const currentStatus = invoice.status as InvoiceStatus;

    // Check if in terminal state
    if (isTerminalState(currentStatus)) {
      throw terminalStateError(currentStatus, invoiceId);
    }

    // Get the transition rule for this event
    const rule = getRuleForEvent(currentStatus, event.type);

    if (!rule) {
      throw invalidEventError(event.type);
    }

    // Verify the transition is valid
    if (rule.from !== currentStatus) {
      throw invalidTransitionError(currentStatus, rule.to, invoiceId);
    }

    return { currentStatus, rule };
  }

  /**
   * Executes all action handlers for a transition rule.
   *
   * Each action is wrapped in its own try/catch.
   * A failed action does NOT prevent other actions from running.
   * All results are captured and returned.
   *
   * @param rule - The transition rule containing actions to execute
   * @param event - The triggering event (for context)
   * @returns Array of ActionResults
   */
  async triggerActions(
    rule: TransitionRule,
    event: WorkflowEvent
  ): Promise<ActionResult[]> {
    const results: ActionResult[] = [];

    for (const actionType of rule.actions) {
      try {
        const result = await this.executeAction(actionType, event, rule);
        if (Array.isArray(result)) {
          results.push(...result);
        } else {
          results.push(result);
        }
      } catch (error) {
        // Capture the error but don't throw
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error';
        results.push({
          actionType,
          success: false,
          error: errorMessage,
          executedAt: new Date().toISOString(),
        });
        console.error(
          `[workflow] Action '${actionType}' failed (non-fatal):`,
          errorMessage
        );
      }
    }

    return results;
  }

  /**
   * Execute a single action.
   */
  private async executeAction(
    actionType: ActionType,
    event: WorkflowEvent,
    rule: TransitionRule
  ): Promise<ActionResult | ActionResult[]> {
    const { invoiceId, organizationId } = event;
    const language = (event.metadata?.language as 'es' | 'en') ?? 'es';

    switch (actionType) {
      case 'generate_pdf':
        return executePDFAction(invoiceId, organizationId, language);

      case 'send_customer_email':
        // Different email types based on the event
        if (event.type === 'invoice.stamp_succeeded') {
          return enqueueSendInvoiceEmail(invoiceId, organizationId, language);
        } else if (event.type === 'invoice.cancelled') {
          return enqueueCancellationEmail(invoiceId, organizationId, language);
        }
        // Default: invoice sent email
        return enqueueSendInvoiceEmail(invoiceId, organizationId, language);

      case 'send_team_notification':
        return this.sendTeamNotification(event, rule);

      case 'schedule_payment_reminder':
        return schedulePaymentReminders(invoiceId, organizationId);

      case 'cancel_scheduled_reminders':
        return cancelPaymentReminders(invoiceId);

      default:
        return {
          actionType,
          success: false,
          error: `Unknown action type: ${actionType}`,
          executedAt: new Date().toISOString(),
        };
    }
  }

  /**
   * Send team notification based on the event type.
   */
  private async sendTeamNotification(
    event: WorkflowEvent,
    rule: TransitionRule
  ): Promise<ActionResult> {
    const { invoiceId, organizationId } = event;

    // Fetch invoice details for the notification
    const { data: invoice } = await this.supabase
      .from('invoices')
      .select('folio_number, receiver_name, cancellation_reason')
      .eq('id', invoiceId)
      .single();

    const folio = invoice?.folio_number ?? invoiceId;
    const customerName = invoice?.receiver_name ?? 'Cliente';

    let message: string;

    switch (event.type) {
      case 'invoice.stamp_succeeded':
        message = buildStampSuccessMessage(folio, customerName);
        break;

      case 'invoice.stamp_failed':
        const errorReason =
          (event.metadata?.errorReason as string) ?? 'Error desconocido';
        message = buildStampFailureMessage(folio, errorReason);
        break;

      case 'invoice.cancelled':
        const motivo = invoice?.cancellation_reason ?? '';
        message = buildCancellationMessage(folio, customerName, motivo);
        break;

      default:
        message = `Evento ${event.type} para factura ${folio}`;
    }

    return notifyTeam({
      invoiceId,
      organizationId,
      eventType: event.type,
      message,
      metadata: event.metadata,
    });
  }

  /**
   * Persists a WorkflowLogEntry to the workflow_logs table.
   */
  private async persistLog(
    input: WorkflowLogInput
  ): Promise<WorkflowLogEntry> {
    const { data, error } = await this.supabase
      .from('workflow_logs')
      .insert({
        invoice_id: input.invoiceId,
        organization_id: input.organizationId,
        event_type: input.eventType,
        from_status: input.fromStatus,
        to_status: input.toStatus,
        actions_triggered: input.actionsTriggered,
        action_results: input.actionResults,
        success: input.success,
        error_message: input.errorMessage,
        metadata: input.metadata,
      })
      .select()
      .single();

    if (error) {
      console.error('[workflow] Failed to persist log:', error.message);
      // Return a synthetic log entry if we can't persist
      return {
        id: 'failed-to-persist',
        invoiceId: input.invoiceId,
        organizationId: input.organizationId,
        eventType: input.eventType,
        fromStatus: input.fromStatus,
        toStatus: input.toStatus,
        actionsTriggered: input.actionsTriggered,
        actionResults: input.actionResults,
        success: input.success,
        errorMessage: input.errorMessage,
        metadata: input.metadata,
        createdAt: new Date().toISOString(),
      };
    }

    return {
      id: data.id,
      invoiceId: data.invoice_id,
      organizationId: data.organization_id,
      eventType: data.event_type,
      fromStatus: data.from_status,
      toStatus: data.to_status,
      actionsTriggered: data.actions_triggered ?? [],
      actionResults: data.action_results ?? [],
      success: data.success,
      errorMessage: data.error_message,
      metadata: data.metadata ?? {},
      createdAt: data.created_at,
    };
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let workflowEngineInstance: WorkflowEngine | null = null;

/**
 * Get the singleton workflow engine instance.
 */
export function getWorkflowEngine(): WorkflowEngine {
  if (!workflowEngineInstance) {
    workflowEngineInstance = new WorkflowEngine();
  }
  return workflowEngineInstance;
}

/**
 * Create a new workflow engine with a custom Supabase client.
 * Useful for testing.
 */
export function createWorkflowEngine(supabase: SupabaseClient): WorkflowEngine {
  return new WorkflowEngine(supabase);
}
