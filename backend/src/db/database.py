"""
Database engine and session factory.
Following BACKEND_STANDARDS.md: async SQLAlchemy with lifespan management.
"""
from __future__ import annotations

from collections.abc import AsyncGenerator

import structlog
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import DeclarativeBase

from src.core.config import settings

logger = structlog.get_logger()

# Supabase uses PgBouncer which doesn't support asyncpg prepared statements.
# statement_cache_size=0 disables them so writes commit correctly through the pooler.
engine = create_async_engine(
    settings.database_url,
    echo=settings.debug,
    pool_pre_ping=True,
    pool_size=10,
    max_overflow=20,
    connect_args={
        "statement_cache_size": 0,        # Required for Supabase PgBouncer
        "server_settings": {
            "statement_timeout": "30000",  # 30s — overrides Supabase pooler default
        },
    },
)

AsyncSessionLocal = async_sessionmaker(
    engine,
    expire_on_commit=False,
    class_=AsyncSession,
)


class Base(DeclarativeBase):
    pass


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """FastAPI dependency — yields a scoped async DB session."""
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise


async def init_db() -> None:
    """Create all tables on startup (dev-friendly; use Alembic for production migrations)."""
    # Import models so Base registers them before create_all
    from src.db import models  # noqa: F401

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    logger.info("db_tables_initialized")


async def close_db() -> None:
    """Dispose engine connection pool on shutdown."""
    await engine.dispose()
    logger.info("db_connection_pool_closed")
