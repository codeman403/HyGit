// lib/api/client.ts — typed API client following FRONTEND_STANDARDS.md

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export class ApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
    ...options,
  });

  if (!res.ok) {
    let errBody: { error?: { code?: string; message?: string } } = {};
    try {
      errBody = await res.json();
    } catch {}
    throw new ApiError(
      errBody.error?.code ?? 'UNKNOWN_ERROR',
      errBody.error?.message ?? `HTTP ${res.status}`,
      res.status
    );
  }

  if (res.status === 204) {
    return null as unknown as T;
  }

  return res.json() as Promise<T>;
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Repo {
  repo_id: string;
  tenant_id: string;
  owner: string;
  name: string;
  status: 'pending' | 'ingesting' | 'ready' | 'failed';
  stats: Record<string, number>;
  created_at: string;
  updated_at?: string;
  error?: string;
  progress_message?: string;
  progress_pct?: number;
}

export interface IngestRequest {
  github_url: string;
  max_commits?: number;
  max_issues?: number;
  max_prs?: number;
  include_code?: boolean;
}

export interface ProvenanceResponse {
  file_path: string;
  narrative: string;
  introduced_in?: string;
  fixes_issue?: string;
  status: string;
  verdict: string;
  sources: Array<{
    title: string;
    source_type: string;
    relevancy_score: number;
    excerpt: string;
    url?: string;
  }>;
  graph_paths: Array<{
    entities: string[];
    relations: string[];
    confidence: number;
  }>;
  context_graph_visualization: Array<{
    from: string;
    relation: string;
    to: string;
  }>;
}

export interface WikiArticle {
  slug: string;
  title: string;
  summary: string;
  content: string;
  module_path: string;
  references: Array<{ id: string; title: string; type: string }>;
  related_articles: string[];
  generated_at: string;
}

export interface OrphanedFile {
  path: string;
  last_modified: string;
  last_author: string;
  author_status: string;
  origin_context: string;
  verdict: string;
  risk_level: 'low' | 'medium' | 'high';
  still_imported_by: string[];
  bus_factor_score: number;
}

export interface RecoveryReport {
  repo_id: string;
  orphaned_files: OrphanedFile[];
  total_scanned: number;
  orphaned_count: number;
  generated_at: string;
}

export interface UnwrittenRule {
  id: string;
  category: string;
  rule: string;
  enforced_by: string[];
  evidence_prs: string[];
  evidence_count: number;
  violation_count: number;
  violations: Array<{ file: string; line?: number; description: string }>;
  confidence: number;
}

export interface ConventionsReport {
  repo_id: string;
  rules: UnwrittenRule[];
  total_reviews_analyzed: number;
  generated_at: string;
}

export interface SearchResponse {
  query: string;
  answer: string;
  citations: Array<{
    title: string;
    source_type: string;
    url?: string;
    relevancy_score: number;
    excerpt: string;
  }>;
  graph_paths: Array<{
    entities: string[];
    relations: string[];
    confidence: number;
  }>;
  mode_used: string;
}

export interface GraphData {
  nodes: Array<{ id: string; label: string; type: string; metadata: Record<string, unknown> }>;
  edges: Array<{ source: string; target: string; relation: string; weight: number }>;
  total_nodes: number;
  total_edges: number;
}

// ─── API Methods ──────────────────────────────────────────────────────────────

export const api = {
  // Repos
  listRepos: () =>
    apiFetch<{ items: Repo[]; total: number; page: number; limit: number }>('/api/v1/repos')
      .then(r => r.items),
  getRepoStatus: (id: string) => apiFetch<Repo>(`/api/v1/repos/${id}/status`),
  ingestRepo: (data: IngestRequest) =>
    apiFetch<Repo>('/api/v1/repos', { method: 'POST', body: JSON.stringify(data) }),
  deleteRepo: (id: string) =>
    apiFetch<void>(`/api/v1/repos/${id}`, { method: 'DELETE' }),

  // Analysis
  getProvenance: (repoId: string, filePath: string) =>
    apiFetch<ProvenanceResponse>(`/api/v1/repos/${repoId}/provenance`, {
      method: 'POST',
      body: JSON.stringify({ file_path: filePath }),
    }),

  getWikiList: (repoId: string, generate = false) =>
    apiFetch<{ articles: WikiArticle[]; total: number }>(
      `/api/v1/repos/${repoId}/wiki?generate=${generate}`
    ),

  generateWikiArticle: (repoId: string, modulePath: string) =>
    apiFetch<WikiArticle>(
      `/api/v1/repos/${repoId}/wiki/generate?module_path=${encodeURIComponent(modulePath)}`,
      { method: 'POST' }
    ),

  getRecoveryReport: (repoId: string) =>
    apiFetch<RecoveryReport>(`/api/v1/repos/${repoId}/reports/recovery`),

  getConventionsReport: (repoId: string) =>
    apiFetch<ConventionsReport>(`/api/v1/repos/${repoId}/reports/conventions`),

  search: (repoId: string, query: string, mode = 'thinking') =>
    apiFetch<SearchResponse>(`/api/v1/repos/${repoId}/search`, {
      method: 'POST',
      body: JSON.stringify({ query, mode, max_results: 12 }),
    }),

  getGraphData: (repoId: string) =>
    apiFetch<GraphData>(`/api/v1/repos/${repoId}/graph-data`),

  health: () => apiFetch<{ status: string }>('/health'),
};
