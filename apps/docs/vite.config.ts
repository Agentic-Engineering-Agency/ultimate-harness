import react from '@vitejs/plugin-react';
import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import mdx from 'fumadocs-mdx/vite';
import { nitro } from 'nitro/vite';

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
          enabled: true,
          crawlLinks: true,
        },
      },

      pages: [
        { path: '/docs' },
        { path: '/api/search' },
        { path: 'llms-full.txt' },
        { path: 'llms.txt' },
      ],
    }),
    react(),
    nitro({
      config: {
        // Inline tslib (Radix Dialog imports tslib/modules/index.js at SSR
        // runtime; without inlining, the prerender Node server fails with
        // ERR_MODULE_NOT_FOUND because tslib never lands in .output/server).
        externals: {
          inline: ['tslib'],
        },
      },
    }),
  ],
  resolve: {
    tsconfigPaths: true,
    alias: {
      tslib: 'tslib/tslib.es6.js',
    },
  },
});
