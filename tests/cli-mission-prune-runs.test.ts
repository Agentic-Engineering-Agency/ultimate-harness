import { afterEach, describe, expect, test } from "vitest";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { initializeHarness } from "../src/harness/init.js";

const execFileP = promisify(execFile);
const roots: string[] = [];
afterEach(async () => { while (roots.length > 0) await rm(roots.pop() as string, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 }); });

/**
 * #267: the Hermes dashboard plugin kept its own copy of the run pruner and wrote run artifacts itself. The pruner is a
 * public verb the plugin calls instead: `uh mission prune-runs <mission> --keep <n> --json`.
 */
async function project(runCount: number) {
  const root = await mkdtemp(path.join(tmpdir(), "uh-prune-runs-"));
  roots.push(root);
  await initializeHarness(root);
  const runsDir = path.join(root, ".harness", "missions", "m1", "runs");
  await mkdir(runsDir, { recursive: true });
  const runs = [];
  for (let index = 0; index < runCount; index += 1) {
    const runId = `2026052012${String(index).padStart(2, "0")}00Z-aaaaa${index}`;
    await mkdir(path.join(runsDir, runId), { recursive: true });
    await writeFile(path.join(runsDir, runId, "prompt.md"), `prompt ${runId}`, "utf-8");
    runs.push({ run_id: runId, started_at: `2026-05-20T12:${String(index).padStart(2, "0")}:00.000Z`, status: "passed", runtime: "hermes" });
  }
  await writeFile(path.join(runsDir, "index.json"), JSON.stringify({ schema_version: "uh.runs-index.v0", runs }), "utf-8");
  return { root, runsDir, runs };
}
const uh = async (args: string[]) => {
  try {
    const { stdout, stderr } = await execFileP(process.execPath, ["--import", "tsx", "src/cli.ts", ...args], { cwd: process.cwd() });
    return { code: 0, out: stdout, err: stderr };
  } catch (error) {
    const failure = error as { code?: number; stdout?: string; stderr?: string };
    return { code: failure.code ?? 1, out: failure.stdout ?? "", err: failure.stderr ?? "" };
  }
};

describe("uh mission prune-runs", () => {
  test("archives the oldest runs beyond the cap, removes their directories, and says how many", async () => {
    const { root, runsDir, runs } = await project(4);
    const outcome = await uh(["mission", "prune-runs", "m1", "--keep", "3", "--json", "--root", root]);
    expect(outcome.code, outcome.err).toBe(0);
    expect(JSON.parse(outcome.out)).toMatchObject({ mission_id: "m1", keep: 3, pruned: 1 });
    const index = JSON.parse(await readFile(path.join(runsDir, "index.json"), "utf-8")) as { runs: Array<{ run_id: string; archived?: boolean }> };
    expect(index.runs.filter((run) => run.archived === true).map((run) => run.run_id)).toEqual([runs[0].run_id]);
    await expect(stat(path.join(runsDir, runs[0].run_id))).rejects.toThrow();
    await expect(stat(path.join(runsDir, runs[1].run_id))).resolves.toBeTruthy();
  }, 60_000);

  test("under the cap nothing is pruned, and a cap that is not a positive integer is refused", async () => {
    const { root } = await project(2);
    const under = await uh(["mission", "prune-runs", "m1", "--keep", "5", "--json", "--root", root]);
    expect(JSON.parse(under.out)).toMatchObject({ pruned: 0 });
    for (const keep of ["0", "-1", "two"]) {
      const refused = await uh(["mission", "prune-runs", "m1", "--keep", keep, "--root", root]);
      expect(refused.code, keep).not.toBe(0);
    }
  }, 120_000);
});
