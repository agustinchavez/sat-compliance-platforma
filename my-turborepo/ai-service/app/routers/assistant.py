"""
Tax Assistant API Router (Component 11).

Provides chat endpoints for the tax assistant chatbot.
Supports both streaming (SSE) and non-streaming responses.
"""

import json
import logging
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Header
from fastapi.responses import StreamingResponse

from app.config import Settings, get_settings
from app.models.conversation import (
    ChatRequest,
    ChatResponse,
    ConversationHistory,
    ConversationSummary,
    MessageRole,
    StreamChunk,
)
from app.services.conversation import ConversationManager
from app.services.embedding import EmbeddingService
from app.services.llm import LLMService
from app.services.rag import RAGService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/assistant", tags=["assistant"])


# Dependency injection
def get_llm_service(settings: Settings = Depends(get_settings)) -> LLMService:
    """Get LLM service instance."""
    return LLMService(settings)


def get_embedding_service(settings: Settings = Depends(get_settings)) -> EmbeddingService:
    """Get embedding service instance."""
    return EmbeddingService(settings)


def get_rag_service(
    settings: Settings = Depends(get_settings),
    embedding_service: EmbeddingService = Depends(get_embedding_service),
) -> RAGService:
    """Get RAG service instance."""
    return RAGService(settings, embedding_service)


def get_conversation_manager(
    settings: Settings = Depends(get_settings),
) -> ConversationManager:
    """Get conversation manager instance."""
    return ConversationManager(settings)


async def verify_internal_auth(
    x_user_id: str = Header(..., alias="X-User-Id"),
    x_internal_key: str = Header(..., alias="X-Internal-Key"),
    settings: Settings = Depends(get_settings),
) -> UUID:
    """
    Verify internal service authentication.

    Requires:
    - X-User-Id: User UUID from the calling service
    - X-Internal-Key: Shared secret for service-to-service auth

    Returns:
        User UUID if authenticated

    Raises:
        HTTPException 401 if authentication fails
    """
    if x_internal_key != settings.internal_api_key:
        raise HTTPException(status_code=401, detail="Invalid internal API key")

    try:
        return UUID(x_user_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid user ID format")


# ============================================================================
# CHAT ENDPOINTS
# ============================================================================

@router.post("/chat", response_model=ChatResponse)
async def chat(
    request: ChatRequest,
    user_id: UUID = Depends(verify_internal_auth),
    llm_service: LLMService = Depends(get_llm_service),
    rag_service: RAGService = Depends(get_rag_service),
    conversation_manager: ConversationManager = Depends(get_conversation_manager),
) -> ChatResponse:
    """
    Send a message and get a response (non-streaming).

    Creates a new conversation if conversation_id is not provided.
    Stores messages in conversation history.
    Uses RAG to retrieve relevant tax knowledge.
    """
    try:
        # Get or create conversation
        conversation_id = request.conversation_id
        if not conversation_id:
            conversation_id = await conversation_manager.create_conversation(
                user_id=user_id,
                organization_id=request.context.organization_id if request.context else None,
            )
            is_new_conversation = True
        else:
            is_new_conversation = False

        # Get conversation history
        try:
            history = await conversation_manager.get_conversation_history(conversation_id)
            chat_history = history.messages
        except ValueError:
            # Conversation not found, create new one
            conversation_id = await conversation_manager.create_conversation(user_id=user_id)
            chat_history = []
            is_new_conversation = True

        # Store user message
        await conversation_manager.add_message(
            conversation_id=conversation_id,
            role=MessageRole.USER,
            content=request.message,
        )

        # Retrieve relevant context via RAG
        rag_context, rag_sources = await rag_service.retrieve_relevant_context(
            query=request.message,
        )

        # Generate response
        response_text, model_used, tokens_used = await llm_service.generate_response(
            user_message=request.message,
            history=chat_history,
            context=request.context,
            rag_context=rag_context,
        )

        # Calculate confidence and check for professional advice
        confidence = llm_service.estimate_confidence(response_text, rag_sources)
        requires_professional_advice = llm_service.requires_professional_advice(
            request.message, response_text
        )

        # Store assistant response with metadata
        await conversation_manager.store_message_with_metadata(
            conversation_id=conversation_id,
            role=MessageRole.ASSISTANT,
            content=response_text,
            model_used=model_used,
            tokens_used=tokens_used,
            confidence=confidence,
            rag_sources=rag_sources,
            requires_professional_advice=requires_professional_advice,
        )

        # Generate title for new conversations
        if is_new_conversation:
            title = await llm_service.generate_title(request.message)
            await conversation_manager.update_conversation_title(conversation_id, title)

        # Check if we should summarize (for long conversations)
        if await conversation_manager.should_summarize(conversation_id):
            history = await conversation_manager.get_conversation_history(conversation_id)
            summary = await llm_service.generate_summary(history.messages)
            if summary:
                await conversation_manager.update_conversation_summary(conversation_id, summary)

        return ChatResponse(
            message=response_text,
            conversation_id=conversation_id,
            sources=rag_sources,
            confidence=confidence,
            model_used=model_used,
            requires_professional_advice=requires_professional_advice,
        )

    except Exception as e:
        logger.error(f"Chat error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/chat/stream")
async def chat_stream(
    request: ChatRequest,
    user_id: UUID = Depends(verify_internal_auth),
    llm_service: LLMService = Depends(get_llm_service),
    rag_service: RAGService = Depends(get_rag_service),
    conversation_manager: ConversationManager = Depends(get_conversation_manager),
) -> StreamingResponse:
    """
    Send a message and stream the response (SSE).

    Returns Server-Sent Events with:
    - type: "chunk" - content chunks as they arrive
    - type: "done" - final message with metadata

    Creates a new conversation if conversation_id is not provided.
    """
    async def generate_stream():
        try:
            # Get or create conversation
            conversation_id = request.conversation_id
            if not conversation_id:
                conversation_id = await conversation_manager.create_conversation(
                    user_id=user_id,
                    organization_id=request.context.organization_id if request.context else None,
                )
                is_new_conversation = True
            else:
                is_new_conversation = False

            # Get conversation history
            try:
                history = await conversation_manager.get_conversation_history(conversation_id)
                chat_history = history.messages
            except ValueError:
                conversation_id = await conversation_manager.create_conversation(user_id=user_id)
                chat_history = []
                is_new_conversation = True

            # Store user message
            await conversation_manager.add_message(
                conversation_id=conversation_id,
                role=MessageRole.USER,
                content=request.message,
            )

            # Retrieve relevant context via RAG
            rag_context, rag_sources = await rag_service.retrieve_relevant_context(
                query=request.message,
            )

            # Stream response
            full_response = ""
            async for chunk in llm_service.stream_response(
                user_message=request.message,
                history=chat_history,
                context=request.context,
                rag_context=rag_context,
            ):
                full_response += chunk
                chunk_data = StreamChunk(
                    type="chunk",
                    content=chunk,
                    conversation_id=conversation_id,
                )
                yield f"data: {chunk_data.model_dump_json()}\n\n"

            # Calculate metadata
            confidence = llm_service.estimate_confidence(full_response, rag_sources)
            requires_professional_advice = llm_service.requires_professional_advice(
                request.message, full_response
            )

            # Determine model used (we don't know for sure with streaming, use primary)
            model_used = "llama3.1"  # or check ollama availability

            # Store assistant response
            await conversation_manager.store_message_with_metadata(
                conversation_id=conversation_id,
                role=MessageRole.ASSISTANT,
                content=full_response,
                model_used=model_used,
                confidence=confidence,
                rag_sources=rag_sources,
                requires_professional_advice=requires_professional_advice,
            )

            # Generate title for new conversations
            if is_new_conversation:
                title = await llm_service.generate_title(request.message)
                await conversation_manager.update_conversation_title(conversation_id, title)

            # Send final message with metadata
            final_chunk = StreamChunk(
                type="done",
                content="",
                conversation_id=conversation_id,
                sources=rag_sources,
                confidence=confidence,
                requires_professional_advice=requires_professional_advice,
            )
            yield f"data: {final_chunk.model_dump_json()}\n\n"

        except Exception as e:
            logger.error(f"Stream error: {e}", exc_info=True)
            error_chunk = StreamChunk(
                type="error",
                content=str(e),
            )
            yield f"data: {error_chunk.model_dump_json()}\n\n"

    return StreamingResponse(
        generate_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",  # Disable nginx buffering
        },
    )


# ============================================================================
# CONVERSATION MANAGEMENT ENDPOINTS
# ============================================================================

@router.get("/conversations", response_model=list[ConversationSummary])
async def list_conversations(
    limit: int = 20,
    offset: int = 0,
    user_id: UUID = Depends(verify_internal_auth),
    conversation_manager: ConversationManager = Depends(get_conversation_manager),
) -> list[ConversationSummary]:
    """
    List user's conversations.

    Returns most recent conversations first.
    """
    return await conversation_manager.get_user_conversations(
        user_id=user_id,
        limit=min(limit, 100),  # Cap at 100
        offset=offset,
    )


@router.get("/conversations/{conversation_id}", response_model=ConversationHistory)
async def get_conversation(
    conversation_id: UUID,
    user_id: UUID = Depends(verify_internal_auth),
    conversation_manager: ConversationManager = Depends(get_conversation_manager),
) -> ConversationHistory:
    """
    Get conversation history.

    Returns messages and metadata for a conversation.
    """
    try:
        history = await conversation_manager.get_conversation_history(conversation_id)

        # Verify ownership (basic check - could be more sophisticated)
        conv = await conversation_manager.get_conversation(conversation_id)
        if conv and UUID(conv["user_id"]) != user_id:
            raise HTTPException(status_code=403, detail="Access denied")

        return history

    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.delete("/conversations/{conversation_id}")
async def delete_conversation(
    conversation_id: UUID,
    user_id: UUID = Depends(verify_internal_auth),
    conversation_manager: ConversationManager = Depends(get_conversation_manager),
) -> dict:
    """
    Delete a conversation.

    Returns success status.
    """
    # Verify ownership
    conv = await conversation_manager.get_conversation(conversation_id)
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")
    if UUID(conv["user_id"]) != user_id:
        raise HTTPException(status_code=403, detail="Access denied")

    deleted = await conversation_manager.delete_conversation(conversation_id)
    return {"deleted": deleted, "conversation_id": str(conversation_id)}


@router.get("/conversations/{conversation_id}/stats")
async def get_conversation_stats(
    user_id: UUID = Depends(verify_internal_auth),
    conversation_manager: ConversationManager = Depends(get_conversation_manager),
) -> dict:
    """
    Get conversation statistics for the user.
    """
    return await conversation_manager.get_conversation_stats(user_id)


# ============================================================================
# HEALTH & UTILITY ENDPOINTS
# ============================================================================

@router.get("/health")
async def assistant_health(
    llm_service: LLMService = Depends(get_llm_service),
    rag_service: RAGService = Depends(get_rag_service),
) -> dict:
    """
    Check assistant service health.

    Returns status of LLM and knowledge base.
    """
    ollama_available = await llm_service.check_ollama_available()
    kb_health = await rag_service.check_knowledge_base_health()

    return {
        "status": "healthy" if ollama_available or llm_service._openai_client else "degraded",
        "llm": {
            "ollama_available": ollama_available,
            "openai_configured": llm_service._openai_client is not None,
        },
        "knowledge_base": kb_health,
    }
