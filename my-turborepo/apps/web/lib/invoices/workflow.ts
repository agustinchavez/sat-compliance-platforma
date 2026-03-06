/**
 * Invoice Workflow (Component 12 - Step 5)
 *
 * State machine for invoice status transitions.
 * Enforces business rules for invoice lifecycle.
 */

import type { Invoice, InvoiceAction, StatusTransition } from "./types";
import { InvoiceStatus, CancellationReason } from "./types";
import { validateInvoiceForStamping } from "./validation";

// ============================================================
// STATUS TRANSITION MATRIX
// ============================================================

/**
 * Allowed status transitions with their required actions.
 */
const ALLOWED_TRANSITIONS: StatusTransition[] = [
  // From DRAFT
  {
    from: InvoiceStatus.DRAFT,
    to: InvoiceStatus.PENDING_STAMP,
    action: "submit_for_stamping",
  },
  {
    from: InvoiceStatus.DRAFT,
    to: InvoiceStatus.VOID,
    action: "void",
  },

  // From PENDING_STAMP
  {
    from: InvoiceStatus.PENDING_STAMP,
    to: InvoiceStatus.STAMPED,
    action: "submit_for_stamping",
  },
  // Note: PENDING_STAMP → DRAFT happens automatically if stamping fails

  // From STAMPED
  {
    from: InvoiceStatus.STAMPED,
    to: InvoiceStatus.SENT,
    action: "mark_sent",
  },
  {
    from: InvoiceStatus.STAMPED,
    to: InvoiceStatus.PAID,
    action: "mark_paid",
  },
  {
    from: InvoiceStatus.STAMPED,
    to: InvoiceStatus.CANCELLED,
    action: "cancel",
    requiresReason: true,
  },

  // From SENT
  {
    from: InvoiceStatus.SENT,
    to: InvoiceStatus.PAID,
    action: "mark_paid",
  },
  {
    from: InvoiceStatus.SENT,
    to: InvoiceStatus.CANCELLED,
    action: "cancel",
    requiresReason: true,
  },

  // From PAID
  {
    from: InvoiceStatus.PAID,
    to: InvoiceStatus.CANCELLED,
    action: "cancel",
    requiresReason: true,
  },
];

// ============================================================
// PUBLIC API
// ============================================================

/**
 * Check if a status transition is allowed.
 */
export function canTransition(
  currentStatus: InvoiceStatus,
  newStatus: InvoiceStatus
): boolean {
  // No transition to same status
  if (currentStatus === newStatus) {
    return false;
  }

  // VOID and CANCELLED are terminal states
  if (
    currentStatus === InvoiceStatus.VOID ||
    currentStatus === InvoiceStatus.CANCELLED
  ) {
    return false;
  }

  // Check if transition exists in the matrix
  return ALLOWED_TRANSITIONS.some(
    (t) => t.from === currentStatus && t.to === newStatus
  );
}

/**
 * Get the list of actions available for an invoice in its current status.
 */
export function getAvailableActions(invoice: Invoice): InvoiceAction[] {
  const actions: InvoiceAction[] = [];
  const status = invoice.status;

  // VOID and CANCELLED only allow duplicate
  if (status === InvoiceStatus.VOID || status === InvoiceStatus.CANCELLED) {
    return ["duplicate"];
  }

  // Get actions from allowed transitions
  const availableTransitions = ALLOWED_TRANSITIONS.filter(
    (t) => t.from === status
  );
  for (const transition of availableTransitions) {
    if (!actions.includes(transition.action)) {
      actions.push(transition.action);
    }
  }

  // 'duplicate' is always available (except for VOID, handled above)
  if (!actions.includes("duplicate")) {
    actions.push("duplicate");
  }

  return actions;
}

/**
 * Get the required action for a specific status transition.
 */
export function getRequiredAction(
  currentStatus: InvoiceStatus,
  newStatus: InvoiceStatus
): InvoiceAction | null {
  const transition = ALLOWED_TRANSITIONS.find(
    (t) => t.from === currentStatus && t.to === newStatus
  );
  return transition?.action ?? null;
}

/**
 * Check if a status transition requires a cancellation reason.
 */
export function requiresReason(
  currentStatus: InvoiceStatus,
  newStatus: InvoiceStatus
): boolean {
  const transition = ALLOWED_TRANSITIONS.find(
    (t) => t.from === currentStatus && t.to === newStatus
  );
  return transition?.requiresReason ?? false;
}

/**
 * Validate a status transition including business rules.
 */
export function validateTransition(
  invoice: Invoice,
  newStatus: InvoiceStatus,
  reason?: string
): { valid: boolean; error?: string } {
  const currentStatus = invoice.status;

  // No transition to same status
  if (currentStatus === newStatus) {
    return { valid: false, error: "Invoice is already in this status" };
  }

  // Terminal states cannot be changed
  if (currentStatus === InvoiceStatus.VOID) {
    return { valid: false, error: "Voided invoices cannot be modified" };
  }

  if (currentStatus === InvoiceStatus.CANCELLED) {
    return { valid: false, error: "Cancelled invoices cannot be modified" };
  }

  // Check if transition is allowed
  if (!canTransition(currentStatus, newStatus)) {
    return {
      valid: false,
      error: `Cannot transition from ${currentStatus} to ${newStatus}`,
    };
  }

  // Cancellation requires a valid reason
  if (newStatus === InvoiceStatus.CANCELLED) {
    if (!reason) {
      return {
        valid: false,
        error: "Cancellation reason is required",
      };
    }

    const validReasons = Object.values(CancellationReason);
    if (!validReasons.includes(reason as CancellationReason)) {
      return {
        valid: false,
        error: `Invalid cancellation reason: ${reason}. Must be one of: ${validReasons.join(", ")}`,
      };
    }
  }

  // Transitioning to PENDING_STAMP requires invoice validation
  if (newStatus === InvoiceStatus.PENDING_STAMP) {
    const stampValidation = validateInvoiceForStamping(invoice);
    if (!stampValidation.valid) {
      return {
        valid: false,
        error: `Invoice not ready for stamping: ${stampValidation.errors.join("; ")}`,
      };
    }
  }

  return { valid: true };
}

/**
 * Return the fields to update for a status transition.
 * Does NOT write to the database — returns a partial Invoice update object.
 */
export function transitionStatus(
  invoice: Invoice,
  newStatus: InvoiceStatus,
  metadata?: {
    reason?: string;
    replacementUUID?: string; // UUID of replacement invoice for reason 04
    cancelled_by?: string;
    uuid?: string; // Set when stamping completes
    cfdi_xml?: string; // Set when stamping completes
  }
): Partial<Invoice> {
  const now = new Date().toISOString();
  const updates: Partial<Invoice> = {
    status: newStatus,
    updated_at: now,
  };

  // Set appropriate timestamp fields based on the new status
  switch (newStatus) {
    case InvoiceStatus.STAMPED:
      updates.stamped_at = now;
      if (metadata?.uuid) {
        updates.uuid = metadata.uuid;
      }
      if (metadata?.cfdi_xml) {
        updates.cfdi_xml = metadata.cfdi_xml;
      }
      break;

    case InvoiceStatus.SENT:
      updates.sent_at = now;
      break;

    case InvoiceStatus.PAID:
      updates.paid_at = now;
      break;

    case InvoiceStatus.CANCELLED:
      updates.cancelled_at = now;
      if (metadata?.reason) {
        updates.cancellation_reason = metadata.reason;
      }
      if (metadata?.replacementUUID) {
        updates.cancellation_uuid = metadata.replacementUUID;
      }
      break;

    case InvoiceStatus.VOID:
      // Void is like a soft delete for drafts
      updates.deleted_at = now;
      break;
  }

  return updates;
}

/**
 * Check if an invoice can be edited (items, amounts, etc.).
 * Only draft invoices can be fully edited.
 */
export function canEditInvoice(invoice: Invoice): boolean {
  return invoice.status === InvoiceStatus.DRAFT;
}

/**
 * Check if an invoice can be cancelled (requires SAT cancellation).
 */
export function canCancelInvoice(invoice: Invoice): boolean {
  return [
    InvoiceStatus.STAMPED,
    InvoiceStatus.SENT,
    InvoiceStatus.PAID,
  ].includes(invoice.status);
}

/**
 * Check if an invoice can be voided (only drafts).
 */
export function canVoidInvoice(invoice: Invoice): boolean {
  return invoice.status === InvoiceStatus.DRAFT;
}

/**
 * Check if an invoice can be duplicated.
 */
export function canDuplicateInvoice(invoice: Invoice): boolean {
  // Can duplicate any non-deleted invoice
  return !invoice.deleted_at;
}

/**
 * Check if an invoice has been stamped (has UUID from SAT).
 */
export function isStamped(invoice: Invoice): boolean {
  return !!invoice.uuid;
}

/**
 * Check if an invoice is in a terminal state.
 */
export function isTerminal(invoice: Invoice): boolean {
  return [InvoiceStatus.VOID, InvoiceStatus.CANCELLED].includes(invoice.status);
}

/**
 * Get the next possible statuses from the current status.
 */
export function getNextStatuses(currentStatus: InvoiceStatus): InvoiceStatus[] {
  return ALLOWED_TRANSITIONS.filter((t) => t.from === currentStatus).map(
    (t) => t.to
  );
}

/**
 * Get human-readable label for a status.
 */
export function getStatusLabel(status: InvoiceStatus): string {
  const labels: Record<InvoiceStatus, string> = {
    [InvoiceStatus.DRAFT]: "Borrador",
    [InvoiceStatus.PENDING_STAMP]: "Pendiente de timbrar",
    [InvoiceStatus.STAMPED]: "Timbrada",
    [InvoiceStatus.SENT]: "Enviada",
    [InvoiceStatus.PAID]: "Pagada",
    [InvoiceStatus.CANCELLED]: "Cancelada",
    [InvoiceStatus.VOID]: "Anulada",
  };
  return labels[status] || status;
}

/**
 * Get human-readable label for an action.
 */
export function getActionLabel(action: InvoiceAction): string {
  const labels: Record<InvoiceAction, string> = {
    submit_for_stamping: "Timbrar",
    cancel: "Cancelar",
    mark_sent: "Marcar como enviada",
    mark_paid: "Marcar como pagada",
    void: "Anular",
    duplicate: "Duplicar",
  };
  return labels[action] || action;
}

/**
 * Get the cancellation reason label.
 */
export function getCancellationReasonLabel(reason: CancellationReason): string {
  const labels: Record<CancellationReason, string> = {
    [CancellationReason.VOUCHER_ERROR]:
      "01 - Comprobante emitido con errores con relación",
    [CancellationReason.OPERATION_NEVER_COMPLETED]:
      "02 - Comprobante emitido con errores sin relación",
    [CancellationReason.OPERATION_NOMINALLY_COMPLETED]:
      "03 - No se llevó a cabo la operación",
    [CancellationReason.SUBSTITUTION]:
      "04 - Operación nominalmente relacionada en factura global",
  };
  return labels[reason] || reason;
}
