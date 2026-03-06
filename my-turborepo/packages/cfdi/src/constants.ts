/**
 * CFDI 4.0 Constants
 *
 * Official SAT namespace URIs, XSD locations, and catalog values.
 * Verified against http://www.sat.gob.mx/sitio_internet/cfd/4/cfdv40.xsd
 */

// ============================================
// NAMESPACES AND SCHEMA LOCATIONS
// ============================================

/** CFDI 4.0 namespace URI */
export const CFDI_NAMESPACE = 'http://www.sat.gob.mx/cfd/4';

/** XML Schema Instance namespace */
export const XSI_NAMESPACE = 'http://www.w3.org/2001/XMLSchema-instance';

/** CFDI 4.0 XSD location */
export const CFDI_XSD_LOCATION = 'http://www.sat.gob.mx/sitio_internet/cfd/4/cfdv40.xsd';

/** CFDI version */
export const CFDI_VERSION = '4.0' as const;

/** Pagos 2.0 namespace URI */
export const PAGOS20_NAMESPACE = 'http://www.sat.gob.mx/Pagos20';

/** Pagos 2.0 XSD location */
export const PAGOS20_XSD_LOCATION = 'http://www.sat.gob.mx/sitio_internet/cfd/Pagos/Pagos20.xsd';

/** Timbre Fiscal Digital namespace URI */
export const TFD_NAMESPACE = 'http://www.sat.gob.mx/TimbreFiscalDigital';

/** Timbre Fiscal Digital XSD location */
export const TFD_XSD_LOCATION = 'http://www.sat.gob.mx/sitio_internet/cfd/TimbreFiscalDigital/TimbreFiscalDigitalv11.xsd';

/** Cadena original XSLT URL */
export const CADENA_ORIGINAL_XSLT_URL = 'http://www.sat.gob.mx/sitio_internet/cfd/4/cadenaoriginal_4_0/cadenaoriginal_4_0.xslt';

// ============================================
// IMPUESTO (TAX) CODES
// ============================================

/** ISR - Impuesto Sobre la Renta */
export const IMPUESTO_ISR = '001' as const;

/** IVA - Impuesto al Valor Agregado */
export const IMPUESTO_IVA = '002' as const;

/** IEPS - Impuesto Especial sobre Produccion y Servicios */
export const IMPUESTO_IEPS = '003' as const;

export const IMPUESTO_CODES = [IMPUESTO_ISR, IMPUESTO_IVA, IMPUESTO_IEPS] as const;
export type ImpuestoCode = (typeof IMPUESTO_CODES)[number];

// ============================================
// TIPO FACTOR
// ============================================

/** Tasa - Rate-based tax */
export const TIPO_FACTOR_TASA = 'Tasa' as const;

/** Exento - Exempt from tax */
export const TIPO_FACTOR_EXENTO = 'Exento' as const;

/** Cuota - Fixed amount tax */
export const TIPO_FACTOR_CUOTA = 'Cuota' as const;

export const TIPO_FACTOR_VALUES = [TIPO_FACTOR_TASA, TIPO_FACTOR_EXENTO, TIPO_FACTOR_CUOTA] as const;
export type TipoFactor = (typeof TIPO_FACTOR_VALUES)[number];

// ============================================
// IVA RATES (6 decimal places)
// ============================================

/** General IVA rate 16% */
export const IVA_GENERAL = '0.160000' as const;

/** Border zone IVA rate 8% */
export const IVA_FRONTERA = '0.080000' as const;

/** Zero IVA rate */
export const IVA_CERO = '0.000000' as const;

// ============================================
// RETENTION RATES (6 decimal places)
// ============================================

/** ISR retention for honorarios 10% */
export const ISR_RETENCION_HONORARIOS = '0.100000' as const;

/** ISR retention for arrendamiento 10% */
export const ISR_RETENCION_ARRENDAMIENTO = '0.100000' as const;

/** IVA retention for servicios 10.6667% (2/3 of 16%) */
export const IVA_RETENCION_SERVICIOS = '0.106667' as const;

/** IVA retention for arrendamiento 10.6667% */
export const IVA_RETENCION_ARRENDAMIENTO = '0.106667' as const;

// ============================================
// SPECIAL RFC VALUES
// ============================================

/** RFC for PUBLICO EN GENERAL (global invoices) */
export const RFC_PUBLICO_GENERAL = 'XAXX010101000' as const;

/** RFC for foreign customers */
export const RFC_EXTRANJERO = 'XEXX010101000' as const;

// ============================================
// USO CFDI CODES
// ============================================

/** Sin efectos fiscales - For XAXX/XEXX customers */
export const USO_CFDI_SIN_EFECTOS = 'S01' as const;

/** Por definir - Unspecified use */
export const USO_CFDI_POR_DEFINIR = 'P01' as const;

/** Pagos - Payment complement */
export const USO_CFDI_PAGO = 'CP01' as const;

// ============================================
// REGIMEN FISCAL CODES
// ============================================

/** Sin obligaciones fiscales - For XAXX customers */
export const REGIMEN_SIN_OBLIGACIONES = '616' as const;

// ============================================
// FORMA PAGO CODES
// ============================================

/** Por definir - Payment form not yet determined (for PPD) */
export const FORMA_PAGO_POR_DEFINIR = '99' as const;

// ============================================
// TIPO DE COMPROBANTE
// ============================================

/** Ingreso - Income */
export const TIPO_COMPROBANTE_INGRESO = 'I' as const;

/** Egreso - Credit note */
export const TIPO_COMPROBANTE_EGRESO = 'E' as const;

/** Traslado - Transfer */
export const TIPO_COMPROBANTE_TRASLADO = 'T' as const;

/** Pago - Payment complement */
export const TIPO_COMPROBANTE_PAGO = 'P' as const;

/** Nomina - Payroll */
export const TIPO_COMPROBANTE_NOMINA = 'N' as const;

export const TIPO_COMPROBANTE_VALUES = [
  TIPO_COMPROBANTE_INGRESO,
  TIPO_COMPROBANTE_EGRESO,
  TIPO_COMPROBANTE_TRASLADO,
  TIPO_COMPROBANTE_PAGO,
  TIPO_COMPROBANTE_NOMINA,
] as const;
export type TipoComprobante = (typeof TIPO_COMPROBANTE_VALUES)[number];

// ============================================
// EXPORTACION CODES
// ============================================

/** No aplica */
export const EXPORTACION_NO_APLICA = '01' as const;

/** Definitiva */
export const EXPORTACION_DEFINITIVA = '02' as const;

/** Temporal */
export const EXPORTACION_TEMPORAL = '03' as const;

/** Definitiva con clave A1 */
export const EXPORTACION_DEFINITIVA_A1 = '04' as const;

export const EXPORTACION_VALUES = [
  EXPORTACION_NO_APLICA,
  EXPORTACION_DEFINITIVA,
  EXPORTACION_TEMPORAL,
  EXPORTACION_DEFINITIVA_A1,
] as const;
export type Exportacion = (typeof EXPORTACION_VALUES)[number];

// ============================================
// METODO PAGO
// ============================================

/** Pago en una sola exhibicion */
export const METODO_PAGO_PUE = 'PUE' as const;

/** Pago en parcialidades o diferido */
export const METODO_PAGO_PPD = 'PPD' as const;

export const METODO_PAGO_VALUES = [METODO_PAGO_PUE, METODO_PAGO_PPD] as const;
export type MetodoPago = (typeof METODO_PAGO_VALUES)[number];

// ============================================
// OBJETO IMP (TAX OBJECT)
// ============================================

/** No objeto de impuesto */
export const OBJETO_IMP_NO_OBJETO = '01' as const;

/** Si objeto de impuesto */
export const OBJETO_IMP_SI_OBJETO = '02' as const;

/** Si objeto del impuesto y no obligado al desglose */
export const OBJETO_IMP_NO_DESGLOSE = '03' as const;

export const OBJETO_IMP_VALUES = [OBJETO_IMP_NO_OBJETO, OBJETO_IMP_SI_OBJETO, OBJETO_IMP_NO_DESGLOSE] as const;
export type ObjetoImp = (typeof OBJETO_IMP_VALUES)[number];

// ============================================
// PAYMENT COMPLEMENT CONSTANTS
// ============================================

/** ClaveProdServ for payment complement conceptos */
export const CLAVE_PROD_SERV_PAGO = '84111506' as const;

/** ClaveUnidad for payment complement conceptos */
export const CLAVE_UNIDAD_PAGO = 'ACT' as const;

// ============================================
// CURRENCY FOR PAYMENT COMPLEMENT
// ============================================

/** Currency code for payment complement (not a real currency) */
export const MONEDA_PAGO_XXX = 'XXX' as const;

// ============================================
// COMMON CURRENCIES
// ============================================

export const CURRENCY_MXN = 'MXN' as const;
export const CURRENCY_USD = 'USD' as const;
export const CURRENCY_EUR = 'EUR' as const;
export const CURRENCY_CAD = 'CAD' as const;

export const COMMON_CURRENCIES = [CURRENCY_MXN, CURRENCY_USD, CURRENCY_EUR, CURRENCY_CAD] as const;
