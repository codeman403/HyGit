# HyGit — Wikipedia for Any GitHub Repo

> Every line has a story. HyGit finds it.

**Powered by HydraDB context graphs.** Point HyGit at any GitHub repo and get a complete, interconnected Wikipedia — not just what the code does, but **why it exists**, how it evolved, and what nobody wrote down.

---

## 🚀 Quick Start

### Prerequisites
- Python 3.10+
- Node.js 18+
- [HydraDB API key](https://hydradb.com) (`hdb_...`)
- OpenAI API key
- GitHub token (for private repos or higher rate limits)

### Setup

```bash
# 1. Clone and setup env
git clone https://github.com/codeman403/HyGit
cd HyGit
cp .env.example backend/.env
# → Edit backend/.env with your API keys

# 2. Install backend
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install fastapi "uvicorn[standard]" pydantic pydantic-settings httpx python-dotenv openai structlog PyGithub python-multipart

# 3. Install frontend
cd ../frontend
npm install

# 4. Start both servers
cd ..
./dev.sh
```

Open: [http://localhost:3000](http://localhost:3000)  
API Docs: [http://localhost:8000/api/docs](http://localhost:8000/api/docs)

---

## 🏗️ Architecture

```
HyGit/
├── backend/               # FastAPI + Python
│   └── src/
│       ├── main.py               # App factory
│       ├── core/
│       │   ├── config.py         # Settings via pydantic-settings
│       │   └── errors.py         # Custom exception hierarchy
│       ├── models/
│       │   └── schemas.py        # Pydantic request/response models
│       ├── services/
│       │   ├── hydradb_client.py # HydraDB API client (all recall modes)
│       │   └── analysis_service.py # All AI analysis (provenance, wiki, etc.)
│       ├── ingestion/
│       │   └── github_ingester.py # GitHub → HydraDB pipeline
│       └── api/v1/
│           ├── repos.py          # Repo lifecycle (ingest, status)
│           └── analysis.py       # Provenance, wiki, reports, search
│
└── frontend/              # Next.js 16 (App Router)
    └── app/
        ├── page.tsx               # Landing page with hero + repo input
        ├── repos/
        │   ├── page.tsx           # Repos list
        │   └── [repoId]/
        │       ├── layout.tsx     # Sub-nav + status banner
        │       ├── page.tsx       # Overview + provenance engine
        │       ├── wiki/          # Auto-generated wiki articles
        │       ├── search/        # Live Q&A with citations
        │       ├── reports/       # Recovery + Unwritten Rules
        │       └── graph/         # Knowledge graph visualization
        └── lib/api/client.ts      # Typed API client
```

---

## 🧠 HydraDB Strategy

This is the core of HyGit — everything is designed around HydraDB's unique capabilities:

### Multi-Tenancy
Each repo gets its own HydraDB **tenant** (`hygit-{owner}-{repo}`). Complete isolation.

### Ingestion Schema
| Source | HydraDB ID | Metadata | Relations |
|--------|-----------|----------|-----------|
| Code file | `{owner}/{repo}/{path}` | `source_type: "code"` | — |
| Commit | `commit-{sha8}` | `source_type: "commit"` | — |
| Issue | `issue-{num}` | `source_type: "issue"` | — |
| PR | `pr-{num}` | `source_type: "pr"` | `hydradb_source_ids: [changed file IDs]` |

### Recall Strategy

| Feature | Recall Mode | Graph Context | Why |
|---------|-------------|--------------|-----|
| Provenance | `full_recall(thinking)` | ✅ True | Multi-hop: code → PR → issue → discussion |
| Wiki Generation | `full_recall(thinking)` | ✅ True | Surface all related entities |
| Live Q&A | `full_recall(thinking)` + `boolean_recall` | ✅ True | Semantic + exact match |
| Codebase Recovery | `full_recall(fast)` | ✅ True | recency_bias=0 to surface old code |
| Unwritten Rules | `full_recall` + `boolean_recall` | ❌ | Keyword enforcement patterns in reviews |

### Why HydraDB > Plain Vector Search
```
Vector search can answer: "Find code similar to auth middleware"
HydraDB can answer:        "Why does auth middleware skip token validation for internal IPs?"

The answer travels:
  auth/middleware.py
    → PR #142 (introduced internal IP exception)
      → [review] "per RFC-007 decision"
        → RFC-007 (approved by security team, 2024-02-14)
          → [Slack thread] "VPC controls are sufficient"
```

---

## ✨ Features

### 1. 🔍 Provenance Engine
*"Why was this file built?"*
- Trace any file to its origin: issue → PR → commit → discussion
- HydraDB `full_recall(mode=thinking, graph_context=true)` + `boolean_recall`
- Context graph shows the multi-hop relationship chain

### 2. 📚 Wiki Browser
*Auto-generated Wikipedia articles for every module*
- Combines code + PRs + issues + commits for a module
- Citations with real PR/issue numbers
- Cross-linked related modules

### 3. 🏚️ Codebase Recovery
*"Who owns this mystery file?"*
- Finds orphaned files with no active maintainer
- Reconstructs origin stories from git history
- Bus factor scoring, risk assessment

### 4. 🗣️ Unwritten Rules
*"What does our team believe but never documented?"*
- Extracts coding conventions from PR review patterns
- Evidence: "reviewer X has enforced this in PR #45, #67, #89"
- Current violations highlighted

### 5. 🔍 Live Q&A
*"Ask anything, get grounded answers"*
- Hybrid recall: semantic + graph + exact keyword
- Citations with relevancy scores
- Graph path visualization showing how the answer was found

### 6. 🕸️ Knowledge Graph
- Interactive force-directed graph of all entities
- Entity types: code, PR, issue, person, module
- Color-coded by entity type

---

## 🔌 API Endpoints

```
POST /api/v1/repos                    # Start ingestion
GET  /api/v1/repos                    # List repos  
GET  /api/v1/repos/{id}/status        # Ingestion status

POST /api/v1/repos/{id}/provenance    # Trace file provenance
GET  /api/v1/repos/{id}/wiki          # List wiki articles
POST /api/v1/repos/{id}/wiki/generate # Generate wiki article
POST /api/v1/repos/{id}/search        # Live Q&A
GET  /api/v1/repos/{id}/reports/recovery     # Orphaned files
GET  /api/v1/repos/{id}/reports/conventions  # Unwritten rules
GET  /api/v1/repos/{id}/graph-data    # Knowledge graph data
```

---

## 🏆 Hackathon: WikiThon

Built for the WikiThon hackathon challenge:
> "Build anything that generates a Wikipedia-like knowledge base from any source"

HyGit answers the most important question engineers face every day:
**"Why is the code the way it is?"**

---

## 🚀 Deployment

### Option A — Render (Backend) + Vercel (Frontend)

**1. Deploy Backend to Render**
- Connect your GitHub repo in [Render Dashboard](https://render.com)
- Select **Web Service**, set Root Directory to `backend`
- Build command: `pip install uv && uv pip install --system -e .`
- Start command: `python -m uvicorn src.main:app --host 0.0.0.0 --port $PORT`
- Or use the included `render.yaml` for one-click blueprint deploy
- Add all env vars from `.env.example` in Render's Environment tab
- Set `CORS_ORIGINS` to your Vercel URL (e.g. `https://hygit.vercel.app`)

**2. Deploy Frontend to Vercel**
- Connect your GitHub repo in [Vercel Dashboard](https://vercel.com)
- Set Root Directory to `frontend`
- Add environment variable: `NEXT_PUBLIC_API_URL=https://your-render-backend.onrender.com`
- Deploy — Vercel auto-detects Next.js

### Option B — Docker Compose (Self-hosted)

```bash
cp .env.example backend/.env
# Edit backend/.env with your API keys, set CORS_ORIGINS to your domain
docker compose up --build
```

### Required Environment Variables

| Variable | Where to get it |
|---|---|
| `HYDRA_DB_API_KEY` | [HydraDB Console](https://hydradb.com) |
| `OPENAI_API_KEY` | [OpenAI Platform](https://platform.openai.com) |
| `GITHUB_TOKEN` | GitHub → Settings → Developer settings → PAT |
| `DATABASE_URL` | Supabase → Project Settings → Database → URI |
| `REDIS_URL` | Upstash → Console → Database → REST API |

---

## License
MIT
