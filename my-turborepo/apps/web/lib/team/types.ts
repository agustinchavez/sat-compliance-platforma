/**
 * Team Management Type Definitions
 *
 * This file contains all TypeScript interfaces and types for the team
 * management system, including invitations, team members, role management,
 * and ownership transfers.
 */

import type { Role } from '@/lib/rbac/types';

// ============================================================================
// Team Member Types
// ============================================================================

/**
 * Team member interface
 * Represents a user who is part of an organization
 */
export interface TeamMember {
  id: string;
  email: string;
  full_name: string;
  role: Role;
  status: TeamMemberStatus;
  email_verified: boolean;
  phone: string | null;
  last_login_at: Date | null;
  joined_at: Date;
  invited_by: string | null;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;

  // Invitation details (only if status === 'pending')
  invitation?: InvitationDetails;

  // Inviter details (if invited by someone)
  inviter?: {
    id: string;
    name: string;
    email: string;
  };
}

/**
 * Team member status
 */
export type TeamMemberStatus = 'active' | 'inactive' | 'pending';

/**
 * Organization Member (Multi-Org Support)
 * Represents the junction table entry for user-organization membership
 */
export interface OrganizationMember {
  id: string;
  user_id: string;
  organization_id: string;
  role: Role;
  invited_by: string | null;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
}

/**
 * Organization Member with User Details
 * Used when fetching members with joined user information
 */
export interface OrganizationMemberWithUser extends OrganizationMember {
  user: {
    id: string;
    email: string;
    full_name: string;
    email_verified: boolean;
    phone: string | null;
    last_login_at: Date | null;
  };
}

/**
 * Invitation details for pending members
 */
export interface InvitationDetails {
  id: string;
  sent_at: Date;
  expires_at: Date;
  resent_count: number;
  status: InvitationStatus;
}

// ============================================================================
// Invitation Types
// ============================================================================

/**
 * Invitation interface
 * Represents an invitation to join an organization
 */
export interface Invitation {
  id: string;
  organization_id: string;
  email: string;
  role: Role;
  status: InvitationStatus;
  token: string;
  message: string | null;
  invited_by: string;
  expires_at: Date;
  accepted_at: Date | null;
  created_at: Date;
  updated_at: Date;

  // Populated fields
  inviter?: {
    id: string;
    name: string;
    email: string;
  };
  organization?: {
    id: string;
    name: string;
    legal_name: string;
  };
}

/**
 * Invitation status enumeration
 */
export type InvitationStatus =
  | 'pending'       // Waiting for acceptance
  | 'accepted'      // User accepted and joined
  | 'expired'       // Invitation expired
  | 'cancelled'     // Cancelled by sender
  | 'declined'      // Explicitly declined by recipient
  | 'superseded';   // Replaced by newer invitation

/**
 * Invitation creation data
 */
export interface InvitationCreateData {
  email: string;
  role: Role;
  message?: string;
}

/**
 * Invitation acceptance data (for new users)
 */
export interface InvitationAcceptanceData {
  token: string;
  full_name?: string;    // Required if new user
  password?: string;     // Required if new user
}

/**
 * Invitation with public details (excludes sensitive data)
 */
export interface InvitationPublic {
  id: string;
  organization: {
    id: string;
    name: string;
    legal_name: string;
  };
  role: Role;
  inviter: {
    name: string;
    email: string;
  };
  message: string | null;
  expires_at: Date;
  created_at: Date;
}

// ============================================================================
// Team Member Filters & Queries
// ============================================================================

/**
 * Team member filters for querying
 */
export interface TeamMemberFilters {
  role?: Role | Role[];
  status?: TeamMemberStatus | TeamMemberStatus[];
  search?: string;              // Search by name or email
  includeInvitations?: boolean; // Include pending invitations
  includeInactive?: boolean;    // Include soft-deleted users
  limit?: number;
  offset?: number;
  sortBy?: TeamMemberSortField;
  sortOrder?: 'asc' | 'desc';
}

/**
 * Sort fields for team members
 */
export type TeamMemberSortField =
  | 'name'
  | 'email'
  | 'role'
  | 'joined_at'
  | 'last_login_at'
  | 'created_at';

// ============================================================================
// Role Management Types
// ============================================================================

/**
 * Role change request
 */
export interface RoleChangeRequest {
  user_id: string;
  old_role: Role;
  new_role: Role;
  changed_by: string;
  reason?: string;
}

/**
 * Role change result
 */
export interface RoleChangeResult {
  success: boolean;
  user_id: string;
  old_role: Role;
  new_role: Role;
  message: string;
  error?: string;
}

/**
 * Role assignment validation result
 */
export interface RoleAssignmentValidation {
  valid: boolean;
  errors: string[];
  warnings?: string[];
}

// ============================================================================
// Ownership Transfer Types
// ============================================================================

/**
 * Ownership transfer request
 */
export interface OwnershipTransfer {
  id: string;
  organization_id: string;
  from_user_id: string;
  to_user_id: string;
  status: OwnershipTransferStatus;
  confirmation_token: string;
  initiated_at: Date;
  confirmed_at: Date | null;
  expires_at: Date;
  cancelled_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

/**
 * Ownership transfer status
 */
export type OwnershipTransferStatus =
  | 'pending'      // Waiting for new owner confirmation
  | 'confirmed'    // Confirmed and executed
  | 'expired'      // Confirmation window expired
  | 'cancelled';   // Cancelled by current owner

/**
 * Ownership transfer initiation data
 */
export interface OwnershipTransferInitiation {
  to_user_id: string;
  reason?: string;
}

/**
 * Ownership transfer confirmation data
 */
export interface OwnershipTransferConfirmation {
  confirmation_token: string;
}

// ============================================================================
// Team Statistics Types
// ============================================================================

/**
 * Team statistics
 */
export interface TeamStats {
  total: number;
  active: number;
  inactive: number;
  pending_invitations: number;
  by_role: {
    owner: number;
    admin: number;
    accountant: number;
    user: number;
  };
  recent_additions: number;        // Last 30 days
  recent_removals: number;          // Last 30 days
  average_team_size_change: number; // Monthly trend
}

/**
 * Team member activity summary
 */
export interface TeamMemberActivity {
  user_id: string;
  last_login_at: Date | null;
  total_logins: number;
  actions_count: number;
  last_action_at: Date | null;
}

// ============================================================================
// Activity Log Types
// ============================================================================

/**
 * Team activity log entry
 */
export interface TeamActivityLog {
  id: string;
  organization_id: string;
  user_id: string;              // Who performed the action
  action: TeamAction;
  target_user_id: string | null; // Who was affected
  details: TeamActivityDetails;
  ip_address: string | null;
  user_agent: string | null;
  created_at: Date;
}

/**
 * Team action types
 */
export type TeamAction =
  | 'user_invited'
  | 'invitation_resent'
  | 'invitation_cancelled'
  | 'invitation_accepted'
  | 'invitation_declined'
  | 'invitation_expired'
  | 'role_changed'
  | 'user_removed'
  | 'user_reactivated'
  | 'ownership_transfer_initiated'
  | 'ownership_transfer_confirmed'
  | 'ownership_transfer_cancelled';

/**
 * Activity details
 */
export interface TeamActivityDetails {
  old_role?: Role;
  new_role?: Role;
  reason?: string;
  invitation_id?: string;
  email?: string;
  transfer_id?: string;
  [key: string]: any;
}

/**
 * Activity log filters
 */
export interface ActivityLogFilters {
  action?: TeamAction | TeamAction[];
  user_id?: string;
  target_user_id?: string;
  start_date?: Date;
  end_date?: Date;
  limit?: number;
  offset?: number;
}

// ============================================================================
// Email Notification Types
// ============================================================================

/**
 * Email template types
 */
export type EmailTemplate =
  | 'invitation'
  | 'invitation_reminder'
  | 'welcome'
  | 'role_changed'
  | 'user_removed'
  | 'ownership_transfer_request'
  | 'ownership_transfer_confirmed'
  | 'team_member_joined';

/**
 * Email data for invitations
 */
export interface InvitationEmailData {
  to_email: string;
  to_name?: string;
  organization_name: string;
  organization_legal_name: string;
  inviter_name: string;
  role: Role;
  role_display_name: string;
  invitation_url: string;
  custom_message?: string;
  expires_at: Date;
}

/**
 * Email data for welcome messages
 */
export interface WelcomeEmailData {
  to_email: string;
  to_name: string;
  organization_name: string;
  role: Role;
  role_display_name: string;
  dashboard_url: string;
}

/**
 * Email data for role changes
 */
export interface RoleChangeEmailData {
  to_email: string;
  to_name: string;
  organization_name: string;
  old_role: Role;
  new_role: Role;
  old_role_display_name: string;
  new_role_display_name: string;
  changed_by_name: string;
}

/**
 * Email data for user removal
 */
export interface RemovalEmailData {
  to_email: string;
  to_name: string;
  organization_name: string;
  organization_email: string;
  removed_by_name: string;
  reason?: string;
}

/**
 * Email data for ownership transfer
 */
export interface OwnershipTransferEmailData {
  to_email: string;
  to_name: string;
  organization_name: string;
  current_owner_name: string;
  confirmation_url: string;
  expires_at: Date;
}

// ============================================================================
// Rate Limiting Types
// ============================================================================

/**
 * Rate limit configuration
 */
export interface RateLimitConfig {
  invitations_per_org_per_day: number;
  invitations_per_user_per_day: number;
  invitations_per_email_per_org: number;
  resends_per_invitation: number;
  acceptance_attempts_per_token: number;
}

/**
 * Rate limit check result
 */
export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  reset_at: Date;
  error?: string;
}

// ============================================================================
// Validation Types
// ============================================================================

/**
 * Invitation validation result
 */
export interface InvitationValidationResult {
  valid: boolean;
  errors: string[];
  warnings?: string[];
  invitation?: Invitation;
}

/**
 * Team member removal validation
 */
export interface RemovalValidationResult {
  can_remove: boolean;
  reasons: string[];
  is_last_owner?: boolean;
  is_self?: boolean;
}

// ============================================================================
// Error Types
// ============================================================================

/**
 * Team management error
 */
export class TeamManagementError extends Error {
  constructor(
    message: string,
    public code: TeamErrorCode,
    public details?: any
  ) {
    super(message);
    this.name = 'TeamManagementError';
  }
}

/**
 * Error codes for team operations
 */
export type TeamErrorCode =
  | 'INVITATION_NOT_FOUND'
  | 'INVITATION_EXPIRED'
  | 'INVITATION_ALREADY_ACCEPTED'
  | 'INVITATION_CANCELLED'
  | 'INVALID_TOKEN'
  | 'EMAIL_ALREADY_INVITED'
  | 'EMAIL_ALREADY_MEMBER'
  | 'RATE_LIMIT_EXCEEDED'
  | 'INSUFFICIENT_PERMISSIONS'
  | 'INVALID_ROLE'
  | 'CANNOT_REMOVE_LAST_OWNER'
  | 'CANNOT_REMOVE_SELF'
  | 'CANNOT_DEMOTE_SELF'
  | 'USER_NOT_FOUND'
  | 'USER_ALREADY_REMOVED'
  | 'TRANSFER_NOT_FOUND'
  | 'TRANSFER_EXPIRED'
  | 'TRANSFER_ALREADY_COMPLETED'
  | 'INVALID_TRANSFER';

// ============================================================================
// Constants
// ============================================================================

/**
 * Default rate limits
 */
export const DEFAULT_RATE_LIMITS: RateLimitConfig = {
  invitations_per_org_per_day: 50,
  invitations_per_user_per_day: 20,
  invitations_per_email_per_org: 3,
  resends_per_invitation: 3,
  acceptance_attempts_per_token: 5,
};

/**
 * Invitation settings
 */
export const INVITATION_SETTINGS = {
  EXPIRY_DAYS: 7,
  REMINDER_DAYS: [6, 3, 1], // Send reminders at these days before expiry
  CLEANUP_INTERVAL_HOURS: 24,
} as const;

/**
 * Ownership transfer settings
 */
export const OWNERSHIP_TRANSFER_SETTINGS = {
  CONFIRMATION_WINDOW_HOURS: 48,
  REQUIRE_CONFIRMATION: true,
  NOTIFY_ALL_ADMINS: true,
} as const;

/**
 * Team member status display names
 */
export const TEAM_MEMBER_STATUS_NAMES: Record<TeamMemberStatus, string> = {
  active: 'Active',
  inactive: 'Inactive',
  pending: 'Pending Invitation',
};

/**
 * Invitation status display names
 */
export const INVITATION_STATUS_NAMES: Record<InvitationStatus, string> = {
  pending: 'Pending',
  accepted: 'Accepted',
  expired: 'Expired',
  cancelled: 'Cancelled',
  declined: 'Declined',
  superseded: 'Superseded',
};

// ============================================================================
// Utility Types
// ============================================================================

/**
 * Bulk invitation data
 */
export interface BulkInvitationData {
  invitations: InvitationCreateData[];
}

/**
 * Bulk invitation result
 */
export interface BulkInvitationResult {
  total: number;
  successful: number;
  failed: number;
  results: Array<{
    email: string;
    success: boolean;
    invitation_id?: string;
    error?: string;
  }>;
}
