"""
Tests for the VectorSearchService.
"""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from sqlalchemy.engine import Result

from app.services.vector_search import VectorSearchService
from app.models.sat_code import SATCodeResponse


class TestVectorSearchService:
    """Tests for VectorSearchService class."""

    @pytest.fixture
    def vector_search(self, mock_db_session, mock_embedding_service):
        """Create VectorSearchService instance."""
        return VectorSearchService(mock_db_session, mock_embedding_service)

    @pytest.fixture
    def sample_db_row(self):
        """Create a sample database row."""
        row = MagicMock()
        row.code = "43211503"
        row.name = "Computadoras portátiles"
        row.description = "Laptops y notebooks"
        row.division = "43"
        row.similarity_score = 0.85
        return row

    @pytest.mark.asyncio
    async def test_similarity_search_returns_results(
        self, vector_search, sample_db_row, sample_embeddings
    ):
        """Test similarity search returns correctly typed results."""
        # Mock database result
        mock_result = MagicMock(spec=Result)
        mock_result.fetchall.return_value = [sample_db_row]
        vector_search.db.execute = AsyncMock(return_value=mock_result)

        results = await vector_search.similarity_search(
            embedding=sample_embeddings[0],
            top_k=5,
            threshold=0.3,
        )

        assert len(results) == 1
        assert isinstance(results[0], SATCodeResponse)
        assert results[0].code == "43211503"
        assert results[0].name == "Computadoras portátiles"
        assert results[0].similarity_score == 0.85

    @pytest.mark.asyncio
    async def test_similarity_search_empty_results(self, vector_search, sample_embeddings):
        """Test similarity search with no matches."""
        mock_result = MagicMock(spec=Result)
        mock_result.fetchall.return_value = []
        vector_search.db.execute = AsyncMock(return_value=mock_result)

        results = await vector_search.similarity_search(
            embedding=sample_embeddings[0],
            top_k=5,
            threshold=0.5,
        )

        assert results == []

    @pytest.mark.asyncio
    async def test_search_with_filters_applies_division(
        self, vector_search, sample_db_row, sample_embeddings
    ):
        """Test search with division filter."""
        mock_result = MagicMock(spec=Result)
        mock_result.fetchall.return_value = [sample_db_row]
        vector_search.db.execute = AsyncMock(return_value=mock_result)

        results = await vector_search.search_with_filters(
            embedding=sample_embeddings[0],
            filters={"division": "43"},
            top_k=5,
            threshold=0.3,
        )

        assert len(results) == 1
        # Verify division filter was included in query
        call_args = vector_search.db.execute.call_args
        assert "division" in call_args[0][1] or "division" in str(call_args)

    @pytest.mark.asyncio
    async def test_fulltext_fallback_returns_results(self, vector_search, sample_db_row):
        """Test fulltext fallback search."""
        # Modify row for fulltext (no similarity_score, has rank)
        sample_db_row.rank = 0.5
        sample_db_row.similarity_score = None

        mock_result = MagicMock(spec=Result)
        mock_result.fetchall.return_value = [sample_db_row]
        vector_search.db.execute = AsyncMock(return_value=mock_result)

        results = await vector_search.fulltext_fallback(
            query="computadora laptop",
            top_k=5,
        )

        assert len(results) == 1
        assert results[0].similarity_score is None  # No similarity for fulltext

    @pytest.mark.asyncio
    async def test_fulltext_fallback_empty_query(self, vector_search):
        """Test fulltext fallback with empty query."""
        results = await vector_search.fulltext_fallback(
            query="",
            top_k=5,
        )
        assert results == []

    @pytest.mark.asyncio
    async def test_get_similar_codes_returns_results(
        self, vector_search, sample_db_row, sample_embeddings
    ):
        """Test getting similar codes for a known code."""
        # First call returns the embedding for the original code
        original_row = MagicMock()
        original_row.embedding = sample_embeddings[0]

        mock_result1 = MagicMock(spec=Result)
        mock_result1.fetchone.return_value = original_row

        # Second call returns similar codes
        mock_result2 = MagicMock(spec=Result)
        mock_result2.fetchall.return_value = [sample_db_row]

        vector_search.db.execute = AsyncMock(
            side_effect=[mock_result1, mock_result2]
        )

        results = await vector_search.get_similar_codes(
            code="43211503",
            top_k=5,
        )

        assert len(results) == 1
        assert results[0].code == "43211503"

    @pytest.mark.asyncio
    async def test_get_similar_codes_unknown_code(self, vector_search):
        """Test getting similar codes for unknown code returns empty."""
        mock_result = MagicMock(spec=Result)
        mock_result.fetchone.return_value = None
        vector_search.db.execute = AsyncMock(return_value=mock_result)

        results = await vector_search.get_similar_codes(
            code="UNKNOWN",
            top_k=5,
        )

        assert results == []

    @pytest.mark.asyncio
    async def test_hybrid_search_semantic_only(
        self, vector_search, sample_db_row, sample_embeddings
    ):
        """Test hybrid search with sufficient semantic results."""
        # Return enough semantic results
        rows = [sample_db_row for _ in range(5)]
        mock_result = MagicMock(spec=Result)
        mock_result.fetchall.return_value = rows
        vector_search.db.execute = AsyncMock(return_value=mock_result)

        results, search_type = await vector_search.hybrid_search(
            query="computadora laptop",
            embedding=sample_embeddings[0],
            top_k=10,
            threshold=0.3,
        )

        assert len(results) == 5
        assert search_type == "semantic"

    @pytest.mark.asyncio
    async def test_hybrid_search_with_fallback(
        self, vector_search, sample_db_row, sample_embeddings
    ):
        """Test hybrid search falls back to fulltext when needed."""
        # First call (semantic) returns few results
        semantic_row = MagicMock()
        semantic_row.code = "43211503"
        semantic_row.name = "Computadoras portátiles"
        semantic_row.description = None
        semantic_row.division = "43"
        semantic_row.similarity_score = 0.9

        # Second call (fulltext) returns additional results
        fulltext_row = MagicMock()
        fulltext_row.code = "44121600"
        fulltext_row.name = "Suministros de oficina"
        fulltext_row.description = None
        fulltext_row.division = "44"
        fulltext_row.rank = 0.5

        mock_result1 = MagicMock(spec=Result)
        mock_result1.fetchall.return_value = [semantic_row]  # Only 1 result

        mock_result2 = MagicMock(spec=Result)
        mock_result2.fetchall.return_value = [fulltext_row]

        vector_search.db.execute = AsyncMock(
            side_effect=[mock_result1, mock_result2]
        )

        results, search_type = await vector_search.hybrid_search(
            query="computadora",
            embedding=sample_embeddings[0],
            top_k=10,
            threshold=0.3,
        )

        assert search_type == "hybrid"
        assert len(results) == 2

    @pytest.mark.asyncio
    async def test_hybrid_search_deduplicates(
        self, vector_search, sample_embeddings
    ):
        """Test hybrid search deduplicates results."""
        # Same code in both semantic and fulltext results
        semantic_row = MagicMock()
        semantic_row.code = "43211503"
        semantic_row.name = "Computadoras portátiles"
        semantic_row.description = None
        semantic_row.division = "43"
        semantic_row.similarity_score = 0.9

        fulltext_row = MagicMock()
        fulltext_row.code = "43211503"  # Same code
        fulltext_row.name = "Computadoras portátiles"
        fulltext_row.description = None
        fulltext_row.division = "43"
        fulltext_row.rank = 0.5

        mock_result1 = MagicMock(spec=Result)
        mock_result1.fetchall.return_value = [semantic_row]

        mock_result2 = MagicMock(spec=Result)
        mock_result2.fetchall.return_value = [fulltext_row]

        vector_search.db.execute = AsyncMock(
            side_effect=[mock_result1, mock_result2]
        )

        results, _ = await vector_search.hybrid_search(
            query="computadora",
            embedding=sample_embeddings[0],
            top_k=10,
            threshold=0.3,
        )

        # Should only have 1 result (deduplicated)
        assert len(results) == 1
        assert results[0].code == "43211503"

    @pytest.mark.asyncio
    async def test_get_code_by_id_found(self, vector_search, sample_db_row):
        """Test getting a code by ID when it exists."""
        mock_result = MagicMock(spec=Result)
        mock_result.fetchone.return_value = sample_db_row
        vector_search.db.execute = AsyncMock(return_value=mock_result)

        result = await vector_search.get_code_by_id("43211503")

        assert result is not None
        assert result.code == "43211503"
        assert result.name == "Computadoras portátiles"

    @pytest.mark.asyncio
    async def test_get_code_by_id_not_found(self, vector_search):
        """Test getting a code by ID when it doesn't exist."""
        mock_result = MagicMock(spec=Result)
        mock_result.fetchone.return_value = None
        vector_search.db.execute = AsyncMock(return_value=mock_result)

        result = await vector_search.get_code_by_id("UNKNOWN")

        assert result is None

    @pytest.mark.asyncio
    async def test_get_stats(self, vector_search):
        """Test getting database statistics."""
        mock_result1 = MagicMock(spec=Result)
        mock_result1.scalar.return_value = 55000

        mock_result2 = MagicMock(spec=Result)
        mock_result2.scalar.return_value = 54000

        vector_search.db.execute = AsyncMock(
            side_effect=[mock_result1, mock_result2]
        )

        stats = await vector_search.get_stats()

        assert stats["total_sat_codes"] == 55000
        assert stats["codes_with_embeddings"] == 54000
