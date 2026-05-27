/**
 * Accounting Subsystem Mappers (Components 21-23)
 *
 * DB row ↔ TypeScript mappers (snake_case → camelCase).
 */

import type {
  Account,
  JournalEntry,
  JournalEntryLine,
  FiscalPeriod,
  ExchangeRate,
  BalanceSnapshot,
  PostingRule,
  AccountCodeAlias,
} from './types';

export function mapRowToAccount(row: any): Account {
  return {
    id: row.id,
    organizationId: row.organization_id,
    code: row.code,
    name: row.name,
    description: row.description ?? undefined,
    satAgrupadorCode: row.sat_agrupador_code ?? undefined,
    satNivel: row.sat_nivel,
    satNaturaleza: row.sat_naturaleza,
    parentId: row.parent_id ?? undefined,
    materializedPath: row.materialized_path ?? row.code,
    isPostable: row.is_postable ?? true,
    accountType: row.account_type_v2 ?? row.account_type,
    normalBalance: row.normal_balance ?? row.sat_naturaleza,
    currencyCode: row.currency_code ?? 'MXN',
    requiresUuid: row.requires_uuid ?? false,
    requiresThirdParty: row.requires_third_party ?? false,
    isActive: row.is_active ?? true,
    isSystem: row.is_system ?? false,
    effectiveFrom: row.effective_from,
    effectiveTo: row.effective_to ?? undefined,
    displayOrder: row.display_order ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    createdBy: row.created_by ?? undefined,
    updatedBy: row.updated_by ?? undefined,
    deletedAt: row.deleted_at ?? undefined,
  };
}

export function mapRowToJournalEntry(row: any, lines: JournalEntryLine[] = []): JournalEntry {
  return {
    id: row.id,
    organizationId: row.organization_id,
    entryNumber: row.entry_number,
    fiscalPeriodId: row.fiscal_period_id,
    entryDate: row.entry_date,
    polizaType: row.poliza_type,
    description: row.description,
    status: row.status ?? (row.is_posted ? 'posted' : 'draft'),
    postedAt: row.posted_at ?? undefined,
    postedBy: row.posted_by ?? undefined,
    reversesEntryId: row.reverses_entry_id ?? undefined,
    reversedByEntryId: row.reversed_by_entry_id ?? undefined,
    sourceType: row.source_type ?? undefined,
    sourceId: row.source_id ?? undefined,
    sourceUuidCfdi: row.source_uuid_cfdi ?? undefined,
    currencyCode: row.currency_code ?? 'MXN',
    exchangeRate: parseFloat(row.exchange_rate ?? '1'),
    totalDebit: parseFloat(row.total_debit ?? '0'),
    totalCredit: parseFloat(row.total_credit ?? '0'),
    lines,
    createdAt: row.created_at,
    createdBy: row.created_by,
    updatedAt: row.updated_at,
    updatedBy: row.updated_by ?? undefined,
  };
}

export function mapRowToJournalEntryLine(row: any): JournalEntryLine {
  return {
    id: row.id,
    organizationId: row.organization_id,
    journalEntryId: row.journal_entry_id,
    lineNumber: row.line_number,
    accountId: row.account_id,
    accountCode: row.account_code ?? '',
    debit: parseFloat(row.debit ?? '0'),
    credit: parseFloat(row.credit ?? '0'),
    description: row.description ?? undefined,
    uuidCfdi: row.uuid_cfdi ?? undefined,
    rfcThirdParty: row.rfc_third_party ?? undefined,
    montoTotalComp: row.monto_total_comp ? parseFloat(row.monto_total_comp) : undefined,
    monedaComp: row.moneda_comp ?? undefined,
    tipoCambioComp: row.tipo_cambio_comp ? parseFloat(row.tipo_cambio_comp) : undefined,
    paymentMethod: row.payment_method ?? undefined,
    bankAccount: row.bank_account ?? undefined,
    bankCode: row.bank_code ?? undefined,
    paymentReference: row.payment_reference ?? undefined,
    thirdPartyId: row.third_party_id ?? undefined,
    thirdPartyType: row.third_party_type ?? undefined,
    createdAt: row.created_at,
  };
}

export function mapRowToFiscalPeriod(row: any): FiscalPeriod {
  return {
    id: row.id,
    organizationId: row.organization_id,
    year: row.year,
    month: row.month ?? row.period,
    period: row.period,
    periodType: row.period_type,
    startDate: row.start_date,
    endDate: row.end_date,
    status: row.status ?? 'open',
    filingMode: row.filing_mode ?? 'records_only',
    filingModeReason: row.filing_mode_reason ?? undefined,
    filingModeSetBy: row.filing_mode_set_by ?? undefined,
    closedAt: row.closed_at ?? undefined,
    closedBy: row.closed_by ?? undefined,
    closeReason: row.close_reason ?? undefined,
    balanzaFiledAt: row.balanza_filed_at ?? undefined,
    catalogFiledAt: row.catalog_filed_at ?? undefined,
    catalogLastChangedAt: row.catalog_last_changed_at ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapRowToExchangeRate(row: any): ExchangeRate {
  return {
    id: row.id,
    currencyFrom: row.currency_from,
    currencyTo: row.currency_to,
    rateDate: row.rate_date,
    rate: parseFloat(row.rate),
    source: row.source,
    sourceReference: row.source_reference ?? undefined,
    organizationId: row.organization_id ?? undefined,
    createdAt: row.created_at,
    createdBy: row.created_by ?? undefined,
  };
}

export function mapRowToBalanceSnapshot(row: any): BalanceSnapshot {
  return {
    id: row.id,
    organizationId: row.organization_id,
    accountId: row.account_id,
    fiscalPeriodId: row.fiscal_period_id,
    openingBalance: parseFloat(row.opening_balance ?? '0'),
    totalDebit: parseFloat(row.total_debit ?? '0'),
    totalCredit: parseFloat(row.total_credit ?? '0'),
    closingBalance: parseFloat(row.closing_balance ?? '0'),
    generatedAt: row.generated_at,
    isSealed: row.is_sealed ?? false,
    sealedAt: row.sealed_at ?? undefined,
  };
}

export function mapRowToPostingRule(row: any): PostingRule {
  return {
    id: row.id,
    organizationId: row.organization_id,
    ruleName: row.rule_name,
    triggerEvent: row.trigger_event,
    ruleDefinition: row.rule_definition,
    isSystem: row.is_system ?? false,
    isActive: row.is_active ?? true,
    priority: row.priority ?? 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapRowToAccountCodeAlias(row: any): AccountCodeAlias {
  return {
    id: row.id,
    organizationId: row.organization_id,
    accountId: row.account_id,
    aliasCode: row.alias_code,
    aliasSource: row.alias_source ?? undefined,
    isPrimaryDisplay: row.is_primary_display ?? false,
    createdAt: row.created_at,
  };
}
