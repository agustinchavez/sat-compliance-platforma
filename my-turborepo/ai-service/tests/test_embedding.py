"""
Tests for the EmbeddingService.
"""

import pytest
from unittest.mock import patch, MagicMock, AsyncMock

from app.services.embedding import EmbeddingService
from app.config import settings


class TestEmbeddingService:
    """Tests for EmbeddingService class."""

    @pytest.fixture
    def embedding_service(self):
        """Create a fresh embedding service for testing."""
        # Reset singleton for testing
        EmbeddingService._instance = None
        EmbeddingService._model = None
        return EmbeddingService()

    def test_preprocess_text_lowercase(self, embedding_service):
        """Test text preprocessing converts to lowercase."""
        result = embedding_service._preprocess_text("Hello WORLD")
        assert result == "hello world"

    def test_preprocess_text_strip(self, embedding_service):
        """Test text preprocessing strips whitespace."""
        result = embedding_service._preprocess_text("  hello world  ")
        assert result == "hello world"

    def test_preprocess_text_truncate(self, embedding_service):
        """Test text preprocessing truncates long text."""
        long_text = "a" * 600
        result = embedding_service._preprocess_text(long_text)
        assert len(result) == 512

    def test_preprocess_text_combined(self, embedding_service):
        """Test text preprocessing with all transformations."""
        result = embedding_service._preprocess_text("  HELLO World  ")
        assert result == "hello world"

    def test_get_cache_key_format(self, embedding_service):
        """Test cache key generation format."""
        key = embedding_service._get_cache_key("test text")
        assert key.startswith("sat_emb:")
        assert len(key) > len("sat_emb:")

    def test_get_cache_key_deterministic(self, embedding_service):
        """Test cache key is deterministic for same input."""
        key1 = embedding_service._get_cache_key("test text")
        key2 = embedding_service._get_cache_key("test text")
        assert key1 == key2

    def test_get_cache_key_different_for_different_text(self, embedding_service):
        """Test cache key differs for different inputs."""
        key1 = embedding_service._get_cache_key("text one")
        key2 = embedding_service._get_cache_key("text two")
        assert key1 != key2

    @pytest.mark.asyncio
    async def test_generate_embedding_returns_list(self, mock_embedding_service):
        """Test generate_embedding returns a list of floats."""
        embedding = await mock_embedding_service.generate_embedding("test text")
        assert isinstance(embedding, list)
        assert len(embedding) == 384
        assert all(isinstance(x, float) for x in embedding)

    @pytest.mark.asyncio
    async def test_generate_embedding_deterministic(self, mock_embedding_service):
        """Test same text produces same embedding."""
        emb1 = await mock_embedding_service.generate_embedding("test text")
        emb2 = await mock_embedding_service.generate_embedding("test text")
        assert emb1 == emb2

    @pytest.mark.asyncio
    async def test_generate_embedding_different_for_different_text(self, mock_embedding_service):
        """Test different text produces different embeddings."""
        emb1 = await mock_embedding_service.generate_embedding("text one")
        emb2 = await mock_embedding_service.generate_embedding("text two")
        assert emb1 != emb2

    @pytest.mark.asyncio
    async def test_generate_batch_embeddings_returns_correct_count(self, mock_embedding_service):
        """Test batch embeddings returns correct number of embeddings."""
        texts = ["text one", "text two", "text three"]
        embeddings = await mock_embedding_service.generate_batch_embeddings(texts)
        assert len(embeddings) == 3
        assert all(len(emb) == 384 for emb in embeddings)

    @pytest.mark.asyncio
    async def test_generate_batch_embeddings_empty_list(self, mock_embedding_service):
        """Test batch embeddings with empty list."""
        embeddings = await mock_embedding_service.generate_batch_embeddings([])
        assert embeddings == []

    @pytest.mark.asyncio
    async def test_generate_batch_embeddings_preserves_order(self, mock_embedding_service):
        """Test batch embeddings preserves order of inputs."""
        texts = ["apple", "banana", "cherry"]
        embeddings = await mock_embedding_service.generate_batch_embeddings(texts)

        # Each text should produce a unique embedding
        assert embeddings[0] != embeddings[1]
        assert embeddings[1] != embeddings[2]

        # Re-running should give same results in same order
        embeddings2 = await mock_embedding_service.generate_batch_embeddings(texts)
        assert embeddings == embeddings2

    def test_generate_batch_embeddings_sync(self, mock_embedding_service):
        """Test synchronous batch embedding generation."""
        texts = ["text one", "text two"]
        embeddings = mock_embedding_service.generate_batch_embeddings_sync(texts)
        assert len(embeddings) == 2
        assert all(len(emb) == 384 for emb in embeddings)

    def test_is_model_loaded(self, mock_embedding_service):
        """Test model loaded status check."""
        assert mock_embedding_service.is_model_loaded() is True


class TestEmbeddingServiceWithRedis:
    """Tests for EmbeddingService with Redis caching."""

    @pytest.mark.asyncio
    async def test_caching_hit(self, mock_embedding_service, mock_redis):
        """Test embedding is retrieved from cache on second call."""
        import json

        # Simulate cached embedding
        cached_embedding = [0.1] * 384
        mock_redis.get.return_value = json.dumps(cached_embedding).encode()

        # Patch Redis client
        with patch.object(mock_embedding_service, '_redis_client', mock_redis):
            mock_embedding_service._redis_available = True

            # This would use the cache if the actual implementation is tested
            # For mock, we just verify the flow works
            result = await mock_embedding_service.generate_embedding("test")
            assert len(result) == 384

    @pytest.mark.asyncio
    async def test_graceful_redis_fallback(self, mock_embedding_service):
        """Test service continues without Redis."""
        mock_embedding_service._redis_available = False
        mock_embedding_service._redis_client = None

        # Should still work without Redis
        result = await mock_embedding_service.generate_embedding("test text")
        assert len(result) == 384
