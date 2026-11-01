import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { stringify } from "yaml";
import { initializeHarness } from "../src/harness/init.js";
import { addAdapter } from "../src/harness/adapter-add.js";
import { dryRunCommandCode } from "../src/adapters/command-code.js";
import { dryRunOhMyPi } from "../src/adapters/oh-my-pi.js";
import { dryRunCodex } from "../src/adapters/codex.js";

const execFileP = promisify(execFile);

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

let ROOTS: string[] = [];

async function makeRoot(runtime: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), `uh-dry-run-${runtime}-`));
  ROOTS.push(root);
  await initializeHarness(root);
  await addAdapter(root, runtime);
  return root;
}

async function writeMission(root: string, id: string, overrides: Record<string, unknown> = {}): Promise<string> {
  const missionDir = join(root, ".harness", "missions", id);
  await mkdir(missionDir, { recursive: true });
  const missionPath = join(missionDir, "mission.yaml");
  await writeFile(missionPath, stringify({
    schema_version: "uh.mission.v0",
    id,
    title: `Mission ${id}`,
    workflow_profile: "research-docs",
    objective: "Dry-run must plan with the same overrides as a real run.",
    ...overrides,
  }), "utf-8");
  return missionPath;
}

async function writeTemplate(root: string, id: string, fields: Record<string, unknown> = {}): Promise<void> {
  const templatesDir = join(root, ".harness", "templates");
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

beforeEach(() => {
  ROOTS = [];
});

afterEach(async () => {
  for (const root of ROOTS) {
    await rm(root, { recursive: true, force: true });
  }
  ROOTS = [];
});

describe("adapter dry-run honors extraRuntimeConfigOverrides", () => {
  test("command-code plans a model supplied only by the override and refuses without one", async () => {
    const root = await makeRoot("command-code");
    const missionPath = await writeMission(root, "cc-model", {
      runtime_config_overrides: { permission_mode: "yolo" },
    });

    const planned = await dryRunCommandCode(root, missionPath, {
      extraRuntimeConfigOverrides: { model: "override-model" },
    });
    expect(planned.errors).toEqual([]);
    expect(planned.args).toContain("override-model");
    expect(planned.args).toContain("-m");

    const withoutOverride = await dryRunCommandCode(root, missionPath).catch((e: Error) => e);
    expect(withoutOverride).toBeInstanceOf(Error);
    expect((withoutOverride as Error).message).toMatch(/explicit runtime_config model/);
  });

  test("oh-my-pi plans --model from the override and omits it without one", async () => {
    const root = await makeRoot("oh-my-pi");
    const missionPath = await writeMission(root, "omp-model");

    const planned = await dryRunOhMyPi(root, missionPath, {
      extraRuntimeConfigOverrides: { model: "override-model" },
    });
    expect(planned.errors).toEqual([]);
    expect(planned.args).toContain("--model");
    expect(planned.args).toContain("override-model");

    const withoutOverride = await dryRunOhMyPi(root, missionPath);
    expect(withoutOverride.args).not.toContain("--model");
    expect(withoutOverride.args).not.toContain("override-model");
  });

  test("codex plans -m from the override and omits it without one", async () => {
    const root = await makeRoot("codex");
    const missionPath = await writeMission(root, "codex-model");

    const planned = await dryRunCodex(root, missionPath, {
      extraRuntimeConfigOverrides: { model: "override-model" },
    });
    expect(planned.errors).toEqual([]);
    expect(planned.args).toContain("-m");
    expect(planned.args).toContain("override-model");

    const withoutOverride = await dryRunCodex(root, missionPath);
    expect(withoutOverride.args).not.toContain("-m");
    expect(withoutOverride.args).not.toContain("override-model");
  });
});

describe("uh mission dry-run prints the command a real run would execute", () => {
  test("a mission without a model prints the template model in the planned command", async () => {
    const root = await makeRoot("oh-my-pi");
    await writeTemplate(root, "balanced", {
      runtime_config_overrides: { model: "template-model" },
    });
    const missionPath = await writeMission(root, "cli-template-model");

    const { stdout, stderr } = await runUh([
      "mission", "dry-run", missionPath,
      "--template", "balanced",
      "--runtime", "oh-my-pi",
      "--root", root,
    ]);

    expect(stderr).toBe("");
    expect(stdout).toContain("Template: balanced");
    expect(stdout).toContain("Command: omp");
    expect(stdout).toContain("--model template-model");
  });

  test("an explicit --runtime-config-overrides wins over the template in the planned command", async () => {
    const root = await makeRoot("oh-my-pi");
    await writeTemplate(root, "balanced", {
      runtime_config_overrides: { model: "template-model" },
    });
    const missionPath = await writeMission(root, "cli-override-model");

    const { stdout } = await runUh([
      "mission", "dry-run", missionPath,
      "--template", "balanced",
      "--runtime-config-overrides", "{\"model\":\"cli-model\"}",
      "--root", root,
    ]);

    expect(stdout).toContain("--model cli-model");
    expect(stdout).not.toContain("--model template-model");
  });
});
