import type { Dirent } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { parse } from "yaml";
import { validateMission } from "../schema/mission.js";
import {
  validateRuntimeResult,
  validateVerificationResult,
  type RuntimeResultDocument,
  type VerificationResultDocument,
} from "../schema/artifacts.js";
import { RuntimeControlSchema, RuntimeRecoveryRecordSchema, type RuntimeControl } from "../schema/runtime-control.js";
import { CanonicalTeamStateSchema, type CanonicalTeamState } from "../schema/team.js";
import { readNativeCostFacts, resolveRunCost, tokenTotalsFromUsage, type RunTokenTotals } from "./runtime-accounting.js";
import { loadOperatorPriceTable, type OperatorPriceTable } from "./cost-table.js";

export type RunRecord = {
  mission_id: string;
  run_id: string;
  runtime?: string;
  provider?: string;
  model?: string;
  workflow_profile?: string;
  /** Adopted session template id, from `session-template.json` when present. */
  template_id?: string;
  /** Adopted session template tier, from `session-template.json` when present. */
  tier?: string;
  status?: string;
  stop_code?: string;
  stop_reason?: string;
  started_at?: string;
  finished_at?: string;
  duration_ms?: number;
  turns?: number;
  denials?: number;
  input_tokens?: number;
  output_tokens?: number;
  cache_read_tokens?: number;
  cache_write_tokens?: number;
  /** Token totals summed from the run's native event stream, or its recorded usage. */
  token_totals?: RunTokenTotals;
  cost_usd?: number;
  cost_basis?: string;
  resumed_from?: string;
  verification_status?: string;
  peak_memory_bytes?: number;
  /** Provenance of `cost_usd`: reported by the runtime, or estimated by the harness. */
  cost_source?: "reported" | "estimated";
  /** Why `cost_usd` is unknown; present exactly when it is. */
  cost_unknown_reason?: string;
  /** Team context when this run was a worker dispatched by `run-team`. */
  team?: { mission_id: string; role: string };
  /** Experiment provenance, from `experiment.json` in the run directory when present. */
  experiment?: { id: string; arm: string; split: string };
};

export type RunGroupSummary = {
  key: string | undefined;
  runs: number;
  passed: number;
  success_rate: number;
  known_cost_runs: number;
  total_cost_usd: number | undefined;
  mean_cost_usd: number | undefined;
  mean_duration_ms: number | undefined;
  cache_read_share: number | undefined;
};

type Usage = {
  input_tokens?: number;
  output_tokens?: number;
  cache_read_tokens?: number;
  cache_write_tokens?: number;
  cost_usd?: number;
  cost_basis?: string;
  provider?: string;
  model?: string;
};

const isFiniteNonNegative = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0;
const optionalNumber = (value: unknown): number | undefined => isFiniteNonNegative(value) ? value : undefined;
const optionalString = (value: unknown): string | undefined => typeof value === "string" ? value : undefined;

async function readYamlFile(filePath: string): Promise<unknown | undefined> {
  try { return parse(await readFile(filePath, "utf8")); } catch { return undefined; }
}

async function readJsonFile(filePath: string): Promise<unknown | undefined> {
  try { return JSON.parse(await readFile(filePath, "utf8")); } catch { return undefined; }
}

async function readMissionWorkflow(missionPath: string): Promise<string | undefined> {
  const parsed = await readYamlFile(missionPath);
  if (parsed === undefined) return undefined;
  try { return validateMission(parsed).workflow_profile; } catch { return undefined; }
}

function usageOf(result: RuntimeResultDocument | undefined, control: RuntimeControl | undefined): Usage | undefined {
  return result?.usage ?? control?.usage;
}

function duration(startedAt: string | undefined, finishedAt: string | undefined): number | undefined {
  if (!startedAt || !finishedAt) return undefined;
  const value = Date.parse(finishedAt) - Date.parse(startedAt);
  return Number.isFinite(value) && value >= 0 ? value : undefined;
}

async function indexRun(
  missionId: string,
  missionRoot: string,
  runId: string,
  priceTable: OperatorPriceTable | undefined,
  team?: { mission_id: string; role: string },
): Promise<RunRecord | undefined> {
  const runRoot = path.join(missionRoot, "runs", runId);
  const [resultRaw, controlRaw, recoveryRaw, verificationRaw, workflowProfile, templateRaw, experimentRaw] = await Promise.all([
    readYamlFile(path.join(runRoot, "runtime-result.yaml")),
    readJsonFile(path.join(runRoot, "runtime-control.json")),
    readJsonFile(path.join(runRoot, "runtime-recovery.json")),
    readYamlFile(path.join(runRoot, "verification.yaml")),
    readMissionWorkflow(path.join(missionRoot, "mission.yaml")),
    readJsonFile(path.join(runRoot, "session-template.json")),
    readJsonFile(path.join(runRoot, "experiment.json")),
  ]);
  let result: RuntimeResultDocument | undefined;
  let control: RuntimeControl | undefined;
  let recovery: { source_run_id: string } | undefined;
  let verification: VerificationResultDocument | undefined;
  try { if (resultRaw !== undefined) result = validateRuntimeResult(resultRaw); } catch { /* partial artifact */ }
  try { if (controlRaw !== undefined) control = RuntimeControlSchema.parse(controlRaw); } catch { /* partial artifact */ }
  try { if (recoveryRaw !== undefined) recovery = RuntimeRecoveryRecordSchema.parse(recoveryRaw); } catch { /* partial artifact */ }
  try { if (verificationRaw !== undefined) verification = validateVerificationResult(verificationRaw); } catch { /* partial artifact */ }
  const templateRecord = templateRaw !== null && typeof templateRaw === "object" ? templateRaw as Record<string, unknown> : undefined;
  const experimentRecord = experimentRaw !== null && typeof experimentRaw === "object" ? experimentRaw as Record<string, unknown> : undefined;
  const experimentId = optionalString(experimentRecord?.id);
  const experimentArm = optionalString(experimentRecord?.arm);
  const experimentSplit = optionalString(experimentRecord?.split);
  const experiment = experimentId !== undefined && experimentArm !== undefined && experimentSplit !== undefined
    ? { id: experimentId, arm: experimentArm, split: experimentSplit }
    : undefined;
  if (!result && !control) return undefined;

  const usage = usageOf(result, control);
  const startedAt = result?.started_at ?? control?.started_at;
  const finishedAt = result?.finished_at;
  const runtime = result?.runtime ?? control?.runtime;
  const cost = optionalNumber(result?.cost_usd ?? usage?.cost_usd);
  const costBasis = result?.cost_basis ?? usage?.cost_basis;
  // A Command Code run consults its native stream even when its result already
  // carries a price: the stream is where token totals and the model come from,
  // and where an unpriced run's cost gap gets explained (never guessed).
  const native = runtime === "command-code" ? await readNativeCostFacts(runRoot) : undefined;
  const resolvedCost = resolveRunCost({ runtime, resultCostUsd: cost, resultCostBasis: costBasis, native, priceTable });
  const tokenTotals = tokenTotalsFromUsage(native?.usage) ?? tokenTotalsFromUsage(usage);
  return {
    mission_id: result?.mission_id ?? control?.mission_id ?? missionId,
    run_id: runId,
    runtime,
    provider: result?.provider ?? usage?.provider ?? control?.usage?.provider,
    model: result?.model ?? usage?.model ?? control?.usage?.model ?? native?.model,
    workflow_profile: workflowProfile,
    template_id: optionalString(templateRecord?.template_id),
    tier: optionalString(templateRecord?.tier),
    status: result?.status ?? control?.status,
    stop_code: control?.stop_code,
    stop_reason: control?.stop_reason,
    started_at: startedAt,
    finished_at: finishedAt,
    duration_ms: duration(startedAt, finishedAt),
    turns: control?.turns,
    denials: control?.denials,
    input_tokens: optionalNumber(usage?.input_tokens),
    output_tokens: optionalNumber(usage?.output_tokens),
    cache_read_tokens: optionalNumber(usage?.cache_read_tokens),
    cache_write_tokens: optionalNumber(usage?.cache_write_tokens),
    ...(tokenTotals !== undefined ? { token_totals: tokenTotals } : {}),
    cost_usd: resolvedCost.cost_usd,
    cost_basis: costBasis,
    ...(resolvedCost.cost_source !== undefined ? { cost_source: resolvedCost.cost_source } : {}),
    ...(resolvedCost.cost_unknown_reason !== undefined ? { cost_unknown_reason: resolvedCost.cost_unknown_reason } : {}),
    resumed_from: recovery?.source_run_id,
    verification_status: verification?.status,
    peak_memory_bytes: control?.peak_memory_bytes,
    ...(team !== undefined ? { team } : {}),
    ...(experiment !== undefined ? { experiment } : {}),
  };
}

async function readTeamState(filePath: string): Promise<CanonicalTeamState | undefined> {
  const raw = await readJsonFile(filePath);
  if (raw === undefined) return undefined;
  try { return CanonicalTeamStateSchema.parse(raw); } catch { return undefined; }
}

/**
 * Index the worker runs a team parent recorded under its `team/artifacts/`
 * scope. Role and team identity come from the parent's canonical
 * `team-state.json`; each worker's own canonical run lives one `.harness` tree
 * deeper than the mission that owns the team.
 */
async function indexTeamRuns(missionId: string, missionRoot: string, priceTable: OperatorPriceTable | undefined): Promise<RunRecord[]> {
  const teamRoot = path.join(missionRoot, "team");
  let parents: Dirent[] = [];
  try { parents = await readdir(path.join(teamRoot, "artifacts"), { withFileTypes: true }); } catch { return []; }
  const records: RunRecord[] = [];
  for (const parent of parents.filter(entry => entry.isDirectory())) {
    const state = await readTeamState(path.join(missionRoot, "runs", parent.name, "team-state.json"));
    if (!state || state.mission_id !== missionId) continue;
    for (const worker of state.workers) {
      const workerRoot = path.resolve(teamRoot, worker.artifact_scope);
      const relative = path.relative(teamRoot, workerRoot);
      if (relative.length === 0 || relative.startsWith("..") || path.isAbsolute(relative)) continue;
      const workerMissionId = worker.mission_id ?? missionId;
      const record = await indexRun(
        workerMissionId,
        path.join(workerRoot, ".harness", "missions", workerMissionId),
        worker.run_id,
        priceTable,
        { mission_id: missionId, role: worker.role },
      );
      if (record) records.push(record);
    }
  }
  return records;
}

export async function indexRuns(root: string, options: { missionId?: string } = {}): Promise<RunRecord[]> {
  const missionsRoot = path.join(root, ".harness", "missions");
  let missions;
  try { missions = await readdir(missionsRoot, { withFileTypes: true }); } catch { return []; }
  const selected = missions.filter(entry => entry.isDirectory() && (options.missionId === undefined || entry.name === options.missionId));
  // The operator price table is loaded once per index pass; a missing or
  // malformed table prices nothing.
  const priceTable = await loadOperatorPriceTable(root);
  // A run is identified by (mission, run id). A team worker run is also
  // reachable through the parent's team-state pointer, so it must not be
  // counted twice: the team-recorded view (which carries the role) wins.
  const records = new Map<string, RunRecord>();
  const keyOf = (record: RunRecord): string => `${record.mission_id}\u0000${record.run_id}`;
  for (const mission of selected) {
    const missionRoot = path.join(missionsRoot, mission.name);
    let runs: Dirent[] = [];
    try { runs = await readdir(path.join(missionRoot, "runs"), { withFileTypes: true }); } catch { runs = []; }
    for (const run of runs.filter(entry => entry.isDirectory())) {
      const record = await indexRun(mission.name, missionRoot, run.name, priceTable);
      if (record) records.set(keyOf(record), record);
    }
  }
  // Second pass so the team-recorded view of a shared run always wins,
  // independent of the order missions are read.
  for (const mission of selected) {
    for (const record of await indexTeamRuns(mission.name, path.join(missionsRoot, mission.name), priceTable)) {
      records.set(keyOf(record), record);
    }
  }
  return [...records.values()];
}

export type RunGroupDimension = "runtime" | "model" | "workflow_profile" | "stop_code" | "template" | "tier";

/** The `groupBy` "template" dimension reads the run record's `template_id`. */
function groupKeyFor(record: RunRecord, groupBy: RunGroupDimension): string | undefined {
  return groupBy === "template" ? record.template_id : record[groupBy];
}

export function summarizeRuns(records: RunRecord[], groupBy: RunGroupDimension): RunGroupSummary[] {
  const groups = new Map<string | undefined, RunRecord[]>();
  for (const record of records) {
    const key = groupKeyFor(record, groupBy);
    const group = groups.get(key) ?? [];
    group.push(record);
    groups.set(key, group);
  }
  return [...groups.entries()].map(([key, runs]) => {
    const costs = runs.map(run => run.cost_usd).filter(isFiniteNonNegative);
    const durations = runs.map(run => run.duration_ms).filter(isFiniteNonNegative);
    const cacheRuns = runs.filter(run => [run.input_tokens, run.cache_read_tokens, run.cache_write_tokens].every(isFiniteNonNegative));
    const input = cacheRuns.reduce((sum, run) => sum + run.input_tokens!, 0);
    const cacheRead = cacheRuns.reduce((sum, run) => sum + run.cache_read_tokens!, 0);
    const cacheWrite = cacheRuns.reduce((sum, run) => sum + run.cache_write_tokens!, 0);
    const cacheTotal = input + cacheRead + cacheWrite;
    return {
      key, runs: runs.length, passed: runs.filter(run => run.status === "passed").length,
      success_rate: runs.filter(run => run.status === "passed").length / runs.length,
      known_cost_runs: costs.length,
      total_cost_usd: costs.length ? costs.reduce((sum, cost) => sum + cost, 0) : undefined,
      mean_cost_usd: costs.length ? costs.reduce((sum, cost) => sum + cost, 0) / costs.length : undefined,
      mean_duration_ms: durations.length ? durations.reduce((sum, value) => sum + value, 0) / durations.length : undefined,
      cache_read_share: cacheRuns.length && cacheTotal > 0 ? cacheRead / cacheTotal : cacheRuns.length ? 0 : undefined,
    };
  });
}

export function paretoFrontier(summaries: RunGroupSummary[]): RunGroupSummary[] {
  return summaries.filter(candidate => {
    const candidateCost = candidate.mean_cost_usd;
    if (candidateCost === undefined) return false;
    return !summaries.some(other =>
      other !== candidate && other.mean_cost_usd !== undefined &&
      other.success_rate >= candidate.success_rate && other.mean_cost_usd <= candidateCost &&
      (other.success_rate > candidate.success_rate || other.mean_cost_usd < candidateCost)
    );
  });
}
