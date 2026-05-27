/**
 * Journal Entries Module (Component 22)
 */

// Service
export {
  createDraftEntry,
  postEntry,
  createAndPostEntry,
  reverseEntry,
  getEntry,
  listEntries,
  deleteDraftEntry,
  findBySource,
} from './service';

// Auto-posting
export {
  autoPostFromInvoice,
  autoPostFromPayment,
  autoPostFromExpense,
  autoPostCogsFromInvoice,
} from './auto-posting';

// Validation
export {
  validateJournalEntry,
  validateForPosting,
  validateForReversal,
} from './validation';

// Repository (for advanced use)
export {
  getNextEntryNumber,
  getEntryById,
  findBySource as findBySourceRepo,
  getFiscalPeriod,
  getOrCreateFiscalPeriod,
  updateFiscalPeriod,
  getPostedEntriesForPeriod,
} from './repository';
