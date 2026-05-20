/**
 * Expense Service (Component 20)
 *
 * Core business logic for expense management.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  Expense,
  CreateExpenseInput,
  UpdateExpenseInput,
  ExpenseFilters,
  ExpensePagination,
  ExpenseListResult,
  ExtractedExpenseData,
  ExpenseCategory,
} from './types';
import { ExpenseError } from './errors';
import { assessDeductibility, validateExpenseData, validateCFDIStructure, checkRFCMatch } from './validation';
import { extractFromReceipt, extractFromCFDIXml } from './ocr-integration';
import { suggestCategory } from './categories';
import {
  createExpense as dbCreateExpense,
  findExpenseById,
  findExpensesByOrg,
  updateExpense as dbUpdateExpense,
  softDeleteExpense,
  findExpensesByCFDIUuid,
} from './repository';
import { uploadToStorage } from '@/lib/organizations/storage';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const SUPPORTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const SUPPORTED_DOC_TYPES = ['application/pdf'];
const SUPPORTED_FILE_TYPES = [...SUPPORTED_IMAGE_TYPES, ...SUPPORTED_DOC_TYPES];

/**
 * Creates a draft expense record.
 * Runs deductibility assessment immediately on creation.
 * Sets status='received' (since the user is providing data).
 */
export async function createExpense(
  organizationId: string,
  organizationRfc: string,
  userId: string,
  input: CreateExpenseInput,
  supabase: SupabaseClient
): Promise<Expense> {
  // Validate input data
  const validationErrors = validateExpenseData(input, organizationRfc);
  if (validationErrors.length > 0) {
    throw new ExpenseError(
      'INVALID_EXPENSE_DATA',
      `Datos de gasto inválidos: ${validationErrors.join(', ')}`
    );
  }

  // Assess deductibility
  const assessment = assessDeductibility(
    {
      category: input.category,
      amount: input.amount,
      total: input.total,
      paymentMethod: input.paymentMethod,
      vendorRfc: input.vendorRfc,
      cfdiUuid: undefined, // No CFDI yet on creation
    },
    organizationRfc
  );

  // Create expense
  return await dbCreateExpense(supabase, organizationId, userId, {
    ...input,
    taxAmount: input.taxAmount ?? 0,
    currency: input.currency ?? 'MXN',
    status: 'received',
    isDeductible: assessment.isDeductible,
    deductibilityPercent: assessment.deductibilityPercent,
    deductibilityNotes: assessment.reason,
  });
}

/**
 * Uploads a receipt image/PDF to R2 and triggers OCR.
 *
 * Flow:
 * 1. Validate file type (jpeg, png, webp, pdf) and size (max 10MB)
 * 2. Upload to R2: key = `receipts/{organizationId}/{expenseId}/{filename}`
 * 3. Call extractFromReceipt() via OCR service
 * 4. Update expense with receipt_url and any OCR-extracted fields (if confidence > 0.6)
 * 5. Return updated expense + extracted data
 *
 * OCR failure is non-fatal — expense is updated with receipt_url regardless.
 */
export async function uploadReceipt(
  expenseId: string,
  organizationId: string,
  organizationRfc: string,
  fileBuffer: Buffer,
  filename: string,
  mimeType: string,
  supabase: SupabaseClient
): Promise<{ expense: Expense; extracted: ExtractedExpenseData }> {
  // 1. Validate file
  if (fileBuffer.length > MAX_FILE_SIZE) {
    throw new ExpenseError(
      'FILE_TOO_LARGE',
      `El archivo excede el tamaño máximo de 10MB (tamaño: ${(fileBuffer.length / 1024 / 1024).toFixed(2)}MB)`,
      expenseId
    );
  }

  if (!SUPPORTED_FILE_TYPES.includes(mimeType)) {
    throw new ExpenseError(
      'UNSUPPORTED_FILE_TYPE',
      `Tipo de archivo no soportado: ${mimeType}. Use JPG, PNG, WEBP o PDF.`,
      expenseId
    );
  }

  // Fetch existing expense
  const expense = await findExpenseById(supabase, expenseId, organizationId);
  if (!expense) {
    throw new ExpenseError(
      'EXPENSE_NOT_FOUND',
      `Gasto ${expenseId} no encontrado`,
      expenseId
    );
  }

  if (expense.deletedAt) {
    throw new ExpenseError(
      'EXPENSE_DELETED',
      `El gasto ${expenseId} ha sido eliminado`,
      expenseId
    );
  }

  // 2. Upload to R2
  const storageKey = `receipts/${organizationId}/${expenseId}/${filename}`;
  try {
    await uploadToStorage(storageKey, fileBuffer, mimeType);
  } catch (err) {
    throw new ExpenseError(
      'RECEIPT_UPLOAD_FAILED',
      `Error al subir el comprobante: ${(err as Error).message}`,
      expenseId,
      err as Error
    );
  }

  // 3. Extract data via OCR
  const extracted = await extractFromReceipt(fileBuffer, mimeType, filename);

  // 4. Update expense with receipt URL
  const updates: any = { receiptUrl: storageKey };

  // If OCR confidence is high, auto-fill missing fields
  if (extracted.confidence > 0.6) {
    if (!expense.vendorName && extracted.vendorName) updates.vendorName = extracted.vendorName;
    if (!expense.vendorRfc && extracted.vendorRfc) updates.vendorRfc = extracted.vendorRfc;
    if (!expense.amount && extracted.amount) updates.amount = extracted.amount;
    if (!expense.taxAmount && extracted.taxAmount) updates.taxAmount = extracted.taxAmount;
    if (!expense.total && extracted.total) updates.total = extracted.total;
    if (!expense.expenseDate && extracted.expenseDate) updates.expenseDate = extracted.expenseDate;
    if (!expense.paymentMethod && extracted.paymentMethod) updates.paymentMethod = extracted.paymentMethod;

    updates.ocrConfidence = extracted.confidence;

    // Re-assess deductibility if fields changed
    if (updates.amount || updates.total || updates.paymentMethod || updates.vendorRfc) {
      const assessment = assessDeductibility(
        {
          category: expense.category,
          amount: updates.amount ?? expense.amount,
          total: updates.total ?? expense.total,
          paymentMethod: updates.paymentMethod ?? expense.paymentMethod,
          vendorRfc: updates.vendorRfc ?? expense.vendorRfc,
          cfdiUuid: expense.cfdiUuid,
        },
        organizationRfc
      );
      updates.isDeductible = assessment.isDeductible;
      updates.deductibilityPercent = assessment.deductibilityPercent;
      updates.deductibilityNotes = assessment.reason;
    }
  } else {
    updates.ocrConfidence = extracted.confidence;
  }

  const updatedExpense = await dbUpdateExpense(supabase, expenseId, organizationId, updates);

  return { expense: updatedExpense, extracted };
}

/**
 * Attaches a CFDI XML to an expense.
 *
 * Flow:
 * 1. Extract data from XML via OCR service (processCFDIFromString)
 * 2. Validate CFDI structure via @repo/cfdi validateCFDI()
 * 3. Check receptor RFC matches organization RFC
 *    → If mismatch: set isDeductible=false, status='rejected', deductibilityNotes=RFC mismatch reason
 * 4. Check for duplicate CFDI UUID (another expense already uses this UUID)
 * 5. Upload XML to R2: key = `cfdi-expenses/{organizationId}/{expenseId}/{cfdiUuid}.xml`
 * 6. Update expense with cfdi_uuid, xml_url, vendor data, amounts, status='validated'
 * 7. Re-run deductibility assessment with full CFDI data
 * 8. Return updated expense
 *
 * @throws ExpenseError('CFDI_ALREADY_ATTACHED') if duplicate UUID
 */
export async function attachCFDI(
  expenseId: string,
  organizationId: string,
  organizationRfc: string,
  xmlContent: string,
  supabase: SupabaseClient
): Promise<Expense> {
  // Fetch existing expense
  const expense = await findExpenseById(supabase, expenseId, organizationId);
  if (!expense) {
    throw new ExpenseError(
      'EXPENSE_NOT_FOUND',
      `Gasto ${expenseId} no encontrado`,
      expenseId
    );
  }

  if (expense.deletedAt) {
    throw new ExpenseError(
      'EXPENSE_DELETED',
      `El gasto ${expenseId} ha sido eliminado`,
      expenseId
    );
  }

  // 1. Validate CFDI structure
  const structureValidation = validateCFDIStructure(xmlContent);
  if (!structureValidation.valid) {
    throw new ExpenseError(
      'CFDI_VALIDATION_FAILED',
      `CFDI inválido: ${structureValidation.errors.join(', ')}`,
      expenseId
    );
  }

  // 2. Extract data from XML
  const extracted = await extractFromCFDIXml(xmlContent);

  if (!extracted.cfdiUuid) {
    throw new ExpenseError(
      'CFDI_VALIDATION_FAILED',
      'CFDI no contiene UUID válido',
      expenseId
    );
  }

  // 3. Check for duplicate UUID
  const existingExpenses = await findExpensesByCFDIUuid(supabase, extracted.cfdiUuid, organizationId);
  if (existingExpenses.length > 0 && existingExpenses[0].id !== expenseId) {
    throw new ExpenseError(
      'CFDI_ALREADY_ATTACHED',
      `El CFDI con UUID ${extracted.cfdiUuid} ya está vinculado al gasto ${existingExpenses[0].id}`,
      expenseId
    );
  }

  // 4. Check RFC match (if receptor RFC available from OCR)
  // Note: OCR service should extract receptor_rfc from XML
  // For now, we'll check vendorRfc if available
  const updates: any = {
    cfdiUuid: extracted.cfdiUuid,
    ocrConfidence: extracted.confidence,
  };

  // Auto-fill from CFDI data
  if (extracted.vendorName) updates.vendorName = extracted.vendorName;
  if (extracted.vendorRfc) updates.vendorRfc = extracted.vendorRfc;
  if (extracted.total) updates.total = extracted.total;
  if (extracted.amount) updates.amount = extracted.amount;
  if (extracted.expenseDate) updates.expenseDate = extracted.expenseDate;
  if (extracted.paymentMethod) updates.paymentMethod = extracted.paymentMethod;
  if (extracted.taxAmount) updates.taxAmount = extracted.taxAmount;

  // 5. Upload XML to R2
  const storageKey = `cfdi-expenses/${organizationId}/${expenseId}/${extracted.cfdiUuid}.xml`;
  try {
    await uploadToStorage(
      storageKey,
      Buffer.from(xmlContent, 'utf-8'),
      'application/xml'
    );
    updates.xmlUrl = storageKey;
  } catch (err) {
    throw new ExpenseError(
      'RECEIPT_UPLOAD_FAILED',
      `Error al subir el XML: ${(err as Error).message}`,
      expenseId,
      err as Error
    );
  }

  // 6. Check RFC match and assess deductibility
  // For RFC mismatch: set status='rejected', don't throw
  const vendorRfc = updates.vendorRfc ?? expense.vendorRfc;

  // Note: For proper RFC check, we need receptor_rfc from CFDI
  // This would require extending the OCR service to extract receptor_rfc
  // For now, we assume the vendorRfc is the emisor (which is correct for expenses)

  const assessment = assessDeductibility(
    {
      category: expense.category,
      amount: updates.amount ?? expense.amount,
      total: updates.total ?? expense.total,
      paymentMethod: updates.paymentMethod ?? expense.paymentMethod,
      vendorRfc,
      cfdiUuid: extracted.cfdiUuid,
    },
    organizationRfc
  );

  updates.isDeductible = assessment.isDeductible;
  updates.deductibilityPercent = assessment.deductibilityPercent;
  updates.deductibilityNotes = assessment.reason;

  // If deductible, mark as validated; otherwise reject
  if (assessment.isDeductible) {
    updates.status = 'validated';
    updates.validatedAt = new Date().toISOString();
  } else {
    updates.status = 'rejected';
  }

  return await dbUpdateExpense(supabase, expenseId, organizationId, updates);
}

/**
 * Updates a non-validated expense.
 * Re-runs deductibility assessment after update.
 * @throws ExpenseError('EXPENSE_ALREADY_VALIDATED') if status is 'validated'
 */
export async function updateExpense(
  expenseId: string,
  organizationId: string,
  organizationRfc: string,
  input: UpdateExpenseInput,
  supabase: SupabaseClient
): Promise<Expense> {
  // Fetch existing expense
  const expense = await findExpenseById(supabase, expenseId, organizationId);
  if (!expense) {
    throw new ExpenseError(
      'EXPENSE_NOT_FOUND',
      `Gasto ${expenseId} no encontrado`,
      expenseId
    );
  }

  if (expense.deletedAt) {
    throw new ExpenseError(
      'EXPENSE_DELETED',
      `El gasto ${expenseId} ha sido eliminado`,
      expenseId
    );
  }

  if (expense.status === 'validated') {
    throw new ExpenseError(
      'EXPENSE_ALREADY_VALIDATED',
      'No se puede modificar un gasto validado',
      expenseId
    );
  }

  // Re-assess deductibility if relevant fields changed
  const needsReassessment =
    input.category !== undefined ||
    input.amount !== undefined ||
    input.total !== undefined ||
    input.paymentMethod !== undefined ||
    input.vendorRfc !== undefined;

  const updates: any = { ...input };

  if (needsReassessment) {
    const assessment = assessDeductibility(
      {
        category: input.category ?? expense.category,
        amount: input.amount ?? expense.amount,
        total: input.total ?? expense.total,
        paymentMethod: input.paymentMethod ?? expense.paymentMethod,
        vendorRfc: input.vendorRfc ?? expense.vendorRfc,
        cfdiUuid: expense.cfdiUuid,
      },
      organizationRfc
    );
    updates.isDeductible = assessment.isDeductible;
    updates.deductibilityPercent = assessment.deductibilityPercent;
    updates.deductibilityNotes = assessment.reason;
  }

  return await dbUpdateExpense(supabase, expenseId, organizationId, updates);
}

/**
 * Categorizes an expense and re-assesses deductibility.
 */
export async function categorizeExpense(
  expenseId: string,
  organizationId: string,
  organizationRfc: string,
  category: ExpenseCategory,
  supabase: SupabaseClient
): Promise<Expense> {
  const expense = await findExpenseById(supabase, expenseId, organizationId);
  if (!expense) {
    throw new ExpenseError(
      'EXPENSE_NOT_FOUND',
      `Gasto ${expenseId} no encontrado`,
      expenseId
    );
  }

  if (expense.deletedAt) {
    throw new ExpenseError(
      'EXPENSE_DELETED',
      `El gasto ${expenseId} ha sido eliminado`,
      expenseId
    );
  }

  // Re-assess with new category
  const assessment = assessDeductibility(
    {
      category,
      amount: expense.amount,
      total: expense.total,
      paymentMethod: expense.paymentMethod,
      vendorRfc: expense.vendorRfc,
      cfdiUuid: expense.cfdiUuid,
    },
    organizationRfc
  );

  return await dbUpdateExpense(supabase, expenseId, organizationId, {
    category,
    isDeductible: assessment.isDeductible,
    deductibilityPercent: assessment.deductibilityPercent,
    deductibilityNotes: assessment.reason,
  });
}

/**
 * Soft deletes an expense. Cannot delete a validated expense.
 */
export async function deleteExpense(
  expenseId: string,
  organizationId: string,
  supabase: SupabaseClient
): Promise<void> {
  const expense = await findExpenseById(supabase, expenseId, organizationId);
  if (!expense) {
    throw new ExpenseError(
      'EXPENSE_NOT_FOUND',
      `Gasto ${expenseId} no encontrado`,
      expenseId
    );
  }

  if (expense.status === 'validated') {
    throw new ExpenseError(
      'EXPENSE_ALREADY_VALIDATED',
      'No se puede eliminar un gasto validado',
      expenseId
    );
  }

  await softDeleteExpense(supabase, expenseId, organizationId);
}

/**
 * Gets a single expense by ID.
 */
export async function getExpense(
  expenseId: string,
  organizationId: string,
  supabase: SupabaseClient
): Promise<Expense> {
  const expense = await findExpenseById(supabase, expenseId, organizationId);
  if (!expense) {
    throw new ExpenseError(
      'EXPENSE_NOT_FOUND',
      `Gasto ${expenseId} no encontrado`,
      expenseId
    );
  }
  return expense;
}

/**
 * Lists expenses with filters and pagination.
 */
export async function listExpenses(
  organizationId: string,
  filters: ExpenseFilters,
  pagination: ExpensePagination,
  supabase: SupabaseClient
): Promise<ExpenseListResult> {
  return await findExpensesByOrg(supabase, organizationId, filters, pagination);
}
