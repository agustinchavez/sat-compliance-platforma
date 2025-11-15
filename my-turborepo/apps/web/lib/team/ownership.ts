/**
 * Ownership Transfer Management
 *
 * This file handles ownership transfer requests, confirmation, and execution.
 * Implements a secure two-step confirmation process for transferring organization ownership.
 */

import { createClient } from '@/lib/supabase/server';
import { randomBytes } from 'crypto';
import type {
  OwnershipTransfer,
  OwnershipTransferInitiation,
  OwnershipTransferConfirmation,
  OwnershipTransferStatus,
} from './types';
import { validateOwnershipTransfer } from './validation';
import {
  sendOwnershipTransferNotification,
  sendOwnershipTransferConfirmed,
} from './notifications';
import {
  logOwnershipTransferInitiated,
  logOwnershipTransferConfirmed,
  logOwnershipTransferCancelled,
} from './activity';
import { OWNERSHIP_TRANSFER_SETTINGS } from './types';

// ============================================================================
// Constants
// ============================================================================

const TOKEN_LENGTH = 32; // 32 bytes = 256 bits
const CONFIRMATION_WINDOW_HOURS = OWNERSHIP_TRANSFER_SETTINGS.CONFIRMATION_WINDOW_HOURS;

// ============================================================================
// Token Generation
// ============================================================================

/**
 * Generates a cryptographically secure random token for ownership transfers
 *
 * @returns Base64url-encoded random token
 */
export function generateTransferToken(): string {
  return randomBytes(TOKEN_LENGTH)
    .toString('base64url')
    .replace(/[+/=]/g, '');
}

/**
 * Calculates transfer expiry date
 *
 * @param hours - Number of hours until expiry (default: 48)
 * @returns Expiry date
 */
export function getTransferExpiryDate(
  hours: number = CONFIRMATION_WINDOW_HOURS
): Date {
  const expiry = new Date();
  expiry.setHours(expiry.getHours() + hours);
  return expiry;
}

/**
 * Checks if transfer is expired
 *
 * @param expiresAt - Expiry timestamp
 * @returns True if expired
 */
export function isTransferExpired(expiresAt: Date): boolean {
  return new Date() > new Date(expiresAt);
}

// ============================================================================
// Transfer Initiation
// ============================================================================

/**
 * Initiates an ownership transfer request
 *
 * @param organizationId - Organization ID
 * @param fromUserId - Current owner ID
 * @param data - Transfer initiation data
 * @returns Created transfer or error
 */
export async function initiateOwnershipTransfer(
  organizationId: string,
  fromUserId: string,
  data: OwnershipTransferInitiation
): Promise<{ success: true; transfer: OwnershipTransfer } | { success: false; error: string }> {
  try {
    // 1. Validate transfer
    const validation = await validateOwnershipTransfer(
      organizationId,
      fromUserId,
      data.to_user_id
    );

    if (!validation.valid) {
      return { success: false, error: validation.errors.join(', ') };
    }

    const supabase = await createClient();

    // 2. Get user details for notifications
    const { data: users } = await supabase
      .from('users')
      .select('id, full_name, email')
      .in('id', [fromUserId, data.to_user_id])
      .is('deleted_at', null);

    if (!users || users.length !== 2) {
      return { success: false, error: 'Users not found' };
    }

    const fromUser = users.find((u) => u.id === fromUserId);
    const toUser = users.find((u) => u.id === data.to_user_id);

    if (!fromUser || !toUser) {
      return { success: false, error: 'Users not found' };
    }

    // 3. Get organization details
    const { data: organization } = await supabase
      .from('organizations')
      .select('id, name')
      .eq('id', organizationId)
      .is('deleted_at', null)
      .single();

    if (!organization) {
      return { success: false, error: 'Organization not found' };
    }

    // 4. Generate token and expiry
    const confirmationToken = generateTransferToken();
    const expiresAt = getTransferExpiryDate();

    // 5. Create transfer record
    const { data: transfer, error: insertError } = await supabase
      .from('ownership_transfers')
      .insert({
        organization_id: organizationId,
        from_user_id: fromUserId,
        to_user_id: data.to_user_id,
        status: 'pending',
        confirmation_token: confirmationToken,
        reason: data.reason || null,
        expires_at: expiresAt.toISOString(),
        initiated_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (insertError || !transfer) {
      console.error('Error creating transfer:', insertError);
      return { success: false, error: 'Failed to create ownership transfer' };
    }

    // 6. Log activity
    await logOwnershipTransferInitiated(
      organizationId,
      fromUserId,
      data.to_user_id,
      transfer.id
    );

    // 7. Send notification email to new owner
    const confirmationUrl = `${process.env.NEXT_PUBLIC_APP_URL}/confirm-ownership?token=${confirmationToken}`;

    await sendOwnershipTransferNotification({
      to_email: toUser.email,
      to_name: toUser.full_name,
      organization_name: organization.name,
      current_owner_name: fromUser.full_name,
      confirmation_url: confirmationUrl,
      expires_at: expiresAt,
    });

    return { success: true, transfer: transfer as OwnershipTransfer };
  } catch (error) {
    console.error('Error initiating ownership transfer:', error);
    return { success: false, error: 'Failed to initiate ownership transfer' };
  }
}

// ============================================================================
// Transfer Validation
// ============================================================================

/**
 * Validates a transfer token and retrieves transfer details
 *
 * @param token - Confirmation token
 * @returns Transfer details or error
 */
export async function validateTransferToken(
  token: string
): Promise<{ valid: true; transfer: OwnershipTransfer } | { valid: false; error: string }> {
  try {
    const supabase = await createClient();

    // 1. Get transfer
    const { data: transfer } = await supabase
      .from('ownership_transfers')
      .select(`
        *,
        organization:organizations (id, name),
        from_user:users!ownership_transfers_from_user_id_fkey (id, full_name, email),
        to_user:users!ownership_transfers_to_user_id_fkey (id, full_name, email)
      `)
      .eq('confirmation_token', token)
      .single();

    if (!transfer) {
      return { valid: false, error: 'Transfer not found' };
    }

    // 2. Check status
    if (transfer.status === 'confirmed') {
      return { valid: false, error: 'This transfer has already been confirmed' };
    }

    if (transfer.status === 'cancelled') {
      return { valid: false, error: 'This transfer has been cancelled' };
    }

    if (transfer.status === 'expired') {
      return { valid: false, error: 'This transfer has expired' };
    }

    // 3. Check expiry
    if (isTransferExpired(transfer.expires_at)) {
      // Mark as expired
      await supabase
        .from('ownership_transfers')
        .update({ status: 'expired', updated_at: new Date().toISOString() })
        .eq('id', transfer.id);

      return { valid: false, error: 'This transfer has expired' };
    }

    return { valid: true, transfer: transfer as OwnershipTransfer };
  } catch (error) {
    console.error('Error validating transfer token:', error);
    return { valid: false, error: 'Failed to validate transfer' };
  }
}

// ============================================================================
// Transfer Confirmation
// ============================================================================

/**
 * Confirms and executes an ownership transfer
 *
 * @param data - Confirmation data
 * @param confirmedBy - User ID confirming (must match to_user_id)
 * @returns Success or error
 */
export async function confirmOwnershipTransfer(
  data: OwnershipTransferConfirmation,
  confirmedBy: string
): Promise<{ success: true } | { success: false; error: string }> {
  try {
    // 1. Validate token
    const validation = await validateTransferToken(data.confirmation_token);
    if (!validation.valid) {
      return { success: false, error: validation.error };
    }

    const transfer = validation.transfer;

    // 2. Verify confirmer is the target user
    if (transfer.to_user_id !== confirmedBy) {
      return { success: false, error: 'Only the designated new owner can confirm this transfer' };
    }

    const supabase = await createClient();

    // 3. Execute the transfer (swap roles in organization_members)
    const { error: updateFromError } = await supabase
      .from('organization_members')
      .update({
        role: 'admin', // Demote from owner to admin
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', transfer.from_user_id)
      .eq('organization_id', transfer.organization_id)
      .is('deleted_at', null);

    if (updateFromError) {
      console.error('Error demoting previous owner:', updateFromError);
      return { success: false, error: 'Failed to complete transfer' };
    }

    const { error: updateToError } = await supabase
      .from('organization_members')
      .update({
        role: 'owner', // Promote to owner
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', transfer.to_user_id)
      .eq('organization_id', transfer.organization_id)
      .is('deleted_at', null);

    if (updateToError) {
      console.error('Error promoting new owner:', updateToError);
      // Rollback: restore previous owner
      await supabase
        .from('organization_members')
        .update({ role: 'owner', updated_at: new Date().toISOString() })
        .eq('user_id', transfer.from_user_id)
        .eq('organization_id', transfer.organization_id)
        .is('deleted_at', null);

      return { success: false, error: 'Failed to complete transfer' };
    }

    // 4. Mark transfer as confirmed
    const { error: transferUpdateError } = await supabase
      .from('ownership_transfers')
      .update({
        status: 'confirmed',
        confirmed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', transfer.id);

    if (transferUpdateError) {
      console.error('Error updating transfer status:', transferUpdateError);
      // Transfer is complete, just log the error
    }

    // 5. Log activity
    await logOwnershipTransferConfirmed(
      transfer.organization_id,
      transfer.to_user_id,
      transfer.from_user_id,
      transfer.id
    );

    // 6. Send confirmation emails
    const { data: organization } = await supabase
      .from('organizations')
      .select('name')
      .eq('id', transfer.organization_id)
      .single();

    if (organization) {
      // Get user details for emails
      const { data: users } = await supabase
        .from('users')
        .select('id, full_name, email')
        .in('id', [transfer.from_user_id, transfer.to_user_id]);

      if (users && users.length === 2) {
        const fromUser = users.find((u) => u.id === transfer.from_user_id);
        const toUser = users.find((u) => u.id === transfer.to_user_id);

        if (fromUser && toUser) {
          // Notify both users
          await sendOwnershipTransferConfirmed({
            to_email: fromUser.email,
            to_name: fromUser.full_name,
            organization_name: organization.name,
            new_owner_name: toUser.full_name,
          });

          await sendOwnershipTransferConfirmed({
            to_email: toUser.email,
            to_name: toUser.full_name,
            organization_name: organization.name,
            new_owner_name: toUser.full_name,
          });
        }
      }
    }

    return { success: true };
  } catch (error) {
    console.error('Error confirming ownership transfer:', error);
    return { success: false, error: 'Failed to confirm ownership transfer' };
  }
}

// ============================================================================
// Transfer Cancellation
// ============================================================================

/**
 * Cancels a pending ownership transfer
 *
 * @param transferId - Transfer ID
 * @param cancelledBy - User ID cancelling (must be from_user_id or admin/owner)
 * @returns Success or error
 */
export async function cancelOwnershipTransfer(
  transferId: string,
  cancelledBy: string
): Promise<{ success: true } | { success: false; error: string }> {
  try {
    const supabase = await createClient();

    // 1. Get transfer
    const { data: transfer } = await supabase
      .from('ownership_transfers')
      .select('*, organization_id, from_user_id, to_user_id, status')
      .eq('id', transferId)
      .single();

    if (!transfer) {
      return { success: false, error: 'Transfer not found' };
    }

    // 2. Verify status
    if (transfer.status !== 'pending') {
      return { success: false, error: `Cannot cancel ${transfer.status} transfer` };
    }

    // 3. Verify canceller has permission (must be current owner who initiated it)
    if (transfer.from_user_id !== cancelledBy) {
      return { success: false, error: 'Only the current owner can cancel this transfer' };
    }

    // 4. Update transfer status
    const { error: updateError } = await supabase
      .from('ownership_transfers')
      .update({
        status: 'cancelled',
        cancelled_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', transferId);

    if (updateError) {
      console.error('Error cancelling transfer:', updateError);
      return { success: false, error: 'Failed to cancel transfer' };
    }

    // 5. Log activity
    await logOwnershipTransferCancelled(
      transfer.organization_id,
      cancelledBy,
      transferId
    );

    return { success: true };
  } catch (error) {
    console.error('Error cancelling ownership transfer:', error);
    return { success: false, error: 'Failed to cancel ownership transfer' };
  }
}

// ============================================================================
// Transfer Queries
// ============================================================================

/**
 * Gets pending ownership transfer for an organization
 *
 * @param organizationId - Organization ID
 * @returns Pending transfer or null
 */
export async function getPendingTransfer(
  organizationId: string
): Promise<{ success: true; transfer: OwnershipTransfer | null } | { success: false; error: string }> {
  try {
    const supabase = await createClient();

    const { data: transfer, error } = await supabase
      .from('ownership_transfers')
      .select(`
        *,
        from_user:users!ownership_transfers_from_user_id_fkey (id, full_name, email),
        to_user:users!ownership_transfers_to_user_id_fkey (id, full_name, email)
      `)
      .eq('organization_id', organizationId)
      .eq('status', 'pending')
      .single();

    if (error && error.code !== 'PGRST116') {
      // PGRST116 = no rows returned (which is fine)
      console.error('Error fetching pending transfer:', error);
      return { success: false, error: 'Failed to fetch pending transfer' };
    }

    return { success: true, transfer: transfer as OwnershipTransfer | null };
  } catch (error) {
    console.error('Error getting pending transfer:', error);
    return { success: false, error: 'Failed to get pending transfer' };
  }
}

/**
 * Gets all ownership transfers for an organization
 *
 * @param organizationId - Organization ID
 * @param includeExpired - Whether to include expired transfers
 * @returns List of transfers
 */
export async function getOwnershipTransfers(
  organizationId: string,
  includeExpired: boolean = false
): Promise<{ success: true; transfers: OwnershipTransfer[] } | { success: false; error: string }> {
  try {
    const supabase = await createClient();

    let query = supabase
      .from('ownership_transfers')
      .select(`
        *,
        from_user:users!ownership_transfers_from_user_id_fkey (id, full_name, email),
        to_user:users!ownership_transfers_to_user_id_fkey (id, full_name, email)
      `)
      .eq('organization_id', organizationId);

    if (!includeExpired) {
      query = query.neq('status', 'expired');
    }

    query = query.order('initiated_at', { ascending: false });

    const { data: transfers, error } = await query;

    if (error) {
      console.error('Error fetching transfers:', error);
      return { success: false, error: 'Failed to fetch transfers' };
    }

    return { success: true, transfers: transfers as OwnershipTransfer[] };
  } catch (error) {
    console.error('Error getting transfers:', error);
    return { success: false, error: 'Failed to get transfers' };
  }
}

/**
 * Gets transfer by token (for confirmation page)
 *
 * @param token - Confirmation token
 * @returns Transfer details (without sensitive data)
 */
export async function getTransferByToken(
  token: string
): Promise<{ success: true; transfer: Partial<OwnershipTransfer> } | { success: false; error: string }> {
  const validation = await validateTransferToken(token);

  if (!validation.valid) {
    return { success: false, error: validation.error };
  }

  // Return limited data for display
  return {
    success: true,
    transfer: {
      id: validation.transfer.id,
      organization_id: validation.transfer.organization_id,
      from_user_id: validation.transfer.from_user_id,
      to_user_id: validation.transfer.to_user_id,
      status: validation.transfer.status,
      initiated_at: validation.transfer.initiated_at,
      expires_at: validation.transfer.expires_at,
    },
  };
}

// ============================================================================
// Cleanup
// ============================================================================

/**
 * Marks expired pending transfers as expired
 * Should be run periodically (e.g., hourly cron job)
 *
 * @returns Number of transfers marked as expired
 */
export async function cleanupExpiredTransfers(): Promise<number> {
  try {
    const supabase = await createClient();

    // Call the database function
    const { data, error } = await supabase.rpc('cleanup_expired_transfers');

    if (error) {
      console.error('Error cleaning up expired transfers:', error);
      return 0;
    }

    return data || 0;
  } catch (error) {
    console.error('Error in cleanup:', error);
    return 0;
  }
}
