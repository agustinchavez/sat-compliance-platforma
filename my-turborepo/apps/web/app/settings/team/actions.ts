'use server'

import { revalidatePath } from 'next/cache'
import { requireAuth } from '@/lib/auth'
import {
  getTeamMembers,
  getTeamStats,
  updateTeamMemberRole,
  removeTeamMember,
  canManageTeam,
} from '@/lib/team/service'
import {
  inviteUser,
  getPendingInvitations,
  resendInvitation,
  cancelInvitation,
} from '@/lib/team/invitations'
import type { Role } from '@/lib/rbac/types'
import type { TeamMember, TeamStats, Invitation } from '@/lib/team/types'

export interface TeamFormState {
  success: boolean
  error: string | null
  message: string | null
}

/**
 * Get team data for display
 */
export async function getTeamData(): Promise<{
  members: TeamMember[]
  invitations: Invitation[]
  stats: TeamStats | null
  canManage: boolean
}> {
  const user = await requireAuth()

  // Get team members
  const membersResult = await getTeamMembers(user.organizationId)
  const members = membersResult.success ? membersResult.members : []

  // Get pending invitations
  const invitationsResult = await getPendingInvitations(user.organizationId)
  const invitations = invitationsResult.success ? invitationsResult.invitations : []

  // Get team stats
  const statsResult = await getTeamStats(user.organizationId)
  const stats = statsResult.success ? statsResult.stats : null

  // Check if current user can manage team
  const canManage = await canManageTeam(user.id, user.organizationId)

  return { members, invitations, stats, canManage }
}

/**
 * Invite a new team member
 */
export async function inviteTeamMemberAction(
  _prevState: TeamFormState,
  formData: FormData
): Promise<TeamFormState> {
  try {
    const user = await requireAuth()

    // Check permission
    const canManage = await canManageTeam(user.id, user.organizationId)
    if (!canManage) {
      return { success: false, error: 'Not authorized to invite team members', message: null }
    }

    const email = formData.get('email') as string
    const role = formData.get('role') as Role
    const message = formData.get('message') as string | null

    // Validate inputs
    if (!email?.trim()) {
      return { success: false, error: 'Email is required', message: null }
    }
    if (!role) {
      return { success: false, error: 'Role is required', message: null }
    }

    const result = await inviteUser(user.organizationId, user.id, {
      email: email.trim(),
      role,
      message: message?.trim() || undefined,
    })

    if (!result.success) {
      return { success: false, error: result.error, message: null }
    }

    revalidatePath('/settings/team')

    return {
      success: true,
      error: null,
      message: `Invitation sent to ${email}`,
    }
  } catch (error) {
    console.error('Error inviting team member:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to send invitation',
      message: null,
    }
  }
}

/**
 * Change a team member's role
 */
export async function changeRoleAction(
  userId: string,
  currentRole: Role,
  newRole: Role
): Promise<TeamFormState> {
  try {
    const user = await requireAuth()

    // Check permission
    const canManage = await canManageTeam(user.id, user.organizationId)
    if (!canManage) {
      return { success: false, error: 'Not authorized to change roles', message: null }
    }

    const result = await updateTeamMemberRole({
      user_id: userId,
      old_role: currentRole,
      new_role: newRole,
      changed_by: user.id,
    })

    if (!result.success) {
      return { success: false, error: result.message, message: null }
    }

    revalidatePath('/settings/team')

    return {
      success: true,
      error: null,
      message: 'Role updated successfully',
    }
  } catch (error) {
    console.error('Error changing role:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to change role',
      message: null,
    }
  }
}

/**
 * Remove a team member
 */
export async function removeTeamMemberAction(
  userId: string,
  reason?: string
): Promise<TeamFormState> {
  try {
    const user = await requireAuth()

    // Check permission
    const canManage = await canManageTeam(user.id, user.organizationId)
    if (!canManage) {
      return { success: false, error: 'Not authorized to remove team members', message: null }
    }

    const result = await removeTeamMember(user.organizationId, userId, user.id, reason)

    if (!result.success) {
      return { success: false, error: result.error, message: null }
    }

    revalidatePath('/settings/team')

    return {
      success: true,
      error: null,
      message: 'Team member removed',
    }
  } catch (error) {
    console.error('Error removing team member:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to remove team member',
      message: null,
    }
  }
}

/**
 * Resend an invitation
 */
export async function resendInvitationAction(
  invitationId: string
): Promise<TeamFormState> {
  try {
    const user = await requireAuth()

    const result = await resendInvitation(invitationId, user.id)

    if (!result.success) {
      return { success: false, error: result.error, message: null }
    }

    revalidatePath('/settings/team')

    return {
      success: true,
      error: null,
      message: 'Invitation resent',
    }
  } catch (error) {
    console.error('Error resending invitation:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to resend invitation',
      message: null,
    }
  }
}

/**
 * Cancel an invitation
 */
export async function cancelInvitationAction(
  invitationId: string
): Promise<TeamFormState> {
  try {
    const user = await requireAuth()

    const result = await cancelInvitation(invitationId, user.id)

    if (!result.success) {
      return { success: false, error: result.error, message: null }
    }

    revalidatePath('/settings/team')

    return {
      success: true,
      error: null,
      message: 'Invitation cancelled',
    }
  } catch (error) {
    console.error('Error cancelling invitation:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to cancel invitation',
      message: null,
    }
  }
}
