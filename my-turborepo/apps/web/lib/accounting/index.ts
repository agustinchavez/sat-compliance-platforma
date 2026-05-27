/**
 * Accounting Subsystem (Components 21-23)
 *
 * Barrel exports for the accounting module:
 * - Chart of Accounts (Component 21)
 * - Journal Entries & Balances (Component 22)
 * - Financial Reports (Component 23)
 * - SAT XML Generation (Anexo 24 v1.3)
 */

// Shared types & schemas
export type {
  Account,
  AccountHierarchyNode,
  AccountCodeAlias,
  JournalEntry,
  JournalEntryLine,
  FiscalPeriod,
  ExchangeRate,
  BalanceSnapshot,
  PostingRule,
  PostingRuleDefinition,
  PostingRuleLine,
  CreateAccountInput,
  UpdateAccountInput,
  CreateJournalEntryInput,
  CreateJournalEntryLineInput,
  AccountFilters,
  EntryFilters,
  Pagination,
  PaginatedResult,
  AccountBalance,
  TrialBalanceRow,
  TrialBalanceReport,
  IncomeStatement,
  IncomeStatementRow,
  BalanceSheet,
  BalanceSheetRow,
  PeriodCloseResult,
  SatXmlMetadata,
  ChartValidationResult,
  ValidationError,
  SuggestedAgrupador,
  AccountType,
  Naturaleza,
  PolizaType,
  EntryStatus,
  SourceType,
  PeriodStatus,
  FilingMode,
  RateSource,
  PaymentMethodType,
  ThirdPartyType,
} from './types';

export {
  accountCodeSchema,
  createAccountSchema,
  updateAccountSchema,
  createJournalEntrySchema,
  journalLineSchema,
} from './types';

// Errors
export { AccountingError, isAccountingError } from './errors';
export type { AccountingErrorCode } from './errors';

// Constants
export {
  ACCOUNT_TYPE_RANGES,
  DEFAULT_NATURALEZA,
  SAT_AGRUPADOR_CATALOG,
  POLIZA_TYPE_LABELS,
  ENTRY_STATUS_LABELS,
  FILING_MODE_LABELS,
  PERIOD_STATUS_LABELS,
  SAT_XML_NAMESPACES,
  SAT_XML_SCHEMA_LOCATIONS,
  CHART_TEMPLATES,
} from './constants';
export type { ChartTemplate } from './constants';

// Chart of Accounts (Component 21)
export {
  createAccount,
  updateAccountById,
  getAccount,
  getAccountByCode,
  resolveAccountCode,
  listAccounts,
  deleteAccount,
  getAccountHierarchy,
  suggestAgrupadorCode,
  seedFromTemplate,
  validateChartForFiling,
} from './chart-of-accounts';

// Journal Entries (Component 22)
export {
  createDraftEntry,
  postEntry,
  createAndPostEntry,
  reverseEntry,
  getEntry,
  listEntries,
  deleteDraftEntry,
  findBySource,
  autoPostFromInvoice,
  autoPostFromPayment,
  autoPostFromExpense,
} from './journal-entries';

// Balances (Component 22)
export {
  calculateAccountBalance,
  calculateTrialBalance,
  closePeriod,
  reopenPeriod,
} from './balances/service';

// Financial Reports (Component 23)
export {
  generateTrialBalance,
  generateIncomeStatement,
  generateBalanceSheet,
  formatMXN,
  formatNumber,
  formatPercent,
  formatPeriodLabel,
} from './reports';

// SAT XML (Component 23)
export {
  generateCatalogXml,
  generateBalanceXml,
  generateJournalXml,
  generateAuxiliarFoliosXml,
  generateAuxiliarCuentasXml,
  generateSatFileName,
  escapeXml,
  validateXml,
} from './sat-xml';

// Validation utilities
export {
  normalizeAccountCode,
  isValidAccountCode,
  isBalanced,
  calculateTotals,
  computeBalance,
  splitBalanceToColumns,
  formatEntryNumber,
  toSatDecimal,
  buildMaterializedPath,
} from './validation';

// Mappers
export {
  mapRowToAccount,
  mapRowToJournalEntry,
  mapRowToJournalEntryLine,
  mapRowToFiscalPeriod,
  mapRowToExchangeRate,
  mapRowToBalanceSnapshot,
  mapRowToPostingRule,
  mapRowToAccountCodeAlias,
} from './mappers';
