/**
 * Journal Entries Service Tests (Component 22)
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';
import { AccountingError } from '../../errors';
import { validateForPosting, validateForReversal } from '../validation';
import {
  isBalanced,
  calculateTotals,
  validateLineAmounts,
  isDateInPeriod,
  formatEntryNumber,
  roundToTwoDecimals,
  computeBalance,
  splitBalanceToColumns,
  normalizeAccountCode,
  isValidAccountCode,
  buildMaterializedPath,
  isChildPath,
  isValidDepth,
  toSatDecimal,
  generateSatFileName,
} from '../../validation';

describe('Journal Entry Validation', () => {
  describe('isBalanced', () => {
    it('should return true for balanced lines', () => {
      const lines = [
        { debit: 1000, credit: 0 },
        { debit: 0, credit: 1000 },
      ];
      expect(isBalanced(lines)).toBe(true);
    });

    it('should return false for unbalanced lines', () => {
      const lines = [
        { debit: 1000, credit: 0 },
        { debit: 0, credit: 500 },
      ];
      expect(isBalanced(lines)).toBe(false);
    });

    it('should handle multiple lines', () => {
      const lines = [
        { debit: 1160.50, credit: 0 },
        { debit: 0, credit: 1000 },
        { debit: 0, credit: 160.50 },
      ];
      expect(isBalanced(lines)).toBe(true);
    });

    it('should allow floating point tolerance', () => {
      const lines = [
        { debit: 100.001, credit: 0 },
        { debit: 0, credit: 100.005 },
      ];
      expect(isBalanced(lines)).toBe(true);
    });
  });

  describe('calculateTotals', () => {
    it('should sum debits and credits', () => {
      const lines = [
        { debit: 500, credit: 0 },
        { debit: 300, credit: 0 },
        { debit: 0, credit: 800 },
      ];
      const { totalDebit, totalCredit } = calculateTotals(lines);
      expect(totalDebit).toBe(800);
      expect(totalCredit).toBe(800);
    });

    it('should round to two decimals', () => {
      const lines = [
        { debit: 33.333, credit: 0 },
        { debit: 33.333, credit: 0 },
        { debit: 33.334, credit: 0 },
        { debit: 0, credit: 100 },
      ];
      const { totalDebit } = calculateTotals(lines);
      expect(totalDebit).toBe(100);
    });
  });

  describe('validateLineAmounts', () => {
    it('should return empty for valid lines', () => {
      const lines = [
        { debit: 1000, credit: 0 },
        { debit: 0, credit: 1000 },
      ];
      expect(validateLineAmounts(lines)).toHaveLength(0);
    });

    it('should detect lines with both debit and credit', () => {
      const lines = [
        { debit: 500, credit: 500 },
      ];
      const errors = validateLineAmounts(lines);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should detect lines with neither debit nor credit', () => {
      const lines = [
        { debit: 0, credit: 0 },
      ];
      const errors = validateLineAmounts(lines);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should detect negative amounts', () => {
      const lines = [
        { debit: -100, credit: 0 },
      ];
      const errors = validateLineAmounts(lines);
      expect(errors.length).toBeGreaterThan(0);
    });
  });

  describe('isDateInPeriod', () => {
    it('should return true for date within period', () => {
      expect(isDateInPeriod('2026-01-15', '2026-01-01', '2026-01-31')).toBe(true);
    });

    it('should return true for date on period boundaries', () => {
      expect(isDateInPeriod('2026-01-01', '2026-01-01', '2026-01-31')).toBe(true);
      expect(isDateInPeriod('2026-01-31', '2026-01-01', '2026-01-31')).toBe(true);
    });

    it('should return false for date outside period', () => {
      expect(isDateInPeriod('2026-02-01', '2026-01-01', '2026-01-31')).toBe(false);
    });
  });

  describe('validateForPosting', () => {
    it('should accept draft entries', () => {
      expect(() => validateForPosting({
        status: 'draft',
        totalDebit: 1000,
        totalCredit: 1000,
      })).not.toThrow();
    });

    it('should reject already posted entries', () => {
      expect(() => validateForPosting({
        status: 'posted',
        totalDebit: 1000,
        totalCredit: 1000,
      })).toThrow(AccountingError);
    });

    it('should reject imbalanced entries', () => {
      expect(() => validateForPosting({
        status: 'draft',
        totalDebit: 1000,
        totalCredit: 500,
      })).toThrow('no está balanceada');
    });
  });

  describe('validateForReversal', () => {
    it('should accept posted entries', () => {
      expect(() => validateForReversal({
        status: 'posted',
      })).not.toThrow();
    });

    it('should reject non-posted entries', () => {
      expect(() => validateForReversal({
        status: 'draft',
      })).toThrow('contabilizadas');
    });

    it('should reject already reversed entries', () => {
      expect(() => validateForReversal({
        status: 'posted',
        reversedByEntryId: 'rev-123',
      })).toThrow('ya fue reversada');
    });
  });

  describe('formatEntryNumber', () => {
    it('should format with zero padding', () => {
      expect(formatEntryNumber(2026, 1)).toBe('2026-000001');
      expect(formatEntryNumber(2026, 123)).toBe('2026-000123');
      expect(formatEntryNumber(2026, 999999)).toBe('2026-999999');
    });
  });

  describe('roundToTwoDecimals', () => {
    it('should round correctly', () => {
      expect(roundToTwoDecimals(1.005)).toBe(1.01);
      expect(roundToTwoDecimals(1.015)).toBe(1.02);
      expect(roundToTwoDecimals(100.999)).toBe(101);
    });
  });

  describe('computeBalance', () => {
    it('should compute deudora balance (debit - credit)', () => {
      expect(computeBalance('D', 1000, 300)).toBe(700);
    });

    it('should compute acreedora balance (credit - debit)', () => {
      expect(computeBalance('A', 300, 1000)).toBe(700);
    });

    it('should handle zero', () => {
      expect(computeBalance('D', 0, 0)).toBe(0);
    });

    it('should handle negative balances', () => {
      expect(computeBalance('D', 100, 500)).toBe(-400);
    });
  });

  describe('splitBalanceToColumns', () => {
    it('should put positive deudora balance in debit column', () => {
      const result = splitBalanceToColumns(1000, 'D');
      expect(result.debit).toBe(1000);
      expect(result.credit).toBe(0);
    });

    it('should put positive acreedora balance in credit column', () => {
      const result = splitBalanceToColumns(1000, 'A');
      expect(result.debit).toBe(0);
      expect(result.credit).toBe(1000);
    });

    it('should flip for negative balances', () => {
      const result = splitBalanceToColumns(-500, 'D');
      expect(result.debit).toBe(0);
      expect(result.credit).toBe(500);
    });

    it('should handle zero', () => {
      const result = splitBalanceToColumns(0, 'D');
      expect(result.debit).toBe(0);
      expect(result.credit).toBe(0);
    });
  });
});

describe('Account Code Validation', () => {
  describe('normalizeAccountCode', () => {
    it('should strip dots', () => {
      expect(normalizeAccountCode('1.1.01')).toBe('1101');
      expect(normalizeAccountCode('1101')).toBe('1101');
      expect(normalizeAccountCode('1.1.01.001')).toBe('1101001');
    });
  });

  describe('isValidAccountCode', () => {
    it('should accept 4-12 digit codes', () => {
      expect(isValidAccountCode('1101')).toBe(true);
      expect(isValidAccountCode('110101')).toBe(true);
      expect(isValidAccountCode('110101001001')).toBe(true);
    });

    it('should accept dot-separated codes', () => {
      expect(isValidAccountCode('1.1.01')).toBe(true);
    });

    it('should reject too short codes', () => {
      expect(isValidAccountCode('110')).toBe(false);
    });

    it('should reject too long codes', () => {
      expect(isValidAccountCode('1234567890123')).toBe(false);
    });

    it('should reject non-numeric codes', () => {
      expect(isValidAccountCode('ABCD')).toBe(false);
      expect(isValidAccountCode('11-01')).toBe(false);
    });
  });

  describe('buildMaterializedPath', () => {
    it('should return code for root accounts', () => {
      expect(buildMaterializedPath(null, '1000')).toBe('1000');
    });

    it('should append to parent path', () => {
      expect(buildMaterializedPath('1000', '1100')).toBe('1000.1100');
      expect(buildMaterializedPath('1000.1100', '1101')).toBe('1000.1100.1101');
    });
  });

  describe('isChildPath', () => {
    it('should detect child paths', () => {
      expect(isChildPath('1000.1100', '1000')).toBe(true);
      expect(isChildPath('1000.1100.1101', '1000.1100')).toBe(true);
    });

    it('should reject non-child paths', () => {
      expect(isChildPath('2000.2100', '1000')).toBe(false);
      expect(isChildPath('1000', '1000')).toBe(false);
    });
  });

  describe('isValidDepth', () => {
    it('should accept depth <= 6', () => {
      expect(isValidDepth('1000')).toBe(true);
      expect(isValidDepth('1000.1100.1101.110101.11010101.1101010101')).toBe(true);
    });

    it('should reject depth > 6', () => {
      expect(isValidDepth('1.2.3.4.5.6.7')).toBe(false);
    });
  });
});

describe('SAT Utilities', () => {
  describe('toSatDecimal', () => {
    it('should format to 2 decimal places', () => {
      expect(toSatDecimal(1000)).toBe('1000.00');
      expect(toSatDecimal(1160.5)).toBe('1160.50');
      expect(toSatDecimal(0)).toBe('0.00');
    });
  });

  describe('generateSatFileName', () => {
    it('should generate correct file names', () => {
      expect(generateSatFileName('XAXX010101XXX', 2026, 1, 'CT')).toBe('XAXX010101XXX202601CT.xml');
      expect(generateSatFileName('XAXX010101XXX', 2026, 12, 'BN')).toBe('XAXX010101XXX202612BN.xml');
      expect(generateSatFileName('ABC123456789', 2026, 3, 'PL')).toBe('ABC123456789202603PL.xml');
    });
  });
});
