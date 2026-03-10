/**
 * PDF Styles & SAT Catalogs (Component 16)
 *
 * All layout constants, colors, fonts, and SAT catalog label maps.
 * PDFKit uses points (72 pts = 1 inch).
 * US Letter: 612 x 792 pts. A4: 595.28 x 841.89 pts.
 */

import type { LayoutConfig, BrandingSettings } from './types';

// ============================================================================
// Page Size Constants
// ============================================================================

export const PAGE_SIZES = {
  LETTER: { width: 612, height: 792 },
  A4: { width: 595.28, height: 841.89 },
} as const;

export const DEFAULT_MARGIN = { top: 40, right: 40, bottom: 40, left: 40 };

// ============================================================================
// Color Palette
// ============================================================================

export const DEFAULT_COLORS = {
  primary: '#1E3A5F', // Dark navy blue - professional
  secondary: '#EBF2FA', // Light blue background for header bands
  text: '#111827', // Near-black for body text
  muted: '#6B7280', // Gray for labels and secondary text
  border: '#D1D5DB', // Light gray for table borders
  headerBg: '#1E3A5F', // Same as primary for header bar
  white: '#FFFFFF',
  accent: '#10B981', // Green for paid/stamped status indicator
} as const;

// ============================================================================
// Font Configuration
// ============================================================================

export const FONTS = {
  regular: 'Helvetica',
  bold: 'Helvetica-Bold',
  sizes: {
    tiny: 6,
    small: 7.5,
    normal: 9,
    medium: 10,
    large: 12,
    title: 14,
    heading: 18,
  },
} as const;

// ============================================================================
// Table Column Widths (for items table)
// ============================================================================

/**
 * Column widths for the items table in points.
 * Must sum to contentWidth (532 for LETTER with 40pt margins).
 */
export const ITEMS_TABLE_COLUMNS = {
  claveProdServ: 55, // SAT product key
  quantity: 45, // Cantidad
  unit: 40, // ClaveUnidad
  description: 187, // Descripción (largest)
  unitPrice: 65, // Valor Unitario
  discount: 50, // Descuento
  subtotal: 70, // Importe (right-aligned)
  // Note: discount column hidden when no items have discounts
} as const;

/**
 * Column widths without discount column.
 * Redistributes discount width to description.
 */
export const ITEMS_TABLE_COLUMNS_NO_DISCOUNT = {
  claveProdServ: 55,
  quantity: 45,
  unit: 40,
  description: 237, // description + discount
  unitPrice: 75,
  subtotal: 80,
} as const;

// ============================================================================
// Layout Configuration Builder
// ============================================================================

/**
 * Builds the full layout configuration for PDF rendering.
 *
 * @param pageSize - 'LETTER' or 'A4'
 * @param branding - Optional branding overrides for colors
 * @returns Complete LayoutConfig
 */
export function buildLayoutConfig(
  pageSize: 'LETTER' | 'A4',
  branding?: Partial<Pick<BrandingSettings, 'primaryColor' | 'secondaryColor'>>
): LayoutConfig {
  const pageDimensions = PAGE_SIZES[pageSize];

  return {
    pageWidth: pageDimensions.width,
    pageHeight: pageDimensions.height,
    margin: { ...DEFAULT_MARGIN },
    contentWidth: pageDimensions.width - DEFAULT_MARGIN.left - DEFAULT_MARGIN.right,
    colors: {
      primary: branding?.primaryColor || DEFAULT_COLORS.primary,
      secondary: branding?.secondaryColor || DEFAULT_COLORS.secondary,
      text: DEFAULT_COLORS.text,
      muted: DEFAULT_COLORS.muted,
      border: DEFAULT_COLORS.border,
      headerBg: branding?.primaryColor || DEFAULT_COLORS.headerBg,
      white: DEFAULT_COLORS.white,
      accent: DEFAULT_COLORS.accent,
    },
    fonts: {
      regular: FONTS.regular,
      bold: FONTS.bold,
      sizes: { ...FONTS.sizes },
    },
  };
}

// ============================================================================
// SAT Catalog Label Maps
// ============================================================================

/**
 * Tipo de Comprobante (Document Type)
 */
export const TIPO_COMPROBANTE: Record<string, string> = {
  I: 'Ingreso',
  E: 'Egreso',
  T: 'Traslado',
  N: 'Nómina',
  P: 'Pago',
};

/**
 * Forma de Pago (Payment Form)
 * Full SAT catalog c_FormaPago
 */
export const FORMA_PAGO: Record<string, string> = {
  '01': 'Efectivo',
  '02': 'Cheque nominativo',
  '03': 'Transferencia electrónica de fondos',
  '04': 'Tarjeta de crédito',
  '05': 'Monedero electrónico',
  '06': 'Dinero electrónico',
  '08': 'Vales de despensa',
  '12': 'Dación en pago',
  '13': 'Pago por subrogación',
  '14': 'Pago por consignación',
  '15': 'Condonación',
  '17': 'Compensación',
  '23': 'Novación',
  '24': 'Confusión',
  '25': 'Remisión de deuda',
  '26': 'Prescripción o caducidad',
  '27': 'A satisfacción del acreedor',
  '28': 'Tarjeta de débito',
  '29': 'Tarjeta de servicios',
  '30': 'Aplicación de anticipos',
  '31': 'Intermediario pagos',
  '99': 'Por definir',
};

/**
 * Método de Pago (Payment Method)
 */
export const METODO_PAGO: Record<string, string> = {
  PUE: 'Pago en una sola exhibición',
  PPD: 'Pago en parcialidades o diferido',
};

/**
 * Impuesto (Tax Type)
 */
export const IMPUESTO: Record<string, string> = {
  '001': 'ISR',
  '002': 'IVA',
  '003': 'IEPS',
};

/**
 * Uso CFDI (CFDI Use)
 * Full SAT catalog c_UsoCFDI
 */
export const USO_CFDI: Record<string, string> = {
  G01: 'Adquisición de mercancías',
  G02: 'Devoluciones, descuentos o bonificaciones',
  G03: 'Gastos en general',
  I01: 'Construcciones',
  I02: 'Mobiliario y equipo de oficina por inversiones',
  I03: 'Equipo de transporte',
  I04: 'Equipo de cómputo y accesorios',
  I05: 'Dados, troqueles, moldes, matrices y herramental',
  I06: 'Comunicaciones telefónicas',
  I07: 'Comunicaciones satelitales',
  I08: 'Otra maquinaria y equipo',
  D01: 'Honorarios médicos, dentales y gastos hospitalarios',
  D02: 'Gastos médicos por incapacidad o discapacidad',
  D03: 'Gastos funerales',
  D04: 'Donativos',
  D05: 'Intereses reales efectivamente pagados por créditos hipotecarios (casa habitación)',
  D06: 'Aportaciones voluntarias al SAR',
  D07: 'Primas por seguros de gastos médicos',
  D08: 'Gastos de transportación escolar obligatoria',
  D09: 'Depósitos en cuentas para el ahorro, primas que tengan como base planes de pensiones',
  D10: 'Pagos por servicios educativos (colegiaturas)',
  P01: 'Por definir',
  S01: 'Sin efectos fiscales',
  CP01: 'Pagos',
  CN01: 'Nómina',
};

/**
 * Régimen Fiscal (Tax Regime)
 * Full SAT catalog c_RegimenFiscal (26 values)
 */
export const REGIMEN_FISCAL: Record<string, string> = {
  '601': 'General de Ley Personas Morales',
  '603': 'Personas Morales con Fines no Lucrativos',
  '605': 'Sueldos y Salarios e Ingresos Asimilados a Salarios',
  '606': 'Arrendamiento',
  '607': 'Régimen de Enajenación o Adquisición de Bienes',
  '608': 'Demás ingresos',
  '609': 'Consolidación',
  '610': 'Residentes en el Extranjero sin Establecimiento Permanente en México',
  '611': 'Ingresos por Dividendos (socios y accionistas)',
  '612': 'Personas Físicas con Actividades Empresariales y Profesionales',
  '614': 'Ingresos por intereses',
  '615': 'Régimen de los ingresos por obtención de premios',
  '616': 'Sin obligaciones fiscales',
  '620': 'Sociedades Cooperativas de Producción que optan por diferir sus ingresos',
  '621': 'Incorporación Fiscal',
  '622': 'Actividades Agrícolas, Ganaderas, Silvícolas y Pesqueras',
  '623': 'Opcional para Grupos de Sociedades',
  '624': 'Coordinados',
  '625': 'Régimen de las Actividades Empresariales con ingresos a través de Plataformas Tecnológicas',
  '626': 'Régimen Simplificado de Confianza - RESICO',
};

/**
 * Objeto de Impuesto (Tax Object)
 */
export const OBJETO_IMPUESTO: Record<string, string> = {
  '01': 'No objeto de impuesto',
  '02': 'Sí objeto del impuesto',
  '03': 'Sí objeto del impuesto y no obligado al desglose',
};

/**
 * Exportación (Export Type)
 */
export const EXPORTACION: Record<string, string> = {
  '01': 'No aplica',
  '02': 'Definitiva',
  '03': 'Temporal',
  '04': 'Definitiva con clave distinta a A1 o con complemento de leyendas fiscales',
};

// ============================================================================
// Bilingual Label Maps
// ============================================================================

/**
 * All UI labels in Spanish and English.
 * Spanish is always primary; English shown below if language === 'en'.
 */
export const LABELS = {
  es: {
    // Document header
    invoice: 'FACTURA',
    fiscalReceipt: 'COMPROBANTE FISCAL DIGITAL POR INTERNET',
    cfdiVersion: 'Versión CFDI 4.0',

    // Sections
    issuer: 'DATOS DEL EMISOR',
    receiver: 'DATOS DEL RECEPTOR',
    items: 'CONCEPTOS',
    stampData: 'DATOS DEL TIMBRE FISCAL DIGITAL',

    // Table headers
    qty: 'Cant.',
    unit: 'Unidad',
    description: 'Descripción',
    unitPrice: 'P. Unitario',
    discount: 'Descuento',
    amount: 'Importe',
    claveProdServ: 'ClaveProdServ',

    // Totals
    subtotal: 'Subtotal',
    discount_total: 'Descuento',
    taxes: 'Impuestos',
    total: 'TOTAL',
    taxTransferred: 'Trasladado',
    taxWithheld: 'Retenido',

    // Stamp block
    fiscalFolio: 'Folio Fiscal (UUID)',
    stampDate: 'Fecha de Timbrado',
    pacRfc: 'RFC del PAC',
    satCertNo: 'No. Certificado SAT',
    issuerCertNo: 'No. Certificado Emisor',
    issuerSeal: 'Sello Digital del Emisor',
    satSeal: 'Sello del SAT',
    verifyAt: 'Verifique este comprobante en:',
    verifyUrl: 'https://verificacfdi.facturaelectronica.sat.gob.mx',

    // Invoice metadata
    cfdiType: 'Tipo de Comprobante',
    paymentForm: 'Forma de Pago',
    paymentMethod: 'Método de Pago',
    currency: 'Moneda',
    exchangeRate: 'Tipo de Cambio',
    taxRegime: 'Régimen Fiscal',
    cfdiUse: 'Uso CFDI',
    postalCode: 'C.P.',
    rfc: 'RFC',
    folio: 'Folio',
    series: 'Serie',
    date: 'Fecha',
    issuePlace: 'Lugar de Expedición',
    conditions: 'Condiciones de Pago',

    // Pagination
    page: 'Página',
    of: 'de',

    // Footer
    generatedBy: 'Este documento es una representación impresa de un CFDI',
  },
  en: {
    // Document header
    invoice: 'INVOICE',
    fiscalReceipt: 'MEXICAN DIGITAL TAX RECEIPT (CFDI 4.0)',
    cfdiVersion: 'CFDI Version 4.0',

    // Sections
    issuer: 'ISSUER',
    receiver: 'RECIPIENT',
    items: 'LINE ITEMS',
    stampData: 'DIGITAL STAMP DATA (TIMBRE FISCAL)',

    // Table headers
    qty: 'Qty',
    unit: 'Unit',
    description: 'Description',
    unitPrice: 'Unit Price',
    discount: 'Discount',
    amount: 'Amount',
    claveProdServ: 'Product Key',

    // Totals
    subtotal: 'Subtotal',
    discount_total: 'Discount',
    taxes: 'Taxes',
    total: 'TOTAL',
    taxTransferred: 'Transferred',
    taxWithheld: 'Withheld',

    // Stamp block
    fiscalFolio: 'Fiscal Folio (UUID)',
    stampDate: 'Stamp Date',
    pacRfc: 'PAC RFC',
    satCertNo: 'SAT Certificate No.',
    issuerCertNo: 'Issuer Certificate No.',
    issuerSeal: 'Issuer Digital Seal',
    satSeal: 'SAT Seal',
    verifyAt: 'Verify this invoice at:',
    verifyUrl: 'https://verificacfdi.facturaelectronica.sat.gob.mx',

    // Invoice metadata
    cfdiType: 'Document Type',
    paymentForm: 'Payment Method',
    paymentMethod: 'Payment Terms',
    currency: 'Currency',
    exchangeRate: 'Exchange Rate',
    taxRegime: 'Tax Regime',
    cfdiUse: 'CFDI Use',
    postalCode: 'Postal Code',
    rfc: 'RFC (Tax ID)',
    folio: 'Folio',
    series: 'Series',
    date: 'Date',
    issuePlace: 'Place of Issue',
    conditions: 'Payment Terms',

    // Pagination
    page: 'Page',
    of: 'of',

    // Footer
    generatedBy: 'This document is a printed representation of a CFDI',
  },
} as const;

// Labels type that works for both languages (using string values instead of literal types)
export type Labels = {
  [K in keyof (typeof LABELS)['es']]: string;
};

// Column types for items table
export type ItemsTableColumns = typeof ITEMS_TABLE_COLUMNS;
export type ItemsTableColumnsNoDiscount = typeof ITEMS_TABLE_COLUMNS_NO_DISCOUNT;

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get label for a SAT catalog code.
 *
 * @param catalog - The catalog map (e.g., TIPO_COMPROBANTE)
 * @param code - The code to look up
 * @param includeCode - Whether to include the code in the result
 * @returns Label string, e.g., "I - Ingreso" or "Ingreso"
 */
export function getCatalogLabel(
  catalog: Record<string, string>,
  code: string,
  includeCode = true
): string {
  const label = catalog[code] || 'Desconocido';
  return includeCode ? `${code} - ${label}` : label;
}

/**
 * Get tax type label.
 *
 * @param code - Tax code (001, 002, 003)
 * @returns Tax name (ISR, IVA, IEPS)
 */
export function getTaxLabel(code: string): string {
  return IMPUESTO[code] || code;
}

/**
 * Format tax rate for display.
 *
 * @param rate - Rate as decimal string (e.g., "0.160000")
 * @returns Formatted percentage (e.g., "16%")
 */
export function formatTaxRate(rate: string): string {
  const numRate = parseFloat(rate);
  if (isNaN(numRate)) return rate;
  return `${(numRate * 100).toFixed(0)}%`;
}

/**
 * Get labels for the specified language.
 *
 * @param language - 'es' or 'en'
 * @returns Labels object
 */
export function getLabels(language: 'es' | 'en'): Labels {
  return LABELS[language];
}
