from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_embedding_service, get_vector_search
from app.models.sat_code import (
    SearchRequest,
    SearchResponse,
    SATCodeResponse,
)
from app.services.embedding import EmbeddingService
from app.services.vector_search import VectorSearchService

router = APIRouter(tags=["SAT Search"])


@router.post("/sat/search", response_model=SearchResponse)
async def search_sat_code(
    request: SearchRequest,
    db: AsyncSession = Depends(get_db),
    embedding_service: EmbeddingService = Depends(get_embedding_service),
    vector_search: VectorSearchService = Depends(get_vector_search),
) -> SearchResponse:
    """
    Primary endpoint. Accepts a free-text query (Spanish or English),
    generates an embedding, runs hybrid search, returns ranked results.

    Example request:
    ```json
    {
      "query": "servicio de consultoría IT",
      "top_k": 5,
      "threshold": 0.35
    }
    ```

    Example response:
    ```json
    {
      "results": [
        {
          "code": "81112100",
          "name": "Servicios de consultoría en sistemas de información",
          "description": "...",
          "division": "81",
          "similarity_score": 0.89
        }
      ],
      "query": "servicio de consultoría IT",
      "total": 1,
      "search_type": "semantic"
    }
    ```
    """
    # Generate embedding for the query
    embedding = await embedding_service.generate_embedding(request.query)

    # Run hybrid search (with optional category filter)
    if request.category:
        results = await vector_search.search_with_filters(
            embedding=embedding,
            filters={"division": request.category},
            top_k=request.top_k,
            threshold=request.threshold,
        )
        search_type = "semantic"

        # Fallback to full-text if no results
        if len(results) < request.top_k // 2:
            fulltext_results = await vector_search.fulltext_fallback(
                request.query, request.top_k
            )
            if len(results) == 0:
                search_type = "fulltext"
                results = fulltext_results
            elif fulltext_results:
                search_type = "hybrid"
                seen_codes = {r.code for r in results}
                for ft_result in fulltext_results:
                    if ft_result.code not in seen_codes and len(results) < request.top_k:
                        results.append(ft_result)
    else:
        results, search_type = await vector_search.hybrid_search(
            query=request.query,
            embedding=embedding,
            top_k=request.top_k,
            threshold=request.threshold,
        )

    return SearchResponse(
        results=results,
        query=request.query,
        total=len(results),
        search_type=search_type,
    )


@router.get("/sat/search/category/{category}", response_model=SearchResponse)
async def search_by_category(
    category: str,
    query: str = Query(..., min_length=1, max_length=500),
    top_k: int = Query(default=10, ge=1, le=50),
    threshold: float = Query(default=0.3, ge=0.0, le=1.0),
    db: AsyncSession = Depends(get_db),
    embedding_service: EmbeddingService = Depends(get_embedding_service),
    vector_search: VectorSearchService = Depends(get_vector_search),
) -> SearchResponse:
    """
    Search within a specific SAT division/category.
    `category` is a 2-character division code (e.g., "81" for services).
    """
    # Generate embedding
    embedding = await embedding_service.generate_embedding(query)

    # Search with division filter
    results = await vector_search.search_with_filters(
        embedding=embedding,
        filters={"division": category},
        top_k=top_k,
        threshold=threshold,
    )

    search_type = "semantic"

    # Fallback if needed
    if len(results) < top_k // 2:
        fulltext_results = await vector_search.fulltext_fallback(query, top_k)
        # Filter by category
        filtered_fulltext = [r for r in fulltext_results if r.division == category]

        if len(results) == 0 and filtered_fulltext:
            search_type = "fulltext"
            results = filtered_fulltext
        elif filtered_fulltext:
            search_type = "hybrid"
            seen_codes = {r.code for r in results}
            for ft_result in filtered_fulltext:
                if ft_result.code not in seen_codes and len(results) < top_k:
                    results.append(ft_result)

    return SearchResponse(
        results=results,
        query=query,
        total=len(results),
        search_type=search_type,
    )


@router.get("/sat/code/{code}", response_model=SATCodeResponse)
async def get_code_details(
    code: str,
    db: AsyncSession = Depends(get_db),
    embedding_service: EmbeddingService = Depends(get_embedding_service),
    vector_search: VectorSearchService = Depends(get_vector_search),
) -> SATCodeResponse:
    """
    Get full details for a specific SAT code.
    Returns 404 if code does not exist.
    """
    result = await vector_search.get_code_by_id(code)

    if not result:
        raise HTTPException(status_code=404, detail=f"SAT code '{code}' not found")

    return result


@router.get("/sat/similar/{code}", response_model=SearchResponse)
async def get_similar_codes(
    code: str,
    top_k: int = Query(default=5, ge=1, le=20),
    db: AsyncSession = Depends(get_db),
    embedding_service: EmbeddingService = Depends(get_embedding_service),
    vector_search: VectorSearchService = Depends(get_vector_search),
) -> SearchResponse:
    """
    Returns SAT codes semantically similar to the given code.
    Useful for suggesting alternative categorizations.
    """
    # First verify the code exists
    original = await vector_search.get_code_by_id(code)
    if not original:
        raise HTTPException(status_code=404, detail=f"SAT code '{code}' not found")

    results = await vector_search.get_similar_codes(code, top_k)

    return SearchResponse(
        results=results,
        query=f"similar to {code}",
        total=len(results),
        search_type="semantic",
    )
