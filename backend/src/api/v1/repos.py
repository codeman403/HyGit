"""
Repos API — ingestion and status management.
Each repo gets its own HydraDB tenant (multi-tenancy per the HydraDB docs).

Storage: PostgreSQL via RepoRepository (replaces repos_db.json).
Pattern: Handler → RepoService → RepoRepository → DB
"""
from __future__ import annotations

import asyncio
import re
from datetime import datetime
from typing import Annotated, Any

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession

from src.core.errors import NotFoundError, ValidationError
from src.core.rate_limit import limiter
from src.core.cache import cache_delete
from src.db.database import get_db
from src.db.repositories import RepoRepository
from src.ingestion.github_ingester import ingestion_service
from src.services.hydradb_client import hydradb
from src.models.schemas import (
    RepoIngestionRequest, RepoIngestionResponse,
    RepoListItem, RepoListResponse, RepoStatus, RepoStatusResponse,
)
import structlog

logger = structlog.get_logger()
router = APIRouter(prefix="/repos", tags=["repos"])


# ── Helpers ───────────────────────────────────────────────────────────────────

def _parse_github_url(url: str) -> tuple[str, str]:
    """Parse owner and repo from GitHub URL."""
    url = url.strip().rstrip("/")
    patterns = [
        r"github\.com/([^/]+)/([^/]+)",
        r"^([^/]+)/([^/]+)$",
    ]
    for pattern in patterns:
        m = re.search(pattern, url)
        if m:
            return m.group(1), m.group(2).removesuffix(".git")
    raise ValidationError(f"Cannot parse GitHub URL: {url}")


def get_repo_tenant(repo: Any) -> tuple[str, str]:
    """Helper: extract tenant_id and full repo name from a RepoModel row."""
    if repo["status"] not in (RepoStatus.READY, RepoStatus.INGESTING):
        raise HTTPException(
            status_code=409,
            detail=f"Repository is {repo['status']}. Wait for ingestion to complete.",
        )
    return repo["tenant_id"], f"{repo['owner']}/{repo['name']}"


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.post("", response_model=RepoIngestionResponse, status_code=202)
@limiter.limit("5/minute")
async def ingest_repo(
    request: Request,
    body: RepoIngestionRequest,
    background_tasks: BackgroundTasks,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """
    Start ingestion of a GitHub repository into HydraDB.
    Idempotent: returns 202 immediately if already ingesting.
    Rate limited: 5 per minute per IP.
    """
    owner, repo_name = _parse_github_url(body.github_url)
    tenant_id = ingestion_service.tenant_id_for_repo(owner, repo_name)
    repo_id = ingestion_service.repo_id_for(owner, repo_name)

    repo_repo = RepoRepository(db)

    # Idempotency: don't re-trigger if already running
    existing = await repo_repo.find_by_id(repo_id)
    if existing and existing.status == RepoStatus.INGESTING:
        return RepoIngestionResponse(
            repo_id=repo_id,
            tenant_id=tenant_id,
            owner=owner,
            name=repo_name,
            status=RepoStatus.INGESTING,
            message="Ingestion already in progress",
            created_at=existing.created_at,
        )

    if existing:
        # Re-ingest: reset status
        await repo_repo.update_status(repo_id, RepoStatus.PENDING, error=None)
    else:
        await repo_repo.create({
            "repo_id": repo_id,
            "tenant_id": tenant_id,
            "owner": owner,
            "name": repo_name,
            "status": RepoStatus.PENDING,
            "stats": {},
            "created_at": datetime.utcnow(),
        })

    # Commit before returning so the row is visible to /status polling
    # that starts immediately after the client receives the 202 response.
    await db.commit()

    background_tasks.add_task(
        _run_ingestion,
        repo_id=repo_id,
        owner=owner,
        repo_name=repo_name,
        request=body,
    )

    logger.info("ingestion_started", repo_id=repo_id, owner=owner, repo=repo_name)
    return RepoIngestionResponse(
        repo_id=repo_id,
        tenant_id=tenant_id,
        owner=owner,
        name=repo_name,
        status=RepoStatus.PENDING,
        message=f"Ingestion started for {owner}/{repo_name}. Poll /repos/{repo_id}/status for progress.",
    )


async def _run_ingestion(
    repo_id: str, owner: str, repo_name: str, request: RepoIngestionRequest
) -> None:
    """Background task: full ingestion pipeline. Uses its own DB session."""
    from src.db.database import AsyncSessionLocal

    async with AsyncSessionLocal() as session:
        repo_repo = RepoRepository(session)
        await repo_repo.update_status(
            repo_id, RepoStatus.INGESTING,
            progress_message="Starting ingestion…", progress_pct=0,
        )
        await session.commit()

        def progress(msg: str, pct: int = 0):
            # Fire-and-forget progress updates — best-effort, no await in sync callback
            asyncio.ensure_future(_update_progress(repo_id, msg, pct))

        try:
            stats = await ingestion_service.ingest_repo(
                owner=owner,
                repo=repo_name,
                max_commits=request.max_commits,
                max_issues=request.max_issues,
                max_prs=request.max_prs,
                include_code=request.include_code,
                progress_callback=progress,
            )
            async with AsyncSessionLocal() as s2:
                await RepoRepository(s2).update_status(
                    repo_id, RepoStatus.READY, stats=stats,
                    progress_message="Ingestion complete", progress_pct=100,
                )
                await s2.commit()
            logger.info("ingestion_complete", repo_id=repo_id, stats=stats)
        except Exception as e:
            async with AsyncSessionLocal() as s3:
                await RepoRepository(s3).update_status(
                    repo_id, RepoStatus.FAILED, error=str(e),
                )
                await s3.commit()
            logger.error("ingestion_failed", repo_id=repo_id, error=str(e))


async def _update_progress(repo_id: str, msg: str, pct: int) -> None:
    """Write progress to DB (called from sync progress callback via ensure_future)."""
    from src.db.database import AsyncSessionLocal
    async with AsyncSessionLocal() as session:
        await RepoRepository(session).update_status(
            repo_id, RepoStatus.INGESTING,
            progress_message=msg, progress_pct=pct,
        )
        await session.commit()


@router.get("", response_model=RepoListResponse)
async def list_repos(
    db: Annotated[AsyncSession, Depends(get_db)],
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=20, ge=1, le=100),
):
    """List all ingested repositories (paginated)."""
    rows, total = await RepoRepository(db).find_all(page=page, limit=limit)
    items = [
        RepoListItem(
            repo_id=r.repo_id,
            owner=r.owner,
            name=r.name,
            status=r.status,
            stats=r.stats or {},
            created_at=r.created_at,
            progress_message=r.progress_message,
            progress_pct=r.progress_pct,
        )
        for r in rows
    ]
    return RepoListResponse(items=items, total=total, page=page, limit=limit)


@router.get("/{repo_id}/status", response_model=RepoStatusResponse)
async def get_repo_status(
    repo_id: str,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Get ingestion status and stats for a repo."""
    repo = await RepoRepository(db).find_by_id(repo_id)
    if not repo:
        raise NotFoundError("Repository", repo_id)
    return RepoStatusResponse(
        repo_id=repo.repo_id,
        tenant_id=repo.tenant_id,
        owner=repo.owner,
        name=repo.name,
        status=repo.status,
        stats=repo.stats or {},
        created_at=repo.created_at,
        updated_at=repo.updated_at,
        error=repo.error,
        progress_message=repo.progress_message,
        progress_pct=repo.progress_pct,
    )


@router.get("/{repo_id}")
async def get_repo(
    repo_id: str,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    """Get full repo info including HydraDB tenant ID."""
    repo = await RepoRepository(db).find_by_id(repo_id)
    if not repo:
        raise NotFoundError("Repository", repo_id)
    return {
        "repo_id": repo.repo_id,
        "tenant_id": repo.tenant_id,
        "owner": repo.owner,
        "name": repo.name,
        "status": repo.status,
        "stats": repo.stats,
        "created_at": repo.created_at,
        "updated_at": repo.updated_at,
        "error": repo.error,
    }


@router.delete("/{repo_id}", status_code=204)
async def delete_repo(
    repo_id: str,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Delete a repository, free its HydraDB tenant, and invalidate caches."""
    repo_repo = RepoRepository(db)
    repo = await repo_repo.find_by_id(repo_id)
    if not repo:
        raise NotFoundError("Repository", repo_id)

    # Best-effort tenant deletion
    try:
        await hydradb.delete_tenant(repo.tenant_id)
        logger.info("tenant_deleted", repo_id=repo_id, tenant_id=repo.tenant_id)
    except Exception as e:
        logger.warning("tenant_delete_failed", repo_id=repo_id, error=str(e))

    # Invalidate all cached analysis for this repo
    await cache_delete(f"*:{repo.tenant_id}:*")

    await repo_repo.delete(repo_id)
    logger.info("repo_deleted", repo_id=repo_id)


# ── Dependency used by analysis.py ───────────────────────────────────────────

async def resolve_repo_tenant(
    repo_id: str,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> tuple[str, str]:
    """FastAPI dependency: resolves (tenant_id, owner/name) or raises HTTP errors."""
    repo = await RepoRepository(db).find_by_id(repo_id)
    if not repo:
        raise NotFoundError("Repository", repo_id)
    if repo.status not in (RepoStatus.READY, RepoStatus.INGESTING):
        raise HTTPException(
            status_code=409,
            detail=f"Repository is {repo.status}. Wait for ingestion to complete.",
        )
    return repo.tenant_id, f"{repo.owner}/{repo.name}"
