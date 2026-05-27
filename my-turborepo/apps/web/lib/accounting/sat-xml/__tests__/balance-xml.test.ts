/**
 * SAT Balance XML Tests (Component 23)
 */

import { describe, expect, it } from 'vitest';
import { generateBalanceXml } from '../balance-xml';
import type { TrialBalanceRow } from '../../types';

const makeRow = (overrides: Partial<TrialBalanceRow> = {}): TrialBalanceRow => ({
  accountId: 'acc-1',
  accountCode: '1101',
  accountName: 'Caja',
  satAgrupadorCode: '101.01',
  satNivel: 3,
  satNaturaleza: 'D',
  openingDebit: 10000,
  openingCredit: 0,
  periodDebit: 5000,
  periodCredit: 3000,
  closingDebit: 12000,
  closingCredit: 0,
  ...overrides,
});

describe('Balance XML Generation', () => {
  it('should generate valid XML with declaration', () => {
    const xml = generateBalanceXml({
      rfc: 'XAXX010101XXX',
      month: 1,
      year: 2026,
      tipo: 'N',
      rows: [makeRow()],
    });

    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
  });

  it('should include BCE namespace', () => {
    const xml = generateBalanceXml({
      rfc: 'XAXX010101XXX',
      month: 1,
      year: 2026,
      tipo: 'N',
      rows: [makeRow()],
    });

    expect(xml).toContain('BCE:Balanza');
    expect(xml).toContain('xmlns:BCE=');
  });

  it('should include Version 1.3', () => {
    const xml = generateBalanceXml({
      rfc: 'XAXX010101XXX',
      month: 1,
      year: 2026,
      tipo: 'N',
      rows: [makeRow()],
    });

    expect(xml).toContain('Version="1.3"');
  });

  it('should include TipoEnvio for normal balance', () => {
    const xml = generateBalanceXml({
      rfc: 'XAXX010101XXX',
      month: 1,
      year: 2026,
      tipo: 'N',
      rows: [makeRow()],
    });

    expect(xml).toContain('TipoEnvio="N"');
  });

  it('should include TipoEnvio and FechaModBal for complementaria', () => {
    const xml = generateBalanceXml({
      rfc: 'XAXX010101XXX',
      month: 1,
      year: 2026,
      tipo: 'C',
      rows: [makeRow()],
      fechaModBal: '2026-02-15',
    });

    expect(xml).toContain('TipoEnvio="C"');
    expect(xml).toContain('FechaModBal="2026-02-15"');
  });

  it('should generate Ctas elements', () => {
    const xml = generateBalanceXml({
      rfc: 'XAXX010101XXX',
      month: 1,
      year: 2026,
      tipo: 'N',
      rows: [makeRow({ accountCode: '1101' })],
    });

    expect(xml).toContain('BCE:Ctas');
    expect(xml).toContain('NumCta="1101"');
  });

  it('should include SaldoIni attribute', () => {
    const xml = generateBalanceXml({
      rfc: 'XAXX010101XXX',
      month: 1,
      year: 2026,
      tipo: 'N',
      rows: [makeRow({ openingDebit: 10000, openingCredit: 0, satNaturaleza: 'D' })],
    });

    expect(xml).toContain('SaldoIni="10000.00"');
  });

  it('should include Debe and Haber', () => {
    const xml = generateBalanceXml({
      rfc: 'XAXX010101XXX',
      month: 1,
      year: 2026,
      tipo: 'N',
      rows: [makeRow({ periodDebit: 5000, periodCredit: 3000 })],
    });

    expect(xml).toContain('Debe="5000.00"');
    expect(xml).toContain('Haber="3000.00"');
  });

  it('should include SaldoFin', () => {
    const xml = generateBalanceXml({
      rfc: 'XAXX010101XXX',
      month: 1,
      year: 2026,
      tipo: 'N',
      rows: [makeRow({
        openingDebit: 10000,
        openingCredit: 0,
        periodDebit: 5000,
        periodCredit: 3000,
        closingDebit: 12000,
        closingCredit: 0,
        satNaturaleza: 'D',
      })],
    });

    expect(xml).toContain('SaldoFin="12000.00"');
  });

  it('should handle acreedora accounts', () => {
    const xml = generateBalanceXml({
      rfc: 'XAXX010101XXX',
      month: 1,
      year: 2026,
      tipo: 'N',
      rows: [makeRow({
        accountCode: '2101',
        satNaturaleza: 'A',
        openingDebit: 0,
        openingCredit: 5000,
        periodDebit: 1000,
        periodCredit: 3000,
        closingDebit: 0,
        closingCredit: 7000,
      })],
    });

    expect(xml).toContain('NumCta="2101"');
    expect(xml).toContain('SaldoIni="5000.00"');
    expect(xml).toContain('SaldoFin="7000.00"');
  });

  it('should handle multiple rows', () => {
    const xml = generateBalanceXml({
      rfc: 'XAXX010101XXX',
      month: 1,
      year: 2026,
      tipo: 'N',
      rows: [
        makeRow({ accountCode: '1101' }),
        makeRow({ accountCode: '1102' }),
        makeRow({ accountCode: '2101', satNaturaleza: 'A' }),
      ],
    });

    expect(xml).toContain('NumCta="1101"');
    expect(xml).toContain('NumCta="1102"');
    expect(xml).toContain('NumCta="2101"');
  });

  it('should format amounts with 2 decimal places', () => {
    const xml = generateBalanceXml({
      rfc: 'XAXX010101XXX',
      month: 1,
      year: 2026,
      tipo: 'N',
      rows: [makeRow({ periodDebit: 1160.5, periodCredit: 0 })],
    });

    expect(xml).toContain('Debe="1160.50"');
  });

  it('should close root element', () => {
    const xml = generateBalanceXml({
      rfc: 'XAXX010101XXX',
      month: 1,
      year: 2026,
      tipo: 'N',
      rows: [],
    });

    expect(xml).toContain('</BCE:Balanza>');
  });
});
