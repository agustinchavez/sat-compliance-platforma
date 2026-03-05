"""
Conversation Manager for the Tax Assistant (Component 11).

Handles conversation persistence, message history, and session management.
"""

import logging
from datetime import datetime, timedelta, timezone
from typing import Optional
from uuid import UUID

from supabase import create_client

from app.config import Settings
from app.models.conversation import (
    ChatMessage,
    ConversationContext,
    ConversationHistory,
    ConversationSummary,
    MessageRole,
    RAGSource,
)

logger = logging.getLogger(__name__)


class ConversationManager:
    """
    Manages conversation persistence and history.

    Responsibilities:
    - Create and retrieve conversations
    - Store and retrieve messages
    - Generate conversation summaries for long chats
    - Handle conversation expiration
    """

    def __init__(self, settings: Settings):
        self.settings = settings
        self._supabase = None

    @property
    def supabase(self):
        """Lazy-load Supabase client."""
        if self._supabase is None:
            self._supabase = create_client(
                self.settings.supabase_url,
                self.settings.supabase_service_key
            )
        return self._supabase

    async def create_conversation(
        self,
        user_id: UUID,
        organization_id: Optional[UUID] = None,
        title: Optional[str] = None,
    ) -> UUID:
        """
        Create a new conversation session.

        Args:
            user_id: ID of the user starting the conversation
            organization_id: Optional organization context
            title: Optional title (auto-generated from first message if not provided)

        Returns:
            The new conversation's UUID
        """
        expires_at = datetime.now(timezone.utc) + timedelta(days=self.settings.conversation_ttl_days)

        response = self.supabase.table("conversations").insert({
            "user_id": str(user_id),
            "organization_id": str(organization_id) if organization_id else None,
            "title": title,
            "expires_at": expires_at.isoformat(),
            "message_count": 0,
        }).execute()

        conversation_id = UUID(response.data[0]["id"])
        logger.info(f"Created conversation {conversation_id} for user {user_id}")

        return conversation_id

    async def get_conversation(self, conversation_id: UUID) -> Optional[dict]:
        """
        Retrieve conversation metadata.

        Returns:
            Conversation dict or None if not found
        """
        response = self.supabase.table("conversations").select(
            "id, user_id, organization_id, title, summary, message_count, created_at, updated_at"
        ).eq("id", str(conversation_id)).execute()

        if response.data:
            return response.data[0]
        return None

    async def get_user_conversations(
        self,
        user_id: UUID,
        limit: int = 20,
        offset: int = 0,
    ) -> list[ConversationSummary]:
        """
        Get list of user's conversations, most recent first.

        Args:
            user_id: User ID
            limit: Max conversations to return
            offset: Pagination offset

        Returns:
            List of ConversationSummary objects
        """
        response = self.supabase.table("conversations").select(
            "id, title, message_count, created_at, updated_at"
        ).eq("user_id", str(user_id)).order(
            "updated_at", desc=True
        ).range(offset, offset + limit - 1).execute()

        return [
            ConversationSummary(
                conversation_id=UUID(conv["id"]),
                title=conv["title"],
                message_count=conv["message_count"],
                last_message_at=datetime.fromisoformat(conv["updated_at"].replace("Z", "+00:00")),
            )
            for conv in response.data
        ]

    async def add_message(
        self,
        conversation_id: UUID,
        role: MessageRole,
        content: str,
        metadata: Optional[dict] = None,
    ) -> UUID:
        """
        Add a message to a conversation.

        Args:
            conversation_id: Conversation to add to
            role: Message role (user, assistant, system)
            content: Message content
            metadata: Optional metadata (tokens, model, sources, confidence)

        Returns:
            The new message's UUID
        """
        # Insert message
        response = self.supabase.table("conversation_messages").insert({
            "conversation_id": str(conversation_id),
            "role": role.value if hasattr(role, 'value') else role,
            "content": content,
            "metadata": metadata or {},
        }).execute()

        message_id = UUID(response.data[0]["id"])

        # Update conversation message count
        self.supabase.rpc(
            "increment_message_count",
            {"conv_id": str(conversation_id)}
        ).execute()

        logger.debug(f"Added {role} message to conversation {conversation_id}")

        return message_id

    async def get_conversation_history(
        self,
        conversation_id: UUID,
        limit: Optional[int] = None,
    ) -> ConversationHistory:
        """
        Get messages for a conversation.

        Args:
            conversation_id: Conversation to fetch
            limit: Optional limit on messages (newest first if limited)

        Returns:
            ConversationHistory with messages and context
        """
        limit = limit or self.settings.max_conversation_history

        # Get conversation metadata
        conv = await self.get_conversation(conversation_id)
        if not conv:
            raise ValueError(f"Conversation {conversation_id} not found")

        # Get messages
        query = self.supabase.table("conversation_messages").select(
            "role, content, metadata, created_at"
        ).eq("conversation_id", str(conversation_id)).order("created_at", desc=False)

        # If we have too many messages, get only the most recent
        if conv["message_count"] > limit:
            query = query.range(conv["message_count"] - limit, conv["message_count"])

        response = query.execute()

        messages = [
            ChatMessage(
                role=MessageRole(msg["role"]),
                content=msg["content"],
                timestamp=datetime.fromisoformat(msg["created_at"].replace("Z", "+00:00")),
            )
            for msg in response.data
        ]

        # Build context from user/org info if available
        context = None
        if conv.get("organization_id"):
            # Could fetch org details for context here
            context = ConversationContext(
                organization_id=UUID(conv["organization_id"]) if conv.get("organization_id") else None,
            )

        return ConversationHistory(
            conversation_id=conversation_id,
            messages=messages,
            context=context,
            total_messages=conv["message_count"],
            summary=conv.get("summary"),
        )

    async def update_conversation_title(
        self,
        conversation_id: UUID,
        title: str,
    ) -> None:
        """Update conversation title."""
        self.supabase.table("conversations").update({
            "title": title[:255],  # Truncate to fit column
        }).eq("id", str(conversation_id)).execute()

    async def update_conversation_summary(
        self,
        conversation_id: UUID,
        summary: str,
    ) -> None:
        """Update conversation summary."""
        self.supabase.table("conversations").update({
            "summary": summary,
        }).eq("id", str(conversation_id)).execute()

    async def should_summarize(self, conversation_id: UUID) -> bool:
        """
        Check if conversation should be summarized.

        Returns True if message count exceeds threshold.
        """
        conv = await self.get_conversation(conversation_id)
        if not conv:
            return False

        return conv["message_count"] >= self.settings.conversation_summary_threshold

    async def delete_conversation(self, conversation_id: UUID) -> bool:
        """
        Delete a conversation and all its messages.

        Returns:
            True if deleted, False if not found
        """
        response = self.supabase.table("conversations").delete().eq(
            "id", str(conversation_id)
        ).execute()

        if response.data:
            logger.info(f"Deleted conversation {conversation_id}")
            return True
        return False

    async def cleanup_expired_conversations(self) -> int:
        """
        Delete all expired conversations.

        Returns:
            Number of conversations deleted
        """
        response = self.supabase.rpc("cleanup_expired_conversations").execute()
        deleted_count = response.data or 0
        logger.info(f"Cleaned up {deleted_count} expired conversations")
        return deleted_count

    async def store_message_with_metadata(
        self,
        conversation_id: UUID,
        role: MessageRole,
        content: str,
        model_used: Optional[str] = None,
        tokens_used: Optional[int] = None,
        confidence: Optional[float] = None,
        rag_sources: Optional[list[RAGSource]] = None,
        requires_professional_advice: bool = False,
    ) -> UUID:
        """
        Store a message with rich metadata.

        Convenience method for storing assistant responses with full metadata.
        """
        metadata = {}

        if model_used:
            metadata["model"] = model_used
        if tokens_used:
            metadata["tokens"] = tokens_used
        if confidence is not None:
            metadata["confidence"] = confidence
        if rag_sources:
            metadata["rag_sources"] = [
                {
                    "doc_id": s.doc_id,
                    "section_title": s.section_title,
                    "similarity": s.similarity_score,
                }
                for s in rag_sources
            ]
        if requires_professional_advice:
            metadata["requires_professional_advice"] = True

        return await self.add_message(
            conversation_id=conversation_id,
            role=role,
            content=content,
            metadata=metadata,
        )

    async def get_conversation_stats(self, user_id: UUID) -> dict:
        """
        Get conversation statistics for a user.

        Returns:
            Dict with conversation count, total messages, etc.
        """
        # Count conversations
        conv_response = self.supabase.table("conversations").select(
            "id", count="exact"
        ).eq("user_id", str(user_id)).execute()

        # Sum message counts
        msg_response = self.supabase.table("conversations").select(
            "message_count"
        ).eq("user_id", str(user_id)).execute()

        total_messages = sum(c.get("message_count", 0) for c in msg_response.data)

        return {
            "conversation_count": conv_response.count or 0,
            "total_messages": total_messages,
        }


# SQL function for incrementing message count (to be added to migration)
INCREMENT_MESSAGE_COUNT_SQL = """
-- Function to increment conversation message count
CREATE OR REPLACE FUNCTION increment_message_count(conv_id UUID)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
    UPDATE conversations
    SET message_count = message_count + 1,
        updated_at = NOW()
    WHERE id = conv_id;
END;
$$;
"""
