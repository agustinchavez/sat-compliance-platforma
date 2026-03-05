"""
Pytest configuration and fixtures for SAT AI Service tests.
"""

import asyncio
from typing import AsyncGenerator, Generator
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
import pytest_asyncio
from fastapi.testclient import TestClient
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker

# Mock settings before importing app
import os
os.environ["DATABASE_URL"] = "postgresql+asyncpg://test:test@localhost:5432/test"
os.environ["REDIS_URL"] = "redis://localhost:6379"

from app.main import app
from app.database import get_db
from app.models.sat_code import Base
from app.services.embedding import EmbeddingService
from app.services.vector_search import VectorSearchService
from app.dependencies import get_embedding_service, get_vector_search


# ============================================================================
# Event Loop Fixture
# ============================================================================

@pytest.fixture(scope="session")
def event_loop() -> Generator:
    """Create an event loop for the test session."""
    loop = asyncio.get_event_loop_policy().new_event_loop()
    yield loop
    loop.close()


# ============================================================================
# Mock Embedding Service
# ============================================================================

class MockEmbeddingService:
    """Mock embedding service that returns deterministic 384-dim vectors."""

    _instance = None

    def __init__(self):
        self._model_loaded = True
        self._redis_client = None
        self._redis_available = False

    @classmethod
    async def get_instance(cls) -> "MockEmbeddingService":
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    def is_model_loaded(self) -> bool:
        return self._model_loaded

    def get_model(self):
        return MagicMock()

    async def generate_embedding(self, text: str) -> list[float]:
        """Generate deterministic embedding based on text hash."""
        import hashlib
        hash_val = int(hashlib.md5(text.encode()).hexdigest(), 16)
        # Generate deterministic 384-dim vector
        return [(hash_val * (i + 1) % 1000) / 1000.0 for i in range(384)]

    async def generate_batch_embeddings(
        self, texts: list[str], batch_size: int = 64
    ) -> list[list[float]]:
        """Generate batch embeddings."""
        return [await self.generate_embedding(t) for t in texts]

    def generate_batch_embeddings_sync(
        self, texts: list[str], batch_size: int = 64
    ) -> list[list[float]]:
        """Synchronous version."""
        import hashlib
        embeddings = []
        for text in texts:
            hash_val = int(hashlib.md5(text.encode()).hexdigest(), 16)
            embedding = [(hash_val * (i + 1) % 1000) / 1000.0 for i in range(384)]
            embeddings.append(embedding)
        return embeddings


@pytest.fixture
def mock_embedding_service() -> MockEmbeddingService:
    """Provide mock embedding service."""
    return MockEmbeddingService()


# ============================================================================
# Mock Database Session
# ============================================================================

@pytest.fixture
def mock_db_session() -> AsyncMock:
    """Create a mock database session."""
    session = AsyncMock(spec=AsyncSession)
    return session


@pytest.fixture
def mock_vector_search(mock_db_session, mock_embedding_service) -> VectorSearchService:
    """Create a mock vector search service."""
    return VectorSearchService(mock_db_session, mock_embedding_service)


# ============================================================================
# Test Client with Mocked Dependencies
# ============================================================================

@pytest.fixture
def test_client(mock_embedding_service, mock_db_session) -> TestClient:
    """Create a test client with mocked dependencies."""

    async def override_get_db():
        yield mock_db_session

    async def override_get_embedding_service():
        return mock_embedding_service

    async def override_get_vector_search():
        return VectorSearchService(mock_db_session, mock_embedding_service)

    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[get_embedding_service] = override_get_embedding_service
    app.dependency_overrides[get_vector_search] = override_get_vector_search

    with TestClient(app) as client:
        yield client

    app.dependency_overrides.clear()


# ============================================================================
# Sample Data Fixtures
# ============================================================================

@pytest.fixture
def sample_sat_codes() -> list[dict]:
    """Sample SAT product codes for testing."""
    return [
        {
            "code": "43211503",
            "name": "Computadoras portátiles",
            "description": "Laptops y notebooks",
            "division": "43",
        },
        {
            "code": "81112100",
            "name": "Servicios de consultoría en sistemas de información",
            "description": "Consultoría IT",
            "division": "81",
        },
        {
            "code": "44121600",
            "name": "Suministros de oficina",
            "description": "Papelería y artículos de oficina",
            "division": "44",
        },
        {
            "code": "50202300",
            "name": "Café",
            "description": "Café y productos de café",
            "division": "50",
        },
        {
            "code": "80141600",
            "name": "Servicios de mercadotecnia",
            "description": "Marketing y publicidad",
            "division": "80",
        },
    ]


@pytest.fixture
def sample_embeddings() -> list[list[float]]:
    """Sample embeddings for testing (384 dimensions)."""
    import random
    random.seed(42)  # Deterministic for testing
    return [[random.random() for _ in range(384)] for _ in range(5)]


# ============================================================================
# Mock Redis Fixture
# ============================================================================

@pytest.fixture
def mock_redis():
    """Create a mock Redis client."""
    redis_mock = AsyncMock()
    redis_mock.get.return_value = None
    redis_mock.setex.return_value = True
    redis_mock.ping.return_value = True
    return redis_mock


# ============================================================================
# OCR Sample Data Fixtures (Component 10)
# ============================================================================

SAMPLE_RECEIPT_TEXT = """
OXXO
RFC: OXX950901G45
AV. REFORMA 222 COL. JUAREZ
CP 06600 CDMX
TEL: 555-123-4567

FECHA: 15/03/2024 14:32
TICKET: 123456

COCA COLA 600ML          $25.00
SABRITAS ORIGINAL        $18.50
GANSITO MARINELA         $12.00

SUBTOTAL:               $55.50
IVA 16%:                 $8.88
TOTAL:                  $64.38

PAGO EFECTIVO:         $100.00
CAMBIO:                 $35.62

GRACIAS POR SU COMPRA
"""

SAMPLE_FORMAL_INVOICE_TEXT = """
FACTURA ELECTRÓNICA

EMISOR:
COMPAÑÍA TECNOLÓGICA SA DE CV
RFC: CTE180301AB9
AV. INSURGENTES SUR 1234, PISO 5
COL. DEL VALLE, CP 03100
CIUDAD DE MEXICO, CDMX

RECEPTOR:
CLIENTE EJEMPLO SA DE CV
RFC: CEJ190501XYZ
CALLE PRINCIPAL 567
COL. CENTRO, CP 64000
MONTERREY, NL

FOLIO: A-2024-001234
FECHA DE EMISIÓN: 2024-03-15

CONCEPTO                          CANTIDAD    PRECIO     IMPORTE
SERVICIO DE CONSULTORÍA IT           40      $1,500.00   $60,000.00
LICENCIA SOFTWARE ANUAL               1     $25,000.00   $25,000.00

SUBTOTAL:                                               $85,000.00
IVA (16%):                                              $13,600.00
TOTAL:                                                  $98,600.00

FORMA DE PAGO: TRANSFERENCIA BANCARIA
USO CFDI: G03 - GASTOS EN GENERAL

SELLO DIGITAL DEL SAT
"""


@pytest.fixture
def sample_receipt_text() -> str:
    """Sample receipt text for OCR extraction testing."""
    return SAMPLE_RECEIPT_TEXT


@pytest.fixture
def sample_formal_invoice_text() -> str:
    """Sample formal invoice text for OCR extraction testing."""
    return SAMPLE_FORMAL_INVOICE_TEXT


@pytest.fixture
def sample_receipt_with_usd() -> str:
    """Sample receipt text with USD currency."""
    return """
DUTY FREE STORE
RFC: DFS010101ABC

PERFUME CHANNEL          USD 125.00
CHOCOLATES               USD  45.50

SUBTOTAL:               USD 170.50
IVA:                    USD  27.28
TOTAL:                  USD 197.78

PAYMENT: CREDIT CARD
"""


@pytest.fixture
def sample_receipt_minimal() -> str:
    """Minimal receipt with basic info."""
    return """
TIENDA LOCAL
TOTAL: $150.00
FECHA: 01-ENE-2024
"""


# ============================================================================
# Tax Assistant Chatbot Fixtures (Component 11)
# ============================================================================

from app.config import Settings
from app.models.conversation import (
    ChatMessage,
    ChatRequest,
    ConversationContext,
    ConversationHistory,
    MessageRole,
    RAGSource,
)


@pytest.fixture
def chatbot_settings() -> Settings:
    """Create settings for chatbot testing."""
    return Settings(
        supabase_url="http://localhost:54321",
        supabase_service_key="test-service-key",
        ollama_base_url="http://localhost:11434",
        ollama_model="llama3.1",
        openai_api_key="test-openai-key",
        openai_model="gpt-4o-mini",
        llm_temperature=0.3,
        llm_max_tokens=1024,
        rag_top_k=5,
        rag_similarity_threshold=0.4,
        max_conversation_history=20,
        conversation_summary_threshold=15,
        conversation_ttl_days=30,
        internal_api_key="test-internal-key",
    )


@pytest.fixture
def sample_conversation_context() -> ConversationContext:
    """Sample conversation context for testing."""
    return ConversationContext(
        organization_name="Mi Empresa SA de CV",
        tax_regime="601",
        rfc="MIE180301AB9",
        user_role="admin",
        monthly_revenue_approx=500000,
        employee_count_approx=25,
    )


@pytest.fixture
def sample_chat_history() -> list[ChatMessage]:
    """Sample conversation history for testing."""
    return [
        ChatMessage(
            role=MessageRole.USER,
            content="¿Cuáles son las tasas del IVA en México?",
        ),
        ChatMessage(
            role=MessageRole.ASSISTANT,
            content="Las tasas del IVA en México son: 16% tasa general, 8% zona fronteriza, y 0% para alimentos y medicinas.",
        ),
        ChatMessage(
            role=MessageRole.USER,
            content="¿Cómo calculo el IVA a pagar?",
        ),
        ChatMessage(
            role=MessageRole.ASSISTANT,
            content="El IVA a pagar se calcula como: IVA cobrado - IVA acreditable.",
        ),
    ]


@pytest.fixture
def sample_rag_sources() -> list[RAGSource]:
    """Sample RAG sources for testing."""
    return [
        RAGSource(
            doc_id="tax_guide_iva_tasas_0",
            section_title="Tasas de IVA",
            similarity_score=0.92,
        ),
        RAGSource(
            doc_id="tax_guide_iva_calculo_0",
            section_title="Cálculo del IVA",
            similarity_score=0.85,
        ),
    ]


@pytest.fixture
def sample_knowledge_base_docs() -> list[dict]:
    """Sample knowledge base documents for testing."""
    return [
        {
            "doc_id": "tax_guide_iva_tasas_0",
            "source_file": "tax_guide.md",
            "section_title": "Tasas de IVA",
            "content": "El IVA en México tiene las siguientes tasas: 16% tasa general, 8% zona fronteriza, 0% alimentos y medicinas.",
            "content_hash": "abc123",
            "chunk_index": 0,
            "metadata": {"topics": ["IVA", "tasas"]},
        },
        {
            "doc_id": "tax_guide_iva_calculo_0",
            "source_file": "tax_guide.md",
            "section_title": "Cálculo del IVA",
            "content": "IVA a pagar = IVA cobrado - IVA acreditable. Ejemplo: Ventas $100,000 con IVA cobrado $16,000.",
            "content_hash": "def456",
            "chunk_index": 0,
            "metadata": {"topics": ["IVA", "cálculo"]},
        },
        {
            "doc_id": "cfdi_guide_types_0",
            "source_file": "cfdi_guide.md",
            "section_title": "Tipos de CFDI",
            "content": "Los tipos de CFDI son: Ingreso (I), Egreso (E), Traslado (T), Nómina (N), Pago (P).",
            "content_hash": "ghi789",
            "chunk_index": 0,
            "metadata": {"topics": ["CFDI", "tipos"]},
        },
    ]


@pytest.fixture
def mock_llm_response() -> tuple[str, str, int]:
    """Mock LLM response tuple (content, model, tokens)."""
    return (
        "El IVA general en México es del 16%. Las tasas reducidas incluyen 8% para zona fronteriza y 0% para alimentos y medicinas básicas.",
        "llama3.1",
        85,
    )


@pytest.fixture
def sample_chat_request() -> ChatRequest:
    """Sample chat request for testing."""
    return ChatRequest(
        message="¿Cuánto es el IVA en México?",
        conversation_id=None,
        context=ConversationContext(
            organization_name="Mi Empresa",
            tax_regime="601",
        ),
    )


@pytest.fixture
def valid_auth_headers() -> dict[str, str]:
    """Valid authentication headers for API testing."""
    return {
        "X-User-Id": "550e8400-e29b-41d4-a716-446655440000",
        "X-Internal-Key": "test-internal-key",
    }
