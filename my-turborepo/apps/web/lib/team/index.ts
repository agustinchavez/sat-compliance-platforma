/**
 * Team Management Module
 *
 * Main entry point for the team management system.
 * This module provides comprehensive functionality for managing organization
 * teams, including invitations, role management, ownership transfers, and activity logging.
 *
 * @module team
 */

// ============================================================================
// Type Exports
// ============================================================================

export type {
  TeamMember,
  TeamMemberStatus,
  TeamMemberFilters,
  TeamMemberSortField,
  TeamStats,
  TeamMemberActivity,
  Invitation,
  InvitationStatus,
  InvitationCreateData,
  InvitationAcceptanceData,
  InvitationPublic,
  InvitationValidationResult,
  RoleChangeRequest,
  RoleChangeResult,
  RoleAssignmentValidation,
  RemovalValidationResult,
  OwnershipTransfer,
  OwnershipTransferStatus,
  OwnershipTransferInitiation,
  OwnershipTransferConfirmation,
  TeamActivityLog,
  TeamAction,
  TeamActivityDetails,
  ActivityLogFilters,
  EmailTemplate,
  InvitationEmailData,
  WelcomeEmailData,
  RoleChangeEmailData,
  RemovalEmailData,
  OwnershipTransferEmailData,
  RateLimitConfig,
  RateLimitResult,
  TeamManagementError,
  BulkInvitationData,
  BulkInvitationResult,
} from './types';

export {
  DEFAULT_RATE_LIMITS,
  INVITATION_SETTINGS,
  OWNERSHIP_TRANSFER_SETTINGS,
  TEAM_MEMBER_STATUS_NAMES,
  INVITATION_STATUS_NAMES,
} from './types';

// ============================================================================
// Validation Exports
// ============================================================================

export {
  isValidEmail,
  validateInvitationEmail,
  isValidRole,
  canAssignRole,
  validateRoleAssignment,
  canRemoveUser,
  isLastOwner,
  validateUserRemoval,
  validateOwnershipTransfer,
  isValidTokenFormat,
  compareRoles,
  isRoleHigher,
  isRoleLower,
  validateBulkInvitationEmails,
} from './validation';

// ============================================================================
// Invitation Exports
// ============================================================================

export {
  generateInvitationToken,
  getInvitationExpiryDate,
  isInvitationExpired,
  inviteUser,
  resendInvitation,
  cancelInvitation,
  validateInvitationToken,
  acceptInvitation,
  getPendingInvitations,
  getInvitationsByOrganization,
  cleanupExpiredInvitations,
} from './invitations';

// ============================================================================
// Team Service Exports
// ============================================================================

export {
  getTeamMembers,
  getTeamMember,
  updateTeamMemberRole,
  removeTeamMember,
  reactivateTeamMember,
  getTeamStats,
  canManageTeam,
} from './service';

// ============================================================================
// Activity Logging Exports
// ============================================================================

export {
  logTeamActivity,
  logInvitationSent,
  logInvitationAccepted,
  logInvitationResent,
  logInvitationCancelled,
  logRoleChanged,
  logMemberRemoved,
  logMemberReactivated,
  logOwnershipTransferInitiated,
  logOwnershipTransferConfirmed,
  logOwnershipTransferCancelled,
  getTeamActivity,
  getUserActions,
  getTeamActivityForUser,
  getRecentTeamActivity,
  getActivityDescription,
  getActivitySummary,
  exportActivityLogToCSV,
} from './activity';

// ============================================================================
// Ownership Transfer Exports
// ============================================================================

export {
  generateTransferToken,
  getTransferExpiryDate,
  isTransferExpired,
  initiateOwnershipTransfer,
  validateTransferToken,
  confirmOwnershipTransfer,
  cancelOwnershipTransfer,
  getPendingTransfer,
  getOwnershipTransfers,
  getTransferByToken,
  cleanupExpiredTransfers,
} from './ownership';

// ============================================================================
// Notification Exports
// ============================================================================

export {
  sendInvitationEmail,
  sendInvitationReminder,
  sendWelcomeEmail,
  sendRoleChangeNotification,
  sendRemovalNotification,
  sendOwnershipTransferNotification,
  sendOwnershipTransferConfirmed,
  notifyTeamMemberAdded,
} from './notifications';

// ============================================================================
// Utility Exports
// ============================================================================

export {
  getRoleDisplayName,
  getRoleDescription,
  getRoleColor,
  roleHasPermission,
  getStatusDisplayName,
  getStatusColor,
  getInvitationStatusDisplayName,
  getInvitationStatusColor,
  formatRelativeTime,
  shouldShowExpiryWarning,
  getTimeRemaining,
  maskEmail,
  getInitials,
  sortByRoleHierarchy,
  groupByRole,
  getActiveMembers,
  countByRole,
  formatTokenDisplay,
  getTeamMemberProfileUrl,
  getInvitationAcceptanceUrl,
  getOwnershipTransferUrl,
  canRemoveMember,
  exportTeamMembersToCSV,
  searchTeamMembers,
} from './utils';

export type { TeamPermission } from './utils';
