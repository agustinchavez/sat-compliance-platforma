from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
import redis.asyncio as redis
import subprocess

from app.database import get_db
from app.config import settings
from app.models.sat_code import HealthResponse
from app.services.embedding import EmbeddingService
from app.services.vector_search import VectorSearchService
from app.dependencies import get_embedding_service, get_vector_search

router = APIRouter(tags=["Health"])


def _check_tesseract() -> tuple[bool, str]:
    """Check if Tesseract OCR is available."""
    try:
        result = subprocess.run(
            [settings.tesseract_cmd, '--version'],
            capture_output=True,
            text=True,
            timeout=5
        )
        if result.returncode == 0:
            version = result.stdout.split('\n')[0] if result.stdout else "unknown"
            return True, version
        return False, "not found"
    except Exception as e:
        return False, str(e)


@router.get("/health", response_model=HealthResponse)
async def health_check(
    db: AsyncSession = Depends(get_db),
    embedding_service: EmbeddingService = Depends(get_embedding_service),
    vector_search: VectorSearchService = Depends(get_vector_search),
) -> HealthResponse:
    """
    Returns service health including:
    - embedding model loaded status
    - database connectivity
    - Redis connectivity
    - total SAT codes indexed
    - total codes with embeddings
    """
    # Check embedding model
    model_loaded = embedding_service.is_model_loaded()

    # Check database connectivity
    db_connected = False
    total_sat_codes = 0
    codes_with_embeddings = 0

    try:
        stats = await vector_search.get_stats()
        total_sat_codes = stats["total_sat_codes"]
        codes_with_embeddings = stats["codes_with_embeddings"]
        db_connected = True
    except Exception:
        db_connected = False

    # Check Redis connectivity
    redis_connected = False
    try:
        redis_client = redis.from_url(settings.redis_url)
        await redis_client.ping()
        redis_connected = True
        await redis_client.close()
    except Exception:
        redis_connected = False

    # Check Tesseract OCR availability
    tesseract_available, tesseract_version = _check_tesseract()

    # Determine overall status
    if model_loaded and db_connected:
        status = "healthy"
    elif model_loaded:
        status = "degraded"
    else:
        status = "unhealthy"

    return HealthResponse(
        status=status,
        embedding_model_loaded=model_loaded,
        database_connected=db_connected,
        redis_connected=redis_connected,
        total_sat_codes=total_sat_codes,
        codes_with_embeddings=codes_with_embeddings,
        tesseract_available=tesseract_available,
        tesseract_version=tesseract_version,
    )


@router.get("/health/ready")
async def readiness_check(
    embedding_service: EmbeddingService = Depends(get_embedding_service),
) -> dict:
    """Simple readiness check - returns 200 if model is loaded."""
    if embedding_service.is_model_loaded():
        return {"ready": True}
    return {"ready": False}


@router.get("/health/live")
async def liveness_check() -> dict:
    """Simple liveness check - always returns 200."""
    return {"alive": True}
