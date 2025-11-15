/**
 * Tests for Team Activity Logging
 *
 * These tests cover activity logging, queries, and descriptions.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  logTeamActivity,
  logInvitationSent,
  logInvitationAccepted,
  logRoleChanged,
  logMemberRemoved,
  logMemberReactivated,
  logOwnershipTransferInitiated,
  getTeamActivity,
  getUserActions,
  getTeamActivityForUser,
  getRecentTeamActivity,
  getActivityDescription,
  getActivitySummary,
  exportActivityLogToCSV,
} from '../activity';
import { createClient } from '@/lib/supabase/server';
import type { TeamActivityLog } from '../types';

// Mock Supabase
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}));

// ============================================================================
// Test Data
// ============================================================================

const mockOrganizationId = 'org-123';
const mockUserId = 'user-123';
const mockTargetUserId = 'user-456';

const mockActivity: TeamActivityLog = {
  id: 'activity-1',
  organization_id: mockOrganizationId,
  user_id: mockUserId,
  action: 'role_changed',
  target_user_id: mockTargetUserId,
  details: {
    old_role: 'user',
    new_role: 'admin',
  },
  ip_address: '192.168.1.1',
  user_agent: 'Mozilla/5.0',
  created_at: new Date(),
  user: {
    id: mockUserId,
    full_name: 'John Doe',
    email: 'john@example.com',
  },
  target_user: {
    id: mockTargetUserId,
    full_name: 'Jane Smith',
    email: 'jane@example.com',
  },
};

// ============================================================================
// Activity Logging Tests
// ============================================================================

describe('logTeamActivity', () => {
  let mockSupabase: any;

  beforeEach(() => {
    mockSupabase = {
      from: vi.fn().mockReturnThis(),
      insert: vi.fn().mockResolvedValue({ error: null }),
    };

    vi.mocked(createClient).mockResolvedValue(mockSupabase as any);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should successfully log activity', async () => {
    const result = await logTeamActivity(
      mockOrganizationId,
      mockUserId,
      'role_changed',
      { old_role: 'user', new_role: 'admin' },
      mockTargetUserId
    );

    expect(result.success).toBe(true);
    expect(mockSupabase.from).toHaveBeenCalledWith('team_activity_log');
    expect(mockSupabase.insert).toHaveBeenCalled();
  });

  it('should handle errors gracefully', async () => {
    mockSupabase.insert.mockResolvedValue({ error: 'Database error' });

    const result = await logTeamActivity(
      mockOrganizationId,
      mockUserId,
      'role_changed',
      { old_role: 'user', new_role: 'admin' }
    );

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });
});

describe('Specific Activity Loggers', () => {
  let mockSupabase: any;

  beforeEach(() => {
    mockSupabase = {
      from: vi.fn().mockReturnThis(),
      insert: vi.fn().mockResolvedValue({ error: null }),
    };

    vi.mocked(createClient).mockResolvedValue(mockSupabase as any);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should log invitation sent', async () => {
    const result = await logInvitationSent(
      mockOrganizationId,
      mockUserId,
      'newuser@example.com',
      'user',
      'inv-123'
    );

    expect(result.success).toBe(true);
  });

  it('should log invitation accepted', async () => {
    const result = await logInvitationAccepted(
      mockOrganizationId,
      mockUserId,
      'user',
      'inv-123'
    );

    expect(result.success).toBe(true);
  });

  it('should log role changed', async () => {
    const result = await logRoleChanged(
      mockOrganizationId,
      mockUserId,
      mockTargetUserId,
      'user',
      'admin',
      'Promotion'
    );

    expect(result.success).toBe(true);
  });

  it('should log member removed', async () => {
    const result = await logMemberRemoved(
      mockOrganizationId,
      mockUserId,
      mockTargetUserId,
      'user',
      'No longer needed'
    );

    expect(result.success).toBe(true);
  });

  it('should log member reactivated', async () => {
    const result = await logMemberReactivated(
      mockOrganizationId,
      mockUserId,
      mockTargetUserId,
      'user'
    );

    expect(result.success).toBe(true);
  });

  it('should log ownership transfer initiated', async () => {
    const result = await logOwnershipTransferInitiated(
      mockOrganizationId,
      mockUserId,
      mockTargetUserId,
      'transfer-123'
    );

    expect(result.success).toBe(true);
  });
});

// ============================================================================
// Activity Query Tests
// ============================================================================

describe('getTeamActivity', () => {
  let mockSupabase: any;

  beforeEach(() => {
    mockSupabase = {
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      gte: vi.fn().mockReturnThis(),
      lte: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      range: vi.fn().mockResolvedValue({
        data: [mockActivity],
        error: null,
        count: 1,
      }),
    };

    vi.mocked(createClient).mockResolvedValue(mockSupabase as any);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should get all team activity', async () => {
    const result = await getTeamActivity(mockOrganizationId);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.activities).toHaveLength(1);
      expect(result.total).toBe(1);
    }
  });

  it('should filter by action', async () => {
    const result = await getTeamActivity(mockOrganizationId, {
      action: 'role_changed',
    });

    expect(result.success).toBe(true);
    expect(mockSupabase.eq).toHaveBeenCalledWith('action', 'role_changed');
  });

  it('should filter by multiple actions', async () => {
    const result = await getTeamActivity(mockOrganizationId, {
      action: ['role_changed', 'user_invited'],
    });

    expect(result.success).toBe(true);
    expect(mockSupabase.in).toHaveBeenCalledWith('action', [
      'role_changed',
      'user_invited',
    ]);
  });

  it('should filter by user', async () => {
    const result = await getTeamActivity(mockOrganizationId, {
      user_id: mockUserId,
    });

    expect(result.success).toBe(true);
    expect(mockSupabase.eq).toHaveBeenCalledWith('user_id', mockUserId);
  });

  it('should filter by target user', async () => {
    const result = await getTeamActivity(mockOrganizationId, {
      target_user_id: mockTargetUserId,
    });

    expect(result.success).toBe(true);
    expect(mockSupabase.eq).toHaveBeenCalledWith('target_user_id', mockTargetUserId);
  });

  it('should filter by date range', async () => {
    const startDate = new Date('2024-01-01');
    const endDate = new Date('2024-12-31');

    const result = await getTeamActivity(mockOrganizationId, {
      start_date: startDate,
      end_date: endDate,
    });

    expect(result.success).toBe(true);
    expect(mockSupabase.gte).toHaveBeenCalled();
    expect(mockSupabase.lte).toHaveBeenCalled();
  });

  it('should support pagination', async () => {
    const result = await getTeamActivity(mockOrganizationId, {
      limit: 10,
      offset: 0,
    });

    expect(result.success).toBe(true);
    expect(mockSupabase.limit).toHaveBeenCalledWith(10);
    expect(mockSupabase.range).toHaveBeenCalledWith(0, 9);
  });

  it('should handle errors', async () => {
    mockSupabase.range.mockResolvedValue({
      data: null,
      error: 'Database error',
      count: 0,
    });

    const result = await getTeamActivity(mockOrganizationId);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBeDefined();
    }
  });
});

describe('getUserActions', () => {
  let mockSupabase: any;

  beforeEach(() => {
    mockSupabase = {
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      range: vi.fn().mockResolvedValue({
        data: [mockActivity],
        error: null,
        count: 1,
      }),
    };

    vi.mocked(createClient).mockResolvedValue(mockSupabase as any);
  });

  it('should get user actions', async () => {
    const result = await getUserActions(mockOrganizationId, mockUserId, 5);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.activities).toHaveLength(1);
    }
  });
});

describe('getTeamActivityForUser', () => {
  let mockSupabase: any;

  beforeEach(() => {
    mockSupabase = {
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      range: vi.fn().mockResolvedValue({
        data: [mockActivity],
        error: null,
        count: 1,
      }),
    };

    vi.mocked(createClient).mockResolvedValue(mockSupabase as any);
  });

  it('should get activity for target user', async () => {
    const result = await getTeamActivityForUser(
      mockOrganizationId,
      mockTargetUserId,
      5
    );

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.activities).toHaveLength(1);
    }
  });
});

describe('getRecentTeamActivity', () => {
  let mockSupabase: any;

  beforeEach(() => {
    mockSupabase = {
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      gte: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      range: vi.fn().mockResolvedValue({
        data: [mockActivity],
        error: null,
        count: 1,
      }),
    };

    vi.mocked(createClient).mockResolvedValue(mockSupabase as any);
  });

  it('should get recent activity (last 30 days)', async () => {
    const result = await getRecentTeamActivity(mockOrganizationId, 20);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.activities).toHaveLength(1);
    }
    expect(mockSupabase.gte).toHaveBeenCalled();
  });
});

// ============================================================================
// Activity Description Tests
// ============================================================================

describe('getActivityDescription', () => {
  it('should describe user invited', () => {
    const activity: TeamActivityLog = {
      ...mockActivity,
      action: 'user_invited',
      details: { email: 'new@example.com', new_role: 'user' },
    };

    const description = getActivityDescription(activity);

    expect(description).toContain('invited');
    expect(description).toContain('new@example.com');
    expect(description).toContain('user');
  });

  it('should describe invitation resent', () => {
    const activity: TeamActivityLog = {
      ...mockActivity,
      action: 'invitation_resent',
      details: { email: 'resent@example.com' },
    };

    const description = getActivityDescription(activity);

    expect(description).toContain('resent invitation');
    expect(description).toContain('resent@example.com');
  });

  it('should describe role changed', () => {
    const activity: TeamActivityLog = {
      ...mockActivity,
      action: 'role_changed',
      details: { old_role: 'user', new_role: 'admin' },
    };

    const description = getActivityDescription(activity);

    expect(description).toContain('changed');
    expect(description).toContain('role');
    expect(description).toContain('user');
    expect(description).toContain('admin');
  });

  it('should describe user removed', () => {
    const activity: TeamActivityLog = {
      ...mockActivity,
      action: 'user_removed',
      details: { old_role: 'user' },
    };

    const description = getActivityDescription(activity);

    expect(description).toContain('removed');
  });

  it('should describe ownership transfer initiated', () => {
    const activity: TeamActivityLog = {
      ...mockActivity,
      action: 'ownership_transfer_initiated',
      details: { transfer_id: 'transfer-123' },
    };

    const description = getActivityDescription(activity);

    expect(description).toContain('ownership transfer');
    expect(description).toContain('initiated');
  });

  it('should handle unknown actions', () => {
    const activity: TeamActivityLog = {
      ...mockActivity,
      action: 'unknown_action' as any,
      details: {},
    };

    const description = getActivityDescription(activity);

    expect(description).toContain('performed');
    expect(description).toContain('unknown_action');
  });
});

// ============================================================================
// Activity Summary Tests
// ============================================================================

describe('getActivitySummary', () => {
  let mockSupabase: any;

  beforeEach(() => {
    const activities = [
      { ...mockActivity, action: 'user_invited' },
      { ...mockActivity, action: 'user_invited' },
      { ...mockActivity, action: 'invitation_accepted' },
      { ...mockActivity, action: 'role_changed' },
      { ...mockActivity, action: 'user_removed' },
    ];

    mockSupabase = {
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      gte: vi.fn().mockReturnThis(),
      lte: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      range: vi.fn().mockResolvedValue({
        data: activities,
        error: null,
        count: 5,
      }),
    };

    vi.mocked(createClient).mockResolvedValue(mockSupabase as any);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should calculate activity summary', async () => {
    const startDate = new Date('2024-01-01');
    const endDate = new Date('2024-12-31');

    const result = await getActivitySummary(
      mockOrganizationId,
      startDate,
      endDate
    );

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.summary.total_actions).toBe(5);
      expect(result.summary.invitations_sent).toBe(2);
      expect(result.summary.invitations_accepted).toBe(1);
      expect(result.summary.role_changes).toBe(1);
      expect(result.summary.members_removed).toBe(1);
      expect(result.summary.members_reactivated).toBe(0);
    }
  });
});

// ============================================================================
// Export Tests
// ============================================================================

describe('exportActivityLogToCSV', () => {
  it('should export activities to CSV format', () => {
    const activities = [mockActivity];

    const csv = exportActivityLogToCSV(activities);

    expect(csv).toContain('Date');
    expect(csv).toContain('Time');
    expect(csv).toContain('User');
    expect(csv).toContain('Action');
    expect(csv).toContain('John Doe');
    expect(csv).toContain('role_changed');
  });

  it('should handle empty activity list', () => {
    const csv = exportActivityLogToCSV([]);

    expect(csv).toContain('Date');
    expect(csv.split('\n')).toHaveLength(1); // Only header
  });

  it('should escape CSV special characters', () => {
    const activity: TeamActivityLog = {
      ...mockActivity,
      details: { note: 'Test, with "quotes"' },
    };

    const csv = exportActivityLogToCSV([activity]);

    expect(csv).toContain('"');
  });
});
