/**
 * CFDI 4.0 TypeScript Types
 *
 * Interfaces that represent the CFDI 4.0 XML structure.
 * These are distinct from the Invoice types in Component 12 -
 * they match the XSD exactly with Spanish field names.
 */

// ============================================
// CFDI COMPROBANTE (ROOT ELEMENT)
// ============================================

/**
 * Matches the cfdi:Comprobante XML element attributes
 */
export interface CFDIComprobante {
  Version: '4.0';
  Serie?: string;
  Folio?: string;
  Fecha: string; // ISO datetime: "2024-03-01T10:00:00"
  Sello: string; // Empty string before signing
  FormaPago?: string; // Omitted for TipoDeComprobante=P
  NoCertificado: string; // 20-char certificate number
  Certificado: string; // Base64 certificate (empty before signing)
  CondicionesDePago?: string;
  SubTotal: string; // Decimal string "10000.00"
  Descuento?: string; // Only if > 0
  Moneda: string;
  TipoCambio?: string; // Only for non-MXN
  Total: string;
  TipoDeComprobante: 'I' | 'E' | 'T' | 'P' | 'N';
  Exportacion: string; // "01" default
  MetodoPago?: string; // Omitted for TipoDeComprobante=P
  LugarExpedicion: string; // Zip code
  Confirmacion?: string;
  InformacionGlobal?: CFDIInformacionGlobal;
  CfdiRelacionados?: CFDICfdiRelacionados[];
  Emisor: CFDIEmisor;
  Receptor: CFDIReceptor;
  Conceptos: CFDIConcepto[];
  Impuestos?: CFDIImpuestos;
  Complemento?: CFDIComplemento;
}

// ============================================
// EMISOR (ISSUER)
// ============================================

export interface CFDIEmisor {
  Rfc: string;
  Nombre: string;
  RegimenFiscal: string;
}

// ============================================
// RECEPTOR (RECEIVER)
// ============================================

export interface CFDIReceptor {
  Rfc: string;
  Nombre: string;
  DomicilioFiscalReceptor: string; // Zip code - required in 4.0
  RegimenFiscalReceptor: string; // Required in 4.0
  UsoCFDI: string;
  ResidenciaFiscal?: string; // For foreign customers
  NumRegIdTrib?: string; // Foreign tax ID
}

// ============================================
// CONCEPTO (LINE ITEM)
// ============================================

export interface CFDIConcepto {
  ClaveProdServ: string;
  NoIdentificacion?: string; // SKU - optional
  Cantidad: string;
  ClaveUnidad: string;
  Unidad?: string; // Human-readable unit - optional
  Descripcion: string;
  ValorUnitario: string;
  Importe: string;
  Descuento?: string; // Only if > 0
  ObjetoImp: '01' | '02' | '03';
  Impuestos?: CFDIConceptoImpuestos;
}

// ============================================
// CONCEPTO-LEVEL IMPUESTOS
// ============================================

export interface CFDIConceptoImpuestos {
  Traslados?: CFDIConceptoTraslado[];
  Retenciones?: CFDIConceptoRetencion[];
}

export interface CFDIConceptoTraslado {
  Base: string;
  Impuesto: '001' | '002' | '003';
  TipoFactor: 'Tasa' | 'Exento';
  TasaOCuota?: string; // Omitted when TipoFactor=Exento
  Importe?: string; // Omitted when TipoFactor=Exento
}

export interface CFDIConceptoRetencion {
  Base: string;
  Impuesto: '001' | '002' | '003';
  TipoFactor: 'Tasa';
  TasaOCuota: string;
  Importe: string;
}

// ============================================
// COMPROBANTE-LEVEL IMPUESTOS (SUMMARY)
// ============================================

export interface CFDIImpuestos {
  TotalImpuestosRetenidos?: string;
  TotalImpuestosTrasladados?: string;
  Retenciones?: CFDISummaryRetencion[];
  Traslados?: CFDISummaryTraslado[];
}

/**
 * Summary-level Retencion (at Comprobante level)
 * Grouped by Impuesto only
 */
export interface CFDISummaryRetencion {
  Impuesto: '001' | '002' | '003';
  Importe: string;
}

/**
 * Summary-level Traslado (at Comprobante level)
 * Grouped by Impuesto+TipoFactor+TasaOCuota
 */
export interface CFDISummaryTraslado {
  Base: string;
  Impuesto: '001' | '002' | '003';
  TipoFactor: 'Tasa' | 'Exento';
  TasaOCuota?: string; // Omitted when TipoFactor=Exento
  Importe?: string; // Omitted when TipoFactor=Exento
}

// ============================================
// RELATED CFDIS
// ============================================

export interface CFDICfdiRelacionados {
  TipoRelacion: string;
  CfdiRelacionado: Array<{ UUID: string }>;
}

// ============================================
// GLOBAL INVOICE INFO
// ============================================

export interface CFDIInformacionGlobal {
  Periodicidad: string;
  Meses: string;
  Año: string;
}

// ============================================
// COMPLEMENTO (EXTENSIONS)
// ============================================

export interface CFDIComplemento {
  TimbreFiscalDigital?: CFDITimbreFiscalDigital;
  Pagos20?: Pagos20Complement;
}

export interface CFDITimbreFiscalDigital {
  Version: '1.1';
  UUID: string;
  FechaTimbrado: string;
  RfcProvCertif: string;
  SelloCFD: string;
  NoCertificadoSAT: string;
  SelloSAT: string;
}

// ============================================
// PAGOS 2.0 COMPLEMENT TYPES
// ============================================

export interface Pagos20Complement {
  Version: '2.0';
  Totales: Pagos20Totales;
  Pago: Pagos20Pago[];
}

export interface Pagos20Totales {
  TotalRetencionesIVA?: string;
  TotalRetencionesISR?: string;
  TotalRetencionesIEPS?: string;
  TotalTrasladosBaseIVA16?: string;
  TotalTrasladosImpuestoIVA16?: string;
  TotalTrasladosBaseIVA8?: string;
  TotalTrasladosImpuestoIVA8?: string;
  TotalTrasladosBaseIVA0?: string;
  TotalTrasladosImpuestoIVA0?: string;
  TotalTrasladosBaseIVAExento?: string;
  MontoTotalPagos: string;
}

export interface Pagos20Pago {
  FechaPago: string; // ISO datetime
  FormaDePagoP: string; // FormaPago code (not 99)
  MonedaP: string; // Currency of the payment
  TipoCambioP?: string; // Exchange rate if not MXN
  Monto: string; // Payment amount
  NumOperacion?: string; // Bank operation number
  RfcEmisorCtaOrd?: string; // Payer bank RFC
  NomBancoOrdExt?: string; // Payer bank name (for foreign banks)
  CtaOrdenante?: string; // Payer account
  RfcEmisorCtaBen?: string; // Beneficiary bank RFC
  CtaBeneficiario?: string; // Beneficiary account
  TipoCadPago?: string; // SPEI chain type
  CertPago?: string; // Certificate
  CadPago?: string; // Payment chain
  SelloPago?: string; // Payment seal
  DoctoRelacionado: Pagos20DoctoRelacionado[];
  ImpuestosP?: Pagos20ImpuestosP;
}

export interface Pagos20DoctoRelacionado {
  IdDocumento: string; // UUID of the original invoice (PPD)
  Serie?: string;
  Folio?: string;
  MonedaDR: string; // Currency of the original invoice
  EquivalenciaDR: string; // Exchange rate between payment and invoice currencies
  NumParcialidad: string; // Payment installment number ("1" for first)
  ImpSaldoAnt: string; // Previous balance
  ImpPagado: string; // Amount paid with this payment
  ImpSaldoInsoluto: string; // Remaining balance after payment
  ObjetoImpDR: '01' | '02' | '03';
  ImpuestosDR?: Pagos20ImpuestosDR;
}

export interface Pagos20ImpuestosP {
  RetencionesP?: Array<{ ImpuestoP: string; ImporteP: string }>;
  TrasladosP?: Array<{
    BaseP: string;
    ImpuestoP: string;
    TipoFactorP: string;
    TasaOCuotaP?: string;
    ImporteP?: string;
  }>;
}

export interface Pagos20ImpuestosDR {
  RetencionesDR?: Array<{
    BaseDR: string;
    ImpuestoDR: string;
    TipoFactorDR: string;
    TasaOCuotaDR?: string;
    ImporteDR?: string;
  }>;
  TrasladosDR?: Array<{
    BaseDR: string;
    ImpuestoDR: string;
    TipoFactorDR: string;
    TasaOCuotaDR?: string;
    ImporteDR?: string;
  }>;
}

// ============================================
// GENERATOR INPUT TYPES
// ============================================

/**
 * Input type: what the generator receives from Component 12
 * Field names match the Component 12 database column names
 */
export interface CFDIGeneratorInput {
  invoice: {
    id: string;
    uuid?: string;
    serie?: string;
    folio?: string;
    issue_date: string;
    tipo_comprobante: 'I' | 'E' | 'T' | 'P';
    payment_method?: string; // PUE | PPD
    payment_form?: string;
    currency: string;
    exchange_rate: number;
    exportacion: string;
    conditions?: string;
    subtotal: number;
    discount: number;
    total: number;
    issuer_rfc: string;
    issuer_name: string;
    issuer_tax_regime: string;
    issuer_zip_code: string;
    receiver_rfc: string;
    receiver_name: string;
    receiver_tax_regime: string;
    receiver_zip_code: string;
    receiver_cfdi_use: string;
    is_global: boolean;
    global_periodicity?: string;
    global_months?: string;
    global_year?: string;
    related_cfdi?: Array<{
      tipo_relacion: string;
      related_uuid: string;
    }>;
    items: CFDIItemInput[];
    stamps?: {
      certificate_number: string;
      certificate: string;
      seal: string;
    };
  };
}

/**
 * Invoice item input matching Component 12's invoice_items columns
 */
export interface CFDIItemInput {
  product_service_key: string; // ClaveProdServ (Component 12 column name)
  unit_key: string; // ClaveUnidad (Component 12 column name)
  unit_name?: string;
  sku?: string;
  description: string;
  quantity: number;
  unit_price: number;
  discount_amount: number;
  tax_object: '01' | '02' | '03';
  tax_breakdown: TaxBreakdownRecord[];
}

/**
 * Tax breakdown record from Component 12's invoice_items.tax_breakdown JSONB
 */
export interface TaxBreakdownRecord {
  type: 'traslado' | 'retencion';
  impuesto: '001' | '002' | '003';
  tipo_factor: 'Tasa' | 'Exento';
  tasa_o_cuota?: string;
  base: string;
  importe?: string;
}

// ============================================
// GENERATOR OUTPUT TYPES
// ============================================

export interface CFDIGeneratorResult {
  xml: string; // The complete XML string
  xmlUnsigned: string; // XML before Sello is applied (identical pre-signing)
}

export interface CadenaOriginalResult {
  cadena: string; // The pipe-delimited cadena original string
  sha256: string; // SHA-256 hex digest (Component 14 uses this for signing)
}

// ============================================
// VALIDATION TYPES
// ============================================

export interface CFDIValidationResult {
  valid: boolean;
  errors: CFDIValidationError[];
  warnings: CFDIValidationWarning[];
}

export interface CFDIValidationError {
  code: string;
  field?: string;
  message: string;
}

export interface CFDIValidationWarning {
  code: string;
  field?: string;
  message: string;
}

// ============================================
// PAGOS 2.0 INPUT TYPE
// ============================================

export interface Pagos20Input {
  version: '2.0';
  totalRetencionesIVA?: string;
  totalRetencionesISR?: string;
  totalRetencionesIEPS?: string;
  totalTrasladosBaseIVA16?: string;
  totalTrasladosImpuestoIVA16?: string;
  totalTrasladosBaseIVA8?: string;
  totalTrasladosImpuestoIVA8?: string;
  totalTrasladosBaseIVA0?: string;
  totalTrasladosImpuestoIVA0?: string;
  totalTrasladosBaseIVAExento?: string;
  montoTotalPagos: string;
  payments: Pagos20PaymentInput[];
}

export interface Pagos20PaymentInput {
  fechaPago: string;
  formaDePagoP: string;
  monedaP: string;
  tipoCambioP?: string;
  monto: string;
  numOperacion?: string;
  rfcEmisorCtaOrd?: string;
  nomBancoOrdExt?: string;
  ctaOrdenante?: string;
  rfcEmisorCtaBen?: string;
  ctaBeneficiario?: string;
  tipoCadPago?: string;
  certPago?: string;
  cadPago?: string;
  selloPago?: string;
  documentosRelacionados: Pagos20DoctoRelacionadoInput[];
  impuestosP?: Pagos20ImpuestosPInput;
}

export interface Pagos20DoctoRelacionadoInput {
  idDocumento: string;
  serie?: string;
  folio?: string;
  monedaDR: string;
  equivalenciaDR: string;
  numParcialidad: string;
  impSaldoAnt: string;
  impPagado: string;
  impSaldoInsoluto: string;
  objetoImpDR: '01' | '02' | '03';
  impuestosDR?: Pagos20ImpuestosDRInput;
}

export interface Pagos20ImpuestosPInput {
  retencionesP?: Array<{ impuestoP: string; importeP: string }>;
  trasladosP?: Array<{
    baseP: string;
    impuestoP: string;
    tipoFactorP: string;
    tasaOCuotaP?: string;
    importeP?: string;
  }>;
}

export interface Pagos20ImpuestosDRInput {
  retencionesDR?: Array<{
    baseDR: string;
    impuestoDR: string;
    tipoFactorDR: string;
    tasaOCuotaDR?: string;
    importeDR?: string;
  }>;
  trasladosDR?: Array<{
    baseDR: string;
    impuestoDR: string;
    tipoFactorDR: string;
    tasaOCuotaDR?: string;
    importeDR?: string;
  }>;
}
