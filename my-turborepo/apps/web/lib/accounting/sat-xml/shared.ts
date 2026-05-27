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
 * Creates an XML attribute string.
 */
export function attr(name: string, value: string | number | undefined): string {
  if (value === undefined || value === null) return '';
  return ` ${name}="${escapeXml(String(value))}"`;
}

/**
 * Validates XML structure (stub - always returns valid).
 * TODO: Implement XSD validation when schemas are available.
 */
export function validateXml(_xml: string, _schemaType: string): { valid: boolean; errors: string[] } {
  return { valid: true, errors: [] };
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
