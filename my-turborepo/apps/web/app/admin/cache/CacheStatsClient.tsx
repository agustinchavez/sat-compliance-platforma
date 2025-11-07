'use client'

import { useState } from 'react'
import { invalidateUserCache, invalidateOrgCache } from '../actions'

interface CacheStat {
  userId: string
  email: string
  fullName: string
  role: string
  cached: boolean
  ttl: number | null
  cachedData: any
}

interface Props {
  cacheStats: CacheStat[]
}

export function CacheStatsClient({ cacheStats }: Props) {
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [expandedUser, setExpandedUser] = useState<string | null>(null)

  const handleInvalidateUser = async (userId: string, email: string) => {
    if (!confirm(`Invalidate cache for ${email}?`)) return

    setLoading(true)
    setMessage(null)

    const result = await invalidateUserCache(userId)

    setLoading(false)

    if (result.success) {
      setMessage({ type: 'success', text: 'Cache invalidated successfully!' })
      window.location.reload()
    } else {
      setMessage({ type: 'error', text: result.error || 'Failed to invalidate cache' })
    }
  }

  const handleInvalidateOrg = async () => {
    if (!confirm('Invalidate cache for ALL users in organization? This cannot be undone.')) return

    setLoading(true)
    setMessage(null)

    const result = await invalidateOrgCache()

    setLoading(false)

    if (result.success) {
      setMessage({ type: 'success', text: 'Organization cache cleared!' })
      window.location.reload()
    } else {
      setMessage({ type: 'error', text: result.error || 'Failed to clear cache' })
    }
  }

  const formatTTL = (ttl: number | null) => {
    if (ttl === null || ttl < 0) return 'N/A'
    if (ttl === 0) return 'Expired'

    const minutes = Math.floor(ttl / 60)
    const seconds = ttl % 60

    if (minutes > 0) {
      return `${minutes}m ${seconds}s`
    }
    return `${seconds}s`
  }

  return (
    <div className="p-6">
      {/* Message */}
      {message && (
        <div
          className={`p-4 mb-4 rounded ${
            message.type === 'success' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'
          }`}
        >
          {message.text}
        </div>
      )}

      {/* Clear All Button */}
      <div className="mb-6">
        <button
          onClick={handleInvalidateOrg}
          disabled={loading}
          className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50"
        >
          {loading ? 'Clearing...' : 'Clear All Caches'}
        </button>
        <p className="mt-2 text-xs text-gray-500">
          Clears cached permissions for all users in the organization
        </p>
      </div>

      {/* Cache Stats Table */}
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
              User
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
              Role
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
              Cache Status
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
              TTL
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
              Actions
            </th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {cacheStats.map((stat) => (
            <>
              <tr key={stat.userId} className="hover:bg-gray-50">
                <td className="px-6 py-4">
                  <div className="text-sm font-medium text-gray-900">{stat.fullName}</div>
                  <div className="text-sm text-gray-500">{stat.email}</div>
                </td>
                <td className="px-6 py-4">
                  <span className="px-2 py-1 text-xs font-semibold rounded-full bg-blue-100 text-blue-800">
                    {stat.role}
                  </span>
                </td>
                <td className="px-6 py-4">
                  {stat.cached ? (
                    <span className="px-2 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800">
                      ✓ Cached
                    </span>
                  ) : (
                    <span className="px-2 py-1 text-xs font-semibold rounded-full bg-gray-100 text-gray-800">
                      Not Cached
                    </span>
                  )}
                </td>
                <td className="px-6 py-4 text-sm text-gray-900">{formatTTL(stat.ttl)}</td>
                <td className="px-6 py-4 text-sm">
                  <button
                    onClick={() => setExpandedUser(expandedUser === stat.userId ? null : stat.userId)}
                    className="text-blue-600 hover:text-blue-900 mr-4"
                  >
                    {expandedUser === stat.userId ? 'Hide' : 'View'} Details
                  </button>
                  {stat.cached && (
                    <button
                      onClick={() => handleInvalidateUser(stat.userId, stat.email)}
                      disabled={loading}
                      className="text-red-600 hover:text-red-900 disabled:opacity-50"
                    >
                      Clear
                    </button>
                  )}
                </td>
              </tr>

              {/* Expanded Details */}
              {expandedUser === stat.userId && (
                <tr>
                  <td colSpan={5} className="px-6 py-4 bg-gray-50">
                    <div className="text-sm">
                      <h4 className="font-semibold mb-2">Cached Permissions:</h4>
                      {stat.cachedData ? (
                        <pre className="bg-white p-4 rounded border overflow-auto max-h-96 text-xs">
                          {JSON.stringify(stat.cachedData, null, 2)}
                        </pre>
                      ) : (
                        <p className="text-gray-500">No cached data available</p>
                      )}
                    </div>
                  </td>
                </tr>
              )}
            </>
          ))}
        </tbody>
      </table>

      {cacheStats.length === 0 && (
        <div className="text-center py-12">
          <p className="text-gray-500">No cache data available</p>
        </div>
      )}
    </div>
  )
}
