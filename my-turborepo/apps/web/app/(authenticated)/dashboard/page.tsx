import { requireAuth } from '@/lib/auth'

export default async function DashboardPage() {
  const user = await requireAuth()

  return (
    <div className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
      <div className="px-4 py-6 sm:px-0">
        <div className="bg-white shadow rounded-lg p-6">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">
            Welcome, {user.fullName}!
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
            <div className="bg-blue-50 p-4 rounded-lg">
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                User Information
              </h3>
              <dl className="space-y-2 text-sm">
                <div>
                  <dt className="text-gray-600">Email:</dt>
                  <dd className="font-medium">{user.email}</dd>
                </div>
                <div>
                  <dt className="text-gray-600">Role:</dt>
                  <dd className="font-medium capitalize">{user.role}</dd>
                </div>
                <div>
                  <dt className="text-gray-600">Email Verified:</dt>
                  <dd className="font-medium">
                    {user.emailVerified ? (
                      <span className="text-green-600">Verified</span>
                    ) : (
                      <span className="text-yellow-600">Not verified</span>
                    )}
                  </dd>
                </div>
              </dl>
            </div>

            <div className="bg-green-50 p-4 rounded-lg">
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                Organization
              </h3>
              <dl className="space-y-2 text-sm">
                <div>
                  <dt className="text-gray-600">Name:</dt>
                  <dd className="font-medium">{user.organization.name}</dd>
                </div>
                <div>
                  <dt className="text-gray-600">RFC:</dt>
                  <dd className="font-medium">{user.organization.rfc}</dd>
                </div>
                <div>
                  <dt className="text-gray-600">Plan:</dt>
                  <dd className="font-medium capitalize">{user.organization.plan}</dd>
                </div>
              </dl>
            </div>
          </div>

          <div className="mt-8">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              Quick Actions
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <a
                href="/invoices/new"
                className="block p-4 bg-white border border-gray-200 rounded-lg hover:shadow-md transition-shadow"
              >
                <h4 className="font-semibold text-gray-900">Create Invoice</h4>
                <p className="text-sm text-gray-600 mt-1">
                  Generate a new CFDI invoice
                </p>
              </a>
              <a
                href="/customers"
                className="block p-4 bg-white border border-gray-200 rounded-lg hover:shadow-md transition-shadow"
              >
                <h4 className="font-semibold text-gray-900">Customers</h4>
                <p className="text-sm text-gray-600 mt-1">
                  Manage your customer list
                </p>
              </a>
              <a
                href="/products"
                className="block p-4 bg-white border border-gray-200 rounded-lg hover:shadow-md transition-shadow"
              >
                <h4 className="font-semibold text-gray-900">Products</h4>
                <p className="text-sm text-gray-600 mt-1">
                  Manage your product catalog
                </p>
              </a>
              <a
                href="/settings"
                className="block p-4 bg-white border border-gray-200 rounded-lg hover:shadow-md transition-shadow"
              >
                <h4 className="font-semibold text-gray-900">Settings</h4>
                <p className="text-sm text-gray-600 mt-1">
                  Organization & certificates
                </p>
              </a>
            </div>
          </div>

          {/* Admin Section - Only for Owners and Admins */}
          {(user.role === 'owner' || user.role === 'admin') && (
            <div className="mt-8 p-6 bg-purple-50 border border-purple-200 rounded-lg">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-purple-900 mb-2">
                    Admin Tools
                  </h3>
                  <p className="text-sm text-purple-700 mb-4">
                    Manage users, monitor cache, and test the RBAC system
                  </p>
                </div>
              </div>
              <a
                href="/admin"
                className="inline-flex items-center px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 transition-colors"
              >
                Go to Admin Dashboard
                <span className="ml-2">→</span>
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
