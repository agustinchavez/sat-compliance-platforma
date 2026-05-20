/**
 * Expense Categories (Component 20)
 *
 * Category suggestion via keyword matching and deductibility rules per SAT/ISR.
 */

import { ExpenseCategory } from './types';

// Maps category to keywords found in vendor names or CFDI descriptions
// Used for automatic category suggestion — no AI required
const CATEGORY_KEYWORDS: Record<ExpenseCategory, string[]> = {
  [ExpenseCategory.COMBUSTIBLE]: [
    'gasolina', 'combustible', 'diesel', 'pemex', 'bp', 'oxxo combustible',
    'shell', 'total energies', 'hidrosina',
  ],
  [ExpenseCategory.TELECOMUNICACIONES]: [
    'telmex', 'telcel', 'at&t', 'movistar', 'izzi', 'megacable', 'internet',
    'telefonia', 'telefono', 'comunicaciones',
  ],
  [ExpenseCategory.SERVICIOS_PUBLICOS]: [
    'cfe', 'luz', 'electricidad', 'conagua', 'agua', 'gas natural mexico',
    'naturgy', 'gas lp',
  ],
  [ExpenseCategory.ARRENDAMIENTO]: [
    'arrendamiento', 'renta', 'alquiler', 'inmueble', 'local comercial',
    'oficina', 'bodega',
  ],
  [ExpenseCategory.VIATICOS]: [
    'hotel', 'hospedaje', 'aerolinea', 'aeromexico', 'volaris', 'vivaaerobus',
    'american airlines', 'uber', 'cabify', 'didi', 'taxi', 'airbnb',
    'viaticos',
  ],
  [ExpenseCategory.ALIMENTOS_ENTRETENIMIENTO]: [
    'restaurante', 'comida', 'alimentos', 'buffet', 'cafeteria', 'bar',
    'antojitos', 'taqueria',
  ],
  [ExpenseCategory.PUBLICIDAD_MARKETING]: [
    'publicidad', 'marketing', 'google', 'facebook', 'meta', 'linkedin',
    'imprenta', 'diseño grafico', 'agencia',
  ],
  [ExpenseCategory.TECNOLOGIA_SOFTWARE]: [
    'software', 'microsoft', 'google workspace', 'adobe', 'aws', 'amazon web',
    'cloudflare', 'github', 'slack', 'zoom', 'licencia', 'suscripcion',
  ],
  [ExpenseCategory.SERVICIOS_PROFESIONALES]: [
    'honorarios', 'consultor', 'abogado', 'contador', 'notario', 'arquitecto',
    'despacho', 'servicios profesionales', 'asesoria',
  ],
  [ExpenseCategory.SEGUROS]: [
    'seguro', 'aseguradora', 'gnp', 'axa', 'mapfre', 'metlife', 'zurich',
    'qualitas', 'chubb', 'prima',
  ],
  [ExpenseCategory.COMISIONES_BANCARIAS]: [
    'comision', 'bancaria', 'manejo de cuenta', 'banamex', 'bbva', 'santander',
    'hsbc', 'banorte', 'scotiabank', 'inbursa',
  ],
  [ExpenseCategory.PAPELERIA_OFICINA]: [
    'papeleria', 'oficina', 'staples', 'office depot', 'material de oficina',
    'suministros', 'impresion',
  ],
  [ExpenseCategory.COMPRAS_MERCANCIA]: [
    'mercancia', 'producto', 'inventario', 'materia prima', 'insumo',
    'proveedor', 'compra',
  ],
  [ExpenseCategory.SEGURIDAD_SOCIAL]: [
    'imss', 'infonavit', 'seguro social', 'afore', 'cuota patronal',
  ],
  [ExpenseCategory.TRANSPORTE]: [
    'flete', 'mensajeria', 'fedex', 'dhl', 'estafeta', 'redpack', 'logistica',
    'envio', 'paqueteria',
  ],
  [ExpenseCategory.INTERESES]: ['interes', 'credito', 'prestamo', 'financiamiento'],
  [ExpenseCategory.DONACIONES]: ['donativo', 'donacion', 'donataria'],
  [ExpenseCategory.INVERSIONES_ACTIVO_FIJO]: [
    'activo fijo', 'maquinaria', 'equipo computo', 'computadora', 'vehiculo',
    'mobiliario',
  ],
  [ExpenseCategory.EQUIPO_HERRAMIENTAS]: [
    'herramienta', 'equipo', 'herramientas', 'maquinaria menor',
  ],
  [ExpenseCategory.NOMINA_SUELDOS]: ['nomina', 'sueldo', 'salario', 'trabajador'],
  [ExpenseCategory.OTROS]: [],
};

/**
 * Suggests an expense category based on vendor name and/or description.
 * Uses keyword matching — deterministic, no AI dependency.
 * Falls back to OTROS if no match found.
 *
 * @param vendorName - Vendor name from receipt/CFDI
 * @param description - Optional description text
 * @returns Best matching category
 */
export function suggestCategory(vendorName: string, description?: string): ExpenseCategory {
  const text = `${vendorName} ${description ?? ''}`.toLowerCase();
  let bestMatch: ExpenseCategory = ExpenseCategory.OTROS;
  let bestScore = 0;

  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    const score = keywords.filter(kw => text.includes(kw)).length;
    if (score > bestScore) {
      bestScore = score;
      bestMatch = category as ExpenseCategory;
    }
  }

  return bestMatch;
}

/**
 * Returns SAT/ISR deductibility rules for a given category.
 * Used by the validation layer to determine deductibility percent and warnings.
 */
export interface CategoryDeductibilityRule {
  defaultDeductiblePercent: number;   // 100, 91.5, or 0
  requiresBancarizado: boolean;       // Whether cash payment makes it non-deductible
  cashLimit: number | null;           // Max cash deductible (null = no cash at all)
  notes: string;                      // Human-readable rule description
}

export const CATEGORY_DEDUCTIBILITY_RULES: Record<ExpenseCategory, CategoryDeductibilityRule> = {
  [ExpenseCategory.COMBUSTIBLE]: {
    defaultDeductiblePercent: 100,
    requiresBancarizado: true,
    cashLimit: 0,   // Cash is NEVER deductible for fuel regardless of amount
    notes: 'Combustible: pago en efectivo nunca es deducible (Art. 28 LISR)',
  },
  [ExpenseCategory.ALIMENTOS_ENTRETENIMIENTO]: {
    defaultDeductiblePercent: 91.5,
    requiresBancarizado: true,
    cashLimit: 2000,
    notes: 'Alimentos y entretenimiento: deducible al 91.5% con CFDI (Art. 28 LISR)',
  },
  [ExpenseCategory.DONACIONES]: {
    defaultDeductiblePercent: 100,
    requiresBancarizado: false,
    cashLimit: null,
    notes: 'Donativos: máximo 7% de la utilidad fiscal del ejercicio anterior',
  },
  [ExpenseCategory.INVERSIONES_ACTIVO_FIJO]: {
    defaultDeductiblePercent: 100,
    requiresBancarizado: true,
    cashLimit: 2000,
    notes: 'Activo fijo: se deprecia, no se deduce en un solo ejercicio',
  },
  // All remaining categories: standard 100% deductible with bancarization rule
  ...Object.fromEntries(
    [
      ExpenseCategory.COMPRAS_MERCANCIA,
      ExpenseCategory.SERVICIOS_PROFESIONALES,
      ExpenseCategory.ARRENDAMIENTO,
      ExpenseCategory.NOMINA_SUELDOS,
      ExpenseCategory.SEGURIDAD_SOCIAL,
      ExpenseCategory.VIATICOS,
      ExpenseCategory.TRANSPORTE,
      ExpenseCategory.PAPELERIA_OFICINA,
      ExpenseCategory.SERVICIOS_PUBLICOS,
      ExpenseCategory.TELECOMUNICACIONES,
      ExpenseCategory.PUBLICIDAD_MARKETING,
      ExpenseCategory.TECNOLOGIA_SOFTWARE,
      ExpenseCategory.EQUIPO_HERRAMIENTAS,
      ExpenseCategory.INTERESES,
      ExpenseCategory.SEGUROS,
      ExpenseCategory.COMISIONES_BANCARIAS,
      ExpenseCategory.OTROS,
    ].map(cat => [cat, {
      defaultDeductiblePercent: 100,
      requiresBancarizado: true,
      cashLimit: 2000,
      notes: 'Gasto operativo estrictamente indispensable (Art. 25/27 LISR)',
    }])
  ),
};

/**
 * Gets the deductibility rule for a category.
 */
export function getCategoryRule(category: ExpenseCategory): CategoryDeductibilityRule {
  return CATEGORY_DEDUCTIBILITY_RULES[category];
}
