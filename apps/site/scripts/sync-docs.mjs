#!/usr/bin/env node
// Mirror the repository's Markdown sources into the Starlight content tree.
//
// The repo's docs/, specs/ and CHANGELOG.md stay the single source of truth:
// this script runs before every dev/build, writes src/content/docs/source/
// (gitignored), and never edits the originals. It
//   - lowercases paths and maps README.md to index.md so slugs are stable,
//   - lifts the first `# Heading` into Starlight frontmatter,
//   - rewrites relative links: synced Markdown -> site routes, anything else
//     -> the file on GitHub, so no link points into a void.
import { mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, posix, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const siteRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = resolve(siteRoot, '..', '..');
const outRoot = join(siteRoot, 'src', 'content', 'docs', 'source');
const repoUrl = 'https://github.com/Agentic-Engineering-Agency/ultimate-harness';
const branch = process.env.UH_SITE_SOURCE_BRANCH ?? 'main';

// Repo-relative inputs. Directories are walked recursively for *.md.
const inputs = ['docs', 'specs', 'CHANGELOG.md'];

function walk(rel) {
  const abs = join(repoRoot, rel);
  let stat;
  try {
    stat = statSync(abs);
  } catch {
    return [];
  }
  if (stat.isFile()) return rel.endsWith('.md') ? [rel] : [];
  return readdirSync(abs)
    .sort()
    .flatMap((entry) => walk(posix.join(rel, entry)));
}

const sources = inputs.flatMap(walk);
const sourceSet = new Set(sources);

/** Repo-relative Markdown path -> site route (no trailing slash). */
function routeFor(repoPath) {
  // Astro slugs drop dots, so `feature.spec.md` would not match its route.
  const lower = repoPath.toLowerCase().replace(/\.md$/, '').replace(/\./g, '-');
  const route = lower.endsWith('/readme') ? lower.slice(0, -'/readme'.length) : lower;
  return `/source/${route}`;
}

/** Repo-relative Markdown path -> output file under src/content/docs/source. */
function outFileFor(repoPath) {
  const route = routeFor(repoPath).slice('/source/'.length);
  return join(outRoot, `${route}${repoPath.toLowerCase().endsWith('/readme.md') ? '/index' : ''}.md`);
}

function rewriteTarget(target, fromRepoPath) {
  if (/^(?:[a-z][a-z0-9+.-]*:|#|\/\/)/i.test(target)) return target;
  const [pathPart, anchor = ''] = target.split(/(?=#)/);
  if (!pathPart) return target;
  const resolved = posix.normalize(posix.join(posix.dirname(fromRepoPath), decodeURI(pathPart)));
  if (resolved.startsWith('..')) return target;
  const clean = resolved.replace(/\/$/, '');
  if (sourceSet.has(clean)) return `${routeFor(clean)}/${anchor}`;
  if (sourceSet.has(`${clean}/README.md`)) return `${routeFor(`${clean}/README.md`)}/${anchor}`;
  let kind = 'blob';
  try {
    if (statSync(join(repoRoot, clean)).isDirectory()) kind = 'tree';
  } catch {
    // Missing on this checkout; still point at GitHub rather than a dead route.
  }
  return `${repoUrl}/${kind}/${branch}/${encodeURI(clean)}${anchor}`;
}

function rewriteLinks(markdown, fromRepoPath) {
  // Leave fenced code untouched: split on ``` / ~~~ fences and only rewrite
  // the prose segments (even indexes).
  const parts = markdown.split(/^(```|~~~)[^\n]*\n[\s\S]*?^\1[^\n]*$/m);
  const fences = markdown.match(/^(```|~~~)[^\n]*\n[\s\S]*?^\1[^\n]*$/gm) ?? [];
  let out = '';
  let fenceIndex = 0;
  for (let i = 0; i < parts.length; i += 2) {
    out += parts[i]
      .replace(/(\]\()(<[^>]+>|[^)\s]+)((?:\s+"[^"]*")?\))/g, (_, open, target, close) => {
        const bare = target.startsWith('<') ? target.slice(1, -1) : target;
        return `${open}${rewriteTarget(bare, fromRepoPath)}${close}`;
      })
      .replace(/^(\s*\[[^\]]+\]:\s+)(\S+)/gm, (_, def, target) => `${def}${rewriteTarget(target, fromRepoPath)}`);
    if (fenceIndex < fences.length) out += fences[fenceIndex++];
  }
  return out;
}

function toPage(repoPath) {
  let body = readFileSync(join(repoRoot, repoPath), 'utf8').replace(/\r\n/g, '\n');
  let existing = '';
  const fm = body.match(/^---\n([\s\S]*?)\n---\n/);
  if (fm) {
    existing = fm[1];
    body = body.slice(fm[0].length);
  }
  let title = /^title:\s*(.+)$/m.exec(existing)?.[1]?.replace(/^["']|["']$/g, '');
  const h1 = body.match(/^\s*#\s+(.+?)\s*#*\s*$/m);
  if (h1 && body.slice(0, h1.index).trim() === '') {
    title ??= h1[1];
    body = body.slice((h1.index ?? 0) + h1[0].length);
  }
  title ??= posix.basename(repoPath, '.md');
  const frontmatter = [
    '---',
    `title: ${JSON.stringify(title.replace(/`/g, ''))}`,
    `editUrl: ${JSON.stringify(`${repoUrl}/edit/${branch}/${repoPath}`)}`,
    'pagefind: true',
    '---',
    '',
    `:::note[Source document]`,
    `Mirrored from [\`${repoPath}\`](${repoUrl}/blob/${branch}/${repoPath}). Edit the original; this page is regenerated on every build.`,
    ':::',
    '',
    '',
  ].join('\n');
  return frontmatter + rewriteLinks(body.trimStart(), repoPath);
}

rmSync(outRoot, { recursive: true, force: true });
for (const repoPath of sources) {
  const file = outFileFor(repoPath);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, toPage(repoPath));
}
console.log(`sync-docs: mirrored ${sources.length} Markdown files into ${relative(siteRoot, outRoot)}`);
