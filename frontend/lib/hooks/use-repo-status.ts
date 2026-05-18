// lib/hooks/use-repo-status.ts — TanStack Query hooks for repo data
'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, type IngestRequest } from '@/lib/api/client';

// Query keys
export const repoKeys = {
  all: ['repos'] as const,
  detail: (id: string) => ['repos', id] as const,
  status: (id: string) => ['repos', id, 'status'] as const,
};

// List all repos
export function useRepos() {
  return useQuery({
    queryKey: repoKeys.all,
    queryFn: api.listRepos,
    refetchInterval: 5000, // Poll every 5s
  });
}

// Get repo status (polls during ingestion)
export function useRepoStatus(repoId: string, enabled = true) {
  return useQuery({
    queryKey: repoKeys.status(repoId),
    queryFn: () => api.getRepoStatus(repoId),
    enabled: enabled && !!repoId,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      // Poll more aggressively during ingestion
      if (status === 'ingesting' || status === 'pending') return 3000;
      return false; // Stop polling when ready/failed
    },
  });
}

// Ingest a repo
export function useIngestRepo() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: IngestRequest) => api.ingestRepo(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: repoKeys.all });
    },
  });
}

// Provenance query
export function useProvenance(repoId: string, filePath: string, enabled = false) {
  return useQuery({
    queryKey: ['provenance', repoId, filePath],
    queryFn: () => api.getProvenance(repoId, filePath),
    enabled: enabled && !!repoId && !!filePath,
    staleTime: 5 * 60 * 1000, // 5 min cache
  });
}

// Recovery report
export function useRecoveryReport(repoId: string, enabled = false) {
  return useQuery({
    queryKey: ['recovery', repoId],
    queryFn: () => api.getRecoveryReport(repoId),
    enabled: enabled && !!repoId,
    staleTime: 10 * 60 * 1000, // 10 min cache
  });
}

// Conventions report
export function useConventionsReport(repoId: string, enabled = false) {
  return useQuery({
    queryKey: ['conventions', repoId],
    queryFn: () => api.getConventionsReport(repoId),
    enabled: enabled && !!repoId,
    staleTime: 10 * 60 * 1000,
  });
}

// Graph data
export function useGraphData(repoId: string, enabled = false) {
  return useQuery({
    queryKey: ['graph', repoId],
    queryFn: () => api.getGraphData(repoId),
    enabled: enabled && !!repoId,
    staleTime: 5 * 60 * 1000,
  });
}
