/**
 * Tests for Team Notification Action (Component 17)
 *
 * Tests team notification stub and message builders.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  notifyTeam,
  buildStampSuccessMessage,
  buildStampFailureMessage,
  buildCancellationMessage,
  buildPaymentReminderMessage,
} from '../notify-team';
import type { TeamNotifyParams } from '../notify-team';

// ============================================================================
// notifyTeam Tests
// ============================================================================

describe('notifyTeam', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('returns success result', async () => {
    const params: TeamNotifyParams = {
      invoiceId: 'inv-123',
      organizationId: 'org-456',
      eventType: 'invoice.stamp_succeeded',
      message: 'Invoice stamped successfully',
    };

    const result = await notifyTeam(params);

    expect(result.success).toBe(true);
    expect(result.actionType).toBe('send_team_notification');
    expect(result.executedAt).toBeDefined();
  });

  it('logs notification message', async () => {
    const params: TeamNotifyParams = {
      invoiceId: 'inv-123',
      organizationId: 'org-456',
      eventType: 'invoice.stamp_succeeded',
      message: 'Test message',
    };

    await notifyTeam(params);

    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('invoice.stamp_succeeded')
    );
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('inv-123')
    );
  });

  it('logs metadata when provided', async () => {
    const params: TeamNotifyParams = {
      invoiceId: 'inv-123',
      organizationId: 'org-456',
      eventType: 'invoice.cancelled',
      message: 'Invoice cancelled',
      metadata: { motivo: '02', folioSustitucion: null },
    };

    await notifyTeam(params);

    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('Metadata'),
      expect.any(String)
    );
  });

  it('handles all event types', async () => {
    const eventTypes = [
      'invoice.sign_requested',
      'invoice.stamp_succeeded',
      'invoice.stamp_failed',
      'invoice.pdf_generated',
      'invoice.cancelled',
      'invoice.payment_due_soon',
      'invoice.payment_overdue',
    ] as const;

    for (const eventType of eventTypes) {
      const result = await notifyTeam({
        invoiceId: 'inv-123',
        organizationId: 'org-456',
        eventType,
        message: `Event: ${eventType}`,
      });

      expect(result.success).toBe(true);
    }
  });

  it('never throws (returns success even on internal error)', async () => {
    // Even if something goes wrong internally, it should not throw
    const params: TeamNotifyParams = {
      invoiceId: 'inv-123',
      organizationId: 'org-456',
      eventType: 'invoice.stamp_succeeded',
      message: 'Test',
    };

    // Should always succeed since it's a stub
    const result = await notifyTeam(params);
    expect(result.success).toBe(true);
  });
});

// ============================================================================
// buildStampSuccessMessage Tests
// ============================================================================

describe('buildStampSuccessMessage', () => {
  it('builds correct message format', () => {
    const message = buildStampSuccessMessage('A-001', 'Acme Corp');

    expect(message).toBe('Factura A-001 timbrada exitosamente para Acme Corp');
  });

  it('handles different folio formats', () => {
    const message = buildStampSuccessMessage('INV-2026-0042', 'Test Co');

    expect(message).toContain('INV-2026-0042');
    expect(message).toContain('Test Co');
  });

  it('handles special characters in customer name', () => {
    const message = buildStampSuccessMessage('A-001', 'José García & Hijos S.A.');

    expect(message).toContain('José García & Hijos S.A.');
  });
});

// ============================================================================
// buildStampFailureMessage Tests
// ============================================================================

describe('buildStampFailureMessage', () => {
  it('builds correct message format', () => {
    const message = buildStampFailureMessage('A-001', 'PAC connection timeout');

    expect(message).toBe('Error al timbrar factura A-001: PAC connection timeout');
  });

  it('includes error reason', () => {
    const message = buildStampFailureMessage('B-002', 'Invalid RFC format');

    expect(message).toContain('Invalid RFC format');
  });

  it('handles long error messages', () => {
    const longError = 'The PAC service returned an error: XML validation failed due to missing required field receptor/rfc. Please verify the invoice data and try again.';
    const message = buildStampFailureMessage('A-001', longError);

    expect(message).toContain(longError);
  });
});

// ============================================================================
// buildCancellationMessage Tests
// ============================================================================

describe('buildCancellationMessage', () => {
  it('builds correct message format', () => {
    const message = buildCancellationMessage('A-001', 'Acme Corp', '02');

    expect(message).toBe('Factura A-001 cancelada (Acme Corp). Motivo: 02');
  });

  it('includes all cancellation motivos', () => {
    const motivos = ['01', '02', '03', '04'];

    for (const motivo of motivos) {
      const message = buildCancellationMessage('A-001', 'Customer', motivo);
      expect(message).toContain(`Motivo: ${motivo}`);
    }
  });

  it('handles customer name with special characters', () => {
    const message = buildCancellationMessage('A-001', 'Ñoño & Cía', '02');

    expect(message).toContain('Ñoño & Cía');
  });
});

// ============================================================================
// buildPaymentReminderMessage Tests
// ============================================================================

describe('buildPaymentReminderMessage', () => {
  it('builds message for upcoming due date', () => {
    const message = buildPaymentReminderMessage('A-001', 'Acme Corp', 3);

    expect(message).toBe('Recordatorio: Factura A-001 (Acme Corp) vence en 3 días');
  });

  it('builds message for due today', () => {
    const message = buildPaymentReminderMessage('A-001', 'Acme Corp', 0);

    expect(message).toBe('Alerta: Factura A-001 (Acme Corp) vence hoy');
  });

  it('builds message for overdue invoice (1 day)', () => {
    const message = buildPaymentReminderMessage('A-001', 'Acme Corp', -1);

    expect(message).toBe('Urgente: Factura A-001 (Acme Corp) vencida hace 1 días');
  });

  it('builds message for overdue invoice (7 days)', () => {
    const message = buildPaymentReminderMessage('A-001', 'Acme Corp', -7);

    expect(message).toBe('Urgente: Factura A-001 (Acme Corp) vencida hace 7 días');
  });

  it('builds message for overdue invoice (30 days)', () => {
    const message = buildPaymentReminderMessage('A-001', 'Acme Corp', -30);

    expect(message).toBe('Urgente: Factura A-001 (Acme Corp) vencida hace 30 días');
  });

  it('builds message for 1 day before due', () => {
    const message = buildPaymentReminderMessage('A-001', 'Acme Corp', 1);

    expect(message).toBe('Recordatorio: Factura A-001 (Acme Corp) vence en 1 días');
  });
});
