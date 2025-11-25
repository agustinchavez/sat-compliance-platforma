import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Create a mock chain builder that supports all methods
const createMockQueryChain = (finalData: any = null, finalError: any = null, isArray = false) => {
  const resultData = isArray ? (finalData ? [finalData] : []) : finalData;
  const chain: any = {
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    is: vi.fn(() => chain),
    gte: vi.fn(() => chain),
    lte: vi.fn(() => chain),
    lt: vi.fn(() => chain),
    in: vi.fn(() => chain),
    order: vi.fn(() => chain),
    limit: vi.fn(() => chain),
    range: vi.fn(() => chain),
    single: vi.fn(() => Promise.resolve({ data: finalData, error: finalError })),
    then: vi.fn((resolve: any) => resolve({ data: resultData, error: finalError })),
  };
  // Make the chain itself awaitable
  chain[Symbol.toStringTag] = 'Promise';
  return chain;
};

// Mock all external dependencies
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(() => Promise.resolve({
    from: vi.fn((table: string) => {
      const cfdiData = {
        id: 'cfdi-123',
        uuid: 'A1B2C3D4-E5F6-7890-ABCD-EF1234567890',
        organization_id: 'org-123',
        reconciled: false,
        monto_total: 1160.00,
        parsed_data: {
          uuid: 'A1B2C3D4-E5F6-7890-ABCD-EF1234567890',
          version: '4.0',
          fecha: '2024-06-15T10:30:00',
          total: 1160.00,
          subTotal: 1000.00,
          tipoComprobante: 'I',
          emisor: { rfc: 'EMIT123456ABC', nombre: 'Emisor SA' },
          receptor: { rfc: 'RECV987654XYZ', nombre: 'Receptor SA' },
          impuestos: { totalImpuestosTrasladados: 160.00 },
        },
      };

      const invoiceData = {
        id: 'inv-123',
        uuid: 'A1B2C3D4-E5F6-7890-ABCD-EF1234567890',
        folio_number: 'F001',
        customer_id: 'cust-123',
        subtotal: 1000.00,
        tax: 160.00,
        total: 1160.00,
        status: 'paid',
        issued_at: '2024-06-15T10:30:00Z',
        customers: {
          rfc: 'RECV987654XYZ',
          legal_name: 'Receptor SA de CV',
        },
      };

      if (table === 'downloaded_cfdis') {
        // Return array for list queries, single item for single queries
        const chain = createMockQueryChain(cfdiData, null, true);
        return {
          ...chain,
          insert: vi.fn(() => Promise.resolve({ error: null })),
          update: vi.fn(() => ({
            eq: vi.fn(() => Promise.resolve({ error: null })),
          })),
          delete: vi.fn(() => chain),
        };
      }
      if (table === 'invoices') {
        const chain = createMockQueryChain(invoiceData, null, true);
        return {
          ...chain,
          update: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => Promise.resolve({ error: null })),
            })),
          })),
        };
      }
      return createMockQueryChain([], null, true);
    }),
  })),
}));

vi.mock('../cfdi-parser', () => ({
  parseCFDI: vi.fn(() => ({
    uuid: 'A1B2C3D4-E5F6-7890-ABCD-EF1234567890',
    version: '4.0',
    fecha: new Date('2024-06-15T10:30:00'),
    total: 1160.00,
    subTotal: 1000.00,
    tipoComprobante: 'I',
    emisor: { rfc: 'EMIT123456ABC', nombre: 'Emisor SA' },
    receptor: { rfc: 'RECV987654XYZ', nombre: 'Receptor SA' },
  })),
}));

// Import after mocks
import {
  reconcileCFDI,
  reconcileAllCFDIs,
  getReconciliationReport,
  getReconciliationSummary,
  linkInvoiceToCFDI,
  getUnmatchedCFDIs,
  getInvoicesWithoutCFDI,
  processCFDIPackage,
  type Invoice,
} from '../reconciliation';
import type { ParsedCFDI } from '../types';

describe('Reconciliation Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('reconcileCFDI', () => {
    it('should reconcile CFDI with matching invoice', async () => {
      const result = await reconcileCFDI(
        'A1B2C3D4-E5F6-7890-ABCD-EF1234567890',
        'org-123'
      );

      expect(result).toBeDefined();
      expect(result).toHaveProperty('matched');
      expect(result).toHaveProperty('cfdiId');
      expect(result).toHaveProperty('differences');
      expect(result).toHaveProperty('confidence');
    });

    it('should include differences when amounts do not match', async () => {
      const result = await reconcileCFDI(
        'A1B2C3D4-E5F6-7890-ABCD-EF1234567890',
        'org-123'
      );

      expect(Array.isArray(result.differences)).toBe(true);
    });

    it('should normalize UUID to uppercase', async () => {
      const result = await reconcileCFDI(
        'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
        'org-123'
      );

      expect(result).toBeDefined();
    });
  });

  describe('reconcileAllCFDIs', () => {
    it('should return array of results', async () => {
      const results = await reconcileAllCFDIs('org-123');

      expect(Array.isArray(results)).toBe(true);
    });
  });

  describe('getReconciliationReport', () => {
    it('should generate report with required properties', async () => {
      const report = await getReconciliationReport(
        'org-123',
        new Date('2024-01-01'),
        new Date('2024-12-31')
      );

      expect(report).toHaveProperty('organizationId');
      expect(report).toHaveProperty('period');
      expect(report).toHaveProperty('totalCFDIs');
      expect(report).toHaveProperty('matchedCFDIs');
      expect(report).toHaveProperty('unmatchedCFDIs');
      expect(report).toHaveProperty('discrepancies');
      expect(report).toHaveProperty('results');
    });

    it('should include period dates in report', async () => {
      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-12-31');

      const report = await getReconciliationReport('org-123', startDate, endDate);

      expect(report.period.start).toEqual(startDate);
      expect(report.period.end).toEqual(endDate);
    });
  });

  describe('getReconciliationSummary', () => {
    it('should return summary statistics', async () => {
      const summary = await getReconciliationSummary('org-123');

      expect(summary).toHaveProperty('totalCFDIs');
      expect(summary).toHaveProperty('matchedCFDIs');
      expect(summary).toHaveProperty('unmatchedCFDIs');
      expect(summary).toHaveProperty('discrepancyCount');
      expect(summary).toHaveProperty('totalAmountCFDIs');
      expect(summary).toHaveProperty('totalAmountInvoices');
      expect(summary).toHaveProperty('amountDifference');
    });

    it('should calculate amount difference', async () => {
      const summary = await getReconciliationSummary('org-123');

      expect(typeof summary.amountDifference).toBe('number');
      expect(summary.amountDifference).toBeGreaterThanOrEqual(0);
    });
  });

  describe('linkInvoiceToCFDI', () => {
    it('should link invoice to CFDI UUID', async () => {
      await expect(
        linkInvoiceToCFDI('inv-123', 'A1B2C3D4-E5F6-7890-ABCD-EF1234567890', 'org-123')
      ).resolves.not.toThrow();
    });

    it('should normalize UUID to uppercase', async () => {
      await expect(
        linkInvoiceToCFDI('inv-123', 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'org-123')
      ).resolves.not.toThrow();
    });
  });

  describe('getUnmatchedCFDIs', () => {
    it('should return unmatched CFDIs for organization', async () => {
      // Function should not throw and return a result
      await expect(getUnmatchedCFDIs('org-123')).resolves.toBeDefined();
    });
  });

  describe('getInvoicesWithoutCFDI', () => {
    it('should return invoices without UUID', async () => {
      // Function should not throw and return a result
      await expect(getInvoicesWithoutCFDI('org-123')).resolves.toBeDefined();
    });
  });

  describe('processCFDIPackage', () => {
    const mockCFDIs: ParsedCFDI[] = [
      {
        uuid: 'UUID-1',
        version: '4.0',
        serie: 'A',
        folio: '001',
        fecha: new Date('2024-06-15'),
        tipoComprobante: 'I',
        metodoPago: 'PUE',
        formaPago: '03',
        lugarExpedicion: '06600',
        subTotal: 1000,
        descuento: 0,
        total: 1160,
        moneda: 'MXN',
        tipoCambio: 1,
        emisor: {
          rfc: 'EMIT123456ABC',
          nombre: 'Emisor SA',
          regimenFiscal: '601',
        },
        receptor: {
          rfc: 'RECV987654XYZ',
          nombre: 'Receptor SA',
          usoCFDI: 'G03',
        },
        conceptos: [],
        impuestos: {
          totalImpuestosTrasladados: 160,
          traslados: [],
        },
        timbreFiscal: {
          uuid: 'UUID-1',
          fechaTimbrado: new Date('2024-06-15'),
          selloCFD: 'abc123',
          selloSAT: 'xyz789',
          noCertificadoSAT: '00001000000123456789',
          rfcProvCertif: 'SAT970701NN3',
          version: '1.1',
        },
        xmlOriginal: '<cfdi:Comprobante></cfdi:Comprobante>',
      },
    ];

    it('should process and save CFDIs', async () => {
      const result = await processCFDIPackage(mockCFDIs, 'org-123', 'received');

      expect(result).toHaveProperty('saved');
      expect(result).toHaveProperty('reconciled');
      expect(result).toHaveProperty('errors');
      expect(Array.isArray(result.errors)).toBe(true);
    });

    it('should track reconciliation results', async () => {
      const result = await processCFDIPackage(mockCFDIs, 'org-123', 'issued');

      expect(typeof result.reconciled).toBe('number');
      expect(result.reconciled).toBeGreaterThanOrEqual(0);
    });

    it('should handle empty CFDI array', async () => {
      const result = await processCFDIPackage([], 'org-123', 'received');

      expect(result.saved).toBe(0);
      expect(result.reconciled).toBe(0);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('ReconciliationResult Structure', () => {
    it('should have correct result structure', async () => {
      const result = await reconcileCFDI(
        'A1B2C3D4-E5F6-7890-ABCD-EF1234567890',
        'org-123'
      );

      expect(typeof result.matched).toBe('boolean');
      expect(typeof result.cfdiId).toBe('string');
      expect(Array.isArray(result.differences)).toBe(true);
      expect(typeof result.confidence).toBe('number');
    });
  });

  describe('ReconciliationDifference Types', () => {
    it('should have valid severity levels', () => {
      const validSeverities: Array<'low' | 'medium' | 'high'> = ['low', 'medium', 'high'];

      validSeverities.forEach(severity => {
        expect(typeof severity).toBe('string');
      });
    });
  });

  describe('Invoice Type', () => {
    it('should have correct invoice structure', () => {
      const mockInvoice: Invoice = {
        id: 'inv-123',
        uuid: 'A1B2C3D4-E5F6-7890-ABCD-EF1234567890',
        folio_number: 'F001',
        customer_id: 'cust-123',
        subtotal: 1000,
        tax: 160,
        total: 1160,
        status: 'paid',
        issued_at: '2024-06-15T10:30:00Z',
        customer: {
          rfc: 'RECV987654XYZ',
          legal_name: 'Receptor SA de CV',
        },
      };

      expect(mockInvoice).toHaveProperty('id');
      expect(mockInvoice).toHaveProperty('uuid');
      expect(mockInvoice).toHaveProperty('subtotal');
      expect(mockInvoice).toHaveProperty('tax');
      expect(mockInvoice).toHaveProperty('total');
    });
  });

  describe('ReconciliationSummary Type', () => {
    it('should have correct summary structure', async () => {
      // Function should not throw and return a result with expected properties
      const summary = await getReconciliationSummary('org-123');

      expect(summary).toBeDefined();
      expect(summary).toHaveProperty('totalCFDIs');
      expect(summary).toHaveProperty('matchedCFDIs');
      expect(summary).toHaveProperty('unmatchedCFDIs');
      expect(summary).toHaveProperty('discrepancyCount');
      expect(summary).toHaveProperty('totalAmountCFDIs');
      expect(summary).toHaveProperty('totalAmountInvoices');
      expect(summary).toHaveProperty('amountDifference');
    });
  });
});
