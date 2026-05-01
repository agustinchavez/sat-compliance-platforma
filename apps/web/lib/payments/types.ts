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
  PENDING = 'pending',       // Payment recorded but CFDI not yet generated (PPD)
  APPLIED = 'applied',       // Payment applied, CFDI generated and stamped (PPD) or applied (PUE)
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

export interface PaymentFilters {
  startDate?: string;
  endDate?: string;
  status?: PaymentStatus;
  invoiceId?: string;
  paymentMethod?: PaymentMethodCode;
  limit?: number;
  offset?: number;
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

export const updatePaymentSchema = z.object({
  amount: z.number().positive().optional(),
  paymentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  paymentMethod: z.enum(Object.keys(PAYMENT_METHODS) as [PaymentMethodCode, ...PaymentMethodCode[]]).optional(),
  referenceNumber: z.string().max(100).optional(),
  notes: z.string().max(1000).optional(),
});
