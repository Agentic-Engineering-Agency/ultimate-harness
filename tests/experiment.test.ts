import { afterEach, describe, expect, test } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { stringify } from "yaml";
import { validateExperiment } from "../src/schema/experiment.js";
import {
  experimentRepeatsLine,
  experimentVerdictLine,
  loadExperiment,
  loadExperimentRuns,
  mulberry32,
  planExperiment,
  renderExperimentMarkdown,
  runExperiment,
  splitTasks,
  summarizeExperiment,
  type ExperimentRunRecord,
  type ExperimentRunner,
} from "../src/harness/experiment.js";
import { compareArms } from "../src/harness/run-comparison.js";
import { indexRuns } from "../src/harness/experience-store.js";
import { initializeHarness } from "../src/harness/init.js";

const execFileP = promisify(execFile);
const TEN_TASKS = ["t1", "t2", "t3", "t4", "t5", "t6", "t7", "t8", "t9", "t10"];
const FOURTEEN_TASKS = Array.from({ length: 14 }, (_, index) => `task-${index + 1}`);

let roots: string[] = [];

afterEach(async () => {
  for (const root of roots) await rm(root, { recursive: true, force: true });
  roots = [];
});

async function makeRoot(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "uh-experiment-"));
  roots.push(root);
  return root;
}

function makeSpec(overrides: Record<string, unknown> = {}) {
  return validateExperiment({
    schema_version: "uh.experiment.v0",
    id: "exp-1",
    title: "Guard denial tone",
    tasks: TEN_TASKS,
    split: { seed: 7 },
    arms: [{ id: "control" }, { id: "treatment" }],
    baseline: { arm: "control" },
    ...overrides,
  });
}

function baseRecord(overrides: Partial<ExperimentRunRecord> = {}): ExperimentRunRecord {
  return {
    experiment_id: "exp-1",
    task: "t1",
    arm: "control",
    attempt: 1,
    split: "search",
    skipped: false,
    status: "passed",
    ...overrides,
  };
}

async function putMission(root: string, id: string, withChecks = true): Promise<void> {
  const dir = path.join(root, ".harness", "missions", id);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, "mission.yaml"), stringify({
    schema_version: "uh.mission.v0",
    id,
    title: `Mission ${id}`,
    workflow_profile: "spec-first-feature",
    objective: "Experiment task",
    verification: { required_checks: withChecks ? [{ name: "typecheck", command: "true" }] : [] },
  }), "utf8");
}

async function writeRunArtifacts(root: string, task: string, runId: string, status: string, cost?: number): Promise<void> {
  const dir = path.join(root, ".harness", "missions", task, "runs", runId);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, "runtime-result.yaml"), stringify({
    schema_version: "uh.runtime-result.v0",
    mission_id: task,
    runtime: "hermes",
    status,
    started_at: "2026-09-21T10:00:00.000Z",
    finished_at: "2026-09-21T10:00:02.000Z",
    prompt_path: "prompt.md",
    stdout_path: "stdout.log",
    stderr_path: "stderr.log",
    ...(cost !== undefined ? { cost_usd: cost, cost_basis: "provider_reported" } : {}),
  }), "utf8");
  await writeFile(path.join(dir, "runtime-control.json"), JSON.stringify({
    schema_version: "uh.runtime-control.v0",
    mission_id: task,
    run_id: runId,
    runtime: "hermes",
    controller_pid: 1,
    started_at: "2026-09-21T10:00:00.000Z",
    heartbeat_at: "2026-09-21T10:00:02.000Z",
    status,
    turns: 1,
    denials: 0,
    inflight_tools: 0,
  }), "utf8");
}

async function writeExperimentSpec(root: string, spec: Record<string, unknown>): Promise<void> {
  const dir = path.join(root, ".harness", "experiments");
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, `${spec.id as string}.yaml`), stringify(spec), "utf8");
}

async function runUh(args: string[]) {
  return execFileP(process.execPath, ["--import", "tsx", "src/cli.ts", ...args], {
    cwd: process.cwd(),
    timeout: 30_000,
    env: { ...process.env, UH_TELEMETRY: "", UH_POSTHOG_API_KEY: "" },
  });
}

describe("experiment split", () => {
  test("mulberry32 is deterministic and stays in [0, 1)", () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    const seqA = [a(), a(), a(), a()];
    expect(seqA).toEqual([b(), b(), b(), b()]);
    expect(seqA.every((value) => value >= 0 && value < 1)).toBe(true);
  });

  test("the same seed reproduces the split and a different seed changes it", () => {
    const a = splitTasks(makeSpec({ split: { seed: 7 } }));
    const b = splitTasks(makeSpec({ split: { seed: 7 } }));
    expect(a).toEqual(b);
    expect(a.seed).toBe(7);
    expect(a.held_out.length).toBe(3);
    expect(a.search.length).toBe(7);
    expect([...a.search, ...a.held_out].sort()).toEqual([...TEN_TASKS].sort());

    const c = splitTasks(makeSpec({ split: { seed: 8 } }));
    expect(c.held_out).not.toEqual(a.held_out);
  });

  test("an explicit held-out list is honored and must reference real tasks", () => {
    const spec = makeSpec({ split: { held_out: ["t1", "t2", "t3", "t4", "t5"] } });
    const split = splitTasks(spec);
    expect(split.seed).toBeUndefined();
    expect(split.held_out).toEqual(["t1", "t2", "t3", "t4", "t5"]);
    expect(split.search).toEqual(["t6", "t7", "t8", "t9", "t10"]);
    expect(() => validateExperiment({
      schema_version: "uh.experiment.v0",
      id: "exp-1",
      title: "Bad",
      tasks: TEN_TASKS,
      split: { held_out: ["nope"] },
      arms: [{ id: "control" }],
      baseline: { arm: "control" },
    })).toThrow(/not in tasks/);
  });

  test("the plan interleaves arms and runs search tasks before held-out tasks", () => {
    const spec = makeSpec({
      tasks: ["s1", "s2", "h1"],
      split: { held_out: ["h1"] },
      arms: [{ id: "a", attempts_per_task: 2 }, { id: "b" }],
      baseline: { arm: "a" },
    });
    const plan = planExperiment(spec);
    expect(plan.slice(0, 3)).toEqual([
      { task: "s1", arm: "a", attempt: 1, split: "search" },
      { task: "s1", arm: "b", attempt: 1, split: "search" },
      { task: "s1", arm: "a", attempt: 2, split: "search" },
    ]);
    expect(plan.slice(3, 6)).toEqual([
      { task: "s2", arm: "a", attempt: 1, split: "search" },
      { task: "s2", arm: "b", attempt: 1, split: "search" },
      { task: "s2", arm: "a", attempt: 2, split: "search" },
    ]);
    expect(plan.at(-1)).toEqual({ task: "h1", arm: "a", attempt: 2, split: "held_out" });
    // Every task follows the same arm-interleaved rhythm, so a budget stop
    // trims each arm by the same amount.
    for (const task of ["s1", "s2", "h1"]) {
      expect(plan.filter((entry) => entry.task === task).map((entry) => `${entry.arm}${entry.attempt}`)).toEqual(["a1", "b1", "a2"]);
    }
    expect(plan).toHaveLength(9);
  });
});

describe("experiment run", () => {
  test("a max_runs budget stop marks the rest of the plan skipped with reason budget", async () => {
    const root = await makeRoot();
    const spec = makeSpec({ tasks: ["t1", "t2"], split: { seed: 1 }, budget: { max_runs: 2 } });
    const runner: ExperimentRunner = async (request) => ({
      run_id: `${request.task}-${request.arm.id}-${request.attempt}`,
      mission_id: request.task,
      status: "passed",
      cost_usd: 1,
      denials: 0,
    });
    const outcome = await runExperiment(root, spec, { runner, now: () => 0 });

    expect(outcome.executed).toBe(2);
    expect(outcome.stopped).toBe(true);
    expect(outcome.stop_reason).toBe("max_runs");
    const executed = outcome.runs.filter((record) => !record.skipped);
    const skipped = outcome.runs.filter((record) => record.skipped);
    expect(executed).toHaveLength(2);
    expect(new Set(executed.map((record) => record.arm))).toEqual(new Set(["control", "treatment"]));
    expect(skipped.length).toBeGreaterThan(0);
    expect(skipped.every((record) => record.skip_reason === "budget")).toBe(true);
    // The report never counts a skipped row as evidence.
    for (const split of outcome.report.splits) {
      for (const arm of split.arms) expect(arm.runs).toBeLessThanOrEqual(2);
    }
  });

  test("a cost budget stops on known spend and never counts unknown cost as free", async () => {
    const pricedRoot = await makeRoot();
    const pricedSpec = makeSpec({ tasks: ["t1", "t2"], split: { seed: 1 }, budget: { max_total_cost_usd: 2.5 } });
    const priced = await runExperiment(pricedRoot, pricedSpec, {
      runner: async () => ({ status: "passed", cost_usd: 1 }),
      now: () => 0,
    });
    expect(priced.executed).toBe(3);
    expect(priced.stop_reason).toBe("max_total_cost_usd");

    const unpricedRoot = await makeRoot();
    const unpricedSpec = makeSpec({ tasks: ["t1", "t2"], split: { seed: 1 }, budget: { max_total_cost_usd: 0.5 } });
    const unpriced = await runExperiment(unpricedRoot, unpricedSpec, {
      runner: async () => ({ status: "passed" }),
      now: () => 0,
    });
    // Four planned entries; an unknown cost contributes nothing to the cap, so
    // it can never silently stop (or be read as free).
    expect(unpriced.executed).toBe(4);
    expect(unpriced.stopped).toBe(false);
    expect(unpriced.runs.every((record) => record.cost_usd === undefined)).toBe(true);
  });

  test("runExperiment persists the plan, run rows, and reports, and tags runs for the store", async () => {
    const root = await makeRoot();
    await initializeHarness(root);
    await putMission(root, "t1");
    await putMission(root, "t2");

    const spec = makeSpec({ tasks: ["t1", "t2"], split: { seed: 3 } });
    const runner: ExperimentRunner = async (request) => {
      const runId = `${request.task}-${request.arm.id}-${request.attempt}`;
      const status = request.arm.id === "control" ? "passed" : "failed";
      await writeRunArtifacts(root, request.task, runId, status, 1);
      return {
        run_id: runId,
        mission_id: request.task,
        runtime: "hermes",
        status,
        denials: request.arm.id === "control" ? 0 : 1,
        denial_classes: request.arm.id === "control" ? [] : ["guard_tamper"],
        cost_usd: 1,
      };
    };
    const outcome = await runExperiment(root, spec, { runner, now: () => 0 });

    for (const name of ["plan.json", "runs.ndjson", "report.json", "report.md"]) {
      await expect(access(path.join(root, ".harness", "experiments", "exp-1", name))).resolves.toBeUndefined();
    }
    const reloaded = await loadExperimentRuns(root, "exp-1");
    expect(reloaded).toHaveLength(outcome.plan.length);

    const treatment = reloaded.find((record) => record.arm === "treatment");
    expect(treatment?.guard_tamper).toBe(1);
    expect(treatment?.containment_escape).toBe(0);
    expect(treatment?.denial_classes).toEqual({ guard_tamper: 1 });

    const indexed = await indexRuns(root);
    const tagged = indexed.filter((record) => record.experiment?.id === "exp-1");
    expect(tagged.length).toBeGreaterThan(0);
    expect(new Set(tagged.map((record) => record.experiment?.split))).toEqual(new Set(["search", "held_out"]));
    expect(tagged.every((record) => record.experiment?.arm !== undefined)).toBe(true);
  });
});

describe("experiment summarize", () => {
  test("per-split verdicts match compareArms on the same records", () => {
    const spec = makeSpec({ split: { held_out: ["t1", "t2", "t3", "t4", "t5"] } });
    const split = splitTasks(spec);
    const records: ExperimentRunRecord[] = [];
    for (const task of split.search) {
      records.push(baseRecord({ task, arm: "control", split: "search", status: "passed", cost_usd: 1 }));
      records.push(baseRecord({ task, arm: "treatment", split: "search", status: "failed", cost_usd: 1 }));
    }
    for (const task of split.held_out) {
      records.push(baseRecord({ task, arm: "control", split: "held_out", status: "failed", cost_usd: 1 }));
      records.push(baseRecord({ task, arm: "treatment", split: "held_out", status: "passed", cost_usd: 1 }));
    }
    const report = summarizeExperiment(records, spec);

    const searchControl = split.search.map((task) => ({ mission_id: task, run_id: `c-${task}`, status: "passed", cost_usd: 1 }));
    const searchTreatment = split.search.map((task) => ({ mission_id: task, run_id: `t-${task}`, status: "failed", cost_usd: 1 }));
    const expected = compareArms(searchControl, searchTreatment);
    const searchComparison = report.splits.find((entry) => entry.split === "search")!.comparisons[0];
    expect(searchComparison.a).toBe("control");
    expect(searchComparison.b).toBe("treatment");
    expect(searchComparison.comparison.verdict).toBe(expected.verdict);
    expect(searchComparison.comparison.verdict).toBe("a_better");
    expect(searchComparison.comparison.a.success_rate).toBe(expected.a.success_rate);

    const heldOutComparison = report.splits.find((entry) => entry.split === "held_out")!.comparisons[0];
    expect(heldOutComparison.comparison.verdict).toBe("b_better");
    expect(report.split_sizes).toEqual({ search: 5, held_out: 5 });
    expect(report.seed).toBeUndefined();
  });

  test("mean denials and guard-class stop counts are summed per arm", () => {
    const spec = makeSpec({ tasks: ["t1"], split: { held_out: ["t1"] } });
    const records: ExperimentRunRecord[] = [
      baseRecord({ arm: "control", attempt: 1, split: "held_out", status: "passed", denials: 2, denial_classes: { guard_tamper: 1, write_outside: 1 }, guard_tamper: 1, containment_escape: 0 }),
      baseRecord({ arm: "control", attempt: 2, split: "held_out", status: "failed", denials: 4, denial_classes: { containment_escape: 2 }, guard_tamper: 0, containment_escape: 2 }),
      baseRecord({ arm: "treatment", attempt: 1, split: "held_out", status: "passed", denials: 0, denial_classes: {}, guard_tamper: 0, containment_escape: 0 }),
    ];
    const report = summarizeExperiment(records, spec);
    const heldOut = report.splits.find((entry) => entry.split === "held_out")!;
    const control = heldOut.arms.find((arm) => arm.arm === "control")!;
    expect(control.mean_denials).toBe(3);
    expect(control.guard_tamper_stops).toBe(1);
    expect(control.containment_escape_stops).toBe(2);
    const treatment = heldOut.arms.find((arm) => arm.arm === "treatment")!;
    expect(treatment.mean_denials).toBe(0);
    expect(treatment.guard_tamper_stops).toBe(0);
    expect(treatment.containment_escape_stops).toBe(0);
  });

  test("unknown cost stays unknown in the structured report and the markdown", () => {
    const spec = makeSpec({ tasks: ["t1"], split: { held_out: ["t1"] } });
    const records: ExperimentRunRecord[] = [
      baseRecord({ arm: "control", attempt: 1, split: "held_out", status: "passed" }),
      baseRecord({ arm: "control", attempt: 2, split: "held_out", status: "passed" }),
      baseRecord({ arm: "treatment", attempt: 1, split: "held_out", status: "failed" }),
      baseRecord({ arm: "treatment", attempt: 2, split: "held_out", status: "failed" }),
    ];
    const report = summarizeExperiment(records, spec);
    const control = report.splits.find((entry) => entry.split === "held_out")!.arms.find((arm) => arm.arm === "control")!;
    expect(control.known_cost_runs).toBe(0);
    expect(control.mean_cost_usd).toBeUndefined();
    expect(control.total_cost_usd).toBeUndefined();
    expect(control.cost_per_success_usd).toBeUndefined();

    const markdown = renderExperimentMarkdown(report);
    expect(markdown).toContain("unknown");
    expect(markdown).not.toMatch(/\$0(?:\.0+)?(?:\s|\|)/);
  });

  test("the baseline lines describe plain repeats and parallel attempts", () => {
    const spec = makeSpec({
      tasks: ["t1", "t2", "t3", "t4", "t5", "t6"],
      split: { held_out: ["t1", "t2", "t3"] },
      baseline: { arm: "control", parallel_attempts: 3 },
    });
    const records: ExperimentRunRecord[] = [];
    for (const [index, task] of ["t4", "t5", "t6"].entries()) {
      records.push(baseRecord({ task, arm: "control", status: index === 0 ? "passed" : "failed" }));
      records.push(baseRecord({ task, arm: "treatment", status: "passed" }));
    }
    const report = summarizeExperiment(records, spec);
    const search = report.splits.find((entry) => entry.split === "search")!;
    const repeat = search.baseline_repeats[0];
    expect(repeat.baseline_arm).toBe("control");
    expect(repeat.arm).toBe("treatment");
    expect(repeat.parallel_attempts).toBe(3);
    expect(repeat.target_success_rate).toBe(1);
    expect(repeat.attempts_to_match).toBeDefined();
    const line = experimentRepeatsLine(repeat);
    expect(line).toContain("plain repeat(s) of control");
    const verdict = experimentVerdictLine(search.comparisons[0].comparison, "control", "treatment");
    expect(verdict).toMatch(/Verdict|insufficient_data|no_clear_difference/);
    expect(verdict.endsWith(".")).toBe(true);
  });
});

describe("loadExperiment", () => {
  test("requires every task mission to declare verification.required_checks", async () => {
    const root = await makeRoot();
    await initializeHarness(root);
    await writeExperimentSpec(root, {
      schema_version: "uh.experiment.v0",
      id: "exp-1",
      title: "Checks",
      tasks: ["good", "bad"],
      split: { seed: 1 },
      arms: [{ id: "control" }, { id: "treatment" }],
      baseline: { arm: "control" },
    });
    await putMission(root, "good", true);
    await putMission(root, "bad", false);

    await expect(loadExperiment(root, "exp-1")).rejects.toThrow(/required_checks/);

    await putMission(root, "bad", true);
    const loaded = await loadExperiment(root, "exp-1");
    expect(loaded.id).toBe("exp-1");
    expect(loaded.tasks).toEqual(["good", "bad"]);
  });
});

describe("uh experiment report", () => {
  test("prints the seed, split sizes, arm intervals, stop counts, verdict, and plain-repeats line", async () => {
    const root = await makeRoot();
    await initializeHarness(root);
    const spec = validateExperiment({
      schema_version: "uh.experiment.v0",
      id: "exp-1",
      title: "Guard denial tone",
      tasks: FOURTEEN_TASKS,
      split: { seed: 7 },
      arms: [{ id: "control" }, { id: "treatment" }],
      baseline: { arm: "control" },
    });
    await writeExperimentSpec(root, {
      schema_version: "uh.experiment.v0",
      id: "exp-1",
      title: "Guard denial tone",
      tasks: FOURTEEN_TASKS,
      split: { seed: 7 },
      arms: [{ id: "control" }, { id: "treatment" }],
      baseline: { arm: "control" },
    });
    for (const task of FOURTEEN_TASKS) await putMission(root, task);

    const split = splitTasks(spec);
    const records: ExperimentRunRecord[] = [];
    let index = 0;
    const add = (task: string, arm: string, splitName: "search" | "held_out", status: string, denialClasses: string[]) => {
      index += 1;
      records.push(baseRecord({
        task,
        arm,
        split: splitName,
        attempt: index,
        status,
        denials: denialClasses.length,
        denial_classes: denialClasses.length ? Object.fromEntries(denialClasses.map((name) => [name, 1])) : {},
        guard_tamper: denialClasses.filter((name) => name === "guard_tamper").length,
        containment_escape: denialClasses.filter((name) => name === "containment_escape").length,
        cost_usd: 1,
      }));
    };
    // The baseline (`control`) is the weaker configuration, so the plain-repeats
    // line is the interesting one: repeating it would have to catch `treatment`.
    for (const [position, task] of split.search.entries()) {
      add(task, "control", "search", position < 2 ? "passed" : "failed", ["guard_tamper"]);
      add(task, "treatment", "search", "passed", []);
    }
    for (const [position, task] of split.held_out.entries()) {
      add(task, "control", "held_out", position < 1 ? "passed" : "failed", []);
      add(task, "treatment", "held_out", "passed", ["containment_escape"]);
    }
    await mkdir(path.join(root, ".harness", "experiments", "exp-1"), { recursive: true });
    await writeFile(
      path.join(root, ".harness", "experiments", "exp-1", "runs.ndjson"),
      records.map((record) => JSON.stringify(record)).join("\n") + "\n",
      "utf8",
    );

    const { stdout } = await runUh(["experiment", "report", "exp-1", "--root", root]);
    expect(stdout).toContain("Seed: 7");
    expect(stdout).toContain("Split sizes: search 9, held_out 5");
    expect(stdout).toContain("control");
    expect(stdout).toContain("treatment");
    expect(stdout).toMatch(/Verdict \(control vs treatment\): b_better/);
    expect(stdout).toMatch(/Plain repeats \(control vs treatment\): \d+ plain repeat\(s\) of control/);
    expect(stdout).toMatch(/GUARD_TAMPER/);

    const { stdout: json } = await runUh(["experiment", "report", "exp-1", "--root", root, "--json"]);
    const parsed = JSON.parse(json) as { experiment_id: string; seed: number; splits: Array<{ split: string; arms: Array<{ arm: string; guard_tamper_stops: number; containment_escape_stops: number; mean_denials: number }> }> };
    expect(parsed.experiment_id).toBe("exp-1");
    expect(parsed.seed).toBe(7);
    expect(parsed.splits).toHaveLength(2);
    const searchReport = parsed.splits.find((entry) => entry.split === "search")!;
    const searchControl = searchReport.arms.find((arm) => arm.arm === "control")!;
    expect(searchControl.guard_tamper_stops).toBe(9);
    expect(searchControl.mean_denials).toBe(1);
    const heldOutReport = parsed.splits.find((entry) => entry.split === "held_out")!;
    expect(heldOutReport.arms.find((arm) => arm.arm === "treatment")!.containment_escape_stops).toBe(5);
  });
});
