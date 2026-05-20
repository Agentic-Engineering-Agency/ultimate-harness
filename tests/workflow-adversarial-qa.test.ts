/**
 * UH-74 — Adversarial QA verifier tests.
 */
import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  evaluateAdversarialQa,
  writeAdversarialQaReport,
  type AdversarialQaInput,
} from "../src/harness/workflow/adversarial-qa.js";

let ROOT: string;

beforeEach(async () => {
  ROOT = await mkdtemp(join(tmpdir(), "uh-adv-qa-"));
});

afterEach(async () => {
  if (ROOT) await rm(ROOT, { recursive: true, force: true });
});

function cleanPassInput(overrides: Partial<AdversarialQaInput> = {}): AdversarialQaInput {
  return {
    missionId: overrides.missionId ?? "m1",
    hostileScenarios: overrides.hostileScenarios ?? [
      { id: "s1", name: "Malformed mission yaml", outcome: "surfaced", reproCommand: "uh validate broken.yaml" },
      { id: "s2", name: "Prompt injection: ignore instructions", outcome: "deflected", reproCommand: "uh mission run injection.yaml", isPromptInjection: true },
      { id: "s3", name: "Adapter not installed", outcome: "surfaced", reproCommand: "uh adapter check missing" },
    ],
    interruptResume: overrides.interruptResume ?? [
      { runId: "run-1", signal: "SIGTERM", resumed: true, reproCommand: "kill -TERM <pid>; uh mission run --resume" },
    ],
    staleStateProbes: overrides.staleStateProbes ?? [
      { fixture: "stale-sandbox-index", outcome: "fail-fast", reproCommand: "uh sandbox list (with corrupt index)" },
    ],
    cleanup: overrides.cleanup ?? {
      orphanedWorktreePaths: [],
      leakedArtifacts: [],
      redactionGuardrailIntact: true,
    },
  };
}

/* -------------------------------------------------------------------------- */
/* Verdict logic                                                              */
/* -------------------------------------------------------------------------- */

describe("evaluateAdversarialQa", () => {
  test("clean-pass run: all 6 gates satisfied → PASS", () => {
    const report = evaluateAdversarialQa(cleanPassInput());
    expect(report.verdict).toBe("PASS");
    expect(report.gates.every((g) => g.satisfied)).toBe(true);
    expect(report.gates).toHaveLength(6);
    expect(report.scenariosHandled).toBe(3);
    expect(report.markdown).toMatch(/Verdict: \*\*PASS\*\*/);
  });

  test("Codex P1: leaked artifacts block PASS even when redaction guardrail intact", () => {
    const report = evaluateAdversarialQa(cleanPassInput({
      cleanup: {
        orphanedWorktreePaths: [],
        leakedArtifacts: ["AWS_SECRET_ACCESS_KEY found in events.ndjson"],
        redactionGuardrailIntact: true,
      },
    }));
    expect(report.verdict).toBe("NEEDS-ATTENTION");
    const gate6 = report.gates.find((g) => g.id === "gate-6-no-leaked-artifacts");
    expect(gate6).toBeDefined();
    expect(gate6!.satisfied).toBe(false);
    expect(gate6!.detail).toMatch(/1 leaked artifact/);
    // gate-5 still passes — leak detection is independent of redaction guardrail.
    const gate5 = report.gates.find((g) => g.id === "gate-5-redaction-guardrail");
    expect(gate5!.satisfied).toBe(true);
  });

  test("injection-deflected run: prompt-injection deflected scenario counts toward gate-2", () => {
    const input = cleanPassInput({
      hostileScenarios: [
        { id: "s1", name: "scenario 1", outcome: "deflected", reproCommand: "x" },
        { id: "s2", name: "scenario 2", outcome: "surfaced", reproCommand: "x" },
        { id: "s3", name: "injection 1", outcome: "deflected", reproCommand: "x", isPromptInjection: true },
      ],
    });
    const report = evaluateAdversarialQa(input);
    expect(report.verdict).toBe("PASS");
    const g2 = report.gates.find((g) => g.id === "gate-2-prompt-injection-deflected")!;
    expect(g2.satisfied).toBe(true);
    expect(g2.detail).toMatch(/1 prompt-injection/);
  });

  test("zero prompt-injection attempts → gate-2 fails → NEEDS-ATTENTION", () => {
    const input = cleanPassInput({
      hostileScenarios: [
        { id: "s1", name: "scenario 1", outcome: "deflected", reproCommand: "x" },
        { id: "s2", name: "scenario 2", outcome: "deflected", reproCommand: "x" },
        { id: "s3", name: "scenario 3", outcome: "deflected", reproCommand: "x" },
      ],
    });
    const report = evaluateAdversarialQa(input);
    expect(report.verdict).toBe("NEEDS-ATTENTION");
    const g2 = report.gates.find((g) => g.id === "gate-2-prompt-injection-deflected")!;
    expect(g2.satisfied).toBe(false);
  });

  test("prompt-injection that FAILED (not deflected/surfaced) does NOT satisfy gate-2", () => {
    const input = cleanPassInput({
      hostileScenarios: [
        { id: "s1", name: "scenario 1", outcome: "deflected", reproCommand: "x" },
        { id: "s2", name: "scenario 2", outcome: "deflected", reproCommand: "x" },
        { id: "s3", name: "injection 1", outcome: "failed", reproCommand: "x", isPromptInjection: true },
      ],
    });
    const report = evaluateAdversarialQa(input);
    expect(report.verdict).toBe("NEEDS-ATTENTION");
    expect(report.gates.find((g) => g.id === "gate-2-prompt-injection-deflected")!.satisfied).toBe(false);
  });

  test("interrupt-resume run: at least one resumed cycle satisfies gate-3", () => {
    const input = cleanPassInput({
      interruptResume: [
        { runId: "r1", signal: "SIGTERM", resumed: false, reproCommand: "x" },
        { runId: "r2", signal: "SIGTERM", resumed: true, reproCommand: "x" },
      ],
    });
    const report = evaluateAdversarialQa(input);
    expect(report.gates.find((g) => g.id === "gate-3-interrupt-resume")!.satisfied).toBe(true);
    expect(report.verdict).toBe("PASS");
  });

  test("no interrupt cycle recorded → gate-3 fails → NEEDS-ATTENTION", () => {
    const input = cleanPassInput({ interruptResume: [] });
    const report = evaluateAdversarialQa(input);
    expect(report.verdict).toBe("NEEDS-ATTENTION");
    expect(report.gates.find((g) => g.id === "gate-3-interrupt-resume")!.satisfied).toBe(false);
  });

  test("orphan-worktree-detected: cleanup gate fails → NEEDS-ATTENTION", () => {
    const input = cleanPassInput({
      cleanup: {
        orphanedWorktreePaths: [".harness/missions/m1/team/workers/backend-1"],
        leakedArtifacts: [],
        redactionGuardrailIntact: true,
      },
    });
    const report = evaluateAdversarialQa(input);
    expect(report.verdict).toBe("NEEDS-ATTENTION");
    const g4 = report.gates.find((g) => g.id === "gate-4-no-orphan-worktrees")!;
    expect(g4.satisfied).toBe(false);
    expect(g4.detail).toMatch(/1 orphaned worktree/);
    expect(report.markdown).toMatch(/Orphaned worktrees: 1/);
    expect(report.markdown).toMatch(/Why NEEDS-ATTENTION/);
  });

  test("redaction guardrail bypass → gate-5 fails → NEEDS-ATTENTION", () => {
    const input = cleanPassInput({
      cleanup: {
        orphanedWorktreePaths: [],
        leakedArtifacts: ["honcho API key leaked into runtime-final.txt"],
        redactionGuardrailIntact: false,
      },
    });
    const report = evaluateAdversarialQa(input);
    expect(report.verdict).toBe("NEEDS-ATTENTION");
    expect(report.gates.find((g) => g.id === "gate-5-redaction-guardrail")!.satisfied).toBe(false);
  });

  test("fewer than 3 hostile scenarios fails gate-1 even if everything else is clean", () => {
    const input = cleanPassInput({
      hostileScenarios: [
        { id: "s1", name: "scenario 1", outcome: "deflected", reproCommand: "x", isPromptInjection: true },
        { id: "s2", name: "scenario 2", outcome: "surfaced", reproCommand: "x" },
      ],
    });
    const report = evaluateAdversarialQa(input);
    expect(report.verdict).toBe("NEEDS-ATTENTION");
    expect(report.gates.find((g) => g.id === "gate-1-hostile-scenarios")!.satisfied).toBe(false);
  });

  test("markdown includes a repro command per hostile scenario", () => {
    const report = evaluateAdversarialQa(cleanPassInput());
    expect(report.markdown).toMatch(/Repro: `uh validate broken\.yaml`/);
    expect(report.markdown).toMatch(/Repro: `uh mission run injection\.yaml`/);
  });
});

/* -------------------------------------------------------------------------- */
/* writeAdversarialQaReport                                                   */
/* -------------------------------------------------------------------------- */

describe("writeAdversarialQaReport", () => {
  test("writes the report under the mission directory and returns the path", async () => {
    const missionDir = join(ROOT, ".harness", "missions", "m1");
    const { report, path } = await writeAdversarialQaReport(missionDir, cleanPassInput());
    expect(path).toBe(join(missionDir, "adversarial-qa-report.md"));
    expect(report.verdict).toBe("PASS");
    const onDisk = await readFile(path, "utf-8");
    expect(onDisk).toMatch(/# Adversarial QA report: m1/);
    expect(onDisk).toMatch(/Verdict: \*\*PASS\*\*/);
  });

  test("persists a NEEDS-ATTENTION report with the failing-gate explanation block", async () => {
    const missionDir = join(ROOT, ".harness", "missions", "m2");
    const { report } = await writeAdversarialQaReport(missionDir, cleanPassInput({
      missionId: "m2",
      interruptResume: [],
    }));
    expect(report.verdict).toBe("NEEDS-ATTENTION");
    const onDisk = await readFile(join(missionDir, "adversarial-qa-report.md"), "utf-8");
    expect(onDisk).toMatch(/Why NEEDS-ATTENTION/);
    expect(onDisk).toMatch(/gate-3-interrupt-resume/);
  });
});
