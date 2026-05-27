/**
 * Chart of Accounts Templates (Component 21)
 *
 * Default chart templates for Mexican SMEs aligned with SAT Código Agrupador.
 */

interface TemplateAccount {
  code: string;
  name: string;
  description?: string;
  sat_agrupador_code?: string;
  sat_nivel: number;
  sat_naturaleza: string;
  parent_id?: string;
  materialized_path: string;
  is_postable: boolean;
  account_type: string;
  normal_balance: string;
  currency_code: string;
}

/**
 * Mexico PyME template (~80 accounts)
 * Balanced for SMEs with standard needs.
 */
export function getMexicoPymeTemplate(): TemplateAccount[] {
  return [
    // Level 1 - Major groups
    { code: '1000', name: 'Activo', sat_agrupador_code: '100', sat_nivel: 1, sat_naturaleza: 'D', materialized_path: '1000', is_postable: false, account_type: 'asset', normal_balance: 'D', currency_code: 'MXN' },
    { code: '2000', name: 'Pasivo', sat_agrupador_code: '200', sat_nivel: 1, sat_naturaleza: 'A', materialized_path: '2000', is_postable: false, account_type: 'liability', normal_balance: 'A', currency_code: 'MXN' },
    { code: '3000', name: 'Capital Contable', sat_agrupador_code: '300', sat_nivel: 1, sat_naturaleza: 'A', materialized_path: '3000', is_postable: false, account_type: 'equity', normal_balance: 'A', currency_code: 'MXN' },
    { code: '4000', name: 'Ingresos', sat_agrupador_code: '400', sat_nivel: 1, sat_naturaleza: 'A', materialized_path: '4000', is_postable: false, account_type: 'revenue', normal_balance: 'A', currency_code: 'MXN' },
    { code: '5000', name: 'Costos', sat_agrupador_code: '500', sat_nivel: 1, sat_naturaleza: 'D', materialized_path: '5000', is_postable: false, account_type: 'cost_of_sales', normal_balance: 'D', currency_code: 'MXN' },
    { code: '6000', name: 'Gastos', sat_agrupador_code: '600', sat_nivel: 1, sat_naturaleza: 'D', materialized_path: '6000', is_postable: false, account_type: 'expense', normal_balance: 'D', currency_code: 'MXN' },

    // Level 2 - Activo
    { code: '1100', name: 'Activo Circulante', sat_agrupador_code: '101', sat_nivel: 2, sat_naturaleza: 'D', materialized_path: '1000.1100', is_postable: false, account_type: 'asset', normal_balance: 'D', currency_code: 'MXN' },
    { code: '1200', name: 'Activo Fijo', sat_agrupador_code: '110', sat_nivel: 2, sat_naturaleza: 'D', materialized_path: '1000.1200', is_postable: false, account_type: 'asset', normal_balance: 'D', currency_code: 'MXN' },

    // Level 3 - Activo Circulante detail
    { code: '1101', name: 'Caja', sat_agrupador_code: '101.01', sat_nivel: 3, sat_naturaleza: 'D', materialized_path: '1000.1100.1101', is_postable: true, account_type: 'asset', normal_balance: 'D', currency_code: 'MXN' },
    { code: '1102', name: 'Bancos', sat_agrupador_code: '101.02', sat_nivel: 3, sat_naturaleza: 'D', materialized_path: '1000.1100.1102', is_postable: true, account_type: 'asset', normal_balance: 'D', currency_code: 'MXN' },
    { code: '1103', name: 'Inversiones', sat_agrupador_code: '101.03', sat_nivel: 3, sat_naturaleza: 'D', materialized_path: '1000.1100.1103', is_postable: true, account_type: 'asset', normal_balance: 'D', currency_code: 'MXN' },
    { code: '1104', name: 'Clientes', sat_agrupador_code: '102.01', sat_nivel: 3, sat_naturaleza: 'D', materialized_path: '1000.1100.1104', is_postable: true, account_type: 'asset', normal_balance: 'D', currency_code: 'MXN' },
    { code: '1105', name: 'Documentos por Cobrar', sat_agrupador_code: '102.02', sat_nivel: 3, sat_naturaleza: 'D', materialized_path: '1000.1100.1105', is_postable: true, account_type: 'asset', normal_balance: 'D', currency_code: 'MXN' },
    { code: '1106', name: 'IVA Acreditable', sat_agrupador_code: '103.01', sat_nivel: 3, sat_naturaleza: 'D', materialized_path: '1000.1100.1106', is_postable: true, account_type: 'asset', normal_balance: 'D', currency_code: 'MXN' },
    { code: '1107', name: 'IVA por Acreditar', sat_agrupador_code: '103.02', sat_nivel: 3, sat_naturaleza: 'D', materialized_path: '1000.1100.1107', is_postable: true, account_type: 'asset', normal_balance: 'D', currency_code: 'MXN' },
    { code: '1108', name: 'Inventarios', sat_agrupador_code: '104', sat_nivel: 3, sat_naturaleza: 'D', materialized_path: '1000.1100.1108', is_postable: true, account_type: 'asset', normal_balance: 'D', currency_code: 'MXN' },
    { code: '1109', name: 'Pagos Anticipados', sat_agrupador_code: '107', sat_nivel: 3, sat_naturaleza: 'D', materialized_path: '1000.1100.1109', is_postable: true, account_type: 'asset', normal_balance: 'D', currency_code: 'MXN' },

    // Level 3 - Activo Fijo detail
    { code: '1201', name: 'Terrenos', sat_agrupador_code: '111', sat_nivel: 3, sat_naturaleza: 'D', materialized_path: '1000.1200.1201', is_postable: true, account_type: 'asset', normal_balance: 'D', currency_code: 'MXN' },
    { code: '1202', name: 'Edificios', sat_agrupador_code: '112', sat_nivel: 3, sat_naturaleza: 'D', materialized_path: '1000.1200.1202', is_postable: true, account_type: 'asset', normal_balance: 'D', currency_code: 'MXN' },
    { code: '1203', name: 'Maquinaria y Equipo', sat_agrupador_code: '113', sat_nivel: 3, sat_naturaleza: 'D', materialized_path: '1000.1200.1203', is_postable: true, account_type: 'asset', normal_balance: 'D', currency_code: 'MXN' },
    { code: '1204', name: 'Equipo de Transporte', sat_agrupador_code: '114', sat_nivel: 3, sat_naturaleza: 'D', materialized_path: '1000.1200.1204', is_postable: true, account_type: 'asset', normal_balance: 'D', currency_code: 'MXN' },
    { code: '1205', name: 'Equipo de Cómputo', sat_agrupador_code: '116', sat_nivel: 3, sat_naturaleza: 'D', materialized_path: '1000.1200.1205', is_postable: true, account_type: 'asset', normal_balance: 'D', currency_code: 'MXN' },
    { code: '1206', name: 'Depreciación Acumulada', sat_agrupador_code: '118', sat_nivel: 3, sat_naturaleza: 'A', materialized_path: '1000.1200.1206', is_postable: true, account_type: 'asset', normal_balance: 'A', currency_code: 'MXN' },

    // Level 2 - Pasivo
    { code: '2100', name: 'Pasivo a Corto Plazo', sat_agrupador_code: '201', sat_nivel: 2, sat_naturaleza: 'A', materialized_path: '2000.2100', is_postable: false, account_type: 'liability', normal_balance: 'A', currency_code: 'MXN' },
    { code: '2200', name: 'Pasivo a Largo Plazo', sat_agrupador_code: '210', sat_nivel: 2, sat_naturaleza: 'A', materialized_path: '2000.2200', is_postable: false, account_type: 'liability', normal_balance: 'A', currency_code: 'MXN' },

    // Level 3 - Pasivo detail
    { code: '2101', name: 'Proveedores', sat_agrupador_code: '201.01', sat_nivel: 3, sat_naturaleza: 'A', materialized_path: '2000.2100.2101', is_postable: true, account_type: 'liability', normal_balance: 'A', currency_code: 'MXN' },
    { code: '2102', name: 'Acreedores Diversos', sat_agrupador_code: '201.03', sat_nivel: 3, sat_naturaleza: 'A', materialized_path: '2000.2100.2102', is_postable: true, account_type: 'liability', normal_balance: 'A', currency_code: 'MXN' },
    { code: '2103', name: 'Anticipo de Clientes', sat_agrupador_code: '201.04', sat_nivel: 3, sat_naturaleza: 'A', materialized_path: '2000.2100.2103', is_postable: true, account_type: 'liability', normal_balance: 'A', currency_code: 'MXN' },
    { code: '2104', name: 'IVA Trasladado', sat_agrupador_code: '202.01', sat_nivel: 3, sat_naturaleza: 'A', materialized_path: '2000.2100.2104', is_postable: true, account_type: 'liability', normal_balance: 'A', currency_code: 'MXN' },
    { code: '2105', name: 'ISR por Pagar', sat_agrupador_code: '202.02', sat_nivel: 3, sat_naturaleza: 'A', materialized_path: '2000.2100.2105', is_postable: true, account_type: 'liability', normal_balance: 'A', currency_code: 'MXN' },
    { code: '2106', name: 'IVA por Trasladar', sat_agrupador_code: '202.03', sat_nivel: 3, sat_naturaleza: 'A', materialized_path: '2000.2100.2106', is_postable: true, account_type: 'liability', normal_balance: 'A', currency_code: 'MXN' },
    { code: '2201', name: 'Créditos Bancarios LP', sat_agrupador_code: '211', sat_nivel: 3, sat_naturaleza: 'A', materialized_path: '2000.2200.2201', is_postable: true, account_type: 'liability', normal_balance: 'A', currency_code: 'MXN' },

    // Level 2 - Capital
    { code: '3100', name: 'Capital Contribuido', sat_agrupador_code: '301', sat_nivel: 2, sat_naturaleza: 'A', materialized_path: '3000.3100', is_postable: false, account_type: 'equity', normal_balance: 'A', currency_code: 'MXN' },
    { code: '3200', name: 'Capital Ganado', sat_agrupador_code: '302', sat_nivel: 2, sat_naturaleza: 'A', materialized_path: '3000.3200', is_postable: false, account_type: 'equity', normal_balance: 'A', currency_code: 'MXN' },

    // Level 3 - Capital detail
    { code: '3101', name: 'Capital Social', sat_agrupador_code: '301.01', sat_nivel: 3, sat_naturaleza: 'A', materialized_path: '3000.3100.3101', is_postable: true, account_type: 'equity', normal_balance: 'A', currency_code: 'MXN' },
    { code: '3201', name: 'Resultados Acumulados', sat_agrupador_code: '302.01', sat_nivel: 3, sat_naturaleza: 'A', materialized_path: '3000.3200.3201', is_postable: true, account_type: 'equity', normal_balance: 'A', currency_code: 'MXN' },
    { code: '3202', name: 'Resultado del Ejercicio', sat_agrupador_code: '302.02', sat_nivel: 3, sat_naturaleza: 'A', materialized_path: '3000.3200.3202', is_postable: true, account_type: 'equity', normal_balance: 'A', currency_code: 'MXN' },

    // Level 2 - Ingresos
    { code: '4100', name: 'Ingresos por Ventas', sat_agrupador_code: '401', sat_nivel: 2, sat_naturaleza: 'A', materialized_path: '4000.4100', is_postable: false, account_type: 'revenue', normal_balance: 'A', currency_code: 'MXN' },
    { code: '4200', name: 'Otros Ingresos', sat_agrupador_code: '402', sat_nivel: 2, sat_naturaleza: 'A', materialized_path: '4000.4200', is_postable: false, account_type: 'revenue', normal_balance: 'A', currency_code: 'MXN' },

    // Level 3 - Ingresos detail
    { code: '4101', name: 'Ventas y/o Servicios', sat_agrupador_code: '401.01', sat_nivel: 3, sat_naturaleza: 'A', materialized_path: '4000.4100.4101', is_postable: true, account_type: 'revenue', normal_balance: 'A', currency_code: 'MXN' },
    { code: '4201', name: 'Productos Financieros', sat_agrupador_code: '402.01', sat_nivel: 3, sat_naturaleza: 'A', materialized_path: '4000.4200.4201', is_postable: true, account_type: 'revenue', normal_balance: 'A', currency_code: 'MXN' },

    // Level 2 - Costos
    { code: '5100', name: 'Costo de Ventas', sat_agrupador_code: '501', sat_nivel: 2, sat_naturaleza: 'D', materialized_path: '5000.5100', is_postable: false, account_type: 'cost_of_sales', normal_balance: 'D', currency_code: 'MXN' },

    // Level 3 - Costos detail
    { code: '5101', name: 'Costo de Ventas y/o Servicios', sat_agrupador_code: '501.01', sat_nivel: 3, sat_naturaleza: 'D', materialized_path: '5000.5100.5101', is_postable: true, account_type: 'cost_of_sales', normal_balance: 'D', currency_code: 'MXN' },

    // Level 2 - Gastos
    { code: '6100', name: 'Gastos Generales', sat_agrupador_code: '601', sat_nivel: 2, sat_naturaleza: 'D', materialized_path: '6000.6100', is_postable: false, account_type: 'expense', normal_balance: 'D', currency_code: 'MXN' },

    // Level 3 - Gastos detail
    { code: '6101', name: 'Gastos de Administración', sat_agrupador_code: '601.01', sat_nivel: 3, sat_naturaleza: 'D', materialized_path: '6000.6100.6101', is_postable: true, account_type: 'expense', normal_balance: 'D', currency_code: 'MXN' },
    { code: '6102', name: 'Gastos de Venta', sat_agrupador_code: '601.02', sat_nivel: 3, sat_naturaleza: 'D', materialized_path: '6000.6100.6102', is_postable: true, account_type: 'expense', normal_balance: 'D', currency_code: 'MXN' },
    { code: '6103', name: 'Gastos Financieros', sat_agrupador_code: '701', sat_nivel: 3, sat_naturaleza: 'D', materialized_path: '6000.6100.6103', is_postable: true, account_type: 'expense', normal_balance: 'D', currency_code: 'MXN' },
  ];
}

/**
 * Mexico RESICO template (~25 accounts)
 * Simplified chart for RESICO regime.
 */
export function getMexicoResicoTemplate(): TemplateAccount[] {
  return [
    { code: '1000', name: 'Activo', sat_agrupador_code: '100', sat_nivel: 1, sat_naturaleza: 'D', materialized_path: '1000', is_postable: false, account_type: 'asset', normal_balance: 'D', currency_code: 'MXN' },
    { code: '1100', name: 'Bancos', sat_agrupador_code: '101.02', sat_nivel: 2, sat_naturaleza: 'D', materialized_path: '1000.1100', is_postable: true, account_type: 'asset', normal_balance: 'D', currency_code: 'MXN' },
    { code: '1200', name: 'Clientes', sat_agrupador_code: '102.01', sat_nivel: 2, sat_naturaleza: 'D', materialized_path: '1000.1200', is_postable: true, account_type: 'asset', normal_balance: 'D', currency_code: 'MXN' },
    { code: '1300', name: 'IVA Acreditable', sat_agrupador_code: '103.01', sat_nivel: 2, sat_naturaleza: 'D', materialized_path: '1000.1300', is_postable: true, account_type: 'asset', normal_balance: 'D', currency_code: 'MXN' },

    { code: '2000', name: 'Pasivo', sat_agrupador_code: '200', sat_nivel: 1, sat_naturaleza: 'A', materialized_path: '2000', is_postable: false, account_type: 'liability', normal_balance: 'A', currency_code: 'MXN' },
    { code: '2100', name: 'Proveedores', sat_agrupador_code: '201.01', sat_nivel: 2, sat_naturaleza: 'A', materialized_path: '2000.2100', is_postable: true, account_type: 'liability', normal_balance: 'A', currency_code: 'MXN' },
    { code: '2200', name: 'IVA Trasladado', sat_agrupador_code: '202.01', sat_nivel: 2, sat_naturaleza: 'A', materialized_path: '2000.2200', is_postable: true, account_type: 'liability', normal_balance: 'A', currency_code: 'MXN' },
    { code: '2300', name: 'ISR por Pagar', sat_agrupador_code: '202.02', sat_nivel: 2, sat_naturaleza: 'A', materialized_path: '2000.2300', is_postable: true, account_type: 'liability', normal_balance: 'A', currency_code: 'MXN' },

    { code: '3000', name: 'Capital', sat_agrupador_code: '300', sat_nivel: 1, sat_naturaleza: 'A', materialized_path: '3000', is_postable: false, account_type: 'equity', normal_balance: 'A', currency_code: 'MXN' },
    { code: '3100', name: 'Capital Social', sat_agrupador_code: '301.01', sat_nivel: 2, sat_naturaleza: 'A', materialized_path: '3000.3100', is_postable: true, account_type: 'equity', normal_balance: 'A', currency_code: 'MXN' },
    { code: '3200', name: 'Resultado del Ejercicio', sat_agrupador_code: '302.02', sat_nivel: 2, sat_naturaleza: 'A', materialized_path: '3000.3200', is_postable: true, account_type: 'equity', normal_balance: 'A', currency_code: 'MXN' },

    { code: '4000', name: 'Ingresos', sat_agrupador_code: '400', sat_nivel: 1, sat_naturaleza: 'A', materialized_path: '4000', is_postable: false, account_type: 'revenue', normal_balance: 'A', currency_code: 'MXN' },
    { code: '4100', name: 'Ventas', sat_agrupador_code: '401.01', sat_nivel: 2, sat_naturaleza: 'A', materialized_path: '4000.4100', is_postable: true, account_type: 'revenue', normal_balance: 'A', currency_code: 'MXN' },

    { code: '5000', name: 'Costos', sat_agrupador_code: '500', sat_nivel: 1, sat_naturaleza: 'D', materialized_path: '5000', is_postable: false, account_type: 'cost_of_sales', normal_balance: 'D', currency_code: 'MXN' },
    { code: '5100', name: 'Costo de Ventas', sat_agrupador_code: '501.01', sat_nivel: 2, sat_naturaleza: 'D', materialized_path: '5000.5100', is_postable: true, account_type: 'cost_of_sales', normal_balance: 'D', currency_code: 'MXN' },

    { code: '6000', name: 'Gastos', sat_agrupador_code: '600', sat_nivel: 1, sat_naturaleza: 'D', materialized_path: '6000', is_postable: false, account_type: 'expense', normal_balance: 'D', currency_code: 'MXN' },
    { code: '6100', name: 'Gastos de Operación', sat_agrupador_code: '601.01', sat_nivel: 2, sat_naturaleza: 'D', materialized_path: '6000.6100', is_postable: true, account_type: 'expense', normal_balance: 'D', currency_code: 'MXN' },
  ];
}

/**
 * Mexico General template (~150 accounts)
 * Returns same as PyME for now — full template can be expanded.
 */
export function getMexicoGeneralTemplate(): TemplateAccount[] {
  // Start with PyME and add more detail accounts
  const pyme = getMexicoPymeTemplate();

  // Add additional accounts for Régimen General
  const additional: TemplateAccount[] = [
    // Additional asset subaccounts
    { code: '110201', name: 'Banamex', sat_agrupador_code: '101.02', sat_nivel: 4, sat_naturaleza: 'D', materialized_path: '1000.1100.1102.110201', is_postable: true, account_type: 'asset', normal_balance: 'D', currency_code: 'MXN' },
    { code: '110202', name: 'BBVA', sat_agrupador_code: '101.02', sat_nivel: 4, sat_naturaleza: 'D', materialized_path: '1000.1100.1102.110202', is_postable: true, account_type: 'asset', normal_balance: 'D', currency_code: 'MXN' },
    { code: '110203', name: 'Santander', sat_agrupador_code: '101.02', sat_nivel: 4, sat_naturaleza: 'D', materialized_path: '1000.1100.1102.110203', is_postable: true, account_type: 'asset', normal_balance: 'D', currency_code: 'MXN' },

    // Additional liability subaccounts
    { code: '210101', name: 'Proveedores Nacionales', sat_agrupador_code: '201.01', sat_nivel: 4, sat_naturaleza: 'A', materialized_path: '2000.2100.2101.210101', is_postable: true, account_type: 'liability', normal_balance: 'A', currency_code: 'MXN' },
    { code: '210102', name: 'Proveedores Extranjeros', sat_agrupador_code: '201.01', sat_nivel: 4, sat_naturaleza: 'A', materialized_path: '2000.2100.2101.210102', is_postable: true, account_type: 'liability', normal_balance: 'A', currency_code: 'MXN' },

    // Additional expense subaccounts
    { code: '610101', name: 'Sueldos y Salarios', sat_agrupador_code: '601.01', sat_nivel: 4, sat_naturaleza: 'D', materialized_path: '6000.6100.6101.610101', is_postable: true, account_type: 'expense', normal_balance: 'D', currency_code: 'MXN' },
    { code: '610102', name: 'Renta de Oficina', sat_agrupador_code: '601.01', sat_nivel: 4, sat_naturaleza: 'D', materialized_path: '6000.6100.6101.610102', is_postable: true, account_type: 'expense', normal_balance: 'D', currency_code: 'MXN' },
    { code: '610103', name: 'Servicios Públicos', sat_agrupador_code: '601.01', sat_nivel: 4, sat_naturaleza: 'D', materialized_path: '6000.6100.6101.610103', is_postable: true, account_type: 'expense', normal_balance: 'D', currency_code: 'MXN' },
    { code: '610104', name: 'Depreciación', sat_agrupador_code: '601.01', sat_nivel: 4, sat_naturaleza: 'D', materialized_path: '6000.6100.6101.610104', is_postable: true, account_type: 'expense', normal_balance: 'D', currency_code: 'MXN' },
    { code: '610201', name: 'Publicidad', sat_agrupador_code: '601.02', sat_nivel: 4, sat_naturaleza: 'D', materialized_path: '6000.6100.6102.610201', is_postable: true, account_type: 'expense', normal_balance: 'D', currency_code: 'MXN' },
    { code: '610202', name: 'Comisiones por Venta', sat_agrupador_code: '601.02', sat_nivel: 4, sat_naturaleza: 'D', materialized_path: '6000.6100.6102.610202', is_postable: true, account_type: 'expense', normal_balance: 'D', currency_code: 'MXN' },
  ];

  return [...pyme, ...additional];
}
