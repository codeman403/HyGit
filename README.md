# HyGit — Wikipedia for Any GitHub Repo

> **Turn any GitHub repository into an AI-powered knowledge base.** Understand not just *what* the code does, but *why* it exists, how it evolved, and what nobody ever wrote down.

[![CI](https://github.com/codeman403/HyGit/actions/workflows/ci.yml/badge.svg)](https://github.com/codeman403/HyGit/actions)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Live Demo](https://img.shields.io/badge/demo-live-brightgreen)](https://hy-git.vercel.app)

🌐 **Live App:** [https://hy-git.vercel.app](https://hy-git.vercel.app)  
🔧 **API:** [https://hygit.onrender.com](https://hygit.onrender.com/health)

---

## ✨ What is HyGit?

HyGit answers the most important question engineers face every day:

> *"Why is the code the way it is?"*

Point HyGit at any public GitHub repository and instantly get:
- 📚 **Auto-generated Wiki** — Wikipedia-style articles for every module, written from code + PRs + issues
- 🔍 **Provenance Engine** — Trace any file back to its origin: issue → PR → commit → discussion
- 🤖 **Ask Your Codebase** — Natural language Q&A with grounded citations and source links
- 🕸️ **Knowledge Graph** — Interactive visualization of all code entities and their relationships
- 🏚️ **Codebase Recovery Report** — Find orphaned files, bus factor risks, and mystery code
- 📜 **Unwritten Rules** — Coding conventions extracted from PR review patterns

Powered by **[HydraDB](https://hydradb.com)** context graphs for multi-hop reasoning across code, commits, PRs, and issues.

---

## 🚀 Quick Start

### Prerequisites
- Python 3.10+
- Node.js 18+
- [HydraDB API key](https://hydradb.com) (`hdb_...`)
- OpenAI API key
- GitHub token (for higher rate limits)

### Setup

```bash
# 1. Clone and configure
git clone https://github.com/codeman403/HyGit
cd HyGit
cp .env.example backend/.env
# → Edit backend/.env with your API keys

# 2. Install backend
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -e .

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

## 📁 Project Structure

```
HyGit/
├── frontend/                  # Next.js 16 (App Router)
│   └── app/
│       ├── page.tsx           # Landing page
│       ├── repos/
│       │   ├── page.tsx       # Repository dashboard
│       │   └── [repoId]/
│       │       ├── page.tsx   # Overview & provenance
│       │       ├── wiki/      # Auto-generated wiki articles
│       │       ├── search/    # Live Q&A with citations
│       │       ├── reports/   # Recovery & Unwritten Rules
│       │       └── graph/     # Knowledge graph visualization
│       └── lib/api/client.ts  # Typed API client
├── backend/                   # FastAPI + Python
│   └── src/
│       ├── main.py            # App factory
│       ├── core/              # Config, errors, cache
│       ├── models/            # Pydantic schemas
│       ├── services/          # AI analysis & HydraDB client
│       ├── ingestion/         # GitHub → HydraDB pipeline
│       └── api/v1/            # REST endpoints
├── render.yaml                # Render deployment config
└── vercel.json                # Vercel deployment config
```

---

## 🏗️ Architecture

```
GitHub Repo
     │
     ▼
┌─────────────────────────────────────────────┐
│           Ingestion Pipeline                │
│  Code Files + Commits + PRs + Issues        │
│  → Structured chunks with metadata          │
└────────────────────┬────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────┐
│              HydraDB                        │
│  Multi-tenant knowledge graph               │
│  Each repo = isolated tenant                │
│  Entities linked: code ↔ PR ↔ issue ↔ commit│
└────────────────────┬────────────────────────┘
                     │
          ┌──────────┼──────────┐
          ▼          ▼          ▼
      Wiki Gen    Live Q&A   Provenance
   full_recall  hybrid recall  graph traversal
```

### Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 16, TypeScript, Tailwind CSS |
| Backend | FastAPI, Python 3.10+ |
| Knowledge Graph | HydraDB (multi-tenant context graphs) |
| Database | Supabase (PostgreSQL) |
| Cache | Redis (Upstash) |
| AI | OpenAI GPT-4o |
| Hosting | Vercel (Frontend) + Render (Backend) |

---

## 🧠 How HydraDB Powers HyGit

### Multi-Tenancy
Each repo gets its own HydraDB **tenant** (`hygit-{owner}-{repo}`) — complete isolation.

### Recall Strategy

| Feature | Recall Mode | Graph Context | Why |
|---------|-------------|--------------|-----|
| Provenance | `full_recall(thinking)` | ✅ | Multi-hop: code → PR → issue → discussion |
| Wiki Generation | `full_recall(thinking)` | ✅ | Surface all related entities |
| Live Q&A | `full_recall` + `boolean_recall` | ✅ | Semantic + exact match |
| Codebase Recovery | `full_recall(fast)` | ✅ | Surface orphaned files |
| Unwritten Rules | `full_recall` + `boolean_recall` | ❌ | Keyword enforcement patterns |

### Why HydraDB > Plain Vector Search
```
Vector search:  "Find code similar to auth middleware"
HydraDB:        "Why does auth middleware skip token validation for internal IPs?"

The answer travels:
  auth/middleware.py
    → PR #142 (introduced internal IP exception)
      → [review] "per RFC-007 decision"
        → RFC-007 (approved by security team, 2024-02-14)
```

---

## ✨ Features

### 🔍 Provenance Engine
Trace any file to its origin — issue → PR → commit → discussion. Understand the full decision history behind every line.

### 📚 Wiki Browser
Auto-generated Wikipedia-style articles for every module. Combines code + PRs + issues + commits with real citations and cross-linked related modules.

### 🤖 Ask Your Codebase
Natural language Q&A with hybrid recall (semantic + graph + keyword). Answers come with source citations, relevancy scores, and a graph path visualization.

### 🕸️ Knowledge Graph
Interactive force-directed graph of all entities — color-coded by type (code, PR, issue, person, module).

### 🏚️ Codebase Recovery Report
Finds orphaned files with no active maintainer, reconstructs origin stories, and provides bus factor scoring.

### 📜 Unwritten Rules
Extracts coding conventions from PR review patterns — with evidence linking to the actual PRs that enforced each rule.

---

## 🔌 API Endpoints

```
POST /api/v1/repos                           # Start ingestion
GET  /api/v1/repos                           # List repositories
GET  /api/v1/repos/{id}/status               # Ingestion status

POST /api/v1/repos/{id}/provenance           # Trace file provenance
GET  /api/v1/repos/{id}/wiki                 # List wiki articles
POST /api/v1/repos/{id}/wiki/generate        # Generate wiki article
POST /api/v1/repos/{id}/search               # Live Q&A
GET  /api/v1/repos/{id}/reports/recovery     # Orphaned files report
GET  /api/v1/repos/{id}/reports/conventions  # Unwritten rules
GET  /api/v1/repos/{id}/graph-data           # Knowledge graph data
```

---

## 🔑 Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `HYDRA_DB_API_KEY` | [HydraDB Console](https://hydradb.com) | ✅ |
| `OPENAI_API_KEY` | [OpenAI Platform](https://platform.openai.com) | ✅ |
| `GITHUB_TOKEN` | GitHub → Settings → Developer settings → PAT | ✅ |
| `DATABASE_URL` | Supabase → Project Settings → Database → URI | ✅ |
| `REDIS_URL` | Upstash → Console → Database → REST URL | ✅ |
| `CORS_ORIGINS` | Comma-separated allowed origins | ✅ |

---

## 🧪 Testing

```bash
# Backend tests
cd backend && pytest

# Frontend lint
cd frontend && npm run lint
```

---

## 📦 Deployment

### Render (Backend) + Vercel (Frontend)

**Backend → Render:**
- Connect GitHub repo, set Root Directory to `backend`
- Build: `pip install uv && uv pip install --system -e .`
- Start: `python -m uvicorn src.main:app --host 0.0.0.0 --port $PORT`
- Or use the included `render.yaml` for one-click blueprint deploy
- Set `CORS_ORIGINS` to your Vercel URL

**Frontend → Vercel:**
- Connect GitHub repo, set Root Directory to `frontend`
- Add env var: `NEXT_PUBLIC_API_URL=https://your-render-url.onrender.com`
- Vercel auto-detects Next.js and deploys automatically

### Docker (Self-hosted)

```bash
cp .env.example backend/.env
docker compose up --build
```

---

## 📖 Documentation

- [System Design](docs/system_design.md)
- [API Documentation](docs/API_DOCS.md)
- [Deployment Guide](docs/deployment.md)

---

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feat/amazing-feature`)
3. Commit changes (`git commit -m 'feat: add amazing feature'`)
4. Push to branch (`git push origin feat/amazing-feature`)
5. Open a Pull Request

---

## 🏆 Built for WikiThon

HyGit was built for the **WikiThon hackathon** — *"Build anything that generates a Wikipedia-like knowledge base from any source."*

---

## 📄 License

MIT
