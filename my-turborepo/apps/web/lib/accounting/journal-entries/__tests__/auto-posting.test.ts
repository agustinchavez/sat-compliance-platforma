/**
 * Auto-Posting Tests (Component 22)
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';

// Mock the service module to test auto-posting logic in isolation
let mockFindBySourceResult: any = null;
let mockCreateAndPostResult: any = null;

vi.mock('../service', () => ({
  findBySource: vi.fn(async () => mockFindBySourceResult),
  createAndPostEntry: vi.fn(async (_orgId: string, input: any) => {
    mockCreateAndPostResult = input;
    return {
      id: 'entry-123',
      organizationId: _orgId,
      entryNumber: '2026-000001',
      status: 'posted',
      ...input,
      lines: input.lines || [],
    };
  }),
}));

import { autoPostFromInvoice, autoPostFromPayment, autoPostFromExpense } from '../auto-posting';

describe('Auto-Posting', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFindBySourceResult = null;
    mockCreateAndPostResult = null;
  });

  describe('autoPostFromInvoice', () => {
    const baseInvoice = {
      id: 'inv-123',
      organizationId: 'org-1',
      uuid: 'uuid-123',
      serie: 'A',
      folioNumber: '001',
      receiverName: 'Test Customer',
      subtotal: 1000,
      tax: 160,
      total: 1160,
      issuedAt: '2026-01-15T10:00:00Z',
    };

    it('should create a journal entry from invoice', async () => {
      const result = await autoPostFromInvoice(baseInvoice, 'user-1', {} as any);
      expect(result).toBeDefined();
      expect(result.id).toBe('entry-123');
      expect(mockCreateAndPostResult).toBeDefined();
    });

    it('should set poliza type to ingreso', async () => {
      await autoPostFromInvoice(baseInvoice, 'user-1', {} as any);
      expect(mockCreateAndPostResult.polizaType).toBe('ingreso');
    });

    it('should set source type to invoice', async () => {
      await autoPostFromInvoice(baseInvoice, 'user-1', {} as any);
      expect(mockCreateAndPostResult.sourceType).toBe('invoice');
      expect(mockCreateAndPostResult.sourceId).toBe('inv-123');
      expect(mockCreateAndPostResult.sourceUuidCfdi).toBe('uuid-123');
    });

    it('should create balanced lines', async () => {
      await autoPostFromInvoice(baseInvoice, 'user-1', {} as any);
      const lines = mockCreateAndPostResult.lines;
      const totalDebit = lines.reduce((s: number, l: any) => s + l.debit, 0);
      const totalCredit = lines.reduce((s: number, l: any) => s + l.credit, 0);
      expect(totalDebit).toBe(totalCredit);
    });

    it('should debit Clientes for total', async () => {
      await autoPostFromInvoice(baseInvoice, 'user-1', {} as any);
      const clientesLine = mockCreateAndPostResult.lines.find((l: any) => l.accountCode === '1104');
      expect(clientesLine).toBeDefined();
      expect(clientesLine.debit).toBe(1160);
    });

    it('should credit Ventas for subtotal', async () => {
      await autoPostFromInvoice(baseInvoice, 'user-1', {} as any);
      const ventasLine = mockCreateAndPostResult.lines.find((l: any) => l.accountCode === '4101');
      expect(ventasLine).toBeDefined();
      expect(ventasLine.credit).toBe(1000);
    });

    it('should credit IVA Trasladado for tax', async () => {
      await autoPostFromInvoice(baseInvoice, 'user-1', {} as any);
      const ivaLine = mockCreateAndPostResult.lines.find((l: any) => l.accountCode === '2104');
      expect(ivaLine).toBeDefined();
      expect(ivaLine.credit).toBe(160);
    });

    it('should skip IVA line when tax is 0', async () => {
      const noTaxInvoice = { ...baseInvoice, tax: 0, total: 1000 };
      await autoPostFromInvoice(noTaxInvoice, 'user-1', {} as any);
      const ivaLine = mockCreateAndPostResult.lines.find((l: any) => l.accountCode === '2104');
      expect(ivaLine).toBeUndefined();
    });

    it('should be idempotent', async () => {
      mockFindBySourceResult = { id: 'existing-entry', status: 'posted' };
      const result = await autoPostFromInvoice(baseInvoice, 'user-1', {} as any);
      expect(result.id).toBe('existing-entry');
      expect(mockCreateAndPostResult).toBeNull();
    });

    it('should include UUID on debit line', async () => {
      await autoPostFromInvoice(baseInvoice, 'user-1', {} as any);
      const clientesLine = mockCreateAndPostResult.lines.find((l: any) => l.accountCode === '1104');
      expect(clientesLine.uuidCfdi).toBe('uuid-123');
    });

    it('should extract date from issuedAt', async () => {
      await autoPostFromInvoice(baseInvoice, 'user-1', {} as any);
      expect(mockCreateAndPostResult.entryDate).toBe('2026-01-15');
    });

    it('should include receiver name in description', async () => {
      await autoPostFromInvoice(baseInvoice, 'user-1', {} as any);
      expect(mockCreateAndPostResult.description).toContain('Test Customer');
    });
  });

  describe('autoPostFromPayment', () => {
    const basePayment = {
      id: 'pay-123',
      organizationId: 'org-1',
      invoiceId: 'inv-123',
      invoiceUuid: 'uuid-123',
      amount: 1160,
      paymentDate: '2026-01-20',
      paymentForm: '03',
      referenceNumber: 'REF-001',
    };

    it('should create a journal entry from payment', async () => {
      const result = await autoPostFromPayment(basePayment, 'user-1', {} as any);
      expect(result).toBeDefined();
      expect(mockCreateAndPostResult).toBeDefined();
    });

    it('should set source type to payment', async () => {
      await autoPostFromPayment(basePayment, 'user-1', {} as any);
      expect(mockCreateAndPostResult.sourceType).toBe('payment');
      expect(mockCreateAndPostResult.sourceId).toBe('pay-123');
    });

    it('should debit Bancos and credit Clientes', async () => {
      await autoPostFromPayment(basePayment, 'user-1', {} as any);
      const bancosLine = mockCreateAndPostResult.lines.find((l: any) => l.accountCode === '1102');
      const clientesLine = mockCreateAndPostResult.lines.find((l: any) => l.accountCode === '1104');
      expect(bancosLine.debit).toBe(1160);
      expect(clientesLine.credit).toBe(1160);
    });

    it('should be idempotent', async () => {
      mockFindBySourceResult = { id: 'existing', status: 'posted' };
      const result = await autoPostFromPayment(basePayment, 'user-1', {} as any);
      expect(result.id).toBe('existing');
    });

    it('should set payment method for transfers', async () => {
      await autoPostFromPayment(basePayment, 'user-1', {} as any);
      const bancosLine = mockCreateAndPostResult.lines.find((l: any) => l.accountCode === '1102');
      expect(bancosLine.paymentMethod).toBe('transferencia');
    });

    it('should include reference number', async () => {
      await autoPostFromPayment(basePayment, 'user-1', {} as any);
      const bancosLine = mockCreateAndPostResult.lines.find((l: any) => l.accountCode === '1102');
      expect(bancosLine.paymentReference).toBe('REF-001');
    });
  });

  describe('autoPostFromExpense', () => {
    const baseExpense = {
      id: 'exp-123',
      organizationId: 'org-1',
      cfdiUuid: 'uuid-456',
      vendorName: 'Vendor S.A.',
      description: 'Office supplies',
      category: 'papeleria_oficina',
      amount: 500,
      taxAmount: 80,
      total: 580,
      expenseDate: '2026-01-10',
    };

    it('should create a journal entry from expense', async () => {
      const result = await autoPostFromExpense(baseExpense, 'user-1', {} as any);
      expect(result).toBeDefined();
      expect(mockCreateAndPostResult).toBeDefined();
    });

    it('should set poliza type to egreso', async () => {
      await autoPostFromExpense(baseExpense, 'user-1', {} as any);
      expect(mockCreateAndPostResult.polizaType).toBe('egreso');
    });

    it('should set source type to expense', async () => {
      await autoPostFromExpense(baseExpense, 'user-1', {} as any);
      expect(mockCreateAndPostResult.sourceType).toBe('expense');
      expect(mockCreateAndPostResult.sourceId).toBe('exp-123');
    });

    it('should debit Gastos and IVA, credit Proveedores', async () => {
      await autoPostFromExpense(baseExpense, 'user-1', {} as any);
      const lines = mockCreateAndPostResult.lines;
      const totalDebit = lines.reduce((s: number, l: any) => s + l.debit, 0);
      const totalCredit = lines.reduce((s: number, l: any) => s + l.credit, 0);
      expect(totalDebit).toBe(580);
      expect(totalCredit).toBe(580);
    });

    it('should credit Proveedores for total', async () => {
      await autoPostFromExpense(baseExpense, 'user-1', {} as any);
      const provLine = mockCreateAndPostResult.lines.find((l: any) => l.accountCode === '2101');
      expect(provLine.credit).toBe(580);
    });

    it('should include UUID on expense line', async () => {
      await autoPostFromExpense(baseExpense, 'user-1', {} as any);
      const expenseLine = mockCreateAndPostResult.lines.find((l: any) => l.debit > 0 && l.accountCode !== '1106');
      expect(expenseLine.uuidCfdi).toBe('uuid-456');
    });

    it('should be idempotent', async () => {
      mockFindBySourceResult = { id: 'existing', status: 'posted' };
      const result = await autoPostFromExpense(baseExpense, 'user-1', {} as any);
      expect(result.id).toBe('existing');
    });

    it('should skip IVA line when tax is 0', async () => {
      const noTaxExpense = { ...baseExpense, taxAmount: 0, total: 500 };
      await autoPostFromExpense(noTaxExpense, 'user-1', {} as any);
      const ivaLine = mockCreateAndPostResult.lines.find((l: any) => l.accountCode === '1106');
      expect(ivaLine).toBeUndefined();
    });

    it('should include vendor name in description', async () => {
      await autoPostFromExpense(baseExpense, 'user-1', {} as any);
      expect(mockCreateAndPostResult.description).toContain('Vendor S.A.');
    });
  });
});
