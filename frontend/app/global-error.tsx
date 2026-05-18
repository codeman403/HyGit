'use client';

import { useEffect } from 'react';
import Link from 'next/link';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[HyGit Error]', error);
  }, [error]);

  return (
    <html lang="en">
      <body className="antialiased" style={{ background: '#000000', color: '#e2e8f0', fontFamily: 'Inter, system-ui, sans-serif' }}>
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
          <div style={{
            textAlign: 'center', maxWidth: 480,
            background: 'rgba(13,20,36,0.8)', border: '1px solid #222222',
            borderRadius: 12, padding: '2.5rem',
          }}>
            <p style={{ fontSize: 48, marginBottom: 16 }}>⚠️</p>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: '#fff', marginBottom: 8 }}>
              Something went wrong
            </h1>
            <p style={{ fontSize: 14, color: '#64748b', marginBottom: 24, lineHeight: 1.6 }}>
              {error.message || 'An unexpected error occurred.'}
              {error.digest && (
                <><br /><code style={{ fontSize: 12, color: '#475569' }}>Ref: {error.digest}</code></>
              )}
            </p>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
              <button
                onClick={reset}
                style={{
                  background: 'linear-gradient(135deg,#00E5FF,#7c3aed)', color: '#fff',
                  border: 'none', borderRadius: 8, padding: '10px 20px',
                  fontWeight: 600, cursor: 'pointer', fontSize: 14,
                }}
              >
                Try again
              </button>
              <Link
                href="/"
                style={{
                  background: 'transparent', color: '#94a3b8',
                  border: '1px solid #222222', borderRadius: 8, padding: '10px 20px',
                  fontWeight: 500, cursor: 'pointer', fontSize: 14,
                  textDecoration: 'none', display: 'inline-block',
                }}
              >
                Go home
              </Link>
            </div>
          </div>
        </div>
      </body>
    </html>
  );
}
