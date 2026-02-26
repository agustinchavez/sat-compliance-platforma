'use client'

import { useActionState, useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import type { Customer } from '@/lib/customers/types'
import type { TaxRegime, CFDIUse } from '@/lib/customers/types'
import type { CustomerFormState } from '../../actions'

interface EditCustomerFormProps {
  customer: Customer
  taxRegimes: TaxRegime[]
  cfdiUses: CFDIUse[]
  updateAction: (prevState: CustomerFormState, formData: FormData) => Promise<CustomerFormState>
  customerId: string
}

const initialState: CustomerFormState = {
  success: false,
  error: null,
  message: null,
}

const MEXICAN_STATES = [
  { code: 'AGS', name: 'Aguascalientes' },
  { code: 'BC', name: 'Baja California' },
  { code: 'BCS', name: 'Baja California Sur' },
  { code: 'CAMP', name: 'Campeche' },
  { code: 'COAH', name: 'Coahuila' },
  { code: 'COL', name: 'Colima' },
  { code: 'CHIS', name: 'Chiapas' },
  { code: 'CHIH', name: 'Chihuahua' },
  { code: 'CDMX', name: 'Ciudad de México' },
  { code: 'DGO', name: 'Durango' },
  { code: 'GTO', name: 'Guanajuato' },
  { code: 'GRO', name: 'Guerrero' },
  { code: 'HGO', name: 'Hidalgo' },
  { code: 'JAL', name: 'Jalisco' },
  { code: 'MEX', name: 'Estado de México' },
  { code: 'MICH', name: 'Michoacán' },
  { code: 'MOR', name: 'Morelos' },
  { code: 'NAY', name: 'Nayarit' },
  { code: 'NL', name: 'Nuevo León' },
  { code: 'OAX', name: 'Oaxaca' },
  { code: 'PUE', name: 'Puebla' },
  { code: 'QRO', name: 'Querétaro' },
  { code: 'QROO', name: 'Quintana Roo' },
  { code: 'SLP', name: 'San Luis Potosí' },
  { code: 'SIN', name: 'Sinaloa' },
  { code: 'SON', name: 'Sonora' },
  { code: 'TAB', name: 'Tabasco' },
  { code: 'TAMPS', name: 'Tamaulipas' },
  { code: 'TLAX', name: 'Tlaxcala' },
  { code: 'VER', name: 'Veracruz' },
  { code: 'YUC', name: 'Yucatán' },
  { code: 'ZAC', name: 'Zacatecas' },
]

export function EditCustomerForm({ customer, taxRegimes, cfdiUses, updateAction, customerId }: EditCustomerFormProps) {
  const router = useRouter()
  const [state, formAction, isPending] = useActionState(updateAction, initialState)
  const [showAddress, setShowAddress] = useState(!!customer.address)

  // RFC is read-only for edit, determine type for display
  const rfcType = customer.rfc.length === 12 ? 'legal_entity' : customer.rfc.length === 13 ? 'individual' : null
  const filteredTaxRegimes = rfcType
    ? taxRegimes.filter(r => r.applicable_to === rfcType || r.applicable_to === 'both')
    : taxRegimes

  // Handle success - redirect to customer detail page
  useEffect(() => {
    if (state.success) {
      router.push(`/customers/${customerId}`)
    }
  }, [state.success, customerId, router])

  const handleCancel = () => {
    router.push(`/customers/${customerId}`)
  }

  return (
    <form action={formAction} className="space-y-6">
      {/* Status Messages */}
      {state.error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-sm text-red-700">{state.error}</p>
        </div>
      )}
      {state.message && state.success && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <p className="text-sm text-green-700">{state.message}</p>
        </div>
      )}

      {/* Basic Information */}
      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <h3 className="text-lg font-medium text-gray-900 mb-4">Basic Information</h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* RFC - Read-only for edit */}
          <div>
            <label htmlFor="rfc" className="block text-sm font-medium text-gray-700 mb-1">
              RFC
            </label>
            <input
              type="text"
              id="rfc"
              name="rfc"
              value={customer.rfc}
              readOnly
              className="w-full px-3 py-2 border border-gray-200 rounded-md bg-gray-50 font-mono uppercase text-gray-600 cursor-not-allowed"
            />
            {rfcType && (
              <p className="mt-1 text-xs text-gray-500">
                {rfcType === 'legal_entity' ? 'Persona Moral (12 chars)' : 'Persona Física (13 chars)'} - Cannot be changed
              </p>
            )}
          </div>

          {/* Legal Name */}
          <div>
            <label htmlFor="legal_name" className="block text-sm font-medium text-gray-700 mb-1">
              Razón Social *
            </label>
            <input
              type="text"
              id="legal_name"
              name="legal_name"
              defaultValue={customer.legal_name}
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="Legal business name"
            />
          </div>

          {/* Business Name */}
          <div>
            <label htmlFor="business_name" className="block text-sm font-medium text-gray-700 mb-1">
              Nombre Comercial
            </label>
            <input
              type="text"
              id="business_name"
              name="business_name"
              defaultValue={customer.business_name || ''}
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="Trade name (optional)"
            />
          </div>

          {/* Email */}
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
              Email
            </label>
            <input
              type="email"
              id="email"
              name="email"
              defaultValue={customer.email || ''}
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="customer@email.com"
            />
          </div>

          {/* Phone */}
          <div>
            <label htmlFor="phone" className="block text-sm font-medium text-gray-700 mb-1">
              Phone
            </label>
            <input
              type="tel"
              id="phone"
              name="phone"
              defaultValue={customer.phone || ''}
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="+52 55 1234 5678"
            />
          </div>
        </div>
      </div>

      {/* Fiscal Information */}
      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <h3 className="text-lg font-medium text-gray-900 mb-4">Fiscal Information (SAT)</h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Tax Regime */}
          <div>
            <label htmlFor="tax_regime" className="block text-sm font-medium text-gray-700 mb-1">
              Régimen Fiscal *
            </label>
            <select
              id="tax_regime"
              name="tax_regime"
              defaultValue={customer.tax_regime}
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">Select tax regime...</option>
              {filteredTaxRegimes.map((regime) => (
                <option key={regime.code} value={regime.code}>
                  {regime.code} - {regime.name}
                </option>
              ))}
            </select>
          </div>

          {/* CFDI Use */}
          <div>
            <label htmlFor="cfdi_use" className="block text-sm font-medium text-gray-700 mb-1">
              Uso de CFDI *
            </label>
            <select
              id="cfdi_use"
              name="cfdi_use"
              defaultValue={customer.cfdi_use}
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">Select CFDI use...</option>
              {cfdiUses.map((use) => (
                <option key={use.code} value={use.code}>
                  {use.code} - {use.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Address (Collapsible) */}
      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <button
          type="button"
          onClick={() => setShowAddress(!showAddress)}
          className="flex items-center justify-between w-full text-left"
        >
          <h3 className="text-lg font-medium text-gray-900">Address (Optional)</h3>
          <span className="text-gray-400">{showAddress ? '−' : '+'}</span>
        </button>

        {showAddress && (
          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <label htmlFor="street" className="block text-sm font-medium text-gray-700 mb-1">
                Street
              </label>
              <input
                type="text"
                id="street"
                name="street"
                defaultValue={customer.address?.street || ''}
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="Calle"
              />
            </div>
            <div>
              <label htmlFor="exterior_number" className="block text-sm font-medium text-gray-700 mb-1">
                Exterior Number
              </label>
              <input
                type="text"
                id="exterior_number"
                name="exterior_number"
                defaultValue={customer.address?.exterior_number || ''}
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="123"
              />
            </div>
            <div>
              <label htmlFor="interior_number" className="block text-sm font-medium text-gray-700 mb-1">
                Interior Number
              </label>
              <input
                type="text"
                id="interior_number"
                name="interior_number"
                defaultValue={customer.address?.interior_number || ''}
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="A (optional)"
              />
            </div>
            <div>
              <label htmlFor="colony" className="block text-sm font-medium text-gray-700 mb-1">
                Colony
              </label>
              <input
                type="text"
                id="colony"
                name="colony"
                defaultValue={customer.address?.colony || ''}
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="Colonia"
              />
            </div>
            <div>
              <label htmlFor="postal_code" className="block text-sm font-medium text-gray-700 mb-1">
                Postal Code
              </label>
              <input
                type="text"
                id="postal_code"
                name="postal_code"
                defaultValue={customer.address?.postal_code || ''}
                maxLength={5}
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="06600"
              />
            </div>
            <div>
              <label htmlFor="city" className="block text-sm font-medium text-gray-700 mb-1">
                City
              </label>
              <input
                type="text"
                id="city"
                name="city"
                defaultValue={customer.address?.city || ''}
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="Ciudad"
              />
            </div>
            <div>
              <label htmlFor="state" className="block text-sm font-medium text-gray-700 mb-1">
                State
              </label>
              <select
                id="state"
                name="state"
                defaultValue={customer.address?.state || ''}
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="">Select state...</option>
                {MEXICAN_STATES.map((state) => (
                  <option key={state.code} value={state.code}>
                    {state.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}
      </div>

      {/* Additional Info */}
      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <h3 className="text-lg font-medium text-gray-900 mb-4">Additional Info</h3>

        <div className="space-y-4">
          <div>
            <label htmlFor="notes" className="block text-sm font-medium text-gray-700 mb-1">
              Notes
            </label>
            <textarea
              id="notes"
              name="notes"
              rows={3}
              defaultValue={customer.notes || ''}
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="Internal notes about this customer..."
            />
          </div>

          <div>
            <label htmlFor="tags" className="block text-sm font-medium text-gray-700 mb-1">
              Tags
            </label>
            <input
              type="text"
              id="tags"
              name="tags"
              defaultValue={customer.tags?.join(', ') || ''}
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="vip, wholesale, preferred (comma-separated)"
            />
          </div>

          <div className="flex items-center">
            <input
              type="checkbox"
              id="is_active"
              name="is_active"
              value="true"
              defaultChecked={customer.is_active !== false}
              className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
            />
            <label htmlFor="is_active" className="ml-2 text-sm text-gray-700">
              Active customer
            </label>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex justify-end space-x-3">
        <button
          type="button"
          onClick={handleCancel}
          className="px-4 py-2 text-sm text-gray-700 hover:text-gray-900 border border-gray-300 rounded-md hover:bg-gray-50"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={isPending}
          className="px-6 py-2 bg-blue-600 text-white font-medium rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isPending ? 'Saving...' : 'Update Customer'}
        </button>
      </div>
    </form>
  )
}
