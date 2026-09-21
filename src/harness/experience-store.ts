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

export type RunRecord = {
  mission_id: string;
  run_id: string;
  runtime?: string;
  provider?: string;
  model?: string;
  workflow_profile?: string;
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
  cost_usd?: number;
  cost_basis?: string;
  resumed_from?: string;
  verification_status?: string;
  peak_memory_bytes?: number;
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

async function indexRun(missionId: string, missionRoot: string, runId: string): Promise<RunRecord | undefined> {
  const runRoot = path.join(missionRoot, "runs", runId);
  const [resultRaw, controlRaw, recoveryRaw, verificationRaw, workflowProfile] = await Promise.all([
    readYamlFile(path.join(runRoot, "runtime-result.yaml")),
    readJsonFile(path.join(runRoot, "runtime-control.json")),
    readJsonFile(path.join(runRoot, "runtime-recovery.json")),
    readYamlFile(path.join(runRoot, "verification.yaml")),
    readMissionWorkflow(path.join(missionRoot, "mission.yaml")),
  ]);
  let result: RuntimeResultDocument | undefined;
  let control: RuntimeControl | undefined;
  let recovery: { source_run_id: string } | undefined;
  let verification: VerificationResultDocument | undefined;
  try { if (resultRaw !== undefined) result = validateRuntimeResult(resultRaw); } catch { /* partial artifact */ }
  try { if (controlRaw !== undefined) control = RuntimeControlSchema.parse(controlRaw); } catch { /* partial artifact */ }
  try { if (recoveryRaw !== undefined) recovery = RuntimeRecoveryRecordSchema.parse(recoveryRaw); } catch { /* partial artifact */ }
  try { if (verificationRaw !== undefined) verification = validateVerificationResult(verificationRaw); } catch { /* partial artifact */ }
  if (!result && !control) return undefined;

  const usage = usageOf(result, control);
  const startedAt = result?.started_at ?? control?.started_at;
  const finishedAt = result?.finished_at;
  const cost = optionalNumber(result?.cost_usd ?? usage?.cost_usd);
  return {
    mission_id: result?.mission_id ?? control?.mission_id ?? missionId,
    run_id: runId,
    runtime: result?.runtime ?? control?.runtime,
    provider: result?.provider ?? usage?.provider ?? control?.usage?.provider,
    model: result?.model ?? usage?.model ?? control?.usage?.model,
    workflow_profile: workflowProfile,
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
    cost_usd: cost,
    cost_basis: result?.cost_basis ?? usage?.cost_basis,
    resumed_from: recovery?.source_run_id,
    verification_status: verification?.status,
    peak_memory_bytes: control?.peak_memory_bytes,
  };
}

export async function indexRuns(root: string, options: { missionId?: string } = {}): Promise<RunRecord[]> {
  const missionsRoot = path.join(root, ".harness", "missions");
  let missions;
  try { missions = await readdir(missionsRoot, { withFileTypes: true }); } catch { return []; }
  const selected = missions.filter(entry => entry.isDirectory() && (options.missionId === undefined || entry.name === options.missionId));
  const records: RunRecord[] = [];
  for (const mission of selected) {
    let runs;
    try { runs = await readdir(path.join(missionsRoot, mission.name, "runs"), { withFileTypes: true }); } catch { continue; }
    for (const run of runs.filter(entry => entry.isDirectory())) {
      const record = await indexRun(mission.name, path.join(missionsRoot, mission.name), run.name);
      if (record) records.push(record);
    }
  }
  return records;
}

export function summarizeRuns(records: RunRecord[], groupBy: "runtime" | "model" | "workflow_profile" | "stop_code"): RunGroupSummary[] {
  const groups = new Map<string | undefined, RunRecord[]>();
  for (const record of records) {
    const key = record[groupBy];
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
