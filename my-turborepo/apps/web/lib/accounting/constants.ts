/**
 * Accounting Subsystem Constants (Components 21-23)
 *
 * SAT Código Agrupador mapping, account type classification,
 * and other shared constants.
 */

import type { AccountType, Naturaleza } from './types';

// ============================================
// Account Type → SAT Agrupador Range Mapping
// ============================================

/** Maps account types to their SAT agrupador code ranges */
export const ACCOUNT_TYPE_RANGES: Record<AccountType, { min: number; max: number; label: string; labelEs: string }> = {
  asset:                { min: 100, max: 199, label: 'Assets',               labelEs: 'Activo' },
  liability:            { min: 200, max: 299, label: 'Liabilities',          labelEs: 'Pasivo' },
  equity:               { min: 300, max: 399, label: 'Equity',               labelEs: 'Capital' },
  revenue:              { min: 400, max: 499, label: 'Revenue',              labelEs: 'Ingresos' },
  cost_of_sales:        { min: 500, max: 599, label: 'Cost of Sales',        labelEs: 'Costos' },
  expense:              { min: 600, max: 699, label: 'Expenses',             labelEs: 'Gastos' },
  financial_result:     { min: 700, max: 799, label: 'Financial Result',     labelEs: 'Resultado Integral de Financiamiento' },
  other_income_expense: { min: 800, max: 899, label: 'Other Income/Expense', labelEs: 'Otros Ingresos/Gastos' },
  order:                { min: 900, max: 999, label: 'Order Accounts',       labelEs: 'Cuentas de Orden' },
};

// ============================================
// Default Naturaleza per Account Type
// ============================================

/** SAT naturaleza: which side increases the account */
export const DEFAULT_NATURALEZA: Record<AccountType, Naturaleza> = {
  asset:                'D',  // Deudora — debits increase
  liability:            'A',  // Acreedora — credits increase
  equity:               'A',
  revenue:              'A',
  cost_of_sales:        'D',
  expense:              'D',
  financial_result:     'D',
  other_income_expense: 'D',
  order:                'D',
};

// ============================================
// SAT Código Agrupador Catalog (Top-level)
// ============================================

/** Top-level SAT Código Agrupador codes (Level 1 and Level 2) */
export const SAT_AGRUPADOR_CATALOG = [
  // Activo (100)
  { code: '100', name: 'Activo', nivel: 1 },
  { code: '101', name: 'Activo a corto plazo', nivel: 2 },
  { code: '101.01', name: 'Caja', nivel: 2 },
  { code: '101.02', name: 'Bancos', nivel: 2 },
  { code: '101.03', name: 'Inversiones', nivel: 2 },
  { code: '102', name: 'Cuentas por cobrar a corto plazo', nivel: 2 },
  { code: '102.01', name: 'Clientes', nivel: 2 },
  { code: '102.02', name: 'Documentos por cobrar', nivel: 2 },
  { code: '103', name: 'Impuestos a favor a corto plazo', nivel: 2 },
  { code: '103.01', name: 'IVA acreditable', nivel: 2 },
  { code: '103.02', name: 'IVA por acreditar', nivel: 2 },
  { code: '103.03', name: 'Subsidio al empleo', nivel: 2 },
  { code: '104', name: 'Inventarios', nivel: 2 },
  { code: '105', name: 'Almacenes', nivel: 2 },
  { code: '106', name: 'Estimación de cuentas incobrables', nivel: 2 },
  { code: '107', name: 'Pagos anticipados a corto plazo', nivel: 2 },
  { code: '108', name: 'Otros activos a corto plazo', nivel: 2 },
  { code: '110', name: 'Activo a largo plazo', nivel: 2 },
  { code: '111', name: 'Terrenos', nivel: 2 },
  { code: '112', name: 'Edificios', nivel: 2 },
  { code: '113', name: 'Maquinaria y equipo', nivel: 2 },
  { code: '114', name: 'Equipo de transporte', nivel: 2 },
  { code: '115', name: 'Mobiliario y equipo de oficina', nivel: 2 },
  { code: '116', name: 'Equipo de cómputo', nivel: 2 },
  { code: '117', name: 'Otras inversiones en activos fijos', nivel: 2 },
  { code: '118', name: 'Depreciación acumulada de activo fijo', nivel: 2 },

  // Pasivo (200)
  { code: '200', name: 'Pasivo', nivel: 1 },
  { code: '201', name: 'Pasivo a corto plazo', nivel: 2 },
  { code: '201.01', name: 'Proveedores', nivel: 2 },
  { code: '201.02', name: 'Documentos por pagar a corto plazo', nivel: 2 },
  { code: '201.03', name: 'Acreedores diversos a corto plazo', nivel: 2 },
  { code: '201.04', name: 'Anticipo de clientes', nivel: 2 },
  { code: '202', name: 'Impuestos por pagar a corto plazo', nivel: 2 },
  { code: '202.01', name: 'IVA trasladado', nivel: 2 },
  { code: '202.02', name: 'ISR por pagar', nivel: 2 },
  { code: '202.03', name: 'IVA por trasladar', nivel: 2 },
  { code: '203', name: 'Provisiones a corto plazo', nivel: 2 },
  { code: '210', name: 'Pasivo a largo plazo', nivel: 2 },
  { code: '211', name: 'Créditos bancarios a largo plazo', nivel: 2 },

  // Capital (300)
  { code: '300', name: 'Capital Contable', nivel: 1 },
  { code: '301', name: 'Capital contribuido', nivel: 2 },
  { code: '301.01', name: 'Capital social', nivel: 2 },
  { code: '302', name: 'Capital ganado', nivel: 2 },
  { code: '302.01', name: 'Resultados acumulados', nivel: 2 },
  { code: '302.02', name: 'Resultado del ejercicio', nivel: 2 },

  // Ingresos (400)
  { code: '400', name: 'Ingresos', nivel: 1 },
  { code: '401', name: 'Ingresos de actividades primarias', nivel: 2 },
  { code: '401.01', name: 'Ventas y/o servicios', nivel: 2 },
  { code: '402', name: 'Otros ingresos', nivel: 2 },
  { code: '402.01', name: 'Productos financieros', nivel: 2 },

  // Costos (500)
  { code: '500', name: 'Costos', nivel: 1 },
  { code: '501', name: 'Costo de ventas', nivel: 2 },
  { code: '501.01', name: 'Costo de ventas y/o servicios', nivel: 2 },

  // Gastos (600)
  { code: '600', name: 'Gastos', nivel: 1 },
  { code: '601', name: 'Gastos generales', nivel: 2 },
  { code: '601.01', name: 'Gastos de administración', nivel: 2 },
  { code: '601.02', name: 'Gastos de venta', nivel: 2 },
  { code: '601.03', name: 'Gastos de distribución y venta', nivel: 2 },
  { code: '602', name: 'Gastos de fabricación', nivel: 2 },

  // Resultado Integral de Financiamiento (700)
  { code: '700', name: 'Resultado Integral de Financiamiento', nivel: 1 },
  { code: '701', name: 'Gastos financieros', nivel: 2 },
  { code: '702', name: 'Productos financieros', nivel: 2 },

  // Otros (800)
  { code: '800', name: 'Otros Ingresos y Gastos', nivel: 1 },
  { code: '801', name: 'Otros ingresos', nivel: 2 },
  { code: '802', name: 'Otros gastos', nivel: 2 },

  // Cuentas de Orden (900)
  { code: '900', name: 'Cuentas de Orden', nivel: 1 },
] as const;

// ============================================
// Poliza Type Labels
// ============================================

export const POLIZA_TYPE_LABELS: Record<string, string> = {
  ingreso: 'Ingreso',
  egreso: 'Egreso',
  diario: 'Diario',
};

// ============================================
// Entry Status Labels
// ============================================

export const ENTRY_STATUS_LABELS: Record<string, string> = {
  draft: 'Borrador',
  posted: 'Contabilizado',
  reversed: 'Reversado',
};

// ============================================
// Filing Mode Labels
// ============================================

export const FILING_MODE_LABELS: Record<string, string> = {
  required: 'Obligatorio',
  records_only: 'Solo registros',
  disabled: 'Deshabilitado',
};

// ============================================
// Period Status Labels
// ============================================

export const PERIOD_STATUS_LABELS: Record<string, string> = {
  open: 'Abierto',
  closing: 'En cierre',
  closed: 'Cerrado',
  reopened: 'Reabierto',
};

// ============================================
// SAT XML Namespaces (Anexo 24 v1.3)
// ============================================

export const SAT_XML_NAMESPACES = {
  catalogoCuentas: 'http://www.sat.gob.mx/esquemas/ContabilidadE/1_3/CatalogoCuentas',
  balanza: 'http://www.sat.gob.mx/esquemas/ContabilidadE/1_3/BalanzaComprobacion',
  polizas: 'http://www.sat.gob.mx/esquemas/ContabilidadE/1_3/PolizasPeriodo',
  auxiliarCuentas: 'http://www.sat.gob.mx/esquemas/ContabilidadE/1_3/AuxiliarCtas',
  auxiliarFolios: 'http://www.sat.gob.mx/esquemas/ContabilidadE/1_3/AuxiliarFolios',
  xsi: 'http://www.w3.org/2001/XMLSchema-instance',
} as const;

export const SAT_XML_SCHEMA_LOCATIONS = {
  catalogoCuentas: 'http://www.sat.gob.mx/esquemas/ContabilidadE/1_3/CatalogoCuentas http://www.sat.gob.mx/esquemas/ContabilidadE/1_3/CatalogoCuentas/CatalogoCuentas_1_3.xsd',
  balanza: 'http://www.sat.gob.mx/esquemas/ContabilidadE/1_3/BalanzaComprobacion http://www.sat.gob.mx/esquemas/ContabilidadE/1_3/BalanzaComprobacion/BalanzaComprobacion_1_3.xsd',
  polizas: 'http://www.sat.gob.mx/esquemas/ContabilidadE/1_3/PolizasPeriodo http://www.sat.gob.mx/esquemas/ContabilidadE/1_3/PolizasPeriodo/PolizasPeriodo_1_3.xsd',
  auxiliarCuentas: 'http://www.sat.gob.mx/esquemas/ContabilidadE/1_3/AuxiliarCtas http://www.sat.gob.mx/esquemas/ContabilidadE/1_3/AuxiliarCtas/AuxiliarCtas_1_3.xsd',
  auxiliarFolios: 'http://www.sat.gob.mx/esquemas/ContabilidadE/1_3/AuxiliarFolios http://www.sat.gob.mx/esquemas/ContabilidadE/1_3/AuxiliarFolios/AuxiliarFolios_1_3.xsd',
} as const;

// ============================================
// Entry Number Format
// ============================================

export const ENTRY_NUMBER_PREFIX = (year: number) => `${year}-`;
export const ENTRY_NUMBER_PAD_LENGTH = 6;

// ============================================
// Max Hierarchy Depth
// ============================================

export const MAX_ACCOUNT_DEPTH = 6;

// ============================================
// Default Chart Templates
// ============================================

export type ChartTemplate = 'mexico-pyme' | 'mexico-resico' | 'mexico-general';

export const CHART_TEMPLATES: Record<ChartTemplate, string> = {
  'mexico-pyme': 'PyME Mexicana (~80 cuentas)',
  'mexico-resico': 'RESICO Simplificado (~25 cuentas)',
  'mexico-general': 'Régimen General Completo (~150 cuentas)',
};
