/**
 * Test Fixtures for CFDI Generator
 *
 * Fixed, deterministic test data for all CFDI tests.
 * Never use new Date() or random values in fixtures.
 */

import type { CFDIGeneratorInput, CFDIItemInput } from '../types.js';

// ============================================
// FIXTURE: Standard Professional Service Invoice (Ingreso)
// ============================================

/**
 * Simple Ingreso invoice with one item and 16% IVA
 * PUE payment, MXN currency
 */
export const FIXTURE_INGRESO_SIMPLE: CFDIGeneratorInput = {
  invoice: {
    id: 'inv-001',
    serie: 'A',
    folio: '00000001',
    issue_date: '2024-03-01T10:00:00',
    tipo_comprobante: 'I',
    payment_method: 'PUE',
    payment_form: '03', // Transferencia electronica
    currency: 'MXN',
    exchange_rate: 1,
    exportacion: '01',
    subtotal: 10000,
    discount: 0,
    total: 11600,
    issuer_rfc: 'EKU9003173C9',
    issuer_name: 'ESCUELA KEMPER URGATE',
    issuer_tax_regime: '601',
    issuer_zip_code: '26015',
    receiver_rfc: 'URE180429TM6',
    receiver_name: 'UNIVERSIDAD ROBOTICA ESPAÑOLA',
    receiver_tax_regime: '601',
    receiver_zip_code: '65000',
    receiver_cfdi_use: 'G01',
    is_global: false,
    items: [
      {
        product_service_key: '81112100',
        unit_key: 'E48',
        unit_name: 'Hora',
        description: 'Servicio de consultoria',
        quantity: 1,
        unit_price: 10000,
        discount_amount: 0,
        tax_object: '02',
        tax_breakdown: [
          {
            type: 'traslado',
            impuesto: '002',
            tipo_factor: 'Tasa',
            tasa_o_cuota: '0.160000',
            base: '10000.000000',
            importe: '1600.000000',
          },
        ],
      },
    ],
  },
};

// ============================================
// FIXTURE: Professional Services with Retentions
// ============================================

/**
 * Invoice with IVA traslado + ISR/IVA retentions
 * Typical for professional services (honorarios)
 */
export const FIXTURE_INGRESO_RETENCIONES: CFDIGeneratorInput = {
  invoice: {
    id: 'inv-002',
    serie: 'A',
    folio: '00000002',
    issue_date: '2024-03-01T11:00:00',
    tipo_comprobante: 'I',
    payment_method: 'PUE',
    payment_form: '03',
    currency: 'MXN',
    exchange_rate: 1,
    exportacion: '01',
    subtotal: 10000,
    discount: 0,
    total: 9533.33, // 10000 + 1600 - 1066.67 - 1000
    issuer_rfc: 'EKU9003173C9',
    issuer_name: 'ESCUELA KEMPER URGATE',
    issuer_tax_regime: '601',
    issuer_zip_code: '26015',
    receiver_rfc: 'URE180429TM6',
    receiver_name: 'UNIVERSIDAD ROBOTICA ESPAÑOLA',
    receiver_tax_regime: '601',
    receiver_zip_code: '65000',
    receiver_cfdi_use: 'G01',
    is_global: false,
    items: [
      {
        product_service_key: '81112100',
        unit_key: 'E48',
        unit_name: 'Hora',
        description: 'Servicio de consultoria profesional',
        quantity: 1,
        unit_price: 10000,
        discount_amount: 0,
        tax_object: '02',
        tax_breakdown: [
          {
            type: 'traslado',
            impuesto: '002',
            tipo_factor: 'Tasa',
            tasa_o_cuota: '0.160000',
            base: '10000.000000',
            importe: '1600.000000',
          },
          {
            type: 'retencion',
            impuesto: '002', // IVA retention
            tipo_factor: 'Tasa',
            tasa_o_cuota: '0.106667',
            base: '10000.000000',
            importe: '1066.670000',
          },
          {
            type: 'retencion',
            impuesto: '001', // ISR retention
            tipo_factor: 'Tasa',
            tasa_o_cuota: '0.100000',
            base: '10000.000000',
            importe: '1000.000000',
          },
        ],
      },
    ],
  },
};

// ============================================
// FIXTURE: Exempt Item (No Tax)
// ============================================

/**
 * Invoice with exempt item (ObjetoImp = 01)
 * No taxes apply
 */
export const FIXTURE_INGRESO_EXENTO: CFDIGeneratorInput = {
  invoice: {
    id: 'inv-003',
    serie: 'B',
    folio: '00000001',
    issue_date: '2024-03-02T09:00:00',
    tipo_comprobante: 'I',
    payment_method: 'PUE',
    payment_form: '01', // Efectivo
    currency: 'MXN',
    exchange_rate: 1,
    exportacion: '01',
    subtotal: 5000,
    discount: 0,
    total: 5000,
    issuer_rfc: 'EKU9003173C9',
    issuer_name: 'ESCUELA KEMPER URGATE',
    issuer_tax_regime: '601',
    issuer_zip_code: '26015',
    receiver_rfc: 'CACX7605101P8',
    receiver_name: 'XOCHILT CASAS CHAVEZ',
    receiver_tax_regime: '612',
    receiver_zip_code: '44100',
    receiver_cfdi_use: 'G03',
    is_global: false,
    items: [
      {
        product_service_key: '01010101',
        unit_key: 'H87',
        unit_name: 'Pieza',
        description: 'Producto exento de impuestos',
        quantity: 1,
        unit_price: 5000,
        discount_amount: 0,
        tax_object: '01', // No objeto de impuesto
        tax_breakdown: [],
      },
    ],
  },
};

// ============================================
// FIXTURE: IVA Exento (Exempt Traslado)
// ============================================

/**
 * Invoice with IVA exempt item
 * Has tax_breakdown but TipoFactor=Exento
 */
export const FIXTURE_INGRESO_IVA_EXENTO: CFDIGeneratorInput = {
  invoice: {
    id: 'inv-004',
    serie: 'B',
    folio: '00000002',
    issue_date: '2024-03-02T10:00:00',
    tipo_comprobante: 'I',
    payment_method: 'PUE',
    payment_form: '01',
    currency: 'MXN',
    exchange_rate: 1,
    exportacion: '01',
    subtotal: 8000,
    discount: 0,
    total: 8000,
    issuer_rfc: 'EKU9003173C9',
    issuer_name: 'ESCUELA KEMPER URGATE',
    issuer_tax_regime: '601',
    issuer_zip_code: '26015',
    receiver_rfc: 'CACX7605101P8',
    receiver_name: 'XOCHILT CASAS CHAVEZ',
    receiver_tax_regime: '612',
    receiver_zip_code: '44100',
    receiver_cfdi_use: 'G03',
    is_global: false,
    items: [
      {
        product_service_key: '50211503',
        unit_key: 'H87',
        unit_name: 'Pieza',
        description: 'Alimento basico exento de IVA',
        quantity: 100,
        unit_price: 80,
        discount_amount: 0,
        tax_object: '02', // Si objeto, but exempt
        tax_breakdown: [
          {
            type: 'traslado',
            impuesto: '002',
            tipo_factor: 'Exento',
            base: '8000.000000',
            // No tasa_o_cuota or importe for Exento
          },
        ],
      },
    ],
  },
};

// ============================================
// FIXTURE: Credit Note (Egreso)
// ============================================

/**
 * Credit note referencing a previous invoice
 */
export const FIXTURE_EGRESO: CFDIGeneratorInput = {
  invoice: {
    id: 'inv-005',
    serie: 'NC',
    folio: '00000001',
    issue_date: '2024-03-03T12:00:00',
    tipo_comprobante: 'E',
    payment_method: 'PUE',
    payment_form: '03',
    currency: 'MXN',
    exchange_rate: 1,
    exportacion: '01',
    subtotal: 2000,
    discount: 0,
    total: 2320,
    issuer_rfc: 'EKU9003173C9',
    issuer_name: 'ESCUELA KEMPER URGATE',
    issuer_tax_regime: '601',
    issuer_zip_code: '26015',
    receiver_rfc: 'URE180429TM6',
    receiver_name: 'UNIVERSIDAD ROBOTICA ESPAÑOLA',
    receiver_tax_regime: '601',
    receiver_zip_code: '65000',
    receiver_cfdi_use: 'G02',
    is_global: false,
    related_cfdi: [
      {
        tipo_relacion: '01', // Nota de credito
        related_uuid: 'F4F09AEF-57F2-4BE0-A828-87D1A80ED61C',
      },
    ],
    items: [
      {
        product_service_key: '81112100',
        unit_key: 'E48',
        unit_name: 'Hora',
        description: 'Devolucion parcial servicio de consultoria',
        quantity: 1,
        unit_price: 2000,
        discount_amount: 0,
        tax_object: '02',
        tax_breakdown: [
          {
            type: 'traslado',
            impuesto: '002',
            tipo_factor: 'Tasa',
            tasa_o_cuota: '0.160000',
            base: '2000.000000',
            importe: '320.000000',
          },
        ],
      },
    ],
  },
};

// ============================================
// FIXTURE: Publico en General (Global Invoice)
// ============================================

/**
 * Invoice for unidentified customer (RFC XAXX010101000)
 */
export const FIXTURE_PUBLICO_GENERAL: CFDIGeneratorInput = {
  invoice: {
    id: 'inv-006',
    serie: 'PG',
    folio: '00000001',
    issue_date: '2024-03-04T08:00:00',
    tipo_comprobante: 'I',
    payment_method: 'PUE',
    payment_form: '01',
    currency: 'MXN',
    exchange_rate: 1,
    exportacion: '01',
    subtotal: 1000,
    discount: 0,
    total: 1160,
    issuer_rfc: 'EKU9003173C9',
    issuer_name: 'ESCUELA KEMPER URGATE',
    issuer_tax_regime: '601',
    issuer_zip_code: '26015',
    receiver_rfc: 'XAXX010101000',
    receiver_name: 'PUBLICO EN GENERAL',
    receiver_tax_regime: '616', // Should be forced to 616
    receiver_zip_code: '26015',
    receiver_cfdi_use: 'G01', // Should be forced to S01
    is_global: false,
    items: [
      {
        product_service_key: '01010101',
        unit_key: 'H87',
        unit_name: 'Pieza',
        description: 'Venta mostrador',
        quantity: 1,
        unit_price: 1000,
        discount_amount: 0,
        tax_object: '02',
        tax_breakdown: [
          {
            type: 'traslado',
            impuesto: '002',
            tipo_factor: 'Tasa',
            tasa_o_cuota: '0.160000',
            base: '1000.000000',
            importe: '160.000000',
          },
        ],
      },
    ],
  },
};

// ============================================
// FIXTURE: Multiple Tax Rates
// ============================================

/**
 * Invoice with two items at different IVA rates (16% and 8%)
 */
export const FIXTURE_MULTITAX: CFDIGeneratorInput = {
  invoice: {
    id: 'inv-007',
    serie: 'M',
    folio: '00000001',
    issue_date: '2024-03-05T14:00:00',
    tipo_comprobante: 'I',
    payment_method: 'PUE',
    payment_form: '03',
    currency: 'MXN',
    exchange_rate: 1,
    exportacion: '01',
    subtotal: 15000,
    discount: 0,
    total: 17000, // 10000*1.16 + 5000*1.08 = 11600 + 5400
    issuer_rfc: 'EKU9003173C9',
    issuer_name: 'ESCUELA KEMPER URGATE',
    issuer_tax_regime: '601',
    issuer_zip_code: '26015',
    receiver_rfc: 'URE180429TM6',
    receiver_name: 'UNIVERSIDAD ROBOTICA ESPAÑOLA',
    receiver_tax_regime: '601',
    receiver_zip_code: '65000',
    receiver_cfdi_use: 'G01',
    is_global: false,
    items: [
      {
        product_service_key: '81112100',
        unit_key: 'E48',
        unit_name: 'Hora',
        description: 'Servicio general (16% IVA)',
        quantity: 1,
        unit_price: 10000,
        discount_amount: 0,
        tax_object: '02',
        tax_breakdown: [
          {
            type: 'traslado',
            impuesto: '002',
            tipo_factor: 'Tasa',
            tasa_o_cuota: '0.160000',
            base: '10000.000000',
            importe: '1600.000000',
          },
        ],
      },
      {
        product_service_key: '81112100',
        unit_key: 'E48',
        unit_name: 'Hora',
        description: 'Servicio zona frontera (8% IVA)',
        quantity: 1,
        unit_price: 5000,
        discount_amount: 0,
        tax_object: '02',
        tax_breakdown: [
          {
            type: 'traslado',
            impuesto: '002',
            tipo_factor: 'Tasa',
            tasa_o_cuota: '0.080000',
            base: '5000.000000',
            importe: '400.000000',
          },
        ],
      },
    ],
  },
};

// ============================================
// FIXTURE: With Discount
// ============================================

/**
 * Invoice with line-item discount
 */
export const FIXTURE_WITH_DISCOUNT: CFDIGeneratorInput = {
  invoice: {
    id: 'inv-008',
    serie: 'D',
    folio: '00000001',
    issue_date: '2024-03-06T10:00:00',
    tipo_comprobante: 'I',
    payment_method: 'PUE',
    payment_form: '03',
    currency: 'MXN',
    exchange_rate: 1,
    exportacion: '01',
    subtotal: 10000,
    discount: 1000,
    total: 10440, // (10000-1000)*1.16 = 9000*1.16 = 10440
    issuer_rfc: 'EKU9003173C9',
    issuer_name: 'ESCUELA KEMPER URGATE',
    issuer_tax_regime: '601',
    issuer_zip_code: '26015',
    receiver_rfc: 'URE180429TM6',
    receiver_name: 'UNIVERSIDAD ROBOTICA ESPAÑOLA',
    receiver_tax_regime: '601',
    receiver_zip_code: '65000',
    receiver_cfdi_use: 'G01',
    is_global: false,
    items: [
      {
        product_service_key: '81112100',
        unit_key: 'E48',
        unit_name: 'Hora',
        description: 'Servicio con descuento',
        quantity: 1,
        unit_price: 10000,
        discount_amount: 1000,
        tax_object: '02',
        tax_breakdown: [
          {
            type: 'traslado',
            impuesto: '002',
            tipo_factor: 'Tasa',
            tasa_o_cuota: '0.160000',
            base: '9000.000000', // After discount
            importe: '1440.000000',
          },
        ],
      },
    ],
  },
};

// ============================================
// FIXTURE: Foreign Currency (USD)
// ============================================

/**
 * Invoice in USD with exchange rate
 */
export const FIXTURE_USD_INVOICE: CFDIGeneratorInput = {
  invoice: {
    id: 'inv-009',
    serie: 'USD',
    folio: '00000001',
    issue_date: '2024-03-07T09:00:00',
    tipo_comprobante: 'I',
    payment_method: 'PUE',
    payment_form: '03',
    currency: 'USD',
    exchange_rate: 17.5,
    exportacion: '01',
    subtotal: 1000,
    discount: 0,
    total: 1160,
    issuer_rfc: 'EKU9003173C9',
    issuer_name: 'ESCUELA KEMPER URGATE',
    issuer_tax_regime: '601',
    issuer_zip_code: '26015',
    receiver_rfc: 'URE180429TM6',
    receiver_name: 'UNIVERSIDAD ROBOTICA ESPAÑOLA',
    receiver_tax_regime: '601',
    receiver_zip_code: '65000',
    receiver_cfdi_use: 'G01',
    is_global: false,
    items: [
      {
        product_service_key: '81112100',
        unit_key: 'E48',
        unit_name: 'Hora',
        description: 'Consulting services',
        quantity: 1,
        unit_price: 1000,
        discount_amount: 0,
        tax_object: '02',
        tax_breakdown: [
          {
            type: 'traslado',
            impuesto: '002',
            tipo_factor: 'Tasa',
            tasa_o_cuota: '0.160000',
            base: '1000.000000',
            importe: '160.000000',
          },
        ],
      },
    ],
  },
};

// ============================================
// FIXTURE: PPD (Deferred Payment)
// ============================================

/**
 * Invoice with PPD payment method (for payment complement later)
 */
export const FIXTURE_PPD_INVOICE: CFDIGeneratorInput = {
  invoice: {
    id: 'inv-010',
    serie: 'PPD',
    folio: '00000001',
    issue_date: '2024-03-08T11:00:00',
    tipo_comprobante: 'I',
    payment_method: 'PPD',
    payment_form: '99', // Por definir
    currency: 'MXN',
    exchange_rate: 1,
    exportacion: '01',
    subtotal: 50000,
    discount: 0,
    total: 58000,
    issuer_rfc: 'EKU9003173C9',
    issuer_name: 'ESCUELA KEMPER URGATE',
    issuer_tax_regime: '601',
    issuer_zip_code: '26015',
    receiver_rfc: 'URE180429TM6',
    receiver_name: 'UNIVERSIDAD ROBOTICA ESPAÑOLA',
    receiver_tax_regime: '601',
    receiver_zip_code: '65000',
    receiver_cfdi_use: 'G01',
    is_global: false,
    items: [
      {
        product_service_key: '81112100',
        unit_key: 'E48',
        unit_name: 'Hora',
        description: 'Proyecto de consultoria - pago diferido',
        quantity: 10,
        unit_price: 5000,
        discount_amount: 0,
        tax_object: '02',
        tax_breakdown: [
          {
            type: 'traslado',
            impuesto: '002',
            tipo_factor: 'Tasa',
            tasa_o_cuota: '0.160000',
            base: '50000.000000',
            importe: '8000.000000',
          },
        ],
      },
    ],
  },
};

// ============================================
// FIXTURE: With SKU (NoIdentificacion)
// ============================================

/**
 * Invoice item with SKU
 */
export const FIXTURE_WITH_SKU: CFDIGeneratorInput = {
  invoice: {
    id: 'inv-011',
    serie: 'S',
    folio: '00000001',
    issue_date: '2024-03-09T10:00:00',
    tipo_comprobante: 'I',
    payment_method: 'PUE',
    payment_form: '03',
    currency: 'MXN',
    exchange_rate: 1,
    exportacion: '01',
    subtotal: 500,
    discount: 0,
    total: 580,
    issuer_rfc: 'EKU9003173C9',
    issuer_name: 'ESCUELA KEMPER URGATE',
    issuer_tax_regime: '601',
    issuer_zip_code: '26015',
    receiver_rfc: 'URE180429TM6',
    receiver_name: 'UNIVERSIDAD ROBOTICA ESPAÑOLA',
    receiver_tax_regime: '601',
    receiver_zip_code: '65000',
    receiver_cfdi_use: 'G01',
    is_global: false,
    items: [
      {
        product_service_key: '43211508',
        unit_key: 'H87',
        unit_name: 'Pieza',
        sku: 'PROD-001-ABC',
        description: 'Producto con codigo interno',
        quantity: 5,
        unit_price: 100,
        discount_amount: 0,
        tax_object: '02',
        tax_breakdown: [
          {
            type: 'traslado',
            impuesto: '002',
            tipo_factor: 'Tasa',
            tasa_o_cuota: '0.160000',
            base: '500.000000',
            importe: '80.000000',
          },
        ],
      },
    ],
  },
};

// ============================================
// FIXTURE: Global Invoice with InformacionGlobal
// ============================================

/**
 * Global invoice (factura global)
 */
export const FIXTURE_GLOBAL_INVOICE: CFDIGeneratorInput = {
  invoice: {
    id: 'inv-012',
    serie: 'G',
    folio: '00000001',
    issue_date: '2024-03-31T23:59:00',
    tipo_comprobante: 'I',
    payment_method: 'PUE',
    payment_form: '01',
    currency: 'MXN',
    exchange_rate: 1,
    exportacion: '01',
    subtotal: 100000,
    discount: 0,
    total: 116000,
    issuer_rfc: 'EKU9003173C9',
    issuer_name: 'ESCUELA KEMPER URGATE',
    issuer_tax_regime: '601',
    issuer_zip_code: '26015',
    receiver_rfc: 'XAXX010101000',
    receiver_name: 'PUBLICO EN GENERAL',
    receiver_tax_regime: '616',
    receiver_zip_code: '26015',
    receiver_cfdi_use: 'S01',
    is_global: true,
    global_periodicity: '04', // Mensual
    global_months: '03', // Marzo
    global_year: '2024',
    items: [
      {
        product_service_key: '01010101',
        unit_key: 'ACT',
        unit_name: 'Actividad',
        description: 'Venta del periodo',
        quantity: 1,
        unit_price: 100000,
        discount_amount: 0,
        tax_object: '02',
        tax_breakdown: [
          {
            type: 'traslado',
            impuesto: '002',
            tipo_factor: 'Tasa',
            tasa_o_cuota: '0.160000',
            base: '100000.000000',
            importe: '16000.000000',
          },
        ],
      },
    ],
  },
};
