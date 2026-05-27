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
    makeLine({ lineNumber: 1, accountId: 'acc-1', accountCode: '1104', debit: 1160.50, credit: 0 }),
    makeLine({ lineNumber: 2, accountId: 'acc-2', accountCode: '4101', debit: 0, credit: 1000 }),
    makeLine({ lineNumber: 3, accountId: 'acc-3', accountCode: '2104', debit: 0, credit: 160.50 }),
  ],
  createdAt: '2026-01-15',
  createdBy: 'user-1',
  updatedAt: '2026-01-15',
  ...overrides,
});

const defaultAccountNames = new Map<string, string>([
  ['acc-1', 'Clientes'],
  ['acc-2', 'Ventas'],
  ['acc-3', 'IVA Trasladado'],
]);

const defaultInput = (overrides: any = {}) => ({
  rfc: 'XAXX010101XXX',
  month: 1,
  year: 2026,
  tipoSolicitud: 'AF' as const,
  numOrden: 'ABC123456789',
  entries: [makeEntry()],
  accountNames: defaultAccountNames,
  ...overrides,
});

describe('Journal XML Generation', () => {
  it('should generate valid XML with declaration', () => {
    const xml = generateJournalXml(defaultInput());
    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
  });

  it('should include PLZ namespace', () => {
    const xml = generateJournalXml(defaultInput());
    expect(xml).toContain('PLZ:Polizas');
    expect(xml).toContain('xmlns:PLZ=');
  });

  it('should include Version 1.3', () => {
    const xml = generateJournalXml(defaultInput());
    expect(xml).toContain('Version="1.3"');
  });

  it('should include TipoSolicitud', () => {
    const xml = generateJournalXml(defaultInput());
    expect(xml).toContain('TipoSolicitud="AF"');
  });

  it('should include NumOrden when provided', () => {
    const xml = generateJournalXml(defaultInput({ numOrden: 'ABC123456789' }));
    expect(xml).toContain('NumOrden="ABC123456789"');
  });

  it('should generate Poliza elements', () => {
    const xml = generateJournalXml(defaultInput());
    expect(xml).toContain('PLZ:Poliza');
    expect(xml).toContain('NumUnIdenPol="2026-000001"');
  });

  it('should include Fecha on poliza', () => {
    const xml = generateJournalXml(defaultInput({
      entries: [makeEntry({ entryDate: '2026-01-15' })],
    }));
    expect(xml).toContain('Fecha="2026-01-15"');
  });

  it('should include Concepto on poliza', () => {
    const xml = generateJournalXml(defaultInput({
      entries: [makeEntry({ description: 'Factura A-001' })],
    }));
    expect(xml).toContain('Concepto="Factura A-001"');
  });

  it('should generate Transaccion elements for each line', () => {
    const xml = generateJournalXml(defaultInput());
    expect(xml).toContain('PLZ:Transaccion');
    expect(xml).toContain('NumCta="1104"');
    expect(xml).toContain('NumCta="4101"');
    expect(xml).toContain('NumCta="2104"');
  });

  it('should include Debe and Haber', () => {
    const xml = generateJournalXml(defaultInput());
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
          uuidCfdi: '550e8400-e29b-41d4-a716-446655440000',
          rfcThirdParty: 'XAXX010101000',
          montoTotalComp: 1160.50,
        }),
        makeLine({ lineNumber: 2, accountId: 'acc-2', accountCode: '4101', debit: 0, credit: 1160.50 }),
      ],
    });

    const xml = generateJournalXml(defaultInput({ entries: [entry] }));
    expect(xml).toContain('PLZ:CompNal');
    expect(xml).toContain('UUID_CFDI="550e8400-e29b-41d4-a716-446655440000"');
    expect(xml).toContain('RFC="XAXX010101000"');
    expect(xml).toContain('MontoTotal="1160.50"');
  });

  it('should generate Transferencia for bank transfers with all required attrs', () => {
    const entry = makeEntry({
      lines: [
        makeLine({
          accountCode: '1102',
          debit: 5000,
          credit: 0,
          paymentMethod: 'transferencia',
          bankAccount: '001234567890',
          bankCode: '012',
          destBankAccount: '009876543210',
          destBankCode: '014',
          paymentDate: '2026-01-15',
          paymentBeneficiary: 'Proveedor SA de CV',
          paymentBeneficiaryRfc: 'PSA920101ABC',
        }),
        makeLine({ lineNumber: 2, accountId: 'acc-2', accountCode: '1104', debit: 0, credit: 5000 }),
      ],
    });

    const xml = generateJournalXml(defaultInput({ entries: [entry] }));
    expect(xml).toContain('PLZ:Transferencia');
    expect(xml).toContain('CtaOri="001234567890"');
    expect(xml).toContain('BancoOriNal="012"');
    expect(xml).toContain('CtaDest="009876543210"');
    expect(xml).toContain('BancoDestNal="014"');
    expect(xml).toContain('Fecha="2026-01-15"');
    expect(xml).toContain('Benef="Proveedor SA de CV"');
    expect(xml).toContain('RFC="PSA920101ABC"');
    expect(xml).toContain('Monto="5000.00"');
  });

  it('should generate Cheque with all required attributes', () => {
    const entry = makeEntry({
      lines: [
        makeLine({
          accountCode: '1102',
          debit: 0,
          credit: 3000,
          paymentMethod: 'cheque',
          paymentReference: '00012345',
          bankCode: '012',
          bankAccount: '0012345678',
          paymentDate: '2026-01-15',
          paymentBeneficiary: 'Proveedor SA de CV',
          paymentBeneficiaryRfc: 'PSA920101ABC',
        }),
        makeLine({ lineNumber: 2, accountId: 'acc-2', accountCode: '6101', debit: 3000, credit: 0 }),
      ],
    });

    const xml = generateJournalXml(defaultInput({ entries: [entry] }));
    expect(xml).toContain('PLZ:Cheque');
    expect(xml).toContain('Num="00012345"');
    expect(xml).toContain('BanEmisNal="012"');
    expect(xml).toContain('CtaOri="0012345678"');
    expect(xml).toContain('Fecha="2026-01-15"');
    expect(xml).toContain('Benef="Proveedor SA de CV"');
    expect(xml).toContain('RFC="PSA920101ABC"');
    expect(xml).toContain('Monto="3000.00"');
    // Regression guard: no BanEmworCheworNal typo
    expect(xml).not.toContain('BanEmworCheworNal');
  });

  it('should throw on Cheque missing required Benef', () => {
    const entry = makeEntry({
      lines: [
        makeLine({
          paymentMethod: 'cheque',
          paymentReference: '00012345',
          bankCode: '012',
          bankAccount: '0012345678',
          // paymentBeneficiary missing
        }),
        makeLine({ lineNumber: 2, accountId: 'acc-2', accountCode: '4101', debit: 0, credit: 1160.50 }),
      ],
    });

    expect(() => generateJournalXml(defaultInput({ entries: [entry] })))
      .toThrow(/required attribute Benef/);
  });

  it('should skip non-posted entries', () => {
    const xml = generateJournalXml(defaultInput({
      entries: [makeEntry({ status: 'draft', entryNumber: 'DRAFT-001' })],
    }));
    expect(xml).not.toContain('DRAFT-001');
  });

  it('should handle multiple entries', () => {
    const xml = generateJournalXml(defaultInput({
      entries: [
        makeEntry({ entryNumber: '2026-000001' }),
        makeEntry({ id: 'e2', entryNumber: '2026-000002' }),
      ],
    }));
    expect(xml).toContain('NumUnIdenPol="2026-000001"');
    expect(xml).toContain('NumUnIdenPol="2026-000002"');
  });

  it('should close all elements properly', () => {
    const xml = generateJournalXml(defaultInput());
    expect(xml).toContain('</PLZ:Transaccion>');
    expect(xml).toContain('</PLZ:Poliza>');
    expect(xml).toContain('</PLZ:Polizas>');
  });

  it('should use account name for DesCta, not line description', () => {
    const accountNames = new Map([['acc-1', 'Caja General']]);
    const entry = makeEntry({
      lines: [
        makeLine({
          accountId: 'acc-1',
          accountCode: '1101001',
          description: 'Depósito de cliente Acme',
        }),
        makeLine({ lineNumber: 2, accountId: 'acc-2', accountCode: '4101', debit: 0, credit: 1160.50 }),
      ],
    });

    const xml = generateJournalXml(defaultInput({ entries: [entry], accountNames }));
    expect(xml).toContain('DesCta="Caja General"');
    expect(xml).not.toContain('DesCta="Depósito de cliente Acme"');
  });

  it('should throw on NumOrden missing when TipoSolicitud=AF', () => {
    expect(() => generateJournalXml(defaultInput({
      tipoSolicitud: 'AF',
      numOrden: undefined,
    }))).toThrow(/NumOrden is required/);
  });

  it('should throw on NumTramite missing when TipoSolicitud=DE', () => {
    expect(() => generateJournalXml(defaultInput({
      tipoSolicitud: 'DE',
      numOrden: undefined,
      numTramite: undefined,
    }))).toThrow(/NumTramite is required/);
  });
});

describe('Anexo 24 typo regression guards', () => {
  it('does not emit BanEmworCheworNal', () => {
    const entry = makeEntry({
      lines: [
        makeLine({
          paymentMethod: 'cheque',
          paymentReference: '00012345',
          bankCode: '012',
          bankAccount: '0012345678',
          paymentDate: '2026-01-15',
          paymentBeneficiary: 'Test',
          paymentBeneficiaryRfc: 'TST920101ABC',
        }),
        makeLine({ lineNumber: 2, accountId: 'acc-2', accountCode: '4101', debit: 0, credit: 1160.50 }),
      ],
    });
    const xml = generateJournalXml(defaultInput({ entries: [entry] }));
    expect(xml).not.toContain('BanEmworCheworNal');
  });
});
