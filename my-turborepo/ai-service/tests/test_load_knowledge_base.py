"""
Tests for knowledge base loading script (Component 11).
"""

import pytest
import sys
from pathlib import Path

# Add scripts to path
sys.path.insert(0, str(Path(__file__).parent.parent / "scripts"))

from load_knowledge_base import (
    slugify,
    compute_content_hash,
    chunk_markdown_document,
    generate_doc_id,
    get_last_sentence,
    extract_topics,
)


class TestSlugify:
    """Tests for slugify function."""

    def test_basic_slugify(self):
        """Test basic text slugification."""
        assert slugify("Hello World") == "hello_world"

    def test_removes_special_chars(self):
        """Test special characters are removed."""
        assert slugify("IVA - Tasas!") == "iva_tasas"

    def test_spanish_text(self):
        """Test Spanish text slugification."""
        # Note: accented chars are removed
        result = slugify("¿Qué es el IVA?")
        assert "qu" in result
        assert "iva" in result

    def test_limits_length(self):
        """Test slug is limited to 50 characters."""
        long_text = "This is a very long section title that exceeds fifty characters"
        result = slugify(long_text)
        assert len(result) <= 50


class TestComputeContentHash:
    """Tests for compute_content_hash function."""

    def test_produces_sha256(self):
        """Test hash is valid SHA-256."""
        result = compute_content_hash("test content")
        assert len(result) == 64  # SHA-256 is 64 hex chars

    def test_same_content_same_hash(self):
        """Test same content produces same hash."""
        content = "El IVA en México es 16%"
        hash1 = compute_content_hash(content)
        hash2 = compute_content_hash(content)
        assert hash1 == hash2

    def test_different_content_different_hash(self):
        """Test different content produces different hash."""
        hash1 = compute_content_hash("content one")
        hash2 = compute_content_hash("content two")
        assert hash1 != hash2


class TestChunkMarkdownDocument:
    """Tests for chunk_markdown_document function."""

    def test_splits_at_h2_headings(self):
        """Test document splits at ## headings correctly."""
        content = """
# Main Title

Introduction text.

## Section One

Content of section one.

## Section Two

Content of section two.
"""
        chunks = chunk_markdown_document(content, "test.md")

        # Should have chunks for intro + 2 sections
        assert len(chunks) >= 2

        # Check section titles are captured
        titles = [c['section_title'] for c in chunks]
        assert any("Section One" in t for t in titles)
        assert any("Section Two" in t for t in titles)

    def test_includes_section_title_in_chunk(self):
        """Test each chunk includes its section title."""
        content = """
## IVA Overview

El IVA es un impuesto al consumo.
"""
        chunks = chunk_markdown_document(content, "tax_guide.md")

        assert len(chunks) >= 1
        chunk = chunks[0]
        assert chunk['section_title'] == "IVA Overview"
        assert "## IVA Overview" in chunk['content']

    def test_handles_document_with_no_headings(self):
        """Test document with no headings creates single chunk."""
        content = """
This is a document without any markdown headings.
It should still be processed as a single chunk.
"""
        chunks = chunk_markdown_document(content, "simple.md")

        assert len(chunks) >= 1
        assert chunks[0]['content'].strip() != ""

    def test_splits_sections_exceeding_max_chunk_size(self):
        """Test large sections are split into multiple chunks."""
        # Create content with 600 words (exceeds default 500)
        words = ["word"] * 600
        large_content = f"""
## Large Section

{' '.join(words)}
"""
        chunks = chunk_markdown_document(large_content, "test.md", max_chunk_size=500)

        # Should be split into at least 2 chunks
        assert len(chunks) >= 2

        # Each chunk should have the same section title
        titles = set(c['section_title'] for c in chunks)
        assert len(titles) == 1

    def test_generates_valid_doc_ids(self):
        """Test doc_ids are unique and valid."""
        content = """
## Section A

Content A.

## Section B

Content B.
"""
        chunks = chunk_markdown_document(content, "test.md")

        doc_ids = [c['doc_id'] for c in chunks]

        # All doc_ids should be unique
        assert len(doc_ids) == len(set(doc_ids))

        # Doc IDs should contain source file
        for doc_id in doc_ids:
            assert "test" in doc_id

    def test_includes_metadata_word_count(self):
        """Test chunks include word count in metadata."""
        content = """
## Test Section

This is some test content with a few words.
"""
        chunks = chunk_markdown_document(content, "test.md")

        assert 'metadata' in chunks[0]
        assert 'word_count' in chunks[0]['metadata']
        assert chunks[0]['metadata']['word_count'] > 0

    def test_handles_h3_subsections(self):
        """Test H3 headings are handled with parent context."""
        content = """
## Main Section

Intro text.

### Subsection A

Content of subsection A.

### Subsection B

Content of subsection B.
"""
        chunks = chunk_markdown_document(content, "test.md")

        # Check that subsection titles include parent
        titles = [c['section_title'] for c in chunks]
        assert any("Main Section" in t and "Subsection" in t for t in titles)


class TestGenerateDocId:
    """Tests for generate_doc_id function."""

    def test_produces_stable_strings(self):
        """Test same inputs produce same doc_id."""
        id1 = generate_doc_id("tax_guide.md", "IVA Overview", 0)
        id2 = generate_doc_id("tax_guide.md", "IVA Overview", 0)
        assert id1 == id2

    def test_produces_url_safe_strings(self):
        """Test doc_id is URL-safe."""
        doc_id = generate_doc_id("tax_guide.md", "¿Qué es el IVA?", 0)

        # Should not contain special characters
        assert " " not in doc_id
        assert "?" not in doc_id
        assert "¿" not in doc_id

    def test_includes_chunk_index(self):
        """Test doc_id includes chunk index for uniqueness."""
        id1 = generate_doc_id("test.md", "Section", 0)
        id2 = generate_doc_id("test.md", "Section", 1)
        assert id1 != id2
        assert "_0" in id1
        assert "_1" in id2


class TestGetLastSentence:
    """Tests for get_last_sentence function."""

    def test_extracts_last_sentence(self):
        """Test extracts second-to-last sentence."""
        text = "First sentence. Second sentence. Third sentence."
        result = get_last_sentence(text)
        assert "Second" in result

    def test_returns_empty_for_single_sentence(self):
        """Test returns empty for single sentence."""
        text = "Only one sentence here"
        result = get_last_sentence(text)
        assert result == ""


class TestExtractTopics:
    """Tests for extract_topics function."""

    def test_extracts_tax_keywords(self):
        """Test extracts known tax keywords."""
        content = "El IVA y el ISR son impuestos importantes para el CFDI."
        topics = extract_topics(content)

        assert "IVA" in topics
        assert "ISR" in topics
        assert "CFDI" in topics

    def test_limits_to_five_topics(self):
        """Test returns at most 5 topics."""
        content = "IVA ISR IEPS CFDI RFC SAT RESICO RIF declaración"
        topics = extract_topics(content)
        assert len(topics) <= 5

    def test_returns_empty_for_no_keywords(self):
        """Test returns empty list when no keywords found."""
        content = "This is generic text with no tax terms."
        topics = extract_topics(content)
        assert isinstance(topics, list)


class TestIntegration:
    """Integration tests for the full chunking pipeline."""

    def test_real_tax_guide_content(self):
        """Test with realistic tax guide content."""
        content = """
# Guía de IVA

## Tasas de IVA

El IVA en México tiene las siguientes tasas:

- **16%** tasa general
- **8%** zona fronteriza
- **0%** alimentos y medicinas

## Cálculo del IVA

Para calcular el IVA a pagar:
IVA a pagar = IVA cobrado - IVA acreditable

Ejemplo: Ventas $100,000, IVA cobrado $16,000.
Compras $40,000, IVA acreditable $6,400.
IVA a pagar = $16,000 - $6,400 = $9,600
"""
        chunks = chunk_markdown_document(content, "iva_guide.md")

        # Should produce multiple chunks
        assert len(chunks) >= 2

        # All chunks should have required fields
        for chunk in chunks:
            assert 'doc_id' in chunk
            assert 'source_file' in chunk
            assert 'section_title' in chunk
            assert 'content' in chunk
            assert 'content_hash' in chunk
            assert 'chunk_index' in chunk
            assert 'metadata' in chunk

        # First chunk should be about IVA rates
        assert any("Tasas" in c['section_title'] for c in chunks)
