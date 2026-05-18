'use client';

import { useState, useEffect, use } from 'react';
import { api, type Repo } from '@/lib/api/client';

export default function RepoOverviewPage({ params }: { params: Promise<{ repoId: string }> }) {
  const { repoId } = use(params);
  const [repo, setRepo] = useState<Repo | null>(null);
  const [provenanceFile, setProvenanceFile] = useState('');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [provenance, setProvenance] = useState<any>(null);
  const [provenanceLoading, setProvenanceLoading] = useState(false);

  useEffect(() => {
    const load = async () => { try { const r = await api.getRepoStatus(repoId); setRepo(r); } catch {} };
    load();
    const iv = setInterval(load, 5000);
    return () => clearInterval(iv);
  }, [repoId]);

  const handleProvenance = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!provenanceFile.trim()) return;
    setProvenanceLoading(true);
    try { const result = await api.getProvenance(repoId, provenanceFile.trim()); setProvenance(result); }
    catch (err) { console.error(err); }
    finally { setProvenanceLoading(false); }
  };

  if (!repo) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-8 w-72 skeleton rounded-xl" />
        <div className="grid grid-cols-4 gap-3">
          {[1,2,3,4].map(i => <div key={i} className="skeleton h-28 rounded-2xl" />)}
        </div>
        <div className="skeleton h-64 rounded-2xl" />
      </div>
    );
  }

  const isReady = repo.status === 'ready';

  return (
    <div className="space-y-8 animate-fade-in pb-8">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 pb-7 border-b border-[var(--border-subtle)]">
        <div>
          <span className="section-label text-[10px]">( {repo.tenant_id} )</span>
          <h1 className="text-2xl font-bold text-[var(--text-primary)] mt-2 tracking-tight">
            {repo.owner} / <span className="text-[var(--text-secondary)]">{repo.name}</span>
          </h1>
        </div>
        <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-full border border-[var(--border-default)] bg-[var(--bg-elevated)] flex-shrink-0">
          <span className={`w-2 h-2 rounded-full ${isReady ? 'bg-emerald-400' : 'bg-indigo-400 animate-pulse'}`} />
          <span className="text-xs text-[var(--text-secondary)] font-mono capitalize">{repo.status}</span>
        </div>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Code Files',    value: repo.stats?.code_files ?? 0, color: 'text-indigo-400',  bg: 'bg-indigo-500/10',  icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg> },
          { label: 'Commits',       value: repo.stats?.commits    ?? 0, color: 'text-violet-400',  bg: 'bg-violet-500/10',  icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75"><circle cx="12" cy="12" r="3"/><line x1="3" y1="12" x2="9" y2="12"/><line x1="15" y1="12" x2="21" y2="12"/></svg> },
          { label: 'Issues',        value: repo.stats?.issues     ?? 0, color: 'text-amber-400',   bg: 'bg-amber-500/10',   icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg> },
          { label: 'Pull Requests', value: repo.stats?.prs        ?? 0, color: 'text-emerald-400', bg: 'bg-emerald-500/10', icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75"><circle cx="18" cy="18" r="3"/><circle cx="6" cy="6" r="3"/><path d="M13 6h3a2 2 0 0 1 2 2v7"/><line x1="6" y1="9" x2="6" y2="21"/></svg> },
        ].map(stat => (
          <div key={stat.label} className="glass-card p-5">
            <div className={`w-8 h-8 rounded-lg ${stat.bg} ${stat.color} flex items-center justify-center mb-3`}>
              {stat.icon}
            </div>
            <p className="text-xl font-bold text-[var(--text-primary)] tracking-tight">{stat.value.toLocaleString()}</p>
            <p className="text-xs text-[var(--text-secondary)] mt-0.5">{stat.label}</p>
          </div>
        ))}
      </div>

      <div className="grid md:grid-cols-3 gap-5">
        {/* Provenance Tracer */}
        <div className="md:col-span-2 glass-card p-6">
          <div className="mb-5">
            <span className="section-label text-[10px]">( Provenance Tracer )</span>
            <h2 className="text-base font-semibold text-[var(--text-primary)] mt-1.5 mb-1 tracking-tight">File-Level Historical Query</h2>
            <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
              Input a file path to run a multi-hop HydraDB graph query — surfacing the exact historical context responsible for its creation.
            </p>
          </div>

          <form onSubmit={handleProvenance} className="flex gap-2.5 mb-4">
            <input
              className="input-dark flex-1 text-sm py-2.5"
              placeholder="e.g. src/main.rs"
              value={provenanceFile}
              onChange={e => setProvenanceFile(e.target.value)}
              disabled={provenanceLoading || !isReady}
            />
            <button type="submit" className="btn-primary text-xs px-4 py-2.5 flex-shrink-0"
              disabled={provenanceLoading || !provenanceFile.trim() || !isReady}>
              {provenanceLoading
                ? <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                : 'Trace →'}
            </button>
          </form>

          {!isReady && (
            <div className="flex items-center gap-2.5 px-4 py-2.5 rounded-xl bg-[var(--accent-dim)] border border-[var(--border-accent)]">
              <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse flex-shrink-0" />
              <p className="text-xs text-indigo-300">Repository is indexing. Provenance queries will be available once complete.</p>
            </div>
          )}

          {provenance && (
            <div className="animate-fade-in pt-4 border-t border-[var(--border-subtle)]">
              <div className="bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded-xl p-5">
                <div className="flex items-center justify-between mb-3">
                  <span className={`badge ${provenance.status === 'found' ? 'badge-ready' : 'badge-pending'} text-[10px]`}>
                    {provenance.status?.toUpperCase() || 'UNKNOWN'}
                  </span>
                  {provenance.introduced_in && (
                    <span className="text-xs font-mono text-[var(--text-tertiary)]">Introduced: {provenance.introduced_in}</span>
                  )}
                </div>
                <p className="text-sm text-[var(--text-secondary)] leading-relaxed">{provenance.narrative}</p>
              </div>
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          <div className="glass-card p-5">
            <span className="section-label text-[10px]">( Details )</span>
            <div className="mt-3 space-y-2.5">
              {[
                { k: 'Repo ID', v: repoId.slice(0,20) + (repoId.length > 20 ? '…' : '') },
                { k: 'Tenant',  v: repo.tenant_id },
                { k: 'Status',  v: repo.status },
              ].map(row => (
                <div key={row.k} className="flex justify-between items-center">
                  <span className="text-xs text-[var(--text-tertiary)]">{row.k}</span>
                  <span className={`text-xs font-mono ${row.k === 'Status' ? (isReady ? 'text-emerald-400' : 'text-indigo-400') : 'text-[var(--text-secondary)]'}`}>{row.v}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
