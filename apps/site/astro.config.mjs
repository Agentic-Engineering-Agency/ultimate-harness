// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

// Static build. Cloudflare serves dist/ as Worker static assets (see
// wrangler.jsonc), so there is no server adapter and no runtime code.
export default defineConfig({
  site: 'https://uh.agenticeng.app',
  trailingSlash: 'ignore',
  integrations: [
    starlight({
      title: 'Ultimate Harness',
      description:
        'Runtime-agnostic CLI and artifact lifecycle for planning, running, verifying and promoting agentic software work.',
      logo: { src: './src/assets/mark.svg', alt: 'UH' },
      favicon: '/favicon.svg',
      head: [
        { tag: 'meta', attrs: { property: 'og:image', content: 'https://uh.agenticeng.app/og.png' } },
        { tag: 'meta', attrs: { name: 'twitter:card', content: 'summary_large_image' } },
      ],
      customCss: ['./src/styles/custom.css'],
      social: [
        {
          icon: 'github',
          label: 'GitHub',
          href: 'https://github.com/Agentic-Engineering-Agency/ultimate-harness',
        },
      ],
      editLink: {
        baseUrl: 'https://github.com/Agentic-Engineering-Agency/ultimate-harness/edit/main/apps/site/',
      },
      lastUpdated: false,
      sidebar: [
        {
          label: 'Start here',
          items: [
            { label: 'What UH is', slug: 'index' },
            { label: 'Install and first run', slug: 'start/install' },
            { label: 'Mental model', slug: 'start/mental-model' },
          ],
        },
        {
          label: 'How it works',
          items: [
            { label: 'The lifecycle', slug: 'system/lifecycle' },
            { label: 'Architecture map', slug: 'system/architecture' },
            { label: 'Artifacts and schemas', slug: 'system/artifacts' },
            { label: 'Runtime adapters', slug: 'system/adapters' },
            { label: 'Supervision and the guard', slug: 'system/supervision' },
            { label: 'Teams, queue and land', slug: 'system/teams' },
            { label: 'Observability and cost', slug: 'system/observability' },
            { label: 'Surfaces: TUI, plugin, MCP', slug: 'system/surfaces' },
          ],
        },
        {
          label: 'Reference',
          items: [
            { label: 'CLI commands', slug: 'reference/cli' },
            { label: 'Repository layout', slug: 'reference/layout' },
          ],
        },
        {
          label: 'Source documents',
          collapsed: true,
          items: [
            { label: 'Changelog', slug: 'source/changelog' },
            { label: 'docs/', collapsed: true, items: [{ autogenerate: { directory: 'source/docs' } }] },
            { label: 'specs/', collapsed: true, items: [{ autogenerate: { directory: 'source/specs' } }] },
          ],
        },
        {
          label: 'Road to 1.0',
          items: [
            { label: 'Release plan', slug: 'release/plan' },
            { label: 'Branch and PR audit', slug: 'release/branches' },
            { label: 'Technical debt register', slug: 'release/debt' },
          ],
        },
        {
          label: 'Contributing',
          items: [
            { label: 'Working in the repo', slug: 'contributing/workflow' },
            { label: 'This site', slug: 'contributing/site' },
          ],
        },
      ],
    }),
  ],
});
