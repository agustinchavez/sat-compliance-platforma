/**
 * Team Management Validation Utilities
 *
 * This file contains validation functions for team management operations,
 * including invitation validation, role assignment checks, and permission
 * verification.
 */

import { createClient } from '@/lib/supabase/server';
import type { Role } from '@/lib/rbac/types';
import type {
  InvitationValidationResult,
  RoleAssignmentValidation,
  RemovalValidationResult,
} from './types';

// ============================================================================
// Email Validation
// ============================================================================

/**
 * Email pattern for validation
 */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Validates an email address
 *
 * @param email - Email to validate
 * @returns True if valid email format
 */
export function isValidEmail(email: string): boolean {
  return EMAIL_PATTERN.test(email.trim());
}

/**
 * Validates invitation email
 * Checks format and ensures email is not already a member or invited
 *
 * @param email - Email to validate
 * @param organizationId - Organization ID
 * @returns Validation result with detailed errors
 */
export async function validateInvitationEmail(
  email: string,
  organizationId: string
): Promise<InvitationValidationResult> {
  const errors: string[] = [];

  // Check email format
  if (!email || email.trim() === '') {
    errors.push('Email is required');
    return { valid: false, errors };
  }

  const normalizedEmail = email.trim().toLowerCase();

  if (!isValidEmail(normalizedEmail)) {
    errors.push('Invalid email format');
    return { valid: false, errors };
  }

  // Check if email is already a member
  const supabase = await createClient();
  const { data: existingUser } = await supabase
    .from('users')
    .select('id, role, deleted_at')
    .eq('organization_id', organizationId)
    .eq('email', normalizedEmail)
    .single();

  if (existingUser && !existingUser.deleted_at) {
    errors.push('User with this email is already a team member');
    return { valid: false, errors };
  }

  // Check for pending invitation
  const { data: pendingInvitation } = await supabase
    .from('invitations')
    .select('id, status, expires_at')
    .eq('organization_id', organizationId)
    .eq('email', normalizedEmail)
    .eq('status', 'pending')
    .single();

  if (pendingInvitation) {
    errors.push('There is already a pending invitation for this email');
    return {
      valid: false,
      errors,
      invitation: pendingInvitation as any,
    };
  }

  return { valid: true, errors: [] };
}

// ============================================================================
// Role Validation
// ============================================================================

/**
 * Role hierarchy levels
 */
const ROLE_HIERARCHY: Record<Role, number> = {
  owner: 4,
  admin: 3,
  accountant: 2,
  user: 1,
};

/**
 * Checks if a role is valid
 *
 * @param role - Role to validate
 * @returns True if valid role
 */
export function isValidRole(role: string): role is Role {
  return ['owner', 'admin', 'accountant', 'user'].includes(role);
}

/**
 * Validates if assigner can assign target role
 * Users can only assign roles at or below their level
 *
 * @param assignerRole - Role of the person assigning
 * @param targetRole - Role to be assigned
 * @returns True if assignment is allowed
 *
 * @example
 * ```ts
 * canAssignRole('admin', 'user'); // true
 * canAssignRole('admin', 'owner'); // false
 * canAssignRole('user', 'accountant'); // false
 * ```
 */
export function canAssignRole(assignerRole: Role, targetRole: Role): boolean {
  return ROLE_HIERARCHY[assignerRole] >= ROLE_HIERARCHY[targetRole];
}

/**
 * Validates role assignment
 *
 * @param role - Role to assign
 * @param assignedByRole - Role of person assigning
 * @returns Validation result
 */
export function validateRoleAssignment(
  role: string,
  assignedByRole: Role
): RoleAssignmentValidation {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Check if role is valid
  if (!isValidRole(role)) {
    errors.push(`Invalid role: ${role}. Must be owner, admin, accountant, or user.`);
    return { valid: false, errors, warnings };
  }

  // Check if assigner can assign this role
  if (!canAssignRole(assignedByRole, role)) {
    errors.push(`${assignedByRole} cannot assign ${role} role`);
    return { valid: false, errors, warnings };
  }

  // Warning for owner assignment
  if (role === 'owner' && assignedByRole === 'owner') {
    warnings.push(
      'Assigning owner role will create multiple owners. Consider using ownership transfer instead.'
    );
  }

  return { valid: errors.length === 0, errors, warnings };
}

// ============================================================================
// Team Member Removal Validation
// ============================================================================

/**
 * Checks if a user can be removed
 *
 * @param removerRole - Role of person removing
 * @param targetRole - Role of person being removed
 * @returns True if removal is allowed
 */
export function canRemoveUser(removerRole: Role, targetRole: Role): boolean {
  // Owners can remove anyone (except themselves if last owner)
  if (removerRole === 'owner') {
    return true;
  }

  // Admins can remove accountants and users (not other admins or owners)
  if (removerRole === 'admin') {
    return targetRole === 'accountant' || targetRole === 'user';
  }

  // Accountants and users cannot remove anyone
  return false;
}

/**
 * Checks if user is the last owner of the organization
 *
 * @param userId - User ID to check
 * @param organizationId - Organization ID
 * @returns True if user is the last owner
 */
export async function isLastOwner(
  userId: string,
  organizationId: string
): Promise<boolean> {
  try {
    const supabase = await createClient();

    // Count active owners in the organization from organization_members
    const { count } = await supabase
      .from('organization_members')
      .select('*', { count: 'exact', head: true })
      .eq('organization_id', organizationId)
      .eq('role', 'owner')
      .is('deleted_at', null);

    // If only 1 owner exists, check if it's this user
    if (count === 1) {
      const { data: membership } = await supabase
        .from('organization_members')
        .select('id')
        .eq('user_id', userId)
        .eq('organization_id', organizationId)
        .eq('role', 'owner')
        .is('deleted_at', null)
        .single();

      return !!membership;
    }

    return false;
  } catch (error) {
    console.error('Error checking if last owner:', error);
    return false;
  }
}

/**
 * Validates if a user can be removed
 *
 * @param organizationId - Organization ID
 * @param userId - User ID to remove
 * @param removerId - User ID of person removing
 * @returns Validation result
 */
export async function validateUserRemoval(
  organizationId: string,
  userId: string,
  removerId: string
): Promise<RemovalValidationResult> {
  const reasons: string[] = [];

  try {
    const supabase = await createClient();

    // Check if trying to remove self
    const is_self = userId === removerId;
    if (is_self) {
      reasons.push('You cannot remove yourself');
      return { can_remove: false, reasons, is_self: true };
    }

    // Get both users' memberships in this organization
    const { data: memberships } = await supabase
      .from('organization_members')
      .select('user_id, role')
      .eq('organization_id', organizationId)
      .in('user_id', [userId, removerId])
      .is('deleted_at', null);

    if (!memberships || memberships.length !== 2) {
      reasons.push('User not found or already removed');
      return { can_remove: false, reasons };
    }

    const targetMembership = memberships.find((m) => m.user_id === userId);
    const removerMembership = memberships.find((m) => m.user_id === removerId);

    if (!targetMembership || !removerMembership) {
      reasons.push('User not found');
      return { can_remove: false, reasons };
    }

    // Check if remover has permission to remove target
    if (!canRemoveUser(removerMembership.role as Role, targetMembership.role as Role)) {
      reasons.push(
        `${removerMembership.role} cannot remove ${targetMembership.role}`
      );
      return { can_remove: false, reasons };
    }

    // Check if target is last owner
    const is_last_owner = await isLastOwner(userId, organizationId);
    if (is_last_owner) {
      reasons.push('Cannot remove the last owner of the organization');
      return { can_remove: false, reasons, is_last_owner: true };
    }

    return { can_remove: true, reasons: [] };
  } catch (error) {
    console.error('Error validating user removal:', error);
    reasons.push('Error validating user removal');
    return { can_remove: false, reasons };
  }
}

// ============================================================================
// Ownership Transfer Validation
// ============================================================================

/**
 * Validates ownership transfer request
 *
 * @param organizationId - Organization ID
 * @param fromUserId - Current owner ID
 * @param toUserId - New owner ID (must be admin)
 * @returns Validation result
 */
export async function validateOwnershipTransfer(
  organizationId: string,
  fromUserId: string,
  toUserId: string
): Promise<{ valid: boolean; errors: string[] }> {
  const errors: string[] = [];

  try {
    // Check if same user
    if (fromUserId === toUserId) {
      errors.push('Cannot transfer ownership to yourself');
      return { valid: false, errors };
    }

    const supabase = await createClient();

    // Get both users' memberships in this organization
    const { data: memberships } = await supabase
      .from('organization_members')
      .select('user_id, role, deleted_at')
      .eq('organization_id', organizationId)
      .in('user_id', [fromUserId, toUserId]);

    if (!memberships || memberships.length !== 2) {
      errors.push('One or both users not found in this organization');
      return { valid: false, errors };
    }

    const fromMembership = memberships.find((m) => m.user_id === fromUserId);
    const toMembership = memberships.find((m) => m.user_id === toUserId);

    if (!fromMembership || !toMembership) {
      errors.push('User not found in organization');
      return { valid: false, errors };
    }

    // Check if from user membership is deleted
    if (fromMembership.deleted_at) {
      errors.push('Current owner is no longer a member of this organization');
      return { valid: false, errors };
    }

    // Check if to user membership is deleted
    if (toMembership.deleted_at) {
      errors.push('Target user is no longer a member of this organization');
      return { valid: false, errors };
    }

    // Check if from user is owner
    if (fromMembership.role !== 'owner') {
      errors.push('Only current owner can transfer ownership');
      return { valid: false, errors };
    }

    // Check if to user is admin (best practice: only promote admins to owner)
    if (toMembership.role !== 'admin') {
      errors.push('New owner must be an admin');
      return { valid: false, errors };
    }

    // Check for pending transfers
    const { data: pendingTransfer } = await supabase
      .from('ownership_transfers')
      .select('id')
      .eq('organization_id', organizationId)
      .eq('status', 'pending')
      .single();

    if (pendingTransfer) {
      errors.push('There is already a pending ownership transfer');
      return { valid: false, errors };
    }

    return { valid: true, errors: [] };
  } catch (error) {
    console.error('Error validating ownership transfer:', error);
    errors.push('Error validating ownership transfer');
    return { valid: false, errors };
  }
}

// ============================================================================
// Invitation Token Validation
// ============================================================================

/**
 * Validates invitation token format
 *
 * @param token - Token to validate
 * @returns True if token format is valid
 */
export function isValidTokenFormat(token: string): boolean {
  // Token should be base64url encoded, 32+ characters
  return /^[A-Za-z0-9_-]{32,}$/.test(token);
}

// ============================================================================
// Role Comparison Utilities
// ============================================================================

/**
 * Compares two roles and returns which is higher
 *
 * @param roleA - First role
 * @param roleB - Second role
 * @returns 1 if roleA > roleB, -1 if roleA < roleB, 0 if equal
 */
export function compareRoles(roleA: Role, roleB: Role): number {
  const levelA = ROLE_HIERARCHY[roleA];
  const levelB = ROLE_HIERARCHY[roleB];

  if (levelA > levelB) return 1;
  if (levelA < levelB) return -1;
  return 0;
}

/**
 * Checks if role A is higher than role B
 *
 * @param roleA - First role
 * @param roleB - Second role
 * @returns True if roleA is higher
 */
export function isRoleHigher(roleA: Role, roleB: Role): boolean {
  return ROLE_HIERARCHY[roleA] > ROLE_HIERARCHY[roleB];
}

/**
 * Checks if role A is lower than role B
 *
 * @param roleA - First role
 * @param roleB - Second role
 * @returns True if roleA is lower
 */
export function isRoleLower(roleA: Role, roleB: Role): boolean {
  return ROLE_HIERARCHY[roleA] < ROLE_HIERARCHY[roleB];
}

// ============================================================================
// Bulk Validation
// ============================================================================

/**
 * Validates multiple emails for bulk invitations
 *
 * @param emails - Array of emails
 * @param organizationId - Organization ID
 * @returns Array of validation results
 */
export async function validateBulkInvitationEmails(
  emails: string[],
  organizationId: string
): Promise<
  Array<{ email: string; valid: boolean; errors: string[] }>
> {
  const results = await Promise.all(
    emails.map(async (email) => {
      const validation = await validateInvitationEmail(email, organizationId);
      return {
        email,
        valid: validation.valid,
        errors: validation.errors,
      };
    })
  );

  return results;
}
