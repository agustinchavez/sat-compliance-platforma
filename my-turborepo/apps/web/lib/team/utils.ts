/**
 * Team Management Utility Functions
 *
 * This file contains general-purpose utility functions used across
 * the team management system.
 */

import type { Role } from '@/lib/rbac/types';
import type {
  TeamMember,
  TeamMemberStatus,
  InvitationStatus,
  OwnershipTransferStatus,
} from './types';

// ============================================================================
// Role Utilities
// ============================================================================

/**
 * Gets display name for a role
 *
 * @param role - Role enum value
 * @returns Human-readable role name
 */
export function getRoleDisplayName(role: Role): string {
  const displayNames: Record<Role, string> = {
    owner: 'Owner',
    admin: 'Administrator',
    accountant: 'Accountant',
    user: 'User',
  };
  return displayNames[role] || role;
}

/**
 * Gets a description of what a role can do
 *
 * @param role - Role enum value
 * @returns Role description
 */
export function getRoleDescription(role: Role): string {
  const descriptions: Record<Role, string> = {
    owner:
      'Full access to all features including organization settings, billing, and team management',
    admin:
      'Can manage team members, configure settings, and perform most administrative tasks',
    accountant:
      'Can manage invoices, view reports, and handle accounting-related tasks',
    user: 'Can view and create invoices with limited access to settings',
  };
  return descriptions[role] || '';
}

/**
 * Gets color/badge style for role display
 *
 * @param role - Role enum value
 * @returns Color identifier for UI
 */
export function getRoleColor(
  role: Role
): 'primary' | 'success' | 'info' | 'default' {
  const colors: Record<Role, 'primary' | 'success' | 'info' | 'default'> = {
    owner: 'primary',
    admin: 'success',
    accountant: 'info',
    user: 'default',
  };
  return colors[role] || 'default';
}

/**
 * Checks if a role has a specific permission
 *
 * @param role - Role to check
 * @param permission - Permission to check for
 * @returns True if role has permission
 */
export function roleHasPermission(
  role: Role,
  permission: TeamPermission
): boolean {
  const permissions: Record<Role, TeamPermission[]> = {
    owner: [
      'manage_team',
      'invite_members',
      'remove_members',
      'change_roles',
      'manage_settings',
      'view_billing',
      'manage_billing',
      'transfer_ownership',
    ],
    admin: [
      'manage_team',
      'invite_members',
      'remove_members',
      'change_roles',
      'manage_settings',
      'view_billing',
    ],
    accountant: ['view_team', 'manage_invoices', 'view_reports'],
    user: ['view_team', 'create_invoices'],
  };

  return permissions[role]?.includes(permission) || false;
}

/**
 * Team permission types
 */
export type TeamPermission =
  | 'manage_team'
  | 'invite_members'
  | 'remove_members'
  | 'change_roles'
  | 'manage_settings'
  | 'view_billing'
  | 'manage_billing'
  | 'transfer_ownership'
  | 'view_team'
  | 'manage_invoices'
  | 'view_reports'
  | 'create_invoices';

// ============================================================================
// Status Utilities
// ============================================================================

/**
 * Gets display name for team member status
 *
 * @param status - Status value
 * @returns Human-readable status
 */
export function getStatusDisplayName(status: TeamMemberStatus): string {
  const displayNames: Record<TeamMemberStatus, string> = {
    active: 'Active',
    inactive: 'Inactive',
    pending: 'Pending',
  };
  return displayNames[status];
}

/**
 * Gets color for status badge
 *
 * @param status - Status value
 * @returns Color identifier
 */
export function getStatusColor(
  status: TeamMemberStatus
): 'success' | 'error' | 'warning' {
  const colors: Record<TeamMemberStatus, 'success' | 'error' | 'warning'> = {
    active: 'success',
    inactive: 'error',
    pending: 'warning',
  };
  return colors[status];
}

/**
 * Gets display name for invitation status
 *
 * @param status - Invitation status
 * @returns Human-readable status
 */
export function getInvitationStatusDisplayName(status: InvitationStatus): string {
  const displayNames: Record<InvitationStatus, string> = {
    pending: 'Pending',
    accepted: 'Accepted',
    expired: 'Expired',
    cancelled: 'Cancelled',
    declined: 'Declined',
    superseded: 'Superseded',
  };
  return displayNames[status];
}

/**
 * Gets color for invitation status badge
 *
 * @param status - Invitation status
 * @returns Color identifier
 */
export function getInvitationStatusColor(
  status: InvitationStatus
): 'success' | 'error' | 'warning' | 'info' | 'default' {
  const colors: Record<
    InvitationStatus,
    'success' | 'error' | 'warning' | 'info' | 'default'
  > = {
    pending: 'warning',
    accepted: 'success',
    expired: 'error',
    cancelled: 'default',
    declined: 'error',
    superseded: 'info',
  };
  return colors[status];
}

// ============================================================================
// Date Utilities
// ============================================================================

/**
 * Formats a date as relative time (e.g., "2 hours ago", "in 3 days")
 *
 * @param date - Date to format
 * @returns Relative time string
 */
export function formatRelativeTime(date: Date): string {
  const now = new Date();
  const diffMs = date.getTime() - now.getTime();
  const diffSec = Math.floor(Math.abs(diffMs) / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  const isPast = diffMs < 0;

  if (diffSec < 60) {
    return isPast ? 'just now' : 'in a moment';
  } else if (diffMin < 60) {
    return isPast
      ? `${diffMin} minute${diffMin > 1 ? 's' : ''} ago`
      : `in ${diffMin} minute${diffMin > 1 ? 's' : ''}`;
  } else if (diffHour < 24) {
    return isPast
      ? `${diffHour} hour${diffHour > 1 ? 's' : ''} ago`
      : `in ${diffHour} hour${diffHour > 1 ? 's' : ''}`;
  } else if (diffDay < 30) {
    return isPast
      ? `${diffDay} day${diffDay > 1 ? 's' : ''} ago`
      : `in ${diffDay} day${diffDay > 1 ? 's' : ''}`;
  } else {
    return date.toLocaleDateString();
  }
}

/**
 * Checks if date is within expiry warning window (e.g., within 1 day)
 *
 * @param expiryDate - Expiry date
 * @param warningHours - Hours before expiry to start warning (default: 24)
 * @returns True if should show warning
 */
export function shouldShowExpiryWarning(
  expiryDate: Date,
  warningHours: number = 24
): boolean {
  const now = new Date();
  const diffMs = expiryDate.getTime() - now.getTime();
  const diffHours = diffMs / (1000 * 60 * 60);

  return diffHours > 0 && diffHours <= warningHours;
}

/**
 * Gets time remaining until expiry in human-readable format
 *
 * @param expiryDate - Expiry date
 * @returns Time remaining string
 */
export function getTimeRemaining(expiryDate: Date): string {
  const now = new Date();
  const diffMs = expiryDate.getTime() - now.getTime();

  if (diffMs <= 0) {
    return 'Expired';
  }

  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffHours / 24);

  if (diffDays > 0) {
    return `${diffDays} day${diffDays > 1 ? 's' : ''} remaining`;
  } else if (diffHours > 0) {
    return `${diffHours} hour${diffHours > 1 ? 's' : ''} remaining`;
  } else {
    const diffMin = Math.floor(diffMs / (1000 * 60));
    return `${diffMin} minute${diffMin > 1 ? 's' : ''} remaining`;
  }
}

// ============================================================================
// Email Utilities
// ============================================================================

/**
 * Masks an email address for privacy (e.g., "j***@example.com")
 *
 * @param email - Email to mask
 * @returns Masked email
 */
export function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!local || !domain) return email;

  const maskedLocal =
    local.length > 2
      ? local[0] + '*'.repeat(Math.min(local.length - 2, 3)) + local[local.length - 1]
      : local[0] + '*';

  return `${maskedLocal}@${domain}`;
}

/**
 * Validates email format (simple check)
 *
 * @param email - Email to validate
 * @returns True if valid format
 */
export function isValidEmail(email: string): boolean {
  const pattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return pattern.test(email);
}

// ============================================================================
// Team Member Utilities
// ============================================================================

/**
 * Gets initials from full name
 *
 * @param fullName - Full name
 * @returns Initials (e.g., "John Doe" -> "JD")
 */
export function getInitials(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(p => p.length > 0);
  if (parts.length === 0) return '';
  if (parts.length === 1) {
    const firstChar = parts[0]?.[0];
    return firstChar ? firstChar.toUpperCase() : '';
  }

  const firstChar = parts[0]?.[0];
  const lastChar = parts[parts.length - 1]?.[0];
  if (!firstChar || !lastChar) return '';

  return (firstChar + lastChar).toUpperCase();
}

/**
 * Sorts team members by role hierarchy (owners first, then admins, etc.)
 *
 * @param members - Array of team members
 * @returns Sorted array
 */
export function sortByRoleHierarchy(members: TeamMember[]): TeamMember[] {
  const roleOrder: Record<Role, number> = {
    owner: 0,
    admin: 1,
    accountant: 2,
    user: 3,
  };

  return [...members].sort((a, b) => {
    const orderA = roleOrder[a.role] ?? 999;
    const orderB = roleOrder[b.role] ?? 999;
    return orderA - orderB;
  });
}

/**
 * Groups team members by role
 *
 * @param members - Array of team members
 * @returns Object with roles as keys and arrays of members as values
 */
export function groupByRole(
  members: TeamMember[]
): Record<Role, TeamMember[]> {
  const grouped: Record<Role, TeamMember[]> = {
    owner: [],
    admin: [],
    accountant: [],
    user: [],
  };

  members.forEach((member) => {
    grouped[member.role].push(member);
  });

  return grouped;
}

/**
 * Filters active team members
 *
 * @param members - Array of team members
 * @returns Array of active members only
 */
export function getActiveMembers(members: TeamMember[]): TeamMember[] {
  return members.filter((m) => !m.deleted_at);
}

/**
 * Counts team members by role
 *
 * @param members - Array of team members
 * @returns Object with role counts
 */
export function countByRole(
  members: TeamMember[]
): Record<Role, number> & { total: number } {
  const counts = {
    owner: 0,
    admin: 0,
    accountant: 0,
    user: 0,
    total: members.length,
  };

  members.forEach((member) => {
    counts[member.role]++;
  });

  return counts;
}

// ============================================================================
// Token Utilities
// ============================================================================

/**
 * Generates a short display version of a token (for UI)
 *
 * @param token - Full token
 * @returns Shortened token (e.g., "abc...xyz")
 */
export function formatTokenDisplay(token: string): string {
  if (token.length <= 10) return token;
  return `${token.slice(0, 6)}...${token.slice(-4)}`;
}

// ============================================================================
// URL Utilities
// ============================================================================

/**
 * Builds team member profile URL
 *
 * @param userId - User ID
 * @returns Profile URL
 */
export function getTeamMemberProfileUrl(userId: string): string {
  return `/team/members/${userId}`;
}

/**
 * Builds invitation acceptance URL
 *
 * @param token - Invitation token
 * @returns Acceptance URL
 */
export function getInvitationAcceptanceUrl(token: string): string {
  return `/accept-invitation?token=${token}`;
}

/**
 * Builds ownership transfer confirmation URL
 *
 * @param token - Transfer token
 * @returns Confirmation URL
 */
export function getOwnershipTransferUrl(token: string): string {
  return `/confirm-ownership?token=${token}`;
}

// ============================================================================
// Validation Utilities
// ============================================================================

/**
 * Checks if a team member can be removed
 *
 * @param member - Team member
 * @param currentUserRole - Role of user trying to remove
 * @returns Object with canRemove boolean and reason if false
 */
export function canRemoveMember(
  member: TeamMember,
  currentUserRole: Role
): { canRemove: boolean; reason?: string } {
  if (member.role === 'owner' && currentUserRole !== 'owner') {
    return {
      canRemove: false,
      reason: 'Only owners can remove other owners',
    };
  }

  if (member.role === 'admin' && currentUserRole === 'admin') {
    return {
      canRemove: false,
      reason: 'Admins cannot remove other admins',
    };
  }

  if (
    currentUserRole !== 'owner' &&
    currentUserRole !== 'admin'
  ) {
    return {
      canRemove: false,
      reason: 'You do not have permission to remove team members',
    };
  }

  return { canRemove: true };
}

// ============================================================================
// Export Utilities
// ============================================================================

/**
 * Converts team members to CSV format
 *
 * @param members - Array of team members
 * @returns CSV string
 */
export function exportTeamMembersToCSV(members: TeamMember[]): string {
  const headers = ['Name', 'Email', 'Role', 'Status', 'Joined Date', 'Last Login'];

  const rows = members.map((member) => {
    return [
      member.full_name,
      member.email,
      getRoleDisplayName(member.role),
      member.deleted_at ? 'Inactive' : 'Active',
      new Date(member.joined_at).toLocaleDateString(),
      member.last_login_at
        ? new Date(member.last_login_at).toLocaleDateString()
        : 'Never',
    ]
      .map((cell) => `"${cell}"`)
      .join(',');
  });

  return [headers.join(','), ...rows].join('\n');
}

// ============================================================================
// Search Utilities
// ============================================================================

/**
 * Searches team members by name or email
 *
 * @param members - Array of team members
 * @param query - Search query
 * @returns Filtered array
 */
export function searchTeamMembers(
  members: TeamMember[],
  query: string
): TeamMember[] {
  const lowerQuery = query.toLowerCase().trim();

  if (!lowerQuery) return members;

  return members.filter(
    (member) =>
      member.full_name.toLowerCase().includes(lowerQuery) ||
      member.email.toLowerCase().includes(lowerQuery)
  );
}
