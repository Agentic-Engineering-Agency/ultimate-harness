#!/usr/bin/env node
import { prepareIndependentReview, collectIndependentReview } from "./harness/independent-review.js";
import { Command } from "commander";
import { z } from "zod";
import type { RuntimeLimits } from "./schema/runtime-control.js";
import type { MissionDocument } from "./schema/mission.js";
import { resolveRuntimeRecoveryPolicy, runWithRuntimeRecovery } from "./harness/runtime-recovery.js";
import { initializeHarness } from "./harness/init.js";
import { getStatus } from "./harness/status.js";
import { assertSafeMissionId, createMission, isPathWithin } from "./harness/mission.js";
import { parseIssueRef, parseRequiredCheck, proposeMission, proposeMissionFromSpec, type ProposeIssueRef, type ProposeRequiredCheck } from "./harness/propose.js";
import { DEFAULT_VERIFY_COMMAND_TIMEOUT_MS, verifyMission } from "./harness/verify.js";
import { promoteMission, type PromoteDecision } from "./harness/promote.js";
import { validateFile, validateRootProject, validateAllWorkflows, validateAllMissions } from "./harness/validate.js";
import { resolveRoot, missionDir } from "./harness/paths.js";
import { checkHermes, dryRunHermes, runHermes } from "./adapters/hermes.js";
import { dryRunCodex, runCodex } from "./adapters/codex.js";
import { dryRunOhMyPi, runOhMyPi } from "./adapters/oh-my-pi.js";
import { dryRunCommandCode, runCommandCode } from "./adapters/command-code.js";
import { dryRunClaudeCode, runClaudeCode } from "./adapters/claude-code.js";
import { dryRunHermesProxy, runHermesProxy } from "./adapters/hermes-proxy.js";
import { dryRunOpenRouter, runOpenRouter } from "./adapters/openrouter.js";
import { dryRunAnthropic, runAnthropic } from "./adapters/anthropic.js";
import { dryRunPi, runPi } from "./adapters/pi.js";
import { dryRunAcp, runAcp } from "./adapters/acp.js";
import { runtimeRegistry } from "./harness/registry.js";
import { enforceCapabilities, formatCapabilityBypassLine, loadMissionFile } from "./harness/capabilities.js";
import { assertRuntimeRequirements } from "./harness/runtime-requirements.js";
import { assertFleetAdmission, loadFleetPolicy, authorizedFleetAdapters } from "./harness/fleet-policy.js";
import { chooseAdapter, chooseSemanticRoute, formatAutoRouteExplain, formatSemanticRouteSummary, type SemanticRouteDecision } from "./harness/auto-route.js";
import { CAPABILITIES, listAdapterIds, type AdapterId } from "./adapters/capabilities/index.js";
import { forecastCost } from "./harness/cost-forecast.js";
import { probeHermesProxyCapabilities } from "./adapters/capabilities/hermes-proxy-probe.js";
import { COST_CLASSES } from "./schema/adapter-capabilities.js";
import { resolveSandboxMissionRoot, type SandboxMissionRoute } from "./harness/sandbox.js";
import { finalizeRuntimeCancelledRun } from "./harness/runtime-events.js";
import { cancelLocalMissionRun, cancelMissionRunViaPlugin, MissionCancelError } from "./harness/mission-cancel.js";
import { parseRuntimeConfigOverridesJson } from "./harness/runtime-config-overrides.js";
import { adoptSessionTemplate, type SessionTemplateAdoption } from "./harness/session-template-adoption.js";
import { writeArtifactFile } from "./adapters/_artifact-context.js";
import { parseScaffoldLang, scaffoldTestsFromSpec } from "./harness/test-scaffold.js";
import { assertValidRunId, generateRunId } from "./harness/run-id.js";
import { parse as parseYaml } from "yaml";
import { spawn, spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { readFile as readFileAsync, writeFile as writeFileAsync, readdir, mkdir } from "node:fs/promises";
import { exitCodeForRun } from "./harness/exit-codes.js";
import { indexRuns, summarizeRuns, paretoFrontier } from "./harness/experience-store.js";
import { BEST_OF_N_CAP, MIN_ARM_RUNS, attemptsToMatch, bestOfN, compareArms } from "./harness/run-comparison.js";
import { exportRunToOtlp, type OtlpTraceExport } from "./harness/otel-export.js";
import { getSpecTemplate, listSpecTemplates } from "./harness/spec-templates.js";
import { judgeSpecAdherence, oneShotOpenAI } from "./harness/spec-judge.js";
import { installTelemetryHooks } from "./harness/telemetry.js";
import { projectDeliveryObservatory } from "./harness/delivery-observatory/project.js";
import { acceptanceStatus, rebindAcceptanceEvidence, runAcceptance, writeAcceptanceReport } from "./harness/acceptance.js";

import {
  createSandbox,
  discardSandbox,
  getSandboxStatus,
  listSandboxes,
  repairSandboxes,
} from "./harness/sandbox.js";
import { addAdapter, listAdapterTemplates } from "./harness/adapter-add.js";
import { addSkill, checkSkill, listSkills } from "./harness/skill.js";
import { recordManualVerdict } from "./harness/verdict.js";
import { SandboxesIndexSchema, type VerdictValue } from "./schema/artifacts.js";
import { serveMcpStdio } from "./harness/mcp-server.js";

function readPackageVersion(): string {
  try {
    const packageJsonPath = fileURLToPath(new URL("../package.json", import.meta.url));
    const parsed = JSON.parse(readFileSync(packageJsonPath, "utf-8")) as { version?: unknown };
    return typeof parsed.version === "string" ? parsed.version : "0.0.0";
  } catch {
    return "0.0.0";
  }
}

const VERSION = readPackageVersion();

/**
 * Runtime dispatch table for `uh mission dry-run` and `uh mission run`.
 *
 * Adapters live in `src/adapters/<runtime>.ts` and self-register their
 * availability checkers with `runtimeRegistry`. Mission execution is dispatched
 * here through a uniform `{ dryRun, run }` shape so adding a runtime is one
 * map entry instead of a new branch in two long if/else ladders.
 *
 * `surfaceBlocked: true` means the CLI exits 1 with `[BLOCKED]` when the
 * adapter's `runtime-result.status === "blocked"`. Hermes opts out because
 * historical missions tolerate blocked results without a CLI-level failure;
 * Codex/oh-my-pi opt in because their `blocked` paths (quota, missing final
 * message) MUST surface as non-zero exits for verification gates upstream.
 */
type RuntimeRunResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
  result?: { status?: string; errors?: string[] };
  runId?: string;
};
type RuntimeDryRunResult = {
  command: string;
  args: string[];
  prompt: string;
  /** How the runtime receives the prompt: `stdin` for command-code, or the file path for oh-my-pi. */
  promptSource?: string;
  promptPath?: string;
  worktree: boolean;
  session_id_passthrough: boolean;
  errors: string[];
};
interface RuntimeRunOptions {
  /** UH-81 — CLI-time runtime_config overrides spread on top of the mission's own overrides. */
  extraRuntimeConfigOverrides?: Record<string, unknown>;
  /** Canonical host root for OMP artifacts when execution is sandbox-routed. */
  artifactRoot?: string;
  /** UH-82 — explicit per-run id. */
  runId?: string;
  /** Signal used by the CLI to stop an owned runtime process tree. */
  cancellationSignal?: AbortSignal;
  limits?: RuntimeLimits;
}
/** UH-81 — the merged `--runtime-config-overrides` a dry-run passes into a planner. */
interface RuntimeDryRunOptions {
  extraRuntimeConfigOverrides?: Record<string, unknown>;
}
interface RuntimeWiring {
  dryRun(root: string, missionPath: string, options?: RuntimeDryRunOptions): Promise<RuntimeDryRunResult>;
  run(root: string, missionPath: string, options?: RuntimeRunOptions): Promise<RuntimeRunResult>;
  surfaceBlocked: boolean;
}
const RUNTIME_WIRINGS: Record<string, RuntimeWiring> = {
  hermes: { dryRun: (root, missionPath, opts) => dryRunHermes(root, missionPath, opts), run: (root, missionPath, opts) => runHermes(root, missionPath, opts), surfaceBlocked: false },
  codex: { dryRun: (root, missionPath, opts) => dryRunCodex(root, missionPath, opts), run: (root, missionPath, opts) => runCodex(root, missionPath, opts), surfaceBlocked: true },
  "oh-my-pi": { dryRun: (root, missionPath, opts) => dryRunOhMyPi(root, missionPath, opts), run: (root, missionPath, opts) => runOhMyPi(root, missionPath, opts), surfaceBlocked: true },
  "command-code": { dryRun: (root, missionPath, opts) => dryRunCommandCode(root, missionPath, opts), run: (root, missionPath, opts) => runCommandCode(root, missionPath, opts), surfaceBlocked: true },
  "hermes-proxy": { dryRun: (root, missionPath, opts) => dryRunHermesProxy(root, missionPath, opts), run: (root, missionPath, opts) => runHermesProxy(root, missionPath, opts), surfaceBlocked: true },
  openrouter: { dryRun: (root, missionPath, opts) => dryRunOpenRouter(root, missionPath, opts), run: (root, missionPath, opts) => runOpenRouter(root, missionPath, opts), surfaceBlocked: true },
  anthropic: { dryRun: (root, missionPath, opts) => dryRunAnthropic(root, missionPath, opts), run: (root, missionPath, opts) => runAnthropic(root, missionPath, opts), surfaceBlocked: true },
  pi: { dryRun: (root, missionPath, opts) => dryRunPi(root, missionPath, opts), run: (root, missionPath, opts) => runPi(root, missionPath, opts), surfaceBlocked: true },
  "claude-code": { dryRun: (root, missionPath, opts) => dryRunClaudeCode(root, missionPath, opts), run: (root, missionPath, opts) => runClaudeCode(root, missionPath, opts), surfaceBlocked: true },
  acp: { dryRun: (root, missionPath, opts) => dryRunAcp(root, missionPath, opts), run: (root, missionPath, opts) => runAcp(root, missionPath, opts), surfaceBlocked: true },
};


interface PreflightOptions {
  force: boolean;
  strict: boolean;
}

/** Preflight after runtime is chosen (`--runtime` or post `--auto` routing). */
async function enforceRuntimePreflight(
  root: string,
  missionPath: string,
  runtime: string,
  { force, strict }: PreflightOptions,
): Promise<void> {
  if (force) {
    // --force bypasses BOTH the capability check and runtime_requirements.
    const mission = await loadMissionFile(missionPath);
    console.error(formatCapabilityBypassLine(mission.id, runtime));
    return;
  }
  await enforceCapabilities(root, missionPath, runtime, strict ? "error" : "warn");
  await assertRuntimeRequirements(missionPath, runtime);
}

/**
 * UH-101 semantic routing seam. Combines deterministic eligibility with a
 * bounded TypeSafe System One recommendation over installed adapters, applying
 * the project fleet as a Level 0 prefilter. Returns the composed decision so the
 * caller can print it and act on `adapter` (null means no route was authorized).
 */
async function evaluateSemanticRoute(options: {
  root: string;
  missionPath: string;
  force: boolean;
  auto: boolean;
  explain: boolean;
  runId?: string;
}): Promise<SemanticRouteDecision> {
  const installed = (await runtimeRegistry.list(options.root))
    .map((entry) => entry.id)
    .filter((id): id is AdapterId => id in CAPABILITIES);
  const mission = await loadMissionFile(options.missionPath);
  const fleetAdapters = authorizedFleetAdapters(await loadFleetPolicy(options.root));
  const decision = await chooseSemanticRoute({
    mission,
    available: installed,
    force: options.force,
    auto: options.auto,
    ...(fleetAdapters ? { fleetAdapters } : {}),
    missionDir: missionDir(options.root, mission.id),
    missionId: mission.id,
    ...(options.runId ? { runId: options.runId } : {}),
  });
  if (options.explain) {
    console.log(formatAutoRouteExplain({ adapter: decision.adapter, reason: decision.reason, candidates: decision.candidates }));
    console.log("");
  }
  console.log(formatSemanticRouteSummary(decision));
  return decision;
}

/**
 * The `Sandbox:` line that `mission run` and `mission dry-run` print, so the
 * routing decision is always visible. `useSandbox` is whether sandbox routing
 * was requested (i.e. `--no-sandbox` was absent).
 */
function sandboxRouteLine(routing: SandboxMissionRoute, useSandbox: boolean): string {
  if (routing.sandbox) {
    return `Sandbox: ${routing.sandbox.id} (${routing.sandbox.path})`;
  }
  return useSandbox
    ? "Sandbox: none (project root)"
    : "Sandbox: none (project root, --no-sandbox)";
}

async function installRuntimeCancelledEventHandler(
  artifactRoot: string,
  missionPath: string,
  runtime: string,
  runId: string,
  cancellationController: AbortController,
): Promise<() => void> {
  const mission = await loadMissionFile(missionPath);
  let handled = false;
  const onSignal = (signal: "SIGINT" | "SIGTERM"): void => {
    if (handled) return;
    handled = true;
    cancellationController.abort();
    finalizeRuntimeCancelledRun({
      root: artifactRoot,
      missionId: mission.id,
      runtime,
      signal,
      runId,
    });
    process.exit(143);
  };
  const onSigint = (): void => onSignal("SIGINT");
  const onSigterm = (): void => onSignal("SIGTERM");
  process.once("SIGINT", onSigint);
  process.once("SIGTERM", onSigterm);
  return () => {
    process.removeListener("SIGINT", onSigint);
    process.removeListener("SIGTERM", onSigterm);
  };
}

const program = new Command();

program
  .name("uh")
  .description("Ultimate Harness CLI")
  .version(VERSION);

installTelemetryHooks(program, VERSION);

// uh init
program
  .command("init")
  .description("Initialize a .harness project in the current or specified directory")
  .option("--root <path>", "Root directory to initialize (default: cwd)")
  .option("--force", "Overwrite existing .harness/project.yaml")
  .action(async (opts: { root?: string; force?: boolean }) => {
    const root = resolveRoot(opts.root);
    const result = await initializeHarness(root, opts.force ?? false);
    if (result.existed.length > 0) {
      console.log("Ultimate Harness project already initialized.");
      console.log("Use --force to reinitialize.");
      return;
    }
    console.log(`Initialized Ultimate Harness project in ${root}`);
    console.log(`Created ${result.created.length} directories and files.`);
  });

// uh validate
program
  .command("validate")
  .description("Validate a harness YAML artifact (and optionally drift-detect under --repair / --json)")
  .argument("[file]", "Path to YAML file (default: .harness/project.yaml)")
  .option("--root <path>", "Root directory (default: cwd)")
  .option("--all-workflows", "Validate all workflow profiles")
  .option("--all-missions", "Validate all mission files")
  .option("--repair", "Run drift detection with auto-repair (idempotent)")
  .option("--strict-spec", "Run drift detection; spec-stale issues are errors (default: warn)")
  .option("--json", "Emit drift detection output as JSON instead of human text")
  .option("--judge", "Grade spec adherence with an LLM (requires --spec + a hermes-proxy runtime)")
  .option("--spec <path>", "Spec file to judge (with --judge)")
  .option("--base <ref>", "Base ref for the judge diff (default: dev)")
  .action(async (file: string | undefined, opts: { root?: string; allWorkflows?: boolean; allMissions?: boolean; repair?: boolean; strictSpec?: boolean; json?: boolean; judge?: boolean; spec?: string; base?: string }) => {
    const root = resolveRoot(opts.root);
    if (opts.judge) {
      try {
        if (!opts.spec) {
          console.error("[FAIL] --judge requires --spec <path>");
          process.exit(1);
          return;
        }
        const { loadSpecFile } = await import("./harness/spec-loader.js");
        const spec = await loadSpecFile(opts.spec);
        const base = opts.base || "dev";
        const { execFile } = await import("node:child_process");
        const { promisify } = await import("node:util");
        const execFileP = promisify(execFile);
        let diff = "";
        try {
          const { stdout } = await execFileP("git", ["diff", "--no-color", `${base}...HEAD`], {
            cwd: root,
            maxBuffer: 10 * 1024 * 1024,
          });
          diff = stdout;
        } catch {
          diff = "";
        }
        const entry = (await runtimeRegistry.list(root)).find((e) => e.id === "hermes-proxy");
        const rc = (entry?.document.config as Record<string, unknown> | undefined)?.runtime_config as
          | Record<string, unknown>
          | undefined;
        const endpoint = typeof rc?.endpoint === "string" ? rc.endpoint : undefined;
        const model = typeof rc?.model === "string" ? rc.model : undefined;
        if (!endpoint || !model) {
          console.error("[FAIL] --judge requires a configured hermes-proxy runtime (runtime_config.endpoint + model)");
          process.exit(1);
          return;
        }
        const verdict = await judgeSpecAdherence({
          spec,
          diff,
          runner: (prompt) => oneShotOpenAI({ endpoint, model, prompt }),
        });
        if (opts.json) {
          console.log(JSON.stringify(verdict, null, 2));
        } else {
          console.log(`Spec adherence (${spec.frontMatter.id}): ${verdict.adherence.toUpperCase()}`);
          if (verdict.missing_ac.length > 0) {
            console.log("Missing acceptance criteria:");
            for (const m of verdict.missing_ac) console.log(`  - ${m}`);
          }
          if (verdict.evidence) console.log(`Evidence: ${verdict.evidence}`);
        }
        process.exit(verdict.adherence === "fail" ? 1 : 0);
        return;
      } catch (err) {
        console.error(`[FAIL] spec judge error: ${(err as Error).message}`);
        process.exit(1);
        return;
      }
    }
    if (opts.json || opts.repair || opts.strictSpec) {
      const { runDrift, groupByKind, DRIFT_KINDS } = await import("./harness/validate/drift/registry.js");
      const outcome = await runDrift(root, {
        repair: opts.repair === true,
        strictSpec: opts.strictSpec === true,
      });
      if (opts.json) {
        const grouped = groupByKind(outcome.issues);
        console.log(JSON.stringify({
          schema_version: "uh.validate-drift.v0",
          repair: opts.repair === true,
          cycles: outcome.cycles,
          cap_reached: outcome.capReached,
          kinds: DRIFT_KINDS.map((k) => ({
            kind: k.kind,
            can_repair: k.canRepair,
            issues: grouped[k.kind],
          })),
          repairs: outcome.repairs.map((r) => ({
            kind: r.issue.kind,
            outcome: r.outcome,
            reason: r.reason,
            target: r.issue.target,
          })),
        }, null, 2));
      } else {
        for (const issue of outcome.issues) {
          console.log(`[${issue.severity.toUpperCase()}] ${issue.kind}: ${issue.message}`);
        }
        if (outcome.issues.length === 0) {
          console.log(`[OK] no drift detected`);
        }
        if (outcome.capReached) {
          console.log(`[WARN] drift remains after ${outcome.cycles} repair cycles`);
        }
      }
      process.exit(outcome.issues.some((i) => i.severity === "error") ? 1 : 0);
      return;
    }
    if (opts.allWorkflows) {
      const results = await validateAllWorkflows(root);
      for (const r of results) {
        printValidationResult(r);
      }
      process.exit(results.some((r) => !r.valid) ? 1 : 0);
      return;
    }
    if (opts.allMissions) {
      const results = await validateAllMissions(root);
      for (const r of results) {
        printValidationResult(r);
      }
      process.exit(results.some((r) => !r.valid) ? 1 : 0);
      return;
    }
    const filePath = file ?? `${root}/.harness/project.yaml`;
    const result = await validateFile(filePath);
    printValidationResult(result);
    process.exit(result.valid ? 0 : 1);
  });

// uh status
program
  .command("status")
  .description("Report the current state of the harness project (use --json for the LLM-less query mode)")
  .option("--root <path>", "Root directory (default: cwd)")
  .option("--cwd <path>", "Override the working directory used for resolving the project root")
  .option("--json", "Emit the UH-78 status JSON document instead of human text")
  .action(async (opts: { root?: string; cwd?: string; json?: boolean }) => {
    const root = resolveRoot(opts.root ?? opts.cwd);
    if (opts.json) {
      try {
        const { getStatusJson } = await import("./harness/status-json.js");
        const doc = await getStatusJson(root);
        console.log(JSON.stringify(doc, null, 2));
      } catch (err) {
        console.error((err as Error).message);
        process.exit(1);
      }
      return;
    }
    try {
      const s = await getStatus(root);
      console.log(`Ultimate Harness project: ${s.name}`);
      console.log(`Schema version: ${s.schema_version}`);
      console.log(`Adapters configured: ${s.adapters.length}`);
      for (const a of s.adapters) {
        console.log(`  - ${a.name} (${a.status})`);
      }
      console.log(`Workflow profiles: ${s.workflow_profiles_count}`);
      console.log(`Active missions: ${s.active_missions_count}`);
      console.log(`Skills indexed: ${s.skills_indexed_count}`);
      console.log(`Sandboxes: ${s.sandboxes.total}`);
      for (const [status, count] of Object.entries(s.sandboxes.by_status)) {
        console.log(`  - ${status}: ${count}`);
      }
      console.log(`Verified missions: ${s.verified_missions_count}`);
      console.log(`Promoted missions: ${s.promoted_missions_count}`);
      console.log(`Recent audit events: ${s.recent_audit_events}`);
      console.log(`Acceptance evidence: proven ${s.acceptance.proven}, stale ${s.acceptance.stale}, failed ${s.acceptance.failed}, unproven ${s.acceptance.unproven}`);
      const { liveRunCounts } = await import("./harness/live-runs.js");
      const live = await liveRunCounts(root);
      console.log(`Live runs: ${live.total} (orphaned: ${live.orphaned})`);
    } catch (err) {
      console.error((err as Error).message);
      process.exit(1);
    }
  });

// uh ps — every live run discoverable from the project root.
program
  .command("ps")
  .description("List live runs found from the project root (exit 3 when a run is orphaned)")
  .option("--root <path>", "Root directory (default: cwd)")
  .option("--json", "Emit discovered runs as JSON")
  .option("--all", "Include recent settled runs (kept for 24h)")
  .action(async (opts: { root?: string; json?: boolean; all?: boolean }) => {
    const root = resolveRoot(opts.root);
    try {
      const { listLiveRuns, formatLiveRuns, liveRunsExitCode } = await import("./harness/live-runs.js");
      const { records, orphaned } = await listLiveRuns(root, { includeSettled: opts.all === true });
      if (opts.json) {
        console.log(JSON.stringify({
          schema_version: "uh.ps.v0",
          generated_at: new Date().toISOString(),
          orphaned,
          runs: records,
        }, null, 2));
      } else {
        console.log(formatLiveRuns(records));
      }
      process.exit(liveRunsExitCode(records));
    } catch (err) {
      console.error((err as Error).message);
      process.exit(1);
    }
  });

// uh kill — stop any run from the project root and prove it is dead.
program
  .command("kill")
  .description("Stop live runs by id (or unique prefix), role, mission, team, --all, or --orphans")
  .argument("[run-id]", "Run id, or a unique prefix of one")
  .option("--role <role>", "Every team worker with this role")
  .option("--mission <id>", "Every run of this mission, including its team workers")
  .option("--team <id>", "A team: its workers first, then the team controller")
  .option("--all", "Every live run discovered from the project root")
  .option("--orphans", "Every run whose controller pid is gone")
  .option("--force", "Skip the cancellation request and terminate the owned process tree immediately")
  .option("--wait-ms <ms>", "How long to wait for a graceful exit before forcing (default: 10000)")
  .option("--root <path>", "Root directory (default: cwd)")
  .option("--json", "Emit the kill report as JSON")
  .action(async (runId: string | undefined, opts: {
    role?: string; mission?: string; team?: string; all?: boolean; orphans?: boolean;
    force?: boolean; waitMs?: string; root?: string; json?: boolean;
  }) => {
    const root = resolveRoot(opts.root);
    const waitMs = opts.waitMs === undefined ? undefined : Number.parseInt(opts.waitMs, 10);
    if (waitMs !== undefined && (!Number.isFinite(waitMs) || waitMs < 0)) {
      console.error(`[FAIL] --wait-ms must be a non-negative integer of milliseconds, got: ${opts.waitMs}`);
      process.exit(1);
      return;
    }
    try {
      const { killRuns, formatKillReport } = await import("./harness/kill.js");
      const report = await killRuns(root, {
        ...(runId !== undefined ? { runId } : {}),
        ...(opts.role !== undefined ? { role: opts.role } : {}),
        ...(opts.mission !== undefined ? { missionId: opts.mission } : {}),
        ...(opts.team !== undefined ? { teamId: opts.team } : {}),
        ...(opts.all === true ? { all: true } : {}),
        ...(opts.orphans === true ? { orphans: true } : {}),
        ...(opts.force === true ? { force: true } : {}),
        ...(waitMs !== undefined ? { waitMs } : {}),
      });
      if (opts.json) console.log(JSON.stringify(report, null, 2));
      else console.log(formatKillReport(report));
      process.exit(report.exit_code);
    } catch (err) {
      console.error(`[FAIL] kill error:`);
      console.error(`  error: ${(err as Error).message}`);
      process.exit(1);
    }
  });

/** One resumed attempt for `uh resume` / `uh steer`, wired to the live CLI. */
interface OperatorResumeRequest {
  artifactRoot: string;
  /** Project root that owns `.harness/adapters`; a team worker's scope has none. */
  adapterRoot: string;
  missionId: string;
  missionPath: string;
  runtime: string;
  sourceRunId: string;
  runId: string;
  recoveryNotes: string;
  report: boolean;
}

async function runOperatorResumedAttempt(request: OperatorResumeRequest): Promise<{ runId?: string; result?: { status?: string } }> {
  const wiring = RUNTIME_WIRINGS[request.runtime];
  if (!wiring) throw new Error(`Unknown runtime: ${request.runtime}`);
  // The adapter manifest, workflow and sandbox binding all live at the project
  // root; a team worker's artifact scope is nested below it and holds neither.
  const routing = await resolveSandboxMissionRoot(request.adapterRoot, request.missionPath, true);
  if (routing.error) throw new Error(routing.error);
  const recovery = await resolveRuntimeRecoveryPolicy(routing.effectiveRoot, routing.missionPath, request.runtime, {});
  return runWithRuntimeRecovery({
    root: request.artifactRoot,
    missionId: request.missionId,
    runtime: request.runtime,
    runId: request.runId,
    recovery: recovery.recovery,
    extraRuntimeConfigOverrides: { resume_from_run: request.sourceRunId, recovery_notes: request.recoveryNotes },
    // The operator's own resume is authorized outside the automatic budget.
    priorResumeOrigins: ["operator"],
    run: async (attempt) => {
      const res = await wiring.run(routing.effectiveRoot, routing.missionPath, { ...attempt, artifactRoot: request.artifactRoot });
      return { ...res, runId: attempt.runId };
    },
  });
}

// uh wait — block until matched runs settle, so orchestrators do not poll `uh ps`.
program
  .command("wait")
  .description("Block until a run (or a mission's or team's runs) settles or is orphaned (exit 0/1/3/4; 2 when nothing matches)")
  .argument("[run-id]", "Run id, or a unique prefix of one")
  .option("--mission <id>", "Every live run of this mission, including its team workers")
  .option("--team <id>", "Every live run of this team")
  .option("--timeout-ms <ms>", "Give up after this many milliseconds (default: 1800000)")
  .option("--root <path>", "Root directory (default: cwd)")
  .option("--json", "Emit the wait report as JSON")
  .action(async (runId: string | undefined, opts: {
    mission?: string; team?: string; timeoutMs?: string; root?: string; json?: boolean;
  }) => {
    const root = resolveRoot(opts.root);
    const timeoutMs = opts.timeoutMs === undefined ? undefined : Number.parseInt(opts.timeoutMs, 10);
    if (opts.timeoutMs !== undefined && (timeoutMs === undefined || !Number.isFinite(timeoutMs) || timeoutMs < 0)) {
      console.error(`[FAIL] --timeout-ms must be a non-negative integer of milliseconds, got: ${opts.timeoutMs}`);
      process.exit(1);
      return;
    }
    try {
      const { waitForRuns, formatWaitReport } = await import("./harness/wait.js");
      const report = await waitForRuns(root, {
        ...(runId !== undefined ? { runId } : {}),
        ...(opts.mission !== undefined ? { missionId: opts.mission } : {}),
        ...(opts.team !== undefined ? { teamId: opts.team } : {}),
        ...(timeoutMs !== undefined ? { timeoutMs } : {}),
      });
      if (opts.json) console.log(JSON.stringify(report, null, 2));
      else console.log(formatWaitReport(report));
      process.exit(report.exit_code);
    } catch (err) {
      const code = (err as { code?: string }).code;
      console.error(`[FAIL] wait error:`);
      console.error(`  error: ${(err as Error).message}`);
      process.exit(code === "no_target" || code === "unknown_target" || code === "ambiguous_target" ? 2 : 1);
    }
  });

// uh resume — continue a settled run's native session as a new run.
program
  .command("resume")
  .description("Resume a settled run's native session as a new run for the same mission")
  .argument("<run-id>", "Run id, or a unique prefix of one")
  .option("--notes <text>", "Text injected as the first instruction of the resumed turn")
  .option("--root <path>", "Root directory (default: cwd)")
  .option("--json", "Emit the resume outcome as JSON")
  .action(async (runId: string, opts: { notes?: string; root?: string; json?: boolean }) => {
    const root = resolveRoot(opts.root);
    try {
      const { resumeRun } = await import("./harness/steer.js");
      const result = await resumeRun(root, runId, opts.notes !== undefined ? { notes: opts.notes } : {},
        { run: runOperatorResumedAttempt, cancel: (cancelRoot, missionId, id) => cancelLocalMissionRun(cancelRoot, missionId, id) });
      if (opts.json) console.log(JSON.stringify(result, null, 2));
      else console.log(`Resumed ${result.sourceRunId} as ${result.runId}`);
    } catch (err) {
      console.error(`[FAIL] resume error:`);
      console.error(`  error: ${(err as Error).message}`);
      process.exit(1);
    }
  });

// uh steer — message a run; its owning controller stops and resumes it.
program
  .command("steer")
  .description("Message a run: its controller stops the attempt (steered) and resumes the session")
  .argument("<run-id>", "Run id, or a unique prefix of one")
  .argument("<message>", "Message injected as the first instruction of the resumed turn")
  .option("--report", "Ask the worker to write a status report before continuing")
  .option("--root <path>", "Root directory (default: cwd)")
  .option("--json", "Emit the steer outcome as JSON")
  .action(async (runId: string, message: string, opts: { report?: boolean; root?: string; json?: boolean }) => {
    const root = resolveRoot(opts.root);
    try {
      const { steerRun } = await import("./harness/steer.js");
      const result = await steerRun(root, runId, message, { report: opts.report === true },
        { run: runOperatorResumedAttempt, cancel: (cancelRoot, missionId, id) => cancelLocalMissionRun(cancelRoot, missionId, id) });
      if (opts.json) console.log(JSON.stringify(result, null, 2));
      else if (result.status === "not_applied") console.log(`Steer not applied to ${result.sourceRunId}: ${result.reason}`);
      else if (result.mode === "controller") console.log(`Steered ${result.sourceRunId}; its controller will resume the session`);
      else console.log(`Steered ${result.sourceRunId} into ${result.runId}`);
    } catch (err) {
      console.error(`[FAIL] steer error:`);
      console.error(`  error: ${(err as Error).message}`);
      process.exit(1);
    }
  });

// uh report — an instant, model-free status report of any run, from disk only.
program
  .command("report")
  .description("Report what a run is doing right now from disk, without a model")
  .argument("<run-id>", "Run id, or a unique prefix of one")
  .option("--root <path>", "Root directory (default: cwd)")
  .option("--json", "Emit the report as JSON")
  .option("--last <n>", "How many recent tool calls to project (default: 10)")
  .option("--full", "Read the whole events.ndjson instead of its last 256 KB")
  .action(async (runId: string, opts: { root?: string; json?: boolean; last?: string; full?: boolean }) => {
    const root = resolveRoot(opts.root);
    const last = opts.last === undefined ? undefined : Number.parseInt(opts.last, 10);
    if (last !== undefined && (!Number.isFinite(last) || last <= 0)) {
      console.error(`[FAIL] --last must be a positive integer, got: ${opts.last}`);
      process.exit(1);
      return;
    }
    try {
      const { reportRun, formatRunReport } = await import("./harness/report.js");
      const report = await reportRun(root, runId, {
        ...(last !== undefined ? { last } : {}),
        ...(opts.full === true ? { full: true } : {}),
      });
      if (opts.json) console.log(JSON.stringify(report, null, 2));
      else console.log(formatRunReport(report));
    } catch (err) {
      console.error(`[FAIL] report error:`);
      console.error(`  error: ${(err as Error).message}`);
      process.exit(1);
    }
  });

// uh acceptance — real runtime evidence, separate from test and fixture status.
const acceptanceCmd = program.command("acceptance").description("Run and inspect real runtime acceptance evidence");

acceptanceCmd
  .command("run")
  .description("Run one registered capability or every capability for real")
  .argument("[capability]", "Registered capability id")
  .option("--all", "Run every registered capability")
  .requiredOption("--workspace <dir>", "Fresh workspace root for acceptance artifacts")
  .option("--runtime <id>", "Override the registry runtime")
  .option("--model <id>", "Override the requested runtime model")
  .option("--keep", "Retain the run workspace")
  .option("--root <path>", "Harness repository root (default: cwd)")
  .action(async (capability: string | undefined, opts: { all?: boolean; workspace: string; runtime?: string; model?: string; keep?: boolean; root?: string }) => {
    if (opts.all && capability) {
      console.error("[FAIL] <capability> and --all are mutually exclusive");
      process.exit(1);
      return;
    }
    try {
      await runAcceptance(resolveRoot(opts.root), {
        workspace: opts.workspace,
        runtime: opts.runtime,
        model: opts.model,
        keep: opts.keep,
        capabilities: capability ? [capability] : undefined,
      });
    } catch (error) {
      console.error(`[FAIL] acceptance run: ${(error as Error).message}`);
      process.exit(1);
    }
  });

acceptanceCmd
  .command("status")
  .description("Classify acceptance evidence by freshness and outcome")
  .option("--json", "Emit JSON")
  .option("--root <path>", "Harness repository root (default: cwd)")
  .action(async (opts: { json?: boolean; root?: string }) => {
    try {
      const summary = await acceptanceStatus(resolveRoot(opts.root));
      if (opts.json) console.log(JSON.stringify(summary, null, 2));
      else {
        console.log(`Acceptance evidence: proven ${summary.counts.proven}, stale ${summary.counts.stale}, failed ${summary.counts.failed}, unproven ${summary.counts.unproven}, fixture_only ${summary.counts.fixture_only}`);
        for (const [capability, reasons] of Object.entries(summary.reasons)) {
          console.log(`  stale ${capability}: ${reasons.join(", ")}`);
        }
      }
    } catch (error) {
      console.error(`[FAIL] acceptance status: ${(error as Error).message}`);
      process.exit(1);
    }
  });

acceptanceCmd
  .command("rebind")
  .description("Revalidate legacy evidence without rerunning models by stamping an input digest at its commit")
  .option("--root <path>", "Harness repository root (default: cwd)")
  .action(async (opts: { root?: string }) => {
    try {
      const outcomes = await rebindAcceptanceEvidence(resolveRoot(opts.root));
      const summary = { rebound: 0, changed: 0, skipped: 0 } as Record<"rebound" | "changed" | "skipped", number>;
      for (const outcome of outcomes) summary[outcome.outcome] += 1;
      console.log(`Acceptance rebind: ${summary.rebound} rebound, ${summary.changed} changed, ${summary.skipped} skipped`);
    } catch (error) {
      console.error(`[FAIL] acceptance rebind: ${(error as Error).message}`);
      process.exit(1);
    }
  });

acceptanceCmd
  .command("report")
  .description("Generate docs/acceptance/README.md from registry and latest evidence")
  .option("--root <path>", "Harness repository root (default: cwd)")
  .action(async (opts: { root?: string }) => {
    try {
      console.log(await writeAcceptanceReport(resolveRoot(opts.root)));
    } catch (error) {
      console.error(`[FAIL] acceptance report: ${(error as Error).message}`);
      process.exit(1);
    }
  });

// uh observatory snapshot --json
// Read-only, safe-metadata-only projection for local operator surfaces. The
// projector reads canonical .harness artifacts directly and never spawns a
// runtime, tails raw events, or serializes prompt/log/path fields.
const observatoryCmd = program
  .command("observatory")
  .description("Read Delivery Observatory projections");

observatoryCmd
  .command("snapshot")
  .description("Emit a delivery-observatory.v1 safe local snapshot")
  .option("--root <path>", "Root directory (default: cwd)")
  .option("--json", "Emit JSON (required for the v1 contract)")
  .action(async (opts: { root?: string; json?: boolean }) => {
    if (!opts.json) {
      console.error("uh observatory snapshot requires --json");
      process.exitCode = 1;
      return;
    }
    try {
      const root = resolveRoot(opts.root);
      const snapshot = await projectDeliveryObservatory(root);
      console.log(JSON.stringify(snapshot, null, 2));
    } catch (err) {
      console.error(`observatory snapshot unavailable: ${(err as Error).message}`);
      process.exitCode = 1;
    }
  });

function renderAlignedTable(headers: string[], rows: string[][]): void {
  const colWidths = headers.map((h, i) => Math.max(h.length, ...rows.map((r) => (r[i] ?? "").length)));
  const headerLine = headers.map((h, i) => h.padEnd(colWidths[i])).join("  ");
  const separatorLine = colWidths.map((w) => "-".repeat(w)).join("  ");
  console.log(headerLine);
  console.log(separatorLine);
  for (const row of rows) {
    console.log(row.map((cell, i) => cell.padEnd(colWidths[i])).join("  "));
  }
}

observatoryCmd
  .command("runs")
  .description("List indexed runs or summarize run groups with Pareto frontier")
  .option("--root <path>", "Root directory (default: cwd)")
  .option("--mission <id>", "Filter by mission id")
  .option("--group-by <dimension>", "Group runs by runtime, model, workflow_profile, stop_code, template, or tier")
  .option("--json", "Emit raw structures as JSON")
  .action(async (opts: { root?: string; mission?: string; groupBy?: string; json?: boolean }) => {
    try {
      const root = resolveRoot(opts.root);
      if (opts.groupBy !== undefined) {
        const validDimensions = ["runtime", "model", "workflow_profile", "stop_code", "template", "tier"] as const;
        type ValidDimension = typeof validDimensions[number];
        if (!validDimensions.includes(opts.groupBy as ValidDimension)) {
          console.error(`Invalid --group-by: must be one of ${validDimensions.join(", ")}`);
          process.exit(1);
          return;
        }
        const groupBy = opts.groupBy as ValidDimension;
        const records = await indexRuns(root, { missionId: opts.mission });
        const summaries = summarizeRuns(records, groupBy);
        const frontier = paretoFrontier(summaries);
        const frontierSet = new Set(frontier);

        if (opts.json) {
          console.log(JSON.stringify({
            summaries,
            pareto_frontier: frontier,
          }, null, 2));
          return;
        }

        const headers = [groupBy.toUpperCase(), "RUNS", "PASSED", "SUCCESS_RATE", "MEAN_COST", "TOTAL_COST", "MEAN_DURATION", "PARETO"];
        const rows = summaries.map((s) => {
          const keyStr = s.key !== undefined && s.key !== null && s.key !== "" ? String(s.key) : "unknown";
          const runsStr = String(s.runs);
          const passedStr = String(s.passed);
          const successRateStr = Number.isFinite(s.success_rate) ? `${(s.success_rate * 100).toFixed(1)}%` : "unknown";
          const meanCostStr = s.mean_cost_usd !== undefined ? `$${s.mean_cost_usd.toFixed(4)}` : "unknown";
          const totalCostStr = s.total_cost_usd !== undefined ? `$${s.total_cost_usd.toFixed(4)}` : "unknown";
          const meanDurationStr = s.mean_duration_ms !== undefined ? `${Math.round(s.mean_duration_ms)}ms` : "unknown";
          const paretoStr = frontierSet.has(s) ? "yes" : "no";
          return [keyStr, runsStr, passedStr, successRateStr, meanCostStr, totalCostStr, meanDurationStr, paretoStr];
        });

        renderAlignedTable(headers, rows);
        return;
      }

      const records = await indexRuns(root, { missionId: opts.mission });
      if (opts.json) {
        console.log(JSON.stringify(records, null, 2));
        return;
      }

      const headers = ["MISSION_ID", "RUN_ID", "RUNTIME", "MODEL", "WORKFLOW_PROFILE", "STATUS", "STOP_CODE", "DURATION", "TOKENS", "COST", "COST_SOURCE"];
      const rows = records.map((r) => {
        const missionStr = r.mission_id || "unknown";
        const runStr = r.run_id || "unknown";
        const runtimeStr = r.runtime || "unknown";
        const modelStr = r.model || "unknown";
        const workflowStr = r.workflow_profile || "unknown";
        const statusStr = r.status || "unknown";
        const stopCodeStr = r.stop_code || "unknown";
        const durationStr = r.duration_ms !== undefined ? `${r.duration_ms}ms` : "unknown";
        const tokensStr = r.token_totals === undefined
          ? "unknown"
          : String((r.token_totals.input ?? 0) + (r.token_totals.output ?? 0)
            + (r.token_totals.cache_read ?? 0) + (r.token_totals.cache_write ?? 0));
        const costStr = r.cost_usd !== undefined ? `$${r.cost_usd.toFixed(4)}` : "unknown";
        const costSourceStr = r.cost_source ?? "unknown";
        return [missionStr, runStr, runtimeStr, modelStr, workflowStr, statusStr, stopCodeStr, durationStr, tokensStr, costStr, costSourceStr];
      });

      renderAlignedTable(headers, rows);
    } catch (err) {
      console.error(`[FAIL] observatory runs error: ${(err as Error).message}`);
      process.exit(1);
    }
  });

// uh observatory compare --by <dimension> --a <value> --b <value>
// Two arms of one indexed run set, compared on outcome (Wilson score interval,
// never a bare percentage) and on cost, with the plain-repeats alternative made
// explicit: a configuration only earns a "better" verdict against the option of
// running the weaker arm more times at the same budget.
observatoryCmd
  .command("compare")
  .description("Compare two run arms on outcome and cost with honest uncertainty")
  .option("--root <path>", "Root directory (default: cwd)")
  .option("--mission <id>", "Filter by mission id")
  .option("--by <dimension>", "Compare arms by template, tier, model, or runtime")
  .option("--a <value>", "Grouping value for arm A")
  .option("--b <value>", "Grouping value for arm B")
  .option("--json", "Emit the comparison as JSON")
  .action(async (opts: { root?: string; mission?: string; by?: string; a?: string; b?: string; json?: boolean }) => {
    const compareDimensions = ["template", "tier", "model", "runtime"] as const;
    type CompareDimension = typeof compareDimensions[number];
    if (!compareDimensions.includes(opts.by as CompareDimension)) {
      console.error(`Invalid --by: must be one of ${compareDimensions.join(", ")}`);
      process.exit(1);
      return;
    }
    if (opts.a === undefined || opts.b === undefined) {
      console.error("uh observatory compare requires --a <value> and --b <value>");
      process.exit(1);
      return;
    }
    try {
      const root = resolveRoot(opts.root);
      const by = opts.by as CompareDimension;
      const valueA = opts.a;
      const valueB = opts.b;
      const records = await indexRuns(root, { missionId: opts.mission });
      const keyOf = (record: (typeof records)[number]): string | undefined =>
        by === "template" ? record.template_id : by === "tier" ? record.tier : record[by];
      const comparison = compareArms(
        records.filter((record) => keyOf(record) === valueA),
        records.filter((record) => keyOf(record) === valueB),
      );

      const weakerRef: "a" | "b" = comparison.a.success_rate >= comparison.b.success_rate ? "b" : "a";
      const strongerRef: "a" | "b" = weakerRef === "a" ? "b" : "a";
      const weaker = comparison[weakerRef];
      const stronger = comparison[strongerRef];
      const weakerValue = weakerRef === "a" ? valueA : valueB;
      const strongerValue = strongerRef === "a" ? valueA : valueB;
      const attempts = attemptsToMatch(weaker.success_rate, stronger.success_rate);
      const repeatsCost = attempts === undefined || weaker.mean_cost_usd === undefined
        ? undefined
        : attempts * weaker.mean_cost_usd;
      const reachesTarget = attempts === undefined
        ? false
        : bestOfN(weaker.success_rate, attempts) >= stronger.success_rate;
      const equalRates = comparison.a.success_rate === comparison.b.success_rate;

      if (opts.json) {
        console.log(JSON.stringify({
          by,
          a_value: valueA,
          b_value: valueB,
          comparison,
          plain_repeats_of_weaker: {
            arm: weakerRef,
            value: weakerValue,
            baseline_success_rate: weaker.success_rate,
            target_success_rate: stronger.success_rate,
            attempts,
            reaches_target: reachesTarget,
            mean_cost_usd: weaker.mean_cost_usd,
            total_cost_usd: repeatsCost,
          },
        }, null, 2));
        return;
      }

      const headers = ["ARM", "VALUE", "RUNS", "PASSED", "SUCCESS_RATE", "WILSON_95", "KNOWN_COST_RUNS", "MEAN_COST", "TOTAL_COST", "COST_PER_SUCCESS", "MEAN_DURATION"];
      const armRow = (ref: "a" | "b", value: string, arm: typeof comparison.a) => [
        ref.toUpperCase(),
        value,
        String(arm.runs),
        String(arm.passed),
        rateText(arm.success_rate),
        `${rateText(arm.interval.low)} - ${rateText(arm.interval.high)}`,
        String(arm.known_cost_runs),
        moneyOrUnknown(arm.mean_cost_usd),
        moneyOrUnknown(arm.total_cost_usd),
        moneyOrUnknown(arm.cost_per_success_usd),
        arm.mean_duration_ms === undefined ? "unknown" : `${Math.round(arm.mean_duration_ms)}ms`,
      ];
      renderAlignedTable(headers, [armRow("a", valueA, comparison.a), armRow("b", valueB, comparison.b)]);

      console.log(`\nVerdict: ${verdictSentence(comparison, valueA, valueB)}`);
      console.log(`Cost: ${comparison.cheaper_per_success === "unknown"
        ? `cheaper per success is unknown (${costPerSuccessText(comparison.a, valueA)} vs ${costPerSuccessText(comparison.b, valueB)})`
        : `${comparison.cheaper_per_success === "a" ? valueA : valueB} is cheaper per success (${costPerSuccessText(comparison.a, valueA)} vs ${costPerSuccessText(comparison.b, valueB)})`}`);
      console.log(`Plain repeats: ${repeatsSentence({ weakerValue, strongerValue, weaker, stronger, attempts, reachesTarget, repeatsCost, equalRates })}`);
    } catch (err) {
      console.error(`[FAIL] observatory compare error: ${(err as Error).message}`);
      process.exit(1);
    }
  });

function moneyOrUnknown(value: number | undefined): string {
  return value === undefined ? "unknown" : `$${value.toFixed(4)}`;
}

function rateText(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function intervalText(arm: { interval: { low: number; high: number } }): string {
  return `${rateText(arm.interval.low)}-${rateText(arm.interval.high)}`;
}

function costPerSuccessText(arm: { cost_per_success_usd: number | undefined }, value: string): string {
  return `${moneyOrUnknown(arm.cost_per_success_usd)} for ${value}`;
}

function verdictSentence(
  comparison: ReturnType<typeof compareArms>,
  valueA: string,
  valueB: string,
): string {
  if (comparison.verdict === "insufficient_data") {
    return `insufficient_data — ${valueA} has ${comparison.a.runs} run(s) and ${valueB} has ${comparison.b.runs}; at least ${MIN_ARM_RUNS} per arm are needed before any difference is reportable.`;
  }
  if (comparison.verdict === "no_clear_difference") {
    return `no_clear_difference — the 95% Wilson intervals overlap (${intervalText(comparison.a)} vs ${intervalText(comparison.b)}), so ${rateText(comparison.a.success_rate)} vs ${rateText(comparison.b.success_rate)} is within noise.`;
  }
  const winner = comparison.verdict === "a_better" ? valueA : valueB;
  const loser = comparison.verdict === "a_better" ? valueB : valueA;
  const winnerArm = comparison.verdict === "a_better" ? comparison.a : comparison.b;
  const loserArm = comparison.verdict === "a_better" ? comparison.b : comparison.a;
  return `${comparison.verdict} — ${winner} beats ${loser} on success rate (${rateText(winnerArm.success_rate)} vs ${rateText(loserArm.success_rate)}) with non-overlapping 95% Wilson intervals (${intervalText(winnerArm)} vs ${intervalText(loserArm)}).`;
}

function repeatsSentence(context: {
  weakerValue: string;
  strongerValue: string;
  weaker: { success_rate: number; mean_cost_usd: number | undefined };
  stronger: { success_rate: number };
  attempts: number | undefined;
  reachesTarget: boolean;
  repeatsCost: number | undefined;
  equalRates: boolean;
}): string {
  const { weakerValue, strongerValue, weaker, stronger, attempts, reachesTarget, repeatsCost, equalRates } = context;
  const target = rateText(stronger.success_rate);
  if (equalRates) {
    return stronger.success_rate === 0
      ? "neither arm passed a run, so repeats cannot separate them yet."
      : `both arms pass at ${target}, so repeating either one does not change the comparison.`;
  }
  if (attempts === undefined) {
    return `none of ${weakerValue}'s runs passed, so no number of plain repeats reaches ${strongerValue}'s ${target}.`;
  }
  const costClause = repeatsCost === undefined
    ? `cost unknown because ${weakerValue}'s mean cost per run is unknown`
    : `about $${repeatsCost.toFixed(2)} at its ${moneyOrUnknown(weaker.mean_cost_usd)} mean cost per run`;
  if (reachesTarget) {
    return `${attempts} plain repeat(s) of ${weakerValue} at ${rateText(weaker.success_rate)} would match ${strongerValue}'s ${target}, ${costClause}.`;
  }
  if (stronger.success_rate >= 1) {
    return `no number of plain repeats of ${weakerValue} at ${rateText(weaker.success_rate)} reaches ${strongerValue}'s ${target} success rate; ${attempts} repeats (the ${BEST_OF_N_CAP} cap) would cost ${costClause}.`;
  }
  return `${attempts} plain repeats of ${weakerValue} (the ${BEST_OF_N_CAP} cap) reach only ${rateText(bestOfN(weaker.success_rate, BEST_OF_N_CAP))}, short of ${strongerValue}'s ${target}, ${costClause}.`;
}

observatoryCmd
  .command("export")
  .description("Export a mission run trace in OpenTelemetry (OTLP) format")
  .argument("<mission-id>", "Mission id")
  .option("--otlp", "Export trace in OpenTelemetry (OTLP) format (required)")
  .option("--run-id <id>", "Specific run id (default: latest run)")
  .option("--out <file>", "Output file path (must resolve inside project root)")
  .option("--include-tool-targets", "Include tool targets in spans")
  .option("--root <path>", "Root directory (default: cwd)")
  .action(async (missionId: string, opts: { otlp?: boolean; runId?: string; out?: string; includeToolTargets?: boolean; root?: string }) => {
    if (!opts.otlp) {
      console.error("uh observatory export requires --otlp");
      process.exit(1);
      return;
    }
    try {
      const root = resolveRoot(opts.root);

      let targetOutPath: string | undefined;
      if (opts.out) {
        targetOutPath = path.resolve(root, opts.out);
        if (!isPathWithin(targetOutPath, path.resolve(root))) {
          console.error(`--out path must resolve inside the project root: ${opts.out}`);
          process.exit(1);
          return;
        }
      }

      let selectedRunId = opts.runId;
      const missionRunsDirectory = path.join(root, ".harness", "missions", missionId, "runs");
      if (!selectedRunId) {
        const latestPointerPath = path.join(root, ".harness", "missions", missionId, "latest.json");
        try {
          const raw = await readFileAsync(latestPointerPath, "utf-8");
          const parsed = JSON.parse(raw) as { run_id?: string };
          if (parsed.run_id) {
            selectedRunId = parsed.run_id;
          }
        } catch {
          // latest.json absent or invalid
        }
      }

      if (!selectedRunId) {
        const indexPath = path.join(missionRunsDirectory, "index.json");
        try {
          const raw = await readFileAsync(indexPath, "utf-8");
          const parsed = JSON.parse(raw) as { entries?: Array<{ run_id: string }> };
          if (Array.isArray(parsed.entries) && parsed.entries.length > 0) {
            selectedRunId = parsed.entries[parsed.entries.length - 1].run_id;
          }
        } catch {
          // index.json absent or invalid
        }
      }

      if (!selectedRunId) {
        try {
          const entries = await readdir(missionRunsDirectory, { withFileTypes: true });
          const dirNames = entries.filter((e) => e.isDirectory()).map((e) => e.name).sort();
          if (dirNames.length > 0) {
            selectedRunId = dirNames[dirNames.length - 1];
          }
        } catch {
          // runs directory absent
        }
      }

      if (!selectedRunId) {
        console.error(`No runs found for mission: ${missionId}`);
        process.exit(1);
        return;
      }

      const runDir = path.join(missionRunsDirectory, selectedRunId);
      const trace: OtlpTraceExport = await exportRunToOtlp(runDir, {
        includeToolTargets: opts.includeToolTargets === true,
      });

      const jsonStr = JSON.stringify(trace, null, 2);
      if (targetOutPath) {
        await mkdir(path.dirname(targetOutPath), { recursive: true });
        await writeFileAsync(targetOutPath, jsonStr + "\n", "utf-8");
      } else {
        console.log(jsonStr);
      }
    } catch (err) {
      console.error(`[FAIL] observatory export error: ${(err as Error).message}`);
      process.exit(1);
    }
  });

// uh experiment plan|run|report — matched-budget experiments over a seeded
// search/held-out task split. `runExperiment` takes the runner by injection;
// `run` wires a real per-runtime runner, while `plan` and `report` read and
// summarize artifacts and never start a runtime.
const experimentCmd = program
  .command("experiment")
  .description("Plan, run, and report matched-budget experiments with a held-out split");

experimentCmd
  .command("plan")
  .description("Print the seeded search/held-out split and the arm-interleaved run plan")
  .argument("<id>", "Experiment id")
  .option("--root <path>", "Root directory (default: cwd)")
  .action(async (id: string, opts: { root?: string }) => {
    try {
      const root = resolveRoot(opts.root);
      const { loadExperiment, splitTasks, planExperiment } = await import("./harness/experiment.js");
      const spec = await loadExperiment(root, id);
      const split = splitTasks(spec);
      const plan = planExperiment(spec);
      console.log(`Experiment: ${spec.id} — ${spec.title}`);
      console.log(`Seed: ${split.seed === undefined ? "explicit held-out split" : split.seed}`);
      console.log(`Split sizes: search ${split.search.length}, held_out ${split.held_out.length}`);
      console.log(`Plan: ${plan.length} run(s)`);
      console.log("");
      renderAlignedTable(
        ["TASK", "ARM", "ATTEMPT", "SPLIT"],
        plan.map((entry) => [entry.task, entry.arm, String(entry.attempt), entry.split]),
      );
    } catch (err) {
      console.error(`[FAIL] experiment plan error: ${(err as Error).message}`);
      process.exit(1);
    }
  });

experimentCmd
  .command("run")
  .description("Run a planned experiment under a matched budget")
  .argument("<id>", "Experiment id")
  .option("--root <path>", "Root directory (default: cwd)")
  .option("--json", "Emit the per-run records as JSON")
  .action(async (id: string, opts: { root?: string; json?: boolean }) => {
    try {
      const root = resolveRoot(opts.root);
      const { loadExperiment, runExperiment } = await import("./harness/experiment.js");
      const spec = await loadExperiment(root, id);
      const outcome = await runExperiment(root, spec, { runner: experimentRuntimeRunner(root) });
      if (opts.json) {
        console.log(JSON.stringify(outcome.runs, null, 2));
        return;
      }
      console.log(`Experiment: ${outcome.experiment_id}`);
      console.log(`Seed: ${outcome.seed === undefined ? "explicit held-out split" : outcome.seed}`);
      console.log(`Split sizes: search ${outcome.split.search.length}, held_out ${outcome.split.held_out.length}`);
      console.log(`Runs: ${outcome.executed} executed, ${outcome.skipped} skipped${outcome.stop_reason ? ` (budget: ${outcome.stop_reason})` : ""}`);
      console.log(`Plan: ${outcome.plan_path}`);
      console.log(`Runs: ${outcome.runs_path}`);
      console.log(`Report: ${outcome.report_path}`);
    } catch (err) {
      console.error(`[FAIL] experiment run error: ${(err as Error).message}`);
      process.exit(1);
    }
  });

experimentCmd
  .command("report")
  .description("Summarize an experiment against the plain-repeat baseline")
  .argument("<id>", "Experiment id")
  .option("--root <path>", "Root directory (default: cwd)")
  .option("--json", "Emit the report as JSON")
  .action(async (id: string, opts: { root?: string; json?: boolean }) => {
    try {
      const root = resolveRoot(opts.root);
      const { loadExperiment, loadExperimentRuns, summarizeExperiment, experimentVerdictLine, experimentRepeatsLine } =
        await import("./harness/experiment.js");
      const spec = await loadExperiment(root, id);
      const runs = await loadExperimentRuns(root, id);
      const report = summarizeExperiment(runs, spec);
      if (opts.json) {
        console.log(JSON.stringify(report, null, 2));
        return;
      }
      console.log(`Experiment: ${report.experiment_id} — ${report.title}`);
      console.log(`Seed: ${report.seed === undefined ? "explicit held-out split" : report.seed}`);
      console.log(`Split sizes: search ${report.split_sizes.search}, held_out ${report.split_sizes.held_out}`);
      console.log(`Baseline arm: ${report.baseline}`);
      for (const split of report.splits) {
        console.log("");
        console.log(`[${split.split}] ${split.task_count} task(s)`);
        renderAlignedTable(
          ["ARM", "RUNS", "PASSED", "SUCCESS_RATE", "WILSON_95", "MEAN_DENIALS", "GUARD_TAMPER", "CONTAINMENT_ESCAPE", "MEAN_COST"],
          split.arms.map((arm) => [
            arm.arm,
            String(arm.runs),
            String(arm.passed),
            rateText(arm.success_rate),
            `${rateText(arm.interval.low)} - ${rateText(arm.interval.high)}`,
            arm.mean_denials === undefined ? "unknown" : arm.mean_denials.toFixed(2),
            String(arm.guard_tamper_stops),
            String(arm.containment_escape_stops),
            arm.mean_cost_usd === undefined ? "unknown" : `$${arm.mean_cost_usd.toFixed(4)}`,
          ]),
        );
        for (const comparison of split.comparisons) {
          console.log(`Verdict (${comparison.a} vs ${comparison.b}): ${experimentVerdictLine(comparison.comparison, comparison.a, comparison.b)}`);
        }
        for (const repeat of split.baseline_repeats) {
          console.log(`Plain repeats (${repeat.baseline_arm} vs ${repeat.arm}): ${experimentRepeatsLine(repeat)}`);
        }
      }
    } catch (err) {
      console.error(`[FAIL] experiment report error: ${(err as Error).message}`);
      process.exit(1);
    }
  });

/**
 * The real per-runtime runner for `uh experiment run`. It resolves the arm's
 * session template, executes the task mission through the same runtime wiring
 * `mission run` uses, and reads the settled stop_code, denials, guard classes,
 * and cost back out of the run directory.
 */
function experimentRuntimeRunner(root: string): import("./harness/experiment.js").ExperimentRunner {
  return async (request) => {
    const missionPath = path.join(root, ".harness", "missions", request.task, "mission.yaml");
    let runtime = "hermes";
    let overrides: Record<string, unknown> = {};
    if (request.arm.template !== undefined) {
      const adoption = await adoptSessionTemplate({ root, missionPath, templateId: request.arm.template });
      runtime = adoption.runtime;
      overrides = { ...adoption.runtimeConfigOverrides };
    }
    overrides = { ...overrides, ...(request.arm.runtime_config_overrides ?? {}) };
    const wiring = RUNTIME_WIRINGS[runtime];
    if (!wiring) throw new Error(`Unknown runtime for arm "${request.arm.id}": ${runtime}`);
    const runId = generateRunId();
    const result = await wiring.run(root, missionPath, {
      runId,
      ...(Object.keys(overrides).length > 0 ? { extraRuntimeConfigOverrides: overrides } : {}),
    });
    const finalRunId = result.runId ?? runId;
    const runDir = path.join(root, ".harness", "missions", request.task, "runs", finalRunId);
    const settled = await readExperimentSettlement(runDir);
    return { run_id: finalRunId, mission_id: request.task, runtime, ...settled };
  };
}

async function readExperimentSettlement(runDir: string): Promise<{
  status?: string;
  stop_code?: string;
  denials?: number;
  denial_classes?: string[];
  cost_usd?: number;
  duration_ms?: number;
}> {
  let status: string | undefined;
  let stopCode: string | undefined;
  let denials: number | undefined;
  let costUsd: number | undefined;
  let durationMs: number | undefined;
  try {
    const parsed = parseYaml(await readFileAsync(path.join(runDir, "runtime-result.yaml"), "utf8")) as Record<string, unknown>;
    if (typeof parsed.status === "string") status = parsed.status;
    if (typeof parsed.cost_usd === "number") costUsd = parsed.cost_usd;
  } catch { /* artifact may be absent */ }
  try {
    const parsed = JSON.parse(await readFileAsync(path.join(runDir, "runtime-control.json"), "utf8")) as Record<string, unknown>;
    if (typeof parsed.status === "string") status = parsed.status;
    if (typeof parsed.stop_code === "string") stopCode = parsed.stop_code;
    if (typeof parsed.denials === "number") denials = parsed.denials;
    if (typeof parsed.started_at === "string" && typeof parsed.heartbeat_at === "string") {
      const elapsed = Date.parse(parsed.heartbeat_at) - Date.parse(parsed.started_at);
      if (Number.isFinite(elapsed) && elapsed >= 0) durationMs = elapsed;
    }
  } catch { /* artifact may be absent */ }
  const denialClasses: string[] = [];
  try {
    const log = await readFileAsync(path.join(runDir, "tool-guard.log"), "utf8");
    for (const line of log.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (trimmed === "") continue;
      try {
        const entry = JSON.parse(trimmed) as { class?: unknown };
        if (typeof entry.class === "string" && entry.class !== "allow") denialClasses.push(entry.class);
      } catch { /* a truncated guard line is not a denial we can classify */ }
    }
  } catch { /* no guard log */ }
  return {
    ...(status !== undefined ? { status } : {}),
    ...(stopCode !== undefined ? { stop_code: stopCode } : {}),
    ...(denials !== undefined ? { denials } : {}),
    ...(denialClasses.length > 0 ? { denial_classes: denialClasses } : {}),
    ...(costUsd !== undefined ? { cost_usd: costUsd } : {}),
    ...(durationMs !== undefined ? { duration_ms: durationMs } : {}),
  };
}

// uh verify
program
  .command("verify")
  .description("Run a mission's required verification checks and write verification.yaml")
  .argument("<mission-id>", "Mission id")
  .option("--root <path>", "Root directory (default: cwd)")
  .option("--timeout-ms <ms>", `Verification command timeout in milliseconds (default: ${DEFAULT_VERIFY_COMMAND_TIMEOUT_MS})`)
  .option("--no-sandbox", "Force checks to run in the harness root instead of auto-routing into the bound sandbox worktree")
  .action(async (missionId: string, opts: { root?: string; timeoutMs?: string; sandbox: boolean }) => {
    const root = resolveRoot(opts.root);
    try {
      const commandTimeoutMs = opts.timeoutMs === undefined ? undefined : parsePositiveIntegerOption("--timeout-ms", opts.timeoutMs);
      const result = await verifyMission(root, missionId, { commandTimeoutMs, useSandbox: opts.sandbox });
      const label = result.status === "passed" ? "PASS" : result.status === "failed" ? "FAIL" : "BLOCKED";
      console.log(`[${label}] ${result.mission_id}`);
      console.log(`checks: ${result.checks_passed} passed, ${result.checks_failed} failed, ${result.checks_blocked} blocked`);
      if (result.acceptance_total > 0) {
        const acFailures = result.acceptance_failed_block + result.acceptance_warn_failed;
        console.log(
          `acceptance: ${result.acceptance_passed} passed, ${result.acceptance_failed_block} block-failed, ` +
          `${result.acceptance_warn_failed} warn-failed, ${result.acceptance_blocked} blocked (total ${result.acceptance_total})`,
        );
        if (acFailures > 0) {
          console.log(`  see acceptance_criteria[] in ${result.path} for per-AC stdout/stderr snippets`);
        }
      }
      if (result.sandbox) {
        console.log(`sandbox: ${result.sandbox.id} (${result.sandbox.path})`);
      }
      console.log(`artifact: ${result.path}`);
      if (result.promotion) {
        console.log(`promoted: auto-on-verify -> ${result.promotion.path}`);
      }
      if (result.promotion_error) {
        console.error(`auto-promote failed: ${result.promotion_error}`);
      }
      process.exit(result.status === "passed" ? 0 : 1);
    } catch (err) {
      console.error(`[BLOCKED] ${missionId}`);
      console.error(`  error: ${(err as Error).message}`);
      process.exit(1);
    }
  });

function collectRepeatedOption(value: string, previous: string[]): string[] {
  return [...previous, value];
}

// uh promote
program
  .command("promote")
  .description("Write a safe promotion record for a mission")
  .argument("<mission-id>", "Mission id")
  .option("--root <path>", "Root directory (default: cwd)")
  .requiredOption("--approved-by <name>", "Approver name")
  .option("--decision <decision>", "Promotion decision: promoted, rejected, or deferred", "promoted")
  .option("--change <path>", "Changed path to include in the promotion record", collectRepeatedOption, [])
  .option("--sandbox-id <id>", "Sandbox id associated with this promotion")
  .action(async (missionId: string, opts: { root?: string; approvedBy: string; decision: PromoteDecision; change: string[]; sandboxId?: string }) => {
    const root = resolveRoot(opts.root);
    try {
      const result = await promoteMission(root, missionId, {
        approvedBy: opts.approvedBy,
        decision: opts.decision,
        changes: opts.change,
        sandboxId: opts.sandboxId,
      });
      console.log(`[${result.decision.toUpperCase()}] ${result.mission_id}`);
      console.log(`artifact: ${result.path}`);
    } catch (err) {
      console.error(`[BLOCKED] ${missionId}`);
      console.error(`  error: ${(err as Error).message}`);
      process.exit(1);
    }
  });

function parsePositiveIntegerOption(name: string, value: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer, got ${value}`);
  }
  return parsed;
}

// uh propose
program
  .command("propose")
  .description("Generate a mission packet from request/issue metadata or a .spec.md file")
  .argument("[id]", "Mission id (defaults to spec front-matter id when --from is set)")
  .option("--from <spec.md>", "Load mission fields from a uh.spec.v0 markdown spec")
  .option("--title <title>", "Mission title (required without --from)")
  .option("--workflow <profile>", "Workflow profile (default: spec-first-feature with --from)")
  .option("--objective <text>", "Mission objective (defaults to spec ## Goal with --from)")
  .option("--priority <priority>", "Mission priority (default: medium)")
  .option("--issue <provider:id[:url]>", "Issue ref; repeatable", collectIssueRefOption, [] as ProposeIssueRef[])
  .option("--read-first <path>", "Read-first context path; repeatable", collectRepeatedOption, [])
  .option("--source-link <url>", "Source link; repeatable", collectRepeatedOption, [])
  .option("--repo-root <path>", "Repository root recorded in mission context")
  .option("--constraint <text>", "Mission constraint; repeatable", collectRepeatedOption, [])
  .option("--required-skill <name>", "Required skill; repeatable", collectRepeatedOption, [])
  .option("--suggested-skill <name>", "Suggested skill; repeatable", collectRepeatedOption, [])
  .option("--expected-output <path>", "Expected output file path; repeatable", collectRepeatedOption, [])
  .option("--completion <text>", "Completion criterion; repeatable", collectRepeatedOption, [])
  .option("--required-check <name[=command]>", 'Required verification check; repeatable. Quote the entire value when the command contains short flags or spaces, e.g. --required-check "lint=pnpm -r lint"', collectRequiredCheckOption, [] as ProposeRequiredCheck[])
  .option("--review-gate <name>", "Review gate; repeatable", collectRepeatedOption, [])
  .option("--sandbox-backend <name>", "Sandbox backend (default: git-worktree)")
  .option("--promotion-policy <name>", "Promotion policy (default: human-approved)")
  .option("--output <path>", "Explicit output path (default: .harness/missions/<id>/mission.yaml)")
  .option("--root <path>", "Root directory (default: cwd)")
  .option("--force", "Overwrite existing mission file")
  .action(async (id: string | undefined, opts: {
    from?: string;
    title?: string;
    workflow?: string;
    objective?: string;
    priority?: string;
    issue: ProposeIssueRef[];
    readFirst: string[];
    sourceLink: string[];
    repoRoot?: string;
    constraint: string[];
    requiredSkill: string[];
    suggestedSkill: string[];
    expectedOutput: string[];
    completion: string[];
    requiredCheck: ProposeRequiredCheck[];
    reviewGate: string[];
    sandboxBackend?: string;
    promotionPolicy?: string;
    output?: string;
    root?: string;
    force?: boolean;
  }) => {
    const root = resolveRoot(opts.root);
    try {
      if (opts.from !== undefined) {
        const workflow = opts.workflow ?? "spec-first-feature";
        const result = await proposeMissionFromSpec(root, {
          specPath: opts.from,
          workflow,
          id,
          title: opts.title,
          objective: opts.objective,
          priority: opts.priority,
          issueRefs: opts.issue,
          readFirst: opts.readFirst,
          sourceLinks: opts.sourceLink,
          repoRoot: opts.repoRoot,
          constraints: opts.constraint,
          requiredSkills: opts.requiredSkill,
          suggestedSkills: opts.suggestedSkill,
          expectedOutputs: opts.expectedOutput,
          requiredChecks: opts.requiredCheck,
          reviewGates: opts.reviewGate,
          sandboxBackend: opts.sandboxBackend,
          promotionPolicy: opts.promotionPolicy,
          outputPath: opts.output,
          force: opts.force ?? false,
        });
        console.log(`${result.created ? "Created" : "Updated"} mission: ${result.mission.id}`);
        console.log(`Path: ${result.path}`);
        return;
      }

      if (!id) {
        throw new Error("Mission id is required when --from is not set.");
      }
      if (!opts.title || !opts.workflow || !opts.objective) {
        throw new Error("--title, --workflow, and --objective are required when --from is not set.");
      }

      const result = await proposeMission(root, {
        id,
        title: opts.title,
        workflow: opts.workflow,
        objective: opts.objective,
        priority: opts.priority,
        issueRefs: opts.issue,
        readFirst: opts.readFirst,
        sourceLinks: opts.sourceLink,
        repoRoot: opts.repoRoot,
        constraints: opts.constraint,
        requiredSkills: opts.requiredSkill,
        suggestedSkills: opts.suggestedSkill,
        expectedOutputs: opts.expectedOutput,
        completionCriteria: opts.completion,
        requiredChecks: opts.requiredCheck,
        reviewGates: opts.reviewGate,
        sandboxBackend: opts.sandboxBackend,
        promotionPolicy: opts.promotionPolicy,
        outputPath: opts.output,
        force: opts.force ?? false,
      });
      console.log(`${result.created ? "Created" : "Updated"} mission: ${id}`);
      console.log(`Path: ${result.path}`);
    } catch (err) {
      console.error(`[FAIL] propose error:`);
      console.error(`  error: ${(err as Error).message}`);
      process.exit(1);
    }
  });

function collectIssueRefOption(value: string, previous: ProposeIssueRef[]): ProposeIssueRef[] {
  return [...previous, parseIssueRef(value)];
}

function collectRequiredCheckOption(value: string, previous: ProposeRequiredCheck[]): ProposeRequiredCheck[] {
  return [...previous, parseRequiredCheck(value)];
}


// uh spec
const specCmd = program.command("spec").description("Spec-driven development helpers");

specCmd
  .command("scaffold")
  .description("Generate starter tests from uh.spec.v0 acceptance criteria")
  .requiredOption("--from <path>", "Path to .spec.md file")
  .requiredOption("--lang <lang>", "Target language: ts | py")
  .requiredOption("--out <path>", "Output test file path")
  .action(async (opts: { from: string; lang: string; out: string }) => {
    try {
      const lang = parseScaffoldLang(opts.lang);
      const result = await scaffoldTestsFromSpec({
        specPath: opts.from,
        lang,
        outPath: opts.out,
      });
      const verb = result.created ? "Created" : "Merged";
      console.log(`${verb} test scaffold: ${result.path}`);
      if (result.addedAcIds.length > 0) {
        console.log(`Added acceptance criteria: ${result.addedAcIds.join(", ")}`);
      }
    } catch (err) {
      console.error("[FAIL] spec scaffold error:");
      console.error(`  error: ${(err as Error).message}`);
      process.exit(1);
    }
  });

specCmd
  .command("template")
  .description("Print a starter uh.spec.v0 spec template (feature | epic)")
  .argument("[name]", "Template name; omit (or --list) to list available templates")
  .option("--out <path>", "Write the template to a file instead of stdout")
  .option("--list", "List available templates")
  .action(async (name: string | undefined, opts: { out?: string; list?: boolean }) => {
    if (opts.list || !name) {
      console.log(listSpecTemplates().join("\n"));
      return;
    }
    let content: string;
    try {
      content = getSpecTemplate(name);
    } catch (err) {
      console.error(`[FAIL] ${(err as Error).message}`);
      process.exit(1);
      return;
    }
    if (opts.out) {
      await writeFileAsync(opts.out, content, "utf-8");
      console.log(`Wrote ${name} template: ${opts.out}`);
      return;
    }
    process.stdout.write(content);
  });

// uh adapter
const adapterCmd = program
  .command("adapter")
  .description("Manage runtime adapters");

adapterCmd
  .command("list")
  .description("List configured adapter manifests")
  .option("--root <path>", "Root directory (default: cwd)")
  .action(async (opts: { root?: string }) => {
    const root = resolveRoot(opts.root);
    try {
      const entries = await runtimeRegistry.list(root);
      if (entries.length === 0) {
        console.log("No adapter manifests configured.");
        return;
      }
      for (const entry of entries) {
        const doc = entry.document;
        const checker = runtimeRegistry.hasChecker(doc.runtime) ? "yes" : "no";
        console.log(`- ${doc.id} (runtime=${doc.runtime}, status=${doc.status}, checker=${checker})`);
        console.log(`    manifest: ${entry.path}`);
      }
    } catch (err) {
      console.error(`[FAIL] adapter list error:`);
      console.error(`  error: ${(err as Error).message}`);
      process.exit(1);
    }
  });

adapterCmd
  .command("check")
  .description("Check if a runtime adapter is available and configured")
  .argument("[runtime]", "Runtime id to check; defaults to every configured adapter")
  .option("--root <path>", "Root directory (default: cwd)")
  .action(async (runtime: string | undefined, opts: { root?: string }) => {
    const root = resolveRoot(opts.root);
    let ids: string[];
    if (runtime) {
      ids = [runtime];
    } else {
      try {
        ids = (await runtimeRegistry.list(root)).map((entry) => entry.id);
      } catch (err) {
        console.error(`[FAIL] adapter check error:`);
        console.error(`  error: ${(err as Error).message}`);
        process.exit(1);
      }
    }
    if (ids.length === 0) {
      console.log("No adapter manifests to check.");
      return;
    }
    let failures = 0;
    for (const id of ids) {
      const result = await runtimeRegistry.check(root, id);
      if (result.found && result.errors.length === 0) {
        console.log(`[PASS] ${id} adapter`);
        console.log(`  runtime: ${result.runtime}`);
        if (result.version) {
          console.log(`  version: ${result.version}`);
        }
      } else {
        failures++;
        console.log(`[FAIL] ${id} adapter`);
        for (const e of result.errors) {
          console.log(`  error: ${e}`);
        }
      }
    }
    if (failures > 0) {
      process.exit(1);
    }
  });

adapterCmd
  .command("add")
  .description("Write a built-in adapter manifest template into .harness/adapters/")
  .argument("<runtime>", `Runtime template id (one of: ${listAdapterTemplates().join(", ")})`)
  .option("--root <path>", "Root directory (default: cwd)")
  .option("--force", "Overwrite an existing manifest at the same path")
  .action(async (runtime: string, opts: { root?: string; force?: boolean }) => {
    const root = resolveRoot(opts.root);
    try {
      const result = await addAdapter(root, runtime, { force: opts.force ?? false });
      console.log(`[ADDED] ${result.runtime}`);
      console.log(`  manifest: ${result.path}`);
    } catch (err) {
      console.error(`[FAIL] adapter add error:`);
      console.error(`  error: ${(err as Error).message}`);
      process.exit(1);
    }
  });

adapterCmd
  .command("capabilities")
  .description("Show adapter capability manifests (tools, sandbox, cost class, context window)")
  .option("--json", "Emit a JSON array for tooling")
  .option("--probe", "Live-probe hermes-proxy /capabilities and merge over the static manifest")
  .option("--root <path>", "Root directory (default: cwd)")
  .action(async (opts: { json?: boolean; probe?: boolean; root?: string }) => {
    const caps = listAdapterIds().map((id) => ({ ...CAPABILITIES[id] }));
    const probed: Record<string, "probe" | "static"> = {};
    if (opts.probe) {
      const root = resolveRoot(opts.root);
      try {
        const entry = (await runtimeRegistry.list(root)).find((e) => e.id === "hermes-proxy");
        const rc = (entry?.document.config as Record<string, unknown> | undefined)?.runtime_config as
          | Record<string, unknown>
          | undefined;
        const endpoint = typeof rc?.endpoint === "string" ? rc.endpoint : undefined;
        if (endpoint) {
          const result = await probeHermesProxyCapabilities(endpoint);
          const idx = caps.findIndex((c) => c.id === "hermes-proxy");
          if (idx >= 0) caps[idx] = { ...result.capabilities };
          probed["hermes-proxy"] = result.source;
        }
      } catch {
        // best-effort — leave the static manifest in place on any failure
      }
    }
    if (opts.json) {
      console.log(JSON.stringify(
        opts.probe
          ? { adapters: caps, cost_classes: COST_CLASSES, probed }
          : { adapters: caps, cost_classes: COST_CLASSES },
        null,
        2,
      ));
      return;
    }
    for (const c of caps) {
      const tag = probed[c.id] ? ` (${probed[c.id]})` : "";
      console.log(`${c.id} — ${c.display_name}${tag}`);
      console.log(`  cost_class: ${c.cost_class}  max_context_tokens: ${c.max_context_tokens ?? "model-dependent (unknown)"}  sandbox: ${c.sandbox}`);
      console.log(`  tools: shell=${c.tools.shell} fs_read=${c.tools.fs_read} fs_write=${c.tools.fs_write} network=${c.tools.network}`);
    }
  });

adapterCmd
  .command("cost-forecast")
  .description("Forecast token cost for a mission from its run history (heuristic fallback)")
  .requiredOption("--mission <id>", "Mission id")
  .option("--adapter <adapter>", "Adapter id or 'auto'", "auto")
  .option("--root <path>", "Root directory (default: cwd)")
  .option("--json", "Emit JSON")
  .action(async (opts: { mission: string; adapter: string; root?: string; json?: boolean }) => {
    const root = resolveRoot(opts.root);
    try {
      let adapterId: AdapterId;
      if (opts.adapter === "auto") {
        const installed = (await runtimeRegistry.list(root))
          .map((entry) => entry.id)
          .filter((id): id is AdapterId => id in CAPABILITIES);
        const mission = await loadMissionFile(path.join(missionDir(root, opts.mission), "mission.yaml"));
        const decision = chooseAdapter(mission, installed);
        if (!decision.adapter) {
          console.error(`[FAIL] cost-forecast auto-route: ${decision.reason}`);
          process.exit(1);
          return;
        }
        adapterId = decision.adapter;
      } else if (opts.adapter in CAPABILITIES) {
        adapterId = opts.adapter as AdapterId;
      } else {
        console.error(`[FAIL] unknown adapter: ${opts.adapter}`);
        process.exit(1);
        return;
      }
      const forecast = await forecastCost(root, opts.mission, adapterId);
      if (opts.json) {
        console.log(JSON.stringify(forecast, null, 2));
        return;
      }
      console.log(`Cost forecast for ${opts.mission} on ${forecast.adapter} (${forecast.cost_class}):`);
      console.log(`  est_input_tokens:  ${forecast.est_input_tokens}`);
      console.log(`  est_output_tokens: ${forecast.est_output_tokens}`);
      console.log(`  est_cost_usd:      $${forecast.est_cost_usd}`);
      console.log(`  basis:             ${forecast.basis} (${forecast.runs_sampled} run(s) sampled)`);
    } catch (err) {
      console.error(`[FAIL] cost-forecast error: ${(err as Error).message}`);
      process.exit(1);
    }
  });

// uh mission
const missionCmd = program
  .command("mission")
  .description("Create and execute missions against configured runtimes");

missionCmd.command("review-prepare")
  .description("Capture complete review inputs and emit an advisory independent-review mission; does not start a runtime")
  .argument("<id>", "New review mission id")
  .requiredOption("--sources <json>", "JSON array of {missionId, workspaceRoot?}; roots default to each source mission's bound workspace")
  .requiredOption("--runtime <runtime>", "oh-my-pi, command-code, or claude-code")
  .requiredOption("--model <model>", "Explicit independent reviewer model")
  .option("--workflow <profile>", "Review workflow", "research-docs")
  .option("--root <path>", "Root directory (default: cwd)")
  .action(async (id: string, opts: { sources: string; runtime: string; model: string; workflow: string; root?: string }) => {
    try {
      const sources = z.array(z.object({ missionId: z.string().min(1), workspaceRoot: z.string().min(1).optional() }).strict()).min(1).parse(JSON.parse(opts.sources));
      const runtime = z.enum(["oh-my-pi", "command-code", "claude-code"]).parse(opts.runtime);
      const prepared = await prepareIndependentReview(resolveRoot(opts.root), { id, sources, runtime, model: opts.model, workflow: opts.workflow });
      console.log(JSON.stringify(prepared, null, 2));
      console.log(`Report: ${prepared.reportPath} (relative to the review workspace; the reviewer writes it inside the review sandbox)`);
    } catch (error) {
      console.error(`[FAIL] mission review-prepare: ${(error as Error).message}`);
      process.exitCode = 1;
    }
  });

missionCmd.command("review-collect")
  .description("Validate review provenance and evidence; never grants human acceptance or promotes source work")
  .argument("<id>", "Review mission id")
  .option("--root <path>", "Canonical project root (default: cwd)")
  .action(async (id: string, opts: { root?: string }) => {
    try {
      const assessment = await collectIndependentReview(resolveRoot(opts.root), id);
      console.log(JSON.stringify(assessment, null, 2));
      const contradicted = (assessment.claims ?? []).filter(claim => claim.verdict === "contradicted");
      const attention = (assessment.findings ?? []).filter(finding => finding.severity === "error" || finding.severity === "warning");
      if (contradicted.length === 0 && attention.length === 0) {
        console.log("No contradicted claims or warning/error findings.");
        return;
      }
      for (const claim of contradicted) console.log(`Contradicted claim [${claim.source}]: ${claim.claim}`);
      for (const finding of attention) console.log(`${finding.severity.toUpperCase()} finding [${finding.source}]: ${finding.detail}`);
    } catch (error) {
      console.error(`[FAIL] mission review-collect: ${(error as Error).message}`);
      process.exitCode = 1;
    }
  });

missionCmd
  .command("create")
  .description("Create a scaffold mission packet")
  .argument("<id>", "Mission id")
  .requiredOption("--title <title>", "Mission title")
  .requiredOption("--workflow <profile>", "Workflow profile")
  .requiredOption("--objective <text>", "Mission objective")
  .option("--root <path>", "Root directory (default: cwd)")
  .option("--force", "Overwrite existing mission.yaml")
  .action(async (id: string, opts: { title: string; workflow: string; objective: string; root?: string; force?: boolean }) => {
    const root = resolveRoot(opts.root);
    try {
      const result = await createMission(root, {
        id,
        title: opts.title,
        workflow: opts.workflow,
        objective: opts.objective,
        force: opts.force ?? false,
      });
      console.log(`${result.created ? "Created" : "Updated"} mission: ${id}`);
      console.log(`Path: ${result.path}`);
    } catch (err) {
      console.error(`[FAIL] mission create error:`);
      console.error(`  error: ${(err as Error).message}`);
      process.exit(1);
    }
  });

// uh mission new — UH-75 thin wrapper around `mission create` that also writes
// a companion `design.md` when --design is set.
missionCmd
  .command("new")
  .description("Scaffold mission.yaml (and optionally a companion design.md)")
  .argument("<id>", "Mission id")
  .requiredOption("--title <title>", "Mission title")
  .requiredOption("--workflow <profile>", "Workflow profile")
  .requiredOption("--objective <text>", "Mission objective")
  .option("--design", "Also scaffold a companion design.md (UH-75)")
  .option("--design-path <path>", "Override the design.md filename relative to the mission directory")
  .option("--root <path>", "Root directory (default: cwd)")
  .option("--force", "Overwrite existing mission.yaml and design.md")
  .action(async (id: string, opts: { title: string; workflow: string; objective: string; design?: boolean; designPath?: string; root?: string; force?: boolean }) => {
    const root = resolveRoot(opts.root);
    try {
      const result = await createMission(root, {
        id,
        title: opts.title,
        workflow: opts.workflow,
        objective: opts.objective,
        force: opts.force ?? false,
        withDesign: opts.design === true,
        designPath: opts.designPath,
      });
      console.log(`${result.created ? "Created" : "Updated"} mission: ${id}`);
      console.log(`Path: ${result.path}`);
      if (result.designPath) {
        console.log(`Design: ${result.designPath}`);
      }
    } catch (err) {
      console.error(`[FAIL] mission new error:`);
      console.error(`  error: ${(err as Error).message}`);
      process.exit(1);
    }
  });

// uh mission show — UH-75 print mission metadata + design.md when present.
missionCmd
  .command("show")
  .description("Show a mission's metadata and design.md companion when present")
  .argument("<mission-id>", "Mission id")
  .option("--root <path>", "Root directory (default: cwd)")
  .action(async (missionId: string, opts: { root?: string }) => {
    const root = resolveRoot(opts.root);
    const missionPath = path.join(root, ".harness", "missions", missionId, "mission.yaml");
    let mission: import("./schema/mission.js").MissionDocument;
    try {
      mission = await loadMissionFile(missionPath);
    } catch (err) {
      console.error(`[FAIL] mission show error:`);
      console.error(`  error: ${(err as Error).message}`);
      process.exit(1);
      return;
    }
    console.log(`Mission: ${mission.id}`);
    console.log(`Title: ${mission.name}`);
    console.log(`Workflow: ${mission.workflow_profile}`);
    if (mission.priority) console.log(`Priority: ${mission.priority}`);
    if (mission.shape) console.log(`Shape: ${mission.shape}`);
    console.log(`Objective: ${mission.description}`);
    if (mission.acceptance_criteria.length > 0) {
      console.log(`Acceptance criteria (${mission.acceptance_criteria.length}):`);
      for (const ac of mission.acceptance_criteria) {
        console.log(`  - ${ac.id} [${ac.severity}] ${ac.description}`);
      }
    }
    const designPath = mission.design_path ?? "design.md";
    const designAbs = path.join(path.dirname(missionPath), designPath);
    try {
      const designContent = await readFileAsync(designAbs, "utf-8");
      console.log("");
      console.log(`=== ${designPath} ===`);
      console.log(designContent);
      console.log(`=== End ${designPath} ===`);
    } catch {
      console.log(`(no design.md at ${designPath})`);
    }
  });

// uh mission verdict — UH-76 manual override of the runtime-result verdict.
missionCmd
  .command("verdict")
  .description("Record a manual verdict (pass | needs-attention | needs-remediation) on a mission")
  .argument("<mission-id>", "Mission id")
  .argument("<value>", "Verdict value: pass | needs-attention | needs-remediation")
  .option("--rationale <text>", "Free-text rationale (required for non-pass)")
  .option("--missiondir <path>", "Override the mission directory (default: .harness/missions/<id>)")
  .option("--root <path>", "Root directory (default: cwd)")
  .action(async (missionId: string, value: string, opts: { rationale?: string; missiondir?: string; root?: string }) => {
    const root = resolveRoot(opts.root);
    const allowed: VerdictValue[] = ["pass", "needs-attention", "needs-remediation"];
    if (!(allowed as string[]).includes(value)) {
      console.error(`[FAIL] unknown verdict value: ${value}`);
      console.error(`  allowed: ${allowed.join(" | ")}`);
      process.exit(1);
      return;
    }
    try {
      const result = await recordManualVerdict({
        root,
        missionId,
        value: value as VerdictValue,
        rationale: opts.rationale,
        missionDir: opts.missiondir ? path.resolve(opts.missiondir) : undefined,
      });
      console.log(`[OK] verdict recorded: ${value}`);
      console.log(`  runtime-result: ${result.runtimeResultPath}`);
      console.log(`  audit: ${result.auditLine}`);
    } catch (err) {
      console.error(`[FAIL] mission verdict error:`);
      console.error(`  error: ${(err as Error).message}`);
      process.exit(1);
    }
  });

// uh mission check — validate a packet's read_first refs, write roots,
// "Change only" constraints, grounding claims, and runtime_config_overrides
// before anything is launched. Never starts a runtime and never writes to
// .harness (see src/harness/mission-check.ts).
missionCmd
  .command("check")
  .description("Validate a mission packet (paths, write roots, grounding, runtime overrides) without launching a runtime")
  .argument("<file>", "Mission packet path (mission.yaml)")
  .option("--runtime <runtime>", "Runtime id to validate runtime_config_overrides against (single-shape default: hermes)")
  .option("--root <path>", "Root directory (default: cwd)")
  .option("--json", "Emit the check results as JSON")
  .action(async (file: string, opts: { runtime?: string; root?: string; json?: boolean }) => {
    const root = resolveRoot(opts.root);
    const { checkMissionPackets, renderMissionCheckLines } = await import("./harness/mission-check.js");
    let result: import("./harness/mission-check.js").MissionCheckResult;
    try {
      result = await checkMissionPackets({ root, missionPath: file, runtime: opts.runtime });
    } catch (err) {
      console.error(`[FAIL] mission check error: ${(err as Error).message}`);
      process.exit(1);
      return;
    }
    if (opts.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      for (const line of renderMissionCheckLines(result)) console.log(line);
    }
    if (!result.ok) {
      process.exit(1);
    }
  });

// uh mission put — the coordinator's allowed path to persist a whole packet.
// An orchestrator may only run controller commands and may not write under
// .harness (protected), so `mission create`/`new` and `propose` (a subset of
// the fields) are not enough. This runs checkMissionPackets first and writes
// nothing on failure, installs atomically, refuses an existing target without
// --replace, and refuses --replace while a live run of the mission exists
// (see src/harness/mission-put.ts).
missionCmd
  .command("put")
  .description("Validate and install mission packet(s) into .harness/missions/<id>/mission.yaml")
  .argument("<files...>", "Mission packet path(s) (mission.yaml)")
  .option("--replace", "Overwrite an installed packet (refused while the mission has a live run)")
  .option("--root <path>", "Root directory (default: cwd)")
  .option("--json", "Emit the put result as JSON")
  .action(async (files: string[], opts: { replace?: boolean; root?: string; json?: boolean }) => {
    const root = resolveRoot(opts.root);
    const { putMissionPackets } = await import("./harness/mission-put.js");
    const { renderMissionCheckLines } = await import("./harness/mission-check.js");
    let result: import("./harness/mission-put.js").PutMissionPacketsResult;
    try {
      result = await putMissionPackets({ root, packetPaths: files, replace: opts.replace === true });
    } catch (err) {
      console.error(`[FAIL] mission put error:`);
      console.error(`  error: ${(err as Error).message}`);
      process.exit(1);
      return;
    }
    if (!result.ok) {
      if (opts.json) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        if (result.checks) for (const line of renderMissionCheckLines(result.checks)) console.log(line);
        console.error(`[FAIL] mission put refused: ${result.reason}`);
      }
      process.exit(1);
      return;
    }
    if (opts.json) {
      console.log(JSON.stringify(result, null, 2));
      return;
    }
    for (const packet of result.installed) {
      console.log(`Installed mission ${packet.mission_id}`);
      console.log(`  path: ${packet.path}`);
      console.log(`  sha256: ${packet.sha256}`);
    }
    console.log(`[OK] ${result.installed.length} packet(s) installed; ${result.auditLines.length} audit event(s) appended`);
  });

missionCmd
  .command("dry-run")
  .description("Show what command would be executed without running it")
  .argument("[file]", "Mission file path")
  .option("--runtime <runtime>", "Runtime to use (default: hermes, or the template adapter)")
  .option("--root <path>", "Root directory (default: cwd)")
  .option("--no-sandbox", "Do not auto-route into the mission's bound sandbox worktree")
  .option("--force", "Bypass mission capability matching and runtime_requirements for this runtime")
  .option("--template <id>", "Adopt a session template from .harness/templates/<id>.yaml")
  .option("--runtime-config-overrides <json>", "JSON object of runtime_config overrides applied on top of the template and mission file")
  .option("--auto", "Auto-select the cheapest installed adapter that satisfies the mission's runtime_requirements")
  .option("--explain", "With --auto, print the adapter decision matrix")
  .option("--strict", "Treat capability mismatches as errors instead of warnings (default: warn)")
  .action(async (file: string | undefined, opts: { runtime?: string; root?: string; sandbox: boolean; force?: boolean; template?: string; runtimeConfigOverrides?: string; auto?: boolean; explain?: boolean; strict?: boolean }) => {
    const root = resolveRoot(opts.root);
    const filePath = file || `${root}/examples/missions/documentation-spine.yaml`;

    if (opts.auto && opts.runtime) {
      console.error("[FAIL] --auto and --runtime are mutually exclusive");
      process.exit(1);
      return;
    }
    if (opts.auto && opts.template !== undefined) {
      console.error("[BLOCKED] --auto cannot be combined with --template");
      process.exit(exitCodeForRun("blocked"));
      return;
    }

    let extraRuntimeConfigOverrides: Record<string, unknown> | undefined;
    if (opts.runtimeConfigOverrides !== undefined) {
      try {
        extraRuntimeConfigOverrides = parseRuntimeConfigOverridesJson(opts.runtimeConfigOverrides);
      } catch (e) {
        console.error(`[BLOCKED] ${(e as Error).message}`);
        process.exit(exitCodeForRun("blocked"));
        return;
      }
    }

    let templateAdoption: SessionTemplateAdoption | undefined;
    if (opts.template !== undefined) {
      try {
        templateAdoption = await adoptSessionTemplate({ root, missionPath: filePath, templateId: opts.template, explicitRuntime: opts.runtime });
      } catch (err) {
        console.error(`[BLOCKED] session template refused:`);
        console.error(`  error: ${(err as Error).message}`);
        process.exit(exitCodeForRun("blocked"));
        return;
      }
      extraRuntimeConfigOverrides = {
        ...templateAdoption.runtimeConfigOverrides,
        ...(extraRuntimeConfigOverrides ?? {}),
      };
    }

    let runtime = templateAdoption ? templateAdoption.runtime : (opts.runtime || "hermes");
    let semanticModel: string | undefined;
    let routeRequested = opts.auto === true;
    if (!routeRequested && !opts.runtime && !templateAdoption) {
      try {
        routeRequested = (await loadMissionFile(filePath)).decision_policy?.enabled === true;
      } catch {
        routeRequested = false;
      }
    }
    if (routeRequested) {
      try {
        const decision = await evaluateSemanticRoute({
          root,
          missionPath: filePath,
          force: opts.force === true,
          auto: opts.auto === true,
          explain: opts.explain === true,
        });
        if (!decision.adapter) {
          console.error(`[BLOCKED] auto-route: ${decision.reason}`);
          process.exit(exitCodeForRun("blocked"));
          return;
        }
        runtime = decision.adapter;
        if (decision.model) semanticModel = decision.model;
        console.log(`Auto-routed to: ${runtime} — ${decision.reason}`);
      } catch (err) {
        console.error(`[FAIL] auto-route error: ${(err as Error).message}`);
        process.exit(1);
        return;
      }
    }
    if (semanticModel && !(extraRuntimeConfigOverrides && "model" in extraRuntimeConfigOverrides)) {
      extraRuntimeConfigOverrides = { ...(extraRuntimeConfigOverrides ?? {}), model: semanticModel };
    }
    const wiring = RUNTIME_WIRINGS[runtime];
    if (!wiring) {
      console.error(`Unknown runtime: ${runtime}`);
      process.exit(1);
      return;
    }
    try {
      await enforceRuntimePreflight(root, filePath, runtime, { force: opts.force === true, strict: opts.strict === true });
    } catch (err) {
      console.error(`[BLOCKED] runtime preflight failed:`);
      console.error(`  error: ${(err as Error).message}`);
      console.error(`  pass --force to bypass this safety check`);
      process.exit(1);
      return;
    }
    const routing = await resolveSandboxMissionRoot(root, filePath, opts.sandbox);
    if (routing.error) {
      console.error(`[BLOCKED] sandbox routing failed:`);
      console.error(`  error: ${routing.error}`);
      process.exit(1);
      return;
    }
    if (routing.sandbox?.backend === "container") {
      console.error(`[BLOCKED] container sandbox mission dry-run requires an OpenSandbox adapter-execution bridge; refusing host execution for sandbox ${routing.sandbox.id}`);
      process.exit(1);
      return;
    }
    // Dry-run never blocks on a missing binding: it only shows where the run
    // would go before anything is spent.
    console.log(sandboxRouteLine(routing, opts.sandbox));
    if (templateAdoption) {
      const overridden = templateAdoption.description.overridden_by_mission;
      console.log(
        `Template: ${templateAdoption.description.template_id} (tier=${templateAdoption.description.tier}, containment=${templateAdoption.description.containment}, overridden_by_mission=${overridden.length > 0 ? overridden.join(",") : "none"})`,
      );
      console.log(`Template effective overrides: ${JSON.stringify(extraRuntimeConfigOverrides ?? {})}`);
    }
    const result = await wiring.dryRun(routing.effectiveRoot, routing.missionPath, { extraRuntimeConfigOverrides });
    if (result.errors.length > 0) {
      console.log("[FAIL] dry-run errors:");
      for (const e of result.errors) {
        console.log(`  error: ${e}`);
      }
      process.exit(1);
    }
    console.log(`Command: ${result.command} ${result.args.join(" ")}`);
    console.log(`Prompt source: ${result.promptPath ?? result.promptSource ?? "argv"}`);
    console.log(`Worktree mode: ${result.worktree}`);
    console.log(`Session ID passthrough: ${result.session_id_passthrough}`);
    console.log("");
    console.log("=== Rendered mission prompt ===");
    console.log(result.prompt);
    console.log("=== End mission prompt ===");
  });

missionCmd
  .command("run")
  .description("Execute a mission against a configured runtime")
  .argument("[file]", "Mission file path")
  .option("--runtime <runtime>", "Runtime to use (default: hermes)")
  .option("--root <path>", "Root directory (default: cwd)")
  .option("--no-sandbox", "Do not auto-route into the mission's bound sandbox worktree")
  .option("--force", "Bypass mission capability matching and runtime_requirements for this runtime")
  .option(
    "--runtime-config-overrides <json>",
    "JSON object of runtime_config overrides applied on top of the mission file (e.g. '{\"model\":\"gpt-5\"}')",
  )
  .option("--template <id>", "Adopt a session template from .harness/templates/<id>.yaml")
  .option("--run-id <id>", "Explicit run id; auto-generated if omitted")
  .option("--auto", "Auto-select the cheapest installed adapter that satisfies the mission's runtime_requirements")
  .option("--explain", "With --auto, print the adapter decision matrix")
  .option("--quiet", "Do not print the runtime's stdout or stderr")
  .option("--strict", "Treat capability mismatches as errors instead of warnings (default: warn)")
  .action(async (file: string | undefined, opts: { runtime?: string; root?: string; sandbox: boolean; force?: boolean; runtimeConfigOverrides?: string; template?: string; runId?: string; auto?: boolean; explain?: boolean; quiet?: boolean; strict?: boolean }) => {
    const root = resolveRoot(opts.root);
    const filePath = file || `${root}/examples/missions/documentation-spine.yaml`;

    if (opts.auto && opts.runtime) {
      console.error("[FAIL] --auto and --runtime are mutually exclusive");
      process.exit(1);
      return;
    }
    if (opts.auto && opts.template !== undefined) {
      console.error("[BLOCKED] --auto cannot be combined with --template");
      process.exit(exitCodeForRun("blocked"));
      return;
    }
    let templateAdoption: SessionTemplateAdoption | undefined;
    if (opts.template !== undefined) {
      try {
        templateAdoption = await adoptSessionTemplate({ root, missionPath: filePath, templateId: opts.template, explicitRuntime: opts.runtime });
      } catch (err) {
        console.error(`[BLOCKED] session template refused:`);
        console.error(`  error: ${(err as Error).message}`);
        process.exit(exitCodeForRun("blocked"));
        return;
      }
    }
    let runtime = templateAdoption ? templateAdoption.runtime : (opts.runtime || "hermes");
    let semanticModel: string | undefined;
    // Route when `--auto` is passed, or when an unpinned mission activates its
    // own `decision_policy`; an explicit `--runtime`/`--template` always wins.
    let routeRequested = opts.auto === true;
    if (!routeRequested && !opts.runtime && !templateAdoption) {
      try {
        routeRequested = (await loadMissionFile(filePath)).decision_policy?.enabled === true;
      } catch {
        routeRequested = false;
      }
    }
    if (routeRequested) {
      try {
        // --force bypasses runtime_requirements in the preflight below, so the
        // routing seam waives the same requirements filter.
        const decision = await evaluateSemanticRoute({
          root,
          missionPath: filePath,
          force: opts.force === true,
          auto: opts.auto === true,
          explain: opts.explain === true,
          runId: opts.runId,
        });
        if (!decision.adapter) {
          console.error(`[BLOCKED] auto-route: ${decision.reason}`);
          process.exit(exitCodeForRun("blocked"));
          return;
        }
        runtime = decision.adapter;
        if (decision.model) semanticModel = decision.model;
        console.log(`Auto-routed to: ${runtime} — ${decision.reason}`);
      } catch (err) {
        console.error(`[FAIL] auto-route error: ${(err as Error).message}`);
        process.exit(1);
        return;
      }
    }

    if (opts.runId !== undefined) {
      try {
        assertValidRunId(opts.runId);
      } catch (err) {
        console.error(`[FAIL] ${(err as Error).message}`);
        process.exit(1);
        return;
      }
    }

    const wiring = RUNTIME_WIRINGS[runtime];
    if (!wiring) {
      console.error(`Unknown runtime: ${runtime}`);
      process.exit(1);
      return;
    }
    try {
      await enforceRuntimePreflight(root, filePath, runtime, { force: opts.force === true, strict: opts.strict === true });
    } catch (err) {
      console.error(`[BLOCKED] runtime preflight failed:`);
      console.error(`  error: ${(err as Error).message}`);
      console.error(`  pass --force to bypass this safety check`);
      process.exit(exitCodeForRun("blocked"));
      return;
    }
    const routing = await resolveSandboxMissionRoot(root, filePath, opts.sandbox);
    if (routing.error) {
      console.error(`[BLOCKED] sandbox routing failed:`);
      console.error(`  error: ${routing.error}`);
      process.exit(exitCodeForRun("blocked"));
      return;
    }
    if (routing.sandbox?.backend === "container") {
      console.error(`[BLOCKED] container sandbox mission run requires an OpenSandbox adapter-execution bridge; refusing host execution for sandbox ${routing.sandbox.id}`);
      process.exit(exitCodeForRun("blocked"));
      return;
    }
    if (opts.sandbox && !routing.sandbox) {
      // A guarded worker running in the project root edits the operator's live
      // working tree, so root execution is only reachable through an explicit
      // --no-sandbox. Refuse before any run directory or process exists.
      const blockedMissionId = routing.missionId ?? "unknown";
      console.error(`[BLOCKED] mission ${blockedMissionId} has no bound sandbox; create one with "uh sandbox create <sandbox-id> --mission ${blockedMissionId}" or pass --no-sandbox to run in the project root`);
      const blockedRunId = opts.runId ?? generateRunId();
      const blockedRunDir = path.relative(
        path.resolve(root),
        path.join(root, ".harness", "missions", blockedMissionId, "runs", blockedRunId),
      ).replace(/\\/g, "/");
      console.log(`UH_RESULT ${JSON.stringify({
        mission_id: blockedMissionId,
        run_id: blockedRunId,
        runtime,
        status: "blocked",
        exit_code: exitCodeForRun("blocked"),
        run_dir: blockedRunDir,
      })}`);
      process.exit(exitCodeForRun("blocked"));
      return;
    }
    let extraRuntimeConfigOverrides: Record<string, unknown> | undefined;
    if (opts.runtimeConfigOverrides !== undefined) {
      try {
        extraRuntimeConfigOverrides = parseRuntimeConfigOverridesJson(opts.runtimeConfigOverrides);
      } catch (e) {
        console.error(`[BLOCKED] ${(e as Error).message}`);
        process.exit(exitCodeForRun("blocked"));
        return;
      }
    }
    if (templateAdoption) {
      // Mission values already won inside the template merge; an explicit
      // --runtime-config-overrides still wins over both.
      extraRuntimeConfigOverrides = {
        ...templateAdoption.runtimeConfigOverrides,
        ...(extraRuntimeConfigOverrides ?? {}),
      };
    }
    // A semantic model recommendation applies only when no explicit CLI override
    // already pins the model.
    if (semanticModel && !(extraRuntimeConfigOverrides && "model" in extraRuntimeConfigOverrides)) {
      extraRuntimeConfigOverrides = { ...(extraRuntimeConfigOverrides ?? {}), model: semanticModel };
    }
    try {
      await assertFleetAdmission(root, filePath, runtime, extraRuntimeConfigOverrides);
    } catch (err) {
      console.error(`[BLOCKED] ${(err as Error).message}`);
      console.error(`  authorize the route under fleet.routes in .harness/project.yaml; --force does not bypass spend authorization`);
      process.exit(exitCodeForRun("blocked"));
      return;
    }
    console.log(`Running mission: ${filePath}`);
    console.log(`Runtime: ${runtime}`);
    if (opts.runId) {
      console.log(`Run id: ${opts.runId}`);
    }
    console.log(sandboxRouteLine(routing, opts.sandbox));
    if (extraRuntimeConfigOverrides) {
      const keys = Object.keys(extraRuntimeConfigOverrides);
      console.log(`Runtime config overrides: ${keys.length} key(s) — ${keys.join(", ")}`);
    }
    const runId = opts.runId ?? generateRunId();
    console.log("");
    let result: { exitCode: number; stdout: string; stderr: string; result?: { status?: string; errors?: string[] }; runId?: string };
    const cancellationController = new AbortController();
    let recovery: { missionId: string; recovery: unknown };
    try {
      recovery = await resolveRuntimeRecoveryPolicy(routing.effectiveRoot, routing.missionPath, runtime, extraRuntimeConfigOverrides);
      result = await runWithRuntimeRecovery({
        root, runtime, runId, ...recovery, extraRuntimeConfigOverrides,
        cancellationSignal: cancellationController.signal,
        run: async (attempt) => {
          const uninstall = await installRuntimeCancelledEventHandler(root, routing.missionPath, runtime, attempt.runId, cancellationController);
          try {
            const runRes = await wiring.run(routing.effectiveRoot, routing.missionPath, {
              ...attempt, artifactRoot: root, cancellationSignal: cancellationController.signal,
            });
            return { ...runRes, runId: attempt.runId };
          } finally { uninstall(); }
        },
      });
    } catch (err) {
      console.log("[FAIL] mission run error:");
      console.log(`  error: ${(err as Error).message}`);
      process.exit(exitCodeForRun("failed"));
      return;
    }
    const missionId = recovery.missionId;
    const finalRunId = result.runId ?? runId;
    const runDir = path.join(root, ".harness", "missions", missionId, "runs", finalRunId);
    const relativeRunDir = path.relative(path.resolve(root), runDir).replace(/\\/g, "/");

    if (templateAdoption) {
      // Record the adopted template beside the adapter's own per-run
      // artifacts (e.g. tool-guard.json) using the shared write helper.
      try {
        const missionArtifactDir = path.join(root, ".harness", "missions", missionId);
        await mkdir(runDir, { recursive: true });
        await writeArtifactFile(
          missionArtifactDir,
          path.join(runDir, "session-template.json"),
          JSON.stringify(templateAdoption.description, null, 2),
        );
      } catch (err) {
        console.error(`[WARN] failed to record adopted session template: ${(err as Error).message}`);
      }
    }

    if (result.runId && (!opts.runId || result.runId !== runId)) {
      console.log(`Run id: ${result.runId}`);
    }
    if (!opts.quiet) {
      if (result.stdout) {
        console.log(result.stdout);
      }
      if (result.stderr) {
        console.error(result.stderr);
      }
    }

    let controlStatus: string | undefined;
    let controlStopCode: string | undefined;
    try {
      const controlPath = path.join(runDir, "runtime-control.json");
      const controlData = JSON.parse(await readFileAsync(controlPath, "utf8"));
      controlStatus = controlData?.status;
      controlStopCode = controlData?.stop_code;
    } catch {
      // artifact not present
    }

    let resultYamlStatus: string | undefined;
    let resultYamlStopCode: string | undefined;
    try {
      const resultPath = path.join(runDir, "runtime-result.yaml");
      const resultData = parseYaml(await readFileAsync(resultPath, "utf8")) as Record<string, unknown>;
      resultYamlStatus = typeof resultData?.status === "string" ? resultData.status : undefined;
      resultYamlStopCode = typeof resultData?.stop_code === "string" ? resultData.stop_code : undefined;
    } catch {
      // artifact not present
    }

    let status: string;
    if (result.exitCode === 130 || controlStopCode === "cancelled" || controlStatus === "cancelled" || resultYamlStatus === "cancelled") {
      status = "cancelled";
    } else if (wiring.surfaceBlocked && result.result?.status === "blocked") {
      status = "blocked";
    } else if (controlStatus === "blocked" || resultYamlStatus === "blocked") {
      status = "blocked";
    } else if (result.exitCode === 0 && (resultYamlStatus === "passed" || controlStatus === "passed" || result.result?.status === "passed" || (!resultYamlStatus && !controlStatus))) {
      status = "passed";
    } else {
      status = controlStatus ?? resultYamlStatus ?? result.result?.status ?? (result.exitCode === 0 ? "passed" : "failed");
    }

    const finalStopCode = controlStopCode ?? resultYamlStopCode;
    const runExitCode = exitCodeForRun(status, finalStopCode);

    if (wiring.surfaceBlocked && result.result?.status === "blocked") {
      console.log(`[BLOCKED] mission classified as blocked`);
      for (const e of result.result.errors ?? []) {
        console.log(`  error: ${e}`);
      }
    }
    else if (result.exitCode !== 0) {
      console.log(`[FAIL] mission exited with code ${result.exitCode}`);
    }

    const settlementPayload: {
      mission_id: string;
      run_id: string;
      runtime: string;
      status: string;
      stop_code?: string;
      exit_code: number;
      run_dir: string;
    } = {
      mission_id: missionId,
      run_id: finalRunId,
      runtime,
      status,
      ...(finalStopCode ? { stop_code: finalStopCode } : {}),
      exit_code: runExitCode,
      run_dir: relativeRunDir,
    };
    console.log(`UH_RESULT ${JSON.stringify(settlementPayload)}`);
    process.exit(runExitCode);
  });

missionCmd
  .command("cancel")
  .description("Cancel an owned local mission run; use --plugin-url only for plugin-managed runs")
  .requiredOption("--mission <id>", "Mission id (validated; run lookup uses --run-id)")
  .requiredOption("--run-id <id>", "Run id to cancel")
  .option("--root <path>", "Root directory (default: cwd)")
  .option("--plugin-url <url>", "Explicit Hermes plugin API base URL for plugin-managed runs")
  .action(async (opts: { mission: string; runId: string; root?: string; pluginUrl?: string }) => {
    const root = resolveRoot(opts.root);
    try {
      assertSafeMissionId(opts.mission);
      assertValidRunId(opts.runId);
    } catch (err) {
      console.error(`[FAIL] ${(err as Error).message}`);
      process.exit(1);
      return;
    }
    const missionPath = path.join(root, ".harness", "missions", opts.mission, "mission.yaml");
    try {
      await readFileAsync(missionPath, "utf-8");
    } catch {
      console.error(`[FAIL] mission ${opts.mission} not found under ${root}`);
      process.exit(1);
      return;
    }
    try {
      const result = opts.pluginUrl
        ? await cancelMissionRunViaPlugin(opts.pluginUrl, opts.runId)
        : await cancelLocalMissionRun(root, opts.mission, opts.runId);
      console.log(`Run ${opts.runId} for mission ${opts.mission} settled with status: ${result.status}`);
    } catch (err) {
      if (err instanceof MissionCancelError) {
        if (err.code === "already_finished") {
          console.error(`[FAIL] run ${opts.runId} already finished`);
          process.exit(1);
          return;
        }
        console.error(`[FAIL] mission cancel error:`);
        console.error(`  error: ${err.message}`);
        process.exit(err.status === 0 ? 1 : err.status);
        return;
      }
      console.error(`[FAIL] mission cancel error:`);
      console.error(`  error: ${(err as Error).message}`);
      process.exit(1);
    }
  });

missionCmd
  .command("run-all")
  .description("Run a mission across multiple adapter runtimes and produce a side-by-side comparison")
  .argument("<mission-id>", "Mission id (must exist in .harness/missions/)")
  .option("--runtimes <list>", "Comma-separated runtime list (default: every active adapter)")
  .option("--root <path>", "Root directory (default: cwd)")
  .option("--serial", "Run runtimes sequentially instead of in parallel")
  .option("--force", "Bypass mission capability matching and runtime_requirements for selected runtimes")
  .option("--strict", "Treat capability mismatches as errors instead of warnings (default: warn)")
  .action(async (missionId: string, opts: { runtimes?: string; root?: string; serial?: boolean; force?: boolean; strict?: boolean }) => {
    const root = resolveRoot(opts.root);
    const requested = opts.runtimes ? opts.runtimes.split(",").map((s) => s.trim()).filter(Boolean) : await resolveActiveRuntimes(root);
    if (requested.length === 0) {
      console.error("[FAIL] no runtimes selected. Pass --runtimes <list> or add active adapters under .harness/adapters/.");
      process.exit(1);
      return;
    }
    for (const rt of requested) {
      if (!RUNTIME_WIRINGS[rt]) {
        console.error(`Unknown runtime: ${rt}`);
        process.exit(1);
        return;
      }
    }
    const canonicalMissionPath = path.join(root, ".harness", "missions", missionId, "mission.yaml");
    for (const rt of requested) {
      try {
        await assertFleetAdmission(root, canonicalMissionPath, rt);
      } catch (err) {
        console.error(`[BLOCKED] ${rt}: ${(err as Error).message}`);
        process.exit(1);
        return;
      }
    }
    if (opts.force === true) {
      const mission = await loadMissionFile(canonicalMissionPath);
      for (const rt of requested) {
        console.error(formatCapabilityBypassLine(mission.id, rt));
      }
    } else {
      for (const rt of requested) {
        try {
          await enforceRuntimePreflight(root, canonicalMissionPath, rt, { force: false, strict: opts.strict === true });
        } catch (err) {
          console.error(`[BLOCKED] runtime preflight failed for ${rt}:`);
          console.error(`  error: ${(err as Error).message}`);
          console.error(`  pass --force to bypass this safety check`);
          process.exit(1);
          return;
        }
      }
    }
    const { runMissionAcrossRuntimes, persistRuntimeComparison } = await import("./harness/run-all.js");
    const { createSandbox } = await import("./harness/sandbox.js");
    const canonicalMissionDir = path.join(root, ".harness", "missions", missionId);

    console.log(`Running mission ${missionId} across ${requested.length} runtime(s): ${requested.join(", ")}`);
    const comparison = await runMissionAcrossRuntimes(root, missionId, {
      runtimes: requested,
      runtimeRunner: async (runtime, effectiveRoot, missionPath) => {
        const wiring = RUNTIME_WIRINGS[runtime];
        const res = await wiring.run(effectiveRoot, missionPath);
        return res;
      },
      sandboxOps: {
        create: async (r, { id, missionId: mid }) => {
          const record = await createSandbox(r, { id, missionId: mid });
          return { id: record.id, path: path.resolve(r, record.path) };
        },
      },
      serial: opts.serial === true,
    });

    const reportPath = await persistRuntimeComparison(canonicalMissionDir, comparison);
    const passing = comparison.outcomes.filter((o) => o.status === "succeeded").length;
    const failing = comparison.outcomes.length - passing;
    const label = comparison.agreement ? "AGREEMENT" : "DIVERGENT";
    console.log(`[${label}] ${missionId}`);
    console.log(`runtimes: ${passing} succeeded, ${failing} not`);
    console.log(`report: ${reportPath}`);
    const anyNonSucceeded = comparison.outcomes.some((o) => o.status !== "succeeded");
    if (!comparison.agreement) {
      console.log(`divergent: ${comparison.divergentRuntimes.join(", ")}`);
      process.exit(1);
      return;
    }
    if (anyNonSucceeded) {
      const broken = comparison.outcomes.filter((o) => o.status !== "succeeded").map((o) => `${o.runtime}=${o.status}`);
      console.log(`runtime failures: ${broken.join(", ")}`);
      process.exit(1);
      return;
    }
  });

missionCmd
  .command("run-team")
  .description("Run resource-bounded worker waves in separate worktrees, then mechanically integrate and verify; no leader model is invoked")
  .argument("<mission-id>", "Mission id (must exist in .harness/missions/, with team shape)")
  .option("--root <path>", "Root directory (default: cwd)")
  .option("--base-ref <ref>", "Base git ref for worker / leader worktrees (default: HEAD)")
  .option("--retain", "Preserve worktrees on success (default: cleanup on PASS, preserve on FAIL)")
  .option("--replace", "Archive a previous run's worktrees, branches, and team directory, then relaunch (refused while a live run exists)")
  .option("--strategy <strategy>", "Leader integration strategy: merge|cherry-pick|rebase (default: merge)", "merge")
  .action(async (missionId: string, opts: { root?: string; baseRef?: string; retain?: boolean; replace?: boolean; strategy: string }) => {
    try {
      assertSafeMissionId(missionId);
    } catch (err) {
      console.error(`[FAIL] ${(err as Error).message}`);
      process.exit(1);
      return;
    }
    const validStrategies = ["merge", "cherry-pick", "rebase"] as const;
    if (!validStrategies.includes(opts.strategy as (typeof validStrategies)[number])) {
      console.error(`[FAIL] invalid --strategy: ${opts.strategy}. Valid: ${validStrategies.join("|")}`);
      process.exit(1);
      return;
    }
    const root = resolveRoot(opts.root);
    const canonicalMissionPath = path.join(root, ".harness", "missions", missionId, "mission.yaml");
    let raw: string;
    try {
      raw = await readFileAsync(canonicalMissionPath, "utf-8");
    } catch (err) {
      console.error(`[FAIL] mission file not readable: ${canonicalMissionPath}`);
      console.error(`  error: ${(err as Error).message}`);
      process.exit(1);
      return;
    }
    const parsed = parseYaml(raw) as Record<string, unknown> | null;
    if (!parsed || typeof parsed !== "object") {
      console.error(`[FAIL] mission file has no top-level mapping: ${canonicalMissionPath}`);
      process.exit(1);
      return;
    }
    // UH-71 schema validates the structural mission packet and the team shape,
    // so the typed value below is the single source for dispatch.
    const { validateMission } = await import("./schema/mission.js");
    let validatedMission: MissionDocument;
    try {
      validatedMission = validateMission(parsed);
    } catch (err) {
      console.error(`[FAIL] mission validation failed: ${(err as Error).message}`);
      process.exit(1);
      return;
    }
    if (validatedMission.shape !== "team") {
      console.error(`[FAIL] mission ${missionId} is not a team-shape mission. Add 'shape: team' and a 'team:' block, or use 'uh mission run'.`);
      process.exit(1);
      return;
    }
    if (!validatedMission.team) {
      console.error(`[FAIL] mission ${missionId} declares shape: team but has no 'team:' block.`);
      process.exit(1);
      return;
    }
    const teamMission = {
      id: validatedMission.id,
      team: validatedMission.team,
      integration_report_path: validatedMission.integration_report_path,
    };
    const { runTeamMission } = await import("./harness/team-run.js");
    const { verifyMission } = await import("./harness/verify.js");
    console.log(`Running team mission ${missionId} with ${teamMission.team.workers.length} worker spec(s)`);
    try {
      const result = await runTeamMission(teamMission, root, {
        runnerFor: (adapter) => async (rt, effectiveRoot, missionPath, runtimeOptions) => {
          const wiring = RUNTIME_WIRINGS[adapter];
          if (!wiring) throw new Error(`Unknown adapter: ${adapter}`);
          void rt;
          await assertFleetAdmission(root, missionPath, adapter);
          const recovery = await resolveRuntimeRecoveryPolicy(effectiveRoot, missionPath, adapter);
          return runWithRuntimeRecovery({
            root: runtimeOptions.artifactRoot, runtime: adapter, runId: runtimeOptions.runId,
            ...recovery, onAttempt: runtimeOptions.onAttempt,
            run: (attempt) => wiring.run(effectiveRoot, missionPath, { ...runtimeOptions, ...attempt }),
          });
        },
        verifier: async (workRoot, mid) => verifyMission(workRoot, mid, { useSandbox: false }),
        baseRef: opts.baseRef,
        retainOnSuccess: opts.retain === true,
        replace: opts.replace === true,
        strategy: opts.strategy as "merge" | "cherry-pick" | "rebase",
      });
      // UH-127: PARTIAL is a non-blocking success — M<N workers landed but the
      // integrated subset passed verification. Surfaced distinctly from a full
      // PASS so operators know some workers were dropped.
      const label = result.status === "passed"
        ? "PASS"
        : result.status === "passed_partial"
          ? "PARTIAL"
          : result.status === "blocked"
            ? "BLOCKED"
            : "FAIL";
      console.log(`[${label}] ${missionId}`);
      console.log(`workers: ${result.workers.length}, conflicts: ${result.hadConflicts ? "yes" : "no"}, verification: ${result.verification ? result.verification.status : "not-run"}`);
      console.log(`integration-report: ${result.integrationReportPath}`);
      console.log(`retained: ${result.retained ? "yes" : "no"}`);
      // Exit codes: passed/passed_partial -> 0, blocked -> 2, failed -> 1
      // (UH-72 review F1; UH-127 treats a verified partial as success).
      const exit = result.status === "passed" || result.status === "passed_partial"
        ? 0
        : result.status === "blocked"
          ? 2
          : 1;
      process.exit(exit);
    } catch (err) {
      console.error(`[FAIL] mission run-team error:`);
      console.error(`  error: ${(err as Error).message}`);
      process.exit(1);
    }
  });

async function resolveActiveRuntimes(root: string): Promise<string[]> {
  const entries = await runtimeRegistry.list(root);
  return entries
    .filter((entry) => entry.document.status === "active")
    .map((entry) => entry.document.runtime);
}

// uh sandbox
const sandboxCmd = program
  .command("sandbox")
  .description("Manage mission sandboxes");

sandboxCmd
  .command("create")
  .description("Create a new sandbox bound to a mission")
  .argument("<id>", "Sandbox id")
  .requiredOption("--mission <id>", "Mission id this sandbox belongs to")
  .option("--base <ref>", "Base git ref to branch from (default: HEAD)")
  .option("--backend <name>", "Sandbox backend: git-worktree (default), directory, or container (OpenSandbox-configured; see docs/runbooks/container-sandbox.md)")
  .option("--root <path>", "Root directory (default: cwd)")
  .action(async (id: string, opts: { mission: string; base?: string; backend?: string; root?: string }) => {
    const root = resolveRoot(opts.root);
    try {
      const record = await createSandbox(root, {
        id,
        missionId: opts.mission,
        baseRef: opts.base,
        backend: opts.backend,
      });
      console.log(`[CREATED] ${record.id}`);
      console.log(`  mission: ${record.mission_id}`);
      console.log(`  backend: ${record.backend}`);
      console.log(`  branch: ${record.branch}`);
      console.log(`  base: ${record.base_ref}`);
      console.log(`  path: ${record.path}`);
    } catch (err) {
      console.error(`[FAIL] sandbox create error:`);
      console.error(`  error: ${(err as Error).message}`);
      process.exit(1);
    }
  });

sandboxCmd
  .command("list")
  .description("List registered sandboxes")
  .option("--root <path>", "Root directory (default: cwd)")
  .action(async (opts: { root?: string }) => {
    const root = resolveRoot(opts.root);
    try {
      const entries = await listSandboxes(root);
      if (entries.length === 0) {
        console.log("No sandboxes registered.");
        return;
      }
      for (const entry of entries) {
        console.log(`- ${entry.id} (mission=${entry.mission_id}, status=${entry.status}, backend=${entry.backend})`);
        if (entry.path) {
          console.log(`    path: ${entry.path}`);
        }
      }
    } catch (err) {
      console.error(`[FAIL] sandbox list error:`);
      console.error(`  error: ${(err as Error).message}`);
      process.exit(1);
    }
  });

sandboxCmd
  .command("status")
  .description("Show a sandbox's metadata and working tree status")
  .argument("<id>", "Sandbox id")
  .option("--root <path>", "Root directory (default: cwd)")
  .action(async (id: string, opts: { root?: string }) => {
    const root = resolveRoot(opts.root);
    try {
      const info = await getSandboxStatus(root, id);
      console.log(`- ${info.id}`);
      console.log(`  mission: ${info.mission_id}`);
      console.log(`  status: ${info.status}`);
      console.log(`  branch: ${info.branch}`);
      console.log(`  base: ${info.base_ref}`);
      console.log(`  path: ${info.path}`);
      console.log(`  dirty: ${info.dirty ? "yes" : "no"}`);
      console.log(`  changes: ${info.changes.length}`);
      for (const change of info.changes) {
        console.log(`    ${change}`);
      }
    } catch (err) {
      console.error(`[FAIL] sandbox status error:`);
      console.error(`  error: ${(err as Error).message}`);
      process.exit(1);
    }
  });

sandboxCmd
  .command("discard")
  .description("Remove a sandbox worktree and registry entry")
  .argument("<id>", "Sandbox id")
  .option("--force", "Discard even if the worktree has uncommitted changes")
  .option("--keep-branch", "Preserve the git branch after removing the worktree")
  .option("--root <path>", "Root directory (default: cwd)")
  .action(async (id: string, opts: { force?: boolean; keepBranch?: boolean; root?: string }) => {
    const root = resolveRoot(opts.root);
    try {
      const result = await discardSandbox(root, id, { force: opts.force ?? false, keepBranch: opts.keepBranch ?? false });
      console.log(`[DISCARDED] ${result.id}`);
      console.log(`  removed: ${result.worktree_path}`);
      if (result.branch) {
        console.log(`  branch: ${result.branch} (${result.branch_removed ? "deleted" : "kept"})`);
      }
    } catch (err) {
      console.error(`[FAIL] sandbox discard error:`);
      console.error(`  error: ${(err as Error).message}`);
      process.exit(1);
    }
  });

sandboxCmd
  .command("repair")
  .description("Re-register sandbox directories whose index entry is missing")
  .option("--root <path>", "Root directory (default: cwd)")
  .action(async (opts: { root?: string }) => {
    const root = resolveRoot(opts.root);
    try {
      const repaired = await repairSandboxes(root);
      if (repaired.length === 0) {
        console.log("No sandbox registrations repaired.");
        return;
      }
      for (const entry of repaired) {
        console.log(`[REPAIRED] ${entry.id}`);
        console.log(`  mission: ${entry.mission_id}`);
        console.log(`  backend: ${entry.backend}`);
        if (entry.branch) {
          console.log(`  branch: ${entry.branch}`);
        }
        console.log(`  path: ${entry.path}`);
        console.log(`  status: ${entry.status}`);
      }
    } catch (err) {
      console.error(`[FAIL] sandbox repair error:`);
      console.error(`  error: ${(err as Error).message}`);
      process.exit(1);
    }
  });

// uh skill
const skillCmd = program
  .command("skill")
  .description("Manage skills: SKILL.md-backed reusable capabilities");

skillCmd
  .command("add")
  .description("Register a skill from a directory containing SKILL.md")
  .argument("<dir>", "Path to skill directory containing SKILL.md")
  .option("--root <path>", "Root directory (default: cwd)")
  .action(async (dir: string, opts: { root?: string }) => {
    const root = resolveRoot(opts.root);
    try {
      const result = await addSkill(root, dir);
      console.log(`[ADDED] ${result.id}`);
      console.log(`  path: ${result.path}`);
      console.log(`  index: ${result.index_path}`);
    } catch (err) {
      console.error(`[FAIL] skill add error:`);
      console.error(`  error: ${(err as Error).message}`);
      process.exit(1);
    }
  });

skillCmd
  .command("list")
  .description("List registered skills")
  .option("--root <path>", "Root directory (default: cwd)")
  .action(async (opts: { root?: string }) => {
    const root = resolveRoot(opts.root);
    try {
      const skills = await listSkills(root);
      if (skills.length === 0) {
        console.log("No skills registered.");
        return;
      }
      for (const s of skills) {
        console.log(`- ${s.id} (${s.name})`);
        if (s.description) {
          console.log(`    description: ${s.description}`);
        }
        if (s.path) {
          console.log(`    path: ${s.path}`);
        }
        if (s.triggers.length > 0) {
          console.log(`    triggers: ${s.triggers.join(", ")}`);
        }
        if (s.prerequisites.length > 0) {
          console.log(`    prerequisites: ${s.prerequisites.join(", ")}`);
        }
        if (s.related.length > 0) {
          console.log(`    related: ${s.related.join(", ")}`);
        }
      }
    } catch (err) {
      console.error(`[FAIL] skill list error:`);
      console.error(`  error: ${(err as Error).message}`);
      process.exit(1);
    }
  });

skillCmd
  .command("check")
  .description("Re-validate an indexed skill against its on-disk SKILL.md")
  .argument("<id>", "Skill id")
  .option("--root <path>", "Root directory (default: cwd)")
  .action(async (id: string, opts: { root?: string }) => {
    const root = resolveRoot(opts.root);
    try {
      const result = await checkSkill(root, id);
      if (result.ok) {
        console.log(`[OK] ${result.id}`);
        return;
      }
      console.log(`[DRIFT] ${result.id}`);
      for (const e of result.errors) {
        console.log(`  error: ${e}`);
      }
      process.exit(1);
    } catch (err) {
      console.error(`[FAIL] skill check error:`);
      console.error(`  error: ${(err as Error).message}`);
      process.exit(1);
    }
  });

function printValidationResult(r: { valid: boolean; path: string; schema_version: string | null; errors: string[]; warnings?: string[] }) {
  const status = r.valid ? "PASS" : "FAIL";
  console.log(`[${status}] ${r.path}`);
  if (r.schema_version) {
    console.log(`  schema: ${r.schema_version}`);
  }
  for (const e of r.errors) {
    console.log(`  error: ${e}`);
  }
  for (const w of r.warnings ?? []) {
    console.log(`  warn: ${w}`);
  }
}

function parseScreenshotSize(raw: string | undefined): { width: number; height: number } {
  if (!raw) return { width: 120, height: 36 };
  const match = raw.match(/^([1-9]\d*)x([1-9]\d*)$/);
  if (!match) {
    throw new Error(`Invalid --screenshot-size \"${raw}\"; expected <cols>x<rows>`);
  }
  return { width: Number.parseInt(match[1], 10), height: Number.parseInt(match[2], 10) };
}

// uh tui
const tuiCmd = program
  .command("tui")
  .description("Open the interactive terminal UI (Mission Control)")
  .option("--root <path>", "Root directory (default: cwd)")
  .option("--once", "Render one frame and exit (CI / smoke / docs)")
  .option("--screenshot <path>", "Capture one deterministic text frame to PATH (CI / docs)")
  .option("--screenshot-size <cols>x<rows>", "Screenshot frame size (default: 120x36)")
  .action(async (opts: { root?: string; once?: boolean; screenshot?: string; screenshotSize?: string }) => {
    const bunCheck = spawnSync("bun", ["--version"], { stdio: "ignore" });
    if (bunCheck.status !== 0) {
      process.stderr.write(
        "uh tui requires Bun. Install: curl -fsSL https://bun.sh/install | bash\n",
      );
      process.exit(1);
    }
    const dashboardEntry = fileURLToPath(new URL("../src/tui/index.tsx", import.meta.url));
    const screenshotEntry = fileURLToPath(new URL("../src/tui/screenshot.tsx", import.meta.url));
    const cwd = opts.root ? path.resolve(opts.root) : process.cwd();
    const args = ["--preload", "@opentui/solid/preload", opts.screenshot ? screenshotEntry : dashboardEntry];
    if (opts.once) args.push("--once");
    const env: NodeJS.ProcessEnv = { ...process.env, UH_TUI_ROOT: cwd };
    if (opts.screenshot) {
      const output = path.resolve(opts.screenshot);
      const size = parseScreenshotSize(opts.screenshotSize);
      env.UH_TUI_SCREENSHOT = output;
      env.UH_TUI_SCREENSHOT_WIDTH = String(size.width);
      env.UH_TUI_SCREENSHOT_HEIGHT = String(size.height);
    }
    const child = spawn("bun", args, {
      stdio: "inherit",
      cwd,
      env,
    });
    child.on("exit", (code, signal) => {
      if (signal) {
        process.exit(1);
      } else {
        process.exit(code ?? 0);
      }
    });
    child.on("error", (err) => {
      process.stderr.write(`uh tui: failed to spawn bun: ${err.message}\n`);
      process.exit(1);
    });
  });

// uh tui screenshot — UH-51 automated capture pipeline. Boots
// src/tui/screenshot.tsx with --view / --out / --width / --height flags
// so docs and CI can grab deterministic per-view frames without needing
// a real terminal.
tuiCmd
  .command("screenshot")
  .description("Render a single TUI view to ANSI text (CI / docs)")
  .requiredOption(
    "--view <name>",
    "View to capture: overview | missions | sandboxes | workflows",
  )
  .option("--out <path>", "Output file path; use `-` or omit for stdout")
  .option("--root <path>", "Root directory (default: cwd)")
  .option("--size <cols>x<rows>", "Frame size (default: 120x36)")
  .action(async (opts: { view: string; out?: string; root?: string; size?: string }) => {
    const bunCheck = spawnSync("bun", ["--version"], { stdio: "ignore" });
    if (bunCheck.status !== 0) {
      process.stderr.write(
        "uh tui screenshot requires Bun. Install: curl -fsSL https://bun.sh/install | bash\n",
      );
      process.exit(1);
    }
    const screenshotEntry = fileURLToPath(new URL("../src/tui/screenshot.tsx", import.meta.url));
    const cwd = opts.root ? path.resolve(opts.root) : process.cwd();
    const size = parseScreenshotSize(opts.size);
    const args = [
      "--preload",
      "@opentui/solid/preload",
      screenshotEntry,
      "--view",
      opts.view,
      "--width",
      String(size.width),
      "--height",
      String(size.height),
    ];
    if (opts.out) {
      args.push("--out", opts.out === "-" ? "-" : path.resolve(opts.out));
    }
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      UH_TUI_ROOT: cwd,
      UH_TUI_HEADLESS: "1",
    };
    const child = spawn("bun", args, { stdio: "inherit", cwd, env });
    child.on("exit", (code, signal) => {
      process.exit(signal ? 1 : code ?? 0);
    });
    child.on("error", (err) => {
      process.stderr.write(`uh tui screenshot: failed to spawn bun: ${err.message}\n`);
      process.exit(1);
    });
  });

// uh mcp
const mcpCmd = program
  .command("mcp")
  .description("Model Context Protocol (MCP) server commands");

mcpCmd
  .command("serve")
  .description("Serve newline-delimited JSON-RPC MCP server on stdin/stdout")
  .option("--root <path>", "Root directory (default: cwd)")
  .action(async (opts: { root?: string }) => {
    const root = resolveRoot(opts.root);
    try {
      await serveMcpStdio({ root, version: VERSION }, process.stdin, process.stdout);
      process.exit(0);
    } catch (err) {
      process.stderr.write(`uh mcp serve: ${err instanceof Error ? err.message : String(err)}\n`);
      process.exit(1);
    }
  });

await program.parseAsync();
