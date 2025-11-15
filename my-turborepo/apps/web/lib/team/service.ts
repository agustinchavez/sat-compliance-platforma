/**
 * Team Management Service
 *
 * This is the main service file that provides high-level team management
 * operations including member management, role changes, and statistics.
 */

import { createClient } from '@/lib/supabase/server';
import type {
  TeamMember,
  TeamMemberFilters,
  TeamStats,
  RoleChangeRequest,
  RoleChangeResult,
  RemovalValidationResult,
} from './types';
import type { Role } from '@/lib/rbac/types';
import {
  canRemoveUser,
  validateUserRemoval,
  validateRoleAssignment,
} from './validation';
import {
  sendRoleChangeNotification,
  sendRemovalNotification,
} from './notifications';

// ============================================================================
// Team Member Queries
// ============================================================================

/**
 * Gets all team members for an organization with optional filters
 *
 * @param organizationId - Organization ID
 * @param filters - Optional filters
 * @returns List of team members
 */
export async function getTeamMembers(
  organizationId: string,
  filters?: TeamMemberFilters
): Promise<{ success: true; members: TeamMember[]; total: number } | { success: false; error: string }> {
  try {
    const supabase = await createClient();

    // Query organization_members with joined user data
    let query = supabase
      .from('organization_members')
      .select(`
        id,
        user_id,
        organization_id,
        role,
        invited_by,
        created_at,
        updated_at,
        deleted_at,
        user:users!user_id (
          id,
          email,
          full_name,
          email_verified,
          phone,
          last_login_at
        )
      `, { count: 'exact' })
      .eq('organization_id', organizationId);

    // Apply filters
    if (!filters?.includeInactive) {
      query = query.is('deleted_at', null);
    }

    if (filters?.role) {
      if (Array.isArray(filters.role)) {
        query = query.in('role', filters.role);
      } else {
        query = query.eq('role', filters.role);
      }
    }

    if (filters?.status) {
      if (Array.isArray(filters.status)) {
        // Map status to database conditions
        filters.status.forEach((status) => {
          if (status === 'active') {
            query = query.is('deleted_at', null);
          } else if (status === 'inactive') {
            query = query.not('deleted_at', 'is', null);
          }
        });
      } else {
        if (filters.status === 'active') {
          query = query.is('deleted_at', null);
        } else if (filters.status === 'inactive') {
          query = query.not('deleted_at', 'is', null);
        }
      }
    }

    if (filters?.search) {
      const searchTerm = `%${filters.search}%`;
      // Search in the joined user table
      query = query.or(`user.full_name.ilike.${searchTerm},user.email.ilike.${searchTerm}`);
    }

    // Sorting
    const sortBy = filters?.sortBy || 'created_at';
    const sortOrder = filters?.sortOrder || 'desc';
    query = query.order(sortBy, { ascending: sortOrder === 'asc' });

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

    const { data: orgMembers, error, count } = await query;

    if (error) {
      console.error('Error fetching team members:', error);
      return { success: false, error: 'Failed to fetch team members' };
    }

    // Transform organization_members data to TeamMember format
    const members: TeamMember[] = (orgMembers || []).map((om: any) => {
      const user = Array.isArray(om.user) ? om.user[0] : om.user;
      return {
        id: user?.id || om.user_id,
        email: user?.email || '',
        full_name: user?.full_name || '',
        role: om.role,
        status: om.deleted_at ? 'inactive' : 'active',
        email_verified: user?.email_verified || false,
        phone: user?.phone || null,
        last_login_at: user?.last_login_at ? new Date(user.last_login_at) : null,
        joined_at: new Date(om.created_at),
        invited_by: om.invited_by,
        created_at: new Date(om.created_at),
        updated_at: new Date(om.updated_at),
        deleted_at: om.deleted_at ? new Date(om.deleted_at) : null,
      };
    });

    return {
      success: true,
      members,
      total: count || 0,
    };
  } catch (error) {
    console.error('Error getting team members:', error);
    return { success: false, error: 'Failed to get team members' };
  }
}

/**
 * Gets a single team member by ID
 *
 * @param userId - User ID
 * @param organizationId - Organization ID
 * @returns Team member details
 */
export async function getTeamMember(
  userId: string,
  organizationId: string
): Promise<{ success: true; member: TeamMember } | { success: false; error: string }> {
  try {
    const supabase = await createClient();

    const { data: orgMember, error } = await supabase
      .from('organization_members')
      .select(`
        id,
        user_id,
        organization_id,
        role,
        invited_by,
        created_at,
        updated_at,
        deleted_at,
        user:users!user_id (
          id,
          email,
          full_name,
          email_verified,
          phone,
          last_login_at
        )
      `)
      .eq('user_id', userId)
      .eq('organization_id', organizationId)
      .single();

    if (error || !orgMember) {
      return { success: false, error: 'Team member not found' };
    }

    // Transform to TeamMember format
    const user = Array.isArray(orgMember.user) ? orgMember.user[0] : orgMember.user;
    const member: TeamMember = {
      id: user?.id || orgMember.user_id,
      email: user?.email || '',
      full_name: user?.full_name || '',
      role: orgMember.role,
      status: orgMember.deleted_at ? 'inactive' : 'active',
      email_verified: user?.email_verified || false,
      phone: user?.phone || null,
      last_login_at: user?.last_login_at ? new Date(user.last_login_at) : null,
      joined_at: new Date(orgMember.created_at),
      invited_by: orgMember.invited_by,
      created_at: new Date(orgMember.created_at),
      updated_at: new Date(orgMember.updated_at),
      deleted_at: orgMember.deleted_at ? new Date(orgMember.deleted_at) : null,
    };

    return { success: true, member };
  } catch (error) {
    console.error('Error getting team member:', error);
    return { success: false, error: 'Failed to get team member' };
  }
}

// ============================================================================
// Role Management
// ============================================================================

/**
 * Updates a team member's role
 *
 * @param request - Role change request
 * @returns Role change result
 */
export async function updateTeamMemberRole(
  request: RoleChangeRequest
): Promise<RoleChangeResult> {
  try {
    const supabase = await createClient();

    // 1. Determine which organization this request is for
    // Get the changer's memberships to find the org context
    const { data: changerMemberships } = await supabase
      .from('organization_members')
      .select('organization_id, role')
      .eq('user_id', request.changed_by)
      .is('deleted_at', null);

    if (!changerMemberships || changerMemberships.length === 0) {
      return {
        success: false,
        user_id: request.user_id,
        old_role: request.old_role,
        new_role: request.new_role,
        message: 'Changer not found in any organization',
        error: 'USER_NOT_FOUND',
      };
    }

    // For now, use the first org (in a real app, this would come from context/session)
    const organizationId = changerMemberships[0].organization_id;
    const changerRole = changerMemberships[0].role;

    // 2. Get target user's membership in this organization
    const { data: targetMembership } = await supabase
      .from('organization_members')
      .select('id, role, user_id')
      .eq('user_id', request.user_id)
      .eq('organization_id', organizationId)
      .is('deleted_at', null)
      .single();

    if (!targetMembership) {
      return {
        success: false,
        user_id: request.user_id,
        old_role: request.old_role,
        new_role: request.new_role,
        message: 'User not found in organization',
        error: 'USER_NOT_FOUND',
      };
    }

    // 3. Prevent self-demotion
    if (request.user_id === request.changed_by) {
      return {
        success: false,
        user_id: request.user_id,
        old_role: request.old_role,
        new_role: request.new_role,
        message: 'Cannot change your own role',
        error: 'CANNOT_DEMOTE_SELF',
      };
    }

    // 4. Validate role assignment
    const validation = validateRoleAssignment(
      request.new_role,
      changerRole as Role
    );

    if (!validation.valid) {
      return {
        success: false,
        user_id: request.user_id,
        old_role: request.old_role,
        new_role: request.new_role,
        message: validation.errors.join(', '),
        error: 'INSUFFICIENT_PERMISSIONS',
      };
    }

    // 5. Update role in organization_members
    const { error: updateError } = await supabase
      .from('organization_members')
      .update({
        role: request.new_role,
        updated_at: new Date().toISOString(),
      })
      .eq('id', targetMembership.id);

    if (updateError) {
      console.error('Error updating role:', updateError);
      return {
        success: false,
        user_id: request.user_id,
        old_role: request.old_role,
        new_role: request.new_role,
        message: 'Failed to update role',
        error: 'UPDATE_FAILED',
      };
    }

    // 6. Send notification email - get user details first
    const { data: targetUser } = await supabase
      .from('users')
      .select('email, full_name')
      .eq('id', request.user_id)
      .single();

    const { data: changerUser } = await supabase
      .from('users')
      .select('full_name')
      .eq('id', request.changed_by)
      .single();

    const { data: organization } = await supabase
      .from('organizations')
      .select('name')
      .eq('id', organizationId)
      .single();

    if (organization && targetUser && changerUser) {
      await sendRoleChangeNotification({
        to_email: targetUser.email,
        to_name: targetUser.full_name,
        organization_name: organization.name,
        old_role: request.old_role,
        new_role: request.new_role,
        old_role_display_name: getRoleDisplayName(request.old_role),
        new_role_display_name: getRoleDisplayName(request.new_role),
        changed_by_name: changerUser.full_name,
      });
    }

    return {
      success: true,
      user_id: request.user_id,
      old_role: request.old_role,
      new_role: request.new_role,
      message: 'Role updated successfully',
    };
  } catch (error) {
    console.error('Error updating team member role:', error);
    return {
      success: false,
      user_id: request.user_id,
      old_role: request.old_role,
      new_role: request.new_role,
      message: 'Failed to update role',
      error: 'INTERNAL_ERROR',
    };
  }
}

// ============================================================================
// Team Member Removal
// ============================================================================

/**
 * Removes a team member (soft delete)
 *
 * @param organizationId - Organization ID
 * @param userId - User ID to remove
 * @param removedBy - User ID performing removal
 * @param reason - Optional reason for removal
 * @returns Success or error
 */
export async function removeTeamMember(
  organizationId: string,
  userId: string,
  removedBy: string,
  reason?: string
): Promise<{ success: true } | { success: false; error: string }> {
  try {
    // 1. Validate removal
    const validation = await validateUserRemoval(organizationId, userId, removedBy);

    if (!validation.can_remove) {
      return {
        success: false,
        error: validation.reasons.join(', '),
      };
    }

    const supabase = await createClient();

    // 2. Get membership and user details for notification
    const { data: membership } = await supabase
      .from('organization_members')
      .select('id, role')
      .eq('user_id', userId)
      .eq('organization_id', organizationId)
      .is('deleted_at', null)
      .single();

    if (!membership) {
      return { success: false, error: 'User is not a member of this organization' };
    }

    const { data: user } = await supabase
      .from('users')
      .select('full_name, email')
      .eq('id', userId)
      .single();

    const { data: remover } = await supabase
      .from('users')
      .select('full_name')
      .eq('id', removedBy)
      .single();

    const { data: organization } = await supabase
      .from('organizations')
      .select('name, email')
      .eq('id', organizationId)
      .single();

    // 3. Soft delete membership (not the user!)
    const { error: deleteError } = await supabase
      .from('organization_members')
      .update({
        deleted_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', membership.id);

    if (deleteError) {
      console.error('Error removing team member:', deleteError);
      return { success: false, error: 'Failed to remove team member' };
    }

    // 4. Send notification email
    if (user && remover && organization) {
      await sendRemovalNotification({
        to_email: user.email,
        to_name: user.full_name,
        organization_name: organization.name,
        organization_email: organization.email || 'support@example.com',
        removed_by_name: remover.full_name,
        reason,
      });
    }

    return { success: true };
  } catch (error) {
    console.error('Error removing team member:', error);
    return { success: false, error: 'Failed to remove team member' };
  }
}

/**
 * Reactivates a removed team member
 *
 * @param organizationId - Organization ID
 * @param userId - User ID to reactivate
 * @param reactivatedBy - User ID performing reactivation
 * @returns Success or error
 */
export async function reactivateTeamMember(
  organizationId: string,
  userId: string,
  reactivatedBy: string
): Promise<{ success: true } | { success: false; error: string }> {
  try {
    const supabase = await createClient();

    // 1. Verify reactivator has permission (owner or admin)
    const { data: reactivatorMembership } = await supabase
      .from('organization_members')
      .select('role')
      .eq('user_id', reactivatedBy)
      .eq('organization_id', organizationId)
      .is('deleted_at', null)
      .single();

    if (!reactivatorMembership || !['owner', 'admin'].includes(reactivatorMembership.role)) {
      return { success: false, error: 'Not authorized to reactivate members' };
    }

    // 2. Check if membership exists and is deleted
    const { data: membership } = await supabase
      .from('organization_members')
      .select('id, deleted_at')
      .eq('user_id', userId)
      .eq('organization_id', organizationId)
      .single();

    if (!membership) {
      return { success: false, error: 'User was never a member of this organization' };
    }

    if (!membership.deleted_at) {
      return { success: false, error: 'User is already active' };
    }

    // 3. Reactivate membership
    const { error: reactivateError } = await supabase
      .from('organization_members')
      .update({
        deleted_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', membership.id);

    if (reactivateError) {
      console.error('Error reactivating team member:', reactivateError);
      return { success: false, error: 'Failed to reactivate team member' };
    }

    return { success: true };
  } catch (error) {
    console.error('Error reactivating team member:', error);
    return { success: false, error: 'Failed to reactivate team member' };
  }
}

// ============================================================================
// Team Statistics
// ============================================================================

/**
 * Gets team statistics for an organization
 *
 * @param organizationId - Organization ID
 * @returns Team statistics
 */
export async function getTeamStats(
  organizationId: string
): Promise<{ success: true; stats: TeamStats } | { success: false; error: string }> {
  try {
    const supabase = await createClient();

    // Use the database view for statistics
    const { data: viewStats, error: viewError } = await supabase
      .from('team_stats_by_org')
      .select('*')
      .eq('organization_id', organizationId)
      .single();

    if (viewError) {
      console.error('Error fetching team stats from view:', viewError);
      // Fallback to manual calculation
      return calculateTeamStatsManually(organizationId);
    }

    const stats: TeamStats = {
      total: viewStats.total_active_members + viewStats.total_inactive_members,
      active: viewStats.total_active_members,
      inactive: viewStats.total_inactive_members,
      pending_invitations: viewStats.pending_invitations,
      by_role: {
        owner: viewStats.owner_count,
        admin: viewStats.admin_count,
        accountant: viewStats.accountant_count,
        user: viewStats.user_count,
      },
      recent_additions: viewStats.recent_additions,
      recent_removals: viewStats.recent_removals,
      average_team_size_change: 0, // Would need historical data
    };

    return { success: true, stats };
  } catch (error) {
    console.error('Error getting team stats:', error);
    return { success: false, error: 'Failed to get team statistics' };
  }
}

/**
 * Manually calculates team statistics (fallback)
 *
 * @param organizationId - Organization ID
 * @returns Team statistics
 */
async function calculateTeamStatsManually(
  organizationId: string
): Promise<{ success: true; stats: TeamStats } | { success: false; error: string }> {
  try {
    const supabase = await createClient();

    // Get all users
    const { data: users, error: usersError } = await supabase
      .from('users')
      .select('role, deleted_at, created_at')
      .eq('organization_id', organizationId);

    if (usersError || !users) {
      return { success: false, error: 'Failed to calculate statistics' };
    }

    // Get pending invitations
    const { count: pendingCount } = await supabase
      .from('invitations')
      .select('*', { count: 'exact', head: true })
      .eq('organization_id', organizationId)
      .eq('status', 'pending');

    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const active = users.filter((u) => !u.deleted_at);
    const inactive = users.filter((u) => u.deleted_at);

    const stats: TeamStats = {
      total: users.length,
      active: active.length,
      inactive: inactive.length,
      pending_invitations: pendingCount || 0,
      by_role: {
        owner: active.filter((u) => u.role === 'owner').length,
        admin: active.filter((u) => u.role === 'admin').length,
        accountant: active.filter((u) => u.role === 'accountant').length,
        user: active.filter((u) => u.role === 'user').length,
      },
      recent_additions: active.filter(
        (u) => new Date(u.created_at) >= thirtyDaysAgo
      ).length,
      recent_removals: inactive.filter(
        (u) => u.deleted_at && new Date(u.deleted_at) >= thirtyDaysAgo
      ).length,
      average_team_size_change: 0,
    };

    return { success: true, stats };
  } catch (error) {
    console.error('Error calculating team stats manually:', error);
    return { success: false, error: 'Failed to calculate statistics' };
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Gets display name for role
 *
 * @param role - Role enum
 * @returns Display name
 */
function getRoleDisplayName(role: Role): string {
  const displayNames: Record<Role, string> = {
    owner: 'Owner',
    admin: 'Administrator',
    accountant: 'Accountant',
    user: 'User',
  };
  return displayNames[role] || role;
}

/**
 * Validates if user can perform team management action
 *
 * @param userId - User ID
 * @param organizationId - Organization ID
 * @param requiredRole - Minimum required role
 * @returns True if authorized
 */
export async function canManageTeam(
  userId: string,
  organizationId: string,
  requiredRole: Role = 'admin'
): Promise<boolean> {
  try {
    const supabase = await createClient();

    const { data: membership } = await supabase
      .from('organization_members')
      .select('role')
      .eq('user_id', userId)
      .eq('organization_id', organizationId)
      .is('deleted_at', null)
      .single();

    if (!membership) {
      return false;
    }

    const roleHierarchy: Record<Role, number> = {
      owner: 4,
      admin: 3,
      accountant: 2,
      user: 1,
    };

    return roleHierarchy[membership.role as Role] >= roleHierarchy[requiredRole];
  } catch (error) {
    console.error('Error checking team management permission:', error);
    return false;
  }
}
