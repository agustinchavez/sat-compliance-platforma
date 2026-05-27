/**
 * Financial Reports Module (Component 23)
 */

// Service
export {
  generateTrialBalance,
  generateIncomeStatement,
  generateBalanceSheet,
} from './service';

// Formatters
export {
  formatMXN,
  formatNumber,
  formatPercent,
  indentByDepth,
  formatAccountCodeDisplay,
  formatPeriodLabel,
  formatDateMX,
  truncate,
} from './formatters';

// Types
export type {
  ReportOptions,
  GeneralLedgerEntry,
  GeneralLedgerReport,
  CashFlowCategory,
  CashFlowItem,
  CashFlowStatement,
} from './types';
