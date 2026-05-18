'use client';

import { useState, use, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { api, type WikiArticle, type Repo } from '@/lib/api/client';

/** Strip any trailing ## References / ## Related Modules sections the LLM may include */
function stripTrailingSections(content: string): string {
  return content
    .replace(/\n##\s+(References|Related\s+Modules?|See\s+Also)\b[\s\S]*/i, '')
    .trimEnd();
}

export default function WikiPage({ params }: { params: Promise<{ repoId: string }> }) {
  const { repoId } = use(params);
  const [articles, setArticles] = useState<WikiArticle[]>([]);
  const [selectedArticle, setSelectedArticle] = useState<WikiArticle | null>(null);
  const [generating, setGenerating] = useState(false);
  const [customModule, setCustomModule] = useState('');
  const [error, setError] = useState('');
  const [repo, setRepo] = useState<Repo | null>(null);
  const [discoveredModules, setDiscoveredModules] = useState<string[]>([]);
  const [modulesLoading, setModulesLoading] = useState(true);

  useEffect(() => {
    api.getRepoStatus(repoId).then(setRepo).catch(() => {});
    // Fetch existing articles to populate sidebar module list (no generation)
    api.getWikiList(repoId, false).then(res => {
      if (res.articles.length > 0) {
        setDiscoveredModules(res.articles.map(a => a.module_path));
      }
    }).catch(() => {}).finally(() => setModulesLoading(false));
  }, [repoId]);

  const ghBase = repo ? `https://github.com/${repo.owner}/${repo.name}` : null;

  const refUrl = (ref: { id: string; type: string }) => {
    if (!ghBase) return null;
    const num = ref.id.replace(/^(pr|issue)-/, '');
    return ref.type === 'pr' ? `${ghBase}/pull/${num}` : `${ghBase}/issues/${num}`;
  };

  const fallbackModules = [
    'authentication', 'api routes', 'database layer', 'middleware',
    'utilities', 'testing', 'configuration', 'error handling',
  ];
  const presetModules = modulesLoading ? [] : (discoveredModules.length > 0 ? discoveredModules.slice(0, 8) : fallbackModules);

  const generateArticle = async (module: string) => {
    setGenerating(true); setError('');
    try {
      const article = await api.generateWikiArticle(repoId, module);
      setArticles(prev => {
        const idx = prev.findIndex(a => a.slug === article.slug);
        if (idx >= 0) { const n = [...prev]; n[idx] = article; return n; }
        return [article, ...prev];
      });
      setSelectedArticle(article);
    } catch (err) { setError(err instanceof Error ? err.message : 'Failed to generate'); }
    finally { setGenerating(false); }
  };

  const handleCustom = (e: React.FormEvent) => { e.preventDefault(); if (customModule.trim()) generateArticle(customModule.trim()); };

  return (
    <div className="flex gap-5 min-h-[70vh] animate-fade-in">
      {/* Sidebar */}
      <aside className="w-56 shrink-0">
        <div className="glass-card p-4 sticky top-20 h-full">
          <span className="section-label text-[10px]">( Wiki Articles )</span>

          {articles.length > 0 && (
            <div className="mt-3 mb-4 space-y-0.5">
              {articles.map(article => (
                <button key={article.slug} onClick={() => setSelectedArticle(article)}
                  className={`w-full text-left px-3 py-2 rounded-lg text-xs transition-all ${
                    selectedArticle?.slug === article.slug
                      ? 'bg-[var(--accent-dim)] text-[var(--accent)] border border-[var(--border-accent)]'
                      : 'text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)]'
                  }`}>
                  <span className="truncate block">{article.title}</span>
                </button>
              ))}
            </div>
          )}

          <div className="mb-2">
            <p className="text-[10px] text-[var(--text-tertiary)] mb-1.5 font-medium">Generate article:</p>
            {modulesLoading && (
              <div className="space-y-1.5 animate-pulse">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="h-6 bg-[var(--bg-elevated)] rounded-md" />
                ))}
              </div>
            )}
            <div className="space-y-0.5">
              {presetModules.map(mod => (
                <button key={mod} onClick={() => generateArticle(mod)} disabled={generating}
                  className="w-full text-left px-3 py-1.5 rounded-md text-[11px] text-[var(--text-tertiary)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text-secondary)] transition-all capitalize disabled:opacity-40 disabled:cursor-not-allowed">
                  {mod}
                </button>
              ))}
            </div>
          </div>

          <form onSubmit={handleCustom} className="mt-3 flex gap-1.5">
            <input
              value={customModule} onChange={e => setCustomModule(e.target.value)}
              placeholder="custom module..." disabled={generating}
              className="flex-1 bg-[var(--bg-elevated)] border border-[var(--border-subtle)] rounded-lg px-3 py-2 text-xs text-[var(--text-primary)] placeholder-[var(--text-tertiary)] focus:outline-none focus:border-[var(--border-accent)] disabled:opacity-40"
            />
            <button type="submit" disabled={generating || !customModule.trim()}
              className="btn-primary text-[10px] px-2.5 py-1.5 flex-shrink-0 disabled:opacity-40">→</button>
          </form>
        </div>
      </aside>

      {/* Content */}
      <main className="flex-1 min-w-0">
        {!selectedArticle && !generating && (
          <div className="glass-card p-14 text-center h-full flex flex-col items-center justify-center animate-fade-in">
            <div className="w-14 h-14 rounded-2xl bg-[var(--bg-elevated)] border border-[var(--border-subtle)] flex items-center justify-center mx-auto mb-5">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="1.5"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>
            </div>
            <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-1.5">Generate Your First Article</h2>
            <p className="text-sm text-[var(--text-secondary)] max-w-sm">Select a module from the sidebar or type a custom path to generate a Wikipedia-style article.</p>
          </div>
        )}

        {generating && (
          <div className="glass-card p-14 text-center h-full flex flex-col items-center justify-center animate-fade-in">
            <div className="w-10 h-10 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin mx-auto mb-5" />
            <p className="text-sm text-[var(--text-secondary)]">Generating article…</p>
          </div>
        )}

        {error && <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-xs text-red-400">{error}</div>}

        {selectedArticle && (
          <div className="glass-card p-7 animate-fade-in">
            <div className="mb-6 pb-5 border-b border-[var(--border-subtle)]">
              <h1 className="text-2xl font-bold text-[var(--text-primary)] mb-1.5 tracking-tight">{selectedArticle.title}</h1>
              <p className="text-sm text-[var(--text-secondary)] mb-3">{selectedArticle.summary}</p>
              <div className="flex flex-wrap items-center gap-4 text-xs text-[var(--text-tertiary)]">
                <span className="flex items-center gap-1.5 font-mono">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
                  {selectedArticle.module_path}
                </span>
                <span>Generated {new Date(selectedArticle.generated_at).toLocaleDateString()}</span>
                {ghBase && (
                  <a href={ghBase} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-1 text-[var(--accent)] hover:underline">
                    View Repository ↗
                  </a>
                )}
              </div>
            </div>

            <div className="markdown-content">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {stripTrailingSections(selectedArticle.content)}
              </ReactMarkdown>
            </div>

            {selectedArticle.references.length > 0 && (
              <div className="mt-7 pt-5 border-t border-[var(--border-subtle)]">
                <p className="text-xs font-semibold text-[var(--text-secondary)] mb-3">References</p>
                <div className="flex flex-wrap gap-2">
                  {selectedArticle.references.map(ref => {
                    const url = refUrl(ref);
                    const badge = (
                      <span className={`badge ${ref.type === 'pr' ? 'badge-ingesting' : 'badge-ready'} text-[10px]`}>
                        {ref.type === 'pr' ? '🔀' : '🐛'} {ref.title}
                      </span>
                    );
                    return url ? (
                      <a key={ref.id} href={url} target="_blank" rel="noopener noreferrer" className="hover:opacity-80 transition-opacity">
                        {badge}
                      </a>
                    ) : (
                      <span key={ref.id}>{badge}</span>
                    );
                  })}
                </div>
              </div>
            )}

            {selectedArticle.related_articles.length > 0 && (
              <div className="mt-4">
                <p className="text-xs font-semibold text-[var(--text-secondary)] mb-2">Related modules</p>
                <div className="flex flex-wrap gap-2">
                  {selectedArticle.related_articles.map(mod => (
                    <button key={mod} onClick={() => generateArticle(mod)} className="btn-accent-ghost text-xs py-1 px-3">{mod}</button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
