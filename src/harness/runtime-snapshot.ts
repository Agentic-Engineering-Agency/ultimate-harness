import { createHash, randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { access, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { renameWithRetry } from "./artifact-transaction.js";

/**
 * Immutable, content-addressed copies of the built Tool Guard hooks.
 *
 * The adapters hand the runtime a hook that lives in the project's own build
 * output. Rebuilding UH while a run is live replaces or removes that file
 * underneath the running worker. This module publishes a closed set of the
 * files the hook needs into a per-user cache directory named after a SHA-256 of
 * their contents, so a live run never reads the mutable build directory again.
 *
 * The built hooks are NOT self-contained: each imports sibling build-output
 * modules (`harness/tool-guard.js`, `schema/runtime-control.js`,
 * `schema/artifacts.js`) and the npm package `zod`. The relative layout is
 * preserved so Node still resolves those imports; the package is published
 * under `node_modules/<name>` because a bare specifier cannot resolve from the
 * per-user cache otherwise.
 */

export interface SnapshotGuardHookOptions {
  /** Build output root the hook lives under. Defaults to `UH_HARNESS_DIST` or the module's `dist/`. */
  sourceDir?: string;
  /** Cache directory. Defaults to `UH_RUNTIME_SNAPSHOT_CACHE` or the per-user cache base. */
  cacheRoot?: string;
}

interface ImportSpecifier {
  value: string;
  /** A static `import ... from`/`export ... from`/side-effect import must resolve or the closure is incomplete. */
  required: boolean;
}

function snapshotDefaultSourceDir(): string {
  return process.env.UH_HARNESS_DIST ?? fileURLToPath(new URL("../../dist", import.meta.url));
}

function snapshotDefaultCacheRoot(): string {
  const override = process.env.UH_RUNTIME_SNAPSHOT_CACHE;
  if (override) return override;
  // Tests must stay hermetic; the per-user cache is not a temporary directory on
  // Windows. Everything else mirrors the Windows guardian's cache base.
  const base = process.env.VITEST ? tmpdir() : process.env.LOCALAPPDATA || tmpdir();
  return path.join(base, "ultimate-harness", "runtime-snapshots");
}

function toPosix(value: string): string {
  return value.split(path.sep).join("/");
}

async function pathExists(target: string): Promise<boolean> {
  try { await access(target); return true; } catch { return false; }
}

function isInside(parent: string, child: string): boolean {
  const relative = path.relative(parent, child);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function commonAncestor(a: string, b: string): string {
  const left = path.resolve(a);
  const right = path.resolve(b);
  if (isInside(left, right)) return left;
  if (isInside(right, left)) return right;
  let current = left;
  for (;;) {
    const parent = path.dirname(current);
    if (parent === current) return current;
    current = parent;
    if (isInside(current, right)) return current;
  }
}

function layoutRootOf(paths: string[]): string {
  let common = path.resolve(paths[0]);
  for (const candidate of paths.slice(1)) {
    const absolute = path.resolve(candidate);
    if (isInside(common, absolute)) continue;
    if (isInside(absolute, common)) { common = absolute; continue; }
    common = commonAncestor(common, absolute);
  }
  return common;
}

function importSpecifiers(source: string): ImportSpecifier[] {
  const found = new Map<string, boolean>();
  const add = (value: string, required: boolean): void => {
    const previous = found.get(value);
    if (previous === undefined || (required && !previous)) found.set(value, required);
  };
  for (const match of source.matchAll(/\bfrom\s*["']([^"']+)["']/g)) add(match[1], true);
  for (const match of source.matchAll(/\bimport\s*["']([^"']+)["']/g)) add(match[1], true);
  for (const match of source.matchAll(/\bimport\s*\(\s*["']([^"']+)["']\s*\)/g)) add(match[1], false);
  for (const match of source.matchAll(/\brequire\s*\(\s*["']([^"']+)["']\s*\)/g)) add(match[1], false);
  return [...found].map(([value, required]) => ({ value, required }));
}

function packageNameOf(specifier: string): string {
  const segments = specifier.split("/");
  return specifier.startsWith("@") ? segments.slice(0, 2).join("/") : segments[0];
}

async function resolveRelativeFile(importer: string, specifier: string): Promise<string | undefined> {
  const base = path.resolve(path.dirname(importer), specifier);
  const candidates = path.extname(base)
    ? [base]
    : [base, `${base}.js`, `${base}.mjs`, `${base}.cjs`, path.join(base, "index.js")];
  for (const candidate of candidates) {
    try { if ((await stat(candidate)).isFile()) return candidate; } catch { /* try the next candidate */ }
  }
  return undefined;
}

async function resolvePackageRoot(importer: string, specifier: string): Promise<string> {
  const require = createRequire(pathToFileURL(importer));
  let entry: string;
  try {
    entry = require.resolve(specifier, { paths: [path.dirname(importer)] });
  } catch (error) {
    throw new Error(`Runtime snapshot cannot resolve imported package ${specifier} from ${importer}: ${error instanceof Error ? error.message : String(error)}`);
  }
  const name = packageNameOf(specifier);
  let directory = path.dirname(entry);
  for (;;) {
    try {
      const manifest = JSON.parse(await readFile(path.join(directory, "package.json"), "utf8")) as { name?: unknown };
      if (manifest.name === name) return directory;
    } catch { /* keep walking toward the filesystem root */ }
    const parent = path.dirname(directory);
    if (parent === directory) throw new Error(`Runtime snapshot cannot locate the package root for ${name} imported from ${importer}`);
    directory = parent;
  }
}

async function walkFiles(directory: string): Promise<string[]> {
  const files: string[] = [];
  const stack = [directory];
  while (stack.length) {
    const current = stack.pop()!;
    for (const item of await readdir(current, { withFileTypes: true })) {
      const full = path.join(current, item.name);
      if (item.isDirectory()) stack.push(full);
      else if (item.isFile()) files.push(full);
    }
  }
  return files.sort();
}

async function collectClosure(entry: string): Promise<{ buildFiles: string[]; packages: Map<string, string> }> {
  const buildFiles = new Set<string>([entry]);
  const packages = new Map<string, string>();
  const queue = [entry];
  while (queue.length) {
    const file = queue.shift()!;
    const source = await readFile(file, "utf8");
    for (const specifier of importSpecifiers(source)) {
      if (specifier.value.startsWith("node:")) continue;
      if (specifier.value.startsWith(".") || path.isAbsolute(specifier.value)) {
        const resolved = await resolveRelativeFile(file, specifier.value);
        if (!resolved) {
          if (specifier.required) throw new Error(`Runtime snapshot cannot resolve static import ${specifier.value} from ${file}`);
          continue;
        }
        if (!buildFiles.has(resolved)) { buildFiles.add(resolved); queue.push(resolved); }
      } else {
        const name = packageNameOf(specifier.value);
        if (!packages.has(name)) packages.set(name, await resolvePackageRoot(file, specifier.value));
      }
    }
  }
  return { buildFiles: [...buildFiles], packages };
}

function hashOf(content: Buffer): string {
  return createHash("sha256").update(content).digest("hex");
}

async function verifySnapshot(root: string, contents: Map<string, Buffer>): Promise<void> {
  const present = new Set((await walkFiles(root)).map(file => toPosix(path.relative(root, file))));
  for (const relative of contents.keys()) {
    if (!present.has(relative)) throw new Error(`Runtime snapshot ${root} is incomplete: missing ${relative}`);
  }
  for (const relative of present) {
    if (!contents.has(relative)) throw new Error(`Runtime snapshot ${root} is corrupted: unexpected file ${relative}`);
  }
  for (const [relative, content] of contents) {
    const actual = await readFile(path.join(root, relative));
    if (hashOf(actual) !== hashOf(content)) {
      throw new Error(`Runtime snapshot ${root} is corrupted: ${relative} does not match its expected SHA-256`);
    }
  }
}

/**
 * Publish an immutable copy of a built Tool Guard hook and its closed set of
 * dependencies, returning the absolute path of the hook inside the snapshot.
 */
export async function snapshotGuardHook(hookFileName: string, options: SnapshotGuardHookOptions = {}): Promise<string> {
  const sourceDir = path.resolve(options.sourceDir ?? snapshotDefaultSourceDir());
  const cacheRoot = path.resolve(options.cacheRoot ?? snapshotDefaultCacheRoot());
  const entry = path.resolve(sourceDir, hookFileName);
  try { if (!(await stat(entry)).isFile()) throw new Error("not a file"); }
  catch { throw new Error(`Runtime snapshot source hook not found: ${entry}`); }

  const { buildFiles, packages } = await collectClosure(entry);
  const layoutRoot = layoutRootOf([sourceDir, ...buildFiles]);

  const contents = new Map<string, Buffer>();
  for (const file of buildFiles) contents.set(toPosix(path.relative(layoutRoot, file)), await readFile(file));
  for (const [name, root] of packages) {
    for (const file of await walkFiles(root)) {
      contents.set(toPosix(path.join("node_modules", name, path.relative(root, file))), await readFile(file));
    }
  }

  const ordered = [...contents.keys()].sort();
  const digest = createHash("sha256");
  for (const relative of ordered) { digest.update(relative); digest.update("\0"); digest.update(contents.get(relative)!); digest.update("\0"); }
  const target = path.join(cacheRoot, digest.digest("hex"));
  const hookPath = path.join(target, toPosix(path.relative(layoutRoot, entry)));

  if (await pathExists(target)) {
    await verifySnapshot(target, contents);
    return hookPath;
  }

  await mkdir(cacheRoot, { recursive: true });
  const temporary = path.join(cacheRoot, `${path.basename(target)}.${randomUUID()}.tmp`);
  try {
    await mkdir(temporary, { recursive: true });
    for (const relative of ordered) {
      const destination = path.join(temporary, relative);
      await mkdir(path.dirname(destination), { recursive: true });
      await writeFile(destination, contents.get(relative)!);
    }
    try {
      await renameWithRetry(temporary, target);
    } catch (error) {
      if (!await pathExists(target)) throw error;
      await verifySnapshot(target, contents);
    }
    return hookPath;
  } finally {
    await rm(temporary, { recursive: true, force: true }).catch(() => {});
  }
}
