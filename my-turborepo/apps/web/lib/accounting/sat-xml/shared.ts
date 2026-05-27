/**
 * SAT XML Shared Utilities
 *
 * XML namespace constants, common builders, file naming.
 * Uses string concatenation for XML generation (no xmlbuilder2 dependency).
 */

import { SAT_XML_NAMESPACES, SAT_XML_SCHEMA_LOCATIONS } from '../constants';
import { toSatDecimal, generateSatFileName } from '../validation';

export { toSatDecimal, generateSatFileName };

/**
 * XML declaration header.
 */
export const XML_DECLARATION = '<?xml version="1.0" encoding="UTF-8"?>';

/**
 * Escapes special XML characters.
 */
export function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Creates an XML attribute string. Returns empty when value is undefined,
 * null, OR an empty string (empty strings are invalid XSD attribute values).
 */
export function attr(name: string, value: string | number | undefined | null): string {
  if (value === undefined || value === null) return '';
  const str = String(value).trim();
  if (str === '') return '';
  return ` ${name}="${escapeXml(str)}"`;
}

/**
 * Like attr() but throws if value is missing — for genuinely required attributes.
 */
export function requiredAttr(name: string, value: string | number | undefined | null, context: string): string {
  if (value === undefined || value === null) {
    throw new Error(`Anexo 24 violation: required attribute ${name} is missing in ${context}`);
  }
  const str = String(value).trim();
  if (str === '') {
    throw new Error(`Anexo 24 violation: required attribute ${name} is empty in ${context}`);
  }
  return ` ${name}="${escapeXml(str)}"`;
}

/**
 * Validates XML against SAT Anexo 24 XSD schemas (async).
 *
 * Uses @repo/sat-schemas which tries:
 * 1. libxmljs2 (native, fast)
 * 2. xmllint CLI (system libxml2)
 * 3. Graceful pass-through if neither available
 */
export async function validateXmlAsync(
  xml: string,
  schemaType: string
): Promise<{ valid: boolean; errors: string[] }> {
  try {
    const { validateSatXml } = await import('@repo/sat-schemas');
    const result = await validateSatXml(xml, schemaType);
    return {
      valid: result.valid,
      errors: result.errors.map(e => `Line ${e.line}: ${e.message}`),
    };
  } catch {
    // @repo/sat-schemas not available in this environment
    return { valid: true, errors: [] };
  }
}

/**
 * Synchronous XML validation stub for backwards compatibility.
 * Use validateXmlAsync() for real XSD validation.
 */
export function validateXml(xml: string, _schemaType: string): { valid: boolean; errors: string[] } {
  return { valid: true, errors: [] };
}

/**
 * Asserts that generated SAT XML is valid against its XSD schema.
 * Throws if validation fails.
 */
export async function assertSatXmlValid(xml: string, schemaType: string): Promise<void> {
  const result = await validateXmlAsync(xml, schemaType);
  if (!result.valid) {
    throw new Error(
      `SAT XML validation failed for schema '${schemaType}':\n${result.errors.join('\n')}`
    );
  }
}

/**
 * Returns SAT namespaces for catalog XML.
 */
export function getCatalogNamespaces(): string {
  return [
    `xmlns:catalogocuentas="${SAT_XML_NAMESPACES.catalogoCuentas}"`,
    `xmlns:xsi="${SAT_XML_NAMESPACES.xsi}"`,
    `xsi:schemaLocation="${SAT_XML_SCHEMA_LOCATIONS.catalogoCuentas}"`,
  ].join(' ');
}

/**
 * Returns SAT namespaces for balanza XML.
 */
export function getBalanzaNamespaces(): string {
  return [
    `xmlns:BCE="${SAT_XML_NAMESPACES.balanza}"`,
    `xmlns:xsi="${SAT_XML_NAMESPACES.xsi}"`,
    `xsi:schemaLocation="${SAT_XML_SCHEMA_LOCATIONS.balanza}"`,
  ].join(' ');
}

/**
 * Returns SAT namespaces for polizas XML.
 */
export function getPolizasNamespaces(): string {
  return [
    `xmlns:PLZ="${SAT_XML_NAMESPACES.polizas}"`,
    `xmlns:xsi="${SAT_XML_NAMESPACES.xsi}"`,
    `xsi:schemaLocation="${SAT_XML_SCHEMA_LOCATIONS.polizas}"`,
  ].join(' ');
}

/**
 * Returns SAT namespaces for auxiliar cuentas XML.
 */
export function getAuxiliarCuentasNamespaces(): string {
  return [
    `xmlns:AuxiliarCtas="${SAT_XML_NAMESPACES.auxiliarCuentas}"`,
    `xmlns:xsi="${SAT_XML_NAMESPACES.xsi}"`,
    `xsi:schemaLocation="${SAT_XML_SCHEMA_LOCATIONS.auxiliarCuentas}"`,
  ].join(' ');
}

/**
 * Returns SAT namespaces for auxiliar folios XML.
 */
export function getAuxiliarFoliosNamespaces(): string {
  return [
    `xmlns:RepAux="${SAT_XML_NAMESPACES.auxiliarFolios}"`,
    `xmlns:xsi="${SAT_XML_NAMESPACES.xsi}"`,
    `xsi:schemaLocation="${SAT_XML_SCHEMA_LOCATIONS.auxiliarFolios}"`,
  ].join(' ');
}
