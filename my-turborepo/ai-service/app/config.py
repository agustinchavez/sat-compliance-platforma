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

    # LLM Configuration (Component 11)
    ollama_base_url: str = "http://localhost:11434"
    ollama_model: str = "llama3.1"  # Primary model (local, zero cost)
    ollama_timeout_seconds: int = 60
    openai_api_key: Optional[str] = None  # Optional fallback
    openai_model: str = "gpt-4o-mini"  # Fallback model
    llm_temperature: float = 0.3  # Lower = more factual responses
    llm_max_tokens: int = 1024

    # RAG Configuration (Component 11)
    rag_top_k: int = 5  # Retrieved docs per query
    rag_similarity_threshold: float = 0.4  # Min similarity for doc retrieval
    knowledge_base_dir: str = "app/knowledge"  # Path to .md knowledge files

    # Conversation Configuration (Component 11)
    max_conversation_history: int = 20  # Messages to keep in context
    conversation_summary_threshold: int = 15  # Summarize after this many messages
    conversation_ttl_days: int = 30  # Days before conversation expires

    # Internal Service Authentication (Component 11)
    internal_api_key: str = "change-me-in-production"
    allow_jwt_auth: bool = False  # Enable for local dev/testing

    class Config:
        env_file = ".env"
        extra = "ignore"


settings = Settings()


def get_settings() -> Settings:
    """Get settings instance (for dependency injection)."""
    return settings
