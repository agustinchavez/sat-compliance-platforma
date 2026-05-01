/**
 * Complemento de Pagos 2.0 Data Assembly Layer
 *
 * This module prepares data for the @repo/cfdi buildPagos20Complement() function.
 * It fetches invoice data, computes tax proration, and maps everything into
 * the Pagos20Input structure expected by the CFDI package.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  Pagos20Input,
  Pagos20PaymentInput,
  Pagos20DoctoRelacionadoInput,
  Pagos20ImpuestosDRInput,
  Pagos20ImpuestosPInput,
} from '@repo/cfdi';
import type { Payment } from './types';
import {
  formatSATDecimal,
  formatCurrencyAmount,
  calculateEquivalenciaDR,
  getNextParcialidad,
  calculatePaidAmount,
  calculateOutstanding,
  prorateTaxes,
} from './calculations';
import { PaymentError } from './errors';

/**
 * Database row shapes (minimal types for what we fetch)
 */
interface InvoiceRow {
  id: string;
  serie?: string;
  folio_number_int?: number;
  metodo_pago: 'PUE' | 'PPD';
  moneda: string;
  tipo_cambio: number;
  total: number;
  subtotal: number;
  total_iva_trasladado: number;
  total_iva_retenido: number;
  total_isr_retenido: number;
}

interface InvoiceStampRow {
  uuid: string;
  fecha_timbrado: string;
}

interface InvoiceItemRow {
  iva_rate: number;
  iva_trasladado: number;
  iva_exempt: boolean;
  iva_retention_rate: number | null;
  iva_retenido: number;
  isr_retention_rate: number | null;
  isr_retenido: number;
  tax_object: '01' | '02' | '03';
  unit_price: number;
  quantity: number;
  discount_amount: number;
}

export interface BuildComplementoInput {
  payment: Payment;
  invoice: InvoiceRow;
  invoiceStamp: InvoiceStampRow;
  invoiceItems: InvoiceItemRow[];
  previousPayments: Payment[];
}

/**
 * Builds the Pagos20Input data structure for a single payment.
 *
 * This function:
 * 1. Calculates ImpSaldoAnt (outstanding before payment)
 * 2. Prorates taxes from invoice_items based on payment proportion
 * 3. Computes Totales aggregates
 * 4. Maps all data to Pagos20Input shape
 *
 * @throws PaymentError if invoice is PUE or not stamped
 */
export async function buildPagos20Input(
  input: BuildComplementoInput
): Promise<Pagos20Input> {
  const { payment, invoice, invoiceStamp, invoiceItems, previousPayments } = input;

  // Validation
  if (invoice.metodo_pago !== 'PPD') {
    throw new PaymentError(
      'INVOICE_NOT_PPD',
      'Cannot generate Complemento de Pagos for PUE invoice',
      payment.id,
      invoice.id
    );
  }

  if (!invoiceStamp.uuid) {
    throw new PaymentError(
      'INVOICE_NOT_STAMPED',
      'Invoice must be stamped before recording payment',
      payment.id,
      invoice.id
    );
  }

  // Calculate balances
  const previousPaidAmount = calculatePaidAmount(previousPayments);
  const impSaldoAnt = calculateOutstanding(invoice.total, previousPaidAmount);
  const impPagado = payment.amount;
  const impSaldoInsoluto = Math.max(0, impSaldoAnt - impPagado);

  // Prorate taxes
  const { proratedIVA, proratedIVARetenido, proratedISRRetenido } = prorateTaxes(
    invoice.total_iva_trasladado,
    invoice.total_iva_retenido,
    invoice.total_isr_retenido,
    impPagado,
    impSaldoAnt
  );

  // Build DoctoRelacionado
  const doctoRelacionado = buildDoctoRelacionado({
    invoiceUUID: invoiceStamp.uuid,
    invoiceSerie: invoice.serie,
    invoiceFolio: invoice.folio_number_int,
    invoiceCurrency: invoice.moneda,
    invoiceExchangeRate: invoice.tipo_cambio,
    paymentCurrency: payment.currency,
    paymentExchangeRate: payment.exchangeRate,
    impSaldoAnt,
    impPagado,
    impSaldoInsoluto,
    numParcialidad: getNextParcialidad([...previousPayments, payment]),
    proratedIVA,
    proratedIVARetenido,
    proratedISRRetenido,
    invoiceItems,
  });

  // Build ImpuestosP (mirrors DoctoRelacionado taxes in payment currency)
  const impuestosP = buildImpuestosP(doctoRelacionado, payment.currency, invoice.moneda);

  // Build Pago
  const pago: Pagos20PaymentInput = {
    fechaPago: formatFechaPago(payment.paymentDate),
    formaDePagoP: payment.paymentMethod,
    monedaP: payment.currency,
    tipoCambioP: payment.currency === 'MXN' ? undefined : formatSATDecimal(payment.exchangeRate),
    monto: formatCurrencyAmount(payment.amount),
    numOperacion: payment.referenceNumber,
    rfcEmisorCtaOrd: payment.bankRfcOrigin,
    ctaOrdenante: payment.bankAccountOrigin,
    nomBancoOrdExt: payment.bankNameExternal,
    rfcEmisorCtaBen: payment.bankRfcDest,
    ctaBeneficiario: payment.bankAccountDest,
    documentosRelacionados: [doctoRelacionado],
    impuestosP,
  };

  // Build Totales
  const totales = buildTotales([doctoRelacionado]);

  return {
    version: '2.0',
    ...totales,
    montoTotalPagos: formatCurrencyAmount(payment.amount),
    payments: [pago],
  };
}

/**
 * Builds a single DoctoRelacionado node with prorated tax breakdowns
 */
function buildDoctoRelacionado(params: {
  invoiceUUID: string;
  invoiceSerie?: string;
  invoiceFolio?: number;
  invoiceCurrency: string;
  invoiceExchangeRate: number;
  paymentCurrency: string;
  paymentExchangeRate: number;
  impSaldoAnt: number;
  impPagado: number;
  impSaldoInsoluto: number;
  numParcialidad: number;
  proratedIVA: number;
  proratedIVARetenido: number;
  proratedISRRetenido: number;
  invoiceItems: InvoiceItemRow[];
}): Pagos20DoctoRelacionadoInput {
  const {
    invoiceUUID,
    invoiceSerie,
    invoiceFolio,
    invoiceCurrency,
    paymentCurrency,
    paymentExchangeRate,
    impSaldoAnt,
    impPagado,
    impSaldoInsoluto,
    numParcialidad,
    proratedIVA,
    proratedIVARetenido,
    proratedISRRetenido,
    invoiceItems,
  } = params;

  const equivalenciaDR = calculateEquivalenciaDR(
    paymentCurrency,
    invoiceCurrency,
    paymentExchangeRate
  );

  // Determine ObjetoImpDR: '02' if invoice has taxes, '01' if exempt
  const hasIVA = invoiceItems.some(item => item.tax_object === '02' && item.iva_trasladado > 0);
  const objetoImpDR: '01' | '02' | '03' = hasIVA ? '02' : '01';

  // Build tax breakdown if ObjetoImpDR = '02'
  let impuestosDR: Pagos20ImpuestosDRInput | undefined = undefined;

  if (objetoImpDR === '02') {
    impuestosDR = buildImpuestosDR({
      proratedIVA,
      proratedIVARetenido,
      proratedISRRetenido,
      impPagado,
      invoiceItems,
    });
  }

  return {
    idDocumento: invoiceUUID,
    serie: invoiceSerie,
    folio: invoiceFolio?.toString(),
    monedaDR: invoiceCurrency,
    equivalenciaDR,
    numParcialidad: numParcialidad.toString(),
    impSaldoAnt: formatCurrencyAmount(impSaldoAnt),
    impPagado: formatCurrencyAmount(impPagado),
    impSaldoInsoluto: formatCurrencyAmount(impSaldoInsoluto),
    objetoImpDR,
    impuestosDR,
  };
}

/**
 * Builds ImpuestosDR node with prorated tax amounts
 */
function buildImpuestosDR(params: {
  proratedIVA: number;
  proratedIVARetenido: number;
  proratedISRRetenido: number;
  impPagado: number;
  invoiceItems: InvoiceItemRow[];
}): Pagos20ImpuestosDRInput | undefined {
  const { proratedIVA, proratedIVARetenido, proratedISRRetenido, impPagado, invoiceItems } =
    params;

  const trasladosDR: Array<{
    baseDR: string;
    impuestoDR: string;
    tipoFactorDR: string;
    tasaOCuotaDR?: string;
    importeDR?: string;
  }> = [];

  const retencionesDR: Array<{
    baseDR: string;
    impuestoDR: string;
    tipoFactorDR: string;
    tasaOCuotaDR?: string;
    importeDR?: string;
  }> = [];

  // Find the most common IVA rate from invoice items
  const ivaRates = invoiceItems
    .filter(item => item.iva_rate > 0 && !item.iva_exempt)
    .map(item => item.iva_rate);
  const primaryIVARate = ivaRates.length > 0 ? ivaRates[0] : 0.16;

  // IVA Trasladado (if any)
  if (proratedIVA > 0) {
    // Calculate base: impPagado / (1 + ivaRate)
    const baseDR = impPagado / (1 + primaryIVARate);
    trasladosDR.push({
      baseDR: formatCurrencyAmount(baseDR),
      impuestoDR: '002', // IVA
      tipoFactorDR: 'Tasa',
      tasaOCuotaDR: formatSATDecimal(primaryIVARate),
      importeDR: formatCurrencyAmount(proratedIVA),
    });
  }

  // IVA Retenido (if any)
  if (proratedIVARetenido > 0) {
    const baseDR = proratedIVARetenido / (invoiceItems[0]?.iva_retention_rate || 0.04);
    retencionesDR.push({
      baseDR: formatCurrencyAmount(baseDR),
      impuestoDR: '002', // IVA
      tipoFactorDR: 'Tasa',
      tasaOCuotaDR: formatSATDecimal(invoiceItems[0]?.iva_retention_rate || 0.04),
      importeDR: formatCurrencyAmount(proratedIVARetenido),
    });
  }

  // ISR Retenido (if any)
  if (proratedISRRetenido > 0) {
    const baseDR = proratedISRRetenido / (invoiceItems[0]?.isr_retention_rate || 0.1);
    retencionesDR.push({
      baseDR: formatCurrencyAmount(baseDR),
      impuestoDR: '001', // ISR
      tipoFactorDR: 'Tasa',
      tasaOCuotaDR: formatSATDecimal(invoiceItems[0]?.isr_retention_rate || 0.1),
      importeDR: formatCurrencyAmount(proratedISRRetenido),
    });
  }

  if (trasladosDR.length === 0 && retencionesDR.length === 0) {
    return undefined;
  }

  return {
    trasladosDR: trasladosDR.length > 0 ? trasladosDR : undefined,
    retencionesDR: retencionesDR.length > 0 ? retencionesDR : undefined,
  };
}

/**
 * Builds ImpuestosP (mirrors ImpuestosDR expressed in payment currency)
 */
function buildImpuestosP(
  docto: Pagos20DoctoRelacionadoInput,
  paymentCurrency: string,
  invoiceCurrency: string
): Pagos20ImpuestosPInput | undefined {
  if (!docto.impuestosDR) {
    return undefined;
  }

  // For simplicity, when payment currency = invoice currency, amounts are identical
  // Cross-currency conversion is complex and out of scope for v1
  if (paymentCurrency !== invoiceCurrency) {
    // Return undefined for now - cross-currency payment tax handling is complex
    return undefined;
  }

  const trasladosP = docto.impuestosDR.trasladosDR?.map(tr => ({
    baseP: tr.baseDR,
    impuestoP: tr.impuestoDR,
    tipoFactorP: tr.tipoFactorDR,
    tasaOCuotaP: tr.tasaOCuotaDR,
    importeP: tr.importeDR,
  }));

  const retencionesP = docto.impuestosDR.retencionesDR?.map(ret => ({
    impuestoP: ret.impuestoDR,
    importeP: ret.importeDR || '0.00',
  }));

  if (!trasladosP && !retencionesP) {
    return undefined;
  }

  return {
    trasladosP,
    retencionesP,
  };
}

/**
 * Aggregates tax totals across all DoctoRelacionado nodes for the Totales node.
 * For single-payment complements (most cases), this just extracts from the single docto.
 */
function buildTotales(
  doctos: Pagos20DoctoRelacionadoInput[]
): Omit<Pagos20Input, 'version' | 'montoTotalPagos' | 'payments'> {
  let totalTrasladosBaseIVA16 = 0;
  let totalTrasladosImpuestoIVA16 = 0;
  let totalTrasladosBaseIVA8 = 0;
  let totalTrasladosImpuestoIVA8 = 0;
  let totalTrasladosBaseIVA0 = 0;
  let totalTrasladosImpuestoIVA0 = 0;
  let totalTrasladosBaseIVAExento = 0;
  let totalRetencionesIVA = 0;
  let totalRetencionesISR = 0;
  let totalRetencionesIEPS = 0;

  for (const docto of doctos) {
    if (!docto.impuestosDR) continue;

    // Aggregate trasladados by rate
    if (docto.impuestosDR.trasladosDR) {
      for (const tr of docto.impuestosDR.trasladosDR) {
        const rate = parseFloat(tr.tasaOCuotaDR || '0');
        const base = parseFloat(tr.baseDR);
        const importe = parseFloat(tr.importeDR || '0');

        if (tr.impuestoDR === '002') {
          // IVA
          if (Math.abs(rate - 0.16) < 0.0001) {
            totalTrasladosBaseIVA16 += base;
            totalTrasladosImpuestoIVA16 += importe;
          } else if (Math.abs(rate - 0.08) < 0.0001) {
            totalTrasladosBaseIVA8 += base;
            totalTrasladosImpuestoIVA8 += importe;
          } else if (Math.abs(rate) < 0.0001) {
            totalTrasladosBaseIVA0 += base;
            totalTrasladosImpuestoIVA0 += importe;
          }
        }

        if (tr.tipoFactorDR === 'Exento') {
          totalTrasladosBaseIVAExento += base;
        }
      }
    }

    // Aggregate retenciones
    if (docto.impuestosDR.retencionesDR) {
      for (const ret of docto.impuestosDR.retencionesDR) {
        const importe = parseFloat(ret.importeDR || '0');
        if (ret.impuestoDR === '002') totalRetencionesIVA += importe;
        if (ret.impuestoDR === '001') totalRetencionesISR += importe;
        if (ret.impuestoDR === '003') totalRetencionesIEPS += importe;
      }
    }
  }

  return {
    totalTrasladosBaseIVA16:
      totalTrasladosBaseIVA16 > 0 ? formatCurrencyAmount(totalTrasladosBaseIVA16) : undefined,
    totalTrasladosImpuestoIVA16:
      totalTrasladosImpuestoIVA16 > 0
        ? formatCurrencyAmount(totalTrasladosImpuestoIVA16)
        : undefined,
    totalTrasladosBaseIVA8:
      totalTrasladosBaseIVA8 > 0 ? formatCurrencyAmount(totalTrasladosBaseIVA8) : undefined,
    totalTrasladosImpuestoIVA8:
      totalTrasladosImpuestoIVA8 > 0 ? formatCurrencyAmount(totalTrasladosImpuestoIVA8) : undefined,
    totalTrasladosBaseIVA0:
      totalTrasladosBaseIVA0 > 0 ? formatCurrencyAmount(totalTrasladosBaseIVA0) : undefined,
    totalTrasladosImpuestoIVA0:
      totalTrasladosImpuestoIVA0 > 0 ? formatCurrencyAmount(totalTrasladosImpuestoIVA0) : undefined,
    totalTrasladosBaseIVAExento:
      totalTrasladosBaseIVAExento > 0 ? formatCurrencyAmount(totalTrasladosBaseIVAExento) : undefined,
    totalRetencionesIVA: totalRetencionesIVA > 0 ? formatCurrencyAmount(totalRetencionesIVA) : undefined,
    totalRetencionesISR: totalRetencionesISR > 0 ? formatCurrencyAmount(totalRetencionesISR) : undefined,
    totalRetencionesIEPS: totalRetencionesIEPS > 0 ? formatCurrencyAmount(totalRetencionesIEPS) : undefined,
  };
}

/**
 * Converts payment date (YYYY-MM-DD) to FechaPago format (ISO datetime: YYYY-MM-DDTHH:mm:ss)
 * Uses noon (12:00:00) as the default time.
 */
function formatFechaPago(paymentDate: string): string {
  return `${paymentDate}T12:00:00`;
}

/**
 * Fetches all required data for building the complement
 */
export async function fetchComplementData(
  supabase: SupabaseClient,
  invoiceId: string
): Promise<{
  invoice: InvoiceRow;
  invoiceStamp: InvoiceStampRow;
  invoiceItems: InvoiceItemRow[];
}> {
  // Fetch invoice
  const { data: invoice, error: invoiceError } = await supabase
    .from('invoices')
    .select(
      'id, serie, folio_number_int, metodo_pago, moneda, tipo_cambio, total, subtotal, total_iva_trasladado, total_iva_retenido, total_isr_retenido'
    )
    .eq('id', invoiceId)
    .single();

  if (invoiceError || !invoice) {
    throw new PaymentError('INVOICE_NOT_FOUND', `Invoice ${invoiceId} not found`);
  }

  // Fetch invoice stamp
  const { data: stamp, error: stampError } = await supabase
    .from('invoice_stamps')
    .select('uuid, fecha_timbrado')
    .eq('invoice_id', invoiceId)
    .single();

  if (stampError || !stamp) {
    throw new PaymentError(
      'INVOICE_NOT_STAMPED',
      `Invoice ${invoiceId} has not been stamped yet`,
      undefined,
      invoiceId
    );
  }

  // Fetch invoice items
  const { data: items, error: itemsError } = await supabase
    .from('invoice_items')
    .select(
      'iva_rate, iva_trasladado, iva_exempt, iva_retention_rate, iva_retenido, isr_retention_rate, isr_retenido, tax_object, unit_price, quantity, discount_amount'
    )
    .eq('invoice_id', invoiceId)
    .order('sort_order');

  if (itemsError) {
    throw new PaymentError(
      'COMPLEMENT_GENERATION_FAILED',
      `Failed to fetch invoice items: ${itemsError.message}`,
      undefined,
      invoiceId
    );
  }

  return {
    invoice: invoice as unknown as InvoiceRow,
    invoiceStamp: stamp as unknown as InvoiceStampRow,
    invoiceItems: (items || []) as unknown as InvoiceItemRow[],
  };
}
