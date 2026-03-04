import hashlib
import json
import logging
from typing import Optional

from sqlalchemy import text, bindparam
from sqlalchemy.ext.asyncio import AsyncSession
import redis.asyncio as redis

from app.config import settings
from app.models.sat_code import SATCodeResponse
from app.services.embedding import EmbeddingService

logger = logging.getLogger(__name__)


class VectorSearchService:
    """
    Performs vector similarity search over SAT codes using pgvector.
    Supports pure semantic search, full-text fallback, and hybrid mode.
    """

    def __init__(self, db: AsyncSession, embedding_service: EmbeddingService):
        self.db = db
        self.embedding_service = embedding_service
        self._redis_client: Optional[redis.Redis] = None
        self._redis_available: bool = False

    async def _get_redis(self) -> Optional[redis.Redis]:
        """Get Redis client, initialize if needed."""
        if self._redis_client is None:
            try:
                self._redis_client = redis.from_url(
                    settings.redis_url,
                    encoding="utf-8",
                    decode_responses=True,
                )
                await self._redis_client.ping()
                self._redis_available = True
            except Exception as e:
                logger.warning(f"Redis unavailable for query cache: {e}")
                self._redis_available = False
        return self._redis_client if self._redis_available else None

    def _get_cache_key(self, prefix: str, *args) -> str:
        """Generate cache key."""
        key_data = ":".join(str(a) for a in args)
        key_hash = hashlib.sha256(key_data.encode()).hexdigest()[:16]
        return f"{prefix}:{key_hash}"

    async def similarity_search(
        self,
        embedding: list[float],
        top_k: int = 10,
        threshold: float = 0.3,
    ) -> list[SATCodeResponse]:
        """
        Find SAT codes most similar to the given embedding using cosine similarity.
        Returns list of SATCodeResponse sorted by similarity_score DESC.
        """
        # Convert embedding to string format for pgvector
        embedding_str = "[" + ",".join(str(x) for x in embedding) + "]"

        # Use CAST instead of :: to avoid conflict with SQLAlchemy's :param syntax
        query = text("""
            SELECT code, name, description, division,
                   1 - (embedding <=> CAST(:query_embedding AS vector)) AS similarity_score
            FROM sat_product_codes
            WHERE embedding IS NOT NULL
              AND 1 - (embedding <=> CAST(:query_embedding AS vector)) >= :threshold
            ORDER BY embedding <=> CAST(:query_embedding AS vector)
            LIMIT :top_k
        """)

        result = await self.db.execute(
            query,
            {"query_embedding": embedding_str, "threshold": threshold, "top_k": top_k}
        )

        rows = result.fetchall()
        return [
            SATCodeResponse(
                code=row.code,
                name=row.name,
                description=row.description,
                division=row.division,
                similarity_score=float(row.similarity_score) if row.similarity_score else None,
            )
            for row in rows
        ]

    async def search_with_filters(
        self,
        embedding: list[float],
        filters: dict,
        top_k: int = 10,
        threshold: float = 0.3,
    ) -> list[SATCodeResponse]:
        """
        Similarity search with optional filters.
        Supported filters:
          - division: str - filter by SAT division (2-char code)
        """
        embedding_str = "[" + ",".join(str(x) for x in embedding) + "]"

        # Build query with optional division filter
        division_clause = ""
        params = {
            "query_embedding": embedding_str,
            "threshold": threshold,
            "top_k": top_k,
        }

        if filters.get("division"):
            division_clause = "AND division = :division"
            params["division"] = filters["division"]

        query = text(f"""
            SELECT code, name, description, division,
                   1 - (embedding <=> CAST(:query_embedding AS vector)) AS similarity_score
            FROM sat_product_codes
            WHERE embedding IS NOT NULL
              AND 1 - (embedding <=> CAST(:query_embedding AS vector)) >= :threshold
              {division_clause}
            ORDER BY embedding <=> CAST(:query_embedding AS vector)
            LIMIT :top_k
        """)

        result = await self.db.execute(query, params)
        rows = result.fetchall()

        return [
            SATCodeResponse(
                code=row.code,
                name=row.name,
                description=row.description,
                division=row.division,
                similarity_score=float(row.similarity_score) if row.similarity_score else None,
            )
            for row in rows
        ]

    async def fulltext_fallback(
        self, query: str, top_k: int = 10
    ) -> list[SATCodeResponse]:
        """
        PostgreSQL full-text search fallback for when embeddings are unavailable
        or similarity search returns zero results.

        Uses existing search_vector GIN index on sat_product_codes.
        Returns results with similarity_score = None.
        """
        # Convert query to tsquery format
        # Split on spaces and join with & for AND search
        search_terms = query.strip().split()
        if not search_terms:
            return []

        # Create tsquery - join terms with OR for better recall
        tsquery = " | ".join(search_terms)

        sql = text("""
            SELECT code, name, description, division,
                   ts_rank(search_vector, plainto_tsquery('spanish', :query)) AS rank
            FROM sat_product_codes
            WHERE search_vector @@ plainto_tsquery('spanish', :query)
            ORDER BY rank DESC
            LIMIT :top_k
        """)

        result = await self.db.execute(sql, {"query": query, "top_k": top_k})
        rows = result.fetchall()

        return [
            SATCodeResponse(
                code=row.code,
                name=row.name,
                description=row.description,
                division=row.division,
                similarity_score=None,  # No similarity score for full-text
            )
            for row in rows
        ]

    async def get_similar_codes(
        self, code: str, top_k: int = 5
    ) -> list[SATCodeResponse]:
        """
        Find SAT codes similar to a known code (by its stored embedding).
        Useful for "similar products" suggestions.
        """
        # Check cache first
        redis_client = await self._get_redis()
        cache_key = f"sat_similar:{code}:{top_k}"

        if redis_client:
            try:
                cached = await redis_client.get(cache_key)
                if cached:
                    data = json.loads(cached)
                    return [SATCodeResponse(**item) for item in data]
            except Exception as e:
                logger.warning(f"Redis cache read error: {e}")

        # Get the embedding for the given code
        query = text("""
            SELECT embedding
            FROM sat_product_codes
            WHERE code = :code AND embedding IS NOT NULL
        """)

        result = await self.db.execute(query, {"code": code})
        row = result.fetchone()

        if not row or not row.embedding:
            return []

        # The embedding from pgvector might come as a string representation
        raw_embedding = row.embedding
        if isinstance(raw_embedding, str):
            # Parse the string format: "[0.1,0.2,0.3,...]"
            embedding_str = raw_embedding
        else:
            # It's already a list/array
            embedding_str = "[" + ",".join(str(x) for x in raw_embedding) + "]"

        similar_query = text("""
            SELECT code, name, description, division,
                   1 - (embedding <=> CAST(:query_embedding AS vector)) AS similarity_score
            FROM sat_product_codes
            WHERE embedding IS NOT NULL
              AND code != :original_code
            ORDER BY embedding <=> CAST(:query_embedding AS vector)
            LIMIT :top_k
        """)

        result = await self.db.execute(
            similar_query,
            {"query_embedding": embedding_str, "original_code": code, "top_k": top_k}
        )

        rows = result.fetchall()
        results = [
            SATCodeResponse(
                code=row.code,
                name=row.name,
                description=row.description,
                division=row.division,
                similarity_score=float(row.similarity_score) if row.similarity_score else None,
            )
            for row in rows
        ]

        # Cache results
        if redis_client:
            try:
                await redis_client.setex(
                    cache_key,
                    3600,  # 1 hour TTL
                    json.dumps([r.model_dump() for r in results])
                )
            except Exception as e:
                logger.warning(f"Redis cache write error: {e}")

        return results

    async def hybrid_search(
        self,
        query: str,
        embedding: list[float],
        top_k: int = 10,
        threshold: float = 0.3,
    ) -> tuple[list[SATCodeResponse], str]:
        """
        Combines semantic and full-text search results.
        Strategy:
          1. Run similarity_search → semantic results
          2. If semantic results < top_k / 2, also run fulltext_fallback
          3. Merge and deduplicate, semantic results ranked first
          4. Return results + search_type ("semantic" | "fulltext" | "hybrid")
        """
        # Check query cache first
        redis_client = await self._get_redis()
        cache_key = self._get_cache_key("sat_search", query, top_k, threshold)

        if redis_client:
            try:
                cached = await redis_client.get(cache_key)
                if cached:
                    data = json.loads(cached)
                    results = [SATCodeResponse(**item) for item in data["results"]]
                    return results, data["search_type"]
            except Exception as e:
                logger.warning(f"Redis cache read error: {e}")

        # Run semantic search
        semantic_results = await self.similarity_search(embedding, top_k, threshold)

        search_type = "semantic"
        final_results = semantic_results

        # If semantic results are insufficient, supplement with full-text
        if len(semantic_results) < top_k // 2:
            fulltext_results = await self.fulltext_fallback(query, top_k)

            if len(semantic_results) == 0 and len(fulltext_results) > 0:
                search_type = "fulltext"
                final_results = fulltext_results
            elif len(fulltext_results) > 0:
                search_type = "hybrid"
                # Merge and deduplicate
                seen_codes = {r.code for r in semantic_results}
                for ft_result in fulltext_results:
                    if ft_result.code not in seen_codes and len(final_results) < top_k:
                        final_results.append(ft_result)
                        seen_codes.add(ft_result.code)

        # Cache results
        if redis_client:
            try:
                await redis_client.setex(
                    cache_key,
                    settings.query_cache_ttl,
                    json.dumps({
                        "results": [r.model_dump() for r in final_results],
                        "search_type": search_type,
                    })
                )
            except Exception as e:
                logger.warning(f"Redis cache write error: {e}")

        return final_results, search_type

    async def get_code_by_id(self, code: str) -> Optional[SATCodeResponse]:
        """Get a single SAT code by its code."""
        query = text("""
            SELECT code, name, description, division
            FROM sat_product_codes
            WHERE code = :code
        """)

        result = await self.db.execute(query, {"code": code})
        row = result.fetchone()

        if not row:
            return None

        return SATCodeResponse(
            code=row.code,
            name=row.name,
            description=row.description,
            division=row.division,
            similarity_score=None,
        )

    async def get_stats(self) -> dict:
        """Get statistics about the SAT codes in the database."""
        total_query = text("SELECT COUNT(*) FROM sat_product_codes")
        embeddings_query = text(
            "SELECT COUNT(*) FROM sat_product_codes WHERE embedding IS NOT NULL"
        )

        total_result = await self.db.execute(total_query)
        total = total_result.scalar() or 0

        embeddings_result = await self.db.execute(embeddings_query)
        with_embeddings = embeddings_result.scalar() or 0

        return {
            "total_sat_codes": total,
            "codes_with_embeddings": with_embeddings,
        }
