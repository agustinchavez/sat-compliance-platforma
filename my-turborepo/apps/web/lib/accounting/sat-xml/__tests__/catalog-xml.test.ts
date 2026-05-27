/**
 * SAT Catalog XML Tests (Component 23)
 */

import { describe, expect, it } from 'vitest';
import { generateCatalogXml } from '../catalog-xml';
import type { Account } from '../../types';

const makeAccount = (overrides: Partial<Account> = {}): Account => ({
  id: 'acc-1',
  organizationId: 'org-1',
  code: '1101',
  name: 'Caja',
  satAgrupadorCode: '101.01',
  satNivel: 3,
  satNaturaleza: 'D',
  materializedPath: '1000.1100.1101',
  isPostable: true,
  accountType: 'asset',
  normalBalance: 'D',
  currencyCode: 'MXN',
  requiresUuid: false,
  requiresThirdParty: false,
  isActive: true,
  isSystem: false,
  effectiveFrom: '2026-01-01',
  createdAt: '2026-01-01',
  updatedAt: '2026-01-01',
  ...overrides,
});

describe('Catalog XML Generation', () => {
  it('should generate valid XML with declaration', () => {
    const xml = generateCatalogXml({
      rfc: 'XAXX010101XXX',
      month: 1,
      year: 2026,
      accounts: [makeAccount()],
    });

    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
  });

  it('should include correct root element and namespaces', () => {
    const xml = generateCatalogXml({
      rfc: 'XAXX010101XXX',
      month: 1,
      year: 2026,
      accounts: [makeAccount()],
    });

    expect(xml).toContain('catalogocuentas:Catalogo');
    expect(xml).toContain('xmlns:catalogocuentas=');
    expect(xml).toContain('xmlns:xsi=');
    expect(xml).toContain('xsi:schemaLocation=');
  });

  it('should include version 1.3', () => {
    const xml = generateCatalogXml({
      rfc: 'XAXX010101XXX',
      month: 1,
      year: 2026,
      accounts: [makeAccount()],
    });

    expect(xml).toContain('Version="1.3"');
  });

  it('should include RFC', () => {
    const xml = generateCatalogXml({
      rfc: 'ABC123456789',
      month: 1,
      year: 2026,
      accounts: [makeAccount()],
    });

    expect(xml).toContain('RFC="ABC123456789"');
  });

  it('should include month with zero padding', () => {
    const xml = generateCatalogXml({
      rfc: 'XAXX010101XXX',
      month: 3,
      year: 2026,
      accounts: [makeAccount()],
    });

    expect(xml).toContain('Mes="03"');
  });

  it('should include year', () => {
    const xml = generateCatalogXml({
      rfc: 'XAXX010101XXX',
      month: 1,
      year: 2026,
      accounts: [makeAccount()],
    });

    expect(xml).toContain('Anio="2026"');
  });

  it('should generate Ctas elements for each account', () => {
    const accounts = [
      makeAccount({ id: 'a1', code: '1101', name: 'Caja', satAgrupadorCode: '101.01' }),
      makeAccount({ id: 'a2', code: '1102', name: 'Bancos', satAgrupadorCode: '101.02' }),
    ];

    const xml = generateCatalogXml({
      rfc: 'XAXX010101XXX',
      month: 1,
      year: 2026,
      accounts,
    });

    expect(xml).toContain('catalogocuentas:Ctas');
    expect(xml).toContain('NumCta="1101"');
    expect(xml).toContain('NumCta="1102"');
  });

  it('should include CodAgrup attribute', () => {
    const xml = generateCatalogXml({
      rfc: 'XAXX010101XXX',
      month: 1,
      year: 2026,
      accounts: [makeAccount({ satAgrupadorCode: '101.01' })],
    });

    expect(xml).toContain('CodAgrup="101.01"');
  });

  it('should throw when Nivel 1 account has empty CodAgrup', () => {
    expect(() => generateCatalogXml({
      rfc: 'XAXX010101XXX',
      month: 1,
      year: 2026,
      accounts: [makeAccount({ satAgrupadorCode: '', satNivel: 1 })],
    })).toThrow(/CodAgrup/);
  });

  it('should throw when Nivel 2 account has missing CodAgrup', () => {
    expect(() => generateCatalogXml({
      rfc: 'XAXX010101XXX',
      month: 1,
      year: 2026,
      accounts: [makeAccount({ satAgrupadorCode: undefined, satNivel: 2 })],
    })).toThrow(/CodAgrup/);
  });

  it('should omit CodAgrup for Nivel >= 3 without it', () => {
    const xml = generateCatalogXml({
      rfc: 'XAXX010101XXX',
      month: 1,
      year: 2026,
      accounts: [makeAccount({ satAgrupadorCode: undefined, satNivel: 4 })],
    });

    expect(xml).not.toContain('CodAgrup=""');
    expect(xml).not.toContain('CodAgrup');
  });

  it('should not emit empty CodAgrup attribute', () => {
    const xml = generateCatalogXml({
      rfc: 'XAXX010101XXX',
      month: 1,
      year: 2026,
      accounts: [makeAccount({ satAgrupadorCode: '101.01' })],
    });

    expect(xml).not.toContain('CodAgrup=""');
  });

  it('should include Nivel attribute', () => {
    const xml = generateCatalogXml({
      rfc: 'XAXX010101XXX',
      month: 1,
      year: 2026,
      accounts: [makeAccount({ satNivel: 3 })],
    });

    expect(xml).toContain('Nivel="3"');
  });

  it('should include Natur attribute', () => {
    const xml = generateCatalogXml({
      rfc: 'XAXX010101XXX',
      month: 1,
      year: 2026,
      accounts: [makeAccount({ satNaturaleza: 'D' })],
    });

    expect(xml).toContain('Natur="D"');
  });

  it('should include Desc attribute', () => {
    const xml = generateCatalogXml({
      rfc: 'XAXX010101XXX',
      month: 1,
      year: 2026,
      accounts: [makeAccount({ name: 'Caja General' })],
    });

    expect(xml).toContain('Desc="Caja General"');
  });

  it('should include SubCtaDe for child accounts', () => {
    const parent = makeAccount({ id: 'parent', code: '1100', name: 'Activo Circulante' });
    const child = makeAccount({ id: 'child', code: '1101', name: 'Caja', parentId: 'parent' });

    const xml = generateCatalogXml({
      rfc: 'XAXX010101XXX',
      month: 1,
      year: 2026,
      accounts: [parent, child],
    });

    expect(xml).toContain('SubCtaDe="1100"');
  });

  it('should skip inactive accounts', () => {
    const xml = generateCatalogXml({
      rfc: 'XAXX010101XXX',
      month: 1,
      year: 2026,
      accounts: [makeAccount({ isActive: false, code: '9999' })],
    });

    expect(xml).not.toContain('NumCta="9999"');
  });

  it('should skip deleted accounts', () => {
    const xml = generateCatalogXml({
      rfc: 'XAXX010101XXX',
      month: 1,
      year: 2026,
      accounts: [makeAccount({ deletedAt: '2026-01-01', code: '8888' })],
    });

    expect(xml).not.toContain('NumCta="8888"');
  });

  it('should escape special XML characters in description', () => {
    const xml = generateCatalogXml({
      rfc: 'XAXX010101XXX',
      month: 1,
      year: 2026,
      accounts: [makeAccount({ name: 'Caja & Bancos <principal>' })],
    });

    expect(xml).toContain('&amp;');
    expect(xml).toContain('&lt;');
    expect(xml).toContain('&gt;');
  });

  it('should close root element', () => {
    const xml = generateCatalogXml({
      rfc: 'XAXX010101XXX',
      month: 1,
      year: 2026,
      accounts: [],
    });

    expect(xml).toContain('</catalogocuentas:Catalogo>');
  });
});
