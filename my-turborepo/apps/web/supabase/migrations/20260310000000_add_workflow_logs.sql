-- ============================================
-- SAT COMPLIANCE PLATFORM - Workflow Logs Table
-- Migration: 20260310000000_add_workflow_logs
-- Description: Creates workflow_logs table for audit trail (Component 17)
-- ============================================

-- ============================================
-- WORKFLOW LOGS TABLE
-- ============================================

-- Workflow logs: immutable audit trail of every invoice event and its action results
CREATE TABLE IF NOT EXISTS workflow_logs (
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

-- ============================================
-- INDEXES
-- ============================================

-- Index for finding logs by invoice
CREATE INDEX IF NOT EXISTS idx_workflow_logs_invoice
  ON workflow_logs(invoice_id);

-- Index for finding logs by organization
CREATE INDEX IF NOT EXISTS idx_workflow_logs_org
  ON workflow_logs(organization_id);

-- Index for recent logs query (descending order)
CREATE INDEX IF NOT EXISTS idx_workflow_logs_created
  ON workflow_logs(created_at DESC);

-- Index for filtering by event type
CREATE INDEX IF NOT EXISTS idx_workflow_logs_event_type
  ON workflow_logs(event_type);

-- Composite index for organization + event type queries
CREATE INDEX IF NOT EXISTS idx_workflow_logs_org_event
  ON workflow_logs(organization_id, event_type);

-- ============================================
-- RLS POLICIES
-- ============================================

-- Enable RLS
ALTER TABLE workflow_logs ENABLE ROW LEVEL SECURITY;

-- Policy: Members can read logs for their organization
DROP POLICY IF EXISTS "Members can read org workflow logs" ON workflow_logs;
CREATE POLICY "Members can read org workflow logs"
  ON workflow_logs FOR SELECT
  TO authenticated
  USING (
    organization_id IN (
      SELECT organization_id FROM users WHERE id = auth.uid()
    )
  );

-- No INSERT/UPDATE/DELETE policies for users
-- Logs are written by service role only (immutable audit trail)

-- ============================================
-- GRANTS
-- ============================================

-- Authenticated users can only read
GRANT SELECT ON workflow_logs TO authenticated;

-- ============================================
-- COMMENTS
-- ============================================

COMMENT ON TABLE workflow_logs IS
  'Immutable audit trail of invoice workflow events and action results (Component 17)';
COMMENT ON COLUMN workflow_logs.event_type IS
  'Workflow event type (e.g., invoice.stamp_succeeded, invoice.cancelled)';
COMMENT ON COLUMN workflow_logs.from_status IS
  'Invoice status before the transition (null for non-transition events)';
COMMENT ON COLUMN workflow_logs.to_status IS
  'Invoice status after the transition (null for non-transition events)';
COMMENT ON COLUMN workflow_logs.actions_triggered IS
  'Array of action types that were triggered by this event';
COMMENT ON COLUMN workflow_logs.action_results IS
  'JSONB array of ActionResult objects with success/failure details';
COMMENT ON COLUMN workflow_logs.success IS
  'Whether the overall workflow execution succeeded';
COMMENT ON COLUMN workflow_logs.metadata IS
  'Additional event-specific metadata';

-- ============================================
-- INVOICES TABLE ADDITIONS
-- ============================================

-- Add due_date column if not already present (needed for reminder scheduling)
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS due_date DATE;

-- Add payment_notes column if not already present
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS payment_notes TEXT;

-- Comment on new columns
COMMENT ON COLUMN invoices.due_date IS
  'Payment due date. Set automatically for PPD invoices, null for PUE.';
COMMENT ON COLUMN invoices.payment_notes IS
  'Internal notes about payment status or arrangements';
