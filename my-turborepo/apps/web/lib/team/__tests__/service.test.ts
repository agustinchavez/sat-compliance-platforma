/**
 * Tests for Team Management Service
 *
 * These tests cover team member queries, role management, removal,
 * reactivation, and statistics.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  getTeamMembers,
  getTeamMember,
  updateTeamMemberRole,
  removeTeamMember,
  reactivateTeamMember,
  getTeamStats,
  canManageTeam,
} from '../service';
import { createClient } from '@/lib/supabase/server';

// Mock Supabase
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}));

// Mock notifications
vi.mock('../notifications', () => ({
  sendRoleChangeNotification: vi.fn().mockResolvedValue({ success: true }),
  sendRemovalNotification: vi.fn().mockResolvedValue({ success: true }),
}));

// ============================================================================
// Test Data
// ============================================================================

const mockOrganizationId = 'org-123';

// Mock organization_members with joined user data (matches new schema)
const mockOrganizationMembers = [
  {
    id: 'member-1',
    user_id: 'user-1',
    organization_id: mockOrganizationId,
    role: 'owner',
    invited_by: null,
    deleted_at: null,
    created_at: new Date('2024-01-01').toISOString(),
    updated_at: new Date('2024-01-01').toISOString(),
    user: {
      id: 'user-1',
      email: 'owner@example.com',
      full_name: 'Owner User',
      email_verified: true,
      phone: null,
      last_login_at: new Date().toISOString(),
    },
  },
  {
    id: 'member-2',
    user_id: 'user-2',
    organization_id: mockOrganizationId,
    role: 'admin',
    invited_by: 'user-1',
    deleted_at: null,
    created_at: new Date('2024-02-01').toISOString(),
    updated_at: new Date('2024-02-01').toISOString(),
    user: {
      id: 'user-2',
      email: 'admin@example.com',
      full_name: 'Admin User',
      email_verified: true,
      phone: null,
      last_login_at: new Date().toISOString(),
    },
  },
  {
    id: 'member-3',
    user_id: 'user-3',
    organization_id: mockOrganizationId,
    role: 'accountant',
    invited_by: 'user-1',
    deleted_at: null,
    created_at: new Date('2024-03-01').toISOString(),
    updated_at: new Date('2024-03-01').toISOString(),
    user: {
      id: 'user-3',
      email: 'accountant@example.com',
      full_name: 'Accountant User',
      email_verified: true,
      phone: null,
      last_login_at: new Date().toISOString(),
    },
  },
  {
    id: 'member-4',
    user_id: 'user-4',
    organization_id: mockOrganizationId,
    role: 'user',
    invited_by: 'user-1',
    deleted_at: null,
    created_at: new Date('2024-04-01').toISOString(),
    updated_at: new Date('2024-04-01').toISOString(),
    user: {
      id: 'user-4',
      email: 'user@example.com',
      full_name: 'Regular User',
      email_verified: true,
      phone: null,
      last_login_at: new Date().toISOString(),
    },
  },
  {
    id: 'member-5',
    user_id: 'user-5',
    organization_id: mockOrganizationId,
    role: 'user',
    invited_by: 'user-1',
    deleted_at: new Date().toISOString(),
    created_at: new Date('2024-05-01').toISOString(),
    updated_at: new Date().toISOString(),
    user: {
      id: 'user-5',
      email: 'deleted@example.com',
      full_name: 'Deleted User',
      email_verified: true,
      phone: null,
      last_login_at: null,
    },
  },
];

// Legacy mock data for backward compatibility with some tests
const mockTeamMembers = mockOrganizationMembers.map(m => ({
  id: m.user.id,
  email: m.user.email,
  full_name: m.user.full_name,
  role: m.role,
  organization_id: m.organization_id,
  deleted_at: m.deleted_at,
  created_at: m.created_at,
}));

// ============================================================================
// Team Member Query Tests
// ============================================================================

describe('getTeamMembers', () => {
  let mockSupabase: any;
  let mockQuery: any;

  beforeEach(() => {
    // Create a mock query object with organization_members data
    mockQuery = {
      data: mockOrganizationMembers.filter((m) => !m.deleted_at),
      error: null,
      count: 4,
    };

    mockSupabase = {
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      is: vi.fn().mockReturnThis(),
      not: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      or: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      range: vi.fn().mockResolvedValue(mockQuery),
      then: vi.fn((resolve) => resolve(mockQuery)),
    };

    // Reset the createClient mock for this test suite
    vi.mocked(createClient).mockReset();
    vi.mocked(createClient).mockResolvedValue(mockSupabase as any);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should get all active team members', async () => {
    const result = await getTeamMembers(mockOrganizationId);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.members).toHaveLength(4);
      expect(result.total).toBe(4);
    }
  });

  it('should filter by role', async () => {
    const result = await getTeamMembers(mockOrganizationId, {
      role: 'admin',
    });

    expect(result.success).toBe(true);
    expect(mockSupabase.eq).toHaveBeenCalledWith('role', 'admin');
  });

  it('should filter by multiple roles', async () => {
    const result = await getTeamMembers(mockOrganizationId, {
      role: ['owner', 'admin'],
    });

    expect(result.success).toBe(true);
    expect(mockSupabase.in).toHaveBeenCalledWith('role', ['owner', 'admin']);
  });

  it('should search by name or email', async () => {
    const result = await getTeamMembers(mockOrganizationId, {
      search: 'admin',
    });

    expect(result.success).toBe(true);
    expect(mockSupabase.or).toHaveBeenCalled();
  });

  it('should support pagination', async () => {
    const result = await getTeamMembers(mockOrganizationId, {
      limit: 10,
      offset: 0,
    });

    expect(result.success).toBe(true);
    expect(mockSupabase.limit).toHaveBeenCalledWith(10);
    expect(mockSupabase.range).toHaveBeenCalledWith(0, 9);
  });

  it('should support sorting', async () => {
    const result = await getTeamMembers(mockOrganizationId, {
      sortBy: 'name',
      sortOrder: 'asc',
    });

    expect(result.success).toBe(true);
    expect(mockSupabase.order).toHaveBeenCalledWith('name', {
      ascending: true,
    });
  });

  it('should include inactive members if requested', async () => {
    const inactiveQuery = {
      data: mockOrganizationMembers, // Include all members including deleted
      error: null,
      count: 5,
    };

    mockSupabase.range.mockResolvedValue(inactiveQuery);
    mockSupabase.then = vi.fn((resolve) => resolve(inactiveQuery));

    const result = await getTeamMembers(mockOrganizationId, {
      includeInactive: true,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.total).toBe(5);
    }
  });
});

describe('getTeamMember', () => {
  let mockSupabase: any;

  beforeEach(() => {
    mockSupabase = {
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      is: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: mockOrganizationMembers[0], // Return organization_member with joined user data
        error: null,
      }),
    };

    vi.mocked(createClient).mockReset();
    vi.mocked(createClient).mockResolvedValue(mockSupabase as any);
  });

  it('should get a single team member', async () => {
    const result = await getTeamMember('user-1', mockOrganizationId);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.member.id).toBe('user-1');
      expect(result.member.email).toBe('owner@example.com');
    }
  });

  it('should fail if member not found', async () => {
    mockSupabase.single.mockResolvedValue({ data: null, error: 'Not found' });

    const result = await getTeamMember('user-999', mockOrganizationId);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('not found');
    }
  });
});

// ============================================================================
// Role Management Tests
// ============================================================================

describe('updateTeamMemberRole', () => {
  let mockSupabase: any;

  beforeEach(() => {
    mockSupabase = {
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      is: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: { name: 'Test Org' },
        error: null,
      }),
    };

    // Mock organization_members query chain
    mockSupabase.in.mockReturnValue({
      ...mockSupabase,
      is: vi.fn().mockResolvedValue({
        data: [
          // Mock organization_members records (not full user records)
          { user_id: 'user-2', organization_id: mockOrganizationId, role: 'admin', id: 'member-2' },
          { user_id: 'user-4', organization_id: mockOrganizationId, role: 'user', id: 'member-4' },
        ],
        error: null,
      }),
    });

    mockSupabase.update.mockReturnValue({
      ...mockSupabase,
      eq: vi.fn().mockResolvedValue({ error: null }),
    });

    vi.mocked(createClient).mockReset();
    vi.mocked(createClient).mockResolvedValue(mockSupabase as any);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should successfully update team member role', async () => {
    // Mock organization_members for this specific test
    mockSupabase.in.mockReturnValue({
      ...mockSupabase,
      is: vi.fn().mockResolvedValue({
        data: [
          { user_id: 'user-3', organization_id: mockOrganizationId, role: 'accountant', id: 'member-3' },
          { user_id: 'user-2', organization_id: mockOrganizationId, role: 'admin', id: 'member-2' },
        ],
        error: null,
      }),
    });

    const result = await updateTeamMemberRole({
      user_id: 'user-3',
      old_role: 'user',
      new_role: 'accountant',
      changed_by: 'user-2',
    });

    expect(result.success).toBe(true);
    expect(result.new_role).toBe('accountant');
  });

  it('should fail if user tries to change own role', async () => {
    const result = await updateTeamMemberRole({
      user_id: 'user-2',
      old_role: 'admin',
      new_role: 'owner',
      changed_by: 'user-2', // Same user
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe('CANNOT_DEMOTE_SELF');
    }
  });

  it('should fail if changer lacks permission', async () => {
    // Regular user trying to assign admin role
    mockSupabase.in.mockReturnValue({
      ...mockSupabase,
      is: vi.fn().mockResolvedValue({
        data: [mockTeamMembers[3], mockTeamMembers[1]], // User and target
        error: null,
      }),
    });

    const result = await updateTeamMemberRole({
      user_id: 'user-2',
      old_role: 'accountant',
      new_role: 'admin',
      changed_by: 'user-4', // Regular user
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe('INSUFFICIENT_PERMISSIONS');
    }
  });

  it('should fail if users in different organizations', async () => {
    mockSupabase.in.mockReturnValue({
      ...mockSupabase,
      is: vi.fn().mockResolvedValue({
        data: [
          { ...mockTeamMembers[1], organization_id: 'org-123' },
          { ...mockTeamMembers[3], organization_id: 'org-456' },
        ],
        error: null,
      }),
    });

    const result = await updateTeamMemberRole({
      user_id: 'user-3',
      old_role: 'user',
      new_role: 'accountant',
      changed_by: 'user-2',
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe('INVALID_OPERATION');
    }
  });
});

// ============================================================================
// Team Member Removal Tests
// ============================================================================

describe('removeTeamMember', () => {
  let mockSupabase: any;

  beforeEach(() => {
    mockSupabase = {
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      is: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      single: vi.fn(),
    };

    vi.mocked(createClient).mockReset();
    vi.mocked(createClient).mockImplementation(async () => mockSupabase as any);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should successfully remove a team member', async () => {
    // Mock validation
    mockSupabase.in.mockReturnValue({
      ...mockSupabase,
      is: vi.fn().mockResolvedValue({
        data: [mockTeamMembers[0], mockTeamMembers[3]], // Owner and user
        error: null,
      }),
    });

    // Mock count for isLastOwner check
    mockSupabase.select.mockReturnThis();
    mockSupabase.eq.mockReturnThis();
    mockSupabase.is.mockResolvedValue({ count: 2, error: null }); // 2 owners

    // Mock user details
    mockSupabase.single
      .mockResolvedValueOnce({ data: mockTeamMembers[3], error: null })
      .mockResolvedValueOnce({ data: mockTeamMembers[0], error: null })
      .mockResolvedValueOnce({
        data: { name: 'Test Org', email: 'support@test.com' },
        error: null,
      });

    // Mock update
    mockSupabase.update.mockReturnValue({
      ...mockSupabase,
      eq: vi.fn().mockResolvedValue({ error: null }),
    });

    const result = await removeTeamMember(
      mockOrganizationId,
      'user-4',
      'user-1',
      'No longer needed'
    );

    expect(result.success).toBe(true);
  });

  it('should fail if trying to remove self', async () => {
    // validateUserRemoval will catch this
    mockSupabase.in.mockReturnValue({
      ...mockSupabase,
      is: vi.fn().mockResolvedValue({
        data: [mockTeamMembers[0]],
        error: null,
      }),
    });

    const result = await removeTeamMember(
      mockOrganizationId,
      'user-1',
      'user-1' // Same user
    );

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('cannot remove yourself');
    }
  });

  it('should fail if trying to remove last owner', async () => {
    // Create a second owner for this test
    const secondOwner = {
      ...mockTeamMembers[0],
      id: 'user-owner-2',
      email: 'owner2@example.com',
    };

    // Mock validation - both users are owners
    mockSupabase.in.mockReturnValue({
      ...mockSupabase,
      is: vi.fn().mockResolvedValue({
        data: [mockTeamMembers[0], secondOwner], // Both owners
        error: null,
      }),
    });

    // Mock for isLastOwner check
    mockSupabase.select.mockReturnThis();
    mockSupabase.eq.mockReturnThis();
    mockSupabase.is.mockResolvedValue({ count: 1, error: null }); // Only 1 owner (target)

    mockSupabase.single.mockResolvedValue({
      data: mockTeamMembers[0],
      error: null,
    });

    const result = await removeTeamMember(
      mockOrganizationId,
      'user-1', // Target: owner
      'user-owner-2' // Remover: also owner
    );

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('last owner');
    }
  });
});

// ============================================================================
// Team Member Reactivation Tests
// ============================================================================

describe('reactivateTeamMember', () => {
  let mockSupabase: any;

  beforeEach(() => {
    mockSupabase = {
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      is: vi.fn().mockReturnThis(),
      single: vi.fn(),
    };

    vi.mocked(createClient).mockReset();
    vi.mocked(createClient).mockImplementation(async () => mockSupabase as any);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should successfully reactivate a deleted member', async () => {
    mockSupabase.single
      .mockResolvedValueOnce({ data: { role: 'owner' }, error: null })
      .mockResolvedValueOnce({
        data: { id: 'user-5', deleted_at: new Date().toISOString() },
        error: null,
      });

    mockSupabase.update.mockReturnValue({
      ...mockSupabase,
      eq: vi.fn().mockResolvedValue({ error: null }),
    });

    const result = await reactivateTeamMember(
      mockOrganizationId,
      'user-5',
      'user-1'
    );

    expect(result.success).toBe(true);
  });

  it('should fail if reactivator lacks permission', async () => {
    mockSupabase.single.mockResolvedValueOnce({
      data: { role: 'user' },
      error: null,
    });

    const result = await reactivateTeamMember(
      mockOrganizationId,
      'user-5',
      'user-4'
    );

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('Not authorized');
    }
  });

  it('should fail if user not found', async () => {
    mockSupabase.single
      .mockResolvedValueOnce({ data: { role: 'owner' }, error: null })
      .mockResolvedValueOnce({ data: null, error: 'Not found' });

    const result = await reactivateTeamMember(
      mockOrganizationId,
      'user-999',
      'user-1'
    );

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('never a member');
    }
  });

  it('should fail if user already active', async () => {
    mockSupabase.single
      .mockResolvedValueOnce({ data: { role: 'owner' }, error: null })
      .mockResolvedValueOnce({
        data: { id: 'user-3', deleted_at: null },
        error: null,
      });

    const result = await reactivateTeamMember(
      mockOrganizationId,
      'user-3',
      'user-1'
    );

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('already active');
    }
  });
});

// ============================================================================
// Team Statistics Tests
// ============================================================================

describe('getTeamStats', () => {
  let mockSupabase: any;

  beforeEach(() => {
    mockSupabase = {
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: {
          organization_id: mockOrganizationId,
          total_active_members: 4,
          total_inactive_members: 1,
          pending_invitations: 2,
          owner_count: 1,
          admin_count: 1,
          accountant_count: 1,
          user_count: 1,
          recent_additions: 2,
          recent_removals: 1,
        },
        error: null,
      }),
    };

    vi.mocked(createClient).mockReset();
    vi.mocked(createClient).mockImplementation(async () => mockSupabase as any);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should get team statistics from view', async () => {
    const result = await getTeamStats(mockOrganizationId);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.stats.total).toBe(5);
      expect(result.stats.active).toBe(4);
      expect(result.stats.inactive).toBe(1);
      expect(result.stats.pending_invitations).toBe(2);
      expect(result.stats.by_role.owner).toBe(1);
      expect(result.stats.by_role.admin).toBe(1);
      expect(result.stats.recent_additions).toBe(2);
      expect(result.stats.recent_removals).toBe(1);
    }
  });

  it('should fallback to manual calculation if view fails', async () => {
    let callCount = 0;

    // First call to createClient for view query
    const viewSupabase = {
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: null,
        error: 'View not found',
      }),
    };

    // Second call to createClient for manual calculation
    const manualCalcSupabase = {
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'users') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockResolvedValue({
              data: mockTeamMembers,
              error: null,
            }),
          };
        }
        if (table === 'invitations') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            then: vi.fn((resolve) => resolve({ count: 2, error: null })),
          };
        }
        return mockSupabase;
      }),
    };

    // Mock createClient to return different instances on each call
    vi.mocked(createClient).mockReset();
    vi.mocked(createClient).mockImplementation(async () => {
      callCount++;
      return (callCount === 1 ? viewSupabase : manualCalcSupabase) as any;
    });

    const result = await getTeamStats(mockOrganizationId);

    expect(result.success).toBe(true);
  });
});

// ============================================================================
// Permission Check Tests
// ============================================================================

describe('canManageTeam', () => {
  let mockSupabase: any;

  beforeEach(() => {
    mockSupabase = {
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      is: vi.fn().mockReturnThis(),
      single: vi.fn(),
    };

    vi.mocked(createClient).mockReset();
    vi.mocked(createClient).mockImplementation(async () => mockSupabase as any);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should allow owner to manage team', async () => {
    mockSupabase.single.mockResolvedValue({
      data: { role: 'owner' },
      error: null,
    });

    const result = await canManageTeam('user-1', mockOrganizationId, 'admin');

    expect(result).toBe(true);
  });

  it('should allow admin to manage team', async () => {
    mockSupabase.single.mockResolvedValue({
      data: { role: 'admin' },
      error: null,
    });

    const result = await canManageTeam('user-2', mockOrganizationId, 'admin');

    expect(result).toBe(true);
  });

  it('should not allow user to manage team', async () => {
    mockSupabase.single.mockResolvedValue({
      data: { role: 'user' },
      error: null,
    });

    const result = await canManageTeam('user-4', mockOrganizationId, 'admin');

    expect(result).toBe(false);
  });

  it('should return false if user not found', async () => {
    mockSupabase.single.mockResolvedValue({ data: null, error: null });

    const result = await canManageTeam('user-999', mockOrganizationId);

    expect(result).toBe(false);
  });
});
