/**
 * UH-73 — Staged workflow profile (`plan → prd → exec → verify → fix`).
 *
 * Drives a mission through 5 phases. The mission shape determines who runs
 * each phase:
 *
 *   single -> ALL five phases dispatch against the mission's single adapter.
 *   team   -> Plan / PRD / Verify / Fix are run by the LEADER; Execute is
 *             fanned out across workers via `runTeamMission` (UH-72).
 *
 * The Verify → Fix loop is bounded by `mission.verification.max_iterations`
 * (default 2). When verification still fails after the cap, the staged
 * run terminates in `blocked` rather than spinning forever.
 *
 * Artifacts written per phase (relative to .harness/missions/<id>/):
 *   plan.md, prd.md, runtime-final.txt (Execute, single shape only),
 *   integration-report.md (Execute, team shape — written by team-run),
 *   verify-report.md, fix-report.md.
 *
 * The runtime invocation itself stays in the adapters; this module only
 * sequences the phases and threads injected runners through.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { missionsDir } from "./paths.js";
import { assertSafeMissionId, fileExists } from "./mission.js";
import {
  runTeamMission,
  type TeamMission,
  type TeamRunResult,
  type VerifyMissionLike,
} from "./team-run.js";

export const STAGED_PHASE_NAMES = ["Plan", "PRD", "Execute", "Verify", "Fix"] as const;
export type StagedPhaseName = (typeof STAGED_PHASE_NAMES)[number];

export const DEFAULT_MAX_ITERATIONS = 2;

/* -------------------------------------------------------------------------- */
/* Public types                                                               */
/* -------------------------------------------------------------------------- */

export interface StagedPhaseOutcome {
  name: StagedPhaseName;
  /** 1-indexed; the Fix phase increments per retry, others are always 1. */
  iteration: number;
  status: "passed" | "failed" | "blocked";
  artifactPath?: string;
  notes?: string;
}

export interface StagedRunResult {
  missionId: string;
  shape: "single" | "team";
  phases: StagedPhaseOutcome[];
  fixIterations: number;
  status: "passed" | "failed" | "blocked";
  /** Final verifier result, if Verify ever ran. */
  verification: VerifyMissionLike | null;
  /** Set when shape === "team" and Execute fanned out workers. */
  teamRun: TeamRunResult | null;
}

export interface SinglePhaseInput {
  phase: StagedPhaseName;
  /** 1-indexed iteration number. >1 only for Fix retries. */
  iteration: number;
  missionId: string;
  /** Absolute path of the mission's directory under .harness/missions/. */
  missionDir: string;
  /** Best-effort access to previously-written phase artifacts. */
  priorArtifacts: PriorArtifacts;
}

export interface PriorArtifacts {
  plan?: string;
  prd?: string;
  runtimeFinal?: string;
  integrationReport?: string;
  verifyReport?: string;
  fixReports: string[];
}

export interface SinglePhaseOutput {
  /** Phase verdict. Plan/PRD usually `passed`; Execute may be `blocked`. */
  status: "passed" | "failed" | "blocked";
  /** Markdown / text content the phase produced. Persisted by the runner. */
  artifact: string;
  /** Free-form annotation surfaced in the phase outcome. */
  notes?: string;
}

export type SinglePhaseRunner = (input: SinglePhaseInput) => Promise<SinglePhaseOutput>;

/** Used by team shape — Plan / PRD / Fix run sequentially as the leader. */
export type TeamLeaderPhaseRunner = (input: SinglePhaseInput) => Promise<SinglePhaseOutput>;

export interface RunStagedOptions {
  /** Required for shape: single. */
  singlePhaseRunner?: SinglePhaseRunner;
  /** Required for shape: team (Plan/PRD/Fix). */
  teamLeaderRunner?: TeamLeaderPhaseRunner;
  /**
   * Used by Verify (both shapes). Returns a structured verifier outcome.
   * Defaults to a synthetic "blocked" result if undefined — callers MUST
   * wire this in production.
   */
  verifier?: (root: string, missionId: string) => Promise<VerifyMissionLike>;
  /** When shape: team, used to fan Execute across workers. */
  teamRunner?: (mission: TeamMission, root: string) => Promise<TeamRunResult>;
  /** Override mission.verification.max_iterations. */
  maxIterations?: number;
}

/** Schema-agnostic team subset; matches UH-71's expected shape. */
export interface StagedMission {
  id: string;
  shape?: "single" | "team";
  team?: TeamMission["team"];
  integration_report_path?: string;
  verification?: { max_iterations?: number };
}

/* -------------------------------------------------------------------------- */
/* Entry point                                                                */
/* -------------------------------------------------------------------------- */

export async function runStagedWorkflow(
  mission: StagedMission,
  root: string,
  options: RunStagedOptions,
): Promise<StagedRunResult> {
  assertSafeMissionId(mission.id);
  const shape: "single" | "team" = mission.shape === "team" ? "team" : "single";
  const maxIterations = resolveMaxIterations(mission, options);

  const missionDir = path.resolve(missionsDir(root), mission.id);
  await mkdir(missionDir, { recursive: true });

  const phases: StagedPhaseOutcome[] = [];
  const artifacts: PriorArtifacts = { fixReports: [] };

  // --- Plan -----------------------------------------------------------------
  const planOutcome = await runPlanOrPrd("Plan", "plan.md", mission, missionDir, artifacts, shape, options);
  phases.push(planOutcome);
  if (planOutcome.status !== "passed") {
    return finalize(mission.id, shape, phases, 0, null, null, planOutcome.status);
  }

  // --- PRD ------------------------------------------------------------------
  const prdOutcome = await runPlanOrPrd("PRD", "prd.md", mission, missionDir, artifacts, shape, options);
  phases.push(prdOutcome);
  if (prdOutcome.status !== "passed") {
    return finalize(mission.id, shape, phases, 0, null, null, prdOutcome.status);
  }

  // --- Execute --------------------------------------------------------------
  let teamRun: TeamRunResult | null = null;
  if (shape === "team") {
    if (!mission.team) throw new Error(`Mission ${mission.id} has shape: team but no team block`);
    if (!options.teamRunner) throw new Error(`Staged workflow for shape: team requires options.teamRunner`);
    const teamMission: TeamMission = { id: mission.id, team: mission.team, integration_report_path: mission.integration_report_path };
    try {
      teamRun = await options.teamRunner(teamMission, root);
      phases.push({
        name: "Execute",
        iteration: 1,
        status: teamRun.status === "passed" ? "passed" : teamRun.status === "blocked" ? "blocked" : "failed",
        artifactPath: teamRun.integrationReportPath,
        notes: `${teamRun.workers.length} worker(s); conflicts=${teamRun.hadConflicts ? "yes" : "no"}`,
      });
      // Stash integration-report content for downstream phases that want it.
      artifacts.integrationReport = await safeRead(teamRun.integrationReportPath);
    } catch (err) {
      phases.push({ name: "Execute", iteration: 1, status: "failed", notes: (err as Error).message });
      return finalize(mission.id, shape, phases, 0, teamRun, null, "failed");
    }
    if (teamRun.status !== "passed") {
      return finalize(mission.id, shape, phases, 0, teamRun, teamRun.verification, teamRun.status);
    }
  } else {
    const execOutcome = await runSinglePhase("Execute", 1, mission, missionDir, artifacts, options);
    phases.push(execOutcome);
    if (execOutcome.status !== "passed") {
      return finalize(mission.id, shape, phases, 0, null, null, execOutcome.status);
    }
  }

  // --- Verify → Fix loop ---------------------------------------------------
  let verification: VerifyMissionLike | null = null;
  let fixIterations = 0;
  for (let attempt = 1; attempt <= 1 + maxIterations; attempt += 1) {
    const verifyAt = shape === "team" && teamRun ? teamRun.plan.leader.worktreePath : root;
    const verifyOutcome = await runVerifyPhase(verifyAt, mission.id, missionDir, attempt, options, artifacts);
    phases.push(verifyOutcome.outcome);
    verification = verifyOutcome.verification;
    if (verifyOutcome.verification && verifyOutcome.verification.status === "passed") {
      return finalize(mission.id, shape, phases, fixIterations, teamRun, verification, "passed");
    }
    // Verify did not pass. If we've used our retries, stop.
    if (attempt > maxIterations) {
      const status = verifyOutcome.verification?.status === "failed" ? "failed" : "blocked";
      return finalize(mission.id, shape, phases, fixIterations, teamRun, verification, status);
    }
    // Otherwise run Fix and loop back to Verify.
    fixIterations += 1;
    const fixOutcome = await runFixPhase(mission, missionDir, fixIterations, artifacts, options, shape);
    phases.push(fixOutcome);
    if (fixOutcome.status !== "passed") {
      return finalize(mission.id, shape, phases, fixIterations, teamRun, verification, fixOutcome.status);
    }
  }
  // Defensive — loop above always returns.
  return finalize(mission.id, shape, phases, fixIterations, teamRun, verification, "blocked");
}

/* -------------------------------------------------------------------------- */
/* Phase runners                                                              */
/* -------------------------------------------------------------------------- */

async function runPlanOrPrd(
  name: "Plan" | "PRD",
  filename: "plan.md" | "prd.md",
  mission: StagedMission,
  missionDir: string,
  artifacts: PriorArtifacts,
  shape: "single" | "team",
  options: RunStagedOptions,
): Promise<StagedPhaseOutcome> {
  const runner = shape === "team" ? options.teamLeaderRunner : options.singlePhaseRunner;
  if (!runner) {
    return { name, iteration: 1, status: "blocked", notes: `no ${shape === "team" ? "teamLeaderRunner" : "singlePhaseRunner"} configured` };
  }
  try {
    const out = await runner({ phase: name, iteration: 1, missionId: mission.id, missionDir, priorArtifacts: artifacts });
    const artifactPath = path.join(missionDir, filename);
    await writeFile(artifactPath, out.artifact, "utf-8");
    if (name === "Plan") artifacts.plan = out.artifact;
    else artifacts.prd = out.artifact;
    return { name, iteration: 1, status: out.status, artifactPath, notes: out.notes };
  } catch (err) {
    return { name, iteration: 1, status: "failed", notes: (err as Error).message };
  }
}

async function runSinglePhase(
  name: StagedPhaseName,
  iteration: number,
  mission: StagedMission,
  missionDir: string,
  artifacts: PriorArtifacts,
  options: RunStagedOptions,
): Promise<StagedPhaseOutcome> {
  const runner = options.singlePhaseRunner;
  if (!runner) {
    return { name, iteration, status: "blocked", notes: "no singlePhaseRunner configured" };
  }
  try {
    const out = await runner({ phase: name, iteration, missionId: mission.id, missionDir, priorArtifacts: artifacts });
    let artifactPath: string | undefined;
    if (name === "Execute") {
      artifactPath = path.join(missionDir, "runtime-final.txt");
      await writeFile(artifactPath, out.artifact, "utf-8");
      artifacts.runtimeFinal = out.artifact;
    }
    return { name, iteration, status: out.status, artifactPath, notes: out.notes };
  } catch (err) {
    return { name, iteration, status: "failed", notes: (err as Error).message };
  }
}

async function runVerifyPhase(
  effectiveRoot: string,
  missionId: string,
  missionDir: string,
  attempt: number,
  options: RunStagedOptions,
  artifacts: PriorArtifacts,
): Promise<{ outcome: StagedPhaseOutcome; verification: VerifyMissionLike | null }> {
  if (!options.verifier) {
    return {
      outcome: { name: "Verify", iteration: attempt, status: "blocked", notes: "no verifier configured" },
      verification: null,
    };
  }
  try {
    const v = await options.verifier(effectiveRoot, missionId);
    const reportPath = path.join(missionDir, "verify-report.md");
    const report = renderVerifyReport(v, attempt);
    await writeFile(reportPath, report, "utf-8");
    artifacts.verifyReport = report;
    const status: StagedPhaseOutcome["status"] =
      v.status === "passed" ? "passed" : v.status === "failed" ? "failed" : "blocked";
    return {
      outcome: { name: "Verify", iteration: attempt, status, artifactPath: reportPath, notes: `verifier=${v.status}` },
      verification: v,
    };
  } catch (err) {
    return {
      outcome: { name: "Verify", iteration: attempt, status: "failed", notes: (err as Error).message },
      verification: null,
    };
  }
}

async function runFixPhase(
  mission: StagedMission,
  missionDir: string,
  iteration: number,
  artifacts: PriorArtifacts,
  options: RunStagedOptions,
  shape: "single" | "team",
): Promise<StagedPhaseOutcome> {
  const runner = shape === "team" ? options.teamLeaderRunner : options.singlePhaseRunner;
  if (!runner) {
    return { name: "Fix", iteration, status: "blocked", notes: `no ${shape === "team" ? "teamLeaderRunner" : "singlePhaseRunner"} configured` };
  }
  try {
    const out = await runner({ phase: "Fix", iteration, missionId: mission.id, missionDir, priorArtifacts: artifacts });
    const reportPath = path.join(missionDir, "fix-report.md");
    // Append iteration body so retries don't clobber each other.
    const body = `# Fix iteration ${iteration}\n\n${out.artifact.trim()}\n`;
    const existing = (await safeRead(reportPath)) ?? "";
    await writeFile(reportPath, existing ? `${existing}\n${body}` : body, "utf-8");
    artifacts.fixReports.push(out.artifact);
    return { name: "Fix", iteration, status: out.status, artifactPath: reportPath, notes: out.notes };
  } catch (err) {
    return { name: "Fix", iteration, status: "failed", notes: (err as Error).message };
  }
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function resolveMaxIterations(mission: StagedMission, options: RunStagedOptions): number {
  if (options.maxIterations !== undefined) return options.maxIterations;
  if (mission.verification && typeof mission.verification.max_iterations === "number") {
    return mission.verification.max_iterations;
  }
  return DEFAULT_MAX_ITERATIONS;
}

function renderVerifyReport(v: VerifyMissionLike, attempt: number): string {
  return [
    `# Verify report (attempt ${attempt})`,
    "",
    `- Status: ${v.status}`,
    `- Checks: ${v.checks_passed} passed / ${v.checks_failed} failed / ${v.checks_blocked} blocked (total ${v.checks_total})`,
    `- Acceptance: ${v.acceptance_passed} passed / ${v.acceptance_failed_block} block-failed / ${v.acceptance_warn_failed} warn-failed / ${v.acceptance_blocked} blocked (total ${v.acceptance_total})`,
    "",
  ].join("\n");
}

async function safeRead(p: string): Promise<string | undefined> {
  if (!(await fileExists(p))) return undefined;
  try {
    return await readFile(p, "utf-8");
  } catch {
    return undefined;
  }
}

function finalize(
  missionId: string,
  shape: "single" | "team",
  phases: StagedPhaseOutcome[],
  fixIterations: number,
  teamRun: TeamRunResult | null,
  verification: VerifyMissionLike | null,
  status: StagedRunResult["status"],
): StagedRunResult {
  return { missionId, shape, phases, fixIterations, status, verification, teamRun };
}

/** Surface used by `tests/workflow-staged.test.ts` so it can rebuild expected paths. */
export function stagedArtifactPath(root: string, missionId: string, name: "plan.md" | "prd.md" | "runtime-final.txt" | "verify-report.md" | "fix-report.md"): string {
  return path.join(missionsDir(root), missionId, name);
}

/** Re-export for downstream test fixtures. */
export { runTeamMission };
