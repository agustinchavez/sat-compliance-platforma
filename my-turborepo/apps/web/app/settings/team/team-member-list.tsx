'use client'

import { useState } from 'react'
import { changeRoleAction, removeTeamMemberAction } from './actions'
import type { TeamMember } from '@/lib/team/types'
import type { Role } from '@/lib/rbac/types'

interface TeamMemberListProps {
  members: TeamMember[]
  currentUserAuthId: string  // Supabase auth ID for comparison with member.auth_id
  canManage: boolean
}

const roleColors: Record<Role, string> = {
  owner: 'bg-purple-100 text-purple-800',
  admin: 'bg-blue-100 text-blue-800',
  accountant: 'bg-green-100 text-green-800',
  user: 'bg-gray-100 text-gray-800',
}

const roleLabels: Record<Role, string> = {
  owner: 'Owner',
  admin: 'Admin',
  accountant: 'Accountant',
  user: 'User',
}

export function TeamMemberList({ members, currentUserAuthId, canManage }: TeamMemberListProps) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [removingId, setRemovingId] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleRoleChange = async (member: TeamMember, newRole: Role) => {
    if (newRole === member.role) {
      setEditingId(null)
      return
    }

    setIsLoading(true)
    setError(null)

    // Use auth_id for organization_members queries
    const result = await changeRoleAction(member.auth_id, member.role, newRole)

    if (!result.success) {
      setError(result.error || 'Failed to change role')
    }

    setIsLoading(false)
    setEditingId(null)
  }

  const handleRemove = async (member: TeamMember) => {
    setIsLoading(true)
    setError(null)

    // Use auth_id for organization_members queries
    const result = await removeTeamMemberAction(member.auth_id)

    if (!result.success) {
      setError(result.error || 'Failed to remove member')
    }

    setIsLoading(false)
    setRemovingId(null)
  }

  if (members.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        <span className="text-4xl mb-2 block">👥</span>
        <p>No team members yet</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {members.map((member) => (
        <div
          key={member.id}
          className="bg-white border border-gray-200 rounded-lg p-4"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              {/* Avatar */}
              <div className="w-10 h-10 bg-gray-200 rounded-full flex items-center justify-center text-gray-600 font-medium">
                {member.full_name?.charAt(0)?.toUpperCase() || member.email.charAt(0).toUpperCase()}
              </div>

              {/* Info */}
              <div>
                <div className="flex items-center space-x-2">
                  <span className="font-medium text-gray-900">
                    {member.full_name || 'Unnamed User'}
                  </span>
                  {member.auth_id === currentUserAuthId && (
                    <span className="text-xs text-gray-500">(You)</span>
                  )}
                </div>
                <p className="text-sm text-gray-500">{member.email}</p>
              </div>
            </div>

            <div className="flex items-center space-x-3">
              {/* Role Badge / Selector */}
              {editingId === member.id ? (
                <select
                  value={member.role}
                  onChange={(e) => handleRoleChange(member, e.target.value as Role)}
                  disabled={isLoading}
                  className="text-sm border border-gray-300 rounded-md px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="admin">Admin</option>
                  <option value="accountant">Accountant</option>
                  <option value="user">User</option>
                </select>
              ) : (
                <span className={`px-2 py-1 text-xs font-medium rounded-full ${roleColors[member.role]}`}>
                  {roleLabels[member.role]}
                </span>
              )}

              {/* Actions */}
              {canManage && member.auth_id !== currentUserAuthId && member.role !== 'owner' && (
                <div className="flex items-center space-x-1">
                  {removingId === member.id ? (
                    <>
                      <button
                        onClick={() => handleRemove(member)}
                        disabled={isLoading}
                        className="text-xs text-white bg-red-600 hover:bg-red-700 px-2 py-1 rounded disabled:opacity-50"
                      >
                        {isLoading ? '...' : 'Confirm'}
                      </button>
                      <button
                        onClick={() => setRemovingId(null)}
                        className="text-xs text-gray-500 hover:text-gray-700 px-2 py-1"
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={() => setEditingId(editingId === member.id ? null : member.id)}
                        className="text-xs text-blue-600 hover:text-blue-800 px-2 py-1"
                      >
                        {editingId === member.id ? 'Cancel' : 'Change Role'}
                      </button>
                      <button
                        onClick={() => setRemovingId(member.id)}
                        className="text-xs text-red-600 hover:text-red-800 px-2 py-1"
                      >
                        Remove
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Additional Info */}
          <div className="mt-3 flex items-center space-x-4 text-xs text-gray-500">
            <span>
              Joined: {new Date(member.joined_at).toLocaleDateString('es-MX')}
            </span>
            {member.last_login_at && (
              <span>
                Last login: {new Date(member.last_login_at).toLocaleDateString('es-MX')}
              </span>
            )}
            {member.email_verified ? (
              <span className="text-green-600">Email verified</span>
            ) : (
              <span className="text-yellow-600">Email not verified</span>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}
