import { requireAuth } from '@/lib/auth'
import { signOutAction } from '@/lib/auth/actions'

export default async function DashboardPage() {
  const user = await requireAuth()

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center">
              <h1 className="text-xl font-bold text-gray-900">
                SAT Compliance Platform
              </h1>
            </div>
            <div className="flex items-center space-x-4">
              <span className="text-sm text-gray-700">
                {user.fullName}
              </span>
              <form action={signOutAction}>
                <button
                  type="submit"
                  className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700"
                >
                  Sign Out
                </button>
              </form>
            </div>
          </div>
        </div>
      </nav>

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
                        <span className="text-green-600">✓ Verified</span>
                      ) : (
                        <span className="text-yellow-600">⚠ Not verified</span>
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
                  <span className="text-3xl">⚙️</span>
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

            <div className="mt-8 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
              <h4 className="font-semibold text-yellow-800">
                🎉 Authentication Setup Complete!
              </h4>
              <p className="text-sm text-yellow-700 mt-2">
                Your Supabase Auth integration is working correctly. You can now build the rest of your application features.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
