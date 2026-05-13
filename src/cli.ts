#!/usr/bin/env node
import { Command } from "commander";
import { initializeHarness } from "./harness/init.js";
import { getStatus } from "./harness/status.js";
import { validateFile, validateRootProject, validateAllWorkflows } from "./harness/validate.js";
import { resolveRoot } from "./harness/paths.js";
import { checkHermes, dryRunHermes, runHermes } from "./adapters/hermes.js";
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
  .action(async (file: string | undefined, opts: { root?: string; allWorkflows?: boolean }) => {
    const root = resolveRoot(opts.root);
    if (opts.allWorkflows) {
      const results = await validateAllWorkflows(root);
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
      console.log(`Recent audit events: ${s.recent_audit_events}`);
    } catch (err) {
      console.error((err as Error).message);
      process.exit(1);
    }
  });

// uh adapter
const adapterCmd = program
  .command("adapter")
  .description("Manage runtime adapters");

adapterCmd
  .command("check")
  .description("Check if a runtime adapter is available and configured")
  .argument("[runtime]", "Runtime to check (e.g. hermes)")
  .option("--root <path>", "Root directory (default: cwd)")
  .action(async (runtime: string | undefined, opts: { root?: string }) => {
    const root = resolveRoot(opts.root);
    if (!runtime || runtime === "hermes") {
      const result = await checkHermes(root);
      if (result.errors.length === 0 && result.found) {
        console.log(`[PASS] hermes adapter`);
        console.log(`  runtime: ${result.runtime}`);
        console.log(`  version: ${result.version}`);
      } else {
        console.log(`[FAIL] hermes adapter`);
        for (const e of result.errors) {
          console.log(`  error: ${e}`);
        }
        process.exit(1);
      }
    } else {
      console.error(`Unknown runtime: ${runtime}`);
      process.exit(1);
    }
  });

// uh mission
const missionCmd = program
  .command("mission")
  .description("Execute missions against configured runtimes");

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
