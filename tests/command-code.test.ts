import { test, expect } from "vitest";
import { existsSync } from "node:fs";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { stringify, parse } from "yaml";
import { initializeHarness } from "../src/harness/init.js";
import { addAdapter } from "../src/harness/adapter-add.js";
import { runCommandCode, planCommandCodeRun } from "../src/adapters/command-code.js";

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
    expect(parse(await readFile(path.join(runDir, "tool-guard.json"), "utf8"))).toMatchObject({ schema_version: "uh.tool-guard.v0", write_roots: ["out"] });
    expect(seenEnv?.UH_TOOL_GUARD_POLICY).toContain("tool-guard.json");
    expect(parse(await readFile(settingsPath, "utf8"))).toMatchObject({ permissions: { defaultMode: "default" }, custom: { keep: true }, hooks: { PreToolUse: [{ hooks: [{ type: "command" }] }] } });
    const persistedSettings = parse(await readFile(settingsPath, "utf8")) as { hooks: { PreToolUse: Array<{ hooks: Array<{ command: string }> }> } };
    const hookCommand = persistedSettings.hooks.PreToolUse.at(-1)?.hooks[0]?.command ?? "";
    const quotedHookPath = hookCommand.match(/"([^"]*tool-guard[\\/]+cmdc-hook\.js)"/i)?.[1];
    expect(quotedHookPath).toBeDefined();
    expect(existsSync(quotedHookPath!)).toBe(true);
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
