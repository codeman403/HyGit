"""Custom exception hierarchy — following BACKEND_STANDARDS.md."""
from fastapi import Request
from fastapi.responses import JSONResponse


class AppError(Exception):
    def __init__(self, code: str, message: str, status: int = 400):
        self.code = code
        self.message = message
        self.status = status


class NotFoundError(AppError):
    def __init__(self, resource: str, id: str):
        super().__init__("NOT_FOUND", f"{resource} '{id}' not found", 404)


class ForbiddenError(AppError):
    def __init__(self):
        super().__init__("FORBIDDEN", "Insufficient permissions", 403)


class ValidationError(AppError):
    def __init__(self, message: str):
        super().__init__("VALIDATION_ERROR", message, 422)


class ExternalServiceError(AppError):
    def __init__(self, service: str, message: str):
        super().__init__("EXTERNAL_SERVICE_ERROR", f"{service}: {message}", 502)


async def app_error_handler(request: Request, exc: AppError) -> JSONResponse:
    return JSONResponse(
        status_code=exc.status,
        content={"success": False, "error": {"code": exc.code, "message": exc.message}},
    )
