import { readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import react from '@vitejs/plugin-react';
import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import mdx from 'fumadocs-mdx/vite';

// Walk content/docs/**/*.mdx and turn each one into a static page path.
// Doing this explicitly (rather than crawlLinks) avoids the crawler chasing
// in-content links to src/* code or to lowercased-vs-uppercased roadmap
// variants. Every mdx is exactly one /docs/<slug> route (plus the raw
// markdown view at /docs/<slug>.md served by routes/docs/{$}[.]md.ts).
const docsRoot = join(import.meta.dirname, 'content', 'docs');
const docPages: { path: string }[] = [];
function walk(dir: string) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      walk(full);
      continue;
    }
    if (!entry.endsWith('.mdx')) continue;
    const rel = relative(docsRoot, full).replace(/\\/g, '/').replace(/\.mdx$/, '');
    const slug = rel === 'index' ? '' : rel;
    docPages.push({ path: `/docs${slug ? `/${slug}` : ''}` });
    docPages.push({ path: `/docs/${rel}.md` });
  }
}
walk(docsRoot);

// SPA + prerender for /docs/* routes. The /docs/$ route uses createServerFn
// with staticFunctionMiddleware — those need prerender to bake the server
// function output into static JSON. Without it, the client at runtime
// fetches /_serverFn/... which doesn't exist on Cloudflare Pages and the
// _redirects fallback returns index.html, breaking JSON.parse.
//
// The active prerender config is the top-level `prerender` (not
// `spa.prerender`, which only governs the SPA shell). `crawlLinks: false`
// here means we only prerender the pages explicitly enumerated below.
export default defineConfig({
  server: {
    port: 3000,
  },
  plugins: [
    mdx(),
    tailwindcss(),
    tanstackStart({
      spa: {
        enabled: true,
      },
      prerender: {
        enabled: true,
        crawlLinks: false,
        failOnError: false,
      },
      pages: [
        { path: '/' },
        { path: '/llms.txt' },
        { path: '/llms-full.txt' },
        ...docPages,
      ],
    }),
    react(),
  ],
  resolve: {
    tsconfigPaths: true,
  },
});
