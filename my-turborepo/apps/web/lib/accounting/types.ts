/**
 * Accounting Subsystem Types (Components 21-23)
 *
 * Shared type definitions for Chart of Accounts, Journal Entries,
 * and Financial Reports. Aligned with SAT Anexo 24 v1.3.
 */

import { z } from 'zod';

// ============================================
// Enums & Literal Types
// ============================================

export type AccountType =
  | 'asset'
  | 'liability'
  | 'equity'
  | 'revenue'
  | 'cost_of_sales'
  | 'expense'
  | 'financial_result'
  | 'other_income_expense'
  | 'order';

/** SAT naturaleza: Deudora or Acreedora */
export type Naturaleza = 'D' | 'A';

/** SAT poliza type per Anexo 24 */
export type PolizaType = 'ingreso' | 'egreso' | 'diario';

/** Journal entry lifecycle states */
export type EntryStatus = 'draft' | 'posted' | 'reversed';

/** Source of auto-generated journal entries */
export type SourceType =
  | 'invoice'
  | 'payment'
  | 'expense'
  | 'manual'
  | 'adjustment'
  | 'opening_balance'
  | 'closing';

/** Fiscal period status */
export type PeriodStatus = 'open' | 'closing' | 'closed' | 'reopened';

/** Filing mode per fiscal period */
export type FilingMode = 'required' | 'records_only' | 'disabled';

/** Exchange rate source hierarchy */
export type RateSource = 'cfdi' | 'banxico_fix' | 'dof' | 'manual';

/** Payment method for Anexo 24 polizas */
export type PaymentMethodType = 'cheque' | 'transferencia' | 'otro';

/** Third party type for AR/AP tracking */
export type ThirdPartyType = 'customer' | 'supplier' | 'employee';

// ============================================
// Domain Interfaces
// ============================================

export interface Account {
  id: string;
  organizationId: string;
  code: string;
  name: string;
  description?: string;
  satAgrupadorCode?: string;
  satNivel: number;
  satNaturaleza: Naturaleza;
  parentId?: string;
  materializedPath: string;
  isPostable: boolean;
  accountType: AccountType;
  normalBalance: string;
  currencyCode: string;
  requiresUuid: boolean;
  requiresThirdParty: boolean;
  isActive: boolean;
  isSystem: boolean;
  effectiveFrom: string;
  effectiveTo?: string;
  displayOrder?: number;
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
  updatedBy?: string;
  deletedAt?: string;
}

export interface AccountHierarchyNode extends Account {
  children: AccountHierarchyNode[];
  depth: number;
}

export interface AccountCodeAlias {
  id: string;
  organizationId: string;
  accountId: string;
  aliasCode: string;
  aliasSource?: string;
  isPrimaryDisplay: boolean;
  createdAt: string;
}

export interface JournalEntry {
  id: string;
  organizationId: string;
  entryNumber: string;
  fiscalPeriodId: string;
  entryDate: string;
  polizaType: PolizaType;
  description: string;
  status: EntryStatus;
  postedAt?: string;
  postedBy?: string;
  reversesEntryId?: string;
  reversedByEntryId?: string;
  sourceType?: SourceType;
  sourceId?: string;
  sourceUuidCfdi?: string;
  currencyCode: string;
  exchangeRate: number;
  totalDebit: number;
  totalCredit: number;
  lines: JournalEntryLine[];
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy?: string;
}

export interface JournalEntryLine {
  id: string;
  organizationId: string;
  journalEntryId: string;
  lineNumber: number;
  accountId: string;
  accountCode: string;
  debit: number;
  credit: number;
  description?: string;
  // Anexo 24 CompNal fields
  uuidCfdi?: string;
  rfcThirdParty?: string;
  montoTotalComp?: number;
  monedaComp?: string;
  tipoCambioComp?: number;
  // Anexo 24 payment nodes
  paymentMethod?: PaymentMethodType;
  bankAccount?: string;
  bankCode?: string;
  paymentReference?: string;
  paymentDate?: string;
  paymentBeneficiary?: string;
  paymentBeneficiaryRfc?: string;
  destBankAccount?: string;
  destBankCode?: string;
  // Third party
  thirdPartyId?: string;
  thirdPartyType?: ThirdPartyType;
  createdAt: string;
}

export interface FiscalPeriod {
  id: string;
  organizationId: string;
  year: number;
  month: number;
  period: number;
  periodType: string;
  startDate: string;
  endDate: string;
  status: PeriodStatus;
  filingMode: FilingMode;
  filingModeReason?: string;
  filingModeSetBy?: string;
  closedAt?: string;
  closedBy?: string;
  closeReason?: string;
  balanzaFiledAt?: string;
  catalogFiledAt?: string;
  catalogLastChangedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ExchangeRate {
  id: string;
  currencyFrom: string;
  currencyTo: string;
  rateDate: string;
  rate: number;
  source: RateSource;
  sourceReference?: string;
  organizationId?: string;
  createdAt: string;
  createdBy?: string;
}

export interface BalanceSnapshot {
  id: string;
  organizationId: string;
  accountId: string;
  fiscalPeriodId: string;
  openingBalance: number;
  totalDebit: number;
  totalCredit: number;
  closingBalance: number;
  generatedAt: string;
  isSealed: boolean;
  sealedAt?: string;
}

export interface PostingRule {
  id: string;
  organizationId: string;
  ruleName: string;
  triggerEvent: string;
  ruleDefinition: PostingRuleDefinition;
  isSystem: boolean;
  isActive: boolean;
  priority: number;
  createdAt: string;
  updatedAt: string;
}

export interface PostingRuleDefinition {
  lines: PostingRuleLine[];
  conditions?: Record<string, string>;
}

export interface PostingRuleLine {
  side: 'debit' | 'credit';
  accountCode: string;
  amountSource: string;
}

// ============================================
// Input Types
// ============================================

export interface CreateAccountInput {
  code: string;
  name: string;
  description?: string;
  satAgrupadorCode?: string;
  satNivel: number;
  satNaturaleza: Naturaleza;
  parentId?: string;
  accountType: AccountType;
  currencyCode?: string;
  isPostable?: boolean;
  requiresUuid?: boolean;
  requiresThirdParty?: boolean;
}

export interface UpdateAccountInput {
  name?: string;
  description?: string;
  satAgrupadorCode?: string;
  satNaturaleza?: Naturaleza;
  isPostable?: boolean;
  isActive?: boolean;
  requiresUuid?: boolean;
  requiresThirdParty?: boolean;
}

export interface CreateJournalEntryInput {
  entryDate: string;
  polizaType: PolizaType;
  description: string;
  sourceType?: SourceType;
  sourceId?: string;
  sourceUuidCfdi?: string;
  currencyCode?: string;
  exchangeRate?: number;
  lines: CreateJournalEntryLineInput[];
}

export interface CreateJournalEntryLineInput {
  accountCode: string;
  debit: number;
  credit: number;
  description?: string;
  uuidCfdi?: string;
  rfcThirdParty?: string;
  montoTotalComp?: number;
  monedaComp?: string;
  tipoCambioComp?: number;
  paymentMethod?: PaymentMethodType;
  bankAccount?: string;
  bankCode?: string;
  paymentReference?: string;
  thirdPartyId?: string;
  thirdPartyType?: ThirdPartyType;
}

export interface AccountFilters {
  accountType?: AccountType | AccountType[];
  isPostable?: boolean;
  isActive?: boolean;
  parentId?: string;
  search?: string;
  satAgrupadorCode?: string;
}

export interface EntryFilters {
  status?: EntryStatus | EntryStatus[];
  polizaType?: PolizaType | PolizaType[];
  sourceType?: SourceType | SourceType[];
  dateFrom?: string;
  dateTo?: string;
  accountCode?: string;
  search?: string;
}

export interface Pagination {
  page: number;
  limit: number;
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

// ============================================
// Balance & Report Types
// ============================================

export interface AccountBalance {
  accountId: string;
  accountCode: string;
  accountName: string;
  openingBalance: number;
  totalDebit: number;
  totalCredit: number;
  closingBalance: number;
}

export interface TrialBalanceRow {
  accountId: string;
  accountCode: string;
  accountName: string;
  satAgrupadorCode?: string;
  satNivel: number;
  satNaturaleza: Naturaleza;
  openingDebit: number;
  openingCredit: number;
  periodDebit: number;
  periodCredit: number;
  closingDebit: number;
  closingCredit: number;
}

export interface TrialBalanceReport {
  organizationId: string;
  fiscalPeriodId: string;
  year: number;
  month: number;
  rows: TrialBalanceRow[];
  totals: {
    openingDebit: number;
    openingCredit: number;
    periodDebit: number;
    periodCredit: number;
    closingDebit: number;
    closingCredit: number;
  };
  generatedAt: string;
}

export interface IncomeStatementRow {
  accountCode: string;
  accountName: string;
  accountType: AccountType;
  amount: number;
  depth: number;
}

export interface IncomeStatement {
  organizationId: string;
  periodFrom: string;
  periodTo: string;
  revenue: IncomeStatementRow[];
  costOfSales: IncomeStatementRow[];
  expenses: IncomeStatementRow[];
  financialResult: IncomeStatementRow[];
  otherIncomeExpense: IncomeStatementRow[];
  totalRevenue: number;
  totalCostOfSales: number;
  grossProfit: number;
  totalExpenses: number;
  totalFinancialResult: number;
  totalOtherIncomeExpense: number;
  netIncome: number;
  generatedAt: string;
}

export interface BalanceSheetRow {
  accountCode: string;
  accountName: string;
  accountType: AccountType;
  amount: number;
  depth: number;
}

export interface BalanceSheet {
  organizationId: string;
  asOfDate: string;
  assets: BalanceSheetRow[];
  liabilities: BalanceSheetRow[];
  equity: BalanceSheetRow[];
  totalAssets: number;
  totalLiabilities: number;
  totalEquity: number;
  generatedAt: string;
}

export interface PeriodCloseResult {
  periodId: string;
  snapshotsCreated: number;
  closedAt: string;
}

// ============================================
// SAT XML Types
// ============================================

export interface SatXmlMetadata {
  rfc: string;
  year: number;
  month: number;
  documentType: 'CT' | 'BN' | 'BC' | 'PL' | 'XF' | 'XC';
}

export interface ChartValidationResult {
  isValid: boolean;
  errors: ValidationError[];
}

export interface ValidationError {
  code: string;
  severity: 'error' | 'warning';
  message: string;
  details?: unknown;
}

export interface SuggestedAgrupador {
  code: string;
  name: string;
  similarity: number;
}

// ============================================
// Zod Schemas
// ============================================

/** Account code: 4-12 digits, dots stripped on input */
export const accountCodeSchema = z.string()
  .transform(s => s.replace(/\./g, ''))
  .pipe(
    z.string()
      .regex(/^[0-9]{4,12}$/, 'El código de cuenta debe tener entre 4 y 12 dígitos')
  );

export const accountAliasCodeSchema = z.string()
  .min(1).max(100)
  .regex(/^[A-Za-z0-9\-._]+$/, 'Código alias: solo alfanumérico con -, ., _');

export const satAgrupadorSchema = z.string()
  .regex(/^[0-9]+(\.[0-9]+)?$/, 'Formato inválido de código agrupador SAT');

export const naturalezaSchema = z.enum(['D', 'A']);

export const accountTypeSchema = z.enum([
  'asset', 'liability', 'equity', 'revenue',
  'cost_of_sales', 'expense', 'financial_result',
  'other_income_expense', 'order',
]);

export const polizaTypeSchema = z.enum(['ingreso', 'egreso', 'diario']);

export const entryStatusSchema = z.enum(['draft', 'posted', 'reversed']);

export const sourceTypeSchema = z.enum([
  'invoice', 'payment', 'expense', 'manual',
  'adjustment', 'opening_balance', 'closing',
]);

export const createAccountSchema = z.object({
  code: accountCodeSchema,
  name: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  satAgrupadorCode: satAgrupadorSchema.optional(),
  satNivel: z.number().int().min(1).max(6),
  satNaturaleza: naturalezaSchema,
  parentId: z.string().uuid().optional(),
  accountType: accountTypeSchema,
  currencyCode: z.string().length(3).default('MXN'),
  isPostable: z.boolean().default(true),
  requiresUuid: z.boolean().default(false),
  requiresThirdParty: z.boolean().default(false),
});

export const updateAccountSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(1000).optional(),
  satAgrupadorCode: satAgrupadorSchema.optional(),
  satNaturaleza: naturalezaSchema.optional(),
  isPostable: z.boolean().optional(),
  isActive: z.boolean().optional(),
  requiresUuid: z.boolean().optional(),
  requiresThirdParty: z.boolean().optional(),
});

export const journalLineSchema = z.object({
  accountCode: accountCodeSchema,
  debit: z.number().nonnegative().default(0),
  credit: z.number().nonnegative().default(0),
  description: z.string().max(500).optional(),
  uuidCfdi: z.string().max(36).optional(),
  rfcThirdParty: z.string().min(12).max(13).optional(),
  montoTotalComp: z.number().nonnegative().optional(),
  monedaComp: z.string().length(3).optional(),
  tipoCambioComp: z.number().positive().optional(),
  paymentMethod: z.enum(['cheque', 'transferencia', 'otro']).optional(),
  bankAccount: z.string().max(50).optional(),
  bankCode: z.string().max(10).optional(),
  paymentReference: z.string().max(100).optional(),
  thirdPartyId: z.string().uuid().optional(),
  thirdPartyType: z.enum(['customer', 'supplier', 'employee']).optional(),
}).refine(
  data => (data.debit > 0) !== (data.credit > 0),
  { message: 'Cada línea debe tener exactamente un cargo o un abono mayor a 0' }
);

export const createJournalEntrySchema = z.object({
  entryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  polizaType: polizaTypeSchema,
  description: z.string().min(1).max(1000),
  sourceType: sourceTypeSchema.optional(),
  sourceId: z.string().uuid().optional(),
  sourceUuidCfdi: z.string().max(36).optional(),
  currencyCode: z.string().length(3).default('MXN'),
  exchangeRate: z.number().positive().default(1.0),
  lines: z.array(journalLineSchema).min(2),
}).refine(
  data => {
    const totalDebit = data.lines.reduce((s, l) => s + (l.debit || 0), 0);
    const totalCredit = data.lines.reduce((s, l) => s + (l.credit || 0), 0);
    return Math.abs(totalDebit - totalCredit) < 0.01;
  },
  { message: 'El total de cargos debe ser igual al total de abonos' }
);
