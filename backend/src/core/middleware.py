"""
Custom middleware.
- RequestIDMiddleware: injects X-Request-ID for log correlation.
Following BACKEND_STANDARDS.md observability requirements.
"""
from __future__ import annotations

import uuid

import structlog
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

logger = structlog.get_logger()


class RequestIDMiddleware(BaseHTTPMiddleware):
    """
    Generates or forwards an X-Request-ID header on every request.
    Binds the request_id to the structlog context so every log line
    emitted during that request carries the correlation ID.
    """

    async def dispatch(self, request: Request, call_next) -> Response:
        request_id = request.headers.get("X-Request-ID") or str(uuid.uuid4())

        # Bind to structlog context for this async task
        structlog.contextvars.bind_contextvars(request_id=request_id)

        response = await call_next(request)
        response.headers["X-Request-ID"] = request_id

        # Clear after request to avoid leaking into other tasks
        structlog.contextvars.clear_contextvars()
        return response
