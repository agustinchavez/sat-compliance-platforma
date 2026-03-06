/**
 * @repo/cfdi - CFDI 4.0 XML Generator Package
 *
 * Public API for the CFDI XML generation package.
 * This package generates valid CFDI 4.0 XML documents from
 * Invoice data models (Component 12).
 */

// ============================================
// GENERATOR
// ============================================

export { generateCFDI, buildComprobante, formatXML } from './generator.js';

// ============================================
// CADENA ORIGINAL
// ============================================

export {
  generateCadenaOriginal,
  computeSHA256,
  validateCadena,
  isXSLTAvailable,
  isXsltprocAvailable,
} from './cadena-original.js';

// ============================================
// VALIDATION
// ============================================

export {
  validateCFDI,
  validateStructure,
  validateAmounts,
  validateDates,
  validateCatalogs,
  validateImpuestosAggregation,
} from './validation.js';

// ============================================
// IMPUESTOS AGGREGATION
// ============================================

export {
  aggregateImpuestos,
  formatDecimal6,
  formatDecimal2,
} from './impuestos-aggregation.js';

// ============================================
// COMPLEMENTS
// ============================================

export {
  buildPagos20Complement,
  getPagos20SchemaLocation,
} from './complements/pagos.js';

// ============================================
// TYPES
// ============================================

export type {
  // Generator input/output
  CFDIGeneratorInput,
  CFDIGeneratorResult,
  CFDIItemInput,
  TaxBreakdownRecord,

  // CFDI structure types
  CFDIComprobante,
  CFDIEmisor,
  CFDIReceptor,
  CFDIConcepto,
  CFDIConceptoImpuestos,
  CFDIConceptoTraslado,
  CFDIConceptoRetencion,
  CFDIImpuestos,
  CFDISummaryRetencion,
  CFDISummaryTraslado,
  CFDICfdiRelacionados,
  CFDIInformacionGlobal,
  CFDIComplemento,
  CFDITimbreFiscalDigital,

  // Cadena original types
  CadenaOriginalResult,

  // Validation types
  CFDIValidationResult,
  CFDIValidationError,
  CFDIValidationWarning,

  // Pagos 2.0 types
  Pagos20Input,
  Pagos20PaymentInput,
  Pagos20DoctoRelacionadoInput,
  Pagos20ImpuestosPInput,
  Pagos20ImpuestosDRInput,
  Pagos20Complement,
  Pagos20Totales,
  Pagos20Pago,
  Pagos20DoctoRelacionado,
  Pagos20ImpuestosP,
  Pagos20ImpuestosDR,
} from './types.js';

// ============================================
// CONSTANTS
// ============================================

export {
  // Namespaces
  CFDI_NAMESPACE,
  XSI_NAMESPACE,
  CFDI_XSD_LOCATION,
  CFDI_VERSION,
  PAGOS20_NAMESPACE,
  PAGOS20_XSD_LOCATION,
  TFD_NAMESPACE,

  // Tax codes
  IMPUESTO_ISR,
  IMPUESTO_IVA,
  IMPUESTO_IEPS,

  // TipoFactor
  TIPO_FACTOR_TASA,
  TIPO_FACTOR_EXENTO,

  // Tax rates
  IVA_GENERAL,
  IVA_FRONTERA,
  IVA_CERO,
  ISR_RETENCION_HONORARIOS,
  ISR_RETENCION_ARRENDAMIENTO,
  IVA_RETENCION_SERVICIOS,
  IVA_RETENCION_ARRENDAMIENTO,

  // Special RFC values
  RFC_PUBLICO_GENERAL,
  RFC_EXTRANJERO,

  // UsoCFDI codes
  USO_CFDI_SIN_EFECTOS,
  USO_CFDI_PAGO,

  // RegimenFiscal codes
  REGIMEN_SIN_OBLIGACIONES,

  // Payment codes
  FORMA_PAGO_POR_DEFINIR,
  CLAVE_PROD_SERV_PAGO,
  CLAVE_UNIDAD_PAGO,

  // TipoDeComprobante codes
  TIPO_COMPROBANTE_INGRESO,
  TIPO_COMPROBANTE_EGRESO,
  TIPO_COMPROBANTE_TRASLADO,
  TIPO_COMPROBANTE_PAGO,
  TIPO_COMPROBANTE_NOMINA,

  // Exportacion codes
  EXPORTACION_NO_APLICA,
  EXPORTACION_DEFINITIVA,
  EXPORTACION_TEMPORAL,
  EXPORTACION_DEFINITIVA_POSTERIOR,

  // MetodoPago codes
  METODO_PAGO_PUE,
  METODO_PAGO_PPD,

  // TipoRelacion codes
  TIPO_RELACION_NOTA_CREDITO,
  TIPO_RELACION_NOTA_DEBITO,
  TIPO_RELACION_DEVOLUCION,
  TIPO_RELACION_SUSTITUCION,
  TIPO_RELACION_TRASLADOS_PREVIOS,
  TIPO_RELACION_FACTURA_TRASLADOS,
  TIPO_RELACION_APLICACION_ANTICIPO,

  // Valid catalog values
  VALID_TIPOS_COMPROBANTE,
  VALID_EXPORTACION,
  VALID_METODOS_PAGO,
  VALID_OBJETO_IMP,
  VALID_TIPO_RELACION,
} from './constants.js';
