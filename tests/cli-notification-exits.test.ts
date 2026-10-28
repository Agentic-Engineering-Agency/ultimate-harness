import { afterEach, describe, expect, test } from "vitest";
import { execFile, execFileSync, spawn } from "node:child_process";
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { parse, stringify } from "yaml";
import { initializeHarness } from "../src/harness/init.js";
import { registerLiveRun } from "../src/harness/live-runs.js";
import { addAdapter } from "../src/harness/adapter-add.js";

const execFileP = promisify(execFile);
const roots: string[] = [];
afterEach(async () => { while (roots.length > 0) await rm(roots.pop() as string, { recursive: true, force: true }); });

/**
 * U-061 for the exit paths `mission run` was proved on: `uh ps`, `uh kill` and `uh mission run-team` each start a
 * notification delivery and then exit. A command sink that takes half a second writes a marker file; it exists only
 * if the CLI let the delivery finish before it exited. The run is real: a real CLI process, a real run directory, a
 * real (fake-runtime) process tree.
 */
async function base(events: string[]) {
  const root = await mkdtemp(path.join(tmpdir(), "uh-notify-exit-"));
  roots.push(root);
  execFileSync("git", ["init", "--quiet"], { cwd: root });
  await initializeHarness(root);
  const marker = path.join(root, "notified.ndjson");
  const writer = path.join(root, "notify-writer.cjs");
  await writeFile(writer, `setTimeout(() => require("node:fs").appendFileSync(${JSON.stringify(marker)}, (process.env.UH_NOTIFICATION_EVENT || "") + "\\n"), 500);\n`, "utf-8");
  // The operator's own user file: run discovery (`uh ps`) announces to its sinks only.
  await mkdir(path.join(root, "user-data"), { recursive: true });
  await writeFile(path.join(root, "user-data", "notifications.yaml"), stringify({ sinks: [{ id: "capture", kind: "command", argv: [process.execPath, writer], events }] }), "utf-8");
  return { root, marker };
}
const events = async (marker: string) => (existsSync(marker) ? (await readFile(marker, "utf-8")).split("\n").filter(Boolean).map(line => JSON.parse(line) as Record<string, unknown>) : []);
const uh = async (root: string, args: string[]) => {
  try {
    const { stdout, stderr } = await execFileP(process.execPath, ["--import", "tsx", "src/cli.ts", ...args], { cwd: process.cwd(), timeout: 120_000, env: { ...process.env, UH_USER_DATA_DIR: path.join(root, "user-data") } });
    return { code: 0, out: `${stdout}${stderr}` };
  } catch (error) {
    const failure = error as { code?: number; stdout?: string; stderr?: string };
    return { code: failure.code ?? 1, out: `${failure.stdout ?? ""}${failure.stderr ?? ""}` };
  }
};
async function writeHermes(root: string, script: string) {
  const hermes = path.join(root, "fake-hermes.mjs");
  await writeFile(hermes, `#!/usr/bin/env node\n${script}\n`, "utf-8");
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
}
const UH_BLOCK = ["```yaml", "schema_version: uh.runtime-result.v0", "mission_id: m1", "status: completed", "```"].join("\n");
const PASS = `console.log(JSON.stringify({ type: "result", exit_code: 0, text: ${JSON.stringify(UH_BLOCK)} }));`;

describe("uh ps", () => {
  test("a run its controller finished but never settled in the registry is settled by ps, and the notification is delivered before ps exits", async () => {
    const { root, marker } = await base(["run.settled"]);
    const runId = "20261001T000000Z-done01";
    const runDir = path.join(root, ".harness", "missions", "m1", "runs", runId);
    await mkdir(runDir, { recursive: true });
    const stamp = "2026-10-01T00:00:00.000Z";
    await writeFile(path.join(runDir, "runtime-control.json"), JSON.stringify({ schema_version: "uh.runtime-control.v0", mission_id: "m1", run_id: runId, runtime: "hermes", controller_pid: 1, started_at: stamp, heartbeat_at: stamp, status: "passed", turns: 1, denials: 0, inflight_tools: 0 }));
    await registerLiveRun({ projectRoot: root, artifactRoot: root, runId, missionId: "m1", runtime: "hermes", controllerPid: 1, startedAt: stamp });
    await uh(root, ["ps", "--root", root]);
    const delivered = await events(marker);
    expect(delivered.some(event => event.event === "run.settled" && event.mission === "m1")).toBe(true);
  }, 180_000);
});

describe("uh kill", () => {
  test("a live run that is killed announces its settlement before kill exits", async () => {
    const { root, marker } = await base(["run.settled"]);
    // Command Code runs under UH's supervision, so its run is registered and `uh kill` can see it; Hermes runs are not.
    await addAdapter(root, "command-code");
    const cmdc = path.join(root, "fake-cmdc.mjs");
    await writeFile(cmdc, "#!/usr/bin/env node\nsetTimeout(() => {}, 120000);\n", "utf-8");
    await chmod(cmdc, 0o755);
    const manifestPath = path.join(root, ".harness", "adapters", "command-code.yaml");
    const manifest = parse(await readFile(manifestPath, "utf-8")) as { config: Record<string, unknown> };
    manifest.config.cli_command = cmdc;
    manifest.config.runtime_config = { model: "fixture/model", permission_mode: "yolo" };
    await writeFile(manifestPath, stringify(manifest), "utf-8");
    const missionDir = path.join(root, ".harness", "missions", "m1");
    await mkdir(missionDir, { recursive: true });
    const missionPath = path.join(missionDir, "mission.yaml");
    await writeFile(missionPath, stringify({ schema_version: "uh.mission.v0", id: "m1", title: "Kill", workflow_profile: "research-docs", objective: "Hang", verification: { checks: [], required_checks: [], review_gates: [] } }), "utf-8");
    // A real run, left hanging on purpose.
    const run = spawn(process.execPath, ["--import", "tsx", "src/cli.ts", "mission", "run", missionPath, "--root", root, "--no-sandbox", "--runtime", "command-code", "--force"], { cwd: process.cwd(), stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, UH_USER_DATA_DIR: path.join(root, "user-data") } });
    let runOutput = "";
    run.stdout?.on("data", chunk => { runOutput += String(chunk); });
    run.stderr?.on("data", chunk => { runOutput += String(chunk); });
    try {
      for (let wait = 0; wait < 30; wait += 1) {
        const ps = await uh(root, ["ps", "--root", root, "--json"]);
        if (/"status":\s*"running"/.test(ps.out)) break;
        await new Promise(resolve => setTimeout(resolve, 500));
      }
      await rm(marker, { force: true });
      const killed = await uh(root, ["kill", "--all", "--root", root]);
      const delivered = await events(marker);
      expect(JSON.stringify({ killed, delivered, runOutput })).toContain("run.settled");
    } finally {
      run.kill();
    }
  }, 240_000);
});

describe("uh mission run-team", () => {
  test("a finished team announces team.settled before run-team exits", async () => {
    const { root, marker } = await base(["team.settled"]);
    await writeHermes(root, PASS);
    const missionDir = path.join(root, ".harness", "missions", "m1");
    await mkdir(missionDir, { recursive: true });
    await writeFile(path.join(missionDir, "mission.yaml"), stringify({
      schema_version: "uh.mission.v0", id: "m1", title: "Team", workflow_profile: "staged", objective: "Run", shape: "team",
      team: { workers: [{ role: "w1", adapter: "hermes", objective: "work", count: 1 }], leader: { adapter: "hermes" } },
    }), "utf-8");
    execFileSync("git", ["add", "--all", "--force"], { cwd: root });
    execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@example.com", "commit", "--quiet", "-m", "init"], { cwd: root });
    const outcome = await uh(root, ["mission", "run-team", "m1", "--root", root]);
    expect(outcome.out).toMatch(/\[(PASS|PARTIAL|BLOCKED|FAIL)\] m1/);
    const delivered = await events(marker);
    expect(delivered.some(event => event.event === "team.settled")).toBe(true);
  }, 240_000);
});
