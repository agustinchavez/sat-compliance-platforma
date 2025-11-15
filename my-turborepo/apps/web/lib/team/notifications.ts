/**
 * Team Management Email Notifications
 *
 * This file handles all email notifications for team management,
 * including invitations, role changes, removals, and ownership transfers.
 * Uses Resend for email delivery with React Email templates.
 */

import { Resend } from 'resend';
import type {
  InvitationEmailData,
  WelcomeEmailData,
  RoleChangeEmailData,
  RemovalEmailData,
  OwnershipTransferEmailData,
  Invitation,
} from './types';
import type { Role } from '@/lib/rbac/types';

// ============================================================================
// Configuration
// ============================================================================

/**
 * Initialize Resend client
 */
function getResendClient(): Resend {
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    throw new Error('RESEND_API_KEY environment variable is not set');
  }

  return new Resend(apiKey);
}

/**
 * Get email configuration
 */
function getEmailConfig() {
  return {
    from: process.env.EMAIL_FROM || 'invitations@yourapp.com',
    fromName: process.env.EMAIL_FROM_NAME || 'SAT Compliance Platform',
    appUrl: process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
  };
}

// ============================================================================
// Role Display Names
// ============================================================================

const ROLE_DISPLAY_NAMES: Record<Role, string> = {
  owner: 'Owner',
  admin: 'Administrator',
  accountant: 'Accountant',
  user: 'User',
};

export function getRoleDisplayName(role: Role): string {
  return ROLE_DISPLAY_NAMES[role] || role;
}

// ============================================================================
// Email Templates (Plain HTML for now - React Email components later)
// ============================================================================

/**
 * Generate invitation email HTML
 */
function generateInvitationEmail(data: InvitationEmailData): string {
  const expiryDate = new Date(data.expires_at).toLocaleDateString('es-MX', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Invitation to ${data.organization_name}</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; border-radius: 10px 10px 0 0; text-align: center;">
    <h1 style="color: white; margin: 0; font-size: 28px;">You've been invited!</h1>
  </div>

  <div style="background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px;">
    <p style="font-size: 16px; margin-bottom: 20px;">Hi${data.to_name ? ` ${data.to_name}` : ''},</p>

    <p style="font-size: 16px; margin-bottom: 20px;">
      <strong>${data.inviter_name}</strong> has invited you to join <strong>${data.organization_name}</strong> as a <strong>${data.role_display_name}</strong>.
    </p>

    ${data.custom_message ? `
      <div style="background: white; padding: 20px; border-left: 4px solid #667eea; margin: 20px 0; border-radius: 4px;">
        <p style="margin: 0; font-style: italic;">"${data.custom_message}"</p>
      </div>
    ` : ''}

    <div style="text-align: center; margin: 30px 0;">
      <a href="${data.invitation_url}" style="display: inline-block; background: #667eea; color: white; padding: 14px 32px; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 16px;">Accept Invitation</a>
    </div>

    <p style="font-size: 14px; color: #6b7280; margin-top: 30px;">
      This invitation will expire on <strong>${expiryDate}</strong>.
    </p>

    <p style="font-size: 14px; color: #6b7280; margin-top: 10px;">
      If you didn't expect this invitation, you can safely ignore this email.
    </p>
  </div>

  <div style="text-align: center; padding: 20px; color: #9ca3af; font-size: 12px;">
    <p>SAT Compliance Platform • Simplified Invoicing for Mexico</p>
  </div>
</body>
</html>
  `.trim();
}

/**
 * Generate welcome email HTML
 */
function generateWelcomeEmail(data: WelcomeEmailData): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Welcome to ${data.organization_name}</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); padding: 30px; border-radius: 10px 10px 0 0; text-align: center;">
    <h1 style="color: white; margin: 0; font-size: 28px;">Welcome aboard! 🎉</h1>
  </div>

  <div style="background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px;">
    <p style="font-size: 16px; margin-bottom: 20px;">Hi ${data.to_name},</p>

    <p style="font-size: 16px; margin-bottom: 20px;">
      Welcome to <strong>${data.organization_name}</strong>! You've successfully joined as a <strong>${data.role_display_name}</strong>.
    </p>

    <div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0;">
      <h3 style="margin-top: 0; color: #10b981;">Get Started:</h3>
      <ul style="padding-left: 20px;">
        <li style="margin-bottom: 10px;">
          <a href="${data.dashboard_url}" style="color: #667eea; text-decoration: none; font-weight: 600;">View your dashboard</a>
        </li>
        <li style="margin-bottom: 10px;">
          <a href="${data.dashboard_url}/settings" style="color: #667eea; text-decoration: none; font-weight: 600;">Update your profile</a>
        </li>
        <li style="margin-bottom: 10px;">
          <a href="${data.dashboard_url}/help" style="color: #667eea; text-decoration: none; font-weight: 600;">Learn how to use the platform</a>
        </li>
      </ul>
    </div>

    <p style="font-size: 14px; color: #6b7280; margin-top: 20px;">
      Need help? Reply to this email or contact our support team.
    </p>
  </div>

  <div style="text-align: center; padding: 20px; color: #9ca3af; font-size: 12px;">
    <p>SAT Compliance Platform • Simplified Invoicing for Mexico</p>
  </div>
</body>
</html>
  `.trim();
}

/**
 * Generate role change notification email HTML
 */
function generateRoleChangeEmail(data: RoleChangeEmailData): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Your role has been updated</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); padding: 30px; border-radius: 10px 10px 0 0; text-align: center;">
    <h1 style="color: white; margin: 0; font-size: 28px;">Role Updated</h1>
  </div>

  <div style="background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px;">
    <p style="font-size: 16px; margin-bottom: 20px;">Hi ${data.to_name},</p>

    <p style="font-size: 16px; margin-bottom: 20px;">
      Your role at <strong>${data.organization_name}</strong> has been updated by ${data.changed_by_name}.
    </p>

    <div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0; text-align: center;">
      <div style="display: inline-block; padding: 10px 20px; background: #fee2e2; color: #991b1b; border-radius: 6px; margin: 0 10px;">
        ${data.old_role_display_name}
      </div>
      <span style="font-size: 24px; color: #6b7280; margin: 0 10px;">→</span>
      <div style="display: inline-block; padding: 10px 20px; background: #dcfce7; color: #166534; border-radius: 6px; margin: 0 10px;">
        ${data.new_role_display_name}
      </div>
    </div>

    <p style="font-size: 14px; color: #6b7280; margin-top: 20px;">
      Your permissions have been updated accordingly. If you have any questions, please contact your administrator.
    </p>
  </div>

  <div style="text-align: center; padding: 20px; color: #9ca3af; font-size: 12px;">
    <p>SAT Compliance Platform • Simplified Invoicing for Mexico</p>
  </div>
</body>
</html>
  `.trim();
}

/**
 * Generate removal notification email HTML
 */
function generateRemovalEmail(data: RemovalEmailData): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Access removed from ${data.organization_name}</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%); padding: 30px; border-radius: 10px 10px 0 0; text-align: center;">
    <h1 style="color: white; margin: 0; font-size: 28px;">Access Removed</h1>
  </div>

  <div style="background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px;">
    <p style="font-size: 16px; margin-bottom: 20px;">Hi ${data.to_name},</p>

    <p style="font-size: 16px; margin-bottom: 20px;">
      Your access to <strong>${data.organization_name}</strong> has been removed by ${data.removed_by_name}.
    </p>

    ${data.reason ? `
      <div style="background: white; padding: 20px; border-left: 4px solid #ef4444; margin: 20px 0; border-radius: 4px;">
        <p style="margin: 0; color: #6b7280;"><strong>Reason:</strong> ${data.reason}</p>
      </div>
    ` : ''}

    <p style="font-size: 14px; color: #6b7280; margin-top: 20px;">
      If you believe this is a mistake, please contact <a href="mailto:${data.organization_email}" style="color: #667eea;">${data.organization_email}</a>.
    </p>
  </div>

  <div style="text-align: center; padding: 20px; color: #9ca3af; font-size: 12px;">
    <p>SAT Compliance Platform • Simplified Invoicing for Mexico</p>
  </div>
</body>
</html>
  `.trim();
}

/**
 * Generate ownership transfer request email HTML
 */
function generateOwnershipTransferEmail(data: OwnershipTransferEmailData): string {
  const expiryDate = new Date(data.expires_at).toLocaleDateString('es-MX', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Ownership Transfer Request</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%); padding: 30px; border-radius: 10px 10px 0 0; text-align: center;">
    <h1 style="color: white; margin: 0; font-size: 28px;">Ownership Transfer Request</h1>
  </div>

  <div style="background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px;">
    <p style="font-size: 16px; margin-bottom: 20px;">Hi ${data.to_name},</p>

    <p style="font-size: 16px; margin-bottom: 20px;">
      <strong>${data.current_owner_name}</strong> wants to transfer ownership of <strong>${data.organization_name}</strong> to you.
    </p>

    <div style="background: #fef3c7; padding: 20px; border-left: 4px solid #f59e0b; margin: 20px 0; border-radius: 4px;">
      <h3 style="margin-top: 0; color: #92400e;">Important Responsibilities</h3>
      <p style="margin: 0; color: #78350f;">As the new owner, you will have full control over:</p>
      <ul style="color: #78350f; margin: 10px 0; padding-left: 20px;">
        <li>Managing all team members</li>
        <li>Accessing billing and subscription settings</li>
        <li>Making critical business decisions</li>
        <li>All organization data and configurations</li>
      </ul>
    </div>

    <div style="text-align: center; margin: 30px 0;">
      <a href="${data.confirmation_url}" style="display: inline-block; background: #8b5cf6; color: white; padding: 14px 32px; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 16px; margin: 0 10px;">Confirm Transfer</a>
    </div>

    <p style="font-size: 14px; color: #6b7280; margin-top: 30px;">
      This request will expire on <strong>${expiryDate}</strong>.
    </p>

    <p style="font-size: 14px; color: #6b7280; margin-top: 10px;">
      If you don't want to accept this transfer, you can safely ignore this email.
    </p>
  </div>

  <div style="text-align: center; padding: 20px; color: #9ca3af; font-size: 12px;">
    <p>SAT Compliance Platform • Simplified Invoicing for Mexico</p>
  </div>
</body>
</html>
  `.trim();
}

// ============================================================================
// Email Sending Functions
// ============================================================================

/**
 * Send invitation email
 *
 * @param data - Invitation email data
 * @returns Email send result
 */
export async function sendInvitationEmail(
  data: InvitationEmailData
): Promise<{ success: boolean; error?: string }> {
  try {
    const resend = getResendClient();
    const config = getEmailConfig();

    const result = await resend.emails.send({
      from: `${config.fromName} <${config.from}>`,
      to: data.to_email,
      subject: `You've been invited to join ${data.organization_name}`,
      html: generateInvitationEmail(data),
    });

    if (result.error) {
      console.error('Failed to send invitation email:', result.error);
      return { success: false, error: result.error.message };
    }

    return { success: true };
  } catch (error) {
    console.error('Error sending invitation email:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Send invitation reminder email
 *
 * @param invitation - Invitation data
 * @returns Email send result
 */
export async function sendInvitationReminder(
  invitation: Invitation
): Promise<{ success: boolean; error?: string }> {
  // Reuse invitation email with "Reminder:" prefix in subject
  try {
    const resend = getResendClient();
    const config = getEmailConfig();

    const invitationUrl = `${config.appUrl}/accept-invitation?token=${invitation.token}`;

    const data: InvitationEmailData = {
      to_email: invitation.email,
      organization_name: invitation.organization?.name || 'the organization',
      organization_legal_name: invitation.organization?.legal_name || '',
      inviter_name: invitation.inviter?.name || 'Your colleague',
      role: invitation.role,
      role_display_name: getRoleDisplayName(invitation.role),
      invitation_url: invitationUrl,
      custom_message: invitation.message || undefined,
      expires_at: invitation.expires_at,
    };

    const result = await resend.emails.send({
      from: `${config.fromName} <${config.from}>`,
      to: data.to_email,
      subject: `Reminder: You've been invited to join ${data.organization_name}`,
      html: generateInvitationEmail(data),
    });

    if (result.error) {
      console.error('Failed to send reminder email:', result.error);
      return { success: false, error: result.error.message };
    }

    return { success: true };
  } catch (error) {
    console.error('Error sending reminder email:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Send welcome email
 *
 * @param data - Welcome email data
 * @returns Email send result
 */
export async function sendWelcomeEmail(
  data: WelcomeEmailData
): Promise<{ success: boolean; error?: string }> {
  try {
    const resend = getResendClient();
    const config = getEmailConfig();

    const result = await resend.emails.send({
      from: `${config.fromName} <${config.from}>`,
      to: data.to_email,
      subject: `Welcome to ${data.organization_name}!`,
      html: generateWelcomeEmail(data),
    });

    if (result.error) {
      console.error('Failed to send welcome email:', result.error);
      return { success: false, error: result.error.message };
    }

    return { success: true };
  } catch (error) {
    console.error('Error sending welcome email:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Send role change notification email
 *
 * @param data - Role change email data
 * @returns Email send result
 */
export async function sendRoleChangeNotification(
  data: RoleChangeEmailData
): Promise<{ success: boolean; error?: string }> {
  try {
    const resend = getResendClient();
    const config = getEmailConfig();

    const result = await resend.emails.send({
      from: `${config.fromName} <${config.from}>`,
      to: data.to_email,
      subject: `Your role at ${data.organization_name} has been updated`,
      html: generateRoleChangeEmail(data),
    });

    if (result.error) {
      console.error('Failed to send role change email:', result.error);
      return { success: false, error: result.error.message };
    }

    return { success: true };
  } catch (error) {
    console.error('Error sending role change email:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Send removal notification email
 *
 * @param data - Removal email data
 * @returns Email send result
 */
export async function sendRemovalNotification(
  data: RemovalEmailData
): Promise<{ success: boolean; error?: string }> {
  try {
    const resend = getResendClient();
    const config = getEmailConfig();

    const result = await resend.emails.send({
      from: `${config.fromName} <${config.from}>`,
      to: data.to_email,
      subject: `Your access to ${data.organization_name} has been removed`,
      html: generateRemovalEmail(data),
    });

    if (result.error) {
      console.error('Failed to send removal email:', result.error);
      return { success: false, error: result.error.message };
    }

    return { success: true };
  } catch (error) {
    console.error('Error sending removal email:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Send ownership transfer request email
 *
 * @param data - Ownership transfer email data
 * @returns Email send result
 */
export async function sendOwnershipTransferNotification(
  data: OwnershipTransferEmailData
): Promise<{ success: boolean; error?: string }> {
  try {
    const resend = getResendClient();
    const config = getEmailConfig();

    const result = await resend.emails.send({
      from: `${config.fromName} <${config.from}>`,
      to: data.to_email,
      subject: `Ownership transfer request for ${data.organization_name}`,
      html: generateOwnershipTransferEmail(data),
    });

    if (result.error) {
      console.error('Failed to send ownership transfer email:', result.error);
      return { success: false, error: result.error.message };
    }

    return { success: true };
  } catch (error) {
    console.error('Error sending ownership transfer email:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Send ownership transfer confirmed email
 *
 * @param data - Email data with organization and new owner info
 * @returns Email send result
 */
export async function sendOwnershipTransferConfirmed(data: {
  to_email: string;
  to_name: string;
  organization_name: string;
  new_owner_name: string;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const resend = getResendClient();
    const config = getEmailConfig();

    const html = `
<!DOCTYPE html>
<html>
<body style="font-family: sans-serif; line-height: 1.6; color: #333;">
  <p>Hi ${data.to_name},</p>
  <p>The ownership transfer for <strong>${data.organization_name}</strong> has been completed.</p>
  <p><strong>${data.new_owner_name}</strong> is now the owner of the organization.</p>
  <p style="margin-top: 20px;">If you have any questions, please contact support.</p>
  <p style="font-size: 14px; color: #6b7280; margin-top: 30px;">This is an automated notification from your SAT Compliance Platform.</p>
</body>
</html>
    `.trim();

    const result = await resend.emails.send({
      from: `${config.fromName} <${config.from}>`,
      to: data.to_email,
      subject: `Ownership transfer completed for ${data.organization_name}`,
      html,
    });

    if (result.error) {
      console.error('Failed to send ownership transfer confirmed email:', result.error);
      return { success: false, error: result.error.message };
    }

    return { success: true };
  } catch (error) {
    console.error('Error sending ownership transfer confirmed email:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Send notification when new team member joins
 *
 * @param orgName - Organization name
 * @param newUserName - Name of new user
 * @param newUserRole - Role of new user
 * @param notifyEmails - Array of emails to notify (admins/owners)
 * @returns Email send result
 */
export async function notifyTeamMemberAdded(
  orgName: string,
  newUserName: string,
  newUserRole: Role,
  notifyEmails: string[]
): Promise<{ success: boolean; error?: string }> {
  try {
    const resend = getResendClient();
    const config = getEmailConfig();

    const roleDisplay = getRoleDisplayName(newUserRole);

    const html = `
<!DOCTYPE html>
<html>
<body style="font-family: sans-serif; line-height: 1.6; color: #333;">
  <p>Hi,</p>
  <p><strong>${newUserName}</strong> has joined <strong>${orgName}</strong> as a <strong>${roleDisplay}</strong>.</p>
  <p style="font-size: 14px; color: #6b7280;">This is an automated notification from your SAT Compliance Platform.</p>
</body>
</html>
    `.trim();

    const results = await Promise.all(
      notifyEmails.map((email) =>
        resend.emails.send({
          from: `${config.fromName} <${config.from}>`,
          to: email,
          subject: `New team member joined ${orgName}`,
          html,
        })
      )
    );

    const hasErrors = results.some((r) => r.error);
    if (hasErrors) {
      return { success: false, error: 'Some notifications failed to send' };
    }

    return { success: true };
  } catch (error) {
    console.error('Error sending team member notification:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
