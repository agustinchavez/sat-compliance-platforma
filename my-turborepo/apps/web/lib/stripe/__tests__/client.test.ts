/**
 * Tests for Stripe Client (Component 19)
 */

import { describe, expect, it, beforeEach, vi } from 'vitest';
import { getStripeClient, toCentavos, fromCentavos, STRIPE_CONFIG } from '../client';

describe('Stripe Client', () => {
  describe('getStripeClient', () => {
    beforeEach(() => {
      vi.resetModules();
    });

    it('should throw error if STRIPE_SECRET_KEY is not set', () => {
      delete process.env.STRIPE_SECRET_KEY;
      expect(() => getStripeClient()).toThrow('STRIPE_SECRET_KEY environment variable is not set');
    });

    it('should create Stripe client with correct configuration', () => {
      process.env.STRIPE_SECRET_KEY = 'sk_test_123';
      const client = getStripeClient();
      expect(client).toBeDefined();
    });

    it('should return the same Stripe client instance (singleton)', () => {
      process.env.STRIPE_SECRET_KEY = 'sk_test_123';
      const client1 = getStripeClient();
      const client2 = getStripeClient();
      expect(client1).toBe(client2);
    });
  });

  describe('toCentavos', () => {
    it('should convert decimal to centavos correctly', () => {
      expect(toCentavos(1160.50)).toBe(116050);
    });

    it('should round to nearest centavo', () => {
      expect(toCentavos(1160.505)).toBe(116051);
      expect(toCentavos(1160.504)).toBe(116050);
    });

    it('should handle small amounts', () => {
      expect(toCentavos(0.01)).toBe(1);
      expect(toCentavos(0.005)).toBe(1);
      expect(toCentavos(0.004)).toBe(0);
    });

    it('should handle zero', () => {
      expect(toCentavos(0)).toBe(0);
    });

    it('should handle large amounts', () => {
      expect(toCentavos(999999.99)).toBe(99999999);
    });

    it('should handle negative amounts', () => {
      expect(toCentavos(-100.50)).toBe(-10050);
    });
  });

  describe('fromCentavos', () => {
    it('should convert centavos to decimal correctly', () => {
      expect(fromCentavos(116050)).toBe(1160.50);
    });

    it('should handle small amounts', () => {
      expect(fromCentavos(1)).toBe(0.01);
    });

    it('should handle zero', () => {
      expect(fromCentavos(0)).toBe(0);
    });

    it('should handle large amounts', () => {
      expect(fromCentavos(99999999)).toBe(999999.99);
    });

    it('should handle negative amounts', () => {
      expect(fromCentavos(-10050)).toBe(-100.50);
    });

    it('should be inverse of toCentavos', () => {
      const amount = 1234.56;
      expect(fromCentavos(toCentavos(amount))).toBe(amount);
    });
  });

  describe('STRIPE_CONFIG', () => {
    it('should have correct currency', () => {
      expect(STRIPE_CONFIG.CURRENCY).toBe('mxn');
    });

    it('should have correct success URL path', () => {
      expect(STRIPE_CONFIG.SUCCESS_URL_PATH).toBe('/invoices/{invoiceId}/payment-success');
    });

    it('should have correct cancel URL path', () => {
      expect(STRIPE_CONFIG.CANCEL_URL_PATH).toBe('/invoices/{invoiceId}');
    });

    it('should have correct payment link expiry days', () => {
      expect(STRIPE_CONFIG.PAYMENT_LINK_EXPIRY_DAYS).toBe(30);
    });

    it('should have correct webhook tolerance seconds', () => {
      expect(STRIPE_CONFIG.WEBHOOK_TOLERANCE_SECONDS).toBe(300);
    });
  });
});
