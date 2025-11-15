/**
 * Team Invitation Management
 *
 * This file handles all invitation-related operations including sending,
 * resending, cancelling, and accepting invitations. It integrates with
 * email notifications and rate limiting.
 */

import { createClient } from '@/lib/supabase/server';
import { randomBytes } from 'crypto';
import type {
  Invitation,
  InvitationCreateData,
  InvitationAcceptanceData,
  InvitationPublic,
  InvitationStatus,
  RateLimitResult,
} from './types';
import type { Role } from '@/lib/rbac/types';
import {
  validateInvitationEmail,
  validateRoleAssignment,
  isValidTokenFormat,
} from './validation';
import {
  sendInvitationEmail,
  sendInvitationReminder,
  sendWelcomeEmail,
  notifyTeamMemberAdded,
} from './notifications';
import { INVITATION_SETTINGS } from './types';

// ============================================================================
// Constants
// ============================================================================

const TOKEN_LENGTH = 32; // 32 bytes = 256 bits
const DEFAULT_EXPIRY_DAYS = INVITATION_SETTINGS.EXPIRY_DAYS;

// ============================================================================
// Token Generation
// ============================================================================

/**
 * Generates a cryptographically secure random token for invitations
 *
 * @returns Base64url-encoded random token
 */
export function generateInvitationToken(): string {
  return randomBytes(TOKEN_LENGTH)
    .toString('base64url')
    .replace(/[+/=]/g, ''); // Extra safety to ensure url-safe
}

/**
 * Calculates invitation expiry date
 *
 * @param days - Number of days until expiry (default: 7)
 * @returns Expiry date
 */
export function getInvitationExpiryDate(days: number = DEFAULT_EXPIRY_DAYS): Date {
  const expiry = new Date();
  expiry.setDate(expiry.getDate() + days);
  return expiry;
}

/**
 * Checks if invitation is expired
 *
 * @param expiresAt - Expiry timestamp
 * @returns True if expired
 */
export function isInvitationExpired(expiresAt: Date): boolean {
  return new Date() > new Date(expiresAt);
}

// ============================================================================
// Rate Limiting
// ============================================================================

/**
 * Checks rate limits for invitation creation
 *
 * @param organizationId - Organization ID
 * @param invitedBy - User ID sending invitation
 * @param email - Email being invited
 * @returns Rate limit result
 */
async function checkInvitationRateLimits(
  organizationId: string,
  invitedBy: string,
  email: string
): Promise<RateLimitResult> {
  // Note: This is a basic implementation. In production, use Redis with sliding windows
  // For now, we'll check database counts as a simple rate limit

  const supabase = await createClient();
  const now = new Date();
  const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  // Check org limit (50/day)
  const { count: orgCount } = await supabase
    .from('invitations')
    .select('*', { count: 'exact', head: true })
    .eq('organization_id', organizationId)
    .gte('created_at', dayAgo.toISOString());

  if (orgCount && orgCount >= 50) {
    return {
      allowed: false,
      limit: 50,
      remaining: 0,
      reset_at: new Date(now.getTime() + 24 * 60 * 60 * 1000),
      error: 'Organization has reached daily invitation limit (50)',
    };
  }

  // Check user limit (20/day)
  const { count: userCount } = await supabase
    .from('invitations')
    .select('*', { count: 'exact', head: true })
    .eq('invited_by', invitedBy)
    .gte('created_at', dayAgo.toISOString());

  if (userCount && userCount >= 20) {
    return {
      allowed: false,
      limit: 20,
      remaining: 0,
      reset_at: new Date(now.getTime() + 24 * 60 * 60 * 1000),
      error: 'User has reached daily invitation limit (20)',
    };
  }

  // Check email limit (3 total per org)
  const { count: emailCount } = await supabase
    .from('invitations')
    .select('*', { count: 'exact', head: true })
    .eq('organization_id', organizationId)
    .eq('email', email.toLowerCase());

  if (emailCount && emailCount >= 3) {
    return {
      allowed: false,
      limit: 3,
      remaining: 0,
      reset_at: new Date(now.getTime() + 24 * 60 * 60 * 1000),
      error: 'This email has been invited too many times',
    };
  }

  return {
    allowed: true,
    limit: 50,
    remaining: 50 - (orgCount || 0),
    reset_at: new Date(now.getTime() + 24 * 60 * 60 * 1000),
  };
}

// ============================================================================
// Invitation Creation
// ============================================================================

/**
 * Invites a user to join an organization
 *
 * @param organizationId - Organization ID
 * @param invitedBy - User ID sending invitation
 * @param data - Invitation data (email, role, message)
 * @returns Created invitation or error
 */
export async function inviteUser(
  organizationId: string,
  invitedBy: string,
  data: InvitationCreateData
): Promise<{ success: true; invitation: Invitation } | { success: false; error: string }> {
  try {
    const supabase = await createClient();

    // 1. Normalize email
    const normalizedEmail = data.email.trim().toLowerCase();

    // 2. Validate email
    const emailValidation = await validateInvitationEmail(normalizedEmail, organizationId);
    if (!emailValidation.valid) {
      return { success: false, error: emailValidation.errors.join(', ') };
    }

    // 3. Get inviter details
    const { data: inviter } = await supabase
      .from('users')
      .select('id, full_name, email, role')
      .eq('id', invitedBy)
      .eq('organization_id', organizationId)
      .is('deleted_at', null)
      .single();

    if (!inviter) {
      return { success: false, error: 'Inviter not found or not authorized' };
    }

    // 4. Validate role assignment
    const roleValidation = validateRoleAssignment(data.role, inviter.role as Role);
    if (!roleValidation.valid) {
      return { success: false, error: roleValidation.errors.join(', ') };
    }

    // 5. Check rate limits
    const rateLimitCheck = await checkInvitationRateLimits(
      organizationId,
      invitedBy,
      normalizedEmail
    );
    if (!rateLimitCheck.allowed) {
      return { success: false, error: rateLimitCheck.error || 'Rate limit exceeded' };
    }

    // 6. Get organization details
    const { data: organization } = await supabase
      .from('organizations')
      .select('id, name, legal_name')
      .eq('id', organizationId)
      .is('deleted_at', null)
      .single();

    if (!organization) {
      return { success: false, error: 'Organization not found' };
    }

    // 7. Generate token and expiry
    const token = generateInvitationToken();
    const expiresAt = getInvitationExpiryDate();

    // 8. Create invitation
    const { data: invitation, error: insertError } = await supabase
      .from('invitations')
      .insert({
        organization_id: organizationId,
        email: normalizedEmail,
        role: data.role,
        token,
        status: 'pending',
        message: data.message || null,
        invited_by: invitedBy,
        expires_at: expiresAt.toISOString(),
      })
      .select()
      .single();

    if (insertError || !invitation) {
      console.error('Error creating invitation:', insertError);
      return { success: false, error: 'Failed to create invitation' };
    }

    // 9. Send invitation email
    const invitationUrl = `${process.env.NEXT_PUBLIC_APP_URL}/accept-invitation?token=${token}`;

    const emailResult = await sendInvitationEmail({
      to_email: normalizedEmail,
      organization_name: organization.name,
      organization_legal_name: organization.legal_name,
      inviter_name: inviter.full_name,
      role: data.role,
      role_display_name: getRoleDisplayName(data.role),
      invitation_url: invitationUrl,
      custom_message: data.message,
      expires_at: expiresAt,
    });

    if (!emailResult.success) {
      console.error('Failed to send invitation email:', emailResult.error);
      // Don't fail the invitation, just log the error
    }

    return { success: true, invitation: invitation as Invitation };
  } catch (error) {
    console.error('Error inviting user:', error);
    return { success: false, error: 'Failed to invite user' };
  }
}

// ============================================================================
// Invitation Resending
// ============================================================================

/**
 * Resends an invitation with a new token
 *
 * @param invitationId - Invitation ID
 * @param resentBy - User ID resending invitation
 * @returns Success or error
 */
export async function resendInvitation(
  invitationId: string,
  resentBy: string
): Promise<{ success: true } | { success: false; error: string }> {
  try {
    const supabase = await createClient();

    // 1. Get invitation
    const { data: invitation } = await supabase
      .from('invitations')
      .select(`
        *,
        organizations (id, name, legal_name),
        invited_by_user:users!invitations_invited_by_fkey (id, full_name, email)
      `)
      .eq('id', invitationId)
      .single();

    if (!invitation) {
      return { success: false, error: 'Invitation not found' };
    }

    // 2. Verify status
    if (invitation.status !== 'pending') {
      return { success: false, error: `Cannot resend ${invitation.status} invitation` };
    }

    // 3. Check if expired (will generate new token anyway)
    // No need to block resend if expired, just update it

    // 4. Verify resender has permission
    const { data: resender } = await supabase
      .from('users')
      .select('id, role')
      .eq('id', resentBy)
      .eq('organization_id', invitation.organization_id)
      .is('deleted_at', null)
      .single();

    if (!resender || !['owner', 'admin'].includes(resender.role)) {
      return { success: false, error: 'Not authorized to resend invitation' };
    }

    // 5. Generate new token and expiry
    const newToken = generateInvitationToken();
    const newExpiresAt = getInvitationExpiryDate();

    // 6. Update invitation
    const { error: updateError } = await supabase
      .from('invitations')
      .update({
        token: newToken,
        expires_at: newExpiresAt.toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', invitationId);

    if (updateError) {
      console.error('Error updating invitation:', updateError);
      return { success: false, error: 'Failed to update invitation' };
    }

    // 7. Send reminder email
    // Update the invitation object with new token and expiry
    const updatedInvitation: Invitation = {
      ...invitation,
      token: newToken,
      expires_at: newExpiresAt,
      organization: Array.isArray(invitation.organizations)
        ? invitation.organizations[0]
        : invitation.organizations,
      inviter: Array.isArray(invitation.invited_by_user)
        ? invitation.invited_by_user[0]
        : invitation.invited_by_user,
    } as Invitation;

    const emailResult = await sendInvitationReminder(updatedInvitation);

    if (!emailResult.success) {
      console.error('Failed to send invitation reminder:', emailResult.error);
    }

    return { success: true };
  } catch (error) {
    console.error('Error resending invitation:', error);
    return { success: false, error: 'Failed to resend invitation' };
  }
}

// ============================================================================
// Invitation Cancellation
// ============================================================================

/**
 * Cancels a pending invitation
 *
 * @param invitationId - Invitation ID
 * @param cancelledBy - User ID cancelling invitation
 * @returns Success or error
 */
export async function cancelInvitation(
  invitationId: string,
  cancelledBy: string
): Promise<{ success: true } | { success: false; error: string }> {
  try {
    const supabase = await createClient();

    // 1. Get invitation
    const { data: invitation } = await supabase
      .from('invitations')
      .select('*, organization_id')
      .eq('id', invitationId)
      .single();

    if (!invitation) {
      return { success: false, error: 'Invitation not found' };
    }

    // 2. Verify status
    if (invitation.status !== 'pending') {
      return { success: false, error: `Cannot cancel ${invitation.status} invitation` };
    }

    // 3. Verify canceller has permission
    const { data: canceller } = await supabase
      .from('users')
      .select('id, role')
      .eq('id', cancelledBy)
      .eq('organization_id', invitation.organization_id)
      .is('deleted_at', null)
      .single();

    if (!canceller || !['owner', 'admin'].includes(canceller.role)) {
      return { success: false, error: 'Not authorized to cancel invitation' };
    }

    // 4. Update invitation status
    const { error: updateError } = await supabase
      .from('invitations')
      .update({
        status: 'cancelled',
        updated_at: new Date().toISOString(),
      })
      .eq('id', invitationId);

    if (updateError) {
      console.error('Error cancelling invitation:', updateError);
      return { success: false, error: 'Failed to cancel invitation' };
    }

    return { success: true };
  } catch (error) {
    console.error('Error cancelling invitation:', error);
    return { success: false, error: 'Failed to cancel invitation' };
  }
}

// ============================================================================
// Invitation Validation
// ============================================================================

/**
 * Validates an invitation token and retrieves invitation details
 *
 * @param token - Invitation token
 * @returns Public invitation details or error
 */
export async function validateInvitationToken(
  token: string
): Promise<{ valid: true; invitation: InvitationPublic } | { valid: false; error: string }> {
  try {
    // 1. Validate token format
    if (!isValidTokenFormat(token)) {
      return { valid: false, error: 'Invalid token format' };
    }

    const supabase = await createClient();

    // 2. Get invitation
    const { data: invitation } = await supabase
      .from('invitations')
      .select(`
        id,
        email,
        role,
        message,
        expires_at,
        created_at,
        status,
        organizations (id, name, legal_name),
        invited_by_user:users!invitations_invited_by_fkey (full_name, email)
      `)
      .eq('token', token)
      .single();

    if (!invitation) {
      return { valid: false, error: 'Invitation not found' };
    }

    // 3. Check status
    if (invitation.status === 'accepted') {
      return { valid: false, error: 'This invitation has already been accepted' };
    }

    if (invitation.status === 'cancelled') {
      return { valid: false, error: 'This invitation has been cancelled' };
    }

    if (invitation.status === 'expired') {
      return { valid: false, error: 'This invitation has expired' };
    }

    // 4. Check expiry
    if (isInvitationExpired(invitation.expires_at)) {
      // Mark as expired
      await supabase
        .from('invitations')
        .update({ status: 'expired', updated_at: new Date().toISOString() })
        .eq('id', invitation.id);

      return { valid: false, error: 'This invitation has expired' };
    }

    // 5. Return public invitation details
    const org = Array.isArray(invitation.organizations)
      ? invitation.organizations[0]
      : invitation.organizations;
    const inviter = Array.isArray(invitation.invited_by_user)
      ? invitation.invited_by_user[0]
      : invitation.invited_by_user;

    if (!org || !inviter) {
      return { valid: false, error: 'Invalid invitation data' };
    }

    const publicInvitation: InvitationPublic & { email: string } = {
      id: invitation.id,
      email: invitation.email, // Include invitee's email
      organization: {
        id: org.id,
        name: org.name,
        legal_name: org.legal_name,
      },
      role: invitation.role as Role,
      inviter: {
        name: inviter.full_name,
        email: inviter.email,
      },
      message: invitation.message,
      expires_at: new Date(invitation.expires_at),
      created_at: new Date(invitation.created_at),
    };

    return { valid: true, invitation: publicInvitation as any };
  } catch (error) {
    console.error('Error validating invitation token:', error);
    return { valid: false, error: 'Failed to validate invitation' };
  }
}

// ============================================================================
// Invitation Acceptance
// ============================================================================

/**
 * Accepts an invitation and creates/updates user account
 *
 * @param data - Acceptance data (token, full_name, password for new users)
 * @returns Success with user ID or error
 */
export async function acceptInvitation(
  data: InvitationAcceptanceData
): Promise<{ success: true; userId: string } | { success: false; error: string }> {
  try {
    const supabase = await createClient();

    // 1. Validate token and get invitation
    const validation = await validateInvitationToken(data.token);
    if (!validation.valid) {
      return { success: false, error: validation.error };
    }

    const invitation = validation.invitation as InvitationPublic & { email: string };

    // 2. Check if user already exists
    const { data: existingUser } = await supabase
      .from('users')
      .select('id, email, deleted_at')
      .eq('email', invitation.email) // The invitee's email
      .single();

    let userId: string;

    if (existingUser && !existingUser.deleted_at) {
      // User already exists and is active
      // DO NOT update their organization_id - we support multi-org now!
      userId = existingUser.id;

      // Check if they're already a member of this organization
      const { data: existingMembership } = await supabase
        .from('organization_members')
        .select('id, deleted_at')
        .eq('user_id', userId)
        .eq('organization_id', invitation.organization.id)
        .single();

      if (existingMembership && !existingMembership.deleted_at) {
        return { success: false, error: 'User is already a member of this organization' };
      }

      // If they were previously removed, reactivate the membership
      if (existingMembership && existingMembership.deleted_at) {
        const { error: reactivateError } = await supabase
          .from('organization_members')
          .update({
            role: invitation.role,
            deleted_at: null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', existingMembership.id);

        if (reactivateError) {
          console.error('Error reactivating membership:', reactivateError);
          return { success: false, error: 'Failed to reactivate membership' };
        }
      } else {
        // Create new organization membership
        const { error: membershipError } = await supabase
          .from('organization_members')
          .insert({
            user_id: userId,
            organization_id: invitation.organization.id,
            role: invitation.role,
            invited_by: invitation.inviter.email, // Note: This should be user_id, will fix in next iteration
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          });

        if (membershipError) {
          console.error('Error creating organization membership:', membershipError);
          return { success: false, error: 'Failed to add user to organization' };
        }
      }
    } else {
      // New user or reactivating deleted user
      if (!data.full_name || !data.password) {
        return { success: false, error: 'Full name and password required for new users' };
      }

      // Create auth user with Supabase Auth
      const { data: authUser, error: authError } = await supabase.auth.signUp({
        email: invitation.email,
        password: data.password,
        options: {
          data: {
            full_name: data.full_name,
          },
        },
      });

      if (authError || !authUser.user) {
        console.error('Error creating auth user:', authError);
        return { success: false, error: 'Failed to create user account' };
      }

      userId = authUser.user.id;

      // Create or update user record (without org-specific fields)
      const { error: upsertError } = await supabase
        .from('users')
        .upsert({
          id: userId,
          email: invitation.email,
          full_name: data.full_name,
          email_verified: false,
          deleted_at: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });

      if (upsertError) {
        console.error('Error creating user record:', upsertError);
        return { success: false, error: 'Failed to create user account' };
      }

      // Create organization membership for new user
      const { error: membershipError } = await supabase
        .from('organization_members')
        .insert({
          user_id: userId,
          organization_id: invitation.organization.id,
          role: invitation.role,
          invited_by: invitation.inviter.email, // TODO: Should be user_id
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });

      if (membershipError) {
        console.error('Error creating organization membership:', membershipError);
        return { success: false, error: 'Failed to add user to organization' };
      }
    }

    // 3. Mark invitation as accepted
    const { error: updateError } = await supabase
      .from('invitations')
      .update({
        status: 'accepted',
        accepted_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', invitation.id);

    if (updateError) {
      console.error('Error updating invitation:', updateError);
      // Don't fail the acceptance, user is already created
    }

    // 4. Send welcome email
    const welcomeResult = await sendWelcomeEmail({
      to_email: invitation.email,
      to_name: data.full_name || 'User',
      organization_name: invitation.organization.name,
      role: invitation.role,
      role_display_name: getRoleDisplayName(invitation.role),
      dashboard_url: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard`,
    });

    if (!welcomeResult.success) {
      console.error('Failed to send welcome email:', welcomeResult.error);
    }

    // 5. Notify admins (get admin emails from organization)
    const { data: admins } = await supabase
      .from('users')
      .select('email')
      .eq('organization_id', invitation.organization.id)
      .in('role', ['owner', 'admin'])
      .is('deleted_at', null);

    if (admins && admins.length > 0) {
      const adminEmails = admins.map((a) => a.email);
      const notifyResult = await notifyTeamMemberAdded(
        invitation.organization.name,
        data.full_name || 'User',
        invitation.role,
        adminEmails
      );

      if (!notifyResult.success) {
        console.error('Failed to notify admins:', notifyResult.error);
      }
    }

    return { success: true, userId };
  } catch (error) {
    console.error('Error accepting invitation:', error);
    return { success: false, error: 'Failed to accept invitation' };
  }
}

// ============================================================================
// Invitation Queries
// ============================================================================

/**
 * Gets all pending invitations for an organization
 *
 * @param organizationId - Organization ID
 * @returns List of pending invitations
 */
export async function getPendingInvitations(
  organizationId: string
): Promise<{ success: true; invitations: Invitation[] } | { success: false; error: string }> {
  try {
    const supabase = await createClient();

    const { data: invitations, error } = await supabase
      .from('invitations')
      .select(`
        *,
        invited_by_user:users!invitations_invited_by_fkey (id, full_name, email)
      `)
      .eq('organization_id', organizationId)
      .eq('status', 'pending')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching pending invitations:', error);
      return { success: false, error: 'Failed to fetch invitations' };
    }

    return { success: true, invitations: invitations as Invitation[] };
  } catch (error) {
    console.error('Error getting pending invitations:', error);
    return { success: false, error: 'Failed to get pending invitations' };
  }
}

/**
 * Gets all invitations for an organization (any status)
 *
 * @param organizationId - Organization ID
 * @param filters - Optional filters
 * @returns List of invitations
 */
export async function getInvitationsByOrganization(
  organizationId: string,
  filters?: {
    status?: InvitationStatus | InvitationStatus[];
    limit?: number;
    offset?: number;
  }
): Promise<{ success: true; invitations: Invitation[]; total: number } | { success: false; error: string }> {
  try {
    const supabase = await createClient();

    let query = supabase
      .from('invitations')
      .select(`
        *,
        invited_by_user:users!invitations_invited_by_fkey (id, full_name, email)
      `, { count: 'exact' })
      .eq('organization_id', organizationId);

    // Apply status filter
    if (filters?.status) {
      if (Array.isArray(filters.status)) {
        query = query.in('status', filters.status);
      } else {
        query = query.eq('status', filters.status);
      }
    }

    // Apply pagination
    if (filters?.limit) {
      query = query.limit(filters.limit);
    }
    if (filters?.offset) {
      query = query.range(filters.offset, filters.offset + (filters.limit || 10) - 1);
    }

    query = query.order('created_at', { ascending: false });

    const { data: invitations, error, count } = await query;

    if (error) {
      console.error('Error fetching invitations:', error);
      return { success: false, error: 'Failed to fetch invitations' };
    }

    return {
      success: true,
      invitations: invitations as Invitation[],
      total: count || 0,
    };
  } catch (error) {
    console.error('Error getting invitations:', error);
    return { success: false, error: 'Failed to get invitations' };
  }
}

// ============================================================================
// Cleanup
// ============================================================================

/**
 * Marks expired pending invitations as expired
 * Should be run periodically (e.g., daily cron job)
 *
 * @returns Number of invitations marked as expired
 */
export async function cleanupExpiredInvitations(): Promise<number> {
  try {
    const supabase = await createClient();

    // Call the database function
    const { data, error } = await supabase.rpc('cleanup_expired_invitations');

    if (error) {
      console.error('Error cleaning up expired invitations:', error);
      return 0;
    }

    return data || 0;
  } catch (error) {
    console.error('Error in cleanup:', error);
    return 0;
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
