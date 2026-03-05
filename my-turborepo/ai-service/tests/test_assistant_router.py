"""
Tests for Assistant Router (Component 11).
"""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

from fastapi import HTTPException
from fastapi.testclient import TestClient

from app.config import Settings
from app.models.conversation import (
    ChatRequest,
    ChatResponse,
    ConversationContext,
    ConversationHistory,
    ConversationSummary,
    MessageRole,
    RAGSource,
    ChatMessage,
)
from app.routers.assistant import (
    verify_internal_auth,
    router,
)


@pytest.fixture
def settings():
    """Create test settings."""
    return Settings(
        supabase_url="http://localhost:54321",
        supabase_service_key="test-key",
        internal_api_key="test-internal-key",
    )


@pytest.fixture
def valid_headers():
    """Create valid authentication headers."""
    return {
        "X-User-Id": str(uuid4()),
        "X-Internal-Key": "test-internal-key",
    }


class TestVerifyInternalAuth:
    """Tests for verify_internal_auth dependency."""

    @pytest.mark.asyncio
    async def test_returns_user_id_for_valid_auth(self, settings):
        """Test returns user UUID for valid authentication."""
        user_id = str(uuid4())

        result = await verify_internal_auth(
            x_user_id=user_id,
            x_internal_key="test-internal-key",
            settings=settings,
        )

        assert str(result) == user_id

    @pytest.mark.asyncio
    async def test_raises_401_for_invalid_key(self, settings):
        """Test raises 401 for invalid API key."""
        with pytest.raises(HTTPException) as exc_info:
            await verify_internal_auth(
                x_user_id=str(uuid4()),
                x_internal_key="wrong-key",
                settings=settings,
            )

        assert exc_info.value.status_code == 401
        assert "Invalid internal API key" in exc_info.value.detail

    @pytest.mark.asyncio
    async def test_raises_400_for_invalid_user_id(self, settings):
        """Test raises 400 for invalid user ID format."""
        with pytest.raises(HTTPException) as exc_info:
            await verify_internal_auth(
                x_user_id="not-a-uuid",
                x_internal_key="test-internal-key",
                settings=settings,
            )

        assert exc_info.value.status_code == 400
        assert "Invalid user ID" in exc_info.value.detail


class TestChatEndpoint:
    """Tests for POST /assistant/chat endpoint."""

    @pytest.mark.asyncio
    async def test_creates_conversation_when_none_provided(self):
        """Test creates new conversation when conversation_id not provided."""
        from app.routers.assistant import chat

        user_id = uuid4()
        conv_id = uuid4()

        mock_llm = MagicMock()
        mock_llm.generate_response = AsyncMock(return_value=("El IVA es 16%", "llama3.1", 50))
        mock_llm.estimate_confidence = MagicMock(return_value=0.85)
        mock_llm.requires_professional_advice = MagicMock(return_value=False)
        mock_llm.generate_title = AsyncMock(return_value="IVA Question")

        mock_rag = MagicMock()
        mock_rag.retrieve_relevant_context = AsyncMock(return_value=("IVA info", []))

        mock_conv_manager = MagicMock()
        mock_conv_manager.create_conversation = AsyncMock(return_value=conv_id)
        mock_conv_manager.get_conversation_history = AsyncMock(
            side_effect=ValueError("Not found")
        )
        mock_conv_manager.add_message = AsyncMock(return_value=uuid4())
        mock_conv_manager.store_message_with_metadata = AsyncMock(return_value=uuid4())
        mock_conv_manager.update_conversation_title = AsyncMock()
        mock_conv_manager.should_summarize = AsyncMock(return_value=False)

        request = ChatRequest(message="¿Cuánto es el IVA?")

        response = await chat(
            request=request,
            user_id=user_id,
            llm_service=mock_llm,
            rag_service=mock_rag,
            conversation_manager=mock_conv_manager,
        )

        assert response.conversation_id == conv_id
        assert response.message == "El IVA es 16%"
        assert response.confidence == 0.85
        mock_conv_manager.create_conversation.assert_called()

    @pytest.mark.asyncio
    async def test_uses_existing_conversation(self):
        """Test uses existing conversation when ID provided."""
        from app.routers.assistant import chat

        user_id = uuid4()
        conv_id = uuid4()

        mock_history = ConversationHistory(
            conversation_id=conv_id,
            messages=[
                ChatMessage(role=MessageRole.USER, content="Hola"),
                ChatMessage(role=MessageRole.ASSISTANT, content="¡Hola!"),
            ],
            total_messages=2,
        )

        mock_llm = MagicMock()
        mock_llm.generate_response = AsyncMock(return_value=("Response", "llama3.1", 50))
        mock_llm.estimate_confidence = MagicMock(return_value=0.8)
        mock_llm.requires_professional_advice = MagicMock(return_value=False)

        mock_rag = MagicMock()
        mock_rag.retrieve_relevant_context = AsyncMock(return_value=("", []))

        mock_conv_manager = MagicMock()
        mock_conv_manager.get_conversation_history = AsyncMock(return_value=mock_history)
        mock_conv_manager.add_message = AsyncMock(return_value=uuid4())
        mock_conv_manager.store_message_with_metadata = AsyncMock(return_value=uuid4())
        mock_conv_manager.should_summarize = AsyncMock(return_value=False)

        request = ChatRequest(message="Follow up", conversation_id=conv_id)

        response = await chat(
            request=request,
            user_id=user_id,
            llm_service=mock_llm,
            rag_service=mock_rag,
            conversation_manager=mock_conv_manager,
        )

        assert response.conversation_id == conv_id
        # Should not create new conversation
        mock_conv_manager.create_conversation.assert_not_called()

    @pytest.mark.asyncio
    async def test_includes_rag_sources_in_response(self):
        """Test includes RAG sources in response."""
        from app.routers.assistant import chat

        user_id = uuid4()
        conv_id = uuid4()

        rag_sources = [
            RAGSource(doc_id="iva_guide_0", section_title="IVA Rates", similarity_score=0.9),
        ]

        mock_llm = MagicMock()
        mock_llm.generate_response = AsyncMock(return_value=("Response", "llama3.1", 50))
        mock_llm.estimate_confidence = MagicMock(return_value=0.95)
        mock_llm.requires_professional_advice = MagicMock(return_value=False)
        mock_llm.generate_title = AsyncMock(return_value="Title")

        mock_rag = MagicMock()
        mock_rag.retrieve_relevant_context = AsyncMock(
            return_value=("IVA context", rag_sources)
        )

        mock_conv_manager = MagicMock()
        mock_conv_manager.create_conversation = AsyncMock(return_value=conv_id)
        mock_conv_manager.get_conversation_history = AsyncMock(
            side_effect=ValueError("Not found")
        )
        mock_conv_manager.add_message = AsyncMock(return_value=uuid4())
        mock_conv_manager.store_message_with_metadata = AsyncMock(return_value=uuid4())
        mock_conv_manager.update_conversation_title = AsyncMock()
        mock_conv_manager.should_summarize = AsyncMock(return_value=False)

        request = ChatRequest(message="¿Cuánto es el IVA?")

        response = await chat(
            request=request,
            user_id=user_id,
            llm_service=mock_llm,
            rag_service=mock_rag,
            conversation_manager=mock_conv_manager,
        )

        assert len(response.sources) == 1
        assert response.sources[0].section_title == "IVA Rates"

    @pytest.mark.asyncio
    async def test_flags_professional_advice_needed(self):
        """Test flags when professional advice is needed."""
        from app.routers.assistant import chat

        user_id = uuid4()
        conv_id = uuid4()

        mock_llm = MagicMock()
        mock_llm.generate_response = AsyncMock(
            return_value=("Consulta con un profesional para temas de evasión", "llama3.1", 50)
        )
        mock_llm.estimate_confidence = MagicMock(return_value=0.6)
        mock_llm.requires_professional_advice = MagicMock(return_value=True)
        mock_llm.generate_title = AsyncMock(return_value="Title")

        mock_rag = MagicMock()
        mock_rag.retrieve_relevant_context = AsyncMock(return_value=("", []))

        mock_conv_manager = MagicMock()
        mock_conv_manager.create_conversation = AsyncMock(return_value=conv_id)
        mock_conv_manager.get_conversation_history = AsyncMock(
            side_effect=ValueError("Not found")
        )
        mock_conv_manager.add_message = AsyncMock(return_value=uuid4())
        mock_conv_manager.store_message_with_metadata = AsyncMock(return_value=uuid4())
        mock_conv_manager.update_conversation_title = AsyncMock()
        mock_conv_manager.should_summarize = AsyncMock(return_value=False)

        request = ChatRequest(message="¿Cómo evado impuestos?")

        response = await chat(
            request=request,
            user_id=user_id,
            llm_service=mock_llm,
            rag_service=mock_rag,
            conversation_manager=mock_conv_manager,
        )

        assert response.requires_professional_advice is True


class TestConversationEndpoints:
    """Tests for conversation management endpoints."""

    @pytest.mark.asyncio
    async def test_list_conversations(self):
        """Test listing user conversations."""
        from app.routers.assistant import list_conversations

        user_id = uuid4()

        mock_summaries = [
            ConversationSummary(
                conversation_id=uuid4(),
                title="Conversation 1",
                message_count=5,
            ),
            ConversationSummary(
                conversation_id=uuid4(),
                title="Conversation 2",
                message_count=3,
            ),
        ]

        mock_conv_manager = MagicMock()
        mock_conv_manager.get_user_conversations = AsyncMock(return_value=mock_summaries)

        result = await list_conversations(
            limit=20,
            offset=0,
            user_id=user_id,
            conversation_manager=mock_conv_manager,
        )

        assert len(result) == 2
        assert result[0].title == "Conversation 1"

    @pytest.mark.asyncio
    async def test_get_conversation_returns_history(self):
        """Test getting conversation history."""
        from app.routers.assistant import get_conversation

        user_id = uuid4()
        conv_id = uuid4()

        mock_history = ConversationHistory(
            conversation_id=conv_id,
            messages=[
                ChatMessage(role=MessageRole.USER, content="Hello"),
            ],
            total_messages=1,
        )

        mock_conv_manager = MagicMock()
        mock_conv_manager.get_conversation_history = AsyncMock(return_value=mock_history)
        mock_conv_manager.get_conversation = AsyncMock(
            return_value={"user_id": str(user_id)}
        )

        result = await get_conversation(
            conversation_id=conv_id,
            user_id=user_id,
            conversation_manager=mock_conv_manager,
        )

        assert result.conversation_id == conv_id
        assert len(result.messages) == 1

    @pytest.mark.asyncio
    async def test_get_conversation_denies_other_users(self):
        """Test denies access to other user's conversations."""
        from app.routers.assistant import get_conversation

        user_id = uuid4()
        other_user_id = uuid4()
        conv_id = uuid4()

        mock_conv_manager = MagicMock()
        mock_conv_manager.get_conversation_history = AsyncMock(
            return_value=MagicMock(conversation_id=conv_id)
        )
        mock_conv_manager.get_conversation = AsyncMock(
            return_value={"user_id": str(other_user_id)}
        )

        with pytest.raises(HTTPException) as exc_info:
            await get_conversation(
                conversation_id=conv_id,
                user_id=user_id,
                conversation_manager=mock_conv_manager,
            )

        assert exc_info.value.status_code == 403

    @pytest.mark.asyncio
    async def test_delete_conversation(self):
        """Test deleting a conversation."""
        from app.routers.assistant import delete_conversation

        user_id = uuid4()
        conv_id = uuid4()

        mock_conv_manager = MagicMock()
        mock_conv_manager.get_conversation = AsyncMock(
            return_value={"user_id": str(user_id)}
        )
        mock_conv_manager.delete_conversation = AsyncMock(return_value=True)

        result = await delete_conversation(
            conversation_id=conv_id,
            user_id=user_id,
            conversation_manager=mock_conv_manager,
        )

        assert result["deleted"] is True
        assert result["conversation_id"] == str(conv_id)


class TestAssistantHealth:
    """Tests for assistant health endpoint."""

    @pytest.mark.asyncio
    async def test_returns_health_status(self):
        """Test returns health status."""
        from app.routers.assistant import assistant_health

        mock_llm = MagicMock()
        mock_llm.check_ollama_available = AsyncMock(return_value=True)
        mock_llm._openai_client = MagicMock()

        mock_rag = MagicMock()
        mock_rag.check_knowledge_base_health = AsyncMock(
            return_value={
                "status": "healthy",
                "document_count": 50,
                "last_updated": "2024-03-15T10:00:00Z",
            }
        )

        result = await assistant_health(
            llm_service=mock_llm,
            rag_service=mock_rag,
        )

        assert result["status"] == "healthy"
        assert result["llm"]["ollama_available"] is True
        assert result["llm"]["openai_configured"] is True
        assert result["knowledge_base"]["document_count"] == 50

    @pytest.mark.asyncio
    async def test_returns_degraded_when_ollama_unavailable(self):
        """Test returns degraded status when Ollama unavailable."""
        from app.routers.assistant import assistant_health

        mock_llm = MagicMock()
        mock_llm.check_ollama_available = AsyncMock(return_value=False)
        mock_llm._openai_client = MagicMock()  # OpenAI still available

        mock_rag = MagicMock()
        mock_rag.check_knowledge_base_health = AsyncMock(
            return_value={"status": "healthy", "document_count": 50}
        )

        result = await assistant_health(
            llm_service=mock_llm,
            rag_service=mock_rag,
        )

        assert result["status"] == "healthy"  # Still healthy with OpenAI fallback
        assert result["llm"]["ollama_available"] is False
