'use client'

import { useState } from 'react'
import { changeUserRole, removeUser } from '../actions'
import type { Role } from '@/lib/rbac/types'

interface User {
  id: string
  auth_id: string | null
  email: string
  full_name: string
  role: string
  email_verified: boolean
  last_login_at: string | null
  created_at: string
}

interface Props {
  users: User[]
  currentUserId: string
  currentUserRole: Role
}

export function UserManagementClient({ users, currentUserId, currentUserRole }: Props) {
  const [loading, setLoading] = useState<string | null>(null)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const handleRoleChange = async (userId: string, newRole: Role) => {
    if (!confirm(`Are you sure you want to change this user's role to ${newRole}?`)) {
      return
    }

    setLoading(userId)
    setMessage(null)

    const result = await changeUserRole(userId, newRole)

    setLoading(null)

    if (result.success) {
      setMessage({ type: 'success', text: 'Role updated successfully!' })
      // Refresh the page to show updated data
      window.location.reload()
    } else {
      setMessage({ type: 'error', text: result.error || 'Failed to update role' })
    }
  }

  const handleRemoveUser = async (userId: string, userName: string) => {
    if (!confirm(`Are you sure you want to remove ${userName}? This action cannot be undone.`)) {
      return
    }

    setLoading(userId)
    setMessage(null)

    const result = await removeUser(userId)

    setLoading(null)

    if (result.success) {
      setMessage({ type: 'success', text: 'User removed successfully!' })
      window.location.reload()
    } else {
      setMessage({ type: 'error', text: result.error || 'Failed to remove user' })
    }
  }

  const getRoleBadgeColor = (role: string) => {
    const colors = {
      owner: 'bg-purple-100 text-purple-800',
      admin: 'bg-blue-100 text-blue-800',
      accountant: 'bg-green-100 text-green-800',
      user: 'bg-gray-100 text-gray-800',
    }
    return colors[role as keyof typeof colors] || 'bg-gray-100 text-gray-800'
  }

  const canChangeRole = (targetUserId: string, targetRole: string) => {
    // Can't change own role
    if (targetUserId === currentUserId) return false

    // Owner can change any role
    if (currentUserRole === 'owner') return true

    // Admin can only change user/accountant roles (not owner/admin)
    if (currentUserRole === 'admin') {
      return targetRole === 'user' || targetRole === 'accountant'
    }

    return false
  }

  return (
    <div>
      {/* Message */}
      {message && (
        <div
          className={`p-4 mb-4 rounded ${
            message.type === 'success'
              ? 'bg-green-50 text-green-800'
              : 'bg-red-50 text-red-800'
          }`}
        >
          {message.text}
        </div>
      )}

      {/* Table */}
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              User
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Role
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Status
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Last Login
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Actions
            </th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {users.map((user) => (
            <tr key={user.id}>
              {/* User Info */}
              <td className="px-6 py-4 whitespace-nowrap">
                <div className="flex items-center">
                  <div>
                    <div className="text-sm font-medium text-gray-900">
                      {user.full_name}
                      {user.id === currentUserId && (
                        <span className="ml-2 text-xs text-blue-600">(You)</span>
                      )}
                    </div>
                    <div className="text-sm text-gray-500">{user.email}</div>
                  </div>
                </div>
              </td>

              {/* Role */}
              <td className="px-6 py-4 whitespace-nowrap">
                <span
                  className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${getRoleBadgeColor(
                    user.role
                  )}`}
                >
                  {user.role}
                </span>
              </td>

              {/* Status */}
              <td className="px-6 py-4 whitespace-nowrap">
                <span
                  className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                    user.email_verified
                      ? 'bg-green-100 text-green-800'
                      : 'bg-yellow-100 text-yellow-800'
                  }`}
                >
                  {user.email_verified ? 'Verified' : 'Pending'}
                </span>
              </td>

              {/* Last Login */}
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                {user.last_login_at
                  ? new Date(user.last_login_at).toLocaleDateString()
                  : 'Never'}
              </td>

              {/* Actions */}
              <td className="px-6 py-4 whitespace-nowrap text-sm">
                {canChangeRole(user.id, user.role) && (
                  <div className="flex gap-2">
                    <select
                      disabled={loading === user.id}
                      className="text-sm border border-gray-300 rounded px-2 py-1"
                      defaultValue={user.role}
                      onChange={(e) => handleRoleChange(user.id, e.target.value as Role)}
                    >
                      <option value="owner">Owner</option>
                      <option value="admin">Admin</option>
                      <option value="accountant">Accountant</option>
                      <option value="user">User</option>
                    </select>

                    <button
                      disabled={loading === user.id || user.id === currentUserId}
                      onClick={() => handleRemoveUser(user.id, user.full_name)}
                      className="text-red-600 hover:text-red-900 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Remove
                    </button>
                  </div>
                )}

                {user.id === currentUserId && (
                  <span className="text-gray-400 text-xs">Cannot modify own role</span>
                )}

                {!canChangeRole(user.id, user.role) && user.id !== currentUserId && (
                  <span className="text-gray-400 text-xs">No permission</span>
                )}

                {loading === user.id && (
                  <span className="text-blue-600 text-xs">Updating...</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {users.length === 0 && (
        <div className="text-center py-12">
          <p className="text-gray-500">No users found</p>
        </div>
      )}
    </div>
  )
}
