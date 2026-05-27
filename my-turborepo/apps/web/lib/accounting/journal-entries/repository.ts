/**
 * Journal Entries Repository (Component 22)
 *
 * All database operations for journal_entries and journal_entry_lines.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  JournalEntry,
  JournalEntryLine,
  EntryFilters,
  Pagination,
  PaginatedResult,
  FiscalPeriod,
} from '../types';
import { mapRowToJournalEntry, mapRowToJournalEntryLine, mapRowToFiscalPeriod } from '../mappers';
import { AccountingError } from '../errors';
import { formatEntryNumber } from '../validation';

/**
 * Gets the next entry number for an organization in a given year.
 */
export async function getNextEntryNumber(
  organizationId: string,
  year: number,
  supabase: SupabaseClient
): Promise<string> {
  const prefix = `${year}-`;
  const { data, error } = await supabase
    .from('journal_entries')
    .select('entry_number')
    .eq('organization_id', organizationId)
    .like('entry_number', `${prefix}%`)
    .order('entry_number', { ascending: false })
    .limit(1);

  if (error) throw new AccountingError('VALIDATION_ERROR', error.message);

  let nextSeq = 1;
  if (data && data.length > 0) {
    const lastNum = data[0].entry_number;
    const lastSeq = parseInt(lastNum.replace(prefix, ''), 10);
    nextSeq = lastSeq + 1;
  }

  return formatEntryNumber(year, nextSeq);
}

/**
 * Creates a journal entry with its lines in a single operation.
 */
export async function insertJournalEntry(
  organizationId: string,
  data: {
    entry_number: string;
    fiscal_period_id: string;
    entry_date: string;
    poliza_type: string;
    description: string;
    status: string;
    source_type?: string;
    source_id?: string;
    source_uuid_cfdi?: string;
    currency_code: string;
    exchange_rate: number;
    total_debit: number;
    total_credit: number;
    created_by: string;
  },
  lines: Array<{
    line_number: number;
    account_id: string;
    account_code: string;
    debit: number;
    credit: number;
    description?: string;
    uuid_cfdi?: string;
    rfc_third_party?: string;
    monto_total_comp?: number;
    moneda_comp?: string;
    tipo_cambio_comp?: number;
    payment_method?: string;
    bank_account?: string;
    bank_code?: string;
    payment_reference?: string;
    third_party_id?: string;
    third_party_type?: string;
  }>,
  supabase: SupabaseClient
): Promise<JournalEntry> {
  // Insert entry header
  const { data: entryRow, error: entryError } = await supabase
    .from('journal_entries')
    .insert({
      organization_id: organizationId,
      ...data,
    })
    .select()
    .single();

  if (entryError) {
    throw new AccountingError('VALIDATION_ERROR', `Error al crear póliza: ${entryError.message}`);
  }

  // Insert lines
  const lineRows = lines.map(line => ({
    organization_id: organizationId,
    journal_entry_id: entryRow.id,
    ...line,
  }));

  const { data: insertedLines, error: linesError } = await supabase
    .from('journal_entry_lines')
    .insert(lineRows)
    .select();

  if (linesError) {
    throw new AccountingError('VALIDATION_ERROR', `Error al crear líneas: ${linesError.message}`);
  }

  const mappedLines = (insertedLines || []).map(mapRowToJournalEntryLine);
  return mapRowToJournalEntry(entryRow, mappedLines);
}

/**
 * Gets a journal entry by ID with its lines.
 */
export async function getEntryById(
  entryId: string,
  supabase: SupabaseClient
): Promise<JournalEntry | null> {
  const { data: entryRow, error } = await supabase
    .from('journal_entries')
    .select('*')
    .eq('id', entryId)
    .maybeSingle();

  if (error) throw new AccountingError('VALIDATION_ERROR', error.message);
  if (!entryRow) return null;

  const { data: lineRows } = await supabase
    .from('journal_entry_lines')
    .select('*')
    .eq('journal_entry_id', entryId)
    .order('line_number', { ascending: true });

  const lines = (lineRows || []).map(mapRowToJournalEntryLine);
  return mapRowToJournalEntry(entryRow, lines);
}

/**
 * Updates a journal entry header.
 */
export async function updateEntry(
  entryId: string,
  data: Record<string, unknown>,
  supabase: SupabaseClient
): Promise<JournalEntry> {
  const { data: entryRow, error } = await supabase
    .from('journal_entries')
    .update({ ...data, updated_at: new Date().toISOString() })
    .eq('id', entryId)
    .select()
    .single();

  if (error) throw new AccountingError('VALIDATION_ERROR', `Error al actualizar póliza: ${error.message}`, entryId);

  const { data: lineRows } = await supabase
    .from('journal_entry_lines')
    .select('*')
    .eq('journal_entry_id', entryId)
    .order('line_number', { ascending: true });

  const lines = (lineRows || []).map(mapRowToJournalEntryLine);
  return mapRowToJournalEntry(entryRow, lines);
}

/**
 * Deletes a draft journal entry and its lines.
 */
export async function deleteEntry(
  entryId: string,
  supabase: SupabaseClient
): Promise<void> {
  const { error } = await supabase
    .from('journal_entries')
    .delete()
    .eq('id', entryId);

  if (error) throw new AccountingError('VALIDATION_ERROR', `Error al eliminar póliza: ${error.message}`, entryId);
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
  let query = supabase
    .from('journal_entries')
    .select('*', { count: 'exact' })
    .eq('organization_id', organizationId);

  if (filters.status) {
    if (Array.isArray(filters.status)) {
      query = query.in('status', filters.status);
    } else {
      query = query.eq('status', filters.status);
    }
  }

  if (filters.polizaType) {
    if (Array.isArray(filters.polizaType)) {
      query = query.in('poliza_type', filters.polizaType);
    } else {
      query = query.eq('poliza_type', filters.polizaType);
    }
  }

  if (filters.dateFrom) {
    query = query.gte('entry_date', filters.dateFrom);
  }

  if (filters.dateTo) {
    query = query.lte('entry_date', filters.dateTo);
  }

  if (filters.search) {
    query = query.ilike('description', `%${filters.search}%`);
  }

  const offset = (pagination.page - 1) * pagination.limit;
  query = query
    .order('entry_date', { ascending: false })
    .order('entry_number', { ascending: false })
    .range(offset, offset + pagination.limit - 1);

  const { data: rows, error, count } = await query;
  if (error) throw new AccountingError('VALIDATION_ERROR', error.message);

  const total = count ?? 0;
  const entries = (rows || []).map(row => mapRowToJournalEntry(row));

  return {
    data: entries,
    total,
    page: pagination.page,
    limit: pagination.limit,
    totalPages: Math.ceil(total / pagination.limit),
  };
}

/**
 * Finds a journal entry by source type and source ID (idempotency check).
 */
export async function findBySource(
  organizationId: string,
  sourceType: string,
  sourceId: string,
  supabase: SupabaseClient
): Promise<JournalEntry | null> {
  const { data: row, error } = await supabase
    .from('journal_entries')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('source_type', sourceType)
    .eq('source_id', sourceId)
    .maybeSingle();

  if (error) throw new AccountingError('VALIDATION_ERROR', error.message);
  if (!row) return null;
  return mapRowToJournalEntry(row);
}

/**
 * Gets a fiscal period by ID.
 */
export async function getFiscalPeriod(
  periodId: string,
  supabase: SupabaseClient
): Promise<FiscalPeriod | null> {
  const { data: row, error } = await supabase
    .from('tax_periods')
    .select('*')
    .eq('id', periodId)
    .maybeSingle();

  if (error) throw new AccountingError('VALIDATION_ERROR', error.message);
  if (!row) return null;
  return mapRowToFiscalPeriod(row);
}

/**
 * Gets or creates a fiscal period for a given org, year, and month.
 */
export async function getOrCreateFiscalPeriod(
  organizationId: string,
  year: number,
  month: number,
  supabase: SupabaseClient
): Promise<FiscalPeriod> {
  // Try to find existing
  const { data: existing } = await supabase
    .from('tax_periods')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('year', year)
    .eq('period', month)
    .maybeSingle();

  if (existing) return mapRowToFiscalPeriod(existing);

  // Create new period
  const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
  const endDate = new Date(year, month, 0).toISOString().split('T')[0]; // Last day of month

  const { data: created, error } = await supabase
    .from('tax_periods')
    .insert({
      organization_id: organizationId,
      period_type: 'monthly',
      year,
      period: month,
      month,
      start_date: startDate,
      end_date: endDate,
      status: 'open',
      filing_mode: 'records_only',
    })
    .select()
    .single();

  if (error) throw new AccountingError('VALIDATION_ERROR', `Error al crear período: ${error.message}`);
  return mapRowToFiscalPeriod(created);
}

/**
 * Updates a fiscal period.
 */
export async function updateFiscalPeriod(
  periodId: string,
  data: Record<string, unknown>,
  supabase: SupabaseClient
): Promise<FiscalPeriod> {
  const { data: row, error } = await supabase
    .from('tax_periods')
    .update({ ...data, updated_at: new Date().toISOString() })
    .eq('id', periodId)
    .select()
    .single();

  if (error) throw new AccountingError('VALIDATION_ERROR', `Error al actualizar período: ${error.message}`, periodId);
  return mapRowToFiscalPeriod(row);
}

/**
 * Gets all posted entries for a period.
 */
export async function getPostedEntriesForPeriod(
  organizationId: string,
  periodId: string,
  supabase: SupabaseClient
): Promise<JournalEntry[]> {
  const { data: rows, error } = await supabase
    .from('journal_entries')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('fiscal_period_id', periodId)
    .eq('status', 'posted')
    .order('entry_number', { ascending: true });

  if (error) throw new AccountingError('VALIDATION_ERROR', error.message);
  return (rows || []).map(row => mapRowToJournalEntry(row));
}
