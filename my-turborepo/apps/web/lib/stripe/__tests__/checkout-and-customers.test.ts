/**
 * Tests for Stripe Checkout and Customers (Component 19)
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';
import { createCheckoutSession, createPaymentLink, expirePaymentLink } from '../checkout';
import { getOrCreateStripeCustomer } from '../customers';
import { StripeGatewayError } from '../errors';
import type { CheckoutSessionInput, PaymentLinkInput } from '../types';

// Mock Stripe client
vi.mock('../client', () => ({
  getStripeClient: vi.fn(() => ({
    customers: {
      create: vi.fn(() => Promise.resolve({ id: 'cus_new_123' })),
    },
    checkout: {
      sessions: {
        create: vi.fn((params) => {
          if (params.customer === 'cus_error') {
            throw new Error('Stripe API error');
          }
          return Promise.resolve({
            id: 'cs_test_123',
            url: 'https://checkout.stripe.com/pay/cs_test_123',
            expires_at: Math.floor(Date.now() / 1000) + 86400,
          });
        }),
      },
    },
    products: {
      create: vi.fn(() => Promise.resolve({ id: 'prod_test_123' })),
    },
    prices: {
      create: vi.fn(() => Promise.resolve({ id: 'price_test_123' })),
    },
    paymentLinks: {
      create: vi.fn(() => Promise.resolve({
        id: 'plink_test_123',
        url: 'https://buy.stripe.com/test_123',
      })),
      update: vi.fn(() => Promise.resolve({})),
    },
  })),
  STRIPE_CONFIG: {
    CURRENCY: 'mxn',
    SUCCESS_URL_PATH: '/invoices/{invoiceId}/payment-success',
    CANCEL_URL_PATH: '/invoices/{invoiceId}',
  },
  toCentavos: vi.fn((amount) => Math.round(amount * 100)),
}));

// Mock Supabase
vi.mock('@/lib/supabase/service-role-client', () => ({
  createServiceRoleClient: vi.fn(() => ({
    from: vi.fn((table) => {
      if (table === 'organizations') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn(() => Promise.resolve({
                data: { stripe_customer_id: null },
                error: null,
              })),
            })),
          })),
          update: vi.fn(() => ({
            eq: vi.fn(() => Promise.resolve({ error: null })),
          })),
        };
      }
      if (table === 'invoices') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn(() => Promise.resolve({
                data: {
                  id: 'inv-123',
                  status: 'stamped',
                  total_amount: 1160.50,
                  folio: 'A-123',
                  receiver_name: 'Test Customer',
                  receiver_email: 'test@example.com',
                },
                error: null,
              })),
            })),
          })),
        };
      }
      if (table === 'payments') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(() => Promise.resolve({ data: null })),
            })),
          })),
        };
      }
      if (table === 'stripe_payment_links') {
        return {
          insert: vi.fn(() => ({
            select: vi.fn(() => ({
              single: vi.fn(() => Promise.resolve({
                data: { id: 'link-123' },
                error: null,
              })),
            })),
          })),
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn(() => Promise.resolve({
                data: {
                  stripe_payment_link_id: 'plink_test_123',
                  stripe_checkout_session_id: null,
                  status: 'active',
                },
                error: null,
              })),
            })),
          })),
          update: vi.fn(() => ({
            eq: vi.fn(() => Promise.resolve({ error: null })),
          })),
        };
      }
      return {};
    }),
  })),
}));

vi.mock('../customers', () => ({
  getOrCreateStripeCustomer: vi.fn(() => Promise.resolve('cus_test_123')),
}));

describe('Stripe Customers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getOrCreateStripeCustomer', () => {
    it('should return existing customer ID if found', async () => {
      const { createServiceRoleClient } = await import('@/lib/supabase/service-role-client');
      const mockSupabase = createServiceRoleClient();
      vi.mocked(mockSupabase.from('organizations').select().eq).mockReturnValue({
        single: vi.fn(() => Promise.resolve({
          data: { stripe_customer_id: 'cus_existing_123' },
          error: null,
        })),
      } as any);

      const customerId = await vi.importActual<typeof import('../customers')>('../customers')
        .then(m => m.getOrCreateStripeCustomer('org-123', 'test@example.com', 'Test Org'));

      expect(customerId).toBe('cus_existing_123');
    });

    it('should create new customer if not found', async () => {
      const customerId = await vi.importActual<typeof import('../customers')>('../customers')
        .then(m => m.getOrCreateStripeCustomer('org-123', 'test@example.com', 'Test Org'));

      expect(customerId).toBe('cus_new_123');
    });

    it('should throw error if organization not found', async () => {
      const { createServiceRoleClient } = await import('@/lib/supabase/service-role-client');
      const mockSupabase = createServiceRoleClient();
      vi.mocked(mockSupabase.from('organizations').select().eq).mockReturnValue({
        single: vi.fn(() => Promise.resolve({
          data: null,
          error: new Error('Not found'),
        })),
      } as any);

      await expect(
        vi.importActual<typeof import('../customers')>('../customers')
          .then(m => m.getOrCreateStripeCustomer('org-invalid', 'test@example.com', 'Test Org'))
      ).rejects.toThrow();
    });
  });
});

describe('Stripe Checkout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_APP_URL = 'https://example.com';
  });

  describe('createCheckoutSession', () => {
    it('should create checkout session successfully', async () => {
      const input: CheckoutSessionInput = {
        invoiceId: 'inv-123',
        organizationId: 'org-123',
        amountMXN: 1160.50,
        invoiceFolio: 'A-123',
        receiverName: 'Test Customer',
      };

      const result = await createCheckoutSession(input);

      expect(result.checkoutUrl).toBe('https://checkout.stripe.com/pay/cs_test_123');
      expect(result.sessionId).toBe('cs_test_123');
      expect(result.paymentLinkDbId).toBe('link-123');
    });

    it('should throw error if invoice not found', async () => {
      const { createServiceRoleClient } = await import('@/lib/supabase/service-role-client');
      const mockSupabase = createServiceRoleClient();
      vi.mocked(mockSupabase.from('invoices').select().eq).mockReturnValue({
        single: vi.fn(() => Promise.resolve({
          data: null,
          error: new Error('Not found'),
        })),
      } as any);

      const input: CheckoutSessionInput = {
        invoiceId: 'inv-invalid',
        organizationId: 'org-123',
        amountMXN: 1160.50,
        invoiceFolio: 'A-123',
        receiverName: 'Test Customer',
      };

      await expect(createCheckoutSession(input)).rejects.toThrow(StripeGatewayError);
    });

    it('should throw error if invoice status is draft', async () => {
      const { createServiceRoleClient } = await import('@/lib/supabase/service-role-client');
      const mockSupabase = createServiceRoleClient();
      vi.mocked(mockSupabase.from('invoices').select().eq).mockReturnValue({
        single: vi.fn(() => Promise.resolve({
          data: { id: 'inv-123', status: 'draft' },
          error: null,
        })),
      } as any);

      const input: CheckoutSessionInput = {
        invoiceId: 'inv-123',
        organizationId: 'org-123',
        amountMXN: 1160.50,
        invoiceFolio: 'A-123',
        receiverName: 'Test Customer',
      };

      await expect(createCheckoutSession(input)).rejects.toThrow('cannot create payment link');
    });

    it('should throw error if invoice already paid', async () => {
      const { createServiceRoleClient } = await import('@/lib/supabase/service-role-client');
      const mockSupabase = createServiceRoleClient();
      vi.mocked(mockSupabase.from('payments').select().eq).mockReturnValue({
        maybeSingle: vi.fn(() => Promise.resolve({
          data: { id: 'payment-123' },
        })),
      } as any);

      const input: CheckoutSessionInput = {
        invoiceId: 'inv-123',
        organizationId: 'org-123',
        amountMXN: 1160.50,
        invoiceFolio: 'A-123',
        receiverName: 'Test Customer',
      };

      await expect(createCheckoutSession(input)).rejects.toThrow('already paid');
    });

    it('should use provided Stripe customer ID', async () => {
      const input: CheckoutSessionInput = {
        invoiceId: 'inv-123',
        organizationId: 'org-123',
        amountMXN: 1160.50,
        invoiceFolio: 'A-123',
        receiverName: 'Test Customer',
        stripeCustomerId: 'cus_provided_123',
      };

      await createCheckoutSession(input);

      const { getOrCreateStripeCustomer: mockGetOrCreate } = await import('../customers');
      expect(mockGetOrCreate).not.toHaveBeenCalled();
    });

    it('should create Stripe customer if not provided', async () => {
      const input: CheckoutSessionInput = {
        invoiceId: 'inv-123',
        organizationId: 'org-123',
        amountMXN: 1160.50,
        invoiceFolio: 'A-123',
        receiverName: 'Test Customer',
      };

      await createCheckoutSession(input);

      const { getOrCreateStripeCustomer: mockGetOrCreate } = await import('../customers');
      expect(mockGetOrCreate).toHaveBeenCalled();
    });

    it('should include expiry if provided', async () => {
      const expiresAt = new Date(Date.now() + 86400000);
      const input: CheckoutSessionInput = {
        invoiceId: 'inv-123',
        organizationId: 'org-123',
        amountMXN: 1160.50,
        invoiceFolio: 'A-123',
        receiverName: 'Test Customer',
        expiresAt,
      };

      await createCheckoutSession(input);

      const { getStripeClient } = await import('../client');
      const mockStripe = getStripeClient();
      expect(mockStripe.checkout.sessions.create).toHaveBeenCalled();
    });
  });

  describe('createPaymentLink', () => {
    it('should create payment link successfully', async () => {
      const input: PaymentLinkInput = {
        invoiceId: 'inv-123',
        organizationId: 'org-123',
        amountMXN: 1160.50,
        invoiceFolio: 'A-123',
        receiverName: 'Test Customer',
      };

      const result = await createPaymentLink(input);

      expect(result.url).toBe('https://buy.stripe.com/test_123');
      expect(result.paymentLinkId).toBe('plink_test_123');
      expect(result.paymentLinkDbId).toBe('link-123');
    });

    it('should create Stripe product', async () => {
      const input: PaymentLinkInput = {
        invoiceId: 'inv-123',
        organizationId: 'org-123',
        amountMXN: 1160.50,
        invoiceFolio: 'A-123',
        receiverName: 'Test Customer',
      };

      await createPaymentLink(input);

      const { getStripeClient } = await import('../client');
      const mockStripe = getStripeClient();
      expect(mockStripe.products.create).toHaveBeenCalled();
    });

    it('should create Stripe price', async () => {
      const input: PaymentLinkInput = {
        invoiceId: 'inv-123',
        organizationId: 'org-123',
        amountMXN: 1160.50,
        invoiceFolio: 'A-123',
        receiverName: 'Test Customer',
      };

      await createPaymentLink(input);

      const { getStripeClient } = await import('../client');
      const mockStripe = getStripeClient();
      expect(mockStripe.prices.create).toHaveBeenCalled();
    });

    it('should validate invoice status', async () => {
      const { createServiceRoleClient } = await import('@/lib/supabase/service-role-client');
      const mockSupabase = createServiceRoleClient();
      vi.mocked(mockSupabase.from('invoices').select().eq).mockReturnValue({
        single: vi.fn(() => Promise.resolve({
          data: { id: 'inv-123', status: 'cancelled' },
          error: null,
        })),
      } as any);

      const input: PaymentLinkInput = {
        invoiceId: 'inv-123',
        organizationId: 'org-123',
        amountMXN: 1160.50,
        invoiceFolio: 'A-123',
        receiverName: 'Test Customer',
      };

      await expect(createPaymentLink(input)).rejects.toThrow('cannot create payment link');
    });
  });

  describe('expirePaymentLink', () => {
    it('should expire payment link successfully', async () => {
      await expirePaymentLink('link-123');

      const { createServiceRoleClient } = await import('@/lib/supabase/service-role-client');
      const mockSupabase = createServiceRoleClient();
      expect(mockSupabase.from).toHaveBeenCalledWith('stripe_payment_links');
    });

    it('should throw error if link not found', async () => {
      const { createServiceRoleClient } = await import('@/lib/supabase/service-role-client');
      const mockSupabase = createServiceRoleClient();
      vi.mocked(mockSupabase.from('stripe_payment_links').select().eq).mockReturnValue({
        single: vi.fn(() => Promise.resolve({
          data: null,
          error: new Error('Not found'),
        })),
      } as any);

      await expect(expirePaymentLink('link-invalid')).rejects.toThrow('not found');
    });

    it('should skip if already expired', async () => {
      const { createServiceRoleClient } = await import('@/lib/supabase/service-role-client');
      const mockSupabase = createServiceRoleClient();
      vi.mocked(mockSupabase.from('stripe_payment_links').select().eq).mockReturnValue({
        single: vi.fn(() => Promise.resolve({
          data: {
            stripe_payment_link_id: 'plink_test_123',
            status: 'expired',
          },
          error: null,
        })),
      } as any);

      await expirePaymentLink('link-123');

      const { getStripeClient } = await import('../client');
      const mockStripe = getStripeClient();
      expect(mockStripe.paymentLinks.update).not.toHaveBeenCalled();
    });

    it('should deactivate Stripe payment link', async () => {
      await expirePaymentLink('link-123');

      const { getStripeClient } = await import('../client');
      const mockStripe = getStripeClient();
      expect(mockStripe.paymentLinks.update).toHaveBeenCalledWith('plink_test_123', { active: false });
    });
  });
});
