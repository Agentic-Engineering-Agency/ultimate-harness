import { afterEach, describe, expect, test } from "vitest";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { stringify } from "yaml";
import { runPostChecks, POST_CHECK_LOG_CAP_BYTES } from "../src/harness/post-checks.js";

const dirs: string[] = [];
afterEach(async () => { while (dirs.length > 0) await rm(dirs.pop() as string, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 }); });

/**
 * #262: post-checks ran after a cancelled run and rewrote `cancelled` to `failed`; a check started before Ctrl-C kept
 * running (detached) after the CLI died; a check's output was buffered without a cap; and the logs went next to the
 * checks file with no word when that is inside the project.
 */
async function fixture(status = "cancelled") {
  const outside = await mkdtemp(path.join(tmpdir(), "uh-post-checks-"));
  const root = path.join(outside, "project");
  dirs.push(outside);
  const runDir = path.join(root, ".harness", "missions", "m1", "runs", "r1");
  await mkdir(runDir, { recursive: true });
  await writeFile(path.join(runDir, "runtime-result.yaml"), stringify({
    schema_version: "uh.runtime-result.v0", mission_id: "m1", status, summary: "x", errors: [],
  }));
  const checksFile = path.join(outside, "checks.yaml");
  await writeFile(checksFile, "[]");
  return { outside, root, runDir, checksFile };
}
const node = (code: string) => `"${process.execPath}" -e "${code.replaceAll('"', '\\"')}"`;
const options = (f: Awaited<ReturnType<typeof fixture>>, checks: Array<{ name: string; command: string; timeout_ms?: number }>) => ({
  checks: checks.map(check => ({ timeout_ms: 60_000, ...check })),
  checksFile: f.checksFile, missionId: "m1", runId: "r1", runDir: f.runDir, root: f.root, cwd: f.root,
});

describe("post-checks and a cancelled run", () => {
  test("a cancelled run is not graded: no check runs and its status stays cancelled", async () => {
    const f = await fixture("cancelled");
    const marker = path.join(f.outside, "ran.txt");
    const outcome = await runPostChecks({ ...options(f, [{ name: "writes", command: node(`require('fs').writeFileSync(${JSON.stringify(marker)}, 'x')`) }]), runStatus: "cancelled" });
    expect(outcome.skipped).toMatch(/cancelled/);
    expect(outcome.results).toEqual([]);
    expect(outcome.errors).toEqual([]);
    await expect(stat(marker)).rejects.toThrow();
    expect(await readFile(path.join(f.runDir, "runtime-result.yaml"), "utf-8")).toContain("status: cancelled");
  });

  test("an abort during a check stops it and its children, and leaves the run cancelled", async () => {
    const f = await fixture("passed");
    const pidFile = path.join(f.outside, "child.pid");
    const code = `require('fs').writeFileSync(${JSON.stringify(pidFile)}, String(process.pid)); setInterval(() => {}, 1000)`;
    const controller = new AbortController();
    const running = runPostChecks({ ...options(f, [{ name: "long", command: node(code) }, { name: "never", command: node("process.exit(0)") }]), signal: controller.signal });
    for (let i = 0; i < 100; i += 1) { if (await stat(pidFile).then(() => true, () => false)) break; await delay(100); }
    controller.abort();
    const started = Date.now();
    const outcome = await running;
    expect(Date.now() - started).toBeLessThan(15_000);
    expect(outcome.aborted).toBe(true);
    expect(outcome.errors).toEqual([]);
    expect(outcome.results.map(result => result.name)).not.toContain("never");
    const pid = Number(await readFile(pidFile, "utf-8"));
    let alive = true;
    for (let i = 0; i < 50 && alive; i += 1) {
      try { process.kill(pid, 0); await delay(100); } catch { alive = false; }
    }
    expect(alive).toBe(false);
    expect(await readFile(path.join(f.runDir, "runtime-result.yaml"), "utf-8")).toContain("status: passed");
  }, 60_000);
});

describe("post-check output", () => {
  test("is capped on disk, with a marker, however much a check prints", async () => {
    const f = await fixture("passed");
    const outcome = await runPostChecks(options(f, [{ name: "noisy", command: node(`const chunk = 'x'.repeat(65536); for (let i = 0; i < 160; i++) process.stdout.write(chunk)`) }]));
    expect(outcome.errors).toEqual([]);
    const log = await readFile(path.join(path.dirname(f.checksFile), "logs", "m1-r1-noisy.log"), "utf-8");
    expect(Buffer.byteLength(log)).toBeLessThan(POST_CHECK_LOG_CAP_BYTES + 1024);
    expect(log).toContain("[output truncated");
  }, 60_000);

  test("a logs directory inside the project is reported, one outside is not", async () => {
    const f = await fixture("passed");
    const inside = await runPostChecks({ ...options(f, [{ name: "ok", command: node("process.exit(0)") }]), checksFile: path.join(f.root, "post-checks.yaml") });
    expect(inside.warnings?.join(" ")).toMatch(/inside the project/);
    const outside = await runPostChecks(options(f, [{ name: "ok", command: node("process.exit(0)") }]));
    expect(outside.warnings ?? []).toEqual([]);
  }, 60_000);
});
