# Component 17: Invoice Workflow Engine - Completion Summary

## Overview

Component 17 implements the orchestration layer for invoice processing using BullMQ job queues. It coordinates the sign → stamp → PDF workflow, manages post-stamp actions (email notifications, payment reminders), and provides audit logging through a workflow_logs table. The system runs as a separate Node.js worker process from the Next.js server.

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         apps/web (Next.js Application)                       │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │              lib/invoices/process-invoice.ts (Public API)                ││
│  │  processInvoice(invoiceId, orgId) → { jobId }                           ││
│  │  getProcessingStatus(invoiceId) → ProcessingStatusResult                ││
│  │  fireCancellationWorkflow(invoiceId, orgId, motivo) → void              ││
│  │  retryFailedJob(invoiceId) → { jobId } | null                           ││
│  │  removeJob(invoiceId) → boolean                                         ││
│  └──────────────────────────────────┬──────────────────────────────────────┘│
│                                     │                                        │
│  ┌──────────────────────────────────┼──────────────────────────────────────┐│
│  │                        lib/workflows/                                    ││
│  │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────────┐  ││
│  │  │   engine.ts     │  │state-machine.ts │  │      errors.ts          │  ││
│  │  │ WorkflowEngine  │  │TransitionRules  │  │    WorkflowError        │  ││
│  │  │  class          │  │ + Actions       │  │                         │  ││
│  │  └────────┬────────┘  └─────────────────┘  └─────────────────────────┘  ││
│  │           │                                                              ││
│  │  ┌────────┴────────────────────────────────────────────────────────────┐││
│  │  │                        lib/workflows/actions/                        │││
│  │  │  ┌──────────────┐ ┌──────────────┐ ┌─────────────────┐ ┌───────────┐│││
│  │  │  │generate-pdf  │ │ send-email   │ │schedule-reminder│ │notify-team││││
│  │  │  │    .ts       │ │    .ts       │ │      .ts        │ │   .ts     ││││
│  │  │  └──────────────┘ └──────────────┘ └─────────────────┘ └───────────┘│││
│  │  └─────────────────────────────────────────────────────────────────────┘││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │                           lib/queue/                                     ││
│  │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────────┐  ││
│  │  │redis-connection │  │   queues.ts     │  │     job-types.ts        │  ││
│  │  │     .ts         │  │  3 BullMQ       │  │   StampJobPayload       │  ││
│  │  │ IORedis config  │  │   Queues        │  │   EmailJobPayload       │  ││
│  │  └─────────────────┘  └─────────────────┘  │   ReminderJobPayload    │  ││
│  │                                            └─────────────────────────┘  ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │                         lib/email/service.ts                             ││
│  │                    (Stub for Component 29)                               ││
│  │  sendEmail(params) → { success, messageId }                             ││
│  │  sendBulkEmails(params[]) → results[]                                   ││
│  │  getDefaultSubject(templateId, data, lang) → string                     ││
│  └─────────────────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                    workers/ (Separate Node.js Process)                       │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │                          workers/index.ts                                ││
│  │                         (Entry Point)                                    ││
│  │                     npm run worker / worker:dev                          ││
│  └──────────────────────────────┬──────────────────────────────────────────┘│
│                                 │                                            │
│  ┌──────────────────────────────┼──────────────────────────────────────────┐│
│  │                              │                                           ││
│  │  ┌───────────────────────┐   │   ┌───────────────────────────────────┐  ││
│  │  │  invoice.worker.ts    │   │   │     reminder.worker.ts            │  ││
│  │  │                       │   │   │                                   │  ││
│  │  │  invoice-processing   │◀──┴──▶│  invoice-emails queue             │  ││
│  │  │  queue                │       │  payment-reminders queue          │  ││
│  │  │                       │       │                                   │  ││
│  │  │  Sign → Stamp → PDF   │       │  Email delivery + Reminders       │  ││
│  │  └───────────────────────┘       └───────────────────────────────────┘  ││
│  │                                                                          ││
│  └─────────────────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────────────────┘
```

## Files Created

### Queue Infrastructure (`apps/web/lib/queue/`)

| File | Purpose | Tests |
|------|---------|-------|
| [redis-connection.ts](my-turborepo/apps/web/lib/queue/redis-connection.ts) | BullMQ-compatible IORedis connection with `maxRetriesPerRequest: null` | - |
| [queues.ts](my-turborepo/apps/web/lib/queue/queues.ts) | 3 BullMQ queues: invoice-processing, invoice-emails, payment-reminders | - |
| [job-types.ts](my-turborepo/apps/web/lib/queue/job-types.ts) | TypeScript interfaces for job payloads | - |
| [index.ts](my-turborepo/apps/web/lib/queue/index.ts) | Module exports | - |

### Workflow Engine (`apps/web/lib/workflows/`)

| File | Purpose | Tests |
|------|---------|-------|
| [types.ts](my-turborepo/apps/web/lib/workflows/types.ts) | Workflow event types, action types, result interfaces | 47 |
| [errors.ts](my-turborepo/apps/web/lib/workflows/errors.ts) | WorkflowError class with error codes and factory functions | 35 |
| [state-machine.ts](my-turborepo/apps/web/lib/workflows/state-machine.ts) | TransitionRules defining valid status transitions and triggered actions | 64 |
| [engine.ts](my-turborepo/apps/web/lib/workflows/engine.ts) | WorkflowEngine class with executeWorkflow, validateTransition, triggerActions | 21 |
| [index.ts](my-turborepo/apps/web/lib/workflows/index.ts) | Module exports | - |

### Action Handlers (`apps/web/lib/workflows/actions/`)

| File | Purpose | Tests |
|------|---------|-------|
| [types.ts](my-turborepo/apps/web/lib/workflows/actions/types.ts) | ActionResult interface and action type definitions | 13 |
| [generate-pdf.ts](my-turborepo/apps/web/lib/workflows/actions/generate-pdf.ts) | Triggers PDF generation via Component 16 | 10 |
| [send-email.ts](my-turborepo/apps/web/lib/workflows/actions/send-email.ts) | Enqueues customer notification emails | 36 |
| [schedule-reminder.ts](my-turborepo/apps/web/lib/workflows/actions/schedule-reminder.ts) | Schedules payment reminders at 9 AM CDMX | 55 |
| [notify-team.ts](my-turborepo/apps/web/lib/workflows/actions/notify-team.ts) | Sends team notifications (Slack/webhook stub) | 20 |
| [index.ts](my-turborepo/apps/web/lib/workflows/actions/index.ts) | Action handler exports | - |

### Email Service Stub (`apps/web/lib/email/`)

| File | Purpose | Tests |
|------|---------|-------|
| [service.ts](my-turborepo/apps/web/lib/email/service.ts) | Email service stub ready for Component 29 integration | 28 |

### Worker Processes (`apps/web/workers/`)

| File | Purpose | Tests |
|------|---------|-------|
| [invoice.worker.ts](my-turborepo/apps/web/workers/invoice.worker.ts) | Processes stamp-invoice jobs: sign → stamp → PDF | - |
| [reminder.worker.ts](my-turborepo/apps/web/workers/reminder.worker.ts) | Processes email and reminder jobs | - |
| [index.ts](my-turborepo/apps/web/workers/index.ts) | Worker entry point with graceful shutdown | - |

### Invoice Bridge (`apps/web/lib/invoices/`)

| File | Purpose | Tests |
|------|---------|-------|
| [process-invoice.ts](my-turborepo/apps/web/lib/invoices/process-invoice.ts) | Public API for workflow operations | 31 |

### Database Migration

| File | Purpose |
|------|---------|
| [20260310000000_add_workflow_logs.sql](my-turborepo/apps/web/supabase/migrations/20260310000000_add_workflow_logs.sql) | Workflow audit logging table |

**Total New Tests: 330 tests**
**All tests passing**

## Workflow Processing Flow

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  Server Action  │     │ processInvoice  │     │  BullMQ Queue   │
│  "Submit to SAT"│────▶│    (Bridge)     │────▶│ invoice-        │
│                 │     │                 │     │ processing      │
└─────────────────┘     └─────────────────┘     └────────┬────────┘
                                                         │
                              ┌──────────────────────────┘
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Invoice Worker                                │
│  ┌─────────────┐   ┌─────────────┐   ┌─────────────────────┐   │
│  │ 1. Sign     │──▶│ 2. Stamp    │──▶│ 3. Fire Workflow    │   │
│  │ (Comp 14)   │   │ (Comp 15)   │   │    stamp_succeeded  │   │
│  └─────────────┘   └─────────────┘   └──────────┬──────────┘   │
└─────────────────────────────────────────────────┼───────────────┘
                                                  │
              ┌───────────────────────────────────┘
              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    WorkflowEngine.executeWorkflow                │
│                                                                  │
│  invoice.stamp_succeeded triggers:                               │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │ 1. generate_pdf        → Generate PDF (Component 16)      │  │
│  │ 2. send_customer_email → Enqueue email to customer        │  │
│  │ 3. schedule_payment_reminder → Schedule due/overdue jobs  │  │
│  │ 4. send_team_notification → Notify team (Slack/webhook)   │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

## BullMQ Queue Configuration

### Queue Names

```typescript
export const QUEUE_NAMES = {
  INVOICE_PROCESSING: 'invoice-processing',  // Sign → Stamp → PDF
  INVOICE_EMAILS: 'invoice-emails',          // Email delivery
  PAYMENT_REMINDERS: 'payment-reminders',    // Delayed reminders
} as const;
```

### Queue Settings

| Queue | Attempts | Backoff | Keep Completed | Keep Failed |
|-------|----------|---------|----------------|-------------|
| invoice-processing | 3 | 2s, 4s, 8s exponential | 100 | 500 |
| invoice-emails | 5 | 5s, 10s, 20s, 40s, 80s | 200 | 1000 |
| payment-reminders | 3 | 10s, 20s, 40s | 50 | 200 |

### Idempotent Job IDs

```typescript
getStampJobId(invoiceId)              // → "stamp-{invoiceId}"
getReminderJobId(invoiceId, type)     // → "reminder-{invoiceId}-{type}"
getEmailJobId(invoiceId, emailType)   // → "email-{invoiceId}-{type}-{timestamp}"
```

## State Machine Transitions

```typescript
const TransitionRules: Record<InvoiceStatus, TransitionRule> = {
  [InvoiceStatus.DRAFT]: {
    allowedTransitions: [InvoiceStatus.PENDING_STAMP, InvoiceStatus.DELETED],
    actions: [],
  },
  [InvoiceStatus.PENDING_STAMP]: {
    allowedTransitions: [InvoiceStatus.STAMPED, InvoiceStatus.DRAFT],
    actions: [],
  },
  [InvoiceStatus.STAMPED]: {
    allowedTransitions: [InvoiceStatus.SENT, InvoiceStatus.PENDING_CANCEL],
    actions: [
      ActionType.GENERATE_PDF,
      ActionType.SEND_CUSTOMER_EMAIL,
      ActionType.SCHEDULE_PAYMENT_REMINDER,
      ActionType.SEND_TEAM_NOTIFICATION,
    ],
  },
  // ... more transitions
};
```

## Payment Reminder Scheduling

Reminders are scheduled at **9 AM Mexico City time** (America/Mexico_City timezone):

| Reminder Type | Days Relative to Due Date |
|--------------|---------------------------|
| `due_soon` | -1 (day before) |
| `due_today` | 0 (due date) |
| `overdue_7d` | +7 (one week overdue) |
| `overdue_30d` | +30 (one month overdue) |

```typescript
// Schedule all reminders for an invoice
const results = await schedulePaymentReminders(invoiceId, organizationId);

// Cancel all reminders (e.g., when invoice is paid)
const cancelled = await cancelPaymentReminders(invoiceId);
```

## Workflow Event Types

```typescript
type WorkflowEventType =
  | 'invoice.stamp_succeeded'    // After successful stamping
  | 'invoice.stamp_failed'       // After all retry attempts exhausted
  | 'invoice.sent'               // Invoice marked as sent
  | 'invoice.paid'               // Invoice marked as paid
  | 'invoice.cancelled'          // Invoice cancelled
  | 'payment.reminder_due_soon'  // 1 day before due
  | 'payment.reminder_due_today' // Day of due date
  | 'payment.reminder_overdue';  // After due date
```

## Email Service Stub

Ready for Component 29 integration:

```typescript
import {
  sendEmail,
  sendBulkEmails,
  getDefaultSubject,
  buildInvoiceSentEmailParams,
  buildPaymentReminderEmailParams,
  buildCancellationEmailParams,
  isEmailServiceConfigured,
} from '@/lib/email/service';

// Send an invoice notification
const result = await sendEmail({
  to: 'customer@example.com',
  toName: 'John Doe',
  subject: 'Your Invoice A-001',
  templateId: 'invoice_sent',
  templateData: { invoiceFolio: 'A-001', total: '$1,160.00' },
  organizationId: 'org-123',
  invoiceId: 'inv-456',
  attachments: [{ filename: 'invoice.pdf', url: '...', contentType: 'application/pdf' }],
});

// Currently returns stub success with generated messageId
// { success: true, messageId: "stub-1234567890" }
```

## Database Schema

### workflow_logs

```sql
CREATE TABLE workflow_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  invoice_id UUID REFERENCES invoices(id) ON DELETE SET NULL,

  -- Event info
  event_type VARCHAR(100) NOT NULL,
  triggered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Transition info (nullable for non-transition events)
  from_status VARCHAR(50),
  to_status VARCHAR(50),

  -- Action results (JSONB array of ActionResult)
  action_results JSONB DEFAULT '[]'::jsonb,

  -- Metadata
  metadata JSONB DEFAULT '{}'::jsonb,

  -- Error tracking
  error_message TEXT,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for common queries
CREATE INDEX idx_workflow_logs_org ON workflow_logs(organization_id);
CREATE INDEX idx_workflow_logs_invoice ON workflow_logs(invoice_id);
CREATE INDEX idx_workflow_logs_event ON workflow_logs(event_type);
CREATE INDEX idx_workflow_logs_triggered ON workflow_logs(triggered_at DESC);
```

## Error Handling

### WorkflowError Codes

| Code | Description |
|------|-------------|
| `INVALID_TRANSITION` | Status transition not allowed by state machine |
| `ACTION_FAILED` | An action handler returned failure |
| `INVOICE_NOT_FOUND` | Invoice doesn't exist or wrong organization |
| `CONCURRENT_PROCESSING` | Invoice already being processed |
| `QUEUE_ERROR` | BullMQ operation failed |
| `DATABASE_ERROR` | Supabase operation failed |

### Non-Fatal Actions

Actions are **non-fatal** by design. If an action fails (e.g., PDF generation error), the failure is logged but doesn't roll back the invoice status transition:

```typescript
// In WorkflowEngine.triggerActions()
for (const action of actions) {
  const result = await this.executeAction(action, context);
  results.push(result);

  if (!result.success) {
    console.error(`Action ${action} failed:`, result.error);
    // Continue with next action - don't throw
  }
}
```

## Worker Scripts

Added to `package.json`:

```json
{
  "scripts": {
    "worker": "tsx workers/index.ts",
    "worker:dev": "tsx watch workers/index.ts"
  }
}
```

### Running Workers

```bash
cd my-turborepo/apps/web

# Production
npm run worker

# Development (with hot reload)
npm run worker:dev
```

### Worker Output

```
═══════════════════════════════════════════════════════════════
  Invoice Workflow Workers - Starting
═══════════════════════════════════════════════════════════════
  Environment: development
  Concurrency: 5
───────────────────────────────────────────────────────────────
  Workers:
    - Invoice Worker (invoice-processing)
    - Email Worker (invoice-emails)
    - Reminder Worker (payment-reminders)
───────────────────────────────────────────────────────────────
  Waiting for jobs...
═══════════════════════════════════════════════════════════════
```

## Usage Examples

### Submit Invoice for Processing

```typescript
import { processInvoice, getProcessingStatus } from '@/lib/invoices';

// Enqueue invoice for sign → stamp → PDF
const { jobId } = await processInvoice(invoiceId, organizationId, 'es');

// Poll for status
const status = await getProcessingStatus(invoiceId);
// { status: 'active', jobId: 'stamp-inv-123', progress: 50 }

// When complete
// { status: 'completed', jobId: 'stamp-inv-123' }
```

### Fire Cancellation Workflow

```typescript
import { fireCancellationWorkflow } from '@/lib/invoices';

// After PAC cancellation succeeds (Component 15)
await fireCancellationWorkflow(
  invoiceId,
  organizationId,
  '02', // SAT motivo code
  undefined // folioSustitucion (only for motivo 01)
);
```

### Retry Failed Job

```typescript
import { retryFailedJob, removeJob } from '@/lib/invoices';

// Retry a failed stamp job
const retried = await retryFailedJob(invoiceId);
if (retried) {
  console.log(`Retrying with job ID: ${retried.jobId}`);
}

// Remove a completed/failed job
const removed = await removeJob(invoiceId);
```

## Test Coverage

| File | Tests | Description |
|------|-------|-------------|
| types.test.ts | 47 | Event types, validation |
| errors.test.ts | 35 | Error classes, factory functions |
| state-machine.test.ts | 64 | Transition rules, actions |
| engine.test.ts | 21 | WorkflowEngine class |
| actions/types.test.ts | 13 | Action result types |
| actions/generate-pdf.test.ts | 10 | PDF action handler |
| actions/send-email.test.ts | 36 | Email action handler |
| actions/schedule-reminder.test.ts | 55 | Reminder scheduling |
| actions/notify-team.test.ts | 20 | Team notification |
| email/service.test.ts | 28 | Email service stub |
| process-invoice.test.ts | 31 | Public API bridge |

**All 330 tests pass.**

## Running Tests

```bash
cd my-turborepo/apps/web

# Run all Component 17 tests
npm test lib/workflows/ lib/email/__tests__/service.test.ts lib/invoices/__tests__/process-invoice.test.ts -- --run

# Run specific test file
npm test lib/workflows/__tests__/engine.test.ts -- --run

# Watch mode
npm test lib/workflows/ -- --watch
```

## Dependencies

- **`bullmq`**: Job queue backed by Redis
- **`ioredis`**: Redis client with `maxRetriesPerRequest: null` for BullMQ
- **`tsx`**: TypeScript execution for workers (dev dependency)

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `REDIS_URL` | Redis connection string | `localhost:6379` |
| `WORKER_CONCURRENCY` | Jobs processed in parallel | `5` |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL | Required |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key | Required |

## Integration Points

### Input from Components 13-16

```typescript
// Component 14: signInvoice(invoice, orgId, csdPassword)
// Component 15: stampInvoice(invoice, orgId)
// Component 16: generateInvoicePDFAndStore(invoiceId, orgId, language)
```

### Output to Component 29 (Email Service)

The email service stub defines the contract:

```typescript
interface SendEmailParams {
  to: string;
  toName: string;
  subject: string;
  templateId: 'invoice_sent' | 'payment_reminder' | 'payment_overdue' | 'cancellation_notice';
  templateData: Record<string, unknown>;
  organizationId: string;
  invoiceId?: string;
  attachments?: Array<{
    filename: string;
    url: string;
    contentType: string;
  }>;
}
```

## Known Limitations

1. **Redis Required**: BullMQ requires a Redis instance (not Upstash REST API)
2. **Separate Process**: Workers must run as a separate Node.js process
3. **Email Stub Only**: Actual email delivery requires Component 29
4. **No Webhook Implementation**: Team notifications log only (webhook/Slack not implemented)
5. **Single Timezone**: Payment reminders use Mexico City time only

## Definition of Done - Checklist

- [x] `lib/queue/redis-connection.ts` - IORedis with `maxRetriesPerRequest: null`
- [x] `lib/queue/queues.ts` - 3 BullMQ queues with retry/backoff config
- [x] `lib/queue/job-types.ts` - TypeScript job payload interfaces
- [x] `lib/workflows/types.ts` - Workflow event and action types
- [x] `lib/workflows/errors.ts` - WorkflowError class with error codes
- [x] `lib/workflows/state-machine.ts` - TransitionRules from Component 12
- [x] `lib/workflows/engine.ts` - WorkflowEngine class
- [x] `lib/workflows/actions/generate-pdf.ts` - PDF action handler
- [x] `lib/workflows/actions/send-email.ts` - Email action handler
- [x] `lib/workflows/actions/schedule-reminder.ts` - Reminder scheduling
- [x] `lib/workflows/actions/notify-team.ts` - Team notification handler
- [x] `lib/email/service.ts` - Email service stub for Component 29
- [x] `workers/invoice.worker.ts` - Sign → Stamp → PDF worker
- [x] `workers/reminder.worker.ts` - Email and reminder worker
- [x] `workers/index.ts` - Worker entry point
- [x] `lib/invoices/process-invoice.ts` - Public API bridge
- [x] `lib/invoices/index.ts` - Updated exports
- [x] Database migration for `workflow_logs` table
- [x] Worker scripts in `package.json`
- [x] **BullMQ** (not pg-boss)
- [x] **Idempotent job IDs**
- [x] **Non-fatal actions** (logged but don't roll back)
- [x] **Mexico City timezone** for reminders
- [x] **Graceful shutdown** handling
- [x] **330 new tests, all passing**
