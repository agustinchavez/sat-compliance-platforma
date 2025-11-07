# Database Setup Guide

This directory contains the database schema for the SAT Compliance Platform, designed for Mexican tax compliance (CFDI/SAT) with multi-tenancy support.

## Overview

The schema includes:
- **Multi-tenancy**: Organizations and users with role-based access
- **Invoicing (CFDI)**: Full SAT-compliant invoice management
- **Customers & Products**: Customer management and product catalog
- **Expenses**: Expense tracking for tax deductions
- **Payments**: Payment tracking with CFDI de Pago support
- **SAT Catalogs**: Reference tables for SAT codes, regimes, etc.
- **Accounting**: Double-entry bookkeeping with chart of accounts
- **Tax Reports**: Tax period calculations and reports
- **WhatsApp Integration**: Conversation and message tracking
- **Activity Logs**: Audit trail for all changes

## Files

- `schema.sql` - Complete database schema (for reference)
- `../supabase/migrations/20251105000000_initial_schema.sql` - Supabase migration file

## Setup with Supabase

### Option 1: Using Supabase CLI (Recommended)

1. **Install Supabase CLI**
   ```bash
   npm install -g supabase
   ```

2. **Initialize Supabase in your project** (if not already done)
   ```bash
   supabase init
   ```

3. **Link to your Supabase project**
   ```bash
   supabase link --project-ref your-project-ref
   ```

   You can find your project ref in your Supabase dashboard URL:
   `https://app.supabase.com/project/[your-project-ref]`

4. **Apply the migration**
   ```bash
   supabase db push
   ```

   This will apply all migrations in the `supabase/migrations` directory.

### Option 2: Using Supabase Studio SQL Editor

1. Go to your Supabase project dashboard
2. Navigate to **SQL Editor**
3. Copy the contents of `supabase/migrations/20251105000000_initial_schema.sql`
4. Paste into the SQL Editor
5. Click **Run**

### Option 3: Local Development with Docker

1. **Start local Supabase**
   ```bash
   supabase start
   ```

2. **Apply migrations**
   ```bash
   supabase db reset
   ```

3. **Access local database**
   - Studio: http://localhost:54323
   - Database: postgresql://postgres:postgres@localhost:54322/postgres

## Important Notes

### Vector Extension

The schema uses the `pgvector` extension for AI-powered SAT product code search. This requires:

1. **Supabase Cloud**: The vector extension is available on all plans
2. **Local Development**: Make sure your Supabase CLI is up to date (>= v1.100.0)

If you encounter issues with the vector extension, you can comment out these lines:

```sql
-- In sat_product_codes table
-- embedding vector(384),

-- And the index
-- CREATE INDEX idx_sat_codes_embedding ON sat_product_codes
-- USING ivfflat (embedding vector_cosine_ops)
-- WITH (lists = 100);
```

### Row Level Security (RLS)

The current schema does NOT include Row Level Security policies. You should add these based on your authentication setup.

Example RLS policy for multi-tenancy:

```sql
-- Enable RLS on all tables
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
-- ... etc for all tables

-- Example policy: Users can only see data from their organization
CREATE POLICY "Users can view their organization's data"
  ON customers
  FOR SELECT
  TO authenticated
  USING (
    organization_id IN (
      SELECT organization_id FROM users WHERE id = auth.uid()
    )
  );
```

### Triggers for updated_at

Consider adding triggers to automatically update `updated_at` timestamps:

```sql
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_organizations_updated_at BEFORE UPDATE ON organizations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Repeat for other tables with updated_at columns
```

## Schema Highlights

### Organizations & Users
- Multi-tenant architecture with organization isolation
- Stores encrypted CFDI certificates and PAC credentials
- Subscription management with Stripe integration

### Invoices (CFDI)
- Full Mexican CFDI 4.0 support
- Status tracking: draft → stamped → sent → paid
- Stores XML, PDF, and SAT stamp information
- Supports related invoices (CFDI relacionados)

### SAT Catalogs
- Pre-loaded reference tables for:
  - Product/Service codes (Clave de producto/servicio)
  - Tax regimes (Régimen fiscal)
  - CFDI uses (Uso de CFDI)
  - Payment forms (Forma de pago)
  - Units of measure

### Accounting
- Double-entry bookkeeping system
- Chart of accounts with hierarchical structure
- Journal entries linked to invoices, expenses, and payments

### Tax Periods
- Automated tax calculations for IVA and ISR
- Monthly, bimonthly, and quarterly periods
- Tracks gross income, deductible expenses, and tax payable

## Next Steps

1. **Add seed data** for SAT catalogs:
   - Download official SAT catalogs from [SAT website](https://www.sat.gob.mx/)
   - Create seed scripts to populate reference tables

2. **Set up Row Level Security (RLS)** policies for multi-tenancy

3. **Add database functions** for:
   - Tax calculations
   - Invoice number generation
   - Balance updates

4. **Configure Supabase Auth** to integrate with the users table

5. **Set up Supabase Storage** for storing PDF/XML files

## Resources

- [Supabase Documentation](https://supabase.com/docs)
- [SAT Official Catalogs](https://www.sat.gob.mx/consultas/servicios/catalogos)
- [CFDI 4.0 Specification](http://omawww.sat.gob.mx/tramitesyservicios/Paginas/documentos/Anexo_20_Guia_de_llenado_CFDI.pdf)

## Support

For issues or questions about this schema, please refer to the project documentation or create an issue in the repository.
