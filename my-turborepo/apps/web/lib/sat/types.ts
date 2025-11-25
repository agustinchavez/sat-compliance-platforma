import { z } from 'zod';

// =====================================================
// FIEL / E.firma Types
// =====================================================

export interface FIELCredentials {
  certificate: Buffer;      // .cer file (public key)
  privateKey: Buffer;       // .key file (encrypted private key)
  password: string;         // Password to decrypt private key
  rfc: string;             // Organization RFC
}

export interface FIELInfo {
  serialNumber: string;
  issuer: string;
  subject: string;
  validFrom: Date;
  validTo: Date;
  isValid: boolean;
  daysUntilExpiry: number;
}

export interface DecryptedFIEL {
  certificate: Buffer;
  privateKey: Buffer;       // Decrypted private key
  certificatePem: string;
  privateKeyPem: string;
  info: FIELInfo;
}

// =====================================================
// SAT Authentication Types
// =====================================================

export interface SATAuthToken {
  token: string;
  expiresAt: Date;
  issuedAt: Date;
  organizationId: string;
  rfc: string;
}

export interface SATAuthRequest {
  rfc: string;
  certificate: string;      // Base64 encoded
  signature: string;        // Base64 encoded signature
}

export interface SATAuthResponse {
  success: boolean;
  token?: string;
  expiresAt?: Date;
  error?: SATError;
}

// =====================================================
// SOAP Types
// =====================================================

export interface SOAPRequest {
  endpoint: string;
  action: string;
  body: string;             // XML body
  headers?: Record<string, string>;
}

export interface SOAPResponse {
  success: boolean;
  data?: any;
  xml?: string;
  error?: SATError;
}

export interface SOAPEnvelope {
  header?: Record<string, any>;
  body: Record<string, any>;
}

// =====================================================
// CFDI Download Types
// =====================================================

export type CFDIDownloadType = 'issued' | 'received';
export type CFDIRequestType = 'CFDI' | 'Metadata';
export type CFDIDownloadStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'expired';

export interface CFDIDownloadRequest {
  organizationId: string;
  type: CFDIDownloadType;
  dateStart: Date;
  dateEnd: Date;
  requestType?: CFDIRequestType;
  rfcEmitter?: string;      // Optional filter
  rfcReceiver?: string;     // Optional filter
}

export interface CFDIDownloadResponse {
  requestId: string;
  status: CFDIDownloadStatus;
  satRequestId?: string;
  message?: string;
  error?: SATError;
}

export interface CFDIDownloadStatusResponse {
  requestId: string;
  status: CFDIDownloadStatus;
  statusCode?: number;
  statusMessage?: string;
  packageIds?: string[];
  totalPackages?: number;
  error?: SATError;
}

export interface CFDIPackage {
  packageId: string;
  zipFile: Buffer;
  cfdis: ParsedCFDI[];
  metadata: {
    downloadedAt: Date;
    totalCFDIs: number;
    totalSize: number;
  };
}

// =====================================================
// CFDI Parsing Types
// =====================================================

export type CFDIVersion = '3.3' | '4.0';
export type TipoComprobante = 'I' | 'E' | 'T' | 'N' | 'P'; // Ingreso, Egreso, Traslado, Nomina, Pago

export interface ParsedCFDI {
  version: CFDIVersion;
  uuid: string;
  serie?: string;
  folio?: string;
  fecha: Date;
  tipoComprobante: TipoComprobante;
  metodoPago?: string;
  formaPago?: string;
  lugarExpedicion: string;
  subTotal: number;
  descuento?: number;
  total: number;
  moneda: string;
  tipoCambio?: number;
  emisor: CFDIEmisor;
  receptor: CFDIReceptor;
  conceptos: CFDIConcepto[];
  impuestos?: CFDIImpuestos;
  timbreFiscal: CFDITimbreFiscal;
  xmlOriginal: string;
}

export interface CFDIEmisor {
  rfc: string;
  nombre: string;
  regimenFiscal: string;
}

export interface CFDIReceptor {
  rfc: string;
  nombre: string;
  usoCFDI: string;
  regimenFiscalReceptor?: string;
  domicilioFiscalReceptor?: string;
  residenciaFiscal?: string;
  numRegIdTrib?: string;
}

export interface CFDIConcepto {
  claveProdServ: string;
  noIdentificacion?: string;
  cantidad: number;
  claveUnidad: string;
  unidad?: string;
  descripcion: string;
  valorUnitario: number;
  importe: number;
  descuento?: number;
  objetoImp?: string;
  impuestos?: {
    traslados?: CFDIImpuestoConcepto[];
    retenciones?: CFDIImpuestoConcepto[];
  };
}

export interface CFDIImpuestoConcepto {
  base: number;
  impuesto: string;
  tipoFactor: string;
  tasaOCuota?: number;
  importe: number;
}

export interface CFDIImpuestos {
  totalImpuestosRetenidos?: number;
  totalImpuestosTrasladados?: number;
  retenciones?: CFDIRetencion[];
  traslados?: CFDITraslado[];
}

export interface CFDIRetencion {
  impuesto: string;
  importe: number;
}

export interface CFDITraslado {
  base?: number;
  impuesto: string;
  tipoFactor: string;
  tasaOCuota?: number;
  importe: number;
}

export interface CFDITimbreFiscal {
  version: string;
  uuid: string;
  fechaTimbrado: Date;
  rfcProvCertif: string;
  selloCFD: string;
  noCertificadoSAT: string;
  selloSAT: string;
}

// =====================================================
// Reconciliation Types
// =====================================================

export interface ReconciliationResult {
  matched: boolean;
  cfdiId: string;
  invoiceId?: string;
  differences: ReconciliationDifference[];
  confidence: number;        // 0-100
}

export interface ReconciliationDifference {
  field: string;
  cfdiValue: any;
  invoiceValue: any;
  severity: 'low' | 'medium' | 'high';
}

export interface ReconciliationReport {
  organizationId: string;
  period: {
    start: Date;
    end: Date;
  };
  totalCFDIs: number;
  matchedCFDIs: number;
  unmatchedCFDIs: number;
  discrepancies: number;
  results: ReconciliationResult[];
}

// =====================================================
// SAT Error Types
// =====================================================

export class SATError extends Error {
  constructor(
    message: string,
    public code: string | number,
    public satCode?: number,
    public originalError?: any
  ) {
    super(message);
    this.name = 'SATError';
  }
}

export class SATAuthenticationError extends SATError {
  constructor(message: string, satCode?: number, originalError?: any) {
    super(message, 'SAT_AUTH_ERROR', satCode, originalError);
    this.name = 'SATAuthenticationError';
  }
}

export class SATCertificateError extends SATError {
  constructor(message: string, originalError?: any) {
    super(message, 'SAT_CERT_ERROR', undefined, originalError);
    this.name = 'SATCertificateError';
  }
}

export class SATSOAPError extends SATError {
  constructor(message: string, code: string | number = 'SAT_SOAP_ERROR', satCode?: number, originalError?: any) {
    super(message, code, satCode, originalError);
    this.name = 'SATSOAPError';
  }
}

export class SATRateLimitError extends SATError {
  constructor(message: string, public resetAt: Date) {
    super(message, 'SAT_RATE_LIMIT', 5002);
    this.name = 'SATRateLimitError';
  }
}

// =====================================================
// SAT Request Tracking Types
// =====================================================

export type SATRequestType = 'authentication' | 'cfdi_download' | 'cfdi_verification' | 'cfdi_package_download';
export type SATRequestStatus = 'pending' | 'processing' | 'completed' | 'failed';

export interface SATRequestLog {
  id: string;
  organizationId: string;
  requestType: SATRequestType;
  requestData: Record<string, any>;
  responseData?: Record<string, any>;
  status: SATRequestStatus;
  satRequestId?: string;
  errorMessage?: string;
  createdAt: Date;
  completedAt?: Date;
}

// =====================================================
// Downloaded CFDI Storage Types
// =====================================================

export interface DownloadedCFDI {
  id: string;
  organizationId: string;
  uuid: string;
  type: CFDIDownloadType;
  xmlContent: string;
  parsedData: ParsedCFDI;
  storagePath?: string;
  downloadedAt: Date;
  reconciled: boolean;
  invoiceId?: string;
}

// =====================================================
// Cache Types
// =====================================================

export interface CacheEntry<T> {
  value: T;
  expiresAt: Date;
}

// =====================================================
// Zod Schemas for Validation
// =====================================================

export const CFDIDownloadRequestSchema = z.object({
  organizationId: z.string().uuid(),
  type: z.enum(['issued', 'received']),
  dateStart: z.date(),
  dateEnd: z.date(),
  requestType: z.enum(['CFDI', 'Metadata']).optional(),
  rfcEmitter: z.string().regex(/^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/).optional(),
  rfcReceiver: z.string().regex(/^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/).optional(),
}).refine(
  (data) => data.dateEnd >= data.dateStart,
  { message: "End date must be after start date" }
);

export const ParsedCFDISchema = z.object({
  version: z.enum(['3.3', '4.0']),
  uuid: z.string().uuid(),
  serie: z.string().optional(),
  folio: z.string().optional(),
  fecha: z.date(),
  tipoComprobante: z.enum(['I', 'E', 'T', 'N', 'P']),
  total: z.number(),
  emisor: z.object({
    rfc: z.string(),
    nombre: z.string(),
    regimenFiscal: z.string(),
  }),
  receptor: z.object({
    rfc: z.string(),
    nombre: z.string(),
    usoCFDI: z.string(),
  }),
});

// =====================================================
// Configuration Types
// =====================================================

export interface SATConfig {
  endpoints: {
    authentication: string;
    solicitud: string;
    verificacion: string;
    descarga: string;
  };
  timeout: number;
  maxRetries: number;
  rateLimitPerDay: number;
}

export const SAT_ENDPOINTS = {
  authentication: "https://cfdidescargamasivasolicitud.clouda.sat.gob.mx/Autenticacion/Autenticacion.svc",
  solicitud: "https://cfdidescargamasivasolicitud.clouda.sat.gob.mx/SolicitaDescargaService.svc",
  verificacion: "https://cfdidescargamasiva.clouda.sat.gob.mx/VerificaSolicitudDescargaService.svc",
  descarga: "https://cfdidescargamasiva.clouda.sat.gob.mx/DescargaMasivaTercerosService.svc",
} as const;
