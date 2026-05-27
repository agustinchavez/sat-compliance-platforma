/**
 * Chart of Accounts Repository (Component 21)
 *
 * All database operations for the chart_of_accounts table.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  Account,
  AccountHierarchyNode,
  AccountCodeAlias,
  AccountFilters,
  Pagination,
  PaginatedResult,
} from '../types';
import { mapRowToAccount, mapRowToAccountCodeAlias } from '../mappers';
import { AccountingError } from '../errors';

/**
 * Inserts a new account row.
 */
export async function insertAccount(
  organizationId: string,
  data: {
    code: string;
    name: string;
    description?: string;
    sat_agrupador_code?: string;
    sat_nivel: number;
    sat_naturaleza: string;
    parent_id?: string;
    materialized_path: string;
    is_postable: boolean;
    account_type: string;
    normal_balance: string;
    currency_code: string;
    requires_uuid: boolean;
    requires_third_party: boolean;
    created_by: string;
  },
  supabase: SupabaseClient
): Promise<Account> {
  const { data: row, error } = await supabase
    .from('chart_of_accounts')
    .insert({
      organization_id: organizationId,
      code: data.code,
      name: data.name,
      description: data.description,
      sat_agrupador_code: data.sat_agrupador_code,
      sat_nivel: data.sat_nivel,
      sat_naturaleza: data.sat_naturaleza,
      parent_id: data.parent_id,
      materialized_path: data.materialized_path,
      is_postable: data.is_postable,
      account_type: data.account_type,
      normal_balance: data.normal_balance,
      currency_code: data.currency_code,
      requires_uuid: data.requires_uuid,
      requires_third_party: data.requires_third_party,
      created_by: data.created_by,
    })
    .select()
    .single();

  if (error) {
    if (error.code === '23505') {
      throw new AccountingError('ACCOUNT_CODE_EXISTS', `El código de cuenta '${data.code}' ya existe`, undefined, error as any);
    }
    throw new AccountingError('VALIDATION_ERROR', `Error al crear cuenta: ${error.message}`, undefined, error as any);
  }

  return mapRowToAccount(row);
}

/**
 * Fetches a single account by ID.
 */
export async function getAccountById(
  accountId: string,
  supabase: SupabaseClient
): Promise<Account | null> {
  const { data: row, error } = await supabase
    .from('chart_of_accounts')
    .select('*')
    .eq('id', accountId)
    .is('deleted_at', null)
    .maybeSingle();

  if (error) throw new AccountingError('VALIDATION_ERROR', error.message);
  if (!row) return null;
  return mapRowToAccount(row);
}

/**
 * Fetches a single account by code within an organization.
 */
export async function getAccountByCode(
  organizationId: string,
  code: string,
  supabase: SupabaseClient
): Promise<Account | null> {
  const { data: row, error } = await supabase
    .from('chart_of_accounts')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('code', code)
    .is('deleted_at', null)
    .maybeSingle();

  if (error) throw new AccountingError('VALIDATION_ERROR', error.message);
  if (!row) return null;
  return mapRowToAccount(row);
}

/**
 * Resolves an account by code or alias.
 */
export async function resolveAccountByCodeOrAlias(
  organizationId: string,
  codeOrAlias: string,
  supabase: SupabaseClient
): Promise<Account | null> {
  // Try canonical code first
  const byCode = await getAccountByCode(organizationId, codeOrAlias, supabase);
  if (byCode) return byCode;

  // Try alias
  const { data: aliasRow } = await supabase
    .from('account_code_aliases')
    .select('account_id')
    .eq('organization_id', organizationId)
    .eq('alias_code', codeOrAlias)
    .maybeSingle();

  if (aliasRow) {
    return getAccountById(aliasRow.account_id, supabase);
  }

  return null;
}

/**
 * Updates an account.
 */
export async function updateAccount(
  accountId: string,
  data: Record<string, unknown>,
  supabase: SupabaseClient
): Promise<Account> {
  const { data: row, error } = await supabase
    .from('chart_of_accounts')
    .update({ ...data, updated_at: new Date().toISOString() })
    .eq('id', accountId)
    .is('deleted_at', null)
    .select()
    .single();

  if (error) throw new AccountingError('VALIDATION_ERROR', `Error al actualizar cuenta: ${error.message}`, accountId, error as any);
  return mapRowToAccount(row);
}

/**
 * Soft-deletes an account.
 */
export async function softDeleteAccount(
  accountId: string,
  supabase: SupabaseClient
): Promise<void> {
  const { error } = await supabase
    .from('chart_of_accounts')
    .update({
      deleted_at: new Date().toISOString(),
      is_active: false,
    })
    .eq('id', accountId);

  if (error) throw new AccountingError('VALIDATION_ERROR', `Error al eliminar cuenta: ${error.message}`, accountId, error as any);
}

/**
 * Lists accounts with filters and pagination.
 */
export async function listAccounts(
  organizationId: string,
  filters: AccountFilters,
  pagination: Pagination,
  supabase: SupabaseClient
): Promise<PaginatedResult<Account>> {
  let query = supabase
    .from('chart_of_accounts')
    .select('*', { count: 'exact' })
    .eq('organization_id', organizationId)
    .is('deleted_at', null);

  if (filters.accountType) {
    if (Array.isArray(filters.accountType)) {
      query = query.in('account_type', filters.accountType);
    } else {
      query = query.eq('account_type', filters.accountType);
    }
  }

  if (filters.isPostable !== undefined) {
    query = query.eq('is_postable', filters.isPostable);
  }

  if (filters.isActive !== undefined) {
    query = query.eq('is_active', filters.isActive);
  }

  if (filters.parentId) {
    query = query.eq('parent_id', filters.parentId);
  }

  if (filters.search) {
    query = query.or(`name.ilike.%${filters.search}%,code.ilike.%${filters.search}%`);
  }

  if (filters.satAgrupadorCode) {
    query = query.eq('sat_agrupador_code', filters.satAgrupadorCode);
  }

  const offset = (pagination.page - 1) * pagination.limit;
  query = query
    .order('materialized_path', { ascending: true })
    .range(offset, offset + pagination.limit - 1);

  const { data: rows, error, count } = await query;

  if (error) throw new AccountingError('VALIDATION_ERROR', error.message);

  const total = count ?? 0;
  return {
    data: (rows || []).map(mapRowToAccount),
    total,
    page: pagination.page,
    limit: pagination.limit,
    totalPages: Math.ceil(total / pagination.limit),
  };
}

/**
 * Gets account hierarchy as a flat list ordered by materialized_path.
 */
export async function getAccountTreeFlat(
  organizationId: string,
  supabase: SupabaseClient,
  rootId?: string
): Promise<Account[]> {
  let query = supabase
    .from('chart_of_accounts')
    .select('*')
    .eq('organization_id', organizationId)
    .is('deleted_at', null)
    .order('materialized_path', { ascending: true });

  if (rootId) {
    // Get the root's materialized_path first, then filter by prefix
    const root = await getAccountById(rootId, supabase);
    if (root) {
      query = query.like('materialized_path', `${root.materializedPath}%`);
    }
  }

  const { data: rows, error } = await query;
  if (error) throw new AccountingError('VALIDATION_ERROR', error.message);
  return (rows || []).map(mapRowToAccount);
}

/**
 * Builds a tree structure from flat accounts.
 */
export function buildAccountTree(accounts: Account[]): AccountHierarchyNode[] {
  const map = new Map<string, AccountHierarchyNode>();
  const roots: AccountHierarchyNode[] = [];

  // First pass: create nodes
  for (const account of accounts) {
    map.set(account.id, { ...account, children: [], depth: 0 });
  }

  // Second pass: link parents
  for (const account of accounts) {
    const node = map.get(account.id)!;
    if (account.parentId && map.has(account.parentId)) {
      const parent = map.get(account.parentId)!;
      node.depth = parent.depth + 1;
      parent.children.push(node);
    } else {
      roots.push(node);
    }
  }

  return roots;
}

/**
 * Checks if an account has any posted journal entry lines.
 */
export async function hasPostedEntries(
  accountId: string,
  supabase: SupabaseClient
): Promise<boolean> {
  const { count, error } = await supabase
    .from('journal_entry_lines')
    .select('id', { count: 'exact', head: true })
    .eq('account_id', accountId);

  if (error) return false;
  return (count ?? 0) > 0;
}

/**
 * Checks if an account has active children.
 */
export async function hasActiveChildren(
  accountId: string,
  supabase: SupabaseClient
): Promise<boolean> {
  const { count, error } = await supabase
    .from('chart_of_accounts')
    .select('id', { count: 'exact', head: true })
    .eq('parent_id', accountId)
    .is('deleted_at', null);

  if (error) return false;
  return (count ?? 0) > 0;
}

/**
 * Counts accounts in an organization.
 */
export async function countAccounts(
  organizationId: string,
  supabase: SupabaseClient
): Promise<number> {
  const { count, error } = await supabase
    .from('chart_of_accounts')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', organizationId)
    .is('deleted_at', null);

  if (error) return 0;
  return count ?? 0;
}

/**
 * Bulk inserts accounts (for template seeding).
 */
export async function bulkInsertAccounts(
  organizationId: string,
  accounts: Array<{
    code: string;
    name: string;
    description?: string;
    sat_agrupador_code?: string;
    sat_nivel: number;
    sat_naturaleza: string;
    parent_id?: string;
    materialized_path: string;
    is_postable: boolean;
    account_type: string;
    normal_balance: string;
    currency_code: string;
    created_by: string;
  }>,
  supabase: SupabaseClient
): Promise<number> {
  const rows = accounts.map(a => ({
    organization_id: organizationId,
    code: a.code,
    name: a.name,
    description: a.description,
    sat_agrupador_code: a.sat_agrupador_code,
    sat_nivel: a.sat_nivel,
    sat_naturaleza: a.sat_naturaleza,
    parent_id: a.parent_id,
    materialized_path: a.materialized_path,
    is_postable: a.is_postable,
    account_type: a.account_type,
    normal_balance: a.normal_balance,
    currency_code: a.currency_code,
    created_by: a.created_by,
  }));

  const { error } = await supabase
    .from('chart_of_accounts')
    .insert(rows);

  if (error) throw new AccountingError('VALIDATION_ERROR', `Error en inserción masiva: ${error.message}`);
  return rows.length;
}

/**
 * Gets all accounts that are missing SAT agrupador codes.
 */
export async function getAccountsMissingAgrupador(
  organizationId: string,
  supabase: SupabaseClient
): Promise<Account[]> {
  const { data: rows, error } = await supabase
    .from('chart_of_accounts')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('is_postable', true)
    .is('sat_agrupador_code', null)
    .is('deleted_at', null);

  if (error) throw new AccountingError('VALIDATION_ERROR', error.message);
  return (rows || []).map(mapRowToAccount);
}
