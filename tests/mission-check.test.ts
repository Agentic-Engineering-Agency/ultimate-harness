import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { access, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { stringify } from "yaml";
import { initializeHarness } from "../src/harness/init.js";
import { addAdapter } from "../src/harness/adapter-add.js";
import { checkMissionPackets, extractChangeOnlyPaths, renderMissionCheckLines } from "../src/harness/mission-check.js";

const execFileP = promisify(execFile);

let root: string;
let previousDist: string | undefined;
let previousCache: string | undefined;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "uh-mission-check-"));
  await initializeHarness(root);
  await addAdapter(root, "oh-my-pi");
  // A guarded omp packet makes the planner snapshot the guard hook; point it at
  // a throwaway dist so the check exercises the real planner without a build.
  const dist = join(root, "snapshot", "dist");
  await mkdir(join(dist, "extensions", "tool-guard"), { recursive: true });
  await writeFile(join(dist, "extensions", "tool-guard", "omp.js"), "export default function () {}\n");
  previousDist = process.env.UH_HARNESS_DIST;
  previousCache = process.env.UH_RUNTIME_SNAPSHOT_CACHE;
  process.env.UH_HARNESS_DIST = dist;
  process.env.UH_RUNTIME_SNAPSHOT_CACHE = join(root, "snapshot", "cache");
});

afterEach(async () => {
  if (previousDist === undefined) delete process.env.UH_HARNESS_DIST;
  else process.env.UH_HARNESS_DIST = previousDist;
  if (previousCache === undefined) delete process.env.UH_RUNTIME_SNAPSHOT_CACHE;
  else process.env.UH_RUNTIME_SNAPSHOT_CACHE = previousCache;
  await rm(root, { recursive: true, force: true });
});

interface MissionOverrides {
  [key: string]: unknown;
}

async function writeMission(id: string, overrides: MissionOverrides = {}): Promise<string> {
  const dir = join(root, ".harness", "missions", id);
  await mkdir(dir, { recursive: true });
  const file = join(dir, "mission.yaml");
  await writeFile(file, stringify({
    schema_version: "uh.mission.v0",
    id,
    title: `Mission ${id}`,
    workflow_profile: "research-docs",
    objective: "Check this packet.",
    ...overrides,
  }), "utf-8");
  return file;
}

async function writeRawMission(id: string, raw: string): Promise<string> {
  const dir = join(root, ".harness", "missions", id);
  await mkdir(dir, { recursive: true });
  const file = join(dir, "mission.yaml");
  await writeFile(file, raw, "utf-8");
  return file;
}

function failStartingWith(result: Awaited<ReturnType<typeof checkMissionPackets>>, prefix: string) {
  return result.checks.find((line) => line.status === "FAIL" && line.name.startsWith(prefix));
}

describe("checkMissionPackets", () => {
  test("a valid packet passes every check", async () => {
    await mkdir(join(root, "docs"), { recursive: true });
    await writeFile(join(root, "docs", "README.md"), "# Alpha\n\nThis documents alpha.\n", "utf-8");
    const missionPath = await writeMission("valid-packet", {
      context: { read_first: ["docs/README.md"], source_links: [] },
      expected_outputs: { files: ["src/a.ts"] },
      guard: { write_roots: ["src"] },
      constraints: ["Change only src/a.ts."],
      grounding: [{ claim: "The README documents alpha", path: "docs/README.md", contains: "alpha" }],
      runtime_config_overrides: { thinking: "low" },
    });

    const result = await checkMissionPackets({ root, missionPath, runtime: "oh-my-pi" });

    expect(result.ok, renderMissionCheckLines(result).join("\n")).toBe(true);
    expect(result.checks.every((line) => line.status === "PASS")).toBe(true);
    expect(result.checks.map((line) => line.name)).toContain("read_first docs/README.md");
  });

  test("never writes to .harness", async () => {
    const missionPath = await writeMission("no-writes", {
      expected_outputs: { files: ["src/a.ts"] },
      guard: { write_roots: ["src"] },
    });
    await checkMissionPackets({ root, missionPath, runtime: "oh-my-pi" });
    await expect(access(join(root, ".harness", "missions", "no-writes", "runs"))).rejects.toThrow();
  });

  test("fails on broken YAML", async () => {
    const missionPath = await writeRawMission("broken", "schema_version: uh.mission.v0\nid: broken\ncontext: [unclosed\n");
    const result = await checkMissionPackets({ root, missionPath, runtime: "oh-my-pi" });
    expect(result.ok).toBe(false);
    expect(failStartingWith(result, "schema")).toBeDefined();
  });

  test("fails when a context.read_first path does not exist", async () => {
    const missionPath = await writeMission("missing-read-first", {
      context: { read_first: ["docs/missing.md"], source_links: [] },
    });
    const result = await checkMissionPackets({ root, missionPath, runtime: "oh-my-pi" });
    expect(result.ok).toBe(false);
    const line = failStartingWith(result, "read_first docs/missing.md");
    expect(line?.reason).toMatch(/does not exist/);
  });

  test("fails when an expected output is outside guard.write_roots", async () => {
    const missionPath = await writeMission("output-outside-roots", {
      expected_outputs: { files: ["lib/x.ts"] },
      guard: { write_roots: ["src"] },
    });
    const result = await checkMissionPackets({ root, missionPath, runtime: "oh-my-pi" });
    expect(result.ok).toBe(false);
    const line = failStartingWith(result, "expected_output lib/x.ts");
    expect(line?.reason).toMatch(/outside guard.write_roots/);
  });

  test("fails when a 'Change only' constraint names a missing path outside every write root", async () => {
    const missionPath = await writeMission("constraint-outside-roots", {
      guard: { write_roots: ["src"] },
      constraints: ["Change only lib/orphan.ts and src/kept.ts."],
    });
    const result = await checkMissionPackets({ root, missionPath, runtime: "oh-my-pi" });
    expect(result.ok).toBe(false);
    expect(failStartingWith(result, "constraint lib/orphan.ts")?.reason).toMatch(/Change only/);
    // src/kept.ts is not created but lies inside the write root, so it passes.
    expect(result.checks.find((line) => line.name === "constraint src/kept.ts")?.status).toBe("PASS");
  });

  test("fails when a grounding claim's literal is absent", async () => {
    await mkdir(join(root, "docs"), { recursive: true });
    await writeFile(join(root, "docs", "README.md"), "# Alpha\n", "utf-8");
    const missionPath = await writeMission("grounding-absent", {
      grounding: [{ claim: "The README mentions beta", path: "docs/README.md", contains: "beta" }],
    });
    const result = await checkMissionPackets({ root, missionPath, runtime: "oh-my-pi" });
    expect(result.ok).toBe(false);
    expect(failStartingWith(result, "grounding")?.reason).toMatch(/does not contain the literal "beta"/);
  });

  test("fails when a grounding claim points at a file that does not exist", async () => {
    const missionPath = await writeMission("grounding-missing-file", {
      grounding: [{ claim: "Design exists", path: "docs/nope.md", contains: "x" }],
    });
    const result = await checkMissionPackets({ root, missionPath, runtime: "oh-my-pi" });
    expect(result.ok).toBe(false);
    expect(failStartingWith(result, "grounding")?.reason).toMatch(/does not exist/);
  });

  test("an omp packet with a command-code-only override key fails runtime validation", async () => {
    const missionPath = await writeMission("omp-bad-override", {
      runtime_config_overrides: { permission_mode: "yolo" },
    });
    const result = await checkMissionPackets({ root, missionPath, runtime: "oh-my-pi" });
    expect(result.ok).toBe(false);
    const line = failStartingWith(result, "runtime overrides [oh-my-pi]");
    expect(line?.reason).toMatch(/permission_mode|validation failed/i);
  });

  test("a team packet validates each worker packet it names", async () => {
    const missionPath = await writeMission("team-missing-worker", {
      shape: "team",
      team: {
        workers: [{ role: "backend", adapter: "oh-my-pi", mission_id: "worker-backend" }],
        leader: { adapter: "oh-my-pi" },
      },
    });
    const result = await checkMissionPackets({ root, missionPath });
    expect(result.ok).toBe(false);
    expect(failStartingWith(result, "worker packet schema [worker backend]")).toBeDefined();
  });

  test("a team packet with a valid named worker packet passes", async () => {
    await writeMission("worker-backend");
    const missionPath = await writeMission("team-valid", {
      shape: "team",
      team: {
        workers: [{ role: "backend", adapter: "oh-my-pi", mission_id: "worker-backend" }],
        leader: { adapter: "oh-my-pi" },
      },
    });
    const result = await checkMissionPackets({ root, missionPath });
    expect(result.ok, renderMissionCheckLines(result).join("\n")).toBe(true);
    expect(result.checks.map((line) => line.name)).toContain("worker packet schema [worker backend]");
  });

  test("fails when a worker's expected output is outside its write roots", async () => {
    const missionPath = await writeMission("team-worker-output", {
      shape: "team",
      team: {
        workers: [{
          role: "backend",
          adapter: "oh-my-pi",
          guard: { write_roots: ["src"] },
          expected_outputs: { files: ["lib/x.ts"] },
        }],
        leader: { adapter: "oh-my-pi" },
      },
    });
    const result = await checkMissionPackets({ root, missionPath });
    expect(result.ok).toBe(false);
    const line = failStartingWith(result, "expected_output lib/x.ts [worker backend]");
    expect(line?.reason).toMatch(/outside guard.write_roots/);
  });
});

describe("extractChangeOnlyPaths", () => {
  test("pulls only path-like tokens out of a Change only constraint", () => {
    expect(extractChangeOnlyPaths("Change only the new src/harness/mission-check.ts, src/schema/mission.ts (the grounding field), the new tests/mission-check.test.ts and docs/handbook/packet-rules.md.")).toEqual([
      "src/harness/mission-check.ts",
      "src/schema/mission.ts",
      "tests/mission-check.test.ts",
      "docs/handbook/packet-rules.md",
    ]);
  });

  test("ignores constraints without a Change only directive", () => {
    expect(extractChangeOnlyPaths("Do not touch src/a.ts")).toEqual([]);
  });
});

describe("uh mission check CLI", () => {
  test("emits one PASS line per check and exits zero for a valid packet", async () => {
    await mkdir(join(root, "docs"), { recursive: true });
    await writeFile(join(root, "docs", "README.md"), "# Alpha\n", "utf-8");
    const missionPath = await writeMission("cli-valid", {
      context: { read_first: ["docs/README.md"], source_links: [] },
      grounding: [{ claim: "README documents alpha", path: "docs/README.md", contains: "Alpha" }],
    });

    const { stdout, stderr } = await execFileP(process.execPath, [
      "--import", "tsx", "src/cli.ts",
      "mission", "check", missionPath,
      "--runtime", "oh-my-pi",
      "--root", root,
    ], {
      cwd: process.cwd(),
      timeout: 30_000,
      env: { ...process.env, UH_TELEMETRY: "", UH_POSTHOG_API_KEY: "" },
    });

    expect(stderr).toBe("");
    expect(stdout).toContain("PASS schema");
    expect(stdout).toContain("PASS read_first docs/README.md");
  });

  test("--json reports failures and exits non-zero", async () => {
    const missionPath = await writeMission("cli-fails", {
      context: { read_first: ["docs/missing.md"], source_links: [] },
    });

    const failure = await execFileP(process.execPath, [
      "--import", "tsx", "src/cli.ts",
      "mission", "check", missionPath,
      "--runtime", "oh-my-pi",
      "--root", root,
      "--json",
    ], {
      cwd: process.cwd(),
      timeout: 30_000,
      env: { ...process.env, UH_TELEMETRY: "", UH_POSTHOG_API_KEY: "" },
    }).catch((error: Error & { code?: number; stdout?: string }) => error);

    expect((failure as { code?: number }).code).toBe(1);
    const parsed = JSON.parse((failure as { stdout: string }).stdout) as {
      ok: boolean;
      checks: Array<{ name: string; status: string; reason?: string }>;
    };
    expect(parsed.ok).toBe(false);
    const readFirst = parsed.checks.find((line) => line.name.startsWith("read_first docs/missing.md"));
    expect(readFirst?.status).toBe("FAIL");
    expect(readFirst?.reason).toMatch(/does not exist/);
  });
});
