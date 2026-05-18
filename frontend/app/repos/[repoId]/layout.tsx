'use client';

import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { api } from '@/lib/api/client';

const NAV_ITEMS = [
  {
    name: 'Overview',
    href: (id: string) => `/repos/${id}`,
    icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>,
  },
  {
    name: 'Wiki Browser',
    href: (id: string) => `/repos/${id}/wiki`,
    icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>,
  },
  {
    name: 'Reports',
    href: (id: string) => `/repos/${id}/reports`,
    icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>,
  },
  {
    name: 'Knowledge Graph',
    href: (id: string) => `/repos/${id}/graph`,
    icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>,
  },
  {
    name: 'Live Query',
    href: (id: string) => `/repos/${id}/search`,
    icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>,
  },
];

export default function RepoLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ repoId: string }>;
}) {
  const { repoId } = use(params);
  const pathname = usePathname();
  const [repoLabel, setRepoLabel] = useState<string | null>(null);

  useEffect(() => {
    api.getRepoStatus(repoId).then(r => {
      if (r?.owner && r?.name) setRepoLabel(`${r.owner} / ${r.name}`);
    }).catch(() => {});
  }, [repoId]);

  return (
    <div className="min-h-screen bg-[var(--bg-base)] flex font-sans">
      {/* Sidebar */}
      <aside className="w-60 border-r border-[var(--border-subtle)] bg-[var(--bg-surface)] flex-col hidden md:flex flex-shrink-0">
        {/* Logo */}
        <div className="h-16 border-b border-[var(--border-subtle)] flex items-center px-5">
          <Link href="/" className="flex items-center gap-2.5">
            <div className="w-8 h-8 border border-white bg-black flex items-center justify-center">
              <span className="text-white font-extrabold text-[11px] font-mono">HG</span>
            </div>
            <span className="font-extrabold uppercase tracking-wider text-[var(--text-primary)] text-base font-mono">HYGIT</span>
          </Link>
        </div>

        {/* Workspace info */}
        <div className="px-4 pt-5 pb-3">
          <p className="section-label text-[10px] px-2 mb-1">( workspace )</p>
          <p className="text-xs text-[var(--text-secondary)] px-2 truncate">
            {repoLabel ?? <span className="opacity-30">—</span>}
          </p>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 pb-4 space-y-0.5">
          {NAV_ITEMS.map(item => {
            const href = item.href(repoId);
            const isActive = pathname === href;
            return (
              <Link key={item.name} href={href} className={`sidebar-item${isActive ? ' active' : ''}`}>
                <span className={`flex-shrink-0 ${isActive ? 'text-[var(--accent)]' : 'text-[var(--text-tertiary)]'}`}>
                  {item.icon}
                </span>
                {item.name}
              </Link>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="p-4 border-t border-[var(--border-subtle)]">
          <Link href="/repos" className="sidebar-item text-xs">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="15 18 9 12 15 6"/>
            </svg>
            All workspaces
          </Link>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Topbar */}
        <header className="h-16 border-b border-[var(--border-subtle)] bg-[var(--bg-base)]/80 backdrop-blur-xl flex items-center px-8 sticky top-0 z-40">
          <div className="flex items-center gap-2 text-xs text-[var(--text-tertiary)]">
            <Link href="/repos" className="hover:text-[var(--text-secondary)] transition-colors">Workspaces</Link>
            <span>/</span>
            <span className="text-[var(--text-primary)] font-medium">
              {repoLabel ?? <span className="opacity-30">—</span>}
            </span>
          </div>
        </header>

        <div className="p-8 flex-1 overflow-y-auto">
          <div className="max-w-5xl mx-auto">
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}
