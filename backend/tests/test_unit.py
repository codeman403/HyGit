"""
Unit tests for HydraDB client helper methods.
These test the pure functions — no real API calls.
"""
import pytest
from unittest.mock import MagicMock

# We test the helper methods on the HydraDBClient class
from src.services.hydradb_client import HydraDBClient


class TestBuildContextString:
    """Test the context assembly logic from recall chunks."""

    def setup_method(self):
        self.client = HydraDBClient.__new__(HydraDBClient)

    def test_empty_chunks_returns_empty(self):
        ctx, sources = self.client.build_context_string([])
        assert ctx == ""
        assert sources == []

    def test_filters_low_score_chunks(self):
        chunks = [
            {
                "source_id": "file.py",
                "source_title": "file.py",
                "content": "some code",
                "relevancy_score": 0.2,  # Below default min_score=0.3
                "document_metadata": {"source_type": "code"},
                "tenant_metadata": {},
            }
        ]
        ctx, sources = self.client.build_context_string(chunks, min_score=0.3)
        assert ctx == ""
        assert sources == []

    def test_includes_high_score_chunks(self):
        chunks = [
            {
                "chunk_uuid": "abc-1",
                "source_id": "auth/middleware.py",
                "source_title": "middleware.py",
                "chunk_content": "def authenticate(request): ...",  # HydraDB uses chunk_content
                "relevancy_score": 0.85,
                "document_metadata": {"source_type": "code"},
                "tenant_metadata": {},
            }
        ]
        ctx, sources = self.client.build_context_string(chunks, min_score=0.3)
        assert "authenticate" in ctx
        assert len(sources) == 1
        assert sources[0]["relevancy_score"] == 0.85

    def test_respects_max_chunks(self):
        chunks = [
            {
                "chunk_uuid": f"chunk-{i}",
                "source_id": f"file{i}.py",
                "source_title": f"file{i}.py",
                "chunk_content": f"content {i}",
                "relevancy_score": 0.9,
                "document_metadata": {"source_type": "code"},
                "tenant_metadata": {},
            }
            for i in range(10)
        ]
        ctx, sources = self.client.build_context_string(chunks, min_score=0.3, max_chunks=3)
        assert len(sources) == 3

    def test_source_type_from_metadata(self):
        chunks = [
            {
                "chunk_uuid": "pr-chunk-1",
                "source_id": "pr-42",
                "source_title": "PR #42",
                "chunk_content": "Added auth middleware",
                "relevancy_score": 0.75,
                "document_metadata": {},
                "tenant_metadata": {"source_type": "pr"},
            }
        ]
        ctx, sources = self.client.build_context_string(chunks, min_score=0.3)
        assert sources[0]["source_type"] == "pr"


class TestExtractGraphPaths:
    """Test graph path extraction from HydraDB graph_context."""

    def setup_method(self):
        self.client = HydraDBClient.__new__(HydraDBClient)

    def test_empty_context_returns_empty(self):
        result = self.client.extract_graph_paths({})
        assert result == []

    def test_extracts_triplets(self):
        graph_context = {
            "query_paths": [
                {
                    "relevancy_score": 0.9,
                    "triplets": [
                        {
                            "source": {"entity_id": "auth/middleware.py", "name": "middleware.py", "type": "code"},
                            "target": {"entity_id": "pr-42", "name": "PR #42", "type": "pr"},
                            "relation": {"canonical_predicate": "introduced_in", "confidence": 0.88},
                        }
                    ],
                }
            ]
        }
        result = self.client.extract_graph_paths(graph_context)
        assert len(result) == 1
        assert "middleware.py" in result[0]["entities"]
        assert "PR #42" in result[0]["entities"]
        assert "introduced_in" in result[0]["relations"]

    def test_handles_missing_triplets_gracefully(self):
        graph_context = {
            "query_paths": [
                {"relevancy_score": 0.5}  # no "triplets" key
            ]
        }
        result = self.client.extract_graph_paths(graph_context)
        assert result == []


class TestUrlParsing:
    """Test the GitHub URL parsing helper in repos router."""

    def test_parse_owner_repo(self):
        from src.api.v1.repos import _parse_github_url
        owner, repo = _parse_github_url("fastify/fastify")
        assert owner == "fastify"
        assert repo == "fastify"

    def test_parse_full_url(self):
        from src.api.v1.repos import _parse_github_url
        owner, repo = _parse_github_url("https://github.com/pallets/flask")
        assert owner == "pallets"
        assert repo == "flask"

    def test_parse_url_with_git_suffix(self):
        from src.api.v1.repos import _parse_github_url
        owner, repo = _parse_github_url("https://github.com/hono/hono.git")
        assert owner == "hono"
        assert repo == "hono"

    def test_parse_invalid_raises(self):
        from src.api.v1.repos import _parse_github_url
        from src.core.errors import ValidationError
        with pytest.raises(ValidationError):
            _parse_github_url("not-a-valid-url")
