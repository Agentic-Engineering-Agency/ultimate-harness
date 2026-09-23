import { describe, expect, test, beforeEach, afterEach } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { stringify } from "yaml";
import { initializeHarness } from "../src/harness/init.js";
import { addAdapter } from "../src/harness/adapter-add.js";

const execFileP = promisify(execFile);

const ORCHESTRATOR_LINE =
  "Sandbox: none (orchestrator in the project root; writes limited to its guard's write roots)";

let TEST_ROOT: string;

beforeEach(async () => {
  TEST_ROOT = await mkdtemp(join(tmpdir(), "uh-test-orchestrator-root-"));
  await initializeHarness(TEST_ROOT);
});

afterEach(async () => {
  if (TEST_ROOT) {
    await rm(TEST_ROOT, { recursive: true, force: true });
  }
});

async function runUh(args: string[]) {
  return execFileP(process.execPath, ["--import", "tsx", "src/cli.ts", ...args], {
    cwd: process.cwd(),
    timeout: 30_000,
    env: {
      ...process.env,
      UH_TELEMETRY: "",
      UH_POSTHOG_API_KEY: "",
    },
  });
}

async function runUhFailure(args: string[]) {
  try {
    const result = await runUh(args);
    throw new Error(`expected uh ${args.join(" ")} to fail, got stdout=${result.stdout} stderr=${result.stderr}`);
  } catch (err) {
    const e = err as Error & { code?: number; stdout?: string; stderr?: string };
    expect(e.code).not.toBe(0);
    return { stdout: e.stdout ?? "", stderr: e.stderr ?? "", code: e.code };
  }
}

async function writeMission(
  id: string,
  runtimeConfigOverrides: Record<string, unknown>,
  guard?: Record<string, unknown>,
): Promise<string> {
  const missionDir = join(TEST_ROOT, ".harness", "missions", id);
  await mkdir(missionDir, { recursive: true });
  const missionPath = join(missionDir, "mission.yaml");
  const mission: Record<string, unknown> = {
    schema_version: "uh.mission.v0",
    id,
    title: `Orchestrator root mission ${id}`,
    objective: "Exercise orchestrator project-root execution",
    workflow_profile: "spec-first-feature",
    runtime_config_overrides: runtimeConfigOverrides,
  };
  if (guard !== undefined) mission.guard = guard;
  await writeFile(missionPath, stringify(mission), "utf-8");
  return missionPath;
}

describe("orchestrator missions run in the project root without --no-sandbox", () => {
  test("an orchestrator mission reaches the runtime dispatch without --no-sandbox", async () => {
    const missionPath = await writeMission("o-root", { role: "orchestrator" }, { write_roots: ["out"] });

    const result = await runUhFailure([
      "mission", "run", missionPath,
      "--runtime", "hermes", "--force", "--root", TEST_ROOT,
    ]);

    expect(result.stdout).toContain("Running mission:");
    expect(result.stdout).toContain(ORCHESTRATOR_LINE);
    expect(`${result.stdout}${result.stderr}`).not.toContain("has no bound sandbox");
    // Reached the runtime dispatch (no hermes manifest in this root) instead of
    // being refused by sandbox routing — and no model is ever invoked.
    expect(`${result.stdout}${result.stderr}`).toContain("Adapter manifest not found");
  });

  test("a worker mission is still refused without a bound sandbox", async () => {
    const missionPath = await writeMission("o-worker", { role: "worker" }, { write_roots: ["out"] });

    const refusal = await runUhFailure([
      "mission", "run", missionPath,
      "--runtime", "hermes", "--force", "--root", TEST_ROOT,
    ]);

    expect(refusal.code).toBe(2);
    expect(refusal.stderr).toContain(
      '[BLOCKED] mission o-worker has no bound sandbox; create one with "uh sandbox create <sandbox-id> --mission o-worker" or pass --no-sandbox to run in the project root',
    );
    expect(refusal.stdout).not.toContain("Running mission:");
    expect(refusal.stdout).not.toContain("orchestrator in the project root");
  });

  test("an orchestrator without write roots is still refused by the adapter's guard check", async () => {
    await addAdapter(TEST_ROOT, "claude-code");
    // An empty guard resolves write_roots to the default ["."], which covers the
    // repository the orchestrator would run in.
    const missionPath = await writeMission("o-nowrite", { role: "orchestrator" }, {});

    const refusal = await runUhFailure([
      "mission", "run", missionPath,
      "--runtime", "claude-code", "--force", "--root", TEST_ROOT,
    ]);

    expect(refusal.stdout).toContain(ORCHESTRATOR_LINE);
    expect(`${refusal.stdout}${refusal.stderr}`).toContain("[FAIL] mission run error:");
    expect(`${refusal.stdout}${refusal.stderr}`).toContain("whole repository");
    expect(`${refusal.stdout}${refusal.stderr}`).not.toContain("has no bound sandbox");
  });
});
