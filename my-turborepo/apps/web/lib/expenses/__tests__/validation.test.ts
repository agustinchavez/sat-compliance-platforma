/**
 * Tests for Expense Validation (Component 20)
 *
 * Tests ISR deductibility rules per Art. 25/27/28 LISR
 */

import { describe, expect, it } from 'vitest';
import {
  assessDeductibility,
  validateExpenseData,
  checkRFCMatch,
  isGenericRFC,
} from '../validation';
import { ExpenseCategory } from '../types';

describe('Expense Validation', () => {
  const ORG_RFC = 'ABC123456789';

  describe('assessDeductibility', () => {
    describe('Rule 1: Generic RFC', () => {
      it('should reject expense with generic public RFC', () => {
        const result = assessDeductibility(
          {
            category: ExpenseCategory.SERVICIOS_PROFESIONALES,
            amount: 1000,
            total: 1160,
            vendorRfc: 'XAXX010101000',
            cfdiUuid: 'uuid-123',
          },
          ORG_RFC
        );

        expect(result.isDeductible).toBe(false);
        expect(result.deductibilityPercent).toBe(0);
        expect(result.reason).toContain('genérico');
      });

      it('should reject expense with generic foreign RFC', () => {
        const result = assessDeductibility(
          {
            category: ExpenseCategory.SERVICIOS_PROFESIONALES,
            amount: 1000,
            total: 1160,
            vendorRfc: 'XEXX010101000',
            cfdiUuid: 'uuid-123',
          },
          ORG_RFC
        );

        expect(result.isDeductible).toBe(false);
        expect(result.deductibilityPercent).toBe(0);
      });
    });

    describe('Rule 2: Fuel with cash payment', () => {
      it('should reject fuel expense paid in cash (any amount)', () => {
        const result = assessDeductibility(
          {
            category: ExpenseCategory.COMBUSTIBLE,
            amount: 500,
            total: 500,
            paymentMethod: '01', // Cash
            vendorRfc: 'PEM980101ABC',
          },
          ORG_RFC
        );

        expect(result.isDeductible).toBe(false);
        expect(result.deductibilityPercent).toBe(0);
        expect(result.reason).toContain('Combustible');
        expect(result.reason).toContain('efectivo');
      });

      it('should accept fuel expense paid by card', () => {
        const result = assessDeductibility(
          {
            category: ExpenseCategory.COMBUSTIBLE,
            amount: 500,
            total: 500,
            paymentMethod: '04', // Credit card
            vendorRfc: 'PEM980101ABC',
            cfdiUuid: 'uuid-123',
          },
          ORG_RFC
        );

        expect(result.isDeductible).toBe(true);
        expect(result.deductibilityPercent).toBe(100);
      });

      it('should accept fuel expense paid by transfer', () => {
        const result = assessDeductibility(
          {
            category: ExpenseCategory.COMBUSTIBLE,
            amount: 500,
            total: 500,
            paymentMethod: '03', // Transfer
            vendorRfc: 'PEM980101ABC',
            cfdiUuid: 'uuid-123',
          },
          ORG_RFC
        );

        expect(result.isDeductible).toBe(true);
        expect(result.deductibilityPercent).toBe(100);
      });
    });

    describe('Rule 3: Cash payment over $2,000', () => {
      it('should reject cash payment over $2,000', () => {
        const result = assessDeductibility(
          {
            category: ExpenseCategory.SERVICIOS_PROFESIONALES,
            amount: 2100,
            total: 2436,
            paymentMethod: '01', // Cash
            vendorRfc: 'ABC123456789',
            cfdiUuid: 'uuid-123',
          },
          ORG_RFC
        );

        expect(result.isDeductible).toBe(false);
        expect(result.deductibilityPercent).toBe(0);
        expect(result.reason).toContain('$2,000');
        expect(result.legalBasis).toContain('Art. 27 LISR');
      });

      it('should accept cash payment of exactly $2,000', () => {
        const result = assessDeductibility(
          {
            category: ExpenseCategory.SERVICIOS_PROFESIONALES,
            amount: 2000,
            total: 2000,
            paymentMethod: '01', // Cash
            vendorRfc: 'ABC123456789',
            cfdiUuid: 'uuid-123',
          },
          ORG_RFC
        );

        expect(result.isDeductible).toBe(true);
        expect(result.deductibilityPercent).toBe(100);
      });

      it('should accept cash payment under $2,000', () => {
        const result = assessDeductibility(
          {
            category: ExpenseCategory.SERVICIOS_PROFESIONALES,
            amount: 1500,
            total: 1740,
            paymentMethod: '01', // Cash
            vendorRfc: 'ABC123456789',
            cfdiUuid: 'uuid-123',
          },
          ORG_RFC
        );

        expect(result.isDeductible).toBe(true);
        expect(result.deductibilityPercent).toBe(100);
      });
    });

    describe('Rule 4: Meals and entertainment (91.5%)', () => {
      it('should mark meals as 91.5% deductible', () => {
        const result = assessDeductibility(
          {
            category: ExpenseCategory.ALIMENTOS_ENTRETENIMIENTO,
            amount: 1000,
            total: 1160,
            paymentMethod: '04', // Card
            vendorRfc: 'REST123456ABC',
            cfdiUuid: 'uuid-123',
          },
          ORG_RFC
        );

        expect(result.isDeductible).toBe(true);
        expect(result.deductibilityPercent).toBe(91.5);
        expect(result.reason).toContain('91.5%');
        expect(result.legalBasis).toContain('Art. 28');
      });

      it('should apply 91.5% rule even with transfer payment', () => {
        const result = assessDeductibility(
          {
            category: ExpenseCategory.ALIMENTOS_ENTRETENIMIENTO,
            amount: 1000,
            total: 1160,
            paymentMethod: '03', // Transfer
            vendorRfc: 'REST123456ABC',
            cfdiUuid: 'uuid-123',
          },
          ORG_RFC
        );

        expect(result.isDeductible).toBe(true);
        expect(result.deductibilityPercent).toBe(91.5);
      });
    });

    describe('Rule 5: Default fully deductible', () => {
      it('should mark normal expense as 100% deductible', () => {
        const result = assessDeductibility(
          {
            category: ExpenseCategory.SERVICIOS_PROFESIONALES,
            amount: 5000,
            total: 5800,
            paymentMethod: '03', // Transfer
            vendorRfc: 'ABC123456789',
            cfdiUuid: 'uuid-123',
          },
          ORG_RFC
        );

        expect(result.isDeductible).toBe(true);
        expect(result.deductibilityPercent).toBe(100);
        expect(result.legalBasis).toContain('Art. 25/27 LISR');
      });

      it('should mark rent as 100% deductible', () => {
        const result = assessDeductibility(
          {
            category: ExpenseCategory.ARRENDAMIENTO,
            amount: 10000,
            total: 11600,
            paymentMethod: '03',
            vendorRfc: 'PROP123456ABC',
            cfdiUuid: 'uuid-123',
          },
          ORG_RFC
        );

        expect(result.isDeductible).toBe(true);
        expect(result.deductibilityPercent).toBe(100);
      });
    });

    describe('Warnings', () => {
      it('should warn when CFDI is missing', () => {
        const result = assessDeductibility(
          {
            category: ExpenseCategory.SERVICIOS_PROFESIONALES,
            amount: 1000,
            total: 1160,
            paymentMethod: '03',
            vendorRfc: 'ABC123456789',
            // No cfdiUuid
          },
          ORG_RFC
        );

        expect(result.warnings.some(w => w.includes('Sin CFDI'))).toBe(true);
      });
    });
  });

  describe('checkRFCMatch', () => {
    it('should return true for exact match', () => {
      expect(checkRFCMatch('ABC123456789', 'ABC123456789')).toBe(true);
    });

    it('should return true for case-insensitive match', () => {
      expect(checkRFCMatch('abc123456789', 'ABC123456789')).toBe(true);
      expect(checkRFCMatch('ABC123456789', 'abc123456789')).toBe(true);
    });

    it('should return true when trimming whitespace', () => {
      expect(checkRFCMatch(' ABC123456789 ', 'ABC123456789')).toBe(true);
      expect(checkRFCMatch('ABC123456789', ' ABC123456789 ')).toBe(true);
    });

    it('should return false for non-matching RFCs', () => {
      expect(checkRFCMatch('ABC123456789', 'XYZ987654321')).toBe(false);
    });
  });

  describe('isGenericRFC', () => {
    it('should identify public general RFC', () => {
      expect(isGenericRFC('XAXX010101000')).toBe(true);
      expect(isGenericRFC('xaxx010101000')).toBe(true);
      expect(isGenericRFC(' XAXX010101000 ')).toBe(true);
    });

    it('should identify foreign RFC', () => {
      expect(isGenericRFC('XEXX010101000')).toBe(true);
      expect(isGenericRFC('xexx010101000')).toBe(true);
    });

    it('should return false for valid RFCs', () => {
      expect(isGenericRFC('ABC123456789')).toBe(false);
      expect(isGenericRFC('PEMEX123456')).toBe(false);
    });
  });

  describe('validateExpenseData', () => {
    it('should accept valid expense data', () => {
      const errors = validateExpenseData({
        vendorName: 'Test Vendor',
        description: 'Test expense',
        category: ExpenseCategory.SERVICIOS_PROFESIONALES,
        amount: 1000,
        taxAmount: 160,
        total: 1160,
        expenseDate: '2026-03-01',
      });

      expect(errors).toEqual([]);
    });

    it('should reject when total < amount', () => {
      const errors = validateExpenseData({
        vendorName: 'Test Vendor',
        description: 'Test expense',
        category: ExpenseCategory.SERVICIOS_PROFESIONALES,
        amount: 1000,
        taxAmount: 160,
        total: 900, // Less than amount
        expenseDate: '2026-03-01',
      });

      expect(errors.some(e => e.includes('total no puede ser menor'))).toBe(true);
    });

    it('should reject when total ≠ amount + taxAmount (outside tolerance)', () => {
      const errors = validateExpenseData({
        vendorName: 'Test Vendor',
        description: 'Test expense',
        category: ExpenseCategory.SERVICIOS_PROFESIONALES,
        amount: 1000,
        taxAmount: 160,
        total: 1170, // Should be 1160
        expenseDate: '2026-03-01',
      });

      expect(errors.some(e => e.includes('Total no coincide'))).toBe(true);
    });

    it('should accept small floating point differences (within 2 cent tolerance)', () => {
      const errors = validateExpenseData({
        vendorName: 'Test Vendor',
        description: 'Test expense',
        category: ExpenseCategory.SERVICIOS_PROFESIONALES,
        amount: 1000,
        taxAmount: 160,
        total: 1160.01, // 1 cent off
        expenseDate: '2026-03-01',
      });

      expect(errors).toEqual([]);
    });

    it('should reject invalid date', () => {
      const errors = validateExpenseData({
        vendorName: 'Test Vendor',
        description: 'Test expense',
        category: ExpenseCategory.SERVICIOS_PROFESIONALES,
        amount: 1000,
        total: 1000,
        expenseDate: 'invalid-date',
      });

      expect(errors).toContain('Fecha de gasto inválida');
    });

    it('should reject invalid RFC format', () => {
      const errors = validateExpenseData({
        vendorName: 'Test Vendor',
        description: 'Test expense',
        category: ExpenseCategory.SERVICIOS_PROFESIONALES,
        amount: 1000,
        total: 1000,
        expenseDate: '2026-03-01',
        vendorRfc: 'INVALID',
      });

      expect(errors).toContain('RFC del proveedor tiene formato inválido');
    });

    it('should accept valid RFC with Ñ', () => {
      const errors = validateExpenseData({
        vendorName: 'Test Vendor',
        description: 'Test expense',
        category: ExpenseCategory.SERVICIOS_PROFESIONALES,
        amount: 1000,
        total: 1000,
        expenseDate: '2026-03-01',
        vendorRfc: 'NIÑO800101ABC',
      });

      expect(errors).toEqual([]);
    });

    it('should accept valid 12-character RFC', () => {
      const errors = validateExpenseData({
        vendorName: 'Test Vendor',
        description: 'Test expense',
        category: ExpenseCategory.SERVICIOS_PROFESIONALES,
        amount: 1000,
        total: 1000,
        expenseDate: '2026-03-01',
        vendorRfc: 'ABC123456789',
      });

      expect(errors).toEqual([]);
    });

    it('should accept valid 13-character RFC', () => {
      const errors = validateExpenseData({
        vendorName: 'Test Vendor',
        description: 'Test expense',
        category: ExpenseCategory.SERVICIOS_PROFESIONALES,
        amount: 1000,
        total: 1000,
        expenseDate: '2026-03-01',
        vendorRfc: 'ABCD1234567A8',
      });

      expect(errors).toEqual([]);
    });
  });
});
