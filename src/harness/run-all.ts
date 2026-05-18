/**
 * UH-56 — cross-runtime QA harness.
 *
 * Fan out a single mission across multiple adapter runtimes, capture
 * each runtime's diff + outcome in its own sandbox, and produce a
 * markdown comparison report. The orchestration is intentionally
 * decoupled from the CLI's existing `RUNTIME_WIRINGS` so tests can
 * inject fakes for both `runtimeRunner` and `sandboxOps`.
 */
import { createHash } from "node:crypto";
import path from "node:path";
import { mkdir, readFile, writeFile, appendFile } from "node:fs/promises";
import { extractDiffPaths } from "./diff-classifier.js";

export interface RuntimeRunResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  result?: { status?: string; errors?: string[] };
}

export type RuntimeRunner = (
  runtime: string,
  root: string,
  missionPath: string,
) => Promise<RuntimeRunResult>;

export interface SandboxRecord {
  id: string;
  path: string;
}

export interface SandboxOps {
  create: (root: string, opts: { id: string; missionId: string }) => Promise<SandboxRecord>;
}

export interface RunAllOptions {
  /** Runtimes to fan out to. Pass-through; caller resolves "active" set. */
  runtimes: readonly string[];
  /** Inject the per-runtime runner (default: invoke the CLI dispatch). */
  runtimeRunner: RuntimeRunner;
  /** Inject sandbox creation (default: harness/sandbox createSandbox). */
  sandboxOps: SandboxOps;
  /** Inject the clock so tests can pin durations. */
  now?: () => number;
  /** When true, run sequentially. Default false (parallel). */
  serial?: boolean;
  /** Suffix for generated sandbox ids. Default: short timestamp. */
  sandboxIdSuffix?: () => string;
}

export interface RuntimeOutcome {
  runtime: string;
  sandboxId: string;
  sandboxPath: string;
  status: "succeeded" | "failed" | "blocked" | "error";
  exitCode: number;
  durationMs: number;
  diff: string;
  diffHash: string;
  diffPaths: string[];
  sentinel: string;
  stdoutSnippet: string;
  stderrSnippet: string;
  errorMessage?: string;
}

export interface ComparisonGroup {
  diffHash: string;
  runtimes: string[];
}

export interface RuntimeComparison {
  missionId: string;
  outcomes: RuntimeOutcome[];
  /** Diff-hash equivalence classes; longest group first. */
  groups: ComparisonGroup[];
  /** True when every successful runtime produced the same diff. */
  agreement: boolean;
  agreementRuntimes: string[];
  divergentRuntimes: string[];
}

const SNIPPET_LIMIT = 800;

function snippet(value: string): string {
  const trimmed = value.trim();
  return trimmed.length > SNIPPET_LIMIT ? `${trimmed.slice(0, SNIPPET_LIMIT)}…` : trimmed;
}

function hashDiff(diff: string): string {
  return createHash("sha256").update(diff).digest("hex").slice(0, 16);
}


function classifyStatus(res: RuntimeRunResult): RuntimeOutcome["status"] {
  if (res.result?.status === "blocked") return "blocked";
  if (res.exitCode === 0) return "succeeded";
  return "failed";
}

async function readFileSafe(file: string): Promise<string> {
  try {
    return await readFile(file, "utf-8");
  } catch {
    return "";
  }
}

/**
 * Run `mission` against each runtime in `options.runtimes`, one sandbox
 * per runtime. Returns a `RuntimeComparison` summarizing every outcome
 * and grouping by diff identity. Never throws on per-runtime failure;
 * each runtime's outcome stands alone so a single broken adapter does
 * not stop the comparison.
 */
export async function runMissionAcrossRuntimes(
  root: string,
  missionId: string,
  options: RunAllOptions,
): Promise<RuntimeComparison> {
  const now = options.now ?? (() => Date.now());
  const sandboxIdSuffix = options.sandboxIdSuffix ?? defaultSandboxIdSuffix;

  // Sandbox creation goes through `harness/sandbox.ts`, which performs an
  // unlocked read-modify-write on the shared `sandboxes/index.yaml`.
  // Creating in parallel would race the index. Serialize creation, then
  // dispatch adapter runs in parallel (where the win is).
  interface PreparedSandbox {
    runtime: string;
    sandboxId: string;
    sandboxPath: string;
    createError?: Error;
    startedAt: number;
  }
  const prepared: PreparedSandbox[] = [];
  for (const runtime of options.runtimes) {
    const sandboxId = `sbx-${missionId}-${runtime}-${sandboxIdSuffix()}`;
    const startedAt = now();
    try {
      const sandbox = await options.sandboxOps.create(root, { id: sandboxId, missionId });
      prepared.push({ runtime, sandboxId: sandbox.id, sandboxPath: sandbox.path, startedAt });
    } catch (err) {
      prepared.push({
        runtime,
        sandboxId,
        sandboxPath: "",
        createError: err instanceof Error ? err : new Error(String(err)),
        startedAt,
      });
    }
  }

  const runOne = async (slot: PreparedSandbox): Promise<RuntimeOutcome> => {
    if (slot.createError) {
      return {
        runtime: slot.runtime,
        sandboxId: slot.sandboxId,
        sandboxPath: slot.sandboxPath,
        status: "error",
        exitCode: 1,
        durationMs: Math.max(now() - slot.startedAt, 0),
        diff: "",
        diffHash: hashDiff(""),
        diffPaths: [],
        sentinel: "",
        stdoutSnippet: "",
        stderrSnippet: "",
        errorMessage: slot.createError.message,
      };
    }
    try {
      const missionPath = path.join(slot.sandboxPath, ".harness", "missions", missionId, "mission.yaml");
      const result = await options.runtimeRunner(slot.runtime, slot.sandboxPath, missionPath);
      const finishedAt = now();
      const missionDir = path.join(slot.sandboxPath, ".harness", "missions", missionId);
      const [diff, sentinel] = await Promise.all([
        readFileSafe(path.join(missionDir, "diff.patch")),
        readFileSafe(path.join(missionDir, "runtime-final.txt")),
      ]);
      return {
        runtime: slot.runtime,
        sandboxId: slot.sandboxId,
        sandboxPath: slot.sandboxPath,
        status: classifyStatus(result),
        exitCode: result.exitCode,
        durationMs: Math.max(finishedAt - slot.startedAt, 0),
        diff,
        diffHash: hashDiff(diff),
        diffPaths: extractDiffPaths(diff),
        sentinel,
        stdoutSnippet: snippet(result.stdout ?? ""),
        stderrSnippet: snippet(result.stderr ?? ""),
      };
    } catch (err) {
      return {
        runtime: slot.runtime,
        sandboxId: slot.sandboxId,
        sandboxPath: slot.sandboxPath,
        status: "error",
        exitCode: 1,
        durationMs: Math.max(now() - slot.startedAt, 0),
        diff: "",
        diffHash: hashDiff(""),
        diffPaths: [],
        sentinel: "",
        stdoutSnippet: "",
        stderrSnippet: "",
        errorMessage: err instanceof Error ? err.message : String(err),
      };
    }
  };

  const outcomes: RuntimeOutcome[] = options.serial
    ? await runtimesSerial(prepared, runOne)
    : await Promise.all(prepared.map(runOne));

  return compareRuntimeOutcomes(missionId, outcomes);
}

async function runtimesSerial<TIn, TOut>(items: readonly TIn[], fn: (item: TIn) => Promise<TOut>): Promise<TOut[]> {
  const out: TOut[] = [];
  for (const it of items) out.push(await fn(it));
  return out;
}

/**
 * Pure comparator. Groups outcomes by `diffHash`, sorted by descending
 * group size (largest agreement first). When every successful outcome
 * shares a diff hash, `agreement` is true.
 */
export function compareRuntimeOutcomes(missionId: string, outcomes: RuntimeOutcome[]): RuntimeComparison {
  const grouped = new Map<string, string[]>();
  for (const outcome of outcomes) {
    const list = grouped.get(outcome.diffHash) ?? [];
    list.push(outcome.runtime);
    grouped.set(outcome.diffHash, list);
  }
  const groups: ComparisonGroup[] = [...grouped.entries()]
    .map(([diffHash, runtimes]) => ({ diffHash, runtimes }))
    .sort((a, b) => b.runtimes.length - a.runtimes.length);

  const successful = outcomes.filter((o) => o.status === "succeeded");
  const successHashes = new Set(successful.map((o) => o.diffHash));
  const agreement = successful.length >= 2 && successHashes.size === 1;
  const agreementHash = agreement ? [...successHashes][0] : null;
  const agreementRuntimes = agreementHash
    ? successful.filter((o) => o.diffHash === agreementHash).map((o) => o.runtime)
    : [];
  const divergentRuntimes = agreementHash
    ? outcomes.filter((o) => o.diffHash !== agreementHash).map((o) => o.runtime)
    : outcomes.map((o) => o.runtime);

  return {
    missionId,
    outcomes,
    groups,
    agreement,
    agreementRuntimes,
    divergentRuntimes,
  };
}

/** Render a human-readable markdown report. Deterministic; safe to commit. */
export function renderRuntimeComparisonMarkdown(comparison: RuntimeComparison): string {
  const lines: string[] = [];
  lines.push(`# Cross-runtime comparison: ${comparison.missionId}`);
  lines.push("");
  lines.push(`- Total runtimes: ${comparison.outcomes.length}`);
  lines.push(`- Agreement: ${comparison.agreement ? "yes" : "no"}${comparison.agreement ? ` (${comparison.agreementRuntimes.join(", ")})` : ""}`);
  if (!comparison.agreement && comparison.divergentRuntimes.length > 0) {
    lines.push(`- Divergent: ${comparison.divergentRuntimes.join(", ")}`);
  }
  lines.push("");
  lines.push("## Per-runtime outcomes");
  lines.push("");
  lines.push("| Runtime | Status | Exit | Duration | Diff hash | Diff files | Sandbox |");
  lines.push("|---|---|---|---|---|---|---|");
  for (const o of comparison.outcomes) {
    lines.push(
      `| \`${o.runtime}\` | ${o.status} | ${o.exitCode} | ${o.durationMs}ms | \`${o.diffHash}\` | ${o.diffPaths.length} | \`${o.sandboxId}\` |`,
    );
  }
  lines.push("");
  lines.push("## Diff equivalence groups");
  lines.push("");
  for (const g of comparison.groups) {
    lines.push(`- \`${g.diffHash}\` — ${g.runtimes.join(", ")}`);
  }
  lines.push("");
  lines.push("## Diff paths per runtime");
  lines.push("");
  for (const o of comparison.outcomes) {
    lines.push(`### ${o.runtime}`);
    lines.push("");
    if (o.diffPaths.length === 0) {
      lines.push("_(no files in diff)_");
    } else {
      for (const p of o.diffPaths) lines.push(`- ${p}`);
    }
    lines.push("");
  }
  lines.push("## Sentinels");
  lines.push("");
  for (const o of comparison.outcomes) {
    const trimmed = o.sentinel.trim();
    lines.push(`### ${o.runtime}`);
    lines.push("");
    if (trimmed.length === 0) {
      lines.push("_(no runtime-final.txt captured)_");
    } else {
      lines.push("```");
      lines.push(trimmed);
      lines.push("```");
    }
    lines.push("");
  }
  if (comparison.outcomes.some((o) => o.errorMessage)) {
    lines.push("## Errors");
    lines.push("");
    for (const o of comparison.outcomes) {
      if (o.errorMessage) lines.push(`- \`${o.runtime}\`: ${o.errorMessage}`);
    }
    lines.push("");
  }
  return lines.join("\n");
}

/**
 * Write the comparison report and append `runtime.compared` events to
 * the canonical mission's events.ndjson for live observers. Returns the
 * absolute path of the report.
 */
export async function persistRuntimeComparison(
  canonicalMissionDir: string,
  comparison: RuntimeComparison,
): Promise<string> {
  await mkdir(canonicalMissionDir, { recursive: true });
  const reportPath = path.join(canonicalMissionDir, "runtime-comparison.md");
  await writeFile(reportPath, renderRuntimeComparisonMarkdown(comparison), "utf-8");

  const eventsPath = path.join(canonicalMissionDir, "events.ndjson");
  const ts = new Date().toISOString();
  const rows: string[] = [];
  for (const o of comparison.outcomes) {
    rows.push(JSON.stringify({
      type: "runtime.compared",
      timestamp: ts,
      mission_id: comparison.missionId,
      runtime: o.runtime,
      status: o.status,
      exit_code: o.exitCode,
      duration_ms: o.durationMs,
      diff_hash: o.diffHash,
      diff_files: o.diffPaths.length,
      sandbox_id: o.sandboxId,
    }));
  }
  rows.push(JSON.stringify({
    type: "runtime.comparison.summary",
    timestamp: ts,
    mission_id: comparison.missionId,
    agreement: comparison.agreement,
    agreement_runtimes: comparison.agreementRuntimes,
    divergent_runtimes: comparison.divergentRuntimes,
  }));
  await appendFile(eventsPath, rows.join("\n") + "\n", "utf-8");
  return reportPath;
}

function defaultSandboxIdSuffix(): string {
  const d = new Date();
  const pad = (n: number, w: number) => String(n).padStart(w, "0");
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1, 2)}${pad(d.getUTCDate(), 2)}${pad(d.getUTCHours(), 2)}${pad(d.getUTCMinutes(), 2)}${pad(d.getUTCSeconds(), 2)}`;
}
