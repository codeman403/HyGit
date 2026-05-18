import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  turbopack: {
    resolveAlias: {
      '@/*': ['./*'],
    },
  },
};

export default nextConfig;
