'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { deleteCustomerAction } from './actions'
import type { Customer } from '@/lib/customers/types'

interface CustomerListProps {
  customers: Customer[]
  total: number
  page: number
  pages: number
}

export function CustomerList({ customers, total, page, pages }: CustomerListProps) {
  const router = useRouter()
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleDelete = async (customer: Customer) => {
    setDeletingId(customer.id)
    setError(null)

    const result = await deleteCustomerAction(customer.id)

    if (!result.success) {
      setError(result.error || 'Failed to delete customer')
    }

    setDeletingId(null)
  }

  if (customers.length === 0) {
    return (
      <div className="text-center py-12 bg-white rounded-lg shadow">
        <span className="text-5xl mb-4 block">📋</span>
        <h3 className="text-lg font-medium text-gray-900 mb-2">No customers yet</h3>
        <p className="text-gray-500 mb-4">Add your first customer to start creating invoices</p>
      </div>
    )
  }

  return (
    <div className="bg-white shadow rounded-lg overflow-hidden">
      {error && (
        <div className="bg-red-50 border-b border-red-200 p-4">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Customer
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                RFC
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Tax Regime
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                CFDI Use
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Status
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {customers.map((customer) => (
              <tr key={customer.id} className="hover:bg-gray-50">
                <td className="px-6 py-4 whitespace-nowrap">
                  <div>
                    <div className="text-sm font-medium text-gray-900">
                      {customer.legal_name}
                    </div>
                    {customer.business_name && (
                      <div className="text-sm text-gray-500">
                        {customer.business_name}
                      </div>
                    )}
                    {customer.email && (
                      <div className="text-xs text-gray-400 mt-1">
                        {customer.email}
                      </div>
                    )}
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className="font-mono text-sm text-gray-900">{customer.rfc}</span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className="text-sm text-gray-500">{customer.tax_regime}</span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className="text-sm text-gray-500">{customer.cfdi_use}</span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  {customer.is_active ? (
                    <span className="px-2 py-1 text-xs font-medium rounded-full bg-green-100 text-green-800">
                      Active
                    </span>
                  ) : (
                    <span className="px-2 py-1 text-xs font-medium rounded-full bg-gray-100 text-gray-800">
                      Inactive
                    </span>
                  )}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                  <div className="flex justify-end space-x-2">
                    <button
                      onClick={() => router.push(`/customers/${customer.id}`)}
                      className="text-blue-600 hover:text-blue-900"
                    >
                      View
                    </button>
                    <button
                      onClick={() => router.push(`/customers/${customer.id}/edit`)}
                      className="text-gray-600 hover:text-gray-900"
                    >
                      Edit
                    </button>
                    {deletingId === customer.id ? (
                      <span className="text-gray-400">...</span>
                    ) : (
                      <button
                        onClick={() => {
                          if (confirm(`Delete ${customer.legal_name}?`)) {
                            handleDelete(customer)
                          }
                        }}
                        className="text-red-600 hover:text-red-900"
                      >
                        Delete
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {pages > 1 && (
        <div className="bg-white px-4 py-3 border-t border-gray-200 sm:px-6">
          <div className="flex items-center justify-between">
            <div className="text-sm text-gray-700">
              Showing <span className="font-medium">{(page - 1) * 50 + 1}</span> to{' '}
              <span className="font-medium">{Math.min(page * 50, total)}</span> of{' '}
              <span className="font-medium">{total}</span> customers
            </div>
            <div className="flex space-x-2">
              <button
                onClick={() => router.push(`/customers?page=${page - 1}`)}
                disabled={page === 1}
                className="px-3 py-1 border border-gray-300 rounded text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
              >
                Previous
              </button>
              <button
                onClick={() => router.push(`/customers?page=${page + 1}`)}
                disabled={page === pages}
                className="px-3 py-1 border border-gray-300 rounded text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
              >
                Next
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
