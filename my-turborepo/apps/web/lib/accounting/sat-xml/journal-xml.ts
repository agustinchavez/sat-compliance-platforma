/**
 * SAT Journal XML Generation (PL - Pólizas del Período)
 *
 * Generates the XML document per Anexo 24 v1.3 PolizasPeriodo schema.
 */

import type { JournalEntry, JournalEntryLine } from '../types';
import { POLIZA_TYPE_LABELS } from '../constants';
import { XML_DECLARATION, getPolizasNamespaces, attr, escapeXml, toSatDecimal } from './shared';

export interface JournalXmlInput {
  rfc: string;
  month: number;
  year: number;
  /** Tipo de solicitud: AF (acto de fiscalizacion), FC (fiscalización compulsa),
   *  DE (devolucion), CO (compensacion) */
  tipoSolicitud: 'AF' | 'FC' | 'DE' | 'CO';
  /** Numero de orden (for AF/FC) or numero de tramite (for DE/CO) */
  numOrden?: string;
  numTramite?: string;
  entries: JournalEntry[];
}

/**
 * Generates the PL (Pólizas del Período) XML.
 *
 * Structure per Anexo 24 v1.3:
 * <PLZ:Polizas Version="1.3" RFC="..." Mes="..." Anio="..." TipoSolicitud="...">
 *   <PLZ:Poliza NumUnIdenPol="..." Fecha="..." Concepto="...">
 *     <PLZ:Transaccion NumCta="..." DesCta="..." Concepto="..." Debe="..." Haber="...">
 *       <PLZ:CompNal UUID_CFDI="..." MontoTotal="..." RFC="..."/>
 *       <PLZ:Transferencia CtaOri="..." BancoOriNal="..." CtaDest="..." BancoDestNal="..." Fecha="..." Monto="..."/>
 *     </PLZ:Transaccion>
 *   </PLZ:Poliza>
 * </PLZ:Polizas>
 */
export function generateJournalXml(input: JournalXmlInput): string {
  const { rfc, month, year, tipoSolicitud, numOrden, numTramite, entries } = input;
  const mes = String(month).padStart(2, '0');
  const anio = String(year);

  const lines: string[] = [XML_DECLARATION];

  let rootAttrs = getPolizasNamespaces();
  rootAttrs += attr('Version', '1.3');
  rootAttrs += attr('RFC', rfc);
  rootAttrs += attr('Mes', mes);
  rootAttrs += attr('Anio', anio);
  rootAttrs += attr('TipoSolicitud', tipoSolicitud);
  if (numOrden) rootAttrs += attr('NumOrden', numOrden);
  if (numTramite) rootAttrs += attr('NumTramite', numTramite);

  lines.push(`<PLZ:Polizas ${rootAttrs}>`);

  for (const entry of entries) {
    if (entry.status !== 'posted') continue;

    let polizaLine = '  <PLZ:Poliza';
    polizaLine += attr('NumUnIdenPol', entry.entryNumber);
    polizaLine += attr('Fecha', entry.entryDate);
    polizaLine += attr('Concepto', entry.description);
    polizaLine += '>';
    lines.push(polizaLine);

    for (const line of entry.lines) {
      let transLine = '    <PLZ:Transaccion';
      transLine += attr('NumCta', line.accountCode);
      transLine += attr('DesCta', line.description ?? '');
      transLine += attr('Concepto', line.description ?? entry.description);
      transLine += attr('Debe', toSatDecimal(line.debit));
      transLine += attr('Haber', toSatDecimal(line.credit));
      transLine += '>';
      lines.push(transLine);

      // CompNal node (domestic CFDI reference)
      if (line.uuidCfdi) {
        let compNal = '      <PLZ:CompNal';
        compNal += attr('UUID_CFDI', line.uuidCfdi);
        if (line.montoTotalComp !== undefined) {
          compNal += attr('MontoTotal', toSatDecimal(line.montoTotalComp));
        }
        if (line.rfcThirdParty) {
          compNal += attr('RFC', line.rfcThirdParty);
        }
        if (line.monedaComp) {
          compNal += attr('Moneda', line.monedaComp);
        }
        if (line.tipoCambioComp !== undefined) {
          compNal += attr('TipCamb', String(line.tipoCambioComp));
        }
        compNal += '/>';
        lines.push(compNal);
      }

      // Transferencia node (bank transfers)
      if (line.paymentMethod === 'transferencia' && line.bankAccount) {
        let transfer = '      <PLZ:Transferencia';
        transfer += attr('CtaOri', line.bankAccount);
        if (line.bankCode) transfer += attr('BancoOriNal', line.bankCode);
        transfer += attr('Monto', toSatDecimal(line.debit > 0 ? line.debit : line.credit));
        transfer += '/>';
        lines.push(transfer);
      }

      // Cheque node
      if (line.paymentMethod === 'cheque' && line.paymentReference) {
        let cheque = '      <PLZ:Cheque';
        cheque += attr('Num', line.paymentReference);
        if (line.bankCode) cheque += attr('BanEmworCheworNal', line.bankCode);
        cheque += attr('Monto', toSatDecimal(line.debit > 0 ? line.debit : line.credit));
        cheque += '/>';
        lines.push(cheque);
      }

      lines.push('    </PLZ:Transaccion>');
    }

    lines.push('  </PLZ:Poliza>');
  }

  lines.push('</PLZ:Polizas>');

  return lines.join('\n');
}
