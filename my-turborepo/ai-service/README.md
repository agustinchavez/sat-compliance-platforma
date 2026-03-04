# SAT AI Search Service

Multilingual semantic search service for SAT (Mexican Tax Authority) product/service codes. Uses sentence-transformers embeddings and pgvector for fast, intelligent code lookup.

## Features

- **Semantic Search**: Find SAT codes using natural language queries in Spanish or English
- **Multilingual Support**: Uses `paraphrase-multilingual-MiniLM-L12-v2` model
- **Hybrid Search**: Combines semantic search with PostgreSQL full-text search
- **Similar Codes**: Find codes similar to a known SAT code
- **Category Filtering**: Search within specific SAT divisions
- **Redis Caching**: Query and embedding caching for performance

## Prerequisites

- Python 3.11+
- PostgreSQL with pgvector extension
- Redis (optional, for caching)
- ~500MB disk space for the embedding model

## Quick Start

### 1. Install Dependencies

```bash
cd ai-service
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt
pip install -r requirements-dev.txt  # For development
```

### 2. Configure Environment

```bash
cp .env.example .env
# Edit .env with your database and Redis URLs
```

**Required environment variables:**

| Variable | Description | Example |
|----------|-------------|---------|
| `DATABASE_URL` | Async PostgreSQL URL | `postgresql+asyncpg://user:pass@localhost:5432/db` |
| `DATABASE_URL_SYNC` | Sync PostgreSQL URL (for scripts) | `postgresql://user:pass@localhost:5432/db` |
| `REDIS_URL` | Redis URL | `redis://localhost:6379` |

### 3. Run Database Migration

Apply the migration to add the embedding column:

```bash
cd ../apps/web
npx supabase db push
```

Or manually run:
```sql
ALTER TABLE sat_product_codes ADD COLUMN IF NOT EXISTS embedding vector(384);
CREATE INDEX IF NOT EXISTS idx_sat_product_codes_embedding
  ON sat_product_codes USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);
```

### 4. Load SAT Catalog

Download and load the SAT product catalog:

```bash
# Download from SAT and load
python scripts/load_sat_catalog.py

# Or use a local file
python scripts/load_sat_catalog.py --xlsx /path/to/catCFDI.xlsx
python scripts/load_sat_catalog.py --csv /path/to/catalog.csv

# Dry run (parse only, don't insert)
python scripts/load_sat_catalog.py --xlsx /path/to/file.xlsx --dry-run
```

**Note**: The SAT catalog URL may change. If download fails, manually download from:
https://www.sat.gob.mx/consultas/35025/catalogo-de-productos-y-servicios

### 5. Generate Embeddings

Generate vector embeddings for all SAT codes:

```bash
# Generate embeddings for codes without them
python scripts/generate_embeddings.py

# Force regenerate all embeddings
python scripts/generate_embeddings.py --force-regenerate

# Check current status
python scripts/generate_embeddings.py --verify-only

# Dry run
python scripts/generate_embeddings.py --dry-run
```

**Expected runtime**:
- CPU: ~10-30 minutes for 55,000 codes
- GPU: ~2-5 minutes

### 6. Start the Service

```bash
# Development
uvicorn app.main:app --host 0.0.0.0 --port 8001 --reload

# Production
uvicorn app.main:app --host 0.0.0.0 --port 8001 --workers 4
```

## API Endpoints

### Search SAT Codes

**POST** `/api/v1/sat/search`

Search for SAT codes using natural language.

```bash
curl -X POST http://localhost:8001/api/v1/sat/search \
  -H "Content-Type: application/json" \
  -d '{"query": "laptop computadora portatil", "top_k": 5, "threshold": 0.35}'
```

Response:
```json
{
  "results": [
    {
      "code": "43211503",
      "name": "Computadoras portátiles",
      "description": null,
      "division": "43",
      "similarity_score": 0.91
    }
  ],
  "query": "laptop computadora portatil",
  "total": 1,
  "search_type": "semantic"
}
```

### Search by Category

**GET** `/api/v1/sat/search/category/{category}?query={query}`

Search within a specific SAT division.

```bash
curl "http://localhost:8001/api/v1/sat/search/category/43?query=monitor&top_k=5"
```

### Get Code Details

**GET** `/api/v1/sat/code/{code}`

Get details for a specific SAT code.

```bash
curl http://localhost:8001/api/v1/sat/code/43211503
```

### Get Similar Codes

**GET** `/api/v1/sat/similar/{code}?top_k=5`

Find codes semantically similar to a given code.

```bash
curl "http://localhost:8001/api/v1/sat/similar/43211503?top_k=5"
```

### Health Check

**GET** `/health`

Check service health status.

```bash
curl http://localhost:8001/health
```

Response:
```json
{
  "status": "healthy",
  "embedding_model_loaded": true,
  "database_connected": true,
  "redis_connected": true,
  "total_sat_codes": 53847,
  "codes_with_embeddings": 53847
}
```

## Docker

### Build

```bash
docker build -t sat-ai-service .
```

### Run

```bash
docker run -p 8001:8001 \
  -e DATABASE_URL="postgresql+asyncpg://user:pass@host:5432/db" \
  -e DATABASE_URL_SYNC="postgresql://user:pass@host:5432/db" \
  -e REDIS_URL="redis://redis:6379" \
  sat-ai-service
```

## Testing

```bash
# Run all tests
pytest tests/ -v

# With coverage
pytest tests/ -v --cov=app --cov=scripts --cov-report=term-missing

# Run specific test file
pytest tests/test_embedding.py -v
```

## Performance

- **Search latency**: < 200ms p95 (with cached embeddings)
- **Embedding generation**: ~100ms per batch of 64 items (CPU)
- **Model size**: ~270MB
- **Embedding dimension**: 384

## Architecture

```
┌─────────────────┐     ┌─────────────────┐
│   Next.js App   │────▶│  AI Service     │
│  (TypeScript)   │     │  (FastAPI)      │
└─────────────────┘     └────────┬────────┘
                                 │
                    ┌────────────┼────────────┐
                    │            │            │
              ┌─────▼─────┐ ┌────▼────┐ ┌────▼────┐
              │ Embedding │ │ Vector  │ │  Redis  │
              │  Service  │ │ Search  │ │  Cache  │
              └─────┬─────┘ └────┬────┘ └─────────┘
                    │            │
                    └─────┬──────┘
                          │
                    ┌─────▼─────┐
                    │ PostgreSQL│
                    │ + pgvector│
                    └───────────┘
```

## Integration with Next.js

The Next.js app uses `lib/products/ai-search-client.ts` to call this service. If the AI service is unavailable, it automatically falls back to PostgreSQL full-text search.

```typescript
import { suggestSATCode } from '@/lib/products/sat-codes';

// This will try AI service first, then fall back to text search
const suggestions = await suggestSATCode('consultoría informática');
```

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DATABASE_URL` | Yes | - | Async PostgreSQL connection URL |
| `DATABASE_URL_SYNC` | No | Derived | Sync PostgreSQL URL for scripts |
| `REDIS_URL` | No | `redis://localhost:6379` | Redis connection URL |
| `EMBEDDING_MODEL` | No | `paraphrase-multilingual-MiniLM-L12-v2` | Sentence transformer model |
| `EMBEDDING_DIMENSION` | No | `384` | Embedding vector dimension |
| `DEFAULT_TOP_K` | No | `10` | Default number of results |
| `DEFAULT_THRESHOLD` | No | `0.3` | Default similarity threshold |
| `EMBEDDING_CACHE_TTL` | No | `3600` | Embedding cache TTL (seconds) |
| `QUERY_CACHE_TTL` | No | `300` | Query result cache TTL (seconds) |

## Known Limitations

1. **IVFFlat Index**: May need reindexing after major catalog updates. Run:
   ```sql
   REINDEX INDEX idx_sat_product_codes_embedding;
   ```

2. **Cold Start**: First request after startup takes longer due to model loading (~10-20s)

3. **Memory Usage**: Embedding model requires ~500MB RAM

## Future Improvements

- HNSW index for better recall (higher memory cost)
- Upgrade to `multilingual-e5-large` for better quality embeddings
- Batch processing API for bulk lookups
- Webhook for catalog update notifications
