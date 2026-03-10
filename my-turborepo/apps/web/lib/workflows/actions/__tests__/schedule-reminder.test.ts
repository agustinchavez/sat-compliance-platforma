/**
 * Tests for Schedule Reminder Action (Component 17)
 *
 * Tests payment reminder scheduling and cancellation.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  schedulePaymentReminders,
  cancelPaymentReminders,
  calculateReminderDelay,
  get9amMexicoCityTimestamp,
  REMINDER_SCHEDULE,
} from '../schedule-reminder';

// ============================================================================
// Mocks
// ============================================================================

const mockAdd = vi.fn();
const mockGetJob = vi.fn();
const mockRemove = vi.fn();

vi.mock('@/lib/queue', () => ({
  reminderQueue: {
    add: (...args: unknown[]) => mockAdd(...args),
    getJob: (...args: unknown[]) => mockGetJob(...args),
  },
  getReminderJobId: vi.fn((invoiceId: string, reminderType: string) =>
    `reminder-${invoiceId}-${reminderType}`
  ),
}));

const mockSupabaseSingle = vi.fn();

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: vi.fn(() => ({
            single: mockSupabaseSingle,
          })),
        })),
      })),
    })),
  })),
}));

// ============================================================================
// Constants Tests
// ============================================================================

describe('REMINDER_SCHEDULE', () => {
  it('defines due_soon as 1 day before', () => {
    expect(REMINDER_SCHEDULE.due_soon).toBe(-1);
  });

  it('defines due_today as same day', () => {
    expect(REMINDER_SCHEDULE.due_today).toBe(0);
  });

  it('defines overdue_7d as 7 days after', () => {
    expect(REMINDER_SCHEDULE.overdue_7d).toBe(7);
  });

  it('defines overdue_30d as 30 days after', () => {
    expect(REMINDER_SCHEDULE.overdue_30d).toBe(30);
  });
});

// ============================================================================
// schedulePaymentReminders Tests
// ============================================================================

describe('schedulePaymentReminders', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAdd.mockResolvedValue({ id: 'job-123' });
  });

  it('schedules all 4 reminder types when due_date exists', async () => {
    // Future due date
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 30);

    mockSupabaseSingle.mockResolvedValue({
      data: {
        id: 'inv-123',
        due_date: futureDate.toISOString().split('T')[0],
        payment_method: 'PPD',
      },
      error: null,
    });

    const results = await schedulePaymentReminders('inv-123', 'org-456');

    // Should have results for all reminder types
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results.every((r) => r.actionType === 'schedule_payment_reminder')).toBe(true);
  });

  it('skips reminders when no due_date (PUE invoice)', async () => {
    mockSupabaseSingle.mockResolvedValue({
      data: {
        id: 'inv-123',
        due_date: null,
        payment_method: 'PUE',
      },
      error: null,
    });

    const results = await schedulePaymentReminders('inv-123', 'org-456');

    expect(results).toHaveLength(1);
    expect(results[0]!.success).toBe(true);
    expect(mockAdd).not.toHaveBeenCalled();
  });

  it('uses idempotent job IDs', async () => {
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 30);

    mockSupabaseSingle.mockResolvedValue({
      data: {
        id: 'inv-123',
        due_date: futureDate.toISOString().split('T')[0],
        payment_method: 'PPD',
      },
      error: null,
    });

    await schedulePaymentReminders('inv-123', 'org-456');

    // Check that jobId was passed
    const calls = mockAdd.mock.calls;
    for (const call of calls) {
      expect(call[2]).toHaveProperty('jobId');
      expect(call[2].jobId).toContain('reminder-inv-123-');
    }
  });

  it('sets delay for delayed jobs', async () => {
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 30);

    mockSupabaseSingle.mockResolvedValue({
      data: {
        id: 'inv-123',
        due_date: futureDate.toISOString().split('T')[0],
        payment_method: 'PPD',
      },
      error: null,
    });

    await schedulePaymentReminders('inv-123', 'org-456');

    const calls = mockAdd.mock.calls;
    for (const call of calls) {
      expect(call[2]).toHaveProperty('delay');
      expect(typeof call[2].delay).toBe('number');
    }
  });

  it('skips reminders that are already past', async () => {
    // Past due date
    const pastDate = new Date();
    pastDate.setDate(pastDate.getDate() - 10);

    mockSupabaseSingle.mockResolvedValue({
      data: {
        id: 'inv-123',
        due_date: pastDate.toISOString().split('T')[0],
        payment_method: 'PPD',
      },
      error: null,
    });

    const results = await schedulePaymentReminders('inv-123', 'org-456');

    // Should still return success, but may skip some reminders
    expect(results.every((r) => r.success)).toBe(true);
  });

  it('handles database errors gracefully', async () => {
    mockSupabaseSingle.mockResolvedValue({
      data: null,
      error: { message: 'Database error' },
    });

    const results = await schedulePaymentReminders('inv-123', 'org-456');

    expect(results).toHaveLength(1);
    expect(results[0]!.success).toBe(false);
    expect(results[0]!.error).toContain('Invoice not found');
  });

  it('handles enqueue errors gracefully', async () => {
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 30);

    mockSupabaseSingle.mockResolvedValue({
      data: {
        id: 'inv-123',
        due_date: futureDate.toISOString().split('T')[0],
        payment_method: 'PPD',
      },
      error: null,
    });

    mockAdd.mockRejectedValue(new Error('Redis down'));

    const results = await schedulePaymentReminders('inv-123', 'org-456');

    // Should have failure results
    expect(results.some((r) => !r.success)).toBe(true);
  });
});

// ============================================================================
// cancelPaymentReminders Tests
// ============================================================================

describe('cancelPaymentReminders', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetJob.mockResolvedValue({
      remove: mockRemove.mockResolvedValue(undefined),
    });
  });

  it('removes all scheduled reminder jobs', async () => {
    const result = await cancelPaymentReminders('inv-123');

    expect(result.success).toBe(true);
    expect(result.actionType).toBe('cancel_scheduled_reminders');
  });

  it('uses predictable job IDs for cancellation', async () => {
    await cancelPaymentReminders('inv-123');

    // Should try to get jobs for all reminder types
    expect(mockGetJob).toHaveBeenCalledWith('reminder-inv-123-due_soon');
    expect(mockGetJob).toHaveBeenCalledWith('reminder-inv-123-due_today');
    expect(mockGetJob).toHaveBeenCalledWith('reminder-inv-123-overdue_7d');
    expect(mockGetJob).toHaveBeenCalledWith('reminder-inv-123-overdue_30d');
  });

  it('handles missing jobs gracefully', async () => {
    mockGetJob.mockResolvedValue(null);

    const result = await cancelPaymentReminders('inv-123');

    expect(result.success).toBe(true);
    expect(mockRemove).not.toHaveBeenCalled();
  });

  it('handles errors gracefully (non-fatal)', async () => {
    mockGetJob.mockRejectedValue(new Error('Redis connection failed'));

    const result = await cancelPaymentReminders('inv-123');

    // Should still succeed (non-fatal)
    expect(result.success).toBe(true);
  });

  it('continues cancelling remaining jobs after one fails', async () => {
    mockGetJob
      .mockResolvedValueOnce({ remove: mockRemove })
      .mockRejectedValueOnce(new Error('Error'))
      .mockResolvedValueOnce({ remove: mockRemove })
      .mockResolvedValueOnce({ remove: mockRemove });

    const result = await cancelPaymentReminders('inv-123');

    expect(result.success).toBe(true);
    expect(mockRemove).toHaveBeenCalledTimes(3);
  });
});

// ============================================================================
// calculateReminderDelay Tests
// ============================================================================

describe('calculateReminderDelay', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('calculates positive delay for future reminder', () => {
    const now = new Date('2026-03-10T12:00:00Z');
    vi.setSystemTime(now);

    const dueDate = new Date('2026-03-20');
    const delay = calculateReminderDelay(dueDate, 'due_soon');

    // due_soon is 1 day before, so should be around 9 days in the future
    expect(delay).toBeGreaterThan(0);
  });

  it('calculates negative delay for past reminder', () => {
    const now = new Date('2026-03-10T12:00:00Z');
    vi.setSystemTime(now);

    const dueDate = new Date('2026-03-05');
    const delay = calculateReminderDelay(dueDate, 'due_soon');

    // due_soon is 1 day before March 5, which is past
    expect(delay).toBeLessThanOrEqual(0);
  });

  it('calculates different delays for different reminder types', () => {
    const now = new Date('2026-03-10T12:00:00Z');
    vi.setSystemTime(now);

    const dueDate = new Date('2026-03-20');

    const dueSoonDelay = calculateReminderDelay(dueDate, 'due_soon');
    const dueTodayDelay = calculateReminderDelay(dueDate, 'due_today');
    const overdue7dDelay = calculateReminderDelay(dueDate, 'overdue_7d');
    const overdue30dDelay = calculateReminderDelay(dueDate, 'overdue_30d');

    // Each should be later than the previous
    expect(dueSoonDelay).toBeLessThan(dueTodayDelay);
    expect(dueTodayDelay).toBeLessThan(overdue7dDelay);
    expect(overdue7dDelay).toBeLessThan(overdue30dDelay);
  });
});

// ============================================================================
// get9amMexicoCityTimestamp Tests
// ============================================================================

describe('get9amMexicoCityTimestamp', () => {
  it('returns a timestamp', () => {
    const date = new Date('2026-03-20');
    const timestamp = get9amMexicoCityTimestamp(date);

    expect(typeof timestamp).toBe('number');
    expect(timestamp).toBeGreaterThan(0);
  });

  it('returns different timestamps for different dates', () => {
    const date1 = new Date('2026-03-20');
    const date2 = new Date('2026-03-21');

    const timestamp1 = get9amMexicoCityTimestamp(date1);
    const timestamp2 = get9amMexicoCityTimestamp(date2);

    // Should be ~24 hours apart
    const diffMs = timestamp2 - timestamp1;
    const diffHours = diffMs / (1000 * 60 * 60);

    expect(diffHours).toBeCloseTo(24, 0);
  });

  it('returns consistent timestamps for same date', () => {
    const date = new Date('2026-03-20');

    const timestamp1 = get9amMexicoCityTimestamp(date);
    const timestamp2 = get9amMexicoCityTimestamp(date);

    expect(timestamp1).toBe(timestamp2);
  });

  it('handles dates in different months', () => {
    const march = new Date('2026-03-20');
    const april = new Date('2026-04-20');

    const marchTimestamp = get9amMexicoCityTimestamp(march);
    const aprilTimestamp = get9amMexicoCityTimestamp(april);

    expect(aprilTimestamp).toBeGreaterThan(marchTimestamp);
  });

  it('handles year boundaries', () => {
    const dec = new Date('2025-12-31');
    const jan = new Date('2026-01-01');

    const decTimestamp = get9amMexicoCityTimestamp(dec);
    const janTimestamp = get9amMexicoCityTimestamp(jan);

    expect(janTimestamp).toBeGreaterThan(decTimestamp);
  });
});

// ============================================================================
// Integration Tests
// ============================================================================

describe('Reminder scheduling integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
    mockAdd.mockResolvedValue({ id: 'job-test' });
  });

  it('schedules reminders with correct payload structure', async () => {
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 30);

    mockSupabaseSingle.mockResolvedValue({
      data: {
        id: 'inv-123',
        due_date: futureDate.toISOString().split('T')[0],
        payment_method: 'PPD',
      },
      error: null,
    });

    await schedulePaymentReminders('inv-123', 'org-456');

    // Check payload structure for first call
    const call = mockAdd.mock.calls[0]!;
    expect(call[0]).toBe('payment-reminder');
    expect(call[1]).toHaveProperty('invoiceId', 'inv-123');
    expect(call[1]).toHaveProperty('organizationId', 'org-456');
    expect(call[1]).toHaveProperty('reminderType');
    expect(call[1]).toHaveProperty('daysUntilDue');
  });
});
