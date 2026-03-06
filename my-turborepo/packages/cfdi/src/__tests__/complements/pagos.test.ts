/**
 * Pagos 2.0 Complement Tests
 *
 * Tests for payment complement XML generation.
 */

import { describe, it, expect } from 'vitest';
import { buildPagos20Complement, getPagos20SchemaLocation } from '../../complements/pagos.js';
import { PAGOS20_NAMESPACE, PAGOS20_XSD_LOCATION } from '../../constants.js';
import type { Pagos20Input } from '../../types.js';

// ============================================
// Test Fixtures
// ============================================

const SIMPLE_PAYMENT: Pagos20Input = {
  version: '2.0',
  totalTrasladosBaseIVA16: '10000.00',
  totalTrasladosImpuestoIVA16: '1600.00',
  montoTotalPagos: '11600.00',
  payments: [
    {
      fechaPago: '2024-03-15T10:30:00',
      formaDePagoP: '03', // Transferencia
      monedaP: 'MXN',
      monto: '11600.00',
      documentosRelacionados: [
        {
          idDocumento: 'F4F09AEF-57F2-4BE0-A828-87D1A80ED61C',
          monedaDR: 'MXN',
          equivalenciaDR: '1',
          numParcialidad: '1',
          impSaldoAnt: '11600.00',
          impPagado: '11600.00',
          impSaldoInsoluto: '0.00',
          objetoImpDR: '02',
        },
      ],
    },
  ],
};

const PAYMENT_WITH_TAXES: Pagos20Input = {
  version: '2.0',
  totalRetencionesIVA: '1067.00',
  totalRetencionesISR: '1000.00',
  totalTrasladosBaseIVA16: '10000.00',
  totalTrasladosImpuestoIVA16: '1600.00',
  montoTotalPagos: '9533.00',
  payments: [
    {
      fechaPago: '2024-03-15T14:00:00',
      formaDePagoP: '03',
      monedaP: 'MXN',
      monto: '9533.00',
      numOperacion: 'REF123456',
      rfcEmisorCtaBen: 'XAXX010101000',
      ctaBeneficiario: '123456789012345678',
      documentosRelacionados: [
        {
          idDocumento: 'A1B2C3D4-E5F6-7890-ABCD-EF1234567890',
          serie: 'A',
          folio: '123',
          monedaDR: 'MXN',
          equivalenciaDR: '1',
          numParcialidad: '1',
          impSaldoAnt: '9533.00',
          impPagado: '9533.00',
          impSaldoInsoluto: '0.00',
          objetoImpDR: '02',
          impuestosDR: {
            retencionesDR: [
              {
                baseDR: '10000.000000',
                impuestoDR: '002',
                tipoFactorDR: 'Tasa',
                tasaOCuotaDR: '0.106700',
                importeDR: '1067.000000',
              },
              {
                baseDR: '10000.000000',
                impuestoDR: '001',
                tipoFactorDR: 'Tasa',
                tasaOCuotaDR: '0.100000',
                importeDR: '1000.000000',
              },
            ],
            trasladosDR: [
              {
                baseDR: '10000.000000',
                impuestoDR: '002',
                tipoFactorDR: 'Tasa',
                tasaOCuotaDR: '0.160000',
                importeDR: '1600.000000',
              },
            ],
          },
        },
      ],
      impuestosP: {
        retencionesP: [
          { impuestoP: '002', importeP: '1067.00' },
          { impuestoP: '001', importeP: '1000.00' },
        ],
        trasladosP: [
          {
            baseP: '10000.00',
            impuestoP: '002',
            tipoFactorP: 'Tasa',
            tasaOCuotaP: '0.160000',
            importeP: '1600.00',
          },
        ],
      },
    },
  ],
};

const PARTIAL_PAYMENT: Pagos20Input = {
  version: '2.0',
  totalTrasladosBaseIVA16: '5000.00',
  totalTrasladosImpuestoIVA16: '800.00',
  montoTotalPagos: '5800.00',
  payments: [
    {
      fechaPago: '2024-03-01T09:00:00',
      formaDePagoP: '01', // Efectivo
      monedaP: 'MXN',
      monto: '5800.00',
      documentosRelacionados: [
        {
          idDocumento: 'BBBBBBBB-BBBB-BBBB-BBBB-BBBBBBBBBBBB',
          monedaDR: 'MXN',
          equivalenciaDR: '1',
          numParcialidad: '1',
          impSaldoAnt: '11600.00',
          impPagado: '5800.00',
          impSaldoInsoluto: '5800.00',
          objetoImpDR: '02',
        },
      ],
    },
  ],
};

const USD_PAYMENT: Pagos20Input = {
  version: '2.0',
  totalTrasladosBaseIVA16: '1000.00',
  totalTrasladosImpuestoIVA16: '160.00',
  montoTotalPagos: '1160.00',
  payments: [
    {
      fechaPago: '2024-03-20T15:00:00',
      formaDePagoP: '03',
      monedaP: 'USD',
      tipoCambioP: '17.5000',
      monto: '1160.00',
      documentosRelacionados: [
        {
          idDocumento: 'CCCCCCCC-CCCC-CCCC-CCCC-CCCCCCCCCCCC',
          monedaDR: 'USD',
          equivalenciaDR: '1',
          numParcialidad: '1',
          impSaldoAnt: '1160.00',
          impPagado: '1160.00',
          impSaldoInsoluto: '0.00',
          objetoImpDR: '02',
        },
      ],
    },
  ],
};

// ============================================
// Tests
// ============================================

describe('buildPagos20Complement', () => {
  describe('basic structure', () => {
    it('produces XML with pago20: prefix', () => {
      const xml = buildPagos20Complement(SIMPLE_PAYMENT);

      expect(xml).toContain('pago20:Pagos');
      expect(xml).toContain('pago20:Totales');
      expect(xml).toContain('pago20:Pago');
      expect(xml).toContain('pago20:DoctoRelacionado');
    });

    it('includes xmlns:pago20 namespace declaration', () => {
      const xml = buildPagos20Complement(SIMPLE_PAYMENT);

      expect(xml).toContain(`xmlns:pago20="${PAGOS20_NAMESPACE}"`);
    });

    it('includes Version="2.0" on Pagos element', () => {
      const xml = buildPagos20Complement(SIMPLE_PAYMENT);

      expect(xml).toContain('Version="2.0"');
    });

    it('includes XML declaration', () => {
      const xml = buildPagos20Complement(SIMPLE_PAYMENT);

      expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    });
  });

  describe('Totales node', () => {
    it('includes MontoTotalPagos (required)', () => {
      const xml = buildPagos20Complement(SIMPLE_PAYMENT);

      expect(xml).toContain('MontoTotalPagos="11600.00"');
    });

    it('includes IVA 16% traslados totals when present', () => {
      const xml = buildPagos20Complement(SIMPLE_PAYMENT);

      expect(xml).toContain('TotalTrasladosBaseIVA16="10000.00"');
      expect(xml).toContain('TotalTrasladosImpuestoIVA16="1600.00"');
    });

    it('includes retention totals when present', () => {
      const xml = buildPagos20Complement(PAYMENT_WITH_TAXES);

      expect(xml).toContain('TotalRetencionesIVA="1067.00"');
      expect(xml).toContain('TotalRetencionesISR="1000.00"');
    });

    it('omits optional totals when not provided', () => {
      const xml = buildPagos20Complement(SIMPLE_PAYMENT);

      expect(xml).not.toContain('TotalRetencionesIVA');
      expect(xml).not.toContain('TotalRetencionesISR');
      expect(xml).not.toContain('TotalTrasladosBaseIVA8');
    });
  });

  describe('Pago node', () => {
    it('includes required payment attributes', () => {
      const xml = buildPagos20Complement(SIMPLE_PAYMENT);

      expect(xml).toContain('FechaPago="2024-03-15T10:30:00"');
      expect(xml).toContain('FormaDePagoP="03"');
      expect(xml).toContain('MonedaP="MXN"');
      expect(xml).toContain('Monto="11600.00"');
    });

    it('includes optional bank attributes when present', () => {
      const xml = buildPagos20Complement(PAYMENT_WITH_TAXES);

      expect(xml).toContain('NumOperacion="REF123456"');
      expect(xml).toContain('RfcEmisorCtaBen="XAXX010101000"');
      expect(xml).toContain('CtaBeneficiario="123456789012345678"');
    });

    it('includes TipoCambioP for foreign currency', () => {
      const xml = buildPagos20Complement(USD_PAYMENT);

      expect(xml).toContain('MonedaP="USD"');
      expect(xml).toContain('TipoCambioP="17.5000"');
    });

    it('omits TipoCambioP when not provided', () => {
      const xml = buildPagos20Complement(SIMPLE_PAYMENT);

      expect(xml).not.toContain('TipoCambioP');
    });
  });

  describe('DoctoRelacionado node', () => {
    it('includes required document attributes', () => {
      const xml = buildPagos20Complement(SIMPLE_PAYMENT);

      expect(xml).toContain('IdDocumento="F4F09AEF-57F2-4BE0-A828-87D1A80ED61C"');
      expect(xml).toContain('MonedaDR="MXN"');
      expect(xml).toContain('EquivalenciaDR="1"');
      expect(xml).toContain('NumParcialidad="1"');
      expect(xml).toContain('ImpSaldoAnt="11600.00"');
      expect(xml).toContain('ImpPagado="11600.00"');
      expect(xml).toContain('ImpSaldoInsoluto="0.00"');
      expect(xml).toContain('ObjetoImpDR="02"');
    });

    it('includes Serie and Folio when present', () => {
      const xml = buildPagos20Complement(PAYMENT_WITH_TAXES);

      expect(xml).toContain('Serie="A"');
      expect(xml).toContain('Folio="123"');
    });

    it('handles partial payment with remaining balance', () => {
      const xml = buildPagos20Complement(PARTIAL_PAYMENT);

      expect(xml).toContain('ImpSaldoAnt="11600.00"');
      expect(xml).toContain('ImpPagado="5800.00"');
      expect(xml).toContain('ImpSaldoInsoluto="5800.00"');
    });
  });

  describe('ImpuestosDR node', () => {
    it('includes RetencionesDR when present', () => {
      const xml = buildPagos20Complement(PAYMENT_WITH_TAXES);

      expect(xml).toContain('pago20:ImpuestosDR');
      expect(xml).toContain('pago20:RetencionesDR');
      expect(xml).toContain('pago20:RetencionDR');
      expect(xml).toContain('ImpuestoDR="002"');
      expect(xml).toContain('ImpuestoDR="001"');
    });

    it('includes TrasladosDR when present', () => {
      const xml = buildPagos20Complement(PAYMENT_WITH_TAXES);

      expect(xml).toContain('pago20:TrasladosDR');
      expect(xml).toContain('pago20:TrasladoDR');
      expect(xml).toContain('BaseDR="10000.000000"');
      expect(xml).toContain('TasaOCuotaDR="0.160000"');
      expect(xml).toContain('ImporteDR="1600.000000"');
    });

    it('omits ImpuestosDR when not present', () => {
      const xml = buildPagos20Complement(SIMPLE_PAYMENT);

      expect(xml).not.toContain('pago20:ImpuestosDR');
    });
  });

  describe('ImpuestosP node', () => {
    it('includes RetencionesP when present', () => {
      const xml = buildPagos20Complement(PAYMENT_WITH_TAXES);

      expect(xml).toContain('pago20:ImpuestosP');
      expect(xml).toContain('pago20:RetencionesP');
      expect(xml).toContain('pago20:RetencionP');
      expect(xml).toContain('ImpuestoP="002"');
      expect(xml).toContain('ImporteP="1067.00"');
    });

    it('includes TrasladosP when present', () => {
      const xml = buildPagos20Complement(PAYMENT_WITH_TAXES);

      expect(xml).toContain('pago20:TrasladosP');
      expect(xml).toContain('pago20:TrasladoP');
      expect(xml).toContain('BaseP="10000.00"');
      expect(xml).toContain('TasaOCuotaP="0.160000"');
      expect(xml).toContain('ImporteP="1600.00"');
    });

    it('omits ImpuestosP when not present', () => {
      const xml = buildPagos20Complement(SIMPLE_PAYMENT);

      expect(xml).not.toContain('pago20:ImpuestosP');
    });
  });

  describe('multiple payments and documents', () => {
    it('handles multiple payments in a single complement', () => {
      const multiPayment: Pagos20Input = {
        version: '2.0',
        montoTotalPagos: '23200.00',
        payments: [
          {
            fechaPago: '2024-03-01T10:00:00',
            formaDePagoP: '03',
            monedaP: 'MXN',
            monto: '11600.00',
            documentosRelacionados: [
              {
                idDocumento: 'AAAAAAAA-AAAA-AAAA-AAAA-AAAAAAAAAAAA',
                monedaDR: 'MXN',
                equivalenciaDR: '1',
                numParcialidad: '1',
                impSaldoAnt: '11600.00',
                impPagado: '11600.00',
                impSaldoInsoluto: '0.00',
                objetoImpDR: '02',
              },
            ],
          },
          {
            fechaPago: '2024-03-15T14:00:00',
            formaDePagoP: '01',
            monedaP: 'MXN',
            monto: '11600.00',
            documentosRelacionados: [
              {
                idDocumento: 'BBBBBBBB-BBBB-BBBB-BBBB-BBBBBBBBBBBB',
                monedaDR: 'MXN',
                equivalenciaDR: '1',
                numParcialidad: '1',
                impSaldoAnt: '11600.00',
                impPagado: '11600.00',
                impSaldoInsoluto: '0.00',
                objetoImpDR: '02',
              },
            ],
          },
        ],
      };

      const xml = buildPagos20Complement(multiPayment);

      // Count occurrences of pago20:Pago
      const pagoMatches = xml.match(/pago20:Pago /g);
      expect(pagoMatches).toHaveLength(2);

      expect(xml).toContain('AAAAAAAA-AAAA-AAAA-AAAA-AAAAAAAAAAAA');
      expect(xml).toContain('BBBBBBBB-BBBB-BBBB-BBBB-BBBBBBBBBBBB');
    });

    it('handles payment with multiple DoctoRelacionado', () => {
      const multiDocto: Pagos20Input = {
        version: '2.0',
        montoTotalPagos: '23200.00',
        payments: [
          {
            fechaPago: '2024-03-15T10:00:00',
            formaDePagoP: '03',
            monedaP: 'MXN',
            monto: '23200.00',
            documentosRelacionados: [
              {
                idDocumento: 'FIRST-UUID-0000-0000-000000000001',
                monedaDR: 'MXN',
                equivalenciaDR: '1',
                numParcialidad: '1',
                impSaldoAnt: '11600.00',
                impPagado: '11600.00',
                impSaldoInsoluto: '0.00',
                objetoImpDR: '02',
              },
              {
                idDocumento: 'SECOND-UUID-000-0000-000000000002',
                monedaDR: 'MXN',
                equivalenciaDR: '1',
                numParcialidad: '1',
                impSaldoAnt: '11600.00',
                impPagado: '11600.00',
                impSaldoInsoluto: '0.00',
                objetoImpDR: '02',
              },
            ],
          },
        ],
      };

      const xml = buildPagos20Complement(multiDocto);

      // Count occurrences of pago20:DoctoRelacionado
      const doctoMatches = xml.match(/pago20:DoctoRelacionado /g);
      expect(doctoMatches).toHaveLength(2);

      expect(xml).toContain('FIRST-UUID');
      expect(xml).toContain('SECOND-UUID');
    });
  });
});

describe('getPagos20SchemaLocation', () => {
  it('returns correct schema location string', () => {
    const schemaLocation = getPagos20SchemaLocation();

    expect(schemaLocation).toBe(`${PAGOS20_NAMESPACE} ${PAGOS20_XSD_LOCATION}`);
  });

  it('contains namespace and XSD URL', () => {
    const schemaLocation = getPagos20SchemaLocation();

    expect(schemaLocation).toContain('http://www.sat.gob.mx/Pagos20');
    expect(schemaLocation).toContain('Pagos20.xsd');
  });
});
