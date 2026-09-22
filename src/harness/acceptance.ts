import { execFile, spawn } from "node:child_process";
import { cp, lstat, mkdir, readFile, readdir, rm, stat, symlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { parse, stringify } from "yaml";
import { z } from "zod";
import { initializeHarness } from "./init.js";
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


export function classifyAcceptance(
  evidence: Pick<AcceptanceEvidence, "outcome" | "checked_at"> & Partial<Pick<AcceptanceEvidence, "harness_commit">> | null,
  freshnessDays: number,
  now = new Date(),
  currentCommit?: string,
): AcceptanceState {
  if (!evidence) return "unproven";
  if (evidence.outcome === "failed") return "failed";
  if (currentCommit && evidence.harness_commit && evidence.harness_commit !== currentCommit) return "stale";
  const age = now.getTime() - Date.parse(evidence.checked_at);
  return Number.isFinite(age) && age <= freshnessDays * 86_400_000 ? "proven" : "stale";
}

async function latestEvidence(evidenceRoot: string, capability: string): Promise<AcceptanceEvidenceRecord | null> {
  try {
    const file = path.join(evidenceRoot, capability, "latest.json");
    return AcceptanceEvidenceRecordSchema.parse(JSON.parse(await readFile(file, "utf8")));
  } catch {
    return null;
  }
}

export async function acceptanceStatus(root: string, now = new Date()): Promise<{ counts: Record<AcceptanceState, number>; failed: string[]; unproven: string[]; states: Record<string, AcceptanceState> }> {
  const registry = await loadAcceptanceRegistry(root);
  const currentCommit = await gitCommit(root);
  const evidenceRoot = path.join(root, "acceptance", "evidence");
  const counts: Record<AcceptanceState, number> = { proven: 0, stale: 0, failed: 0, unproven: 0, fixture_only: 0 };
  const failed: string[] = [];
  const unproven: string[] = [];
  const states: Record<string, AcceptanceState> = {};
  for (const [capability, entry] of Object.entries(registry.entries)) {
    const evidence = await latestEvidence(evidenceRoot, capability);
    const state = entry.real_mission === "not_applicable" && !evidence ? "fixture_only" : classifyAcceptance(evidence, entry.freshness_days, now, currentCommit);
    states[capability] = state;
    counts[state] += 1;
    if (state === "failed") failed.push(capability);
    if (state === "unproven") unproven.push(capability);
  }
  return { counts, failed, unproven, states };
}

export async function renderAcceptanceReport(root: string, now = new Date(), options: { evidenceRoot?: string } = {}): Promise<string> {
  const registry = await loadAcceptanceRegistry(root);
  const currentCommit = await gitCommit(root);
  const evidenceRoot = options.evidenceRoot ?? path.join(root, "acceptance", "evidence");
  const reportDirectory = path.join(root, "docs", "acceptance");
  const rows = ["<!-- Generated by `uh acceptance report`; do not edit by hand. -->", "# Acceptance evidence", "", "| Capability | Inventory ID | Title | State | Last checked | Runtime | Model | Cost (USD) | Evidence |", "|---|---|---|---|---|---|---|---:|---|"];
  for (const [capability, entry] of Object.entries(registry.entries)) {
    const evidence = await latestEvidence(evidenceRoot, capability);
    const state = entry.real_mission === "not_applicable" && !evidence ? "fixture_only" : classifyAcceptance(evidence, entry.freshness_days, now, currentCommit);
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
        const lines = guardLog.split(/\r?\n/).filter((line) => line.trim() !== "").length;
        observed.tool_guard_lines = lines;
        factSources.tool_guard_lines = source;
        if (source === "first" || source === "last") sourceValues[source].tool_guard_lines = lines;
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
  const evidence: AcceptanceEvidenceRecord = {
    schema_version: "uh.acceptance-evidence.v0",
    capability,
    outcome: "failed",
    checked_at: new Date().toISOString(),
    harness_commit: await gitCommit(sourceRoot),
    runtime,
    provider: UNKNOWN,
    model: entry.model ?? options.model ?? UNKNOWN,
    cost_usd: "unknown",
    workspace: runRoot,
    run_ids: [],
    mission_id: missionId,
    expected: entry.expected,
    observed: { status: "failed", reason: "wrapper_unavailable" },
    fact_sources: {},
    mismatches: [{ field: "wrapper", expected: `${capability} mechanism for runtime ${runtime}`, observed: "wrapper_unavailable" }],
    artifact_root: path.join(runRoot, ".harness", "missions", missionId),
    cli: { exit_code: null, stderr_tail: "", stdout_tail: "" },
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
  const launchArgs = baseAcceptanceCapability(capability) === "R5" ? [...args, "--run-id", cancelRunId] : args;
  const spawnEnv = acceptanceSpawnEnv(entry, runRoot);
  let result: { code: number; stdout: string; stderr: string };
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
  } else {
    result = await runProcess(process.execPath, launchArgs, sourceRoot, sourceRoot, spawnEnv);
  }
  const facts = await collectFacts(runRoot, missionId, entry.expected);
  if (entry.support_shim) facts.observed.shim_on_path = true;
  if (result.code !== 0 && facts.observed.status === "passed") facts.observed.status = "failed";
  const mismatches = compareAcceptanceFacts(entry.expected, facts.observed);
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

export type AcceptanceRunOptions = { workspace?: string; runtime?: string; model?: string; keep?: boolean; capabilities?: string[]; cliPath?: string };

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
