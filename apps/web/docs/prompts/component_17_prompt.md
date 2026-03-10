# Component 17: Invoice Workflow Engine — Implementation Prompt

---

## Context for the Coding Agent

You are building Component 17 of a Mexican SAT tax compliance SaaS platform. The previous components have established:

- **Component 12**: Invoice data model (`invoices` table, statuses: `draft → pending_stamp → stamped → cancelled`)
- **Component 14**: Digital signature service (`signInvoice` → produces signed XML, transitions to `pending_stamp`)
- **Component 15**: PAC stamping service (`stampInvoice` → produces stamped XML + TFD, transitions to `stamped`)
- **Component 16**: PDF generator (`generateInvoicePDFAndStore` → produces PDF, sets `pdf_url`)

This component is the **orchestration layer** that:
1. Sequences those operations (sign → stamp → generate PDF) reliably
2. Fires post-stamp notifications (email to customer, internal team alert)
3. Schedules time-based follow-ups (payment reminders, overdue escalations)
4. Persists an audit log of every transition and action

It is **not** a user-facing UI feature — it is a server-side service that other parts of the app call.

---

## Scope Boundaries — What This Component Does and Does Not Do

**Does:**
- Define the valid invoice state machine (states + allowed transitions)
- Orchestrate `sign → stamp → pdf` as a reliable multi-step job
- Fire notifications when invoice transitions to `stamped` (email to customer, team Slack/email)
- Schedule payment reminders (day before due, on due date, overdue at configurable intervals)
- Persist a `workflow_logs` table recording every event, action result, and error
- Expose simple functions: `processInvoice(invoiceId, orgId)`, `scheduleReminders(invoiceId, orgId)`

**Does NOT:**
- Implement the email sender itself — stub/interface it; Component 29 will implement email delivery
- Implement WhatsApp delivery — stub the interface; it is a future action type
- Implement accounting sync — stub the interface
- Build a configurable rules UI — workflows are code-defined, not DB-configured
- Require a separate microservice — workers run as a separate Node.js process alongside the Next.js app
- Implement webhook delivery to external systems — out of scope

The email action in this component **creates a job** that calls an `EmailService` interface. The actual SMTP/SendGrid/SES integration is Component 29 (Email Service). This component must not block on Component 29 being built — use a stub.

---

## What's Already Built — Import, Don't Reimplement

### Redis Client
Redis is already configured in the project (Component 01 / auth caching with sub-5ms permission checks). Find the existing Redis connection — it is likely in `apps/web/lib/redis.ts` or `apps/web/lib/cache/redis.ts`. **Use the same connection**. Do NOT create a second Redis client.

The IORedis connection for BullMQ requires `maxRetriesPerRequest: null`. If the existing client doesn't set this, create a dedicated connection for BullMQ:
```typescript
// apps/web/lib/queue/redis-connection.ts
import IORedis from 'ioredis';

// BullMQ requires maxRetriesPerRequest: null
export const bullMQConnection = new IORedis(process.env.REDIS_URL!, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
});
```

### Invoice Service
```typescript
// Already exists in apps/web/lib/invoices/
import { signInvoice } from '@/lib/invoices/sign-invoice';      // Component 14
import { stampInvoice } from '@/lib/invoices/stamp-invoice';    // Component 15
import { generateInvoicePDFAndStore } from '@/lib/invoices/generate-pdf'; // Component 16
```

### Invoice Status Types
The `invoices` table has status: `'draft' | 'pending_stamp' | 'stamped' | 'cancelled'`.

### Supabase Client
Use the service-role Supabase client for worker processes (workers run outside the request context, so there is no session cookie):
```typescript
import { createClient } from '@supabase/supabase-js';
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);
```

---

## Job Queue: BullMQ (NOT pg-boss, NOT agenda)

Use **BullMQ** backed by the existing Redis instance.

**Rationale for BullMQ over pg-boss:**
- Redis is already deployed (Component 01 uses it for auth caching) — no new infrastructure
- BullMQ is TypeScript-native with excellent typing
- Delayed jobs (payment reminders) are first-class — `queue.add(name, data, { delay: ms })`
- Job deduplication via `jobId` prevents double-scheduling reminders
- Reliable at-least-once delivery with configurable retries and exponential backoff
- Actively maintained (npm weekly downloads: 800k+)

**Install:**
```bash
cd my-turborepo/apps/web
npm install bullmq ioredis
```

**Worker process:** Workers run as a **separate Node.js process** from the Next.js server. They are started with a dedicated script. The Next.js app only acts as a **producer** (enqueues jobs via `Queue`); it never instantiates `Worker` classes. This is the standard pattern for BullMQ in Next.js:

```
Next.js App (producer)          Worker Process (consumer)
      │                               │
      │  queue.add('stamp-invoice')   │
      │──────────────────────────────▶│  Worker processes job
      │                               │  (separate process, tsx worker.ts)
```

---

## File Structure

Use `apps/web/lib/` convention throughout. Do NOT use `src/server/`:

```
apps/web/lib/workflows/
├── types.ts                  # WorkflowEvent, WorkflowAction, TransitionRule, WorkflowLog
├── state-machine.ts          # INVOICE_STATES, VALID_TRANSITIONS, canTransition, getNextStates
├── errors.ts                 # WorkflowError, WorkflowErrorCode
├── actions/
│   ├── types.ts              # ActionResult, ActionHandler interface
│   ├── send-email.ts         # EmailAction: enqueues email job, calls EmailService stub
│   ├── generate-pdf.ts       # PDFAction: calls Component 16's generateInvoicePDFAndStore
│   ├── notify-team.ts        # TeamNotifyAction: internal notification stub
│   └── schedule-reminder.ts  # ReminderAction: schedules BullMQ delayed jobs
├── engine.ts                 # WorkflowEngine class: executeWorkflow, triggerActions, logging
└── index.ts                  # Public exports

apps/web/lib/queue/
├── redis-connection.ts       # Dedicated BullMQ IORedis connection
├── queues.ts                 # Queue instances: invoiceQueue, reminderQueue
├── job-types.ts              # Typed job payloads: StampJobData, ReminderJobData, EmailJobData
└── index.ts                  # Exports

apps/web/workers/
├── invoice.worker.ts         # Worker: processes stamp-invoice jobs
├── reminder.worker.ts        # Worker: processes reminder + email jobs
└── index.ts                  # Entry point: starts all workers (run as: tsx workers/index.ts)

apps/web/lib/invoices/
└── process-invoice.ts        # Public bridge: processInvoice(invoiceId, orgId) → enqueues job

supabase/migrations/
└── 20260310000000_add_workflow_logs.sql
```

---

## Step 1 — Types

Create `apps/web/lib/workflows/types.ts`:

```typescript
// All workflow-related type definitions

export type InvoiceStatus = 'draft' | 'pending_stamp' | 'stamped' | 'cancelled';

export type WorkflowEventType =
  | 'invoice.sign_requested'      // User clicks "Send to SAT"
  | 'invoice.stamp_succeeded'     // PAC returned TFD successfully
  | 'invoice.stamp_failed'        // PAC returned error after retries exhausted
  | 'invoice.pdf_generated'       // PDF created and stored
  | 'invoice.cancelled'           // Invoice cancelled via motivo
  | 'invoice.payment_due_soon'    // Reminder: payment due in N days
  | 'invoice.payment_overdue';    // Reminder: payment is past due date

export interface WorkflowEvent {
  type: WorkflowEventType;
  invoiceId: string;
  organizationId: string;
  triggeredAt: string;           // ISO timestamp
  metadata?: Record<string, unknown>;
}

export type ActionType =
  | 'send_customer_email'
  | 'send_team_notification'
  | 'generate_pdf'
  | 'schedule_payment_reminder'
  | 'cancel_scheduled_reminders';

export interface WorkflowAction {
  type: ActionType;
  invoiceId: string;
  organizationId: string;
  payload?: Record<string, unknown>;
}

export interface ActionResult {
  actionType: ActionType;
  success: boolean;
  jobId?: string;               // BullMQ job ID if enqueued
  error?: string;
  executedAt: string;
}

export interface TransitionRule {
  from: InvoiceStatus;
  to: InvoiceStatus;
  trigger: WorkflowEventType;
  actions: ActionType[];         // Actions to fire on this transition
}

export interface WorkflowLogEntry {
  id: string;
  invoiceId: string;
  organizationId: string;
  eventType: WorkflowEventType;
  fromStatus: InvoiceStatus | null;
  toStatus: InvoiceStatus | null;
  actionsTriggered: ActionType[];
  actionResults: ActionResult[];
  success: boolean;
  errorMessage: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}

// Job payload types (what gets stored in BullMQ/Redis)
export interface StampJobPayload {
  invoiceId: string;
  organizationId: string;
  language: 'es' | 'en';
  attemptNumber: number;
}

export interface ReminderJobPayload {
  invoiceId: string;
  organizationId: string;
  reminderType: 'due_soon' | 'due_today' | 'overdue_7d' | 'overdue_30d';
  daysUntilDue: number;          // Negative = overdue
}

export interface EmailJobPayload {
  invoiceId: string;
  organizationId: string;
  emailType: 'invoice_sent' | 'payment_reminder' | 'payment_overdue' | 'cancellation_notice';
  recipientEmail: string;
  recipientName: string;
  language: 'es' | 'en';
  metadata?: Record<string, unknown>;
}
```

---

## Step 2 — State Machine

Create `apps/web/lib/workflows/state-machine.ts`:

```typescript
import type { InvoiceStatus, TransitionRule, WorkflowEventType } from './types';

export const INVOICE_STATES: Record<InvoiceStatus, { label: string; terminal: boolean }> = {
  draft:          { label: 'Borrador',        terminal: false },
  pending_stamp:  { label: 'Pendiente',       terminal: false },
  stamped:        { label: 'Timbrado',        terminal: false },
  cancelled:      { label: 'Cancelado',       terminal: true },
};

// Only these transitions are valid; all others must be rejected
export const VALID_TRANSITIONS: TransitionRule[] = [
  {
    from: 'draft',
    to: 'pending_stamp',
    trigger: 'invoice.sign_requested',
    actions: [],  // No automated actions on sign — user-initiated
  },
  {
    from: 'pending_stamp',
    to: 'stamped',
    trigger: 'invoice.stamp_succeeded',
    actions: ['generate_pdf', 'send_customer_email', 'send_team_notification', 'schedule_payment_reminder'],
  },
  {
    from: 'pending_stamp',
    to: 'draft',
    trigger: 'invoice.stamp_failed',
    actions: ['send_team_notification'],
  },
  {
    from: 'stamped',
    to: 'cancelled',
    trigger: 'invoice.cancelled',
    actions: ['cancel_scheduled_reminders', 'send_customer_email', 'send_team_notification'],
  },
];

/**
 * Returns true if the given transition is allowed by the state machine.
 */
export function canTransition(from: InvoiceStatus, to: InvoiceStatus): boolean { ... }

/**
 * Returns the TransitionRule for the given event + current status.
 * Returns null if no rule matches (invalid/unknown event).
 */
export function getRuleForEvent(
  currentStatus: InvoiceStatus,
  event: WorkflowEventType
): TransitionRule | null { ... }

/**
 * Returns all valid next statuses from a given current status.
 */
export function getNextStates(current: InvoiceStatus): InvoiceStatus[] { ... }

/**
 * Returns true if the given status is a terminal state (no further transitions).
 */
export function isTerminalState(status: InvoiceStatus): boolean { ... }
```

**Tests for `state-machine.ts` (≥95% coverage):**
- `canTransition`: test all valid pairs return true; test invalid pairs return false (e.g., `stamped → draft`)
- `getRuleForEvent`: test it returns the matching rule; test it returns null for unknown event
- `getNextStates`: test `draft` → `['pending_stamp']`; test `cancelled` → `[]`
- `isTerminalState`: `cancelled` → true; `stamped` → false

---

## Step 3 — Errors

Create `apps/web/lib/workflows/errors.ts`:

```typescript
export type WorkflowErrorCode =
  | 'INVALID_TRANSITION'        // Attempted transition not in VALID_TRANSITIONS
  | 'INVOICE_NOT_FOUND'         // Invoice ID doesn't exist or not in org
  | 'WORKFLOW_ACTION_FAILED'    // One or more actions failed (non-fatal: logged)
  | 'JOB_ENQUEUE_FAILED'        // BullMQ could not enqueue job
  | 'TERMINAL_STATE'            // Invoice is in a terminal state, no transitions possible
  | 'STAMP_JOB_FAILED'          // The stamp job itself failed after retries
  | 'CONCURRENT_PROCESSING';    // Another job is already processing this invoice

export class WorkflowError extends Error {
  constructor(
    public code: WorkflowErrorCode,
    message: string,
    public invoiceId?: string,
    public cause?: Error
  ) {
    super(message);
    this.name = 'WorkflowError';
  }
}

export function isWorkflowError(err: unknown): err is WorkflowError {
  return err instanceof WorkflowError;
}
```

---

## Step 4 — Action Handlers

### Email Action Stub
Create `apps/web/lib/workflows/actions/send-email.ts`:

```typescript
// This action ENQUEUES an email job into BullMQ.
// The actual sending is done by Component 29's (Email Service) email worker.
// This component owns the job schema; Component 29 owns the worker that processes it.

import { emailQueue } from '@/lib/queue/queues';
import type { EmailJobPayload, ActionResult } from '../types';

/**
 * Enqueues an email job for the given invoice event.
 * Does NOT send email directly.
 * Returns ActionResult with the BullMQ jobId.
 */
export async function enqueueSendInvoiceEmail(
  payload: EmailJobPayload
): Promise<ActionResult> { ... }

/**
 * Builds the EmailJobPayload for a 'invoice_sent' email after stamping.
 * Fetches customer email from the customers table.
 */
export async function buildStampedEmailPayload(
  invoiceId: string,
  organizationId: string,
  language: 'es' | 'en'
): Promise<EmailJobPayload> { ... }

/**
 * Builds the EmailJobPayload for a cancellation notice.
 */
export async function buildCancellationEmailPayload(
  invoiceId: string,
  organizationId: string,
  language: 'es' | 'en'
): Promise<EmailJobPayload> { ... }
```

### PDF Action
Create `apps/web/lib/workflows/actions/generate-pdf.ts`:

```typescript
// Calls Component 16's generateInvoicePDFAndStore directly (synchronous in the job).
// This is NOT enqueued as a separate job — it runs inside the stamp job itself.
// PDF generation is fast (~50ms) and sequential, not worth a separate queue.

import { generateInvoicePDFAndStore } from '@/lib/invoices/generate-pdf';
import type { ActionResult } from '../types';

export async function executePDFAction(
  invoiceId: string,
  organizationId: string,
  language: 'es' | 'en'
): Promise<ActionResult> { ... }
```

### Team Notify Stub
Create `apps/web/lib/workflows/actions/notify-team.ts`:

```typescript
// Stub for team notifications (Slack, internal email, etc.)
// Logs to workflow_logs. Full implementation is future work.
// Must NOT throw — team notifications are non-critical.

export async function notifyTeam(params: {
  invoiceId: string;
  organizationId: string;
  eventType: string;
  message: string;
}): Promise<ActionResult> {
  // For now: log to console + return success
  // Future: call Slack webhook / internal notification service
  console.log(`[team-notify] ${params.eventType} for invoice ${params.invoiceId}: ${params.message}`);
  return { actionType: 'send_team_notification', success: true, executedAt: new Date().toISOString() };
}
```

### Schedule Reminder Action
Create `apps/web/lib/workflows/actions/schedule-reminder.ts`:

```typescript
// Schedules BullMQ delayed jobs for payment reminders.
// Uses invoice.due_date (if set) to calculate delays.
// Uses BullMQ job IDs based on invoiceId + reminderType for deduplication.

import { reminderQueue } from '@/lib/queue/queues';
import type { ReminderJobPayload, ActionResult } from '../types';

/**
 * Schedules up to 4 reminder jobs after invoice is stamped:
 * - due_soon: 24 hours before due_date
 * - due_today: on due_date at 9:00 AM Mexico City time
 * - overdue_7d: 7 days after due_date
 * - overdue_30d: 30 days after due_date
 *
 * If invoice has no due_date (metodo_pago = 'PUE'), skips scheduling.
 * PUE (Pago en una sola exhibición) means payment expected immediately.
 * PPD (Pago en parcialidades) implies a due_date should be set.
 *
 * Uses jobId: `reminder-{invoiceId}-{reminderType}` for idempotency.
 */
export async function schedulePaymentReminders(
  invoiceId: string,
  organizationId: string
): Promise<ActionResult[]> { ... }

/**
 * Cancels all scheduled reminder jobs for an invoice (called on cancellation).
 * Removes jobs from the delayed queue by their predictable IDs.
 */
export async function cancelPaymentReminders(invoiceId: string): Promise<ActionResult> { ... }
```

**Important:** Mexico City timezone is `America/Mexico_City` (UTC-6, UTC-5 during DST). Use a library or manual offset for "9 AM Mexico City time" calculation. The simplest correct approach:
```typescript
// Calculate 9 AM CDMX = 15:00 or 14:00 UTC depending on DST
// Simple approach: compute using Intl.DateTimeFormat — no extra library needed
function get9amMexicoCityDelayMs(dueDate: Date): number {
  const dueDateStr = dueDate.toISOString().split('T')[0]; // YYYY-MM-DD
  // Parse "YYYY-MM-DDT09:00:00" in Mexico City timezone
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Mexico_City',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  });
  // ... construct the UTC timestamp for 9am CDMX on dueDate
}
```

---

## Step 5 — Workflow Engine

Create `apps/web/lib/workflows/engine.ts`:

```typescript
import { createClient } from '@supabase/supabase-js';
import { getRuleForEvent, canTransition } from './state-machine';
import { WorkflowError } from './errors';
import type { WorkflowEvent, ActionResult, WorkflowLogEntry } from './types';

export class WorkflowEngine {
  private supabase: ReturnType<typeof createClient>;

  constructor(supabase: ReturnType<typeof createClient>) {
    this.supabase = supabase;
  }

  /**
   * Main entry point. Given a workflow event, looks up the relevant
   * transition rule, executes all actions, and persists a log entry.
   *
   * Non-fatal action failures are captured in the log but do NOT
   * cause the overall workflow to fail. A stamp notification email
   * failing must never roll back the invoice status.
   *
   * @throws WorkflowError if transition is invalid or invoice not found
   */
  async executeWorkflow(event: WorkflowEvent): Promise<WorkflowLogEntry> { ... }

  /**
   * Validates the transition is allowed for the invoice's current status.
   * Fetches current status from DB.
   * @throws WorkflowError('INVALID_TRANSITION') if not allowed
   * @throws WorkflowError('TERMINAL_STATE') if invoice is in a terminal state
   */
  async validateTransition(
    invoiceId: string,
    organizationId: string,
    event: WorkflowEvent
  ): Promise<{ currentStatus: InvoiceStatus; rule: TransitionRule }> { ... }

  /**
   * Executes all action handlers for a transition rule.
   * Catches individual action errors and records them in results.
   * Never throws — always returns results array.
   */
  async triggerActions(
    rule: TransitionRule,
    event: WorkflowEvent
  ): Promise<ActionResult[]> { ... }

  /**
   * Persists a WorkflowLogEntry to the workflow_logs table.
   */
  private async persistLog(entry: Omit<WorkflowLogEntry, 'id' | 'createdAt'>): Promise<WorkflowLogEntry> { ... }
}
```

**Action isolation rule:** Each action in `triggerActions` must be wrapped in its own try/catch. A failed `send_customer_email` action must not prevent `generate_pdf` or `schedule_payment_reminder` from running. All results are captured and logged together.

---

## Step 6 — BullMQ Queues and Job Types

Create `apps/web/lib/queue/queues.ts`:

```typescript
import { Queue } from 'bullmq';
import { bullMQConnection } from './redis-connection';

// Three queues — each with distinct retry behavior

/**
 * Invoice processing queue: sign → stamp → pdf
 * High-priority, aggressive retry, short delay
 */
export const invoiceQueue = new Queue<StampJobPayload>('invoice-processing', {
  connection: bullMQConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 2000 },
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 500 },
  },
});

/**
 * Email queue: sends invoice emails via Component 29's (Email Service) EmailService
 * Moderate retry — email failures are non-critical
 */
export const emailQueue = new Queue<EmailJobPayload>('invoice-emails', {
  connection: bullMQConnection,
  defaultJobOptions: {
    attempts: 5,
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: { count: 200 },
    removeOnFail: { count: 1000 },
  },
});

/**
 * Reminder queue: payment due/overdue reminders (delayed jobs)
 * Lower priority, less aggressive retry
 */
export const reminderQueue = new Queue<ReminderJobPayload>('payment-reminders', {
  connection: bullMQConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 10000 },
    removeOnComplete: { count: 50 },
    removeOnFail: { count: 200 },
  },
});
```

---

## Step 7 — Workers

Workers run as a **separate Node.js process** via `tsx`. They are NOT imported by Next.js routes.

Create `apps/web/workers/invoice.worker.ts`:

```typescript
import { Worker } from 'bullmq';
import { bullMQConnection } from '@/lib/queue/redis-connection';
import { signInvoice } from '@/lib/invoices/sign-invoice';
import { stampInvoice } from '@/lib/invoices/stamp-invoice';
import { WorkflowEngine } from '@/lib/workflows/engine';
import type { StampJobPayload } from '@/lib/queue/job-types';

/**
 * Processes 'stamp-invoice' jobs.
 *
 * Job sequence within a single job execution:
 * 1. Fetch invoice from DB (verify status is pending_stamp or draft)
 * 2. If draft: call signInvoice() → transitions to pending_stamp
 * 3. Call stampInvoice() → transitions to stamped (via PAC)
 * 4. Fire WorkflowEngine.executeWorkflow({ type: 'invoice.stamp_succeeded', ... })
 *    → This triggers: generate_pdf + send_customer_email + schedule_payment_reminder
 *
 * If stampInvoice() throws after retries exhausted:
 * 5. Fire WorkflowEngine.executeWorkflow({ type: 'invoice.stamp_failed', ... })
 *    → This triggers: revert status to draft + send_team_notification
 *
 * Idempotency: If invoice is already 'stamped', return early (duplicate job protection).
 */
const invoiceWorker = new Worker<StampJobPayload>(
  'invoice-processing',
  async (job) => { ... },
  {
    connection: bullMQConnection,
    concurrency: 5,  // Process up to 5 invoices simultaneously
  }
);

invoiceWorker.on('completed', (job) => {
  console.log(`[invoice-worker] Job ${job.id} completed for invoice ${job.data.invoiceId}`);
});

invoiceWorker.on('failed', (job, err) => {
  console.error(`[invoice-worker] Job ${job?.id} failed:`, err.message);
});
```

Create `apps/web/workers/reminder.worker.ts`:

```typescript
/**
 * Processes two job types:
 * 1. 'invoice-emails' queue: calls EmailService.send() (Component 29 stub)
 * 2. 'payment-reminders' queue: fires WorkflowEngine event for due/overdue
 *
 * Email stub: import a stubbed EmailService that logs to console.
 * When Component 29 (Email Service) is built, it replaces this stub with real implementation.
 */
```

Create `apps/web/workers/index.ts`:

```typescript
// Entry point to start all workers.
// Run with: tsx apps/web/workers/index.ts
// Or: node --loader ts-node/esm apps/web/workers/index.ts

import './invoice.worker';
import './reminder.worker';

console.log('[workers] All workers started. Waiting for jobs...');

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('[workers] SIGTERM received, shutting down gracefully...');
  // BullMQ workers handle graceful shutdown automatically on close()
  process.exit(0);
});
```

**Add to `apps/web/package.json`:**
```json
{
  "scripts": {
    "worker": "tsx workers/index.ts",
    "worker:dev": "tsx watch workers/index.ts"
  }
}
```

---

## Step 8 — Database Migration

Create `supabase/migrations/20260310000000_add_workflow_logs.sql`:

```sql
-- Workflow logs: immutable audit trail of every invoice event and its action results

CREATE TABLE workflow_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id),

  -- Event
  event_type VARCHAR(50) NOT NULL,
  from_status VARCHAR(20),           -- NULL for initial events
  to_status VARCHAR(20),

  -- Actions
  actions_triggered TEXT[] DEFAULT '{}',
  action_results JSONB DEFAULT '[]',  -- Array of ActionResult objects

  -- Outcome
  success BOOLEAN NOT NULL DEFAULT TRUE,
  error_message TEXT,
  metadata JSONB DEFAULT '{}',

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for common queries
CREATE INDEX idx_workflow_logs_invoice ON workflow_logs(invoice_id);
CREATE INDEX idx_workflow_logs_org ON workflow_logs(organization_id);
CREATE INDEX idx_workflow_logs_created ON workflow_logs(created_at DESC);
CREATE INDEX idx_workflow_logs_event_type ON workflow_logs(event_type);

-- RLS: Members can read logs for their org; no user writes (system-only)
ALTER TABLE workflow_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can read org workflow logs"
  ON workflow_logs FOR SELECT
  TO authenticated
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid()
    )
  );

-- No INSERT/UPDATE/DELETE policies for users — logs are written by service role only
```

Also add a `due_date` column to `invoices` if not already present (needed for reminder scheduling):

```sql
-- Add if column doesn't exist
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS due_date DATE;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS payment_notes TEXT;

COMMENT ON COLUMN invoices.due_date IS 
  'Payment due date. Set automatically for PPD invoices, null for PUE.';
```

---

## Step 9 — Public Bridge

Create `apps/web/lib/invoices/process-invoice.ts`:

```typescript
// Public API for the invoice workflow.
// Called by Server Actions or API routes when user clicks "Submit to SAT".

import { invoiceQueue } from '@/lib/queue/queues';
import type { StampJobPayload } from '@/lib/queue/job-types';

/**
 * Enqueues an invoice for sign → stamp → PDF processing.
 * Returns immediately — does NOT wait for processing to complete.
 * Use BullMQ job events or polling to track completion.
 *
 * @param invoiceId - Must be in 'draft' status
 * @param organizationId
 * @param language - For PDF generation ('es' | 'en')
 * @returns BullMQ job ID for status tracking
 */
export async function processInvoice(
  invoiceId: string,
  organizationId: string,
  language: 'es' | 'en' = 'es'
): Promise<{ jobId: string }> {
  // Validate invoice exists and is in draft status before enqueueing
  // ...
  const job = await invoiceQueue.add(
    'stamp-invoice',
    { invoiceId, organizationId, language, attemptNumber: 1 },
    { jobId: `stamp-${invoiceId}` }  // Idempotent: same invoice = same job ID
  );
  return { jobId: job.id! };
}

/**
 * Gets the current processing status of an invoice job.
 * Used for polling from the UI to show progress.
 */
export async function getProcessingStatus(invoiceId: string): Promise<{
  status: 'waiting' | 'active' | 'completed' | 'failed' | 'not_found';
  failReason?: string;
}> { ... }

/**
 * Fires a workflow event directly (for cancellations, which happen synchronously).
 * Cancellation is synchronous because it requires user confirmation + motivo selection.
 */
export async function fireCancellationWorkflow(
  invoiceId: string,
  organizationId: string,
  motivo: '01' | '02' | '03' | '04',
  folioSustitucion?: string
): Promise<void> { ... }
```

Export from `apps/web/lib/invoices/index.ts`:
```typescript
export { processInvoice, getProcessingStatus, fireCancellationWorkflow } from './process-invoice';
```

---

## Step 10 — EmailService Stub

Create `apps/web/lib/email/service.ts` as a stub. Component 29 (Email Service) will replace this with a real implementation using SendGrid or Postmark.

```typescript
// apps/web/lib/email/service.ts
// STUB: Component 29 (Email Service) will implement this with actual SMTP/SendGrid/Postmark delivery.
// This file defines the interface so Component 17 can import it without Component 29 existing.

export interface SendEmailParams {
  to: string;
  toName: string;
  subject: string;
  templateId: EmailTemplateId;
  templateData: Record<string, unknown>;
  attachments?: Array<{ filename: string; url: string; contentType: string }>;
  organizationId: string;
  invoiceId?: string;
}

export type EmailTemplateId =
  | 'invoice_sent'          // Invoice stamped, attaches PDF + XML
  | 'payment_reminder'      // Payment due soon
  | 'payment_overdue'       // Payment past due
  | 'cancellation_notice';  // Invoice cancelled

export interface SendEmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

/**
 * STUB IMPLEMENTATION — logs to console, always returns success.
 * Replace with real implementation in Component 29 (Email Service).
 */
export async function sendEmail(params: SendEmailParams): Promise<SendEmailResult> {
  console.log(`[email-stub] Would send '${params.templateId}' to ${params.to}`);
  console.log(`[email-stub] Subject: ${params.subject}`);
  console.log(`[email-stub] Invoice: ${params.invoiceId ?? 'N/A'}`);
  return { success: true, messageId: `stub-${Date.now()}` };
}

export async function sendBulkEmails(
  batch: SendEmailParams[]
): Promise<SendEmailResult[]> {
  return Promise.all(batch.map(sendEmail));
}
```

---

## Coverage Targets and Tests

| File | Target |
|------|--------|
| `state-machine.ts` | ≥95% |
| `errors.ts` | ≥95% |
| `engine.ts` | ≥85% |
| `actions/send-email.ts` | ≥85% |
| `actions/generate-pdf.ts` | ≥85% |
| `actions/schedule-reminder.ts` | ≥85% |
| `process-invoice.ts` (bridge) | ≥80% |
| `lib/queue/queues.ts` | ≥80% |

**Total new tests: ≥90**

### Key test scenarios

**State machine:**
- All valid transitions: `(draft, sign_requested)` → `pending_stamp`; `(pending_stamp, stamp_succeeded)` → `stamped`; `(stamped, cancelled)` → `cancelled`
- All invalid transitions: `(stamped, sign_requested)` → throws; `(cancelled, stamp_succeeded)` → throws
- `getNextStates('cancelled')` → `[]`
- `isTerminalState('cancelled')` → `true`; `isTerminalState('stamped')` → `false`

**WorkflowEngine:**
- Mock Supabase client
- `executeWorkflow` with valid event → calls `triggerActions`, persists log, returns `WorkflowLogEntry`
- `executeWorkflow` with invalid transition → throws `WorkflowError('INVALID_TRANSITION')`
- `triggerActions` where one action fails → other actions still execute; failed action captured in results
- `persistLog` is always called, even on action failures

**Actions:**
- `enqueueSendInvoiceEmail` enqueues to `emailQueue` and returns `ActionResult` with `jobId`
- `schedulePaymentReminders` for PPD invoice with due_date → creates 4 delayed jobs
- `schedulePaymentReminders` for PUE invoice → returns empty array (no scheduling)
- `cancelPaymentReminders` removes all 4 reminder job IDs from queue

**Bridge:**
- `processInvoice` for draft invoice → enqueues to `invoiceQueue` with correct job ID
- `processInvoice` for already-stamped invoice → throws `WorkflowError('INVALID_TRANSITION')`
- `getProcessingStatus` returns correct status string

**Do NOT test:** Worker process logic directly — workers call the same service functions which are unit-tested. Worker integration is tested via the function-level tests above.

---

## Key Design Decisions

**1. Workers are a separate process, not Next.js API routes.**
Next.js serverless functions have a 10–60s timeout and cannot run long-lived Workers. The `apps/web/workers/` directory contains a separate entry point started with `tsx workers/index.ts`. In development, run two terminal tabs: `npm run dev` and `npm run worker:dev`. In production, use a separate Dyno (Heroku), worker process (Railway), or container.

**2. Action failures are non-fatal.**
If PDF generation succeeds but the customer email enqueue fails, the invoice status stays `stamped`. The failure is logged in `workflow_logs.action_results`. This matches real-world invoicing — the fiscal event (stamping) is what matters legally; delivery is best-effort.

**3. BullMQ job ID = `stamp-{invoiceId}` for idempotency.**
If `processInvoice()` is called twice for the same invoice (double-click, retry), BullMQ deduplicates by job ID. The second call returns the existing job rather than creating a duplicate.

**4. Reminder jobs use predictable IDs for cancellation.**
`reminder-{invoiceId}-due_soon`, `reminder-{invoiceId}-due_today`, etc. This allows `cancelPaymentReminders` to remove all scheduled jobs by constructing the same IDs — no separate tracking table needed.

**5. PUE invoices skip payment reminders.**
`metodo_pago = 'PUE'` means payment is expected immediately (in the same transaction). No due date, no reminders needed. Only `PPD` (Pago en parcialidades o diferido) invoices get payment reminders, and only if `due_date` is set.

**6. Cancellation workflow fires synchronously.**
Cancellation (Component 15's `cancelStampedInvoice`) is already user-initiated and synchronous. The workflow just fires the `invoice.cancelled` event via `fireCancellationWorkflow()` which calls `engine.executeWorkflow()` directly (no queue). This cancels reminder jobs and enqueues a cancellation notice email.

**7. Email action enqueues to BullMQ; it does NOT call EmailService directly.**
The reminder worker (not the invoice worker) picks up `invoice-emails` jobs and calls `EmailService.send()`. This ensures email delivery is independently retried even if the invoice processing job already completed.

**8. `workflow_logs` is append-only.**
No UPDATE or DELETE on workflow_logs — it is an immutable audit trail. RLS blocks user writes; only service-role key can insert. This satisfies NOM-151 archival requirements for fiscal records.

---

## Environment Variables

Add to `.env.example`:
```bash
# BullMQ / Redis (same Redis instance as auth caching)
REDIS_URL=redis://localhost:6379

# Worker process (used in workers/index.ts)
WORKER_CONCURRENCY=5
```

The `REDIS_URL` variable likely already exists from Component 01. Confirm before adding.

---

## Definition of Done

- [ ] `apps/web/lib/workflows/types.ts` created
- [ ] `apps/web/lib/workflows/state-machine.ts` with all valid transitions
- [ ] `apps/web/lib/workflows/errors.ts` created
- [ ] `apps/web/lib/workflows/actions/send-email.ts` — enqueues to BullMQ
- [ ] `apps/web/lib/workflows/actions/generate-pdf.ts` — calls Component 16
- [ ] `apps/web/lib/workflows/actions/notify-team.ts` — stub that logs
- [ ] `apps/web/lib/workflows/actions/schedule-reminder.ts` — BullMQ delayed jobs
- [ ] `apps/web/lib/workflows/engine.ts` — WorkflowEngine class
- [ ] `apps/web/lib/workflows/index.ts` — exports
- [ ] `apps/web/lib/queue/redis-connection.ts` — BullMQ-compatible IORedis
- [ ] `apps/web/lib/queue/queues.ts` — three queues: invoice, email, reminder
- [ ] `apps/web/lib/queue/job-types.ts` — typed job payloads
- [ ] `apps/web/lib/queue/index.ts` — exports
- [ ] `apps/web/workers/invoice.worker.ts` — processes stamp jobs
- [ ] `apps/web/workers/reminder.worker.ts` — processes email + reminder jobs
- [ ] `apps/web/workers/index.ts` — entry point
- [ ] `apps/web/lib/invoices/process-invoice.ts` — public bridge
- [ ] `apps/web/lib/invoices/index.ts` updated
- [ ] `apps/web/lib/email/service.ts` — stub (interface for Component 29 Email Service)
- [ ] `apps/web/package.json` updated with `worker` and `worker:dev` scripts
- [ ] Migration: `workflow_logs` table with RLS
- [ ] Migration: `invoices.due_date` column added if missing
- [ ] `bullmq` and `ioredis` installed
- [ ] BullMQ job IDs are idempotent (`stamp-{invoiceId}`, `reminder-{invoiceId}-{type}`)
- [ ] PUE invoices skip payment reminders
- [ ] Action failures logged but non-fatal (other actions continue)
- [ ] `workflow_logs` written for every event (success and failure)
- [ ] `cancelPaymentReminders` removes all 4 reminder jobs by predictable ID
- [ ] **≥90 new tests, all passing**

---

## Required Completion Summary

When done, provide a summary with:
1. All files created (with paths)
2. Test count per file
3. Versions of `bullmq` and `ioredis` installed
4. Confirmation that `npm run worker` starts without errors
5. List of the 3 queue names used
6. Any deviations from this spec and why
