import type { TeamStats } from '@/lib/team/types'

interface TeamStatsCardProps {
  stats: TeamStats | null
}

export function TeamStatsCard({ stats }: TeamStatsCardProps) {
  if (!stats) {
    return null
  }

  return (
    <div className="bg-white shadow rounded-lg p-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">Team Overview</h3>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {/* Total Members */}
        <div className="bg-blue-50 rounded-lg p-4 text-center">
          <p className="text-3xl font-bold text-blue-600">{stats.active}</p>
          <p className="text-xs text-blue-700 mt-1">Active Members</p>
        </div>

        {/* Pending */}
        <div className="bg-yellow-50 rounded-lg p-4 text-center">
          <p className="text-3xl font-bold text-yellow-600">{stats.pending_invitations}</p>
          <p className="text-xs text-yellow-700 mt-1">Pending Invites</p>
        </div>

        {/* Recent Additions */}
        <div className="bg-green-50 rounded-lg p-4 text-center">
          <p className="text-3xl font-bold text-green-600">+{stats.recent_additions}</p>
          <p className="text-xs text-green-700 mt-1">New (30 days)</p>
        </div>

        {/* Inactive */}
        <div className="bg-gray-50 rounded-lg p-4 text-center">
          <p className="text-3xl font-bold text-gray-600">{stats.inactive}</p>
          <p className="text-xs text-gray-700 mt-1">Inactive</p>
        </div>
      </div>

      {/* Role Breakdown */}
      <div className="mt-6 pt-4 border-t border-gray-200">
        <h4 className="text-sm font-medium text-gray-700 mb-3">Members by Role</h4>
        <div className="flex flex-wrap gap-2">
          {stats.by_role.owner > 0 && (
            <span className="px-3 py-1 bg-purple-100 text-purple-800 text-sm rounded-full">
              {stats.by_role.owner} Owner{stats.by_role.owner > 1 ? 's' : ''}
            </span>
          )}
          {stats.by_role.admin > 0 && (
            <span className="px-3 py-1 bg-blue-100 text-blue-800 text-sm rounded-full">
              {stats.by_role.admin} Admin{stats.by_role.admin > 1 ? 's' : ''}
            </span>
          )}
          {stats.by_role.accountant > 0 && (
            <span className="px-3 py-1 bg-green-100 text-green-800 text-sm rounded-full">
              {stats.by_role.accountant} Accountant{stats.by_role.accountant > 1 ? 's' : ''}
            </span>
          )}
          {stats.by_role.user > 0 && (
            <span className="px-3 py-1 bg-gray-100 text-gray-800 text-sm rounded-full">
              {stats.by_role.user} User{stats.by_role.user > 1 ? 's' : ''}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
