/**
 * Balance Service Tests (FIX-3.3, FIX-3.4, FIX-3.5)
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';
import { validatePeriodForClose } from '../service';

// Mock all dependencies
vi.mock('../../journal-entries/repository', () => ({
  getFiscalPeriod: vi.fn(),
  updateFiscalPeriod: vi.fn(),
  getPostedEntriesForPeriod: vi.fn(),
}));

vi.mock('../../mappers', () => ({
  mapRowToBalanceSnapshot: vi.fn((row: any) => ({
    id: row.id,
    organizationId: row.organization_id,
    accountId: row.account_id,
    fiscalPeriodId: row.fiscal_period_id,
    openingBalance: parseFloat(row.opening_balance ?? '0'),
    totalDebit: parseFloat(row.total_debit ?? '0'),
    totalCredit: parseFloat(row.total_credit ?? '0'),
    closingBalance: parseFloat(row.closing_balance ?? '0'),
    generatedAt: row.generated_at,
    isSealed: row.is_sealed,
  })),
  mapRowToAccount: vi.fn((row: any) => ({
    id: row.id,
    organizationId: row.organization_id,
    code: row.code,
    name: row.name,
    satNaturaleza: row.sat_naturaleza,
    satNivel: row.sat_nivel,
    satAgrupadorCode: row.sat_agrupador_code,
    isActive: row.is_active,
    isPostable: row.is_postable,
    accountType: row.account_type,
    normalBalance: row.normal_balance,
    materializedPath: row.materialized_path,
    currencyCode: row.currency_code,
    requiresUuid: row.requires_uuid,
    requiresThirdParty: row.requires_third_party,
    isSystem: row.is_system,
    effectiveFrom: row.effective_from,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  })),
}));

import { getFiscalPeriod, getPostedEntriesForPeriod } from '../../journal-entries/repository';

const mockGetFiscalPeriod = vi.mocked(getFiscalPeriod);
const mockGetPostedEntries = vi.mocked(getPostedEntriesForPeriod);

// Mock Supabase
let mockSelectReturn: any = { data: null, error: null, count: null };
const mockSupabase = {
  from: vi.fn(() => ({
    select: vi.fn(() => ({
      eq: vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn(async () => mockSelectReturn),
          })),
          maybeSingle: vi.fn(async () => mockSelectReturn),
        })),
        maybeSingle: vi.fn(async () => mockSelectReturn),
        single: vi.fn(async () => mockSelectReturn),
      })),
      count: 'exact',
      head: true,
    })),
  })),
} as any;

beforeEach(() => {
  vi.clearAllMocks();
  mockSelectReturn = { data: null, error: null, count: null };
});

describe('validatePeriodForClose (FIX-3.5)', () => {
  it('should return canClose=true when period is valid and no issues', async () => {
    mockGetFiscalPeriod.mockResolvedValueOnce({
      id: 'p1',
      organizationId: 'org-1',
      year: 2026,
      month: 1,
      period: 1,
      periodType: 'monthly',
      startDate: '2026-01-01',
      endDate: '2026-01-31',
      status: 'open',
      filingMode: 'required',
      createdAt: '2026-01-01',
      updatedAt: '2026-01-01',
    });

    // Mock draft count = 0
    const mockCountResult = { count: 0 };
    mockSupabase.from.mockReturnValueOnce({
      select: vi.fn().mockReturnValueOnce({
        eq: vi.fn().mockReturnValueOnce({
          eq: vi.fn().mockReturnValueOnce({
            eq: vi.fn().mockResolvedValueOnce(mockCountResult),
          }),
        }),
      }),
    });

    mockGetPostedEntries.mockResolvedValueOnce([
      {
        id: 'e1',
        organizationId: 'org-1',
        entryNumber: '2026-000001',
        fiscalPeriodId: 'p1',
        entryDate: '2026-01-15',
        polizaType: 'ingreso',
        description: 'Test',
        status: 'posted',
        currencyCode: 'MXN',
        exchangeRate: 1,
        totalDebit: 1000,
        totalCredit: 1000,
        lines: [],
        createdAt: '2026-01-15',
        createdBy: 'user-1',
        updatedAt: '2026-01-15',
      },
    ]);

    const result = await validatePeriodForClose('org-1', 'p1', mockSupabase);
    expect(result.canClose).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should block close when period not found', async () => {
    mockGetFiscalPeriod.mockResolvedValueOnce(null);

    const result = await validatePeriodForClose('org-1', 'missing', mockSupabase);
    expect(result.canClose).toBe(false);
    expect(result.errors).toContain('Período no encontrado');
  });

  it('should block close when period is already closed', async () => {
    mockGetFiscalPeriod.mockResolvedValueOnce({
      id: 'p1',
      organizationId: 'org-1',
      year: 2026,
      month: 1,
      period: 1,
      periodType: 'monthly',
      startDate: '2026-01-01',
      endDate: '2026-01-31',
      status: 'closed',
      filingMode: 'required',
      createdAt: '2026-01-01',
      updatedAt: '2026-01-01',
    });

    const result = await validatePeriodForClose('org-1', 'p1', mockSupabase);
    expect(result.canClose).toBe(false);
    expect(result.errors[0]).toContain('ya está cerrado');
  });

  it('should detect imbalanced posted entries', async () => {
    mockGetFiscalPeriod.mockResolvedValueOnce({
      id: 'p1',
      organizationId: 'org-1',
      year: 2026,
      month: 1,
      period: 1,
      periodType: 'monthly',
      startDate: '2026-01-01',
      endDate: '2026-01-31',
      status: 'open',
      filingMode: 'required',
      createdAt: '2026-01-01',
      updatedAt: '2026-01-01',
    });

    mockSupabase.from.mockReturnValueOnce({
      select: vi.fn().mockReturnValueOnce({
        eq: vi.fn().mockReturnValueOnce({
          eq: vi.fn().mockReturnValueOnce({
            eq: vi.fn().mockResolvedValueOnce({ count: 0 }),
          }),
        }),
      }),
    });

    mockGetPostedEntries.mockResolvedValueOnce([
      {
        id: 'e1',
        organizationId: 'org-1',
        entryNumber: '2026-000001',
        fiscalPeriodId: 'p1',
        entryDate: '2026-01-15',
        polizaType: 'ingreso',
        description: 'Test',
        status: 'posted',
        currencyCode: 'MXN',
        exchangeRate: 1,
        totalDebit: 1000,
        totalCredit: 999,  // Imbalanced
        lines: [],
        createdAt: '2026-01-15',
        createdBy: 'user-1',
        updatedAt: '2026-01-15',
      },
    ]);

    const result = await validatePeriodForClose('org-1', 'p1', mockSupabase);
    expect(result.canClose).toBe(false);
    expect(result.errors[0]).toContain('desbalanceada');
  });
});
