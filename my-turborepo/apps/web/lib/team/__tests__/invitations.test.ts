/**
 * Tests for Team Invitation Management
 *
 * These tests cover all invitation operations including creation, resending,
 * cancellation, acceptance, and validation.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  generateInvitationToken,
  getInvitationExpiryDate,
  isInvitationExpired,
  inviteUser,
  resendInvitation,
  cancelInvitation,
  validateInvitationToken,
  acceptInvitation,
  getPendingInvitations,
  getInvitationsByOrganization,
  cleanupExpiredInvitations,
} from '../invitations';
import { createClient } from '@/lib/supabase/server';

// Mock Supabase
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}));

// Mock notifications
vi.mock('../notifications', () => ({
  sendInvitationEmail: vi.fn().mockResolvedValue({ success: true }),
  sendInvitationReminder: vi.fn().mockResolvedValue({ success: true }),
  sendWelcomeEmail: vi.fn().mockResolvedValue({ success: true }),
  notifyTeamMemberAdded: vi.fn().mockResolvedValue({ success: true }),
}));

// ============================================================================
// Test Data
// ============================================================================

const mockOrganization = {
  id: 'org-123',
  name: 'Test Org',
  legal_name: 'Test Organization LLC',
  rfc: 'TST123456ABC',
};

const mockInviter = {
  id: 'user-123',
  full_name: 'John Doe',
  email: 'john@example.com',
  role: 'admin',
  organization_id: 'org-123',
};

const mockInvitation = {
  id: 'inv-123',
  organization_id: 'org-123',
  email: 'newuser@example.com',
  role: 'user',
  token: 'valid-token-123456789012345678901234', // 32+ characters for valid format
  status: 'pending',
  message: 'Welcome to the team!',
  invited_by: 'user-123',
  expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  organizations: mockOrganization,
  invited_by_user: mockInviter,
};

// ============================================================================
// Token Generation Tests
// ============================================================================

describe('generateInvitationToken', () => {
  it('should generate a valid token', () => {
    const token = generateInvitationToken();
    expect(token).toBeDefined();
    expect(typeof token).toBe('string');
    expect(token.length).toBeGreaterThan(30);
  });

  it('should generate unique tokens', () => {
    const token1 = generateInvitationToken();
    const token2 = generateInvitationToken();
    expect(token1).not.toBe(token2);
  });

  it('should generate URL-safe tokens', () => {
    const token = generateInvitationToken();
    // Should not contain +, /, or =
    expect(token).not.toMatch(/[+/=]/);
  });
});

// ============================================================================
// Expiry Date Tests
// ============================================================================

describe('getInvitationExpiryDate', () => {
  it('should return date 7 days in future by default', () => {
    const expiry = getInvitationExpiryDate();
    const now = new Date();
    const expected = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    // Allow 1 second difference for test execution time
    expect(Math.abs(expiry.getTime() - expected.getTime())).toBeLessThan(1000);
  });

  it('should accept custom expiry days', () => {
    const expiry = getInvitationExpiryDate(14);
    const now = new Date();
    const expected = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);

    expect(Math.abs(expiry.getTime() - expected.getTime())).toBeLessThan(1000);
  });
});

describe('isInvitationExpired', () => {
  it('should return false for future date', () => {
    const futureDate = new Date(Date.now() + 24 * 60 * 60 * 1000);
    expect(isInvitationExpired(futureDate)).toBe(false);
  });

  it('should return true for past date', () => {
    const pastDate = new Date(Date.now() - 24 * 60 * 60 * 1000);
    expect(isInvitationExpired(pastDate)).toBe(true);
  });

  it('should handle edge case of exactly now', () => {
    const now = new Date();
    // Might be true or false depending on milliseconds
    const result = isInvitationExpired(now);
    expect(typeof result).toBe('boolean');
  });
});

// ============================================================================
// Invitation Creation Tests
// ============================================================================

describe('inviteUser', () => {
  let mockSupabase: any;

  beforeEach(() => {
    mockSupabase = {
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      is: vi.fn().mockReturnThis(),
      gte: vi.fn().mockReturnThis(),
      single: vi.fn(),
      auth: {
        signUp: vi.fn(),
      },
    };

    vi.mocked(createClient).mockResolvedValue(mockSupabase as any);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should successfully create an invitation', async () => {
    // Mock validation queries
    mockSupabase.single
      .mockResolvedValueOnce({ data: null, error: null }) // No existing user
      .mockResolvedValueOnce({ data: null, error: null }) // No pending invitation
      .mockResolvedValueOnce({ data: mockInviter, error: null }) // Inviter
      .mockResolvedValueOnce({ data: mockOrganization, error: null }) // Organization
      .mockResolvedValueOnce({ data: mockInvitation, error: null }); // Created invitation

    // Mock rate limit check
    mockSupabase.from.mockImplementation((table: string) => {
      if (table === 'invitations') {
        return {
          ...mockSupabase,
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          gte: vi.fn().mockReturnValue(
            Promise.resolve({ count: 5, error: null })
          ),
        };
      }
      return mockSupabase;
    });

    const result = await inviteUser('org-123', 'user-123', {
      email: 'newuser@example.com',
      role: 'user',
      message: 'Welcome!',
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.invitation).toBeDefined();
      expect(result.invitation.email).toBe('newuser@example.com');
    }
  });

  it('should fail with invalid email format', async () => {
    const result = await inviteUser('org-123', 'user-123', {
      email: 'invalid-email',
      role: 'user',
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('Invalid email format');
    }
  });

  it('should fail if user already exists', async () => {
    mockSupabase.single
      .mockResolvedValueOnce({
        data: { id: 'existing-user', deleted_at: null },
        error: null,
      });

    const result = await inviteUser('org-123', 'user-123', {
      email: 'existing@example.com',
      role: 'user',
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('already a team member');
    }
  });

  it('should fail if pending invitation exists', async () => {
    mockSupabase.single
      .mockResolvedValueOnce({ data: null, error: null }) // No existing user
      .mockResolvedValueOnce({
        data: { id: 'inv-456', status: 'pending' },
        error: null,
      }); // Pending invitation

    const result = await inviteUser('org-123', 'user-123', {
      email: 'pending@example.com',
      role: 'user',
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('already a pending invitation');
    }
  });

  it('should fail if inviter cannot assign role', async () => {
    mockSupabase.single
      .mockResolvedValueOnce({ data: null, error: null }) // No existing user
      .mockResolvedValueOnce({ data: null, error: null }) // No pending invitation
      .mockResolvedValueOnce({
        data: { ...mockInviter, role: 'user' },
        error: null,
      }); // Inviter with user role

    const result = await inviteUser('org-123', 'user-123', {
      email: 'newuser@example.com',
      role: 'admin', // User cannot assign admin role
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('cannot assign');
    }
  });
});

// ============================================================================
// Invitation Resending Tests
// ============================================================================

describe('resendInvitation', () => {
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

    vi.mocked(createClient).mockResolvedValue(mockSupabase as any);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should successfully resend an invitation', async () => {
    mockSupabase.single
      .mockResolvedValueOnce({ data: mockInvitation, error: null }) // Invitation
      .mockResolvedValueOnce({ data: mockInviter, error: null }); // Resender

    mockSupabase.update.mockReturnValue({
      ...mockSupabase,
      eq: vi.fn().mockResolvedValue({ error: null }),
    });

    const result = await resendInvitation('inv-123', 'user-123');

    expect(result.success).toBe(true);
  });

  it('should fail if invitation not found', async () => {
    mockSupabase.single.mockResolvedValueOnce({ data: null, error: null });

    const result = await resendInvitation('inv-999', 'user-123');

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('not found');
    }
  });

  it('should fail if invitation is not pending', async () => {
    mockSupabase.single.mockResolvedValueOnce({
      data: { ...mockInvitation, status: 'accepted' },
      error: null,
    });

    const result = await resendInvitation('inv-123', 'user-123');

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('Cannot resend');
    }
  });

  it('should fail if resender not authorized', async () => {
    mockSupabase.single
      .mockResolvedValueOnce({ data: mockInvitation, error: null })
      .mockResolvedValueOnce({
        data: { ...mockInviter, role: 'user' },
        error: null,
      });

    const result = await resendInvitation('inv-123', 'user-123');

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('Not authorized');
    }
  });
});

// ============================================================================
// Invitation Cancellation Tests
// ============================================================================

describe('cancelInvitation', () => {
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

    vi.mocked(createClient).mockResolvedValue(mockSupabase as any);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should successfully cancel an invitation', async () => {
    mockSupabase.single
      .mockResolvedValueOnce({ data: mockInvitation, error: null })
      .mockResolvedValueOnce({ data: mockInviter, error: null });

    mockSupabase.update.mockReturnValue({
      ...mockSupabase,
      eq: vi.fn().mockResolvedValue({ error: null }),
    });

    const result = await cancelInvitation('inv-123', 'user-123');

    expect(result.success).toBe(true);
  });

  it('should fail if invitation not found', async () => {
    mockSupabase.single.mockResolvedValueOnce({ data: null, error: null });

    const result = await cancelInvitation('inv-999', 'user-123');

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('not found');
    }
  });

  it('should fail if invitation already accepted', async () => {
    mockSupabase.single.mockResolvedValueOnce({
      data: { ...mockInvitation, status: 'accepted' },
      error: null,
    });

    const result = await cancelInvitation('inv-123', 'user-123');

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('Cannot cancel');
    }
  });
});

// ============================================================================
// Token Validation Tests
// ============================================================================

describe('validateInvitationToken', () => {
  let mockSupabase: any;

  beforeEach(() => {
    mockSupabase = {
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn(),
    };

    vi.mocked(createClient).mockResolvedValue(mockSupabase as any);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should validate a valid token', async () => {
    mockSupabase.single.mockResolvedValueOnce({
      data: mockInvitation,
      error: null,
    });

    const result = await validateInvitationToken('valid-token-123456789012345678901234');

    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.invitation).toBeDefined();
      expect(result.invitation.organization.name).toBe('Test Org');
    }
  });

  it('should fail with invalid token format', async () => {
    const result = await validateInvitationToken('short');

    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.error).toContain('Invalid token format');
    }
  });

  it('should fail if token not found', async () => {
    mockSupabase.single.mockResolvedValueOnce({ data: null, error: null });

    const result = await validateInvitationToken('nonexistent-token-1234567890123456');

    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.error).toContain('not found');
    }
  });

  it('should fail if invitation already accepted', async () => {
    mockSupabase.single.mockResolvedValueOnce({
      data: { ...mockInvitation, status: 'accepted' },
      error: null,
    });

    const result = await validateInvitationToken('valid-token-123456789012345678901234');

    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.error).toContain('already been accepted');
    }
  });

  it('should fail if invitation expired', async () => {
    const expiredInvitation = {
      ...mockInvitation,
      expires_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    };

    mockSupabase.single.mockResolvedValueOnce({
      data: expiredInvitation,
      error: null,
    });

    mockSupabase.update.mockReturnValue({
      ...mockSupabase,
      eq: vi.fn().mockResolvedValue({ error: null }),
    });

    const result = await validateInvitationToken('valid-token-123456789012345678901234');

    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.error).toContain('expired');
    }
  });
});

// ============================================================================
// Invitation Acceptance Tests
// ============================================================================

describe('acceptInvitation', () => {
  let mockSupabase: any;

  beforeEach(() => {
    mockSupabase = {
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      upsert: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn(),
      auth: {
        signUp: vi.fn(),
      },
    };

    vi.mocked(createClient).mockResolvedValue(mockSupabase as any);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should accept invitation for new user', async () => {
    // Mock validateInvitationToken (valid invitation)
    mockSupabase.single
      .mockResolvedValueOnce({ data: mockInvitation, error: null })
      .mockResolvedValueOnce({ data: null, error: null }); // No existing user

    // Mock auth signup
    mockSupabase.auth.signUp.mockResolvedValue({
      data: { user: { id: 'new-user-123' } },
      error: null,
    });

    // Mock user upsert
    mockSupabase.upsert.mockResolvedValue({ error: null });

    // Mock invitation update and admin selection
    mockSupabase.update.mockReturnValue({
      ...mockSupabase,
      eq: vi.fn().mockResolvedValue({ error: null }),
    });

    // Mock admin users query for notifications
    mockSupabase.select.mockReturnValue({
      ...mockSupabase,
      eq: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      is: vi.fn().mockResolvedValue({ data: [], error: null }),
    });

    const result = await acceptInvitation({
      token: 'valid-token-123456789012345678901234',
      full_name: 'Jane Smith',
      password: 'SecurePassword123!',
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.userId).toBe('new-user-123');
    }
  });

  it('should accept invitation for existing user', async () => {
    // Mock validateInvitationToken (valid invitation)
    mockSupabase.single
      .mockResolvedValueOnce({ data: mockInvitation, error: null })
      .mockResolvedValueOnce({
        data: { id: 'existing-user-123', deleted_at: null },
        error: null,
      });

    // Mock user update
    mockSupabase.update.mockReturnValue({
      ...mockSupabase,
      eq: vi.fn().mockResolvedValue({ error: null }),
    });

    // Mock admin users query for notifications
    mockSupabase.select.mockReturnValue({
      ...mockSupabase,
      eq: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      is: vi.fn().mockResolvedValue({ data: [], error: null }),
    });

    const result = await acceptInvitation({
      token: 'valid-token-123456789012345678901234',
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.userId).toBe('existing-user-123');
    }
  });

  it('should fail if full name missing for new user', async () => {
    mockSupabase.single
      .mockResolvedValueOnce({ data: mockInvitation, error: null })
      .mockResolvedValueOnce({ data: null, error: null });

    const result = await acceptInvitation({
      token: 'valid-token-123456789012345678901234',
      password: 'SecurePassword123!',
      // Missing full_name
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('Full name and password required');
    }
  });
});

// ============================================================================
// Query Tests
// ============================================================================

describe('getPendingInvitations', () => {
  let mockSupabase: any;

  beforeEach(() => {
    mockSupabase = {
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({
        data: [mockInvitation],
        error: null,
      }),
    };

    vi.mocked(createClient).mockResolvedValue(mockSupabase as any);
  });

  it('should get pending invitations', async () => {
    const result = await getPendingInvitations('org-123');

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.invitations).toHaveLength(1);
      expect(result.invitations[0].status).toBe('pending');
    }
  });
});

describe('getInvitationsByOrganization', () => {
  let mockSupabase: any;

  beforeEach(() => {
    mockSupabase = {
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      range: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({
        data: [mockInvitation],
        error: null,
        count: 1,
      }),
    };

    vi.mocked(createClient).mockResolvedValue(mockSupabase as any);
  });

  it('should get all invitations', async () => {
    const result = await getInvitationsByOrganization('org-123');

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.invitations).toHaveLength(1);
      expect(result.total).toBe(1);
    }
  });

  it('should filter by status', async () => {
    const result = await getInvitationsByOrganization('org-123', {
      status: 'pending',
    });

    expect(result.success).toBe(true);
  });

  it('should support pagination', async () => {
    const result = await getInvitationsByOrganization('org-123', {
      limit: 10,
      offset: 0,
    });

    expect(result.success).toBe(true);
  });
});

// ============================================================================
// Cleanup Tests
// ============================================================================

describe('cleanupExpiredInvitations', () => {
  let mockSupabase: any;

  beforeEach(() => {
    mockSupabase = {
      rpc: vi.fn().mockResolvedValue({ data: 5, error: null }),
    };

    vi.mocked(createClient).mockResolvedValue(mockSupabase as any);
  });

  it('should call cleanup function and return count', async () => {
    const count = await cleanupExpiredInvitations();

    expect(count).toBe(5);
    expect(mockSupabase.rpc).toHaveBeenCalledWith('cleanup_expired_invitations');
  });

  it('should handle errors gracefully', async () => {
    mockSupabase.rpc.mockResolvedValue({ data: null, error: 'Error' });

    const count = await cleanupExpiredInvitations();

    expect(count).toBe(0);
  });
});
