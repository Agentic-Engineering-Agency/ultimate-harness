#!/usr/bin/env node
import { Command } from "commander";
import { initializeHarness } from "./harness/init.js";
import { getStatus } from "./harness/status.js";
import { validateFile, validateRootProject, validateAllWorkflows } from "./harness/validate.js";
import { resolveRoot } from "./harness/paths.js";
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
      console.log(`Adapters configured: ${s.adapters_count}`);
      console.log(`Workflow profiles: ${s.workflow_profiles_count}`);
      console.log(`Active missions: ${s.active_missions_count}`);
      console.log(`Recent audit events: ${s.recent_audit_events}`);
    } catch (err) {
      console.error((err as Error).message);
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
