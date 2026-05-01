# Component 18: Payment Service — Implementation Prompt

---

## Context for the Coding Agent

You are building Component 18 of a Mexican SAT tax compliance SaaS platform. Components already completed that you must integrate with:

- **Component 12**: Invoice data model. `invoices` table with `status`, `metodo_pago` (`PUE`/`PPD`), `total`, `moneda`, `tipo_cambio`, `tax_breakdown` JSONB, `issuer_rfc`, `receiver_rfc`. Normalized `invoice_items` and `invoice_stamps` tables.
- **Component 13**: `@repo/cfdi` package at `packages/cfdi/src/`. Exports `generateCFDI()`, `generateCadenaOriginal()`. The `buildPagos20Complement()` stub exists here — this component fully implements it.
- **Component 14**: `signInvoice(invoice, orgId, password)` → `SignedInvoiceResult`
- **Component 15**: `stampInvoice(invoice, orgId)` → stamped XML + TFD. `cancelStampedInvoice()` also available.
- **Component 17**: Workflow engine. After a payment is recorded and the invoice becomes fully paid, fire `engine.executeWorkflow({ type: 'invoice.paid', ... })` to cancel reminder jobs and trigger downstream actions.

---

## What This Component Does

The Payment Service records payments against PPD invoices, tracks running balances (paid / outstanding), generates SAT-compliant Complemento de Pagos 2.0 CFDI documents, and sends them through the PAC for stamping.

**PUE vs PPD distinction** — this is critical:
- `metodo_pago = 'PUE'` (Pago en una sola exhibición): Payment was made at invoice issuance. No Complemento de Pagos is ever generated. Recording a PUE payment just marks the invoice `paid` and updates status. No CFDI type P.
- `metodo_pago = 'PPD'` (Pago en parcialidades o diferido): Payment comes after invoice issuance. Each payment that settles part or all of the invoice requires a Complemento de Pagos CFDI (type `P`), which must be signed and stamped through the PAC.

---

## Scope Boundaries

**Does:**
- CRUD for payments (`payments` table)
- Calculate `paid_amount`, `outstanding_amount`, `payment_status` per invoice
- Support partial payments (multiple payments per invoice)
- Generate Complemento de Pagos 2.0 XML for PPD invoices
- Sign and stamp payment CFDIs through Component 15's PAC service
- Fire Component 17's workflow event `invoice.paid` when invoice is fully paid
- Handle MXN-native payments; include USD/EUR exchange rate fields (stored but not SAT-verified)
- Validate that payment amounts never exceed the invoice outstanding balance
- Soft-delete (void) payments with `voided_at` timestamp

**Does NOT:**
- Process online credit card charges — that is Component 19 (Stripe)
- Implement CFDI type E (Egreso/credit note) — separate concern
- Auto-generate journal entries — that is Component 22
- Send payment receipt emails — enqueue an email job to `invoice-emails` queue (same BullMQ queue from Component 17) with type `payment_received`; Component 29 delivers it
- Generate CFDI for PUE invoices — PUE payments never produce a Complemento de Pagos

---

## What's Already Built — Import, Don't Reimplement

```typescript
// Component 13 — CFDI package (packages/cfdi/)
import { generateCFDI, generateCadenaOriginal } from '@repo/cfdi';
// buildPagos20Complement() stub lives here — you will implement its body

// Component 14 — Digital signature
import { signInvoice } from '@/lib/invoices/sign-invoice';

// Component 15 — PAC stamping
import { stampInvoice } from '@/lib/invoices/stamp-invoice';

// Component 17 — Workflow engine (fire invoice.paid event)
import { WorkflowEngine } from '@/lib/workflows/engine';

// Component 17 — Email queue (BullMQ)
import { emailQueue } from '@/lib/queue/queues';
import type { EmailJobPayload } from '@/lib/queue/job-types';
```

---

## File Structure

Use `apps/web/lib/` convention throughout. Do NOT use `src/server/`:

```
apps/web/lib/payments/
├── types.ts                  # Payment, PaymentStatus, PaymentMethod, ComplementoData interfaces
├── errors.ts                 # PaymentError, PaymentErrorCode
├── calculations.ts           # calculatePaidAmount, calculateOutstanding, determinePaymentStatus
├── complement.ts             # buildComplementoPago20(), buildPago(), buildDoctoRelacionado(), buildTotales()
├── repository.ts             # DB operations: create, findById, findByInvoice, update, softDelete
├── service.ts                # recordPayment, updatePayment, getPayment, listPayments, voidPayment, generatePaymentCFDI
└── index.ts                  # Public exports

apps/web/lib/invoices/
└── record-payment.ts         # Public bridge: recordAndProcessPayment(invoiceId, orgId, data)

supabase/migrations/
└── 20260311000000_add_payments_tables.sql
```

---

## Step 1 — Types

Create `apps/web/lib/payments/types.ts`:

```typescript
import { z } from 'zod';

// SAT c_FormaPago catalog — all 26 valid payment method codes
export const PAYMENT_METHODS = {
  '01': 'Efectivo',
  '02': 'Cheque nominativo',
  '03': 'Transferencia electrónica de fondos',
  '04': 'Tarjeta de crédito',
  '05': 'Monedero electrónico',
  '06': 'Dinero electrónico',
  '08': 'Vales de despensa',
  '12': 'Dación en pago',
  '13': 'Pago por subrogación',
  '14': 'Pago por consignación',
  '15': 'Condonación',
  '17': 'Compensación',
  '23': 'Novación',
  '24': 'Confusión',
  '25': 'Remisión de deuda',
  '26': 'Prescripción o caducidad',
  '27': 'A satisfacción del acreedor',
  '28': 'Tarjeta de débito',
  '29': 'Tarjeta de servicios',
  '30': 'Aplicación de anticipos',
  '31': 'Intermediario pagos',
  '99': 'Por definir',
} as const;

export type PaymentMethodCode = keyof typeof PAYMENT_METHODS;

export enum PaymentStatus {
  PENDING = 'pending',       // Payment recorded but not yet applied
  APPLIED = 'applied',       // Payment applied to invoice, CFDI generated (PPD)
  VOIDED = 'voided',         // Payment voided/reversed
}

export interface Payment {
  id: string;
  organizationId: string;
  invoiceId: string;
  amount: number;              // In invoice currency (moneda)
  currency: string;            // ISO 4217 (e.g., 'MXN', 'USD')
  exchangeRate: number;        // TipoCambioP: rate to MXN (1.0 if MXN)
  paymentDate: string;         // ISO date: YYYY-MM-DD (FechaPago)
  paymentMethod: PaymentMethodCode;  // FormaDePagoP
  referenceNumber?: string;    // NumOperacion (bank transfer reference, check number, etc.)
  bankAccountOrigin?: string;  // CtaOrdenante (last 4 digits or full)
  bankAccountDest?: string;    // CtaBeneficiario
  bankRfcOrigin?: string;      // RfcEmisorCtaOrd
  bankRfcDest?: string;        // RfcEmisorCtaBen
  bankNameExternal?: string;   // NomBancoOrdExt (for foreign banks)
  notes?: string;
  status: PaymentStatus;
  cfdiUuid?: string;           // UUID of stamped Complemento de Pagos (PPD only)
  cfdiXml?: string;            // Full stamped XML of Complemento de Pagos (PPD only)
  pdfUrl?: string;             // R2 URL of payment receipt PDF (future)
  voidedAt?: string;           // ISO timestamp
  voidReason?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreatePaymentInput {
  invoiceId: string;
  amount: number;
  currency: string;
  exchangeRate?: number;       // Defaults to 1 for MXN
  paymentDate: string;         // YYYY-MM-DD
  paymentMethod: PaymentMethodCode;
  referenceNumber?: string;
  bankAccountOrigin?: string;
  bankAccountDest?: string;
  bankRfcOrigin?: string;
  bankRfcDest?: string;
  bankNameExternal?: string;
  notes?: string;
}

export interface UpdatePaymentInput {
  amount?: number;
  paymentDate?: string;
  paymentMethod?: PaymentMethodCode;
  referenceNumber?: string;
  notes?: string;
}

export interface PaymentSummary {
  invoiceId: string;
  invoiceTotal: number;
  invoiceCurrency: string;
  paidAmount: number;           // Sum of non-voided payments in invoice currency
  outstandingAmount: number;    // invoiceTotal - paidAmount
  paymentCount: number;
  isFullyPaid: boolean;
  lastPaymentDate?: string;
}

// Used internally to build the Complemento de Pagos XML
export interface ComplementoData {
  // CFDI Comprobante-level (type P)
  serie?: string;
  folio?: string;
  fecha: string;               // ISO datetime YYYY-MM-DDTHH:mm:ss
  lugarExpedicion: string;     // org postal code
  // Pago node
  fechaPago: string;           // ISO datetime of payment
  formaDePagoP: PaymentMethodCode;
  monedaP: string;             // payment currency
  tipoCambioP: string;         // exchange rate as string (e.g., "17.5000")
  monto: string;               // payment amount as string, 2 decimal places
  numOperacion?: string;
  rfcEmisorCtaOrd?: string;
  ctaOrdenante?: string;
  nomBancoOrdExt?: string;
  rfcEmisorCtaBen?: string;
  ctaBeneficiario?: string;
  // DoctoRelacionado node(s)
  documentosRelacionados: DoctoRelacionado[];
  // Totales node (computed)
  totales: PagosTotales;
}

export interface DoctoRelacionado {
  idDocumento: string;         // UUID of the original invoice (from invoice_stamps)
  serie?: string;
  folio?: string;
  monedaDR: string;            // Currency of original invoice
  equivalenciaDR: string;      // Exchange rate between monedaP and monedaDR
  objetoImpDR: '01' | '02' | '03'; // 02 = subject to tax (most common)
  numParcialidad: string;      // Payment number (1, 2, 3...)
  impSaldoAnt: string;         // Outstanding before this payment
  impPagado: string;           // Amount paid in this payment (in monedaDR)
  impSaldoInsoluto: string;    // Remaining after this payment
  impuestosDR?: ImpuestosDR;
}

export interface ImpuestosDR {
  trasladosDR?: TrasladoDR[];
  retencionesDR?: RetencionDR[];
}

export interface TrasladoDR {
  baseDR: string;
  impuestoDR: '001' | '002' | '003'; // ISR, IVA, IEPS
  tipoFactorDR: 'Tasa' | 'Cuota' | 'Exento';
  tasaOCuotaDR: string;        // e.g., "0.160000"
  importeDR: string;
}

export interface RetencionDR {
  baseDR: string;
  impuestoDR: '001' | '002' | '003';
  tipoFactorDR: 'Tasa' | 'Cuota';
  tasaOCuotaDR: string;
  importeDR: string;
}

export interface PagosTotales {
  montoTotalPagos: string;
  totalTrasladosBaseIVA16?: string;
  totalTrasladosImpuestoIVA16?: string;
  totalTrasladosBaseIVA8?: string;
  totalTrasladosImpuestoIVA8?: string;
  totalTrasladosBaseIVAExento?: string;
  totalRetencionesIVA?: string;
  totalRetencionesISR?: string;
  totalRetencionesIEPS?: string;
}

// Zod validation schema for CreatePaymentInput
export const createPaymentSchema = z.object({
  invoiceId: z.string().uuid(),
  amount: z.number().positive(),
  currency: z.string().length(3),
  exchangeRate: z.number().positive().optional().default(1),
  paymentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  paymentMethod: z.enum(Object.keys(PAYMENT_METHODS) as [PaymentMethodCode, ...PaymentMethodCode[]]),
  referenceNumber: z.string().max(100).optional(),
  bankAccountOrigin: z.string().max(50).optional(),
  bankAccountDest: z.string().max(50).optional(),
  bankRfcOrigin: z.string().max(13).optional(),
  bankRfcDest: z.string().max(13).optional(),
  bankNameExternal: z.string().max(300).optional(),
  notes: z.string().max(1000).optional(),
});
```

---

## Step 2 — Errors

Create `apps/web/lib/payments/errors.ts`:

```typescript
export type PaymentErrorCode =
  | 'PAYMENT_NOT_FOUND'
  | 'INVOICE_NOT_FOUND'
  | 'INVOICE_NOT_PPD'           // Tried to generate CFDI for PUE invoice
  | 'INVOICE_NOT_STAMPED'       // Invoice has no UUID yet
  | 'OVERPAYMENT'               // amount > outstanding balance
  | 'ALREADY_VOIDED'            // Payment is already voided
  | 'CANNOT_VOID_STAMPED'       // PPD payment with CFDI must be cancelled via PAC first
  | 'COMPLEMENT_GENERATION_FAILED'
  | 'COMPLEMENT_STAMP_FAILED'
  | 'INVALID_CURRENCY'
  | 'INVALID_AMOUNT'
  | 'PAYMENT_LOCKED';           // Invoice is cancelled, no payments allowed

export class PaymentError extends Error {
  constructor(
    public code: PaymentErrorCode,
    message: string,
    public paymentId?: string,
    public invoiceId?: string,
    public cause?: Error
  ) {
    super(message);
    this.name = 'PaymentError';
  }
}

export function isPaymentError(err: unknown): err is PaymentError {
  return err instanceof PaymentError;
}
```

---

## Step 3 — Calculations

Create `apps/web/lib/payments/calculations.ts`:

```typescript
import type { Payment } from './types';

export type InvoicePaymentStatus =
  | 'unpaid'          // No payments at all
  | 'partially_paid'  // Some payments, outstanding > 0
  | 'paid';           // Outstanding = 0 (within tolerance)

const TOLERANCE = 0.01; // 1 cent tolerance for floating point

/**
 * Sums non-voided payment amounts for an invoice.
 * All amounts assumed to be in invoice currency (monedaDR).
 */
export function calculatePaidAmount(payments: Payment[]): number {
  return payments
    .filter(p => p.status !== 'voided')
    .reduce((sum, p) => sum + p.amount, 0);
}

/**
 * Calculates how much remains unpaid.
 * Returns 0 if overpaid (should never happen but defensive).
 */
export function calculateOutstanding(invoiceTotal: number, paidAmount: number): number {
  return Math.max(0, invoiceTotal - paidAmount);
}

/**
 * Determines the invoice payment status label.
 */
export function determinePaymentStatus(
  invoiceTotal: number,
  payments: Payment[]
): InvoicePaymentStatus {
  const paid = calculatePaidAmount(payments);
  if (paid <= TOLERANCE) return 'unpaid';
  const outstanding = calculateOutstanding(invoiceTotal, paid);
  if (outstanding <= TOLERANCE) return 'paid';
  return 'partially_paid';
}

/**
 * Validates that recording a payment of `amount` would not exceed
 * the outstanding balance (overpayment guard).
 * Returns true if the payment is within bounds.
 */
export function isValidPaymentAmount(
  amount: number,
  invoiceTotal: number,
  existingPayments: Payment[]
): boolean {
  const outstanding = calculateOutstanding(
    invoiceTotal,
    calculatePaidAmount(existingPayments)
  );
  return amount <= outstanding + TOLERANCE;
}

/**
 * Returns the ordinal payment number for a new payment against this invoice.
 * NumParcialidad in SAT spec is 1-indexed.
 */
export function getNextParcialidad(payments: Payment[]): number {
  const activePayments = payments.filter(p => p.status !== 'voided');
  return activePayments.length + 1;
}

/**
 * Formats a number as a SAT-compliant decimal string with 6 decimal places.
 * Used for rates, exchange rates in DoctoRelacionado.
 */
export function formatSATDecimal(value: number, decimals: number = 6): string {
  return value.toFixed(decimals);
}

/**
 * Formats a currency amount with 2 decimal places (for monto, impSaldoAnt, etc.)
 */
export function formatCurrencyAmount(value: number): string {
  return value.toFixed(2);
}

/**
 * Computes EquivalenciaDR.
 * When MonedaP === MonedaDR: EquivalenciaDR = "1"
 * When MonedaP !== MonedaDR: EquivalenciaDR = TipoCambioP / TipoCambioDR (simplified: use payment exchange rate)
 *
 * For SME invoices (MXN-native), this is almost always "1".
 */
export function calculateEquivalenciaDR(
  monedaP: string,
  monedaDR: string,
  tipoCambioP: number
): string {
  if (monedaP === monedaDR) return '1';
  // When paying MXN for a USD invoice: equivalencia = 1 / tipoCambioP
  // When paying USD for an MXN invoice: equivalencia = tipoCambioP
  // Simplified: return exchange rate — callers should handle complex cross-currency
  return formatSATDecimal(tipoCambioP);
}
```

---

## Step 4 — Complemento de Pagos 2.0 XML Builder

Create `apps/web/lib/payments/complement.ts`.

This is the most technically complex file. It builds a valid CFDI 4.0 type `P` XML with the Complemento Pagos 2.0 embedded. Study the XML structure carefully.

### XML Structure Reference

The complete CFDI type P with Complemento Pagos 2.0 has this structure:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<cfdi:Comprobante
  xmlns:cfdi="http://www.sat.gob.mx/cfd/4"
  xmlns:pago20="http://www.sat.gob.mx/Pagos20"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xsi:schemaLocation="http://www.sat.gob.mx/cfd/4 http://www.sat.gob.mx/sitio_internet/cfd/4/cfdv40.xsd
    http://www.sat.gob.mx/Pagos20 http://www.sat.gob.mx/sitio_internet/cfd/Pagos/Pagos20.xsd"
  Version="4.0"
  Serie="{serie}"
  Folio="{folio}"
  Fecha="{YYYY-MM-DDTHH:mm:ss}"
  Sello=""
  NoCertificado=""
  Certificado=""
  SubTotal="0"
  Moneda="XXX"
  Total="0"
  TipoDeComprobante="P"
  Exportacion="01"
  LugarExpedicion="{org.postal_code}">

  <cfdi:Emisor
    Rfc="{org.rfc}"
    Nombre="{org.legal_name}"
    RegimenFiscal="{org.tax_regime}"/>

  <cfdi:Receptor
    Rfc="{invoice.receiver_rfc}"
    Nombre="{invoice.receiver_name}"
    DomicilioFiscalReceptor="{invoice.receiver_postal_code}"
    RegimenFiscalReceptor="{invoice.receiver_tax_regime}"
    UsoCFDI="CP01"/>

  <cfdi:Conceptos>
    <cfdi:Concepto
      ClaveProdServ="84111506"
      Cantidad="1"
      ClaveUnidad="ACT"
      Descripcion="Pago"
      ValorUnitario="0"
      Importe="0"
      ObjetoImp="01"/>
  </cfdi:Conceptos>

  <cfdi:Complemento>
    <pago20:Pagos Version="2.0">
      <pago20:Totales
        MontoTotalPagos="{totales.montoTotalPagos}"
        TotalTrasladosBaseIVA16="{totales.totalTrasladosBaseIVA16}"
        TotalTrasladosImpuestoIVA16="{totales.totalTrasladosImpuestoIVA16}"/>

      <pago20:Pago
        FechaPago="{pago.fechaPago}"
        FormaDePagoP="{pago.formaDePagoP}"
        MonedaP="{pago.monedaP}"
        TipoCambioP="{pago.tipoCambioP}"
        Monto="{pago.monto}"
        NumOperacion="{pago.numOperacion}">

        <pago20:DoctoRelacionado
          IdDocumento="{docto.idDocumento}"
          Serie="{docto.serie}"
          Folio="{docto.folio}"
          MonedaDR="{docto.monedaDR}"
          EquivalenciaDR="{docto.equivalenciaDR}"
          ObjetoImpDR="{docto.objetoImpDR}"
          NumParcialidad="{docto.numParcialidad}"
          ImpSaldoAnt="{docto.impSaldoAnt}"
          ImpPagado="{docto.impPagado}"
          ImpSaldoInsoluto="{docto.impSaldoInsoluto}">
          <pago20:ImpuestosDR>
            <pago20:TrasladosDR>
              <pago20:TrasladoDR
                BaseDR="{traslado.baseDR}"
                ImpuestoDR="{traslado.impuestoDR}"
                TipoFactorDR="{traslado.tipoFactorDR}"
                TasaOCuotaDR="{traslado.tasaOCuotaDR}"
                ImporteDR="{traslado.importeDR}"/>
            </pago20:TrasladosDR>
          </pago20:ImpuestosDR>
        </pago20:DoctoRelacionado>

        <pago20:ImpuestosP>
          <pago20:TrasladosP>
            <pago20:TrasladoP
              BaseP="{traslado.baseDR}"
              ImpuestoP="{traslado.impuestoDR}"
              TipoFactorP="{traslado.tipoFactorDR}"
              TasaOCuotaP="{traslado.tasaOCuotaDR}"
              ImporteP="{traslado.importeDR}"/>
          </pago20:TrasladosP>
        </pago20:ImpuestosP>
      </pago20:Pago>
    </pago20:Pagos>
  </cfdi:Complemento>
</cfdi:Comprobante>
```

### Critical SAT Rules for Complemento Pagos 2.0

1. **`TipoDeComprobante` must be `"P"`** — not `"I"` (Ingreso)
2. **`SubTotal`, `Total` must be `"0"`** on the Comprobante root
3. **`Moneda` must be `"XXX"`** (not applicable) on the Comprobante root
4. **`UsoCFDI` must be `"CP01"`** (Pago) on the Receptor — not any other use code
5. **The single Concepto** must use `ClaveProdServ="84111506"`, `ClaveUnidad="ACT"`, `Descripcion="Pago"`, all amounts `"0"`, `ObjetoImp="01"` (not subject to tax)
6. **`pago20:Totales`** must appear **before** `pago20:Pago` nodes — required by schema order
7. **`TipoCambioP`** must be `"1"` when `MonedaP = "MXN"`; otherwise the actual rate
8. **`EquivalenciaDR`** must be `"1"` when `MonedaDR = MonedaP`; otherwise the conversion factor
9. **`ImpSaldoAnt`** = outstanding amount BEFORE this payment (in MonedaDR)
10. **`ImpPagado`** = amount actually paid in this payment (in MonedaDR)
11. **`ImpSaldoInsoluto`** = `ImpSaldoAnt - ImpPagado` (can be 0 for final payment)
12. **`NumParcialidad`** = which payment this is (1 = first, 2 = second, etc.)
13. **`ObjetoImpDR`** = `"02"` for invoices with IVA (most SME invoices); `"01"` if no tax breakdown
14. **Tax amounts in `TrasladoDR`** must be derived from the original invoice `tax_breakdown`, prorated by `ImpPagado / ImpSaldoAnt`
15. **`ImpuestosP`** mirrors the DR taxes — expressed in MonedaP
16. **`Fecha`** on the Comprobante cannot be more than 72 hours in the past or future (PAC rule)
17. **`Fecha`** and **`FechaPago`** must be valid datetime strings in format `YYYY-MM-DDTHH:mm:ss`

### Tax Proration Logic

When a payment covers part of a PPD invoice, the tax amounts in the Complemento must be prorated:

```typescript
// prorationFactor = ImpPagado / ImpSaldoAnt (the invoice total before this payment)
// proratedBase = originalTaxBase * prorationFactor
// proratedTaxAmount = proratedBase * taxRate

function prorateInvoiceTaxes(
  originalTaxBreakdown: InvoiceTaxBreakdown, // from invoices.tax_breakdown JSONB
  impPagado: number,
  impSaldoAnt: number
): TrasladoDR[] {
  const factor = impPagado / impSaldoAnt;
  // Apply to each tax line in tax_breakdown
  // ...
}
```

### Implementation

```typescript
import { XMLBuilder } from 'fast-xml-parser';
// fast-xml-parser is already installed (used in @repo/cfdi)

export function buildComplementoPago20(data: ComplementoData): string {
  // Build the XML object, then serialize with XMLBuilder
  // Sello, NoCertificado, Certificado left empty — filled by Component 14's signInvoice
}

export function buildTotales(documentos: DoctoRelacionado[]): PagosTotales {
  // Aggregate tax totals across all DoctoRelacionado nodes
  // Sum all TrasladoDR grouped by ImpuestoDR + TasaOCuota
  // Express in MXN (for Totales node)
}

export function buildDoctoRelacionado(params: {
  invoice: InvoiceRow;
  stamp: StampRow;
  payment: Payment;
  previousPayments: Payment[];
  taxBreakdown: InvoiceTaxBreakdown;
}): DoctoRelacionado {
  // Constructs the DoctoRelacionado node
  // Calculates ImpSaldoAnt, ImpPagado, ImpSaldoInsoluto
  // Prorates taxes from tax_breakdown
}

export function validateComplementoData(data: ComplementoData): { valid: boolean; errors: string[] } {
  // Validates required fields, amount relationships, currency codes
  // Checks ImpSaldoInsoluto = ImpSaldoAnt - ImpPagado (within tolerance)
  // Checks MontoTotalPagos = sum of all Pago.Monto
}
```

---

## Step 5 — Repository

Create `apps/web/lib/payments/repository.ts`:

```typescript
// All DB operations for the payments table
// Uses service-role Supabase client passed as parameter (no singleton)

export async function createPayment(
  supabase: SupabaseClient,
  payment: Omit<Payment, 'id' | 'createdAt' | 'updatedAt'>
): Promise<Payment>

export async function findPaymentById(
  supabase: SupabaseClient,
  paymentId: string,
  organizationId: string  // Always scope by org for RLS enforcement at app level
): Promise<Payment | null>

export async function findPaymentsByInvoice(
  supabase: SupabaseClient,
  invoiceId: string
): Promise<Payment[]>  // Returns ALL payments including voided (caller filters)

export async function findPaymentsByOrg(
  supabase: SupabaseClient,
  organizationId: string,
  filters: {
    startDate?: string;
    endDate?: string;
    status?: PaymentStatus;
    invoiceId?: string;
    paymentMethod?: PaymentMethodCode;
    limit?: number;
    offset?: number;
  }
): Promise<{ payments: Payment[]; total: number }>

export async function updatePayment(
  supabase: SupabaseClient,
  paymentId: string,
  updates: Partial<Pick<Payment, 'amount' | 'paymentDate' | 'paymentMethod' | 'referenceNumber' | 'notes' | 'status' | 'cfdiUuid' | 'cfdiXml' | 'pdfUrl' | 'voidedAt' | 'voidReason'>>
): Promise<Payment>

export async function softDeletePayment(
  supabase: SupabaseClient,
  paymentId: string,
  reason: string
): Promise<Payment>
// Sets status = 'voided', voided_at = NOW(), void_reason
```

---

## Step 6 — Service

Create `apps/web/lib/payments/service.ts`. This is the main entry point.

```typescript
/**
 * Records a payment against an invoice.
 *
 * Flow:
 * 1. Validate invoice exists, is stamped, is not cancelled
 * 2. Validate payment amount does not exceed outstanding balance
 * 3. Insert payment record with status = 'applied' (or 'pending' for PPD before CFDI)
 * 4. If PPD: generate Complemento de Pagos, sign, stamp → update payment with cfdiUuid + cfdiXml
 * 5. Update invoice payment_status column (unpaid → partially_paid → paid)
 * 6. If invoice fully paid: fire WorkflowEngine 'invoice.paid' event (cancels reminder jobs)
 * 7. Enqueue payment_received email job (Component 29 delivers it)
 * 8. Return payment record with CFDI data if applicable
 */
export async function recordPayment(
  invoiceId: string,
  organizationId: string,
  input: CreatePaymentInput,
  supabase: SupabaseClient
): Promise<Payment>

/**
 * Generates, signs, and stamps a Complemento de Pagos for an existing PPD payment.
 * Called internally by recordPayment; can also be called directly to re-stamp
 * a payment whose CFDI generation previously failed.
 *
 * @throws PaymentError('INVOICE_NOT_PPD') if invoice metodo_pago is PUE
 * @throws PaymentError('INVOICE_NOT_STAMPED') if invoice has no UUID
 * @throws PaymentError('COMPLEMENT_STAMP_FAILED') if PAC rejects
 */
export async function generatePaymentCFDI(
  paymentId: string,
  organizationId: string,
  supabase: SupabaseClient
): Promise<{ cfdiUuid: string; cfdiXml: string }>

/**
 * Updates a payment record. Only allowed before CFDI is generated.
 * Once a PPD payment has a cfdiUuid, it cannot be updated — must be voided
 * and a new payment recorded.
 */
export async function updatePayment(
  paymentId: string,
  organizationId: string,
  input: UpdatePaymentInput,
  supabase: SupabaseClient
): Promise<Payment>

/**
 * Returns a single payment with its summary context.
 */
export async function getPayment(
  paymentId: string,
  organizationId: string,
  supabase: SupabaseClient
): Promise<Payment>

/**
 * Lists payments for an organization with optional filters.
 */
export async function listPayments(
  organizationId: string,
  filters: PaymentFilters,
  supabase: SupabaseClient
): Promise<{ payments: Payment[]; total: number }>

/**
 * Returns all payments for a single invoice plus the running summary.
 */
export async function getInvoicePayments(
  invoiceId: string,
  organizationId: string,
  supabase: SupabaseClient
): Promise<{ payments: Payment[]; summary: PaymentSummary }>

/**
 * Calculates the current outstanding amount for an invoice.
 */
export async function calculateOutstandingBalance(
  invoiceId: string,
  supabase: SupabaseClient
): Promise<PaymentSummary>

/**
 * Voids a payment. If the payment has a stamped CFDI (PPD), the caller must
 * first cancel the CFDI through Component 15 before calling this — this function
 * does NOT handle PAC cancellation itself.
 *
 * For PUE payments or payments without CFDI: voids immediately.
 */
export async function voidPayment(
  paymentId: string,
  organizationId: string,
  reason: string,
  supabase: SupabaseClient
): Promise<Payment>
```

### generatePaymentCFDI Internal Sequence

```
1. Fetch payment + invoice + invoice_stamps + organization
2. Build ComplementoData from payment + invoice data
3. Call buildComplementoPago20(complementoData) → unsigned XML
4. Call generateCadenaOriginal(unsignedXml) [Component 13]
5. Call signInvoice with cadena → SignedInvoiceResult
6. Call stampInvoice(signedInvoice, orgId) [Component 15] → stampedXml + TFD
7. Extract UUID from TFD
8. Update payment: cfdiUuid, cfdiXml, status = 'applied'
9. Return { cfdiUuid, cfdiXml }
```

---

## Step 7 — Database Migration

Create `supabase/migrations/20260311000000_add_payments_tables.sql`:

```sql
-- Payments table
CREATE TABLE payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE RESTRICT,

  -- Payment details
  amount NUMERIC(15,6) NOT NULL CHECK (amount > 0),
  currency VARCHAR(3) NOT NULL DEFAULT 'MXN',
  exchange_rate NUMERIC(15,6) NOT NULL DEFAULT 1.0,
  payment_date DATE NOT NULL,
  payment_method VARCHAR(2) NOT NULL,           -- SAT c_FormaPago code
  reference_number VARCHAR(100),                -- NumOperacion
  bank_account_origin VARCHAR(50),              -- CtaOrdenante
  bank_account_dest VARCHAR(50),                -- CtaBeneficiario
  bank_rfc_origin VARCHAR(13),                  -- RfcEmisorCtaOrd
  bank_rfc_dest VARCHAR(13),                    -- RfcEmisorCtaBen
  bank_name_external VARCHAR(300),              -- NomBancoOrdExt
  notes TEXT,

  -- Status
  status VARCHAR(20) NOT NULL DEFAULT 'applied'
    CHECK (status IN ('pending', 'applied', 'voided')),

  -- Complemento de Pagos (PPD only)
  cfdi_uuid UUID,                               -- UUID from TFD
  cfdi_xml TEXT,                                -- Full stamped XML

  -- Void tracking
  voided_at TIMESTAMPTZ,
  void_reason TEXT,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_payments_org ON payments(organization_id);
CREATE INDEX idx_payments_invoice ON payments(invoice_id);
CREATE INDEX idx_payments_date ON payments(payment_date DESC);
CREATE INDEX idx_payments_status ON payments(status);
CREATE INDEX idx_payments_cfdi_uuid ON payments(cfdi_uuid) WHERE cfdi_uuid IS NOT NULL;

-- Add payment_status to invoices if not already present
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS payment_status VARCHAR(20)
  DEFAULT 'unpaid'
  CHECK (payment_status IN ('unpaid', 'partially_paid', 'paid'));

CREATE INDEX idx_invoices_payment_status ON invoices(payment_status)
  WHERE payment_status != 'paid';

-- RLS
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view org payments"
  ON payments FOR SELECT TO authenticated
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Members can create payments"
  ON payments FOR INSERT TO authenticated
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Members can update payments"
  ON payments FOR UPDATE TO authenticated
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
    )
  );

-- updated_at trigger
CREATE OR REPLACE FUNCTION update_payments_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER payments_updated_at
  BEFORE UPDATE ON payments
  FOR EACH ROW EXECUTE FUNCTION update_payments_updated_at();
```

---

## Step 8 — Public Bridge

Create `apps/web/lib/invoices/record-payment.ts`:

```typescript
// Public bridge for recording payments — called by Server Actions or API routes

import { createClient } from '@supabase/supabase-js';
import { recordPayment, getInvoicePayments, calculateOutstandingBalance } from '@/lib/payments/service';
import type { CreatePaymentInput } from '@/lib/payments/types';

/**
 * Records a payment and handles all downstream effects.
 * This is the only function a Server Action should call.
 */
export async function recordAndProcessPayment(
  invoiceId: string,
  organizationId: string,
  input: CreatePaymentInput
): Promise<{
  payment: Payment;
  cfdiGenerated: boolean;
  cfdiUuid?: string;
  invoiceFullyPaid: boolean;
}>

/**
 * Returns a full payment summary for display in the invoice detail view.
 */
export async function getInvoicePaymentSummary(
  invoiceId: string,
  organizationId: string
): Promise<{ payments: Payment[]; summary: PaymentSummary }>
```

Export from `apps/web/lib/invoices/index.ts`:
```typescript
export { recordAndProcessPayment, getInvoicePaymentSummary } from './record-payment';
```

---

## Step 9 — Implement `buildPagos20Complement()` in `@repo/cfdi`

The stub at `packages/cfdi/src/complements/pagos.ts` must be filled in. This function is called by `generateCFDI()` when building a type `P` CFDI. It should accept the `ComplementoData` shape from `apps/web/lib/payments/types.ts` (or a compatible interface defined in the package).

The implementation in `complement.ts` (`apps/web/lib/payments/`) handles the full XML construction using `fast-xml-parser`'s `XMLBuilder`. The `packages/cfdi/src/complements/pagos.ts` stub can simply re-export or delegate to the payment complement builder, or it can implement the XML construction directly — choose whichever keeps the boundary clean. The key constraint is that `packages/cfdi/` must not import from `apps/web/` — if needed, define a shared types interface in `packages/cfdi/src/complements/pagos-types.ts` that `apps/web/lib/payments/types.ts` extends.

---

## Coverage Targets and Tests

| File | Target | Notes |
|------|--------|-------|
| `types.ts` (Zod schema) | ≥95% | Validation edge cases |
| `errors.ts` | ≥95% | All error codes |
| `calculations.ts` | ≥98% | Math must be exact |
| `complement.ts` | ≥90% | XML output + tax proration |
| `repository.ts` | ≥85% | Mock Supabase |
| `service.ts` | ≥85% | Mock all dependencies |
| `record-payment.ts` (bridge) | ≥80% | |

**Total new tests: ≥95**

### Key Test Scenarios

**Calculations:**
- `calculatePaidAmount` excludes voided payments
- `calculateOutstanding` returns 0 when overpaid
- `determinePaymentStatus`: unpaid / partially_paid / paid at exact boundary
- `isValidPaymentAmount` rejects overpayment by > tolerance
- `getNextParcialidad` skips voided payments correctly

**Complement builder:**
- MXN payment against MXN invoice: `EquivalenciaDR="1"`, `TipoCambioP="1"`
- Full payment: `ImpSaldoInsoluto="0.00"`
- Partial payment: `ImpSaldoInsoluto = ImpSaldoAnt - ImpPagado`
- Tax proration for 50% partial payment of invoice with IVA 16%
- `Totales` node aggregates taxes correctly across multiple DoctoRelacionados
- `validateComplementoData` catches: ImpSaldoInsoluto mismatch, MontoTotalPagos mismatch
- Resulting XML contains `TipoDeComprobante="P"`, `Moneda="XXX"`, `SubTotal="0"`, `Total="0"`
- Resulting XML contains `UsoCFDI="CP01"` on Receptor
- Resulting XML contains single Concepto with `ObjetoImp="01"` and all amounts `"0"`
- `FechaPago` and `Fecha` are valid ISO datetime strings

**Service:**
- `recordPayment` for PUE invoice: no CFDI generated, status set to `paid`
- `recordPayment` for PPD invoice: CFDI generated, `cfdiUuid` populated
- `recordPayment` overpayment: throws `PaymentError('OVERPAYMENT')`
- `recordPayment` on cancelled invoice: throws `PaymentError('PAYMENT_LOCKED')`
- `recordPayment` full PPD payment: fires `invoice.paid` workflow event
- `recordPayment` partial PPD: status = `partially_paid`, reminder jobs NOT cancelled
- `voidPayment` on applied PPD with CFDI: throws `PaymentError('CANNOT_VOID_STAMPED')`
- `voidPayment` on PUE payment: succeeds, updates invoice status back to unpaid
- `generatePaymentCFDI` on PUE invoice: throws `PaymentError('INVOICE_NOT_PPD')`
- `updatePayment` on payment with cfdiUuid: throws (immutable once stamped)

---

## Key Design Decisions

**1. PUE payments never generate a Complemento de Pagos.**
PUE = paid at issuance. Recording a PUE payment simply marks the invoice `paid` and fires the workflow event. No CFDI type P, no PAC call, no sign/stamp cycle. This is a hard constraint — the SAT spec prohibits Complemento de Pagos on PUE invoices.

**2. Each PPD payment = one Complemento de Pagos CFDI.**
A single complemento covers a single payment event. If a customer makes 3 installment payments, there will be 3 separate CFDI type P documents. This matches the SAT requirement: emit a complemento within 5 business days of receiving each payment.

**3. Payment amounts are stored in invoice currency (`moneda`), not MXN.**
This preserves the original monetary relationship. Exchange rates are stored separately. The complement builder converts to MXN for the `Totales` node (SAT requires Totales in MXN).

**4. Tax proration from `tax_breakdown` JSONB.**
When a payment covers part of an invoice, the IVA/ISR amounts in the complement must reflect the proportion paid. The `tax_breakdown` on the `invoices` table (populated by Component 12/13) provides the base and rate — prorate by `impPagado / impSaldoAnt`.

**5. `ObjetoImpDR` defaults to `"02"` (subject to tax).**
For standard SME invoices with IVA, `ObjetoImpDR="02"` requires the `ImpuestosDR` sub-node with the prorated tax breakdown. Only use `"01"` (not subject to tax) for explicitly exempt invoices. Check `tax_breakdown` to determine which applies.

**6. `Fecha` on the payment CFDI must be within 72 hours.**
The PAC enforces this. Set `Fecha` to `NOW()` at the moment of CFDI generation (not to the payment date). The `FechaPago` field inside the Pago node carries the actual payment date.

**7. CFDI generation failure does not roll back the payment record.**
The payment is inserted first with `status='pending'`. If CFDI generation fails, the payment remains in the DB as `pending` and can be retried via `generatePaymentCFDI(paymentId, ...)`. This prevents data loss — the payment happened even if the CFDI didn't stamp.

**8. `voidPayment` for PPD+CFDI requires prior PAC cancellation.**
This component does not cancel PAC CFDIs — that is Component 15's job. The caller (Server Action) must call `cancelStampedInvoice` from Component 15 for the payment CFDI first, then call `voidPayment`. If a `cfdiUuid` is present and status is `'applied'`, throw `'CANNOT_VOID_STAMPED'` with a clear message.

**9. Workflow integration on full payment.**
When `determinePaymentStatus` returns `'paid'` after recording a payment, call `engine.executeWorkflow({ type: 'invoice.paid', ... })`. This cancels the BullMQ payment reminder jobs (Component 17 scheduled them) and can fire any downstream `paid` actions. The event type `'invoice.paid'` must be present in the Component 17 state machine — verify this before implementing.

**10. Email notification is enqueued, not sent inline.**
After recording a payment, enqueue an `EmailJobPayload` to the `invoice-emails` BullMQ queue with `emailType: 'payment_received'`. Component 29 will deliver it. Never block the payment recording on email delivery.

---

## Environment Variables

No new environment variables are needed. This component uses:
- `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` (already set)
- `REDIS_URL` (already set, via Component 17's queue)
- All PAC and certificate env vars from Components 14/15

---

## Definition of Done

- [ ] `apps/web/lib/payments/types.ts` — all interfaces + Zod schema
- [ ] `apps/web/lib/payments/errors.ts` — PaymentError class
- [ ] `apps/web/lib/payments/calculations.ts` — all calculation functions
- [ ] `apps/web/lib/payments/complement.ts` — full Pagos 2.0 XML builder
- [ ] `apps/web/lib/payments/repository.ts` — all DB operations
- [ ] `apps/web/lib/payments/service.ts` — all service functions
- [ ] `apps/web/lib/payments/index.ts` — exports
- [ ] `apps/web/lib/invoices/record-payment.ts` — public bridge
- [ ] `apps/web/lib/invoices/index.ts` updated
- [ ] `packages/cfdi/src/complements/pagos.ts` stub implemented
- [ ] Migration: `payments` table with all columns, indexes, RLS
- [ ] Migration: `invoices.payment_status` column added if missing
- [ ] PUE payments: no CFDI generated, invoice marked `paid` immediately
- [ ] PPD payments: Complemento de Pagos 2.0 generated, signed, stamped
- [ ] Overpayment guard rejects `amount > outstanding`
- [ ] Tax proration correct for partial payments with IVA
- [ ] `TipoDeComprobante="P"`, `Moneda="XXX"`, `SubTotal="0"`, `Total="0"` in generated XML
- [ ] `UsoCFDI="CP01"` on Receptor
- [ ] Single Concepto with `ObjetoImp="01"` and all amounts `"0"`
- [ ] `Fecha` on CFDI set to NOW() (not payment date)
- [ ] `invoice.paid` workflow event fired when fully paid
- [ ] Payment reminder jobs cancelled via workflow on full payment
- [ ] Email job enqueued to `invoice-emails` queue on payment
- [ ] Failed CFDI generation does NOT roll back payment record (`pending` status)
- [ ] `voidPayment` throws `CANNOT_VOID_STAMPED` if `cfdiUuid` present
- [ ] **≥95 new tests, all passing**

---

## Required Completion Summary

When done, provide a summary with:
1. All files created and modified (with paths)
2. Test count per file
3. Confirmation that `buildComplementoPago20()` produces valid XML (show example output for a simple MXN full-payment case)
4. How `tax_breakdown` JSONB is consumed for tax proration
5. Confirmation that the `invoice.paid` workflow event is wired correctly to Component 17
6. Any deviations from this spec and why
