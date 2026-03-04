"""
Tests for receipt OCR data models.
"""

import pytest
from decimal import Decimal
from pydantic import ValidationError

from app.models.receipt import (
    ExtractedField,
    ReceiptData,
    OCRResult,
    CFDIXMLData,
    FileType,
    OCRValidationResult,
)


class TestExtractedField:
    """Tests for ExtractedField model."""

    def test_extracted_field_valid_confidence(self):
        """Test ExtractedField accepts valid confidence values."""
        field = ExtractedField(value="test", confidence=0.5, method="regex")
        assert field.value == "test"
        assert field.confidence == 0.5
        assert field.method == "regex"

    def test_extracted_field_min_confidence(self):
        """Test ExtractedField accepts minimum confidence (0.0)."""
        field = ExtractedField(value="test", confidence=0.0, method="regex")
        assert field.confidence == 0.0

    def test_extracted_field_max_confidence(self):
        """Test ExtractedField accepts maximum confidence (1.0)."""
        field = ExtractedField(value="test", confidence=1.0, method="regex")
        assert field.confidence == 1.0

    def test_extracted_field_rejects_confidence_above_one(self):
        """Test ExtractedField rejects confidence values above 1.0."""
        with pytest.raises(ValidationError) as exc_info:
            ExtractedField(value="test", confidence=1.1, method="regex")

        assert "confidence" in str(exc_info.value)

    def test_extracted_field_rejects_negative_confidence(self):
        """Test ExtractedField rejects confidence values below 0.0."""
        with pytest.raises(ValidationError) as exc_info:
            ExtractedField(value="test", confidence=-0.1, method="regex")

        assert "confidence" in str(exc_info.value)

    def test_extracted_field_allows_none_value(self):
        """Test ExtractedField allows None value."""
        field = ExtractedField(value=None, confidence=0.0, method="regex")
        assert field.value is None


class TestReceiptData:
    """Tests for ReceiptData model."""

    def test_receipt_data_allows_all_none_fields(self):
        """Test ReceiptData allows all None fields (no required fields)."""
        data = ReceiptData()
        assert data.total_amount is None
        assert data.subtotal is None
        assert data.iva_amount is None
        assert data.currency is None
        assert data.vendor_name is None
        assert data.rfc is None
        assert data.receipt_number is None
        assert data.date is None
        assert data.address is None

    def test_receipt_data_with_extracted_fields(self):
        """Test ReceiptData with populated ExtractedFields."""
        data = ReceiptData(
            total_amount=ExtractedField(value="100.00", confidence=0.9, method="regex"),
            rfc=ExtractedField(value="ABC123456789", confidence=1.0, method="regex"),
        )
        assert data.total_amount.value == "100.00"
        assert data.rfc.confidence == 1.0


class TestOCRResult:
    """Tests for OCRResult model."""

    def test_ocr_result_serializes_to_json(self):
        """Test OCRResult serializes to JSON correctly."""
        result = OCRResult(
            file_hash="abc123def456",
            file_type=FileType.JPEG,
            raw_text="Sample OCR text",
            extracted_data=ReceiptData(
                total_amount=ExtractedField(value="89.90", confidence=0.9, method="regex")
            ),
            overall_confidence=0.85,
            processing_time_ms=1234,
            cached=False,
            warnings=["Low quality image"],
        )

        json_str = result.model_dump_json()
        assert "abc123def456" in json_str
        assert "jpeg" in json_str
        assert "89.90" in json_str
        assert "Low quality image" in json_str

    def test_ocr_result_default_values(self):
        """Test OCRResult default values."""
        result = OCRResult(
            file_hash="abc123",
            file_type=FileType.PNG,
            raw_text="text",
            extracted_data=ReceiptData(),
            overall_confidence=0.5,
            processing_time_ms=100,
        )

        assert result.cached is False
        assert result.warnings == []

    def test_ocr_result_rejects_invalid_confidence(self):
        """Test OCRResult rejects invalid overall_confidence."""
        with pytest.raises(ValidationError):
            OCRResult(
                file_hash="abc123",
                file_type=FileType.PNG,
                raw_text="text",
                extracted_data=ReceiptData(),
                overall_confidence=1.5,  # Invalid
                processing_time_ms=100,
            )


class TestCFDIXMLData:
    """Tests for CFDIXMLData model."""

    def test_cfdi_xml_data_decimal_fields(self):
        """Test CFDIXMLData correctly types Decimal fields."""
        data = CFDIXMLData(
            version="4.0",
            folio="123",
            fecha="2024-03-01T10:00:00",
            subtotal=Decimal("10000.00"),
            total=Decimal("11600.00"),
            moneda="MXN",
            tipo_comprobante="I",
            emisor_rfc="ECS200101ABC",
            emisor_nombre="EMPRESA CONSULTORA",
            emisor_regimen_fiscal="601",
            receptor_rfc="GOMJ850101AB2",
            receptor_nombre="JUAN GOMEZ",
            receptor_uso_cfdi="G03",
            conceptos=[{"descripcion": "Servicios"}],
            total_impuestos_trasladados=Decimal("1600.00"),
        )

        assert isinstance(data.subtotal, Decimal)
        assert isinstance(data.total, Decimal)
        assert isinstance(data.total_impuestos_trasladados, Decimal)
        assert data.subtotal == Decimal("10000.00")
        assert data.total == Decimal("11600.00")

    def test_cfdi_xml_data_optional_fields(self):
        """Test CFDIXMLData optional fields can be None."""
        data = CFDIXMLData(
            version="4.0",
            fecha="2024-03-01T10:00:00",
            subtotal=Decimal("1000.00"),
            total=Decimal("1160.00"),
            moneda="MXN",
            tipo_comprobante="I",
            emisor_rfc="ABC123456789",
            emisor_nombre="Test Company",
            emisor_regimen_fiscal="601",
            receptor_rfc="XYZ987654321",
            receptor_nombre="Test Customer",
            receptor_uso_cfdi="G03",
            conceptos=[],
        )

        assert data.folio is None
        assert data.tipo_cambio is None
        assert data.uuid is None
        assert data.total_impuestos_trasladados is None
        assert data.total_impuestos_retenidos is None


class TestFileType:
    """Tests for FileType enum."""

    def test_file_type_enum_values(self):
        """Test FileType enum validates acceptable file type strings."""
        assert FileType.JPEG.value == "jpeg"
        assert FileType.PNG.value == "png"
        assert FileType.WEBP.value == "webp"
        assert FileType.PDF.value == "pdf"
        assert FileType.XML.value == "xml"

    def test_file_type_from_string(self):
        """Test FileType can be created from string."""
        assert FileType("jpeg") == FileType.JPEG
        assert FileType("pdf") == FileType.PDF

    def test_file_type_invalid_string(self):
        """Test FileType rejects invalid strings."""
        with pytest.raises(ValueError):
            FileType("invalid")


class TestOCRValidationResult:
    """Tests for OCRValidationResult model."""

    def test_validation_result_valid(self):
        """Test valid validation result."""
        result = OCRValidationResult(valid=True, errors={})
        assert result.valid is True
        assert result.errors == {}

    def test_validation_result_with_errors(self):
        """Test validation result with errors."""
        result = OCRValidationResult(
            valid=False,
            errors={"rfc": "Invalid RFC format", "date": "Invalid date format"}
        )
        assert result.valid is False
        assert "rfc" in result.errors
        assert "date" in result.errors
