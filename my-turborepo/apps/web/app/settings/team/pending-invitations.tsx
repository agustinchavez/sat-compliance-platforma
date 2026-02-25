'use client'

import { useState, useEffect } from 'react'
import { resendInvitationAction, cancelInvitationAction } from './actions'
import type { Invitation } from '@/lib/team/types'
import type { Role } from '@/lib/rbac/types'

interface PendingInvitationsProps {
  invitations: Invitation[]
  canManage: boolean
}

const roleLabels: Record<Role, string> = {
  owner: 'Owner',
  admin: 'Admin',
  accountant: 'Accountant',
  user: 'User',
}

export function PendingInvitations({ invitations, canManage }: PendingInvitationsProps) {
  const [loadingId, setLoadingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  // Auto-dismiss success message after 3 seconds
  useEffect(() => {
    if (successMessage) {
      const timer = setTimeout(() => setSuccessMessage(null), 3000)
      return () => clearTimeout(timer)
    }
  }, [successMessage])

  const handleResend = async (invitationId: string) => {
    setLoadingId(invitationId)
    setError(null)
    setSuccessMessage(null)

    const result = await resendInvitationAction(invitationId)

    if (result.success) {
      setSuccessMessage('Invitation resent successfully')
    } else {
      setError(result.error || 'Failed to resend invitation')
    }

    setLoadingId(null)
  }

  const handleCancel = async (invitationId: string) => {
    setLoadingId(invitationId)
    setError(null)
    setSuccessMessage(null)

    const result = await cancelInvitationAction(invitationId)

    if (result.success) {
      setSuccessMessage('Invitation cancelled')
    } else {
      setError(result.error || 'Failed to cancel invitation')
    }

    setLoadingId(null)
  }

  const isExpiringSoon = (expiresAt: Date) => {
    const now = new Date()
    const expiry = new Date(expiresAt)
    const hoursLeft = (expiry.getTime() - now.getTime()) / (1000 * 60 * 60)
    return hoursLeft < 24
  }

  if (invitations.length === 0) {
    return null
  }

  return (
    <div className="bg-white shadow rounded-lg">
      <div className="px-6 py-4 border-b border-gray-200">
        <h2 className="text-lg font-semibold text-gray-900">
          Pending Invitations ({invitations.length})
        </h2>
        <p className="text-sm text-gray-600 mt-1">
          These invitations are waiting for acceptance
        </p>
      </div>

      <div className="p-6">
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4">
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}
        {successMessage && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-3 mb-4">
            <p className="text-sm text-green-700">{successMessage}</p>
          </div>
        )}

        <div className="space-y-3">
          {invitations.map((invitation) => {
            const expiringSoon = isExpiringSoon(invitation.expires_at)

            return (
              <div
                key={invitation.id}
                className={`border rounded-lg p-4 ${
                  expiringSoon ? 'border-yellow-300 bg-yellow-50' : 'border-gray-200'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-4">
                    {/* Email icon */}
                    <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center text-blue-600">
                      <span className="text-xl">@</span>
                    </div>

                    {/* Info */}
                    <div>
                      <p className="font-medium text-gray-900">{invitation.email}</p>
                      <div className="flex items-center space-x-2 text-xs text-gray-500 mt-1">
                        <span>Role: {roleLabels[invitation.role]}</span>
                        <span>-</span>
                        <span>
                          Invited {new Date(invitation.created_at).toLocaleDateString('es-MX')}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Status & Actions */}
                  <div className="flex items-center space-x-3">
                    {expiringSoon && (
                      <span className="text-xs text-yellow-700 bg-yellow-100 px-2 py-1 rounded">
                        Expires soon
                      </span>
                    )}

                    {canManage && (
                      <div className="flex items-center space-x-2">
                        <button
                          onClick={() => handleResend(invitation.id)}
                          disabled={loadingId === invitation.id}
                          className="text-xs text-blue-600 hover:text-blue-800 px-2 py-1 border border-blue-300 rounded hover:bg-blue-50 disabled:opacity-50"
                        >
                          {loadingId === invitation.id ? '...' : 'Resend'}
                        </button>
                        <button
                          onClick={() => handleCancel(invitation.id)}
                          disabled={loadingId === invitation.id}
                          className="text-xs text-red-600 hover:text-red-800 px-2 py-1 border border-red-300 rounded hover:bg-red-50 disabled:opacity-50"
                        >
                          {loadingId === invitation.id ? '...' : 'Cancel'}
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Expiry info */}
                <div className="mt-2 text-xs text-gray-500">
                  Expires: {new Date(invitation.expires_at).toLocaleString('es-MX')}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
