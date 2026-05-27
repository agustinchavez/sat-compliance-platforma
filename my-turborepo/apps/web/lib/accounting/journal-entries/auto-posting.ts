/**
 * Auto-Posting Service (Component 22)
 *
 * Generates journal entries from invoices, payments, and expenses.
 * Each function is idempotent — will not create duplicate entries.
 *
 * FIX-3.1: Uses resolveExchangeRate for foreign currency transactions.
 * FIX-3.2: Uses posting rules engine for account code resolution.
 * FIX-4.4: COGS auto-posting for inventory-tracking orgs.
 * FIX-4.7: Expense category mapping uses explicit enum map.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { JournalEntry, CreateJournalEntryInput, CreateJournalEntryLineInput } from '../types';
import { createAndPostEntry, findBySource } from './service';
import { resolveExchangeRate } from '../exchange-rates/service';
import { resolveAndBuildLines } from '../posting-rules/engine';

// Default account codes — used as fallback when no posting rule is found
const DEFAULT_ACCOUNTS = {
  clientes: '1104',
  bancos: '1102',
  ivaAcreditable: '1106',
  ivaTrasladado: '2104',
  proveedores: '2101',
  ventas: '4101',
  costoVentas: '5101',
  inventarios: '1105',
  gastosAdmin: '6101',
  gastosVenta: '6102',
};

// FIX-4.7: Explicit expense category → account code mapping
const EXPENSE_CATEGORY_MAP: Record<string, string> = {
  // Sales-related expenses → Gastos de Venta
  publicidad_marketing: DEFAULT_ACCOUNTS.gastosVenta,
  comisiones: DEFAULT_ACCOUNTS.gastosVenta,
  envios_fletes: DEFAULT_ACCOUNTS.gastosVenta,
  promociones: DEFAULT_ACCOUNTS.gastosVenta,
  representacion: DEFAULT_ACCOUNTS.gastosVenta,
  // Admin expenses → Gastos de Administración (default)
  nomina_sueldos: DEFAULT_ACCOUNTS.gastosAdmin,
  renta_oficina: DEFAULT_ACCOUNTS.gastosAdmin,
  servicios_profesionales: DEFAULT_ACCOUNTS.gastosAdmin,
  papeleria: DEFAULT_ACCOUNTS.gastosAdmin,
  software_licencias: DEFAULT_ACCOUNTS.gastosAdmin,
  seguros: DEFAULT_ACCOUNTS.gastosAdmin,
  mantenimiento: DEFAULT_ACCOUNTS.gastosAdmin,
  depreciacion: DEFAULT_ACCOUNTS.gastosAdmin,
  viajes: DEFAULT_ACCOUNTS.gastosAdmin,
  impuestos_derechos: DEFAULT_ACCOUNTS.gastosAdmin,
};

/**
 * Creates a journal entry from a stamped invoice.
 *
 * FIX-3.1: Resolves exchange rate via 3-tier hierarchy (CFDI → manual → Banxico).
 * FIX-3.2: Uses posting rules engine for account codes (falls back to DEFAULT_ACCOUNTS).
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

  const entryDate = invoiceData.issuedAt.split('T')[0] ?? invoiceData.issuedAt;
  const folio = [invoiceData.serie, invoiceData.folioNumber].filter(Boolean).join('-');
  const currency = invoiceData.currency ?? 'MXN';

  // FIX-3.1: Resolve exchange rate through hierarchy
  const resolvedRate = await resolveExchangeRateSafe(
    currency, entryDate, invoiceData.organizationId, invoiceData.exchangeRate, supabase
  );

  // FIX-3.2: Try posting rules engine for account codes
  const conditions: Record<string, string> = {
    hasTax: invoiceData.tax > 0 ? 'true' : 'false',
  };

  const ruleResult = await resolveAndBuildLinesSafe(
    invoiceData.organizationId, 'invoice',
    { total: invoiceData.total, subtotal: invoiceData.subtotal, tax: invoiceData.tax },
    conditions,
    { uuidCfdi: invoiceData.uuid },
    supabase
  );

  // Use engine lines if available, otherwise fall back to DEFAULT_ACCOUNTS
  const lines: CreateJournalEntryLineInput[] = ruleResult.lines.length > 0
    ? ruleResult.lines
    : [
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
      ];

  const input: CreateJournalEntryInput = {
    entryDate,
    polizaType: 'ingreso',
    description: `Factura ${folio} - ${invoiceData.receiverName || 'Cliente'}`,
    sourceType: 'invoice',
    sourceId: invoiceData.id,
    sourceUuidCfdi: invoiceData.uuid,
    currencyCode: currency,
    exchangeRate: resolvedRate,
    lines,
  };

  return createAndPostEntry(invoiceData.organizationId, input, userId, supabase);
}

/**
 * Creates a journal entry from a recorded payment.
 *
 * FIX-3.1: Resolves exchange rate via 3-tier hierarchy.
 * FIX-3.2: Uses posting rules engine for account codes.
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

  const currency = paymentData.currency ?? 'MXN';

  // FIX-3.1: Resolve exchange rate
  const resolvedRate = await resolveExchangeRateSafe(
    currency, paymentData.paymentDate, paymentData.organizationId, paymentData.exchangeRate, supabase
  );

  // FIX-3.2: Try posting rules engine
  const ruleResult = await resolveAndBuildLinesSafe(
    paymentData.organizationId, 'payment',
    { amount: paymentData.amount },
    {},
    {
      uuidCfdi: paymentData.invoiceUuid,
      paymentMethod: paymentData.paymentForm === '03' ? 'transferencia' : 'otro',
      paymentReference: paymentData.referenceNumber,
    },
    supabase
  );

  const lines: CreateJournalEntryLineInput[] = ruleResult.lines.length > 0
    ? ruleResult.lines
    : [
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
      ];

  const input: CreateJournalEntryInput = {
    entryDate: paymentData.paymentDate,
    polizaType: 'ingreso',
    description: `Cobro de factura${paymentData.referenceNumber ? ` - Ref: ${paymentData.referenceNumber}` : ''}`,
    sourceType: 'payment',
    sourceId: paymentData.id,
    sourceUuidCfdi: paymentData.invoiceUuid,
    currencyCode: currency,
    exchangeRate: resolvedRate,
    lines,
  };

  return createAndPostEntry(paymentData.organizationId, input, userId, supabase);
}

/**
 * Creates a journal entry from an approved expense with CFDI.
 *
 * FIX-3.1: Resolves exchange rate via 3-tier hierarchy.
 * FIX-3.2: Uses posting rules engine for account codes.
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

  const currency = expenseData.currency ?? 'MXN';

  // FIX-3.1: Resolve exchange rate
  const resolvedRate = await resolveExchangeRateSafe(
    currency, expenseData.expenseDate, expenseData.organizationId, expenseData.exchangeRate, supabase
  );

  // FIX-3.2: Try posting rules engine (with category condition for sales vs admin)
  const isSalesCategory = isSalesExpenseCategory(expenseData.category);
  const conditions: Record<string, string> = {
    hasTax: expenseData.taxAmount > 0 ? 'true' : 'false',
    ...(isSalesCategory ? { category: 'sales' } : {}),
  };

  const ruleResult = await resolveAndBuildLinesSafe(
    expenseData.organizationId, 'expense',
    { subtotal: expenseData.amount, tax: expenseData.taxAmount, total: expenseData.total },
    conditions,
    { uuidCfdi: expenseData.cfdiUuid },
    supabase
  );

  // Use engine lines if available, otherwise fall back to DEFAULT_ACCOUNTS
  const lines: CreateJournalEntryLineInput[] = ruleResult.lines.length > 0
    ? ruleResult.lines
    : [
        {
          accountCode: mapCategoryToAccount(expenseData.category),
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
      ];

  const input: CreateJournalEntryInput = {
    entryDate: expenseData.expenseDate,
    polizaType: 'egreso',
    description: `Gasto: ${expenseData.description} - ${expenseData.vendorName}`,
    sourceType: 'expense',
    sourceId: expenseData.id,
    sourceUuidCfdi: expenseData.cfdiUuid,
    currencyCode: currency,
    exchangeRate: resolvedRate,
    lines,
  };

  return createAndPostEntry(expenseData.organizationId, input, userId, supabase);
}

/**
 * FIX-4.7: Maps an expense category to the appropriate account code.
 * Uses explicit category map instead of fragile substring matching.
 */
function mapCategoryToAccount(category?: string): string {
  if (!category) return DEFAULT_ACCOUNTS.gastosAdmin;

  const normalized = category.toLowerCase().trim();
  return EXPENSE_CATEGORY_MAP[normalized] ?? DEFAULT_ACCOUNTS.gastosAdmin;
}

/**
 * Checks if an expense category maps to sales (Gastos de Venta).
 */
function isSalesExpenseCategory(category?: string): boolean {
  if (!category) return false;
  const normalized = category.toLowerCase().trim();
  return EXPENSE_CATEGORY_MAP[normalized] === DEFAULT_ACCOUNTS.gastosVenta;
}

/**
 * FIX-4.4: Creates a COGS journal entry alongside a revenue invoice.
 * Only fires when the organization has inventory tracking enabled.
 * Uses weighted average cost (WAC) from the inventory system.
 *
 * Debit: Costo de Ventas (COGS amount)
 * Credit: Inventarios (COGS amount)
 */
export async function autoPostCogsFromInvoice(
  cogsData: {
    id: string;
    organizationId: string;
    invoiceId: string;
    invoiceUuid?: string;
    items: Array<{
      productId: string;
      productName: string;
      quantity: number;
      unitCost: number;
    }>;
    invoiceDate: string;
  },
  userId: string,
  supabase: SupabaseClient
): Promise<JournalEntry | null> {
  // Check if org has inventory tracking enabled
  const { data: orgSettings } = await supabase
    .from('organizations')
    .select('inventory_tracking_enabled')
    .eq('id', cogsData.organizationId)
    .single();

  if (!orgSettings?.inventory_tracking_enabled) {
    return null;
  }

  // Idempotency: use a composite source key to avoid duplicate COGS entries
  const cogsSourceId = `cogs-${cogsData.invoiceId}`;
  const existing = await findBySource(cogsData.organizationId, 'invoice', cogsSourceId, supabase);
  if (existing) return existing;

  // Calculate total COGS from line items using WAC (weighted average cost)
  const totalCogs = cogsData.items.reduce(
    (sum, item) => sum + item.quantity * item.unitCost,
    0
  );

  if (totalCogs <= 0) return null;

  const itemSummary = cogsData.items
    .map(i => `${i.productName} x${i.quantity}`)
    .join(', ');

  const input: CreateJournalEntryInput = {
    entryDate: cogsData.invoiceDate.split('T')[0] ?? cogsData.invoiceDate,
    polizaType: 'diario',
    description: `Costo de ventas: ${itemSummary}`,
    sourceType: 'invoice',
    sourceId: cogsSourceId,
    sourceUuidCfdi: cogsData.invoiceUuid,
    currencyCode: 'MXN',
    exchangeRate: 1.0,
    lines: [
      {
        accountCode: DEFAULT_ACCOUNTS.costoVentas,
        debit: totalCogs,
        credit: 0,
        description: `Costo de ventas - ${itemSummary}`,
      },
      {
        accountCode: DEFAULT_ACCOUNTS.inventarios,
        debit: 0,
        credit: totalCogs,
        description: `Salida de inventario - ${itemSummary}`,
      },
    ],
  };

  return createAndPostEntry(cogsData.organizationId, input, userId, supabase);
}

// ============================================
// Internal Helpers
// ============================================

/**
 * FIX-3.1: Resolves exchange rate with graceful fallback.
 * If resolution fails (no rates in DB), falls back to the caller's rate or 1.0.
 */
async function resolveExchangeRateSafe(
  currency: string,
  date: string,
  organizationId: string,
  callerRate: number | undefined,
  supabase: SupabaseClient
): Promise<number> {
  if (currency === 'MXN') return 1.0;

  try {
    const resolved = await resolveExchangeRate({
      currencyFrom: currency,
      currencyTo: 'MXN',
      date,
      organizationId,
      cfdiRate: callerRate,
    }, supabase);
    return resolved.rate;
  } catch {
    // Graceful fallback: use caller-provided rate or 1.0
    return callerRate ?? 1.0;
  }
}

/**
 * FIX-3.2: Resolves posting rules with graceful fallback.
 * If the engine returns no lines, the caller builds lines from DEFAULT_ACCOUNTS.
 */
async function resolveAndBuildLinesSafe(
  organizationId: string,
  triggerEvent: 'invoice' | 'payment' | 'expense',
  amounts: Record<string, number>,
  conditions: Record<string, string>,
  lineMetadata: Partial<CreateJournalEntryLineInput>,
  supabase: SupabaseClient
): Promise<{ lines: CreateJournalEntryLineInput[]; ruleSource: string }> {
  try {
    const result = await resolveAndBuildLines({
      organizationId,
      triggerEvent,
      amounts,
      conditions,
      lineMetadata,
    }, supabase);
    return { lines: result.lines, ruleSource: result.ruleSource };
  } catch {
    // Graceful fallback: return empty lines so caller uses DEFAULT_ACCOUNTS
    return { lines: [], ruleSource: 'fallback' };
  }
}
