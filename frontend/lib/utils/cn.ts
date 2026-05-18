// lib/utils/cn.ts — className merge helper (Tailwind + clsx)
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Format numbers with commas
export function formatNumber(n: number): string {
  return n.toLocaleString();
}

// Truncate string with ellipsis
export function truncate(str: string, length: number): string {
  return str.length > length ? `${str.slice(0, length)}...` : str;
}

// Relative time formatting
export function timeAgo(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return 'today';
  if (diffDays === 1) return '1 day ago';
  if (diffDays < 30) return `${diffDays} days ago`;
  const diffMonths = Math.floor(diffDays / 30);
  if (diffMonths === 1) return '1 month ago';
  if (diffMonths < 12) return `${diffMonths} months ago`;
  return `${Math.floor(diffMonths / 12)} years ago`;
}

// Source type icon mapping
export const SOURCE_ICONS: Record<string, string> = {
  code: '📄',
  pr: '🔀',
  issue: '🐛',
  commit: '⚡',
  pr_comment: '💬',
  wiki: '📚',
  rfc: '📋',
  slack: '💬',
};

// Source type color mapping
export const SOURCE_COLORS: Record<string, string> = {
  code: '#4f8ef7',
  pr: '#a855f7',
  issue: '#22d3ee',
  commit: '#34d399',
  pr_comment: '#fbbf24',
  wiki: '#f97316',
  default: '#94a3b8',
};
