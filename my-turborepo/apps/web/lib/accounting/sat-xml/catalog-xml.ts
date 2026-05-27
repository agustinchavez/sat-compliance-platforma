/**
 * SAT Catalog XML Generation (CT - Catálogo de Cuentas)
 *
 * Generates the XML document per Anexo 24 v1.3 CatalogoCuentas schema.
 */

import type { Account } from '../types';
import { XML_DECLARATION, getCatalogNamespaces, attr, escapeXml, toSatDecimal } from './shared';

export interface CatalogXmlInput {
  rfc: string;
  month: number;
  year: number;
  accounts: Account[];
}

/**
 * Generates the CT (Catálogo de Cuentas) XML.
 *
 * Structure per Anexo 24 v1.3:
 * <catalogocuentas:Catalogo Version="1.3" RFC="..." Mes="..." Anio="...">
 *   <catalogocuentas:Ctas CodAgrup="..." NumCta="..." Desc="..." SubCtaDe="..." Nivel="..." Natur="..."/>
 *   ...
 * </catalogocuentas:Catalogo>
 */
export function generateCatalogXml(input: CatalogXmlInput): string {
  const { rfc, month, year, accounts } = input;
  const mes = String(month).padStart(2, '0');
  const anio = String(year);

  const lines: string[] = [XML_DECLARATION];

  lines.push(
    `<catalogocuentas:Catalogo ${getCatalogNamespaces()}` +
    attr('Version', '1.3') +
    attr('RFC', rfc) +
    attr('Mes', mes) +
    attr('Anio', anio) +
    '>'
  );

  // FIX-4.5: Pre-build Map for O(1) parent lookups instead of O(N) find()
  const accountCodeMap = new Map<string, string>();
  for (const a of accounts) {
    accountCodeMap.set(a.id, a.code);
  }

  for (const account of accounts) {
    if (!account.isActive || account.deletedAt) continue;

    let accountLine = '  <catalogocuentas:Ctas';

    // FIX-2.1: CodAgrup must not be emitted as empty string.
    // Required for Nivel 1-2 (cuentas de mayor / subcuentas de primer nivel).
    // Optional for Nivel >= 3 — omit attribute entirely.
    if (account.satAgrupadorCode && account.satAgrupadorCode.trim() !== '') {
      accountLine += attr('CodAgrup', account.satAgrupadorCode);
    } else if (account.satNivel <= 2) {
      throw new Error(`Anexo 24: account ${account.code} (Nivel ${account.satNivel}) requires CodAgrup`);
    }
    // For Nivel >= 3 accounts, CodAgrup is optional — omit attribute entirely.

    accountLine += attr('NumCta', account.code);
    accountLine += attr('Desc', account.name);

    // SubCtaDe: parent account code (if any)
    if (account.parentId) {
      const parentCode = accountCodeMap.get(account.parentId);
      if (parentCode) {
        accountLine += attr('SubCtaDe', parentCode);
      }
    }

    accountLine += attr('Nivel', String(account.satNivel));
    accountLine += attr('Natur', account.satNaturaleza);
    accountLine += '/>';

    lines.push(accountLine);
  }

  lines.push('</catalogocuentas:Catalogo>');

  return lines.join('\n');
}
