/**
 * Chart of Accounts Module (Component 21)
 */

// Service
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
} from './service';

// Validation
export { validateChartForFiling } from './validation';

// Repository (for advanced use)
export {
  getAccountById,
  getAccountByCode as getAccountByCodeRepo,
  resolveAccountByCodeOrAlias,
  getAccountTreeFlat,
  buildAccountTree,
  hasPostedEntries,
  hasActiveChildren,
} from './repository';

// Templates
export {
  getMexicoPymeTemplate,
  getMexicoResicoTemplate,
  getMexicoGeneralTemplate,
} from './templates';
