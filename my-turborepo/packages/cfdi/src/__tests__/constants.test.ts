/**
 * Constants Tests
 *
 * Verify all namespace URIs and constants match official SAT specifications.
 */

import { describe, it, expect } from 'vitest';
import {
  CFDI_NAMESPACE,
  XSI_NAMESPACE,
  CFDI_XSD_LOCATION,
  CFDI_VERSION,
  PAGOS20_NAMESPACE,
  PAGOS20_XSD_LOCATION,
  TFD_NAMESPACE,
  TFD_XSD_LOCATION,
  CADENA_ORIGINAL_XSLT_URL,
  IMPUESTO_ISR,
  IMPUESTO_IVA,
  IMPUESTO_IEPS,
  TIPO_FACTOR_TASA,
  TIPO_FACTOR_EXENTO,
  IVA_GENERAL,
  IVA_FRONTERA,
  IVA_CERO,
  RFC_PUBLICO_GENERAL,
  RFC_EXTRANJERO,
  USO_CFDI_SIN_EFECTOS,
  REGIMEN_SIN_OBLIGACIONES,
  FORMA_PAGO_POR_DEFINIR,
  TIPO_COMPROBANTE_VALUES,
  EXPORTACION_VALUES,
  METODO_PAGO_VALUES,
  OBJETO_IMP_VALUES,
  CLAVE_PROD_SERV_PAGO,
  CLAVE_UNIDAD_PAGO,
  MONEDA_PAGO_XXX,
} from '../constants.js';

describe('CFDI Namespaces', () => {
  it('CFDI_NAMESPACE is the official SAT CFDI 4.0 namespace', () => {
    expect(CFDI_NAMESPACE).toBe('http://www.sat.gob.mx/cfd/4');
  });

  it('XSI_NAMESPACE is the W3C XML Schema Instance namespace', () => {
    expect(XSI_NAMESPACE).toBe('http://www.w3.org/2001/XMLSchema-instance');
  });

  it('CFDI_XSD_LOCATION is the official SAT XSD URL', () => {
    expect(CFDI_XSD_LOCATION).toBe('http://www.sat.gob.mx/sitio_internet/cfd/4/cfdv40.xsd');
  });

  it('CFDI_VERSION is 4.0', () => {
    expect(CFDI_VERSION).toBe('4.0');
  });
});

describe('Pagos 2.0 Namespaces', () => {
  it('PAGOS20_NAMESPACE is the official Pagos 2.0 namespace', () => {
    expect(PAGOS20_NAMESPACE).toBe('http://www.sat.gob.mx/Pagos20');
  });

  it('PAGOS20_XSD_LOCATION is the official Pagos 2.0 XSD URL', () => {
    expect(PAGOS20_XSD_LOCATION).toBe('http://www.sat.gob.mx/sitio_internet/cfd/Pagos/Pagos20.xsd');
  });
});

describe('TimbreFiscalDigital Namespaces', () => {
  it('TFD_NAMESPACE is the official TFD namespace', () => {
    expect(TFD_NAMESPACE).toBe('http://www.sat.gob.mx/TimbreFiscalDigital');
  });

  it('TFD_XSD_LOCATION is the official TFD 1.1 XSD URL', () => {
    expect(TFD_XSD_LOCATION).toBe(
      'http://www.sat.gob.mx/sitio_internet/cfd/TimbreFiscalDigital/TimbreFiscalDigitalv11.xsd'
    );
  });
});

describe('Cadena Original XSLT', () => {
  it('CADENA_ORIGINAL_XSLT_URL is the official SAT XSLT URL', () => {
    expect(CADENA_ORIGINAL_XSLT_URL).toBe(
      'http://www.sat.gob.mx/sitio_internet/cfd/4/cadenaoriginal_4_0/cadenaoriginal_4_0.xslt'
    );
  });
});

describe('Impuesto Codes', () => {
  it('IMPUESTO_ISR is 001', () => {
    expect(IMPUESTO_ISR).toBe('001');
  });

  it('IMPUESTO_IVA is 002', () => {
    expect(IMPUESTO_IVA).toBe('002');
  });

  it('IMPUESTO_IEPS is 003', () => {
    expect(IMPUESTO_IEPS).toBe('003');
  });
});

describe('TipoFactor Values', () => {
  it('TIPO_FACTOR_TASA is Tasa', () => {
    expect(TIPO_FACTOR_TASA).toBe('Tasa');
  });

  it('TIPO_FACTOR_EXENTO is Exento', () => {
    expect(TIPO_FACTOR_EXENTO).toBe('Exento');
  });
});

describe('IVA Rates', () => {
  it('IVA_GENERAL is 0.160000 (16%)', () => {
    expect(IVA_GENERAL).toBe('0.160000');
    expect(IVA_GENERAL).toHaveLength(8); // 6 decimal places
  });

  it('IVA_FRONTERA is 0.080000 (8%)', () => {
    expect(IVA_FRONTERA).toBe('0.080000');
    expect(IVA_FRONTERA).toHaveLength(8);
  });

  it('IVA_CERO is 0.000000 (0%)', () => {
    expect(IVA_CERO).toBe('0.000000');
    expect(IVA_CERO).toHaveLength(8);
  });
});

describe('Special RFC Values', () => {
  it('RFC_PUBLICO_GENERAL is XAXX010101000', () => {
    expect(RFC_PUBLICO_GENERAL).toBe('XAXX010101000');
    expect(RFC_PUBLICO_GENERAL).toHaveLength(13);
  });

  it('RFC_EXTRANJERO is XEXX010101000', () => {
    expect(RFC_EXTRANJERO).toBe('XEXX010101000');
    expect(RFC_EXTRANJERO).toHaveLength(13);
  });
});

describe('UsoCFDI and RegimenFiscal for Special Cases', () => {
  it('USO_CFDI_SIN_EFECTOS is S01', () => {
    expect(USO_CFDI_SIN_EFECTOS).toBe('S01');
  });

  it('REGIMEN_SIN_OBLIGACIONES is 616', () => {
    expect(REGIMEN_SIN_OBLIGACIONES).toBe('616');
  });
});

describe('FormaPago', () => {
  it('FORMA_PAGO_POR_DEFINIR is 99', () => {
    expect(FORMA_PAGO_POR_DEFINIR).toBe('99');
  });
});

describe('TipoDeComprobante Values', () => {
  it('includes all valid types', () => {
    expect(TIPO_COMPROBANTE_VALUES).toContain('I'); // Ingreso
    expect(TIPO_COMPROBANTE_VALUES).toContain('E'); // Egreso
    expect(TIPO_COMPROBANTE_VALUES).toContain('T'); // Traslado
    expect(TIPO_COMPROBANTE_VALUES).toContain('P'); // Pago
    expect(TIPO_COMPROBANTE_VALUES).toContain('N'); // Nomina
  });

  it('has exactly 5 types', () => {
    expect(TIPO_COMPROBANTE_VALUES).toHaveLength(5);
  });
});

describe('Exportacion Values', () => {
  it('includes all valid values', () => {
    expect(EXPORTACION_VALUES).toContain('01'); // No aplica
    expect(EXPORTACION_VALUES).toContain('02'); // Definitiva
    expect(EXPORTACION_VALUES).toContain('03'); // Temporal
    expect(EXPORTACION_VALUES).toContain('04'); // Definitiva con clave A1
  });

  it('has exactly 4 values', () => {
    expect(EXPORTACION_VALUES).toHaveLength(4);
  });
});

describe('MetodoPago Values', () => {
  it('includes PUE and PPD', () => {
    expect(METODO_PAGO_VALUES).toContain('PUE');
    expect(METODO_PAGO_VALUES).toContain('PPD');
  });

  it('has exactly 2 values', () => {
    expect(METODO_PAGO_VALUES).toHaveLength(2);
  });
});

describe('ObjetoImp Values', () => {
  it('includes all valid values', () => {
    expect(OBJETO_IMP_VALUES).toContain('01'); // No objeto
    expect(OBJETO_IMP_VALUES).toContain('02'); // Si objeto
    expect(OBJETO_IMP_VALUES).toContain('03'); // No desglose
  });

  it('has exactly 3 values', () => {
    expect(OBJETO_IMP_VALUES).toHaveLength(3);
  });
});

describe('Payment Complement Constants', () => {
  it('CLAVE_PROD_SERV_PAGO is 84111506', () => {
    expect(CLAVE_PROD_SERV_PAGO).toBe('84111506');
  });

  it('CLAVE_UNIDAD_PAGO is ACT', () => {
    expect(CLAVE_UNIDAD_PAGO).toBe('ACT');
  });

  it('MONEDA_PAGO_XXX is XXX', () => {
    expect(MONEDA_PAGO_XXX).toBe('XXX');
  });
});
