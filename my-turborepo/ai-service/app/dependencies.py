from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.services.embedding import EmbeddingService
from app.services.vector_search import VectorSearchService


async def get_embedding_service() -> EmbeddingService:
    """FastAPI dependency for the embedding service."""
    return await EmbeddingService.get_instance()


async def get_vector_search(
    db: AsyncSession = Depends(get_db),
    embedding_service: EmbeddingService = Depends(get_embedding_service),
) -> VectorSearchService:
    """FastAPI dependency for the vector search service."""
    return VectorSearchService(db, embedding_service)
