/**
 * SAT Journal XML Generation (PL - Pólizas del Período)
 *
 * Generates the XML document per Anexo 24 v1.3 PolizasPeriodo schema.
 */

import type { JournalEntry, JournalEntryLine } from '../types';
import { POLIZA_TYPE_LABELS } from '../constants';
import { XML_DECLARATION, getPolizasNamespaces, attr, requiredAttr, escapeXml, toSatDecimal } from './shared';

export interface JournalXmlInput {
  rfc: string;
  month: number;
  year: number;
  /** Tipo de solicitud: AF (acto de fiscalizacion), FC (fiscalización compulsa),
   *  DE (devolucion), CO (compensacion) */
  tipoSolicitud: 'AF' | 'FC' | 'DE' | 'CO';
  /** Numero de orden (required for AF/FC) */
  numOrden?: string;
  /** Numero de tramite (required for DE/CO) */
  numTramite?: string;
  entries: JournalEntry[];
  /** Account ID → account name lookup for DesCta attribute */
  accountNames: Map<string, string>;
}

/**
 * Validates TipoSolicitud conditional requirements for NumOrden/NumTramite.
 */
function validateTipoSolicitud(tipoSolicitud: string, numOrden?: string, numTramite?: string): void {
  if ((tipoSolicitud === 'AF' || tipoSolicitud === 'FC') && !numOrden) {
    throw new Error(`Anexo 24: NumOrden is required when TipoSolicitud='${tipoSolicitud}'`);
  }
  if ((tipoSolicitud === 'DE' || tipoSolicitud === 'CO') && !numTramite) {
    throw new Error(`Anexo 24: NumTramite is required when TipoSolicitud='${tipoSolicitud}'`);
  }
}

/**
 * Renders CompNal node for domestic CFDI references.
 */
function renderCompNal(line: JournalEntryLine): string {
  if (!line.uuidCfdi) return '';

  const ctx = `CompNal for line ${line.lineNumber}`;
  let xml = '      <PLZ:CompNal';
  xml += requiredAttr('UUID_CFDI', line.uuidCfdi, ctx);
  xml += requiredAttr('MontoTotal', toSatDecimal(line.montoTotalComp ?? line.debit ?? line.credit), ctx);
  xml += attr('RFC', line.rfcThirdParty);
  xml += attr('Moneda', line.monedaComp);
  if (line.tipoCambioComp !== undefined) {
    xml += attr('TipCamb', toSatDecimal(line.tipoCambioComp));
  }
  xml += '/>';
  return xml;
}

/**
 * Renders Cheque node with all required attributes per Anexo 24 v1.3.
 */
function renderCheque(line: JournalEntryLine, fallbackDate: string): string {
  if (line.paymentMethod !== 'cheque' || !line.paymentReference) return '';

  const monto = line.debit > 0 ? line.debit : line.credit;
  const ctx = `Cheque for line ${line.lineNumber}`;

  let xml = '      <PLZ:Cheque';
  xml += requiredAttr('Num', line.paymentReference, ctx);
  xml += requiredAttr('BanEmisNal', line.bankCode, ctx);
  xml += requiredAttr('CtaOri', line.bankAccount, ctx);
  xml += requiredAttr('Fecha', line.paymentDate ?? fallbackDate, ctx);
  xml += requiredAttr('Benef', line.paymentBeneficiary, ctx);
  xml += requiredAttr('RFC', line.paymentBeneficiaryRfc, ctx);
  xml += requiredAttr('Monto', toSatDecimal(monto), ctx);
  xml += '/>';
  return xml;
}

/**
 * Renders Transferencia node with all required attributes per Anexo 24 v1.3.
 */
function renderTransferencia(line: JournalEntryLine, fallbackDate: string): string {
  if (line.paymentMethod !== 'transferencia' || !line.bankAccount) return '';

  const monto = line.debit > 0 ? line.debit : line.credit;
  const ctx = `Transferencia for line ${line.lineNumber}`;

  let xml = '      <PLZ:Transferencia';
  xml += requiredAttr('CtaOri', line.bankAccount, ctx);
  xml += requiredAttr('BancoOriNal', line.bankCode, ctx);
  xml += requiredAttr('CtaDest', line.destBankAccount, ctx);
  xml += requiredAttr('BancoDestNal', line.destBankCode, ctx);
  xml += requiredAttr('Fecha', line.paymentDate ?? fallbackDate, ctx);
  xml += requiredAttr('Benef', line.paymentBeneficiary, ctx);
  xml += requiredAttr('RFC', line.paymentBeneficiaryRfc, ctx);
  xml += requiredAttr('Monto', toSatDecimal(monto), ctx);
  xml += '/>';
  return xml;
}

/**
 * Renders a single Transaccion element with its child payment nodes.
 */
function renderTransaccion(line: JournalEntryLine, entry: JournalEntry, accountNames: Map<string, string>): string {
  const accountName = accountNames.get(line.accountId) ?? line.accountCode;
  const ctx = `Transaccion ${line.lineNumber} of entry ${entry.entryNumber}`;

  let xml = '    <PLZ:Transaccion';
  xml += requiredAttr('NumCta', line.accountCode, ctx);
  xml += attr('DesCta', accountName);
  xml += requiredAttr('Concepto', line.description ?? entry.description, ctx);
  xml += requiredAttr('Debe', toSatDecimal(line.debit), ctx);
  xml += requiredAttr('Haber', toSatDecimal(line.credit), ctx);
  xml += '>';

  const parts = [xml];
  const compNal = renderCompNal(line);
  if (compNal) parts.push(compNal);
  const cheque = renderCheque(line, entry.entryDate);
  if (cheque) parts.push(cheque);
  const transferencia = renderTransferencia(line, entry.entryDate);
  if (transferencia) parts.push(transferencia);
  parts.push('    </PLZ:Transaccion>');

  return parts.join('\n');
}

/**
 * Generates the PL (Pólizas del Período) XML.
 *
 * Structure per Anexo 24 v1.3:
 * <PLZ:Polizas Version="1.3" RFC="..." Mes="..." Anio="..." TipoSolicitud="...">
 *   <PLZ:Poliza NumUnIdenPol="..." Fecha="..." Concepto="...">
 *     <PLZ:Transaccion NumCta="..." DesCta="..." Concepto="..." Debe="..." Haber="...">
 *       <PLZ:CompNal UUID_CFDI="..." MontoTotal="..." RFC="..."/>
 *       <PLZ:Cheque Num="..." BanEmisNal="..." CtaOri="..." Fecha="..." Benef="..." RFC="..." Monto="..."/>
 *       <PLZ:Transferencia CtaOri="..." BancoOriNal="..." CtaDest="..." BancoDestNal="..." Fecha="..." Benef="..." RFC="..." Monto="..."/>
 *     </PLZ:Transaccion>
 *   </PLZ:Poliza>
 * </PLZ:Polizas>
 */
export function generateJournalXml(input: JournalXmlInput): string {
  const { rfc, month, year, tipoSolicitud, numOrden, numTramite, entries, accountNames } = input;

  // Validate conditional requirements
  validateTipoSolicitud(tipoSolicitud, numOrden, numTramite);

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
      lines.push(renderTransaccion(line, entry, accountNames));
    }

    lines.push('  </PLZ:Poliza>');
  }

  lines.push('</PLZ:Polizas>');

  return lines.join('\n');
}
