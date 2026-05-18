"""
Rate Limiting Middleware for HyGit API.
Uses slowapi (Limits library) with in-memory storage.

Limits:
- Ingestion: 5/minute per IP (expensive GitHub API calls)
- Analysis endpoints: 20/minute per IP (HydraDB + OpenAI calls)
- Health: unlimited
"""
from __future__ import annotations

from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

# Singleton limiter — imported by routers
limiter = Limiter(key_func=get_remote_address, default_limits=["60/minute"])

__all__ = ["limiter", "RateLimitExceeded", "_rate_limit_exceeded_handler"]
