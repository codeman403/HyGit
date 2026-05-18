'use client';

import { useState, use, useEffect, useRef, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { api, type GraphData } from '@/lib/api/client';

const ForceGraph2D = dynamic(() => import('react-force-graph-2d'), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-full">
      <div className="text-center">
        <span className="w-8 h-8 border-2 border-indigo-500/30 border-t-indigo-400 rounded-full animate-spin block mx-auto mb-3" />
        <p className="text-sm text-[var(--text-secondary)]">Loading graph engine…</p>
      </div>
    </div>
  ),
});

const NODE_COLORS: Record<string, string> = {
  code:         '#6366F1',
  pr:           '#8B5CF6',
  issue:        '#06B6D4',
  commit:       '#10B981',
  person:       '#F59E0B',
  module:       '#F97316',
  project:      '#A78BFA',
  organization: '#EC4899',
  default:      '#64748B',
};

type GraphNode = { id: string; label: string; type: string; color?: string; val?: number; x?: number; y?: number };
type GraphLink = { source: string | GraphNode; target: string | GraphNode; label?: string; value?: number };

export default function GraphPage({ params }: { params: Promise<{ repoId: string }> }) {
  const { repoId } = use(params);
  const [graphData, setGraphData] = useState<GraphData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [hoveredLink, setHoveredLink] = useState<GraphLink | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dims, setDims] = useState({ w: 900, h: 540 });

  useEffect(() => {
    const obs = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect;
      setDims({ w: Math.floor(width), h: Math.floor(height) });
    });
    if (containerRef.current) obs.observe(containerRef.current);
    return () => obs.disconnect();
  }, []);

  const loadGraph = async () => {
    setLoading(true); setError('');
    try { const data = await api.getGraphData(repoId); setGraphData(data); }
    catch (err) { setError(err instanceof Error ? err.message : 'Failed to load graph'); }
    finally { setLoading(false); }
  };

  // Auto-load on mount
  // eslint-disable-next-line react-hooks/exhaustive-deps, react-hooks/set-state-in-effect
  useEffect(() => { void loadGraph(); }, [repoId]);

  const forceData = useMemo(() => graphData ? {
    nodes: graphData.nodes.map(n => ({
      ...n,
      color: NODE_COLORS[n.type.toLowerCase()] ?? NODE_COLORS.default,
      val: n.type === 'module' ? 4 : n.type === 'person' ? 3 : n.type === 'project' ? 3 : 2,
    })),
    links: graphData.edges.map(e => ({
      source: e.source,
      target: e.target,
      label: e.relation,
      value: e.weight,
    })),
  } : null, [graphData]);

  return (
    <div className="animate-fade-in space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <span className="section-label text-[10px]">( Knowledge Graph )</span>
          <h1 className="text-xl font-bold text-[var(--text-primary)] mt-1.5 tracking-tight">Visual Knowledge Map</h1>
          <p className="text-sm text-[var(--text-secondary)] mt-0.5">Entity relationships extracted by HydraDB from the ingested repository</p>
        </div>
        <button onClick={loadGraph} disabled={loading} className="btn-primary text-xs px-4 py-2 flex-shrink-0">
          {loading
            ? <><span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin inline-block mr-2" />Loading…</>
            : '↻ Refresh'}
        </button>
      </div>

      {error && (
        <div className="px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">{error}</div>
      )}

      {/* Legend */}
      <div className="flex flex-wrap gap-3 items-center">
        {Object.entries(NODE_COLORS).filter(([k]) => k !== 'default').map(([type, color]) => (
          <span key={type} className="flex items-center gap-1.5 text-xs text-[var(--text-secondary)]">
            <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: color }} />
            {type}
          </span>
        ))}
        <span className="flex items-center gap-1.5 text-xs text-[var(--text-secondary)] ml-2 pl-2 border-l border-[var(--border-subtle)]">
          <span className="w-6 h-px" style={{ background: 'rgba(148,163,184,0.5)' }} />
          relationship
        </span>
      </div>

      {/* Graph canvas */}
      <div ref={containerRef} className="graph-container relative" style={{ height: 540 }}>
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center z-10">
            <div className="text-center">
              <span className="w-10 h-10 border-2 border-indigo-500/30 border-t-indigo-400 rounded-full animate-spin block mx-auto mb-3" />
              <p className="text-[var(--text-primary)]">Building graph from HydraDB context…</p>
            </div>
          </div>
        )}

        {!forceData && !loading && !error && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center">
              <div className="w-14 h-14 rounded-2xl bg-[var(--bg-elevated)] border border-[var(--border-subtle)] flex items-center justify-center mx-auto mb-4">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="1.5"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
              </div>
              <p className="text-sm font-semibold text-[var(--text-primary)] mb-1">No graph data yet</p>
              <p className="text-xs text-[var(--text-secondary)] mb-4">Click Refresh to build the knowledge graph</p>
              <button onClick={loadGraph} className="btn-primary text-xs px-4 py-2">Build Graph</button>
            </div>
          </div>
        )}

        {forceData && !loading && (
          <ForceGraph2D
            graphData={forceData}
            backgroundColor="transparent"
            width={dims.w}
            height={dims.h}
            // Node appearance
            nodeLabel={node => `${(node as GraphNode).label} (${(node as GraphNode).type})`}
            nodeColor={node => (node as GraphNode).color ?? '#64748b'}
            // Link appearance — arrows + particles make edges clearly visible
            linkColor={link => link === hoveredLink ? 'rgba(148,163,184,0.85)' : 'rgba(148,163,184,0.3)'}
            linkWidth={link => link === hoveredLink ? 2 : 1}
            linkDirectionalArrowLength={5}
            linkDirectionalArrowRelPos={1}
            linkDirectionalArrowColor={() => 'rgba(148,163,184,0.65)'}
            linkDirectionalParticles={2}
            linkDirectionalParticleWidth={2}
            linkDirectionalParticleSpeed={0.004}
            linkDirectionalParticleColor={() => 'rgba(99,102,241,0.9)'}
            linkLabel={link => (link as GraphLink).label ?? ''}
            onLinkHover={(link) => setHoveredLink(link as GraphLink | null)}
            // Draw edge relation labels at zoom ≥ 1.5×
            linkCanvasObjectMode={() => 'after'}
            linkCanvasObject={(link, ctx, globalScale) => {
              if (globalScale < 1.5) return;
              const l = link as GraphLink & { source: GraphNode; target: GraphNode };
              if (typeof l.source === 'string' || typeof l.target === 'string') return;
              if (l.source?.x == null || l.source?.y == null || l.target?.x == null || l.target?.y == null) return;
              const mx = (l.source.x + l.target.x) / 2;
              const my = (l.source.y + l.target.y) / 2;
              const fontSize = Math.max(6, 9 / globalScale);
              ctx.font = `${fontSize}px Inter, sans-serif`;
              ctx.fillStyle = 'rgba(148,163,184,0.8)';
              ctx.textAlign = 'center';
              ctx.textBaseline = 'middle';
              ctx.fillText((l.label ?? '').replace(/_/g, ' ').toLowerCase(), mx, my);
            }}
            // Draw nodes with glow + label
            nodeCanvasObject={(node, ctx, globalScale) => {
              const n = node as GraphNode;
              if (n.x == null || n.y == null) return;
              const baseColor = NODE_COLORS[n.type?.toLowerCase()] ?? NODE_COLORS.default;
              const r = n.type === 'module' ? 7 : n.type === 'person' ? 6 : n.type === 'project' ? 6 : 5;
              // Soft glow halo
              ctx.beginPath();
              ctx.arc(n.x, n.y, r + 3, 0, 2 * Math.PI);
              ctx.fillStyle = baseColor + '22';
              ctx.fill();
              // Solid node
              ctx.beginPath();
              ctx.arc(n.x, n.y, r, 0, 2 * Math.PI);
              ctx.fillStyle = baseColor;
              ctx.fill();
              // Label
              if (globalScale > 0.55) {
                const sz = Math.max(7, 10 / globalScale);
                ctx.font = `${sz}px Inter, sans-serif`;
                ctx.fillStyle = 'rgba(203,213,225,0.9)';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'top';
                ctx.fillText(n.label?.slice(0, 20) ?? '', n.x, n.y + r + 2);
              }
            }}
          />
        )}
      </div>

      {/* Stats */}
      {graphData && (
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'Entities',      value: graphData.total_nodes, color: 'text-indigo-400' },
            { label: 'Relationships', value: graphData.total_edges, color: 'text-violet-400' },
            { label: 'Entity Types',  value: [...new Set(graphData.nodes.map(n => n.type))].length, color: 'text-cyan-400' },
          ].map(s => (
            <div key={s.label} className="glass-card p-4 text-center">
              <p className={`text-2xl font-bold font-mono ${s.color}`}>{s.value}</p>
              <p className="text-xs text-[var(--text-secondary)] mt-1">{s.label}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
