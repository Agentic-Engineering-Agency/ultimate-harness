#!/usr/bin/env node
import { Command } from "commander";
import { initializeHarness } from "./harness/init.js";
import { getStatus } from "./harness/status.js";
import { assertSafeMissionId, createMission } from "./harness/mission.js";
import { parseIssueRef, parseRequiredCheck, proposeMission, proposeMissionFromSpec, type ProposeIssueRef, type ProposeRequiredCheck } from "./harness/propose.js";
import { DEFAULT_VERIFY_COMMAND_TIMEOUT_MS, verifyMission } from "./harness/verify.js";
import { promoteMission, type PromoteDecision } from "./harness/promote.js";
import { validateFile, validateRootProject, validateAllWorkflows, validateAllMissions } from "./harness/validate.js";
import { resolveRoot, missionDir } from "./harness/paths.js";
import { checkHermes, dryRunHermes, runHermes } from "./adapters/hermes.js";
import { dryRunCodex, runCodex } from "./adapters/codex.js";
import { dryRunOhMyPi, runOhMyPi } from "./adapters/oh-my-pi.js";
import { dryRunHermesProxy, runHermesProxy } from "./adapters/hermes-proxy.js";
import { dryRunOpenRouter, runOpenRouter } from "./adapters/openrouter.js";
import { dryRunAnthropic, runAnthropic } from "./adapters/anthropic.js";
import { dryRunPi, runPi } from "./adapters/pi.js";
import { runtimeRegistry } from "./harness/registry.js";
import { assertRuntimeCapabilities, loadMissionFile } from "./harness/capabilities.js";
import { assertRuntimeRequirements } from "./harness/runtime-requirements.js";
import { chooseAdapter, formatAutoRouteExplain } from "./harness/auto-route.js";
import { CAPABILITIES, listAdapterIds, type AdapterId } from "./adapters/capabilities/index.js";
import { forecastCost } from "./harness/cost-forecast.js";
import { probeHermesProxyCapabilities } from "./adapters/capabilities/hermes-proxy-probe.js";
import { COST_CLASSES } from "./schema/adapter-capabilities.js";
import { findBoundSandbox } from "./harness/verify.js";
import { appendRuntimeCancelledEvent } from "./harness/runtime-events.js";
import { cancelMissionRunViaPlugin, defaultPluginApiBase, MissionCancelError } from "./harness/mission-cancel.js";
import { parseRuntimeConfigOverridesJson } from "./harness/runtime-config-overrides.js";
import { parseScaffoldLang, scaffoldTestsFromSpec } from "./harness/test-scaffold.js";
import { assertValidRunId } from "./harness/run-id.js";
import { parse as parseYaml } from "yaml";
import { spawn, spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { readFile as readFileAsync, writeFile as writeFileAsync } from "node:fs/promises";
import { getSpecTemplate, listSpecTemplates } from "./harness/spec-templates.js";
import { judgeSpecAdherence, oneShotOpenAI } from "./harness/spec-judge.js";
import { installTelemetryHooks } from "./harness/telemetry.js";

import {
  createSandbox,
  discardSandbox,
  getSandboxStatus,
  listSandboxes,
} from "./harness/sandbox.js";
import { addAdapter, listAdapterTemplates } from "./harness/adapter-add.js";
import { addSkill, checkSkill, listSkills } from "./harness/skill.js";
import { recordManualVerdict } from "./harness/verdict.js";
import type { VerdictValue } from "./schema/artifacts.js";

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
  worktree: boolean;
  session_id_passthrough: boolean;
  errors: string[];
};
interface RuntimeRunOptions {
  /** UH-81 — CLI-time runtime_config overrides spread on top of the mission's own overrides. */
  extraRuntimeConfigOverrides?: Record<string, unknown>;
  /** UH-82 — explicit per-run id; generated when absent. */
  runId?: string;
}
interface RuntimeWiring {
  dryRun(root: string, missionPath: string): Promise<RuntimeDryRunResult>;
  run(root: string, missionPath: string, options?: RuntimeRunOptions): Promise<RuntimeRunResult>;
  surfaceBlocked: boolean;
}
const RUNTIME_WIRINGS: Record<string, RuntimeWiring> = {
  hermes: { dryRun: dryRunHermes, run: (root, missionPath, opts) => runHermes(root, missionPath, opts), surfaceBlocked: false },
  codex: { dryRun: dryRunCodex, run: (root, missionPath, opts) => runCodex(root, missionPath, opts), surfaceBlocked: true },
  "oh-my-pi": { dryRun: dryRunOhMyPi, run: (root, missionPath, opts) => runOhMyPi(root, missionPath, opts), surfaceBlocked: true },
  "hermes-proxy": { dryRun: dryRunHermesProxy, run: (root, missionPath, opts) => runHermesProxy(root, missionPath, opts), surfaceBlocked: true },
  openrouter: { dryRun: dryRunOpenRouter, run: (root, missionPath, opts) => runOpenRouter(root, missionPath, opts), surfaceBlocked: true },
  anthropic: { dryRun: dryRunAnthropic, run: (root, missionPath, opts) => runAnthropic(root, missionPath, opts), surfaceBlocked: true },
  pi: { dryRun: dryRunPi, run: (root, missionPath, opts) => runPi(root, missionPath, opts), surfaceBlocked: true },
};

/**
 * Auto-route a mission invocation into its bound sandbox worktree.
 *
 * Mirrors `verifyMission`'s sandbox-routing: when a mission has an active
 * sandbox entry in `.harness/sandboxes/index.yaml`, the adapter is invoked
 * with the worktree path as `root` so prompts, artifacts, and diff capture
 * all see the worktree, not the canonical repo. Returns the original root
 * untouched when `--no-sandbox` is passed or no bound sandbox exists.
 */
async function resolveMissionRoot(
  root: string,
  missionPath: string,
  useSandbox: boolean,
): Promise<{ effectiveRoot: string; sandbox?: { id: string; path: string; backend: string } }> {
  if (!useSandbox) return { effectiveRoot: root };
  let missionId: string;
  try {
    const raw = await readFileAsync(missionPath, "utf-8");
    const parsed = parseYaml(raw) as { id?: unknown } | null;
    if (!parsed || typeof parsed !== "object" || typeof parsed.id !== "string" || parsed.id.length === 0) {
      return { effectiveRoot: root };
    }
    missionId = parsed.id;
  } catch {
    return { effectiveRoot: root };
  }
  const sandbox = await findBoundSandbox(root, missionId);
  if (!sandbox) return { effectiveRoot: root };
  return { effectiveRoot: sandbox.path, sandbox };
}

async function enforceRuntimeCapabilities(
  root: string,
  missionPath: string,
  runtime: string,
  force: boolean,
): Promise<void> {
  if (force) return;
  await assertRuntimeCapabilities(root, missionPath, runtime);
}

/** Preflight after runtime is chosen (`--runtime` or post `--auto` routing). */
async function enforceRuntimePreflight(
  root: string,
  missionPath: string,
  runtime: string,
  force: boolean,
): Promise<void> {
  if (force) return;
  await enforceRuntimeCapabilities(root, missionPath, runtime, false);
  await assertRuntimeRequirements(missionPath, runtime);
}

async function installRuntimeCancelledEventHandler(
  root: string,
  missionPath: string,
  runtime: string,
): Promise<() => void> {
  const mission = await loadMissionFile(missionPath);
  let handled = false;
  const onSigterm = (): void => {
    if (handled) return;
    handled = true;
    appendRuntimeCancelledEvent({
      root,
      missionId: mission.id,
      runtime,
      signal: "SIGTERM",
    });
    process.exit(143);
  };
  process.once("SIGTERM", onSigterm);
  return () => process.removeListener("SIGTERM", onSigterm);
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
    } catch (err) {
      console.error((err as Error).message);
      process.exit(1);
    }
  });

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
      console.log(`  cost_class: ${c.cost_class}  max_context_tokens: ${c.max_context_tokens}  sandbox: ${c.sandbox}`);
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

missionCmd
  .command("dry-run")
  .description("Show what command would be executed without running it")
  .argument("[file]", "Mission file path")
  .option("--runtime <runtime>", "Runtime to use (default: hermes)")
  .option("--root <path>", "Root directory (default: cwd)")
  .option("--no-sandbox", "Do not auto-route into the mission's bound sandbox worktree")
  .option("--force", "Bypass mission capability matching for this runtime")
  .action(async (file: string | undefined, opts: { runtime?: string; root?: string; sandbox: boolean; force?: boolean }) => {
    const root = resolveRoot(opts.root);
    const runtime = opts.runtime || "hermes";
    const filePath = file || `${root}/examples/missions/documentation-spine.yaml`;

    const wiring = RUNTIME_WIRINGS[runtime];
    if (!wiring) {
      console.error(`Unknown runtime: ${runtime}`);
      process.exit(1);
      return;
    }
    try {
      await enforceRuntimePreflight(root, filePath, runtime, opts.force === true);
    } catch (err) {
      console.error(`[BLOCKED] runtime preflight failed:`);
      console.error(`  error: ${(err as Error).message}`);
      console.error(`  pass --force to bypass this safety check`);
      process.exit(1);
      return;
    }
    const routing = await resolveMissionRoot(root, filePath, opts.sandbox);
    if (routing.sandbox?.backend === "container") {
      console.error(`[BLOCKED] container sandbox mission dry-run requires an OpenSandbox adapter-execution bridge; refusing host execution for sandbox ${routing.sandbox.id}`);
      process.exit(1);
      return;
    }
    if (routing.sandbox) {
      console.log(`Sandbox: ${routing.sandbox.id} (${routing.sandbox.path})`);
    }
    const result = await wiring.dryRun(routing.effectiveRoot, filePath);
    if (result.errors.length > 0) {
      console.log("[FAIL] dry-run errors:");
      for (const e of result.errors) {
        console.log(`  error: ${e}`);
      }
      process.exit(1);
    }
    console.log(`Command: ${result.command} ${result.args.join(" ")}`);
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
  .option("--force", "Bypass mission capability matching for this runtime")
  .option(
    "--runtime-config-overrides <json>",
    "JSON object of runtime_config overrides applied on top of the mission file (e.g. '{\"model\":\"gpt-5\"}')",
  )
  .option("--run-id <id>", "Explicit run id; auto-generated if omitted")
  .option("--auto", "Auto-select the cheapest installed adapter that satisfies the mission's runtime_requirements")
  .option("--explain", "With --auto, print the adapter decision matrix")
  .action(async (file: string | undefined, opts: { runtime?: string; root?: string; sandbox: boolean; force?: boolean; runtimeConfigOverrides?: string; runId?: string; auto?: boolean; explain?: boolean }) => {
    const root = resolveRoot(opts.root);
    const filePath = file || `${root}/examples/missions/documentation-spine.yaml`;

    if (opts.auto && opts.runtime) {
      console.error("[FAIL] --auto and --runtime are mutually exclusive");
      process.exit(1);
      return;
    }
    let runtime = opts.runtime || "hermes";
    if (opts.auto) {
      try {
        const installed = (await runtimeRegistry.list(root))
          .map((entry) => entry.id)
          .filter((id): id is AdapterId => id in CAPABILITIES);
        const mission = await loadMissionFile(filePath);
        const decision = chooseAdapter(mission, installed);
        if (opts.explain) {
          console.log(formatAutoRouteExplain(decision));
          console.log("");
        }
        if (!decision.adapter) {
          console.error(`[BLOCKED] auto-route: ${decision.reason}`);
          process.exit(1);
          return;
        }
        runtime = decision.adapter;
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
      await enforceRuntimePreflight(root, filePath, runtime, opts.force === true);
    } catch (err) {
      console.error(`[BLOCKED] runtime preflight failed:`);
      console.error(`  error: ${(err as Error).message}`);
      console.error(`  pass --force to bypass this safety check`);
      process.exit(1);
      return;
    }
    const routing = await resolveMissionRoot(root, filePath, opts.sandbox);
    if (routing.sandbox?.backend === "container") {
      console.error(`[BLOCKED] container sandbox mission run requires an OpenSandbox adapter-execution bridge; refusing host execution for sandbox ${routing.sandbox.id}`);
      process.exit(1);
      return;
    }
    let extraRuntimeConfigOverrides: Record<string, unknown> | undefined;
    if (opts.runtimeConfigOverrides !== undefined) {
      try {
        extraRuntimeConfigOverrides = parseRuntimeConfigOverridesJson(opts.runtimeConfigOverrides);
      } catch (e) {
        console.error(`[BLOCKED] ${(e as Error).message}`);
        process.exit(1);
        return;
      }
    }
    console.log(`Running mission: ${filePath}`);
    console.log(`Runtime: ${runtime}`);
    if (opts.runId) {
      console.log(`Run id: ${opts.runId}`);
    }
    if (routing.sandbox) {
      console.log(`Sandbox: ${routing.sandbox.id} (${routing.sandbox.path})`);
    }
    if (extraRuntimeConfigOverrides) {
      const keys = Object.keys(extraRuntimeConfigOverrides);
      console.log(`Runtime config overrides: ${keys.length} key(s) — ${keys.join(", ")}`);
    }
    console.log("");
    let result: { exitCode: number; stdout: string; stderr: string; result?: { status?: string; errors?: string[] }; runId?: string };
    let uninstallCancelHandler: (() => void) | null = null;
    try {
      uninstallCancelHandler = await installRuntimeCancelledEventHandler(root, filePath, runtime);
      result = await wiring.run(routing.effectiveRoot, filePath, { extraRuntimeConfigOverrides, runId: opts.runId });
    } catch (err) {
      console.log("[FAIL] mission run error:");
      console.log(`  error: ${(err as Error).message}`);
      process.exit(1);
      return;
    } finally {
      if (uninstallCancelHandler) uninstallCancelHandler();
    }
    if (!opts.runId && result.runId) {
      console.log(`Run id: ${result.runId}`);
    }
    if (result.stdout) {
      console.log(result.stdout);
    }
    if (result.stderr) {
      console.error(result.stderr);
    }
    if (wiring.surfaceBlocked && result.result?.status === "blocked") {
      console.log(`[BLOCKED] mission classified as blocked`);
      for (const e of result.result.errors ?? []) {
        console.log(`  error: ${e}`);
      }
      process.exit(1);
    }
    if (result.exitCode !== 0) {
      console.log(`[FAIL] mission exited with code ${result.exitCode}`);
      process.exit(result.exitCode);
    }
  });

missionCmd
  .command("cancel")
  .description("Cancel an in-flight mission run via the Hermes plugin API")
  .requiredOption("--mission <id>", "Mission id (validated; run lookup uses --run-id)")
  .requiredOption("--run-id <id>", "Run id to cancel")
  .option("--root <path>", "Root directory (default: cwd)")
  .option("--plugin-url <url>", "Hermes plugin API base URL", defaultPluginApiBase())
  .action(async (opts: { mission: string; runId: string; root?: string; pluginUrl: string }) => {
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
      const result = await cancelMissionRunViaPlugin(opts.pluginUrl, opts.runId);
      console.log(`Cancelled run ${opts.runId} for mission ${opts.mission} (status: ${result.status})`);
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
  .option("--force", "Bypass mission capability matching for selected runtimes")
  .action(async (missionId: string, opts: { runtimes?: string; root?: string; serial?: boolean; force?: boolean }) => {
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
    if (opts.force !== true) {
      for (const rt of requested) {
        try {
          await enforceRuntimePreflight(root, canonicalMissionPath, rt, false);
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
  .description("Run a team-shape mission: fan out to N workers in their own worktrees, then ask the leader to integrate")
  .argument("<mission-id>", "Mission id (must exist in .harness/missions/, with team shape)")
  .option("--root <path>", "Root directory (default: cwd)")
  .option("--base-ref <ref>", "Base git ref for worker / leader worktrees (default: HEAD)")
  .option("--retain", "Preserve worktrees on success (default: cleanup on PASS, preserve on FAIL)")
  .option("--strategy <strategy>", "Leader integration strategy: merge|cherry-pick|rebase (default: merge)", "merge")
  .action(async (missionId: string, opts: { root?: string; baseRef?: string; retain?: boolean; strategy: string }) => {
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
    // UH-71 schema validates the structural mission packet. The team-specific
    // `shape`/`team` fields ride alongside and are validated separately by
    // the team-run planner.
    const { validateMission } = await import("./schema/mission.js");
    try {
      validateMission(parsed);
    } catch (err) {
      console.error(`[FAIL] mission validation failed: ${(err as Error).message}`);
      process.exit(1);
      return;
    }
    if ((parsed as { shape?: unknown }).shape !== "team") {
      console.error(`[FAIL] mission ${missionId} is not a team-shape mission. Add 'shape: team' and a 'team:' block, or use 'uh mission run'.`);
      process.exit(1);
      return;
    }
    const team = (parsed as { team?: unknown }).team;
    if (!team || typeof team !== "object") {
      console.error(`[FAIL] mission ${missionId} declares shape: team but has no 'team:' block.`);
      process.exit(1);
      return;
    }
    // Codex P2: validate workers is an array before dereferencing .length.
    // A malformed mission (shape:team with no workers, or workers not an
    // array) used to throw a raw TypeError on the log line below; now it
    // surfaces as a normal CLI error.
    const workersRaw = (team as { workers?: unknown }).workers;
    if (!Array.isArray(workersRaw) || workersRaw.length === 0) {
      console.error(`[FAIL] mission ${missionId} has shape: team but team.workers is missing, empty, or not an array.`);
      process.exit(1);
      return;
    }
    const leaderRaw = (team as { leader?: unknown }).leader;
    if (!leaderRaw || typeof leaderRaw !== "object") {
      console.error(`[FAIL] mission ${missionId} has shape: team but team.leader is missing.`);
      process.exit(1);
      return;
    }
    const teamMission = {
      id: missionId,
      team: team as { workers: { role: string; adapter: string; count?: number }[]; leader: { adapter: string } },
      integration_report_path: (parsed as { integration_report_path?: string }).integration_report_path,
    };
    const { runTeamMission } = await import("./harness/team-run.js");
    const { verifyMission } = await import("./harness/verify.js");
    console.log(`Running team mission ${missionId} with ${teamMission.team.workers.length} worker spec(s)`);
    try {
      const result = await runTeamMission(teamMission, root, {
        runnerFor: (adapter) => async (rt, effectiveRoot, missionPath) => {
          const wiring = RUNTIME_WIRINGS[adapter];
          if (!wiring) throw new Error(`Unknown adapter: ${adapter}`);
          void rt;
          return wiring.run(effectiveRoot, missionPath);
        },
        verifier: async (workRoot, mid) => verifyMission(workRoot, mid, { useSandbox: false }),
        baseRef: opts.baseRef,
        retainOnSuccess: opts.retain === true,
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

await program.parseAsync();
