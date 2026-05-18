"""
Repository pattern — data access layer for operational DB models.
Following BACKEND_STANDARDS.md: handlers never touch the DB directly.
All DB interaction goes: Handler → Service → Repository → DB.
"""
from __future__ import annotations

from datetime import datetime
from typing import Any

import structlog
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from src.db.models import RepoModel
from src.models.schemas import RepoStatus

logger = structlog.get_logger()


class RepoRepository:
    """CRUD operations for the repos table."""

    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    # ── Queries ──────────────────────────────────────────────────────────────

    async def find_by_id(self, repo_id: str) -> RepoModel | None:
        # populate_existing=True bypasses SQLAlchemy's identity map cache,
        # ensuring we always read the latest committed row from the DB.
        stmt = select(RepoModel).where(RepoModel.repo_id == repo_id).execution_options(populate_existing=True)
        result = await self._session.execute(stmt)
        return result.scalar_one_or_none()

    async def find_all(
        self, page: int = 1, limit: int = 20
    ) -> tuple[list[RepoModel], int]:
        """Return paginated repos and total count."""
        offset = (page - 1) * limit
        stmt = select(RepoModel).order_by(RepoModel.created_at.desc()).offset(offset).limit(limit)
        result = await self._session.execute(stmt)
        rows = list(result.scalars().all())

        count_stmt = select(RepoModel)
        count_result = await self._session.execute(count_stmt)
        total = len(list(count_result.scalars().all()))

        return rows, total

    # ── Mutations ─────────────────────────────────────────────────────────────

    async def create(self, data: dict[str, Any]) -> RepoModel:
        repo = RepoModel(**data)
        self._session.add(repo)
        await self._session.flush()  # Gets DB-assigned defaults without committing
        logger.info("repo_created", repo_id=data.get("repo_id"))
        return repo

    async def update_status(
        self,
        repo_id: str,
        status: RepoStatus,
        *,
        stats: dict | None = None,
        error: str | None = None,
        progress_message: str | None = None,
        progress_pct: int | None = None,
    ) -> None:
        values: dict[str, Any] = {
            "status": status,
            "updated_at": datetime.utcnow(),
        }
        if stats is not None:
            values["stats"] = stats
        if error is not None:
            values["error"] = error
        if progress_message is not None:
            values["progress_message"] = progress_message
        if progress_pct is not None:
            values["progress_pct"] = progress_pct

        stmt = (
            update(RepoModel)
            .where(RepoModel.repo_id == repo_id)
            .values(**values)
        )
        await self._session.execute(stmt)
        await self._session.flush()

    async def delete(self, repo_id: str) -> None:
        repo = await self.find_by_id(repo_id)
        if repo:
            await self._session.delete(repo)
            await self._session.flush()
            logger.info("repo_deleted", repo_id=repo_id)
