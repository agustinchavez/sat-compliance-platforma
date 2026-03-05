"""
RAG Service for the Tax Assistant (Component 11).

Retrieves relevant knowledge base documents using semantic search
to augment LLM responses with accurate tax information.
"""

import logging
from typing import Optional

from app.config import Settings
from app.models.conversation import RAGSource
from app.services.embedding import EmbeddingService

logger = logging.getLogger(__name__)


class RAGService:
    """
    Retrieval-Augmented Generation service.

    Uses the existing EmbeddingService to:
    1. Embed user queries
    2. Search knowledge_base table for similar documents
    3. Format retrieved documents for LLM context
    """

    def __init__(self, settings: Settings, embedding_service: EmbeddingService):
        self.settings = settings
        self.embedding_service = embedding_service

    async def retrieve_relevant_context(
        self,
        query: str,
        top_k: Optional[int] = None,
        similarity_threshold: Optional[float] = None,
    ) -> tuple[str, list[RAGSource]]:
        """
        Retrieve relevant knowledge base documents for a query.

        Args:
            query: User's question or message
            top_k: Number of documents to retrieve (default from settings)
            similarity_threshold: Minimum similarity score (default from settings)

        Returns:
            Tuple of (formatted_context, sources)
            - formatted_context: String ready for LLM context injection
            - sources: List of RAGSource objects with metadata
        """
        top_k = top_k or self.settings.rag_top_k
        similarity_threshold = similarity_threshold or self.settings.rag_similarity_threshold

        try:
            # Get embedding for the query
            query_embedding = await self.embedding_service.embed_text(query)

            # Search knowledge base
            results = await self._search_knowledge_base(
                embedding=query_embedding,
                top_k=top_k,
                similarity_threshold=similarity_threshold,
            )

            if not results:
                logger.debug(f"No relevant documents found for query: {query[:50]}...")
                return "", []

            # Format context and sources
            context_parts = []
            sources = []

            for doc in results:
                # Add section header and content
                context_parts.append(f"### {doc['section_title']}\n{doc['content']}")

                # Track source for citation
                sources.append(RAGSource(
                    doc_id=doc["doc_id"],
                    section_title=doc["section_title"],
                    similarity_score=doc["similarity"],
                ))

            formatted_context = "\n\n---\n\n".join(context_parts)

            logger.info(
                f"Retrieved {len(sources)} relevant documents for query. "
                f"Top similarity: {sources[0].similarity_score:.3f}"
            )

            return formatted_context, sources

        except Exception as e:
            logger.error(f"RAG retrieval failed: {e}")
            return "", []

    async def _search_knowledge_base(
        self,
        embedding: list[float],
        top_k: int,
        similarity_threshold: float,
    ) -> list[dict]:
        """
        Search knowledge_base table using vector similarity.

        Uses pgvector's cosine distance operator (<=>).
        """
        from supabase import create_client

        supabase = create_client(
            self.settings.supabase_url,
            self.settings.supabase_service_key
        )

        # Use RPC function for vector search
        # This function should be created in the migration
        response = supabase.rpc(
            "search_knowledge_base",
            {
                "query_embedding": embedding,
                "match_threshold": similarity_threshold,
                "match_count": top_k,
            }
        ).execute()

        return response.data or []

    async def get_document_by_id(self, doc_id: str) -> Optional[dict]:
        """
        Retrieve a specific document by its ID.

        Useful for showing full source content when user wants to learn more.
        """
        from supabase import create_client

        supabase = create_client(
            self.settings.supabase_url,
            self.settings.supabase_service_key
        )

        response = supabase.table("knowledge_base").select(
            "doc_id, source_file, section_title, content, metadata"
        ).eq("doc_id", doc_id).execute()

        if response.data:
            return response.data[0]
        return None

    def format_sources_for_response(self, sources: list[RAGSource]) -> str:
        """
        Format RAG sources for inclusion in assistant response.

        Returns a formatted string listing the sources used.
        """
        if not sources:
            return ""

        source_lines = []
        for i, source in enumerate(sources, 1):
            confidence = "alta" if source.similarity_score >= 0.7 else "media"
            source_lines.append(
                f"{i}. {source.section_title} (confianza: {confidence})"
            )

        return "\n**Fuentes consultadas:**\n" + "\n".join(source_lines)

    async def check_knowledge_base_health(self) -> dict:
        """
        Check knowledge base status for health endpoint.

        Returns:
            Dict with document count and last update info
        """
        from supabase import create_client

        try:
            supabase = create_client(
                self.settings.supabase_url,
                self.settings.supabase_service_key
            )

            # Get document count
            count_response = supabase.table("knowledge_base").select(
                "doc_id", count="exact"
            ).execute()

            # Get latest update timestamp
            latest_response = supabase.table("knowledge_base").select(
                "updated_at"
            ).order("updated_at", desc=True).limit(1).execute()

            doc_count = count_response.count or 0
            last_updated = None
            if latest_response.data:
                last_updated = latest_response.data[0].get("updated_at")

            return {
                "status": "healthy" if doc_count > 0 else "empty",
                "document_count": doc_count,
                "last_updated": last_updated,
            }

        except Exception as e:
            logger.error(f"Knowledge base health check failed: {e}")
            return {
                "status": "error",
                "error": str(e),
            }


# SQL function for vector search (to be added to migration)
SEARCH_FUNCTION_SQL = """
-- Function to search knowledge base by vector similarity
CREATE OR REPLACE FUNCTION search_knowledge_base(
    query_embedding vector(384),
    match_threshold float DEFAULT 0.4,
    match_count int DEFAULT 5
)
RETURNS TABLE (
    doc_id text,
    source_file text,
    section_title text,
    content text,
    metadata jsonb,
    similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT
        kb.doc_id,
        kb.source_file,
        kb.section_title,
        kb.content,
        kb.metadata,
        1 - (kb.embedding <=> query_embedding) AS similarity
    FROM knowledge_base kb
    WHERE 1 - (kb.embedding <=> query_embedding) > match_threshold
    ORDER BY kb.embedding <=> query_embedding
    LIMIT match_count;
END;
$$;
"""
