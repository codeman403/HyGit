'use client';

// HydraDB Pipeline Visualizer — shows the recall pipeline steps in real-time
// Used on search and provenance pages to make HydraDB visible to judges

export interface PipelineStep {
  id: string;
  label: string;
  description: string;
  status: 'pending' | 'running' | 'done' | 'skip';
  icon: string;
}

interface HydraDBPipelineProps {
  steps: PipelineStep[];
  compact?: boolean;
}

export function HydraDBPipeline({ steps, compact = false }: HydraDBPipelineProps) {
  return (
    <div className={`space-y-${compact ? '1' : '2'}`}>
      {steps.map((step, i) => (
        <div
          key={step.id}
          className={`flex items-center gap-3 ${compact ? 'p-2' : 'p-3'} rounded-lg border transition-all ${
            step.status === 'running'
              ? 'bg-[#00E5FF]/10 border-[#00E5FF]/30'
              : step.status === 'done'
              ? 'bg-emerald-500/5 border-emerald-500/20'
              : step.status === 'skip'
              ? 'bg-transparent border-transparent opacity-40'
              : 'bg-transparent border-[#222222] opacity-60'
          }`}
        >
          {/* Step icon / status */}
          <div className="w-6 h-6 shrink-0 flex items-center justify-center">
            {step.status === 'running' ? (
              <svg className="animate-spin h-4 w-4 text-[#00F5D4]" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
            ) : step.status === 'done' ? (
              <span className="text-emerald-400 text-sm">✓</span>
            ) : (
              <span className="text-sm">{step.icon}</span>
            )}
          </div>

          {/* Step info */}
          <div className="flex-1 min-w-0">
            <p className={`font-medium ${compact ? 'text-xs' : 'text-[11px]'} break-words ${
              step.status === 'running' ? 'text-blue-300' :
              step.status === 'done' ? 'text-emerald-400' :
              'text-[#64748b]'
            }`}>
              {step.label}
            </p>
            {!compact && (
              <p className="text-[10px] text-[#475569] leading-relaxed mt-0.5 break-words">{step.description}</p>
            )}
          </div>

          {/* Connector arrow */}
          {i < steps.length - 1 && !compact && (
            <span className="text-[#222222] text-xs ml-auto">↓</span>
          )}
        </div>
      ))}
    </div>
  );
}

// Pre-built pipeline configurations
export const PROVENANCE_PIPELINE: PipelineStep[] = [
  {
    id: 'semantic',
    label: 'Semantic + graph recall',
    description: 'Trace file across PRs, issues, and discussions',
    status: 'pending',
    icon: '🧠',
  },
  {
    id: 'boolean',
    label: 'Exact filename search',
    description: 'Find file in all commits and review comments',
    status: 'pending',
    icon: '🔤',
  },
  {
    id: 'pr_scoped',
    label: 'PR-scoped search',
    description: 'Find the pull request that introduced this file',
    status: 'pending',
    icon: '🔀',
  },
  {
    id: 'llm',
    label: 'Synthesize narrative',
    description: 'Generate cited origin story with GPT-4o',
    status: 'pending',
    icon: '✍️',
  },
];

export const SEARCH_PIPELINE: PipelineStep[] = [
  {
    id: 'semantic',
    label: 'Semantic + graph recall',
    description: 'Hybrid retrieval across code, PRs, issues, and commits',
    status: 'pending',
    icon: '🧠',
  },
  {
    id: 'boolean',
    label: 'Exact term search',
    description: 'Match function names, PR numbers, error codes',
    status: 'pending',
    icon: '🔤',
  },
  {
    id: 'merge',
    label: 'Merge & deduplicate',
    description: 'Combine and rank results from all sources',
    status: 'pending',
    icon: '🔄',
  },
  {
    id: 'llm',
    label: 'Synthesize answer',
    description: 'Generate cited answer with GPT-4o',
    status: 'pending',
    icon: '✍️',
  },
];

export const SEARCH_PIPELINE_FAST: PipelineStep[] = [
  {
    id: 'semantic',
    label: 'Single-pass recall',
    description: 'Fast semantic retrieval, no graph traversal',
    status: 'pending',
    icon: '⚡',
  },
  {
    id: 'llm',
    label: 'Synthesize answer',
    description: 'Generate cited answer with GPT-4o-mini',
    status: 'pending',
    icon: '✍️',
  },
];

export const WIKI_PIPELINE: PipelineStep[] = [
  {
    id: 'recall',
    label: 'Cross-source recall',
    description: 'Retrieve code, PRs, issues, and commits for module',
    status: 'pending',
    icon: '🧠',
  },
  {
    id: 'graph',
    label: 'Graph relationships',
    description: 'Map entity connections across the codebase',
    status: 'pending',
    icon: '🕸️',
  },
  {
    id: 'llm',
    label: 'Generate article',
    description: 'Write cited Wikipedia-style article with GPT-4o',
    status: 'pending',
    icon: '📚',
  },
];
