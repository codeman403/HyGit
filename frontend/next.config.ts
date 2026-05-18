import type { NextConfig } from 'next';
import path from 'path';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  turbopack: {
    resolveAlias: {
      '@': path.resolve(__dirname),
    },
  },
};

export default nextConfig;
