"""
AI Analysis Service — uses HydraDB recall + OpenAI to generate:
- Provenance narratives (why was this file built?)
- Wiki articles (per-module Wikipedia)
- Codebase Recovery reports (orphaned files)
- Unwritten Rules extraction (PR review patterns)
- Live Q&A with citations

Token efficiency (TOKEN_STRATEGY.md):
- Redis caches all LLM responses (TTL: 1 hour) to avoid repeat GPT-4o calls.
- Short queries / simple classifications route to gpt-4o-mini (~10x cheaper).
- Deterministic input guards run before any LLM call.
"""
from __future__ import annotations

import asyncio
import json
import re
from typing import Any, Optional

import structlog
from openai import AsyncOpenAI

from src.core.config import settings
from src.core.cache import (
    cache_get, cache_set,
    wiki_cache_key, provenance_cache_key, graph_cache_key,
)
from src.models.schemas import (
    Citation, ConventionViolation, GraphPath,
    OrphanedFile, ProvenanceResponse,
    SearchResponse, UnwrittenRule, WikiArticle,
)
from src.services.hydradb_client import hydradb

logger = structlog.get_logger()

openai_client = AsyncOpenAI(api_key=settings.openai_api_key)

# Token routing thresholds (TOKEN_STRATEGY.md)
# Queries under this word count use gpt-4o-mini; complex synthesis uses gpt-4o.
_MINI_MODEL_MAX_WORDS = 80


def _choose_model(prompt_text: str) -> str:
    """Route to cheaper model for short/simple prompts."""
    word_count = len(prompt_text.split())
    return settings.openai_model_mini if word_count <= _MINI_MODEL_MAX_WORDS else settings.openai_model


class AnalysisService:
    """
    All AI-powered analysis features for HyGit.
    Each method follows: Input Guard → Cache Check → HydraDB Recall → LLM Synthesize → Cache Store
    """

    # ─── Module Discovery ─────────────────────────────────────────────────────

    async def discover_modules(
        self,
        tenant_id: str,
        owner: str,
        repo_name: str,
        limit: int = 10,
    ) -> list[str]:
        """
        Dynamically discover top-level modules from the repo's file tree via GitHub API.
        Falls back to HydraDB recall if GitHub token is unavailable.
        Replaces the hardcoded module list in the wiki endpoint.
        """
        from src.core.config import settings as cfg

        # Try GitHub API first — most accurate
        if cfg.github_token:
            try:
                import httpx
                headers = {
                    "Authorization": f"token {cfg.github_token}",
                    "Accept": "application/vnd.github+json",
                }
                async with httpx.AsyncClient(timeout=10) as client:
                    resp = await client.get(
                        f"https://api.github.com/repos/{owner}/{repo_name}/git/trees/HEAD",
                        params={"recursive": "0"},
                        headers=headers,
                    )
                    if resp.status_code == 200:
                        tree = resp.json().get("tree", [])
                        # Return top-level directories (modules) up to limit
                        dirs = [
                            item["path"]
                            for item in tree
                            if item["type"] == "tree"
                            and "/" not in item["path"]
                            and not item["path"].startswith(".")
                        ]
                        if dirs:
                            logger.debug("modules_from_github", count=len(dirs))
                            return dirs[:limit]
            except Exception as e:
                logger.warning("github_module_discovery_failed", error=str(e))

        # Fallback: ask HydraDB what modules/directories appear in the codebase
        try:
            recall = await hydradb.full_recall(
                tenant_id=tenant_id,
                query="top-level directory module package folder structure",
                max_results=limit * 2,
                mode="fast",
                graph_context=False,
                metadata_filters={"source_type": "code"},
            )
            paths: set[str] = set()
            for chunk in recall.get("chunks", []):
                sid = chunk.get("source_id", "")
                # Extract top-level directory from path-style source IDs
                parts = sid.split("/")
                if len(parts) >= 3:  # owner/repo/path...
                    top = parts[2]
                    if top and not top.startswith("."):
                        paths.add(top)
            if paths:
                logger.debug("modules_from_hydradb", count=len(paths))
                return list(paths)[:limit]
        except Exception as e:
            logger.warning("hydradb_module_discovery_failed", error=str(e))

        # Last resort: generic useful modules
        return ["src", "api", "services", "models", "utils", "tests"][:limit]

    # ─── Provenance Engine ────────────────────────────────────────────────────

    async def get_provenance(
        self, tenant_id: str, file_path: str
    ) -> ProvenanceResponse:
        """
        Trace the full origin story of a file using HydraDB graph traversal.
        Cached in Redis for 1 hour — repeated calls for the same file are free.
        """
        logger.info("provenance_query", tenant_id=tenant_id, file_path=file_path)

        # Cache check — avoid repeat GPT-4o call
        cache_key = provenance_cache_key(tenant_id, file_path)
        cached = await cache_get(cache_key)
        if cached:
            logger.debug("provenance_cache_hit", file_path=file_path)
            return ProvenanceResponse(**cached)

        # 1. Semantic recall with graph traversal
        recall_result = await hydradb.full_recall(
            tenant_id=tenant_id,
            query=f"Why was {file_path} built? What issue or PR introduced it? What is its purpose?",
            max_results=15,
            mode="thinking",
            graph_context=True,
            alpha=0.75,
            recency_bias=0.1,
        )

        # 2. Boolean recall — find exact filename mentions
        bool_result = await hydradb.boolean_recall(
            tenant_id=tenant_id,
            query=file_path,
            max_results=10,
        )

        # 3. PR-scoped recall
        pr_result = await hydradb.full_recall(
            tenant_id=tenant_id,
            query=f"pull request that changed or introduced {file_path}",
            max_results=8,
            mode="fast",
            graph_context=False,
            metadata_filters={"source_type": "pr"},
        )

        semantic_ctx, semantic_sources = hydradb.build_context_string(
            recall_result.get("chunks", []), min_score=0.4
        )
        bool_ctx, bool_sources = hydradb.build_context_string(
            bool_result.get("chunks", []), min_score=0.3
        )
        pr_ctx, _ = hydradb.build_context_string(
            pr_result.get("chunks", []), min_score=0.3
        )

        graph_paths = hydradb.extract_graph_paths(recall_result.get("graph_context", {}))
        all_sources = semantic_sources + bool_sources

        prompt = f"""You are analyzing the provenance of a source code file.

File: {file_path}

CONTEXT FROM CODEBASE KNOWLEDGE GRAPH:
{semantic_ctx or "(no semantic matches)"}

EXACT MATCHES (filename found in):
{bool_ctx or "(no exact matches)"}

PR CONTEXT:
{pr_ctx or "(no PR matches)"}

GRAPH RELATIONSHIPS FOUND:
{json.dumps(graph_paths[:5], indent=2) if graph_paths else "(none)"}

Return JSON with this exact schema:
{{
  "narrative": "<2-3 paragraph story of why this file exists, written for a new engineer>",
  "introduced_in": "<PR number or commit SHA if found, else null>",
  "fixes_issue": "<issue number if found, else null>",
  "status": "<one of: active | orphaned | deprecated | temporary>",
  "verdict": "<one sentence conclusion: what should happen with this file?>",
  "context_graph": [
    {{"from": "entity1", "relation": "relation", "to": "entity2"}}
  ]
}}

Never fabricate PR numbers or issue references."""

        try:
            completion = await openai_client.chat.completions.create(
                model=settings.openai_model,  # Always GPT-4o for provenance — complex reasoning
                messages=[
                    {"role": "system", "content": "You are a codebase archaeologist. Analyze code provenance using provided context. Always cite specific PRs, issues, and commits when available. Return valid JSON only."},
                    {"role": "user", "content": prompt},
                ],
                temperature=0.2,
                max_tokens=1500,
                response_format={"type": "json_object"},
            )
            result = json.loads(completion.choices[0].message.content or "{}")
        except Exception as e:
            logger.error("provenance_llm_error", error=str(e))
            result = {
                "narrative": f"Unable to trace provenance for {file_path}. Please ensure the repository has been fully ingested.",
                "status": "unknown",
                "verdict": "Insufficient context to determine status.",
            }

        response = ProvenanceResponse(
            file_path=file_path,
            narrative=result.get("narrative", ""),
            introduced_in=result.get("introduced_in"),
            fixes_issue=result.get("fixes_issue"),
            status=result.get("status", "unknown"),
            verdict=result.get("verdict", ""),
            sources=[
                {"title": s["title"], "source_type": s["source_type"],
                 "relevancy_score": s["relevancy_score"], "excerpt": s["excerpt"]}
                for s in all_sources[:8]
            ],
            graph_paths=[
                GraphPath(
                    entities=p.get("entities", []),
                    relations=p.get("relations", []),
                    confidence=p.get("relevancy_score", 0.5),
                )
                for p in graph_paths[:5]
            ],
            context_graph_visualization=result.get("context_graph", []),
        )

        # Store in cache — serialise via model_dump to preserve datetime fields
        await cache_set(cache_key, response.model_dump())
        return response

    # ─── Wiki Generation ──────────────────────────────────────────────────────

    async def generate_wiki_article(
        self, tenant_id: str, module_path: str
    ) -> WikiArticle:
        """
        Generate a Wikipedia-style article for a module.
        Cached in Redis for 1 hour — re-generates only on cache miss.
        """
        logger.info("wiki_generation", tenant_id=tenant_id, module=module_path)
        slug = re.sub(r"[^a-z0-9]+", "-", module_path.lower()).strip("-")

        # Cache check
        cache_key = wiki_cache_key(tenant_id, module_path)
        cached = await cache_get(cache_key)
        if cached:
            logger.debug("wiki_cache_hit", module=module_path)
            return WikiArticle(**cached)

        recall = await hydradb.full_recall(
            tenant_id=tenant_id,
            query=f"What does the {module_path} module do? How was it built? What decisions shaped it?",
            max_results=20,
            mode="thinking",
            graph_context=True,
            alpha=0.7,
            recency_bias=0.05,
        )

        ctx, sources = hydradb.build_context_string(recall.get("chunks", []), min_score=0.35)
        graph_paths = hydradb.extract_graph_paths(recall.get("graph_context", {}))

        prompt = f"""You are writing a Wikipedia article about a software module for an engineering team.

Module: {module_path}

KNOWLEDGE BASE CONTEXT (from code, PRs, issues, commits):
{ctx or "(insufficient context — module may not be fully ingested yet)"}

GRAPH RELATIONSHIPS:
{json.dumps(graph_paths[:3], indent=2) if graph_paths else "(none)"}

Write a comprehensive Wikipedia-style article. Return JSON:
{{
  "title": "<Module Name>",
  "summary": "<1-2 sentence TL;DR>",
  "content": "<Full markdown article with sections: ## Overview, ## Architecture, ## Key Decisions, ## Evolution, ## Dependencies, ## Contributors. Use real PR/issue citations like [PR #123] and [Issue #456]. 400-800 words. DO NOT include a References section or Related Modules section — those are rendered separately by the UI>",
  "references": [
    {{"id": "pr-123", "title": "PR #123: Title", "type": "pr"}},
    {{"id": "issue-456", "title": "Issue #456: Title", "type": "issue"}}
  ],
  "related_modules": ["<module paths that this module depends on or is related to>"]
}}"""

        try:
            completion = await openai_client.chat.completions.create(
                model=settings.openai_model,  # GPT-4o for rich wiki synthesis
                messages=[
                    {"role": "system", "content": "You are a technical writer creating module documentation from codebase history. Be specific, cite evidence, write for senior engineers."},
                    {"role": "user", "content": prompt},
                ],
                temperature=0.3,
                max_tokens=2000,
                response_format={"type": "json_object"},
            )
            result = json.loads(completion.choices[0].message.content or "{}")
        except Exception as e:
            logger.error("wiki_llm_error", error=str(e))
            result = {
                "title": module_path,
                "summary": f"Module at {module_path}",
                "content": "Article generation failed. Please retry.",
                "references": [],
                "related_modules": [],
            }

        article = WikiArticle(
            slug=slug,
            title=result.get("title", module_path),
            summary=result.get("summary", ""),
            content=result.get("content", ""),
            module_path=module_path,
            references=result.get("references", []),
            related_articles=result.get("related_modules", []),
        )
        await cache_set(cache_key, article.model_dump())
        return article

    # ─── Codebase Recovery ────────────────────────────────────────────────────

    async def generate_recovery_report(
        self, tenant_id: str, owner: str, repo: str
    ) -> tuple[list[OrphanedFile], int]:
        """
        Find orphaned files using HydraDB recall.
        Returns (orphaned_files, total_scanned) — total_scanned is the actual
        count of code chunks in HydraDB, replacing the hardcoded 100.
        """
        logger.info("recovery_report", tenant_id=tenant_id)

        # Count total code files actually scanned — replaces hardcoded 100
        count_recall = await hydradb.full_recall(
            tenant_id=tenant_id,
            query="file code source",
            max_results=1000,  # High limit to count all code chunks
            mode="fast",
            graph_context=False,
            metadata_filters={"source_type": "code"},
        )
        total_scanned = len(count_recall.get("chunks", []))

        # Find files with low recent activity
        recall = await hydradb.full_recall(
            tenant_id=tenant_id,
            query="legacy code no active maintainer old file never updated orphaned unused deprecated",
            max_results=20,
            mode="thinking",
            graph_context=True,
            recency_bias=0.0,
            metadata_filters={"source_type": "code"},
        )

        chunks = recall.get("chunks", [])
        ctx, _ = hydradb.build_context_string(chunks, min_score=0.3)

        prompt = f"""You are analyzing a codebase for orphaned or at-risk files.

CODEBASE CONTEXT (files with low activity signals):
{ctx or "(no candidates found)"}

GRAPH RELATIONSHIPS:
{json.dumps(hydradb.extract_graph_paths(recall.get("graph_context", {}))[:3], indent=2)}

Analyze and identify orphaned/at-risk files. Return JSON:
{{
  "orphaned_files": [
    {{
      "path": "<file path>",
      "last_author": "<author name or unknown>",
      "author_status": "<active|inactive|unknown>",
      "origin_context": "<brief origin story if determinable>",
      "verdict": "<ORPHANED|ACTIVE_BUT_UNMAINTAINED|ONE_TIME_USE|LEGACY_CRITICAL>",
      "risk_level": "<low|medium|high>",
      "still_imported_by": ["<other file paths that import this>"],
      "bus_factor_score": <0.0-1.0, where 1.0 = only one person knows this>
    }}
  ]
}}

Focus on files with no recent PR activity, inactive last authors, or one-time-use patterns. Maximum 10 files."""

        try:
            completion = await openai_client.chat.completions.create(
                model=_choose_model(prompt),  # Mini model fine for classification
                messages=[
                    {"role": "system", "content": "You are a codebase archaeologist identifying technical debt and orphaned code."},
                    {"role": "user", "content": prompt},
                ],
                temperature=0.1,
                max_tokens=2000,
                response_format={"type": "json_object"},
            )
            result = json.loads(completion.choices[0].message.content or "{}")
        except Exception as e:
            logger.error("recovery_llm_error", error=str(e))
            result = {"orphaned_files": []}

        orphans: list[OrphanedFile] = []
        for f in result.get("orphaned_files", []):
            orphans.append(OrphanedFile(
                path=f.get("path", "unknown"),
                last_modified="",
                last_author=f.get("last_author", "unknown"),
                author_status=f.get("author_status", "unknown"),
                origin_context=f.get("origin_context", ""),
                verdict=f.get("verdict", ""),
                risk_level=f.get("risk_level", "low"),
                still_imported_by=f.get("still_imported_by", []),
                bus_factor_score=f.get("bus_factor_score", 0.5),
            ))

        return orphans, total_scanned

    # ─── Unwritten Rules ──────────────────────────────────────────────────────

    async def extract_unwritten_rules(
        self, tenant_id: str
    ) -> tuple[list[UnwrittenRule], int]:
        """
        Extract undocumented conventions from PR review patterns.
        Returns (rules, total_reviews_analyzed) — count from actual HydraDB chunks.
        """
        logger.info("unwritten_rules", tenant_id=tenant_id)

        review_recall = await hydradb.full_recall(
            tenant_id=tenant_id,
            query="code review comments: should use, must use, always, never, convention, pattern, standard, prefer, please change, needs to be, wrong way",
            max_results=25,
            mode="thinking",
            graph_context=False,
            metadata_filters={"source_type": "pr"},
        )

        bool_recall = await hydradb.boolean_recall(
            tenant_id=tenant_id,
            query="please use OR should be OR must be OR always use OR never use OR convention OR style guide",
            max_results=20,
        )

        all_chunks = review_recall.get("chunks", []) + bool_recall.get("chunks", [])
        # Actual count from recall — replaces estimation formula
        total_reviews_analyzed = len(all_chunks)

        ctx, sources = hydradb.build_context_string(all_chunks, min_score=0.2)

        prompt = f"""You are analyzing PR review comments to extract unwritten coding conventions.

REVIEW COMMENT CONTEXT:
{ctx or "(no review comments found — ensure PRs were ingested)"}

Identify patterns repeatedly enforced in code reviews but not in any documentation.

Return JSON:
{{
  "conventions": [
    {{
      "id": "conv-1",
      "category": "<error_handling|naming|file_structure|testing|imports|security|other>",
      "rule": "<the unwritten rule as a clear statement>",
      "enforced_by": ["@reviewer1", "@reviewer2"],
      "evidence_prs": ["PR #123", "PR #456"],
      "evidence_count": <number>,
      "violation_count": <estimated violations found>,
      "violations": [
        {{"file": "<file path>", "description": "<what the violation is>"}}
      ],
      "confidence": <0.0-1.0>
    }}
  ]
}}

Extract 3-8 conventions. Focus on patterns with 3+ occurrences."""

        try:
            completion = await openai_client.chat.completions.create(
                model=_choose_model(prompt),  # Mini model for pattern extraction
                messages=[
                    {"role": "system", "content": "You are analyzing code review history to extract undocumented engineering conventions."},
                    {"role": "user", "content": prompt},
                ],
                temperature=0.2,
                max_tokens=2500,
                response_format={"type": "json_object"},
            )
            result = json.loads(completion.choices[0].message.content or "{}")
        except Exception as e:
            logger.error("unwritten_rules_llm_error", error=str(e))
            result = {"conventions": []}

        rules: list[UnwrittenRule] = []
        for i, c in enumerate(result.get("conventions", [])):
            rules.append(UnwrittenRule(
                id=c.get("id", f"conv-{i+1}"),
                category=c.get("category", "other"),
                rule=c.get("rule", ""),
                enforced_by=c.get("enforced_by", []),
                evidence_prs=c.get("evidence_prs", []),
                evidence_count=c.get("evidence_count", 0),
                violation_count=c.get("violation_count", 0),
                violations=[
                    ConventionViolation(**v) for v in c.get("violations", [])
                ],
                confidence=c.get("confidence", 0.5),
            ))

        return rules, total_reviews_analyzed

    # ─── Live Q&A ─────────────────────────────────────────────────────────────

    async def answer_query(
        self,
        tenant_id: str,
        query: str,
        mode: str = "thinking",
        max_results: int = 12,
        source_filter: Optional[str] = None,
        owner_repo: Optional[str] = None,
    ) -> SearchResponse:
        """
        Answer any question about the codebase with cited answers.
        Short queries (≤80 words of context) route to GPT-4o-mini for cost savings.
        """
        logger.info("live_query", tenant_id=tenant_id, query=query[:60])

        metadata_filters: Optional[dict] = None
        if source_filter:
            metadata_filters = {"source_type": source_filter}

        # Run semantic + boolean in parallel
        semantic_task = hydradb.full_recall(
            tenant_id=tenant_id,
            query=query,
            max_results=max_results,
            mode=mode,
            graph_context=True,
            alpha=0.7,
            recency_bias=0.1,
            metadata_filters=metadata_filters,
        )
        boolean_task = hydradb.boolean_recall(
            tenant_id=tenant_id,
            query=query,
            max_results=10,
        )

        semantic_result, bool_result = await asyncio.gather(
            semantic_task, boolean_task, return_exceptions=True
        )

        sem_chunks = []
        bool_chunks = []
        graph_ctx = {}
        if isinstance(semantic_result, dict):
            sem_chunks = semantic_result.get("chunks", [])
            graph_ctx = semantic_result.get("graph_context", {})
        if isinstance(bool_result, dict):
            bool_chunks = bool_result.get("chunks", [])

        all_chunks = sem_chunks + bool_chunks
        ctx, sources = hydradb.build_context_string(all_chunks, min_score=0.3, max_chunks=15)
        graph_paths = hydradb.extract_graph_paths(graph_ctx)

        prompt = f"""You are an expert codebase analyst answering questions about a software project.

QUESTION: {query}

CODEBASE CONTEXT (from code, commits, PRs, issues, review comments):
{ctx or "(no matching context found — repository may need ingestion)"}

GRAPH RELATIONSHIPS DISCOVERED:
{json.dumps(graph_paths[:3], indent=2) if graph_paths else "(none)"}

Answer the question using ONLY the provided context.
- Be specific and cite sources like [PR #123], [Issue #456], [commit abc123]
- If context is insufficient, say so clearly
- Structure your answer for a senior engineer"""

        # Route: short context → mini model; deep reasoning → full GPT-4o
        model = _choose_model(ctx or query)
        logger.debug("query_model_selected", model=model, ctx_words=len((ctx or "").split()))

        try:
            completion = await openai_client.chat.completions.create(
                model=model,
                messages=[
                    {"role": "system", "content": "You are a codebase expert. Answer questions using only the provided context. Always cite specific PRs, commits, and issues."},
                    {"role": "user", "content": prompt},
                ],
                temperature=0.3,
                max_tokens=2000,
            )
            answer = completion.choices[0].message.content or "Unable to generate answer."
        except Exception as e:
            logger.error("query_llm_error", error=str(e))
            answer = "Failed to generate answer. Please check your OpenAI API key configuration."

        gh_base = f"https://github.com/{owner_repo}" if owner_repo else None

        def _build_url(s: dict) -> Optional[str]:
            if s.get("url"):
                return s["url"]
            if not gh_base:
                return None
            title = s.get("title", "")
            import re as _re
            pr_m = _re.search(r"PR\s*#(\d+)", title, _re.IGNORECASE)
            issue_m = _re.search(r"Issue\s*#(\d+)", title, _re.IGNORECASE)
            if pr_m:
                return f"{gh_base}/pull/{pr_m.group(1)}"
            if issue_m:
                return f"{gh_base}/issues/{issue_m.group(1)}"
            st = s.get("source_type", "")
            if st == "pr":
                return f"{gh_base}/pulls"
            if st == "issue":
                return f"{gh_base}/issues"
            if st == "commit":
                return f"{gh_base}/commits"
            return gh_base

        citations = [
            Citation(
                title=s["title"],
                source_type=s["source_type"],
                url=_build_url(s),
                relevancy_score=s["relevancy_score"],
                excerpt=s["excerpt"],
            )
            for s in sources[:8]
        ]

        return SearchResponse(
            query=query,
            answer=answer,
            citations=citations,
            graph_paths=[
                GraphPath(
                    entities=p.get("entities", []),
                    relations=p.get("relations", []),
                    confidence=p.get("relevancy_score", 0.5),
                )
                for p in graph_paths[:5]
            ],
            mode_used=mode,
        )

    # ─── Graph Data ────────────────────────────────────────────────────────────

    async def get_graph_data(self, tenant_id: str) -> dict:
        """
        Build graph visualization data from HydraDB recall.
        Cached in Redis for 1 hour — graph building is expensive (8 parallel recalls).
        """
        cache_key = graph_cache_key(tenant_id)
        cached = await cache_get(cache_key)
        if cached:
            logger.debug("graph_cache_hit", tenant_id=tenant_id)
            return cached

        TYPE_MAPPING = {
            "repository": "project", "repo": "project", "project": "project",
            "directory": "module", "folder": "module", "module": "module", "package": "module",
            "file": "code", "code": "code", "source_code": "code", "script": "code",
            "developer": "person", "author": "person", "user": "person",
            "contributor": "person", "person": "person",
            "pull_request": "pr", "pr": "pr", "merge_request": "pr",
            "issue": "issue", "bug": "issue", "ticket": "issue",
            "commit": "commit", "revision": "commit", "doc": "code",
        }

        def _infer_type_from_id(source_id: str) -> str:
            sid = source_id.lower()
            if sid.startswith("pr-"):
                return "pr"
            if sid.startswith("issue-"):
                return "issue"
            if sid.startswith("commit-"):
                return "commit"
            if "/" in sid and "." in sid.split("/")[-1]:
                return "code"
            return "code"

        def _human_label(source_id: str, title: str) -> str:
            if title and title.lower() != source_id.lower():
                t = title
                if t.lower().startswith("pr #") or t.lower().startswith("pr-"):
                    num = t.split("#")[-1].strip() if "#" in t else t.split("-")[-1].strip()
                    return f"PR #{num}"
                if t.lower().startswith("issue #") or t.lower().startswith("issue-"):
                    num = t.split("#")[-1].strip() if "#" in t else t.split("-")[-1].strip()
                    return f"Issue #{num}"
                if t.lower().startswith("commit "):
                    return t.capitalize()
                return title
            sid = source_id
            if sid.lower().startswith("pr-"):
                return f"PR #{sid[3:]}"
            if sid.lower().startswith("issue-"):
                return f"Issue #{sid[6:]}"
            if sid.lower().startswith("commit-"):
                return f"Commit {sid[7:15]}"
            if "/" in sid:
                return sid.split("/")[-1]
            return sid

        recalls = await asyncio.gather(
            hydradb.full_recall(tenant_id, "File: Language:", max_results=30, mode="fast", graph_context=True),
            hydradb.full_recall(tenant_id, "PR #", max_results=30, mode="fast", graph_context=True),
            hydradb.full_recall(tenant_id, "Issue #", max_results=25, mode="fast", graph_context=True),
            hydradb.full_recall(tenant_id, "Commit:", max_results=20, mode="fast", graph_context=True),
            hydradb.full_recall(tenant_id, "function module export", max_results=20, mode="fast", graph_context=True),
            hydradb.full_recall(tenant_id, "Author: merged", max_results=20, mode="fast", graph_context=True),
            hydradb.full_recall(tenant_id, "fix bug close", max_results=15, mode="fast", graph_context=True),
            hydradb.full_recall(tenant_id, "review comment changes requested", max_results=15, mode="fast", graph_context=True),
        )

        nodes: dict[str, dict] = {}
        edges: list[dict] = []

        for recall in recalls:
            gc = recall.get("graph_context", {})
            for rel_group in gc.get("chunk_relations", []):
                for triplet in rel_group.get("triplets", []):
                    src = triplet.get("source", {})
                    tgt = triplet.get("target", {})
                    rel = triplet.get("relation", {})

                    src_id = src.get("identifier") or src.get("name", "")
                    tgt_id = tgt.get("identifier") or tgt.get("name", "")

                    if src_id and src_id not in nodes:
                        raw_type = src.get("type", "").lower()
                        nodes[src_id] = {
                            "id": src_id,
                            "label": _human_label(src_id, src.get("name", "")),
                            "type": TYPE_MAPPING.get(raw_type, _infer_type_from_id(src_id)),
                            "metadata": {},
                        }
                    if tgt_id and tgt_id not in nodes:
                        raw_type = tgt.get("type", "").lower()
                        nodes[tgt_id] = {
                            "id": tgt_id,
                            "label": _human_label(tgt_id, tgt.get("name", "")),
                            "type": TYPE_MAPPING.get(raw_type, _infer_type_from_id(tgt_id)),
                            "metadata": {},
                        }
                    if src_id and tgt_id:
                        edges.append({
                            "source": src_id,
                            "target": tgt_id,
                            "relation": rel.get("canonical_predicate", "relates_to"),
                            "weight": rel.get("confidence", 0.8),
                        })

        for recall in recalls:
            for chunk in recall.get("chunks", []):
                chunk_id = chunk.get("source_id", "")
                if not chunk_id or chunk_id in nodes:
                    continue
                raw_title = chunk.get("source_title") or ""
                source_type = (
                    (chunk.get("metadata") or {}).get("metadata", {}).get("source_type")
                    or (chunk.get("document_metadata") or {}).get("source_type")
                    or (chunk.get("tenant_metadata") or {}).get("source_type")
                    or ""
                ).lower()
                node_type = TYPE_MAPPING.get(source_type, _infer_type_from_id(chunk_id))
                nodes[chunk_id] = {
                    "id": chunk_id,
                    "label": _human_label(chunk_id, raw_title),
                    "type": node_type,
                    "metadata": {"relevancy_score": chunk.get("relevancy_score", 0)},
                }

        result = {
            "nodes": list(nodes.values()),
            "edges": edges,
            "total_nodes": len(nodes),
            "total_edges": len(edges),
        }
        await cache_set(cache_key, result)
        return result


# Singleton
analysis_service = AnalysisService()
