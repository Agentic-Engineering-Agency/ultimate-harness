import { test, expect, describe } from "vitest";
import { access, mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { parse, stringify } from "yaml";
import { RuntimeResultSchema } from "../src/schema/artifacts.js";
import { LatestRunPointerSchema, RunsIndexSchema } from "../src/schema/runs.js";
import { exitCodeForRun } from "../src/harness/exit-codes.js";
import { loadPostChecks, postCheckExitCode, runPostChecks, POST_CHECK_DEFAULT_TIMEOUT_MS } from "../src/harness/post-checks.js";

const STARTED = "2026-09-22T00:00:00.000Z";
const MISSION = "m1";
const RUN = "run-1";
const RUN2 = "run-2";

async function makeTempDir(prefix: string): Promise<string> {
  return mkdtemp(path.join(tmpdir(), prefix));
}

async function makeProjectRoot(): Promise<string> {
  const root = await makeTempDir("uh-post-checks-root-");
  const runDir = path.join(root, ".harness", "missions", MISSION, "runs", RUN);
  await mkdir(runDir, { recursive: true });
  await writeFile(path.join(runDir, "runtime-result.yaml"), stringify({
    schema_version: "uh.runtime-result.v0",
    mission_id: MISSION,
    runtime: "command-code",
    status: "passed",
    started_at: STARTED,
    finished_at: STARTED,
    exit_code: 0,
    prompt_path: "prompt.md",
    stdout_path: "runtime.stdout.log",
    stderr_path: "runtime.stderr.log",
    errors: [],
  }), "utf-8");
  return root;
}

type MissionPaths = {
  root: string;
  mirrorPath: string;
  latestPath: string;
  indexPath: string;
  runResultPath: string;
  runDir: string;
};

/**
 * Lay out a real mission directory: the mission-level `runtime-result.yaml`
 * mirror, `latest.json`, `runs/index.json` and one run dir, all as `passed`.
 * `latestRunId` lets a test point `latest.json` at a different (newer) run.
 */
async function makeMissionRoot(latestRunId: string = RUN): Promise<MissionPaths> {
  const root = await makeTempDir("uh-post-checks-mission-");
  const missionDir = path.join(root, ".harness", "missions", MISSION);
  const runsDir = path.join(missionDir, "runs");
  const runDir = path.join(runsDir, RUN);
  await mkdir(runDir, { recursive: true });
  const result = {
    schema_version: "uh.runtime-result.v0",
    mission_id: MISSION,
    runtime: "command-code",
    status: "passed",
    started_at: STARTED,
    finished_at: STARTED,
    exit_code: 0,
    prompt_path: "prompt.md",
    stdout_path: "runtime.stdout.log",
    stderr_path: "runtime.stderr.log",
    errors: [],
  };
  await writeFile(path.join(runDir, "runtime-result.yaml"), stringify(result), "utf-8");
  await writeFile(path.join(missionDir, "runtime-result.yaml"), stringify(result), "utf-8");
  await writeFile(path.join(missionDir, "latest.json"), JSON.stringify({
    schema_version: "uh.latest-run.v0",
    run_id: latestRunId,
    started_at: STARTED,
    finished_at: STARTED,
    status: "passed",
  }, null, 2), "utf-8");
  await writeFile(path.join(runsDir, "index.json"), JSON.stringify({
    schema_version: "uh.runs-index.v0",
    runs: [
      { run_id: RUN, started_at: STARTED, finished_at: STARTED, status: "passed", runtime: "command-code" },
      ...(latestRunId === RUN
        ? []
        : [{ run_id: latestRunId, started_at: "2026-09-23T00:00:00.000Z", finished_at: "2026-09-23T00:00:00.000Z", status: "passed", runtime: "command-code" }]),
    ],
  }, null, 2), "utf-8");
  return {
    root,
    runDir,
    mirrorPath: path.join(missionDir, "runtime-result.yaml"),
    latestPath: path.join(missionDir, "latest.json"),
    indexPath: path.join(runsDir, "index.json"),
    runResultPath: path.join(runDir, "runtime-result.yaml"),
  };
}

async function runGated(mission: MissionPaths, checksDir: string, entries: unknown[]) {
  const checksFile = await writeChecksFile(checksDir, entries);
  const checks = await loadPostChecks(checksFile);
  return runPostChecks({
    checks,
    checksFile,
    missionId: MISSION,
    runId: RUN,
    runDir: mission.runDir,
    root: mission.root,
    cwd: mission.root,
  });
}

async function writeScript(checksDir: string, name: string, body: string): Promise<string> {
  const file = path.join(checksDir, name);
  await writeFile(file, body, "utf-8");
  return file;
}

async function writeChecksFile(checksDir: string, entries: unknown[], fileName = "checks.yaml"): Promise<string> {
  const file = path.join(checksDir, fileName);
  await writeFile(file, stringify(entries), "utf-8");
  return file;
}

async function walkFiles(dir: string): Promise<string[]> {
  const out: string[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...await walkFiles(full));
    else if (entry.isFile()) out.push(full);
  }
  return out;
}

function readResult(root: string): Promise<string> {
  return readFile(path.join(root, ".harness", "missions", MISSION, "runs", RUN, "runtime-result.yaml"), "utf-8");
}

describe("loadPostChecks", () => {
  test("loads a valid YAML file and applies the default timeout", async () => {
    const checksDir = await makeTempDir("uh-post-checks-cfg-");
    try {
      const file = await writeChecksFile(checksDir, [{ name: "alpha", command: "node ok.mjs" }]);
      const checks = await loadPostChecks(file);
      expect(checks).toEqual([{ name: "alpha", command: "node ok.mjs", timeout_ms: POST_CHECK_DEFAULT_TIMEOUT_MS }]);
    } finally { await rm(checksDir, { recursive: true, force: true }); }
  });

  test("reads JSON as well as YAML", async () => {
    const checksDir = await makeTempDir("uh-post-checks-cfg-");
    try {
      const file = path.join(checksDir, "checks.json");
      await writeFile(file, JSON.stringify([{ name: "alpha", command: "node ok.mjs", timeout_ms: 1000 }]), "utf-8");
      expect(await loadPostChecks(file)).toEqual([{ name: "alpha", command: "node ok.mjs", timeout_ms: 1000 }]);
    } finally { await rm(checksDir, { recursive: true, force: true }); }
  });

  test("rejects an unknown key", async () => {
    const checksDir = await makeTempDir("uh-post-checks-cfg-");
    try {
      const file = await writeChecksFile(checksDir, [{ name: "alpha", command: "node ok.mjs", extra: true }]);
      await expect(loadPostChecks(file)).rejects.toThrow();
    } finally { await rm(checksDir, { recursive: true, force: true }); }
  });

  test("rejects a duplicate name", async () => {
    const checksDir = await makeTempDir("uh-post-checks-cfg-");
    try {
      const file = await writeChecksFile(checksDir, [
        { name: "alpha", command: "node a.mjs" },
        { name: "alpha", command: "node b.mjs" },
      ]);
      await expect(loadPostChecks(file)).rejects.toThrow(/duplicate/i);
    } finally { await rm(checksDir, { recursive: true, force: true }); }
  });

  test("rejects an unsafe name", async () => {
    const checksDir = await makeTempDir("uh-post-checks-cfg-");
    try {
      const file = await writeChecksFile(checksDir, [{ name: "bad name", command: "node ok.mjs" }]);
      await expect(loadPostChecks(file)).rejects.toThrow();
    } finally { await rm(checksDir, { recursive: true, force: true }); }
  });
});

describe("runPostChecks", () => {
  test("a passing check leaves a passed run passed and records the outcome", async () => {
    const root = await makeProjectRoot();
    const checksDir = await makeTempDir("uh-post-checks-cfg-");
    try {
      const script = await writeScript(checksDir, "ok.mjs", "process.exit(0);\n");
      const checksFile = await writeChecksFile(checksDir, [{ name: "ok", command: `node "${script}"` }]);
      const checks = await loadPostChecks(checksFile);

      const outcome = await runPostChecks({
        checks,
        checksFile,
        missionId: MISSION,
        runId: RUN,
        runDir: path.join(root, ".harness", "missions", MISSION, "runs", RUN),
        root,
        cwd: root,
      });

      expect(outcome.errors).toEqual([]);
      expect(outcome.results).toHaveLength(1);
      expect(outcome.results[0]).toMatchObject({ name: "ok", passed: true, exit_code: 0 });

      const document = RuntimeResultSchema.parse(parse(await readResult(root)));
      expect(document.status).toBe("passed");
      expect(document.post_checks).toEqual([
        { name: "ok", passed: true, exit_code: 0, duration_ms: outcome.results[0].duration_ms },
      ]);
    } finally {
      await rm(root, { recursive: true, force: true });
      await rm(checksDir, { recursive: true, force: true });
    }
  });

  test("a failing check and a timing-out check each make the run failed", async () => {
    const root = await makeProjectRoot();
    const checksDir = await makeTempDir("uh-post-checks-cfg-");
    try {
      const failScript = await writeScript(checksDir, "fail.mjs", "process.exit(3);\n");
      const slowScript = await writeScript(checksDir, "slow.mjs", "setTimeout(() => {}, 10000);\n");
      const checksFile = await writeChecksFile(checksDir, [
        { name: "fail", command: `node "${failScript}"` },
        { name: "slow", command: `node "${slowScript}"`, timeout_ms: 500 },
      ]);
      const checks = await loadPostChecks(checksFile);

      const outcome = await runPostChecks({
        checks,
        checksFile,
        missionId: MISSION,
        runId: RUN,
        runDir: path.join(root, ".harness", "missions", MISSION, "runs", RUN),
        root,
        cwd: root,
      });

      expect(outcome.errors).toEqual(["post-check fail failed", "post-check slow failed"]);
      const byName = Object.fromEntries(outcome.results.map((r) => [r.name, r]));
      expect(byName.fail).toMatchObject({ passed: false, exit_code: 3 });
      expect(byName.slow).toMatchObject({ passed: false, exit_code: null });

      const document = RuntimeResultSchema.parse(parse(await readResult(root)));
      expect(document.status).toBe("failed");
      expect(document.errors).toContain("post-check fail failed");
      expect(document.errors).toContain("post-check slow failed");
    } finally {
      await rm(root, { recursive: true, force: true });
      await rm(checksDir, { recursive: true, force: true });
    }
  });

  test("no checks-file path or command reaches the project root, and the log lands under the checks directory", async () => {
    const root = await makeProjectRoot();
    const checksDir = await makeTempDir("uh-post-checks-cfg-");
    try {
      const script = await writeScript(checksDir, "ok.mjs", "process.exit(0);\n");
      const command = `node "${script}"`;
      const checksFile = await writeChecksFile(checksDir, [{ name: "secrecy", command }]);
      const checks = await loadPostChecks(checksFile);

      await runPostChecks({
        checks,
        checksFile,
        missionId: MISSION,
        runId: RUN,
        runDir: path.join(root, ".harness", "missions", MISSION, "runs", RUN),
        root,
        cwd: root,
      });

      const files = await walkFiles(root);
      expect(files.length).toBeGreaterThan(0);
      for (const file of files) {
        const content = await readFile(file, "utf-8");
        expect(content).not.toContain(checksFile);
        expect(content).not.toContain(command);
      }

      const logPath = path.join(checksDir, "logs", `${MISSION}-${RUN}-secrecy.log`);
      await expect(access(logPath)).resolves.toBeUndefined();
    } finally {
      await rm(root, { recursive: true, force: true });
      await rm(checksDir, { recursive: true, force: true });
    }
  });

  test("checks see the UH_* environment, an absolute run dir, and the working root as cwd", async () => {
    const root = await makeProjectRoot();
    const workingRoot = await makeTempDir("uh-post-checks-work-");
    const checksDir = await makeTempDir("uh-post-checks-cfg-");
    try {
      const script = await writeScript(checksDir, "dump.mjs", [
        'import { writeFileSync } from "node:fs";',
        'import { fileURLToPath } from "node:url";',
        'import path from "node:path";',
        'const here = path.dirname(fileURLToPath(import.meta.url));',
        'writeFileSync(path.join(here, "dump.json"), JSON.stringify({',
        '  env: {',
        '    UH_MISSION_ID: process.env.UH_MISSION_ID,',
        '    UH_RUN_ID: process.env.UH_RUN_ID,',
        '    UH_RUN_DIR: process.env.UH_RUN_DIR,',
        '    UH_ROOT: process.env.UH_ROOT,',
        '  },',
        '  cwd: process.cwd(),',
        '}));',
      ].join("\n"));
      const checksFile = await writeChecksFile(checksDir, [{ name: "dump", command: `node "${script}"` }]);
      const checks = await loadPostChecks(checksFile);

      const outcome = await runPostChecks({
        checks,
        checksFile,
        missionId: MISSION,
        runId: RUN,
        runDir: path.join(root, ".harness", "missions", MISSION, "runs", RUN),
        root,
        cwd: workingRoot,
      });

      expect(outcome.errors).toEqual([]);
      const dump = JSON.parse(await readFile(path.join(checksDir, "dump.json"), "utf-8"));
      expect(dump.cwd).toBe(path.resolve(workingRoot));
      expect(dump.env.UH_MISSION_ID).toBe(MISSION);
      expect(dump.env.UH_RUN_ID).toBe(RUN);
      expect(dump.env.UH_RUN_DIR).toBe(path.join(root, ".harness", "missions", MISSION, "runs", RUN));
      expect(path.isAbsolute(dump.env.UH_RUN_DIR)).toBe(true);
      expect(dump.env.UH_ROOT).toBe(path.resolve(root));
    } finally {
      await rm(root, { recursive: true, force: true });
      await rm(workingRoot, { recursive: true, force: true });
      await rm(checksDir, { recursive: true, force: true });
    }
  });

  test("no checks leaves the runtime result byte-identical", async () => {
    const root = await makeProjectRoot();
    try {
      const before = await readResult(root);
      const outcome = await runPostChecks({
        checks: [],
        checksFile: path.join(root, "unused-checks.yaml"),
        missionId: MISSION,
        runId: RUN,
        runDir: path.join(root, ".harness", "missions", MISSION, "runs", RUN),
        root,
        cwd: root,
      });
      expect(outcome).toEqual({ results: [], errors: [] });
      expect(await readResult(root)).toBe(before);
    } finally { await rm(root, { recursive: true, force: true }); }
  });
});

describe("runPostChecks mission mirrors", () => {
  test("a failing check flips all four records to failed and agrees with the run", async () => {
    const mission = await makeMissionRoot();
    const checksDir = await makeTempDir("uh-post-checks-cfg-");
    try {
      const script = await writeScript(checksDir, "fail.mjs", "process.exit(4);\n");
      const outcome = await runGated(mission, checksDir, [{ name: "fail", command: `node "${script}"` }]);
      expect(outcome.errors).toEqual(["post-check fail failed"]);

      const runDoc = RuntimeResultSchema.parse(parse(await readFile(mission.runResultPath, "utf-8")));
      expect(runDoc.status).toBe("failed");
      expect(runDoc.errors).toContain("post-check fail failed");

      const mirrorDoc = RuntimeResultSchema.parse(parse(await readFile(mission.mirrorPath, "utf-8")));
      expect(mirrorDoc.status).toBe("failed");
      expect(mirrorDoc.post_checks).toEqual(runDoc.post_checks);
      expect(mirrorDoc.errors).toEqual(runDoc.errors);

      const pointer = LatestRunPointerSchema.parse(JSON.parse(await readFile(mission.latestPath, "utf-8")));
      expect(pointer.status).toBe("failed");

      const index = RunsIndexSchema.parse(JSON.parse(await readFile(mission.indexPath, "utf-8")));
      expect(index.runs.find((run) => run.run_id === RUN)?.status).toBe("failed");
    } finally {
      await rm(mission.root, { recursive: true, force: true });
      await rm(checksDir, { recursive: true, force: true });
    }
  });

  test("a passing check leaves every record passed and adds post_checks to the mirror", async () => {
    const mission = await makeMissionRoot();
    const checksDir = await makeTempDir("uh-post-checks-cfg-");
    try {
      const script = await writeScript(checksDir, "ok.mjs", "process.exit(0);\n");
      const outcome = await runGated(mission, checksDir, [{ name: "ok", command: `node "${script}"` }]);
      expect(outcome.errors).toEqual([]);

      const runDoc = RuntimeResultSchema.parse(parse(await readFile(mission.runResultPath, "utf-8")));
      expect(runDoc.status).toBe("passed");
      expect(runDoc.post_checks).toHaveLength(1);
      expect(runDoc.post_checks?.[0]).toMatchObject({ name: "ok", passed: true });

      const mirrorDoc = RuntimeResultSchema.parse(parse(await readFile(mission.mirrorPath, "utf-8")));
      expect(mirrorDoc.status).toBe("passed");
      expect(mirrorDoc.post_checks).toEqual(runDoc.post_checks);

      const pointer = LatestRunPointerSchema.parse(JSON.parse(await readFile(mission.latestPath, "utf-8")));
      expect(pointer.status).toBe("passed");

      const index = RunsIndexSchema.parse(JSON.parse(await readFile(mission.indexPath, "utf-8")));
      expect(index.runs.find((run) => run.run_id === RUN)?.status).toBe("passed");
    } finally {
      await rm(mission.root, { recursive: true, force: true });
      await rm(checksDir, { recursive: true, force: true });
    }
  });

  test("no checks leaves all four mission records byte-identical", async () => {
    const mission = await makeMissionRoot();
    try {
      const paths = [mission.mirrorPath, mission.latestPath, mission.indexPath, mission.runResultPath];
      const before = await Promise.all(paths.map((file) => readFile(file, "utf-8")));
      const outcome = await runPostChecks({
        checks: [],
        checksFile: path.join(mission.root, "unused-checks.yaml"),
        missionId: MISSION,
        runId: RUN,
        runDir: mission.runDir,
        root: mission.root,
        cwd: mission.root,
      });
      expect(outcome).toEqual({ results: [], errors: [] });
      const after = await Promise.all(paths.map((file) => readFile(file, "utf-8")));
      expect(after).toEqual(before);
    } finally { await rm(mission.root, { recursive: true, force: true }); }
  });

  test("a latest.json naming a newer run is left unchanged", async () => {
    const mission = await makeMissionRoot(RUN2);
    const checksDir = await makeTempDir("uh-post-checks-cfg-");
    try {
      const latestBefore = await readFile(mission.latestPath, "utf-8");
      const mirrorBefore = await readFile(mission.mirrorPath, "utf-8");
      const script = await writeScript(checksDir, "fail.mjs", "process.exit(5);\n");
      const outcome = await runGated(mission, checksDir, [{ name: "fail", command: `node "${script}"` }]);
      expect(outcome.errors).toEqual(["post-check fail failed"]);

      expect(await readFile(mission.latestPath, "utf-8")).toBe(latestBefore);
      expect(await readFile(mission.mirrorPath, "utf-8")).toBe(mirrorBefore);

      // The run's own record still flips; only the newer run's records are spared.
      const runDoc = RuntimeResultSchema.parse(parse(await readFile(mission.runResultPath, "utf-8")));
      expect(runDoc.status).toBe("failed");
    } finally {
      await rm(mission.root, { recursive: true, force: true });
      await rm(checksDir, { recursive: true, force: true });
    }
  });
});

describe("postCheckExitCode", () => {
  test("a failed post-check forces exit 1 whatever the runtime stop code", () => {
    expect(postCheckExitCode("failed", "cancelled", true)).toBe(1);
    expect(postCheckExitCode("failed", "blocked", true)).toBe(1);
    expect(postCheckExitCode("failed", undefined, true)).toBe(1);
  });

  test("without a post-check failure the code matches exitCodeForRun", () => {
    const cases: Array<[string, string | undefined]> = [
      ["passed", undefined],
      ["cancelled", "cancelled"],
      ["blocked", "blocked"],
    ];
    for (const [status, stopCode] of cases) {
      expect(postCheckExitCode(status, stopCode, false)).toBe(exitCodeForRun(status, stopCode));
    }
  });
});
