# End-to-End Testing Guide

## SAT Compliance Platform - Components 1-8

This guide walks you through comprehensive manual testing of all features built so far.

---

## Prerequisites

### 1. Start the Development Server

```bash
cd /Users/agustinchavez/projects/sat-compliance-platform/my-turborepo/apps/web
npm run dev
```

The app should be running at: **http://localhost:3000**

### 2. Ensure Database is Ready

Verify Supabase is connected and migrations are applied:
```bash
supabase status
```

### 3. Prepare Test Files

You'll need test certificate files. See **Appendix A** at the end of this document for instructions on creating dummy certificates.

---

## Testing Checklist

### Phase 1: Authentication (Component 1)

#### Test 1.1: User Registration
- [ ] Navigate to: `http://localhost:3000/auth/register`
- [ ] Fill in registration form:
  - Full Name: `Test User`
  - Email: `test@example.com` (use a real email you can access)
  - Password: `TestPassword123!`
  - Organization Name: `Test Company SA de CV`
  - RFC: `TCO010101AAA` (12 chars for empresa)
- [ ] Click "Register"
- [ ] **Expected:** Redirect to email verification page or dashboard
- [ ] Check email for verification link (if email verification is enabled)

#### Test 1.2: User Login
- [ ] Navigate to: `http://localhost:3000/auth/login`
- [ ] Enter credentials from registration
- [ ] Click "Sign In"
- [ ] **Expected:** Redirect to `/dashboard`

#### Test 1.3: Dashboard Access
- [ ] Verify dashboard loads with:
  - [ ] User name displayed
  - [ ] Organization name and RFC visible
  - [ ] Quick action links present (Customers, Products, Settings)
- [ ] Click "Sign Out"
- [ ] **Expected:** Redirect to login page

#### Test 1.4: Protected Route Access
- [ ] While logged out, try to access: `http://localhost:3000/dashboard`
- [ ] **Expected:** Redirect to login page

---

### Phase 2: Organization Settings (Component 3)

#### Test 2.1: Access Settings
- [ ] Log in and navigate to: `http://localhost:3000/settings`
- [ ] **Expected:** Redirect to `/settings/organization`
- [ ] Verify sidebar navigation is visible

#### Test 2.2: Setup Status Card
- [ ] Check setup status card shows:
  - [ ] Profile: Should show current status
  - [ ] Certificates: Yellow (not configured)
  - [ ] PAC Provider: Yellow (not configured)
  - [ ] Team: Current member count

#### Test 2.3: Update Organization Profile
- [ ] Click "Edit" on Organization Profile section
- [ ] Update fields:
  - Business Name: `Test Company Updated`
  - Legal Name: `Test Company SA de CV`
  - Tax Regime: Select `601 - General de Ley Personas Morales`
- [ ] Click "Save Changes"
- [ ] **Expected:** Success message, form shows updated values
- [ ] Refresh page and verify changes persist

#### Test 2.4: Update Fiscal Address
- [ ] Click "Edit" on Address section (or expand it)
- [ ] Fill in address:
  - Street: `Av. Reforma`
  - Exterior Number: `222`
  - Interior Number: `Piso 10`
  - Colony: `Juárez`
  - Postal Code: `06600`
  - City: `Ciudad de México`
  - State: Select `CDMX - Ciudad de México`
- [ ] Click "Save Address"
- [ ] **Expected:** Success message, address displays correctly
- [ ] Verify postal code matches CDMX prefix (06)

---

### Phase 3: Certificate Management (Component 4)

#### Test 3.1: Access Certificate Page
- [ ] Navigate to: `http://localhost:3000/settings/certificates`
- [ ] **Expected:** Shows "No certificate configured" or upload form

#### Test 3.2: Upload Test Certificate
- [ ] Prepare test certificate files (see Appendix A)
- [ ] Click "Upload Certificate" or select files:
  - Certificate (.cer): Select your test .cer file
  - Private Key (.key): Select your test .key file
  - Password: Enter the password used to create the key
- [ ] Click "Upload"
- [ ] **Expected:**
  - Success message OR
  - Error message (if using self-signed certs, validation may fail)

#### Test 3.3: View Certificate Details (if upload succeeds)
- [ ] Verify display shows:
  - [ ] Serial number
  - [ ] RFC from certificate
  - [ ] Valid from/to dates
  - [ ] Days until expiration

#### Test 3.4: Delete Certificate
- [ ] Click "Delete Certificate"
- [ ] Confirm deletion
- [ ] **Expected:** Certificate removed, shows upload form again

---

### Phase 4: PAC Provider Configuration (Component 5)

#### Test 4.1: Access PAC Page
- [ ] Navigate to: `http://localhost:3000/settings/pac`
- [ ] **Expected:** Shows "No PAC configured" or configuration form

#### Test 4.2: Configure PAC Provider (Sandbox)
- [ ] Select provider: `Finkok` (or another)
- [ ] Select environment: `Sandbox`
- [ ] Enter test credentials:
  - Username/API Key: `test_user`
  - Password/API Secret: `test_password`
- [ ] Click "Save Configuration"
- [ ] **Expected:** Success message, PAC status shows configured

#### Test 4.3: Test PAC Connection
- [ ] Click "Test Connection"
- [ ] **Expected:**
  - If valid credentials: Connection successful
  - If test credentials: Connection failed (expected for dummy data)

#### Test 4.4: Change PAC Provider
- [ ] Change provider to `SW Sapien`
- [ ] Save configuration
- [ ] **Expected:** Provider updated successfully

---

### Phase 5: Team Management (Component 2)

#### Test 5.1: Access Team Page
- [ ] Navigate to: `http://localhost:3000/settings/team`
- [ ] **Expected:** Shows team overview with current user as owner

#### Test 5.2: View Team Stats
- [ ] Check stats card shows:
  - [ ] Active Members count (should be 1)
  - [ ] Pending Invites (should be 0)
  - [ ] Role breakdown

#### Test 5.3: Invite Team Member
- [ ] Click "Invite Team Member"
- [ ] Fill in invitation form:
  - Email: `teammate@example.com`
  - Role: Select `Accountant`
  - Message: `Welcome to the team!` (optional)
- [ ] Click "Send Invitation"
- [ ] **Expected:** Success message, invitation appears in Pending list

#### Test 5.4: Manage Pending Invitation
- [ ] Find the pending invitation
- [ ] Click "Resend"
- [ ] **Expected:** Success message (invitation resent)
- [ ] Click "Cancel"
- [ ] **Expected:** Invitation removed from list

#### Test 5.5: Invite Another Member (for role testing)
- [ ] Invite: `admin@example.com` as `Administrator`
- [ ] Keep this invitation pending

#### Test 5.6: View Role Permissions
- [ ] Scroll down to "Role Permissions" section
- [ ] Verify all 4 role cards display correctly:
  - [ ] Owner (purple)
  - [ ] Administrator (blue)
  - [ ] Accountant (green)
  - [ ] User (gray)

---

### Phase 6: Customer Management (Component 6)

#### Test 6.1: Access Customers Page
- [ ] Navigate to: `http://localhost:3000/customers`
- [ ] **Expected:** Empty state or customer list

#### Test 6.2: Create Customer (Persona Moral - 12 char RFC)
- [ ] Click "Add Customer"
- [ ] Fill in form:
  - RFC: `XYZ010101AAA` (12 characters)
  - Razón Social: `Cliente Empresa SA de CV`
  - Nombre Comercial: `Cliente Empresa`
  - Email: `contacto@clienteempresa.com`
  - Phone: `+52 55 1234 5678`
  - Régimen Fiscal: `601 - General de Ley Personas Morales`
  - Uso de CFDI: `G03 - Gastos en general`
- [ ] Expand Address section and fill:
  - Street: `Calle Principal`
  - Ext Number: `100`
  - Colony: `Centro`
  - City: `Guadalajara`
  - State: `JAL - Jalisco`
  - Postal Code: `44100`
- [ ] Add tags: `vip, wholesale`
- [ ] Click "Create Customer"
- [ ] **Expected:** Redirect to customer detail page

#### Test 6.3: View Customer Details
- [ ] Verify all information displays correctly
- [ ] Check status badge shows "Active"

#### Test 6.4: Create Customer (Persona Física - 13 char RFC)
- [ ] Go back to `/customers`
- [ ] Click "Add Customer"
- [ ] Fill in:
  - RFC: `GARC850101XXX` (13 characters)
  - Razón Social: `García Rodríguez Carlos`
  - Email: `carlos@gmail.com`
  - Régimen Fiscal: `612 - Personas Físicas con Actividades Empresariales`
  - Uso de CFDI: `G03 - Gastos en general`
- [ ] **Expected:** Tax regime dropdown filters to show individual-applicable regimes
- [ ] Click "Create Customer"

#### Test 6.5: Search Customers
- [ ] Go to `/customers`
- [ ] Search for `García`
- [ ] **Expected:** Only matching customer appears
- [ ] Clear search
- [ ] **Expected:** All customers visible

#### Test 6.6: Edit Customer
- [ ] Click "Edit" on a customer
- [ ] Change business name
- [ ] Save changes
- [ ] **Expected:** Changes persist

#### Test 6.7: Delete Customer
- [ ] Click "Delete" on a customer
- [ ] Confirm deletion
- [ ] **Expected:** Customer removed from list (soft delete)

---

### Phase 7: Product/Service Management (Component 8)

#### Test 7.1: Access Products Page
- [ ] Navigate to: `http://localhost:3000/products`
- [ ] **Expected:** Empty state or product list

#### Test 7.2: Create Product
- [ ] Click "Add Product/Service"
- [ ] Select type: `Product`
- [ ] Fill in:
  - Name: `Laptop Dell XPS 15`
  - Description: `Laptop profesional para desarrollo`
  - SKU: (leave empty for auto-generate)
  - Category: `Electronics`
  - ClaveProdServ: `43211503 - Computadoras portátiles`
  - ClaveUnidad: `H87 - Pieza`
  - Unit Name: `Pieza`
  - Price: `25000`
  - Tax Object: `02 - Sí objeto de impuesto`
  - IVA Rate: `16%`
- [ ] Enable "Track inventory"
  - Current Stock: `10`
  - Min Stock: `2`
- [ ] Tags: `premium, computers`
- [ ] Click "Create Product"
- [ ] **Expected:** Redirect to product detail

#### Test 7.3: View Product Details
- [ ] Verify pricing card shows:
  - [ ] Base price: $25,000.00
  - [ ] IVA (16%): $4,000.00
  - [ ] Total: $29,000.00
- [ ] Verify inventory shows: 10 Pieza

#### Test 7.4: Create Service
- [ ] Go to `/products/new`
- [ ] Select type: `Service`
- [ ] Fill in:
  - Name: `Consultoría de Negocios`
  - Description: `Servicio de consultoría empresarial`
  - ClaveProdServ: `81112100 - Servicios de consultoría de negocios`
  - ClaveUnidad: `E48 - Unidad de servicio`
  - Unit Name: `Servicio`
  - Price: `5000`
  - IVA Rate: `16%`
  - IVA Retention: ✓ (check)
  - ISR Retention: ✓ (check)
- [ ] Click "Create Product"

#### Test 7.5: View Service with Retentions
- [ ] Verify pricing shows retentions:
  - [ ] IVA Retention (10.67%): -$533.50
  - [ ] ISR Retention (10%): -$500.00

#### Test 7.6: Filter Products
- [ ] Go to `/products`
- [ ] Click "Products" filter
- [ ] **Expected:** Only products shown (blue badge)
- [ ] Click "Services" filter
- [ ] **Expected:** Only services shown (purple badge)
- [ ] Click "All"
- [ ] **Expected:** All items shown

#### Test 7.7: Search Products
- [ ] Search for `laptop`
- [ ] **Expected:** Only Laptop product appears
- [ ] Clear search

#### Test 7.8: Low Stock Warning
- [ ] Edit the Laptop product
- [ ] Set Current Stock: `1` (below min_stock of 2)
- [ ] Save
- [ ] **Expected:** Product shows "Low Stock" badge in red

---

### Phase 8: Cross-Feature Testing

#### Test 8.1: Dashboard Quick Links
- [ ] Go to `/dashboard`
- [ ] Click "Customers" → Should go to `/customers`
- [ ] Click "Products" → Should go to `/products`
- [ ] Click "Settings" → Should go to `/settings`

#### Test 8.2: Navigation Persistence
- [ ] In Settings, click through each tab:
  - [ ] Organization
  - [ ] Certificates
  - [ ] PAC Provider
  - [ ] Team
- [ ] Verify active state in sidebar

#### Test 8.3: Data Persistence
- [ ] Sign out
- [ ] Sign back in
- [ ] Verify all data (customers, products, settings) persists

#### Test 8.4: Error Handling
- [ ] Try to create customer with invalid RFC (e.g., `ABC`)
- [ ] **Expected:** Validation error displayed
- [ ] Try to create product with negative price
- [ ] **Expected:** Validation error displayed

---

## Appendix A: Creating Test Certificate Files

### Option 1: Using SAT Test Certificates (Recommended)

The SAT provides test certificates for sandbox environments:

1. Go to: https://portalsat.plataforma.sat.gob.mx/CertSAT/
2. Download the test FIEL (Firma Electrónica) certificates
3. Use these for testing

### Option 2: Generate Self-Signed Certificates (For UI Testing Only)

**Note:** Self-signed certificates will NOT work with actual SAT services but can test the upload UI.

```bash
# Create a directory for test certificates
mkdir -p ~/test-certificates
cd ~/test-certificates

# Generate private key (encrypted with password)
openssl genrsa -aes256 -out test-key.pem 2048
# When prompted, enter password: TestPassword123

# Convert to .key format (DER encoding)
openssl pkcs8 -topk8 -inform PEM -outform DER -in test-key.pem -out test.key -nocrypt

# Generate self-signed certificate
openssl req -new -x509 -key test-key.pem -out test-cert.pem -days 365 \
  -subj "/C=MX/ST=CDMX/L=Mexico City/O=Test Company/OU=IT/CN=TCO010101AAA"

# Convert certificate to .cer format (DER encoding)
openssl x509 -in test-cert.pem -outform DER -out test.cer

# Your test files are:
# - test.cer (certificate file)
# - test.key (private key file)
# - Password: TestPassword123
```

### Option 3: Download SAT Test Certificates

For Finkok sandbox testing, use their provided test certificates:

1. Register at: https://wiki.finkok.com/doku.php
2. Download their test FIEL files
3. Use the provided password

---

## Appendix B: Test Data Quick Reference

### Test RFC Values

| Type | RFC | Description |
|------|-----|-------------|
| Persona Moral | `ABC010101AAA` | 12 chars, company |
| Persona Física | `GARC850101XXX` | 13 chars, individual |
| Generic Foreign | `XAXX010101000` | SAT generic for foreigners |
| Generic Public | `XEXX010101000` | SAT generic for public |

### Common Tax Regimes

| Code | Name | For |
|------|------|-----|
| 601 | General de Ley PM | Companies |
| 603 | Sin Fines de Lucro | Non-profits |
| 612 | Actividades Empresariales PF | Individuals |
| 626 | RESICO | Simplified |

### Common CFDI Uses

| Code | Name |
|------|------|
| G01 | Adquisición de mercancías |
| G03 | Gastos en general |
| I01 | Construcciones |
| P01 | Por definir |
| S01 | Sin efectos fiscales |

### Common SAT Product Codes

| Code | Description |
|------|-------------|
| 01010101 | No existe en catálogo |
| 43211503 | Computadoras portátiles |
| 81112100 | Consultoría de negocios |
| 84111500 | Servicios de contabilidad |

### Common SAT Unit Codes

| Code | Name |
|------|------|
| H87 | Pieza |
| E48 | Unidad de servicio |
| HUR | Hora |
| ACT | Actividad |
| KGM | Kilogramo |

---

## Appendix C: Troubleshooting

### Common Issues

**1. "Not authenticated" errors**
- Check if session expired
- Clear cookies and log in again
- Verify Supabase connection in `.env.local`

**2. "Organization not found"**
- User may not have organization membership
- Check `organization_members` table in Supabase

**3. Certificate upload fails**
- Ensure files are .cer and .key format
- Check password is correct
- Self-signed certs may fail validation

**4. PAC connection test fails**
- Expected for dummy credentials
- Use real sandbox credentials for actual testing

**5. Page shows "Loading..." indefinitely**
- Check browser console for errors
- Verify API routes are working
- Check Supabase connection

### Useful Debug Commands

```bash
# Check Supabase status
supabase status

# View Supabase logs
supabase logs

# Reset database (WARNING: deletes all data)
supabase db reset

# Run in development with debug
DEBUG=* npm run dev
```

---

## Test Results Summary

Use this table to track your testing progress:

| Component | Feature | Status | Notes |
|-----------|---------|--------|-------|
| Auth | Registration | ⬜ | |
| Auth | Login | ⬜ | |
| Auth | Logout | ⬜ | |
| Auth | Protected Routes | ⬜ | |
| Settings | Organization Profile | ⬜ | |
| Settings | Fiscal Address | ⬜ | |
| Certificates | Upload | ⬜ | |
| Certificates | View | ⬜ | |
| Certificates | Delete | ⬜ | |
| PAC | Configure | ⬜ | |
| PAC | Test Connection | ⬜ | |
| Team | View Members | ⬜ | |
| Team | Invite | ⬜ | |
| Team | Resend/Cancel | ⬜ | |
| Customers | Create (PM) | ⬜ | |
| Customers | Create (PF) | ⬜ | |
| Customers | Search | ⬜ | |
| Customers | Edit | ⬜ | |
| Customers | Delete | ⬜ | |
| Products | Create Product | ⬜ | |
| Products | Create Service | ⬜ | |
| Products | Filter | ⬜ | |
| Products | Search | ⬜ | |
| Products | Inventory | ⬜ | |

**Legend:** ⬜ Not tested | ✅ Passed | ❌ Failed | ⚠️ Partial

---

## Next Steps After Testing

1. **Document any bugs** found during testing
2. **Create GitHub issues** for each bug
3. **Prioritize fixes** before moving to Phase 2 (Invoicing)
4. **Consider adding** automated E2E tests with Playwright or Cypress
