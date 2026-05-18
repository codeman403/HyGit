"""
GitHub ingestion pipeline.
Fetches code, commits, issues, PRs, review comments → uploads to HydraDB.

HydraDB Tenant Strategy:
  Each repo gets its own tenant_id: f"hygit-{owner}-{repo_name}"
  Multi-tenancy: each repo = isolated workspace, per HydraDB docs.

Metadata Schema (filterable fields):
  source_type: "code" | "commit" | "issue" | "pr" | "pr_comment"
  author: str
  language: str (for code files)
"""
from __future__ import annotations

import asyncio
import hashlib
import json
import re
import time
from datetime import datetime
from pathlib import Path
from typing import Any, Optional

import httpx
import structlog

from src.core.config import settings
from src.services.hydradb_client import hydradb

logger = structlog.get_logger()

# File extensions to ingest
TEXT_EXTS = {
    ".py", ".ts", ".tsx", ".js", ".jsx", ".go", ".rs", ".java",
    ".kt", ".rb", ".php", ".c", ".cpp", ".h", ".hpp",
    ".md", ".yml", ".yaml", ".toml", ".json", ".txt", ".sh",
}
SKIP_DIRS = {
    ".git", "node_modules", "dist", "build", "__pycache__",
    ".venv", "venv", ".next", ".cache", "vendor", "target",
}
MAX_FILE_SIZE = 200_000  # 200KB per file


def _gh_headers() -> dict:
    """Build GitHub headers fresh each call — picks up token from live settings."""
    return {
        "Authorization": f"Bearer {settings.github_token}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
    }


class GitHubIngestionService:
    """
    Orchestrates full GitHub repo ingestion into HydraDB.
    
    Pipeline:
    1. Create/verify HydraDB tenant
    2. Fetch + upload source code files
    3. Fetch + upload commits (with file change metadata)
    4. Fetch + upload issues (with comments)
    5. Fetch + upload PRs (with review comments, file lists)
    6. Build explicit relations: PR → changed files, commit → files
    7. Return ingestion stats
    """

    def __init__(self):
        self._http = httpx.AsyncClient(timeout=30.0, follow_redirects=True)

    def tenant_id_for_repo(self, owner: str, repo: str) -> str:
        """Deterministic tenant ID per repo. HydraDB: each repo = one tenant."""
        safe = re.sub(r"[^a-z0-9-]", "-", f"hygit-{owner}-{repo}".lower())
        return safe[:50]

    def repo_id_for(self, owner: str, repo: str) -> str:
        return hashlib.md5(f"{owner}/{repo}".encode()).hexdigest()[:16]

    async def ingest_repo(
        self,
        owner: str,
        repo: str,
        max_commits: int = 500,
        max_issues: int = 200,
        max_prs: int = 200,
        include_code: bool = True,
        progress_callback=None,
    ) -> dict[str, int]:
        """
        Full ingestion pipeline. Returns stats dict.
        """
        tenant_id = self.tenant_id_for_repo(owner, repo)
        repo_name = f"{owner}/{repo}"
        stats: dict[str, int] = {
            "code_files": 0, "commits": 0, "issues": 0, "prs": 0, "comments": 0
        }

        def emit(msg: str, pct: int = 0):
            logger.info("ingestion_progress", repo=repo_name, message=msg, pct=pct)
            if progress_callback:
                progress_callback(msg, pct)

        emit("Creating HydraDB tenant...", 2)
        await self._ensure_tenant(tenant_id)

        emit("Tenant ready. Fetching repository tree...", 5)

        # Parallel ingestion: code + metadata sources
        tasks = []
        if include_code:
            tasks.append(self._ingest_code(tenant_id, owner, repo, stats, emit))
        tasks.append(self._ingest_commits(tenant_id, owner, repo, max_commits, stats, emit))
        tasks.append(self._ingest_issues(tenant_id, owner, repo, max_issues, stats, emit))
        tasks.append(self._ingest_prs(tenant_id, owner, repo, max_prs, stats, emit))

        await asyncio.gather(*tasks)

        emit("✅ Ingestion complete!", 100)
        return stats

    # ─── Tenant ───────────────────────────────────────────────────────────────

    async def _ensure_tenant(self, tenant_id: str) -> None:
        """Create tenant if not exists, wait until ready."""
        try:
            await hydradb.create_tenant(tenant_id)
        except Exception as e:
            if "already exists" in str(e).lower() or "409" in str(e):
                pass  # Tenant exists, fine
            else:
                raise

        ready = await hydradb.wait_for_tenant_ready(tenant_id)
        if not ready:
            raise RuntimeError(f"Tenant {tenant_id} did not become ready in time")

    # ─── Code Files ───────────────────────────────────────────────────────────

    async def _ingest_code(
        self, tenant_id: str, owner: str, repo: str, stats: dict, emit
    ) -> None:
        emit("Fetching file tree from GitHub...", 10)
        try:
            resp = await self._http.get(
                f"https://api.github.com/repos/{owner}/{repo}/git/trees/HEAD",
                params={"recursive": "1"},
                headers=_gh_headers(),
            )
            if not resp.is_success:
                logger.warning("code_tree_failed", status=resp.status_code)
                return
            tree = resp.json().get("tree", [])
        except Exception as e:
            logger.warning("code_tree_error", error=str(e))
            return

        # Filter to text files
        code_files = [
            f for f in tree
            if f.get("type") == "blob"
            and Path(f["path"]).suffix in TEXT_EXTS
            and f.get("size", 0) < MAX_FILE_SIZE
            and not any(skip in f["path"].split("/") for skip in SKIP_DIRS)
        ]

        emit(f"Found {len(code_files)} code files. Uploading to HydraDB...", 15)
        all_source_ids: list[str] = []

        sem = asyncio.Semaphore(20)

        async def fetch_file(file_info):
            path = file_info["path"]
            lang = Path(path).suffix.lstrip(".")
            async with sem:
                try:
                    raw_resp = await self._http.get(
                        f"https://raw.githubusercontent.com/{owner}/{repo}/HEAD/{path}",
                        headers={},  # No auth needed for raw
                    )
                    if not raw_resp.is_success:
                        return None
                    content = raw_resp.text[:MAX_FILE_SIZE]
                except Exception:
                    return None

            return {
                "id": f"{owner}/{repo}/{path}",
                "title": path,
                "type": "document",
                "timestamp": datetime.utcnow().isoformat() + "Z",
                "content": {"text": f"File: {path}\nLanguage: {lang}\n\n{content}"},
                "metadata": {
                    "source_type": "code",
                    "language": lang,
                },
                "additional_metadata": {
                    "file_path": path,
                    "repo": f"{owner}/{repo}",
                    "size": file_info.get("size", 0),
                },
            }

        for i in range(0, len(code_files), 20):
            chunk = code_files[i:i+20]
            tasks = [fetch_file(f) for f in chunk]
            results = await asyncio.gather(*tasks)
            valid_items = [r for r in results if r]
            if valid_items:
                ids = await self._upload_batch(tenant_id, valid_items)
                all_source_ids.extend(ids)
                stats["code_files"] += len(valid_items)
            await asyncio.sleep(0.5)  # rate limit

        emit(f"Uploaded {stats['code_files']} code files. Verifying indexing...", 25)

    # ─── Commits ──────────────────────────────────────────────────────────────

    async def _ingest_commits(
        self, tenant_id: str, owner: str, repo: str, max_commits: int, stats: dict, emit
    ) -> None:
        emit("Fetching commits...", 30)
        commits = await self._paginate_github(
            f"https://api.github.com/repos/{owner}/{repo}/commits",
            max_items=max_commits,
            params={"per_page": 100},
        )

        batch: list[dict] = []
        for commit in commits:
            sha = commit.get("sha", "")[:8]
            c = commit.get("commit", {})
            author = c.get("author", {})
            message = c.get("message", "")
            # Parse conventional commit type
            msg_type = "feat"
            if message.lower().startswith(("fix", "bug")):
                msg_type = "fix"
            elif message.lower().startswith(("refactor", "chore")):
                msg_type = "chore"

            item = {
                "id": f"commit-{sha}",
                "title": f"Commit {sha}: {message[:80]}",
                "type": "document",
                "timestamp": author.get("date", datetime.utcnow().isoformat() + "Z"),
                "content": {"text": f"Commit: {sha}\nAuthor: {author.get('name', '?')}\nDate: {author.get('date', '')}\n\nMessage:\n{message}"},
                "metadata": {
                    "source_type": "commit",
                    "author": author.get("name", ""),
                },
                "additional_metadata": {
                    "sha": commit.get("sha", ""),
                    "message_type": msg_type,
                    "repo": f"{owner}/{repo}",
                    "html_url": commit.get("html_url", ""),
                },
            }
            batch.append(item)

            if len(batch) >= 20:
                await self._upload_batch(tenant_id, batch)
                stats["commits"] += len(batch)
                batch = []

        if batch:
            await self._upload_batch(tenant_id, batch)
            stats["commits"] += len(batch)

        emit(f"Ingested {stats['commits']} commits.", 50)

    # ─── Issues ───────────────────────────────────────────────────────────────

    async def _ingest_issues(
        self, tenant_id: str, owner: str, repo: str, max_issues: int, stats: dict, emit
    ) -> None:
        emit("Fetching issues...", 55)
        # GitHub /issues returns both real issues AND PRs mixed together.
        # Fetch 5x the requested count to account for the high PR ratio, then filter.
        raw_issues = await self._paginate_github(
            f"https://api.github.com/repos/{owner}/{repo}/issues",
            max_items=max_issues * 5,
            params={"state": "all", "per_page": 100},
        )
        issues = [i for i in raw_issues if not i.get("pull_request")][:max_issues]

        batch: list[dict] = []
        sem = asyncio.Semaphore(15)

        async def process_issue(issue):
            num = issue.get("number", 0)
            labels = [l.get("name", "") for l in issue.get("labels", [])]
            body = issue.get("body") or ""

            comments_text = ""
            comments_count = issue.get("comments", 0)
            if comments_count > 0:
                async with sem:
                    try:
                        cr = await self._http.get(
                            f"https://api.github.com/repos/{owner}/{repo}/issues/{num}/comments",
                            params={"per_page": 50},
                            headers=_gh_headers(),
                        )
                        if cr.is_success:
                            for c in cr.json():
                                comments_text += f"\n\n@{c.get('user', {}).get('login', '?')}: {c.get('body', '')}"
                    except Exception:
                        pass

            return {
                "item": {
                    "id": f"issue-{num}",
                    "title": f"Issue #{num}: {issue.get('title', '')}",
                    "type": "document",
                    "timestamp": issue.get("created_at", datetime.utcnow().isoformat() + "Z"),
                    "url": issue.get("html_url", ""),
                    "content": {"text": f"Issue #{num}: {issue.get('title', '')}\nState: {issue.get('state', '')}\nLabels: {', '.join(labels)}\n\nDescription:\n{body}\n\nComments:{comments_text}"},
                    "metadata": {
                        "source_type": "issue",
                        "author": issue.get("user", {}).get("login", ""),
                    },
                    "additional_metadata": {
                        "issue_number": num,
                        "state": issue.get("state", ""),
                        "labels": labels,
                        "closed_at": issue.get("closed_at", ""),
                        "repo": f"{owner}/{repo}",
                    },
                },
                "comments": comments_count
            }

        for i in range(0, len(issues), 20):
            chunk = issues[i:i+20]
            tasks = [process_issue(issue) for issue in chunk]
            results = await asyncio.gather(*tasks)
            valid_results = [r for r in results if r]
            valid_items = [r["item"] for r in valid_results]
            for r in valid_results:
                stats["comments"] += r["comments"]
            
            if valid_items:
                await self._upload_batch(tenant_id, valid_items)
                stats["issues"] += len(valid_items)

        emit(f"Ingested {stats['issues']} issues.", 70)

    # ─── Pull Requests ────────────────────────────────────────────────────────

    async def _ingest_prs(
        self, tenant_id: str, owner: str, repo: str, max_prs: int, stats: dict, emit
    ) -> None:
        emit("Fetching pull requests...", 72)
        prs = await self._paginate_github(
            f"https://api.github.com/repos/{owner}/{repo}/pulls",
            max_items=max_prs,
            params={"state": "all", "per_page": 100},
        )

        sem = asyncio.Semaphore(15)

        async def process_pr(pr):
            num = pr.get("number", 0)
            body = pr.get("body") or ""

            async with sem:
                tasks = [
                    self._http.get(f"https://api.github.com/repos/{owner}/{repo}/pulls/{num}/files", params={"per_page": 100}, headers=_gh_headers()),
                    self._http.get(f"https://api.github.com/repos/{owner}/{repo}/pulls/{num}/reviews", params={"per_page": 50}, headers=_gh_headers()),
                    self._http.get(f"https://api.github.com/repos/{owner}/{repo}/pulls/{num}/comments", params={"per_page": 100}, headers=_gh_headers()),
                ]
                responses = await asyncio.gather(*tasks, return_exceptions=True)

            fr, rr, cr = responses
            changed_files = []
            if not isinstance(fr, Exception) and fr.is_success:
                changed_files = [f.get("filename", "") for f in fr.json()]

            reviews_text = ""
            if not isinstance(rr, Exception) and rr.is_success:
                for r in rr.json():
                    if r.get("body"):
                        reviews_text += f"\n\n@{r.get('user', {}).get('login', '?')} ({r.get('state', '')}): {r.get('body', '')}"

            inline_text = ""
            comments_count = 0
            if not isinstance(cr, Exception) and cr.is_success:
                for c in cr.json():
                    if c.get("body"):
                        file_path = c.get("path", "")
                        inline_text += f"\n\n@{c.get('user', {}).get('login', '?')} on {file_path}: {c.get('body', '')}"
                        comments_count += 1

            source_file_ids = [f"{owner}/{repo}/{f}" for f in changed_files]
            merged_at = pr.get("merged_at", "")
            timestamp = merged_at or pr.get("created_at", datetime.utcnow().isoformat() + "Z")

            content_text = (
                f"PR #{num}: {pr.get('title', '')}\n"
                f"Author: {pr.get('user', {}).get('login', '?')} | "
                f"State: {pr.get('state', '')} | Merged: {merged_at or 'No'}\n\n"
                f"Description:\n{body}\n\n"
                f"Changed files ({len(changed_files)}):\n" + "\n".join(changed_files[:50]) +
                f"\n\nReview comments:\n{reviews_text or '(none)'}\n\n"
                f"Inline comments:\n{inline_text or '(none)'}"
            )

            return {
                "item": {
                    "id": f"pr-{num}",
                    "title": f"PR #{num}: {pr.get('title', '')}",
                    "type": "document",
                    "timestamp": timestamp,
                    "url": pr.get("html_url", ""),
                    "content": {"text": content_text},
                    "metadata": {
                        "source_type": "pr",
                        "author": pr.get("user", {}).get("login", ""),
                    },
                    "additional_metadata": {
                        "pr_number": num,
                        "state": pr.get("state", ""),
                        "merged": bool(merged_at),
                        "changed_files": changed_files[:50],
                        "repo": f"{owner}/{repo}",
                    },
                    "relations": {"hydradb_source_ids": source_file_ids[:20]},
                },
                "comments": comments_count
            }

        for i in range(0, len(prs), 15):
            chunk = prs[i:i+15]
            tasks = [process_pr(pr) for pr in chunk]
            results = await asyncio.gather(*tasks)
            valid_results = [r for r in results if r]
            valid_items = [r["item"] for r in valid_results]
            for r in valid_results:
                stats["comments"] += r["comments"]

            if valid_items:
                await self._upload_batch(tenant_id, valid_items)
                stats["prs"] += len(valid_items)

        emit(f"Ingested {stats['prs']} PRs with {stats['comments']} review comments.", 90)

    # ─── Helpers ──────────────────────────────────────────────────────────────

    async def _upload_batch(self, tenant_id: str, batch: list[dict]) -> list[str]:
        """Upload a batch of items to HydraDB and return source IDs."""
        try:
            for item in batch:
                item["tenant_id"] = tenant_id
                item["sub_tenant_id"] = "default"
            ids = await hydradb.upload_app_knowledge(tenant_id, batch)
            logger.info("batch_uploaded", count=len(batch), tenant_id=tenant_id)
            return ids
        except Exception as e:
            logger.error("batch_upload_failed", error=str(e), count=len(batch))
            return []

    async def _paginate_github(
        self, url: str, max_items: int, params: dict
    ) -> list[dict]:
        """Paginate GitHub API, respect max_items."""
        items: list[dict] = []
        page = 1
        while len(items) < max_items:
            try:
                resp = await self._http.get(
                    url, params={**params, "page": page},
                    headers=_gh_headers(),
                )
                if not resp.is_success:
                    break
                page_items = resp.json()
                if not page_items:
                    break
                items.extend(page_items)
                page += 1
                await asyncio.sleep(0.1)
            except Exception as e:
                logger.warning("github_paginate_error", url=url, error=str(e))
                break
        return items[:max_items]

    async def close(self):
        await self._http.aclose()


# Singleton
ingestion_service = GitHubIngestionService()
