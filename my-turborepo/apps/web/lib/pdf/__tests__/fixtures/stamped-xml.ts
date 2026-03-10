/**
 * Test Fixtures: Stamped CFDI XML (Component 16)
 */

/**
 * Minimal valid stamped CFDI XML for testing
 */
export const MINIMAL_STAMPED_XML = `<?xml version="1.0" encoding="UTF-8"?>
<cfdi:Comprobante
  xmlns:cfdi="http://www.sat.gob.mx/cfd/4"
  xmlns:tfd="http://www.sat.gob.mx/TimbreFiscalDigital"
  Version="4.0"
  Serie="A"
  Folio="00001"
  Fecha="2024-03-01T10:00:00"
  Sello="KVttNUxYJFG8yLDvA5ZqYYZrJ8GqHgbPfQvYdVxSP3mRabcdefghijk1234567890ABCDEFGHIJKLMNOP=="
  NoCertificado="30001000000300023708"
  Certificado="MIIFsDCCA5igAwIBAgIUMzAwMDEwMDAw..."
  CondicionesDePago="CONTADO"
  SubTotal="5000.00"
  Moneda="MXN"
  Total="5800.00"
  TipoDeComprobante="I"
  MetodoPago="PUE"
  LugarExpedicion="06600"
  Exportacion="01"
>
  <cfdi:Emisor Rfc="XAXX010101000" Nombre="EMPRESA DEMO SA DE CV" RegimenFiscal="601"/>
  <cfdi:Receptor Rfc="XEXX010101000" Nombre="CLIENTE DEMO" DomicilioFiscalReceptor="01000" RegimenFiscalReceptor="616" UsoCFDI="G03"/>
  <cfdi:Conceptos>
    <cfdi:Concepto ClaveProdServ="84111506" Cantidad="1" ClaveUnidad="E48" Unidad="Unidad de servicio" Descripcion="Servicios de desarrollo de software" ValorUnitario="5000.00" Importe="5000.00" ObjetoImp="02">
      <cfdi:Impuestos>
        <cfdi:Traslados>
          <cfdi:Traslado Base="5000.00" Impuesto="002" TipoFactor="Tasa" TasaOCuota="0.160000" Importe="800.00"/>
        </cfdi:Traslados>
      </cfdi:Impuestos>
    </cfdi:Concepto>
  </cfdi:Conceptos>
  <cfdi:Impuestos TotalImpuestosTrasladados="800.00">
    <cfdi:Traslados>
      <cfdi:Traslado Base="5000.00" Impuesto="002" TipoFactor="Tasa" TasaOCuota="0.160000" Importe="800.00"/>
    </cfdi:Traslados>
  </cfdi:Impuestos>
  <cfdi:Complemento>
    <tfd:TimbreFiscalDigital
      xmlns:tfd="http://www.sat.gob.mx/TimbreFiscalDigital"
      Version="1.1"
      UUID="05c519de-6d20-4258-88fb-c69a5970e927"
      FechaTimbrado="2024-03-01T10:00:00"
      RfcProvCertif="SPR190613I52"
      SelloCFD="KVttNUxYJFG8yLDvA5ZqYYZrJ8GqHgbPfQvYdVxSP3mRabcdefghijk1234567890ABCDEFGHIJKLMNOP=="
      NoCertificadoSAT="30001000000400002495"
      SelloSAT="qadm+mH3yLDvA5ZqYYZrJ8GqHgbPfQvYdVxSP3mR1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ123=="
    />
  </cfdi:Complemento>
</cfdi:Comprobante>`;

/**
 * XML without TFD (not stamped)
 */
export const UNSIGNED_XML = `<?xml version="1.0" encoding="UTF-8"?>
<cfdi:Comprobante
  xmlns:cfdi="http://www.sat.gob.mx/cfd/4"
  Version="4.0"
  Sello="KVttNUxYJFG8yLDvA5ZqYYZrJ8GqHgbPfQvYdVxSP3mR=="
  NoCertificado="30001000000300023708"
  SubTotal="5000.00"
  Total="5800.00"
>
  <cfdi:Emisor Rfc="XAXX010101000" Nombre="EMPRESA DEMO SA DE CV" RegimenFiscal="601"/>
  <cfdi:Receptor Rfc="XEXX010101000" Nombre="CLIENTE DEMO" UsoCFDI="G03"/>
</cfdi:Comprobante>`;

/**
 * XML without Sello attribute
 */
export const XML_WITHOUT_SELLO = `<?xml version="1.0" encoding="UTF-8"?>
<cfdi:Comprobante
  xmlns:cfdi="http://www.sat.gob.mx/cfd/4"
  Version="4.0"
  NoCertificado="30001000000300023708"
  SubTotal="5000.00"
  Total="5800.00"
>
  <cfdi:Emisor Rfc="XAXX010101000"/>
</cfdi:Comprobante>`;

/**
 * XML without NoCertificado attribute
 */
export const XML_WITHOUT_NOCERTIFICADO = `<?xml version="1.0" encoding="UTF-8"?>
<cfdi:Comprobante
  xmlns:cfdi="http://www.sat.gob.mx/cfd/4"
  Version="4.0"
  Sello="KVttNUxYJFG8yLDvA5ZqYYZrJ8GqHgbPfQvYdVxSP3mR=="
  SubTotal="5000.00"
  Total="5800.00"
>
  <cfdi:Emisor Rfc="XAXX010101000"/>
</cfdi:Comprobante>`;

/**
 * Malformed XML
 */
export const MALFORMED_XML = `<?xml version="1.0" encoding="UTF-8"?>
<cfdi:Comprobante Version="4.0"
  <Missing closing bracket
</cfdi:Comprobante>`;

/**
 * XML without CondicionesDePago (optional field)
 */
export const XML_WITHOUT_CONDITIONS = `<?xml version="1.0" encoding="UTF-8"?>
<cfdi:Comprobante
  xmlns:cfdi="http://www.sat.gob.mx/cfd/4"
  xmlns:tfd="http://www.sat.gob.mx/TimbreFiscalDigital"
  Version="4.0"
  Sello="KVttNUxYJFG8yLDvA5ZqYYZrJ8GqHgbPfQvYdVxSP3mR1234567890ABCDEF=="
  NoCertificado="30001000000300023708"
  SubTotal="5000.00"
  Total="5800.00"
>
  <cfdi:Emisor Rfc="XAXX010101000"/>
  <cfdi:Complemento>
    <tfd:TimbreFiscalDigital
      Version="1.1"
      UUID="05c519de-6d20-4258-88fb-c69a5970e927"
      SelloSAT="qadm+mH3yLDvA5Zq=="
    />
  </cfdi:Complemento>
</cfdi:Comprobante>`;

/**
 * Expected extracted values from MINIMAL_STAMPED_XML
 */
export const EXPECTED_EXTRACTED = {
  noCertificadoEmisor: '30001000000300023708',
  selloEmisor:
    'KVttNUxYJFG8yLDvA5ZqYYZrJ8GqHgbPfQvYdVxSP3mRabcdefghijk1234567890ABCDEFGHIJKLMNOP==',
  uuid: '05c519de-6d20-4258-88fb-c69a5970e927',
  condicionesDePago: 'CONTADO',
};
