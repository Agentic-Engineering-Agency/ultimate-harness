import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { stringify } from "yaml";
import { initializeHarness } from "../src/harness/init.js";

const execFileP = promisify(execFile);

let TEST_ROOT: string;

async function runUh(args: string[]) {
  return execFileP(process.execPath, ["--import", "tsx", "src/cli.ts", ...args], {
    cwd: process.cwd(),
    timeout: 30_000,
    env: {
      ...process.env,
      UH_TELEMETRY: "",
      UH_POSTHOG_API_KEY: "",
    },
  });
}

async function runUhFailure(args: string[]) {
  try {
    const result = await runUh(args);
    throw new Error(`expected uh ${args.join(" ")} to fail, got stdout=${result.stdout} stderr=${result.stderr}`);
  } catch (err) {
    const e = err as Error & { code?: number; stdout?: string; stderr?: string };
    expect(e.code).not.toBe(0);
    return { stdout: e.stdout ?? "", stderr: e.stderr ?? "", code: e.code };
  }
}

async function writeMission(id: string, overrides: Record<string, unknown> = {}) {
  const missionDir = join(TEST_ROOT, ".harness", "missions", id);
  await mkdir(missionDir, { recursive: true });
  const missionPath = join(missionDir, "mission.yaml");
  await writeFile(missionPath, stringify({
    schema_version: "uh.mission.v0",
    id,
    title: `Mission ${id}`,
    workflow_profile: "spec-first-feature",
    objective: "Exercise session templates.",
    ...overrides,
  }), "utf-8");
  return missionPath;
}

async function writeTemplate(id: string, fields: Record<string, unknown> = {}) {
  const templatesDir = join(TEST_ROOT, ".harness", "templates");
  await mkdir(templatesDir, { recursive: true });
  await writeFile(join(templatesDir, `${id}.yaml`), stringify({
    schema_version: "uh.session-template.v0",
    id,
    title: `Template ${id}`,
    tier: "balanced",
    containment: "standard",
    adapter: "oh-my-pi",
    ...fields,
  }), "utf-8");
}

async function installAdapterManifest(runtime: string) {
  await mkdir(join(TEST_ROOT, ".harness", "adapters"), { recursive: true });
  await writeFile(
    join(TEST_ROOT, ".harness", "adapters", `${runtime}.yaml`),
    await readFile(join(process.cwd(), ".harness", "adapters", `${runtime}.yaml`), "utf-8"),
    "utf-8",
  );
}

function effectiveOverrides(stdout: string): Record<string, unknown> {
  const line = stdout.split("\n").find((candidate) => candidate.startsWith("Template effective overrides: "));
  expect(line, `no effective overrides line in:\n${stdout}`).toBeDefined();
  return JSON.parse(line!.slice("Template effective overrides: ".length)) as Record<string, unknown>;
}

beforeEach(async () => {
  TEST_ROOT = await mkdtemp(join(tmpdir(), "uh-test-template-"));
  await initializeHarness(TEST_ROOT);
  await installAdapterManifest("oh-my-pi");
});

afterEach(async () => {
  if (TEST_ROOT) {
    await rm(TEST_ROOT, { recursive: true, force: true });
  }
});

describe("uh mission dry-run --template", () => {
  test("applies a template: prints id, tier, containment, overridden keys, and the template's model and limits", async () => {
    await writeTemplate("balanced", {
      runtime_config_overrides: { model: "template-model", thinking: "low" },
      limits: { max_turns: 15 },
    });
    const missionPath = await writeMission("template-applied");

    const { stdout, stderr } = await runUh([
      "mission", "dry-run", missionPath, "--template", "balanced", "--runtime", "oh-my-pi", "--root", TEST_ROOT,
    ]);

    expect(stderr).toBe("");
    expect(stdout).toContain("Template: balanced");
    expect(stdout).toContain("tier=balanced");
    expect(stdout).toContain("containment=standard");
    expect(stdout).toContain("overridden_by_mission=none");
    expect(stdout).toContain("Command: omp");
    expect(effectiveOverrides(stdout)).toEqual({
      model: "template-model",
      thinking: "low",
      limits: { max_turns: 15 },
    });
  });

  test("mission values win over template values", async () => {
    await writeTemplate("balanced", {
      runtime_config_overrides: { model: "template-model", thinking: "low" },
      limits: { max_turns: 15 },
    });
    const missionPath = await writeMission("mission-wins", {
      runtime_config_overrides: { model: "mission-model" },
    });

    const { stdout } = await runUh(["mission", "dry-run", missionPath, "--template", "balanced", "--root", TEST_ROOT]);

    expect(stdout).toContain("overridden_by_mission=runtime_config_overrides");
    const overrides = effectiveOverrides(stdout);
    expect(overrides.model).toBe("mission-model");
    expect(overrides.limits).toEqual({ max_turns: 15 });
  });

  test("an explicit --runtime-config-overrides wins over both mission and template", async () => {
    await writeTemplate("balanced", {
      runtime_config_overrides: { model: "template-model" },
    });
    const missionPath = await writeMission("cli-wins", {
      runtime_config_overrides: { model: "mission-model" },
    });

    const { stdout } = await runUh([
      "mission", "dry-run", missionPath,
      "--template", "balanced",
      "--runtime-config-overrides", "{\"model\":\"cli-model\"}",
      "--root", TEST_ROOT,
    ]);

    expect(effectiveOverrides(stdout).model).toBe("cli-model");
  });

  test("refuses a strict template when the mission has no narrow write roots, with exit code 2", async () => {
    await writeTemplate("strict-tpl", { containment: "strict" });
    const missionPath = await writeMission("no-write-roots");

    const res = await runUhFailure(["mission", "dry-run", missionPath, "--template", "strict-tpl", "--root", TEST_ROOT]);
    expect(res.code).toBe(2);
    expect(`${res.stdout}${res.stderr}`).toContain("[BLOCKED]");
    expect(`${res.stdout}${res.stderr}`).toMatch(/write_roots/i);
  });

  test("refuses an unknown template with exit code 2", async () => {
    const missionPath = await writeMission("unknown-template");

    const res = await runUhFailure(["mission", "dry-run", missionPath, "--template", "does-not-exist", "--root", TEST_ROOT]);
    expect(res.code).toBe(2);
    expect(`${res.stdout}${res.stderr}`).toContain("[BLOCKED]");
    expect(`${res.stdout}${res.stderr}`).toMatch(/session template not found/i);
  });

  test("refuses an invalid template with exit code 2", async () => {
    const templatesDir = join(TEST_ROOT, ".harness", "templates");
    await mkdir(templatesDir, { recursive: true });
    await writeFile(join(templatesDir, "invalid.yaml"), stringify({
      schema_version: "uh.session-template.v0",
      id: "invalid",
      title: "Invalid Template",
      tier: "not-a-tier",
      adapter: "oh-my-pi",
    }), "utf-8");
    const missionPath = await writeMission("invalid-template");

    const res = await runUhFailure(["mission", "dry-run", missionPath, "--template", "invalid", "--root", TEST_ROOT]);
    expect(res.code).toBe(2);
    expect(`${res.stdout}${res.stderr}`).toContain("[BLOCKED]");
  });

  test("refuses a --runtime that conflicts with the template adapter, naming both", async () => {
    await writeTemplate("balanced", { adapter: "oh-my-pi" });
    const missionPath = await writeMission("runtime-conflict");

    const res = await runUhFailure([
      "mission", "dry-run", missionPath, "--template", "balanced", "--runtime", "codex", "--root", TEST_ROOT,
    ]);
    expect(res.code).toBe(2);
    expect(`${res.stdout}${res.stderr}`).toContain("[BLOCKED]");
    expect(`${res.stdout}${res.stderr}`).toContain("codex");
    expect(`${res.stdout}${res.stderr}`).toContain("oh-my-pi");
  });
});
