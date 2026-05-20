/**
 * Expense Service (Component 20)
 *
 * Public API for expense management and reporting.
 */

// ============================================
// TYPES
// ============================================

export type {
  Expense,
  CreateExpenseInput,
  UpdateExpenseInput,
  ExpenseFilters,
  ExpensePagination,
  ExpenseListResult,
  DeductibilityAssessment,
  ExtractedExpenseData,
  ExpenseStatus,
} from './types';

export {
  ExpenseCategory,
  EXPENSE_CATEGORY_LABELS,
  createExpenseSchema,
  updateExpenseSchema,
} from './types';

// ============================================
// ERRORS
// ============================================

export {
  ExpenseError,
  isExpenseError,
} from './errors';

export type { ExpenseErrorCode } from './errors';

// ============================================
// CATEGORIES
// ============================================

export {
  suggestCategory,
  getCategoryRule,
  CATEGORY_DEDUCTIBILITY_RULES,
} from './categories';

export type { CategoryDeductibilityRule } from './categories';

// ============================================
// VALIDATION
// ============================================

export {
  validateCFDIStructure,
  checkRFCMatch,
  isGenericRFC,
  assessDeductibility,
  validateExpenseData,
} from './validation';

// ============================================
// OCR INTEGRATION
// ============================================

export {
  extractFromReceipt,
  extractFromCFDIXml,
  autoFillFromOCR,
} from './ocr-integration';

// ============================================
// SERVICE
// ============================================

export {
  createExpense,
  uploadReceipt,
  attachCFDI,
  updateExpense,
  categorizeExpense,
  deleteExpense,
  getExpense,
  listExpenses,
} from './service';

// ============================================
// REPORTS
// ============================================

export {
  generateExpenseReport,
  getExpensesByCategory,
  getDeductibleExpenses,
  getExpensesForExport,
} from './reports';

export type { ExpenseReportSummary } from './reports';
