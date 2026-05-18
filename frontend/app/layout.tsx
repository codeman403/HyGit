import type { Metadata } from 'next';
import { Providers } from '@/components/providers';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: 'HyGit — Every line has a story.',
    template: '%s | HyGit',
  },
  description:
    'Auto-generated Wikipedia for any GitHub repo. Powered by HydraDB context graphs. Discover WHY the code is the way it is.',
  keywords: ['github', 'documentation', 'code archaeology', 'HydraDB', 'knowledge graph', 'codebase'],
  openGraph: {
    title: 'HyGit — Every line has a story.',
    description: 'Auto-generated Wikipedia for any GitHub repo. Powered by HydraDB.',
    type: 'website',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800;900&family=Space+Grotesk:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600;700&display=swap" rel="stylesheet" />
      </head>
      <body className="antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
