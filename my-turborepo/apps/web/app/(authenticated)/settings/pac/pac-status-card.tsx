'use client'

import { useState } from 'react'
import { testPACConnectionAction, removePACAction } from './actions'
import type { PACConfig, PACConnectionTestResult } from '@/lib/organizations/types'

interface PACStatusCardProps {
  config: PACConfig
}

const providerNames: Record<string, string> = {
  finkok: 'Finkok',
  sw: 'SW (Smarter Web)',
  diverza: 'Diverza',
  facturaxion: 'Facturaxion',
}

export function PACStatusCard({ config }: PACStatusCardProps) {
  const [isTesting, setIsTesting] = useState(false)
  const [testResult, setTestResult] = useState<PACConnectionTestResult | null>(null)
  const [isRemoving, setIsRemoving] = useState(false)
  const [showRemoveConfirm, setShowRemoveConfirm] = useState(false)

  const handleTest = async () => {
    setIsTesting(true)
    setTestResult(null)
    try {
      const result = await testPACConnectionAction()
      setTestResult(result)
    } catch (error) {
      setTestResult({
        success: false,
        provider: config.provider,
        environment: config.environment,
        message: 'Test failed',
        timestamp: new Date(),
        error: error instanceof Error ? error.message : 'Unknown error',
      })
    }
    setIsTesting(false)
  }

  const handleRemove = async () => {
    setIsRemoving(true)
    try {
      await removePACAction()
      window.location.reload()
    } catch (error) {
      console.error('Error removing PAC:', error)
      setIsRemoving(false)
    }
  }

  const getStatusColor = () => {
    if (config.lastTestResult === 'success') return 'green'
    if (config.lastTestResult === 'failed') return 'red'
    return 'yellow'
  }

  const color = getStatusColor()
  const bgColor = color === 'green' ? 'bg-green-50' : color === 'red' ? 'bg-red-50' : 'bg-yellow-50'
  const borderColor = color === 'green' ? 'border-green-200' : color === 'red' ? 'border-red-200' : 'border-yellow-200'
  const textColor = color === 'green' ? 'text-green-800' : color === 'red' ? 'text-red-800' : 'text-yellow-800'

  return (
    <div className={`${bgColor} ${borderColor} border rounded-lg p-6`}>
      <div className="flex items-start justify-between">
        <div className="flex items-start">
          <span className="text-3xl mr-4">
            {color === 'green' ? '✅' : color === 'red' ? '❌' : '⚠️'}
          </span>
          <div>
            <h3 className={`text-lg font-semibold ${textColor}`}>
              PAC: {providerNames[config.provider] || config.provider}
            </h3>
            <p className={`text-sm ${textColor} opacity-80 mt-1`}>
              Environment: {config.environment === 'production' ? 'Production' : 'Sandbox (Testing)'}
            </p>
            {config.lastTested && (
              <p className="text-xs text-gray-500 mt-1">
                Last tested: {new Date(config.lastTested).toLocaleString('es-MX')}
              </p>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex space-x-2">
          <button
            onClick={handleTest}
            disabled={isTesting}
            className="text-sm bg-white text-gray-700 hover:bg-gray-100 px-3 py-1 rounded border border-gray-300 disabled:opacity-50"
          >
            {isTesting ? 'Testing...' : 'Test Connection'}
          </button>
          {!showRemoveConfirm ? (
            <button
              onClick={() => setShowRemoveConfirm(true)}
              className="text-sm text-gray-500 hover:text-red-600 px-3 py-1 rounded border border-gray-300 hover:border-red-300"
            >
              Remove
            </button>
          ) : (
            <>
              <button
                onClick={handleRemove}
                disabled={isRemoving}
                className="text-sm text-white bg-red-600 hover:bg-red-700 px-3 py-1 rounded disabled:opacity-50"
              >
                {isRemoving ? 'Removing...' : 'Confirm'}
              </button>
              <button
                onClick={() => setShowRemoveConfirm(false)}
                className="text-sm text-gray-500 hover:text-gray-700 px-3 py-1 rounded border border-gray-300"
              >
                Cancel
              </button>
            </>
          )}
        </div>
      </div>

      {/* Test Result */}
      {testResult && (
        <div className={`mt-4 p-3 rounded-lg ${testResult.success ? 'bg-green-100' : 'bg-red-100'}`}>
          <div className="flex items-center">
            <span className="mr-2">{testResult.success ? '✅' : '❌'}</span>
            <span className={`text-sm ${testResult.success ? 'text-green-800' : 'text-red-800'}`}>
              {testResult.message}
            </span>
          </div>
          {testResult.error && (
            <p className="text-xs text-red-600 mt-1 ml-6">{testResult.error}</p>
          )}
        </div>
      )}

      {/* Connection Info */}
      <div className="mt-4 grid grid-cols-2 gap-4">
        <div>
          <p className="text-xs text-gray-500 uppercase tracking-wider">Status</p>
          <p className="text-sm mt-1">
            {config.isActive ? (
              <span className="text-green-600 font-medium">Active</span>
            ) : (
              <span className="text-gray-500">Inactive</span>
            )}
          </p>
        </div>
        <div>
          <p className="text-xs text-gray-500 uppercase tracking-wider">Credentials</p>
          <p className="text-sm mt-1 font-mono">
            {config.credentials.username.slice(0, 3)}***
          </p>
        </div>
      </div>
    </div>
  )
}
