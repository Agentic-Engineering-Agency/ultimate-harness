#!/usr/bin/env node
// Dead-link checker for the docs trees. No external dependencies.
//
// Scans markdown/MDX under `docs/` and `apps/docs/content/docs/`, extracts
// relative links, resolves each target on disk, and exits non-zero if any
// target is missing. External links (http/https/mailto), in-page anchors
// (#...), and protocol-relative URLs are skipped — we only verify links we
// can resolve on disk.
//
// Two doc systems live in this repo:
//   - `docs/`                   plain markdown; links are file paths (foo.md).
//   - `apps/docs/content/docs/` fumadocs MDX; links are usually route paths
//                               with no extension (./foo, /docs/foo) that map
//                               to a `.mdx` file, but file-style links work too.
//
// Run: node scripts/check-doc-links.mjs   (or: bun run docs:check-links)

import { readFileSync, existsSync, statSync, readdirSync } from "node:fs";
import { resolve, dirname, join, extname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");

const TREES = [
  { dir: "docs", exts: [".md"], mdxRouting: false, routeBase: null },
  { dir: "apps/docs/content/docs", exts: [".mdx", ".md"], mdxRouting: true, routeBase: "/docs" },
];

// Inline markdown link target: [text](target ...). Capture up to the first
// whitespace (a "title") or the closing paren.
const LINK_RE = /\]\(\s*([^)\s]+)/g;

function listFiles(absDir, exts) {
  const out = [];
  for (const entry of readdirSync(absDir, { withFileTypes: true })) {
    const abs = join(absDir, entry.name);
    if (entry.isDirectory()) {
      out.push(...listFiles(abs, exts));
    } else if (exts.includes(extname(entry.name))) {
      out.push(abs);
    }
  }
  return out;
}

function isSkippable(target) {
  return (
    target.startsWith("#") ||
    target.startsWith("http://") ||
    target.startsWith("https://") ||
    target.startsWith("mailto:") ||
    target.startsWith("//")
  );
}

function fileExists(abs) {
  return existsSync(abs) && statSync(abs).isFile();
}

// A relative link to an existing file OR directory is a live target.
function pathExists(abs) {
  return existsSync(abs);
}

// Map an extension-less route to a file on disk (foo -> foo.mdx | foo/index.mdx).
function resolveMdxRoute(absBase) {
  const candidates = [
    `${absBase}.mdx`,
    `${absBase}.md`,
    join(absBase, "index.mdx"),
    join(absBase, "index.md"),
  ];
  for (const candidate of candidates) {
    if (fileExists(candidate)) return candidate;
  }
  return null;
}

let totalLinks = 0;
const failures = [];

for (const tree of TREES) {
  const absTreeDir = resolve(repoRoot, tree.dir);
  if (!existsSync(absTreeDir)) continue;

  for (const file of listFiles(absTreeDir, tree.exts)) {
    const content = readFileSync(file, "utf8");
    const fileDir = dirname(file);

    for (const match of content.matchAll(LINK_RE)) {
      const raw = match[1].trim();
      if (isSkippable(raw)) continue;

      // Drop anchor/query fragments before resolving the path.
      const target = raw.split("#")[0].split("?")[0];
      if (target === "") continue; // pure anchor or query

      let resolvedPath = null;

      if (target.startsWith("/")) {
        // Site-absolute. Only resolvable for the MDX tree's route base.
        if (tree.mdxRouting && tree.routeBase && target.startsWith(`${tree.routeBase}/`)) {
          const rel = target.slice(tree.routeBase.length + 1);
          resolvedPath = resolveMdxRoute(join(absTreeDir, rel));
        } else {
          continue; // can't resolve on disk — don't count it
        }
      } else {
        const absTarget = resolve(fileDir, target);
        if (extname(target) === "") {
          // Extension-less: an MDX route, else a file or directory on disk.
          resolvedPath = tree.mdxRouting
            ? (resolveMdxRoute(absTarget) ?? (pathExists(absTarget) ? absTarget : null))
            : (pathExists(absTarget) ? absTarget : null);
        } else {
          resolvedPath = pathExists(absTarget) ? absTarget : null;
        }
      }

      totalLinks += 1;
      if (!resolvedPath) {
        failures.push({ file: file.slice(repoRoot.length + 1), target: raw });
      }
    }
  }
}

if (failures.length > 0) {
  console.error("Broken relative doc links:\n");
  for (const f of failures) {
    console.error(`  ${f.file} -> ${f.target}`);
  }
  console.error(`\nDoc link check failed: ${failures.length} broken link(s) of ${totalLinks} checked.`);
  process.exit(1);
}

console.log(`Doc link check passed: ${totalLinks} relative link(s) resolved.`);
