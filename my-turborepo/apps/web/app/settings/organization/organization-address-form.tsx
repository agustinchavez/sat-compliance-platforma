'use client'

import { useActionState } from 'react'
import { updateOrganizationAddressAction, type OrganizationFormState } from './actions'
import type { OrganizationAddress } from '@/lib/organizations/types'

// Mexican states
const MEXICAN_STATES = [
  { code: 'AGU', name: 'Aguascalientes' },
  { code: 'BCN', name: 'Baja California' },
  { code: 'BCS', name: 'Baja California Sur' },
  { code: 'CAM', name: 'Campeche' },
  { code: 'CHP', name: 'Chiapas' },
  { code: 'CHH', name: 'Chihuahua' },
  { code: 'COA', name: 'Coahuila' },
  { code: 'COL', name: 'Colima' },
  { code: 'CMX', name: 'Ciudad de México' },
  { code: 'DUR', name: 'Durango' },
  { code: 'GUA', name: 'Guanajuato' },
  { code: 'GRO', name: 'Guerrero' },
  { code: 'HID', name: 'Hidalgo' },
  { code: 'JAL', name: 'Jalisco' },
  { code: 'MEX', name: 'Estado de México' },
  { code: 'MIC', name: 'Michoacán' },
  { code: 'MOR', name: 'Morelos' },
  { code: 'NAY', name: 'Nayarit' },
  { code: 'NLE', name: 'Nuevo León' },
  { code: 'OAX', name: 'Oaxaca' },
  { code: 'PUE', name: 'Puebla' },
  { code: 'QUE', name: 'Querétaro' },
  { code: 'ROO', name: 'Quintana Roo' },
  { code: 'SLP', name: 'San Luis Potosí' },
  { code: 'SIN', name: 'Sinaloa' },
  { code: 'SON', name: 'Sonora' },
  { code: 'TAB', name: 'Tabasco' },
  { code: 'TAM', name: 'Tamaulipas' },
  { code: 'TLA', name: 'Tlaxcala' },
  { code: 'VER', name: 'Veracruz' },
  { code: 'YUC', name: 'Yucatán' },
  { code: 'ZAC', name: 'Zacatecas' },
]

interface OrganizationAddressFormProps {
  address: OrganizationAddress | null
}

const initialState: OrganizationFormState = {
  success: false,
  error: null,
  message: null,
}

export function OrganizationAddressForm({ address }: OrganizationAddressFormProps) {
  const [state, formAction, isPending] = useActionState(updateOrganizationAddressAction, initialState)

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

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Street */}
        <div className="md:col-span-2">
          <label htmlFor="street" className="block text-sm font-medium text-gray-700 mb-1">
            Street (Calle) *
          </label>
          <input
            type="text"
            id="street"
            name="street"
            defaultValue={address?.street || ''}
            required
            className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            placeholder="Av. Paseo de la Reforma"
          />
        </div>

        {/* Exterior Number */}
        <div>
          <label htmlFor="exterior_number" className="block text-sm font-medium text-gray-700 mb-1">
            Exterior Number (Número Exterior) *
          </label>
          <input
            type="text"
            id="exterior_number"
            name="exterior_number"
            defaultValue={address?.exterior_number || ''}
            required
            className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            placeholder="123"
          />
        </div>

        {/* Interior Number */}
        <div>
          <label htmlFor="interior_number" className="block text-sm font-medium text-gray-700 mb-1">
            Interior Number (Número Interior)
          </label>
          <input
            type="text"
            id="interior_number"
            name="interior_number"
            defaultValue={address?.interior_number || ''}
            className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            placeholder="Piso 4, Oficina 401"
          />
        </div>

        {/* Colony */}
        <div>
          <label htmlFor="colony" className="block text-sm font-medium text-gray-700 mb-1">
            Colony (Colonia) *
          </label>
          <input
            type="text"
            id="colony"
            name="colony"
            defaultValue={address?.colony || ''}
            required
            className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            placeholder="Juárez"
          />
        </div>

        {/* Postal Code */}
        <div>
          <label htmlFor="postal_code" className="block text-sm font-medium text-gray-700 mb-1">
            Postal Code (Código Postal) *
          </label>
          <input
            type="text"
            id="postal_code"
            name="postal_code"
            defaultValue={address?.postal_code || ''}
            required
            pattern="[0-9]{5}"
            maxLength={5}
            className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            placeholder="06600"
          />
          <p className="mt-1 text-xs text-gray-500">5-digit Mexican postal code</p>
        </div>

        {/* Locality */}
        <div>
          <label htmlFor="locality" className="block text-sm font-medium text-gray-700 mb-1">
            Locality (Localidad)
          </label>
          <input
            type="text"
            id="locality"
            name="locality"
            defaultValue={address?.locality || ''}
            className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            placeholder="Optional"
          />
        </div>

        {/* Municipality */}
        <div>
          <label htmlFor="municipality" className="block text-sm font-medium text-gray-700 mb-1">
            Municipality (Municipio/Delegación)
          </label>
          <input
            type="text"
            id="municipality"
            name="municipality"
            defaultValue={address?.municipality || ''}
            className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            placeholder="Cuauhtémoc"
          />
        </div>

        {/* City */}
        <div>
          <label htmlFor="city" className="block text-sm font-medium text-gray-700 mb-1">
            City (Ciudad) *
          </label>
          <input
            type="text"
            id="city"
            name="city"
            defaultValue={address?.city || ''}
            required
            className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            placeholder="Ciudad de México"
          />
        </div>

        {/* State */}
        <div>
          <label htmlFor="state" className="block text-sm font-medium text-gray-700 mb-1">
            State (Estado) *
          </label>
          <select
            id="state"
            name="state"
            defaultValue={address?.state || ''}
            required
            className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="">Select a state...</option>
            {MEXICAN_STATES.map((state) => (
              <option key={state.code} value={state.code}>
                {state.name}
              </option>
            ))}
          </select>
        </div>

        {/* Country */}
        <div>
          <label htmlFor="country" className="block text-sm font-medium text-gray-700 mb-1">
            Country (País)
          </label>
          <input
            type="text"
            id="country"
            name="country"
            defaultValue={address?.country || 'México'}
            className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            readOnly
          />
        </div>
      </div>

      {/* Submit Button */}
      <div className="flex justify-end pt-4 border-t border-gray-200">
        <button
          type="submit"
          disabled={isPending}
          className="px-6 py-2 bg-blue-600 text-white font-medium rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isPending ? 'Saving...' : 'Save Address'}
        </button>
      </div>
    </form>
  )
}
