"""
Redis caching layer.
Following TOKEN_STRATEGY.md: cache LLM responses to avoid repeat GPT-4o calls.
Cache key convention: {resource_type}:{identifier}
"""
from __future__ import annotations

import json
from typing import Any

import redis.asyncio as aioredis
import structlog

from src.core.config import settings

logger = structlog.get_logger()

_redis: aioredis.Redis | None = None


async def get_redis() -> aioredis.Redis:
    """Lazy-initialize the Redis connection pool."""
    global _redis
    if _redis is None:
        _redis = aioredis.from_url(
            settings.redis_url,
            encoding="utf-8",
            decode_responses=True,
            socket_connect_timeout=3,
        )
    return _redis


async def close_redis() -> None:
    global _redis
    if _redis is not None:
        await _redis.aclose()
        _redis = None
        logger.info("redis_connection_closed")


# ── Cache helpers ─────────────────────────────────────────────────────────────

async def cache_get(key: str) -> Any | None:
    """Return cached value or None on miss / Redis unavailable."""
    try:
        r = await get_redis()
        raw = await r.get(key)
        return json.loads(raw) if raw else None
    except Exception as e:
        logger.warning("cache_get_failed", key=key, error=str(e))
        return None


async def cache_set(key: str, value: Any, ttl: int | None = None) -> None:
    """Serialize and store value. Silently degrades on Redis failure."""
    try:
        r = await get_redis()
        serialized = json.dumps(value, default=str)
        if ttl or settings.cache_ttl_seconds:
            await r.setex(key, ttl or settings.cache_ttl_seconds, serialized)
        else:
            await r.set(key, serialized)
    except Exception as e:
        logger.warning("cache_set_failed", key=key, error=str(e))


async def cache_delete(pattern: str) -> None:
    """Delete all keys matching a pattern (e.g. on repo deletion)."""
    try:
        r = await get_redis()
        keys = await r.keys(pattern)
        if keys:
            await r.delete(*keys)
            logger.info("cache_invalidated", pattern=pattern, count=len(keys))
    except Exception as e:
        logger.warning("cache_delete_failed", pattern=pattern, error=str(e))


# ── Typed cache keys ──────────────────────────────────────────────────────────

def wiki_cache_key(tenant_id: str, module_path: str) -> str:
    return f"wiki:{tenant_id}:{module_path}"


def provenance_cache_key(tenant_id: str, file_path: str) -> str:
    return f"provenance:{tenant_id}:{file_path}"


def graph_cache_key(tenant_id: str) -> str:
    return f"graph:{tenant_id}"
