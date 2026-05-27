/**
 * Auto-Posting Service (Component 22)
 *
 * Generates journal entries from invoices, payments, and expenses.
 * Each function is idempotent — will not create duplicate entries.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { JournalEntry, CreateJournalEntryInput, SourceType } from '../types';
import { AccountingError } from '../errors';
import { createAndPostEntry, findBySource } from './service';

// Default account codes for auto-posting (Mexico PyME template)
const DEFAULT_ACCOUNTS = {
  clientes: '1104',
  bancos: '1102',
  ivaAcreditable: '1106',
  ivaTrasladado: '2104',
  proveedores: '2101',
  ventas: '4101',
  costoVentas: '5101',
  gastosAdmin: '6101',
  gastosVenta: '6102',
};

/**
 * Creates a journal entry from a stamped invoice.
 * Debit: Clientes (total)
 * Credit: Ventas (subtotal) + IVA Trasladado (tax)
 */
export async function autoPostFromInvoice(
  invoiceData: {
    id: string;
    organizationId: string;
    uuid?: string;
    serie?: string;
    folioNumber?: string;
    receiverName?: string;
    subtotal: number;
    tax: number;
    total: number;
    currency?: string;
    exchangeRate?: number;
    issuedAt: string;
  },
  userId: string,
  supabase: SupabaseClient
): Promise<JournalEntry> {
  // Idempotency check
  const existing = await findBySource(invoiceData.organizationId, 'invoice', invoiceData.id, supabase);
  if (existing) return existing;

  const entryDate = invoiceData.issuedAt.split('T')[0];
  const folio = [invoiceData.serie, invoiceData.folioNumber].filter(Boolean).join('-');

  const input: CreateJournalEntryInput = {
    entryDate,
    polizaType: 'ingreso',
    description: `Factura ${folio} - ${invoiceData.receiverName || 'Cliente'}`,
    sourceType: 'invoice',
    sourceId: invoiceData.id,
    sourceUuidCfdi: invoiceData.uuid,
    currencyCode: invoiceData.currency ?? 'MXN',
    exchangeRate: invoiceData.exchangeRate ?? 1.0,
    lines: [
      {
        accountCode: DEFAULT_ACCOUNTS.clientes,
        debit: invoiceData.total,
        credit: 0,
        description: `Cargo a clientes - ${folio}`,
        uuidCfdi: invoiceData.uuid,
      },
      {
        accountCode: DEFAULT_ACCOUNTS.ventas,
        debit: 0,
        credit: invoiceData.subtotal,
        description: `Ingreso por ventas - ${folio}`,
      },
      ...(invoiceData.tax > 0
        ? [
            {
              accountCode: DEFAULT_ACCOUNTS.ivaTrasladado,
              debit: 0,
              credit: invoiceData.tax,
              description: `IVA trasladado - ${folio}`,
            },
          ]
        : []),
    ],
  };

  return createAndPostEntry(invoiceData.organizationId, input, userId, supabase);
}

/**
 * Creates a journal entry from a recorded payment.
 * Debit: Bancos (amount)
 * Credit: Clientes (amount)
 */
export async function autoPostFromPayment(
  paymentData: {
    id: string;
    organizationId: string;
    invoiceId: string;
    invoiceUuid?: string;
    amount: number;
    paymentDate: string;
    paymentForm?: string;
    referenceNumber?: string;
    currency?: string;
    exchangeRate?: number;
  },
  userId: string,
  supabase: SupabaseClient
): Promise<JournalEntry> {
  // Idempotency check
  const existing = await findBySource(paymentData.organizationId, 'payment', paymentData.id, supabase);
  if (existing) return existing;

  const input: CreateJournalEntryInput = {
    entryDate: paymentData.paymentDate,
    polizaType: 'ingreso',
    description: `Cobro de factura${paymentData.referenceNumber ? ` - Ref: ${paymentData.referenceNumber}` : ''}`,
    sourceType: 'payment',
    sourceId: paymentData.id,
    sourceUuidCfdi: paymentData.invoiceUuid,
    currencyCode: paymentData.currency ?? 'MXN',
    exchangeRate: paymentData.exchangeRate ?? 1.0,
    lines: [
      {
        accountCode: DEFAULT_ACCOUNTS.bancos,
        debit: paymentData.amount,
        credit: 0,
        description: 'Depósito bancario',
        uuidCfdi: paymentData.invoiceUuid,
        paymentMethod: paymentData.paymentForm === '03' ? 'transferencia' : 'otro',
        paymentReference: paymentData.referenceNumber,
      },
      {
        accountCode: DEFAULT_ACCOUNTS.clientes,
        debit: 0,
        credit: paymentData.amount,
        description: 'Abono a clientes',
      },
    ],
  };

  return createAndPostEntry(paymentData.organizationId, input, userId, supabase);
}

/**
 * Creates a journal entry from an approved expense with CFDI.
 * Debit: Gastos (subtotal) + IVA Acreditable (tax)
 * Credit: Proveedores (total)
 */
export async function autoPostFromExpense(
  expenseData: {
    id: string;
    organizationId: string;
    cfdiUuid?: string;
    vendorName: string;
    description: string;
    category?: string;
    amount: number;
    taxAmount: number;
    total: number;
    expenseDate: string;
    currency?: string;
    exchangeRate?: number;
  },
  userId: string,
  supabase: SupabaseClient
): Promise<JournalEntry> {
  // Idempotency check
  const existing = await findBySource(expenseData.organizationId, 'expense', expenseData.id, supabase);
  if (existing) return existing;

  // Map expense category to account code
  const expenseAccount = mapCategoryToAccount(expenseData.category);

  const input: CreateJournalEntryInput = {
    entryDate: expenseData.expenseDate,
    polizaType: 'egreso',
    description: `Gasto: ${expenseData.description} - ${expenseData.vendorName}`,
    sourceType: 'expense',
    sourceId: expenseData.id,
    sourceUuidCfdi: expenseData.cfdiUuid,
    currencyCode: expenseData.currency ?? 'MXN',
    exchangeRate: expenseData.exchangeRate ?? 1.0,
    lines: [
      {
        accountCode: expenseAccount,
        debit: expenseData.amount,
        credit: 0,
        description: expenseData.description,
        uuidCfdi: expenseData.cfdiUuid,
      },
      ...(expenseData.taxAmount > 0
        ? [
            {
              accountCode: DEFAULT_ACCOUNTS.ivaAcreditable,
              debit: expenseData.taxAmount,
              credit: 0,
              description: `IVA acreditable - ${expenseData.vendorName}`,
            },
          ]
        : []),
      {
        accountCode: DEFAULT_ACCOUNTS.proveedores,
        debit: 0,
        credit: expenseData.total,
        description: `Pago a ${expenseData.vendorName}`,
      },
    ],
  };

  return createAndPostEntry(expenseData.organizationId, input, userId, supabase);
}

/**
 * Maps an expense category to the appropriate account code.
 */
function mapCategoryToAccount(category?: string): string {
  if (!category) return DEFAULT_ACCOUNTS.gastosAdmin;

  const salesCategories = ['publicidad_marketing', 'comisiones'];
  if (salesCategories.some(c => category.includes(c))) {
    return DEFAULT_ACCOUNTS.gastosVenta;
  }

  return DEFAULT_ACCOUNTS.gastosAdmin;
}
