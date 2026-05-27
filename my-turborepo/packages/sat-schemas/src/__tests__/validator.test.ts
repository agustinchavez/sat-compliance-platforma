/**
 * SAT XSD Validator Tests
 */

import { describe, expect, it } from 'vitest';
import { validateSatXml } from '../validator.js';
import { hasXsdFiles, loadXsd } from '../loader.js';
import { SCHEMA_XSD_FILES } from '../types.js';

describe('XSD Loader', () => {
  it('should detect XSD files are present', () => {
    expect(hasXsdFiles()).toBe(true);
  });

  it('should load each known XSD schema type', () => {
    for (const schemaType of Object.keys(SCHEMA_XSD_FILES)) {
      const content = loadXsd(schemaType);
      expect(content).toContain('xs:schema');
    }
  });

  it('should throw for unknown schema type', () => {
    expect(() => loadXsd('INVALID')).toThrow(/Unknown SAT schema type/);
  });
});

describe('XSD Validation — Catalog (CT)', () => {
  const validCatalogXml = `<?xml version="1.0" encoding="UTF-8"?>
<catalogocuentas:Catalogo
  xmlns:catalogocuentas="http://www.sat.gob.mx/esquemas/ContabilidadE/1_3/CatalogoCuentas"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xsi:schemaLocation="http://www.sat.gob.mx/esquemas/ContabilidadE/1_3/CatalogoCuentas http://www.sat.gob.mx/esquemas/ContabilidadE/1_3/CatalogoCuentas/CatalogoCuentas_1_3.xsd"
  Version="1.3" RFC="XAXX010101000" Mes="01" Anio="2026">
  <catalogocuentas:Ctas CodAgrup="101" NumCta="1000" Desc="Activo" Nivel="1" Natur="D"/>
  <catalogocuentas:Ctas CodAgrup="101.01" NumCta="1001" Desc="Caja" Nivel="2" Natur="D" SubCtaDe="1000"/>
</catalogocuentas:Catalogo>`;

  it('should validate a correct catalog XML', async () => {
    const result = await validateSatXml(validCatalogXml, 'CT');
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should reject catalog XML with invalid RFC length', async () => {
    const invalidXml = validCatalogXml.replace('RFC="XAXX010101000"', 'RFC="SHORT"');
    const result = await validateSatXml(invalidXml, 'CT');
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });
});

describe('XSD Validation — Balance (BN)', () => {
  const validBalanceXml = `<?xml version="1.0" encoding="UTF-8"?>
<BCE:Balanza
  xmlns:BCE="http://www.sat.gob.mx/esquemas/ContabilidadE/1_3/BalanzaComprobacion"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xsi:schemaLocation="http://www.sat.gob.mx/esquemas/ContabilidadE/1_3/BalanzaComprobacion http://www.sat.gob.mx/esquemas/ContabilidadE/1_3/BalanzaComprobacion/BalanzaComprobacion_1_3.xsd"
  Version="1.3" RFC="XAXX010101000" Mes="01" Anio="2026" TipoEnvio="N">
  <BCE:Ctas NumCta="1000" SaldoIni="10000.00" Debe="5000.00" Haber="3000.00" SaldoFin="12000.00"/>
</BCE:Balanza>`;

  it('should validate a correct balance XML', async () => {
    const result = await validateSatXml(validBalanceXml, 'BN');
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });
});

describe('XSD Validation — Polizas (PL)', () => {
  const validPolizasXml = `<?xml version="1.0" encoding="UTF-8"?>
<PLZ:Polizas
  xmlns:PLZ="http://www.sat.gob.mx/esquemas/ContabilidadE/1_3/PolizasPeriodo"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xsi:schemaLocation="http://www.sat.gob.mx/esquemas/ContabilidadE/1_3/PolizasPeriodo http://www.sat.gob.mx/esquemas/ContabilidadE/1_3/PolizasPeriodo/PolizasPeriodo_1_3.xsd"
  Version="1.3" RFC="XAXX010101000" Mes="01" Anio="2026" TipoSolicitud="AF" NumOrden="ABC1234567/01">
  <PLZ:Poliza NumUnIdenPol="2026-000001" Fecha="2026-01-15" Concepto="Factura A-001">
    <PLZ:Transaccion NumCta="1104" DesCta="Clientes" Concepto="Cargo a clientes" Debe="1160.50" Haber="0.00"/>
    <PLZ:Transaccion NumCta="4101" DesCta="Ventas" Concepto="Venta factura A-001" Debe="0.00" Haber="1000.00"/>
    <PLZ:Transaccion NumCta="2104" DesCta="IVA Trasladado" Concepto="IVA 16%" Debe="0.00" Haber="160.50"/>
  </PLZ:Poliza>
</PLZ:Polizas>`;

  it('should validate a correct polizas XML', async () => {
    const result = await validateSatXml(validPolizasXml, 'PL');
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });
});
