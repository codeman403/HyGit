'use client';

import { useEffect } from 'react';
import Link from 'next/link';

export default function RepoError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[HyGit Repo Error]', error);
  }, [error]);

  return (
    <div className="animate-fade-in max-w-lg mx-auto mt-16">
      <div className="glass-card p-8 text-center">
        <p className="text-4xl mb-4">⚠️</p>
        <h2 className="text-xl font-bold text-white mb-2">Something went wrong</h2>
        <p className="text-[#64748b] text-sm mb-6 leading-relaxed">
          {error.message || 'An unexpected error occurred loading this repository.'}
        </p>
        <div className="flex gap-3 justify-center">
          <button onClick={reset} className="btn-primary text-sm">
            Try again
          </button>
          <Link href="/repos" className="btn-ghost text-sm">
            Back to repos
          </Link>
        </div>
      </div>
    </div>
  );
}
