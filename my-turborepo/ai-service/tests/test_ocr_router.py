"""
Tests for OCR router endpoints.
"""

import pytest
import io
from unittest.mock import patch, MagicMock, AsyncMock
from fastapi.testclient import TestClient
from PIL import Image

from app.routers.ocr import _get_file_type, _receipt_data_to_dict, _dict_to_receipt_data
from app.models.receipt import FileType, ReceiptData, ExtractedField
from decimal import Decimal
from datetime import date


class TestGetFileType:
    """Tests for _get_file_type helper."""

    def test_jpeg_from_content_type(self):
        """Test JPEG detection from content type."""
        result = _get_file_type("image/jpeg", "photo.jpg")
        assert result == FileType.JPEG

    def test_png_from_content_type(self):
        """Test PNG detection from content type."""
        result = _get_file_type("image/png", "image.png")
        assert result == FileType.PNG

    def test_webp_from_content_type(self):
        """Test WebP detection from content type."""
        result = _get_file_type("image/webp", "photo.webp")
        assert result == FileType.WEBP

    def test_pdf_from_content_type(self):
        """Test PDF detection from content type."""
        result = _get_file_type("application/pdf", "document.pdf")
        assert result == FileType.PDF

    def test_xml_from_content_type(self):
        """Test XML detection from content type."""
        result = _get_file_type("text/xml", "cfdi.xml")
        assert result == FileType.XML

    def test_fallback_to_extension(self):
        """Test fallback to filename extension."""
        result = _get_file_type("application/octet-stream", "receipt.jpg")
        assert result == FileType.JPEG

    def test_unsupported_type_raises(self):
        """Test unsupported type raises ValueError."""
        with pytest.raises(ValueError) as exc_info:
            _get_file_type("text/plain", "notes.txt")

        assert "Unsupported" in str(exc_info.value)


class TestReceiptDataSerialization:
    """Tests for ReceiptData serialization helpers."""

    def test_receipt_data_to_dict(self):
        """Test converting ReceiptData to dict."""
        data = ReceiptData(
            total_amount=ExtractedField(
                value=Decimal("100.50"),
                confidence=0.95,
                method="regex"
            ),
            rfc=ExtractedField(
                value="ABC123456XY9",
                confidence=0.9,
                method="regex"
            ),
        )

        result = _receipt_data_to_dict(data)

        assert 'total_amount' in result
        assert result['total_amount']['value'] == "100.50"
        assert result['total_amount']['confidence'] == 0.95
        assert 'rfc' in result
        assert result['rfc']['value'] == "ABC123456XY9"

    def test_dict_to_receipt_data(self):
        """Test converting dict back to ReceiptData."""
        data = {
            'total_amount': {
                'value': "150.00",
                'confidence': 0.9,
                'method': 'cached'
            },
            'date': {
                'value': "2024-03-15",
                'confidence': 0.8,
                'method': 'cached'
            },
        }

        result = _dict_to_receipt_data(data)

        assert isinstance(result, ReceiptData)
        assert result.total_amount is not None
        assert result.total_amount.value == Decimal("150.00")
        assert result.date is not None
        assert result.date.value == date(2024, 3, 15)

    def test_round_trip_serialization(self):
        """Test round-trip serialization preserves data."""
        original = ReceiptData(
            total_amount=ExtractedField(
                value=Decimal("500.00"),
                confidence=0.95,
                method="regex"
            ),
            currency=ExtractedField(
                value="MXN",
                confidence=1.0,
                method="default"
            ),
        )

        dict_form = _receipt_data_to_dict(original)
        restored = _dict_to_receipt_data(dict_form)

        assert restored.total_amount.value == original.total_amount.value
        assert restored.currency.value == original.currency.value


class TestProcessEndpoint:
    """Tests for /ocr/process endpoint."""

    @pytest.fixture
    def mock_services(self):
        """Mock OCR services."""
        with patch('app.routers.ocr.image_processor') as mock_img, \
             patch('app.routers.ocr.ocr_service') as mock_ocr, \
             patch('app.routers.ocr.cfdi_extractor') as mock_cfdi:

            # Setup mocks
            mock_img.load_image_from_bytes.return_value = Image.new('RGB', (100, 100))
            mock_img.preprocess_image.return_value = Image.new('L', (100, 100))
            mock_img.pdf_to_images.return_value = [Image.new('RGB', (100, 100))]

            mock_ocr.compute_file_hash.return_value = "abc123hash"
            mock_ocr.preprocess_and_extract.return_value = ("TOTAL: $100.00", 85.0)
            mock_ocr.parse_receipt_data.return_value = ReceiptData(
                total_amount=ExtractedField(
                    value=Decimal("100.00"),
                    confidence=0.9,
                    method="regex"
                )
            )
            mock_ocr._calculate_overall_confidence.return_value = 0.9

            yield {
                'image_processor': mock_img,
                'ocr_service': mock_ocr,
                'cfdi_extractor': mock_cfdi,
            }

    def test_process_accepts_jpeg(self, test_client, mock_services):
        """Test endpoint accepts JPEG images."""
        # Create a valid JPEG in memory
        img = Image.new('RGB', (100, 100), color='white')
        buffer = io.BytesIO()
        img.save(buffer, format='JPEG')
        buffer.seek(0)

        with patch('app.routers.ocr._check_cache', new_callable=AsyncMock) as mock_cache:
            mock_cache.return_value = None
            with patch('app.routers.ocr._save_to_cache', new_callable=AsyncMock):
                response = test_client.post(
                    "/ocr/process",
                    files={"file": ("receipt.jpg", buffer, "image/jpeg")},
                )

        assert response.status_code == 200
        data = response.json()
        assert data['file_type'] == 'jpeg'

    def test_process_rejects_empty_file(self, test_client):
        """Test endpoint rejects empty files."""
        response = test_client.post(
            "/ocr/process",
            files={"file": ("empty.jpg", b"", "image/jpeg")},
        )

        assert response.status_code == 400
        assert "Empty" in response.json()['detail']

    def test_process_rejects_unsupported_type(self, test_client):
        """Test endpoint rejects unsupported file types."""
        response = test_client.post(
            "/ocr/process",
            files={"file": ("notes.txt", b"some text", "text/plain")},
        )

        assert response.status_code == 400
        assert "Unsupported" in response.json()['detail']


class TestSupportedTypesEndpoint:
    """Tests for /ocr/supported-types endpoint."""

    def test_returns_supported_types(self, test_client):
        """Test endpoint returns list of supported types."""
        response = test_client.get("/ocr/supported-types")

        assert response.status_code == 200
        data = response.json()

        assert 'images' in data
        assert 'documents' in data
        assert 'cfdi' in data
        assert 'max_file_size_mb' in data
        assert 'max_pdf_pages' in data

        assert "image/jpeg" in data['images']
        assert "application/pdf" in data['documents']
        assert "text/xml" in data['cfdi']


class TestProcessCFDIEndpoint:
    """Tests for /ocr/process-cfdi endpoint."""

    @pytest.fixture
    def sample_cfdi_xml(self):
        """Sample CFDI XML for testing."""
        return """<?xml version="1.0"?>
        <cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/4"
            xmlns:tfd="http://www.sat.gob.mx/TimbreFiscalDigital"
            Version="4.0" Total="1000.00" Fecha="2024-03-15T10:00:00">
            <cfdi:Emisor Rfc="TEST123456AB" Nombre="Test Company"/>
            <cfdi:Receptor Rfc="RECV987654XY" Nombre="Receiver" UsoCFDI="G03"/>
            <cfdi:Complemento>
                <tfd:TimbreFiscalDigital UUID="12345678-1234-1234-1234-123456789012"/>
            </cfdi:Complemento>
        </cfdi:Comprobante>
        """

    def test_process_cfdi_returns_cfdi_data(self, test_client, sample_cfdi_xml):
        """Test CFDI endpoint returns CFDIXMLData."""
        response = test_client.post(
            "/ocr/process-cfdi",
            files={"file": ("factura.xml", sample_cfdi_xml.encode(), "text/xml")},
        )

        assert response.status_code == 200
        data = response.json()

        assert data.get('version', {}).get('value') == "4.0"
        assert data.get('emisor_rfc', {}).get('value') == "TEST123456AB"

    def test_process_cfdi_rejects_non_xml(self, test_client):
        """Test CFDI endpoint rejects non-XML files."""
        response = test_client.post(
            "/ocr/process-cfdi",
            files={"file": ("photo.jpg", b"fake image data", "image/jpeg")},
        )

        assert response.status_code == 400

    def test_process_cfdi_rejects_invalid_xml(self, test_client):
        """Test CFDI endpoint rejects invalid XML."""
        response = test_client.post(
            "/ocr/process-cfdi",
            files={"file": ("bad.xml", b"<not>valid xml", "text/xml")},
        )

        assert response.status_code == 400
        assert "Invalid" in response.json()['detail']
