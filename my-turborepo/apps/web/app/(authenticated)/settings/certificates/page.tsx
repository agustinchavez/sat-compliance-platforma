import { getCertificateData } from './actions'
import { CertificateUploadForm } from './certificate-upload-form'
import { CertificateStatusCard } from './certificate-status-card'

export default async function CertificatesSettingsPage() {
  const { certificateInfo, expirationStatus } = await getCertificateData()

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">CFDI Certificates</h1>
        <p className="mt-1 text-sm text-gray-600">
          Manage your digital certificates (CSD) for signing CFDI invoices
        </p>
      </div>

      {/* Info Banner */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div className="flex">
          <span className="text-2xl mr-3">📜</span>
          <div>
            <h3 className="font-semibold text-blue-800">About CFDI Certificates (CSD)</h3>
            <p className="text-sm text-blue-700 mt-1">
              CFDI certificates (Certificado de Sello Digital) are digital signatures required by SAT
              to validate your electronic invoices. You can obtain them from the{' '}
              <a
                href="https://www.sat.gob.mx"
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:text-blue-900"
              >
                SAT portal
              </a>
              .
            </p>
          </div>
        </div>
      </div>

      {/* Current Certificate Status */}
      {certificateInfo && (
        <CertificateStatusCard
          certificateInfo={certificateInfo}
          expirationStatus={expirationStatus}
        />
      )}

      {/* Upload Form */}
      <div className="bg-white shadow rounded-lg">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">
            {certificateInfo ? 'Update Certificates' : 'Upload Certificates'}
          </h2>
          <p className="text-sm text-gray-600 mt-1">
            {certificateInfo
              ? 'Upload new certificate files to replace the current ones'
              : 'Upload your .cer and .key files from SAT'
            }
          </p>
        </div>
        <div className="p-6">
          <CertificateUploadForm hasCertificate={!!certificateInfo} />
        </div>
      </div>

      {/* Help Section */}
      <div className="bg-white shadow rounded-lg p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">How to Get Your Certificates</h3>
        <ol className="list-decimal list-inside space-y-3 text-sm text-gray-700">
          <li>
            <span className="font-medium">Log in to SAT portal</span>
            <p className="ml-6 text-gray-600">
              Go to <a href="https://www.sat.gob.mx" target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">sat.gob.mx</a> and
              access your account with your e.firma (FIEL)
            </p>
          </li>
          <li>
            <span className="font-medium">Navigate to CSD section</span>
            <p className="ml-6 text-gray-600">
              Go to "Factura Electrónica" → "Certificados" → "Generar certificado"
            </p>
          </li>
          <li>
            <span className="font-medium">Generate your CSD</span>
            <p className="ml-6 text-gray-600">
              Follow the wizard to generate your Certificado de Sello Digital (CSD)
            </p>
          </li>
          <li>
            <span className="font-medium">Download files</span>
            <p className="ml-6 text-gray-600">
              Download your .cer (certificate) and .key (private key) files
            </p>
          </li>
          <li>
            <span className="font-medium">Upload here</span>
            <p className="ml-6 text-gray-600">
              Use the form above to upload both files along with your certificate password
            </p>
          </li>
        </ol>
      </div>
    </div>
  )
}
