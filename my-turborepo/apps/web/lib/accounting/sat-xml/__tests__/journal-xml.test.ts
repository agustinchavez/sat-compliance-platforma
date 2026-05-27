/**
 * SAT Journal XML Tests (Component 23)
 */

import { describe, expect, it } from 'vitest';
import { generateJournalXml } from '../journal-xml';
import type { JournalEntry, JournalEntryLine } from '../../types';

const makeLine = (overrides: Partial<JournalEntryLine> = {}): JournalEntryLine => ({
  id: 'line-1',
  organizationId: 'org-1',
  journalEntryId: 'entry-1',
  lineNumber: 1,
  accountId: 'acc-1',
  accountCode: '1104',
  debit: 1160.50,
  credit: 0,
  description: 'Cargo a clientes',
  createdAt: '2026-01-15',
  ...overrides,
});

const makeEntry = (overrides: Partial<JournalEntry> = {}): JournalEntry => ({
  id: 'entry-1',
  organizationId: 'org-1',
  entryNumber: '2026-000001',
  fiscalPeriodId: 'period-1',
  entryDate: '2026-01-15',
  polizaType: 'ingreso',
  description: 'Factura A-001',
  status: 'posted',
  currencyCode: 'MXN',
  exchangeRate: 1,
  totalDebit: 1160.50,
  totalCredit: 1160.50,
  lines: [
    makeLine({ lineNumber: 1, accountCode: '1104', debit: 1160.50, credit: 0 }),
    makeLine({ lineNumber: 2, accountCode: '4101', debit: 0, credit: 1000 }),
    makeLine({ lineNumber: 3, accountCode: '2104', debit: 0, credit: 160.50 }),
  ],
  createdAt: '2026-01-15',
  createdBy: 'user-1',
  updatedAt: '2026-01-15',
  ...overrides,
});

describe('Journal XML Generation', () => {
  it('should generate valid XML with declaration', () => {
    const xml = generateJournalXml({
      rfc: 'XAXX010101XXX',
      month: 1,
      year: 2026,
      tipoSolicitud: 'AF',
      entries: [makeEntry()],
    });

    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
  });

  it('should include PLZ namespace', () => {
    const xml = generateJournalXml({
      rfc: 'XAXX010101XXX',
      month: 1,
      year: 2026,
      tipoSolicitud: 'AF',
      entries: [makeEntry()],
    });

    expect(xml).toContain('PLZ:Polizas');
    expect(xml).toContain('xmlns:PLZ=');
  });

  it('should include Version 1.3', () => {
    const xml = generateJournalXml({
      rfc: 'XAXX010101XXX',
      month: 1,
      year: 2026,
      tipoSolicitud: 'AF',
      entries: [makeEntry()],
    });

    expect(xml).toContain('Version="1.3"');
  });

  it('should include TipoSolicitud', () => {
    const xml = generateJournalXml({
      rfc: 'XAXX010101XXX',
      month: 1,
      year: 2026,
      tipoSolicitud: 'AF',
      entries: [makeEntry()],
    });

    expect(xml).toContain('TipoSolicitud="AF"');
  });

  it('should include NumOrden when provided', () => {
    const xml = generateJournalXml({
      rfc: 'XAXX010101XXX',
      month: 1,
      year: 2026,
      tipoSolicitud: 'AF',
      numOrden: 'ABC123456789',
      entries: [makeEntry()],
    });

    expect(xml).toContain('NumOrden="ABC123456789"');
  });

  it('should generate Poliza elements', () => {
    const xml = generateJournalXml({
      rfc: 'XAXX010101XXX',
      month: 1,
      year: 2026,
      tipoSolicitud: 'AF',
      entries: [makeEntry()],
    });

    expect(xml).toContain('PLZ:Poliza');
    expect(xml).toContain('NumUnIdenPol="2026-000001"');
  });

  it('should include Fecha on poliza', () => {
    const xml = generateJournalXml({
      rfc: 'XAXX010101XXX',
      month: 1,
      year: 2026,
      tipoSolicitud: 'AF',
      entries: [makeEntry({ entryDate: '2026-01-15' })],
    });

    expect(xml).toContain('Fecha="2026-01-15"');
  });

  it('should include Concepto on poliza', () => {
    const xml = generateJournalXml({
      rfc: 'XAXX010101XXX',
      month: 1,
      year: 2026,
      tipoSolicitud: 'AF',
      entries: [makeEntry({ description: 'Factura A-001' })],
    });

    expect(xml).toContain('Concepto="Factura A-001"');
  });

  it('should generate Transaccion elements for each line', () => {
    const xml = generateJournalXml({
      rfc: 'XAXX010101XXX',
      month: 1,
      year: 2026,
      tipoSolicitud: 'AF',
      entries: [makeEntry()],
    });

    expect(xml).toContain('PLZ:Transaccion');
    expect(xml).toContain('NumCta="1104"');
    expect(xml).toContain('NumCta="4101"');
    expect(xml).toContain('NumCta="2104"');
  });

  it('should include Debe and Haber', () => {
    const xml = generateJournalXml({
      rfc: 'XAXX010101XXX',
      month: 1,
      year: 2026,
      tipoSolicitud: 'AF',
      entries: [makeEntry()],
    });

    expect(xml).toContain('Debe="1160.50"');
    expect(xml).toContain('Haber="1000.00"');
    expect(xml).toContain('Haber="160.50"');
  });

  it('should generate CompNal for lines with UUID', () => {
    const entry = makeEntry({
      lines: [
        makeLine({
          accountCode: '1104',
          debit: 1160.50,
          credit: 0,
          uuidCfdi: 'uuid-cfdi-123',
          rfcThirdParty: 'XAXX010101000',
          montoTotalComp: 1160.50,
        }),
        makeLine({ lineNumber: 2, accountCode: '4101', debit: 0, credit: 1160.50 }),
      ],
    });

    const xml = generateJournalXml({
      rfc: 'XAXX010101XXX',
      month: 1,
      year: 2026,
      tipoSolicitud: 'AF',
      entries: [entry],
    });

    expect(xml).toContain('PLZ:CompNal');
    expect(xml).toContain('UUID_CFDI="uuid-cfdi-123"');
    expect(xml).toContain('RFC="XAXX010101000"');
    expect(xml).toContain('MontoTotal="1160.50"');
  });

  it('should generate Transferencia for bank transfers', () => {
    const entry = makeEntry({
      lines: [
        makeLine({
          accountCode: '1102',
          debit: 5000,
          credit: 0,
          paymentMethod: 'transferencia',
          bankAccount: '001234567890',
          bankCode: '012',
        }),
        makeLine({ lineNumber: 2, accountCode: '1104', debit: 0, credit: 5000 }),
      ],
    });

    const xml = generateJournalXml({
      rfc: 'XAXX010101XXX',
      month: 1,
      year: 2026,
      tipoSolicitud: 'AF',
      entries: [entry],
    });

    expect(xml).toContain('PLZ:Transferencia');
    expect(xml).toContain('CtaOri="001234567890"');
    expect(xml).toContain('Monto="5000.00"');
  });

  it('should skip non-posted entries', () => {
    const xml = generateJournalXml({
      rfc: 'XAXX010101XXX',
      month: 1,
      year: 2026,
      tipoSolicitud: 'AF',
      entries: [makeEntry({ status: 'draft', entryNumber: 'DRAFT-001' })],
    });

    expect(xml).not.toContain('DRAFT-001');
  });

  it('should handle multiple entries', () => {
    const xml = generateJournalXml({
      rfc: 'XAXX010101XXX',
      month: 1,
      year: 2026,
      tipoSolicitud: 'AF',
      entries: [
        makeEntry({ entryNumber: '2026-000001' }),
        makeEntry({ id: 'e2', entryNumber: '2026-000002' }),
      ],
    });

    expect(xml).toContain('NumUnIdenPol="2026-000001"');
    expect(xml).toContain('NumUnIdenPol="2026-000002"');
  });

  it('should close all elements properly', () => {
    const xml = generateJournalXml({
      rfc: 'XAXX010101XXX',
      month: 1,
      year: 2026,
      tipoSolicitud: 'AF',
      entries: [makeEntry()],
    });

    expect(xml).toContain('</PLZ:Transaccion>');
    expect(xml).toContain('</PLZ:Poliza>');
    expect(xml).toContain('</PLZ:Polizas>');
  });
});
