"""
Tests for Conversation Manager (Component 11).
"""

import pytest
from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock, patch
from uuid import UUID, uuid4

from app.config import Settings
from app.models.conversation import MessageRole, RAGSource
from app.services.conversation import ConversationManager


@pytest.fixture
def settings():
    """Create test settings."""
    return Settings(
        supabase_url="http://localhost:54321",
        supabase_service_key="test-key",
        max_conversation_history=20,
        conversation_summary_threshold=15,
        conversation_ttl_days=30,
    )


@pytest.fixture
def conversation_manager(settings):
    """Create conversation manager with mocked Supabase."""
    manager = ConversationManager(settings)
    manager._supabase = MagicMock()
    return manager


class TestCreateConversation:
    """Tests for create_conversation method."""

    @pytest.mark.asyncio
    async def test_creates_conversation_with_user_id(self, conversation_manager):
        """Test creates conversation with required user_id."""
        user_id = uuid4()
        conv_id = uuid4()

        conversation_manager.supabase.table.return_value.insert.return_value.execute.return_value = MagicMock(
            data=[{"id": str(conv_id)}]
        )

        result = await conversation_manager.create_conversation(user_id=user_id)

        assert result == conv_id

        # Check insert was called with correct data
        insert_call = conversation_manager.supabase.table.return_value.insert
        insert_call.assert_called_once()
        insert_data = insert_call.call_args[0][0]

        assert insert_data["user_id"] == str(user_id)
        assert insert_data["message_count"] == 0
        assert "expires_at" in insert_data

    @pytest.mark.asyncio
    async def test_creates_conversation_with_organization(self, conversation_manager):
        """Test creates conversation with organization context."""
        user_id = uuid4()
        org_id = uuid4()
        conv_id = uuid4()

        conversation_manager.supabase.table.return_value.insert.return_value.execute.return_value = MagicMock(
            data=[{"id": str(conv_id)}]
        )

        await conversation_manager.create_conversation(
            user_id=user_id,
            organization_id=org_id,
        )

        insert_data = conversation_manager.supabase.table.return_value.insert.call_args[0][0]
        assert insert_data["organization_id"] == str(org_id)

    @pytest.mark.asyncio
    async def test_creates_conversation_with_title(self, conversation_manager):
        """Test creates conversation with provided title."""
        user_id = uuid4()
        conv_id = uuid4()

        conversation_manager.supabase.table.return_value.insert.return_value.execute.return_value = MagicMock(
            data=[{"id": str(conv_id)}]
        )

        await conversation_manager.create_conversation(
            user_id=user_id,
            title="Test Conversation",
        )

        insert_data = conversation_manager.supabase.table.return_value.insert.call_args[0][0]
        assert insert_data["title"] == "Test Conversation"

    @pytest.mark.asyncio
    async def test_sets_expiration_date(self, conversation_manager):
        """Test sets correct expiration date."""
        user_id = uuid4()
        conv_id = uuid4()

        conversation_manager.supabase.table.return_value.insert.return_value.execute.return_value = MagicMock(
            data=[{"id": str(conv_id)}]
        )

        before = datetime.now(timezone.utc)
        await conversation_manager.create_conversation(user_id=user_id)
        after = datetime.now(timezone.utc)

        insert_data = conversation_manager.supabase.table.return_value.insert.call_args[0][0]
        expires_at = datetime.fromisoformat(insert_data["expires_at"].replace("Z", "+00:00"))

        expected_min = before + timedelta(days=30)
        expected_max = after + timedelta(days=30)

        assert expected_min <= expires_at <= expected_max


class TestGetConversation:
    """Tests for get_conversation method."""

    @pytest.mark.asyncio
    async def test_returns_conversation_when_found(self, conversation_manager):
        """Test returns conversation data when found."""
        conv_id = uuid4()
        conv_data = {
            "id": str(conv_id),
            "user_id": str(uuid4()),
            "title": "Test Conversation",
            "message_count": 5,
        }

        conversation_manager.supabase.table.return_value.select.return_value.eq.return_value.execute.return_value = MagicMock(
            data=[conv_data]
        )

        result = await conversation_manager.get_conversation(conv_id)

        assert result == conv_data

    @pytest.mark.asyncio
    async def test_returns_none_when_not_found(self, conversation_manager):
        """Test returns None when conversation doesn't exist."""
        conversation_manager.supabase.table.return_value.select.return_value.eq.return_value.execute.return_value = MagicMock(
            data=[]
        )

        result = await conversation_manager.get_conversation(uuid4())

        assert result is None


class TestGetUserConversations:
    """Tests for get_user_conversations method."""

    @pytest.mark.asyncio
    async def test_returns_conversation_summaries(self, conversation_manager):
        """Test returns list of conversation summaries."""
        user_id = uuid4()
        conv_data = [
            {
                "id": str(uuid4()),
                "title": "Conversation 1",
                "message_count": 10,
                "created_at": "2024-03-15T10:00:00Z",
                "updated_at": "2024-03-15T11:00:00Z",
            },
            {
                "id": str(uuid4()),
                "title": "Conversation 2",
                "message_count": 5,
                "created_at": "2024-03-14T10:00:00Z",
                "updated_at": "2024-03-14T12:00:00Z",
            },
        ]

        conversation_manager.supabase.table.return_value.select.return_value.eq.return_value.order.return_value.range.return_value.execute.return_value = MagicMock(
            data=conv_data
        )

        result = await conversation_manager.get_user_conversations(user_id)

        assert len(result) == 2
        assert result[0].title == "Conversation 1"
        assert result[0].message_count == 10
        assert result[1].title == "Conversation 2"

    @pytest.mark.asyncio
    async def test_supports_pagination(self, conversation_manager):
        """Test supports limit and offset pagination."""
        user_id = uuid4()

        conversation_manager.supabase.table.return_value.select.return_value.eq.return_value.order.return_value.range.return_value.execute.return_value = MagicMock(
            data=[]
        )

        await conversation_manager.get_user_conversations(
            user_id, limit=10, offset=20
        )

        # Check range was called with correct values
        range_call = conversation_manager.supabase.table.return_value.select.return_value.eq.return_value.order.return_value.range
        range_call.assert_called_once_with(20, 29)  # offset to offset + limit - 1


class TestAddMessage:
    """Tests for add_message method."""

    @pytest.mark.asyncio
    async def test_adds_user_message(self, conversation_manager):
        """Test adds user message to conversation."""
        conv_id = uuid4()
        msg_id = uuid4()

        conversation_manager.supabase.table.return_value.insert.return_value.execute.return_value = MagicMock(
            data=[{"id": str(msg_id)}]
        )
        conversation_manager.supabase.rpc.return_value.execute.return_value = MagicMock()

        result = await conversation_manager.add_message(
            conversation_id=conv_id,
            role=MessageRole.USER,
            content="Hello, how do I calculate IVA?",
        )

        assert result == msg_id

        # Check insert was called correctly
        insert_data = conversation_manager.supabase.table.return_value.insert.call_args[0][0]
        assert insert_data["conversation_id"] == str(conv_id)
        assert insert_data["role"] == "user"
        assert "IVA" in insert_data["content"]

    @pytest.mark.asyncio
    async def test_adds_assistant_message_with_metadata(self, conversation_manager):
        """Test adds assistant message with metadata."""
        conv_id = uuid4()
        msg_id = uuid4()

        conversation_manager.supabase.table.return_value.insert.return_value.execute.return_value = MagicMock(
            data=[{"id": str(msg_id)}]
        )
        conversation_manager.supabase.rpc.return_value.execute.return_value = MagicMock()

        metadata = {
            "model": "llama3.1",
            "tokens": 150,
            "confidence": 0.85,
        }

        await conversation_manager.add_message(
            conversation_id=conv_id,
            role=MessageRole.ASSISTANT,
            content="El IVA es 16%.",
            metadata=metadata,
        )

        insert_data = conversation_manager.supabase.table.return_value.insert.call_args[0][0]
        assert insert_data["role"] == "assistant"
        assert insert_data["metadata"] == metadata

    @pytest.mark.asyncio
    async def test_increments_message_count(self, conversation_manager):
        """Test increments conversation message count."""
        conv_id = uuid4()

        conversation_manager.supabase.table.return_value.insert.return_value.execute.return_value = MagicMock(
            data=[{"id": str(uuid4())}]
        )
        conversation_manager.supabase.rpc.return_value.execute.return_value = MagicMock()

        await conversation_manager.add_message(
            conversation_id=conv_id,
            role=MessageRole.USER,
            content="Test",
        )

        # Check RPC was called to increment count
        conversation_manager.supabase.rpc.assert_called_once_with(
            "increment_message_count",
            {"conv_id": str(conv_id)}
        )


class TestGetConversationHistory:
    """Tests for get_conversation_history method."""

    @pytest.mark.asyncio
    async def test_returns_history_with_messages(self, conversation_manager):
        """Test returns conversation history with messages."""
        conv_id = uuid4()

        # Mock get_conversation
        conversation_manager.supabase.table.return_value.select.return_value.eq.return_value.execute.return_value = MagicMock(
            data=[{
                "id": str(conv_id),
                "user_id": str(uuid4()),
                "organization_id": None,
                "title": "Test",
                "summary": None,
                "message_count": 2,
                "created_at": "2024-03-15T10:00:00Z",
                "updated_at": "2024-03-15T11:00:00Z",
            }]
        )

        # Mock messages query
        conversation_manager.supabase.table.return_value.select.return_value.eq.return_value.order.return_value.execute.return_value = MagicMock(
            data=[
                {
                    "role": "user",
                    "content": "Hello",
                    "metadata": {},
                    "created_at": "2024-03-15T10:00:00Z",
                },
                {
                    "role": "assistant",
                    "content": "Hi there!",
                    "metadata": {},
                    "created_at": "2024-03-15T10:01:00Z",
                },
            ]
        )

        result = await conversation_manager.get_conversation_history(conv_id)

        assert result.conversation_id == conv_id
        assert len(result.messages) == 2
        assert result.messages[0].role == MessageRole.USER
        assert result.messages[1].role == MessageRole.ASSISTANT

    @pytest.mark.asyncio
    async def test_raises_for_missing_conversation(self, conversation_manager):
        """Test raises ValueError for missing conversation."""
        conversation_manager.supabase.table.return_value.select.return_value.eq.return_value.execute.return_value = MagicMock(
            data=[]
        )

        with pytest.raises(ValueError, match="not found"):
            await conversation_manager.get_conversation_history(uuid4())


class TestUpdateConversation:
    """Tests for update methods."""

    @pytest.mark.asyncio
    async def test_update_title(self, conversation_manager):
        """Test updates conversation title."""
        conv_id = uuid4()

        conversation_manager.supabase.table.return_value.update.return_value.eq.return_value.execute.return_value = MagicMock()

        await conversation_manager.update_conversation_title(
            conv_id, "New Title"
        )

        update_call = conversation_manager.supabase.table.return_value.update
        update_call.assert_called_once_with({"title": "New Title"})

    @pytest.mark.asyncio
    async def test_update_title_truncates_long_titles(self, conversation_manager):
        """Test truncates titles longer than 255 chars."""
        conv_id = uuid4()
        long_title = "A" * 300

        conversation_manager.supabase.table.return_value.update.return_value.eq.return_value.execute.return_value = MagicMock()

        await conversation_manager.update_conversation_title(conv_id, long_title)

        update_call = conversation_manager.supabase.table.return_value.update
        truncated = update_call.call_args[0][0]["title"]
        assert len(truncated) == 255

    @pytest.mark.asyncio
    async def test_update_summary(self, conversation_manager):
        """Test updates conversation summary."""
        conv_id = uuid4()

        conversation_manager.supabase.table.return_value.update.return_value.eq.return_value.execute.return_value = MagicMock()

        await conversation_manager.update_conversation_summary(
            conv_id, "This is a summary of the conversation."
        )

        update_call = conversation_manager.supabase.table.return_value.update
        update_call.assert_called_once_with(
            {"summary": "This is a summary of the conversation."}
        )


class TestShouldSummarize:
    """Tests for should_summarize method."""

    @pytest.mark.asyncio
    async def test_returns_true_above_threshold(self, conversation_manager):
        """Test returns True when message count exceeds threshold."""
        conv_id = uuid4()

        conversation_manager.supabase.table.return_value.select.return_value.eq.return_value.execute.return_value = MagicMock(
            data=[{"message_count": 20}]  # Above 15 threshold
        )

        result = await conversation_manager.should_summarize(conv_id)

        assert result is True

    @pytest.mark.asyncio
    async def test_returns_false_below_threshold(self, conversation_manager):
        """Test returns False when message count below threshold."""
        conv_id = uuid4()

        conversation_manager.supabase.table.return_value.select.return_value.eq.return_value.execute.return_value = MagicMock(
            data=[{"message_count": 5}]
        )

        result = await conversation_manager.should_summarize(conv_id)

        assert result is False


class TestDeleteConversation:
    """Tests for delete_conversation method."""

    @pytest.mark.asyncio
    async def test_returns_true_when_deleted(self, conversation_manager):
        """Test returns True when conversation deleted."""
        conversation_manager.supabase.table.return_value.delete.return_value.eq.return_value.execute.return_value = MagicMock(
            data=[{"id": str(uuid4())}]
        )

        result = await conversation_manager.delete_conversation(uuid4())

        assert result is True

    @pytest.mark.asyncio
    async def test_returns_false_when_not_found(self, conversation_manager):
        """Test returns False when conversation not found."""
        conversation_manager.supabase.table.return_value.delete.return_value.eq.return_value.execute.return_value = MagicMock(
            data=[]
        )

        result = await conversation_manager.delete_conversation(uuid4())

        assert result is False


class TestStoreMessageWithMetadata:
    """Tests for store_message_with_metadata method."""

    @pytest.mark.asyncio
    async def test_stores_assistant_response_with_full_metadata(self, conversation_manager):
        """Test stores assistant message with all metadata fields."""
        conv_id = uuid4()
        msg_id = uuid4()

        conversation_manager.supabase.table.return_value.insert.return_value.execute.return_value = MagicMock(
            data=[{"id": str(msg_id)}]
        )
        conversation_manager.supabase.rpc.return_value.execute.return_value = MagicMock()

        rag_sources = [
            RAGSource(doc_id="doc1", section_title="IVA", similarity_score=0.9),
        ]

        await conversation_manager.store_message_with_metadata(
            conversation_id=conv_id,
            role=MessageRole.ASSISTANT,
            content="El IVA es 16%",
            model_used="llama3.1",
            tokens_used=50,
            confidence=0.85,
            rag_sources=rag_sources,
            requires_professional_advice=False,
        )

        insert_data = conversation_manager.supabase.table.return_value.insert.call_args[0][0]
        metadata = insert_data["metadata"]

        assert metadata["model"] == "llama3.1"
        assert metadata["tokens"] == 50
        assert metadata["confidence"] == 0.85
        assert len(metadata["rag_sources"]) == 1
        assert metadata["rag_sources"][0]["doc_id"] == "doc1"

    @pytest.mark.asyncio
    async def test_flags_professional_advice_required(self, conversation_manager):
        """Test flags when professional advice is required."""
        conv_id = uuid4()

        conversation_manager.supabase.table.return_value.insert.return_value.execute.return_value = MagicMock(
            data=[{"id": str(uuid4())}]
        )
        conversation_manager.supabase.rpc.return_value.execute.return_value = MagicMock()

        await conversation_manager.store_message_with_metadata(
            conversation_id=conv_id,
            role=MessageRole.ASSISTANT,
            content="Consulta con un profesional.",
            requires_professional_advice=True,
        )

        insert_data = conversation_manager.supabase.table.return_value.insert.call_args[0][0]
        assert insert_data["metadata"]["requires_professional_advice"] is True


class TestGetConversationStats:
    """Tests for get_conversation_stats method."""

    @pytest.mark.asyncio
    async def test_returns_stats(self, conversation_manager):
        """Test returns conversation statistics."""
        user_id = uuid4()

        conversation_manager.supabase.table.return_value.select.return_value.eq.return_value.execute.return_value = MagicMock(
            count=5,
            data=[
                {"message_count": 10},
                {"message_count": 20},
                {"message_count": 15},
            ]
        )

        # Need to set up two calls (count and sum)
        conversation_manager.supabase.table.return_value.select.return_value.eq.return_value.execute.side_effect = [
            MagicMock(count=3),
            MagicMock(data=[
                {"message_count": 10},
                {"message_count": 20},
                {"message_count": 15},
            ]),
        ]

        result = await conversation_manager.get_conversation_stats(user_id)

        assert result["conversation_count"] == 3
        assert result["total_messages"] == 45
