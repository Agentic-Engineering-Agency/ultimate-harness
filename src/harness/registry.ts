import { readdir, readFile, access } from "node:fs/promises";
import path from "node:path";
import { parse } from "yaml";
import { adaptersDir } from "./paths.js";
import { validateAdapter, type AdapterDocument } from "../schema/adapter.js";

/**
 * A manifest entry returned by the runtime registry.
 *
 * `id` is taken from the manifest after validation; `path` points at the
 * concrete `.yaml` file the entry was loaded from so callers can surface a
 * filesystem location alongside the parsed document.
 */
export interface AdapterManifestEntry {
  id: string;
  path: string;
  document: AdapterDocument;
}

/**
 * Generic result of a runtime check.
 *
 * Runtime-specific checkers populate `runtime`, `found`, `version`, and any
 * recoverable diagnostics in `errors`. Hard failures (missing or malformed
 * manifests) are surfaced as throws from `load`/`list`; `check` catches those
 * for CLI ergonomics but never substitutes a default manifest.
 */
export interface AdapterCheckResult {
  runtime: string;
  found: boolean;
  version: string;
  errors: string[];
}

/**
 * Function signature for a runtime-specific availability check.
 *
 * Implementations receive the already-validated manifest and the harness root,
 * and must return a structured `AdapterCheckResult`. They are not responsible
 * for manifest loading or validation.
 */
export type AdapterRuntimeChecker = (
  manifest: AdapterDocument,
  root: string,
) => Promise<AdapterCheckResult>;

const MANIFEST_EXTENSIONS = [".yaml", ".yml"] as const;

function isManifestFile(name: string): boolean {
  return MANIFEST_EXTENSIONS.some((ext) => name.endsWith(ext));
}

function manifestIdFromFilename(name: string): string {
  return name.replace(/\.ya?ml$/, "");
}
const SAFE_ADAPTER_ID = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

function assertSafeAdapterId(id: string): void {
  if (!SAFE_ADAPTER_ID.test(id)) {
    throw new Error(`Unsafe adapter id: ${id}`);
  }
}


async function readManifestFile(
  adapterPath: string,
  expectedId: string,
): Promise<AdapterManifestEntry> {
  const content = await readFile(adapterPath, "utf-8");
  let parsed: unknown;
  try {
    parsed = parse(content);
  } catch (err) {
    throw new Error(
      `Adapter manifest YAML parse error in ${adapterPath}: ${(err as Error).message}`,
    );
  }
  let document: AdapterDocument;
  try {
    document = validateAdapter(parsed);
  } catch (err) {
    throw new Error(
      `Adapter manifest validation error in ${adapterPath}: ${(err as Error).message}`,
    );
  }
  if (document.id !== expectedId) {
    throw new Error(
      `Adapter manifest id "${document.id}" does not match file name "${expectedId}.yaml" in ${adapterPath}`,
    );
  }
  return { id: document.id, path: adapterPath, document };
}

/**
 * Runtime adapter registry: lists, loads, and checks adapter manifests.
 *
 * The registry is intentionally narrow. It owns only the three operations the
 * harness needs today — listing `.harness/adapters/*.yaml`, loading one by id,
 * and dispatching an availability check to a runtime-specific function. Any
 * broader adapter lifecycle (prepare/launch/observe) stays out until a second
 * concrete adapter forces the abstraction.
 *
 * Invariants:
 *  - Manifests must parse as YAML, validate against `uh.adapter.v0`, and have
 *    `id` equal to the filename stem. Violations throw — we never paper over
 *    invalid manifests with default values.
 *  - `list` and `load` propagate manifest failures so callers cannot proceed
 *    with garbage. `check` catches those to surface them in `errors[]` for
 *    CLI/UI reporting, but does not substitute defaults.
 */
export class RuntimeRegistry {
  private readonly checkers = new Map<string, AdapterRuntimeChecker>();

  /** Register or replace the checker for a runtime kind. */
  register(runtime: string, checker: AdapterRuntimeChecker): void {
    this.checkers.set(runtime, checker);
  }

  /** Returns true when a runtime checker is registered. */
  hasChecker(runtime: string): boolean {
    return this.checkers.has(runtime);
  }

  /** Returns registered runtime kinds in sorted order. */
  registered(): string[] {
    return [...this.checkers.keys()].sort();
  }

  /**
   * List every adapter manifest under `<root>/.harness/adapters`.
   *
   * Returns an empty list when the directory does not exist. Throws when any
   * manifest is malformed or fails schema validation — partial fabrication is
   * not allowed because callers (e.g. `uh adapter list`, dispatch) must see
   * the real state to make safe decisions.
   */
  async list(root: string): Promise<AdapterManifestEntry[]> {
    const dir = adaptersDir(root);
    let files: string[];
    try {
      files = await readdir(dir);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        return [];
      }
      throw err;
    }
    const manifests = files.filter(isManifestFile).sort();
    const entries: AdapterManifestEntry[] = [];
    for (const file of manifests) {
      const adapterPath = path.join(dir, file);
      const expectedId = manifestIdFromFilename(file);
      entries.push(await readManifestFile(adapterPath, expectedId));
    }
    return entries;
  }

  /**
   * Load and validate a single adapter manifest by id.
   *
   * Throws with a clear message when the manifest is missing, fails to parse,
   * fails schema validation, or declares an id different from the filename.
   */
  async load(root: string, id: string): Promise<AdapterManifestEntry> {
    assertSafeAdapterId(id);
    const adapterPath = path.join(adaptersDir(root), `${id}.yaml`);
    try {
      await access(adapterPath);
    } catch {
      throw new Error(`Adapter manifest not found: ${adapterPath}`);
    }
    return readManifestFile(adapterPath, id);
  }

  /**
   * Run the registered availability check for an adapter id.
   *
   * Catches manifest load failures so the CLI can surface a single error
   * shape regardless of whether the manifest is broken or the runtime CLI is
   * absent. When no checker is registered for the manifest's runtime, returns
   * a failed result — we never fall back to a guessed runtime.
   */
  async check(root: string, id: string): Promise<AdapterCheckResult> {
    let entry: AdapterManifestEntry;
    try {
      entry = await this.load(root, id);
    } catch (err) {
      return {
        runtime: id,
        found: false,
        version: "",
        errors: [(err as Error).message],
      };
    }
    const checker = this.checkers.get(entry.document.runtime);
    if (!checker) {
      return {
        runtime: entry.document.runtime,
        found: false,
        version: "",
        errors: [
          `No runtime checker registered for runtime "${entry.document.runtime}"`,
        ],
      };
    }
    return checker(entry.document, root);
  }
}

/**
 * Default process-wide registry instance.
 *
 * Adapter modules (e.g. `src/adapters/hermes.ts`) register their checkers
 * against this singleton on import. Consumers that need an isolated registry
 * (notably the test suite) construct a fresh `new RuntimeRegistry()`.
 */
export const runtimeRegistry = new RuntimeRegistry();
