/**
 * Tests for Expense Categories (Component 20)
 */

import { describe, expect, it } from 'vitest';
import { suggestCategory, getCategoryRule, CATEGORY_DEDUCTIBILITY_RULES } from '../categories';
import { ExpenseCategory } from '../types';

describe('Expense Categories', () => {
  describe('suggestCategory', () => {
    it('should suggest COMBUSTIBLE for PEMEX', () => {
      expect(suggestCategory('PEMEX', 'gasolina magna')).toBe(ExpenseCategory.COMBUSTIBLE);
    });

    it('should suggest COMBUSTIBLE for Shell', () => {
      expect(suggestCategory('Shell', 'diesel')).toBe(ExpenseCategory.COMBUSTIBLE);
    });

    it('should suggest TELECOMUNICACIONES for Telcel', () => {
      expect(suggestCategory('TELCEL', 'plan de datos')).toBe(ExpenseCategory.TELECOMUNICACIONES);
    });

    it('should suggest TELECOMUNICACIONES for Telmex', () => {
      expect(suggestCategory('Telmex', 'internet fibra')).toBe(ExpenseCategory.TELECOMUNICACIONES);
    });

    it('should suggest SERVICIOS_PUBLICOS for CFE', () => {
      expect(suggestCategory('CFE', 'luz')).toBe(ExpenseCategory.SERVICIOS_PUBLICOS);
    });

    it('should suggest ARRENDAMIENTO for rent keywords', () => {
      expect(suggestCategory('Inmobiliaria ABC', 'renta oficina')).toBe(ExpenseCategory.ARRENDAMIENTO);
    });

    it('should suggest VIATICOS for hotel', () => {
      expect(suggestCategory('Hotel Marriott', 'hospedaje')).toBe(ExpenseCategory.VIATICOS);
    });

    it('should suggest VIATICOS for Uber', () => {
      expect(suggestCategory('Uber', 'viaje aeropuerto')).toBe(ExpenseCategory.VIATICOS);
    });

    it('should suggest ALIMENTOS_ENTRETENIMIENTO for restaurant', () => {
      expect(suggestCategory('Restaurante La Parilla', 'comida cliente')).toBe(ExpenseCategory.ALIMENTOS_ENTRETENIMIENTO);
    });

    it('should suggest PUBLICIDAD_MARKETING for Google Ads', () => {
      expect(suggestCategory('Google', 'publicidad online')).toBe(ExpenseCategory.PUBLICIDAD_MARKETING);
    });

    it('should suggest TECNOLOGIA_SOFTWARE for Microsoft', () => {
      expect(suggestCategory('Microsoft', 'licencia office 365')).toBe(ExpenseCategory.TECNOLOGIA_SOFTWARE);
    });

    it('should suggest TECNOLOGIA_SOFTWARE for AWS', () => {
      expect(suggestCategory('AWS Amazon Web Services', 'hosting')).toBe(ExpenseCategory.TECNOLOGIA_SOFTWARE);
    });

    it('should suggest SERVICIOS_PROFESIONALES for lawyer', () => {
      expect(suggestCategory('Despacho Jurídico', 'abogado honorarios')).toBe(ExpenseCategory.SERVICIOS_PROFESIONALES);
    });

    it('should suggest SEGUROS for insurance company', () => {
      expect(suggestCategory('GNP Seguros', 'prima anual')).toBe(ExpenseCategory.SEGUROS);
    });

    it('should suggest COMISIONES_BANCARIAS for bank', () => {
      expect(suggestCategory('BBVA', 'comision manejo cuenta')).toBe(ExpenseCategory.COMISIONES_BANCARIAS);
    });

    it('should suggest PAPELERIA_OFICINA for office supplies', () => {
      expect(suggestCategory('Office Depot', 'papeleria')).toBe(ExpenseCategory.PAPELERIA_OFICINA);
    });

    it('should suggest TRANSPORTE for courier', () => {
      expect(suggestCategory('DHL', 'envio paquete')).toBe(ExpenseCategory.TRANSPORTE);
    });

    it('should suggest OTROS for unknown vendor', () => {
      expect(suggestCategory('Unknown Vendor', 'miscellaneous')).toBe(ExpenseCategory.OTROS);
    });

    it('should be case-insensitive', () => {
      expect(suggestCategory('PEMEX', 'GASOLINA')).toBe(ExpenseCategory.COMBUSTIBLE);
      expect(suggestCategory('pemex', 'gasolina')).toBe(ExpenseCategory.COMBUSTIBLE);
    });

    it('should match multiple keywords and choose best score', () => {
      // "Hotel Uber" should match VIATICOS (2 keywords: hotel, uber) over other categories
      expect(suggestCategory('Hotel Marriott Uber Partnership', 'hospedaje y transporte')).toBe(ExpenseCategory.VIATICOS);
    });
  });

  describe('getCategoryRule', () => {
    it('should return COMBUSTIBLE rule with cashLimit=0', () => {
      const rule = getCategoryRule(ExpenseCategory.COMBUSTIBLE);
      expect(rule.defaultDeductiblePercent).toBe(100);
      expect(rule.requiresBancarizado).toBe(true);
      expect(rule.cashLimit).toBe(0);
      expect(rule.notes).toContain('efectivo nunca es deducible');
    });

    it('should return ALIMENTOS rule with 91.5% deductibility', () => {
      const rule = getCategoryRule(ExpenseCategory.ALIMENTOS_ENTRETENIMIENTO);
      expect(rule.defaultDeductiblePercent).toBe(91.5);
      expect(rule.requiresBancarizado).toBe(true);
      expect(rule.cashLimit).toBe(2000);
    });

    it('should return standard rule for SERVICIOS_PROFESIONALES', () => {
      const rule = getCategoryRule(ExpenseCategory.SERVICIOS_PROFESIONALES);
      expect(rule.defaultDeductiblePercent).toBe(100);
      expect(rule.requiresBancarizado).toBe(true);
      expect(rule.cashLimit).toBe(2000);
    });

    it('should return DONACIONES rule without bancarization requirement', () => {
      const rule = getCategoryRule(ExpenseCategory.DONACIONES);
      expect(rule.defaultDeductiblePercent).toBe(100);
      expect(rule.requiresBancarizado).toBe(false);
      expect(rule.cashLimit).toBe(null);
    });
  });

  describe('CATEGORY_DEDUCTIBILITY_RULES', () => {
    it('should have rules for all categories', () => {
      const allCategories = Object.values(ExpenseCategory);
      allCategories.forEach(category => {
        expect(CATEGORY_DEDUCTIBILITY_RULES[category]).toBeDefined();
      });
    });

    it('should have valid deductibility percentages', () => {
      Object.values(CATEGORY_DEDUCTIBILITY_RULES).forEach(rule => {
        expect(rule.defaultDeductiblePercent).toBeGreaterThanOrEqual(0);
        expect(rule.defaultDeductiblePercent).toBeLessThanOrEqual(100);
      });
    });

    it('should have cash limits that are null or positive', () => {
      Object.values(CATEGORY_DEDUCTIBILITY_RULES).forEach(rule => {
        if (rule.cashLimit !== null) {
          expect(rule.cashLimit).toBeGreaterThanOrEqual(0);
        }
      });
    });
  });
});
