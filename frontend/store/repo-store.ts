// store/repo-store.ts — Zustand store for repo state
import { create } from 'zustand';
import type { Repo } from '@/lib/api/client';

interface RepoStore {
  repos: Record<string, Repo>;
  activeRepoId: string | null;
  setRepo: (repo: Repo) => void;
  setActiveRepo: (id: string) => void;
  getRepo: (id: string) => Repo | undefined;
  updateRepoStatus: (id: string, status: Repo['status'], stats?: Record<string, number>) => void;
}

export const useRepoStore = create<RepoStore>((set, get) => ({
  repos: {},
  activeRepoId: null,

  setRepo: (repo) =>
    set((state) => ({
      repos: { ...state.repos, [repo.repo_id]: repo },
    })),

  setActiveRepo: (id) => set({ activeRepoId: id }),

  getRepo: (id) => get().repos[id],

  updateRepoStatus: (id, status, stats) =>
    set((state) => {
      const existing = state.repos[id];
      if (!existing) return state;
      return {
        repos: {
          ...state.repos,
          [id]: { ...existing, status, ...(stats ? { stats } : {}) },
        },
      };
    }),
}));
