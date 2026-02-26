'use server'

import { revalidatePath } from 'next/cache'
import { requireAuth } from '@/lib/auth'
import {
  createCustomer,
  updateCustomer,
  deleteCustomer,
  listCustomers,
  searchCustomers,
  getCustomer,
} from '@/lib/customers/service'
import { getTaxRegimes, getCFDIUses } from '@/lib/customers/sat-catalogs'
import type { Customer, CreateCustomerInput, UpdateCustomerInput, CustomerFilters } from '@/lib/customers/types'

export interface CustomerFormState {
  success: boolean
  error: string | null
  message: string | null
  customerId?: string
}

/**
 * Get customers list with filters
 */
export async function getCustomersData(options?: {
  search?: string
  filters?: CustomerFilters
  page?: number
  limit?: number
}): Promise<{
  customers: Customer[]
  total: number
  page: number
  pages: number
}> {
  const user = await requireAuth()

  if (options?.search) {
    const result = await searchCustomers(user.organizationId, options.search, {
      limit: options?.limit || 50,
      offset: ((options?.page || 1) - 1) * (options?.limit || 50),
      ...options?.filters,
    })
    return {
      customers: result.customers,
      total: result.total,
      page: result.page,
      pages: result.pages,
    }
  }

  const result = await listCustomers(user.organizationId, {
    filters: options?.filters,
    pagination: {
      page: options?.page || 1,
      limit: options?.limit || 50,
    },
    sort: { field: 'legal_name', order: 'asc' },
  })

  return {
    customers: result.customers,
    total: result.total,
    page: result.page,
    pages: result.pages,
  }
}

/**
 * Get SAT catalogs for forms
 */
export async function getSATCatalogs() {
  return {
    taxRegimes: getTaxRegimes(),
    cfdiUses: getCFDIUses(),
  }
}

/**
 * Create a new customer
 */
export async function createCustomerAction(
  _prevState: CustomerFormState,
  formData: FormData
): Promise<CustomerFormState> {
  try {
    const user = await requireAuth()

    // Extract form data
    const data: CreateCustomerInput = {
      rfc: formData.get('rfc') as string,
      legal_name: formData.get('legal_name') as string,
      business_name: formData.get('business_name') as string || undefined,
      email: formData.get('email') as string || undefined,
      phone: formData.get('phone') as string || undefined,
      tax_regime: formData.get('tax_regime') as string,
      cfdi_use: formData.get('cfdi_use') as string,
      notes: formData.get('notes') as string || undefined,
      tags: formData.get('tags') ? (formData.get('tags') as string).split(',').map(t => t.trim()).filter(Boolean) : [],
      is_active: formData.get('is_active') === 'true',
    }

    // Add address if provided
    const street = formData.get('street') as string
    if (street) {
      data.address = {
        street,
        exterior_number: formData.get('exterior_number') as string,
        interior_number: formData.get('interior_number') as string || undefined,
        colony: formData.get('colony') as string,
        city: formData.get('city') as string,
        state: formData.get('state') as string,
        postal_code: formData.get('postal_code') as string,
        country: 'México',
      }
    }

    // Validate required fields
    if (!data.rfc?.trim()) {
      return { success: false, error: 'RFC is required', message: null }
    }
    if (!data.legal_name?.trim()) {
      return { success: false, error: 'Legal name (Razón Social) is required', message: null }
    }
    if (!data.tax_regime) {
      return { success: false, error: 'Tax regime is required', message: null }
    }
    if (!data.cfdi_use) {
      return { success: false, error: 'CFDI use is required', message: null }
    }

    const customer = await createCustomer(user.organizationId, data)

    revalidatePath('/customers')

    return {
      success: true,
      error: null,
      message: 'Customer created successfully',
      customerId: customer.id,
    }
  } catch (error) {
    console.error('Error creating customer:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create customer',
      message: null,
    }
  }
}

/**
 * Update an existing customer
 */
export async function updateCustomerAction(
  customerId: string,
  _prevState: CustomerFormState,
  formData: FormData
): Promise<CustomerFormState> {
  try {
    await requireAuth()

    // Extract form data
    const data: UpdateCustomerInput = {
      legal_name: formData.get('legal_name') as string,
      business_name: formData.get('business_name') as string || undefined,
      email: formData.get('email') as string || undefined,
      phone: formData.get('phone') as string || undefined,
      tax_regime: formData.get('tax_regime') as string,
      cfdi_use: formData.get('cfdi_use') as string,
      notes: formData.get('notes') as string || undefined,
      tags: formData.get('tags') ? (formData.get('tags') as string).split(',').map(t => t.trim()).filter(Boolean) : [],
      is_active: formData.get('is_active') === 'true',
    }

    // Add address if provided
    const street = formData.get('street') as string
    if (street) {
      data.address = {
        street,
        exterior_number: formData.get('exterior_number') as string,
        interior_number: formData.get('interior_number') as string || undefined,
        colony: formData.get('colony') as string,
        city: formData.get('city') as string,
        state: formData.get('state') as string,
        postal_code: formData.get('postal_code') as string,
        country: 'México',
      }
    }

    await updateCustomer(customerId, data)

    revalidatePath('/customers')
    revalidatePath(`/customers/${customerId}`)

    return {
      success: true,
      error: null,
      message: 'Customer updated successfully',
    }
  } catch (error) {
    console.error('Error updating customer:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update customer',
      message: null,
    }
  }
}

/**
 * Delete a customer
 */
export async function deleteCustomerAction(
  customerId: string
): Promise<CustomerFormState> {
  try {
    await requireAuth()

    await deleteCustomer(customerId)

    revalidatePath('/customers')

    return {
      success: true,
      error: null,
      message: 'Customer deleted',
    }
  } catch (error) {
    console.error('Error deleting customer:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to delete customer',
      message: null,
    }
  }
}

/**
 * Get a single customer by ID
 */
export async function getCustomerById(customerId: string): Promise<Customer | null> {
  await requireAuth()
  return getCustomer(customerId)
}
