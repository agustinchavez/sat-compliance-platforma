'use client'

import { useActionState } from 'react'
import { updateOrganizationProfile, type OrganizationFormState } from './actions'
import type { Organization } from '@/lib/organizations/types'

// Common Mexican tax regimes
const TAX_REGIMES = [
  { code: '601', name: 'General de Ley Personas Morales' },
  { code: '603', name: 'Personas Morales con Fines no Lucrativos' },
  { code: '605', name: 'Sueldos y Salarios e Ingresos Asimilados a Salarios' },
  { code: '606', name: 'Arrendamiento' },
  { code: '607', name: 'Régimen de Enajenación o Adquisición de Bienes' },
  { code: '608', name: 'Demás ingresos' },
  { code: '610', name: 'Residentes en el Extranjero sin Establecimiento Permanente en México' },
  { code: '611', name: 'Ingresos por Dividendos (socios y accionistas)' },
  { code: '612', name: 'Personas Físicas con Actividades Empresariales y Profesionales' },
  { code: '614', name: 'Ingresos por intereses' },
  { code: '615', name: 'Régimen de los ingresos por obtención de premios' },
  { code: '616', name: 'Sin obligaciones fiscales' },
  { code: '620', name: 'Sociedades Cooperativas de Producción que optan por diferir sus ingresos' },
  { code: '621', name: 'Incorporación Fiscal' },
  { code: '622', name: 'Actividades Agrícolas, Ganaderas, Silvícolas y Pesqueras' },
  { code: '623', name: 'Opcional para Grupos de Sociedades' },
  { code: '624', name: 'Coordinados' },
  { code: '625', name: 'Régimen de las Actividades Empresariales con ingresos a través de Plataformas Tecnológicas' },
  { code: '626', name: 'Régimen Simplificado de Confianza' },
]

interface OrganizationProfileFormProps {
  organization: Organization
}

const initialState: OrganizationFormState = {
  success: false,
  error: null,
  message: null,
}

export function OrganizationProfileForm({ organization }: OrganizationProfileFormProps) {
  const [state, formAction, isPending] = useActionState(updateOrganizationProfile, initialState)

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
        {/* Organization Name */}
        <div>
          <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
            Organization Name *
          </label>
          <input
            type="text"
            id="name"
            name="name"
            defaultValue={organization.name}
            required
            className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            placeholder="My Company"
          />
          <p className="mt-1 text-xs text-gray-500">Display name for your organization</p>
        </div>

        {/* Legal Name */}
        <div>
          <label htmlFor="legal_name" className="block text-sm font-medium text-gray-700 mb-1">
            Legal Name (Razón Social) *
          </label>
          <input
            type="text"
            id="legal_name"
            name="legal_name"
            defaultValue={organization.legal_name}
            required
            className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            placeholder="MI EMPRESA SA DE CV"
          />
          <p className="mt-1 text-xs text-gray-500">Official name as registered with SAT</p>
        </div>

        {/* Email */}
        <div>
          <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
            Contact Email
          </label>
          <input
            type="email"
            id="email"
            name="email"
            defaultValue={organization.email || ''}
            className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            placeholder="contact@company.com"
          />
        </div>

        {/* Phone */}
        <div>
          <label htmlFor="phone" className="block text-sm font-medium text-gray-700 mb-1">
            Phone Number
          </label>
          <input
            type="tel"
            id="phone"
            name="phone"
            defaultValue={organization.phone || ''}
            className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            placeholder="+52 55 1234 5678"
          />
        </div>

        {/* Tax Regime */}
        <div className="md:col-span-2">
          <label htmlFor="tax_regime" className="block text-sm font-medium text-gray-700 mb-1">
            Tax Regime (Régimen Fiscal)
          </label>
          <select
            id="tax_regime"
            name="tax_regime"
            defaultValue={organization.tax_regime || ''}
            className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="">Select a tax regime...</option>
            {TAX_REGIMES.map((regime) => (
              <option key={regime.code} value={regime.code}>
                {regime.code} - {regime.name}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-gray-500">
            Your tax regime as registered with SAT (required for CFDI)
          </p>
        </div>
      </div>

      {/* Submit Button */}
      <div className="flex justify-end pt-4 border-t border-gray-200">
        <button
          type="submit"
          disabled={isPending}
          className="px-6 py-2 bg-blue-600 text-white font-medium rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isPending ? 'Saving...' : 'Save Changes'}
        </button>
      </div>
    </form>
  )
}
