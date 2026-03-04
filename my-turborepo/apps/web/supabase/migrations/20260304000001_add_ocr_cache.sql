-- ============================================================================
-- SAT COMPLIANCE PLATFORM - OCR Results Cache
-- Migration: 20260304000001_add_ocr_cache
-- Description: Creates table for caching OCR extraction results
-- Component: 10 - Receipt OCR Service
-- ============================================================================

-- ============================================================================
-- Table: ocr_results_cache
-- Purpose: Cache OCR results to avoid reprocessing the same document
-- ============================================================================

CREATE TABLE IF NOT EXISTS ocr_results_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_hash VARCHAR(64) NOT NULL UNIQUE,  -- SHA-256 of file bytes
  file_type VARCHAR(10) NOT NULL,         -- 'jpeg', 'png', 'pdf', 'xml'
  raw_text TEXT,                          -- Full OCR text output
  extracted_data JSONB,                   -- Structured ReceiptData
  confidence_score DECIMAL(4, 3),         -- Overall confidence 0.000-1.000
  processing_time_ms INTEGER,             -- Processing duration
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL
);

-- Index for cache lookup by file hash
CREATE INDEX IF NOT EXISTS idx_ocr_cache_hash ON ocr_results_cache(file_hash);

-- Index for cache expiration cleanup
CREATE INDEX IF NOT EXISTS idx_ocr_cache_expires ON ocr_results_cache(expires_at);

-- Comments
COMMENT ON TABLE ocr_results_cache IS 'Caches OCR extraction results to avoid reprocessing identical files';
COMMENT ON COLUMN ocr_results_cache.file_hash IS 'SHA-256 hash of the original file bytes';
COMMENT ON COLUMN ocr_results_cache.file_type IS 'File type: jpeg, png, webp, pdf, xml';
COMMENT ON COLUMN ocr_results_cache.raw_text IS 'Raw text extracted by Tesseract OCR';
COMMENT ON COLUMN ocr_results_cache.extracted_data IS 'Structured receipt data (ReceiptData JSON)';
COMMENT ON COLUMN ocr_results_cache.confidence_score IS 'Overall extraction confidence (0.0-1.0)';
COMMENT ON COLUMN ocr_results_cache.processing_time_ms IS 'OCR processing time in milliseconds';
COMMENT ON COLUMN ocr_results_cache.expires_at IS 'Cache entry expiration timestamp';

-- ============================================================================
-- RLS (Row Level Security)
-- This is a shared cache, no per-org isolation needed
-- ============================================================================

ALTER TABLE ocr_results_cache ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to read from cache
DROP POLICY IF EXISTS "Authenticated users can read OCR cache" ON ocr_results_cache;
CREATE POLICY "Authenticated users can read OCR cache"
  ON ocr_results_cache
  FOR SELECT
  TO authenticated
  USING (true);

-- Service role has full access for cache writes
DROP POLICY IF EXISTS "Service role has full access to OCR cache" ON ocr_results_cache;
CREATE POLICY "Service role has full access to OCR cache"
  ON ocr_results_cache
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================================================
-- Function: Cleanup expired cache entries
-- ============================================================================

CREATE OR REPLACE FUNCTION cleanup_expired_ocr_cache()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM ocr_results_cache
  WHERE expires_at < NOW();

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

COMMENT ON FUNCTION cleanup_expired_ocr_cache IS 'Removes expired OCR cache entries, returns count of deleted rows';

-- ============================================================================
-- Verification
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '================================';
  RAISE NOTICE 'OCR cache table created successfully';
  RAISE NOTICE '  - ocr_results_cache table with RLS';
  RAISE NOTICE '  - Indexes for hash lookup and expiration';
  RAISE NOTICE '  - Cleanup function for expired entries';
  RAISE NOTICE '================================';
END $$;
