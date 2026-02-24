'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { deleteProductAction } from './actions'
import type { Product } from '@/lib/products/types'

interface ProductListProps {
  products: Product[]
  total: number
  page: number
  pages: number
}

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN',
  }).format(amount)
}

export function ProductList({ products, total, page, pages }: ProductListProps) {
  const router = useRouter()
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleDelete = async (product: Product) => {
    setDeletingId(product.id)
    setError(null)

    const result = await deleteProductAction(product.id)

    if (!result.success) {
      setError(result.error || 'Failed to delete product')
    }

    setDeletingId(null)
  }

  if (products.length === 0) {
    return (
      <div className="text-center py-12 bg-white rounded-lg shadow">
        <span className="text-5xl mb-4 block">📦</span>
        <h3 className="text-lg font-medium text-gray-900 mb-2">No products yet</h3>
        <p className="text-gray-500 mb-4">Add your first product or service to start creating invoices</p>
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
                Product/Service
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                SKU
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                SAT Code
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Price
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Stock
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
            {products.map((product) => (
              <tr key={product.id} className="hover:bg-gray-50">
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="flex items-center">
                    <div className={`
                      w-8 h-8 rounded flex items-center justify-center text-white text-sm font-medium mr-3
                      ${product.type === 'product' ? 'bg-blue-500' : 'bg-purple-500'}
                    `}>
                      {product.type === 'product' ? 'P' : 'S'}
                    </div>
                    <div>
                      <div className="text-sm font-medium text-gray-900">
                        {product.name}
                      </div>
                      {product.description && (
                        <div className="text-sm text-gray-500 truncate max-w-xs">
                          {product.description}
                        </div>
                      )}
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className="font-mono text-sm text-gray-900">{product.sku}</span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className="text-sm text-gray-500">{product.sat_product_code}</span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className="text-sm font-medium text-gray-900">
                    {formatCurrency(product.price)}
                  </span>
                  {product.iva_rate > 0 && (
                    <span className="text-xs text-gray-500 ml-1">
                      +{(product.iva_rate * 100).toFixed(0)}% IVA
                    </span>
                  )}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  {product.track_inventory ? (
                    <div>
                      <span className={`text-sm font-medium ${
                        product.current_stock <= (product.min_stock || 0)
                          ? 'text-red-600'
                          : 'text-gray-900'
                      }`}>
                        {product.current_stock}
                      </span>
                      <span className="text-xs text-gray-500 ml-1">{product.unit_name}</span>
                    </div>
                  ) : (
                    <span className="text-sm text-gray-400">N/A</span>
                  )}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  {product.is_active ? (
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
                      onClick={() => router.push(`/products/${product.id}`)}
                      className="text-blue-600 hover:text-blue-900"
                    >
                      View
                    </button>
                    <button
                      onClick={() => router.push(`/products/${product.id}/edit`)}
                      className="text-gray-600 hover:text-gray-900"
                    >
                      Edit
                    </button>
                    {deletingId === product.id ? (
                      <span className="text-gray-400">...</span>
                    ) : (
                      <button
                        onClick={() => {
                          if (confirm(`Delete ${product.name}?`)) {
                            handleDelete(product)
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
              <span className="font-medium">{total}</span> products
            </div>
            <div className="flex space-x-2">
              <button
                onClick={() => router.push(`/products?page=${page - 1}`)}
                disabled={page === 1}
                className="px-3 py-1 border border-gray-300 rounded text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
              >
                Previous
              </button>
              <button
                onClick={() => router.push(`/products?page=${page + 1}`)}
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
