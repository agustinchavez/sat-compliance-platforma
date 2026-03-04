#!/usr/bin/env python3
"""
Script to download and load the official SAT catalog (c_ClaveProdServ)
into the sat_product_codes table.

Usage:
    python scripts/load_sat_catalog.py
    python scripts/load_sat_catalog.py --csv path/to/local_file.csv
    python scripts/load_sat_catalog.py --xlsx path/to/catCFDI.xlsx
    python scripts/load_sat_catalog.py --dry-run

SAT Catalog source:
    http://omawww.sat.gob.mx/tramitesyservicios/Paginas/documentos/catCFDI.xls
    (This is an Excel file; download and convert or use the CSV export)
"""

import argparse
import logging
import os
import sys
from pathlib import Path

import pandas as pd
import psycopg2
from psycopg2.extras import execute_values
import requests
from tqdm import tqdm

# Add project root to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

from dotenv import load_dotenv

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)

# SAT catalog URLs
SAT_CATALOG_URL = "http://omawww.sat.gob.mx/tramitesyservicios/Paginas/documentos/catCFDI.xls"


def download_sat_catalog(output_path: str = "data/catCFDI.xlsx") -> str:
    """
    Download the official SAT catalog Excel file.
    Returns the local path to the downloaded file.
    Raises an error with a helpful message if the URL is unreachable.
    """
    output_dir = Path(output_path).parent
    output_dir.mkdir(parents=True, exist_ok=True)

    logger.info(f"Downloading SAT catalog from {SAT_CATALOG_URL}")

    try:
        response = requests.get(SAT_CATALOG_URL, timeout=60, stream=True)
        response.raise_for_status()

        total_size = int(response.headers.get("content-length", 0))

        with open(output_path, "wb") as f:
            with tqdm(total=total_size, unit="B", unit_scale=True, desc="Downloading") as pbar:
                for chunk in response.iter_content(chunk_size=8192):
                    f.write(chunk)
                    pbar.update(len(chunk))

        logger.info(f"Downloaded to {output_path}")
        return output_path

    except requests.RequestException as e:
        logger.error(f"Failed to download SAT catalog: {e}")
        logger.error(
            "The SAT website may have changed. Please download the catalog manually from:\n"
            "https://www.sat.gob.mx/consultas/35025/catalogo-de-productos-y-servicios\n"
            "Then run: python scripts/load_sat_catalog.py --xlsx /path/to/downloaded.xlsx"
        )
        raise


def parse_excel(file_path: str) -> list[dict]:
    """
    Parse SAT catalog Excel file.
    Expected sheet: c_ClaveProdServ
    Expected columns: c_ClaveProdServ, Descripción
    Returns list of dicts: [{code, name, description, division}, ...]
    """
    logger.info(f"Parsing Excel file: {file_path}")

    try:
        # Read the specific sheet with product codes
        df = pd.read_excel(
            file_path,
            sheet_name="c_ClaveProdServ",
            dtype=str,
        )
    except ValueError:
        # Try reading first sheet if specific sheet not found
        logger.warning("Sheet 'c_ClaveProdServ' not found, trying first sheet")
        df = pd.read_excel(file_path, sheet_name=0, dtype=str)

    logger.info(f"Found columns: {df.columns.tolist()}")

    # Normalize column names (handle variations)
    df.columns = df.columns.str.strip().str.lower()

    # Map possible column names
    code_col = None
    name_col = None

    for col in df.columns:
        if "claveprodserv" in col or "clave" in col:
            code_col = col
        elif "descripción" in col or "descripcion" in col or "description" in col:
            name_col = col

    if not code_col:
        # Assume first column is code
        code_col = df.columns[0]
    if not name_col:
        # Assume second column is name
        name_col = df.columns[1] if len(df.columns) > 1 else df.columns[0]

    logger.info(f"Using code column: {code_col}, name column: {name_col}")

    records = []
    skipped = 0

    for _, row in tqdm(df.iterrows(), total=len(df), desc="Parsing rows"):
        code = str(row.get(code_col, "")).strip()
        name = str(row.get(name_col, "")).strip()

        # Skip invalid rows
        if not code or code == "nan" or not name or name == "nan":
            skipped += 1
            continue

        # Extract division (first 2 digits)
        division = code[:2] if len(code) >= 2 else None

        records.append({
            "code": code[:8],  # Ensure max 8 chars
            "name": name[:500],  # Ensure max 500 chars
            "description": None,  # No separate description in SAT catalog
            "division": division,
        })

    logger.info(f"Parsed {len(records)} records, skipped {skipped} invalid rows")
    return records


def parse_csv(file_path: str) -> list[dict]:
    """
    Parse SAT catalog CSV file.
    Expected columns: ClaveProdServ, Descripcion, Division (optional)
    Returns list of dicts: [{code, name, description, division}, ...]
    Handles encoding issues (Latin-1 / UTF-8 mixed files common in SAT data).
    """
    logger.info(f"Parsing CSV file: {file_path}")

    # Try different encodings
    encodings = ["utf-8", "latin-1", "cp1252", "iso-8859-1"]

    df = None
    for encoding in encodings:
        try:
            df = pd.read_csv(file_path, dtype=str, encoding=encoding)
            logger.info(f"Successfully read CSV with {encoding} encoding")
            break
        except UnicodeDecodeError:
            continue

    if df is None:
        raise ValueError(f"Could not read CSV file with any supported encoding")

    # Normalize column names
    df.columns = df.columns.str.strip().str.lower()

    logger.info(f"Found columns: {df.columns.tolist()}")

    # Map possible column names
    code_col = None
    name_col = None
    desc_col = None
    div_col = None

    for col in df.columns:
        col_lower = col.lower()
        if "claveprodserv" in col_lower or "code" in col_lower or "clave" in col_lower:
            code_col = col
        elif "nombre" in col_lower or "name" in col_lower:
            name_col = col
        elif "descripcion" in col_lower or "description" in col_lower:
            desc_col = col
        elif "division" in col_lower:
            div_col = col

    # Default to first columns if not found
    if not code_col:
        code_col = df.columns[0]
    if not name_col:
        name_col = desc_col if desc_col else (df.columns[1] if len(df.columns) > 1 else df.columns[0])

    logger.info(f"Using columns - code: {code_col}, name: {name_col}")

    records = []
    skipped = 0

    for _, row in tqdm(df.iterrows(), total=len(df), desc="Parsing rows"):
        code = str(row.get(code_col, "")).strip()
        name = str(row.get(name_col, "")).strip()
        description = str(row.get(desc_col, "")).strip() if desc_col else None
        division = str(row.get(div_col, "")).strip() if div_col else None

        # Skip invalid rows
        if not code or code == "nan" or not name or name == "nan":
            skipped += 1
            continue

        # Extract division from code if not provided
        if not division or division == "nan":
            division = code[:2] if len(code) >= 2 else None

        # Clean up description
        if description == "nan":
            description = None

        records.append({
            "code": code[:8],
            "name": name[:500],
            "description": description[:2000] if description else None,
            "division": division[:2] if division else None,
        })

    logger.info(f"Parsed {len(records)} records, skipped {skipped} invalid rows")
    return records


def insert_into_db(records: list[dict], batch_size: int = 1000, dry_run: bool = False) -> int:
    """
    Upsert records into sat_product_codes using psycopg2.
    Uses ON CONFLICT (code) DO UPDATE to handle re-runs.
    Returns total rows inserted/updated.
    """
    if dry_run:
        logger.info(f"DRY RUN: Would insert {len(records)} records")
        return len(records)

    database_url = os.getenv("DATABASE_URL_SYNC")
    if not database_url:
        # Try to construct from DATABASE_URL
        async_url = os.getenv("DATABASE_URL", "")
        if async_url.startswith("postgresql+asyncpg://"):
            database_url = async_url.replace("postgresql+asyncpg://", "postgresql://")
        else:
            raise ValueError("DATABASE_URL_SYNC environment variable not set")

    logger.info(f"Connecting to database...")

    conn = psycopg2.connect(database_url)
    cur = conn.cursor()

    total_inserted = 0

    try:
        for i in tqdm(range(0, len(records), batch_size), desc="Inserting batches"):
            batch = records[i:i + batch_size]

            # Prepare values for execute_values
            values = [
                (r["code"], r["name"], r["description"], r["division"])
                for r in batch
            ]

            execute_values(
                cur,
                """
                INSERT INTO sat_product_codes (code, name, description, division)
                VALUES %s
                ON CONFLICT (code) DO UPDATE SET
                    name = EXCLUDED.name,
                    description = EXCLUDED.description,
                    division = EXCLUDED.division
                """,
                values,
                template="(%s, %s, %s, %s)"
            )

            total_inserted += len(batch)

            # Log progress every 10,000 records
            if total_inserted % 10000 == 0:
                logger.info(f"Progress: {total_inserted} / {len(records)} records")

        conn.commit()
        logger.info(f"Successfully inserted/updated {total_inserted} records")

    except Exception as e:
        conn.rollback()
        logger.error(f"Error inserting records: {e}")
        raise

    finally:
        cur.close()
        conn.close()

    return total_inserted


def main():
    parser = argparse.ArgumentParser(
        description="Load SAT product catalog into the database"
    )
    parser.add_argument(
        "--csv",
        type=str,
        help="Path to local CSV file (skip download)"
    )
    parser.add_argument(
        "--xlsx",
        type=str,
        help="Path to local Excel file (skip download)"
    )
    parser.add_argument(
        "--batch-size",
        type=int,
        default=1000,
        help="Batch size for database inserts (default: 1000)"
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Parse files but don't insert into database"
    )
    parser.add_argument(
        "--download-only",
        action="store_true",
        help="Only download the catalog, don't parse or insert"
    )

    args = parser.parse_args()

    try:
        # Determine input file
        if args.csv:
            records = parse_csv(args.csv)
        elif args.xlsx:
            records = parse_excel(args.xlsx)
        else:
            # Download from SAT
            file_path = download_sat_catalog()

            if args.download_only:
                logger.info(f"Downloaded to {file_path}. Exiting.")
                return

            records = parse_excel(file_path)

        if not records:
            logger.error("No records to insert")
            return

        # Insert into database
        total = insert_into_db(records, args.batch_size, args.dry_run)

        logger.info(f"Complete! Total records: {total}")

    except Exception as e:
        logger.error(f"Failed: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
