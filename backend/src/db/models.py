"""
SQLAlchemy ORM models — operational data (repos, ingestion jobs).
HydraDB continues to own all knowledge/graph data.
"""
from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlalchemy import JSON, DateTime, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from src.db.database import Base


class RepoModel(Base):
    """Persists repository metadata and ingestion status.

    Replaces the flat repos_db.json file — survives restarts,
    supports concurrent writes, and is queryable.
    """

    __tablename__ = "repos"

    # Primary key is the deterministic repo_id (e.g. "owner__repo")
    repo_id: Mapped[str] = mapped_column(String(255), primary_key=True)
    tenant_id: Mapped[str] = mapped_column(String(255), nullable=False)
    owner: Mapped[str] = mapped_column(String(255), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    status: Mapped[str] = mapped_column(String(50), nullable=False, default="pending")

    # Ingestion stats — stored as JSONB (e.g. {"code_files": 120, "prs": 40})
    stats: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)

    # Progress tracking for the background task
    progress_message: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    progress_pct: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)

    # Error capture
    error: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.utcnow
    )
    updated_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
