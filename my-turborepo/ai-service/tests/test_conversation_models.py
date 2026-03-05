"""
Tests for conversation models (Component 11).
"""

import pytest
from datetime import datetime
from pydantic import ValidationError

from app.models.conversation import (
    MessageRole,
    ChatMessage,
    ConversationContext,
    ChatRequest,
    RAGSource,
    ChatResponse,
    StreamChunk,
    ConversationSummary,
    ConversationHistory,
)


class TestMessageRole:
    """Tests for MessageRole enum."""

    def test_valid_roles(self):
        """Test MessageRole validates 'user', 'assistant', 'system'."""
        assert MessageRole.USER == "user"
        assert MessageRole.ASSISTANT == "assistant"
        assert MessageRole.SYSTEM == "system"

    def test_role_values(self):
        """Test all role values."""
        roles = [role.value for role in MessageRole]
        assert "user" in roles
        assert "assistant" in roles
        assert "system" in roles
        assert len(roles) == 3


class TestChatMessage:
    """Tests for ChatMessage model."""

    def test_create_user_message(self):
        """Test creating a user message."""
        msg = ChatMessage(role=MessageRole.USER, content="Hello")
        assert msg.role == MessageRole.USER
        assert msg.content == "Hello"

    def test_create_with_metadata(self):
        """Test creating a message with metadata."""
        msg = ChatMessage(
            role=MessageRole.ASSISTANT,
            content="Response",
            metadata={"tokens": 50}
        )
        assert msg.metadata == {"tokens": 50}

    def test_default_metadata_empty(self):
        """Test metadata defaults to empty dict."""
        msg = ChatMessage(role=MessageRole.USER, content="Test")
        assert msg.metadata == {}


class TestConversationContext:
    """Tests for ConversationContext model."""

    def test_all_fields_optional(self):
        """Test ConversationContext allows all None fields."""
        ctx = ConversationContext()
        assert ctx.organization_id is None
        assert ctx.tax_regime is None
        assert ctx.rfc is None
        assert ctx.user_role is None

    def test_with_partial_context(self):
        """Test ConversationContext with partial data."""
        ctx = ConversationContext(
            organization_id="org-123",
            tax_regime="601"
        )
        assert ctx.organization_id == "org-123"
        assert ctx.tax_regime == "601"
        assert ctx.rfc is None

    def test_with_full_context(self):
        """Test ConversationContext with all fields."""
        ctx = ConversationContext(
            organization_id="org-123",
            organization_name="Mi Empresa SA",
            tax_regime="601",
            rfc="MIE123456ABC",
            user_role="owner",
            monthly_revenue_approx=50000.0,
            employee_count_approx=5
        )
        assert ctx.organization_name == "Mi Empresa SA"
        assert ctx.monthly_revenue_approx == 50000.0


class TestChatRequest:
    """Tests for ChatRequest model."""

    def test_valid_request(self):
        """Test valid chat request."""
        req = ChatRequest(message="¿Qué es el IVA?")
        assert req.message == "¿Qué es el IVA?"
        assert req.conversation_id is None
        assert req.stream is False

    def test_rejects_empty_message(self):
        """Test ChatRequest rejects empty messages."""
        with pytest.raises(ValidationError) as exc_info:
            ChatRequest(message="")

        assert "at least 1 character" in str(exc_info.value).lower()

    def test_rejects_whitespace_only_message(self):
        """Test ChatRequest rejects whitespace-only messages."""
        with pytest.raises(ValidationError) as exc_info:
            ChatRequest(message="   ")

        assert "empty" in str(exc_info.value).lower() or "whitespace" in str(exc_info.value).lower()

    def test_rejects_message_over_2000_chars(self):
        """Test ChatRequest rejects messages > 2000 characters."""
        long_message = "a" * 2001
        with pytest.raises(ValidationError) as exc_info:
            ChatRequest(message=long_message)

        assert "2000" in str(exc_info.value)

    def test_accepts_message_at_2000_chars(self):
        """Test ChatRequest accepts message at exactly 2000 chars."""
        exact_message = "a" * 2000
        req = ChatRequest(message=exact_message)
        assert len(req.message) == 2000

    def test_with_conversation_id(self):
        """Test ChatRequest with existing conversation."""
        req = ChatRequest(
            message="Follow up",
            conversation_id="conv-123"
        )
        assert req.conversation_id == "conv-123"

    def test_with_stream_enabled(self):
        """Test ChatRequest with streaming enabled."""
        req = ChatRequest(message="Hello", stream=True)
        assert req.stream is True


class TestRAGSource:
    """Tests for RAGSource model."""

    def test_valid_rag_source(self):
        """Test valid RAGSource creation."""
        source = RAGSource(
            doc_id="tax_guide_iva_1",
            section_title="IVA Overview",
            source_file="tax_guide.md",
            similarity_score=0.85,
            excerpt="El IVA es un impuesto..."
        )
        assert source.doc_id == "tax_guide_iva_1"
        assert source.similarity_score == 0.85

    def test_serializes_correctly(self):
        """Test RAGSource serializes to JSON correctly."""
        source = RAGSource(
            doc_id="cfdi_guide_basics_0",
            section_title="¿Qué es CFDI?",
            source_file="cfdi_guide.md",
            similarity_score=0.92,
            excerpt="CFDI significa Comprobante Fiscal Digital..."
        )
        data = source.model_dump()

        assert data["doc_id"] == "cfdi_guide_basics_0"
        assert data["similarity_score"] == 0.92
        assert "excerpt" in data

    def test_similarity_score_bounds(self):
        """Test similarity_score must be between 0 and 1."""
        # Valid at boundaries
        RAGSource(
            doc_id="test", source_file="test.md",
            similarity_score=0.0, excerpt="test"
        )
        RAGSource(
            doc_id="test", source_file="test.md",
            similarity_score=1.0, excerpt="test"
        )

        # Invalid below 0
        with pytest.raises(ValidationError):
            RAGSource(
                doc_id="test", source_file="test.md",
                similarity_score=-0.1, excerpt="test"
            )

        # Invalid above 1
        with pytest.raises(ValidationError):
            RAGSource(
                doc_id="test", source_file="test.md",
                similarity_score=1.1, excerpt="test"
            )

    def test_section_title_optional(self):
        """Test section_title is optional."""
        source = RAGSource(
            doc_id="test",
            source_file="test.md",
            similarity_score=0.5,
            excerpt="test"
        )
        assert source.section_title is None


class TestChatResponse:
    """Tests for ChatResponse model."""

    def test_valid_response(self):
        """Test valid ChatResponse creation."""
        response = ChatResponse(
            conversation_id="conv-123",
            message_id="msg-456",
            content="El IVA en México es 16%.",
            model_used="llama3.1",
            confidence=0.88,
            created_at=datetime.now()
        )
        assert response.content == "El IVA en México es 16%."
        assert response.confidence == 0.88

    def test_confidence_must_be_0_to_1(self):
        """Test ChatResponse requires confidence between 0.0 and 1.0."""
        # Valid at 0
        ChatResponse(
            conversation_id="c", message_id="m", content="test",
            model_used="llama3.1", confidence=0.0, created_at=datetime.now()
        )

        # Valid at 1
        ChatResponse(
            conversation_id="c", message_id="m", content="test",
            model_used="llama3.1", confidence=1.0, created_at=datetime.now()
        )

        # Invalid below 0
        with pytest.raises(ValidationError):
            ChatResponse(
                conversation_id="c", message_id="m", content="test",
                model_used="llama3.1", confidence=-0.1, created_at=datetime.now()
            )

        # Invalid above 1
        with pytest.raises(ValidationError):
            ChatResponse(
                conversation_id="c", message_id="m", content="test",
                model_used="llama3.1", confidence=1.5, created_at=datetime.now()
            )

    def test_default_role_is_assistant(self):
        """Test default role is ASSISTANT."""
        response = ChatResponse(
            conversation_id="c", message_id="m", content="test",
            model_used="llama3.1", confidence=0.5, created_at=datetime.now()
        )
        assert response.role == MessageRole.ASSISTANT

    def test_requires_professional_advice_default_false(self):
        """Test requires_professional_advice defaults to False."""
        response = ChatResponse(
            conversation_id="c", message_id="m", content="test",
            model_used="llama3.1", confidence=0.5, created_at=datetime.now()
        )
        assert response.requires_professional_advice is False

    def test_with_rag_sources(self):
        """Test ChatResponse with RAG sources."""
        sources = [
            RAGSource(
                doc_id="tax_guide_1", source_file="tax_guide.md",
                similarity_score=0.9, excerpt="..."
            )
        ]
        response = ChatResponse(
            conversation_id="c", message_id="m",
            content="Based on the tax guide...",
            model_used="llama3.1", confidence=0.9,
            rag_sources=sources, created_at=datetime.now()
        )
        assert len(response.rag_sources) == 1


class TestStreamChunk:
    """Tests for StreamChunk model."""

    def test_chunk_type(self):
        """Test chunk type for streaming content."""
        chunk = StreamChunk(type="chunk", content="Hello")
        assert chunk.type == "chunk"
        assert chunk.content == "Hello"

    def test_done_type_with_metadata(self):
        """Test done type with final metadata."""
        chunk = StreamChunk(
            type="done",
            conversation_id="conv-123",
            message_id="msg-456",
            model_used="llama3.1",
            confidence=0.85
        )
        assert chunk.type == "done"
        assert chunk.conversation_id == "conv-123"

    def test_error_type(self):
        """Test error type with message."""
        chunk = StreamChunk(type="error", error_message="Service unavailable")
        assert chunk.type == "error"
        assert chunk.error_message == "Service unavailable"


class TestConversationSummary:
    """Tests for ConversationSummary model."""

    def test_valid_summary(self):
        """Test valid ConversationSummary."""
        summary = ConversationSummary(
            conversation_id="conv-123",
            title="Preguntas sobre IVA",
            message_count=5,
            created_at=datetime.now(),
            updated_at=datetime.now()
        )
        assert summary.message_count == 5


class TestConversationHistory:
    """Tests for ConversationHistory model."""

    def test_valid_history(self):
        """Test valid ConversationHistory."""
        messages = [
            ChatMessage(role=MessageRole.USER, content="Hello"),
            ChatMessage(role=MessageRole.ASSISTANT, content="Hi there!")
        ]
        history = ConversationHistory(
            conversation_id="conv-123",
            messages=messages
        )
        assert len(history.messages) == 2

    def test_with_summary(self):
        """Test ConversationHistory with summary."""
        history = ConversationHistory(
            conversation_id="conv-123",
            messages=[],
            summary="Discussion about tax obligations..."
        )
        assert history.summary is not None
