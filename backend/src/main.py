"""
HyGit FastAPI Application — main entry point.
Following BACKEND_STANDARDS.md: App factory pattern with lifespan.
"""
from contextlib import asynccontextmanager

import structlog
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware

from src.api.v1 import analysis, repos
from src.core.config import settings
from src.core.errors import AppError, app_error_handler
from src.core.middleware import RequestIDMiddleware
from src.core.rate_limit import RateLimitExceeded, _rate_limit_exceeded_handler, limiter
from src.db.database import close_db, init_db
from src.core.cache import close_redis
from src.services.hydradb_client import hydradb

logger = structlog.get_logger()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup/shutdown lifecycle — DB, Redis, HydraDB."""
    logger.info("hygit_api_starting", version=settings.version)
    # Startup: initialize PostgreSQL tables and warm connections
    await init_db()
    yield
    # Shutdown: close all connection pools cleanly
    logger.info("hygit_api_shutting_down")
    await close_db()
    await close_redis()
    await hydradb.close()


def create_app() -> FastAPI:
    app = FastAPI(
        title="HyGit API",
        description="Wikipedia for any GitHub Repo — powered by HydraDB context graphs",
        version="1.0.0",
        lifespan=lifespan,
        docs_url="/api/docs",
        redoc_url="/api/redoc",
        openapi_url="/api/openapi.json",
    )

    # Middleware (order matters — outermost first)
    app.add_middleware(RequestIDMiddleware)  # Injects X-Request-ID for log correlation
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.add_middleware(GZipMiddleware, minimum_size=1000)

    # Rate limiting
    app.state.limiter = limiter
    app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)  # type: ignore[arg-type]

    # Error handlers
    app.add_exception_handler(AppError, app_error_handler)

    # Routers
    app.include_router(repos.router, prefix="/api/v1")
    app.include_router(analysis.router, prefix="/api/v1")

    # Health check
    @app.get("/health", tags=["system"])
    async def health():
        return {
            "status": "ok",
            "service": "hygit-api",
            "version": settings.version,
            "hydradb_configured": bool(settings.hydra_db_api_key),
            "openai_configured": bool(settings.openai_api_key),
            "github_configured": bool(settings.github_token),
        }

    return app


app = create_app()

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host=settings.host,
        port=settings.port,
        reload=settings.debug,
        log_level="info",
    )
