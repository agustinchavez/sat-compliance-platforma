/**
 * Posting Rules Repository (FIX-3.2)
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { PostingRule, PostingRuleDefinition } from '../types';

function mapRow(row: any): PostingRule {
  return {
    id: row.id,
    organizationId: row.organization_id,
    ruleName: row.rule_name,
    triggerEvent: row.trigger_event,
    ruleDefinition: row.rule_definition as PostingRuleDefinition,
    isSystem: row.is_system,
    isActive: row.is_active,
    priority: row.priority,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Find an org-specific posting rule for a trigger event.
 */
export async function findOrgRule(
  organizationId: string,
  triggerEvent: string,
  supabase: SupabaseClient
): Promise<PostingRule | null> {
  const { data, error } = await supabase
    .from('posting_rules')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('trigger_event', triggerEvent)
    .eq('is_active', true)
    .eq('is_system', false)
    .order('priority', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  return mapRow(data);
}

/**
 * Find a system-tier posting rule for a trigger event.
 */
export async function findSystemRule(
  triggerEvent: string,
  supabase: SupabaseClient
): Promise<PostingRule | null> {
  const { data, error } = await supabase
    .from('posting_rules')
    .select('*')
    .eq('trigger_event', triggerEvent)
    .eq('is_active', true)
    .eq('is_system', true)
    .order('priority', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  return mapRow(data);
}
