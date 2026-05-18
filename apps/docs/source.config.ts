import { defineConfig, defineDocs } from 'fumadocs-mdx/config';

export const docs = defineDocs({
  dir: 'content/docs',
  docs: {
    postprocess: {
      // Required so /docs/{slug}.md, /llms.txt, and /llms-full.txt routes
      // can call page.data.getText('processed') during prerender.
      includeProcessedMarkdown: true,
    },
  },
});

export default defineConfig();
