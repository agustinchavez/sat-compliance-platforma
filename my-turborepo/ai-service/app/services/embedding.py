import hashlib
import logging
from typing import Optional
import asyncio

from sentence_transformers import SentenceTransformer
import redis.asyncio as redis
from tqdm import tqdm

from app.config import settings

logger = logging.getLogger(__name__)


class EmbeddingService:
    """
    Singleton service for generating multilingual text embeddings.
    Uses sentence-transformers with a multilingual model supporting
    both Spanish and English queries.
    """

    _instance: Optional["EmbeddingService"] = None
    _model: Optional[SentenceTransformer] = None
    _redis_client: Optional[redis.Redis] = None
    _redis_available: bool = True

    def __init__(self):
        """Private constructor - use get_instance() instead."""
        pass

    @classmethod
    async def get_instance(cls) -> "EmbeddingService":
        """Returns singleton instance, loading model if necessary."""
        if cls._instance is None:
            cls._instance = cls()
            await cls._instance._initialize()
        return cls._instance

    async def _initialize(self):
        """Initialize the model and Redis connection."""
        # Load the embedding model
        logger.info(f"Loading embedding model: {settings.embedding_model}")
        self._model = SentenceTransformer(settings.embedding_model)
        logger.info(f"Model loaded. Embedding dimension: {settings.embedding_dimension}")

        # Initialize Redis connection
        try:
            self._redis_client = redis.from_url(
                settings.redis_url,
                encoding="utf-8",
                decode_responses=False,
            )
            await self._redis_client.ping()
            self._redis_available = True
            logger.info("Redis connection established for embedding cache")
        except Exception as e:
            logger.warning(f"Redis unavailable, caching disabled: {e}")
            self._redis_available = False
            self._redis_client = None

    def get_model(self) -> SentenceTransformer:
        """Returns the loaded SentenceTransformer model."""
        if self._model is None:
            raise RuntimeError("EmbeddingService not initialized. Call get_instance() first.")
        return self._model

    def is_model_loaded(self) -> bool:
        """Check if the model is loaded."""
        return self._model is not None

    def _preprocess_text(self, text: str) -> str:
        """Normalize and clean input text."""
        # Lowercase, strip whitespace, truncate to 512 chars
        text = text.lower().strip()
        if len(text) > 512:
            text = text[:512]
        return text

    def _get_cache_key(self, text: str) -> str:
        """Generate cache key for embedding."""
        text_hash = hashlib.sha256(text.encode()).hexdigest()[:16]
        return f"sat_emb:{text_hash}"

    async def generate_embedding(self, text: str) -> list[float]:
        """
        Generate embedding for a single text string.
        - Normalize and clean input text
        - Return list of floats (length = embedding_dimension)
        - Cache result in Redis with key: f"sat_emb:{hash(text)}"
        """
        # Preprocess text
        processed_text = self._preprocess_text(text)
        cache_key = self._get_cache_key(processed_text)

        # Check cache first
        if self._redis_available and self._redis_client:
            try:
                cached = await self._redis_client.get(cache_key)
                if cached:
                    # Deserialize from bytes
                    import json
                    return json.loads(cached)
            except Exception as e:
                logger.warning(f"Redis cache read error: {e}")

        # Generate embedding
        model = self.get_model()
        # Run in thread pool to avoid blocking
        loop = asyncio.get_event_loop()
        embedding = await loop.run_in_executor(
            None,
            lambda: model.encode(processed_text, convert_to_numpy=True).tolist()
        )

        # Cache result
        if self._redis_available and self._redis_client:
            try:
                import json
                await self._redis_client.setex(
                    cache_key,
                    settings.embedding_cache_ttl,
                    json.dumps(embedding)
                )
            except Exception as e:
                logger.warning(f"Redis cache write error: {e}")

        return embedding

    async def generate_batch_embeddings(
        self, texts: list[str], batch_size: int = 64
    ) -> list[list[float]]:
        """
        Generate embeddings for a list of texts in batches.
        - Process in batches to avoid OOM on large catalogs
        - Show progress for large batches (use tqdm)
        - Return list of embedding vectors
        """
        if not texts:
            return []

        # Preprocess all texts
        processed_texts = [self._preprocess_text(t) for t in texts]

        model = self.get_model()
        all_embeddings = []

        # Process in batches with progress bar
        total_batches = (len(processed_texts) + batch_size - 1) // batch_size

        for i in tqdm(range(0, len(processed_texts), batch_size),
                      total=total_batches,
                      desc="Generating embeddings"):
            batch = processed_texts[i:i + batch_size]

            # Run in thread pool to avoid blocking
            loop = asyncio.get_event_loop()
            batch_embeddings = await loop.run_in_executor(
                None,
                lambda b=batch: model.encode(b, convert_to_numpy=True).tolist()
            )

            all_embeddings.extend(batch_embeddings)

        return all_embeddings

    def generate_batch_embeddings_sync(
        self, texts: list[str], batch_size: int = 64
    ) -> list[list[float]]:
        """
        Synchronous version of generate_batch_embeddings for scripts.
        """
        if not texts:
            return []

        # Preprocess all texts
        processed_texts = [self._preprocess_text(t) for t in texts]

        model = self.get_model()
        all_embeddings = []

        # Process in batches with progress bar
        total_batches = (len(processed_texts) + batch_size - 1) // batch_size

        for i in tqdm(range(0, len(processed_texts), batch_size),
                      total=total_batches,
                      desc="Generating embeddings"):
            batch = processed_texts[i:i + batch_size]
            batch_embeddings = model.encode(batch, convert_to_numpy=True).tolist()
            all_embeddings.extend(batch_embeddings)

        return all_embeddings

    async def close(self):
        """Close Redis connection."""
        if self._redis_client:
            await self._redis_client.close()
