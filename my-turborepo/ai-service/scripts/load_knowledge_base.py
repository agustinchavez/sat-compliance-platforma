#!/usr/bin/env python3
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

import argparse
import hashlib
import os
import re
import sys
from pathlib import Path
from typing import Optional

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

import psycopg2
from psycopg2.extras import execute_values
from tqdm import tqdm

from app.config import settings


def slugify(text: str) -> str:
    """Convert text to URL-safe slug."""
    # Lowercase and replace spaces/special chars
    text = text.lower()
    text = re.sub(r'[^\w\s-]', '', text)
    text = re.sub(r'[\s_]+', '_', text)
    text = text.strip('_')
    return text[:50]  # Limit length


def compute_content_hash(content: str) -> str:
    """Compute SHA-256 hash of content."""
    return hashlib.sha256(content.encode('utf-8')).hexdigest()


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
    3. Each chunk includes its section title for context
    4. Overlap: include last sentence of previous chunk (for context continuity)

    Returns list of chunk dictionaries.
    """
    chunks = []

    # Split by ## or ### headings
    # Pattern captures the heading marker and title
    section_pattern = r'^(#{2,3})\s+(.+?)$'
    lines = content.split('\n')

    current_section_title = None
    current_section_level = 0
    current_content = []
    parent_title = None

    for line in lines:
        heading_match = re.match(section_pattern, line)

        if heading_match:
            # Save previous section if it has content
            if current_content:
                section_text = '\n'.join(current_content).strip()
                if section_text:
                    section_chunks = _split_section_into_chunks(
                        section_text,
                        current_section_title or "Introduction",
                        source_file,
                        max_chunk_size,
                        len(chunks)
                    )
                    chunks.extend(section_chunks)

            # Start new section
            level = len(heading_match.group(1))
            title = heading_match.group(2).strip()

            if level == 2:
                parent_title = title
                current_section_title = title
            else:  # level == 3
                # Include parent context
                if parent_title:
                    current_section_title = f"{parent_title} > {title}"
                else:
                    current_section_title = title

            current_section_level = level
            current_content = []
        else:
            current_content.append(line)

    # Don't forget the last section
    if current_content:
        section_text = '\n'.join(current_content).strip()
        if section_text:
            section_chunks = _split_section_into_chunks(
                section_text,
                current_section_title or "Introduction",
                source_file,
                max_chunk_size,
                len(chunks)
            )
            chunks.extend(section_chunks)

    return chunks


def _split_section_into_chunks(
    content: str,
    section_title: str,
    source_file: str,
    max_chunk_size: int,
    start_index: int,
) -> list[dict]:
    """Split a section into chunks if it exceeds max_chunk_size words."""
    words = content.split()
    word_count = len(words)

    if word_count <= max_chunk_size:
        # Section fits in one chunk
        return [{
            'doc_id': generate_doc_id(source_file, section_title, start_index),
            'source_file': source_file,
            'section_title': section_title,
            'content': f"## {section_title}\n\n{content}",
            'content_hash': compute_content_hash(content),
            'chunk_index': start_index,
            'metadata': {'word_count': word_count, 'topics': extract_topics(content)}
        }]

    # Need to split into multiple chunks
    chunks = []
    paragraphs = content.split('\n\n')
    current_chunk = []
    current_word_count = 0
    chunk_index = start_index

    for para in paragraphs:
        para_words = len(para.split())

        if current_word_count + para_words > max_chunk_size and current_chunk:
            # Save current chunk
            chunk_content = '\n\n'.join(current_chunk)
            chunks.append({
                'doc_id': generate_doc_id(source_file, section_title, chunk_index),
                'source_file': source_file,
                'section_title': section_title,
                'content': f"## {section_title}\n\n{chunk_content}",
                'content_hash': compute_content_hash(chunk_content),
                'chunk_index': chunk_index,
                'metadata': {'word_count': current_word_count, 'topics': extract_topics(chunk_content)}
            })
            chunk_index += 1

            # Start new chunk with overlap (last sentence of previous)
            overlap = get_last_sentence(chunk_content)
            current_chunk = [overlap, para] if overlap else [para]
            current_word_count = len(' '.join(current_chunk).split())
        else:
            current_chunk.append(para)
            current_word_count += para_words

    # Don't forget last chunk
    if current_chunk:
        chunk_content = '\n\n'.join(current_chunk)
        chunks.append({
            'doc_id': generate_doc_id(source_file, section_title, chunk_index),
            'source_file': source_file,
            'section_title': section_title,
            'content': f"## {section_title}\n\n{chunk_content}",
            'content_hash': compute_content_hash(chunk_content),
            'chunk_index': chunk_index,
            'metadata': {'word_count': len(chunk_content.split()), 'topics': extract_topics(chunk_content)}
        })

    return chunks


def get_last_sentence(text: str) -> str:
    """Get the last sentence of text for overlap."""
    # Simple sentence splitting
    sentences = re.split(r'[.!?]\s+', text)
    if len(sentences) >= 2:
        return sentences[-2] + '.'  # Return second-to-last with period
    return ""


def extract_topics(content: str) -> list[str]:
    """Extract topic keywords from content."""
    # Look for key tax terms
    topics = []
    keywords = [
        'IVA', 'ISR', 'IEPS', 'CFDI', 'RFC', 'SAT', 'RESICO', 'RIF',
        'retención', 'deducción', 'declaración', 'factura', 'impuesto',
        'régimen', 'complemento', 'nómina', 'pago', 'cancelación'
    ]
    content_lower = content.lower()
    for kw in keywords:
        if kw.lower() in content_lower:
            topics.append(kw)
    return topics[:5]  # Limit to 5 topics


def generate_doc_id(source_file: str, section_title: str, chunk_index: int) -> str:
    """Generate a stable, unique doc_id from source and section."""
    base = source_file.replace('.md', '')
    section_slug = slugify(section_title)
    return f"{base}_{section_slug}_{chunk_index}"


def load_and_embed_documents(
    knowledge_dir: str,
    db_url: str,
    force_update: bool = False,
    target_file: Optional[str] = None,
    dry_run: bool = False,
) -> int:
    """
    Main function: reads .md files, chunks them, generates embeddings,
    upserts into knowledge_base table.

    Returns count of docs inserted/updated.
    """
    from app.services.embedding import EmbeddingService
    import asyncio

    knowledge_path = Path(knowledge_dir)
    if not knowledge_path.exists():
        print(f"Error: Knowledge directory not found: {knowledge_dir}")
        return 0

    # Find markdown files
    if target_file:
        md_files = [knowledge_path / target_file]
        if not md_files[0].exists():
            print(f"Error: File not found: {target_file}")
            return 0
    else:
        md_files = list(knowledge_path.glob("*.md"))

    if not md_files:
        print("No markdown files found in knowledge directory")
        return 0

    print(f"Found {len(md_files)} markdown file(s)")

    # Collect all chunks
    all_chunks = []
    for md_file in md_files:
        print(f"\nProcessing: {md_file.name}")
        content = md_file.read_text(encoding='utf-8')
        chunks = chunk_markdown_document(content, md_file.name)
        print(f"  → {len(chunks)} chunks")
        all_chunks.extend(chunks)

    print(f"\nTotal chunks: {len(all_chunks)}")

    if dry_run:
        print("\n=== DRY RUN - Preview of chunks ===")
        for i, chunk in enumerate(all_chunks[:10]):  # Show first 10
            print(f"\n--- Chunk {i+1}: {chunk['doc_id']} ---")
            print(f"Section: {chunk['section_title']}")
            print(f"Words: {chunk['metadata']['word_count']}")
            print(f"Topics: {chunk['metadata']['topics']}")
            preview = chunk['content'][:200] + "..." if len(chunk['content']) > 200 else chunk['content']
            print(f"Preview: {preview}")
        if len(all_chunks) > 10:
            print(f"\n... and {len(all_chunks) - 10} more chunks")
        return 0

    # Initialize embedding service
    print("\nLoading embedding model...")
    embedding_service = asyncio.run(EmbeddingService.get_instance())

    # Connect to database
    print("Connecting to database...")
    conn = psycopg2.connect(db_url)
    cursor = conn.cursor()

    # Check existing documents (skip unchanged)
    if not force_update:
        cursor.execute("SELECT doc_id, content_hash FROM knowledge_base")
        existing = {row[0]: row[1] for row in cursor.fetchall()}
        print(f"Found {len(existing)} existing documents in database")
    else:
        existing = {}
        print("Force update: will re-embed all documents")

    # Filter to new/changed documents
    to_process = []
    skipped = 0
    for chunk in all_chunks:
        if chunk['doc_id'] in existing:
            if existing[chunk['doc_id']] == chunk['content_hash']:
                skipped += 1
                continue
        to_process.append(chunk)

    print(f"Skipping {skipped} unchanged documents")
    print(f"Processing {len(to_process)} new/changed documents")

    if not to_process:
        print("Nothing to update!")
        conn.close()
        return 0

    # Generate embeddings in batches
    print("\nGenerating embeddings...")
    contents = [chunk['content'] for chunk in to_process]
    embeddings = embedding_service.generate_batch_embeddings_sync(contents, batch_size=32)

    # Upsert into database
    print("Upserting into database...")
    import json

    for chunk, embedding in tqdm(zip(to_process, embeddings), total=len(to_process)):
        cursor.execute("""
            INSERT INTO knowledge_base
            (doc_id, source_file, section_title, content, content_hash, embedding, chunk_index, metadata)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (doc_id) DO UPDATE SET
                source_file = EXCLUDED.source_file,
                section_title = EXCLUDED.section_title,
                content = EXCLUDED.content,
                content_hash = EXCLUDED.content_hash,
                embedding = EXCLUDED.embedding,
                chunk_index = EXCLUDED.chunk_index,
                metadata = EXCLUDED.metadata,
                updated_at = NOW()
        """, (
            chunk['doc_id'],
            chunk['source_file'],
            chunk['section_title'],
            chunk['content'],
            chunk['content_hash'],
            embedding,
            chunk['chunk_index'],
            json.dumps(chunk['metadata'])
        ))

    conn.commit()
    print(f"\n✓ Successfully upserted {len(to_process)} documents")

    # Show summary
    cursor.execute("""
        SELECT source_file, COUNT(*) as chunks
        FROM knowledge_base
        GROUP BY source_file
        ORDER BY source_file
    """)
    print("\n=== Knowledge Base Summary ===")
    for row in cursor.fetchall():
        print(f"  {row[0]}: {row[1]} chunks")

    cursor.execute("SELECT COUNT(*) FROM knowledge_base WHERE embedding IS NOT NULL")
    total_embedded = cursor.fetchone()[0]
    print(f"\nTotal embedded documents: {total_embedded}")

    conn.close()
    return len(to_process)


def main():
    parser = argparse.ArgumentParser(
        description="Load and embed knowledge base documents for RAG"
    )
    parser.add_argument(
        "--force-update",
        action="store_true",
        help="Re-embed all documents, even if unchanged"
    )
    parser.add_argument(
        "--file",
        type=str,
        help="Process only this specific file"
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Preview chunks without embedding or database operations"
    )
    parser.add_argument(
        "--knowledge-dir",
        type=str,
        default=settings.knowledge_base_dir,
        help="Path to knowledge base directory"
    )

    args = parser.parse_args()

    # Get sync database URL
    db_url = settings.database_url_sync
    if not db_url:
        # Convert async URL to sync
        db_url = settings.database_url.replace('+asyncpg', '').replace('postgresql+asyncpg', 'postgresql')

    print("=" * 50)
    print("Knowledge Base Loader")
    print("=" * 50)
    print(f"Knowledge directory: {args.knowledge_dir}")
    print(f"Database: {db_url.split('@')[1] if '@' in db_url else 'configured'}")
    print(f"Force update: {args.force_update}")
    print(f"Dry run: {args.dry_run}")
    print("=" * 50)

    count = load_and_embed_documents(
        knowledge_dir=args.knowledge_dir,
        db_url=db_url,
        force_update=args.force_update,
        target_file=args.file,
        dry_run=args.dry_run,
    )

    print(f"\nDone! Processed {count} documents.")


if __name__ == "__main__":
    main()
