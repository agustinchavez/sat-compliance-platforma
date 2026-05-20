/**
 * Expense Service Types (Component 20)
 *
 * Type definitions for business expense tracking and management.
 */

import { z } from 'zod';

// Expense categories aligned with SAT/ISR Article 25 deduction categories
// and common Mexican SME expense types
export enum ExpenseCategory {
  // Operations
  COMPRAS_MERCANCIA      = 'compras_mercancia',       // Art. 25 I - Cost of goods
  SERVICIOS_PROFESIONALES = 'servicios_profesionales', // Professional services
  ARRENDAMIENTO          = 'arrendamiento',            // Rent/lease
  NOMINA_SUELDOS         = 'nomina_sueldos',           // Payroll (not this component)
  SEGURIDAD_SOCIAL       = 'seguridad_social',         // IMSS/INFONAVIT quotas
  // Travel & transport
  COMBUSTIBLE            = 'combustible',              // Fuel (special cash rule)
  VIATICOS               = 'viaticos',                 // Travel expenses
  TRANSPORTE             = 'transporte',               // Transport/logistics
  // Administrative
  PAPELERIA_OFICINA      = 'papeleria_oficina',        // Office supplies
  SERVICIOS_PUBLICOS     = 'servicios_publicos',       // Utilities
  TELECOMUNICACIONES     = 'telecomunicaciones',       // Phone/internet
  PUBLICIDAD_MARKETING   = 'publicidad_marketing',     // Advertising
  TECNOLOGIA_SOFTWARE    = 'tecnologia_software',      // Software/SaaS
  EQUIPO_HERRAMIENTAS    = 'equipo_herramientas',      // Equipment/tools
  // Finance
  INTERESES              = 'intereses',                // Interest expenses
  SEGUROS                = 'seguros',                  // Insurance
  COMISIONES_BANCARIAS   = 'comisiones_bancarias',     // Bank fees
  // Food/entertainment (limited deductibility)
  ALIMENTOS_ENTRETENIMIENTO = 'alimentos_entretenimiento', // 91.5% deductible limit
  // Special
  DONACIONES             = 'donaciones',               // Donations (7% of fiscal profit limit)
  INVERSIONES_ACTIVO_FIJO = 'inversiones_activo_fijo', // Fixed asset investments
  OTROS                  = 'otros',                    // Other/uncategorized
}

// Maps to human-readable Spanish labels
export const EXPENSE_CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  [ExpenseCategory.COMPRAS_MERCANCIA]: 'Compras de mercancía',
  [ExpenseCategory.SERVICIOS_PROFESIONALES]: 'Servicios profesionales',
  [ExpenseCategory.ARRENDAMIENTO]: 'Arrendamiento',
  [ExpenseCategory.NOMINA_SUELDOS]: 'Nómina y sueldos',
  [ExpenseCategory.SEGURIDAD_SOCIAL]: 'Seguridad social (IMSS/INFONAVIT)',
  [ExpenseCategory.COMBUSTIBLE]: 'Combustible',
  [ExpenseCategory.VIATICOS]: 'Viáticos',
  [ExpenseCategory.TRANSPORTE]: 'Transporte y logística',
  [ExpenseCategory.PAPELERIA_OFICINA]: 'Papelería y oficina',
  [ExpenseCategory.SERVICIOS_PUBLICOS]: 'Servicios públicos',
  [ExpenseCategory.TELECOMUNICACIONES]: 'Telecomunicaciones',
  [ExpenseCategory.PUBLICIDAD_MARKETING]: 'Publicidad y marketing',
  [ExpenseCategory.TECNOLOGIA_SOFTWARE]: 'Tecnología y software',
  [ExpenseCategory.EQUIPO_HERRAMIENTAS]: 'Equipo y herramientas',
  [ExpenseCategory.INTERESES]: 'Intereses',
  [ExpenseCategory.SEGUROS]: 'Seguros',
  [ExpenseCategory.COMISIONES_BANCARIAS]: 'Comisiones bancarias',
  [ExpenseCategory.ALIMENTOS_ENTRETENIMIENTO]: 'Alimentos y entretenimiento',
  [ExpenseCategory.DONACIONES]: 'Donativos',
  [ExpenseCategory.INVERSIONES_ACTIVO_FIJO]: 'Inversiones en activo fijo',
  [ExpenseCategory.OTROS]: 'Otros',
} as const;

// The existing DB enum — do not change these values
export type ExpenseStatus = 'pending_receipt' | 'received' | 'validated' | 'rejected';

// Deductibility status with reason
export interface DeductibilityAssessment {
  isDeductible: boolean;
  deductibilityPercent: number;     // 100 for fully deductible, 91.5 for meals/entertainment, 0 for non-deductible
  reason: string;                   // Human-readable explanation (Spanish)
  legalBasis?: string;              // e.g., "Art. 27 LISR - Pago en efectivo mayor a $2,000"
  warnings: string[];               // Non-blocking issues (e.g., "RFC genérico en receptor")
}

export interface Expense {
  id: string;
  organizationId: string;
  createdBy?: string;

  // Vendor info
  vendorRfc?: string;
  vendorName: string;
  description: string;

  // Categorization
  category: ExpenseCategory;
  subcategory?: string;

  // Amounts
  amount: number;            // Subtotal before tax
  taxAmount: number;         // IVA amount
  total: number;             // amount + taxAmount
  currency: string;          // ISO 4217 (MXN)

  // CFDI / receipt
  cfdiUuid?: string;         // UUID extracted from XML
  xmlUrl?: string;           // R2 key for uploaded XML
  pdfUrl?: string;           // R2 key for PDF (if any)
  receiptUrl?: string;       // R2 key for receipt image
  ocrConfidence?: number;    // 0-1 confidence from OCR extraction

  // Status & deductibility
  status: ExpenseStatus;
  isDeductible: boolean;
  deductibilityPercent: number;    // 0, 91.5, or 100
  deductibilityNotes?: string;     // reason for non/partial deductibility
  paymentMethod?: string;          // SAT c_FormaPago code (for cash rule enforcement)

  // Dates
  expenseDate: string;             // YYYY-MM-DD
  validatedAt?: string;
  notes?: string;
  tags?: string[];

  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
}

export interface CreateExpenseInput {
  vendorName: string;
  description: string;
  category: ExpenseCategory;
  amount: number;
  taxAmount?: number;          // Defaults to 0
  total: number;
  currency?: string;           // Defaults to 'MXN'
  expenseDate: string;         // YYYY-MM-DD
  vendorRfc?: string;
  paymentMethod?: string;      // SAT FormaPago code
  notes?: string;
  tags?: string[];
}

export interface UpdateExpenseInput {
  vendorName?: string;
  description?: string;
  category?: ExpenseCategory;
  amount?: number;
  taxAmount?: number;
  total?: number;
  expenseDate?: string;
  vendorRfc?: string;
  paymentMethod?: string;
  notes?: string;
  tags?: string[];
}

export interface ExpenseFilters {
  status?: ExpenseStatus | ExpenseStatus[];
  category?: ExpenseCategory | ExpenseCategory[];
  isDeductible?: boolean;
  dateFrom?: string;           // YYYY-MM-DD
  dateTo?: string;             // YYYY-MM-DD
  amountMin?: number;
  amountMax?: number;
  vendorRfc?: string;
  search?: string;             // Full-text on vendor_name, description
  tags?: string[];
}

export interface ExpensePagination {
  page: number;
  limit: number;
}

export interface ExpenseListResult {
  expenses: Expense[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

// For auto-fill from OCR
export interface ExtractedExpenseData {
  vendorName?: string;
  vendorRfc?: string;
  amount?: number;
  taxAmount?: number;
  total?: number;
  expenseDate?: string;         // YYYY-MM-DD
  cfdiUuid?: string;
  paymentMethod?: string;
  currency?: string;
  confidence: number;           // Overall OCR confidence 0-1
  warnings: string[];
}

// Zod schema for CreateExpenseInput
export const createExpenseSchema = z.object({
  vendorName: z.string().min(1).max(255),
  description: z.string().min(1).max(1000),
  category: z.nativeEnum(ExpenseCategory),
  amount: z.number().nonnegative(),
  taxAmount: z.number().nonnegative().optional().default(0),
  total: z.number().positive(),
  currency: z.string().length(3).optional().default('MXN'),
  expenseDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  vendorRfc: z.string().min(12).max(13).optional(),
  paymentMethod: z.string().max(2).optional(),
  notes: z.string().max(2000).optional(),
  tags: z.array(z.string()).optional(),
});

// Zod schema for UpdateExpenseInput
export const updateExpenseSchema = z.object({
  vendorName: z.string().min(1).max(255).optional(),
  description: z.string().min(1).max(1000).optional(),
  category: z.nativeEnum(ExpenseCategory).optional(),
  amount: z.number().nonnegative().optional(),
  taxAmount: z.number().nonnegative().optional(),
  total: z.number().positive().optional(),
  expenseDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  vendorRfc: z.string().min(12).max(13).optional(),
  paymentMethod: z.string().max(2).optional(),
  notes: z.string().max(2000).optional(),
  tags: z.array(z.string()).optional(),
});
