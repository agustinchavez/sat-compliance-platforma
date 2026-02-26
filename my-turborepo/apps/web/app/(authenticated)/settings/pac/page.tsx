import { getPACData } from './actions'
import { PACConfigForm } from './pac-config-form'
import { PACStatusCard } from './pac-status-card'

export default async function PACSettingsPage() {
  const { config } = await getPACData()

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">PAC Provider</h1>
        <p className="mt-1 text-sm text-gray-600">
          Configure your PAC (Proveedor Autorizado de Certificación) for invoice stamping
        </p>
      </div>

      {/* Info Banner */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div className="flex">
          <span className="text-2xl mr-3">🔗</span>
          <div>
            <h3 className="font-semibold text-blue-800">About PAC Providers</h3>
            <p className="text-sm text-blue-700 mt-1">
              PAC providers are authorized by SAT to stamp (timbrar) CFDI invoices with the official
              digital seal. You need an account with a PAC provider to generate valid invoices.
            </p>
          </div>
        </div>
      </div>

      {/* Current PAC Status */}
      {config && <PACStatusCard config={config} />}

      {/* PAC Configuration Form */}
      <div className="bg-white shadow rounded-lg">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">
            {config ? 'Update PAC Configuration' : 'Configure PAC Provider'}
          </h2>
          <p className="text-sm text-gray-600 mt-1">
            {config
              ? 'Update your PAC credentials or switch providers'
              : 'Enter your PAC provider credentials to enable invoice stamping'
            }
          </p>
        </div>
        <div className="p-6">
          <PACConfigForm currentConfig={config} />
        </div>
      </div>

      {/* Supported Providers */}
      <div className="bg-white shadow rounded-lg p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Supported PAC Providers</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <ProviderCard
            name="Finkok"
            description="One of Mexico's largest PAC providers with competitive pricing"
            website="https://www.finkok.com"
          />
          <ProviderCard
            name="SW (Smarter Web)"
            description="Modern REST API with extensive documentation"
            website="https://sw.com.mx"
          />
          <ProviderCard
            name="Diverza"
            description="Enterprise-focused PAC with advanced features"
            website="https://www.diverza.com"
          />
          <ProviderCard
            name="Facturaxion"
            description="User-friendly PAC with good support"
            website="https://www.facturaxion.com"
          />
        </div>
      </div>
    </div>
  )
}

function ProviderCard({
  name,
  description,
  website,
}: {
  name: string
  description: string
  website: string
}) {
  return (
    <div className="border border-gray-200 rounded-lg p-4">
      <h4 className="font-semibold text-gray-900">{name}</h4>
      <p className="text-sm text-gray-600 mt-1">{description}</p>
      <a
        href={website}
        target="_blank"
        rel="noopener noreferrer"
        className="text-sm text-blue-600 hover:text-blue-800 mt-2 inline-block"
      >
        Visit website →
      </a>
    </div>
  )
}
