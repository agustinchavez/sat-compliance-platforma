'use client'

import { useActionState, useState } from 'react'
import { uploadCertificateAction, type CertificateFormState } from './actions'

interface CertificateUploadFormProps {
  hasCertificate: boolean
}

const initialState: CertificateFormState = {
  success: false,
  error: null,
  message: null,
}

export function CertificateUploadForm({ hasCertificate }: CertificateUploadFormProps) {
  const [state, formAction, isPending] = useActionState(uploadCertificateAction, initialState)
  const [cerFileName, setCerFileName] = useState<string>('')
  const [keyFileName, setKeyFileName] = useState<string>('')
  const [showPassword, setShowPassword] = useState(false)

  const handleCerChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    setCerFileName(file?.name || '')
  }

  const handleKeyChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    setKeyFileName(file?.name || '')
  }

  return (
    <form action={formAction} className="space-y-6">
      {/* Status Messages */}
      {state.error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex">
            <span className="text-red-500 mr-2">⚠️</span>
            <p className="text-sm text-red-700">{state.error}</p>
          </div>
        </div>
      )}
      {state.message && state.success && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <div className="flex">
            <span className="text-green-500 mr-2">✅</span>
            <div>
              <p className="text-sm text-green-700">{state.message}</p>
              {state.certificateInfo && (
                <p className="text-xs text-green-600 mt-1">
                  Certificate valid until:{' '}
                  {new Date(state.certificateInfo.validTo).toLocaleDateString('es-MX')}
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {hasCertificate && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <div className="flex">
            <span className="text-yellow-500 mr-2">⚠️</span>
            <p className="text-sm text-yellow-700">
              You already have a certificate uploaded. Uploading new files will replace the existing ones.
            </p>
          </div>
        </div>
      )}

      {/* Certificate File (.cer) */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Certificate File (.cer) *
        </label>
        <div className="flex items-center">
          <label className="cursor-pointer flex-1">
            <div className="flex items-center justify-center w-full px-4 py-6 border-2 border-dashed border-gray-300 rounded-lg hover:border-blue-400 hover:bg-blue-50 transition-colors">
              <div className="text-center">
                <span className="text-3xl mb-2 block">📄</span>
                <span className="text-sm text-gray-600">
                  {cerFileName || 'Click to select .cer file'}
                </span>
                {cerFileName && (
                  <span className="text-xs text-green-600 block mt-1">
                    ✓ File selected
                  </span>
                )}
              </div>
            </div>
            <input
              type="file"
              name="cerFile"
              accept=".cer"
              required
              onChange={handleCerChange}
              className="hidden"
            />
          </label>
        </div>
        <p className="mt-1 text-xs text-gray-500">
          Your public certificate file from SAT
        </p>
      </div>

      {/* Private Key File (.key) */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Private Key File (.key) *
        </label>
        <div className="flex items-center">
          <label className="cursor-pointer flex-1">
            <div className="flex items-center justify-center w-full px-4 py-6 border-2 border-dashed border-gray-300 rounded-lg hover:border-blue-400 hover:bg-blue-50 transition-colors">
              <div className="text-center">
                <span className="text-3xl mb-2 block">🔐</span>
                <span className="text-sm text-gray-600">
                  {keyFileName || 'Click to select .key file'}
                </span>
                {keyFileName && (
                  <span className="text-xs text-green-600 block mt-1">
                    ✓ File selected
                  </span>
                )}
              </div>
            </div>
            <input
              type="file"
              name="keyFile"
              accept=".key"
              required
              onChange={handleKeyChange}
              className="hidden"
            />
          </label>
        </div>
        <p className="mt-1 text-xs text-gray-500">
          Your encrypted private key file from SAT
        </p>
      </div>

      {/* Password */}
      <div>
        <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">
          Certificate Password *
        </label>
        <div className="relative">
          <input
            type={showPassword ? 'text' : 'password'}
            id="password"
            name="password"
            required
            className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 pr-10"
            placeholder="Enter the password for your .key file"
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute inset-y-0 right-0 px-3 flex items-center text-gray-500 hover:text-gray-700"
          >
            {showPassword ? '🙈' : '👁️'}
          </button>
        </div>
        <p className="mt-1 text-xs text-gray-500">
          The password you set when generating your CSD at SAT
        </p>
      </div>

      {/* Security Notice */}
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
        <div className="flex">
          <span className="text-xl mr-3">🔒</span>
          <div>
            <h4 className="text-sm font-medium text-gray-900">Security Notice</h4>
            <p className="text-xs text-gray-600 mt-1">
              Your certificates are encrypted using AES-256-GCM before storage.
              The password is never stored in plain text. All certificate operations
              are logged for audit purposes.
            </p>
          </div>
        </div>
      </div>

      {/* Submit Button */}
      <div className="flex justify-end pt-4 border-t border-gray-200">
        <button
          type="submit"
          disabled={isPending || !cerFileName || !keyFileName}
          className="px-6 py-2 bg-blue-600 text-white font-medium rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isPending ? (
            <span className="flex items-center">
              <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              Uploading...
            </span>
          ) : (
            hasCertificate ? 'Replace Certificates' : 'Upload Certificates'
          )}
        </button>
      </div>
    </form>
  )
}
