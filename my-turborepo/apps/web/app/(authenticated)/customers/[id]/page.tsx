import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getCustomerById } from '../actions'

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function CustomerDetailPage({ params }: PageProps) {
  const { id } = await params
  const customer = await getCustomerById(id)

  if (!customer) {
    notFound()
  }

  return (
    <div className="max-w-4xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <Link
              href="/customers"
              className="text-sm text-gray-600 hover:text-gray-900 mb-2 flex items-center"
            >
              ← Back to Customers
            </Link>
            <h1 className="text-2xl font-bold text-gray-900">{customer.legal_name}</h1>
            {customer.business_name && (
              <p className="text-gray-600">{customer.business_name}</p>
            )}
          </div>
          <div className="flex space-x-3">
            <Link
              href={`/customers/${id}/edit`}
              className="px-4 py-2 bg-white text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50"
            >
              Edit
            </Link>
            <Link
              href={`/invoices/new?customer=${id}`}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
            >
              Create Invoice
            </Link>
          </div>
        </div>

        {/* Status Badge */}
        <div className="mb-6">
          {customer.is_active ? (
            <span className="px-3 py-1 text-sm font-medium rounded-full bg-green-100 text-green-800">
              Active
            </span>
          ) : (
            <span className="px-3 py-1 text-sm font-medium rounded-full bg-gray-100 text-gray-800">
              Inactive
            </span>
          )}
          {customer.sat_validated && (
            <span className="ml-2 px-3 py-1 text-sm font-medium rounded-full bg-blue-100 text-blue-800">
              SAT Verified
            </span>
          )}
        </div>

        {/* Main Content */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Fiscal Information */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Fiscal Information</h2>
            <dl className="space-y-3">
              <div>
                <dt className="text-sm text-gray-500">RFC</dt>
                <dd className="text-sm font-mono font-medium text-gray-900">{customer.rfc}</dd>
              </div>
              <div>
                <dt className="text-sm text-gray-500">Régimen Fiscal</dt>
                <dd className="text-sm font-medium text-gray-900">{customer.tax_regime}</dd>
              </div>
              <div>
                <dt className="text-sm text-gray-500">Uso de CFDI</dt>
                <dd className="text-sm font-medium text-gray-900">{customer.cfdi_use}</dd>
              </div>
            </dl>
          </div>

          {/* Contact Information */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Contact Information</h2>
            <dl className="space-y-3">
              {customer.email && (
                <div>
                  <dt className="text-sm text-gray-500">Email</dt>
                  <dd className="text-sm font-medium text-gray-900">
                    <a href={`mailto:${customer.email}`} className="text-blue-600 hover:text-blue-800">
                      {customer.email}
                    </a>
                  </dd>
                </div>
              )}
              {customer.phone && (
                <div>
                  <dt className="text-sm text-gray-500">Phone</dt>
                  <dd className="text-sm font-medium text-gray-900">
                    <a href={`tel:${customer.phone}`} className="text-blue-600 hover:text-blue-800">
                      {customer.phone}
                    </a>
                  </dd>
                </div>
              )}
              {!customer.email && !customer.phone && (
                <p className="text-sm text-gray-500">No contact information</p>
              )}
            </dl>
          </div>

          {/* Address */}
          {customer.address && (
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Address</h2>
              <address className="text-sm text-gray-700 not-italic">
                {customer.address.street} {customer.address.exterior_number}
                {customer.address.interior_number && ` Int. ${customer.address.interior_number}`}
                <br />
                {customer.address.colony}
                <br />
                {customer.address.city}, {customer.address.state} {customer.address.postal_code}
                <br />
                {customer.address.country}
              </address>
            </div>
          )}

          {/* Additional Info */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Additional Info</h2>
            <dl className="space-y-3">
              {customer.tags && customer.tags.length > 0 && (
                <div>
                  <dt className="text-sm text-gray-500 mb-2">Tags</dt>
                  <dd className="flex flex-wrap gap-1">
                    {customer.tags.map((tag) => (
                      <span
                        key={tag}
                        className="px-2 py-1 text-xs bg-gray-100 text-gray-700 rounded"
                      >
                        {tag}
                      </span>
                    ))}
                  </dd>
                </div>
              )}
              {customer.notes && (
                <div>
                  <dt className="text-sm text-gray-500">Notes</dt>
                  <dd className="text-sm text-gray-700 mt-1">{customer.notes}</dd>
                </div>
              )}
              <div>
                <dt className="text-sm text-gray-500">Created</dt>
                <dd className="text-sm text-gray-700">
                  {new Date(customer.created_at).toLocaleDateString('es-MX', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                  })}
                </dd>
              </div>
            </dl>
          </div>
        </div>

        {/* Invoices Section (Phase 2) */}
        <div className="mt-6 bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Invoices</h2>
            <Link
              href={`/invoices/new?customer=${id}`}
              className="text-sm text-blue-600 hover:text-blue-800"
            >
              + Create Invoice
            </Link>
          </div>
          <div className="text-center py-8 text-gray-500">
            <span className="text-3xl mb-2 block">📄</span>
            <p>No invoices yet</p>
            <p className="text-sm">Invoice history will appear here once you create invoices for this customer</p>
          </div>
        </div>
      </div>
  )
}
