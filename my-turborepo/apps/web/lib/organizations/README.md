# Organization Service

Complete organization management system for the SAT Compliance Platform, including CFDI certificate management, PAC provider configuration, and organization settings.

## Features

### 1. Organization CRUD Operations
- Get, update, and delete organizations
- Soft delete with restoration capability
- Organization search and filtering
- RFC validation and formatting

### 2. CFDI Certificate Management
- Upload and validate X.509 certificates (.cer and .key files)
- AES-256-GCM encryption for secure storage
- Certificate parsing and information extraction
- Expiry checking and alerts
- Cloudflare R2/AWS S3 storage integration

### 3. PAC Provider Configuration
- Support for multiple PAC providers (Finkok, SW, Diverza, Facturaxion)
- Encrypted credential storage
- Connection testing
- Provider switching

### 4. Organization Settings
- Invoice defaults (series, folio, payment terms)
- Notification preferences
- UI preferences (language, theme, timezone)
- Advanced settings (backup, audit log)

### 5. Security Features
- AES-256-GCM encryption for certificates and credentials
- Password hashing with scrypt
- Secure key management
- Audit logging support

## File Structure

```
lib/organizations/
├── index.ts              # Public API exports
├── types.ts              # TypeScript type definitions
├── validation.ts         # Validation utilities
├── service.ts            # Organization CRUD operations
├── certificates.ts       # CFDI certificate management
├── pac.ts                # PAC provider configuration
├── settings.ts           # Organization settings
├── storage.ts            # Cloudflare R2/S3 storage
├── encryption.ts         # AES-256-GCM encryption
├── utils.ts              # Helper utilities
└── README.md             # This file
```

## Installation

The required dependencies are already installed:

```bash
npm install node-forge @aws-sdk/client-s3 @types/node-forge
```

## Configuration

### 1. Environment Variables

Add the following to your `.env.local` file:

```bash
# Encryption Keys (REQUIRED)
CERTIFICATE_ENCRYPTION_KEY=your_64_character_hex_key_here
PAC_ENCRYPTION_KEY=your_64_character_hex_key_here

# Cloudflare R2 (Recommended)
R2_ACCOUNT_ID=your_r2_account_id
R2_ACCESS_KEY_ID=your_r2_access_key_id
R2_SECRET_ACCESS_KEY=your_r2_secret_access_key
R2_BUCKET_NAME=sat-compliance-certificates
```

Generate encryption keys with:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 2. Database Migration

Run the database migration to add the required columns:

```bash
cd supabase
npx supabase migration up
```

## Usage

### Get Organization

```typescript
import { getOrganization } from '@/lib/organizations';

const org = await getOrganization('org-uuid');
if (org) {
  console.log(org.name, org.rfc);
}
```

### Update Organization

```typescript
import { updateOrganization } from '@/lib/organizations';

const updated = await updateOrganization('org-uuid', {
  name: 'New Business Name',
  email: 'contact@newbusiness.com',
  address: {
    street: 'Av. Reforma',
    exterior_number: '123',
    colony: 'Juárez',
    city: 'Ciudad de México',
    state: 'CDMX',
    postal_code: '06600',
    country: 'México'
  }
});
```

### Upload CFDI Certificates

```typescript
import { uploadCertificates } from '@/lib/organizations';

const result = await uploadCertificates(
  'org-uuid',
  {
    cerFile: cerFileBuffer,
    keyFile: keyFileBuffer,
    password: 'certificate-password'
  },
  'user-uuid'
);

if (result.success) {
  console.log('Certificate info:', result.certificateInfo);
}
```

### Configure PAC Provider

```typescript
import { configurePAC } from '@/lib/organizations';

await configurePAC('org-uuid', {
  provider: 'finkok',
  environment: 'production',
  credentials: {
    username: 'api_user',
    password: 'api_password'
  },
  isActive: true
});
```

### Test PAC Connection

```typescript
import { testPACConnection } from '@/lib/organizations';

const result = await testPACConnection('org-uuid');
if (result.success) {
  console.log('PAC connection successful!');
} else {
  console.error('PAC connection failed:', result.message);
}
```

### Update Settings

```typescript
import { updateSettings } from '@/lib/organizations';

await updateSettings('org-uuid', {
  invoice: {
    default_series: 'B',
    default_payment_terms: 15
  },
  notifications: {
    email_on_invoice_created: true
  }
});
```

### Check Setup Status

```typescript
import { validateOrganizationSetup } from '@/lib/organizations';

const status = await validateOrganizationSetup('org-uuid');
if (!status.isComplete) {
  console.log('Missing steps:', status.missingSteps);
  console.log('Progress:', status.completionPercentage + '%');
}
```

## Validation

### RFC Validation

```typescript
import { validateRFC } from '@/lib/organizations';

const result = validateRFC('ABC123456XYZ');
if (result.valid) {
  console.log('Valid RFC:', result.type); // 'legal_entity' or 'individual'
}
```

### Address Validation

```typescript
import { validateAddress } from '@/lib/organizations';

const result = validateAddress({
  street: 'Av. Insurgentes Sur',
  exterior_number: '1602',
  colony: 'Crédito Constructor',
  city: 'Ciudad de México',
  state: 'CDMX',
  postal_code: '03940',
  country: 'México'
});

if (result.valid) {
  console.log('Valid address');
}
```

## Security

### Certificate Encryption

Certificates are encrypted using AES-256-GCM before storage:

```typescript
import { encryptCertificate, decryptCertificate } from '@/lib/organizations';

// Encrypt
const encrypted = encryptCertificate(certBuffer);
// → { encryptedData: '...', iv: '...', authTag: '...' }

// Decrypt
const decrypted = decryptCertificate(encrypted);
```

### Password Hashing

Certificate passwords are hashed using scrypt:

```typescript
import { hashPassword, verifyPassword } from '@/lib/organizations';

// Hash password
const hash = await hashPassword('my-password');

// Verify password
const isValid = await verifyPassword('my-password', hash);
```

## Database Schema

### Organizations Table

```sql
CREATE TABLE organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  rfc VARCHAR(13) UNIQUE NOT NULL,
  legal_name VARCHAR(255) NOT NULL,
  tax_regime VARCHAR(10) NOT NULL,
  email VARCHAR(255),
  phone VARCHAR(20),
  address JSONB,

  -- CFDI Configuration
  cfdi_cert BYTEA,
  cfdi_key BYTEA,
  cfdi_password_hash TEXT,
  pac_provider VARCHAR(50),
  pac_credentials JSONB,

  -- Subscription
  plan VARCHAR(50) DEFAULT 'free',
  stripe_customer_id VARCHAR(255),
  subscription_status VARCHAR(50),
  subscription_id VARCHAR(255),
  trial_ends_at TIMESTAMP,
  current_period_end TIMESTAMP,

  -- Settings
  settings JSONB DEFAULT '{}',

  -- Metadata
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  deleted_at TIMESTAMP
);
```

## API Reference

See individual module files for detailed API documentation:

- [types.ts](./types.ts) - Type definitions
- [service.ts](./service.ts) - Organization CRUD
- [certificates.ts](./certificates.ts) - Certificate management
- [pac.ts](./pac.ts) - PAC configuration
- [settings.ts](./settings.ts) - Settings management
- [validation.ts](./validation.ts) - Validation utilities
- [storage.ts](./storage.ts) - Cloud storage
- [encryption.ts](./encryption.ts) - Encryption utilities
- [utils.ts](./utils.ts) - Helper utilities

## Testing

The service includes built-in test functions:

```typescript
import {
  testStorageConnection,
  testEncryption,
  checkEncryptionConfig
} from '@/lib/organizations';

// Test storage connection
const storageTest = await testStorageConnection();
console.log('Storage:', storageTest.success);

// Test encryption
const encryptionTest = testEncryption('certificate');
console.log('Encryption:', encryptionTest.success);

// Check encryption config
const config = checkEncryptionConfig();
console.log('Encryption configured:', config.certificateKeyConfigured);
```

## Next Steps

1. **Apply Database Migration**: Run the migration to add new columns
2. **Set Environment Variables**: Configure encryption keys and storage
3. **Test Connections**: Test storage and encryption setup
4. **Build UI Components**: Create forms for certificate upload and PAC configuration
5. **Add Audit Logging**: Implement full audit trail functionality

## Related Components

- Component 1: User Authentication
- Component 2: RBAC System
- Component 3: Multi-Tenant Context Manager
- Component 5: Team Management (coming next)

## Support

For issues or questions, please refer to the main project documentation.
