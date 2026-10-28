import { afterEach, describe, expect, test } from "vitest";
import { execFile } from "node:child_process";
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { parse, stringify } from "yaml";
import { initializeHarness } from "../src/harness/init.js";
import { drainNotifications } from "../src/harness/notifications.js";

const execFileP = promisify(execFile);
const roots: string[] = [];
afterEach(async () => {
  while (roots.length > 0) await rm(roots.pop() as string, { recursive: true, force: true });
});

/**
 * U-060 and U-061. A run that settles normally never announced itself: `notifyRunSettled` was called only by a
 * reader that found a settlement, `uh kill` and controller-loss reconciliation. Where it was called, delivery was
 * fire-and-forget and the CLI called `process.exit` straight after, so the delivery never finished. The marker file
 * below is written by a command sink; it exists only if the CLI let the delivery complete before exiting.
 */
const UH_BLOCK = ["```yaml", "schema_version: uh.runtime-result.v0", "mission_id: m1", "status: completed", "```"].join("\n");

async function project(hermesBody: string) {
  const root = await mkdtemp(path.join(tmpdir(), "uh-cli-notify-"));
  roots.push(root);
  await initializeHarness(root);
  const hermes = path.join(root, "fake-hermes.mjs");
  await writeFile(hermes, `#!/usr/bin/env node\n${hermesBody}\n`, "utf-8");
  await chmod(hermes, 0o755);
  await writeFile(path.join(root, ".harness", "adapters", "hermes.yaml"), `schema_version: uh.adapter.v0
id: hermes
name: Hermes Agent
runtime: hermes
config:
  cli_command: ${hermes}
  default_toolsets:
    - terminal
  default_provider: ""
  default_model: ""
  worktree_mode: false
  pass_session_id: false
`, "utf-8");
  const marker = path.join(root, "notified.json");
  const writer = path.join(root, "notify-writer.cjs");
  // A slow command sink: the delivery takes about half a second, so a CLI that exits first loses it.
  await writeFile(writer, `setTimeout(() => require("node:fs").writeFileSync(${JSON.stringify(marker)}, process.env.UH_NOTIFICATION_EVENT || ""), 500);\n`, "utf-8");
  const projectFile = path.join(root, ".harness", "project.yaml");
  const config = parse(await readFile(projectFile, "utf-8")) as Record<string, unknown>;
  config.notifications = { sinks: [{ id: "capture", kind: "command", argv: [process.execPath, writer], events: ["run.settled"] }] };
  await writeFile(projectFile, stringify(config), "utf-8");
  const missionDir = path.join(root, ".harness", "missions", "m1");
  await mkdir(missionDir, { recursive: true });
  const missionPath = path.join(missionDir, "mission.yaml");
  await writeFile(missionPath, stringify({ schema_version: "uh.mission.v0", id: "m1", title: "Notify", workflow_profile: "research-docs", objective: "Run", verification: { checks: [], required_checks: [], review_gates: [] } }), "utf-8");
  return { root, missionPath, marker };
}

const run = async (root: string, missionPath: string) => {
  try {
    const { stdout } = await execFileP(process.execPath, ["--import", "tsx", "src/cli.ts", "mission", "run", missionPath, "--root", root, "--no-sandbox", "--runtime", "hermes"], { cwd: process.cwd(), env: { ...process.env, UH_USER_DATA_DIR: path.join(root, "user-data") } });
    return { code: 0, stdout };
  } catch (error) {
    const failure = error as { code?: number; stdout?: string; stderr?: string };
    return { code: failure.code ?? 1, stdout: `${failure.stdout ?? ""}${failure.stderr ?? ""}` };
  }
};

describe("a run that settles normally announces itself before the CLI exits", () => {
  test("settled", async () => {
    const { root, missionPath, marker } = await project(`console.log(JSON.stringify({ type: "result", exit_code: 0, text: ${JSON.stringify(UH_BLOCK)} }));`);
    const outcome = await run(root, missionPath);
    // Whatever status the run settles with, the announcement carries the same one and finished before the CLI exited.
    const settled = JSON.parse(/UH_RESULT (\{.*\})/.exec(outcome.stdout)![1]) as { status: string; exit_code: number };
    expect(outcome.code, outcome.stdout).toBe(settled.exit_code);
    expect(existsSync(marker)).toBe(true);
    expect(JSON.parse(await readFile(marker, "utf-8"))).toMatchObject({ event: "run.settled", mission: "m1", status: settled.status });
  }, 60_000);

  test("failed", async () => {
    const { root, missionPath, marker } = await project("process.exit(3);");
    const outcome = await run(root, missionPath);
    expect(outcome.code).not.toBe(0);
    expect(JSON.parse(await readFile(marker, "utf-8"))).toMatchObject({ event: "run.settled", mission: "m1", status: "failed" });
  }, 60_000);
});

describe("drainNotifications", () => {
  test("returns when nothing is in flight", async () => {
    await expect(drainNotifications()).resolves.toBeUndefined();
  });
  test("gives up after its bound, so a hung sink cannot hang the CLI", async () => {
    const started = Date.now();
    await drainNotifications(50);
    expect(Date.now() - started).toBeLessThan(2000);
  });
});
