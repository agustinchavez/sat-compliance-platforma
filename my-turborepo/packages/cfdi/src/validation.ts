/**
 * CFDI 4.0 Validation
 *
 * Pre-PAC validation checks for CFDI documents.
 * Validates structure, amounts, dates, and catalog values.
 */

import Decimal from 'decimal.js';
import {
  TIPO_COMPROBANTE_VALUES,
  EXPORTACION_VALUES,
  METODO_PAGO_VALUES,
  OBJETO_IMP_VALUES,
  IMPUESTO_CODES,
  TIPO_FACTOR_VALUES,
} from './constants.js';
import { aggregateImpuestos, collectTaxRecords, formatDecimal6 } from './impuestos-aggregation.js';
import type {
  CFDIComprobante,
  CFDIValidationResult,
  CFDIValidationError,
  CFDIValidationWarning,
  CFDIItemInput,
} from './types.js';

// Configure Decimal.js
Decimal.set({ precision: 20, rounding: Decimal.ROUND_HALF_UP });

// ============================================
// MAIN VALIDATION FUNCTION
// ============================================

/**
 * Run all CFDI 4.0 validation checks.
 * Orchestrates the validators below.
 * Collects all errors and warnings - does NOT short-circuit on first error.
 *
 * @param xmlOrObject - Either the XML string or CFDIComprobante object
 * @param options - Optional validation options (e.g., reference date for 72-hour check)
 */
export function validateCFDI(
  xmlOrObject: string | CFDIComprobante,
  options?: { now?: Date }
): CFDIValidationResult {
  // If string, we can only do limited validation
  // For full validation, we need the CFDIComprobante object
  if (typeof xmlOrObject === 'string') {
    return validateXMLString(xmlOrObject);
  }

  const comprobante = xmlOrObject;
  const errors: CFDIValidationError[] = [];
  const warnings: CFDIValidationWarning[] = [];

  // Run all validators
  errors.push(...validateStructure(comprobante));
  errors.push(...validateAmounts(comprobante));
  errors.push(...validateDates(comprobante, options?.now));
  errors.push(...validateCatalogs(comprobante));

  // Impuestos aggregation validation
  if (comprobante.Conceptos && comprobante.Impuestos) {
    const items = conceptosToItems(comprobante.Conceptos);
    errors.push(...validateImpuestosAggregation(comprobante, items));
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Basic validation for XML string.
 * Limited checks without parsing.
 */
function validateXMLString(xml: string): CFDIValidationResult {
  const errors: CFDIValidationError[] = [];
  const warnings: CFDIValidationWarning[] = [];

  // Check XML declaration
  if (!xml.includes('<?xml version="1.0"')) {
    errors.push({
      code: 'CFDI_XML_001',
      message: 'Missing or invalid XML declaration',
    });
  }

  // Check encoding is UTF-8 (uppercase)
  if (xml.includes('encoding="utf-8"') || xml.includes("encoding='utf-8'")) {
    warnings.push({
      code: 'CFDI_XML_002',
      message: 'XML encoding should be "UTF-8" (uppercase) for PAC compatibility',
    });
  }

  // Check for CFDI namespace
  if (!xml.includes('xmlns:cfdi="http://www.sat.gob.mx/cfd/4"')) {
    errors.push({
      code: 'CFDI_XML_003',
      message: 'Missing CFDI 4.0 namespace declaration',
    });
  }

  // Check version
  if (!xml.includes('Version="4.0"')) {
    errors.push({
      code: 'CFDI_XML_004',
      message: 'Version must be "4.0"',
    });
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

// ============================================
// STRUCTURE VALIDATION
// ============================================

/**
 * Validate required fields are present and non-empty.
 */
export function validateStructure(comprobante: CFDIComprobante): CFDIValidationError[] {
  const errors: CFDIValidationError[] = [];

  // Version check
  if (comprobante.Version !== '4.0') {
    errors.push({
      code: 'CFDI001',
      field: 'Version',
      message: `Version must be "4.0", got "${comprobante.Version}"`,
    });
  }

  // Fecha format check
  if (!isValidISODateTime(comprobante.Fecha)) {
    errors.push({
      code: 'CFDI002',
      field: 'Fecha',
      message: `Fecha must be valid ISO datetime format (YYYY-MM-DDTHH:MM:SS), got "${comprobante.Fecha}"`,
    });
  }

  // LugarExpedicion - 5 digit zip code
  if (!isValidZipCode(comprobante.LugarExpedicion)) {
    errors.push({
      code: 'CFDI003',
      field: 'LugarExpedicion',
      message: `LugarExpedicion must be 5-digit zip code, got "${comprobante.LugarExpedicion}"`,
    });
  }

  // Emisor validation
  if (!comprobante.Emisor) {
    errors.push({
      code: 'CFDI004',
      field: 'Emisor',
      message: 'Emisor is required',
    });
  } else {
    if (!isValidRFC(comprobante.Emisor.Rfc)) {
      errors.push({
        code: 'CFDI005',
        field: 'Emisor.Rfc',
        message: `Invalid RFC format: "${comprobante.Emisor.Rfc}"`,
      });
    }

    if (!isValidRegimenFiscal(comprobante.Emisor.RegimenFiscal)) {
      errors.push({
        code: 'CFDI006',
        field: 'Emisor.RegimenFiscal',
        message: `RegimenFiscal must be 3-digit code, got "${comprobante.Emisor.RegimenFiscal}"`,
      });
    }
  }

  // Receptor validation
  if (!comprobante.Receptor) {
    errors.push({
      code: 'CFDI007',
      field: 'Receptor',
      message: 'Receptor is required',
    });
  } else {
    if (!isValidZipCode(comprobante.Receptor.DomicilioFiscalReceptor)) {
      errors.push({
        code: 'CFDI008',
        field: 'Receptor.DomicilioFiscalReceptor',
        message: `DomicilioFiscalReceptor must be 5-digit zip code, got "${comprobante.Receptor.DomicilioFiscalReceptor}"`,
      });
    }

    if (!isValidRegimenFiscal(comprobante.Receptor.RegimenFiscalReceptor)) {
      errors.push({
        code: 'CFDI009',
        field: 'Receptor.RegimenFiscalReceptor',
        message: `RegimenFiscalReceptor must be 3-digit code, got "${comprobante.Receptor.RegimenFiscalReceptor}"`,
      });
    }
  }

  // Conceptos - at least one required
  if (!comprobante.Conceptos || comprobante.Conceptos.length === 0) {
    errors.push({
      code: 'CFDI010',
      field: 'Conceptos',
      message: 'At least one Concepto is required',
    });
  }

  // SubTotal and Total - non-negative
  const subtotal = parseDecimal(comprobante.SubTotal);
  if (subtotal === null || subtotal.lessThan(0)) {
    errors.push({
      code: 'CFDI011',
      field: 'SubTotal',
      message: `SubTotal must be >= 0, got "${comprobante.SubTotal}"`,
    });
  }

  const total = parseDecimal(comprobante.Total);
  if (total === null || total.lessThan(0)) {
    errors.push({
      code: 'CFDI012',
      field: 'Total',
      message: `Total must be >= 0, got "${comprobante.Total}"`,
    });
  }

  return errors;
}

// ============================================
// AMOUNT VALIDATION
// ============================================

/**
 * Verify mathematical consistency.
 */
export function validateAmounts(comprobante: CFDIComprobante): CFDIValidationError[] {
  const errors: CFDIValidationError[] = [];
  const tolerance = new Decimal('0.01'); // 1 cent tolerance

  // Calculate sum of concepto Importe values
  let sumImportes = new Decimal(0);
  for (const concepto of comprobante.Conceptos || []) {
    const importe = parseDecimal(concepto.Importe);
    if (importe) {
      sumImportes = sumImportes.plus(importe);
    }
  }

  // SubTotal should equal sum of Importe
  const subtotal = parseDecimal(comprobante.SubTotal);
  if (subtotal && sumImportes.minus(subtotal).abs().greaterThan(tolerance)) {
    errors.push({
      code: 'CFDI020',
      field: 'SubTotal',
      message: `SubTotal (${comprobante.SubTotal}) does not match sum of Concepto Importe values (${formatDecimal6(sumImportes)})`,
    });
  }

  // Total calculation: SubTotal - Descuento + TotalImpuestosTrasladados - TotalImpuestosRetenidos
  if (subtotal) {
    const descuento = parseDecimal(comprobante.Descuento) || new Decimal(0);
    const trasladados = parseDecimal(comprobante.Impuestos?.TotalImpuestosTrasladados) || new Decimal(0);
    const retenidos = parseDecimal(comprobante.Impuestos?.TotalImpuestosRetenidos) || new Decimal(0);

    const expectedTotal = subtotal.minus(descuento).plus(trasladados).minus(retenidos);
    const actualTotal = parseDecimal(comprobante.Total);

    if (actualTotal && expectedTotal.minus(actualTotal).abs().greaterThan(tolerance)) {
      errors.push({
        code: 'CFDI021',
        field: 'Total',
        message: `Total (${comprobante.Total}) does not match calculated value (${expectedTotal.toFixed(2)}). SubTotal=${comprobante.SubTotal}, Descuento=${descuento.toString()}, Trasladados=${trasladados.toString()}, Retenidos=${retenidos.toString()}`,
      });
    }
  }

  return errors;
}

// ============================================
// DATE VALIDATION
// ============================================

/**
 * Date validation rules including 72-hour SAT rule.
 */
export function validateDates(
  comprobante: CFDIComprobante,
  now?: Date
): CFDIValidationError[] {
  const errors: CFDIValidationError[] = [];
  const currentDate = now || new Date();

  // Parse the Fecha
  const fecha = parseISODateTime(comprobante.Fecha);
  if (!fecha) {
    errors.push({
      code: 'CFDI030',
      field: 'Fecha',
      message: `Invalid date format: "${comprobante.Fecha}"`,
    });
    return errors;
  }

  // Fecha must not be in the future
  if (fecha > currentDate) {
    errors.push({
      code: 'CFDI031',
      field: 'Fecha',
      message: `Fecha (${comprobante.Fecha}) cannot be in the future`,
    });
  }

  // 72-hour rule: Fecha must not be more than 72 hours in the past
  const seventyTwoHoursAgo = new Date(currentDate.getTime() - 72 * 60 * 60 * 1000);
  if (fecha < seventyTwoHoursAgo) {
    errors.push({
      code: 'CFDI032',
      field: 'Fecha',
      message: `Fecha (${comprobante.Fecha}) is more than 72 hours in the past (SAT 72-hour rule)`,
    });
  }

  return errors;
}

// ============================================
// CATALOG VALIDATION
// ============================================

/**
 * Validate values against SAT catalog constraints.
 */
export function validateCatalogs(comprobante: CFDIComprobante): CFDIValidationError[] {
  const errors: CFDIValidationError[] = [];

  // TipoDeComprobante
  if (!TIPO_COMPROBANTE_VALUES.includes(comprobante.TipoDeComprobante as any)) {
    errors.push({
      code: 'CFDI040',
      field: 'TipoDeComprobante',
      message: `Invalid TipoDeComprobante: "${comprobante.TipoDeComprobante}". Valid values: ${TIPO_COMPROBANTE_VALUES.join(', ')}`,
    });
  }

  // Exportacion
  if (!EXPORTACION_VALUES.includes(comprobante.Exportacion as any)) {
    errors.push({
      code: 'CFDI041',
      field: 'Exportacion',
      message: `Invalid Exportacion: "${comprobante.Exportacion}". Valid values: ${EXPORTACION_VALUES.join(', ')}`,
    });
  }

  // MetodoPago (if present and not payment complement)
  if (comprobante.MetodoPago && comprobante.TipoDeComprobante !== 'P') {
    if (!METODO_PAGO_VALUES.includes(comprobante.MetodoPago as any)) {
      errors.push({
        code: 'CFDI042',
        field: 'MetodoPago',
        message: `Invalid MetodoPago: "${comprobante.MetodoPago}". Valid values: ${METODO_PAGO_VALUES.join(', ')}`,
      });
    }
  }

  // FormaPago format (if present) - 2-digit code
  if (comprobante.FormaPago && !isValidFormaPago(comprobante.FormaPago)) {
    errors.push({
      code: 'CFDI043',
      field: 'FormaPago',
      message: `Invalid FormaPago format: "${comprobante.FormaPago}". Must be 2-digit code`,
    });
  }

  // Moneda - common currencies
  if (!isValidMoneda(comprobante.Moneda)) {
    errors.push({
      code: 'CFDI044',
      field: 'Moneda',
      message: `Invalid Moneda: "${comprobante.Moneda}". Must be valid ISO 4217 code`,
    });
  }

  // Validate each Concepto
  for (let i = 0; i < (comprobante.Conceptos?.length || 0); i++) {
    const concepto = comprobante.Conceptos![i];

    // ObjetoImp
    if (!OBJETO_IMP_VALUES.includes(concepto.ObjetoImp as any)) {
      errors.push({
        code: 'CFDI045',
        field: `Conceptos[${i}].ObjetoImp`,
        message: `Invalid ObjetoImp: "${concepto.ObjetoImp}". Valid values: ${OBJETO_IMP_VALUES.join(', ')}`,
      });
    }

    // ClaveProdServ format - 8 digits
    if (!isValidClaveProdServ(concepto.ClaveProdServ)) {
      errors.push({
        code: 'CFDI046',
        field: `Conceptos[${i}].ClaveProdServ`,
        message: `Invalid ClaveProdServ format: "${concepto.ClaveProdServ}". Must be 8-digit numeric code`,
      });
    }

    // ClaveUnidad format - 1-10 alphanumeric
    if (!isValidClaveUnidad(concepto.ClaveUnidad)) {
      errors.push({
        code: 'CFDI047',
        field: `Conceptos[${i}].ClaveUnidad`,
        message: `Invalid ClaveUnidad format: "${concepto.ClaveUnidad}". Must be 1-10 alphanumeric characters`,
      });
    }

    // Validate concept-level impuestos
    if (concepto.Impuestos) {
      errors.push(...validateConceptoImpuestos(concepto.Impuestos, i));
    }
  }

  return errors;
}

/**
 * Validate concept-level impuestos.
 */
function validateConceptoImpuestos(
  impuestos: NonNullable<CFDIComprobante['Conceptos'][0]['Impuestos']>,
  conceptoIndex: number
): CFDIValidationError[] {
  const errors: CFDIValidationError[] = [];

  // Validate Traslados
  for (let i = 0; i < (impuestos.Traslados?.length || 0); i++) {
    const traslado = impuestos.Traslados![i];

    if (!IMPUESTO_CODES.includes(traslado.Impuesto as any)) {
      errors.push({
        code: 'CFDI050',
        field: `Conceptos[${conceptoIndex}].Impuestos.Traslados[${i}].Impuesto`,
        message: `Invalid Impuesto code: "${traslado.Impuesto}"`,
      });
    }

    if (!['Tasa', 'Exento'].includes(traslado.TipoFactor)) {
      errors.push({
        code: 'CFDI051',
        field: `Conceptos[${conceptoIndex}].Impuestos.Traslados[${i}].TipoFactor`,
        message: `Invalid TipoFactor: "${traslado.TipoFactor}"`,
      });
    }
  }

  // Validate Retenciones
  for (let i = 0; i < (impuestos.Retenciones?.length || 0); i++) {
    const retencion = impuestos.Retenciones![i];

    if (!IMPUESTO_CODES.includes(retencion.Impuesto as any)) {
      errors.push({
        code: 'CFDI052',
        field: `Conceptos[${conceptoIndex}].Impuestos.Retenciones[${i}].Impuesto`,
        message: `Invalid Impuesto code: "${retencion.Impuesto}"`,
      });
    }
  }

  return errors;
}

// ============================================
// IMPUESTOS AGGREGATION VALIDATION
// ============================================

/**
 * Validate that the Comprobante-level Impuestos node correctly aggregates
 * all Concepto-level tax values.
 */
export function validateImpuestosAggregation(
  comprobante: CFDIComprobante,
  items: CFDIItemInput[]
): CFDIValidationError[] {
  const errors: CFDIValidationError[] = [];
  const tolerance = new Decimal('0.01');

  // Re-compute aggregation
  const taxRecords = collectTaxRecords(items);
  const expected = aggregateImpuestos(taxRecords);

  // Compare TotalImpuestosTrasladados
  if (expected.totalImpuestosTrasladados !== undefined) {
    const actual = comprobante.Impuestos?.TotalImpuestosTrasladados;
    if (!actual) {
      errors.push({
        code: 'CFDI060',
        field: 'Impuestos.TotalImpuestosTrasladados',
        message: `Missing TotalImpuestosTrasladados, expected ${expected.totalImpuestosTrasladados}`,
      });
    } else {
      const diff = new Decimal(actual).minus(expected.totalImpuestosTrasladados).abs();
      if (diff.greaterThan(tolerance)) {
        errors.push({
          code: 'CFDI061',
          field: 'Impuestos.TotalImpuestosTrasladados',
          message: `TotalImpuestosTrasladados mismatch: actual=${actual}, expected=${expected.totalImpuestosTrasladados}`,
        });
      }
    }
  }

  // Compare TotalImpuestosRetenidos
  if (expected.totalImpuestosRetenidos !== undefined) {
    const actual = comprobante.Impuestos?.TotalImpuestosRetenidos;
    if (!actual) {
      errors.push({
        code: 'CFDI062',
        field: 'Impuestos.TotalImpuestosRetenidos',
        message: `Missing TotalImpuestosRetenidos, expected ${expected.totalImpuestosRetenidos}`,
      });
    } else {
      const diff = new Decimal(actual).minus(expected.totalImpuestosRetenidos).abs();
      if (diff.greaterThan(tolerance)) {
        errors.push({
          code: 'CFDI063',
          field: 'Impuestos.TotalImpuestosRetenidos',
          message: `TotalImpuestosRetenidos mismatch: actual=${actual}, expected=${expected.totalImpuestosRetenidos}`,
        });
      }
    }
  }

  return errors;
}

// ============================================
// HELPER FUNCTIONS
// ============================================

function isValidISODateTime(value: string): boolean {
  // Format: YYYY-MM-DDTHH:MM:SS
  const regex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/;
  return regex.test(value);
}

function parseISODateTime(value: string): Date | null {
  if (!isValidISODateTime(value)) {
    return null;
  }
  const date = new Date(value);
  return isNaN(date.getTime()) ? null : date;
}

function isValidZipCode(value: string): boolean {
  return /^\d{5}$/.test(value);
}

function isValidRFC(value: string): boolean {
  // RFC: 12 chars for persona moral, 13 for persona fisica
  // Format: [A-Z&Ñ]{3,4}[0-9]{6}[A-Z0-9]{3}
  const regex = /^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/i;
  return regex.test(value);
}

function isValidRegimenFiscal(value: string): boolean {
  return /^\d{3}$/.test(value);
}

function isValidFormaPago(value: string): boolean {
  // 2-digit code: 01-31, 99
  return /^\d{2}$/.test(value);
}

function isValidMoneda(value: string): boolean {
  // ISO 4217: 3 uppercase letters or XXX for payment complement
  return /^[A-Z]{3}$/.test(value);
}

function isValidClaveProdServ(value: string): boolean {
  // 8 digits
  return /^\d{8}$/.test(value);
}

function isValidClaveUnidad(value: string): boolean {
  // 1-10 alphanumeric characters
  return /^[A-Z0-9]{1,10}$/i.test(value);
}

function parseDecimal(value: string | undefined): Decimal | null {
  if (value === undefined || value === null || value === '') {
    return null;
  }
  try {
    return new Decimal(value);
  } catch {
    return null;
  }
}

/**
 * Convert CFDIConcepto array to CFDIItemInput array for impuestos validation.
 */
function conceptosToItems(conceptos: CFDIComprobante['Conceptos']): CFDIItemInput[] {
  return conceptos.map((c) => ({
    product_service_key: c.ClaveProdServ,
    unit_key: c.ClaveUnidad,
    unit_name: c.Unidad,
    sku: c.NoIdentificacion,
    description: c.Descripcion,
    quantity: parseFloat(c.Cantidad),
    unit_price: parseFloat(c.ValorUnitario),
    discount_amount: c.Descuento ? parseFloat(c.Descuento) : 0,
    tax_object: c.ObjetoImp,
    tax_breakdown: [
      ...(c.Impuestos?.Traslados || []).map((t) => ({
        type: 'traslado' as const,
        impuesto: t.Impuesto,
        tipo_factor: t.TipoFactor,
        tasa_o_cuota: t.TasaOCuota,
        base: t.Base,
        importe: t.Importe,
      })),
      ...(c.Impuestos?.Retenciones || []).map((r) => ({
        type: 'retencion' as const,
        impuesto: r.Impuesto,
        tipo_factor: r.TipoFactor,
        tasa_o_cuota: r.TasaOCuota,
        base: r.Base,
        importe: r.Importe,
      })),
    ],
  }));
}
