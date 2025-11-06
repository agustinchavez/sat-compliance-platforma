This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/create-next-app).

## SAT Compliance Platform

A comprehensive platform for Mexican tax compliance (SAT/CFDI) with multi-tenancy support, featuring:

- CFDI 4.0 invoice generation and management
- Customer and product catalog management
- Expense tracking for tax deductions
- Payment tracking with Complemento de Pago
- Double-entry accounting system
- Tax period calculations (IVA, ISR)
- SAT catalog integration
- WhatsApp Business API integration
- Background job processing

## Quick Setup

See [SETUP.md](./SETUP.md) for complete setup instructions.

### Prerequisites

- Node.js 18+
- Supabase account (free tier works)
- Supabase CLI installed globally: `npm install -g supabase`

### Database Setup

The project uses Supabase for the database. You have two options:

1. **Cloud (Recommended)**: Create a project at [supabase.com](https://supabase.com) and run:
   ```bash
   supabase link --project-ref your-project-ref
   npm run db:push
   ```

2. **Local Development**: Start local Supabase with Docker:
   ```bash
   npm run supabase:start
   npm run supabase:reset
   ```

See [database/README.md](./database/README.md) for detailed schema documentation.

## Getting Started

First, set up your environment variables:

```bash
cp .env.example .env.local
# Edit .env.local with your Supabase credentials
```

Then, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load Inter, a custom Google Font.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
