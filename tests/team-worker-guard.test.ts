import { describe, expect, test } from "vitest";
import { narrowGuard, workerGuard } from "../src/harness/guard-narrowing.js";
import { deriveWorkerPacket, resolveWorkerContract } from "../src/harness/team-run.js";
import type { SessionTemplate } from "../src/schema/session-template.js";

/**
 * A team worker's guard is the parent mission's guard, narrowed by its session template and by its own block, never
 * widened by either (U-404: the template's guard was dropped, and a worker's own guard was never applied).
 */
const template = (overrides: Partial<SessionTemplate> = {}): SessionTemplate => ({
  schema_version: "uh.session-template.v0", id: "t", title: "T", tier: "balanced", containment: "standard", adapter: "codex",
  runtime_config_overrides: {}, limits: {}, worker_rules: [], attempts: 1, ...overrides,
}) as SessionTemplate;

describe("narrowGuard", () => {
  test("restrictive flags can be switched on by a layer and never off", () => {
    const base = { deny_git_mutations: true, deny_network_clients: true };
    expect(narrowGuard(base, { deny_git_mutations: false, deny_network_clients: true }, "w1")).toMatchObject({ deny_git_mutations: true, deny_network_clients: true });
    expect(narrowGuard({}, { deny_shell: true }, "w1").deny_shell).toBe(true);
    expect(narrowGuard({ deny_shell: true }, { deny_shell: false }, "w1").deny_shell).toBe(true);
  });

  test("permissions can be taken away by a layer and never granted", () => {
    expect(narrowGuard({ allow_code_tools: true }, { allow_code_tools: false }, "w1").allow_code_tools).toBe(false);
    expect(narrowGuard({}, { allow_code_tools: true }, "w1").allow_code_tools).toBeUndefined();
    expect(narrowGuard({ allow_unconfined: true }, { allow_unconfined: true }, "w1").allow_unconfined).toBe(true);
    expect(narrowGuard({}, { allow_native_subagents: true }, "w1").allow_native_subagents).toBeUndefined();
  });

  test("write roots must stay inside the parent's", () => {
    expect(narrowGuard({ write_roots: ["src", "out"] }, { write_roots: ["out"] }, "w1").write_roots).toEqual(["out"]);
    expect(narrowGuard({ write_roots: ["src"] }, { write_roots: ["src/lib"] }, "w1").write_roots).toEqual(["src/lib"]);
    expect(() => narrowGuard({ write_roots: ["out"] }, { write_roots: ["docs"] }, "w1")).toThrow(/write root "docs" is outside the team's/);
    expect(() => narrowGuard({ write_roots: ["out"] }, { write_roots: ["../other"] }, "w1")).toThrow(/outside the team's/);
    // A parent with no roots allows any narrower set.
    expect(narrowGuard({}, { write_roots: ["out"] }, "w1").write_roots).toEqual(["out"]);
  });

  test("read roots keep to the parent's, and agent clients only grow", () => {
    expect(() => narrowGuard({ read_roots: ["docs"] }, { read_roots: ["../secrets"] }, "w1")).toThrow(/read root/);
    expect(narrowGuard({ agent_clients: ["codex"] }, { agent_clients: ["pi"] }, "w1").agent_clients?.sort()).toEqual(["codex", "pi"]);
  });
});

describe("a team worker's contract carries its narrowed guard", () => {
  const canonical = { schema_version: "uh.mission.v0", id: "m1", objective: "team", guard: { write_roots: ["src", "out"], deny_git_mutations: true } };
  const spec = (guard?: Record<string, unknown>) => ({ role: "w1", adapter: "codex", ...(guard ? { guard } : {}) }) as never;

  test("a template's guard reaches the worker's packet", () => {
    const contract = resolveWorkerContract({ ...canonical, guard: undefined }, spec(), undefined, template({ guard: { write_roots: ["out"], deny_network_clients: true } }));
    expect(contract.guard).toMatchObject({ write_roots: ["out"], deny_network_clients: true });
    expect(deriveWorkerPacket({ ...canonical, guard: undefined }, contract).guard).toMatchObject({ write_roots: ["out"] });
  });

  test("the worker's own guard is applied, inside the parent's", () => {
    const contract = resolveWorkerContract(canonical, spec({ write_roots: ["out"], deny_package_installs: true }));
    expect(contract.guard).toMatchObject({ write_roots: ["out"], deny_git_mutations: true, deny_package_installs: true });
  });

  test("a template or worker block cannot widen the parent's", () => {
    const loosened = resolveWorkerContract(canonical, spec({ deny_git_mutations: false }), undefined, template({ guard: { deny_git_mutations: false } }));
    expect(loosened.guard).toMatchObject({ deny_git_mutations: true });
    expect(() => resolveWorkerContract(canonical, spec({ write_roots: ["docs"] }))).toThrow(/outside the team's/);
    expect(() => resolveWorkerContract(canonical, spec(), undefined, template({ guard: { write_roots: ["docs"] } }))).toThrow(/outside the team's/);
  });

  test("a strict template holds the worker to strict containment", () => {
    expect(() => resolveWorkerContract({ ...canonical, guard: undefined }, spec(), undefined, template({ containment: "strict" })))
      .toThrow(/Strict containment violation: mission ends up with no explicit guard.write_roots/);
    expect(() => resolveWorkerContract({ ...canonical, guard: { write_roots: ["."], allow_unconfined: true } }, spec(), undefined, template({ containment: "strict", guard: { write_roots: ["out"] } })))
      .toThrow(/allow_unconfined must not be set in strict containment/);
    const ok = resolveWorkerContract(canonical, spec({ write_roots: ["out"] }), undefined, template({ containment: "strict" }));
    expect(ok.guard).toMatchObject({ write_roots: ["out"] });
  });

  test("with no guard anywhere the contract has none, as before", () => {
    expect(resolveWorkerContract({ schema_version: "uh.mission.v0", id: "m", objective: "x" }, spec()).guard).toBeUndefined();
  });

  test("workerGuard names the worker in a refusal", () => {
    expect(() => workerGuard({ write_roots: ["out"] }, undefined, { write_roots: ["docs"] }, "w7")).toThrow(/worker w7/);
  });
});
