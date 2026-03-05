-- ============================================================================
-- SAT COMPLIANCE PLATFORM - Tax Assistant Chatbot Tables
-- Migration: 20260305000000_add_chatbot_tables
-- Description: Adds conversation history and knowledge base tables for Component 11
-- ============================================================================

-- ============================================================================
-- CONVERSATION HISTORY TABLE
-- ============================================================================

CREATE TABLE conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  title VARCHAR(255),                    -- Auto-generated from first message
  summary TEXT,                          -- LLM-generated summary for long conversations
  message_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL        -- conversation_ttl_days from created_at
);

CREATE INDEX idx_conversations_user ON conversations(user_id);
CREATE INDEX idx_conversations_org ON conversations(organization_id);
CREATE INDEX idx_conversations_expires ON conversations(expires_at);
CREATE INDEX idx_conversations_updated ON conversations(updated_at DESC);

COMMENT ON TABLE conversations IS 'Stores chat conversation sessions for the tax assistant';
COMMENT ON COLUMN conversations.summary IS 'LLM-generated summary for long conversations to compress context';
COMMENT ON COLUMN conversations.expires_at IS 'Conversations expire after conversation_ttl_days (default 30 days)';

-- ============================================================================
-- CONVERSATION MESSAGES TABLE
-- ============================================================================

CREATE TABLE conversation_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role VARCHAR(20) NOT NULL,             -- 'user' | 'assistant' | 'system'
  content TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',           -- tokens_used, model, rag_sources, confidence
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT check_role CHECK (role IN ('user', 'assistant', 'system'))
);

CREATE INDEX idx_messages_conversation ON conversation_messages(conversation_id);
CREATE INDEX idx_messages_created ON conversation_messages(created_at);

COMMENT ON TABLE conversation_messages IS 'Individual messages within a conversation';
COMMENT ON COLUMN conversation_messages.metadata IS 'Stores tokens_used, model_used, rag_sources, confidence score';

-- ============================================================================
-- KNOWLEDGE BASE TABLE (for RAG)
-- ============================================================================

CREATE TABLE knowledge_base (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doc_id VARCHAR(100) NOT NULL UNIQUE,   -- e.g., "tax_guide_iva_section_3"
  source_file VARCHAR(255) NOT NULL,     -- e.g., "tax_guide.md"
  section_title VARCHAR(500),
  content TEXT NOT NULL,
  content_hash VARCHAR(64) NOT NULL,     -- SHA-256 to detect changes
  embedding vector(384),                 -- Uses same dimension as Component 09
  chunk_index INTEGER DEFAULT 0,         -- Position within source file
  metadata JSONB DEFAULT '{}',           -- tags, last_updated, topic
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_knowledge_base_doc_id ON knowledge_base(doc_id);
CREATE INDEX idx_knowledge_base_source ON knowledge_base(source_file);
CREATE INDEX idx_knowledge_base_embedding
  ON knowledge_base USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 10);  -- Small lists for small knowledge base

COMMENT ON TABLE knowledge_base IS 'Chunked and embedded knowledge base documents for RAG retrieval';
COMMENT ON COLUMN knowledge_base.doc_id IS 'Unique identifier: {source_file}_{section_slug}_{chunk_index}';
COMMENT ON COLUMN knowledge_base.content_hash IS 'SHA-256 hash to detect content changes and skip re-embedding';
COMMENT ON COLUMN knowledge_base.embedding IS '384-dimension vector from paraphrase-multilingual-MiniLM-L12-v2';

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge_base ENABLE ROW LEVEL SECURITY;

-- Conversations: Users can only see their own conversations
CREATE POLICY "conversations_select" ON conversations FOR SELECT
  TO authenticated
  USING (user_id IN (
    SELECT id FROM users WHERE auth_id = auth.uid()
  ));

CREATE POLICY "conversations_insert" ON conversations FOR INSERT
  TO authenticated
  WITH CHECK (user_id IN (
    SELECT id FROM users WHERE auth_id = auth.uid()
  ));

CREATE POLICY "conversations_update" ON conversations FOR UPDATE
  TO authenticated
  USING (user_id IN (
    SELECT id FROM users WHERE auth_id = auth.uid()
  ));

CREATE POLICY "conversations_delete" ON conversations FOR DELETE
  TO authenticated
  USING (user_id IN (
    SELECT id FROM users WHERE auth_id = auth.uid()
  ));

-- Conversation messages: Access through conversations
CREATE POLICY "messages_select" ON conversation_messages FOR SELECT
  TO authenticated
  USING (conversation_id IN (
    SELECT id FROM conversations WHERE user_id IN (
      SELECT id FROM users WHERE auth_id = auth.uid()
    )
  ));

CREATE POLICY "messages_insert" ON conversation_messages FOR INSERT
  TO authenticated
  WITH CHECK (conversation_id IN (
    SELECT id FROM conversations WHERE user_id IN (
      SELECT id FROM users WHERE auth_id = auth.uid()
    )
  ));

-- Knowledge base: Read-only for authenticated users (service role can write)
CREATE POLICY "knowledge_base_select" ON knowledge_base FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "knowledge_base_service_all" ON knowledge_base FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Service role full access for conversations (AI service uses service role)
CREATE POLICY "conversations_service_all" ON conversations FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "messages_service_all" ON conversation_messages FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

-- Function to auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_conversation_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER conversations_updated_at
  BEFORE UPDATE ON conversations
  FOR EACH ROW
  EXECUTE FUNCTION update_conversation_timestamp();

CREATE TRIGGER knowledge_base_updated_at
  BEFORE UPDATE ON knowledge_base
  FOR EACH ROW
  EXECUTE FUNCTION update_conversation_timestamp();

-- Function to cleanup expired conversations (run periodically)
CREATE OR REPLACE FUNCTION cleanup_expired_conversations()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM conversations WHERE expires_at < NOW();
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION cleanup_expired_conversations IS 'Deletes expired conversations. Run via pg_cron or scheduled job.';

-- ============================================================================
-- RAG SEARCH FUNCTION
-- ============================================================================

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
        kb.doc_id::text,
        kb.source_file::text,
        kb.section_title::text,
        kb.content::text,
        kb.metadata,
        (1 - (kb.embedding <=> query_embedding))::float AS similarity
    FROM knowledge_base kb
    WHERE 1 - (kb.embedding <=> query_embedding) > match_threshold
    ORDER BY kb.embedding <=> query_embedding
    LIMIT match_count;
END;
$$;

COMMENT ON FUNCTION search_knowledge_base IS 'Search knowledge base using cosine similarity. Returns top-k results above threshold.';

-- Function to increment conversation message count
CREATE OR REPLACE FUNCTION increment_message_count(conv_id UUID)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
    UPDATE conversations
    SET message_count = message_count + 1,
        updated_at = NOW()
    WHERE id = conv_id;
END;
$$;

COMMENT ON FUNCTION increment_message_count IS 'Increments message count and updates timestamp for a conversation.';

-- ============================================================================
-- VERIFICATION
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '================================';
  RAISE NOTICE 'Chatbot tables created successfully';
  RAISE NOTICE '';
  RAISE NOTICE 'Tables created:';
  RAISE NOTICE '  - conversations';
  RAISE NOTICE '  - conversation_messages';
  RAISE NOTICE '  - knowledge_base';
  RAISE NOTICE '';
  RAISE NOTICE 'Indexes created:';
  RAISE NOTICE '  - idx_conversations_user';
  RAISE NOTICE '  - idx_conversations_org';
  RAISE NOTICE '  - idx_conversations_expires';
  RAISE NOTICE '  - idx_messages_conversation';
  RAISE NOTICE '  - idx_knowledge_base_embedding (ivfflat)';
  RAISE NOTICE '';
  RAISE NOTICE 'RLS enabled on all tables';
  RAISE NOTICE '================================';
END $$;
