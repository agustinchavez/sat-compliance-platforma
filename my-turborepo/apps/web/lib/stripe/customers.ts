/**
 * Stripe Customer Management (Component 19)
 *
 * Handles Stripe customer creation and retrieval for organizations.
 */

import { getStripeClient } from './client';
import { StripeGatewayError } from './errors';
import { createServiceRoleClient } from '@/lib/supabase/service-role-client';

/**
 * Gets or creates a Stripe customer for the given organization.
 *
 * Flow:
 * 1. Check if organization already has stripe_customer_id in DB
 * 2. If yes, return it (trust that it exists in Stripe)
 * 3. If no, create new Stripe customer with org metadata
 * 4. Save stripe_customer_id to organizations table
 * 5. Return the customer ID
 *
 * @param organizationId - The organization's UUID
 * @param email - Primary contact email for the organization
 * @param name - Organization name (for Stripe customer record)
 * @returns Stripe customer ID (cus_...)
 * @throws StripeGatewayError if creation fails or DB update fails
 */
export async function getOrCreateStripeCustomer(
  organizationId: string,
  email: string,
  name: string
): Promise<string> {
  const supabase = createServiceRoleClient();

  // 1. Check if organization already has a Stripe customer
  const { data: org, error: fetchError } = await supabase
    .from('organizations')
    .select('stripe_customer_id')
    .eq('id', organizationId)
    .single();

  if (fetchError) {
    throw new StripeGatewayError(
      'STRIPE_NOT_CONFIGURED',
      `Failed to fetch organization: ${fetchError.message}`,
      undefined,
      fetchError as Error
    );
  }

  // 2. If customer already exists, return it
  if (org.stripe_customer_id) {
    return org.stripe_customer_id;
  }

  // 3. Create new Stripe customer
  const stripe = getStripeClient();
  let stripeCustomer;

  try {
    stripeCustomer = await stripe.customers.create({
      email,
      name,
      metadata: {
        organization_id: organizationId,
      },
    });
  } catch (err) {
    throw new StripeGatewayError(
      'STRIPE_NOT_CONFIGURED',
      `Failed to create Stripe customer: ${(err as Error).message}`,
      undefined,
      err as Error
    );
  }

  // 4. Save customer ID to database
  const { error: updateError } = await supabase
    .from('organizations')
    .update({ stripe_customer_id: stripeCustomer.id })
    .eq('id', organizationId);

  if (updateError) {
    // Customer created in Stripe but failed to save to DB
    // Log this error but return the customer ID anyway - operator can fix DB manually
    console.error(
      `[Stripe] Created customer ${stripeCustomer.id} but failed to save to org ${organizationId}:`,
      updateError
    );
    throw new StripeGatewayError(
      'STRIPE_NOT_CONFIGURED',
      `Created Stripe customer but failed to save ID: ${updateError.message}`,
      undefined,
      updateError as Error
    );
  }

  // 5. Return the customer ID
  return stripeCustomer.id;
}
