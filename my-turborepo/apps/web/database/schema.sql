-- ============================================
-- SAT COMPLIANCE PLATFORM - DATABASE SCHEMA
-- ============================================
-- This schema supports Mexican tax compliance (SAT/CFDI)
-- with multi-tenancy, invoicing, expenses, and accounting

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "vector";

-- ============================================
-- MULTI-TENANCY & AUTHENTICATION
-- ============================================

CREATE TABLE organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  rfc VARCHAR(13) UNIQUE NOT NULL,
  tax_regime VARCHAR(10) NOT NULL, -- 601, 612, etc.
  legal_name VARCHAR(255) NOT NULL,
  email VARCHAR(255),
  phone VARCHAR(20),
  address JSONB, -- Store full address structure

  -- Fiscal info
  cfdi_cert BYTEA, -- Certificate (.cer)
  cfdi_key BYTEA,  -- Private key (.key) - ENCRYPTED
  cfdi_password_hash TEXT, -- For .key file
  pac_provider VARCHAR(50), -- 'finkok', 'sw', etc.
  pac_credentials JSONB, -- Encrypted PAC credentials

  -- Subscription
  plan VARCHAR(50) DEFAULT 'free', -- free, basic, professional, enterprise
  stripe_customer_id VARCHAR(255),
  subscription_status VARCHAR(50),
  trial_ends_at TIMESTAMP,

  -- Metadata
  settings JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  deleted_at TIMESTAMP
);

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,

  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  full_name VARCHAR(255) NOT NULL,
  phone VARCHAR(20),

  -- Roles: owner, admin, accountant, user
  role VARCHAR(50) DEFAULT 'user',
  permissions JSONB DEFAULT '{}',

  -- Preferences
  language VARCHAR(5) DEFAULT 'es', -- 'es' or 'en'
  timezone VARCHAR(50) DEFAULT 'America/Mexico_City',
  notification_settings JSONB DEFAULT '{}',

  -- Auth
  email_verified BOOLEAN DEFAULT false,
  whatsapp_verified BOOLEAN DEFAULT false,
  whatsapp_number VARCHAR(20),
  last_login_at TIMESTAMP,

  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  deleted_at TIMESTAMP
);

CREATE INDEX idx_users_org ON users(organization_id);
CREATE INDEX idx_users_email ON users(email) WHERE deleted_at IS NULL;

-- ============================================
-- CUSTOMERS (RECEPTORES)
-- ============================================

CREATE TABLE customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,

  -- Basic info
  rfc VARCHAR(13) NOT NULL,
  legal_name VARCHAR(255) NOT NULL,
  business_name VARCHAR(255), -- Commercial name
  email VARCHAR(255),
  phone VARCHAR(20),

  -- Fiscal info
  tax_regime VARCHAR(10) NOT NULL,
  cfdi_use VARCHAR(10) DEFAULT 'G03', -- D01, G03, etc.
  address JSONB,

  -- Metadata
  notes TEXT,
  tags TEXT[],
  is_active BOOLEAN DEFAULT true,

  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  deleted_at TIMESTAMP,

  CONSTRAINT unique_customer_rfc UNIQUE (organization_id, rfc, deleted_at)
);

CREATE INDEX idx_customers_org ON customers(organization_id);
CREATE INDEX idx_customers_rfc ON customers(rfc);

-- ============================================
-- PRODUCTS & SERVICES
-- ============================================

CREATE TABLE products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,

  -- Product info
  name VARCHAR(255) NOT NULL,
  description TEXT,
  sku VARCHAR(100),

  -- Pricing
  unit_price DECIMAL(15, 2) NOT NULL,
  currency VARCHAR(3) DEFAULT 'MXN',
  unit_of_measure VARCHAR(10) DEFAULT 'E48', -- SAT unit codes

  -- Tax info
  sat_code VARCHAR(20) NOT NULL, -- Clave de producto/servicio
  tax_rate DECIMAL(5, 4) DEFAULT 0.16, -- 16% IVA
  tax_withheld DECIMAL(5, 4) DEFAULT 0, -- Retention if applicable

  -- Inventory (optional for services)
  is_service BOOLEAN DEFAULT false,
  stock_quantity INTEGER DEFAULT 0,
  low_stock_alert INTEGER,

  -- Metadata
  is_active BOOLEAN DEFAULT true,
  tags TEXT[],

  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  deleted_at TIMESTAMP
);

CREATE INDEX idx_products_org ON products(organization_id);
CREATE INDEX idx_products_sat_code ON products(sat_code);

-- ============================================
-- INVOICES (CFDI)
-- ============================================

CREATE TYPE invoice_status AS ENUM (
  'draft',
  'pending_stamp',
  'stamped',
  'sent',
  'paid',
  'cancelled',
  'error'
);

CREATE TYPE payment_status AS ENUM (
  'pending',
  'partial',
  'paid',
  'overdue'
);

CREATE TABLE invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  customer_id UUID REFERENCES customers(id),
  created_by UUID REFERENCES users(id),

  -- Invoice identifiers
  internal_number VARCHAR(50), -- Your internal numbering
  folio_number VARCHAR(50), -- After stamping
  uuid VARCHAR(36) UNIQUE, -- UUID from SAT after stamping
  serie VARCHAR(25),

  -- CFDI Type
  cfdi_type VARCHAR(5) DEFAULT 'I', -- I=Ingreso, E=Egreso, P=Pago, etc.
  payment_form VARCHAR(5) DEFAULT '01', -- 01=Efectivo, 03=Transferencia, etc.
  payment_method VARCHAR(5) DEFAULT 'PUE', -- PUE, PPD

  -- Amounts
  subtotal DECIMAL(15, 2) NOT NULL,
  discount DECIMAL(15, 2) DEFAULT 0,
  tax DECIMAL(15, 2) NOT NULL,
  total DECIMAL(15, 2) NOT NULL,
  currency VARCHAR(3) DEFAULT 'MXN',
  exchange_rate DECIMAL(10, 6) DEFAULT 1,

  -- Status
  status invoice_status DEFAULT 'draft',
  payment_status payment_status DEFAULT 'pending',

  -- Dates
  issued_at TIMESTAMP NOT NULL DEFAULT NOW(),
  due_at TIMESTAMP,
  stamped_at TIMESTAMP,
  sent_at TIMESTAMP,
  paid_at TIMESTAMP,
  cancelled_at TIMESTAMP,

  -- Files
  xml_url TEXT, -- S3/R2 URL
  pdf_url TEXT,
  xml_content TEXT, -- Actual XML for quick access
  stamp_data JSONB, -- Timbre fiscal electrónico

  -- SAT info
  sat_cert_number VARCHAR(50),
  sat_original_string TEXT,
  sat_seal TEXT,

  -- Metadata
  notes TEXT,
  tags TEXT[],
  related_invoices UUID[], -- For CFDI relacionados
  cancellation_reason VARCHAR(5), -- If cancelled

  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  deleted_at TIMESTAMP
);

CREATE INDEX idx_invoices_org ON invoices(organization_id);
CREATE INDEX idx_invoices_customer ON invoices(customer_id);
CREATE INDEX idx_invoices_uuid ON invoices(uuid);
CREATE INDEX idx_invoices_status ON invoices(status);
CREATE INDEX idx_invoices_dates ON invoices(issued_at, due_at);

-- ============================================
-- INVOICE ITEMS
-- ============================================

CREATE TABLE invoice_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID REFERENCES invoices(id) ON DELETE CASCADE,
  product_id UUID REFERENCES products(id) ON DELETE SET NULL,

  -- Item details
  sat_code VARCHAR(20) NOT NULL,
  description TEXT NOT NULL,
  quantity DECIMAL(15, 4) NOT NULL,
  unit_of_measure VARCHAR(10) NOT NULL,
  unit_price DECIMAL(15, 2) NOT NULL,
  discount DECIMAL(15, 2) DEFAULT 0,

  -- Calculated
  subtotal DECIMAL(15, 2) NOT NULL,

  -- Taxes
  tax_rate DECIMAL(5, 4) NOT NULL,
  tax_amount DECIMAL(15, 2) NOT NULL,
  tax_withheld_rate DECIMAL(5, 4) DEFAULT 0,
  tax_withheld_amount DECIMAL(15, 2) DEFAULT 0,

  -- Total
  total DECIMAL(15, 2) NOT NULL,

  -- Metadata
  line_order INTEGER NOT NULL,
  notes TEXT,

  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_invoice_items_invoice ON invoice_items(invoice_id);
CREATE INDEX idx_invoice_items_product ON invoice_items(product_id);

-- ============================================
-- EXPENSES (Gastos - for tax deductions)
-- ============================================

CREATE TYPE expense_status AS ENUM (
  'pending_receipt',
  'received',
  'validated',
  'rejected'
);

CREATE TABLE expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  created_by UUID REFERENCES users(id),

  -- Expense details
  vendor_rfc VARCHAR(13),
  vendor_name VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
  category VARCHAR(100), -- Travel, Office, Services, etc.

  -- Amounts
  amount DECIMAL(15, 2) NOT NULL,
  tax_amount DECIMAL(15, 2) DEFAULT 0,
  total DECIMAL(15, 2) NOT NULL,
  currency VARCHAR(3) DEFAULT 'MXN',

  -- CFDI info (if available)
  cfdi_uuid VARCHAR(36),
  xml_url TEXT,
  pdf_url TEXT,
  receipt_url TEXT, -- Photo/scan if no CFDI

  -- Status
  status expense_status DEFAULT 'pending_receipt',
  is_deductible BOOLEAN DEFAULT true,

  -- Dates
  expense_date DATE NOT NULL,
  validated_at TIMESTAMP,

  -- Metadata
  notes TEXT,
  tags TEXT[],

  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  deleted_at TIMESTAMP
);

CREATE INDEX idx_expenses_org ON expenses(organization_id);
CREATE INDEX idx_expenses_date ON expenses(expense_date);
CREATE INDEX idx_expenses_category ON expenses(category);

-- ============================================
-- PAYMENTS (Complemento de Pago)
-- ============================================

CREATE TABLE payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  invoice_id UUID REFERENCES invoices(id) ON DELETE CASCADE,

  -- Payment details
  amount DECIMAL(15, 2) NOT NULL,
  payment_form VARCHAR(5) NOT NULL, -- 01, 03, 04, etc.
  payment_date DATE NOT NULL,
  reference_number VARCHAR(100),

  -- Bank info (if applicable)
  bank_account VARCHAR(50),

  -- CFDI de Pago (if PPD)
  payment_cfdi_uuid VARCHAR(36),
  payment_xml_url TEXT,
  payment_pdf_url TEXT,

  -- Metadata
  notes TEXT,

  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_payments_invoice ON payments(invoice_id);
CREATE INDEX idx_payments_org_date ON payments(organization_id, payment_date);

-- ============================================
-- SAT CATALOG (Reference tables)
-- ============================================

CREATE TABLE sat_product_codes (
  code VARCHAR(20) PRIMARY KEY,
  description TEXT NOT NULL,
  description_en TEXT,
  category VARCHAR(255),
  is_active BOOLEAN DEFAULT true,

  -- For AI search
  embedding vector(384), -- Sentence transformer embeddings

  updated_at TIMESTAMP DEFAULT NOW()
);

-- Vector similarity search index
CREATE INDEX idx_sat_codes_embedding ON sat_product_codes
USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);

CREATE INDEX idx_sat_codes_description ON sat_product_codes
USING gin(to_tsvector('spanish', description));

-- Other SAT catalogs
CREATE TABLE sat_tax_regimes (
  code VARCHAR(10) PRIMARY KEY,
  description TEXT NOT NULL,
  description_en TEXT,
  is_active BOOLEAN DEFAULT true
);

CREATE TABLE sat_cfdi_uses (
  code VARCHAR(10) PRIMARY KEY,
  description TEXT NOT NULL,
  description_en TEXT,
  applies_to VARCHAR(10), -- Moral, Física, etc.
  is_active BOOLEAN DEFAULT true
);

CREATE TABLE sat_payment_forms (
  code VARCHAR(5) PRIMARY KEY,
  description TEXT NOT NULL,
  description_en TEXT,
  is_active BOOLEAN DEFAULT true
);

CREATE TABLE sat_units (
  code VARCHAR(10) PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  symbol VARCHAR(10),
  is_active BOOLEAN DEFAULT true
);

-- ============================================
-- ACCOUNTING (Double-entry bookkeeping)
-- ============================================

CREATE TABLE chart_of_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,

  code VARCHAR(20) NOT NULL,
  name VARCHAR(255) NOT NULL,
  account_type VARCHAR(50) NOT NULL, -- Asset, Liability, Equity, Revenue, Expense
  parent_id UUID REFERENCES chart_of_accounts(id),

  -- Balance
  normal_balance VARCHAR(10) NOT NULL, -- Debit or Credit
  current_balance DECIMAL(15, 2) DEFAULT 0,

  -- Metadata
  is_active BOOLEAN DEFAULT true,
  is_system BOOLEAN DEFAULT false, -- Can't be deleted

  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),

  CONSTRAINT unique_org_account_code UNIQUE (organization_id, code)
);

CREATE TABLE journal_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,

  entry_number VARCHAR(50) NOT NULL,
  entry_date DATE NOT NULL,
  description TEXT NOT NULL,

  -- Links to source documents
  invoice_id UUID REFERENCES invoices(id),
  expense_id UUID REFERENCES expenses(id),
  payment_id UUID REFERENCES payments(id),

  -- Status
  is_posted BOOLEAN DEFAULT false,
  posted_at TIMESTAMP,
  posted_by UUID REFERENCES users(id),

  created_at TIMESTAMP DEFAULT NOW(),
  created_by UUID REFERENCES users(id)
);

CREATE TABLE journal_entry_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  journal_entry_id UUID REFERENCES journal_entries(id) ON DELETE CASCADE,
  account_id UUID REFERENCES chart_of_accounts(id),

  debit DECIMAL(15, 2) DEFAULT 0,
  credit DECIMAL(15, 2) DEFAULT 0,
  description TEXT,

  line_order INTEGER NOT NULL,

  CHECK (debit >= 0 AND credit >= 0),
  CHECK ((debit > 0 AND credit = 0) OR (debit = 0 AND credit > 0))
);

-- ============================================
-- TAX CALCULATIONS & REPORTS
-- ============================================

CREATE TABLE tax_periods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,

  period_type VARCHAR(20) NOT NULL, -- monthly, bimonthly, quarterly
  year INTEGER NOT NULL,
  period INTEGER NOT NULL, -- 1-12 for monthly, 1-6 for bimonthly

  start_date DATE NOT NULL,
  end_date DATE NOT NULL,

  -- Calculated amounts
  gross_income DECIMAL(15, 2) DEFAULT 0,
  deductible_expenses DECIMAL(15, 2) DEFAULT 0,
  net_income DECIMAL(15, 2) DEFAULT 0,

  iva_charged DECIMAL(15, 2) DEFAULT 0, -- IVA cobrado
  iva_paid DECIMAL(15, 2) DEFAULT 0,    -- IVA pagado
  iva_payable DECIMAL(15, 2) DEFAULT 0, -- IVA por pagar

  isr_payable DECIMAL(15, 2) DEFAULT 0, -- ISR provisional

  -- Status
  is_calculated BOOLEAN DEFAULT false,
  is_filed BOOLEAN DEFAULT false,
  filed_at TIMESTAMP,

  -- Metadata
  calculation_data JSONB, -- Detailed breakdown
  notes TEXT,

  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),

  CONSTRAINT unique_org_period UNIQUE (organization_id, period_type, year, period)
);

CREATE INDEX idx_tax_periods_org ON tax_periods(organization_id);
CREATE INDEX idx_tax_periods_dates ON tax_periods(start_date, end_date);

-- ============================================
-- NOTIFICATIONS & ACTIVITY
-- ============================================

CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,

  type VARCHAR(50) NOT NULL, -- invoice_sent, payment_received, etc.
  title VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,

  -- Channels
  sent_via VARCHAR(20)[], -- ['email', 'whatsapp', 'in_app']

  -- Status
  is_read BOOLEAN DEFAULT false,
  read_at TIMESTAMP,

  -- Related entity
  entity_type VARCHAR(50), -- invoice, payment, expense
  entity_id UUID,

  -- Metadata
  data JSONB,

  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_notifications_user ON notifications(user_id, is_read);
CREATE INDEX idx_notifications_org ON notifications(organization_id);

CREATE TABLE activity_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id),

  action VARCHAR(100) NOT NULL, -- created, updated, deleted, sent, etc.
  entity_type VARCHAR(50) NOT NULL,
  entity_id UUID,

  -- Changes (for audit trail)
  old_values JSONB,
  new_values JSONB,

  -- Context
  ip_address INET,
  user_agent TEXT,

  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_activity_org ON activity_log(organization_id, created_at DESC);
CREATE INDEX idx_activity_user ON activity_log(user_id, created_at DESC);
CREATE INDEX idx_activity_entity ON activity_log(entity_type, entity_id);

-- ============================================
-- WHATSAPP INTEGRATION
-- ============================================

CREATE TABLE whatsapp_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id),

  phone_number VARCHAR(20) NOT NULL,
  conversation_id VARCHAR(255), -- WhatsApp conversation ID

  -- Status
  is_active BOOLEAN DEFAULT true,
  last_message_at TIMESTAMP,

  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE whatsapp_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES whatsapp_conversations(id) ON DELETE CASCADE,

  message_id VARCHAR(255) UNIQUE NOT NULL, -- WhatsApp message ID
  direction VARCHAR(10) NOT NULL, -- inbound, outbound

  message_type VARCHAR(20) NOT NULL, -- text, image, document, etc.
  content TEXT,
  media_url TEXT,

  -- Status (for outbound)
  status VARCHAR(20), -- sent, delivered, read, failed

  -- AI Processing
  intent VARCHAR(50), -- invoice_status, create_invoice, help, etc.
  entities JSONB, -- Extracted entities
  response_sent BOOLEAN DEFAULT false,

  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_whatsapp_msgs_conversation ON whatsapp_messages(conversation_id, created_at);

-- ============================================
-- BACKGROUND JOBS
-- ============================================

CREATE TABLE job_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,

  job_type VARCHAR(100) NOT NULL, -- stamp_invoice, send_notification, etc.
  payload JSONB NOT NULL,

  -- Status
  status VARCHAR(20) DEFAULT 'pending', -- pending, processing, completed, failed
  attempts INTEGER DEFAULT 0,
  max_attempts INTEGER DEFAULT 3,

  -- Timing
  scheduled_at TIMESTAMP DEFAULT NOW(),
  started_at TIMESTAMP,
  completed_at TIMESTAMP,

  -- Results
  result JSONB,
  error TEXT,

  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_jobs_status ON job_queue(status, scheduled_at);
CREATE INDEX idx_jobs_org ON job_queue(organization_id);
