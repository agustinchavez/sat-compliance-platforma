'use client'

import { useActionState, useState } from 'react'
import { inviteTeamMemberAction, type TeamFormState } from './actions'
import type { Role } from '@/lib/rbac/types'

const initialState: TeamFormState = {
  success: false,
  error: null,
  message: null,
}

const roles: { value: Role; label: string; description: string }[] = [
  { value: 'admin', label: 'Administrator', description: 'Full access to manage team and settings' },
  { value: 'accountant', label: 'Accountant', description: 'Can manage invoices and financial data' },
  { value: 'user', label: 'User', description: 'Limited access to view and create invoices' },
]

export function InviteMemberForm() {
  const [state, formAction, isPending] = useActionState(inviteTeamMemberAction, initialState)
  const [selectedRole, setSelectedRole] = useState<Role>('user')
  const [showForm, setShowForm] = useState(false)

  if (!showForm) {
    return (
      <button
        onClick={() => setShowForm(true)}
        className="flex items-center px-4 py-2 bg-blue-600 text-white font-medium rounded-md hover:bg-blue-700 transition-colors"
      >
        <span className="mr-2">+</span>
        Invite Team Member
      </button>
    )
  }

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900">Invite New Team Member</h3>
        <button
          onClick={() => setShowForm(false)}
          className="text-gray-400 hover:text-gray-600"
        >
          x
        </button>
      </div>

      <form action={formAction} className="space-y-4">
        {/* Status Messages */}
        {state.error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3">
            <p className="text-sm text-red-700">{state.error}</p>
          </div>
        )}
        {state.message && state.success && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-3">
            <p className="text-sm text-green-700">{state.message}</p>
          </div>
        )}

        {/* Email Input */}
        <div>
          <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
            Email Address *
          </label>
          <input
            type="email"
            id="email"
            name="email"
            required
            className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            placeholder="colleague@company.com"
          />
        </div>

        {/* Role Selection */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Role *
          </label>
          <div className="space-y-2">
            {roles.map((role) => (
              <label
                key={role.value}
                className={`
                  flex items-start p-3 border rounded-lg cursor-pointer
                  ${selectedRole === role.value
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-gray-200 hover:border-gray-300'
                  }
                `}
              >
                <input
                  type="radio"
                  name="role"
                  value={role.value}
                  checked={selectedRole === role.value}
                  onChange={(e) => setSelectedRole(e.target.value as Role)}
                  className="mt-0.5 mr-3"
                />
                <div>
                  <span className="block text-sm font-medium text-gray-900">
                    {role.label}
                  </span>
                  <span className="block text-xs text-gray-500 mt-0.5">
                    {role.description}
                  </span>
                </div>
              </label>
            ))}
          </div>
        </div>

        {/* Optional Message */}
        <div>
          <label htmlFor="message" className="block text-sm font-medium text-gray-700 mb-1">
            Personal Message (optional)
          </label>
          <textarea
            id="message"
            name="message"
            rows={2}
            className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            placeholder="Add a personal message to the invitation email..."
          />
        </div>

        {/* Actions */}
        <div className="flex justify-end space-x-3 pt-2">
          <button
            type="button"
            onClick={() => setShowForm(false)}
            className="px-4 py-2 text-sm text-gray-700 hover:text-gray-900"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isPending}
            className="px-4 py-2 bg-blue-600 text-white font-medium rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isPending ? 'Sending...' : 'Send Invitation'}
          </button>
        </div>
      </form>
    </div>
  )
}
