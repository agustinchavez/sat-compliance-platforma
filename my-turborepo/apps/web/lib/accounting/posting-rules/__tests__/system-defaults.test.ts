/**
 * System Default Posting Rules Tests (FIX-3.2)
 */

import { describe, expect, it } from 'vitest';
import { findSystemDefault, SYSTEM_DEFAULT_RULES } from '../system-defaults';

describe('SYSTEM_DEFAULT_RULES', () => {
  it('should have rules for invoice, payment, and expense triggers', () => {
    const triggers = new Set(SYSTEM_DEFAULT_RULES.map(r => r.triggerEvent));
    expect(triggers).toContain('invoice');
    expect(triggers).toContain('payment');
    expect(triggers).toContain('expense');
  });

  it('should have balanced lines in every rule', () => {
    for (const rule of SYSTEM_DEFAULT_RULES) {
      const debits = rule.ruleDefinition.lines.filter(l => l.side === 'debit');
      const credits = rule.ruleDefinition.lines.filter(l => l.side === 'credit');
      expect(debits.length + credits.length).toBeGreaterThan(0);
      expect(debits.length).toBeGreaterThan(0);
      expect(credits.length).toBeGreaterThan(0);
    }
  });
});

describe('findSystemDefault', () => {
  it('should return invoice rule with tax condition', () => {
    const rule = findSystemDefault('invoice', { hasTax: 'true' });
    expect(rule).toBeDefined();
    expect(rule!.ruleName).toBe('invoice_default');
    expect(rule!.ruleDefinition.lines).toHaveLength(3);
  });

  it('should return invoice rule without tax', () => {
    const rule = findSystemDefault('invoice', { hasTax: 'false' });
    expect(rule).toBeDefined();
    expect(rule!.ruleName).toBe('invoice_no_tax');
    expect(rule!.ruleDefinition.lines).toHaveLength(2);
  });

  it('should return payment default rule', () => {
    const rule = findSystemDefault('payment');
    expect(rule).toBeDefined();
    expect(rule!.ruleName).toBe('payment_default');
  });

  it('should return expense rule for sales category', () => {
    const rule = findSystemDefault('expense', { hasTax: 'true', category: 'sales' });
    expect(rule).toBeDefined();
    expect(rule!.ruleName).toBe('expense_sales');
    // Should use gastos de venta (6102) instead of admin (6101)
    expect(rule!.ruleDefinition.lines[0]!.accountCode).toBe('6102');
  });

  it('should return undefined for unknown trigger event', () => {
    const rule = findSystemDefault('closing' as any);
    expect(rule).toBeUndefined();
  });
});
