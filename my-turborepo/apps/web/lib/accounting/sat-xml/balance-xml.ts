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
 * Computes the SAT-spec saldo for an account.
 *
 * Per Anexo 24 v1.3: "De acuerdo a la naturaleza de la cuenta o subcuenta,
 * deberá de corresponder el saldo inicial, de lo contrario se entenderá
 * que es un saldo inicial de naturaleza inversa."
 *
 * A positive value means the balance matches the naturaleza;
 * a negative value signals an inverse balance (e.g., a debit-natural
 * account with a credit balance).
 */
function computeSaldoForNaturaleza(
  naturaleza: 'D' | 'A',
  debitTotal: number,
  creditTotal: number
): number {
  return naturaleza === 'D'
    ? debitTotal - creditTotal
    : creditTotal - debitTotal;
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

  // Validate conditional requirements
  if (tipo === 'C') {
    if (!fechaModBal) {
      throw new Error('Anexo 24: FechaModBal is required when TipoEnvio=C (complementaria)');
    }
  }

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
    // Sign preserved: negative saldo signals contra-nature balance per Anexo 24
    const saldoIni = computeSaldoForNaturaleza(
      row.satNaturaleza as 'D' | 'A',
      row.openingDebit,
      row.openingCredit
    );
    const saldoFin = computeSaldoForNaturaleza(
      row.satNaturaleza as 'D' | 'A',
      row.closingDebit,
      row.closingCredit
    );

    let accountLine = '  <BCE:Ctas';
    accountLine += attr('NumCta', row.accountCode);
    accountLine += attr('SaldoIni', toSatDecimal(saldoIni));
    accountLine += attr('Debe', toSatDecimal(row.periodDebit));
    accountLine += attr('Haber', toSatDecimal(row.periodCredit));
    accountLine += attr('SaldoFin', toSatDecimal(saldoFin));
    accountLine += '/>';

    lines.push(accountLine);
  }

  lines.push('</BCE:Balanza>');

  return lines.join('\n');
}
