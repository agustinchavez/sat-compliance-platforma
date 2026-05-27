/**
 * SAT Auxiliary XML Generation (XF/XC)
 *
 * XF - Auxiliar de Folios: Details of CFDIs per poliza
 * XC - Auxiliar de Cuentas: Account detail/ledger per period
 */

import type { JournalEntry, JournalEntryLine, AccountBalance } from '../types';
import { XML_DECLARATION, getAuxiliarFoliosNamespaces, getAuxiliarCuentasNamespaces, attr, toSatDecimal } from './shared';

// ============================================
// XF - Auxiliar de Folios
// ============================================

export interface AuxiliarFoliosInput {
  rfc: string;
  month: number;
  year: number;
  tipoSolicitud: 'AF' | 'FC' | 'DE' | 'CO';
  numOrden?: string;
  numTramite?: string;
  entries: JournalEntry[];
}

/**
 * Generates the XF (Auxiliar de Folios) XML.
 *
 * Lists all CFDIs referenced in journal entries for the period.
 */
export function generateAuxiliarFoliosXml(input: AuxiliarFoliosInput): string {
  const { rfc, month, year, tipoSolicitud, numOrden, numTramite, entries } = input;
  const mes = String(month).padStart(2, '0');
  const anio = String(year);

  const lines: string[] = [XML_DECLARATION];

  let rootAttrs = getAuxiliarFoliosNamespaces();
  rootAttrs += attr('Version', '1.3');
  rootAttrs += attr('RFC', rfc);
  rootAttrs += attr('Mes', mes);
  rootAttrs += attr('Anio', anio);
  rootAttrs += attr('TipoSolicitud', tipoSolicitud);
  if (numOrden) rootAttrs += attr('NumOrden', numOrden);
  if (numTramite) rootAttrs += attr('NumTramite', numTramite);

  lines.push(`<RepAux:RepAuxFol ${rootAttrs}>`);

  for (const entry of entries) {
    if (entry.status !== 'posted') continue;

    // Collect unique UUIDs from lines
    const uuids = new Set<string>();
    for (const line of entry.lines) {
      if (line.uuidCfdi) uuids.add(line.uuidCfdi);
    }

    if (uuids.size === 0) continue;

    let detAux = '  <RepAux:DetAuxFol';
    detAux += attr('NumUnIdenPol', entry.entryNumber);
    detAux += attr('Fecha', entry.entryDate);
    detAux += '>';
    lines.push(detAux);

    for (const uuid of uuids) {
      const relatedLines = entry.lines.filter(l => l.uuidCfdi === uuid);
      const firstLine = relatedLines[0];

      let compNal = '    <RepAux:CompNal';
      compNal += attr('UUID_CFDI', uuid);
      if (firstLine?.montoTotalComp !== undefined) {
        compNal += attr('MontoTotal', toSatDecimal(firstLine.montoTotalComp));
      }
      if (firstLine?.rfcThirdParty) {
        compNal += attr('RFC', firstLine.rfcThirdParty);
      }
      if (firstLine?.monedaComp) {
        compNal += attr('Moneda', firstLine.monedaComp);
      }
      if (firstLine?.tipoCambioComp !== undefined) {
        compNal += attr('TipCamb', String(firstLine.tipoCambioComp));
      }
      compNal += '/>';
      lines.push(compNal);
    }

    lines.push('  </RepAux:DetAuxFol>');
  }

  lines.push('</RepAux:RepAuxFol>');

  return lines.join('\n');
}

// ============================================
// XC - Auxiliar de Cuentas
// ============================================

export interface AuxiliarCuentasInput {
  rfc: string;
  month: number;
  year: number;
  tipoSolicitud: 'AF' | 'FC' | 'DE' | 'CO';
  numOrden?: string;
  numTramite?: string;
  accounts: Array<{
    accountCode: string;
    accountName: string;
    openingBalance: number;
    entries: Array<{
      entryDate: string;
      entryNumber: string;
      description: string;
      debit: number;
      credit: number;
    }>;
    closingBalance: number;
  }>;
}

/**
 * Generates the XC (Auxiliar de Cuentas) XML.
 *
 * Account-level ledger detail per period.
 */
export function generateAuxiliarCuentasXml(input: AuxiliarCuentasInput): string {
  const { rfc, month, year, tipoSolicitud, numOrden, numTramite, accounts } = input;
  const mes = String(month).padStart(2, '0');
  const anio = String(year);

  const lines: string[] = [XML_DECLARATION];

  let rootAttrs = getAuxiliarCuentasNamespaces();
  rootAttrs += attr('Version', '1.3');
  rootAttrs += attr('RFC', rfc);
  rootAttrs += attr('Mes', mes);
  rootAttrs += attr('Anio', anio);
  rootAttrs += attr('TipoSolicitud', tipoSolicitud);
  if (numOrden) rootAttrs += attr('NumOrden', numOrden);
  if (numTramite) rootAttrs += attr('NumTramite', numTramite);

  lines.push(`<AuxiliarCtas:AuxiliarCtas ${rootAttrs}>`);

  for (const account of accounts) {
    let ctaLine = '  <AuxiliarCtas:Cuenta';
    ctaLine += attr('NumCta', account.accountCode);
    ctaLine += attr('DesCta', account.accountName);
    ctaLine += attr('SaldoIni', toSatDecimal(account.openingBalance));
    ctaLine += attr('SaldoFin', toSatDecimal(account.closingBalance));
    ctaLine += '>';
    lines.push(ctaLine);

    for (const entry of account.entries) {
      let detLine = '    <AuxiliarCtas:DetalleAux';
      detLine += attr('Fecha', entry.entryDate);
      detLine += attr('NumUnIdenPol', entry.entryNumber);
      detLine += attr('Concepto', entry.description);
      detLine += attr('Debe', toSatDecimal(entry.debit));
      detLine += attr('Haber', toSatDecimal(entry.credit));
      detLine += '/>';
      lines.push(detLine);
    }

    lines.push('  </AuxiliarCtas:Cuenta>');
  }

  lines.push('</AuxiliarCtas:AuxiliarCtas>');

  return lines.join('\n');
}
