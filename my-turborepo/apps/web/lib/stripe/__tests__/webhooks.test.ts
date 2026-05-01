/**
 * Tests for Stripe Webhooks (Component 19)
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  verifyWebhookSignature,
  isEventAlreadyProcessed,
  recordWebhookEvent,
  handleWebhookEvent,
  onCheckoutSessionCompleted,
  onPaymentIntentFailed
} from '../webhooks';
import { StripeGatewayError } from '../errors';
import type { VerifiedWebhookEvent } from '../types';

// Mock dependencies
vi.mock('../client', () => ({
  getStripeClient: vi.fn(() => ({
    webhooks: {
      constructEvent: vi.fn((rawBody, signature, secret, tolerance) => {
        if (signature === 'invalid') {
          throw new Error('Invalid signature');
        }
        return {
          id: 'evt_test_123',
          type: 'checkout.session.completed',
          data: {
            object: {
              id: 'cs_test_123',
              metadata: {
                invoice_id: 'inv-123',
                organization_id: 'org-123',
              },
              payment_intent: 'pi_test_123',
              customer: 'cus_test_123',
            },
          },
          created: 1234567890,
        };
      }),
    },
  })),
  fromCentavos: vi.fn((centavos) => centavos / 100),
}));

vi.mock('@/lib/supabase/service-role-client', () => ({
  createServiceRoleClient: vi.fn(() => ({
    from: vi.fn((table) => {
      if (table === 'stripe_webhook_events') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(() => Promise.resolve({ data: null })),
            })),
          })),
          insert: vi.fn(() => Promise.resolve({ error: null })),
        };
      }
      if (table === 'stripe_payment_links') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(() => Promise.resolve({
                data: { id: 'link-123', amount_centavos: 116050 },
              })),
            })),
          })),
          update: vi.fn(() => ({
            eq: vi.fn(() => Promise.resolve({ error: null })),
          })),
        };
      }
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            single: vi.fn(() => Promise.resolve({ data: null, error: null })),
            maybeSingle: vi.fn(() => Promise.resolve({ data: null })),
          })),
        })),
      };
    }),
  })),
}));

vi.mock('@/lib/invoices/payment', () => ({
  recordAndProcessPayment: vi.fn(() => Promise.resolve('payment-123')),
}));

describe('Stripe Webhooks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_123';
  });

  describe('verifyWebhookSignature', () => {
    it('should throw error if STRIPE_WEBHOOK_SECRET is not set', () => {
      delete process.env.STRIPE_WEBHOOK_SECRET;
      expect(() => verifyWebhookSignature('raw body', 'signature')).toThrow(
        'STRIPE_WEBHOOK_SECRET environment variable is not set'
      );
    });

    it('should verify signature and return parsed event', () => {
      const event = verifyWebhookSignature('raw body', 'valid-signature');
      expect(event.stripeEventId).toBe('evt_test_123');
      expect(event.type).toBe('checkout.session.completed');
      expect(event.createdAt).toBe(1234567890);
    });

    it('should throw StripeGatewayError on invalid signature', () => {
      expect(() => verifyWebhookSignature('raw body', 'invalid')).toThrow(StripeGatewayError);
    });

    it('should throw WEBHOOK_SIGNATURE_INVALID error code', () => {
      try {
        verifyWebhookSignature('raw body', 'invalid');
        expect.fail('Should have thrown');
      } catch (err) {
        expect((err as StripeGatewayError).code).toBe('WEBHOOK_SIGNATURE_INVALID');
      }
    });
  });

  describe('isEventAlreadyProcessed', () => {
    it('should return false if event not found', async () => {
      const result = await isEventAlreadyProcessed('evt_new_123');
      expect(result).toBe(false);
    });

    it('should return true if event found', async () => {
      const { createServiceRoleClient } = await import('@/lib/supabase/service-role-client');
      const mockSupabase = createServiceRoleClient();
      vi.mocked(mockSupabase.from('stripe_webhook_events').select().eq).mockReturnValue({
        maybeSingle: vi.fn(() => Promise.resolve({ data: { id: 'event-123' } })),
      } as any);

      const result = await isEventAlreadyProcessed('evt_existing_123');
      expect(result).toBe(true);
    });
  });

  describe('recordWebhookEvent', () => {
    it('should insert event record with processed=true', async () => {
      const event: VerifiedWebhookEvent = {
        stripeEventId: 'evt_123',
        type: 'checkout.session.completed',
        data: { test: 'data' },
        createdAt: 1234567890,
      };

      await recordWebhookEvent(event, true);

      const { createServiceRoleClient } = await import('@/lib/supabase/service-role-client');
      const mockSupabase = createServiceRoleClient();
      expect(mockSupabase.from).toHaveBeenCalledWith('stripe_webhook_events');
    });

    it('should insert event record with processed=false and error', async () => {
      const event: VerifiedWebhookEvent = {
        stripeEventId: 'evt_123',
        type: 'checkout.session.completed',
        data: { test: 'data' },
        createdAt: 1234567890,
      };

      await recordWebhookEvent(event, false, 'Test error');

      const { createServiceRoleClient } = await import('@/lib/supabase/service-role-client');
      const mockSupabase = createServiceRoleClient();
      expect(mockSupabase.from).toHaveBeenCalledWith('stripe_webhook_events');
    });
  });

  describe('onCheckoutSessionCompleted', () => {
    it('should throw error if metadata missing invoice_id', async () => {
      const session = {
        id: 'cs_test_123',
        metadata: { organization_id: 'org-123' },
      } as any;

      await expect(onCheckoutSessionCompleted(session)).rejects.toThrow(
        'missing required metadata'
      );
    });

    it('should throw error if metadata missing organization_id', async () => {
      const session = {
        id: 'cs_test_123',
        metadata: { invoice_id: 'inv-123' },
      } as any;

      await expect(onCheckoutSessionCompleted(session)).rejects.toThrow(
        'missing required metadata'
      );
    });

    it('should process valid session and record payment', async () => {
      const session = {
        id: 'cs_test_123',
        metadata: {
          invoice_id: 'inv-123',
          organization_id: 'org-123',
        },
        payment_intent: 'pi_test_123',
        customer: 'cus_test_123',
      } as any;

      await onCheckoutSessionCompleted(session);

      const { recordAndProcessPayment } = await import('@/lib/invoices/payment');
      expect(recordAndProcessPayment).toHaveBeenCalled();
    });
  });

  describe('onPaymentIntentFailed', () => {
    it('should update payment link status to payment_failed', async () => {
      const paymentIntent = {
        id: 'pi_test_123',
      } as any;

      await onPaymentIntentFailed(paymentIntent);

      const { createServiceRoleClient } = await import('@/lib/supabase/service-role-client');
      const mockSupabase = createServiceRoleClient();
      expect(mockSupabase.from).toHaveBeenCalledWith('stripe_payment_links');
    });

    it('should not throw if payment link not found', async () => {
      const paymentIntent = {
        id: 'pi_nonexistent',
      } as any;

      await expect(onPaymentIntentFailed(paymentIntent)).resolves.not.toThrow();
    });
  });

  describe('handleWebhookEvent', () => {
    it('should route checkout.session.completed to handler', async () => {
      const event: VerifiedWebhookEvent = {
        stripeEventId: 'evt_123',
        type: 'checkout.session.completed',
        data: {
          id: 'cs_test_123',
          metadata: {
            invoice_id: 'inv-123',
            organization_id: 'org-123',
          },
          payment_intent: 'pi_test_123',
          customer: 'cus_test_123',
        } as any,
        createdAt: 1234567890,
      };

      await handleWebhookEvent(event);

      const { recordAndProcessPayment } = await import('@/lib/invoices/payment');
      expect(recordAndProcessPayment).toHaveBeenCalled();
    });

    it('should route payment_intent.payment_failed to handler', async () => {
      const event: VerifiedWebhookEvent = {
        stripeEventId: 'evt_123',
        type: 'payment_intent.payment_failed',
        data: {
          id: 'pi_test_123',
        } as any,
        createdAt: 1234567890,
      };

      await handleWebhookEvent(event);

      const { createServiceRoleClient } = await import('@/lib/supabase/service-role-client');
      const mockSupabase = createServiceRoleClient();
      expect(mockSupabase.from).toHaveBeenCalledWith('stripe_payment_links');
    });

    it('should skip unhandled event types', async () => {
      const event: VerifiedWebhookEvent = {
        stripeEventId: 'evt_123',
        type: 'customer.created',
        data: {} as any,
        createdAt: 1234567890,
      };

      await expect(handleWebhookEvent(event)).resolves.not.toThrow();
    });
  });
});
