import Link from 'next/link'
import { getProductsData } from './actions'
import { ProductList } from './product-list'

interface PageProps {
  searchParams: Promise<{ page?: string; search?: string; type?: string }>
}

export default async function ProductsPage({ searchParams }: PageProps) {
  const params = await searchParams
  const page = parseInt(params.page || '1')
  const search = params.search || ''
  const typeFilter = params.type as 'product' | 'service' | undefined

  const { products, total, pages } = await getProductsData({
    page,
    search: search || undefined,
    filters: typeFilter ? { type: typeFilter } : undefined,
    limit: 50,
  })

  const productCount = products.filter(p => p.type === 'product').length
  const serviceCount = products.filter(p => p.type === 'service').length

  return (
    <div className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Products & Services</h1>
            <p className="mt-1 text-sm text-gray-600">
              Manage your product and service catalog for CFDI invoicing
            </p>
          </div>
          <Link
            href="/products/new"
            className="flex items-center px-4 py-2 bg-blue-600 text-white font-medium rounded-md hover:bg-blue-700 transition-colors"
          >
            <span className="mr-2">+</span>
            Add Product/Service
          </Link>
        </div>

        {/* Search and Filters */}
        <div className="mb-6 flex flex-col sm:flex-row gap-4">
          <form className="flex-1 flex gap-2">
            <input
              type="text"
              name="search"
              defaultValue={search}
              placeholder="Search by name, SKU, or SAT code..."
              className="flex-1 px-4 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
            <button
              type="submit"
              className="px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 border border-gray-300"
            >
              Search
            </button>
            {(search || typeFilter) && (
              <Link
                href="/products"
                className="px-4 py-2 text-gray-600 rounded-md hover:bg-gray-100"
              >
                Clear
              </Link>
            )}
          </form>

          {/* Type Filter */}
          <div className="flex space-x-2">
            <Link
              href="/products"
              className={`px-4 py-2 rounded-md text-sm font-medium ${
                !typeFilter
                  ? 'bg-blue-100 text-blue-700'
                  : 'bg-white text-gray-600 border border-gray-300 hover:bg-gray-50'
              }`}
            >
              All
            </Link>
            <Link
              href="/products?type=product"
              className={`px-4 py-2 rounded-md text-sm font-medium ${
                typeFilter === 'product'
                  ? 'bg-blue-100 text-blue-700'
                  : 'bg-white text-gray-600 border border-gray-300 hover:bg-gray-50'
              }`}
            >
              Products
            </Link>
            <Link
              href="/products?type=service"
              className={`px-4 py-2 rounded-md text-sm font-medium ${
                typeFilter === 'service'
                  ? 'bg-purple-100 text-purple-700'
                  : 'bg-white text-gray-600 border border-gray-300 hover:bg-gray-50'
              }`}
            >
              Services
            </Link>
          </div>
        </div>

        {/* Stats Bar */}
        <div className="bg-white rounded-lg shadow p-4 mb-6">
          <div className="flex items-center justify-between">
            <div className="text-sm text-gray-600">
              <span className="font-medium text-gray-900">{total}</span> items
              {search && (
                <span className="ml-2">
                  matching &quot;<span className="font-medium">{search}</span>&quot;
                </span>
              )}
            </div>
            <div className="flex space-x-4 text-sm">
              <span className="flex items-center">
                <span className="w-3 h-3 bg-blue-500 rounded mr-2"></span>
                {productCount} Products
              </span>
              <span className="flex items-center">
                <span className="w-3 h-3 bg-purple-500 rounded mr-2"></span>
                {serviceCount} Services
              </span>
            </div>
          </div>
        </div>

        {/* Product List */}
        <ProductList
          products={products}
          total={total}
          page={page}
          pages={pages}
        />

        {/* SAT Code Help */}
        <div className="mt-6 bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <h3 className="text-sm font-medium text-yellow-800 mb-2">About SAT Codes</h3>
          <ul className="text-sm text-yellow-700 space-y-1">
            <li>- <strong>ClaveProdServ</strong>: 8-digit code from SAT catalog identifying the product/service type</li>
            <li>- <strong>ClaveUnidad</strong>: Code identifying the unit of measure (H87=Pieza, E48=Servicio, HUR=Hora)</li>
            <li>- Use code <strong>01010101</strong> when your product doesn&apos;t match any SAT catalog entry</li>
            <li>- Search the full catalog at <a href="http://pys.sat.gob.mx/PyS/catPyS.aspx" target="_blank" rel="noopener noreferrer" className="underline">SAT Product Catalog</a></li>
          </ul>
        </div>
      </div>
  )
}
