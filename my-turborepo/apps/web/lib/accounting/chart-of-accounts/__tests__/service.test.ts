/**
 * Chart of Accounts Service Tests (Component 21)
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  createAccount,
  updateAccountById,
  getAccount,
  getAccountByCode,
  resolveAccountCode,
  deleteAccount,
  getAccountHierarchy,
  suggestAgrupadorCode,
  seedFromTemplate,
  listAccounts,
} from '../service';
import { AccountingError } from '../../errors';
import type { CreateAccountInput, UpdateAccountInput } from '../../types';

// --- Shared mock state ---
let mockAccountData: any = null;
let mockAccountByCodeData: any = null;
let mockAccountListData: any[] = [];
let mockAccountListCount: number = 0;
let mockInsertData: any = null;
let mockInsertError: any = null;
let mockUpdateData: any = null;
let mockUpdateError: any = null;
let mockHasEntriesCount: number = 0;
let mockHasChildrenCount: number = 0;
let mockCountResult: number = 0;
let mockAliasData: any = null;

vi.mock('@/lib/supabase/service-role-client', () => ({
  createServiceRoleClient: vi.fn(() => createMockSupabase()),
}));

function createMockSupabase() {
  return {
    from: vi.fn((table: string) => {
      if (table === 'chart_of_accounts') {
        return {
          insert: vi.fn(() => ({
            select: vi.fn(() => ({
              single: vi.fn(() => Promise.resolve({
                data: mockInsertData ?? { id: 'acc-123', code: '1101', name: 'Caja', organization_id: 'org-1', sat_nivel: 3, sat_naturaleza: 'D', materialized_path: '1000.1100.1101', is_postable: true, account_type: 'asset', normal_balance: 'D', currency_code: 'MXN', is_active: true, created_at: '2026-01-01', updated_at: '2026-01-01' },
                error: mockInsertError,
              })),
            })),
          })),
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              is: vi.fn(() => ({
                maybeSingle: vi.fn(() => Promise.resolve({ data: mockAccountData, error: null })),
                order: vi.fn(() => Promise.resolve({ data: mockAccountListData, error: null })),
              })),
              eq: vi.fn(() => ({
                is: vi.fn(() => ({
                  maybeSingle: vi.fn(() => Promise.resolve({ data: mockAccountByCodeData, error: null })),
                })),
              })),
              single: vi.fn(() => Promise.resolve({ data: mockAccountData, error: null })),
              maybeSingle: vi.fn(() => Promise.resolve({ data: mockAccountData, error: null })),
            })),
            is: vi.fn(() => ({
              eq: vi.fn(() => ({
                is: vi.fn(() => ({
                  maybeSingle: vi.fn(() => Promise.resolve({ data: null, error: null })),
                })),
              })),
              order: vi.fn(() => ({
                range: vi.fn(() => Promise.resolve({
                  data: mockAccountListData,
                  error: null,
                  count: mockAccountListCount,
                })),
                like: vi.fn(() => Promise.resolve({ data: mockAccountListData, error: null })),
              })),
              like: vi.fn(() => ({
                order: vi.fn(() => Promise.resolve({ data: mockAccountListData, error: null })),
              })),
            })),
          })),
          update: vi.fn(() => ({
            eq: vi.fn(() => ({
              is: vi.fn(() => ({
                select: vi.fn(() => ({
                  single: vi.fn(() => Promise.resolve({ data: mockUpdateData ?? mockAccountData, error: mockUpdateError })),
                })),
              })),
              select: vi.fn(() => ({
                single: vi.fn(() => Promise.resolve({ data: mockUpdateData ?? mockAccountData, error: mockUpdateError })),
              })),
            })),
          })),
        };
      }
      if (table === 'journal_entry_lines') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => Promise.resolve({ count: mockHasEntriesCount, error: null })),
          })),
        };
      }
      if (table === 'account_code_aliases') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn(() => Promise.resolve({ data: mockAliasData, error: null })),
              })),
            })),
          })),
        };
      }
      return {};
    }),
  };
}

describe('Chart of Accounts Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAccountData = null;
    mockAccountByCodeData = null;
    mockAccountListData = [];
    mockAccountListCount = 0;
    mockInsertData = null;
    mockInsertError = null;
    mockUpdateData = null;
    mockUpdateError = null;
    mockHasEntriesCount = 0;
    mockHasChildrenCount = 0;
    mockCountResult = 0;
    mockAliasData = null;
  });

  describe('createAccount', () => {
    it('should create a valid account', async () => {
      const input: CreateAccountInput = {
        code: '1101',
        name: 'Caja',
        satNivel: 1,
        satNaturaleza: 'D',
        accountType: 'asset',
      };

      const supabase = createMockSupabase() as any;
      const result = await createAccount('org-1', input, 'user-1', supabase);
      expect(result).toBeDefined();
      expect(result.code).toBe('1101');
    });

    it('should normalize dot-separated codes', async () => {
      const input: CreateAccountInput = {
        code: '1.1.01',
        name: 'Caja',
        satNivel: 1,
        satNaturaleza: 'D',
        accountType: 'asset',
      };

      const supabase = createMockSupabase() as any;
      const result = await createAccount('org-1', input, 'user-1', supabase);
      expect(result).toBeDefined();
    });

    it('should reject invalid code format', async () => {
      const input: CreateAccountInput = {
        code: 'ABC',
        name: 'Invalid',
        satNivel: 1,
        satNaturaleza: 'D',
        accountType: 'asset',
      };

      const supabase = createMockSupabase() as any;
      await expect(createAccount('org-1', input, 'user-1', supabase)).rejects.toThrow();
    });

    it('should reject duplicate codes', async () => {
      mockAccountByCodeData = { id: 'acc-existing', code: '1101' };

      const input: CreateAccountInput = {
        code: '1101',
        name: 'Caja Duplicada',
        satNivel: 1,
        satNaturaleza: 'D',
        accountType: 'asset',
      };

      const supabase = createMockSupabase() as any;
      await expect(createAccount('org-1', input, 'user-1', supabase)).rejects.toThrow(AccountingError);
    });

    it('should validate parent exists when parentId provided', async () => {
      const input: CreateAccountInput = {
        code: '110101',
        name: 'Subcuenta',
        satNivel: 2,
        satNaturaleza: 'D',
        accountType: 'asset',
        parentId: 'a0000000-b000-4000-a000-c00000000000',
      };

      const supabase = createMockSupabase() as any;
      await expect(createAccount('org-1', input, 'user-1', supabase)).rejects.toThrow('cuenta padre no existe');
    });

    it('should validate nivel matches parent + 1', async () => {
      mockAccountData = {
        id: 'b0000000-c000-4000-a000-d00000000000',
        organization_id: 'org-1',
        code: '1000',
        name: 'Activo',
        sat_nivel: 1,
        sat_naturaleza: 'D',
        account_type: 'asset',
        materialized_path: '1000',
      };

      const input: CreateAccountInput = {
        code: '110101',
        name: 'Wrong Level',
        satNivel: 4,
        satNaturaleza: 'D',
        accountType: 'asset',
        parentId: 'b0000000-c000-4000-a000-d00000000000',
      };

      const supabase = createMockSupabase() as any;
      await expect(createAccount('org-1', input, 'user-1', supabase)).rejects.toThrow('nivel SAT');
    });

    it('should require nivel 1 for root accounts', async () => {
      const input: CreateAccountInput = {
        code: '1000',
        name: 'Root',
        satNivel: 3,
        satNaturaleza: 'D',
        accountType: 'asset',
      };

      const supabase = createMockSupabase() as any;
      await expect(createAccount('org-1', input, 'user-1', supabase)).rejects.toThrow('nivel 1');
    });
  });

  describe('getAccount', () => {
    it('should return account when found', async () => {
      mockAccountData = {
        id: 'acc-123',
        organization_id: 'org-1',
        code: '1101',
        name: 'Caja',
        sat_nivel: 3,
        sat_naturaleza: 'D',
        account_type: 'asset',
        materialized_path: '1000.1100.1101',
        is_postable: true,
        is_active: true,
        created_at: '2026-01-01',
        updated_at: '2026-01-01',
      };

      const supabase = createMockSupabase() as any;
      const result = await getAccount('acc-123', supabase);
      expect(result.id).toBe('acc-123');
      expect(result.code).toBe('1101');
    });

    it('should throw ACCOUNT_NOT_FOUND when not found', async () => {
      const supabase = createMockSupabase() as any;
      await expect(getAccount('nonexistent', supabase)).rejects.toThrow(AccountingError);
    });
  });

  describe('updateAccountById', () => {
    it('should update account name', async () => {
      mockAccountData = {
        id: 'acc-123',
        organization_id: 'org-1',
        code: '1101',
        name: 'Caja',
        sat_nivel: 3,
        sat_naturaleza: 'D',
        account_type: 'asset',
        materialized_path: '1000.1100.1101',
        is_postable: true,
        is_active: true,
        created_at: '2026-01-01',
        updated_at: '2026-01-01',
      };
      mockUpdateData = { ...mockAccountData, name: 'Caja Principal' };

      const supabase = createMockSupabase() as any;
      const result = await updateAccountById('acc-123', { name: 'Caja Principal' }, 'user-1', supabase);
      expect(result.name).toBe('Caja Principal');
    });

    it('should throw when account not found', async () => {
      const supabase = createMockSupabase() as any;
      await expect(updateAccountById('nonexistent', { name: 'X' }, 'user-1', supabase)).rejects.toThrow(AccountingError);
    });
  });

  describe('deleteAccount', () => {
    it('should throw when account not found', async () => {
      const supabase = createMockSupabase() as any;
      await expect(deleteAccount('nonexistent', 'user-1', supabase)).rejects.toThrow(AccountingError);
    });

    it('should throw when account has posted entries', async () => {
      mockAccountData = {
        id: 'acc-123',
        organization_id: 'org-1',
        code: '1101',
        name: 'Caja',
        sat_nivel: 3,
        sat_naturaleza: 'D',
        account_type: 'asset',
        materialized_path: '1000.1100.1101',
        is_postable: true,
        is_active: true,
        created_at: '2026-01-01',
        updated_at: '2026-01-01',
      };
      mockHasEntriesCount = 5;

      const supabase = createMockSupabase() as any;
      await expect(deleteAccount('acc-123', 'user-1', supabase)).rejects.toThrow('pólizas contabilizadas');
    });
  });

  describe('suggestAgrupadorCode', () => {
    it('should return suggestions for asset accounts', () => {
      const suggestions = suggestAgrupadorCode('Caja', 'asset');
      expect(suggestions.length).toBeGreaterThan(0);
      expect(suggestions[0].code).toContain('101');
    });

    it('should return suggestions for liability accounts', () => {
      const suggestions = suggestAgrupadorCode('Proveedores', 'liability');
      expect(suggestions.length).toBeGreaterThan(0);
    });

    it('should return empty for unknown names', () => {
      const suggestions = suggestAgrupadorCode('ZZZZXXXX', 'asset');
      expect(suggestions).toHaveLength(0);
    });
  });

  describe('seedFromTemplate', () => {
    it('should throw if org already has accounts', async () => {
      mockCountResult = 10;
      // Override supabase to return non-zero count
      const supabase = {
        from: vi.fn((table: string) => {
          if (table === 'chart_of_accounts') {
            return {
              select: vi.fn(() => ({
                eq: vi.fn(() => ({
                  is: vi.fn(() => Promise.resolve({ count: 10, error: null })),
                })),
              })),
            };
          }
          return {};
        }),
      } as any;

      await expect(seedFromTemplate('org-1', 'mexico-pyme', 'user-1', supabase)).rejects.toThrow('ya tiene cuentas');
    });

    it('should throw for unknown template', async () => {
      const supabase = {
        from: vi.fn(() => ({
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              is: vi.fn(() => Promise.resolve({ count: 0, error: null })),
            })),
          })),
        })),
      } as any;

      await expect(seedFromTemplate('org-1', 'unknown' as any, 'user-1', supabase)).rejects.toThrow('Plantilla desconocida');
    });
  });

  describe('getAccountHierarchy', () => {
    it('should return empty array for org with no accounts', async () => {
      const supabase = createMockSupabase() as any;
      const result = await getAccountHierarchy('org-1', supabase);
      expect(result).toEqual([]);
    });
  });
});
