"""
Tests for CFDI XML extractor service.
"""

import pytest
from decimal import Decimal
from datetime import datetime

from app.services.cfdi_extractor import CFDIExtractor
from app.models.receipt import CFDIXMLData


@pytest.fixture
def cfdi_extractor():
    """Create a CFDIExtractor instance."""
    return CFDIExtractor()


@pytest.fixture
def sample_cfdi_40_xml():
    """Sample CFDI 4.0 XML document."""
    return """<?xml version="1.0" encoding="UTF-8"?>
<cfdi:Comprobante
    xmlns:cfdi="http://www.sat.gob.mx/cfd/4"
    xmlns:tfd="http://www.sat.gob.mx/TimbreFiscalDigital"
    Version="4.0"
    Serie="A"
    Folio="12345"
    Fecha="2024-03-15T14:30:00"
    FormaPago="03"
    MetodoPago="PUE"
    TipoDeComprobante="I"
    LugarExpedicion="06600"
    SubTotal="1000.00"
    Descuento="50.00"
    Total="1102.00"
    Moneda="MXN">
    <cfdi:Emisor
        Rfc="EMP123456ABC"
        Nombre="EMPRESA EJEMPLO SA DE CV"
        RegimenFiscal="601"/>
    <cfdi:Receptor
        Rfc="REC987654XYZ"
        Nombre="RECEPTOR PRUEBA SA"
        UsoCFDI="G03"/>
    <cfdi:Conceptos>
        <cfdi:Concepto
            ClaveProdServ="43211503"
            ClaveUnidad="H87"
            Descripcion="Computadora portátil"
            Cantidad="2"
            ValorUnitario="500.00"
            Importe="1000.00">
            <cfdi:Impuestos>
                <cfdi:Traslados>
                    <cfdi:Traslado
                        Base="1000.00"
                        Impuesto="002"
                        TipoFactor="Tasa"
                        TasaOCuota="0.160000"
                        Importe="160.00"/>
                </cfdi:Traslados>
            </cfdi:Impuestos>
        </cfdi:Concepto>
    </cfdi:Conceptos>
    <cfdi:Impuestos TotalImpuestosTrasladados="160.00">
        <cfdi:Traslados>
            <cfdi:Traslado
                Base="1000.00"
                Impuesto="002"
                TipoFactor="Tasa"
                TasaOCuota="0.160000"
                Importe="160.00"/>
        </cfdi:Traslados>
    </cfdi:Impuestos>
    <cfdi:Complemento>
        <tfd:TimbreFiscalDigital
            UUID="A1B2C3D4-E5F6-7890-ABCD-EF1234567890"
            FechaTimbrado="2024-03-15T14:35:00"
            SelloCFD="abc123..."
            SelloSAT="xyz789..."/>
    </cfdi:Complemento>
</cfdi:Comprobante>
"""


@pytest.fixture
def sample_cfdi_33_xml():
    """Sample CFDI 3.3 XML document."""
    return """<?xml version="1.0" encoding="UTF-8"?>
<cfdi:Comprobante
    xmlns:cfdi="http://www.sat.gob.mx/cfd/3"
    xmlns:tfd="http://www.sat.gob.mx/TimbreFiscalDigital"
    Version="3.3"
    Serie="B"
    Folio="67890"
    Fecha="2023-12-01T10:00:00"
    FormaPago="01"
    MetodoPago="PPD"
    TipoDeComprobante="I"
    LugarExpedicion="03100"
    SubTotal="5000.00"
    Total="5800.00"
    Moneda="MXN">
    <cfdi:Emisor
        Rfc="OLD123456XY9"
        Nombre="EMPRESA ANTIGUA SA"
        RegimenFiscal="612"/>
    <cfdi:Receptor
        Rfc="CLI456789ABC"
        Nombre="CLIENTE ANTIGUO"
        UsoCFDI="P01"/>
    <cfdi:Conceptos>
        <cfdi:Concepto
            ClaveProdServ="81112100"
            ClaveUnidad="E48"
            Descripcion="Servicios de consultoría"
            Cantidad="10"
            ValorUnitario="500.00"
            Importe="5000.00"/>
    </cfdi:Conceptos>
    <cfdi:Complemento>
        <tfd:TimbreFiscalDigital
            UUID="12345678-ABCD-EF01-2345-6789ABCDEF01"
            FechaTimbrado="2023-12-01T10:05:00"/>
    </cfdi:Complemento>
</cfdi:Comprobante>
"""


@pytest.fixture
def sample_cfdi_with_retention():
    """Sample CFDI with tax retention."""
    return """<?xml version="1.0" encoding="UTF-8"?>
<cfdi:Comprobante
    xmlns:cfdi="http://www.sat.gob.mx/cfd/4"
    xmlns:tfd="http://www.sat.gob.mx/TimbreFiscalDigital"
    Version="4.0"
    Fecha="2024-01-15T09:00:00"
    SubTotal="10000.00"
    Total="10160.00"
    Moneda="MXN">
    <cfdi:Emisor Rfc="PROVI123456AB" Nombre="PROVEEDOR SERVICIOS"/>
    <cfdi:Receptor Rfc="CLIEN987654XY" Nombre="CLIENTE CORP" UsoCFDI="G03"/>
    <cfdi:Conceptos>
        <cfdi:Concepto
            ClaveProdServ="80101500"
            Descripcion="Servicios profesionales"
            Cantidad="1"
            ValorUnitario="10000.00"
            Importe="10000.00"/>
    </cfdi:Conceptos>
    <cfdi:Impuestos TotalImpuestosTrasladados="1600.00" TotalImpuestosRetenidos="1440.00">
        <cfdi:Retenciones>
            <cfdi:Retencion Impuesto="001" Importe="1066.67"/>
            <cfdi:Retencion Impuesto="002" Importe="373.33"/>
        </cfdi:Retenciones>
        <cfdi:Traslados>
            <cfdi:Traslado Impuesto="002" TipoFactor="Tasa" TasaOCuota="0.16" Importe="1600.00"/>
        </cfdi:Traslados>
    </cfdi:Impuestos>
    <cfdi:Complemento>
        <tfd:TimbreFiscalDigital UUID="RETENT10-TEST-UUID-1234-567890ABCDEF"/>
    </cfdi:Complemento>
</cfdi:Comprobante>
"""


@pytest.fixture
def sample_cfdi_usd():
    """Sample CFDI in USD."""
    return """<?xml version="1.0" encoding="UTF-8"?>
<cfdi:Comprobante
    xmlns:cfdi="http://www.sat.gob.mx/cfd/4"
    Version="4.0"
    Fecha="2024-02-20T16:00:00"
    SubTotal="1000.00"
    Total="1160.00"
    Moneda="USD"
    TipoCambio="17.25">
    <cfdi:Emisor Rfc="EXPORT123456A" Nombre="EXPORTADORA SA"/>
    <cfdi:Receptor Rfc="IMPORT987654B" Nombre="IMPORTADORA LLC"/>
</cfdi:Comprobante>
"""


class TestExtractFromBytes:
    """Tests for extract_from_bytes method."""

    def test_extracts_cfdi_40(self, cfdi_extractor, sample_cfdi_40_xml):
        """Test extraction of CFDI 4.0 document."""
        result = cfdi_extractor.extract_from_bytes(sample_cfdi_40_xml.encode('utf-8'))

        assert isinstance(result, CFDIXMLData)
        assert result.version.value == "4.0"
        assert result.serie.value == "A"
        assert result.folio.value == "12345"

    def test_extracts_cfdi_33(self, cfdi_extractor, sample_cfdi_33_xml):
        """Test extraction of CFDI 3.3 document."""
        result = cfdi_extractor.extract_from_bytes(sample_cfdi_33_xml.encode('utf-8'))

        assert isinstance(result, CFDIXMLData)
        assert result.version.value == "3.3"
        assert result.serie.value == "B"

    def test_raises_on_invalid_xml(self, cfdi_extractor):
        """Test raises ValueError on invalid XML."""
        with pytest.raises(ValueError) as exc_info:
            cfdi_extractor.extract_from_bytes(b"<invalid>not closed")

        assert "Invalid XML" in str(exc_info.value)


class TestExtractFromString:
    """Tests for extract_from_string method."""

    def test_extracts_from_string(self, cfdi_extractor, sample_cfdi_40_xml):
        """Test extraction from string works."""
        result = cfdi_extractor.extract_from_string(sample_cfdi_40_xml)

        assert isinstance(result, CFDIXMLData)
        assert result.version.value == "4.0"


class TestExtractUUID:
    """Tests for UUID extraction."""

    def test_extracts_uuid(self, cfdi_extractor, sample_cfdi_40_xml):
        """Test UUID extraction from TimbreFiscalDigital."""
        result = cfdi_extractor.extract_from_bytes(sample_cfdi_40_xml.encode('utf-8'))

        assert result.uuid is not None
        assert result.uuid.value == "A1B2C3D4-E5F6-7890-ABCD-EF1234567890"
        assert result.uuid.confidence == 1.0

    def test_uuid_uppercase(self, cfdi_extractor, sample_cfdi_33_xml):
        """Test UUID is converted to uppercase."""
        result = cfdi_extractor.extract_from_bytes(sample_cfdi_33_xml.encode('utf-8'))

        assert result.uuid is not None
        assert result.uuid.value == result.uuid.value.upper()


class TestExtractEmisor:
    """Tests for emisor extraction."""

    def test_extracts_emisor_rfc(self, cfdi_extractor, sample_cfdi_40_xml):
        """Test emisor RFC extraction."""
        result = cfdi_extractor.extract_from_bytes(sample_cfdi_40_xml.encode('utf-8'))

        assert result.emisor_rfc is not None
        assert result.emisor_rfc.value == "EMP123456ABC"

    def test_extracts_emisor_nombre(self, cfdi_extractor, sample_cfdi_40_xml):
        """Test emisor nombre extraction."""
        result = cfdi_extractor.extract_from_bytes(sample_cfdi_40_xml.encode('utf-8'))

        assert result.emisor_nombre is not None
        assert result.emisor_nombre.value == "EMPRESA EJEMPLO SA DE CV"

    def test_extracts_emisor_regimen(self, cfdi_extractor, sample_cfdi_40_xml):
        """Test emisor regimen fiscal extraction."""
        result = cfdi_extractor.extract_from_bytes(sample_cfdi_40_xml.encode('utf-8'))

        assert result.emisor_regimen is not None
        assert result.emisor_regimen.value == "601"


class TestExtractReceptor:
    """Tests for receptor extraction."""

    def test_extracts_receptor_rfc(self, cfdi_extractor, sample_cfdi_40_xml):
        """Test receptor RFC extraction."""
        result = cfdi_extractor.extract_from_bytes(sample_cfdi_40_xml.encode('utf-8'))

        assert result.receptor_rfc is not None
        assert result.receptor_rfc.value == "REC987654XYZ"

    def test_extracts_receptor_nombre(self, cfdi_extractor, sample_cfdi_40_xml):
        """Test receptor nombre extraction."""
        result = cfdi_extractor.extract_from_bytes(sample_cfdi_40_xml.encode('utf-8'))

        assert result.receptor_nombre is not None
        assert result.receptor_nombre.value == "RECEPTOR PRUEBA SA"

    def test_extracts_receptor_uso_cfdi(self, cfdi_extractor, sample_cfdi_40_xml):
        """Test receptor uso CFDI extraction."""
        result = cfdi_extractor.extract_from_bytes(sample_cfdi_40_xml.encode('utf-8'))

        assert result.receptor_uso_cfdi is not None
        assert result.receptor_uso_cfdi.value == "G03"


class TestExtractAmounts:
    """Tests for amount extraction."""

    def test_extracts_subtotal(self, cfdi_extractor, sample_cfdi_40_xml):
        """Test subtotal extraction."""
        result = cfdi_extractor.extract_from_bytes(sample_cfdi_40_xml.encode('utf-8'))

        assert result.subtotal is not None
        assert result.subtotal.value == Decimal("1000.00")

    def test_extracts_descuento(self, cfdi_extractor, sample_cfdi_40_xml):
        """Test descuento extraction."""
        result = cfdi_extractor.extract_from_bytes(sample_cfdi_40_xml.encode('utf-8'))

        assert result.descuento is not None
        assert result.descuento.value == Decimal("50.00")

    def test_extracts_total(self, cfdi_extractor, sample_cfdi_40_xml):
        """Test total extraction."""
        result = cfdi_extractor.extract_from_bytes(sample_cfdi_40_xml.encode('utf-8'))

        assert result.total is not None
        assert result.total.value == Decimal("1102.00")


class TestExtractCurrency:
    """Tests for currency extraction."""

    def test_extracts_mxn_currency(self, cfdi_extractor, sample_cfdi_40_xml):
        """Test MXN currency extraction."""
        result = cfdi_extractor.extract_from_bytes(sample_cfdi_40_xml.encode('utf-8'))

        assert result.moneda is not None
        assert result.moneda.value == "MXN"

    def test_extracts_usd_currency(self, cfdi_extractor, sample_cfdi_usd):
        """Test USD currency extraction."""
        result = cfdi_extractor.extract_from_bytes(sample_cfdi_usd.encode('utf-8'))

        assert result.moneda is not None
        assert result.moneda.value == "USD"
        assert result.tipo_cambio is not None
        assert result.tipo_cambio.value == Decimal("17.25")


class TestExtractFecha:
    """Tests for fecha extraction."""

    def test_extracts_fecha_as_datetime(self, cfdi_extractor, sample_cfdi_40_xml):
        """Test fecha is parsed as datetime."""
        result = cfdi_extractor.extract_from_bytes(sample_cfdi_40_xml.encode('utf-8'))

        assert result.fecha is not None
        assert isinstance(result.fecha.value, datetime)
        assert result.fecha.value.year == 2024
        assert result.fecha.value.month == 3
        assert result.fecha.value.day == 15


class TestExtractConceptos:
    """Tests for conceptos extraction."""

    def test_extracts_conceptos_list(self, cfdi_extractor, sample_cfdi_40_xml):
        """Test conceptos extraction returns list."""
        result = cfdi_extractor.extract_from_bytes(sample_cfdi_40_xml.encode('utf-8'))

        assert result.conceptos is not None
        conceptos = result.conceptos.value
        assert isinstance(conceptos, list)
        assert len(conceptos) >= 1

    def test_concepto_contains_required_fields(self, cfdi_extractor, sample_cfdi_40_xml):
        """Test concepto contains expected fields."""
        result = cfdi_extractor.extract_from_bytes(sample_cfdi_40_xml.encode('utf-8'))

        concepto = result.conceptos.value[0]
        assert 'clave_prod_serv' in concepto
        assert 'descripcion' in concepto
        assert 'cantidad' in concepto
        assert 'importe' in concepto


class TestExtractImpuestos:
    """Tests for impuestos extraction."""

    def test_extracts_traslados(self, cfdi_extractor, sample_cfdi_40_xml):
        """Test traslados (IVA) extraction."""
        result = cfdi_extractor.extract_from_bytes(sample_cfdi_40_xml.encode('utf-8'))

        assert result.impuestos_trasladados is not None
        traslados = result.impuestos_trasladados.value
        assert isinstance(traslados, list)
        assert len(traslados) >= 1

    def test_extracts_retenciones(self, cfdi_extractor, sample_cfdi_with_retention):
        """Test retenciones extraction."""
        result = cfdi_extractor.extract_from_bytes(
            sample_cfdi_with_retention.encode('utf-8')
        )

        assert result.impuestos_retenidos is not None
        retenciones = result.impuestos_retenidos.value
        assert isinstance(retenciones, list)
        assert len(retenciones) == 2  # ISR and IVA retention


class TestValidateCFDI:
    """Tests for validate_cfdi method."""

    def test_valid_cfdi_no_warnings(self, cfdi_extractor, sample_cfdi_40_xml):
        """Test valid CFDI produces no warnings."""
        cfdi_data = cfdi_extractor.extract_from_bytes(sample_cfdi_40_xml.encode('utf-8'))
        warnings = cfdi_extractor.validate_cfdi(cfdi_data)

        assert len(warnings) == 0

    def test_missing_uuid_warning(self, cfdi_extractor):
        """Test missing UUID produces warning."""
        xml = """<?xml version="1.0"?>
        <cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/4"
            Version="4.0" Total="100.00" Fecha="2024-01-01T00:00:00">
            <cfdi:Emisor Rfc="TEST123456AB"/>
            <cfdi:Receptor Rfc="RECV987654XY"/>
        </cfdi:Comprobante>
        """
        cfdi_data = cfdi_extractor.extract_from_bytes(xml.encode('utf-8'))
        warnings = cfdi_extractor.validate_cfdi(cfdi_data)

        assert any("UUID" in w for w in warnings)

    def test_invalid_rfc_length_warning(self, cfdi_extractor):
        """Test invalid RFC length produces warning."""
        xml = """<?xml version="1.0"?>
        <cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/4"
            Version="4.0" Total="100.00" Fecha="2024-01-01T00:00:00">
            <cfdi:Emisor Rfc="INVALID"/>
            <cfdi:Receptor Rfc="ALSO_INVALID_RFC"/>
        </cfdi:Comprobante>
        """
        cfdi_data = cfdi_extractor.extract_from_bytes(xml.encode('utf-8'))
        warnings = cfdi_extractor.validate_cfdi(cfdi_data)

        assert any("RFC length" in w for w in warnings)


class TestPaymentAttributes:
    """Tests for payment-related attributes."""

    def test_extracts_forma_pago(self, cfdi_extractor, sample_cfdi_40_xml):
        """Test forma pago extraction."""
        result = cfdi_extractor.extract_from_bytes(sample_cfdi_40_xml.encode('utf-8'))

        assert result.forma_pago is not None
        assert result.forma_pago.value == "03"

    def test_extracts_metodo_pago(self, cfdi_extractor, sample_cfdi_40_xml):
        """Test metodo pago extraction."""
        result = cfdi_extractor.extract_from_bytes(sample_cfdi_40_xml.encode('utf-8'))

        assert result.metodo_pago is not None
        assert result.metodo_pago.value == "PUE"

    def test_extracts_tipo_comprobante(self, cfdi_extractor, sample_cfdi_40_xml):
        """Test tipo comprobante extraction."""
        result = cfdi_extractor.extract_from_bytes(sample_cfdi_40_xml.encode('utf-8'))

        assert result.tipo_comprobante is not None
        assert result.tipo_comprobante.value == "I"  # Ingreso

    def test_extracts_lugar_expedicion(self, cfdi_extractor, sample_cfdi_40_xml):
        """Test lugar expedicion extraction."""
        result = cfdi_extractor.extract_from_bytes(sample_cfdi_40_xml.encode('utf-8'))

        assert result.lugar_expedicion is not None
        assert result.lugar_expedicion.value == "06600"
