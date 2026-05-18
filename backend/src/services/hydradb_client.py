"""
HydraDB client — all interactions with the HydraDB API.
Uses the exact API patterns from docs.hydradb.com.
"""
from __future__ import annotations
import asyncio
import json
import time
from typing import Any, Optional
import httpx
import structlog

from src.core.config import settings
from src.core.errors import ExternalServiceError

logger = structlog.get_logger()

BASE_URL = settings.hydradb_base_url


class HydraDBClient:
    """Async client for the HydraDB API."""

    def __init__(self):
        self._client = httpx.AsyncClient(timeout=60.0)
        self._headers = {
            "Authorization": f"Bearer {settings.hydra_db_api_key}",
            "Content-Type": "application/json",
        }

    # ─── Tenant Management ─────────────────────────────────────────────────────

    async def create_tenant(self, tenant_id: str) -> dict:
        """Create a HydraDB tenant (isolated workspace per repo)."""
        resp = await self._client.post(
            f"{BASE_URL}/tenants/create",
            headers=self._headers,
            json={"tenant_id": tenant_id},
        )
        self._raise_for_status(resp, "HydraDB create_tenant")
        return resp.json()

    async def wait_for_tenant_ready(
        self, tenant_id: str, timeout: int = 180, interval: int = 4
    ) -> bool:
        """Poll until tenant infrastructure is provisioned."""
        deadline = time.time() + timeout
        while time.time() < deadline:
            try:
                resp = await self._client.get(
                    f"{BASE_URL}/tenants/infra/status",
                    headers=self._headers,
                    params={"tenant_id": tenant_id},
                )
                if resp.status_code == 200:
                    data = resp.json()
                    # Check for both status=ready and full infra object
                    if data.get("status") == "ready":
                        return True
                    infra = data.get("infra", {})
                    vs = infra.get("vectorstore_status", [False, False])
                    if infra.get("graph_status") and len(vs) >= 2 and all(vs):
                        return True
            except Exception as e:
                logger.warning("tenant_status_poll_error", error=str(e))
            await asyncio.sleep(interval)
        return False

    async def delete_tenant(self, tenant_id: str) -> dict:
        resp = await self._client.delete(
            f"{BASE_URL}/tenants/delete",
            headers=self._headers,
            params={"tenant_id": tenant_id},
        )
        return resp.json() if resp.status_code < 400 else {}

    # ─── Knowledge Ingestion ───────────────────────────────────────────────────

    async def upload_app_knowledge(
        self,
        tenant_id: str,
        items: list[dict],
        upsert: bool = True,
    ) -> list[str]:
        """
        Upload structured knowledge (commits, PRs, issues, code) using app_knowledge path.
        Returns list of source IDs.
        """
        # HydraDB requires form data for this endpoint
        resp = await self._client.post(
            f"{BASE_URL}/ingestion/upload_knowledge",
            headers={k: v for k, v in self._headers.items() if k != "Content-Type"},
            data={
                "tenant_id": tenant_id,
                "app_knowledge": json.dumps(items),
                "upsert": "true" if upsert else "false",
            },
        )
        self._raise_for_status(resp, "HydraDB upload_knowledge")
        data = resp.json()
        results = data.get("results", [])
        return [r.get("source_id", r.get("id", "")) for r in results]

    async def upload_file_knowledge(
        self,
        tenant_id: str,
        filename: str,
        content: bytes,
        content_type: str = "text/plain",
        file_id: Optional[str] = None,
        metadata: Optional[dict] = None,
    ) -> str:
        """Upload a binary file (for source code)."""
        upload_headers = {k: v for k, v in self._headers.items() if k != "Content-Type"}
        
        form_data = {"tenant_id": tenant_id}
        if file_id:
            meta_list = [{"file_id": file_id, "metadata": metadata or {}}]
            form_data["file_metadata"] = json.dumps(meta_list)

        resp = await self._client.post(
            f"{BASE_URL}/ingestion/upload_knowledge",
            headers=upload_headers,
            files={"files": (filename, content, content_type)},
            data=form_data,
        )
        self._raise_for_status(resp, "HydraDB upload_file")
        results = resp.json().get("results", [{}])
        return results[0].get("source_id", "") if results else ""

    async def verify_processing(
        self,
        tenant_id: str,
        source_ids: list[str],
        timeout: int = 300,
        interval: int = 5,
    ) -> bool:
        """Poll until all source_ids are processed."""
        remaining = set(source_ids)
        deadline = time.time() + timeout

        while remaining and time.time() < deadline:
            ids_param = ",".join(remaining)
            resp = await self._client.post(
                f"{BASE_URL}/ingestion/verify_processing",
                headers=self._headers,
                params={"file_ids": ids_param, "tenant_id": tenant_id},
            )
            if resp.status_code == 200:
                statuses = resp.json().get("statuses", [])
                for s in statuses:
                    if s.get("indexing_status") in ("completed", "errored"):
                        remaining.discard(s.get("file_id", ""))
            if remaining:
                await asyncio.sleep(interval)

        return len(remaining) == 0

    # ─── Recall ────────────────────────────────────────────────────────────────

    async def full_recall(
        self,
        tenant_id: str,
        query: str,
        max_results: int = 15,
        mode: str = "thinking",
        graph_context: bool = True,
        recency_bias: float = 0.0,
        alpha: float = 0.75,
        metadata_filters: Optional[dict] = None,
        additional_context: Optional[str] = None,
    ) -> dict:
        """
        Primary recall endpoint — hybrid semantic + graph + metadata.
        Returns: {chunks: [...], sources: [...], graph_context: {...}}
        """
        body: dict[str, Any] = {
            "tenant_id": tenant_id,
            "query": query,
            "max_results": max_results,
            "mode": mode,
            "graph_context": graph_context,
            "recency_bias": recency_bias,
            "alpha": alpha,
        }
        if metadata_filters:
            body["metadata_filters"] = metadata_filters
        if additional_context:
            body["additional_context"] = additional_context

        resp = await self._client.post(
            f"{BASE_URL}/recall/full_recall",
            headers=self._headers,
            json=body,
        )
        self._raise_for_status(resp, "HydraDB full_recall")
        return resp.json()

    async def boolean_recall(
        self,
        tenant_id: str,
        query: str,
        max_results: int = 20,
    ) -> dict:
        """
        Deterministic full-text search — finds exact terms.
        Ideal for: function names, error messages, TODO text, PR numbers.
        """
        resp = await self._client.post(
            f"{BASE_URL}/recall/boolean_recall",
            headers=self._headers,
            json={
                "tenant_id": tenant_id,
                "query": query,
                "max_results": max_results,
            },
        )
        self._raise_for_status(resp, "HydraDB boolean_recall")
        return resp.json()

    async def recall_preferences(
        self,
        tenant_id: str,
        sub_tenant_id: str,
        query: str,
        max_results: int = 5,
        mode: str = "fast",
    ) -> dict:
        """Recall user-scoped memories (per-contributor knowledge)."""
        resp = await self._client.post(
            f"{BASE_URL}/recall/recall_preferences",
            headers=self._headers,
            json={
                "tenant_id": tenant_id,
                "sub_tenant_id": sub_tenant_id,
                "query": query,
                "max_results": max_results,
                "mode": mode,
            },
        )
        self._raise_for_status(resp, "HydraDB recall_preferences")
        return resp.json()

    # ─── Helpers ───────────────────────────────────────────────────────────────

    @staticmethod
    def build_context_string(
        chunks: list[dict],
        min_score: float = 0.4,
        max_chunks: int = 12,
    ) -> tuple[str, list[dict]]:
        """
        Extract chunk_content and build LLM context string.
        Returns: (context_text, sources_list)
        """
        parts: list[str] = []
        sources: list[dict] = []
        seen: set[str] = set()

        for chunk in chunks[:max_chunks]:
            score = chunk.get("relevancy_score", 1.0)
            if score < min_score:
                continue
            content = chunk.get("chunk_content", "")
            uid = chunk.get("chunk_uuid", content[:40])
            if not content or uid in seen:
                continue
            seen.add(uid)

            source_type = (
                chunk.get("document_metadata", {}).get("source_type")
                or chunk.get("tenant_metadata", {}).get("source_type")
                or "doc"
            )
            title = chunk.get("source_title", "untitled")
            parts.append(f"[{source_type.upper()}] {title}\n{content}")
            sources.append({
                "title": title,
                "source_type": source_type,
                "relevancy_score": score,
                "chunk_uuid": uid,
                "url": chunk.get("url"),
                "excerpt": content[:200],
            })

        return "\n\n---\n\n".join(parts), sources

    @staticmethod
    def extract_graph_paths(graph_context: dict) -> list[dict]:
        """Extract human-readable graph paths from HydraDB graph_context."""
        paths = []
        for path in graph_context.get("query_paths", []):
            triplets = path.get("triplets", [])
            if not triplets:
                continue
            path_str = []
            for t in triplets:
                src = t.get("source", {}).get("name", "?")
                rel = t.get("relation", {}).get("canonical_predicate", "→")
                tgt = t.get("target", {}).get("name", "?")
                path_str.append(f"{src} --[{rel}]--> {tgt}")
            paths.append({
                "path": " | ".join(path_str),
                "relevancy_score": path.get("relevancy_score", 0),
                "entities": [
                    t.get("source", {}).get("name", "") for t in triplets
                ] + [triplets[-1].get("target", {}).get("name", "")] if triplets else [],
                "relations": [t.get("relation", {}).get("canonical_predicate", "") for t in triplets],
            })
        return paths

    @staticmethod
    def _raise_for_status(resp: httpx.Response, context: str) -> None:
        if resp.status_code >= 400:
            try:
                detail = resp.json()
            except Exception:
                detail = resp.text
            raise ExternalServiceError(context, f"HTTP {resp.status_code}: {detail}")

    async def close(self):
        await self._client.aclose()


# Singleton
hydradb = HydraDBClient()
