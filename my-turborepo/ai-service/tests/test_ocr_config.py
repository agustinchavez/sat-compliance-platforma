"""
Tests for OCR configuration settings.
"""

import os
import pytest
from unittest.mock import patch


class TestOCRConfig:
    """Test OCR configuration settings in config.py."""

    def test_ocr_settings_have_correct_defaults(self):
        """Test all new OCR settings have correct defaults."""
        # Clear any existing env vars
        env_vars_to_clear = [
            "TESSERACT_CMD",
            "OCR_LANGUAGE",
            "MAX_IMAGE_SIZE",
            "OCR_DPI",
            "OCR_CACHE_TTL",
            "MAX_FILE_SIZE_MB",
        ]

        with patch.dict(os.environ, {k: "" for k in env_vars_to_clear}, clear=False):
            # Remove them entirely
            for var in env_vars_to_clear:
                os.environ.pop(var, None)

            # Re-import to get fresh settings
            from importlib import reload
            import app.config
            reload(app.config)
            from app.config import Settings

            # Create fresh settings instance with required env vars
            settings = Settings(
                database_url="postgresql+asyncpg://test:test@localhost:5432/test"
            )

            # Check defaults
            assert settings.tesseract_cmd == "/usr/bin/tesseract"
            assert settings.ocr_language == "spa+eng"
            assert settings.max_image_size == 4096
            assert settings.ocr_dpi == 300
            assert settings.ocr_cache_ttl == 86400
            assert settings.max_file_size_mb == 10

    def test_ocr_settings_can_be_overridden_via_env(self):
        """Test settings can be overridden via environment variables."""
        custom_env = {
            "DATABASE_URL": "postgresql+asyncpg://test:test@localhost:5432/test",
            "TESSERACT_CMD": "/opt/homebrew/bin/tesseract",
            "OCR_LANGUAGE": "eng",
            "MAX_IMAGE_SIZE": "2048",
            "OCR_DPI": "150",
            "OCR_CACHE_TTL": "3600",
            "MAX_FILE_SIZE_MB": "5",
        }

        with patch.dict(os.environ, custom_env, clear=False):
            from importlib import reload
            import app.config
            reload(app.config)
            from app.config import Settings

            settings = Settings()

            assert settings.tesseract_cmd == "/opt/homebrew/bin/tesseract"
            assert settings.ocr_language == "eng"
            assert settings.max_image_size == 2048
            assert settings.ocr_dpi == 150
            assert settings.ocr_cache_ttl == 3600
            assert settings.max_file_size_mb == 5

    def test_max_file_size_mb_is_integer(self):
        """Test max_file_size_mb is accessible as an integer."""
        from app.config import Settings

        settings = Settings(
            database_url="postgresql+asyncpg://test:test@localhost:5432/test"
        )

        assert isinstance(settings.max_file_size_mb, int)
        assert settings.max_file_size_mb > 0

    def test_ocr_dpi_is_integer(self):
        """Test ocr_dpi is accessible as an integer."""
        from app.config import Settings

        settings = Settings(
            database_url="postgresql+asyncpg://test:test@localhost:5432/test"
        )

        assert isinstance(settings.ocr_dpi, int)
        assert settings.ocr_dpi > 0

    def test_max_image_size_is_integer(self):
        """Test max_image_size is accessible as an integer."""
        from app.config import Settings

        settings = Settings(
            database_url="postgresql+asyncpg://test:test@localhost:5432/test"
        )

        assert isinstance(settings.max_image_size, int)
        assert settings.max_image_size > 0

    def test_ocr_cache_ttl_is_integer(self):
        """Test ocr_cache_ttl is accessible as an integer."""
        from app.config import Settings

        settings = Settings(
            database_url="postgresql+asyncpg://test:test@localhost:5432/test"
        )

        assert isinstance(settings.ocr_cache_ttl, int)
        assert settings.ocr_cache_ttl > 0
