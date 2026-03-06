/**
 * Complemento de Pagos 2.0 (Recibo Electronico de Pagos)
 *
 * Namespace: http://www.sat.gob.mx/Pagos20
 * XSD: http://www.sat.gob.mx/sitio_internet/cfd/Pagos/Pagos20.xsd
 *
 * Used when a PPD invoice (MetodoPago=PPD) receives payment.
 * The payment complement is a SEPARATE CFDI (TipoDeComprobante=P)
 * that references the original PPD invoice.
 */

import { create } from 'xmlbuilder2';
import { PAGOS20_NAMESPACE, PAGOS20_XSD_LOCATION } from '../constants.js';
import type {
  Pagos20Input,
  Pagos20PaymentInput,
  Pagos20DoctoRelacionadoInput,
  Pagos20ImpuestosPInput,
  Pagos20ImpuestosDRInput,
} from '../types.js';

/**
 * Build the Pagos 2.0 complement XML fragment.
 *
 * This function generates the <pago20:Pagos> element that goes inside
 * the <cfdi:Complemento> node. The caller (Component 18) is responsible
 * for wrapping this in the full Comprobante structure.
 *
 * @param input - The payment complement input data
 * @returns The XML string fragment for the Pagos 2.0 complement
 */
export function buildPagos20Complement(input: Pagos20Input): string {
  const root = create({ version: '1.0', encoding: 'UTF-8' });

  const pagos = root.ele('pago20:Pagos', {
    'xmlns:pago20': PAGOS20_NAMESPACE,
    Version: '2.0',
  });

  // Build Totales node
  const totales = pagos.ele('pago20:Totales');

  // Add optional totals in SAT-required order
  if (input.totalRetencionesIVA !== undefined) {
    totales.att('TotalRetencionesIVA', input.totalRetencionesIVA);
  }
  if (input.totalRetencionesISR !== undefined) {
    totales.att('TotalRetencionesISR', input.totalRetencionesISR);
  }
  if (input.totalRetencionesIEPS !== undefined) {
    totales.att('TotalRetencionesIEPS', input.totalRetencionesIEPS);
  }
  if (input.totalTrasladosBaseIVA16 !== undefined) {
    totales.att('TotalTrasladosBaseIVA16', input.totalTrasladosBaseIVA16);
  }
  if (input.totalTrasladosImpuestoIVA16 !== undefined) {
    totales.att('TotalTrasladosImpuestoIVA16', input.totalTrasladosImpuestoIVA16);
  }
  if (input.totalTrasladosBaseIVA8 !== undefined) {
    totales.att('TotalTrasladosBaseIVA8', input.totalTrasladosBaseIVA8);
  }
  if (input.totalTrasladosImpuestoIVA8 !== undefined) {
    totales.att('TotalTrasladosImpuestoIVA8', input.totalTrasladosImpuestoIVA8);
  }
  if (input.totalTrasladosBaseIVA0 !== undefined) {
    totales.att('TotalTrasladosBaseIVA0', input.totalTrasladosBaseIVA0);
  }
  if (input.totalTrasladosImpuestoIVA0 !== undefined) {
    totales.att('TotalTrasladosImpuestoIVA0', input.totalTrasladosImpuestoIVA0);
  }
  if (input.totalTrasladosBaseIVAExento !== undefined) {
    totales.att('TotalTrasladosBaseIVAExento', input.totalTrasladosBaseIVAExento);
  }

  // MontoTotalPagos is required
  totales.att('MontoTotalPagos', input.montoTotalPagos);

  // Build Pago nodes
  for (const payment of input.payments) {
    buildPagoNode(pagos, payment);
  }

  return root.end({ prettyPrint: true });
}

/**
 * Build a single pago20:Pago element
 */
function buildPagoNode(
  parent: ReturnType<typeof create>,
  payment: Pagos20PaymentInput
): void {
  const pago = parent.ele('pago20:Pago');

  // Required attributes
  pago.att('FechaPago', payment.fechaPago);
  pago.att('FormaDePagoP', payment.formaDePagoP);
  pago.att('MonedaP', payment.monedaP);
  pago.att('Monto', payment.monto);

  // Optional attributes
  if (payment.tipoCambioP !== undefined) {
    pago.att('TipoCambioP', payment.tipoCambioP);
  }
  if (payment.numOperacion !== undefined) {
    pago.att('NumOperacion', payment.numOperacion);
  }
  if (payment.rfcEmisorCtaOrd !== undefined) {
    pago.att('RfcEmisorCtaOrd', payment.rfcEmisorCtaOrd);
  }
  if (payment.nomBancoOrdExt !== undefined) {
    pago.att('NomBancoOrdExt', payment.nomBancoOrdExt);
  }
  if (payment.ctaOrdenante !== undefined) {
    pago.att('CtaOrdenante', payment.ctaOrdenante);
  }
  if (payment.rfcEmisorCtaBen !== undefined) {
    pago.att('RfcEmisorCtaBen', payment.rfcEmisorCtaBen);
  }
  if (payment.ctaBeneficiario !== undefined) {
    pago.att('CtaBeneficiario', payment.ctaBeneficiario);
  }
  if (payment.tipoCadPago !== undefined) {
    pago.att('TipoCadPago', payment.tipoCadPago);
  }
  if (payment.certPago !== undefined) {
    pago.att('CertPago', payment.certPago);
  }
  if (payment.cadPago !== undefined) {
    pago.att('CadPago', payment.cadPago);
  }
  if (payment.selloPago !== undefined) {
    pago.att('SelloPago', payment.selloPago);
  }

  // Build DoctoRelacionado nodes
  for (const docto of payment.documentosRelacionados) {
    buildDoctoRelacionadoNode(pago, docto);
  }

  // Build ImpuestosP node if present
  if (payment.impuestosP) {
    buildImpuestosPNode(pago, payment.impuestosP);
  }
}

/**
 * Build a pago20:DoctoRelacionado element
 */
function buildDoctoRelacionadoNode(
  parent: ReturnType<typeof create>,
  docto: Pagos20DoctoRelacionadoInput
): void {
  const dr = parent.ele('pago20:DoctoRelacionado');

  // Required attributes
  dr.att('IdDocumento', docto.idDocumento);
  dr.att('MonedaDR', docto.monedaDR);
  dr.att('EquivalenciaDR', docto.equivalenciaDR);
  dr.att('NumParcialidad', docto.numParcialidad);
  dr.att('ImpSaldoAnt', docto.impSaldoAnt);
  dr.att('ImpPagado', docto.impPagado);
  dr.att('ImpSaldoInsoluto', docto.impSaldoInsoluto);
  dr.att('ObjetoImpDR', docto.objetoImpDR);

  // Optional attributes
  if (docto.serie !== undefined) {
    dr.att('Serie', docto.serie);
  }
  if (docto.folio !== undefined) {
    dr.att('Folio', docto.folio);
  }

  // Build ImpuestosDR node if present
  if (docto.impuestosDR) {
    buildImpuestosDRNode(dr, docto.impuestosDR);
  }
}

/**
 * Build a pago20:ImpuestosP element
 */
function buildImpuestosPNode(
  parent: ReturnType<typeof create>,
  impuestos: Pagos20ImpuestosPInput
): void {
  const impuestosP = parent.ele('pago20:ImpuestosP');

  // Retenciones first (SAT XSD order)
  if (impuestos.retencionesP && impuestos.retencionesP.length > 0) {
    const retencionesP = impuestosP.ele('pago20:RetencionesP');
    for (const ret of impuestos.retencionesP) {
      retencionesP
        .ele('pago20:RetencionP')
        .att('ImpuestoP', ret.impuestoP)
        .att('ImporteP', ret.importeP);
    }
  }

  // Traslados second
  if (impuestos.trasladosP && impuestos.trasladosP.length > 0) {
    const trasladosP = impuestosP.ele('pago20:TrasladosP');
    for (const tras of impuestos.trasladosP) {
      const trasladoP = trasladosP
        .ele('pago20:TrasladoP')
        .att('BaseP', tras.baseP)
        .att('ImpuestoP', tras.impuestoP)
        .att('TipoFactorP', tras.tipoFactorP);

      if (tras.tasaOCuotaP !== undefined) {
        trasladoP.att('TasaOCuotaP', tras.tasaOCuotaP);
      }
      if (tras.importeP !== undefined) {
        trasladoP.att('ImporteP', tras.importeP);
      }
    }
  }
}

/**
 * Build a pago20:ImpuestosDR element
 */
function buildImpuestosDRNode(
  parent: ReturnType<typeof create>,
  impuestos: Pagos20ImpuestosDRInput
): void {
  const impuestosDR = parent.ele('pago20:ImpuestosDR');

  // Retenciones first (SAT XSD order)
  if (impuestos.retencionesDR && impuestos.retencionesDR.length > 0) {
    const retencionesDR = impuestosDR.ele('pago20:RetencionesDR');
    for (const ret of impuestos.retencionesDR) {
      const retencionDR = retencionesDR
        .ele('pago20:RetencionDR')
        .att('BaseDR', ret.baseDR)
        .att('ImpuestoDR', ret.impuestoDR)
        .att('TipoFactorDR', ret.tipoFactorDR);

      if (ret.tasaOCuotaDR !== undefined) {
        retencionDR.att('TasaOCuotaDR', ret.tasaOCuotaDR);
      }
      if (ret.importeDR !== undefined) {
        retencionDR.att('ImporteDR', ret.importeDR);
      }
    }
  }

  // Traslados second
  if (impuestos.trasladosDR && impuestos.trasladosDR.length > 0) {
    const trasladosDR = impuestosDR.ele('pago20:TrasladosDR');
    for (const tras of impuestos.trasladosDR) {
      const trasladoDR = trasladosDR
        .ele('pago20:TrasladoDR')
        .att('BaseDR', tras.baseDR)
        .att('ImpuestoDR', tras.impuestoDR)
        .att('TipoFactorDR', tras.tipoFactorDR);

      if (tras.tasaOCuotaDR !== undefined) {
        trasladoDR.att('TasaOCuotaDR', tras.tasaOCuotaDR);
      }
      if (tras.importeDR !== undefined) {
        trasladoDR.att('ImporteDR', tras.importeDR);
      }
    }
  }
}

/**
 * Generate the schemaLocation string for a CFDI with Pagos 2.0 complement
 */
export function getPagos20SchemaLocation(): string {
  return `${PAGOS20_NAMESPACE} ${PAGOS20_XSD_LOCATION}`;
}
