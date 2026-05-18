// Generic reusable UI components

// ─── LoadingSpinner ────────────────────────────────────────────────────────────
export function LoadingSpinner({ size = 'md', color = 'blue' }: {
  size?: 'sm' | 'md' | 'lg';
  color?: string;
}) {
  const sizes = { sm: 'h-4 w-4', md: 'h-6 w-6', lg: 'h-10 w-10' };
  const colorMap: Record<string, string> = {
    blue: 'text-[#00F5D4]', purple: 'text-purple-400',
    amber: 'text-amber-400', green: 'text-emerald-400',
  };
  return (
    <svg
      className={`animate-spin ${sizes[size]} ${colorMap[color] ?? colorMap.blue}`}
      viewBox="0 0 24 24"
      fill="none"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
    </svg>
  );
}

// ─── EmptyState ────────────────────────────────────────────────────────────────
export function EmptyState({
  icon, title, description, action,
}: {
  icon?: string;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="glass-card p-12 text-center">
      {icon && <p className="text-4xl mb-4 animate-float">{icon}</p>}
      <p className="text-white font-semibold text-lg mb-2">{title}</p>
      {description && <p className="text-[#64748b] text-sm max-w-md mx-auto mb-6">{description}</p>}
      {action}
    </div>
  );
}

// ─── StatusBadge ───────────────────────────────────────────────────────────────
export function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    ready:     { label: '✓ Ready',     cls: 'badge-ready' },
    ingesting: { label: '⟳ Ingesting', cls: 'badge-ingesting' },
    pending:   { label: '◷ Pending',   cls: 'badge-pending' },
    failed:    { label: '✗ Failed',    cls: 'badge-failed' },
  };
  const s = map[status] ?? map.pending;
  return <span className={`badge ${s.cls}`}>{s.label}</span>;
}

// ─── SourceBadge ───────────────────────────────────────────────────────────────
export function SourceBadge({ type }: { type: string }) {
  const map: Record<string, { icon: string; color: string }> = {
    code:       { icon: '📄', color: '#00E5FF' },
    pr:         { icon: '🔀', color: '#9D4EDD' },
    issue:      { icon: '🐛', color: '#00F5D4' },
    commit:     { icon: '⚡', color: '#06D6A0' },
    pr_comment: { icon: '💬', color: '#fbbf24' },
  };
  const s = map[type] ?? { icon: '📝', color: '#94a3b8' };
  return (
    <span
      className="text-xs px-2 py-0.5 rounded font-mono inline-flex items-center gap-1"
      style={{ background: `${s.color}15`, color: s.color }}
    >
      {s.icon} {type}
    </span>
  );
}

// ─── ProgressBar ───────────────────────────────────────────────────────────────
export function ProgressBar({ value, max = 100 }: { value: number; max?: number }) {
  const pct = Math.min(100, Math.round((value / max) * 100));
  return (
    <div className="h-0.5 bg-[#222222] rounded-full overflow-hidden">
      <div className="progress-bar h-full" style={{ width: `${pct}%` }} />
    </div>
  );
}

// ─── Skeleton ──────────────────────────────────────────────────────────────────
export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`skeleton ${className}`} />;
}

// ─── ErrorAlert ────────────────────────────────────────────────────────────────
export function ErrorAlert({ message }: { message: string }) {
  return (
    <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm flex items-start gap-2">
      <span className="shrink-0">⚠️</span>
      <span>{message}</span>
    </div>
  );
}

// ─── InfoBox ───────────────────────────────────────────────────────────────────
export function InfoBox({
  icon, label, value, color = '#00E5FF',
}: {
  icon: string; label: string; value: string | number; color?: string;
}) {
  return (
    <div className="glass-card p-5">
      <p className="text-2xl mb-2">{icon}</p>
      <p className="text-2xl font-bold font-mono" style={{ color }}>{value}</p>
      <p className="text-xs text-[#64748b] mt-1">{label}</p>
    </div>
  );
}
