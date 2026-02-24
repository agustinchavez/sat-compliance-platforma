import Link from 'next/link'
import { getCustomersData } from './actions'
import { CustomerList } from './customer-list'

interface PageProps {
  searchParams: Promise<{ page?: string; search?: string }>
}

export default async function CustomersPage({ searchParams }: PageProps) {
  const params = await searchParams
  const page = parseInt(params.page || '1')
  const search = params.search || ''

  const { customers, total, pages } = await getCustomersData({
    page,
    search: search || undefined,
    limit: 50,
  })

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Customers</h1>
            <p className="mt-1 text-sm text-gray-600">
              Manage your customer database for CFDI invoicing
            </p>
          </div>
          <Link
            href="/customers/new"
            className="flex items-center px-4 py-2 bg-blue-600 text-white font-medium rounded-md hover:bg-blue-700 transition-colors"
          >
            <span className="mr-2">+</span>
            Add Customer
          </Link>
        </div>

        {/* Search */}
        <div className="mb-6">
          <form className="flex gap-2">
            <input
              type="text"
              name="search"
              defaultValue={search}
              placeholder="Search by RFC, name, or email..."
              className="flex-1 px-4 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
            <button
              type="submit"
              className="px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 border border-gray-300"
            >
              Search
            </button>
            {search && (
              <Link
                href="/customers"
                className="px-4 py-2 text-gray-600 rounded-md hover:bg-gray-100"
              >
                Clear
              </Link>
            )}
          </form>
        </div>

        {/* Stats Bar */}
        <div className="bg-white rounded-lg shadow p-4 mb-6">
          <div className="flex items-center justify-between">
            <div className="text-sm text-gray-600">
              <span className="font-medium text-gray-900">{total}</span> total customers
              {search && (
                <span className="ml-2">
                  matching &quot;<span className="font-medium">{search}</span>&quot;
                </span>
              )}
            </div>
            <div className="flex space-x-4 text-sm">
              <Link href="/customers?filter=active" className="text-blue-600 hover:text-blue-800">
                Active
              </Link>
              <Link href="/customers?filter=inactive" className="text-gray-600 hover:text-gray-800">
                Inactive
              </Link>
            </div>
          </div>
        </div>

        {/* Customer List */}
        <CustomerList
          customers={customers}
          total={total}
          page={page}
          pages={pages}
        />

        {/* Quick Tips */}
        <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
          <h3 className="text-sm font-medium text-blue-800 mb-2">Tips for CFDI Compliance</h3>
          <ul className="text-sm text-blue-700 space-y-1">
            <li>- Ensure RFC is correctly formatted (12 chars for legal entities, 13 for individuals)</li>
            <li>- Tax regime must match SAT registry for valid invoices</li>
            <li>- CFDI Use code determines how the customer will use the invoice for tax purposes</li>
          </ul>
        </div>
      </div>
    </div>
  )
}
