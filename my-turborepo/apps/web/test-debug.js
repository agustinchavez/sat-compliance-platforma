import { validateExpenseData } from './lib/expenses/validation.js';
import { ExpenseCategory } from './lib/expenses/types.js';

const errors = validateExpenseData({
  vendorName: 'Test Vendor',
  description: 'Test expense',
  category: ExpenseCategory.SERVICIOS_PROFESIONALES,
  amount: 1000,
  total: 1000,
  expenseDate: 'invalid-date',
});

console.log('Errors:', JSON.stringify(errors, null, 2));
