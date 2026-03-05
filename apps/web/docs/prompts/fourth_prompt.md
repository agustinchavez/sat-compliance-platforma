Fantastic progress! We've completed the foundation layer (Components 1-3) and everything is working beautifully together.

## ✅ WHAT'S ALREADY BUILT (correct me if im wrong)

### Component 1: User Authentication ✓

- ✅ Supabase Auth integration with email verification
- ✅ User registration creates organization automatically (for owners)
- ✅ Session management and protected routes
- ✅ Auth helpers: `getCurrentUser()`, `requireAuth()`

### Component 2: Role-Based Access Control (RBAC) ✓

- ✅ 4 role levels with hierarchical permissions
- ✅ Redis-cached permission checks (3-5ms)
- ✅ Resource and action-based permissions
- ✅ Middleware: `requirePermission()`, `requireRole()`
- ✅ Ownership and special rule support

### Component 3: Multi-Tenant Context Manager ✓

- ✅ Automatic organization scoping with RLS
- ✅ `getScopedClient()` for auto-filtered queries
- ✅ Cross-tenant isolation and protection
- ✅ Redis-cached organization data (1-2ms)
- ✅ Tenant validation: `validateResourceInOrganization()`
- ✅ Complete RLS policies on all tables

### Current Database Structure (correct me if im wrong)

```sql
CREATE TABLE organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  rfc VARCHAR(13) UNIQUE NOT NULL,
  legal_name VARCHAR(255) NOT NULL,
  tax_regime VARCHAR(10) NOT NULL,
  email VARCHAR(255),
  phone VARCHAR(20),
  address JSONB,                    -- Need to expand this

  -- Fiscal Configuration (need to add)
  cfdi_cert BYTEA,                  -- Certificate (.cer) - encrypted
  cfdi_key BYTEA,                   -- Private key (.key) - encrypted
  cfdi_password_hash TEXT,          -- Password for .key file
  pac_provider VARCHAR(50),         -- 'finkok', 'sw', etc.
  pac_credentials JSONB,            -- Encrypted PAC API credentials

  -- Subscription Management (need to add)
  plan VARCHAR(50) DEFAULT 'free',  -- free, basic, professional, enterprise
  stripe_customer_id VARCHAR(255),  -- Stripe customer ID
  subscription_status VARCHAR(50),  -- active, past_due, canceled, etc.
  subscription_id VARCHAR(255),     -- Stripe subscription ID
  trial_ends_at TIMESTAMP,
  current_period_end TIMESTAMP,

  -- Settings
  settings JSONB DEFAULT '{}',      -- Customizable org settings

  -- Metadata
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  deleted_at TIMESTAMP              -- Soft delete
);

-- Indexes for performance
CREATE INDEX idx_organizations_rfc ON organizations(rfc) WHERE deleted_at IS NULL;
CREATE INDEX idx_organizations_stripe ON organizations(stripe_customer_id) WHERE deleted_at IS NULL;
```

### Current Organization Creation Flow

```typescript
// During signup, basic organization is created:
{
  name: "Mi Empresa",
  rfc: "ABC123456789",
  legal_name: "Mi Empresa S.A. de C.V.",
  tax_regime: "626",
  plan: "free"
}
```

Now we need to add:

1.  Complete profile management (address, contact info)
2.  CFDI certificate upload and management
3.  PAC provider configuration
4.  Subscription/billing management
5.  Advanced settings

### Tech Stack (correct me if im wrong)

- **Frontend:** Next.js 14 (App Router), TypeScript, Tailwind CSS
- **Backend:** Next.js API Routes, Server Actions, PostgreSQL (Supabase)
- **Storage:** Need to integrate Cloudflare R2 or AWS S3 for certificates
- **Encryption:** Need crypto library for certificate encryption
- **File Structure:** `apps/web/lib/` and `apps/web/app/`

### What We're NOT Building Yet

- ❌ Stripe integration (defer to Component 19: Payment Gateway)
- ❌ Team member management (defer to Component 5: Team Management)
- ❌ Organization switching (defer until multi-org support needed)

---

## 📋 CURRENT TASK: Component 4 - Organization Service

We need to build comprehensive organization management that handles:

1. Complete organization profile (CRUD operations)
2. CFDI certificate management (upload, validation, storage, encryption)
3. PAC provider configuration (API credentials management)
4. Settings management (customizable preferences)
5. Organization deletion (with proper cleanup)

### **Component 4: Organization Service**

**Purpose:** Manage all aspects of organization configuration, including fiscal setup required for CFDI invoice generation.

**Key Requirements:**

1. **Organization Profile Management**

   - Update organization details (name, legal name, RFC, contact info)
   - Validate RFC format (13 characters for legal entities, 12 for individuals)
   - Manage complete address (street, number, colony, city, state, postal code)
   - Handle email and phone updates
   - Audit trail for changes

2. **CFDI Certificate Management**

   - Upload `.cer` and `.key` files (CSD - Certificado de Sello Digital)
   - Validate certificate format and integrity
   - Extract certificate information (serial number, valid dates, RFC)
   - Encrypt private key before storage
   - Store encrypted certificates in cloud storage
   - Validate certificate expiration (alert before expiry)
   - Support certificate renewal/replacement

3. **PAC Provider Configuration**

   - Support multiple PAC providers (Finkok, SW, etc.)
   - Store API credentials securely (encrypted)
   - Validate PAC credentials before saving
   - Test PAC connection
   - Switch between providers

4. **Settings Management**

   - Invoice defaults (series, folio start, payment terms)
   - Email templates customization
   - Notification preferences
   - UI preferences (language, timezone, theme)
   - Auto-backup settings

5. **Organization Deletion**
   - Soft delete (preserve data)
   - Mark all related resources as deleted
   - Prevent CFDI generation after deletion
   - Optional: Hard delete after grace period

**Expected Functionality:**

```typescript
// 1. Get organization with full details
const org = await getOrganization(orgId);
// → Returns complete organization object

// 2. Update organization profile
const updated = await updateOrganization(orgId, {
  name: "New Business Name",
  email: "contact@newbusiness.com",
  address: {
    street: "Av. Reforma",
    exterior_number: "123",
    interior_number: "4B",
    colony: "Juárez",
    city: "Ciudad de México",
    state: "CDMX",
    postal_code: "06600",
    country: "México",
  },
});

// 3. Upload and validate CFDI certificates
const result = await uploadCertificates(orgId, {
  cerFile: Buffer, // .cer file
  keyFile: Buffer, // .key file
  password: "certificate_password",
});
// → Validates, encrypts, stores in S3, returns certificate info

// 4. Get certificate information (without exposing private key)
const certInfo = await getCertificateInfo(orgId);
// → { serialNumber, validFrom, validTo, rfc, status: 'valid' }

// 5. Configure PAC provider
await configurePAC(orgId, {
  provider: "finkok",
  credentials: {
    username: "api_user",
    password: "api_password",
    environment: "production", // or 'sandbox'
  },
});

// 6. Test PAC connection
const isValid = await testPACConnection(orgId);
// → true/false

// 7. Update settings
await updateSettings(orgId, {
  invoice: {
    default_series: "A",
    default_folio_start: 1,
    default_payment_terms: 30,
  },
  notifications: {
    email_on_invoice_paid: true,
    whatsapp_reminders: true,
  },
});

// 8. Delete organization (soft delete)
await deleteOrganization(orgId);
// → Sets deleted_at, prevents new operations
```

**File Structure to Create:**

```
apps/web/lib/organizations/
├── service.ts                    # Main organization service
│   ├── getOrganization(orgId)
│   ├── updateOrganization(orgId, data)
│   ├── deleteOrganization(orgId)
│   ├── restoreOrganization(orgId)
│   ├── getOrganizationStats(orgId)
│   └── validateOrganizationSetup(orgId)  // Check if ready for invoicing
│
├── certificates.ts               # CFDI certificate management
│   ├── uploadCertificates(orgId, files, password)
│   ├── validateCertificates(cerFile, keyFile, password)
│   ├── getCertificateInfo(orgId)
│   ├── parseCertificate(cerFile)
│   ├── extractCertificateDetails(cert)
│   ├── validateCertificateExpiry(cert)
│   ├── encryptPrivateKey(keyFile, password)
│   ├── decryptPrivateKey(encryptedKey, password)
│   ├── deleteCertificates(orgId)
│   └── checkCertificateExpiration(orgId)  // For alerts
│
├── pac.ts                        # PAC provider configuration
│   ├── configurePAC(orgId, config)
│   ├── getPACConfig(orgId)
│   ├── testPACConnection(orgId)
│   ├── switchPACProvider(orgId, newProvider)
│   ├── encryptPACCredentials(credentials)
│   ├── decryptPACCredentials(encrypted)
│   └── validatePACCredentials(provider, credentials)
│
├── settings.ts                   # Organization settings
│   ├── getSettings(orgId)
│   ├── updateSettings(orgId, settings)
│   ├── resetSettings(orgId)
│   ├── getDefaultSettings()
│   └── validateSettings(settings)
│
├── validation.ts                 # Validation utilities
│   ├── validateRFC(rfc)
│   ├── validateAddress(address)
│   ├── validateTaxRegime(regime)
│   ├── validateEmail(email)
│   ├── validatePhone(phone)
│   ├── validateCertificateFiles(cer, key)
│   └── validatePACConfig(config)
│
├── storage.ts                    # File storage for certificates
│   ├── uploadToStorage(key, buffer)
│   ├── downloadFromStorage(key)
│   ├── deleteFromStorage(key)
│   ├── getCertificateStorageKey(orgId)
│   └── getKeyStorageKey(orgId)
│
├── encryption.ts                 # Certificate encryption
│   ├── encryptData(data, key)
│   ├── decryptData(encrypted, key)
│   ├── hashPassword(password)
│   ├── verifyPassword(password, hash)
│   └── generateEncryptionKey()
│
├── types.ts                      # TypeScript types
│   ├── Organization interface
│   ├── OrganizationAddress interface
│   ├── CertificateInfo interface
│   ├── PACConfig interface
│   ├── PACProvider type
│   ├── OrganizationSettings interface
│   └── CertificateStatus type
│
├── utils.ts                      # Helper utilities
│   ├── formatRFC(rfc)
│   ├── formatAddress(address)
│   ├── getOrganizationDisplayName(org)
│   ├── isOrganizationActive(org)
│   ├── canGenerateInvoices(org)  // Check if setup is complete
│   └── logOrganizationChange(orgId, changes)
│
└── index.ts                      # Main exports
    └── Export all public functions
```

**Mexican Address Format (SAT Requirements):**

```typescript
interface OrganizationAddress {
  street: string                  // Calle
  exterior_number: string         // Número exterior
  interior_number?: string        // Número interior (optional)
  colony: string                  // Colonia
  locality?: string               // Localidad (optional)
  municipality?: string           // Municipio (optional)
  city: string                    // Ciudad
  state: string                   // Estado (2-letter code: "CDMX", "JAL", etc.)
  postal_code: string            // Código postal (5 digits)
  country: string                // País (default: "México")
}

// Example:
{
  street: "Avenida Insurgentes Sur",
  exterior_number: "1602",
  interior_number: "Piso 5",
  colony: "Crédito Constructor",
  city: "Ciudad de México",
  state: "CDMX",
  postal_code: "03940",
  country: "México"
}
```

**CFDI Certificate (CSD) Requirements:**

```typescript
interface CertificateFiles {
  cerFile: Buffer; // .cer file (public certificate)
  keyFile: Buffer; // .key file (private key, password-protected)
  password: string; // Password to decrypt .key file
}

interface CertificateInfo {
  serialNumber: string; // Número de serie
  rfc: string; // RFC from certificate (must match org RFC)
  validFrom: Date; // Válido desde
  validTo: Date; // Válido hasta
  issuer: string; // Emisor (SAT)
  status: CertificateStatus; // 'valid', 'expired', 'expiring_soon'
  daysUntilExpiry: number; // Days remaining
}

type CertificateStatus = "valid" | "expired" | "expiring_soon" | "invalid";
```

**PAC Provider Configuration:**

```typescript
type PACProvider = "finkok" | "sw" | "diverza" | "facturaxion";

interface PACConfig {
  provider: PACProvider;
  environment: "sandbox" | "production";
  credentials: {
    username: string;
    password: string;
    // Provider-specific fields
    [key: string]: any;
  };
  isActive: boolean;
  lastTested?: Date;
  lastTestResult?: "success" | "failed";
}

// Encrypted storage format:
interface EncryptedPACConfig {
  provider: PACProvider;
  environment: "sandbox" | "production";
  encryptedCredentials: string; // AES-256 encrypted JSON
  iv: string; // Initialization vector
  authTag: string; // Authentication tag
}
```

**Organization Settings Schema:**

```typescript
interface OrganizationSettings {
  // Invoice defaults
  invoice: {
    default_series: string; // Default serie (e.g., "A", "B")
    default_folio_start: number; // Starting folio number
    default_payment_terms: number; // Days (e.g., 30)
    default_payment_method: string; // "PUE" or "PPD"
    default_payment_form: string; // "01", "03", etc.
    auto_send_email: boolean;
  };

  // Notifications
  notifications: {
    email_on_invoice_created: boolean;
    email_on_invoice_paid: boolean;
    email_on_payment_received: boolean;
    whatsapp_enabled: boolean;
    whatsapp_reminders: boolean;
    reminder_days_before: number; // Days before due date
  };

  // UI preferences
  ui: {
    language: "es" | "en";
    timezone: string; // "America/Mexico_City"
    theme: "light" | "dark" | "system";
    date_format: string; // "DD/MM/YYYY"
    currency_format: string; // "MXN"
  };

  // Advanced
  advanced: {
    auto_backup: boolean;
    backup_frequency: "daily" | "weekly" | "monthly";
    enable_audit_log: boolean;
    session_timeout: number; // Minutes
  };
}
```

**Validation Rules:**

```typescript
// RFC Validation (Mexican Tax ID)
// Format:
//   - Legal Entity: 3 letters + 6 digits (YYMMDD) + 3 alphanumeric = 12 chars
//   - Individual: 4 letters + 6 digits (YYMMDD) + 3 alphanumeric = 13 chars
// Examples: "ABC123456XYZ" (12), "ABCD123456XYZ" (13)

const RFC_PATTERN_LEGAL = /^[A-ZÑ&]{3}\d{6}[A-Z0-9]{3}$/;
const RFC_PATTERN_PERSON = /^[A-ZÑ&]{4}\d{6}[A-Z0-9]{3}$/;

// Postal Code: 5 digits
const POSTAL_CODE_PATTERN = /^\d{5}$/;

// Tax Regime: 3 digits (e.g., "601", "626")
const TAX_REGIME_PATTERN = /^\d{3}$/;

// Certificate Serial Number: Hexadecimal, 20 characters
const CERT_SERIAL_PATTERN = /^[0-9A-F]{20}$/;
```

**Storage Strategy:**

```typescript
// S3/R2 Storage Structure
bucket: "sat-compliance-certificates"

// Storage keys:
certificates/{organizationId}/certificate.cer.encrypted
certificates/{organizationId}/privatekey.key.encrypted
certificates/{organizationId}/metadata.json

// Metadata file contains:
{
  "uploadedAt": "2025-11-07T10:00:00Z",
  "uploadedBy": "user-uuid",
  "serialNumber": "3000...",
  "validFrom": "2024-01-01",
  "validTo": "2028-01-01",
  "rfc": "ABC123456XYZ"
}
```

**Security Considerations:**

```typescript
// 1. Certificate Encryption
// - Use AES-256-GCM for encryption
// - Separate encryption keys for each organization
// - Store encryption keys in environment variables or AWS KMS
// - Never expose private keys in API responses

// 2. PAC Credentials Encryption
// - Encrypt using same strategy as certificates
// - Rotate credentials periodically
// - Log all credential access

// 3. Certificate Password Hashing
// - Hash password before storing (bcrypt with 12 rounds)
// - Never store plain-text password
// - Password needed to decrypt .key file

// 4. Audit Logging
// - Log certificate uploads
// - Log PAC configuration changes
// - Log organization deletions
// - Include user, timestamp, old/new values
```

**Dependencies:**

```bash
# Encryption
npm install crypto # Built-in Node.js

# File handling
npm install @node-rs/xxhash # File hashing
npm install file-type # Detect file types

# X.509 Certificate parsing
npm install node-forge # Certificate parsing and validation

# Cloud storage (choose one)
npm install @aws-sdk/client-s3 # AWS S3
# OR
npm install @cloudflare/workers-types # Cloudflare R2
```

**Environment Variables Needed:**

```env
# Cloud Storage (S3/R2)
S3_BUCKET_NAME=sat-compliance-certificates
S3_REGION=us-east-1
S3_ACCESS_KEY_ID=...
S3_SECRET_ACCESS_KEY=...
# OR for Cloudflare R2:
R2_ACCOUNT_ID=...
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...

# Encryption Keys
CERTIFICATE_ENCRYPTION_KEY=... # 32-byte hex string
PAC_ENCRYPTION_KEY=...         # 32-byte hex string

# Optional: AWS KMS for key management
AWS_KMS_KEY_ID=...
```

**Migration Requirements:**

```sql
-- Update organizations table with new columns
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS cfdi_cert BYTEA;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS cfdi_key BYTEA;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS cfdi_password_hash TEXT;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS pac_provider VARCHAR(50);
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS pac_credentials JSONB;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS subscription_status VARCHAR(50);
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS stripe_customer_id VARCHAR(255);
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMP;

-- Add indexes
CREATE INDEX IF NOT EXISTS idx_org_stripe ON organizations(stripe_customer_id);
CREATE INDEX IF NOT EXISTS idx_org_deleted ON organizations(deleted_at);

-- Add check constraints
ALTER TABLE organizations ADD CONSTRAINT check_rfc_length
  CHECK (char_length(rfc) BETWEEN 12 AND 13);
```

---

## 🎯 WHAT I NEED FROM YOU

Before we start implementation, please help me plan:

1. **Storage Provider Choice:**

   - Should I use AWS S3 or Cloudflare R2 for certificate storage?
   - R2 is cheaper and S3-compatible, but newer
   - Your recommendation?

2. **Encryption Strategy:**

   - AES-256-GCM for both certificates and PAC credentials?
   - Should I use environment variable for encryption keys or AWS KMS?
   - How to handle key rotation?

3. **Certificate Validation:**

   - Should I validate certificates with SAT before saving?
   - Or just validate format and expiry locally?
   - What happens if certificate is invalid?

4. **PAC Connection Testing:**

   - Should I test PAC connection immediately when saving credentials?
   - Or defer to first invoice generation?
   - How to handle connection failures?

5. **Organization Deletion:**

   - Soft delete only (recommended)?
   - Or allow hard delete after X days?
   - What about related invoices/customers?

6. **Settings Schema:**

   - Use JSONB in PostgreSQL (flexible)?
   - Or create separate settings table (normalized)?
   - How to handle schema evolution?

7. **Certificate Expiry Alerts:**

   - When to start alerting? (30 days before expiry?)
   - How to notify? (Email, in-app notification, both?)
   - Should we block invoice generation after expiry?

8. **Implementation Order:**
   - My proposal:
     1. Types and interfaces (types.ts)
     2. Validation utilities (validation.ts)
     3. Storage setup (storage.ts)
     4. Encryption utilities (encryption.ts)
     5. Organization service - basic CRUD (service.ts)
     6. Certificate management (certificates.ts)
     7. PAC configuration (pac.ts)
     8. Settings management (settings.ts)
     9. Integration and testing
   - Does this make sense?

**Security Questions:**

1. Should certificate private keys ever be decrypted in memory?
2. How to securely pass password for .key file decryption?
3. Should we implement certificate rotation/renewal flow now?
4. How to handle compromised certificates?

**UX Questions:**

1. Should we have an organization setup wizard for new users?
2. What's the minimum required info to start using the platform?
3. Should certificate upload be mandatory or optional initially?

Please review this plan and:

- ✅ Choose storage provider (S3 vs R2)
- ✅ Confirm encryption approach
- ✅ Decide on certificate validation strategy
- ✅ Confirm soft delete vs hard delete
- ✅ Validate settings storage approach (JSONB vs table)
- ✅ Review implementation order
- ✅ Answer my questions above
- ✅ Suggest any security improvements

Once we align on the approach, I'll start implementing step by step!

```

```
