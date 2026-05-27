/**
 * Journal Entries Service (Component 22)
 *
 * Create, post, reverse entries. Period enforcement, state machine.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  JournalEntry,
  CreateJournalEntryInput,
  EntryFilters,
  Pagination,
  PaginatedResult,
} from '../types';
import { createJournalEntrySchema } from '../types';
import { AccountingError } from '../errors';
import { calculateTotals, roundToTwoDecimals } from '../validation';
import * as repo from './repository';
import { validateJournalEntry, validateForPosting, validateForReversal } from './validation';

/**
 * Creates a new journal entry in draft status.
 */
export async function createDraftEntry(
  organizationId: string,
  input: CreateJournalEntryInput,
  userId: string,
  supabase: SupabaseClient
): Promise<JournalEntry> {
  const parsed = createJournalEntrySchema.parse(input);

  // Determine fiscal period
  const entryDate = new Date(parsed.entryDate);
  const year = entryDate.getFullYear();
  const month = entryDate.getMonth() + 1;

  const period = await repo.getOrCreateFiscalPeriod(organizationId, year, month, supabase);

  // Validate
  const { resolvedAccounts } = await validateJournalEntry(organizationId, parsed, period, supabase);

  // Calculate totals
  const { totalDebit, totalCredit } = calculateTotals(parsed.lines);

  // Entry number is allocated atomically by the RPC function — no pre-allocation needed.

  // Prepare lines with resolved account IDs
  const lines = parsed.lines.map((line, index) => {
    const account = resolvedAccounts.get(line.accountCode)!;
    return {
      line_number: index + 1,
      account_id: account.id,
      account_code: line.accountCode,
      debit: roundToTwoDecimals(line.debit || 0),
      credit: roundToTwoDecimals(line.credit || 0),
      description: line.description,
      uuid_cfdi: line.uuidCfdi,
      rfc_third_party: line.rfcThirdParty,
      monto_total_comp: line.montoTotalComp,
      moneda_comp: line.monedaComp,
      tipo_cambio_comp: line.tipoCambioComp,
      payment_method: line.paymentMethod,
      bank_account: line.bankAccount,
      bank_code: line.bankCode,
      payment_reference: line.paymentReference,
      third_party_id: line.thirdPartyId,
      third_party_type: line.thirdPartyType,
    };
  });

  return repo.insertJournalEntry(
    organizationId,
    {
      fiscal_period_id: period.id,
      entry_date: parsed.entryDate,
      poliza_type: parsed.polizaType,
      description: parsed.description,
      status: 'draft',
      source_type: parsed.sourceType,
      source_id: parsed.sourceId,
      source_uuid_cfdi: parsed.sourceUuidCfdi,
      currency_code: parsed.currencyCode ?? 'MXN',
      exchange_rate: parsed.exchangeRate ?? 1.0,
      total_debit: totalDebit,
      total_credit: totalCredit,
      created_by: userId,
    },
    lines,
    supabase
  );
}

/**
 * Posts a draft journal entry (transitions to 'posted').
 */
export async function postEntry(
  entryId: string,
  userId: string,
  supabase: SupabaseClient
): Promise<JournalEntry> {
  const entry = await repo.getEntryById(entryId, supabase);
  if (!entry) {
    throw new AccountingError('ENTRY_NOT_FOUND', 'Póliza no encontrada', entryId);
  }

  validateForPosting(entry);

  // Verify period is still open
  const period = await repo.getFiscalPeriod(entry.fiscalPeriodId, supabase);
  if (period && period.status === 'closed') {
    throw new AccountingError('PERIOD_CLOSED', 'No se puede contabilizar en un período cerrado', period.id);
  }

  return repo.updateEntry(
    entryId,
    {
      status: 'posted',
      is_posted: true,
      posted_at: new Date().toISOString(),
      posted_by: userId,
      updated_by: userId,
    },
    supabase
  );
}

/**
 * Creates and immediately posts a journal entry.
 */
export async function createAndPostEntry(
  organizationId: string,
  input: CreateJournalEntryInput,
  userId: string,
  supabase: SupabaseClient
): Promise<JournalEntry> {
  const draft = await createDraftEntry(organizationId, input, userId, supabase);
  return postEntry(draft.id, userId, supabase);
}

/**
 * Reverses a posted journal entry.
 * Creates a new entry with flipped debit/credit, links them.
 */
export async function reverseEntry(
  entryId: string,
  reversalDate: string,
  reason: string,
  userId: string,
  supabase: SupabaseClient
): Promise<JournalEntry> {
  const original = await repo.getEntryById(entryId, supabase);
  if (!original) {
    throw new AccountingError('ENTRY_NOT_FOUND', 'Póliza no encontrada', entryId);
  }

  validateForReversal(original);

  // FIX-4.8: Use Date objects for reliable comparison regardless of format
  if (new Date(reversalDate) < new Date(original.entryDate)) {
    throw new AccountingError(
      'INVALID_ENTRY_DATE',
      'La fecha de reversión debe ser igual o posterior a la fecha original'
    );
  }

  // Create reversal entry with flipped amounts
  const reversalLines = original.lines.map((line, index) => ({
    line_number: index + 1,
    account_id: line.accountId,
    account_code: line.accountCode,
    debit: line.credit,
    credit: line.debit,
    description: `Reversión: ${line.description || ''}`.trim(),
    uuid_cfdi: line.uuidCfdi,
    rfc_third_party: line.rfcThirdParty,
    monto_total_comp: line.montoTotalComp,
    moneda_comp: line.monedaComp,
    tipo_cambio_comp: line.tipoCambioComp,
    payment_method: line.paymentMethod,
    bank_account: line.bankAccount,
    bank_code: line.bankCode,
    payment_reference: line.paymentReference,
    third_party_id: line.thirdPartyId,
    third_party_type: line.thirdPartyType,
  }));

  const reversalDate_ = new Date(reversalDate);
  const year = reversalDate_.getFullYear();
  const month = reversalDate_.getMonth() + 1;

  const period = await repo.getOrCreateFiscalPeriod(original.organizationId, year, month, supabase);

  const reversal = await repo.insertJournalEntry(
    original.organizationId,
    {
      fiscal_period_id: period.id,
      entry_date: reversalDate,
      poliza_type: original.polizaType,
      description: `Reversión de ${original.entryNumber}: ${reason}`,
      status: 'posted',
      source_type: original.sourceType,
      source_id: original.sourceId,
      source_uuid_cfdi: original.sourceUuidCfdi,
      currency_code: original.currencyCode,
      exchange_rate: original.exchangeRate,
      total_debit: original.totalCredit,
      total_credit: original.totalDebit,
      created_by: userId,
    },
    reversalLines,
    supabase
  );

  // Mark original as reversed
  await repo.updateEntry(
    entryId,
    {
      status: 'reversed',
      reversed_by_entry_id: reversal.id,
      updated_by: userId,
    },
    supabase
  );

  return reversal;
}

/**
 * Gets a journal entry by ID.
 */
export async function getEntry(
  entryId: string,
  supabase: SupabaseClient
): Promise<JournalEntry> {
  const entry = await repo.getEntryById(entryId, supabase);
  if (!entry) {
    throw new AccountingError('ENTRY_NOT_FOUND', 'Póliza no encontrada', entryId);
  }
  return entry;
}

/**
 * Lists journal entries with filters and pagination.
 */
export async function listEntries(
  organizationId: string,
  filters: EntryFilters,
  pagination: Pagination,
  supabase: SupabaseClient
): Promise<PaginatedResult<JournalEntry>> {
  return repo.listEntries(organizationId, filters, pagination, supabase);
}

/**
 * Deletes a draft journal entry.
 */
export async function deleteDraftEntry(
  entryId: string,
  userId: string,
  supabase: SupabaseClient
): Promise<void> {
  const entry = await repo.getEntryById(entryId, supabase);
  if (!entry) {
    throw new AccountingError('ENTRY_NOT_FOUND', 'Póliza no encontrada', entryId);
  }
  if (entry.status !== 'draft') {
    throw new AccountingError('ENTRY_NOT_DRAFT', 'Solo se pueden eliminar pólizas en estado borrador', entryId);
  }

  await repo.deleteEntry(entryId, supabase);
}

/**
 * Finds an existing entry by source (idempotency check).
 */
export async function findBySource(
  organizationId: string,
  sourceType: string,
  sourceId: string,
  supabase: SupabaseClient
): Promise<JournalEntry | null> {
  return repo.findBySource(organizationId, sourceType, sourceId, supabase);
}
