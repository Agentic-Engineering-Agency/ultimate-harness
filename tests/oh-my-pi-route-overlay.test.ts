import { afterAll, afterEach, beforeEach, describe, expect, test } from "vitest";
import { mkdtempSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parse } from "yaml";
import { initializeHarness } from "../src/harness/init.js";
import { planOhMyPiRun, runOhMyPi, type OhMyPiRunner } from "../src/adapters/oh-my-pi.js";
import { writeGuardHookFixture } from "./guard-hook-fixtures.js";

const ROOT = mkdtempSync(join(tmpdir(), "uh-test-omp-route-overlay-"));
const SNAPSHOT_ROOT = join(ROOT, "snapshot");
const SNAPSHOT_DIST = join(SNAPSHOT_ROOT, "dist");
const MODEL = "openai-codex/gpt-5.6-luna";
let previousDist: string | undefined;
let previousCache: string | undefined;

async function mission(id: string, extra = ""): Promise<string> {
  const dir = join(ROOT, ".harness", "missions", id);
  await mkdir(dir, { recursive: true });
  const file = join(dir, "mission.yaml");
  await writeFile(file, `schema_version: uh.mission.v0
id: ${id}
name: Overlay mission
workflow_profile: research-docs
verification:
  checks: []
${extra}`, "utf-8");
  return file;
}

beforeEach(async () => {
  await rm(ROOT, { recursive: true, force: true });
  await mkdir(ROOT, { recursive: true });
  await initializeHarness(ROOT);
  await writeFile(join(ROOT, ".harness", "adapters", "oh-my-pi.yaml"), `schema_version: uh.adapter.v0
id: oh-my-pi
name: oh-my-pi
runtime: oh-my-pi
capabilities:
  - cli-execution
status: experimental
config:
  cli_command: omp
  worktree_mode: false
  pass_session_id: false
  runtime_config:
    mode: json
`, "utf-8");
  const hook = join(SNAPSHOT_DIST, "extensions", "tool-guard", "omp.js");
  await mkdir(join(SNAPSHOT_DIST, "extensions", "tool-guard"), { recursive: true });
  await writeGuardHookFixture(hook);
  previousDist = process.env.UH_HARNESS_DIST;
  previousCache = process.env.UH_RUNTIME_SNAPSHOT_CACHE;
  process.env.UH_HARNESS_DIST = SNAPSHOT_DIST;
  process.env.UH_RUNTIME_SNAPSHOT_CACHE = join(SNAPSHOT_ROOT, "cache");
});
afterEach(async () => {
  if (previousDist === undefined) delete process.env.UH_HARNESS_DIST; else process.env.UH_HARNESS_DIST = previousDist;
  if (previousCache === undefined) delete process.env.UH_RUNTIME_SNAPSHOT_CACHE; else process.env.UH_RUNTIME_SNAPSHOT_CACHE = previousCache;
  await rm(ROOT, { recursive: true, force: true });
});

describe("oh-my-pi route overlay", () => {
  test("an assigned model pins every role and removes the native sub-agent tool", async () => {
    const plan = await planOhMyPiRun(ROOT, await mission("pinned", `runtime_config_overrides:\n  model: ${MODEL}\n`));
    const overlay = plan.runtimeOverlay as { modelRoles: Record<string, string>; task: Record<string, unknown>; advisor: Record<string, unknown> };
    for (const role of ["default", "smol", "slow", "plan", "task", "commit", "advisor", "tiny", "vision", "designer"]) {
      expect(overlay.modelRoles[role]).toBe(MODEL);
    }
    expect(overlay.task).toEqual({ eager: "default", maxRecursionDepth: 0 });
    expect(overlay.advisor).toEqual({ enabled: false });
  });

  test("without an assigned model roles are untouched but sub-agents stay off", async () => {
    const plan = await planOhMyPiRun(ROOT, await mission("unpinned"));
    const overlay = plan.runtimeOverlay as Record<string, unknown>;
    expect(overlay.modelRoles).toBeUndefined();
    expect(overlay.task).toEqual({ eager: "default", maxRecursionDepth: 0 });
  });

  test("allow_native_subagents keeps one level of delegation on pinned roles, never eager", async () => {
    const plan = await planOhMyPiRun(ROOT, await mission("delegating", `guard:\n  allow_native_subagents: true\nruntime_config_overrides:\n  model: ${MODEL}\n`));
    const overlay = plan.runtimeOverlay as { modelRoles: Record<string, string>; task: Record<string, unknown> };
    expect(overlay.task).toEqual({ eager: "default", maxRecursionDepth: 1 });
    expect(overlay.modelRoles.smol).toBe(MODEL);
  });

  test("the run writes the overlay beside its artifacts and passes it before the prompt", async () => {
    const file = await mission("launched", `runtime_config_overrides:\n  model: ${MODEL}\n`);
    let seen: string[] = [];
    const final = JSON.stringify({ type: "message_end", message: { role: "assistant", content: [{ type: "text", text: "done" }], provider: "openai-codex", model: "gpt-5.6-luna" } });
    const runner: OhMyPiRunner = async (input) => { seen = input.args; return { stdout: `${final}\n`, stderr: "", exitCode: 0, timedOut: false }; };
    await runOhMyPi(ROOT, file, { runner, collectDiff: async () => ({ patch: "" }), runId: "overlay-run" });
    const flag = seen.indexOf("--config");
    expect(flag).toBeGreaterThan(-1);
    expect(flag).toBeLessThan(seen.indexOf("--no-title"));
    const overlayPath = seen[flag + 1];
    expect(overlayPath.replaceAll("\\", "/")).toContain(".harness/missions/launched/runs/overlay-run/omp-overlay.yml");
    const written = parse(await readFile(overlayPath, "utf-8")) as { modelRoles: Record<string, string>; task: { maxRecursionDepth: number } };
    expect(written.modelRoles.smol).toBe(MODEL);
    expect(written.task.maxRecursionDepth).toBe(0);
  });
});
afterAll(async () => {
  await rm(ROOT, { recursive: true, force: true });
});
