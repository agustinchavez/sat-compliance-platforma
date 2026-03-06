/**
 * Impuestos Aggregation
 *
 * Aggregates item-level tax breakdown records into the
 * Comprobante-level cfdi:Impuestos summary node.
 *
 * SAT Rule (Anexo 20 v4.0):
 * - Traslados are grouped by (Impuesto, TipoFactor, TasaOCuota)
 * - Base per group = sum of all item Base values for that group
 * - Importe per group = sum of all item Importe values for that group
 * - Retenciones are grouped by (Impuesto) only
 * - TotalImpuestosTrasladados = sum of all Traslado Importe
 *   (only emitted when at least one Traslado has TipoFactor != "Exento")
 * - TotalImpuestosRetenidos = sum of all Retencion Importe
 */

import Decimal from 'decimal.js';

// Configure Decimal.js for CFDI precision
Decimal.set({ precision: 20, rounding: Decimal.ROUND_HALF_UP });

// ============================================
// TYPES
// ============================================

export interface TaxRecord {
  type: 'traslado' | 'retencion';
  impuesto: string;
  tipo_factor: string;
  tasa_o_cuota?: string;
  base: string;
  importe?: string;
}

export interface AggregatedTraslado {
  base: string;
  impuesto: string;
  tipoFactor: string;
  tasaOCuota?: string;
  importe?: string;
}

export interface AggregatedRetencion {
  impuesto: string;
  importe: string;
}

export interface AggregatedImpuestos {
  totalImpuestosRetenidos?: string;
  totalImpuestosTrasladados?: string;
  retenciones: AggregatedRetencion[];
  traslados: AggregatedTraslado[];
}

// ============================================
// DECIMAL FORMATTING
// ============================================

/**
 * Format a number to exactly 6 decimal places using Decimal.js.
 * Used for all amounts in Conceptos and Impuestos nodes.
 * e.g., 10000 -> "10000.000000"
 *       0.16  -> "0.160000"
 */
export function formatDecimal6(value: Decimal | number | string): string {
  const d = new Decimal(value);
  return d.toFixed(6);
}

/**
 * Format a number to exactly 2 decimal places using Decimal.js.
 * Used for SubTotal, Total, Descuento at Comprobante level.
 * e.g., 10000 -> "10000.00"
 */
export function formatDecimal2(value: Decimal | number | string): string {
  const d = new Decimal(value);
  return d.toFixed(2);
}

// ============================================
// AGGREGATION FUNCTIONS
// ============================================

/**
 * Aggregate item-level tax records into Comprobante-level summary.
 *
 * Implementation notes:
 *
 * 1. Filter traslados vs retenciones.
 *
 * 2. For Traslados:
 *    - Group by composite key: `${impuesto}|${tipo_factor}|${tasa_o_cuota ?? ''}`
 *    - Sum Base and Importe per group using Decimal.js (6 decimal places)
 *    - When TipoFactor=Exento: include Base, exclude TasaOCuota and Importe
 *
 * 3. For Retenciones:
 *    - Group by Impuesto only
 *    - Sum Importe per group
 *
 * 4. TotalImpuestosTrasladados:
 *    - Only emit when at least one Traslado has TipoFactor = "Tasa"
 *    - Value = sum of all Tasa group Importe values
 *    - Format to 6 decimal places
 *
 * 5. TotalImpuestosRetenidos:
 *    - Only emit when retenciones exist
 *    - Value = sum of all Retencion Importe values
 *
 * All arithmetic uses Decimal.js with ROUND_HALF_UP.
 * All output amounts formatted to 6 decimal places.
 */
export function aggregateImpuestos(taxRecords: TaxRecord[]): AggregatedImpuestos {
  // Separate traslados and retenciones
  const traslados = taxRecords.filter((r) => r.type === 'traslado');
  const retenciones = taxRecords.filter((r) => r.type === 'retencion');

  // Group traslados by (Impuesto, TipoFactor, TasaOCuota)
  const trasladoGroups = new Map<
    string,
    {
      impuesto: string;
      tipoFactor: string;
      tasaOCuota?: string;
      base: Decimal;
      importe: Decimal;
    }
  >();

  for (const t of traslados) {
    const key = `${t.impuesto}|${t.tipo_factor}|${t.tasa_o_cuota ?? ''}`;

    if (!trasladoGroups.has(key)) {
      trasladoGroups.set(key, {
        impuesto: t.impuesto,
        tipoFactor: t.tipo_factor,
        tasaOCuota: t.tasa_o_cuota,
        base: new Decimal(0),
        importe: new Decimal(0),
      });
    }

    const group = trasladoGroups.get(key)!;
    group.base = group.base.plus(t.base);

    // Only add importe if it exists (not for Exento)
    if (t.importe !== undefined) {
      group.importe = group.importe.plus(t.importe);
    }
  }

  // Group retenciones by Impuesto only
  const retencionGroups = new Map<
    string,
    {
      impuesto: string;
      importe: Decimal;
    }
  >();

  for (const r of retenciones) {
    const key = r.impuesto;

    if (!retencionGroups.has(key)) {
      retencionGroups.set(key, {
        impuesto: r.impuesto,
        importe: new Decimal(0),
      });
    }

    const group = retencionGroups.get(key)!;
    if (r.importe !== undefined) {
      group.importe = group.importe.plus(r.importe);
    }
  }

  // Build aggregated traslados array
  const aggregatedTraslados: AggregatedTraslado[] = [];
  let totalTrasladosTasa = new Decimal(0);
  let hasTasaTraslados = false;

  for (const group of trasladoGroups.values()) {
    const traslado: AggregatedTraslado = {
      base: formatDecimal6(group.base),
      impuesto: group.impuesto,
      tipoFactor: group.tipoFactor,
    };

    if (group.tipoFactor === 'Tasa') {
      hasTasaTraslados = true;
      traslado.tasaOCuota = group.tasaOCuota;
      traslado.importe = formatDecimal6(group.importe);
      totalTrasladosTasa = totalTrasladosTasa.plus(group.importe);
    } else if (group.tipoFactor === 'Exento') {
      // Exento: include Base only, no TasaOCuota or Importe
    }

    aggregatedTraslados.push(traslado);
  }

  // Build aggregated retenciones array
  const aggregatedRetenciones: AggregatedRetencion[] = [];
  let totalRetenciones = new Decimal(0);

  for (const group of retencionGroups.values()) {
    aggregatedRetenciones.push({
      impuesto: group.impuesto,
      importe: formatDecimal6(group.importe),
    });
    totalRetenciones = totalRetenciones.plus(group.importe);
  }

  // Build result
  const result: AggregatedImpuestos = {
    retenciones: aggregatedRetenciones,
    traslados: aggregatedTraslados,
  };

  // TotalImpuestosTrasladados: only emit when at least one Tasa traslado exists
  if (hasTasaTraslados) {
    result.totalImpuestosTrasladados = formatDecimal6(totalTrasladosTasa);
  }

  // TotalImpuestosRetenidos: only emit when retenciones exist
  if (aggregatedRetenciones.length > 0) {
    result.totalImpuestosRetenidos = formatDecimal6(totalRetenciones);
  }

  return result;
}

/**
 * Collect all tax records from all invoice items.
 * Flattens the item-level tax_breakdown arrays into a single array.
 */
export function collectTaxRecords(items: Array<{ tax_breakdown: TaxRecord[] }>): TaxRecord[] {
  const records: TaxRecord[] = [];

  for (const item of items) {
    for (const tax of item.tax_breakdown) {
      records.push(tax);
    }
  }

  return records;
}
