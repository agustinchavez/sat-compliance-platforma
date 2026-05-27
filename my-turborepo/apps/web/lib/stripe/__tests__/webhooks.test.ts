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

// --- Shared mock state ---
let mockWebhookEventData: any = null;
let mockPaymentLinkData: any = { id: 'link-123', amount_centavos: 116050 };
let mockPaymentLinkUpdateError: any = null;

// Track calls for assertions
const mockFromFn = vi.fn();
const mockInsertFn = vi.fn();

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
  STRIPE_CONFIG: {
    CURRENCY: 'mxn',
    SUCCESS_URL_PATH: '/invoices/{invoiceId}/payment-success',
    CANCEL_URL_PATH: '/invoices/{invoiceId}',
    PAYMENT_LINK_EXPIRY_DAYS: 30,
    WEBHOOK_TOLERANCE_SECONDS: 300,
  },
  fromCentavos: vi.fn((centavos: number) => centavos / 100),
}));

vi.mock('@/lib/supabase/service-role-client', () => ({
  createServiceRoleClient: vi.fn(() => ({
    from: vi.fn((table: string) => {
      mockFromFn(table);
      if (table === 'stripe_webhook_events') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(() => Promise.resolve({ data: mockWebhookEventData })),
            })),
          })),
          insert: vi.fn((data: any) => {
            mockInsertFn(table, data);
            return Promise.resolve({ error: null });
          }),
        };
      }
      if (table === 'stripe_payment_links') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(() => Promise.resolve({
                data: mockPaymentLinkData,
              })),
            })),
          })),
          update: vi.fn(() => ({
            eq: vi.fn(() => Promise.resolve({ error: mockPaymentLinkUpdateError })),
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

vi.mock('@/lib/payments/service', () => ({
  recordPayment: vi.fn(),
  getInvoicePayments: vi.fn(),
  calculateOutstandingBalance: vi.fn(),
}));

vi.mock('@/lib/invoices/record-payment', () => ({
  recordAndProcessPayment: vi.fn(() => Promise.resolve({ payment: { id: 'payment-123' } })),
}));

describe('Stripe Webhooks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_123';
    // Reset mock state
    mockWebhookEventData = null;
    mockPaymentLinkData = { id: 'link-123', amount_centavos: 116050 };
    mockPaymentLinkUpdateError = null;
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
      mockWebhookEventData = { id: 'event-123' };
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

      expect(mockFromFn).toHaveBeenCalledWith('stripe_webhook_events');
      expect(mockInsertFn).toHaveBeenCalledWith(
        'stripe_webhook_events',
        expect.objectContaining({
          stripe_event_id: 'evt_123',
          event_type: 'checkout.session.completed',
          processed: true,
          error_message: null,
        })
      );
    });

    it('should insert event record with processed=false and error', async () => {
      const event: VerifiedWebhookEvent = {
        stripeEventId: 'evt_123',
        type: 'checkout.session.completed',
        data: { test: 'data' },
        createdAt: 1234567890,
      };

      await recordWebhookEvent(event, false, 'Test error');

      expect(mockFromFn).toHaveBeenCalledWith('stripe_webhook_events');
      expect(mockInsertFn).toHaveBeenCalledWith(
        'stripe_webhook_events',
        expect.objectContaining({
          stripe_event_id: 'evt_123',
          processed: false,
          error_message: 'Test error',
        })
      );
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

      const { recordAndProcessPayment } = await import('@/lib/invoices/record-payment');
      expect(recordAndProcessPayment).toHaveBeenCalled();
    });
  });

  describe('onPaymentIntentFailed', () => {
    it('should update payment link status to payment_failed', async () => {
      const paymentIntent = {
        id: 'pi_test_123',
      } as any;

      await onPaymentIntentFailed(paymentIntent);

      expect(mockFromFn).toHaveBeenCalledWith('stripe_payment_links');
    });

    it('should not throw if payment link not found', async () => {
      mockPaymentLinkData = null;

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

      const { recordAndProcessPayment } = await import('@/lib/invoices/record-payment');
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

      expect(mockFromFn).toHaveBeenCalledWith('stripe_payment_links');
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
