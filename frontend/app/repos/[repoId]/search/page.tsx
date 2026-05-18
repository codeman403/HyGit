'use client';

import { useState, use, useEffect } from 'react';
import { api, type SearchResponse, type Repo } from '@/lib/api/client';
import {
  HydraDBPipeline,
  SEARCH_PIPELINE,
  SEARCH_PIPELINE_FAST,
  type PipelineStep,
} from '@/components/features/hydradb-pipeline';
import { SOURCE_COLORS, SOURCE_ICONS } from '@/lib/utils/cn';

export default function SearchPage({ params }: { params: Promise<{ repoId: string }> }) {
  const { repoId } = use(params);
  const [query, setQuery] = useState('');
  const [mode, setMode] = useState<'thinking' | 'fast'>('thinking');
  const [result, setResult] = useState<SearchResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [pipelineSteps, setPipelineSteps] = useState<PipelineStep[]>(SEARCH_PIPELINE);
  // basePipeline reflects current mode for display when not running
  const displaySteps = pipelineSteps.some(s => s.status !== 'pending') ? pipelineSteps : basePipeline.map(s => ({ ...s, status: 'pending' as const }));

  // Derive pipeline steps from mode — no effect needed
  const basePipeline = mode === 'fast' ? SEARCH_PIPELINE_FAST : SEARCH_PIPELINE;
  const [repo, setRepo] = useState<Repo | null>(null);

  useEffect(() => {
    api.getRepoStatus(repoId).then(setRepo).catch(() => {});
  }, [repoId]);

  const ghBase = repo ? `https://github.com/${repo.owner}/${repo.name}` : null;

  const citationUrl = (cite: { title: string; source_type: string; url?: string }): string | null => {
    if (cite.url) return cite.url;
    if (!ghBase) return null;
    const prMatch = cite.title.match(/PR\s*#?(\d+)/i);
    const issueMatch = cite.title.match(/Issue\s*#?(\d+)/i);
    if (prMatch) return `${ghBase}/pull/${prMatch[1]}`;
    if (issueMatch) return `${ghBase}/issues/${issueMatch[1]}`;
    if (cite.source_type === 'pr') return `${ghBase}/pulls`;
    if (cite.source_type === 'issue') return `${ghBase}/issues`;
    if (cite.source_type === 'commit') return `${ghBase}/commits`;
    return ghBase;
  };

  const exampleQueries = [
    "Why was this architecture designed this way?",
    "What's the biggest technical debt in this codebase?",
    "Who understands the authentication module?",
    "What decisions does the team regret?",
    "How did the error handling evolve over time?",
    "What are the unresolved performance issues?",
  ];

  const animatePipeline = async (searchFn: () => Promise<SearchResponse>) => {
    const run = (steps: PipelineStep[], id: string, status: PipelineStep['status']) =>
      steps.map(s => s.id === id ? { ...s, status } : s);

    const isFast = mode === 'fast';
    let steps: PipelineStep[] = (isFast ? SEARCH_PIPELINE_FAST : SEARCH_PIPELINE)
      .map(s => ({ ...s, status: 'pending' as const }));
    setPipelineSteps(steps);

    // Thinking mode: semantic → boolean → merge → (fetch) → llm
    // Fast mode: semantic → (fetch) → llm
    steps = run(steps, 'semantic', 'running'); setPipelineSteps([...steps]);
    await new Promise(r => setTimeout(r, isFast ? 200 : 400));
    steps = run(steps, 'semantic', 'done');

    if (!isFast) {
      steps = run(steps, 'boolean', 'running'); setPipelineSteps([...steps]);
      await new Promise(r => setTimeout(r, 300));
      steps = run(steps, 'boolean', 'done');
      steps = run(steps, 'merge', 'running'); setPipelineSteps([...steps]);
    }

    const data = await searchFn();

    if (!isFast) steps = run(steps, 'merge', 'done');
    steps = run(steps, 'llm', 'running'); setPipelineSteps([...steps]);
    await new Promise(r => setTimeout(r, 200));
    steps = run(steps, 'llm', 'done'); setPipelineSteps([...steps]);
    return data;
  };

  const handleSearch = async (q?: string) => {
    const searchQuery = q ?? query;
    if (!searchQuery.trim()) return;
    setLoading(true); setError('');
    if (q) setQuery(q);
    try {
      const data = await animatePipeline(() => api.search(repoId, searchQuery.trim(), mode));
      setResult(data);
    } catch (err) { setError(err instanceof Error ? err.message : 'Search failed'); }
    finally { setLoading(false); }
  };

  return (
    <div className="flex gap-5 min-h-[70vh] animate-fade-in">
      {/* Pipeline sidebar */}
      <aside className="w-52 shrink-0">
        <div className="glass-card p-4 sticky top-20 space-y-4">
          <div>
            <span className="section-label text-[10px]">( HydraDB Pipeline )</span>
            <div className="mt-3">
              <HydraDBPipeline steps={displaySteps} />
            </div>
          </div>

          <div className="pt-3 border-t border-[var(--border-subtle)]">
            <p className="text-[10px] text-[var(--text-tertiary)] mb-2 font-medium">Query mode:</p>
            <div className="tab-bar">
              {(['thinking', 'fast'] as const).map(m => (
                <button key={m} onClick={() => setMode(m)}
                  style={{ flex: 1, padding: '6px 4px', fontSize: 10, whiteSpace: 'normal', textAlign: 'center' }}
                  className={`tab-item${mode === m ? ' active' : ''}`}>
                  {m === 'thinking' ? '🧠' : '⚡'} {m}
                </button>
              ))}
            </div>
            <p className="text-[10px] text-[var(--text-tertiary)] mt-2 leading-relaxed">
              {mode === 'thinking' ? 'Multi-query + graph traversal + reranking.' : 'Single pass. Lower latency.'}
            </p>
          </div>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 min-w-0 space-y-5">
        <div>
          <span className="section-label text-[10px]">( Live Query )</span>
          <h1 className="text-xl font-bold text-[var(--text-primary)] mt-1.5 tracking-tight">Ask Your Codebase</h1>
          <p className="text-sm text-[var(--text-secondary)] mt-0.5">Cited, grounded answers backed by HydraDB graph traversal</p>
        </div>

        {/* Search input */}
        <div className="glass-card p-5">
          <div className="flex gap-2.5">
            <div className="relative flex-1">
              <input
                className="input-dark pl-4 text-sm py-2.5"
                placeholder="What is the biggest architectural regret in this codebase?"
                value={query}
                onChange={e => setQuery(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && !loading && handleSearch()}
                disabled={loading}
              />
            </div>
            <button onClick={() => handleSearch()} disabled={loading || !query.trim()} className="btn-primary text-xs px-4 py-2.5 flex-shrink-0">
              {loading ? <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : 'Search →'}
            </button>
          </div>


        </div>

        {error && <div className="px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">{error}</div>}

        {/* Results */}
        {result && !loading && (
          <div className="space-y-4 animate-fade-in">
            {/* Answer */}
            <div className="glass-card p-6">
              <div className="flex items-center gap-2 mb-4 flex-wrap">
                <span className="section-label text-[10px]">( Answer )</span>
                <span className="text-[var(--text-tertiary)] text-[10px]">·</span>
                <span className="text-[10px] text-[var(--text-tertiary)]">{result.mode_used} mode</span>
                <span className="text-[var(--text-tertiary)] text-[10px]">·</span>
                <span className="text-[10px] text-[var(--text-tertiary)]">{result.citations.length} sources</span>
              </div>
              <p className="text-sm text-[var(--text-secondary)] leading-relaxed whitespace-pre-wrap">{result.answer}</p>
            </div>

            {/* Graph Paths */}
            {result.graph_paths.length > 0 && (
              <div className="glass-card p-5">
                <span className="section-label text-[10px]">( HydraDB Graph Paths — {result.graph_paths.length} )</span>
                <div className="mt-3 space-y-2">
                  {result.graph_paths.map((path, i) => (
                    <div key={i} className="bg-[var(--bg-elevated)] border border-[var(--border-subtle)] p-3.5 rounded-xl">
                      <div className="flex items-center flex-wrap gap-1 text-xs font-mono">
                        {path.entities.map((entity, j) => (
                          <span key={j} className="flex items-center gap-1">
                            <span className="px-2 py-0.5 bg-[var(--accent-dim)] border border-[var(--border-accent)] rounded-md text-[var(--text-primary)] text-[10px]">{entity}</span>
                            {j < path.relations.length && (
                              <span className="text-[var(--text-tertiary)] text-[10px]">─[{path.relations[j]}]▶</span>
                            )}
                          </span>
                        ))}
                      </div>
                      <p className="text-[10px] text-[var(--text-tertiary)] mt-1.5">confidence: {(path.confidence * 100).toFixed(0)}%</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Citations */}
            {result.citations.length > 0 && (
              <div className="glass-card p-5">
                <span className="section-label text-[10px]">( Sources — {result.citations.length} )</span>
                <div className="mt-3 space-y-2">
                  {result.citations.map((cite, i) => {
                    const color = SOURCE_COLORS[cite.source_type] ?? SOURCE_COLORS.default;
                    const icon = SOURCE_ICONS[cite.source_type] ?? '📝';
                    return (
                      <div key={i} className="flex items-start gap-3 p-3.5 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-subtle)]">
                        <div className="flex-shrink-0 mt-0.5" style={{ width: 3, height: 38, background: color, borderRadius: 2 }} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-xs">{icon}</span>
                            {(() => { const url = citationUrl(cite); return url ? (
                              <a href={url} target="_blank" rel="noopener noreferrer" className="text-xs font-semibold text-[var(--accent)] hover:underline truncate">{cite.title}</a>
                            ) : (
                              <span className="text-xs font-semibold text-[var(--text-secondary)] truncate">{cite.title}</span>
                            ); })()}
                            <span className="text-[10px] px-1.5 py-0.5 rounded font-mono flex-shrink-0" style={{ background: `${color}18`, color }}>{cite.source_type}</span>
                            <span className="text-[10px] font-mono ml-auto flex-shrink-0" style={{ color }}>{cite.relevancy_score.toFixed(2)}</span>
                          </div>
                          <p className="text-xs text-[var(--text-tertiary)] line-clamp-2 leading-relaxed">{cite.excerpt}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Empty state */}
        {!result && !loading && (
          <div className="glass-card p-6">
            <p className="text-xs text-[var(--text-secondary)] mb-3 font-medium">Try:</p>
            <div className="grid grid-cols-2 gap-2">
              {exampleQueries.map(q => (
                <button key={q} onClick={() => handleSearch(q)}
                  className="text-left p-3.5 rounded-xl border border-[var(--border-subtle)] text-[var(--text-tertiary)] text-xs hover:border-[var(--border-accent)] hover:text-[var(--accent)] transition-all leading-relaxed">
                  &quot;{q}&quot;
                </button>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
