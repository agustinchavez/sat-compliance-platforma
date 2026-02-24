import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getProductById } from '../actions'

interface PageProps {
  params: Promise<{ id: string }>
}

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN',
  }).format(amount)
}

export default async function ProductDetailPage({ params }: PageProps) {
  const { id } = await params
  const product = await getProductById(id)

  if (!product) {
    notFound()
  }

  const priceWithTax = product.price * (1 + product.iva_rate)

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <Link
              href="/products"
              className="text-sm text-gray-600 hover:text-gray-900 mb-2 flex items-center"
            >
              ← Back to Products
            </Link>
            <div className="flex items-center">
              <div className={`
                w-10 h-10 rounded flex items-center justify-center text-white text-lg font-medium mr-3
                ${product.type === 'product' ? 'bg-blue-500' : 'bg-purple-500'}
              `}>
                {product.type === 'product' ? 'P' : 'S'}
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">{product.name}</h1>
                <span className="text-sm text-gray-500 font-mono">{product.sku}</span>
              </div>
            </div>
          </div>
          <div className="flex space-x-3">
            <Link
              href={`/products/${id}/edit`}
              className="px-4 py-2 bg-white text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50"
            >
              Edit
            </Link>
            <Link
              href={`/invoices/new?product=${id}`}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
            >
              Add to Invoice
            </Link>
          </div>
        </div>

        {/* Status Badges */}
        <div className="mb-6 flex space-x-2">
          <span className={`px-3 py-1 text-sm font-medium rounded-full ${
            product.type === 'product' ? 'bg-blue-100 text-blue-800' : 'bg-purple-100 text-purple-800'
          }`}>
            {product.type === 'product' ? 'Product' : 'Service'}
          </span>
          {product.is_active ? (
            <span className="px-3 py-1 text-sm font-medium rounded-full bg-green-100 text-green-800">
              Active
            </span>
          ) : (
            <span className="px-3 py-1 text-sm font-medium rounded-full bg-gray-100 text-gray-800">
              Inactive
            </span>
          )}
          {product.track_inventory && product.current_stock <= (product.min_stock || 0) && (
            <span className="px-3 py-1 text-sm font-medium rounded-full bg-red-100 text-red-800">
              Low Stock
            </span>
          )}
        </div>

        {/* Main Content */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Pricing */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Pricing</h2>
            <dl className="space-y-3">
              <div className="flex justify-between">
                <dt className="text-sm text-gray-500">Base Price</dt>
                <dd className="text-lg font-bold text-gray-900">{formatCurrency(product.price)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-sm text-gray-500">IVA ({(product.iva_rate * 100).toFixed(0)}%)</dt>
                <dd className="text-sm text-gray-700">{formatCurrency(product.price * product.iva_rate)}</dd>
              </div>
              <div className="flex justify-between pt-2 border-t">
                <dt className="text-sm font-medium text-gray-700">Total with IVA</dt>
                <dd className="text-lg font-bold text-blue-600">{formatCurrency(priceWithTax)}</dd>
              </div>
              {(product.iva_retention || product.isr_retention) && (
                <div className="pt-2 border-t">
                  <dt className="text-sm text-gray-500 mb-2">Retentions (when applicable)</dt>
                  {product.iva_retention && (
                    <dd className="text-sm text-red-600">
                      - IVA Ret: {formatCurrency(product.price * (product.iva_retention_rate || 0.1067))}
                    </dd>
                  )}
                  {product.isr_retention && (
                    <dd className="text-sm text-red-600">
                      - ISR Ret: {formatCurrency(product.price * (product.isr_retention_rate || 0.10))}
                    </dd>
                  )}
                </div>
              )}
            </dl>
          </div>

          {/* SAT Information */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">SAT Information</h2>
            <dl className="space-y-3">
              <div>
                <dt className="text-sm text-gray-500">ClaveProdServ</dt>
                <dd className="text-sm font-mono font-medium text-gray-900">{product.sat_product_code}</dd>
                {product.sat_product_name && (
                  <dd className="text-xs text-gray-500">{product.sat_product_name}</dd>
                )}
              </div>
              <div>
                <dt className="text-sm text-gray-500">ClaveUnidad</dt>
                <dd className="text-sm font-mono font-medium text-gray-900">{product.sat_unit_code}</dd>
                {product.sat_unit_name && (
                  <dd className="text-xs text-gray-500">{product.sat_unit_name}</dd>
                )}
              </div>
              <div>
                <dt className="text-sm text-gray-500">Unit Name</dt>
                <dd className="text-sm font-medium text-gray-900">{product.unit_name}</dd>
              </div>
              <div>
                <dt className="text-sm text-gray-500">Tax Object</dt>
                <dd className="text-sm font-medium text-gray-900">
                  {product.tax_object === '01' && '01 - No objeto de impuesto'}
                  {product.tax_object === '02' && '02 - Sí objeto de impuesto'}
                  {product.tax_object === '03' && '03 - Sí objeto, no desglose'}
                </dd>
              </div>
            </dl>
          </div>

          {/* Description */}
          {product.description && (
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Description</h2>
              <p className="text-sm text-gray-700 whitespace-pre-wrap">{product.description}</p>
            </div>
          )}

          {/* Inventory */}
          {product.track_inventory && (
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Inventory</h2>
              <dl className="space-y-3">
                <div className="flex justify-between items-center">
                  <dt className="text-sm text-gray-500">Current Stock</dt>
                  <dd className={`text-2xl font-bold ${
                    product.current_stock <= (product.min_stock || 0)
                      ? 'text-red-600'
                      : 'text-gray-900'
                  }`}>
                    {product.current_stock}
                    <span className="text-sm font-normal text-gray-500 ml-1">{product.unit_name}</span>
                  </dd>
                </div>
                {product.min_stock !== undefined && (
                  <div className="flex justify-between">
                    <dt className="text-sm text-gray-500">Min Stock (Alert)</dt>
                    <dd className="text-sm text-gray-700">{product.min_stock} {product.unit_name}</dd>
                  </div>
                )}
                {product.max_stock !== undefined && (
                  <div className="flex justify-between">
                    <dt className="text-sm text-gray-500">Max Stock</dt>
                    <dd className="text-sm text-gray-700">{product.max_stock} {product.unit_name}</dd>
                  </div>
                )}
              </dl>
            </div>
          )}

          {/* Additional Info */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Additional Info</h2>
            <dl className="space-y-3">
              {product.barcode && (
                <div>
                  <dt className="text-sm text-gray-500">Barcode</dt>
                  <dd className="text-sm font-mono text-gray-900">{product.barcode}</dd>
                </div>
              )}
              {product.category && (
                <div>
                  <dt className="text-sm text-gray-500">Category</dt>
                  <dd className="text-sm text-gray-900">{product.category}</dd>
                </div>
              )}
              {product.tags && product.tags.length > 0 && (
                <div>
                  <dt className="text-sm text-gray-500 mb-2">Tags</dt>
                  <dd className="flex flex-wrap gap-1">
                    {product.tags.map((tag) => (
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
              <div>
                <dt className="text-sm text-gray-500">Created</dt>
                <dd className="text-sm text-gray-700">
                  {new Date(product.created_at).toLocaleDateString('es-MX', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                  })}
                </dd>
              </div>
              <div>
                <dt className="text-sm text-gray-500">Last Updated</dt>
                <dd className="text-sm text-gray-700">
                  {new Date(product.updated_at).toLocaleDateString('es-MX', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                  })}
                </dd>
              </div>
            </dl>
          </div>
        </div>
      </div>
    </div>
  )
}
