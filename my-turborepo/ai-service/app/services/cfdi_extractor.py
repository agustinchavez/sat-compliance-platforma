"""
CFDI XML Extractor Service.

Parses CFDI (Comprobante Fiscal Digital por Internet) XML documents
and extracts structured data for the SAT Compliance Platform.
"""

import logging
from decimal import Decimal, InvalidOperation
from datetime import datetime
from typing import Optional
from lxml import etree

from app.models.receipt import CFDIXMLData, ExtractedField

logger = logging.getLogger(__name__)

# CFDI XML Namespaces
CFDI_NAMESPACES = {
    'cfdi': 'http://www.sat.gob.mx/cfd/4',
    'cfdi33': 'http://www.sat.gob.mx/cfd/3',
    'tfd': 'http://www.sat.gob.mx/TimbreFiscalDigital',
}


class CFDIExtractor:
    """
    Service for extracting structured data from CFDI XML documents.

    Supports CFDI versions 3.3 and 4.0.
    """

    def __init__(self):
        """Initialize CFDI extractor."""
        self._namespaces = CFDI_NAMESPACES.copy()

    def extract_from_bytes(self, xml_bytes: bytes) -> CFDIXMLData:
        """
        Extract CFDI data from XML bytes.

        Args:
            xml_bytes: Raw XML content as bytes

        Returns:
            CFDIXMLData with extracted fields

        Raises:
            ValueError: If XML is invalid or not a valid CFDI
        """
        try:
            root = etree.fromstring(xml_bytes)
        except etree.XMLSyntaxError as e:
            logger.error(f"Invalid XML syntax: {e}")
            raise ValueError(f"Invalid XML syntax: {e}")

        return self._extract_from_element(root)

    def extract_from_string(self, xml_string: str) -> CFDIXMLData:
        """
        Extract CFDI data from XML string.

        Args:
            xml_string: XML content as string

        Returns:
            CFDIXMLData with extracted fields
        """
        return self.extract_from_bytes(xml_string.encode('utf-8'))

    def _extract_from_element(self, root: etree._Element) -> CFDIXMLData:
        """
        Extract CFDI data from parsed XML element.

        Args:
            root: Root XML element

        Returns:
            CFDIXMLData with extracted fields
        """
        # Detect CFDI version and update namespaces
        version = self._detect_version(root)
        ns = self._get_namespace_for_version(version)

        # Extract all fields
        return CFDIXMLData(
            uuid=self._extract_uuid(root),
            version=self._create_field(version, 1.0) if version else None,
            serie=self._extract_attribute(root, 'Serie'),
            folio=self._extract_attribute(root, 'Folio'),
            fecha=self._extract_fecha(root),
            forma_pago=self._extract_attribute(root, 'FormaPago'),
            metodo_pago=self._extract_attribute(root, 'MetodoPago'),
            tipo_comprobante=self._extract_attribute(root, 'TipoDeComprobante'),
            lugar_expedicion=self._extract_attribute(root, 'LugarExpedicion'),
            emisor_rfc=self._extract_emisor_rfc(root, ns),
            emisor_nombre=self._extract_emisor_nombre(root, ns),
            emisor_regimen=self._extract_emisor_regimen(root, ns),
            receptor_rfc=self._extract_receptor_rfc(root, ns),
            receptor_nombre=self._extract_receptor_nombre(root, ns),
            receptor_uso_cfdi=self._extract_receptor_uso_cfdi(root, ns),
            subtotal=self._extract_decimal_attribute(root, 'SubTotal'),
            descuento=self._extract_decimal_attribute(root, 'Descuento'),
            total=self._extract_decimal_attribute(root, 'Total'),
            moneda=self._extract_attribute(root, 'Moneda'),
            tipo_cambio=self._extract_decimal_attribute(root, 'TipoCambio'),
            conceptos=self._extract_conceptos(root, ns),
            impuestos_trasladados=self._extract_impuestos_trasladados(root, ns),
            impuestos_retenidos=self._extract_impuestos_retenidos(root, ns),
        )

    def _detect_version(self, root: etree._Element) -> Optional[str]:
        """Detect CFDI version from root element."""
        version = root.get('Version') or root.get('version')
        if version:
            return version

        # Check namespace to infer version
        ns = root.nsmap.get(None) or root.nsmap.get('cfdi')
        if ns:
            if 'cfd/4' in ns:
                return '4.0'
            elif 'cfd/3' in ns:
                return '3.3'

        return None

    def _get_namespace_for_version(self, version: Optional[str]) -> str:
        """Get appropriate namespace prefix for CFDI version."""
        if version and version.startswith('3'):
            return 'cfdi33'
        return 'cfdi'

    def _create_field(
        self,
        value: any,
        confidence: float,
        method: str = "xml_parse"
    ) -> ExtractedField:
        """Create an ExtractedField with given value and confidence."""
        return ExtractedField(value=value, confidence=confidence, method=method)

    def _extract_attribute(
        self,
        element: etree._Element,
        attr_name: str
    ) -> Optional[ExtractedField]:
        """Extract a string attribute from element."""
        value = element.get(attr_name)
        if value:
            return self._create_field(value, 1.0)
        return None

    def _extract_decimal_attribute(
        self,
        element: etree._Element,
        attr_name: str
    ) -> Optional[ExtractedField]:
        """Extract a decimal attribute from element."""
        value = element.get(attr_name)
        if value:
            try:
                decimal_value = Decimal(value)
                return self._create_field(decimal_value, 1.0)
            except InvalidOperation:
                logger.warning(f"Invalid decimal value for {attr_name}: {value}")
        return None

    def _extract_uuid(self, root: etree._Element) -> Optional[ExtractedField]:
        """Extract UUID from TimbreFiscalDigital complement."""
        # Try different namespace combinations
        for tfd_ns in ['tfd', None]:
            try:
                if tfd_ns:
                    xpath = f".//tfd:TimbreFiscalDigital"
                    tfd = root.find(xpath, namespaces=self._namespaces)
                else:
                    # Search without namespace
                    for elem in root.iter():
                        if 'TimbreFiscalDigital' in elem.tag:
                            uuid = elem.get('UUID')
                            if uuid:
                                return self._create_field(uuid.upper(), 1.0)

                if tfd is not None:
                    uuid = tfd.get('UUID')
                    if uuid:
                        return self._create_field(uuid.upper(), 1.0)
            except Exception:
                continue

        return None

    def _extract_fecha(self, root: etree._Element) -> Optional[ExtractedField]:
        """Extract and parse fecha attribute."""
        fecha_str = root.get('Fecha')
        if fecha_str:
            try:
                # CFDI uses ISO format: 2024-03-15T14:30:00
                fecha = datetime.fromisoformat(fecha_str.replace('Z', '+00:00'))
                return self._create_field(fecha, 1.0)
            except ValueError:
                logger.warning(f"Invalid fecha format: {fecha_str}")
                return self._create_field(fecha_str, 0.5)
        return None

    def _find_element(
        self,
        root: etree._Element,
        local_name: str,
        ns: str
    ) -> Optional[etree._Element]:
        """Find element by local name, trying multiple namespace strategies."""
        # Try with explicit namespace
        try:
            xpath = f".//{ns}:{local_name}"
            elem = root.find(xpath, namespaces=self._namespaces)
            if elem is not None:
                return elem
        except Exception:
            pass

        # Try without namespace prefix
        for elem in root.iter():
            if local_name in elem.tag:
                return elem

        return None

    def _extract_emisor_rfc(
        self,
        root: etree._Element,
        ns: str
    ) -> Optional[ExtractedField]:
        """Extract emisor RFC."""
        emisor = self._find_element(root, 'Emisor', ns)
        if emisor is not None:
            rfc = emisor.get('Rfc') or emisor.get('rfc')
            if rfc:
                return self._create_field(rfc.upper(), 1.0)
        return None

    def _extract_emisor_nombre(
        self,
        root: etree._Element,
        ns: str
    ) -> Optional[ExtractedField]:
        """Extract emisor name."""
        emisor = self._find_element(root, 'Emisor', ns)
        if emisor is not None:
            nombre = emisor.get('Nombre') or emisor.get('nombre')
            if nombre:
                return self._create_field(nombre, 1.0)
        return None

    def _extract_emisor_regimen(
        self,
        root: etree._Element,
        ns: str
    ) -> Optional[ExtractedField]:
        """Extract emisor fiscal regime."""
        emisor = self._find_element(root, 'Emisor', ns)
        if emisor is not None:
            regimen = emisor.get('RegimenFiscal')
            if regimen:
                return self._create_field(regimen, 1.0)
        return None

    def _extract_receptor_rfc(
        self,
        root: etree._Element,
        ns: str
    ) -> Optional[ExtractedField]:
        """Extract receptor RFC."""
        receptor = self._find_element(root, 'Receptor', ns)
        if receptor is not None:
            rfc = receptor.get('Rfc') or receptor.get('rfc')
            if rfc:
                return self._create_field(rfc.upper(), 1.0)
        return None

    def _extract_receptor_nombre(
        self,
        root: etree._Element,
        ns: str
    ) -> Optional[ExtractedField]:
        """Extract receptor name."""
        receptor = self._find_element(root, 'Receptor', ns)
        if receptor is not None:
            nombre = receptor.get('Nombre') or receptor.get('nombre')
            if nombre:
                return self._create_field(nombre, 1.0)
        return None

    def _extract_receptor_uso_cfdi(
        self,
        root: etree._Element,
        ns: str
    ) -> Optional[ExtractedField]:
        """Extract receptor uso CFDI."""
        receptor = self._find_element(root, 'Receptor', ns)
        if receptor is not None:
            uso = receptor.get('UsoCFDI')
            if uso:
                return self._create_field(uso, 1.0)
        return None

    def _extract_conceptos(
        self,
        root: etree._Element,
        ns: str
    ) -> Optional[ExtractedField]:
        """Extract list of conceptos (line items)."""
        conceptos_list = []

        # Find all Concepto elements
        for elem in root.iter():
            if 'Concepto' in elem.tag and 'Conceptos' not in elem.tag:
                concepto = {
                    'clave_prod_serv': elem.get('ClaveProdServ'),
                    'clave_unidad': elem.get('ClaveUnidad'),
                    'descripcion': elem.get('Descripcion'),
                    'cantidad': self._safe_decimal(elem.get('Cantidad')),
                    'valor_unitario': self._safe_decimal(elem.get('ValorUnitario')),
                    'importe': self._safe_decimal(elem.get('Importe')),
                    'descuento': self._safe_decimal(elem.get('Descuento')),
                }
                # Filter out None values
                concepto = {k: v for k, v in concepto.items() if v is not None}
                if concepto:
                    conceptos_list.append(concepto)

        if conceptos_list:
            return self._create_field(conceptos_list, 1.0)
        return None

    def _extract_impuestos_trasladados(
        self,
        root: etree._Element,
        ns: str
    ) -> Optional[ExtractedField]:
        """Extract transferred taxes (IVA, IEPS, etc.)."""
        impuestos = []

        for elem in root.iter():
            if 'Traslado' in elem.tag and 'Traslados' not in elem.tag:
                impuesto = {
                    'impuesto': elem.get('Impuesto'),
                    'tipo_factor': elem.get('TipoFactor'),
                    'tasa_o_cuota': self._safe_decimal(elem.get('TasaOCuota')),
                    'importe': self._safe_decimal(elem.get('Importe')),
                    'base': self._safe_decimal(elem.get('Base')),
                }
                impuesto = {k: v for k, v in impuesto.items() if v is not None}
                if impuesto:
                    impuestos.append(impuesto)

        if impuestos:
            return self._create_field(impuestos, 1.0)
        return None

    def _extract_impuestos_retenidos(
        self,
        root: etree._Element,
        ns: str
    ) -> Optional[ExtractedField]:
        """Extract retained taxes (ISR, IVA retention, etc.)."""
        impuestos = []

        for elem in root.iter():
            if 'Retencion' in elem.tag and 'Retenciones' not in elem.tag:
                impuesto = {
                    'impuesto': elem.get('Impuesto'),
                    'importe': self._safe_decimal(elem.get('Importe')),
                }
                impuesto = {k: v for k, v in impuesto.items() if v is not None}
                if impuesto:
                    impuestos.append(impuesto)

        if impuestos:
            return self._create_field(impuestos, 1.0)
        return None

    def _safe_decimal(self, value: Optional[str]) -> Optional[str]:
        """Safely convert string to decimal string, returning None on failure."""
        if value is None:
            return None
        try:
            # Validate it's a valid decimal
            Decimal(value)
            return value
        except (InvalidOperation, ValueError):
            return None

    def validate_cfdi(self, cfdi_data: CFDIXMLData) -> list[str]:
        """
        Validate extracted CFDI data for completeness.

        Args:
            cfdi_data: Extracted CFDI data

        Returns:
            List of validation warnings/errors
        """
        warnings = []

        # Required fields
        if not cfdi_data.uuid:
            warnings.append("Missing UUID (TimbreFiscalDigital)")
        if not cfdi_data.emisor_rfc:
            warnings.append("Missing emisor RFC")
        if not cfdi_data.receptor_rfc:
            warnings.append("Missing receptor RFC")
        if not cfdi_data.total:
            warnings.append("Missing total amount")
        if not cfdi_data.fecha:
            warnings.append("Missing fecha")

        # Validate RFC formats
        if cfdi_data.emisor_rfc:
            rfc = cfdi_data.emisor_rfc.value
            if len(rfc) not in [12, 13]:
                warnings.append(f"Invalid emisor RFC length: {len(rfc)}")

        if cfdi_data.receptor_rfc:
            rfc = cfdi_data.receptor_rfc.value
            if len(rfc) not in [12, 13] and rfc != "XAXX010101000":
                warnings.append(f"Invalid receptor RFC length: {len(rfc)}")

        return warnings
