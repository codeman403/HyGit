"""
Shared test fixtures and configuration for HyGit backend tests.
Uses pytest-asyncio for async tests, pytest for fixtures.
"""
from __future__ import annotations

import pytest
import pytest_asyncio
from fastapi.testclient import TestClient
from unittest.mock import AsyncMock, MagicMock, patch

from src.main import create_app
from src.models.schemas import RepoStatus


@pytest.fixture
def app():
    """FastAPI test application instance."""
    return create_app()


@pytest.fixture
def client(app):
    """Synchronous TestClient (used for endpoint integration tests)."""
    with TestClient(app, raise_server_exceptions=False) as c:
        yield c


@pytest.fixture
def mock_hydradb():
    """Mock HydraDB client — avoids real API calls in tests."""
    mock = MagicMock()
    mock.full_recall = AsyncMock(return_value={
        "chunks": [
            {
                "chunk_uuid": "chunk-1",
                "source_id": "owner/repo/src/main.py",
                "source_title": "main.py",
                "content": "FastAPI application entry point",
                "relevancy_score": 0.92,
                "document_metadata": {"source_type": "code"},
                "tenant_metadata": {"source_type": "code"},
            }
        ],
        "graph_context": {"query_paths": []},
    })
    mock.boolean_recall = AsyncMock(return_value={"chunks": []})
    mock.build_context_string = MagicMock(
        return_value=("Context: FastAPI application entry point", [
            {
                "title": "main.py",
                "source_type": "code",
                "relevancy_score": 0.92,
                "excerpt": "FastAPI application entry point",
                "url": None,
            }
        ])
    )
    mock.extract_graph_paths = MagicMock(return_value=[])
    mock.close = AsyncMock()
    return mock


@pytest.fixture
def mock_openai():
    """Mock OpenAI client — avoids real API calls in tests."""
    mock = MagicMock()
    mock.chat = MagicMock()
    mock.chat.completions = MagicMock()
    mock.chat.completions.create = AsyncMock(return_value=MagicMock(
        choices=[MagicMock(
            message=MagicMock(
                content='{"narrative": "This file was built to handle authentication.", '
                        '"status": "active", "verdict": "Keep as is.", '
                        '"introduced_in": "PR #42", "fixes_issue": "Issue #12", '
                        '"context_graph": []}'
            )
        )]
    ))
    return mock


@pytest.fixture
def sample_repo_id():
    return "owner--repo"


@pytest.fixture
def sample_repo_entry(sample_repo_id):
    from datetime import datetime
    return {
        "repo_id": sample_repo_id,
        "tenant_id": "hygit-owner-repo",
        "owner": "owner",
        "name": "repo",
        "status": RepoStatus.READY,
        "stats": {"commits": 100, "issues": 20, "prs": 15, "files": 50},
        "created_at": datetime.utcnow(),
        "updated_at": datetime.utcnow(),
        "error": None,
    }
