'use client';

import { useState, useEffect, useRef, ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod/v4';
import { api } from '@/lib/api/client';
import { motion, useScroll, useTransform, useInView, AnimatePresence } from 'framer-motion';

const ingestSchema = z.object({
  github_url: z.string().min(1, 'Required').transform(v => v.trim())
    .refine(v => /^(https?:\/\/github\.com\/)?[\w.-]+\/[\w.-]+$/.test(v), {
      message: 'Enter a valid GitHub repository URL',
    }),
});
type IngestForm = z.infer<typeof ingestSchema>;

const QUICK_REPOS = ['fastify/fastify', 'pallets/flask', 'honojs/hono'];

const SERVICES = [
  { num: '01', title: 'KNOWLEDGE GRAPH CONSTRUCTION', desc: 'We analyze your entire repository — commits, PRs, issues, and source code — to construct a high-fidelity multi-hop knowledge graph that links every artifact back to its historical origin.' },
  { num: '02', title: 'AUTOMATED WIKI GENERATION', desc: 'Generates encyclopedic documentation for every module with strict citations grounded in historical pull requests and commits. Documentation that explains the why, not just the what.' },
  { num: '03', title: 'PROVENANCE TRACING', desc: 'Input any file path to execute a multi-hop HydraDB query — surfacing the exact decisions, pull requests, and contributors that led to its creation.' },
  { num: '04', title: 'AI-POWERED REPORTS', desc: 'Generate comprehensive AI-authored reports on code quality, architectural decisions, technical debt, contributor patterns, and codebase evolution over time.' },
  { num: '05', title: 'LIVE SEMANTIC SEARCH', desc: 'Ask natural language questions about your codebase. HyGit performs semantic search over the knowledge graph and returns cited, structured answers grounded in actual history.' },
];
const FAQ_ITEMS = [
  { q: 'WHAT IS A PROVENANCE GRAPH?', a: 'A provenance graph links every code artifact — files, functions, modules — back to the exact commits, pull requests, and issues that caused them to exist. It answers "why does this code look the way it does?"' },
  { q: 'WHICH REPOSITORIES ARE SUPPORTED?', a: 'Any public GitHub repository. Private repos require a personal access token with read permissions on the repository.' },
  { q: 'HOW LONG DOES INGESTION TAKE?', a: 'Most repositories are fully ingested and ready to explore in under 60 seconds. Large repos with 10k+ commits may take a few minutes.' },
  { q: 'IS MY DATA STORED PERMANENTLY?', a: 'Repository data is stored in HydraDB for the lifetime of your workspace. You can delete a workspace at any time to remove all associated data.' },
  { q: 'CAN I QUERY THE GRAPH PROGRAMMATICALLY?', a: 'Yes. HyGit exposes a REST API and a graph query endpoint that supports multi-hop traversals in plain natural language.' },
  { q: 'WILL HYGIT REPLACE WRITING DOCUMENTATION?', a: 'For internal and architectural documentation, largely yes. HyGit generates cited, always-current docs from your actual commit history — no manual upkeep required.' },
];

/* Inline style helpers */
const mw: React.CSSProperties = { maxWidth: 1240, margin: '0 auto', padding: '0 40px' };
const mono: React.CSSProperties = { fontFamily: "'JetBrains Mono', monospace" };
const label: React.CSSProperties = { ...mono, fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--accent)', opacity: 0.85 };
const h2style: React.CSSProperties = { fontSize: 'clamp(30px,4vw,50px)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '-0.01em', lineHeight: 1.06, color: 'var(--text-primary)', margin: 0 };

/* ── Scroll Components ─────────────────────────────────────────────────────── */
function ScrollProgress() {
  const { scrollYProgress } = useScroll();
  const scaleX = useTransform(scrollYProgress, [0, 1], [0, 1]);
  return <motion.div style={{ position: 'fixed', top: 0, left: 0, right: 0, height: 2, background: 'var(--text-primary)', transformOrigin: '0%', scaleX, zIndex: 100 }} />;
}

function Reveal({ children, delay = 0, y = 28, className }: { children: ReactNode, delay?: number, y?: number, className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: "-60px" });
  return (
    <motion.div ref={ref} className={className} initial={{ opacity: 0, y }} animate={isInView ? { opacity: 1, y: 0 } : {}} transition={{ duration: 0.65, delay, ease: [0.16, 1, 0.3, 1] }}>
      {children}
    </motion.div>
  );
}

function Typewriter({ text }: { text: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const isInView = useInView(ref, { once: true, margin: "-40px" });
  const [displayed, setDisplayed] = useState("");
  useEffect(() => {
    if (!isInView) return;
    let i = 0;
    const id = setInterval(() => {
      setDisplayed(text.slice(0, i + 1));
      i++;
      if (i >= text.length) clearInterval(id);
    }, 20);
    return () => clearInterval(id);
  }, [isInView, text]);
  return (
    <span ref={ref}>
      <span>{displayed}</span>
      <motion.span animate={{ opacity: [1, 0] }} transition={{ duration: 0.5, repeat: Infinity }}>|</motion.span>
      <span style={{ opacity: 0 }}>{text.slice(displayed.length)}</span>
    </span>
  );
}

function FlashStat({ val }: { val: string; delay?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const isInView = useInView(ref, { once: false, margin: '-80px' });
  const [color, setColor] = useState('#FFFFFF');
  const prevInView = useRef(false);

  useEffect(() => {
    if (isInView && !prevInView.current) {
      const hue = 180 + Math.random() * 80;
      const neon = `hsl(${hue}, 90%, 65%)`;
      setColor(neon);
      const id = setTimeout(() => setColor('#FFFFFF'), 900);
      prevInView.current = true;
      return () => clearTimeout(id);
    }
    if (!isInView) prevInView.current = false;
  }, [isInView]);

  return (
    <span ref={ref} style={{
      fontSize: 56, fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1, marginBottom: 14, display: 'block',
      color,
      transition: 'color 0.9s ease, text-shadow 0.9s ease',
      textShadow: color !== '#FFFFFF' ? `0 0 40px ${color}99` : 'none',
    }}>
      {val}
    </span>
  );
}

function SyncColorText({ children, isGradient = false }: { children: ReactNode, isGradient?: boolean }) {
  const [time, setTime] = useState(0);

  useEffect(() => {
    let animationFrameId: number;
    const animate = (t: number) => {
      setTime(t);
      animationFrameId = requestAnimationFrame(animate);
    };
    animationFrameId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animationFrameId);
  }, []);

  const cycle = (Math.sin(time * 0.0005) + 1) / 2;
  const saturation = Math.round(cycle * 100);
  const baseHue = 180 + (Math.sin(time * 0.0003) * 60);

  const hue = isGradient ? baseHue + 40 : baseHue;
  const lightness1 = isGradient ? 70 - (cycle * 20) : 100 - (cycle * 30);
  const color = `hsl(${hue}, ${saturation}%, ${lightness1}%)`;
  return <span style={{ color }}>{children}</span>;

}

/* ── SVG hero network ──────────────────────────────────────────────────────── */
function GraphHero() {
  const [time, setTime] = useState(0);

  useEffect(() => {
    let animationFrameId: number;
    const animate = (t: number) => {
      setTime(t);
      animationFrameId = requestAnimationFrame(animate);
    };
    animationFrameId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animationFrameId);
  }, []);

  // Sleek Horizontal Knowledge Tree (AST / File structure aesthetic)
  const baseNodes = [
    { id: 0, x: 80, y: 300, r: 12, fill: '#FFFFFF' }, // Root
    
    // Level 1
    { id: 1, x: 220, y: 140, r: 8, fill: '#CCCCCC', parent: 0 },
    { id: 2, x: 220, y: 300, r: 8, fill: '#FFFFFF', parent: 0 },
    { id: 3, x: 220, y: 460, r: 8, fill: '#CCCCCC', parent: 0 },

    // Level 2 (from 1)
    { id: 4, x: 360, y: 80,  r: 5, fill: '#AAAAAA', parent: 1 },
    { id: 5, x: 360, y: 140, r: 5, fill: '#AAAAAA', parent: 1 },
    { id: 6, x: 360, y: 200, r: 5, fill: '#AAAAAA', parent: 1 },

    // Level 2 (from 2)
    { id: 7, x: 360, y: 270, r: 6, fill: '#CCCCCC', parent: 2 },
    { id: 8, x: 360, y: 330, r: 6, fill: '#CCCCCC', parent: 2 },

    // Level 2 (from 3)
    { id: 9, x: 360, y: 420, r: 5, fill: '#AAAAAA', parent: 3 },
    { id: 10, x: 360, y: 500, r: 5, fill: '#AAAAAA', parent: 3 },

    // Level 3 (fine leaf nodes)
    { id: 11, x: 500, y: 60,  r: 3, fill: '#888888', parent: 4 },
    { id: 12, x: 500, y: 100, r: 3, fill: '#888888', parent: 4 },
    { id: 13, x: 500, y: 140, r: 3, fill: '#888888', parent: 5 },
    { id: 14, x: 500, y: 200, r: 3, fill: '#888888', parent: 6 },
    { id: 15, x: 500, y: 250, r: 4, fill: '#AAAAAA', parent: 7 },
    { id: 16, x: 500, y: 290, r: 4, fill: '#AAAAAA', parent: 7 },
    { id: 17, x: 500, y: 330, r: 4, fill: '#AAAAAA', parent: 8 },
    { id: 18, x: 500, y: 400, r: 3, fill: '#888888', parent: 9 },
    { id: 19, x: 500, y: 440, r: 3, fill: '#888888', parent: 9 },
    { id: 20, x: 500, y: 480, r: 3, fill: '#888888', parent: 10 },
    { id: 21, x: 500, y: 520, r: 3, fill: '#888888', parent: 10 },
  ];

  // Cycle from 0 to 1 over time (approx 12.5 seconds per full cycle)
  const cycle = (Math.sin(time * 0.0005) + 1) / 2;
  const saturation = Math.round(cycle * 100);
  const baseHue = 180 + (Math.sin(time * 0.0003) * 60); // Shifts between hue 120 and 240

  // Apply minimal vertical organic sway and color mapping
  const nodes = baseNodes.map((n, i) => {
    const phaseY = i * 0.5;
    const y = n.y + Math.sin(time * 0.0008 + phaseY) * 8;
    
    let lightness = 50;
    if (n.fill === '#FFFFFF') lightness = 100;
    if (n.fill === '#CCCCCC') lightness = 80;
    if (n.fill === '#AAAAAA') lightness = 66;
    if (n.fill === '#888888') lightness = 53;

    // Slightly darken lightness when colored to make neon colors pop, but keep it bright for grayscale
    const currentLightness = lightness - (cycle * 15);
    const nodeHue = baseHue + (i * 4); // Gradient shift across the tree
    const fill = `hsl(${nodeHue}, ${saturation}%, ${currentLightness}%)`;

    return { ...n, y, fill };
  });

  return (
    <svg viewBox="0 0 600 600" fill="none" preserveAspectRatio="xMidYMid slice"
      style={{ width: '100%', height: '100%', position: 'absolute', inset: 0 }}>
      
      <defs>
        <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="6" result="coloredBlur"/>
          <feMerge>
            <feMergeNode in="coloredBlur"/>
            <feMergeNode in="SourceGraphic"/>
          </feMerge>
        </filter>
      </defs>

      <g filter="url(#glow)">
        {/* Horizontal bezier curve braces */}
        {nodes.map(n => {
          if (n.parent === undefined) return null;
          const p = nodes[n.parent];
          const midX = (p.x + n.x) / 2;
          
          const edgeLightness = p.id === 0 ? 30 : 20;
          const strokeOpacity = 0.15 + (cycle * 0.25);
          const stroke = `hsla(${baseHue}, ${saturation}%, ${edgeLightness + (cycle * 20)}%, ${strokeOpacity})`;

          return (
            <path 
              key={`edge-${n.id}`} 
              d={`M ${p.x} ${p.y} C ${midX} ${p.y}, ${midX} ${n.y}, ${n.x} ${n.y}`} 
              stroke={stroke} 
              strokeWidth={p.id === 0 ? 2 : 1.5} 
            />
          );
        })}

        {/* Pulsing tree nodes */}
        {nodes.map(n => (
          <circle key={`node-${n.id}`} cx={n.x} cy={n.y} r={n.r} fill={n.fill}>
            {n.id === 0 && <animate attributeName="r" values="12;14;12" dur="3s" repeatCount="indefinite" />}
          </circle>
        ))}
      </g>
    </svg>
  );
}

function FlashViz({ children, height }: { children: ReactNode, height?: number | string }) {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: false, margin: '-80px' });
  const [glow, setGlow] = useState(false);
  const [hue, setHue] = useState(200);
  const prevInView = useRef(false);

  useEffect(() => {
    if (isInView && !prevInView.current) {
      const h = 160 + Math.random() * 100;
      setHue(h);
      setGlow(true);
      const id = setTimeout(() => setGlow(false), 1200);
      prevInView.current = true;
      return () => clearTimeout(id);
    }
    if (!isInView) prevInView.current = false;
  }, [isInView]);

  return (
    <div ref={ref} style={{
      height: height ?? '100%', position: 'relative', overflow: 'hidden',
      border: `1px solid ${glow ? `hsl(${hue},80%,55%)` : 'var(--border-default)'}`,
      boxShadow: glow ? `0 0 40px hsl(${hue},80%,30%), inset 0 0 30px hsl(${hue},80%,10%)` : 'none',
      transition: 'border-color 1.2s ease, box-shadow 1.2s ease',
    }}>
      {children}
    </div>
  );
}

/* ── Service SVGs ─────────────────────────────────────────────── */
function ServiceViz({ num }: { num: string }) {
  let content;
  if (num === '01') {
    // Knowledge Graph Construction
    content = (
      <svg viewBox="0 0 400 300" fill="none" style={{ width: '100%', height: '100%', opacity: 0.8 }}>
        <g stroke="rgba(255,255,255,0.15)" strokeWidth="1.5">
          <line x1="200" y1="150" x2="100" y2="80" />
          <line x1="200" y1="150" x2="300" y2="90" />
          <line x1="200" y1="150" x2="150" y2="240" />
          <line x1="200" y1="150" x2="280" y2="220" />
          <line x1="100" y1="80" x2="150" y2="50" />
          <line x1="300" y1="90" x2="350" y2="120" />
          <line x1="150" y1="240" x2="80" y2="200" />
        </g>
        <circle cx="200" cy="150" r="14" fill="#FFFFFF">
          <animate attributeName="r" values="14;18;14" dur="4s" repeatCount="indefinite" />
        </circle>
        <circle cx="100" cy="80" r="8" fill="#CCCCCC">
          <animate attributeName="r" values="8;10;8" dur="3s" repeatCount="indefinite" />
        </circle>
        <circle cx="300" cy="90" r="10" fill="#AAAAAA">
          <animate attributeName="r" values="10;12;10" dur="3.5s" repeatCount="indefinite" />
        </circle>
        <circle cx="150" cy="240" r="8" fill="#888888" />
        <circle cx="280" cy="220" r="6" fill="#666666" />
        <circle cx="150" cy="50" r="5" fill="#555555" />
        <circle cx="350" cy="120" r="4" fill="#444444" />
        <circle cx="80" cy="200" r="5" fill="#555555" />
        <rect x="180" y="130" width="40" height="40" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="1" strokeDasharray="4 4">
          <animateTransform attributeName="transform" type="rotate" from="0 200 150" to="360 200 150" dur="20s" repeatCount="indefinite" />
        </rect>
      </svg>
    );
  } else if (num === '02') {
    // Automated Wiki Generation
    content = (
      <svg viewBox="0 0 400 300" fill="none" style={{ width: '100%', height: '100%', opacity: 0.8 }}>
        <rect x="80" y="40" width="240" height="220" fill="rgba(255,255,255,0.05)" stroke="rgba(255,255,255,0.2)" strokeWidth="1.5" />
        <rect x="100" y="60" width="120" height="12" fill="#FFFFFF" />
        <rect x="100" y="90" width="200" height="6" fill="rgba(255,255,255,0.4)">
          <animate attributeName="width" values="180;200;180" dur="4s" repeatCount="indefinite" />
        </rect>
        <rect x="100" y="105" width="180" height="6" fill="rgba(255,255,255,0.4)">
          <animate attributeName="width" values="180;150;180" dur="5s" repeatCount="indefinite" />
        </rect>
        <rect x="100" y="120" width="140" height="6" fill="rgba(255,255,255,0.4)" />
        
        <rect x="100" y="150" width="80" height="60" fill="rgba(255,255,255,0.1)" stroke="rgba(255,255,255,0.3)" strokeWidth="1" />
        <rect x="195" y="150" width="105" height="6" fill="rgba(255,255,255,0.3)">
          <animate attributeName="width" values="80;105;80" dur="3s" repeatCount="indefinite" />
        </rect>
        <rect x="195" y="165" width="90" height="6" fill="rgba(255,255,255,0.3)" />
        
        <path d="M 40 180 L 100 180" stroke="rgba(255,255,255,0.5)" strokeWidth="1.5" strokeDasharray="4 4">
          <animate attributeName="stroke-dashoffset" from="8" to="0" dur="1s" repeatCount="indefinite" />
        </path>
        <circle cx="40" cy="180" r="4" fill="#FFFFFF">
          <animate attributeName="opacity" values="1;0.3;1" dur="2s" repeatCount="indefinite" />
        </circle>
      </svg>
    );
  } else if (num === '03') {
    // Provenance Tracing
    content = (
      <svg viewBox="0 0 400 300" fill="none" style={{ width: '100%', height: '100%', opacity: 0.8 }}>
        <g stroke="rgba(255,255,255,0.1)" strokeWidth="1.5">
          <path d="M 320 150 C 260 150, 260 80, 200 80" />
          <path d="M 320 150 C 260 150, 260 220, 200 220" />
          <path d="M 200 80 C 140 80, 140 50, 80 50" />
          <path d="M 200 80 C 140 80, 140 110, 80 110" />
          <path d="M 200 220 C 140 220, 140 190, 80 190" />
        </g>
        <g stroke="#FFFFFF" strokeWidth="2" strokeDasharray="6 6">
          <animate attributeName="stroke-dashoffset" from="12" to="0" dur="1s" repeatCount="indefinite" />
          <path d="M 320 150 C 260 150, 260 220, 200 220" />
          <path d="M 200 220 C 140 220, 140 250, 80 250" />
        </g>
        <rect x="310" y="140" width="20" height="20" fill="#FFFFFF">
          <animate attributeName="opacity" values="0.8;1;0.8" dur="2s" repeatCount="indefinite" />
        </rect>
        <rect x="190" y="70" width="20" height="20" fill="rgba(255,255,255,0.2)" stroke="rgba(255,255,255,0.5)" />
        <rect x="190" y="210" width="20" height="20" fill="rgba(255,255,255,0.5)" />
        <rect x="70" y="40" width="20" height="20" fill="rgba(255,255,255,0.1)" stroke="rgba(255,255,255,0.3)" />
        <rect x="70" y="100" width="20" height="20" fill="rgba(255,255,255,0.1)" stroke="rgba(255,255,255,0.3)" />
        <rect x="70" y="180" width="20" height="20" fill="rgba(255,255,255,0.1)" stroke="rgba(255,255,255,0.3)" />
        <rect x="70" y="240" width="20" height="20" fill="#CCCCCC">
          <animate attributeName="opacity" values="1;0.5;1" dur="2s" repeatCount="indefinite" />
        </rect>
      </svg>
    );
  } else if (num === '04') {
    // AI-Powered Reports
    content = (
      <svg viewBox="0 0 400 300" fill="none" style={{ width: '100%', height: '100%', opacity: 0.8 }}>
        <rect x="60" y="50" width="280" height="200" fill="rgba(255,255,255,0.03)" stroke="rgba(255,255,255,0.15)" strokeWidth="1" />
        <line x1="60" y1="90" x2="340" y2="90" stroke="rgba(255,255,255,0.1)" strokeWidth="1" />
        <rect x="80" y="65" width="60" height="10" fill="#FFFFFF" />
        <rect x="150" y="67" width="40" height="6" fill="rgba(255,255,255,0.3)" />
        
        {/* Bar chart */}
        <rect x="80" y="180" width="20" height="40" fill="rgba(255,255,255,0.2)" />
        <rect x="110" y="150" width="20" height="70" fill="rgba(255,255,255,0.4)">
          <animate attributeName="height" values="70;80;70" dur="3s" repeatCount="indefinite" />
          <animate attributeName="y" values="150;140;150" dur="3s" repeatCount="indefinite" />
        </rect>
        <rect x="140" y="120" width="20" height="100" fill="#FFFFFF">
          <animate attributeName="height" values="100;120;100" dur="4s" repeatCount="indefinite" />
          <animate attributeName="y" values="120;100;120" dur="4s" repeatCount="indefinite" />
        </rect>
        <rect x="170" y="160" width="20" height="60" fill="rgba(255,255,255,0.3)" />
        
        {/* Line chart */}
        <rect x="220" y="110" width="100" height="110" fill="rgba(255,255,255,0.05)" stroke="rgba(255,255,255,0.1)" strokeWidth="1" />
        <polyline points="220,190 250,170 280,180 320,130" stroke="#FFFFFF" strokeWidth="2" />
        <circle cx="320" cy="130" r="3" fill="#FFFFFF">
          <animate attributeName="r" values="3;6;3" dur="2s" repeatCount="indefinite" />
        </circle>
        <circle cx="250" cy="170" r="3" fill="#FFFFFF">
          <animate attributeName="r" values="3;5;3" dur="2s" begin="1s" repeatCount="indefinite" />
        </circle>
      </svg>
    );
  } else {
    // Live Semantic Search
    content = (
      <svg viewBox="0 0 400 300" fill="none" style={{ width: '100%', height: '100%', opacity: 0.8 }}>
        <rect x="80" y="60" width="240" height="40" fill="rgba(255,255,255,0.05)" stroke="#FFFFFF" strokeWidth="1.5" />
        <circle cx="105" cy="80" r="6" stroke="rgba(255,255,255,0.6)" strokeWidth="1.5" />
        <line x1="109" y1="84" x2="114" y2="89" stroke="rgba(255,255,255,0.6)" strokeWidth="1.5" />
        <rect x="125" y="76" width="120" height="8" fill="rgba(255,255,255,0.3)">
          <animate attributeName="width" values="120;130;120" dur="3s" repeatCount="indefinite" />
        </rect>
        <rect x="250" y="74" width="2" height="12" fill="#FFFFFF">
          <animate attributeName="opacity" values="1;0;1" dur="1s" repeatCount="indefinite" />
        </rect>
        
        <path d="M 200 100 L 200 130" stroke="rgba(255,255,255,0.3)" strokeWidth="1" strokeDasharray="4 4">
          <animate attributeName="stroke-dashoffset" from="8" to="0" dur="1s" repeatCount="indefinite" />
        </path>
        <path d="M 200 130 L 140 160" stroke="rgba(255,255,255,0.3)" strokeWidth="1" />
        <path d="M 200 130 L 260 160" stroke="rgba(255,255,255,0.3)" strokeWidth="1" />
        
        <rect x="90" y="160" width="100" height="60" fill="rgba(255,255,255,0.05)" stroke="rgba(255,255,255,0.2)" strokeWidth="1" />
        <rect x="100" y="175" width="80" height="4" fill="rgba(255,255,255,0.5)" />
        <rect x="100" y="190" width="60" height="4" fill="rgba(255,255,255,0.3)" />
        <rect x="100" y="200" width="70" height="4" fill="rgba(255,255,255,0.3)" />
        
        <rect x="210" y="160" width="100" height="60" fill="rgba(255,255,255,0.1)" stroke="#FFFFFF" strokeWidth="1">
          <animate attributeName="stroke" values="#FFFFFF;rgba(255,255,255,0.3);#FFFFFF" dur="2s" repeatCount="indefinite" />
        </rect>
        <rect x="220" y="175" width="80" height="4" fill="#FFFFFF" />
        <rect x="220" y="190" width="50" height="4" fill="rgba(255,255,255,0.6)" />
        <rect x="220" y="200" width="60" height="4" fill="rgba(255,255,255,0.6)" />
      </svg>
    );
  }

  return (
    <FlashViz>
      <div style={{ position: 'absolute', inset: 0, background: 'var(--bg-elevated)' }} />
      <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse at 40% 40%, rgba(255,255,255,0.04) 0%, transparent 65%)' }} />
      <div style={{ position: 'relative', zIndex: 2, width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {content}
      </div>
    </FlashViz>
  );
}

/* ── Process SVGs ─────────────────────────────────────────────── */
function ProcessViz({ num }: { num: string }) {
  let content;
  if (num === '1') {
    // Ingest: arrows pointing into a central repository block
    content = (
      <svg viewBox="0 0 400 220" fill="none" style={{ width: '100%', height: '100%', opacity: 0.8 }}>
        <rect x="160" y="70" width="80" height="80" fill="rgba(255,255,255,0.05)" stroke="#FFFFFF" strokeWidth="2">
          <animate attributeName="stroke-width" values="2;4;2" dur="2s" repeatCount="indefinite" />
        </rect>
        <path d="M 80 110 L 140 110 M 130 100 L 140 110 L 130 120" stroke="rgba(255,255,255,0.6)" strokeWidth="2">
          <animateTransform attributeName="transform" type="translate" values="-10 0; 5 0; -10 0" dur="2s" repeatCount="indefinite" />
        </path>
        <path d="M 320 110 L 260 110 M 270 100 L 260 110 L 270 120" stroke="rgba(255,255,255,0.6)" strokeWidth="2">
          <animateTransform attributeName="transform" type="translate" values="10 0; -5 0; 10 0" dur="2s" repeatCount="indefinite" />
        </path>
        <path d="M 200 30 L 200 50 M 190 40 L 200 50 L 210 40" stroke="rgba(255,255,255,0.6)" strokeWidth="2">
          <animateTransform attributeName="transform" type="translate" values="0 -10; 0 5; 0 -10" dur="2s" repeatCount="indefinite" />
        </path>
        
        <rect x="50" y="90" width="40" height="40" fill="rgba(255,255,255,0.1)" stroke="rgba(255,255,255,0.3)" />
        <rect x="310" y="90" width="40" height="40" fill="rgba(255,255,255,0.1)" stroke="rgba(255,255,255,0.3)" />
        <rect x="180" y="10" width="40" height="20" fill="rgba(255,255,255,0.1)" stroke="rgba(255,255,255,0.3)" />
        
        <circle cx="200" cy="110" r="10" fill="#FFFFFF">
          <animate attributeName="opacity" values="1;0.5;1" dur="1.5s" repeatCount="indefinite" />
        </circle>
        <circle cx="185" cy="95" r="4" fill="rgba(255,255,255,0.5)" />
        <circle cx="215" cy="125" r="6" fill="rgba(255,255,255,0.5)" />
      </svg>
    );
  } else if (num === '2') {
    // Build: layered graph structure
    content = (
      <svg viewBox="0 0 400 220" fill="none" style={{ width: '100%', height: '100%', opacity: 0.8 }}>
        <path d="M 100 170 L 200 50 L 300 170 Z" stroke="rgba(255,255,255,0.2)" strokeWidth="1" strokeDasharray="4 4">
          <animate attributeName="stroke-dashoffset" from="8" to="0" dur="1s" repeatCount="indefinite" />
        </path>
        <line x1="150" y1="110" x2="250" y2="110" stroke="rgba(255,255,255,0.4)" strokeWidth="1.5" />
        <line x1="200" y1="50" x2="200" y2="170" stroke="rgba(255,255,255,0.4)" strokeWidth="1.5" />
        <circle cx="200" cy="50" r="8" fill="#FFFFFF">
          <animate attributeName="r" values="8;11;8" dur="2s" repeatCount="indefinite" />
        </circle>
        <circle cx="150" cy="110" r="6" fill="#CCCCCC">
          <animate attributeName="r" values="6;8;6" dur="2s" begin="0.5s" repeatCount="indefinite" />
        </circle>
        <circle cx="250" cy="110" r="6" fill="#CCCCCC">
          <animate attributeName="r" values="6;8;6" dur="2s" begin="0.5s" repeatCount="indefinite" />
        </circle>
        <circle cx="100" cy="170" r="10" fill="#888888">
          <animate attributeName="r" values="10;12;10" dur="2s" begin="1s" repeatCount="indefinite" />
        </circle>
        <circle cx="200" cy="170" r="8" fill="#AAAAAA" />
        <circle cx="300" cy="170" r="10" fill="#888888">
          <animate attributeName="r" values="10;12;10" dur="2s" begin="1s" repeatCount="indefinite" />
        </circle>
      </svg>
    );
  } else {
    // Explore: crosshair / data exploration UI
    content = (
      <svg viewBox="0 0 400 220" fill="none" style={{ width: '100%', height: '100%', opacity: 0.8 }}>
        <rect x="80" y="50" width="240" height="120" fill="rgba(255,255,255,0.05)" stroke="rgba(255,255,255,0.3)" strokeWidth="1.5" />
        <line x1="80" y1="80" x2="320" y2="80" stroke="rgba(255,255,255,0.3)" strokeWidth="1.5" />
        <rect x="90" y="60" width="10" height="10" fill="#FFFFFF">
          <animate attributeName="opacity" values="1;0.5;1" dur="2s" repeatCount="indefinite" />
        </rect>
        <rect x="110" y="60" width="10" height="10" fill="rgba(255,255,255,0.5)" />
        <rect x="130" y="60" width="10" height="10" fill="rgba(255,255,255,0.3)" />
        
        {/* Crosshair focusing on an element */}
        <g>
          <animateTransform attributeName="transform" type="rotate" from="0 200 130" to="90 200 130" dur="4s" repeatCount="indefinite" />
          <circle cx="200" cy="130" r="24" stroke="#FFFFFF" strokeWidth="1.5" strokeDasharray="4 4" />
          <line x1="200" y1="96" x2="200" y2="110" stroke="#FFFFFF" strokeWidth="1.5" />
          <line x1="200" y1="150" x2="200" y2="164" stroke="#FFFFFF" strokeWidth="1.5" />
          <line x1="166" y1="130" x2="180" y2="130" stroke="#FFFFFF" strokeWidth="1.5" />
          <line x1="220" y1="130" x2="234" y2="130" stroke="#FFFFFF" strokeWidth="1.5" />
        </g>
        <circle cx="200" cy="130" r="4" fill="#FFFFFF">
          <animate attributeName="r" values="4;6;4" dur="2s" repeatCount="indefinite" />
        </circle>
      </svg>
    );
  }

  return (
    <FlashViz height={220}>
      <div style={{ position: 'absolute', inset: 0, background: 'var(--bg-surface)' }} />
      <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse at 50% 50%, rgba(255,255,255,0.06) 0%, transparent 65%)' }} />
      <div className="dot-grid" style={{ position: 'absolute', inset: 0, opacity: 0.1 }} />
      <div style={{ position: 'relative', zIndex: 2, width: '100%', height: '100%' }}>
        {content}
      </div>
    </FlashViz>
  );
}

export default function HomePage() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const { register, handleSubmit, setValue, formState: { errors } } = useForm<IngestForm>({ resolver: zodResolver(ingestSchema) });

  const { scrollY } = useScroll();
  const heroY = useTransform(scrollY, [0, 800], [0, 200]);
  const heroOpacity = useTransform(scrollY, [0, 500], [1, 0]);

  const onSubmit = async (data: IngestForm) => {
    setSubmitting(true);
    try {
      const repo = await api.ingestRepo({ github_url: data.github_url, max_commits: 300, max_issues: 150, max_prs: 150, include_code: true });
      router.push(`/repos/${repo.repo_id}`);
    } catch (err) {
      setValue('github_url', data.github_url, { shouldValidate: false });
      console.error(err);
    } finally { setSubmitting(false); }
  };

  return (
    <main style={{ background: 'var(--bg-base)', color: 'var(--text-primary)', minHeight: '100vh' }}>
      <ScrollProgress />

      {/* ── NAV ── */}
      <nav style={{ position: 'sticky', top: 0, zIndex: 50, borderBottom: '1px solid var(--border-subtle)', background: 'rgba(0,0,0,0.9)', backdropFilter: 'blur(24px)' }}>
        <div style={{ ...mw, height: 64, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 32, height: 32, border: '1px solid #FFF', background: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ color: '#fff', fontWeight: 800, fontSize: 11, ...mono }}>HG</span>
            </div>
            <span style={{ fontWeight: 800, textTransform: 'uppercase', fontSize: 16, letterSpacing: '0.05em', ...mono }}>HYGIT</span>
          </div>
          <div style={{ display: 'flex', gap: 2 }}>
            <Link href="/repos" className="nav-link">Workspaces</Link>
            <Link href="#features" className="nav-link">Features</Link>
            <Link href="#process" className="nav-link">Process</Link>
            <Link href="#faq" className="nav-link">FAQ</Link>
          </div>
          <Link href="/repos" className="btn-ghost" style={{ fontSize: 12, padding: '6px 12px' }}>WORKSPACES →</Link>
        </div>
      </nav>

      {/* ── HERO ── */}
      <section style={{ position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse 80% 55% at 30% -5%, rgba(255,255,255,0.08) 0%, transparent 60%)', pointerEvents: 'none', zIndex: 0 }} />
        <div className="dot-grid" style={{ position: 'absolute', inset: 0, opacity: 0.28, pointerEvents: 'none' }} />

        <div style={{ ...mw, paddingTop: 100, paddingBottom: 100, position: 'relative', zIndex: 1, display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 60, alignItems: 'start' }}>
          
          {/* Left Column (Text & Form) */}
          <div>
            <Reveal delay={0.1}>
              <div style={{ display: 'flex', alignItems: 'center', marginBottom: 32 }}>
                <span style={label}>AI PROVENANCE ENGINE</span>
              </div>
            </Reveal>

            <h1 style={{ fontSize: 'clamp(42px, 5vw, 76px)', fontWeight: 800, textTransform: 'uppercase', lineHeight: 1.01, letterSpacing: '-0.02em', marginBottom: 28 }}>
              <motion.span
                initial={{ opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
                style={{ display: 'block' }}
              >
                <SyncColorText>AI KNOWLEDGE GRAPHS</SyncColorText>
              </motion.span>
              <motion.span
                initial={{ opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.45, ease: [0.16, 1, 0.3, 1] }}
                style={{ display: 'block' }}
              >
                <SyncColorText isGradient>FOR EVERY CODEBASE.</SyncColorText>
              </motion.span>
            </h1>

            <Reveal delay={0.5}>
              <p style={{ fontSize: 16, color: 'var(--text-secondary)', lineHeight: 1.75, maxWidth: 490, margin: '0 0 48px 0', fontFamily: "'JetBrains Mono', monospace" }}>
                We are a provenance engine that designs, builds, and deploys intelligent knowledge graphs to document operations and scale engineering teams globally.
              </p>
            </Reveal>

            <Reveal delay={0.65}>
              <div>
                <form onSubmit={handleSubmit(onSubmit)} style={{ display: 'flex', gap: 10, maxWidth: 540, alignItems: 'flex-start' }}>
                  <div style={{ position: 'relative', flex: 1 }}>
                    <div style={{ position: 'absolute', top: '50%', left: 14, transform: 'translateY(-50%)', pointerEvents: 'none' }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-placeholder)" strokeWidth="2">
                        <path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22" />
                      </svg>
                    </div>
                    <input {...register('github_url')} placeholder="GITHUB.COM/OWNER/REPO" className="input-dark" style={{ paddingLeft: 40, paddingTop: 15, paddingBottom: 15, fontSize: 14 }} />
                    {errors.github_url && <p style={{ position: 'absolute', bottom: -20, left: 0, color: 'var(--danger)', fontSize: 11, ...mono }}>{errors.github_url.message}</p>}
                  </div>
                  <button type="submit" disabled={submitting} className="btn-primary" style={{ paddingTop: 15, paddingBottom: 15, paddingLeft: 22, paddingRight: 22, fontSize: 14, whiteSpace: 'nowrap', flexShrink: 0 }}>
                    {submitting
                      ? <><span style={{ width: 14, height: 14, border: '2px solid rgba(0,0,0,0.3)', borderTop: '2px solid #000', borderRadius: '50%', display: 'inline-block', animation: 'spin 0.7s linear infinite' }} />ANALYZING…</>
                      : 'ANALYZE REPO →'}
                  </button>
                </form>

                <p style={{ ...mono, fontSize: 11, color: 'var(--text-tertiary)', marginTop: 10, marginBottom: 0, opacity: 0.7 }}>
                  ⚡ Demo mode — capped at 300 commits · 150 issues · 150 PRs per repo.
                </p>

                <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 12 }}>
                  <span style={{ ...mono, fontSize: 12, color: 'var(--text-tertiary)' }}>TRY:</span>
                  {QUICK_REPOS.map(r => (
                    <button key={r} type="button" onClick={() => setValue('github_url', r, { shouldValidate: true })}
                      style={{ ...mono, fontSize: 12, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', textUnderlineOffset: 3 }}>
                      {r.toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>
            </Reveal>
          </div>

          {/* Right Column (Visual) */}
          <motion.div style={{ position: 'relative', width: '100%', aspectRatio: '1/1', background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', overflow: 'hidden', y: heroY, opacity: heroOpacity }}>
            <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse at 50% 50%, rgba(255,255,255,0.06) 0%, transparent 70%)' }} />
            <GraphHero />
          </motion.div>

        </div>
      </section>

      {/* ── ABOUT ── */}
      <section style={{ borderTop: '1px solid var(--border-subtle)' }}>
        <div style={{ ...mw, paddingTop: 96, paddingBottom: 96 }}>
          {/* ( about us ) */}
          <Reveal delay={0.1}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 56 }}>
              <span style={{ ...label, opacity: 0.45 }}>(</span>
              <span style={label}>ABOUT US</span>
              <span style={{ ...label, opacity: 0.45 }}>)</span>
            </div>
          </Reveal>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 80, alignItems: 'start', marginBottom: 72 }}>
            <Reveal delay={0.2}>
              <h2 style={{ ...h2style, fontSize: 'clamp(28px, 3.8vw, 48px)' }}>
                WE BUILD KNOWLEDGE GRAPHS<br />FOR ENGINEERING TEAMS
              </h2>
            </Reveal>
            <Reveal delay={0.3}>
              <p style={{ fontSize: 16, color: 'var(--text-secondary)', lineHeight: 1.8, marginTop: 6, ...mono }}>
                <Typewriter text="At HyGit, we power engineering teams with AI by constructing intelligent knowledge graphs and scalable provenance systems. We offer focused capabilities including automated wiki generation, multi-hop graph queries, file-level provenance tracing, and interactive codebase visualization." />
              </p>
            </Reveal>
          </div>

          {/* Stats row — // prefixed like Zentrixx */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', borderTop: '1px solid var(--border-subtle)', borderBottom: '1px solid var(--border-subtle)' }}>
            {[
              { lbl: '// GRAPH NODES',     val: '50K+', desc: 'Code artifacts, commits, issues, and PRs linked in a single knowledge graph.' },
              { lbl: '// PROVENANCE HOPS', val: '∞',    desc: 'Multi-hop graph queries trace code back to its original intent and decisions.' },
              { lbl: '// TIME TO INSIGHT', val: '<60s', desc: 'From raw GitHub URL to a fully cited, explorable wiki page.' },
            ].map((s, i) => (
              <Reveal key={s.lbl} delay={0.2 + (i * 0.1)}>
                <div style={{ padding: '48px 40px', borderLeft: i > 0 ? '1px solid var(--border-subtle)' : 'none', paddingLeft: i === 0 ? 0 : 40 }}>
                  <p style={{ ...label, fontSize: 10, marginBottom: 16 }}>{s.lbl}</p>
                  <FlashStat val={s.val} delay={i * 0.1} />
                  <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.7, maxWidth: 200, ...mono }}>{s.desc}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── SERVICES ── */}
      <motion.section 
        id="features" 
        initial={{ opacity: 0, y: 50 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-100px" }} transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
        style={{ borderTop: '1px solid var(--border-subtle)', background: 'var(--bg-surface)' }}
      >
        <div style={{ ...mw, paddingTop: 96, paddingBottom: 96 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 20 }}>
            <span style={{ ...label, opacity: 0.45 }}>(</span>
            <span style={label}>CORE SERVICES</span>
            <span style={{ ...label, opacity: 0.45 }}>)</span>
          </div>
          <h2 style={{ ...h2style, marginBottom: 72, maxWidth: 560 }}>
            SERVICES THAT SOLVE<br />REAL ENGINEERING PROBLEMS
          </h2>

          {/* Numbered service rows with image — exactly like Zentrixx */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            {SERVICES.map((svc, i) => (
              <div key={svc.num} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0, borderTop: '1px solid var(--border-subtle)', alignItems: 'stretch' }}>
                <div style={{ padding: '56px 0', paddingRight: 60, display: 'flex', flexDirection: 'column', justifyContent: 'center', borderRight: '1px solid var(--border-subtle)' }}>
                  <span style={{ ...mono, fontSize: 12, color: 'var(--text-tertiary)', marginBottom: 20 }}>{svc.num}</span>
                  <div>
                    <h3 style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em', marginBottom: 16, color: 'var(--text-primary)', textTransform: 'uppercase' }}>{svc.title}</h3>
                    <p style={{ fontSize: 15, color: 'var(--text-secondary)', lineHeight: 1.75, ...mono }}>{svc.desc}</p>
                  </div>
                </div>
                <div style={{ padding: '40px 0 40px 60px', aspectRatio: 'auto', minHeight: 260 }}>
                  <ServiceViz num={svc.num} />
                </div>
              </div>
            ))}
            <div style={{ borderTop: '1px solid var(--border-subtle)' }} />
          </div>
        </div>
      </motion.section>

      {/* ── PROCESS ── */}
      <section id="process" style={{ borderTop: '1px solid var(--border-subtle)' }}>
        <div style={{ ...mw, paddingTop: 96, paddingBottom: 96 }}>
          <Reveal delay={0.1}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 20 }}>
              <span style={{ ...label, opacity: 0.45 }}>(</span>
              <span style={label}>OUR PROCESS</span>
              <span style={{ ...label, opacity: 0.45 }}>)</span>
            </div>
          </Reveal>
          <Reveal delay={0.2}>
            <h2 style={{ ...h2style, marginBottom: 72 }}>
              HOW WE TURN REPOS INTO<br />INTELLIGENT SYSTEMS.
            </h2>
          </Reveal>

          {/* Process steps with full-width visual — like Zentrixx's 3-step layout */}
          {[
            { n: '1', title: 'INGEST', desc: 'Paste a GitHub URL. HyGit fetches commits, issues, PRs, and source code in parallel using the GitHub API.' },
            { n: '2', title: 'BUILD', desc: 'The HydraDB engine constructs a multi-layered knowledge graph linking every code artifact to its historical origin.' },
            { n: '3', title: 'EXPLORE', desc: 'Browse the automated wiki, run provenance queries, visualize the knowledge graph, and generate AI-powered reports.' },
          ].map((step, i) => (
            <Reveal key={step.n} delay={i * 0.15}>
              <div>
                {/* Visual block */}
                <div style={{ height: 220, marginBottom: 16 }}>
                  <ProcessViz num={step.n} />
                </div>
                {/* Text */}
                <div style={{ marginBottom: 60 }}>
                  <h4 style={{ fontSize: 20, fontWeight: 800, letterSpacing: '-0.02em', marginBottom: 10, textTransform: 'uppercase' }}>{step.n}. {step.title}</h4>
                  <p style={{ fontSize: 15, color: 'var(--text-secondary)', lineHeight: 1.75, maxWidth: 560, ...mono }}>{step.desc}</p>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ── FAQ ── */}
      {/* ── TECH STACK ── */}
      <section style={{ borderTop: '1px solid var(--border-subtle)' }}>
        <div style={{ ...mw, paddingTop: 96, paddingBottom: 96 }}>
          <Reveal delay={0.1}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 20 }}>
              <span style={{ ...label, opacity: 0.45 }}>(</span>
              <span style={label}>BUILT WITH</span>
              <span style={{ ...label, opacity: 0.45 }}>)</span>
            </div>
          </Reveal>
          <Reveal delay={0.2}>
            <h2 style={{ ...h2style, marginBottom: 64 }}>THE STACK BEHIND<br />THE INTELLIGENCE.</h2>
          </Reveal>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 0 }}>
            {[
              { category: 'AI & KNOWLEDGE', items: [
                { name: 'HydraDB', desc: 'Multi-tenant knowledge graph engine powering hybrid semantic + graph recall' },
                { name: 'OpenAI GPT-4o', desc: 'Synthesizes cited narratives, wiki articles, and codebase answers' },
              ]},
              { category: 'BACKEND', items: [
                { name: 'FastAPI', desc: 'Async Python API with structured logging and dependency injection' },
                { name: 'PostgreSQL', desc: 'Repo metadata and ingestion state via Supabase with async SQLAlchemy' },
                { name: 'Redis', desc: 'Sub-second response caching via Upstash for all AI-generated content' },
              ]},
              { category: 'FRONTEND & DATA', items: [
                { name: 'Next.js 15', desc: 'App Router with React Server Components and streaming' },
                { name: 'GitHub API', desc: 'Parallel ingestion of commits, PRs, issues, and source code trees' },
                { name: 'react-force-graph', desc: 'WebGL-accelerated interactive knowledge graph visualization' },
              ]},
            ].map((col, ci) => (
              <Reveal key={col.category} delay={ci * 0.1}>
                <div style={{ borderLeft: ci > 0 ? '1px solid var(--border-subtle)' : 'none', padding: '0 40px', paddingLeft: ci === 0 ? 0 : 40 }}>
                  <p style={{ ...label, fontSize: 10, marginBottom: 28, letterSpacing: '0.12em' }}>{col.category}</p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
                    {col.items.map(item => (
                      <div key={item.name}>
                        <p style={{ fontSize: 15, fontWeight: 800, color: 'var(--text-primary)', marginBottom: 6, letterSpacing: '-0.01em', ...mono }}>{item.name}</p>
                        <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.7, ...mono }}>{item.desc}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section id="faq" style={{ borderTop: '1px solid var(--border-subtle)' }}>
        <div style={{ ...mw, paddingTop: 96, paddingBottom: 96 }}>
          <Reveal delay={0.1}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 20 }}>
              <span style={{ ...label, opacity: 0.45 }}>(</span>
              <span style={label}>FAQ</span>
              <span style={{ ...label, opacity: 0.45 }}>)</span>
            </div>
          </Reveal>
          <Reveal delay={0.2}>
            <h2 style={{ ...h2style, marginBottom: 64 }}>FREQUENTLY ASKED QUESTIONS</h2>
          </Reveal>

          <div style={{ maxWidth: 720 }}>
            {FAQ_ITEMS.map((item, i) => (
              <Reveal key={i} delay={i * 0.05}>
                <div style={{ borderTop: '1px solid var(--border-subtle)' }}>
                  <button
                    onClick={() => setOpenFaq(openFaq === i ? null : i)}
                    style={{ width: '100%', textAlign: 'left', background: 'none', border: 'none', padding: '24px 0', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 20 }}
                  >
                    <span style={{ fontSize: 16, fontWeight: 800, color: 'var(--text-primary)', ...mono }}>{i + 1}. {item.q}</span>
                    <span style={{ fontSize: 22, color: 'var(--text-tertiary)', lineHeight: 1, flexShrink: 0, transition: 'transform 0.2s', transform: openFaq === i ? 'rotate(45deg)' : 'none' }}>+</span>
                  </button>
                  <AnimatePresence>
                    {openFaq === i && (
                      <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} style={{ overflow: 'hidden' }}>
                        <div style={{ paddingBottom: 24 }}>
                          <p style={{ fontSize: 15, color: 'var(--text-secondary)', lineHeight: 1.75, ...mono }}>{item.a}</p>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </Reveal>
            ))}
            <Reveal delay={0.4}><div style={{ borderTop: '1px solid var(--border-subtle)' }} /></Reveal>
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section style={{ borderTop: '1px solid var(--border-subtle)', background: 'var(--bg-surface)' }}>
        <div style={{ ...mw, paddingTop: 96, paddingBottom: 96 }}>
          <Reveal delay={0.1}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 32 }}>
              <span style={{ ...label, opacity: 0.45 }}>(</span>
              <span style={label}>GET STARTED</span>
              <span style={{ ...label, opacity: 0.45 }}>)</span>
            </div>
          </Reveal>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 40, alignItems: 'end' }}>
            <Reveal delay={0.2}>
              <h2 style={{ ...h2style }}>
                READY TO UNDERSTAND<br />YOUR CODEBASE?
              </h2>
            </Reveal>
            <Reveal delay={0.3}>
              <div style={{ display: 'flex', gap: 12, paddingBottom: 6 }}>
                <Link href="/repos" className="btn-primary" style={{ fontSize: 14, padding: '12px 24px' }}>OPEN WORKSPACES →</Link>

              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer style={{ borderTop: '1px solid var(--border-subtle)' }}>
        <div style={{ ...mw, paddingTop: 28, paddingBottom: 28, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ ...mono, fontSize: 12, color: 'var(--text-tertiary)' }}>HYGIT — WIKIPEDIA FOR GITHUB REPOS</span>
          <div style={{ display: 'flex', gap: 24 }}>
            <Link href="/repos" style={{ ...mono, fontSize: 12, color: 'var(--text-tertiary)', textDecoration: 'none' }}>WORKSPACES</Link>

          </div>
        </div>
      </footer>
    </main>
  );
}
