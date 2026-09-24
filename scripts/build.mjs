#!/usr/bin/env node
// Atomic build: compile to dist.next, then swap into dist on success.
// On tsc failure dist is untouched. Leftover dist.next/dist.old from
// interrupted builds are cleaned up at the start; a lone dist.old is
// restored to dist rather than discarded so the last good build survives.
import { rename, rm, stat } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { cwd } from 'node:process';
import { join } from 'node:path';

const repoRoot = cwd();
const distDir = join(repoRoot, 'dist');
const stagingDir = join(repoRoot, 'dist.next');
const oldDir = join(repoRoot, 'dist.old');

const require = createRequire(import.meta.url);
const tscPath = require.resolve('typescript/bin/tsc');

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
  if (await exists(oldDir)) {
    if (!(await exists(distDir))) {
      await rename(oldDir, distDir);
    } else {
      await rm(oldDir, { recursive: true, force: true });
    }
  }
}

async function main() {
  await cleanLeftovers();

  try {
    execFileSync(process.execPath, [tscPath, '-p', 'tsconfig.json', '--outDir', stagingDir], {
      cwd: repoRoot,
      stdio: 'inherit',
    });
  } catch (err) {
    const code = err.status ?? 1;
    try { await rm(stagingDir, { recursive: true, force: true }); } catch {}
    process.exit(code);
  }

  if (await exists(distDir)) {
    try {
      await rename(distDir, oldDir);
    } catch (err) {
      console.error('Build swap failed:', err);
      process.exit(1);
    }
  }

  try {
    await rename(stagingDir, distDir);
  } catch (err) {
    if (await exists(oldDir)) {
      try {
        await rename(oldDir, distDir);
      } catch (restoreErr) {
        console.error('Build swap failed:', err);
        console.error('Restoring previous dist failed:', restoreErr);
        process.exit(1);
      }
    }
    console.error('Build swap failed:', err);
    process.exit(1);
  }

  if (await exists(oldDir)) {
    try { await rm(oldDir, { recursive: true, force: true }); } catch {}
  }
}

main();
