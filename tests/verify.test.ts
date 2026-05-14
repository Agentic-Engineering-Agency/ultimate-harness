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

async function readVerification(id: string) {
  const filePath = join(TEST_ROOT, ".harness", "missions", id, "verification.yaml");
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
});
