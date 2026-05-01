/**
 * Tests for Stripe Errors (Component 19)
 */

import { describe, expect, it } from 'vitest';
import { StripeGatewayError, isStripeGatewayError } from '../errors';

describe('Stripe Errors', () => {
  describe('StripeGatewayError', () => {
    it('should create error with required fields', () => {
      const error = new StripeGatewayError('STRIPE_NOT_CONFIGURED', 'Missing API key');
      expect(error).toBeInstanceOf(Error);
      expect(error.name).toBe('StripeGatewayError');
      expect(error.code).toBe('STRIPE_NOT_CONFIGURED');
      expect(error.message).toBe('Missing API key');
      expect(error.invoiceId).toBeUndefined();
      expect(error.cause).toBeUndefined();
    });

    it('should create error with invoice ID', () => {
      const error = new StripeGatewayError(
        'INVOICE_NOT_FOUND',
        'Invoice not found',
        'inv-123'
      );
      expect(error.code).toBe('INVOICE_NOT_FOUND');
      expect(error.invoiceId).toBe('inv-123');
    });

    it('should create error with cause', () => {
      const cause = new Error('Original error');
      const error = new StripeGatewayError(
        'CHECKOUT_CREATION_FAILED',
        'Failed to create checkout',
        undefined,
        cause
      );
      expect(error.code).toBe('CHECKOUT_CREATION_FAILED');
      expect(error.cause).toBe(cause);
    });

    it('should create error with all fields', () => {
      const cause = new Error('Original error');
      const error = new StripeGatewayError(
        'PAYMENT_RECORDING_FAILED',
        'Payment recording failed',
        'inv-123',
        cause
      );
      expect(error.code).toBe('PAYMENT_RECORDING_FAILED');
      expect(error.message).toBe('Payment recording failed');
      expect(error.invoiceId).toBe('inv-123');
      expect(error.cause).toBe(cause);
    });
  });

  describe('Error Codes', () => {
    it('should support STRIPE_NOT_CONFIGURED code', () => {
      const error = new StripeGatewayError('STRIPE_NOT_CONFIGURED', 'Not configured');
      expect(error.code).toBe('STRIPE_NOT_CONFIGURED');
    });

    it('should support INVOICE_NOT_FOUND code', () => {
      const error = new StripeGatewayError('INVOICE_NOT_FOUND', 'Not found');
      expect(error.code).toBe('INVOICE_NOT_FOUND');
    });

    it('should support INVOICE_NOT_STAMPABLE code', () => {
      const error = new StripeGatewayError('INVOICE_NOT_STAMPABLE', 'Not stampable');
      expect(error.code).toBe('INVOICE_NOT_STAMPABLE');
    });

    it('should support INVOICE_ALREADY_PAID code', () => {
      const error = new StripeGatewayError('INVOICE_ALREADY_PAID', 'Already paid');
      expect(error.code).toBe('INVOICE_ALREADY_PAID');
    });

    it('should support PAYMENT_LINK_NOT_FOUND code', () => {
      const error = new StripeGatewayError('PAYMENT_LINK_NOT_FOUND', 'Link not found');
      expect(error.code).toBe('PAYMENT_LINK_NOT_FOUND');
    });

    it('should support WEBHOOK_SIGNATURE_INVALID code', () => {
      const error = new StripeGatewayError('WEBHOOK_SIGNATURE_INVALID', 'Invalid signature');
      expect(error.code).toBe('WEBHOOK_SIGNATURE_INVALID');
    });

    it('should support WEBHOOK_DUPLICATE code', () => {
      const error = new StripeGatewayError('WEBHOOK_DUPLICATE', 'Duplicate event');
      expect(error.code).toBe('WEBHOOK_DUPLICATE');
    });

    it('should support CHECKOUT_CREATION_FAILED code', () => {
      const error = new StripeGatewayError('CHECKOUT_CREATION_FAILED', 'Creation failed');
      expect(error.code).toBe('CHECKOUT_CREATION_FAILED');
    });

    it('should support REFUND_FAILED code', () => {
      const error = new StripeGatewayError('REFUND_FAILED', 'Refund failed');
      expect(error.code).toBe('REFUND_FAILED');
    });

    it('should support PAYMENT_RECORDING_FAILED code', () => {
      const error = new StripeGatewayError('PAYMENT_RECORDING_FAILED', 'Recording failed');
      expect(error.code).toBe('PAYMENT_RECORDING_FAILED');
    });
  });

  describe('isStripeGatewayError', () => {
    it('should return true for StripeGatewayError instances', () => {
      const error = new StripeGatewayError('STRIPE_NOT_CONFIGURED', 'Test error');
      expect(isStripeGatewayError(error)).toBe(true);
    });

    it('should return false for regular Error instances', () => {
      const error = new Error('Regular error');
      expect(isStripeGatewayError(error)).toBe(false);
    });

    it('should return false for null', () => {
      expect(isStripeGatewayError(null)).toBe(false);
    });

    it('should return false for undefined', () => {
      expect(isStripeGatewayError(undefined)).toBe(false);
    });

    it('should return false for strings', () => {
      expect(isStripeGatewayError('error')).toBe(false);
    });

    it('should return false for objects without instanceof check', () => {
      const obj = { code: 'STRIPE_NOT_CONFIGURED', message: 'Test' };
      expect(isStripeGatewayError(obj)).toBe(false);
    });
  });
});
