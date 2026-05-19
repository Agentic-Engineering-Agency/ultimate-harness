import { describe, expect, test, beforeEach, afterEach } from "vitest";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { parse, stringify } from "yaml";
import { initializeHarness } from "../src/harness/init.js";
import { recordManualVerdict } from "../src/harness/verdict.js";
import { RuntimeResultSchema } from "../src/schema/artifacts.js";

const execFileP = promisify(execFile);

let TEST_ROOT: string;
const CLI = join(process.cwd(), "src", "cli.ts");
const RUNNER = join(process.cwd(), "node_modules", ".bin", "tsx");

beforeEach(async () => {
  TEST_ROOT = await mkdtemp(join(tmpdir(), "uh-test-verdict-"));
  await initializeHarness(TEST_ROOT);
});

afterEach(async () => {
  if (TEST_ROOT) await rm(TEST_ROOT, { recursive: true, force: true });
});

async function seedRuntimeResult(missionId: string): Promise<string> {
  const dir = join(TEST_ROOT, ".harness", "missions", missionId);
  await mkdir(dir, { recursive: true });
  const runtimeResultPath = join(dir, "runtime-result.yaml");
  const doc = {
    schema_version: "uh.runtime-result.v0",
    mission_id: missionId,
    runtime: "hermes",
    status: "passed",
    started_at: "2026-05-19T00:00:00.000Z",
    finished_at: "2026-05-19T00:01:00.000Z",
    exit_code: 0,
    prompt_path: "prompt.md",
    stdout_path: "stdout.log",
    stderr_path: "stderr.log",
    errors: [],
  };
  await writeFile(runtimeResultPath, stringify(doc), "utf-8");
  return runtimeResultPath;
}

describe("UH-76 runtime-result verdict schema", () => {
  test("round-trips a verdict block through the schema", () => {
    const doc = RuntimeResultSchema.parse({
      schema_version: "uh.runtime-result.v0",
      mission_id: "m",
      runtime: "codex",
      status: "passed",
      started_at: "2026-05-19T00:00:00.000Z",
      finished_at: "2026-05-19T00:01:00.000Z",
      prompt_path: "prompt.md",
      stdout_path: "stdout.log",
      stderr_path: "stderr.log",
      errors: [],
      verdict: {
        value: "needs-attention",
        rationale: "Edge case noted",
        recorded_by: "manual",
        recorded_at: "2026-05-19T00:05:00.000Z",
      },
    });
    expect(doc.verdict?.value).toBe("needs-attention");
  });

  test("rejects manual non-pass verdict with empty rationale", () => {
    expect(() => RuntimeResultSchema.parse({
      schema_version: "uh.runtime-result.v0",
      mission_id: "m",
      runtime: "codex",
      status: "passed",
      started_at: "2026-05-19T00:00:00.000Z",
      finished_at: "2026-05-19T00:01:00.000Z",
      prompt_path: "prompt.md",
      stdout_path: "stdout.log",
      stderr_path: "stderr.log",
      errors: [],
      verdict: {
        value: "needs-remediation",
        rationale: "  ",
        recorded_by: "manual",
        recorded_at: "2026-05-19T00:05:00.000Z",
      },
    })).toThrow(/non-empty rationale/);
  });

  test("auto verdict allows empty rationale", () => {
    const doc = RuntimeResultSchema.parse({
      schema_version: "uh.runtime-result.v0",
      mission_id: "m",
      runtime: "codex",
      status: "passed",
      started_at: "2026-05-19T00:00:00.000Z",
      finished_at: "2026-05-19T00:01:00.000Z",
      prompt_path: "prompt.md",
      stdout_path: "stdout.log",
      stderr_path: "stderr.log",
      errors: [],
      verdict: {
        value: "pass",
        rationale: "",
        recorded_by: "auto",
        recorded_at: "2026-05-19T00:05:00.000Z",
      },
    });
    expect(doc.verdict?.recorded_by).toBe("auto");
  });
});

describe("UH-76 recordManualVerdict", () => {
  test("records pass with empty rationale", async () => {
    const path = await seedRuntimeResult("m1");
    const result = await recordManualVerdict({
      root: TEST_ROOT,
      missionId: "m1",
      value: "pass",
      now: "2026-05-19T01:00:00.000Z",
    });
    expect(result.document.verdict?.value).toBe("pass");
    expect(result.document.verdict?.recorded_by).toBe("manual");
    const yaml = parse(await readFile(path, "utf-8")) as Record<string, unknown>;
    expect((yaml.verdict as Record<string, unknown>).value).toBe("pass");
    expect(yaml.exit_code).toBe(0);
    expect(yaml.status).toBe("passed");
    const audit = await readFile(join(TEST_ROOT, ".harness", "audit.log"), "utf-8");
    expect(audit.trim().split("\n")).toEqual([
      "2026-05-19T01:00:00.000Z verdict.recorded m1 pass by=manual",
    ]);
  });

  test("records needs-attention with rationale", async () => {
    await seedRuntimeResult("m2");
    const result = await recordManualVerdict({
      root: TEST_ROOT,
      missionId: "m2",
      value: "needs-attention",
      rationale: "subtle flake",
      now: "2026-05-19T02:00:00.000Z",
    });
    expect(result.document.verdict?.value).toBe("needs-attention");
    expect(result.document.verdict?.rationale).toBe("subtle flake");
  });

  test("records needs-remediation with rationale", async () => {
    await seedRuntimeResult("m3");
    const result = await recordManualVerdict({
      root: TEST_ROOT,
      missionId: "m3",
      value: "needs-remediation",
      rationale: "must rework",
      now: "2026-05-19T03:00:00.000Z",
    });
    expect(result.document.verdict?.value).toBe("needs-remediation");
  });

  test("rejects manual non-pass without rationale", async () => {
    await seedRuntimeResult("m4");
    await expect(
      recordManualVerdict({ root: TEST_ROOT, missionId: "m4", value: "needs-attention" }),
    ).rejects.toThrow(/require --rationale/);
    await expect(
      recordManualVerdict({ root: TEST_ROOT, missionId: "m4", value: "needs-remediation", rationale: "  " }),
    ).rejects.toThrow(/require --rationale/);
  });

  test("is idempotent: second invocation overwrites verdict, audit log grows", async () => {
    const path = await seedRuntimeResult("m5");
    await recordManualVerdict({
      root: TEST_ROOT,
      missionId: "m5",
      value: "needs-remediation",
      rationale: "first pass",
      now: "2026-05-19T05:00:00.000Z",
    });
    await recordManualVerdict({
      root: TEST_ROOT,
      missionId: "m5",
      value: "pass",
      now: "2026-05-19T05:30:00.000Z",
    });
    const yaml = parse(await readFile(path, "utf-8")) as Record<string, unknown>;
    expect((yaml.verdict as Record<string, unknown>).value).toBe("pass");
    expect((yaml.verdict as Record<string, unknown>).recorded_at).toBe("2026-05-19T05:30:00.000Z");
    const audit = (await readFile(join(TEST_ROOT, ".harness", "audit.log"), "utf-8"))
      .trim().split("\n");
    expect(audit).toHaveLength(2);
    expect(audit[0]).toContain("needs-remediation");
    expect(audit[1]).toContain("pass");
  });

  test("throws when runtime-result.yaml is missing", async () => {
    await expect(
      recordManualVerdict({ root: TEST_ROOT, missionId: "ghost", value: "pass" }),
    ).rejects.toThrow(/runtime-result\.yaml not found/);
  });
});

describe("UH-76 uh mission verdict CLI", () => {
  test("records via CLI for each of the three values", async () => {
    await seedRuntimeResult("m-cli");
    for (const value of ["pass", "needs-attention", "needs-remediation"]) {
      const args = [CLI, "mission", "verdict", "m-cli", value, "--root", TEST_ROOT];
      if (value !== "pass") {
        args.push("--rationale", `because ${value}`);
      }
      const { stdout } = await execFileP(RUNNER, args, { env: { ...process.env, NODE_ENV: "test" } });
      expect(stdout).toContain(`[OK] verdict recorded: ${value}`);
    }
    const audit = (await readFile(join(TEST_ROOT, ".harness", "audit.log"), "utf-8"))
      .trim().split("\n");
    expect(audit).toHaveLength(3);
  });

  test("fails when --rationale is missing on a non-pass verdict", async () => {
    await seedRuntimeResult("m-cli-fail");
    await expect(execFileP(RUNNER, [
      CLI, "mission", "verdict", "m-cli-fail", "needs-remediation", "--root", TEST_ROOT,
    ])).rejects.toMatchObject({ code: 1 });
  });
});
