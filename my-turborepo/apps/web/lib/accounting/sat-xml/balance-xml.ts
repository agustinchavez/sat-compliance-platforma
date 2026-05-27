/**
 * SAT Balance XML Generation (BN/BC - Balanza de Comprobación)
 *
 * Generates the XML document per Anexo 24 v1.3 BalanzaComprobacion schema.
 */

import type { TrialBalanceRow } from '../types';
import { XML_DECLARATION, getBalanzaNamespaces, attr, toSatDecimal } from './shared';

export interface BalanceXmlInput {
  rfc: string;
  month: number;
  year: number;
  /** 'N' for normal, 'C' for complementaria */
  tipo: 'N' | 'C';
  rows: TrialBalanceRow[];
  /** Required only for tipo='C': date of last modified balance */
  fechaModBal?: string;
}

/**
 * Generates the BN/BC (Balanza de Comprobación) XML.
 *
 * Structure per Anexo 24 v1.3:
 * <BCE:Balanza Version="1.3" RFC="..." Mes="..." Anio="..." TipoEnvio="N|C">
 *   <BCE:Ctas NumCta="..." SaldoIni="..." Debe="..." Haber="..." SaldoFin="..."/>
 *   ...
 * </BCE:Balanza>
 */
export function generateBalanceXml(input: BalanceXmlInput): string {
  const { rfc, month, year, tipo, rows, fechaModBal } = input;
  const mes = String(month).padStart(2, '0');
  const anio = String(year);

  const lines: string[] = [XML_DECLARATION];

  let rootAttrs = `${getBalanzaNamespaces()}`;
  rootAttrs += attr('Version', '1.3');
  rootAttrs += attr('RFC', rfc);
  rootAttrs += attr('Mes', mes);
  rootAttrs += attr('Anio', anio);
  rootAttrs += attr('TipoEnvio', tipo);

  if (tipo === 'C' && fechaModBal) {
    rootAttrs += attr('FechaModBal', fechaModBal);
  }

  lines.push(`<BCE:Balanza ${rootAttrs}>`);

  for (const row of rows) {
    // Calculate saldo (balance) based on naturaleza
    const saldoIni = row.satNaturaleza === 'D'
      ? row.openingDebit - row.openingCredit
      : row.openingCredit - row.openingDebit;
    const saldoFin = row.satNaturaleza === 'D'
      ? row.closingDebit - row.closingCredit
      : row.closingCredit - row.closingDebit;

    let accountLine = '  <BCE:Ctas';
    accountLine += attr('NumCta', row.accountCode);
    accountLine += attr('SaldoIni', toSatDecimal(Math.abs(saldoIni)));
    accountLine += attr('Debe', toSatDecimal(row.periodDebit));
    accountLine += attr('Haber', toSatDecimal(row.periodCredit));
    accountLine += attr('SaldoFin', toSatDecimal(Math.abs(saldoFin)));
    accountLine += '/>';

    lines.push(accountLine);
  }

  lines.push('</BCE:Balanza>');

  return lines.join('\n');
}
