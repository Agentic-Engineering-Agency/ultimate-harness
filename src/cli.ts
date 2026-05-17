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
import { runtimeRegistry } from "./harness/registry.js";
import {
  createSandbox,
  discardSandbox,
  getSandboxStatus,
  listSandboxes,
} from "./harness/sandbox.js";
const VERSION = "0.0.0";

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
  .action(async (missionId: string, opts: { root?: string; timeoutMs?: string }) => {
    const root = resolveRoot(opts.root);
    try {
      const commandTimeoutMs = opts.timeoutMs === undefined ? undefined : parsePositiveIntegerOption("--timeout-ms", opts.timeoutMs);
      const result = await verifyMission(root, missionId, { commandTimeoutMs });
      const label = result.status === "passed" ? "PASS" : result.status === "failed" ? "FAIL" : "BLOCKED";
      console.log(`[${label}] ${result.mission_id}`);
      console.log(`checks: ${result.checks_passed} passed, ${result.checks_failed} failed, ${result.checks_blocked} blocked`);
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
  .option("--required-check <name[=command]>", "Required verification check; repeatable", collectRequiredCheckOption, [] as ProposeRequiredCheck[])
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
  .action(async (file: string | undefined, opts: { runtime?: string; root?: string }) => {
    const root = resolveRoot(opts.root);
    const runtime = opts.runtime || "hermes";
    const filePath = file || `${root}/examples/missions/documentation-spine.yaml`;

    if (runtime === "hermes") {
      const result = await dryRunHermes(root, filePath);
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
    } else {
      console.error(`Unknown runtime: ${runtime}`);
      process.exit(1);
    }
  });

missionCmd
  .command("run")
  .description("Execute a mission against a configured runtime")
  .argument("[file]", "Mission file path")
  .option("--runtime <runtime>", "Runtime to use (default: hermes)")
  .option("--root <path>", "Root directory (default: cwd)")
  .action(async (file: string | undefined, opts: { runtime?: string; root?: string }) => {
    const root = resolveRoot(opts.root);
    const runtime = opts.runtime || "hermes";
    const filePath = file || `${root}/examples/missions/documentation-spine.yaml`;

    if (runtime === "hermes") {
      console.log(`Running mission: ${filePath}`);
      console.log(`Runtime: ${runtime}`);
      console.log("");
      let result: Awaited<ReturnType<typeof runHermes>>;
      try {
        result = await runHermes(root, filePath);
      } catch (err) {
        console.log("[FAIL] mission run error:");
        console.log(`  error: ${(err as Error).message}`);
        process.exit(1);
      }
      if (result.stdout) {
        console.log(result.stdout);
      }
      if (result.stderr) {
        console.error(result.stderr);
      }
      if (result.exitCode !== 0) {
        console.log(`[FAIL] mission exited with code ${result.exitCode}`);
        process.exit(result.exitCode);
      }
    } else {
      console.error(`Unknown runtime: ${runtime}`);
      process.exit(1);
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
  .option("--root <path>", "Root directory (default: cwd)")
  .action(async (id: string, opts: { force?: boolean; root?: string }) => {
    const root = resolveRoot(opts.root);
    try {
      const result = await discardSandbox(root, id, { force: opts.force ?? false });
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

program.parse();
