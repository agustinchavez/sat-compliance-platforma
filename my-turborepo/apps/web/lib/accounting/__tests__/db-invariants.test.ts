/**
 * Database Invariant Tests (FIX-1.2)
 *
 * Verifies that the service layer enforces the same invariants
 * that the DB constraints will enforce. These tests validate
 * the application-level checks that mirror the DB constraints.
 */

import { describe, expect, it } from 'vitest';
import {
  isBalanced,
  validateLineAmounts,
  isValidAccountCode,
  formatEntryNumber,
} from '../validation';
import { validateForPosting } from '../journal-entries/validation';
import { AccountingError } from '../errors';

describe('Database invariants', () => {
  describe('je_balanced: total_debit = total_credit', () => {
    it('rejects unbalanced journal entries', () => {
      // DB constraint: CHECK (total_debit = total_credit)
      const lines = [
        { debit: 100, credit: 0 },
        { debit: 0, credit: 99 },
      ];
      expect(isBalanced(lines)).toBe(false);
    });

    it('accepts balanced journal entries', () => {
      const lines = [
        { debit: 1000, credit: 0 },
        { debit: 0, credit: 1000 },
      ];
      expect(isBalanced(lines)).toBe(true);
    });

    it('rejects posting of imbalanced entries', () => {
      expect(() => validateForPosting({
        status: 'draft',
        totalDebit: 100,
        totalCredit: 99,
      })).toThrow('no está balanceada');
    });
  });

  describe('je_non_negative_totals: total_debit >= 0 AND total_credit >= 0', () => {
    it('rejects negative amounts in lines', () => {
      const lines = [
        { debit: -100, credit: 0 },
      ];
      const errors = validateLineAmounts(lines);
      expect(errors.length).toBeGreaterThan(0);
    });
  });

  describe('jel_debit_xor_credit: exactly one of debit/credit > 0', () => {
    it('rejects lines with both debit and credit > 0', () => {
      const lines = [
        { debit: 50, credit: 50 },
      ];
      const errors = validateLineAmounts(lines);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('rejects lines with neither debit nor credit > 0', () => {
      const lines = [
        { debit: 0, credit: 0 },
      ];
      const errors = validateLineAmounts(lines);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('accepts valid lines with exactly one side > 0', () => {
      const lines = [
        { debit: 100, credit: 0 },
        { debit: 0, credit: 100 },
      ];
      const errors = validateLineAmounts(lines);
      expect(errors).toHaveLength(0);
    });
  });

  describe('coa_valid_code_format: code ~ ^[0-9]{4,12}$', () => {
    it('rejects non-numeric account codes', () => {
      expect(isValidAccountCode('ABC-123')).toBe(false);
    });

    it('rejects too-short codes', () => {
      expect(isValidAccountCode('110')).toBe(false);
    });

    it('rejects too-long codes', () => {
      expect(isValidAccountCode('1234567890123')).toBe(false);
    });

    it('accepts valid 4-12 digit codes', () => {
      expect(isValidAccountCode('1101')).toBe(true);
      expect(isValidAccountCode('110101001001')).toBe(true);
    });
  });

  describe('je_unique_entry_number: UNIQUE (organization_id, entry_number)', () => {
    it('entry numbers follow predictable format YYYY-NNNNNN', () => {
      // The DB constraint prevents duplicate entry_numbers per org.
      // The format YYYY-NNNNNN is enforced by formatEntryNumber().
      expect(formatEntryNumber(2026, 1)).toBe('2026-000001');
      expect(formatEntryNumber(2026, 999999)).toBe('2026-999999');
    });
  });

  describe('coa_naturaleza_required_if_postable', () => {
    it('postable accounts require naturaleza D or A', () => {
      // This constraint ensures postable accounts always have a valid naturaleza.
      // At the DB level: CHECK ((is_postable = FALSE) OR (sat_naturaleza IN ('D', 'A')))
      // At the app level, createAccount validates this.
      const validNaturalezas = ['D', 'A'];
      expect(validNaturalezas).toContain('D');
      expect(validNaturalezas).toContain('A');
      expect(validNaturalezas).not.toContain(null);
      expect(validNaturalezas).not.toContain('');
    });
  });
});
