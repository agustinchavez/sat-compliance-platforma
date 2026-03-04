"""
Tests for OCR service.
"""

import pytest
from decimal import Decimal
from datetime import date
from unittest.mock import patch, MagicMock, AsyncMock
from PIL import Image
import numpy as np

from app.services.ocr import OCRService
from app.models.receipt import ReceiptData, ExtractedField, FileType


@pytest.fixture
def ocr_service():
    """Create an OCRService instance."""
    return OCRService()


@pytest.fixture
def sample_grayscale_image():
    """Create a sample grayscale image for testing."""
    return Image.new('L', (200, 200), color=128)


class TestComputeFileHash:
    """Tests for compute_file_hash method."""

    def test_computes_sha256_hash(self, ocr_service):
        """Test compute_file_hash returns SHA-256 hash."""
        data = b"test data for hashing"
        result = ocr_service.compute_file_hash(data)

        assert isinstance(result, str)
        assert len(result) == 64  # SHA-256 produces 64 hex characters

    def test_same_data_produces_same_hash(self, ocr_service):
        """Test same data produces identical hash."""
        data = b"consistent test data"
        hash1 = ocr_service.compute_file_hash(data)
        hash2 = ocr_service.compute_file_hash(data)

        assert hash1 == hash2

    def test_different_data_produces_different_hash(self, ocr_service):
        """Test different data produces different hash."""
        hash1 = ocr_service.compute_file_hash(b"data one")
        hash2 = ocr_service.compute_file_hash(b"data two")

        assert hash1 != hash2


class TestExtractRFC:
    """Tests for extract_rfc method."""

    def test_extracts_company_rfc_13_chars(self, ocr_service, sample_receipt_text):
        """Test extract_rfc finds 13-character company RFC."""
        result = ocr_service.extract_rfc(sample_receipt_text)

        assert result is not None
        assert result.value == "OXX950901G45"
        assert result.confidence > 0.5

    def test_extracts_rfc_from_formal_invoice(self, ocr_service, sample_formal_invoice_text):
        """Test extract_rfc finds RFC in formal invoice."""
        result = ocr_service.extract_rfc(sample_formal_invoice_text)

        assert result is not None
        # Should find first RFC (emisor)
        assert result.value in ["CTE180301AB9", "CEJ190501XYZ"]

    def test_extracts_personal_rfc_12_chars(self, ocr_service):
        """Test extract_rfc finds 12-character personal RFC."""
        text = "CONTRIBUYENTE: JUAN PEREZ\nRFC: PEPJ850101AB1"
        result = ocr_service.extract_rfc(text)

        assert result is not None
        assert result.value == "PEPJ850101AB"  # 12 chars without homoclave last char

    def test_returns_none_when_no_rfc(self, ocr_service):
        """Test extract_rfc returns None when no RFC present."""
        text = "Simple receipt without RFC number"
        result = ocr_service.extract_rfc(text)

        assert result is None

    def test_rfc_with_explicit_label(self, ocr_service):
        """Test RFC extraction prioritizes labeled RFC."""
        text = "RFC: ABC123456XY9\nFOLIO: XYZ987654321"
        result = ocr_service.extract_rfc(text)

        assert result is not None
        assert "ABC" in result.value


class TestExtractAmount:
    """Tests for extract_amount method."""

    def test_extracts_total_amount(self, ocr_service, sample_receipt_text):
        """Test extract_amount finds total amount."""
        result = ocr_service.extract_amount(sample_receipt_text)

        assert result is not None
        assert result.value == Decimal("64.38")

    def test_extracts_large_amount_with_commas(self, ocr_service, sample_formal_invoice_text):
        """Test extract_amount handles large amounts with comma separators."""
        result = ocr_service.extract_amount(sample_formal_invoice_text)

        assert result is not None
        assert result.value == Decimal("98600.00")

    def test_prioritizes_total_over_subtotal(self, ocr_service):
        """Test extract_amount prioritizes TOTAL keyword."""
        text = """
        SUBTOTAL: $500.00
        IVA: $80.00
        TOTAL: $580.00
        """
        result = ocr_service.extract_amount(text)

        assert result is not None
        assert result.value == Decimal("580.00")

    def test_returns_none_when_no_amount(self, ocr_service):
        """Test extract_amount returns None when no amount found."""
        text = "This text has no monetary values"
        result = ocr_service.extract_amount(text)

        assert result is None

    def test_handles_various_formats(self, ocr_service):
        """Test extract_amount handles various currency formats."""
        # Without peso sign
        text1 = "TOTAL: 150.50"
        result1 = ocr_service.extract_amount(text1)
        assert result1 is not None
        assert result1.value == Decimal("150.50")

        # With MXN prefix
        text2 = "TOTAL: MXN 200.00"
        result2 = ocr_service.extract_amount(text2)
        assert result2 is not None
        assert result2.value == Decimal("200.00")


class TestExtractSubtotal:
    """Tests for extract_subtotal method."""

    def test_extracts_subtotal(self, ocr_service, sample_receipt_text):
        """Test extract_subtotal finds subtotal amount."""
        result = ocr_service.extract_subtotal(sample_receipt_text)

        assert result is not None
        assert result.value == Decimal("55.50")

    def test_extracts_large_subtotal(self, ocr_service, sample_formal_invoice_text):
        """Test extract_subtotal handles large amounts."""
        result = ocr_service.extract_subtotal(sample_formal_invoice_text)

        assert result is not None
        assert result.value == Decimal("85000.00")


class TestExtractIVA:
    """Tests for extract_iva method."""

    def test_extracts_iva_amount(self, ocr_service, sample_receipt_text):
        """Test extract_iva finds IVA amount."""
        result = ocr_service.extract_iva(sample_receipt_text)

        assert result is not None
        assert result.value == Decimal("8.88")

    def test_extracts_large_iva(self, ocr_service, sample_formal_invoice_text):
        """Test extract_iva handles large amounts."""
        result = ocr_service.extract_iva(sample_formal_invoice_text)

        assert result is not None
        assert result.value == Decimal("13600.00")


class TestExtractCurrency:
    """Tests for extract_currency method."""

    def test_defaults_to_mxn(self, ocr_service, sample_receipt_text):
        """Test extract_currency defaults to MXN for peso amounts."""
        result = ocr_service.extract_currency(sample_receipt_text)

        assert result is not None
        assert result.value == "MXN"

    def test_detects_usd(self, ocr_service, sample_receipt_with_usd):
        """Test extract_currency detects USD."""
        result = ocr_service.extract_currency(sample_receipt_with_usd)

        assert result is not None
        assert result.value == "USD"

    def test_detects_explicit_mxn(self, ocr_service):
        """Test extract_currency detects explicit MXN."""
        text = "TOTAL: MXN 500.00"
        result = ocr_service.extract_currency(text)

        assert result is not None
        assert result.value == "MXN"


class TestExtractDate:
    """Tests for extract_date method."""

    def test_extracts_date_dd_mm_yyyy(self, ocr_service, sample_receipt_text):
        """Test extract_date parses DD/MM/YYYY format."""
        result = ocr_service.extract_date(sample_receipt_text)

        assert result is not None
        assert result.value == date(2024, 3, 15)

    def test_extracts_date_iso_format(self, ocr_service, sample_formal_invoice_text):
        """Test extract_date parses YYYY-MM-DD format."""
        result = ocr_service.extract_date(sample_formal_invoice_text)

        assert result is not None
        assert result.value == date(2024, 3, 15)

    def test_extracts_date_with_spanish_month(self, ocr_service, sample_receipt_minimal):
        """Test extract_date parses Spanish month names."""
        result = ocr_service.extract_date(sample_receipt_minimal)

        assert result is not None
        assert result.value == date(2024, 1, 1)

    def test_returns_none_for_no_date(self, ocr_service):
        """Test extract_date returns None when no date found."""
        text = "Receipt without any date"
        result = ocr_service.extract_date(text)

        assert result is None

    def test_handles_various_date_formats(self, ocr_service):
        """Test extract_date handles multiple formats."""
        # DD-MM-YYYY
        text1 = "FECHA: 25-12-2023"
        result1 = ocr_service.extract_date(text1)
        assert result1 is not None
        assert result1.value == date(2023, 12, 25)

        # DD/MMM/YYYY
        text2 = "FECHA: 10/ABR/2024"
        result2 = ocr_service.extract_date(text2)
        assert result2 is not None
        assert result2.value == date(2024, 4, 10)


class TestExtractVendor:
    """Tests for extract_vendor method."""

    def test_extracts_vendor_from_header(self, ocr_service, sample_receipt_text):
        """Test extract_vendor finds vendor name from receipt header."""
        result = ocr_service.extract_vendor(sample_receipt_text)

        assert result is not None
        assert "OXXO" in result.value.upper()

    def test_extracts_vendor_from_formal_invoice(self, ocr_service, sample_formal_invoice_text):
        """Test extract_vendor finds company name from invoice."""
        result = ocr_service.extract_vendor(sample_formal_invoice_text)

        assert result is not None
        # Should find emisor name
        assert len(result.value) > 0


class TestExtractReceiptNumber:
    """Tests for extract_receipt_number method."""

    def test_extracts_ticket_number(self, ocr_service, sample_receipt_text):
        """Test extract_receipt_number finds ticket number."""
        result = ocr_service.extract_receipt_number(sample_receipt_text)

        assert result is not None
        assert "123456" in result.value

    def test_extracts_folio_number(self, ocr_service, sample_formal_invoice_text):
        """Test extract_receipt_number finds folio number."""
        result = ocr_service.extract_receipt_number(sample_formal_invoice_text)

        assert result is not None
        assert "2024" in result.value or "001234" in result.value


class TestExtractAddress:
    """Tests for extract_address method."""

    def test_extracts_address(self, ocr_service, sample_receipt_text):
        """Test extract_address finds address."""
        result = ocr_service.extract_address(sample_receipt_text)

        assert result is not None
        # Should contain street or postal code info
        assert len(result.value) > 10

    def test_extracts_full_address(self, ocr_service, sample_formal_invoice_text):
        """Test extract_address finds complete address."""
        result = ocr_service.extract_address(sample_formal_invoice_text)

        assert result is not None


class TestParseReceiptData:
    """Tests for parse_receipt_data method."""

    def test_parses_complete_receipt(self, ocr_service, sample_receipt_text):
        """Test parse_receipt_data returns complete ReceiptData."""
        result = ocr_service.parse_receipt_data(sample_receipt_text)

        assert isinstance(result, ReceiptData)
        assert result.total_amount is not None
        assert result.rfc is not None
        assert result.date is not None
        assert result.currency is not None

    def test_parses_formal_invoice(self, ocr_service, sample_formal_invoice_text):
        """Test parse_receipt_data handles formal invoice."""
        result = ocr_service.parse_receipt_data(sample_formal_invoice_text)

        assert isinstance(result, ReceiptData)
        assert result.total_amount is not None
        assert result.subtotal is not None
        assert result.iva_amount is not None

    def test_handles_minimal_receipt(self, ocr_service, sample_receipt_minimal):
        """Test parse_receipt_data handles minimal receipt."""
        result = ocr_service.parse_receipt_data(sample_receipt_minimal)

        assert isinstance(result, ReceiptData)
        assert result.total_amount is not None

    def test_handles_empty_text(self, ocr_service):
        """Test parse_receipt_data handles empty text."""
        result = ocr_service.parse_receipt_data("")

        assert isinstance(result, ReceiptData)
        # All fields should be None
        assert result.total_amount is None
        assert result.rfc is None


class TestExtractText:
    """Tests for extract_text method."""

    def test_extract_text_returns_tuple(self, ocr_service, sample_grayscale_image):
        """Test extract_text returns (text, confidence) tuple."""
        with patch('pytesseract.image_to_data') as mock_tesseract:
            mock_tesseract.return_value = {
                'text': ['Hello', 'World', ''],
                'conf': [95, 90, -1]
            }

            text, confidence = ocr_service.extract_text(sample_grayscale_image)

            assert isinstance(text, str)
            assert isinstance(confidence, float)
            assert "Hello" in text
            assert "World" in text

    def test_extract_text_handles_low_confidence(self, ocr_service, sample_grayscale_image):
        """Test extract_text filters low confidence words."""
        with patch('pytesseract.image_to_data') as mock_tesseract:
            mock_tesseract.return_value = {
                'text': ['Good', 'Bad', 'OK'],
                'conf': [80, 10, 60]  # Bad has low confidence
            }

            text, confidence = ocr_service.extract_text(sample_grayscale_image)

            # Should still include text but affect overall confidence
            assert isinstance(confidence, float)


class TestPreprocessAndExtract:
    """Tests for preprocess_and_extract method."""

    def test_full_pipeline(self, ocr_service, sample_grayscale_image):
        """Test full preprocess_and_extract pipeline."""
        with patch.object(ocr_service, 'extract_text') as mock_extract:
            mock_extract.return_value = ("TOTAL: $100.00", 85.0)

            text, confidence = ocr_service.preprocess_and_extract(sample_grayscale_image)

            assert text == "TOTAL: $100.00"
            assert confidence == 85.0


class TestCalculateOverallConfidence:
    """Tests for _calculate_overall_confidence method."""

    def test_calculates_average_confidence(self, ocr_service):
        """Test confidence calculation with multiple fields."""
        receipt_data = ReceiptData(
            total_amount=ExtractedField(value=Decimal("100.00"), confidence=0.9, method="regex"),
            rfc=ExtractedField(value="ABC123456XY9", confidence=0.8, method="regex"),
            date=ExtractedField(value=date(2024, 1, 1), confidence=0.7, method="regex"),
        )

        result = ocr_service._calculate_overall_confidence(receipt_data)

        assert 0.7 <= result <= 0.9
        assert result == pytest.approx(0.8, rel=0.01)

    def test_handles_empty_receipt_data(self, ocr_service):
        """Test confidence calculation with no extracted fields."""
        receipt_data = ReceiptData()

        result = ocr_service._calculate_overall_confidence(receipt_data)

        assert result == 0.0

    def test_handles_single_field(self, ocr_service):
        """Test confidence calculation with single field."""
        receipt_data = ReceiptData(
            total_amount=ExtractedField(value=Decimal("50.00"), confidence=0.95, method="regex")
        )

        result = ocr_service._calculate_overall_confidence(receipt_data)

        assert result == 0.95
