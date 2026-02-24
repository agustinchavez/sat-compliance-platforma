'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { CustomerForm } from '../customer-form'
import { getSATCatalogs } from '../actions'
import type { TaxRegime, CFDIUse } from '@/lib/customers/types'

export default function NewCustomerPage() {
  const router = useRouter()
  const [catalogs, setCatalogs] = useState<{ taxRegimes: TaxRegime[]; cfdiUses: CFDIUse[] } | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getSATCatalogs().then((data) => {
      setCatalogs(data)
      setLoading(false)
    })
  }, [])

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-500">Loading...</div>
      </div>
    )
  }

  if (!catalogs) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-red-500">Failed to load form data</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-3xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-6">
          <button
            onClick={() => router.back()}
            className="text-sm text-gray-600 hover:text-gray-900 mb-2 flex items-center"
          >
            ← Back to Customers
          </button>
          <h1 className="text-2xl font-bold text-gray-900">New Customer</h1>
          <p className="mt-1 text-sm text-gray-600">
            Add a new customer for CFDI invoicing
          </p>
        </div>

        {/* Form */}
        <CustomerForm
          taxRegimes={catalogs.taxRegimes}
          cfdiUses={catalogs.cfdiUses}
          onCancel={() => router.push('/customers')}
          onSuccess={(customerId) => {
            if (customerId) {
              router.push(`/customers/${customerId}`)
            } else {
              router.push('/customers')
            }
          }}
        />
      </div>
    </div>
  )
}
