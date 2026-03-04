"""
Tests for the SAT Search Router endpoints.
"""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from fastapi.testclient import TestClient

from app.models.sat_code import SATCodeResponse


class TestSATSearchRouter:
    """Tests for SAT search API endpoints."""

    def test_search_sat_code_success(self, test_client, mock_db_session):
        """Test POST /api/v1/sat/search returns 200 with valid request."""
        # Mock the database response
        mock_row = MagicMock()
        mock_row.code = "43211503"
        mock_row.name = "Computadoras portátiles"
        mock_row.description = None
        mock_row.division = "43"
        mock_row.similarity_score = 0.85

        mock_result = MagicMock()
        mock_result.fetchall.return_value = [mock_row]
        mock_db_session.execute = AsyncMock(return_value=mock_result)

        response = test_client.post(
            "/api/v1/sat/search",
            json={
                "query": "laptop computadora",
                "top_k": 5,
                "threshold": 0.35,
            },
        )

        assert response.status_code == 200
        data = response.json()
        assert "results" in data
        assert "query" in data
        assert data["query"] == "laptop computadora"
        assert "search_type" in data

    def test_search_sat_code_empty_query(self, test_client):
        """Test POST /api/v1/sat/search returns 422 with empty query."""
        response = test_client.post(
            "/api/v1/sat/search",
            json={
                "query": "",
                "top_k": 5,
            },
        )

        assert response.status_code == 422

    def test_search_sat_code_invalid_top_k(self, test_client):
        """Test POST /api/v1/sat/search returns 422 when top_k > 50."""
        response = test_client.post(
            "/api/v1/sat/search",
            json={
                "query": "test query",
                "top_k": 100,
            },
        )

        assert response.status_code == 422

    def test_search_sat_code_invalid_threshold(self, test_client):
        """Test POST /api/v1/sat/search returns 422 when threshold > 1.0."""
        response = test_client.post(
            "/api/v1/sat/search",
            json={
                "query": "test query",
                "threshold": 1.5,
            },
        )

        assert response.status_code == 422

    def test_search_sat_code_with_category(self, test_client, mock_db_session):
        """Test POST /api/v1/sat/search with category filter."""
        mock_result = MagicMock()
        mock_result.fetchall.return_value = []
        mock_db_session.execute = AsyncMock(return_value=mock_result)

        response = test_client.post(
            "/api/v1/sat/search",
            json={
                "query": "computadora",
                "top_k": 5,
                "category": "43",
            },
        )

        assert response.status_code == 200

    def test_get_code_details_found(self, test_client, mock_db_session):
        """Test GET /api/v1/sat/code/{code} returns 200 for existing code."""
        mock_row = MagicMock()
        mock_row.code = "43211503"
        mock_row.name = "Computadoras portátiles"
        mock_row.description = None
        mock_row.division = "43"

        mock_result = MagicMock()
        mock_result.fetchone.return_value = mock_row
        mock_db_session.execute = AsyncMock(return_value=mock_result)

        response = test_client.get("/api/v1/sat/code/43211503")

        assert response.status_code == 200
        data = response.json()
        assert data["code"] == "43211503"
        assert data["name"] == "Computadoras portátiles"

    def test_get_code_details_not_found(self, test_client, mock_db_session):
        """Test GET /api/v1/sat/code/{code} returns 404 for unknown code."""
        mock_result = MagicMock()
        mock_result.fetchone.return_value = None
        mock_db_session.execute = AsyncMock(return_value=mock_result)

        response = test_client.get("/api/v1/sat/code/UNKNOWN")

        assert response.status_code == 404
        assert "not found" in response.json()["detail"].lower()

    def test_get_similar_codes_found(self, test_client, mock_db_session, sample_embeddings):
        """Test GET /api/v1/sat/similar/{code} returns similar codes."""
        # First call: get original code
        original_row = MagicMock()
        original_row.code = "43211503"
        original_row.name = "Computadoras portátiles"
        original_row.description = None
        original_row.division = "43"
        original_row.embedding = sample_embeddings[0]

        # Second call: get similar codes
        similar_row = MagicMock()
        similar_row.code = "43211507"
        similar_row.name = "Notebooks"
        similar_row.description = None
        similar_row.division = "43"
        similar_row.similarity_score = 0.9

        mock_result1 = MagicMock()
        mock_result1.fetchone.return_value = original_row

        mock_result2 = MagicMock()
        mock_result2.fetchone.return_value = original_row  # For get_code_by_id
        mock_result2.fetchall.return_value = [similar_row]

        mock_result3 = MagicMock()
        mock_result3.fetchall.return_value = [similar_row]

        mock_db_session.execute = AsyncMock(
            side_effect=[mock_result1, mock_result2, mock_result3]
        )

        response = test_client.get("/api/v1/sat/similar/43211503?top_k=5")

        assert response.status_code == 200
        data = response.json()
        assert "results" in data
        assert data["search_type"] == "semantic"

    def test_get_similar_codes_not_found(self, test_client, mock_db_session):
        """Test GET /api/v1/sat/similar/{code} returns 404 for unknown code."""
        mock_result = MagicMock()
        mock_result.fetchone.return_value = None
        mock_db_session.execute = AsyncMock(return_value=mock_result)

        response = test_client.get("/api/v1/sat/similar/UNKNOWN")

        assert response.status_code == 404

    def test_search_by_category(self, test_client, mock_db_session):
        """Test GET /api/v1/sat/search/category/{category} endpoint."""
        mock_result = MagicMock()
        mock_result.fetchall.return_value = []
        mock_db_session.execute = AsyncMock(return_value=mock_result)

        response = test_client.get(
            "/api/v1/sat/search/category/43?query=monitor&top_k=5"
        )

        assert response.status_code == 200
        data = response.json()
        assert "results" in data
        assert data["query"] == "monitor"


class TestHealthRouter:
    """Tests for health check endpoints."""

    def test_health_check(self, test_client, mock_db_session):
        """Test GET /health returns health status."""
        # Mock stats query
        mock_result1 = MagicMock()
        mock_result1.scalar.return_value = 55000

        mock_result2 = MagicMock()
        mock_result2.scalar.return_value = 54000

        mock_db_session.execute = AsyncMock(
            side_effect=[mock_result1, mock_result2]
        )

        response = test_client.get("/health")

        assert response.status_code == 200
        data = response.json()
        assert "status" in data
        assert "embedding_model_loaded" in data
        assert data["embedding_model_loaded"] is True

    def test_readiness_check(self, test_client):
        """Test GET /health/ready returns readiness."""
        response = test_client.get("/health/ready")

        assert response.status_code == 200
        data = response.json()
        assert "ready" in data

    def test_liveness_check(self, test_client):
        """Test GET /health/live always returns alive."""
        response = test_client.get("/health/live")

        assert response.status_code == 200
        data = response.json()
        assert data["alive"] is True
