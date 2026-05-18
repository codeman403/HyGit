# HyGit Architecture

## System Overview

HyGit is a "Wikipedia for GitHub" SaaS built on **HydraDB context graphs**. It ingests any GitHub repository and provides AI-driven provenance tracing, wiki generation, and codebase archaeology.

```
┌──────────────────────────────────────────────────────┐
│                     HyGit System                      │
├──────────────────────────────────────────────────────┤
│                                                        │
│   Browser (Next.js 16)                                │
│   ├── Landing Page (repo URL input)                   │
│   ├── Repo Dashboard (stats + provenance)             │
│   ├── Wiki Browser (article per module)               │
│   ├── Live Q&A (HydraDB pipeline visualizer)          │
│   ├── Reports (Recovery + Unwritten Rules)            │
│   └── Knowledge Graph (force-directed D3)             │
│                          │                             │
│                    REST API (HTTPS)                   │
│                          │                             │
│   FastAPI Backend (:8000)                             │
│   ├── /api/v1/repos         (ingestion lifecycle)     │
│   ├── /api/v1/repos/{id}/*  (analysis endpoints)     │
│   ├── Rate limiting (slowapi, 5-20 req/min)           │
│   ├── GZip + CORS middleware                          │
│   └── structlog observability                         │
│                          │                             │
│   ┌──────────────────────┼──────────────────────┐    │
│   │                      │                      │    │
│  HydraDB              OpenAI               GitHub    │
│  (per-repo tenant)    (GPT-4o)             (REST API) │
│                                                        │
└──────────────────────────────────────────────────────┘
```

---

## HydraDB Integration

### Multi-Tenancy

Each repository gets an isolated HydraDB tenant:

```
tenant_id = "hygit-{owner}-{repo}"
# e.g. "hygit-pallets-flask"
```

All ingestion and recall calls are scoped to this tenant, ensuring complete data isolation between repos.

### Entity Schema

| Entity | HydraDB `source_id` | Key Metadata |
|--------|---------------------|--------------|
| Code file | `{owner}/{repo}/{path}` | `source_type: "code"`, `language` |
| Commit | `commit-{sha8}` | `source_type: "commit"`, `author`, `date` |
| Issue | `issue-{number}` | `source_type: "issue"`, `state`, `labels` |
| Pull Request | `pr-{number}` | `source_type: "pr"`, `hydradb_source_ids: [changed file IDs]` |
| PR Comment | included in PR doc | `source_type: "pr_comment"` |

The `hydradb_source_ids` on PRs link them to the code files they modified, enabling HydraDB's graph context to traverse: `code file → PR → issue`.

### Recall Strategy Matrix

| Feature | Method | Mode | graph_context | Special |
|---------|--------|------|---------------|---------|
| Provenance | `full_recall` + `boolean_recall` | thinking | ✅ True | `recency_bias=0.1` |
| Wiki Generation | `full_recall` | thinking | ✅ True | `recency_bias=0.05` |
| Live Q&A | `full_recall` + `boolean_recall` | thinking | ✅ True | parallel gather |
| Codebase Recovery | `full_recall` | thinking | ✅ True | `recency_bias=0.0`, filter: code |
| Unwritten Rules | `full_recall` + `boolean_recall` | thinking | ❌ False | filter: pr |
| Graph Data | `full_recall` | fast | ✅ True | max_results=30 |

---

## Data Flow: Ingestion Pipeline

```
User submits github.com/owner/repo
         │
         ▼
POST /api/v1/repos  →  202 Accepted
         │
         ▼  (BackgroundTasks)
GitHubIngester
  ├── Fetch repo metadata (GitHub REST API)
  ├── Fetch code files (tree + blob, up to max_files)
  │     └── hydradb.add_documents([{source_id, content, metadata}])
  ├── Fetch commits (up to max_commits)
  │     └── hydradb.add_documents([...])
  ├── Fetch issues (up to max_issues)
  │     └── hydradb.add_documents([...])
  └── Fetch PRs + comments (up to max_prs)
        └── hydradb.add_documents([...], hydradb_source_ids=[changed file IDs])
         │
         ▼
Repo status → READY
         │
GET /api/v1/repos/{id}/status  →  polling frontend
```

## Data Flow: Provenance Query

```
User: "Why was src/auth/middleware.py built?"
         │
         ▼
POST /api/v1/repos/{id}/provenance  {file_path: "src/auth/middleware.py"}
         │
         ▼  (parallel)
┌──────────────────────┬────────────────────────┐
│ full_recall(thinking,│ boolean_recall(        │
│  graph_context=True) │  "src/auth/middleware")│
│  → code+PR+issue+    │  → exact filename in   │
│    commit hits       │    commits/reviews     │
└──────────┬───────────┴────────────┬───────────┘
           │ Merge + build context  │
           ▼
    GPT-4o synthesis
    → {"narrative": "...", "introduced_in": "PR #42", ...}
         │
         ▼
ProvenanceResponse (with graph_paths[] showing the chain)
```

---

## API Reference

All endpoints are versioned at `/api/v1/`. See live docs at `http://localhost:8000/api/docs`.

### Repos

| Method | Path | Description | Rate Limit |
|--------|------|-------------|------------|
| `POST` | `/repos` | Start ingestion (background) | 5/min |
| `GET` | `/repos` | List all ingested repos | 60/min |
| `GET` | `/repos/{id}` | Get repo details | 60/min |
| `GET` | `/repos/{id}/status` | Poll ingestion status | 60/min |

### Analysis

| Method | Path | Description | Rate Limit |
|--------|------|-------------|------------|
| `POST` | `/repos/{id}/provenance` | Trace file origin | 20/min |
| `GET` | `/repos/{id}/wiki` | List wiki articles | 20/min |
| `POST` | `/repos/{id}/wiki/generate` | Generate wiki article | 20/min |
| `POST` | `/repos/{id}/search` | Live Q&A | 20/min |
| `GET` | `/repos/{id}/reports/recovery` | Orphaned file report | 20/min |
| `GET` | `/repos/{id}/reports/conventions` | Unwritten rules | 20/min |
| `GET` | `/repos/{id}/graph-data` | Knowledge graph nodes+edges | 20/min |

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `HYDRA_DB_API_KEY` | ✅ | HydraDB API key (`hdb_...`) |
| `OPENAI_API_KEY` | ✅ | OpenAI API key for GPT-4o |
| `GITHUB_TOKEN` | ✅ | GitHub personal access token |
| `CORS_ORIGINS` | Optional | Comma-separated allowed origins (default: `http://localhost:3001`) |
| `DEBUG` | Optional | Enable debug mode + Swagger UI (default: `true`) |
| `OPENAI_MODEL` | Optional | OpenAI model to use (default: `gpt-4o`) |

---

## Local Development

```bash
# 1. Setup env
cp .env.example backend/.env
# Edit backend/.env with your keys

# 2. Run both services
./dev.sh
# Backend: http://localhost:8000
# Frontend: http://localhost:3001
# API Docs: http://localhost:8000/api/docs
```

## Production Deployment

```bash
# Docker Compose (single server)
docker compose up --build -d

# Health check
curl http://localhost:8000/health
```

For cloud deployment:
- **Backend**: Fly.io, Railway, or Render (any Docker host)
- **Frontend**: Vercel (Next.js standalone output configured)
