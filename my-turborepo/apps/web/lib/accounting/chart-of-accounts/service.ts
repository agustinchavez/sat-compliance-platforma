/**
 * Chart of Accounts Service (Component 21)
 *
 * CRUD operations, hierarchy management, SAT agrupador mapping,
 * and template seeding for the chart of accounts.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  Account,
  AccountHierarchyNode,
  CreateAccountInput,
  UpdateAccountInput,
  AccountFilters,
  Pagination,
  PaginatedResult,
  ChartValidationResult,
  SuggestedAgrupador,
  AccountType,
} from '../types';
import { createAccountSchema, updateAccountSchema } from '../types';
import { AccountingError } from '../errors';
import { normalizeAccountCode, buildMaterializedPath } from '../validation';
import { DEFAULT_NATURALEZA, ACCOUNT_TYPE_RANGES, SAT_AGRUPADOR_CATALOG } from '../constants';
import type { ChartTemplate } from '../constants';
import * as repo from './repository';
import { validateCreateAccount, validateUpdateAccount, validateDeleteAccount, validateChartForFiling } from './validation';
import { getMexicoPymeTemplate, getMexicoResicoTemplate, getMexicoGeneralTemplate } from './templates';

/**
 * Creates a new account in the chart of accounts.
 */
export async function createAccount(
  organizationId: string,
  input: CreateAccountInput,
  userId: string,
  supabase: SupabaseClient
): Promise<Account> {
  const parsed = createAccountSchema.parse(input);
  const code = normalizeAccountCode(parsed.code);

  const { parentAccount } = await validateCreateAccount(
    organizationId,
    code,
    parsed.parentId,
    parsed.accountType,
    parsed.satNivel,
    supabase
  );

  const materializedPath = buildMaterializedPath(
    parentAccount?.materializedPath ?? null,
    code
  );

  return repo.insertAccount(
    organizationId,
    {
      code,
      name: parsed.name,
      description: parsed.description,
      sat_agrupador_code: parsed.satAgrupadorCode,
      sat_nivel: parsed.satNivel,
      sat_naturaleza: parsed.satNaturaleza,
      parent_id: parsed.parentId,
      materialized_path: materializedPath,
      is_postable: parsed.isPostable ?? true,
      account_type: parsed.accountType,
      normal_balance: parsed.satNaturaleza,
      currency_code: parsed.currencyCode ?? 'MXN',
      requires_uuid: parsed.requiresUuid ?? false,
      requires_third_party: parsed.requiresThirdParty ?? false,
      created_by: userId,
    },
    supabase
  );
}

/**
 * Updates an existing account.
 */
export async function updateAccountById(
  accountId: string,
  input: UpdateAccountInput,
  userId: string,
  supabase: SupabaseClient
): Promise<Account> {
  const parsed = updateAccountSchema.parse(input);

  const account = await repo.getAccountById(accountId, supabase);
  if (!account) {
    throw new AccountingError('ACCOUNT_NOT_FOUND', 'Cuenta no encontrada', accountId);
  }

  await validateUpdateAccount(account, parsed as Record<string, unknown>, supabase);

  const updateData: Record<string, unknown> = { updated_by: userId };
  if (parsed.name !== undefined) updateData.name = parsed.name;
  if (parsed.description !== undefined) updateData.description = parsed.description;
  if (parsed.satAgrupadorCode !== undefined) updateData.sat_agrupador_code = parsed.satAgrupadorCode;
  if (parsed.satNaturaleza !== undefined) {
    updateData.sat_naturaleza = parsed.satNaturaleza;
    updateData.normal_balance = parsed.satNaturaleza;
  }
  if (parsed.isPostable !== undefined) updateData.is_postable = parsed.isPostable;
  if (parsed.isActive !== undefined) updateData.is_active = parsed.isActive;
  if (parsed.requiresUuid !== undefined) updateData.requires_uuid = parsed.requiresUuid;
  if (parsed.requiresThirdParty !== undefined) updateData.requires_third_party = parsed.requiresThirdParty;

  return repo.updateAccount(accountId, updateData, supabase);
}

/**
 * Retrieves an account by ID.
 */
export async function getAccount(
  accountId: string,
  supabase: SupabaseClient
): Promise<Account> {
  const account = await repo.getAccountById(accountId, supabase);
  if (!account) {
    throw new AccountingError('ACCOUNT_NOT_FOUND', 'Cuenta no encontrada', accountId);
  }
  return account;
}

/**
 * Retrieves an account by code within an organization.
 */
export async function getAccountByCode(
  organizationId: string,
  code: string,
  supabase: SupabaseClient
): Promise<Account> {
  const normalizedCode = normalizeAccountCode(code);
  const account = await repo.getAccountByCode(organizationId, normalizedCode, supabase);
  if (!account) {
    throw new AccountingError('ACCOUNT_NOT_FOUND', `Cuenta con código '${code}' no encontrada`);
  }
  return account;
}

/**
 * Resolves an account by canonical code or alias.
 */
export async function resolveAccountCode(
  organizationId: string,
  codeOrAlias: string,
  supabase: SupabaseClient
): Promise<Account> {
  const account = await repo.resolveAccountByCodeOrAlias(organizationId, codeOrAlias, supabase);
  if (!account) {
    throw new AccountingError('ACCOUNT_NOT_FOUND', `Cuenta con código o alias '${codeOrAlias}' no encontrada`);
  }
  return account;
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
  return repo.listAccounts(organizationId, filters, pagination, supabase);
}

/**
 * Soft-deletes an account.
 */
export async function deleteAccount(
  accountId: string,
  userId: string,
  supabase: SupabaseClient
): Promise<void> {
  const account = await repo.getAccountById(accountId, supabase);
  if (!account) {
    throw new AccountingError('ACCOUNT_NOT_FOUND', 'Cuenta no encontrada', accountId);
  }

  await validateDeleteAccount(account, supabase);
  await repo.softDeleteAccount(accountId, supabase);
}

/**
 * Gets the full account hierarchy as a tree.
 */
export async function getAccountHierarchy(
  organizationId: string,
  supabase: SupabaseClient,
  rootId?: string
): Promise<AccountHierarchyNode[]> {
  const flat = await repo.getAccountTreeFlat(organizationId, supabase, rootId);
  return repo.buildAccountTree(flat);
}

/**
 * Validates the chart for SAT filing compliance.
 */
export { validateChartForFiling } from './validation';

/**
 * Suggests a SAT agrupador code based on account name and type.
 * FIX-4.3: Tries AI-powered semantic search first, falls back to substring match.
 */
export async function suggestAgrupadorCode(
  accountName: string,
  accountType: AccountType,
  options?: { aiServiceUrl?: string }
): Promise<SuggestedAgrupador[]> {
  // Tier 1: Try AI-powered suggestion if service URL is configured
  const aiUrl = options?.aiServiceUrl ?? process.env.AI_SERVICE_URL;
  if (aiUrl) {
    try {
      const aiResults = await fetchAiAgrupadorSuggestions(aiUrl, accountName, accountType);
      if (aiResults.length > 0) return aiResults;
    } catch {
      // Fall through to substring match
    }
  }

  // Tier 2: Substring/keyword match (existing heuristic)
  return suggestAgrupadorBySubstring(accountName, accountType);
}

/**
 * Fetches AI-powered agrupador suggestions from the AI service.
 */
async function fetchAiAgrupadorSuggestions(
  baseUrl: string,
  accountName: string,
  accountType: AccountType
): Promise<SuggestedAgrupador[]> {
  const url = `${baseUrl}/sat/agrupador-search`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query: accountName,
      account_type: accountType,
      top_k: 5,
    }),
    signal: AbortSignal.timeout(3000),
  });

  if (!response.ok) return [];

  const data = await response.json();
  return (data.results ?? []).map((r: any) => ({
    code: r.code,
    name: r.name,
    similarity: r.similarity ?? r.score ?? 0.5,
  }));
}

/**
 * Substring-based agrupador suggestion (heuristic fallback).
 */
export function suggestAgrupadorBySubstring(
  accountName: string,
  accountType: AccountType
): SuggestedAgrupador[] {
  const range = ACCOUNT_TYPE_RANGES[accountType];
  if (!range) return [];

  const nameLower = accountName.toLowerCase();
  const suggestions = SAT_AGRUPADOR_CATALOG.filter(entry => {
    const intPart = parseInt(entry.code.split('.')[0] ?? '0', 10);
    if (intPart < range.min || intPart > range.max) return false;
    const entryNameLower = entry.name.toLowerCase();
    return entryNameLower.includes(nameLower) || nameLower.includes(entryNameLower);
  });

  return suggestions.slice(0, 5).map((entry, index) => ({
    code: entry.code,
    name: entry.name,
    similarity: 1 - index * 0.1,
  }));
}

/**
 * Seeds the chart of accounts from a template.
 */
export async function seedFromTemplate(
  organizationId: string,
  template: ChartTemplate,
  userId: string,
  supabase: SupabaseClient
): Promise<{ accountsCreated: number }> {
  // Check if org already has accounts
  const existingCount = await repo.countAccounts(organizationId, supabase);
  if (existingCount > 0) {
    throw new AccountingError(
      'INVALID_OPERATION',
      'La organización ya tiene cuentas. Elimine las cuentas existentes antes de usar una plantilla.'
    );
  }

  let templateAccounts: ReturnType<typeof getMexicoPymeTemplate>;
  switch (template) {
    case 'mexico-pyme':
      templateAccounts = getMexicoPymeTemplate();
      break;
    case 'mexico-resico':
      templateAccounts = getMexicoResicoTemplate();
      break;
    case 'mexico-general':
      templateAccounts = getMexicoGeneralTemplate();
      break;
    default:
      throw new AccountingError('INVALID_OPERATION', `Plantilla desconocida: ${template}`);
  }

  const accountsCreated = await repo.bulkInsertAccounts(
    organizationId,
    templateAccounts.map(a => ({
      ...a,
      created_by: userId,
    })),
    supabase
  );

  return { accountsCreated };
}
