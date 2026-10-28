import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { stringify } from "yaml";
import { initializeHarness } from "../src/harness/init.js";
import { addAdapter } from "../src/harness/adapter-add.js";
import { runOhMyPi } from "../src/adapters/oh-my-pi.js";
import registerOhMyPiGuard from "../src/extensions/tool-guard/omp.js";

type ToolCallEvent = { toolName?: string; input?: unknown };
type ToolCallHandler = (event: ToolCallEvent) => unknown;

/** Register the extension with a stand-in `pi` and return its tool_call handler. */
function captureToolCall(): ToolCallHandler {
  const handlers: ToolCallHandler[] = [];
  registerOhMyPiGuard({ on: (_event, callback) => { handlers.push(callback); } });
  const handler = handlers[0];
  if (!handler) throw new Error("the oh-my-pi extension did not register a tool_call handler");
  return handler;
}

async function ompFixture(): Promise<{ root: string; missionPath: string }> {
  const root = await mkdtemp(path.join(tmpdir(), "uh-omp-hook-"));
  await initializeHarness(root);
  await addAdapter(root, "oh-my-pi");
  const missionPath = path.join(root, ".harness", "missions", "one", "mission.yaml");
  await mkdir(path.dirname(missionPath), { recursive: true });
  await writeFile(missionPath, stringify({
    schema_version: "uh.mission.v0",
    id: "one",
    name: "oh-my-pi guard extension",
    description: "Exercise the oh-my-pi guard extension against its own artifact.",
    workflow_profile: "research-docs",
    guard: { write_roots: ["out"] },
  }));
  return { root, missionPath };
}

let snapshotRoot: string;
let previousDist: string | undefined;
let previousCache: string | undefined;

beforeEach(async () => {
  snapshotRoot = await mkdtemp(path.join(tmpdir(), "uh-omp-hook-snapshot-"));
  const hook = path.join(snapshotRoot, "dist", "extensions", "tool-guard", "omp.js");
  await mkdir(path.dirname(hook), { recursive: true });
  await writeFile(hook, "export default function () {}\n");
  previousDist = process.env.UH_HARNESS_DIST;
  previousCache = process.env.UH_RUNTIME_SNAPSHOT_CACHE;
  process.env.UH_HARNESS_DIST = path.join(snapshotRoot, "dist");
  process.env.UH_RUNTIME_SNAPSHOT_CACHE = path.join(snapshotRoot, "cache");
});

afterEach(async () => {
  delete process.env.UH_TOOL_GUARD_POLICY;
  delete process.env.UH_TOOL_GUARD_LOG;
  if (previousDist === undefined) delete process.env.UH_HARNESS_DIST; else process.env.UH_HARNESS_DIST = previousDist;
  if (previousCache === undefined) delete process.env.UH_RUNTIME_SNAPSHOT_CACHE; else process.env.UH_RUNTIME_SNAPSHOT_CACHE = previousCache;
  await rm(snapshotRoot, { recursive: true, force: true });
});

describe("oh-my-pi guard extension", () => {
  test("applies the artifact the oh-my-pi adapter writes", async () => {
    const { root, missionPath } = await ompFixture();
    try {
      await runOhMyPi(root, missionPath, {
        runId: "guarded-run",
        runner: async () => ({
          stdout: JSON.stringify({ type: "run_end", result: { finalText: "Complete", stopReason: "end_turn" } }),
          stderr: "",
          exitCode: 0,
          timedOut: false,
        }),
        collectDiff: async () => ({ patch: "" }),
      });

      const policyPath = path.join(path.dirname(missionPath), "runs", "guarded-run", "tool-guard.json");
      const artifact = JSON.parse(await readFile(policyPath, "utf8")) as Record<string, unknown>;
      expect(artifact).toMatchObject({ schema_version: "uh.tool-guard.v0", worker_root: root, write_roots: ["out"] });

      const logPath = path.join(root, "omp-guard.log");
      process.env.UH_TOOL_GUARD_POLICY = policyPath;
      process.env.UH_TOOL_GUARD_LOG = logPath;
      const handler = captureToolCall();

      // A read is allowed.
      const allowedRead = await handler({ toolName: "read_file", input: { file_path: path.join(root, "out", "allowed.txt") } });
      expect(allowedRead).toBeUndefined();

      // A write outside the write roots is denied and logged.
      const deniedWrite = await handler({ toolName: "write_file", input: { file_path: path.join(root, "outside", "unauthorized.txt") } }) as { block?: boolean; reason?: string };
      expect(deniedWrite.block).toBe(true);
      expect(deniedWrite.reason).toContain("CONTRACT: write only under out");

      // A write inside the write roots is allowed.
      const allowedWrite = await handler({ toolName: "write_file", input: { file_path: path.join(root, "out", "inside.txt") } });
      expect(allowedWrite).toBeUndefined();

      const entries = (await readFile(logPath, "utf8")).trim().split(/\r?\n/).map(l => JSON.parse(l) as Record<string, unknown>);
      expect(entries).toHaveLength(1);
      expect(entries[0]).toMatchObject({ tool: "write_file", class: "write_outside" });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
