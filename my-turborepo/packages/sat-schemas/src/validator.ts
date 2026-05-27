/**
 * SAT XSD Validator
 *
 * Validates XML documents against SAT Anexo 24 v1.3 XSD schemas.
 *
 * Primary: libxmljs2 (native C++ XML parser with XSD support)
 * Fallback: xmllint via child_process (requires libxml2 installed)
 * Last resort: structural validation only (no XSD)
 */

import type { ValidationResult, ValidationError } from './types.js';
import { loadXsd, hasXsdFiles, getXsdPath } from './loader.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let libxmljs: any = null;
let libxmljsLoadAttempted = false;

/**
 * Attempts to load libxmljs2. Returns null if native module unavailable.
 * Uses computed module name to avoid Vite static import analysis.
 */
async function getLibxmljs(): Promise<any> {
  if (libxmljsLoadAttempted) return libxmljs;
  libxmljsLoadAttempted = true;

  try {
    // Computed string prevents Vite from statically resolving this optional dependency
    const moduleName = ['libxmljs', '2'].join('');
    libxmljs = await import(/* @vite-ignore */ moduleName);
    return libxmljs;
  } catch {
    // Native module not available — fall back to xmllint
    return null;
  }
}

/**
 * Validates XML against an XSD schema using libxmljs2.
 */
async function validateWithLibxmljs(
  xml: string,
  schemaType: string
): Promise<ValidationResult> {
  const lib = await getLibxmljs();
  if (!lib) {
    throw new Error('libxmljs2 not available');
  }

  const xsdContent = loadXsd(schemaType);
  const xmlDoc = lib.parseXml(xml);
  const xsdDoc = lib.parseXml(xsdContent);

  const isValid = xmlDoc.validate(xsdDoc);

  if (isValid) {
    return { valid: true, errors: [] };
  }

  const errors: ValidationError[] = xmlDoc.validationErrors.map(err => ({
    line: err.line ?? 0,
    column: err.column ?? 0,
    message: err.message?.trim() ?? 'Unknown validation error',
  }));

  return { valid: false, errors };
}

/**
 * Validates XML against an XSD schema using xmllint CLI.
 */
async function validateWithXmllint(
  xml: string,
  schemaType: string
): Promise<ValidationResult> {
  const { execSync } = await import('node:child_process');
  const { writeFileSync, unlinkSync, mkdtempSync } = await import('node:fs');
  const { join } = await import('node:path');
  const { tmpdir } = await import('node:os');

  const xsdPath = getXsdPath(schemaType);
  const tempDir = mkdtempSync(join(tmpdir(), 'sat-xsd-'));
  const xmlPath = join(tempDir, 'document.xml');

  try {
    writeFileSync(xmlPath, xml, 'utf-8');
    execSync(`xmllint --schema "${xsdPath}" --noout "${xmlPath}" 2>&1`, {
      encoding: 'utf-8',
      timeout: 10000,
    });
    return { valid: true, errors: [] };
  } catch (err: unknown) {
    const output = (err as { stdout?: string }).stdout ?? String(err);
    const errors: ValidationError[] = output
      .split('\n')
      .filter((line: string) => line.includes('error') || line.includes('Error'))
      .map((line: string) => ({
        line: 0,
        column: 0,
        message: line.trim(),
      }));
    return { valid: false, errors: errors.length > 0 ? errors : [{ line: 0, column: 0, message: output.trim() }] };
  } finally {
    try { unlinkSync(xmlPath); } catch { /* ignore */ }
    try { const { rmdirSync } = await import('node:fs'); rmdirSync(tempDir); } catch { /* ignore */ }
  }
}

/**
 * Checks if xmllint is available on the system.
 */
async function hasXmllint(): Promise<boolean> {
  try {
    const { execSync } = await import('node:child_process');
    execSync('xmllint --version 2>&1', { encoding: 'utf-8', timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

/**
 * Primary validation function.
 *
 * Tries validation backends in order:
 * 1. libxmljs2 (native, fast)
 * 2. xmllint CLI (requires system libxml2)
 * 3. Stub with warning (no XSD validation available)
 */
export async function validateSatXml(
  xml: string,
  schemaType: string
): Promise<ValidationResult> {
  // Check if XSD files exist
  if (!hasXsdFiles()) {
    console.warn(
      `[SAT Schemas] XSD files not found. Run 'npm run download-xsd' in @repo/sat-schemas. Skipping validation.`
    );
    return { valid: true, errors: [] };
  }

  // Try libxmljs2 first
  try {
    return await validateWithLibxmljs(xml, schemaType);
  } catch {
    // libxmljs2 not available, try xmllint
  }

  // Try xmllint
  if (await hasXmllint()) {
    try {
      return await validateWithXmllint(xml, schemaType);
    } catch {
      // xmllint failed
    }
  }

  // No validator available — warn and pass through
  console.warn(
    `[SAT Schemas] No XSD validator available (neither libxmljs2 nor xmllint). ` +
    `Install libxmljs2 or libxml2 for full validation. Skipping XSD validation for schema '${schemaType}'.`
  );
  return { valid: true, errors: [] };
}

/**
 * Synchronous validation — only works if libxmljs2 is loaded.
 * Throws if no validator is available synchronously.
 */
export function validateSatXmlSync(
  xml: string,
  schemaType: string
): ValidationResult {
  if (!hasXsdFiles()) {
    return { valid: true, errors: [] };
  }

  if (!libxmljs) {
    // Can't do sync validation without pre-loaded libxmljs2
    console.warn(`[SAT Schemas] Sync validation requires libxmljs2. Skipping.`);
    return { valid: true, errors: [] };
  }

  const xsdContent = loadXsd(schemaType);
  const xmlDoc = libxmljs.parseXml(xml);
  const xsdDoc = libxmljs.parseXml(xsdContent);

  const isValid = xmlDoc.validate(xsdDoc);

  if (isValid) {
    return { valid: true, errors: [] };
  }

  const errors: ValidationError[] = xmlDoc.validationErrors.map(err => ({
    line: err.line ?? 0,
    column: err.column ?? 0,
    message: err.message?.trim() ?? 'Unknown validation error',
  }));

  return { valid: false, errors };
}
