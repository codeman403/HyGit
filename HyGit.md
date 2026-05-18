# HyGit
### *"Every line has a story."*
#### A Wikipedia for Any GitHub Repo — Auto-Generated from Code, Commits, Issues & PRs

> *git log tells you what. HyGit tells you why.*

---

**Project:** WikiThon Hackathon Entry (48h)  
**Powered by:** HydraDB  
**Created:** 2026-05-16  
**Status:** Ideation → Build  

---

## TL;DR

Point HyGit at any GitHub repository. In minutes, it generates a complete, interconnected Wikipedia — not just documenting WHAT the code does, but WHY it exists, HOW it evolved, and WHAT nobody wrote down. It reconstructs the story of a codebase from the artifacts developers leave behind: commits, PRs, issues, review comments, and code patterns.

---

## The Problem

Every codebase has a story. Nobody tells it.

- **README generators** → surface-level, no depth
- **AI code explainers** (Cursor, Copilot) → explain ONE file at a time, no cross-repo reasoning
- **Doc generators** (Sphinx, JSDoc) → document WHAT code does, never WHY
- **GitHub Wikis** → manual, always outdated, nobody maintains them
- **ChatGPT/Claude** → can explain code you paste, but can't trace across 2000 commits + 800 issues + PR discussions

**The gap:** No tool reconstructs the STORY of a codebase — the decisions, debates, regrets, evolution, and tribal knowledge buried in years of development history.

**The cost of this gap:**
- New engineers take 3-6 months to understand WHY things are the way they are
- Tribal knowledge disappears when people leave
- Teams re-make decisions that were already debated and resolved
- Technical debt accumulates because nobody remembers the original constraint

---

## The Solution

**HyGit** ingests an entire GitHub repo — code, commits, issues, PRs, discussions, review comments — into HydraDB. It builds a knowledge graph connecting code to its origins, and generates a living Wikipedia that answers the questions developers ACTUALLY ask:

- "Why was this file built?"
- "Who understands this module?"
- "What are the unwritten rules of this project?"
- "What decisions does the team regret?"
- "How did the architecture get this way?"

---

## Core Features (The Winning Combination)

### 1. 🔍 "Why Was This Built?" — Provenance Engine

**What it does:** Click any function, file, or module → see the full story: what issue spawned it, what PR introduced it, what the discussion said, what it replaced, and what constraints drove the decision.

**Example output:**
```
📂 src/utils/retryQueue.ts (150 lines, no comments)

PROVENANCE:
├── Introduced in: PR #234 (2021-03-15) by @alice
├── Fixes: Issue #189 — "Payment webhooks dropped under high load"
├── PR Discussion: Alice noted "This is a temporary hack until we migrate to Redis"
├── Related: Issue #312 — Redis migration (completed 2022-08)
├── Status: The migration happened but this file was never removed
└── Verdict: ORPHANED — original purpose served, can likely be deprecated

CONTEXT GRAPH:
issue_#189 (webhook drops) → PR_#234 (retryQueue) → was_meant_to_be_replaced_by → issue_#312 (Redis migration) → completed → but retryQueue still exists
```

**Why it matters:** "Why was this built?" is the #1 question new engineers ask. This automates the answer with full citations.

---

### 2. 🏚️ "Codebase Recovery" — Mystery Solver

**What it does:** Automatically identifies code that nobody on the current team wrote or understands — files where the last contributor no longer contributes, no recent issues reference it, and no comments explain it. Then reconstructs its origin story.

**Example output:**
```
⚠️ Codebase Recovery REPORT

5 orphaned files identified:

1. src/legacy/batchProcessor.js
   - Last modified: 2021-06-14 by @charlie (inactive since 2022-01)
   - References: 0 recent issues, 0 recent PRs
   - Origin: PR #156 — "Bulk import for enterprise migration"
   - Context: Built for one-time customer migration (Acme Corp, June 2021)
   - Verdict: ONE-TIME USE CODE — likely safe to remove
   - Risk: Still imported by src/jobs/nightly.js (line 34)

2. src/middleware/rateLimiter.ts
   - Last modified: 2022-03-22 by @dana (left company 2023-02)
   - References: 1 issue (#445 — "rate limiting too aggressive", unresolved)
   - Origin: PR #289 — "Add rate limiting before launch"
   - Context: Custom implementation because express-rate-limit didn't support Redis cluster
   - Verdict: ACTIVE BUT UNMAINTAINED — constraint may no longer exist (check express-rate-limit v4)
```

**Why it matters:** Every mature codebase has dark corners. This shines a light with full context, so teams can make informed decisions about what to keep, refactor, or delete.

---

### 3. 🗣️ "Unwritten Rules" — Convention Extractor

**What it does:** Analyzes patterns across the codebase + PR review comments to extract conventions that exist ONLY in maintainers' heads. These are the rules enforced through code review but never written down.

**Example output:**
```
📋 UNWRITTEN RULES (extracted from 312 PR reviews)

1. ERROR HANDLING
   Rule: "Always use custom AppError class, never throw raw Error"
   Enforced by: @maintainer_1 (15 reviews), @maintainer_2 (8 reviews)
   Evidence: PR #12, #45, #78, #134, #201 (all requested this change)
   Violations found: 2 (src/api/legacy.js:45, src/workers/email.js:12)

2. FILE STRUCTURE
   Rule: "Routes go in /routes/{version}/{resource}.ts"
   Enforced by: @maintainer_1 (12 reviews)
   Evidence: PR #23 was reverted because routes were in /api/ instead
   Violations found: 0

3. TESTING
   Rule: "Integration tests required for any code touching the database"
   Enforced by: @maintainer_2 (10 reviews), @maintainer_3 (6 reviews)
   Evidence: PR #56, #89, #112 — review comments: "needs integration test"
   Violations found: 3 (recent PRs merged without DB tests)

4. NAMING
   Rule: "Service files use PascalCase, utility files use camelCase"
   Enforced by: Pattern analysis (98% compliance across 234 files)
   Evidence: 2 violations were renamed in follow-up PRs
   Violations found: 1 (src/services/emailHelper.ts — should be EmailHelper.ts)
```

**Why it matters:** A new contributor's first day goes from confusing to clear. No more "your PR was rejected but nobody told you the rule." The conventions are now documented with citations proving they're real.

---

## How It Works (Technical Architecture)

```
┌─────────────────────────────────────────────────────────────┐
│                    GitHub API / Clone                         │
│  Fetch: source code, commits, git blame, issues, PRs,        │
│         discussions, review comments, changelogs              │
└──────────────────────────┬──────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────┐
│                 Ingestion Pipeline                            │
│                                                              │
│  Source Code → HydraDB Knowledge                             │
│    metadata: file_path, language, size, last_modified         │
│                                                              │
│  Commits → HydraDB Knowledge                                 │
│    metadata: author, date, files_changed, message_type        │
│                                                              │
│  Issues → HydraDB Knowledge                                  │
│    metadata: labels, state, author, created_date, closed_date │
│                                                              │
│  PRs → HydraDB Knowledge                                     │
│    metadata: author, reviewer, merged, files_changed, labels  │
│                                                              │
│  Review Comments → HydraDB Knowledge                         │
│    metadata: reviewer, sentiment, pr_id, file_path            │
└──────────────────────────┬──────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────┐
│                      HydraDB                                  │
│                                                              │
│  CONTEXT GRAPH (auto-extracted relationships):               │
│  ┌─────────────────────────────────────────────────────┐     │
│  │ file → introduced_by → PR → fixes → issue           │     │
│  │ function → calls → function → in_module → directory  │     │
│  │ contributor → authored → PR → reviewed_by → reviewer │     │
│  │ convention → enforced_in → [review_1, review_2, ...] │     │
│  │ decision → motivated_by → constraint → still_exists? │     │
│  │ module → depends_on → module → maintained_by → person│     │
│  └─────────────────────────────────────────────────────┘     │
│                                                              │
│  METADATA SCHEMA:                                            │
│  source_type: code | commit | issue | pr | comment           │
│  author, date, file_path, language, labels                   │
│  has_todo, is_hack, bus_factor_score, is_orphaned            │
│                                                              │
│  RECALL STRATEGIES:                                          │
│  • full_recall (mode=thinking, graph_context=true)           │
│    → "Why does this file exist?" — traces multi-hop          │
│  • boolean_recall                                            │
│    → Find exact error messages, function names, TODO text    │
│  • recall with recency_bias                                  │
│    → "What changed recently?" for active development         │
│  • recall with metadata_filters                              │
│    → Scope by author, date range, source type, module        │
└──────────────────────────┬──────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────┐
│                Wiki Generation Engine                         │
│                                                              │
│  1. Entity Identification                                    │
│     → Top modules/directories by connection count in graph   │
│     → Key decisions (PRs with most discussion)               │
│     → Key contributors (by graph centrality)                 │
│                                                              │
│  2. Article Generation                                       │
│     → For each entity: full_recall → synthesize narrative    │
│     → Cross-reference via graph edges                        │
│     → Cite specific commits, PRs, issues, comments           │
│                                                              │
│  3. Special Reports                                          │
│     → Codebase Recovery (orphaned files analysis)        │
│     → Unwritten Rules (PR review pattern extraction)         │
│     → Bus Factor Map (knowledge concentration analysis)      │
│     → Regret Log (TODO/HACK/tech-debt signal aggregation)    │
└──────────────────────────┬──────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────┐
│                       Web UI                                  │
│                                                              │
│  • Wiki Browser — articles with cross-references + citations │
│  • Graph View — visual knowledge map of the codebase         │
│  • Search — "ask anything" with grounded answers             │
│  • Reports — Dead Code / Bus Factor / Unwritten Rules        │
│  • Provenance Panel — click any code → see full story        │
└─────────────────────────────────────────────────────────────┘
```

---

## HydraDB Fit (Why This Needs a Context Graph)

| Capability | How HyGit Uses It |
|------------|---------------------------|
| **Context Graph** | The entire product IS the graph: code → PR → issue → discussion → person → module. Without relational traversal, you can't trace provenance. |
| **full_recall (thinking)** | Multi-hop provenance: "Why does this file exist?" requires traversing code → commit → PR → issue → original discussion |
| **graph_context: true** | Every answer shows HOW the system connected the dots — the proof chain |
| **Boolean Recall** | Find exact: error messages in issues, function names in commits, TODO text in code, specific review comments |
| **Metadata filters** | Scope by: `source_type=pr_comment`, `author=@maintainer`, `date>2023-01-01`, `file_path=src/auth/*` |
| **recency_bias** | "What changed this week?" vs "What's the full history?" — different temporal views |
| **Memories (per-contributor)** | Track what each person has authored, reviewed, discussed — builds expertise profile |
| **Multi-tenancy** | Each repo = a tenant. Private repos stay isolated. |

**Why vector search alone FAILS here:**
- "Why was retryQueue.ts built?" → requires traversing: file → commit → PR → issue → discussion. These are RELATIONAL hops, not similarity matches.
- "What are the unwritten rules?" → requires aggregating patterns across 200 review comments that are semantically different but enforce the same convention.
- "What depends on the auth module?" → graph traversal, not embedding similarity.

---

## Data Sources & Ingestion

**Everything comes from GitHub (free, public, unlimited):**

| Source | What we extract | Volume (typical medium repo) |
|--------|----------------|------------------------------|
| Source code files | Content, file paths, language, imports | 100-500 files |
| Git commits | Messages, authors, dates, files changed | 1,000-5,000 commits |
| Issues | Title, body, labels, comments, state | 200-1,000 issues |
| Pull Requests | Title, body, reviewers, files, discussion | 300-1,500 PRs |
| PR Review Comments | Inline code comments, approval/rejection reasons | 500-3,000 comments |
| Git blame | Per-line attribution (author + date) | Derived from git |
| GitHub Discussions | Architecture decisions, RFCs, Q&A | 50-200 threads |

**Ingestion strategy for 48h hackathon:**
- Use GitHub REST/GraphQL API to fetch issues, PRs, comments
- Clone repo for code files + git log + git blame
- Process in batches → upload to HydraDB with metadata
- Let HydraDB's auto-extraction build the context graph

---

## Target Repos for Demo

| Repo | Why it's good for demo |
|------|----------------------|
| `fastify/fastify` | Rich PR discussions, clear architectural decisions, active community |
| `pallets/flask` | Python, clean history, many contributors over 10+ years, visible evolution |
| `withastro/astro` | Modern, TypeScript, excellent issue discussions, recent enough to be relatable |
| `pocketbase/pocketbase` | Go, mostly single dev → dramatic bus factor story |
| `tldraw/tldraw` | TypeScript, well-organized PRs, visible architectural decisions |
| `hono/hono` | Fast-growing, many contributors, conventions emerging in real-time |

**Recommendation:** Use `fastify/fastify` or `pallets/flask` — both have rich enough history to show all 3 features convincingly.

---

## Demo Script (5 Minutes)

### [0:00 - 0:30] Hook
> "git log tells you what. HyGit tells you why."
> 
> "Every line of code has a story — who wrote it, why, what it replaced, and what debate led to it. We pointed HyGit at [repo] — 3 years of code, 2,000 commits, 800 issues — and it told us every story in 5 minutes."

### [0:30 - 1:30] Tour the Auto-Generated Wiki
- Browse 3-4 generated articles about major modules
- Show cross-references: "The Router article links to the Plugin article because they share a dependency — discovered automatically from the context graph"
- Show citations: every claim links back to a specific commit/PR/issue

### [1:30 - 2:30] Feature 1: "Why Was This Built?" (Provenance)
- Click a mysterious-looking utility file with no comments
- System shows: "Introduced in PR #234 → which fixed issue #189 → where user @jane reported a race condition → PR discussion reveals it was meant to be temporary → it's been here 2 years"
- Show the graph traversal path visually

### [2:30 - 3:30] Feature 2: "Unwritten Rules" (Conventions)
- Show the extracted conventions page
- "Nobody documented these rules, but from analyzing 200+ PR reviews, we found 8 patterns that are ALWAYS enforced"
- Click one → see the exact review comments where the rule was enforced
- Show current violations: "These 3 files break the convention right now"

### [3:30 - 4:30] Feature 3: "Codebase Recovery"
- Show the orphaned code report
- "These 5 files have no active maintainer. The original authors all left."
- Click one → full origin story reconstructed from git history
- Show the verdict: "Built for a one-time migration in 2021. Still imported. Likely safe to remove."

### [4:30 - 5:00] Live Query (Grand Finale)
- Type: "What's the biggest architectural regret in this codebase?"
- System finds: HACK/TODO comments + related issues + original deadline pressure
- Returns: "The custom ORM was introduced under Q1 2022 deadline pressure. 3 issues reference it as tech debt. The original constraint (no budget for Prisma) no longer applies."

---

## 48-Hour Build Plan

| Phase | Hours | Task | Output |
|-------|-------|------|--------|
| **Setup** | 0-2 | Pick repo. Clone. Fetch issues/PRs/comments via GitHub API | Raw data on disk |
| **Ingestion** | 2-8 | Build ingestion script. Parse all sources. Upload to HydraDB with metadata schema | Data in HydraDB, graph building |
| **Core Feature 1** | 8-14 | "Why Was This Built?" — given a file, trace provenance through graph | Working provenance engine |
| **Core Feature 2** | 14-20 | "Codebase Recovery" — identify orphaned files, reconstruct stories | Working archaeology report |
| **Core Feature 3** | 20-26 | "Unwritten Rules" — extract conventions from PR review patterns | Working convention extractor |
| **Wiki Gen** | 26-32 | Auto-generate wiki articles for top modules using multi-source recall | Browsable wiki |
| **UI** | 32-38 | Web interface: wiki browser + graph view + search + reports | Working frontend |
| **Polish** | 38-44 | Make demo queries work perfectly. Add visual polish. Edge cases. | Demo-ready |
| **Ship** | 44-48 | Record video. Write submission. Final testing. | Submitted! |

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Data Store & Graph** | HydraDB (context graph, recall, memories) |
| **Data Ingestion** | Python + GitHub API (PyGithub or httpx) + GitPython |
| **Backend** | Python / FastAPI |
| **Wiki Generation** | LLM (GPT-4o or Claude) with HydraDB recall results as context |
| **Frontend** | React or Next.js (simple wiki layout + graph viz) |
| **Graph Visualization** | D3.js or react-force-graph |
| **Deployment** | Vercel (frontend) + Railway/Render (backend) |

---

## Why This Wins

1. **It does something LLMs CANNOT do alone.** GPT-4 can explain one file. It cannot trace provenance across 2,000 commits + 800 issues + PR discussions. That requires a GRAPH.

2. **The data is FREE and UNLIMITED.** Any public GitHub repo. No synthetic data. No permission needed. The demo uses REAL code with REAL history.

3. **Every developer WANTS this.** "Why was this built?" is the most common question new engineers ask. Nobody has automated the answer.

4. **The features are genuinely novel:**
   - Convention extraction from PR reviews? Nobody does this.
   - Dead code provenance reconstruction? Nobody does this.
   - Auto-generated wiki with multi-source citations? Nobody does this well.

5. **HydraDB is ESSENTIAL (not bolted on):**
   - The graph connects code → PRs → issues → discussions → people NATURALLY
   - `thinking` mode traces multi-hop provenance chains
   - `graph_context` shows the full web of relationships
   - Boolean recall finds exact commit messages and review comments
   - Metadata filters scope by time, author, module, type

6. **It's immediately extensible.** After the hackathon, this could become a real product. Every engineering team with a codebase >1 year old would use this.

7. **The demo is self-evident.** You don't need to explain it. You show a repo everyone knows → wiki appears → click anything → see the story. Done.

---

## Competitive Landscape

| Existing Tool | What It Does | What It Misses |
|---------------|-------------|----------------|
| GitHub Copilot | Explains code in-file | No cross-repo reasoning, no history, no "why" |
| Swimm | Doc tool linked to code | Manual creation, no auto-discovery, no graph |
| Mintlify | API doc generator | Surface-level, no provenance, no conventions |
| Sourcegraph | Code search | Finds WHERE, not WHY. No narrative generation. |
| ReadMe.io | Doc hosting | Manual, no intelligence, no cross-referencing |
| **HyGit** | **Auto-generated wiki with provenance, archaeology, and convention extraction** | **This is the gap we fill** |

---

## Future Vision (Post-Hackathon)

- **Private repos:** Connect via GitHub App → auto-generate internal team wiki
- **Continuous updates:** Webhook on new PRs → wiki articles update automatically
- **IDE plugin:** "Why was this built?" as a hover tooltip in VS Code
- **Onboarding mode:** New hire gets a personalized wiki tour of what they need to know first
- **Cross-repo:** Connect multiple repos → see how services relate to each other
- **Slack integration:** "Ask the codebase" in Slack → grounded answer with citations

---

## Key Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| HydraDB ingestion takes too long (48h constraint) | Pre-ingest demo repo data. Use a medium-sized repo (~500 files, not a monorepo). |
| Graph doesn't extract meaningful relationships | Supplement with explicit relationship injection (PR #X fixes issue #Y is parseable from GitHub metadata). |
| Generated articles are too generic | Use `thinking` mode + `graph_context` + specific prompts that demand citations. |
| Convention extraction produces noise | Filter by repetition threshold (convention must appear in 5+ reviews to qualify). |
| UI takes too long to build | Keep it minimal: wiki articles rendered as markdown + one graph visualization page. |

---

## One-Line Pitch

> **"Every line has a story."** Point HyGit at any GitHub repo — get a Wikipedia that explains WHY the code is the way it is, with full citations from years of commits, PRs, and discussions.
>
> *git log tells you what. HyGit tells you why.*

---

---

*"Every line has a story."*

*This document is the source of truth for the HyGit project. All implementation decisions, demo planning, and scope changes should reference this document.*
