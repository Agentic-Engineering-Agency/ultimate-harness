import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { stringify } from "yaml";
import { initializeHarness } from "../src/harness/init.js";
import { addAdapter } from "../src/harness/adapter-add.js";
import { putMissionPackets } from "../src/harness/mission-put.js";
import { registerLiveRun } from "../src/harness/live-runs.js";

const execFileP = promisify(execFile);

let root: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "uh-mission-put-"));
  await initializeHarness(root);
  await addAdapter(root, "hermes");
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

async function writePacket(
  id: string,
  overrides: Record<string, unknown> = {},
  dir = join(root, "out"),
): Promise<string> {
  await mkdir(dir, { recursive: true });
  const file = join(dir, `${id}.yaml`);
  await writeFile(file, stringify({
    schema_version: "uh.mission.v0",
    id,
    title: `Mission ${id}`,
    workflow_profile: "research-docs",
    objective: "Install this packet.",
    ...overrides,
  }), "utf-8");
  return file;
}

const installedPath = (id: string): string => join(root, ".harness", "missions", id, "mission.yaml");
const auditPath = (): string => join(root, ".harness", "audit", "events.ndjson");

describe("putMissionPackets", () => {
  test("a valid packet installs at .harness/missions/<id>/mission.yaml and audits its id and sha256", async () => {
    const packet = await writePacket("alpha");

    const result = await putMissionPackets({ root, packetPaths: [packet] });

    expect(result.ok, JSON.stringify(result)).toBe(true);
    if (!result.ok) return;
    const target = installedPath("alpha");
    expect(result.installed).toHaveLength(1);
    expect(result.installed[0]).toMatchObject({ mission_id: "alpha", path: target });
    expect(result.installed[0].sha256).toMatch(/^[0-9a-f]{64}$/);

    expect(await readFile(target, "utf-8")).toContain("id: alpha");

    const auditLines = (await readFile(auditPath(), "utf-8")).split("\n").filter((line) => line.length > 0);
    const event = JSON.parse(auditLines.at(-1) as string) as Record<string, unknown>;
    expect(event).toMatchObject({ event: "mission.put", mission_id: "alpha", sha256: result.installed[0].sha256 });
    expect(typeof event.timestamp).toBe("string");
    expect(result.auditLines).toHaveLength(1);
  });

  test("a failed check refuses and writes nothing", async () => {
    const packet = await writePacket("beta", {
      context: { read_first: ["docs/missing.md"], source_links: [] },
    });

    const result = await putMissionPackets({ root, packetPaths: [packet] });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.checks?.ok).toBe(false);
    expect(result.checks?.checks.some((line) => line.status === "FAIL" && line.name.startsWith("read_first"))).toBe(true);
    await expect(access(installedPath("beta"))).rejects.toThrow();
    await expect(access(join(root, ".harness", "missions", "beta"))).rejects.toThrow();
    expect(await readFile(auditPath(), "utf-8")).not.toContain("mission.put");
  });

  test("a malformed packet refuses with the schema check output and writes nothing", async () => {
    const dir = join(root, "out");
    await mkdir(dir, { recursive: true });
    const packet = join(dir, "broken.yaml");
    await writeFile(packet, "schema_version: uh.mission.v0\nid: broken\ncontext: [unclosed\n", "utf-8");

    const result = await putMissionPackets({ root, packetPaths: [packet] });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.checks?.checks[0]?.status).toBe("FAIL");
  });

  test("an existing target is refused without --replace and left untouched", async () => {
    const packet = await writePacket("gamma");
    expect((await putMissionPackets({ root, packetPaths: [packet] })).ok).toBe(true);
    const before = await readFile(installedPath("gamma"), "utf-8");

    const changed = await writePacket("gamma", { objective: "changed objective" });
    const result = await putMissionPackets({ root, packetPaths: [changed] });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toMatch(/already exists/);
    expect(await readFile(installedPath("gamma"), "utf-8")).toBe(before);
  });

  test("--replace refuses while a live run of that mission exists", async () => {
    const packet = await writePacket("delta");
    expect((await putMissionPackets({ root, packetPaths: [packet] })).ok).toBe(true);
    await registerLiveRun({
      projectRoot: root,
      artifactRoot: root,
      runId: "20260922T101500Z-aa11aa",
      missionId: "delta",
      runtime: "hermes",
    });

    const changed = await writePacket("delta", { objective: "changed objective" });
    const result = await putMissionPackets({ root, packetPaths: [changed], replace: true });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toMatch(/live run/);
  });

  test("--replace overwrites an existing target when no live run exists", async () => {
    const packet = await writePacket("epsilon");
    expect((await putMissionPackets({ root, packetPaths: [packet] })).ok).toBe(true);

    const changed = await writePacket("epsilon", { objective: "changed objective" });
    const result = await putMissionPackets({ root, packetPaths: [changed], replace: true });

    expect(result.ok, JSON.stringify(result)).toBe(true);
    expect(await readFile(installedPath("epsilon"), "utf-8")).toContain("changed objective");
  });

  test("a team packet installs the worker packets given alongside", async () => {
    const worker = await writePacket("worker-backend");
    const team = await writePacket("team-demo", {
      shape: "team",
      team: {
        workers: [{ role: "backend", adapter: "hermes", mission_id: "worker-backend" }],
        leader: { adapter: "hermes" },
      },
    });

    const result = await putMissionPackets({ root, packetPaths: [team, worker] });

    expect(result.ok, JSON.stringify(result)).toBe(true);
    expect(await readFile(installedPath("worker-backend"), "utf-8")).toContain("id: worker-backend");
    expect(await readFile(installedPath("team-demo"), "utf-8")).toContain("id: team-demo");
  });

  test("a team packet whose worker is neither given nor present refuses and fabricates nothing", async () => {
    const team = await writePacket("team-missing", {
      shape: "team",
      team: {
        workers: [{ role: "backend", adapter: "hermes", mission_id: "worker-absent" }],
        leader: { adapter: "hermes" },
      },
    });

    const result = await putMissionPackets({ root, packetPaths: [team] });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.checks).toBeDefined();
    await expect(access(installedPath("team-missing"))).rejects.toThrow();
    await expect(access(installedPath("worker-absent"))).rejects.toThrow();
  });

  test("a team packet installs a worker packet that is already present", async () => {
    const worker = await writePacket("worker-present");
    expect((await putMissionPackets({ root, packetPaths: [worker] })).ok).toBe(true);

    const team = await writePacket("team-present", {
      shape: "team",
      team: {
        workers: [{ role: "backend", adapter: "hermes", mission_id: "worker-present" }],
        leader: { adapter: "hermes" },
      },
    });
    const result = await putMissionPackets({ root, packetPaths: [team] });

    expect(result.ok, JSON.stringify(result)).toBe(true);
    expect(await readFile(installedPath("team-present"), "utf-8")).toContain("id: team-present");
  });
});

describe("uh mission put CLI", () => {
  test("installs a packet and prints the installed path", async () => {
    const packet = await writePacket("cli-put");

    const { stdout, stderr } = await execFileP(process.execPath, [
      "--import", "tsx", "src/cli.ts",
      "mission", "put", packet,
      "--root", root,
    ], {
      cwd: process.cwd(),
      timeout: 30_000,
      env: { ...process.env, UH_TELEMETRY: "", UH_POSTHOG_API_KEY: "" },
    });

    expect(stderr).toBe("");
    expect(stdout).toContain("Installed mission cli-put");
    expect(await readFile(installedPath("cli-put"), "utf-8")).toContain("id: cli-put");
  });

  test("a failing check exits non-zero and prints the checks", async () => {
    const packet = await writePacket("cli-refused", {
      context: { read_first: ["docs/missing.md"], source_links: [] },
    });

    const failure = await execFileP(process.execPath, [
      "--import", "tsx", "src/cli.ts",
      "mission", "put", packet,
      "--root", root,
    ], {
      cwd: process.cwd(),
      timeout: 30_000,
      env: { ...process.env, UH_TELEMETRY: "", UH_POSTHOG_API_KEY: "" },
    }).catch((error: Error & { code?: number; stdout?: string }) => error);

    expect((failure as { code?: number }).code).toBe(1);
    expect((failure as { stdout: string }).stdout).toContain("FAIL read_first docs/missing.md");
    await expect(access(installedPath("cli-refused"))).rejects.toThrow();
  });
});
