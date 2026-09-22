#!/usr/bin/env node
// Atomic build: compile to dist.next, then swap into dist on success.
// On tsc failure dist is untouched. Leftover dist.next/dist.old from
// interrupted builds are cleaned up at the start.
import { rename, rm, stat, mkdir } from 'node:fs/promises';
import { execSync } from 'node:child_process';
import { cwd } from 'node:process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = cwd();
const distDir = join(repoRoot, 'dist');
const stagingDir = join(repoRoot, 'dist.next');
const oldDir = join(repoRoot, 'dist.old');

async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function cleanLeftovers() {
  if (await exists(stagingDir)) await rm(stagingDir, { recursive: true, force: true });
  if (await exists(oldDir)) await rm(oldDir, { recursive: true, force: true });
}

async function main() {
  await cleanLeftovers();

  let code;
  try {
    execSync('npx --package typescript tsc -p tsconfig.json --outDir dist.next', { cwd: repoRoot, stdio: 'inherit' });
    code = 0;
  } catch (err) {
    code = err.status ?? 1;
    try { await rm(stagingDir, { recursive: true, force: true }); } catch {}
    process.exit(code);
  }

  try {
    if (await exists(distDir)) {
      await rename(distDir, oldDir);
    }
    await rename(stagingDir, distDir);
    if (await exists(oldDir)) await rm(oldDir, { recursive: true, force: true });
  } catch (err) {
    console.error('Build swap failed:', err);
    process.exit(1);
  }
}

main();