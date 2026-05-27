/**
 * System Default Posting Rules (FIX-3.2)
 *
 * Default account mapping rules for common Mexican tax regimes.
 * These serve as fallback when no org-specific rules are defined.
 */

import type { PostingRuleDefinition, SourceType } from '../types';

export interface SystemRule {
  ruleName: string;
  triggerEvent: SourceType;
  regime?: string;
  ruleDefinition: PostingRuleDefinition;
}

/**
 * System default rules for Régimen 601 (General de Ley de Personas Morales)
 * and Régimen 626 (Simplificado de Confianza — RESICO PM)
 */
export const SYSTEM_DEFAULT_RULES: SystemRule[] = [
  // Invoice (ingreso) rules
  {
    ruleName: 'invoice_default',
    triggerEvent: 'invoice',
    ruleDefinition: {
      lines: [
        { side: 'debit', accountCode: '1104', amountSource: 'total' },
        { side: 'credit', accountCode: '4101', amountSource: 'subtotal' },
        { side: 'credit', accountCode: '2104', amountSource: 'tax' },
      ],
      conditions: { hasTax: 'true' },
    },
  },
  {
    ruleName: 'invoice_no_tax',
    triggerEvent: 'invoice',
    ruleDefinition: {
      lines: [
        { side: 'debit', accountCode: '1104', amountSource: 'total' },
        { side: 'credit', accountCode: '4101', amountSource: 'subtotal' },
      ],
      conditions: { hasTax: 'false' },
    },
  },

  // Payment rules
  {
    ruleName: 'payment_default',
    triggerEvent: 'payment',
    ruleDefinition: {
      lines: [
        { side: 'debit', accountCode: '1102', amountSource: 'amount' },
        { side: 'credit', accountCode: '1104', amountSource: 'amount' },
      ],
    },
  },

  // Expense rules
  {
    ruleName: 'expense_default',
    triggerEvent: 'expense',
    ruleDefinition: {
      lines: [
        { side: 'debit', accountCode: '6101', amountSource: 'subtotal' },
        { side: 'debit', accountCode: '1106', amountSource: 'tax' },
        { side: 'credit', accountCode: '2101', amountSource: 'total' },
      ],
      conditions: { hasTax: 'true' },
    },
  },
  {
    ruleName: 'expense_no_tax',
    triggerEvent: 'expense',
    ruleDefinition: {
      lines: [
        { side: 'debit', accountCode: '6101', amountSource: 'subtotal' },
        { side: 'credit', accountCode: '2101', amountSource: 'total' },
      ],
      conditions: { hasTax: 'false' },
    },
  },

  // Expense — sales category override
  {
    ruleName: 'expense_sales',
    triggerEvent: 'expense',
    ruleDefinition: {
      lines: [
        { side: 'debit', accountCode: '6102', amountSource: 'subtotal' },
        { side: 'debit', accountCode: '1106', amountSource: 'tax' },
        { side: 'credit', accountCode: '2101', amountSource: 'total' },
      ],
      conditions: { hasTax: 'true', category: 'sales' },
    },
  },
];

/**
 * Finds the best-matching system default rule for a trigger event.
 */
export function findSystemDefault(
  triggerEvent: SourceType,
  conditions: Record<string, string> = {}
): SystemRule | undefined {
  // Try to match with all conditions first, then fall back to fewer conditions
  const candidates = SYSTEM_DEFAULT_RULES.filter(r => r.triggerEvent === triggerEvent);

  // Score by matching conditions
  let bestMatch: SystemRule | undefined;
  let bestScore = -1;

  for (const candidate of candidates) {
    const ruleConditions = candidate.ruleDefinition.conditions ?? {};
    let score = 0;
    let allMatch = true;

    for (const [key, value] of Object.entries(ruleConditions)) {
      if (conditions[key] === value) {
        score++;
      } else {
        allMatch = false;
      }
    }

    // Only consider rules where all rule conditions are satisfied
    if (allMatch && score > bestScore) {
      bestScore = score;
      bestMatch = candidate;
    }
  }

  return bestMatch;
}
