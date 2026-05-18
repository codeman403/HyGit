"""Application configuration — loaded from environment variables."""
import os
from pathlib import Path
from typing import Any
from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(Path(__file__).parent.parent.parent / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # Server
    app_name: str = "HyGit API"
    version: str = "1.0.0"
    debug: bool = False
    host: str = "0.0.0.0"
    port: int = 8000
    cors_origins: Any = "http://localhost:3000,http://localhost:3001,http://localhost:5173"

    @field_validator("cors_origins", mode="before")
    @classmethod
    def parse_cors(cls, v: Any) -> list[str]:
        if isinstance(v, list):
            return v
        if isinstance(v, str):
            return [s.strip() for s in v.split(",") if s.strip()]
        return []

    # HydraDB
    hydra_db_api_key: str = ""
    hydradb_base_url: str = "https://api.hydradb.com"

    # OpenAI
    openai_api_key: str = ""
    openai_model: str = "gpt-4o"
    openai_model_mini: str = "gpt-4o-mini"

    # GitHub
    github_token: str = ""

    # PostgreSQL — operational data (repos, jobs)
    database_url: str = "postgresql+asyncpg://hygit:hygit@localhost:5432/hygit"

    # Redis — LLM response cache
    redis_url: str = "redis://localhost:6379/0"
    # TTL for cached wiki articles and provenance traces (seconds)
    cache_ttl_seconds: int = 3600  # 1 hour

    @property
    def hydradb_headers(self) -> dict[str, str]:
        return {
            "Authorization": f"Bearer {self.hydra_db_api_key}",
            "Content-Type": "application/json",
        }


settings = Settings()
