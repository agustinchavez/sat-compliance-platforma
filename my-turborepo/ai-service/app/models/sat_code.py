from sqlalchemy import Column, String, Text
from sqlalchemy.orm import DeclarativeBase
from pgvector.sqlalchemy import Vector
from pydantic import BaseModel, Field
from typing import Optional, Literal


class Base(DeclarativeBase):
    pass


class SATCode(Base):
    """SQLAlchemy ORM model for sat_product_codes table."""
    __tablename__ = "sat_product_codes"

    code = Column(String(8), primary_key=True)
    name = Column(String(500), nullable=False)
    description = Column(Text, nullable=True)
    division = Column(String(2), nullable=True)
    embedding = Column(Vector(384), nullable=True)  # Added by Component 9


class SATUnitCode(Base):
    """SQLAlchemy ORM model for sat_unit_codes table."""
    __tablename__ = "sat_unit_codes"

    code = Column(String(10), primary_key=True)
    name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    symbol = Column(String(20), nullable=True)


# Pydantic models for API requests/responses

class SATCodeResponse(BaseModel):
    """Response model for a single SAT code."""
    code: str
    name: str
    description: Optional[str] = None
    division: Optional[str] = None
    similarity_score: Optional[float] = None

    class Config:
        from_attributes = True


class SearchRequest(BaseModel):
    """Request model for SAT code search."""
    query: str = Field(..., min_length=1, max_length=500)
    top_k: int = Field(default=10, ge=1, le=50)
    threshold: float = Field(default=0.3, ge=0.0, le=1.0)
    category: Optional[str] = Field(default=None, description="Division filter (2-char code)")


class SearchResponse(BaseModel):
    """Response model for SAT code search results."""
    results: list[SATCodeResponse]
    query: str
    total: int
    search_type: Literal["semantic", "fulltext", "hybrid"]


class HealthResponse(BaseModel):
    """Response model for health check endpoint."""
    status: str
    embedding_model_loaded: bool
    database_connected: bool
    redis_connected: bool
    total_sat_codes: int
    codes_with_embeddings: int
    tesseract_available: bool = False
    tesseract_version: Optional[str] = None
    # Assistant health (Component 11)
    ollama_available: bool = False
    openai_configured: bool = False
    knowledge_base_documents: int = 0
