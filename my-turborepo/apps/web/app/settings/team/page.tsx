import { requireAuth } from '@/lib/auth'
import { getTeamData } from './actions'
import { InviteMemberForm } from './invite-member-form'
import { TeamMemberList } from './team-member-list'
import { PendingInvitations } from './pending-invitations'
import { TeamStatsCard } from './team-stats-card'

export default async function TeamSettingsPage() {
  const user = await requireAuth()
  const { members, invitations, stats, canManage } = await getTeamData()

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Team Management</h1>
          <p className="mt-1 text-sm text-gray-600">
            Manage your team members and their access levels
          </p>
        </div>
        {canManage && <InviteMemberForm />}
      </div>

      {/* Team Stats */}
      <TeamStatsCard stats={stats} />

      {/* Pending Invitations */}
      <PendingInvitations invitations={invitations} canManage={canManage} />

      {/* Team Members */}
      <div className="bg-white shadow rounded-lg">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">
            Team Members ({members.length})
          </h2>
          <p className="text-sm text-gray-600 mt-1">
            All active members of your organization
          </p>
        </div>
        <div className="p-6">
          <TeamMemberList
            members={members}
            currentUserId={user.id}
            canManage={canManage}
          />
        </div>
      </div>

      {/* Role Permissions Info */}
      <div className="bg-white shadow rounded-lg p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Role Permissions</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <RoleCard
            role="Owner"
            color="purple"
            permissions={[
              'Full access to all features',
              'Manage organization settings',
              'Transfer ownership',
              'Delete organization',
            ]}
          />
          <RoleCard
            role="Administrator"
            color="blue"
            permissions={[
              'Manage team members',
              'Manage certificates and PAC',
              'Access all invoices',
              'Manage customers and products',
            ]}
          />
          <RoleCard
            role="Accountant"
            color="green"
            permissions={[
              'Create and manage invoices',
              'View customers and products',
              'Export reports',
              'Limited settings access',
            ]}
          />
          <RoleCard
            role="User"
            color="gray"
            permissions={[
              'View invoices',
              'Create draft invoices',
              'View products',
              'Basic dashboard access',
            ]}
          />
        </div>
      </div>
    </div>
  )
}

function RoleCard({
  role,
  color,
  permissions,
}: {
  role: string
  color: 'purple' | 'blue' | 'green' | 'gray'
  permissions: string[]
}) {
  const colorClasses = {
    purple: 'bg-purple-50 border-purple-200 text-purple-800',
    blue: 'bg-blue-50 border-blue-200 text-blue-800',
    green: 'bg-green-50 border-green-200 text-green-800',
    gray: 'bg-gray-50 border-gray-200 text-gray-800',
  }

  return (
    <div className={`border rounded-lg p-4 ${colorClasses[color]}`}>
      <h4 className="font-semibold mb-2">{role}</h4>
      <ul className="space-y-1 text-sm opacity-80">
        {permissions.map((permission, index) => (
          <li key={index} className="flex items-start">
            <span className="mr-2">-</span>
            <span>{permission}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
