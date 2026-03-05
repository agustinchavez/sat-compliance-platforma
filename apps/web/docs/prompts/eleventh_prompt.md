# Component 11: Tax Assistant Chatbot (LLM-Based)

## ✅ WHAT'S ALREADY BUILT

### Components 1-10 Complete ✓

- ✅ Authentication (Component 01) — Supabase auth, JWT sessions
- ✅ Role-Based Access Control (Component 02) — Redis-cached RBAC, sub-5ms permission checks
- ✅ Multi-Tenant Context Manager (Component 03) — org isolation, Row-Level Security
- ✅ Organization Service (Component 04) — encrypted CFDI certificate storage (AES-256)
- ✅ Team Management Service (Component 05) — multi-org membership (users belong to 50-100+ orgs)
- ✅ Customer Service (Component 06) — RFC validation, 26 tax regimes, 27 CFDI use codes
- ✅ RFC Validation Service (Component 07) — SAT SOAP web service integration
- ✅ Product/Service Management (Component 08) — 55,000+ SAT codes, 2,800+ unit codes
- ✅ SAT Code Search AI Service (Component 09) — FastAPI, sentence-transformers, pgvector
- ✅ Receipt OCR Service (Component 10) — Tesseract OCR, image preprocessing, CFDI XML parsing

### Existing AI Service Infrastructure (Reuse Everything)

Component 11 is added **into the existing `ai-service/` Python FastAPI microservice**. The following must be reused — do not recreate:

```
ai-service/
├── app/
│   ├── main.py              ← Register new assistant router here
│   ├── config.py            ← Add LLM/RAG settings here
│   ├── database.py          ← Reuse async SQLAlchemy session
│   ├── dependencies.py      ← Add LLM/RAG/conversation dependencies
│   ├── models/
│   │   ├── sat_code.py      ← Existing (do not modify)
│   │   └── receipt.py       ← Existing (do not modify)
│   ├── routers/
│   │   ├── sat_search.py    ← Existing (do not modify)
│   │   ├── ocr.py           ← Existing (do not modify)
│   │   └── health.py        ← Update to include LLM health status
│   └── services/
│       ├── embedding.py     ← EmbeddingService — REUSE for RAG document embeddings
│       └── vector_search.py ← VectorSearchService — REUSE pattern for knowledge base search
├── tests/                   ← Add new test files here
└── requirements.txt         ← Add new LLM dependencies here
```

**Critical reuse point:** `EmbeddingService` from Component 09 uses `paraphrase-multilingual-MiniLM-L12-v2` (384 dimensions, multilingual). **Reuse this exact service** to embed knowledge base documents and user queries for RAG retrieval. Do not initialize a second embedding model.

**Critical reuse point:** The `pgvector` infrastructure and `Vector(384)` pattern from Component 09 is used for the knowledge base vector store. Store knowledge base embeddings in a new `knowledge_base` table using the same pgvector approach.

### Platform Context

This chatbot serves **Mexican SME owners and accountants** using the SAT compliance platform. The user base has a wide range of tax literacy:
- Small business owners who have never filed taxes themselves
- Accountants managing 50-100+ client organizations simultaneously
- Both Spanish-speaking and bilingual (Spanish/English) users

The chatbot must understand the platform's data context — when a user asks "¿cuánto IVA debo pagar este mes?" (how much IVA do I owe this month?), it should be able to reference their actual invoice and expense data, not just give generic tax advice.

### Key Mexican Tax Concepts the Chatbot Must Know

```
SAT       — Servicio de Administración Tributaria (Mexico's tax authority)
CFDI      — Comprobante Fiscal Digital por Internet (electronic invoice)
RFC       — Registro Federal de Contribuyentes (tax ID)
IVA       — Impuesto al Valor Agregado (VAT, 16% standard, 8% border zones)
ISR       — Impuesto Sobre la Renta (income tax)
IEPS      — Impuesto Especial sobre Producción y Servicios
RIF       — Régimen de Incorporación Fiscal (simplified regime for small businesses)
RESICO    — Régimen Simplificado de Confianza (simplified trust regime, 2022+)
Régimen   — Tax regime (there are 26, each with different rules)
Declaración — Tax return/declaration
CSD       — Certificado de Sello Digital (digital stamp certificate for CFDI)
PAC       — Proveedor Autorizado de Certificación (authorized CFDI stamping provider)
Complemento — CFDI supplement (payment complement, payroll complement, etc.)
```

---

## 📋 CURRENT TASK: Component 11 — Tax Assistant Chatbot

Build a conversational AI tax assistant as a new module within the existing `ai-service/` FastAPI application. The assistant will:

1. Answer Mexican tax and SAT compliance questions in Spanish and English
2. Use RAG (Retrieval-Augmented Generation) with a curated tax knowledge base
3. Maintain multi-turn conversation history per user
4. Run Llama 3.1 locally via Ollama as the primary LLM (zero API cost)
5. Fall back to GPT-4o-mini for complex queries when Ollama is unavailable
6. Incorporate user context (their organization's tax regime, recent invoices) for personalized answers
7. Stream responses for a responsive UI experience
8. Escalate to disclaimer language when questions require professional legal/tax advice

---

## 🏗️ IMPLEMENTATION ORDER

Follow this exact order. **Write unit tests for each step before moving to the next.**

---

### Step 1: Dependencies & Configuration

**Update `requirements.txt`** — add:

```
# LLM
ollama==0.2.1               # Ollama Python client
openai==1.30.1              # GPT-4o-mini fallback
tiktoken==0.7.0             # Token counting for context management
# Conversation & RAG
langchain-core==0.2.5       # Prompt templates and message formatting only
# (Do NOT add langchain-community or langchain — keep dependencies minimal)
```

**Update `app/config.py`** — add to the existing `Settings` class:

```python
# LLM Configuration
ollama_base_url: str = "http://localhost:11434"
ollama_model: str = "llama3.1"                    # Primary model
ollama_timeout_seconds: int = 60
openai_api_key: Optional[str] = None              # Optional fallback
openai_model: str = "gpt-4o-mini"                 # Fallback model
llm_temperature: float = 0.3                      # Lower = more factual
llm_max_tokens: int = 1024
# RAG Configuration
rag_top_k: int = 5                                # Retrieved docs per query
rag_similarity_threshold: float = 0.4            # Min similarity for doc retrieval
knowledge_base_dir: str = "app/knowledge"        # Path to .md knowledge files
# Conversation Configuration
max_conversation_history: int = 20               # Messages to keep in context
conversation_summary_threshold: int = 15         # Summarize after this many messages
conversation_ttl_days: int = 30                  # Days before conversation expires
```

**Add database tables.** Create migration file `supabase/migrations/20250101000011_add_chatbot_tables.sql`:

```sql
-- Conversation history
CREATE TABLE conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  title VARCHAR(255),                    -- Auto-generated from first message
  summary TEXT,                          -- LLM-generated summary for long conversations
  message_count INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  expires_at TIMESTAMP NOT NULL          -- conversation_ttl_days from created_at
);

CREATE INDEX idx_conversations_user ON conversations(user_id);
CREATE INDEX idx_conversations_org ON conversations(organization_id);
CREATE INDEX idx_conversations_expires ON conversations(expires_at);

-- Individual messages
CREATE TABLE conversation_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role VARCHAR(20) NOT NULL,             -- 'user' | 'assistant' | 'system'
  content TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',           -- tokens_used, model, rag_sources, confidence
  created_at TIMESTAMP DEFAULT NOW(),
  CONSTRAINT check_role CHECK (role IN ('user', 'assistant', 'system'))
);

CREATE INDEX idx_messages_conversation ON conversation_messages(conversation_id);
CREATE INDEX idx_messages_created ON conversation_messages(created_at);

-- Knowledge base documents with vector embeddings
CREATE TABLE knowledge_base (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doc_id VARCHAR(100) NOT NULL UNIQUE,   -- e.g., "tax_guide_iva_section_3"
  source_file VARCHAR(255) NOT NULL,     -- e.g., "tax_guide.md"
  section_title VARCHAR(500),
  content TEXT NOT NULL,
  content_hash VARCHAR(64) NOT NULL,     -- SHA-256 to detect changes
  embedding vector(384),                 -- Uses same dimension as Component 09
  chunk_index INTEGER DEFAULT 0,        -- Position within source file
  metadata JSONB DEFAULT '{}',          -- tags, last_updated, topic
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_knowledge_base_doc_id ON knowledge_base(doc_id);
CREATE INDEX idx_knowledge_base_source ON knowledge_base(source_file);
CREATE INDEX idx_knowledge_base_embedding
  ON knowledge_base USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 10);                     -- Small lists for small knowledge base

-- RLS Policies
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "conversations_select" ON conversations FOR SELECT
  USING (user_id IN (
    SELECT id FROM users WHERE auth_id = auth.uid()
  ));

CREATE POLICY "conversations_insert" ON conversations FOR INSERT
  WITH CHECK (user_id IN (
    SELECT id FROM users WHERE auth_id = auth.uid()
  ));

-- conversation_messages: access through conversations
CREATE POLICY "messages_select" ON conversation_messages FOR SELECT
  USING (conversation_id IN (
    SELECT id FROM conversations WHERE user_id IN (
      SELECT id FROM users WHERE auth_id = auth.uid()
    )
  ));
```

Write unit tests in `tests/test_chatbot_config.py`:
- Test all new settings have correct defaults
- Test `ollama_base_url` is configurable via env var
- Test `openai_api_key` defaults to None (not required)

---

### Step 2: Data Models

**File: `app/models/conversation.py`**

```python
from pydantic import BaseModel, Field
from typing import Optional, Literal
from datetime import datetime
from enum import Enum

class MessageRole(str, Enum):
    USER = "user"
    ASSISTANT = "assistant"
    SYSTEM = "system"

class ChatMessage(BaseModel):
    role: MessageRole
    content: str
    created_at: Optional[datetime] = None
    metadata: dict = {}

class ConversationContext(BaseModel):
    """
    User-specific context passed with each chat request.
    Allows the LLM to give personalized answers based on the user's
    actual organization data.
    """
    organization_id: Optional[str] = None
    organization_name: Optional[str] = None
    tax_regime: Optional[str] = None          # e.g., "601" (General de Ley)
    rfc: Optional[str] = None
    user_role: Optional[str] = None           # 'owner', 'admin', 'accountant'
    # Optional business metrics for context-aware answers
    monthly_revenue_approx: Optional[float] = None
    employee_count_approx: Optional[int] = None

class ChatRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=2000)
    conversation_id: Optional[str] = None     # None = start new conversation
    context: Optional[ConversationContext] = None
    stream: bool = False

class RAGSource(BaseModel):
    doc_id: str
    section_title: Optional[str]
    source_file: str
    similarity_score: float
    excerpt: str                               # First 200 chars of content

class ChatResponse(BaseModel):
    conversation_id: str
    message_id: str
    content: str
    role: MessageRole = MessageRole.ASSISTANT
    rag_sources: list[RAGSource] = []
    model_used: str                            # "llama3.1" or "gpt-4o-mini"
    tokens_used: Optional[int] = None
    confidence: float = Field(ge=0.0, le=1.0) # Estimated answer confidence
    requires_professional_advice: bool = False # True if question exceeds chatbot scope
    created_at: datetime

class ConversationSummary(BaseModel):
    conversation_id: str
    title: str
    message_count: int
    created_at: datetime
    updated_at: datetime

class ConversationHistory(BaseModel):
    conversation_id: str
    title: Optional[str]
    messages: list[ChatMessage]
    summary: Optional[str]                    # Present for long conversations
```

Write unit tests in `tests/test_conversation_models.py`:
- Test `ChatRequest` rejects empty messages and messages > 2000 chars
- Test `ConversationContext` allows all None fields
- Test `ChatResponse` requires `confidence` between 0.0 and 1.0
- Test `MessageRole` enum validates 'user', 'assistant', 'system' only
- Test `RAGSource` serializes correctly

---

### Step 3: Knowledge Base Documents

**Create the knowledge base directory and documents:**

```
ai-service/app/knowledge/
├── tax_guide.md
├── cfdi_guide.md
├── sat_regulations.md
└── regimes_guide.md
```

Each file should be written in **both Spanish and English** (interleaved or in separate sections). These documents are chunked, embedded, and stored in the `knowledge_base` table for RAG retrieval.

**`app/knowledge/tax_guide.md`** — Cover these topics:
- IVA (VAT): standard 16% rate, 8% border zone rate, zero rate (tasa 0), exempt goods/services
- ISR (income tax): rates by regime, monthly advance payments (pagos provisionales), annual declaration
- IVA retention: when it applies (services between companies), rates (10.67%), who retains
- ISR retention: professional services, rates (10%, 1.25%)
- Monthly tax obligations calendar (when to file each declaration)
- Consequences of late filing (recargos, multas)

**`app/knowledge/cfdi_guide.md`** — Cover these topics:
- What is CFDI 4.0 and why it's mandatory
- Required fields: RFC, tax regime, CFDI use codes
- Types of CFDI: Ingreso, Egreso, Traslado, Nómina, Pago
- Payment complement (Complemento de Pago): when required, how it works
- Global invoice (CFDI global): for public general without RFC
- How to cancel a CFDI: reasons, time limits, replacement invoices
- Common CFDI errors and how to fix them

**`app/knowledge/sat_regulations.md`** — Cover these topics:
- Obligaciones fiscales by business type
- Buzonz Tributario: what it is, why checking it matters
- e.firma (FIEL): what it is, how to renew
- CSD (Certificado de Sello Digital): purpose, renewal
- SAT audits (visitas domiciliarias): triggers, rights, process
- Carta Invitación vs Requerimiento vs Acta de Inicio

**`app/knowledge/regimes_guide.md`** — Cover the most common regimes:
- 601 — General de Ley Personas Morales (corporations)
- 612 — Personas Físicas con Actividades Empresariales
- 621 — Incorporación Fiscal (RIF) — being phased out
- 626 — Régimen Simplificado de Confianza (RESICO) — 2022 replacement for RIF
- 625 — Régimen de las Actividades Empresariales con ingresos a través de Plataformas Tecnológicas
- Key differences: who qualifies, tax rates, filing obligations, invoice limits

**Document format requirements:**
- Use clear Markdown headings (## and ###) — the chunking script uses these as chunk boundaries
- Keep each section under 500 words for good chunk quality
- Include concrete examples with numbers (e.g., tax calculation examples)
- Include both Spanish terminology and English translations in parentheses on first use

**Script to load and embed knowledge base:**

**File: `scripts/load_knowledge_base.py`**

```python
"""
Script to chunk, embed, and store knowledge base documents.
Run this after writing or updating knowledge base .md files.
Run BEFORE starting the AI service for the first time.

Usage:
    python scripts/load_knowledge_base.py
    python scripts/load_knowledge_base.py --force-update   # Re-embed all docs
    python scripts/load_knowledge_base.py --file tax_guide.md  # Single file
    python scripts/load_knowledge_base.py --dry-run        # Preview chunks only
"""

def chunk_markdown_document(
    content: str,
    source_file: str,
    max_chunk_size: int = 500,
) -> list[dict]:
    """
    Split a markdown document into chunks at section boundaries.

    Strategy:
    1. Split on ## and ### headings
    2. If a section exceeds max_chunk_size words, split further at paragraph breaks
    3. Each chunk must include its section title for context
    4. Overlap: repeat the last sentence of the previous chunk as the first
       sentence of the next (20-word overlap for context continuity)

    Returns list of:
    {
      doc_id: str,          # f"{source_file}_{section_slug}_{chunk_index}"
      source_file: str,
      section_title: str,
      content: str,
      chunk_index: int,
      metadata: dict        # {word_count, topics: []}
    }
    """
    ...

def generate_doc_id(source_file: str, section_title: str, chunk_index: int) -> str:
    """Generate a stable, unique doc_id from source and section."""
    ...

def load_and_embed_documents(
    knowledge_dir: str,
    force_update: bool = False,
    target_file: Optional[str] = None,
) -> int:
    """
    Main function: reads .md files, chunks them, generates embeddings,
    upserts into knowledge_base table.

    Uses EmbeddingService.generate_batch_embeddings() from Component 09.
    Skip docs where content_hash is unchanged (unless force_update=True).
    Returns count of docs inserted/updated.
    """
    ...

if __name__ == "__main__":
    # Parse CLI args
    ...
```

Write unit tests in `tests/test_load_knowledge_base.py`:
- Test `chunk_markdown_document` splits at ## headings correctly
- Test `chunk_markdown_document` includes section title in each chunk
- Test `chunk_markdown_document` handles documents with no headings
- Test `chunk_markdown_document` further splits sections exceeding max_chunk_size
- Test `generate_doc_id` produces stable, URL-safe strings
- Test `load_and_embed_documents` skips unchanged docs (same hash)
- Test `load_and_embed_documents` upserts changed docs (new hash)

---

### Step 4: LLM Service

**File: `app/services/llm.py`**

```python
import ollama
import openai
from app.models.conversation import ChatMessage, ConversationContext
from typing import AsyncGenerator

# System prompt — defines the assistant's persona and constraints
SYSTEM_PROMPT = """Eres un asistente fiscal experto en el sistema tributario mexicano y la plataforma de facturación SAT. Ayudas a dueños de empresas y contadores con preguntas sobre CFDI 4.0, IVA, ISR, regímenes fiscales y cumplimiento con el SAT.

You can also respond in English if the user writes in English.

IMPORTANT GUIDELINES:
1. Base your answers on Mexican tax law and SAT regulations as of 2024.
2. When citing amounts, rates, or deadlines, be specific and accurate.
3. For complex legal or tax planning questions, recommend consulting a certified contador público (CPA).
4. Never give advice that could lead to tax evasion or non-compliance.
5. If you are unsure about something, say so clearly rather than guessing.
6. Use the user's context (tax regime, organization type) to personalize your answers.
7. Keep responses concise but complete — most answers should be under 300 words.
8. Use bullet points and numbered lists for multi-step processes.

SCOPE LIMITATIONS:
- You can answer questions about: IVA, ISR, CFDI, SAT procedures, tax regimes, filing deadlines, invoice requirements.
- You should escalate (recommend professional advice) for: tax dispute defense, corporate restructuring, international tax, criminal tax matters.
"""

class LLMService:
    """
    Manages LLM interactions for the tax assistant.
    Primary: Llama 3.1 via Ollama (local, zero cost).
    Fallback: GPT-4o-mini via OpenAI API.
    """

    def __init__(self, settings):
        self.settings = settings
        self._ollama_available: Optional[bool] = None  # Cache availability check

    async def check_ollama_available(self) -> bool:
        """
        Check if Ollama is running and the configured model is available.
        Cache result for 60 seconds to avoid repeated health checks.
        Returns False (not True) if check fails — never raises.
        """
        ...

    def build_messages(
        self,
        user_message: str,
        history: list[ChatMessage],
        context: Optional[ConversationContext],
        rag_context: str = "",
    ) -> list[dict]:
        """
        Build the messages array for the LLM API call.

        Structure:
        1. System message (SYSTEM_PROMPT + user context if provided)
        2. RAG context as a system message (if rag_context is non-empty):
           "Relevant tax information:\n{rag_context}"
        3. Conversation history (last N messages from history)
        4. Current user message

        User context injection (if ConversationContext provided):
        Append to system prompt:
        "User context: Organization {name}, tax regime {regime} ({regime_name}),
        RFC {rfc}, role: {role}."

        Token management: if total history would exceed 3000 tokens
        (rough estimate: 1 token ≈ 4 characters), truncate oldest messages first.
        """
        ...

    async def generate_response(
        self,
        user_message: str,
        history: list[ChatMessage],
        context: Optional[ConversationContext] = None,
        rag_context: str = "",
    ) -> tuple[str, str, Optional[int]]:
        """
        Generate a complete response (non-streaming).

        Returns: (response_text, model_used, tokens_used)

        Flow:
        1. Check if Ollama is available
        2. If yes: call Ollama API
        3. If no (or Ollama times out): call GPT-4o-mini fallback
        4. If both fail: return a graceful error message
           "Lo siento, el servicio de IA no está disponible en este momento.
            Por favor intenta de nuevo más tarde."

        Ollama call: use ollama.AsyncClient.chat()
        GPT-4o-mini call: use openai.AsyncOpenAI().chat.completions.create()
        """
        ...

    async def stream_response(
        self,
        user_message: str,
        history: list[ChatMessage],
        context: Optional[ConversationContext] = None,
        rag_context: str = "",
    ) -> AsyncGenerator[str, None]:
        """
        Stream response tokens as they are generated.
        Yields string chunks as they arrive.
        Used for the streaming SSE endpoint.

        If Ollama unavailable, falls back to GPT-4o-mini with streaming.
        If both unavailable: yield the graceful error message as a single chunk.
        """
        ...

    def estimate_confidence(self, response: str, rag_sources: list) -> float:
        """
        Heuristic confidence score for the response.

        Rules:
        - Base score: 0.7
        - +0.15 if rag_sources is non-empty (grounded in knowledge base)
        - +0.1 if response contains specific numbers/rates/dates
        - -0.2 if response contains hedge phrases:
          "no estoy seguro", "I'm not sure", "might", "podría", "consulta a"
        - -0.3 if response contains "no puedo", "no tengo información"
        - Clamp to [0.0, 1.0]
        """
        ...

    def requires_professional_advice(self, message: str, response: str) -> bool:
        """
        Determine if this Q&A should be flagged for professional advice.

        Flag as True if ANY of these are present in message or response:
        - Keywords: "evasión", "evasion", "ilegal", "illegal", "penal", "criminal"
        - Keywords: "reestructura", "fusión", "escisión", "holding"
        - Keywords: "amparo", "recurso de revocación", "juicio fiscal"
        - Keywords: "internacional", "transfer pricing", "precios de transferencia"
        - Response contains "te recomiendo consultar" or "recommend consulting"
        """
        ...
```

Write unit tests in `tests/test_llm_service.py`:
- Test `build_messages` includes system prompt as first message
- Test `build_messages` injects user context into system message when provided
- Test `build_messages` includes RAG context as separate system message when non-empty
- Test `build_messages` truncates history to stay within token limit
- Test `estimate_confidence` returns 0.7 base score for neutral response
- Test `estimate_confidence` adds 0.15 when rag_sources provided
- Test `estimate_confidence` subtracts 0.2 for hedge phrases
- Test `requires_professional_advice` returns True for "evasión fiscal"
- Test `requires_professional_advice` returns True for "reestructura corporativa"
- Test `requires_professional_advice` returns False for "¿cuánto es el IVA?"
- Test `generate_response` falls back to GPT-4o-mini when Ollama unavailable (mock both)
- Test `generate_response` returns graceful error when both LLMs unavailable

---

### Step 5: RAG Service

**File: `app/services/rag.py`**

```python
from app.services.embedding import EmbeddingService
from app.models.conversation import RAGSource

class RAGService:
    """
    Retrieval-Augmented Generation service.
    Retrieves relevant knowledge base documents for a given query,
    then provides that context to the LLM for grounded answers.

    Uses the SAME EmbeddingService from Component 09 — do not create
    a new embedding model instance.
    """

    def __init__(
        self,
        db: AsyncSession,
        embedding_service: EmbeddingService,  # Injected — shared singleton
    ):
        self.db = db
        self.embedding_service = embedding_service

    async def retrieve_relevant_docs(
        self,
        query: str,
        top_k: int = 5,
        threshold: float = 0.4,
    ) -> list[RAGSource]:
        """
        Find knowledge base chunks most relevant to the query.

        Steps:
        1. Generate embedding for query using self.embedding_service.generate_embedding()
        2. Run cosine similarity search against knowledge_base.embedding column
           (same pgvector pattern as Component 09's similarity_search)
        3. Filter by threshold
        4. Return top_k results as RAGSource objects
           (include first 200 chars of content as excerpt)

        SQL pattern:
        SELECT doc_id, section_title, source_file, content,
               1 - (embedding <=> :query_embedding) AS similarity_score
        FROM knowledge_base
        WHERE embedding IS NOT NULL
          AND 1 - (embedding <=> :query_embedding) >= :threshold
        ORDER BY embedding <=> :query_embedding
        LIMIT :top_k;
        """
        ...

    def build_context(
        self,
        query: str,
        docs: list[RAGSource],
    ) -> str:
        """
        Format retrieved documents into a context string for the LLM.

        Format:
        ---
        [Source: {source_file} — {section_title}]
        {full content of doc}
        ---
        [Source: ...]
        ...

        If docs is empty, return empty string "".
        Total context must not exceed 2000 words — truncate last doc if needed.
        """
        ...

    async def augment_prompt(
        self,
        query: str,
        top_k: int = 5,
        threshold: float = 0.4,
    ) -> tuple[str, list[RAGSource]]:
        """
        Full RAG pipeline: retrieve docs and build context string.
        Returns (context_string, sources_list).
        context_string is empty "" if no relevant docs found.
        """
        docs = await self.retrieve_relevant_docs(query, top_k, threshold)
        context = self.build_context(query, docs)
        return context, docs

    async def is_knowledge_base_populated(self) -> bool:
        """
        Check if the knowledge base has any embedded documents.
        Used by health check endpoint.
        """
        ...
```

Write unit tests in `tests/test_rag_service.py`:
- Test `retrieve_relevant_docs` calls `embedding_service.generate_embedding()` once
- Test `retrieve_relevant_docs` filters results below threshold
- Test `retrieve_relevant_docs` returns empty list when no docs in DB (no error)
- Test `build_context` formats docs with source headers
- Test `build_context` returns empty string when docs list is empty
- Test `build_context` truncates context exceeding 2000 words
- Test `augment_prompt` returns empty string and empty list when no docs found
- Test `is_knowledge_base_populated` returns False on empty table

---

### Step 6: Conversation Manager

**File: `app/services/conversation.py`**

```python
from app.models.conversation import ChatMessage, MessageRole, ConversationSummary, ConversationHistory

class ConversationManager:
    """
    Manages persistent conversation history in PostgreSQL.
    Handles message storage, history retrieval, and conversation summarization.
    """

    def __init__(self, db: AsyncSession, llm_service: LLMService):
        self.db = db
        self.llm_service = llm_service

    async def create_conversation(
        self,
        user_id: str,
        organization_id: Optional[str] = None,
    ) -> str:
        """
        Create a new conversation record.
        Sets expires_at = NOW() + conversation_ttl_days.
        Returns new conversation_id (UUID).
        """
        ...

    async def get_or_create_conversation(
        self,
        conversation_id: Optional[str],
        user_id: str,
        organization_id: Optional[str] = None,
    ) -> str:
        """
        If conversation_id is provided and exists: return it.
        If conversation_id is provided but not found: raise 404.
        If conversation_id is None: create and return a new conversation.
        """
        ...

    async def add_message(
        self,
        conversation_id: str,
        role: MessageRole,
        content: str,
        metadata: dict = {},
    ) -> str:
        """
        Insert a message into conversation_messages.
        Update conversations.message_count and updated_at.
        Returns the new message_id.

        After adding a message, check if message_count exceeds
        conversation_summary_threshold. If so, trigger summarization
        (fire-and-forget using asyncio.create_task — do not await).
        """
        ...

    async def get_history(
        self,
        conversation_id: str,
        limit: int = 20,
    ) -> list[ChatMessage]:
        """
        Retrieve last `limit` messages from a conversation, oldest first.
        If conversation has a summary and message_count > limit,
        prepend a synthetic 'system' message:
        "Previous conversation summary: {summary}"
        """
        ...

    async def summarize_conversation(
        self,
        conversation_id: str,
    ) -> None:
        """
        Generate and store a summary of the conversation so far.
        Used to compress long conversations without losing context.

        Prompt to LLM:
        "Summarize the following tax consultation conversation in 3-5 sentences.
         Focus on the main questions asked and answers given.
         Conversation: {messages}"

        Store result in conversations.summary.
        This runs as a background task — if it fails, log and continue.
        """
        ...

    async def get_conversation_list(
        self,
        user_id: str,
        limit: int = 20,
    ) -> list[ConversationSummary]:
        """
        List a user's conversations, most recent first.
        Exclude expired conversations.
        """
        ...

    async def delete_conversation(
        self,
        conversation_id: str,
        user_id: str,
    ) -> bool:
        """
        Soft delete: set expires_at = NOW().
        Verify the conversation belongs to user_id before deleting.
        Returns False if conversation not found or not owned by user.
        """
        ...

    async def auto_generate_title(
        self,
        conversation_id: str,
        first_message: str,
    ) -> None:
        """
        Generate a short title from the first user message.
        Truncate to 60 chars or use first 60 chars of message.
        Store in conversations.title.
        Fire-and-forget — do not block the chat response.
        """
        ...
```

Write unit tests in `tests/test_conversation_manager.py`:
- Test `create_conversation` returns a valid UUID
- Test `create_conversation` sets correct `expires_at` (30 days from now ± 1 minute)
- Test `get_or_create_conversation` with None creates new conversation
- Test `get_or_create_conversation` with existing ID returns same ID
- Test `get_or_create_conversation` with non-existent ID raises 404
- Test `add_message` increments message_count on conversations
- Test `add_message` triggers summarization when message_count > threshold (mock LLM)
- Test `get_history` prepends summary as system message for long conversations
- Test `delete_conversation` returns False for wrong user_id

---

### Step 7: Assistant Router

**File: `app/routers/assistant.py`**

```python
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from app.models.conversation import ChatRequest, ChatResponse, ConversationHistory, ConversationSummary

router = APIRouter(tags=["Tax Assistant"])

@router.post("/assistant/chat", response_model=ChatResponse)
async def chat(
    request: ChatRequest,
    user_id: str = Depends(get_current_user_id),  # From auth header
    db = Depends(get_db),
    llm_service: LLMService = Depends(get_llm_service),
    rag_service: RAGService = Depends(get_rag_service),
    conversation_manager: ConversationManager = Depends(get_conversation_manager),
) -> ChatResponse:
    """
    Main chat endpoint.

    Flow:
    1. Get or create conversation
    2. Save user message to DB
    3. Retrieve conversation history
    4. Run RAG: retrieve relevant knowledge base docs
    5. Build LLM messages (system + history + RAG context + user message)
    6. Generate response
    7. Estimate confidence and check if professional advice required
    8. Save assistant response to DB (with metadata: model, tokens, rag_sources)
    9. Auto-generate conversation title if first message (fire-and-forget)
    10. Return ChatResponse

    If request.stream == True: redirect to /assistant/chat/stream instead
    (return 307 Temporary Redirect to the streaming endpoint).
    """
    ...

@router.post("/assistant/chat/stream")
async def chat_stream(
    request: ChatRequest,
    user_id: str = Depends(get_current_user_id),
    db = Depends(get_db),
    llm_service: LLMService = Depends(get_llm_service),
    rag_service: RAGService = Depends(get_rag_service),
    conversation_manager: ConversationManager = Depends(get_conversation_manager),
):
    """
    Streaming chat endpoint using Server-Sent Events.
    Returns text/event-stream response.

    SSE format:
    data: {"type": "chunk", "content": "Hola"}
    data: {"type": "chunk", "content": ", el IVA"}
    data: {"type": "done", "conversation_id": "...", "rag_sources": [...], "model": "llama3.1"}

    Full response is assembled and saved to DB after streaming completes.
    """
    ...

@router.get("/assistant/conversations", response_model=list[ConversationSummary])
async def list_conversations(
    user_id: str = Depends(get_current_user_id),
    limit: int = 20,
    db = Depends(get_db),
    conversation_manager: ConversationManager = Depends(get_conversation_manager),
):
    """List user's conversations, most recent first."""
    ...

@router.get("/assistant/conversations/{conversation_id}", response_model=ConversationHistory)
async def get_conversation_history(
    conversation_id: str,
    user_id: str = Depends(get_current_user_id),
    db = Depends(get_db),
    conversation_manager: ConversationManager = Depends(get_conversation_manager),
):
    """
    Get full message history for a conversation.
    Returns 404 if not found or not owned by user.
    """
    ...

@router.delete("/assistant/conversations/{conversation_id}", status_code=204)
async def clear_conversation(
    conversation_id: str,
    user_id: str = Depends(get_current_user_id),
    db = Depends(get_db),
    conversation_manager: ConversationManager = Depends(get_conversation_manager),
):
    """
    Soft-delete a conversation.
    Returns 404 if not found, 403 if not owned by user.
    """
    ...
```

**Authentication note:** The `get_current_user_id` dependency should extract the user ID from a Bearer token in the Authorization header. Since the AI service is an internal service (called from Next.js server actions, not directly from browser), implement a simple shared secret validation:

```python
# app/dependencies.py — add:
async def get_current_user_id(
    x_user_id: str = Header(..., alias="X-User-Id"),
    x_internal_key: str = Header(..., alias="X-Internal-Key"),
) -> str:
    """
    Internal service authentication.
    Next.js app passes X-User-Id and X-Internal-Key headers.
    X-Internal-Key must match settings.internal_api_key.
    """
    if x_internal_key != settings.internal_api_key:
        raise HTTPException(status_code=401, detail="Invalid internal key")
    return x_user_id
```

Add to `config.py`:
```python
internal_api_key: str = "change-me-in-production"
```

**Update `app/main.py`** to register the router:
```python
from app.routers import sat_search, health, ocr, assistant  # add assistant
app.include_router(assistant.router, prefix="/api/v1")
```

**Update `app/routers/health.py`** to include LLM and knowledge base status:
```python
# Add to health check response:
"ollama_available": bool
"ollama_model": str          # Which model is loaded
"openai_configured": bool    # True if OPENAI_API_KEY is set
"knowledge_base_docs": int   # Count of docs in knowledge_base table
```

Write unit tests in `tests/test_assistant_router.py`:
- Test `POST /api/v1/assistant/chat` returns 200 with valid request (mock LLM)
- Test `POST /api/v1/assistant/chat` returns 401 without X-Internal-Key header
- Test `POST /api/v1/assistant/chat` with empty message returns 422
- Test `POST /api/v1/assistant/chat` creates a new conversation when no ID given
- Test `POST /api/v1/assistant/chat` continues existing conversation when ID provided
- Test `POST /api/v1/assistant/chat` saves both user and assistant messages to DB
- Test `GET /api/v1/assistant/conversations/{id}` returns 404 for unknown ID
- Test `DELETE /api/v1/assistant/conversations/{id}` returns 204 on success
- Test `DELETE /api/v1/assistant/conversations/{id}` returns 403 for wrong user
- Test streaming endpoint returns `text/event-stream` content type

---

### Step 8: Next.js Integration

**File: `apps/web/lib/assistant/chat-client.ts`**

```typescript
/**
 * Client for the Python Tax Assistant microservice.
 * Called from Next.js Server Actions — never directly from browser.
 */

export interface ConversationContext {
  organizationId?: string;
  organizationName?: string;
  taxRegime?: string;
  rfc?: string;
  userRole?: string;
}

export interface RAGSource {
  docId: string;
  sectionTitle: string | null;
  sourceFile: string;
  similarityScore: number;
  excerpt: string;
}

export interface ChatResponse {
  conversationId: string;
  messageId: string;
  content: string;
  ragSources: RAGSource[];
  modelUsed: string;
  tokensUsed: number | null;
  confidence: number;
  requiresProfessionalAdvice: boolean;
  createdAt: string;
}

export interface ConversationSummary {
  conversationId: string;
  title: string | null;
  messageCount: number;
  createdAt: string;
  updatedAt: string;
}

export class AssistantServiceUnavailableError extends Error {
  constructor() {
    super("Tax assistant service is unavailable");
    this.name = "AssistantServiceUnavailableError";
  }
}

/**
 * Send a message and get a complete response.
 */
export async function sendMessage(
  message: string,
  options: {
    conversationId?: string;
    context?: ConversationContext;
  } = {}
): Promise<ChatResponse> { ... }

/**
 * Send a message and stream the response.
 * Yields string chunks as they arrive.
 * Returns the final ChatResponse when done.
 */
export async function* streamMessage(
  message: string,
  options: {
    conversationId?: string;
    context?: ConversationContext;
  } = {}
): AsyncGenerator<string, ChatResponse, unknown> { ... }

export async function listConversations(
  userId: string
): Promise<ConversationSummary[]> { ... }

export async function getConversation(
  conversationId: string,
  userId: string
): Promise<{ messages: Array<{ role: string; content: string; createdAt: string }> }> { ... }

export async function deleteConversation(
  conversationId: string,
  userId: string
): Promise<void> { ... }
```

**File: `apps/web/app/api/assistant/chat/route.ts`** — Next.js API route that proxies streaming to the client:

```typescript
/**
 * Next.js API route for streaming chat responses.
 * Browser → Next.js API route → AI service (streaming SSE)
 * This avoids exposing the AI service URL and internal API key to the browser.
 */
export async function POST(request: Request): Promise<Response> {
  // 1. Get current user from Supabase session
  // 2. Get organization context from session
  // 3. Forward to AI service with X-User-Id and X-Internal-Key headers
  // 4. Stream the SSE response back to the browser
}
```

Add to `apps/web/.env.local`:
```
AI_SERVICE_URL=http://localhost:8001
AI_INTERNAL_API_KEY=change-me-in-production
```

Write unit tests in `apps/web/lib/assistant/__tests__/chat-client.test.ts`:
- Test `sendMessage` returns typed `ChatResponse` on success
- Test `sendMessage` throws `AssistantServiceUnavailableError` when service unreachable
- Test `sendMessage` includes correct `X-User-Id` and `X-Internal-Key` headers
- Test `listConversations` returns array of `ConversationSummary`
- Test `deleteConversation` sends DELETE request to correct endpoint

---

## 🔑 KEY TECHNICAL DECISIONS

**Why Ollama + Llama 3.1 over cloud LLM as primary:**
- Mexican SMEs are the target market — cost sensitivity is high. Zero per-token cost for the primary LLM path is a significant competitive advantage.
- Tax conversations contain sensitive business data (revenues, RFC, tax amounts) — local processing avoids data leaving the customer's infrastructure perimeter.
- Llama 3.1 8B handles Spanish well and is sufficient for structured tax Q&A with RAG context.
- GPT-4o-mini as fallback ensures availability even when Ollama is not configured.

**Why RAG over fine-tuning:**
- Tax regulations change frequently (SAT updates, new regimes, new CFDI requirements). RAG with updatable knowledge base documents is far easier to maintain than a fine-tuned model.
- The knowledge base can be updated with a single script run, no model retraining required.
- RAG provides source citations, which is critical for a compliance context where users need to verify information.

**Why `paraphrase-multilingual-MiniLM-L12-v2` for RAG (same as Component 09):**
- Already loaded in memory from Component 09. No additional memory cost.
- Works well for Spanish-language document retrieval.
- 384 dimensions matches the existing `knowledge_base.embedding` column.

**Why conversation summarization instead of full history:**
- LLM context windows have limits. A 20-message conversation with RAG context could exceed Llama 3.1's practical context.
- Summarization preserves the key points of long conversations without hitting token limits.
- Summaries are generated asynchronously (background task) — no latency impact.

**Why internal API key authentication (not JWT):**
- The AI service is an internal microservice called only from Next.js server actions.
- A simple shared secret is appropriate for service-to-service communication inside a private network.
- JWT validation would require the AI service to connect to Supabase for every request — unnecessary overhead.

---

## 📐 EXPECTED BEHAVIOR

```
# Example 1: Basic IVA question (Spanish)
User: "¿Cuánto es el IVA en México?"
Assistant: "El IVA (Impuesto al Valor Agregado) en México tiene tres tasas:
- **16%** — tasa general, aplica a la mayoría de bienes y servicios
- **8%** — zona fronteriza (ciudades fronterizas del norte)
- **0%** — alimentos sin procesar, medicinas, libros
- **Exento** — algunos servicios médicos, educación

Para tu negocio con régimen 601, debes declarar el IVA mensualmente
antes del día 17 del mes siguiente."
[rag_sources: tax_guide.md — IVA section, confidence: 0.88]

# Example 2: Context-aware question
User: "¿Cuándo tengo que pagar mis impuestos?"
[with context: tax_regime="626" (RESICO)]
Assistant: "Como contribuyente en RESICO (Régimen Simplificado de Confianza),
tienes estas obligaciones mensuales:
- ISR: pago mensual definitivo antes del día 17
- IVA: declaración mensual antes del día 17
No presentas declaración anual de ISR en RESICO."

# Example 3: English query
User: "What is a CFDI and why do I need it?"
Assistant: "A CFDI (Comprobante Fiscal Digital por Internet) is Mexico's mandatory
electronic invoice format required by SAT (Mexico's tax authority)..."

# Example 4: Question requiring professional advice
User: "¿Cómo puedo pagar menos impuestos reorganizando mi empresa?"
Assistant: "Las estrategias de reestructura corporativa son un área especializada
que requiere análisis detallado de tu situación específica. Te recomiendo
consultar con un contador público certificado (CPC)..."
[requires_professional_advice: true, confidence: 0.65]

# Example 5: Multi-turn conversation
User: "¿Qué es el complemento de pago?"
Assistant: "El complemento de pago es un tipo de CFDI..."
User: "¿Y cuándo es obligatorio usarlo?"
Assistant: [has context from previous message] "Es obligatorio cuando recibes
un pago en parcialidades o diferido, es decir..."
```

---

## 🧪 TESTING REQUIREMENTS

**All new tests go in `ai-service/tests/`.**

Coverage targets:
- `app/services/llm.py` → ≥ 85% coverage
- `app/services/rag.py` → ≥ 90% coverage
- `app/services/conversation.py` → ≥ 85% coverage
- `app/routers/assistant.py` → ≥ 85% coverage
- `scripts/load_knowledge_base.py` → ≥ 80% coverage
- `apps/web/lib/assistant/chat-client.ts` → ≥ 80% coverage

**Mock strategy:**
- Mock `ollama.AsyncClient` — return fixture responses, never call real Ollama
- Mock `openai.AsyncOpenAI` — same approach
- Use `MockEmbeddingService` from existing `conftest.py` for RAG tests
- Mock DB session for conversation manager tests

**Update `tests/conftest.py`** (add to existing fixtures):
```python
SAMPLE_TAX_QUESTION = "¿Cuánto es el IVA en México?"
SAMPLE_ASSISTANT_RESPONSE = "El IVA en México es 16% en general..."

@pytest.fixture
def mock_llm_service():
    """Returns a mock LLMService that returns SAMPLE_ASSISTANT_RESPONSE."""
    ...

@pytest.fixture
def mock_rag_service():
    """Returns a mock RAGService that returns empty context."""
    ...

@pytest.fixture
def sample_knowledge_doc():
    """A sample knowledge base document dict for testing."""
    ...
```

**Run tests:**
```bash
cd ai-service
pytest tests/test_llm*.py tests/test_rag*.py tests/test_conversation*.py tests/test_assistant*.py tests/test_load_knowledge*.py -v --cov=app --cov=scripts
```

---

## 📝 COMPLETION SUMMARY REQUIREMENT

When you have finished implementing all steps, write a **Completion Summary** at the end of your response with the following sections:

### Component 11 Completion Summary

**1. What Was Built**
Every file created or modified with a one-line description.

**2. Architecture Overview**
End-to-end flow diagram: Browser → Next.js API route → AI service → Ollama/OpenAI → RAG retrieval → Conversation Manager → Response.

**3. Knowledge Base Contents**
List the 4 knowledge base files, their topic coverage, and approximate chunk count after loading.

**4. Database Changes**
Tables created: `conversations`, `conversation_messages`, `knowledge_base`. Column list, indexes, migration file name.

**5. API Endpoints**
Table: method, path, auth required, description.

**6. LLM Behavior**
Describe: Ollama availability check, fallback trigger conditions, graceful error response, streaming format.

**7. RAG Pipeline**
Describe: document chunking strategy, embedding approach (reuse from Component 09), similarity threshold, how context is injected into the prompt.

**8. Test Coverage**
List each test file and test count. Total new tests added by this component.

**9. Integration Points**
- Component 09: EmbeddingService reused for RAG
- Component 10: OCR results could be passed as context (future)
- Component 27: WhatsApp Bot will call this same assistant router
- Component 12+: Invoice data context injection when available

**10. Environment Variables Added**
All new env vars with descriptions and example values.

**11. Limitations & Future Improvements**
Specific: Llama 3.1 8B accuracy on complex tax questions, knowledge base staleness (SAT changes regulations), lack of real-time SAT data integration, GPU acceleration, knowledge base update automation.

**12. How to Verify It Works**
Step-by-step: start Ollama, load knowledge base, start service, test curl commands.

---

## ✅ DEFINITION OF DONE

Component 11 is complete when:

- [ ] All files exist in the specified locations
- [ ] `supabase/migrations/20250101000011_add_chatbot_tables.sql` exists
- [ ] `app/knowledge/` directory contains 4 `.md` knowledge files
- [ ] `scripts/load_knowledge_base.py` successfully chunks and embeds all 4 knowledge files
- [ ] `POST /api/v1/assistant/chat` returns a valid `ChatResponse` with `requires_professional_advice` field
- [ ] Multi-turn conversations: second message in same `conversation_id` receives history context
- [ ] Streaming endpoint returns `text/event-stream` with correct SSE format
- [ ] Ollama fallback: service returns a valid response when Ollama is unavailable (mock test)
- [ ] RAG retrieval: response for "¿qué es el IVA?" includes `rag_sources` from `tax_guide.md`
- [ ] Conversation summarization triggers after threshold (unit test)
- [ ] `GET /health` now includes `ollama_available` and `knowledge_base_docs` fields
- [ ] `apps/web/lib/assistant/chat-client.ts` exists and exports `sendMessage`, `streamMessage`
- [ ] `apps/web/app/api/assistant/chat/route.ts` exists and proxies to AI service
- [ ] All unit tests pass
- [ ] Coverage targets met for all new files
- [ ] Completion Summary written at end of response
