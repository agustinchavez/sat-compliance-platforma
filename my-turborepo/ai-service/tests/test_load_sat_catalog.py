"""
Tests for the SAT catalog loader script.
"""

import pytest
from unittest.mock import patch, MagicMock
import pandas as pd
import tempfile
import os


class TestParseCsv:
    """Tests for CSV parsing functionality."""

    def test_parse_csv_valid_file(self):
        """Test parsing a valid CSV file."""
        from scripts.load_sat_catalog import parse_csv

        # Create a temporary CSV file
        with tempfile.NamedTemporaryFile(mode='w', suffix='.csv', delete=False) as f:
            f.write("code,name,description\n")
            f.write("43211503,Computadoras portátiles,Laptops\n")
            f.write("81112100,Servicios de consultoría,Consultoría IT\n")
            f.write("44121600,Suministros de oficina,Papelería\n")
            temp_path = f.name

        try:
            records = parse_csv(temp_path)

            assert len(records) == 3
            assert records[0]["code"] == "43211503"
            assert records[0]["name"] == "Computadoras portátiles"
            assert records[0]["division"] == "43"
        finally:
            os.unlink(temp_path)

    def test_parse_csv_skips_empty_rows(self):
        """Test that empty code/name rows are skipped."""
        from scripts.load_sat_catalog import parse_csv

        with tempfile.NamedTemporaryFile(mode='w', suffix='.csv', delete=False) as f:
            f.write("code,name,description\n")
            f.write("43211503,Computadoras,Laptops\n")
            f.write(",Missing Code,Description\n")  # Empty code
            f.write("44121600,,\n")  # Empty name
            f.write("81112100,Valid,Description\n")
            temp_path = f.name

        try:
            records = parse_csv(temp_path)

            assert len(records) == 2
            assert records[0]["code"] == "43211503"
            assert records[1]["code"] == "81112100"
        finally:
            os.unlink(temp_path)

    def test_parse_csv_handles_latin1_encoding(self):
        """Test parsing CSV with Latin-1 encoding."""
        from scripts.load_sat_catalog import parse_csv

        with tempfile.NamedTemporaryFile(mode='wb', suffix='.csv', delete=False) as f:
            content = "code,name\n43211503,Computadoras portátiles\n".encode('latin-1')
            f.write(content)
            temp_path = f.name

        try:
            records = parse_csv(temp_path)
            assert len(records) == 1
            assert "portátiles" in records[0]["name"]
        finally:
            os.unlink(temp_path)

    def test_parse_csv_extracts_division(self):
        """Test that division is extracted from code."""
        from scripts.load_sat_catalog import parse_csv

        with tempfile.NamedTemporaryFile(mode='w', suffix='.csv', delete=False) as f:
            f.write("code,name\n")
            f.write("43211503,Test Product\n")
            f.write("81112100,Test Service\n")
            temp_path = f.name

        try:
            records = parse_csv(temp_path)

            assert records[0]["division"] == "43"
            assert records[1]["division"] == "81"
        finally:
            os.unlink(temp_path)

    def test_parse_csv_truncates_long_names(self):
        """Test that long names are truncated to 500 chars."""
        from scripts.load_sat_catalog import parse_csv

        long_name = "A" * 600

        with tempfile.NamedTemporaryFile(mode='w', suffix='.csv', delete=False) as f:
            f.write("code,name\n")
            f.write(f"43211503,{long_name}\n")
            temp_path = f.name

        try:
            records = parse_csv(temp_path)

            assert len(records[0]["name"]) == 500
        finally:
            os.unlink(temp_path)


class TestInsertIntoDb:
    """Tests for database insertion functionality."""

    @patch('scripts.load_sat_catalog.psycopg2.connect')
    @patch('scripts.load_sat_catalog.execute_values')
    def test_insert_calls_upsert(self, mock_execute_values, mock_connect):
        """Test that insert uses upsert SQL."""
        from scripts.load_sat_catalog import insert_into_db

        mock_conn = MagicMock()
        mock_cursor = MagicMock()
        mock_conn.cursor.return_value = mock_cursor
        mock_connect.return_value = mock_conn

        records = [
            {"code": "43211503", "name": "Test", "description": None, "division": "43"}
        ]

        with patch.dict(os.environ, {"DATABASE_URL_SYNC": "postgresql://test:test@localhost/test"}):
            count = insert_into_db(records, batch_size=100)

        assert count == 1
        # Verify commit was called
        mock_conn.commit.assert_called_once()
        # Verify execute_values was called
        mock_execute_values.assert_called_once()

    @patch('scripts.load_sat_catalog.psycopg2.connect')
    def test_insert_processes_in_batches(self, mock_connect):
        """Test that insert processes in correct batch sizes."""
        from scripts.load_sat_catalog import insert_into_db
        from psycopg2.extras import execute_values

        mock_conn = MagicMock()
        mock_cursor = MagicMock()
        mock_conn.cursor.return_value = mock_cursor
        mock_connect.return_value = mock_conn

        # Create 250 records to test batching
        records = [
            {"code": f"{i:08d}", "name": f"Test {i}", "description": None, "division": "43"}
            for i in range(250)
        ]

        with patch.dict(os.environ, {"DATABASE_URL_SYNC": "postgresql://test:test@localhost/test"}):
            with patch('scripts.load_sat_catalog.execute_values') as mock_execute:
                count = insert_into_db(records, batch_size=100)

        assert count == 250
        # Should have 3 batch calls (100 + 100 + 50)
        assert mock_execute.call_count == 3

    def test_insert_dry_run(self):
        """Test dry run mode doesn't insert."""
        from scripts.load_sat_catalog import insert_into_db

        records = [
            {"code": "43211503", "name": "Test", "description": None, "division": "43"}
        ]

        count = insert_into_db(records, dry_run=True)

        assert count == 1


class TestIntegration:
    """Integration tests for the loader script."""

    @pytest.mark.integration
    def test_full_pipeline_with_sample_data(self):
        """Test full pipeline with small sample data."""
        from scripts.load_sat_catalog import parse_csv, insert_into_db

        # Create sample CSV
        with tempfile.NamedTemporaryFile(mode='w', suffix='.csv', delete=False) as f:
            f.write("code,name,description\n")
            for i in range(10):
                f.write(f"4321150{i},Test Product {i},Description {i}\n")
            temp_path = f.name

        try:
            # Parse
            records = parse_csv(temp_path)
            assert len(records) == 10

            # Dry run insert
            count = insert_into_db(records, dry_run=True)
            assert count == 10

        finally:
            os.unlink(temp_path)
