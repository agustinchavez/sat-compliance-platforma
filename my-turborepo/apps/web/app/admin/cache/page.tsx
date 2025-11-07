import { requireAdminOrOwner } from '@/lib/rbac'
import { getOrganizationCacheStats } from '../actions'
import { CacheStatsClient } from './CacheStatsClient'

export default async function CacheAdminPage() {
  // Protect page
  await requireAdminOrOwner()

  // Fetch cache stats
  const cacheStats = await getOrganizationCacheStats()

  // Calculate summary
  const totalUsers = cacheStats.length
  const cachedUsers = cacheStats.filter((s) => s.cached).length
  const hitRate = totalUsers > 0 ? ((cachedUsers / totalUsers) * 100).toFixed(1) : '0'

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Redis Cache Statistics</h1>
          <p className="mt-2 text-sm text-gray-600">
            Monitor permission caching performance
          </p>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
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
                <p className="text-sm font-medium text-gray-500">Cached</p>
                <p className="text-2xl font-semibold text-gray-900">{cachedUsers}</p>
              </div>
            </div>
          </div>

          <div className="bg-white shadow rounded-lg p-6">
            <div className="flex items-center">
              <div className="flex-shrink-0 bg-purple-500 rounded-md p-3">
                <span className="text-2xl text-white">📊</span>
              </div>
              <div className="ml-5">
                <p className="text-sm font-medium text-gray-500">Hit Rate</p>
                <p className="text-2xl font-semibold text-gray-900">{hitRate}%</p>
              </div>
            </div>
          </div>
        </div>

        {/* Cache Details */}
        <div className="bg-white shadow rounded-lg overflow-hidden">
          <CacheStatsClient cacheStats={cacheStats} />
        </div>
      </div>
    </div>
  )
}
