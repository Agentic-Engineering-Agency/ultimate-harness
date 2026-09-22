import { test, expect, beforeEach, afterEach } from "vitest";
import { existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { stringify, parse } from "yaml";
import { initializeHarness } from "../src/harness/init.js";
import { addAdapter } from "../src/harness/adapter-add.js";
import { runCommandCode, planCommandCodeRun, dryRunCommandCode, checkCommandCode, buildCommandCodeProbeArgs, parseCommandCodeVersion, CommandCodeRuntimeConfigSchema } from "../src/adapters/command-code.js";
import { validateAdapter, type AdapterDocument } from "../src/schema/adapter.js";

async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), "uh-command-code-"));
  await initializeHarness(root);
  await addAdapter(root, "command-code");
  const missionPath = path.join(root, ".harness", "missions", "one", "mission.yaml");
  await mkdir(path.dirname(missionPath), { recursive: true });
  await writeFile(missionPath, stringify({ schema_version: "uh.mission.v0", id: "one", title: "Synthetic adapter check",
    objective: "Preserve outputs", workflow_profile: "research-docs",
    runtime_config_overrides: { model: "qwen/qwen3.8-flash", resume_session: "existing-session", permission_mode: "yolo" } }));
  return { root, missionPath };
}

// The guard hook is published into a content-addressed cache from the build
// output. Point both at a temporary fixture so the suite neither needs a real
// build nor writes to the per-user cache.
let snapshotRoot: string;
let previousDist: string | undefined;
let previousCache: string | undefined;

beforeEach(async () => {
  snapshotRoot = await mkdtemp(path.join(tmpdir(), "uh-command-code-snapshot-"));
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

test("refuses a mission without an explicit model assignment", async () => {
  const { root, missionPath } = await fixture();
  try {
    await expect(planCommandCodeRun(root, missionPath, { extraRuntimeConfigOverrides: { model: "" } })).rejects.toThrow();
  } finally { await rm(root, { recursive: true, force: true }); }
});
test("guard policy selects yolo and records guard permission mode", async () => {
  const { root, missionPath } = await fixture();
  try {
    const mission = parse(await readFile(missionPath, "utf8")) as Record<string, unknown>;
    delete (mission.runtime_config_overrides as Record<string, unknown>).permission_mode;
    mission.guard = { write_roots: ["out"] };
    await writeFile(missionPath, stringify(mission));
    const plan = await planCommandCodeRun(root, missionPath);
    expect(plan.permission_mode).toBe("guard");
    expect(plan.args).toContain("--yolo");
    let seenMode: string | undefined;
    await runCommandCode(root, missionPath, {
      runId: "guard-mode",
      runner: async input => { seenMode = input.permissionMode; return { stdout: "", stderr: "", exitCode: 1, timedOut: false }; },
      collectDiff: async () => ({ patch: "" }),
    });
    expect(seenMode).toBe("guard");
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("explicit yolo permission mode adds yolo without a guard", async () => {
  const { root, missionPath } = await fixture();
  try {
    const plan = await planCommandCodeRun(root, missionPath);
    expect(plan.permission_mode).toBe("yolo");
    expect(plan.args).toContain("--yolo");
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("missing guard and permission mode refuses before process spawn", async () => {
  const { root, missionPath } = await fixture();
  try {
    const mission = parse(await readFile(missionPath, "utf8")) as Record<string, unknown>;
    delete (mission.runtime_config_overrides as Record<string, unknown>).permission_mode;
    await writeFile(missionPath, stringify(mission));
    let spawned = false;
    await expect(planCommandCodeRun(root, missionPath)).rejects.toThrow(/guard policy.*permission_mode.*yolo.*prompt/i);
    await expect(runCommandCode(root, missionPath, {
      runner: async () => { spawned = true; return { stdout: "", stderr: "", exitCode: 0, timedOut: false }; },
    })).rejects.toThrow(/guard policy.*permission_mode.*yolo.*prompt/i);
    expect(spawned).toBe(false);
  } finally { await rm(root, { recursive: true, force: true }); }
});
test("custom absolute cli command still refuses without permission mode and launches with yolo", async () => {
  const { root, missionPath } = await fixture();
  try {
    const adapterPath = path.join(root, ".harness", "adapters", "command-code.yaml");
    const adapter = parse(await readFile(adapterPath, "utf8")) as Record<string, unknown>;
    (adapter.config as Record<string, unknown>).cli_command = process.execPath;
    await writeFile(adapterPath, stringify(adapter));
    const mission = parse(await readFile(missionPath, "utf8")) as Record<string, unknown>;
    const runtimeConfig = mission.runtime_config_overrides as Record<string, unknown>;
    delete runtimeConfig.permission_mode;
    await writeFile(missionPath, stringify(mission));
    await expect(planCommandCodeRun(root, missionPath)).rejects.toThrow(/guard policy.*permission_mode.*yolo.*prompt/i);
    let launched = false;
    runtimeConfig.permission_mode = "yolo";
    await writeFile(missionPath, stringify(mission));
    await runCommandCode(root, missionPath, {
      runId: "custom-command-yolo",
      runner: async input => { launched = true; expect(input.command).toBe(process.execPath); return { stdout: "", stderr: "", exitCode: 1, timedOut: false }; },
      collectDiff: async () => ({ patch: "" }),
    });
    expect(launched).toBe(true);
  } finally { await rm(root, { recursive: true, force: true }); }
});


test("native finalText and cumulative usage become canonical facts without double counting", async () => {
  const { root, missionPath } = await fixture();
  try {
    const stdout = [
      { type: "event", event: { type: "model_request_start", model: "qwen/qwen3.8-flash" } },
      { type: "event", event: { type: "turn_end", usage: { inputTokens: 10, outputTokens: 2 } } },
      { type: "event", event: { type: "run_end", result: { finalText: "Complete", stopReason: "end_turn", usage: { inputTokens: 10, outputTokens: 2 } } } },
      { type: "result", subtype: "success", finalText: "Complete", stopReason: "end_turn", usage: { inputTokens: 10, outputTokens: 2 } },
    ].map(value => JSON.stringify(value)).join("\n");
    const result = await runCommandCode(root, missionPath, { runId: "observed-run",
      runner: async () => ({ stdout, stderr: "", exitCode: 0, timedOut: false }), collectDiff: async () => ({ patch: "" }) });
    expect(result.result).toMatchObject({ status: "passed", provider: "qwen", model: "qwen3.8-flash", usage: { input_tokens: 10, output_tokens: 2, source: "runtime", provider: "qwen", model: "qwen3.8-flash" } });
    expect(result.result.cost_usd).toBeUndefined();
    const saved = parse(await readFile(path.join(path.dirname(missionPath), "runs", "observed-run", "runtime-result.yaml"), "utf8"));
    expect(saved).toEqual(result.result);
    const mismatched = await runCommandCode(root, missionPath, { runId: "wrong-route",
      extraRuntimeConfigOverrides: { model: "different/assignment" },
      runner: async () => ({ stdout, stderr: "", exitCode: 0, timedOut: false }), collectDiff: async () => ({ patch: "" }) });
    expect(mismatched.exitCode).not.toBe(0);
    expect(mismatched.result).toMatchObject({ status: "failed", provider: "qwen", model: "qwen3.8-flash", usage: { input_tokens: 10, output_tokens: 2 } });
  } finally { await rm(root, { recursive: true, force: true }); }
});
test("attests provider/model and aggregates Command Code turn usage", async () => {
  const { root, missionPath } = await fixture();
  try {
    const stdout = [
      { type: "event", event: { type: "model_request_start", model: "z-ai/glm-5.3-flash" } },
      { type: "event", event: { type: "turn_end", usage: { inputTokens: 11, outputTokens: 3, cacheReadTokens: 5, cacheWriteTokens: 1, totalTokens: 14 } } },
      { type: "event", event: { type: "turn_end", usage: { inputTokens: 7, outputTokens: 2, cacheReadTokens: 4, cacheWriteTokens: 0, totalTokens: 9 } } },
      { type: "event", event: { type: "run_end", result: { finalText: "Complete", stopReason: "end_turn" } } },
    ].map(value => JSON.stringify(value)).join("\n");
    const result = await runCommandCode(root, missionPath, {
      runId: "attested-usage",
      runner: async () => ({ stdout, stderr: "", exitCode: 0, timedOut: false }),
      collectDiff: async () => ({ patch: "" }),
    });
    expect(result.result).toMatchObject({
      provider: "z-ai",
      model: "glm-5.3-flash",
      usage: { input_tokens: 18, output_tokens: 5, cache_read_tokens: 9, cache_write_tokens: 1, total_tokens: 23, provider: "z-ai", model: "glm-5.3-flash" },
    });
    expect(result.result.cost_usd).toBeUndefined();
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("max-turns native failure cannot become success from exit zero and completed-looking text", async () => {
  const { root, missionPath } = await fixture();
  try {
    const result = await runCommandCode(root, missionPath, { runner: async () => ({
      stdout: JSON.stringify({ type: "event", event: { type: "run_end", result: { finalText: "DONE", stopReason: "max_turns" } } }),
      stderr: "", exitCode: 0, timedOut: false }), collectDiff: async () => ({ patch: "" }) });
    expect(result.result.status).toBe("failed");
    expect(result.exitCode).not.toBe(0);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("limits.max_turns plans --max-turns and an explicit top-level max_turns wins", async () => {
  const { root, missionPath } = await fixture();
  try {
    const mission = parse(await readFile(missionPath, "utf8")) as Record<string, unknown>;
    const overrides = mission.runtime_config_overrides as Record<string, unknown>;
    overrides.limits = { max_turns: 200 };
    await writeFile(missionPath, stringify(mission));
    const planned = await planCommandCodeRun(root, missionPath);
    expect(planned.args.indexOf("--max-turns")).toBeGreaterThan(-1);
    expect(planned.args[planned.args.indexOf("--max-turns") + 1]).toBe("200");
    expect(planned.native_default_turn_cap).toBeUndefined();

    overrides.max_turns = 150;
    await writeFile(missionPath, stringify(mission));
    const explicit = await planCommandCodeRun(root, missionPath);
    expect(explicit.args[explicit.args.indexOf("--max-turns") + 1]).toBe("150");
    expect(explicit.native_default_turn_cap).toBeUndefined();
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("a deadline grace plan marks the attempt as grace for supervision", async () => {
  const { root, missionPath } = await fixture();
  try {
    const mission = parse(await readFile(missionPath, "utf8")) as Record<string, unknown>;
    const overrides = mission.runtime_config_overrides as Record<string, unknown>;
    overrides.recovery_grace = true;
    overrides.recovery = { max_resumes: 0, notes: "Preserve the findings already gathered.", on_deadline: { grace_turns: 2, grace_timeout_ms: 300000 } };
    await writeFile(missionPath, stringify(mission));
    const runOnce = async (runId: string): Promise<Record<string, unknown> | undefined> => {
      let seen: Record<string, unknown> | undefined;
      await runCommandCode(root, missionPath, { runId,
        runner: async input => { seen = input.onDeadline as Record<string, unknown> | undefined; return { stdout: "", stderr: "", exitCode: 1, timedOut: false }; },
        collectDiff: async () => ({ patch: "" }) });
      return seen;
    };
    expect(await runOnce("grace-marker")).toMatchObject({ grace: true, grace_turns: 2, grace_timeout_ms: 300000 });

    delete overrides.recovery_grace;
    await writeFile(missionPath, stringify(mission));
    expect(await runOnce("plain-marker")).not.toHaveProperty("grace");
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("a grace attempt whose expected native cap ends it settles by its deliverable", async () => {
  const { root, missionPath } = await fixture();
  try {
    const mission = parse(await readFile(missionPath, "utf8")) as Record<string, unknown>;
    const overrides = mission.runtime_config_overrides as Record<string, unknown>;
    overrides.model = "deepseek/deepseek-v4.1-flash";
    overrides.recovery_grace = true;
    overrides.recovery = { max_resumes: 0, notes: "Preserve the findings already gathered.", on_deadline: { grace_turns: 2, grace_timeout_ms: 300000 } };
    await writeFile(missionPath, stringify(mission));
    const stdout = await readFile(fileURLToPath(new URL("./fixtures/runtime-events/command-code-native-turn-cap.ndjson", import.meta.url)), "utf8");
    const result = await runCommandCode(root, missionPath, { runId: "grace-cap",
      runner: async () => ({ stdout, stderr: "", exitCode: 8, timedOut: false }),
      collectDiff: async () => ({ patch: "" }) });
    expect(result.result).toMatchObject({
      status: "passed",
      completion: "incomplete",
      exit_code: 8,
      exit_code_ignored_reason: "runtime exited non-zero after completed native terminal event",
    });
    expect(result.result.errors).toEqual([]);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("a native cap supervision stopped cannot settle passed on a clean terminal and exit zero", async () => {
  const { root, missionPath } = await fixture();
  try {
    const stdout = [
      { type: "event", event: { type: "model_request_start", model: "qwen/qwen3.8-flash" } },
      { type: "result", subtype: "max_turns", num_turns: 2, finalText: "completed just before the cap" },
    ].map(value => JSON.stringify(value)).join("\n");
    const result = await runCommandCode(root, missionPath, { runId: "supervision-cap",
      runner: async () => ({ stdout, stderr: "", exitCode: 0, timedOut: false, nativeTerminal: true,
        supervisionStopCode: "turn_limit", nativeTerminalFailure: "Runtime reported failure (max_turns)" }),
      collectDiff: async () => ({ patch: "" }) });
    expect(result.result.status).toBe("failed");
    expect(result.exitCode).not.toBe(0);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("a mission without a turn cap passes no flag and records the native default in the plan", async () => {
  const { root, missionPath } = await fixture();
  try {
    const plan = await planCommandCodeRun(root, missionPath);
    expect(plan.args).not.toContain("--max-turns");
    expect(plan.native_default_turn_cap).toBe(100);
    const planned = await dryRunCommandCode(root, missionPath);
    expect(planned.native_default_turn_cap).toBe(100);
  } finally { await rm(root, { recursive: true, force: true }); }
});
test("guard policy artifacts and Command Code hook preserve existing settings", async () => {
  const { root, missionPath } = await fixture();
  try {
    const mission = parse(await readFile(missionPath, "utf8")) as Record<string, unknown>;
    mission.guard = { write_roots: ["out"] };
    await writeFile(missionPath, stringify(mission));
    const settingsPath = path.join(root, ".commandcode", "settings.json");
    await mkdir(path.dirname(settingsPath), { recursive: true });
    await writeFile(settingsPath, JSON.stringify({ permissions: { defaultMode: "default" }, custom: { keep: true } }));
    let seenEnv: NodeJS.ProcessEnv | undefined;
    const stdout = JSON.stringify({ type: "event", event: { type: "run_end", result: { finalText: "Complete", stopReason: "end_turn" } } });
    await runCommandCode(root, missionPath, {
      runId: "guarded-run",
      runner: async input => { seenEnv = input.env; return { stdout, stderr: "", exitCode: 0, timedOut: false }; },
      collectDiff: async () => ({ patch: "" }),
    });
    const runDir = path.join(path.dirname(missionPath), "runs", "guarded-run");
    const guardArtifact = parse(await readFile(path.join(runDir, "tool-guard.json"), "utf8")) as { written_files?: Record<string, string> };
    expect(guardArtifact).toMatchObject({ schema_version: "uh.tool-guard.v0", write_roots: ["out"] });
    expect(seenEnv?.UH_TOOL_GUARD_POLICY).toContain("tool-guard.json");
    // The baseline the protected-paths invariant judges against: the sha256 of
    // each policy file exactly as written.
    expect(guardArtifact.written_files?.[".commandcode/settings.json"]).toBe(createHash("sha256").update(await readFile(settingsPath)).digest("hex"));
    expect(guardArtifact.written_files?.[".commandcode/.gitignore"]).toBe(createHash("sha256").update("*\n").digest("hex"));
    expect(parse(await readFile(settingsPath, "utf8"))).toMatchObject({ permissions: { defaultMode: "default" }, custom: { keep: true }, hooks: { PreToolUse: [{ hooks: [{ type: "command" }] }] } });
    const persistedSettings = parse(await readFile(settingsPath, "utf8")) as { hooks: { PreToolUse: Array<{ hooks: Array<{ command: string }> }> } };
    const hookCommand = persistedSettings.hooks.PreToolUse.at(-1)?.hooks[0]?.command ?? "";
    const quotedHookPath = hookCommand.match(/"([^"]*tool-guard[\\/]+cmdc-hook\.js)"/i)?.[1];
    expect(quotedHookPath).toBeDefined();
    expect(existsSync(quotedHookPath!)).toBe(true);
    expect(quotedHookPath!.startsWith(process.env.UH_RUNTIME_SNAPSHOT_CACHE!)).toBe(true);
    expect(await readFile(path.join(root, ".commandcode", ".gitignore"), "utf8")).toBe("*\n");
    await runCommandCode(root, missionPath, {
      runId: "guarded-run-two",
      runner: async input => { seenEnv = input.env; return { stdout, stderr: "", exitCode: 0, timedOut: false }; },
      collectDiff: async () => ({ patch: "" }),
    });
    const settingsAfterSecond = parse(await readFile(settingsPath, "utf8")) as { hooks: { PreToolUse: Array<{ hooks: Array<{ command: string }> }> } };
    expect(settingsAfterSecond.hooks.PreToolUse.filter(entry => entry.hooks.some(hook => hook.command.includes("tool-guard")))).toHaveLength(1);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("buildCommandCodeProbeArgs passes --no-auto-update together with --version", () => {
  const defaultArgs = buildCommandCodeProbeArgs();
  expect(defaultArgs).toContain("--no-auto-update");
  expect(defaultArgs).toContain("--version");

  const customArgs = buildCommandCodeProbeArgs(["--profile", "custom"]);
  expect(customArgs).toEqual(["--profile", "custom", "--version", "--no-auto-update"]);
});

test("parseCommandCodeVersion parses valid versions and ignores update banner", () => {
  // Output: "1.60.0"
  expect(parseCommandCodeVersion("1.60.0")).toBe("1.60.0");
  expect(parseCommandCodeVersion("  1.60.0 \n")).toBe("1.60.0");

  // ANSI-colored "Updated 1.54.1 -> 1.60.0" line followed by "1.60.0"
  const bannerAndVersion = "\u001b[32mUpdated 1.54.1 -> 1.60.0\u001b[0m\n1.60.0";
  expect(parseCommandCodeVersion(bannerAndVersion)).toBe("1.60.0");

  // Output with no version returns null
  const onlyBanner = "\u001b[32mUpdated 1.54.1 -> 1.60.0\u001b[0m";
  expect(parseCommandCodeVersion(onlyBanner)).toBeNull();
  expect(parseCommandCodeVersion("")).toBeNull();
  expect(parseCommandCodeVersion("some unparseable output")).toBeNull();
});

test("checkCommandCode probe asserts --no-auto-update in args and parses versions correctly", async () => {
  const manifest: AdapterDocument = validateAdapter({
    schema_version: "uh.adapter.v0",
    id: "command-code",
    name: "Command Code",
    description: "Native Command Code execution",
    runtime: "command-code",
    capabilities: ["cli-execution"],
    config: {
      cli_command: "cmdc",
      runtime_config: {
        cli_args: ["--extra-flag"],
      },
    },
  });

  let capturedCommand = "";
  let capturedArgs: string[] = [];

  // 1. Output: "1.60.0"
  const result1 = await checkCommandCode(manifest, undefined, async (cmd, args) => {
    capturedCommand = cmd;
    capturedArgs = args;
    return { stdout: "1.60.0\n", stderr: "" };
  });
  expect(capturedArgs).toContain("--no-auto-update");
  expect(capturedArgs).toContain("--version");
  expect(capturedArgs.slice(-3)).toEqual(["--extra-flag", "--version", "--no-auto-update"]);
  expect(result1).toEqual({
    runtime: "command-code",
    found: true,
    version: "1.60.0",
    errors: [],
  });

  // 2. ANSI-colored "Updated 1.54.1 -> 1.60.0" line followed by "1.60.0"
  const result2 = await checkCommandCode(manifest, undefined, async () => {
    return { stdout: "\u001b[32mUpdated 1.54.1 -> 1.60.0\u001b[0m\n1.60.0\n", stderr: "" };
  });
  expect(result2).toEqual({
    runtime: "command-code",
    found: true,
    version: "1.60.0",
    errors: [],
  });

  // 3. Output with no version reports not found rather than a wrong version
  const result3 = await checkCommandCode(manifest, undefined, async () => {
    return { stdout: "\u001b[32mUpdated 1.54.1 -> 1.60.0\u001b[0m\n", stderr: "" };
  });
  expect(result3.found).toBe(false);
  expect(result3.version).toBe("");
  expect(result3.errors.length).toBeGreaterThan(0);
  expect(result3.errors[0]).toMatch(/version/i);

  // 4. Exec error reports not found
  const result4 = await checkCommandCode(manifest, undefined, async () => {
    throw new Error("Command failed");
  });
  expect(result4).toEqual({
    runtime: "command-code",
    found: false,
    version: "",
    errors: ["Configured Command Code CLI could not be executed"],
  });
});

test("the role field defaults to worker and accepts only worker or orchestrator", () => {
  expect(CommandCodeRuntimeConfigSchema.parse({}).role).toBe("worker");
  expect(CommandCodeRuntimeConfigSchema.parse({ role: "worker" }).role).toBe("worker");
  expect(CommandCodeRuntimeConfigSchema.parse({ role: "orchestrator" }).role).toBe("orchestrator");
  expect(() => CommandCodeRuntimeConfigSchema.parse({ role: "commander" })).toThrow();
});

test("the guard artifact carries controller_commands true only for the orchestrator role", async () => {
  const { root, missionPath } = await fixture();
  try {
    const mission = parse(await readFile(missionPath, "utf8")) as Record<string, unknown>;
    const overrides = mission.runtime_config_overrides as Record<string, unknown>;
    mission.guard = { write_roots: ["out"] };

    overrides.role = "orchestrator";
    await writeFile(missionPath, stringify(mission));
    const plan = await planCommandCodeRun(root, missionPath);
    expect(plan.permission_mode).toBe("guard");
    expect(plan.guard).toMatchObject({ write_roots: ["out"], controller_commands: true });
    let orchestratorEnv: NodeJS.ProcessEnv | undefined;
    await runCommandCode(root, missionPath, {
      runId: "orchestrator-guard",
      runner: async input => { orchestratorEnv = input.env; return { stdout: "", stderr: "", exitCode: 1, timedOut: false }; },
      collectDiff: async () => ({ patch: "" }),
    });
    const orchestratorArtifact = JSON.parse(await readFile(path.join(path.dirname(missionPath), "runs", "orchestrator-guard", "tool-guard.json"), "utf8")) as Record<string, unknown>;
    expect(orchestratorArtifact.controller_commands).toBe(true);
    expect(orchestratorEnv?.UH_TOOL_GUARD_POLICY).toContain("tool-guard.json");

    overrides.role = "worker";
    await writeFile(missionPath, stringify(mission));
    await runCommandCode(root, missionPath, {
      runId: "worker-guard",
      runner: async () => ({ stdout: "", stderr: "", exitCode: 1, timedOut: false }),
      collectDiff: async () => ({ patch: "" }),
    });
    const workerArtifact = JSON.parse(await readFile(path.join(path.dirname(missionPath), "runs", "worker-guard", "tool-guard.json"), "utf8")) as Record<string, unknown>;
    expect(workerArtifact.controller_commands).toBe(false);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("an orchestrator mission without a guard is refused before spawn", async () => {
  const { root, missionPath } = await fixture();
  try {
    const mission = parse(await readFile(missionPath, "utf8")) as Record<string, unknown>;
    (mission.runtime_config_overrides as Record<string, unknown>).role = "orchestrator";
    await writeFile(missionPath, stringify(mission));
    await expect(planCommandCodeRun(root, missionPath)).rejects.toThrow(/orchestrator.*guard/i);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("the orchestrator prompt ends with a fixed delegation paragraph under 80 words", async () => {
  const { root, missionPath } = await fixture();
  try {
    const mission = parse(await readFile(missionPath, "utf8")) as Record<string, unknown>;
    mission.guard = { write_roots: ["out"] };
    (mission.runtime_config_overrides as Record<string, unknown>).role = "orchestrator";
    await writeFile(missionPath, stringify(mission));
    const plan = await planCommandCodeRun(root, missionPath);
    const trimmed = plan.prompt.trimEnd();
    const paragraph = trimmed.slice(trimmed.lastIndexOf("\n\n") + 2).trim();
    expect(paragraph).toMatch(/delegate only by running harness controller commands/i);
    expect(paragraph.split(/\s+/).filter(Boolean).length).toBeLessThan(80);
  } finally { await rm(root, { recursive: true, force: true }); }
});

function runCmdcHook(input: unknown, env: NodeJS.ProcessEnv): Promise<{ code: number | null; stdout: string; stderr: string }> {
  const hook = fileURLToPath(new URL("../src/extensions/tool-guard/cmdc-hook.ts", import.meta.url));
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["--import", "tsx", hook], { env, stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", chunk => { stdout += String(chunk); });
    child.stderr.on("data", chunk => { stderr += String(chunk); });
    child.on("error", reject);
    child.on("close", code => resolve({ code, stdout, stderr }));
    child.stdin.end(JSON.stringify(input));
  });
}

test("the Command Code hook admits controller commands only for the orchestrator", { timeout: 180_000 }, async () => {
  const root = await mkdtemp(path.join(tmpdir(), "uh-cmdc-hook-"));
  try {
    const logPath = path.join(root, "tool-guard.log");
    const policyEnv = async (controller: boolean): Promise<NodeJS.ProcessEnv> => {
      const policyPath = path.join(root, `tool-guard-${controller}.json`);
      await writeFile(policyPath, JSON.stringify({
        schema_version: "uh.tool-guard.v0", write_roots: ["."], deny_git_mutations: true,
        deny_package_installs: true, deny_network_clients: true, agent_clients: ["omp", "cmdc"],
        worker_root: root, protected_paths: [".harness", ".git"], controller_commands: controller,
      }));
      return { ...process.env, UH_TOOL_GUARD_POLICY: policyPath, UH_TOOL_GUARD_LOG: logPath };
    };
    const decision = async (env: NodeJS.ProcessEnv, toolName: string, toolInput: unknown): Promise<string | undefined> => {
      const result = await runCmdcHook({ tool_name: toolName, tool_input: toolInput }, env);
      const output = result.stdout.trim();
      return output ? (JSON.parse(output) as { hookSpecificOutput?: { permissionDecision?: string } }).hookSpecificOutput?.permissionDecision : undefined;
    };

    const orchestrator = await policyEnv(true);
    expect(await decision(orchestrator, "Bash", { command: "uh mission run x.yaml" })).toBeUndefined();
    expect(await decision(orchestrator, "Bash", { command: "node dist/cli.js mission run-team y" })).toBeUndefined();
    expect(await decision(orchestrator, "Bash", { command: "omp -p hi" })).toBe("deny");
    expect(await decision(orchestrator, "task", { tasks: [] })).toBe("deny");
    expect(await decision(orchestrator, "Bash", { command: "uh mission run x --force" })).toBe("deny");
    expect(await decision(orchestrator, "Bash", { command: "uh mission run x.yaml && omp -p hi" })).toBe("deny");

    const worker = await policyEnv(false);
    expect(await decision(worker, "Bash", { command: "uh mission run x.yaml" })).toBe("deny");
    expect(await decision(worker, "Bash", { command: "node dist/cli.js mission run-team y" })).toBe("deny");
  } finally { await rm(root, { recursive: true, force: true }); }
});
