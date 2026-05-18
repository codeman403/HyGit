"""
Analysis API — provenance, wiki, recovery, conventions, search, graph.
All endpoints require a READY or INGESTING repo. Uses resolve_repo_tenant dependency.
"""
from __future__ import annotations
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, Query

from src.api.v1.repos import resolve_repo_tenant
from src.models.schemas import (
    ConventionsReport, GraphDataResponse, GraphEdge, GraphNode,
    ProvenanceRequest, RecoveryReport, SearchRequest, WikiListResponse,
)
from src.services.analysis_service import analysis_service
import structlog

logger = structlog.get_logger()
router = APIRouter(prefix="/repos/{repo_id}", tags=["analysis"])

# Shared dependency alias for cleaner signatures
RepoTenant = Annotated[tuple[str, str], Depends(resolve_repo_tenant)]


@router.post("/provenance")
async def get_provenance(
    repo_id: str,
    request: ProvenanceRequest,
    repo: RepoTenant,
):
    """
    Trace the provenance of any file in the repo.
    Uses HydraDB full_recall(thinking, graph_context=True) to trace:
    code file → PR → issue → discussion → original constraint.
    Response cached in Redis for 1 hour.
    """
    tenant_id, _ = repo
    # Input guard: reject obviously invalid file paths before hitting LLM
    if not request.file_path or request.file_path.strip() == "/":
        from src.core.errors import ValidationError
        raise ValidationError("file_path must be a non-empty relative path")
    return await analysis_service.get_provenance(tenant_id, request.file_path.strip())


@router.get("/wiki")
async def list_wiki(
    repo_id: str,
    repo: RepoTenant,
    generate: bool = Query(default=False, description="Auto-generate top articles"),
    limit: int = Query(default=10, ge=1, le=50),
):
    """
    List wiki articles. If generate=true, discovers modules dynamically from
    the repo's file tree via GitHub API instead of using a hardcoded list.
    Response cached in Redis.
    """
    tenant_id, repo_full = repo
    owner, repo_name = repo_full.split("/", 1)

    if generate:
        # Dynamically discover top-level modules from the actual repo file tree
        modules_to_generate = await analysis_service.discover_modules(
            tenant_id=tenant_id,
            owner=owner,
            repo_name=repo_name,
            limit=limit,
        )
    else:
        modules_to_generate = []

    articles = []
    for module in modules_to_generate:
        try:
            article = await analysis_service.generate_wiki_article(tenant_id, module)
            articles.append(article)
        except Exception as e:
            logger.warning("wiki_article_failed", module=module, error=str(e))

    return WikiListResponse(articles=articles, total=len(articles))


@router.post("/wiki/generate")
async def generate_wiki_article(
    repo_id: str,
    repo: RepoTenant,
    module_path: str = Query(description="Module/directory path to generate article for"),
):
    """Generate a single wiki article for a specific module. Cached in Redis."""
    tenant_id, _ = repo
    if not module_path or not module_path.strip():
        from src.core.errors import ValidationError
        raise ValidationError("module_path must not be empty")
    return await analysis_service.generate_wiki_article(tenant_id, module_path.strip())


@router.get("/reports/recovery", response_model=RecoveryReport)
async def get_recovery_report(
    repo_id: str,
    repo: RepoTenant,
):
    """
    Identify orphaned files with no active maintainer.
    total_scanned reflects the actual file count from HydraDB.
    """
    tenant_id, repo_full = repo
    owner, repo_name = repo_full.split("/", 1)
    orphans, total_scanned = await analysis_service.generate_recovery_report(
        tenant_id, owner, repo_name
    )
    return RecoveryReport(
        repo_id=repo_id,
        orphaned_files=orphans,
        total_scanned=total_scanned,
        orphaned_count=len(orphans),
    )


@router.get("/reports/conventions", response_model=ConventionsReport)
async def get_conventions_report(
    repo_id: str,
    repo: RepoTenant,
):
    """Extract unwritten coding conventions from PR review patterns."""
    tenant_id, _ = repo
    rules, total_reviews = await analysis_service.extract_unwritten_rules(tenant_id)
    return ConventionsReport(
        repo_id=repo_id,
        rules=rules,
        total_reviews_analyzed=total_reviews,
    )


@router.post("/search")
async def search_repo(
    repo_id: str,
    request: SearchRequest,
    repo: RepoTenant,
):
    """
    Ask anything about the codebase.
    Uses HydraDB hybrid recall (semantic + graph + boolean) + GPT-4o.
    Simple queries are routed to GPT-4o-mini to reduce cost.
    """
    tenant_id, _ = repo
    if not request.query.strip():
        from src.core.errors import ValidationError
        raise ValidationError("query must not be empty")
    _, owner_repo = repo
    return await analysis_service.answer_query(
        tenant_id=tenant_id,
        query=request.query.strip(),
        mode=request.mode,
        max_results=request.max_results,
        source_filter=request.source_filter,
        owner_repo=owner_repo,
    )


@router.get("/graph-data", response_model=GraphDataResponse)
async def get_graph_data(
    repo_id: str,
    repo: RepoTenant,
):
    """
    Get knowledge graph data for visualization.
    Returns nodes (files, PRs, issues, people) and edges (relationships).
    Cached in Redis for 1 hour.
    """
    tenant_id, _ = repo
    data = await analysis_service.get_graph_data(tenant_id)
    return GraphDataResponse(
        nodes=[GraphNode(**n) for n in data["nodes"]],
        edges=[GraphEdge(**e) for e in data["edges"]],
        total_nodes=data["total_nodes"],
        total_edges=data["total_edges"],
    )
