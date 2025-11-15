/**
 * Tests for Ownership Transfer Management
 *
 * These tests cover ownership transfer initiation, confirmation, cancellation, and queries.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  generateTransferToken,
  getTransferExpiryDate,
  isTransferExpired,
  initiateOwnershipTransfer,
  validateTransferToken,
  confirmOwnershipTransfer,
  cancelOwnershipTransfer,
  getPendingTransfer,
  getOwnershipTransfers,
  cleanupExpiredTransfers,
} from '../ownership';
import { createClient } from '@/lib/supabase/server';

// Mock Supabase
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}));

// Mock notifications
vi.mock('../notifications', () => ({
  sendOwnershipTransferNotification: vi.fn().mockResolvedValue({ success: true }),
  sendOwnershipTransferConfirmed: vi.fn().mockResolvedValue({ success: true }),
}));

// Mock activity logging
vi.mock('../activity', () => ({
  logOwnershipTransferInitiated: vi.fn().mockResolvedValue({ success: true }),
  logOwnershipTransferConfirmed: vi.fn().mockResolvedValue({ success: true }),
  logOwnershipTransferCancelled: vi.fn().mockResolvedValue({ success: true }),
}));

// Mock validation
vi.mock('../validation', () => ({
  validateOwnershipTransfer: vi.fn().mockResolvedValue({ valid: true, errors: [] }),
}));

// ============================================================================
// Test Data
// ============================================================================

const mockOrganizationId = 'org-123';
const mockFromUserId = 'user-owner';
const mockToUserId = 'user-admin';

const mockTransfer = {
  id: 'transfer-123',
  organization_id: mockOrganizationId,
  from_user_id: mockFromUserId,
  to_user_id: mockToUserId,
  status: 'pending',
  confirmation_token: 'valid-token-123456789012345678901234',
  reason: 'Stepping down',
  initiated_at: new Date().toISOString(),
  confirmed_at: null,
  expires_at: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
  cancelled_at: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

const mockUsers = [
  {
    id: mockFromUserId,
    full_name: 'Current Owner',
    email: 'owner@example.com',
    role: 'owner',
  },
  {
    id: mockToUserId,
    full_name: 'Future Owner',
    email: 'admin@example.com',
    role: 'admin',
  },
];

const mockOrganization = {
  id: mockOrganizationId,
  name: 'Test Organization',
};

// ============================================================================
// Token Generation Tests
// ============================================================================

describe('generateTransferToken', () => {
  it('should generate a valid token', () => {
    const token = generateTransferToken();
    expect(token).toBeDefined();
    expect(typeof token).toBe('string');
    expect(token.length).toBeGreaterThan(30);
  });

  it('should generate unique tokens', () => {
    const token1 = generateTransferToken();
    const token2 = generateTransferToken();
    expect(token1).not.toBe(token2);
  });

  it('should generate URL-safe tokens', () => {
    const token = generateTransferToken();
    expect(token).not.toMatch(/[+/=]/);
  });
});

describe('getTransferExpiryDate', () => {
  it('should return date 48 hours in future by default', () => {
    const expiry = getTransferExpiryDate();
    const now = new Date();
    const expected = new Date(now.getTime() + 48 * 60 * 60 * 1000);

    expect(Math.abs(expiry.getTime() - expected.getTime())).toBeLessThan(1000);
  });

  it('should accept custom expiry hours', () => {
    const expiry = getTransferExpiryDate(24);
    const now = new Date();
    const expected = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    expect(Math.abs(expiry.getTime() - expected.getTime())).toBeLessThan(1000);
  });
});

describe('isTransferExpired', () => {
  it('should return false for future date', () => {
    const futureDate = new Date(Date.now() + 24 * 60 * 60 * 1000);
    expect(isTransferExpired(futureDate)).toBe(false);
  });

  it('should return true for past date', () => {
    const pastDate = new Date(Date.now() - 24 * 60 * 60 * 1000);
    expect(isTransferExpired(pastDate)).toBe(true);
  });
});

// ============================================================================
// Transfer Initiation Tests
// ============================================================================

describe('initiateOwnershipTransfer', () => {
  let mockSupabase: any;

  beforeEach(() => {
    mockSupabase = {
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      is: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      single: vi.fn(),
    };

    vi.mocked(createClient).mockResolvedValue(mockSupabase as any);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should successfully initiate ownership transfer', async () => {
    mockSupabase.in.mockResolvedValue({
      data: mockUsers,
      error: null,
    });

    mockSupabase.single
      .mockResolvedValueOnce({ data: mockOrganization, error: null })
      .mockResolvedValueOnce({ data: mockTransfer, error: null });

    const result = await initiateOwnershipTransfer(
      mockOrganizationId,
      mockFromUserId,
      {
        to_user_id: mockToUserId,
        reason: 'Stepping down',
      }
    );

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.transfer).toBeDefined();
      expect(result.transfer.from_user_id).toBe(mockFromUserId);
      expect(result.transfer.to_user_id).toBe(mockToUserId);
    }
  });

  it('should fail if validation fails', async () => {
    const { validateOwnershipTransfer } = await import('../validation');
    vi.mocked(validateOwnershipTransfer).mockResolvedValue({
      valid: false,
      errors: ['New owner must be an admin'],
    });

    const result = await initiateOwnershipTransfer(
      mockOrganizationId,
      mockFromUserId,
      {
        to_user_id: 'user-regular',
      }
    );

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('admin');
    }
  });

  it('should fail if users not found', async () => {
    mockSupabase.in.mockResolvedValue({
      data: [mockUsers[0]], // Only one user
      error: null,
    });

    const result = await initiateOwnershipTransfer(
      mockOrganizationId,
      mockFromUserId,
      {
        to_user_id: mockToUserId,
      }
    );

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('not found');
    }
  });

  it('should fail if organization not found', async () => {
    mockSupabase.in.mockResolvedValue({
      data: mockUsers,
      error: null,
    });

    mockSupabase.single.mockResolvedValueOnce({ data: null, error: 'Not found' });

    const result = await initiateOwnershipTransfer(
      mockOrganizationId,
      mockFromUserId,
      {
        to_user_id: mockToUserId,
      }
    );

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('Organization not found');
    }
  });
});

// ============================================================================
// Token Validation Tests
// ============================================================================

describe('validateTransferToken', () => {
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
    mockSupabase.single.mockResolvedValue({
      data: mockTransfer,
      error: null,
    });

    const result = await validateTransferToken('valid-token-123456789012345678901234');

    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.transfer).toBeDefined();
    }
  });

  it('should fail if token not found', async () => {
    mockSupabase.single.mockResolvedValue({ data: null, error: 'Not found' });

    const result = await validateTransferToken('invalid-token');

    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.error).toContain('not found');
    }
  });

  it('should fail if transfer already confirmed', async () => {
    mockSupabase.single.mockResolvedValue({
      data: { ...mockTransfer, status: 'confirmed' },
      error: null,
    });

    const result = await validateTransferToken('valid-token-123456789012345678901234');

    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.error).toContain('already been confirmed');
    }
  });

  it('should fail if transfer cancelled', async () => {
    mockSupabase.single.mockResolvedValue({
      data: { ...mockTransfer, status: 'cancelled' },
      error: null,
    });

    const result = await validateTransferToken('valid-token-123456789012345678901234');

    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.error).toContain('cancelled');
    }
  });

  it('should fail if transfer expired', async () => {
    const expiredTransfer = {
      ...mockTransfer,
      expires_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    };

    mockSupabase.single.mockResolvedValue({
      data: expiredTransfer,
      error: null,
    });

    mockSupabase.update.mockReturnValue({
      ...mockSupabase,
      eq: vi.fn().mockResolvedValue({ error: null }),
    });

    const result = await validateTransferToken('valid-token-123456789012345678901234');

    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.error).toContain('expired');
    }
  });
});

// ============================================================================
// Transfer Confirmation Tests
// ============================================================================

describe('confirmOwnershipTransfer', () => {
  let mockSupabase: any;

  beforeEach(() => {
    mockSupabase = {
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      single: vi.fn(),
    };

    vi.mocked(createClient).mockResolvedValue(mockSupabase as any);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should successfully confirm ownership transfer', async () => {
    // Mock validateTransferToken
    mockSupabase.single.mockResolvedValueOnce({
      data: mockTransfer,
      error: null,
    });

    // Mock user role updates
    mockSupabase.update.mockReturnValue({
      ...mockSupabase,
      eq: vi.fn().mockResolvedValue({ error: null }),
    });

    // Mock organization and users fetch
    mockSupabase.single
      .mockResolvedValueOnce({ data: mockOrganization, error: null });

    mockSupabase.in.mockResolvedValue({
      data: mockUsers,
      error: null,
    });

    const result = await confirmOwnershipTransfer(
      { confirmation_token: 'valid-token-123456789012345678901234' },
      mockToUserId
    );

    expect(result.success).toBe(true);
  });

  it('should fail if confirmer is not the target user', async () => {
    mockSupabase.single.mockResolvedValueOnce({
      data: mockTransfer,
      error: null,
    });

    const result = await confirmOwnershipTransfer(
      { confirmation_token: 'valid-token-123456789012345678901234' },
      'different-user'
    );

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('designated new owner');
    }
  });

  it('should rollback if promotion fails', async () => {
    mockSupabase.single.mockResolvedValueOnce({
      data: mockTransfer,
      error: null,
    });

    // First update succeeds (demotion), second fails (promotion)
    let updateCallCount = 0;
    mockSupabase.update.mockReturnValue({
      ...mockSupabase,
      eq: vi.fn().mockImplementation(() => {
        updateCallCount++;
        if (updateCallCount === 2) {
          return Promise.resolve({ error: 'Failed to promote' });
        }
        return Promise.resolve({ error: null });
      }),
    });

    const result = await confirmOwnershipTransfer(
      { confirmation_token: 'valid-token-123456789012345678901234' },
      mockToUserId
    );

    expect(result.success).toBe(false);
  });
});

// ============================================================================
// Transfer Cancellation Tests
// ============================================================================

describe('cancelOwnershipTransfer', () => {
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

  it('should successfully cancel transfer', async () => {
    mockSupabase.single.mockResolvedValue({
      data: mockTransfer,
      error: null,
    });

    mockSupabase.update.mockReturnValue({
      ...mockSupabase,
      eq: vi.fn().mockResolvedValue({ error: null }),
    });

    const result = await cancelOwnershipTransfer('transfer-123', mockFromUserId);

    expect(result.success).toBe(true);
  });

  it('should fail if transfer not found', async () => {
    mockSupabase.single.mockResolvedValue({ data: null, error: 'Not found' });

    const result = await cancelOwnershipTransfer('transfer-999', mockFromUserId);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('not found');
    }
  });

  it('should fail if transfer not pending', async () => {
    mockSupabase.single.mockResolvedValue({
      data: { ...mockTransfer, status: 'confirmed' },
      error: null,
    });

    const result = await cancelOwnershipTransfer('transfer-123', mockFromUserId);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('Cannot cancel');
    }
  });

  it('should fail if canceller is not the owner', async () => {
    mockSupabase.single.mockResolvedValue({
      data: mockTransfer,
      error: null,
    });

    const result = await cancelOwnershipTransfer('transfer-123', 'different-user');

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('Only the current owner');
    }
  });
});

// ============================================================================
// Transfer Query Tests
// ============================================================================

describe('getPendingTransfer', () => {
  let mockSupabase: any;

  beforeEach(() => {
    mockSupabase = {
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn(),
    };

    vi.mocked(createClient).mockResolvedValue(mockSupabase as any);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should get pending transfer', async () => {
    mockSupabase.single.mockResolvedValue({
      data: mockTransfer,
      error: null,
    });

    const result = await getPendingTransfer(mockOrganizationId);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.transfer).toBeDefined();
      expect(result.transfer?.status).toBe('pending');
    }
  });

  it('should return null if no pending transfer', async () => {
    mockSupabase.single.mockResolvedValue({
      data: null,
      error: { code: 'PGRST116' }, // No rows returned
    });

    const result = await getPendingTransfer(mockOrganizationId);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.transfer).toBeNull();
    }
  });
});

describe('getOwnershipTransfers', () => {
  let mockSupabase: any;

  beforeEach(() => {
    mockSupabase = {
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      neq: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({
        data: [mockTransfer],
        error: null,
      }),
    };

    vi.mocked(createClient).mockResolvedValue(mockSupabase as any);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should get all transfers', async () => {
    const result = await getOwnershipTransfers(mockOrganizationId);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.transfers).toHaveLength(1);
    }
  });

  it('should exclude expired by default', async () => {
    const result = await getOwnershipTransfers(mockOrganizationId);

    expect(result.success).toBe(true);
    expect(mockSupabase.neq).toHaveBeenCalledWith('status', 'expired');
  });

  it('should include expired if requested', async () => {
    const result = await getOwnershipTransfers(mockOrganizationId, true);

    expect(result.success).toBe(true);
    expect(mockSupabase.neq).not.toHaveBeenCalled();
  });
});

// ============================================================================
// Cleanup Tests
// ============================================================================

describe('cleanupExpiredTransfers', () => {
  let mockSupabase: any;

  beforeEach(() => {
    mockSupabase = {
      rpc: vi.fn().mockResolvedValue({ data: 3, error: null }),
    };

    vi.mocked(createClient).mockResolvedValue(mockSupabase as any);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should call cleanup function and return count', async () => {
    const count = await cleanupExpiredTransfers();

    expect(count).toBe(3);
    expect(mockSupabase.rpc).toHaveBeenCalledWith('cleanup_expired_transfers');
  });

  it('should handle errors gracefully', async () => {
    mockSupabase.rpc.mockResolvedValue({ data: null, error: 'Error' });

    const count = await cleanupExpiredTransfers();

    expect(count).toBe(0);
  });
});
