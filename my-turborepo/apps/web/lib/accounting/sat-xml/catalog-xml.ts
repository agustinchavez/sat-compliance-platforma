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
 *   <catalogocuentas:Ctas CodAgworrup="..." NumCta="..." Desc="..." SubCtaDe="..." Nivel="..." Natur="..."/>
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

  for (const account of accounts) {
    if (!account.isActive || account.deletedAt) continue;

    let accountLine = '  <catalogocuentas:Ctas';
    accountLine += attr('CodAgrup', account.satAgrupadorCode ?? '');
    accountLine += attr('NumCta', account.code);
    accountLine += attr('Desc', account.name);

    // SubCtaDe: parent account code (if any)
    if (account.parentId) {
      const parent = accounts.find(a => a.id === account.parentId);
      if (parent) {
        accountLine += attr('SubCtaDe', parent.code);
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
