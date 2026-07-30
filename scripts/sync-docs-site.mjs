#!/usr/bin/env bun
// Sync docs/ROADMAP.md -> apps/docs/content/docs/roadmap.mdx for the public docs site.
import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const repoRoot = join(import.meta.dirname, '..');
const mdPath = join(repoRoot, 'docs/ROADMAP.md');
const mdxDir = join(repoRoot, 'apps/docs/content/docs');
const mdxPath = join(mdxDir, 'roadmap.mdx');
const githubBlob = 'https://github.com/Agentic-Engineering-Agency/ultimate-harness/blob/dev';

// `docs/ROADMAP.md` links siblings as file paths (`./architecture/tui.md`) so
// they resolve on GitHub and locally. The docs site is fumadocs MDX, where a
// page is addressed by its extension-less route. Rewrite each sibling link to
// that route when the page is mirrored on the site, and to the GitHub view when
// it isn't (internal-only docs like `docs/prds/` are never published).
function rewriteSiblingLink(_match, target, anchor) {
  const rel = target.replace(/^\.\//, '');
  const base = rel.replace(/\.md$/, '');
  const mirrored = [`${base}.mdx`, `${base}.md`, join(base, 'index.mdx')].some((candidate) =>
    existsSync(join(mdxDir, candidate)),
  );
  return mirrored ? `](./${base}${anchor})` : `](${githubBlob}/docs/${rel}${anchor})`;
}

const mdBody = await readFile(mdPath, 'utf8');
const body = mdBody
  .replace(/^#\s+.+\n+/, '')
  .replace(
    /\[`specs\/epics-6-7-8\.md`\]\(\.\.\/specs\/epics-6-7-8\.md\)/g,
    '[Epics 6–8 execution spec](https://github.com/Agentic-Engineering-Agency/ultimate-harness/blob/dev/specs/epics-6-7-8.md)',
  )
  // CHANGELOG.md sits at the repo root, not under /docs/, so the relative
  // `../CHANGELOG.md` link is broken on the docs site. Rewrite to the GitHub
  // raw view so readers land on the actual changelog instead of a 404.
  .replace(
    /\]\(\.\.\/CHANGELOG\.md\)/g,
    '](https://github.com/Agentic-Engineering-Agency/ultimate-harness/blob/main/CHANGELOG.md)',
  )
  .replace(/\]\((\.\/[^)\s#]+\.md)((?:#[^)\s]*)?)\)/g, rewriteSiblingLink);

// Pull the body's "Last updated: YYYY-MM-DD" so the frontmatter description
// never drifts from the visible date below.
const lastUpdatedMatch = body.match(/Last updated:\s*(\d{4}-\d{2}-\d{2})/);
const lastUpdated = lastUpdatedMatch ? lastUpdatedMatch[1] : '2026-05-25';

const mdx = `---
title: "Ultimate Harness — Roadmap"
description: "Last updated: ${lastUpdated}. Source of truth for issue state is Linear; human-readable epic index for Ultimate Harness."
---

${body}`;
await writeFile(mdxPath, mdx, 'utf8');
console.log('synced docs/ROADMAP.md -> apps/docs/content/docs/roadmap.mdx');
