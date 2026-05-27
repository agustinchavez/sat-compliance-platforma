/**
 * Payment Types (Component 18)
 * Stub for turborepo workspace — full implementation in /apps/web/lib/payments/types.ts
 */

export enum PaymentStatus {
  PENDING = 'pending',
  APPLIED = 'applied',
  VOIDED = 'voided',
}

export interface Payment {
  id: string;
  organizationId: string;
  invoiceId: string;
  amount: number;
  currency: string;
  exchangeRate: number;
  paymentDate: string;
  paymentMethod: string;
  referenceNumber?: string;
  notes?: string;
  status: PaymentStatus;
  cfdiUuid?: string;
  cfdiXml?: string;
  pdfUrl?: string;
  voidedAt?: string;
  voidReason?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreatePaymentInput {
  invoiceId: string;
  amount: number;
  currency: string;
  exchangeRate?: number;
  paymentDate: string;
  paymentMethod: string;
  referenceNumber?: string;
  notes?: string;
}

export interface PaymentSummary {
  invoiceId: string;
  invoiceTotal: number;
  invoiceCurrency: string;
  paidAmount: number;
  outstandingAmount: number;
  paymentCount: number;
  isFullyPaid: boolean;
  lastPaymentDate?: string;
}
