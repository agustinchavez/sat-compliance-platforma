# Component 9: SAT Code Search Service (AI-Powered)

## ✅ WHAT'S ALREADY BUILT

### Components 1-8 Complete ✓

- ✅ Authentication (Component 01) — Supabase-based auth, JWT sessions
- ✅ Role-Based Access Control (Component 02) — Redis-cached RBAC
- ✅ Multi-Tenant Context Manager (Component 03) — org isolation, RLS
- ✅ Organization Service (Component 04) — encrypted CFDI certificate storage
- ✅ Team Management Service (Component 05) — multi-org membership
- ✅ Customer Service (Component 06) — RFC validation, SAT catalogs
- ✅ RFC Validation Service (Component 07) — SAT SOAP integration
- ✅ Product/Service Management (Component 08) — full catalog with SAT code fields

### Relevant Context for This Component

**Existing Database Tables (from Component 08 migration):**

```sql
-- Already exists — sat_product_codes table with full-text search
CREATE TABLE sat_product_codes (
  code VARCHAR(8) PRIMARY KEY,
  name VARCHAR(500) NOT NULL,
  description TEXT,
  division VARCHAR(2),
  search_vector tsvector GENERATED ALWAYS AS (
    to_tsvector('spanish', name || ' ' || COALESCE(description, ''))
  ) STORED
);

CREATE INDEX idx_sat_product_codes_search ON sat_product_codes USING gin(search_vector);
CREATE INDEX idx_sat_product_codes_division ON sat_product_codes(division);

-- Already exists — sat_unit_codes table
CREATE TABLE sat_unit_codes (
  code VARCHAR(10) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  symbol VARCHAR(20)
);
```

**Products table already has SAT code fields:**
```sql
sat_product_code VARCHAR(8) NOT NULL,   -- ClaveProdServ
sat_product_name VARCHAR(500),
sat_unit_code VARCHAR(10) NOT NULL,     -- ClaveUnidad
sat_unit_name VARCHAR(255),
```

**Product Service already has basic SAT code text search:**
```typescript
// From apps/web/lib/products/service.ts (Component 08)
const suggestions = await suggestSATCode("laptop computadora portátil");
// → [{ code: '43211503', name: 'Computadoras portátiles', score: 0.95 }]
```

This Component 9 **upgrades** that basic text search with a full AI-powered Python microservice using semantic embeddings and vector similarity. The Next.js app will call this service via HTTP for intelligent suggestions.

### Tech Stack

- **AI Microservice:** Python FastAPI (new service: `ai-service/`)
- **Embeddings:** `sentence-transformers` library, multilingual model (`paraphrase-multilingual-MiniLM-L12-v2`)
- **Vector Storage:** PostgreSQL with `pgvector` extension (already enabled on Supabase)
- **Database:** Same PostgreSQL instance used by the Next.js app
- **Cache:** Redis for embedding cache and frequent query results
- **Testing:** pytest with pytest-asyncio
- **Containerization:** Dockerfile for the ai-service

---

## 📋 CURRENT TASK: Component 9 — SAT Code Search Service (AI-Powered)

Build a Python FastAPI microservice that provides intelligent, embedding-based search over the 55,000+ SAT product/service codes. The service will:

1. Load and embed SAT catalog entries using multilingual sentence transformers
2. Store embeddings in PostgreSQL using pgvector
3. Accept Spanish and English search queries
4. Return ranked SAT code suggestions with similarity scores
5. Support fuzzy matching for typos and context-aware suggestions
6. Expose HTTP endpoints consumed by the Next.js app

---

## 🏗️ IMPLEMENTATION ORDER

Follow this exact order. Write unit tests for each step before moving to the next.

### Step 1: Project Setup & Configuration

Create the `ai-service/` directory at the monorepo root with the following structure:

```
ai-service/
├── app/
│   ├── __init__.py
│   ├── main.py                  # FastAPI app entry point
│   ├── config.py                # Settings using pydantic-settings
│   ├── database.py              # Async SQLAlchemy + pgvector connection
│   ├── dependencies.py          # FastAPI dependency injection (DB, services)
│   ├── models/
│   │   ├── __init__.py
│   │   └── sat_code.py          # SQLAlchemy + Pydantic models
│   ├── routers/
│   │   ├── __init__.py
│   │   ├── sat_search.py        # Search endpoints
│   │   └── health.py            # Health check endpoint
│   └── services/
│       ├── __init__.py
│       ├── embedding.py         # EmbeddingService class
│       └── vector_search.py     # VectorSearchService class
├── scripts/
│   ├── load_sat_catalog.py      # Download + parse + insert SAT CSV
│   └── generate_embeddings.py  # Generate + store all embeddings
├── tests/
│   ├── __init__.py
│   ├── conftest.py              # pytest fixtures
│   ├── test_embedding.py
│   ├── test_vector_search.py
│   ├── test_sat_search_router.py
│   ├── test_load_sat_catalog.py
│   └── test_generate_embeddings.py
├── requirements.txt
├── requirements-dev.txt
├── Dockerfile
├── .env.example
└── README.md
```

**`requirements.txt`:**
```
fastapi==0.111.0
uvicorn[standard]==0.29.0
pydantic==2.7.1
pydantic-settings==2.2.1
sqlalchemy[asyncio]==2.0.30
asyncpg==0.29.0
pgvector==0.3.2
sentence-transformers==2.7.0
torch==2.3.0
redis[asyncio]==5.0.4
httpx==0.27.0
python-dotenv==1.0.1
pandas==2.2.2
requests==2.31.0
```

**`requirements-dev.txt`:**
```
pytest==8.2.0
pytest-asyncio==0.23.6
pytest-cov==5.0.0
httpx==0.27.0
anyio==4.3.0
```

**`app/config.py`:**
```python
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    # Database
    database_url: str  # postgresql+asyncpg://...
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

    class Config:
        env_file = ".env"

settings = Settings()
```

**`app/main.py`:**
```python
from fastapi import FastAPI
from contextlib import asynccontextmanager
from app.routers import sat_search, health
from app.services.embedding import EmbeddingService

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Pre-load embedding model on startup
    await EmbeddingService.get_instance()
    yield

app = FastAPI(
    title="SAT AI Search Service",
    description="Multilingual semantic search for SAT product/service codes",
    version="1.0.0",
    lifespan=lifespan,
)

app.include_router(health.router)
app.include_router(sat_search.router, prefix="/api/v1")
```

Write unit tests in `tests/conftest.py` setting up an in-memory test database and mock Redis.

---

### Step 2: Database Models

**File: `app/models/sat_code.py`**

Create the following:

**SQLAlchemy ORM model** for the `sat_product_codes` table. Add the `embedding` column using `pgvector`'s `Vector` type. This column must be **nullable** so it can be populated separately by the embedding script.

```python
from sqlalchemy import Column, String, Text
from sqlalchemy.orm import DeclarativeBase
from pgvector.sqlalchemy import Vector
from pydantic import BaseModel, Field
from typing import Optional

class Base(DeclarativeBase):
    pass

class SATCode(Base):
    __tablename__ = "sat_product_codes"
    code = Column(String(8), primary_key=True)
    name = Column(String(500), nullable=False)
    description = Column(Text, nullable=True)
    division = Column(String(2), nullable=True)
    embedding = Column(Vector(384), nullable=True)  # Added by this component
```

**Pydantic response models:**

```python
class SATCodeResponse(BaseModel):
    code: str
    name: str
    description: Optional[str]
    division: Optional[str]
    similarity_score: Optional[float] = None

    class Config:
        from_attributes = True

class SearchRequest(BaseModel):
    query: str = Field(..., min_length=1, max_length=500)
    top_k: int = Field(default=10, ge=1, le=50)
    threshold: float = Field(default=0.3, ge=0.0, le=1.0)
    category: Optional[str] = None  # division filter

class SearchResponse(BaseModel):
    results: list[SATCodeResponse]
    query: str
    total: int
    search_type: str  # "semantic" | "fulltext" | "hybrid"
```

**Migration note:** Add the `embedding` column to the existing `sat_product_codes` table:

```sql
-- Add to existing migration or create new migration file
-- supabase/migrations/YYYYMMDDHHMMSS_add_sat_code_embeddings.sql

ALTER TABLE sat_product_codes ADD COLUMN IF NOT EXISTS
  embedding vector(384);

CREATE INDEX IF NOT EXISTS idx_sat_product_codes_embedding
  ON sat_product_codes USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);
```

Include this migration SQL as `supabase/migrations/20250101000009_add_sat_code_embeddings.sql` (adjust timestamp to follow existing migration naming convention).

Write unit tests verifying:
- `SATCode` ORM model maps correctly to table columns
- `SearchRequest` validates `top_k` bounds (1-50) and `threshold` bounds (0.0-1.0)
- `SATCodeResponse` serializes correctly from ORM instance

---

### Step 3: Embedding Service

**File: `app/services/embedding.py`**

```python
class EmbeddingService:
    """
    Singleton service for generating multilingual text embeddings.
    Uses sentence-transformers with a multilingual model supporting
    both Spanish and English queries.
    """

    _instance: Optional["EmbeddingService"] = None
    _model: Optional[SentenceTransformer] = None

    @classmethod
    async def get_instance(cls) -> "EmbeddingService":
        """Returns singleton instance, loading model if necessary."""
        ...

    def get_model(self) -> SentenceTransformer:
        """Returns the loaded SentenceTransformer model."""
        ...

    async def generate_embedding(self, text: str) -> list[float]:
        """
        Generate embedding for a single text string.
        - Normalize and clean input text
        - Return list of floats (length = embedding_dimension)
        - Cache result in Redis with key: f"emb:{hash(text)}"
        """
        ...

    async def generate_batch_embeddings(
        self, texts: list[str], batch_size: int = 64
    ) -> list[list[float]]:
        """
        Generate embeddings for a list of texts in batches.
        - Process in batches to avoid OOM on large catalogs
        - Show progress for large batches (use tqdm)
        - Return list of embedding vectors
        """
        ...
```

**Implementation requirements:**
- Use `paraphrase-multilingual-MiniLM-L12-v2` model (384 dimensions, ~270MB)
- Model is loaded once at startup via the `lifespan` context manager
- Text preprocessing: lowercase, strip whitespace, truncate to 512 chars
- Redis cache key format: `sat_emb:{sha256(text)[:16]}`
- If Redis is unavailable, gracefully fall back to no caching (log warning)
- `generate_batch_embeddings` must handle lists of 55,000+ entries efficiently

Write unit tests in `tests/test_embedding.py`:
- Test `generate_embedding` returns a list of 384 floats
- Test `generate_batch_embeddings` returns correct count
- Test caching: second call with same text hits Redis cache (mock Redis)
- Test text preprocessing (lowercase, strip, truncate)
- Test graceful Redis fallback on connection error

---

### Step 4: Vector Search Service

**File: `app/services/vector_search.py`**

```python
class VectorSearchService:
    """
    Performs vector similarity search over SAT codes using pgvector.
    Supports pure semantic search, full-text fallback, and hybrid mode.
    """

    def __init__(self, db: AsyncSession, embedding_service: EmbeddingService):
        ...

    async def similarity_search(
        self,
        embedding: list[float],
        top_k: int = 10,
        threshold: float = 0.3,
    ) -> list[SATCodeResponse]:
        """
        Find SAT codes most similar to the given embedding using cosine similarity.

        SQL pattern:
        SELECT code, name, description, division,
               1 - (embedding <=> :query_embedding) AS similarity_score
        FROM sat_product_codes
        WHERE embedding IS NOT NULL
          AND 1 - (embedding <=> :query_embedding) >= :threshold
        ORDER BY embedding <=> :query_embedding
        LIMIT :top_k;

        Returns list of SATCodeResponse sorted by similarity_score DESC.
        """
        ...

    async def search_with_filters(
        self,
        embedding: list[float],
        filters: dict,
        top_k: int = 10,
        threshold: float = 0.3,
    ) -> list[SATCodeResponse]:
        """
        Similarity search with optional filters.
        Supported filters:
          - division: str — filter by SAT division (2-char code)
        """
        ...

    async def fulltext_fallback(
        self, query: str, top_k: int = 10
    ) -> list[SATCodeResponse]:
        """
        PostgreSQL full-text search fallback for when embeddings are unavailable
        or similarity search returns zero results.

        Uses existing search_vector GIN index on sat_product_codes.
        Returns results with similarity_score = None.
        """
        ...

    async def get_similar_codes(
        self, code: str, top_k: int = 5
    ) -> list[SATCodeResponse]:
        """
        Find SAT codes similar to a known code (by its stored embedding).
        Useful for "similar products" suggestions.
        """
        ...

    async def hybrid_search(
        self,
        query: str,
        embedding: list[float],
        top_k: int = 10,
        threshold: float = 0.3,
    ) -> tuple[list[SATCodeResponse], str]:
        """
        Combines semantic and full-text search results.
        Strategy:
          1. Run similarity_search → semantic results
          2. If semantic results < top_k / 2, also run fulltext_fallback
          3. Merge and deduplicate, semantic results ranked first
          4. Return results + search_type ("semantic" | "fulltext" | "hybrid")
        """
        ...
```

**Cache strategy:**
- Cache query results in Redis: key `sat_search:{sha256(query+filters)[:16]}`, TTL = 300s
- Cache `get_similar_codes` results: key `sat_similar:{code}:{top_k}`, TTL = 3600s

Write unit tests in `tests/test_vector_search.py`:
- Test `similarity_search` with mock DB returning expected rows
- Test threshold filtering (results below threshold excluded)
- Test `search_with_filters` applies division filter to SQL
- Test `fulltext_fallback` is called when semantic results are empty
- Test `hybrid_search` deduplicates results correctly
- Test `get_similar_codes` handles unknown code (returns empty list, no error)

---

### Step 5: SAT Search Router

**File: `app/routers/sat_search.py`**

```python
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
    POST /api/v1/sat/search
    {
      "query": "servicio de consultoría IT",
      "top_k": 5,
      "threshold": 0.35
    }

    Example response:
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
    """
    ...

@router.get("/sat/search/category/{category}", response_model=SearchResponse)
async def search_by_category(
    category: str,
    query: str = Query(..., min_length=1),
    top_k: int = Query(default=10, ge=1, le=50),
    ...
) -> SearchResponse:
    """
    Search within a specific SAT division/category.
    `category` is a 2-character division code (e.g., "81" for services).
    """
    ...

@router.get("/sat/code/{code}", response_model=SATCodeResponse)
async def get_code_details(code: str, ...) -> SATCodeResponse:
    """
    Get full details for a specific SAT code.
    Returns 404 if code does not exist.
    """
    ...

@router.get("/sat/similar/{code}", response_model=SearchResponse)
async def get_similar_codes(
    code: str,
    top_k: int = Query(default=5, ge=1, le=20),
    ...
) -> SearchResponse:
    """
    Returns SAT codes semantically similar to the given code.
    Useful for suggesting alternative categorizations.
    """
    ...
```

**File: `app/routers/health.py`**

```python
@router.get("/health")
async def health_check():
    """
    Returns service health including:
    - embedding model loaded status
    - database connectivity
    - Redis connectivity
    - total SAT codes indexed
    - total codes with embeddings
    """
    ...
```

Write unit tests in `tests/test_sat_search_router.py` using FastAPI's `TestClient`:
- Test `POST /api/v1/sat/search` returns 200 with valid request
- Test `POST /api/v1/sat/search` returns 422 with empty query
- Test `POST /api/v1/sat/search` returns 422 when `top_k` > 50
- Test `GET /api/v1/sat/code/{code}` returns 200 for existing code
- Test `GET /api/v1/sat/code/{code}` returns 404 for unknown code
- Test `GET /api/v1/health` returns model loaded status

---

### Step 6: SAT Catalog Loader Script

**File: `scripts/load_sat_catalog.py`**

This script is run **once** to populate the `sat_product_codes` and `sat_unit_codes` tables. It must be idempotent (safe to run multiple times using upsert).

```python
"""
Script to download and load the official SAT catalog (c_ClaveProdServ)
into the sat_product_codes table.

Usage:
    python scripts/load_sat_catalog.py
    python scripts/load_sat_catalog.py --csv path/to/local_file.csv
    python scripts/load_sat_catalog.py --dry-run

SAT Catalog source:
    http://omawww.sat.gob.mx/tramitesyservicios/Paginas/documentos/catCFDI.xls
    (This is an Excel file; download and convert or use the CSV export)
"""

def download_sat_catalog(output_path: str = "data/catCFDI.xlsx") -> str:
    """
    Download the official SAT catalog Excel file.
    Returns the local path to the downloaded file.
    Raises an error with a helpful message if the URL is unreachable
    (SAT URLs sometimes change; in that case, instruct user to download manually).
    """
    ...

def parse_csv(file_path: str) -> list[dict]:
    """
    Parse SAT catalog file (Excel or CSV).
    Expected columns: ClaveProdServ, Descripcion, Division (optional)
    Returns list of dicts: [{code, name, description, division}, ...]
    Handles encoding issues (Latin-1 / UTF-8 mixed files common in SAT data).
    Skips rows where code or name is empty.
    Logs count of parsed records.
    """
    ...

def insert_into_db(records: list[dict], batch_size: int = 1000) -> int:
    """
    Upsert records into sat_product_codes using synchronous psycopg2.
    Uses ON CONFLICT (code) DO UPDATE to handle re-runs.
    Processes in batches of `batch_size`.
    Returns total rows inserted/updated.
    Logs progress every 10,000 records.
    """
    ...

if __name__ == "__main__":
    # Parse CLI args: --csv, --dry-run, --batch-size
    ...
```

Write unit tests in `tests/test_load_sat_catalog.py`:
- Test `parse_csv` correctly parses a sample CSV with 5 records
- Test `parse_csv` skips rows with empty code or name
- Test `parse_csv` handles Latin-1 encoding
- Test `insert_into_db` calls upsert with correct SQL (mock DB)
- Test `insert_into_db` processes in correct batches
- Test full pipeline with a 10-row sample (integration test, mark with `@pytest.mark.integration`)

---

### Step 7: Embedding Generation Script

**File: `scripts/generate_embeddings.py`**

This script is run **after** loading the SAT catalog to generate and store embeddings for all 55,000+ codes. It must support resuming from where it left off (skip codes that already have embeddings).

```python
"""
Script to generate and store embeddings for all SAT product codes.
Must be run AFTER load_sat_catalog.py has populated the sat_product_codes table.

Usage:
    python scripts/generate_embeddings.py
    python scripts/generate_embeddings.py --batch-size 128 --force-regenerate
    python scripts/generate_embeddings.py --dry-run

Expected runtime: ~10-30 minutes for 55,000 codes (CPU), ~2-5 minutes (GPU).
"""

def load_existing_codes(skip_existing: bool = True) -> list[dict]:
    """
    Load SAT codes from database.
    If skip_existing=True, only loads codes where embedding IS NULL.
    Returns list of {code, name, description} dicts.
    Logs how many codes need embedding generation.
    """
    ...

def generate_all_embeddings(
    codes: list[dict],
    batch_size: int = 64,
) -> list[tuple[str, list[float]]]:
    """
    Generate embeddings for all provided codes.
    Text to embed = f"{code['name']} {code.get('description', '')}".strip()
    Process in batches of batch_size.
    Display progress bar using tqdm.
    Returns list of (code_str, embedding_vector) tuples.
    """
    ...

def update_database(
    embeddings: list[tuple[str, list[float]]],
    batch_size: int = 500,
) -> int:
    """
    Store generated embeddings in the database.
    Uses synchronous psycopg2 for bulk updates.
    UPDATE sat_product_codes SET embedding = %s WHERE code = %s
    Uses executemany in batches for performance.
    Returns count of updated rows.
    Logs progress every 5,000 updates.
    """
    ...

if __name__ == "__main__":
    # Parse CLI args: --batch-size, --force-regenerate, --dry-run
    ...
```

Write unit tests in `tests/test_generate_embeddings.py`:
- Test `load_existing_codes` with `skip_existing=True` filters correctly (mock DB)
- Test `load_existing_codes` with `skip_existing=False` loads all codes
- Test `generate_all_embeddings` returns correct count of (code, vector) tuples
- Test `generate_all_embeddings` constructs correct text for embedding
- Test `update_database` calls DB with correct SQL (mock psycopg2)
- Test `update_database` processes in correct batch sizes

---

### Step 8: Next.js Integration

Add a client in the Next.js app to call the AI service from the product management code.

**File: `apps/web/lib/products/ai-search-client.ts`**

```typescript
/**
 * Client for the Python AI search microservice.
 * Used by the product service to provide AI-powered SAT code suggestions.
 * Falls back to PostgreSQL full-text search if the AI service is unavailable.
 */

interface AISATCodeResult {
  code: string;
  name: string;
  description: string | null;
  division: string | null;
  similarity_score: number | null;
}

interface AISearchResponse {
  results: AISATCodeResult[];
  query: string;
  total: number;
  search_type: "semantic" | "fulltext" | "hybrid";
}

export async function searchSATCodesAI(
  query: string,
  options: {
    top_k?: number;
    threshold?: number;
    category?: string;
  } = {}
): Promise<AISearchResponse> {
  /**
   * Call POST /api/v1/sat/search on the AI microservice.
   * If AI_SERVICE_URL is not set or request fails, throw a
   * SATSearchServiceUnavailableError (caller falls back to text search).
   */
}

export async function getSATCodeDetails(code: string): Promise<AISATCodeResult | null> {
  /**
   * Call GET /api/v1/sat/code/{code} on the AI microservice.
   * Returns null if 404.
   */
}

export async function getSimilarSATCodes(
  code: string,
  topK: number = 5
): Promise<AISATCodeResult[]> {
  /**
   * Call GET /api/v1/sat/similar/{code} on the AI microservice.
   */
}

export class SATSearchServiceUnavailableError extends Error {
  constructor() {
    super("AI SAT search service is unavailable");
    this.name = "SATSearchServiceUnavailableError";
  }
}
```

**Update `apps/web/lib/products/service.ts`** — modify the existing `suggestSATCode` function:

```typescript
// BEFORE (Component 08 — basic text search):
export async function suggestSATCode(description: string) { ... }

// AFTER (Component 09 — AI-powered with fallback):
export async function suggestSATCode(
  description: string,
  options: { topK?: number; threshold?: number } = {}
) {
  try {
    // Try AI service first
    const aiResults = await searchSATCodesAI(description, {
      top_k: options.topK ?? 5,
      threshold: options.threshold ?? 0.35,
    });
    return aiResults.results.map((r) => ({
      code: r.code,
      name: r.name,
      score: r.similarity_score ?? 0,
      source: aiResults.search_type,
    }));
  } catch (error) {
    if (error instanceof SATSearchServiceUnavailableError) {
      // Graceful fallback to PostgreSQL full-text search
      return await suggestSATCodeFallback(description, options.topK ?? 5);
    }
    throw error;
  }
}
```

**Environment variable** to add to `apps/web/.env.local`:
```
AI_SERVICE_URL=http://localhost:8001
```

Write unit tests in `apps/web/lib/products/__tests__/ai-search-client.test.ts`:
- Test `searchSATCodesAI` returns correctly typed response on success
- Test `searchSATCodesAI` throws `SATSearchServiceUnavailableError` when service unreachable
- Test `getSATCodeDetails` returns null on 404
- Test `suggestSATCode` falls back to text search when AI service unavailable (mock both)

---

### Step 9: Dockerfile & README

**`ai-service/Dockerfile`:**

```dockerfile
FROM python:3.11-slim

WORKDIR /app

# Install system dependencies for sentence-transformers
RUN apt-get update && apt-get install -y \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Pre-download embedding model at build time to avoid cold start
RUN python -c "from sentence_transformers import SentenceTransformer; SentenceTransformer('paraphrase-multilingual-MiniLM-L12-v2')"

COPY . .

EXPOSE 8001

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8001"]
```

**`ai-service/README.md`** must include:
- Prerequisites (Python 3.11+, PostgreSQL with pgvector, Redis)
- Environment variables reference
- Setup instructions (install deps, run migrations, load catalog, generate embeddings, start server)
- Script usage examples (`load_sat_catalog.py`, `generate_embeddings.py`)
- API endpoint documentation with example curl commands
- How to run tests
- Expected performance (search latency targets: <200ms p95)
- Notes on first-run: downloading SAT catalog from SAT website, expected catalog file format

---

## 🔑 KEY TECHNICAL DECISIONS

**Why `paraphrase-multilingual-MiniLM-L12-v2`:**
- 384-dimension embeddings (good balance of quality vs storage)
- Supports 50+ languages including Spanish and English natively
- ~270MB model size — fits in memory on modest servers
- Fast inference (~100ms for 64-item batches on CPU)

**Hybrid search strategy:**
- Always try semantic search first (better quality for natural language queries)
- Fall back to PostgreSQL full-text if semantic returns < 50% of requested results
- This ensures the service still works before embeddings are fully generated

**pgvector index type:**
- Use IVFFlat index with `lists = 100` for 55,000 vectors
- IVFFlat provides good speed/recall tradeoff for this dataset size
- Alternative: HNSW (higher recall, more memory) — can be switched later

**Embedding text construction:**
- Combine `name` and `description`: `f"{name} {description or ''}".strip()`
- Do NOT include the code itself in the embedded text
- This ensures search by natural language finds the right code

---

## 📐 EXPECTED BEHAVIOR

```python
# Example 1: Spanish query
POST /api/v1/sat/search
{
  "query": "laptop computadora portátil",
  "top_k": 3,
  "threshold": 0.35
}
# → {
#     "results": [
#       {"code": "43211503", "name": "Computadoras portátiles", "similarity_score": 0.91},
#       {"code": "43211507", "name": "Computadoras portátiles tipo notebook", "similarity_score": 0.87},
#       {"code": "43211900", "name": "Equipo de cómputo", "similarity_score": 0.72}
#     ],
#     "search_type": "semantic"
#   }

# Example 2: English query (multilingual model handles this)
POST /api/v1/sat/search
{"query": "IT consulting services", "top_k": 3}
# → {"results": [{"code": "81112100", "name": "Servicios de consultoría en sistemas...", ...}]}

# Example 3: Typo in query (semantic model is tolerant)
POST /api/v1/sat/search
{"query": "consultori informatica"}   # typos in both words
# → still returns consulting/IT services results

# Example 4: Category filter
GET /api/v1/sat/search/category/43?query=monitor&top_k=5
# → SAT codes in division 43 (Technology) related to monitors

# Example 5: Similar codes
GET /api/v1/sat/similar/81112100?top_k=3
# → Other professional service codes similar to IT consulting
```

---

## 🧪 TESTING REQUIREMENTS

Write comprehensive unit tests as you complete each step. All tests must be in the `ai-service/tests/` directory. Use `pytest` with `pytest-asyncio` for async tests.

**Test coverage targets:**
- `app/services/embedding.py` → ≥ 90% coverage
- `app/services/vector_search.py` → ≥ 90% coverage
- `app/routers/sat_search.py` → ≥ 85% coverage
- `scripts/load_sat_catalog.py` → ≥ 80% coverage
- `scripts/generate_embeddings.py` → ≥ 80% coverage
- `apps/web/lib/products/ai-search-client.ts` → ≥ 85% coverage

**`tests/conftest.py` must provide:**
- `async_db_session` fixture using in-memory SQLite with pgvector mock (or test Postgres)
- `mock_redis` fixture using `fakeredis`
- `mock_embedding_service` fixture returning deterministic 384-dim vectors
- `test_client` FastAPI TestClient fixture with all dependencies overridden

**Run tests:**
```bash
cd ai-service
pytest tests/ -v --cov=app --cov=scripts --cov-report=term-missing
```

---

## 📝 COMPLETION SUMMARY REQUIREMENT

When you have finished implementing all steps, write a **Completion Summary** at the end of your response with the following sections:

### Component 9 Completion Summary

**1. What Was Built**
List every file created or modified, with a one-line description of its purpose.

**2. Architecture Overview**
Brief description of how the pieces fit together: FastAPI service → EmbeddingService → VectorSearchService → pgvector → PostgreSQL. Include how the Next.js app integrates via `ai-search-client.ts`.

**3. Database Changes**
List every migration applied: table name, columns added, indexes created.

**4. Scripts & One-Time Operations**
Describe the two scripts, when to run them, expected runtime, and how to verify they ran correctly.

**5. API Endpoints**
Table of all endpoints: method, path, description, example request/response.

**6. Test Coverage**
List each test file and the number of tests it contains. Note total test count added by this component.

**7. Integration Points**
How Component 9 connects to:
- Component 08 (Product/Service Management) — `suggestSATCode` upgrade
- Future Component 11 (Tax Assistant Chatbot) — reusable `EmbeddingService`
- Future Component 27 (WhatsApp Chatbot) — SAT code lookup via API

**8. Environment Variables Added**
List all new env vars with descriptions and example values.

**9. Known Limitations & Future Improvements**
Be specific: e.g., "IVFFlat index may need reindexing after full catalog load", "HNSW index would improve recall at cost of memory", "Model can be upgraded to `multilingual-e5-large` for better quality".

**10. How to Verify It Works**
Step-by-step instructions to confirm everything is running correctly after deployment:
1. Run catalog loader, verify row count
2. Run embedding generator, verify embedding column populated
3. Start FastAPI service, check `/health` endpoint
4. Run a test search query via curl
5. Run full test suite

---

## ✅ DEFINITION OF DONE

Component 9 is complete when:

- [ ] All files listed in the file structure exist
- [ ] FastAPI service starts without errors
- [ ] `/health` endpoint returns 200 with model loaded = true
- [ ] `POST /api/v1/sat/search` returns semantically relevant results for Spanish and English queries
- [ ] `GET /api/v1/sat/code/{code}` returns correct details for a known SAT code
- [ ] `load_sat_catalog.py` script successfully loads SAT codes into the database
- [ ] `generate_embeddings.py` script populates the `embedding` column
- [ ] Hybrid fallback to full-text search works when AI service is unavailable
- [ ] `suggestSATCode` in `apps/web/lib/products/service.ts` uses the AI service with graceful fallback
- [ ] All unit tests pass (`pytest tests/ -v`)
- [ ] Test coverage meets targets defined above
- [ ] `Dockerfile` builds successfully
- [ ] `README.md` contains complete setup and usage instructions
- [ ] Database migration file exists at `supabase/migrations/20250101000009_add_sat_code_embeddings.sql`
- [ ] Completion Summary is written at the end of the response
