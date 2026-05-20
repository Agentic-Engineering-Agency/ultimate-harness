#!/usr/bin/env bun
// Sync docs/ROADMAP.md -> apps/docs/content/docs/roadmap.mdx for the public docs site.
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const repoRoot = join(import.meta.dirname, '..');
const mdPath = join(repoRoot, 'docs/ROADMAP.md');
const mdxPath = join(repoRoot, 'apps/docs/content/docs/roadmap.mdx');

const mdBody = await readFile(mdPath, 'utf8');
const body = mdBody
  .replace(/^#\s+.+\n+/, '')
  .replace(
    /\[`docs\/specs\/epics-6-7-8\.md`\]\(\.\/specs\/epics-6-7-8\.md\)/g,
    '[Epics 6–8 execution spec](https://github.com/Agentic-Engineering-Agency/ultimate-harness/blob/dev/docs/specs/epics-6-7-8.md)',
  );

const mdx = `---
title: "Ultimate Harness — Roadmap"
description: "Last updated: 2026-05-20. Source of truth for issue state is Linear; human-readable epic index for Ultimate Harness."
---

${body}`;
await writeFile(mdxPath, mdx, 'utf8');
console.log('synced docs/ROADMAP.md -> apps/docs/content/docs/roadmap.mdx');
