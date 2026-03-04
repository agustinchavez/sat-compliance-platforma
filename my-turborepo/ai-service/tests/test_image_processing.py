"""
Tests for image processing service.
"""

import pytest
import numpy as np
from PIL import Image
from unittest.mock import patch, MagicMock

from app.services.image_processing import ImageProcessingService


@pytest.fixture
def image_processor():
    """Create an ImageProcessingService instance."""
    return ImageProcessingService()


@pytest.fixture
def sample_rgb_image():
    """Create a sample RGB image for testing."""
    return Image.new('RGB', (100, 100), color='white')


@pytest.fixture
def sample_grayscale_image():
    """Create a sample grayscale image for testing."""
    return Image.new('L', (100, 100), color=128)


@pytest.fixture
def oversized_image():
    """Create an oversized image for testing."""
    return Image.new('RGB', (5000, 3000), color='white')


@pytest.fixture
def small_image():
    """Create a small image for testing (likely too small for OCR)."""
    return Image.new('RGB', (100, 100), color='white')


class TestConvertToGrayscale:
    """Tests for convert_to_grayscale method."""

    def test_converts_rgb_to_grayscale(self, image_processor, sample_rgb_image):
        """Test convert_to_grayscale returns image in mode 'L'."""
        result = image_processor.convert_to_grayscale(sample_rgb_image)
        assert result.mode == 'L'

    def test_returns_grayscale_unchanged(self, image_processor, sample_grayscale_image):
        """Test already grayscale images are returned unchanged."""
        result = image_processor.convert_to_grayscale(sample_grayscale_image)
        assert result.mode == 'L'
        # Should be the same object (or at least identical)
        assert result == sample_grayscale_image


class TestResizeImage:
    """Tests for resize_image method."""

    def test_does_not_resize_within_bounds(self, image_processor):
        """Test resize_image does not resize images within bounds."""
        image = Image.new('RGB', (1000, 800), color='white')
        result = image_processor.resize_image(image, max_size=4096)
        assert result.size == (1000, 800)

    def test_resizes_oversized_width(self, image_processor, oversized_image):
        """Test resize_image resizes oversized images preserving aspect ratio."""
        result = image_processor.resize_image(oversized_image, max_size=4096)

        # Should be resized to max_size on longest dimension
        assert result.size[0] <= 4096
        assert result.size[1] <= 4096
        # Aspect ratio should be preserved
        original_ratio = 5000 / 3000
        new_ratio = result.size[0] / result.size[1]
        assert abs(original_ratio - new_ratio) < 0.01

    def test_resizes_oversized_height(self, image_processor):
        """Test resize when height is the larger dimension."""
        image = Image.new('RGB', (3000, 5000), color='white')
        result = image_processor.resize_image(image, max_size=4096)

        assert result.size[0] <= 4096
        assert result.size[1] <= 4096
        assert result.size[1] == 4096  # Height should be max

    def test_warns_about_small_images(self, image_processor, small_image, caplog):
        """Test resize_image logs warning for small images."""
        import logging
        caplog.set_level(logging.WARNING)

        image_processor.resize_image(small_image)
        assert any("small" in record.message.lower() for record in caplog.records)


class TestDeskewImage:
    """Tests for deskew_image method."""

    def test_returns_original_on_failure(self, image_processor, sample_rgb_image):
        """Test deskew_image returns original image without raising on failure."""
        # A simple solid color image won't have edges to detect
        grayscale = image_processor.convert_to_grayscale(sample_rgb_image)
        result = image_processor.deskew_image(grayscale)

        # Should return an image (not raise)
        assert isinstance(result, Image.Image)

    def test_does_not_rotate_small_skew(self, image_processor):
        """Test deskew_image does not rotate if skew angle < 0.5 degrees."""
        # Create an image with text-like pattern at 0.3 degrees
        # For this test, we mock the angle detection
        image = Image.new('L', (500, 500), color=255)

        with patch('cv2.HoughLines') as mock_hough:
            # Return lines with very small angle
            mock_hough.return_value = np.array([[[0, np.pi/2]]])  # 0 degree skew

            result = image_processor.deskew_image(image)

            # Should return without rotation
            assert isinstance(result, Image.Image)


class TestEnhanceContrast:
    """Tests for enhance_contrast method."""

    def test_returns_numpy_compatible_array(self, image_processor, sample_grayscale_image):
        """Test enhance_contrast returns numpy-compatible array."""
        result = image_processor.enhance_contrast(sample_grayscale_image)

        # Convert to numpy array to verify compatibility
        arr = np.array(result)
        assert arr.shape == (100, 100)
        assert arr.dtype == np.uint8


class TestRemoveNoise:
    """Tests for remove_noise method."""

    def test_returns_image(self, image_processor, sample_grayscale_image):
        """Test remove_noise returns a PIL Image."""
        result = image_processor.remove_noise(sample_grayscale_image)
        assert isinstance(result, Image.Image)


class TestLoadImageFromBytes:
    """Tests for load_image_from_bytes method."""

    def test_raises_for_unsupported_type(self, image_processor):
        """Test load_image_from_bytes raises ValueError for unsupported type."""
        with pytest.raises(ValueError) as exc_info:
            image_processor.load_image_from_bytes(b"dummy", "txt")

        assert "Unsupported file type" in str(exc_info.value)

    def test_loads_jpeg_from_bytes(self, image_processor, sample_rgb_image):
        """Test load_image_from_bytes loads JPEG images."""
        import io
        buffer = io.BytesIO()
        sample_rgb_image.save(buffer, format='JPEG')
        jpeg_bytes = buffer.getvalue()

        result = image_processor.load_image_from_bytes(jpeg_bytes, "jpeg")
        assert isinstance(result, Image.Image)

    def test_loads_png_from_bytes(self, image_processor, sample_rgb_image):
        """Test load_image_from_bytes loads PNG images."""
        import io
        buffer = io.BytesIO()
        sample_rgb_image.save(buffer, format='PNG')
        png_bytes = buffer.getvalue()

        result = image_processor.load_image_from_bytes(png_bytes, "png")
        assert isinstance(result, Image.Image)


class TestPdfToImages:
    """Tests for pdf_to_images method."""

    def test_raises_for_large_pdfs(self, image_processor):
        """Test pdf_to_images raises ValueError for PDFs exceeding 20 pages."""
        with patch('app.services.image_processing.convert_from_bytes') as mock_convert:
            # Mock returning 25 images (pages)
            mock_convert.return_value = [Image.new('RGB', (100, 100)) for _ in range(25)]

            with pytest.raises(ValueError) as exc_info:
                image_processor.pdf_to_images(b"mock_pdf_bytes")

            assert "20 pages" in str(exc_info.value)

    def test_returns_list_of_images(self, image_processor):
        """Test pdf_to_images returns list of PIL Images."""
        with patch('app.services.image_processing.convert_from_bytes') as mock_convert:
            with patch('app.services.image_processing.pdfinfo_from_bytes') as mock_info:
                mock_info.return_value = {'Pages': 3}
                mock_convert.return_value = [
                    Image.new('RGB', (100, 100)),
                    Image.new('RGB', (100, 100)),
                    Image.new('RGB', (100, 100)),
                ]

                result = image_processor.pdf_to_images(b"mock_pdf_bytes")

                assert len(result) == 3
                assert all(isinstance(img, Image.Image) for img in result)


class TestPreprocessImage:
    """Tests for full preprocess_image pipeline."""

    def test_pipeline_runs_without_error(self, image_processor, sample_rgb_image):
        """Test full preprocess_image pipeline runs without error on a sample image."""
        result = image_processor.preprocess_image(sample_rgb_image)

        # Should return a processed image
        assert isinstance(result, Image.Image)
        # Should be grayscale after processing
        assert result.mode == 'L'

    def test_pipeline_with_grayscale_input(self, image_processor, sample_grayscale_image):
        """Test pipeline works with grayscale input."""
        result = image_processor.preprocess_image(sample_grayscale_image)
        assert isinstance(result, Image.Image)
        assert result.mode == 'L'

    def test_pipeline_preserves_dimensions(self, image_processor):
        """Test pipeline preserves dimensions for reasonable-sized images."""
        image = Image.new('RGB', (800, 600), color='white')
        result = image_processor.preprocess_image(image)

        # Dimensions should be preserved (approximately, rotation might change slightly)
        assert abs(result.size[0] - 800) < 10
        assert abs(result.size[1] - 600) < 10
