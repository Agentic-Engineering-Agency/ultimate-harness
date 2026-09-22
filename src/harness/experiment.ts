/**
 * Matched-budget experiments over a seeded search/held-out task split.
 *
 * An experiment names a set of tasks (each carrying executable checks), splits
 * them deterministically into a `search` and a `held_out` partition, and runs
 * two or more arms (a session template plus runtime-config overrides) over the
 * same tasks at a matched budget. Gains measured only on `search` tasks are the
 * classic harness-evolution trap, so the held-out partition is not optional.
 *
 * Every function here is pure except the injected `runner` and the persistence
 * in `runExperiment`, so the whole lifecycle is drivable from a fake runner and
 * no test ever starts a model runtime.
 */
import path from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { parse as parseYaml } from "yaml";
import { harnessDir, missionDir } from "./paths.js";
import { validateMission } from "../schema/mission.js";
import {
  validateExperiment,
  type ExperimentArm,
  type ExperimentDocument,
} from "../schema/experiment.js";
import {
  MIN_ARM_RUNS,
  attemptsToMatch,
  bestOfN,
  compareArms,
  summarizeArm,
  type ArmComparison,
  type ArmSummary,
} from "./run-comparison.js";
import type { RunRecord } from "./experience-store.js";

export type ExperimentSplit = "search" | "held_out";

/** The deterministic partition of an experiment's tasks. */
export interface ExperimentSplitResult {
  /** The seed the split was drawn from; undefined for an explicit held-out list. */
  seed: number | undefined;
  search: string[];
  held_out: string[];
}

/** One planned run: a task under an arm for an attempt, tagged with its split. */
export interface ExperimentPlanEntry {
  task: string;
  arm: string;
  attempt: number;
  split: ExperimentSplit;
}

/** What the injected runner is asked to execute. */
export interface ExperimentRunRequest {
  experiment_id: string;
  task: string;
  arm: ExperimentArm;
  attempt: number;
  split: ExperimentSplit;
}

/** The settled record of one run, as the injected runner reports it. */
export interface ExperimentRunResult {
  run_id?: string;
  mission_id?: string;
  runtime?: string;
  status?: string;
  stop_code?: string;
  denials?: number;
  /** Guard classes of the run's denied calls, one entry per denial, when recorded. */
  denial_classes?: string[];
  cost_usd?: number;
  duration_ms?: number;
}

/**
 * Injected run executor. Mirrors the per-runtime `runtimeRunner` seam in
 * `harness/run-all.ts`: `runExperiment` owns the plan, the budget, and the
 * persistence, and the runner owns the actual execution. Tests supply a fake.
 */
export type ExperimentRunner = (request: ExperimentRunRequest) => Promise<ExperimentRunResult>;

/** A persisted run row: the plan entry plus the settled result (or a skip). */
export interface ExperimentRunRecord {
  experiment_id: string;
  task: string;
  arm: string;
  attempt: number;
  split: ExperimentSplit;
  /** True when a budget line was reached before this entry could run. */
  skipped: boolean;
  skip_reason?: string;
  run_id?: string;
  mission_id?: string;
  runtime?: string;
  status?: string;
  stop_code?: string;
  denials?: number;
  /** Count of denied calls by guard class, when the runtime recorded classes. */
  denial_classes?: Record<string, number>;
  /** Count of guard_tamper denials in this run, when guard classes were recorded. */
  guard_tamper?: number;
  /** Count of containment_escape denials in this run, when guard classes were recorded. */
  containment_escape?: number;
  cost_usd?: number;
  duration_ms?: number;
}

export interface ExperimentRunOptions {
  runner: ExperimentRunner;
  /** Injected clock, used only to time a run the runner did not time itself. */
  now?: () => number;
}

export interface ExperimentArmReport extends ArmSummary {
  arm: string;
  split: ExperimentSplit;
  mean_denials: number | undefined;
  guard_tamper_stops: number;
  containment_escape_stops: number;
}

export interface ExperimentComparisonReport {
  a: string;
  b: string;
  comparison: ArmComparison;
}

/** How many plain repeats or parallel attempts of the baseline reach another arm. */
export interface ExperimentBaselineRepeat {
  arm: string;
  baseline_arm: string;
  baseline_success_rate: number;
  target_success_rate: number;
  parallel_attempts: number;
  best_of_n: number;
  attempts_to_match: number | undefined;
}

export interface ExperimentSplitReport {
  split: ExperimentSplit;
  task_count: number;
  arms: ExperimentArmReport[];
  comparisons: ExperimentComparisonReport[];
  baseline_repeats: ExperimentBaselineRepeat[];
}

export interface ExperimentReport {
  experiment_id: string;
  title: string;
  seed: number | undefined;
  baseline: string;
  split_sizes: { search: number; held_out: number };
  splits: ExperimentSplitReport[];
}

export interface ExperimentRunOutcome {
  experiment_id: string;
  seed: number | undefined;
  split: ExperimentSplitResult;
  plan: ExperimentPlanEntry[];
  runs: ExperimentRunRecord[];
  report: ExperimentReport;
  executed: number;
  skipped: number;
  stopped: boolean;
  stop_reason?: "max_runs" | "max_total_cost_usd";
  plan_path: string;
  runs_path: string;
  report_path: string;
  report_markdown_path: string;
}

function experimentsDir(root: string): string {
  return path.join(harnessDir(root), "experiments");
}

/** `.harness/experiments/<id>.yaml` — the spec file. */
export function experimentSpecPath(root: string, id: string): string {
  return path.join(experimentsDir(root), `${id}.yaml`);
}

/** `.harness/experiments/<id>/` — the plan, runs, and reports. */
export function experimentArtifactsDir(root: string, id: string): string {
  return path.join(experimentsDir(root), id);
}

function isSafeExperimentId(id: string): boolean {
  return typeof id === "string" && id !== "." && id !== ".." && !id.includes("/") && !id.includes("\\")
    && /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(id);
}

/**
 * The seeded PRNG the split draws from. Small, fast, and — critically —
 * reproducible across machines, so a seed always names the same partition.
 */
export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Partition `spec.tasks` into `search` and `held_out`. For a seeded split the
 * membership is a deterministic function of the seed and fraction; for an
 * explicit split it is exactly the listed tasks. The original task order is
 * preserved inside each partition.
 */
export function splitTasks(spec: ExperimentDocument): ExperimentSplitResult {
  const tasks = spec.tasks;
  if ("held_out" in spec.split) {
    const heldOutIds = new Set(spec.split.held_out);
    for (const task of spec.split.held_out) {
      if (!tasks.includes(task)) {
        throw new Error(`split.held_out task "${task}" is not in tasks`);
      }
    }
    return {
      seed: undefined,
      search: tasks.filter((task) => !heldOutIds.has(task)),
      held_out: tasks.filter((task) => heldOutIds.has(task)),
    };
  }

  const { seed, held_out_fraction } = spec.split;
  const heldOutCount = Math.min(
    tasks.length,
    Math.max(tasks.length > 1 ? 1 : 0, Math.round(held_out_fraction * tasks.length)),
  );
  const shuffled = [...tasks];
  const random = mulberry32(seed);
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  const heldOutIds = new Set(shuffled.slice(0, heldOutCount));
  return {
    seed,
    search: tasks.filter((task) => !heldOutIds.has(task)),
    held_out: tasks.filter((task) => heldOutIds.has(task)),
  };
}

/**
 * The ordered run plan. Arms are interleaved at every attempt level, so a
 * budget stop trims each arm by the same amount and can never favour one.
 * `search` tasks precede `held_out` tasks: hold out evaluation until the
 * search partition is exhausted.
 */
export function planExperiment(spec: ExperimentDocument): ExperimentPlanEntry[] {
  const split = splitTasks(spec);
  const ordered: Array<{ task: string; split: ExperimentSplit }> = [
    ...split.search.map((task) => ({ task, split: "search" as const })),
    ...split.held_out.map((task) => ({ task, split: "held_out" as const })),
  ];
  const maxAttempts = Math.max(...spec.arms.map((arm) => arm.attempts_per_task));
  const entries: ExperimentPlanEntry[] = [];
  for (const { task, split: taskSplit } of ordered) {
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      for (const arm of spec.arms) {
        if (attempt > arm.attempts_per_task) continue;
        entries.push({ task, arm: arm.id, attempt, split: taskSplit });
      }
    }
  }
  return entries;
}

/**
 * Read and validate `.harness/experiments/<id>.yaml`. Every declared task must
 * exist under `.harness/missions/` and declare `verification.required_checks`,
 * because a task without executable checks cannot be scored.
 */
export async function loadExperiment(root: string, id: string): Promise<ExperimentDocument> {
  if (!isSafeExperimentId(id)) {
    throw new Error(`Invalid or unsafe experiment id: "${id}"`);
  }
  const filePath = experimentSpecPath(root, id);
  let parsed: unknown;
  try {
    parsed = parseYaml(await readFile(filePath, "utf8"));
  } catch (err) {
    throw new Error(`Experiment not found: "${id}" (${(err as Error).message})`);
  }
  const spec = validateExperiment(parsed);
  if (spec.id !== id) {
    throw new Error(`Experiment id "${spec.id}" does not match file name "${id}.yaml"`);
  }
  for (const task of spec.tasks) {
    const missionPath = path.join(missionDir(root, task), "mission.yaml");
    let missionRaw: unknown;
    try {
      missionRaw = parseYaml(await readFile(missionPath, "utf8"));
    } catch {
      throw new Error(`Experiment task "${task}" has no mission file at ${missionPath}`);
    }
    let mission;
    try {
      mission = validateMission(missionRaw);
    } catch (err) {
      throw new Error(`Experiment task "${task}" mission is invalid: ${(err as Error).message}`);
    }
    if (mission.verification.required_checks.length === 0) {
      throw new Error(`Experiment task "${task}" must declare verification.required_checks`);
    }
  }
  return spec;
}

/** Read the persisted run rows for an experiment; an absent file is an empty list. */
export async function loadExperimentRuns(root: string, id: string): Promise<ExperimentRunRecord[]> {
  let raw: string;
  try {
    raw = await readFile(path.join(experimentArtifactsDir(root, id), "runs.ndjson"), "utf8");
  } catch {
    return [];
  }
  const records: ExperimentRunRecord[] = [];
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed === "") continue;
    try {
      records.push(JSON.parse(trimmed) as ExperimentRunRecord);
    } catch {
      // A truncated or corrupt row is skipped rather than poisoning the report.
    }
  }
  return records;
}

function classCounts(classes: readonly string[] | undefined): Record<string, number> | undefined {
  if (classes === undefined) return undefined;
  const counts: Record<string, number> = {};
  for (const name of classes) counts[name] = (counts[name] ?? 0) + 1;
  return counts;
}

const isKnownCost = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= 0;

/**
 * Run every plan entry through the injected runner, stop at the first budget
 * line, and persist the plan, the run rows, and the report under
 * `.harness/experiments/<id>/`. Unknown cost never counts against the cost
 * budget, so an unpriced arm cannot silently spend past the cap or look free.
 */
export async function runExperiment(
  root: string,
  spec: ExperimentDocument,
  options: ExperimentRunOptions,
): Promise<ExperimentRunOutcome> {
  const now = options.now ?? (() => Date.now());
  const artifactsDir = experimentArtifactsDir(root, spec.id);
  await mkdir(artifactsDir, { recursive: true });

  const split = splitTasks(spec);
  const plan = planExperiment(spec);
  const budget = spec.budget;
  const records: ExperimentRunRecord[] = [];
  let executed = 0;
  let knownCost = 0;
  let stopped = false;
  let stopReason: "max_runs" | "max_total_cost_usd" | undefined;

  const budgetHit = (): boolean => {
    if (budget.max_runs !== undefined && executed >= budget.max_runs) {
      stopReason = "max_runs";
      return true;
    }
    if (budget.max_total_cost_usd !== undefined && knownCost >= budget.max_total_cost_usd) {
      stopReason = "max_total_cost_usd";
      return true;
    }
    return false;
  };

  for (const entry of plan) {
    if (stopped || budgetHit()) {
      stopped = true;
      records.push({ experiment_id: spec.id, ...entry, skipped: true, skip_reason: "budget" });
      continue;
    }
    const arm = spec.arms.find((candidate) => candidate.id === entry.arm);
    if (!arm) throw new Error(`Plan references an unknown arm: ${entry.arm}`);

    const startedAt = now();
    const result = await options.runner({
      experiment_id: spec.id,
      task: entry.task,
      arm,
      attempt: entry.attempt,
      split: entry.split,
    });
    const elapsed = now() - startedAt;
    executed += 1;
    if (isKnownCost(result.cost_usd)) knownCost += result.cost_usd;

    const classes = classCounts(result.denial_classes);
    const durationMs = result.duration_ms ?? (Number.isFinite(elapsed) && elapsed >= 0 ? elapsed : undefined);
    records.push({
      experiment_id: spec.id,
      ...entry,
      skipped: false,
      ...(result.run_id !== undefined ? { run_id: result.run_id } : {}),
      ...(result.mission_id !== undefined ? { mission_id: result.mission_id } : {}),
      ...(result.runtime !== undefined ? { runtime: result.runtime } : {}),
      ...(result.status !== undefined ? { status: result.status } : {}),
      ...(result.stop_code !== undefined ? { stop_code: result.stop_code } : {}),
      ...(result.denials !== undefined ? { denials: result.denials } : {}),
      ...(classes !== undefined ? { denial_classes: classes } : {}),
      ...(classes !== undefined ? { guard_tamper: classes.guard_tamper ?? 0 } : {}),
      ...(classes !== undefined ? { containment_escape: classes.containment_escape ?? 0 } : {}),
      ...(isKnownCost(result.cost_usd) ? { cost_usd: result.cost_usd } : {}),
      ...(durationMs !== undefined ? { duration_ms: durationMs } : {}),
    });

    if (result.run_id !== undefined && result.run_id !== "") {
      await tagRun(root, entry.task, result.run_id, { id: spec.id, arm: entry.arm, split: entry.split });
    }
  }

  const report = summarizeExperiment(records, spec);
  const planPath = path.join(artifactsDir, "plan.json");
  const runsPath = path.join(artifactsDir, "runs.ndjson");
  const reportPath = path.join(artifactsDir, "report.json");
  const reportMarkdownPath = path.join(artifactsDir, "report.md");

  await writeFile(
    planPath,
    JSON.stringify({ experiment_id: spec.id, seed: split.seed, search: split.search, held_out: split.held_out, entries: plan }, null, 2) + "\n",
    "utf8",
  );
  await writeFile(runsPath, records.map((record) => JSON.stringify(record)).join("\n") + (records.length ? "\n" : ""), "utf8");
  await writeFile(reportPath, JSON.stringify(report, null, 2) + "\n", "utf8");
  await writeFile(reportMarkdownPath, renderExperimentMarkdown(report), "utf8");

  const skipped = records.filter((record) => record.skipped).length;
  return {
    experiment_id: spec.id,
    seed: split.seed,
    split,
    plan,
    runs: records,
    report,
    executed,
    skipped,
    stopped,
    ...(stopReason !== undefined ? { stop_reason: stopReason } : {}),
    plan_path: planPath,
    runs_path: runsPath,
    report_path: reportPath,
    report_markdown_path: reportMarkdownPath,
  };
}

/**
 * Tag a run directory with its experiment provenance so the experience store
 * can group it, written the same way session-template metadata is written.
 */
async function tagRun(
  root: string,
  task: string,
  runId: string,
  tag: { id: string; arm: string; split: ExperimentSplit },
): Promise<void> {
  const runDir = path.join(missionDir(root, task), "runs", runId);
  await mkdir(runDir, { recursive: true });
  await writeFile(path.join(runDir, "experiment.json"), JSON.stringify({ id: tag.id, arm: tag.arm, split: tag.split }, null, 2) + "\n", "utf8");
}

function toRunRecord(record: ExperimentRunRecord): RunRecord {
  return {
    mission_id: record.mission_id ?? record.task,
    run_id: record.run_id ?? `${record.task}:${record.arm}:${record.attempt}`,
    ...(record.status !== undefined ? { status: record.status } : {}),
    ...(record.stop_code !== undefined ? { stop_code: record.stop_code } : {}),
    ...(record.denials !== undefined ? { denials: record.denials } : {}),
    ...(record.cost_usd !== undefined ? { cost_usd: record.cost_usd } : {}),
    ...(record.duration_ms !== undefined ? { duration_ms: record.duration_ms } : {}),
  };
}

function summarizeArmRecords(
  arm: string,
  split: ExperimentSplit,
  records: readonly ExperimentRunRecord[],
): ExperimentArmReport {
  const summary = summarizeArm(records.map(toRunRecord));
  const denials = records
    .map((record) => record.denials)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  return {
    ...summary,
    arm,
    split,
    mean_denials: denials.length ? denials.reduce((sum, value) => sum + value, 0) / denials.length : undefined,
    guard_tamper_stops: records.reduce((sum, record) => sum + (record.guard_tamper ?? 0), 0),
    containment_escape_stops: records.reduce((sum, record) => sum + (record.containment_escape ?? 0), 0),
  };
}

/**
 * Group the run rows by split and arm, compare every arm pair within each split
 * (the same `compareArms` the observatory uses), and add the baseline arm's
 * best-of-n and attempts-to-match lines. Skipped rows carry no evidence and are
 * excluded; unknown cost stays unknown.
 */
export function summarizeExperiment(
  runs: readonly ExperimentRunRecord[],
  spec: ExperimentDocument,
): ExperimentReport {
  const split = splitTasks(spec);
  const analyzed = runs.filter((record) => !record.skipped);
  const splitNames: ExperimentSplit[] = ["search", "held_out"];

  const splits: ExperimentSplitReport[] = splitNames.map((splitName) => {
    const inSplit = analyzed.filter((record) => record.split === splitName);
    const arms = spec.arms.map((arm) =>
      summarizeArmRecords(arm.id, splitName, inSplit.filter((record) => record.arm === arm.id)),
    );
    const comparisons: ExperimentComparisonReport[] = [];
    for (let i = 0; i < spec.arms.length; i += 1) {
      for (let j = i + 1; j < spec.arms.length; j += 1) {
        const a = spec.arms[i].id;
        const b = spec.arms[j].id;
        comparisons.push({
          a,
          b,
          comparison: compareArms(
            inSplit.filter((record) => record.arm === a).map(toRunRecord),
            inSplit.filter((record) => record.arm === b).map(toRunRecord),
          ),
        });
      }
    }
    const baselineArm = arms.find((arm) => arm.arm === spec.baseline.arm);
    const baselineRate = baselineArm?.success_rate ?? 0;
    const baselineRepeats: ExperimentBaselineRepeat[] = arms
      .filter((arm) => arm.arm !== spec.baseline.arm)
      .map((arm) => ({
        arm: arm.arm,
        baseline_arm: spec.baseline.arm,
        baseline_success_rate: baselineRate,
        target_success_rate: arm.success_rate,
        parallel_attempts: spec.baseline.parallel_attempts,
        best_of_n: bestOfN(baselineRate, spec.baseline.parallel_attempts),
        attempts_to_match: attemptsToMatch(baselineRate, arm.success_rate),
      }));
    return {
      split: splitName,
      task_count: splitName === "search" ? split.search.length : split.held_out.length,
      arms,
      comparisons,
      baseline_repeats: baselineRepeats,
    };
  });

  return {
    experiment_id: spec.id,
    title: spec.title,
    seed: split.seed,
    baseline: spec.baseline.arm,
    split_sizes: { search: split.search.length, held_out: split.held_out.length },
    splits,
  };
}

const rate = (value: number): string => `${(value * 100).toFixed(1)}%`;
const interval = (arm: { interval: { low: number; high: number } }): string =>
  `${rate(arm.interval.low)}-${rate(arm.interval.high)}`;

/** One-sentence verdict for an arm pair, matching the observatory's wording. */
export function experimentVerdictLine(comparison: ArmComparison, aLabel: string, bLabel: string): string {
  if (comparison.verdict === "insufficient_data") {
    return `insufficient_data — ${aLabel} has ${comparison.a.runs} run(s) and ${bLabel} has ${comparison.b.runs}; at least ${MIN_ARM_RUNS} per arm are needed before any difference is reportable.`;
  }
  if (comparison.verdict === "no_clear_difference") {
    return `no_clear_difference — the 95% Wilson intervals overlap (${interval(comparison.a)} vs ${interval(comparison.b)}), so ${rate(comparison.a.success_rate)} vs ${rate(comparison.b.success_rate)} is within noise.`;
  }
  const winner = comparison.verdict === "a_better" ? aLabel : bLabel;
  const loser = comparison.verdict === "a_better" ? bLabel : aLabel;
  const winnerArm = comparison.verdict === "a_better" ? comparison.a : comparison.b;
  const loserArm = comparison.verdict === "a_better" ? comparison.b : comparison.a;
  return `${comparison.verdict} — ${winner} beats ${loser} on success rate (${rate(winnerArm.success_rate)} vs ${rate(loserArm.success_rate)}) with non-overlapping 95% Wilson intervals (${interval(winnerArm)} vs ${interval(loserArm)}).`;
}

/** The plain-repeats line: what repeating the baseline buys against another arm. */
export function experimentRepeatsLine(repeat: ExperimentBaselineRepeat): string {
  const { baseline_arm: baseline, arm, baseline_success_rate: baselineRate, target_success_rate: targetRate } = repeat;
  if (repeat.attempts_to_match === undefined) {
    return `none of ${baseline}'s runs passed, so no number of plain repeats reaches ${arm}'s ${rate(targetRate)}.`;
  }
  if (targetRate <= baselineRate) {
    return `${arm} already passes at ${rate(targetRate)}, so repeating ${baseline} at ${rate(baselineRate)} is not needed.`;
  }
  return `${repeat.attempts_to_match} plain repeat(s) of ${baseline} at ${rate(baselineRate)} would match ${arm}'s ${rate(targetRate)}; ${repeat.parallel_attempts} parallel attempt(s) of ${baseline} reach ${rate(repeat.best_of_n)}.`;
}

const orUnknown = (value: number | undefined, format: (n: number) => string): string =>
  value === undefined ? "unknown" : format(value);

/** Deterministic markdown report, persisted as `report.md`. */
export function renderExperimentMarkdown(report: ExperimentReport): string {
  const lines: string[] = [];
  lines.push(`# Experiment: ${report.title}`);
  lines.push("");
  lines.push(`- Id: \`${report.experiment_id}\``);
  lines.push(`- Seed: ${report.seed === undefined ? "explicit held-out split" : report.seed}`);
  lines.push(`- Split sizes: search ${report.split_sizes.search}, held_out ${report.split_sizes.held_out}`);
  lines.push(`- Baseline arm: \`${report.baseline}\``);
  for (const split of report.splits) {
    lines.push("");
    lines.push(`## ${split.split} (${split.task_count} task(s))`);
    lines.push("");
    lines.push("| Arm | Runs | Passed | Success rate | Wilson 95% | Mean denials | guard_tamper | containment_escape | Mean cost |");
    lines.push("|---|---|---|---|---|---|---|---|---|");
    for (const arm of split.arms) {
      lines.push(
        `| \`${arm.arm}\` | ${arm.runs} | ${arm.passed} | ${rate(arm.success_rate)} | ${interval(arm)} | ` +
        `${orUnknown(arm.mean_denials, (value) => value.toFixed(2))} | ${arm.guard_tamper_stops} | ${arm.containment_escape_stops} | ` +
        `${orUnknown(arm.mean_cost_usd, (value) => `$${value.toFixed(4)}`)} |`,
      );
    }
    for (const comparison of split.comparisons) {
      lines.push("");
      lines.push(`Verdict (\`${comparison.a}\` vs \`${comparison.b}\`): ${experimentVerdictLine(comparison.comparison, comparison.a, comparison.b)}`);
    }
    for (const repeat of split.baseline_repeats) {
      lines.push("");
      lines.push(`Plain repeats (\`${repeat.baseline_arm}\` vs \`${repeat.arm}\`): ${experimentRepeatsLine(repeat)}`);
    }
  }
  lines.push("");
  return lines.join("\n");
}
