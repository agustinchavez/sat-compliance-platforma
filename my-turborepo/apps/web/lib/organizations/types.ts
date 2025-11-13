/**
 * Organization Service Type Definitions
 *
 * This file contains all TypeScript interfaces and types for the organization
 * management system, including CFDI certificate management, PAC configuration,
 * and organization settings.
 */

// ============================================================================
// Organization Types
// ============================================================================

/**
 * Main Organization interface
 * Represents a company/organization in the SAT compliance platform
 */
export interface Organization {
  id: string;
  name: string;
  rfc: string;
  legal_name: string;
  tax_regime: string;
  email: string | null;
  phone: string | null;
  address: OrganizationAddress | null;

  // Fiscal Configuration
  cfdi_cert: Buffer | null;
  cfdi_key: Buffer | null;
  cfdi_password_hash: string | null;
  pac_provider: PACProvider | null;
  pac_credentials: EncryptedPACConfig | null;

  // Subscription Management
  plan: SubscriptionPlan;
  stripe_customer_id: string | null;
  subscription_status: SubscriptionStatus | null;
  subscription_id: string | null;
  trial_ends_at: Date | null;
  current_period_end: Date | null;

  // Settings
  settings: OrganizationSettings;

  // Metadata
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
}

/**
 * Organization Address (Mexican SAT Format)
 * Follows SAT's CFDI requirements for address structure
 */
export interface OrganizationAddress {
  street: string;                    // Calle
  exterior_number: string;            // Número exterior
  interior_number?: string;           // Número interior (optional)
  colony: string;                     // Colonia
  locality?: string;                  // Localidad (optional)
  municipality?: string;              // Municipio (optional)
  city: string;                       // Ciudad
  state: string;                      // Estado (2-letter code: "CDMX", "JAL", etc.)
  postal_code: string;                // Código postal (5 digits)
  country: string;                    // País (default: "México")
}

/**
 * Organization update payload
 * Used for updating organization details
 */
export interface OrganizationUpdateData {
  name?: string;
  legal_name?: string;
  email?: string;
  phone?: string;
  address?: OrganizationAddress;
  tax_regime?: string;
}

// ============================================================================
// Subscription Types
// ============================================================================

export type SubscriptionPlan = 'free' | 'basic' | 'professional' | 'enterprise';

export type SubscriptionStatus =
  | 'active'
  | 'trialing'
  | 'past_due'
  | 'canceled'
  | 'unpaid'
  | 'incomplete';

// ============================================================================
// CFDI Certificate Types
// ============================================================================

/**
 * Certificate files for upload
 * Contains the .cer and .key files along with the password
 */
export interface CertificateFiles {
  cerFile: Buffer;        // .cer file (public certificate)
  keyFile: Buffer;        // .key file (private key, password-protected)
  password: string;       // Password to decrypt .key file
}

/**
 * Certificate information extracted from .cer file
 * Contains metadata about the CFDI certificate
 */
export interface CertificateInfo {
  serialNumber: string;           // Número de serie (20 hex chars)
  rfc: string;                    // RFC from certificate (must match org RFC)
  validFrom: Date;                // Válido desde
  validTo: Date;                  // Válido hasta
  issuer: string;                 // Emisor (usually SAT)
  subject: string;                // Subject DN
  status: CertificateStatus;      // Current status
  daysUntilExpiry: number;        // Days remaining until expiry
}

/**
 * Certificate status enumeration
 */
export type CertificateStatus =
  | 'valid'           // Certificate is valid and not expiring soon
  | 'expiring_soon'   // Certificate expires within 30 days
  | 'expired'         // Certificate has expired
  | 'invalid'         // Certificate is invalid or corrupted
  | 'not_uploaded';   // No certificate uploaded yet

/**
 * Certificate upload result
 */
export interface CertificateUploadResult {
  success: boolean;
  certificateInfo?: CertificateInfo;
  error?: string;
  message: string;
}

/**
 * Certificate validation result
 */
export interface CertificateValidationResult {
  valid: boolean;
  errors: string[];
  certificateInfo?: CertificateInfo;
}

// ============================================================================
// PAC Provider Types
// ============================================================================

/**
 * Supported PAC providers
 */
export type PACProvider = 'finkok' | 'sw' | 'diverza' | 'facturaxion';

/**
 * PAC environment
 */
export type PACEnvironment = 'sandbox' | 'production';

/**
 * PAC test result
 */
export type PACTestResult = 'success' | 'failed' | 'not_tested';

/**
 * PAC configuration (plain text, before encryption)
 */
export interface PACConfig {
  provider: PACProvider;
  environment: PACEnvironment;
  credentials: PACCredentials;
  isActive: boolean;
  lastTested?: Date;
  lastTestResult?: PACTestResult;
}

/**
 * PAC credentials (provider-specific)
 * Different providers may have different credential structures
 */
export interface PACCredentials {
  username: string;
  password: string;
  // Provider-specific fields (e.g., API keys, tokens)
  [key: string]: any;
}

/**
 * Encrypted PAC configuration (stored in database)
 */
export interface EncryptedPACConfig {
  provider: PACProvider;
  environment: PACEnvironment;
  encryptedCredentials: string;    // AES-256-GCM encrypted JSON
  iv: string;                      // Initialization vector
  authTag: string;                 // Authentication tag for GCM
  isActive: boolean;
  lastTested?: Date;
  lastTestResult?: PACTestResult;
}

/**
 * PAC connection test result
 */
export interface PACConnectionTestResult {
  success: boolean;
  provider: PACProvider;
  environment: PACEnvironment;
  message: string;
  timestamp: Date;
  error?: string;
}

// ============================================================================
// Organization Settings Types
// ============================================================================

/**
 * Complete organization settings schema
 */
export interface OrganizationSettings {
  invoice: InvoiceSettings;
  notifications: NotificationSettings;
  ui: UISettings;
  advanced: AdvancedSettings;
  version?: number;  // Settings schema version for migrations
}

/**
 * Invoice default settings
 */
export interface InvoiceSettings {
  default_series: string;              // Default serie (e.g., "A", "B")
  default_folio_start: number;         // Starting folio number
  default_payment_terms: number;       // Payment terms in days (e.g., 30)
  default_payment_method: string;      // "PUE" (Pago en una sola exhibición) or "PPD" (Pago en parcialidades)
  default_payment_form: string;        // SAT payment form code (e.g., "01" = Efectivo, "03" = Transferencia)
  auto_send_email: boolean;            // Auto-send invoice email after creation
}

/**
 * Notification preferences
 */
export interface NotificationSettings {
  email_on_invoice_created: boolean;
  email_on_invoice_paid: boolean;
  email_on_payment_received: boolean;
  whatsapp_enabled: boolean;
  whatsapp_reminders: boolean;
  reminder_days_before: number;        // Days before due date to send reminder
  certificate_expiry_alerts: boolean;  // Alert when certificate is expiring
}

/**
 * UI preferences
 */
export interface UISettings {
  language: 'es' | 'en';
  timezone: string;                    // IANA timezone (e.g., "America/Mexico_City")
  theme: 'light' | 'dark' | 'system';
  date_format: string;                 // e.g., "DD/MM/YYYY"
  currency_format: string;             // e.g., "MXN"
}

/**
 * Advanced settings
 */
export interface AdvancedSettings {
  auto_backup: boolean;
  backup_frequency: 'daily' | 'weekly' | 'monthly';
  enable_audit_log: boolean;
  session_timeout: number;             // Session timeout in minutes
}

/**
 * Default settings factory
 */
export const DEFAULT_ORGANIZATION_SETTINGS: OrganizationSettings = {
  invoice: {
    default_series: 'A',
    default_folio_start: 1,
    default_payment_terms: 30,
    default_payment_method: 'PUE',
    default_payment_form: '03',  // Transferencia
    auto_send_email: true,
  },
  notifications: {
    email_on_invoice_created: true,
    email_on_invoice_paid: true,
    email_on_payment_received: true,
    whatsapp_enabled: false,
    whatsapp_reminders: false,
    reminder_days_before: 3,
    certificate_expiry_alerts: true,
  },
  ui: {
    language: 'es',
    timezone: 'America/Mexico_City',
    theme: 'system',
    date_format: 'DD/MM/YYYY',
    currency_format: 'MXN',
  },
  advanced: {
    auto_backup: false,
    backup_frequency: 'weekly',
    enable_audit_log: true,
    session_timeout: 60,
  },
  version: 1,
};

// ============================================================================
// Encryption Types
// ============================================================================

/**
 * Encrypted data structure
 */
export interface EncryptedData {
  encryptedData: string;    // Base64 encoded encrypted data
  iv: string;               // Initialization vector (Base64)
  authTag: string;          // Authentication tag for GCM (Base64)
}

/**
 * Encryption key version (for key rotation)
 */
export interface EncryptionKeyVersion {
  version: number;
  createdAt: Date;
  isActive: boolean;
}

// ============================================================================
// Storage Types
// ============================================================================

/**
 * Storage metadata for certificates
 */
export interface CertificateStorageMetadata {
  uploadedAt: Date;
  uploadedBy: string;         // User ID
  serialNumber: string;
  validFrom: Date;
  validTo: Date;
  rfc: string;
  fileSize: number;           // Size in bytes
  checksumCer?: string;       // SHA-256 checksum of .cer file
  checksumKey?: string;       // SHA-256 checksum of .key file
}

/**
 * Storage keys for certificate files
 */
export interface CertificateStorageKeys {
  certificateKey: string;     // S3/R2 key for .cer file
  privateKeyKey: string;      // S3/R2 key for .key file
  metadataKey: string;        // S3/R2 key for metadata.json
}

// ============================================================================
// Validation Types
// ============================================================================

/**
 * RFC validation result
 */
export interface RFCValidationResult {
  valid: boolean;
  type: 'legal_entity' | 'individual' | 'invalid';
  errors: string[];
}

/**
 * Address validation result
 */
export interface AddressValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * General validation result
 */
export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings?: string[];
}

// ============================================================================
// Organization Setup & Status Types
// ============================================================================

/**
 * Organization setup status
 * Used to check if organization is ready for invoice generation
 */
export interface OrganizationSetupStatus {
  isComplete: boolean;
  completionPercentage: number;
  missingSteps: string[];
  checks: {
    hasBasicInfo: boolean;
    hasCompleteAddress: boolean;
    hasCertificates: boolean;
    certificatesValid: boolean;
    hasPACConfig: boolean;
    pacConfigTested: boolean;
  };
}

/**
 * Organization statistics
 */
export interface OrganizationStats {
  totalInvoices: number;
  totalCustomers: number;
  totalRevenue: number;
  certificateExpiresIn: number | null;  // Days until certificate expires
  setupComplete: boolean;
}

// ============================================================================
// Audit Log Types
// ============================================================================

/**
 * Organization audit log entry
 */
export interface OrganizationAuditLog {
  id: string;
  organization_id: string;
  user_id: string;
  action: OrganizationAuditAction;
  entity_type: string;           // e.g., 'organization', 'certificate', 'pac_config'
  entity_id: string | null;
  changes: Record<string, any>; // Old and new values
  ip_address: string | null;
  user_agent: string | null;
  created_at: Date;
}

/**
 * Audit action types
 */
export type OrganizationAuditAction =
  | 'organization_created'
  | 'organization_updated'
  | 'organization_deleted'
  | 'organization_restored'
  | 'certificate_uploaded'
  | 'certificate_deleted'
  | 'pac_configured'
  | 'pac_tested'
  | 'pac_switched'
  | 'settings_updated';

// ============================================================================
// Error Types
// ============================================================================

/**
 * Organization service error
 */
export class OrganizationError extends Error {
  constructor(
    message: string,
    public code: OrganizationErrorCode,
    public details?: any
  ) {
    super(message);
    this.name = 'OrganizationError';
  }
}

/**
 * Error codes for organization operations
 */
export type OrganizationErrorCode =
  | 'ORG_NOT_FOUND'
  | 'ORG_DELETED'
  | 'ORG_INVALID_RFC'
  | 'ORG_INVALID_ADDRESS'
  | 'CERT_INVALID_FORMAT'
  | 'CERT_EXPIRED'
  | 'CERT_RFC_MISMATCH'
  | 'CERT_PASSWORD_INVALID'
  | 'CERT_UPLOAD_FAILED'
  | 'CERT_NOT_FOUND'
  | 'PAC_INVALID_CONFIG'
  | 'PAC_CONNECTION_FAILED'
  | 'PAC_NOT_CONFIGURED'
  | 'STORAGE_ERROR'
  | 'ENCRYPTION_ERROR'
  | 'VALIDATION_ERROR'
  | 'PERMISSION_DENIED';

// ============================================================================
// Utility Types
// ============================================================================

/**
 * Partial update helper
 */
export type PartialUpdate<T> = Partial<T>;

/**
 * Required fields helper
 */
export type RequiredFields<T, K extends keyof T> = T & Required<Pick<T, K>>;
