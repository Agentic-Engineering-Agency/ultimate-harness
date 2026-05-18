#!/usr/bin/env node
import { Command } from "commander";
import { initializeHarness } from "./harness/init.js";
import { getStatus } from "./harness/status.js";
import { createMission } from "./harness/mission.js";
import { parseIssueRef, parseRequiredCheck, proposeMission, type ProposeIssueRef, type ProposeRequiredCheck } from "./harness/propose.js";
import { DEFAULT_VERIFY_COMMAND_TIMEOUT_MS, verifyMission } from "./harness/verify.js";
import { promoteMission, type PromoteDecision } from "./harness/promote.js";
import { validateFile, validateRootProject, validateAllWorkflows, validateAllMissions } from "./harness/validate.js";
import { resolveRoot } from "./harness/paths.js";
import { checkHermes, dryRunHermes, runHermes } from "./adapters/hermes.js";
import { dryRunCodex, runCodex } from "./adapters/codex.js";
import { dryRunOhMyPi, runOhMyPi } from "./adapters/oh-my-pi.js";
import { dryRunHermesProxy, runHermesProxy } from "./adapters/hermes-proxy.js";
import { runtimeRegistry } from "./harness/registry.js";
import { findBoundSandbox } from "./harness/verify.js";
import { parse as parseYaml } from "yaml";
import { spawn, spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readFile as readFileAsync } from "node:fs/promises";
import {
  createSandbox,
  discardSandbox,
  getSandboxStatus,
  listSandboxes,
} from "./harness/sandbox.js";
import { addAdapter, listAdapterTemplates } from "./harness/adapter-add.js";
import { addSkill, checkSkill, listSkills } from "./harness/skill.js";
const VERSION = "0.0.0";

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
};
type RuntimeDryRunResult = {
  command: string;
  args: string[];
  prompt: string;
  worktree: boolean;
  session_id_passthrough: boolean;
  errors: string[];
};
interface RuntimeWiring {
  dryRun(root: string, missionPath: string): Promise<RuntimeDryRunResult>;
  run(root: string, missionPath: string): Promise<RuntimeRunResult>;
  surfaceBlocked: boolean;
}
const RUNTIME_WIRINGS: Record<string, RuntimeWiring> = {
  hermes: { dryRun: dryRunHermes, run: runHermes, surfaceBlocked: false },
  codex: { dryRun: dryRunCodex, run: runCodex, surfaceBlocked: true },
  "oh-my-pi": { dryRun: dryRunOhMyPi, run: runOhMyPi, surfaceBlocked: true },
  "hermes-proxy": { dryRun: dryRunHermesProxy, run: runHermesProxy, surfaceBlocked: true },
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
): Promise<{ effectiveRoot: string; sandbox?: { id: string; path: string } }> {
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

const program = new Command();

program
  .name("uh")
  .description("Ultimate Harness CLI")
  .version(VERSION);

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
  .description("Validate a harness YAML artifact")
  .argument("[file]", "Path to YAML file (default: .harness/project.yaml)")
  .option("--root <path>", "Root directory (default: cwd)")
  .option("--all-workflows", "Validate all workflow profiles")
  .option("--all-missions", "Validate all mission files")
  .action(async (file: string | undefined, opts: { root?: string; allWorkflows?: boolean; allMissions?: boolean }) => {
    const root = resolveRoot(opts.root);
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
  .description("Report the current state of the harness project")
  .option("--root <path>", "Root directory (default: cwd)")
  .action(async (opts: { root?: string }) => {
    const root = resolveRoot(opts.root);
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
  .description("Generate a mission packet from request/issue metadata")
  .argument("<id>", "Mission id")
  .requiredOption("--title <title>", "Mission title")
  .requiredOption("--workflow <profile>", "Workflow profile")
  .requiredOption("--objective <text>", "Mission objective")
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
  .action(async (id: string, opts: {
    title: string;
    workflow: string;
    objective: string;
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

missionCmd
  .command("dry-run")
  .description("Show what command would be executed without running it")
  .argument("[file]", "Mission file path")
  .option("--runtime <runtime>", "Runtime to use (default: hermes)")
  .option("--root <path>", "Root directory (default: cwd)")
  .option("--no-sandbox", "Do not auto-route into the mission's bound sandbox worktree")
  .action(async (file: string | undefined, opts: { runtime?: string; root?: string; sandbox: boolean }) => {
    const root = resolveRoot(opts.root);
    const runtime = opts.runtime || "hermes";
    const filePath = file || `${root}/examples/missions/documentation-spine.yaml`;

    const wiring = RUNTIME_WIRINGS[runtime];
    if (!wiring) {
      console.error(`Unknown runtime: ${runtime}`);
      process.exit(1);
      return;
    }
    const routing = await resolveMissionRoot(root, filePath, opts.sandbox);
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
  .action(async (file: string | undefined, opts: { runtime?: string; root?: string; sandbox: boolean }) => {
    const root = resolveRoot(opts.root);
    const runtime = opts.runtime || "hermes";
    const filePath = file || `${root}/examples/missions/documentation-spine.yaml`;

    const wiring = RUNTIME_WIRINGS[runtime];
    if (!wiring) {
      console.error(`Unknown runtime: ${runtime}`);
      process.exit(1);
      return;
    }
    const routing = await resolveMissionRoot(root, filePath, opts.sandbox);
    console.log(`Running mission: ${filePath}`);
    console.log(`Runtime: ${runtime}`);
    if (routing.sandbox) {
      console.log(`Sandbox: ${routing.sandbox.id} (${routing.sandbox.path})`);
    }
    console.log("");
    let result: { exitCode: number; stdout: string; stderr: string; result?: { status?: string; errors?: string[] } };
    try {
      result = await wiring.run(routing.effectiveRoot, filePath);
    } catch (err) {
      console.log("[FAIL] mission run error:");
      console.log(`  error: ${(err as Error).message}`);
      process.exit(1);
      return;
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

// uh sandbox
const sandboxCmd = program
  .command("sandbox")
  .description("Manage git worktree sandboxes");

sandboxCmd
  .command("create")
  .description("Create a new git worktree sandbox bound to a mission")
  .argument("<id>", "Sandbox id")
  .requiredOption("--mission <id>", "Mission id this sandbox belongs to")
  .option("--base <ref>", "Base git ref to branch from (default: HEAD)")
  .option("--root <path>", "Root directory (default: cwd)")
  .action(async (id: string, opts: { mission: string; base?: string; root?: string }) => {
    const root = resolveRoot(opts.root);
    try {
      const record = await createSandbox(root, {
        id,
        missionId: opts.mission,
        baseRef: opts.base,
      });
      console.log(`[CREATED] ${record.id}`);
      console.log(`  mission: ${record.mission_id}`);
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

function printValidationResult(r: { valid: boolean; path: string; schema_version: string | null; errors: string[] }) {
  const status = r.valid ? "PASS" : "FAIL";
  console.log(`[${status}] ${r.path}`);
  if (r.schema_version) {
    console.log(`  schema: ${r.schema_version}`);
  }
  for (const e of r.errors) {
    console.log(`  error: ${e}`);
  }
}

// uh tui
program
  .command("tui")
  .description("Open the interactive terminal UI (Mission Control)")
  .option("--root <path>", "Root directory (default: cwd)")
  .option("--once", "Render one frame and exit (CI / smoke / docs)")
  .action(async (opts: { root?: string; once?: boolean }) => {
    const bunCheck = spawnSync("bun", ["--version"], { stdio: "ignore" });
    if (bunCheck.status !== 0) {
      process.stderr.write(
        "uh tui requires Bun. Install: curl -fsSL https://bun.sh/install | bash\n",
      );
      process.exit(1);
    }
    const entry = fileURLToPath(new URL("../src/tui/index.tsx", import.meta.url));
    const cwd = opts.root ? path.resolve(opts.root) : process.cwd();
    const args = ["--preload", "@opentui/solid/preload", entry];
    if (opts.once) args.push("--once");
    const child = spawn("bun", args, {
      stdio: "inherit",
      cwd,
      env: { ...process.env, UH_TUI_ROOT: cwd },
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

program.parse();
