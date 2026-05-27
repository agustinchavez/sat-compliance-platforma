/**
 * SAT Schema Types
 */

/** Supported SAT Contabilidad Electrónica schema types */
export type SatSchemaType =
  | 'CT'   // Catálogo de Cuentas
  | 'BN'   // Balanza Normal
  | 'BC'   // Balanza Complementaria
  | 'PL'   // Pólizas
  | 'XF'   // Auxiliar de Folios
  | 'XC';  // Auxiliar de Cuentas

/** Result from XSD validation */
export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

export interface ValidationError {
  line: number;
  column: number;
  message: string;
}

/** Maps schema types to their XSD file names */
export const SCHEMA_XSD_FILES: Record<string, string> = {
  CT: 'CatalogoCuentas_1_3.xsd',
  BN: 'BalanzaComprobacion_1_3.xsd',
  BC: 'BalanzaComprobacion_1_3.xsd',
  PL: 'PolizasPeriodo_1_3.xsd',
  XF: 'AuxiliarFolios_1_3.xsd',
  XC: 'AuxiliarCtas_1_3.xsd',
};
