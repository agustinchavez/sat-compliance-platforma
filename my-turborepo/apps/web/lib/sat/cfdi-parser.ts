/**
 * CFDI Parser Service
 *
 * This file handles parsing CFDI (Comprobante Fiscal Digital por Internet)
 * XML documents, which are Mexican electronic invoices.
 *
 * Supported versions:
 * - CFDI 3.3 (legacy, still valid)
 * - CFDI 4.0 (current version as of 2022)
 *
 * Key features:
 * - Parse CFDI XML into structured TypeScript objects
 * - Extract emisor, receptor, conceptos, impuestos
 * - Extract UUID and timbre fiscal (digital stamp)
 * - Validate CFDI XML structure
 * - Support multiple CFDI complements
 */

import { XMLParser } from 'fast-xml-parser';
import { z } from 'zod';
import type {
  ParsedCFDI,
  CFDIVersion,
  TipoComprobante,
  CFDIEmisor,
  CFDIReceptor,
  CFDIConcepto,
  CFDIImpuestos,
  CFDITimbreFiscal,
  CFDITraslado,
  CFDIRetencion,
  CFDIImpuestoConcepto,
} from './types';
import { SATError } from './types';

// ============================================================================
// Configuration
// ============================================================================

const XML_PARSER_OPTIONS = {
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  textNodeName: '#text',
  parseAttributeValue: true,
  trimValues: true,
  numberParseOptions: {
    leadingZeros: false,
    hex: false,
    skipLike: /^\d{4}-\d{2}-\d{2}/, // Don't parse dates as numbers
  },
};

// CFDI XML Namespaces
const CFDI_NAMESPACES = {
  cfdi33: 'http://www.sat.gob.mx/cfd/3',
  cfdi40: 'http://www.sat.gob.mx/cfd/4',
  tfd: 'http://www.sat.gob.mx/TimbreFiscalDigital',
};

// ============================================================================
// XML Parser
// ============================================================================

const xmlParser = new XMLParser(XML_PARSER_OPTIONS);

// ============================================================================
// Main Parser Functions
// ============================================================================

/**
 * Parses a CFDI XML string into a structured object
 *
 * @param xml - CFDI XML string
 * @returns Parsed CFDI object
 * @throws SATError if XML is invalid or cannot be parsed
 *
 * @example
 * ```ts
 * const cfdi = await parseCFDI(xmlString);
 * console.log('UUID:', cfdi.uuid);
 * console.log('Emisor:', cfdi.emisor.nombre);
 * console.log('Total:', cfdi.total);
 * ```
 */
export async function parseCFDI(xml: string): Promise<ParsedCFDI> {
  try {
    // Parse XML
    const parsed = xmlParser.parse(xml);

    // Find comprobante element (handles different namespace prefixes)
    const comprobante = findComprobanteElement(parsed);

    if (!comprobante) {
      throw new SATError('Invalid CFDI: No Comprobante element found', 'PARSE_ERROR');
    }

    // Determine CFDI version
    const version = parseVersion(comprobante['@_Version']);

    // Parse all components
    const emisor = parseEmisor(comprobante);
    const receptor = parseReceptor(comprobante);
    const conceptos = parseConceptos(comprobante);
    const impuestos = parseImpuestos(comprobante);
    const timbreFiscal = parseTimbreFiscal(comprobante);

    // Build parsed CFDI
    const cfdi: ParsedCFDI = {
      version,
      uuid: timbreFiscal?.uuid || '',
      serie: comprobante['@_Serie'] || undefined,
      folio: comprobante['@_Folio'] || undefined,
      fecha: parseDate(comprobante['@_Fecha']),
      tipoComprobante: parseTipoComprobante(comprobante['@_TipoDeComprobante']),
      metodoPago: comprobante['@_MetodoPago'] || undefined,
      formaPago: comprobante['@_FormaPago'] || undefined,
      lugarExpedicion: comprobante['@_LugarExpedicion'] || '',
      subTotal: parseNumber(comprobante['@_SubTotal']),
      descuento: comprobante['@_Descuento'] ? parseNumber(comprobante['@_Descuento']) : undefined,
      total: parseNumber(comprobante['@_Total']),
      moneda: comprobante['@_Moneda'] || 'MXN',
      tipoCambio: comprobante['@_TipoCambio'] ? parseNumber(comprobante['@_TipoCambio']) : undefined,
      emisor,
      receptor,
      conceptos,
      impuestos,
      timbreFiscal: timbreFiscal!,
      xmlOriginal: xml,
    };

    return cfdi;
  } catch (error) {
    if (error instanceof SATError) {
      throw error;
    }
    throw new SATError(
      `Failed to parse CFDI: ${error instanceof Error ? error.message : 'Unknown error'}`,
      'PARSE_ERROR'
    );
  }
}

/**
 * Parses multiple CFDIs from a ZIP buffer
 *
 * @param zipBuffer - ZIP file buffer containing CFDI XMLs
 * @returns Array of parsed CFDIs
 *
 * @example
 * ```ts
 * const cfdis = await parseCFDIsFromZip(zipBuffer);
 * console.log(`Parsed ${cfdis.length} CFDIs`);
 * ```
 */
export async function parseCFDIsFromZip(zipBuffer: Buffer): Promise<ParsedCFDI[]> {
  // Dynamic import to handle server-side only usage
  const AdmZip = (await import('adm-zip')).default;

  const zip = new AdmZip(zipBuffer);
  const entries = zip.getEntries();
  const cfdis: ParsedCFDI[] = [];

  for (const entry of entries) {
    if (entry.name.toLowerCase().endsWith('.xml')) {
      try {
        const xmlContent = entry.getData().toString('utf-8');
        const cfdi = await parseCFDI(xmlContent);
        cfdis.push(cfdi);
      } catch (error) {
        console.error(`Failed to parse ${entry.name}:`, error);
        // Continue processing other files
      }
    }
  }

  return cfdis;
}

/**
 * Extracts only the UUID from a CFDI XML
 *
 * This is a fast extraction method when you only need the UUID.
 *
 * @param xml - CFDI XML string
 * @returns UUID or null if not found
 */
export function extractUUID(xml: string): string | null {
  // Try regex first for performance
  const uuidMatch = xml.match(/UUID="([^"]+)"/i);
  if (uuidMatch && uuidMatch[1]) {
    return uuidMatch[1].toUpperCase();
  }

  // Fallback to full parsing
  try {
    const parsed = xmlParser.parse(xml);
    const comprobante = findComprobanteElement(parsed);
    const timbre = parseTimbreFiscal(comprobante);
    return timbre?.uuid || null;
  } catch {
    return null;
  }
}

/**
 * Validates CFDI XML structure
 *
 * @param xml - CFDI XML string
 * @returns Validation result
 */
export function validateCFDIStructure(xml: string): {
  isValid: boolean;
  version: CFDIVersion | null;
  hasTimbre: boolean;
  errors: string[];
} {
  const errors: string[] = [];
  let version: CFDIVersion | null = null;
  let hasTimbre = false;

  try {
    const parsed = xmlParser.parse(xml);
    const comprobante = findComprobanteElement(parsed);

    if (!comprobante) {
      errors.push('Missing Comprobante element');
      return { isValid: false, version: null, hasTimbre: false, errors };
    }

    // Check version (handle both string and numeric values from XML parser)
    const versionAttr = comprobante['@_Version'];
    const versionStr = String(versionAttr);
    // XML parser may parse "4.0" as 4 (number), so check for both
    if (versionStr === '3.3' || versionStr === '4.0' || versionAttr === 4) {
      version = versionAttr === 4 ? '4.0' : versionStr as CFDIVersion;
    } else {
      errors.push(`Unsupported CFDI version: ${versionAttr}`);
    }

    // Check required attributes
    const requiredAttrs = ['@_Fecha', '@_Total', '@_TipoDeComprobante', '@_LugarExpedicion'];
    for (const attr of requiredAttrs) {
      if (!comprobante[attr]) {
        errors.push(`Missing required attribute: ${attr.replace('@_', '')}`);
      }
    }

    // Check Emisor
    const emisorElement = findElement(comprobante, 'Emisor');
    if (!emisorElement) {
      errors.push('Missing Emisor element');
    } else {
      if (!emisorElement['@_Rfc']) errors.push('Missing Emisor RFC');
      if (!emisorElement['@_Nombre']) errors.push('Missing Emisor Nombre');
    }

    // Check Receptor
    const receptorElement = findElement(comprobante, 'Receptor');
    if (!receptorElement) {
      errors.push('Missing Receptor element');
    } else {
      if (!receptorElement['@_Rfc']) errors.push('Missing Receptor RFC');
      if (!receptorElement['@_Nombre']) errors.push('Missing Receptor Nombre');
    }

    // Check Conceptos
    const conceptosElement = findElement(comprobante, 'Conceptos');
    if (!conceptosElement) {
      errors.push('Missing Conceptos element');
    }

    // Check TimbreFiscalDigital
    const timbre = parseTimbreFiscal(comprobante);
    hasTimbre = timbre !== null && !!timbre.uuid;
    if (!hasTimbre) {
      errors.push('Missing or invalid TimbreFiscalDigital');
    }
  } catch (error) {
    errors.push(`XML parsing error: ${error instanceof Error ? error.message : 'Unknown'}`);
  }

  return {
    isValid: errors.length === 0,
    version,
    hasTimbre,
    errors,
  };
}

// ============================================================================
// Component Parsers
// ============================================================================

/**
 * Parses Emisor element
 */
function parseEmisor(comprobante: any): CFDIEmisor {
  const emisor = findElement(comprobante, 'Emisor');

  if (!emisor) {
    throw new SATError('Missing Emisor element', 'PARSE_ERROR');
  }

  return {
    rfc: emisor['@_Rfc'] || '',
    nombre: emisor['@_Nombre'] || '',
    regimenFiscal: emisor['@_RegimenFiscal'] || '',
  };
}

/**
 * Parses Receptor element
 */
function parseReceptor(comprobante: any): CFDIReceptor {
  const receptor = findElement(comprobante, 'Receptor');

  if (!receptor) {
    throw new SATError('Missing Receptor element', 'PARSE_ERROR');
  }

  return {
    rfc: receptor['@_Rfc'] || '',
    nombre: receptor['@_Nombre'] || '',
    usoCFDI: receptor['@_UsoCFDI'] || '',
    regimenFiscalReceptor: receptor['@_RegimenFiscalReceptor'] || undefined,
    domicilioFiscalReceptor: receptor['@_DomicilioFiscalReceptor'] || undefined,
    residenciaFiscal: receptor['@_ResidenciaFiscal'] || undefined,
    numRegIdTrib: receptor['@_NumRegIdTrib'] || undefined,
  };
}

/**
 * Parses Conceptos element
 */
function parseConceptos(comprobante: any): CFDIConcepto[] {
  const conceptosElement = findElement(comprobante, 'Conceptos');

  if (!conceptosElement) {
    return [];
  }

  const conceptoArray = findElementArray(conceptosElement, 'Concepto');

  return conceptoArray.map((concepto: any) => {
    const impuestos = parseConceptoImpuestos(concepto);

    return {
      claveProdServ: concepto['@_ClaveProdServ'] || '',
      noIdentificacion: concepto['@_NoIdentificacion'] || undefined,
      cantidad: parseNumber(concepto['@_Cantidad']),
      claveUnidad: concepto['@_ClaveUnidad'] || '',
      unidad: concepto['@_Unidad'] || undefined,
      descripcion: concepto['@_Descripcion'] || '',
      valorUnitario: parseNumber(concepto['@_ValorUnitario']),
      importe: parseNumber(concepto['@_Importe']),
      descuento: concepto['@_Descuento'] ? parseNumber(concepto['@_Descuento']) : undefined,
      objetoImp: concepto['@_ObjetoImp'] || undefined,
      impuestos,
    };
  });
}

/**
 * Parses concept-level taxes
 */
function parseConceptoImpuestos(concepto: any): CFDIConcepto['impuestos'] | undefined {
  const impuestosElement = findElement(concepto, 'Impuestos');

  if (!impuestosElement) {
    return undefined;
  }

  const traslados: CFDIImpuestoConcepto[] = [];
  const retenciones: CFDIImpuestoConcepto[] = [];

  // Parse Traslados
  const trasladosElement = findElement(impuestosElement, 'Traslados');
  if (trasladosElement) {
    const trasladoArray = findElementArray(trasladosElement, 'Traslado');
    for (const traslado of trasladoArray) {
      traslados.push({
        base: parseNumber(traslado['@_Base']),
        impuesto: traslado['@_Impuesto'] || '',
        tipoFactor: traslado['@_TipoFactor'] || '',
        tasaOCuota: traslado['@_TasaOCuota'] ? parseNumber(traslado['@_TasaOCuota']) : undefined,
        importe: parseNumber(traslado['@_Importe']),
      });
    }
  }

  // Parse Retenciones
  const retencionesElement = findElement(impuestosElement, 'Retenciones');
  if (retencionesElement) {
    const retencionArray = findElementArray(retencionesElement, 'Retencion');
    for (const retencion of retencionArray) {
      retenciones.push({
        base: parseNumber(retencion['@_Base']),
        impuesto: retencion['@_Impuesto'] || '',
        tipoFactor: retencion['@_TipoFactor'] || '',
        tasaOCuota: retencion['@_TasaOCuota'] ? parseNumber(retencion['@_TasaOCuota']) : undefined,
        importe: parseNumber(retencion['@_Importe']),
      });
    }
  }

  if (traslados.length === 0 && retenciones.length === 0) {
    return undefined;
  }

  return {
    traslados: traslados.length > 0 ? traslados : undefined,
    retenciones: retenciones.length > 0 ? retenciones : undefined,
  };
}

/**
 * Parses Impuestos element (document-level taxes)
 */
function parseImpuestos(comprobante: any): CFDIImpuestos | undefined {
  const impuestosElement = findElement(comprobante, 'Impuestos');

  if (!impuestosElement) {
    return undefined;
  }

  const impuestos: CFDIImpuestos = {};

  // Total retained taxes
  if (impuestosElement['@_TotalImpuestosRetenidos']) {
    impuestos.totalImpuestosRetenidos = parseNumber(impuestosElement['@_TotalImpuestosRetenidos']);
  }

  // Total transferred taxes
  if (impuestosElement['@_TotalImpuestosTrasladados']) {
    impuestos.totalImpuestosTrasladados = parseNumber(impuestosElement['@_TotalImpuestosTrasladados']);
  }

  // Parse Retenciones
  const retencionesElement = findElement(impuestosElement, 'Retenciones');
  if (retencionesElement) {
    const retencionArray = findElementArray(retencionesElement, 'Retencion');
    impuestos.retenciones = retencionArray.map((r: any) => ({
      impuesto: r['@_Impuesto'] || '',
      importe: parseNumber(r['@_Importe']),
    }));
  }

  // Parse Traslados
  const trasladosElement = findElement(impuestosElement, 'Traslados');
  if (trasladosElement) {
    const trasladoArray = findElementArray(trasladosElement, 'Traslado');
    impuestos.traslados = trasladoArray.map((t: any) => ({
      base: t['@_Base'] ? parseNumber(t['@_Base']) : undefined,
      impuesto: t['@_Impuesto'] || '',
      tipoFactor: t['@_TipoFactor'] || '',
      tasaOCuota: t['@_TasaOCuota'] ? parseNumber(t['@_TasaOCuota']) : undefined,
      importe: parseNumber(t['@_Importe']),
    }));
  }

  return impuestos;
}

/**
 * Parses TimbreFiscalDigital complement
 */
function parseTimbreFiscal(comprobante: any): CFDITimbreFiscal | null {
  // Find Complemento element
  const complemento = findElement(comprobante, 'Complemento');

  if (!complemento) {
    return null;
  }

  // Find TimbreFiscalDigital within Complemento
  const timbre = findElement(complemento, 'TimbreFiscalDigital');

  if (!timbre) {
    return null;
  }

  return {
    version: timbre['@_Version'] || '1.1',
    uuid: (timbre['@_UUID'] || '').toUpperCase(),
    fechaTimbrado: parseDate(timbre['@_FechaTimbrado']),
    rfcProvCertif: timbre['@_RfcProvCertif'] || '',
    selloCFD: timbre['@_SelloCFD'] || '',
    noCertificadoSAT: timbre['@_NoCertificadoSAT'] || '',
    selloSAT: timbre['@_SelloSAT'] || '',
  };
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Finds the Comprobante element in parsed XML
 */
function findComprobanteElement(parsed: any): any | null {
  // Check for different namespace prefixes
  const possibleKeys = [
    'cfdi:Comprobante',
    'Comprobante',
    'tfd:Comprobante',
  ];

  for (const key of possibleKeys) {
    if (parsed[key]) {
      return parsed[key];
    }
  }

  // Search nested
  for (const key of Object.keys(parsed)) {
    if (key.includes('Comprobante')) {
      return parsed[key];
    }
    if (typeof parsed[key] === 'object' && parsed[key]) {
      const nested = findComprobanteElement(parsed[key]);
      if (nested) return nested;
    }
  }

  return null;
}

/**
 * Finds an element with various namespace prefixes
 */
function findElement(parent: any, elementName: string): any | null {
  if (!parent || typeof parent !== 'object') {
    return null;
  }

  const possibleKeys = [
    `cfdi:${elementName}`,
    `tfd:${elementName}`,
    elementName,
  ];

  for (const key of possibleKeys) {
    if (parent[key]) {
      return parent[key];
    }
  }

  // Search in keys containing the element name
  for (const key of Object.keys(parent)) {
    if (key.endsWith(`:${elementName}`) || key === elementName) {
      return parent[key];
    }
  }

  return null;
}

/**
 * Finds an element and ensures it's an array
 */
function findElementArray(parent: any, elementName: string): any[] {
  const element = findElement(parent, elementName);

  if (!element) {
    return [];
  }

  if (Array.isArray(element)) {
    return element;
  }

  return [element];
}

/**
 * Parses CFDI version string
 */
function parseVersion(version: string): CFDIVersion {
  if (version === '3.3') return '3.3';
  if (version === '4.0') return '4.0';
  // Default to 4.0 for unknown versions
  console.warn(`Unknown CFDI version: ${version}, defaulting to 4.0`);
  return '4.0';
}

/**
 * Parses tipo de comprobante
 */
function parseTipoComprobante(tipo: string): TipoComprobante {
  const validTypes: TipoComprobante[] = ['I', 'E', 'T', 'N', 'P'];
  if (validTypes.includes(tipo as TipoComprobante)) {
    return tipo as TipoComprobante;
  }
  return 'I'; // Default to Ingreso
}

/**
 * Parses a number from string or number
 */
function parseNumber(value: any): number {
  if (typeof value === 'number') {
    return value;
  }
  if (typeof value === 'string') {
    const parsed = parseFloat(value);
    return isNaN(parsed) ? 0 : parsed;
  }
  return 0;
}

/**
 * Parses a date from string
 */
function parseDate(dateStr: string): Date {
  if (!dateStr) {
    return new Date();
  }
  const date = new Date(dateStr);
  return isNaN(date.getTime()) ? new Date() : date;
}

// ============================================================================
// Export Helpers
// ============================================================================

/**
 * Converts parsed CFDI to JSON-safe format (for database storage)
 */
export function cfdiToJSON(cfdi: ParsedCFDI): Record<string, any> {
  return {
    ...cfdi,
    fecha: cfdi.fecha.toISOString(),
    timbreFiscal: cfdi.timbreFiscal ? {
      ...cfdi.timbreFiscal,
      fechaTimbrado: cfdi.timbreFiscal.fechaTimbrado.toISOString(),
    } : null,
    xmlOriginal: undefined, // Don't include full XML in JSON
  };
}

/**
 * Gets CFDI summary for display
 */
export function getCFDISummary(cfdi: ParsedCFDI): {
  uuid: string;
  fecha: string;
  emisor: string;
  receptor: string;
  total: string;
  tipo: string;
} {
  return {
    uuid: cfdi.uuid,
    fecha: cfdi.fecha.toLocaleDateString('es-MX'),
    emisor: `${cfdi.emisor.rfc} - ${cfdi.emisor.nombre}`,
    receptor: `${cfdi.receptor.rfc} - ${cfdi.receptor.nombre}`,
    total: `$${cfdi.total.toLocaleString('es-MX', { minimumFractionDigits: 2 })} ${cfdi.moneda}`,
    tipo: getTipoComprobanteLabel(cfdi.tipoComprobante),
  };
}

/**
 * Gets human-readable label for tipo de comprobante
 */
function getTipoComprobanteLabel(tipo: TipoComprobante): string {
  const labels: Record<TipoComprobante, string> = {
    I: 'Ingreso',
    E: 'Egreso',
    T: 'Traslado',
    N: 'Nómina',
    P: 'Pago',
  };
  return labels[tipo] || tipo;
}
