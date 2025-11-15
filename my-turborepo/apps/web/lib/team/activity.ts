/**
 * Team Activity Logging
 *
 * This file handles logging of all team management activities for audit trails.
 * Tracks invitations, role changes, removals, and ownership transfers.
 */

import { createClient } from '@/lib/supabase/server';
import type {
  TeamAction,
  TeamActivityLog,
  TeamActivityDetails,
  ActivityLogFilters,
} from './types';
import type { Role } from '@/lib/rbac/types';

// ============================================================================
// Activity Logging
// ============================================================================

/**
 * Logs a team management activity
 *
 * @param organizationId - Organization ID
 * @param userId - User who performed the action
 * @param action - Type of action
 * @param details - Action details
 * @param targetUserId - User affected by the action (optional)
 * @returns Success or error
 */
export async function logTeamActivity(
  organizationId: string,
  userId: string,
  action: TeamAction,
  details: TeamActivityDetails,
  targetUserId?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createClient();

    // Get client info if available
    const clientInfo = getClientInfo();

    const { error } = await supabase.from('team_activity_log').insert({
      organization_id: organizationId,
      user_id: userId,
      action,
      target_user_id: targetUserId || null,
      details,
      ip_address: clientInfo.ipAddress,
      user_agent: clientInfo.userAgent,
      created_at: new Date().toISOString(),
    });

    if (error) {
      console.error('Error logging team activity:', error);
      return { success: false, error: 'Failed to log activity' };
    }

    return { success: true };
  } catch (error) {
    console.error('Error in logTeamActivity:', error);
    return { success: false, error: 'Failed to log activity' };
  }
}

// ============================================================================
// Specific Activity Loggers
// ============================================================================

/**
 * Logs an invitation sent event
 *
 * @param organizationId - Organization ID
 * @param invitedBy - User who sent invitation
 * @param email - Email invited
 * @param role - Role assigned
 * @param invitationId - Invitation ID
 * @returns Success or error
 */
export async function logInvitationSent(
  organizationId: string,
  invitedBy: string,
  email: string,
  role: Role,
  invitationId: string
): Promise<{ success: boolean; error?: string }> {
  return logTeamActivity(organizationId, invitedBy, 'user_invited', {
    email,
    new_role: role,
    invitation_id: invitationId,
  });
}

/**
 * Logs an invitation acceptance event
 *
 * @param organizationId - Organization ID
 * @param userId - User who accepted
 * @param role - Role assigned
 * @param invitationId - Invitation ID
 * @returns Success or error
 */
export async function logInvitationAccepted(
  organizationId: string,
  userId: string,
  role: Role,
  invitationId: string
): Promise<{ success: boolean; error?: string }> {
  return logTeamActivity(organizationId, userId, 'invitation_accepted', {
    new_role: role,
    invitation_id: invitationId,
  });
}

/**
 * Logs an invitation resend event
 *
 * @param organizationId - Organization ID
 * @param resentBy - User who resent
 * @param email - Email invited
 * @param invitationId - Invitation ID
 * @returns Success or error
 */
export async function logInvitationResent(
  organizationId: string,
  resentBy: string,
  email: string,
  invitationId: string
): Promise<{ success: boolean; error?: string }> {
  return logTeamActivity(organizationId, resentBy, 'invitation_resent', {
    email,
    invitation_id: invitationId,
  });
}

/**
 * Logs an invitation cancellation event
 *
 * @param organizationId - Organization ID
 * @param cancelledBy - User who cancelled
 * @param email - Email invited
 * @param invitationId - Invitation ID
 * @returns Success or error
 */
export async function logInvitationCancelled(
  organizationId: string,
  cancelledBy: string,
  email: string,
  invitationId: string
): Promise<{ success: boolean; error?: string }> {
  return logTeamActivity(organizationId, cancelledBy, 'invitation_cancelled', {
    email,
    invitation_id: invitationId,
  });
}

/**
 * Logs a role change event
 *
 * @param organizationId - Organization ID
 * @param changedBy - User who changed the role
 * @param targetUserId - User whose role was changed
 * @param oldRole - Previous role
 * @param newRole - New role
 * @param reason - Optional reason
 * @returns Success or error
 */
export async function logRoleChanged(
  organizationId: string,
  changedBy: string,
  targetUserId: string,
  oldRole: Role,
  newRole: Role,
  reason?: string
): Promise<{ success: boolean; error?: string }> {
  return logTeamActivity(
    organizationId,
    changedBy,
    'role_changed',
    {
      old_role: oldRole,
      new_role: newRole,
      reason,
    },
    targetUserId
  );
}

/**
 * Logs a member removal event
 *
 * @param organizationId - Organization ID
 * @param removedBy - User who removed the member
 * @param targetUserId - User who was removed
 * @param role - Role of removed user
 * @param reason - Optional reason
 * @returns Success or error
 */
export async function logMemberRemoved(
  organizationId: string,
  removedBy: string,
  targetUserId: string,
  role: Role,
  reason?: string
): Promise<{ success: boolean; error?: string }> {
  return logTeamActivity(
    organizationId,
    removedBy,
    'user_removed',
    {
      old_role: role,
      reason,
    },
    targetUserId
  );
}

/**
 * Logs a member reactivation event
 *
 * @param organizationId - Organization ID
 * @param reactivatedBy - User who reactivated the member
 * @param targetUserId - User who was reactivated
 * @param role - Role of reactivated user
 * @returns Success or error
 */
export async function logMemberReactivated(
  organizationId: string,
  reactivatedBy: string,
  targetUserId: string,
  role: Role
): Promise<{ success: boolean; error?: string }> {
  return logTeamActivity(
    organizationId,
    reactivatedBy,
    'user_reactivated',
    {
      new_role: role,
    },
    targetUserId
  );
}

/**
 * Logs an ownership transfer initiation event
 *
 * @param organizationId - Organization ID
 * @param fromUserId - Current owner
 * @param toUserId - New owner
 * @param transferId - Transfer ID
 * @returns Success or error
 */
export async function logOwnershipTransferInitiated(
  organizationId: string,
  fromUserId: string,
  toUserId: string,
  transferId: string
): Promise<{ success: boolean; error?: string }> {
  return logTeamActivity(
    organizationId,
    fromUserId,
    'ownership_transfer_initiated',
    {
      transfer_id: transferId,
    },
    toUserId
  );
}

/**
 * Logs an ownership transfer confirmation event
 *
 * @param organizationId - Organization ID
 * @param newOwner - New owner
 * @param previousOwner - Previous owner
 * @param transferId - Transfer ID
 * @returns Success or error
 */
export async function logOwnershipTransferConfirmed(
  organizationId: string,
  newOwner: string,
  previousOwner: string,
  transferId: string
): Promise<{ success: boolean; error?: string }> {
  return logTeamActivity(
    organizationId,
    newOwner,
    'ownership_transfer_confirmed',
    {
      transfer_id: transferId,
      previous_owner_id: previousOwner,
    },
    previousOwner
  );
}

/**
 * Logs an ownership transfer cancellation event
 *
 * @param organizationId - Organization ID
 * @param cancelledBy - User who cancelled
 * @param transferId - Transfer ID
 * @returns Success or error
 */
export async function logOwnershipTransferCancelled(
  organizationId: string,
  cancelledBy: string,
  transferId: string
): Promise<{ success: boolean; error?: string }> {
  return logTeamActivity(
    organizationId,
    cancelledBy,
    'ownership_transfer_cancelled',
    {
      transfer_id: transferId,
    }
  );
}

// ============================================================================
// Activity Queries
// ============================================================================

/**
 * Gets team activity log with optional filters
 *
 * @param organizationId - Organization ID
 * @param filters - Optional filters
 * @returns Activity log entries
 */
export async function getTeamActivity(
  organizationId: string,
  filters?: ActivityLogFilters
): Promise<{ success: true; activities: TeamActivityLog[]; total: number } | { success: false; error: string }> {
  try {
    const supabase = await createClient();

    let query = supabase
      .from('team_activity_log')
      .select(`
        *,
        user:users!team_activity_log_user_id_fkey (id, full_name, email),
        target_user:users!team_activity_log_target_user_id_fkey (id, full_name, email)
      `, { count: 'exact' })
      .eq('organization_id', organizationId);

    // Apply filters
    if (filters?.action) {
      if (Array.isArray(filters.action)) {
        query = query.in('action', filters.action);
      } else {
        query = query.eq('action', filters.action);
      }
    }

    if (filters?.user_id) {
      query = query.eq('user_id', filters.user_id);
    }

    if (filters?.target_user_id) {
      query = query.eq('target_user_id', filters.target_user_id);
    }

    if (filters?.start_date) {
      query = query.gte('created_at', filters.start_date.toISOString());
    }

    if (filters?.end_date) {
      query = query.lte('created_at', filters.end_date.toISOString());
    }

    // Order by most recent first
    query = query.order('created_at', { ascending: false });

    // Pagination
    if (filters?.limit) {
      query = query.limit(filters.limit);
    }
    if (filters?.offset) {
      query = query.range(
        filters.offset,
        filters.offset + (filters.limit || 10) - 1
      );
    }

    const { data: activities, error, count } = await query;

    if (error) {
      console.error('Error fetching team activity:', error);
      return { success: false, error: 'Failed to fetch activity log' };
    }

    return {
      success: true,
      activities: activities as TeamActivityLog[],
      total: count || 0,
    };
  } catch (error) {
    console.error('Error getting team activity:', error);
    return { success: false, error: 'Failed to get activity log' };
  }
}

/**
 * Gets recent activity for a specific user (actions they performed)
 *
 * @param organizationId - Organization ID
 * @param userId - User ID
 * @param limit - Number of activities to return
 * @returns Recent activities
 */
export async function getUserActions(
  organizationId: string,
  userId: string,
  limit: number = 10
): Promise<{ success: true; activities: TeamActivityLog[] } | { success: false; error: string }> {
  const result = await getTeamActivity(organizationId, {
    user_id: userId,
    limit,
  });

  if (!result.success) {
    return result;
  }

  return { success: true, activities: result.activities };
}

/**
 * Gets activity related to a specific user (actions performed on them)
 *
 * @param organizationId - Organization ID
 * @param userId - User ID
 * @param limit - Number of activities to return
 * @returns Activities related to user
 */
export async function getTeamActivityForUser(
  organizationId: string,
  userId: string,
  limit: number = 10
): Promise<{ success: true; activities: TeamActivityLog[] } | { success: false; error: string }> {
  const result = await getTeamActivity(organizationId, {
    target_user_id: userId,
    limit,
  });

  if (!result.success) {
    return result;
  }

  return { success: true, activities: result.activities };
}

/**
 * Gets recent team activity (last 30 days)
 *
 * @param organizationId - Organization ID
 * @param limit - Number of activities to return
 * @returns Recent activities
 */
export async function getRecentTeamActivity(
  organizationId: string,
  limit: number = 50
): Promise<{ success: true; activities: TeamActivityLog[] } | { success: false; error: string }> {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const result = await getTeamActivity(organizationId, {
    start_date: thirtyDaysAgo,
    limit,
  });

  if (!result.success) {
    return result;
  }

  return { success: true, activities: result.activities };
}

// ============================================================================
// Activity Description
// ============================================================================

/**
 * Generates a human-readable description for an activity
 *
 * @param activity - Activity log entry
 * @returns Human-readable description
 */
export function getActivityDescription(activity: TeamActivityLog): string {
  const userName = activity.user?.full_name || 'User';
  const targetUserName = activity.target_user?.full_name || 'User';

  switch (activity.action) {
    case 'user_invited':
      return `${userName} invited ${activity.details.email} as ${activity.details.new_role}`;

    case 'invitation_resent':
      return `${userName} resent invitation to ${activity.details.email}`;

    case 'invitation_cancelled':
      return `${userName} cancelled invitation for ${activity.details.email}`;

    case 'invitation_accepted':
      return `${userName} accepted invitation and joined as ${activity.details.new_role}`;

    case 'invitation_declined':
      return `${userName} declined invitation`;

    case 'invitation_expired':
      return `Invitation to ${activity.details.email} expired`;

    case 'role_changed':
      return `${userName} changed ${targetUserName}'s role from ${activity.details.old_role} to ${activity.details.new_role}`;

    case 'user_removed':
      return `${userName} removed ${targetUserName} (${activity.details.old_role})`;

    case 'user_reactivated':
      return `${userName} reactivated ${targetUserName}`;

    case 'ownership_transfer_initiated':
      return `${userName} initiated ownership transfer to ${targetUserName}`;

    case 'ownership_transfer_confirmed':
      return `${userName} confirmed ownership transfer from ${targetUserName}`;

    case 'ownership_transfer_cancelled':
      return `${userName} cancelled ownership transfer`;

    default:
      return `${userName} performed ${activity.action}`;
  }
}

/**
 * Gets activity summary for a time period
 *
 * @param organizationId - Organization ID
 * @param startDate - Start date
 * @param endDate - End date
 * @returns Activity summary
 */
export async function getActivitySummary(
  organizationId: string,
  startDate: Date,
  endDate: Date
): Promise<{
  success: true;
  summary: {
    total_actions: number;
    invitations_sent: number;
    invitations_accepted: number;
    role_changes: number;
    members_removed: number;
    members_reactivated: number;
  };
} | { success: false; error: string }> {
  try {
    const result = await getTeamActivity(organizationId, {
      start_date: startDate,
      end_date: endDate,
    });

    if (!result.success) {
      return result;
    }

    const activities = result.activities;

    const summary = {
      total_actions: activities.length,
      invitations_sent: activities.filter((a) => a.action === 'user_invited').length,
      invitations_accepted: activities.filter((a) => a.action === 'invitation_accepted').length,
      role_changes: activities.filter((a) => a.action === 'role_changed').length,
      members_removed: activities.filter((a) => a.action === 'user_removed').length,
      members_reactivated: activities.filter((a) => a.action === 'user_reactivated').length,
    };

    return { success: true, summary };
  } catch (error) {
    console.error('Error getting activity summary:', error);
    return { success: false, error: 'Failed to get activity summary' };
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Gets client information (IP address and user agent)
 *
 * @returns Client info
 */
function getClientInfo(): { ipAddress: string | null; userAgent: string | null } {
  // In a real Next.js app, you would get this from headers
  // For now, return null values
  // In server components/actions:
  // const headers = require('next/headers');
  // const headersList = headers();
  // const ipAddress = headersList.get('x-forwarded-for') || headersList.get('x-real-ip');
  // const userAgent = headersList.get('user-agent');

  return {
    ipAddress: null,
    userAgent: null,
  };
}

/**
 * Exports activity log to CSV format
 *
 * @param activities - Activity log entries
 * @returns CSV string
 */
export function exportActivityLogToCSV(activities: TeamActivityLog[]): string {
  const headers = [
    'Date',
    'Time',
    'User',
    'Action',
    'Target User',
    'Details',
    'IP Address',
  ];

  const rows = activities.map((activity) => {
    const date = new Date(activity.created_at);
    return [
      date.toLocaleDateString(),
      date.toLocaleTimeString(),
      activity.user?.full_name || 'Unknown',
      activity.action,
      activity.target_user?.full_name || '-',
      JSON.stringify(activity.details),
      activity.ip_address || '-',
    ].map((cell) => `"${cell}"`).join(',');
  });

  return [headers.join(','), ...rows].join('\n');
}
