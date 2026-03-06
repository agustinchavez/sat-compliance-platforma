/**
 * Cadena Original Generator
 *
 * Generates the cadena original for CFDI XML documents by applying
 * the official SAT XSLT transformation.
 *
 * The cadena original is a pipe-delimited string that is then signed
 * to create the CFDI digital seal.
 *
 * Note: SaxonJS requires XSLT to be compiled to SEF format, and the
 * SAT XSLT imports multiple files. For production use, we provide
 * both a SaxonJS path (when SEF is available) and an xsltproc fallback.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import type { CadenaOriginalResult } from './types.js';

// Path handling for ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Bundled XSLT file path
const XSLT_PATH = path.join(__dirname, 'xslt', 'cadenaoriginal_4_0.xslt');

// ============================================
// MAIN FUNCTIONS
// ============================================

/**
 * Generate the cadena original for a CFDI XML document.
 *
 * @param xml - The CFDI XML string (unsigned)
 * @returns CadenaOriginalResult with cadena and SHA-256 hash
 * @throws Error if XSLT transformation fails
 */
export async function generateCadenaOriginal(xml: string): Promise<CadenaOriginalResult> {
  // Try xsltproc first (most reliable for SAT XSLT)
  let cadena: string;

  try {
    cadena = await transformWithXsltproc(xml);
  } catch (xsltprocError) {
    // If xsltproc is not available, throw a helpful error
    throw new Error(
      `XSLT transformation failed. Ensure xsltproc is installed or the XSLT files are available.\n` +
        `Error: ${xsltprocError instanceof Error ? xsltprocError.message : 'Unknown error'}\n` +
        `XSLT path: ${XSLT_PATH}`
    );
  }

  // Validate cadena format
  if (!validateCadena(cadena)) {
    throw new Error(`Invalid cadena original format: ${cadena.substring(0, 100)}...`);
  }

  // Compute SHA-256 hash
  const sha256 = computeSHA256(cadena);

  return { cadena, sha256 };
}

/**
 * Transform XML using xsltproc command-line tool.
 * This is the most reliable method for SAT XSLT which uses imports.
 */
async function transformWithXsltproc(xml: string): Promise<string> {
  // Check if XSLT file exists
  if (!fs.existsSync(XSLT_PATH)) {
    throw new Error(`XSLT file not found: ${XSLT_PATH}. Run 'npm run download-xslt' first.`);
  }

  // Create temp file for XML input
  const tempDir = fs.mkdtempSync(path.join(process.cwd(), 'cfdi-'));
  const xmlPath = path.join(tempDir, 'input.xml');

  try {
    // Write XML to temp file
    fs.writeFileSync(xmlPath, xml, 'utf-8');

    // Run xsltproc
    const result = execSync(`xsltproc "${XSLT_PATH}" "${xmlPath}"`, {
      encoding: 'utf-8',
      timeout: 30000, // 30 second timeout
      maxBuffer: 10 * 1024 * 1024, // 10MB buffer
    });

    return result.trim();
  } finally {
    // Cleanup temp files
    try {
      fs.unlinkSync(xmlPath);
      fs.rmdirSync(tempDir);
    } catch {
      // Ignore cleanup errors
    }
  }
}

// ============================================
// HASH FUNCTIONS
// ============================================

/**
 * Compute SHA-256 hash of a UTF-8 string.
 * Returns hex digest (lowercase).
 * Used by Component 14 to sign the cadena original.
 */
export function computeSHA256(text: string): string {
  return crypto.createHash('sha256').update(text, 'utf8').digest('hex');
}

// ============================================
// VALIDATION FUNCTIONS
// ============================================

/**
 * Quick sanity check on the cadena original format.
 * Must start with '||' and end with '||'.
 * Must contain at least one '|' separator.
 */
export function validateCadena(cadena: string): boolean {
  if (!cadena || typeof cadena !== 'string') {
    return false;
  }

  const trimmed = cadena.trim();

  // Must start and end with ||
  if (!trimmed.startsWith('||') || !trimmed.endsWith('||')) {
    return false;
  }

  // Must have content between the markers
  const content = trimmed.slice(2, -2);
  if (content.length === 0) {
    return false;
  }

  // Must contain pipe separators
  if (!content.includes('|')) {
    return false;
  }

  return true;
}

/**
 * Check if the XSLT file is available for transformations.
 */
export function isXSLTAvailable(): boolean {
  return fs.existsSync(XSLT_PATH);
}

/**
 * Check if xsltproc is available on the system.
 */
export function isXsltprocAvailable(): boolean {
  try {
    execSync('xsltproc --version', { encoding: 'utf-8', stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Get the path to the bundled XSLT file.
 */
export function getXSLTPath(): string {
  return XSLT_PATH;
}
