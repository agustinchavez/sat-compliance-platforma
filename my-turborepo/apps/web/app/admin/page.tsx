import { requireAdminOrOwner } from '@/lib/rbac'
import Link from 'next/link'
import { getOrganizationUsers, getOrganizationCacheStats } from './actions'

export default async function AdminDashboardPage() {
  // Protect page
  const currentUser = await requireAdminOrOwner()

  // Fetch data for overview
  const users = await getOrganizationUsers()
  const cacheStats = await getOrganizationCacheStats()

  // Calculate stats
  const totalUsers = users.length
  const activeUsers = users.filter((u) => u.email_verified).length
  const cachedUsers = cacheStats.filter((s) => s.cached).length
  const cacheHitRate = totalUsers > 0 ? ((cachedUsers / totalUsers) * 100).toFixed(1) : '0'

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Admin Dashboard</h1>
          <p className="mt-2 text-sm text-gray-600">
            Manage users, monitor cache, and test permissions
          </p>
        </div>

        {/* Current User Info */}
        <div className="bg-white shadow rounded-lg p-6 mb-8">
          <h2 className="text-lg font-semibold mb-3">Logged in as</h2>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Email</p>
              <p className="font-medium">{currentUser.email}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Role</p>
              <p className="font-medium capitalize">{currentUser.role}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600">User ID</p>
              <p className="font-mono text-xs">{currentUser.id.slice(0, 8)}...</p>
            </div>
          </div>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <div className="bg-white shadow rounded-lg p-6">
            <div className="flex items-center">
              <div className="flex-shrink-0 bg-blue-500 rounded-md p-3">
                <span className="text-2xl text-white">👥</span>
              </div>
              <div className="ml-5">
                <p className="text-sm font-medium text-gray-500">Total Users</p>
                <p className="text-2xl font-semibold text-gray-900">{totalUsers}</p>
              </div>
            </div>
          </div>

          <div className="bg-white shadow rounded-lg p-6">
            <div className="flex items-center">
              <div className="flex-shrink-0 bg-green-500 rounded-md p-3">
                <span className="text-2xl text-white">✓</span>
              </div>
              <div className="ml-5">
                <p className="text-sm font-medium text-gray-500">Active Users</p>
                <p className="text-2xl font-semibold text-gray-900">{activeUsers}</p>
              </div>
            </div>
          </div>

          <div className="bg-white shadow rounded-lg p-6">
            <div className="flex items-center">
              <div className="flex-shrink-0 bg-purple-500 rounded-md p-3">
                <span className="text-2xl text-white">💾</span>
              </div>
              <div className="ml-5">
                <p className="text-sm font-medium text-gray-500">Cached</p>
                <p className="text-2xl font-semibold text-gray-900">{cachedUsers}</p>
              </div>
            </div>
          </div>

          <div className="bg-white shadow rounded-lg p-6">
            <div className="flex items-center">
              <div className="flex-shrink-0 bg-orange-500 rounded-md p-3">
                <span className="text-2xl text-white">📊</span>
              </div>
              <div className="ml-5">
                <p className="text-sm font-medium text-gray-500">Cache Hit Rate</p>
                <p className="text-2xl font-semibold text-gray-900">{cacheHitRate}%</p>
              </div>
            </div>
          </div>
        </div>

        {/* Admin Tools Navigation */}
        <div className="mb-6">
          <h2 className="text-xl font-semibold mb-4">Admin Tools</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* User Management Card */}
            <Link
              href="/admin/users"
              className="block bg-white shadow rounded-lg p-6 hover:shadow-lg transition-shadow"
            >
              <div className="flex items-start">
                <div className="flex-shrink-0">
                  <span className="text-4xl">👥</span>
                </div>
                <div className="ml-4">
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">User Management</h3>
                  <p className="text-sm text-gray-600 mb-3">
                    Manage user roles, permissions, and access levels
                  </p>
                  <ul className="text-xs text-gray-500 space-y-1">
                    <li>• Change user roles</li>
                    <li>• Remove users</li>
                    <li>• View user status</li>
                  </ul>
                </div>
              </div>
            </Link>

            {/* Cache Statistics Card */}
            <Link
              href="/admin/cache"
              className="block bg-white shadow rounded-lg p-6 hover:shadow-lg transition-shadow"
            >
              <div className="flex items-start">
                <div className="flex-shrink-0">
                  <span className="text-4xl">📊</span>
                </div>
                <div className="ml-4">
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">Cache Statistics</h3>
                  <p className="text-sm text-gray-600 mb-3">
                    Monitor Redis cache performance and invalidate cached data
                  </p>
                  <ul className="text-xs text-gray-500 space-y-1">
                    <li>• View cache hit rates</li>
                    <li>• Check TTL values</li>
                    <li>• Clear user caches</li>
                  </ul>
                </div>
              </div>
            </Link>

            {/* Permission Testing Card */}
            <Link
              href="/admin/permissions"
              className="block bg-white shadow rounded-lg p-6 hover:shadow-lg transition-shadow"
            >
              <div className="flex items-start">
                <div className="flex-shrink-0">
                  <span className="text-4xl">🔐</span>
                </div>
                <div className="ml-4">
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">Permission Testing</h3>
                  <p className="text-sm text-gray-600 mb-3">
                    Test RBAC system and view your permission matrix
                  </p>
                  <ul className="text-xs text-gray-500 space-y-1">
                    <li>• Test permission checks</li>
                    <li>• View your permissions</li>
                    <li>• Quick test actions</li>
                  </ul>
                </div>
              </div>
            </Link>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="bg-white shadow rounded-lg p-6">
          <h2 className="text-lg font-semibold mb-4">Quick Actions</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Link
              href="/admin/users"
              className="flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:bg-gray-50"
            >
              <div className="flex items-center">
                <span className="text-2xl mr-3">👤</span>
                <div>
                  <p className="font-medium">View All Users</p>
                  <p className="text-sm text-gray-500">{totalUsers} users in organization</p>
                </div>
              </div>
              <span className="text-gray-400">→</span>
            </Link>

            <Link
              href="/admin/cache"
              className="flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:bg-gray-50"
            >
              <div className="flex items-center">
                <span className="text-2xl mr-3">💾</span>
                <div>
                  <p className="font-medium">Check Cache Performance</p>
                  <p className="text-sm text-gray-500">{cacheHitRate}% hit rate</p>
                </div>
              </div>
              <span className="text-gray-400">→</span>
            </Link>

            <Link
              href="/admin/permissions"
              className="flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:bg-gray-50"
            >
              <div className="flex items-center">
                <span className="text-2xl mr-3">🔐</span>
                <div>
                  <p className="font-medium">Test Permissions</p>
                  <p className="text-sm text-gray-500">Verify RBAC system</p>
                </div>
              </div>
              <span className="text-gray-400">→</span>
            </Link>

            <Link
              href="/dashboard"
              className="flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:bg-gray-50"
            >
              <div className="flex items-center">
                <span className="text-2xl mr-3">🏠</span>
                <div>
                  <p className="font-medium">Back to Dashboard</p>
                  <p className="text-sm text-gray-500">Return to main app</p>
                </div>
              </div>
              <span className="text-gray-400">→</span>
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
