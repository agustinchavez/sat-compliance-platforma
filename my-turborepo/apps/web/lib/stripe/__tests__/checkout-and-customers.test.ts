/**
 * Tests for Stripe Checkout and Customers (Component 19)
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';
import { StripeGatewayError } from '../errors';
import type { CheckoutSessionInput, PaymentLinkInput } from '../types';

// --- Shared mock state (mutated per-test to control behavior) ---
let mockInvoiceData: any = {
  id: 'inv-123',
  status: 'stamped',
  total: 1160.50,
  folio_number: 123,
  receiver_name: 'Test Customer',
  payment_status: 'unpaid',
};
let mockInvoiceError: any = null;
let mockOrgData: any = { stripe_customer_id: null };
let mockOrgError: any = null;
let mockPaymentData: any = null;
let mockLinkInsertData: any = { id: 'link-123' };
let mockLinkSelectData: any = {
  stripe_payment_link_id: 'plink_test_123',
  stripe_checkout_session_id: null,
  status: 'active',
};
let mockLinkSelectError: any = null;

// Shared Stripe API mocks
const mockCheckoutSessionsCreate = vi.fn(() =>
  Promise.resolve({
    id: 'cs_test_123',
    url: 'https://checkout.stripe.com/pay/cs_test_123',
    expires_at: Math.floor(Date.now() / 1000) + 86400,
  })
);
const mockProductsCreate = vi.fn(() => Promise.resolve({ id: 'prod_test_123' }));
const mockPricesCreate = vi.fn(() => Promise.resolve({ id: 'price_test_123' }));
const mockPaymentLinksCreate = vi.fn(() =>
  Promise.resolve({ id: 'plink_test_123', url: 'https://buy.stripe.com/test_123' })
);
const mockPaymentLinksUpdate = vi.fn(() => Promise.resolve({}));

vi.mock('../client', () => ({
  getStripeClient: vi.fn(() => ({
    customers: { create: vi.fn(() => Promise.resolve({ id: 'cus_new_123' })) },
    checkout: { sessions: { create: mockCheckoutSessionsCreate } },
    products: { create: mockProductsCreate },
    prices: { create: mockPricesCreate },
    paymentLinks: {
      create: mockPaymentLinksCreate,
      update: mockPaymentLinksUpdate,
    },
  })),
  STRIPE_CONFIG: {
    CURRENCY: 'mxn',
    SUCCESS_URL_PATH: '/invoices/{invoiceId}/payment-success',
    CANCEL_URL_PATH: '/invoices/{invoiceId}',
  },
  toCentavos: vi.fn((amount: number) => Math.round(amount * 100)),
}));

vi.mock('@/lib/supabase/service-role-client', () => ({
  createServiceRoleClient: vi.fn(() => ({
    from: vi.fn((table: string) => {
      if (table === 'organizations') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn(() => Promise.resolve({ data: mockOrgData, error: mockOrgError })),
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
              single: vi.fn(() => Promise.resolve({ data: mockInvoiceData, error: mockInvoiceError })),
            })),
          })),
        };
      }
      if (table === 'payments') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(() => Promise.resolve({ data: mockPaymentData })),
            })),
          })),
        };
      }
      if (table === 'stripe_payment_links') {
        return {
          insert: vi.fn(() => ({
            select: vi.fn(() => ({
              single: vi.fn(() => Promise.resolve({ data: mockLinkInsertData, error: null })),
            })),
          })),
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn(() => Promise.resolve({ data: mockLinkSelectData, error: mockLinkSelectError })),
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

describe('Stripe Checkout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_APP_URL = 'https://example.com';
    // Reset mock state to defaults
    mockInvoiceData = {
      id: 'inv-123',
      status: 'stamped',
      total: 1160.50,
      folio_number: 123,
      receiver_name: 'Test Customer',
      payment_status: 'unpaid',
    };
    mockInvoiceError = null;
    mockOrgData = { stripe_customer_id: null };
    mockOrgError = null;
    mockPaymentData = null;
    mockLinkInsertData = { id: 'link-123' };
    mockLinkSelectData = {
      stripe_payment_link_id: 'plink_test_123',
      stripe_checkout_session_id: null,
      status: 'active',
    };
    mockLinkSelectError = null;
  });

  describe('createCheckoutSession', () => {
    it('should create checkout session successfully', async () => {
      const { createCheckoutSession } = await import('../checkout');

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
      mockInvoiceData = null;
      mockInvoiceError = new Error('Not found');

      const { createCheckoutSession } = await import('../checkout');

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
      mockInvoiceData = { id: 'inv-123', status: 'draft' };

      const { createCheckoutSession } = await import('../checkout');

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
      mockInvoiceData = { id: 'inv-123', status: 'stamped', payment_status: 'paid' };

      const { createCheckoutSession } = await import('../checkout');

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
      const { createCheckoutSession } = await import('../checkout');

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
      const { createCheckoutSession } = await import('../checkout');

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
      const { createCheckoutSession } = await import('../checkout');

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
      expect(mockCheckoutSessionsCreate).toHaveBeenCalled();
    });
  });

  describe('createPaymentLink', () => {
    it('should create payment link successfully', async () => {
      const { createPaymentLink } = await import('../checkout');

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
      const { createPaymentLink } = await import('../checkout');

      const input: PaymentLinkInput = {
        invoiceId: 'inv-123',
        organizationId: 'org-123',
        amountMXN: 1160.50,
        invoiceFolio: 'A-123',
        receiverName: 'Test Customer',
      };

      await createPaymentLink(input);
      expect(mockProductsCreate).toHaveBeenCalled();
    });

    it('should create Stripe price', async () => {
      const { createPaymentLink } = await import('../checkout');

      const input: PaymentLinkInput = {
        invoiceId: 'inv-123',
        organizationId: 'org-123',
        amountMXN: 1160.50,
        invoiceFolio: 'A-123',
        receiverName: 'Test Customer',
      };

      await createPaymentLink(input);
      expect(mockPricesCreate).toHaveBeenCalled();
    });

    it('should validate invoice status', async () => {
      mockInvoiceData = { id: 'inv-123', status: 'cancelled' };

      const { createPaymentLink } = await import('../checkout');

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
      const { expirePaymentLink } = await import('../checkout');
      await expirePaymentLink('link-123');
      expect(mockPaymentLinksUpdate).toHaveBeenCalledWith('plink_test_123', { active: false });
    });

    it('should throw error if link not found', async () => {
      mockLinkSelectData = null;
      mockLinkSelectError = new Error('Not found');

      const { expirePaymentLink } = await import('../checkout');
      await expect(expirePaymentLink('link-invalid')).rejects.toThrow(StripeGatewayError);
    });

    it('should skip if already expired', async () => {
      mockLinkSelectData = {
        stripe_payment_link_id: 'plink_test_123',
        status: 'expired',
      };

      const { expirePaymentLink } = await import('../checkout');
      await expirePaymentLink('link-123');
      expect(mockPaymentLinksUpdate).not.toHaveBeenCalled();
    });

    it('should deactivate Stripe payment link', async () => {
      const { expirePaymentLink } = await import('../checkout');
      await expirePaymentLink('link-123');
      expect(mockPaymentLinksUpdate).toHaveBeenCalledWith('plink_test_123', { active: false });
    });
  });
});
