'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { ProductForm } from '../product-form'
import { getCategories } from '../actions'

export default function NewProductPage() {
  const router = useRouter()
  const [categories, setCategories] = useState<string[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getCategories().then((data) => {
      setCategories(data)
      setLoading(false)
    }).catch(() => {
      setLoading(false)
    })
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-gray-500">Loading...</div>
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-6">
          <button
            onClick={() => router.back()}
            className="text-sm text-gray-600 hover:text-gray-900 mb-2 flex items-center"
          >
            ← Back to Products
          </button>
          <h1 className="text-2xl font-bold text-gray-900">New Product or Service</h1>
          <p className="mt-1 text-sm text-gray-600">
            Add a new item to your catalog for CFDI invoicing
          </p>
        </div>

        {/* Form */}
        <ProductForm
          categories={categories}
          onCancel={() => router.push('/products')}
          onSuccess={(productId) => {
            if (productId) {
              router.push(`/products/${productId}`)
            } else {
              router.push('/products')
            }
          }}
        />
      </div>
  )
}
