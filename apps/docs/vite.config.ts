import react from '@vitejs/plugin-react';
import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import mdx from 'fumadocs-mdx/vite';

// Path A: SPA-only, no prerender. Sidesteps the Nitro 3 beta tslib SSR
// blocker entirely. TanStack Start emits a static SPA into .output/public
// which is handed to Cloudflare Pages via wrangler.
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
        prerender: {
          enabled: false,
        },
      },
    }),
    react(),
  ],
  resolve: {
    tsconfigPaths: true,
  },
});
