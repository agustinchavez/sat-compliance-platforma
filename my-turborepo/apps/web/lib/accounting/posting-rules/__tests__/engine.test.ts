/**
 * Posting Rules Engine Tests (FIX-3.2)
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';
import { resolveAndBuildLines } from '../engine';

// Mock repository
vi.mock('../repository', () => ({
  findOrgRule: vi.fn(),
  findSystemRule: vi.fn(),
}));

import { findOrgRule, findSystemRule } from '../repository';

const mockFindOrgRule = vi.mocked(findOrgRule);
const mockFindSystemRule = vi.mocked(findSystemRule);
const mockSupabase = {} as any;

beforeEach(() => {
  vi.clearAllMocks();
});

describe('resolveAndBuildLines', () => {
  it('should use org rule when available (tier 1)', async () => {
    mockFindOrgRule.mockResolvedValueOnce({
      id: 'rule-1',
      organizationId: 'org-1',
      ruleName: 'custom_invoice',
      triggerEvent: 'invoice',
      ruleDefinition: {
        lines: [
          { side: 'debit', accountCode: '1110', amountSource: 'total' },
          { side: 'credit', accountCode: '4200', amountSource: 'total' },
        ],
      },
      isSystem: false,
      isActive: true,
      priority: 1,
      createdAt: '2026-01-01',
      updatedAt: '2026-01-01',
    });

    const result = await resolveAndBuildLines(
      {
        organizationId: 'org-1',
        triggerEvent: 'invoice',
        amounts: { total: 1000 },
      },
      mockSupabase
    );

    expect(result.ruleSource).toBe('org');
    expect(result.ruleName).toBe('custom_invoice');
    expect(result.lines).toHaveLength(2);
    expect(result.lines[0]!.accountCode).toBe('1110');
    expect(result.lines[0]!.debit).toBe(1000);
    expect(result.lines[1]!.accountCode).toBe('4200');
    expect(result.lines[1]!.credit).toBe(1000);
  });

  it('should use system DB rule when no org rule (tier 2)', async () => {
    mockFindOrgRule.mockResolvedValueOnce(null);
    mockFindSystemRule.mockResolvedValueOnce({
      id: 'sys-1',
      organizationId: 'system',
      ruleName: 'system_invoice',
      triggerEvent: 'invoice',
      ruleDefinition: {
        lines: [
          { side: 'debit', accountCode: '1104', amountSource: 'total' },
          { side: 'credit', accountCode: '4101', amountSource: 'subtotal' },
          { side: 'credit', accountCode: '2104', amountSource: 'tax' },
        ],
      },
      isSystem: true,
      isActive: true,
      priority: 1,
      createdAt: '2026-01-01',
      updatedAt: '2026-01-01',
    });

    const result = await resolveAndBuildLines(
      {
        organizationId: 'org-1',
        triggerEvent: 'invoice',
        amounts: { total: 1160, subtotal: 1000, tax: 160 },
      },
      mockSupabase
    );

    expect(result.ruleSource).toBe('system_db');
    expect(result.lines).toHaveLength(3);
  });

  it('should fall back to system defaults when no DB rules (tier 3)', async () => {
    mockFindOrgRule.mockResolvedValueOnce(null);
    mockFindSystemRule.mockResolvedValueOnce(null);

    const result = await resolveAndBuildLines(
      {
        organizationId: 'org-1',
        triggerEvent: 'invoice',
        amounts: { total: 1160, subtotal: 1000, tax: 160 },
        conditions: { hasTax: 'true' },
      },
      mockSupabase
    );

    expect(result.ruleSource).toBe('system_default');
    expect(result.ruleName).toBe('invoice_default');
    expect(result.lines).toHaveLength(3);
    expect(result.lines[0]!.accountCode).toBe('1104');
    expect(result.lines[0]!.debit).toBe(1160);
  });

  it('should skip lines with zero amounts', async () => {
    mockFindOrgRule.mockResolvedValueOnce(null);
    mockFindSystemRule.mockResolvedValueOnce(null);

    const result = await resolveAndBuildLines(
      {
        organizationId: 'org-1',
        triggerEvent: 'invoice',
        amounts: { total: 1000, subtotal: 1000, tax: 0 },
        conditions: { hasTax: 'true' },
      },
      mockSupabase
    );

    // Tax line skipped because amount is 0
    expect(result.lines).toHaveLength(2);
  });

  it('should attach lineMetadata to all lines', async () => {
    mockFindOrgRule.mockResolvedValueOnce(null);
    mockFindSystemRule.mockResolvedValueOnce(null);

    const result = await resolveAndBuildLines(
      {
        organizationId: 'org-1',
        triggerEvent: 'payment',
        amounts: { amount: 5000 },
        lineMetadata: { uuidCfdi: '550e8400-e29b-41d4-a716-446655440000' },
      },
      mockSupabase
    );

    expect(result.lines).toHaveLength(2);
    for (const line of result.lines) {
      expect(line.uuidCfdi).toBe('550e8400-e29b-41d4-a716-446655440000');
    }
  });
});
