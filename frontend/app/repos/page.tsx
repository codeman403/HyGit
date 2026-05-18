'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { api, type Repo } from '@/lib/api/client';

export default function ReposPage() {
  const [repos, setRepos] = useState<Repo[]>([]);
  const [loading, setLoading] = useState(true);
  const [repoToDelete, setRepoToDelete] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try { const data = await api.listRepos(); setRepos(data); }
      catch (err) { console.error('Failed to load repos:', err); }
      finally { setLoading(false); }
    };
    load();
    // Poll faster (2s) if anything is pending/ingesting
    const tick = () => {
      load();
      const hasActive = repos.some(r => r.status === 'pending' || r.status === 'ingesting');
      timer = setTimeout(tick, hasActive ? 2000 : 5000);
    };
    let timer = setTimeout(tick, 2000);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleDelete = (e: React.MouseEvent, repoId: string) => {
    e.preventDefault();
    setRepoToDelete(repoId);
  };

  const confirmDelete = async () => {
    if (!repoToDelete) return;
    const repoId = repoToDelete;
    setRepoToDelete(null);
    
    // Optimistic UI update
    setRepos(prev => prev.filter(r => r.repo_id !== repoId));
    
    try {
      await api.deleteRepo(repoId);
    } catch (err) {
      setDeleteError('Failed to delete repository');
      setTimeout(() => setDeleteError(null), 4000);
      // Revert if failed
      try { const data = await api.listRepos(); setRepos(data); } catch { /* ignore */ }
    }
  };

  return (
    <main className="hero-bg min-h-screen">
      <nav className="border-b border-[var(--border-subtle)] bg-[var(--bg-base)]/80 backdrop-blur-xl sticky top-0 z-50">
        <div className="max-w-5xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5">
            <div className="w-8 h-8 border border-white bg-black flex items-center justify-center">
              <span className="text-white font-extrabold text-[11px] font-mono">HG</span>
            </div>
            <span className="font-extrabold uppercase tracking-wider text-[var(--text-primary)] text-base font-mono">HYGIT</span>
          </Link>
          <Link href="/" className="btn-primary text-xs px-3.5 py-2">+ New Repository</Link>
        </div>
      </nav>

      <div className="max-w-5xl mx-auto px-6 py-14">
        <div className="mb-10">
          <span className="section-label">( Workspaces )</span>
          <h1 className="text-2xl font-bold text-[var(--text-primary)] mt-3 mb-1.5 tracking-tight">My Repositories</h1>
          <p className="text-sm text-[var(--text-secondary)]">Repositories ingested into your HydraDB knowledge graphs</p>
        </div>

        {loading && (
          <div className="space-y-3">
            {[1, 2, 3].map(i => <div key={i} className="skeleton h-24 rounded-2xl" />)}
          </div>
        )}

        {!loading && repos.length === 0 && (
          <div className="glass-card p-16 text-center animate-fade-in">
            <div className="w-12 h-12 rounded-2xl bg-[var(--accent-dim)] flex items-center justify-center mx-auto mb-5">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.5">
                <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>
              </svg>
            </div>
            <p className="text-[var(--text-primary)] font-semibold mb-1.5">No repositories yet</p>
            <p className="text-[var(--text-secondary)] text-sm mb-8 max-w-xs mx-auto">Point HyGit at a GitHub repository to build your first knowledge graph</p>
            <Link href="/" className="btn-primary text-sm px-5 py-2.5">Analyze Your First Repo →</Link>
          </div>
        )}

        {!loading && repos.length > 0 && (
          <div className="space-y-3 animate-fade-in">
            {repos.map(repo => (
              <Link key={repo.repo_id} href={`/repos/${repo.repo_id}`}>
                <div className="glass-card card-interactive p-5 cursor-pointer group">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex items-start gap-3">
                      <div className="w-9 h-9 rounded-xl bg-[var(--accent-dim)] border border-[var(--border-accent)] flex items-center justify-center flex-shrink-0 mt-0.5">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2">
                          <path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22"/>
                        </svg>
                      </div>
                      <div className="min-w-0">
                        <h2 className="text-[var(--text-primary)] font-semibold group-hover:text-indigo-300 transition-colors truncate text-sm">
                          {repo.owner}/{repo.name}
                        </h2>
                        <p className="text-[var(--text-tertiary)] text-xs font-mono mt-0.5">{repo.tenant_id}</p>
                        <p className="text-[var(--text-tertiary)] text-[10px] font-mono mt-0.5">id: {repo.repo_id}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <StatusBadge status={repo.status} />
                      <button 
                        onClick={(e) => handleDelete(e, repo.repo_id)}
                        className="p-1.5 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-[var(--text-tertiary)] hover:text-red-400 hover:border-red-500/30 hover:bg-red-500/10 transition-colors"
                        title="Delete Repository"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2M10 11v6M14 11v6"/>
                        </svg>
                      </button>
                    </div>
                  </div>

                  {(repo.status === 'pending' || repo.status === 'ingesting') && (
                    <div className="mt-4 ml-12">
                      <div className="flex justify-between items-center mb-1.5">
                        <p className="text-xs text-[var(--text-secondary)] truncate pr-3">
                          {repo.progress_message ?? (repo.status === 'pending' ? 'Initialising ingestion pipeline…' : 'Ingesting…')}
                        </p>
                        {repo.status === 'ingesting' && repo.progress_pct != null && (
                          <p className="text-xs text-indigo-400 font-mono flex-shrink-0">{repo.progress_pct}%</p>
                        )}
                      </div>
                      <div className="h-0.5 bg-[var(--border-default)] rounded-full overflow-hidden">
                        {repo.status === 'ingesting' && repo.progress_pct != null ? (
                          <div
                            className="h-full bg-gradient-to-r from-indigo-500 to-violet-500 rounded-full transition-all duration-700 ease-out"
                            style={{ width: `${repo.progress_pct}%` }}
                          />
                        ) : (
                          <div className="h-full w-1/3 bg-gradient-to-r from-indigo-500/60 to-violet-500/60 rounded-full" style={{ animation: 'sweep-shimmer 1.5s ease-in-out infinite' }} />
                        )}
                      </div>
                    </div>
                  )}

                  {repo.stats && Object.keys(repo.stats).length > 0 && (
                    <div className="mt-3 ml-12 flex flex-wrap gap-4">
                      {Object.entries(repo.stats).map(([key, val]) => (
                        <span key={key} className="text-xs text-[var(--text-secondary)]">
                          <span className="text-[var(--text-primary)] font-mono font-medium">{val}</span> {key}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      {repoToDelete && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in px-4">
          <div className="glass-card w-full max-w-md p-6 border border-[var(--border-subtle)] shadow-2xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-500/10 flex items-center justify-center flex-shrink-0 border border-red-500/20">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" className="text-red-400" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-[var(--text-primary)]">Delete Repository</h3>
            </div>
            <p className="text-[var(--text-secondary)] text-sm mb-6 leading-relaxed">
              Are you sure you want to delete this repository? This will permanently remove its knowledge graph and free up its HydraDB tenant slot. This action cannot be undone.
            </p>
            <div className="flex items-center justify-end gap-3">
              <button 
                onClick={() => setRepoToDelete(null)}
                className="px-4 py-2 text-sm font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
              >
                Cancel
              </button>
              <button 
                onClick={confirmDelete}
                className="px-4 py-2 text-sm font-medium bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 hover:border-red-500/30 rounded-lg transition-all"
              >
                Delete Repository
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteError && (
        <div className="fixed bottom-6 right-6 z-[110] animate-fade-in">
          <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/30 backdrop-blur-md shadow-2xl flex items-center gap-3">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" className="text-red-400" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
            <span className="text-sm font-medium text-red-400">{deleteError}</span>
          </div>
        </div>
      )}
    </main>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map = {
    ready:     { label: '● Ready',      cls: 'badge-ready' },
    ingesting: { label: '⟳ Ingesting',  cls: 'badge-ingesting' },
    pending:   { label: '◷ Pending',    cls: 'badge-pending' },
    failed:    { label: '✗ Failed',     cls: 'badge-failed' },
  } as const;
  const s = map[status as keyof typeof map] ?? map.pending;
  return <span className={`badge ${s.cls} flex-shrink-0`}>{s.label}</span>;
}
