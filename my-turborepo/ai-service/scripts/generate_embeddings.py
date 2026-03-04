#!/usr/bin/env python3
"""
Script to generate and store embeddings for all SAT product codes.
Must be run AFTER load_sat_catalog.py has populated the sat_product_codes table.

Usage:
    python scripts/generate_embeddings.py
    python scripts/generate_embeddings.py --batch-size 128 --force-regenerate
    python scripts/generate_embeddings.py --dry-run

Expected runtime: ~10-30 minutes for 55,000 codes (CPU), ~2-5 minutes (GPU).
"""

import argparse
import logging
import os
import sys
from pathlib import Path

import psycopg2
from psycopg2.extras import execute_values
from tqdm import tqdm
from sentence_transformers import SentenceTransformer

# Add project root to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

from dotenv import load_dotenv

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)

# Default embedding model
DEFAULT_MODEL = "paraphrase-multilingual-MiniLM-L12-v2"


def get_database_url() -> str:
    """Get synchronous database URL from environment."""
    database_url = os.getenv("DATABASE_URL_SYNC")
    if not database_url:
        async_url = os.getenv("DATABASE_URL", "")
        if async_url.startswith("postgresql+asyncpg://"):
            database_url = async_url.replace("postgresql+asyncpg://", "postgresql://")
        else:
            raise ValueError("DATABASE_URL_SYNC environment variable not set")
    return database_url


def load_existing_codes(skip_existing: bool = True) -> list[dict]:
    """
    Load SAT codes from database.
    If skip_existing=True, only loads codes where embedding IS NULL.
    Returns list of {code, name, description} dicts.
    """
    database_url = get_database_url()

    conn = psycopg2.connect(database_url)
    cur = conn.cursor()

    try:
        if skip_existing:
            cur.execute("""
                SELECT code, name, description
                FROM sat_product_codes
                WHERE embedding IS NULL
                ORDER BY code
            """)
            logger.info("Loading codes without embeddings...")
        else:
            cur.execute("""
                SELECT code, name, description
                FROM sat_product_codes
                ORDER BY code
            """)
            logger.info("Loading all codes...")

        rows = cur.fetchall()

        codes = [
            {
                "code": row[0],
                "name": row[1],
                "description": row[2],
            }
            for row in rows
        ]

        logger.info(f"Loaded {len(codes)} codes needing embeddings")
        return codes

    finally:
        cur.close()
        conn.close()


def generate_all_embeddings(
    codes: list[dict],
    model: SentenceTransformer,
    batch_size: int = 64,
) -> list[tuple[str, list[float]]]:
    """
    Generate embeddings for all provided codes.
    Text to embed = f"{code['name']} {code.get('description', '')}".strip()
    Returns list of (code_str, embedding_vector) tuples.
    """
    if not codes:
        return []

    # Prepare texts for embedding
    texts = []
    for code in codes:
        name = code.get("name", "")
        description = code.get("description") or ""
        text = f"{name} {description}".strip().lower()
        # Truncate to 512 chars
        if len(text) > 512:
            text = text[:512]
        texts.append(text)

    logger.info(f"Generating embeddings for {len(texts)} texts...")

    all_embeddings = []
    total_batches = (len(texts) + batch_size - 1) // batch_size

    for i in tqdm(range(0, len(texts), batch_size),
                  total=total_batches,
                  desc="Generating embeddings"):
        batch_texts = texts[i:i + batch_size]
        batch_codes = codes[i:i + batch_size]

        # Generate embeddings for batch
        batch_embeddings = model.encode(
            batch_texts,
            convert_to_numpy=True,
            show_progress_bar=False,
        )

        # Pair codes with embeddings
        for j, embedding in enumerate(batch_embeddings):
            all_embeddings.append((
                batch_codes[j]["code"],
                embedding.tolist()
            ))

    logger.info(f"Generated {len(all_embeddings)} embeddings")
    return all_embeddings


def update_database(
    embeddings: list[tuple[str, list[float]]],
    batch_size: int = 500,
    dry_run: bool = False,
) -> int:
    """
    Store generated embeddings in the database.
    Returns count of updated rows.
    """
    if dry_run:
        logger.info(f"DRY RUN: Would update {len(embeddings)} codes with embeddings")
        return len(embeddings)

    if not embeddings:
        logger.info("No embeddings to update")
        return 0

    database_url = get_database_url()

    conn = psycopg2.connect(database_url)
    cur = conn.cursor()

    total_updated = 0

    try:
        for i in tqdm(range(0, len(embeddings), batch_size),
                      desc="Updating database"):
            batch = embeddings[i:i + batch_size]

            # Prepare values - convert embedding to pgvector format
            values = [
                (code, f"[{','.join(str(x) for x in embedding)}]")
                for code, embedding in batch
            ]

            # Use execute_values for batch update
            execute_values(
                cur,
                """
                UPDATE sat_product_codes AS t
                SET embedding = v.embedding::vector
                FROM (VALUES %s) AS v(code, embedding)
                WHERE t.code = v.code
                """,
                values,
                template="(%s, %s)"
            )

            total_updated += len(batch)

            # Log progress every 5,000 updates
            if total_updated % 5000 == 0:
                logger.info(f"Progress: {total_updated} / {len(embeddings)} codes updated")

        conn.commit()
        logger.info(f"Successfully updated {total_updated} codes with embeddings")

    except Exception as e:
        conn.rollback()
        logger.error(f"Error updating embeddings: {e}")
        raise

    finally:
        cur.close()
        conn.close()

    return total_updated


def verify_embeddings() -> dict:
    """Verify embedding generation by counting rows with embeddings."""
    database_url = get_database_url()

    conn = psycopg2.connect(database_url)
    cur = conn.cursor()

    try:
        cur.execute("SELECT COUNT(*) FROM sat_product_codes")
        total = cur.fetchone()[0]

        cur.execute("SELECT COUNT(*) FROM sat_product_codes WHERE embedding IS NOT NULL")
        with_embeddings = cur.fetchone()[0]

        return {
            "total_codes": total,
            "codes_with_embeddings": with_embeddings,
            "codes_without_embeddings": total - with_embeddings,
            "completion_percentage": round(100 * with_embeddings / total, 2) if total > 0 else 0,
        }

    finally:
        cur.close()
        conn.close()


def main():
    parser = argparse.ArgumentParser(
        description="Generate embeddings for SAT product codes"
    )
    parser.add_argument(
        "--batch-size",
        type=int,
        default=64,
        help="Batch size for embedding generation (default: 64)"
    )
    parser.add_argument(
        "--db-batch-size",
        type=int,
        default=500,
        help="Batch size for database updates (default: 500)"
    )
    parser.add_argument(
        "--force-regenerate",
        action="store_true",
        help="Regenerate embeddings for all codes (including those with existing embeddings)"
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Generate embeddings but don't update database"
    )
    parser.add_argument(
        "--model",
        type=str,
        default=DEFAULT_MODEL,
        help=f"Embedding model to use (default: {DEFAULT_MODEL})"
    )
    parser.add_argument(
        "--verify-only",
        action="store_true",
        help="Only verify current embedding status, don't generate"
    )

    args = parser.parse_args()

    try:
        # Verify only mode
        if args.verify_only:
            stats = verify_embeddings()
            logger.info("Embedding Status:")
            logger.info(f"  Total codes: {stats['total_codes']}")
            logger.info(f"  With embeddings: {stats['codes_with_embeddings']}")
            logger.info(f"  Without embeddings: {stats['codes_without_embeddings']}")
            logger.info(f"  Completion: {stats['completion_percentage']}%")
            return

        # Load codes
        skip_existing = not args.force_regenerate
        codes = load_existing_codes(skip_existing=skip_existing)

        if not codes:
            logger.info("No codes need embeddings. Use --force-regenerate to regenerate all.")
            return

        # Load model
        logger.info(f"Loading embedding model: {args.model}")
        model = SentenceTransformer(args.model)
        logger.info("Model loaded successfully")

        # Generate embeddings
        embeddings = generate_all_embeddings(
            codes,
            model,
            batch_size=args.batch_size,
        )

        # Update database
        total = update_database(
            embeddings,
            batch_size=args.db_batch_size,
            dry_run=args.dry_run,
        )

        # Verify results
        if not args.dry_run:
            stats = verify_embeddings()
            logger.info("\nFinal Status:")
            logger.info(f"  Total codes: {stats['total_codes']}")
            logger.info(f"  With embeddings: {stats['codes_with_embeddings']}")
            logger.info(f"  Completion: {stats['completion_percentage']}%")

        logger.info(f"\nComplete! Updated {total} codes with embeddings")

    except Exception as e:
        logger.error(f"Failed: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
