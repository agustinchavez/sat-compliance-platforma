# SAT Compliance Platform - Setup Guide

Complete setup guide for the SAT Compliance Platform.

## Prerequisites

- Node.js 18+ and npm/yarn/pnpm
- Supabase account (free tier works)
- Supabase CLI installed globally

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Install Supabase CLI

```bash
npm install -g supabase
```

### 3. Set Up Database

#### Option A: Supabase Cloud (Recommended for Production)

1. Create a new project at [supabase.com](https://supabase.com)

2. Link your local project:
   ```bash
   supabase link --project-ref your-project-ref
   ```

3. Push the database schema:
   ```bash
   npm run db:push
   ```

4. Get your API keys from [Project Settings > API](https://app.supabase.com/project/_/settings/api)

5. Create `.env.local`:
   ```bash
   cp .env.example .env.local
   ```

6. Update `.env.local` with your Supabase credentials

#### Option B: Local Development with Docker

1. Start local Supabase:
   ```bash
   npm run supabase:start
   ```

2. Apply migrations:
   ```bash
   npm run supabase:reset
   ```

3. Access local services:
   - Studio UI: http://localhost:54323
   - API URL: http://localhost:54321
   - Database: postgresql://postgres:postgres@localhost:54322/postgres

4. Create `.env.local`:
   ```bash
   cp .env.example .env.local
   ```

5. Use these local credentials in `.env.local`:
   ```
   NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321
   NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0
   ```

### 4. Run Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

## Database Schema

The database schema includes:

- **Organizations & Users**: Multi-tenant architecture with role-based access
- **Customers**: Customer/client management (Receptores)
- **Products & Services**: Product catalog with SAT codes
- **Invoices (CFDI)**: Full Mexican CFDI 4.0 support
- **Expenses**: Expense tracking for tax deductions
- **Payments**: Payment tracking with CFDI de Pago
- **SAT Catalogs**: Reference tables for SAT codes
- **Accounting**: Double-entry bookkeeping system
- **Tax Periods**: Tax calculation and reporting
- **Activity Logs**: Audit trail
- **WhatsApp Integration**: Conversation tracking
- **Job Queue**: Background job processing

See [database/README.md](./database/README.md) for detailed schema documentation.

## Available Scripts

### Development
- `npm run dev` - Start Next.js development server
- `npm run build` - Build for production
- `npm run start` - Start production server

### Code Quality
- `npm run lint` - Run ESLint
- `npm run check-types` - Type check with TypeScript

### Database (Supabase)
- `npm run supabase:start` - Start local Supabase (Docker)
- `npm run supabase:stop` - Stop local Supabase
- `npm run supabase:status` - Check Supabase status
- `npm run supabase:reset` - Reset local database
- `npm run db:push` - Push migrations to Supabase
- `npm run db:pull` - Pull schema changes from Supabase
- `npm run db:diff` - Generate migration from schema changes

## Next Steps

### 1. Set Up Authentication

Configure Supabase Auth in your [Supabase Dashboard](https://app.supabase.com/project/_/auth/providers):

- Email/Password
- Magic Link
- OAuth providers (Google, GitHub, etc.)

### 2. Add Row Level Security (RLS)

Implement RLS policies for multi-tenancy. Example:

```sql
-- Enable RLS
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see their organization's customers
CREATE POLICY "Users can view their org customers"
  ON customers FOR SELECT
  TO authenticated
  USING (
    organization_id IN (
      SELECT organization_id FROM users WHERE id = auth.uid()
    )
  );
```

### 3. Seed SAT Catalog Data

Download official SAT catalogs and populate reference tables:

- [SAT Product/Service Codes](https://www.sat.gob.mx/consultas/servicios/catalogos)
- Tax Regimes
- CFDI Uses
- Payment Forms
- Units of Measure

### 4. Configure File Storage

Set up Supabase Storage buckets for:
- Invoice PDFs: `invoices-pdf`
- Invoice XMLs: `invoices-xml`
- Expense receipts: `expense-receipts`

### 5. Set Up PAC Provider

Configure your PAC (Proveedor Autorizado de Certificación) credentials:

- Finkok
- SW Sapien
- Or your preferred PAC provider

Update `.env.local` with PAC credentials.

### 6. Configure Stripe (Optional)

For subscription management:

1. Create Stripe account
2. Add webhook endpoint: `/api/webhooks/stripe`
3. Update `.env.local` with Stripe keys

### 7. WhatsApp Integration (Optional)

For WhatsApp Business API integration:

1. Set up WhatsApp Business Account
2. Configure webhook: `/api/webhooks/whatsapp`
3. Update `.env.local` with WhatsApp credentials

## Troubleshooting

### Vector Extension Error

If you get an error about the `vector` extension:

1. Make sure you're using Supabase CLI >= v1.100.0
2. Or comment out vector-related code in the migration:
   ```sql
   -- embedding vector(384),
   ```

### Migration Conflicts

If you have migration conflicts:

```bash
# Reset local database
npm run supabase:reset

# Or pull remote schema
npm run db:pull
```

### Local Supabase Won't Start

Make sure Docker is running:

```bash
docker ps
```

If Docker is running but Supabase won't start, try:

```bash
npm run supabase:stop
npm run supabase:start
```

## Resources

- [Next.js Documentation](https://nextjs.org/docs)
- [Supabase Documentation](https://supabase.com/docs)
- [SAT CFDI 4.0 Documentation](http://omawww.sat.gob.mx/tramitesyservicios/Paginas/documentos/Anexo_20_Guia_de_llenado_CFDI.pdf)
- [SAT Official Catalogs](https://www.sat.gob.mx/consultas/servicios/catalogos)

## Support

For issues or questions:

1. Check the [documentation](./database/README.md)
2. Search existing issues
3. Create a new issue with details

## License

[Your License Here]
