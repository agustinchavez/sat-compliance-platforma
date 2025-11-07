'use client'

import { useState } from 'react'
import { testPermission } from '../actions'
import { RESOURCES, CRUD_ACTIONS, SPECIAL_ACTIONS } from '@/lib/rbac/types'

export function PermissionTesterClient() {
  const [resource, setResource] = useState('invoice')
  const [action, setAction] = useState('create')
  const [result, setResult] = useState<any>(null)
  const [loading, setLoading] = useState(false)

  const handleTest = async () => {
    setLoading(true)
    setResult(null)

    const testResult = await testPermission(resource, action)

    setResult(testResult)
    setLoading(false)
  }

  return (
    <div className="space-y-4">
      {/* Input Form */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Resource
          </label>
          <select
            value={resource}
            onChange={(e) => setResource(e.target.value)}
            className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
          >
            {RESOURCES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Action
          </label>
          <select
            value={action}
            onChange={(e) => setAction(e.target.value)}
            className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
          >
            <optgroup label="CRUD Actions">
              {CRUD_ACTIONS.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </optgroup>
            <optgroup label="Special Actions">
              {SPECIAL_ACTIONS.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </optgroup>
          </select>
        </div>

        <div className="flex items-end">
          <button
            onClick={handleTest}
            disabled={loading}
            className="w-full px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? 'Testing...' : 'Test Permission'}
          </button>
        </div>
      </div>

      {/* Result */}
      {result && (
        <div
          className={`p-4 rounded-lg ${
            result.allowed
              ? 'bg-green-50 border border-green-200'
              : 'bg-red-50 border border-red-200'
          }`}
        >
          <div className="flex items-center mb-3">
            <span className="text-2xl mr-3">{result.allowed ? '✅' : '❌'}</span>
            <h3 className="text-lg font-semibold">
              {result.allowed ? 'Permission Granted' : 'Permission Denied'}
            </h3>
          </div>

          <div className="space-y-2 text-sm">
            <div className="flex">
              <span className="font-medium w-24">Resource:</span>
              <span className="capitalize">{resource}</span>
            </div>
            <div className="flex">
              <span className="font-medium w-24">Action:</span>
              <span className="capitalize">{action}</span>
            </div>
            <div className="flex">
              <span className="font-medium w-24">Your Role:</span>
              <span className="capitalize">{result.role}</span>
            </div>
            {result.reason && (
              <div className="flex">
                <span className="font-medium w-24">Reason:</span>
                <span>{result.reason}</span>
              </div>
            )}
          </div>

          {/* Code Example */}
          <div className="mt-4 p-3 bg-white rounded border">
            <p className="text-xs text-gray-600 mb-2">Code that ran:</p>
            <pre className="text-xs font-mono">
              {`await checkPermission(userId, '${resource}', '${action}')\n// Returns: ${result.allowed}`}
            </pre>
          </div>
        </div>
      )}

      {/* Quick Test Buttons */}
      <div className="border-t pt-4">
        <h3 className="text-sm font-medium text-gray-700 mb-3">Quick Tests:</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {[
            { resource: 'invoice', action: 'create', label: 'Create Invoice' },
            { resource: 'invoice', action: 'delete', label: 'Delete Invoice' },
            { resource: 'customer', action: 'update', label: 'Update Customer' },
            { resource: 'user', action: 'invite', label: 'Invite User' },
            { resource: 'organization', action: 'update', label: 'Update Org' },
            { resource: 'expense', action: 'approve', label: 'Approve Expense' },
            { resource: 'report', action: 'export', label: 'Export Report' },
            { resource: 'settings', action: 'update', label: 'Update Settings' },
          ].map((test) => (
            <button
              key={`${test.resource}-${test.action}`}
              onClick={() => {
                setResource(test.resource)
                setAction(test.action)
                setTimeout(() => handleTest(), 100)
              }}
              className="px-3 py-2 text-sm bg-gray-100 hover:bg-gray-200 rounded"
            >
              {test.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
