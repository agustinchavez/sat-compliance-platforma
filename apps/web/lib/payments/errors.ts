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
