# Phase 4: Invoice Management - End-to-End Testing Guide

## Overview

This guide provides comprehensive end-to-end testing procedures for Phase 4 (Invoice Management), covering Components 12-17:

| Component | Name | Purpose |
|-----------|------|---------|
| 12 | Invoice Service (Core) | CRUD operations, calculations, workflow states |
| 13 | CFDI XML Generator | SAT CFDI 4.0 compliant XML generation |
| 14 | Digital Signature Service | CSD certificate signing |
| 15 | PAC Integration Service | SAT timbrado via PAC provider |
| 16 | PDF Generator Service | SAT-compliant invoice PDF generation |
| 17 | Invoice Workflow Engine | BullMQ job orchestration |

---

## Prerequisites

### 1. Environment Setup

Ensure these environment variables are configured in `.env.local`:

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# Redis (for BullMQ)
REDIS_URL=redis://localhost:6379

# R2 Storage (for PDFs)
R2_ACCOUNT_ID=your_account_id
R2_ACCESS_KEY_ID=your_access_key
R2_SECRET_ACCESS_KEY=your_secret_key
R2_BUCKET_NAME=your_bucket
R2_PUBLIC_URL=https://your-r2-domain.com

# PAC Provider (Finkok sandbox)
PAC_PROVIDER=finkok
FINKOK_USERNAME=your_sandbox_username
FINKOK_PASSWORD=your_sandbox_password
PAC_ENVIRONMENT=sandbox
```

### 2. Local Services

Start required services:

```bash
# Start Supabase local instance
cd my-turborepo/apps/web
npm run supabase:start

# Start Redis (in separate terminal)
redis-server

# Start worker process (in separate terminal)
npm run worker:dev
```

### 3. Database State

Ensure database has:
- At least one organization with valid SAT data
- At least one customer with valid RFC
- At least one product with SAT product/unit codes
- CSD certificate uploaded for the organization

```sql
-- Verify organization setup
SELECT id, legal_name, rfc, tax_regime FROM organizations LIMIT 1;

-- Verify customer exists
SELECT id, legal_name, rfc FROM customers WHERE organization_id = '{org_id}' LIMIT 1;

-- Verify products exist
SELECT id, name, sat_product_code, sat_unit_code FROM products WHERE organization_id = '{org_id}' LIMIT 1;

-- Verify CSD is uploaded
SELECT id, serial_number, valid_from, valid_to FROM organization_csds WHERE organization_id = '{org_id}';
```

### 4. Test Data

Create test data using the seed script or manually:

```bash
npm run db:seed
```

---

## Test Scenarios

### Test 1: Create Draft Invoice

**Objective:** Verify invoice creation with line items and tax calculations.

**Steps:**

1. **Create invoice via Server Action:**

```typescript
import { createInvoiceAction } from '@/lib/invoices';

const result = await createInvoiceAction({
  customerId: 'customer-uuid',
  serie: 'A',
  tipoComprobante: 'I',  // Ingreso
  metodoPago: 'PUE',     // Pago en una sola exhibición
  formaPago: '03',       // Transferencia electrónica
  usoCfdi: 'G03',        // Gastos en general
  moneda: 'MXN',
  condicionesPago: 'Pago inmediato',
  items: [
    {
      productId: 'product-uuid',
      description: 'Servicio de consultoría',
      quantity: 10,
      unitPrice: 1000.00,
      discount: 0,
      taxObject: '02',  // Sí objeto de impuesto
      taxes: [
        { impuesto: '002', tipoFactor: 'Tasa', tasaOCuota: 0.16, base: 10000 }
      ]
    }
  ]
});
```

2. **Expected Result:**

```typescript
{
  success: true,
  data: {
    id: 'inv-uuid',
    folio: 'A-001',
    status: 'draft',
    subtotal: 10000.00,
    totalImpuestosTrasladados: 1600.00,
    total: 11600.00,
    items: [/* ... */]
  }
}
```

3. **Verification Queries:**

```sql
-- Check invoice was created
SELECT id, folio, status, subtotal, total FROM invoices WHERE id = '{invoice_id}';

-- Check items were created
SELECT * FROM invoice_items WHERE invoice_id = '{invoice_id}';
```

**Pass Criteria:**
- [ ] Invoice created with status `draft`
- [ ] Folio auto-generated based on serie
- [ ] Subtotal, taxes, and total calculated correctly
- [ ] Items linked to invoice

---

### Test 2: CFDI XML Generation (Component 13)

**Objective:** Verify XML generation meets CFDI 4.0 specification.

**Steps:**

1. **Generate CFDI preview:**

```typescript
import { generateCFDIPreview } from '@/lib/invoices';

const invoice = await getInvoice(invoiceId, organizationId);
const result = await generateCFDIPreview(invoice);

console.log('XML Preview:', result.xml);
console.log('Warnings:', result.warnings);
```

2. **Expected XML Structure:**

```xml
<?xml version="1.0" encoding="UTF-8"?>
<cfdi:Comprobante
  xmlns:cfdi="http://www.sat.gob.mx/cfd/4"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xsi:schemaLocation="http://www.sat.gob.mx/cfd/4 http://www.sat.gob.mx/sitio_internet/cfd/4/cfdv40.xsd"
  Version="4.0"
  Serie="A"
  Folio="001"
  Fecha="2026-03-10T12:00:00"
  FormaPago="03"
  SubTotal="10000.00"
  Moneda="MXN"
  Total="11600.00"
  TipoDeComprobante="I"
  MetodoPago="PUE"
  LugarExpedicion="06600"
  Exportacion="01">

  <cfdi:Emisor
    Rfc="AAA010101AAA"
    Nombre="Mi Empresa SA de CV"
    RegimenFiscal="601"/>

  <cfdi:Receptor
    Rfc="BBB020202BBB"
    Nombre="Cliente SA de CV"
    DomicilioFiscalReceptor="01000"
    RegimenFiscalReceptor="601"
    UsoCFDI="G03"/>

  <cfdi:Conceptos>
    <cfdi:Concepto
      ClaveProdServ="80101500"
      Cantidad="10"
      ClaveUnidad="E48"
      Descripcion="Servicio de consultoría"
      ValorUnitario="1000.00"
      Importe="10000.00"
      ObjetoImp="02">
      <cfdi:Impuestos>
        <cfdi:Traslados>
          <cfdi:Traslado
            Base="10000.00"
            Impuesto="002"
            TipoFactor="Tasa"
            TasaOCuota="0.160000"
            Importe="1600.00"/>
        </cfdi:Traslados>
      </cfdi:Impuestos>
    </cfdi:Concepto>
  </cfdi:Conceptos>

  <cfdi:Impuestos TotalImpuestosTrasladados="1600.00">
    <cfdi:Traslados>
      <cfdi:Traslado
        Base="10000.00"
        Impuesto="002"
        TipoFactor="Tasa"
        TasaOCuota="0.160000"
        Importe="1600.00"/>
    </cfdi:Traslados>
  </cfdi:Impuestos>

</cfdi:Comprobante>
```

3. **Validate with SAT XSD (optional):**

```bash
# Download SAT schema
curl -O http://www.sat.gob.mx/sitio_internet/cfd/4/cfdv40.xsd

# Validate XML
xmllint --schema cfdv40.xsd generated.xml --noout
```

**Pass Criteria:**
- [ ] XML validates against CFDI 4.0 XSD
- [ ] All required attributes present
- [ ] Monetary values formatted to 2 decimal places
- [ ] Tax rates formatted to 6 decimal places
- [ ] Namespace declarations correct

---

### Test 3: Digital Signature (Component 14)

**Objective:** Verify CSD signing produces valid Sello and NoCertificado.

**Steps:**

1. **Sign the invoice:**

```typescript
import { signInvoice } from '@/lib/invoices';

const invoice = await getInvoice(invoiceId, organizationId);
const csdPassword = 'your-csd-password';  // From secure storage

const signResult = await signInvoice(invoice, organizationId, csdPassword);

console.log('Signed XML:', signResult.signedXml);
console.log('Sello:', signResult.sello);
console.log('NoCertificado:', signResult.noCertificado);
console.log('Cert Info:', signResult.certInfo);
```

2. **Verify signature attributes in XML:**

```xml
<cfdi:Comprobante
  ...
  Sello="base64-encoded-signature..."
  NoCertificado="30001000000400002495"
  Certificado="base64-encoded-certificate...">
```

3. **Validation checks:**

```typescript
// Verify NoCertificado is 20 characters
expect(signResult.noCertificado).toHaveLength(20);

// Verify Sello is base64
expect(signResult.sello).toMatch(/^[A-Za-z0-9+/=]+$/);

// Verify certificate dates
expect(new Date(signResult.certInfo.validFrom)).toBeLessThan(new Date());
expect(new Date(signResult.certInfo.validTo)).toBeGreaterThan(new Date());
```

**Pass Criteria:**
- [ ] Sello attribute populated with base64 signature
- [ ] NoCertificado is exactly 20 characters
- [ ] Certificado attribute contains full certificate
- [ ] Certificate is within validity period
- [ ] XML structure preserved after signing

---

### Test 4: PAC Stamping (Component 15)

**Objective:** Verify timbrado with PAC provider returns valid TFD.

**Prerequisites:**
- PAC sandbox credentials configured
- Valid signed XML from Test 3

**Steps:**

1. **Stamp with PAC:**

```typescript
import { stampInvoice, isPACError } from '@/lib/invoices';

try {
  const invoice = await getInvoice(invoiceId, organizationId);
  // Invoice should have signed XML in cfdi_xml field

  const stampResult = await stampInvoice(invoice, organizationId);

  console.log('UUID:', stampResult.uuid);
  console.log('Fecha Timbrado:', stampResult.fechaTimbrado);
  console.log('TFD:', stampResult.tfd);
  console.log('Stamped XML:', stampResult.stampedXml);
} catch (error) {
  if (isPACError(error)) {
    console.error('PAC Error:', error.code, error.message);
    console.error('Retryable:', error.retryable);
  }
}
```

2. **Verify TFD in stamped XML:**

```xml
<cfdi:Comprobante ...>
  <!-- ... invoice content ... -->

  <cfdi:Complemento>
    <tfd:TimbreFiscalDigital
      xmlns:tfd="http://www.sat.gob.mx/TimbreFiscalDigital"
      Version="1.1"
      UUID="05c519de-6d20-4258-88fb-c69a5970e927"
      FechaTimbrado="2026-03-10T12:00:00"
      RfcProvCertif="SPR190613I52"
      SelloCFD="..."
      NoCertificadoSAT="30001000000400002495"
      SelloSAT="..."/>
  </cfdi:Complemento>
</cfdi:Comprobante>
```

3. **Verify with SAT portal (optional):**

Visit: https://verificacfdi.facturaelectronica.sat.gob.mx/default.aspx

Enter UUID and verify it exists in SAT records.

**Pass Criteria:**
- [ ] UUID returned (36-character format)
- [ ] FechaTimbrado is valid timestamp
- [ ] TFD complement added to XML
- [ ] SelloSAT present
- [ ] Invoice status updated to `stamped`
- [ ] UUID stored in database

---

### Test 5: PDF Generation (Component 16)

**Objective:** Verify PDF generation includes all required elements.

**Prerequisites:**
- Stamped invoice from Test 4

**Steps:**

1. **Generate PDF:**

```typescript
import { generateInvoicePDFAndStore } from '@/lib/invoices';

const result = await generateInvoicePDFAndStore(
  invoiceId,
  organizationId,
  'es'  // or 'en' for English
);

console.log('PDF URL:', result.url);
console.log('R2 Key:', result.r2Key);
console.log('UUID:', result.uuid);
console.log('Page Count:', result.pageCount);
```

2. **Verify PDF contents:**

Download and visually inspect the PDF for:

- [ ] Company header with logo (if configured)
- [ ] Invoice type badge (FACTURA / INGRESO)
- [ ] Folio and serie
- [ ] Issuer information (RFC, name, tax regime, postal code)
- [ ] Receiver information
- [ ] Items table with:
  - SAT product code
  - Quantity and unit
  - Description
  - Unit price and amount
  - Tax breakdown
- [ ] Totals section (subtotal, taxes, total)
- [ ] Stamp information:
  - UUID
  - Fecha de timbrado
  - RFC PAC
  - No. Certificado Emisor
  - No. Certificado SAT
  - Sello digital emisor (truncated)
  - Sello SAT (truncated)
- [ ] QR code (bottom left)
- [ ] SAT verification URL
- [ ] CFDI disclaimer text

3. **Verify QR code:**

Scan the QR code with a mobile device. It should open:

```
https://verificacfdi.facturaelectronica.sat.gob.mx/default.aspx
  ?id=UUID
  &re=RFC_EMISOR
  &rr=RFC_RECEPTOR
  &tt=TOTAL
  &fe=LAST_8_SELLO
```

**Pass Criteria:**
- [ ] PDF generated without errors
- [ ] PDF uploaded to R2 storage
- [ ] All required sections present
- [ ] QR code scannable and correct
- [ ] SAT verification URL accessible
- [ ] PDF URL stored in database

---

### Test 6: Full Workflow via Worker (Component 17)

**Objective:** Verify end-to-end workflow from draft to stamped via BullMQ.

**Prerequisites:**
- Redis running
- Worker process running (`npm run worker:dev`)
- Draft invoice ready

**Steps:**

1. **Submit invoice for processing:**

```typescript
import { processInvoice, getProcessingStatus } from '@/lib/invoices';

// Submit to workflow
const { jobId } = await processInvoice(invoiceId, organizationId, 'es');
console.log('Job enqueued:', jobId);

// Poll for status
let status;
do {
  await new Promise(resolve => setTimeout(resolve, 1000));
  status = await getProcessingStatus(invoiceId);
  console.log('Status:', status);
} while (status.status === 'waiting' || status.status === 'active');

if (status.status === 'completed') {
  console.log('Invoice processed successfully!');
} else if (status.status === 'failed') {
  console.error('Processing failed:', status.failReason);
}
```

2. **Monitor worker logs:**

Watch the worker terminal for:

```
[invoice-worker] Processing job stamp-inv-123 for invoice inv-123 (attempt 1)
[invoice-worker] Signing invoice inv-123
[invoice-worker] Invoice inv-123 signed successfully
[invoice-worker] Stamping invoice inv-123
[invoice-worker] Invoice inv-123 stamped with UUID: 05c519de-...
[pdf-action] Generated PDF for invoice inv-123: https://cdn.example.com/invoice.pdf
[email-action] Enqueued email job for invoice inv-123
[reminder-action] Scheduled 4 reminders for invoice inv-123
[invoice-worker] Job stamp-inv-123 completed successfully
```

3. **Verify workflow log in database:**

```sql
SELECT
  event_type,
  from_status,
  to_status,
  action_results,
  triggered_at
FROM workflow_logs
WHERE invoice_id = '{invoice_id}'
ORDER BY triggered_at DESC;
```

**Pass Criteria:**
- [ ] Job enqueued successfully
- [ ] Worker processes job
- [ ] Invoice signed
- [ ] Invoice stamped
- [ ] PDF generated
- [ ] Email job enqueued
- [ ] Payment reminders scheduled
- [ ] Workflow log created
- [ ] Final status is `stamped`

---

### Test 7: Payment Reminder Scheduling (Component 17)

**Objective:** Verify payment reminders are scheduled correctly.

**Prerequisites:**
- Invoice with PPD payment method (requires due_date)

**Steps:**

1. **Create invoice with PPD:**

```typescript
const result = await createInvoiceAction({
  // ... other fields
  metodoPago: 'PPD',  // Pago en parcialidades o diferido
  dueDate: '2026-04-10',  // 30 days from now
});
```

2. **Process and check reminders:**

```typescript
import { reminderQueue } from '@/lib/queue';

// After processing completes, check scheduled jobs
const delayed = await reminderQueue.getDelayed();

console.log('Scheduled reminders:');
for (const job of delayed) {
  console.log(`  ${job.id}: ${job.data.reminderType} at ${new Date(job.timestamp)}`);
}
```

3. **Expected reminders:**

```
reminder-inv-123-due_soon:    2026-04-09 09:00 CDMX (1 day before)
reminder-inv-123-due_today:   2026-04-10 09:00 CDMX (due date)
reminder-inv-123-overdue_7d:  2026-04-17 09:00 CDMX (7 days after)
reminder-inv-123-overdue_30d: 2026-05-10 09:00 CDMX (30 days after)
```

**Pass Criteria:**
- [ ] 4 reminder jobs scheduled
- [ ] Jobs scheduled at 9 AM Mexico City time
- [ ] Idempotent job IDs used
- [ ] Reminders cancelled when invoice is paid

---

### Test 8: Invoice Cancellation (Component 15 + 17)

**Objective:** Verify invoice cancellation with PAC and workflow.

**Prerequisites:**
- Stamped invoice from Test 4/6

**Steps:**

1. **Cancel with SAT motivo:**

```typescript
import { cancelStampedInvoice, fireCancellationWorkflow } from '@/lib/invoices';

// Cancel with PAC
const cancelResult = await cancelStampedInvoice(
  invoice,
  organizationId,
  '02',  // Motivo: Comprobante emitido con errores sin relación
  undefined  // No replacement UUID needed for motivo 02
);

console.log('Cancellation result:', cancelResult);

// Fire cancellation workflow (sends notifications, cancels reminders)
await fireCancellationWorkflow(invoiceId, organizationId, '02');
```

2. **Verify cancellation:**

```sql
-- Check invoice status
SELECT id, status, cancelled_at FROM invoices WHERE id = '{invoice_id}';

-- Check reminders were removed
SELECT * FROM bullmq_jobs WHERE name LIKE 'reminder-{invoice_id}%';
```

**Pass Criteria:**
- [ ] PAC accepts cancellation
- [ ] Invoice status updated to `cancelled`
- [ ] Cancelled timestamp recorded
- [ ] Payment reminders removed from queue
- [ ] Cancellation email enqueued
- [ ] Team notification sent

---

### Test 9: Retry Failed Job (Component 17)

**Objective:** Verify failed jobs can be retried.

**Steps:**

1. **Simulate a failure (stop Redis temporarily or use invalid credentials):**

```bash
# Stop Redis
redis-cli shutdown
```

2. **Submit invoice:**

```typescript
const { jobId } = await processInvoice(invoiceId, organizationId);
// Job will fail due to Redis disconnect
```

3. **Restart Redis and retry:**

```bash
# Start Redis again
redis-server
```

```typescript
import { retryFailedJob, getProcessingStatus } from '@/lib/invoices';

const status = await getProcessingStatus(invoiceId);
console.log('Current status:', status);  // { status: 'failed', failReason: '...' }

// Retry the failed job
const retried = await retryFailedJob(invoiceId);
if (retried) {
  console.log('Retrying with job ID:', retried.jobId);
}
```

**Pass Criteria:**
- [ ] Failed job recorded correctly
- [ ] Retry function re-enqueues job
- [ ] Job processes successfully on retry
- [ ] Status transitions to completed

---

### Test 10: Concurrent Processing Prevention (Component 17)

**Objective:** Verify same invoice cannot be processed twice simultaneously.

**Steps:**

1. **Submit same invoice twice:**

```typescript
import { processInvoice } from '@/lib/invoices';

const promise1 = processInvoice(invoiceId, organizationId);
const promise2 = processInvoice(invoiceId, organizationId);

try {
  const [result1, result2] = await Promise.allSettled([promise1, promise2]);
  console.log('Result 1:', result1);
  console.log('Result 2:', result2);
} catch (error) {
  console.error('Error:', error);
}
```

2. **Expected behavior:**

- First call succeeds with job ID
- Second call throws `CONCURRENT_PROCESSING` error OR
- Second job uses same idempotent job ID (deduplicated by BullMQ)

**Pass Criteria:**
- [ ] Only one job actually runs
- [ ] Second attempt detected/deduplicated
- [ ] No duplicate stamps possible

---

## Manual Testing Checklist

### Pre-Flight Checks

- [ ] Supabase running and accessible
- [ ] Redis running on port 6379
- [ ] Worker process running (`npm run worker:dev`)
- [ ] R2 storage accessible
- [ ] PAC sandbox credentials valid
- [ ] CSD certificate not expired

### Happy Path Test

1. [ ] Create draft invoice with items
2. [ ] Verify calculations (subtotal, tax, total)
3. [ ] Submit for stamping
4. [ ] Monitor worker logs
5. [ ] Verify invoice stamped (UUID assigned)
6. [ ] Download and inspect PDF
7. [ ] Verify QR code works
8. [ ] Check email job queued
9. [ ] Check reminders scheduled (if PPD)
10. [ ] Mark as sent
11. [ ] Mark as paid
12. [ ] Verify reminders cancelled

### Error Handling Tests

1. [ ] Submit invalid invoice (missing required field)
2. [ ] Submit already-stamped invoice
3. [ ] Use expired CSD certificate
4. [ ] Disconnect Redis mid-process
5. [ ] Invalid PAC credentials
6. [ ] Network timeout to PAC

### Edge Cases

1. [ ] Invoice with 100+ line items
2. [ ] Invoice with discounts
3. [ ] Invoice with multiple tax types (IVA + ISR retention)
4. [ ] Invoice in USD with exchange rate
5. [ ] Invoice to RFC Público General (XAXX010101000)
6. [ ] Invoice to foreign entity (XEXX010101000)
7. [ ] Credit note (tipo_comprobante: E)
8. [ ] Invoice with related CFDI

---

## Automated Test Commands

```bash
cd my-turborepo/apps/web

# Run all Phase 4 unit tests
npm test lib/invoices/ lib/pdf/ lib/workflows/ lib/queue/ lib/email/ -- --run

# Run specific component tests
npm test lib/invoices/__tests__/calculations.test.ts -- --run
npm test lib/invoices/__tests__/workflow.test.ts -- --run
npm test lib/pdf/__tests__/ -- --run
npm test lib/workflows/__tests__/ -- --run

# Run with coverage
npm test lib/invoices/ lib/pdf/ lib/workflows/ -- --run --coverage

# Watch mode for development
npm test lib/invoices/ -- --watch
```

---

## Troubleshooting

### Common Issues

| Issue | Possible Cause | Solution |
|-------|----------------|----------|
| "Invoice not found" | Wrong org context | Verify organization_id matches |
| "Certificate expired" | CSD validity | Upload new CSD |
| "PAC connection timeout" | Network issues | Check firewall, try again |
| "Redis connection refused" | Redis not running | Start Redis server |
| "Worker not processing" | Worker not started | Run `npm run worker:dev` |
| "PDF generation failed" | Missing XML data | Ensure invoice is stamped first |
| "Duplicate job" | Job already exists | Use removeJob() first |

### Debug Commands

```bash
# Check Redis status
redis-cli ping

# View BullMQ queues
redis-cli keys "bull:*"

# View pending jobs
redis-cli lrange "bull:invoice-processing:wait" 0 -1

# View delayed jobs (reminders)
redis-cli zrange "bull:payment-reminders:delayed" 0 -1 withscores

# Clear all jobs (development only!)
redis-cli flushall
```

### Log Locations

- **Worker logs:** Terminal running `npm run worker:dev`
- **Application logs:** Browser console (client) or terminal (server actions)
- **Supabase logs:** Supabase dashboard → Logs
- **Workflow logs:** `workflow_logs` table in database

---

## Sign-Off

| Test | Tester | Date | Pass/Fail | Notes |
|------|--------|------|-----------|-------|
| Test 1: Create Draft | | | | |
| Test 2: CFDI XML | | | | |
| Test 3: Digital Signature | | | | |
| Test 4: PAC Stamping | | | | |
| Test 5: PDF Generation | | | | |
| Test 6: Full Workflow | | | | |
| Test 7: Payment Reminders | | | | |
| Test 8: Cancellation | | | | |
| Test 9: Retry Failed Job | | | | |
| Test 10: Concurrent Prevention | | | | |

**Phase 4 E2E Testing Complete:** [ ] Yes / [ ] No

**Sign-off Date:** _______________

**Tested By:** _______________
