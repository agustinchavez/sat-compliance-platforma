/**
 * @repo/sat-schemas — SAT Anexo 24 v1.3 XSD Validation
 *
 * Validates XML documents against official SAT contabilidad electrónica schemas.
 */

export { validateSatXml, validateSatXmlSync } from './validator.js';
export { loadXsd, hasXsdFiles, getXsdPath } from './loader.js';
export type { SatSchemaType, ValidationResult, ValidationError } from './types.js';
export { SCHEMA_XSD_FILES } from './types.js';
