/**
 * SAT Catalogs - Tax Regimes, CFDI Uses, and Mexican States
 * Component 6: Customer Management
 *
 * These catalogs are based on SAT's official catalogs (catálogos del SAT)
 * Source: http://omawww.sat.gob.mx/tramitesyservicios/Paginas/documentos/catCFDI.xsd
 *
 * Note: These are hardcoded constants for performance and type safety.
 * They can be moved to database if i18n or frequent updates are needed.
 */

import type { TaxRegime, CFDIUse, MexicanState } from './types';

// ============================================
// Tax Regimes (Régimen Fiscal)
// ============================================

export const TAX_REGIMES: Record<string, TaxRegime> = {
  '601': {
    code: '601',
    name: 'General de Ley Personas Morales',
    description: 'General Law for Legal Entities',
    applicable_to: 'legal_entity',
    is_active: true,
  },
  '603': {
    code: '603',
    name: 'Personas Morales con Fines no Lucrativos',
    description: 'Non-Profit Legal Entities',
    applicable_to: 'legal_entity',
    is_active: true,
  },
  '605': {
    code: '605',
    name: 'Sueldos y Salarios e Ingresos Asimilados a Salarios',
    description: 'Salaries and Similar Income',
    applicable_to: 'individual',
    is_active: true,
  },
  '606': {
    code: '606',
    name: 'Arrendamiento',
    description: 'Rental Income',
    applicable_to: 'individual',
    is_active: true,
  },
  '607': {
    code: '607',
    name: 'Régimen de Enajenación o Adquisición de Bienes',
    description: 'Sale or Acquisition of Goods',
    applicable_to: 'individual',
    is_active: true,
  },
  '608': {
    code: '608',
    name: 'Demás ingresos',
    description: 'Other Income',
    applicable_to: 'individual',
    is_active: true,
  },
  '610': {
    code: '610',
    name: 'Residentes en el Extranjero sin Establecimiento Permanente en México',
    description: 'Foreign Residents without Permanent Establishment in Mexico',
    applicable_to: 'both',
    is_active: true,
  },
  '611': {
    code: '611',
    name: 'Ingresos por Dividendos (socios y accionistas)',
    description: 'Dividend Income (Partners and Shareholders)',
    applicable_to: 'individual',
    is_active: true,
  },
  '612': {
    code: '612',
    name: 'Personas Físicas con Actividades Empresariales y Profesionales',
    description: 'Individuals with Business and Professional Activities',
    applicable_to: 'individual',
    is_active: true,
  },
  '614': {
    code: '614',
    name: 'Ingresos por intereses',
    description: 'Interest Income',
    applicable_to: 'individual',
    is_active: true,
  },
  '615': {
    code: '615',
    name: 'Régimen de los ingresos por obtención de premios',
    description: 'Prize Income',
    applicable_to: 'individual',
    is_active: true,
  },
  '616': {
    code: '616',
    name: 'Sin obligaciones fiscales',
    description: 'Without Tax Obligations',
    applicable_to: 'individual',
    is_active: true,
  },
  '620': {
    code: '620',
    name: 'Sociedades Cooperativas de Producción que optan por diferir sus ingresos',
    description: 'Production Cooperatives that Defer Income',
    applicable_to: 'legal_entity',
    is_active: true,
  },
  '621': {
    code: '621',
    name: 'Incorporación Fiscal',
    description: 'Fiscal Incorporation Regime',
    applicable_to: 'individual',
    is_active: true,
  },
  '622': {
    code: '622',
    name: 'Actividades Agrícolas, Ganaderas, Silvícolas y Pesqueras',
    description: 'Agricultural, Livestock, Forestry and Fishing Activities',
    applicable_to: 'both',
    is_active: true,
  },
  '623': {
    code: '623',
    name: 'Opcional para Grupos de Sociedades',
    description: 'Optional for Group of Companies',
    applicable_to: 'legal_entity',
    is_active: true,
  },
  '624': {
    code: '624',
    name: 'Coordinados',
    description: 'Coordinated',
    applicable_to: 'legal_entity',
    is_active: true,
  },
  '625': {
    code: '625',
    name: 'Régimen de las Actividades Empresariales con ingresos a través de Plataformas Tecnológicas',
    description: 'Business Activities through Digital Platforms',
    applicable_to: 'individual',
    is_active: true,
  },
  '626': {
    code: '626',
    name: 'Régimen Simplificado de Confianza',
    description: 'Simplified Trust Regime (RESICO)',
    applicable_to: 'both',
    is_active: true,
  },
} as const;

// ============================================
// CFDI Use Codes (Uso de CFDI)
// ============================================

export const CFDI_USES: Record<string, CFDIUse> = {
  // Acquisition (Adquisición)
  G01: {
    code: 'G01',
    name: 'Adquisición de mercancías',
    description: 'Acquisition of goods',
    applicable_to: 'both',
    is_active: true,
  },
  G02: {
    code: 'G02',
    name: 'Devoluciones, descuentos o bonificaciones',
    description: 'Returns, discounts or bonuses',
    applicable_to: 'both',
    is_active: true,
  },
  G03: {
    code: 'G03',
    name: 'Gastos en general',
    description: 'General expenses',
    applicable_to: 'both',
    is_active: true,
  },

  // Investments (Inversiones)
  I01: {
    code: 'I01',
    name: 'Construcciones',
    description: 'Constructions',
    applicable_to: 'both',
    is_active: true,
  },
  I02: {
    code: 'I02',
    name: 'Mobiliario y equipo de oficina por inversiones',
    description: 'Office furniture and equipment for investments',
    applicable_to: 'both',
    is_active: true,
  },
  I03: {
    code: 'I03',
    name: 'Equipo de transporte',
    description: 'Transportation equipment',
    applicable_to: 'both',
    is_active: true,
  },
  I04: {
    code: 'I04',
    name: 'Equipo de computo y accesorios',
    description: 'Computer equipment and accessories',
    applicable_to: 'both',
    is_active: true,
  },
  I05: {
    code: 'I05',
    name: 'Dados, troqueles, moldes, matrices y herramental',
    description: 'Dies, stamps, molds, matrices and tooling',
    applicable_to: 'both',
    is_active: true,
  },
  I06: {
    code: 'I06',
    name: 'Comunicaciones telefónicas',
    description: 'Telephone communications',
    applicable_to: 'both',
    is_active: true,
  },
  I07: {
    code: 'I07',
    name: 'Comunicaciones satelitales',
    description: 'Satellite communications',
    applicable_to: 'both',
    is_active: true,
  },
  I08: {
    code: 'I08',
    name: 'Otra maquinaria y equipo',
    description: 'Other machinery and equipment',
    applicable_to: 'both',
    is_active: true,
  },

  // Deductions (Deducciones) - Personal
  D01: {
    code: 'D01',
    name: 'Honorarios médicos, dentales y gastos hospitalarios',
    description: 'Medical, dental and hospital expenses',
    applicable_to: 'individual',
    is_active: true,
  },
  D02: {
    code: 'D02',
    name: 'Gastos médicos por incapacidad o discapacidad',
    description: 'Medical expenses for disabilities',
    applicable_to: 'individual',
    is_active: true,
  },
  D03: {
    code: 'D03',
    name: 'Gastos funerales',
    description: 'Funeral expenses',
    applicable_to: 'individual',
    is_active: true,
  },
  D04: {
    code: 'D04',
    name: 'Donativos',
    description: 'Donations',
    applicable_to: 'individual',
    is_active: true,
  },
  D05: {
    code: 'D05',
    name: 'Intereses reales efectivamente pagados por créditos hipotecarios',
    description: 'Real interest paid for mortgage loans',
    applicable_to: 'individual',
    is_active: true,
  },
  D06: {
    code: 'D06',
    name: 'Aportaciones voluntarias al SAR',
    description: 'Voluntary contributions to SAR',
    applicable_to: 'individual',
    is_active: true,
  },
  D07: {
    code: 'D07',
    name: 'Primas por seguros de gastos médicos',
    description: 'Medical insurance premiums',
    applicable_to: 'individual',
    is_active: true,
  },
  D08: {
    code: 'D08',
    name: 'Gastos de transportación escolar obligatoria',
    description: 'Mandatory school transportation expenses',
    applicable_to: 'individual',
    is_active: true,
  },
  D09: {
    code: 'D09',
    name: 'Depósitos en cuentas para el ahorro, primas que tengan como base planes de pensiones',
    description: 'Deposits in savings accounts and pension plan premiums',
    applicable_to: 'individual',
    is_active: true,
  },
  D10: {
    code: 'D10',
    name: 'Pagos por servicios educativos (colegiaturas)',
    description: 'Payments for educational services (tuition)',
    applicable_to: 'individual',
    is_active: true,
  },

  // Special Cases
  S01: {
    code: 'S01',
    name: 'Sin efectos fiscales',
    description: 'Without tax effects',
    applicable_to: 'both',
    is_active: true,
  },
  CP01: {
    code: 'CP01',
    name: 'Pagos',
    description: 'Payments',
    applicable_to: 'both',
    is_active: true,
  },
  CN01: {
    code: 'CN01',
    name: 'Nómina',
    description: 'Payroll',
    applicable_to: 'both',
    is_active: true,
  },

  // To be defined (temporary)
  P01: {
    code: 'P01',
    name: 'Por definir',
    description: 'To be defined (temporary - must be replaced)',
    applicable_to: 'both',
    is_active: true,
  },
} as const;

// ============================================
// Mexican States (Estados de México)
// ============================================

export const MEXICAN_STATES: Record<string, MexicanState> = {
  AGS: { code: 'AGS', name: 'Aguascalientes', postal_code_prefix: ['20'] },
  BC: { code: 'BC', name: 'Baja California', postal_code_prefix: ['21', '22'] },
  BCS: { code: 'BCS', name: 'Baja California Sur', postal_code_prefix: ['23'] },
  CAMP: { code: 'CAMP', name: 'Campeche', postal_code_prefix: ['24'] },
  COAH: { code: 'COAH', name: 'Coahuila', postal_code_prefix: ['25', '26', '27'] },
  COL: { code: 'COL', name: 'Colima', postal_code_prefix: ['28'] },
  CHIS: { code: 'CHIS', name: 'Chiapas', postal_code_prefix: ['29', '30'] },
  CHIH: { code: 'CHIH', name: 'Chihuahua', postal_code_prefix: ['31', '32', '33'] },
  CDMX: { code: 'CDMX', name: 'Ciudad de México', postal_code_prefix: ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12', '13', '14', '15', '16'] },
  DGO: { code: 'DGO', name: 'Durango', postal_code_prefix: ['34', '35'] },
  GTO: { code: 'GTO', name: 'Guanajuato', postal_code_prefix: ['36', '37', '38'] },
  GRO: { code: 'GRO', name: 'Guerrero', postal_code_prefix: ['39', '40', '41'] },
  HGO: { code: 'HGO', name: 'Hidalgo', postal_code_prefix: ['42', '43'] },
  JAL: { code: 'JAL', name: 'Jalisco', postal_code_prefix: ['44', '45', '46', '47', '48', '49'] },
  MEX: { code: 'MEX', name: 'Estado de México', postal_code_prefix: ['50', '51', '52', '53', '54', '55', '56', '57'] },
  MICH: { code: 'MICH', name: 'Michoacán', postal_code_prefix: ['58', '59', '60', '61'] },
  MOR: { code: 'MOR', name: 'Morelos', postal_code_prefix: ['62'] },
  NAY: { code: 'NAY', name: 'Nayarit', postal_code_prefix: ['63'] },
  NL: { code: 'NL', name: 'Nuevo León', postal_code_prefix: ['64', '65', '66', '67'] },
  OAX: { code: 'OAX', name: 'Oaxaca', postal_code_prefix: ['68', '69', '70', '71'] },
  PUE: { code: 'PUE', name: 'Puebla', postal_code_prefix: ['72', '73', '74', '75'] },
  QRO: { code: 'QRO', name: 'Querétaro', postal_code_prefix: ['76'] },
  QROO: { code: 'QROO', name: 'Quintana Roo', postal_code_prefix: ['77'] },
  SLP: { code: 'SLP', name: 'San Luis Potosí', postal_code_prefix: ['78', '79'] },
  SIN: { code: 'SIN', name: 'Sinaloa', postal_code_prefix: ['80', '81', '82'] },
  SON: { code: 'SON', name: 'Sonora', postal_code_prefix: ['83', '84', '85'] },
  TAB: { code: 'TAB', name: 'Tabasco', postal_code_prefix: ['86'] },
  TAMPS: { code: 'TAMPS', name: 'Tamaulipas', postal_code_prefix: ['87', '88', '89'] },
  TLAX: { code: 'TLAX', name: 'Tlaxcala', postal_code_prefix: ['90'] },
  VER: { code: 'VER', name: 'Veracruz', postal_code_prefix: ['91', '92', '93', '94', '95', '96'] },
  YUC: { code: 'YUC', name: 'Yucatán', postal_code_prefix: ['97'] },
  ZAC: { code: 'ZAC', name: 'Zacatecas', postal_code_prefix: ['98', '99'] },
} as const;

// ============================================
// Generic/Special RFCs
// ============================================

export const SPECIAL_RFCS = {
  GENERIC_FOREIGN: 'XAXX010101000', // For foreign customers without RFC
  GENERIC_NATIONAL: 'XEXX010101000', // For general public (público en general)
} as const;

// ============================================
// Forbidden Words in RFC
// ============================================

export const RFC_FORBIDDEN_WORDS = [
  'BUEI', 'BUEY', 'CACA', 'CACO', 'CAGA', 'CAGO', 'CAKA', 'CAKO',
  'COGE', 'COGI', 'COJA', 'COJE', 'COJI', 'COJO', 'COLA', 'CULO',
  'FALO', 'FETO', 'GETA', 'GUEI', 'GUEY', 'JETA', 'JOTO', 'KACA',
  'KACO', 'KAGA', 'KAGO', 'KAKA', 'KAKO', 'KOGE', 'KOGI', 'KOJA',
  'KOJE', 'KOJI', 'KOJO', 'KOLA', 'KULO', 'LILO', 'LOCA', 'LOCO',
  'LOKA', 'LOKO', 'MAME', 'MAMO', 'MEAR', 'MEAS', 'MEON', 'MIAR',
  'MION', 'MOCO', 'MOKO', 'MULA', 'MULO', 'NACA', 'NACO', 'PEDA',
  'PEDO', 'PENE', 'PIPI', 'PITO', 'POPO', 'PUTA', 'PUTO', 'QULO',
  'RATA', 'ROBA', 'ROBE', 'ROBO', 'RUIN', 'SENO', 'TETA', 'VACA',
  'VAGA', 'VAGO', 'VAKA', 'VUEI', 'VUEY', 'WUEI', 'WUEY',
] as const;

// ============================================
// Helper Functions
// ============================================

/**
 * Get all active tax regimes
 */
export function getTaxRegimes(): TaxRegime[] {
  return Object.values(TAX_REGIMES).filter((regime) => regime.is_active);
}

/**
 * Get tax regime by code
 */
export function getTaxRegimeInfo(code: string): TaxRegime | undefined {
  return TAX_REGIMES[code];
}

/**
 * Get tax regimes for a specific type (legal entity or individual)
 */
export function getTaxRegimesForType(
  type: 'legal_entity' | 'individual'
): TaxRegime[] {
  return Object.values(TAX_REGIMES).filter(
    (regime) =>
      regime.is_active &&
      (regime.applicable_to === type || regime.applicable_to === 'both')
  );
}

/**
 * Check if tax regime is valid
 */
export function isValidTaxRegime(code: string): boolean {
  const regime = TAX_REGIMES[code];
  return regime !== undefined && regime.is_active;
}

/**
 * Get all active CFDI uses
 */
export function getCFDIUses(): CFDIUse[] {
  return Object.values(CFDI_USES).filter((use) => use.is_active);
}

/**
 * Get CFDI use by code
 */
export function getCFDIUseInfo(code: string): CFDIUse | undefined {
  return CFDI_USES[code];
}

/**
 * Get CFDI uses for a specific type (legal entity or individual)
 */
export function getCFDIUsesForType(
  type: 'legal_entity' | 'individual'
): CFDIUse[] {
  return Object.values(CFDI_USES).filter(
    (use) =>
      use.is_active &&
      (use.applicable_to === type || use.applicable_to === 'both')
  );
}

/**
 * Check if CFDI use is valid
 */
export function isValidCFDIUse(code: string): boolean {
  const use = CFDI_USES[code];
  return use !== undefined && use.is_active;
}

/**
 * Get all Mexican states
 */
export function getMexicanStates(): MexicanState[] {
  return Object.values(MEXICAN_STATES);
}

/**
 * Get state by code
 */
export function getStateInfo(code: string): MexicanState | undefined {
  return MEXICAN_STATES[code.toUpperCase()];
}

/**
 * Check if state code is valid
 */
export function isValidStateCode(code: string): boolean {
  return MEXICAN_STATES[code.toUpperCase()] !== undefined;
}

/**
 * Get state by postal code prefix
 */
export function getStateByPostalCode(postalCode: string): MexicanState | undefined {
  const prefix = postalCode.substring(0, 2);
  return Object.values(MEXICAN_STATES).find((state) =>
    state.postal_code_prefix?.includes(prefix)
  );
}

/**
 * Auto-suggest tax regime based on RFC type
 */
export function suggestTaxRegime(
  rfcLength: number
): { code: string; name: string }[] {
  if (rfcLength === 12) {
    // Legal entity - suggest 601
    const regime601 = TAX_REGIMES['601'];
    const regime603 = TAX_REGIMES['603'];
    return [
      { code: '601', name: regime601?.name || 'General Law for Legal Entities' },
      { code: '603', name: regime603?.name || 'Non-Profit Legal Entities' },
    ];
  } else if (rfcLength === 13) {
    // Individual - suggest 612
    const regime612 = TAX_REGIMES['612'];
    const regime605 = TAX_REGIMES['605'];
    const regime621 = TAX_REGIMES['621'];
    return [
      { code: '612', name: regime612?.name || 'Individuals with Business Activities' },
      { code: '605', name: regime605?.name || 'Salaries and Income' },
      { code: '621', name: regime621?.name || 'Fiscal Incorporation' },
    ];
  }
  return [];
}

/**
 * Auto-suggest CFDI use (most common)
 */
export function suggestCFDIUse(): { code: string; name: string }[] {
  const useG03 = CFDI_USES['G03'];
  const useG01 = CFDI_USES['G01'];
  const useI01 = CFDI_USES['I01'];
  return [
    { code: 'G03', name: useG03?.name || 'General expenses' },
    { code: 'G01', name: useG01?.name || 'Acquisition of goods' },
    { code: 'I01', name: useI01?.name || 'Constructions' },
  ];
}
