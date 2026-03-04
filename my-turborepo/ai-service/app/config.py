from pydantic_settings import BaseSettings
from typing import Optional


class Settings(BaseSettings):
    # Database
    database_url: str  # postgresql+asyncpg://...
    database_url_sync: Optional[str] = None  # postgresql://... for scripts

    # Redis
    redis_url: str = "redis://localhost:6379"

    # Embedding model
    embedding_model: str = "paraphrase-multilingual-MiniLM-L12-v2"
    embedding_dimension: int = 384

    # Search defaults
    default_top_k: int = 10
    default_threshold: float = 0.3

    # Cache TTL (seconds)
    embedding_cache_ttl: int = 3600
    query_cache_ttl: int = 300

    # OCR Configuration (Component 10)
    tesseract_cmd: str = "/usr/bin/tesseract"  # Override for local dev on macOS/Windows
    ocr_language: str = "spa+eng"  # Tesseract language codes (Spanish primary, English fallback)
    max_image_size: int = 4096  # Max dimension in pixels before resizing
    ocr_dpi: int = 300  # DPI for PDF-to-image conversion
    ocr_cache_ttl: int = 86400  # Cache OCR results 24 hours
    max_file_size_mb: int = 10  # Reject files larger than this

    class Config:
        env_file = ".env"
        extra = "ignore"


settings = Settings()
