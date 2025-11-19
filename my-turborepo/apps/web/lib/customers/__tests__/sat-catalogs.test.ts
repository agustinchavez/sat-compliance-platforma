/**
 * Unit Tests for SAT Catalogs
 * Component 6: Customer Service
 */

import {
  TAX_REGIMES,
  CFDI_USES,
  MEXICAN_STATES,
  SPECIAL_RFCS,
  RFC_FORBIDDEN_WORDS,
  getTaxRegimes,
  getTaxRegimeInfo,
  getTaxRegimesForType,
  isValidTaxRegime,
  getCFDIUses,
  getCFDIUseInfo,
  getCFDIUsesForType,
  isValidCFDIUse,
  getMexicanStates,
  getStateInfo,
  isValidStateCode,
  getStateByPostalCode,
  suggestTaxRegime,
  suggestCFDIUse,
} from '../sat-catalogs';

describe('SAT Catalogs', () => {
  describe('Tax Regimes', () => {
    it('should have valid tax regime structure', () => {
      expect(TAX_REGIMES['601']).toBeDefined();
      expect(TAX_REGIMES['601'].code).toBe('601');
      expect(TAX_REGIMES['601'].name).toBeTruthy();
      expect(TAX_REGIMES['601'].is_active).toBe(true);
      expect(['legal_entity', 'individual', 'both']).toContain(
        TAX_REGIMES['601'].applicable_to
      );
    });

    it('should get all tax regimes', () => {
      const regimes = getTaxRegimes();
      expect(regimes.length).toBeGreaterThan(0);
      expect(regimes.every((r) => r.is_active)).toBe(true);
    });

    it('should get tax regime info by code', () => {
      const regime = getTaxRegimeInfo('601');
      expect(regime).toBeDefined();
      expect(regime?.code).toBe('601');
      expect(regime?.name).toBeTruthy();
    });

    it('should return undefined for invalid tax regime code', () => {
      const regime = getTaxRegimeInfo('999');
      expect(regime).toBeUndefined();
    });

    it('should get tax regimes for legal entities', () => {
      const regimes = getTaxRegimesForType('legal_entity');
      expect(regimes.length).toBeGreaterThan(0);
      expect(
        regimes.every(
          (r) => r.applicable_to === 'legal_entity' || r.applicable_to === 'both'
        )
      ).toBe(true);
    });

    it('should get tax regimes for individuals', () => {
      const regimes = getTaxRegimesForType('individual');
      expect(regimes.length).toBeGreaterThan(0);
      expect(
        regimes.every(
          (r) => r.applicable_to === 'individual' || r.applicable_to === 'both'
        )
      ).toBe(true);
    });

    it('should validate tax regime codes', () => {
      expect(isValidTaxRegime('601')).toBe(true);
      expect(isValidTaxRegime('603')).toBe(true);
      expect(isValidTaxRegime('612')).toBe(true);
      expect(isValidTaxRegime('999')).toBe(false);
      expect(isValidTaxRegime('')).toBe(false);
    });
  });

  describe('CFDI Uses', () => {
    it('should have valid CFDI use structure', () => {
      expect(CFDI_USES['G01']).toBeDefined();
      expect(CFDI_USES['G01'].code).toBe('G01');
      expect(CFDI_USES['G01'].name).toBeTruthy();
      expect(CFDI_USES['G01'].is_active).toBe(true);
      expect(['legal_entity', 'individual', 'both']).toContain(
        CFDI_USES['G01'].applicable_to
      );
    });

    it('should get all CFDI uses', () => {
      const uses = getCFDIUses();
      expect(uses.length).toBeGreaterThan(0);
      expect(uses.every((u) => u.is_active)).toBe(true);
    });

    it('should get CFDI use info by code', () => {
      const use = getCFDIUseInfo('G03');
      expect(use).toBeDefined();
      expect(use?.code).toBe('G03');
      expect(use?.name).toBeTruthy();
    });

    it('should return undefined for invalid CFDI use code', () => {
      const use = getCFDIUseInfo('X99');
      expect(use).toBeUndefined();
    });

    it('should get CFDI uses for legal entities', () => {
      const uses = getCFDIUsesForType('legal_entity');
      expect(uses.length).toBeGreaterThan(0);
      expect(
        uses.every(
          (u) => u.applicable_to === 'legal_entity' || u.applicable_to === 'both'
        )
      ).toBe(true);
    });

    it('should get CFDI uses for individuals', () => {
      const uses = getCFDIUsesForType('individual');
      expect(uses.length).toBeGreaterThan(0);
      expect(
        uses.every(
          (u) => u.applicable_to === 'individual' || u.applicable_to === 'both'
        )
      ).toBe(true);
    });

    it('should validate CFDI use codes', () => {
      expect(isValidCFDIUse('G01')).toBe(true);
      expect(isValidCFDIUse('G03')).toBe(true);
      expect(isValidCFDIUse('D01')).toBe(true);
      expect(isValidCFDIUse('X99')).toBe(false);
      expect(isValidCFDIUse('')).toBe(false);
    });
  });

  describe('Mexican States', () => {
    it('should have valid state structure', () => {
      expect(MEXICAN_STATES['CDMX']).toBeDefined();
      expect(MEXICAN_STATES['CDMX'].code).toBe('CDMX');
      expect(MEXICAN_STATES['CDMX'].name).toBeTruthy();
      expect(MEXICAN_STATES['CDMX'].postal_code_prefix).toBeDefined();
    });

    it('should get all Mexican states', () => {
      const states = getMexicanStates();
      expect(states.length).toBe(32); // 32 Mexican states
    });

    it('should get state info by code', () => {
      const state = getStateInfo('CDMX');
      expect(state).toBeDefined();
      expect(state?.code).toBe('CDMX');
      expect(state?.name).toBe('Ciudad de México');
    });

    it('should get state info case-insensitively', () => {
      const state = getStateInfo('cdmx');
      expect(state).toBeDefined();
      expect(state?.code).toBe('CDMX');
    });

    it('should return undefined for invalid state code', () => {
      const state = getStateInfo('XXX');
      expect(state).toBeUndefined();
    });

    it('should validate state codes', () => {
      expect(isValidStateCode('CDMX')).toBe(true);
      expect(isValidStateCode('JAL')).toBe(true);
      expect(isValidStateCode('NL')).toBe(true);
      expect(isValidStateCode('XXX')).toBe(false);
      expect(isValidStateCode('')).toBe(false);
    });

    it('should validate state codes case-insensitively', () => {
      expect(isValidStateCode('cdmx')).toBe(true);
      expect(isValidStateCode('jal')).toBe(true);
    });

    it('should get state by postal code', () => {
      const state = getStateByPostalCode('06600'); // CDMX
      expect(state).toBeDefined();
      expect(state?.code).toBe('CDMX');
    });

    it('should get state by postal code for different states', () => {
      const jalisco = getStateByPostalCode('44100'); // JAL
      expect(jalisco?.code).toBe('JAL');

      const nl = getStateByPostalCode('64000'); // NL
      expect(nl?.code).toBe('NL');
    });

    it('should return undefined for invalid postal code', () => {
      const state = getStateByPostalCode('00100'); // No state has prefix '00'
      expect(state).toBeUndefined();
    });
  });

  describe('Special RFCs', () => {
    it('should have generic foreign RFC', () => {
      expect(SPECIAL_RFCS.GENERIC_FOREIGN).toBe('XAXX010101000');
    });

    it('should have generic national RFC', () => {
      expect(SPECIAL_RFCS.GENERIC_NATIONAL).toBe('XEXX010101000');
    });
  });

  describe('RFC Forbidden Words', () => {
    it('should have forbidden words list', () => {
      expect(RFC_FORBIDDEN_WORDS.length).toBeGreaterThan(0);
    });

    it('should contain common forbidden words', () => {
      expect(RFC_FORBIDDEN_WORDS).toContain('BUEY');
      expect(RFC_FORBIDDEN_WORDS).toContain('CACA');
      expect(RFC_FORBIDDEN_WORDS).toContain('PUTO');
    });
  });

  describe('Suggestion Functions', () => {
    describe('suggestTaxRegime', () => {
      it('should suggest tax regimes for legal entities (12 chars)', () => {
        const suggestions = suggestTaxRegime(12);
        expect(suggestions.length).toBeGreaterThan(0);
        expect(suggestions[0].code).toBe('601');
        expect(suggestions).toContainEqual(
          expect.objectContaining({ code: '603' })
        );
      });

      it('should suggest tax regimes for individuals (13 chars)', () => {
        const suggestions = suggestTaxRegime(13);
        expect(suggestions.length).toBeGreaterThan(0);
        expect(suggestions[0].code).toBe('612');
        expect(suggestions).toContainEqual(
          expect.objectContaining({ code: '605' })
        );
      });

      it('should return empty array for invalid RFC length', () => {
        const suggestions = suggestTaxRegime(10);
        expect(suggestions).toEqual([]);
      });
    });

    describe('suggestCFDIUse', () => {
      it('should suggest common CFDI uses', () => {
        const suggestions = suggestCFDIUse();
        expect(suggestions.length).toBeGreaterThan(0);
        expect(suggestions).toContainEqual(
          expect.objectContaining({ code: 'G03' })
        );
        expect(suggestions).toContainEqual(
          expect.objectContaining({ code: 'G01' })
        );
        expect(suggestions).toContainEqual(
          expect.objectContaining({ code: 'I01' })
        );
      });

      it('should have name for each suggestion', () => {
        const suggestions = suggestCFDIUse();
        suggestions.forEach((suggestion) => {
          expect(suggestion.code).toBeTruthy();
          expect(suggestion.name).toBeTruthy();
        });
      });
    });
  });
});
