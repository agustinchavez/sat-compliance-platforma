/**
 * Posting Rules Engine (FIX-3.2)
 *
 * Resolves posting rules with 3-tier priority:
 * 1. Org-specific rules (from database)
 * 2. System-tier rules (from database, is_system=true)
 * 3. Hardcoded system defaults (fallback)
 *
 * Then builds journal entry line inputs from the resolved rule.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { CreateJournalEntryLineInput, PostingRuleDefinition, SourceType } from '../types';
import { findOrgRule, findSystemRule } from './repository';
import { findSystemDefault } from './system-defaults';

export interface PostingContext {
  organizationId: string;
  triggerEvent: SourceType;
  amounts: Record<string, number>;
  conditions?: Record<string, string>;
  /** Optional per-line metadata (e.g., uuidCfdi) */
  lineMetadata?: Partial<CreateJournalEntryLineInput>;
}

export interface ResolvedPostingResult {
  lines: CreateJournalEntryLineInput[];
  ruleSource: 'org' | 'system_db' | 'system_default';
  ruleName: string;
}

/**
 * Resolves a posting rule and builds journal entry lines.
 *
 * Priority:
 * 1. Org-tier: Organization-specific rule from DB
 * 2. System-tier DB: System rules stored in DB
 * 3. System defaults: Hardcoded fallback rules
 */
export async function resolveAndBuildLines(
  context: PostingContext,
  supabase: SupabaseClient
): Promise<ResolvedPostingResult> {
  const { organizationId, triggerEvent, amounts, conditions = {}, lineMetadata } = context;

  // Tier 1: Org-specific rule
  const orgRule = await findOrgRule(organizationId, triggerEvent, supabase);
  if (orgRule) {
    return {
      lines: buildLinesFromDefinition(orgRule.ruleDefinition, amounts, lineMetadata),
      ruleSource: 'org',
      ruleName: orgRule.ruleName,
    };
  }

  // Tier 2: System-tier from DB
  const systemDbRule = await findSystemRule(triggerEvent, supabase);
  if (systemDbRule) {
    return {
      lines: buildLinesFromDefinition(systemDbRule.ruleDefinition, amounts, lineMetadata),
      ruleSource: 'system_db',
      ruleName: systemDbRule.ruleName,
    };
  }

  // Tier 3: Hardcoded system defaults
  const systemDefault = findSystemDefault(triggerEvent, conditions);
  if (systemDefault) {
    return {
      lines: buildLinesFromDefinition(systemDefault.ruleDefinition, amounts, lineMetadata),
      ruleSource: 'system_default',
      ruleName: systemDefault.ruleName,
    };
  }

  // No rule found — fall back to empty (caller should handle)
  return {
    lines: [],
    ruleSource: 'system_default',
    ruleName: 'none',
  };
}

/**
 * Builds CreateJournalEntryLineInput[] from a PostingRuleDefinition.
 */
function buildLinesFromDefinition(
  definition: PostingRuleDefinition,
  amounts: Record<string, number>,
  metadata?: Partial<CreateJournalEntryLineInput>
): CreateJournalEntryLineInput[] {
  return definition.lines
    .map(lineDef => {
      const amount = amounts[lineDef.amountSource] ?? 0;
      if (amount === 0) return null;

      const line: CreateJournalEntryLineInput = {
        accountCode: lineDef.accountCode,
        debit: lineDef.side === 'debit' ? amount : 0,
        credit: lineDef.side === 'credit' ? amount : 0,
        ...metadata,
      };

      return line;
    })
    .filter((line): line is CreateJournalEntryLineInput => line !== null);
}
