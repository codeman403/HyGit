'use client';

import { useState, use } from 'react';
import { api, type RecoveryReport, type ConventionsReport } from '@/lib/api/client';

export default function ReportsPage({ params }: { params: Promise<{ repoId: string }> }) {
  const { repoId } = use(params);
  const [activeTab, setActiveTab] = useState<'recovery' | 'conventions'>('recovery');
  const [recovery, setRecovery] = useState<RecoveryReport | null>(null);
  const [conventions, setConventions] = useState<ConventionsReport | null>(null);
  const [loadingRecovery, setLoadingRecovery] = useState(false);
  const [loadingConventions, setLoadingConventions] = useState(false);
  const [error, setError] = useState('');

  const generateRecovery = async () => {
    setLoadingRecovery(true); setError('');
    try { const data = await api.getRecoveryReport(repoId); setRecovery(data); }
    catch (err) { setError(err instanceof Error ? err.message : 'Failed to generate report'); }
    finally { setLoadingRecovery(false); }
  };

  const generateConventions = async () => {
    setLoadingConventions(true); setError('');
    try { const data = await api.getConventionsReport(repoId); setConventions(data); }
    catch (err) { setError(err instanceof Error ? err.message : 'Failed to generate report'); }
    finally { setLoadingConventions(false); }
  };

  return (
    <div className="animate-fade-in space-y-6">
      {/* Header */}
      <div>
        <span className="section-label text-[10px]">( AI Analysis )</span>
        <h1 className="text-xl font-bold text-[var(--text-primary)] mt-1.5 tracking-tight">Reports</h1>
        <p className="text-sm text-[var(--text-secondary)] mt-0.5">AI-generated analysis using HydraDB context graphs and pattern recognition</p>
      </div>

      {/* Tab bar */}
      <div className="tab-bar w-fit">
        {[
          { id: 'recovery',    label: 'Codebase Recovery' },
          { id: 'conventions', label: 'Unwritten Rules' },
        ].map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id as typeof activeTab)}
            className={`tab-item${activeTab === tab.id ? ' active' : ''}`}>
            {tab.label}
          </button>
        ))}
      </div>

      {error && (
        <div className="px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">{error}</div>
      )}

      {/* ── Codebase Recovery ─────────────────────────────────────────────── */}
      {activeTab === 'recovery' && (
        <div className="space-y-4">
          <div className="glass-card p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-base font-semibold text-[var(--text-primary)] mb-1 tracking-tight">Codebase Recovery Report</h2>
                <p className="text-xs text-[var(--text-secondary)] leading-relaxed max-w-xl">
                  Identifies orphaned and inactive files in your codebase that may be safe to remove or refactor.
                  Reconstructs origin stories using full graph traversal.
                </p>
              </div>
              <button onClick={generateRecovery} disabled={loadingRecovery} className="btn-primary text-xs px-4 py-2 flex-shrink-0">
                {loadingRecovery
                  ? <><span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />Analyzing…</>
                  : 'Generate Report'}
              </button>
            </div>
          </div>

          {loadingRecovery && (
            <div className="glass-card p-10 text-center animate-fade-in">
              <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center mx-auto mb-4">
                <span className="w-5 h-5 border-2 border-amber-500/30 border-t-amber-400 rounded-full animate-spin" />
              </div>
              <p className="font-semibold text-[var(--text-primary)] mb-1.5">Analyzing codebase…</p>
              <div className="space-y-1 text-xs text-[var(--text-tertiary)] font-mono mt-3">
                <p>⟳ Querying HydraDB for low-activity signals</p>
                <p>⟳ Traversing git history relationships</p>
                <p>⟳ GPT-4o generating verdicts</p>
              </div>
            </div>
          )}

          {recovery && !loadingRecovery && (
            <div className="animate-fade-in space-y-3">
              <div className="flex items-center gap-4 text-xs text-[var(--text-secondary)] px-1">
                <span>Scanned: <strong className="text-[var(--text-primary)]">{recovery.total_scanned}</strong> files</span>
                <span>Orphaned: <strong className="text-amber-400">{recovery.orphaned_count}</strong></span>
              </div>

              {recovery.orphaned_files.length === 0 && (
                <div className="glass-card p-10 text-center">
                  <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mx-auto mb-4">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#34D399" strokeWidth="2"><polyline points="20 6 9 17 4 12"/></svg>
                  </div>
                  <p className="font-semibold text-[var(--text-primary)]">No orphaned files found</p>
                  <p className="text-sm text-[var(--text-secondary)] mt-1">All code appears to have active maintainers.</p>
                </div>
              )}

              {recovery.orphaned_files.map((file, i) => (
                <div key={i} className="glass-card p-5 animate-fade-in">
                  <div className="flex items-start justify-between gap-4 mb-3">
                    <div className="min-w-0">
                      <p className="font-mono text-[var(--text-primary)] text-sm font-medium truncate">{file.path}</p>
                      <p className="text-xs text-[var(--text-tertiary)] mt-0.5">
                        Last author: <span className="text-[var(--text-secondary)]">@{file.last_author}</span>
                        {' · '}
                        <span className={file.author_status === 'inactive' ? 'text-red-400' : 'text-emerald-400'}>{file.author_status}</span>
                      </p>
                    </div>
                    <span className={`badge badge-${file.risk_level} flex-shrink-0 text-[10px]`}>{file.risk_level}</span>
                  </div>

                  <div className="bg-[var(--bg-elevated)] border border-[var(--border-subtle)] rounded-xl p-3.5 mb-3">
                    <p className="text-xs text-amber-400 font-mono mb-1">VERDICT: {file.verdict}</p>
                    {file.origin_context && <p className="text-xs text-[var(--text-tertiary)] leading-relaxed">{file.origin_context}</p>}
                  </div>

                  <div className="flex items-center gap-4 text-xs text-[var(--text-tertiary)]">
                    <span>Bus factor: <span className="font-mono text-[var(--text-secondary)]">{(file.bus_factor_score * 100).toFixed(0)}%</span></span>
                    {file.still_imported_by.length > 0 && (
                      <span className="text-red-400">⚠ Still imported by {file.still_imported_by.length} file(s)</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Unwritten Rules ────────────────────────────────────────────────── */}
      {activeTab === 'conventions' && (
        <div className="space-y-4">
          <div className="glass-card p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-base font-semibold text-[var(--text-primary)] mb-1 tracking-tight">Unwritten Rules</h2>
                <p className="text-xs text-[var(--text-secondary)] leading-relaxed max-w-xl">
                  Surfaces hidden coding standards and review patterns that your team follows but never wrote down.
                </p>
              </div>
              <button onClick={generateConventions} disabled={loadingConventions} className="btn-primary text-xs px-4 py-2 flex-shrink-0">
                {loadingConventions
                  ? <><span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />Extracting…</>
                  : 'Extract Rules'}
              </button>
            </div>
          </div>

          {loadingConventions && (
            <div className="glass-card p-10 text-center animate-fade-in">
              <div className="w-12 h-12 rounded-2xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center mx-auto mb-4">
                <span className="w-5 h-5 border-2 border-violet-500/30 border-t-violet-400 rounded-full animate-spin" />
              </div>
              <p className="font-semibold text-[var(--text-primary)] mb-1.5">Analyzing PR reviews…</p>
              <div className="space-y-1 text-xs text-[var(--text-tertiary)] font-mono mt-3">
                <p>⟳ Scanning PR review comments</p>
                <p>⟳ Identifying recurring patterns</p>
                <p>⟳ Clustering into actionable rules</p>
              </div>
            </div>
          )}

          {conventions && !loadingConventions && (
            <div className="animate-fade-in space-y-3">
              <p className="text-xs text-[var(--text-secondary)] px-1">
                Analyzed <strong className="text-[var(--text-primary)]">{conventions.total_reviews_analyzed}</strong> reviews ·
                Found <strong className="text-violet-400">{conventions.rules.length}</strong> conventions
              </p>

              {conventions.rules.length === 0 && (
                <div className="glass-card p-10 text-center">
                  <p className="font-semibold text-[var(--text-primary)]">No strong patterns found</p>
                  <p className="text-sm text-[var(--text-secondary)] mt-1">Try ingesting more PRs with review comments.</p>
                </div>
              )}

              {conventions.rules.map(rule => {
                const catColors: Record<string, string> = {
                  error_handling: '#F87171', naming: '#FBBF24', file_structure: '#34D399',
                  testing: '#06B6D4', imports: '#8B5CF6', security: '#F97316', other: '#94A3B8',
                };
                const color = catColors[rule.category] ?? '#94A3B8';
                return (
                  <div key={rule.id} className="glass-card p-5 animate-fade-in" style={{ borderColor: `${color}22` }}>
                    <div className="flex items-start justify-between gap-4 mb-3">
                      <div>
                        <span className="text-[10px] font-mono uppercase tracking-wide px-2 py-0.5 rounded-md mb-2 inline-block"
                          style={{ background: `${color}14`, color }}>
                          {rule.category.replace(/_/g, ' ')}
                        </span>
                        <p className="text-sm font-semibold text-[var(--text-primary)] mt-1 leading-snug">{rule.rule}</p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="text-xs text-[var(--text-tertiary)]">{rule.evidence_count} occurrences</p>
                        <p className="text-xs font-mono mt-0.5" style={{ color }}>{(rule.confidence * 100).toFixed(0)}% confidence</p>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-1.5 mb-3">
                      {rule.enforced_by.map(e => (
                        <span key={e} className="text-[10px] px-2 py-0.5 rounded-md bg-[var(--bg-elevated)] text-[var(--text-tertiary)] border border-[var(--border-subtle)]">{e}</span>
                      ))}
                      {rule.evidence_prs.map(pr => (
                        <span key={pr} className="text-[10px] px-2 py-0.5 rounded-md bg-violet-500/10 text-violet-400 border border-violet-500/20">{pr}</span>
                      ))}
                    </div>

                    {rule.violations.length > 0 && (
                      <div className="mt-2 p-3 rounded-xl bg-red-500/5 border border-red-500/15">
                        <p className="text-xs text-red-400 font-semibold mb-1">⚠ {rule.violation_count} current violation(s):</p>
                        {rule.violations.slice(0, 3).map((v, i) => (
                          <p key={i} className="text-xs text-[var(--text-tertiary)] font-mono">• {v.file}: {v.description}</p>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
