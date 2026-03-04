"""
Tests for the embedding generation script.
"""

import pytest
from unittest.mock import patch, MagicMock
import os


class TestLoadExistingCodes:
    """Tests for loading codes from database."""

    @patch('scripts.generate_embeddings.psycopg2.connect')
    def test_load_with_skip_existing(self, mock_connect):
        """Test loading only codes without embeddings."""
        from scripts.generate_embeddings import load_existing_codes

        mock_conn = MagicMock()
        mock_cursor = MagicMock()
        mock_cursor.fetchall.return_value = [
            ("43211503", "Computadoras portátiles", None),
            ("81112100", "Servicios de consultoría", "IT consulting"),
        ]
        mock_conn.cursor.return_value = mock_cursor
        mock_connect.return_value = mock_conn

        with patch.dict(os.environ, {"DATABASE_URL_SYNC": "postgresql://test:test@localhost/test"}):
            codes = load_existing_codes(skip_existing=True)

        assert len(codes) == 2
        assert codes[0]["code"] == "43211503"
        assert codes[1]["code"] == "81112100"

        # Verify the WHERE clause was in the query
        executed_query = mock_cursor.execute.call_args[0][0]
        assert "WHERE embedding IS NULL" in executed_query

    @patch('scripts.generate_embeddings.psycopg2.connect')
    def test_load_all_codes(self, mock_connect):
        """Test loading all codes when skip_existing=False."""
        from scripts.generate_embeddings import load_existing_codes

        mock_conn = MagicMock()
        mock_cursor = MagicMock()
        mock_cursor.fetchall.return_value = [
            ("43211503", "Computadoras", None),
        ]
        mock_conn.cursor.return_value = mock_cursor
        mock_connect.return_value = mock_conn

        with patch.dict(os.environ, {"DATABASE_URL_SYNC": "postgresql://test:test@localhost/test"}):
            codes = load_existing_codes(skip_existing=False)

        assert len(codes) == 1

        # Verify no WHERE clause for embedding
        executed_query = mock_cursor.execute.call_args[0][0]
        assert "WHERE embedding IS NULL" not in executed_query


class TestGenerateAllEmbeddings:
    """Tests for embedding generation."""

    def test_generates_correct_count(self):
        """Test that correct number of embeddings are generated."""
        from scripts.generate_embeddings import generate_all_embeddings
        from sentence_transformers import SentenceTransformer

        mock_model = MagicMock()
        # Return fake embeddings
        import numpy as np
        mock_model.encode.return_value = np.random.rand(3, 384)

        codes = [
            {"code": "43211503", "name": "Computadoras", "description": None},
            {"code": "81112100", "name": "Servicios", "description": "IT"},
            {"code": "44121600", "name": "Suministros", "description": None},
        ]

        embeddings = generate_all_embeddings(codes, mock_model, batch_size=64)

        assert len(embeddings) == 3
        assert all(len(emb[1]) == 384 for emb in embeddings)

    def test_constructs_correct_text(self):
        """Test that embedding text is constructed correctly."""
        from scripts.generate_embeddings import generate_all_embeddings
        import numpy as np

        mock_model = MagicMock()
        mock_model.encode.return_value = np.random.rand(1, 384)

        codes = [
            {"code": "43211503", "name": "Computadoras", "description": "Laptops"},
        ]

        generate_all_embeddings(codes, mock_model, batch_size=64)

        # Check the text passed to encode
        call_args = mock_model.encode.call_args[0][0]
        assert "computadoras" in call_args[0].lower()
        assert "laptops" in call_args[0].lower()

    def test_handles_empty_list(self):
        """Test handling of empty code list."""
        from scripts.generate_embeddings import generate_all_embeddings

        mock_model = MagicMock()

        embeddings = generate_all_embeddings([], mock_model, batch_size=64)

        assert embeddings == []
        mock_model.encode.assert_not_called()

    def test_handles_none_description(self):
        """Test handling of None description."""
        from scripts.generate_embeddings import generate_all_embeddings
        import numpy as np

        mock_model = MagicMock()
        mock_model.encode.return_value = np.random.rand(1, 384)

        codes = [
            {"code": "43211503", "name": "Test", "description": None},
        ]

        embeddings = generate_all_embeddings(codes, mock_model, batch_size=64)

        assert len(embeddings) == 1
        # Should not raise error with None description


class TestUpdateDatabase:
    """Tests for database update functionality."""

    @patch('scripts.generate_embeddings.psycopg2.connect')
    def test_update_calls_correct_sql(self, mock_connect):
        """Test that update uses correct SQL."""
        from scripts.generate_embeddings import update_database

        mock_conn = MagicMock()
        mock_cursor = MagicMock()
        mock_conn.cursor.return_value = mock_cursor
        mock_connect.return_value = mock_conn

        embeddings = [
            ("43211503", [0.1] * 384),
        ]

        with patch.dict(os.environ, {"DATABASE_URL_SYNC": "postgresql://test:test@localhost/test"}):
            with patch('scripts.generate_embeddings.execute_values') as mock_execute:
                count = update_database(embeddings, batch_size=100)

        assert count == 1
        mock_conn.commit.assert_called_once()

    @patch('scripts.generate_embeddings.psycopg2.connect')
    def test_update_processes_in_batches(self, mock_connect):
        """Test that update processes in correct batch sizes."""
        from scripts.generate_embeddings import update_database

        mock_conn = MagicMock()
        mock_cursor = MagicMock()
        mock_conn.cursor.return_value = mock_cursor
        mock_connect.return_value = mock_conn

        # Create 250 embeddings
        embeddings = [
            (f"{i:08d}", [0.1] * 384)
            for i in range(250)
        ]

        with patch.dict(os.environ, {"DATABASE_URL_SYNC": "postgresql://test:test@localhost/test"}):
            with patch('scripts.generate_embeddings.execute_values') as mock_execute:
                count = update_database(embeddings, batch_size=100)

        assert count == 250
        # Should have 3 batch calls
        assert mock_execute.call_count == 3

    def test_update_dry_run(self):
        """Test dry run mode doesn't update."""
        from scripts.generate_embeddings import update_database

        embeddings = [
            ("43211503", [0.1] * 384),
        ]

        count = update_database(embeddings, dry_run=True)

        assert count == 1

    def test_update_empty_list(self):
        """Test updating with empty list."""
        from scripts.generate_embeddings import update_database

        count = update_database([])

        assert count == 0


class TestVerifyEmbeddings:
    """Tests for embedding verification."""

    @patch('scripts.generate_embeddings.psycopg2.connect')
    def test_verify_returns_stats(self, mock_connect):
        """Test that verify returns correct stats."""
        from scripts.generate_embeddings import verify_embeddings

        mock_conn = MagicMock()
        mock_cursor = MagicMock()
        mock_cursor.fetchone.side_effect = [(55000,), (54000,)]
        mock_conn.cursor.return_value = mock_cursor
        mock_connect.return_value = mock_conn

        with patch.dict(os.environ, {"DATABASE_URL_SYNC": "postgresql://test:test@localhost/test"}):
            stats = verify_embeddings()

        assert stats["total_codes"] == 55000
        assert stats["codes_with_embeddings"] == 54000
        assert stats["codes_without_embeddings"] == 1000
        assert stats["completion_percentage"] == 98.18
