from fastapi import FastAPI
from contextlib import asynccontextmanager
from app.routers import sat_search, health, ocr
from app.services.embedding import EmbeddingService
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Pre-load embedding model on startup."""
    logger.info("Starting SAT AI Search Service...")
    logger.info("Loading embedding model (this may take a moment on first run)...")
    await EmbeddingService.get_instance()
    logger.info("Embedding model loaded successfully!")
    yield
    logger.info("Shutting down SAT AI Search Service...")


app = FastAPI(
    title="SAT AI Search Service",
    description="Multilingual semantic search for SAT product/service codes and Receipt OCR",
    version="1.1.0",
    lifespan=lifespan,
)

app.include_router(health.router)
app.include_router(sat_search.router, prefix="/api/v1")
app.include_router(ocr.router, prefix="/api/v1")
