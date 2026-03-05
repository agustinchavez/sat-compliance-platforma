"""
Tests for RAG Service (Component 11).
"""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from app.config import Settings
from app.models.conversation import RAGSource
from app.services.rag import RAGService


@pytest.fixture
def settings():
    """Create test settings."""
    return Settings(
        supabase_url="http://localhost:54321",
        supabase_service_key="test-key",
        rag_top_k=5,
        rag_similarity_threshold=0.4,
    )


@pytest.fixture
def mock_embedding_service():
    """Create mock embedding service."""
    service = MagicMock()
    service.embed_text = AsyncMock(return_value=[0.1] * 384)
    return service


@pytest.fixture
def rag_service(settings, mock_embedding_service):
    """Create RAG service with mocked dependencies."""
    return RAGService(settings, mock_embedding_service)


class TestRetrieveRelevantContext:
    """Tests for retrieve_relevant_context method."""

    @pytest.mark.asyncio
    async def test_returns_formatted_context_and_sources(self, rag_service):
        """Test returns properly formatted context and source list."""
        mock_results = [
            {
                "doc_id": "tax_guide_iva_0",
                "source_file": "tax_guide.md",
                "section_title": "Tasas de IVA",
                "content": "El IVA tiene tasas de 16%, 8%, y 0%.",
                "metadata": {},
                "similarity": 0.85,
            },
            {
                "doc_id": "tax_guide_iva_1",
                "source_file": "tax_guide.md",
                "section_title": "Cálculo del IVA",
                "content": "IVA a pagar = IVA cobrado - IVA acreditable.",
                "metadata": {},
                "similarity": 0.72,
            },
        ]

        with patch.object(
            rag_service,
            "_search_knowledge_base",
            new_callable=AsyncMock,
            return_value=mock_results
        ):
            context, sources = await rag_service.retrieve_relevant_context(
                "¿Cómo calculo el IVA?"
            )

            # Check context is formatted
            assert "Tasas de IVA" in context
            assert "16%" in context
            assert "Cálculo del IVA" in context
            assert "---" in context  # Separator between sections

            # Check sources
            assert len(sources) == 2
            assert sources[0].doc_id == "tax_guide_iva_0"
            assert sources[0].section_title == "Tasas de IVA"
            assert sources[0].similarity_score == 0.85

    @pytest.mark.asyncio
    async def test_returns_empty_when_no_results(self, rag_service):
        """Test returns empty strings when no relevant documents found."""
        with patch.object(
            rag_service,
            "_search_knowledge_base",
            new_callable=AsyncMock,
            return_value=[]
        ):
            context, sources = await rag_service.retrieve_relevant_context(
                "¿Cuál es el clima hoy?"  # Unrelated query
            )

            assert context == ""
            assert sources == []

    @pytest.mark.asyncio
    async def test_uses_settings_defaults(self, rag_service, mock_embedding_service):
        """Test uses top_k and threshold from settings by default."""
        with patch.object(
            rag_service,
            "_search_knowledge_base",
            new_callable=AsyncMock,
            return_value=[]
        ) as mock_search:
            await rag_service.retrieve_relevant_context("test query")

            mock_search.assert_called_once()
            call_kwargs = mock_search.call_args[1]
            assert call_kwargs["top_k"] == 5
            assert call_kwargs["similarity_threshold"] == 0.4

    @pytest.mark.asyncio
    async def test_accepts_custom_top_k_and_threshold(self, rag_service):
        """Test accepts custom top_k and similarity_threshold."""
        with patch.object(
            rag_service,
            "_search_knowledge_base",
            new_callable=AsyncMock,
            return_value=[]
        ) as mock_search:
            await rag_service.retrieve_relevant_context(
                "test query",
                top_k=3,
                similarity_threshold=0.6,
            )

            call_kwargs = mock_search.call_args[1]
            assert call_kwargs["top_k"] == 3
            assert call_kwargs["similarity_threshold"] == 0.6

    @pytest.mark.asyncio
    async def test_embeds_query_before_searching(self, rag_service, mock_embedding_service):
        """Test embeds the query using embedding service."""
        with patch.object(
            rag_service,
            "_search_knowledge_base",
            new_callable=AsyncMock,
            return_value=[]
        ):
            await rag_service.retrieve_relevant_context("¿Qué es el ISR?")

            mock_embedding_service.embed_text.assert_called_once_with("¿Qué es el ISR?")

    @pytest.mark.asyncio
    async def test_handles_embedding_errors_gracefully(self, rag_service, mock_embedding_service):
        """Test returns empty on embedding errors."""
        mock_embedding_service.embed_text.side_effect = Exception("Embedding failed")

        context, sources = await rag_service.retrieve_relevant_context("test")

        assert context == ""
        assert sources == []


class TestSearchKnowledgeBase:
    """Tests for _search_knowledge_base method."""

    @pytest.mark.asyncio
    async def test_calls_supabase_rpc_with_params(self, rag_service):
        """Test calls Supabase RPC function with correct parameters."""
        mock_response = MagicMock()
        mock_response.data = []

        with patch("supabase.create_client") as mock_create_client:
            mock_client = MagicMock()
            mock_client.rpc.return_value.execute.return_value = mock_response
            mock_create_client.return_value = mock_client

            embedding = [0.1] * 384
            await rag_service._search_knowledge_base(
                embedding=embedding,
                top_k=5,
                similarity_threshold=0.4,
            )

            mock_client.rpc.assert_called_once_with(
                "search_knowledge_base",
                {
                    "query_embedding": embedding,
                    "match_threshold": 0.4,
                    "match_count": 5,
                }
            )


class TestGetDocumentById:
    """Tests for get_document_by_id method."""

    @pytest.mark.asyncio
    async def test_returns_document_when_found(self, rag_service):
        """Test returns document when it exists."""
        mock_doc = {
            "doc_id": "tax_guide_iva_0",
            "source_file": "tax_guide.md",
            "section_title": "Tasas de IVA",
            "content": "El IVA tiene tasas de 16%.",
            "metadata": {"topics": ["IVA"]},
        }

        mock_response = MagicMock()
        mock_response.data = [mock_doc]

        with patch("supabase.create_client") as mock_create_client:
            mock_client = MagicMock()
            mock_client.table.return_value.select.return_value.eq.return_value.execute.return_value = mock_response
            mock_create_client.return_value = mock_client

            result = await rag_service.get_document_by_id("tax_guide_iva_0")

            assert result == mock_doc

    @pytest.mark.asyncio
    async def test_returns_none_when_not_found(self, rag_service):
        """Test returns None when document doesn't exist."""
        mock_response = MagicMock()
        mock_response.data = []

        with patch("supabase.create_client") as mock_create_client:
            mock_client = MagicMock()
            mock_client.table.return_value.select.return_value.eq.return_value.execute.return_value = mock_response
            mock_create_client.return_value = mock_client

            result = await rag_service.get_document_by_id("nonexistent")

            assert result is None


class TestFormatSourcesForResponse:
    """Tests for format_sources_for_response method."""

    def test_formats_sources_with_confidence_levels(self, rag_service):
        """Test formats sources with appropriate confidence labels."""
        sources = [
            RAGSource(doc_id="doc1", section_title="IVA Overview", similarity_score=0.85),
            RAGSource(doc_id="doc2", section_title="ISR Rates", similarity_score=0.55),
        ]

        result = rag_service.format_sources_for_response(sources)

        assert "Fuentes consultadas" in result
        assert "1. IVA Overview (confianza: alta)" in result
        assert "2. ISR Rates (confianza: media)" in result

    def test_returns_empty_string_for_no_sources(self, rag_service):
        """Test returns empty string when no sources."""
        result = rag_service.format_sources_for_response([])
        assert result == ""


class TestCheckKnowledgeBaseHealth:
    """Tests for check_knowledge_base_health method."""

    @pytest.mark.asyncio
    async def test_returns_healthy_with_documents(self, rag_service):
        """Test returns healthy status when documents exist."""
        mock_count_response = MagicMock()
        mock_count_response.count = 50

        mock_latest_response = MagicMock()
        mock_latest_response.data = [{"updated_at": "2024-03-15T10:00:00Z"}]

        with patch("supabase.create_client") as mock_create_client:
            mock_client = MagicMock()

            # Setup count query
            mock_client.table.return_value.select.return_value.execute.return_value = mock_count_response

            # Setup latest query
            mock_client.table.return_value.select.return_value.order.return_value.limit.return_value.execute.return_value = mock_latest_response

            mock_create_client.return_value = mock_client

            result = await rag_service.check_knowledge_base_health()

            assert result["status"] == "healthy"
            assert result["document_count"] == 50
            assert result["last_updated"] == "2024-03-15T10:00:00Z"

    @pytest.mark.asyncio
    async def test_returns_empty_with_no_documents(self, rag_service):
        """Test returns empty status when no documents."""
        mock_count_response = MagicMock()
        mock_count_response.count = 0

        mock_latest_response = MagicMock()
        mock_latest_response.data = []

        with patch("supabase.create_client") as mock_create_client:
            mock_client = MagicMock()
            mock_client.table.return_value.select.return_value.execute.return_value = mock_count_response
            mock_client.table.return_value.select.return_value.order.return_value.limit.return_value.execute.return_value = mock_latest_response
            mock_create_client.return_value = mock_client

            result = await rag_service.check_knowledge_base_health()

            assert result["status"] == "empty"
            assert result["document_count"] == 0

    @pytest.mark.asyncio
    async def test_returns_error_on_exception(self, rag_service):
        """Test returns error status on exception."""
        with patch("supabase.create_client") as mock_create_client:
            mock_create_client.side_effect = Exception("Connection failed")

            result = await rag_service.check_knowledge_base_health()

            assert result["status"] == "error"
            assert "Connection failed" in result["error"]


class TestIntegration:
    """Integration tests for RAG service."""

    @pytest.mark.asyncio
    async def test_full_retrieval_flow(self, rag_service, mock_embedding_service):
        """Test complete retrieval flow from query to formatted context."""
        mock_results = [
            {
                "doc_id": "cfdi_guide_types_0",
                "source_file": "cfdi_guide.md",
                "section_title": "Tipos de CFDI",
                "content": "Los tipos de CFDI incluyen: Ingreso, Egreso, Traslado, Nómina, Pago.",
                "metadata": {"topics": ["CFDI"]},
                "similarity": 0.9,
            },
        ]

        with patch.object(
            rag_service,
            "_search_knowledge_base",
            new_callable=AsyncMock,
            return_value=mock_results
        ):
            context, sources = await rag_service.retrieve_relevant_context(
                "¿Cuáles son los tipos de CFDI?"
            )

            # Check embedding was called
            mock_embedding_service.embed_text.assert_called_once()

            # Check context includes header
            assert "### Tipos de CFDI" in context
            assert "Ingreso" in context

            # Check sources
            assert len(sources) == 1
            assert sources[0].similarity_score == 0.9

            # Check formatted sources
            formatted = rag_service.format_sources_for_response(sources)
            assert "Tipos de CFDI" in formatted
            assert "alta" in formatted
