"""Pydantic models for the API layer."""
from __future__ import annotations
from datetime import datetime
from enum import Enum
from typing import Any, Optional
from pydantic import BaseModel, Field


# ─── Repo Models ───────────────────────────────────────────────────────────────

class RepoStatus(str, Enum):
    PENDING = "pending"
    INGESTING = "ingesting"
    READY = "ready"
    FAILED = "failed"


class RepoIngestionRequest(BaseModel):
    github_url: str = Field(description="GitHub repo URL (e.g. https://github.com/owner/repo)")
    max_commits: int = Field(default=500, ge=1, le=5000, description="Max commits to ingest")
    max_issues: int = Field(default=200, ge=1, le=2000, description="Max issues to ingest")
    max_prs: int = Field(default=200, ge=1, le=2000, description="Max PRs to ingest")
    include_code: bool = Field(default=True, description="Whether to ingest source code files")


class RepoIngestionResponse(BaseModel):
    repo_id: str
    tenant_id: str
    owner: str
    name: str
    status: RepoStatus
    message: str
    created_at: datetime = Field(default_factory=datetime.utcnow)


class RepoStatusResponse(BaseModel):
    repo_id: str
    tenant_id: str
    owner: str
    name: str
    status: RepoStatus
    stats: dict[str, int] = Field(default_factory=dict)
    created_at: datetime
    updated_at: Optional[datetime] = None
    error: Optional[str] = None
    progress_message: Optional[str] = None
    progress_pct: Optional[int] = None


class RepoListItem(BaseModel):
    repo_id: str
    owner: str
    name: str
    status: RepoStatus
    stats: dict[str, int] = Field(default_factory=dict)
    created_at: datetime
    progress_message: Optional[str] = None
    progress_pct: Optional[int] = None


# ─── Provenance Models ─────────────────────────────────────────────────────────

class ProvenanceRequest(BaseModel):
    file_path: str = Field(description="File path relative to repo root")


class GraphPath(BaseModel):
    entities: list[str]
    relations: list[str]
    confidence: float


class ProvenanceResponse(BaseModel):
    file_path: str
    narrative: str = Field(description="Full provenance story")
    introduced_in: Optional[str] = None
    fixes_issue: Optional[str] = None
    status: str = "unknown"
    verdict: str = ""
    sources: list[dict[str, Any]] = Field(default_factory=list)
    graph_paths: list[GraphPath] = Field(default_factory=list)
    context_graph_visualization: list[dict] = Field(default_factory=list)


# ─── Wiki Models ───────────────────────────────────────────────────────────────

class WikiArticle(BaseModel):
    slug: str
    title: str
    summary: str
    content: str = Field(description="Markdown content")
    module_path: str
    references: list[dict[str, str]] = Field(default_factory=list)
    related_articles: list[str] = Field(default_factory=list)
    generated_at: datetime = Field(default_factory=datetime.utcnow)


class WikiListResponse(BaseModel):
    articles: list[WikiArticle]
    total: int


# ─── Paginated Repo List ────────────────────────────────────────────────────────

class RepoListResponse(BaseModel):
    items: list[RepoListItem]
    total: int
    page: int
    limit: int


# ─── Codebase Recovery Models ──────────────────────────────────────────────────

class OrphanedFile(BaseModel):
    path: str
    last_modified: str
    last_author: str
    author_status: str  # "active" | "inactive" | "unknown"
    origin_pr: Optional[str] = None
    origin_context: str = ""
    verdict: str = ""
    risk_level: str = "low"  # "low" | "medium" | "high"
    still_imported_by: list[str] = Field(default_factory=list)
    bus_factor_score: float = 0.0


class RecoveryReport(BaseModel):
    repo_id: str
    orphaned_files: list[OrphanedFile]
    total_scanned: int
    orphaned_count: int
    generated_at: datetime = Field(default_factory=datetime.utcnow)


# ─── Unwritten Rules Models ────────────────────────────────────────────────────

class ConventionViolation(BaseModel):
    file: str
    line: Optional[int] = None
    description: str


class UnwrittenRule(BaseModel):
    id: str
    category: str  # "error_handling" | "file_structure" | "testing" | "naming" | "other"
    rule: str
    enforced_by: list[str]
    evidence_prs: list[str]
    evidence_count: int
    violation_count: int
    violations: list[ConventionViolation] = Field(default_factory=list)
    confidence: float


class ConventionsReport(BaseModel):
    repo_id: str
    rules: list[UnwrittenRule]
    total_reviews_analyzed: int
    generated_at: datetime = Field(default_factory=datetime.utcnow)


# ─── Search Models ─────────────────────────────────────────────────────────────

class SearchRequest(BaseModel):
    query: str = Field(min_length=1, max_length=500)
    mode: str = Field(default="thinking", pattern="^(fast|thinking)$")
    max_results: int = Field(default=10, ge=1, le=30)
    source_filter: Optional[str] = None  # "code" | "pr" | "issue" | "comment" | None


class Citation(BaseModel):
    title: str
    source_type: str
    url: Optional[str] = None
    relevancy_score: float
    excerpt: str


class SearchResponse(BaseModel):
    query: str
    answer: str
    citations: list[Citation]
    graph_paths: list[GraphPath] = Field(default_factory=list)
    mode_used: str


# ─── Graph Data Models ─────────────────────────────────────────────────────────

class GraphNode(BaseModel):
    id: str
    label: str
    type: str  # "file" | "pr" | "issue" | "person" | "module"
    metadata: dict[str, Any] = Field(default_factory=dict)


class GraphEdge(BaseModel):
    source: str
    target: str
    relation: str
    weight: float = 1.0


class GraphDataResponse(BaseModel):
    nodes: list[GraphNode]
    edges: list[GraphEdge]
    total_nodes: int
    total_edges: int
