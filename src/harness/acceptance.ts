import { execFile, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { cp, lstat, mkdir, readFile, readdir, rm, stat, symlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { parse, stringify } from "yaml";
import { z } from "zod";
import { initializeHarness } from "./init.js";
import { runtimeRegistry } from "./registry.js";
import { buildCommandCodeProbeArgs, parseCommandCodeVersion } from "../adapters/command-code.js";
import { AcceptanceEvidenceSchema, AcceptanceRegistryEntrySchema, AcceptanceRegistrySchema, type AcceptanceEvidence, type AcceptanceExpected } from "../schema/acceptance.js";

const execFileAsync = promisify(execFile);
const UNKNOWN: string = "unknown";
export type AcceptanceFacts = Record<string, unknown>;
export type AcceptanceState = "proven" | "stale" | "failed" | "unproven" | "fixture_only";

/**
 * Registry entries may declare `support_shim`. The shared schema module owns
 * the base contract, so the runner layers the optional field on where it
 * consumes it and keeps every other field strict.
 */
const SupportShimRegistryEntrySchema = AcceptanceRegistryEntrySchema.extend({ support_shim: z.string().min(1).optional() });
export type AcceptanceRegistryEntry = z.infer<typeof SupportShimRegistryEntrySchema>;
export type AcceptanceRegistry = { schema_version: "uh.acceptance-registry.v0"; entries: Record<string, AcceptanceRegistryEntry> };

/**
 * Evidence records layer the CLI outcome of the mission-run child onto the
 * shared schema module (same pattern as `support_shim`): the runner always
 * writes `cli`, records written before it existed may omit it, so the read
 * side keeps it optional. `exit_code` is null only when no CLI process ran
 * (wrapper-unavailable evidence).
 */
export const AcceptanceCliOutcomeSchema = z.object({
  exit_code: z.number().int().nullable(),
  stderr_tail: z.string(),
  stdout_tail: z.string(),
}).strict();
export type AcceptanceCliOutcome = z.infer<typeof AcceptanceCliOutcomeSchema>;
const AcceptanceEvidenceRecordSchema = AcceptanceEvidenceSchema.extend({ cli: AcceptanceCliOutcomeSchema.optional() });
export type AcceptanceEvidenceRecord = z.infer<typeof AcceptanceEvidenceRecordSchema>;

export async function loadAcceptanceRegistry(root: string): Promise<AcceptanceRegistry> {
  const raw = await readFile(path.join(root, "acceptance", "registry.yaml"), "utf8");
  return AcceptanceRegistrySchema.extend({ entries: z.record(z.string().min(1), SupportShimRegistryEntrySchema) }).parse(parse(raw));
}

function readPath(value: unknown, key: string): unknown {
  if (!value || typeof value !== "object") return undefined;
  return (value as Record<string, unknown>)[key];
}

function compareValue(expected: unknown, observed: unknown, field: string, mismatches: AcceptanceEvidence["mismatches"]): void {
  if (expected && typeof expected === "object" && !Array.isArray(expected)) {
    for (const [key, value] of Object.entries(expected as Record<string, unknown>)) {
      compareValue(value, readPath(observed, key), `${field}.${key}`, mismatches);
    }
    return;
  }
  if (expected !== observed) mismatches.push({ field, expected, observed });
}

function hasForwardSlashPaths(value: unknown, key = ""): boolean {
  if (typeof value === "string") {
    return !/(?:path|scope)$/i.test(key) || !value.includes("\\");
  }
  if (Array.isArray(value)) return value.every((item) => hasForwardSlashPaths(item, key));
  if (!value || typeof value !== "object") return true;
  return Object.entries(value as Record<string, unknown>).every(([childKey, childValue]) => hasForwardSlashPaths(childValue, childKey));
}

export function compareAcceptanceFacts(expected: AcceptanceExpected, observed: AcceptanceFacts): AcceptanceEvidence["mismatches"] {
  const mismatches: AcceptanceEvidence["mismatches"] = [];
  for (const [field, expectedValue] of Object.entries(expected)) {
    if (field === "fact_sources") continue;
    // `exercised_report` is reported in the evidence, never judged: a mechanism
    // that did not fire is a report fact, not a failure.
    if (field === "exercised_report") continue;
    if (field === "invariants") {
      const observedInvariants = observed.invariants && typeof observed.invariants === "object"
        ? observed.invariants as Record<string, unknown>
        : {};
      const names = Array.isArray(expectedValue) ? expectedValue.filter((item): item is string => typeof item === "string") : [];
      for (const name of names) {
        if (observedInvariants[name] !== true) mismatches.push({ field: `invariants.${name}`, expected: true, observed: observedInvariants[name] });
      }
      continue;
    }
    if (field === "required_files") {
      const files = observed.files;
      const requiredFiles = Array.isArray(expectedValue) ? expectedValue.filter((file): file is string => typeof file === "string") : [];
      if (!Array.isArray(files) || requiredFiles.some((file) => !files.includes(file))) {
        mismatches.push({ field, expected: expectedValue, observed: files });
      }
      continue;
    }
    if (field === "required_records") {
      const records = observed.records && typeof observed.records === "object" ? observed.records : observed;
      compareValue(expectedValue, records, field, mismatches);
      continue;
    }
    if (field === "guardian_receipt") {
      if (expectedValue === true && (observed.settlement_confirmed !== true || observed.guardian_receipt !== true)) {
        mismatches.push({ field, expected: true, observed: { settlement_confirmed: observed.settlement_confirmed, guardian_receipt: observed.guardian_receipt } });
      }
      continue;
    }
    if (field === "path_style") {
      if (expectedValue !== observed.path_style) mismatches.push({ field, expected: expectedValue, observed: observed.path_style });
      continue;
    }
    const rawObserved = observed[field];
    const fieldValue = field === "resumed" && rawObserved === undefined ? false : rawObserved;
    const fieldObserved = field === "workers" && Array.isArray(rawObserved)
      ? Object.fromEntries(rawObserved.flatMap((worker) => {
          if (!worker || typeof worker !== "object") return [];
          const record = worker as Record<string, unknown>;
          return typeof record.id === "string" ? [[record.id, record]] : [];
        }))
      : field === "outputs" && Array.isArray(observed.workers)
        ? Object.fromEntries(observed.workers.flatMap((worker) => {
            if (!worker || typeof worker !== "object") return [];
            const record = worker as Record<string, unknown>;
            const outputs = Array.isArray(record.outputs) ? record.outputs : [];
            const passed = outputs.length > 0 && outputs.every((output) => output && typeof output === "object" && (output as Record<string, unknown>).status === "passed");
            return typeof record.id === "string" ? [[record.id, passed ? "passed" : "failed"]] : [];
          }))
        : fieldValue;
    compareValue(expectedValue, fieldObserved, field, mismatches);
  }
  return mismatches;
}


export type AcceptanceInputIdentity = { runtime: string; model: string; runtimeVersion?: string };
export type AcceptanceInputDigest = { digest: string; resolved: number; files: string[] };
export type AcceptanceClassification = { state: AcceptanceState; reasons: string[] };
export type AcceptanceClassifyContext = {
  /** Repository root whose tracked files are the evidence's inputs. */
  root?: string;
  /** Glob patterns naming the files the probe asserts (see `acceptanceInputs`). */
  inputs?: string[];
  /** Runtime version to fold into the digest when it is known. */
  runtimeVersion?: string;
  /**
   * Directory holding the evidence records (`<root>/acceptance/evidence`). When
   * no explicit `root` is given and the evidence carries an `input_digest`, the
   * repository root is resolved from this location (two levels up) so freshness
   * is judged by the digest instead of silently falling back to the commit rule.
   */
  evidenceRoot?: string;
};

const DEFAULT_INPUT_PATTERNS: readonly string[] = ["acceptance/support/**", "src/**"];

/**
 * The files whose behaviour an entry's probe asserts. `inputs` when declared,
 * else a conservative default: the entry's own mission directory, the shared
 * acceptance support files, and every harness source file.
 */
export function defaultAcceptanceInputs(entry: { mission: string }): string[] {
  const missionDirectory = entry.mission.split("/").slice(0, -1).join("/");
  return [`acceptance/${missionDirectory}/**`, ...DEFAULT_INPUT_PATTERNS];
}

export function acceptanceInputs(entry: { mission: string; inputs?: string[] }): string[] {
  return entry.inputs && entry.inputs.length > 0 ? entry.inputs : defaultAcceptanceInputs(entry);
}

function inputPatternToRegExp(pattern: string): RegExp {
  let regex = "";
  for (let index = 0; index < pattern.length; index += 1) {
    const char = pattern[index];
    if (char === "*") {
      if (pattern[index + 1] === "*") {
        index += 1;
        if (pattern[index + 1] === "/") {
          index += 1;
          regex += "(?:.*/)?";
        } else {
          regex += ".*";
        }
      } else {
        regex += "[^/]*";
      }
    } else if (char === "?") {
      regex += "[^/]";
    } else {
      regex += char.replace(/[.+^${}()|[\]\\]/g, "\\$&");
    }
  }
  return new RegExp(`^${regex}$`);
}

function matchesAcceptanceInput(relativePath: string, patterns: string[]): boolean {
  return patterns.some((pattern) => inputPatternToRegExp(pattern).test(relativePath));
}

function sha256Hex(content: Buffer | string): string {
  return createHash("sha256").update(content).digest("hex");
}

/**
 * Input hashing normalizes CRLF to LF so a commit blob (stored LF) and a
 * checked-out working-tree file hash identically when their content is
 * semantically unchanged — otherwise every Windows checkout would look stale.
 */
function normalizeInputContent(content: Buffer): string {
  return content.toString("utf8").replace(/\r\n/g, "\n");
}

async function listAcceptanceInputFiles(root: string): Promise<string[]> {
  try {
    const { stdout } = await execFileAsync("git", ["ls-files", "-z"], { cwd: root, maxBuffer: 32 * 1024 * 1024 });
    return stdout.split("\0").filter((entry) => entry !== "").map((entry) => entry.split(path.sep).join("/"));
  } catch {
    return listWalkedInputFiles(root);
  }
}

async function listWalkedInputFiles(root: string): Promise<string[]> {
  const files: string[] = [];
  const pending = [root];
  while (pending.length > 0) {
    const directory = pending.pop();
    if (!directory) continue;
    let children;
    try {
      children = await readdir(directory, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const child of children) {
      if (child.name === ".git" || child.name === "node_modules") continue;
      const childPath = path.join(directory, child.name);
      if (child.isDirectory()) pending.push(childPath);
      else if (child.isFile()) files.push(path.relative(root, childPath).split(path.sep).join("/"));
    }
  }
  return files;
}

async function listInputFilesAtCommit(root: string, commit: string): Promise<string[]> {
  const { stdout } = await execFileAsync("git", ["ls-tree", "-r", "--name-only", "-z", commit], { cwd: root, maxBuffer: 32 * 1024 * 1024 });
  return stdout.split("\0").filter((entry) => entry !== "").map((entry) => entry.split(path.sep).join("/"));
}

async function readInputContent(root: string, relativePath: string, commit?: string): Promise<Buffer | undefined> {
  try {
    if (commit) {
      const result = await execFileAsync("git", ["show", `${commit}:${relativePath}`], { cwd: root, maxBuffer: 32 * 1024 * 1024, encoding: "buffer" });
      return result.stdout as unknown as Buffer;
    }
    return await readFile(path.join(root, relativePath));
  } catch {
    return undefined;
  }
}

/**
 * sha256 over the sorted (relative path, content sha256) list of every tracked
 * file matching `inputs`, plus the runtime id, runtime version when known, and
 * the model. `commit` reads file contents from that git revision (via
 * `git show`); otherwise the working tree is read.
 */
export async function computeAcceptanceInputDigest(
  root: string,
  inputs: string[],
  identity: AcceptanceInputIdentity,
  options: { commit?: string } = {},
): Promise<AcceptanceInputDigest> {
  const allFiles = options.commit
    ? await listInputFilesAtCommit(root, options.commit)
    : await listAcceptanceInputFiles(root);
  const matched = allFiles.filter((relativePath) => matchesAcceptanceInput(relativePath, inputs)).sort();
  const lines = [`runtime=${identity.runtime}`, `runtime_version=${identity.runtimeVersion ?? UNKNOWN}`, `model=${identity.model}`];
  const files: string[] = [];
  for (const relativePath of matched) {
    const content = await readInputContent(root, relativePath, options.commit);
    if (content === undefined) continue;
    lines.push(`${relativePath}\t${sha256Hex(normalizeInputContent(content))}`);
    files.push(relativePath);
  }
  return { digest: sha256Hex(lines.join("\n")), resolved: files.length, files };
}

/**
 * Input files whose content differs between a base commit and the current
 * working tree, restricted to those matching the entry's inputs. Returns an
 * empty list when the base commit cannot be resolved.
 */
export async function changedAcceptanceInputs(root: string, inputs: string[], baseCommit?: string): Promise<string[]> {
  if (!baseCommit || baseCommit === UNKNOWN) return [];
  let baseFiles: string[];
  try {
    baseFiles = await listInputFilesAtCommit(root, baseCommit);
  } catch {
    return [];
  }
  const currentFiles = await listAcceptanceInputFiles(root);
  const relevant = new Set([
    ...baseFiles.filter((relativePath) => matchesAcceptanceInput(relativePath, inputs)),
    ...currentFiles.filter((relativePath) => matchesAcceptanceInput(relativePath, inputs)),
  ]);
  const changed: string[] = [];
  for (const relativePath of [...relevant].sort()) {
    const before = await readInputContent(root, relativePath, baseCommit);
    const after = await readInputContent(root, relativePath);
    const beforeHash = before === undefined ? null : sha256Hex(normalizeInputContent(before));
    const afterHash = after === undefined ? null : sha256Hex(normalizeInputContent(after));
    if (beforeHash !== afterHash) changed.push(relativePath);
  }
  return changed;
}

export async function classifyAcceptance(
  evidence: Pick<AcceptanceEvidence, "outcome" | "checked_at"> & Partial<Pick<AcceptanceEvidence, "harness_commit" | "input_digest" | "runtime" | "model" | "runtime_version">> | null,
  freshnessDays: number,
  now = new Date(),
  currentCommit?: string,
  context: AcceptanceClassifyContext = {},
): Promise<AcceptanceClassification> {
  if (!evidence) return { state: "unproven", reasons: [] };
  if (evidence.outcome === "failed") return { state: "failed", reasons: [] };
  const age = now.getTime() - Date.parse(evidence.checked_at);
  const fresh = Number.isFinite(age) && age <= freshnessDays * 86_400_000;
  if (evidence.input_digest) {
    // With no explicit root, resolve it from the evidence location rather than
    // falling through to the commit rule: a digest-bearing record can always be
    // re-hashed, so the commit rule is only a legacy path.
    const digestRoot = context.root ?? (context.evidenceRoot !== undefined ? path.resolve(context.evidenceRoot, "..", "..") : undefined);
    if (digestRoot !== undefined) {
      const version = evidence.runtime_version ?? context.runtimeVersion;
      const identity: AcceptanceInputIdentity = {
        runtime: evidence.runtime ?? UNKNOWN,
        model: evidence.model ?? UNKNOWN,
        ...(version ? { runtimeVersion: version } : {}),
      };
      const current = await computeAcceptanceInputDigest(digestRoot, context.inputs ?? [], identity);
      if (current.digest === evidence.input_digest) {
        return fresh ? { state: "proven", reasons: [] } : { state: "stale", reasons: ["freshness window exceeded"] };
      }
      const changed = await changedAcceptanceInputs(digestRoot, context.inputs ?? [], evidence.harness_commit);
      return { state: "stale", reasons: changed.length > 0 ? changed.slice(0, 5) : ["input digest changed"] };
    }
  }
  if (currentCommit && evidence.harness_commit && evidence.harness_commit !== currentCommit) {
    return { state: "stale", reasons: [`harness commit ${evidence.harness_commit} != ${currentCommit}`] };
  }
  return fresh ? { state: "proven", reasons: [] } : { state: "stale", reasons: ["freshness window exceeded"] };
}

async function latestEvidence(evidenceRoot: string, capability: string): Promise<AcceptanceEvidenceRecord | null> {
  try {
    const file = path.join(evidenceRoot, capability, "latest.json");
    return AcceptanceEvidenceRecordSchema.parse(JSON.parse(await readFile(file, "utf8")));
  } catch {
    return null;
  }
}

export async function acceptanceStatus(root: string, now = new Date()): Promise<{ counts: Record<AcceptanceState, number>; failed: string[]; unproven: string[]; states: Record<string, AcceptanceState>; reasons: Record<string, string[]> }> {
  const registry = await loadAcceptanceRegistry(root);
  const currentCommit = await gitCommit(root);
  const evidenceRoot = path.join(root, "acceptance", "evidence");
  const counts: Record<AcceptanceState, number> = { proven: 0, stale: 0, failed: 0, unproven: 0, fixture_only: 0 };
  const failed: string[] = [];
  const unproven: string[] = [];
  const states: Record<string, AcceptanceState> = {};
  const reasons: Record<string, string[]> = {};
  for (const [capability, entry] of Object.entries(registry.entries)) {
    const evidence = await latestEvidence(evidenceRoot, capability);
    const classified = entry.real_mission === "not_applicable" && !evidence
      ? { state: "fixture_only" as AcceptanceState, reasons: [] as string[] }
      : await classifyAcceptance(evidence, entry.freshness_days, now, currentCommit, { root, inputs: acceptanceInputs(entry), evidenceRoot });
    states[capability] = classified.state;
    counts[classified.state] += 1;
    if (classified.reasons.length > 0) reasons[capability] = classified.reasons;
    if (classified.state === "failed") failed.push(capability);
    if (classified.state === "unproven") unproven.push(capability);
  }
  return { counts, failed, unproven, states, reasons };
}

export async function renderAcceptanceReport(root: string, now = new Date(), options: { evidenceRoot?: string } = {}): Promise<string> {
  const registry = await loadAcceptanceRegistry(root);
  const currentCommit = await gitCommit(root);
  const evidenceRoot = options.evidenceRoot ?? path.join(root, "acceptance", "evidence");
  const reportDirectory = path.join(root, "docs", "acceptance");
  const rows = ["<!-- Generated by `uh acceptance report`; do not edit by hand. -->", "# Acceptance evidence", "", "| Capability | Inventory ID | Title | State | Last checked | Runtime | Model | Cost (USD) | Evidence |", "|---|---|---|---|---|---|---|---:|---|"];
  for (const [capability, entry] of Object.entries(registry.entries)) {
    const evidence = await latestEvidence(evidenceRoot, capability);
    const state = entry.real_mission === "not_applicable" && !evidence
      ? "fixture_only"
      : (await classifyAcceptance(evidence, entry.freshness_days, now, currentCommit, { root, inputs: acceptanceInputs(entry), evidenceRoot })).state;
    const evidencePath = path.relative(reportDirectory, path.join(evidenceRoot, capability, "latest.json")).split(path.sep).join("/");
    const evidenceCell = evidence ? `[latest](${evidencePath})` : "—";
    rows.push(`| ${capability} | ${entry.capability ?? capability} | ${entry.title} | ${state} | ${evidence?.checked_at ?? "—"} | ${evidence?.runtime ?? entry.runtime} | ${evidence?.model ?? entry.model ?? "—"} | ${evidence?.cost_usd ?? "—"} | ${evidenceCell} |`);
  }
  return `${rows.join("\n")}\n`;
}

async function runProcess(command: string, args: string[], cwd: string, distRoot?: string, extraEnv?: Record<string, string>): Promise<{ code: number; stdout: string; stderr: string }> {
  return await new Promise((resolve) => {
    const child = spawn(command, args, { cwd, env: { ...process.env, ...(distRoot ? { UH_HARNESS_DIST: path.resolve(distRoot, "dist") } : {}), ...extraEnv }, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += String(chunk); });
    child.stdout.on("error", () => undefined);
    child.stderr.on("data", (chunk) => { stderr += String(chunk); });
    child.stderr.on("error", () => undefined);
    child.on("close", (code) => resolve({ code: code ?? 1, stdout, stderr }));
    child.on("error", (error) => resolve({ code: 1, stdout, stderr: `${stderr}${error.message}` }));
  });
}
async function runProcessAndCancel(command: string, args: string[], cwd: string, cancelCommand: string, cancelArgs: string[], delayMs: number, distRoot?: string, extraEnv?: Record<string, string>): Promise<{ code: number; stdout: string; stderr: string }> {
  return await new Promise((resolve) => {
    const child = spawn(command, args, { cwd, env: { ...process.env, ...(distRoot ? { UH_HARNESS_DIST: path.resolve(distRoot, "dist") } : {}), ...extraEnv }, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => { void runProcess(cancelCommand, cancelArgs, cwd, distRoot); }, delayMs);
    child.stdout.on("data", (chunk) => { stdout += String(chunk); });
    child.stdout.on("error", () => undefined);
    child.stderr.on("data", (chunk) => { stderr += String(chunk); });
    child.stderr.on("error", () => undefined);
    child.on("close", (code) => { clearTimeout(timer); resolve({ code: code ?? 1, stdout, stderr }); });
    child.on("error", (error) => { clearTimeout(timer); resolve({ code: 1, stdout, stderr: `${stderr}${error.message}` }); });
  });
}

async function listAcceptanceFiles(root: string): Promise<string[]> {
  const files: string[] = [];
  const pending = [root];
  while (pending.length > 0) {
    const directory = pending.pop();
    if (!directory) continue;
    let children;
    try {
      children = await readdir(directory, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const child of children) {
      const childPath = path.join(directory, child.name);
      if (child.isDirectory()) pending.push(childPath);
      else files.push(childPath);
    }
  }
  return files;
}

/**
 * A command runner for the acceptance runner's own side commands (runtime
 * version probe and injected cancel/steer actions). Defaults to `runProcess`;
 * tests inject a fake so no real runtime is ever contacted.
 */
export type AcceptanceCommandRunner = (command: string, args: string[], cwd: string) => Promise<{ code: number; stdout: string; stderr: string }>;

/** Commit identity the harness uses when it commits worker work itself. */
const HARNESS_COMMIT_EMAIL = "uh-team@example.com";
/** Harness-owned policy files that a run must leave byte-identical across every copy. */
const PROTECTED_POLICY_FILES = [".commandcode/settings.json", ".commandcode/.gitignore", ".harness/.gitignore"];
/** Lockfiles whose appearance in a worker worktree means a package manager ran. */
const LOCKFILE_NAMES = ["package-lock.json", "npm-shrinkwrap.json", "yarn.lock", "pnpm-lock.yaml", "bun.lock", "bun.lockb"];

/** The runtime version probe command per runtime; others fall back to `<runtime> --version`. */
const RUNTIME_VERSION_PROBES: Record<string, { command: string; args: string[] }> = {
  "command-code": { command: "cmdc", args: buildCommandCodeProbeArgs() },
  "oh-my-pi": { command: "omp", args: ["--version"] },
};

/**
 * Resolve the runtime version that must enter the input digest. Command Code
 * reuses the adapter's check (`cmdc --version --no-auto-update`); oh-my-pi uses
 * its `--version` command; other runtimes use `<runtime> --version`. The
 * adapter manifest's `cli_command`/`cli_args` win when present. Returns
 * `"unknown"` whenever the version cannot be read.
 */
export async function resolveAcceptanceRuntimeVersion(runtime: string, root: string, run: AcceptanceCommandRunner = runProcess): Promise<string> {
  const probe = RUNTIME_VERSION_PROBES[runtime] ?? { command: runtime, args: ["--version"] };
  let command = probe.command;
  let args = probe.args;
  try {
    const manifest = (await runtimeRegistry.load(root, runtime)).document;
    const cliCommand = manifest.config?.cli_command;
    if (typeof cliCommand === "string" && cliCommand.length > 0) command = cliCommand;
    if (runtime === "command-code") {
      const runtimeConfig = manifest.config?.runtime_config as Record<string, unknown> | undefined;
      const cliArgs = Array.isArray(runtimeConfig?.cli_args) ? runtimeConfig.cli_args.filter((item): item is string => typeof item === "string") : [];
      args = buildCommandCodeProbeArgs(cliArgs);
    }
  } catch { /* no manifest: use the default probe command */ }
  try {
    const result = await run(command, args, root);
    if (runtime === "command-code") return parseCommandCodeVersion(`${result.stdout}\n${result.stderr}`) ?? UNKNOWN;
    const lines = result.stdout.split(/\r?\n/).map((line) => line.trim()).filter((line) => line.length > 0);
    return lines.length > 0 ? lines[lines.length - 1] : UNKNOWN;
  } catch {
    return UNKNOWN;
  }
}

type WorktreeRef = { id: string; path: string; relative: string };

async function gitOutput(cwd: string, args: string[]): Promise<string | undefined> {
  try {
    const { stdout } = await execFileAsync("git", args, { cwd, maxBuffer: 16 * 1024 * 1024 });
    return stdout;
  } catch {
    return undefined;
  }
}

async function gitLines(cwd: string, args: string[], separator: "nul" | "newline" = "newline"): Promise<string[]> {
  const output = await gitOutput(cwd, args);
  if (output === undefined) return [];
  return output
    .split(separator === "nul" ? "\0" : "\n")
    .map((entry) => entry.replace(/\r$/, ""))
    .filter((entry) => entry.length > 0);
}

async function isDirectory(target: string): Promise<boolean> {
  try { return (await stat(target)).isDirectory(); } catch { return false; }
}

async function fileExistsAt(target: string): Promise<boolean> {
  try { return (await stat(target)).isFile(); } catch { return false; }
}

function normalizeRelativePath(value: string): string {
  return value.replace(/\\/g, "/").replace(/^\.\//, "").replace(/\/+$/, "");
}

function insideRelativeRoot(candidate: string, root: string): boolean {
  const relative = normalizeRelativePath(candidate);
  const base = normalizeRelativePath(root);
  if (base === "" || base === ".") return true;
  return relative === base || relative.startsWith(`${base}/`);
}

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

async function readMissionDocument(missionRoot: string): Promise<Record<string, unknown>> {
  try {
    const parsed = parse(await readFile(path.join(missionRoot, "mission.yaml"), "utf8")) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

/** The write roots the guard enforced for the mission's workers (default `.`). */
async function missionWriteRoots(missionRoot: string): Promise<string[]> {
  const document = await readMissionDocument(missionRoot);
  const guard = document.guard && typeof document.guard === "object" ? document.guard as Record<string, unknown> : {};
  const roots = stringList(guard.write_roots);
  return roots.length > 0 ? roots : ["."];
}

/** Declared outputs from the mission packet and every canonical team state. */
async function declaredWorkerOutputs(missionRoot: string): Promise<string[]> {
  const outputs: string[] = [];
  const document = await readMissionDocument(missionRoot);
  const missionOutputs = document.expected_outputs && typeof document.expected_outputs === "object" ? document.expected_outputs as Record<string, unknown> : {};
  outputs.push(...stringList(missionOutputs.files));
  const runsRoot = path.join(missionRoot, "runs");
  const runEntries = await readdir(runsRoot, { withFileTypes: true }).catch(() => []);
  for (const entry of runEntries) {
    if (!entry.isDirectory()) continue;
    try {
      const state = JSON.parse(await readFile(path.join(runsRoot, entry.name, "team-state.json"), "utf8")) as Record<string, unknown>;
      const workers = Array.isArray(state.workers) ? state.workers : [];
      for (const worker of workers) {
        const contract = worker && typeof worker === "object" ? (worker as Record<string, unknown>).contract as Record<string, unknown> | undefined : undefined;
        const expected = contract && typeof contract.expected_outputs === "object" ? contract.expected_outputs as Record<string, unknown> : {};
        outputs.push(...stringList(expected.files));
      }
    } catch { /* no team state for this run */ }
  }
  return [...new Set(outputs)];
}

/** Every worker worktree under `<missionRoot>/team/workers` that is a real git worktree. */
async function listWorkerWorktrees(runRoot: string, missionRoot: string): Promise<WorktreeRef[]> {
  const workersRoot = path.join(missionRoot, "team", "workers");
  let entries;
  try { entries = await readdir(workersRoot, { withFileTypes: true }); } catch { return []; }
  const worktrees: WorktreeRef[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const worktreePath = path.join(workersRoot, entry.name);
    try { await stat(path.join(worktreePath, ".git")); } catch { continue; }
    worktrees.push({ id: entry.name, path: worktreePath, relative: path.relative(runRoot, worktreePath).split(path.sep).join("/") });
  }
  return worktrees.sort((left, right) => left.id.localeCompare(right.id));
}

/** The commit a worker branch forked from: the merge base with the run root's HEAD. */
async function worktreeBaseCommit(runRoot: string, worktreePath: string): Promise<string | undefined> {
  const primary = (await gitOutput(runRoot, ["rev-parse", "HEAD"]))?.trim();
  if (primary) {
    const base = (await gitOutput(worktreePath, ["merge-base", "HEAD", primary]))?.trim();
    if (base) return base;
  }
  const root = (await gitOutput(worktreePath, ["rev-list", "--max-parents=0", "HEAD"]))?.trim();
  return root && root.length > 0 ? root : undefined;
}

/** Files changed in a worktree against its base, including untracked files. */
async function worktreeChangedPaths(worktreePath: string, base: string | undefined): Promise<string[]> {
  const tracked = base ? await gitLines(worktreePath, ["diff", "--name-only", "-z", base], "nul") : [];
  const untracked = await gitLines(worktreePath, ["ls-files", "--others", "--exclude-standard", "-z"], "nul");
  return [...new Set([...tracked, ...untracked])].map((entry) => entry.split(path.sep).join("/")).sort();
}

async function invariantNoWritesOutsideRoots(runRoot: string, missionRoot: string): Promise<true | string[]> {
  const worktrees = await listWorkerWorktrees(runRoot, missionRoot);
  if (worktrees.length === 0) return true;
  const allowed = [...await missionWriteRoots(missionRoot), ...await declaredWorkerOutputs(missionRoot)];
  const offending: string[] = [];
  for (const worktree of worktrees) {
    const base = await worktreeBaseCommit(runRoot, worktree.path);
    for (const changed of await worktreeChangedPaths(worktree.path, base)) {
      if (!allowed.some((root) => insideRelativeRoot(changed, root))) offending.push(`${worktree.relative}/${changed}`);
    }
  }
  return offending.length > 0 ? offending : true;
}

async function invariantNoWorkerCommits(runRoot: string, missionRoot: string): Promise<true | string[]> {
  const worktrees = await listWorkerWorktrees(runRoot, missionRoot);
  const offending: string[] = [];
  for (const worktree of worktrees) {
    const base = await worktreeBaseCommit(runRoot, worktree.path);
    if (!base) continue;
    for (const line of await gitLines(worktree.path, ["log", "--format=%h%x09%ae%x09%s", `${base}..HEAD`])) {
      const [sha, email, subject] = line.split("\t");
      if (email !== HARNESS_COMMIT_EMAIL) offending.push(`${worktree.id} ${sha} ${email} ${subject}`);
    }
  }
  return offending.length > 0 ? offending : true;
}

async function invariantNoPackageInstall(runRoot: string, missionRoot: string): Promise<true | string[]> {
  const worktrees = await listWorkerWorktrees(runRoot, missionRoot);
  const offending: string[] = [];
  for (const worktree of worktrees) {
    if (await isDirectory(path.join(worktree.path, "node_modules"))) offending.push(`${worktree.relative}/node_modules`);
    const base = await worktreeBaseCommit(runRoot, worktree.path);
    for (const lockfile of LOCKFILE_NAMES) {
      if (!(await fileExistsAt(path.join(worktree.path, lockfile)))) continue;
      const trackedAtBase = base ? (await gitLines(worktree.path, ["ls-tree", "--name-only", base, "--", lockfile])).length > 0 : false;
      if (!trackedAtBase) offending.push(`${worktree.relative}/${lockfile}`);
    }
  }
  return offending.length > 0 ? offending : true;
}

/**
 * The harness policy files must be byte-identical wherever they appear in the
 * run: the run root writes them and a copy that differs in a worker worktree
 * means the run's own policy was rewritten.
 */
async function invariantProtectedPathsUntouched(runRoot: string, missionRoot: string): Promise<true | string[]> {
  const locations = [{ label: ".", root: runRoot }];
  for (const worktree of await listWorkerWorktrees(runRoot, missionRoot)) locations.push({ label: worktree.relative, root: worktree.path });
  const offending: string[] = [];
  for (const relativePath of PROTECTED_POLICY_FILES) {
    const byHash = new Map<string, string[]>();
    for (const location of locations) {
      let content: Buffer;
      try { content = await readFile(path.join(location.root, relativePath)); } catch { continue; }
      const digest = sha256Hex(content);
      const labels = byHash.get(digest) ?? [];
      labels.push(location.label);
      byHash.set(digest, labels);
    }
    if (byHash.size > 1) offending.push(`${relativePath}: ${[...byHash.values()].map((labels) => labels.join(",")).join(" vs ")}`);
  }
  return offending.length > 0 ? offending : true;
}

function classifyGuardLogLine(line: string): "allow" | "denial" | "native_refusal" | "other" {
  try {
    const parsed: unknown = JSON.parse(line);
    const guardClass = parsed !== null && typeof parsed === "object" ? (parsed as { class?: unknown }).class : undefined;
    if (guardClass === "allow") return "allow";
    if (guardClass === "native_refusal") return "native_refusal";
    return "denial";
  } catch {
    if (line.includes("native_refusal")) return "native_refusal";
    if (line.includes("\"deny\"")) return "denial";
    return "other";
  }
}

/** Every artifact file under a root, grouped by the directory that holds it. */
async function collectArtifactFiles(root: string): Promise<Map<string, Map<string, string>>> {
  const grouped = new Map<string, Map<string, string>>();
  const pending = [root];
  while (pending.length > 0) {
    const directory = pending.pop();
    if (!directory) continue;
    let children;
    try { children = await readdir(directory, { withFileTypes: true }); } catch { continue; }
    for (const child of children) {
      const childPath = path.join(directory, child.name);
      if (child.isDirectory()) { pending.push(childPath); continue; }
      const bucket = grouped.get(directory) ?? new Map<string, string>();
      bucket.set(child.name, childPath);
      grouped.set(directory, bucket);
    }
  }
  return grouped;
}

/**
 * Every denial counted in a run's runtime-control receipt must be matched by a
 * non-allow guard-log line or a recorded native refusal (`class:
 * "native_refusal"`) in the same run directory.
 */
async function invariantGuardLogConsistent(missionRoot: string): Promise<true | string[]> {
  const files = await collectArtifactFiles(missionRoot);
  const offending: string[] = [];
  for (const [directory, bucket] of files) {
    const controlPath = bucket.get("runtime-control.json");
    if (!controlPath) continue;
    let control: Record<string, unknown>;
    try { control = JSON.parse(await readFile(controlPath, "utf8")) as Record<string, unknown>; } catch { continue; }
    const denials = typeof control.denials === "number" ? control.denials : 0;
    let guardDenials = 0;
    let nativeRefusals = 0;
    const logPath = bucket.get("tool-guard.log");
    if (logPath) {
      for (const line of (await readFile(logPath, "utf8")).split(/\r?\n/)) {
        const trimmed = line.trim();
        if (trimmed === "") continue;
        const kind = classifyGuardLogLine(trimmed);
        if (kind === "denial") guardDenials += 1;
        else if (kind === "native_refusal") nativeRefusals += 1;
      }
    }
    if (denials > guardDenials + nativeRefusals) {
      const label = path.relative(missionRoot, directory).split(path.sep).join("/") || ".";
      offending.push(`${label}: runtime-control denials=${denials} but guard-log denials=${guardDenials} native refusals=${nativeRefusals}`);
    }
  }
  return offending.length > 0 ? offending : true;
}

/**
 * Evaluate the entry's declared invariants and return one observed fact per
 * name: `true` when it holds, or the offending paths/lines when it does not.
 */
export async function evaluateAcceptanceInvariants(runRoot: string, missionId: string, expected: AcceptanceExpected): Promise<Record<string, true | string[]>> {
  const missionRoot = path.join(runRoot, ".harness", "missions", missionId);
  const evaluated: Record<string, true | string[]> = {};
  for (const name of expected.invariants ?? []) {
    switch (name) {
      case "no_writes_outside_roots": evaluated[name] = await invariantNoWritesOutsideRoots(runRoot, missionRoot); break;
      case "no_worker_commits": evaluated[name] = await invariantNoWorkerCommits(runRoot, missionRoot); break;
      case "no_package_install": evaluated[name] = await invariantNoPackageInstall(runRoot, missionRoot); break;
      case "protected_paths_untouched": evaluated[name] = await invariantProtectedPathsUntouched(runRoot, missionRoot); break;
      case "guard_log_consistent": evaluated[name] = await invariantGuardLogConsistent(missionRoot); break;
      default: evaluated[name] = [`unknown invariant: ${String(name)}`];
    }
  }
  return evaluated;
}

/**
 * Record whether each listed mechanism actually fired, keyed by name. A
 * mechanism fires when a guard-log line carries its class (with or without the
 * `guard_` prefix) or a runtime-control receipt carries it as a stop code.
 */
export async function evaluateExercisedMechanisms(runRoot: string, missionId: string, names: string[]): Promise<Record<string, boolean>> {
  const missionRoot = path.join(runRoot, ".harness", "missions", missionId);
  const classes = new Set<string>();
  const stopCodes = new Set<string>();
  const files = await collectArtifactFiles(missionRoot);
  for (const bucket of files.values()) {
    const logPath = bucket.get("tool-guard.log");
    if (logPath) {
      for (const line of (await readFile(logPath, "utf8")).split(/\r?\n/)) {
        const trimmed = line.trim();
        if (trimmed === "") continue;
        try {
          const parsed = JSON.parse(trimmed) as { class?: unknown };
          if (parsed && typeof parsed.class === "string" && parsed.class !== "allow") classes.add(parsed.class);
        } catch { /* unparseable guard-log lines carry no class */ }
      }
    }
    const controlPath = bucket.get("runtime-control.json");
    if (controlPath) {
      try {
        const control = JSON.parse(await readFile(controlPath, "utf8")) as { stop_code?: unknown };
        if (control && typeof control.stop_code === "string") stopCodes.add(control.stop_code);
      } catch { /* optional control receipt */ }
    }
  }
  const exercised: Record<string, boolean> = {};
  for (const name of names) {
    const unprefixed = name.startsWith("guard_") ? name.slice("guard_".length) : name;
    exercised[name] = classes.has(name) || classes.has(unprefixed) || stopCodes.has(name) || stopCodes.has(unprefixed);
  }
  return exercised;
}

export async function collectFacts(runRoot: string, missionId: string, expected?: AcceptanceExpected): Promise<{ observed: AcceptanceFacts; runIds: string[]; provider: string; model: string; cost: number | "unknown"; fact_sources: Record<string, string> }> {
  const missionRoot = path.join(runRoot, ".harness", "missions", missionId);
  const observed: AcceptanceFacts = {};
  const factSources: Record<string, string> = {};
  const sourceValues: Record<string, Record<string, unknown>> = { first: {}, last: {} };
  const mergeFacts = (value: unknown, source: string): void => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return;
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      observed[key] = item;
      factSources[key] = source;
      if (source === "first" || source === "last") sourceValues[source][key] = item;
    }
  };
  let provider = UNKNOWN;
  let model = UNKNOWN;
  let pathStyleValid = true;
  let cost: number | "unknown" = "unknown";
  const runIds: string[] = [];
  try {
    const result = parse(await readFile(path.join(missionRoot, "runtime-result.yaml"), "utf8")) as Record<string, unknown>;
    Object.assign(observed, result);
    mergeFacts(result, "initial");
    provider = typeof result.provider === "string" ? result.provider : UNKNOWN;
    model = typeof result.model === "string" ? result.model : UNKNOWN;
    cost = typeof result.cost_usd === "number" ? result.cost_usd : "unknown";
  } catch { /* team missions publish facts under runs */ }
  try {
    const entries = (await readdir(path.join(missionRoot, "runs"), { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .sort((left, right) => left.name.localeCompare(right.name));
    for (let index = 0; index < entries.length; index += 1) {
      const entry = entries[index];
      const source = index === 0 ? "first" : index === entries.length - 1 ? "last" : `middle:${entry.name}`;
      runIds.push(entry.name);
      for (const file of ["runtime-result.yaml", "runtime-control.json", "runtime-recovery.json", "team-state.json"]) {
        try {
          const priorDenials = typeof observed.denials === "number" ? observed.denials : 0;
          const value = file.endsWith("yaml") ? parse(await readFile(path.join(missionRoot, "runs", entry.name, file), "utf8")) : JSON.parse(await readFile(path.join(missionRoot, "runs", entry.name, file), "utf8"));
          if (file === "runtime-result.yaml" || file === "team-state.json") {
            pathStyleValid = pathStyleValid && hasForwardSlashPaths(value);
          }
          if (value && typeof value === "object") mergeFacts(value, source);
          const record = value as Record<string, unknown>;
          if (file === "runtime-recovery.json") {
            observed.resumed = true;
            factSources.resumed = source;
          }
          if (typeof record.provider === "string") provider = record.provider;
          if (typeof record.model === "string") model = record.model;
          if (typeof record.cost_usd === "number") cost = record.cost_usd;
          if (typeof record.denials === "number" && record.denials >= priorDenials) {
            observed.denials = record.denials;
            factSources.denials = source;
          }
        } catch { /* optional artifact */ }
      }
      try {
        const guardLog = await readFile(path.join(missionRoot, "runs", entry.name, "tool-guard.log"), "utf8");
        // tool_guard_lines counts denials only: a guard log line is a denial when its parsed
        // JSON has a class other than "allow". A line that does not parse as JSON (a truncated
        // or corrupt write) counts as a denial only if it contains "deny".
        let denials = 0;
        let allows = 0;
        for (const line of guardLog.split(/\r?\n/)) {
          const trimmed = line.trim();
          if (trimmed === "") continue;
          try {
            const parsed: unknown = JSON.parse(trimmed);
            const guardClass = parsed !== null && typeof parsed === "object" ? (parsed as { class?: unknown }).class : undefined;
            if (guardClass === "allow") allows += 1;
            else denials += 1;
          } catch {
            if (trimmed.includes("\"deny\"")) denials += 1;
          }
        }
        observed.tool_guard_lines = denials;
        observed.tool_guard_allow_lines = allows;
        factSources.tool_guard_lines = source;
        factSources.tool_guard_allow_lines = source;
        if (source === "first" || source === "last") {
          sourceValues[source].tool_guard_lines = denials;
          sourceValues[source].tool_guard_allow_lines = allows;
        }
      } catch { /* runs without guard hooks have no tool-guard.log */ }
    }
  } catch { /* no runs */ }
  const pending = [path.join(missionRoot, "team", "artifacts")];
  while (pending.length > 0) {
    const directory = pending.pop();
    if (!directory) continue;
    let children;
    try {
      children = await readdir(directory, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const child of children) {
      const childPath = path.join(directory, child.name);
      if (child.isDirectory()) {
        pending.push(childPath);
        continue;
      }
      if (!child.name.endsWith("runtime-result.yaml") && !child.name.endsWith("runtime-control.json")) continue;
      try {
        const value = child.name.endsWith(".yaml")
          ? parse(await readFile(childPath, "utf8"))
          : JSON.parse(await readFile(childPath, "utf8"));
        if (!value || typeof value !== "object") continue;
        const record = value as Record<string, unknown>;
        if (typeof record.provider === "string" && provider === UNKNOWN) provider = record.provider;
        if (typeof record.model === "string" && model === UNKNOWN) model = record.model;
        if (typeof record.cost_usd === "number") cost = cost === "unknown" ? record.cost_usd : cost + record.cost_usd;
      } catch {
        // Worker artifacts are optional when admission fails before launch.
      }
    }
  }
  try {
    const files = await listAcceptanceFiles(runRoot);
    const outputRoot = path.join(runRoot, "out");
    observed.files = files
      .filter((file) => file.startsWith(`${outputRoot}${path.sep}`))
      .map((file) => path.relative(runRoot, file).split(path.sep).join("/"));
    let guardianReceipt = false;
    for (const file of files) {
      if (path.basename(file) !== "windows-job-result.json") continue;
      try {
        const receipt = JSON.parse(await readFile(file, "utf8")) as Record<string, unknown>;
        guardianReceipt = guardianReceipt || receipt.settled === true;
      } catch { /* optional receipt */ }
    }
    observed.guardian_receipt = guardianReceipt;
  } catch {
    observed.files = [];
  }
  for (const [field, selected] of Object.entries(expected?.fact_sources ?? {})) {
    const value = sourceValues[selected]?.[field];
    if (value !== undefined) {
      observed[field] = value;
      factSources[field] = selected;
    }
  }
  observed.path_style = pathStyleValid ? "forward_slashes" : "backslashes";
  observed.fact_sources = factSources;
  if (expected?.invariants && expected.invariants.length > 0) {
    observed.invariants = await evaluateAcceptanceInvariants(runRoot, missionId, expected);
  }
  if (expected?.exercised_report && expected.exercised_report.length > 0) {
    observed.exercised = await evaluateExercisedMechanisms(runRoot, missionId, expected.exercised_report);
  }
  return { observed, runIds, provider, model, cost, fact_sources: factSources };
}

async function gitCommit(root: string): Promise<string> {
  try { return (await execFileAsync("git", ["rev-parse", "HEAD"], { cwd: root })).stdout.trim() || UNKNOWN; } catch { return UNKNOWN; }
}

/**
 * The snapshot CLI imports from the source checkout's dependencies. A git
 * worktree (team leader tree) has no node_modules of its own, so resolve the
 * first ancestor that has one; without any, the campaign cannot run.
 */
async function resolveNodeModulesRoot(sourceRoot: string): Promise<string> {
  let current = path.resolve(sourceRoot);
  for (;;) {
    const candidate = path.join(current, "node_modules");
    try {
      if ((await stat(candidate)).isDirectory()) return candidate;
    } catch { /* keep walking up */ }
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  console.error(`acceptance: no node_modules found walking up from ${path.resolve(sourceRoot)}; install dependencies in the harness checkout before running the acceptance campaign`);
  process.exit(2);
}

async function preloadAcceptanceCampaign(sourceRoot: string, workspace: string): Promise<string> {
  const nodeModules = await resolveNodeModulesRoot(sourceRoot);
  await Promise.all([
    import("../adapters/oh-my-pi.js"),
    import("../adapters/command-code.js"),
    import("../harness/team-run.js"),
    import("../harness/verify.js"),
    import("../schema/mission.js"),
    import("../harness/runtime-recovery.js"),
  ]);
  const snapshot = path.join(path.resolve(workspace), ".acceptance-runtime");
  await cp(path.join(sourceRoot, "dist"), snapshot, { recursive: true });
  await cp(path.join(sourceRoot, "src"), path.join(snapshot, "src"), { recursive: true });
  await cp(path.join(sourceRoot, "src"), path.join(path.resolve(workspace), "src"), { recursive: true });
  const junction = path.join(snapshot, "node_modules");
  let createJunction = true;
  try {
    const existing = await lstat(junction);
    if (existing.isSymbolicLink()) {
      try {
        await stat(junction);
        createJunction = false;
      } catch {
        await rm(junction, { recursive: true, force: true });
      }
    } else {
      createJunction = false;
    }
  } catch { /* absent: create below */ }
  if (createJunction) await symlink(nodeModules, junction, "junction");
  return path.join(snapshot, "cli.js");
}
const CMD_SUFFIX = "-cmdc";

function baseAcceptanceCapability(capability: string): string {
  return capability.endsWith(CMD_SUFFIX) ? capability.slice(0, -CMD_SUFFIX.length) : capability;
}

function acceptanceMissionId(capability: string): string {
  return capability === "R7-repeated-failure" ? "r8-repeated-failure-acceptance" : `${capability.toLowerCase()}-acceptance`;
}

/**
 * Capabilities whose mechanism is hard-wired to acceptance support files, and
 * the runtimes each mechanism actually supports. A run whose effective runtime
 * is outside this list must fail the capability instead of launching a wrapper
 * that cannot drive the runtime.
 */
const WRAPPER_MECHANISM_RUNTIMES: Record<string, readonly string[]> = {
  G2: ["oh-my-pi"],
  "G2-cmdc": ["command-code"],
  "S3-unknown-cost": ["oh-my-pi"],
  "S3-unknown-cost-cmdc": ["command-code"],
  "R10-controller-loss": ["oh-my-pi", "command-code"],
  "R10-controller-loss-cmdc": ["oh-my-pi", "command-code"],
};

export function wrapperMechanismUnavailable(capability: string, runtime: string): boolean {
  const supported = WRAPPER_MECHANISM_RUNTIMES[capability];
  return supported !== undefined && !supported.includes(runtime);
}

/**
 * Team-shaped entries select worker runtimes only through the mission file, so
 * a `--runtime` override must rewrite every adapter (workers and leader) in the
 * copied mission; the requested model is injected into each worker's
 * runtime_config_overrides.
 */
export async function applyTeamMissionOverrides(missionPath: string, overrides: { runtime?: string; model?: string }): Promise<void> {
  if (!overrides.runtime && !overrides.model) return;
  const mission = parse(await readFile(missionPath, "utf8")) as Record<string, unknown>;
  const team = mission.team as Record<string, unknown> | undefined;
  if (!team || typeof team !== "object") return;
  if (overrides.runtime) {
    const leader = team.leader;
    if (leader && typeof leader === "object") (leader as Record<string, unknown>).adapter = overrides.runtime;
  }
  const workers = Array.isArray(team.workers) ? team.workers : [];
  for (const worker of workers) {
    if (!worker || typeof worker !== "object") continue;
    const record = worker as Record<string, unknown>;
    if (overrides.runtime) record.adapter = overrides.runtime;
    if (overrides.model) record.runtime_config_overrides = { ...(record.runtime_config_overrides as Record<string, unknown> | undefined), model: overrides.model };
  }
  await writeFile(missionPath, stringify(mission), "utf8");
}

async function recordWrapperUnavailableEvidence(sourceRoot: string, capability: string, entry: AcceptanceRegistryEntry, runtime: string, options: AcceptanceRunOptions): Promise<AcceptanceEvidenceRecord> {
  const timestamp = new Date().toISOString().replace(/[-:.]/g, "").replace(/Z$/, "Z");
  const workspace = path.resolve(options.workspace ?? sourceRoot);
  const runRoot = path.join(workspace, capability, timestamp);
  const missionId = acceptanceMissionId(capability);
  const model = entry.model ?? options.model ?? UNKNOWN;
  const runtimeVersion = await resolveAcceptanceRuntimeVersion(runtime, path.resolve(sourceRoot), options.commandRunner ?? runProcess);
  const inputDigest = await computeAcceptanceInputDigest(sourceRoot, acceptanceInputs(entry), { runtime, model, runtimeVersion });
  const observed: AcceptanceFacts = { status: "failed", reason: "wrapper_unavailable" };
  if (runtimeVersion === UNKNOWN) observed.runtime_version_unreadable = true;
  const evidence: AcceptanceEvidenceRecord = {
    schema_version: "uh.acceptance-evidence.v0",
    capability,
    outcome: "failed",
    checked_at: new Date().toISOString(),
    harness_commit: await gitCommit(sourceRoot),
    runtime,
    provider: UNKNOWN,
    model,
    cost_usd: "unknown",
    workspace: runRoot,
    run_ids: [],
    mission_id: missionId,
    expected: entry.expected,
    observed,
    fact_sources: {},
    mismatches: [{ field: "wrapper", expected: `${capability} mechanism for runtime ${runtime}`, observed: "wrapper_unavailable" }],
    artifact_root: path.join(runRoot, ".harness", "missions", missionId),
    cli: { exit_code: null, stderr_tail: "", stdout_tail: "" },
    input_digest: inputDigest.digest,
    inputs_resolved: inputDigest.resolved,
    runtime_version: runtimeVersion,
  };
  const checked = AcceptanceEvidenceRecordSchema.parse(evidence);
  const evidenceDir = path.join(sourceRoot, "acceptance", "evidence", capability);
  await mkdir(evidenceDir, { recursive: true });
  await writeFile(path.join(evidenceDir, `${timestamp}.json`), JSON.stringify(checked, null, 2) + "\n", "utf8");
  await writeFile(path.join(evidenceDir, "latest.json"), JSON.stringify(checked, null, 2) + "\n", "utf8");
  console.log(`FAIL ${capability} — wrapper_unavailable: no ${capability} mechanism for runtime ${runtime}`);
  return checked;
}

/**
 * Extra env for the mission-run child. Entries declaring `support_shim` get
 * the copied acceptance/support directory prepended to PATH for that run
 * only; every other entry keeps the parent PATH untouched.
 */
export function acceptanceSpawnEnv(entry: Pick<AcceptanceRegistryEntry, "support_shim">, runRoot: string): Record<string, string> {
  if (!entry.support_shim) return {};
  const supportDir = path.join(runRoot, "acceptance", "support");
  const pathKey = Object.keys(process.env).find((key) => key.toLowerCase() === "path") ?? "PATH";
  return { [pathKey]: `${supportDir}${path.delimiter}${process.env[pathKey] ?? ""}` };
}

/** The action and outcome recorded in the evidence for an injected run. */
export type AcceptanceInjectionOutcome = { action: "cancel_after_ready" | "steer_after_ready"; outcome: string };
/** Resolve the run id of a run ready to receive an injected action, or undefined. */
export type AcceptanceReadinessProbe = (root: string, missionId: string, hintRunId: string | undefined, stillOpen: () => boolean) => Promise<string | undefined>;

const INJECT_RUN_ID = "20260101T000002Z-abcdef";

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => { setTimeout(resolve, ms); });
}

function firstNonEmptyLine(text: string): string {
  return text.split(/\r?\n/).find((line) => line.trim() !== "")?.trim() ?? "";
}

/**
 * Default readiness: the run is ready once its runtime-control receipt records
 * `ready_at`. The run id is read from that receipt (single-shape runs pass a
 * hint via `--run-id`); polling stops as soon as the child exits.
 */
async function readyRunId(runRoot: string, missionId: string, hintRunId: string | undefined, stillOpen: () => boolean, timeoutMs: number, pollMs: number): Promise<string | undefined> {
  const missionRoot = path.join(runRoot, ".harness", "missions", missionId);
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const files = await collectArtifactFiles(missionRoot);
    for (const bucket of files.values()) {
      const controlPath = bucket.get("runtime-control.json");
      if (!controlPath) continue;
      try {
        const control = JSON.parse(await readFile(controlPath, "utf8")) as { run_id?: unknown; ready_at?: unknown };
        if (typeof control.ready_at === "string" && typeof control.run_id === "string" && (hintRunId === undefined || control.run_id === hintRunId)) {
          return control.run_id;
        }
      } catch { /* not written yet */ }
    }
    if (!stillOpen() || Date.now() >= deadline) return undefined;
    await delay(pollMs);
  }
}

type InjectionPlan = {
  missionId: string;
  hintRunId?: string;
  build: (runId: string) => { action: AcceptanceInjectionOutcome["action"]; args: string[] };
  resolveReady: AcceptanceReadinessProbe;
};

/**
 * Spawn the mission child and, concurrently, wait until the run is ready then
 * run the injected cancel/steer action through `run`. The child's output and
 * the injected outcome are returned together.
 */
async function runProcessWithInjection(
  command: string,
  args: string[],
  cwd: string,
  plan: InjectionPlan,
  run: AcceptanceCommandRunner,
  distRoot?: string,
  extraEnv?: Record<string, string>,
): Promise<{ code: number; stdout: string; stderr: string; injection: AcceptanceInjectionOutcome }> {
  return await new Promise((resolve) => {
    const child = spawn(command, args, { cwd, env: { ...process.env, ...(distRoot ? { UH_HARNESS_DIST: path.resolve(distRoot, "dist") } : {}), ...extraEnv }, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    let open = true;
    const injectionTask: Promise<AcceptanceInjectionOutcome> = (async () => {
      const runId = await plan.resolveReady(cwd, plan.missionId, plan.hintRunId, () => open);
      const built = plan.build(runId ?? plan.hintRunId ?? "unknown");
      if (runId === undefined) return { action: built.action, outcome: "not_ready" };
      try {
        const result = await run(process.execPath, built.args, cwd);
        const detail = result.code === 0 ? "" : `: ${firstNonEmptyLine(result.stderr) || firstNonEmptyLine(result.stdout)}`;
        return { action: built.action, outcome: result.code === 0 ? "ok" : `exit ${result.code}${detail}` };
      } catch (error) {
        return { action: built.action, outcome: `error: ${(error as Error).message}` };
      }
    })();
    child.stdout.on("data", (chunk) => { stdout += String(chunk); });
    child.stdout.on("error", () => undefined);
    child.stderr.on("data", (chunk) => { stderr += String(chunk); });
    child.stderr.on("error", () => undefined);
    child.on("close", async (code) => { open = false; resolve({ code: code ?? 1, stdout, stderr, injection: await injectionTask }); });
    child.on("error", async (error) => { open = false; resolve({ code: 1, stdout, stderr: `${stderr}${error.message}`, injection: await injectionTask }); });
  });
}

async function runOneAcceptance(sourceRoot: string, capability: string, entry: AcceptanceRegistryEntry, options: AcceptanceRunOptions): Promise<AcceptanceEvidence> {

  if (!options.workspace) throw new Error("acceptance run requires --workspace <dir>");
  const runtime = options.runtime ?? entry.runtime;
  if (options.runtime && options.runtime !== entry.runtime) console.warn(`WARN ${capability}: runtime override ${options.runtime} differs from registry runtime ${entry.runtime}`);
  const timestamp = new Date().toISOString().replace(/[-:.]/g, "").replace(/Z$/, "Z");
  const deepSegments = baseAcceptanceCapability(capability) === "R5-deep-path"
    ? Array.from({ length: 2 }, (_, index) => `deep-${index}-${"x".repeat(64)}`)
    : [];
  const runBase = baseAcceptanceCapability(capability) === "R5-deep-path" ? path.join(options.workspace, ...deepSegments) : options.workspace;
  const runRoot = path.join(runBase, capability, timestamp);
  await mkdir(runRoot, { recursive: true });
  await runProcess("git", ["init", "--quiet"], runRoot);
  if (process.platform === "win32") {
    const longpaths = await runProcess("git", ["config", "core.longpaths", "true"], runRoot);
    if (longpaths.code !== 0) throw new Error(`git config core.longpaths failed: ${longpaths.stderr}`);
  }
  await initializeHarness(runRoot, true);
  try {
    await cp(path.join(sourceRoot, "acceptance", "support"), path.join(runRoot, "acceptance", "support"), { recursive: true });
  } catch {
    // Optional support files are only needed by missions that declare them.
  }
  const adapterSource = runtime === "command-code"
    ? path.join(runRoot, "acceptance", "support", "command-code.yaml")
    : path.join(sourceRoot, ".harness", "adapters", `${runtime}.yaml`);
  try {
    await cp(adapterSource, path.join(runRoot, ".harness", "adapters", `${runtime}.yaml`));
  } catch {
    // The run will produce failed evidence when its adapter is unavailable.
  }
  const missionId = acceptanceMissionId(capability);
  const missionDir = path.join(runRoot, ".harness", "missions", missionId);
  await mkdir(missionDir, { recursive: true });
  const sourceMission = path.resolve(sourceRoot, "acceptance", entry.mission);
  await cp(sourceMission, path.join(missionDir, "mission.yaml"));
  const model = entry.model ?? options.model;
  if ((model || options.runtime) && entry.shape === "team") {
    await applyTeamMissionOverrides(path.join(missionDir, "mission.yaml"), { runtime: options.runtime, model });
  }
  if (capability === "G2" && runtime === "oh-my-pi") {
    const manifest = parse(await readFile(path.join(runRoot, "acceptance", "support", "oh-my-pi-denial.yaml"), "utf8")) as Record<string, unknown>;
    const config = (manifest.config ?? {}) as Record<string, unknown>;
    config.cli_command = path.join(runRoot, "acceptance", "support", "denial-wrapper.mjs");
    manifest.config = config;
    await writeFile(path.join(runRoot, ".harness", "adapters", "oh-my-pi.yaml"), stringify(manifest), "utf8");
  }
  if (capability === "S3-unknown-cost" && runtime === "oh-my-pi") {
    const manifest = parse(await readFile(path.join(runRoot, "acceptance", "support", "oh-my-pi.yaml"), "utf8")) as Record<string, unknown>;
    const config = (manifest.config ?? {}) as Record<string, unknown>;
    config.cli_command = path.join(runRoot, "acceptance", "support", "costless-wrapper.mjs");
    manifest.config = config;
    await writeFile(path.join(runRoot, ".harness", "adapters", "oh-my-pi.yaml"), stringify(manifest), "utf8");
  }
  if (capability === "S3-unknown-cost-cmdc" && runtime === "command-code") {
    const manifest = parse(await readFile(path.join(runRoot, "acceptance", "support", "command-code.yaml"), "utf8")) as Record<string, unknown>;
    const config = (manifest.config ?? {}) as Record<string, unknown>;
    config.cli_command = path.join(runRoot, "acceptance", "support", "costless-wrapper-cmdc.mjs");
    manifest.config = config;
    await writeFile(path.join(runRoot, ".harness", "adapters", "command-code.yaml"), stringify(manifest), "utf8");
  }
  // Probe the runtime version from the real harness adapters, not the run's
  // copied fixtures (a wrapper-forced capability rewrites cli_command).
  const runtimeVersion = await resolveAcceptanceRuntimeVersion(runtime, sourceRoot, options.commandRunner ?? runProcess);
  const cli = options.cliPath ?? path.resolve(sourceRoot, "dist", "cli.js");
  const args = [cli, "mission", entry.shape === "team" ? "run-team" : "run", entry.shape === "team" ? missionId : path.join(missionDir, "mission.yaml"), "--root", runRoot];
  // The campaign workspace has no bound sandbox by design, so the single-shape
  // run must opt into root execution explicitly (pushed before the trailing
  // --runtime-config-overrides pair, which the resume path below slices off).
  if (entry.shape !== "team") args.push("--runtime", runtime, "--force", "--no-sandbox");
  if (model && entry.shape !== "team") args.push("--runtime-config-overrides", JSON.stringify({ model }));
  await configureAcceptanceSeed(runRoot);
  const cancelRunId = "20260101T000000Z-abcdef";
  const controllerLossRunId = "20260101T000001Z-abcdef";
  const launchArgs = baseAcceptanceCapability(capability) === "R5" ? [...args, "--run-id", cancelRunId] : [...args];
  // A single-shape injected run pins its run id so the cancel/steer target is
  // known before the child writes its first receipt.
  if (entry.inject && entry.shape !== "team") launchArgs.push("--run-id", INJECT_RUN_ID);
  const spawnEnv = acceptanceSpawnEnv(entry, runRoot);
  const commandRunner = options.commandRunner ?? runProcess;
  let result: { code: number; stdout: string; stderr: string };
  let injectionOutcome: AcceptanceInjectionOutcome | undefined;
  if (baseAcceptanceCapability(capability) === "R5") {
    result = await runProcessAndCancel(process.execPath, launchArgs, sourceRoot, process.execPath, [cli, "mission", "cancel", "--mission", missionId, "--run-id", cancelRunId, "--root", runRoot], 750, sourceRoot);
  } else if (baseAcceptanceCapability(capability) === "R10-controller-loss") {
    const controlPath = path.join(runRoot, ".harness", "missions", missionId, "runs", controllerLossRunId, "runtime-control.json");
    const wrapper = path.join(runRoot, "acceptance", "support", "controller-loss-wrapper.mjs");
    result = await runProcess(process.execPath, [wrapper, controlPath, process.execPath, ...args, "--run-id", controllerLossRunId], sourceRoot, sourceRoot);
    const resumeArgs = model && entry.shape !== "team"
      ? [...args.slice(0, -2), "--runtime-config-overrides", JSON.stringify({ model, resume_from_run: controllerLossRunId, recovery_notes: "Recover the controller-lost attempt and create out/controller-recovered.txt." })]
      : [...args, "--runtime-config-overrides", JSON.stringify({ resume_from_run: controllerLossRunId, recovery_notes: "Recover the controller-lost attempt and create out/controller-recovered.txt." })];
    result = await runProcess(process.execPath, resumeArgs, sourceRoot, sourceRoot);
  } else if (entry.inject) {
    const action: AcceptanceInjectionOutcome["action"] = entry.inject.steer_after_ready !== undefined ? "steer_after_ready" : "cancel_after_ready";
    const message = entry.inject.steer_after_ready ?? "";
    const injected = await runProcessWithInjection(process.execPath, launchArgs, sourceRoot, {
      missionId,
      ...(entry.shape === "team" ? {} : { hintRunId: INJECT_RUN_ID }),
      build: (runId) => ({
        action,
        args: action === "cancel_after_ready"
          ? [cli, "mission", "cancel", "--mission", missionId, "--run-id", runId, "--root", runRoot]
          : [cli, "steer", runId, message, "--root", runRoot],
      }),
      resolveReady: options.injectReady
        ? (root, id, hint) => options.injectReady!(root, id, hint)
        : (root, id, hint, stillOpen) => readyRunId(root, id, hint, stillOpen, options.injectTimeoutMs ?? 60_000, options.injectPollMs ?? 250),
    }, commandRunner, sourceRoot, spawnEnv);
    result = { code: injected.code, stdout: injected.stdout, stderr: injected.stderr };
    injectionOutcome = injected.injection;
  } else {
    result = await runProcess(process.execPath, launchArgs, sourceRoot, sourceRoot, spawnEnv);
  }
  const facts = await collectFacts(runRoot, missionId, entry.expected);
  if (entry.support_shim) facts.observed.shim_on_path = true;
  if (injectionOutcome) facts.observed.injected = injectionOutcome;
  if (runtimeVersion === UNKNOWN) facts.observed.runtime_version_unreadable = true;
  if (result.code !== 0 && facts.observed.status === "passed") facts.observed.status = "failed";
  const mismatches = compareAcceptanceFacts(entry.expected, facts.observed);
  const inputDigest = await computeAcceptanceInputDigest(sourceRoot, acceptanceInputs(entry), { runtime, model: facts.model, runtimeVersion });
  const evidence: AcceptanceEvidenceRecord = {
    schema_version: "uh.acceptance-evidence.v0",
    capability,
    outcome: mismatches.length === 0 ? "passed" : "failed",
    checked_at: new Date().toISOString(),
    harness_commit: await gitCommit(sourceRoot),
    runtime,
    provider: facts.provider,
    model: facts.model,
    cost_usd: facts.cost,
    workspace: runRoot,
    run_ids: facts.runIds,
    mission_id: missionId,
    expected: entry.expected,
    observed: facts.observed,
    fact_sources: facts.fact_sources,
    mismatches,
    artifact_root: path.join(runRoot, ".harness", "missions", missionId),
    cli: { exit_code: result.code, stderr_tail: result.stderr.slice(-2048), stdout_tail: result.stdout.slice(-2048) },
    input_digest: inputDigest.digest,
    inputs_resolved: inputDigest.resolved,
    runtime_version: runtimeVersion,
  };
  const checked = AcceptanceEvidenceRecordSchema.parse(evidence);
  const evidenceDir = path.join(sourceRoot, "acceptance", "evidence", capability);
  await mkdir(evidenceDir, { recursive: true });
  await writeFile(path.join(evidenceDir, `${timestamp}.json`), JSON.stringify(checked, null, 2) + "\n", "utf8");
  await writeFile(path.join(evidenceDir, "latest.json"), JSON.stringify(checked, null, 2) + "\n", "utf8");
  const cost = checked.cost_usd === "unknown" ? "unknown" : checked.cost_usd.toFixed(6);
  const stderrFirstLine = result.stderr.split(/\r?\n/).find((line) => line.trim() !== "")?.trim() ?? "";
  const stderrCause = facts.observed.status === undefined && stderrFirstLine !== "" ? ` — ${stderrFirstLine}` : "";
  console.log(`${checked.outcome === "passed" ? "PASS" : "FAIL"} ${capability} cost_usd=${cost}${mismatches.length ? ` — ${mismatches.map((m) => `${m.field}: expected ${JSON.stringify(m.expected)} observed ${JSON.stringify(m.observed)}`).join("; ")}` : ""}${stderrCause}`);
  return checked;
}

export type AcceptanceRunOptions = {
  workspace?: string;
  runtime?: string;
  model?: string;
  keep?: boolean;
  capabilities?: string[];
  cliPath?: string;
  /** Command runner for the version probe and injected cancel/steer actions. */
  commandRunner?: AcceptanceCommandRunner;
  /** Override the readiness probe that gates an injected action. */
  injectReady?: (root: string, missionId: string, hintRunId: string | undefined) => Promise<string | undefined>;
  /** How long to wait for a run to become ready before an injected action. */
  injectTimeoutMs?: number;
  /** Poll interval while waiting for a run to become ready. */
  injectPollMs?: number;
};

export async function runAcceptance(sourceRoot: string, options: AcceptanceRunOptions = {}): Promise<AcceptanceEvidenceRecord[]> {
  if (!options.workspace) throw new Error("acceptance run requires --workspace <dir>");
  const registry = await loadAcceptanceRegistry(sourceRoot);
  const workspace = path.resolve(options.workspace);
  const capabilities = options.capabilities?.length ? options.capabilities : Object.keys(registry.entries);
  const results: AcceptanceEvidence[] = [];
  const runnable: { capability: string; entry: AcceptanceRegistryEntry }[] = [];
  for (const capability of capabilities) {
    const entry = registry.entries[capability];
    if (!entry) throw new Error(`Unknown acceptance capability: ${capability}`);
    if (entry.real_mission === "not_applicable") {
      console.log(`FIXTURE ${capability} — ${entry.reason}`);
      continue;
    }
    const runtime = options.runtime ?? entry.runtime;
    if (wrapperMechanismUnavailable(capability, runtime)) {
      results.push(await recordWrapperUnavailableEvidence(sourceRoot, capability, entry, runtime, options));
      continue;
    }
    runnable.push({ capability, entry });
  }
  if (runnable.length === 0) return results;
  const cliPath = options.cliPath ?? await preloadAcceptanceCampaign(sourceRoot, workspace);
  for (const { capability, entry } of runnable) {
    results.push(await runOneAcceptance(sourceRoot, capability, entry, { ...options, workspace, cliPath }));
  }
  return results;
}
async function configureAcceptanceSeed(runRoot: string): Promise<void> {
  await writeFile(path.join(runRoot, "README.md"), "# Acceptance workspace\n", "utf8");
  const config = await runProcess("git", ["config", "core.autocrlf", "false"], runRoot);
  if (config.code !== 0) throw new Error(`git config core.autocrlf failed: ${config.stderr}`);
  for (const [key, value] of [["user.name", "Ultimate Harness Acceptance"], ["user.email", "acceptance@localhost"]]) {
    const result = await runProcess("git", ["config", key, value], runRoot);
    if (result.code !== 0) throw new Error(`git config ${key} failed: ${result.stderr}`);
  }
  const added = await runProcess("git", ["add", "-A"], runRoot);
  if (added.code !== 0) throw new Error(`git add failed: ${added.stderr}`);
  const committed = await runProcess("git", ["commit", "--quiet", "-m", "Seed acceptance workspace"], runRoot);
  if (committed.code !== 0) throw new Error(`git commit failed: ${committed.stderr}`);
}

export async function writeAcceptanceReport(root: string): Promise<string> {
  const output = path.join(root, "docs", "acceptance", "README.md");
  await mkdir(path.dirname(output), { recursive: true });
  const report = await renderAcceptanceReport(root);
  await writeFile(output, report, "utf8");
  return output;
}

export type AcceptanceRebindOutcome = {
  capability: string;
  evidence_path: string;
  outcome: "rebound" | "changed" | "skipped";
  changed?: string[];
  reason?: string;
};

async function listEvidenceFiles(directory: string): Promise<string[]> {
  try {
    return (await readdir(directory)).filter((file) => file.endsWith(".json")).sort();
  } catch {
    return [];
  }
}

/**
 * Revalidate legacy evidence (records written before `input_digest` existed)
 * without rerunning any model: when the entry's inputs hash identically at the
 * record's `harness_commit` and at HEAD, stamp the record with the input digest
 * and the commit it was rebound from. Records whose inputs changed are reported
 * as `changed`; unresolvable records are `skipped`.
 */
export async function rebindAcceptanceEvidence(root: string): Promise<AcceptanceRebindOutcome[]> {
  const registry = await loadAcceptanceRegistry(root);
  const evidenceRoot = path.join(root, "acceptance", "evidence");
  const outcomes: AcceptanceRebindOutcome[] = [];
  for (const [capability, entry] of Object.entries(registry.entries)) {
    const directory = path.join(evidenceRoot, capability);
    for (const file of await listEvidenceFiles(directory)) {
      const evidencePath = path.join(directory, file);
      let record: AcceptanceEvidenceRecord;
      try {
        record = AcceptanceEvidenceRecordSchema.parse(JSON.parse(await readFile(evidencePath, "utf8")));
      } catch (error) {
        const outcome: AcceptanceRebindOutcome = { capability, evidence_path: evidencePath, outcome: "skipped", reason: `unreadable evidence (${(error as Error).message})` };
        outcomes.push(outcome);
        console.log(`skipped ${capability} ${file} — ${outcome.reason}`);
        continue;
      }
      if (record.input_digest) continue;
      const baseCommit = record.harness_commit;
      if (!baseCommit || baseCommit === UNKNOWN) {
        const outcome: AcceptanceRebindOutcome = { capability, evidence_path: evidencePath, outcome: "skipped", reason: "harness_commit is unknown" };
        outcomes.push(outcome);
        console.log(`skipped ${capability} ${file} — ${outcome.reason}`);
        continue;
      }
      const inputs = acceptanceInputs(entry);
      const identity: AcceptanceInputIdentity = {
        runtime: record.runtime,
        model: record.model,
        ...(record.runtime_version ? { runtimeVersion: record.runtime_version } : {}),
      };
      let atCommit: AcceptanceInputDigest;
      let atHead: AcceptanceInputDigest;
      try {
        atCommit = await computeAcceptanceInputDigest(root, inputs, identity, { commit: baseCommit });
        atHead = await computeAcceptanceInputDigest(root, inputs, identity, { commit: "HEAD" });
      } catch (error) {
        const outcome: AcceptanceRebindOutcome = { capability, evidence_path: evidencePath, outcome: "skipped", reason: `cannot resolve commit ${baseCommit} (${(error as Error).message})` };
        outcomes.push(outcome);
        console.log(`skipped ${capability} ${file} — ${outcome.reason}`);
        continue;
      }
      if (atCommit.digest !== atHead.digest) {
        const changed = await changedAcceptanceInputs(root, inputs, baseCommit);
        const outcome: AcceptanceRebindOutcome = { capability, evidence_path: evidencePath, outcome: "changed", changed };
        outcomes.push(outcome);
        console.log(`changed ${capability} ${file} — ${changed.length > 0 ? changed.join(", ") : "input files differ"}`);
        continue;
      }
      const rebound = AcceptanceEvidenceRecordSchema.parse({
        ...record,
        input_digest: atHead.digest,
        inputs_resolved: atHead.resolved,
        rebound_from_commit: baseCommit,
      });
      await writeFile(evidencePath, JSON.stringify(rebound, null, 2) + "\n", "utf8");
      const outcome: AcceptanceRebindOutcome = { capability, evidence_path: evidencePath, outcome: "rebound", reason: baseCommit };
      outcomes.push(outcome);
      console.log(`rebound ${capability} ${file} — ${atHead.resolved} input(s) unchanged since ${commitLabel(baseCommit)}`);
    }
  }
  return outcomes;
}

function commitLabel(commit: string): string {
  return commit.length > 12 ? commit.slice(0, 12) : commit;
}
