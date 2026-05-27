/**
 * SAT XML Generation Module (Component 23)
 */

export { generateCatalogXml, type CatalogXmlInput } from './catalog-xml';
export { generateBalanceXml, type BalanceXmlInput } from './balance-xml';
export { generateJournalXml, type JournalXmlInput } from './journal-xml';
export {
  generateAuxiliarFoliosXml,
  generateAuxiliarCuentasXml,
  type AuxiliarFoliosInput,
  type AuxiliarCuentasInput,
} from './auxiliary-xml';
export {
  escapeXml,
  attr,
  validateXml,
  toSatDecimal,
  generateSatFileName,
} from './shared';
