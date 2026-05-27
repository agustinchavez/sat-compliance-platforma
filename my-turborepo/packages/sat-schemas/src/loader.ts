/**
 * XSD Schema Loader
 *
 * Loads XSD files from the bundled xsd/ directory.
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SCHEMA_XSD_FILES } from './types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/** Base directory for XSD files, relative to src/ */
const XSD_BASE_DIR = resolve(__dirname, '..', 'xsd', 'contabilidade', '1_3');

const xsdCache = new Map<string, string>();

/**
 * Loads an XSD schema file by schema type key.
 * Returns the XSD content as a string.
 * Caches in memory after first load.
 */
export function loadXsd(schemaType: string): string {
  const cached = xsdCache.get(schemaType);
  if (cached) return cached;

  const fileName = SCHEMA_XSD_FILES[schemaType];
  if (!fileName) {
    throw new Error(`Unknown SAT schema type: ${schemaType}`);
  }

  const filePath = resolve(XSD_BASE_DIR, fileName);
  if (!existsSync(filePath)) {
    throw new Error(
      `XSD file not found: ${filePath}. Run 'npm run download-xsd' in @repo/sat-schemas to fetch SAT XSD files.`
    );
  }

  const content = readFileSync(filePath, 'utf-8');
  xsdCache.set(schemaType, content);
  return content;
}

/**
 * Checks whether XSD files are available for validation.
 */
export function hasXsdFiles(): boolean {
  return existsSync(XSD_BASE_DIR) &&
    Object.values(SCHEMA_XSD_FILES).some(f => existsSync(resolve(XSD_BASE_DIR, f)));
}

/**
 * Returns the filesystem path to an XSD file.
 */
export function getXsdPath(schemaType: string): string {
  const fileName = SCHEMA_XSD_FILES[schemaType];
  if (!fileName) {
    throw new Error(`Unknown SAT schema type: ${schemaType}`);
  }
  return resolve(XSD_BASE_DIR, fileName);
}
