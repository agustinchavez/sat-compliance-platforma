'use server'

import { revalidatePath } from 'next/cache'
import { requireAuth } from '@/lib/auth'
import { createProductService } from '@/lib/products/service'
import { searchSATProductCodes, searchSATUnitCodes, suggestSATCode } from '@/lib/products/sat-codes'
import type { Product, ProductCreateInput, ProductUpdateInput, ProductFilters } from '@/lib/products/types'

export interface ProductFormState {
  success: boolean
  error: string | null
  message: string | null
  productId?: string
  validationErrors?: Array<{ field: string; message: string }>
}

/**
 * Get products list with filters
 */
export async function getProductsData(options?: {
  search?: string
  filters?: ProductFilters
  page?: number
  limit?: number
}): Promise<{
  products: Product[]
  total: number
  page: number
  pages: number
}> {
  const user = await requireAuth()
  const productService = createProductService(user.organizationId)

  if (options?.search) {
    const products = await productService.search(options.search, {
      is_active: options?.filters?.is_active,
      type: options?.filters?.type,
      category: options?.filters?.category,
      limit: options?.limit || 50,
    })
    return {
      products,
      total: products.length,
      page: 1,
      pages: 1,
    }
  }

  const result = await productService.list(
    options?.filters,
    { field: 'name', order: 'asc' },
    { page: options?.page || 1, limit: options?.limit || 50 }
  )

  return {
    products: result.products,
    total: result.total,
    page: result.page,
    pages: result.pages,
  }
}

/**
 * Get product categories
 */
export async function getCategories(): Promise<string[]> {
  const user = await requireAuth()
  const productService = createProductService(user.organizationId)
  return productService.getCategories()
}

/**
 * Search SAT product codes
 */
export async function searchProductCodes(query: string) {
  return searchSATProductCodes(query, 20)
}

/**
 * Search SAT unit codes
 */
export async function searchUnitCodes(query: string) {
  return searchSATUnitCodes(query, 20)
}

/**
 * AI-powered SAT code suggestions
 * Uses semantic search for better matching of product descriptions
 */
export async function suggestSATCodes(description: string, limit: number = 5) {
  return suggestSATCode(description, limit)
}

/**
 * Create a new product
 */
export async function createProductAction(
  _prevState: ProductFormState,
  formData: FormData
): Promise<ProductFormState> {
  try {
    const user = await requireAuth()
    const productService = createProductService(user.organizationId)

    // Extract form data
    const data: ProductCreateInput = {
      name: formData.get('name') as string,
      description: formData.get('description') as string || undefined,
      type: formData.get('type') as 'product' | 'service',
      sku: formData.get('sku') as string || undefined,
      barcode: formData.get('barcode') as string || undefined,
      sat_product_code: formData.get('sat_product_code') as string,
      sat_unit_code: formData.get('sat_unit_code') as string,
      unit_name: formData.get('unit_name') as string,
      price: parseFloat(formData.get('price') as string) || 0,
      currency: 'MXN',
      tax_object: (formData.get('tax_object') as '01' | '02' | '03') || '02',
      iva_rate: parseFloat(formData.get('iva_rate') as string) as 0 | 0.08 | 0.16 || 0.16,
      iva_exempt: formData.get('iva_exempt') === 'true',
      iva_retention: formData.get('iva_retention') === 'true',
      iva_retention_rate: formData.get('iva_retention') === 'true' ? 0.1067 : undefined,
      isr_retention: formData.get('isr_retention') === 'true',
      isr_retention_rate: formData.get('isr_retention') === 'true' ? 0.10 : undefined,
      track_inventory: formData.get('track_inventory') === 'true',
      current_stock: parseInt(formData.get('current_stock') as string) || 0,
      min_stock: parseInt(formData.get('min_stock') as string) || undefined,
      category: formData.get('category') as string || undefined,
      tags: formData.get('tags') ? (formData.get('tags') as string).split(',').map(t => t.trim()).filter(Boolean) : [],
      is_active: formData.get('is_active') !== 'false',
    }

    // Validate required fields
    if (!data.name?.trim()) {
      return { success: false, error: 'Name is required', message: null }
    }
    if (!data.sat_product_code) {
      return { success: false, error: 'SAT Product Code is required', message: null }
    }
    if (!data.sat_unit_code) {
      return { success: false, error: 'SAT Unit Code is required', message: null }
    }
    if (!data.unit_name) {
      return { success: false, error: 'Unit name is required', message: null }
    }

    const result = await productService.create(data)

    if (!result.data) {
      return {
        success: false,
        error: result.error || 'Failed to create product',
        message: null,
        validationErrors: result.validationErrors,
      }
    }

    revalidatePath('/products')

    return {
      success: true,
      error: null,
      message: 'Product created successfully',
      productId: result.data.id,
    }
  } catch (error) {
    console.error('Error creating product:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create product',
      message: null,
    }
  }
}

/**
 * Update an existing product
 */
export async function updateProductAction(
  productId: string,
  _prevState: ProductFormState,
  formData: FormData
): Promise<ProductFormState> {
  try {
    const user = await requireAuth()
    const productService = createProductService(user.organizationId)

    // Extract form data
    const data: ProductUpdateInput = {
      name: formData.get('name') as string,
      description: formData.get('description') as string || undefined,
      type: formData.get('type') as 'product' | 'service',
      sku: formData.get('sku') as string || undefined,
      barcode: formData.get('barcode') as string || undefined,
      sat_product_code: formData.get('sat_product_code') as string,
      sat_unit_code: formData.get('sat_unit_code') as string,
      unit_name: formData.get('unit_name') as string,
      price: parseFloat(formData.get('price') as string) || 0,
      currency: 'MXN',
      tax_object: (formData.get('tax_object') as '01' | '02' | '03') || '02',
      iva_rate: parseFloat(formData.get('iva_rate') as string) as 0 | 0.08 | 0.16 || 0.16,
      iva_exempt: formData.get('iva_exempt') === 'true',
      iva_retention: formData.get('iva_retention') === 'true',
      iva_retention_rate: formData.get('iva_retention') === 'true' ? 0.1067 : undefined,
      isr_retention: formData.get('isr_retention') === 'true',
      isr_retention_rate: formData.get('isr_retention') === 'true' ? 0.10 : undefined,
      track_inventory: formData.get('track_inventory') === 'true',
      current_stock: formData.get('current_stock') ? parseInt(formData.get('current_stock') as string) : undefined,
      min_stock: parseInt(formData.get('min_stock') as string) || undefined,
      category: formData.get('category') as string || undefined,
      tags: formData.get('tags') ? (formData.get('tags') as string).split(',').map(t => t.trim()).filter(Boolean) : [],
      is_active: formData.get('is_active') !== 'false',
    }

    const result = await productService.update(productId, data)

    if (!result.data) {
      return {
        success: false,
        error: result.error || 'Failed to update product',
        message: null,
        validationErrors: result.validationErrors,
      }
    }

    revalidatePath('/products')
    revalidatePath(`/products/${productId}`)

    return {
      success: true,
      error: null,
      message: 'Product updated successfully',
    }
  } catch (error) {
    console.error('Error updating product:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update product',
      message: null,
    }
  }
}

/**
 * Delete a product
 */
export async function deleteProductAction(
  productId: string
): Promise<ProductFormState> {
  try {
    const user = await requireAuth()
    const productService = createProductService(user.organizationId)

    const result = await productService.delete(productId)

    if (!result.success) {
      return { success: false, error: result.error || 'Failed to delete product', message: null }
    }

    revalidatePath('/products')

    return {
      success: true,
      error: null,
      message: 'Product deleted',
    }
  } catch (error) {
    console.error('Error deleting product:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to delete product',
      message: null,
    }
  }
}

/**
 * Get a single product by ID
 */
export async function getProductById(productId: string): Promise<Product | null> {
  const user = await requireAuth()
  const productService = createProductService(user.organizationId)
  return productService.get(productId)
}
