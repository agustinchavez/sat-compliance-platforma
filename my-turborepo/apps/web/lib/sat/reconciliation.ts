/**
 * CFDI Reconciliation Service
 *
 * This file handles reconciling downloaded CFDIs with internal invoices.
 * Reconciliation helps verify that:
 * - All issued invoices are properly registered with SAT
 * - All received invoices are accounted for
 * - There are no discrepancies in amounts, dates, or participants
 *
 * Key features:
 * - Match CFDIs to internal invoices by UUID
 * - Detect discrepancies (amounts, dates, RFC, etc.)
 * - Generate reconciliation reports
 * - Track unmatched CFDIs
 * - Support bulk reconciliation
 */

import { createClient } from '@/lib/supabase/server';
import type {
  ParsedCFDI,
  ReconciliationResult,
  ReconciliationDifference,
  ReconciliationReport,
  CFDIDownloadType,
} from './types';
import { parseCFDI } from './cfdi-parser';

// ============================================================================
// Types
// ============================================================================

export interface Invoice {
  id: string;
  uuid: string | null;
  folio_number: string | null;
  customer_id: string | null;
  subtotal: number;
  tax: number;
  total: number;
  status: string;
  issued_at: string;
  customer?: {
    rfc: string;
    legal_name: string;
  };
}

export interface ReconciliationSummary {
  totalCFDIs: number;
  matchedCFDIs: number;
  unmatchedCFDIs: number;
  discrepancyCount: number;
  totalAmountCFDIs: number;
  totalAmountInvoices: number;
  amountDifference: number;
}

// ============================================================================
// Main Reconciliation Functions
// ============================================================================

/**
 * Reconciles a single CFDI with internal invoices
 *
 * @param cfdiUUID - CFDI UUID to reconcile
 * @param organizationId - Organization UUID
 * @returns Reconciliation result
 *
 * @example
 * ```ts
 * const result = await reconcileCFDI('A1B2C3D4-E5F6-...', 'org-uuid');
 * if (result.matched) {
 *   console.log('Matched to invoice:', result.invoiceId);
 * } else {
 *   console.log('No matching invoice found');
 * }
 * ```
 */
export async function reconcileCFDI(
  cfdiUUID: string,
  organizationId: string
): Promise<ReconciliationResult> {
  const supabase = await createClient();

  // Get the downloaded CFDI
  const { data: downloadedCFDI } = await supabase
    .from('downloaded_cfdis')
    .select('*')
    .eq('uuid', cfdiUUID.toUpperCase())
    .eq('organization_id', organizationId)
    .is('deleted_at', null)
    .single();

  if (!downloadedCFDI) {
    return {
      matched: false,
      cfdiId: cfdiUUID,
      differences: [],
      confidence: 0,
    };
  }

  // Parse CFDI data
  const cfdiData = downloadedCFDI.parsed_data as ParsedCFDI;

  // Try to find matching invoice by UUID
  const { data: invoice } = await supabase
    .from('invoices')
    .select(`
      id,
      uuid,
      folio_number,
      customer_id,
      subtotal,
      tax,
      total,
      status,
      issued_at,
      customers (
        rfc,
        legal_name
      )
    `)
    .eq('uuid', cfdiUUID.toUpperCase())
    .eq('organization_id', organizationId)
    .is('deleted_at', null)
    .single();

  if (!invoice) {
    // Try to find by other criteria (folio, date, amount)
    const potentialMatch = await findPotentialMatch(cfdiData, organizationId);

    if (potentialMatch) {
      const differences = findDiscrepancies(cfdiData, potentialMatch);

      // Update CFDI as potentially matched
      await updateCFDIReconciliation(
        downloadedCFDI.id,
        potentialMatch.id,
        differences.length > 0 ? `Potential match with ${differences.length} discrepancies` : 'Potential match'
      );

      return {
        matched: differences.length === 0,
        cfdiId: downloadedCFDI.id,
        invoiceId: potentialMatch.id,
        differences,
        confidence: calculateConfidence(differences),
      };
    }

    return {
      matched: false,
      cfdiId: downloadedCFDI.id,
      differences: [],
      confidence: 0,
    };
  }

  // Found exact UUID match - check for discrepancies
  const differences = findDiscrepancies(cfdiData, invoice);

  // Update CFDI reconciliation status
  await updateCFDIReconciliation(
    downloadedCFDI.id,
    invoice.id,
    differences.length > 0 ? `Matched with ${differences.length} discrepancies` : 'Matched'
  );

  return {
    matched: true,
    cfdiId: downloadedCFDI.id,
    invoiceId: invoice.id,
    differences,
    confidence: 100,
  };
}

/**
 * Reconciles all unreconciled CFDIs for an organization
 *
 * @param organizationId - Organization UUID
 * @param options - Reconciliation options
 * @returns Array of reconciliation results
 *
 * @example
 * ```ts
 * const results = await reconcileAllCFDIs('org-uuid');
 * console.log(`Matched ${results.filter(r => r.matched).length} CFDIs`);
 * ```
 */
export async function reconcileAllCFDIs(
  organizationId: string,
  options: {
    type?: CFDIDownloadType;
    limit?: number;
  } = {}
): Promise<ReconciliationResult[]> {
  const supabase = await createClient();

  // Get unreconciled CFDIs
  let query = supabase
    .from('downloaded_cfdis')
    .select('uuid')
    .eq('organization_id', organizationId)
    .eq('reconciled', false)
    .is('deleted_at', null);

  if (options.type) {
    query = query.eq('type', options.type);
  }

  if (options.limit) {
    query = query.limit(options.limit);
  }

  const { data: cfdis } = await query;

  if (!cfdis || cfdis.length === 0) {
    return [];
  }

  // Reconcile each CFDI
  const results: ReconciliationResult[] = [];

  for (const cfdi of cfdis) {
    const result = await reconcileCFDI(cfdi.uuid, organizationId);
    results.push(result);
  }

  return results;
}

/**
 * Generates a reconciliation report for a period
 *
 * @param organizationId - Organization UUID
 * @param startDate - Period start date
 * @param endDate - Period end date
 * @returns Reconciliation report
 *
 * @example
 * ```ts
 * const report = await getReconciliationReport(
 *   'org-uuid',
 *   new Date('2024-01-01'),
 *   new Date('2024-12-31')
 * );
 * console.log('Match rate:', report.matchedCFDIs / report.totalCFDIs);
 * ```
 */
export async function getReconciliationReport(
  organizationId: string,
  startDate: Date,
  endDate: Date
): Promise<ReconciliationReport> {
  const supabase = await createClient();

  // Get all CFDIs in period
  const { data: cfdis } = await supabase
    .from('downloaded_cfdis')
    .select('*')
    .eq('organization_id', organizationId)
    .gte('fecha_emision', startDate.toISOString())
    .lte('fecha_emision', endDate.toISOString())
    .is('deleted_at', null);

  const cfdiList = cfdis || [];

  // Calculate statistics
  const matchedCFDIs = cfdiList.filter(c => c.reconciled).length;
  const unmatchedCFDIs = cfdiList.length - matchedCFDIs;

  // Get reconciliation results for all CFDIs
  const results: ReconciliationResult[] = [];
  let discrepancies = 0;

  for (const cfdi of cfdiList) {
    if (cfdi.reconciled && cfdi.invoice_id) {
      const result = await reconcileCFDI(cfdi.uuid, organizationId);
      results.push(result);
      if (result.differences.length > 0) {
        discrepancies++;
      }
    } else {
      results.push({
        matched: false,
        cfdiId: cfdi.id,
        differences: [],
        confidence: 0,
      });
    }
  }

  return {
    organizationId,
    period: {
      start: startDate,
      end: endDate,
    },
    totalCFDIs: cfdiList.length,
    matchedCFDIs,
    unmatchedCFDIs,
    discrepancies,
    results,
  };
}

/**
 * Gets reconciliation summary for an organization
 *
 * @param organizationId - Organization UUID
 * @param type - CFDI type filter (optional)
 * @returns Reconciliation summary
 */
export async function getReconciliationSummary(
  organizationId: string,
  type?: CFDIDownloadType
): Promise<ReconciliationSummary> {
  const supabase = await createClient();

  // Build query
  let query = supabase
    .from('downloaded_cfdis')
    .select('reconciled, monto_total')
    .eq('organization_id', organizationId)
    .is('deleted_at', null);

  if (type) {
    query = query.eq('type', type);
  }

  const { data: cfdis } = await query;

  const cfdiList = cfdis || [];

  // Calculate summary
  const totalCFDIs = cfdiList.length;
  const matchedCFDIs = cfdiList.filter(c => c.reconciled).length;
  const unmatchedCFDIs = totalCFDIs - matchedCFDIs;
  const totalAmountCFDIs = cfdiList.reduce((sum, c) => sum + (c.monto_total || 0), 0);

  // Get total from reconciled invoices
  const reconciledUUIDs = cfdiList
    .filter(c => c.reconciled)
    .map(c => c.invoice_id)
    .filter(Boolean);

  let totalAmountInvoices = 0;

  if (reconciledUUIDs.length > 0) {
    const { data: invoices } = await supabase
      .from('invoices')
      .select('total')
      .in('id', reconciledUUIDs as string[]);

    totalAmountInvoices = (invoices || []).reduce((sum, i) => sum + (i.total || 0), 0);
  }

  return {
    totalCFDIs,
    matchedCFDIs,
    unmatchedCFDIs,
    discrepancyCount: 0, // Would need to check each
    totalAmountCFDIs,
    totalAmountInvoices,
    amountDifference: Math.abs(totalAmountCFDIs - totalAmountInvoices),
  };
}

// ============================================================================
// Matching Functions
// ============================================================================

/**
 * Finds a potential invoice match for a CFDI
 */
async function findPotentialMatch(
  cfdi: ParsedCFDI,
  organizationId: string
): Promise<Invoice | null> {
  const supabase = await createClient();

  // Try multiple matching strategies

  // Strategy 1: Match by folio and date
  if (cfdi.folio) {
    const { data: byFolio } = await supabase
      .from('invoices')
      .select(`
        id,
        uuid,
        folio_number,
        customer_id,
        subtotal,
        tax,
        total,
        status,
        issued_at,
        customers (
          rfc,
          legal_name
        )
      `)
      .eq('organization_id', organizationId)
      .eq('folio_number', cfdi.folio)
      .is('deleted_at', null)
      .single();

    if (byFolio) {
      return byFolio as unknown as Invoice;
    }
  }

  // Strategy 2: Match by amount and date range
  const cfdiDate = new Date(cfdi.fecha);
  const dateStart = new Date(cfdiDate);
  dateStart.setDate(dateStart.getDate() - 1);
  const dateEnd = new Date(cfdiDate);
  dateEnd.setDate(dateEnd.getDate() + 1);

  const { data: byAmount } = await supabase
    .from('invoices')
    .select(`
      id,
      uuid,
      folio_number,
      customer_id,
      subtotal,
      tax,
      total,
      status,
      issued_at,
      customers (
        rfc,
        legal_name
      )
    `)
    .eq('organization_id', organizationId)
    .eq('total', cfdi.total)
    .gte('issued_at', dateStart.toISOString())
    .lte('issued_at', dateEnd.toISOString())
    .is('uuid', null) // Only match invoices without UUID
    .is('deleted_at', null)
    .limit(1)
    .single();

  if (byAmount) {
    return byAmount as unknown as Invoice;
  }

  // Strategy 3: Match by customer RFC and amount
  const { data: byCustomer } = await supabase
    .from('invoices')
    .select(`
      id,
      uuid,
      folio_number,
      customer_id,
      subtotal,
      tax,
      total,
      status,
      issued_at,
      customers!inner (
        rfc,
        legal_name
      )
    `)
    .eq('organization_id', organizationId)
    .eq('total', cfdi.total)
    .eq('customers.rfc', cfdi.receptor.rfc)
    .is('uuid', null)
    .is('deleted_at', null)
    .limit(1)
    .single();

  if (byCustomer) {
    return byCustomer as unknown as Invoice;
  }

  return null;
}

/**
 * Finds discrepancies between CFDI and invoice
 */
function findDiscrepancies(
  cfdi: ParsedCFDI,
  invoice: Invoice
): ReconciliationDifference[] {
  const differences: ReconciliationDifference[] = [];

  // Check total
  const totalDiff = Math.abs(cfdi.total - invoice.total);
  if (totalDiff > 0.01) { // Allow 1 cent tolerance
    differences.push({
      field: 'total',
      cfdiValue: cfdi.total,
      invoiceValue: invoice.total,
      severity: totalDiff > cfdi.total * 0.01 ? 'high' : 'medium',
    });
  }

  // Check subtotal
  const subtotalDiff = Math.abs(cfdi.subTotal - invoice.subtotal);
  if (subtotalDiff > 0.01) {
    differences.push({
      field: 'subtotal',
      cfdiValue: cfdi.subTotal,
      invoiceValue: invoice.subtotal,
      severity: 'medium',
    });
  }

  // Check tax
  const cfdiTax = cfdi.impuestos?.totalImpuestosTrasladados || 0;
  const taxDiff = Math.abs(cfdiTax - invoice.tax);
  if (taxDiff > 0.01) {
    differences.push({
      field: 'tax',
      cfdiValue: cfdiTax,
      invoiceValue: invoice.tax,
      severity: 'medium',
    });
  }

  // Check customer RFC
  const customerRFC = (invoice as any).customers?.rfc;
  if (customerRFC && cfdi.receptor.rfc !== customerRFC) {
    differences.push({
      field: 'receptor_rfc',
      cfdiValue: cfdi.receptor.rfc,
      invoiceValue: customerRFC,
      severity: 'high',
    });
  }

  // Check date (within 24 hours)
  const cfdiDate = new Date(cfdi.fecha);
  const invoiceDate = new Date(invoice.issued_at);
  const dateDiff = Math.abs(cfdiDate.getTime() - invoiceDate.getTime());
  if (dateDiff > 24 * 60 * 60 * 1000) { // More than 24 hours
    differences.push({
      field: 'fecha',
      cfdiValue: cfdiDate.toISOString(),
      invoiceValue: invoiceDate.toISOString(),
      severity: 'low',
    });
  }

  return differences;
}

/**
 * Calculates confidence score based on discrepancies
 */
function calculateConfidence(differences: ReconciliationDifference[]): number {
  if (differences.length === 0) {
    return 100;
  }

  let penalty = 0;

  for (const diff of differences) {
    switch (diff.severity) {
      case 'high':
        penalty += 30;
        break;
      case 'medium':
        penalty += 15;
        break;
      case 'low':
        penalty += 5;
        break;
    }
  }

  return Math.max(0, 100 - penalty);
}

// ============================================================================
// Database Operations
// ============================================================================

/**
 * Updates CFDI reconciliation status
 */
async function updateCFDIReconciliation(
  cfdiId: string,
  invoiceId: string,
  notes?: string
): Promise<void> {
  const supabase = await createClient();

  await supabase
    .from('downloaded_cfdis')
    .update({
      reconciled: true,
      invoice_id: invoiceId,
      reconciled_at: new Date().toISOString(),
      reconciliation_notes: notes,
      updated_at: new Date().toISOString(),
    })
    .eq('id', cfdiId);
}

/**
 * Updates invoice with CFDI UUID
 */
export async function linkInvoiceToCFDI(
  invoiceId: string,
  cfdiUUID: string,
  organizationId: string
): Promise<void> {
  const supabase = await createClient();

  await supabase
    .from('invoices')
    .update({
      uuid: cfdiUUID.toUpperCase(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', invoiceId)
    .eq('organization_id', organizationId);
}

/**
 * Gets unmatched CFDIs for an organization
 */
export async function getUnmatchedCFDIs(
  organizationId: string,
  options: {
    type?: CFDIDownloadType;
    limit?: number;
    offset?: number;
  } = {}
): Promise<any[]> {
  const supabase = await createClient();

  let query = supabase
    .from('downloaded_cfdis')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('reconciled', false)
    .is('deleted_at', null)
    .order('fecha_emision', { ascending: false });

  if (options.type) {
    query = query.eq('type', options.type);
  }

  if (options.limit) {
    query = query.limit(options.limit);
  }

  if (options.offset) {
    query = query.range(options.offset, options.offset + (options.limit || 20) - 1);
  }

  const { data } = await query;
  return data || [];
}

/**
 * Gets invoices without CFDI UUID
 */
export async function getInvoicesWithoutCFDI(
  organizationId: string,
  options: {
    status?: string;
    limit?: number;
  } = {}
): Promise<Invoice[]> {
  const supabase = await createClient();

  let query = supabase
    .from('invoices')
    .select(`
      id,
      uuid,
      folio_number,
      customer_id,
      subtotal,
      tax,
      total,
      status,
      issued_at,
      customers (
        rfc,
        legal_name
      )
    `)
    .eq('organization_id', organizationId)
    .is('uuid', null)
    .is('deleted_at', null);

  if (options.status) {
    query = query.eq('status', options.status);
  }

  if (options.limit) {
    query = query.limit(options.limit);
  }

  const { data } = await query;
  return (data || []) as unknown as Invoice[];
}

// ============================================================================
// Batch Operations
// ============================================================================

/**
 * Processes and reconciles CFDIs from a downloaded package
 *
 * @param cfdis - Array of parsed CFDIs
 * @param organizationId - Organization UUID
 * @param type - CFDI type (issued/received)
 * @returns Processing results
 */
export async function processCFDIPackage(
  cfdis: ParsedCFDI[],
  organizationId: string,
  type: CFDIDownloadType
): Promise<{
  saved: number;
  reconciled: number;
  errors: string[];
}> {
  const supabase = await createClient();
  let saved = 0;
  let reconciled = 0;
  const errors: string[] = [];

  for (const cfdi of cfdis) {
    try {
      // Check if CFDI already exists
      const { data: existing } = await supabase
        .from('downloaded_cfdis')
        .select('id')
        .eq('uuid', cfdi.uuid)
        .eq('organization_id', organizationId)
        .single();

      if (existing) {
        continue; // Skip existing
      }

      // Save CFDI
      const { error: insertError } = await supabase
        .from('downloaded_cfdis')
        .insert({
          organization_id: organizationId,
          uuid: cfdi.uuid,
          type,
          xml_content: cfdi.xmlOriginal,
          parsed_data: cfdiToDBFormat(cfdi),
          emisor_rfc: cfdi.emisor.rfc,
          receptor_rfc: cfdi.receptor.rfc,
          fecha_emision: cfdi.fecha.toISOString(),
          fecha_timbrado: cfdi.timbreFiscal?.fechaTimbrado?.toISOString(),
          monto_total: cfdi.total,
          moneda: cfdi.moneda,
          tipo_comprobante: cfdi.tipoComprobante,
        });

      if (insertError) {
        errors.push(`Failed to save ${cfdi.uuid}: ${insertError.message}`);
        continue;
      }

      saved++;

      // Try to reconcile
      const result = await reconcileCFDI(cfdi.uuid, organizationId);
      if (result.matched) {
        reconciled++;
      }
    } catch (error) {
      errors.push(`Error processing ${cfdi.uuid}: ${error instanceof Error ? error.message : 'Unknown'}`);
    }
  }

  return { saved, reconciled, errors };
}

/**
 * Converts ParsedCFDI to database-safe format
 */
function cfdiToDBFormat(cfdi: ParsedCFDI): Record<string, any> {
  return {
    version: cfdi.version,
    uuid: cfdi.uuid,
    serie: cfdi.serie,
    folio: cfdi.folio,
    fecha: cfdi.fecha.toISOString(),
    tipoComprobante: cfdi.tipoComprobante,
    metodoPago: cfdi.metodoPago,
    formaPago: cfdi.formaPago,
    lugarExpedicion: cfdi.lugarExpedicion,
    subTotal: cfdi.subTotal,
    descuento: cfdi.descuento,
    total: cfdi.total,
    moneda: cfdi.moneda,
    tipoCambio: cfdi.tipoCambio,
    emisor: cfdi.emisor,
    receptor: cfdi.receptor,
    conceptos: cfdi.conceptos,
    impuestos: cfdi.impuestos,
    timbreFiscal: cfdi.timbreFiscal ? {
      ...cfdi.timbreFiscal,
      fechaTimbrado: cfdi.timbreFiscal.fechaTimbrado.toISOString(),
    } : null,
  };
}
