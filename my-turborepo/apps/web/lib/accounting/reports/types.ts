/**
 * Financial Reports Types (Component 23)
 *
 * Report-specific types beyond what's in the shared types.
 */

export interface ReportOptions {
  includeZeroBalance?: boolean;
  includeInactiveAccounts?: boolean;
  maxDepth?: number;
}

export interface GeneralLedgerEntry {
  entryDate: string;
  entryNumber: string;
  polizaType: string;
  description: string;
  debit: number;
  credit: number;
  runningBalance: number;
  uuidCfdi?: string;
}

export interface GeneralLedgerReport {
  accountId: string;
  accountCode: string;
  accountName: string;
  openingBalance: number;
  entries: GeneralLedgerEntry[];
  closingBalance: number;
}

export interface CashFlowCategory {
  name: string;
  items: CashFlowItem[];
  total: number;
}

export interface CashFlowItem {
  description: string;
  amount: number;
}

export interface CashFlowStatement {
  organizationId: string;
  periodFrom: string;
  periodTo: string;
  operating: CashFlowCategory;
  investing: CashFlowCategory;
  financing: CashFlowCategory;
  netCashChange: number;
  openingCash: number;
  closingCash: number;
  generatedAt: string;
}
