import { getOrganizationData } from './actions'
import { OrganizationProfileForm } from './organization-profile-form'
import { OrganizationAddressForm } from './organization-address-form'
import { SetupStatusCard } from './setup-status-card'

export default async function OrganizationSettingsPage() {
  const { organization, setupStatus } = await getOrganizationData()

  if (!organization) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-6">
        <h2 className="text-lg font-semibold text-red-800">Error</h2>
        <p className="text-red-700 mt-2">Organization not found. Please contact support.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Organization Settings</h1>
        <p className="mt-1 text-sm text-gray-600">
          Manage your organization profile and fiscal information
        </p>
      </div>

      {/* Setup Status */}
      <SetupStatusCard setupStatus={setupStatus} />

      {/* Organization Profile Form */}
      <div className="bg-white shadow rounded-lg">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Organization Profile</h2>
          <p className="text-sm text-gray-600 mt-1">
            Basic information about your organization
          </p>
        </div>
        <div className="p-6">
          <OrganizationProfileForm organization={organization} />
        </div>
      </div>

      {/* Address Form */}
      <div className="bg-white shadow rounded-lg">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Fiscal Address</h2>
          <p className="text-sm text-gray-600 mt-1">
            Address used for CFDI invoices (Domicilio Fiscal)
          </p>
        </div>
        <div className="p-6">
          <OrganizationAddressForm address={organization.address} />
        </div>
      </div>

      {/* RFC Info (Read-only) */}
      <div className="bg-white shadow rounded-lg">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">RFC Information</h2>
          <p className="text-sm text-gray-600 mt-1">
            Your RFC cannot be changed. Contact support if needed.
          </p>
        </div>
        <div className="p-6">
          <div className="bg-gray-50 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">RFC</p>
                <p className="text-xl font-mono font-bold text-gray-900">{organization.rfc}</p>
              </div>
              <div className="text-right">
                <p className="text-sm text-gray-600">Type</p>
                <p className="text-sm font-medium text-gray-900">
                  {organization.rfc.length === 12 ? 'Persona Moral' : 'Persona Física'}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
