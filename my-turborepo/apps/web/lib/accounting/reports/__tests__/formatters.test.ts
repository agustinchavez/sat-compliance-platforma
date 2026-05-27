/**
 * Report Formatters Tests (Component 23)
 */

import { describe, expect, it } from 'vitest';
import {
  formatMXN,
  formatNumber,
  formatPercent,
  indentByDepth,
  formatAccountCodeDisplay,
  formatPeriodLabel,
  formatDateMX,
  truncate,
} from '../formatters';

describe('Report Formatters', () => {
  describe('formatMXN', () => {
    it('should format positive amounts', () => {
      const result = formatMXN(1160.50);
      expect(result).toContain('1');
      expect(result).toContain('160');
      expect(result).toContain('50');
    });

    it('should format zero', () => {
      const result = formatMXN(0);
      expect(result).toContain('0.00');
    });

    it('should format negative amounts', () => {
      const result = formatMXN(-500);
      expect(result).toContain('500');
    });

    it('should include currency symbol', () => {
      const result = formatMXN(100);
      expect(result).toContain('$');
    });
  });

  describe('formatNumber', () => {
    it('should format with 2 decimals by default', () => {
      const result = formatNumber(1000);
      expect(result).toContain('1');
      expect(result).toContain('000');
      expect(result).toContain('00');
    });

    it('should respect custom decimal places', () => {
      const result = formatNumber(100, 0);
      expect(result).toBe('100');
    });
  });

  describe('formatPercent', () => {
    it('should format percentage', () => {
      const result = formatPercent(16);
      expect(result).toContain('16');
      expect(result).toContain('%');
    });

    it('should format zero percent', () => {
      const result = formatPercent(0);
      expect(result).toContain('0');
      expect(result).toContain('%');
    });
  });

  describe('indentByDepth', () => {
    it('should not indent at depth 0', () => {
      expect(indentByDepth('Activo', 0)).toBe('Activo');
    });

    it('should indent at depth 1', () => {
      expect(indentByDepth('Caja', 1)).toBe('  Caja');
    });

    it('should indent at depth 2', () => {
      expect(indentByDepth('Banamex', 2)).toBe('    Banamex');
    });

    it('should support custom indent string', () => {
      expect(indentByDepth('Test', 1, '--')).toBe('--Test');
    });
  });

  describe('formatAccountCodeDisplay', () => {
    it('should use materialized path when available', () => {
      expect(formatAccountCodeDisplay('1101', '1000.1100.1101')).toBe('1000.1100.1101');
    });

    it('should return raw code when no path', () => {
      expect(formatAccountCodeDisplay('1101')).toBe('1101');
    });
  });

  describe('formatPeriodLabel', () => {
    it('should format January', () => {
      expect(formatPeriodLabel(2026, 1)).toBe('Enero 2026');
    });

    it('should format December', () => {
      expect(formatPeriodLabel(2026, 12)).toBe('Diciembre 2026');
    });

    it('should format adjustment period (month 13)', () => {
      expect(formatPeriodLabel(2026, 13)).toBe('Ajuste 2026');
    });
  });

  describe('formatDateMX', () => {
    it('should format date in Mexican format', () => {
      const result = formatDateMX('2026-01-15');
      expect(result).toContain('15');
      expect(result).toContain('01');
      expect(result).toContain('2026');
    });
  });

  describe('truncate', () => {
    it('should not truncate short text', () => {
      expect(truncate('Hello', 10)).toBe('Hello');
    });

    it('should truncate long text with ellipsis', () => {
      expect(truncate('A very long description', 10)).toBe('A very...');
    });

    it('should handle exact length', () => {
      expect(truncate('12345', 5)).toBe('12345');
    });
  });
});
