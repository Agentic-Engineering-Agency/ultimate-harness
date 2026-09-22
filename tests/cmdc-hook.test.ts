import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { stringify } from "yaml";
import { initializeHarness } from "../src/harness/init.js";
import { addAdapter } from "../src/harness/adapter-add.js";
import { runCommandCode } from "../src/adapters/command-code.js";
import { ToolGuardPolicySchema, ToolGuardArtifactSchema, policyFromArtifact } from "../src/schema/runtime-control.js";

function withResolvers<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function runCmdcHook(input: unknown, env: NodeJS.ProcessEnv): Promise<{ code: number | null; stdout: string; stderr: string }> {
  const hook = fileURLToPath(new URL("../src/extensions/tool-guard/cmdc-hook.ts", import.meta.url));
  const { promise, resolve, reject } = withResolvers<{ code: number | null; stdout: string; stderr: string }>();
  const child = spawn(process.execPath, ["--import", "tsx", hook], { env, stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", chunk => { stdout += String(chunk); });
  child.stderr.on("data", chunk => { stderr += String(chunk); });
  child.on("error", reject);
  child.on("close", code => resolve({ code, stdout, stderr }));
  child.stdin.end(JSON.stringify(input));
  return promise;
}

async function harnessFixture(): Promise<{ root: string; missionPath: string }> {
  const root = await mkdtemp(path.join(tmpdir(), "uh-cmdc-hook-"));
  await initializeHarness(root);
  await addAdapter(root, "command-code");
  const missionPath = path.join(root, ".harness", "missions", "one", "mission.yaml");
  await mkdir(path.dirname(missionPath), { recursive: true });
  await writeFile(missionPath, stringify({
    schema_version: "uh.mission.v0",
    id: "one",
    name: "Command Code guard hook",
    description: "Exercise the Command Code guard hook against its own artifact.",
    workflow_profile: "research-docs",
    guard: { write_roots: ["out"] },
    runtime_config_overrides: { model: "qwen/qwen3.8-flash" },
  }));
  return { root, missionPath };
}

/**
 * Let the adapter write its own `tool-guard.json` by running it with a stubbed
 * runtime, so the hook is exercised against the real artifact (including
 * `written_files`) rather than a hand-written fixture.
 */
async function writeAdapterArtifact(root: string, missionPath: string, runId: string): Promise<string> {
  await runCommandCode(root, missionPath, {
    runId,
    runner: async () => ({ stdout: "", stderr: "", exitCode: 1, timedOut: false }),
    collectDiff: async () => ({ patch: "" }),
  });
  return path.join(path.dirname(missionPath), "runs", runId, "tool-guard.json");
}

let snapshotRoot: string;
let previousDist: string | undefined;
let previousCache: string | undefined;

beforeEach(async () => {
  snapshotRoot = await mkdtemp(path.join(tmpdir(), "uh-cmdc-hook-snapshot-"));
  const hook = path.join(snapshotRoot, "dist", "extensions", "tool-guard", "cmdc-hook.js");
  await mkdir(path.dirname(hook), { recursive: true });
  await writeFile(hook, "export default function () {}\n");
  previousDist = process.env.UH_HARNESS_DIST;
  previousCache = process.env.UH_RUNTIME_SNAPSHOT_CACHE;
  process.env.UH_HARNESS_DIST = path.join(snapshotRoot, "dist");
  process.env.UH_RUNTIME_SNAPSHOT_CACHE = path.join(snapshotRoot, "cache");
});

afterEach(async () => {
  if (previousDist === undefined) delete process.env.UH_HARNESS_DIST; else process.env.UH_HARNESS_DIST = previousDist;
  if (previousCache === undefined) delete process.env.UH_RUNTIME_SNAPSHOT_CACHE; else process.env.UH_RUNTIME_SNAPSHOT_CACHE = previousCache;
  await rm(snapshotRoot, { recursive: true, force: true });
});

describe("Command Code guard hook", () => {
  test("the adapter-written artifact allows and logs a read, denies and logs a write outside, and allows and logs a write inside", async () => {
    const { root, missionPath } = await harnessFixture();
    try {
      const policyPath = await writeAdapterArtifact(root, missionPath, "guarded-run");
      const artifact = JSON.parse(await readFile(policyPath, "utf8")) as { written_files?: Record<string, string> };
      expect(artifact.written_files).toBeDefined();
      expect(artifact.written_files?.[".commandcode/settings.json"]).toMatch(/^[a-f0-9]{64}$/);

      const logPath = path.join(root, "tool-guard.log");
      const hookEnv = { ...process.env, UH_TOOL_GUARD_POLICY: policyPath, UH_TOOL_GUARD_LOG: logPath };

      // A read is allowed and logged with its call id.
      const allowResult = await runCmdcHook({
        tool_name: "read_file",
        tool_use_id: "call_read_12345",
        tool_input: { file_path: path.join(root, "out", "allowed.txt") },
      }, hookEnv);
      expect(allowResult.stdout.trim()).toBe("");

      // A write outside the write roots is denied and logged.
      const denyResult = await runCmdcHook({
        tool_name: "write_file",
        tool_use_id: "call_write_out_67890",
        tool_input: { file_path: path.join(root, "outside", "unauthorized.txt") },
      }, hookEnv);
      const denyOutput = JSON.parse(denyResult.stdout.trim()) as {
        hookSpecificOutput?: { permissionDecision?: string };
      };
      expect(denyOutput.hookSpecificOutput?.permissionDecision).toBe("deny");

      // A write inside the write roots is allowed and logged.
      const insideResult = await runCmdcHook({
        tool_name: "write_file",
        tool_use_id: "call_write_in_24680",
        tool_input: { file_path: path.join(root, "out", "inside.txt") },
      }, hookEnv);
      expect(insideResult.stdout.trim()).toBe("");

      const rawLog = await readFile(logPath, "utf8");
      const entries = rawLog.trim().split(/\r?\n/).map(l => JSON.parse(l) as Record<string, unknown>);

      expect(entries).toHaveLength(3);
      expect(entries[0].call_id).toBe("call_read_12345");
      expect(entries[0].class).toBe("allow");
      expect(entries[0].tool).toBe("read_file");

      expect(entries[1].call_id).toBe("call_write_out_67890");
      expect(entries[1].class).toBe("write_outside");
      expect(entries[1].tool).toBe("write_file");
      expect(entries[1].reason).toContain("CONTRACT: write only under out");

      expect(entries[2].call_id).toBe("call_write_in_24680");
      expect(entries[2].class).toBe("allow");
      expect(entries[2].tool).toBe("write_file");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("an artifact with one unknown extra field still loads", async () => {
    const { root, missionPath } = await harnessFixture();
    try {
      const policyPath = await writeAdapterArtifact(root, missionPath, "extra-field-run");
      const artifact = JSON.parse(await readFile(policyPath, "utf8")) as Record<string, unknown>;
      artifact.unknown_extra_field = "tolerated";
      await writeFile(policyPath, JSON.stringify(artifact));

      const logPath = path.join(root, "tool-guard.log");
      const hookEnv = { ...process.env, UH_TOOL_GUARD_POLICY: policyPath, UH_TOOL_GUARD_LOG: logPath };

      const allowResult = await runCmdcHook({
        tool_name: "read_file",
        tool_use_id: "call_read_extra",
        tool_input: { file_path: path.join(root, "out", "allowed.txt") },
      }, hookEnv);
      expect(allowResult.stdout.trim()).toBe("");

      const entries = (await readFile(logPath, "utf8")).trim().split(/\r?\n/).map(l => JSON.parse(l) as Record<string, unknown>);
      expect(entries).toHaveLength(1);
      expect(entries[0].call_id).toBe("call_read_extra");
      expect(entries[0].class).toBe("allow");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("the applied policy carries every key of ToolGuardPolicySchema", () => {
    const distinct = ToolGuardPolicySchema.parse({
      write_roots: ["only"],
      deny_git_mutations: false,
      deny_package_installs: false,
      deny_network_clients: false,
      agent_clients: ["solo"],
      allow_native_subagents: true,
    });
    const artifact = ToolGuardArtifactSchema.parse({
      schema_version: "uh.tool-guard.v0",
      ...distinct,
      worker_root: "/worker/root",
      protected_paths: ["out"],
    });
    const applied = policyFromArtifact(artifact) as Record<string, unknown>;

    // A key added to ToolGuardPolicySchema must reach the applied policy; the
    // distinct values ensure a key copied from the wrong field would not match.
    for (const key of Object.keys(ToolGuardPolicySchema.shape)) {
      expect(applied).toHaveProperty(key);
      expect(applied[key]).toEqual((artifact as Record<string, unknown>)[key]);
    }
    expect(applied.worker_root).toBe("/worker/root");
    expect(applied.protected_paths).toEqual(["out"]);
  });
});
