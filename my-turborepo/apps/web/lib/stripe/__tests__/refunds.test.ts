/**
 * Tests for Stripe Refunds (Component 19)
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';
import { processRefund } from '../refunds';
import { StripeGatewayError } from '../errors';
import type { RefundInput } from '../types';

// Mock Stripe client
vi.mock('../client', () => ({
  getStripeClient: vi.fn(() => ({
    refunds: {
      create: vi.fn((params) => {
        if (params.payment_intent === 'pi_error') {
          throw new Error('Stripe API error');
        }
        return Promise.resolve({
          id: 're_test_123',
          amount: params.amount || 116050,
          status: 'succeeded',
        });
      }),
    },
  })),
  toCentavos: vi.fn((amount) => Math.round(amount * 100)),
  fromCentavos: vi.fn((centavos) => centavos / 100),
}));

describe('Stripe Refunds', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('processRefund', () => {
    it('should process full refund successfully', async () => {
      const input: RefundInput = {
        paymentIntentId: 'pi_test_123',
      };

      const result = await processRefund(input);

      expect(result.refundId).toBe('re_test_123');
      expect(result.status).toBe('succeeded');
      expect(result.amountMXN).toBe(1160.50);
    });

    it('should process partial refund successfully', async () => {
      const input: RefundInput = {
        paymentIntentId: 'pi_test_123',
        amountMXN: 500.00,
      };

      const result = await processRefund(input);

      expect(result.refundId).toBe('re_test_123');
      expect(result.status).toBe('succeeded');
    });

    it('should include reason if provided', async () => {
      const input: RefundInput = {
        paymentIntentId: 'pi_test_123',
        reason: 'duplicate',
      };

      const result = await processRefund(input);

      expect(result.status).toBe('succeeded');
    });

    it('should support duplicate reason', async () => {
      const input: RefundInput = {
        paymentIntentId: 'pi_test_123',
        reason: 'duplicate',
      };

      await expect(processRefund(input)).resolves.toBeDefined();
    });

    it('should support fraudulent reason', async () => {
      const input: RefundInput = {
        paymentIntentId: 'pi_test_123',
        reason: 'fraudulent',
      };

      await expect(processRefund(input)).resolves.toBeDefined();
    });

    it('should support requested_by_customer reason', async () => {
      const input: RefundInput = {
        paymentIntentId: 'pi_test_123',
        reason: 'requested_by_customer',
      };

      await expect(processRefund(input)).resolves.toBeDefined();
    });

    it('should throw StripeGatewayError on Stripe API error', async () => {
      const input: RefundInput = {
        paymentIntentId: 'pi_error',
      };

      await expect(processRefund(input)).rejects.toThrow(StripeGatewayError);
    });

    it('should throw REFUND_FAILED error code', async () => {
      const input: RefundInput = {
        paymentIntentId: 'pi_error',
      };

      try {
        await processRefund(input);
        expect.fail('Should have thrown');
      } catch (err) {
        expect((err as StripeGatewayError).code).toBe('REFUND_FAILED');
      }
    });

    it('should map succeeded status correctly', async () => {
      const { getStripeClient } = await import('../client');
      const mockStripe = getStripeClient();
      vi.mocked(mockStripe.refunds.create).mockResolvedValueOnce({
        id: 're_test_123',
        amount: 116050,
        status: 'succeeded',
      } as any);

      const result = await processRefund({ paymentIntentId: 'pi_test_123' });
      expect(result.status).toBe('succeeded');
    });

    it('should map pending status correctly', async () => {
      const { getStripeClient } = await import('../client');
      const mockStripe = getStripeClient();
      vi.mocked(mockStripe.refunds.create).mockResolvedValueOnce({
        id: 're_test_123',
        amount: 116050,
        status: 'pending',
      } as any);

      const result = await processRefund({ paymentIntentId: 'pi_test_123' });
      expect(result.status).toBe('pending');
    });

    it('should map failed status correctly', async () => {
      const { getStripeClient } = await import('../client');
      const mockStripe = getStripeClient();
      vi.mocked(mockStripe.refunds.create).mockResolvedValueOnce({
        id: 're_test_123',
        amount: 116050,
        status: 'failed',
      } as any);

      const result = await processRefund({ paymentIntentId: 'pi_test_123' });
      expect(result.status).toBe('failed');
    });

    it('should convert amount to centavos for Stripe', async () => {
      const { toCentavos } = await import('../client');

      await processRefund({
        paymentIntentId: 'pi_test_123',
        amountMXN: 1160.50,
      });

      expect(toCentavos).toHaveBeenCalledWith(1160.50);
    });

    it('should convert amount from centavos in result', async () => {
      const { fromCentavos } = await import('../client');

      await processRefund({ paymentIntentId: 'pi_test_123' });

      expect(fromCentavos).toHaveBeenCalled();
    });
  });
});
