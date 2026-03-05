"""
Conversation and chat models for the Tax Assistant (Component 11).
"""

from pydantic import BaseModel, Field, field_validator
from typing import Optional, Literal
from datetime import datetime
from enum import Enum


class MessageRole(str, Enum):
    """Role of a message in a conversation."""
    USER = "user"
    ASSISTANT = "assistant"
    SYSTEM = "system"


class ChatMessage(BaseModel):
    """A single message in a conversation."""
    role: MessageRole
    content: str
    created_at: Optional[datetime] = None
    metadata: dict = Field(default_factory=dict)

    class Config:
        use_enum_values = True


class ConversationContext(BaseModel):
    """
    User-specific context passed with each chat request.
    Allows the LLM to give personalized answers based on the user's
    actual organization data.
    """
    organization_id: Optional[str] = None
    organization_name: Optional[str] = None
    tax_regime: Optional[str] = None  # e.g., "601" (General de Ley)
    rfc: Optional[str] = None
    user_role: Optional[str] = None  # 'owner', 'admin', 'accountant'
    # Optional business metrics for context-aware answers
    monthly_revenue_approx: Optional[float] = None
    employee_count_approx: Optional[int] = None


class ChatRequest(BaseModel):
    """Request model for chat endpoint."""
    message: str = Field(..., min_length=1, max_length=2000)
    conversation_id: Optional[str] = None  # None = start new conversation
    context: Optional[ConversationContext] = None
    stream: bool = False

    @field_validator('message')
    @classmethod
    def message_not_empty(cls, v: str) -> str:
        """Validate message is not just whitespace."""
        if not v.strip():
            raise ValueError('Message cannot be empty or whitespace only')
        return v


class RAGSource(BaseModel):
    """A retrieved knowledge base document used in the response."""
    doc_id: str
    section_title: Optional[str] = None
    source_file: str
    similarity_score: float = Field(ge=0.0, le=1.0)
    excerpt: str  # First 200 chars of content

    class Config:
        json_schema_extra = {
            "example": {
                "doc_id": "tax_guide_iva_section_1",
                "section_title": "IVA - Impuesto al Valor Agregado",
                "source_file": "tax_guide.md",
                "similarity_score": 0.87,
                "excerpt": "El IVA (Impuesto al Valor Agregado) en México tiene tres tasas principales..."
            }
        }


class ChatResponse(BaseModel):
    """Response model for chat endpoint."""
    conversation_id: str
    message_id: str
    content: str
    role: MessageRole = MessageRole.ASSISTANT
    rag_sources: list[RAGSource] = Field(default_factory=list)
    model_used: str  # "llama3.1" or "gpt-4o-mini"
    tokens_used: Optional[int] = None
    confidence: float = Field(ge=0.0, le=1.0)  # Estimated answer confidence
    requires_professional_advice: bool = False  # True if question exceeds chatbot scope
    created_at: datetime

    class Config:
        use_enum_values = True


class StreamChunk(BaseModel):
    """A chunk of streamed response."""
    type: Literal["chunk", "done", "error"]
    content: Optional[str] = None
    # Final metadata (only present when type="done")
    conversation_id: Optional[str] = None
    message_id: Optional[str] = None
    rag_sources: Optional[list[RAGSource]] = None
    model_used: Optional[str] = None
    confidence: Optional[float] = None
    requires_professional_advice: Optional[bool] = None
    error_message: Optional[str] = None


class ConversationSummary(BaseModel):
    """Summary view of a conversation for listing."""
    conversation_id: str
    title: Optional[str] = None
    message_count: int
    created_at: datetime
    updated_at: datetime


class ConversationHistory(BaseModel):
    """Full conversation with message history."""
    conversation_id: str
    title: Optional[str] = None
    messages: list[ChatMessage]
    summary: Optional[str] = None  # Present for long conversations


class ConversationCreate(BaseModel):
    """Request model for creating a new conversation."""
    organization_id: Optional[str] = None
    title: Optional[str] = None


class KnowledgeBaseDocument(BaseModel):
    """A document in the knowledge base (for loading script)."""
    doc_id: str
    source_file: str
    section_title: Optional[str] = None
    content: str
    content_hash: str
    chunk_index: int = 0
    metadata: dict = Field(default_factory=dict)


class KnowledgeBaseStats(BaseModel):
    """Statistics about the knowledge base."""
    total_documents: int
    total_chunks: int
    source_files: list[str]
    last_updated: Optional[datetime] = None
