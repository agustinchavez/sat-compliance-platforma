/**
 * Action Handler Types (Component 17)
 *
 * Common types for workflow action handlers.
 */

import type { ActionType, ActionResult } from '../types';

/**
 * Context passed to action handlers.
 */
export interface ActionContext {
  /** Invoice ID being processed */
  invoiceId: string;
  /** Organization context */
  organizationId: string;
  /** Language preference */
  language: 'es' | 'en';
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Interface for action handlers.
 */
export interface ActionHandler {
  /** Action type this handler processes */
  actionType: ActionType;
  /** Execute the action */
  execute(context: ActionContext): Promise<ActionResult>;
}

/**
 * Create a successful ActionResult.
 */
export function successResult(
  actionType: ActionType,
  jobId?: string
): ActionResult {
  return {
    actionType,
    success: true,
    jobId,
    executedAt: new Date().toISOString(),
  };
}

/**
 * Create a failed ActionResult.
 */
export function failureResult(
  actionType: ActionType,
  error: string
): ActionResult {
  return {
    actionType,
    success: false,
    error,
    executedAt: new Date().toISOString(),
  };
}
