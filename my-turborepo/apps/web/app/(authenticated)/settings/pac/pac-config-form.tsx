'use client'

import { useActionState, useState } from 'react'
import { configurePACAction, type PACFormState } from './actions'
import type { PACConfig, PACProvider, PACEnvironment } from '@/lib/organizations/types'

interface PACConfigFormProps {
  currentConfig: PACConfig | null
}

const initialState: PACFormState = {
  success: false,
  error: null,
  message: null,
}

const providers: { value: PACProvider; label: string; description: string }[] = [
  { value: 'finkok', label: 'Finkok', description: 'Popular choice with SOAP API' },
  { value: 'sw', label: 'SW (Smarter Web)', description: 'Modern REST API' },
  { value: 'diverza', label: 'Diverza', description: 'Enterprise features' },
  { value: 'facturaxion', label: 'Facturaxion', description: 'User-friendly' },
]

const environments: { value: PACEnvironment; label: string; description: string }[] = [
  { value: 'sandbox', label: 'Sandbox (Testing)', description: 'For development and testing' },
  { value: 'production', label: 'Production', description: 'For real invoices' },
]

export function PACConfigForm({ currentConfig }: PACConfigFormProps) {
  const [state, formAction, isPending] = useActionState(configurePACAction, initialState)
  const [selectedProvider, setSelectedProvider] = useState<PACProvider>(
    currentConfig?.provider || 'finkok'
  )
  const [selectedEnvironment, setSelectedEnvironment] = useState<PACEnvironment>(
    currentConfig?.environment || 'sandbox'
  )
  const [showPassword, setShowPassword] = useState(false)

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
            <p className="text-sm text-green-700">{state.message}</p>
          </div>
        </div>
      )}

      {/* Provider Selection */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-3">
          PAC Provider *
        </label>
        <div className="grid grid-cols-2 gap-3">
          {providers.map((provider) => (
            <label
              key={provider.value}
              className={`
                relative flex items-start p-4 border rounded-lg cursor-pointer
                ${selectedProvider === provider.value
                  ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-200'
                  : 'border-gray-200 hover:border-gray-300'
                }
              `}
            >
              <input
                type="radio"
                name="provider"
                value={provider.value}
                checked={selectedProvider === provider.value}
                onChange={(e) => setSelectedProvider(e.target.value as PACProvider)}
                className="sr-only"
              />
              <div>
                <span className="block text-sm font-medium text-gray-900">
                  {provider.label}
                </span>
                <span className="block text-xs text-gray-500 mt-1">
                  {provider.description}
                </span>
              </div>
              {selectedProvider === provider.value && (
                <span className="absolute top-2 right-2 text-blue-500">✓</span>
              )}
            </label>
          ))}
        </div>
      </div>

      {/* Environment Selection */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-3">
          Environment *
        </label>
        <div className="grid grid-cols-2 gap-3">
          {environments.map((env) => (
            <label
              key={env.value}
              className={`
                relative flex items-start p-4 border rounded-lg cursor-pointer
                ${selectedEnvironment === env.value
                  ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-200'
                  : 'border-gray-200 hover:border-gray-300'
                }
              `}
            >
              <input
                type="radio"
                name="environment"
                value={env.value}
                checked={selectedEnvironment === env.value}
                onChange={(e) => setSelectedEnvironment(e.target.value as PACEnvironment)}
                className="sr-only"
              />
              <div>
                <span className="block text-sm font-medium text-gray-900">
                  {env.label}
                </span>
                <span className="block text-xs text-gray-500 mt-1">
                  {env.description}
                </span>
              </div>
              {selectedEnvironment === env.value && (
                <span className="absolute top-2 right-2 text-blue-500">✓</span>
              )}
            </label>
          ))}
        </div>
        {selectedEnvironment === 'sandbox' && (
          <p className="mt-2 text-xs text-yellow-600 bg-yellow-50 p-2 rounded">
            ⚠️ Sandbox mode is for testing only. Invoices generated will not be valid for SAT.
          </p>
        )}
      </div>

      {/* Credentials */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label htmlFor="username" className="block text-sm font-medium text-gray-700 mb-1">
            Username / API Key *
          </label>
          <input
            type="text"
            id="username"
            name="username"
            defaultValue={currentConfig?.credentials.username || ''}
            required
            className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            placeholder="Enter your PAC username or API key"
          />
        </div>
        <div>
          <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
            Password / API Secret *
          </label>
          <div className="relative">
            <input
              type={showPassword ? 'text' : 'password'}
              id="password"
              name="password"
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 pr-10"
              placeholder="Enter your PAC password or API secret"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute inset-y-0 right-0 px-3 flex items-center text-gray-500 hover:text-gray-700"
            >
              {showPassword ? '🙈' : '👁️'}
            </button>
          </div>
          {currentConfig && (
            <p className="mt-1 text-xs text-gray-500">
              Leave empty to keep the current password
            </p>
          )}
        </div>
      </div>

      {/* Security Notice */}
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
        <div className="flex">
          <span className="text-xl mr-3">🔒</span>
          <div>
            <h4 className="text-sm font-medium text-gray-900">Security Notice</h4>
            <p className="text-xs text-gray-600 mt-1">
              Your PAC credentials are encrypted using AES-256-GCM before storage.
              They are only decrypted when generating invoices.
            </p>
          </div>
        </div>
      </div>

      {/* Submit Button */}
      <div className="flex justify-end pt-4 border-t border-gray-200">
        <button
          type="submit"
          disabled={isPending}
          className="px-6 py-2 bg-blue-600 text-white font-medium rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isPending ? (
            <span className="flex items-center">
              <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              Saving...
            </span>
          ) : (
            currentConfig ? 'Update Configuration' : 'Save Configuration'
          )}
        </button>
      </div>
    </form>
  )
}
