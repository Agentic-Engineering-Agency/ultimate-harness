import { describe, expect, test } from "vitest";
import { access, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { parse, stringify } from "yaml";
import { initializeHarness } from "../src/harness/init.js";
import { getStatus } from "../src/harness/status.js";
import { validateFile } from "../src/harness/validate.js";
import { verifyMission } from "../src/harness/verify.js";

let TEST_ROOT: string;
const execFileP = promisify(execFile);
const CLI = join(process.cwd(), "node_modules", ".bin", "tsx");

async function runUh(args: string[]) {
  return execFileP(CLI, ["src/cli.ts", ...args], { cwd: process.cwd() });
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

async function writeMission(id: string, requiredChecks: Array<{ name: string; command?: string }>) {
  const missionDir = join(TEST_ROOT, ".harness", "missions", id);
  await mkdir(missionDir, { recursive: true });
  await writeFile(join(missionDir, "mission.yaml"), stringify({
    schema_version: "uh.mission.v0",
    id,
    title: `Mission ${id}`,
    workflow_profile: "research-docs",
    objective: "Verify this mission.",
    verification: {
      required_checks: requiredChecks,
      review_gates: [],
    },
  }), "utf-8");
  return missionDir;
}

async function readVerification(id: string, root?: string) {
  const filePath = join(root ?? TEST_ROOT, ".harness", "missions", id, "verification.yaml");
  const parsed = parse(await readFile(filePath, "utf-8"));
  const validation = await validateFile(filePath);
  expect(validation.valid, validation.errors.join("\n")).toBe(true);
  return parsed;
}

test.beforeEach(async () => {
  TEST_ROOT = await mkdtemp(join(tmpdir(), "uh-test-verify-"));
  await initializeHarness(TEST_ROOT);
});

test.afterEach(async () => {
  if (!TEST_ROOT) return;
  await rm(TEST_ROOT, { recursive: true, force: true });
});

describe("uh verify", () => {
  test("passing command writes passed verification.yaml and exits 0", async () => {
    await writeMission("pass", [{ name: "node ok", command: "node -e \"console.log('ok')\"" }]);

    const { stdout, stderr } = await runUh(["verify", "pass", "--root", TEST_ROOT]);

    expect(stderr).toBe("");
    expect(stdout).toContain("[PASS] pass");
    const verification = await readVerification("pass");
    expect(verification).toMatchObject({
      schema_version: "uh.verification-result.v0",
      mission_id: "pass",
      status: "passed",
      checks: [{ name: "node ok", type: "command", status: "passed" }],
    });
    expect(verification.checks[0].command).toContain("node -e");
    expect(verification.checks[0].notes).toContain("stdout: ok");
    const events = (await readFile(join(TEST_ROOT, ".harness", "missions", "pass", "events.ndjson"), "utf-8")).trim().split("\n").map((line) => JSON.parse(line));
    expect(events.map((e) => e.type)).toEqual(["verification.started", "verification.finished"]);
  });

  test("failing command writes failed verification.yaml and exits nonzero", async () => {
    await writeMission("fail", [{ name: "node fail", command: "node -e \"console.error('bad'); process.exit(7)\"" }]);

    const { stdout, stderr } = await runUhFailure(["verify", "fail", "--root", TEST_ROOT]);

    expect(`${stdout}${stderr}`).toContain("[FAIL] fail");
    const verification = await readVerification("fail");
    expect(verification.status).toBe("failed");
    expect(verification.checks[0]).toMatchObject({ name: "node fail", type: "command", status: "failed" });
    expect(verification.checks[0].notes).toContain("exit_code: 7");
    expect(verification.checks[0].notes).toContain("stderr: bad");
  });

  test("timed out command writes failed verification.yaml and returns promptly", async () => {
    await writeMission("timeout", [{ name: "node hang", command: "node -e \"setTimeout(() => {}, 200)\"" }]);

    const startedAt = Date.now();
    const result = await verifyMission(TEST_ROOT, "timeout", { commandTimeoutMs: 25 });
    const elapsedMs = Date.now() - startedAt;

    expect(elapsedMs).toBeLessThan(175);
    expect(result.status).toBe("failed");
    expect(result.checks_failed).toBe(1);
    const verification = await readVerification("timeout");
    expect(verification.status).toBe("failed");
    expect(verification.checks[0]).toMatchObject({ name: "node hang", type: "command", status: "failed" });
    expect(verification.checks[0].notes).toContain("timed out after 25ms");
    expect(verification.findings).toEqual([{ severity: "error", message: "verification check timed out: node hang after 25ms" }]);
  });

  test("non-cooperative timed out command is hard-killed and returns promptly", async () => {
    await writeMission("timeout-ignore-sigterm", [{
      name: "node ignore sigterm",
      command: "node -e \"process.on('SIGTERM',()=>{}); setInterval(()=>{}, 1000)\"",
    }]);

    const startedAt = Date.now();
    const result = await verifyMission(TEST_ROOT, "timeout-ignore-sigterm", { commandTimeoutMs: 25 });
    const elapsedMs = Date.now() - startedAt;

    expect(elapsedMs).toBeLessThan(500);
    expect(result.status).toBe("failed");
    expect(result.checks_failed).toBe(1);
    const verification = await readVerification("timeout-ignore-sigterm");
    expect(verification.status).toBe("failed");
    expect(verification.checks[0]).toMatchObject({ name: "node ignore sigterm", type: "command", status: "failed" });
    expect(verification.checks[0].notes).toContain("timed out after 25ms");
    expect(verification.findings).toEqual([{ severity: "error", message: "verification check timed out: node ignore sigterm after 25ms" }]);
  }, 1000);

  test("CLI timeout option fails timed out verification promptly", async () => {
    await writeMission("timeout-cli", [{ name: "node hang", command: "node -e \"setTimeout(() => {}, 500)\"" }]);

    const startedAt = Date.now();
    const { stdout, stderr } = await runUhFailure(["verify", "timeout-cli", "--root", TEST_ROOT, "--timeout-ms", "25"]);
    const elapsedMs = Date.now() - startedAt;

    expect(elapsedMs).toBeLessThan(450);
    expect(`${stdout}${stderr}`).toContain("[FAIL] timeout-cli");
    const verification = await readVerification("timeout-cli");
    expect(verification.status).toBe("failed");
    expect(verification.checks[0].notes).toContain("timed out after 25ms");
  });

  test("no checks writes blocked verification.yaml and exits nonzero", async () => {
    await writeMission("none", []);

    const { stdout, stderr } = await runUhFailure(["verify", "none", "--root", TEST_ROOT]);

    expect(`${stdout}${stderr}`).toContain("[BLOCKED] none");
    const verification = await readVerification("none");
    expect(verification.status).toBe("blocked");
    expect(verification.checks).toEqual([]);
    expect(verification.findings).toEqual([{ severity: "error", message: "no verification checks configured" }]);
  });

  test("check without command is blocked", async () => {
    await writeMission("manual", [{ name: "manual review" }]);

    const { stdout, stderr } = await runUhFailure(["verify", "manual", "--root", TEST_ROOT]);

    expect(`${stdout}${stderr}`).toContain("[BLOCKED] manual");
    const verification = await readVerification("manual");
    expect(verification.status).toBe("blocked");
    expect(verification.checks).toEqual([{ name: "manual review", type: "manual", status: "blocked", notes: "no command configured" }]);
  });

  test("invalid mission id rejects path traversal", async () => {
    await expect(runUhFailure(["verify", "../evil", "--root", TEST_ROOT])).resolves.toBeTruthy();
    await expect(access(join(TEST_ROOT, ".harness", "evil", "verification.yaml"))).rejects.toThrow();
  });

  test("symlinked verification.yaml is refused and does not overwrite outside target", async () => {
    const missionDir = await writeMission("linked-verification", [{ name: "ok", command: "node -e \"process.exit(0)\"" }]);
    const outsideRoot = await mkdtemp(join(tmpdir(), "uh-test-verify-outside-"));
    try {
      const outsideTarget = join(outsideRoot, "outside-verification.yaml");
      const outsideOriginal = "outside target must remain unchanged\n";
      await writeFile(outsideTarget, outsideOriginal, "utf-8");
      try {
        await symlink(outsideTarget, join(missionDir, "verification.yaml"));
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === "EPERM" || (err as NodeJS.ErrnoException).code === "EACCES") {
          return;
        }
        throw err;
      }

      const { stdout, stderr } = await runUhFailure(["verify", "linked-verification", "--root", TEST_ROOT]);
      expect(`${stdout}${stderr}`).toMatch(/symlink|verification\.yaml/i);
      await expect(readFile(outsideTarget, "utf-8")).resolves.toBe(outsideOriginal);
    } finally {
      await rm(outsideRoot, { recursive: true, force: true });
    }
  });

  test("status counts passed verification after verify", async () => {
    await writeMission("status-pass", [{ name: "ok", command: "node -e \"process.exit(0)\"" }]);

    await runUh(["verify", "status-pass", "--root", TEST_ROOT]);

    const status = await getStatus(TEST_ROOT);
    expect(status.verified_missions_count).toBe(1);
  });

  test("auto-routes into bound sandbox worktree", async () => {
    await writeMission("sandboxed", [{ name: "cat marker", command: "cat marker.txt" }]);

    // Create a fake sandbox worktree and register it
    const sandboxPath = join(TEST_ROOT, ".harness", "sandboxes", "sb-1", "worktree");
    await mkdir(sandboxPath, { recursive: true });
    await mkdir(join(sandboxPath, ".harness"), { recursive: true });
    await writeFile(join(sandboxPath, ".harness", "project.yaml"), await readFile(join(TEST_ROOT, ".harness", "project.yaml"), "utf-8"), "utf-8");
    await mkdir(join(sandboxPath, ".harness", "missions", "sandboxed"), { recursive: true });
    await writeFile(join(sandboxPath, ".harness", "missions", "sandboxed", "mission.yaml"), await readFile(join(TEST_ROOT, ".harness", "missions", "sandboxed", "mission.yaml"), "utf-8"), "utf-8");
    await writeFile(join(sandboxPath, "marker.txt"), "found-in-sandbox", "utf-8");

    const indexPath = join(TEST_ROOT, ".harness", "sandboxes", "index.yaml");
    await writeFile(indexPath, stringify({
      schema_version: "uh.sandboxes-index.v0",
      sandboxes: [{
        id: "sb-1",
        mission_id: "sandboxed",
        backend: "git-worktree",
        status: "created",
        path: ".harness/sandboxes/sb-1/worktree",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }],
    }), "utf-8");

    const result = await verifyMission(TEST_ROOT, "sandboxed");
    expect(result.status).toBe("passed");
    expect(result.sandbox).toMatchObject({ id: "sb-1" });
    const verification = await readVerification("sandboxed", sandboxPath);
    expect(verification.checks[0].notes).toContain("found-in-sandbox");
  });
  test("useSandbox: false forces parent-root execution", async () => {
    await writeMission("no-sandbox", [{ name: "cat marker", command: "cat marker.txt" }]);

    const sandboxPath = join(TEST_ROOT, ".harness", "sandboxes", "sb-2", "worktree");
    await mkdir(sandboxPath, { recursive: true });
    await mkdir(join(sandboxPath, ".harness"), { recursive: true });
    await writeFile(join(sandboxPath, ".harness", "project.yaml"), await readFile(join(TEST_ROOT, ".harness", "project.yaml"), "utf-8"), "utf-8");
    await mkdir(join(sandboxPath, ".harness", "missions", "no-sandbox"), { recursive: true });
    await writeFile(join(sandboxPath, ".harness", "missions", "no-sandbox", "mission.yaml"), await readFile(join(TEST_ROOT, ".harness", "missions", "no-sandbox", "mission.yaml"), "utf-8"), "utf-8");
    await writeFile(join(sandboxPath, "marker.txt"), "found-in-sandbox", "utf-8");

    const indexPath = join(TEST_ROOT, ".harness", "sandboxes", "index.yaml");
    await writeFile(indexPath, stringify({
      schema_version: "uh.sandboxes-index.v0",
      sandboxes: [{
        id: "sb-2",
        mission_id: "no-sandbox",
        backend: "git-worktree",
        status: "created",
        path: ".harness/sandboxes/sb-2/worktree",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }],
    }), "utf-8");

    const result = await verifyMission(TEST_ROOT, "no-sandbox", { useSandbox: false });
    expect(result.status).toBe("failed");
    expect(result.sandbox).toBeUndefined();
  });
});

describe("acceptance criteria (UH-54)", () => {
  async function writeMissionWithAcs(id: string, opts: {
    requiredChecks?: Array<{ name: string; command?: string }>;
    acceptanceCriteria?: Array<{ id: string; description: string; check_command?: string; severity?: "block" | "warn" }>;
    completionCriteria?: string[];
  } = {}) {
    const missionDir = join(TEST_ROOT, ".harness", "missions", id);
    await mkdir(missionDir, { recursive: true });
    await writeFile(join(missionDir, "mission.yaml"), stringify({
      schema_version: "uh.mission.v0",
      id,
      title: `Mission ${id}`,
      workflow_profile: "research-docs",
      objective: "AC verify test.",
      completion_criteria: opts.completionCriteria ?? [],
      acceptance_criteria: opts.acceptanceCriteria ?? [],
      verification: {
        required_checks: opts.requiredChecks ?? [{ name: "noop", command: "true" }],
        review_gates: [],
      },
    }), "utf-8");
    return missionDir;
  }

  test("schema rejects duplicate AC ids", async () => {
    const id = "ac-dup";
    await writeMissionWithAcs(id, {
      acceptanceCriteria: [
        { id: "ac-1", description: "first" },
        { id: "ac-1", description: "duplicate" },
      ],
    });
    await expect(verifyMission(TEST_ROOT, id)).rejects.toThrow(/duplicate.*ac-1/i);
  });

  test("runs each AC's check_command and writes per-AC results", async () => {
    const id = "ac-multi";
    await writeMissionWithAcs(id, {
      acceptanceCriteria: [
        { id: "ac-1", description: "exits 0", check_command: "true", severity: "block" },
        { id: "ac-2", description: "exits 1", check_command: "false", severity: "warn" },
      ],
    });
    const result = await verifyMission(TEST_ROOT, id);
    expect(result.acceptance_total).toBe(2);
    expect(result.acceptance_passed).toBe(1);
    expect(result.acceptance_warn_failed).toBe(1);
    expect(result.acceptance_failed_block).toBe(0);
    expect(result.status).toBe("passed");
    const artifact = await readVerification(id);
    expect(artifact.acceptance_criteria).toHaveLength(2);
    expect(artifact.acceptance_criteria[0]).toMatchObject({ id: "ac-1", status: "passed", severity: "block", exit_code: 0 });
    expect(artifact.acceptance_criteria[1]).toMatchObject({ id: "ac-2", status: "failed", severity: "warn", exit_code: 1 });
  });

  test("block-severity AC failure forces overall status to failed", async () => {
    const id = "ac-block-fail";
    await writeMissionWithAcs(id, {
      acceptanceCriteria: [
        { id: "ac-1", description: "must pass", check_command: "false", severity: "block" },
      ],
    });
    const result = await verifyMission(TEST_ROOT, id);
    expect(result.status).toBe("failed");
    expect(result.acceptance_failed_block).toBe(1);
  });

  test("ACs without check_command land as blocked informational entries", async () => {
    const id = "ac-no-cmd";
    await writeMissionWithAcs(id, {
      acceptanceCriteria: [
        { id: "ac-1", description: "manual verify", severity: "warn" },
      ],
    });
    const result = await verifyMission(TEST_ROOT, id);
    expect(result.acceptance_blocked).toBe(1);
    expect(result.status).toBe("passed"); // required_checks pass; AC is warn-blocked
  });

  test("block-severity AC without check_command downgrades overall status to blocked", async () => {
    const id = "ac-block-no-cmd";
    await writeMissionWithAcs(id, {
      acceptanceCriteria: [
        { id: "ac-1", description: "must be verified", severity: "block" },
      ],
    });
    const result = await verifyMission(TEST_ROOT, id);
    expect(result.status).toBe("blocked");
    expect(result.acceptance_blocked).toBe(1);
    const artifact = await readVerification(id);
    expect(artifact.findings.map((f: { severity: string }) => f.severity)).toContain("error");
    expect(artifact.findings.some((f: { message: string }) => /ac-1.*severity=block but has no check_command/.test(f.message))).toBe(true);
  });

  test("warn-severity AC failure emits a warning-level finding without blocking", async () => {
    const id = "ac-warn-finding";
    await writeMissionWithAcs(id, {
      acceptanceCriteria: [
        { id: "ac-1", description: "warn check", check_command: "false", severity: "warn" },
      ],
    });
    const result = await verifyMission(TEST_ROOT, id);
    expect(result.status).toBe("passed");
    const artifact = await readVerification(id);
    expect(artifact.findings).toBeDefined();
    expect(artifact.findings.some((f: { severity: string; message: string }) => f.severity === "warning" && /ac-1/.test(f.message))).toBe(true);
  });

  test("completion_criteria auto-promotes to warn ACs when acceptance_criteria is empty", async () => {
    const id = "ac-legacy";
    await writeMissionWithAcs(id, {
      completionCriteria: ["legacy criterion A", "legacy criterion B"],
    });
    const result = await verifyMission(TEST_ROOT, id);
    expect(result.acceptance_total).toBe(2);
    expect(result.acceptance_blocked).toBe(2);
    const artifact = await readVerification(id);
    expect(artifact.acceptance_criteria.map((ac: { id: string; severity: string }) => ({ id: ac.id, severity: ac.severity }))).toEqual([
      { id: "ac-1", severity: "warn" },
      { id: "ac-2", severity: "warn" },
    ]);
  });

  test("emits acceptance.checked events to the mission ndjson", async () => {
    const id = "ac-events";
    await writeMissionWithAcs(id, {
      acceptanceCriteria: [
        { id: "ac-1", description: "passes", check_command: "true" },
      ],
    });
    await verifyMission(TEST_ROOT, id);
    const events = await readFile(join(TEST_ROOT, ".harness", "missions", id, "events.ndjson"), "utf-8");
    const lines = events.split("\n").filter(Boolean).map((line) => JSON.parse(line));
    const acEvent = lines.find((event: { type?: string }) => event.type === "acceptance.checked");
    expect(acEvent).toMatchObject({ ac_id: "ac-1", status: "passed", severity: "block", exit_code: 0 });
  });
});


describe("tdd test-first gate (UH-55)", () => {
  async function writeTddMission(id: string, opts: {
    enforce?: boolean;
    test_paths?: string[];
    source_paths?: string[];
    diff?: string | null;
  } = {}) {
    const missionDir = join(TEST_ROOT, ".harness", "missions", id);
    await mkdir(missionDir, { recursive: true });
    const tddBlock = opts.enforce === false
      ? undefined
      : {
          enforce_tests_first: opts.enforce ?? true,
          ...(opts.test_paths ? { test_paths: opts.test_paths } : {}),
          ...(opts.source_paths ? { source_paths: opts.source_paths } : {}),
        };
    await writeFile(join(missionDir, "mission.yaml"), stringify({
      schema_version: "uh.mission.v0",
      id,
      title: `Mission ${id}`,
      workflow_profile: "tdd-bugfix",
      objective: "tdd gate test",
      ...(tddBlock ? { tdd: tddBlock } : {}),
      verification: {
        required_checks: [{ name: "noop", command: "true" }],
        review_gates: [],
      },
    }), "utf-8");
    if (opts.diff !== null) {
      await writeFile(join(missionDir, "diff.patch"), opts.diff ?? "", "utf-8");
    }
    return missionDir;
  }

  const TESTS_ONLY_DIFF = [
    "diff --git a/tests/foo.test.ts b/tests/foo.test.ts",
    "--- a/tests/foo.test.ts",
    "+++ b/tests/foo.test.ts",
    "",
  ].join("\n");
  const SOURCE_ONLY_DIFF = [
    "diff --git a/src/feature.ts b/src/feature.ts",
    "--- a/src/feature.ts",
    "+++ b/src/feature.ts",
    "diff --git a/src/helper.ts b/src/helper.ts",
    "--- a/src/helper.ts",
    "+++ b/src/helper.ts",
    "",
  ].join("\n");
  const MIXED_DIFF = [
    "diff --git a/src/feature.ts b/src/feature.ts",
    "--- a/src/feature.ts",
    "+++ b/src/feature.ts",
    "diff --git a/tests/feature.test.ts b/tests/feature.test.ts",
    "--- a/tests/feature.test.ts",
    "+++ b/tests/feature.test.ts",
    "",
  ].join("\n");
  const CUSTOM_DIFF = [
    "diff --git a/lib/foo.ts b/lib/foo.ts",
    "--- a/lib/foo.ts",
    "+++ b/lib/foo.ts",
    "diff --git a/spec/foo.spec.ts b/spec/foo.spec.ts",
    "--- a/spec/foo.spec.ts",
    "+++ b/spec/foo.spec.ts",
    "",
  ].join("\n");

  test("tests-only diff passes the tdd gate", async () => {
    const id = "tdd-tests-only";
    await writeTddMission(id, { diff: TESTS_ONLY_DIFF });
    const result = await verifyMission(TEST_ROOT, id);
    expect(result.status).toBe("passed");
    const artifact = await readVerification(id);
    const tddAc = artifact.acceptance_criteria.find((ac: { id: string }) => ac.id === "ac-tdd-tests-precede-code");
    expect(tddAc).toMatchObject({ status: "passed", severity: "block" });
  });

  test("source-only diff fails the tdd gate and escalates overall status", async () => {
    const id = "tdd-source-only";
    await writeTddMission(id, { diff: SOURCE_ONLY_DIFF });
    const result = await verifyMission(TEST_ROOT, id);
    expect(result.status).toBe("failed");
    expect(result.acceptance_failed_block).toBeGreaterThanOrEqual(1);
    const artifact = await readVerification(id);
    const tddAc = artifact.acceptance_criteria.find((ac: { id: string }) => ac.id === "ac-tdd-tests-precede-code");
    expect(tddAc).toMatchObject({ status: "failed", severity: "block" });
    expect(tddAc.stderr_snippet).toMatch(/src\/feature\.ts/);
    expect(tddAc.stderr_snippet).toMatch(/src\/helper\.ts/);
  });

  test("mixed source + tests diff passes the tdd gate", async () => {
    const id = "tdd-mixed";
    await writeTddMission(id, { diff: MIXED_DIFF });
    const result = await verifyMission(TEST_ROOT, id);
    expect(result.status).toBe("passed");
  });

  test("missing diff.patch blocks the run and emits a finding", async () => {
    const id = "tdd-no-diff";
    await writeTddMission(id, { diff: null });
    const result = await verifyMission(TEST_ROOT, id);
    expect(result.status).toBe("blocked");
    const artifact = await readVerification(id);
    expect(artifact.findings.some((f: { message: string }) => /no diff\.patch/.test(f.message))).toBe(true);
  });

  test("mission without tdd block behaves like UH-54 alone (no synthetic AC)", async () => {
    const id = "tdd-disabled";
    await writeTddMission(id, { enforce: false });
    const result = await verifyMission(TEST_ROOT, id);
    expect(result.status).toBe("passed");
    const artifact = await readVerification(id);
    const tddAc = (artifact.acceptance_criteria ?? []).find((ac: { id: string }) => ac.id === "ac-tdd-tests-precede-code");
    expect(tddAc).toBeUndefined();
  });

  test("custom test_paths override defaults", async () => {
    const id = "tdd-custom-paths";
    await writeTddMission(id, {
      test_paths: ["spec/**"],
      source_paths: ["lib/**"],
      diff: CUSTOM_DIFF,
    });
    const result = await verifyMission(TEST_ROOT, id);
    expect(result.status).toBe("passed");
  });

  test("emits a synthetic acceptance.checked event", async () => {
    const id = "tdd-event";
    await writeTddMission(id, { diff: TESTS_ONLY_DIFF });
    await verifyMission(TEST_ROOT, id);
    const eventsText = await readFile(join(TEST_ROOT, ".harness", "missions", id, "events.ndjson"), "utf-8");
    const events = eventsText.split("\n").filter(Boolean).map((line) => JSON.parse(line));
    const tddEvent = events.find((e: { ac_id?: string }) => e.ac_id === "ac-tdd-tests-precede-code");
    expect(tddEvent).toMatchObject({ type: "acceptance.checked", status: "passed", severity: "block", synthetic: true });
  });
});

