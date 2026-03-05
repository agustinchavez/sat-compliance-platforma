"""
Tests for chatbot configuration settings (Component 11).
"""

import pytest
import os
from unittest.mock import patch


class TestChatbotConfig:
    """Tests for LLM and chatbot configuration."""

    def test_ollama_default_settings(self):
        """Test Ollama settings have correct defaults."""
        # Import fresh to get defaults
        with patch.dict(os.environ, {}, clear=False):
            from app.config import Settings
            settings = Settings(
                database_url="postgresql+asyncpg://test:test@localhost/test"
            )

            assert settings.ollama_base_url == "http://localhost:11434"
            assert settings.ollama_model == "llama3.1"
            assert settings.ollama_timeout_seconds == 60

    def test_openai_defaults_to_none(self):
        """Test OpenAI API key defaults to None (not required)."""
        with patch.dict(os.environ, {}, clear=False):
            from app.config import Settings
            settings = Settings(
                database_url="postgresql+asyncpg://test:test@localhost/test"
            )

            assert settings.openai_api_key is None
            assert settings.openai_model == "gpt-4o-mini"

    def test_llm_temperature_default(self):
        """Test LLM temperature defaults to 0.3 (factual responses)."""
        with patch.dict(os.environ, {}, clear=False):
            from app.config import Settings
            settings = Settings(
                database_url="postgresql+asyncpg://test:test@localhost/test"
            )

            assert settings.llm_temperature == 0.3
            assert settings.llm_max_tokens == 1024

    def test_rag_defaults(self):
        """Test RAG configuration defaults."""
        with patch.dict(os.environ, {}, clear=False):
            from app.config import Settings
            settings = Settings(
                database_url="postgresql+asyncpg://test:test@localhost/test"
            )

            assert settings.rag_top_k == 5
            assert settings.rag_similarity_threshold == 0.4
            assert settings.knowledge_base_dir == "app/knowledge"

    def test_conversation_defaults(self):
        """Test conversation configuration defaults."""
        with patch.dict(os.environ, {}, clear=False):
            from app.config import Settings
            settings = Settings(
                database_url="postgresql+asyncpg://test:test@localhost/test"
            )

            assert settings.max_conversation_history == 20
            assert settings.conversation_summary_threshold == 15
            assert settings.conversation_ttl_days == 30

    def test_internal_api_key_default(self):
        """Test internal API key has placeholder default."""
        with patch.dict(os.environ, {}, clear=False):
            from app.config import Settings
            settings = Settings(
                database_url="postgresql+asyncpg://test:test@localhost/test"
            )

            assert settings.internal_api_key == "change-me-in-production"
            assert settings.allow_jwt_auth is False

    def test_ollama_base_url_configurable_via_env(self):
        """Test Ollama base URL can be overridden via environment variable."""
        with patch.dict(os.environ, {"OLLAMA_BASE_URL": "http://ollama.local:11434"}):
            from app.config import Settings
            settings = Settings(
                database_url="postgresql+asyncpg://test:test@localhost/test"
            )

            assert settings.ollama_base_url == "http://ollama.local:11434"

    def test_openai_api_key_configurable_via_env(self):
        """Test OpenAI API key can be set via environment variable."""
        with patch.dict(os.environ, {"OPENAI_API_KEY": "sk-test-key-123"}):
            from app.config import Settings
            settings = Settings(
                database_url="postgresql+asyncpg://test:test@localhost/test"
            )

            assert settings.openai_api_key == "sk-test-key-123"

    def test_internal_api_key_configurable_via_env(self):
        """Test internal API key can be set via environment variable."""
        with patch.dict(os.environ, {"INTERNAL_API_KEY": "super-secret-key"}):
            from app.config import Settings
            settings = Settings(
                database_url="postgresql+asyncpg://test:test@localhost/test"
            )

            assert settings.internal_api_key == "super-secret-key"

    def test_allow_jwt_auth_configurable_via_env(self):
        """Test allow_jwt_auth can be enabled via environment variable."""
        with patch.dict(os.environ, {"ALLOW_JWT_AUTH": "true"}):
            from app.config import Settings
            settings = Settings(
                database_url="postgresql+asyncpg://test:test@localhost/test"
            )

            assert settings.allow_jwt_auth is True

    def test_llm_settings_ranges(self):
        """Test LLM settings are within reasonable ranges."""
        with patch.dict(os.environ, {}, clear=False):
            from app.config import Settings
            settings = Settings(
                database_url="postgresql+asyncpg://test:test@localhost/test"
            )

            # Temperature should be 0-1 for factual responses
            assert 0.0 <= settings.llm_temperature <= 1.0

            # Max tokens should be reasonable
            assert 100 <= settings.llm_max_tokens <= 8192

            # RAG threshold should be 0-1
            assert 0.0 <= settings.rag_similarity_threshold <= 1.0

    def test_get_settings_function(self):
        """Test get_settings returns singleton instance."""
        from app.config import get_settings, settings

        result = get_settings()
        assert result is settings
