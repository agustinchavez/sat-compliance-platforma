/**
 * CFDI 4.0 XML Generator
 *
 * Generates valid CFDI 4.0 XML documents from the Invoice data model.
 * Uses xmlbuilder2 for proper namespace handling and attribute ordering.
 */

import { create, fragment } from 'xmlbuilder2';
import Decimal from 'decimal.js';
import {
  CFDI_NAMESPACE,
  XSI_NAMESPACE,
  CFDI_XSD_LOCATION,
  CFDI_VERSION,
  RFC_PUBLICO_GENERAL,
  RFC_EXTRANJERO,
  USO_CFDI_SIN_EFECTOS,
  REGIMEN_SIN_OBLIGACIONES,
  MONEDA_PAGO_XXX,
} from './constants.js';
import {
  aggregateImpuestos,
  collectTaxRecords,
  formatDecimal2,
  formatDecimal6,
} from './impuestos-aggregation.js';
import type {
  CFDIGeneratorInput,
  CFDIGeneratorResult,
  CFDIComprobante,
  CFDIEmisor,
  CFDIReceptor,
  CFDIConcepto,
  CFDIConceptoImpuestos,
  CFDIImpuestos,
  CFDICfdiRelacionados,
  CFDIInformacionGlobal,
  CFDIItemInput,
} from './types.js';

// Configure Decimal.js
Decimal.set({ precision: 20, rounding: Decimal.ROUND_HALF_UP });

// ============================================
// MAIN GENERATOR FUNCTION
// ============================================

/**
 * Generate a complete, valid CFDI 4.0 XML document.
 *
 * Returns xmlUnsigned (with Sello="" and Certificado="" placeholders)
 * and xml (same content - the actual Sello is added by Component 14).
 */
export function generateCFDI(input: CFDIGeneratorInput): CFDIGeneratorResult {
  const comprobante = buildComprobante(input);
  const xml = formatXML(comprobante);

  return {
    xml,
    xmlUnsigned: xml, // Same before signing
  };
}

// ============================================
// COMPROBANTE BUILDER
// ============================================

/**
 * Map CFDIGeneratorInput -> CFDIComprobante interface.
 * All field naming conversions happen here.
 */
export function buildComprobante(input: CFDIGeneratorInput): CFDIComprobante {
  const inv = input.invoice;
  const isPaymentComplement = inv.tipo_comprobante === 'P';

  const comprobante: CFDIComprobante = {
    Version: CFDI_VERSION,
    Fecha: inv.issue_date,
    Sello: inv.stamps?.seal ?? '',
    NoCertificado: inv.stamps?.certificate_number ?? '',
    Certificado: inv.stamps?.certificate ?? '',
    SubTotal: isPaymentComplement ? '0' : formatDecimal2(inv.subtotal),
    Moneda: isPaymentComplement ? MONEDA_PAGO_XXX : inv.currency,
    Total: isPaymentComplement ? '0' : formatDecimal2(inv.total),
    TipoDeComprobante: inv.tipo_comprobante,
    Exportacion: inv.exportacion,
    LugarExpedicion: inv.issuer_zip_code,
    Emisor: buildEmisor(input),
    Receptor: buildReceptor(input),
    Conceptos: buildConceptos(inv.items),
  };

  // Optional fields - only include if present
  if (inv.serie) {
    comprobante.Serie = inv.serie;
  }

  if (inv.folio) {
    comprobante.Folio = inv.folio;
  }

  // FormaPago and MetodoPago - omitted for TipoDeComprobante=P
  if (!isPaymentComplement) {
    if (inv.payment_form) {
      comprobante.FormaPago = inv.payment_form;
    }
    if (inv.payment_method) {
      comprobante.MetodoPago = inv.payment_method;
    }
  }

  if (inv.conditions) {
    comprobante.CondicionesDePago = inv.conditions;
  }

  // Descuento - only if > 0
  if (inv.discount > 0) {
    comprobante.Descuento = formatDecimal2(inv.discount);
  }

  // TipoCambio - only for non-MXN
  if (inv.currency !== 'MXN' && inv.exchange_rate !== 1) {
    comprobante.TipoCambio = String(inv.exchange_rate);
  }

  // InformacionGlobal - for global invoices
  if (inv.is_global && inv.global_periodicity && inv.global_months && inv.global_year) {
    comprobante.InformacionGlobal = {
      Periodicidad: inv.global_periodicity,
      Meses: inv.global_months,
      Año: inv.global_year,
    };
  }

  // CfdiRelacionados
  if (inv.related_cfdi && inv.related_cfdi.length > 0) {
    comprobante.CfdiRelacionados = buildRelatedCFDI(inv.related_cfdi);
  }

  // Impuestos summary - only for non-payment invoices with taxed items
  if (!isPaymentComplement) {
    const impuestos = buildImpuestos(inv.items);
    if (impuestos) {
      comprobante.Impuestos = impuestos;
    }
  }

  return comprobante;
}

// ============================================
// EMISOR BUILDER
// ============================================

/**
 * Map issuer fields to CFDIEmisor.
 */
export function buildEmisor(input: CFDIGeneratorInput): CFDIEmisor {
  return {
    Rfc: input.invoice.issuer_rfc,
    Nombre: input.invoice.issuer_name,
    RegimenFiscal: input.invoice.issuer_tax_regime,
  };
}

// ============================================
// RECEPTOR BUILDER
// ============================================

/**
 * Map receiver fields to CFDIReceptor.
 * Special case: XAXX010101000 forces UsoCFDI='S01', RegimenFiscalReceptor='616'
 */
export function buildReceptor(input: CFDIGeneratorInput): CFDIReceptor {
  const inv = input.invoice;
  const isPublicoGeneral = inv.receiver_rfc === RFC_PUBLICO_GENERAL;
  const isExtranjero = inv.receiver_rfc === RFC_EXTRANJERO;

  return {
    Rfc: inv.receiver_rfc,
    Nombre: inv.receiver_name,
    DomicilioFiscalReceptor: inv.receiver_zip_code,
    RegimenFiscalReceptor: isPublicoGeneral ? REGIMEN_SIN_OBLIGACIONES : inv.receiver_tax_regime,
    UsoCFDI: isPublicoGeneral || isExtranjero ? USO_CFDI_SIN_EFECTOS : inv.receiver_cfdi_use,
  };
}

// ============================================
// CONCEPTOS BUILDER
// ============================================

/**
 * Map each invoice item to a CFDIConcepto.
 */
export function buildConceptos(items: CFDIItemInput[]): CFDIConcepto[] {
  return items.map((item) => buildConcepto(item));
}

/**
 * Build a single Concepto from an item.
 */
function buildConcepto(item: CFDIItemInput): CFDIConcepto {
  const quantity = new Decimal(item.quantity);
  const unitPrice = new Decimal(item.unit_price);
  const discount = new Decimal(item.discount_amount);

  // Importe = quantity * unit_price (before discount applied to base)
  const importe = quantity.times(unitPrice);

  const concepto: CFDIConcepto = {
    ClaveProdServ: item.product_service_key,
    Cantidad: formatDecimal6(quantity),
    ClaveUnidad: item.unit_key,
    Descripcion: item.description,
    ValorUnitario: formatDecimal6(unitPrice),
    Importe: formatDecimal6(importe),
    ObjetoImp: item.tax_object,
  };

  // Optional fields
  if (item.sku) {
    concepto.NoIdentificacion = item.sku;
  }

  if (item.unit_name) {
    concepto.Unidad = item.unit_name;
  }

  // Descuento - only if > 0
  if (discount.greaterThan(0)) {
    concepto.Descuento = formatDecimal6(discount);
  }

  // Impuestos - only for taxed items (ObjetoImp != '01')
  if (item.tax_object !== '01' && item.tax_breakdown.length > 0) {
    const impuestos = buildConceptoImpuestos(item.tax_breakdown);
    if (impuestos) {
      concepto.Impuestos = impuestos;
    }
  }

  return concepto;
}

/**
 * Build Concepto-level Impuestos from tax_breakdown.
 */
function buildConceptoImpuestos(
  taxBreakdown: CFDIItemInput['tax_breakdown']
): CFDIConceptoImpuestos | undefined {
  const traslados = taxBreakdown.filter((t) => t.type === 'traslado');
  const retenciones = taxBreakdown.filter((t) => t.type === 'retencion');

  if (traslados.length === 0 && retenciones.length === 0) {
    return undefined;
  }

  const impuestos: CFDIConceptoImpuestos = {};

  if (traslados.length > 0) {
    impuestos.Traslados = traslados.map((t) => {
      const traslado: CFDIConceptoImpuestos['Traslados'][0] = {
        Base: t.base,
        Impuesto: t.impuesto as '001' | '002' | '003',
        TipoFactor: t.tipo_factor as 'Tasa' | 'Exento',
      };

      // TasaOCuota and Importe only for Tasa (not Exento)
      if (t.tipo_factor === 'Tasa') {
        traslado.TasaOCuota = t.tasa_o_cuota;
        traslado.Importe = t.importe;
      }

      return traslado;
    });
  }

  if (retenciones.length > 0) {
    impuestos.Retenciones = retenciones.map((r) => ({
      Base: r.base,
      Impuesto: r.impuesto as '001' | '002' | '003',
      TipoFactor: 'Tasa' as const,
      TasaOCuota: r.tasa_o_cuota!,
      Importe: r.importe!,
    }));
  }

  return impuestos;
}

// ============================================
// IMPUESTOS SUMMARY BUILDER
// ============================================

/**
 * Build the Comprobante-level cfdi:Impuestos summary node.
 */
export function buildImpuestos(items: CFDIItemInput[]): CFDIImpuestos | undefined {
  const taxRecords = collectTaxRecords(items);

  if (taxRecords.length === 0) {
    return undefined;
  }

  const aggregated = aggregateImpuestos(taxRecords);

  // If no traslados and no retenciones, no Impuestos node
  if (aggregated.traslados.length === 0 && aggregated.retenciones.length === 0) {
    return undefined;
  }

  const impuestos: CFDIImpuestos = {};

  if (aggregated.totalImpuestosRetenidos !== undefined) {
    impuestos.TotalImpuestosRetenidos = aggregated.totalImpuestosRetenidos;
  }

  if (aggregated.totalImpuestosTrasladados !== undefined) {
    impuestos.TotalImpuestosTrasladados = aggregated.totalImpuestosTrasladados;
  }

  if (aggregated.retenciones.length > 0) {
    impuestos.Retenciones = aggregated.retenciones.map((r) => ({
      Impuesto: r.impuesto as '001' | '002' | '003',
      Importe: r.importe,
    }));
  }

  if (aggregated.traslados.length > 0) {
    impuestos.Traslados = aggregated.traslados.map((t) => {
      const traslado: CFDIImpuestos['Traslados'][0] = {
        Base: t.base,
        Impuesto: t.impuesto as '001' | '002' | '003',
        TipoFactor: t.tipoFactor as 'Tasa' | 'Exento',
      };

      if (t.tipoFactor === 'Tasa') {
        traslado.TasaOCuota = t.tasaOCuota;
        traslado.Importe = t.importe;
      }

      return traslado;
    });
  }

  return impuestos;
}

// ============================================
// RELATED CFDI BUILDER
// ============================================

/**
 * Group related CFDIs by tipo_relacion.
 */
export function buildRelatedCFDI(
  related: Array<{ tipo_relacion: string; related_uuid: string }>
): CFDICfdiRelacionados[] {
  // Group by tipo_relacion
  const grouped = new Map<string, string[]>();

  for (const rel of related) {
    if (!grouped.has(rel.tipo_relacion)) {
      grouped.set(rel.tipo_relacion, []);
    }
    grouped.get(rel.tipo_relacion)!.push(rel.related_uuid);
  }

  // Convert to CFDICfdiRelacionados array
  const result: CFDICfdiRelacionados[] = [];

  for (const [tipoRelacion, uuids] of grouped.entries()) {
    result.push({
      TipoRelacion: tipoRelacion,
      CfdiRelacionado: uuids.map((uuid) => ({ UUID: uuid })),
    });
  }

  return result;
}

// ============================================
// XML FORMATTER
// ============================================

/**
 * Serialize CFDIComprobante -> well-formed XML string using xmlbuilder2.
 */
export function formatXML(comprobante: CFDIComprobante): string {
  // Build the root element with namespaces
  const doc = create({ version: '1.0', encoding: 'UTF-8' });

  // Root Comprobante element with all attributes in SAT required order
  const root = doc.ele(CFDI_NAMESPACE, 'cfdi:Comprobante');

  // Add namespace declarations
  root.att('xmlns:cfdi', CFDI_NAMESPACE);
  root.att('xmlns:xsi', XSI_NAMESPACE);
  root.att('xsi:schemaLocation', `${CFDI_NAMESPACE} ${CFDI_XSD_LOCATION}`);

  // Add Comprobante attributes in required order
  root.att('Version', comprobante.Version);

  if (comprobante.Serie) {
    root.att('Serie', comprobante.Serie);
  }

  if (comprobante.Folio) {
    root.att('Folio', comprobante.Folio);
  }

  root.att('Fecha', comprobante.Fecha);
  root.att('Sello', comprobante.Sello);

  if (comprobante.FormaPago) {
    root.att('FormaPago', comprobante.FormaPago);
  }

  root.att('NoCertificado', comprobante.NoCertificado);
  root.att('Certificado', comprobante.Certificado);

  if (comprobante.CondicionesDePago) {
    root.att('CondicionesDePago', comprobante.CondicionesDePago);
  }

  root.att('SubTotal', comprobante.SubTotal);

  if (comprobante.Descuento) {
    root.att('Descuento', comprobante.Descuento);
  }

  root.att('Moneda', comprobante.Moneda);

  if (comprobante.TipoCambio) {
    root.att('TipoCambio', comprobante.TipoCambio);
  }

  root.att('Total', comprobante.Total);
  root.att('TipoDeComprobante', comprobante.TipoDeComprobante);
  root.att('Exportacion', comprobante.Exportacion);

  if (comprobante.MetodoPago) {
    root.att('MetodoPago', comprobante.MetodoPago);
  }

  root.att('LugarExpedicion', comprobante.LugarExpedicion);

  if (comprobante.Confirmacion) {
    root.att('Confirmacion', comprobante.Confirmacion);
  }

  // Child elements

  // InformacionGlobal (if present, before CfdiRelacionados)
  if (comprobante.InformacionGlobal) {
    const ig = root.ele('cfdi:InformacionGlobal');
    ig.att('Periodicidad', comprobante.InformacionGlobal.Periodicidad);
    ig.att('Meses', comprobante.InformacionGlobal.Meses);
    ig.att('Año', comprobante.InformacionGlobal.Año);
  }

  // CfdiRelacionados
  if (comprobante.CfdiRelacionados) {
    for (const rel of comprobante.CfdiRelacionados) {
      const relNode = root.ele('cfdi:CfdiRelacionados');
      relNode.att('TipoRelacion', rel.TipoRelacion);

      for (const cfdi of rel.CfdiRelacionado) {
        const cfdiNode = relNode.ele('cfdi:CfdiRelacionado');
        cfdiNode.att('UUID', cfdi.UUID);
      }
    }
  }

  // Emisor
  const emisor = root.ele('cfdi:Emisor');
  emisor.att('Rfc', comprobante.Emisor.Rfc);
  emisor.att('Nombre', comprobante.Emisor.Nombre);
  emisor.att('RegimenFiscal', comprobante.Emisor.RegimenFiscal);

  // Receptor
  const receptor = root.ele('cfdi:Receptor');
  receptor.att('Rfc', comprobante.Receptor.Rfc);
  receptor.att('Nombre', comprobante.Receptor.Nombre);
  receptor.att('DomicilioFiscalReceptor', comprobante.Receptor.DomicilioFiscalReceptor);
  receptor.att('RegimenFiscalReceptor', comprobante.Receptor.RegimenFiscalReceptor);
  receptor.att('UsoCFDI', comprobante.Receptor.UsoCFDI);

  if (comprobante.Receptor.ResidenciaFiscal) {
    receptor.att('ResidenciaFiscal', comprobante.Receptor.ResidenciaFiscal);
  }

  if (comprobante.Receptor.NumRegIdTrib) {
    receptor.att('NumRegIdTrib', comprobante.Receptor.NumRegIdTrib);
  }

  // Conceptos
  const conceptos = root.ele('cfdi:Conceptos');

  for (const concepto of comprobante.Conceptos) {
    const conceptoNode = conceptos.ele('cfdi:Concepto');
    conceptoNode.att('ClaveProdServ', concepto.ClaveProdServ);

    if (concepto.NoIdentificacion) {
      conceptoNode.att('NoIdentificacion', concepto.NoIdentificacion);
    }

    conceptoNode.att('Cantidad', concepto.Cantidad);
    conceptoNode.att('ClaveUnidad', concepto.ClaveUnidad);

    if (concepto.Unidad) {
      conceptoNode.att('Unidad', concepto.Unidad);
    }

    conceptoNode.att('Descripcion', concepto.Descripcion);
    conceptoNode.att('ValorUnitario', concepto.ValorUnitario);
    conceptoNode.att('Importe', concepto.Importe);

    if (concepto.Descuento) {
      conceptoNode.att('Descuento', concepto.Descuento);
    }

    conceptoNode.att('ObjetoImp', concepto.ObjetoImp);

    // Concepto-level Impuestos
    if (concepto.Impuestos) {
      const impuestosNode = conceptoNode.ele('cfdi:Impuestos');

      if (concepto.Impuestos.Traslados && concepto.Impuestos.Traslados.length > 0) {
        const trasladosNode = impuestosNode.ele('cfdi:Traslados');

        for (const traslado of concepto.Impuestos.Traslados) {
          const trasladoNode = trasladosNode.ele('cfdi:Traslado');
          trasladoNode.att('Base', traslado.Base);
          trasladoNode.att('Impuesto', traslado.Impuesto);
          trasladoNode.att('TipoFactor', traslado.TipoFactor);

          if (traslado.TasaOCuota !== undefined) {
            trasladoNode.att('TasaOCuota', traslado.TasaOCuota);
          }

          if (traslado.Importe !== undefined) {
            trasladoNode.att('Importe', traslado.Importe);
          }
        }
      }

      if (concepto.Impuestos.Retenciones && concepto.Impuestos.Retenciones.length > 0) {
        const retencionesNode = impuestosNode.ele('cfdi:Retenciones');

        for (const retencion of concepto.Impuestos.Retenciones) {
          const retencionNode = retencionesNode.ele('cfdi:Retencion');
          retencionNode.att('Base', retencion.Base);
          retencionNode.att('Impuesto', retencion.Impuesto);
          retencionNode.att('TipoFactor', retencion.TipoFactor);
          retencionNode.att('TasaOCuota', retencion.TasaOCuota);
          retencionNode.att('Importe', retencion.Importe);
        }
      }
    }
  }

  // Comprobante-level Impuestos
  if (comprobante.Impuestos) {
    const impuestosNode = root.ele('cfdi:Impuestos');

    if (comprobante.Impuestos.TotalImpuestosRetenidos) {
      impuestosNode.att('TotalImpuestosRetenidos', comprobante.Impuestos.TotalImpuestosRetenidos);
    }

    if (comprobante.Impuestos.TotalImpuestosTrasladados) {
      impuestosNode.att('TotalImpuestosTrasladados', comprobante.Impuestos.TotalImpuestosTrasladados);
    }

    if (comprobante.Impuestos.Retenciones && comprobante.Impuestos.Retenciones.length > 0) {
      const retencionesNode = impuestosNode.ele('cfdi:Retenciones');

      for (const retencion of comprobante.Impuestos.Retenciones) {
        const retencionNode = retencionesNode.ele('cfdi:Retencion');
        retencionNode.att('Impuesto', retencion.Impuesto);
        retencionNode.att('Importe', retencion.Importe);
      }
    }

    if (comprobante.Impuestos.Traslados && comprobante.Impuestos.Traslados.length > 0) {
      const trasladosNode = impuestosNode.ele('cfdi:Traslados');

      for (const traslado of comprobante.Impuestos.Traslados) {
        const trasladoNode = trasladosNode.ele('cfdi:Traslado');
        trasladoNode.att('Base', traslado.Base);
        trasladoNode.att('Impuesto', traslado.Impuesto);
        trasladoNode.att('TipoFactor', traslado.TipoFactor);

        if (traslado.TasaOCuota !== undefined) {
          trasladoNode.att('TasaOCuota', traslado.TasaOCuota);
        }

        if (traslado.Importe !== undefined) {
          trasladoNode.att('Importe', traslado.Importe);
        }
      }
    }
  }

  // Complemento (if present)
  if (comprobante.Complemento) {
    // Will be added by Component 14/15/18
    root.ele('cfdi:Complemento');
  }

  // End the document and return XML string
  return doc.end({ headless: false, prettyPrint: false });
}
