import { describe, expect, test, vi } from "vitest";
import path from "node:path";
import { mkdtemp, mkdir, writeFile, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { parse as parseYaml } from "yaml";
import {
  SessionTemplateSchema,
  validateSessionTemplate,
  type SessionTemplate,
} from "../src/schema/session-template.js";
import {
  loadSessionTemplates,
  getSessionTemplate,
  applySessionTemplate,
  describeAppliedTemplate,
} from "../src/harness/session-templates.js";
import {
  adoptSessionTemplate,
  appendWorkerRules,
} from "../src/harness/session-template-adoption.js";
import { validateMission, type MissionDocument } from "../src/schema/mission.js";

const BASE_VALID_TEMPLATE = {
  schema_version: "uh.session-template.v0",
  id: "test-balanced",
  title: "Test Balanced Template",
  tier: "balanced",
  containment: "standard",
  adapter: "hermes",
  runtime_config_overrides: {
    model: "<provider/model>",
    thinking: "low",
  },
  limits: {
    max_turns: 15,
    timeout_ms: 300000,
  },
  recovery: {
    max_resumes: 1,
    notes: "Single retry allowed",
  },
  guard: {
    write_roots: ["src"],
    deny_network_clients: true,
  },
  attempts: 1,
  notes: "Test template notes",
} as const;

const BASE_MISSION: MissionDocument = validateMission({
  schema_version: "uh.mission.v0",
  id: "test-mission",
  title: "Test Mission",
  workflow_profile: "spec-first-feature",
});

describe("SessionTemplateSchema strictness", () => {
  test("accepts a fully specified valid template", () => {
    const tpl = validateSessionTemplate(BASE_VALID_TEMPLATE);
    expect(tpl.id).toBe("test-balanced");
    expect(tpl.tier).toBe("balanced");
    expect(tpl.containment).toBe("standard");
    expect(tpl.attempts).toBe(1);
  });

  test("rejects unknown extra keys at top level", () => {
    expect(() =>
      validateSessionTemplate({
        ...BASE_VALID_TEMPLATE,
        unknown_key: "not-allowed",
      }),
    ).toThrow();
  });

  test("rejects invalid schema_version", () => {
    expect(() =>
      validateSessionTemplate({
        ...BASE_VALID_TEMPLATE,
        schema_version: "uh.session-template.v1",
      }),
    ).toThrow();
  });

  test("validates safe identifier for id", () => {
    expect(() =>
      validateSessionTemplate({
        ...BASE_VALID_TEMPLATE,
        id: "../unsafe",
      }),
    ).toThrow(/id/i);

    expect(() =>
      validateSessionTemplate({
        ...BASE_VALID_TEMPLATE,
        id: "",
      }),
    ).toThrow(/id/i);

    expect(() =>
      validateSessionTemplate({
        ...BASE_VALID_TEMPLATE,
        id: ".",
      }),
    ).toThrow();

    expect(() =>
      validateSessionTemplate({
        ...BASE_VALID_TEMPLATE,
        id: "..",
      }),
    ).toThrow();

    expect(() =>
      validateSessionTemplate({
        ...BASE_VALID_TEMPLATE,
        id: "id with spaces",
      }),
    ).toThrow();

    expect(
      validateSessionTemplate({
        ...BASE_VALID_TEMPLATE,
        id: "valid-id_123.test",
      }).id,
    ).toBe("valid-id_123.test");
  });

  test("rejects invalid tier", () => {
    expect(() =>
      validateSessionTemplate({
        ...BASE_VALID_TEMPLATE,
        tier: "ultra-cheap",
      }),
    ).toThrow();
  });

  test("defaults containment to standard when omitted", () => {
    const { containment, ...withoutContainment } = BASE_VALID_TEMPLATE;
    const parsed = validateSessionTemplate(withoutContainment);
    expect(parsed.containment).toBe("standard");
  });

  test("rejects invalid containment value", () => {
    expect(() =>
      validateSessionTemplate({
        ...BASE_VALID_TEMPLATE,
        containment: "loose",
      }),
    ).toThrow();
  });

  test("rejects invalid adapter id", () => {
    expect(() =>
      validateSessionTemplate({
        ...BASE_VALID_TEMPLATE,
        adapter: "non-existent-adapter",
      }),
    ).toThrow();
  });

  test("defaults attempts to 1 when omitted", () => {
    const { attempts, ...withoutAttempts } = BASE_VALID_TEMPLATE;
    const parsed = validateSessionTemplate(withoutAttempts);
    expect(parsed.attempts).toBe(1);
  });

  test("rejects attempts outside range 1..8 or non-integers", () => {
    expect(() =>
      validateSessionTemplate({
        ...BASE_VALID_TEMPLATE,
        attempts: 0,
      }),
    ).toThrow();

    expect(() =>
      validateSessionTemplate({
        ...BASE_VALID_TEMPLATE,
        attempts: 9,
      }),
    ).toThrow();

    expect(() =>
      validateSessionTemplate({
        ...BASE_VALID_TEMPLATE,
        attempts: 2.5,
      }),
    ).toThrow();
  });

  test("rejects memory_mb in limits (governed by team resources instead)", () => {
    expect(() =>
      validateSessionTemplate({
        ...BASE_VALID_TEMPLATE,
        limits: {
          max_turns: 10,
          memory_mb: 2048,
        },
      }),
    ).toThrow();
  });

  test("rejects unrecognized keys inside limits", () => {
    expect(() =>
      validateSessionTemplate({
        ...BASE_VALID_TEMPLATE,
        limits: {
          max_turns: 10,
          unknown_limit: 100,
        },
      }),
    ).toThrow();
  });

  test("rejects unrecognized keys inside guard", () => {
    expect(() =>
      validateSessionTemplate({
        ...BASE_VALID_TEMPLATE,
        guard: {
          write_roots: ["src"],
          unknown_guard_field: true,
        },
      }),
    ).toThrow();
  });

  test("rejects unrecognized keys inside recovery", () => {
    expect(() =>
      validateSessionTemplate({
        ...BASE_VALID_TEMPLATE,
        recovery: {
          max_resumes: 1,
          notes: "ok",
          unknown_recovery_field: 42,
        },
      }),
    ).toThrow();
  });
});

describe("loadSessionTemplates & getSessionTemplate", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(tmpdir(), "uh-templates-test-"));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  test("loads valid templates sorted by id, skipping invalid files without failing", async () => {
    const templatesDir = path.join(tmpDir, ".harness", "templates");
    await mkdir(templatesDir, { recursive: true });

    // Valid template 1: id 'z-last'
    await writeFile(
      path.join(templatesDir, "z-last.yaml"),
      `
schema_version: uh.session-template.v0
id: z-last
title: Last Template
tier: low-cost
adapter: codex
runtime_config_overrides:
  model: "<provider/model>"
`,
      "utf-8",
    );

    // Valid template 2: id 'a-first'
    await writeFile(
      path.join(templatesDir, "a-first.yaml"),
      `
schema_version: uh.session-template.v0
id: a-first
title: First Template
tier: exhaustive
adapter: hermes
attempts: 3
runtime_config_overrides:
  model: "<provider/model>"
`,
      "utf-8",
    );

    // Invalid template 3: bad schema (unrecognized root key + bad tier)
    await writeFile(
      path.join(templatesDir, "bad-schema.yaml"),
      `
schema_version: uh.session-template.v0
id: bad-schema
title: Bad Template
tier: super-tier
extra_forbidden_key: true
`,
      "utf-8",
    );

    // Invalid template 4: syntax error in YAML
    await writeFile(
      path.join(templatesDir, "syntax-error.yaml"),
      `: not valid yaml: [}`,
      "utf-8",
    );

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const invalidPaths: string[] = [];

    const loaded = await loadSessionTemplates(tmpDir, {
      onInvalid: (badPath) => invalidPaths.push(badPath),
    });

    warnSpy.mockRestore();

    expect(loaded).toHaveLength(2);
    expect(loaded[0].id).toBe("a-first");
    expect(loaded[1].id).toBe("z-last");

    // Both bad files were reported
    expect(invalidPaths.some((p) => p.includes("bad-schema.yaml"))).toBe(true);
    expect(invalidPaths.some((p) => p.includes("syntax-error.yaml"))).toBe(true);
  });

  test("returns empty array when .harness/templates does not exist", async () => {
    const loaded = await loadSessionTemplates(tmpDir);
    expect(loaded).toEqual([]);
  });

  test("getSessionTemplate retrieves a template by id", async () => {
    const templatesDir = path.join(tmpDir, ".harness", "templates");
    await mkdir(templatesDir, { recursive: true });

    await writeFile(
      path.join(templatesDir, "balanced.yaml"),
      `
schema_version: uh.session-template.v0
id: balanced
title: Balanced Execution
tier: balanced
adapter: oh-my-pi
runtime_config_overrides:
  model: "<provider/model>"
`,
      "utf-8",
    );

    const template = await getSessionTemplate(tmpDir, "balanced");
    expect(template.id).toBe("balanced");
    expect(template.adapter).toBe("oh-my-pi");
  });

  test("getSessionTemplate throws on non-existent template", async () => {
    await expect(getSessionTemplate(tmpDir, "missing-template")).rejects.toThrow(
      /Session template not found/i,
    );
  });

  test("getSessionTemplate throws on unsafe id", async () => {
    await expect(getSessionTemplate(tmpDir, "../outside")).rejects.toThrow(
      /unsafe|invalid/i,
    );
  });
});

describe("applySessionTemplate precedence", () => {
  const template: SessionTemplate = {
    schema_version: "uh.session-template.v0",
    id: "tpl-default",
    title: "Template Default",
    tier: "balanced",
    containment: "standard",
    adapter: "hermes",
    runtime_config_overrides: {
      model: "tpl-model",
      thinking: "low",
      temperature: 0.2,
    },
    limits: {
      max_turns: 10,
      timeout_ms: 60000,
      stall_timeout_ms: 15000,
    },
    recovery: {
      max_resumes: 2,
      notes: "Template recovery notes",
    },
    guard: {
      write_roots: ["tpl-root"],
      deny_git_mutations: true,
      deny_network_clients: true,
      allow_native_subagents: false,
    },
    worker_rules: [],
    attempts: 2,
    notes: "Template notes",
  };

  test("merges runtime_config_overrides key-by-key, mission values win", () => {
    const mission = {
      ...BASE_MISSION,
      runtime_config_overrides: {
        model: "mission-custom-model",
        extra_flag: true,
      },
    };

    const applied = applySessionTemplate(mission, template);
    expect(applied.runtime_config_overrides).toEqual({
      model: "mission-custom-model", // mission overrides template
      thinking: "low",               // preserved from template
      temperature: 0.2,              // preserved from template
      extra_flag: true,              // mission extra key preserved
    });
  });

  test("merges limits key-by-key, mission values win", () => {
    const mission = {
      ...BASE_MISSION,
      limits: {
        max_turns: 25,
      },
    };

    const applied = applySessionTemplate(mission, template);
    expect(applied.limits).toEqual({
      max_turns: 25,                // mission overrides template
      timeout_ms: 60000,            // preserved from template
      stall_timeout_ms: 15000,      // preserved from template
    });
  });

  test("merges recovery key-by-key, mission values win", () => {
    const mission = {
      ...BASE_MISSION,
      recovery: {
        max_resumes: 5,
        notes: "Mission recovery notes",
      },
    };

    const applied = applySessionTemplate(mission, template);
    expect(applied.recovery).toEqual({
      max_resumes: 5,               // mission overrides template
      notes: "Mission recovery notes", // mission overrides template
    });
  });

  test("adapter precedence: mission adapter wins when explicitly provided, else template adapter", () => {
    const missionWithoutAdapter = { ...BASE_MISSION };
    const applied1 = applySessionTemplate(missionWithoutAdapter, template);
    expect(applied1.adapter).toBe("hermes");

    const missionWithAdapter = { ...BASE_MISSION, adapter: "codex" as const };
    const applied2 = applySessionTemplate(missionWithAdapter, template);
    expect(applied2.adapter).toBe("codex");
  });

  test("attempts precedence: mission attempts win when explicitly provided, else template attempts", () => {
    const missionWithoutAttempts = { ...BASE_MISSION };
    const applied1 = applySessionTemplate(missionWithoutAttempts, template);
    expect(applied1.attempts).toBe(2);

    const missionWithAttempts = { ...BASE_MISSION, attempts: 4 };
    const applied2 = applySessionTemplate(missionWithAttempts, template);
    expect(applied2.attempts).toBe(4);
  });

  test("does not mutate original mission object", () => {
    const originalMission = {
      ...BASE_MISSION,
      runtime_config_overrides: { model: "m" },
    };
    const copyBefore = JSON.parse(JSON.stringify(originalMission));
    applySessionTemplate(originalMission, template);
    expect(originalMission).toEqual(copyBefore);
  });
});

describe("write_roots never widened by template", () => {
  const templateWithRoots: SessionTemplate = {
    schema_version: "uh.session-template.v0",
    id: "tpl-guard",
    title: "Template Guard",
    tier: "balanced",
    containment: "standard",
    adapter: "hermes",
    runtime_config_overrides: {},
    limits: {},
    guard: {
      write_roots: ["src", "tests", "scripts"],
      deny_git_mutations: true,
      deny_network_clients: true,
    },
    worker_rules: [],
    attempts: 1,
  };

  test("ignores template write_roots if mission states write_roots", () => {
    const mission = {
      ...BASE_MISSION,
      guard: {
        write_roots: ["out"],
        deny_git_mutations: false,
      },
    };

    const applied = applySessionTemplate(mission, templateWithRoots);
    // write_roots is NOT unioned with ["src", "tests", "scripts"]
    expect(applied.guard?.write_roots).toEqual(["out"]);
    // Other guard fields merge field by field
    expect(applied.guard?.deny_git_mutations).toBe(false); // mission wins
    expect(applied.guard?.deny_network_clients).toBe(true); // from template
  });

  test("ignores template write_roots even if mission states empty write_roots array", () => {
    const mission = {
      ...BASE_MISSION,
      guard: {
        write_roots: [],
      },
    };

    const applied = applySessionTemplate(mission, templateWithRoots);
    expect(applied.guard?.write_roots).toEqual([]);
  });

  test("uses template write_roots when mission does not state write_roots", () => {
    const mission = {
      ...BASE_MISSION,
      guard: {
        deny_package_installs: true,
      },
    };

    const applied = applySessionTemplate(mission, templateWithRoots);
    expect(applied.guard?.write_roots).toEqual(["src", "tests", "scripts"]);
    expect(applied.guard?.deny_package_installs).toBe(true);
  });
});

describe("Strict containment refusals", () => {
  const strictTemplate: SessionTemplate = {
    schema_version: "uh.session-template.v0",
    id: "strict-tpl",
    title: "Strict Template",
    tier: "balanced",
    containment: "strict",
    adapter: "hermes",
    runtime_config_overrides: {},
    limits: {},
    worker_rules: [],
    attempts: 1,
  };

  test("refuses when mission ends up with no explicit guard.write_roots", () => {
    const mission = { ...BASE_MISSION };
    expect(() => applySessionTemplate(mission, strictTemplate)).toThrow(
      /write_roots/i,
    );
  });

  test("refuses when write root is '.'", () => {
    const mission = {
      ...BASE_MISSION,
      guard: {
        write_roots: ["."],
        deny_network_clients: true,
        allow_native_subagents: false,
      },
    };
    expect(() => applySessionTemplate(mission, strictTemplate)).toThrow(
      /write root "\."|write_roots/i,
    );
  });

  test("refuses when write root is an absolute path", () => {
    const mission = {
      ...BASE_MISSION,
      guard: {
        write_roots: ["/absolute/path/sandbox"],
        deny_network_clients: true,
        allow_native_subagents: false,
      },
    };
    expect(() => applySessionTemplate(mission, strictTemplate)).toThrow(
      /absolute/i,
    );
  });

  test("refuses when allow_native_subagents is true", () => {
    const mission = {
      ...BASE_MISSION,
      guard: {
        write_roots: ["src"],
        deny_network_clients: true,
        allow_native_subagents: true,
      },
    };
    expect(() => applySessionTemplate(mission, strictTemplate)).toThrow(
      /allow_native_subagents/i,
    );
  });

  test("refuses when deny_network_clients is false", () => {
    const mission = {
      ...BASE_MISSION,
      guard: {
        write_roots: ["src"],
        deny_network_clients: false,
        allow_native_subagents: false,
      },
    };
    expect(() => applySessionTemplate(mission, strictTemplate)).toThrow(
      /deny_network_clients/i,
    );
  });

  test("succeeds when all strict containment rules are satisfied", () => {
    const mission = {
      ...BASE_MISSION,
      guard: {
        write_roots: ["src", "tests"],
        deny_network_clients: true,
        allow_native_subagents: false,
      },
    };
    const applied = applySessionTemplate(mission, strictTemplate);
    expect(applied.guard?.write_roots).toEqual(["src", "tests"]);
    expect(applied.guard?.deny_network_clients).toBe(true);
    expect(applied.guard?.allow_native_subagents).toBe(false);
  });
});

describe("describeAppliedTemplate", () => {
  const template: SessionTemplate = {
    schema_version: "uh.session-template.v0",
    id: "balanced",
    title: "Balanced",
    tier: "balanced",
    containment: "standard",
    adapter: "hermes",
    runtime_config_overrides: {
      model: "tpl-model",
      thinking: "low",
    },
    limits: {
      max_turns: 10,
    },
    recovery: {
      max_resumes: 1,
      notes: "tpl notes",
    },
    guard: {
      write_roots: ["src"],
      deny_network_clients: true,
    },
    worker_rules: [],
    attempts: 1,
  };

  test("records no overrides when mission defines no template-matching keys", () => {
    const mission = { ...BASE_MISSION };
    const desc = describeAppliedTemplate(mission, template);
    expect(desc).toEqual({
      template_id: "balanced",
      tier: "balanced",
      containment: "standard",
      overridden_by_mission: [],
    });
  });

  test("lists template keys that the mission overrode", () => {
    const mission = {
      ...BASE_MISSION,
      adapter: "codex" as const,
      limits: {
        max_turns: 20,
      },
      runtime_config_overrides: {
        model: "custom-model",
      },
      attempts: 2,
    };

    const desc = describeAppliedTemplate(mission, template);
    expect(desc.template_id).toBe("balanced");
    expect(desc.tier).toBe("balanced");
    expect(desc.containment).toBe("standard");
    expect(desc.overridden_by_mission).toEqual([
      "adapter",
      "attempts",
      "limits",
      "runtime_config_overrides",
    ]);
  });

  test("works when passed the applied mission document", () => {
    const mission = {
      ...BASE_MISSION,
      limits: {
        max_turns: 25,
      },
    };
    const applied = applySessionTemplate(mission, template);
    const desc = describeAppliedTemplate(applied, template);
    expect(desc.overridden_by_mission).toEqual(["limits"]);
  });
});

describe("Shipped template examples validation", () => {
  const examplesDir = path.resolve("examples/templates");

  const exampleFiles = [
    "low-cost.yaml",
    "balanced.yaml",
    "exhaustive.yaml",
    "strict-sandbox.yaml",
  ];

  test.each(exampleFiles)("validates %s schema and requirements", async (filename) => {
    const filePath = path.join(examplesDir, filename);
    const content = await readFile(filePath, "utf-8");
    const parsed = parseYaml(content);

    const validated = validateSessionTemplate(parsed);
    expect(validated.schema_version).toBe("uh.session-template.v0");
    expect(validated.id).toBeTruthy();
    expect(["low-cost", "balanced", "exhaustive"]).toContain(validated.tier);
    expect(["standard", "strict"]).toContain(validated.containment);

    // Ensure model uses the required generic placeholder and no real provider/model names
    const model = validated.runtime_config_overrides.model;
    expect(model).toBe("<provider/model>");

    // Ensure no real model names exist anywhere in the raw content
    expect(content).not.toMatch(/claude|gpt|openai|anthropic|gemini|deepseek/i);
  });

  test("examples differ in reasoning level, max_turns, timeouts, recovery and attempts", async () => {
    const lowCostRaw = parseYaml(await readFile(path.join(examplesDir, "low-cost.yaml"), "utf-8"));
    const balancedRaw = parseYaml(await readFile(path.join(examplesDir, "balanced.yaml"), "utf-8"));
    const exhaustiveRaw = parseYaml(await readFile(path.join(examplesDir, "exhaustive.yaml"), "utf-8"));

    const lowCost = validateSessionTemplate(lowCostRaw);
    const balanced = validateSessionTemplate(balancedRaw);
    const exhaustive = validateSessionTemplate(exhaustiveRaw);

    // Tiers
    expect(lowCost.tier).toBe("low-cost");
    expect(balanced.tier).toBe("balanced");
    expect(exhaustive.tier).toBe("exhaustive");

    // Differ in max_turns
    expect(lowCost.limits.max_turns).toBeLessThan(balanced.limits.max_turns!);
    expect(balanced.limits.max_turns).toBeLessThan(exhaustive.limits.max_turns!);

    // Differ in timeouts
    expect(lowCost.limits.timeout_ms).toBeLessThan(balanced.limits.timeout_ms!);
    expect(balanced.limits.timeout_ms).toBeLessThan(exhaustive.limits.timeout_ms!);

    // Differ in recovery
    expect(lowCost.recovery?.max_resumes ?? 0).toBeLessThan(balanced.recovery?.max_resumes ?? 1);
    expect(balanced.recovery?.max_resumes ?? 1).toBeLessThan(exhaustive.recovery?.max_resumes ?? 3);

    // Differ in attempts
    expect(lowCost.attempts).toBe(1);
    expect(exhaustive.attempts).toBeGreaterThan(1);

    // Differ in reasoning level
    expect(lowCost.runtime_config_overrides.thinking).not.toEqual(
      exhaustive.runtime_config_overrides.thinking,
    );
  });

  test("strict-sandbox.yaml satisfies strict containment", async () => {
    const raw = parseYaml(await readFile(path.join(examplesDir, "strict-sandbox.yaml"), "utf-8"));
    const tpl = validateSessionTemplate(raw);
    expect(tpl.containment).toBe("strict");

    // Applying strict-sandbox template to a mission without extra guard settings should succeed
    // because the template itself provides valid write_roots and guard settings
    const mission = { ...BASE_MISSION };
    const applied = applySessionTemplate(mission, tpl);
    expect(applied.guard?.write_roots).toBeDefined();
    expect(applied.guard?.write_roots?.length).toBeGreaterThan(0);
    expect(applied.guard?.write_roots).not.toContain(".");
    expect(applied.guard?.deny_network_clients).toBe(true);
    expect(applied.guard?.allow_native_subagents).toBe(false);
  });
});

describe("SessionTemplate worker_rules", () => {
  test("defaults worker_rules to an empty list", () => {
    const tpl = validateSessionTemplate(BASE_VALID_TEMPLATE);
    expect(tpl.worker_rules).toEqual([]);
  });

  test("accepts a list of short worker rules", () => {
    const tpl = validateSessionTemplate({
      ...BASE_VALID_TEMPLATE,
      worker_rules: ["This runtime works in many small turns.", "Print the seed."],
    });
    expect(tpl.worker_rules).toEqual([
      "This runtime works in many small turns.",
      "Print the seed.",
    ]);
  });

  test("rejects non-string, empty, or whitespace-only worker rules", () => {
    expect(() => validateSessionTemplate({ ...BASE_VALID_TEMPLATE, worker_rules: [42] })).toThrow();
    expect(() => validateSessionTemplate({ ...BASE_VALID_TEMPLATE, worker_rules: [""] })).toThrow();
    expect(() => validateSessionTemplate({ ...BASE_VALID_TEMPLATE, worker_rules: ["   "] })).toThrow();
  });
});

describe("adoptSessionTemplate worker_rules", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(tmpdir(), "uh-template-adopt-"));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  test("appends the template's worker_rules after the mission's own constraints", async () => {
    const templatesDir = path.join(tmpDir, ".harness", "templates");
    await mkdir(templatesDir, { recursive: true });
    await writeFile(
      path.join(templatesDir, "omp-worker.yaml"),
      [
        "schema_version: uh.session-template.v0",
        "id: omp-worker",
        "title: OMP worker",
        "tier: balanced",
        "adapter: oh-my-pi",
        "limits:",
        "  max_turns: 260",
        "worker_rules:",
        "  - This runtime works in many small turns.",
        "  - Prefer small, reviewable edits.",
      ].join("\n") + "\n",
      "utf-8",
    );
    const missionPath = path.join(tmpDir, "mission.yaml");
    await writeFile(
      missionPath,
      [
        "schema_version: uh.mission.v0",
        "id: m-rules",
        "workflow_profile: spec-first-feature",
        "constraints:",
        "  - Mission constraint one.",
        "  - Mission constraint two.",
      ].join("\n") + "\n",
      "utf-8",
    );

    const adoption = await adoptSessionTemplate({
      root: tmpDir,
      missionPath,
      templateId: "omp-worker",
    });

    expect(adoption.workerRules).toEqual([
      "This runtime works in many small turns.",
      "Prefer small, reviewable edits.",
    ]);
    expect(adoption.constraints).toEqual([
      "Mission constraint one.",
      "Mission constraint two.",
      "This runtime works in many small turns.",
      "Prefer small, reviewable edits.",
    ]);
    // Worker rules are not runtime overrides; they must not leak into the
    // runtime-config merge the CLI prints as effective overrides.
    expect(adoption.runtimeConfigOverrides).toEqual({ limits: { max_turns: 260 } });
  });
});

describe("appendWorkerRules", () => {
  test("appends rules after the base constraints without mutating either input", () => {
    const base = ["base one"];
    const rules = ["rule one", "rule two"];
    const out = appendWorkerRules(base, rules);
    expect(out).toEqual(["base one", "rule one", "rule two"]);
    expect(base).toEqual(["base one"]);
    expect(rules).toEqual(["rule one", "rule two"]);
    expect(out).not.toBe(base);
  });

  test("handles empty inputs", () => {
    expect(appendWorkerRules(["a"], [])).toEqual(["a"]);
    expect(appendWorkerRules([], ["b"])).toEqual(["b"]);
    expect(appendWorkerRules([], [])).toEqual([]);
  });
});
