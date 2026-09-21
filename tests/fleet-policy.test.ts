import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { initializeHarness } from "../src/harness/init.js";
import { assertFleetAdmission, decideFleetAdmission } from "../src/harness/fleet-policy.js";
import { validateProject } from "../src/schema/project.js";

const ROOT = "/tmp/uh-test-fleet-policy";
const LUNA = "openai-codex/gpt-5.6-luna";
const fleet = { routes: [
  { adapter: "oh-my-pi", model: LUNA, roles: ["worker" as const] },
  { adapter: "command-code", model: "z-ai/glm-5.3-flash", roles: ["orchestrator" as const, "worker" as const] },
] };

describe("fleet admission decision", () => {
  test("no fleet policy admits everything", () => {
    expect(decideFleetAdmission(undefined, { adapter: "codex", model: undefined, role: "worker" })).toBeUndefined();
  });
  test("an authorized adapter, model and role is admitted", () => {
    expect(decideFleetAdmission(fleet, { adapter: "oh-my-pi", model: LUNA, role: "worker" })).toBeUndefined();
    expect(decideFleetAdmission(fleet, { adapter: "command-code", model: "z-ai/glm-5.3-flash", role: "orchestrator" })).toBeUndefined();
  });
  test("an unassigned model is refused, because the runtime would pick its own default", () => {
    expect(decideFleetAdmission(fleet, { adapter: "oh-my-pi", model: undefined, role: "worker" })).toMatch(/no assigned model/);
  });
  test("a model outside the fleet is refused and named", () => {
    expect(decideFleetAdmission(fleet, { adapter: "oh-my-pi", model: "google-antigravity/gemini-3.7-flash", role: "worker" })).toMatch(/google-antigravity\/gemini-3\.7-flash/);
  });
  test("an authorized model on the wrong adapter is refused", () => {
    expect(decideFleetAdmission(fleet, { adapter: "codex", model: LUNA, role: "worker" })).toMatch(/codex/);
  });
  test("a worker-only model cannot be an orchestrator", () => {
    expect(decideFleetAdmission(fleet, { adapter: "oh-my-pi", model: LUNA, role: "orchestrator" })).toMatch(/orchestrator/);
  });
  test("model identifiers are compared exactly", () => {
    expect(decideFleetAdmission(fleet, { adapter: "oh-my-pi", model: LUNA.toUpperCase(), role: "worker" })).toBeDefined();
  });
});

describe("project fleet schema", () => {
  const base = { schema_version: "uh.project.v0", id: "p", name: "p", root_path: ".", created_at: "2026-09-21T00:00:00.000Z" };
  test("roles default to worker and unknown keys are rejected", () => {
    const project = validateProject({ ...base, fleet: { routes: [{ adapter: "oh-my-pi", model: LUNA }] } });
    expect(project.fleet?.routes[0].roles).toEqual(["worker"]);
    expect(() => validateProject({ ...base, fleet: { routes: [{ adapter: "oh-my-pi", model: LUNA, rolez: [] }] } })).toThrow();
    expect(() => validateProject({ ...base, fleet: { routes: [] } })).toThrow();
  });
});

describe("fleet admission from disk", () => {
  async function mission(id: string, extra = ""): Promise<string> {
    const dir = join(ROOT, ".harness", "missions", id);
    await mkdir(dir, { recursive: true });
    const file = join(dir, "mission.yaml");
    await writeFile(file, `schema_version: uh.mission.v0\nid: ${id}\nname: m\nworkflow_profile: research-docs\nverification:\n  checks: []\n${extra}`, "utf-8");
    return file;
  }
  async function setFleet(): Promise<void> {
    const file = join(ROOT, ".harness", "project.yaml");
    await writeFile(file, `${await readFile(file, "utf-8")}\nfleet:\n  routes:\n    - adapter: oh-my-pi\n      model: ${LUNA}\n`, "utf-8");
  }
  beforeEach(async () => { await rm(ROOT, { recursive: true, force: true }); await mkdir(ROOT, { recursive: true }); await initializeHarness(ROOT); });
  afterEach(() => rm(ROOT, { recursive: true, force: true }));

  test("a project without a fleet block admits any run", async () => {
    await expect(assertFleetAdmission(ROOT, await mission("open"), "oh-my-pi")).resolves.toBeUndefined();
  });
  test("the mission model is admitted and CLI overrides are judged in its place", async () => {
    await setFleet();
    const file = await mission("pinned", `runtime_config_overrides:\n  model: ${LUNA}\n`);
    await expect(assertFleetAdmission(ROOT, file, "oh-my-pi")).resolves.toBeUndefined();
    await expect(assertFleetAdmission(ROOT, file, "oh-my-pi", { model: "anthropic/claude-fable-5" })).rejects.toThrow(/Fleet policy refuses.*anthropic\/claude-fable-5/);
  });
  test("a mission that assigns no model is refused under a fleet policy", async () => {
    await setFleet();
    await expect(assertFleetAdmission(ROOT, await mission("unassigned"), "oh-my-pi")).rejects.toThrow(/no assigned model/);
  });
});
