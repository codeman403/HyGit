"""
Integration tests for the HyGit API endpoints.
Uses FastAPI TestClient with mocked external services.
"""
import pytest
from unittest.mock import patch, AsyncMock, MagicMock
from datetime import datetime

from src.models.schemas import RepoStatus


class TestHealthEndpoint:
    """GET /health"""

    def test_health_returns_ok(self, client):
        response = client.get("/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "ok"
        assert data["service"] == "hygit-api"
        assert "version" in data
        assert "hydradb_configured" in data

    def test_health_reports_config_flags(self, client):
        response = client.get("/health")
        data = response.json()
        # With test env keys set, these should be True
        assert isinstance(data["hydradb_configured"], bool)
        assert isinstance(data["openai_configured"], bool)
        assert isinstance(data["github_configured"], bool)


class TestReposEndpoints:
    """Tests for /api/v1/repos"""

    def test_list_repos_empty(self, client):
        """GET /repos returns empty list when no repos ingested."""
        response = client.get("/api/v1/repos")
        assert response.status_code == 200
        assert response.json() == []

    def test_get_nonexistent_repo_404(self, client):
        """GET /repos/{id} returns 404 for unknown repo."""
        response = client.get("/api/v1/repos/does-not-exist")
        assert response.status_code == 404

    def test_get_status_nonexistent_404(self, client):
        """GET /repos/{id}/status returns 404 for unknown repo."""
        response = client.get("/api/v1/repos/does-not-exist/status")
        assert response.status_code == 404

    def test_ingest_repo_returns_202(self, client):
        """POST /repos with valid URL returns 202 Accepted."""
        with patch("src.api.v1.repos.ingestion_service") as mock_svc:
            mock_svc.tenant_id_for_repo.return_value = "hygit-test-repo"
            mock_svc.repo_id_for.return_value = "test--repo"

            response = client.post(
                "/api/v1/repos",
                json={
                    "github_url": "test/repo",
                    "max_commits": 10,
                    "max_issues": 5,
                    "max_prs": 5,
                    "include_code": True,
                },
            )
        assert response.status_code == 202
        data = response.json()
        assert data["owner"] == "test"
        assert data["name"] == "repo"
        assert data["status"] in ("pending", "ingesting")

    def test_ingest_invalid_url_raises(self, client):
        """POST /repos with invalid URL returns error."""
        response = client.post(
            "/api/v1/repos",
            json={
                "github_url": "not-valid-url!!!",
                "max_commits": 10,
                "max_issues": 5,
                "max_prs": 5,
                "include_code": True,
            },
        )
        # Should return 400 or 422 (validation error)
        assert response.status_code in (400, 422)

    def test_ingest_duplicate_returns_ingesting(self, client):
        """POST /repos for already-ingesting repo returns current status."""
        with patch("src.api.v1.repos.ingestion_service") as mock_svc, \
             patch("src.api.v1.repos._repos") as mock_repos:
            mock_svc.tenant_id_for_repo.return_value = "hygit-owner-dupe"
            mock_svc.repo_id_for.return_value = "owner--dupe"
            mock_repos.get.return_value = {
                "status": RepoStatus.INGESTING,
                "created_at": datetime.utcnow(),
            }

            response = client.post(
                "/api/v1/repos",
                json={"github_url": "owner/dupe", "max_commits": 10,
                      "max_issues": 5, "max_prs": 5, "include_code": True},
            )
        assert response.status_code == 202
        assert response.json()["status"] == "ingesting"


class TestAnalysisEndpoints:
    """Tests for /api/v1/repos/{id}/* analysis routes."""

    @pytest.fixture(autouse=True)
    def inject_repo(self, client):
        """Pre-populate _repos with a READY repo for analysis tests."""
        from src.api.v1 import repos as repos_module
        self.repo_id = "test--myrepo"
        repos_module._repos[self.repo_id] = {
            "repo_id": self.repo_id,
            "tenant_id": "hygit-test-myrepo",
            "owner": "test",
            "name": "myrepo",
            "status": RepoStatus.READY,
            "stats": {},
            "created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow(),
            "error": None,
        }
        yield
        # Cleanup
        repos_module._repos.pop(self.repo_id, None)

    def test_provenance_requires_ready_repo(self, client):
        """POST /repos/{id}/provenance returns provenance data."""
        with patch("src.api.v1.analysis.analysis_service") as mock_svc:
            from src.models.schemas import ProvenanceResponse, GraphPath
            mock_svc.get_provenance = AsyncMock(return_value=ProvenanceResponse(
                file_path="src/main.py",
                narrative="This file was the entry point, introduced in PR #1.",
                introduced_in="PR #1",
                fixes_issue=None,
                status="active",
                verdict="Keep as is.",
                sources=[],
                graph_paths=[],
                context_graph_visualization=[],
            ))
            response = client.post(
                f"/api/v1/repos/{self.repo_id}/provenance",
                json={"file_path": "src/main.py"},
            )
        assert response.status_code == 200
        data = response.json()
        assert data["file_path"] == "src/main.py"
        assert "narrative" in data
        assert data["status"] == "active"

    def test_wiki_list_empty_initially(self, client):
        """GET /repos/{id}/wiki returns empty article list when none generated yet."""
        response = client.get(f"/api/v1/repos/{self.repo_id}/wiki")
        assert response.status_code == 200
        data = response.json()
        # API returns {"articles": [], "total": 0} — not bare list
        assert "articles" in data or isinstance(data, list)
        articles = data["articles"] if isinstance(data, dict) else data
        assert isinstance(articles, list)

    def test_search_returns_answer(self, client):
        """POST /repos/{id}/search returns grounded answer."""
        with patch("src.api.v1.analysis.analysis_service") as mock_svc:
            from src.models.schemas import SearchResponse
            mock_svc.answer_query = AsyncMock(return_value=SearchResponse(
                query="Why was the auth module built?",
                answer="The auth module was built in PR #42 to address Issue #10 about security.",
                citations=[],
                graph_paths=[],
                mode_used="thinking",
            ))
            response = client.post(
                f"/api/v1/repos/{self.repo_id}/search",
                json={"query": "Why was the auth module built?", "mode": "thinking"},
            )
        assert response.status_code == 200
        data = response.json()
        assert "answer" in data
        assert data["mode_used"] == "thinking"

    def test_graph_data_returns_nodes_edges(self, client):
        """GET /repos/{id}/graph-data returns graph structure."""
        with patch("src.api.v1.analysis.analysis_service") as mock_svc:
            mock_svc.get_graph_data = AsyncMock(return_value={
                "nodes": [{"id": "src/main.py", "label": "main.py", "type": "code", "metadata": {}}],
                "edges": [],
                "total_nodes": 1,
                "total_edges": 0,
            })
            response = client.get(f"/api/v1/repos/{self.repo_id}/graph-data")
        assert response.status_code == 200
        data = response.json()
        assert "nodes" in data
        assert "edges" in data
        assert data["total_nodes"] == 1

    def test_analysis_on_nonexistent_repo_404(self, client):
        """Analysis endpoints return 404 for unknown repo."""
        response = client.post(
            "/api/v1/repos/nonexistent-id/provenance",
            json={"file_path": "src/main.py"},
        )
        assert response.status_code == 404
