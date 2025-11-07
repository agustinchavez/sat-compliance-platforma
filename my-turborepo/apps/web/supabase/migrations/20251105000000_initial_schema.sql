-- ============================================
-- SAT COMPLIANCE PLATFORM - INITIAL SCHEMA
-- Migration: 20251105000000_initial_schema
-- ============================================

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
  tax_regime VARCHAR(10) NOT NULL,
  legal_name VARCHAR(255) NOT NULL,
  email VARCHAR(255),
  phone VARCHAR(20),
  address JSONB,
  cfdi_cert BYTEA,
  cfdi_key BYTEA,
  cfdi_password_hash TEXT,
  pac_provider VARCHAR(50),
  pac_credentials JSONB,
  plan VARCHAR(50) DEFAULT 'free',
  stripe_customer_id VARCHAR(255),
  subscription_status VARCHAR(50),
  trial_ends_at TIMESTAMP,
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
  role VARCHAR(50) DEFAULT 'user',
  permissions JSONB DEFAULT '{}',
  language VARCHAR(5) DEFAULT 'es',
  timezone VARCHAR(50) DEFAULT 'America/Mexico_City',
  notification_settings JSONB DEFAULT '{}',
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
-- CUSTOMERS
-- ============================================

CREATE TABLE customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  rfc VARCHAR(13) NOT NULL,
  legal_name VARCHAR(255) NOT NULL,
  business_name VARCHAR(255),
  email VARCHAR(255),
  phone VARCHAR(20),
  tax_regime VARCHAR(10) NOT NULL,
  cfdi_use VARCHAR(10) DEFAULT 'G03',
  address JSONB,
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
  name VARCHAR(255) NOT NULL,
  description TEXT,
  sku VARCHAR(100),
  unit_price DECIMAL(15, 2) NOT NULL,
  currency VARCHAR(3) DEFAULT 'MXN',
  unit_of_measure VARCHAR(10) DEFAULT 'E48',
  sat_code VARCHAR(20) NOT NULL,
  tax_rate DECIMAL(5, 4) DEFAULT 0.16,
  tax_withheld DECIMAL(5, 4) DEFAULT 0,
  is_service BOOLEAN DEFAULT false,
  stock_quantity INTEGER DEFAULT 0,
  low_stock_alert INTEGER,
  is_active BOOLEAN DEFAULT true,
  tags TEXT[],
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  deleted_at TIMESTAMP
);

CREATE INDEX idx_products_org ON products(organization_id);
CREATE INDEX idx_products_sat_code ON products(sat_code);

-- ============================================
-- INVOICES
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
  internal_number VARCHAR(50),
  folio_number VARCHAR(50),
  uuid VARCHAR(36) UNIQUE,
  serie VARCHAR(25),
  cfdi_type VARCHAR(5) DEFAULT 'I',
  payment_form VARCHAR(5) DEFAULT '01',
  payment_method VARCHAR(5) DEFAULT 'PUE',
  subtotal DECIMAL(15, 2) NOT NULL,
  discount DECIMAL(15, 2) DEFAULT 0,
  tax DECIMAL(15, 2) NOT NULL,
  total DECIMAL(15, 2) NOT NULL,
  currency VARCHAR(3) DEFAULT 'MXN',
  exchange_rate DECIMAL(10, 6) DEFAULT 1,
  status invoice_status DEFAULT 'draft',
  payment_status payment_status DEFAULT 'pending',
  issued_at TIMESTAMP NOT NULL DEFAULT NOW(),
  due_at TIMESTAMP,
  stamped_at TIMESTAMP,
  sent_at TIMESTAMP,
  paid_at TIMESTAMP,
  cancelled_at TIMESTAMP,
  xml_url TEXT,
  pdf_url TEXT,
  xml_content TEXT,
  stamp_data JSONB,
  sat_cert_number VARCHAR(50),
  sat_original_string TEXT,
  sat_seal TEXT,
  notes TEXT,
  tags TEXT[],
  related_invoices UUID[],
  cancellation_reason VARCHAR(5),
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
  sat_code VARCHAR(20) NOT NULL,
  description TEXT NOT NULL,
  quantity DECIMAL(15, 4) NOT NULL,
  unit_of_measure VARCHAR(10) NOT NULL,
  unit_price DECIMAL(15, 2) NOT NULL,
  discount DECIMAL(15, 2) DEFAULT 0,
  subtotal DECIMAL(15, 2) NOT NULL,
  tax_rate DECIMAL(5, 4) NOT NULL,
  tax_amount DECIMAL(15, 2) NOT NULL,
  tax_withheld_rate DECIMAL(5, 4) DEFAULT 0,
  tax_withheld_amount DECIMAL(15, 2) DEFAULT 0,
  total DECIMAL(15, 2) NOT NULL,
  line_order INTEGER NOT NULL,
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_invoice_items_invoice ON invoice_items(invoice_id);
CREATE INDEX idx_invoice_items_product ON invoice_items(product_id);

-- ============================================
-- EXPENSES
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
  vendor_rfc VARCHAR(13),
  vendor_name VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
  category VARCHAR(100),
  amount DECIMAL(15, 2) NOT NULL,
  tax_amount DECIMAL(15, 2) DEFAULT 0,
  total DECIMAL(15, 2) NOT NULL,
  currency VARCHAR(3) DEFAULT 'MXN',
  cfdi_uuid VARCHAR(36),
  xml_url TEXT,
  pdf_url TEXT,
  receipt_url TEXT,
  status expense_status DEFAULT 'pending_receipt',
  is_deductible BOOLEAN DEFAULT true,
  expense_date DATE NOT NULL,
  validated_at TIMESTAMP,
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
-- PAYMENTS
-- ============================================

CREATE TABLE payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  invoice_id UUID REFERENCES invoices(id) ON DELETE CASCADE,
  amount DECIMAL(15, 2) NOT NULL,
  payment_form VARCHAR(5) NOT NULL,
  payment_date DATE NOT NULL,
  reference_number VARCHAR(100),
  bank_account VARCHAR(50),
  payment_cfdi_uuid VARCHAR(36),
  payment_xml_url TEXT,
  payment_pdf_url TEXT,
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_payments_invoice ON payments(invoice_id);
CREATE INDEX idx_payments_org_date ON payments(organization_id, payment_date);

-- ============================================
-- SAT CATALOGS
-- ============================================

CREATE TABLE sat_product_codes (
  code VARCHAR(20) PRIMARY KEY,
  description TEXT NOT NULL,
  description_en TEXT,
  category VARCHAR(255),
  is_active BOOLEAN DEFAULT true,
  embedding vector(384),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_sat_codes_embedding ON sat_product_codes
USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);

CREATE INDEX idx_sat_codes_description ON sat_product_codes
USING gin(to_tsvector('spanish', description));

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
  applies_to VARCHAR(10),
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
-- ACCOUNTING
-- ============================================

CREATE TABLE chart_of_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  code VARCHAR(20) NOT NULL,
  name VARCHAR(255) NOT NULL,
  account_type VARCHAR(50) NOT NULL,
  parent_id UUID REFERENCES chart_of_accounts(id),
  normal_balance VARCHAR(10) NOT NULL,
  current_balance DECIMAL(15, 2) DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  is_system BOOLEAN DEFAULT false,
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
  invoice_id UUID REFERENCES invoices(id),
  expense_id UUID REFERENCES expenses(id),
  payment_id UUID REFERENCES payments(id),
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
-- TAX PERIODS
-- ============================================

CREATE TABLE tax_periods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  period_type VARCHAR(20) NOT NULL,
  year INTEGER NOT NULL,
  period INTEGER NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  gross_income DECIMAL(15, 2) DEFAULT 0,
  deductible_expenses DECIMAL(15, 2) DEFAULT 0,
  net_income DECIMAL(15, 2) DEFAULT 0,
  iva_charged DECIMAL(15, 2) DEFAULT 0,
  iva_paid DECIMAL(15, 2) DEFAULT 0,
  iva_payable DECIMAL(15, 2) DEFAULT 0,
  isr_payable DECIMAL(15, 2) DEFAULT 0,
  is_calculated BOOLEAN DEFAULT false,
  is_filed BOOLEAN DEFAULT false,
  filed_at TIMESTAMP,
  calculation_data JSONB,
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
  type VARCHAR(50) NOT NULL,
  title VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  sent_via VARCHAR(20)[],
  is_read BOOLEAN DEFAULT false,
  read_at TIMESTAMP,
  entity_type VARCHAR(50),
  entity_id UUID,
  data JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_notifications_user ON notifications(user_id, is_read);
CREATE INDEX idx_notifications_org ON notifications(organization_id);

CREATE TABLE activity_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id),
  action VARCHAR(100) NOT NULL,
  entity_type VARCHAR(50) NOT NULL,
  entity_id UUID,
  old_values JSONB,
  new_values JSONB,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_activity_org ON activity_log(organization_id, created_at DESC);
CREATE INDEX idx_activity_user ON activity_log(user_id, created_at DESC);
CREATE INDEX idx_activity_entity ON activity_log(entity_type, entity_id);

-- ============================================
-- WHATSAPP
-- ============================================

CREATE TABLE whatsapp_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id),
  phone_number VARCHAR(20) NOT NULL,
  conversation_id VARCHAR(255),
  is_active BOOLEAN DEFAULT true,
  last_message_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE whatsapp_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES whatsapp_conversations(id) ON DELETE CASCADE,
  message_id VARCHAR(255) UNIQUE NOT NULL,
  direction VARCHAR(10) NOT NULL,
  message_type VARCHAR(20) NOT NULL,
  content TEXT,
  media_url TEXT,
  status VARCHAR(20),
  intent VARCHAR(50),
  entities JSONB,
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
  job_type VARCHAR(100) NOT NULL,
  payload JSONB NOT NULL,
  status VARCHAR(20) DEFAULT 'pending',
  attempts INTEGER DEFAULT 0,
  max_attempts INTEGER DEFAULT 3,
  scheduled_at TIMESTAMP DEFAULT NOW(),
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  result JSONB,
  error TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_jobs_status ON job_queue(status, scheduled_at);
CREATE INDEX idx_jobs_org ON job_queue(organization_id);
