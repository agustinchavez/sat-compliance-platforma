/**
 * Payment Service (Component 18)
 *
 * Core business logic for recording payments, generating Complemento de Pagos CFDIs,
 * and managing payment lifecycles.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { buildPagos20Complement } from '@repo/cfdi';
import type { CreatePaymentInput, UpdatePaymentInput, Payment, PaymentSummary, PaymentFilters } from './types';
import { PaymentStatus } from './types';
import { createPaymentSchema, updatePaymentSchema } from './types';
import { PaymentError } from './errors';
import {
  calculatePaidAmount,
  calculateOutstanding,
  determinePaymentStatus,
  isValidPaymentAmount,
} from './calculations';
import {
  createPayment,
  findPaymentById,
  findPaymentsByInvoice,
  findPaymentsByOrg,
  updatePayment as updatePaymentRepo,
  softDeletePayment,
} from './repository';
import { buildPagos20Input, fetchComplementData } from './complement-builder';
import { signInvoice } from '@/lib/invoices/sign-invoice';
import { stampInvoice } from '@/lib/invoices/stamp-invoice';
import { cancelPaymentReminders } from '@/lib/workflows/actions/schedule-reminder';
import { emailQueue } from '@/lib/queue/queues';
import type { EmailJobPayload } from '@/lib/queue/job-types';

/**
 * Records a payment against an invoice.
 *
 * Flow:
 * 1. Validate invoice exists, is stamped, is not cancelled
 * 2. Validate payment amount does not exceed outstanding balance
 * 3. Insert payment record with status = 'pending' (PPD) or 'applied' (PUE)
 * 4. If PPD: generate Complemento de Pagos, sign, stamp → update payment with cfdiUuid + cfdiXml
 * 5. Update invoice payment_status column (unpaid → partially_paid → paid)
 * 6. If invoice fully paid: call cancelPaymentReminders (Component 17)
 * 7. Enqueue payment_received email job (Component 29 delivers it)
 * 8. Return payment record with CFDI data if applicable
 *
 * @throws PaymentError for validation failures or CFDI generation failures
 */
export async function recordPayment(
  invoiceId: string,
  organizationId: string,
  input: CreatePaymentInput,
  supabase: SupabaseClient
): Promise<Payment> {
  // Validate input
  const validatedInput = createPaymentSchema.parse(input);

  // Fetch invoice
  const { data: invoice, error: invoiceError } = await supabase
    .from('invoices')
    .select('id, status, metodo_pago, moneda, total, payment_status')
    .eq('id', invoiceId)
    .eq('organization_id', organizationId)
    .single();

  if (invoiceError || !invoice) {
    throw new PaymentError('INVOICE_NOT_FOUND', `Invoice ${invoiceId} not found`);
  }

  // Validate invoice is not cancelled
  if (invoice.status === 'cancelled' || invoice.status === 'void') {
    throw new PaymentError(
      'PAYMENT_LOCKED',
      'Cannot record payment for cancelled invoice',
      undefined,
      invoiceId
    );
  }

  // Validate invoice is stamped
  const { data: stamp, error: stampError } = await supabase
    .from('invoice_stamps')
    .select('uuid')
    .eq('invoice_id', invoiceId)
    .single();

  if (stampError || !stamp) {
    throw new PaymentError(
      'INVOICE_NOT_STAMPED',
      'Invoice must be stamped before recording payment',
      undefined,
      invoiceId
    );
  }

  // Fetch existing payments
  const existingPayments = await findPaymentsByInvoice(supabase, invoiceId);

  // Validate payment amount
  if (!isValidPaymentAmount(validatedInput.amount, invoice.total, existingPayments)) {
    throw new PaymentError(
      'OVERPAYMENT',
      `Payment amount ${validatedInput.amount} exceeds outstanding balance`,
      undefined,
      invoiceId
    );
  }

  // Validate currency matches invoice
  if (validatedInput.currency !== invoice.moneda) {
    throw new PaymentError(
      'INVALID_CURRENCY',
      `Payment currency ${validatedInput.currency} does not match invoice currency ${invoice.moneda}`,
      undefined,
      invoiceId
    );
  }

  // Get next folio for payment CFDI (PPD only)
  let serie: string | undefined = undefined;
  let folio: number | undefined = undefined;

  if (invoice.metodo_pago === 'PPD') {
    const { data: folioData, error: folioError } = await supabase.rpc('get_next_folio', {
      p_org_id: organizationId,
      p_serie: 'RP',
    });

    if (folioError) {
      throw new PaymentError(
        'COMPLEMENT_GENERATION_FAILED',
        `Failed to get next folio: ${folioError.message}`,
        undefined,
        invoiceId
      );
    }

    serie = 'RP';
    folio = folioData;
  }

  // Create payment record with status='pending' for PPD, 'applied' for PUE
  const payment = await createPayment(supabase, {
    organizationId,
    invoiceId,
    amount: validatedInput.amount,
    currency: validatedInput.currency,
    exchangeRate: validatedInput.exchangeRate || 1,
    paymentDate: validatedInput.paymentDate,
    paymentMethod: validatedInput.paymentMethod,
    referenceNumber: validatedInput.referenceNumber,
    bankAccountOrigin: validatedInput.bankAccountOrigin,
    bankAccountDest: validatedInput.bankAccountDest,
    bankRfcOrigin: validatedInput.bankRfcOrigin,
    bankRfcDest: validatedInput.bankRfcDest,
    bankNameExternal: validatedInput.bankNameExternal,
    notes: validatedInput.notes,
    status: invoice.metodo_pago === 'PPD' ? PaymentStatus.PENDING : PaymentStatus.APPLIED,
  });

  // Generate CFDI for PPD payments
  let updatedPayment = payment;

  if (invoice.metodo_pago === 'PPD') {
    try {
      const { cfdiUuid, cfdiXml } = await generatePaymentCFDI(
        payment.id,
        organizationId,
        supabase,
        serie,
        folio
      );

      updatedPayment = await updatePaymentRepo(supabase, payment.id, {
        cfdiUuid,
        cfdiXml,
        status: PaymentStatus.APPLIED,
      });
    } catch (error) {
      // Payment is recorded but CFDI generation failed
      // Leave status as 'pending' so it can be retried
      console.error(`[payment-service] CFDI generation failed for payment ${payment.id}:`, error);
      throw error;
    }
  }

  // Update invoice payment_status
  const newPaymentStatus = determinePaymentStatus(invoice.total, [
    ...existingPayments,
    updatedPayment,
  ]);

  await supabase
    .from('invoices')
    .update({ payment_status: newPaymentStatus })
    .eq('id', invoiceId);

  // If fully paid, cancel payment reminders
  if (newPaymentStatus === 'paid') {
    await cancelPaymentReminders(invoiceId);
  }

  // Enqueue payment_received email
  try {
    await emailQueue.add('send-email', {
      invoiceId,
      organizationId,
      emailType: 'payment_received',
      recipientEmail: '', // Will be populated by email worker from invoice data
      recipientName: '',
      language: 'es',
      metadata: {
        paymentId: updatedPayment.id,
        amount: updatedPayment.amount,
        currency: updatedPayment.currency,
        paymentDate: updatedPayment.paymentDate,
        isFullyPaid: newPaymentStatus === 'paid',
      },
    } satisfies EmailJobPayload);
  } catch (error) {
    // Non-fatal: email queueing failure shouldn't block payment recording
    console.error(`[payment-service] Failed to enqueue payment email:`, error);
  }

  return updatedPayment;
}

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
  supabase: SupabaseClient,
  serie?: string,
  folio?: number
): Promise<{ cfdiUuid: string; cfdiXml: string }> {
  // Fetch payment
  const payment = await findPaymentById(supabase, paymentId, organizationId);

  if (!payment) {
    throw new PaymentError('PAYMENT_NOT_FOUND', `Payment ${paymentId} not found`);
  }

  // Fetch invoice and related data
  const { invoice, invoiceStamp, invoiceItems } = await fetchComplementData(
    supabase,
    payment.invoiceId
  );

  // Validate invoice is PPD
  if (invoice.metodo_pago !== 'PPD') {
    throw new PaymentError(
      'INVOICE_NOT_PPD',
      'Cannot generate Complemento de Pagos for PUE invoice',
      paymentId,
      payment.invoiceId
    );
  }

  // Fetch previous payments
  const allPayments = await findPaymentsByInvoice(supabase, payment.invoiceId);
  const previousPayments = allPayments.filter(p => p.id !== payment.id && p.status !== 'voided');

  // Build Pagos20Input
  const pagos20Input = await buildPagos20Input({
    payment,
    invoice,
    invoiceStamp,
    invoiceItems,
    previousPayments,
  });

  // Generate Pagos20 complement XML fragment
  const pagosXML = buildPagos20Complement(pagos20Input);

  // Fetch organization data
  const { data: org, error: orgError } = await supabase
    .from('organizations')
    .select('rfc, legal_name, tax_regime, address')
    .eq('id', organizationId)
    .single();

  if (orgError || !org) {
    throw new PaymentError(
      'COMPLEMENT_GENERATION_FAILED',
      `Organization ${organizationId} not found`,
      paymentId
    );
  }

  const orgAddress = org.address as { postal_code?: string } | null;

  // Fetch receiver data from invoice
  const { data: invoiceData, error: invoiceDataError } = await supabase
    .from('invoices')
    .select('receiver_rfc, receiver_name, receiver_tax_regime, receiver_zip_code')
    .eq('id', payment.invoiceId)
    .single();

  if (invoiceDataError || !invoiceData) {
    throw new PaymentError(
      'COMPLEMENT_GENERATION_FAILED',
      `Invoice data not found for ${payment.invoiceId}`,
      paymentId
    );
  }

  // Build full CFDI Comprobante for type P
  const cfdiXML = buildPaymentCFDIComprobante({
    serie: serie || 'RP',
    folio: folio?.toString(),
    fecha: new Date().toISOString().slice(0, 19), // YYYY-MM-DDTHH:mm:ss
    lugarExpedicion: orgAddress?.postal_code || '00000',
    emisorRfc: org.rfc,
    emisorNombre: org.legal_name,
    emisorRegimenFiscal: org.tax_regime,
    receptorRfc: invoiceData.receiver_rfc,
    receptorNombre: invoiceData.receiver_name,
    receptorDomicilioFiscal: invoiceData.receiver_zip_code,
    receptorRegimenFiscal: invoiceData.receiver_tax_regime,
    pagosComplementXML: pagosXML,
  });

  // Sign the CFDI
  let signedXML: string;
  try {
    const signResult = await signInvoice(
      {
        id: payment.id,
        organization_id: organizationId,
        cfdi_xml: cfdiXML,
      } as any,
      organizationId,
      '' // Password - will be fetched from org certificate
    );

    signedXML = signResult.signedXml;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    throw new PaymentError(
      'COMPLEMENT_GENERATION_FAILED',
      `Failed to sign payment CFDI: ${message}`,
      paymentId,
      payment.invoiceId,
      error as Error
    );
  }

  // Stamp the CFDI
  let stampedXML: string;
  let uuid: string;
  try {
    const stampResult = await stampInvoice(
      {
        id: payment.id,
        organization_id: organizationId,
        cfdi_xml: signedXML,
      } as any,
      organizationId
    );

    stampedXML = stampResult.stampedXml;
    uuid = stampResult.tfd.UUID;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    throw new PaymentError(
      'COMPLEMENT_STAMP_FAILED',
      `PAC rejected payment CFDI: ${message}`,
      paymentId,
      payment.invoiceId,
      error as Error
    );
  }

  return {
    cfdiUuid: uuid,
    cfdiXml: stampedXML,
  };
}

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
): Promise<Payment> {
  // Validate input
  const validatedInput = updatePaymentSchema.parse(input);

  // Fetch payment
  const payment = await findPaymentById(supabase, paymentId, organizationId);

  if (!payment) {
    throw new PaymentError('PAYMENT_NOT_FOUND', `Payment ${paymentId} not found`);
  }

  // Cannot update if CFDI is already generated
  if (payment.cfdiUuid) {
    throw new PaymentError(
      'PAYMENT_LOCKED',
      'Cannot update payment after CFDI is generated. Void and create a new payment instead.',
      paymentId
    );
  }

  // Cannot update voided payment
  if (payment.status === PaymentStatus.VOIDED) {
    throw new PaymentError('ALREADY_VOIDED', 'Cannot update a voided payment', paymentId);
  }

  return await updatePaymentRepo(supabase, paymentId, validatedInput);
}

/**
 * Returns a single payment with its summary context.
 */
export async function getPayment(
  paymentId: string,
  organizationId: string,
  supabase: SupabaseClient
): Promise<Payment> {
  const payment = await findPaymentById(supabase, paymentId, organizationId);

  if (!payment) {
    throw new PaymentError('PAYMENT_NOT_FOUND', `Payment ${paymentId} not found`);
  }

  return payment;
}

/**
 * Lists payments for an organization with optional filters.
 */
export async function listPayments(
  organizationId: string,
  filters: PaymentFilters,
  supabase: SupabaseClient
): Promise<{ payments: Payment[]; total: number }> {
  return await findPaymentsByOrg(supabase, organizationId, filters);
}

/**
 * Returns all payments for a single invoice plus the running summary.
 */
export async function getInvoicePayments(
  invoiceId: string,
  organizationId: string,
  supabase: SupabaseClient
): Promise<{ payments: Payment[]; summary: PaymentSummary }> {
  const payments = await findPaymentsByInvoice(supabase, invoiceId);

  // Fetch invoice total
  const { data: invoice, error } = await supabase
    .from('invoices')
    .select('total, moneda')
    .eq('id', invoiceId)
    .eq('organization_id', organizationId)
    .single();

  if (error || !invoice) {
    throw new PaymentError('INVOICE_NOT_FOUND', `Invoice ${invoiceId} not found`);
  }

  const paidAmount = calculatePaidAmount(payments);
  const outstandingAmount = calculateOutstanding(invoice.total, paidAmount);
  const isFullyPaid = outstandingAmount <= 0.01;

  const lastPayment = payments
    .filter(p => p.status !== PaymentStatus.VOIDED)
    .sort((a, b) => new Date(b.paymentDate).getTime() - new Date(a.paymentDate).getTime())[0];

  const summary: PaymentSummary = {
    invoiceId,
    invoiceTotal: invoice.total,
    invoiceCurrency: invoice.moneda,
    paidAmount,
    outstandingAmount,
    paymentCount: payments.filter(p => p.status !== PaymentStatus.VOIDED).length,
    isFullyPaid,
    lastPaymentDate: lastPayment?.paymentDate,
  };

  return { payments, summary };
}

/**
 * Calculates the current outstanding amount for an invoice.
 */
export async function calculateOutstandingBalance(
  invoiceId: string,
  supabase: SupabaseClient
): Promise<PaymentSummary> {
  const payments = await findPaymentsByInvoice(supabase, invoiceId);

  const { data: invoice, error } = await supabase
    .from('invoices')
    .select('total, moneda')
    .eq('id', invoiceId)
    .single();

  if (error || !invoice) {
    throw new PaymentError('INVOICE_NOT_FOUND', `Invoice ${invoiceId} not found`);
  }

  const paidAmount = calculatePaidAmount(payments);
  const outstandingAmount = calculateOutstanding(invoice.total, paidAmount);
  const isFullyPaid = outstandingAmount <= 0.01;

  const lastPayment = payments
    .filter(p => p.status !== PaymentStatus.VOIDED)
    .sort((a, b) => new Date(b.paymentDate).getTime() - new Date(a.paymentDate).getTime())[0];

  return {
    invoiceId,
    invoiceTotal: invoice.total,
    invoiceCurrency: invoice.moneda,
    paidAmount,
    outstandingAmount,
    paymentCount: payments.filter(p => p.status !== PaymentStatus.VOIDED).length,
    isFullyPaid,
    lastPaymentDate: lastPayment?.paymentDate,
  };
}

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
): Promise<Payment> {
  const payment = await findPaymentById(supabase, paymentId, organizationId);

  if (!payment) {
    throw new PaymentError('PAYMENT_NOT_FOUND', `Payment ${paymentId} not found`);
  }

  if (payment.status === PaymentStatus.VOIDED) {
    throw new PaymentError('ALREADY_VOIDED', 'Payment is already voided', paymentId);
  }

  // If payment has a stamped CFDI, must cancel through PAC first
  if (payment.cfdiUuid && payment.status === PaymentStatus.APPLIED) {
    throw new PaymentError(
      'CANNOT_VOID_STAMPED',
      'Payment has a stamped CFDI. Cancel the CFDI through the PAC first using cancelStampedInvoice() before voiding.',
      paymentId
    );
  }

  const voidedPayment = await softDeletePayment(supabase, paymentId, reason);

  // Update invoice payment_status
  const allPayments = await findPaymentsByInvoice(supabase, payment.invoiceId);
  const { data: invoice } = await supabase
    .from('invoices')
    .select('total')
    .eq('id', payment.invoiceId)
    .single();

  if (invoice) {
    const newPaymentStatus = determinePaymentStatus(invoice.total, allPayments);

    await supabase
      .from('invoices')
      .update({ payment_status: newPaymentStatus })
      .eq('id', payment.invoiceId);
  }

  return voidedPayment;
}

// ============================================================================
// Helper: Build Payment CFDI Comprobante (Type P)
// ============================================================================

interface BuildPaymentCFDIComprobanteParams {
  serie: string;
  folio?: string;
  fecha: string;
  lugarExpedicion: string;
  emisorRfc: string;
  emisorNombre: string;
  emisorRegimenFiscal: string;
  receptorRfc: string;
  receptorNombre: string;
  receptorDomicilioFiscal: string;
  receptorRegimenFiscal: string;
  pagosComplementXML: string;
}

/**
 * Builds a full CFDI Comprobante XML for TipoDeComprobante=P
 * This wraps the Pagos20 complement in the required CFDI structure.
 */
function buildPaymentCFDIComprobante(params: BuildPaymentCFDIComprobanteParams): string {
  const {
    serie,
    folio,
    fecha,
    lugarExpedicion,
    emisorRfc,
    emisorNombre,
    emisorRegimenFiscal,
    receptorRfc,
    receptorNombre,
    receptorDomicilioFiscal,
    receptorRegimenFiscal,
    pagosComplementXML,
  } = params;

  // Build the XML manually (simplified approach)
  // In production, use xmlbuilder2 or the @repo/cfdi generateCFDI function with type P support

  return `<?xml version="1.0" encoding="UTF-8"?>
<cfdi:Comprobante
  xmlns:cfdi="http://www.sat.gob.mx/cfd/4"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xsi:schemaLocation="http://www.sat.gob.mx/cfd/4 http://www.sat.gob.mx/sitio_internet/cfd/4/cfdv40.xsd http://www.sat.gob.mx/Pagos20 http://www.sat.gob.mx/sitio_internet/cfd/Pagos/Pagos20.xsd"
  Version="4.0"
  Serie="${serie}"
  ${folio ? `Folio="${folio}"` : ''}
  Fecha="${fecha}"
  Sello=""
  NoCertificado=""
  Certificado=""
  SubTotal="0"
  Moneda="XXX"
  Total="0"
  TipoDeComprobante="P"
  Exportacion="01"
  LugarExpedicion="${lugarExpedicion}">
  <cfdi:Emisor
    Rfc="${emisorRfc}"
    Nombre="${emisorNombre}"
    RegimenFiscal="${emisorRegimenFiscal}"/>
  <cfdi:Receptor
    Rfc="${receptorRfc}"
    Nombre="${receptorNombre}"
    DomicilioFiscalReceptor="${receptorDomicilioFiscal}"
    RegimenFiscalReceptor="${receptorRegimenFiscal}"
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
${pagosComplementXML}
  </cfdi:Complemento>
</cfdi:Comprobante>`;
}
